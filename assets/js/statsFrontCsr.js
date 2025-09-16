/**
 * Dashboard de Ranking CSR/Agentes/Productores
 * --------------------------------------------
 * Script principal para la visualización y búsqueda de ranking de CSR, agentes o productores,
 * mostrando cantidad y primas por grupo y locación, con filtros avanzados y exportación CSV.
 * 
 * Funcionalidades:
 * - Inicializa selectpickers y filtros dinámicos desde el backend
 * - Soporte para selección automática de IDs de "Corporate"
 * - Date range picker para filtrar por fechas
 * - DataTable con resumen, filas destacadas y exportación CSV
 * - Búsqueda avanzada y actualización dinámica del ranking
 * - Personalización de encabezado según el tipo de agrupamiento seleccionado
 * 
 */

$(document).ready(function () {
  // --- IDs de locations que debe seleccionar "Corporate" ---
  const corporateLocationIds = [
    "1", "2520", "10265", "10266", "11224", "14379", "14380", "15066", "15354",
    "15355", "17124", "19605", "21860", "22767", "23406", "35599", "44392",
    "50599", "71710", "71711", "71712"
  ];

  // LINES
  const RUBROS = [
    "Homeowner Lines",
    "Personal Lines",
    "Commercial Lines"
  ];

  function formatInteger(value) {
    return Number(value || 0).toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    });
  }

  function formatPremium(value) {
    let num = 0;
    if (typeof value === "number") {
      num = value;
    } else if (typeof value === "string") {
      const clean = value.replace(/[^0-9.]/g, '');
      num = parseInt(clean, 10);
      if (isNaN(num)) num = 0;
    }
    if (!num || isNaN(num)) num = 0;
    return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  // Inicializa selectpicker en los selects relevantes 
  $('#locations, #group_by').each(function() {
    if ($(this).is('select')) $(this).selectpicker();
  });

  //  Carga dinámica para business_types, policy_status y lines
  $.get('/users/statistics/csr/filters', function (resp) {
    if (resp.success) {
      // Business types
      $('#business_type').empty();
      resp.business_types.forEach(bt => {
        let label = '';
        if (bt === 'N') label = 'New Business';
        else if (bt === 'R') label = 'Renewal';
        else if (bt === 'W') label = 'Rewrite';
        else return;
        $('#business_type').append(`<option value="${bt}">${label}</option>`);
      });

      // Policy status
      $('#policy_status').empty();
      resp.policy_status.forEach(ps => {
        let label = '';
        if (ps === 'A') label = 'Active';
        else if (ps === 'P') label = 'Pending';
        else if (ps === 'C') label = 'Cancelled';
        else if (ps === 'V') label = 'Voided';
        else if (ps === 'D') label = 'Deleted';
        else return;
        $('#policy_status').append(`<option value="${ps}">${label}</option>`);
      });

      // Lines (excepto "Other Lines")
      if (resp.lines) {
        $('#lines').empty();
        resp.lines
          .filter(line => line !== 'Other Lines')
          .forEach(line => {
            $('#lines').append(`<option value="${line}">${line}</option>`);
          });
        $('#lines').selectpicker('refresh');
      }

      $('#business_type').selectpicker('refresh');
      $('#policy_status').selectpicker('refresh');
    }
  });

  // Lógica de selección automática para Corporate en locations 
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

  //  Date range picker 
  $('#dates').daterangepicker({
    locale: { format: 'YYYY-MM-DD' },
    autoUpdateInput: false,
    showDropdowns: true 
  });
  $('#dates').on('apply.daterangepicker', function (ev, picker) {
    $(this).val(picker.startDate.format('YYYY-MM-DD') + ' - ' + picker.endDate.format('YYYY-MM-DD'));
  });
  $('#dates').on('cancel.daterangepicker', function () {
    $(this).val('');
  });

  function getGroupByLabel(val) {
    if (!val) return "Name";
    if (val.toLowerCase() === "csr") return "CSR";
    if (val.toLowerCase() === "agent") return "Agent";
    if (val.toLowerCase() === "producer") return "Producer";
    return "Name";
  }

  function updateGroupByHeader() {
    let val = $('#group_by').val();
    if (Array.isArray(val)) val = val[0];
    val = val || 'csr';
    $('#group-by-title').text(getGroupByLabel(val));
    $('#csr-table-description').text(
      `Ranking table showing ${getGroupByLabel(val)}, Location, Count and Premium for the selected group (CSR, Agent or Producer).`
    );
  }
  setTimeout(updateGroupByHeader, 300);

  $('#group_by').on('changed.bs.select', function() {
    updateGroupByHeader();
    // Si quieres recargar el ranking automáticamente aquí, descomenta:
    // searchCsrRanking();
  });

  // DataTable y ranking CSR con Export CSV y resumen alineado 
  const table = $('#csr-ranking-table').DataTable({
    columns: [
      { data: null, orderable: false, defaultContent: '', title: "#" },
      { 
        data: "grp_alias",
        title: "Name",
        render: function(data, type, row) {
          const groupByType = ($('#group_by').val() && $('#group_by').val().length > 0) ? $('#group_by').val()[0] : 'csr';
          const groupId = row.grp_id;
          const groupAlias = row.grp_alias;
          const params = buildDetailParams(groupByType, groupId, groupAlias);
          return `<a class="csr-detail-link"
                     href="/users/statistics/csr-policies/${encodeURIComponent(groupByType)}/${encodeURIComponent(groupId)}?${params.toString()}"
                     target="_blank" rel="noopener">
                    ${groupAlias}
                  </a>`;
        }
      },
      { data: "location_alias", title: "Location" },
      { 
        data: "count", 
        title: "Count",
        render: function(data, type, row) {
          return formatInteger(data);
        }
      },
      { 
        data: "premium", 
        title: "Premium", 
        render: function(data) {
          return formatPremium(data);
        }
      }
    ],
    searching: false,
    paging: true,
    info: true,
    ordering: true,
    order: [[3, "desc"]],
    language: { emptyTable: "No data available" },
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

  function buildDetailParams(groupByType, groupId, groupAlias) {
    const selectedLines = $('#lines').val() || [];
    let linesParam = [];
    if (selectedLines.length > 0) {
      linesParam = selectedLines;
    }
    const params = new URLSearchParams({
      locations: JSON.stringify($('#locations').val() || []),
      business_types: JSON.stringify($('#business_type').val() || []),
      policy_status: JSON.stringify($('#policy_status').val() || []),
      lines: JSON.stringify(linesParam),
      date_column: $('#criteria').val() || 'effective_date',
      date_start: $('#dates').data('daterangepicker') ? $('#dates').data('daterangepicker').startDate.format('YYYY-MM-DD') : '',
      date_end: $('#dates').data('daterangepicker') ? $('#dates').data('daterangepicker').endDate.format('YYYY-MM-DD') : '',
      group_by_type: groupByType,
      group_name: groupId
    });
    if (groupAlias) params.set('alias', groupAlias);
    return params;
  }

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
    let totalCount = 0;
    let totalPremium = 0;
    data.each(row => {
      totalCount += Number(row.count) || 0;
      let premiumValue = 0;
      if (typeof row.premium === "number") premiumValue = row.premium;
      else if (typeof row.premium === "string") {
        let clean = row.premium.replace(/[^0-9.]+/g, "");
        premiumValue = parseInt(clean, 10) || 0;
      }
      totalPremium += premiumValue;
    });
    const formattedPremium = formatPremium(totalPremium);
    const formattedCount = formatInteger(totalCount);
    $("#datatable-summary").html(
      `<div class="datatable-summary-highlight-content">
        <span>${formattedCount}</span> &nbsp; | &nbsp; <span>${formattedPremium}</span>
      </div>`
    );
  }

  table.on('order.dt search.dt', function () {
    table.column(0, { search: 'applied', order: 'applied' }).nodes().each(function (cell, i) {
      cell.innerHTML = i + 1;
    });
  });

  table.on('draw', function () {
    insertSummaryBoxIfNeeded();
    let allRows = table.rows({ order: 'applied' }).nodes();
    $(allRows).removeClass('gold-row silver-row bronze-row');
    if (allRows.length > 0) $(allRows[0]).addClass('gold-row');
    if (allRows.length > 1) $(allRows[1]).addClass('silver-row');
    if (allRows.length > 2) $(allRows[2]).addClass('bronze-row');
    updateTableSummary();
  });
  table.draw();

  // --- Búsqueda avanzada al hacer click en el botón ---
  $('.btn-card-block-overlay').on('click', function () {
    searchCsrRanking();
  });

  /**
   * Ejecuta la búsqueda avanzada de ranking CSR/Agente/Productor con los filtros actuales.
   * Actualiza la tabla y el resumen. Muestra spinner y mensajes con SweetAlert2.
   */
  function searchCsrRanking() {
    const locations = $('#locations').val() || [];
    let business_types = $('#business_type').val() || [];
    const criteria = $('#criteria').val();
    const dateRangeStr = $('#dates').val();
    let policy_status = $('#policy_status').val() || [];
    let lines = $('#lines').val() || [];
    const group_by = $('#group_by').val() || [];

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
      title: 'Searching CSR Ranking',
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
      url: '/users/statistics/csr/search',
      method: 'POST',
      contentType: 'application/json',
      data: JSON.stringify({
        locations,
        business_types,
        criteria,
        date_range: dateRange,
        policy_status,
        group_by,
        lines
      }),
      success: function (resp) {
        table.clear();
        if (resp.success && Array.isArray(resp.data) && resp.data.length) {
          table.rows.add(resp.data).draw();
        } else {
          table.draw();
          Swal.fire('No results', resp.message || 'No CSR data found for that filter', 'info');
        }
      },
      error: function () {
        table.clear().draw();
        Swal.fire('Error', 'Server error searching CSR rankings', 'error');
      },
      complete: function () {
        Swal.close();
      }
    });
  }
});