/**
 * DataTables Basic
 */

'use strict';

let fv, offCanvasEl;

$(async function () {
  var dt_row_grouping_table = $('.dt-row-grouping');
  // Row Grouping
  // --------------------------------------------------------------------

  // Cambia a método GET, la lista no debería ser POST para lectura
  const response = await fetch('/users/config/headcarrier/list', {
    method: 'GET'
  });
  const data = await response.json();

  var groupColumn = 2;
  if (dt_row_grouping_table.length) {
    var groupingTable = dt_row_grouping_table.DataTable({
      data: data.data,
      columns: [
        { data: '' },                // Responsive control
        { data: 'display_name' },    // Carrier display name
        { data: 'name' },            // Head Carrier name (agrupador)
        { data: 'type_display' },    // Type/role
        { data: 'created_on' },      // Creado
        { data: 'date_last_modified' }, // Modificado
        { data: '' }                 // Acciones
      ],
      columnDefs: [
        {
          // For Responsive
          className: 'control',
          orderable: false,
          targets: 0,
          searchable: false,
          render: function () {
            return '';
          }
        },
        { visible: false, targets: groupColumn },
        {
          // Actions
          targets: -1,
          title: 'Actions',
          orderable: false,
          searchable: false,
          render: function (data, type, full, meta) {
            return (
              `<a href="javascript:;" class="btn btn-sm btn-icon item-edit" data-bs-target="#addCarrier" data-bs-toggle="modal"
              data-bs-dismiss="modal"><i class="text-primary ti ti-plus"></i></a>` +
              `<a href="javascript:;" class="btn btn-sm btn-icon item-edit" data-bs-target="#deleteCarrier" data-bs-toggle="modal"
              data-bs-dismiss="modal"><i class="text-primary ti ti-trash"></i></a>`
            );
          }
        }
      ],
      order: [[groupColumn, 'asc']],
      dom: '<"row"<"col-sm-12 col-md-6"l><"col-sm-12 col-md-6 d-flex justify-content-center justify-content-md-end"f>>t<"row"<"col-sm-12 col-md-6"i><"col-sm-12 col-md-6"p>>',
      displayLength: 25,
      lengthMenu: [7, 10, 25, 50, 75, 100],
      drawCallback: function (settings) {
        var api = this.api();
        var rows = api.rows({ page: 'current' }).nodes();
        var last = null;

        api
          .column(groupColumn, { page: 'current' })
          .data()
          .each(function (group, i) {
            if (last !== group) {
              $(rows)
                .eq(i)
                .before('<tr class="group"><td colspan="8" class="text-primary fw-bold">' + group + '</td></tr>');
              last = group;
            }
          });
      },
      responsive: {
        details: {
          display: $.fn.dataTable.Responsive.display.modal({
            header: function (row) {
              var data = row.data();
              return 'Details of ' + data['display_name'];
            }
          }),
          type: 'column',
          renderer: function (api, rowIdx, columns) {
            var data = $.map(columns, function (col) {
              return col.title !== ''
                ? '<tr data-dt-row="' +
                    col.rowIndex +
                    '" data-dt-column="' +
                    col.columnIndex +
                    '">' +
                    '<td>' +
                    col.title +
                    ':' +
                    '</td> ' +
                    '<td>' +
                    col.data +
                    '</td>' +
                    '</tr>'
                : '';
            }).join('');

            return data ? $('<table class="table"/><tbody />').append(data) : false;
          }
        }
      }
    });

    groupingTable.on('click', 'tr', function () {
      const rowData = groupingTable.row(this).data();
      if (rowData) {
        document.getElementById('name1').value = rowData.name;
        document.getElementById('name2').value = rowData.name;
        document.getElementById('contact_id').value = rowData.entity_id;
        document.getElementById('carrierMga').value = rowData.display_name;
      }
    });
  }

  // Filter form control to default size
  setTimeout(() => {
    $('.dataTables_filter .form-control').removeClass('form-control-sm');
    $('.dataTables_length .form-select').removeClass('form-select-sm');
  }, 300);
});