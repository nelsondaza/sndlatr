describe('editViews', function() {
  var target;

  beforeEach(function() {
    target = angular.element('<div>' +
      '<input type="hidden" name="draft" value="undefined">' +
      '<input type="hidden" name="composeid" value="tcomposeId">' +
      '<input type="hidden" name="subject" value="hello world">' +
      '<input type="hidden" name="to" value="mb@example.com">' +
      '<input type="hidden" name="to" value="other@example.com">' +
      '<div class="Am" contenteditable="true">test <b>body</b></div>' +
      '<input type="text" name="subjectbox" value="input subject"/>' +
      '<div class="Ha">delete</div>' +
      '<table>' +
      '<tr>' +
      '<td class="aDh toolbar"></td>' +
      '</tr>' +
      '</table></div>')[0];
  });
  describe('wrappedView: compose', function() {
    beforeEach(module('gmail.ui', 'views/draftSendLater.html',
      'views/sendLaterDropdown.html'));

    beforeEach(module(function($controllerProvider) {
      // we test controller separately
      $controllerProvider.register('ComposeCtrl', angular.noop);
    }));

    var view, scope, gmailEvents, $timeout;
    beforeEach(inject(function($rootScope, wrappedView, _gmailEvents_,
                               _$timeout_) {
      scope = $rootScope.$new(true);
      gmailEvents = _gmailEvents_;
      $timeout = _$timeout_;
      gmailEvents.composeMessageIds = ['new'];
      view = wrappedView('ComposeView', {$scope: scope, target: target});
      scope.$digest();
      $timeout.flush();
    }));

    it('should initialize messageId from form', function() {
      expect(scope.messageId).toEqual('new');
      expect(scope.composeId).toEqual('tcomposeId');
    });


    it('should destroy scope when no longer active', function() {
      gmailEvents.composeMessageIds = [];
      scope.$digest();
      $timeout.flush();
      expect(scope.$$destroyed).toBe(true);
    });

    it('should not destroy when in document', inject(function($document) {
      spyOn($document[0], 'contains').andReturn(true);
      gmailEvents.composeMessageIds = [];
      scope.$digest();
      $timeout.flush();
      expect(scope.$$destroyed).toBe(false);
    }));

    it('should update scope from form fields', function() {
      scope.updateScope();
      expect(scope.to).toEqual(['mb@example.com', 'other@example.com']);
      expect(scope.subject).toEqual('hello world');
      expect(scope.body).toEqual('test <b>body</b>');
    });

    it('should get body html', function() {
      expect(scope.getBody()).toEqual('test <b>body</b>');
    });

    it('should append body html', function() {
      scope.setBody('new', true);
      expect(scope.getBody()).toEqual('test <b>body</b><br>new');
    });

    it('should replace body html', function() {
      scope.setBody('new', false);
      expect(scope.getBody()).toEqual('new');
    });

    it('should get subject input', function() {
      expect(scope.getInputSubject()).toEqual('input subject');
    });

    it('should append subject input', function() {
      scope.setSubject('new', true);
      expect(scope.getInputSubject()).toEqual('input subject new');
    });

    it('should replace subject input', function() {
      scope.setSubject('new');
      expect(scope.getInputSubject()).toEqual('new');
    });
  });

  describe('wrappedView: ReplyView', function() {
    beforeEach(module('gmail.ui', 'views/draftSendLater.html',
      'views/sendLaterDropdown.html'));

    beforeEach(module(function($controllerProvider) {
      // we test controller separately
      $controllerProvider.register('ReplyCtrl', angular.noop);
    }));

    var view, scope, gmailEvents, $timeout;
    beforeEach(inject(function($rootScope, wrappedView, _gmailEvents_,
                               _$timeout_) {
      scope = $rootScope.$new(true);
      gmailEvents = _gmailEvents_;
      $timeout = _$timeout_;
      view = wrappedView('ReplyView', {$scope: scope, target: target});
      scope.$digest()
    }));

    it('should get messageId from form', function() {
      expect(scope.messageId).toEqual('new');
      expect(scope.composeId).toEqual('tcomposeId');
    });

    it('should destroy when thread id changes', function() {
      gmailEvents.currentThreadId = 'newId';
      scope.$digest();
      expect(scope.$$destroyed).toBe(true);
    })

  });
});

