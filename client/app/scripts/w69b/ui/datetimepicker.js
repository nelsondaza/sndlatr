'use strict';

angular.module('w69b.ui.datetimepicker',
    ['ui.bootstrap', 'w69b.ui.timepicker'])
  .directive('datetimepicker', function() {
    return {
      templateUrl: 'template/datetimepicker/datetimepicker.html',
      restrict: 'EA',
      scope: {
        date: '=datetimepicker',
        min: '=?',
        max: '=?'
      },
      controller: 'DateTimePickerCtrl'
    };
  })
  .controller('DateTimePickerCtrl',
    ['$scope', '$timeout',
      function($scope, $timeout) {
        if (!$scope.date) {
          $scope.date = Date.future('9 am');
        }
        if (!$scope.min)
          $scope.min = new Date();
        if (!$scope.max)
          $scope.max = new Date().advance({ year: 5 }).endOfYear();

        $scope.datePickerOpen = false;

        $timeout(function() {
          $scope.datePickerOpen = true;
        });

        $scope.checkTab = function($event) {
          if ($event.keyCode == 9)
            $scope.datePickerOpen = false;
        };
      }]);
