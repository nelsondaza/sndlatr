'use strict';

describe('Directive: relativeTimesMenu', function() {
  beforeEach(module('sndlatr.ui', 'views/humanDateInput.html',
    'views/relativeTimesMenu.html'));

  var element, scope;

  beforeEach(inject(function($rootScope, $compile) {
    scope = $rootScope.$new(true);
    scope.selected = jasmine.createSpy();
    element = angular.element('<ul data-relative-times-menu ' +
      'data-date="testDate" ' +
      'data-on-select="selected(date)"' +
      '></ul>');
    element = $compile(element)(scope);
    scope.$digest();
  }));

  /**
   * Enter date in input field of dropdown and submit.
   */
  function inputDate(str) {
    element.find('button').click();
    element.find('input').val(str).trigger('input');
    element.find('form').triggerHandler('submit');
  }

  it('should call onSelect on submit', function() {
    inputDate('2020-01-03');
    expect(scope.selected).toHaveBeenCalledWith(new Date.create('2020-01-03'));
    expect(scope.selected.callCount).toBe(1);
  });
});

describe('Directive: sendlaterdropdown', function() {
  beforeEach(module('sndlatr.ui', 'views/sendLaterDropdown.html',
    'views/humanDateInput.html', 'views/relativeTimesMenu.html'));

  var element, scope;

  beforeEach(inject(function($rootScope, $compile) {
    scope = $rootScope.$new(true);
    scope.selected = angular.noop;
    element = angular.element('<div data-send-later-dropdown="testDate"' +
      'data-on-select="selected(date)"' +
      '></div>');
    element = $compile(element)(scope);
    scope.$digest();
  }));

  /**
   * Enter date in input field of dropdown and submit.
   */
  function enterDate(str) {
    element.find('button').click();
    element.find('input').val(str).trigger('input');
    element.find('form').triggerHandler('submit');
  }

  it('should call onSelect on change', function() {
    scope.selected = jasmine.createSpy();
    enterDate('2020-01-02');
    expect(scope.selected).toHaveBeenCalledWith(new Date.create('2020-01-02'));
    expect(scope.selected.callCount).toBe(1);
  });
});

describe('Directive: remindlaterdropdown', function() {
  beforeEach(module('sndlatr.ui', 'views/remindDropdown.html',
    'views/humanDateInput.html', 'views/relativeTimesMenu.html'));

  var element, scope, absEl;

  beforeEach(inject(function($rootScope, $compile, $document) {
    scope = $rootScope.$new(true);
    scope.testJob = {};
    element = angular.element('<div data-remind-dropdown="testJob"></div>');
    element = $compile(element)(scope);
    scope.$digest();
    absEl = $document.find('.slRemindDropdown.wbAbs');
  }));

  /**
   * Enter date in input field of dropdown and submit.
   */
  function enterDate(str) {
    absEl.find('button').click();
    absEl.find('input').val(str).trigger('input');
    absEl.find('form').triggerHandler('submit');
  }

  it('it should change job.scheduledAt date', function() {
    enterDate('2020-01-02');
    expect(scope.testJob.scheduledAt).toEqual(new Date.create('2020-01-02'));
  });
});

describe('Directive: humanDateInput', function() {
  beforeEach(module('sndlatr.ui', 'views/humanDateInput.html'));

  var element, scope, invalidEl;

  beforeEach(inject(function($rootScope, $compile) {
    scope = $rootScope.$new(true);
    scope.selected = angular.noop;
    element = angular.element('<div data-human-date-input="testDate"' +
      'data-on-select="selected(date)"' +
      'data-date-human="testDateHuman"' +
      '></div>');
    element = $compile(element)(scope);
    scope.$digest();
    invalidEl = element.find('.invalid');
    expect(invalidEl.length).toEqual(1);
    expect(invalidEl).toBeHidden();
  }));

  /**
   * Enter date in input field of dropdown and submit.
   */
  function inputDate(str) {
    element.find('button').click();
    element.find('input').val(str).trigger('input');
  }

  function pressEnter() {
    element.find('form').triggerHandler('submit');
  }


  it('should change date on dropdown input', function() {
    inputDate('2020-01-02');
    expect(scope.testDate).toEqual(new Date.create('2020-01-02'));
    expect(scope.testDateHuman).toEqual('2020-01-02');
  });

  it('should show notice on invalid dates after timeout',
    inject(function($timeout) {
      inputDate('foobar');
      expect(scope.testDate).toEqual(null);
      expect(invalidEl).toBeHidden();
      $timeout.flush();
      expect(invalidEl).toBeDisplayed();
    }));

  it('should call onSelect on change', function() {
    scope.selected = jasmine.createSpy();
    inputDate('2020-01-02');
    pressEnter();
    expect(scope.selected).toHaveBeenCalledWith(new Date.create('2020-01-02'));
    expect(scope.selected.callCount).toBe(1);
  });
});

