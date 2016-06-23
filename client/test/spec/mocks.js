'use strict';


// var mock = {};
// mock.authDecorator = function($delegate) {
//   var obj = {};
//   angular.extend(obj, $delegate, {prototype: $delegate.prototype});

//   return obj;
// };
(function() {

  var mock = {};
  mock.jobDecorator = function($delegate, $q) {

    var Job = $delegate;

    var pro = Job.prototype;

    pro.isStored = function() {
      return this.$allModels.indexOf(this) >= 0;
    };

    pro.put = function() {
      var jobs = this.$allModels;
      var idx = jobs.indexOf(this);
      if (idx < 0) jobs.push(this);
      return $q.when(this);
    };

    pro.delete = function() {
      var jobs = this.$allModels;
      var idx = jobs.indexOf(this);
      if (idx >= 0) jobs.splice(idx, 1);
      return $q.when();
    };


    return Job;
  };

  angular.module('sl.test.scheduler', ['sndlatr.scheduler'])
    .config(function($provide) {
      $provide.decorator('SendJob', mock.jobDecorator);
      $provide.decorator('RemindJob', mock.jobDecorator);
      $provide.decorator('Snippet', mock.jobDecorator);
    });
  angular.module('gmail.xhr')
    .factory('gmailXhrMonitor', function() {
      var api = {
        reset: angular.noop,
        loadListener: null,
        loadStartListener: null,
        $simulateLoad: function(request) {
          if (!api.loadListener) return;
          api.loadListener(request);
        },
        $simulateLoadStart: function(request) {
          if (!api.loadStartListener) return;
          api.loadStartListener(request);
        }
      };
      return api;
    });


})();
