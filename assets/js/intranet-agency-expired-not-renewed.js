




/**
 * Dashboard de Renovaciones Expiradas y No Renovadas
 * --------------------------------------------------
 * Lógica para mostrar el dashboard de pólizas expiradas y no renovadas:
 * - Generación de meses
 * - Tabla (DataTables)
 * - KPIs por línea
 * - Modal de detalles
 * - Estilos y manejo de errores
 */

"use strict";

document.addEventListener("DOMContentLoaded", () => {
  // =========================
  // UTILIDADES
  // =========================
  function getInitials(nombre) {
    if (!nombre) return "--";
    const parts = nombre.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function formatInteger(value) {
    return Number(value || 0).toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    });
  }

  function formatCurrency(value) {
    return '$' + formatInteger(value);
  }

  function formatDate(fechaStr) {
    if (!fechaStr) return "";
    const date = new Date(fechaStr);
    return isNaN(date) ? fechaStr : date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  const avatarColors = [
    "#FF6B6B", "#4ECDC4", "#45B7D1", "#FFBE0B", "#FB5607",
    "#8338EC", "#3A86FF", "#FF006E", "#6A994E", "#A7C957"
  ];

  function stringToNiceColor(str) {
    if (!str) return avatarColors[0];
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return avatarColors[Math.abs(hash) % avatarColors.length];
  }

  // =========================
  // ESTILOS CSS
  // =========================
// ESTILOS CSS 
function addCustomStyles() {
  if (!document.getElementById('custom-renewal-css')) {
    const style = document.createElement('style');
    style.id = 'custom-renewal-css';
    style.textContent = `
      .custom-avatar {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        border-radius: 50%;
        color: white;
        font-weight: bold;
        margin-right: 12px;
        font-size: 14px;
        text-shadow: 0 1px 1px rgba(0,0,0,0.2);
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      }
      .dt-details-btn {
        background: none;
        border: none;
        cursor: pointer;
        font-size: 18px;
        margin-right: 8px;
        color: #6c757d;
        transition: all 0.2s;
      }
      .dt-details-btn:hover {
        color: #1976d2;
        transform: scale(1.1);
      }
      #customerDetailsModal {
        display: none;
        position: fixed;
        top: 0; left: 0;
        width: 100%; height: 100%;
        background-color: rgba(0,0,0,0.5);
        z-index: 9999;
        align-items: center;
        justify-content: center;
      }
      #customerDetailsModal .modal-content {
        width: 90%;
        max-width: 800px;
        max-height: 85vh;
        overflow-y: auto;
        border-radius: 10px;
        position: relative;
        box-shadow: 0 10px 30px rgba(0,0,0,0.2);
        background-color: var(--bs-modal-bg, #fff); /* Usa la variable global */
        color: var(--bs-body-color, #222);
        border: 1px solid var(--bs-modal-border-color, #e0e0e0);
        padding: 25px;
      }
      .modal-large-content {
        position: relative;
        padding: 20px;
      }
      .customer-avatar-modal {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 60px;
        height: 60px;
        border-radius: 50%;
        color: white;
        font-weight: bold;
        margin-right: 15px;
        font-size: 22px;
        text-shadow: 0 1px 1px rgba(0,0,0,0.2);
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      }
      .detail-item {
        margin-bottom: 12px;
        padding: 8px 0;
        border-bottom: 1px solid var(--bs-border-color, #eee);
      }
      .detail-item label {
        font-weight: bold;
        min-width: 160px;
        display: inline-block;
        color: var(--bs-heading-color, #222);
      }
      .detail-item span {
        color: var(--bs-body-color, #222);
      }
      .contact-info {
        display: flex;
        flex-direction: column;
        gap: 4px;
        margin-top: 4px;
      }
      .contact-item {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 13px;
      }
      .contact-item i {
        font-size: 14px;
        width: 16px;
        text-align: center;
      }
      .modal-footer-button {
        margin-top: 20px;
        text-align: center;
      }
      .close-modal-bottom {
        background-color: var(--bs-modal-bg, #fff);
        border: 1px solid var(--bs-border-color, #eee);
        color: var(--bs-body-color, #222);
        padding: 8px 18px;
        border-radius: 4px;
        cursor: pointer;
        transition: all 0.2s;
      }
      .close-modal-bottom:hover {
        background-color: var(--bs-border-color, #eee);
      }
      /* Layout mejorado para DataTables */
      .dt-header-container {
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 15px;
        margin-bottom: 20px;
      }
      .dt-length-container {
        flex: 1;
        min-width: 180px;
      }
      .dt-search-container {
        flex: 2;
        min-width: 300px;
        display: flex;
        justify-content: center;
      }
      .dt-buttons-container {
        flex: 1;
        min-width: 180px;
        display: flex;
        justify-content: flex-end;
      }
      .dataTables_wrapper .dataTables_length {
        margin-right: 0;
      }
      .dataTables_wrapper .dataTables_length select {
        background-color: var(--bs-body-bg);
        color: var(--bs-body-color);
        border: 1px solid var(--bs-border-color);
        border-radius: 4px;
        padding: 0.25rem;
        min-width: 80px;
      }
      .dataTables_wrapper .dataTables_length label {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin-bottom: 0;
      }
      .dataTables_wrapper .dataTables_filter {
        margin: 0;
        text-align: center;
      }
      .dataTables_wrapper .dataTables_filter input {
        width: 100%;
        max-width: 400px;
        margin: 0 auto;
      }
      .dataTables_wrapper .dt-buttons {
        margin-left: 0;
      }
      .dataTables_wrapper .dataTables_info {
        color: var(--bs-secondary-color);
        padding-top: 0.5rem;
      }
      .dataTables_wrapper .dataTables_paginate {
        padding-top: 0.5rem;
      }
      .dataTables_wrapper .dataTables_paginate .paginate_button {
        color: var(--bs-link-color) !important;
        background: transparent !important;
        border: none !important;
        padding: 0.3rem 0.6rem !important;
        margin: 0 0.15rem !important;
        border-radius: 4px;
      }
      .dataTables_wrapper .dataTables_paginate .paginate_button.current,
      .dataTables_wrapper .dataTables_paginate .paginate_button.current:hover {
        color: white !important;
        background: var(--bs-primary) !important;
        border: none !important;
      }
      .dataTables_wrapper .dataTables_paginate .paginate_button:hover {
        background: rgba(var(--bs-primary-rgb), 0.1) !important;
        color: var(--bs-link-hover-color) !important;
      }
      .dataTables_wrapper .dataTables_paginate .paginate_button.disabled,
      .dataTables_wrapper .dataTables_paginate .paginate_button.disabled:hover {
        color: var(--bs-secondary-color) !important;
        background: transparent !important;
      }
      /* Estilo para cabecera fija */
      .table-header-fixed {
        position: sticky;
        top: 0;
        background-color: var(--bs-body-bg);
        z-index: 10;
        box-shadow: 0 2px 5px rgba(0,0,0,0.05);
      }
    `;
    document.head.appendChild(style);
  }
}

  // =========================
  // MESES
  // =========================
  function generateMonthOptions() {
    const now = new Date();
    const select = document.getElementById("last4months");
    if (!select) return;

    select.innerHTML = '';
    for (let i = 0; i < 12; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const option = document.createElement("option");
      option.value = i;
      option.textContent = date.toLocaleString('en-US', { month: 'long', year: 'numeric' });
      if (i === 0) option.selected = true;
      select.appendChild(option);
    }
  }

  // =========================
  // ELEMENTOS DOM
  // =========================
  const selectMonths = document.getElementById("last4months");
  const btnRefresh = document.getElementById("refresh-btn");
  const errorAlert = document.getElementById("error-alert");
  const spinner = document.getElementById("loading-spinner");
  let dt_user = null;

  // =========================
  // RENDER CELDA CLIENTE
  // =========================
  function renderCustomerCell(data, type, row) {
    const name = row.customer || "";
    const phone = row.phone || "";
    const email = row.email || "";
    const initials = getInitials(name);
    const bgColor = stringToNiceColor(name);

    // Escapar datos para prevenir XSS
    const safeData = JSON.stringify(row)
      .replace(/</g, '\\u003c')
      .replace(/>/g, '\\u003e')
      .replace(/"/g, '&quot;');

    const detailsBtn = `<button type="button" class="dt-details-btn" aria-label="View details" data-customer='${safeData}'>
      <i class="ti ti-eye"></i>
    </button>`;

    return `
      <div class="d-flex align-items-center">
        <span class="custom-avatar" style="background:${bgColor};">${initials}</span>
        ${detailsBtn}
        <div class="d-flex flex-column">
          <span class="fw-medium" style="font-size:15px;">${name}</span>
          <div class="contact-info">
            ${phone ? `
              <div class="contact-item">
                <i class="ti ti-phone"></i>
                <a href="tel:${phone.replace(/[^\d+]/g, '')}" style="color:var(--bs-primary);">${phone}</a>
              </div>` : ""}
            ${email ? `
              <div class="contact-item">
                <i class="ti ti-mail"></i>
                <a href="mailto:${email}" style="color:var(--bs-primary);">${email}</a>
              </div>` : ""}
          </div>
        </div>
      </div>
    `;
  }

  // =========================
  // TABLA
  // =========================
  function renderTable(policies) {
    const $table = $('.datatables-expired-policies');

    // Si no hay datos
    if (!policies || policies.length === 0) {
      if ($.fn.DataTable.isDataTable($table)) {
        dt_user.clear().draw();
      } else {
        $table.find('tbody').html(`
          <tr>
            <td colspan="7" class="text-center py-4">
              <div class="d-flex flex-column align-items-center">
                <i class="ti ti-alert-circle text-warning mb-2" style="font-size: 2rem;"></i>
                <h5 class="mb-1">No expired policies found</h5>
                <p class="text-muted mb-0">No data available for the selected period</p>
              </div>
            </td>
          </tr>
        `);
      }
      return;
    }

    // Actualiza tabla existente
    if ($.fn.DataTable.isDataTable($table)) {
      const page = dt_user.page();
      const search = dt_user.search();
      dt_user.clear();
      dt_user.rows.add(policies).draw();
      dt_user.page(page).draw('page');
      dt_user.search(search).draw();
      attachDetailsButtonHandlers();
      return;
    }

    // Crea DataTable (sin Buttons para evitar dependencias)
    dt_user = $table.DataTable({
      data: policies,
      columns: [
        { data: "customer", className: "align-middle", responsivePriority: 1, render: renderCustomerCell },
        { data: "policy_number", className: "align-middle" },
        { data: "carrier", className: "align-middle" },
        { data: "line", className: "align-middle" },
        { data: "premium", className: "align-middle", render: p => formatCurrency(p) },
        { data: "exp_date", className: "align-middle", render: formatDate },
        { data: "csr", className: "align-middle" }
      ],
      order: [[5, "asc"]],
      dom: `
        <"dt-header-container"
          <"dt-length-container"l>
          <"dt-search-container"f>
        >
        t
        <"row mt-3"
          <"col-sm-12 col-md-5"i>
          <"col-sm-12 col-md-7"p>
        >
      `,
      language: {
        sLengthMenu: "Show _MENU_",
        search: "",
        searchPlaceholder: "Search..",
        emptyTable: "No data available in table",
        paginate: {
          previous: '<i class="ti ti-chevron-left"></i>',
          next: '<i class="ti ti-chevron-right"></i>',
          first: '<i class="ti ti-chevrons-left"></i>',
          last: '<i class="ti ti-chevrons-right"></i>'
        },
        info: "Showing _START_ to _END_ of _TOTAL_ entries"
      },
      responsive: true,
      drawCallback: function () {
        $('.dataTable thead').addClass('table-header-fixed');
        attachDetailsButtonHandlers();
      }
    });
  }

  // =========================
  // DETALLES (MODAL)
  // =========================
  function attachDetailsButtonHandlers() {
    $('.dt-details-btn').off('click').on('click', function (e) {
      e.stopPropagation();
      try {
        const rowData = JSON.parse(this.dataset.customer.replace(/&quot;/g, '"'));
        const initials = getInitials(rowData.customer);
        const bgColor = stringToNiceColor(rowData.customer);
        const avatarHtml = `<span class="customer-avatar-modal rounded-circle" style="background:${bgColor};">${initials}</span>`;

        $('#customerDetailsBody').html(`
          <div class="modal-large-content">
            <h4 class="text-center mb-4">${rowData.customer || 'N/A'}</h4>
            <div class="d-flex align-items-center mb-4">
              ${avatarHtml}
              <div>
                <h5 class="mb-1">Customer Information</h5>
                ${rowData.phone ? `
                <div class="contact-item mb-1">
                  <i class="ti ti-phone me-2"></i>
                  <a href="tel:${rowData.phone}" class="text-reset">${rowData.phone}</a>
                </div>` : ''}
                ${rowData.email ? `
                <div class="contact-item">
                  <i class="ti ti-mail me-2"></i>
                  <a href="mailto:${rowData.email}" class="text-reset">${rowData.email}</a>
                </div>` : ''}
              </div>
            </div>
            <div class="row">
              <div class="col-md-6">
                <div class="detail-item"><label>Policy Number:</label><span>${rowData.policy_number || 'N/A'}</span></div>
                <div class="detail-item"><label>Carrier:</label><span>${rowData.carrier || 'N/A'}</span></div>
                <div class="detail-item"><label>Line of business:</label><span>${rowData.line || 'N/A'}</span></div>
              </div>
              <div class="col-md-6">
                <div class="detail-item"><label>Premium:</label><span>${formatCurrency(rowData.premium)}</span></div>
                <div class="detail-item"><label>Exp date:</label><span>${formatDate(rowData.exp_date) || 'N/A'}</span></div>
                <div class="detail-item"><label>CSR:</label><span>${rowData.csr || 'N/A'}</span></div>
              </div>
            </div>
            <div class="modal-footer-button">
              <button class="close-modal-bottom">Close</button>
            </div>
          </div>
        `);

        $('#customerDetailsModal').css('display', 'flex');
      } catch (error) {
        console.error('Error parsing customer data:', error);
      }
    });
  }

  // Cierre del modal
  $(document).on('click', '#customerDetailsModal, .close-modal-bottom', function (e) {
    if (e.target === this || $(e.target).hasClass('close-modal-bottom')) {
      $('#customerDetailsModal').fadeOut(220);
    }
  });
  $(document).on('keydown', function (e) {
    if (e.key === "Escape" && $('#customerDetailsModal').is(':visible')) {
      $('#customerDetailsModal').fadeOut(220);
    }
  });

  // =========================
  // KPIs
  // =========================
  function renderKpis(lostByLine = {}, monthName = "") {
    try {
      const safeData = {
        lostGeneral: lostByLine.lostGeneral || { policies: 0, premium: 0 },
        lostCommercial: lostByLine.lostCommercial || { policies: 0, premium: 0 },
        lostHomeowner: lostByLine.lostHomeowner || { policies: 0, premium: 0 },
        lostOther: lostByLine.lostOther || { policies: 0, premium: 0 }
      };

      document.querySelectorAll('.month-label').forEach(el => {
        if (el) el.textContent = monthName || "Selected Month";
      });

      const kpiMap = [
        { id: "lost-general", data: safeData.lostGeneral },
        { id: "lost-commercial", data: safeData.lostCommercial },
        { id: "lost-homeowner", data: safeData.lostHomeowner },
        { id: "lost-other", data: safeData.lostOther }
      ];

      kpiMap.forEach(item => {
        const container = document.getElementById(item.id);
        if (!container) return;

        const policies = item.data.policies || 0;
        const premium = item.data.premium || 0;

        let valueElem = container.querySelector('.kpi-value');
        let dividerElem = container.querySelector('.kpi-divider');
        let countElem = container.querySelector('.kpi-count');

        if (!valueElem) {
          valueElem = document.createElement('span');
          valueElem.className = 'kpi-value';
          container.appendChild(valueElem);
        }
        if (!dividerElem) {
          dividerElem = document.createElement('span');
          dividerElem.className = 'kpi-divider';
          dividerElem.textContent = '/';
          container.appendChild(dividerElem);
        }
        if (!countElem) {
          countElem = document.createElement('span');
          countElem.className = 'kpi-count';
          container.appendChild(countElem);
        }

        valueElem.textContent = formatCurrency(premium);
        countElem.textContent = formatInteger(policies);

        if (policies > 0 || premium > 0) container.classList.add("has-data");
        else container.classList.remove("has-data");
      });
    } catch (error) {
      console.error("Error en renderKpis:", error);
    }
  }

  // =========================
  // FETCH + RENDER
  // =========================
  async function fetchAndRender() {
    if (errorAlert) {
      errorAlert.classList.add("d-none");
      errorAlert.innerHTML = '';
    }

    if (spinner) {
      spinner.style.display = 'flex';
      spinner.classList.remove("d-none");
      spinner.innerHTML = `
        <div class="d-flex align-items-center">
          <span class="spinner-border me-2" role="status"></span>
          <strong>Loading data for selected period...</strong>
        </div>
      `;
    }

    const offset = parseInt(selectMonths?.value, 10) || 0;

    try {
      const selectedMonthText = selectMonths?.options[selectMonths.selectedIndex]?.textContent || "Selected Month";

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const payload = { month: offset };
      if (typeof window.locationOverride === 'number') payload.location = window.locationOverride;

      const [tableResponse, kpiResponse] = await Promise.all([
        fetch("/users/renewals/agency-expired-not-renewed/data-month", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
          body: JSON.stringify(payload),
          signal: controller.signal
        }),
        fetch("/users/renewals/agency-lost-renewals-by-line-kpis", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
          body: JSON.stringify(payload),
          signal: controller.signal
        })
      ]);

      clearTimeout(timeoutId);

      if (!tableResponse.ok) {
        const errorText = await tableResponse.text();
        throw new Error(`Server error: ${tableResponse.status} - ${errorText}`);
      }

      const tableData = await tableResponse.json();
      const kpiData = kpiResponse.ok
        ? await kpiResponse.json()
        : {
            lostByLine: {
              lostGeneral: { policies: 0, premium: 0 },
              lostOther: { policies: 0, premium: 0 },
              lostCommercial: { policies: 0, premium: 0 },
              lostHomeowner: { policies: 0, premium: 0 }
            },
            monthName: selectedMonthText
          };

      renderKpis(kpiData.lostByLine, kpiData.monthName || selectedMonthText);
      renderTable(tableData.expiredPolicies || []);
    } catch (error) {
      console.error("Fetch error:", error);

      if (errorAlert) {
        errorAlert.innerHTML = `
          <div class="alert alert-danger">
            <div class="d-flex align-items-center">
              <i class="ti ti-alert-circle me-2"></i>
              <h5 class="mb-0">Error loading data</h5>
            </div>
            <div class="mt-2"><small>${error.message}</small></div>
            <div class="mt-2 text-end">
              <button class="btn btn-sm btn-outline-primary" id="retry-btn">
                <i class="ti ti-reload me-1"></i> Try Again
              </button>
            </div>
          </div>
        `;
        errorAlert.classList.remove("d-none");
        document.getElementById('retry-btn')?.addEventListener('click', fetchAndRender);
      }

      if (dt_user) {
        try { dt_user.destroy(); } catch {}
        dt_user = null;
      }
      renderTable([]);
      renderKpis({}, "N/A");
    } finally {
      if (spinner) {
        spinner.style.display = 'none';
        spinner.classList.add("d-none");
      }
    }
  }

  // =========================
  // INICIALIZACIÓN
  // =========================
  addCustomStyles();
  generateMonthOptions();

  selectMonths?.addEventListener('change', fetchAndRender);
  btnRefresh?.addEventListener('click', fetchAndRender);

  fetchAndRender();
});