"use strict";

/**
 * Franchise Errors screen script (aislado en IIFE para evitar globals).
 * - DataTable con avatar en "Franchise"
 * - Modal rico al hacer clic en "Franchise"
 * - Navegación a PRL/MCP/Missing Contact Info con ?location,&start,&end
 * - Aplica rango con fetch al backend
 * - Evita reinit de DataTables (guard + destroy)
 * - PRL/MCP/MCI abren en nueva pestaña
 */
(function () {
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
  function formatDateISO(d) {
    if (!d) return null;
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return null;
    return dt.toISOString().slice(0, 10);
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

  // Abrir en nueva pestaña de forma segura
  function openInNewTab(url) {
    const w = window.open(url, "_blank");
    if (w) w.opener = null; // noopener por seguridad
  }

  // Lee el location override del querystring (?location= o ?locationId=)
  function getLocationOverrideFromQS() {
    const p = new URLSearchParams(location.search);
    const v = p.get("locationId") ?? p.get("location");
    if (!v) return null;
    const n = Number(v);
    return Number.isFinite(n) ? String(n) : null;
  }

  // Contexto
  const IDS = { start: "fr-errors-start", end: "fr-errors-end", apply: "fr-errors-apply", badge: "selected-range" };
  function getRangeFromControlsOrQS() {
    const s1 = parseAnyToISO(document.getElementById(IDS.start)?.value || "");
    const e1 = parseAnyToISO(document.getElementById(IDS.end)?.value || "");
    if (s1 && e1) return { start: s1, end: e1 };
    const p = new URLSearchParams(location.search);
    const s2 = parseAnyToISO(p.get("start"));
    const e2 = parseAnyToISO(p.get("end"));
    return { start: s2 || null, end: e2 || null };
  }
  function setControlsFromRange({ start, end }) {
    if (start) document.getElementById(IDS.start)?.setAttribute("value", start);
    if (end) document.getElementById(IDS.end)?.setAttribute("value", end);
    updateBadge(start, end);
  }
  function updateBadge(start, end) {
    const badge = document.getElementById(IDS.badge);
    if (!badge) return;
    badge.textContent = start && end ? `${start} → ${end}` : "—";
  }
function buildTargetUrl(kind, locationId, range) {
  let base = "";
  if (kind === "prl") base = "/users/policy-report-by-location";
  else if (kind === "mcp") base = "/users/missing-csr-producer";
  else if (kind === "mci") base = "/users/missing-contact-errors"; // <--- CAMBIADO!
  else base = "/";
  const u = new URL(base, window.location.origin);
  if (locationId != null) u.searchParams.set("location", String(locationId));
  if (kind !== "mci" && range?.start && range?.end) {
    u.searchParams.set("start", range.start);
    u.searchParams.set("end", range.end);
  }
  return u.pathname + u.search;
}
  function headerToKey(text) {
    const t = (text || "").trim().toLowerCase();
    if (t.includes("franchise")) return "franchise";
    if (t.includes("binder")) return "binder";
    if (t.includes("missing csr")) return "missing-csr";
    if (t.includes("missing producer")) return "missing-producer";
    if (t.includes("missing (any)") || t.includes("missing any")) return "missing-any";
    if (t.includes("total error") || t.includes("total errors")) return "total-error";
    if (t.includes("contact info")) return "missing-contact";
    return "";
  }

  // DataTable
  let dt;
  let dtInitialized = false;

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
    if (!$table.length) {
      console.warn("[FRX] No table found with .datatable-franchise-errors");
      return;
    }
    if (!$.fn || !$.fn.DataTable) {
      console.error("[FRX] DataTables is not loaded. Include datatables JS.");
      return;
    }

    // Evitar re-inicialización
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
      order: [[0, "asc"]],
      columns: [
        { data: "franchise", title: "Franchise", className: "align-middle", render: renderFranchiseCell },
        { data: (row) => row.binder_errors ?? row.binder ?? row.binderErrors ?? 0, title: "Binder errors", className: "text-end align-middle", render: renderNumberCell },
        { data: (row) => row.csr_total ?? row.missing_csr ?? row.missingCSR ?? 0, title: "Missing CSR", className: "text-end align-middle", render: renderNumberCell },
        { data: (row) => row.producer_total ?? row.missing_producer ?? row.missingProducer ?? 0, title: "Missing Producer", className: "text-end align-middle", render: renderNumberCell },
        { data: (row) => row.missing_any_total ?? row.missing_any ?? row.missingAny ?? 0, title: "Missing (any)", className: "text-end align-middle", render: renderNumberCell },
        { data: (row) => row.missing_contact_info ?? 0, title: "Missing Contact Info", className: "text-end align-middle", render: renderNumberCell },
        { data: (row) => row.total_errors ?? row.total ?? 0, title: "Total errors", className: "text-end align-middle fw-semibold", render: renderNumberCell }
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
      dtOptions.buttons = [
        {
          extend: "csvHtml5",
          text: '<i class="ti ti-file-spreadsheet me-1"></i><span class="export-csv-label">Export CSV</span>',
          className: "dt-button export-csv-btn btn btn-sm btn-primary",
          titleAttr: "Export CSV",
          title: "Franchise_Errors",
          filename: "Franchise_Errors",
          bom: true,
          exportOptions: { columns: ":visible" }
        }
      ];
    }

    dt = $table.DataTable(dtOptions);
    dtInitialized = true;

    const $csvBtn = $table.closest(".card, .container, body")
      .find(".dataTables_wrapper .dt-buttons .buttons-csv, .dataTables_wrapper .dt-buttons .buttons-html5");
    $csvBtn.addClass("btn btn-sm btn-primary export-csv-btn");

    // Click por celda (namespace para no duplicar)
    $table.off("click.frx", "tbody td").on("click.frx", "tbody td", function (e) {
      const cellIdx = dt.cell(this)?.index();
      if (!cellIdx) return;

      const colIndex = cellIdx.column;
      const headerText = ($(dt.column(colIndex).header()).text() || "").trim();
      const key = headerToKey(headerText);
      if (!key) return;

      const rowData = dt.row(this).data() || {};
      const locationId = rowData.location_id || rowData.locationId || rowData.id || null;
      const range = getRangeFromControlsOrQS();

      if (key === "franchise") {
        e.preventDefault();
        e.stopPropagation();
        openFranchiseModal(rowData, range);
        return;
      }

      if (!locationId) return;

      if (key === "binder") {
        e.preventDefault();
        e.stopPropagation();
        const url = buildTargetUrl("prl", locationId, range);
        openInNewTab(url);
        return;
      }

      if (key === "missing-csr" || key === "missing-producer" || key === "missing-any" || key === "total-error") {
        e.preventDefault();
        e.stopPropagation();
        const url = buildTargetUrl("mcp", locationId, range);
        openInNewTab(url);
        return;
      }

      if (key === "missing-contact") {
        e.preventDefault();
        e.stopPropagation();
        const url = buildTargetUrl("mci", locationId, range);
        openInNewTab(url);
        return;
      }
    });
  }

  function updateFranchiseErrorsTable(rows) {
    if (!dtInitialized) {
      initFranchiseErrorsTable(rows);
      return;
    }
    dt.clear();
    dt.rows.add(rows || []);
    dt.draw(false);
  }

  // Modal franquicia
  function ensureFranchiseModal() {
    if (document.getElementById("franchiseRowDetailsModal")) return;

    const style = document.createElement("style");
    style.id = "franchise-row-modal-css";
    style.textContent = `
      #franchiseRowDetailsModal{display:none;position:fixed;inset:0;background:rgba(15,18,22,.55);backdrop-filter:blur(2px);z-index:1055;align-items:center;justify-content:center;padding:20px;}
      #franchiseRowDetailsModal .modal-card{background:var(--bs-body-bg);color:var(--bs-body-color);border:1px solid var(--bs-border-color);border-radius:16px;width:min(920px,96vw);box-shadow:0 24px 60px rgba(0,0,0,.25);overflow:hidden;}
      #franchiseRowDetailsModal .modal-header{display:flex;align-items:center;gap:14px;padding:18px 22px;border-bottom:1px solid var(--bs-border-color);}
      #franchiseRowDetailsModal .modal-body{padding:20px 22px;}
      #franchiseRowDetailsModal .modal-footer{padding:14px 22px;border-top:1px solid var(--bs-border-color);display:flex;justify-content:flex-end;gap:10px;}
      #franchiseRowDetailsModal .avatar{width:48px;height:48px;border-radius:50%;color:#fff;font-weight:700;font-size:18px;display:inline-flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.12);}
      #franchiseRowDetailsModal .title-wrap{display:flex;flex-direction:column;line-height:1.2}
      #franchiseRowDetailsModal .title-wrap .title{font-weight:700;font-size:1.15rem}
      #franchiseRowDetailsModal .title-wrap .subtitle{opacity:.8;font-size:.86rem}
      #franchiseRowDetailsModal .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:14px 18px;}
      @media (max-width:576px){#franchiseRowDetailsModal .grid{grid-template-columns:1fr;}}
      #franchiseRowDetailsModal .item{padding:14px;border:1px solid var(--bs-border-color);border-radius:12px;display:flex;align-items:flex-start;gap:10px;}
      #franchiseRowDetailsModal .item i{font-size:18px;color:var(--bs-primary);}
      #franchiseRowDetailsModal .meta{display:flex;flex-direction:column;gap:4px}
      #franchiseRowDetailsModal .label{font-size:12px;color:var(--bs-secondary-color);text-transform:uppercase;letter-spacing:.03em}
      #franchiseRowDetailsModal .value{font-size:15px;font-weight:600;word-break:break-word}
      #franchiseRowDetailsModal .btn-close-x{border:none;background:transparent;color:inherit;padding:6px 8px;border-radius:8px}
      #franchiseRowDetailsModal .btn-close-x:hover{background:rgba(0,0,0,.06)}
    `;
    document.head.appendChild(style);

    const wrapper = document.createElement("div");
    wrapper.id = "franchiseRowDetailsModal";
    wrapper.innerHTML = `
      <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="franchiseRowTitle">
        <div class="modal-header">
          <span class="avatar" id="franchiseRowAvatar">FR</span>
          <div class="title-wrap">
            <div id="franchiseRowTitle" class="title">Franchise</div>
            <div id="franchiseRowSubtitle" class="subtitle">Location details</div>
          </div>
          <button type="button" class="btn-close-x ms-auto" id="franchiseRowCloseTop" title="Close"><i class="ti ti-x"></i></button>
        </div>
        <div class="modal-body">
          <div class="grid" id="franchiseRowGrid"></div>
        </div>
        <div class="modal-footer">
          <a id="franchiseOpenPRL" class="btn btn-primary" target="_blank" rel="noopener noreferrer">
            <i class="ti ti-report me-1"></i> Policy Report
          </a>
          <a id="franchiseOpenMCP" class="btn btn-outline-primary" target="_blank" rel="noopener noreferrer">
            <i class="ti ti-user-exclamation me-1"></i> Missing CSR/Producer
          </a>
          <a id="franchiseOpenMCI" class="btn btn-outline-danger" target="_blank" rel="noopener noreferrer">
            <i class="ti ti-user-question me-1"></i> Missing Contact Info
          </a>
          <button type="button" class="btn btn-outline-secondary" id="franchiseRowCloseBottom">Close</button>
        </div>
      </div>
    `;
    document.body.appendChild(wrapper);

    const closeModal = () => { wrapper.style.display = "none"; };
    document.getElementById("franchiseRowCloseTop").addEventListener("click", closeModal);
    document.getElementById("franchiseRowCloseBottom").addEventListener("click", closeModal);
    wrapper.addEventListener("click", (e) => { if (e.target === wrapper) closeModal(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && wrapper.style.display === "flex") closeModal(); });
  }

  function openFranchiseModal(rowData, range) {
    ensureFranchiseModal();

    const name = rowData.franchise || rowData.name || "Franchise";
    const initials = getInitials(name);
    const bg = stringToNiceColor(name);
    const locId = rowData.location_id || rowData.locationId || rowData.id || null;

    document.getElementById("franchiseRowAvatar").textContent = initials;
    document.getElementById("franchiseRowAvatar").style.background = bg;
    document.getElementById("franchiseRowTitle").textContent = name;
    document.getElementById("franchiseRowSubtitle").textContent = locId ? `Location ID: ${locId}` : "Location";

    const vBinder = rowData.binder_errors ?? rowData.binder ?? rowData.binderErrors ?? 0;
    const vCSR   = rowData.csr_total ?? rowData.missing_csr ?? rowData.missingCSR ?? 0;
    const vProd  = rowData.producer_total ?? rowData.missing_producer ?? rowData.missingProducer ?? 0;
    const vAny   = rowData.missing_any_total ?? rowData.missing_any ?? rowData.missingAny ?? 0;
    const vContact = rowData.missing_contact_info ?? 0;
    const vTotal = rowData.total_errors ?? rowData.total ?? (asInt(vBinder) + asInt(vAny) + asInt(vContact)) ?? 0;

    const items = [
      { label: "Binder errors",    icon: "ti ti-file-alert",        value: intDisp(vBinder) },
      { label: "Missing CSR",      icon: "ti ti-user-question",     value: intDisp(vCSR) },
      { label: "Missing Producer", icon: "ti ti-user-off",          value: intDisp(vProd) },
      { label: "Missing (any)",    icon: "ti ti-user-exclamation",  value: intDisp(vAny) },
      { label: "Missing Contact Info", icon: "ti ti-user-question", value: intDisp(vContact) },
      { label: "Total errors",     icon: "ti ti-sum",               value: intDisp(vTotal) }
    ];

    document.getElementById("franchiseRowGrid").innerHTML = items.map(it => `
      <div class="item">
        <i class="${it.icon}"></i>
        <div class="meta">
          <div class="label">${it.label}</div>
          <div class="value">${it.value}</div>
        </div>
      </div>
    `).join("");

    const prl = document.getElementById("franchiseOpenPRL");
    const mcp = document.getElementById("franchiseOpenMCP");
    const mci = document.getElementById("franchiseOpenMCI");
    if (locId) {
      prl.href = buildTargetUrl("prl", locId, range);
      mcp.href = buildTargetUrl("mcp", locId, range);
      mci.href = buildTargetUrl("mci", locId, range);
      prl.setAttribute("target", "_blank");
      prl.setAttribute("rel", "noopener noreferrer");
      mcp.setAttribute("target", "_blank");
      mcp.setAttribute("rel", "noopener noreferrer");
      mci.setAttribute("target", "_blank");
      mci.setAttribute("rel", "noopener noreferrer");

      prl.classList.remove("disabled");
      prl.removeAttribute("aria-disabled");
      mcp.classList.remove("disabled");
      mcp.removeAttribute("aria-disabled");
      mci.classList.remove("disabled");
      mci.removeAttribute("aria-disabled");
    } else {
      prl.href = "#";
      prl.classList.add("disabled");
      prl.setAttribute("aria-disabled", "true");
      mcp.href = "#";
      mcp.classList.add("disabled");
      mcp.setAttribute("aria-disabled", "true");
      mci.href = "#";
      mci.classList.add("disabled");
      mci.setAttribute("aria-disabled", "true");
    }

    document.getElementById("franchiseRowDetailsModal").style.display = "flex";
  }

  // Fetch + render (franchise errors)
  async function fetchAndRenderFranchiseErrors(startISO, endISO) {
    try {
      const params = new URLSearchParams();
      if (startISO) params.set("start", startISO);
      if (endISO) params.set("end", endISO);

      // NUEVO: propagar location override del QS al backend
      const locOverride = getLocationOverrideFromQS();
      if (locOverride) params.set("locationId", locOverride);

      // Usa la ruta que tienes en el router
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
      updateBadge(data.range?.startISO || startISO, data.range?.endISO || endISO);
    } catch (e) {
      console.error("[FRX] Error fetching franchise errors:", e);
      alert("Error loading data: " + (e?.message || e));
    }
  }

  // Bootstrap
  document.addEventListener("DOMContentLoaded", function () {
    const qsRange = getRangeFromControlsOrQS();
    const init = window.FR_ERRORS_INITIAL || null;

    const startISO = qsRange.start || init?.range?.startISO || null;
    const endISO   = qsRange.end   || init?.range?.endISO   || null;

    setControlsFromRange({ start: startISO, end: endISO });
    updateFranchiseErrorsTable(init?.rows || []);

    const applyBtn = document.getElementById(IDS.apply);
    if (applyBtn) {
      applyBtn.addEventListener("click", function () {
        const s = parseAnyToISO(document.getElementById(IDS.start)?.value || "");
        const e = parseAnyToISO(document.getElementById(IDS.end)?.value || "");
        if (!s || !e) {
          alert("Select both start and end dates");
          return;
        }
        // Normaliza si el usuario invierte las fechas
        const swap = new Date(s) > new Date(e);
        const s2 = swap ? e : s;
        const e2 = swap ? s : e;
        fetchAndRenderFranchiseErrors(s2, e2);
      });
    }

    // Si ya venían en la URL, recarga datos al entrar
    if (startISO && endISO) {
      fetchAndRenderFranchiseErrors(startISO, endISO);
    }
    // Flatpickr: calendario y edición manual en campo de fecha
    flatpickr("#fr-errors-start", {
      dateFormat: "Y-m-d",
      allowInput: true
    });
    flatpickr("#fr-errors-end", {
      dateFormat: "Y-m-d",
      allowInput: true
    });

  });
})();