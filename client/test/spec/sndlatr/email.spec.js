describe('Email validate regepr', function() {
  beforeEach(module('sndlatr.email'));

  var re;
  beforeEach(inject(function(EMAIL_VALIDATE_RE) {
    re = EMAIL_VALIDATE_RE;
  }));

  it('should accept valid adresses', function() {
    expect(re.test('john@example.com')).toBe(true);
    expect(re.test('john@test.museum')).toBe(true);
    expect(re.test('john@some.domain')).toBe(true);
  });

  it('should reject invalid adresses', function() {
    expect(re.test('john@examplecom')).toBe(false);
    expect(re.test('john@localhost')).toBe(false);
  });

});

describe('email', function() {
  beforeEach(module('sndlatr.email'));
  var email;
  beforeEach(inject(function(_email_) {
    email = _email_;
  }));

  describe('find', function() {
    it('should extract mails', function() {
      expect(email.find('asdf kj a@x.org joe@y.org hihi'))
        .toEqual(['a@x.org', 'joe@y.org']);
    });

    it('should extract exact match', function() {
      expect(email.find('a@x.org'))
        .toEqual(['a@x.org']);
    });
  });

  describe('validate', function() {
    var validator;
    beforeEach(function() {
      validator = email.validate;
    });

    it('should accept common rfc2822 formats', function() {
      expect(validator('john doe <doe@example.com>')).toBe(true);
      expect(validator('john doe (doe@example.com) ')).toBe(true);
      expect(validator('doe@example.com ')).toBe(true);
    });

    it('should reject confusing brackets', function() {
      expect(validator('john <doe <doe@example.com>')).toBe(false);
      expect(validator('john doe <doe@example.com)')).toBe(false);
      expect(validator('john doe (doe@example.com')).toBe(false);
    });

    it('should reject invalid email addresses', function() {
      expect(validator('doe@localhost')).toBe(false);
      expect(validator('john doe <doe@example>')).toBe(false);
    })
  });
});
