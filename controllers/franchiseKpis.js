import { pool } from "../config/dbConfig.js";

const CONTROLLER_VERSION = "fkpis-2025-08-13-01";
const FKPI_DEBUG = process.env.FKPI_DEBUG === "1";

// ====== DATE UTILITIES ======
function toISODate(date) {
  return date.toISOString().split("T")[0];
}
function getMonthRangeUsingPlusOffset(monthOffset = 0) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  start.setHours(0, 0, 0, 0);
  const end =
    monthOffset === 0
      ? new Date(now.getFullYear(), now.getMonth(), now.getDate())
      : new Date(now.getFullYear(), now.getMonth() + monthOffset + 1, 0);
  end.setHours(0, 0, 0, 0);
  return { startISO: toISODate(start), endISO: toISODate(end) };
}

// ====== NORMALIZERS ======
function normalizePairIntegers(text) {
  if (!text || typeof text !== "string") return "0 / 0";
  const [aRaw = "", bRaw = ""] = text.split("/").map((s) => s.trim());
  const normInt = (s) => {
    if (!s) return "0";
    const cleaned = String(s).replace(/\$/g, "").replace(/,/g, "").trim();
    const n = Number(cleaned);
    return Number.isFinite(n) ? Math.round(n).toLocaleString("en-US") : s;
  };
  return `${normInt(aRaw)} / ${normInt(bRaw)}`;
}
function normalizePairPercents(text) {
  if (!text || typeof text !== "string") return "0.0% / 0.0%";
  const [aRaw = "", bRaw = ""] = text.split("/").map((s) => s.trim());
  const normPct = (s) => {
    if (!s) return "0.0%";
    const cleaned = String(s).replace("%", "").trim();
    const n = Number(cleaned);
    return Number.isFinite(n)
      ? n.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%"
      : s;
  };
  return `${normPct(aRaw)} / ${normPct(bRaw)}`;
}

// ====== VIEW (SSR con datos de caché) ======
export const renderFranchiseKpisPanel = async (req, res) => {
  try {
    const baseUrl =
      process.env.FIRST_PROJECT_BASE_URL || `${req.protocol}://${req.get("host")}`;
    const { endISO } = getMonthRangeUsingPlusOffset(0);

    // Lee meta y, si no hay caché, puebla una vez sincrónicamente
    const metaSql = "SELECT * FROM intranet.franchise_cache_meta($1::date)";
    let metaRes = await pool.query(metaSql, [endISO]);
    let meta = metaRes.rows?.[0] || null;

    if (!meta || meta.used_date === null) {
      await pool.query("SELECT intranet.refresh_franchise_cache($1::date, true)", [endISO]);
      metaRes = await pool.query(metaSql, [endISO]);
      meta = metaRes.rows?.[0] || null;
    }

    // Lee SIEMPRE desde caché para pintar SSR inmediatamente
    const [tableResult, totalsResult] = await Promise.all([
      pool.query(
        "SELECT * FROM intranet.franchise_dashboard_fast($1::date) ORDER BY franchise ASC",
        [endISO]
      ),
      pool.query("SELECT * FROM intranet.franchise_kpis_totals($1::date)", [endISO]),
    ]);

    const initialFranchises = tableResult.rows || [];
    const rawTotals =
      totalsResult.rows?.[0] || {
        premium_and_policies: "0 / 0",
        renewed_and_policies: "0 / 0",
        lost_and_policies: "0 / 0",
        percent_and_max: "0.0% / 0.0%",
      };

    const initialPanelMetrics = {
      premium_and_policies: normalizePairIntegers(rawTotals.premium_and_policies),
      renewed_and_policies: normalizePairIntegers(rawTotals.renewed_and_policies),
      lost_and_policies: normalizePairIntegers(rawTotals.lost_and_policies),
      percent_and_max: normalizePairPercents(rawTotals.percent_and_max),
    };

    const initialLastUpdatedAtISO = meta?.as_of ? new Date(meta.as_of).toISOString() : null;

    res.render("franchise-kpis", {
      panelMetrics: initialPanelMetrics,
      baseUrl,
      user: req.user,
      controllerVersion: CONTROLLER_VERSION,

      // SSR payload (clave para no ver tabla vacía)
      initialFranchises,
      initialPanelMetrics,
      initialMeta: meta,
      initialLastUpdatedAtISO,
    });
  } catch (e) {
    console.error("Error rendering franchise KPIs panel:", e);
    res.status(500).render("error", {
      message: "Server error",
      details: process.env.NODE_ENV === "development" ? e.message : "Contact support",
    });
  }
};

