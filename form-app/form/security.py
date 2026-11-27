"""Password hashing, session tokens and a small login rate limiter."""

import hashlib
import hmac
import os
import secrets
import threading
import time

_SCRYPT = dict(n=2**14, r=8, p=1, dklen=32)


def hash_password(password: str, salt: bytes = None):
    salt = salt or os.urandom(16)
    digest = hashlib.scrypt(password.encode("utf-8"), salt=salt, **_SCRYPT)
    return digest, salt


def verify_password(password: str, digest: bytes, salt: bytes) -> bool:
    candidate, _ = hash_password(password, salt)
    return hmac.compare_digest(candidate, digest)


# Used when the username does not exist, so a login attempt takes the same time
# whether or not the account is real.
_DUMMY_DIGEST, _DUMMY_SALT = hash_password("not-a-real-password", b"\x00" * 16)


def burn_login_time(password: str):
    verify_password(password, _DUMMY_DIGEST, _DUMMY_SALT)


def new_token() -> str:
    return secrets.token_urlsafe(32)


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


class RateLimiter:
    """Allow `limit` failures per `window` seconds for a key."""

    def __init__(self, limit, window):
        self.limit = limit
        self.window = window
        self._hits = {}
        self._lock = threading.Lock()

    def _prune(self, key, now):
        hits = [t for t in self._hits.get(key, []) if now - t < self.window]
        if hits:
            self._hits[key] = hits
        else:
            self._hits.pop(key, None)
        return hits

    def blocked(self, key) -> bool:
        with self._lock:
            return len(self._prune(key, time.monotonic())) >= self.limit

    def hit(self, key):
        with self._lock:
            now = time.monotonic()
            hits = self._prune(key, now)
            hits.append(now)
            self._hits[key] = hits

    def reset(self, key):
        with self._lock:
            self._hits.pop(key, None)
