'use strict';

angular.module('sndlatr.fakebackend', ['ngMockE2E'])
  .run(['$httpBackend', function($httpBackend) {
    var jobs = [
      {
        key: 'key_x',
        messageId: '140a1da0273c7794',
        scheduledAt: '2020-08-30T10:20:09.407Z'
      }
    ];
    var keyCnt = 0;

    // pass trough all non-api calls.
    $httpBackend.whenGET(/^[^(\/api\/)]/).passThrough();

    // returns the current list of phones
    $httpBackend.whenGET('/api/scheduled').respond(jobs);

    // adds a new phone to the phones array
    $httpBackend.whenPOST('/api/scheduled').respond(function(method, url,
                                                             data) {
      var job = angular.fromJson(data);
      job.key = 'key_' + keyCnt++;
      return [200, job];
    });

    $httpBackend.whenPOST(/^\/api\/scheduled\/.*/)
      .respond(function(method, url, data) {
        var job = angular.fromJson(data);
        return [200, job];
      });

  }]);
