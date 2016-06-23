import datetime
import logging
import json

import webapp2
from iso8601 import UTC
from oauth2client.client import FlowExchangeError
from google.appengine.api import users, taskqueue
from google.appengine.ext import ndb
import httplib2
from oauth2client.client import AccessTokenRefreshError

from w69b.handlers import JSONMixin
from w69b.httperr import *
from sndlatr import models, gmail, auth, mailnotify, validation


JOB_MAX_RETRIES = 15


class JSONEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, models.SendJob):
            return self._encode_send_job(o)
        if isinstance(o, models.RemindJob):
            return self._encode_remind_job(o)
        if isinstance(o, models.DisabledReply):
            return self._encode_disabled_reply(o)
        if isinstance(o, models.Snippet):
            return self._encode_snippet(o)
        if isinstance(o, datetime.datetime):
            return o.replace(tzinfo=UTC).isoformat()
        if isinstance(o, datetime.date):
            return o.isoformat()
        return json.JSONEncoder.default(self, o)

    def _encode_snippet(self, snippet):
        return {
            'id': snippet.key.id(),
            'usageCnt': snippet.usage_cnt,
            'updatedAt': snippet.updated_at,
            'subject': snippet.subject,
            'body': snippet.body,
            'name': snippet.name,
        }

    def _encode_base_job(self, job):
        return {'id': job.key.id(),
                'state': job.state,
                'scheduledAt': job.scheduled_at,
                'createdAt': job.created_at,
                'utcOffset': job.utc_offset}

    def _encode_send_job(self, job):
        json = self._encode_base_job(job)
        json.update({
            'subject': job.subject,
            'messageId': job.message_id
        })
        return json

    def _encode_remind_job(self, job):
        json = self._encode_base_job(job)
        json.update({
            'subject': job.subject,
            'threadId': job.thread_id,
            'knownMessageIds': job.known_message_ids,
            'onlyIfNoreply': job.only_if_noreply,
            'disabledReply': job.disabled_reply
        })
        return json

    def _encode_disabled_reply(self, reply):
        return {
            'rfcMessageId': reply.rfc_message_id,
            'messageId': reply.message_id,
            'fromName': reply.from_name,
            'fromEmail': reply.from_email,
            'date': reply.date,
        }


class ValidationErrorMixin(object):
    """ Adds validation error handling to dispatching chain. """

    def dispatch(self):
        try:
            return super(ValidationErrorMixin, self).dispatch()
        except validation.Error, err:
            logging.info(str(err))
            raise HTTPBadRequest()


class AllowOriginMixin(object):
    """ Allows gmail for xs origin request. """
    _allowed_headers = ['x-w69b-idtoken', 'Origin', 'Content-Type',
                        'Cache-Control', 'Pragma', 'Referer', 'User-Agent']

    def add_headers(self):
        headers = self.response.headers
        headers['Access-Control-Allow-Origin'] = '*'
        headers['Access-Control-Allow-Headers'] = ', '.join(
            self._allowed_headers)
        headers['Access-Control-Allow-Credentials'] = 'True'
        headers['Access-Control-Allow-Methods'] = \
            'GET, POST, PUT, DELETE, OPTIONS'
        headers['Access-Control-Max-Age'] = '86400'

    def options(self, *args, **kwargs):
        self.add_headers()
        self.response.status = '204'

    def dispatch(self):
        self.add_headers()
        return super(AllowOriginMixin, self).dispatch()


class BaseHandler(AllowOriginMixin, HTTPErrorMixin, JSONMixin,
                  ValidationErrorMixin, webapp2.RequestHandler):
    """ Base class for all api request handlers """
    json_encoder = JSONEncoder


