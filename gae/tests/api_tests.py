import json

import mock
from w69b import idtokenauth
from oauth2client.client import OAuth2Credentials, AccessTokenRefreshError

from tests import BaseTestCase, auth_user
from sndlatr import api, gmail
from tests.common import *


def build_credentials():
    return OAuth2Credentials('x', 'y', 'z', 'a', 'b', 'c', 'd',
                             id_token={'sub': '12345',
                                       'email': 'test@example.com'})


def create_account(user):
    account = models.Account(id=user.user_id(), email=user.email(),
                             credentials=build_credentials())
    account.put()
    return account


@contextmanager
def mock_mailman():
    """
    Mock mailman and auth token. Provides mailman instance.
     """
    with mock_instance('sndlatr.gmail.Mailman') as mailman, \
        mock.patch('sndlatr.models.get_credentials') as cred_mock:
        cred_mock.auth_token = 'testtoken'
        mailman.send_draft.return_value = ('test_rfc_id', 'testmail')
        yield mailman


class QueueJobHandlerTest(BaseTestCase):
    url = '/api/tasks/enqueue_scheduled'

    def test_get(self):
        send_fn_name = 'sndlatr.models.SendJob.add_all_due_to_queue'
        remind_fn_name = 'sndlatr.models.RemindJob.add_all_due_to_queue'
        with mock.patch(send_fn_name) as add_send, \
            mock.patch(remind_fn_name) as add_remind:
            resp = self.send_request(self.url)
            add_send.assert_called()
            add_remind.assert_called()
            self.assertEqual(resp.status_int, 200)

    def test_forbidden(self):
        with mock.patch('sndlatr.auth.is_dev') as dev_mock:
            dev_mock.return_value = False
            resp = self.send_request(self.url)
            self.assertEquals(resp.status_int, 403)

            # but should succeed with cron header
            resp = self.send_request(self.url,
                                     headers={'X-Appengine-Cron': True})
            self.assertEquals(resp.status_int, 200)


class CommonJobTaskHandlerTests(object):
    JOB_MAX_RETRIES = api.JOB_MAX_RETRIES
    queued_state = 'queued'

    def test_no_job_id(self):
        resp = self.send_request(self.url, method='POST')
        self.assertEqual(resp.status_int, 200)

    def test_nonexistent(self):
        resp = self.send_request(self.url,
                                 json_data={'job_id': 'nonexistent'})
        self.assertEqual(resp.status_int, 200)

    def _post_send(self, job):
        return self.send_request(self.url,
                                 json_data={'key': job.key.urlsafe()})

    def test_handles_auth_error_retry(self):
        self.assert_handles_error(gmail.AuthenticationError, should_retry=True)

    def test_io_error(self):
        """ should return error code when sending fails. """
        self.assert_handles_error(IOError, should_retry=True)

    def test_mailbox_not_found(self):
        """ should return error code when sending fails. """
        self.assert_handles_error(gmail.MailboxNotFound, should_retry=False,
                                  notify_reason='mailbox_not_found')

    def test_io_error_giveup(self):
        job = self.create_job(state=self.queued_state,
                              error_cnt=self.JOB_MAX_RETRIES)
        self.assert_handles_error(IOError, notify_reason='unknown',
                                  should_retry=False, job=job)

    def test_handles_auth_error_give_up(self):
        job = self.create_job(state=self.queued_state,
                              error_cnt=self.JOB_MAX_RETRIES)
        self.assert_handles_error(gmail.AuthenticationError,
                                  notify_reason='auth', job=job)

    def assert_retry_state(self, job, old_err_cnt, resp, should_retry):
        if should_retry:
            self.assertEquals(resp.status_int, 500)
            self.assertEquals(job.error_cnt, old_err_cnt + 1)
            self.assertNotEqual(job.state, 'failed')
        else:
            self.assertEquals(resp.status_int, 200)
            self.assertEquals(job.error_cnt, job.error_cnt)
            self.assertEquals(job.state, 'failed')

    def create_job(self, **kwargs):
        raise NotImplementedError('override')


