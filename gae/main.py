import os
import json

import webapp2
from webapp2 import Route
import oauth2client.appengine
from sndlatr import api, auth


def get_client_id():
    path = os.path.join(os.path.dirname(__file__), 'client_secrets.json')
    with open(path) as fd:
        data = json.load(fd)
        return data.values()[0]['client_id']


config = {'idtoken_audience': get_client_id()}

app = webapp2.WSGIApplication(
    [Route('/api/init', api.InitializeHanlder),
     Route('/api/schedule/<id>', api.ScheduleSendHandler),
     Route('/api/schedule', api.ScheduleSendHandler),
     Route('/api/snippet/<id>', api.SnippetHandler),
     Route('/api/snippet', api.SnippetHandler),
     Route('/api/remind/<id>', api.ScheduleRemindHandler),
     Route('/api/remind', api.ScheduleRemindHandler),
     Route('/api/remind/<id>/check_reply', api.ScheduleCheckReplyHandler),
     ('/api/tasks/enqueue_scheduled', api.QueueJobHandler),
     ('/api/tasks/send', api.SendHandler),
     ('/api/tasks/remind', api.RemindHandler),
     ('/api/tasks/check_reply', api.CheckReplyHandler),
     # ('/api/signout', LogoutHandler),
    ], debug=False, config=config)
