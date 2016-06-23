describe('scheduler', function() {
  beforeEach(module('sndlatr.initialize'));

  var $httpBackend, $rootScope, authflow;

  beforeEach(inject(function(googleauth, _authflow_, _$httpBackend_,
                             _$rootScope_) {
    authflow = _authflow_;
    spyOn(authflow, 'start');
    spyOn(authflow, 'openDialog');
    $httpBackend = _$httpBackend_;
    $rootScope = _$rootScope_;
    expect($rootScope.isInitialized).toBeFalsy();
  }));

  afterEach(function() {
    $httpBackend.verifyNoOutstandingExpectation();
    $httpBackend.verifyNoOutstandingRequest();
  });

  it('should start auth flow', inject(function(authflow) {
    // expect(authflow.start).toHaveBeenCalled();
  }));

  it('should get code from google if requested',
    inject(function($q, SendJob, RemindJob, Snippet) {
      // authSpy.andReturn($q.when({code: 'testcode'}));
      $httpBackend.expectGET('/api/init').respond({auth: 'need_code'});
      // $httpBackend.expectPOST('/api/init', {code: 'testcode'}).respond();
      // $httpBackend.expectGET('/api/init').respond({sendJobs: ['job']});
      $rootScope.$broadcast('authcomplete');
      $httpBackend.flush();
      expect(authflow.openDialog).toHaveBeenCalled();
      expect($rootScope.isInitialized).toBeFalsy();

      var sendJobSpy = spyOn(SendJob, 'loadData');
      var remindJobSpy = spyOn(RemindJob, 'loadData');
      var snippetJobSpy = spyOn(Snippet, 'loadData');
      $rootScope.$broadcast('authcomplete');
      $httpBackend.expectGET('/api/init').respond({sendJobs: ['job'
      ], remindJobs: ['remindJob'], snippets: ['snippet']});
      $httpBackend.flush();
      expect(sendJobSpy).toHaveBeenCalledWith(['job']);
      expect(remindJobSpy).toHaveBeenCalledWith(['remindJob']);
      expect(snippetJobSpy).toHaveBeenCalledWith(['snippet']);
      expect($rootScope.isInitialized).toBe(true);
    }));

});


