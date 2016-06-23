'use strict';

describe('textutil', function() {
  beforeEach(module('gmail.utils'));

  var textutil;
  beforeEach(inject(function(_textutil_) {
    textutil = _textutil_
  }));

  describe('txt2html', function() {
    it('should preserve line breaks', function() {
      var txt = 'line1\nline2\n\nline3';
      expect(textutil.txt2html(txt)).toEqual('line1<br>line2<br><br>line3');
    });
  });

  describe('html2txt', function() {
    it('should preserve gmail line breaks', function() {
      var html = '<div dir="ltr">line1<div>line2</div><div><br></div>' +
        '<div>line3</div><div><br></div><div><br>' +
        '</div><div>line4</div></div>';
      expect(textutil.html2txt(html)).toEqual(
        'line1\nline2\n\nline3\n\n\nline4');
    });

    it('should convert links to txt', function() {
      var html = '<div dir="ltr">go <a href="http://example.com">' +
        'here</a></div>';
      expect(textutil.html2txt(html)).toEqual('go here (http://example.com)');
    });

    it('should email links to txt', function() {
      var html = '<div dir="ltr">go <a href="mailto:x@y.com">' +
        'here</a></div>';
      expect(textutil.html2txt(html)).toEqual('go here (x@y.com)');
    });

    it('should preserve whitespace', function() {
      var html = '<div dir="ltr">1 2 &nbsp;3 &nbsp; 4</div>';
      expect(textutil.html2txt(html)).toEqual('1 2 \xa03 \xa0 4');
    });

    it('should preserve paragraph breaks', function() {
      var html = '<p>line1</p><p>line2</p>';
      expect(textutil.html2txt(html)).toEqual('\nline1\nline2');
    });

    it('should preserve plain text line break', function() {
      var html = 'line1<br>line2<br><br>line3<br><br><br>line4';
      expect(textutil.html2txt(html)).toEqual(
        'line1\nline2\n\nline3\n\n\nline4');
    });
  });
});