describe('Controller: HumanDateInputCtrl', function() {
  beforeEach(module('sndlatr.ui'));

  var scope, $timeout, $modal;

  beforeEach(inject(function($controller, $rootScope, _$timeout_, _$modal_) {
    scope = $rootScope.$new(true);
    $modal = _$modal_;
    $controller('HumanDateInputCtrl', {$scope: scope});
    scope.$digest();
    $timeout = _$timeout_;
  }));

  afterEach(function() {
    scope.$destroy();
    $timeout.verifyNoPendingTasks();
  });

  it('should parse dateHuman', function() {
    expect(scope.date).toBeFalsy();
    scope.dateHuman = 'tomorrow';
    scope.$digest();
    expect(scope.date).toBeTruthy();
  });

  it('should set humanCooledDown 500ms after typing', function() {
    expect(scope.humanCooledDown).toBe(true);
    scope.dateHuman = 'to';
    scope.$digest();
    expect(scope.humanCooledDown).toBe(false);
    $timeout.flush(499);
    expect(scope.humanCooledDown).toBe(false);
    $timeout.flush(1);
    expect(scope.humanCooledDown).toBe(true);

  });

  it('should reset humanCooledDown timer when tying continues within 500ms',
    function() {
      scope.dateHuman = 'tomo';
      scope.$digest();
      $timeout.flush(499);
      expect(scope.humanCooledDown).toBe(false);
      scope.dateHuman = 'tomorr';
      scope.$digest();
      $timeout.flush(499);
      expect(scope.humanCooledDown).toBe(false);
      $timeout.flush(1);
      expect(scope.humanCooledDown).toBe(true);
    });

  it('should call onSelect on RETURN', function() {
    scope.dateHuman = 'tomorrow';
    scope.$digest();
    scope.onSelect = jasmine.createSpy('onSelect');
    scope.onReturn();
    expect(scope.onSelect).toHaveBeenCalledWith({date: scope.date});
    expect(scope.humanCooledDown).toBe(true);
    // expect(scope.dateHuman).toBe('');
  });

  it('shoud not call onSelect on RETURN if no date was entered', function() {
    scope.onSelect = jasmine.createSpy('onSelect');
    scope.onReturn();
    expect(scope.onSelect).not.toHaveBeenCalled();
  });
});

describe('Controller: RelativeTimesMenuCtrl', function() {
  beforeEach(module('sndlatr.ui'));

  var scope, $timeout, $modal;

  beforeEach(inject(function($controller, $rootScope, _$timeout_, _$modal_) {
    scope = $rootScope.$new(true);
    $modal = _$modal_;
    $controller('RelativeTimesMenuCtrl', {$scope: scope});
    scope.$digest();
    $timeout = _$timeout_;
  }));

  it('should initialize relative times', function() {
    expect(scope.relativeTimes.length).toEqual(5);
  });

  describe('adding to relativeStorage', function() {
    var addSpy;
    beforeEach(inject(function(relativeTimesStore) {
      addSpy = spyOn(relativeTimesStore, 'add');
    }));

    it('select should add', function() {
      scope.dateHuman = 'text';
      scope.select('tomorrow');
      expect(addSpy).toHaveBeenCalledWith('tomorrow');
      expect(scope.dateHuman).toEqual('');
    });
  });
  it('should start timer to remove invalid relativeTime', function() {
    var past = Date.create('yesterday');
    scope.relativeTimes.push(past);
    $timeout.flush();
    expect(scope.relativeTimes).not.toContain(past);
    scope.$destroy();
    $timeout.verifyNoPendingTasks();
  });

});