describe('wrappedView: ThreadListView', function() {
  beforeEach(module('gmail.ui', 'views/draftListTime.html'));

  var view, scope, target, gmailEvents, $timeout;
  var timeCol, origEl, injectedEl, childScope, $rootScope;
  beforeEach(inject(function(_$rootScope_, wrappedView, _gmailEvents_,
                             _$timeout_) {
    $rootScope = _$rootScope_;
    scope = $rootScope.$new(true);
    target = angular.element('<div>' +
      '<table>' +
      '<tr class="yO">' +
      '<td class="another">irrelevantcol</td>' +
      '<td class="xW xY"><span>origTest</span></td>' +
      '</tr>' +
      '<tr class="yO">' +
      '<td class="another">irrelevantcol</td>' +
      '<td class="xW xY"><span>origTest1</span></td>' +
      '</tr>' +
      '</table>' +
      '</div>');
    $timeout = _$timeout_;
    gmailEvents = _gmailEvents_;
    gmailEvents.threadListMails = [
      {},
      {}
    ];
    view = wrappedView('ThreadListView', {$scope: scope, target: target[0]});
    scope.$digest();
    $timeout.flush();
    timeCol = target.find('td').eq(1);
    origEl = timeCol.children().eq(0);
    injectedEl = timeCol.children().eq(1);
    childScope = injectedEl.scope();
    expect(childScope).toBeTruthy();
  }));


  it('should leave origElement in dom', function() {
    expect(origEl.text()).toEqual('origTest');
  });

  it('should update on threadlistupdate event', function() {
    $rootScope.$broadcast('gm:threadlistupdate');
    $timeout.flush();
    $timeout.verifyNoPendingTasks();
  });

  it('should update when threadListMails change', function() {
    gmailEvents.threadListMails[0] = {messageId: 'hihi'};
    scope.$digest();
    $timeout.flush();
    $timeout.verifyNoPendingTasks();
  });

  it('showOrigEl change should hide/show original elements', function() {
    childScope.origElShown = false;
    childScope.$digest();
    expect(origEl).toBeHidden();
    childScope.origElShown = true;
    childScope.$digest();
    expect(origEl).toBeDisplayed();
  });


});

describe('ConversationCtrl', function() {
  var scope, RemindJob, ctrl, conversationStore, $timeout;
  beforeEach(module('gmail.ui', 'sl.test.scheduler'));

  beforeEach(inject(function($rootScope, _RemindJob_, _conversationStore_,
                             _$timeout_, $controller) {
    $timeout = _$timeout_;
    conversationStore = _conversationStore_;
    $rootScope.isInitialized = true;
    RemindJob = _RemindJob_;
    scope = $rootScope.$new(true);
    conversationStore.addConversation('msg1', []);
    conversationStore.addMessage({messageId: 'msg1'});
    conversationStore.addMessage({origMessageId: 'msg1', messageId: 'msg2'});
    var conversation = conversationStore.getConversation('msg1');
    ctrl = $controller('ConversationCtrl', {$scope: scope,
      conversation: conversation});
    scope.subject = 'testSubject';
    scope.$digest();
  }));

  it('should assign job to scope', function() {
    expect(scope.job).toEqual(jasmine.any(RemindJob));
    expect(scope.job.onlyIfNoreply).toBe(false);
  });


  afterEach(function() {
    $timeout.verifyNoPendingTasks();
  });

  describe('when message ids change', function() {
    beforeEach(function() {
      spyOn(scope.job, 'checkReply');
      conversationStore.addMessage({origMessageId: 'msg1', messageId: 'new'});
      scope.$digest();
    });

    it('should call job.checkReply', function() {
      expect(scope.job.checkReply).toHaveBeenCalledWith(ctrl.conversation);
    });
  });

  it('should load conversation', function() {
    expect(ctrl.conversation.getMessageIds()).toEqual(['msg1', 'msg2']);
  });

  it('should not save job without date', function() {
    scope.job.onlyIfNoreply = true;
    scope.$digest();
    expect(RemindJob.getCount()).toEqual(0);
  });

  it('should auto save job', inject(function(gmailNotify) {
    spyOn(gmailNotify, 'message');
    scope.job.scheduledAt = Date.create('tomorrow');
    scope.$digest();
    // throttled save
    expect(RemindJob.getCount()).toEqual(0);
    $timeout.flush();
    expect(RemindJob.getCount()).toEqual(1);
    expect(gmailNotify.message.callCount).toEqual(2);
    var job = scope.job;
    expect(job.subject).toEqual('testSubject');
    expect(job.knownMessageIds).toEqual(['msg1', 'msg2']);
  }));

  describe('reEnableJob', function() {
    beforeEach(function() {
      scope.job.scheduledAt = Date.create('tomorrow');
      scope.$digest();
      scope.job.state = 'disabled';
    });

    afterEach(function() {
      $timeout.flush();
    });

    describe('old job', function() {
      var oldJob;
      beforeEach(function() {
        oldJob = scope.job;
        spyOn(scope.job, 'delete');
      });
      afterEach(function() {
        expect(scope.job).not.toBe(oldJob);
        expect(scope.job.state).toBeUndefined();
        expect(scope.job.scheduledAt).toEqual(oldJob.scheduledAt);
        expect(scope.job.threadId).toEqual(oldJob.threadId);
        expect(scope.job.onlyIfNoreply).toEqual(oldJob.onlyIfNoreply);
      });

      it('should delete in disabled state', function() {
        scope.reEnableJob();
        expect(oldJob.delete).toHaveBeenCalled();
      });

      it('should forget in done state', function() {
        spyOn(scope.job, 'forget');
        scope.job.state = 'done';
        scope.reEnableJob();
        expect(oldJob.delete).not.toHaveBeenCalled();
        expect(oldJob.forget).toHaveBeenCalled();
      });
    });

    describe('triggers', function() {
      beforeEach(function() {
        spyOn(scope, 'reEnableJob');
        scope.job.onlyIfNoreply = true;
      });

      it('should be called when disabled job changes', function() {
        scope.$digest();
        expect(scope.reEnableJob).toHaveBeenCalled();
      });

      it('should be called when done job changes', function() {
        scope.job.state = 'done';
        scope.$digest();
        expect(scope.reEnableJob).toHaveBeenCalled();
      });

      it('should not be called when non-disabled job changes', function() {
        scope.job.state = 'scheduled';
        scope.$digest();
        expect(scope.reEnableJob).not.toHaveBeenCalled();
      });
    });
  });

});

