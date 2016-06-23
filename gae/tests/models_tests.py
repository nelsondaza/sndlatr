import unittest
import datetime
import json

from google.appengine.ext import ndb, testbed
from google.appengine.api import datastore_errors
import oauth2client.client
import mock
from google.appengine.api import mail as gae_mail

from sndlatr import models, gmail
from tests import BaseTestCase
from tests.common import *
from tests import fixture_file_content


@contextmanager
def mailman_mock():
    with mock_instance('sndlatr.gmail.Mailman') as mailman:
        mailman.send_draft.return_value = 'testmail'
        yield mailman


class AccountTest(BaseTestCase):
    def test_credentials_required(self):
        account = models.Account(email='test@example.com', id='1234')
        with self.assertRaises(datastore_errors.BadValueError):
            account.put()

    def test_create(self):
        credentials = oauth2client.client.Credentials()
        account = models.Account(email='test@example.com',
                                 credentials=credentials)
        with self.assertRaises(models.Error):
            account.put()

        account.id = '444'
        account.put()


class CommonScheduledTests(object):
    """ Common tests for Scheduled Jobs """
    model_cls = None

    def create_job(self, **kwargs):
        """ override in child classes """
        raise NotImplementedError()

    def test_queue_due(self):
        """ should find jobs that are due but """
        now = datetime.datetime.utcnow()
        job = self.create_job(scheduled_at=now)
        # add to more jobs that should not be found
        self.create_job(scheduled_at=now, state='queued')
        tomorrow = datetime.timedelta(days=1) + now
        self.create_job(scheduled_at=tomorrow)
        query = job.query_due(now)
        jobs = query.fetch()
        self.assertEquals(jobs, [job])

    def test_add_all_due_to_queue(self):
        self.create_job()
        self.create_job()
        self.create_job(state='done')
        self.model_cls.add_all_due_to_queue()
        tasks = self.taskqueue_stub.get_filtered_tasks()
        self.assertEquals(len(tasks), 2)

    def verify_adds_to_queue(self, key, queue_name, queue_url,
                             target_state='queued'):
        """  add_to_queue should create a taskqueue task with job key """
        tasks = self.taskqueue_stub.get_filtered_tasks()
        self.assertEquals(len(tasks), 1)
        task = tasks[0]
        self.assertEquals(task.url, queue_url)
        self.assertEquals(task.headers['X-AppEngine-QueueName'], queue_name)
        params = json.loads(task.payload)
        self.assertEquals(params['key'], key.urlsafe())
        job = key.get()
        self.assertEquals(job.state, target_state)

    def test_spread_user_jobs(self):
        jobs = [self.create_job(user_id='user_1') for _ in xrange(6)]
        jobs += [self.create_job(user_id='user_2') for _ in xrange(5)]
        jobs_countdowns = list(self.model_cls.spread_user_jobs(
            jobs, bucket_size=2, bucket_margin=10))
        users_countdowns = [(job.user_id, cnt) for job, cnt in jobs_countdowns]
        self.assertEquals(set(users_countdowns), {
            ('user_1', 0),
            ('user_1', 0),
            ('user_1', 10),
            ('user_1', 10),
            ('user_1', 20),
            ('user_1', 20),
            ('user_2', 0),
            ('user_2', 0),
            ('user_2', 10),
            ('user_2', 10),
            ('user_2', 20)})


class SendJobTest(BaseTestCase, CommonScheduledTests):
    model_cls = models.SendJob

    def create_job(self, **kwargs):
        return create_send_job(**kwargs)

    def test_query_display(self):
        long_ago = datetime.datetime.utcnow() - datetime.timedelta(minutes=31)
        user_id = 'testuser'
        expected_jobs = [
            self.create_job(user_id=user_id),
            self.create_job(state='done', user_id=user_id),
            self.create_job(scheduled_at=long_ago, user_id=user_id)]
        # this job should not ne listed
        self.create_job(state='done',
                        scheduled_at=long_ago, user_id=user_id)
        self.create_job(user_id='anotheruser')
        self.create_job(user_id=user_id, state='failed')
        jobs = models.SendJob.query_display(user_id, delta_minutes=30).fetch()
        for expected in expected_jobs:
            self.assertIn(expected, jobs)

    def test_add_to_queue(self):
        """  add_to_send_queue should create a taskqueue task with job key """
        job = self.create_job()
        job.add_to_queue()
        self.verify_adds_to_queue(job.key, 'scheduled', '/api/tasks/send')

    def test_send_mail(self):
        """
        send_mail should send mail and mark as sent if everything goes well.
        """
        job = self.create_job(state='queued')
        with mailman_mock() as mailman:
            job.send_mail('token')
            mailman.send_draft.assert_called_with(
                job.message_id_int, mock.ANY)
            mailman.mark_as_sent.assert_called_with(job.message_id_int,
                                                    job.sent_mail_rfc_id,
                                                    'testmail')
            mailman.quit.assert_called_with()
        job = job.key.get()
        self.assertEquals(job.state, 'done')
        self.assertTrue(job.sent_mail_rfc_id)

    def test_send_mail_send_failure(self):
        """ send_mail should not update state when sending fails. """
        job = self.create_job(state='queued')
        with mailman_mock() as mailman:
            mailman.send_draft.side_effect = raise_io_error
            with self.assertRaises(IOError):
                job.send_mail('token')
            self.assertEquals(job.key.get().state, 'queued')
            mailman.quit.assert_called_with()

    def test_send_mail_mark_failure(self):
        """
        send_mail should update state to 'sent' when marking as send
        fails.
        """
        job = self.create_job(state='queued')
        with mailman_mock() as mailman:
            mailman.mark_as_sent.side_effect = raise_io_error
            with self.assertRaises(IOError):
                job.send_mail('token')
            self.assertEquals(job.key.get().state, 'sent')
            mailman.quit.assert_called_with()

        # should not send again
        with mailman_mock() as mailman:
            job.send_mail('token')
            self.assertFalse(mailman.send_draft.called)
            mailman.mark_as_sent.assert_called_with(job.message_id_int,
                                                    job.sent_mail_rfc_id,
                                                    None)
            mailman.quit.assert_called_with()

        self.assertEquals(job.key.get().state, 'done')