describe('Controller: SnippetsDropdownCtrl', function() {
  beforeEach(module('sndlatr.ui'));

  var scope, $timeout, $modal;

  beforeEach(inject(function($controller, $rootScope, _$timeout_, _$modal_) {
    scope = $rootScope.$new(true);
    $modal = _$modal_;
    $controller('SnippetsDropdownCtrl', {$scope: scope});
    scope.$digest();
    $timeout = _$timeout_;
  }));

  it('should initialize keywords', function() {
    expect(scope.keywords).toEqual('');
  });

  it('should update filteredSnippets', inject(function(Snippet) {
    var spy = spyOn(Snippet, 'getByKeywords').andReturn(['snippet1']);
    scope.keywords = 'test';
    scope.$digest();
    expect(spy).toHaveBeenCalledWith('test');
    expect(scope.filteredSnippets).toEqual(['snippet1']);
  }));

  describe('dialog', function() {
    var deferred;
    beforeEach(inject(function($q) {
      deferred = $q.defer();
      spyOn($modal, 'open').andReturn({result: deferred.promise});
    }));

    it('should open dialog', function() {
      scope.editSnippets();
      expect($modal.open).toHaveBeenCalledWith(jasmine.objectContaining(
        {templateUrl: 'views/dialogs/editSnippetsDialog.html',
          controller: 'CloseableDialogCtrl'}));
    });
  });
});

describe('Directive: editSnippetsList ', function() {
  beforeEach(module('sndlatr.ui', 'views/editSnippetsList.html',
    'views/snippetEditor.html', 'sl.test.scheduler'));

  var element, scope, liEls, snippets, editViewEl, listViewEl;

  beforeEach(inject(function($rootScope, $compile, Snippet) {
    snippets = [new Snippet({name: 'snippet1'}),
      new Snippet({subject: 'subject2', body: 'body2'})
    ];
    snippets.forEach(function(snippet) {
      snippet.put()
    });
    scope = $rootScope.$new(true);
    element = angular.element('<div data-edit-snippets-list '+
      'data-edit="snippetToEdit"></div>');
    element = $compile(element)(scope);
    scope.$digest();
    liEls = element.find('ul.slSnippetsList li');
    editViewEl = element.find('.slEditSnippetsView.edit');
    listViewEl = element.find('.slEditSnippetsView.list');
  }));

  it('should edit when snippetToEdit changes', function() {
    scope.snippetToEdit = snippets[0];
    scope.$digest();
    expect(editViewEl).toBeDisplayed();
  });

  it('should show list', function() {
    expect(listViewEl).toBeDisplayed();
    expect(editViewEl).toBeHidden();
    expect(liEls.length).toEqual(2);
    expect(liEls.eq(0).text()).toContain('snippet1');
    expect(liEls.eq(1).text()).toContain('subject2');
    expect(liEls.eq(1).text()).toContain('body2');
  });

  describe('edit', function() {
    var currentSnippetNameEl;
    beforeEach(function() {
      liEls.eq(0).find('a').click();
      currentSnippetNameEl = element.find('.slEditHeaderContainer input')
    });

    it('should show edit on snippet click', function() {
      expect(editViewEl).toBeDisplayed();
      expect(currentSnippetNameEl.val()).toBe('snippet1');
    });

    it('should update snippet name', function() {
      currentSnippetNameEl.inputText('newname');
      expect(snippets[0].name).toEqual('newname');
      // currentSnippetNameEl
    });

    it('should udpate snippet body', function() {
      editViewEl.find('textarea').inputText('newbody');
      expect(snippets[0].body).toEqual('newbody');
    });

    it('should go back to list', function() {
      editViewEl.find('.slHeading button').click();
      expect(listViewEl).toBeDisplayed();
    });
  });

  it('should delete snippet', inject(function(Snippet) {
    liEls.eq(0).find('button').click();
    expect(Snippet.getCount()).toBe(1);
    expect(element.find('ul li').length).toBe(1);
  }));
});

