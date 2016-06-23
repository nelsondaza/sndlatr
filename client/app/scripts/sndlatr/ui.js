'use strict';

angular.module('sndlatr.ui',
    ['ui.bootstrap', 'w69b.ui',
      'sndlatr.scheduler', 'w69b.throttle'])
  .directive('sendLaterDropdown', function() {
    return {
      templateUrl: 'views/sendLaterDropdown.html',
      restrict: 'EA',
      replace: true,
      scope: {
        selectedDate: '=?sendLaterDropdown',
        onSelect: '&',
        ngDisabled: '='
      },
      controller: 'SendLaterDropdownCtrl'
    };
  })
  .directive('remindDropdown', function() {
    return {
      templateUrl: 'views/remindDropdown.html',
      restrict: 'EA',
      replace: false,
      scope: {
        job: '=?remindDropdown'
      },
      controller: 'RemindDropdownCtrl'
    };
  })
  .directive('snippetsDropdown', function() {
    return {
      templateUrl: 'views/snippetsDropdown.html',
      restrict: 'EA',
      replace: true,
      scope: {
        onSelect: '&',
        getMail: '&'
      },
      controller: 'SnippetsDropdownCtrl'
    };
  })
  .directive('snippetEditor', function() {
    return {
      templateUrl: 'views/snippetEditor.html',
      restrict: 'EA',
      replace: true,
      controller: 'SnippetEditorCtrl',
      scope: {
        snippet: '=snippetEditor',
        dirty: '=?'
      }
    };
  })
  .directive('editSnippetsList', ['$compile', function($compile) {
    return {
      templateUrl: 'views/editSnippetsList.html',
      restrict: 'EA',
      replace: true,
      controller: 'EditSnippetsListCtrl',
      scope: {},
      compile: function compile() {
        var editLinkFn = $compile(angular.element(
          '<div data-snippet-editor="currentSnippet" ' +
            'data-dirty="currentSnippet.$dirty"></div>'));
        return {
          post: function(scope, elem, attr) {
            var editorEl = angular.element(
              elem[0].querySelector('.editorContainer'));
            var childScope;
            scope.edit = function(snippet) {
              editorEl.children().remove();
              if (childScope) childScope.$destroy();

              scope.currentSnippet = snippet;
              // create new scope and editor, replace editorEl content
              childScope = scope.$new();
              editLinkFn(childScope, function(clonedEl) {
                editorEl.append(clonedEl);
              });
              scope.view = 'edit';
            };

            if (attr.edit) {
              scope.$parent.$watch(attr.edit, function(snippet) {
                if (snippet) scope.edit(snippet);
              });
            }

          }
        };
      }
    };
  }])
  .directive('humanDateInput', function() {
    return {
      templateUrl: 'views/humanDateInput.html',
      restrict: 'EA',
      scope: {
        date: '=?humanDateInput',
        dateHuman: '=?',
        onSelect: '&',
        wbFocus: '='
      },
      transclude: true,
      controller: 'HumanDateInputCtrl'
    };
  })
  .directive('relativeTimesMenu', function() {
    return {
      templateUrl: 'views/relativeTimesMenu.html',
      restrict: 'EA',
      replace: true,
      scope: {
        actionLabel: '@',
        onSelect: '&',
        wbFocus: '=',
        date: '=?'
      },
      transclude: true,
      controller: 'RelativeTimesMenuCtrl'
    };
  })
