import { pool } from "../config/dbConfig.js";

// Mapeo de tipo de ubicación
const typeMap = {
  1: "Corporate",
  2: "Franchise",
  4: "Independent Agent"
};

// Formateo de moneda robusto para cualquier entrada de SQL
function formatCurrency(amount) {
  if (amount == null) amount = 0;
  if (typeof amount === 'string') {
    // Quita todo excepto números y punto decimal
    amount = amount.replace(/[^0-9.]/g, '');
    // Elimina la parte decimal, si existe
    amount = amount.split('.')[0];
    amount = parseInt(amount, 10);
  }
  if (isNaN(amount) || amount == null) amount = 0;
  return amount.toLocaleString('en-US', { 
    style: 'currency', 
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });
}

// Procesa los datos de los paneles
function processPanelData(rows) {
  const result = {
    nb_prem: '$0', nb_pol: 0,
    rn_prem: '$0', rn_pol: 0,
    rw_prem: '$0', rw_pol: 0,
    tot_prem: '$0', tot_pol: 0
  };
  if (rows.length >= 4) {
    result.nb_prem = rows[0]?.premium ? formatCurrency(rows[0].premium) : '$0';
    result.nb_pol = rows[0]?.policies || 0;
    result.rn_prem = rows[1]?.premium ? formatCurrency(rows[1].premium) : '$0';
    result.rn_pol = rows[1]?.policies || 0;
    result.rw_prem = rows[2]?.premium ? formatCurrency(rows[2].premium) : '$0';
    result.rw_pol = rows[2]?.policies || 0;
    result.tot_prem = rows[3]?.premium ? formatCurrency(rows[3].premium) : '$0';
    result.tot_pol = rows[3]?.policies || 0;
  }
  return result;
}

// Suma premium y policies de agencies
function getTotalAgencies(agencyRanking) {
  let totalPremium = 0;
  let totalPolicies = 0;
  agencyRanking.forEach(a => {
    let prem = a.premium;
    if (typeof prem === 'string') {
      prem = prem.replace(/[^0-9.]/g, '');
      prem = prem.split('.')[0];
      prem = parseInt(prem, 10);
    }
    totalPremium += (prem || 0);
    totalPolicies += (Number(a.policies) || 0);
  });
  return {
    premium: formatCurrency(totalPremium),
    policies: totalPolicies
  };
}

