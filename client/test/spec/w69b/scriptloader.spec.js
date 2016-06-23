'use strict';

describe('w69b: scriptloader', function() {
  beforeEach(module('w69b.scriptloader'));

  var fakeDoc, loader;
  beforeEach(module(function($provide) {
    fakeDoc = angular.element('<div></div>');
    $provide.value('$document', fakeDoc);
  }));

  beforeEach(inject(function(scriptloader) {
    loader = scriptloader;
  }));

  describe('with script already loaded', function() {
    var url = 'http://doesnotexist.localhost/testsrc';
    beforeEach(function() {
      var elem  = angular.element('<script src="' + url + '"></script>');
      fakeDoc.append(elem);
    });

    it('should detect loaded script', function() {
      expect(loader.isInDom(url)).toBe(true);
      expect(loader.isInDom(url + '/another')).toBe(false);
      expect(loader.isInDom(url + '/another', true)).toBe(false);
    });

    it('should not load already loaded url', inject(function($rootScope) {
      var oldhtml = fakeDoc.html();
      var spy = jasmine.createSpy();
      loader.load(url).then(spy);
      $rootScope.$digest();
      expect(spy).toHaveBeenCalled();
      expect(fakeDoc.html()).toEqual(oldhtml);
    }));

    it('should load other urls', inject(function($rootScope) {
      var newurl = url + '/another';
      expect(fakeDoc.html()).not.toContain(newurl);
      var spy = jasmine.createSpy();
      loader.load(newurl).then(spy);
      expect(fakeDoc.html()).toContain(newurl);
      expect(spy).not.toHaveBeenCalled();

      var oldhtml = fakeDoc.html();
      // trigger loading of same url again.
      var spy2 = jasmine.createSpy();
      loader.load(newurl).then(spy2);
      expect(spy2).not.toHaveBeenCalled();

      // fakeDoc.find('script').eq(1).trigger('load');
      // expect(spy).toHaveBeenCalled();
      // expect(spy2).toHaveBeenCalled();
      expect(fakeDoc.html()).toEqual(oldhtml);
    }));
  });

});
