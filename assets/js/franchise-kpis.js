"use strict";

/* =========================
   Helpers
   ========================= */
function getInitials(name) {
  if (!name) return "--";
  const parts = String(name).trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
const avatarColors = ["#4ECDC4","#FF6B6B","#45B7D1","#FFBE0B","#FB5607","#8338EC","#3A86FF","#FF006E","#6A994E","#A7C957"];
function stringToNiceColor(str) {
  if (!str) return avatarColors[0];
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return avatarColors[Math.abs(hash) % avatarColors.length];
}
function intDisp(val) {
  if (val == null || val === "") return "0";
  if (typeof val === "string") {
    const s = val.replace(/\$/g, "").replace(/,/g, "");
    const n = Number(s);
    return Number.isFinite(n) ? Math.round(n).toLocaleString("en-US") : val;
  }
  const n = Number(val);
  return Number.isFinite(n) ? Math.round(n).toLocaleString("en-US") : "0";
}
function percentDisp(val) {
  if (val == null || val === "") return "0.0%";
  if (typeof val === "string") {
    const m = val.match(/^\s*(-?\d+(?:\.\d+)?)\s*%?\s*$/);
    if (m) {
      const n = Number(m[1]);
      return Number.isFinite(n)
        ? n.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%"
        : val;
    }
    return val;
  }
  const n = Number(val);
  return Number.isFinite(n)
    ? n.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%"
    : "0.0%";
}
function formatAsOf(ts) {
  if (!ts) return null;
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return null;
  }
}

/* =========================
   Month selector
   ========================= */
function getNextMonthsArray(locale = "en-US", count = 6) {
  const months = [];
  for (let i = 0; i < count; i++) {
    const date = new Date();
    date.setMonth(date.getMonth() + i, 1);
    months.push({ value: i, label: date.toLocaleString(locale, { month: "long", year: "numeric" }) });
  }
  return months;
}
function renderMonthSelector() {
  const months = getNextMonthsArray("en-US", 6);
  const $select = $("#select-mes");
  $select.empty();
  months.forEach(m => {
    const cap = m.label.charAt(0).toUpperCase() + m.label.slice(1);
    $select.append(`<option value="${m.value}">${cap}</option>`);
  });
}

/* =========================
   KPI Panel
   ========================= */
function renderPanelKPIs(panel) {
  document.getElementById("premium-policies").innerHTML = `
    <i class="ti ti-coins me-2 text-primary"></i> ${panel?.premium_and_policies || "0 / 0"}
    <div class="fs-6 text-muted">Premium / Policies</div>
  `;
  document.getElementById("renewed-premium-policies").innerHTML = `
    <i class="ti ti-building me-2 text-success"></i> ${panel?.renewed_and_policies || "0 / 0"}
    <div class="fs-6 text-muted">Renewed Premium / Policies</div>
  `;
  document.getElementById("lost-premium-policies").innerHTML = `
    <i class="ti ti-users me-2 text-danger"></i> ${panel?.lost_and_policies || "0 / 0"}
    <div class="fs-6 text-muted">Lost Premium / Policies</div>
  `;
  document.getElementById("renewed-max-percent").innerHTML = `
    <i class="ti ti-car-crash me-2 text-info"></i> ${panel?.percent_and_max || "0.0% / 0.0%"}
    <div class="fs-6 text-muted">Renewed % / Max %</div>
  `;
}

/* =========================
   Table
   ========================= */
function renderLocationAvatarCell(data, type, row) {
  const name = data || "";
  if (type === "display") {
    const initials = getInitials(name);
    const bgColor = stringToNiceColor(name);
    const locationId = row?.location_id || row?.locationId || row?.id;
    const href = locationId ? `/users/renewals/agency-upcoming-renewals?location=${encodeURIComponent(locationId)}` : null;

    const content = `
      <span class="rounded-circle me-2 d-inline-flex justify-content-center align-items-center"
        style="width:34px;height:34px;background:${bgColor};color:#fff;font-weight:bold;font-size:15px;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
        ${initials}
      </span>
      <span class="text-body">${name}</span>
    `;
    if (href) {
      return `<a href="${href}" class="text-decoration-none d-flex align-items-center location-link" target="_blank" rel="noopener noreferrer">${content}</a>`;
    }
    return `<div class="d-flex align-items-center">${content}</div>`;
  }
  if (type === "sort") return name.toLocaleLowerCase();
  return name;
}

