'use strict';

/**
 *
 */

angular.module('w69b.idtokenauth', ['w69b.googleauth'])
  .factory('idtokenauth', ['googleauth', function(googleauth) {
    var authConfig = {response_type: 'id_token'};
    var idToken = null;

    function handleFirstTimeResult(result) {
      new googleauth.AutoRefresher(result, authConfig)
        .setCallback(gotToken);
      gotToken(result);
      return result['id_token'];
    }

    /**
     * Got token (first time or auto refreshed update).
     */
    function gotToken(result) {
      idToken = result['id_token'];
    }

    function getConfig(email) {
      if (email) {
        return angular.extend({login_hint: email}, authConfig);
      } else {
        return authConfig;
      }
    }

    /**
     * Same as googleauth.authSilent() with idToken as response_type.
     * @param {String=} email optional email.
     */
    function checkAuth(email) {
      return googleauth.authSilent(getConfig(email))
        .then(handleFirstTimeResult);
    }

    /**
     * Same as googleauth.authPopup() with idToken as response_type..
     * @param {String=} email optional email.
     */
    function authPopup(email) {
      return googleauth.authPopup(getConfig(email))
        .then(handleFirstTimeResult);
    }

    return {
      checkAuth: checkAuth,
      authPopup: authPopup,
      getIdToken: function() {
        return idToken;
      }
    };
  }])
  .provider('httpIdTokenAuthInterceptor', function() {
    var baseUrl = '';
    var relativeEnabled = false;

    /**
     * Set base for $http request that should be authenticated.
     * @param {string} url base url.
     */
    this.setBaseUrl = function(url) {
      baseUrl = url;
    };

    /**
     * @param {boolean} enable whether to auth relative url requests.
     */
    this.setEnableForRelativeUrls = function(enable) {
      relativeEnabled = enable;
    };

    this.$get = ['idtokenauth', function(idtokenauth) {
      return {
        'request': function(config) {
          var idToken = idtokenauth.getIdToken();

          if (idToken && (
            (relativeEnabled && !config.url.match(/^https?:\/\//)) ||
              baseUrl && config.url.indexOf(baseUrl) === 0)) {
            config.headers['x-w69b-idtoken'] = idToken;
          }
          return config;
        }
      };
    }];
  });