class CommonNotifyingJobTests(object):
    def notify_mock(self, **kwargs):
        raise NotImplementedError('override')

    def test_refresh_failure(self):
        """
        Failure to refresh the access token should be treated as auth error.
        """

        def raise_invalid_grant(*args, **kwargs):
            raise AccessTokenRefreshError()

        with mock.patch('sndlatr.models.get_credentials') as getter, \
            self.notify_mock() as notify:
            cred = mock.MagicMock(spec=OAuth2Credentials)
            getter.return_value = cred
            cred.refresh.side_effect = raise_invalid_grant

            job = self.create_job(error_cnt=self.JOB_MAX_RETRIES)
            resp = self._post_send(job)
            self.assertEquals(resp.status_int, 200)
            notify.assert_called_with(job, 'auth')


class SendHandlerTest(BaseTestCase, CommonJobTaskHandlerTests,
                      CommonNotifyingJobTests):
    url = '/api/tasks/send'

    def create_job(self, **kwargs):
        return create_send_job(**kwargs)

    @staticmethod
    @contextmanager
    def notify_mock():
        with mock.patch('sndlatr.mailnotify.notify_send_later_failed',
                        autospec=True) as notify_mock:
            yield notify_mock

    @contextmanager
    def mail_mocks(self):
        """
        Mock mailman and auth token. Provides tuple of
        mailman mock instance and mailnotify mock.
         """
        with mock_mailman() as mailman, self.notify_mock() as notify_mock:
            yield mailman, notify_mock

    def assert_handles_error(self, err_cls, notify_reason=None,
                             should_retry=False,
                             job=None):
        """
        Assert that error err_cls raised in send_draft triggers
        notification with given reason and will (not) retry.
        """

        def raise_error(*args, **kwargs):
            if err_cls:
                raise err_cls()

        if job is None:
            job = self.create_job(state='queued')
        old_err_cnt = job.error_cnt
        with self.mail_mocks() as (instance, notify):
            instance.send_draft.side_effect = raise_error
            resp = self._post_send(job)
            if notify_reason:
                notify.assert_called_with(job, notify_reason)
            else:
                self.assertFalse(notify.called)

        job = job.key.get()
        self.assert_retry_state(job, old_err_cnt, resp, should_retry)

    def test_handles_invalid_error(self):
        self.assert_handles_error(gmail.InvalidEmail, 'invalid_mail')

    def test_io_error_sent_state(self):
        """ job state should be sent on unknown error after sending. """
        def raise_error(*args, **kwargs):
            raise IOError()

        job = self.create_job(state='queued')
        with self.mail_mocks() as (mailman, notify):
            mailman.mark_as_sent.side_effect = raise_error
            resp = self._post_send(job)
            self.assertEqual(resp.status_int, 500)
        job = job.key.get()
        self.assertEqual(job.state, 'sent')

    def test_success(self):
        job = self.create_job(state='queued')
        with mock_mailman() as mailman:
            resp = self._post_send(job)
            self.assertTrue(mailman.send_draft.called)

        self.assertEqual(resp.status_int, 200)
        job = job.key.get()
        self.assertEquals(job.state, 'done')


class RemindHandlerTest(BaseTestCase, CommonJobTaskHandlerTests,
                        CommonNotifyingJobTests):
    url = '/api/tasks/remind'

    def create_job(self, **kwargs):
        return create_remind_job(**kwargs)

    @staticmethod
    @contextmanager
    def notify_mock():
        with mock.patch('sndlatr.mailnotify.notify_reminder_failed',
                        autospec=True) as notify_mock:
            yield notify_mock

    @contextmanager
    def mail_mocks(self):
        """
        Mock mailman and auth token. Provides tuple of
        mailman mock instance and mailnotify mock.
         """
        with mock_mailman() as mailman, self.notify_mock() as notify_mock:
            yield mailman, notify_mock

    def assert_handles_error(self, err_cls, notify_reason=None,
                             should_retry=False,
                             job=None):
        """
        Assert that error err_cls raised in send_draft triggers
        notification with given reason and will (not) retry.
        """

        def raise_error(*args, **kwargs):
            if err_cls:
                raise err_cls()

        if job is None:
            job = create_remind_job(state='queued')
        old_err_cnt = job.error_cnt
        with self.mail_mocks() as (mailman, notify):
            mailman.send_mail.side_effect = raise_error
            resp = self._post_send(job)
            if notify_reason:
                notify.assert_called_with(job, notify_reason)
            else:
                self.assertFalse(notify.called)

        job = job.key.get()
        self.assert_retry_state(job, old_err_cnt, resp, should_retry)

    def test_success(self):
        job = create_remind_job(state='queued')
        with mock_mailman() as mailman:
            resp = self._post_send(job)
            self.assertTrue(mailman.send_mail.called)

        self.assertEqual(resp.status_int, 200)
        job = job.key.get()
        self.assertEquals(job.state, 'done')

    def test_handles_no_rfc_id_error(self):
        self.assert_handles_error(gmail.RfcMsgIdMissing, 'unknown')


