import logging
from datetime import timedelta
import pytz

import jinja2
from google.appengine.api import mail
from babel.dates import format_datetime


TPL_PATH = 'templates/mailnotify'


def guess_autoescape(template_name):
    if template_name is None or '.' not in template_name:
        return False
    ext = template_name.rsplit('.', 1)[1]
    return ext in ('html', 'htm', 'xml')


def _date_filter(value, format='medium'):
    if format == 'full':
        format = 'EEEE, d. MMMM y \'at\' HH:mm zzzz'
    elif format == 'medium':
        format = 'EE dd.MM.y HH:mm zzzz'
    return format_datetime(value, format, locale='en_US')


jinja_env = jinja2.Environment(autoescape=guess_autoescape,
                               loader=jinja2.FileSystemLoader(TPL_PATH),
                               extensions=['jinja2.ext.autoescape'])

jinja_env.filters['date'] = _date_filter


def render_template(filename, **context):
    """ Render mail template. Returns rendered text """
    return jinja_env.get_template(filename).render(**context)


_sender = 'Sndlatr <mb@w69b.com>'
_send_later_subject = u'Your scheduled email was NOT sent: {}'
_reminder_failure_subject = u'We failed to process your reminder for: {}'
_send_later_failure_reasons = ['auth', 'notfound', 'invalid_mail', 'unknown',
                               'mailbox_not_found']
_remind_failure_reasons = ['auth', 'notfound', 'unknown', 'mailbox_not_found']


def _get_localtime(send_job):
    timezone = pytz.FixedOffset(-send_job.utc_offset)
    time = pytz.utc.localize(send_job.scheduled_at)
    localtime = time.astimezone(timezone)
    return localtime


def _send_failure_notice(job, subject_tpl, tpl_basepath, tpl_vars=None):
    message = mail.EmailMessage(sender=_sender,
                                to=job.user_email,
                                subject=subject_tpl.format(
                                    job.subject))
    localtime = _get_localtime(job)
    ctx = {'scheduled_at': localtime,
           'subject': job.subject}
    if tpl_vars is not None:
        ctx.update(tpl_vars)
    message.body = render_template('{}.txt'.format(tpl_basepath), **ctx)
    message.html = render_template('{}.html'.format(tpl_basepath), **ctx)
    logging.info(u'sending failure notice {} to {}'.format(
        tpl_basepath, job.user_email))
    message.send()


def notify_send_later_failed(send_job, reason):
    """
    Notify user of by email that his scheduled email was not send.
    The mailnotify template that corresponds to the given reason is used as
    body.
    """
    if not reason in _send_later_failure_reasons:
        raise Exception('invalid reason: ' + reason)
    _send_failure_notice(job=send_job,
                         subject_tpl=_send_later_subject,
                         tpl_basepath='send_later/{}'.format(reason))


def notify_reminder_failed(remind_job, reason):
    """
    Notify user of by email that his scheduled email was not send.
    The mailnotify template that corresponds to the given reason is used as
    body.
    """
    if not reason in _remind_failure_reasons:
        raise Exception('invalid reason: ' + reason)
    _send_failure_notice(job=remind_job,
                         subject_tpl=_reminder_failure_subject,
                         tpl_basepath='remind/{}'.format(reason))


def build_remind_message(remind_job):
    """
    Builds a reminder message for given remind_job.
    """
    message = mail.EmailMessage(sender=remind_job.user_email,
                                to=remind_job.user_email)
    ctx = {}
    message.body = render_template('reminder.txt', **ctx)
    message.html = render_template('reminder.html', **ctx)
    return message