def create_thread_mail(**kwargs):
    mail = {
        'message_id': 'abc1',
        'subject': 'test_subject',
        'rfc_message_id': 'rfc_id1'
    }
    mail.update(kwargs)
    return mail


class ReminderJobTest(BaseTestCase, CommonScheduledTests):
    model_cls = models.RemindJob

    def create_job(self, **kwargs):
        return create_remind_job(**kwargs)

    def test_add_to_remind_queue(self):
        """  add_to_queue should create a taskqueue task with job key """
        job = self.create_job()
        job.add_to_queue()
        self.verify_adds_to_queue(job.key, 'scheduled', '/api/tasks/remind')

    def test_remind(self):
        """
        remind should send remind and mark job as done.
        """
        job = self.create_job(state='queued')
        with mock_instance('sndlatr.gmail.Mailman') as mailman:
            mail = mock.create_autospec(spec=gae_mail.EmailMessage)
            mailman.build_reply.return_value = mail
            job.remind('token')
            mailman.send_mail.assert_called_with(mail)
            mailman.build_reply.assert_called_with(job.thread_id_int,
                                                   mock.ANY)
            mailman.quit.assert_called_with()
        job = job.key.get()
        self.assertEquals(job.state, 'done')

    def test_remind_conditional_with_reply(self):
        job = self.create_job(state='queued', only_if_noreply=True)
        # should not send mail if there is a reply
        with mock_instance('sndlatr.gmail.Mailman') as mailman:
            mailman.get_thread.return_value = [
                create_thread_mail(message_id='reply_id')]
            job.remind('token')
            self.assertEqual(mailman.send_mail.call_count, 0)
        self.assertEquals(job.state, 'done')
        self.assertIsInstance(job.disabled_reply, models.DisabledReply)
        self.assertEqual(job.disabled_reply.message_id, 'reply_id')

    def test_remind_conditional_without_reply(self):
        job = self.create_job(state='queued', only_if_noreply=True,
                              known_message_ids=['knownmail'])
        # should send mail if there is no reply
        with mock_instance('sndlatr.gmail.Mailman') as mailman:
            mailman.get_thread.return_value = [
                create_thread_mail(message_id='knownmail')]
            job.remind('token')
            self.assertEqual(mailman.send_mail.call_count, 1)
        self.assertEquals(job.state, 'done')
        self.assertIsNone(job.disabled_reply)

    def test_find_reply(self):
        """ Should find first unknown reply """
        job = self.create_job(known_message_ids=['abc1'])
        mailman = mock.create_autospec(gmail.Mailman)
        mail1 = create_thread_mail(message_id='abc1')
        mail2 = create_thread_mail(message_id='abc2')
        mail3 = create_thread_mail(message_id='abc3')
        mailman.get_thread.return_value = [mail1, mail2, mail3]
        reply = job.find_reply(mailman)
        # should match first unknown reply
        self.assertEqual(reply, mail2)

    def test_find_reply_none(self):
        """ Return value should be none if there is no unkown reply """
        job = self.create_job(known_message_ids=['abc1', 'abc2'])
        mailman = mock.create_autospec(gmail.Mailman)
        mailman.get_thread.return_value = [
            create_thread_mail(message_id='abc1'),
            create_thread_mail(message_id='abc2')]
        self.assertIsNone(job.find_reply(mailman))

    def test_disable_if_replied(self):
        """ Should disable job if there was a reply. """
        job = self.create_job(only_if_noreply=True, state='checking')
        with mock_instance('sndlatr.gmail.Mailman') as mailman:
            mailman.get_thread.return_value = [
                create_thread_mail(message_id='reply_id',
                                   from_name='Sender',
                                   from_email='x@y.com')]
            job.disable_if_replied('token')
        self.assertEqual(job.state, 'disabled')
        self.assertIsNotNone(job.disabled_reply)
        self.assertEqual(job.disabled_reply.message_id, 'reply_id')
        self.assertEqual(job.disabled_reply.from_name, 'Sender')
        self.assertEqual(job.disabled_reply.from_email, 'x@y.com')

    def test_disable_if_replied_noreply(self):
        """ Should not disable job if there was not reply. """
        job = self.create_job(only_if_noreply=True, state='checking')
        with mock_instance('sndlatr.gmail.Mailman') as mailman:
            mailman.get_thread.return_value = []
            job.disable_if_replied('token')
        self.assertEqual(job.state, 'scheduled')

    def test_add_to_check_reply_queue(self):
        job = self.create_job(only_if_noreply=True, state='scheduled')
        job.add_to_check_reply_queue()
        self.verify_adds_to_queue(job.key, 'scheduled',
                                  '/api/tasks/check_reply',
                                  target_state='checking')
