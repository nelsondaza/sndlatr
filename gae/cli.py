#!/usr/bin/python

import logging

from oauth2client.client import flow_from_clientsecrets, \
    credentials_from_clientsecrets_and_code, ID_TOKEN_VERIFICATON_CERTS
from oauth2client.file import Storage
from oauth2client.client import SignedJwtAssertionCredentials, MemoryCache
from oauth2client import crypt
import json
import imaplib
import argparse
import webbrowser
import logging
import imapclient, imaplib2
from imapclient import IMAPClient
import httplib2
from sndlatr import gmail

try:
    from google.appengine.api import mail
except ignored:
    mail = None

logging.basicConfig(level=logging.DEBUG)

httplib2.debuglevel = 4

SCOPES = ['email', 'openid', 'https://mail.google.com/']

_cached_http = httplib2.Http(MemoryCache())


def verify_id_token(id_token, audience, http=None,
                    cert_uri=ID_TOKEN_VERIFICATON_CERTS):
    """Verifies a signed JWT id_token.

    This function requires PyOpenSSL and because of that it does not work on
    App Engine.

    Args:
      id_token: string, A Signed JWT.
      audience: string, The audience 'aud' that the token should be for.
      http: httplib2.Http, instance to use to make the HTTP request. Callers
        should supply an instance that has caching enabled.
      cert_uri: string, URI of the certificates in JSON format to
        verify the JWT against.

    Returns:
      The deserialized JSON in the JWT.

    Raises:
      oauth2client.crypt.AppIdentityError if the JWT fails to verify.
    """
    if http is None:
        http = _cached_http

    resp, content = http.request(cert_uri)

    if resp.status == 200:
        certs = json.loads(content)
        return crypt.verify_signed_jwt_with_certs(id_token, certs, audience)
    else:
        raise VerifyJwtTokenError('Status code: %d' % resp.status)


def get_flow():
    return flow_from_clientsecrets('client_secrets.json',
                                   scope=SCOPES,
                                   redirect_uri='http://localhost:8080/oauth2callback')


def auth1():
    flow = get_flow()
    url = flow.step1_get_authorize_url()
    print url
    webbrowser.open(url)


def code_auth(code):
    credentials = credentials_from_clientsecrets_and_code(
        'client_secrets.json', SCOPES, code)
    storage = Storage('credentials_file')
    storage.put(credentials)
    print credentials.to_json()


def id_token(code):
    print verify_id_token(code,
                          get_flow().client_id)


def auth2(code):
    flow = get_flow()
    credentials = flow.step2_exchange(code)
    print credentials.to_json()
    storage = Storage('credentials_file')
    storage.put(credentials)


def test_imap_old(user):
    storage = Storage('credentials_file')
    credentials = storage.get()
    xoauth = xoauth2_str(user, credentials.access_token)
    conn = imaplib.IMAP4_SSL('imap.googlemail.com')
    conn.debug = 4

    conn.authenticate('XOAUTH2', lambda x: xoauth)

    status, labels = conn.list()

    conn.select("[Gmail]/All Mail")
    # Once authenticated everything from the impalib.IMAP4_SSL class will
    # work as per usual without any modification to your code.
    typ, msgnums = conn.search(None, 'X-GM-RAW', 'vget')

    print 'typ', typ
    print 'num', msgnums
    # conn.select('INBOX')
    # print conn.list()


def get_credentials():
    storage = Storage('credentials_file')
    credentials = storage.get()
    if credentials.access_token_expired:
        print 'Refreshing...'
        credentials.refresh(httplib2.Http())
    return credentials


