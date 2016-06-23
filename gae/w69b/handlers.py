import json
import httperr

import webapp2
from webapp2_extras import jinja2


class JSONMixin(object):
    """ Mixin for decoding json encoded post data. """
    json_encoder = None

    def dispatch(self):
        request = self.request
        # there is POST payload
        self.json = None
        if request.method == 'POST' and request.content_length > 0:
            try:
                self.json = json.load(request.body_file)
            except ValueError:
                raise httperr.HTTPBadRequest('request body is invalid json')

        return super(JSONMixin, self).dispatch()

    def response_json(self, obj, status=None):
        """ Serializes obj as json and writes it to response """
        _init_json_response(self.response, obj, status, self.json_encoder)

    def write_json(self, serialized, status=200):
        """ Writes already serialized json data to response """
        self.status_int = status
        self.response.content_type = 'application/json; charset=utf-8'
        self.response.write(serialized)


def _init_json_response(response, obj, status, encoder):
    """
    Sets status and response body on a Response for returning json data.
    """
    response.content_type = 'application/json; charset=utf-8'
    if status is None:
        if obj is None:
            # no content
            response.status_int = 204
    else:
        response.status_int = status
    if obj is not None:
        json.dump(obj, response, cls=encoder)


class TemplateBaseHandler(httperr.HTTPErrorMixin, webapp2.RequestHandler):
    """ Base handler for template pages. """

    def render_response(self, template, **context):
        """
        Render given template with jinja2 tempalte engine to body.
        Template is the filename of the template in the tempaltes directory.
        Keyword arguments are mapped to templates variables.
        """
        # context['is_dev'] = is_dev()
        # Renders a template and writes the result to the response.
        body = jinja2.get_jinja2(app=self.app).render_template(template,
                                                               **context)
        self.response.write(body)