// Sorting helpers for numeric and percent columns
function renderNumberCell(d, t) {
  const num = Number(String(d ?? "").replace(/[^\d.\-]/g, ""));
  if (t === "display" || t === "filter") return intDisp(d);
  return Number.isFinite(num) ? num : 0;
}
function renderPercentCell(d, t) {
  const num = Number(String(d ?? "").replace(/[^\d.\-]/g, ""));
  if (t === "display" || t === "filter") return percentDisp(d);
  return Number.isFinite(num) ? num : 0;
}

/* =========================
   Modal
   ========================= */
function ensureRowModal() {
  if (document.getElementById("franchiseRowDetailsModal")) return;
  const style = document.createElement("style");
  style.id = "franchise-row-modal-css";
  style.textContent = `
    #franchiseRowDetailsModal{display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:1055;align-items:center;justify-content:center;padding:20px;}
    #franchiseRowDetailsModal .modal-card{background:var(--bs-body-bg);color:var(--bs-body-color);border:1px solid var(--bs-border-color);border-radius:12px;width:min(900px,96vw);box-shadow:0 20px 50px rgba(0,0,0,0.2);overflow:hidden;}
    #franchiseRowDetailsModal .modal-header{display:flex;align-items:center;gap:12px;padding:18px 22px;border-bottom:1px solid var(--bs-border-color);}
    #franchiseRowDetailsModal .modal-body{padding:20px 22px;}
    #franchiseRowDetailsModal .modal-footer{padding:14px 22px;border-top:1px solid var(--bs-border-color);display:flex;justify-content:flex-end;gap:8px;}
    #franchiseRowDetailsModal .avatar{width:46px;height:46px;border-radius:50%;color:#fff;font-weight:700;font-size:18px;display:inline-flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.12);}
    #franchiseRowDetailsModal .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px 18px;}
    @media (max-width:576px){#franchiseRowDetailsModal .grid{grid-template-columns:1fr;}}
    #franchiseRowDetailsModal .item{padding:12px 14px;border:1px solid var(--bs-border-color);border-radius:10px;}
    #franchiseRowDetailsModal .item .label{font-size:12px;color:var(--bs-secondary-color);text-transform:uppercase;letter-spacing:.02em;display:flex;align-items:center;gap:6px;}
    #franchiseRowDetailsModal .item .value{font-size:16px;font-weight:600;margin-top:6px;}
  `;
  document.head.appendChild(style);

  const wrapper = document.createElement("div");
  wrapper.id = "franchiseRowDetailsModal";
  wrapper.innerHTML = `
    <div class="modal-card">
      <div class="modal-header">
        <span class="avatar" id="franchiseRowAvatar">FR</span>
        <div class="flex-grow-1">
          <div id="franchiseRowTitle" class="fw-bold fs-5">Franchise</div>
          <div id="franchiseRowSubtitle" class="text-muted small">Location details</div>
        </div>
        <button type="button" class="btn btn-sm btn-outline-secondary" id="franchiseRowCloseTop" title="Close"><i class="ti ti-x"></i></button>
      </div>
      <div class="modal-body">
        <div class="grid" id="franchiseRowGrid"></div>
      </div>
      <div class="modal-footer">
        <a id="franchiseOpenUpcoming" class="btn btn-primary" target="_blank" rel="noopener noreferrer">
          <i class="ti ti-external-link me-1"></i> Open Upcoming Renewals
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

function openRowModal(rowData) {
  ensureRowModal();

  const name = rowData.franchise || rowData.name || "Franchise";
  const initials = getInitials(name);
  const bgColor = stringToNiceColor(name);

  const locId = rowData.location_id || rowData.locationId || rowData.id || null;
  const href = locId ? `/users/renewals/agency-upcoming-renewals?location=${encodeURIComponent(locId)}` : "#";

  document.getElementById("franchiseRowAvatar").textContent = initials;
  document.getElementById("franchiseRowAvatar").style.background = bgColor;
  document.getElementById("franchiseRowTitle").textContent = name;
  document.getElementById("franchiseRowSubtitle").textContent = locId ? `Location ID: ${locId}` : `Location`;

  const openUpcoming = document.getElementById("franchiseOpenUpcoming");
  openUpcoming.href = href;
  if (!locId) {
    openUpcoming.classList.add("disabled");
    openUpcoming.setAttribute("aria-disabled", "true");
  } else {
    openUpcoming.classList.remove("disabled");
    openUpcoming.removeAttribute("aria-disabled");
  }

  const items = [
    { label: "Premium",           icon: "ti ti-coins",             value: intDisp(rowData.premium) },
    { label: "Policies",          icon: "ti ti-file-invoice",      value: intDisp(rowData.policies) },
    { label: "Renewed Premium",   icon: "ti ti-building",          value: intDisp(rowData.renewed_premium) },
    { label: "Renewed Policies",  icon: "ti ti-file-check",        value: intDisp(rowData.renewed_policies) },
    { label: "Lost Premium",      icon: "ti ti-cash-banknote-off", value: intDisp(rowData.lost_premium) },
    { label: "Lost Policies",     icon: "ti ti-file-x",            value: intDisp(rowData.lost_policies) },
    { label: "Renewed %",         icon: "ti ti-chart-bar",         value: percentDisp(rowData.renewed_percent) },
    { label: "Max %",             icon: "ti ti-gauge",             value: percentDisp(rowData.max_percent) }
  ];

  document.getElementById("franchiseRowGrid").innerHTML = items.map(it => `
    <div class="item">
      <div class="label"><i class="${it.icon}"></i> ${it.label}</div>
      <div class="value">${it.value}</div>
    </div>
  `).join("");

  document.getElementById("franchiseRowDetailsModal").style.display = "flex";
}

/* =========================
   Last updated
   ========================= */
function ensureLastUpdated() {
  if (document.getElementById("kpis-last-updated")) return;
  const el = document.createElement("div");
  el.id = "kpis-last-updated";
  el.className = "text-muted small my-1";
  const container = document.querySelector("#kpis-last-updated-container") || document.body;
  container.prepend(el);
}
function updateLastUpdated(meta, lastUpdatedAtISO) {
  ensureLastUpdated();
  const el = document.getElementById("kpis-last-updated");
  const ts = lastUpdatedAtISO || meta?.as_of || null;
  const asOf = formatAsOf(ts);
  el.textContent = asOf ? `Last updated: ${asOf}` : "Last updated: —";
}

/* =========================
   DataTable (init once, update on polls)
   ========================= */
let dt;
let dtInitialized = false;

function initFranchiseTable(franchises) {
  const $table = $(".datatable-franchise-kpis");
  const hasButtons = !!($.fn.dataTable && $.fn.dataTable.Buttons);
  const domLayout = hasButtons
    ? '<"row mb-2"<"col-sm-6"f><"col-sm-6 d-flex justify-content-end"B>>rtip'
    : '<"row mb-2"<"col-sm-6"f><"col-sm-6 d-flex justify-content-end">>rtip';

  const dtOptions = {
    data: franchises,
    ordering: true,
    order: [[0, "asc"]],
    columns: [
      { data: "franchise",        className: "fw-semibold", render: renderLocationAvatarCell },
      { data: "premium",          className: "text-end",    render: renderNumberCell },
      { data: "policies",         className: "text-end",    render: renderNumberCell },
      { data: "renewed_premium",  className: "text-end",    render: renderNumberCell },
      { data: "renewed_policies", className: "text-end",    render: renderNumberCell },
      { data: "lost_premium",     className: "text-end",    render: renderNumberCell },
      { data: "lost_policies",    className: "text-end",    render: renderNumberCell },
      { data: "renewed_percent",  className: "text-end",    render: renderPercentCell },
      { data: "max_percent",      className: "text-end",    render: renderPercentCell }
    ],
    dom: domLayout,
    language: {
      url: "//cdn.datatables.net/plug-ins/1.13.7/i18n/en-GB.json",
      search: "Search location:",
      zeroRecords: "No matching locations found",
      info: "Showing _START_ to _END_ of _TOTAL_ locations",
      infoEmpty: "No locations available",
      infoFiltered: "(filtered from _MAX_ total locations)",
      paginate: { previous: "←", next: "→" }
    },
    pageLength: 10,
    responsive: true,
    autoWidth: false
  };

  if (hasButtons) {
    dtOptions.buttons = [
      {
        extend: "csvHtml5",
        text: '<i class="ti ti-file-spreadsheet me-1"></i><span class="export-csv-label">Export CSV</span>',
        className: "dt-button export-csv-btn btn btn-sm rounded-1",
        titleAttr: "Export CSV",
        title: "Location_KPIs",
        filename: "Location_KPIs",
        fieldSeparator: ",",
        bom: true,
        exportOptions: { columns: ":visible" }
      }
    ];
  }

  dt = $table.DataTable(dtOptions);
  dtInitialized = true;

  const $csvBtn = $table.closest('.card, .container, body')
    .find('.dataTables_wrapper .dt-buttons .buttons-csv, .dataTables_wrapper .dt-buttons .buttons-html5');
  $csvBtn.addClass('export-csv-btn btn btn-sm rounded-1').removeClass('btn-label-secondary rounded-pill');

  $table.on("click", "a.location-link", function (e) { e.stopPropagation(); });
  $table.on("click", "tbody tr", function () {
    const row = dt.row(this);
    const data = row.data();
    if (data) openRowModal(data);
  });
}

function updateFranchiseTable(franchises) {
  if (!dtInitialized) {
    initFranchiseTable(franchises);
    return;
  }
  dt.clear();
  dt.rows.add(franchises);
  dt.draw(false);
}

/* =========================
   Fetch + Render (silent polling, no banner)
   ========================= */
let currentMonth = 0;
let pollTimer = null;

function clearPoll() {
  if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
}

async function fetchAndRenderPanel(month = 0, { poke = false } = {}) {
  try {
    const url = `/api/franchise-kpis-panel?month=${encodeURIComponent(month)}${poke ? "&poke=1" : ""}`;
    const res = await fetch(url, {
      cache: "no-store",
      credentials: "same-origin",
      headers: { "X-Requested-With": "XMLHttpRequest" }
    });
    if (!res.ok) throw new Error(`Error while fetching KPIs: ${res.status}`);

    const data = await res.json();

    // Always paint current snapshot
    renderPanelKPIs(data.panelMetrics || {});
    updateFranchiseTable(data.franchises || []);
    updateLastUpdated(data.meta || null, data.lastUpdatedAtISO || null);

    // Polling control
    clearPoll();
    if (data.shouldPoll) {
      const delay = Number(data.pollMs || 10000);
      pollTimer = setTimeout(() => fetchAndRenderPanel(currentMonth, { poke: false }), delay);
    }
  } catch (e) {
    console.error("Error in fetchAndRenderPanel:", e);
    clearPoll();
  }
}

/* =========================
   Bootstrap
   ========================= */
$(function () {
  renderMonthSelector();
  currentMonth = 0;

  const init = window.FKPIS_INITIAL || null;
  if (init) {
    renderPanelKPIs(init.panelMetrics || {});
    updateFranchiseTable(init.franchises || []);
    updateLastUpdated(init.meta || null, init.lastUpdatedAtISO || null);
  }

  // First fetch
  fetchAndRenderPanel(currentMonth, { poke: true });

  // Month change: silent refresh
  $("#select-mes").on("change", function () {
    const month = Number($(this).val() || 0);
    currentMonth = month;
    clearPoll();
    fetchAndRenderPanel(month, { poke: true });
  });
});