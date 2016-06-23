'use strict';

describe('gmailEvents with fake doc', function() {
  var scope, doc, win;

  // load the controller's module
  beforeEach(module('gmail.core'));

  beforeEach(module(function($provide) {
    doc = angular.element('<div></div>');
    doc[0].location = {
      hash: ''
    };
    $provide.value('$document', doc);
  }));

  beforeEach(inject(function(gmailEvents, $window) {
    scope = gmailEvents;
    win = angular.element($window);
  }));

  function simulateLocationHash(hash) {
    doc[0].location.hash = hash;
    win.triggerHandler('popstate');
  }

  describe('popstate watcher', function() {

    it('should update active compose ids on url changes', function() {
      expect(scope.composeMessageIds).toEqual([]);
      simulateLocationHash('#drafts?compose=new');
      expect(scope.composeMessageIds).toEqual(['new']);
      simulateLocationHash('#inbox?compose=1409b914640b7e28%2Cnew');
      expect(scope.composeMessageIds).toEqual(['1409b914640b7e28', 'new']);
      simulateLocationHash('#inbox');
      expect(scope.composeMessageIds).toEqual([]);
    });

    it('should match path and page', function() {
      expect(scope.pagePath).toEqual('');
      simulateLocationHash('#drafts?compose=new');
      expect(scope.threadListOffset).toEqual(0);
      expect(scope.pagePath).toEqual('drafts');

      simulateLocationHash('#drafts/p2');
      expect(scope.pagePath).toEqual('drafts');
      expect(scope.threadListOffset).toEqual(50);

      simulateLocationHash('#circle/foo bar?p3');
      expect(scope.pagePath).toEqual('circle/foo bar');
      expect(scope.threadListOffset).toEqual(0);

      simulateLocationHash('#circle/foo bar/p4?p3');
      expect(scope.threadListOffset).toEqual(150);
    });

    it('should match thread id', function() {
      expect(scope.currentThreadId).toBe(null);
      simulateLocationHash('#label/mylabel/140fa73f9dc25008');
      expect(scope.currentThreadId).toBe('140fa73f9dc25008');
      simulateLocationHash('#label/mylabel/140fa73f9dc25008?compose=new');
      expect(scope.currentThreadId).toBe('140fa73f9dc25008');
      simulateLocationHash('#nothread/12345678g');
      expect(scope.currentThreadId).toBe(null);
      simulateLocationHash('#inbox/12345678');
      expect(scope.currentThreadId).toBe('12345678');
    });
  });
});

