'use strict';

angular.module('w69b.ui.timepicker', [])
  .directive('timepicker',
    ['$filter', function($filter) {
      return {
        templateUrl: 'views/timepicker.html',
        restrict: 'EA',
        // require: '?^ngModel',
        replace: true,
        scope: {timeOut: '=timepicker'},
        link: function(scope, elem, attrs) {

          var stepMinutes = 30;
          var minutesPerDay = 60 * 24;
          var dateFilter = $filter('date');

          var input = elem.find('input').eq(0);

          if (attrs.tabindex) {
            input.attr('tabindex', attrs.tabindex);
          }

          scope.dropdownShown = false;

          /**
           * Convert minutes to date object.
           * @param {number} minutes
           * @return {Date}
           */
          function minutesToDate(minutes) {
            var date = new Date();
            date.setHours(0, 0, 0, 0);
            date.setMinutes(minutes);
            return date;
          }

          scope.times = [];
          for (var min = 0; min < minutesPerDay; min += stepMinutes) {
            scope.times.push(minutesToDate(min));
          }

          function setInputFromModel() {
            scope.timeInput = dateFilter(scope.timeOut, 'shortTime');
          }

          scope.$watch('timeOut', function(val) {
            var date = val ? new Date(val) : null;
            // is date invalid?
            if (!date || isNaN(date.getTime())) {
              date = minutesToDate(9 * 60);
              scope.timeOut = date;
            }
            setInputFromModel();
          }, true);

          /**
           * Set time part of output date.
           * @param {Date} time time wrapped in date object.
           */
          function setOutTime(time) {
            scope.timeOut.setHours(time.getHours(), time.getMinutes(), 0, 0);
          }

          function parseInput() {
            var str = scope.timeInput.trim();
            var match = str.match(/^(\d\d?)(?::(\d\d?))?\s?(am|pm)?/i);
            if (match) {
              var hours = match[1] | 0;
              var min = match[2] | 0;
              var ampm = match[3];
              if (ampm) ampm = angular.lowercase(ampm);
              if (ampm == 'pm' && hours < 12) hours += 12;
              if (ampm == 'am' && hours >= 12) hours -= 12;
              var minTotal = hours * 60 + (min || 0);
              setOutTime(minutesToDate(minTotal));
            }
            setInputFromModel();
            scope.dropdownShown = false;
          }

          scope.select = function(time) {
            scope.dropdownShown = false;
            setOutTime(time);
          };

          input.on('focus', function() {
            scope.$apply('dropdownShown = true');
          });

          // parse input when dropdown is hidden
          scope.$watch('dropdownShown', function(shown, old) {
            if (shown == old) return;
            if (!shown) parseInput();
          });

          input.on('keydown', function(ev) {
            // enter or tab
            if (ev.keyCode == 13 || ev.keyCode == 9) {
              scope.$apply(parseInput);
            }
          });

        }
      };
    }]);
