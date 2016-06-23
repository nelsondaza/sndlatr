'use strict';

/**
 * Function that starts authentication flow when called.
 * It listens to gmail account detection events and checks idtoken auth.
 * Shows welcome dialog if user is not authenticated.
 * Once authentication is complete (either silent or via dialog), it
 * broadcasts 'authcomplete' on the root scope.
 */
angular.module('sndlatr.authflow', ['w69b.idtokenauth', 'ui.bootstrap',
    'gmail'])
  .factory('authflow',
    ['gmailEvents', 'idtokenauth', 'googleauth', '$modal', '$rootScope',
      '$http', '$log', '$timeout', '$q', '$document', 'email',
      function(gmailEvents, idtokenauth, googleauth, $modal, $rootScope, $http,
               $log, $timeout, $q, $document, email) {
        var started = false;
        var emailAddress;
        var idTokenTries = 0;
        var accountElHandled;

        function openWelcomeDialog() {
          var dialogScope = $rootScope.$new(true);
          dialogScope.email = emailAddress;
          var dialog = $modal.open({
            templateUrl: 'views/welcomeDialog.html',
            controller: 'WelcomeDialogCtrl',
            scope: dialogScope});
          dialog.result.then(function(code) {
            if (code) {
              $log.debug('got auth code, posting to backend');
              var promise = $http.post('/api/init', {code: code});
              afterPostingCode(promise);
            } else {
              // cancelled
            }
            // saveAsSvg(result.filename);
          });
        }

        function showCompleteDialog() {
          $modal.open({
            templateUrl: 'views/setupCompleteDialog.html',
            controller: 'CloseableDialogCtrl'});
        }

        function afterPostingCode(promise) {
          promise.then(function() {
            // we need to wait a bit before fetching a id token.
            return $timeout(angular.noop, 1000);
          })
            .then(function() {
              $log.debug('fetching id token');
              return idtokenauth.checkAuth(emailAddress);
            })
            .then(function() {
              authComplete();
              showCompleteDialog();
            }, function() {
              $log.warn('sndlatr auth failed, retrying soon');
              if (idTokenTries++ < 10)
                afterPostingCode($q.when());
            });
        }


        function authComplete() {
          // TODO: second event for code ? Or move initialization POST here?
          $log.debug('authcomplete');
          $rootScope.$broadcast('authcomplete');
        }

        function handleAccountEl(target) {
          if (angular.isString(target))
            emailAddress = target;
          else
            emailAddress = angular.element(target).text();

          if (accountElHandled) return;
          accountElHandled = true;
          googleauth.loadClient()
            .then(function() {
              return idtokenauth.checkAuth(emailAddress);
            }).then(authComplete,
            function() {
              openWelcomeDialog();
            });
        }

        function authflow() {
          if (started) return;

          started = true;
          gmailEvents.$on('gm:accountmail', function(event, target) {
            handleAccountEl(target);
          });
          pollForAccountEl();
        }

        function pollForAccountEl() {
          if (accountElHandled) return;
          var title = $document[0].title;
          var mails = email.find(title);
          if (mails.length) {
            handleAccountEl(mails.pop());
          } else {
            $timeout(pollForAccountEl, 200);
          }
        }

        return {
          start: authflow,
          openDialog: openWelcomeDialog
        };
      }])
  .controller('WelcomeDialogCtrl',
    ['$scope', '$modalInstance', 'googleauth',
      function($scope, $modalInstance, googleauth) {
        $scope.cancel = function() {
          $modalInstance.close();
        };

        $scope.grantAccess = function() {

          // without forced approval we don't get a refresh token if already
          // authenticated before.
          googleauth.authPopup({response_type: 'code', access_type: 'offline',
            login_hint: $scope.email, approval_prompt: 'force'})
            .then(function(result) {
              $modalInstance.close(result.code);
            }, function() {
              // console.log('auth cancelled');
            });
        };
      }]);
