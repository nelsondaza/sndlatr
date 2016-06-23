'use strict';

angular.module('sndlatr.initialize',
    ['sndlatr.authflow', 'sndlatr.scheduler'])
  .run(['authflow', '$rootScope', '$http', '$log', 'SendJob', 'RemindJob', 'Snippet',
    function(authflow, $rootScope, $http, $log, SendJob, RemindJob, Snippet) {

      function onSuccess(result) {
        var auth = result['auth'];
        // if backend needs auth code, get it from google auth service.
        if (auth == 'need_code') {
          authflow.openDialog();
        } else {
          SendJob.loadData(result['sendJobs']);
          RemindJob.loadData(result['remindJobs']);
          Snippet.loadData(result['snippets']);
          $rootScope.isInitialized = true;
          $log.debug('sndlatr init complete');
          // initialize scheduler with data from result
        }
      }


      /**
       * Get initialization data from backend.
       */
      function initData() {
        $http.get('/api/init').success(onSuccess);
      }

      authflow.start();
      $rootScope.$on('authcomplete', initData);

    }]);
