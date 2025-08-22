"use strict";

(function () {
  // Estado: tipo de error y franquicia seleccionada.
  let CURRENT_TYPE = "email"; // "email" | "phone"
  let CURRENT_LOCATION = null; // location_id (solo para corporativo)

  // Render DataTable
  let dt;
  function initTable(rows) {
    const $table = $(".datatable-missing-contact-errors");
    if (!$.fn || !$.fn.DataTable) {
      console.error("[MCE] DataTables not loaded");
      return;
    }
    if ($.fn.DataTable.isDataTable($table)) {
      dt = $table.DataTable();
      dt.clear();
      dt.rows.add(rows || []);
      dt.draw(false);
      return;
    }
    const hasButtons = !!($.fn.dataTable && $.fn.dataTable.Buttons);
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
        { data: "email",                 title: "Email",              className: "text-nowrap" },
        { data: "phone",                 title: "Phone",              className: "text-nowrap" }
      ],
      paging: true,
      pageLength: 25,
      responsive: true,
      autoWidth: false,
      language: {
        url: "//cdn.datatables.net/plug-ins/1.13.7/i18n/en-GB.json"
      },
      buttons: hasButtons
        ? [
            {
              extend: "csvHtml5",
              text: '<i class="ti ti-file-spreadsheet me-1"></i> Export CSV',
              className: "btn btn-sm btn-primary",
              title: () => (CURRENT_TYPE === "phone" ? "Customers_Without_Phone" : "Customers_Without_Email"),
              filename: () => (CURRENT_TYPE === "phone" ? "Customers_Without_Phone" : "Customers_Without_Email"),
              bom: true,
              exportOptions: { columns: ":visible" }
            }
          ]
        : undefined
    });
  }

  // Actualiza el alias mostrado en el header ("Location: <alias>")
  function updateLocationAliasLabel(locationAlias) {
    const span = document.getElementById("mce-location-alias");
    if (!span) return;
    span.textContent = locationAlias || "—";
  }

  async function fetchRows() {
    try {
      const params = new URLSearchParams();
      params.set("type", CURRENT_TYPE);
      // Si hay select de franquicia/location, mandamos ese location_id por query param
      if (CURRENT_LOCATION) params.set("location", CURRENT_LOCATION);
      const url = `/api/missing-contact-errors?${params.toString()}`;
      const res = await fetch(url, {
        cache: "no-store",
        headers: { "X-Requested-With": "XMLHttpRequest" }
      });
      if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
      const data = await res.json();
      initTable(data.rows || []);
      updateLocationAliasLabel(data.locationAlias);
    } catch (e) {
      console.error("[MCE] fetchRows error:", e);
      alert("Error loading data: " + (e?.message || e));
    }
  }

  $(function () {
    // Selector de tipo (email/phone)
    const selType = document.getElementById("mce-error-type");
    if (selType) {
      selType.addEventListener("change", () => {
        CURRENT_TYPE = selType.value === "phone" ? "phone" : "email";
        fetchRows();
      });
      CURRENT_TYPE = selType.value === "phone" ? "phone" : "email";
    }

    // Selector de franquicia/location (si existe)
    const selLoc = document.getElementById("location-select");
    if (selLoc) {
      CURRENT_LOCATION = selLoc.value || null;
      selLoc.addEventListener("change", () => {
        CURRENT_LOCATION = selLoc.value || null;
        fetchRows();
      });
    }

    // Inicial
    fetchRows();
  });
})();