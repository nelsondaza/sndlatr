'use strict';

describe('Directive: wbLoopFocus', function() {
  beforeEach(module('w69b.ui.focus'));

  var element, scope;

  var outsideEl, $timeout;

  function compileTemplate(html) {
    inject(function($compile) {
      element = angular.element(
        '<div data-wb-loop-focus>' + html +
          '<div class="last" tabindex="0"></div></div>');
      element = $compile(element)(scope);
      scope.$digest();
      document.body.appendChild(element[0]);
    });
  }

  beforeEach(inject(function($rootScope, _$timeout_) {
    $timeout = _$timeout_;
    scope = $rootScope.$new(true);
    outsideEl = angular.element('<input name="outside"/>');
    document.body.appendChild(outsideEl[0]);
  }));

  afterEach(function() {
    $timeout.verifyNoPendingTasks();
    document.body.removeChild(element[0]);
    document.body.removeChild(outsideEl[0]);
  });

  function verifyReceivesFocus(inputEl) {
    outsideEl[0].focus();
    // FF does not fire focus on manual focus.
    outsideEl[0].dispatchEvent(new Event('focus'));
    $timeout.flush();
    expect(document.activeElement).toBe(inputEl[0]);
  }

  describe('when focus goes outside', function() {
    it('should focus first input element', function() {
      compileTemplate('<input />');
      var inputEl = element.find('input').eq(0);
      verifyReceivesFocus(inputEl);
    });

    it('should focus first button element', function() {
      compileTemplate('<button></button>');
      verifyReceivesFocus(element.find('button').eq(0));
    });

    it('should focus first textare element', function() {
      compileTemplate('<textarea></textare>');
      verifyReceivesFocus(element.find('textarea').eq(0));
    });

    it('should focus tabindex element', function() {
      compileTemplate('<div tabindex="0"></div>');
      verifyReceivesFocus(element.find('div').eq(0));
    });

    it('should not focus non-focusable input element', function() {
      compileTemplate('<input tabindex="-1" />');
      verifyReceivesFocus(element.find('.last').eq(0));
    });
  });
});
