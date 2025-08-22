"use strict";

/**
 * Missing CSR/Producer screen script (aislado en IIFE para evitar globals).
 * - DataTable con modal de detalles por fila
 * - Mantiene contexto ?location,&start,&end en navegación
 * - Sin reinit de DataTables (guard + destroy)
 * - Alias: SE MANTIENE la detección, pero NO se muestra chip en navbar ni avatar en modal
 * - Agrega soporte para select de franquicia/location
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
    } catch {
      return "";
    }
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
    const select = document.getElementById("location-select");
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
        if (start && end) {
          url.searchParams.set("start", start);
          url.searchParams.set("end", end);
        }
        a.setAttribute("href", url.pathname + (url.search ? url.search : ""));
      });
    } catch (e) {
      console.warn("[MCP] Failed to update nav links with context:", e);
    }
  }
  let MCP_CTX = { start: null, end: null, locationId: null };

  /* =========================
     Alias de Location: mantenerlo pero NO mostrar chip en navbar
     ========================= */
  function setLocationAliasBadge(alias) {
    const existingChip = document.getElementById("mcp-location-alias-chip");
    if (existingChip && existingChip.parentNode) existingChip.parentNode.removeChild(existingChip);
    const fixed = document.getElementById("mcp-location-alias-fixed");
    if (fixed && fixed.parentNode) fixed.parentNode.removeChild(fixed);
    const css = document.getElementById("mcp-location-alias-css");
    if (css && css.parentNode) css.parentNode.removeChild(css);
  }

  function updateLocationAliasFromData(data) {
    if (MCP_CTX.locationId == null || Number.isNaN(MCP_CTX.locationId)) {
      setLocationAliasBadge(null);
      return;
    }
    let alias = null;

    if (typeof window.MCP_LOCATION_ALIAS === "string" && window.MCP_LOCATION_ALIAS.trim()) {
      alias = window.MCP_LOCATION_ALIAS.trim();
    }
    if (!alias && data && typeof data.locationAlias === "string" && data.locationAlias.trim()) {
      alias = data.locationAlias.trim();
    }
    if (!alias && data && data.meta && typeof data.meta.locationAlias === "string" && data.meta.locationAlias.trim()) {
      alias = data.meta.locationAlias.trim();
    }
    if (!alias && data && Array.isArray(data.rows) && data.rows.length) {
      const withLoc = data.rows.find(r => r && r.location) || data.rows[0];
      if (withLoc && withLoc.location) alias = String(withLoc.location).trim();
    }
    if (!alias) alias = `Location ${MCP_CTX.locationId}`;

    setLocationAliasBadge(alias);
  }

  /* =========================
     DataTable
     ========================= */
  let dt;
  let dtInitialized = false;

  function renderDateCell(d, t) {
    if (t === "display" || t === "filter") return safeDateDisp(d);
    const x = new Date(d || "");
    return isNaN(x.getTime()) ? 0 : x.getTime();
  }

  function initMissingPoliciesTable(rows) {
    const $table = $(".datatable-missing-csr-producer");
    if ($table.length === 0) {
      console.warn("[MCP] No table found with .datatable-missing-csr-producer");
      return;
    }
    if (!$.fn || !$.fn.DataTable) {
      console.error("[MCP] DataTables is not loaded. Include datatables JS.");
      return;
    }

    if ($.fn.DataTable.isDataTable($table)) {
      const existing = $table.DataTable();
      existing.clear();
      existing.rows.add(rows || []);
      existing.draw(false);
      dt = existing;
      dtInitialized = true;
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
      columns: [
        { data: "policy_number",   title: "Policy #",        className: "text-nowrap" },
        { data: "line_of_business",title: "Line of Business" },
        { data: "business_type",   title: "Business Type",   className: "text-nowrap" },
        { data: "csr",             title: "CSR",             className: "text-nowrap" },
        { data: "producer",        title: "Producer",        className: "text-nowrap" },
        { data: "binder_date",     title: "Binder Date",     className: "text-nowrap text-end", render: renderDateCell },
        { data: "effective_date",  title: "Effective Date",  className: "text-nowrap text-end", render: renderDateCell },
        { data: "location",        title: "Location",        className: "text-nowrap" },
        { data: "policy_status",   title: "Policy Status",   className: "text-nowrap" }
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
      dtOptions.buttons = [
        {
          extend: "csvHtml5",
          text: '<i class="ti ti-file-spreadsheet me-1"></i><span class="export-csv-label">Export CSV</span>',
          className: "dt-button export-csv-btn btn btn-sm btn-primary",
          titleAttr: "Export CSV",
          title: "Policies_Missing_CSR_or_Producer",
          filename: "Policies_Missing_CSR_or_Producer",
          bom: true,
          exportOptions: { columns: ":visible" }
        }
      ];
    } else {
      console.warn("[MCP] DataTables Buttons not loaded; CSV export will not appear.");
    }

    dt = $table.DataTable(dtOptions);
    dtInitialized = true;

    const $csvBtn = $table.closest(".card, .container, body")
      .find(".dataTables_wrapper .dt-buttons .buttons-csv, .dataTables_wrapper .dt-buttons .buttons-html5");
    $csvBtn.addClass("btn btn-sm btn-primary export-csv-btn");

    $table.off("click.mcp", "tbody tr").on("click.mcp", "tbody tr", function () {
      const row = dt.row(this).data();
      if (!row) return;
      openPolicyModal(row);
    });
  }

  function ensurePolicyModal() {
    if (document.getElementById("mcpRowDetailsModal")) return;

    const style = document.createElement("style");
    style.id = "mcp-row-modal-css";
    style.textContent = `
      #mcpRowDetailsModal{display:none;position:fixed;inset:0;background:rgba(15,18,22,.55);backdrop-filter:blur(2px);z-index:1055;align-items:center;justify-content:center;padding:20px;}
      #mcpRowDetailsModal .modal-card{background:var(--bs-body-bg);color:var(--bs-body-color);border:1px solid var(--bs-border-color);border-radius:16px;width:min(920px,96vw);box-shadow:0 24px 60px rgba(0,0,0,.25);overflow:hidden;}
      #mcpRowDetailsModal .modal-header{display:flex;align-items:center;gap:14px;padding:18px 22px;border-bottom:1px solid var(--bs-border-color);}
      #mcpRowDetailsModal .modal-body{padding:20px 22px;}
      #mcpRowDetailsModal .modal-footer{padding:14px 22px;border-top:1px solid var(--bs-border-color);display:flex;justify-content:flex-end;gap:10px;}
      #mcpRowDetailsModal .title-wrap{display:flex;flex-direction:column;line-height:1.2}
      #mcpRowDetailsModal .title-wrap .title{font-weight:700;font-size:1.15rem}
      #mcpRowDetailsModal .title-wrap .subtitle{opacity:.8;font-size:.86rem}
      #mcpRowDetailsModal .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:14px 18px;}
      @media (max-width:576px){#mcpRowDetailsModal .grid{grid-template-columns:1fr;}}
      #mcpRowDetailsModal .item{padding:14px;border:1px solid var(--bs-border-color);border-radius:12px;display:flex;align-items:flex-start;gap:10px;}
      #mcpRowDetailsModal .item i{font-size:18px;color:var(--bs-primary);}
      #mcpRowDetailsModal .meta{display:flex;flex-direction:column;gap:4px}
      #mcpRowDetailsModal .label{font-size:12px;color:var(--bs-secondary-color);text-transform:uppercase;letter-spacing:.03em}
      #mcpRowDetailsModal .value{font-size:15px;font-weight:600;word-break:break-word}
      #mcpRowDetailsModal .btn-close-x{border:none;background:transparent;color:inherit;padding:6px 8px;border-radius:8px}
      #mcpRowDetailsModal .btn-close-x:hover{background:rgba(0,0,0,.06)}
    `;
    document.head.appendChild(style);

    const wrapper = document.createElement("div");
    wrapper.id = "mcpRowDetailsModal";
    wrapper.innerHTML = `
      <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="mcpRowTitle">
        <div class="modal-header">
          <div class="title-wrap">
            <div id="mcpRowTitle" class="title">Policy</div>
            <div id="mcpRowSubtitle" class="subtitle">Details</div>
          </div>
          <button type="button" class="btn-close-x ms-auto" id="mcpRowCloseTop" title="Close"><i class="ti ti-x"></i></button>
        </div>
        <div class="modal-body">
          <div class="grid" id="mcpRowGrid"></div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-outline-secondary" id="mcpRowCloseBottom">Close</button>
        </div>
      </div>
    `;
    document.body.appendChild(wrapper);

    const closeModal = () => { wrapper.style.display = "none"; };
    document.getElementById("mcpRowCloseTop").addEventListener("click", closeModal);
    document.getElementById("mcpRowCloseBottom").addEventListener("click", closeModal);
    wrapper.addEventListener("click", (e) => { if (e.target === wrapper) closeModal(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && wrapper.style.display === "flex") closeModal(); });
  }

  function openPolicyModal(row) {
    ensurePolicyModal();

    const policyNum = row.policy_number || "";
    const lob = row.line_of_business || "";

    document.getElementById("mcpRowTitle").textContent = policyNum ? `Policy ${policyNum}` : "Policy";
    document.getElementById("mcpRowSubtitle").textContent = lob ? `LOB: ${lob}` : "Details";

    const items = [
      { label: "Policy #",         icon: "ti ti-hash",            value: policyNum || "" },
      { label: "Line of Business", icon: "ti ti-briefcase",       value: lob || "" },
      { label: "Business Type",    icon: "ti ti-businessplan",    value: row.business_type || "" },
      { label: "CSR",              icon: "ti ti-user",            value: row.csr || "" },
      { label: "Producer(s)",      icon: "ti ti-users",           value: row.producer || "" },
      { label: "Binder Date",      icon: "ti ti-calendar",        value: safeDateDisp(row.binder_date) },
      { label: "Effective Date",   icon: "ti ti-calendar-stats",  value: safeDateDisp(row.effective_date) },
      { label: "Location",         icon: "ti ti-map-pin",         value: row.location || "" },
      { label: "Policy Status",    icon: "ti ti-info-circle",     value: row.policy_status || "" }
    ];

    document.getElementById("mcpRowGrid").innerHTML = items.map(it => `
      <div class="item">
        <i class="${it.icon}"></i>
        <div class="meta">
          <div class="label">${it.label}</div>
          <div class="value">${it.value}</div>
        </div>
      </div>
    `).join("");

    document.getElementById("mcpRowDetailsModal").style.display = "flex";
  }

  function updateMissingPoliciesTable(rows) {
    if (!dtInitialized) {
      initMissingPoliciesTable(rows);
      return;
    }
    dt.clear();
    dt.rows.add(rows || []);
    dt.draw(false);
  }

  async function fetchAndRenderMissingPolicies(startISO, endISO, opts = {}) {
    try {
      const params = new URLSearchParams();
      if (opts.all === true) {
        params.set("start", "all");
        params.set("end", "all");
      } else {
        if (startISO) params.set("start", startISO);
        if (endISO) params.set("end", endISO);
      }
      const select = document.getElementById("location-select");
      let locationId = MCP_CTX.locationId;
      if (select && select.value !== "") locationId = select.value;
      if (locationId != null && !Number.isNaN(locationId) && locationId !== "") {
        params.set("location", String(locationId));
      }

      const DEBUG = false;
      if (DEBUG) params.set("debug", "1");

      const url = `/api/missing-csr-producer?${params.toString()}`;
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
      updateMissingPoliciesTable(data.rows || []);

      const badge = document.getElementById("mcp-selected-range");
      if (badge) {
        const s = data.range?.startISO;
        const e = data.range?.endISO;
        badge.textContent = s && e ? `${s} → ${e}` : "";
      }

      updateLocationAliasFromData(data);
    } catch (e) {
      console.error("Error fetching missing CSR/Producer policies:", e);
      alert("Error loading data: " + (e?.message || e));
    }
  }

  /* =========================
     Bootstrap
     ========================= */
  $(function () {
    MCP_CTX = getQueryContext();

    setLocationAliasBadge(null);

    if (MCP_CTX.start) $("#mcp-start").val(MCP_CTX.start);
    if (MCP_CTX.end) $("#mcp-end").val(MCP_CTX.end);
    if (MCP_CTX.start && MCP_CTX.end) {
      const badge = document.getElementById("mcp-selected-range");
      if (badge) badge.textContent = `${MCP_CTX.start} → ${MCP_CTX.end}`;
    }

    // Si tienes el select, inicializa el valor
    const select = document.getElementById("location-select");
    if (select && MCP_CTX.locationId != null && !Number.isNaN(MCP_CTX.locationId)) {
      select.value = MCP_CTX.locationId;
    }

    updateNavLinksWithContext(MCP_CTX);

    const init = window.MCP_INITIAL || null;
    if (init) {
      updateMissingPoliciesTable(init.rows || []);
      const badgeSSR = document.getElementById("mcp-selected-range");
      if (badgeSSR && init.range) badgeSSR.textContent = `${init.range.startISO} → ${init.range.endISO}`;
      if (!$("#mcp-start").val() && init.range?.startISO) $("#mcp-start").val(init.range.startISO);
      if (!$("#mcp-end").val() && init.range?.endISO) $("#mcp-end").val(init.range.endISO);

      updateLocationAliasFromData(init);
    }

    if (MCP_CTX.start && MCP_CTX.end) {
      setTimeout(() => $("#mcp-apply").trigger("click"), 50);
    }

    $("#mcp-apply").on("click", function () {
      const startISO = formatDateISO($("#mcp-start").val());
      const endISO = formatDateISO($("#mcp-end").val());

      const select = document.getElementById("location-select");
      let locationId = select && select.value !== "" ? select.value : MCP_CTX.locationId;

      if (!startISO && !endISO) {
        MCP_CTX.locationId = locationId;
        fetchAndRenderMissingPolicies(null, null, { all: true });
        return;
      }
      if (!startISO || !endISO) {
        alert("Select both start and end dates");
        return;
      }
      const swap = new Date(startISO) > new Date(endISO);
      const s = swap ? endISO : startISO;
      const e = swap ? startISO : endISO;
      MCP_CTX.locationId = locationId;
      fetchAndRenderMissingPolicies(s, e);
    });

    // Cuando cambias el select, dispara Apply automáticamente
    $("#location-select").on("change", function () {
      $("#mcp-apply").trigger("click");
    });

    flatpickr("#mcp-start", { dateFormat: "Y-m-d", allowInput: true, locale: "en" });
    flatpickr("#mcp-end",   { dateFormat: "Y-m-d", allowInput: true, locale: "en" });
  });
})();