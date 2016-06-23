import os
import json
import os
from unittest import TestCase
from contextlib import contextmanager

import webapp2
from google.appengine.ext import testbed
import mock

import main


test_data_dir = os.path.join(os.path.dirname(__file__), 'data')


def fixture_file(filename):
    """ Returns path of test data file """
    return os.path.join(test_data_dir, filename)


def fixture_file_content(filename):
    """ Returns content of test file """
    with open(fixture_file(filename)) as fd:
        return fd.read()


class BaseTestCase(TestCase):
    enable_xsrf = False

    def setUp(self):
        self.testbed = testbed.Testbed()

        self.testbed.activate()
        self.testbed.init_user_stub()
        self.testbed.init_datastore_v3_stub()
        self.testbed.init_memcache_stub()
        self.testbed.init_urlfetch_stub()
        self.testbed.init_mail_stub()
        self.testbed.init_taskqueue_stub(
            root_path=os.path.join(os.path.dirname(__file__), '..'))
        self.addCleanup(self.testbed.deactivate)

        self.taskqueue_stub = self.testbed.get_stub(
            testbed.TASKQUEUE_SERVICE_NAME)
        self.mail_stub = self.testbed.get_stub(testbed.MAIL_SERVICE_NAME)

        urlfetch = self.testbed.get_stub('urlfetch')
        urlfetch._RetrieveURL = self.retrieve_mock
        self._response_queue = []
        self.patch_xsrf()

    def set_next_response(self, code, content, persist=False):
        """ Set response for next ctx.urlfetch call.
        If persist is true this response is always returned.
        """
        self._response_queue.append((code, content, persist))

    def send_request(self, path, post=None, json_data=None, headers=None,
                     method=None):
        """
        Send request to main app. Returns response object.
        If json_data is given (dict) it is encoded and sent as post payload.
        """
        if headers is None:
            headers = {}
        if json_data is not None:
            post = json.dumps(json_data)
            headers['Content-Type'] = 'application/json'
        request = webapp2.Request.blank(path, POST=post, headers=headers)
        if method:
            request.method = method
        return request.get_response(main.app)

    def retrieve_mock(self, url, payload, method, headers, request, response,
                      **kwargs):
        if self._response_queue:
            status, content, persist = self._response_queue[-1]
            if not persist:
                self._response_queue.pop()
            response.set_statuscode(status)
            response.set_content(content)
        else:
            self.fail(
                'unexpected request {} {}\n{}'.format(method, url, payload))

    def patch_xsrf(self):
        if not self.enable_xsrf:
            patcher = mock.patch('sndlatr.auth.XSRFTool')
            patcher.start()
            self.addCleanup(patcher.stop)

    def set_auth_user(self, user):
        """ Set given user as authenticated user. """
        patcher = mock.patch('sndlatr.auth.get_current_user')
        self.get_user_mock = patcher.start()
        self.get_user_mock.return_value = user
        self.addCleanup(patcher.stop)

    def set_auth_is_admin(self, is_admin):
        patcher = mock.patch('sndlatr.auth.is_current_user_admin')
        self.get_user_mock = patcher.start()
        self.get_user_mock.return_value = is_admin
        self.addCleanup(patcher.stop)


@contextmanager
def auth_user(user=None):
    """ Context manager that simulates a logged in user.
    """
    with mock.patch('sndlatr.auth.get_current_user') as get_mock:
        get_mock.return_value = user
        yield



