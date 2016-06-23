'use strict';

angular.module('sndlatr.http', ['w69b.idtokenauth'])
/**
 * Allows to configure default base url for requests with relative urls.
 */
  .provider('httpBaseInterceptor', function() {
    var baseUrl = '';
    var conditionRe = null;

    /**
     * Set base for $http requests.
     * @param {string} url base for http requests without absolute url.
     */
    this.setBaseUrl = function(url) {
      baseUrl = url;
    };

    this.setCondition = function(regexp) {
      conditionRe = regexp;
    };

    this.$get = function() {
      return {
        'request': function(config) {
          var url = config.url;
          if (!url.match(/^https?:\/\//) &&
            (!conditionRe || url.match(conditionRe))) {
            config.url = baseUrl + config.url;
          }
          return config;
        }
      };
    };

  })

  .provider('httpErrorInterceptor',
  /**
   * Http interceptor to globally handle some http errors.
   * Depending on the error it takes the following actions to recover:
   *  - 5xx: resend the request with an exponential backoff maxRetries times.
   *    The maximal number of retries can be set via provider.setMaxRetries()
   *    An event (http:retryScheduled, delayInMs) is broadcast on $rootScope.
   *    An event (http:error, 'server', httpConfig) is sent when the maximal
   *    number of retries is exeeded.
   *  - 403: Refresh idtokenauth if response data is 'not_logged_in'
   *    The http request is retried on success.
   *  - Any other error: broadcast (http:error, 'unhandled', httpConfig)
   *
   */
    function() {
    var maxErrorRetries = 3;

    /**
     * @param {number} num maximal number of retries before giving up on a 5xx
     * error.
     */
    this.setMaxRetries = function(num) {
      maxErrorRetries = num;
    };

    this.$get = ['$q', '$injector', '$rootScope', '$timeout', 'idtokenauth',
      function($q, $injector, $rootScope, $timeout, idtokenauth) {

        var $http_;

        /**
         * Lazzily get http reference (circular dependency).
         */
        function getHttp() {
          if (!$http_)
            $http_ = $injector.get('$http');
          return $http_;
        }

        function tryLater(config) {
          // wait retryCount sec (max 16) + rand num of ms.
          var waitSec = Math.min(Math.pow(2, config.retryCount), 32);
          var delay = 1000 * waitSec + Math.random() * 1000;
          $rootScope.$broadcast('http:retryScheduled', config, delay);
          return $timeout(function() {
            return getHttp()(config);
          }, delay);
        }

        /**
         * @param {Object} response response object.
         * @param {number=} maxRetries maximal number of retires,
         * infinity if not given.
         * @return {Object} promise if retried, null else.
         */
        function retryConfig(response, maxRetries) {
          var config = angular.copy(response.config);
          if (config.retryCount)
            config.retryCount++;
          else
            config.retryCount = 1;

          if (!maxRetries || config.retryCount <= maxRetries) {
            // try again.
            return tryLater(config);
          }
          return null;
        }

        function onError(response) {
          var status = response.status;
          // Server error
          if (status === 0) {
            return retryConfig(response);
          } else if (status >= 500 && status < 600) {
            var retry = retryConfig(response, maxErrorRetries);
            if (retry)
              return retry;
            else
              $rootScope.$broadcast('http:error', 'server', response);

          } else if (status == 403) {
            var config = angular.copy(response.config);
            if (config.authRetryCount)
              config.authRetryCount++;
            else
              config.authRetryCount = 1;
            if (response.data === 'not_logged_in' &&
              config.authRetryCount < maxErrorRetries) {
              return idtokenauth.checkAuth()
                .then(function() {
                  return getHttp()(config);
                });
            } else {
              $rootScope.$broadcast('http:error', 'auth', response);
            }
          } else if (status == 404) {
            $rootScope.$broadcast('http:error', 'notfound', response);
          } else {
            $rootScope.$broadcast('http:error', 'unknown', response);
          }
          return $q.reject(response);
        }

        return {
          'responseError': onError
        };
      }];
  });
