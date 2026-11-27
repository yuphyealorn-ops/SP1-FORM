"""Collects every field problem in one go and raises a single 422."""

import re

from .errors import bad_request
from .timeutil import parse_date, parse_hhmm

_URL = re.compile(r"^https?://[^\s<>\"']+$", re.IGNORECASE)


class Validator:
    def __init__(self, data):
        if not isinstance(data, dict):
            raise bad_request("Expected a JSON object")
        self.data = data
        self.errors = {}
        self.out = {}

    def _fail(self, key, message):
        self.errors.setdefault(key, message)
        return None

    def _missing(self, key, required, default):
        v = self.data.get(key)
        if v is None or v == "":
            if required:
                self._fail(key, "This field is required")
            else:
                self.out[key] = default
            return True
        return False

    def str(self, key, min=1, max=100, required=True, default=None, pattern=None, lower=False):
        if self._missing(key, required, default):
            return self.out.get(key)
        v = self.data[key]
        if not isinstance(v, str):
            return self._fail(key, "Must be text")
        v = " ".join(v.split()) if max <= 100 else v.strip()
        if lower:
            v = v.lower()
        if len(v) < min or len(v) > max:
            return self._fail(key, f"Must be {min}–{max} characters" if min > 0 else f"At most {max} characters")
        if pattern and not re.match(pattern, v):
            return self._fail(key, "Contains characters that are not allowed")
        self.out[key] = v
        return v

    def secret(self, key, min=8, max=128):
        """A password: length-checked but never trimmed or rewritten."""
        v = self.data.get(key)
        if not isinstance(v, str) or v == "":
            return self._fail(key, "This field is required")
        if len(v) < min or len(v) > max:
            return self._fail(key, f"Must be {min}–{max} characters")
        self.out[key] = v
        return v

    def text(self, key, max=500, required=False, default=""):
        """Free text that may contain line breaks."""
        if self._missing(key, required, default):
            return self.out.get(key)
        v = self.data[key]
        if not isinstance(v, str):
            return self._fail(key, "Must be text")
        v = v.strip()
        if len(v) > max:
            return self._fail(key, f"At most {max} characters")
        self.out[key] = v
        return v

    def int(self, key, min=None, max=None, required=True, default=None):
        if self._missing(key, required, default):
            return self.out.get(key)
        v = self.data[key]
        if isinstance(v, bool) or not isinstance(v, (int, float)) or int(v) != v:
            return self._fail(key, "Must be a whole number")
        v = int(v)
        if (min is not None and v < min) or (max is not None and v > max):
            return self._fail(key, f"Must be between {min} and {max}")
        self.out[key] = v
        return v

    def num(self, key, min=None, max=None, required=True, default=None):
        if self._missing(key, required, default):
            return self.out.get(key)
        v = self.data[key]
        if isinstance(v, bool) or not isinstance(v, (int, float)) or v != v or v in (float("inf"), float("-inf")):
            return self._fail(key, "Must be a number")
        if (min is not None and v < min) or (max is not None and v > max):
            return self._fail(key, f"Must be between {min} and {max}")
        self.out[key] = float(v)
        return float(v)

    def bool(self, key, default=False):
        v = self.data.get(key, default)
        if not isinstance(v, bool):
            return self._fail(key, "Must be true or false")
        self.out[key] = v
        return v

    def choice(self, key, options, required=True, default=None):
        if self._missing(key, required, default):
            return self.out.get(key)
        v = self.data[key]
        if v not in options:
            return self._fail(key, "Choose one of: " + ", ".join(map(str, options)))
        self.out[key] = v
        return v

    def date(self, key, required=True, default=None):
        if self._missing(key, required, default):
            return self.out.get(key)
        d = parse_date(self.data[key])
        if d is None:
            return self._fail(key, "Use the format YYYY-MM-DD")
        self.out[key] = d
        return d

    def time(self, key, required=True, default=None):
        """Clock time 'HH:MM' -> minutes after midnight."""
        if self._missing(key, required, default):
            return self.out.get(key)
        m = parse_hhmm(self.data[key])
        if m is None:
            return self._fail(key, "Use the format HH:MM")
        self.out[key] = m
        return m

    def url(self, key, required=False):
        if self._missing(key, required, None):
            return self.out.get(key)
        v = self.data[key]
        if not isinstance(v, str) or len(v) > 300 or not _URL.match(v.strip()):
            return self._fail(key, "Must be a web link starting with http:// or https://")
        self.out[key] = v.strip()
        return v.strip()

    def str_list(self, key, allowed, max_items=10):
        v = self.data.get(key, [])
        if not isinstance(v, list) or len(v) > max_items or any(x not in allowed for x in v):
            return self._fail(key, "Invalid list")
        out = list(dict.fromkeys(v))
        self.out[key] = out
        return out

    def done(self):
        if self.errors:
            raise bad_request("Please fix the highlighted fields", self.errors)
        return self.out
