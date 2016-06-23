import datetime
import logging
import json
import itertools

from google.appengine.ext import ndb
from google.appengine.api import taskqueue

from oauth2client.appengine import CredentialsNDBProperty
from sndlatr import gmail, mailnotify, validation


class Error(Exception):
    """ Base class for model errors """


class Account(ndb.Model):
    """ Identifies a user of the service. Keyed by gae user_id """
    # last seen email address
    email = ndb.StringProperty()
    credentials = CredentialsNDBProperty(required=True)

    def user_id(self):
        """ return user_id part of key """
        return self.key.id()

    @classmethod
    def get_key(cls, user_id):
        """ Get Key by given user id """
        return ndb.Key(Account, user_id)

    def _pre_put_hook(self):
        if not self.key.id() and not hasattr(self, 'id'):
            raise Error('no key or id. Provide key or user_id as id')


class DisabledReply(ndb.Model):
    """
    Local structured property for RemindJob. Don't use indendently.
    """
    message_id = ndb.StringProperty()
    rfc_message_id = ndb.StringProperty()
    subject = ndb.StringProperty()
    date = ndb.DateTimeProperty()
    from_name = ndb.StringProperty()
    from_email = ndb.StringProperty()

    @classmethod
    def from_gmail_dict(cls, data):
        copy_attrs = ['message_id', 'rfc_message_id', 'subject', 'date',
                      'from_name', 'from_email']
        params = {key: data.get(key) for key in copy_attrs}
        reply = DisabledReply(**params)
        return reply


class Snippet(ndb.Model):
    created_at = ndb.DateTimeProperty(auto_now_add=True, indexed=False)
    updated_at = ndb.DateTimeProperty(auto_now=True, indexed=False)
    usage_cnt = ndb.IntegerProperty(default=0, indexed=False)
    name = ndb.StringProperty(indexed=False)
    subject = ndb.StringProperty(indexed=False)
    body = ndb.TextProperty()
    user_id = ndb.StringProperty(required=True)

    @classmethod
    def query_display(cls, user_id):
        return cls.query(cls.user_id == user_id)


class _ScheduledJob(ndb.Model):
    queue_name = 'scheduled'
    queue_url = '/api/task/override_this'
    created_at = ndb.DateTimeProperty(auto_now_add=True, indexed=False)
    # date this job is scheudled for (utc)
    scheduled_at = ndb.DateTimeProperty(required=True)
    # timezone as offset from utc in minutes. Used for displaying purposes.
    utc_offset = ndb.IntegerProperty(default=0, indexed=False)
    # gae user id string
    user_id = ndb.StringProperty(required=True)
    user_email = ndb.StringProperty(required=True, indexed=False)
    error_cnt = ndb.IntegerProperty(indexed=False, default=0)
    # state, if overwritten in child classes, choices have to include
    # scheduled and queued
    state = ndb.StringProperty(required=True,
                               default='scheduled',
                               choices=['scheduled', 'queued', 'done'])

    @classmethod
    def query_due(cls, time):
        """
        Returns query for scheduled tasks that are due at given datetime.
        """
        return cls.query(cls.state == 'scheduled', cls.scheduled_at <= time)

    @ndb.transactional
    def add_to_queue(self, url=None, target_state='queued', countdown=0):
        """
        Adds job to task queue and transactionally updates state to 'queued'
        and saves job.
        Does nothing if state is not 'scheduled'.
        """
        if self.state != 'scheduled':
            logging.warn('tried to add job {} with state {}, to queue, '
                         'doing nothing'.format(self.key, self.state))
            return
        if url is None:
            url = self.queue_url
        logging.debug(u'scheduling job {} for {}'.format(self.key,
                                                        self.user_email))
        taskqueue.add(url=url,
                      payload=json.dumps({'key': self.key.urlsafe()}),
                      queue_name=self.queue_name,
                      countdown=countdown,
                      transactional=True)
        self.state = target_state
        self.put()

    @classmethod
    def add_all_due_to_queue(cls):
        """
        Schedules all due jobs queried by queue_due(now) to the send
        queue.
        """
        now = datetime.datetime.utcnow()
        for job, countdown in cls.spread_user_jobs(jobs=cls.query_due(now),
                                                   bucket_size=10,
                                                   bucket_margin=30):
            job.add_to_queue(countdown=countdown)

    @staticmethod
    def spread_user_jobs(jobs, bucket_size, bucket_margin):
        jobs = list(jobs)
        keyfn = lambda j: j.user_id
        jobs.sort(key=keyfn)
        for user_id, user_jobs in itertools.groupby(jobs, key=keyfn):
            for num, user_job in enumerate(user_jobs):
                countdown = int(num / bucket_size) * bucket_margin
                yield user_job, countdown