/**
 * Adds an empty span with class slCheckboxSibling to checkboxes
 */
  .directive('input', function() {
    return {
      restrict: 'E',
      link: function(scope, elem, attrs) {
        if (attrs.type != 'checkbox') return;
        var sibling = angular.element(
          '<span class="slCheckboxSibling"></span>');
        elem.after(sibling);
      }
    };
  })
  .controller('RelativeTimesMenuCtrl',
    ['$scope', '$timeout', '$modal', 'relativeTimesStore',
      function($scope, $timeout, $modal, relativeTimesStore) {
        $scope.dateHuman = '';
        $scope.date = null;
        var INVALID_CHECK_INTERVAL = 60000;

        var invalidatePromise;

        $scope.relativeTimes = relativeTimesStore.getSorted();
        var relativePresets = [
          'monday at 9 am',
          'tomorrow at 9:30 am',
          'in 3 months',
          'in 6 weeks',
          '1st of next month at 8 am',
          '1st of September at 8 am'
        ];

        (function() {
          while ($scope.relativeTimes.length < 5) {
            var preset = relativePresets.shift();
            if (!_.contains($scope.relativeTimes, preset))
              $scope.relativeTimes.push(preset);
          }
        })();

        /**
         * Remove items from list that are less that 1 minute in the future
         * and re-schedules timer.
         */
        function removeInvalid() {
          $scope.relativeTimes = $scope.relativeTimes.filter(function(str) {
            return Date.future(str).minutesFromNow() > 1;
          });
          invalidatePromise = $timeout(removeInvalid, INVALID_CHECK_INTERVAL);
        }

        invalidatePromise = $timeout(removeInvalid, INVALID_CHECK_INTERVAL);

        $scope.$on('$destroy', function() {
          if (invalidatePromise)
            $timeout.cancel(invalidatePromise);
        });

        function selectDate(date) {
          if ($scope.onSelect)
            $scope.onSelect({date: date});
          $scope.dateHuman = '';
        }

        /**
         * Click on date in dropdown.
         * @param {String} dateStr string.
         */
        $scope.select = function(dateStr) {
          var parsed = Date.future(dateStr);
          if (parsed.isValid() && parsed.isFuture()) {
            relativeTimesStore.add(dateStr);
            selectDate(parsed);
          }
        };
      }])
  .controller('HumanDateInputCtrl', ['$scope', '$timeout',
    function($scope, $timeout) {
      var coolDownPromise;
      $scope.dateHuman = '';
      $scope.date = null;
      /// Input did not change for some amount of time.
      $scope.humanCooledDown = true;

      function triggerCoolDown() {
        if (coolDownPromise) $timeout.cancel(coolDownPromise);
        $scope.humanCooledDown = false;
        coolDownPromise = $timeout(function() {
          $scope.humanCooledDown = true;
        }, 500);
      }


      $scope.$on('$destroy', function() {
        if (coolDownPromise)
          $timeout.cancel(coolDownPromise);
      });

      $scope.$watch('dateHuman', function(str, oldStr) {
        if (str == oldStr) return;
        var parsed = Date.future(str);
        if (parsed.isValid() && parsed.isFuture())
          $scope.date = parsed;
        else
          $scope.date = null;

        triggerCoolDown();
      });

      $scope.onReturn = function() {
        $scope.humanCooledDown = true;
        if ($scope.date && $scope.onSelect) {
          if ($scope.onSelect)
            $scope.onSelect({date: $scope.date});
        }
      };

    }])
  .controller('SnippetsDropdownCtrl', ['$scope', '$modal', 'Snippet',
    function($scope, $modal, Snippet) {
      $scope.dropdownShown = false;
      $scope.keywords = '';

      $scope.$watch(function() {
        return [$scope.keywords, Snippet.getCount()];
      }, function() {
        $scope.filteredSnippets = Snippet.getByKeywords($scope.keywords);
      }, true);

      $scope.selectSnippet = function(snippet) {
        $scope.dropdownShown = false;
        $scope.keywords = '';
        $scope.onSelect({snippet: snippet});
      };

      $scope.editSnippets = function(snippet) {
        var dialogScope = $scope.$new(true);
        dialogScope.snippet = snippet;

        $modal.open({
          templateUrl: 'views/dialogs/editSnippetsDialog.html',
          windowClass: 'slSnippetsWindow',
          controller: 'CloseableDialogCtrl',
          scope: dialogScope});
        $scope.dropdownShown = false;
      };

      $scope.mailToSnippet = function() {
        var mail = $scope.getMail();
        var snippet = new Snippet({
          name: '',
          subject: mail.subject,
          body: mail.body
        });
        snippet.put();
        $scope.editSnippets(snippet);
      };
    }])
  .controller('SnippetEditorCtrl', ['$scope', 'throttle',
    function($scope, throttle) {
      var throttledSave = throttle(function() {
        $scope.snippet.put().then(function() {
          $scope.dirty = false;
        });
      }, 1000);

      $scope.$on('$destroy', throttledSave.flush);

      $scope.$watch('[snippet.name||"", snippet.subject||"", snippet.body||""]',
        function(values, old) {
          if (angular.equals(values, old)) return;
          $scope.dirty = true;
          throttledSave();
        }, true);
    }])
  .controller('EditSnippetsListCtrl', ['$scope', 'Snippet',
    function($scope, Snippet) {
      $scope.snippets = Snippet.getAll();
      $scope.currentSnippet = null;
      $scope.view = 'list';

      $scope.newSnippet = function() {
        $scope.edit(new Snippet());
      };

      $scope.deleteSnippet = function(snippet) {
        snippet.delete();
      };
    }])
  .controller('RemindDropdownCtrl', ['$scope', '$modal',
    function($scope, $modal) {
      $scope.dropdownShown = false;
      $scope.date = null;

      $scope.selectDate = function(date) {
        // $scope.selectedDate = date;
        $scope.job.scheduledAt = date;
        $scope.dropdownShown = false;
      };

      $scope.pickDate = function() {
        if (!$scope.job) return;
        var dialogScope = $scope.$new(true);
        var date = $scope.date || $scope.job.scheduledAt;
        if (date) dialogScope.date = new Date(date);
        var dialog = $modal.open({
          templateUrl: 'views/remindDatePickerDialog.html',
          controller: 'RemindDatePickerDialogCtrl',
          scope: dialogScope});
        dialog.result.then(function(result) {
          if (!result)
            return;
          $scope.selectDate(result);
        });
        $scope.dropdownShown = false;
      };
    }])
  .controller('SendLaterDropdownCtrl', ['$scope', '$modal',
    function($scope, $modal) {
      $scope.dropdownShown = false;
      $scope.date = null;

      $scope.selectDate = function(date) {
        $scope.selectedDate = date;
        $scope.dropdownShown = false;
        if ($scope.onSelect)
          $scope.onSelect({date: date});
      };

      $scope.pickDate = function() {
        var dialogScope = $scope.$new(true);
        var date = $scope.date || $scope.selectedDate;
        if (date) dialogScope.date = new Date(date);
        var dialog = $modal.open({
          templateUrl: 'views/sendLaterDatePickerDialog.html',
          controller: 'SendLaterDatePickerDialogCtrl',
          scope: dialogScope});
        dialog.result.then(function(result) {
          if (!result)
            return;
          $scope.selectDate(result);
        });
        $scope.dropdownShown = false;
      };
    }])
  .controller('CloseableDialogCtrl',
    ['$scope', '$modalInstance', function($scope, $modalInstance) {
      $scope.close = function(result) {
        $modalInstance.close(result);
      };
    }])
  .controller('BaseDatePickerDialogCtrl',
    ['$scope', '$modalInstance',
      function($scope, $modalInstance) {
        if (!$scope.date) {
          $scope.date = Date.future('9 am');
        }
        $scope.isFuture = false;

        $scope.cancel = function() {
          $modalInstance.close();
        };

        $scope.$watch('date', function(date) {
          if (date.daysFromNow() <= 7) {
            $scope.dateRelative = date.relative();
          } else {
            $scope.dateRelative = null;
          }
          $scope.isFuture = date.minutesFromNow() > 1;
        }, true);
      }])
  .controller('SendLaterDatePickerDialogCtrl',
    ['$scope', '$modalInstance', '$controller',
      function($scope, $modalInstance, $controller) {
        $controller('BaseDatePickerDialogCtrl',
          {$scope: $scope,
            $modalInstance: $modalInstance});

        $scope.send = function() {
          $modalInstance.close($scope.date);
        };
      }])
  .controller('RemindDatePickerDialogCtrl',
    ['$scope', '$modalInstance', '$controller',
      function($scope, $modalInstance, $controller) {
        $controller('BaseDatePickerDialogCtrl',
          {$scope: $scope,
            $modalInstance: $modalInstance});

        $scope.remind = function() {
          $modalInstance.close($scope.date);
        };
      }])
  .directive('slBtn', function() {
    return {
      restrict: 'C',
      link: function postLink(scope, element) {
        // prevent text selection
        element.on('mousedown', function(ev) {
          ev.preventDefault();
        });
      }
    };
  })
  .filter('relDateOrder', function() {
    /**
     * Sorts relative time string by parsed date order.
     * TODO: modify relative time store and dropdown ctrl to parse only once.
     */
    return function(list) {
      var withDate = list.map(function(v) {
        return {str: v,
          date: Date.future(v)
        };
      });
      return _.sortBy(withDate, 'date').map(function(item) {
        return item.str;
      });
    };
  });

