import { pool } from "../config/dbConfig.js";

// --- Date helpers ---
function toISODate(date) {
  return date.toISOString().split("T")[0];
}
function getDefaultRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  end.setHours(0, 0, 0, 0);
  return { startISO: toISODate(start), endISO: toISODate(end) };
}
function parseISODateSafe(s, fallback) {
  if (!s) return fallback;
  const d = new Date(s);
  return isNaN(d.getTime()) ? fallback : toISODate(d);
}

// Resolve location_id (scope > user > query ?location=)
function getEffectiveLocationId(req) {
  if (req.scope?.locationId) return Number(req.scope.locationId);
  if (req.user?.location_id) return Number(req.user.location_id);
  if (req.query?.location) {
    const n = Number(req.query.location);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

// API: GET /api/policy-report-by-location?start=YYYY-MM-DD&end=YYYY-MM-DD
export const fetchPolicyReportByLocation = async (req, res) => {
  try {
    const locationId = getEffectiveLocationId(req);
    if (!Number.isFinite(locationId)) {
      return res.status(400).json({ error: "location_id is required (use scopeLocation or pass ?location=ID)" });
    }

    const rawStart = (req.query.start || "").trim().toLowerCase();
    const rawEnd = (req.query.end || "").trim().toLowerCase();
    const debug = req.query.debug === "1";

    let startISO = null;
    let endISO = null;

    if (rawStart === "all" || rawEnd === "all") {
      startISO = null;
      endISO = null;
    } else {
      const { startISO: defStart, endISO: defEnd } = getDefaultRange();
      startISO = parseISODateSafe(req.query.start, defStart);
      endISO = parseISODateSafe(req.query.end, defEnd);
      if (new Date(startISO) > new Date(endISO)) {
        const tmp = startISO; startISO = endISO; endISO = tmp;
      }
    }

    if (debug) {
      console.log(`[PRL][REQ] locationId=${locationId} start=${startISO ?? "NULL"} end=${endISO ?? "NULL"} rawStart=${rawStart || "∅"} rawEnd=${rawEnd || "∅"}`);
    }

    const sql = `
      SELECT *
      FROM intranet.get_policy_report_by_location($1::int, $2::date, $3::date)
    `;
    const { rows } = await pool.query(sql, [locationId, startISO, endISO]);

    // OBTENER INFO DE TIPO DE LOCATION Y FRANQUICIAS
    // Usa el tipo de usuario logueado, NO el tipo del location consultado
    const userLocationType = req.user?.location_type;
    const locInfo = await pool.query(
      `SELECT location_type, alias FROM qq.locations WHERE location_id = $1`, [locationId]
    );
    const location_alias = locInfo.rows[0]?.alias || "";

    let franchises = [];
    if (userLocationType === 1) { // Si el usuario es corporativo, muestra el select
      const franchiseRows = await pool.query(
        `SELECT location_id, alias FROM qq.locations WHERE location_type = 2 ORDER BY alias`
      );
      franchises = franchiseRows.rows;
    }

    res.set("Cache-Control", "no-store, max-age=0");
    res.json({
      columns: [
        "policy_number",
        "line_of_business",
        "csr",
        "producer",
        "location",
        "business_type",
        "binder_date",
        "effective_date",
        "policy_status"
      ],
      rows,
      locationId, // <- PASAMOS locationId
      range: { startISO, endISO },
      location_type: userLocationType,
      location_alias,
      franchises,
      debug: debug ? { rawStart, rawEnd } : undefined
    });
  } catch (error) {
    console.error("Error in fetchPolicyReportByLocation:", error);
    res.status(500).json({
      error: "Server error",
      details: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

// SSR view: GET /users/policy-report-by-location
export const renderPolicyReportByLocationView = async (req, res) => {
  try {
    const locationId = getEffectiveLocationId(req);
    const userLocationType = req.user?.location_type;
    if (!Number.isFinite(locationId)) return res.status(400).send("location_id is required.");
    const { startISO: defStart, endISO: defEnd } = getDefaultRange();
    const startISO = parseISODateSafe(req.query.start, defStart);
    const endISO = parseISODateSafe(req.query.end, defEnd);

    const sql = `SELECT * FROM intranet.get_policy_report_by_location($1::int, $2::date, $3::date)`;
    const { rows } = await pool.query(sql, [locationId, startISO, endISO]);

    // Info del location consultado (para el alias)
    const locInfo = await pool.query(
      `SELECT location_type, alias FROM qq.locations WHERE location_id = $1`, [locationId]
    );
    const location_alias = locInfo.rows[0]?.alias || "";

    let franchises = [];
    if (userLocationType === 1) {
      const franchiseRows = await pool.query(
        `SELECT location_id, alias FROM qq.locations WHERE location_type = 2 ORDER BY alias`
      );
      franchises = franchiseRows.rows;
    }

    res.render("policy-report-by-location", {
      user: req.user,
      initialRows: rows || [],
      initialRange: { startISO, endISO },
      locationId, // <- PASA locationId, que es el id seleccionado
      columns: [
        "policy_number",
        "line_of_business",
        "csr",
        "producer",
        "location",
        "business_type",
        "binder_date",
        "effective_date",
        "policy_status"
      ],
      location_type: userLocationType,
      location_alias,
      franchises
    });
  } catch (e) {
    console.error("renderPolicyReportByLocationView error:", e);
    res.status(500).render("error", { message: "Server error", details: process.env.NODE_ENV === "development" ? e.message : "Contact support" });
  }
};

export default {
  fetchPolicyReportByLocation,
  renderPolicyReportByLocationView
};