class CheckReplyHandlerTest(BaseTestCase, CommonJobTaskHandlerTests):
    url = '/api/tasks/check_reply'
    JOB_MAX_RETRIES = 2
    queued_state = 'checking'

    def create_job(self, **kwargs):
        if kwargs.get('only_if_noreply', None) is None:
            kwargs['only_if_noreply'] = True
        return create_remind_job(**kwargs)

    # def _post_send(self, job):
    #     return self.send_request(self.url,
    #                              json_data={'key': job.key.urlsafe()})

    def assert_handles_error(self, err_cls,
                             should_retry=False,
                             job=None, **kwargs):
        """
        Assert that error err_cls raised in send_draft triggers
        notification with given reason and will (not) retry.
        """

        def raise_error(*args, **kwargs):
            if err_cls:
                raise err_cls()

        if job is None:
            job = self.create_job(state='checking')
        old_err_cnt = job.error_cnt
        with mock_mailman() as mailman:
            mailman.get_thread.side_effect = raise_error
            resp = self._post_send(job)

        job = job.key.get()
        self.assert_retry_state(job, old_err_cnt, resp, should_retry)

    def assert_retry_state(self, job, old_err_cnt, resp, should_retry):
        if should_retry:
            self.assertEquals(resp.status_int, 500)
            self.assertEquals(job.error_cnt, old_err_cnt + 1)
            self.assertEqual(job.state, 'checking')
        else:
            self.assertEquals(resp.status_int, 200)
            self.assertEquals(job.error_cnt, job.error_cnt)
            self.assertEquals(job.state, 'scheduled')

    def test_mailbox_not_found(self):
        """ mailbox_not_found gets no special error handlig for check_reply """

    def test_success(self):
        # should succeed instantly if only_if_noreply is false
        job = create_remind_job(state='checking', only_if_noreply=False)
        with mock_mailman():
            resp = self._post_send(job)
        self.assertEqual(resp.status_int, 200)
        job = job.key.get()
        self.assertEquals(job.state, 'scheduled')

    def test_io_error(self):
        self.assert_handles_error(IOError, should_retry=True)


