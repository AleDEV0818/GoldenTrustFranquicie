$(function() {
  // DataTable: Destruye si existe y luego inicializa
  if ($.fn.DataTable.isDataTable('.dt-row-grouping')) {
    $('.dt-row-grouping').DataTable().destroy();
  }

  $('.dt-row-grouping').DataTable({
    responsive: true,
    columnDefs: [{ targets: 0, responsivePriority: 1 }],
    order: [[0, 'asc']],
    // Botón Export CSV arriba derecha
    dom: '<"card-header pb-0 pt-sm-0"<"head-label"><"d-flex justify-content-center justify-content-md-end"B>>l t<"row mx-2"<"col-sm-12 col-md-6"i><"col-sm-12 col-md-6"p>>',
    displayLength: 10,
    language: { paginate: { previous: "←", next: "→" } },
    buttons: [
      {
        extend: "csvHtml5",
        text: '<i class="ti ti-file-spreadsheet me-2"></i>Export CSV',
        className: "btn btn-label-secondary",
        fieldSeparator: ",", // opcional
        extension: ".csv"    // opcional
      }
    ]
  });

  // Detecta click en el selector de estilos
  $('.dropdown-styles .dropdown-item').on('click', function(e) {
    e.preventDefault();
    const theme = $(this).data('theme');
    if (theme === 'light') {
      $('html').attr('data-theme', 'light');
      localStorage.setItem('gti_theme', 'light');
    } else if (theme === 'dark') {
      $('html').attr('data-theme', 'dark');
      localStorage.setItem('gti_theme', 'dark');
    } else {
      $('html').attr('data-theme', 'system');
      localStorage.setItem('gti_theme', 'system');
    }
   
  });

  // Al cargar la página, aplica el tema guardado
  const savedTheme = localStorage.getItem('gti_theme');
  if (savedTheme) {
    $('html').attr('data-theme', savedTheme);
    // document.body.classList.toggle('bg-dark', savedTheme === 'dark');
  }
});