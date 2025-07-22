import { pool } from "../config/dbConfig.js";
import { getLocationsForUser } from "./statisticsPoliciesController.js";

// Utilidad robusta para formatear premium como $1,356,957 (sin decimales, miles separados por coma)
function formatPremium(value) {
  let num = 0;
  if (typeof value === "number") {
    num = value;
  } else if (typeof value === "string") {
    // Quita todo menos números y punto decimal, pero solo parte entera
    const clean = value.replace(/[^0-9.]/g, '');
    num = parseInt(clean, 10);
    if (isNaN(num)) num = 0;
  }
  if (!num || isNaN(num)) num = 0;
  return `$${num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

// Renderiza la vista principal del ranking CSR
export const renderStatisticsCsr = async (req, res) => {
  try {
    const locations = await getLocationsForUser(req.user);
    res.render("statistics-csr", {
      user: req.user,
      locations,
    });
  } catch (err) {
    res.status(500).send("Error en el servidor");
  }
};

// Endpoint AJAX para cargar los filtros posibles
export const fetchCsrFilters = async (req, res) => {
  try {
    const { rows: btRows } = await pool.query(
      "SELECT DISTINCT business_type FROM qq.policies ORDER BY business_type"
    );
    const { rows: psRows } = await pool.query(
      "SELECT DISTINCT policy_status FROM qq.policies ORDER BY policy_status"
    );
    const { rows: lineRows } = await pool.query(
      `SELECT DISTINCT lob.line 
         FROM qq.policies p 
         JOIN admin.lob lob ON p.lob_id = lob.lob_id 
        WHERE p.lob_id NOT IN (34,40) AND lob.line <> 'Other Lines'
        ORDER BY lob.line`
    );
    res.json({
      success: true,
      business_types: btRows.map(r => r.business_type),
      policy_status: psRows.map(r => r.policy_status),
      lines: lineRows.map(r => r.line),
    });
  } catch (err) {
    res.json({ success: false, error: "Error loading filter data" });
  }
};

// Ranking principal CSR/Producer/Agent (ahora incluye location_alias)
export const fetchCsrStatistics = async (req, res) => {
  try {
    let {
      locations = [],
      business_types = [],
      criteria = "binder_date",
      date_range = [],
      policy_status = [],
      lines = [],
      group_by = ["csr"]
    } = req.body;

    // Normaliza arrays
    locations = Array.isArray(locations) ? locations : locations ? [locations] : [];
    business_types = Array.isArray(business_types) ? business_types : business_types ? [business_types] : [];
    date_range = Array.isArray(date_range) ? date_range : date_range ? [date_range] : [];
    policy_status = Array.isArray(policy_status) ? policy_status : policy_status ? [policy_status] : [];
    lines = Array.isArray(lines) ? lines : lines ? [lines] : [];
    group_by = Array.isArray(group_by) ? group_by : group_by ? [group_by] : ["csr"];

    // Fechas
    const dateStart = date_range[0] || null;
    const dateEnd = date_range[1] || null;
    if (!dateStart || !dateEnd) {
      return res.json({ success: false, data: [], message: "Select a date range." });
    }

    // Locations según el usuario
    if (
      req.user.id_location_type == 1 &&
      (locations.length === 0 || locations.includes("0") || locations.includes(0))
    ) {
      const allLocs = await pool.query("SELECT location_id FROM qq.locations");
      locations = allLocs.rows.map(r => r.location_id);
    }
    if ([2, 4].includes(req.user.id_location_type)) {
      locations = [req.user.location_id];
    }

    // Defaults si no selecciona filtros
    if (business_types.length === 0) {
      const { rows } = await pool.query("SELECT DISTINCT business_type FROM qq.policies");
      business_types = rows.map(r => r.business_type);
    }
    if (policy_status.length === 0) {
      const { rows } = await pool.query("SELECT DISTINCT policy_status FROM qq.policies");
      policy_status = rows.map(r => r.policy_status);
    }
    if (lines.length === 0) {
      const { rows } = await pool.query(
        `SELECT DISTINCT lob.line 
           FROM qq.policies p 
           JOIN admin.lob lob ON p.lob_id = lob.lob_id 
          WHERE p.lob_id NOT IN (34,40) AND lob.line <> 'Other Lines'`
      );
      lines = rows.map(r => r.line);
    } else {
      lines = lines.filter(line => line !== "Other Lines");
    }
    if (group_by.length === 0) group_by = ["csr"];

    // La función ahora devuelve location_alias
    const { rows } = await pool.query(
      `SELECT * FROM intranet.stats_csr_ranking(
        $1::int[], 
        $2::varchar[], 
        $3::text, 
        $4::date, 
        $5::date, 
        $6::varchar[], 
        $7::varchar[], 
        $8::varchar[]
      )`,
      [
        locations.map(Number),
        business_types,
        criteria,
        dateStart,
        dateEnd,
        policy_status,
        group_by,
        lines,
      ]
    );

    // premium como natural, miles separados por coma, sin decimales
    const formattedRows = rows.map(row => ({
      ...row,
      premium: formatPremium(row.premium)
    }));

    res.json({ success: true, data: formattedRows });
  } catch (err) {
    res.status(500).json({ success: false, error: "Error en el servidor" });
  }
};

// Detalle de policies por CSR/Agent/Producer
export const fetchCsrPoliciesDetail = async (req, res) => {
  try {
    let {
      locations = [],
      business_types = [],
      criteria = "binder_date",
      date_range = [],
      policy_status = [],
      lines = [],
      group_by_type = 'csr',
      group_id // <-- Ahora debe ser el ID único, NO el alias
    } = req.body;

    // Normaliza arrays
    locations = Array.isArray(locations) ? locations : locations ? [locations] : [];
    business_types = Array.isArray(business_types) ? business_types : business_types ? [business_types] : [];
    date_range = Array.isArray(date_range) ? date_range : date_range ? [date_range] : [];
    policy_status = Array.isArray(policy_status) ? policy_status : policy_status ? [policy_status] : [];
    lines = Array.isArray(lines) ? lines : lines ? [lines] : [];

    // Fechas
    const dateStart = date_range[0] || null;
    const dateEnd = date_range[1] || null;
    if (!dateStart || !dateEnd) {
      return res.json({ success: false, data: [], message: "Select a date range." });
    }

    // Locations según el usuario
    if (
      req.user.id_location_type == 1 &&
      (locations.length === 0 || locations.includes("0") || locations.includes(0))
    ) {
      const allLocs = await pool.query("SELECT location_id FROM qq.locations");
      locations = allLocs.rows.map(r => r.location_id);
    }
    if ([2, 4].includes(req.user.id_location_type)) {
      locations = [req.user.location_id];
    }

    // Defaults si no selecciona filtros
    if (business_types.length === 0) {
      const { rows } = await pool.query("SELECT DISTINCT business_type FROM qq.policies");
      business_types = rows.map(r => r.business_type);
    }
    if (policy_status.length === 0) {
      const { rows } = await pool.query("SELECT DISTINCT policy_status FROM qq.policies");
      policy_status = rows.map(r => r.policy_status);
    }
    if (lines.length === 0) {
      const { rows } = await pool.query(
        `SELECT DISTINCT lob.line 
           FROM qq.policies p 
           JOIN admin.lob lob ON p.lob_id = lob.lob_id 
          WHERE p.lob_id NOT IN (34,40) AND lob.line <> 'Other Lines'`
      );
      lines = rows.map(r => r.line);
    } else {
      lines = lines.filter(line => line !== "Other Lines");
    }

    // group_id ahora es el ID del grupo (CSR, Agent, Producer), no el display_name
    const { rows } = await pool.query(
      `SELECT * FROM intranet.stats_policies_by_csr(
        $1::int[], 
        $2::varchar[], 
        $3::text, 
        $4::date, 
        $5::date, 
        $6::varchar[], 
        $7::varchar[], 
        $8::text, 
        $9::text
      )`,
      [
        locations.map(Number),
        business_types,
        criteria,
        dateStart,
        dateEnd,
        policy_status,
        lines,
        group_by_type,
        group_id
      ]
    );

    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: "Error en el servidor" });
  }
};