'use strict';

describe('conversationStore', function() {
  beforeEach(module('gmail.conversation'));

  var CACHE_SIZE = 10;
  var CACHE_SIZE_HARD_LIMIT = CACHE_SIZE + 10;

  beforeEach(module(function(conversationStoreProvider) {
    conversationStoreProvider.setCacheSize(CACHE_SIZE);
  }));

  var store;

  beforeEach(inject(function(conversationStore) {
    store = conversationStore;

    store.addConversation('orig', ['orig']);
    store.addMessage({messageId: 'orig'});
    store.addMessage({origMessageId: 'orig', messageId: 'msg1'});
    store.addMessage({origMessageId: 'orig', messageId: 'msg2'});
    store.addMessage({origMessageId: 'msg1', messageId: 'msg3'});
  }));


  it('should find conversations by any message id', function() {
    var conv = store.getConversation('msg1');
    expect(conv).toEqual(store.getConversation('orig'));
    expect(conv).toEqual(store.getConversation('msg3'));
  });

  describe('Conversation', function() {
    var conversation;
    beforeEach(function() {
      conversation = store.getConversation('orig');
    });

    it('should return first msgId as thread id', function() {
      expect(conversation.getThreadId()).toEqual('orig');
    });

    it('should keep message order', function() {
      expect(conversation.getMessageIds()).toEqual(['orig', 'msg1', 'msg2',
        'msg3']);
    });

    it('should return messages by id', function() {
      expect(conversation.getMessageById('msg1')).toEqual(
        {messageId: 'msg1', origMessageId: 'orig'});
    });

    it('should return odered list of messages', function() {
      var msgs = conversation.getMessages();
      expect(msgs.length).toEqual(4);
      expect(msgs[0].messageId).toEqual('orig');
      expect(msgs[3].messageId).toEqual('msg3');
      expect(msgs[3].origMessageId).toEqual('msg1');
    });
  });

  it('should open new conversation for emtpy origMessageId', function() {
    store.addConversation('other', []);
    store.addMessage({messageId: 'other'});
    store.addMessage({messageId: 'otherMsg1', origMessageId: 'other'});
    var conv = store.getConversation('other');
    expect(conv.getMessageIds()).toEqual(['other', 'otherMsg1']);
  });

  it('should enforce soft storage limit', function() {
    for (var i = 0; i < CACHE_SIZE_HARD_LIMIT; ++i) {
      var id = 'msg_l_' + i;
      store.addConversation(id, [id]);
      store.addMessage({messageId: id});
    }
    expect(store.getConversation('msg_l_0')).toBeUndefined();
    expect(store.getConversation('msg_l_9')).toBeUndefined();
    expect(store.getConversation('msg_l_' +
      (CACHE_SIZE_HARD_LIMIT - CACHE_SIZE))).not.toBeUndefined();
  });
});
