'use strict';

angular.module('sndlatr.errornotify', ['gmail.ui'])
  .factory('httpErrorNotifier', ['$rootScope', 'gmailNotify', '$timeout',
    function($rootScope, gmailNotify, $timeout) {

      var timer = null;

      /**
       * @param {Object} event angular event.
       * @param {string} type error type (see httpInterceptor).
       * @param {Object} response http response.
       */
      function onError(event, type, response) {
        if (response.config.notifyErrors === false)
          return;
        cancelTimer();
        // if (type == 'unknown' || type == 'server') {
          gmailNotify.error('Oups! An error occured during ' +
            'communication ' +
            'with the SndLatr backend. Please try to reload the page.');
        // } else if (type == 'auth') {
        //   gmailNotify.message('You are not allowed to view this page.');
        // } else if (type == 'notfound') {
        //   gmailNotify.message('The requested page does not exist.');
        // }
      }

      function showRetryMessage(delay) {
        var msg = 'SndLatr failed to communicate with backend. ';
        var waitSec = Math.floor(delay / 1000);
        if (waitSec <= 0)
          msg += 'Retrying...';
        else
          msg += 'Retrying in ' + waitSec + ' seconds.';
        gmailNotify.message(msg, 3000);
      }

      function cancelTimer() {
        if (timer) {
          $timeout.cancel(timer);
          timer = null;
        }
      }

      function onRetry(event, config, delay) {
        if (config.notifyErrors === false)
          return;
        if (delay < 3000) return;
        cancelTimer();
        showRetryMessage(delay);
        function updateMessage() {
          delay -= 1000;
          showRetryMessage(delay);
          if (delay > 0)
            timer = $timeout(updateMessage, 1000);
        }

        timer = $timeout(updateMessage, 1000);
      }

      $rootScope.$on('http:error', onError);
      $rootScope.$on('http:retryScheduled', onRetry);


      // no public api.
      return {
      };
    }]);