describe('ComposeCtrl', function() {
  var scope, SendJob, baseSendSpy;
  beforeEach(module('gmail.ui', 'sl.test.scheduler'));


  beforeEach(inject(function($controller, $rootScope, _SendJob_, $q) {
    SendJob = _SendJob_;
    scope = $rootScope.$new(true);
    scope.close = jasmine.createSpy('close spy');
    scope.job = new SendJob({messageId: 'msgId', id: '123'});
    baseSendSpy = jasmine.createSpy('baseSendSpy').andReturn($q.when(true));
    scope.updateScope = angular.noop;
    scope.sendLater = baseSendSpy;
    $controller('ComposeCtrl', {$scope: scope});
    scope.$digest();
  }));

  it('should close spy on send later', function() {
    scope.sendLater(Date.create());
    scope.$digest();
    expect(scope.close).toHaveBeenCalled();
    expect(baseSendSpy).toHaveBeenCalled();
  });
});

describe('ReplyCtrl', function() {
  beforeEach(module('gmail.ui', 'sl.test.scheduler'));
  var scope, SendJob;

  beforeEach(inject(function($controller, $rootScope, _SendJob_) {
    SendJob = _SendJob_;
    scope = $rootScope.$new(true);
    scope.job = new SendJob();
    scope.updateScope = angular.noop;
    $controller('ReplyCtrl', {$scope: scope});
    scope.$digest();
  }));

  it('should hide view when mail is sent', function() {
    scope.hide = jasmine.createSpy();
    scope.job.state = 'done';
    scope.$digest();
    expect(scope.hide).toHaveBeenCalled();
  });


});

