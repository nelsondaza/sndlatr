'use strict';

angular.module('gmail.utils', [])
  .factory('textutil', function() {

    function browserHtml2Txt(html) {
      return angular.element('<div></div>').html(html).text();
    }

    /**
     * Only use this with sanitized input.
     * @param {string} html
     * @returns {string} txt.
     */
    function html2txt(html) {
      var txt = html.
        replace(/\s+/gm, ' ')
        .replace(/<br>/gim, '<br>\n')
        .replace(/<div><br><\/div>/gim, '<br>\n')
        .replace(/<p[^>]*>/gim, '<br>\n')
        .replace(/<div>(.*?)<\/div>/gim, '<br>\n$1')
        .replace(/<a[^>]*href="(?:mailto:)?(.*?)"[^>]*>(.*?)<\/a>/gim,
          '$2 ($1)');
      // .replace(/<[^>]*>?/gm, "");
      return browserHtml2Txt(txt);
      //
    }

    function txt2html(txt) {
      return txt.replace(/\n/gm, '<br>');
    }

    return {
      html2txt: html2txt,
      txt2html: txt2html
    };
  });
