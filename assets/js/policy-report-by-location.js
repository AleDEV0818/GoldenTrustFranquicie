"use strict";

/**
 * Policy Report by Location (frontend)
 * - KPI "Binder Errors" = total de filas visibles actualmente en DataTable (tras search/order/page/length).
 * - Se actualiza en cada draw de DataTables y cuando se recarga la tabla.
 * - "Active Policies" sigue actualizándose automáticamente al cambiar el selector (endpoint ligero).
 */
(function () {
  function formatDateISO(d) {
    if (!d) return null;
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return null;
    return dt.toISOString().slice(0, 10);
  }
  function safeDateDisp(v) {
    if (!v) return "";
    try {
      const d = new Date(v);
      if (isNaN(d.getTime())) return "";
      return d.toISOString().slice(0, 10);
    } catch { return ""; }
  }
  function parseAnyToISO(s) {
    if (!s || typeof s !== "string") return null;
    const v = s.trim();
    if (!v) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    const m = v.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (m) {
      const dd = String(m[1]).padStart(2, "0");
      const mm = String(m[2]).padStart(2, "0");
      const yyyy = m[3];
      return `${yyyy}-${mm}-${dd}`;
    }
    return formatDateISO(v);
  }
  function intDisp(n) {
    const x = Number(n);
    return Number.isFinite(x) ? x.toLocaleString("en-US") : "0";
  }

  function getQueryContext() {
    const p = new URLSearchParams(location.search);
    const start = parseAnyToISO(p.get("start"));
    const end = parseAnyToISO(p.get("end"));
    const activeRaw = (p.get("active") || "").toLowerCase();
    const active = activeRaw === "1" || activeRaw === "true" || activeRaw === "on" || activeRaw === "yes";

    let locationIdRaw = p.get("location");
    const select = document.getElementById("franchise-select");
    if (select) {
      const selVal = select.value;
      if (selVal !== undefined && selVal !== "") locationIdRaw = selVal;
    }
    const locationId = locationIdRaw != null && locationIdRaw !== "" ? Number(locationIdRaw) : null;
    return { start, end, locationId, active };
  }

  function updateNavLinksWithContext({ start, end, locationId, active }) {
    try {
      const links = document.querySelectorAll(
        'a[href^="/users/missing-csr-producer"], a[href^="/users/policy-report-by-location"]'
      );
      links.forEach(a => {
        const url = new URL(a.getAttribute("href"), window.location.origin);
        if (locationId != null && !Number.isNaN(locationId)) url.searchParams.set("location", String(locationId));
        if (active) url.searchParams.set("active", "1"); else url.searchParams.delete("active");
        if (start && end) {
          url.searchParams.set("start", start);
          url.searchParams.set("end", end);
        } else {
          url.searchParams.delete("start");
          url.searchParams.delete("end");
        }
        a.setAttribute("href", url.pathname + (url.search ? url.search : ""));
      });
    } catch {}
  }

  let PRL_CTX = { start: null, end: null, locationId: null, active: false };
  let dt; let dtInitialized = false;

  function renderDateCell(d, t) {
    if (t === "display" || t === "filter") return safeDateDisp(d);
    const x = new Date(d || "");
    return isNaN(x.getTime()) ? 0 : x.getTime();
  }

  function forceAllColumns(rows) {
    const keys = [
      "policy_number",
      "line_of_business",
      "business_type",
      "csr",
      "producer",
      "binder_date",
      "effective_date",
      "location",
      "policy_status"
    ];
    return (rows || []).map(row => {
      const obj = {};
      keys.forEach(k => { obj[k] = row && typeof row[k] !== "undefined" ? row[k] : ""; });
      return obj;
    });
  }

  // KPIs
  function updateActivePoliciesCount(count) {
    const el = document.getElementById("prl-active-policies-count");
    if (!el) return;
    const n = Number(count);
    el.textContent = Number.isFinite(n) ? n.toLocaleString("en-US") : "0";
  }
  function updateBinderErrorsCount(count) {
    const el = document.getElementById("prl-binder-errors-count");
    if (!el) return;
    const n = Number(count);
    el.textContent = Number.isFinite(n) ? n.toLocaleString("en-US") : "0";
  }

  // Importante: ignorar la fila "placeholder" vacía del backend para no contarla
  function isNonEmptyRow(r) {
    if (!r || typeof r !== "object") return false;
    const fields = [
      "policy_number",
      "line_of_business",
      "business_type",
      "csr",
      "producer",
      "binder_date",
      "effective_date",
      "location",
      "policy_status"
    ];
    return fields.some(k => String(r[k] || "").trim() !== "");
  }

  // Total que "aparece" en la DataTable con filtros/búsqueda aplicados
  function updateBinderErrorsFromTable() {
    if (!dt) return;
    const data = dt.rows({ search: "applied" }).data().toArray();
    const count = data.filter(isNonEmptyRow).length;
    updateBinderErrorsCount(count);
  }

  function initPolicyReportTable(rows) {
    const $table = $(".datatable-policy-report-by-location");
    if (!$table.length || !$.fn || !$.fn.DataTable) return;

    if ($.fn.DataTable.isDataTable($table)) {
      const existing = $table.DataTable();
      existing.clear().rows.add(rows || []).draw(false);
      dt = existing; dtInitialized = true;
      updateBinderErrorsFromTable();
      return;
    }

    const hasButtons = !!($.fn.dataTable && $.fn.dataTable.Buttons);
    const domLayout = hasButtons
      ? '<"row mb-2"<"col-12 col-md-4"l><"col-12 col-md-4"f><"col-12 col-md-4 d-flex justify-content-end"B>>rtip'
      : '<"row mb-2"<"col-12 col-md-6"l><"col-12 col-md-6"f>>rtip';

    const dtOptions = {
      destroy: true,
      data: rows || [],
      ordering: true,
      order: [[6, "desc"]],
      scrollX: true,
      columns: [
        { data: "policy_number",    title: "Policy #",        className: "text-nowrap" },
        { data: "line_of_business", title: "Line of Business" },
        { data: "business_type",    title: "Business Type",   className: "text-nowrap" },
        { data: "csr",              title: "CSR",             className: "text-nowrap" },
        { data: "producer",         title: "Producer",        className: "text-nowrap" },
        { data: "binder_date",      title: "Binder Date",     className: "text-nowrap text-end", render: renderDateCell },
        { data: "effective_date",   title: "Effective Date",  className: "text-nowrap text-end", render: renderDateCell },
        { data: "location",         title: "Location",        className: "text-nowrap" },
        { data: "policy_status",    title: "Policy Status",   className: "text-nowrap" }
      ],
      dom: domLayout,
      paging: true,
      searching: true,
      info: true,
      lengthChange: true,
      pageLength: 25,
      lengthMenu: [[10, 25, 50, 100, -1], ["10", "25", "50", "100", "All"]],
      responsive: true,
      autoWidth: false,
      language: {
        url: "//cdn.datatables.net/plug-ins/1.13.7/i18n/en-GB.json",
        search: "Search:",
        lengthMenu: "Show _MENU_ policies",
        zeroRecords: "No policies found",
        info: "Showing _START_ to _END_ of _TOTAL_ policies",
        infoEmpty: "No policies available",
        infoFiltered: "(filtered from _MAX_ total)",
        paginate: { previous: "←", next: "→" }
      }
    };

    if (hasButtons) {
      dtOptions.buttons = [{
        extend: "csvHtml5",
        text: '<i class="ti ti-file-spreadsheet me-1"></i><span class="export-csv-label">Export CSV</span>',
        className: "dt-button export-csv-btn btn btn-sm btn-primary",
        titleAttr: "Export CSV",
        title: "Policy_Report_By_Location",
        filename: "Policy_Report_By_Location",
        bom: true,
        exportOptions: { columns: ":visible" }
      }];
    }

    dt = $table.DataTable(dtOptions);
    dtInitialized = true;

    // Mantener KPI sincronizado con lo que aparece en la tabla
    dt.on("draw.dt search.dt order.dt page.dt length.dt", function () {
      updateBinderErrorsFromTable();
    });

    // Inicial
    updateBinderErrorsFromTable();
  }

  function updatePolicyReportTable(rows) {
    if (!dtInitialized) { initPolicyReportTable(rows); return; }
    dt.clear(); dt.rows.add(rows || []); dt.draw(false);
    updateBinderErrorsFromTable();
  }

  async function fetchActivePoliciesCount(locationId) {
    if (locationId == null || Number.isNaN(Number(locationId))) return;
    try {
      const url = `/api/active-policies-count?location=${encodeURIComponent(locationId)}`;
      const res = await fetch(url, { cache: "no-store", credentials: "same-origin", headers: { "X-Requested-With": "XMLHttpRequest" } });
      if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
      const data = await res.json();
      updateActivePoliciesCount(data.count || 0);
    } catch {}
  }

  async function fetchAndRenderPolicyReport(startISO, endISO) {
    try {
      const params = new URLSearchParams();

      const select = document.getElementById("franchise-select");
      let locationId = PRL_CTX.locationId;
      if (select && select.value !== "") locationId = select.value;
      if (locationId != null && !Number.isNaN(locationId)) {
        params.set("location", String(locationId));
      }

      const activeChk = document.getElementById("prl-active-only");
      const activeOnly = !!(activeChk && activeChk.checked);
      if (activeOnly) params.set("active", "1");

      if (startISO && endISO) {
        params.set("start", startISO);
        params.set("end", endISO);
      }

      const url = `/api/policy-report-by-location?${params.toString()}`;
      const res = await fetch(url, {
        cache: "no-store",
        credentials: "same-origin",
        headers: { "X-Requested-With": "XMLHttpRequest" }
      });
      if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
      const data = await res.json();

      updatePolicyReportTable(forceAllColumns(data.rows || []));
      if (typeof data.activePoliciesCount === "number") {
        updateActivePoliciesCount(data.activePoliciesCount);
      }

      PRL_CTX.active = !!data.activeOnly;
      PRL_CTX.start = data.range?.startISO || null;
      PRL_CTX.end = data.range?.endISO || null;
      updateNavLinksWithContext({
        start: PRL_CTX.start,
        end: PRL_CTX.end,
        locationId: PRL_CTX.locationId,
        active: PRL_CTX.active
      });
    } catch (e) {
      alert("Error loading data");
    }
  }

  $(function () {
    PRL_CTX = getQueryContext();

    if (window.flatpickr) {
      flatpickr("#prl-start", { dateFormat: "Y-m-d", allowInput: true });
      flatpickr("#prl-end",   { dateFormat: "Y-m-d", allowInput: true });
    }

    if (PRL_CTX.start) $("#prl-start").val(PRL_CTX.start);
    if (PRL_CTX.end) $("#prl-end").val(PRL_CTX.end);

    const activeChk = document.getElementById("prl-active-only");
    if (activeChk) activeChk.checked = !!PRL_CTX.active;

    const init = window.PRL_INITIAL || null;
    if (init) {
      const rows = Array.isArray(init.rows) ? init.rows : [];
      updatePolicyReportTable(rows);
      if (typeof init.activePoliciesCount === "number") {
        updateActivePoliciesCount(init.activePoliciesCount);
      }
    }

    // Si hay location inicial, actualizar Active Policies
    if (PRL_CTX.locationId != null) {
      fetchActivePoliciesCount(PRL_CTX.locationId);
    }

    // Cambiar franquicia: actualiza Active Policies de inmediato;
    // el KPI de Binder se actualizará cuando recargues la tabla (Apply).
    $("#franchise-select").on("change", function () {
      PRL_CTX.locationId = $(this).val() || null;
      fetchActivePoliciesCount(PRL_CTX.locationId);
    });

    // Apply => refrescar tabla (y el KPI Binder se recalcula desde DataTable)
    $("#prl-apply").on("click", function () {
      const rawStart = $("#prl-start").val();
      const rawEnd = $("#prl-end").val();
      const startISO = formatDateISO(rawStart);
      const endISO   = formatDateISO(rawEnd);
      fetchAndRenderPolicyReport(startISO || null, endISO || null);
    });
  });
})();