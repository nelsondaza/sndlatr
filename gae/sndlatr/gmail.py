import smtplib
import base64
import email.parser
import email.utils
import email.message
import datetime
import logging
import time

from google.appengine.api import mail as gae_mail

import imapclient
import imaplib2

IMAPError = imaplib2.IMAP4.error


class Error(Exception):
    """ base error class """
    # True if we cannot recover from this error by retrying the action.
    persistent = True


class MailboxNotFound(Error):
    """ Mailbox that was expected to exist was not found """


class AuthenticationError(Error):
    """ Authentication failed """
    persistent = False


class InvalidEmail(Error):
    """ Invalid email (eg no from address) """


class RfcMsgIdMissing(Error):
    """ Invalid email (eg no from address) """


class MailNotFound(Error):
    """ Mail was not found """


class Mail(object):
    def __init__(self, rfc_str, labels=None):
        self.rfc_message = rfc_str
        if labels is None:
            labels = []
        self.labels = labels

    def get_parsed_message(self):
        """ Return parsed copy of message (email.message.Message). """
        return email.parser.Parser().parsestr(self.rfc_message)


def xoauth2_bearer(username, access_token):
    """ Returns b64 encoded username and access token for oauth2 login. """
    bearer = 'user=%s\1auth=Bearer %s\1\1' % (username, access_token)
    return base64.b64encode(bearer)


def make_message_id():
    """
    Generates rfc message id. The returned message id includes the angle
    brackets.
    """
    return email.utils.make_msgid('sndlatr')


