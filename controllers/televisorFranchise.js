/**
 * Franchise API Router - Endpoints y utilidades para dashboard de franquicia
 * -------------------------------------------------------------------------
 * Este archivo contiene los endpoints y funciones auxiliares para:
 * - Obtener métricas y totales por periodo (día, mes, año) de franquicia y compañía
 * - Obtener ranking de "top" por día y mes para tablas
 * - Calcular y formatear montos en moneda natural
 * - Extraer y limpiar datos para el frontend
 * - Enviar meta mensual actualizada y premium real del mes de compañía
 */

import express from 'express';
import { pool } from "../config/dbConfig.js";

const router = express.Router();

// --- UTILIDADES DE FORMATO Y LIMPIEZA ---
/**
 * Formatea un monto como moneda natural (ej: $1,234,567)
 */
function formatNaturalCurrency(amount) {
  if (amount == null) return '$0';
  if (typeof amount === 'object' && amount !== null && 'toString' in amount) {
    amount = parseFloat(amount.toString().replace(/[^0-9.-]+/g,"")) || 0;
  }
  return '$' + Number(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

/**
 * Limpia y convierte el premium a número
 */
function cleanPremium(value) {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  return parseFloat(value.toString().replace(/[^0-9.-]+/g, "")) || 0;
}

/**
 * Limpia un array de filas, asegurando número en policies y premium
 */
function cleanRows(rows) {
  return rows.map(row => ({
    ...row,
    policies: Number(row.policies) || 0,
    premium: cleanPremium(row.premium),
    premium_percent: row.premium_percent !== undefined ? Number(row.premium_percent) : null
  }));
}

/**
 * Ejecuta un query seguro (maneja errores, devuelve [] si error)
 */
async function safeQuery(query, params = []) {
  try {
    const { rows } = await pool.query(query, params);
    return rows;
  } catch (error) {
    console.error('DB error:', error.message);
    return [];
  }
}

/**
 * Obtiene la meta mensual actual desde la DB
 */
async function getCurrentMonthlyGoal() {
  try {
    const result = await pool.query(
      `SELECT goal_amount FROM entra.goals ORDER BY changed_at DESC LIMIT 1`
    );
    return result.rows.length > 0 ? Number(result.rows[0].goal_amount) : 10000000;
  } catch (error) {
    console.error("Error fetching monthly goal from DB:", error);
    return 10000000;
  }
}

/**
 * Obtiene premium total de la compañía del mes (para Remaining Goal)
 */
async function getCompanyMonthTotal() {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const initialDateStr = new Date(year, month, 1).toISOString().split('T')[0];
  const finalDateStr = new Date(year, month + 1, 0).toISOString().split('T')[0];
  let rows = [];
  try {
    rows = await pool.query(
      'SELECT * FROM intranet.dashboard_sales_month_total_by_type_tkg($1, $2)',
      [initialDateStr, finalDateStr]
    );
  } catch (err) {
    rows = await pool.query(
      'SELECT * FROM intranet.dashboard_sales_month_total_by_type($1, $2)',
      [initialDateStr, finalDateStr]
    );
  }
  // Busca el row 'Total'
  let row = rows.rows.find(r => 
    (r.business_type || r.businesstype || r.type || '').toString().toLowerCase() === 'total'
  ) || rows.rows[0];
  let premium = row?.premium ?? row?.total_premium ?? row?.gross_premium ?? row?.amount ?? 0;
  if (typeof premium === 'string') premium = parseFloat(premium.replace(/[^0-9.-]+/g, "")) || 0;
  if (typeof premium !== 'number') premium = Number(premium) || 0;
  return premium;
}

// --- API: SUMMARY (meta mensual y premium compañía) ---
/**
 * Devuelve las métricas, meta mensual y premium real del mes (para frontend JS)
 */
router.get('/api/franchise/summary', async (req, res) => {
  const inputDate = req.query.date || new Date().toISOString().split('T')[0];
  try {
    const summaryRows = await safeQuery(
      'SELECT * FROM intranet.dashboard_franchise_company_business_types_periods($1)', [inputDate]
    );
    const monthlyGoal = await getCurrentMonthlyGoal();
    const companyMonthPremium = await getCompanyMonthTotal(); // premium real del mes
    res.json({
      summary: summaryRows,
      monthly_goal: monthlyGoal,
      companyMonthPremium // número real
    });
  } catch (error) {
    res.status(500).json({ error: 'Summary fetch failed', details: error.message });
  }
});

// --- RENDER: Vista EJS con totales y métricas ---
/**
 * Renderiza la vista televisorFranquicies con métricas, top y totales
 */
router.get('/api/franchise/render', async (req, res) => {
  const inputDate = req.query.date || new Date().toISOString().split('T')[0];
  try {
    const summaryRows = await safeQuery(
      'SELECT * FROM intranet.dashboard_franchise_company_business_types_periods($1)', [inputDate]
    );
    const topDayRows = await safeQuery(
      'SELECT * FROM intranet.dashboard_franchise_new_business_by_day($1)', [inputDate]
    );
    const topMonthRows = await safeQuery(
      'SELECT * FROM intranet.dashboard_franchise_new_business_by_month_with_percent($1)', [inputDate]
    );

    function get(period, type) {
      return summaryRows.find(r => r.period === period && r.business_type === type) || { policies: 0, premium: 0 };
    }

    const cleanTopDayRows = cleanRows(topDayRows);
    const cleanTopMonthRows = cleanRows(topMonthRows);

    const topDayTotalPolicies = cleanTopDayRows.reduce((acc, row) => acc + row.policies, 0);
    const topDayTotalPremium = cleanTopDayRows.reduce((acc, row) => acc + row.premium, 0);
    const topMonthTotalPolicies = cleanTopMonthRows.reduce((acc, row) => acc + row.policies_current, 0);
    const topMonthTotalPremium = cleanTopMonthRows.reduce((acc, row) => acc + row.premium_current, 0);

    const monthlyGoal = await getCurrentMonthlyGoal();
    const companyMonthPremium = await getCompanyMonthTotal();

    res.render('televisorFranquicies', {
      date: inputDate,
      summary: summaryRows,
      topDay: cleanTopDayRows,
      topMonth: cleanTopMonthRows,
      topDayTotalPolicies,
      topDayTotalPremium: formatNaturalCurrency(topDayTotalPremium),
      topMonthTotalPolicies,
      topMonthTotalPremium: formatNaturalCurrency(topMonthTotalPremium),
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
      timestamp: new Date().toISOString(),
      agency: "Franchise",

      // DÍA
      ct_nb_prem: formatNaturalCurrency(get("Día", "New Business").premium),
      ct_nb_pol: get("Día", "New Business").policies,
      ct_rn_prem: formatNaturalCurrency(get("Día", "Renewal").premium),
      ct_rn_pol: get("Día", "Renewal").policies,
      ct_rw_prem: formatNaturalCurrency(get("Día", "Rewrite").premium),
      ct_rw_pol: get("Día", "Rewrite").policies,
      ct_tot_prem: formatNaturalCurrency(get("Día", "Total").premium),
      ct_tot_pol: get("Día", "Total").policies,

      // MES
      cm_nb_prem: formatNaturalCurrency(get("Mes", "New Business").premium),
      cm_nb_pol: get("Mes", "New Business").policies,
      cm_rn_prem: formatNaturalCurrency(get("Mes", "Renewal").premium),
      cm_rn_pol: get("Mes", "Renewal").policies,
      cm_rw_prem: formatNaturalCurrency(get("Mes", "Rewrite").premium),
      cm_rw_pol: get("Mes", "Rewrite").policies,
      cm_tot_prem: formatNaturalCurrency(get("Mes", "Total").premium),
      cm_tot_pol: get("Mes", "Total").policies,

      // AÑO
      cy_nb_prem: formatNaturalCurrency(get("Año", "New Business").premium),
      cy_nb_pol: get("Año", "New Business").policies,
      cy_rn_prem: formatNaturalCurrency(get("Año", "Renewal").premium),
      cy_rn_pol: get("Año", "Renewal").policies,
      cy_rw_prem: formatNaturalCurrency(get("Año", "Rewrite").premium),
      cy_rw_pol: get("Año", "Rewrite").policies,
      cy_tot_prem: formatNaturalCurrency(get("Año", "Total").premium),
      cy_tot_pol: get("Año", "Total").policies,

      monthly_goal: monthlyGoal,
      monthly_goal_formatted: formatNaturalCurrency(monthlyGoal),
      companyMonthPremium // Enviado al frontend para Remaining Goal, es número
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// --- API: TOP DAY & TOP MONTH para DataTables ---
/**
 * Devuelve los rankings de top día y mes para tablas, con totales
 */
router.get('/api/franchise/top', async (req, res) => {
  const inputDate = req.query.date || new Date().toISOString().split('T')[0];
  try {
    const topDayRows = await safeQuery(
      'SELECT * FROM intranet.dashboard_franchise_new_business_by_day($1)', [inputDate]
    );
    const topMonthRows = await safeQuery(
      'SELECT * FROM intranet.dashboard_franchise_new_business_by_month_with_percent($1)', [inputDate]
    );
    const cleanTopDayRows = cleanRows(topDayRows);
    const cleanTopMonthRows = cleanRows(topMonthRows);

    const topDayTotalPolicies = cleanTopDayRows.reduce((acc, row) => acc + row.policies, 0);
    const topDayTotalPremium = cleanTopDayRows.reduce((acc, row) => acc + row.premium, 0);

    const topMonthTotalPolicies = cleanTopMonthRows.reduce((acc, row) => acc + (row.policies_current || 0), 0);
    const topMonthTotalPremium = cleanTopMonthRows.reduce((acc, row) => acc + (row.premium_current || 0), 0);

    res.json({
      topDay: cleanTopDayRows,
      topMonth: cleanTopMonthRows,
      topDayTotalPolicies,
      topDayTotalPremium: formatNaturalCurrency(topDayTotalPremium),
      topMonthTotalPolicies,
      topMonthTotalPremium: formatNaturalCurrency(topMonthTotalPremium)
    });
  } catch (error) {
    res.status(500).json({ error: 'Top fetch failed', details: error.message });
  }
});

export default router;