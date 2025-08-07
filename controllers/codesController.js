import { pool } from "../config/dbConfig.js";
import { Parser } from "json2csv";
import xlsx from "xlsx";
import { parse } from "csv-parse/sync";
import stringSimilarity from "string-similarity";

// Utilidad para limpiar strings (mayúsculas, sin acentos, sin tabs/espacios excesivos)
function cleanString(str) {
  return String(str)
    .toUpperCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // quita acentos
    .replace(/[\s\t\r\n]+/g, " ") // reemplaza tabs/saltos por espacio
    .trim();
}

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

// Import Excel or CSV and insert/update into admin.code (fuzzy alias match, upsert, cleaning inputs, disables missing codes)
export const importCodes = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded." });

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

    // Preload all aliases from qq.locations, limpiar para matching
    const allAliasesRes = await pool.query(
      "SELECT alias FROM qq.locations WHERE alias IS NOT NULL"
    );
    const allAliases = allAliasesRes.rows.map(r => r.alias);
    const allAliasesCleaned = allAliases.map(cleanString);

    function getBestAlias(input) {
      if (!input) return null;
      const agencyClean = cleanString(input);
      const threshold = 0.35; // umbral bajo
      const { bestMatch } = stringSimilarity.findBestMatch(agencyClean, allAliasesCleaned);
      if (bestMatch.rating >= threshold) {
        const idx = allAliasesCleaned.indexOf(bestMatch.target);
        return allAliases[idx];
      }
      return null;
    }

    let inserted = 0, updated = 0, skipped = 0;
    let insertedRows = [], updatedRows = [], skippedRows = [];
    // Guarda las combinaciones únicas importadas para el enabled=false
    const importedKeys = new Set();

    for (const row of data) {
      const agencyRaw = row["Group Name"] ||
        row["Agency Description"] ||
        row["AGENCY DESCRIPTION"] ||
        row["Group"] ||
        row["AGENCY"] ||
        row["agency"] ||
        row["Agencia"] ||
        row["AGENCIA"] ||
        "";
      const agency = getBestAlias(agencyRaw);

      if (!agency) {
        skipped++;
        skippedRows.push({
          agency: agencyRaw,
          company: row["Service Provider"] || row["COMPANY"] || "",
          code: row["Agency Code"] || row["CODE"] || "",
          login: row["User Name"] || row["LOGIN"] || "",
          password: row["Password"] || row["PASSWORD"] || "",
          reason: "Agency fuzzy match not found"
        });
        continue;
      }

      const company = cleanString(row["Service Provider"] || row["COMPANY"] || row["company"] || "");
      const code = cleanString(row["Agency Code"] || row["CODE"] || row["code"] || "");
      const login = cleanString(row["User Name"] || row["LOGIN"] || row["login"] || "");
      const password = cleanString(row["Password"] || row["PASSWORD"] || row["password"] || "");

      if (![agency, company, code, login, password].every(Boolean)) {
        skipped++;
        skippedRows.push({ agency, company, code, login, password, reason: "Missing field" });
        continue;
      }

      // Guarda la key para enabled=false posterior
      importedKeys.add(`${agency}|||${company}|||${code}`);

      // UPSERT: insert or update if PK exists, y siempre enabled=true
      const result = await pool.query(
        `INSERT INTO admin.code (agency, company, code, login, password, enabled)
         VALUES ($1, $2, $3, $4, $5, true)
         ON CONFLICT (agency, company, code)
         DO UPDATE SET login = EXCLUDED.login, password = EXCLUDED.password, enabled = true
         RETURNING xmax = 0 AS inserted`,
        [agency, company, code, login, password]
      );
      if (result.rows[0].inserted) {
        inserted++;
        insertedRows.push({ agency, company, code, login, password });
      } else {
        updated++;
        updatedRows.push({ agency, company, code, login, password });
      }
    }

    // Desactiva todos los códigos que NO estén en el archivo importado (enabled=false)
    const existing = await pool.query("SELECT agency, company, code FROM admin.code WHERE enabled = true");
    for (const row of existing.rows) {
      const key = `${row.agency}|||${row.company}|||${row.code}`;
      if (!importedKeys.has(key)) {
        await pool.query(
          `UPDATE admin.code SET enabled = false WHERE agency = $1 AND company = $2 AND code = $3`,
          [row.agency, row.company, row.code]
        );
      }
    }

    // Diagnóstico
    console.log("Insertados:", inserted);
    console.log("Actualizados:", updated);
    console.log("Saltados:", skipped);
    if (skipped > 0) {
      console.log("Primeros 5 saltados:", skippedRows.slice(0, 5));
    }

    res.json({
      success: true,
      inserted,
      updated,
      skipped,
      insertedRows,
      updatedRows,
      skippedRows,
      message: "Import completed with fuzzy agency matching and upsert. Old codes not in the file were disabled.",
    });
  } catch (err) {
    console.error("IMPORT ERROR:", err);
    res.status(500).json({ error: err.message || "Unexpected error during import." });
  }
};