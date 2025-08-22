"use strict";

/**
 * Policy Report by Location (aislado en IIFE para evitar globals).
 * - DataTable con modal de detalles por fila
 * - Mantiene contexto ?location,&start,&end en navegación
 * - Sin reinit de DataTables (guard + destroy)
 * - Modal inyectado desde JS, SIN avatares (igual que en Missing)
 * - Si location_type === 1 (corporativo), muestra filtro de franquicias en vez del badge de fechas/location
 * - NO muestra opción "All Franchises" en el select
 */
(function () {
  /* =========================
     Helpers (dates)
     ========================= */
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

  /* =========================
     Contexto de query (location + range) y actualización de nav links
     ========================= */
  function getQueryContext() {
    const p = new URLSearchParams(location.search);
    const start = parseAnyToISO(p.get("start"));
    const end = parseAnyToISO(p.get("end"));
    let locationIdRaw = p.get("location");
    // Si existe el select, úsalo
    const select = document.getElementById("franchise-select");
    if (select) {
      const selVal = select.value;
      if (selVal !== undefined && selVal !== "") locationIdRaw = selVal;
    }
    const locationId = locationIdRaw != null && locationIdRaw !== "" ? Number(locationIdRaw) : null;
    return { start, end, locationId };
  }
  function updateNavLinksWithContext({ start, end, locationId }) {
    try {
      const links = document.querySelectorAll(
        'a[href^="/users/missing-csr-producer"], a[href^="/users/policy-report-by-location"]'
      );
      links.forEach(a => {
        const url = new URL(a.getAttribute("href"), window.location.origin);
        if (locationId != null && !Number.isNaN(locationId)) url.searchParams.set("location", String(locationId));
        if (start && end) { url.searchParams.set("start", start); url.searchParams.set("end", end); }
        a.setAttribute("href", url.pathname + (url.search ? url.search : ""));
      });
    } catch (e) { console.warn("[PRL] Failed to update nav links with context:", e); }
  }

  /* =========================
     DataTable
     ========================= */
  let PRL_CTX = { start: null, end: null, locationId: null };
  let dt; let dtInitialized = false;

  function renderDateCell(d, t) {
    if (t === "display" || t === "filter") return safeDateDisp(d);
    const x = new Date(d || "");
    return isNaN(x.getTime()) ? 0 : x.getTime();
  }

  function initPolicyReportTable(rows) {
    const $table = $(".datatable-policy-report-by-location");
    if (!$table.length) { console.warn("[PRL] No table found with .datatable-policy-report-by-location"); return; }
    if (!$.fn || !$.fn.DataTable) { console.error("[PRL] DataTables is not loaded."); return; }

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
      order: [[6, "desc"]],
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
      paging: true, searching: true, info: true, lengthChange: true,
      pageLength: 25,
      lengthMenu: [[10, 25, 50, 100, -1], ["10", "25", "50", "100", "All"]],
      responsive: true, autoWidth: false,
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

    const $csvBtn = $table.closest(".card, .container, body")
      .find(".dataTables_wrapper .dt-buttons .buttons-csv, .dataTables_wrapper .dt-buttons .buttons-html5");
    $csvBtn.addClass("btn btn-sm btn-primary export-csv-btn");

    $table.off("click.prl", "tbody tr").on("click.prl", "tbody tr", function () {
      const row = dt.row(this).data();
      if (!row) return;
      openPolicyModal(row);
    });
  }

  /* =========================
     Modal (inyectado desde JS, sin avatar)
     ========================= */
  function ensurePolicyModal() {
    if (document.getElementById("prlRowDetailsModal")) return;

    // Estilos del modal
    const style = document.createElement("style");
    style.id = "prl-row-modal-css";
    style.textContent = `
      #prlRowDetailsModal{display:none;position:fixed;inset:0;background:rgba(15,18,22,.55);backdrop-filter:blur(2px);z-index:1055;align-items:center;justify-content:center;padding:20px;}
      #prlRowDetailsModal .modal-card{background:var(--bs-body-bg);color:var(--bs-body-color);border:1px solid var(--bs-border-color);border-radius:16px;width:min(920px,96vw);box-shadow:0 24px 60px rgba(0,0,0,.25);overflow:hidden;}
      #prlRowDetailsModal .modal-header{display:flex;align-items:center;gap:14px;padding:18px 22px;border-bottom:1px solid var(--bs-border-color);}
      #prlRowDetailsModal .modal-body{padding:20px 22px;}
      #prlRowDetailsModal .modal-footer{padding:14px 22px;border-top:1px solid var(--bs-border-color);display:flex;justify-content:flex-end;gap:10px;}
      #prlRowDetailsModal .title-wrap{display:flex;flex-direction:column;line-height:1.2}
      #prlRowDetailsModal .title-wrap .title{font-weight:700;font-size:1.15rem}
      #prlRowDetailsModal .title-wrap .subtitle{opacity:.8;font-size:.86rem}
      #prlRowDetailsModal .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:14px 18px;}
      @media (max-width:576px){#prlRowDetailsModal .grid{grid-template-columns:1fr;}}
      #prlRowDetailsModal .item{padding:14px;border:1px solid var(--bs-border-color);border-radius:12px;display:flex;align-items:flex-start;gap:10px;}
      #prlRowDetailsModal .item i{font-size:18px;color:var(--bs-primary);}
      #prlRowDetailsModal .meta{display:flex;flex-direction:column;gap:4px}
      #prlRowDetailsModal .label{font-size:12px;color:var(--bs-secondary-color);text-transform:uppercase;letter-spacing:.03em}
      #prlRowDetailsModal .value{font-size:15px;font-weight:600;word-break:break-word}
      #prlRowDetailsModal .btn-close-x{border:none;background:transparent;color:inherit;padding:6px 8px;border-radius:8px}
      #prlRowDetailsModal .btn-close-x:hover{background:rgba(0,0,0,.06)}
    `;
    document.head.appendChild(style);

    // Estructura del modal
    const wrapper = document.createElement("div");
    wrapper.id = "prlRowDetailsModal";
    wrapper.innerHTML = `
      <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="prlRowTitle">
        <div class="modal-header">
          <div class="title-wrap">
            <div id="prlRowTitle" class="title">Policy</div>
            <div id="prlRowSubtitle" class="subtitle">Details</div>
          </div>
          <button type="button" class="btn-close-x ms-auto" id="prlRowCloseTop" title="Close"><i class="ti ti-x"></i></button>
        </div>
        <div class="modal-body">
          <div class="grid" id="prlRowGrid"></div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-outline-secondary" id="prlRowCloseBottom">Close</button>
        </div>
      </div>
    `;
    document.body.appendChild(wrapper);

    // Cierre del modal
    const closeModal = () => { wrapper.style.display = "none"; };
    document.getElementById("prlRowCloseTop")?.addEventListener("click", closeModal);
    document.getElementById("prlRowCloseBottom")?.addEventListener("click", closeModal);
    wrapper.addEventListener("click", (e) => { if (e.target === wrapper) closeModal(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && wrapper.style.display === "flex") closeModal(); });
  }

  function openPolicyModal(row) {
    ensurePolicyModal();

    const policyNum = row?.policy_number || "";
    const lob = row?.line_of_business || "";

    const titleEl = document.getElementById("prlRowTitle");
    if (titleEl) titleEl.textContent = policyNum ? `Policy ${policyNum}` : "Policy";

    const subtitleEl = document.getElementById("prlRowSubtitle");
    if (subtitleEl) subtitleEl.textContent = lob ? `LOB: ${lob}` : "Details";

    const items = [
      { label: "Policy #",         icon: "ti ti-hash",           value: policyNum || "" },
      { label: "Line of Business", icon: "ti ti-briefcase",      value: lob || "" },
      { label: "Business Type",    icon: "ti ti-businessplan",   value: row?.business_type || "" },
      { label: "CSR",              icon: "ti ti-user",           value: row?.csr || "" },
      { label: "Producer(s)",      icon: "ti ti-users",          value: row?.producer || "" },
      { label: "Binder Date",      icon: "ti ti-calendar",       value: safeDateDisp(row?.binder_date) },
      { label: "Effective Date",   icon: "ti ti-calendar-stats", value: safeDateDisp(row?.effective_date) },
      { label: "Location",         icon: "ti ti-map-pin",        value: row?.location || "" },
      { label: "Policy Status",    icon: "ti ti-info-circle",    value: row?.policy_status || "" }
    ];

    const grid = document.getElementById("prlRowGrid");
    if (grid) {
      grid.innerHTML = items.map(it => `
        <div class="item">
          <i class="${it.icon}"></i>
          <div class="meta">
            <div class="label">${it.label}</div>
            <div class="value">${it.value ?? ""}</div>
          </div>
        </div>
      `).join("");
    }

    const modal = document.getElementById("prlRowDetailsModal");
    if (modal) modal.style.display = "flex";
  }

  /* =========================
     Update table
     ========================= */
  function updatePolicyReportTable(rows) {
    if (!dtInitialized) { initPolicyReportTable(rows); return; }
    dt.clear(); dt.rows.add(rows || []); dt.draw(false);
  }

  /* =========================
     Fetch + Render
     ========================= */
  async function fetchAndRenderPolicyReport(startISO, endISO, opts = {}) {
    try {
      const params = new URLSearchParams();
      if (opts.all === true) {
        params.set("start", "all"); params.set("end", "all");
      } else {
        if (startISO) params.set("start", startISO);
        if (endISO) params.set("end", endISO);
      }
      // Si hay franquicia seleccionada, agrégala al query
      const select = document.getElementById("franchise-select");
      let locationId = PRL_CTX.locationId;
      if (select && select.value !== "") locationId = select.value;
      if (locationId != null && !Number.isNaN(locationId)) {
        params.set("location", String(locationId));
      }

      const DEBUG = false;
      if (DEBUG) params.set("debug", "1");

      const url = `/api/policy-report-by-location?${params.toString()}`;
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

      updatePolicyReportTable(data.rows || []);

      // Actualiza UI del filtro franquicia/alias
      if (data.location_type === 1 && Array.isArray(data.franchises)) {
        // Solo franquicias, SIN opción "All Franchises"
        let options = "";
        data.franchises.forEach(fr => {
          options += `<option value="${fr.location_id}">${fr.alias}</option>`;
        });
        $("#franchise-select").html(options).show();
        $("#prl-selected-range").hide();
      } else {
        $("#franchise-select").hide();
        $("#prl-selected-range").text(data.location_alias || "—").show();
      }
    } catch (e) {
      console.error("Error fetching policy report:", e);
      alert("Error loading data: " + (e?.message || e));
    }
  }

  /* =========================
     Bootstrap
     ========================= */
  $(function () {
    PRL_CTX = getQueryContext();

    if (PRL_CTX.start) $("#prl-start").val(PRL_CTX.start);
    if (PRL_CTX.end) $("#prl-end").val(PRL_CTX.end);

    updateNavLinksWithContext(PRL_CTX);

    const init = window.PRL_INITIAL || null;
    if (init) {
      updatePolicyReportTable(init.rows || []);
      // UI inicial: franquicia o alias
      if (init.location_type === 1 && Array.isArray(init.franchises)) {
        let options = "";
        init.franchises.forEach(fr => {
          options += `<option value="${fr.location_id}">${fr.alias}</option>`;
        });
        if (!$("#franchise-select").length) {
          // Crea el select si no existe
          $(".d-flex.flex-wrap.align-items-center.gap-2")
            .append(`<select id="franchise-select" class="form-select ms-auto" style="min-width:200px;"></select>`);
        }
        $("#franchise-select").html(options).show();
        // Selecciona la franquicia correcta por id
        $("#franchise-select").val(init.selectedFranchiseId || PRL_CTX.locationId || "");
        $("#prl-selected-range").hide();
      } else {
        if (!$("#prl-selected-range").length) {
          $(".d-flex.flex-wrap.align-items-center.gap-2")
            .append(`<span class="badge bg-primary ms-auto text-white" id="prl-selected-range">${init.location_alias || "—"}</span>`);
        } else {
          $("#prl-selected-range").text(init.location_alias || "—").show();
        }
        $("#franchise-select").hide();
      }
    }

    // Cambio de franquicia: recargar resultados
    $("#franchise-select").on("change", function () {
      PRL_CTX.locationId = $(this).val() || null;
      $("#prl-apply").trigger("click");
    });

    // Botón Apply
    $("#prl-apply").on("click", function () {
      const startISO = formatDateISO($("#prl-start").val());
      const endISO   = formatDateISO($("#prl-end").val());

      const select = document.getElementById("franchise-select");
      let locationId = select && select.value !== "" ? select.value : PRL_CTX.locationId;
      PRL_CTX.locationId = locationId;

      if (!startISO && !endISO) { fetchAndRenderPolicyReport(null, null, { all: true }); return; }
      if (!startISO || !endISO)  { alert("Select both start and end dates"); return; }

      const swap = new Date(startISO) > new Date(endISO);
      const s = swap ? endISO : startISO;
      const e = swap ? startISO : endISO;
      fetchAndRenderPolicyReport(s, e);
    });

    flatpickr("#prl-start", {
      dateFormat: "Y-m-d",
      allowInput: true
    });
    flatpickr("#prl-end", {
      dateFormat: "Y-m-d",
      allowInput: true
    });
  });
})();