import datetime
from contextlib import contextmanager

import mock
from google.appengine.ext import ndb
from babel import dates

from sndlatr import models


ndb.utils.DEBUG = False
# it is non in gae environment too
dates.LC_TIME = None


def create_snippet(**kwargs):
    params = {
        'user_id': 'test_user_id',
        'name': 'testName'
    }
    params.update(kwargs)
    snippet = models.Snippet(**params)
    snippet.put()
    return snippet


def create_remind_job(**kwargs):
    params = {
        'scheduled_at': datetime.datetime.utcnow(),
        'user_id': 'test_user_id',
        'thread_id': '4d2', # = 1234
        'user_email': 'test@example.com',
    }
    params.update(kwargs)
    job = models.RemindJob(**params)
    job.put()
    return job


def create_send_job(**kwargs):
    params = {
        'scheduled_at': datetime.datetime.utcnow(),
        'user_id': 'test_user_id',
        'message_id': '4d2', # = 1234
        'user_email': 'test@example.com',
    }
    params.update(kwargs)
    job = models.SendJob(**params)
    job.put()
    return job


@contextmanager
def mock_instance(cls_path):
    """ Context manager that mocks class and returns instance
    """
    with mock.patch(cls_path, autospec=True) as constructor_mock:
        yield constructor_mock.return_value


def raise_io_error(*args, **kwargs):
    raise IOError()
