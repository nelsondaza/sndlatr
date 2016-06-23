'use strict';

/**
 * googleauth is a simple wrapper around the goolge auth api client library.
 * Call setScope to setup desired scopes. It offers simple defered based
 * to initiate authentication.
 */

angular.module('w69b.googleauth', ['w69b.scriptloader'])
  .provider('googleauth', function() {

    var scopes = ['id_token'];
    var clientId;

    var GAPI_URL = '//apis.google.com/js/client.js';
    var autoload = false;

    /**
     * Set scopes to required googel auth scopes.
     * @type {Array.<String>} list of scopes.
     */
    this.setScope = function(scopes_) {
      scopes = scopes_;
      return this;
    };


    /**
     * Configures client id.
     * @param {String} id client id from api console.
     */
    this.setClientId = function(id) {
      clientId = id;
      return this;
    };

    /**
     * Set to true to enable auto loading client lib.
     * @param {boolean} auto autoload setting.
     */
    this.setAutoLoad = function(auto) {
      autoload = auto;
      return this;
    };

    this.$get = ['$window', '$q', 'scriptloader', '$timeout', '$rootScope',
      function($window, $q, scriptloader, $timeout, $rootScope) {
        var gapi;

        var isAuthorized = false;

        /**
         * Google js client has loaded;
         */
        function clientLoaded() {
          gapi = $window.gapi;
          if (!gapi || !gapi.auth) throw new Error('gapi did not load');
        }

        /**
         * Helper to auto refresh token when expired.
         * @param {Object} result result from first authentication.
         * @param {Object=} config optional auth config.
         * @return {{setCallback: Function}}
         * @constructor
         */
        function AutoRefresher(result, config) {
          var callback = angular.noop;

          function setResult(authResult) {
            callback(authResult);
            var expiresIn = authResult['expires_in'];
            if (expiresIn >= 120) {
              // Re-fetch token one minute before it times out.
              $timeout(function() {
                authSilent(config).then(setResult);
              }, (expiresIn - 60) * 1000, false);
            } else {
              throw new Error('token expires too fast');
            }
          }

          function setCallback(fn) {
            callback = fn;
          }

          setResult(result);

          return {
            setCallback: setCallback
          };
        }

        /**
         * @ngdoc
         * Authorize silently. Only works if user has previouly authorized
         * the app.
         * @param {Object=} opt_config optinal additional config to pass to
         * google auth.
         * @return {!Object} Promise of authorization with
         * oauth token as value on success and error message on failure.
         */
        function authSilent(opt_config) {
          return auth(angular.extend({}, opt_config || {}, {immediate: true}));
        }

        /**
         * Authorize by showing a login popup.
         * @param {Object=} opt_config optinal additional config to pass to
         * google auth.
         * @return {!Object} Promise of authorization with
         * oauth token as value on success and error message on failure.
         * Make sure to call authSilent first to avoid blocked popups by
         * async operations.
         */
        function authPopup(opt_config) {
          return auth(angular.extend({}, opt_config || {},
            {immediate: false}));
        }


        /**
         * Authorize with google auth api.
         * With silent authorization ({immediate: true}) no popup is opened.
         * This fails if the app has not been authorized previously. Without
         * silent auth there is always a popup opened. This should only be
         * performed in response to ui clicks, otherwise the popup will be
         * blocked.
         * @param {Object=} config additinal config to pass to google auth.
         * token.
         * @return {!Object} Promise of authorization with
         * oauth token as value on success and error message on failure.
         */
        function auth(config) {
          if (!gapi) throw new Error('client not loaded');
          if (!clientId) throw new Error('client id not configured');
          var deferred = $q.defer();

          function handleResult(result) {
            // unknown error
            if (!result) {
              deferred.reject();
              isAuthorized = false;
            } else if (result['error']) {
              isAuthorized = false;
              deferred.reject(result['error']);
            } else {
              isAuthorized = true;
              deferred.resolve(result);
            }
            if (!$rootScope.$$phase)
              $rootScope.$digest();
          }

          var params = {client_id: clientId,
            scope: scopes,
            immediate: true};
          angular.extend(params, config);

          gapi.auth.authorize(params, handleResult);
          return deferred.promise;
        }

        /**
         * Ensure client lib is loaded.
         * @return {Object} promise that resolves when loaded.
         */
        function loadClient() {
          return scriptloader.load(GAPI_URL)
            .then(waitForAuthApi).then(clientLoaded);
        }

        /**
         * Wait till auth api is available.
         * @return {Object} Promise that resolves when loaded.
         */
        function waitForAuthApi() {
          var deferred = $q.defer();

          function isLoaded() {
            return $window.gapi && $window.gapi.auth;
          }

          function check() {
            if (isLoaded()) {
              clientLoaded();
              deferred.resolve();
            } else {
              $timeout(check, 20);
            }
          }

          check();
          return deferred.promise;
        }

        // if this is injected we'll always need the client, so load it.
        if (autoload)
          loadClient();

        return {
          loadClient: loadClient,
          authSilent: authSilent,
          authPopup: authPopup,
          AutoRefresher: AutoRefresher,
          isAuthorized: function() {
            return isAuthorized;
          }
        };
      }];
  });
