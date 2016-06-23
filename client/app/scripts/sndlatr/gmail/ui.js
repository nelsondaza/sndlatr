'use strict';

(function() {
  var ComposeView = ['target', '$scope', 'baseEditView', '$timeout',
    'gmailEvents', 'eventFirer', '$log', '$document', '$controller',
    function(target, $scope, baseEditView, $timeout, gmailEvents, eventFirer,
             $log, $document, $controller) {
      $log.debug('creating compose view');
      var view = baseEditView(target, $scope);

      $controller('ComposeCtrl', {$scope: $scope});
      var composeTableEl = view.findElement('.aDh');
      var laterElem = view.compileAndLink('draftSendLater.html');
      composeTableEl.after(laterElem);
      var closeButtonEl = view.findElement('.Ha');

      $scope.viewType = 'slCompose';

      $scope.close = function() {
        eventFirer.clickSequence(closeButtonEl[0]);
      };

      /**
       * Updates message id in scope. Destory scope when id is no
       * longer open.
       */
      function destroyIfGone() {
        if (gmailEvents.composeMessageIds.indexOf($scope.messageId) < 0 &&
          !$document[0].contains(target)) {
          $log.debug('destroying compose scope for message id ' +
            $scope.messageId);
          $scope.$destroy();
        }
      }

      view.updateMessageId();
      // give id time to settle.
      if ($scope.messageId == 'new') {
        delete $scope.messageId;
        $timeout(function() {
          view.updateMessageId();
        });
      }

      /**
       * Watch active open message ids.
       */
      $scope.$watch(function() {
        return gmailEvents.composeMessageIds;
      }, function(newVal, oldVal) {
        if (angular.equals(newVal, oldVal)) return;
        // give gmail time to settle update field.
        $timeout(destroyIfGone);
      });
      return view;
    }];

  var ReplyView = ['target', '$scope', 'baseEditView', '$timeout',
    '$controller', '$log', 'gmailEvents',
    function(target, $scope, baseEditView, $timeout, $controller, $log,
             gmailEvents) {
      var view = baseEditView(target, $scope);
      $controller('ReplyCtrl', {$scope: $scope});
      $scope.viewType = 'slReply';

      var replyTableEl = view.findElement('.aDh');
      var laterElem = view.compileAndLink('draftSendLater.html');
      replyTableEl.after(laterElem);

      // function pollMsgId() {
      //   var newMsgId = view.getMessageId();
      //   // lightweight change check to avoid calling apply too often.
      //   if ($scope.messageId != newMsgId) {
      //     $log.debug('polling updated message id to ' + newMsgId);
      //     $scope.messageId = newMsgId;
      //     if (!$scope.$$phase) $scope.$digest();
      //   }
      //   $timeout(pollMsgId, 200, false);
      // }


      // pollMsgId();
      view.updateMessageId();

      $scope.$watch(function() {
        return gmailEvents.currentThreadId;
      }, function(id, oldId) {
        if (id == oldId) return;
        $log.debug('destorying reply view');
        $scope.$evalAsync(function() {
          $scope.$destroy();
        });
      });

      $scope.hide = function() {
        angular.element(target).css('display', 'none');
      };

      return view;
    }];

  var ConversationView = ['targetToolbar', 'targetMain', '$scope',
    'viewBuilder', '$controller', 'gmailCss', 'gmailEvents', '$log',
    'conversationStore', '$timeout',
    function(targetToolbar, targetMain, $scope, viewBuilder, $controller,
             gmailCss, gmailEvents, $log, conversationStore, $timeout) {
      // Load conversation from store.
      var conversation;

      function loadConversation() {
        conversation = conversationStore.getConversation(
          gmailEvents.currentThreadId);
      }


      function initialize() {

        // destroy scope when view changes
        $scope.$watch(function() {
          return gmailEvents.currentThreadId;
        }, function(id, oldId) {
          if (id == oldId) return;
          $log.debug('destorying conversation view');
          $scope.$evalAsync(function() {
            $scope.$destroy();
          });
        });

        var mainView = viewBuilder(targetMain, $scope);
        var toolbarView = viewBuilder(targetToolbar, $scope);

        $scope.subject = mainView.findElement(gmailCss.conversationSubject)
          .text();

        $controller('ConversationCtrl', {$scope: $scope,
          conversation: conversation});

        // Inject toolbar button
        var moreButton = toolbarView.findElement(gmailCss.conversationMoreButton);
        var remindButton = toolbarView.compileAndLink('remindToolbar.html');
        moreButton.after(remindButton);

        var sidebar = mainView.findElement(gmailCss.conversationSidebar);
        var remindBox = toolbarView.compileAndLink('remindBox.html');
        sidebar.prepend(remindBox);
      }

      loadConversation();
      if (conversation) {
        initialize();
      } else {
        // give it time to settle.
        $timeout(function() {
          loadConversation();
          if (conversation) {
            initialize();
          } else {
            $log.info('unknown conversation, ignoring');
            $scope.$destroy();
          }
        });
      }

      // no public api
    }
  ];

  var ThreadListView = ['target', '$scope', 'viewBuilder', '$controller',
    'gmailEvents', '$log', '$timeout',
    function(target, $scope, viewBuilder, $controller, gmailEvents, $log,
             $timeout) {
      var linkFn = viewBuilder.compile('draftListTime.html');

      target = angular.element(target);
      target.addClass('slDraftsList');

      $log.debug('costructed view');
      var childScopes = [];

      /**
       * Called after linking of template
       */
      function postLinkFn(elem, scope, idx) {
        var mailIdx = idx + gmailEvents.threadListOffset;
        scope.number = mailIdx;
        scope.mail = gmailEvents.threadListMails[mailIdx];
        // console.log(scope.mail);
      }

      function injectOnPage() {
        // destroy old child scopes.
        childScopes.forEach(function(old) {
          old.$destroy();
        });
        // $scope.threadListOffset = gmailEvents.threadListOffset;
        // $log.debug('injecting');

        var timeTdEls = target[0].querySelectorAll('tr td.xW.xY');
        if (timeTdEls.length > gmailEvents.threadListMails.length) {
          $log.info('Ignoring thread list. View has' + timeTdEls.length +
            ' items, data ' + gmailEvents.threadListMails.length);
          return;
        }
        var idx = 0;
        angular.forEach(timeTdEls, function(td) {
          var childScope = $scope.$new(true);
          childScopes.push(childScope);
          td = angular.element(td);

          // handle special origElShown attribute
          var origEl = td.children();
          childScope.origElShown = true;
          childScope.$watch('origElShown', function(show) {
            origEl.css('display', show ? '' : 'none');
          });

          linkFn(childScope, function(clonedEl) {
            $controller('DraftListItemCtrl', {$scope: childScope});
            postLinkFn(td, childScope, idx);
            td.append(clonedEl);
            childScope.$on('$destroy', function() {
              clonedEl.remove();
            });
          });
          idx++;
        });
        /**
         * Add class slHasScheduled if there is a child that shows it's own
         * content.
         */
        $scope.$watch(function() {
          return childScopes.some(function(childScope) {
            return !childScope.origElShown;
          });
        }, function(hasScheduled) {
          if (hasScheduled)
            target.addClass('slHasScheduled');
          else
            target.removeClass('slHasScheduled');
        });
      }

      function debounce(fn, time) {
        var promise;
        return function() {
          if (promise) $timeout.cancel(promise);
          promise = $timeout(function() {
            if ($scope.$$destroyed) return;
            fn();
          }, time);
        };
      }

      var debouncedInject = debounce(injectOnPage, 0);

      $scope.$watch(function() {
        return gmailEvents.threadListMails;
      }, function(newList, oldList) {
        if (angular.equals(newList, oldList)) return;
        // $log.debug('triggering update due to draftMail cahnge');
        debouncedInject();
        // $timeout(function() {
        //   $log.debug('deferred update');
        //   injectOnPage();
        // }, 4000);
      }, true);
      $scope.$on('gm:threadlistupdate', function() {
        // $log.debug('triggering update due dom update');
        debouncedInject();
      });

      debouncedInject();

    }];

  // Register views
  angular.module('gmail.ui',
      ['gmail.core', 'gmail.css', 'gmail.utils',
        'sndlatr.scheduler', 'sndlatr.email', 'ui.bootstrap', 'w69b.throttle'])
    .config(['wrappedViewProvider', function(wrappedViewProvider) {
      wrappedViewProvider.register('ComposeView', ComposeView);
      wrappedViewProvider.register('ReplyView', ReplyView);
      wrappedViewProvider.register('ThreadListView', ThreadListView);
      wrappedViewProvider.register('ConversationView',
        ConversationView);
    }]);

})();


