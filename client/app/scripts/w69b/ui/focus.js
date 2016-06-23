'use strict';

angular.module('w69b.ui.focus', [])
  .directive('wbLoopFocus', ['$document', '$timeout',
    function($document, $timeout) {
      return {
        restrict: 'A',
        link: function(scope, elem) {
          var domEl = elem[0];

          function focusFirstChild() {
            var el = domEl.querySelector(
              'input:not([tabindex^="-"]),' +
                'textarea:not([tabindex^="-"]),' +
                'button:not([tabindex^="-"]),' +
                '*[tabindex]:not([tabindex^="-"])');
            if (el) el.focus();
          }

          function onFocus(ev) {
            var elem = ev.target;
            if (!domEl.contains(elem)) {
              $timeout(focusFirstChild);
            }
          }

          elem.attr('tabindex', -1);

          var body = $document.find('body');
          body[0].addEventListener('focus', onFocus, true);

          elem.on('$destroy', function() {
            body[0].removeEventListener('focus', onFocus, true);
          });

        }
      };
    }])
  .directive('wbFocus',
    ['$timeout', function($timeout) {
      return {
        link: function(scope, element, attrs) {
          scope.$watch(attrs.wbFocus, function(val) {
            if (val) {
              $timeout(function() {
                element[0].focus();
                if (element[0].select)
                  element[0].select();
              });
            }
          }, true);

          element.bind('blur', function() {
            if (angular.isDefined(attrs.wbFocusLost)) {
              scope.$apply(attrs.wbFocusLost);
            }
          });
        }
      };
    }])
  .directive('wbAutoselect', ['$timeout', function($timeout) {
    return {
      link: function(scope, element) {
        element.bind('focus click', function() {
          $timeout(function() {
            element[0].select();
          });
        });
      }
    };
  }]);

