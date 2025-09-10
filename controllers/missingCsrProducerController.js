import { pool } from "../config/dbConfig.js";

// Active labels robustos (configurable por ENV: ACTIVE_LABELS="A,ACTIVE,IN FORCE,INFORCE")
const ACTIVE_LABELS = (process.env.ACTIVE_LABELS || "A,ACTIVE,INFORCE,IN FORCE,IN-FORCE,CURRENT")
  .split(",")
  .map(s => s.trim().toUpperCase())
  .filter(Boolean);

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

// KPI ligero: GET /api/active-policies-count?location=ID
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

// API: GET /api/missing-csr-producer?start=YYYY-MM-DD&end=YYYY-MM-DD&active=1
// Reglas:
// - Sin fechas => all time (NULL,NULL)
// - Con rango válido => usar rango
// - active=1 solo filtra por status, no impacta fechas
// - Errores claros si viene un solo extremo, formato inválido, o start > end
export const fetchMissingCsrOrProducerPolicies = async (req, res) => {
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

    // Validaciones de formato
    if (providedStart && !startISO) {
      return res.status(400).json({ error: "Invalid date format for 'start'. Please use YYYY-MM-DD." });
    }
    if (providedEnd && !endISO) {
      return res.status(400).json({ error: "Invalid date format for 'end'. Please use YYYY-MM-DD." });
    }

    // Si solo llegó una fecha => error
    if ((providedStart && !providedEnd) || (!providedStart && providedEnd)) {
      return res.status(400).json({ error: "Please select both start and end dates to use a date range, or leave both empty." });
    }

    // Si ambas fechas válidas pero invertidas => error
    if (startISO && endISO && new Date(startISO) > new Date(endISO)) {
      return res.status(400).json({ error: "Invalid date range: start date must not be after end date." });
    }

    // Sin fechas válidas => all time (NULL,NULL)
    const useStart = startISO || null;
    const useEnd = endISO || null;

    if (debug) {
      console.log(`[MCP][REQ] locationId=${locationId} start=${useStart ?? "NULL"} end=${useEnd ?? "NULL"} activeOnly=${activeOnly}`);
    }

    const sql = `
      SELECT *
      FROM intranet.get_policies_missing_csr_or_producer($1::int, $2::date, $3::date) t
      WHERE ($4::boolean IS FALSE OR TRIM(UPPER(COALESCE(t.policy_status, ''))) = ANY ($5::text[]))
    `;
    const { rows } = await pool.query(sql, [locationId, useStart, useEnd, activeOnly, ACTIVE_LABELS]);

    // KPI azul opcional en la respuesta (por si quieres pintar desde esta llamada)
    const act = await pool.query(
      `SELECT intranet.count_active_policies_by_location($1) AS active_policies_count`,
      [locationId]
    );
    const activePoliciesCount = Number(act.rows?.[0]?.active_policies_count ?? 0);

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
        "missing_fields",
        "policy_status"
      ],
      rows,
      locationId,
      range: { startISO: useStart, endISO: useEnd }, // null/null cuando no hay rango
      activeOnly,
      activePoliciesCount
    });
  } catch (error) {
    console.error("Error in fetchMissingCsrOrProducerPolicies:", error);
    res.status(500).json({
      error: "Server error",
      details: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

// SSR: no poner fechas por defecto; solo mostrar datos si el usuario pasó un rango válido.
// Si no pasó fechas, initialRange es null/null y los inputs quedan vacíos.
export const renderMissingCsrOrProducerView = async (req, res) => {
  try {
    const locationId = getEffectiveLocationId(req);
    if (!Number.isFinite(locationId)) return res.status(400).send("location_id is required.");

    const activeOnly = ["1", "true", "on", "yes"].includes(String(req.query.active || "").toLowerCase());

    const rawStart = (req.query.start ?? "").trim();
    const rawEnd = (req.query.end ?? "").trim();
    const providedStart = isProvided(rawStart) && rawStart.toLowerCase() !== "all";
    const providedEnd = isProvided(rawEnd) && rawEnd.toLowerCase() !== "all";

    let startISO = providedStart ? parseISODateSafe(rawStart) : null;
    let endISO = providedEnd ? parseISODateSafe(rawEnd) : null;

    // Si ambas válidas pero invertidas en SSR, solo las intercambiamos
    if (startISO && endISO && new Date(startISO) > new Date(endISO)) {
      const tmp = startISO; startISO = endISO; endISO = tmp;
    }

    // Lista de franquicias (corporativo)
    let franchises = [];
    if (req.user?.location_type === 1) {
      const franchiseRows = await pool.query(
        `SELECT location_id, alias FROM qq.locations WHERE location_type = 2 ORDER BY alias`
      );
      franchises = franchiseRows.rows;
    }

    // KPIs SSR
    const act = await pool.query(
      `SELECT intranet.count_active_policies_by_location($1) AS active_policies_count`,
      [locationId]
    );
    const activePoliciesCount = Number(act.rows?.[0]?.active_policies_count ?? 0);

    // Consultar solo si hay rango válido; si no, dejamos tabla vacía
    let rows = [];
    let useStart = null, useEnd = null;
    if (startISO && endISO) {
      useStart = startISO; useEnd = endISO;
      const sql = `
        SELECT *
        FROM intranet.get_policies_missing_csr_or_producer($1::int, $2::date, $3::date) t
        WHERE ($4::boolean IS FALSE OR TRIM(UPPER(COALESCE(t.policy_status, ''))) = ANY ($5::text[]))
      `;
      const resq = await pool.query(sql, [locationId, useStart, useEnd, activeOnly, ACTIVE_LABELS]);
      rows = resq.rows || [];
    }

    res.render("missing-csr-producer", {
      user: req.user,
      initialRows: rows,
      initialRange: { startISO: useStart, endISO: useEnd }, // null/null => inputs vacíos
      locationId,
      franchises,
      activeOnly,
      activePoliciesCount,
      columns: [
        "policy_number",
        "line_of_business",
        "csr",
        "producer",
        "location",
        "business_type",
        "binder_date",
        "effective_date",
        "missing_fields",
        "policy_status"
      ]
    });
  } catch (e) {
    console.error("renderMissingCsrOrProducerView error:", e);
    res.status(500).render("error", { message: "Server error", error: e, details: process.env.NODE_ENV === "development" ? e.message : "Contact support" });
  }
};

export default {
  fetchMissingCsrOrProducerPolicies,
  renderMissingCsrOrProducerView,
  fetchActivePoliciesCount
};