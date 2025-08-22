(function () {
  if (window.jQuery && !jQuery.fn.typeahead) {
    jQuery.fn.typeahead = function () {
      return this; 
    };
  }
})();