describe('gmailEvents', function() {
  var scope, body;

  // load the controller's module
  beforeEach(module('gmail.core'));


  var VIEW_DATA = [
    ["tb", 0, [
      ["thread_id", "vd_message_id", "vd_message_id", 1, 0,
        ["^all", "^f", "^i", "^iim", "^io_im", "^io_imc3", "^io_lr", "^o", "^r"
        ], [],
        "entwurf",
        "&raquo;&nbsp;", "tsubject",
        "tbody",
        0, "", "", "16. Sep.", "16. September 2013 15:00", 1379402445657000, ,
        [], , 0, [], , [], , "1", [1], , "", , , , 0, 0]
    ]]
  ];
  beforeEach(inject(function($window, $document) {
    $window.VIEW_DATA = VIEW_DATA;
    body = $document.find('body');
  }));

  beforeEach(inject(function(gmailEvents) {
    scope = gmailEvents
  }));

  afterEach(inject(function($window) {
    delete $window.VIEW_DATA;
  }));

  function triggerAnimation(name) {
    var target = angular.element('<div></div>');
    body.append(target);
    var ev =  new Event('webkitAnimationStart');
    ev.animationName = name;
    target[0].dispatchEvent(ev);
    ev =  new Event('animationstart');
    ev.animationName = name;
    target[0].dispatchEvent(ev);
    target.remove();
  }

  it('should fire compose when compose animation starts', function() {
    var spy = jasmine.createSpy('composeSpy');
    scope.$on('gm:compose', spy);
    triggerAnimation('wbDomInsertedCompose');
    expect(spy).toHaveBeenCalled();
  });


  function tmsg(messageId) {
    return {messageId: messageId};
  }

  function tmsgs(args) {
    return [].map.call(arguments, function(id) {
      return tmsg(id);
    });
  }

  function openPath(path) {
    scope.pagePath = path;
    scope.$digest();
  }

  describe('thread list caching', function() {
    var inboxMails;
    beforeEach(function() {
      scope.pagePath = 'inbox';
      scope.$digest();
      inboxMails = tmsgs('msg1', 'msg2');
      scope.threadListMails = inboxMails;
      scope.$digest();
    });


    it('should backup and restore page mail lists', function() {
      openPath('drafts');
      expect(scope.threadListMails).toEqual([]);
      var draftMails = tmsgs('draft1', 'draft2');
      scope.threadListMails.push.apply(scope.threadListMails, draftMails);
      scope.$digest();
      openPath('inbox');
      expect(scope.threadListMails).toEqual(inboxMails);
      openPath('drafts');
      expect(scope.threadListMails).toEqual(draftMails);

    });
  });

  describe('VIEW_DATA', function() {

    it('should parse view data', function() {
      expect(scope.threadListMails).toEqual([]);
      openPath('inbox');
      expect(scope.threadListMails.length).toEqual(1);
      var mail = scope.threadListMails[0];
      expect(mail.messageId).toEqual('vd_message_id');
    });

  });

  describe('xhr events', function() {

    var xhrMonitor;
    beforeEach(inject(function(gmailXhrDecoder, gmailXhrMonitor) {
      xhrMonitor = gmailXhrMonitor;
    }));

    it('should detect message send event', function() {
      var spy = jasmine.createSpy('send spy');
      scope.$on('gm:sendMail', spy);
      xhrMonitor.$simulateLoadStart({
        url: '?act=sm',
        requestBody: 'composeid=tcompose_id&draft=tmessage_id&rm=tthread_id'});
      expect(spy).toHaveBeenCalled();
      expect(spy.mostRecentCall.args[1]).toEqual({messageId: 'tmessage_id',
        threadId: 'tthread_id', composeId: 'tcompose_id'});
    });

    it('should detect message save event', function() {
      var spy = jasmine.createSpy('save spy');
      scope.$on('gm:savedMail', spy);

      var response = JSON.stringify([
        [
          ["a", 1, "Ihre Nachricht wurde gespeichert.",
            ["test_message_id", 0, 0, [
              []
            ] ] ]
        ]
      ]);
      xhrMonitor.$simulateLoad({
        url: '?act=sd',
        data: response,
        headers: {'content-type': 'application/json'},
        requestBody: 'composeid=tcompose_id'});
      expect(spy).toHaveBeenCalled();
      expect(spy.mostRecentCall.args[1]).toEqual({messageId: 'test_message_id',
        composeId: 'tcompose_id'});
    });

    describe('proxessXhrMessage', function() {
      it('should process tb messages', function() {
        scope.threadListMails = [null, null, null, tmsg('leaveMe')];
        var mails = [
          tmsg('id0'), tmsg('id1')
        ];
        var msg = {type: 'tb', start: 1, mails: mails};
        scope.processXhrMessage(msg);
        expect(scope.threadListMails.slice(1, 3)).toEqual(mails);
        expect(scope.threadListMails[3]).toEqual(tmsg('leaveMe'));
      });

      describe('stu messages', function() {
        it('should old message Ids', function() {
          scope.threadListMails = [
            tmsg('leaveMe'), tmsg('replaceMe'), tmsg('leaveMe2')
          ];
          scope.processXhrMessage({type: 'stu',
            mails: [tmsg('new1'), tmsg('new2')],
            oldMessageIds: ['replaceMe']});
          expect(scope.threadListMails).toEqual(
            [tmsg('new1'), tmsg('new2'), tmsg('leaveMe'), tmsg('leaveMe2')]);
        });
      });
    });

    describe('thread lists', function() {

      var decoder;
      beforeEach(inject(function(gmailXhrDecoder) {
        decoder = gmailXhrDecoder;
        spyOn(decoder, 'parseJson');
        spyOn(decoder, 'parseChunked');
      }));


      describe('delete messages', function() {
        var deleteSpy;
        beforeEach(function() {
          deleteSpy = jasmine.createSpy('delete spy');
          scope.$on('gm:deleteMails', deleteSpy);
        });

        it('should detect message deletes', function() {
          scope.threadListMails = [tmsg('123'), tmsg('456'), tmsg('mailX')];
          xhrMonitor.$simulateLoadStart({
            url: '?act=tr',
            requestBody: 't=123&t=456'});
          expect(deleteSpy).toHaveBeenCalledWith(jasmine.any(Object),
            ['123', '456']);
          expect(scope.threadListMails).toEqual([tmsg('mailX')]);
        });

        it('should detect draft delete', function() {
          var deleteSpy = jasmine.createSpy('delete spy');
          scope.$on('gm:deleteMails', deleteSpy);
          xhrMonitor.$simulateLoadStart({
            url: '?act=dr',
            requestBody: 'm=123'});
          expect(deleteSpy).toHaveBeenCalledWith(jasmine.any(Object), ['123']);
        });
      });


      describe('sto that match last delete ids', function() {
        var origMails = [tmsg('mail1'), tmsg('mail2'), tmsg('mail3')]
        beforeEach(function() {
          scope.threadListMails = angular.copy(origMails);
          xhrMonitor.$simulateLoadStart({
            url: '?act=tr',
            requestBody: 't=mail1&t=mail3'});
        });
        it('should restore old mails', function() {
          scope.processXhrMessage({type: 'stu',
            mails: [tmsg('mail1'), tmsg('mail3')]});
          expect(scope.threadListMails).toEqual(origMails)
        });

        it('should not restore mails if ids do not match', function() {
          scope.processXhrMessage({type: 'stu',
            mails: [tmsg('mail1'), tmsg('mailX')]});

          expect(scope.threadListMails).toEqual(tmsgs('mail1', 'mailX',
            'mail2'));
        });
      });

      it('should process json messages', function() {
        decoder.parseJson.andReturn(['msg1', 'msg2']);
        spyOn(scope, 'processXhrMessage');

        xhrMonitor.$simulateLoad({
          url: '?view=tl&search=drafts',
          headers: {'content-type': 'application/json'}});
        expect(decoder.parseJson).toHaveBeenCalled();
        expect(scope.processXhrMessage).toHaveBeenCalledWith('msg1');
        expect(scope.processXhrMessage).toHaveBeenCalledWith('msg2');
      });

      it('should process chunked messages', function() {
        decoder.parseChunked.andReturn(['msg1', 'msg2']);
        spyOn(scope, 'processXhrMessage');

        xhrMonitor.$simulateLoad({
          url: '?view=tl&search=drafts',
          headers: {'content-type': 'text/html'}});
        expect(decoder.parseChunked).toHaveBeenCalled();
        expect(scope.processXhrMessage).toHaveBeenCalledWith('msg1');
        expect(scope.processXhrMessage).toHaveBeenCalledWith('msg2');
      });
    });

  });
});


