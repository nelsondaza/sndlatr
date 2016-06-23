"""
Http related errors
"""


class HTTPError(Exception):
    """ Base class for all http related errors """
    status_code = 500


class HTTPForbidden(HTTPError):
    """ Http forbidden error (status code 403). """
    status_code = 403


class HTTPBadRequest(HTTPError):
    """ Client sent a bad request. """
    status_code = 400


class HTTPNotFound(HTTPError):
    status_code = 404


class HTTPSuccess(HTTPError):
    status_code = 200


class HTTPErrorMixin(object):
    """ Adds HTTP error handling to dispatching """

    def dispatch(self):
        try:
            return super(HTTPErrorMixin, self).dispatch()
        except HTTPError, e:
            self.error(e.status_code)
            self.response.write(str(e))

