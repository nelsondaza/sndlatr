import unittest

import mock
import imapclient
import smtplib
import datetime

from sndlatr import gmail
from tests import fixture_file_content


class IMAPClientMockHelper():
    def __init__(self):
        patcher = mock.patch('imapclient.IMAPClient', autospec=True)
        self.cleanup = patcher.stop
        self.constructor_mock = patcher.start()
        client = self.constructor_mock.return_value
        client.list_folders.return_value = [
            [['\Sent'], '/', 'mySent'],
            [['\Drafts'], '/', 'myDrafts'],
            [['\All'], '/', 'myAll'],
            [['\Trash'], '/', 'mytrash']
        ]
        self.client_mock = client


class SMTPClientMockHelper():
    def __init__(self):
        patcher = mock.patch('smtplib.SMTP_SSL', autospec=True)
        self.cleanup = patcher.stop
        self.constructor_mock = patcher.start()
        client = self.constructor_mock.return_value
        self.client_mock = client
        client.docmd.return_value = (235, '')


def raise_imap(*args, **kwargs):
    raise gmail.IMAPError()


class IMAPSessionTest(unittest.TestCase):
    def setUp(self):
        self.mock_helper = IMAPClientMockHelper()
        self.addCleanup(self.mock_helper.cleanup)
        self.session = gmail.IMAPSession(
            'testuser', 'testtoken')

    def test_raises_mailbox_not_exists(self):
        """ Should raise in if trash or all mailbox does not exist """
        self.mock_helper.client_mock.list_folders.return_value = [
            [['\All'], '/', 'myAll']]
        with self.assertRaises(gmail.MailboxNotFound):
            gmail.IMAPSession('testuser', 'testtoken')
        self.assertTrue(self.mock_helper.client_mock.logout.called)

        self.mock_helper.client_mock.list_folders.return_value = [
            [['\Trash'], '/', 'myTrash']]

        with self.assertRaises(gmail.MailboxNotFound):
            gmail.IMAPSession('testuser', 'testtoken')

    def test_login(self):
        self.mock_helper.client_mock.oauth2_login.assert_called_with(
            'testuser', 'testtoken')

    def test_get_all_box(self):
        self.assertEquals('myAll', self.session.get_all_box())

    def test_copy_labels_to_sent(self):
        client = self.mock_helper.client_mock
        client.search.return_value = [123]
        self.session.copy_labels_to_sent('testrfc', ['tlabel', '\\Draft'])
        self.assertTrue(client.search.called)
        client.add_gmail_labels.assert_called_with([123], labels=mock.ANY)
        labels = set(client.add_gmail_labels.call_args[1]['labels'])
        self.assertEquals(labels, {'tlabel'})

    def test_get_mail(self):
        """
        should search mail by message id and fetch and
        return rfc822 encoded mail
        """
        client = self.mock_helper.client_mock
        client.search.return_value = ['33']
        rfc_mail = fixture_file_content('mail_rfc822.txt')
        client.fetch.return_value = {'33': {'RFC822': rfc_mail,
                                            'X-GM-LABELS': []}}
        mail = self.session.get_mail(12345)
        client.search.assert_called_with('X-GM-MSGID 12345')
        client.fetch.assert_called_with('33', ['RFC822', 'X-GM-LABELS'])
        self.assertEqual(rfc_mail, mail.rfc_message)

    def test_mark_as_sent_missing(self):
        self.session.get_mail = mock.Mock(return_value=None)
        self.session.mark_as_sent(123, 'rfcid', None)

    def test_mark_as_sent_no_bcc(self):
        """
        Mark as sent should delete the original message and copy labels to
        the sent message.
        """
        # client = self.mock_helper.client_mock
        self.session.replace_sent_msg = mock.Mock()
        self.session.delete_message = mock.Mock()
        self.session.copy_labels_to_sent = mock.Mock()
        mail = gmail.Mail(fixture_file_content('mail1_header_rfc822.txt'),
                          ['custom'])
        self.session.mark_as_sent(123, 'rfcid', mail)
        self.assertFalse(self.session.replace_sent_msg.called)
        self.session.delete_message.assert_called_with(123)
        self.session.copy_labels_to_sent.assert_called_with('rfcid',
                                                            ['custom'])

    def test_get_thread(self):
        """
        Should search mails by thread id and fetch their headers and gmail
        message ids.
        """
        client = self.mock_helper.client_mock
        client.search.return_value = ['33', '43']
        client.fetch.return_value = {
            '43': {
                'RFC822.HEADER': fixture_file_content(
                    'mail2_header_rfc822.txt'),
                'X-GM-MSGID': 200
            },
            '33': {
                'RFC822.HEADER': fixture_file_content(
                    'mail1_header_rfc822.txt'),
                'X-GM-MSGID': 110
            },
        }
        msgs = self.session.get_thread(1234)
        client.search.assert_called_with('X-GM-THRID 1234')
        client.fetch.assert_called_with(['33', '43'],
                                        ['X-GM-MSGID', 'RFC822.HEADER'])
        self.assertEqual(2, len(msgs))
        mail1 = msgs[0]
        self.assertDictContainsSubset({
                                          'message_id': '6e',
                                          'rfc_message_id': '<msg-id-mail1>',
                                          'subject': 'Mail1 Subject',
                                          'from_email': 'from@example.com',
                                          'in_reply_to': '<in-reply-to-mail1>',
                                          'references': 'ref1 ref2'
                                      }, mail1)
        self.assertEqual(mail1['date'].isoformat(), '2013-10-17T13:20:06')

        mail2 = msgs[1]
        self.assertDictContainsSubset({'subject': 'Mail2 Subject',
                                       'from_name': 'Example'}, mail2)

    def setup_single_thread_mock(self):
        client = self.mock_helper.client_mock
        client.search.return_value = ['33', '43']
        client.fetch.return_value = {'43': {
            'RFC822.HEADER': fixture_file_content(
                'mail2_header_rfc822.txt'),
            'X-GM-MSGID': 2222
        }}

    def test_get_thread_single_reversed(self):
        self.setup_single_thread_mock()
        msgs = self.session.get_thread(1234, limit=1, reverse=True)
        self.assertEqual(msgs[0]['subject'], 'Mail2 Subject')

    def test_get_thread_single(self):
        self.setup_single_thread_mock()
        client = self.mock_helper.client_mock
        client.search.return_value = ['43', '55', '77']
        msgs = self.session.get_thread(1234, limit=1)
        self.assertEqual(msgs[0]['subject'], 'Mail2 Subject')

    def test_auth_error(self):
        self.mock_helper.client_mock.oauth2_login.side_effect = raise_imap
        with self.assertRaises(gmail.AuthenticationError):
            gmail.IMAPSession('nladf', 'dfdf')
        self.assertTrue(self.mock_helper.client_mock.logout.called)


