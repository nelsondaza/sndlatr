'use strict';

// jasmine matcher for expecting an element to have a css class
// https://github.com/angular/angular.js/blob/master/test/matchers.js
beforeEach(function() {
  this.addMatchers({
    toHaveClass: function(cls) {
      this.message = function() {
        return 'Expected \'' + angular.mock.dump(this.actual) +
          '\' to have class \'' + cls + '\'.';
      };

      return this.actual.hasClass(cls);
    },
    toBeDisplayed: function() {
      this.message = function() {
        return 'Expected \'' + angular.mock.dump(this.actual) +
          '\' to be displayed.';
      };

      return this.actual.css('display') != 'none' &&
        !this.actual.hasClass('ng-hide');
    },
    toBeHidden: function() {
      this.message = function() {
        return 'Expected \'' + angular.mock.dump(this.actual) +
          '\' to be hidden.';
      };

      return this.actual.css('display') == 'none' ||
        this.actual.hasClass('ng-hide');
    },
    toEqualAbout: function(value, tollerance) {
      if (!tollerance) tollerance = 0.0001;
      this.message = function() {
        return 'Expected \'' + angular.mock.dump(this.actual) +
          '\' to be ' + value + ' (+- ' + tollerance + ')';
      };

      return Math.abs(this.actual - value) <= tollerance;
    }
  });
});

(function($) {
  $.fn.inputText = function(txt) {
    this.val(txt).trigger('input');
  };
})(jQuery);