class CommonCRUDHandlerTests(object):
    def setUp(self):
        self.user = idtokenauth.User('test@example.com', _user_id='testuser')
        self.set_auth_user(self.user)
        super(CommonCRUDHandlerTests, self).setUp()

    def test_delete(self):
        job = self.create_model(user_id=self.user.user_id())
        resp = self.send_request(self.url.format(job.key.id()),
                                 method='DELETE')
        self.assertEqual(resp.status_int, 204)
        self.assertIsNone(job.key.get())

    def test_delete_wrong_user(self):
        job = self.create_model(user_id='wronguser')
        resp = self.send_request(self.url.format(job.key.id()),
                                 method='DELETE')
        self.assertEqual(resp.status_code, 403)

    def test_get_multiple(self):
        job1 = self.create_model(user_id=self.user.user_id())
        job2 = self.create_model(user_id=self.user.user_id())
        resp = self.send_request('{}?id={}&id={}'.format(self.all_url,
                                                         job1.key.id(),
                                                         job2.key.id()))
        self.assertEqual(resp.status_code, 200)
        result = json.loads(resp.body)
        self.assertEqual(len(result), 2)
        self.assertEqual(result[0]['id'], job1.key.id())
        self.assertEqual(result[1]['id'], job2.key.id())

    def test_get_multiple_wrong_user(self):
        wrong_job = self.create_model(user_id='wronguser')
        job = self.create_model(user_id=self.user.user_id())
        resp = self.send_request('{}?id={}&id={}'.format(self.all_url,
                                                         job.key.id(),
                                                         wrong_job.key.id()))
        self.assertEqual(resp.status_code, 403)

    def test_get_multiple_invalid_id(self):
        resp = self.send_request(self.all_url + '?id=1&id=hihi')
        self.assertEqual(resp.status_code, 400)

    def test_get_multiple_nonexistent_id(self):
        resp = self.send_request(self.all_url + '?id=456456561&id=444565656')
        self.assertEqual(resp.status_code, 200)
        result = json.loads(resp.body)
        self.assertEquals(result, [])

    def test_get_single(self):
        job = self.create_model(user_id=self.user.user_id())
        resp = self.send_request(self.url.format(job.key.id()))
        self.assertEqual(resp.status_code, 200)
        result = json.loads(resp.body)
        self.assertEquals(result['id'], job.key.id())

    def test_get_single_wrong_user(self):
        job = self.create_model(user_id='wronguser')
        resp = self.send_request(self.url.format(job.key.id()))
        self.assertEqual(resp.status_code, 403)

    def test_update_wrong_user(self):
        job = self.create_model(user_id='wronguser')
        resp = self.send_request(self.url.format(job.key.id()),
                                 json_data=self.update_data)
        self.assertEqual(resp.status_code, 403)

    def create_model(self, **kwargs):
        raise NotImplementedError()


class CommonScheduleHandlerTests(CommonCRUDHandlerTests):
    """ no common schedule handler tests so far """


class ScheduleSendHandlerTest(CommonScheduleHandlerTests, BaseTestCase):
    update_data = {
        'messageId': '456',
        'utcOffset': 0,
        'scheduledAt': '2023-10-05T08:00:00.00Z'
    }
    url = '/api/schedule/{}'
    all_url = '/api/schedule'

    def create_model(self, **kwargs):
        return create_send_job(**kwargs)

    def test_create_valid(self):
        resp = self.send_request(self.all_url,
                                 json_data={
                                     'messageId': '1234',
                                     'utcOffset': -60,
                                     'scheduledAt': '2023-09-05T08:00:00.00Z'
                                 })
        self.assertEquals(200, resp.status_int)
        result = json.loads(resp.body)
        self.assertDictContainsSubset(
            {'messageId': '1234',
             'utcOffset': -60,
             'scheduledAt': '2023-09-05T08:00:00+00:00'}, result)
        job_id = result.get('id')
        self.assertIsNotNone(job_id)

        job = models.SendJob.get_by_id(job_id)
        self.assertEqual(job.message_id, '1234')
        self.assertEqual(job.scheduled_at.isoformat(), '2023-09-05T08:00:00')

    def test_update(self):
        job = self.create_model(user_id=self.user.user_id())
        resp = self.send_request(self.url.format(job.key.id()),
                                 json_data=self.update_data)
        self.assertEqual(resp.status_code, 200)
        job = job.key.get()
        self.assertEqual(job.message_id, '456')
        self.assertEqual(job.scheduled_at.isoformat(), '2023-10-05T08:00:00')

    def test_delete_queued(self):
        """ Deleting a queued job should result in not found response """
        job = self.create_model(user_id=self.user.user_id(), state='queued')
        resp = self.send_request(self.url.format(job.key.id()),
                                 method='DELETE')
        self.assertEqual(resp.status_int, 404)
        self.assertIsNotNone(job.key.get())


