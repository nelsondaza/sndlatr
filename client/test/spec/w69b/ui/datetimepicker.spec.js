describe('Directive: datetimetimepicker', function() {
  beforeEach(module('w69b.ui.datetimepicker',
    'views/timepicker.html', 'template/datetimepicker/datetimepicker.html',
    'template/datepicker/datepicker.html', 'template/datepicker/popup.html'));

  var element, scope, dateInput, timeInput;

  beforeEach(inject(function($rootScope, $compile) {
    scope = $rootScope.$new(true);
    scope.date = Date.future('tomorrow');
    scope.max = new Date('2024-01-01');
    element = angular.element('<div data-datetimepicker="date"></div>');
    element = $compile(element)(scope);
    scope.$digest();
    var inputEls = element.find('input');
    expect(inputEls.length).toEqual(2);
    dateInput = inputEls.eq(0);
    timeInput = inputEls.eq(1);
  }));

  it('should parse dates', function() {
    dateInput.val('2023-01-20').trigger('input');
    timeInput.val('9:00 am').trigger('input');
    timeInput.trigger({type: 'keydown', keyCode: 9});
    expect(scope.date.getDate()).toEqual(20);
    expect(scope.date.getHours()).toEqual(9);
  });
});

describe('Controller: DateTimePickerCtrl', function() {
  beforeEach(module('w69b.ui.datetimepicker'));
  var scope;

  beforeEach(inject(function($controller, $rootScope) {
    scope = $rootScope.$new(true);
    $controller('DateTimePickerCtrl',
      {$scope: scope});
    scope.$digest();
  }));

  it('should open date picker', inject(function($timeout) {
    expect(scope.datePickerOpen).toBe(false);
    $timeout.flush();
    expect(scope.datePickerOpen).toBe(true);
  }));

  it('should close date picker on tab', function() {
    scope.datePickerOpen = true;
    scope.checkTab({keyCode: 9});
    expect(scope.datePickerOpen).toBe(false);
  });
});
