'use strict';

describe('authflow', function() {
  beforeEach(module('sndlatr.authflow'));

  var checkSpy, authEventSpy, $rootScope, $modal, $q, authflow;
  var dialogSpy, dialogDeferred;
  beforeEach(inject(function(_$rootScope_, idtokenauth, googleauth, _$q_,
                             _$modal_, _authflow_) {
    authflow = _authflow_;
    $q = _$q_;
    $rootScope = _$rootScope_;
    $modal = _$modal_;
    checkSpy = spyOn(idtokenauth, 'checkAuth');
    authEventSpy = jasmine.createSpy('auth complete spy');
    $rootScope.$on('authcomplete', authEventSpy);
    spyOn(googleauth, 'loadClient').andReturn($q.when(true));

    dialogDeferred = $q.defer();
    dialogSpy = spyOn($modal, 'open').andReturn(
      {result: dialogDeferred.promise});
  }));


  function simulateUserDetected() {
    inject(function(gmailEvents) {
      var elem = angular.element('<span>test@example.com</span>');
      gmailEvents.$broadcast('gm:accountmail', elem[0]);
      gmailEvents.$digest();
    });
  }

  describe('extract mail from title', function() {
    var $timeout, $document;
    beforeEach(inject(function(_$timeout_, _$document_) {
      $timeout = _$timeout_;
      $document = _$document_;
      authflow.start();
    }));

    afterEach(function() {
      $timeout.verifyNoPendingTasks();
      $document[0].title = '';
    });

    it('should detect mail in title', function() {
      $document[0].title = 'hello wrong@x.org foo@x.org';
      $timeout.flush();
      expect(checkSpy).toHaveBeenCalledWith('foo@x.org');
    });

    it('poll again if there is no mail', function() {
      $document[0].title = 'hello nomail';
      $timeout.flush();
      $document[0].title = 'hello foo@x.org';
      $timeout.flush();
      expect(checkSpy).toHaveBeenCalledWith('foo@x.org');
    });
  });

  describe('without auth', function() {
    var $timeout;
    beforeEach(inject(function(_$timeout_) {
      $timeout = _$timeout_;
      authflow.start();
      checkSpy.andReturn($q.reject());
      simulateUserDetected();
      $timeout.flush();
    }));

    afterEach(function() {
      $timeout.verifyNoPendingTasks();
    });

    it('should call checkAuth', function() {
      expect(checkSpy).toHaveBeenCalledWith('test@example.com');
      expect(checkSpy.callCount).toEqual(1);
    });

    it('should open dialog and post result', inject(function($httpBackend) {
      expect(dialogSpy).toHaveBeenCalled();
      $httpBackend.expectPOST('/api/init', {code: 'mycode'}).respond();

      dialogDeferred.resolve('mycode');
      dialogSpy.reset();
      $httpBackend.flush();
      checkSpy.andReturn($q.reject());
      $timeout.flush();
      // should retry id toeken check
      expect(checkSpy.callCount).toEqual(2);
      checkSpy.andReturn($q.when());
      $timeout.flush();
      expect(checkSpy.callCount).toEqual(3);
      expect(authEventSpy).toHaveBeenCalled();
      $timeout.verifyNoPendingTasks();
      expect(dialogSpy).toHaveBeenCalledWith(
        {templateUrl: 'views/setupCompleteDialog.html',
          controller: 'CloseableDialogCtrl'
        });

    }));
  });


  describe('with auth', function() {
    beforeEach(function() {
      authflow.start();
      checkSpy.andReturn($q.when(true));
      simulateUserDetected();
    });

    it('should broadcast autcomplete event', function() {
      expect(authEventSpy).toHaveBeenCalled();
    });
  });

  describe('openDialog', function() {
    it('should open dialog', function() {
      authflow.openDialog();
      expect(dialogSpy).toHaveBeenCalled();
    });
  });
});

describe('WelcomeDialogCtrl', function() {
  beforeEach(module('sndlatr.authflow'));
  var scope;
  var modalSpy;
  beforeEach(inject(function($controller, $rootScope) {
    scope = $rootScope.$new(true);
    modalSpy = jasmine.createSpyObj('modalInstance', ['close']);
    $controller('WelcomeDialogCtrl', {$scope: scope,
      $modalInstance: modalSpy});
  }));

  it('should open googleauth popup for code', inject(function(googleauth, $q) {
    var spy = spyOn(googleauth, 'authPopup').andReturn(
      $q.when({code: 'tcode'}));
    scope.email = 'test@example.com';

    scope.grantAccess();
    expect(spy).toHaveBeenCalledWith({'login_hint': scope.email,
      response_type: 'code',
      access_type: 'offline',
      approval_prompt: 'force'});
    scope.$digest();
    expect(modalSpy.close).toHaveBeenCalledWith('tcode');
  }));

});