describe('wrappedViewProvider', function() {
  beforeEach(module('gmail.core'));

  var wrappedView;

  beforeEach(module(function(wrappedViewProvider) {
    wrappedViewProvider.register('FooView', function($scope) {
      $scope.value = 'foo';
    });
    wrappedViewProvider.register('LocalView', function($scope, mylocal) {
      $scope.value = mylocal;
    });
  }));

  beforeEach(inject(function(_wrappedView_) {
    wrappedView = _wrappedView_;
  }));

  it('should instanciate simple view', function() {
    var scope = {};
    wrappedView('FooView', {$scope: scope});
    expect(scope.value).toEqual('foo');
  });

  it('should inject locals to view', function() {
    var scope = {};
    wrappedView('LocalView', {$scope: scope, mylocal: 'test'});
    expect(scope.value).toEqual('test');
  });
});


describe('gmail $location', function() {
  var $location, doc;

  beforeEach(module('gmail.core'));

  beforeEach(module(function($provide) {
    doc = angular.element('<div></div>');
    doc[0].location = {
      hash: ''
    };
    $provide.value('$document', doc);
  }));

  function setHash(hash) {
    doc[0].location.hash = hash;
  }

  beforeEach(inject(function(_$location_) {
    $location = _$location_;
  }));

  it('should get path from hash', function() {
    setHash('#starred');
    expect($location.path()).toEqual('starred');
    setHash('#label/sh%2Fin');
    expect($location.path()).toEqual('label/sh%2Fin');
    setHash('#drafts?compose=140a57f30d21947a');
    expect($location.path()).toEqual('drafts');
  });

});