class SMTPSessionTest(unittest.TestCase):
    def setUp(self):
        self.mock_helper = SMTPClientMockHelper()
        self.addCleanup(self.mock_helper.cleanup)
        self.session = gmail.SMTPSession(
            'testuser', 'testtoken')

    def test_login(self):
        self.mock_helper.client_mock.docmd.assert_called_with(
            'AUTH XOAUTH2 '
            'dXNlcj10ZXN0dXNlcgFhdXRoPUJlYXJlciB0ZXN0dG9rZW4BAQ==')

    def test_send_rfc822(self):
        receivers = ['thembrown@gmail.com', 'mb@w69b.com',
                     'cc@example.com', 'bcc@example.com']

        client = self.mock_helper.client_mock
        mail = fixture_file_content('mail_rfc822.txt')
        self.session.send_rfc822(mail)
        client.sendmail.assert_called_once_with('thembrown@gmail.com',
                                                receivers, mock.ANY)


class SendMailRewriterTest(unittest.TestCase):
    def setUp(self):
        self.rewriter = gmail.MailSendRewriter(
            fixture_file_content('mail_rfc822.txt'))

    def test_receivers(self):
        self.assertEquals(self.rewriter.get_receivers(),
                          ['thembrown@gmail.com', 'mb@w69b.com',
                           'cc@example.com', 'bcc@example.com'])

    def test_from(self):
        self.assertEquals('thembrown@gmail.com', self.rewriter.get_from())

    def test_generate_receivers(self):
        del self.rewriter.message['bcc']
        self.rewriter.message['bcc'] = ('otherbcc@example.com, '
                                        'John Bcc <bcc@example.com>')
        cnt = 0
        for receivers in self.rewriter.generate_receivers():
            print receivers
            if receivers == ['bcc@example.com']:
                self.assertEqual(self.rewriter.message['bcc'],
                                 'John Bcc <bcc@example.com>')
            elif receivers == ['otherbcc@example.com']:
                self.assertEqual(self.rewriter.message['bcc'],
                                 'otherbcc@example.com')
            else:
                self.assertEqual(receivers,
                                 ['thembrown@gmail.com', 'mb@w69b.com',
                                  'cc@example.com'])
            cnt += len(receivers)
        self.assertEqual(cnt, 5)

    def test_rewrite(self):
        self.assertIn('Message-Id', self.rewriter.message)
        oldDate = self.rewriter.message['Date']
        self.rewriter.rewrite()
        self.assertIn('Message-Id', self.rewriter.message)
        self.assertNotEqual(oldDate, self.rewriter.message['Date'])
        self.assertNotIn('Bcc', self.rewriter.message)


