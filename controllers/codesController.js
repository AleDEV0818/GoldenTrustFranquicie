import { pool } from "../config/dbConfig.js";
import { Parser } from "json2csv";
import xlsx from "xlsx";
import { parse } from "csv-parse/sync";
import stringSimilarity from "string-similarity";

// Render main Access Codes page (for /users/codes)
export const renderCodesPage = async (req, res) => {
  try {
    let agenciesResult;
    if (req.user && req.user.location_type === 1) {
      agenciesResult = await pool.query(
        "SELECT alias, location_id, location_type FROM qq.locations WHERE alias IS NOT NULL AND location_type = 1"
      );
    } else {
      agenciesResult = await pool.query(
        "SELECT alias, location_id, location_type FROM qq.locations WHERE alias IS NOT NULL AND location_id = $1",
        [req.user.location_id]
      );
    }
    const agenciesMap = {};
    for (const row of agenciesResult.rows) {
      agenciesMap[row.alias] = {
        location_id: String(row.location_id),
        location_type: Number(row.location_type),
      };
    }

    let agency_alias = "";
    if (req.user && req.user.location_id) {
      const aliasResult = await pool.query(
        "SELECT alias FROM qq.locations WHERE location_id = $1 LIMIT 1",
        [req.user.location_id]
      );
      if (aliasResult.rows.length > 0 && aliasResult.rows[0].alias) {
        agency_alias = aliasResult.rows[0].alias;
      }
    }

    res.render("codes", {
      user: {
        ...req.user,
        agency_alias,
      },
      agenciesMapJson: JSON.stringify(agenciesMap),
    });
  } catch (err) {
    res.status(500).send("Error loading codes page: " + err.message);
  }
};

// List codes filtered by location (uses the DB function)
export const listCodes = async (req, res) => {
  try {
    const location_id =
      req.user?.location_id || req.query.location_id || req.body.location_id;
    if (!location_id)
      return res.status(400).json({ error: "Missing location_id" });

    const result = await pool.query(
      `SELECT * FROM intranet.get_codes_by_location($1)`,
      [location_id]
    );
    res.json(Array.isArray(result.rows) ? result.rows : []);
  } catch (err) {
    res.status(500).json({ error: err.message || "Unexpected error" });
  }
};

// List agencies for filters (returns {alias, location_id, location_name})
export const listAgencies = async (req, res) => {
  try {
    const agencies = await pool.query(
      `SELECT location_id, alias, location_name FROM qq.locations WHERE location_type = 1 AND alias IS NOT NULL ORDER BY location_name`
    );
    res.json(agencies.rows);
  } catch (err) {
    res.status(500).json({ error: err.message || "Unexpected error" });
  }
};

// List all agencies with mapping for frontend logic (for AJAX if needed)
export const listAgenciesMap = async (req, res) => {
  try {
    const agencies = await pool.query(
      `SELECT location_id, alias, location_type FROM qq.locations WHERE alias IS NOT NULL AND location_type = 1`
    );
    const map = {};
    for (const row of agencies.rows) {
      if (row.alias) {
        map[row.alias] = {
          location_id: String(row.location_id),
          location_type: Number(row.location_type),
        };
      }
    }
    res.json(map);
  } catch (err) {
    res.status(500).json({ error: err.message || "Unexpected error" });
  }
};

// Export codes to CSV (filtered by location)
export const exportCsv = async (req, res) => {
  try {
    const location_id =
      req.user?.location_id || req.query.location_id || req.body.location_id;
    if (!location_id)
      return res.status(400).json({ error: "Missing location_id" });

    const result = await pool.query(
      `SELECT * FROM intranet.get_codes_by_location($1)`,
      [location_id]
    );
    const data = result.rows.map((row) => ({
      AGENCY: row.agency,
      COMPANY: row.company,
      CODE: row.code,
      LOGIN: row.login,
      PASSWORD: row.password,
    }));
    const fields = Object.keys(
      data[0] || {
        AGENCY: "",
        COMPANY: "",
        CODE: "",
        LOGIN: "",
        PASSWORD: "",
      }
    );
    const json2csv = new Parser({ fields });
    const csv = json2csv.parse(data);

    res.header("Content-Type", "text/csv");
    res.attachment("codes.csv");
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: err.message || "Unexpected error" });
  }
};

