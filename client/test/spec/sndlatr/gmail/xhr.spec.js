describe('xhrPatcher', function() {
  beforeEach(module('gmail.xhr'));

  var patcher, TestXhr, xhr, openSpy, sendSpy, responseHeaders;
  beforeEach(inject(function(xhrPatcher) {
    responseHeaders = '';
    TestXhr = function() {
    };
    openSpy = jasmine.createSpy('open');
    sendSpy = jasmine.createSpy('send');
    // one spy for all instances, we use only one anyway
    TestXhr.prototype.open = openSpy;
    TestXhr.prototype.send = sendSpy;
    TestXhr.prototype.getAllResponseHeaders = function() {
      return responseHeaders;
    };
    TestXhr.prototype._listeners = {};
    TestXhr.prototype.addEventListener = function(ev, handler) {
      if (!this._listeners[ev]) this._listeners[ev] = [];
      this._listeners[ev].push(handler);
    };
    TestXhr.prototype.removeEventListener = function(ev, handler) {
      if (this._listeners[ev]) {
        var listeners = this._listeners[ev];
        var idx = listeners.indexOf(handler);
        if (idx >= 0) listeners.splice(idx, 1);
      }
    };

    TestXhr.prototype.fireListeners = function(ev) {
      var listeners = this._listeners[ev];
      if (listeners) {
        listeners.forEach(function(fn) {
          fn();
        });
      }
    };

    patcher = xhrPatcher(TestXhr);
    patcher.loadListener = jasmine.createSpy('load listener');
    patcher.loadStartListener = jasmine.createSpy('loadstart listener');
    xhr = new TestXhr();
  }));


  describe('TestXhr mock setup ', function() {
    it('should call listeners', function() {
      var loadSpy = jasmine.createSpy();
      var errorSpy = jasmine.createSpy();
      xhr.addEventListener('load', loadSpy);
      xhr.addEventListener('error', errorSpy);
      xhr.fireListeners('load');
      expect(loadSpy).toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();
      xhr.fireListeners('error');
      expect(errorSpy).toHaveBeenCalled();
    });

    it('should not call removed listeners', function() {
      var spy = jasmine.createSpy();
      xhr.addEventListener('load', spy);
      xhr.removeEventListener('load', spy);
      xhr.fireListeners('load');
      expect(spy).not.toHaveBeenCalled();
    });
  });

  it('open should call original open', function() {
    xhr.open('GET', '/url', true);
    expect(openSpy).toHaveBeenCalledWith('GET', '/url', true);
    expect(patcher.loadListener).not.toHaveBeenCalled();
    xhr.fireListeners('load');
    expect(patcher.loadListener).toHaveBeenCalledWith(
      {method: 'GET', url: '/url', headers: {}});

    // listener should be removed
    xhr.fireListeners('load');
    expect(patcher.loadListener.callCount).toEqual(1);
  });

  it('should trigger loadStartListener', function() {
    xhr.open('GET', '/url', true);
    xhr.fireListeners('loadstart');
    expect(patcher.loadStartListener).toHaveBeenCalledWith(
      {method: 'GET', url: '/url'});
  });

  it('should pass sent data to listener', function() {
    responseHeaders = 'Content-Type: text/html';
    xhr.open('GET', '/sendurl');
    xhr.send('hello send');
    xhr.fireListeners('loadstart');
    xhr.fireListeners('load');
    expect(patcher.loadListener).toHaveBeenCalledWith(
      {method: 'GET', url: '/sendurl', requestBody: 'hello send',
        headers: {'content-type': 'text/html'}});
    expect(sendSpy).toHaveBeenCalled();
  });
});

describe('gmailXhrMonitor test stub', function() {
  beforeEach(module('gmail.xhr'));

  var monitor;
  beforeEach(inject(function(gmailXhrMonitor) {
    monitor = gmailXhrMonitor;
  }));

  it('should fire listener', function() {
    monitor.loadListener = jasmine.createSpy();
    var req = {url: '/testurl'};
    monitor.$simulateLoad(req);
    expect(monitor.loadListener).toHaveBeenCalledWith(req);
  });
});

