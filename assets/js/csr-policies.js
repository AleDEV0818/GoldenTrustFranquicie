/**
 * Script para la tabla de "Policies by CSR" con DataTables y filtros dinámicos
 * ----------------------------------------------------------------------------
 * Este script inicializa la tabla de pólizas de CSR, lee parámetros y filtros desde la URL,
 * formatea datos (fechas, premium, enteros, tipo de grupo), arma la URL AJAX para DataTables,
 * y gestiona el resumen y actualizaciones automáticas.
 *
 * Características:
 * - Lee parámetros y filtros desde el querystring.
 * - Formatea fechas y números de manera amigable.
 * - Actualiza resumen de pólizas y suma de primas.
 * - Recarga la tabla automáticamente y actualiza la hora.
 * - Exporta la tabla en CSV.
 *
 */

function getQueryParam(key) {
  // Devuelve el valor del parámetro "key" del querystring de la URL
  const params = new URLSearchParams(window.location.search);
  return params.get(key);
}

function parseJSONParam(key, fallback) {
  // Intenta parsear el parámetro "key" del querystring como JSON (array)
  try {
    const val = getQueryParam(key);
    if (!val || val === "null" || val === "undefined") return fallback;
    const parsed = JSON.parse(val);
    if (!Array.isArray(parsed)) return fallback;
    return parsed;
  } catch (e) {
    return fallback;
  }
}

// Formatea una fecha en formato MM/DD/YYYY (estilo US)
function formatUSDate(dateStr) {
  if (!dateStr) return '';
  var d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  var month = (d.getMonth() + 1).toString().padStart(2, '0');
  var day = d.getDate().toString().padStart(2, '0');
  var year = d.getFullYear();
  return `${month}/${day}/${year}`;
}

// Devuelve el label completo para el tipo de grupo (CSR, Agent, Producer)
function getGroupByTypeFullLabel(type) {
  if (!type) return '';
  const l = type.toString().toLowerCase();
  if (l === 'c' || l === 'csr') return 'CSR';
  if (l === 'a' || l === 'agent') return 'Agent';
  if (l === 'p' || l === 'producer') return 'Producer';
  return type;
}