// Import Excel or CSV and upsert into admin.code (fuzzy alias match with qq.locations)
export const importCodes = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded." });
    const user = req.user;

    let data = [];
    const isCsv =
      req.file.originalname.toLowerCase().endsWith(".csv") ||
      req.file.mimetype === "text/csv";
    if (isCsv) {
      const csvString = req.file.buffer.toString("utf8");
      data = parse(csvString, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });
    } else {
      const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      data = xlsx.utils.sheet_to_json(sheet);
    }

    // --- PRELOAD ALIASES ---
    let allAliases = [];
    let allowedAlias = "";

    if (user.location_type === 1) {
      // Corporativo: puede importar para cualquier alias corporativo
      const allAliasesRes = await pool.query(
        "SELECT alias FROM qq.locations WHERE alias IS NOT NULL AND location_type = 1"
      );
      allAliases = allAliasesRes.rows.map(r => r.alias);
    } else if (user.location_type === 2 || user.location_type === 4) {
      // Franquicia: solo su propio alias (pero fuzzy matching igual)
      const aliasRes = await pool.query(
        "SELECT alias FROM qq.locations WHERE alias IS NOT NULL AND location_id = $1",
        [user.location_id]
      );
      if (!aliasRes.rows.length) {
        return res.status(400).json({ error: "Your agency alias was not found in the database." });
      }
      allowedAlias = aliasRes.rows[0].alias;
      allAliases = [allowedAlias];
    } else {
      return res.status(400).json({ error: "Invalid user type for importing codes." });
    }

    function getBestAlias(input) {
      if (!input) return null;
      // Bajar el umbral para aceptar errores graves de tipeo
      const threshold = 0.5; // antes 0.7, ahora más flexible
      const { bestMatch } = stringSimilarity.findBestMatch(input, allAliases);
      if (bestMatch.rating >= threshold) return bestMatch.target;
      return null;
    }

    let inserted = 0, updated = 0, skipped = 0;
    let insertedRows = [], updatedRows = [], skippedRows = [];

    for (const row of data) {
      // -- Soportar encabezados flexibles --
      const agencyRaw = String(
        row["Group Name"] ||
        row["Agency Description"] ||
        row["AGENCY DESCRIPTION"] ||
        row["Group"] ||
        row["AGENCY"] ||
        row["agency"] ||
        ""
      ).trim();

      let agency = getBestAlias(agencyRaw);

      // Si es franquicia, SIEMPRE fuerza a usar el alias correcto (el de la DB, no el del CSV)
      if ((user.location_type === 2 || user.location_type === 4)) {
        agency = allowedAlias;
      }

      if (!agency) {
        skipped++;
        skippedRows.push({
          agency: agencyRaw,
          company: row["Service Provider"] || row["COMPANY"] || "",
          code: row["Agency Code"] || row["CODE"] || "",
          login: row["User Name"] || row["LOGIN"] || "",
          password: row["Password"] || row["PASSWORD"] || "",
          reason: "Agency alias not found or not similar enough"
        });
        continue;
      }

      const company = String(row["Service Provider"] || row["COMPANY"] || row["company"] || "").trim();
      const code = String(row["Agency Code"] || row["CODE"] || row["code"] || "").trim();
      const login = String(row["User Name"] || row["LOGIN"] || row["login"] || "").trim();
      const password = String(row["Password"] || row["PASSWORD"] || row["password"] || "").trim();

      if (![agency, company, code, login, password].every(Boolean)) {
        skipped++;
        skippedRows.push({ agency, company, code, login, password, reason: "Missing field" });
        continue;
      }

      // Check if record exists
      const prevQuery = await pool.query(
        `SELECT login, password FROM admin.code WHERE agency = $1 AND company = $2 AND code = $3`,
        [agency, company, code]
      );
      const prev = prevQuery.rows[0];

      if (prev) {
        if (prev.login === login && prev.password === password) {
          skipped++;
          skippedRows.push({ agency, company, code, login, password, reason: "No changes" });
          continue;
        }
        await pool.query(
          `UPDATE admin.code SET login = $4, password = $5 WHERE agency = $1 AND company = $2 AND code = $3`,
          [agency, company, code, login, password]
        );
        updated++;
        updatedRows.push({ agency, company, code, login, password });
      } else {
        await pool.query(
          `INSERT INTO admin.code (agency, company, code, login, password)
           VALUES ($1, $2, $3, $4, $5)`,
          [agency, company, code, login, password]
        );
        inserted++;
        insertedRows.push({ agency, company, code, login, password });
      }
    }

    res.json({
      success: true,
      inserted,
      updated,
      skipped,
      insertedRows,
      updatedRows,
      skippedRows,
      message: "Import completed.",
    });
  } catch (err) {
    console.error("IMPORT ERROR:", err);
    res.status(500).json({ error: err.message || "Unexpected error during import." });
  }
};