describe('BrowserChannelDecoder', function() {
  beforeEach(module('gmail.xhr'));

  var simpleTestData = '6\nhello_shouldnotappera';
  var multipleChunks = '7\n' +
    'hello\n' +
    '4\n' +
    'foo';

  var Decoder;
  beforeEach(inject(function(_BrowserChannelDecoder_) {
    Decoder = _BrowserChannelDecoder_;
  }));

  it('should decode simple chunk', function() {
    var decoder = new Decoder(simpleTestData);
    expect(decoder.nextChunk()).toEqual('\nhello');
  });

  it('should decode multiple chunks', function() {
    var decoder = new Decoder(multipleChunks);
    expect(decoder.nextChunk()).toEqual('\nhello\n');
    expect(decoder.nextChunk()).toEqual('\nfoo');
  })
});

describe('gmailXhrDecoder', function() {
  beforeEach(module('gmail.xhr'));
  var TEST_DATA_TB = ["tb", 50, [
    ["test_thread_id1", "test_message_id1", "1410d639cde05a65", 1, 0,
      ["^all", "^r"], [], "<font color=\"#DD4B39\">Entwurf</font>", "&nbsp;",
      "16", "", 0, "", "", "11. Sep.", "11. September 2013 16:18",
      1378909134948000, , [], , 0, [], , [], , , [0], ,
      "", , , , 0, 0],
    ["test_thread_id2", "test_message_id2", "1410d63896fc3e64", 1, 0,
      ["^all", "^r"], [], "<font color=\"#DD4B39\">Entwurf</font>", "&nbsp;",
      "(Kein Betreff)", "15", 0, "", "", "11. Sep.",
      "11. September 2013 16:18", 1378909128900000, , [], , 0, [],
      , [], , , [0], , "", , , , 0, 0]
  ]];
  var TEST_DATA_STU = ["stu", ["old_message_id", "old_message_id2"], [
    ["test_thread_id3",
      ["test_thread_id3", "test_message_id3", "1411172951e6a9fe", 1, 0,
        ["^all", "^r"]
        , []
        , "\u003cfont color\u003d\"#DD4B39\"\u003eEntwurf\u003c/font\u003e",
        "\u0026nbsp;", "16", "XXXX", 0, "", "", "11:13",
        "12. September 2013 11:13", 1378977224092000, , []
        , , 0, []
        , , []
        , , , [0]
        , , "", , , , 0, 0]
    ]
  ]];

  var TEST_DATA_EMPTY_STU = ["stu", ["141185da9d4ba90f"] , [] ];

  var TEST_DATA_MS = ["ms", "141c5545333e7dd5", "141c2ad0eae5aef0", 2,
    "Manuel Braun \u003csender@example.com\u003e", "Manuel Braun",
    "sender@example.com",
    1381995139000, "What's the manufacturer/model of TV you use?",
    ["BCCed", "^all", "^f", "^io_lr", "^o"]
    , 0, 0, "Re: vGet (Stream, Download, DLNA)", , "sender@example.com", 0,
    "09:32",
    "17. Okt.", 0, , , "", ["en"]
    , 0, "17. Oktober 2013 09:32", []
    , , , , 0, , , , 0, 1, "", "sender@example.com", [
      [] ,
      [
        ["Edson", "receiver@example.com"]
      ] ,
      [] ,
      [] ,
      [
        ["Edson", "receiver@example.com"]
      ] ,
      []
    ] , -1, , , , "w69b.com", , [] , [] , 0, ""];

  var TEST_DATA_CS = ["cs", "141cbd65b4679861", "141cbd69a1a124cc", 3, null,
    null, 1382788041097000, "141cbd69a1a124cc",
    ["141cbd65b4679861", "141cbd67ddf958e0", "141cbd69a1a124cc"], [], [], [
      ["141cbd65b4679861",
        ["^all", "^i", "^io_lr", "^o", "^smartlabel_personal"]],
      ["141cbd67ddf958e0", ["^all", "^f", "^io_lr", "^o"]],
      ["141cbd69a1a124cc",
        ["^all", "^i", "^iim", "^io_im", "^io_imc5", "^io_lr", "^o",
          "^smartlabel_personal"]]
    ], null, null, [], [
      ["mb@w69b.com", "mb@w69b.com"],
      ["Manuel Braun", "thembrown@gmail.com"]
    ], null, null, [], [], null, null, null, "hello conversation"];

  // for save message (act=sd)
  var TEST_DATA_A = ["a", 1, "Ihre Nachricht wurde gespeichert.",
    ["test_message_id", 0, 0, [
      []
    ] ] ];

  var parser;
  beforeEach(inject(function(gmailXhrDecoder) {
    parser = gmailXhrDecoder;
  }));

  it('should parse "a"', function() {
    var result = parser.parseKnownMessage(TEST_DATA_A);
    expect(result.type).toEqual('a');
    expect(result.messageId).toEqual('test_message_id');
  });

  it('should parse "cs" message', function() {
    var result = parser.parseKnownMessage(TEST_DATA_CS);
    expect(result).toEqual({
      type: 'cs',
      threadId: '141cbd65b4679861',
      messageIds: ['141cbd65b4679861', '141cbd67ddf958e0', '141cbd69a1a124cc']
    });
  });

  it('should parse "ms"', function() {
    var result = parser.parseKnownMessage(TEST_DATA_MS);
    expect(result).toEqual({
      type: 'ms',
      fromEmail: 'sender@example.com',
      fromName: 'Manuel Braun',
      fromRfc: 'Manuel Braun <sender@example.com>',
      messageId: '141c5545333e7dd5',
      origMessageId: '141c2ad0eae5aef0',
      bodySnipped: 'What\'s the manufacturer/model of TV you use?'
    });
  });

  it('should parse tb', function() {
    var result = parser.parseKnownMessage(TEST_DATA_TB);
    expect(result.type).toEqual('tb');
    expect(result.start).toEqual(50);
    var mails = result.mails;
    expect(mails[0]).toEqual({subject: '16',
      threadId: 'test_thread_id1',
      messageId: 'test_message_id1',
      dateStr: '11. September 2013 16:18'
    });
  });


  it('should parse empty stu', function() {
    var result = parser.parseKnownMessage(TEST_DATA_EMPTY_STU);
    expect(result).toEqual(
      { type: 'stu',
        oldMessageIds: ['141185da9d4ba90f'],
        mails: []});
  });

  it('should parse stu', function() {
    var result = parser.parseKnownMessage(TEST_DATA_STU);
    expect(result).toEqual(
      {type: 'stu',
        oldMessageIds: ['old_message_id', 'old_message_id2'],
        mails: [
          {subject: '16',
            threadId: 'test_thread_id3',
            messageId: 'test_message_id3',
            dateStr: '12. September 2013 11:13'
          }
        ]});
  });

  it('should parse all known messages in list', function() {
    var result = parser.parseAllMessages([TEST_DATA_STU, TEST_DATA_TB,
      ['xx', []],
      ['stu', []]
    ]);
    expect(result.length).toEqual(2);
  });

  it('should pick json parser for json header', function() {
    spyOn(parser, 'parseJson');
    parser.parseRequest({headers: {'content-type': 'application/json'}});
    expect(parser.parseJson).toHaveBeenCalled();
  });

  it('should handle invalid json', function() {

    var chunked = '6\ninvalidinvalid';
    expect(parser.parseChunked(chunked)).toEqual([]);
    expect(parser.parseJson('[invlid')).toEqual([]);
  });

  it('should pick chunked parser for html', function() {
    spyOn(parser, 'parseChunked');
    parser.parseRequest({headers: {'content-type': 'text/html'}});
    expect(parser.parseChunked).toHaveBeenCalled();
  });

  /**
   it('should join tb mail', function() {
    var result = parser.parseAllMessages([TEST_DATA_TB, TEST_DATA_TB]);
    result = parser.joinTbMails(result);
    expect(result.length).toEqual(1);
    expect(result[0].type).toEqual('tb');
    expect(result[0].mails.length).toEqual(4);
  });
   */

  function parseLater(msg) {
    return function() {
      parser.parseKnownMessage(msg);
    }
  }

  it('should raise on invalid message format', function() {
    expect(parseLater([])).toThrow();
    expect(parseLater(null)).toThrow();
    expect(parseLater('')).toThrow();
  });

});
