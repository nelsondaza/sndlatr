import threading
import json

import webapp2
import httplib2
from oauth2client import crypt, client

_cached_http = httplib2.Http(client.MemoryCache())


def verify_id_token(id_token, audience, http=None,
                    cert_uri=client.ID_TOKEN_VERIFICATON_CERTS):
    """Verifies a signed JWT id_token.

    This function requires PyOpenSSL and because of that it does not work on
    App Engine.

    Args:
      id_token: string, A Signed JWT.
      audience: string, The audience 'aud' that the token should be for.
      http: httplib2.Http, instance to use to make the HTTP request. Callers
        should supply an instance that has caching enabled.
      cert_uri: string, URI of the certificates in JSON format to
        verify the JWT against.

    Returns:
      The deserialized JSON in the JWT.

    Raises:
      oauth2client.crypt.AppIdentityError if the JWT fails to verify.
    """
    if http is None:
        http = _cached_http

    resp, content = http.request(cert_uri)

    if resp.status == 200:
        certs = json.loads(content)
        return crypt.verify_signed_jwt_with_certs(id_token, certs, audience)
    else:
        raise client.VerifyJwtTokenError('Status code: %d' % resp.status)


def get_current_user():
    """  GAE compatibility method. """
    request = webapp2.get_request()
    app = webapp2.get_app()
    audience = app.config.get('idtoken_audience')
    if not audience:
        raise Exception('idtoken_audience not configured')
    token = request.headers.get('x-w69b-idtoken')
    return _user_from_token(token, audience)


class User(object):
    """ Appengine User compatible User class. """

    def __init__(self, email=None, _user_id=None):
        self._email = email
        self._user_id = _user_id

    def email(self):
        return self._email

    def nickname(self):
        return self.email()

    def user_id(self):
        return self._user_id


def _user_from_token(token, audience):
    """ Returns User object or None if token is not valid or None. """
    if token is None:
        return None
    try:
        verified_token = verify_id_token(token, audience)
        return User(email=verified_token['email'],
                    _user_id=verified_token['sub'])
    except (crypt.AppIdentityError, KeyError):
        return None


class Decorator(object):
    """
    Provides user_aware decorator that gives access to user as
    decorator.user (None it not authenticated)

    """

    def __init__(self, audience):
        self._thread_local_store = threading.local()
        self.audience = audience
        self._header_name = 'x-w69b-idtoken'

    @property
    def user(self):
        return getattr(self._thread_local_store, 'user', None)

    @user.setter
    def user(self, user):
        self._thread_local_store.user = user

    def user_aware(self, method):
        """
        Provides decorator.user object that for request handler methods
        that use this decorator. The property is None if no user is
        authenticated.
        """

        def setup_user(request_handler, *args, **kwargs):
            token = request_handler.request.headers.get(self._header_name)
            self.user = _user_from_token(token, self.audience)
            try:
                resp = method(request_handler, *args, **kwargs)
            finally:
                self.user = None
            return resp

        return setup_user
