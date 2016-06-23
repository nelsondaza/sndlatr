import unittest
import datetime

from sndlatr import validation


class CommonJobTests(object):
    def test_optional(self):
        """ Should accept optional subject and id """
        job = self.valid_job
        job['id'] = 234
        job['subject'] = 'hello'
        self.schema(job)

    def test_ignore_state(self):
        job = self.valid_job
        job['state'] = 'hello'
        self.schema(job)

    def test_subject_max_length(self):
        job = self.valid_job
        job['subject'] = 'x' * 256
        job = self.schema(job)
        self.assertEqual(len(job['subject']), 255)

    def test_invalid_subject_type(self):
        job = self.valid_job
        job['subject'] = 4
        with self.assertRaises(validation.Error):
            self.schema(job)

    def test_timezone(self):
        """ should convert times to utc and return native datetime objects """
        job = self.valid_job
        job['scheduledAt'] = '2013-09-04T14:45:45.129+02:00'
        parsed = self.schema(job)
        self.assertEqual(parsed['scheduledAt'].isoformat(),
                         '2013-09-04T12:45:45.129000')

    def test_missing_scheduled_at(self):
        with self.assertRaises(validation.Error):
            self.schema({'messageId': '234'})

    def test_valid(self):
        parsed = self.schema(self.valid_job)
        self.assertIsInstance(parsed['scheduledAt'], datetime.datetime)
        scheduled_at = parsed['scheduledAt']
        self.assertEquals(scheduled_at.isoformat(),
                          '2013-09-04T14:45:45.129000')
        self.assertIsNone(scheduled_at.tzinfo)

    def test_optional_changed_at(self):
        job = self.valid_job
        job['createdAt'] = 'hihihi'
        self.schema(job)


class SendJobSchemaTest(unittest.TestCase, CommonJobTests):
    schema = validation.send_job_schema

    def setUp(self):
        super(SendJobSchemaTest, self).setUp()
        self.valid_job = {'scheduledAt': '2013-09-04T14:45:45.129Z',
                          'utcOffset': 0,
                          'messageId': '123f'}

    def test_missing_message_id(self):
        job = self.valid_job
        job.pop('messageId')
        with self.assertRaises(validation.Error):
            self.schema(job)

    def test_valid_msgid(self):
        parsed = self.schema(self.valid_job)
        self.assertEquals(parsed['messageId'], '123f')


class RemindJobSchemaTest(unittest.TestCase, CommonJobTests):
    schema = validation.remind_job_schema

    def setUp(self):
        self.valid_job = {'scheduledAt': '2013-09-04T14:45:45.129Z',
                          'utcOffset': 0,
                          'threadId': '123f'}
        super(RemindJobSchemaTest, self).setUp()

    def test_valid_threadid(self):
        parsed = self.schema(self.valid_job)
        self.assertEquals(parsed['threadId'], '123f')

    def test_missing_thread_id(self):
        job = self.valid_job
        job.pop('threadId')
        with self.assertRaises(validation.Error):
            self.schema(job)

    def test_optional_noreply(self):
        job = self.valid_job
        job['onlyIfNoreply'] = True
        with self.assertRaises(validation.Error):
            self.schema(job)
        job['knownMessageIds'] = ['123']
        parsed = self.schema(job)
        self.assertTrue(parsed['onlyIfNoreply'])

    def test_optional_known_message_ids(self):
        job = self.valid_job
        job['knownMessageIds'] = ['123f', '234A']
        parsed = self.schema(job)
        self.assertEqual(parsed['knownMessageIds'], ['123f', '234A'])

    def test_invalid_known_message_ids(self):
        with self.assertRaises(validation.Error):
            job = self.valid_job
            job['knownMessageIds'] = '123g'
            self.schema(job)

    def test_default_known_messages(self):
        parsed = self.schema(self.valid_job)
        self.assertEqual(parsed['knownMessageIds'], [])

    def test_optional_disabled_reply(self):
        job = self.valid_job
        job['disabledReply'] = None
        self.schema(job)
        job['disabledReply'] = {'hihi': 'hoho'}
        self.schema(job)

        job['disabledReply'] = {'deep': ['hoho']}
        with self.assertRaises(validation.Error):
            self.schema(job)


class ValidateDisabledReply(unittest.TestCase):
    def setUp(self):
        self.valid_reply = {'fromEmail': '',
                            'fromName': '',
                            'messageId': '123f'}

    def test_valid(self):
        validation.disabled_reply_schema(self.valid_reply)
        reply = {
            'bodySnipped': 'test',
            'fromEmail': 'thembrown@gmail.com',
            'fromName': '',
            'fromRfc': 'thembrown@gmail.com',
            'messageId': '141eff4481517db8',
            'origMessageId': '141efecf9b34a9f7',
            'type': 'ms'
        }
        validation.disabled_reply_schema(reply)

    def test_invalid(self):
        reply = self.valid_reply
        reply['fromName'] = 4
        with self.assertRaises(validation.Error):
            validation.disabled_reply_schema(reply)

    def test_invalid_msg_id(self):
        reply = self.valid_reply
        reply['messageId'] = '123g'
        with self.assertRaises(validation.Error):
            validation.disabled_reply_schema(reply)


class ValidateSnippet(unittest.TestCase):
    def setUp(self):
        self.valid_snippet = {'subject': '', 'body': 'test body'}

    def test_valid(self):
        validation.snippet_schema(self.valid_snippet)

    def test_empty(self):
        result = validation.snippet_schema({})
        self.assertDictEqual(result, {'name': '', 'body': '', 'subject': ''})

    def test_missing_subject(self):
        snippet = self.valid_snippet
        snippet['subject'] = None
        with self.assertRaises(validation.Error):
            validation.snippet_schema(self.valid_snippet)

    def test_invalid_name(self):
        snippet = self.valid_snippet
        snippet['name'] = 123
        with self.assertRaises(validation.Error):
            validation.snippet_schema(self.valid_snippet)

    def test_optional(self):
        snippet = self.valid_snippet
        snippet.update({'id': 234, 'updatedAt': 'dfdf', 'usageCnt': 234,
                        'createdAt': 'hihi'})
