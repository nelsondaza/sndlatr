'use strict';

angular.module('sndlatr.email', [])
  // see http://www.regular-expressions.info/email.html
  .constant('EMAIL_VALIDATE_RE',
    /^[a-z0-9!#$%&'*+\/=?\^_`{|}~\-]+(?:\.[a-z0-9!#$%&'*+\/=?\^_`{|}~\-]+)*@(?:[a-z0-9](?:[a-z0-9\-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9\-]*[a-z0-9])?$/i)
  .constant('EMAIL_FIND_RE',
    /\b[a-z0-9!#$%&'*+\/=?\^_`{|}~\-]+(?:\.[a-z0-9!#$%&'*+\/=?\^_`{|}~\-]+)*@(?:[a-z0-9](?:[a-z0-9\-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9\-]*[a-z0-9])?\b/g)
  .factory('email', ['EMAIL_VALIDATE_RE', 'EMAIL_FIND_RE',
    function(EMAIL_VALIDATE_RE, EMAIL_FIND_RE) {
      /**
       * Validator for email addresses. It accepts a subset of rfc 2822
       * as valid. It allow email addresses like
       * - john doe <john@example.com>
       * - john@example.com
       * John (john@example.com)
       *
       * where the email part has to match EMAIL_VALIDATE_RE.
       */
      function validate(email) {
        email = email.trim();
        if (EMAIL_VALIDATE_RE.test(email)) {
          return true;
        } else {
          var match = email.match(/[^<>\(\)]*(?:<(.*)>)|(?:\((.*)\))$/);
          if (match) {
            email = match[1] || match[2];
            return EMAIL_VALIDATE_RE.test(email);
          }
          return false;
        }
      }

      /**
       * Find email addresses in text.
       * @param {string} text to search.
       * @return {!Array.<string>} array of found email addresses.
       */
      function find(text) {
        var match;
        var result = [];
        while ((match = EMAIL_FIND_RE.exec(text))) {
          result.push(match[0]);
        }
        return result;
      }

      return {
        validate: validate,
        find: find
      };
    }]);




