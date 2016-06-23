'use strict';

angular.module('w69b.uritool', [])
  .factory('uritool', function() {

    var spaceRe = /\+/g;

    function decode(s) {
      return decodeURIComponent(s.replace(spaceRe, ' '));
    }

    var api = {};
    /**
     * Parses query string.
     * @param {String} query query string.
     * @param {boolean=} multi returns array values if true.
     * @return {Object} key value mapping.
     */
    api.parseQuery = function(query, multi) {
      if (query[0] == '?') query = query.substring(1);
      var match;
      var search = /([^&=]+)=?([^&]*)/g;
      var params = {};
      while ((match = search.exec(query))) {
        var key = decode(match[1]);
        var value = decode(match[2]);
        if (multi && params.hasOwnProperty(key)) {
          params[key].push(value);
        } else {
          params[key] = multi ? [value] : value;
        }
      }
      return params;
    };

    api.parseUrl = function(url) {
      var a = document.createElement('a');
      a.href = url;
      return {
        protocol: a.protocol.replace(':', ''),
        host: a.hostname,
        port: a.port,
        query: a.search,
        hash: a.hash,
        path: a.pathname
      };
    };


    return api;
  });
