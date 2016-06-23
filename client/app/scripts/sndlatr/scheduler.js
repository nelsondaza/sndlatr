'use strict';

angular.module('sndlatr.scheduler', [])
  .factory('BaseModel', ['$http', '$q', function($http, $q) {
    /**
     * Base class for all models.
     * @param {Object} obj properties that are copied to this.
     * @constructor
     */
    function BaseModel(obj) {
      this.update(obj);
      // Emulates python-like class attribute for $allModels storage.
      // Reference to same array is available in class and instance objects.
      Object.defineProperty(this, '$allModels', {
        value: this.constructor.$allModels,
        enumerable: false, // avoid copying this with angular.copy
        assignable: false
      });
    }

    BaseModel._endpointUrl = null;
    var pro = BaseModel.prototype;

    /**
     * Helper to inherit from BaseModel. This also takes care of creating a own,
     * $allModels array for the subclass.
     * @param {Function} cls subclass constructor.
     * @protected
     */
    BaseModel._inherit = function(cls) {
      angular.extend(cls, BaseModel,
        {prototype: Object.create(BaseModel.prototype)});
      cls.prototype.constructor = cls;
      cls.$allModels = [];
    };

    /**
     * Update job fiels from object.
     * @param {Object} obj fields.
     * @param {boolean} fromPut true if called from put update.
     */
    pro.update = function(obj, fromPut) {
      var cls = this.constructor;
      var self = this;
      var backup = {};
      if (fromPut && cls._ignoredPutUpdateAttrs) {
        cls._ignoredPutUpdateAttrs.forEach(function(key) {
          if (self.hasOwnProperty(key))
            backup[key] = self[key];
        });
      }
      angular.copy(obj || {}, this);
      if (angular.isString(this.createdAt)) {
        this.createdAt = new Date(this.createdAt);
      }

      if (fromPut && cls._ignoredPutUpdateAttrs) {
        cls._ignoredPutUpdateAttrs.forEach(function(key) {
          if (backup.hasOwnProperty(key))
            self[key] = backup[key];
        });
      }
    };

    pro._getUrl = function() {
      var cls = this.constructor;
      if (this.id)
        return cls._endpointUrl + '/' + this.id;
      else
        return cls._endpointUrl;
    };

    /**
     * Delete a job.
     */
    pro.delete = function() {
      var self = this;
      return this._serializeRequest(function() {
        if (!self.id) return $q.when(true);

        self.forget();

        return $http.delete(self._getUrl())
          .error(function() {
            // TODO: more serious error handling.
            self.$allModels.push(self);
          });
      });
    };

    /**
     * Makes request using makeRequest() after previous requests are
     * complete (or have failed).
     * Returns a promise that is resolved with the result of makeRequest.
     * This effectively serializes all requests of this object made.
     * @param {function} makeRequest function that makes the actual request.
     * @returns {Object} promise resolved with result of makeRequest
     * @protected
     */
    pro._serializeRequest = function(makeRequest) {
      var self = this;
      var deferred = $q.defer();
      // wait till previous request is complete.
      (self.$pendingRequest || $q.when()).finally(function() {
        var result = makeRequest();
        result.finally(function() {
          delete self.$pendingRequest;
        });
        deferred.resolve(result);
      });
      self.$pendingRequest = deferred.promise;
      return deferred.promise;
    };

    BaseModel.getById = function(id) {
      return _.findWhere(this.$allModels, {id: id});
    };

    BaseModel.loadAll = function() {
      var cls = this;
      $http.get(cls._endpointUrl).then(function(response) {
        // Wrap items in new SendJob objects.
        cls.loadData(response.data);
      });
    };

    /**
     * Popuplate jobs from given data.
     * @param {Array.<Object>} data jobs.
     */
    BaseModel.loadData = function(data) {
      var allModels = this.$allModels;
      allModels.length = 0;
      var Cls = this;
      allModels.push.apply(allModels, data.map(function(job) {
        return new Cls(job);
      }));
      this._planUpdatePolling();
    };

    BaseModel.getCount = function() {
      return this.$allModels.length;
    };

    /**
     * Removes model from $allModels but does NOT send a delete request to the
     * server.
     */
    pro.forget = function() {
      var allModels = this.$allModels;
      var idx = allModels.indexOf(this);
      if (idx >= 0) allModels.splice(idx, 1);
    };

    /**
     * True if stored (has a key) or save request is pending.
     */
    pro.isStored = function() {
      return !!(this.id || this.$pendingRequest);
    };

    /**
     * Override this to add update polling.
     * @private
     */
    BaseModel._planUpdatePolling = function() {
    };

    /**
     * Save job to rest api.
     */
    pro.put = function() {
      var self = this;
      var cls = this.constructor;

      return self._serializeRequest(function() {
        var url = self._getUrl();
        if (!self.id) {
          if (!_.contains(self.$allModels, self))
            self.$allModels.push(self);
        }

        if (angular.isUndefined(self.utcOffset) && self.scheduledAt) {
          self.utcOffset = self.scheduledAt.getTimezoneOffset();
        }

        var result = $http.post(url, self);
        return result.then(function(resp) {
          // console.log(resp.status);
          self.update(resp.data, true);
          // this is the only point where persisted scheduledAt
          // dates of loaded jobs change.
          cls._planUpdatePolling();
          // we do not return a promise result for put.
          return result;
        }, function() {
          // TODO: more serious error handling.
          self.forget();
          return result;
        });
      });
    };

    return BaseModel;
  }])
  .factory('BaseJob',
    ['$http', '$q', '$timeout',
      'BaseModel', function($http, $q, $timeout, BaseModel) {
      /**
       * Base class for all scheduled jobs.
       * @param {Object} obj properties will be copied to this.
       * @constructor
       * @extends {BaseModel}
       *
       * TODO: we should move the storage stuff to a separate storage class.
       */
      function BaseJob(obj) {
        BaseModel.call(this, obj);
      }

      BaseModel._inherit(BaseJob);
      var pro = BaseJob.prototype;
      /**
       * @type {number} interval in ms between polling requests of jobs
       * in processing state.
       */
      BaseJob.PROCESSING_POLL_INTERVAL = 20000;
      BaseJob._pollTimerPromise = null;
      BaseJob._activePollTimerInterval = null;
      BaseJob._ignoredPutUpdateAttrs = ['scheduledAt', 'messageId'];
      /**
       * When a job changes to given state during polling, it is reset
       * and removed from $allModels.
       * @type {Array}
       * @private
       */
      BaseJob._autoResetStates = ['failed'];
      /**
       * When it is detected that a job failed (by polling) it reset and
       * removed from $allModels. The attributes in this list are NOT reset.
       * @type {Array.<string>}
       * @protected
       */
      BaseJob._autoResetPreserveAttrs = [];

      /**
       * Helper to inherit from BaseJob. This also takes care of creating a own,
       * $allModels array for the subclass.
       * @param {Function} cls subclass constructor.
       * @protected
       */
      BaseJob._inherit = function(cls) {
        angular.extend(cls, BaseJob,
          {prototype: Object.create(BaseJob.prototype)});
        cls.prototype.constructor = cls;
        cls.$allModels = [];
        cls._ignoredPutUpdateAttrs = BaseJob._ignoredPutUpdateAttrs;
      };

      /**
       * Update job fiels from object.
       */
      pro.update = function() {
        BaseModel.prototype.update.apply(this, arguments);
        // angular.copy(obj || {}, this);
        if (angular.isString(this.scheduledAt)) {
          this.scheduledAt = new Date(this.scheduledAt);
        }
      };

      /**
       * @return {boolean} true if this job is scheduled or has not been
       * saved yet.
       */
      pro.isScheduled = function() {
        return !this.state || this.state === 'scheduled';
      };

      /**
       * Delete all properties of this job.
       * @param {boolean=} preserveFailSafe preserves
       * cls._autoResetPreserveAttrs if true.
       * @protected
       */
      pro._reset = function(preserveFailSafe) {
        var failsafe = this.constructor._autoResetPreserveAttrs;
        for (var key in this) {
          if (this.hasOwnProperty(key) &&
            (!preserveFailSafe || failsafe.indexOf(key) == -1))
            delete this[key];
        }
      };


      /**
       * @return {boolean} if scheduled before now.
       */
      pro.isDue = function() {
        if (this.scheduledAt) {
          var now = new Date();
          return this.scheduledAt <= now;
        }
        return false;
      };


      /**
       * Updates all jobs with display state processing from backend.
       */
      BaseJob.updateProcessing = function() {
        var cls = this;
        var allIds = [];
        var jobsByIds = {};
        this.$allModels.forEach(function(job) {
          if (job.shouldPoll() && job.id) {
            jobsByIds[job.id] = job;
            allIds.push(job.id);
          }
        });
        if (!allIds.length) return $q.when();
        // TODO: pool these requests.
        var query = '?id=' + allIds.join('&id=');
        return $http.get(cls._endpointUrl + query)
          .success(function(result) {
            result.forEach(function(jobData) {
              var job = jobsByIds[jobData.id];
              if (job) {
                // remove failed jobs and reset object.
                if (cls._autoResetStates.indexOf(jobData.state) >= 0) {
                  job.forget();
                  job._reset(true);
                } else {
                  job.update(jobData);
                }
              }
            });
          });
      };

      /**
       * Schedules next processing poll update at _nextPollInterval(). But only
       * if there isn't a poll scheduled  earlier.
       */
      BaseJob._planUpdatePolling = function() {
        var cls = this;

        function pollAndReschedule() {
          cls._activePollTimerInterval = null;
          cls.updateProcessing().then(function() {
            cls._planUpdatePolling();
          });
        }

        var nextInterval = cls._getNextPollInterval();
        // (re-) schedule next poll update.
        if (cls._activePollTimerInterval === null ||
          nextInterval < cls._activePollTimerInterval) {
          if (cls._pollTimerPromise) $timeout.cancel(cls._pollTimerPromise);
          cls._pollTimerPromise = $timeout(pollAndReschedule, nextInterval);
        }
      };

      /**
       * @return {number} interval in ms that should be waited before polling
       * for processing jobs for an update.
       * @private
       */
      BaseJob._getNextPollInterval = function() {
        var cls = this;
        var hasProcessing = this.$allModels.some(function(job) {
          return job.shouldPoll();
        });
        if (hasProcessing) {
          return cls.PROCESSING_POLL_INTERVAL;
        }

        var allDates = cls._getAllByDisplayState('scheduled').map(function(job) {
          return job.scheduledAt;
        });
        var nextScheduledDate = _.min(allDates);
        var distanceInMs = nextScheduledDate.millisecondsFromNow();
        return distanceInMs + cls.PROCESSING_POLL_INTERVAL;
      };

      /**
       * Override this to return true if job should be updated by
       * auto-polling. This should happen when it is assumed that the job is
       * currently processed on the backend.
       * The default implementation returns true if getDisplayState() is
       * 'processing'.
       * @return {boolean} true if job requires polling.
       */
      pro.shouldPoll = function() {
        return this.getDisplayState() == 'processing';
      };

      /**
       * @param {String} state display.
       * @return {Array.<BaseJob>} list of jobs with given display state.
       */
      BaseJob._getAllByDisplayState = function(state) {
        return this.$allModels.filter(function(job) {
          return job.getDisplayState() == state;
        });
      };

      /**
       * Returns state that is easier to use for displaying purposes than the
       * internal backend state.
       * The state is computed form the last known backend state
       * (state attribute) and due status.
       * @return {string} one of done, failed, processing, scheduled, new
       */
      pro.getDisplayState = function() {
        switch (this.state) {
          case 'done':
            return 'done';
          case 'failed':
            return 'failed';
          case 'queued':
            return 'processing';
          case 'scheduled':
            if (this.isDue())
              return 'processing';
            else
              return 'scheduled';
        }
        if (this.scheduledAt)
          return 'scheduled';
        else
          return 'new';
      };

      return BaseJob;
    }])
  .factory('SendJob', ['BaseJob',
    function(BaseJob) {

      /**
       * @param {Object} obj initial properties
       * @constructor
       * @extends {BaseJob}
       */
      function SendJob(obj) {
        BaseJob.call(this, obj);
      }

      BaseJob._inherit(SendJob);
      var pro = SendJob.prototype;
      SendJob._endpointUrl = '/api/schedule';
      SendJob._autoResetPreserveAttrs = ['messageId'];

      /**
       * @return {boolean} true if this job can be changed safely.
       */
      pro.isChangeable = function() {
        return ['scheduled', 'new'].indexOf(this.getDisplayState()) >= 0;
      };


      SendJob.getByMessageId = function(messageId) {
        return _.findWhere(this.$allModels, {messageId: messageId});
      };

      /**
       * Returns state that is easier to use for displaying purposes than the
       * internal backend state.
       * The state is computed form the last known backend state
       * (state attribute) and due status.
       * @return {string} one of sent, failed, processing, scheduled, new
       */
      pro.getDisplayState = function() {
        if (this.state == 'sent')
          return 'processing';
        var displayState = BaseJob.prototype.getDisplayState.call(this);
        if (displayState == 'done')
          return 'sent';
        else
          return displayState;
      };


      return SendJob;
    }])
  .factory('Snippet', ['BaseModel',
    function(BaseModel) {

      /**
       * @param {Object} obj initial properties
       * @constructor
       * @extends {BaseJob}
       */
      function Snippet(obj) {
        BaseModel.call(this, obj);
      }

      BaseModel._inherit(Snippet);
      var pro = Snippet.prototype;
      Snippet._endpointUrl = '/api/snippet';
      Snippet._ignoredPutUpdateAttrs = ['body', 'subject', 'name'];


      /**
       * Update job fiels from object.
       */
      pro.update = function() {
        BaseModel.prototype.update.apply(this, arguments);
        // angular.copy(obj || {}, this);
        if (angular.isString(this.updatedAt)) {
          this.updatedAt = new Date(this.updatedAt);
        }
      };

      /**
       * True if there is a pending request (delete or put).
       * @returns {boolean}
       */
      pro.isSaving = function() {
        return !!this.$pendingRequest;
      };

      Snippet.getByKeywords = function(query) {
        var words = query.split(/\s/).map(function(word) {
          return word.toLowerCase();
        });

        function containsAllWords(token) {
          if (!token) return false;
          token = token.toLowerCase();
          return words.every(function(word) {
            return token.indexOf(word) >= 0;
          });
        }

        var result = [];
        // Some adhoc ranking - snippets with all words in name score
        // 10 times higher, those with

        this.$allModels.forEach(function(snippet) {
          var all = [snippet.name, snippet.subject, snippet.body].join(' ');
          var score = containsAllWords(snippet.name) * 10 +
            containsAllWords(snippet.subject) * 3 +
            containsAllWords(all);
          if (score) {
            result.push({
              snippet: snippet,
              score: score
            });
          }
        });
        // order by score, usageCnt desc.
        result.sort(function(a, b) {
          if (a.score == b.score)
            return (b.snippet.usageCnt || 0) - (a.snippet.usageCnt || 0);
          else
            return b.score - a.score;
        });
        // remove score.
        return result.map(function(item) {
          return item.snippet;
        });
      };

      Snippet.getAll = function() {
        return this.$allModels;
      };

      return Snippet;
    }])
  .factory('localStore', ['$window', function($window) {
    /**
     * Reference to window.localStorage for easier mocking.
     */
    return $window.localStorage;
  }])
  .factory('RemindJob', ['BaseJob', '$http',
    function(BaseJob, $http) {

      /**
       * @param {Object} obj initial properties
       * @constructor
       * @extends {BaseJob}
       */
      function RemindJob(obj) {
        BaseJob.call(this, obj);
      }

      BaseJob._inherit(RemindJob);
      RemindJob._endpointUrl = '/api/remind';
      RemindJob._autoResetStates = ['failed', 'done'];
      RemindJob._autoResetPreserveAttrs = ['threadId'];
      RemindJob._ignoredPutUpdateAttrs = ['scheduledAt', 'threadId', 'onlyIfNoreply'];
      var pro = RemindJob.prototype;

      RemindJob.getByThreadId = function(threadId) {
        var jobs = _.where(this.$allModels, {threadId: threadId});
        if (!jobs.length)  return null;
        jobs.sort(function(a, b) {
          // descending by creation date.
          return (b.createdAt || 0) - (a.createdAt || 0);
        });
        return jobs[0];
      };

      /**
       * A remind job is changeable if it is in scheduled or checking state
       * on the backend or is not stored yet. We use the display state
       * to handle the case when it switches from scheduled to queued on the
       * backend but the client state has not been updated yet.
       * @return {boolean} true if this job can be changed safely.
       */
      pro.isChangeable = function() {
        return (['scheduled', 'new'].indexOf(this.getDisplayState()) >= 0) &&
          !this.isDue();
      };

      /**
       * @override
       */
      pro.shouldPoll = function() {
        return (this.state == 'scheduled' && this.isDue()) ||
          this.state == 'queued' ||
          this.state == 'checking';
      };

      /**
       * Returns
       * @returns {string} state for displaying purposes.
       */
      pro.getDisplayState = function() {
        var state = this.state;
        if (!state) {
          if (this.scheduledAt)
            return 'scheduled';
          else
            return 'new';
        } else if (state == 'checking' || state == 'disabled')
          return 'disabled';
        else if (state == 'queued' || state == 'scheduled')
          return 'scheduled';
        else {
          // failed, done
          return state;
        }
      };

      /**
       * @return {boolean} true if display state is scheduled or disabled.
       */
      pro.isInteresting = function() {
        var state = this.getDisplayState();
        return state == 'scheduled' || state == 'disabled';
      };

      /**
       * Sends request to server to check for replies the reminders'
       * conversation.
       * @param {Object} replyMsg client-side detected reply message.
       * @returns {Object} promise.
       */
      pro.postCheckReply = function(replyMsg) {
        var self = this;
        return this._serializeRequest(function() {
          self.state = 'checking';
          self.disabledReply = replyMsg;
          return $http.post(self._getUrl() + '/check_reply', replyMsg)
            .success(function() {
              return RemindJob._planUpdatePolling();
            });
        });
      };

      /**
       * @param {Conversation} conversation conversation messages.
       */
      pro.checkReply = function(conversation) {
        if (this.state == 'scheduled' && this.onlyIfNoreply) {
          var msgIds = conversation.getMessageIds();
          var unknownIds = _.difference(msgIds, this.knownMessageIds || []);
          if (unknownIds.length) {
            var msg = conversation.getMessageById(unknownIds[0]);
            this.postCheckReply(msg);
          }
        }
      };

      return RemindJob;
    }])
  .factory('relativeTimesStore', ['localStore', function(localStore) {
    /**
     * Remembers relative times used for sending mails.
     *
     * we store items like this:
     * {
     *    cnt: total number this item was used
     *    dateStr: relative date string (potentially in the past in the meanwhile)
     *    lastUsageDate: Date this item was last used
     * }
     */

    /**
     * Key used for local storage.
     * @type {string}
     */
    var STORAGE_KEY = 'slRelativeTimes';
    /// Number of max items to store.
    var STORAGE_LIMIT = 100;

    function jsonReviver(key, value) {
      if (key == 'lastUsageDate')
        return new Date(value);

      return value;
    }

    /**
     * Parse relative date string and checks if it is still in the future.
     * @param {String} str relative date string.
     * @return {boolean} true  if date string is still valid.
     */
    function isValid(str) {
      var date = Date.future(str);
      return date.isValid() && date.isFuture() && date.minutesFromNow() > 1;
    }

    /**
     * Add date string to store
     * @param {String} relativeStr relative date string.
     */
    function add(relativeStr) {
      if (!angular.isString(relativeStr)) throw new Error('only add strings');
      if (!isValid(relativeStr)) return;
      var items = loadItems();
      var existing = _.findWhere(items, {relativeStr: relativeStr});
      var now = Date.create();
      if (existing) {
        existing.cnt++;
        existing.lastUsageDate = now;
      } else {
        var item = {
          cnt: 1,
          lastUsageDate: now,
          relativeStr: relativeStr
        };
        items.unshift(item);
      }
      saveItems(items);
    }


    /**
     * Returns compare fn that sorts items descending by number of usages.
     * However all items that have not been used before oldDate come after all
     * items that have been used since.
     * @param {Date} oldDate threshold date.
     * @return {Function} compare fn.
     */
    function rankFn(oldDate) {
      function isOld(item) {
        return item.lastUsageDate < oldDate;
      }

      return function(a, b) {
        if (isOld(a) && !isOld(b))
          return 1;
        else if (isOld(b) && !isOld(a))
          return -1;
        else
          return b.cnt - a.cnt;
      };
    }

    /**
     * Sorts items with rankFn using a month ago as threshold.
     * @param {Array} items time items.
     * @return {Array}
     */
    function sortByRank(items) {
      // partition into items used within last month and items that have not
      // been used for more than a month.
      var oldDate = new Date().rewind({months: 1});
      return items.sort(rankFn(oldDate));
    }

    /**
     * Saves best ranked items, limited by STORAGE_LIMIT to local storage.
     * @param {Array.<Object>} items to save.
     */
    function saveItems(items) {
      items = sortByRank(items);
      // remove tail.
      items = items.slice(0, STORAGE_LIMIT);
      localStore[STORAGE_KEY] = JSON.stringify(items);
    }

    /**
     *
     * @return {Array.<String>} ranked items.
     */
    function getSorted() {
      var items = loadItems();
      sortByRank(items);
      return items.map(function(item) {
        return item.relativeStr;
      });
    }

    /**
     * Load items from local storage. Invalid items are automatically
     * removed from the list.
     * @return {Array.<Object>} stored items.
     */
    function loadItems() {
      var json = localStore[STORAGE_KEY];
      if (json) {
        var items = JSON.parse(json, jsonReviver);
        // Remove invalid items.
        return items.filter(function(item) {
          return isValid(item.relativeStr);
        });
      } else {
        return [];
      }
    }

    return {
      STORAGE_LIMIT: STORAGE_LIMIT,
      add: add,
      getSorted: getSorted
    };
  }]);
