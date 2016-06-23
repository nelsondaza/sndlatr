'use strict';


angular.module('sndlatrApp.base',
    ['gmail', 'ui.bootstrap',
      'sndlatr.ui', 'sndlatr.initialize', 'sndlatr.http', 'sndlatr.constants',
      'sndlatr.errornotify',
      'templates'])
  .config(
    ['httpIdTokenAuthInterceptorProvider',
      'httpBaseInterceptorProvider',
      'googleauthProvider',
      'constants',
      /**
       * Wire up providers from configuration constants.
       */
        function(httpIdTokenAuthInterceptorProvider,
                 httpBaseInterceptorProvider, googleauthProvider, constants) {
        var base = constants.BACKEND;
        httpIdTokenAuthInterceptorProvider.setBaseUrl(base);
        httpBaseInterceptorProvider.setBaseUrl(base);
        httpBaseInterceptorProvider.setCondition(/^\/api\//);


        googleauthProvider.setScope(constants.GAUTH_SCOPES)
          .setClientId(constants.GAUTH_CLIENT_ID);
      }])
  .config(
    ['$httpProvider', function($httpProvider) {
      $httpProvider.interceptors.push('httpBaseInterceptor');
      $httpProvider.interceptors.push('httpIdTokenAuthInterceptor');
      $httpProvider.interceptors.push('httpErrorInterceptor');
    }])
  .run(['httpErrorNotifier', angular.noop]);

angular.module('sndlatrApp', ['sndlatrApp.base']);
// .run(['SendJob', function(SendJob) {
//   SendJob.loadAll();
// }]);

