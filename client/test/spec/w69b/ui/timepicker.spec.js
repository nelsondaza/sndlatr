describe('Directive: timepicker', function() {
  beforeEach(module('sndlatr.ui', 'views/timepicker.html'));

  var element, scope;


  describe('with given date', function() {

    var inputEl;

    beforeEach(inject(function($rootScope, $compile) {
      scope = $rootScope.$new(true);
      scope.time = new Date(2013, 0, 1, 12, 34);
      element = angular.element('<div data-timepicker="time"></div>');
      element = $compile(element)(scope);
      scope.$digest();
      inputEl = element.find('input').eq(0);
      expect(inputEl).toBeTruthy();
    }));

    it('should show given time', function() {
      expect(inputEl.val()).toEqual('12:34 PM')
    });

    it('should show dropdown on click', function() {
      expect(element).not.toHaveClass('open');
      inputEl.click();
      expect(element).toHaveClass('open');
    });

    it('should show dropdown on focus', function() {
      inputEl.triggerHandler('focus');
      expect(element).toHaveClass('open');
    });

    function getTimeStr() {
      var str = null;
      inject(function($filter) {
        str = $filter('date')(scope.time, 'HH:mm:ss');
      });
      return str;
    }

    it('should update time on dropdown click', function() {
      var li = element.find('li:contains("10:30 AM")');
      expect(li.length).toBe(1);
      li.click();
      scope.$digest();
      expect(getTimeStr()).toEqual('10:30:00');
      expect(scope.time.toDateString()).toEqual('Tue Jan 01 2013');
      expect(inputEl.val()).toEqual('10:30 AM');
    });


    function verifyInputAndBlur(str, expected) {
      inputEl.val(str).trigger('input');
      inputEl.trigger({type: 'keydown', keyCode: 9});
      scope.$digest();
      expect(getTimeStr()).toEqual(expected);
      expect(scope.time.toDateString()).toEqual('Tue Jan 01 2013');
    }

    it('should parse time from input on blur', function() {
      verifyInputAndBlur('12:30 am', '00:30:00');
      verifyInputAndBlur('12:30', '12:30:00');
      verifyInputAndBlur('12', '12:00:00');
      verifyInputAndBlur('18', '18:00:00');
      verifyInputAndBlur('dfdf', '18:00:00');
      verifyInputAndBlur('13:00:00', '13:00:00');
      verifyInputAndBlur('3pm', '15:00:00');
      verifyInputAndBlur('3 pm', '15:00:00');
      verifyInputAndBlur('3 Pm', '15:00:00');
      verifyInputAndBlur('3 am', '03:00:00');
      verifyInputAndBlur('3 AM', '03:00:00');
      verifyInputAndBlur('3', '03:00:00');
      verifyInputAndBlur('24', '00:00:00');
    });

  });
});