class RemindJob(_ScheduledJob):
    queue_url = '/api/tasks/remind'
    # message id of draft to sent. 64 bit unsigned integer hex encoded
    thread_id = ndb.StringProperty(required=True)
    subject = ndb.StringProperty(indexed=False)
    only_if_noreply = ndb.BooleanProperty(default=False, indexed=False)
    # list of hex-valued message ids in this thread when reminder was set up.
    known_message_ids = ndb.StringProperty(indexed=False, repeated=True)
    state = ndb.StringProperty(required=True,
                               default='scheduled',
                               choices=['scheduled', 'queued', 'done',
                                        'checking', 'disabled', 'failed'])
    disabled_reply = ndb.LocalStructuredProperty(DisabledReply, required=False)

    @classmethod
    def query_display(cls, user_id, delta_minutes=60):
        """
        Query all jobs that have a scheduled date for at most delta_minutes
        ago.
        """
        shortly_ago = datetime.datetime.utcnow() - datetime.timedelta(
            minutes=delta_minutes)

        return cls.query(cls.scheduled_at >= shortly_ago,
                         cls.state.IN(['scheduled', 'queued', 'checking',
                                       'disabled']),
                         cls.user_id == user_id)

    def remind(self, auth_token):
        """
        Sends remind mail. If only_if_noreply is true, it is only sent if
         there was no reply.
        """
        if self.state != 'queued':
            logging.warning(
                'ignoring remind call for un-queued job {}'.format(self.key))
            return
        logging.info('processing remind for job {}'.format(self.key))
        mailman = gmail.Mailman(self.user_email, auth_token)
        try:
            if self.only_if_noreply:
                reply = self.find_reply(mailman)
                if reply is not None:
                    # reply detected, don't send reminder but set state to
                    # done
                    logging.info('reply detected, not sending reminder')
                    self.state = 'done'
                    self.disabled_reply = DisabledReply.from_gmail_dict(reply)
                    self.put()
                    return

            logging.info('sending reminder')
            mail = mailnotify.build_remind_message(self)
            mail = mailman.build_reply(self.thread_id_int, mail)
            mailman.send_mail(mail)
            self.state = 'done'
            self.put()
        finally:
            mailman.quit()

    def add_to_check_reply_queue(self):
        self.add_to_queue(url='/api/tasks/check_reply',
                          target_state='checking')

    def disable_if_replied(self, auth_token):
        """ Checks if there was a reply and disables job if there was. """
        logging.info('processing disable_if_replied for {}'.format(self.key))
        if self.state != 'checking':
            logging.warn('job not in checking state, skipping')
            return
        if not self.only_if_noreply:
            logging.warn('only_if_noreply not configured, skipping')
            self.state = 'scheduled'
            self.put()
            return
        mailman = gmail.Mailman(self.user_email, auth_token)
        try:
            reply = self.find_reply(mailman)
        finally:
            mailman.quit()
        if reply is not None:
            logging.info('reply found, disabling job')
            self.state = 'disabled'
            self.disabled_reply = DisabledReply.from_gmail_dict(reply)
            self.put()
        else:
            self.state = 'scheduled'
            self.put()

    def find_reply(self, mailman):
        """
        Checks if there was a reply. It loads the list of message ids in the
        thread and compares them to the known message ids when the reminder
        was scheduled.
        Returns first unknown message in thread or None if there was no reply.
        """
        logging.debug('checking for replies in thread {}, job: {}'.format(
            self.thread_id_int, self.key.id()))
        msgs = mailman.get_thread(self.thread_id_int)
        known_ids = set(self.known_message_ids)
        for msg in msgs:
            msg_id = msg['message_id']
            if msg_id not in known_ids:
                logging.debug('reply found: ' + msg_id)
                return msg
        logging.debug('no reply found')
        return None

    @property
    def thread_id_int(self):
        """ Thread id as integer. """
        return int(self.thread_id, 16)


class SendJob(_ScheduledJob):
    queue_url = '/api/tasks/send'
    # message id of draft to sent. 64 bit unsigned integer
    message_id = ndb.StringProperty(required=True)
    # state
    state = ndb.StringProperty(required=True,
                               default='scheduled',
                               choices=['scheduled', 'queued', 'sent',
                                        'done', 'failed'])
    subject = ndb.StringProperty(indexed=False)
    sent_mail_rfc_id = ndb.StringProperty(indexed=False)

    @classmethod
    def query_display(cls, user_id, delta_minutes=60):
        """
        Query all jobs that have state scheduled, queued or sent (but not done)
        OR are done and have been scheduled for no longer than delta_minutes
        ago.
        """
        shortly_ago = datetime.datetime.utcnow() - datetime.timedelta(
            minutes=delta_minutes)

        # query all jobs that are
        return cls.query(ndb.OR(cls.state.IN(['scheduled', 'queued', 'sent']),
                                ndb.AND(cls.scheduled_at >= shortly_ago,
                                        cls.state == 'done')),
                         cls.user_id == user_id)

    def send_mail(self, auth_token):
        """
        Sends mail in to steps (sending, and marking as sent)
        that both can fail and be retried
        independently to minimize the effect of failures
        that lead to double sendings.
        The mail is guranteed to have been sent when state is sent or done.
        It is guranteed to have been marked as sent when state equals 'done'.
        """
        logging.debug('send_mail called mail: {}, job:{}'.format(
            self.message_id, self.key.id()))

        mailman = gmail.Mailman(self.user_email, auth_token)
        mail = None

        try:
            # step 1, send mail
            if self.state == 'queued':
                logging.debug('sending mail')
                self.sent_mail_rfc_id = gmail.make_message_id()
                mail = mailman.send_draft(self.message_id_int,
                                          self.sent_mail_rfc_id)
                logging.debug('mail was sent ' + self.sent_mail_rfc_id)
                self.state = 'sent'
                self.put()

            # step 2, move to sent folder
            if self.state == 'sent':
                logging.debug(
                    'marking mail as sent')
                try:
                    mailman.mark_as_sent(self.message_id_int,
                                         self.sent_mail_rfc_id, mail)
                    logging.debug(
                        'mail marked as sent:')
                except gmail.MailNotFound:
                    logging.debug('mail not found, ignoring')
                self.state = 'done'
                self.put()
        finally:
            mailman.quit()

    @property
    def message_id_int(self):
        return int(self.message_id, 16)


@ndb.tasklet
def get_credentials_async(user_id):
    """ Get oauth credentials by user_id asynchronously """
    model = yield Account.get_by_id_async(user_id)
    if model is None:
        credentials = None
    else:
        credentials = model.credentials
    raise ndb.Return(credentials)


def get_credentials(user_id):
    """" Get oauth credentials by user_id synchronously """
    return get_credentials_async(user_id).get_result()


