'use strict';

angular.module('gmail.xhr', [])
  .factory('xhrPatcher', function() {
    function listenOnce(target, event, handler) {
      function handlerProxy(ev) {
        handler(ev);
        target.removeEventListener(event, handlerProxy, false);
      }

      target.addEventListener(event, handlerProxy, false);
    }

    /**
     * Parse headers into key value object
     *
     * @param {string} headers Raw headers as a string.
     * @return {Object} Parsed headers as key value object.
     */
    function parseHeaders(headers) {
      var parsed = {}, key, val, i;

      if (!headers) return parsed;

      angular.forEach(headers.split('\n'), function(line) {
        i = line.indexOf(':');
        key = angular.lowercase(line.substr(0, i)).trim();
        val = line.substr(i + 1).trim();

        if (key) {
          if (parsed[key]) {
            parsed[key] += ', ' + val;
          } else {
            parsed[key] = val;
          }
        }
      });

      return parsed;
    }

    /**
     * Patches given XMLHttpRequest (constructor) to intercept calls.
     * @param {XMLHttpRequest} original constructor.
     * @return {Object} patcher that has the following api:
     * - reset: function  to the original state.
     * - loadListener: set this to a function that will receive details about
     * successfull load requests. It is calles with a object has the following
     * properties:
     *  - method
     *  - url
     *  - data: response body
     *  - requestBody
     * url, response text and requestBody as parameter.
     */
    function patcher(original) {
      var origPro;
      var api = {loadListener: null, loadStartListener: null};

      function patch() {

        origPro = {};
        // copying all properties does throws error in Firefox.
        ['open'].forEach(function(key) {
          origPro[key] = original.prototype[key];
        });
        // angular.copy(original.prototype);

        var pro = original.prototype;

        pro.open = function(method, url) {

          var xhr = this;
          var requestBody;

          function buildRequestObj() {
            return {method: method,
              url: url,
              requestBody: requestBody};
          }

          listenOnce(xhr, 'load', function() {
            if (api.loadListener) {
              var req = buildRequestObj();
              req.data = xhr.responseText;
              req.headers = parseHeaders(xhr.getAllResponseHeaders());
              api.loadListener(req);
            }
          });
          listenOnce(xhr, 'loadstart', function() {
            if (api.loadStartListener) {
              api.loadStartListener(buildRequestObj());
            }
          });

          var origSend = xhr.send;
          // apply one-time send patch
          xhr.send = function(data) {
            requestBody = data;
            listenOnce(this, 'loadstart', function() {
              xhr.send = origSend;
            });
            origSend.apply(this, arguments);
          };

          // call original open
          return origPro.open.apply(this, arguments);
        };
      }

      patch();

      api.reset = function() {
        angular.extend(original.prototype, origPro);
      };
      return api;
    }

    return patcher;
  })
  .factory('gmailXhrMonitor', ['xhrPatcher', function(xhrPatcher) {
    // xhr happens in an iframe with this id.
    var iframe = document.getElementById('js_frame');
    if (!iframe) {
      throw new Error('not run in gmail');
    }
    var frameWin = iframe.contentDocument.defaultView;
    return xhrPatcher(frameWin.XMLHttpRequest);
  }])
  .factory('BrowserChannelDecoder', function() {


    function Decoder(raw) {
      this._processedIdx = 0;
      this._raw = raw;
    }

    var pro = Decoder.prototype;


    /**
     * Returns next chunk or null if nor more chunks or stream invalid
     * @return {String?} chunk text.
     */
    pro.nextChunk = function() {
      var raw = this._raw;
      var nlPos = raw.indexOf('\n', this._processedIdx);
      if (nlPos < 0)
        return null;
      var line = raw.substring(this._processedIdx, nlPos);
      var size = Number(line);
      if (isNaN(size) || size < 0)
        return null;

      var chunkStartIdx = nlPos; // + 1; (+1 seems not to be true for gmail)
      if (chunkStartIdx > raw.length)
        return null;

      var chunk = raw.substr(chunkStartIdx, size);
      this._processedIdx = chunkStartIdx + size;
      return chunk;
    };


    return Decoder;
  })
  .factory('gmailXhrDecoder',
    ['BrowserChannelDecoder', '$log', function(BrowserChannelDecoder, $log) {

      var api = {};

      var JSONP_PREFIX = ')]}\'\n\n';

      /**
       * Strips JSONP prefix
       * @private
       */
      function stripPrefix(data) {
        if (data.lastIndexOf(JSONP_PREFIX, 0) === 0) {
          return data.substr(JSONP_PREFIX.length);
        }
        return data;
      }

      function evalParse(chunk) {
        if (!angular.isString(chunk)) return null;
        // we assume this data is safe
        try {
          /*jslint evil: true */
          return eval('(' + chunk + ')');
        } catch (err) {
          $log.warn('failed to evaluate thread list chunk');
          $log.warn(chunk);
          return null;
        }
      }

      /**
       * @constructor
       * @param {String=} msg optional message.
       * @extends {Error}
       */
      api.ParseError = function(msg) {
        this.name = 'ParseError';
        this.message = msg;
      };
      api.ParseError.prototype = Object.create(Error.prototype);


      function parseMailItem(item) {
        return {
          threadId: item[0],
          messageId: item[1],
          subject: item[9],
          dateStr: item[15]
        };
      }

      function parseAMessage(msg) {
        if (msg.type != 'a' || !angular.isArray(msg.args[2])) return null;
        return {type: 'a',
          messageId: msg.args[2][0]};
      }

      function parseTbMessage(msg) {
        if (msg.type != 'tb') return null;
        if (!angular.isArray(msg.args[1])) return null;
        var mails = msg.args[1].map(parseMailItem);
        return {type: 'tb',
          start: msg.args[0],
          mails: mails
        };
      }

      function parseMsgHeader(msg) {
        if (!angular.isArray(msg) || !angular.isString(msg[0])) {
          throw new api.ParseError('message not in expected format');
        }
        return {
          /// message type (string)
          type: msg[0],
          /// arguments of message
          args: msg.slice(1)
        };
      }


      function parseStuMessage(msg) {
        if (msg.type != 'stu') return null;
        if (msg.args.length < 2 || !angular.isArray(msg.args[0])) return null;

        var obj = {type: 'stu',
          oldMessageIds: msg.args[0],
          mails: []
        };
        if (angular.isArray(msg.args[1]) && angular.isArray(msg.args[1][0]) &&
          angular.isArray(msg.args[1][0][1])) {
          obj.mails = msg.args[1].map(function(item) {
            return parseMailItem(item[1]);
          });
        }
        return obj;
      }

      function parseMsMessage(msg) {
        if (msg.type != 'ms') return null;
        return {
          type: 'ms',
          messageId: msg.args[0],
          origMessageId: msg.args[1],
          fromRfc: msg.args[3],
          fromName: msg.args[4],
          fromEmail: msg.args[5],
          bodySnipped: msg.args[7]
        };
      }

      function parseCsMessage(msg) {
        if (msg.type != 'cs') return null;
        return {
          type: 'cs',
          threadId: msg.args[0],
          messageIds: msg.args[7]
        };
      }

      var parsers = [parseStuMessage, parseTbMessage, parseAMessage,
        parseMsMessage, parseCsMessage];

      /**
       * Try to parse message with ay known parser.
       */
      api.parseKnownMessage = function(msg) {
        msg = parseMsgHeader(msg);
        // console.log(msg);
        // var debug = _.flatten(msg.args);
        for (var i = 0; i < parsers.length; ++i) {
          var parse = parsers[i];
          var result = parse(msg);
          if (result)
            return result;
        }
        return null;
      };

      api.parseAllMessages = function(messages) {
        if (!messages) return [];
        return messages.map(api.parseKnownMessage).filter(function(msg) {
          return msg !== null;
        });
      };

      api.parseChunked = function(body) {
        var allParsed = [];
        var raw = stripPrefix(body);
        var decoder = new BrowserChannelDecoder(raw);
        var chunk;
        while ((chunk = decoder.nextChunk()) !== null) {
          var msgs = evalParse(chunk);
          allParsed.push.apply(allParsed, api.parseAllMessages(msgs));
        }
        return allParsed;
        // return api.joinTbMails(allParsed);
      };

      api.parseJson = function(body) {
        var raw = stripPrefix(body);
        var chunks = evalParse(raw);
        if (!chunks) return [];
        return api.parseAllMessages(chunks[0]);
      };

      api.parseRequest = function(req) {
        if (req.headers['content-type'].indexOf('text/html') === 0) {
          return api.parseChunked(req.data);
        } else {
          return api.parseJson(req.data);
        }
      };

      return api;
    }]);