describe('BaseEditCtrl', function() {
  var scope, SendJob;
  beforeEach(module('gmail.ui', 'sl.test.scheduler'));

  beforeEach(inject(function($controller, $rootScope, _SendJob_) {
    $rootScope.isInitialized = true;
    SendJob = _SendJob_;
    scope = $rootScope.$new(true);
    scope.composeId = 'tcomposeId';
    scope.to = ['john@example.com'];
    scope.bcc = [];
    scope.cc = [];
    $controller('BaseEditCtrl', {$scope: scope});
    scope.$digest();
    scope.updateScope = angular.noop;
  }));

  describe('without existing job', function() {
    beforeEach(function() {
      scope.messageId = 'msgId';
      scope.$digest();
    });

    it('should create new job for unknown message ids', function() {
      expect(scope.job.messageId).toEqual('msgId');
      // not saved
      expect(SendJob.getCount()).toEqual(0);
    });


    it('should update messageId on mail save', function() {
      scope.$broadcast('gm:savedMail', {composeId: 'tcomposeId',
        messageId: '1234'});
      expect(scope.messageId).toEqual('1234');
    });
  });

  describe('without message id', function() {
    beforeEach(function() {
      scope.messageId = 'new';
      scope.triggerSave = jasmine.createSpy('trigger save');
      scope.$digest();
    });

    it('should triggerSave and wait for message id on sendLater',
      inject(function(gmailNotify, $timeout) {
        spyOn(gmailNotify, 'message');
        scope.sendLater(Date.create('tomorrow'));
        scope.$digest();
        expect(scope.triggerSave).toHaveBeenCalled();
        expect(SendJob.getCount()).toEqual(0);
        expect(gmailNotify.message).toHaveBeenCalledWith('saving...');

        // when saved...
        scope.messageId = 'savedId';
        scope.$digest();
        expect(SendJob.getCount()).toEqual(1);
        // real message
        $timeout.flush();
        expect(gmailNotify.message.callCount).toEqual(3);
        expect(gmailNotify.message).toHaveBeenCalledWith('scheduling mail...');
        // spyOn(gmailNotify, 'message');
      }));
  });

  describe('validate receivers', function() {
    var openSpy;
    beforeEach(inject(function($modal) {
      openSpy = spyOn($modal, 'open');
    }));

    it('test setup should have valid receivers', function() {
      expect(scope.validateReceivers()).toBe(true);
    });

    it('no receivers should be invalid', function() {
      scope.to = [];
      expect(scope.validateReceivers()).toBe(false);
      expect(openSpy).toHaveBeenCalled();
      expect(openSpy.mostRecentCall.args[0].scope.hasAny).toBe(false);
    });

    function verifyInvalidDialog(mails) {
      expect(scope.validateReceivers()).toBe(false);
      expect(openSpy.mostRecentCall.args[0].scope.invalid)
        .toEqual(mails);
    }

    it('invalid bcc should be invalid', function() {
      scope.bcc = ['invalid@localhost'];
      verifyInvalidDialog(scope.bcc);
    });


    it('invalid cc should be invalid', function() {
      scope.cc = ['invalid@localhost'];
      verifyInvalidDialog(scope.cc);
    });

    it('invalid to should be invalid', function() {
      scope.to = ['invalid@localhost'];
      verifyInvalidDialog(scope.to);
    });
  });

  describe('with existing job for message id', function() {
    var job;
    beforeEach(function() {
      job = new SendJob({messageId: 'msgId', id: '123'});
      job.put();
      scope.messageId = 'msgId';
      scope.$digest();
    });

    describe('cancelJob', function() {
      it('should delete job', function() {
        expect(SendJob.getByMessageId('msgId')).toBeTruthy();
        scope.cancelJob();
        expect(scope.job).not.toEqual(job);
        expect(SendJob.getByMessageId('msgId')).toBeFalsy();
      });
    });

    it('should load job', function() {
      expect(scope.job).toEqual(job);
    });

    it('should update job when messageId changes', function() {
      scope.messageId = 'new';
      scope.$digest();
      expect(job.messageId).toEqual('new');
    });


    it('should save job on sendLater', inject(function(gmailNotify, $timeout) {
      spyOn(gmailNotify, 'message');
      scope.subject = 'testsubject';
      var date = new Date.create('tomorrow');
      scope.sendLater(date);
      scope.$digest();
      expect(SendJob.getCount()).toEqual(1);
      expect(scope.job.scheduledAt).toEqual(date);
      expect(scope.job.subject).toEqual('testsubject');
      $timeout.flush();
      expect(gmailNotify.message).toHaveBeenCalled()
    }));

  });
});

describe('gmailEventHander', function() {
  beforeEach(module('gmail.ui', 'sl.test.scheduler'));

  var gmailEvents, SendJob;
  beforeEach(inject(function(gmailEventHandler, _gmailEvents_, _SendJob_) {
    SendJob = _SendJob_;
    gmailEvents = _gmailEvents_;
    ['job1', 'job2', 'job3'].forEach(function(msgId) {
      new SendJob({messageId: msgId}).put();
    });
    gmailEventHandler.start();
  }));

  function verifyExists(msgId) {
    expect(SendJob.getByMessageId(msgId)).toBeTruthy();
  }

  function verifyDeleted(msgId) {
    expect(SendJob.getByMessageId(msgId)).toBeFalsy();
  }

  it('should delete jobs for deleted mails', function() {
    gmailEvents.$broadcast('gm:deleteMails', ['job1', 'job3']);
    verifyExists('job2');
    verifyDeleted('job1');
    verifyDeleted('job3');
  });

  it('should delete jobs for send mail', function() {
    gmailEvents.$broadcast('gm:sendMail', {messageId: 'job1'});
    verifyExists('job2');
    verifyExists('job3');
    verifyDeleted('job1');
  });
});

