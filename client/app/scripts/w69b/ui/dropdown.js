'use strict';

angular.module('w69b.ui.dropdown', ['ui.bootstrap.position'])
  .directive('wbAbsPositioned',
    ['$document', '$position', '$window', '$timeout',
      function($document, $position, $window, $timeout) {
        return {
          restrict: 'A',
          link: function postLink(scope, element, attrs) {
            function getOffset() {
              var oldDisplay = element.css('display');
              element.css('display', 'block');
              var pos = $position.offset(element);
              element.css('display', oldDisplay);
              return pos;
            }

            function rePosition() {
              var offset = getOffset();
              var absPos = {
                left: +offset.left + 'px',
                top: offset.top + 'px',
                position: 'absolute'};

              contentEl.css(absPos);
            }

            var body = $document.find('body');
            var win = angular.element($window);

            var contentEl = element.children();
            if (contentEl.length > 1) {
              throw new Error('only one child allowed in wb-abs-positioned');
            }
            body.append(contentEl);

            rePosition();
            function onResize() {
              if (attrs.deferred)
                $timeout(rePosition, 100);
              else
                rePosition();
            }
            win.bind('resize', onResize);
            scope.$on('$destroy', function() {
              win.unbind('resize', onResize);
            });
            element.bind('$destroy', function() {
              contentEl.remove();
            });
          }
        };

      }])
  .directive('dropdownCloser',
    ['$document', '$location', function($document, $location) {
      /**
       * dropdown Closer - sets given scope variable to false on clicks outside or
       * on location changes (while variable was true).
       * @restrict attribute
       */
      return {
        restrict: 'A',
        require: '?^wbDropdownRoot',
        link: function postLink(scope, element, attrs, rootCtrl) {
          var shownName = attrs.dropdownCloser;
          var unwatchLocation = angular.noop;
          var onClick = null;

          /**
           * Check if node in dom and not a descendent of element .
           */
          function isNonDescendent(node) {
            var domEl = element[0];
            var inRoot = rootCtrl && rootCtrl.getElement()[0].contains(node);

            return $document[0].contains(node) && !inRoot &&
              !domEl.contains(node);
          }

          function hideOnClick(event) {
            if (isNonDescendent(event.target)) {
              scope[shownName] = false;
              if (!scope.$root.$$phase && !scope.$$phase)
                scope.$digest();
            }
          }

          function unbind() {
            if (onClick)
              $document.unbind('click', onClick);
            unwatchLocation();
          }


          function watchLocation() {
            unwatchLocation = scope.$watch(function() {
              return $location.path();
            }, function(newVal, oldVal) {
              if (oldVal == newVal) return;
              scope[shownName] = false;
            });
          }

          scope.$watch(shownName, function(shown) {
            if (shown) {
              onClick = hideOnClick;
              $document.bind('click', onClick);
              watchLocation();
            } else {
              unbind();
            }
          });
          scope.$on('$destroy', unbind);
        }
      };
    }]).
  directive('wbDropdownRoot', function() {
    return {
      restrict: 'AC',
      controller: ['$element', function($element) {
        this.getElement = function() {
          return $element;
        };
      }]
    };
  });