class MailmanTest(unittest.TestCase):
    def setUp(self):
        imap_patcher = mock.patch('sndlatr.gmail.IMAPSession')
        smtp_patcher = mock.patch('sndlatr.gmail.SMTPSession')

        self.imap_mock = imap_patcher.start().return_value
        self.smtp_mock = smtp_patcher.start().return_value

        self.addCleanup(imap_patcher.stop)
        self.addCleanup(smtp_patcher.stop)
        self.mailman = gmail.Mailman('testuser', 'testauth')

    def test_send_draft(self):
        imap = self.imap_mock
        smtp = self.smtp_mock
        mail = gmail.Mail(fixture_file_content('mail_rfc822.txt'))
        imap.get_mail.return_value = mail

        self.mailman.send_draft(123, 'test_rfc')

        imap.get_mail.assert_called_with(123)
        self.assertTrue(smtp.send_rfc822.called)
        message = smtp.send_rfc822.call_args[0][0]
        self.assertEqual(message['Message-ID'], 'test_rfc')
        self.assertFalse(imap.delete_message.called)

    def test_mark_as_sent(self):
        self.mailman.mark_as_sent(123, sent_message_rfc_id='sentrfc',
                                  mail='mymail')
        imap = self.imap_mock
        imap.mark_as_sent.assert_called_with(123, 'sentrfc', mail='mymail')

    def test_build_reply(self):
        imap = self.imap_mock
        imap.get_thread.return_value = [{'subject': 'testsubject',
                                         'references': 'ref1',
                                         'rfc_message_id': '<msgid>'}]
        mail = self.mailman.build_reply(333)
        self.assertEquals(mail.subject, 'testsubject')
        self.assertDictEqual(mail.headers, {'References': 'ref1\r\n <msgid>',
                                            'In-Reply-To': '<msgid>'})

    def test_build_reply_no_ref(self):
        imap = self.imap_mock
        imap.get_thread.return_value = [{'in_reply_to': '<rep1>',
                                         'subject': '',
                                         'rfc_message_id': '<msgid>'}]
        mail = self.mailman.build_reply(333)
        self.assertDictEqual(mail.headers, {'References': '<rep1>\r\n <msgid>',
                                            'In-Reply-To': '<msgid>'})

    def test_build_reply_no_msgid(self):
        imap = self.imap_mock
        imap.get_thread.return_value = [{'in_reply_to': '',
                                         'subject': '',
                                         'rfc_message_id': None}]
        with self.assertRaises(gmail.RfcMsgIdMissing):
            self.mailman.build_reply(333)

    def test_build_reply_not_found(self):
        imap = self.imap_mock
        imap.get_thread.return_value = []
        with self.assertRaises(gmail.MailNotFound):
            self.mailman.build_reply(333)

    def test_send_mail(self):
        mail = mock.Mock()
        mail.to_mime_message.return_value = 'mymime'
        self.mailman.send_mail(mail)
        mail.to_mime_message.assert_called()
        self.smtp_mock.send_rfc822.assert_caleld_with('mymime')
