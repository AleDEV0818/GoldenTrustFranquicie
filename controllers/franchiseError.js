import { pool } from "../config/dbConfig.js";

function toISODate(date) {
  return date.toISOString().split("T")[0];
}
function parseISODateSafe(s) {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : toISODate(d);
}
function parseIntegerSafe(v) {
  if (v === undefined || v === null) return null;
  if (typeof v === "string" && (v.trim() === "" || v.toLowerCase() === "all")) return null;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? null : n;
}
function getLocationIdFromRequest(req) {
  const raw =
    req.query.locationId ??
    req.query.location_id ??
    req.user?.location_id ??
    req.user?.locationId;
  return parseIntegerSafe(raw);
}

/**
 * Render de la página:
 * - NO hace consultas al cargar (sin auto-fetch).
 * - Respeta params si llegan, pero solo consulta si hay rango (start y end válidos) Y locationId.
 */
export const renderFranchiseErrorsPanel = async (req, res) => {
  try {
    const startISO = parseISODateSafe(req.query.start);
    const endISO = parseISODateSafe(req.query.end);
    const activeOnly = ["1", "true", "on", "yes"].includes(String(req.query.active || "").toLowerCase());
    const locationId = getLocationIdFromRequest(req);

    const hasRange = !!(startISO && endISO);
    const useStart = hasRange ? startISO : null;
    const useEnd = hasRange ? endISO : null;

    const fn = activeOnly
      ? "intranet.franchise_error_totals_active" // SOLO activos
      : "intranet.franchise_error_totals";       // todos

    let rows = [];
    const range = { startISO: useStart, endISO: useEnd };

    // SOLO consultar si hay locationId y rango completo.
    if (locationId != null && hasRange) {
      const sql = `
        SELECT 
          location_id,
          franchise,
          "active_police"             AS active_police,
          "Active clients"            AS active_clients,
          "Binder errors"             AS binder_errors,
          "Missing CSR"               AS csr_total,
          "Missing Producer"          AS producer_total,
          "Missing (any)"             AS missing_any_total,
          "Missing Contact Info"      AS missing_contact_info,
          "Total errors"              AS total_errors,
          start_date,
          end_date
        FROM ${fn}($1::int, $2::date, $3::date)
        WHERE franchise IS NOT NULL
        ORDER BY total_errors DESC, franchise ASC
      `;
      const resq = await pool.query(sql, [locationId, useStart, useEnd]);
      rows = resq.rows || [];
    }

    res.render("franchise-errors", {
      user: req.user,
      initialRows: rows, // vacío si no se consultó
      initialRange: range,
      locationId,
      activeOnly
    });
  } catch (e) {
    console.error("Error rendering franchise errors panel:", e);
    res.status(500).render("error", {
      message: "Server error",
      details: process.env.NODE_ENV === "development" ? e.message : "Contact support"
    });
  }
};

/**
 * Endpoint de datos: devuelve totales por franquicia.
 * - active=1 => llama intranet.franchise_error_totals_active (activos).
 * - active!=1 => llama intranet.franchise_error_totals (todos).
 * - Si no llegan fechas válidas -> usa NULL,NULL (todo).
 */
export const fetchFranchiseErrorsPanelData = async (req, res) => {
  try {
    const startISO = parseISODateSafe(req.query.start);
    const endISO = parseISODateSafe(req.query.end);
    const activeOnly = ["1", "true", "on", "yes"].includes(String(req.query.active || "").toLowerCase());
    const locationId = getLocationIdFromRequest(req);

    const hasRange = !!(startISO && endISO);
    const useStart = hasRange ? startISO : null;
    const useEnd = hasRange ? endISO : null;

    const fn = activeOnly
      ? "intranet.franchise_error_totals_active"
      : "intranet.franchise_error_totals";

    if (locationId == null) {
      return res.status(400).json({ error: "Missing locationId" });
    }

    const sql = `
      SELECT 
        location_id,
        franchise,
        "active_police"             AS active_police,
        "Active clients"            AS active_clients,
        "Binder errors"             AS binder_errors,
        "Missing CSR"               AS csr_total,
        "Missing Producer"          AS producer_total,
        "Missing (any)"             AS missing_any_total,
        "Missing Contact Info"      AS missing_contact_info,
        "Total errors"              AS total_errors,
        start_date,
        end_date
      FROM ${fn}($1::int, $2::date, $3::date)
      WHERE franchise IS NOT NULL
      ORDER BY total_errors DESC, franchise ASC
    `;
    const { rows } = await pool.query(sql, [locationId, useStart, useEnd]);

    res.set("Cache-Control", "no-store, max-age=0");
    res.json({
      rows,
      range: { startISO: useStart, endISO: useEnd },
      locationId,
      activeOnly
    });
  } catch (error) {
    console.error("Error in fetchFranchiseErrorsPanelData:", error);
    res.status(500).json({
      error: "Server error",
      details: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

export default {
  renderFranchiseErrorsPanel,
  fetchFranchiseErrorsPanelData
};