class IMAPSession(object):
    def __init__(self, user, access_token):
        self._selected_folder = None
        self.client = imapclient.IMAPClient('imap.gmail.com', use_uid=True,
                                            ssl=True)
        if 'COMPRESS=DEFLATE' in self.client.capabilities:
            self.client.enable_compression()
            # WARNING: never set enable this in productive environment
        # It has a bug.
        self.client.debug = 0
        try:
            self.client.oauth2_login(user, access_token)
        except IMAPError, e:
            self.quit()
            raise AuthenticationError('oauth login failed: ' + str(e))
        try:
            self._list_folders()
            # make sure it fails early if those mailboxes do not exist.
            self.get_trash_box()
            self.get_all_box()
        except Exception:
            self.quit()
            raise

    def _list_folders(self):
        """
        List folders folders and stores mapping of box to list of
        flags in dict self.boxes_flags.
        """
        folders = self.client.list_folders()
        self.boxes_flags = {box: flags for (flags, _, box) in folders}

    def get_all_box(self):
        """ Returns name of special All mailbox """
        return self.box_with_flag('\All')

    def get_trash_box(self):
        """ Returns name of special All mailbox """
        return self.box_with_flag('\Trash')

    def select_folder(self, mailbox):
        """
        Select folder. This remembers the folder selected and only
        sends a command to the server if it differs.
        """
        if mailbox != self._selected_folder:
            self._selected_folder = mailbox
            self.client.select_folder(mailbox)

    def delete_message(self, message_id):
        """ Deletes draft with given message id completely.
        """
        client = self.client
        self.select_folder(self.get_all_box())
        uid = self.uid_by_message_id(message_id)
        if not uid:
            raise MailNotFound(
                'mail with id {} not found'.format(message_id))

        # labels = client.get_gmail_labels()
        client.remove_gmail_labels(uid, ['\\Draft'])
        client.add_gmail_labels(uid, ['\\Trash'])
        self.select_folder(self.get_trash_box())
        uid = self.uid_by_message_id(message_id)
        if uid is None:
            raise Error()
        client.delete_messages([uid])
        client.expunge()
        # sent_label = '\\Sent'
        # drafts_label = '\\Draft'
        # client.add_gmail_labels(uid, [sent_label])

    def copy_labels_to_sent(self, rfc_message_id, labels):
        """
        Copies given labels -Draft, +Sent to message with given rfcMessageId
        """
        self.select_folder(self.get_all_box())
        uid = self.uids_by_rfc_message_id(rfc_message_id)
        if uid is not None:
            labels = set(labels)
            # sent label will not be there for re-uploaded messages
            # labels.add('\\Sent')
            labels.discard('\\Draft')
            if labels:
                self.client.add_gmail_labels(uid, labels=list(labels))
        else:
            logging.warning('could not find sent message {}, ignoring'.format(
                rfc_message_id))

    def mark_as_sent(self, message_id, rfc_message_id, mail=None):
        # make sure we can find sent message
        self.client.noop()
        # copy labels to sent message
        if mail is None:
            mail = self.get_mail(message_id)
            if mail is None:
                # mail seems to have been deleted in the meantime,
                # we don't treat this as an error
                logging.warning(
                    'mail was deleted between send '
                    'and mark_as_sent: {}'.format(message_id))
                return

        self.copy_labels_to_sent(rfc_message_id, mail.labels)
        # delete original message
        self.delete_message(message_id)

    def uids_by_rfc_message_id(self, rfc_msg_id):
        """
        Get uid of message with given Rfc message id
        """
        return self.raw_search('rfc822msgid:{}'.format(rfc_msg_id))

    def get_thread(self, thread_id, limit=None, reverse=False):
        """
        Returns unorderd list of metadata of messages in given thread.
        Each item is a dict with the following keys:
        message_id, rfc_message_id, subject, from_name,
        from_email, date, in_reply_to, references.
        Values correspond to the mail header values.
        message_id is the internal gmail message id as hex string.
        """
        self.select_folder(self.get_all_box())
        uids = self.client.search('X-GM-THRID {:d}'.format(thread_id))
        if reverse:
            uids = list(reversed(uids))
        if limit is not None:
            uids = uids[0:limit]
        result = self.client.fetch(uids, ['X-GM-MSGID', 'RFC822.HEADER'])
        # restore original order
        result = [result[uid] for uid in uids]
        msgs = []
        for item in result:
            mail = email.parser.Parser().parsestr(item['RFC822.HEADER'])
            id = '{:x}'.format(int(item['X-GM-MSGID']))
            msg = {'message_id': id,
                   'rfc_message_id': mail.get('message-id'),
                   'in_reply_to': mail.get('in-reply-to'),
                   'references': mail.get('references'),
                   'subject': mail.get('subject')}
            if 'date' in mail:
                date = email.utils.parsedate_tz(mail['date'])
                if date:
                    msg['date'] = datetime.datetime.fromtimestamp(
                        email.utils.mktime_tz(date))
            if 'from' in mail:
                name, addr = email.utils.parseaddr(mail['from'])
                msg['from_name'] = name
                msg['from_email'] = addr
            msgs.append(msg)
        return msgs

    def box_with_flag(self, flag):
        """
        Returns mailbox that has given flag. Raises MailboxNotFound if no such
        mailbox exists.
        """
        for box, flags in self.boxes_flags.iteritems():
            if flag in flags:
                return box
        raise MailboxNotFound(
            'Mailbox with flag {} does not exist'.format(flag))

    def uid_by_message_id(self, message_id):
        """ Search mail by message_id """
        uids = self.client.search('X-GM-MSGID {:d}'.format(message_id))
        if not uids:
            return None
        return uids[0]

    def raw_search(self, query):
        return self.client.search(u'X-GM-RAW {}'.format(query))

    def get_mail(self, message_id):
        """
        Get mails as rfc822 encoded string by message_id (64 bit integer).
        Returns None if mail is not found.
        """
        # select all-mails mailbox
        self.select_folder(self.get_all_box())
        uid = self.uid_by_message_id(message_id)
        if not uid:
            return None
            # search by message id (int format needed for imap)
        messages = self.client.fetch(uid, ['RFC822', 'X-GM-LABELS'])
        msg = messages.get(uid)
        if not msg:
            return None

        return Mail(msg['RFC822'], msg['X-GM-LABELS'])

    def quit(self):
        try:
            self.client.logout()
        except (IMAPError, IOError):
            logging.warn('error during imap.quit(), ignoring', exc_info=True)
            pass


