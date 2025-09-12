import { pool } from "../config/dbConfig.js";

const CONTROLLER_VERSION = "fkpis-2025-09-12-01";
const FKPI_DEBUG = process.env.FKPI_DEBUG === "1";
const SYNC_REFRESH_ON_STALE = process.env.FKPI_SYNC_REFRESH_ON_STALE === "1"; // Opcional: refresco inmediato si stale

// ====== DATE UTILITIES ======
// Aunque ya solo conservamos la última snapshot, mantenemos estas utilidades para compatibilidad con la firma de funciones SQL.
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

// ====== INTERNAL HELPERS ======
async function loadMeta(dateISO) {
  const metaSql = "SELECT * FROM intranet.franchise_cache_meta($1::date)";
  const r = await pool.query(metaSql, [dateISO]);
  return r.rows?.[0] || null;
}

async function runSyncRefresh(dateISO) {
  // Recalcula completamente la tabla (solo una snapshot)
  await pool.query("SELECT intranet.refresh_franchise_cache($1::date, true)", [dateISO]);
}

// ====== VIEW (SSR) ======
// Render inicial del panel (Server-Side Render). Si no hay data o está stale (y está activado el modo sync), refrescamos en la misma request.
export const renderFranchiseKpisPanel = async (req, res) => {
  try {
    const baseUrl =
      process.env.FIRST_PROJECT_BASE_URL || `${req.protocol}://${req.get("host")}`;

    // En el nuevo modelo, realmente basta con hoy; mantenemos el cálculo por compatibilidad.
    const { endISO } = getMonthRangeUsingPlusOffset(0);

    let meta = await loadMeta(endISO);

    // Sin datos: refresco inmediato.
    const noSnapshotYet = !meta || meta.used_date === null;

    // Stale: según configuración, refresco inmediato (esto fuerza que SSR sirva siempre datos lo más frescos posible).
    const isStale = Boolean(meta?.is_stale);
    if (noSnapshotYet || (isStale && SYNC_REFRESH_ON_STALE)) {
      if (FKPI_DEBUG) {
        console.log(
          `[FKPIS][SSR] Ejecutando refresh síncrono. noSnapshotYet=${noSnapshotYet} isStale=${isStale}`
        );
      }
      await runSyncRefresh(endISO);
      meta = await loadMeta(endISO); // Reload
    }

    // Lecturas (siempre desde cache, que ahora solo tiene la última snapshot)
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

// ====== API (Polling / Async Refresh) ======
// Devuelve estado actual. Si el cliente manda poke=1 y no hay refresh en curso, encolamos job.
// El worker (inline o externo) refresca la única snapshot sobrescribiendo la tabla.
export const fetchFranchiseKpisPanelData = async (req, res) => {
  const monthOffset = Number(req.query.month) || 0;
  const { endISO } = getMonthRangeUsingPlusOffset(monthOffset);

  try {
    let meta = await loadMeta(endISO);
    const isRefreshing = Boolean(meta?.refreshing);
    const shouldPoke = req.query.poke === "1";

    let enqueued = false;

    // Si no está refrescando y el cliente pide poke, encolamos job
    if (!isRefreshing && shouldPoke) {
      try {
        const r = await pool.query("SELECT intranet.enqueue_kpi_refresh($1::date) AS ok", [endISO]);
        enqueued = Boolean(r.rows?.[0]?.ok);
        if (FKPI_DEBUG) {
          console.log(
            `[FKPIS][API] poke=${shouldPoke} enqueued=${enqueued} enableWorkerInline=${
              process.env.ENABLE_KPI_WORKER !== "1"
            }`
          );
        }
        // Worker inline (si no hay worker externo)
        if (enqueued && process.env.ENABLE_KPI_WORKER !== "1") {
          await pool.query("SELECT intranet.run_kpi_refresh_worker()");
        }
      } catch (err) {
        if (FKPI_DEBUG) console.warn("[FKPIS][API] enqueue/worker error:", err.message);
      }
    }

    // Lectura de datos actuales
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

    // Refrescamos meta tras posible encolado/worker
    meta = await loadMeta(endISO);
    const lastUpdatedAtISO = meta?.as_of ? new Date(meta.as_of).toISOString() : null;

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
      pollMs,
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
    // El parámetro date se mantiene para compatibilidad; en la práctica siempre consultará la única snapshot.
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