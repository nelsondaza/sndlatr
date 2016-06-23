'use strict';

// override some constants
angular.module('sndlatr.constants').config(['constants', function(constants) {
  constants.IS_DEVELOPMENT = false;
  constants.BACKEND =  'https://sndlatr.appspot.com';
}]);
