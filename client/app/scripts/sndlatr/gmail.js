'use strict';

angular.module('gmail', ['gmail.core', 'gmail.ui'])
  .run(['gmailEventHandler', function(gmailEventHandler) {
    gmailEventHandler.start();
  }]);
