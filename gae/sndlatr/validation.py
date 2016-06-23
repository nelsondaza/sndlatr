from voluptuous import Schema, Any, All, Invalid, Length, Required, Optional, \
    Range
import iso8601
import pytz

# re-export
Error = Invalid


def parse_datetime(date):
    """
    Validates date is in iso8601 format. Returns parsed datetime in UTC as as
    native datetime (tzinfo=None).
    """
    if not isinstance(date, basestring):
        raise Invalid('date is not a string')
    try:
        return iso8601.parse_date(date).astimezone(iso8601.UTC).replace(
            tzinfo=None)
    except:
        raise Invalid('date is not in iso8601 format')


def _validate_hex(num):
    if not isinstance(num, basestring):
        raise Invalid('message id is not hex str')
    try:
        int(num, 16)
    except TypeError:
        raise Invalid('invalid message id')
    return num


def _trim_subject(subject):
    if not isinstance(subject, basestring):
        raise Invalid('subject is not a string')
    return subject[0:255]


def _validate_remind_job(job):
    job = _unconditioned_remind_job_schema(job)
    if job.get('onlyIfNoreply') and not job.get('knownMessageIds'):
        raise Invalid('knownMessageIds missing')

    return job


number = Any(int, long)
_str_dict = {basestring: basestring}

send_job_schema = Schema(
    {'scheduledAt': parse_datetime,
     'messageId': _validate_hex,
     'utcOffset': All(int, Range(-24 * 60, 24 * 60)),
     Optional('id'): number,
     Optional('state'): basestring,
     Optional('createdAt'): basestring,
     Optional('subject'): _trim_subject},
    required=True)

_unconditioned_remind_job_schema = Schema(
    {'scheduledAt': parse_datetime,
     'threadId': _validate_hex,
     'utcOffset': All(int, Range(-24 * 60, 24 * 60)),
     Required('knownMessageIds', default=[]): [_validate_hex],
     Optional('onlyIfNoreply'): bool,
     Optional('id'): number,
     Optional('state'): basestring,
     Optional('createdAt'): basestring,
     Optional('disabledReply'): Any(None, _str_dict),
     Optional('subject'): _trim_subject},
    required=True)

remind_job_schema = Schema(_validate_remind_job)

disabled_reply_schema = Schema(
    {
        'fromEmail': basestring,
        'fromName': basestring,
        'messageId': _validate_hex,
    }, extra=True)

auth_code_schema = Schema({'code': basestring})

snippet_schema = Schema({Required('subject', default=''): basestring,
                         Required('body', default=''): basestring,
                         Required('name', default=''): basestring,
                         Optional('createdAt'): basestring,
                         Optional('updatedAt'): basestring,
                         Optional('usageCnt'): number,
                         Optional('id'): number}, required=True)
