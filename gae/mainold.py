import os
import logging

import webapp2
import httplib2
from webapp2_extras import jinja2
from google.appengine.api import users
from imapclient import IMAPClient

from apiclient.discovery import build
import oauth2client.appengine

CLIENT_SECRETS = os.path.join(os.path.dirname(__file__), 'client_secrets.json')
# SCOPE = 'https://www.googleapis.com/auth/tasks.readonly'
SCOPE = ['https://mail.google.com/']
decorator = oauth2client.appengine.oauth2decorator_from_clientsecrets(
    CLIENT_SECRETS,
    scope=SCOPE)

service = build('tasks', 'v1')


def test_imap(user):
    credentials = decorator.credentials
    if credentials.access_token_expired:
        logging.debug('Refreshing...')
        credentials.refresh(httplib2.Http())
    conn = IMAPClient('imap.gmail.com', use_uid=True, ssl=True)
    conn.debug = 4

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

    logging.info(msgs)
    logging.info(conn.fetch(msgs, 'X-GM-MSGID'))
    msg = conn.fetch(msgs, 'RFC822')
    logging.info(msg)
    return msg


class MainHandler(webapp2.RequestHandler):
    def render_response(self, template, **context):
        renderer = jinja2.get_jinja2(app=self.app)
        rendered_value = renderer.render_template(template, **context)
        self.response.write(rendered_value)

    @decorator.oauth_aware
    def get(self):
        if decorator.has_credentials():
            # result = service.tasks().list(tasklist='@default').execute(
            #     http=decorator.http())
            # tasks = result.get('items', [])
            # for task in tasks:
            #     task['title_short'] = truncate(task['title'], 26)
            logging.debug(decorator.credentials)
            user = users.get_current_user()
            msg = test_imap(user.email())
            # self.response.write(msg)
            self.render_response('index.html', tasks=[], msg=msg)
        else:
            url = decorator.authorize_url()
            self.render_response('index.html', tasks=[], authorize_url=url)


class LogoutHandler(webapp2.RequestHandler):
    def get(self):
        self.redirect(users.create_logout_url('/'))


def truncate(s, l):
    return s[:l] + '...' if len(s) > l else s


application = webapp2.WSGIApplication([('/', MainHandler),
                                       ('/api/signout', LogoutHandler),
                                       (decorator.callback_path,
                                        decorator.callback_handler()),
                                      ], debug=True)
