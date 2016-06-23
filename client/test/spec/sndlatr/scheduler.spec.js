describe('scheduler models', function() {
  beforeEach(module('sndlatr.scheduler', 'gmail.conversation'));

  var $httpBackend;

  beforeEach(inject(function(_$httpBackend_) {
    $httpBackend = _$httpBackend_;
  }));

  afterEach(function() {
    $httpBackend.verifyNoOutstandingExpectation();
    $httpBackend.verifyNoOutstandingRequest();
  });

  function addCommonModelTests(clsName) {
    var Model;

    beforeEach(inject(function($injector) {
      Model = $injector.get(clsName)
    }));

    it('should parse created at date', function() {
      var model = new Model({createdAt: '2013-10-25T13:25:34.549750+00:00'});
      expect(model.createdAt.getDate()).toEqual(25);
    });

    it('should find model by id', function() {
      var job = Model.getById('key2');
      expect(job).toBeDefined();
      expect(job.id).toEqual('key2');
    });

    describe('delete', function() {
      it('should send delete to backend', function() {
        var job = new Model({id: 'testid'});
        $httpBackend.expectDELETE(Model._endpointUrl + '/testid')
          .respond(204, {});
        job.delete();
        $httpBackend.flush();
        expect(Model.getById('testid')).toBeFalsy();
      });

      it('should restore local copy on failure', function() {
        var job = new Model({id: 'testid'});
        $httpBackend.expectDELETE(Model._endpointUrl + '/testid')
          .respond(500, {});
        job.delete();
        expect(Model.getById('testid')).toBeFalsy();
        $httpBackend.flush();
        expect(Model.getById('testid')).toEqual(job);
      });
    });

    describe('put', function() {
      it('should add new model with new key', function() {
        $httpBackend.expectPOST(Model._endpointUrl,
          {messageId: "msgIdNew",
            utcOffset: 0})
          .respond(200,
          {id: 'keyNEW', messageId: 'msgIdNew'});
        var job = new Model({messageId: 'msgIdNew',
          utcOffset: 0});
        job.put();
        expect(job.isStored()).toBe(true);
        $httpBackend.flush();
        expect(Model.getCount()).toEqual(3);
        expect(Model.getById('keyNEW')).toBeTruthy();
      });

      it('should serialize requests', function() {
        var url = Model._endpointUrl;
        $httpBackend.expectPOST(url)
          .respond(200,
          {id: 'keyNEW', messageId: 'msgIdNew'});
        var job = new Model({messageId: 'msgIdNew'});
        var successSpy1 = jasmine.createSpy('success spy put 1');
        var successSpy2 = jasmine.createSpy('success spy put 2');
        var successSpy3 = jasmine.createSpy('success spy put 3');
        var deleteSuccessSpy = jasmine.createSpy('success spy delete');
        job.put().then(successSpy1);
        job.put().then(successSpy2);
        job.put().then(successSpy3);
        job.put();
        job.delete().then(deleteSuccessSpy);

        $httpBackend.expectPOST(url + '/keyNEW')
          .respond(400, {});
        $httpBackend.expectPOST(url + '/keyNEW')
          .respond(200,
          {id: 'keyNEW2', messageId: 'msgIdNew'});
        $httpBackend.expectPOST(url + '/keyNEW2')
          .respond(200, {id: 'deleteId'});
        $httpBackend.expectDELETE(url + '/deleteId')
          .respond(204);
        $httpBackend.flush();

        expect(successSpy1).toHaveBeenCalled();
        expect(successSpy2).not.toHaveBeenCalled();
        expect(successSpy3).toHaveBeenCalled();
        expect(deleteSuccessSpy).toHaveBeenCalled();
      });

      it('should update existing job with existing key', function() {
        $httpBackend.expectPOST(Model._endpointUrl + '/key2')
          .respond(200,
          {id: 'key2',
            newattr: 'newval',
            createdAt: "2020-01-01T10:20:09.407Z"});
        var job = Model.getById('key2');
        job.newattr = 'newval';
        job.put();
        $httpBackend.flush();
        expect(Model.getCount()).toEqual(2);
        expect(Model.getById('key2')).toEqual(job);
        // scheduledAt should be a date object.
        expect(job.createdAt).toEqual(jasmine.any(Date));
      });
    });
  }

  function addCommonJobTests(clsName) {
    var Job;

    addCommonModelTests(clsName);

    beforeEach(inject(function($injector) {
      Job = $injector.get(clsName)
    }));

    it('should parse dates', function() {
      var job = new Job({createdAt: '2013-10-25T13:25:34.549750+00:00',
        scheduledAt: '2014-10-26T13:25:34.549750+00:00'
      });
      expect(job.createdAt.getDate()).toEqual(25);
      expect(job.scheduledAt.getDate()).toEqual(26);
    });


    describe('nextPollInterval', function() {
      var job;
      beforeEach(function() {
        // create job in 3 minutes.
        var data = {scheduledAt: Date.create('in 3 minutes')};
        $httpBackend.expectPOST(Job._endpointUrl).respond(
          angular.extend({id: 'newId', state: 'scheduled'}, data));
        job = new Job(data);
        job.put();
        $httpBackend.flush();
        expect(Job.getById('newId')).toBeTruthy();
      });

      it('should be nearest scheduled job data + poll interval', function() {
        expect(Job._getNextPollInterval())
          .toEqualAbout(3 * 60000 + Job.PROCESSING_POLL_INTERVAL, 100);
      });

      it('should be poll interval if there are processing jobs', function() {
        job.state = 'queued';
        expect(Job._getNextPollInterval()).toBe(Job.PROCESSING_POLL_INTERVAL);
      });
    });

    describe('_planUpdatePolling', function() {
      var $timeout, intervalSpy, updateSpy;
      beforeEach(inject(function(_$timeout_, $q) {
        $timeout = _$timeout_;
        intervalSpy = spyOn(Job, '_getNextPollInterval').andReturn(10000);
        updateSpy = spyOn(Job, 'updateProcessing').andReturn($q.when());
      }));

      it('should set timer to pollInterval', function() {
        Job._planUpdatePolling();
        $timeout.flush(10000);
        expect(updateSpy).toHaveBeenCalled();
      });

      it('should cancel timer if nextInterval is less', function() {
        Job._planUpdatePolling();
        intervalSpy.andReturn(4000);
        Job._planUpdatePolling();
        $timeout.flush(4000);
        expect(updateSpy).toHaveBeenCalled();
        expect(updateSpy.callCount).toEqual(1);
      });
    });

    describe('updateProcessing', function() {
      var job1;
      beforeEach(function() {
        job1 = Job.getById('key1');
        job1.state = 'queued';
        Job.getById('key2').state = 'queued';
      });

      it('should query all with shouldPoll() == true', function() {
        expect(job1.shouldPoll()).toBe(true);
        $httpBackend.expectGET(Job._endpointUrl + '?id=key1&id=key2')
          .respond([
            {'id': 'key1', state: 'scheduled'}
          ]);
        Job.updateProcessing();
        $httpBackend.flush();
        expect(job1.getDisplayState()).toEqual('scheduled');
      });

      it('should remove and reset failed jobs', function() {
        expect(job1.shouldPoll()).toBe(true);
        $httpBackend.expectGET(Job._endpointUrl + '?id=key1&id=key2')
          .respond([
            {id: 'key1', state: 'failed', testattr: 'testval'}
          ]);
        Job.updateProcessing();
        $httpBackend.flush();
        expect(Job.getById('key1')).toBeFalsy();
        expect(job1.id).toBeUndefined();
        Job._autoResetPreserveAttrs.forEach(function(attr) {
          expect(job1[attr]).not.toBeUndefined();
        });
      });
    });

  }

  describe('RemindJob', function() {
    var RemindJob;

    var testData = [
      {
        id: 'key1',
        threadId: 'threadIdOfKey1',
        scheduledAt: "2020-08-30T10:20:09.407Z",
        state: 'scheduled'
      },
      {
        id: 'key2',
        threadId: 'threadIdOfKey2',
        scheduledAt: "2020-01-01T10:20:09.407Z",
        state: 'scheduled'
      }
    ];

    beforeEach(inject(function(_RemindJob_) {
      RemindJob = _RemindJob_;
    }));

    beforeEach(function() {
      expect(RemindJob.getCount()).toEqual(0);
      $httpBackend.expectGET('/api/remind').respond(testData);
      RemindJob.loadAll();
      $httpBackend.flush();
      expect(RemindJob.getCount()).toEqual(2);
    });

    addCommonJobTests('RemindJob');

    it('should not messageId, scheduledAt from put', function() {
      var job = RemindJob.getById('key1');
      job.threadId = 'newId';
      var newDate = new Date('in 33 hours');
      job.scheduledAt = newDate;
      $httpBackend.expectPOST('/api/remind/key1').respond(testData[0]);
      job.put();
      $httpBackend.flush();
      expect(job.threadId).toEqual('newId');
      expect(job.scheduledAt).toEqual(newDate);
    });

    describe('getByThreadId', function() {
      it('should find job', function() {
        var job = RemindJob.getByThreadId('threadIdOfKey1');
        expect(job).toBeDefined();
        expect(job.id).toEqual('key1');
        expect(job.scheduledAt).toEqual(jasmine.any(Date));
        expect(job.scheduledAt.isValid).toBeDefined();
      });

      it('should return null if not found', function() {
        expect(RemindJob.getByThreadId('nonexistent')).toBe(null);
      });

      it('should return newest jobs if multiple exist', function() {
        var job2 = RemindJob.getById('key2');
        var job1 = RemindJob.getById('key1');
        job2.threadId = job1.threadId;
        job1.createdAt = Date.create('5 minutes ago');
        job2.createdAt = Date.create('1 minutes ago');
        expect(RemindJob.getByThreadId('threadIdOfKey1')).toBe(job2);
        job1.createdAt = Date.create('now');
        expect(RemindJob.getByThreadId('threadIdOfKey1')).toBe(job1);

      });
    });


    describe('displayState', function() {
      var job;
      beforeEach(function() {
        job = new RemindJob();
      });

      it('should be new without state', function() {
        expect(job.getDisplayState()).toEqual('new');
      });

      it('should be scheduled with date', function() {
        job.scheduledAt = new Date();
        expect(job.getDisplayState()).toEqual('scheduled');
      });

      it('should be disabled while checking', function() {
        job.state = 'disabled';
        expect(job.getDisplayState()).toEqual('disabled');
        job.state = 'checking';
        expect(job.getDisplayState()).toEqual('disabled');
      });

      it('should be not translate failed/done', function() {
        job.state = 'done';
        expect(job.getDisplayState()).toEqual('done');
        job.state = 'failed';
        expect(job.getDisplayState()).toEqual('failed');
      });

      it('should be scheduled while queued', function() {
        job.state = 'scheduled';
        expect(job.getDisplayState()).toEqual('scheduled');
        job.state = 'queued';
        expect(job.getDisplayState()).toEqual('scheduled');
      });
    });

    describe('check reply', function() {
      var job, conversation;
      beforeEach(inject(function(conversationStore) {
        job = RemindJob.getByThreadId('threadIdOfKey1');
        job.knownMessageIds = ['msg1'];
        job.onlyIfNoreply = true;
        conversationStore.addConversation('msg1', []);
        conversationStore.addMessage({messageId: 'msg1'});
        conversationStore.addMessage(
          {origMessageId: 'msg1', messageId: 'msg2'});
        conversation = conversationStore.getConversation('msg1');
      }));

      it('should post if needed', function() {
        $httpBackend.expectPOST(RemindJob._endpointUrl + '/key1/check_reply',
            /msg2/)
          .respond(204);
        job.checkReply(conversation);
        $httpBackend.flush();
      });

      it('should not post without onlyIfNoreply', function() {
        job.onlyIfNoreply = false;
        job.checkReply(conversation);
      });

      it('should not post if not scheduled', function() {
        job.state = 'done';
        job.checkReply(conversation);
      });

      it('should not post all msgIds are known', function() {
        job.knownMessageIds = ['msg1', 'msg2'];
        job.checkReply(conversation);
      });
    });
  });

  describe('SendJob', function() {

    var SendJob;

    var testData = [
      {
        id: 'key1',
        messageId: 'msgIdOfKey1',
        scheduledAt: "2020-08-30T10:20:09.407Z",
        state: 'scheduled'
      },
      {
        id: 'key2',
        messageId: 'msgIdOfKey2',
        scheduledAt: "2020-01-01T10:20:09.407Z",
        state: 'scheduled'
      }
    ];

    beforeEach(inject(function(_SendJob_) {
      SendJob = _SendJob_;
    }));


    beforeEach(function() {
      expect(SendJob.getCount()).toEqual(0);
      $httpBackend.expectGET('/api/schedule').respond(testData);
      SendJob.loadAll();
      $httpBackend.flush();
      expect(SendJob.getCount()).toEqual(2);
    });

    addCommonJobTests('SendJob');


    it('should not messageId, scheduledAt from put', function() {
      var job = SendJob.getById('key1');
      job.messageId = 'newId';
      var newDate = new Date('in 33 hours');
      job.scheduledAt = newDate;
      $httpBackend.expectPOST('/api/schedule/key1').respond(testData[0]);
      job.put();
      $httpBackend.flush();
      expect(job.messageId).toEqual('newId');
      expect(job.scheduledAt).toEqual(newDate);
    });

    describe('displayState', function() {
      var job;
      beforeEach(function() {
        job = SendJob.getByMessageId('msgIdOfKey1');
      });

      it('should be scheduled if not due', function() {
        expect(job.getDisplayState()).toEqual('scheduled');
      });

      it('should be processing if due', function() {
        job.scheduledAt = new Date();
        expect(job.getDisplayState()).toEqual('processing');
      });

      it('should be processing for state sent and queued', function() {
        job.state = 'sent';
        expect(job.getDisplayState()).toEqual('processing');
        job.state = 'queued';
        expect(job.getDisplayState()).toEqual('processing');
      });

      it('should be new if not scheduled yet', function() {
        job.state = undefined;
        expect(job.getDisplayState()).toEqual('scheduled');
        job.scheduledAt = undefined;
        expect(job.getDisplayState()).toEqual('new');
      });

      it('should be sent if state is done', function() {
        job.state = 'done';
        expect(job.getDisplayState()).toEqual('sent');
      });

      it('should be failed if state is failed', function() {
        job.state = 'failed';
        expect(job.getDisplayState()).toEqual('failed');
      });
    });


    describe('loading job', function() {
      var job;
      it('should find job by message id', function() {
        job = SendJob.getByMessageId('msgIdOfKey1');
        expect(job).toBeDefined();
        expect(job.id).toEqual('key1');
        expect(job.scheduledAt).toEqual(jasmine.any(Date));
        expect(job.scheduledAt.isValid).toBeDefined();
      });
    });

    describe('isChangeable', function() {
      it('should be changeable if new', function() {
        var job = new SendJob();
        expect(job.isChangeable()).toBe(true);
      });

      it('should be changeable if scheduled', function() {
        var job = new SendJob({state: 'scheduled'});
        expect(job.isChangeable()).toBe(true);
      });

      it('should NOT be changeable if processing', function() {
        var job = new SendJob({state: 'queued'});
        expect(job.isChangeable()).toBe(false);
      });
    });
  });

  describe('Snippet', function() {
    var Snippet;
    var testData = [
      {
        id: 'key1',
        name: 'nameOfKey1',
        createdAt: "2020-08-30T10:20:09.407Z",
        updatedAt: "2020-08-30T10:20:09.407Z",
        subject: 'test1',
        body: 'hello body1 how are you test2?'
      },
      {
        id: 'key2',
        name: 'nameOfKey2',
        createdAt: "2020-01-01T10:20:09.407Z",
        updatedAt: "2020-01-01T10:20:09.407Z",
        subject: 'test2',
        body: 'hi body2, I am great test1!'
      }
    ];

    beforeEach(inject(function(_Snippet_) {
      Snippet = _Snippet_;
    }));

    beforeEach(function() {
      expect(Snippet.getCount()).toEqual(0);
      $httpBackend.expectGET('/api/snippet').respond(testData);
      Snippet.loadAll();
      $httpBackend.flush();
      expect(Snippet.getCount()).toEqual(2);
    });

    addCommonModelTests('Snippet');

    it('should not update body, subject, name from put', function() {
      var snippet = Snippet.getById('key1');
      snippet.name = 'newname';
      snippet.subject = 'newsubject';
      snippet.body = 'newbody';
      $httpBackend.expectPOST('/api/snippet/key1').respond(testData[0]);
      snippet.put();
      $httpBackend.flush();
      expect(snippet.name).toEqual('newname');
      expect(snippet.subject).toEqual('newsubject');
      expect(snippet.body).toEqual('newbody');
    });

    describe('getByKeyword', function() {

      function getIdsByKeyword(keywords) {
        return Snippet.getByKeywords(keywords).map(function(snippet) {
          return snippet.id;
        });
      }

      it('should find snippets by text', function() {
        expect(getIdsByKeyword('hello HOW')).toEqual(['key1']);
        expect(getIdsByKeyword('test2')).toEqual(['key2', 'key1']);
        expect(getIdsByKeyword('test1')).toEqual(['key1', 'key2']);
      });

      it('should return all for empty input', function() {
        expect(getIdsByKeyword('')).toEqual(['key1', 'key2']);
      });

      it('should rank by usageCnt', function() {
        var snippet1 = Snippet.getById('key1');
        var snippet2 = Snippet.getById('key2');
        snippet2.usageCnt = 1;
        expect(getIdsByKeyword('name')).toEqual(['key2', 'key1']);
        snippet1.usageCnt = 2;
        expect(getIdsByKeyword('name')).toEqual(['key1', 'key2']);
      });

      it('should rank by field priority first', function() {
        var snippet1 = Snippet.getById('key1');
        snippet1.body += ' Key2';
        snippet1.usageCnt = 100;
        expect(getIdsByKeyword('Key2')).toEqual(['key2', 'key1']);
      });

    });
  });
});