// Vista principal de la agencia
async function agency(req, res) {
  try {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const firstDayISO = firstDay.toISOString().split('T')[0];
    const todayISO = today.toISOString().split('T')[0];

    let panelToday = processPanelData([]);
    let panelMonth = processPanelData([]);
    let panelCompanyToday = processPanelData([]);
    let panelCompanyMonth = processPanelData([]);
    let agency_name = "Agency";
    let location_type = 1;
    let agencyRanking = [];

    if (req.user) {
      const userId = req.user.user_id || req.user.id;
      const userQuery = `
        SELECT u.user_id, u.display_name, u.job_title, u.location_id, l.location_type, l.alias, lt.location_type as location_type_name
        FROM entra.users u
        JOIN qq.locations l ON u.location_id = l.location_id
        JOIN admin.location_types lt ON l.location_type = lt.location_type_id
        WHERE u.user_id = $1
      `;
      const { rows: userRows } = await pool.query(userQuery, [userId]);
      if (userRows.length) {
        const user = userRows[0];
        location_type = user.location_type;

        if (user.location_type !== 1) {
          agency_name = user.alias;
          try {
            const production = (await pool.query(
              `SELECT * FROM intranet.dashboard_location_daily($1)`,
              [user.location_id]
            )).rows;
            panelToday = processPanelData(production);
          } catch (error) {
            console.error('Error en dashboard_location_daily:', error);
          }

          try {
            const production = (await pool.query(
              `SELECT * FROM intranet.dashboard_location_month($1, $2, $3)`,
              [firstDayISO, todayISO, user.location_id]
            )).rows;
            panelMonth = processPanelData(production);
          } catch (error) {
            console.error('Error en dashboard_location_month:', error);
          }
        } else {
          agency_name = "Corporate";
          try {
            const corporateTodayRows = (await pool.query('SELECT * FROM intranet.corporate_today')).rows;
            panelToday = processPanelData(corporateTodayRows);
          } catch (error) {
            console.error('Error en corporate_today:', error);
          }

          try {
            const corporateMonthRows = (await pool.query('SELECT * FROM intranet.corporate_month')).rows;
            panelMonth = processPanelData(corporateMonthRows);
          } catch (error) {
            console.error('Error en corporate_month:', error);
          }
        }
      }
    }

    try {
      const companyTodayRows = (await pool.query(`SELECT * FROM intranet.dashboard_company_today`)).rows;
      panelCompanyToday = processPanelData(companyTodayRows);
    } catch (error) {
      console.error('Error en dashboard_company_today:', error);
    }

    try {
      let companyMonthRows;
      try {
        companyMonthRows = (await pool.query(
          `SELECT * FROM intranet.dashboard_sales_month_total_by_type_tkg($1, $2)`,
          [firstDayISO, todayISO]
        )).rows;
      } catch (err) {
        companyMonthRows = (await pool.query(
          `SELECT * FROM intranet.dashboard_sales_month_total_by_type($1, $2)`,
          [firstDayISO, todayISO]
        )).rows;
      }
      panelCompanyMonth = processPanelData(companyMonthRows);
    } catch (altErr) {
      console.error('Error en funciones mensuales de compañía:', altErr);
    }

    // --- CSR RANKING: TOP 3 CSR ---
    let csrRanking = [];
    let carriersByCsr = [];
    try {
      const { rows } = await pool.query(`
        SELECT csr, policies, premium, id_user, location
        FROM intranet.agency_csr_last_week
        ORDER BY premium DESC
        LIMIT 3
      `);
      csrRanking = rows;

      // Para cada CSR, consulta el Top 5 de carriers de esa semana
      const carrierProms = csrRanking.map(csr =>
        pool.query(
          `SELECT id_company, carrier, policies, premium 
           FROM intranet.agency_carriers_last_week_franchise($1)`,
          [csr.id_user]
        ).then(result => result.rows)
      );
      carriersByCsr = await Promise.all(carrierProms);
    } catch (error) {
      console.error('Error en CSR Ranking:', error);
    }

    // Formateo de premium para CSR carriers también, si quieres:
    const csrRankingWithCarriers = csrRanking.map((csr, idx) => ({
      ...csr,
      premium: formatCurrency(csr.premium),
      carriers: (carriersByCsr[idx] || []).map(carrier => ({
        ...carrier,
        premium: formatCurrency(carrier.premium)
      })),
      imageUrl: `/img/illustrations/csr/${csr.id_user}.png`,
      defaultImage: '/img/illustrations/csr/default.png'
    }));

    // TOTAL DAILY (de la compañía) 
    let totalDailyData = { premium: "$0", policies: "0" };
    try {
      const { rows } = await pool.query(`
        SELECT premium, policies 
        FROM intranet.agency_company_today
        WHERE business_type = 'Total'
      `);
      totalDailyData = rows.length > 0 ? rows[0] : totalDailyData;
      totalDailyData.premium = formatCurrency(totalDailyData.premium);
    } catch (error) {
      console.error('Error en totalDaily:', error);
    }

    //  AGENT RANKING (ranking de agencias) 
    try {
      const { rows } = await pool.query(`
        SELECT id_location, location, policies, premium, percent
        FROM intranet.agency_dashboard_agencies
        ORDER BY premium DESC
        LIMIT 50
      `);
      agencyRanking = rows;
    } catch (error) {
      console.error('Error en agent ranking:', error);
    }

    // FORMATEA PREMIUM DE agencyRanking
    agencyRanking = agencyRanking.map(a => ({
      ...a,
      premium: formatCurrency(a.premium)
    }));

    // --- SUMA TOTAL DE LAS AGENCIAS (para Agencies Today header) ---
    const totalAgencies = getTotalAgencies(agencyRanking);

    // --- TOTAL MONTHLY (ventas totales de la compañía del mes) ---
    let totalMonthlyData = { premium: "$0", policies: 0 };
    try {
      const { rows } = await pool.query(`
        SELECT premium, policies FROM intranet.nbtv_total_sales_month
      `);
      totalMonthlyData = rows.length > 0 ? rows[0] : totalMonthlyData;
      totalMonthlyData.premium = formatCurrency(totalMonthlyData.premium);
    } catch (error) {
      console.error('Error en totalMonthly:', error);
    }

    //  TOTAL CARRIERS (ventas totales de la compañía del mes) 
    let carrierRanking = [];
    try {
      const { rows } = await pool.query(`
        SELECT carrier_name, policies, premium, percent_premium_growth, percent_policies_growth
        FROM intranet.carrier_dashboard_sales
        ORDER BY premium DESC
      `);
      carrierRanking = rows;
    } catch (error) {
      console.error('Error en carrier ranking:', error);
    }

    // FORMATEA PREMIUM DE carrierRanking
    carrierRanking = carrierRanking.map(c => ({
      ...c,
      premium: formatCurrency(c.premium)
    }));

    res.render('agency', {
      panelToday,
      panelMonth,
      panelCompanyToday,
      panelCompanyMonth,
      location_type,
      agency_name,
      csrRanking: csrRankingWithCarriers,
      agencyRanking,
      totalAgencies,
      totalDaily: totalDailyData,
      totalMonthly: totalMonthlyData,
      carrierRanking,
      excludeDashboardCRM: true
    });
  } catch (err) {
    console.error('Error en agencyDashboard:', err);
    res.status(500).send("Error en el servidor");
  }
}

