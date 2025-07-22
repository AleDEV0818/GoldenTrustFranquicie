import { pool } from "../config/dbConfig.js";

// Utilidad: Trae todas las opciones posibles de cada filtro
async function getAllFilterOptions() {
  const [locations, businessTypes, policyStatus, lines] = await Promise.all([
    pool.query("SELECT location_id FROM qq.locations ORDER BY location_id"),
    pool.query("SELECT DISTINCT business_type FROM qq.policies ORDER BY business_type"),
    pool.query("SELECT DISTINCT policy_status FROM qq.policies ORDER BY policy_status"),
    pool.query("SELECT DISTINCT line FROM admin.lob WHERE line <> 'Other Lines' ORDER BY line")
  ]);
  return {
    locations: locations.rows.map(r => r.location_id),
    businessTypes: businessTypes.rows.map(r => r.business_type),
    policyStatus: policyStatus.rows.map(r => r.policy_status),
    lines: lines.rows.map(r => r.line)
  };
}

// Map de abreviaturas a nombres de tipo válidos para la función de Postgres
const groupByTypeMap = {
  c: "csr",
  a: "agent",
  p: "producer"
};

// Utilidad robusta para formatear premium como $1,356,957 (sin decimales, miles separados por coma)
function formatPremium(value) {
  let num = 0;
  if (typeof value === "number") {
    num = value;
  } else if (typeof value === "string") {
    // Quita todo menos números y punto decimal, solo parte entera
    const clean = value.replace(/[^0-9.]/g, '');
    num = parseInt(clean, 10);
    if (isNaN(num)) num = 0;
  }
  if (!num || isNaN(num)) num = 0;
  return `$${num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

// Renderiza la página de detalle de pólizas por GroupBy (CSR/Agent/Producer), pasando TODOS los filtros posibles
export const renderCsrPolicies = async (req, res) => {
  const { group_by_type, group_name } = req.params;
  const alias = req.query.alias || '';
  const user = req.user;
  const filters = await getAllFilterOptions();

  res.render('csr-policies', {
    group_by_value: group_by_type,
    group_name,
    alias,
    user,
    locations: filters.locations,
    businessTypes: filters.businessTypes,
    policyStatus: filters.policyStatus,
    lines: filters.lines
  });
};

// Devuelve los datos para el DataTable de pólizas por GroupBy (AJAX)
export const fetchCsrPoliciesData = async (req, res) => {
  try {
    const {
      main_location_ids,
      in_business_types,
      in_date_column,
      in_date_start,
      in_date_end,
      in_policy_status,
      in_lines
    } = req.query;
    let { group_by_type, group_name } = req.params;
    const user = req.user;

    group_by_type = groupByTypeMap[group_by_type] || group_by_type;

    let locations = main_location_ids
      ? (typeof main_location_ids === 'string'
        ? JSON.parse(main_location_ids).map(Number)
        : main_location_ids.map(Number))
      : [];

    // Forzar location_id SIEMPRE para franquicia o agente independiente
    if (
      user &&
      user.location_id &&
      (
        user.location_type === 2 || // franquicia
        user.location_type === 4    // independiente
      )
    ) {
      locations = [Number(user.location_id)];
    }

    const businessTypes = in_business_types
      ? (typeof in_business_types === 'string' ? JSON.parse(in_business_types) : in_business_types)
      : [];
    const policyStatus = in_policy_status
      ? (typeof in_policy_status === 'string' ? JSON.parse(in_policy_status) : in_policy_status)
      : [];
    const lines = in_lines
      ? (typeof in_lines === 'string' ? JSON.parse(in_lines) : in_lines)
      : [];

    const dateColumn = in_date_column ?? null;
    const dateStart = (!in_date_start || in_date_start === "") ? null : in_date_start;
    const dateEnd = (!in_date_end || in_date_end === "") ? null : in_date_end;

    const query = `
      SELECT * FROM intranet.stats_policies_by_csr(
        $1::integer[],
        $2::varchar[],
        $3::text,
        $4::date,
        $5::date,
        $6::varchar[],
        $7::varchar[],
        $8::text,
        $9::text
      )
    `;

    const { rows } = await pool.query(query, [
      locations,
      businessTypes,
      dateColumn,
      dateStart,
      dateEnd,
      policyStatus,
      lines,
      group_by_type,
      group_name
    ]);

    // Formatea premium como natural, miles separados por coma, sin decimales
    const formattedRows = rows.map(row => ({
      ...row,
      premium: formatPremium(row.premium)
    }));

    res.json({ data: formattedRows });
  } catch (err) {
    console.error('Error fetching policies by group:', err);
    res.status(500).json({ error: 'Error fetching policies by group' });
  }
};

// Devuelve el resumen global (count y suma de premium) para el resumen arriba de la tabla
export const fetchCsrPoliciesSummary = async (req, res) => {
  try {
    const {
      main_location_ids,
      in_business_types,
      in_date_column,
      in_date_start,
      in_date_end,
      in_policy_status,
      in_lines
    } = req.query;
    let { group_by_type, group_name } = req.params;
    const user = req.user;

    group_by_type = groupByTypeMap[group_by_type] || group_by_type;

    let locations = main_location_ids
      ? (typeof main_location_ids === 'string'
        ? JSON.parse(main_location_ids).map(Number)
        : main_location_ids.map(Number))
      : [];

    if (
      user &&
      user.location_id &&
      (
        user.location_type === 2 || // franquicia
        user.location_type === 4    // independiente
      )
    ) {
      locations = [Number(user.location_id)];
    }

    const businessTypes = in_business_types
      ? (typeof in_business_types === 'string' ? JSON.parse(in_business_types) : in_business_types)
      : [];
    const policyStatus = in_policy_status
      ? (typeof in_policy_status === 'string' ? JSON.parse(in_policy_status) : in_policy_status)
      : [];
    const lines = in_lines
      ? (typeof in_lines === 'string' ? JSON.parse(in_lines) : in_lines)
      : [];

    const dateColumn = in_date_column ?? null;
    const dateStart = (!in_date_start || in_date_start === "") ? null : in_date_start;
    const dateEnd = (!in_date_end || in_date_end === "") ? null : in_date_end;

    const query = `
      SELECT COUNT(*) as count, COALESCE(SUM(premium), 0) as premium
      FROM intranet.stats_policies_by_csr(
        $1::integer[],
        $2::varchar[],
        $3::text,
        $4::date,
        $5::date,
        $6::varchar[],
        $7::varchar[],
        $8::text,
        $9::text
      )
    `;

    const { rows } = await pool.query(query, [
      locations,
      businessTypes,
      dateColumn,
      dateStart,
      dateEnd,
      policyStatus,
      lines,
      group_by_type,
      group_name
    ]);

    // Formatea premium como natural, miles separados por coma, sin decimales
    res.json({
      count: Number(rows[0].count),
      premium: formatPremium(rows[0].premium)
    });
  } catch (err) {
    console.error('Error fetching policies summary by group:', err);
    res.json({ count: 0, premium: formatPremium(0) });
  }
};