class BaseCRUDHandler(BaseHandler):
    """ Provids basic crud functionality for given model class.
    """
    model_cls = None
    validator = None

    def create_model(self, data):
        """ create a new model from given data """
        user = auth.get_current_user()
        job = self.model_cls(user_id=user.user_id())
        self._set_model_data(job, data)
        job.put()
        logging.debug('created Model {}'.format(job.key))
        self.response_json(job)

    def get_model(self, id):
        try:
            id = int(id)
        except ValueError:
            raise HTTPBadRequest('invalid job id')
        user = auth.get_current_user()
        model = self.model_cls.get_by_id(id)
        if model is None:
            raise HTTPNotFound()
        if model.user_id != user.user_id():
            raise HTTPForbidden()
        return model

    def update_model(self, id, data):
        """ updates existing job with id with given data """
        job = self.get_model(id)
        self._set_model_data(job, data)
        job.put()
        logging.debug('updated Job {}'.format(job.key))
        self.response_json(job)

    @auth.login_required
    def get(self, id=None):
        if id is not None:
            return self.response_json(self.get_model(id))
        else:
            user = auth.get_current_user()
            # ignore ids > 100
            try:
                ids = [int(id) for id in self.request.GET.getall('id')[0:100]]
            except ValueError:
                raise HTTPBadRequest()
            job_futures = [self.model_cls.get_by_id_async(id) for id in ids]
            jobs = [future.get_result() for future in job_futures]
            jobs = filter(None, jobs)
            if any(job.user_id != user.user_id() for job in jobs):
                raise HTTPForbidden()
            return self.response_json(jobs)

    @auth.login_required
    def post(self, id=None):
        data = self.validator(self.json)
        if id is not None:
            self.update_model(id, data)
        else:
            self.create_model(data)

    @auth.login_required
    def delete(self, id):
        job = self.get_model(id)
        job.key.delete()
        self.response_json(None)

    def _set_model_data(self, job, data):
        raise NotImplementedError()


class SnippetHandler(BaseCRUDHandler):
    """ Simple CRUD handler for snippets. """
    validator = validation.snippet_schema
    model_cls = models.Snippet

    def _set_model_data(self, job, data):
        job.subject = data['subject']
        job.body = data['body']
        job.name = data['name']


class JobBaseHandler(BaseCRUDHandler):
    """ Base class for dealing with jobs """
    allowed_delete_states = ['scheduled']
    # delete in this state will succeed but do nothing
    ignore_delete_states = []

    def create_model(self, data):
        """ create a new job from given data """
        user = auth.get_current_user()
        job = self.model_cls(user_email=user.email(),
                             user_id=user.user_id())
        self._set_model_data(job, data)
        job.put()
        logging.debug(u'created Job {} for {}'.format(job.key, job.user_email))
        self.response_json(job)

    @auth.login_required
    def delete(self, id):
        job = self.get_model(id)
        if job.state in self.allowed_delete_states:
            job.key.delete()
            self.response_json(None)
        elif job.state in self.ignore_delete_states:
            # ignore command
            self.response_json(None)
        else:
            raise HTTPNotFound()


class ScheduleSendHandler(JobBaseHandler):
    """ Allows to add send jobs or modify existing jobs. """
    model_cls = models.SendJob
    validator = validation.send_job_schema

    def _set_model_data(self, job, data):
        job.message_id = data['messageId']
        job.scheduled_at = data['scheduledAt']
        job.subject = data.get('subject', '')
        job.utc_offset = data['utcOffset']


class ScheduleRemindHandler(JobBaseHandler):
    """ Allows to add send jobs or modify existing jobs. """
    model_cls = models.RemindJob
    validator = validation.remind_job_schema
    allowed_delete_states = ['scheduled', 'disabled']
    ignore_delete_states = ['queued', 'done']

    def _set_model_data(self, job, data):
        job.thread_id = data['threadId']
        job.scheduled_at = data['scheduledAt']
        job.utc_offset = data['utcOffset']
        job.subject = data.get('subject', '')
        job.only_if_noreply = data.get('onlyIfNoreply', False)
        job.known_message_ids = data['knownMessageIds']


