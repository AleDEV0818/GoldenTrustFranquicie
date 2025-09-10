"use strict";

/**
 * Franchise Errors (frontend)
 * - Muestra A. Polices (azul) y A. Client (azul) una al lado de la otra.
 * - Orden default por Total errors desc.
 * - Fetch solo al presionar Apply.
 */
(function () {
  // Loading modal (SweetAlert2)
  function showSearchLoading(title = "Loading Data") {
    if (!window.Swal) return;
    Swal.fire({
      title,
      html: `
        <div style="display:flex;flex-direction:column;align-items:center;">
          <div class="spinner-border text-primary" style="width:4rem;height:4rem;border-width:.5em;margin-bottom:1.2rem;box-shadow:0 4px 32px rgba(0,0,0,.15);opacity:.85;" role="status">
            <span class="visually-hidden">Loading...</span>
          </div>
          <div style="font-size:1.1rem;color:#5370f0;opacity:.8;font-weight:500;">
            Please wait while we find your results
          </div>
        </div>
      `,
      background: "rgba(30,34,54,0.95)",
      color: "#fff",
      allowOutsideClick: false,
      showConfirmButton: false
    });
  }
  function hideSearchLoading() { if (window.Swal) Swal.close(); }

  // Helpers
  function getInitials(name) {
    if (!name) return "--";
    const parts = String(name).trim().split(/\s+/);
    if (!parts.length) return "--";
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  const AVATAR_COLORS = ["#4ECDC4","#FF6B6B","#45B7D1","#FFBE0B","#FB5607","#8338EC","#3A86FF","#FF006E","#6A994E","#A7C957"];
  function stringToNiceColor(str) {
    if (!str) return AVATAR_COLORS[0];
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
  }
  function intDisp(val) {
    const n = Number(String(val ?? "").replace(/[^\d\-]/g, ""));
    return Number.isFinite(n) ? n.toLocaleString("en-US") : (val ?? "0");
  }
  function asInt(val) {
    const n = Number(String(val ?? "").replace(/[^\d\-]/g, ""));
    return Number.isFinite(n) ? n : 0;
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
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }

  // QS location override
  function getLocationOverrideFromQS() {
    const p = new URLSearchParams(location.search);
    const v = p.get("locationId") ?? p.get("location");
    if (!v) return null;
    const n = Number(v);
    return Number.isFinite(n) ? String(n) : null;
  }

  // IDs UI
  const IDS = { start: "fr-errors-start", end: "fr-errors-end", apply: "fr-errors-apply", badge: "selected-range", active: "frx-active-only" };

  function getRangeFromControls() {
    const active = !!document.getElementById(IDS.active)?.checked;
    const s1 = parseAnyToISO(document.getElementById(IDS.start)?.value || "");
    const e1 = parseAnyToISO(document.getElementById(IDS.end)?.value || "");
    return { start: s1, end: e1, active };
  }

  function updateBadge(start, end, active) {
    const badge = document.getElementById(IDS.badge);
    if (!badge) return;
    if (active && !(start && end)) { badge.textContent = "—"; return; }
    badge.textContent = (start && end) ? `${start} → ${end}` : "—";
  }

  // Navegación (PRL/MCP/MCI)
  function buildTargetUrl(kind, locationId, range) {
    let base = "";
    if (kind === "prl") base = "/users/policy-report-by-location";
    else if (kind === "mcp") base = "/users/missing-csr-producer";
    else if (kind === "mci") base = "/users/missing-contact-errors";
    else base = "/";
    const u = new URL(base, window.location.origin);
    if (locationId != null) u.searchParams.set("location", String(locationId));
    if (range?.active) {
      u.searchParams.set("active", "1");
      if (range.start && range.end) {
        u.searchParams.set("start", range.start);
        u.searchParams.set("end", range.end);
      } else {
        u.searchParams.set("start", "all");
        u.searchParams.set("end", "all");
      }
    } else {
      if (range?.start) u.searchParams.set("start", range.start);
      if (range?.end) u.searchParams.set("end", range.end);
    }
    return u.pathname + u.search;
  }

  // DataTable
  let dt; let dtInitialized = false;

  function renderFranchiseCell(data, type, row) {
    const name = row?.franchise || row?.name || data || "";
    if (type === "display") {
      const initials = getInitials(name);
      const bg = stringToNiceColor(name);
      return `
        <div class="d-flex align-items-center">
          <span class="rounded-circle me-2 d-inline-flex justify-content-center align-items-center"
            style="width:36px;height:36px;background:${bg};color:#fff;font-weight:700;font-size:14px;box-shadow:0 1px 3px rgba(0,0,0,.08);">
            ${initials}
          </span>
          <span class="text-body fw-semibold">${name}</span>
        </div>
      `;
    }
    if (type === "sort") return (name || "").toLowerCase();
    return name;
  }
  function renderNumberCell(d, t) {
    const n = asInt(d);
    if (t === "display" || t === "filter") return intDisp(n);
    return n;
  }

  function initFranchiseErrorsTable(rows) {
    const $table = $(".datatable-franchise-errors");
    if (!$table.length) return;
    if (!$.fn || !$.fn.DataTable) { console.error("[FRX] DataTables is not loaded."); return; }

    if ($.fn.DataTable.isDataTable($table)) {
      const existing = $table.DataTable();
      existing.clear().rows.add(rows || []).draw(false);
      dt = existing; dtInitialized = true; return;
    }

    const hasButtons = !!($.fn.dataTable && $.fn.dataTable.Buttons);
    const domLayout = hasButtons
      ? '<"row mb-2"<"col-12 col-md-4"l><"col-12 col-md-4"f><"col-12 col-md-4 d-flex justify-content-end"B>>rtip'
      : '<"row mb-2"<"col-12 col-md-6"l><"col-12 col-md-6"f>>rtip';

    const dtOptions = {
      destroy: true,
      data: rows || [],
      ordering: true,
      order: [[3, "desc"]], // Total errors desc por defecto (col 3 ahora)
      columns: [
        { data: "franchise",            title: "Franchise",                 className: "align-middle",                              render: renderFranchiseCell },
        { data: "active_police",        title: "A. Polices",                className: "text-end align-middle col-active-policies", render: renderNumberCell },
        { data: "active_clients",       title: "A. Client",                 className: "text-end align-middle col-active-clients",  render: renderNumberCell },
        { data: "total_errors",         title: "Total errors",              className: "text-end align-middle col-total-errors",    render: renderNumberCell },
        { data: "binder_errors",        title: "Binder errors",             className: "text-end align-middle",                     render: renderNumberCell },
        { data: "csr_total",            title: "Missing CSR",               className: "text-end align-middle",                     render: renderNumberCell },
        { data: "producer_total",       title: "Missing Producer",          className: "text-end align-middle",                     render: renderNumberCell },
        { data: "missing_any_total",    title: "Missing (any)",             className: "text-end align-middle",                     render: renderNumberCell },
        { data: "missing_contact_info", title: "Missing Contact Info",      className: "text-end align-middle",                     render: renderNumberCell }
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
        search: "Search Locations:",
        lengthMenu: "Show _MENU_ franchises",
        zeroRecords: "No franchises found",
        info: "Showing _START_ to _END_ of _TOTAL_ franchises",
        infoEmpty: "No franchises available",
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
        title: "Franchise_Errors",
        filename: "Franchise_Errors",
        bom: true,
        exportOptions: { columns: ":visible" }
      }];
    }

    dt = $table.DataTable(dtOptions);
    dtInitialized = true;

    // Navegación por celda con el mismo contexto (active + rango si hay)
    $table.off("click.frx", "tbody td").on("click.frx", "tbody td", function (e) {
      const cellIdx = dt.cell(this)?.index();
      if (!cellIdx) return;

      const colIndex = cellIdx.column;
      const headerText = ($(dt.column(colIndex).header()).text() || "").trim().toLowerCase();
      const rowData = dt.row(this).data() || {};
      const locationId = rowData.location_id || rowData.locationId || rowData.id || null;

      const { start, end, active } = getRangeFromControls();
      const range = { start, end, active };

      if (!locationId) return;

      if (headerText.includes("binder")) {
        e.preventDefault(); e.stopPropagation();
        openInNewTab(buildTargetUrl("prl", locationId, range));
      } else if (
        headerText.includes("missing csr") ||
        headerText.includes("missing producer") ||
        headerText.includes("missing (any)") ||
        headerText.includes("missing any") ||
        headerText.includes("total error")
      ) {
        e.preventDefault(); e.stopPropagation();
        openInNewTab(buildTargetUrl("mcp", locationId, range));
      } else if (headerText.includes("contact info")) {
        e.preventDefault(); e.stopPropagation();
        openInNewTab(buildTargetUrl("mci", locationId, range));
      }
      // No navegación para A. Polices ni A. Client.
    });
  }

  function updateFranchiseErrorsTable(rows) {
    if (!dtInitialized) { initFranchiseErrorsTable(rows); return; }
    dt.clear(); dt.rows.add(rows || []); dt.draw(false);
  }

  // Fetch + render
  async function fetchAndRenderFranchiseErrors(startISO, endISO) {
    showSearchLoading("Loading Franchise Errors");
    try {
      const params = new URLSearchParams();

      const activeOnly = !!document.getElementById(IDS.active)?.checked;
      if (activeOnly) {
        params.set("active", "1");
        if (startISO && endISO) {
          params.set("start", startISO);
          params.set("end", endISO);
        } else {
          params.set("start", "all");
          params.set("end", "all");
        }
      } else {
        if (startISO) params.set("start", startISO);
        if (endISO) params.set("end", endISO);
      }

      const locOverride = getLocationOverrideFromQS();
      if (locOverride) params.set("locationId", locOverride);

      const url = `/api/franchise-errors-panel?${params.toString()}`;
      const res = await fetch(url, {
        cache: "no-store",
        credentials: "same-origin",
        headers: { "X-Requested-With": "XMLHttpRequest" }
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`Fetch failed: ${res.status} ${txt}`);
      }
      const data = await res.json();
      updateFranchiseErrorsTable(data.rows || []);
      updateBadge(data.range?.startISO || startISO, data.range?.endISO || endISO, !!data.activeOnly);
    } catch (e) {
      console.error("[FRX] Error fetching franchise errors:", e);
      alert("Error loading data: " + (e?.message || e));
    } finally {
      hideSearchLoading();
    }
  }

  // Exponer si se requiere
  window.fetchAndRenderFranchiseErrors = fetchAndRenderFranchiseErrors;

  document.addEventListener("DOMContentLoaded", function () {
    updateBadge(null, null, !!document.getElementById(IDS.active)?.checked);

    const applyBtn = document.getElementById(IDS.apply);
    if (applyBtn) {
      applyBtn.addEventListener("click", function () {
        const { start, end, active } = getRangeFromControls();

        if (active) {
          fetchAndRenderFranchiseErrors(start, end);
          return;
        }

        if (!start || !end) {
          fetchAndRenderFranchiseErrors(null, null);
          return;
        }
        const swap = new Date(start) > new Date(end);
        const s2 = swap ? end : start;
        const e2 = swap ? start : end;
        fetchAndRenderFranchiseErrors(s2, e2);
      });
    }

    const activeEl = document.getElementById(IDS.active);
    if (activeEl) {
      activeEl.addEventListener("change", function () {
        const { start, end, active } = getRangeFromControls();
        updateBadge(start, end, active);
      });
    }

    if (window.flatpickr) {
      flatpickr("#fr-errors-start", { dateFormat: "Y-m-d", allowInput: true });
      flatpickr("#fr-errors-end",   { dateFormat: "Y-m-d", allowInput: true });
    }
  });

  function openInNewTab(url) {
    const w = window.open(url, "_blank");
    if (w) w.opener = null;
  }
})();