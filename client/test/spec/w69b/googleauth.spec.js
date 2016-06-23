describe('googleauth', function() {
  beforeEach(module('w69b.googleauth'));

  var win;
  beforeEach(module(function(googleauthProvider, $provide) {
    googleauthProvider.setScope(['testscope1'])
      .setClientId('test_client_id')
      .setAutoLoad(true);
    win = {};
    $provide.value('$window', win);
  }));

  var auth, loaderSpy, gapiAuthSpy;

  beforeEach(inject(function(scriptloader, $q) {
    gapiAuthSpy = jasmine.createSpyObj('gapi.auth', ['authorize']);
    win.gapi = {auth: gapiAuthSpy};
    loaderSpy = spyOn(scriptloader, 'load').andReturn($q.when(true));
  }));

  beforeEach(inject(function(googleauth, $rootScope) {
    auth = googleauth;
    $rootScope.$digest();
    expect(auth.isAuthorized()).toBe(false);
  }));

  it('should autoload client', function() {
    expect(loaderSpy).toHaveBeenCalled();
  });

  it('authSilent should call gapi authorize', function() {
    auth.authSilent();
    expect(gapiAuthSpy.authorize).toHaveBeenCalledWith(
      {client_id: 'test_client_id',
        scope: ['testscope1'],
        immediate: true}, jasmine.any(Function));
  });

  it('should pass through additional config', function() {
    auth.authSilent({response_type: 'code'});
    expect(gapiAuthSpy.authorize).toHaveBeenCalledWith(
      {client_id: 'test_client_id',
        scope: ['testscope1'],
        response_type: 'code',
        immediate: true}, jasmine.any(Function));
  });


  it('authPopup should call gapi with params', function() {
    auth.authPopup();
    expect(gapiAuthSpy.authorize).toHaveBeenCalledWith(
      {client_id: 'test_client_id',
        scope: ['testscope1'],
        immediate: false}, jasmine.any(Function));
  });


  describe('auth result', function() {
    var callback, successSpy, rejectSpy, $rootScope;

    beforeEach(inject(function(_$rootScope_) {
      successSpy = jasmine.createSpy('success spy');
      rejectSpy = jasmine.createSpy('reject spy');
      auth.authPopup().then(successSpy, rejectSpy);
      expect(gapiAuthSpy.authorize).toHaveBeenCalled();
      callback = gapiAuthSpy.authorize.mostRecentCall.args[1];
      $rootScope = _$rootScope_;
    }));

    it('no result should cause reject', function() {
      callback(null);
      $rootScope.$digest();
      expect(rejectSpy).toHaveBeenCalled();
      expect(auth.isAuthorized()).toBe(false);
    });

    it('error in result should cause reject', function() {
      callback({error: 'testerror'});
      $rootScope.$digest();
      expect(rejectSpy).toHaveBeenCalledWith('testerror');
      expect(auth.isAuthorized()).toBe(false);
    });

  });

  describe('AutoRefresher', function() {
   it('should authSilent 60 sec before expire',
      inject(function($timeout, $rootScope) {
        expect(gapiAuthSpy.authorize).not.toHaveBeenCalled();
        var refresher = new auth.AutoRefresher({'expires_in': 120});
        var callbackSpy = jasmine.createSpy();
        refresher.setCallback(callbackSpy);
        $timeout.flush(60000);
        $rootScope.$digest();
        expect(gapiAuthSpy.authorize).toHaveBeenCalled();
        $timeout.verifyNoPendingTasks();

        // verify that callback is called when new result is ready.
        var fakeAuthSuccess = gapiAuthSpy.authorize.mostRecentCall.args[1];
        expect(callbackSpy).not.toHaveBeenCalled();
        var newResult = {expires_in: 123, more: true};
        fakeAuthSuccess(newResult);
        $rootScope.$digest();
        expect(callbackSpy).toHaveBeenCalledWith(newResult);
      }));
  });

});
