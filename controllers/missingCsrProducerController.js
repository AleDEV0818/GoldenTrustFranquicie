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

function getEffectiveLocationId(req) {
  if (req.scope?.locationId) return Number(req.scope.locationId);
  if (req.user?.location_id) return Number(req.user.location_id);
  if (req.query?.location) {
    const n = Number(req.query.location);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

// API: GET /api/missing-csr-producer?start=YYYY-MM-DD&end=YYYY-MM-DD
export const fetchMissingCsrOrProducerPolicies = async (req, res) => {
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
      console.log(`[MCP][REQ] locationId=${locationId} start=${startISO ?? "NULL"} end=${endISO ?? "NULL"} rawStart=${rawStart || "∅"} rawEnd=${rawEnd || "∅"}`);
    }

    const sql = `
      SELECT *
      FROM intranet.get_policies_missing_csr_or_producer($1::int, $2::date, $3::date)
    `;
    const { rows } = await pool.query(sql, [locationId, startISO, endISO]);

    if (debug) {
      console.log(`[MCP][RES] found=${rows.length}`);
      if (rows.length > 0) {
        console.log(`[MCP][RES] firstRow keys:`, Object.keys(rows[0]));
      }
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
        "missing_fields",
        "policy_status"
      ],
      rows,
      locationId,
      range: { startISO, endISO },
      debug: debug ? { rawStart, rawEnd } : undefined
    });
  } catch (error) {
    console.error("Error in fetchMissingCsrOrProducerPolicies:", error);
    res.status(500).json({
      error: "Server error",
      details: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

export const renderMissingCsrOrProducerView = async (req, res) => {
  try {
    const locationId = getEffectiveLocationId(req);
    if (!Number.isFinite(locationId)) return res.status(400).send("location_id is required.");
    const { startISO: defStart, endISO: defEnd } = getDefaultRange();
    const startISO = parseISODateSafe(req.query.start, defStart);
    const endISO = parseISODateSafe(req.query.end, defEnd);

    // Si el usuario es corporativo, obtiene lista de franquicias para el select
    let franchises = [];
    if (req.user?.location_type === 1) {
      const franchiseRows = await pool.query(
        `SELECT location_id, alias FROM qq.locations WHERE location_type = 2 ORDER BY alias`
      );
      franchises = franchiseRows.rows;
    }

    const sql = `SELECT * FROM intranet.get_policies_missing_csr_or_producer($1::int, $2::date, $3::date)`;
    const { rows } = await pool.query(sql, [locationId, startISO, endISO]);

    res.render("missing-csr-producer", {
      user: req.user,
      initialRows: rows || [],
      initialRange: { startISO, endISO },
      locationId, // id seleccionado en el select
      franchises, // lista de franquicias para el select
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
  renderMissingCsrOrProducerView
};