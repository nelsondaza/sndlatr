import Cookie
import os
import json
from functools import wraps

import oauth2client.appengine
import oauth2client.client

from w69b.httperr import HTTPForbidden
from w69b.handlers import TemplateBaseHandler, JSONMixin
from w69b import xsrf, idtokenauth
import webapp2

_oauth_decorator = None

_CLIENT_SECRETS = os.path.join(os.path.dirname(__file__), '..',
                               'client_secrets.json')
# SCOPE = 'https://www.googleapis.com/auth/tasks.readonly'
SCOPES = ['email', 'openid', 'https://mail.google.com/']


def credentials_from_code(code):
    """ Exchange code for client secrets """
    return oauth2client.client.credentials_from_clientsecrets_and_code(
        _CLIENT_SECRETS, SCOPES, code)


class XSRFTool(object):
    def __init__(self, handler):
        self.handler = handler
        secret = handler.app.config.get('xsrf_secret')
        if not secret:
            raise Exception('no xsfr_secret configured')
        user = get_current_user()
        self.token = xsrf.XSRFToken(user.user_id(), secret)

    def add_cookie(self):
        """  Adds cookie XSRF-TOKEN to current response. """
        self.handler.response.set_cookie(
            'XSRF-TOKEN', self.token.generate_token_string())

    def verify(self):
        """
        Verifys if request has a valid  X-XSRF-TOKEN token. Raises
        HTTPForbidden else.
        """
        token_str = self.handler.request.headers.get('X-XSRF-TOKEN')
        if not token_str:
            raise HTTPForbidden('no XSRF header')
        try:
            self.token.verify_token_string(token_str)
        except xsrf.XSRFException:
            raise HTTPForbidden('invalid XSRF token')


def login_required(handler_method):
    """A decorator to require that a user be logged in to access a handler.

    To use it, decorate your method like this::

        @login_required
        def get(self):
            user = auth.get_current_user()
            self.response.out.write('Hello, ' + user.nickname())

    raises HTTPForbidden error if user is not logged in.
    """

    def check_login(self, *args, **kwargs):
        user = get_current_user()
        if user:
            # XSRFTool(self).verify()
            return handler_method(self, *args, **kwargs)
        else:
            raise HTTPForbidden('not_logged_in')

    return check_login


def admin_required(handler_method):
    """
    Same as login_required but requires user to be an admin.
    """

    def check_login(self, *args, **kwargs):
        if is_current_user_admin():
            return handler_method(self, *args, **kwargs)
        else:
            raise HTTPForbidden('forbidden')

    return check_login


def get_current_user():
    """ Currently just a wrapper around the goolge user api. """
    return idtokenauth.get_current_user()


def _auth_json(user):
    """  Return json data for user object. """
    auth_json = json.dumps({'nick': user.nickname()})
    return auth_json


class SignedInHandler(TemplateBaseHandler):
    """ Redirects to google login url. """

    def get(self):
        user = get_current_user()
        if not user:
            self.redirect('/api/login')
            return
        auth_json = _auth_json(user)
        XSRFTool(self).add_cookie()
        self.render_response('signed_in.html', auth=auth_json)


class CheckAuthHandler(JSONMixin, webapp2.RequestHandler):
    """ Get JSON data of currently signed in user"""

    def get(self):
        user = get_current_user()
        if user:
            XSRFTool(self).add_cookie()
            return self.write_json(_auth_json(user))
        else:
            return self.response_json(None)


class LogoutHandler(webapp2.RequestHandler):
    def post(self):
        # self.redirect(users.create_logout_url())
        # TODO: check self.request.referer
        if os.environ.get('SERVER_SOFTWARE', '').startswith('Development/'):
            self.response.delete_cookie('dev_appserver_login')
            return

        # On the production instance, we just remove the session cookie, because
        # redirecting users.create_logout_url(...) would log out of all Google
        # (e.g. Gmail, Google Calendar).
        #
        # It seems that AppEngine is setting the ACSID cookie for http:// ,
        # and the SACSID cookie for https:// . We just unset both below.
        self.response.delete_cookie('ACSID')
        self.response.delete_cookie('SACSID')


def is_dev():
    """ returns True on Dev and testing environment """
    return os.environ.get('SERVER_SOFTWARE', '').startswith('Development/')


def _require_header(func, header):
    """ allows method to run only if a given gae header is present """

    @wraps(func)
    def decorated(self, *args, **kwargs):
        if self.request.headers.get(header) or is_dev():
            return func(self, *args, **kwargs)
        else:
            raise HTTPForbidden()

    return decorated


def cron_only(func):
    """ allows methods to run only from a cron job """
    return _require_header(func, 'X-Appengine-Cron')


def task_only(func):
    """ allows methods to run only from a cron job """
    return _require_header(func, 'X-AppEngine-QueueName')

    # @wraps(func)
    # def decorated(self, *args, **kwargs):
    #     if self.request.headers.get('X-Appengine-Cron') == 'true' or is_dev():
    #         return func(self, *args, **kwargs)
    #     else:
    #         raise httperr.HTTPForbidden()

    # return decorated
