"""HTTP server: JSON API under /api/ and static files from public/."""

import json
import mimetypes
import sys
import traceback
from datetime import datetime, timedelta, timezone
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlsplit

from . import api  # noqa: F401  (importing registers every route)
from . import router
from .db import connect, init_db
from .errors import ApiError
from .security import RateLimiter, token_hash

MAX_BODY = 64 * 1024
COOKIE_NAME = "form_session"

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Content-Security-Policy": (
        "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; "
        "connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
    ),
}

MIME = {
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".svg": "image/svg+xml",
    ".json": "application/json",
    ".png": "image/png",
    ".ico": "image/x-icon",
}


class App:
    def __init__(self, config, verbose=False):
        self.config = config
        self.verbose = verbose
        self.login_limiter = RateLimiter(limit=8, window=600)
        self.register_limiter = RateLimiter(limit=20, window=3600)
        init_db(config.db_path)

    def connect(self):
        return connect(self.config.db_path)


class Ctx:
    """What an API handler receives."""

    def __init__(self, app, db, params, query, body, ip, user):
        self.app = app
        self.db = db
        self.params = params
        self.query = query
        self._body = body
        self.ip = ip
        self.user = user
        self.set_cookies = []
        self.token_hash = None

    @property
    def config(self):
        return self.app.config

    def now(self):
        return self.app.config.now()

    def today(self):
        return self.now().date()

    def json(self):
        if self._body is None:
            raise ApiError(400, "bad_request", "A JSON body is required")
        return self._body

    def q(self, key, default=None):
        vals = self.query.get(key)
        return vals[0] if vals else default

    def set_session_cookie(self, token, days):
        parts = [f"{COOKIE_NAME}={token}", "Path=/", "HttpOnly", "SameSite=Lax", f"Max-Age={days * 86400}"]
        if self.config.secure_cookies:
            parts.append("Secure")
        self.set_cookies.append("; ".join(parts))

    def clear_session_cookie(self):
        self.set_cookies.append(f"{COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0")


def _utc_now():
    return datetime.now(timezone.utc).replace(tzinfo=None).replace(microsecond=0).isoformat() + "Z"


def session_hash(cookie_header):
    if not cookie_header:
        return None
    try:
        morsel = SimpleCookie(cookie_header).get(COOKIE_NAME)
    except Exception:
        return None
    return token_hash(morsel.value) if morsel and morsel.value else None


def authenticate(db, cookie_header):
    if not cookie_header:
        return None
    try:
        jar = SimpleCookie(cookie_header)
    except Exception:
        return None
    morsel = jar.get(COOKIE_NAME)
    if not morsel or not morsel.value:
        return None
    return db.execute(
        "SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id "
        "WHERE s.token_hash = ? AND s.expires_at > ?",
        (token_hash(morsel.value), _utc_now()),
    ).fetchone()