describe('EditSnippetsListCtrl', function() {
  beforeEach(module('sndlatr.ui', 'sl.test.scheduler'));

  var scope;

  beforeEach(inject(function($controller, $rootScope, Snippet) {
    var snippet = new Snippet({name: 'test'});
    snippet.put();
    scope = $rootScope.$new(true);
    $controller('EditSnippetsListCtrl', {$scope: scope});
    scope.$digest();
  }));

  it('should load all snippets', function() {
    expect(scope.snippets.length).toEqual(1);
  });

  it('should show list view', function() {
    expect(scope.view).toEqual('list');
    expect(scope.currentSnippet).toBeNull();
  });

  it('should edit new snippet', inject(function(Snippet) {
    scope.edit = jasmine.createSpy();
    scope.newSnippet();
    expect(scope.edit).toHaveBeenCalledWith(jasmine.any(Snippet));
  }));
});

describe('SnippetEditorCtrl', function() {
  beforeEach(module('sndlatr.ui', 'sl.test.scheduler'));

  var scope, $timeout;

  beforeEach(inject(function($controller, $rootScope, _$timeout_, Snippet) {
    scope = $rootScope.$new(true);
    scope.snippet = new Snippet();
    $controller('SnippetEditorCtrl', {$scope: scope});
    scope.$digest();
    $timeout = _$timeout_;
    spyOn(scope.snippet, 'put').andCallThrough();
  }));

  afterEach(function() {
    $timeout.verifyNoPendingTasks();
  });

  it('should save snippet on change', function() {
    scope.snippet.name = 'test';
    scope.$digest();
    expect(scope.dirty).toBe(true);
    $timeout.flush();
    expect(scope.snippet.put).toHaveBeenCalled();
    expect(scope.dirty).toBe(false);
  });

  it('should not save on non-relevant changes', function() {
    scope.snippet.id = 'hihi';
    scope.$digest();
    expect(scope.snippet.put).not.toHaveBeenCalled();
  });

  it('should flush auto saver on destroy', function() {
    scope.snippet.subject = 'testsub';
    scope.$digest();
    scope.$destroy();
    expect(scope.snippet.put).toHaveBeenCalled();
  });

});

describe('Controller: SendLaterDropdownCtrl', function() {
  beforeEach(module('sndlatr.ui'));

  var scope, $timeout, $modal;

  beforeEach(inject(function($controller, $rootScope, _$timeout_, _$modal_) {
    scope = $rootScope.$new(true);
    $modal = _$modal_;
    $controller('SendLaterDropdownCtrl', {$scope: scope});
    scope.$digest();
    $timeout = _$timeout_;
  }));

  it('should close dropdown on select', function() {
    scope.dropdownShown = true;
    scope.selectDate(new Date());
    expect(scope.dropdownShown).toBe(false);
  });

  describe('date picker', function() {
    var deferred;

    function openDialog() {
      scope.pickDate();
      expect($modal.open).toHaveBeenCalledWith(jasmine.objectContaining(
        {templateUrl: 'views/sendLaterDatePickerDialog.html',
          controller: 'SendLaterDatePickerDialogCtrl'}));
    }

    beforeEach(inject(function($q) {
      deferred = $q.defer();
      spyOn($modal, 'open').andReturn({result: deferred.promise});
      scope.dropdownShown = true;
    }));

    it('should hide dropdown', function() {
      openDialog();
      expect(scope.dropdownShown).toBe(false);
    });

    function getDialogScope() {
      return $modal.open.mostRecentCall.args[0].scope;
    }

    it('should copy selected date to dialog', function() {
      scope.selectedDate = Date.create('tomorrow');
      openDialog();
      var dialogScope = getDialogScope();
      expect(dialogScope.date).toEqual(scope.selectedDate);
      expect(dialogScope.date).not.toBe(scope.selectedDate);
    });

    it('should input date to dialog', function() {
      scope.date = Date.create().advance({days: 2});
      openDialog();
      var dialogScope = getDialogScope();
      expect(dialogScope.date.toString()).toEqual(scope.date.toString());
      expect(dialogScope.date).not.toBe(scope.date);
    });

    it('should set selected date from result', function() {
      openDialog();
      var date = Date.create().advance({years: 1});
      deferred.resolve(date);
      scope.$digest();
      expect(scope.selectedDate).toEqual(date);
    });

    it('should not update selected date when cancelled', function() {
      var date = Date.create();
      scope.selectedDate = date;
      openDialog();
      deferred.resolve();
      scope.$digest();
      expect(scope.selectedDate).toBe(date);
    });
  });
});

