'use strict';

describe('Service: throttle', function() {
  beforeEach(module('w69b.throttle'));

  var $timeout, throttle;
  var spy, throttled;


  beforeEach(inject(function(_throttle_, _$timeout_) {
    throttle = _throttle_;
    $timeout = _$timeout_;
    spy = jasmine.createSpy();
    throttled = throttle(spy, 100);
  }));

  afterEach(function() {
    $timeout.verifyNoPendingTasks();
  });

  describe('flush', function() {
    it('should run pending', function() {
      throttled('hello');
      throttled.flush();
      expect(spy).toHaveBeenCalledWith('hello');
    });

    it('should do nothing if no task pending', function() {
      throttled.flush();
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('throttling', function() {
    it('should call original fn after delay', function() {
      throttled('hello', 'world');
      expect(spy).not.toHaveBeenCalled();
      $timeout.flush(100);
      expect(spy).toHaveBeenCalledWith('hello', 'world');
    });

    it('should only call fn once during delay', function() {
      throttled(1);
      throttled(2);
      $timeout.flush(50);
      throttled(3);
      $timeout.flush(99);
      throttled(4);
      expect(spy).not.toHaveBeenCalled();
      $timeout.flush(100);
      expect(spy).toHaveBeenCalledWith(4);
    });
  });

});
