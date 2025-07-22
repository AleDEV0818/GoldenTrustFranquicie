/**
 * Televisor Renewed Controller - API y utilidades para dashboard renovado
 * ----------------------------------------------------------------------
 * Este archivo provee la lógica y endpoints para el dashboard tipo "televisor" con métricas, ranking y ticker.
 * Incluye:
 * - Formateo de moneda y abreviaturas amigables
 * - Cálculo de metas y porcentajes de NB por sucursal
 * - Obtención de totales diarios/mensuales para agencia y compañía
 * - Obtención de datos de productores por día/mes
 * - SafeQuery para manejo seguro de consultas
 * - API endpoints para datos principales y ticker
 * - Renderizado de vista EJS con meta mensual
 * 
 * Requiere:
 * - pool de conexión a Postgres
 * - getMonthlyGoal para meta mensual dinámica
 */

import { pool } from "../config/dbConfig.js";
import { getMonthlyGoal } from "./config.js"; // Debe retornar la meta mensual actual

// --- Metas configurables por alias para NB ---
const NB_GOALS = {
  "Headquarters": 47000,
  "Hialeah": 14000,
  "Bent Tree": 10000,
  "Total": 75000,
  "GTF-110 Homestead": 30000
};

// --- Formato moneda natural: $X,XXX,XXX (sin decimales, separador de miles)
function formatNaturalCurrency(num) {
  num = parseFloat(num) || 0;
  return `$${num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

// --- Formato abreviado: $1.2M, $234K, $980 (para ticker y cards)
function formatShortCurrency(num) {
  num = parseFloat(num) || 0;
  if (num >= 1000000) return `$${(num/1000000).toFixed(1)}M`;
  if (num >= 1000) return `$${(num/1000).toFixed(1)}K`;
  return formatNaturalCurrency(num);
}

// --- Ticker generator: genera líneas del ticker con metas y avance NB ---
function getTickerLines(rows, isCorporate, locationAlias = "") {
  if (isCorporate) {
    const order = ['Total', 'Headquarters', 'Hialeah', 'Bent Tree'];
    return order.map(alias => {
      const row = rows.find(r =>
        (r.location_name || '').trim().toLowerCase() === alias.trim().toLowerCase()
      );
      const goalKey = Object.keys(NB_GOALS).find(
        k => k.trim().toLowerCase() === alias.trim().toLowerCase()
      );
      const goal = goalKey ? NB_GOALS[goalKey] : 10000;
      const value = row ? (parseFloat(row.total_premium?.toString().replace(/[^0-9.-]+/g, "")) || 0) : 0;
      const percent = (value / goal * 100) || 0;
      return `${alias} NB ${formatShortCurrency(goal)} / ${formatShortCurrency(value)} / ${percent.toFixed(1)}%`;
    });
  } else {
    let alias = (rows[0]?.location_name || locationAlias || "Sucursal").trim();
    const goalKey = Object.keys(NB_GOALS).find(
      k => k.trim().toLowerCase() === alias.trim().toLowerCase()
    );
    const goal = goalKey ? NB_GOALS[goalKey] : 10000;
    const value = rows[0]?.total_premium
      ? (parseFloat(rows[0].total_premium.toString().replace(/[^0-9.-]+/g, "")) || 0)
      : 0;
    const percent = (value / goal * 100) || 0;
    return [
      `${alias} NB ${formatShortCurrency(goal)} / ${formatShortCurrency(value)} / ${percent.toFixed(1)}%`
    ];
  }
}

// --- Utilidad de formato general (deprecated para premium, solo para goals) ---
function formatCurrency(amount) {
  if (amount == null) return '$0';
  if (typeof amount === 'object' && amount !== null && 'toString' in amount) {
    amount = parseFloat(amount.toString().replace(/[^0-9.-]+/g,"")) || 0;
  }
  return formatNaturalCurrency(amount);
}

// --- Extrae el total de premium y policies de un array de filas ---
function getTotalRow(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { premium: 0, policies: 0 };
  }
  let row = rows.find(r =>
    (r.business_type || r.businesstype || r.type || r.location_name || '').toString().toLowerCase() === 'total'
  ) || rows[0];

  let premium = row.premium ?? row.total_premium ?? row.gross_premium ?? row.amount ?? 0;
  if (typeof premium === 'string') {
    premium = parseFloat(premium.replace(/[^0-9.-]+/g, "")) || 0;
  }
  if (typeof premium !== 'number') premium = Number(premium) || 0;

  let policies = row.policies ?? row.total_policies ?? 0;
  if (typeof policies !== 'number') policies = Number(policies) || 0;

  return {
    premium,
    policies
  };
}

/**
 * Ejecuta un query seguro. Devuelve [] si hay error.
 * @param {string} query
 * @param {Array} params
 */
async function safeQuery(query, params = []) {
  try {
    const { rows } = await pool.query(query, params);
    return rows;
  } catch (error) {
    return [];
  }
}

/**
 * Obtiene el tipo de locación según ID (1=corporate, 2/4=sucursal)
 * @param {number} locationId
 */
async function getLocationType(locationId) {
  if (!locationId) return 1;
  try {
    const result = await safeQuery(
      'SELECT location_type FROM qq.locations WHERE location_id = $1',
      [locationId]
    );
    if (!result.length) return 1;
    return result[0].location_type;
  } catch (error) {
    return 1;
  }
}

// --- Producción diaria/mensual por agencia (corporativo/sucursal) ---
async function getAgencyTodayTotal(locationId, locationType) {
  let rows = [];
  if (locationType === 1) {
    rows = await safeQuery('SELECT * FROM intranet.corporate_today');
  } else {
    rows = await safeQuery(
      'SELECT * FROM intranet.dashboard_location_daily($1)',
      [locationId]
    );
  }
  return getTotalRow(rows);
}
async function getAgencyMonthTotal(locationId, locationType) {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const initialDateStr = new Date(year, month, 1).toISOString().split('T')[0];
  const finalDateStr = new Date(year, month + 1, 0).toISOString().split('T')[0];
  let rows = [];
  if (locationType === 1) {
    rows = await safeQuery('SELECT * FROM intranet.corporate_month');
  } else {
    rows = await safeQuery(
      'SELECT * FROM intranet.dashboard_location_month($1, $2, $3)',
      [initialDateStr, finalDateStr, locationId]
    );
  }
  return getTotalRow(rows);
}

// --- Producción diaria/mensual compañía ---
async function getCompanyTodayTotal() {
  const rows = await safeQuery('SELECT * FROM intranet.dashboard_company_today');
  return getTotalRow(rows);
}
async function getCompanyMonthTotal() {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const initialDateStr = new Date(year, month, 1).toISOString().split('T')[0];
  const finalDateStr = new Date(year, month + 1, 0).toISOString().split('T')[0];
  let rows = [];
  try {
    rows = await safeQuery(
      'SELECT * FROM intranet.dashboard_sales_month_total_by_type_tkg($1, $2)',
      [initialDateStr, finalDateStr]
    );
  } catch (err) {
    rows = await safeQuery(
      'SELECT * FROM intranet.dashboard_sales_month_total_by_type($1, $2)',
      [initialDateStr, finalDateStr]
    );
  }
  return getTotalRow(rows);
}

// --- Datos Producer Detallados (por fecha y location) ---
async function getProducerRows(locationId, startDate, endDate) {
  if (!locationId) return [];
  return await safeQuery(
    'SELECT * FROM intranet.dashboard_producer_rw_location($1, $2, $3)',
    [startDate, endDate, locationId]
  );
}

// --- Datos Producer (solo totales) ---
async function getProducerDataTotals(locationId) {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const initialDateStr = new Date(year, month, 1).toISOString().split('T')[0];
  const finalDateStr = new Date(year, month + 1, 0).toISOString().split('T')[0];
  const todayDateStr = today.toISOString().split('T')[0];

  const producerTodayRows = await safeQuery(
    'SELECT * FROM intranet.dashboard_producer_rw_location($1, $2, $3)', [todayDateStr, todayDateStr, locationId]
  );
  const producerMonthRows = await safeQuery(
    'SELECT * FROM intranet.dashboard_producer_rw_location($1, $2, $3)', [initialDateStr, finalDateStr, locationId]
  );

  const producerTodayTotals = producerTodayRows.reduce((acc, curr) => {
    let premium = typeof curr.premium === 'string'
      ? parseFloat(curr.premium.replace(/[^0-9.-]+/g, "")) || 0
      : Number(curr.premium) || 0;
    let policies = Number(curr.policies) || 0;
    acc.premium += premium;
    acc.policies += policies;
    return acc;
  }, { premium: 0, policies: 0 });

  const producerMonthTotals = producerMonthRows.reduce((acc, curr) => {
    let premium = typeof curr.premium === 'string'
      ? parseFloat(curr.premium.replace(/[^0-9.-]+/g, "")) || 0
      : Number(curr.premium) || 0;
    let policies = Number(curr.policies) || 0;
    acc.premium += premium;
    acc.policies += policies;
    return acc;
  }, { premium: 0, policies: 0 });

  return {
    producerToday: {
      premium: formatNaturalCurrency(producerTodayTotals.premium),
      policies: producerTodayTotals.policies
    },
    producerMonth: {
      premium: formatNaturalCurrency(producerMonthTotals.premium),
      policies: producerMonthTotals.policies
    }
  };
}

// --- API endpoint para la cinta de noticias (ticker) ---
export const getNewsTickerRenewed = async (req, res) => {
  try {
    const locationId = req.query.location_id ? parseInt(req.query.location_id) : null;
    const inputDate = req.query.date || new Date().toISOString().split('T')[0];

    let locationType = 1;
    let locationAlias = "Corporate";
    if (locationId) {
      const rows = await safeQuery('SELECT location_type, alias, location_name FROM qq.locations WHERE location_id = $1', [locationId]);
      if (rows.length) {
        locationType = rows[0].location_type;
        if (locationType === 1) {
          locationAlias = "Corporate";
        } else if (locationType === 2 || locationType === 4) {
          locationAlias = rows[0].alias || rows[0].location_name || "Location";
        } else {
          locationAlias = rows[0].alias || rows[0].location_name || "Location";
        }
      }
    }

    const params = locationId ? [inputDate, locationId] : [inputDate, null];
    const tickerRows = await safeQuery('SELECT * FROM intranet.get_corporate_nb_sales_by_date($1, $2)', params);

    const isCorporate = locationType === 1;
    const tickerLines = getTickerLines(tickerRows, isCorporate, locationAlias);

    res.json({ tickerLines, locationAlias, locationType });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};

// --- API principal para dashboard renovado ---
export const getTelevisorDataRenewed = async (req, res) => {
  const locationId = req.query.location_id ? parseInt(req.query.location_id) : null;
  try {
    let locationType = 1;
    let locationAlias = "Corporate";
    if (locationId) {
      const rows = await safeQuery('SELECT location_type, alias, location_name FROM qq.locations WHERE location_id = $1', [locationId]);
      if (rows.length) {
        locationType = rows[0].location_type;
        if (rows[0].location_type === 1) {
          locationAlias = "Corporate";
        } else if (rows[0].location_type === 2 || rows[0].location_type === 4) {
          locationAlias = rows[0].alias || rows[0].location_name || "Location";
        } else {
          locationAlias = rows[0].alias || rows[0].location_name || "Location";
        }
      }
    }

    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    const initialDateStr = new Date(year, month, 1).toISOString().split('T')[0];
    const finalDateStr = new Date(year, month + 1, 0).toISOString().split('T')[0];
    const todayDateStr = today.toISOString().split('T')[0];

    const [
      agencyToday,
      agencyMonth,
      companyToday,
      companyMonth,
      producerTotals,
      producerTodayRows,
      producerMonthRows
    ] = await Promise.all([
      getAgencyTodayTotal(locationId, locationType),
      getAgencyMonthTotal(locationId, locationType),
      getCompanyTodayTotal(),
      getCompanyMonthTotal(),
      getProducerDataTotals(locationId),
      getProducerRows(locationId, todayDateStr, todayDateStr),
      getProducerRows(locationId, initialDateStr, finalDateStr)
    ]);

    // --- Obtener la meta mensual actualizada ---
    const monthlyGoal = await getMonthlyGoal();

    res.json({
      today: {
        location: {
          premium: formatNaturalCurrency(agencyToday.premium),
          policies: Number(agencyToday.policies) || 0
        },
        company: {
          premium: formatNaturalCurrency(companyToday.premium),
          policies: Number(companyToday.policies) || 0
        },
        producer: producerTotals.producerToday
      },
      month: {
        location: {
          premium: formatNaturalCurrency(agencyMonth.premium),
          policies: Number(agencyMonth.policies) || 0
        },
        company: {
          premium: formatNaturalCurrency(companyMonth.premium),
          policies: Number(companyMonth.policies) || 0
        },
        producer: producerTotals.producerMonth
      },
      csrToday: producerTodayRows,
      csrMonth: producerMonthRows,
      locationAlias,
      locationType,
      timestamp: new Date().toISOString(),
      monthly_goal: monthlyGoal // Meta mensual dinámica
    });
  } catch (error) {
    res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  }
};

// --- Renderizado de vista EJS para totales / goal ---
export const televisorTotalsRenewed = async (req, res) => {
  const monthlyGoal = await getMonthlyGoal(); // Meta mensual dinámica en la vista
  const monthlyGoalFormatted = formatNaturalCurrency(monthlyGoal);
  res.render('televisorTotalsRenewed', {
    locationAlias: "Corporate",
    monthlyGoalFormatted,
    monthlyGoal,
    currentDate: new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }),
    currentTime: new Date().toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    }),
    refreshInterval: 600000
  });
};