// ====== API: lee caché; encola si poke=1; silent polling (sin banner) ======
export const fetchFranchiseKpisPanelData = async (req, res) => {
  const monthOffset = Number(req.query.month) || 0;
  const { endISO } = getMonthRangeUsingPlusOffset(monthOffset);

  try {
    const metaSql = "SELECT * FROM intranet.franchise_cache_meta($1::date)";

    // Meta inicial
    let metaRes = await pool.query(metaSql, [endISO]);
    let meta = metaRes.rows?.[0] || null;
    const isRefreshing = Boolean(meta?.refreshing);
    const shouldPoke = req.query.poke === "1";

    // Intentar encolar si no está refrescando y el cliente lo pidió
    let enqueued = false;
    if (!isRefreshing && shouldPoke) {
      try {
        const r = await pool.query("SELECT intranet.enqueue_kpi_refresh($1::date) AS ok", [endISO]);
        enqueued = Boolean(r.rows?.[0]?.ok);
        // Si no hay worker en Node activado, corre el worker inline para procesar el job inmediatamente
        if (process.env.ENABLE_KPI_WORKER !== "1") {
          await pool.query("SELECT intranet.run_kpi_refresh_worker()");
        }
      } catch (e) {
        if (FKPI_DEBUG) console.warn("[FKPIS] enqueue/worker error:", e.message);
      }
    }

    // Lee datos actuales desde caché
    const [tableResult, totalsResult] = await Promise.all([
      pool.query(
        "SELECT * FROM intranet.franchise_dashboard_fast($1::date) ORDER BY franchise ASC",
        [endISO]
      ),
      pool.query("SELECT * FROM intranet.franchise_kpis_totals($1::date)", [endISO]),
    ]);

    const franchises = tableResult.rows || [];
    const rawTotals =
      totalsResult.rows?.[0] || {
        premium_and_policies: "0 / 0",
        renewed_and_policies: "0 / 0",
        lost_and_policies: "0 / 0",
        percent_and_max: "0.0% / 0.0%",
      };

    const panelMetrics = {
      premium_and_policies: normalizePairIntegers(rawTotals.premium_and_policies),
      renewed_and_policies: normalizePairIntegers(rawTotals.renewed_and_policies),
      lost_and_policies: normalizePairIntegers(rawTotals.lost_and_policies),
      percent_and_max: normalizePairPercents(rawTotals.percent_and_max),
    };

    // Meta después de posible encolado
    metaRes = await pool.query(metaSql, [endISO]);
    meta = metaRes.rows?.[0] || null;

    const lastUpdatedAtISO = meta?.as_of ? new Date(meta.as_of).toISOString() : null;

    // Polling silencioso si hay refresh en curso o acabamos de encolar
    const shouldPoll = Boolean(meta?.refreshing || enqueued);
    const pollMs = Number(process.env.KPI_POLL_MS || 10000);

    res.set("Cache-Control", "no-store, max-age=0");
    res.json({
      panelMetrics,
      franchises,
      meta,
      controllerVersion: CONTROLLER_VERSION,
      lastUpdatedAtISO,
      shouldPoll,
      pollMs
    });
  } catch (error) {
    console.error("Error in fetchFranchiseKpisPanelData:", error);
    res.status(500).json({
      error: "Server error",
      details: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// ====== DEBUG ======
export const debugFranchiseTotals = async (req, res) => {
  try {
    const d = req.query.date ? toISODate(new Date(req.query.date)) : toISODate(new Date());
    const totalsSql = "SELECT * FROM intranet.franchise_kpis_totals($1::date)";
    const metaSql = "SELECT * FROM intranet.franchise_cache_meta($1::date)";
    const [totalsR, metaR] = await Promise.all([pool.query(totalsSql, [d]), pool.query(metaSql, [d])]);

    const raw = totalsR.rows?.[0] || null;
    res.json({
      controllerVersion: CONTROLLER_VERSION,
      date: d,
      rawFromSql: raw,
      normalized: raw
        ? {
            premium_and_policies: normalizePairIntegers(raw.premium_and_policies),
            renewed_and_policies: normalizePairIntegers(raw.renewed_and_policies),
            lost_and_policies: normalizePairIntegers(raw.lost_and_policies),
            percent_and_max: normalizePairPercents(raw.percent_and_max),
          }
        : null,
      meta: metaR.rows?.[0] || null,
    });
  } catch (e) {
    console.error("debugFranchiseTotals error:", e);
    res.status(500).json({ error: "debug error", message: e.message });
  }
};

export default {
  renderFranchiseKpisPanel,
  fetchFranchiseKpisPanelData,
  debugFranchiseTotals,
};