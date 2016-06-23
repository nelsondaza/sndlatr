'use strict';

angular.module('w69b.throttle', [])
  .factory('throttle', ['$timeout', function($timeout) {
    /**
     * Returns throttled version of given function. The original function is
     * called at the end of the given interval after the last call with the
     * arguments of the last call to the throttled version.
     * @param {function(args...)} fn to wrap.
     * @param {Number} delay interval in ms.
     * @returns {function} that calls fn at most once every delay ms when
     * called.
     */
    function throttle(fn, delay) {
      var timer;
      var involke;

      var throttled = function() {
        var args = angular.copy(arguments, []);
        involke = function() {
          // set timer to null, not pending anymore.
          timer = null;
          involke = null;
          return fn.apply(null, args);
        };
        // cancel pending timer.
        if (timer) {
          $timeout.cancel(timer);
        }
        timer = $timeout(involke, delay);
      };

      /**
       * Run pending task now. Does nothing the task is not pending.
       */
      throttled.flush = function() {
        if (timer) {
          $timeout.cancel(timer);
          involke();
        }
      };

      return throttled;
    }

    return throttle;
  }]);
