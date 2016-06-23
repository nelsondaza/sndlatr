'use strict';

function bootstrap() {
  var el = document.createElement('div');
  document.body.appendChild(el);
  angular.bootstrap(el, ['sndlatrApp']);
}

angular.module('sndlatrApp')
  .run(['gmailViewInjector', function() {

  }]);

bootstrap();