// API para métricas del dashboard de agencia (JSON)
async function agencyDashboardMetrics(req, res) {
  try {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const firstDayISO = firstDay.toISOString().split('T')[0];
    const todayISO = today.toISOString().split('T')[0];

    let locationId = null;
    let location_type = 1;
    let agency_name = 'Agency';

    if (req.user) {
      const userId = req.user.user_id || req.user.id;
      const userQuery = `
        SELECT u.user_id, u.display_name, u.job_title, u.location_id, l.location_type, l.alias
        FROM entra.users u
        JOIN qq.locations l ON u.location_id = l.location_id
        WHERE u.user_id = $1
      `;
      const { rows: userRows } = await pool.query(userQuery, [userId]);
      if (userRows.length) {
        locationId = userRows[0].location_id;
        location_type = userRows[0].location_type;
        agency_name = userRows[0].alias || 'Agency';
      }
    }

    // Paneles en paralelo
    const [panelToday, panelMonth, panelCompanyToday, panelCompanyMonth] = await Promise.all([
      (async () => {
        if (!locationId) return processPanelData([]);
        try {
          const result = await pool.query(
            'SELECT * FROM intranet.dashboard_location_daily($1)',
            [locationId]
          );
          return processPanelData(result.rows);
        } catch (error) {
          console.error('Error en dashboard_location_daily:', error);
          return processPanelData([]);
        }
      })(),
      (async () => {
        if (!locationId) return processPanelData([]);
        try {
          const result = await pool.query(
            `SELECT * FROM intranet.dashboard_location_month($1, $2, $3)`,
            [firstDayISO, todayISO, locationId]
          );
          return processPanelData(result.rows);
        } catch (error) {
          console.error('Error en dashboard_location_month:', error);
          return processPanelData([]);
        }
      })(),
      (async () => {
        try {
          const result = await pool.query('SELECT * FROM intranet.dashboard_company_today');
          return processPanelData(result.rows);
        } catch (error) {
          console.error('Error en dashboard_company_today:', error);
          return processPanelData([]);
        }
      })(),
      (async () => {
        try {
          const result = await pool.query(
            `SELECT * FROM intranet.dashboard_sales_month_total_by_type_tkg($1, $2)`,
            [firstDayISO, todayISO]
          );
          return processPanelData(result.rows);
        } catch (err) {
          try {
            const result = await pool.query(
              `SELECT * FROM intranet.dashboard_sales_month_total_by_type($1, $2)`,
              [firstDayISO, todayISO]
            );
            return processPanelData(result.rows);
          } catch (altErr) {
            console.error('Ambas funciones fallaron:', altErr);
            return processPanelData([]);
          }
        }
      })()
    ]);

    // Suma de agencias
    let agencyRanking = [];
    try {
      const { rows } = await pool.query(`
        SELECT id_location, location, policies, premium, percent
        FROM intranet.agency_dashboard_agencies
        ORDER BY premium DESC
        LIMIT 50
      `);
      agencyRanking = rows;
    } catch (error) {
      console.error('Error en agent ranking (API):', error);
    }

    // FORMATEA PREMIUM DE agencyRanking
    agencyRanking = agencyRanking.map(a => ({
      ...a,
      premium: formatCurrency(a.premium)
    }));

    const totalAgencies = getTotalAgencies(agencyRanking);

    res.json({
      user: req.user,
      panelToday,
      panelMonth,
      panelCompanyToday,
      panelCompanyMonth,
      location_type,
      agency_name,
      agencyRanking,
      totalAgencies
    });
  } catch (err) {
    console.error('Error en /api/agency-dashboard-metrics:', err);
    res.status(500).json({ error: "Error en el servidor" });
  }
}

export {
  agency,
  agencyDashboardMetrics
};