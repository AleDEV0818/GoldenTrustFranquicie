/**
  * -----------------------------------------------
 * Este script gestiona el dashboard de pólizas, incluyendo:
 * - Formateo de datos (fechas, números, currency)
 * - Inicialización de filtros y selectores
 * - Manejo de select especial para "Corporate"
 * - Inicialización de DataTable con resumen dinámico
 * - Búsqueda avanzada con filtros y rango de fechas
 * - Actualización de la tabla y el resumen
 */

// ---------- UTILIDADES DE FORMATO ----------

function formatUSDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d)) return '';
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  const year = d.getFullYear();
  return `${month}/${day}/${year}`;
}

function formatInteger(value) {
  return Number(value || 0).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });
}

function formatCurrency(value) {
  if (typeof value === "string") {
    let clean = value.replace(/[^0-9]/g, '');
    return '$' + Number(clean || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }
  return '$' + Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// INICIALIZACIÓN DEL DASHBOARD
$(document).ready(function () {
  // Lista de IDs de locations que se seleccionan automáticamente si el usuario elige "Corporate"
  const corporateLocationIds = [
    "1", "2520", "10265", "10266", "11224", "14379", "14380", "15066", "15354",
    "15355", "17124", "19605", "21860", "22767", "23406", "35599", "44392",
    "50599", "71710", "71711", "71712"
  ];

  // Inicialización de selectpickers si existen en el DOM
  if ($('#locations').length && $('#locations').is('select')) $('#locations').selectpicker();
  if ($('#lines').length && $('#lines').is('select')) $('#lines').selectpicker();

  // CARGA DE FILTROS DESDE EL SERVIDOR 
  $.get('/users/statistics/policies/filters', function (resp) {
    console.log("Políticas/filtros recibidos:", resp);
    if (resp.success) {
      // Business Types
      $('#business_type').empty();
      resp.business_types.forEach(bt => {
        let label = bt === 'N' ? 'New Business' : bt === 'R' ? 'Renewal' : bt === 'W' ? 'Rewrite' : '';
        if (label) $('#business_type').append(`<option value="${bt}">${label}</option>`);
      });
      $('#business_type').selectpicker('refresh');

      // Selecciona valor seguro si existe (ejemplo: 'N')
      const businessTypeDefault = 'N'; // Cambia esto si el valor por defecto viene del backend
      if (businessTypeDefault && $('#business_type option[value="' + businessTypeDefault + '"]').length) {
        $('#business_type').selectpicker('val', businessTypeDefault);
      }

      // Policy Status
      $('#policy_status').empty();
      resp.policy_status.forEach(ps => {
        let label =
          ps === 'A' ? 'Active' :
          ps === 'P' ? 'Pending' :
          ps === 'C' ? 'Cancelled' :
          ps === 'V' ? 'Voided' :
          ps === 'D' ? 'Deleted' : '';
        if (label) $('#policy_status').append(`<option value="${ps}">${label}</option>`);
      });
      $('#policy_status').selectpicker('refresh');

      const policyStatusDefault = 'A'; // Ejemplo de valor por defecto
      if (policyStatusDefault && $('#policy_status option[value="' + policyStatusDefault + '"]').length) {
        $('#policy_status').selectpicker('val', policyStatusDefault);
      }

      // Product Lines
      if ($('#lines').length && Array.isArray(resp.lines)) {
        $('#lines').empty();
        resp.lines.forEach(line => {
          $('#lines').append(`<option value="${line}">${line}</option>`);
        });
        $('#lines').selectpicker('refresh');

        // Valor por defecto para lines
        const lineDefault = resp.lines[0]; // puedes cambiarlo según tu lógica
        if (lineDefault && $('#lines option[value="' + lineDefault + '"]').length) {
          $('#lines').selectpicker('val', lineDefault);
        }
      }
    } else {
      console.warn("No se pudieron cargar los filtros de líneas/políticas.");
    }
  });

  // LÓGICA DE LOCATIONS CORPORATE 
  $('#locations').on('changed.bs.select', function () {
    const $select = $('#locations');
    const values = $select.val() || [];
    const corporateOption = $select.find('option').filter(function () {
      return $(this).text().trim().toLowerCase() === 'corporate' || $(this).val().toLowerCase() === 'corporate';
    });
    if (!corporateOption.length) return;
    const corporateValue = corporateOption.val();

    if (values.includes(corporateValue)) {
      const newValues = Array.from(new Set([corporateValue, ...corporateLocationIds, ...values]));
      $select.selectpicker('val', newValues);
    } else {
      const filtered = (values || []).filter(
        v => v !== corporateValue && !corporateLocationIds.includes(v)
      );
      $select.selectpicker('val', filtered);
    }
  });

  // DATE RANGE PICKER 
  $('#dates').daterangepicker({
    locale: { format: 'YYYY-MM-DD' },
    autoUpdateInput: false,
    drops: 'down',
    opens: 'right',
    showDropdowns: true,
  });
  $('#dates').on('apply.daterangepicker', function (ev, picker) {
    $(this).val(picker.startDate.format('YYYY-MM-DD') + ' - ' + picker.endDate.format('YYYY-MM-DD'));
  });
  $('#dates').on('cancel.daterangepicker', function () {
    $(this).val('');
  });

  // DATATABLE PRINCIPAL
  const table = $('.datatables-upcoming-renewals').DataTable({
    columns: [
      { data: 'customer' },
      { data: 'policy_number',
        render: function(data) {
          if (!isNaN(data) && Number.isInteger(Number(data))) {
            return formatInteger(data);
          }
          return data;
        }
      },
      { data: 'location_alias' },
      { data: 'business_type' },
      { data: 'carrier' },
      {
        data: 'premium',
        render: function(data) {
          return formatCurrency(data);
        }
      },
      { data: 'binder_date', render: function(data) { return formatUSDate(data); }},
      { data: 'effective_date', render: function(data) { return formatUSDate(data); }},
      { data: 'exp_date', render: function(data) { return formatUSDate(data); }},
      { data: 'csr' },
      { data: 'producer' },
      { data: 'policy_status' },
      { data: 'product_line' },
      { data: 'cancellation_date', render: function(data) { return formatUSDate(data); }}
    ],
    searching: false,
    paging: true,
    info: true,
    ordering: true,
    language: {
      emptyTable: "No data available"
    },
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
    ]
  });

  // RESUMEN DE LA TABLA
  function insertSummaryBoxIfNeeded() {
    if (!$('#datatable-summary').length) {
      $('.datatable-summary-col').html(`
        <div id="datatable-summary" class="datatable-summary-highlight">
          <div class="datatable-summary-highlight-content">
            <span>0</span> &nbsp; | &nbsp;  <span>$0</span>
          </div>
        </div>
      `);
    }
  }
  insertSummaryBoxIfNeeded();

  function updateTableSummary() {
    let data = table.rows({ search: 'applied' }).data();
    let totalPolicies = data.length;
    let totalPremium = 0;
    data.each(row => {
      let premiumValue = 0;
      if (typeof row.premium === "number") premiumValue = row.premium;
      else if (typeof row.premium === "string") {
        let clean = row.premium.replace(/[^0-9.-]+/g, "");
        premiumValue = parseFloat(clean) || 0;
      }
      totalPremium += premiumValue;
    });
    const formattedPremium = formatCurrency(totalPremium);
    const formattedPolicies = formatInteger(totalPolicies);
    $("#datatable-summary").html(
      `<div class="datatable-summary-highlight-content">
        <span>${formattedPolicies}</span> &nbsp; | &nbsp; <span>${formattedPremium}</span>
      </div>`
    );
  }

  table.on('draw', function () {
    insertSummaryBoxIfNeeded();
    updateTableSummary();
  });
  table.draw();

  // FILTRO Y BÚSQUEDA DE POLIZAS
  $('.btn-card-block-overlay').on('click', function () {
    searchPolicies();
  });

  function searchPolicies() {
    const locations = $('#locations').val() || [];
    let business_types = $('#business_type').val() || [];
    const criteria = $('#criteria').val();
    const dateRangeStr = $('#dates').val();
    let policy_status = $('#policy_status').val() || [];
    let lines = $('#lines').length ? $('#lines').val() || [] : [];

    // Si NO hay ningún filtro seleccionado, toma todos los valores posibles
    if (business_types.length === 0) {
      business_types = $('#business_type option').map(function () { return $(this).val(); }).get();
    }
    if (policy_status.length === 0) {
      policy_status = $('#policy_status option').map(function () { return $(this).val(); }).get();
    }
    if (lines.length === 0 && $('#lines').length > 0) {
      lines = $('#lines option').map(function () { return $(this).val(); }).get();
    }

    if (!dateRangeStr || !dateRangeStr.includes(' - ')) {
      Swal.fire('Select a date range', '', 'warning');
      return;
    }
    const dateRange = dateRangeStr.split(' - ');

    Swal.fire({
      title: 'Searching Policies',
      html: `
        <div style="display: flex; flex-direction: column; align-items: center;">
          <div class="spinner-border text-primary" style="width: 4rem; height: 4rem; border-width: .5em; margin-bottom: 1.2rem; box-shadow: 0 4px 32px 0 rgba(0,0,0,.15); opacity:.85;" role="status">
            <span class="visually-hidden">Loading...</span>
          </div>
          <div style="font-size:1.1rem;color:#5370f0;opacity:.8;font-weight:500;">
            Please wait while we find your results
          </div>
        </div>
      `,
      background: 'rgba(30,34,54,0.95)',
      color: '#fff',
      allowOutsideClick: false,
      showConfirmButton: false,
      customClass: { popup: 'swal2-glass-effect' },
      didOpen: () => {
        $('.swal2-popup .spinner-border').addClass('animate__animated animate__fadeIn');
      }
    });

    $.ajax({
      url: '/users/statistics/policies/search',
      method: 'POST',
      contentType: 'application/json',
      data: JSON.stringify({
        locations,
        business_types,
        criteria,
        date_range: dateRange,
        policy_status,
        lines
      }),
      success: function (resp) {
        console.log("Respuesta de búsqueda:", resp);
        table.clear();
        if (resp.success && Array.isArray(resp.data) && resp.data.length) {
          resp.data.forEach(row => {
            table.row.add({
              ...row,
              binder_date: row.binder_date ? moment(row.binder_date).format('YYYY-MM-DD') : '',
              effective_date: row.effective_date ? moment(row.effective_date).format('YYYY-MM-DD') : '',
              exp_date: row.exp_date ? moment(row.exp_date).format('YYYY-MM-DD') : '',
              cancellation_date: row.cancellation_date ? moment(row.cancellation_date).format('YYYY-MM-DD') : ''
            });
          });
          table.draw();
        } else {
          table.draw();
          Swal.fire('No results', resp.message || 'No policies found for that filter', 'info');
        }
      },
      error: function () {
        table.clear().draw();
        Swal.fire('Error', 'Server error searching policies', 'error');
      },
      complete: function () {
        Swal.close();
      }
    });
  }

  // llama la búsqueda al cargar por primera vez
  // searchPolicies();
});