class ScheduleCheckReplyHandler(BaseHandler):
    @auth.login_required
    def post(self, id):
        job = models.RemindJob.get_by_id(int(id))
        user = auth.get_current_user()
        if job is None:
            raise HTTPNotFound()
        if job.user_id != user.user_id():
            raise HTTPForbidden()
        if job.state != 'scheduled':
            logging.warn('check_reply for non-scheduled job not possible')
            raise HTTPBadRequest()
        reply = validation.disabled_reply_schema(self.json)
        job.disabled_reply = models.DisabledReply(
            message_id=reply['messageId'],
            from_name=reply['fromName'],
            from_email=reply['fromEmail'])
        job.add_to_check_reply_queue()
        self.response_json(None)


class InitializeHanlder(BaseHandler):
    @auth.login_required
    def get(self):
        user = auth.get_current_user()
        account_future = models.Account.get_by_id_async(user.user_id())

        send_jobs_future = models.SendJob.query_display(
            user.user_id()).fetch_async()
        remind_jobs_future = models.RemindJob.query_display(
            user.user_id()).fetch_async()
        snippets_future = models.Snippet.query_display(
            user.user_id()).fetch_async()

        account = account_future.get_result()

        if account is None:
            self.response_json({'auth': 'need_code'})
            return

        self.response_json(
            {'sendJobs': send_jobs_future.get_result(),
             'remindJobs': remind_jobs_future.get_result(),
             'snippets': snippets_future.get_result()})

    def post(self):
        """
        Exchange client supplied oauth code for credentials.
        This does not require idtoken auth. User id is obtained form the
        oauth flow instead.
        """
        code = validation.auth_code_schema(self.json).get('code')
        try:
            credentials = auth.credentials_from_code(code)
        except FlowExchangeError:
            raise HTTPBadRequest('invalid code')
            # reject if we did not get a refresh token and id_token
        if not credentials.refresh_token:
            logging.warning('got no refresh token')
            raise HTTPForbidden('not initial code')
        id_token = credentials.id_token
        if id_token is None:
            raise HTTPForbidden('got no id token')
        try:
            email = id_token['email']
            user_id = id_token['sub']
        except KeyError:
            raise HTTPForbidden('no valid id')
        account = models.Account(email=email, id=user_id,
                                 credentials=credentials)
        account.put()


class JobTaskBaseHandler(BaseHandler):
    """ Base class for job processing handlers called by taskqueue. """

    def raise_retry_if_possible(self, job, max_retries=JOB_MAX_RETRIES):
        """
        Raise retry status code if job has not exeeded maximal number of
        retries yet and save job.
        Do nothing if retry is not posible.
        """
        if job.error_cnt <= max_retries:
            # this raises so put here
            job.put()
            return self.retry_task()

    def retry_task(self):
        # non success status code triggers retry
        raise HTTPError()

    def get_model(self):
        if not isinstance(self.json, dict):
            raise HTTPSuccess()
        key = self.json.get('key', None)
        if not key:
            logging.warn('send handler called without key')
            raise HTTPSuccess()
        key = ndb.Key(urlsafe=key)
        job = key.get()
        if job is None:
            logging.warn('job {} not found'.format(key))
            raise HTTPSuccess()
        return job

    def get_credentials(self, job):
        credentials = models.get_credentials(job.user_id)
        if not credentials:
            logging.error(
                'no credentials stored for user {}'.format(job.user_id))
            raise HTTPSuccess()
        logging.debug('refreshing oauth token')
        try:
            credentials.refresh(httplib2.Http())
        except AccessTokenRefreshError, e:
            logging.warning('refreshing token failed: ' + str(e))
            raise gmail.AuthenticationError()
        return credentials


