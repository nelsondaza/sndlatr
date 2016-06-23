'use strict';

angular.module('gmail.conversation', [])
  .provider('conversationStore',
  function() {
    // maximum number of conversations to keep track of. This is a soft limit.
    // note: observed something like 1000.
    var CONVERSATION_CACHE_SIZE = 1500;

    /**
     * Sets soft storage limit
     * @param {number} size number of conversations.
     */
    this.setCacheSize = function(size) {
      CONVERSATION_CACHE_SIZE = size;
    };

    this.$get = ['$log', function($log) {
      var conversations = [];
      var msgIdsToConversations = {};

      var conversationSequence = 0;

      /**
       * Conversation implemented as a ordered bag of messages, indexed
       * by message ids.
       * @param {string} threadId thread id (usually first message id).
       * @param {Array.<string>} msgIds message ids in conversation.
       * @constructor
       */
      function Conversation(threadId, msgIds) {
        /**
         * Hash of messages by message id.
         * @type {Object.<string,Object>}
         * @private
         */
        this._msgs = {};
        /**
         * Ordered list of message ids.
         * @type {Array.<string>}
         * @private
         */
        this._orderedIds = msgIds;
        this._threadId = threadId;
        // initialize messages with null for known ids.
        msgIds.forEach(function(id) {
          this._msgs[id] = null;
        }, this);
        this._updateTimestamp();
      }

      var pro = Conversation.prototype;

      pro._updateTimestamp = function() {
        this.sequenceId = conversationSequence++;
      };

      /**
       * Adds message to end of list or replaces existing message with same id
       * if existent.
       * @param {Object} msg message object.
       */
      pro.addMessage = function(msg) {
        // If message with same id does exists, replace. Else add
        // to end of list.
        if (!this._msgs.hasOwnProperty(msg.messageId)) {
          this._orderedIds.push(msg.messageId);
        }
        this._msgs[msg.messageId] = msg;
        this._updateTimestamp();
      };

      /**
       * Get messages ordered by time they where first added.
       * @returns {Array.<Object>} ordered messages.
       */
      pro.getMessages = function() {
        var msgs = [];
        this._orderedIds.forEach(function(msgId) {
          msgs.push(this._msgs[msgId]);
        }, this);
        return msgs;
      };

      /**
       * @param {string} msgId message id.
       * @returns {Object} message
       */
      pro.getMessageById = function(msgId) {
        return this._msgs[msgId];
      };

      /**
       * @returns {Array.<string>} ordered list of message ids.
       */
      pro.getMessageIds = function() {
        return this._orderedIds;
      };

      /**
       * Gets the thread id aka message id of the first message in the
       * conversation.
       */
      pro.getThreadId = function() {
        return this._threadId;
      };


      /**
       * Add message to storage. If a conversation with the
       * origMessageId exists it adds the message to the end of this
       * conversation.
       * Adds a new conversation to the storage if the message does not have
       * a origMessageId defined.
       * The original message of a conversation (the one without origMessageId)
       * must always be added first. Otherwise an error is thrown.
       * This simplifies processing by assuming xhr messages are ordered.
       * @param msg
       */
      function addMessage(msg) {
        var conv = msgIdsToConversations[msg.messageId];
        if (!conv && msg.origMessageId)
          conv = msgIdsToConversations[msg.origMessageId];
        if (!conv) throw new Error('conversation for message not known');
        conv.addMessage(msg);
        msgIdsToConversations[msg.messageId] = conv;
      }

      /**
       * Adds new conversation or replaces existing one.
       * @param {string} threadId thread id.
       * @param {Array.<string>} messageIds list of ordere message ids.
       */
      function addConversation(threadId, messageIds) {
        var conv = msgIdsToConversations[threadId];
        // delete existing conversation if it exists.
        if (conv) {
          deleteIndexesOfConversation(conv);
          conversations.splice(conversations.indexOf(conv), 1);
        }
        // create new conversation.
        conv = new Conversation(threadId, messageIds);
        conversations.push(conv);
        messageIds.concat(threadId).forEach(function(id) {
          msgIdsToConversations[id] = conv;
        });
        enforceSoftConversationLimit();
      }

      /**
       * Removes message id index for given bag.
       * @param {Conversation} bag to delete indexes for.
       */
      function deleteIndexesOfConversation(bag) {
        bag.getMessageIds().forEach(function(msgId) {
          delete msgIdsToConversations[msgId];
        });
        // can be different from first message id.
        delete msgIdsToConversations[bag.getThreadId()];
      }

      function enforceSoftConversationLimit() {
        // Soft limit.
        if (conversations.length > CONVERSATION_CACHE_SIZE + 10) {
          $log.debug('enforcing conversation store size limit');
          // Sort conversations by descending sequenceId.
          conversations.sort(function(a, b) {
            return b.sequenceId - a.sequenceId;
          });
          conversations.splice(CONVERSATION_CACHE_SIZE, conversations.length)
            .forEach(deleteIndexesOfConversation);
        }
      }

      /**
       * Get conversation by message message id of any message in the
       * conversation.
       * @param {string} msgId message id.
       * @return {Conversation} or undefined if not found.
       */
      function getConversation(msgId) {
        // conversations
        return msgIdsToConversations[msgId];
      }

      return {
        addMessage: addMessage,
        getConversation: getConversation,
        addConversation: addConversation
      };
    }];
  });