// Formatea números enteros separados por comas (miles)
function formatIntegerWithCommas(num) {
  return Number(num || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// Formatea la prima como $1,356,957 (sólo enteros, sin decimales)
function formatPremium(value) {
  let num = 0;
  if (typeof value === "number") {
    num = value;
  } else if (typeof value === "string") {
    let clean = value.replace(/[^0-9.]/g, '');
    num = parseInt(clean, 10);
    if (isNaN(num)) num = 0;
  }
  if (!num || isNaN(num)) num = 0;
  return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

$(document).ready(function() {
  // Obtiene el tipo de agrupamiento y el ID desde la URL
  const pathParts = window.location.pathname.split('/');
  let group_by_type = decodeURIComponent(pathParts[pathParts.length - 2]);
  const group_id = decodeURIComponent(pathParts[pathParts.length - 1]); // ID único

  // Lee alias desde el querystring si existe
  const group_alias = getQueryParam('alias') || '';

  // Muestra el título correcto arriba de la tabla
  if (group_by_type && group_alias) {
    $('#csr-policies-title').text(`Policies for ${getGroupByTypeFullLabel(group_by_type)}: ${group_alias}`);
  }

  // Lee los filtros del querystring (enviados desde el ranking)
  let initialLocations = parseJSONParam('locations', []);
  // Si es franquicia o agente independiente y no hay locations, fuerza el location por defecto
  if (
    (window.IS_FRANCHISE === "true" || window.IS_INDEPENDENT_AGENT === "true") &&
    (!initialLocations || !Array.isArray(initialLocations) || initialLocations.length === 0)
  ) {
    let locId = window.FRANCHISE_LOCATION_ID;
    if (
      locId !== undefined &&
      locId !== null &&
      locId !== "" &&
      locId !== "null" &&
      locId !== "undefined"
    ) {
      initialLocations = [Number(locId)];
    }
  }

  const initialBusinessTypes = parseJSONParam('business_types', []);
  const initialPolicyStatus = parseJSONParam('policy_status', []);
  const initialLines = parseJSONParam('lines', []);
  const initialDateColumn = getQueryParam('date_column') || 'effective_date';
  const initialDateStart = getQueryParam('date_start') || null;
  const initialDateEnd = getQueryParam('date_end') || null;

  let linesParam = [];
  if (Array.isArray(initialLines) && initialLines.length > 0) {
    linesParam = initialLines;
  }

  // Arma la URL AJAX para el DataTable (parámetros en la ruta, filtros en el querystring)
  const ajaxUrl = `/users/statistics/csr-policies/data/${encodeURIComponent(group_by_type)}/${encodeURIComponent(group_id)}`;

  // Inicializa DataTable
  const table = $('#csr-policies-table').DataTable({
    ajax: {
      url: ajaxUrl,
      dataSrc: 'data',
      data: function (d) {
        d.main_location_ids = JSON.stringify(Array.isArray(initialLocations) ? initialLocations : []);
        d.in_business_types = JSON.stringify(Array.isArray(initialBusinessTypes) ? initialBusinessTypes : []);
        d.in_date_column = initialDateColumn;
        d.in_date_start = initialDateStart;
        d.in_date_end = initialDateEnd;
        d.in_policy_status = JSON.stringify(Array.isArray(initialPolicyStatus) ? initialPolicyStatus : []);
        d.in_lines = JSON.stringify(Array.isArray(linesParam) ? linesParam : []);
      }
    },
    columns: [
      { data: 'customer' },
      { data: 'policy_number' },
      { data: 'location_alias' },
      { data: 'business_type' },
      { data: 'carrier' },
      {
        data: 'premium',
        render: function(data) {
          return formatPremium(data);
        }
      },
      { data: 'binder_date', render: function(data) { return formatUSDate(data); }},
      { data: 'effective_date', render: function(data) { return formatUSDate(data); }},
      { data: 'exp_date', render: function(data) { return formatUSDate(data); }},
      { data: 'csr' },
      { data: 'producer' },
      { data: 'agent' },
      { data: 'policy_status' },
      { data: 'product_line' }
    ],
    order: [[0, 'asc']],
    pageLength: 25,
    lengthMenu: [10, 25, 50, 100],
    dom: '<"row align-items-center mb-3"'
         + '<"col-auto"l>'
         + '<"col text-end"B>'
         + '<"col-auto d-flex justify-content-end align-items-center datatable-summary-col">'
         + '>'
         + 't'
         + '<"row mt-3"<"col-sm-12 col-md-5"i><"col-sm-12 col-md-7"p>>',
    buttons: [
      {
        extend: 'csvHtml5',
        text: '<i class="ti ti-file-spreadsheet me-2"></i>Export CSV',
        className: 'btn btn-label-secondary',
        fieldSeparator: ',',
        extension: '.csv'
      }
    ],
    language: {
      emptyTable: "No se encontraron pólizas"
    }
  });

  // Inserta el resumen si falta en el DOM
  function insertSummaryBoxIfNeeded() {
    if (!$('#datatable-summary').length) {
      $('.datatable-summary-col').html(`
        <div id="datatable-summary" class="datatable-summary-highlight">
          <div class="datatable-summary-highlight-content">
            <span id="policy-count">0</span> &nbsp; | &nbsp;  <span id="premium-sum">$0</span>
            &nbsp; | &nbsp; <span id="current-time"></span>
          </div>
        </div>
      `);
    }
  }
  insertSummaryBoxIfNeeded();

  // Actualiza el resumen de la tabla (cantidad y suma de primas)
  function updateTableSummary() {
    let data = table.rows({ search: 'applied' }).data();
    let totalCount = data.length || 0;
    let totalPremium = 0;
    data.each(row => {
      let premiumValue = 0;
      if (typeof row.premium === "number") premiumValue = row.premium;
      else if (typeof row.premium === "string") {
        let clean = row.premium.replace(/[^0-9.]+/g, "");
        premiumValue = parseInt(clean, 10) || 0;
      }
      totalPremium += premiumValue;
    });
    $("#policy-count").text(formatIntegerWithCommas(totalCount));
    $("#premium-sum").text(formatPremium(totalPremium));
  }
  table.on('draw', updateTableSummary);

  table.on('draw', function () {
    insertSummaryBoxIfNeeded();
    updateTableSummary();
  });

  // Recarga la tabla si cambian los filtros (si tienes filtros en el DOM)
  $('#filter-location, #filter-business-type, #filter-policy-status, #filter-lines, #filter-date-column, #filter-date-start, #filter-date-end').on('change', function() {
    table.ajax.reload();
  });

  // Actualiza la tabla y el resumen cada 10 minutos
  setInterval(function() {
    table.ajax.reload();
  }, 10 * 60 * 1000);

  // Actualiza la hora actual cada minuto
  function updateCurrentTime() {
    const now = new Date();
    const hh = now.getHours().toString().padStart(2, '0');
    const mm = now.getMinutes().toString().padStart(2, '0');
    const ss = now.getSeconds().toString().padStart(2, '0');
    $("#current-time").text(`${hh}:${mm}:${ss}`);
  }
  setInterval(updateCurrentTime, 60 * 1000);
  updateCurrentTime(); // Primera vez al cargar
});