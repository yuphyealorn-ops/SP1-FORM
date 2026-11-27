"""Tiny URL router. API modules register handlers with @route."""

import re

_ROUTES = []


class Route:
    def __init__(self, method, pattern, fn, auth):
        self.method = method
        self.pattern = pattern
        self.fn = fn
        self.auth = auth
        self.regex = re.compile("^" + re.sub(r"<int:(\w+)>", r"(?P<\1>[0-9]{1,12})", pattern) + "$")


def route(method, pattern, auth=True):
    def decorator(fn):
        _ROUTES.append(Route(method, pattern, fn, auth))
        return fn

    return decorator


def find(method, path):
    """Return (route, params, allowed_methods)."""
    allowed = []
    for r in _ROUTES:
        m = r.regex.match(path)
        if not m:
            continue
        if r.method == method:
            return r, {k: int(v) for k, v in m.groupdict().items()}, []
        allowed.append(r.method)
    return None, {}, allowed