class SMTPSession(object):
    def __init__(self, user, access_token):
        self.client = smtplib.SMTP_SSL('smtp.gmail.com')
        # self.client.set_debuglevel(4)
        self._login(user, access_token)

    def _login(self, user, access_token):
        """ Login with oauth2 token. Raises
        """
        self.client.ehlo_or_helo_if_needed()
        bearer = xoauth2_bearer(user, access_token)
        (code, resp) = self.client.docmd('AUTH XOAUTH2 {}'.format(bearer))
        if code not in (235, 503):
            # 235 == 'Authentication successful'
            # 503 == 'Error: already authenticated'
            raise AuthenticationError(
                'SMTP auth failed with code {}: {}'.format(code, resp))

    def send_rfc822(self, rfc822_mail):
        """
        Send rfc822 mail as fetched via imap. To and from addresses are
        extracted from the rfc822 envolope.
        Returns the rfc message id of the sent message.
        """
        rewriter = MailSendRewriter(rfc822_mail)
        receivers = rewriter.get_receivers()
        rewriter.rewrite()
        if not receivers:
            raise InvalidEmail('no to address')
            # TODO: check for any rejected recepient. Fail if any fails?
        try:
            self.client.sendmail(rewriter.get_from(), receivers,
                                 rewriter.message_as_str())
        except smtplib.SMTPRecipientsRefused:
            raise InvalidEmail('server rejected recepients')

    def quit(self):
        self.client.quit()


class MailSendRewriter(object):
    """
    Helper class to rewrite a rfc822 mail that was fetched via imap to
    prepare it for sending via SMTP.
    """

    def __init__(self, mail_rfc822):
        if isinstance(mail_rfc822, email.message.Message):
            self.message = mail_rfc822
        else:
            self.message = email.parser.Parser().parsestr(mail_rfc822)

    def rewrite(self):
        """ Performs the following modifications to message headers:
        - Updates date in message to current date
        - Removes Message-ID
        """
        message = self.message
        # gmail does not sent if there is a existing message id
        if 'Date' in message:
            del message['Date']
        if 'bcc' in message:
            del message['bcc']
        message['Date'] = email.utils.formatdate()

    def get_from(self):
        """ Returns email address of sender. Raises InvalidEmail if there is
        no from header or it cannot be parsed."""
        from_addr = str(self.message.get('from'))
        try:
            return email.utils.parseaddr(from_addr)[1]
        except AttributeError:
            raise InvalidEmail('missing from address')

    def get_bcc(self):
        """  Returns list of (realname, address) tuples in bcc field. """
        return email.utils.getaddresses(
            str(addr) for addr in self.message.get_all('bcc', []))

    def generate_receivers(self):
        """
        Generator for mails that have to be sent out individually.
        Yields a sequence of receiver lists. Before each receiver list is
        yielded, it modifies self.message to reflect the message headers that
        should be used for that message. It does yield copies of the message
        for memory efficiency reasons.
        It yields a 1-item list of receivers for every bcc entry.
        The message is modified to contain only this bcc header.
        All non-bcc-receivers are yielded as a single multi-item list
        The bcc header is removed when this list is yielded.
        Intened to be used like this::

            for receivers in rewriter.generate_receivers():
                sendmail(receivers, rewriter.message_as_str())
        """
        all_receivers = self.get_receivers()
        bccs = self.get_bcc()
        # email addresses only
        bcc_mails = [addr[1] for addr in bccs]

        bulk_receivers = [m for m in all_receivers if m not in bcc_mails]
        if bulk_receivers:
            self.rewrite()
            yield bulk_receivers

        for name, addr in bccs:
            self.rewrite()
            self.message['bcc'] = email.utils.formataddr((name, addr))
            yield [addr]

    def get_receivers(self):
        """
        List of all receiver email-addresses (without the name parts).
        This includes addresses from the TO, CC and BCC headers.
        """
        message = self.message
        to_addrs = (message.get_all('to', []) +
                    message.get_all('cc', []) +
                    message.get_all('bcc', []))
        to_addrs = [str(addr) for addr in to_addrs]

        to_addrs = email.utils.getaddresses(to_addrs)
        # addresses only without name parts
        return [addr[1] for addr in to_addrs]

    def message_as_str(self):
        """ RFC822 encoded message """
        return self.message.as_string()


