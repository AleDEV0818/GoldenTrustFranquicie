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

// API: GET /api/missing-contact-errors?type=email|phone&location=ID
export const fetchMissingContactErrors = async (req, res) => {
  try {
    const locationId = getEffectiveLocationId(req);
    if (!Number.isFinite(locationId)) {
      return res.status(400).json({ error: "location_id is required (use scopeLocation or pass ?location=ID)" });
    }

    const typeRaw = (req.query.type || "").trim().toLowerCase();
    const type = typeRaw === "phone" ? "phone" : "email";

    const fn = type === "phone"
      ? "intranet.get_active_customers_without_phone"
      : "intranet.get_active_customers_without_email";

    // Opcional: Si el usuario es corporativo, devuelve lista de franquicias
    let franchises = [];
    if (req.user?.location_type === 1) {
      const franchiseRows = await pool.query(
        `SELECT location_id, alias FROM qq.locations WHERE location_type = 2 ORDER BY alias`
      );
      franchises = franchiseRows.rows;
    }

    const sql = `SELECT * FROM ${fn}($1::int)`;
    const { rows } = await pool.query(sql, [locationId]);

    // --- Obtener alias de la franquicia ---
    let locationAlias = "—";
    if (locationId) {
      const aliasRows = await pool.query(
        `SELECT alias FROM qq.locations WHERE location_id = $1 LIMIT 1`,
        [locationId]
      );
      if (aliasRows.rows.length) {
        locationAlias = aliasRows.rows[0].alias || "—";
      }
    }

    res.set("Cache-Control", "no-store, max-age=0");
    res.json({
      rows,
      type,
      locationId,
      franchises, // lista de franquicias para el select (sin "All Franchises")
      locationAlias // <-- Añadido aquí, para frontend
    });
  } catch (error) {
    console.error("Error in fetchMissingContactErrors:", error);
    res.status(500).json({
      error: "Server error",
      details: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

export const renderMissingContactErrorsView = async (req, res) => {
  try {
    const locationId = getEffectiveLocationId(req);
    if (!Number.isFinite(locationId)) return res.status(400).send("location_id is required.");

    const typeRaw = (req.query.type || "").trim().toLowerCase();
    const type = typeRaw === "phone" ? "phone" : "email";

    // Si el usuario es corporativo, obtiene lista de franquicias para el select
    let franchises = [];
    if (req.user?.location_type === 1) {
      const franchiseRows = await pool.query(
        `SELECT location_id, alias FROM qq.locations WHERE location_type = 2 ORDER BY alias`
      );
      franchises = franchiseRows.rows;
    }

    const fn = type === "phone"
      ? "intranet.get_active_customers_without_phone"
      : "intranet.get_active_customers_without_email";

    const sql = `SELECT * FROM ${fn}($1::int)`;
    const { rows } = await pool.query(sql, [locationId]);

    // --- Obtener alias de la franquicia ---
    let locationAlias = "—";
    if (locationId) {
      const aliasRows = await pool.query(
        `SELECT alias FROM qq.locations WHERE location_id = $1 LIMIT 1`,
        [locationId]
      );
      if (aliasRows.rows.length) {
        locationAlias = aliasRows.rows[0].alias || "—";
      }
    }

    res.render("missing-contact-errors", {
      user: req.user,
      initialRows: rows || [],
      locationId, // id seleccionado en el select
      type,
      franchises, // lista de franquicias para el select (sin "All Franchises")
      locationAlias // <-- Aquí está la variable
    });
  } catch (e) {
    console.error("renderMissingContactErrorsView error:", e);
    res.status(500).render("error", { message: "Server error", error: e, details: process.env.NODE_ENV === "development" ? e.message : "Contact support" });
  }
};

export default {
  fetchMissingContactErrors,
  renderMissingContactErrorsView
};