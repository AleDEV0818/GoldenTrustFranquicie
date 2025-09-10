$(document).ready(function () {
  const locationType = Number(window.USER_LOCATION_TYPE || 0);
  const locationId = String(window.USER_LOCATION_ID || '');
  const agencyAlias = String(window.USER_AGENCY_ALIAS || '');
  const agenciesMap = window.AGENCIES_MAP || {};
  let codesData = [];

  // Robust deduplication
  function uniqueNormalized(arr) {
    const map = new Map();
    arr.forEach(item => {
      if (!item) return;
      const norm = (item || '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
      if (!map.has(norm)) map.set(norm, item.trim());
    });
    return Array.from(map.values());
  }

  function getAvatarImg(name, type = "agency") {
    const safeName = (name || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
    const initials = (name || "").split(' ').map(x => x[0]).join('').toUpperCase().substring(0, 2);
    const imgSrc = `/img/avatars/${type}/${safeName}.png`;
    return `
      <span class="d-inline-flex align-items-center gap-2">
        <img src="${imgSrc}" class="rounded-circle shadow-sm border me-2"
          alt="${name}" style="width:36px;height:36px;object-fit:cover;"
          onerror="this.onerror=null;this.style.display='none';this.nextElementSibling.style.display='inline-flex';">
        <span style="display:none;font-weight:600;font-size:1.1em;background:#eee;color:#333;border-radius:50%;width:36px;height:36px;align-items:center;justify-content:center;">${initials}</span>
        <span>${name || ''}</span>
      </span>
    `;
  }

  // Initialize selectpicker just once
  $('.selectpicker').selectpicker();

  function updateAgencyFilter(options, selected) {
    const $agency = $('#filter-agency');
    if ($agency.hasClass('selectpicker')) $agency.selectpicker('destroy');
    $agency.empty();
    const items = uniqueNormalized(options);
    items.forEach(agency => {
      $agency.append(`<option value="${agency}">${agency}</option>`);
    });
    $agency.selectpicker();
    if (items.length === 1) {
      $agency.selectpicker('val', items[0]);
    } else if (selected) {
      $agency.selectpicker('val', selected);
    } else {
      $agency.selectpicker('val', '');
    }
  }

  function updateCompanyFilter(options, selected) {
    const $company = $('#filter-company');
    if ($company.hasClass('selectpicker')) $company.selectpicker('destroy');
    $company.empty();
    const items = uniqueNormalized(options);
    items.forEach(company => {
      $company.append(`<option value="${company}">${company}</option>`);
    });
    $company.selectpicker();
    if (items.length === 1) {
      $company.selectpicker('val', items[0]);
    } else if (selected) {
      $company.selectpicker('val', selected);
    } else {
      $company.selectpicker('val', '');
    }
  }

  // DataTable SIN location_id
  const $codesTable = $('#codes-table');
  const dt = $codesTable.DataTable({
    columns: [
      { data: 'agency', title: 'AGENCY', render: function (data) { return getAvatarImg(data, "agency"); } },
      { data: 'company', title: 'COMPANY', render: function (data) { return getAvatarImg(data, "company"); } },
      { data: 'code', title: 'CODE' },
      { data: 'login', title: 'LOGIN' },
      { data: 'password', title: 'PASSWORD' }
    ],
    searching: true, paging: true, info: true, ordering: true,
    pageLength: 10, lengthMenu: [5, 10, 25, 50, 100],
    language: {
      emptyTable: "No data available",
      lengthMenu: "Show _MENU_ entries",
      info: "Showing _START_ to _END_ of _TOTAL_ codes",
      infoEmpty: "Showing 0 to 0 of 0 codes",
      search: "Search:",
      paginate: { first: "First", last: "Last", next: "Next", previous: "Previous" }
    },
    dom: '<"row align-items-center mb-3"<"col-auto"l><"col text-end"f>>t<"row mt-3"<"col-sm-12 col-md-5"i><"col-sm-12 col-md-7"p>>'
  });

  function isAgencyRelevant(alias) {
    const agencyInfo = agenciesMap[alias];
    if (!agencyInfo) return false;
    if (locationType === 1) { return agencyInfo.location_type === 1; }
    else if (locationType === 2 || locationType === 4) { return agencyInfo.location_id == locationId; }
    return false;
  }

  function filterAndRedraw(selectedAgency, selectedCompany) {
    let filterByAgency = (locationType === 1);
    let filtered = codesData.filter(row =>
      (!filterByAgency || !selectedAgency || row.agency === selectedAgency) &&
      (!selectedCompany || row.company === selectedCompany) &&
      isAgencyRelevant(row.agency)
    );
    dt.clear();
    dt.rows.add(filtered);
    dt.draw();
  }

  $('#filter-agency').on('change', function () {
    if (locationType !== 1) return;
    let selectedAgency = $('#filter-agency').val();
    let selectedCompany = $('#filter-company').val();
    filterAndRedraw(selectedAgency, selectedCompany);
  });

  $('#filter-company').on('change', function () {
    let selectedCompany = $('#filter-company').val();
    let selectedAgency = (locationType === 1) ? $('#filter-agency').val() : undefined;
    filterAndRedraw(selectedAgency, selectedCompany);
  });

  $('#reset-filters-btn').on('click', function () {
    $('#filter-agency').val("");
    $('#filter-company').val("");
    if ($('#filter-agency').hasClass('selectpicker')) $('#filter-agency').selectpicker('val', "");
    if ($('#filter-company').hasClass('selectpicker')) $('#filter-company').selectpicker('val', "");
    filterAndRedraw("", "");
  });

  async function fetchCodes() {
    try {
      let url = '/users/codes/api';
      if (locationId) url += `?location_id=${locationId}`;
      const res = await fetch(url);
      let data = await res.json();
      codesData = Array.isArray(data) ? data : [];
      if (data.error) {
        $('#import-result').css('color', 'red').text("API Error: " + data.error);
        codesData = [];
      }
      dt.clear();
      // No mostramos location_id; solo filtramos por relevancia usando agenciesMap
      const visibleRows = codesData.filter(row => isAgencyRelevant(row.agency));
      dt.rows.add(visibleRows);
      dt.draw();

      // Deduplicate and refresh selects
      let allAgencies = visibleRows.map(r => r.agency);
      let allCompanies = visibleRows.map(r => r.company);
      updateAgencyFilter(allAgencies, "");
      updateCompanyFilter(allCompanies, "");
    } catch (err) {
      codesData = [];
      dt.clear().draw();
      $('#import-result').css('color', 'red').text("JS Error: " + err.message);
      updateAgencyFilter([], "");
      updateCompanyFilter([], "");
    }
  }

  $('#export-btn').on('click', function () {
    let url = '/users/codes/export';
    if (locationId) url += `?location_id=${locationId}`;
    window.location = url;
  });

  $('#import-btn').on('click', function () {
    $('#excel-input').click();
  });

  $('#excel-input').on('change', async function () {
    const file = this.files[0];
    if (!file) return;
    const validTypes = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "text/csv",
      "application/csv",
      "text/plain",
    ];
    const validExtensions = [".csv", ".xlsx", ".xls"];
    const fileName = file.name.toLowerCase();
    const isValidType = validTypes.includes(file.type) || validExtensions.some(ext => fileName.endsWith(ext));
    if (!isValidType) {
      showModal('Invalid File Type', 'Only Excel or CSV files are allowed.', 'error');
      return;
    }
    const formData = new FormData();
    formData.append("file", file);
    $('#import-btn').prop('disabled', true);
    try {
      const res = await fetch("/users/codes/import", { method: "POST", body: formData });
      const data = await res.json();
      if (data.error) {
        showModal('Import Error', data.error, 'error');
      } else {
        await fetchCodes();
      }
    } catch (err) {
      showModal('Import Error', 'Unexpected error during import.', 'error');
    }
    $('#import-btn').prop('disabled', false);
    $('#excel-input').val('');
    $('.custom-file-label').html('Choose file');
  });

  function showModal(title, message, type) {
    let icon = '';
    if (type === 'success') icon = '<i class="bi bi-check-circle-fill text-success me-2"></i>';
    else if (type === 'error') icon = '<i class="bi bi-x-circle-fill text-danger me-2"></i>';
    else icon = '';
    let modalId = 'codes-modal-feedback';
    let modalHtml = `
    <div class="modal fade" id="${modalId}" tabindex="-1" aria-labelledby="${modalId}-label">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title" id="${modalId}-label">${icon}${title}</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body">
            <div>${message}</div>
          </div>
        </div>
      </div>
    </div>
    `;
    $('#' + modalId).remove();
    $('body').append(modalHtml);
    let modal = new bootstrap.Modal(document.getElementById(modalId));
    modal.show();
  }

  fetchCodes();
});