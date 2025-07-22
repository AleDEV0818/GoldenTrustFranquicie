import { pool } from "../config/dbConfig.js";

// Obtener los locations filtrados SOLO POR ALIAS ÚNICO
export const getLocationsForUser = async (user) => {
  let locations = [];
  if (user && user.location_type == 1) {
    const { rows } = await pool.query(`
      SELECT location_id, alias
      FROM (
        SELECT 
          location_id, 
          alias,
          ROW_NUMBER() OVER (PARTITION BY LOWER(TRIM(alias)) ORDER BY location_id) AS rn
        FROM qq.locations
      ) t
      WHERE rn = 1
      ORDER BY LOWER(TRIM(alias))
    `);
    locations = [{ location_id: 0, alias: "Corporate" }, ...rows];
  } else if (user && (user.location_type == 2 || user.location_type == 4)) {
    const { rows } = await pool.query(
      `SELECT location_id, alias FROM qq.locations WHERE location_id = $1 ORDER BY alias`,
      [user.location_id]
    );
    locations = rows;
  }
  return locations;
};

// Renderizar la vista principal de estadísticas de pólizas
export const renderStatisticsPolicies = async (req, res) => {
  try {
    const locations = await getLocationsForUser(req.user);
    res.render("statistics-policies", {
      user: req.user,
      locations
    });
  } catch (err) {
    res.status(500).send("Error en el servidor");
  }
};

// Endpoint AJAX para cargar los filtros posibles desde la base
export const fetchPoliciesFilters = async (req, res) => {
  try {
    const { rows: btRows } = await pool.query('SELECT DISTINCT business_type FROM qq.policies ORDER BY business_type');
    const { rows: psRows } = await pool.query('SELECT DISTINCT policy_status FROM qq.policies ORDER BY policy_status');
    const { rows: lineRows } = await pool.query("SELECT DISTINCT line FROM admin.lob WHERE line IS NOT NULL AND line <> 'Other Lines' ORDER BY line");
    res.json({
      success: true,
      business_types: btRows.map(r => r.business_type),
      policy_status: psRows.map(r => r.policy_status),
      lines: lineRows.map(r => r.line)
    });
  } catch (err) {
    res.json({ success: false, error: 'Error loading filter data' });
  }
};

// Utilidad robusta para formatear premium como $11,837 (nunca NaN)
function formatPremium(value) {
  let num = 0;
  if (typeof value === "number") {
    num = value;
  } else if (typeof value === "string") {
    // Quita todo menos números y punto decimal
    const clean = value.replace(/[^0-9.]/g, '');
    // Solo parte entera (sin decimales)
    num = parseInt(clean, 10);
    if (isNaN(num)) num = 0;
  }
  if (!num || isNaN(num)) num = 0;
  return `$${num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

// Endpoint para buscar estadísticas según filtros seleccionados
export const fetchPoliciesStatistics = async (req, res) => {
  try {
    let {
      locations = [],
      business_types = [],
      criteria = "binder_date",
      date_range = [],
      policy_status = [],
      lines = []
    } = req.body;

    if (!Array.isArray(locations)) locations = locations ? [locations] : [];
    if (!Array.isArray(business_types)) business_types = business_types ? [business_types] : [];
    if (!Array.isArray(date_range)) date_range = date_range ? [date_range] : [];
    if (!Array.isArray(policy_status)) policy_status = policy_status ? [policy_status] : [];
    if (!Array.isArray(lines)) lines = lines ? [lines] : [];

    const dateStart = date_range[0] || null;
    const dateEnd = date_range[1] || null;
    if (!dateStart || !dateEnd) {
      return res.json({ success: false, data: [], message: "Select a date range." });
    }

    if (req.user.id_location_type == 1 && (locations.length === 0 || locations.includes(0))) {
      const allLocs = await pool.query('SELECT location_id FROM qq.locations');
      locations = allLocs.rows.map(r => r.location_id);
    }
    if (req.user.id_location_type == 2 || req.user.id_location_type == 4) {
      locations = [req.user.location_id];
    }
    if (business_types.length === 0) {
      const { rows } = await pool.query('SELECT DISTINCT business_type FROM qq.policies');
      business_types = rows.map(r => r.business_type);
    }
    if (policy_status.length === 0) {
      const { rows } = await pool.query('SELECT DISTINCT policy_status FROM qq.policies');
      policy_status = rows.map(r => r.policy_status);
    }
    const linesParam = lines.length ? lines : null;

    const { rows } = await pool.query(
      `SELECT * FROM intranet.stats_location_search_v4($1::int[], $2::varchar[], $3::text, $4::date, $5::date, $6::varchar[], $7::varchar[])`,
      [
        locations.map(Number),
        business_types,
        criteria,
        dateStart,
        dateEnd,
        policy_status,
        linesParam
      ]
    );

    // Formatea premium robustamente
    const formattedRows = rows.map(row => ({
      ...row,
      premium: formatPremium(row.premium),
      effective_date: row.effective_date,
      exp_date: row.exp_date,
      cancellation_date: row.cancellation_date
    }));

    res.json({ success: true, data: formattedRows });
  } catch (err) {
    console.error("Error en fetchPoliciesStatistics:", err);
    res.status(500).json({ success: false, error: "Error en el servidor" });
  }
};