angular.module('gmail.ui')
  .factory('baseEditView', ['viewBuilder', '$controller',
    'gmailCss', 'textutil',
    function(viewBuilder, $controller, gmailCss, textutil) {
      return function(target, $scope) {
        var view = viewBuilder(target, $scope);
        var msgIdEl = view.findElement('input[type="hidden"][name="draft"]');
        var composeIdEl = view.findElement(
          'input[type="hidden"][name="composeid"]');

        $controller('BaseEditCtrl', {$scope: $scope});

        view.getMessageId = function() {
          var id = msgIdEl.val();
          if (id == 'undefined') return 'new';
          else return id;
        };

        function getContentEditableEl() {
          var editableEl = view.findElement(gmailCss.draftEditable);
          // can be wrapped in an iframe (FF).
          if (editableEl[0].tagName == 'IFRAME') {
            var domEl =
              editableEl[0].contentDocument.querySelector(
                gmailCss.draftIframeEditable);
            if (!domEl) {
              throw new Error('could not find editable in iframe');
            }
            editableEl = angular.element(domEl);
          }
          return editableEl;
        }

        function triggerKeyDown(inputEl) {
          inputEl[0].dispatchEvent(new Event('keydown'));
        }

        /**
         * Appends space to body and dispatches keydown event.
         * This triggers a save event. Use only if there is no message id.
         */
        $scope.triggerSave = function() {
          var editableEl = getContentEditableEl();
          editableEl[0].innerHTML += ' ';
          triggerKeyDown(editableEl);
        };

        function getComposeId() {
          return composeIdEl.val();
        }

        function getReceivers(name) {
          var values = [];
          var toInputs = angular.element(
            target.querySelectorAll('input[name="' + name + '"]'));
          for (var i = 0; i < toInputs.length; ++i) {
            values.push(toInputs.eq(i).val());
          }
          return values;
        }

        /**
         * @return {Array.<string>} to email addresses.
         */
        view.getTo = function() {
          return getReceivers('to');
        };

        /**
         * @return {Array.<string>} to email addresses.
         */
        view.getCC = function() {
          return getReceivers('cc');
        };

        /**
         * @return {Array.<string>} to email addresses.
         */
        view.getBCC = function() {
          return getReceivers('bcc');
        };

        /**
         * @return {string} value of subject field.
         */
        view.getSubject = function() {
          return view.findElement('input[name="subject"]').val();
        };

        /**
         * @return {string} value of body field. This can be plain text
         * or html code depending on compose mode.
         */
        $scope.getBody = function() {
          return getContentEditableEl().html();
        };

        /**
         * Gets subject from current input box (can be different from
         * form value).
         * @return {string} subject.
         */
        $scope.getInputSubject = function() {
          return view.findElement(gmailCss.draftSubjectInput).val();
        };

        /**
         * @param {string} subject value.
         * @param {boolean=} append append to existing subject if true.
         */
        $scope.setSubject = function(subject, append) {
          var inputEl = view.findElement(gmailCss.draftSubjectInput);
          if (append) {
            var oldVal = inputEl.val();
            if (oldVal) oldVal += ' ';
            inputEl.val(oldVal + subject);
          } else {
            inputEl.val(subject);
          }
          triggerKeyDown(inputEl);
        };

        /**
         * Set body of contenteditable to given html code.
         * @param {string} html
         * @param {boolean=} append append to existing body if true.
         */
        $scope.setBody = function(html, append) {
          var editableEl = getContentEditableEl();
          if (append) {
            var oldVal = editableEl.html();
            if (textutil.html2txt(oldVal).trim())
              oldVal += '<br>';
            editableEl.html(oldVal + html);
          } else {
            editableEl.html(html);
          }
          triggerKeyDown(editableEl);
          editableEl[0].focus();
        };

        view.updateMessageId = function() {
          $scope.messageId = view.getMessageId();
        };

        /**
         * The scope is not updated automatically for
         */
        $scope.updateScope = function() {
          $scope.to = view.getTo();
          $scope.cc = view.getCC();
          $scope.bcc = view.getBCC();
          $scope.body = $scope.getBody();
          $scope.subject = view.getSubject();
          view.updateMessageId();
        };

        $scope.composeId = getComposeId();
        return view;
      };
    }])
  .controller('ConversationCtrl',
    ['$scope', 'RemindJob', 'whenInitialized', 'gmailNotify',
      'throttle', 'conversation', '$log',
      function($scope, RemindJob, whenInitialized, gmailNotify, throttle,
               conversation, $log) {
        this.conversation = conversation;
        $log.debug(conversation);

        // Note that this can be different from gmailEvents.currentThread
        var threadId = conversation.getThreadId();
        $scope.job = null;

        var throttledSave = throttle(function() {
          gmailNotify.message('Saving reminder...');
          $scope.job.knownMessageIds = conversation.getMessageIds();
          $scope.job.subject = $scope.subject;
          $scope.job.put().then(function() {
            gmailNotify.message('Your reminder has been saved.', 5000);
          });
        }, 1000);


        function jobLoaded() {
          $scope.$watch(function() {
            var watched = {};
            ['scheduledAt', 'onlyIfNoreply'].forEach(function(key) {
              watched[key] = $scope.job[key];
            });
            return watched;
          }, function(watched, oldWatched) {
            if (angular.equals(watched, oldWatched) ||
              !$scope.job.scheduledAt) return;
            // if job is not changeable, re-enable, else save.
            if ($scope.job.isChangeable()) {
              throttledSave();
            } else {
              $scope.reEnableJob();
            }
          }, true);

          // watch for changed of message ids in conversation ids (initially
          // and new when new messages are shown).
          $scope.$watch(function() {
            return conversation.getMessageIds();
          }, function() {
            $scope.job.checkReply(conversation);
          }, true);
        }

        /**
         * Deletes old (disabled) job and copies settings to a new job.
         */
        function newFromUnchangeable() {
          var oldJob = $scope.job;
          var newJob = new RemindJob({
            onlyIfNoreply: oldJob.onlyIfNoreply,
            threadId: oldJob.threadId
          });
          if (oldJob.scheduledAt.isFuture()) {
            newJob.scheduledAt = oldJob.scheduledAt;
          }
          if (oldJob.state == 'disabled')
            oldJob.delete();
          else
            oldJob.forget();
          $scope.job = newJob;
        }


        whenInitialized(function() {
          $scope.job = RemindJob.getByThreadId(threadId);
          if (!$scope.job) {
            $scope.job = new RemindJob({
              threadId: threadId,
              onlyIfNoreply: false});
          }
          jobLoaded();
        });

        /**
         * Creates new job from disabled job and triggers save.
         * Does nothing if current job is not disabled.
         */
        $scope.reEnableJob = function() {
          if ($scope.job.isChangeable()) return;
          newFromUnchangeable();
          if ($scope.job.scheduledAt)
            throttledSave();
        };

        /**
         * Deletes current job.
         */
        $scope.cancelJob = function() {
          if ($scope.job.id) {
            $scope.job.delete().then(function() {
              gmailNotify.message('Your reminder has been cancelled');
            });
          }
          $scope.job = new RemindJob({threadId: threadId,
            onlyIfNoreply: false});
        };

        // $scope.$watch('job', function(date, oldDate) {
        //   $scope.job.put()
        //     .then(function() {
        //       gmailNotify.message('Your will be reminded at ' + date);
        //     });
        // }, true);

      }])
  .controller('BaseEditCtrl', ['$scope', '$log', 'SendJob', 'whenInitialized',
    'gmailNotify', '$timeout', '$q', 'email', '$modal', 'textutil',
    function($scope, $log, SendJob, whenInitialized, gmailNotify, $timeout, $q,
             email, $modal, textutil) {
      $scope.job = null;
      $scope.scheduledAtRelative = null;
      var relativeUpdateTimer;

      function updateRelative() {
        var date = $scope.job && $scope.job.scheduledAt;
        if (date && date.daysFromNow() <= 7) {
          $scope.scheduledAtRelative = date.relative();
        } else {
          $scope.scheduledAtRelative = null;
        }
      }

      $scope.$watch('job.scheduledAt', function() {
        updateRelative();
      });

      relativeUpdateTimer = $timeout(function update() {
        updateRelative();
        relativeUpdateTimer = $timeout(update, 1000);
      }, 1000);

      $scope.$on('$destroy', function() {
        if (relativeUpdateTimer) $timeout.cancel(relativeUpdateTimer);
      });

      $scope.$on('gm:savedMail', function(ev, mail) {
        if (mail.composeId == $scope.composeId) {
          $scope.messageId = mail.messageId;
        }
      });

      /**
       * Cancel sending of job.
       */
      $scope.cancelJob = function() {
        $scope.job.delete().then(null, function() {
          $scope.job = SendJob.getByMessageId('msgId');
        });
        $scope.job = new SendJob({messageId: $scope.messageId});
        gmailNotify.message('This email will not be sent.');
      };

      $scope.getMail = function() {
        $scope.updateScope();
        var body = $scope.body;
        body = textutil.html2txt(body);

        return {subject: $scope.subject, body: body};
      };

      /**
       * Extracted message id or message id changed.
       */
      $scope.$watch('messageId', function(msgId) {
        if (!msgId) return;
        if ($scope.job) {
          $log.debug('updating job with new message id ' + msgId);
          $scope.job.messageId = msgId;
          if ($scope.job.isStored())
            $scope.job.put();
        } else {
          whenInitialized(function() {
            $scope.job = SendJob.getByMessageId(msgId);
            if (!$scope.job) {
              $scope.job = new SendJob({messageId: msgId});
            }
          });
        }
      });

      /**
       * Wait for message id. Triggers save and waits for saved event if
       * necessary or resolves instantly if we already have a message id.
       * @return {Object} promise that resolves when we have a message id.
       */
      function waitForMessageId() {
        if ($scope.messageId == 'new') {
          gmailNotify.message('saving...');
          $scope.triggerSave();
          var deferred = $q.defer();
          var unwatch = $scope.$watch('messageId', function(id) {
            if (id != 'new') {
              deferred.resolve();
              unwatch();
            }
          });
          return deferred.promise;
        } else {
          return $q.when(true);
        }
      }

      /**
       * Checks if receivers are valid. True if all receivers validate and
       * the is at least one TO receiver.
       * @return {boolean} valid or not.
       */
      $scope.validateReceivers = function() {
        var all = $scope.to.concat($scope.cc).concat($scope.bcc);
        var invalid = all.filter(function(item) {
          return !email.validate(item);
        });
        var hasAny = all.length > 0;
        var isValid = hasAny && !invalid.length;

        if (!isValid) {
          var dialogScope = $scope.$new(true);
          dialogScope.hasAny = hasAny;
          dialogScope.invalid = invalid;
          $modal.open({
            templateUrl: 'views/invalidReceiversDialog.html',
            controller: 'CloseableDialogCtrl',
            scope: dialogScope});
        }
        return isValid;
      };

      $scope._insertSnippet = function(snippet, ignoreSubject) {
        function insert(append) {
          if (!ignoreSubject)
            $scope.setSubject(snippet.subject, append);
          $scope.setBody(textutil.txt2html(snippet.body), append);
        }

        if ((ignoreSubject || !$scope.getInputSubject().trim()) &&
          !textutil.html2txt($scope.getBody()).trim()) {
          // email is empty
          insert(false);
        } else {
          $modal.open({
            templateUrl: 'views/dialogs/confirmSnippetDialog.html',
            controller: 'CloseableDialogCtrl'}).result.then(function(result) {
              if (result == 'replace') insert(false);
              else if (result == 'append') insert(true);
            });
        }
      };

      $scope.sendLater = function(date) {
        $scope.updateScope();
        if (!$scope.validateReceivers()) return $q.reject();

        return waitForMessageId().then(function() {
          $log.debug('updating job with scheduledAt ' + date);
          $scope.updateScope();
          $scope.job.scheduledAt = date;
          $scope.job.subject = $scope.subject;
          var putpromise = $scope.job.put();
          $timeout(function() {
            gmailNotify.message('scheduling mail...');
            putpromise.then(function() {
              gmailNotify.message('Your mail will be sent at ' + date);
            });
          });
          // may trigger url change which hides message, so give it some time.
        });
      };
    }])
  .controller('ComposeCtrl', ['$scope', 'gmailNotify',
    function($scope, gmailNotify) {

      var origSendLater = $scope.sendLater;
      // TODO: block ui while job is not available.
      $scope.sendLater = function(date) {
        origSendLater(date).then(function() {
          $scope.close();
        });
      };

      $scope.insertSnippet = function(snippet) {
        $scope._insertSnippet(snippet, false);
      };

      $scope.$watch('job.isChangeable()', function(changeable) {
        if (changeable === false) {
          gmailNotify.message('This draft is not available anymore.');
          $scope.close();
        }
      });

    }])
  .controller('ReplyCtrl', ['$scope', 'gmailEvents',
    function($scope) {
      // update message id on savedMail events.
      $scope.$watch('job.getDisplayState()', function(state) {
        if (state == 'sent') {
          $scope.hide();
        }
      });

      $scope.insertSnippet = function(snippet) {
        $scope._insertSnippet(snippet, true);
      };

    }])
  .controller('DraftListItemCtrl',
    ['$scope', 'SendJob', function($scope, SendJob) {
      $scope.job = null;

      function getMessageId() {
        if ($scope.mail)
          return $scope.mail.messageId;
        else
          return undefined;
      }

      $scope.$watch(function() {
        // TODO: watching on getCount assumes that the count always changes
        // for adding/removing jobs in a digist cycle. We should watch on some
        // versionnumber instead or better: index jobs by message ids and
        // watch on job getter.
        return [SendJob.getCount(), getMessageId()];
      }, function() {
        var msgId = getMessageId();
        if (msgId) {
          $scope.job = SendJob.getByMessageId(msgId);
        } else {
          $scope.job = null;
        }
      }, true);

      $scope.$watch('job', function(job) {
        $scope.origElShown = !job || job.getDisplayState() == 'sent';
      });
    }])
  .factory('gmailNotify',
    ['$document', '$log', 'gmailEvents', '$timeout',
      function($document, $log, gmailEvents, $timeout) {
        var containerEl;
        var messageEl;
        var oldTimerPromise;

        function findElements() {
          containerEl = $document[0].querySelector('.b8.UC');
          if (!containerEl) {
            $log.error('could not find notify element');
            return;
          }
          messageEl = angular.element(containerEl.querySelector('.vh'));
          containerEl = angular.element(containerEl);
        }

        function ensureHasElements() {
          if (!messageEl) findElements();
          return messageEl && messageEl.length;
        }

        function showMessage(text, timeout) {
          if (!ensureHasElements()) return;
          if (oldTimerPromise) $timeout.cancel(oldTimerPromise);
          showContainer(true);
          messageEl.text(text);

          var unwatch = gmailEvents.$watch('absUrl', function(newUrl, oldUrl) {
            if (oldUrl == newUrl) return;
            hideMessage();
          });

          function hideMessage() {
            messageEl.text('');
            showContainer(false);
            unwatch();
          }

          if (timeout) {
            oldTimerPromise = $timeout(hideMessage, timeout);
          }
        }

        function showContainer(show) {
          containerEl.css('visibility', show ? 'visible' : 'hidden');
        }

        return {
          message: showMessage,
          // TODO: implement different color
          error: showMessage
        };
      }])
  .factory('gmailEventHandler',
    ['gmailEvents', 'SendJob', function(gmailEvents, SendJob) {
      var started = false;

      function start() {
        if (started) return;
        started = true;

        gmailEvents.$on('gm:sendMail', function(ev, mail) {
          var job = SendJob.getByMessageId(mail.messageId);
          if (job) {
            // TODO: show some notification that scheduling was cancelled?
            job.delete();
          }
        });

        gmailEvents.$on('gm:deleteMails', function(ev, msgIds) {
          // TODO: add delete api that allows batching multiple deletes.
          msgIds.forEach(function(msgId) {
            var job = SendJob.getByMessageId(msgId);
            if (job) {
              job.delete();
            }
          });
        });
      }

      return {
        start: start
      };
    }]);