def test_imap(user):
    credentials = get_credentials()
    conn = IMAPClient('imap.googlemail.com', use_uid=True, ssl=True)
    # conn.debug = 4

    conn.oauth2_login(user, credentials.access_token)

    # status, labels = conn.list()
    folders = conn.list_folders()
    try:
        all_box = next(box for (flags, _, box) in folders if '\All' in flags)
    except StopIteration:
        raise Error('all message box not found')

    logging.debug('All message box is {}'.format(all_box))

    conn.select_folder(all_box)
    # Once authenticated everything from the impalib.IMAP4_SSL class will
    # work as per usual without any modification to your code.
    # typ, msgnums = conn.search('X-GM-RAW vget')
    tid = int('14095f27c538b207', 16)
    # msgs = conn.search('X-GM-THRID {}'.format(tid))
    msgs = conn.search('X-GM-RAW uniquetokenXXX')

    print msgs
    # print conn.fetch(msgs, 'X-GM-MSGID')
    # print conn.fetch(msgs, 'RFC822')
    # conn.select('INBOX')
    # print conn.list()


def test_smtp(user, msgid):
    credentials = get_credentials()
    mailman = gmail.Mailman(user, credentials.access_token)
    # print('boxes are')
    # print(json.dumps(imap.boxes_flags, indent=4))
    message_id = int(msgid, 16)
    print "sending..."
    rfc_id = gmail.make_message_id()
    mail = mailman.send_draft(message_id, rfc_id)

    print "marking as sent."
    mailman.mark_as_sent(message_id, rfc_id, mail)
    print('done')


def test_reply(user, msgid):
    credentials = get_credentials()
    mailman = gmail.Mailman(user, credentials.access_token)
    thread_id = int(msgid, 16)

    print mailman.get_thread(thread_id)
    return
    msg = mailman.build_reply(thread_id)
    msg.sender = user
    msg.to = user

    msg.body = 'this is your reminder'
    msg.html = '<html><body>this is <b>your</b> reminder</body></html>'
    mailman.send_mail(msg)
    # thread = imap.get_thread(thread_id, limit=1, reverse=True)
    # print json.dumps(thread, indent=4)


def test_labels(user, msgid):
    credentials = get_credentials()
    # credentials.refresh(httplib2.Http())
    imap = gmail.IMAPSession(user, credentials.access_token)
    imap.client.select_folder(imap.get_all_box())
    # print('boxes are')
    # print(json.dumps(imap.boxes_flags, indent=4))
    message_id = int(msgid, 16)
    uid = imap.uid_by_message_id(message_id)
    # uid = imap.uids_by_rfc_message_id(msgid)
    print imap.client.get_gmail_labels(uid)
    print imap.client.get_flags(uid)


def test_bug():
    resp =  '[PERMANENTFLAGS (\\Answered \\Flagged \\Draft \\Deleted \\Seen OIB-Seen-[Gmail]/Trash Redirected OIB-Seen-[Gmail]/Important NonJunk OIB-Seen-Unsubscribe $Forwarded OIB-Seen-[Gmail]/All OIB-Seen-INBOX JunkRecorded $NotJunk NotJunk Forwarded $Junk Mail OIB-Seen-[Gmail]/Spam OIB-Seen-[Gmail]/All Mail \\*)] Flags permitted.'
    print imaplib2.IMAP4.response_code_cre.match(resp).group('data')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Process some integers.')
    parser.add_argument('step', choices=['auth1', 'auth2', 'imap', 'smtp',
                                         'reply', 'bug',
                                         'codeauth', 'id_token', 'labels'],
                        default='auth1')
    parser.add_argument('--code')
    parser.add_argument('--user')
    parser.add_argument('--message-id')
    args = parser.parse_args()
    if args.step == 'auth1':
        auth1()
    elif args.step == 'auth2':
        auth2(args.code)
    elif args.step == 'codeauth':
        code_auth(args.code)
    elif args.step == 'id_token':
        id_token(args.code)
    elif args.step == 'imap':
        test_imap(args.user)
    elif args.step == 'reply':
        test_reply(args.user, args.message_id)
    elif args.step == 'smtp':
        test_smtp(args.user, args.message_id)
    elif args.step == 'labels':
        test_labels(args.user, args.message_id)
    elif args.step == 'bug':
        test_bug()


