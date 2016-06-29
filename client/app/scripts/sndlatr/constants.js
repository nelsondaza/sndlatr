'use strict';

angular.module('sndlatr.constants', []).config(
  ['$provide', function($provide) {
    $provide.constant('constants', {
      GAUTH_SCOPES: ['openid', 'email', 'https://mail.google.com/'],
      GAUTH_CLIENT_ID: 'YOUR_CLIENT_ID.apps.googleusercontent.com',
      BACKEND: 'http://localhost:8080',
      // BACKEND: 'https://sndlatr-dev.appspot.com',
      IS_DEVELOPMENT: true
    });
  }]);
