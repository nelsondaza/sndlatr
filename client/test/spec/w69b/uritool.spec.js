'use strict';

describe('uritool', function() {
  beforeEach(module('w69b.uritool'));

  var uritool;

  beforeEach(inject(function(_uritool_) {
    uritool = _uritool_;
  }));


  describe('parseUrl', function() {
    it('should simple urls', function() {
      var parsed = uritool.parseUrl('/test/hihi?foo=bar&hi=ho');
      expect(parsed.query).toEqual('?foo=bar&hi=ho');
    });
  });

  describe('parseQuery', function() {
    it('should parse simple query strings', function() {
      expect(uritool.parseQuery('?foo=bar&hi=ho')).toEqual(
        {foo: 'bar', hi: 'ho'});
    });

    it('should parse multi valued query strings', function() {
      expect(uritool.parseQuery('?foo=bar&foo=bar2&single=hello', true))
        .toEqual({foo: ['bar', 'bar2'], single: ['hello']});
    });
  });

});
