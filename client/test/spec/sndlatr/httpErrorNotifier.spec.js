'use strict';

describe('Service: httpErrorNotifier', function() {
  var statusbar;
  var httpErrorNotifier;
  var $rootScope;
  var $timeout;

  // load the service's module
  beforeEach(module('sndlatr.errornotify'));

  beforeEach(module(function($provide) {
    statusbar = jasmine.createSpyObj('gmailNotify',
      ['message', 'error']);
    $provide.value('gmailNotify', statusbar);
  }));
  beforeEach(inject(function(_httpErrorNotifier_, _$rootScope_, _$timeout_) {
    httpErrorNotifier = _httpErrorNotifier_;
    $rootScope = _$rootScope_;
    $timeout = _$timeout_;
  }));

  describe('retry message', function() {
    beforeEach(function() {
    });

    function verifyMessage(msg) {
      expect(statusbar.message).toHaveBeenCalled();
      expect(statusbar.message.mostRecentCall.args[0])
        .toContain(msg);
      statusbar.message.reset();
    }

    it('should not show message for small delays', function() {
      $rootScope.$broadcast('http:retryScheduled', {}, 1000);
      expect(statusbar.message).not.toHaveBeenCalled();
    });


    it('message should count down', function() {
      $rootScope.$broadcast('http:retryScheduled', {}, 3210);
      // $rootScope.$digest();
      verifyMessage('3 s');
      $timeout.flush();
      verifyMessage('2 s');
      $timeout.flush();
      verifyMessage('1 s');
      $timeout.flush();
      verifyMessage('Retrying...');
    });

    function simulateError(type) {
      $rootScope.$broadcast('http:error', type,
        {config: {url: 'testurl'},
          status: 123});
    }

    it('error should cancel count down timer', function() {
      $rootScope.$broadcast('http:retryScheduled', {}, 3210);
      verifyMessage('3 seconds');
      simulateError('unknown');
      expect(statusbar.error).toHaveBeenCalled();
      $timeout.verifyNoPendingTasks();
    });

    it('should show message for 404 errors', function() {
      simulateError('auth');
      expect(statusbar.error).toHaveBeenCalled();
    });

    it('should show message for 403 errors', function() {
      simulateError('notfound');
      expect(statusbar.error).toHaveBeenCalled();
      // verifyMessage('not exist');
    });

    it('should show error for server errors', function() {
      simulateError('server');
      expect(statusbar.error).toHaveBeenCalled();
    });

    it('should not show erorrs if notifyErrors is false', function() {
      $rootScope.$broadcast('http:error', 'unknown',
        {config: { notifyErrors: false}});
      expect(statusbar.error).not.toHaveBeenCalled();
    });

    it('should not show retry messages if notifyErrors is false', function() {
      $rootScope.$broadcast('http:retryScheduled',
        { notifyErrors: false}, 4000);
      expect(statusbar.message).not.toHaveBeenCalled();
    });
  });
});
