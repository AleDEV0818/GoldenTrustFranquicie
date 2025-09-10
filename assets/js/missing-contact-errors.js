"use strict";

(function () {
  let CURRENT_TYPE = "email";
  let CURRENT_LOCATION = null;
  let dt;

  // IDs de KPIs
  const KPI_IDS = {
    activeClients: "mce-active-clients-count",
    contactErrorsTotal: "mce-contact-errors-total",
    selectedErrors: "mce-selected-errors-count",
    selectedLabel: "mce-selected-kind-label"
  };

  // Utils
  function normalizeStatusString(s) {
    if (s == null) return "";
    return String(s).toLowerCase().trim().replaceAll("_", " ").replace(/\s+/g, " ");
  }
  function getEmailStatus(row) {
    const raw =
      row.email_status ??
      row.email_state ??
      row.verify_status ??
      row.validation_status ??
      row.status ??
      "";
    let st = normalizeStatusString(raw);
    if (!st && (row.email_valid === false || row.email_is_valid === false || row.is_email_valid === false)) st = "invalid";
    if (!st && (row.email_valid === 0 || row.email_is_valid === 0 || row.is_email_valid === 0)) st = "invalid";
    if (!st && CURRENT_TYPE === "invalid_email") st = "invalid";
    return st;
  }
  function isOkGroup(st) {
    const s = normalizeStatusString(st);
    return s === "ok" || s === "ok for all";
  }
  function int(n) {
    const x = Number(String(n ?? "").replace(/[^\d\-]/g, ""));
    return Number.isFinite(x) ? x : 0;
  }
  function fmt(n) {
    return int(n).toLocaleString("en-US");
  }

  // Construye celda de Email con badges
  function buildEmailCell(email, st) {
    if (!st || isOkGroup(st)) return email || "";
    const status = normalizeStatusString(st);
    const flagClass =
      status === "invalid" || status === "error"
        ? "email-flag--error"
        : status === "unknown"
          ? "email-flag--unknown"
          : "email-flag--error";
    const flagTitle =
      status === "invalid"
        ? "Invalid email"
        : status === "unknown"
          ? "Unknown validity"
          : status === "error"
            ? "Verification error"
            : "Email issue";
    const flagIcon =
      status === "invalid"
        ? "ti ti-x-circle"
        : status === "unknown"
          ? "ti ti-help-circle"
          : status === "error"
            ? "ti ti-alert-triangle"
            : "ti ti-x";
    const badge =
      status === "invalid"
        ? '<span class="email-status-badge email-status-invalid" title="Invalid email"><i class="ti ti-x-circle"></i> Invalid</span>'
        : status === "unknown"
          ? '<span class="email-status-badge email-status-unknown" title="Unknown validity"><i class="ti ti-help-circle"></i> Unknown</span>'
          : status === "error"
            ? '<span class="email-status-badge email-status-error" title="Verification error"><i class="ti ti-alert-triangle"></i> Error</span>'
            : "";
    return `
      <span class="email-cell">
        <span class="email-flag ${flagClass}" title="${flagTitle}">
          <i class="${flagIcon} me-1"></i>
          <span class="email-text">${email || ""}</span>
        </span>
        ${badge}
      </span>
    `;
  }

  function syncVerifyButtonState() {
    const group = document.getElementById("mce-verify-group");
    const btn = document.getElementById("mce-verify-btn");
    if (!group || !btn) return;
    const isInvalidEmail = CURRENT_TYPE === "invalid_email";
    group.classList.toggle("d-none", !isInvalidEmail);
    if (!isInvalidEmail) return;
    const enabled = !!CURRENT_LOCATION;
    btn.disabled = !enabled;
    btn.classList.toggle("disabled", !enabled);
    btn.title = enabled ? "Verify invalid emails" : "Select a location to enable verification";
  }

  async function onVerifyClick() {
    try {
      if (!CURRENT_LOCATION) {
        alert("Select a location to verify.");
        return;
      }
      showLoadingAlert("Verifying emails (null/empty/error), please wait...");
      const params = new URLSearchParams();
      params.set("location", CURRENT_LOCATION);
      const res = await fetch(`/api/missing-contact-errors/verify?${params.toString()}`, {
        method: "POST",
        headers: { "X-Requested-With": "XMLHttpRequest" }
      });
      const raw = await res.text();
      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        throw new Error(`Unexpected response (${res.status}). ${raw?.slice(0, 200) || "No body"}`);
      }
      hideLoadingAlert();
      if (!res.ok) throw new Error(data?.error || data?.message || `Verification failed (HTTP ${res.status})`);
      showInfoAlert(data?.message || "Verification finished.");
      await fetchRows();
      await refreshAllKpis();
    } catch (e) {
      hideLoadingAlert();
      console.error("[MCE] verifyClick error:", e);
      alert("Error verifying emails: " + (e?.message || e));
    }
  }

  // KPI helpers
  function setText(id, n) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = fmt(n);
  }
  function setLabel(id, text) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text || "";
  }
  function getSelectedKindLabel(kind) {
    if (kind === "phone") return "Without Phone";
    if (kind === "invalid_email") return "Invalid Email";
    return "Without Email";
  }

  async function refreshActiveClientsKpi() {
    if (!CURRENT_LOCATION) return; // no sobrescribir SSR si no hay location
    try {
      const url = `/api/active-clients-count?location=${encodeURIComponent(CURRENT_LOCATION)}`;
      const res = await fetch(url, { cache: "no-store", headers: { "X-Requested-With": "XMLHttpRequest" } });
      if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
      const data = await res.json();
      setText(KPI_IDS.activeClients, data.count || 0);
    } catch (e) {
      console.warn("[MCE] Failed to refresh Active Clients KPI:", e);
    }
  }

  async function refreshContactSummaryKpis() {
    if (!CURRENT_LOCATION) return; // no sobrescribir SSR si no hay location
    try {
      const url = `/api/missing-contact-errors/summary?location=${encodeURIComponent(CURRENT_LOCATION)}`;
      const res = await fetch(url, { cache: "no-store", headers: { "X-Requested-With": "XMLHttpRequest" } });
      if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
      const data = await res.json();
      const totals = data?.totals || {};
      const total = int(totals.total);
      setText(KPI_IDS.contactErrorsTotal, total);
      // "Selected Errors" se actualiza desde la tabla (no aquí)
      setLabel(KPI_IDS.selectedLabel, getSelectedKindLabel(CURRENT_TYPE));
    } catch (e) {
      console.warn("[MCE] Failed to refresh Contact Summary KPIs:", e);
    }
  }

  async function refreshAllKpis() {
    await Promise.all([refreshActiveClientsKpi(), refreshContactSummaryKpis()]);
    // Selected Errors se ajusta después por tabla/draw
    updateSelectedErrorsFromTable();
  }

  function updateLocationAliasLabel(locationAlias) {
    const span = document.getElementById("mce-location-alias");
    if (!span) return;
    span.textContent = locationAlias || "—";
  }

  // Actualiza el KPI "Selected Errors" con el conteo visible en la tabla (aplica filtros)
  function updateSelectedErrorsFromTable() {
    try {
      if (!dt) return;
      const visibleCount = dt.rows({ filter: "applied" }).count();
      setText(KPI_IDS.selectedErrors, visibleCount);
    } catch {
      /* noop */
    }
  }

  // Tabla
  function initTable(rows) {
    const $table = $(".datatable-missing-contact-errors");
    if (!$.fn || !$.fn.DataTable) {
      console.error("[MCE] DataTables not loaded");
      return;
    }
    const hasButtons = !!($.fn.dataTable && $.fn.dataTable.Buttons);

    if ($.fn.DataTable.isDataTable($table)) {
      const inst = $table.DataTable();
      inst.clear();
      inst.rows.add(rows || []);
      inst.draw(false);
      dt = inst;
      updateSelectedErrorsFromTable();
      return;
    }

    dt = $table.DataTable({
      destroy: true,
      data: rows || [],
      order: [[1, "asc"]],
      dom: hasButtons
        ? '<"row mb-2"<"col-12 col-md-6"l><"col-12 col-md-6 d-flex justify-content-end"B>>rtip'
        : '<"row mb-2"<"col-12 col-md-6"l><"col-12 col-md-6"f>>rtip',
      columns: [
        { data: "customer_id",           title: "Customer ID",        className: "text-nowrap" },
        { data: "customer_display_name", title: "Customer",           className: "text-nowrap" },
        { data: "location_alias",        title: "Location",           className: "text-nowrap" },
        { data: "type_display",          title: "Type",               className: "text-nowrap" },
        {
          data: null,
          title: "Email",
          className: "text-nowrap",
          render: function (_data, type, row) {
            const email = row.email || "";
            if (type && type !== "display") return email;
            const st = getEmailStatus(row);
            return buildEmailCell(email, st);
          }
        },
        { data: "phone", title: "Phone", className: "text-nowrap" }
      ],
      columnDefs: [
        {
          targets: 4,
          createdCell: function (td, _cellData, rowData) {
            const st = getEmailStatus(rowData);
            if (st && !isOkGroup(st)) {
              td.classList.add("email-problem-cell");
            } else {
              td.classList.remove("email-problem-cell");
            }
          }
        }
      ],
      paging: true,
      pageLength: 25,
      responsive: true,
      autoWidth: false,
      language: { url: "//cdn.datatables.net/plug-ins/1.13.7/i18n/en-GB.json" },
      buttons: hasButtons
        ? [
            {
              extend: "csvHtml5",
              text: '<i class="ti ti-file-spreadsheet me-1"></i><span class="export-csv-label">Export CSV</span>',
              className: "dt-button export-csv-btn btn btn-sm btn-primary",
              titleAttr: "Export CSV",
              title: () =>
                CURRENT_TYPE === "phone"
                  ? "Customers_Without_Phone"
                  : CURRENT_TYPE === "invalid_email"
                    ? "Customers_With_Invalid_Email"
                    : "Customers_Without_Email",
              filename: () =>
                CURRENT_TYPE === "phone"
                  ? "Customers_Without_Phone"
                  : CURRENT_TYPE === "invalid_email"
                    ? "Customers_With_Invalid_Email"
                    : "Customers_Without_Email",
              bom: true,
              exportOptions: { columns: ":visible" }
            }
          ]
        : undefined
    });

    // Actualizar KPI "Selected Errors" ante cambios de tabla (filtro, paginación, orden)
    $table.off("draw.dt.mce").on("draw.dt.mce", function () {
      updateSelectedErrorsFromTable();
    });

    if (hasButtons) {
      const $csvBtn = $table
        .closest(".card, .container, body")
        .find(".dataTables_wrapper .dt-buttons .buttons-csv, .dataTables_wrapper .dt-buttons .buttons-html5");
      $csvBtn.addClass("btn btn-sm btn-primary export-csv-btn");
    }

    // Set inicial del KPI tras crear la tabla
    updateSelectedErrorsFromTable();
  }

  async function refreshAllKpisAndTableCounts() {
    await refreshAllKpis();
    updateSelectedErrorsFromTable();
  }

  async function fetchRows() {
    if (!CURRENT_LOCATION) return; // sin location, manten SSR
    try {
      hideLoadingAlert();
      const params = new URLSearchParams();
      params.set("type", CURRENT_TYPE);
      params.set("location", CURRENT_LOCATION);
      const url = `/api/missing-contact-errors?${params.toString()}`;
      const res = await fetch(url, {
        cache: "no-store",
        headers: { "X-Requested-With": "XMLHttpRequest" }
      });
      if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
      const data = await res.json();
      initTable(data.rows || []);
      updateLocationAliasLabel(data.locationAlias);
      if (CURRENT_TYPE === "invalid_email" && data.verificationMessage) {
        showInfoAlert(data.verificationMessage);
      } else {
        hideInfoAlert();
      }
      syncVerifyButtonState();
      await refreshAllKpisAndTableCounts();
    } catch (e) {
      hideLoadingAlert();
      console.error("[MCE] fetchRows error:", e);
      alert("Error loading data: " + (e?.message || e));
    }
  }

  // Alertas utilitarias
  function showInfoAlert(msg) {
    let alert = document.getElementById("mce-info-alert");
    if (!alert) {
      alert = document.createElement("div");
      alert.id = "mce-info-alert";
      alert.className = "alert alert-info mb-3";
      alert.style = "margin: 1em 0;";
      document.querySelector(".filter-toolbar, .card-body")?.prepend(alert);
    }
    alert.textContent = msg;
  }
  function hideInfoAlert() {
    const alert = document.getElementById("mce-info-alert");
    if (alert) alert.remove();
  }
  function showLoadingAlert(msg) {
    let alert = document.getElementById("mce-loading-alert");
    const host = document.querySelector(".filter-toolbar, .card-body");
    if (!host) return;
    if (!alert) {
      alert = document.createElement("div");
      alert.id = "mce-loading-alert";
      alert.className = "alert alert-warning mb-3";
      alert.style = "margin: 1em 0;";
      alert.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span> ${msg}`;
      host.prepend(alert);
    } else {
      alert.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span> ${msg}`;
    }
  }
  function hideLoadingAlert() {
    const alert = document.getElementById("mce-loading-alert");
    if (alert) alert.remove();
  }

  // Wire-up
  $(function () {
    const INITIAL = window.__MCE__ || {};

    // Tipo inicial
    const selType = document.getElementById("mce-error-type");
    if (selType) {
      CURRENT_TYPE = selType.value || INITIAL.type || "email";
      selType.addEventListener("change", async () => {
        CURRENT_TYPE = selType.value;
        hideLoadingAlert();
        hideInfoAlert();
        setLabel(KPI_IDS.selectedLabel, getSelectedKindLabel(CURRENT_TYPE));
        await fetchRows();
      });
      setLabel(KPI_IDS.selectedLabel, getSelectedKindLabel(CURRENT_TYPE));
    } else {
      CURRENT_TYPE = INITIAL.type || "email";
      setLabel(KPI_IDS.selectedLabel, getSelectedKindLabel(CURRENT_TYPE));
    }

    // Location inicial
    const selLoc = document.getElementById("location-select");
    if (selLoc) {
      CURRENT_LOCATION = selLoc.value || selLoc.options[0]?.value || INITIAL.locationId || null;
      if (!selLoc.value && selLoc.options[0]) selLoc.value = selLoc.options[0].value;
      selLoc.addEventListener("change", async () => {
        hideLoadingAlert();
        hideInfoAlert();
        CURRENT_LOCATION = selLoc.value || null;
        syncVerifyButtonState();
        await fetchRows();
      });
    } else {
      CURRENT_LOCATION = INITIAL.locationId || null;
    }

    const verifyBtn = document.getElementById("mce-verify-btn");
    if (verifyBtn) verifyBtn.addEventListener("click", onVerifyClick);

    syncVerifyButtonState();

    // Primera carga: dispara fetch y KPIs si hay location
    fetchRows();
  });
})();