class Mailman(object):
    """
    Our main utility class to send email. Interacts with imap and smtp
    sessions
    """

    def __init__(self, user, auth_token):
        self.user = user
        self.auth_token = auth_token
        self._imap_session = None

    def open_imap_session(self):
        """ Returns opened imap session. """
        return IMAPSession(self.user, self.auth_token)

    def open_smtp_session(self):
        """ Returns opened smtp session. """
        return SMTPSession(self.user, self.auth_token)

    def get_opened_imap_session(self):
        """
        Returns imap session. Opens new session if there is no opened
        session yet.
        """
        imap = self._imap_session
        if imap is None:
            imap = self.open_imap_session()
            self._imap_session = imap
        return imap

    def safe_smtp_quit(self, smtp):
        try:
            smtp.quit()
        except (smtplib.SMTPException, IOError):
            logging.warn('error during smtp.quit(), ignoring', exc_info=True)
            # ignore
            pass

    def send_draft(self, message_id, send_rfc_message_id):
        """
        Fetches message with given id from imap and sends it using smtp.
        Returns the original mail as a gmail.Mail object.
        """
        imap = self.get_opened_imap_session()
        mail = imap.get_mail(message_id)
        if mail is None:
            raise MailNotFound('Mail with id {} not found'.format(message_id))
        message = mail.get_parsed_message()
        if 'Message-Id' in message:
            del message['Message-Id']
        message['Message-Id'] = send_rfc_message_id

        smtp = self.open_smtp_session()
        smtp.send_rfc822(message)
        self.safe_smtp_quit(smtp)
        return mail

    def mark_as_sent(self, message_id, sent_message_rfc_id, mail=None):
        """  moves message from drafts to sent folder """
        imap = self.get_opened_imap_session()
        imap.mark_as_sent(message_id, sent_message_rfc_id, mail=mail)

    def get_thread(self, thread_id, **kwargs):
        """ See IMAPSession.get_thread. """
        return self.get_opened_imap_session().get_thread(thread_id, **kwargs)

    def build_reply(self, thread_id, mail=None):
        """
        Modify mail (gae mail.EmailMessage) to a reply of the given thread_id.
        If mail is None, creates a new, empty EmailMessage object.
        This looks up the last message in the given thread and modifies
        the References and Reply-To and subject headers of mail to be a reply
        to this message.
        """
        if mail is None:
            mail = gae_mail.EmailMessage()
        orig_msg = self.get_thread(thread_id, reverse=True, limit=1)
        if not orig_msg:
            raise MailNotFound('thread not found')
        orig_msg = orig_msg[0]

        # set References and In-Reply-To (see rfc rfc2822 3.6.4)
        orig_msg_id = orig_msg.get('rfc_message_id')
        if not orig_msg_id:
            raise RfcMsgIdMissing('Last mail in thread has no rfc message id')
        orig_references = orig_msg.get('references')
        if not orig_references:
            orig_references = orig_msg.get('in_reply_to')
        if not orig_references:
            orig_references = ''

        mail.headers = {'References': orig_references + '\r\n ' + orig_msg_id,
                        'In-Reply-To': orig_msg_id}
        mail.subject = orig_msg['subject']
        return mail

    def send_mail(self, mail):
        """ Sends gae mail.EmailMessage via SMTP. """
        smtp = self.open_smtp_session()
        smtp.send_rfc822(mail.to_mime_message())
        self.safe_smtp_quit(smtp)

    def quit(self):
        imap = self._imap_session
        if imap is not None:
            imap.quit()
            self._imap_session = None