def make_handler(app):
    class Handler(BaseHTTPRequestHandler):
        server_version = "FORM/1.0"
        protocol_version = "HTTP/1.1"

        def log_message(self, fmt, *args):
            if app.verbose:
                sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

        # ---- entry points
        def do_GET(self):
            self._dispatch()

        do_HEAD = do_GET
        do_POST = do_GET
        do_PUT = do_GET
        do_PATCH = do_GET
        do_DELETE = do_GET

        def _dispatch(self):
            try:
                parts = urlsplit(self.path)
                if parts.path.startswith("/api/"):
                    self._api(parts)
                elif self.command in ("GET", "HEAD"):
                    self._static(parts.path)
                else:
                    self._plain(405, "Method not allowed", extra={"Allow": "GET, HEAD"})
            except (BrokenPipeError, ConnectionResetError):
                self.close_connection = True
            except Exception:  # last resort: never leak a traceback to the client
                traceback.print_exc()
                self.close_connection = True
                try:
                    self._json(500, {"error": {"code": "server_error", "message": "Something went wrong on the server"}})
                except Exception:
                    pass

        # ---- responses
        def _send(self, status, body, content_type, extra=None, cookies=None):
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            for k, v in SECURITY_HEADERS.items():
                self.send_header(k, v)
            for k, v in (extra or {}).items():
                self.send_header(k, v)
            for c in cookies or []:
                self.send_header("Set-Cookie", c)
            if self.close_connection:
                self.send_header("Connection", "close")
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(body)

        def _json(self, status, data, cookies=None):
            body = json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
            self._send(status, body, "application/json; charset=utf-8", {"Cache-Control": "no-store"}, cookies)

        def _plain(self, status, text, extra=None):
            self._send(status, text.encode("utf-8"), "text/plain; charset=utf-8", extra)

        # ---- API
        def _read_body(self):
            """Returns parsed JSON, None for an empty body. Raises ApiError."""
            if self.headers.get("Transfer-Encoding"):
                self.close_connection = True
                raise ApiError(411, "length_required", "Chunked uploads are not supported")
            raw_len = self.headers.get("Content-Length")
            if raw_len is None or raw_len == "0":
                return None
            if not raw_len.isdigit():
                self.close_connection = True
                raise ApiError(400, "bad_request", "Bad Content-Length")
            length = int(raw_len)
            if length > MAX_BODY:
                self.close_connection = True
                raise ApiError(413, "too_large", "Request is too large")
            raw = self.rfile.read(length)
            ctype = (self.headers.get("Content-Type") or "").split(";")[0].strip().lower()
            if ctype != "application/json":
                raise ApiError(415, "unsupported_media_type", "Send application/json")
            try:
                return json.loads(raw.decode("utf-8"))
            except (ValueError, UnicodeDecodeError):
                raise ApiError(400, "bad_json", "The request body is not valid JSON")

        def _api(self, parts):
            method = self.command
            if method == "HEAD":
                method = "GET"
            r, params, allowed = router.find(method, parts.path)
            try:
                body = None
                if method in ("POST", "PUT", "PATCH", "DELETE"):
                    # Custom header: a page on another site cannot send it without our permission,
                    # which blocks cross-site request forgery.
                    body_err = None
                    try:
                        body = self._read_body()
                    except ApiError as e:
                        body_err = e
                    if self.headers.get("X-Requested-With") != "form":
                        raise ApiError(403, "csrf", "Missing request header")
                    if body_err:
                        raise body_err
                if r is None:
                    if allowed:
                        raise ApiError(405, "method_not_allowed", "Method not allowed")
                    raise ApiError(404, "not_found", "No such API endpoint")

                db = app.connect()
                ctx = None
                try:
                    user = authenticate(db, self.headers.get("Cookie"))
                    if r.auth and user is None:
                        raise ApiError(401, "unauthenticated", "Please sign in")
                    ip = self.client_address[0]
                    ctx = Ctx(app, db, params, parse_qs(parts.query), body, ip, user)
                    ctx.token_hash = session_hash(self.headers.get("Cookie"))
                    result = r.fn(ctx)
                    db.commit()
                except BaseException:
                    db.rollback()
                    raise
                finally:
                    db.close()

                status, data = 200, result
                if isinstance(result, tuple):
                    status, data = result
                if data is None:
                    data = {"ok": True}
                self._json(status, data, ctx.set_cookies)
            except ApiError as e:
                self._json(e.status, e.to_dict())

        # ---- static files
        def _static(self, url_path):
            root = app.config.public_dir.resolve()
            rel = unquote(url_path)
            if "\x00" in rel or "\\" in rel:
                return self._plain(400, "Bad request")
            if rel in ("", "/"):
                rel = "/index.html"
            target = (root / rel.lstrip("/")).resolve()
            try:
                inside = target.relative_to(root)
            except ValueError:
                return self._plain(404, "Not found")
            if any(part.startswith(".") for part in inside.parts) or not target.is_file():
                return self._plain(404, "Not found")
            stat = target.stat()
            etag = f'"{stat.st_mtime_ns:x}-{stat.st_size:x}"'
            if self.headers.get("If-None-Match") == etag:
                self.send_response(304)
                self.send_header("ETag", etag)
                for k, v in SECURITY_HEADERS.items():
                    self.send_header(k, v)
                self.end_headers()
                return
            ctype = MIME.get(target.suffix.lower()) or mimetypes.guess_type(target.name)[0] or "application/octet-stream"
            self._send(200, target.read_bytes(), ctype, {"Cache-Control": "no-cache", "ETag": etag})

    return Handler


def make_server(config, verbose=False):
    app = App(config, verbose)
    server = ThreadingHTTPServer((config.host, config.port), make_handler(app))
    server.daemon_threads = True
    return server, app
