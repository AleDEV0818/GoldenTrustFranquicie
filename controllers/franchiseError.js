import { pool } from "../config/dbConfig.js";

function toISODate(date) { return date.toISOString().split("T")[0]; }
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
function parseIntegerSafe(v) {
  if (v === undefined || v === null) return null;
  if (typeof v === "string" && (v.trim() === "" || v.toLowerCase() === "all")) return null;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? null : n;
}
function getLocationIdFromRequest(req) {
  // Prioridad: query ?locationId= o ?location_id=, luego usuario
  const raw = req.query.locationId ?? req.query.location_id ?? req.user?.location_id ?? req.user?.locationId;
  return parseIntegerSafe(raw);
}

export const renderFranchiseErrorsPanel = async (req, res) => {
  try {
    const { startISO: defStart, endISO: defEnd } = getDefaultRange();
    let startISO = parseISODateSafe(req.query.start, defStart);
    let endISO = parseISODateSafe(req.query.end, defEnd);
    if (new Date(startISO) > new Date(endISO)) [startISO, endISO] = [endISO, startISO];

    const locationId = getLocationIdFromRequest(req);

    const sql = `
      SELECT *
      FROM intranet.franchise_error_totals($1::int, $2::date, $3::date)
      WHERE franchise IS NOT NULL
      ORDER BY total_errors DESC, franchise ASC
    `;
    const { rows } = await pool.query(sql, [locationId, startISO, endISO]);

    res.render("franchise-errors", {
      user: req.user,
      initialRows: rows || [],
      initialRange: { startISO, endISO },
      initialLocationId: locationId
    });
  } catch (e) {
    console.error("Error rendering franchise errors panel:", e);
    res.status(500).render("error", {
      message: "Server error",
      details: process.env.NODE_ENV === "development" ? e.message : "Contact support",
    });
  }
};

export const fetchFranchiseErrorsPanelData = async (req, res) => {
  try {
    const { start, end } = req.query;
    const { startISO: defStart, endISO: defEnd } = getDefaultRange();

    let startISO = parseISODateSafe(start, defStart);
    let endISO = parseISODateSafe(end, defEnd);
    if (new Date(startISO) > new Date(endISO)) [startISO, endISO] = [endISO, startISO];

    const locationId = getLocationIdFromRequest(req);

    const sql = `
      SELECT *
      FROM intranet.franchise_error_totals($1::int, $2::date, $3::date)
      WHERE franchise IS NOT NULL
      ORDER BY total_errors DESC, franchise ASC
    `;
    const { rows } = await pool.query(sql, [locationId, startISO, endISO]);

    res.set("Cache-Control", "no-store, max-age=0");
    res.json({ rows, range: { startISO, endISO }, locationId });
  } catch (error) {
    console.error("Error in fetchFranchiseErrorsPanelData:", error);
    res.status(500).json({ error: "Server error", details: process.env.NODE_ENV === "development" ? error.message : undefined });
  }
};

export default { renderFranchiseErrorsPanel, fetchFranchiseErrorsPanelData };