class SendHandler(JobTaskBaseHandler):
    """
    Handler for actually sending mails (used by taskqueue).
    """

    def handle_error(self, job, err):
        logging.debug('handling error ' + str(err))
        job.error_cnt += 1
        if isinstance(err, gmail.AuthenticationError):
            # auth errors can be temporary (eg too many connections).
            self.raise_retry_if_possible(job)
            mailnotify.notify_send_later_failed(job, 'auth')
        elif isinstance(err, gmail.MailNotFound):
            mailnotify.notify_send_later_failed(job, 'notfound')
        elif isinstance(err, gmail.InvalidEmail):
            mailnotify.notify_send_later_failed(job, 'invalid_mail')
        elif isinstance(err, gmail.MailboxNotFound):
            mailnotify.notify_send_later_failed(job, 'mailbox_not_found')
        else:
            logging.error(
                'unknown error while sending job {}'.format(
                    job.key),
                exc_info=True)
            self.raise_retry_if_possible(job)
            mailnotify.notify_send_later_failed(job, 'unknown')
        job.state = 'failed'
        job.put()

    @auth.task_only
    def post(self):
        """
        Called by taskqueue, process a send job.
        """
        logging.debug('running send handler')
        job = self.get_model()
        logging.info('send: processing job {}'.format(job.key))
        try:
            credentials = self.get_credentials(job)
            job.send_mail(credentials.access_token)
        except Exception, err:
            self.handle_error(job, err)


class RemindHandler(JobTaskBaseHandler):
    def handle_error(self, job, err):
        logging.debug('handling error ' + str(err))
        job.error_cnt += 1
        if isinstance(err, gmail.AuthenticationError):
            # auth errors can be temporary (eg too many connections).
            self.raise_retry_if_possible(job)
            mailnotify.notify_reminder_failed(job, 'auth')
        elif isinstance(err, gmail.MailNotFound):
            mailnotify.notify_reminder_failed(job, 'notfound')
        elif isinstance(err, gmail.MailboxNotFound):
            mailnotify.notify_reminder_failed(job, 'mailbox_not_found')
        elif isinstance(err, gmail.RfcMsgIdMissing):
            mailnotify.notify_reminder_failed(job, 'unknown')
        else:
            logging.error(
                'unknown error while sending job {}'.format(
                    job.key),
                exc_info=True)
            self.raise_retry_if_possible(job)
            mailnotify.notify_reminder_failed(job, 'unknown')
        job.state = 'failed'
        job.put()

    @auth.task_only
    def post(self):
        """
        Called by taskqueue, process a remind job.
        """
        logging.debug('running remind handler')
        job = self.get_model()
        logging.info('reply: processing job {}'.format(job.key))
        try:
            credentials = self.get_credentials(job)
            job.remind(credentials.access_token)
        except Exception, err:
            self.handle_error(job, err)


class CheckReplyHandler(JobTaskBaseHandler):
    def raise_retry_if_possible(self, job, max_retries=JOB_MAX_RETRIES):
        """
        Raise retry status code if job has not exeeded maximal number of
        retries yet and save job.
        Do nothing if retry is not posible.
        """
        if job.error_cnt <= max_retries:
            # this raises so put here
            job.put()
            return self.retry_task()

    def handle_error(self, job, err):
        logging.info('handling error ' + str(err))
        job.error_cnt += 1

        self.raise_retry_if_possible(job, 2)
        logging.warn('check_reply failed completely, no more retries',
                     exc_info=True)
        # reset error count
        job.state = 'scheduled'
        job.error_cnt = 0
        job.put()

    @auth.task_only
    def post(self):
        """
        Called by taskqueue, process a check_reply job.
        """
        logging.debug('running check_reply handler')
        job = self.get_model()
        logging.info('check_reply: processing job {}'.format(job.key))
        try:
            credentials = self.get_credentials(job)
            job.disable_if_replied(credentials.access_token)
        except Exception, err:
            self.handle_error(job, err)


class QueueJobHandler(BaseHandler):
    """
    Called in cron job. Looks for due jobs and adds them to taskqueue.
    """

    @auth.cron_only
    def get(self):
        models.SendJob.add_all_due_to_queue()
        models.RemindJob.add_all_due_to_queue()