describe('relativeTimesStore', function() {
  beforeEach(module('sndlatr.scheduler'));

  var localStore;
  beforeEach(module(function($provide) {
    localStore = {};
    $provide.value('localStore', localStore)
  }));

  var store;
  beforeEach(inject(function(relativeTimesStore) {
    store = relativeTimesStore;
  }));

  it('should order recent items by usage count', function() {
    store.add('in 2 days');
    store.add('tomorrow');
    store.add('tomorrow');
    expect(store.getSorted()).toEqual(['tomorrow', 'in 2 days']);
    store.add('in 2 days');
    store.add('in 2 days');
    expect(store.getSorted()).toEqual(['in 2 days', 'tomorrow']);
  });

  it('should not store more than STORAGE_LIMIT ites', function() {
    for (var i = 1; i <= 110; ++i) {
      store.add('in ' + i + ' days');
    }
    store.add('tomorrow');
    store.add('tomorrow');
    var items = store.getSorted();
    expect(items.length).toEqual(store.STORAGE_LIMIT);
    expect(items).toContain('tomorrow');
  });

  it('should rank very old items after new ones', function() {
    store.add('tomorrow');
    var old = Date.create('1 year ago');
    // this is a bit hacky, we mock create to mock now() for lastTimeUsed.
    var nowSpy = spyOn(Date, 'create').andReturn(old);
    store.add('in 2 days');
    store.add('in 2 days');
    nowSpy.reset();
    expect(store.getSorted()).toEqual(['tomorrow', 'in 2 days']);
  });


});