describe('Controllers: *DatePickerDialogCtrl', function() {
  beforeEach(module('sndlatr.ui'));

  var scope, modalSpy, $controller;

  beforeEach(inject(function(_$controller_, $rootScope) {
    $controller = _$controller_;
    scope = $rootScope.$new(true);
    modalSpy = jasmine.createSpyObj('modal', ['close']);
    scope.date = Date.create().addDays(1);
  }));

  function addCommonTests() {
    it('cancel should close dialog', function() {
      scope.cancel();
      expect(modalSpy.close).toHaveBeenCalledWith();
    });


    it('should update isFuture', function() {
      expect(scope.isFuture).toBe(true);
      scope.date = Date.create();
      scope.$digest();
      expect(scope.isFuture).toBe(false);
      scope.date = Date.create().addMinutes(5);
      scope.$digest();
      expect(scope.isFuture).toBe(true);
    });

    it('should show relative for a week', function() {
      expect(scope.dateRelative).toBeTruthy();
      scope.date = Date.create().addDays(10);
      scope.$digest();
      expect(scope.dateRelative).toBeFalsy();
    });
  }

  describe('Base', function() {
    beforeEach(function() {
      $controller('BaseDatePickerDialogCtrl',
        {$modalInstance: modalSpy,
          $scope: scope});
      scope.$digest();
    });
    addCommonTests();
  });

  describe('SendLater', function() {
    beforeEach(function() {
      $controller('SendLaterDatePickerDialogCtrl',
        {$modalInstance: modalSpy,
          $scope: scope});
      scope.$digest();
    });
    addCommonTests();

    it('send should close dialog with result', function() {
      scope.send();
      expect(modalSpy.close).toHaveBeenCalledWith(scope.date);
    });
  });

  describe('Remind', function() {
    beforeEach(function() {
      $controller('RemindDatePickerDialogCtrl',
        {$modalInstance: modalSpy,
          $scope: scope});
      scope.$digest();
    });
    addCommonTests();
  });
});

describe('filter: relDateOrder', function() {
  beforeEach(module('sndlatr.ui'));
  var filter;

  beforeEach(inject(function($filter) {
    filter = $filter('relDateOrder');
  }));


  it('should order by date', function() {
    var result = filter(['in 2 days', 'tomorrow', 'in 3 days']);
    expect(result).toEqual(['tomorrow', 'in 2 days', 'in 3 days']);
  });
});


describe('Directive: input[type=checkbox]', function() {
  beforeEach(module('sndlatr.ui'));

  var element, scope;

  function compile(html) {
    inject(function($rootScope, $compile) {
      scope = $rootScope.$new(true);
      element = angular.element(html);
      element = $compile(element)(scope);
      scope.$digest();
    });
  }

  it('should add sibling to checkbox', function() {
    compile('<div><input type="checkbox"></div>');
    var sibling = element.find('.slCheckboxSibling');
    expect(sibling.length).toBe(1);
  });

  it('should not add sibling other inputs', function() {
    compile('<div><input type="text"></div>');
    var sibling = element.find('.slCheckboxSibling');
    expect(sibling.length).toBe(0);
  });
});
