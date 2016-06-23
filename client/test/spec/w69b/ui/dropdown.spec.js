'use strict';

describe('Directive: dropdowncloser', function() {
  beforeEach(module('w69b.ui.dropdown'));

  var closerEl, scope, rootEl;

  beforeEach(inject(function($rootScope, $compile, $document) {
    scope = $rootScope.$new(true);
    scope.isShown = true;
    rootEl = angular.element('<div data-wb-dropdown-root>' +
      '<div data-dropdown-closer="isShown"></div></div>');
    rootEl = $compile(rootEl)(scope);
    closerEl = rootEl.children()[0];
    scope.$digest();
    $document.find('body').append(rootEl);
  }));

  afterEach(function() {
    rootEl.remove();
  });

  function clickOutside() {
    inject(function($document) {
      $document.click();
      scope.$digest();
    });
  }


  it('should close on click outside', function() {
    clickOutside();
    expect(scope.isShown).toEqual(false);
  });

  it('should not close on click inside', function() {
    closerEl.click();
    scope.$digest();
    expect(scope.isShown).toEqual(true);
  });

  it('should not close on click in root elem', function() {
    rootEl.click();
    scope.$digest();
    expect(scope.isShown).toEqual(true);
  });

  it('should close on location change', inject(function($location) {
    $location.path('/new');
    scope.$digest();
    expect(scope.isShown).toEqual(false);
  }));

});

describe('Directive: wbAbsPositioned', function() {
  beforeEach(module('w69b.ui.dropdown'));

  var elem, scope, body, childEl;

  beforeEach(inject(function($rootScope, $compile, $document) {
    body = $document.find('body');
    scope = $rootScope.$new(true);
    scope.isShown = true;
    elem = angular.element('<div data-wb-abs-positioned ' +
      'style="position: fixed; left: 100px; top: 50px;"> ' +
      '<span>testChild</span></div>');
    body.append(elem);
    childEl = elem.children();
    elem = $compile(elem)(scope);
    scope.$digest();
  }));

  afterEach(function() {
    elem.remove();
  });

  it('should remove child from body on destroy', function() {
    // scope.$destroy();
    elem.remove();
    expect(body[0].contains(childEl[0])).toBeFalsy();
  });

  it('should append testChild to body', function() {
    expect(childEl.parent()[0]).toBe(body[0]);
  });

  it('should position child absolutely', function() {
    expect(childEl.css('position')).toEqual('absolute');
    expect(childEl.css('top')).toEqual('50px');
    expect(childEl.css('left')).toEqual('100px');
  });

  it('should update position on resize', inject(function($window) {
    elem.css('top', '20px');
    elem.css('left', '40px');
    expect(childEl.css('top')).toEqual('50px');
    angular.element($window).triggerHandler('resize');
    expect(childEl.css('top')).toEqual('20px');
    expect(childEl.css('left')).toEqual('40px');
    }));

});
