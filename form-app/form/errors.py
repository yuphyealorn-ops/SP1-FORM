"""Error type used by every API handler."""


class ApiError(Exception):
    """An error that is safe to show to the client."""

    def __init__(self, status, code, message, fields=None):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.fields = fields or {}

    def to_dict(self):
        body = {"code": self.code, "message": self.message}
        if self.fields:
            body["fields"] = self.fields
        return {"error": body}


def bad_request(message, fields=None):
    return ApiError(422, "validation", message, fields)


def not_found(message="Not found"):
    return ApiError(404, "not_found", message)


def forbidden(message="You do not have access to this"):
    return ApiError(403, "forbidden", message)


def conflict(message):
    return ApiError(409, "conflict", message)
