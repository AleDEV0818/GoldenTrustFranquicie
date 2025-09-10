/**
 * Controladores Policy Report by Location
 * Incluye endpoints para contadores rápidos:
 *  - /api/active-policies-count?location=ID
 *  - /api/location-total-errors?location=ID[&active=1]
 */
import { pool } from "../config/dbConfig.js";

// Helpers
function toISODate(date) {
  return date.toISOString().split("T")[0];
}
function parseISODateSafe(s) {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : toISODate(d);
}
function isProvided(v) {
  return v !== undefined && v !== null && String(v).trim() !== "";
}
function getEffectiveLocationId(req) {
  if (req.scope?.locationId) return Number(req.scope.locationId);
  if (req.user?.location_id) return Number(req.user.location_id);
  if (req.query?.location) {
    const n = Number(req.query.location);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}
function normalizePolicyRows(rows) {
  const keys = [
    "policy_number",
    "line_of_business",
    "business_type",
    "csr",
    "producer",
    "binder_date",
    "effective_date",
    "location",
    "policy_status"
  ];
  if (!rows || rows.length === 0) {
    const emptyRow = {};
    keys.forEach(k => (emptyRow[k] = ""));
    return [emptyRow];
  }
  return rows.map(row => {
    const normalized = {};
    keys.forEach(k => (normalized[k] = typeof row[k] !== "undefined" ? row[k] : ""));
    return normalized;
  });
}

// API: GET /api/active-policies-count?location=ID
export const fetchActivePoliciesCount = async (req, res) => {
  try {
    const locationId = getEffectiveLocationId(req);
    if (!Number.isFinite(locationId)) {
      return res.status(400).json({ error: "location_id is required (use scopeLocation or pass ?location=ID)" });
    }
    const { rows } = await pool.query(
      `SELECT intranet.count_active_policies_by_location($1) AS count`,
      [locationId]
    );
    const count = Number(rows?.[0]?.count ?? 0);
    res.set("Cache-Control", "no-store, max-age=0");
    return res.json({ locationId, count });
  } catch (e) {
    console.error("Error in fetchActivePoliciesCount:", e);
    return res.status(500).json({ error: "Server error" });
  }
};

// API: GET /api/location-total-errors?location=ID[&active=1]
export const fetchLocationTotalErrorsCount = async (req, res) => {
  try {
    const locationId = getEffectiveLocationId(req);
    if (!Number.isFinite(locationId)) {
      return res.status(400).json({ error: "location_id is required (use scopeLocation or pass ?location=ID)" });
    }
    const activeOnly = ["1", "true", "on", "yes"].includes(String(req.query.active || "").toLowerCase());
    const fn = activeOnly
      ? "intranet.franchise_error_totals_active"
      : "intranet.franchise_error_totals";

    // Tomamos el total de errores para ese location (all-time: NULL,NULL)
    const sql = `
      SELECT COALESCE((
        SELECT "Total errors"
        FROM ${fn}($1::int, NULL::date, NULL::date)
        WHERE location_id = $1
        LIMIT 1
      ), 0)::int AS count
    `;
    const { rows } = await pool.query(sql, [locationId]);
    const count = Number(rows?.[0]?.count ?? 0);

    res.set("Cache-Control", "no-store, max-age=0");
    return res.json({ locationId, activeOnly, count });
  } catch (e) {
    console.error("Error in fetchLocationTotalErrorsCount:", e);
    return res.status(500).json({ error: "Server error" });
  }
};

// API: GET /api/policy-report-by-location
export const fetchPolicyReportByLocation = async (req, res) => {
  try {
    const locationId = getEffectiveLocationId(req);
    if (!Number.isFinite(locationId)) {
      return res.status(400).json({ error: "location_id is required (use scopeLocation or pass ?location=ID)" });
    }

    const debug = req.query.debug === "1";
    const activeOnly = ["1", "true", "on", "yes"].includes(String(req.query.active || "").toLowerCase());

    const rawStart = (req.query.start ?? "").trim();
    const rawEnd = (req.query.end ?? "").trim();
    const providedStart = isProvided(rawStart) && rawStart.toLowerCase() !== "all";
    const providedEnd = isProvided(rawEnd) && rawEnd.toLowerCase() !== "all";

    let startISO = providedStart ? parseISODateSafe(rawStart) : null;
    let endISO = providedEnd ? parseISODateSafe(rawEnd) : null;

    if (providedStart && !startISO) {
      return res.status(400).json({ error: "Invalid date format for 'start'. Please use YYYY-MM-DD." });
    }
    if (providedEnd && !endISO) {
      return res.status(400).json({ error: "Invalid date format for 'end'. Please use YYYY-MM-DD." });
    }
    if ((providedStart && !providedEnd) || (!providedStart && providedEnd)) {
      return res.status(400).json({ error: "Please select both start and end dates to use a date range, or leave both empty." });
    }
    if (startISO && endISO && new Date(startISO) > new Date(endISO)) {
      return res.status(400).json({ error: "Invalid date range: start date must not be after end date." });
    }

    const useStart = startISO || null;
    const useEnd = endISO || null;

    if (debug) {
      console.log(`[PRL][REQ] locationId=${locationId} start=${useStart ?? "NULL"} end=${useEnd ?? "NULL"} activeOnly=${activeOnly}`);
    }

    const sql = `
      SELECT *
      FROM intranet.get_policy_report_by_location($1::int, $2::date, $3::date)
      WHERE ($4::boolean IS FALSE OR policy_status = 'A')
    `;
    const { rows } = await pool.query(sql, [locationId, useStart, useEnd, activeOnly]);

    // Contadores (all-time para Active Policies; all-time para Total Errors con flag active)
    const actQ = await pool.query(
      `SELECT intranet.count_active_policies_by_location($1) AS active_policies_count`,
      [locationId]
    );
    const activePoliciesCount = Number(actQ.rows?.[0]?.active_policies_count ?? 0);

    const fn = activeOnly
      ? "intranet.franchise_error_totals_active"
      : "intranet.franchise_error_totals";
    const errQ = await pool.query(
      `SELECT COALESCE((SELECT "Total errors" FROM ${fn}($1::int, NULL::date, NULL::date) WHERE location_id = $1 LIMIT 1), 0)::int AS total_errors_count`,
      [locationId]
    );
    const totalErrorsCount = Number(errQ.rows?.[0]?.total_errors_count ?? 0);

    const locInfo = await pool.query(
      `SELECT location_type, alias FROM qq.locations WHERE location_id = $1`,
      [locationId]
    );
    const location_alias = locInfo.rows[0]?.alias || "";
    const userLocationType = req.user?.location_type;

    let franchises = [];
    if (userLocationType === 1) {
      const f = await pool.query(
        `SELECT location_id, alias FROM qq.locations WHERE location_type = 2 ORDER BY alias`
      );
      franchises = f.rows;
    }

    res.set("Cache-Control", "no-store, max-age=0");
    res.json({
      columns: [
        "policy_number",
        "line_of_business",
        "business_type",
        "csr",
        "producer",
        "binder_date",
        "effective_date",
        "location",
        "policy_status"
      ],
      rows: normalizePolicyRows(rows),
      locationId,
      range: { startISO: useStart, endISO: useEnd },
      location_type: userLocationType,
      location_alias,
      franchises,
      activeOnly,
      activePoliciesCount,
      totalErrorsCount
    });
  } catch (error) {
    console.error("Error in fetchPolicyReportByLocation:", error);
    res.status(500).json({
      error: "Server error",
      details: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

// SSR: GET /users/policy-report-by-location
export const renderPolicyReportByLocationView = async (req, res) => {
  try {
    const locationId = getEffectiveLocationId(req);
    const userLocationType = req.user?.location_type;
    if (!Number.isFinite(locationId)) return res.status(400).send("location_id is required.");

    const activeOnly = ["1", "true", "on", "yes"].includes(String(req.query.active || "").toLowerCase());

    const rawStart = (req.query.start ?? "").trim();
    const rawEnd = (req.query.end ?? "").trim();
    const providedStart = isProvided(rawStart) && rawStart.toLowerCase() !== "all";
    const providedEnd = isProvided(rawEnd) && rawEnd.toLowerCase() !== "all";

    let startISO = providedStart ? parseISODateSafe(rawStart) : null;
    let endISO = providedEnd ? parseISODateSafe(rawEnd) : null;

    if (startISO && endISO && new Date(startISO) > new Date(endISO)) {
      const tmp = startISO; startISO = endISO; endISO = tmp;
    }

    const locInfo = await pool.query(
      `SELECT location_type, alias FROM qq.locations WHERE location_id = $1`,
      [locationId]
    );
    const location_alias = locInfo.rows[0]?.alias || "";

    let franchises = [];
    if (userLocationType === 1) {
      const f = await pool.query(
        `SELECT location_id, alias FROM qq.locations WHERE location_type = 2 ORDER BY alias`
      );
      franchises = f.rows;
    }

    // Contadores SSR
    const actQ = await pool.query(
      `SELECT intranet.count_active_policies_by_location($1) AS active_policies_count`,
      [locationId]
    );
    const activePoliciesCount = Number(actQ.rows?.[0]?.active_policies_count ?? 0);

    const fn = activeOnly
      ? "intranet.franchise_error_totals_active"
      : "intranet.franchise_error_totals";
    const errQ = await pool.query(
      `SELECT COALESCE((SELECT "Total errors" FROM ${fn}($1::int, NULL::date, NULL::date) WHERE location_id = $1 LIMIT 1), 0)::int AS total_errors_count`,
      [locationId]
    );
    const totalErrorsCount = Number(errQ.rows?.[0]?.total_errors_count ?? 0);

    // Consulta de tabla solo si hay rango
    let rows = [];
    let useStart = null, useEnd = null;
    if (startISO && endISO) {
      useStart = startISO; useEnd = endISO;
      const sql = `
        SELECT *
        FROM intranet.get_policy_report_by_location($1::int, $2::date, $3::date)
        WHERE ($4::boolean IS FALSE OR policy_status = 'A')
      `;
      const resq = await pool.query(sql, [locationId, useStart, useEnd, activeOnly]);
      rows = resq.rows || [];
    }

    res.render("policy-report-by-location", {
      user: req.user,
      initialRows: normalizePolicyRows(rows),
      initialRange: { startISO: useStart, endISO: useEnd },
      locationId,
      columns: [
        "policy_number",
        "line_of_business",
        "business_type",
        "csr",
        "producer",
        "binder_date",
        "effective_date",
        "location",
        "policy_status"
      ],
      location_type: userLocationType,
      location_alias,
      franchises,
      activeOnly,
      activePoliciesCount,
      totalErrorsCount
    });
  } catch (e) {
    console.error("renderPolicyReportByLocationView error:", e);
    res.status(500).render("error", {
      message: "Server error",
      details: process.env.NODE_ENV === "development" ? e.message : "Contact support"
    });
  }
};

export default {
  fetchPolicyReportByLocation,
  renderPolicyReportByLocationView,
  fetchActivePoliciesCount,
  fetchLocationTotalErrorsCount
};