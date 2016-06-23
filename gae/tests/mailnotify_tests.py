import unittest
import datetime

from sndlatr import mailnotify, models
from tests import BaseTestCase, common


class CommonFailureNotifyTests(object):
    def get_mail(self):
        mails = self.mail_stub.get_sent_messages(to=self.job.user_email)
        self.assertEqual(len(mails), 1)
        mail = mails[0]
        return mail

    def assert_subject_in_mail(self):
        """ assert that subject is mentioned in plain and html mails """
        self.assert_contains(self.job.subject)

    def assert_contains(self, token):
        """
        Assert token is contained in html and plain text version of sent
        mail.
        """
        mail = self.get_mail()
        plain = str(mail.body)
        self.assertIn(token, plain)

        html = str(mail.html)
        self.assertIn(token, html)

    def test_auth(self):
        self.send(self.job, 'auth')
        self.assert_common()
        self.assert_contains('chrome extension')

    def test_unknown(self):
        self.send(self.job, 'unknown')
        self.assert_common()
        self.assert_contains('don\'t know')

    def test_mailbox_not_found(self):
        self.send(self.job, 'mailbox_not_found')
        self.assert_common()
        self.assert_contains('IMAP')
        self.assert_contains('All Mail')
        self.assert_contains('Trash')

    def send(self, *args, **kwargs):
        raise NotImplementedError('implement in subclasses')

    def assert_common(self):
        pass


class MailNotifySendFailedTest(BaseTestCase, CommonFailureNotifyTests):
    def setUp(self):
        super(MailNotifySendFailedTest, self).setUp()
        now = datetime.datetime(2013, 1, 1, 10)
        self.job = models.SendJob(user_email='test@localhost',
                                  subject='test subject',
                                  scheduled_at=now)

    def assert_common(self):
        mail = self.get_mail()
        self.assertTrue('NOT sent' in mail.subject)
        self.assert_contains('not send')
        self.assert_subject_in_mail()

    def test_notfound(self):
        self.send(self.job, 'notfound')
        self.assert_common()
        self.assert_contains('drafts')

    def test_invalid(self):
        self.job.utc_offset = -60
        self.send(self.job, 'invalid_mail')
        self.assert_common()
        self.assert_contains('receiver')
        self.assert_contains('Tue 01.01.2013 11:00 GMT+01:00')

    def send(self, *args, **kwargs):
        mailnotify.notify_send_later_failed(*args, **kwargs)


class MailNotifyReminderFailedTest(BaseTestCase, CommonFailureNotifyTests):
    def setUp(self):
        super(MailNotifyReminderFailedTest, self).setUp()
        now = datetime.datetime(2013, 1, 1, 10)
        self.job = models.RemindJob(user_email='test@localhost',
                                    subject='test subject',
                                    scheduled_at=now)

    def assert_common(self):
        mail = self.get_mail()
        self.assertTrue('reminder' in mail.subject)
        self.assert_contains('handle your reminder')
        self.assert_subject_in_mail()

    def send(self, *args, **kwargs):
        mailnotify.notify_reminder_failed(*args, **kwargs)

    def test_notfound(self):
        self.send(self.job, 'notfound')
        self.assert_common()
        self.assert_contains('conversation')


class MailNotifyRemindTest(BaseTestCase):
    def test_build_remind_message(self):
        job = common.create_remind_job()
        msg = mailnotify.build_remind_message(job)

        self.assertIn('reminder', msg.body)
        self.assertIn('reminder', msg.html)
        self.assertIn('<body', msg.html)
