'use strict';

angular.module('w69b.scriptloader', [])
  .factory('scriptloader', ['$document', '$q', '$rootScope',
    function($document, $q, $rootScope) {
      var loadingSrcs = {};

      /**
       * Loads script if not loaded yet.
       * Returns promise that resolves when script is loaded.
       * @param {String} url to load.
       * @return {Object} promise.
       */
      function loadScript(url) {
        if (isInDom(url)) {
          if (loadingSrcs.hasOwnProperty(url))
            return loadingSrcs[url];
          else
            return $q.when(true);
        }

        var deferred = $q.defer();
        loadingSrcs[url] = deferred.promise;

        var script = document.createElement('script');
        script.type = 'text/javascript';
        script.src = url;
        // script.async = true;
        // var s = $document[0].getElementsByTagName('script')[0];
        script.onload = function() {
          delete loadingSrcs[url];
          deferred.resolve();
          if (!$rootScope.$$phase) $rootScope.$digest();
        };
        // s.parentNode.insertBefore(script, s);
         $document.find('script').eq(0).parent().prepend(script);

        return deferred.promise;
      }

      /**
       * Check if script with given url is in document.
       */
      function isInDom(url, matchPartial) {
        if (matchPartial)
          return !!$document[0].querySelector('script[src^="' + url + '"]');
        else
          return !!$document[0].querySelector('script[src="' + url + '"]');
      }

      // Public API.
      return {
        isInDom: isInDom,
        load: loadScript
      };
    }]);
