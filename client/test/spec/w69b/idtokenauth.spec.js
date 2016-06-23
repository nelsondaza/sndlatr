describe('idtokenauth', function() {
  beforeEach(module('w69b.idtokenauth'));

  var idtokenauth, googleauth, $rootScope, fakeResult;
  beforeEach(inject(function(_idtokenauth_, _googleauth_, $q, _$rootScope_) {

    idtokenauth = _idtokenauth_;
    googleauth = _googleauth_;

    $rootScope = _$rootScope_;
    fakeResult = $q.when({id_token: 'test_token', 'expires_in': 600});
  }));

  it('checkauth should call authSilent', function() {
    var spy = spyOn(googleauth, 'authSilent').andReturn(fakeResult);
    idtokenauth.checkAuth();
    expect(spy).toHaveBeenCalledWith({response_type: 'id_token'});
    $rootScope.$digest();
    expect(idtokenauth.getIdToken()).toEqual('test_token');
  });

  it('authPopup should call authPopup', function() {
    var spy = spyOn(googleauth, 'authPopup').andReturn(fakeResult);
    idtokenauth.authPopup();
    expect(spy).toHaveBeenCalledWith({response_type: 'id_token'});
    $rootScope.$digest();
    expect(idtokenauth.getIdToken()).toEqual('test_token');
  });

  it('should reject when googleauth rejects', inject(function($q) {
    var deferred = $q.defer();
    spyOn(googleauth, 'authPopup').andReturn(deferred.promise);
    var rejectSpy = jasmine.createSpy();
    idtokenauth.authPopup().then(angular.noop, rejectSpy);
    deferred.reject();
    $rootScope.$digest();
    expect(rejectSpy).toHaveBeenCalled();
  }));
});

describe('httpIdTokenAuthInterceptor', function() {
  beforeEach(module('w69b.idtokenauth'));

  var authUrl = 'https://auth.example.com/api';
  beforeEach(module(function(httpIdTokenAuthInterceptorProvider,
                             $httpProvider) {
    httpIdTokenAuthInterceptorProvider.setBaseUrl(authUrl);
    $httpProvider.interceptors.push('httpIdTokenAuthInterceptor');
  }));

  var idtokenauth, $httpBackend, $http;

  function commonSetup() {
    inject(function(_idtokenauth_, _$httpBackend_, _$http_) {
      idtokenauth = _idtokenauth_;
      $httpBackend = _$httpBackend_;
      $http = _$http_;
    });
  }

  function hasTokenHeader(headers) {
    return headers['x-w69b-idtoken'] == 'test_token';
  }

  function doesNotHaveTokenHeader(headers) {
    return !headers.hasOwnProperty('x-w69b-idtoken');
  }


  function verifyHeaderPresent(url, present) {
    $httpBackend.expectGET(url,
      present ? hasTokenHeader : doesNotHaveTokenHeader).respond('');
    $http.get(url);
    $httpBackend.flush();
  }

  describe('with relative urls enabled', function() {
    beforeEach(module(function(httpIdTokenAuthInterceptorProvider) {
      httpIdTokenAuthInterceptorProvider.setEnableForRelativeUrls(true);
    }));
    beforeEach(commonSetup);

    describe('with id token', function() {
      beforeEach(function() {
        spyOn(idtokenauth, 'getIdToken').andReturn('test_token');
      });

      it('should add header for relative urls', function() {
        verifyHeaderPresent('/api/bla', true);
      });

      it('should add header for auth urls', function() {
        verifyHeaderPresent(authUrl + '/somepath', true);
      });

    });
  });

  describe('with relative urls disabled', function() {
    beforeEach(commonSetup);


    describe('with id token', function() {
      beforeEach(function() {
        spyOn(idtokenauth, 'getIdToken').andReturn('test_token');
      });


      it('should add header for auth urls', function() {
        verifyHeaderPresent(authUrl + '/somepath', true);
      });

      it('should not add header for non auth urls', function() {
        verifyHeaderPresent('http://example.com/somepath', false);
      });

      it('should not add header for relative urls', function() {
        verifyHeaderPresent('/api/bla', false);
      });
    });

    describe('without id token', function() {
      it('should not add header for auth urls', function() {
        verifyHeaderPresent(authUrl + '/somepath', false);
      });
    });
  });

});
