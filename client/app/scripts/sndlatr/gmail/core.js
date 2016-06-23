'use strict';

angular.module('gmail.core', ['w69b.idtokenauth', 'gmail.xhr',
    'gmail.conversation', 'w69b.uritool'])
/**
 * Listens for insertion of dom insertions using animation wathces and
 * broadcasts events on returned scope (eg compose, with event target that
 * equals)
 * Keeps track of emails in threads. A list of emails in the current thread
 * is published on threadListMails.
 * Watches URL changes and provides the following attributes:
 *  - pagePath: name of current page (eg drafts, inbox)
 *  - threadListOffset: offset in mail list. Computed from page number.
 *  - absUrl: absolute url (location.href)
 *  - composeMessageIds: messageIds of currently opened compose windows.
 *  - currentThreadId: id of currently viewd thread. Null if not viewing
 *  a thread (but not guranteed, could also be a label with hex-like name,
 *  do don't rely on it).
 *
 * Fires events on $rootScope (for easier unregistering listeners) for the
 * following events:
 *  - gm:savedMail mail was saved. Provides object with composeId and messageId
 *  - gm:sendMail fired when mail is sent (on xhr start). Provies object
 *  with composeId, messageId and threadId of mail.
 *  - gm:deleteMails fied when mails are being deleted. Provies list of
 *  message ids.
 * DOM events:
 *  - gm:compose compose window detected, provides dom element as aprameter
 *  - gm:reply reply window detected, provides dom element as paremeter
 *  - gm:threadlist  thread list view detected
 *  - gm:threadlistpdate a table was inserted into thread list view.
 *
 */
  .factory('gmailEvents',
    ['$document', '$rootScope', '$window', 'gmailXhrMonitor', 'uritool',
      'gmailXhrDecoder', '$log', '$cacheFactory', 'conversationStore',
      function($document, $rootScope, $window, gmailXhrMonitor, uritool,
               gmailXhrDecoder, $log, $cacheFactory, conversationStore) {
        var scope = $rootScope.$new(true);
        scope.composeMessageIds = [];
        scope.threadListMails = [];
        scope.pagePath = '';
        scope.threadListOffset = 0;
        scope.currentThreadId = null;

        // capacity is just a wild guess by now.
        var threadListCache = $cacheFactory('threadLists', {capacity: 100});

        /**
         * broadcast event on root scope with gm: prefix for name
         * @param {String} name event name (without prefix).
         */
        function broadcast(name) {
          var args = Array.prototype.slice.call(arguments, 1);
          args.unshift('gm:' + name);
          $log.debug(name);
          $rootScope.$broadcast.apply($rootScope, args);
        }

        function onAnimationStart(event) {
          var element = event.target;
          var name = event.animationName;
          var prefix = 'wbDomInserted';
          if (name.indexOf(prefix) === 0) {
            name = name.substr(prefix.length);
            $log.debug('detected dom ' + name);
            // eg gmail:compose
            broadcast(angular.lowercase(name), element);
          }
        }

        function ensureDigest() {
          if (!$rootScope.$$phase) $rootScope.$digest();
        }

        var bodyEl = $document.find('body');

        if (bodyEl.length) {
          var evName = ('webkitAnimation' in bodyEl[0].style) ?
            'webkitAnimationStart' : 'animationstart';
          bodyEl[0].addEventListener(evName, onAnimationStart, true);
        } else {
          $log.error('no body found');
        }

        function matchComposeIds(hash) {
          var match = hash.match(/compose=([\w\d%]+)/);
          if (match) {
            // get ids of open compose windows.
            var openIds = decodeURIComponent(match[1]);
            scope.composeMessageIds = openIds.split(',');
          } else if (scope.composeMessageIds.length) {
            // closed all compose windows.
            scope.composeMessageIds = [];
          }
        }

        /**
         * Updates scope.threadListOffset, scope.pagePath and currentThreadId
         * from given hash.
         * @param {String} hash
         */
        function matchPath(hash) {
          // remove # ;
          hash = hash.substring(1);
          var questionIdx = hash.indexOf('?');
          var path = hash;
          // strip query
          if (questionIdx >= 0)
            path = hash.substr(0, questionIdx);

          var pageMatch = path.match(/(.*)\/p(\d+)$/);
          var page = 1;
          if (pageMatch) {
            path = pageMatch[1];
            page = pageMatch[2] || 1;
          }
          var threadMatch = path.match(/([0-9,a-f]{8,})$/);
          if (threadMatch) {
            scope.currentThreadId = threadMatch[1];
          } else {
            scope.currentThreadId = null;
          }
          scope.threadListOffset = (page - 1) * 50;
          scope.pagePath = path;
        }

        function matchLocation() {
          var location = $document[0].location;
          var hash = location.hash;
          scope.absUrl = location.href;
          matchComposeIds(hash);
          matchPath(hash);
        }

        /**
         * Watch url.
         */
        angular.element($window).bind('popstate', function() {
          matchLocation();
          ensureDigest();
        });

        /**
         * Removes message with given message id from threadListMails.
         */
        function deleteDraftMail(messageId) {
          for (var i = 0; i < scope.threadListMails.length; ++i) {
            if (scope.threadListMails[i].messageId == messageId) {
              scope.threadListMails.splice(i, 1);
              break;
            }
          }
        }


        scope.processXhrMessage = function(msg) {
          if (msg.type == 'tb') {
            var start = msg.start;
            for (var i = 0; i < msg.mails.length; ++i) {
              scope.threadListMails[start + i] = msg.mails[i];
            }
          } else if (msg.type == 'stu') {
            if (msg.oldMessageIds) {
              // remove old message.
              msg.oldMessageIds.forEach(deleteDraftMail);
            } else if (lastDeleteOperation) {
              var messageIds = msg.mails.map(function(mail) {
                return mail.messageId;
              });
              messageIds.sort();

              if (angular.equals(messageIds,
                lastDeleteOperation.deletedMessageIds)) {
                $log.debug('stu matched last delete operation');
                scope.threadListMails = lastDeleteOperation.mailsBeforeDelete;
                return;
              }
            }
            scope.threadListMails.unshift.apply(scope.threadListMails,
              msg.mails);
          }
        };

        scope.$watch('pagePath', function(path) {
          if (!path) return;
          var mails = threadListCache.get(path);
          if (!mails) {
            mails = [];
            threadListCache.put(path, mails);
          }
          scope.threadListMails = mails;
        });
        // object reassigned
        scope.$watch('threadListMails', function(mails) {
          if (mails)
            threadListCache.put(scope.pagePath, mails);
        });

        $window.slDumpView = function() {
          $log.debug('num mails');
          $log.debug(scope.threadListMails.length);
          $log.debug(scope.threadListMails);
        };
        // verbose view debuging
        // scope.$watch('threadListMails', function() {
        //   $log.debug('num mails');
        //   $log.debug(scope.threadListMails.length);
        //   $log.debug(scope.threadListMails);
        // }, true);

        /**
         * Detects thread update requests and handles them by passing parsed
         * data on to scope.processXhrMessage.
         */
        function handleThreadUpdate(params, req) {
          // && params.search == 'drafts'
          if (params.view == 'tl') {
            gmailXhrDecoder.parseRequest(req)
              .map(function(msg) {
                scope.processXhrMessage(msg);
              });
            lastDeleteOperation = null;
            // scope.threadListMails = ids;
            return true;
          }
          return false;
        }

        function handleMailSaved(params, req) {
          if (params.act == 'sd') {
            var aMsgs = gmailXhrDecoder.parseRequest(req)
              .filter(function(msg) {
                return msg.type == 'a';
              });
            if (aMsgs) {
              var post = uritool.parseQuery(req.requestBody);
              broadcast('savedMail',
                {composeId: post.composeid,
                  messageId: aMsgs[0].messageId
                });
              return true;
            }
          }
          return false;
        }

        function handleConversationView(params, req) {
          if (params.view == 'cv') {
            gmailXhrDecoder.parseRequest(req).forEach(function(msg) {
              if (msg.type == 'ms')
                conversationStore.addMessage(msg);
              else if (msg.type == 'cs')
                conversationStore.addConversation(msg.threadId,
                  msg.messageIds);
            });
            return true;
          }
          return false;
        }

        var lastDeleteOperation = null;

        /**
         * Detects deletion actions in request and handles them.
         */
        function handleMailDelete(params, req) {
          if (params.act == 'tr') {
            // delete mail
            var parsed = uritool.parseQuery(req.requestBody, true);
            var messageIds = parsed.t;
            if (!messageIds) return false;

            messageIds.sort();
            lastDeleteOperation = {
              deletedMessageIds: messageIds,
              mailsBeforeDelete: scope.threadListMails
            };
            scope.threadListMails = scope.threadListMails.filter(function(mail) {
              return messageIds.indexOf(mail.messageId) < 0;
            });
            // messageIds.forEach(deleteDraftMail);
            $log.debug('detected deletion of messageIds: ' +
              messageIds.join(', '));
            broadcast('deleteMails', messageIds);
            return true;
          }
          return false;
        }

        function handleMailDeleteDraft(params, req) {
          if (params.act == 'dr') {
            var parsed = uritool.parseQuery(req.requestBody, true);
            var messageIds = parsed.m;
            if (!messageIds) return false;
            messageIds.sort();
            $log.debug('detected draft deletion of messageIds: ' +
              messageIds.join(', '));
            broadcast('deleteMails', messageIds);
            return true;
          }
          return false;
        }

        function handleMailSend(params, req) {
          if (params.act == 'sm') {
            var parsed = uritool.parseQuery(req.requestBody, false);
            var info = {
              messageId: parsed.draft,
              threadId: parsed.rm,
              composeId: parsed.composeid
            };
            $log.debug('detected send of mail: ' + angular.toJson(info));
            broadcast('sendMail', info);
            return true;
          }
          return false;
        }


        function listenerForHandlers(handlers) {
          return function(req) {
            var query = uritool.parseUrl(req.url).query;
            var params = uritool.parseQuery(query);
            // we could use URI.js or similar instead to parse query
            var isHandled = handlers.some(function(handler) {
              return handler(params, req);
            });
            if (isHandled) ensureDigest();
          };
        }

        if ($window.VIEW_DATA) {
          gmailXhrDecoder.parseAllMessages($window.VIEW_DATA)
            .forEach(function(msg) {
              var mails = threadListCache.get('inbox') || [];
              var start = msg.start;
              for (var i = 0; i < msg.mails.length; ++i) {
                mails[start + i] = msg.mails[i];
              }
              threadListCache.put('inbox', mails);
            });
        }

        gmailXhrMonitor.loadListener = listenerForHandlers([
          handleThreadUpdate, handleMailSaved, handleConversationView
        ]);
        gmailXhrMonitor.loadStartListener = listenerForHandlers([
          handleMailDelete, handleMailDeleteDraft, handleMailSend
        ]);

        matchLocation();

        // we do not cleanup on scope $destroy as it is never destroyed

        return scope;
      }])
  .factory('gmailViewInjector',
    ['$rootScope', 'gmailEvents', 'wrappedView', '$log',
      /**
       * Responds to gmail events by injecting views.
       */
        function($rootScope, gmailEvents, wrappedView, $log) {

        /**
         * Check if views have already been injected to target.
         * Adds class wbInjected and returns true if it has not been there
         * before.
         * Also adds the given clsName to the element.
         */
        function addInjectedClass(elem, clsName) {
          if (clsName)
            elem.addClass(clsName);
          if (elem.hasClass('wbInjected')) {
            return false;
          } else {
            elem.addClass('wbInjected');
            return true;
          }
        }

        /**
         * Removes wbInjecetd and the given custom class name from element.
         */
        function removeInjectedClass(elem, clsName) {
          if (clsName)
            elem.removeClass(clsName);
          elem.removeClass('wbInjected');
        }

        function inject(viewName, target, force) {
          var elem = angular.element(target);
          var clsName = 'slInjected' + viewName;
          if (!addInjectedClass(elem, clsName) && !force) return null;
          var scope = $rootScope.$new(true);
          wrappedView(viewName, {target: target, $scope: scope});
          scope.$on('$destroy', function() {
            removeInjectedClass(elem, clsName);
          });
          scope.$digest();
          return scope;
        }


        gmailEvents.$on('gm:compose', function(event, target) {
          inject('ComposeView', target);
        });

        var oldDraftScope;
        gmailEvents.$on('gm:threadlist', function(event, target) {
          // there can only be one thread list, we so destroy any old ones
          // actually gmail just hides the lists, but we currently just
          // re-inject from scratch when the thread list changes
          if (oldDraftScope) oldDraftScope.$destroy();
          // give url time to settle
          // if (gmailEvents.draftsShown)
          // $log.debug('injecting thread list');
          oldDraftScope = inject('ThreadListView', target, true);
        });

        gmailEvents.$on('gm:reply', function(event, target) {
          inject('ReplyView', target);
        });

        var conversationTargets = {};

        /**
         * Pool targets for conversation view.
         */
        function injectConversation() {
          // do nothing if we don't have both targets yet.
          if (!(conversationTargets.toolbar && conversationTargets.main))
            return;

          if (gmailEvents.currentThreadId) {
            var scope = $rootScope.$new(true);
            wrappedView('ConversationView', {
              targetToolbar: conversationTargets.toolbar,
              targetMain: conversationTargets.main,
              $scope: scope});
            scope.$on('$destroy', function() {
              conversationTargets = {};
            });
            scope.$digest();
          } else {
            $log.debug('ignoreing conversation without id');
          }
          conversationTargets = {};
          // inject('ConversationToolbarView', target);
        }

        gmailEvents.$on('gm:cvtoolbar', function(event, target) {
          conversationTargets.toolbar = target;
          injectConversation();
        });

        gmailEvents.$on('gm:cvmain', function(event, target) {
          conversationTargets.main = target;
          injectConversation();
        });

      }])
  .factory('viewBuilder',
    ['$compile', '$templateCache', '$log',
      function($compile, $templateCache, $log) {
        function getPartial(name) {
          var templateUrl = 'views/' + name;
          var tpl = $templateCache.get(templateUrl);
          if (!tpl)
            throw new Error('Template ' + templateUrl + ' not cached');
          return tpl;
          // return $http.get(templateUrl, {cache: $templateCache}).
          //   then(function(response) {
          //     return response.data;
          //   });
        }

        /**
         * Creates scope, initializes controller and provides helper methods
         * to inject partials.
         * @param {Element} target gmail dom element.
         * @param {Object} scope for linking template.
         * @return {Object} with compile and findElement functions.
         */
        function viewBuilder(target, scope) {

          return {
            /**
             * Compiles and links given template and returns element.
             * @param {String} templateUrl template url.
             * @return {Element}
             */
            compileAndLink: function(templateUrl) {
              var tpl = getPartial(templateUrl);
              var elem = $compile(tpl)(scope);
              scope.$on('$destroy', function() {
                elem.remove();
              });
              return elem;
            },

            /**
             * Find element by selector or raise error.
             * @param {string} selector css selector.
             * @return angular.element wrapped element.
             */
            findElement: function(selector) {
              var elem = target.querySelector(selector);
              if (!elem) {
                $log.error(target);
                throw new Error('could not find gmail element ' + selector);
              }
              return angular.element(elem);
            }
          };
        }

        /**
         * @param {String} templateUrl template url.
         * @return {Function} link fn.
         */
        viewBuilder.compile = function(templateUrl) {
          return $compile(getPartial(templateUrl));
        };

        return viewBuilder;
      }])
  .provider('wrappedView', function() {
    /**
     * Register wrapped view name.
     * @param {Function|Array} constructor Controller constructor fn
     * (optionally decorated with DI annotations in the array notation).
     */
    var views = {};
    this.register = function(name, constructor) {
      views[name] = constructor;
    };

    this.$get = ['$injector', function($injector) {
      /**
       * Instanciates wrappedView with given locals.
       */
      return function(constructor, locals) {

        if (!views.hasOwnProperty(constructor)) {
          throw new Error('wrappedView not known ' + constructor);
        }
        var expression = views[constructor];
        return $injector.instantiate(expression, locals);
      };
    }];

  })
  .factory('eventFirer', function() {
    var _ = {};

    function getEvent(type, opt_rect) {
      var opts =
      {bubbles: true,
        cancelable: true,
        view: window};

      if (opt_rect) {
        opts.screenX = opt_rect.left;
        opts.screenY = opt_rect.top;
        opts.clientX = opt_rect.left;
        opts.clientY = opt_rect.top;
      }
      return new MouseEvent(type, opts);
    }

    /**
     * Simluate click sequence on element
     */
    _.clickSequence = function(target) {
      var rect = target.getBoundingClientRect();
      target.dispatchEvent(getEvent('mousedown', rect));
      target.dispatchEvent(getEvent('mouseup', rect));
      target.dispatchEvent(getEvent('click', rect));
    };

    return _;
  })
  .factory('$location', ['$document', function($document) {
    /**
     * ng $location like service for gmail. Gmail uses a hash based location
     * that is not compatible with the default ng $location implementation.
     * So we override it with something that does not collide with gmail.
     */
    var noop = angular.noop;

    function path() {
      var hash = $document[0].location.hash;
      var match = hash.match(/^#([^\?]+)/);
      if (match)
        return match[1];
      else
        return '';
    }

    function absUrl() {
      return $document[0].location.href;
    }

    return {
      absUrl: absUrl,
      hash: noop,
      host: noop,
      path: path,
      port: noop,
      url: noop,
      search: noop
    };
  }])
  .factory('whenInitialized', ['$rootScope', function($rootScope) {
    return function(fn) {
      if ($rootScope.isInitialized) {
        fn();
      } else {
        var unwatch = $rootScope.$watch('isInitialized',
          function(initialized) {
            if (initialized) {
              fn();
              unwatch();
            }
          });
      }
    };
  }]);