describe('gmailNotify', function() {
  beforeEach(module('gmail.ui'));

  var notify, fakeContainer, gmailEvents, $rootScope, $timeout;
  beforeEach(inject(function(gmailNotify, _gmailEvents_, _$rootScope_,
                             _$timeout_) {
    fakeContainer = angular.element('<div class="b8 UC"><div class="vh"></div></div>');
    angular.element(document.body).append(fakeContainer);
    notify = gmailNotify;
    gmailEvents = _gmailEvents_;
    expect(notify).toBeTruthy();
    $rootScope = _$rootScope_;
    $timeout = _$timeout_;
  }));

  afterEach(function() {
    fakeContainer.remove();
    $timeout.verifyNoPendingTasks();
  });

  function verifyHidden() {
    expect(fakeContainer.css('visibility')).toBe('hidden');
    expect(fakeContainer.text()).toBe('');
  }

  function verifyShown(msg) {
    expect(fakeContainer.text()).toBe(msg);
    expect(fakeContainer.css('visibility')).toBe('visible');
  }

  describe('timer hide', function() {

    it('should show and auto hide element', function() {
      notify.message('auto hide', 1000);
      $rootScope.$digest();
      verifyShown('auto hide');
      $timeout.flush(1000);
      verifyHidden();
    })
  });

  describe('message', function() {

    beforeEach(function() {
      notify.message('hello test');
      $rootScope.$digest();
    });

    it('should show text in element', function() {
      verifyShown('hello test');
    });

    it('should hide when url changes', function() {
      gmailEvents.absUrl = 'newUrl';
      gmailEvents.$digest();
      verifyHidden();
    });
  });
});

describe('wrappedView: ConversationView', function() {
  beforeEach(module('gmail.ui', 'views/remindToolbar.html',
    'views/remindBox.html'));
  var ctrlSpy;

  beforeEach(module(function($controllerProvider) {
    // we test controller separately
    ctrlSpy = jasmine.createSpy('ctrl spy');
    $controllerProvider.register('ConversationCtrl', function(conversation) {
      ctrlSpy(conversation);
    });
  }));

  var scope, gmailEvents, view, targetToolbar, targetMain, conversationStore;
  var destroyScopeSpy;

  beforeEach(function() {
    targetMain = angular.element('<div><div class="hP">testSubject</div>' +
      '<div class="y3"><div class="adC"><div class="nH"></div></div></div>' +
      '</div>')[0];
    targetToolbar = angular.element('<div><div class="G-Ni"></div>' +
      '<div class="G-Ni"></div>' +
      '</div>')[0];
  });

  beforeEach(inject(function($rootScope, _gmailEvents_, _conversationStore_) {
    conversationStore = _conversationStore_;
    gmailEvents = _gmailEvents_;

    conversationStore.addConversation('msg1', []);
    conversationStore.addMessage({messageId: 'msg1'});
    gmailEvents.currentThreadId = 'msg1';
    scope = $rootScope.$new(true);

    destroyScopeSpy = jasmine.createSpy('destroy spy');
    scope.$on('$destroy', destroyScopeSpy);
  }));


  it('should destroy scope if there is not conversation after timeout',
    inject(function($timeout) {
      spyOn(conversationStore, 'getConversation').andCallThrough();
      gmailEvents.currentThreadId = 'unknown';
      createView();
      expect(conversationStore.getConversation)
        .toHaveBeenCalledWith('unknown');
      expect(destroyScopeSpy).not.toHaveBeenCalled();
      // should retry after timeout.
      $timeout.flush();
      expect(destroyScopeSpy).toHaveBeenCalled();
      expect(conversationStore.getConversation.callCount).toEqual(2);
    }));

  function createView() {
    inject(function(wrappedView) {
      view = wrappedView('ConversationView', {$scope: scope,
        targetToolbar: targetToolbar, targetMain: targetMain});
      scope.$digest();
    });
  }

  describe('with conversation', function() {
    beforeEach(createView);

    it('should assign subject to scope', function() {
      expect(scope.subject).toEqual('testSubject');
    });

    it('should load conversation', function() {
      expect(ctrlSpy).toHaveBeenCalledWith(
        conversationStore.getConversation('msg1'));
    });

    it('should destroy scope when currentThreadId changes', function() {
      gmailEvents.currentThreadId = null;
      scope.$digest();
      expect(destroyScopeSpy).toHaveBeenCalled();
    });

  });
});