class ScheduleRemindHandlerTest(CommonScheduleHandlerTests, BaseTestCase):
    update_data = {
        'threadId': '456',
        'utcOffset': 0,
        'onlyIfNoreply': True,
        'knownMessageIds': ['123'],
        'scheduledAt': '2023-10-05T08:00:00.00Z'
    }
    url = '/api/remind/{}'
    all_url = '/api/remind'

    def create_model(self, **kwargs):
        return create_remind_job(**kwargs)

    def test_create_valid(self):
        resp = self.send_request(self.all_url,
                                 json_data={
                                     'threadId': '1234',
                                     'utcOffset': -60,
                                     'scheduledAt': '2023-09-05T08:00:00.00Z',
                                     'onlyIfNoreply': True,
                                     'knownMessageIds': ['123', '456']
                                 })
        self.assertEquals(200, resp.status_int)
        result = json.loads(resp.body)
        self.assertDictContainsSubset(
            {'threadId': '1234',
             'utcOffset': -60,
             'knownMessageIds': ['123', '456'],
             'scheduledAt': '2023-09-05T08:00:00+00:00',
             'onlyIfNoreply': True}, result)
        job_id = result.get('id')
        self.assertIsNotNone(job_id)

        job = models.RemindJob.get_by_id(job_id)
        self.assertEqual(job.thread_id, '1234')
        self.assertTrue(job.only_if_noreply)
        self.assertEqual(job.known_message_ids, ['123', '456'])
        self.assertEqual(job.scheduled_at.isoformat(), '2023-09-05T08:00:00')

    def test_get_disabled_mail(self):
        reply = models.DisabledReply(message_id='reply_id',
                                     from_email='mb@example.com',
                                     from_name='John')
        job = self.create_model(user_id=self.user.user_id(),
                                disabled_reply=reply)
        resp = self.send_request(self.url.format(job.key.id()))
        self.assertEqual(resp.status_code, 200)
        result = json.loads(resp.body)
        self.assertEquals(result['id'], job.key.id())
        self.assertDictContainsSubset({'messageId': 'reply_id',
                                       'fromEmail': 'mb@example.com',
                                       'fromName': 'John'
                                      },
                                      result['disabledReply'])

    def test_update(self):
        job = self.create_model(user_id=self.user.user_id())
        resp = self.send_request(self.url.format(job.key.id()),
                                 json_data=self.update_data)
        self.assertEqual(resp.status_code, 200)
        job = job.key.get()
        self.assertEqual(job.thread_id, '456')
        self.assertTrue(job.only_if_noreply)
        self.assertEqual(job.known_message_ids, ['123'])
        self.assertEqual(job.scheduled_at.isoformat(), '2023-10-05T08:00:00')

    def test_delete_cancelled(self):
        """ Disabled jobs can be deleted. """
        job = self.create_model(user_id=self.user.user_id(), state='disabled')
        resp = self.send_request(self.url.format(job.key.id()),
                                 method='DELETE')
        self.assertEqual(resp.status_int, 204)
        self.assertIsNone(job.key.get())

    def test_delete_queued(self):
        """ Deleting for queued job should be ignored """
        job = self.create_model(user_id=self.user.user_id(), state='queued')
        resp = self.send_request(self.url.format(job.key.id()),
                                 method='DELETE')
        self.assertEqual(resp.status_int, 204)
        self.assertIsNotNone(job.key.get())


class ScheduleCheckReplyHandlerTest(BaseTestCase):
    url = '/api/remind/{}/check_reply'

    def setUp(self):
        self.user = idtokenauth.User('test@example.com', _user_id='testuser')
        self.set_auth_user(self.user)
        self.valid_reply = {'fromName': 'Manu',
                            'messageId': '123',
                            'ignored': 'ignored',
                            'fromEmail': 'x@y.com'}

    def test_post(self):
        job = create_remind_job(user_id=self.user.user_id())
        resp = self.send_request(self.url.format(job.key.id()),
                                 json_data=self.valid_reply)
        self.assertEqual(resp.status_int, 204)
        job = job.key.get()
        self.assertEqual(job.state, 'checking')
        self.assertEqual(job.disabled_reply.from_name, 'Manu')
        self.assertEqual(job.disabled_reply.message_id, '123')
        self.assertEqual(job.disabled_reply.from_email, 'x@y.com')

    def test_wrong_user(self):
        job = create_remind_job(user_id='other')
        resp = self.send_request(self.url.format(job.key.id()),
                                 json_data=self.valid_reply)
        self.assertEqual(resp.status_int, 403)

    def test_indexistent(self):
        resp = self.send_request(self.url.format('123'),
                                 json_data=self.valid_reply)
        self.assertEqual(resp.status_int, 404)


