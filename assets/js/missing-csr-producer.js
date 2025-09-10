"use strict";

/**
 * Missing CSR/Producer (frontend)
 * - KPI azul: Active Policies (endpoint ligero) => actualiza al cambiar de franquicia y en Apply.
 * - KPI rojo: total visible en la DataTable (Missing CSR/Producer) => se calcula en cada draw/search/order/page/length.
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
    const dt = new Date(v);
    return isNaN(dt.getTime()) ? null : dt.toISOString().slice(0, 10);
  }

  function getQueryContext() {
    const p = new URLSearchParams(location.search);
    const start = parseAnyToISO(p.get("start"));
    const end = parseAnyToISO(p.get("end"));
    const activeRaw = (p.get("active") || "").toLowerCase();
    const active = activeRaw === "1" || activeRaw === "true" || activeRaw === "on" || activeRaw === "yes";

    let locationIdRaw = p.get("location");
    const select = document.getElementById("location-select");
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

  let MCP_CTX = { start: null, end: null, locationId: null, active: false };
  let dt;
  let dtInitialized = false;

  function renderDateCell(d, t) {
    if (t === "display" || t === "filter") return safeDateDisp(d);
    const x = new Date(d || "");
    return isNaN(x.getTime()) ? 0 : x.getTime();
  }

  // KPI helpers
  function updateActivePoliciesCount(count) {
    const el = document.getElementById("mcp-active-policies-count");
    if (!el) return;
    const n = Number(count);
    el.textContent = Number.isFinite(n) ? n.toLocaleString("en-US") : "0";
  }
  function updateMissingTotalCount(count) {
    const el = document.getElementById("mcp-missing-total-count");
    if (!el) return;
    const n = Number(count);
    el.textContent = Number.isFinite(n) ? n.toLocaleString("en-US") : "0";
  }

  function isNonEmptyRow(r) {
    if (!r || typeof r !== "object") return false;
    const fields = [
      "policy_number",
      "line_of_business",
      "csr",
      "producer",
      "location",
      "business_type",
      "binder_date",
      "effective_date",
      "missing_fields",
      "policy_status"
    ];
    return fields.some(k => String(r[k] || "").trim() !== "");
  }

  function updateMissingKpiFromTable() {
    if (!dt) return;
    const data = dt.rows({ search: "applied" }).data().toArray();
    const count = data.filter(isNonEmptyRow).length;
    updateMissingTotalCount(count);
  }

  function initMissingPoliciesTable(rows) {
    const $table = $(".datatable-missing-csr-producer");
    if ($table.length === 0) return;
    if (!$.fn || !$.fn.DataTable) {
      console.error("[MCP] DataTables is not loaded.");
      return;
    }

    if ($.fn.DataTable.isDataTable($table)) {
      const existing = $table.DataTable();
      existing.clear();
      existing.rows.add(rows || []);
      existing.draw(false);
      dt = existing;
      dtInitialized = true;
      updateMissingKpiFromTable();
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
    }

    dt = $table.DataTable(dtOptions);
    dtInitialized = true;

    // Sincroniza KPI rojo con la tabla
    dt.on("draw.dt search.dt order.dt page.dt length.dt", function () {
      updateMissingKpiFromTable();
    });

    // Inicial
    updateMissingKpiFromTable();

    // Click fila -> modal (si lo usas)
    $table.off("click.mcp", "tbody tr").on("click.mcp", "tbody tr", function () {
      const row = dt.row(this).data();
      if (!row) return;
      // openPolicyModal(row); // opcional si mantienes el modal
    });
  }

  function updateMissingPoliciesTable(rows) {
    if (!dtInitialized) {
      initMissingPoliciesTable(rows);
      return;
    }
    dt.clear();
    dt.rows.add(rows || []);
    dt.draw(false);
    updateMissingKpiFromTable();
  }

  async function fetchActivePoliciesCount(locationId) {
    if (locationId == null || Number.isNaN(Number(locationId))) return;
    try {
      const url = `/api/active-policies-count?location=${encodeURIComponent(locationId)}`;
      const res = await fetch(url, { cache: "no-store", credentials: "same-origin", headers: { "X-Requested-With": "XMLHttpRequest" } });
      if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
      const data = await res.json();
      updateActivePoliciesCount(data.count || 0);
    } catch (e) {
      console.warn("[MCP] Failed to fetch active policies count:", e);
    }
  }

  async function fetchAndRenderMissingPolicies(startISO, endISO) {
    try {
      const params = new URLSearchParams();

      // Location
      const select = document.getElementById("location-select");
      let locationId = MCP_CTX.locationId;
      if (select && select.value !== "") locationId = select.value;
      if (locationId != null && !Number.isNaN(locationId) && locationId !== "") {
        params.set("location", String(locationId));
      }

      // Active-only flag (no controla fechas)
      const activeOnly = !!document.getElementById("mcp-active-only")?.checked;
      if (activeOnly) params.set("active", "1");

      // Fechas: solo enviar si hay rango completo
      if (startISO && endISO) {
        params.set("start", startISO);
        params.set("end", endISO);
      }

      const url = `/api/missing-csr-producer?${params.toString()}`;
      const res = await fetch(url, {
        cache: "no-store",
        credentials: "same-origin",
        headers: { "X-Requested-With": "XMLHttpRequest" }
      });

      if (!res.ok) {
        let serverMsg = "";
        try {
          const errJson = await res.json();
          serverMsg = errJson?.error || "";
        } catch {
        /* ignore */ }
        throw new Error(serverMsg || `Request failed (${res.status})`);
      }

      const data = await res.json();
      updateMissingPoliciesTable(data.rows || []);

      // KPI azul (si el backend lo envía)
      if (typeof data.activePoliciesCount === "number") {
        updateActivePoliciesCount(data.activePoliciesCount);
      } else if (locationId != null) {
        // fallback
        fetchActivePoliciesCount(locationId);
      }

      const badge = document.getElementById("mcp-selected-range");
      if (badge) {
        const s = data.range?.startISO;
        const e = data.range?.endISO;
        badge.textContent = s && e ? `${s} → ${e}` : "—";
      }

      MCP_CTX.active = !!activeOnly;
      MCP_CTX.start = data.range?.startISO || null;
      MCP_CTX.end = data.range?.endISO || null;
      updateNavLinksWithContext({
        start: MCP_CTX.start,
        end: MCP_CTX.end,
        locationId: MCP_CTX.locationId,
        active: MCP_CTX.active
      });
    } catch (e) {
      console.error("Error fetching missing CSR/Producer policies:", e);
      alert(e?.message || "Error loading data.");
    }
  }

  $(function () {
    MCP_CTX = getQueryContext();

    // Inicializar inputs (flatpickr opcional)
    if (window.flatpickr) {
      flatpickr("#mcp-start", { dateFormat: "Y-m-d", allowInput: true });
      flatpickr("#mcp-end",   { dateFormat: "Y-m-d", allowInput: true });
    }

    if (MCP_CTX.start) $("#mcp-start").val(MCP_CTX.start);
    if (MCP_CTX.end) $("#mcp-end").val(MCP_CTX.end);

    const activeChk = document.getElementById("mcp-active-only");
    if (activeChk) activeChk.checked = !!MCP_CTX.active;

    const select = document.getElementById("location-select");
    if (select && MCP_CTX.locationId != null && !Number.isNaN(MCP_CTX.locationId)) {
      select.value = MCP_CTX.locationId;
    }

    // SSR inicial (si viene)
    const init = window.MCP_INITIAL || null;
    if (init) {
      updateMissingPoliciesTable(init.rows || []);
      if (activeChk && typeof init.activeOnly === "boolean") {
        activeChk.checked = init.activeOnly;
        MCP_CTX.active = init.activeOnly;
      }
      if (typeof init.activePoliciesCount === "number") {
        updateActivePoliciesCount(init.activePoliciesCount);
      }
    }

    // Si hay location inicial, cargar KPI azul al entrar
    if (MCP_CTX.locationId != null) {
      fetchActivePoliciesCount(MCP_CTX.locationId);
    }

    // Apply => recarga tabla y actualiza KPI azul también
    $("#mcp-apply").on("click", function () {
      const rawStart = $("#mcp-start").val();
      const rawEnd = $("#mcp-end").val();
      const startISO = formatDateISO(rawStart);
      const endISO = formatDateISO(rawEnd);

      const haveStart = !!(rawStart && rawStart.trim() !== "");
      const haveEnd = !!(rawEnd && rawEnd.trim() !== "");

      if ((haveStart && !haveEnd) || (!haveStart && haveEnd)) {
        alert("Please select both start and end dates to use a date range, or leave both empty.");
        return;
      }
      if ((haveStart && !startISO) || (haveEnd && !endISO)) {
        alert("Invalid date format. Please use YYYY-MM-DD.");
        return;
      }
      if (startISO && endISO && new Date(startISO) > new Date(endISO)) {
        alert("Invalid date range: start date must not be after end date.");
        return;
      }

      fetchAndRenderMissingPolicies(startISO || null, endISO || null);

      const loc = document.getElementById("location-select")?.value || MCP_CTX.locationId;
      if (loc != null && !Number.isNaN(Number(loc))) {
        fetchActivePoliciesCount(Number(loc));
      }
    });

    // Cambiar de franquicia => auto-apply y actualiza KPI azul inmediatamente
    $("#location-select").on("change", function () {
      MCP_CTX.locationId = $(this).val() || null;
      const loc = MCP_CTX.locationId;
      if (loc != null && !Number.isNaN(Number(loc))) {
        fetchActivePoliciesCount(Number(loc));
      }
      $("#mcp-apply").trigger("click");
    });

    // El toggle Active se aplica al presionar Apply (manteniendo reglas de la página)
    $("#mcp-active-only").on("change", function () {
      // No hacemos fetch hasta Apply; el KPI rojo se recalculará tras recargar la tabla.
    });
  });
})();