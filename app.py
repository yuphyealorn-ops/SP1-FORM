#!/usr/bin/env python3
"""Serve the gym app locally using only the Python standard library."""

from __future__ import annotations

import argparse
import json
import mimetypes
import os
import shutil
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

APP_DIR = Path(__file__).resolve().parent
PUBLIC_DIR = APP_DIR / "public"
SDK_VERSION = "1.1.1"
MODEL_FILES = (
    "vendor/mediapipe/vision_bundle.mjs",
    "vendor/mediapipe/wasm/vision_wasm_internal.js",
    "vendor/mediapipe/wasm/vision_wasm_internal.wasm",
    "vendor/mediapipe/wasm/vision_wasm_nosimd_internal.js",
    "vendor/mediapipe/wasm/vision_wasm_nosimd_internal.wasm",
    "models/pose_landmarker_lite.task",
)
CSP = "; ".join((
    "default-src 'self'",
    "script-src 'self' https://cdn.jsdelivr.net 'wasm-unsafe-eval'",
    "script-src-attr 'none'",
    "style-src 'self' 'unsafe-inline'",
    "connect-src 'self' https://cdn.jsdelivr.net https://storage.googleapis.com",
    "img-src 'self' blob: data:",
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
))
MIME_TYPES = {
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".wasm": "application/wasm",
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".task": "application/octet-stream",
}


def public_path(request_path: str, root: Path = PUBLIC_DIR) -> Path:
    """Resolve a request inside public/, rejecting traversal and symlink escapes."""
    parsed = urlsplit(request_path)
    if parsed.scheme or parsed.netloc:
        raise ValueError("Only local request paths are accepted")
    decoded = unquote(parsed.path, errors="strict")
    if not decoded.startswith("/") or "\\" in decoded or "\x00" in decoded:
        raise ValueError("Invalid path")
    components = decoded.lstrip("/").split("/")
    if any(part.startswith(".") for part in components):
        raise ValueError("Hidden and parent paths are unavailable")
    root = root.resolve()
    resolved = (root / ("index.html" if decoded == "/" else decoded.lstrip("/"))).resolve()
    try:
        resolved.relative_to(root)
    except ValueError as error:
        raise ValueError("Path leaves the public directory") from error
    return resolved


def model_status(root: Path = PUBLIC_DIR) -> dict[str, object]:
    """Report availability, not integrity or model inference success."""
    for name in MODEL_FILES:
        try:
            asset = public_path("/" + name, root)
            if not asset.is_file() or asset.stat().st_size == 0:
                return {"local": False, "sdkVersion": SDK_VERSION}
        except (OSError, ValueError, RuntimeError):
            return {"local": False, "sdkVersion": SDK_VERSION}
    return {"local": True, "sdkVersion": SDK_VERSION}


class AppHandler(BaseHTTPRequestHandler):
    """Read-only routes and static files; no upload or directory-listing endpoints."""

    public_dir = PUBLIC_DIR
    server_version = "GymApp"
    sys_version = ""

    def end_headers(self) -> None:
        self.send_header("Content-Security-Policy", CSP)
        self.send_header("Permissions-Policy", "camera=(self), microphone=(), geolocation=()")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self) -> None:
        self._respond(send_body=True)

    def do_HEAD(self) -> None:
        self._respond(send_body=False)

    def _respond(self, *, send_body: bool) -> None:
        try:
            parsed = urlsplit(self.path)
            if parsed.scheme or parsed.netloc:
                raise ValueError("Invalid request target")
            route = parsed.path
            if route == "/api/health":
                self._json({"app": "gym-app", "status": "ok"}, send_body)
                return
            if route == "/api/model-status":
                self._json(model_status(self.public_dir), send_body)
                return
            target = public_path(self.path, self.public_dir)
            if not target.is_file():
                self.send_error(404, "File not found")
                return
            with target.open("rb") as source:
                self.send_response(200)
                content_type = MIME_TYPES.get(target.suffix.lower())
                if content_type is None:
                    content_type = mimetypes.guess_type(str(target))[0] or "application/octet-stream"
                self.send_header("Content-Type", content_type)
                self.send_header("Content-Length", str(os.fstat(source.fileno()).st_size))
                self.end_headers()
                if send_body:
                    shutil.copyfileobj(source, self.wfile)
        except (BrokenPipeError, ConnectionResetError):
            self.close_connection = True
        except (ValueError, UnicodeError, RuntimeError):
            self.send_error(404, "File not found")
        except OSError:
            self.send_error(404, "File not found")

    def _json(self, value: dict[str, object], send_body: bool) -> None:
        body = json.dumps(value, separators=(",", ":")).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if send_body:
            self.wfile.write(body)


def port_number(value: str) -> int:
    try:
        port = int(value)
    except ValueError as error:
        raise argparse.ArgumentTypeError("Port must be an integer") from error
    if not 1 <= port <= 65535:
        raise argparse.ArgumentTypeError("Port must be between 1 and 65535")
    return port


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=port_number, default=8000)
    parser.add_argument("--open", action="store_true", help="Open the app in your default browser")
    args = parser.parse_args()
    try:
        server = ThreadingHTTPServer(("127.0.0.1", args.port), AppHandler)
    except OSError as error:
        parser.exit(2, f"Could not start the local server: {error}\nTry another --port.\n")
    url = f"http://localhost:{args.port}"
    print(f"Gym app: {url}\nPress Ctrl+C to stop.", flush=True)
    if args.open:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