class SnippetHandlerTest(CommonCRUDHandlerTests, BaseTestCase):
    url = '/api/snippet/{}'
    all_url = '/api/snippet'
    update_data = {'subject': 'updated', 'body': 'updated body',
                   'name': 'testname'}

    def setUp(self):
        self.valid_snippet = {'subject': 'test subject',
                              'body': 'hello body', 'name': 'testName'}
        super(SnippetHandlerTest, self).setUp()

    def create_model(self, **kwargs):
        return create_snippet(**kwargs)

    def test_create_valid(self):
        resp = self.send_request(self.all_url, json_data=self.valid_snippet)
        self.assertEquals(200, resp.status_int)
        result = json.loads(resp.body)
        self.assertDictContainsSubset(self.valid_snippet, result)

    def test_update(self):
        snippet = self.create_model(user_id=self.user.user_id())
        resp = self.send_request(self.url.format(snippet.key.id()),
                                 json_data=self.update_data)
        self.assertEqual(resp.status_code, 200)
        snippet = snippet.key.get()
        self.assertEqual(snippet.body, self.update_data['body'])
        self.assertEqual(snippet.subject, self.update_data['subject'])
        self.assertEqual(snippet.name, self.update_data['name'])


class InitializeHandlerTest(BaseTestCase):
    def setUp(self):
        self.user = idtokenauth.User('test@example.com', _user_id='testuser')
        super(InitializeHandlerTest, self).setUp()

    def test_needs_auth(self):
        """ should return 403 without auth. """
        resp = self.send_request('/api/init')
        self.assertEqual(403, resp.status_int)

    def get_result(self):
        resp = self.send_request('/api/init')
        self.assertEqual(resp.status_int, 200)
        result = json.loads(resp.body)
        return result

    def test_save_code(self):
        credentials = build_credentials()
        with mock.patch('sndlatr.auth.credentials_from_code') as from_code:
            from_code.return_value = credentials
            resp = self.send_request('/api/init',
                                     json_data={'code': 'testcode'})
            from_code.assert_called_with('testcode')
        self.assertEqual(resp.status_int, 200)
        id_token = credentials.id_token
        account = models.Account.get_by_id(id_token.get('sub'))
        self.assertIsNotNone(account)
        self.assertEqual(account.email, id_token['email'])
        self.assertEqual(account.user_id(), id_token['sub'])

    def test_need_code(self):
        """ If there is not account for this user, it should request code. """
        self.set_auth_user(self.user)
        result = self.get_result()
        self.assertEqual(result, {'auth': 'need_code'})

    def test_list_jobs(self):
        """ Should list jobs """
        self.set_auth_user(self.user)
        create_send_job(user_id=self.user.user_id(), message_id='123')
        create_send_job(user_id='notmine')
        create_remind_job(user_id=self.user.user_id(), thread_id='333')
        create_remind_job(user_id='notmine')
        create_snippet(user_id=self.user.user_id(), subject='snipSubject')
        create_snippet(user_id='notmine')

        create_account(self.user)
        result = self.get_result()
        send_jobs = result.get('sendJobs')
        self.assertIsInstance(send_jobs, list)
        self.assertEqual(len(send_jobs), 1)
        job = send_jobs[0]
        self.assertDictContainsSubset({'state': 'scheduled',
                                       'messageId': '123'}, job)
        self.assertTrue(job['createdAt'])

        remind_jobs = result.get('remindJobs')
        self.assertEqual(len(remind_jobs), 1)
        job = remind_jobs[0]
        self.assertDictContainsSubset({'state': 'scheduled',
                                       'threadId': '333'}, job)
        self.assertTrue(job['createdAt'])

        snippets = result.get('snippets')
        self.assertEqual(len(remind_jobs), 1)
        snippet = snippets[0]
        self.assertDictContainsSubset({'subject': 'snipSubject'}, snippet)

