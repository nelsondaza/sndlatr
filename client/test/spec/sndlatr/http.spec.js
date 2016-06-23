describe('sndlatr.http', function() {
  beforeEach(module('sndlatr.http'));

  var $http, $httpBackend;
  beforeEach(module(function(httpBaseInterceptorProvider, $httpProvider) {
    httpBaseInterceptorProvider.setBaseUrl('http://example.com/api');
    $httpProvider.interceptors.push('httpBaseInterceptor');
  }));

  describe('with condition RegExp', function() {
    beforeEach(module(function(httpBaseInterceptorProvider) {
      httpBaseInterceptorProvider.setCondition(/^\/special_/);
    }));

    it('should use absolute url for http requests',
      inject(function($http, $httpBackend) {
        $httpBackend.expectGET('http://example.com/api/special_X').respond('');
        $http.get('/special_X');
        $httpBackend.flush();
      }));

    it('should not touch other urls',
      inject(function($http, $httpBackend) {
        $httpBackend.expectGET('/other').respond('');
        $http.get('/other');
        $httpBackend.flush();
      }));
  });

  describe('without condition', function() {

    it('should use absolute url for http requests',
      inject(function($http, $httpBackend) {
        $httpBackend.expectGET('http://example.com/api/some').respond('');
        $http.get('/some');
        $httpBackend.flush();
      }));

    it('should not touch absolute urls',
      inject(function($http, $httpBackend) {
        var url = 'http://bla.example.com/xx';
        $httpBackend.expectGET(url).respond('');
        $http.get(url);
        $httpBackend.flush();
      }));
  });
});


describe('Service: httpErrorInterceptor', function() {
  var numRetries = 3;

  // load the service's module
  beforeEach(module('sndlatr.http'));

  beforeEach(module(function($httpProvider, httpErrorInterceptorProvider) {
    $httpProvider.interceptors.push('httpErrorInterceptor');
    httpErrorInterceptorProvider.setMaxRetries(numRetries);
  }));

  // instantiate service
  var httpInterceptor, $httpBackend, $http, $rootScope;
  beforeEach(inject(function(_httpErrorInterceptor_, _$httpBackend_, _$http_,
                             _$rootScope_) {
    httpInterceptor = _httpErrorInterceptor_;
    $httpBackend = _$httpBackend_;
    $http = _$http_;
    $rootScope = _$rootScope_;
  }));

  afterEach(function() {
    $httpBackend.verifyNoOutstandingExpectation();
    $httpBackend.verifyNoOutstandingRequest();
    // $timeout.verifyNoPendingTasks();
  });

  describe('403 handling', function() {
    var authSpy, $q, successSpy, errorSpy;
    beforeEach(inject(function(idtokenauth, _$q_) {
      authSpy = spyOn(idtokenauth, 'checkAuth');
      successSpy = jasmine.createSpy('success spy');
      errorSpy = jasmine.createSpy('errors spy');
      $q = _$q_;
    }));

    it('should refresh id token for not_logged_in', function() {
      authSpy.andReturn($q.when());
      $httpBackend.expectGET('/noauth').respond(403, 'not_logged_in');
      $httpBackend.expectGET('/noauth').respond(200, 'success');
      $http.get('/noauth').success(successSpy);
      $httpBackend.flush();
      expect(authSpy).toHaveBeenCalled();
      expect(successSpy).toHaveBeenCalled();
      expect(successSpy.mostRecentCall.args[0]).toEqual('success');
    });

    it('it should not refresh auth repeatetly', function() {
      authSpy.andReturn($q.when());
      $httpBackend.expectGET('/noauth').respond(403, 'not_logged_in');
      $httpBackend.expectGET('/noauth').respond(403, 'not_logged_in');
      $httpBackend.expectGET('/noauth').respond(403, 'not_logged_in');
      $http.get('/noauth')
        .error(errorSpy);
      $httpBackend.flush();
      expect(authSpy).toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalled();
    });

    it('should fail instantly if body is not not_logged_in', function() {
      $httpBackend.expectGET('/noauth').respond(403, 'someerror');
      $http.get('/noauth').error(errorSpy);
      $httpBackend.flush();
      expect(errorSpy).toHaveBeenCalled();
    });
  });

  describe('server errors', function() {
    var retrySpy, unListenRetry, errorSpy, unListenError;

    beforeEach(function() {
      retrySpy = jasmine.createSpy('retry spy');
      unListenRetry = $rootScope.$on('http:retryScheduled', retrySpy);
      errorSpy = jasmine.createSpy('error spy');
      unListenError = $rootScope.$on('http:error', errorSpy);
      $httpBackend.whenGET('/500').respond(500, {});
    });

    afterEach(function() {
      unListenRetry();
      unListenError();
    });

    it('should retry and give up', inject(function($timeout) {
      var rejectSpy = jasmine.createSpy('recjectSpy');
      $http.get('/500').error(rejectSpy);
      expect(retrySpy).not.toHaveBeenCalled();
      $httpBackend.flush(1);
      for (var i = 0; i < numRetries; ++i) {
        expect(retrySpy.callCount).toEqual(i + 1);
        $timeout.flush();
        $httpBackend.flush(1);
      }
      expect(errorSpy).toHaveBeenCalled();
      expect(errorSpy.mostRecentCall.args[1]).toEqual('server');
      expect(rejectSpy).toHaveBeenCalled();
    }));

    it('should retry an succeed', inject(function($timeout) {
      var successSpy = jasmine.createSpy('success spy');
      $http.get('/500').success(successSpy);
      $httpBackend.flush();
      expect(retrySpy).toHaveBeenCalled();
      retrySpy.reset();

      $httpBackend.resetExpectations();
      $httpBackend.expectGET('/500').respond(200, {});
      $timeout.flush();
      $httpBackend.flush();
      expect(successSpy).toHaveBeenCalled();
      expect(retrySpy).not.toHaveBeenCalled();
    }));
  });

  it('should broadcast event on other errors', function() {
    var errorSpy = jasmine.createSpy();
    var rejectSpy = jasmine.createSpy();
    var unListenError = $rootScope.$on('http:error', errorSpy);
    $httpBackend.expectGET('/400').respond(400, {});
    $http.get('/400').error(rejectSpy);
    $httpBackend.flush();
    expect(errorSpy).toHaveBeenCalled();
    expect(rejectSpy).toHaveBeenCalled();
    unListenError();
  });


});
