'use strict';

angular.module('gmail.css', [])
  .factory('gmailCss', function() {
    var css = {};
    // Conversation main view table.
    // css.conversation = 'table.Bs';
    // Subject div in conversation view.
    css.conversationSubject = '.hP';
    // right sidebar container element, suitable for inserting custom boxes.
    css.conversationSidebar = '.y3 > .adC > .nH';
    css.conversationMoreButton = '.G-Ni:nth-last-child(2)';
    css.draftEditable = 'div.Am[contenteditable=true], div.Am.editable iframe';
    // editable in iframe
    css.draftIframeEditable= 'body.editable[role=textbox]';
    css.draftSubjectInput = 'input[name=subjectbox]';
    return css;
  });



