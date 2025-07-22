/**
 * Televisor Controller - API y utilidades para dashboard de sucursales/franquicia
 * ------------------------------------------------------------------------------
 * Este archivo contiene funciones para obtener, formatear y servir datos de métricas
 * y ticker para el dashboard "televisor". Incluye:
 * - Utilidades de formato de moneda y enteros
 * - Cálculo de metas y porcentajes por sucursal
 * - Funciones para obtener totales diarios/mensuales de agencia y compañía
 * - Funciones para obtener datos de CSR por día/mes
 * - SafeQuery para manejar excepciones de Postgres
 * - API principal para el dashboard y ticker
 * - Renderizado de vista EJS
 */

import { pool } from "../config/dbConfig.js";

// --- Metas de New Business por sucursal ---
const NB_GOALS = {
  "Headquarters": 47000,
  "Hialeah": 14000,
  "Bent Tree": 10000,
  "Total": 75000,
  "GTF-110 Homestead": 30000
};

// --- Utilidades de formato ---
// Premium natural: $X,XXX,XXX (sin decimales, separador de miles)
function formatNaturalCurrency(num) {
  num = parseFloat(num) || 0;
  return `$${num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

// Premium abreviado: $1.2M, $234K, $980
function formatShortCurrency(num) {
  num = parseFloat(num) || 0;
  if (num >= 1000000) return `$${(num/1000000).toFixed(1)}M`;
  if (num >= 1000) return `$${(num/1000).toFixed(1)}K`;
  return formatNaturalCurrency(num);
}

/**
 * Genera las líneas para el ticker de noticias según sucursal y metas.
 * Ejemplo: "Headquarters NB $47K / $32.5K / 69.1%"
 */
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
      const value = row ? (parseFloat(row.total_premium.toString().replace(/[^0-9.-]+/g, "")) || 0) : 0;
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

/**
 * Endpoint principal para ticker de noticias.
 * Devuelve metas y avances por sucursal.
 */
export const getNewsTicker = async (req, res) => {
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
          locationAlias = rows[0].alias || rows[0].location_name || "";
        } else {
          locationAlias = rows[0].alias || rows[0].location_name || "";
        }
      }
    }
    const params = locationId ? [inputDate, locationId] : [inputDate, null];
    const tickerRows = await safeQuery('SELECT * FROM intranet.get_corporate_nb_sales_by_date($1, $2)', params);
    const isCorporate = locationType === 1;
    const tickerLines = getTickerLines(tickerRows, isCorporate, locationAlias);
    res.json({ tickerLines });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};

// --- Premium natural: miles separados por coma ---
function formatNaturalPremium(amount) {
  if (amount == null) return '$0';
  if (typeof amount === 'object' && amount !== null && 'toString' in amount) {
    amount = parseFloat(amount.toString().replace(/[^0-9.-]+/g,"")) || 0;
  }
  return `$${Number(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

/**
 * Busca el total row (premium y policies) en un array de resultados.
 * Si no existe, usa el primero.
 */
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
 * Ejecuta un query seguro (maneja errores, devuelve [] si error)
 * @param {string} query
 * @param {Array} params
 * @returns {Promise<Array>}
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
 * Devuelve el tipo de location (1=corporate, 2/4=sucursal)
 * @param {number} locationId
 * @returns {Promise<number>}
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

/**
 * Obtiene el total diario para la agencia (location o corporate)
 */
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

/**
 * Obtiene el total mensual para la agencia (location o corporate)
 */
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

/**
 * Obtiene total diario de la compañía.
 */
async function getCompanyTodayTotal() {
  const rows = await safeQuery('SELECT * FROM intranet.dashboard_company_today');
  return getTotalRow(rows);
}

/**
 * Obtiene total mensual de la compañía.
 */
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

/**
 * Obtiene filas de CSR por ubicación y rango de fechas.
 */
async function getCSRRows(locationId, startDate, endDate) {
  if (!locationId) return [];
  return await safeQuery(
    'SELECT * FROM intranet.dashboard_csr_nb_location($1, $2, $3)',
    [startDate, endDate, locationId]
  );
}

/**
 * Calcula los totales de CSR para hoy y mes.
 */
async function getCSRDataTotals(locationId) {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const initialDateStr = new Date(year, month, 1).toISOString().split('T')[0];
  const finalDateStr = new Date(year, month + 1, 0).toISOString().split('T')[0];
  const todayDateStr = today.toISOString().split('T')[0];

  const csrTodayRows = await safeQuery(
    'SELECT * FROM intranet.dashboard_csr_nb_location($1, $2, $3)', [todayDateStr, todayDateStr, locationId]
  );
  const csrMonthRows = await safeQuery(
    'SELECT * FROM intranet.dashboard_csr_nb_location($1, $2, $3)', [initialDateStr, finalDateStr, locationId]
  );

  const csrTodayTotals = csrTodayRows.reduce((acc, curr) => {
    let premium = typeof curr.premium === 'string'
      ? parseFloat(curr.premium.replace(/[^0-9.-]+/g, "")) || 0
      : Number(curr.premium) || 0;
    let policies = Number(curr.policies) || 0;
    acc.premium += premium;
    acc.policies += policies;
    return acc;
  }, { premium: 0, policies: 0 });

  const csrMonthTotals = csrMonthRows.reduce((acc, curr) => {
    let premium = typeof curr.premium === 'string'
      ? parseFloat(curr.premium.replace(/[^0-9.-]+/g, "")) || 0
      : Number(curr.premium) || 0;
    let policies = Number(curr.policies) || 0;
    acc.premium += premium;
    acc.policies += policies;
    return acc;
  }, { premium: 0, policies: 0 });

  return {
    csrToday: {
      premium: formatNaturalPremium(csrTodayTotals.premium),
      policies: csrTodayTotals.policies
    },
    csrMonth: {
      premium: formatNaturalPremium(csrMonthTotals.premium),
      policies: csrMonthTotals.policies
    }
  };
}

// --- API principal para televisor (dashboard) ---
export const getTelevisorData = async (req) => {
  const locationId = req.query.location_id ? parseInt(req.query.location_id) : null;
  try {
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
      csrTotals,
      csrTodayRows,
      csrMonthRows
    ] = await Promise.all([
      getAgencyTodayTotal(locationId, locationType),
      getAgencyMonthTotal(locationId, locationType),
      getCompanyTodayTotal(),
      getCompanyMonthTotal(),
      getCSRDataTotals(locationId),
      getCSRRows(locationId, todayDateStr, todayDateStr),
      getCSRRows(locationId, initialDateStr, finalDateStr)
    ]);

    return {
      today: {
        location: {
          premium: formatNaturalPremium(agencyToday.premium),
          policies: Number(agencyToday.policies) || 0
        },
        company: {
          premium: formatNaturalPremium(companyToday.premium),
          policies: Number(companyToday.policies) || 0
        },
        csr: csrTotals.csrToday
      },
      month: {
        location: {
          premium: formatNaturalPremium(agencyMonth.premium),
          policies: Number(agencyMonth.policies) || 0
        },
        company: {
          premium: formatNaturalPremium(companyMonth.premium),
          policies: Number(companyMonth.policies) || 0
        },
        csr: csrTotals.csrMonth
      },
      csrToday: csrTodayRows,
      csrMonth: csrMonthRows,
      locationAlias,
      locationType,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return {
      error: 'Internal server error',
      details: error.message
    };
  }
};

/**
 * Renderiza la vista EJS para mostrar totales en el dashboard.
 */
export const televisorTotals = async (req, res) => {
  const monthlyGoal = 10000000;
  const monthlyGoalFormatted = formatNaturalPremium(monthlyGoal);
  res.render('televisorTotals', {
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