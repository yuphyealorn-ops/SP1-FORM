"""Exercise real HTTP parsing and responses without opening a network socket."""

from __future__ import annotations

import importlib.util
import io
import json
import os
import ssl
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

APP_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(APP_DIR))
import app  # noqa: E402

spec = importlib.util.spec_from_file_location("setup_models", APP_DIR / "scripts/setup_models.py")
setup_models = importlib.util.module_from_spec(spec)
spec.loader.exec_module(setup_models)


class MemorySocket:
    def __init__(self, request: bytes):
        self.input = io.BytesIO(request)
        self.output = bytearray()

    def makefile(self, *_args, **_kwargs):
        return self.input

    def sendall(self, data: bytes):
        self.output.extend(data)


class ServerTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name) / "public"
        self.root.mkdir()
        (self.root / "index.html").write_text("<h1>Gym</h1>", encoding="utf-8")
        (self.root.parent / "secret.txt").write_text("private", encoding="utf-8")
        root = self.root

        class QuietHandler(app.AppHandler):
            public_dir = root

            def log_message(self, *_args):
                pass

        self.handler = QuietHandler

    def request(self, path="/", method="GET"):
        request = f"{method} {path} HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n".encode()
        connection = MemorySocket(request)
        server = SimpleNamespace(server_name="localhost", server_port=8000)
        self.handler(connection, ("127.0.0.1", 12345), server)
        headers, body = bytes(connection.output).split(b"\r\n\r\n", 1)
        lines = headers.decode().split("\r\n")
        status = int(lines[0].split()[1])
        fields = dict(line.split(": ", 1) for line in lines[1:])
        return status, fields, body

    def test_health_returns_json(self):
        status, headers, body = self.request("/api/health?check=1")
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body), {"app": "gym-app", "status": "ok"})
        self.assertEqual(int(headers["Content-Length"]), len(body))
        self.assertIn("application/json", headers["Content-Type"])

    def test_index_is_served_and_head_has_no_body(self):
        status, _, body = self.request()
        self.assertEqual((status, body), (200, b"<h1>Gym</h1>"))
        status, headers, body = self.request(method="HEAD")
        self.assertEqual((status, body), (200, b""))
        self.assertEqual(int(headers["Content-Length"]), len(b"<h1>Gym</h1>"))
        status, _, body = self.request("/api/health", "HEAD")
        self.assertEqual((status, body), (200, b""))

    def test_module_and_wasm_mime_types(self):
        for name, expected in (("test.mjs", "text/javascript"), ("test.wasm", "application/wasm")):
            with self.subTest(name=name):
                (self.root / name).write_bytes(b"asset")
                status, headers, body = self.request("/" + name)
                self.assertEqual(status, 200)
                self.assertIn(expected, headers["Content-Type"])
                self.assertEqual(body, b"asset")

    def test_paths_cannot_leave_public(self):
        for path in ("/../secret.txt", "/%2e%2e/secret.txt", "/%2e%2e%2fsecret.txt",
                     "/..%5csecret.txt", "/%00", "/.env", "/app.py", "/README.md",
                     "https://example.com/index.html", "//example.com/index.html"):
            with self.subTest(path=path):
                status, _, body = self.request(path)
                self.assertEqual(status, 404)
                self.assertNotIn(b"private", body)

    def test_symlink_to_outside_public_is_not_served(self):
        (self.root / "leak.txt").symlink_to(self.root.parent / "secret.txt")
        (self.root / "escape").symlink_to(self.root.parent, target_is_directory=True)
        self.assertEqual(self.request("/leak.txt")[0], 404)
        self.assertEqual(self.request("/escape/secret.txt")[0], 404)

    def test_directory_listing_is_disabled(self):
        (self.root / "assets").mkdir()
        (self.root / "assets/private-name.txt").write_text("file", encoding="utf-8")
        for path in ("/assets", "/assets/"):
            status, _, body = self.request(path)
            self.assertEqual(status, 404)
            self.assertNotIn(b"private-name.txt", body)

    def test_missing_asset_does_not_fall_back_to_html(self):
        self.assertEqual(self.request("/missing.mjs")[0], 404)
        self.assertEqual(self.request("/api/unknown")[0], 404)

    def test_model_status_requires_every_nonempty_asset(self):
        self.assertEqual(json.loads(self.request("/api/model-status")[2]),
                         {"local": False, "sdkVersion": "1.1.1"})
        for name in app.MODEL_FILES:
            path = self.root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(b"asset")
        self.assertEqual(json.loads(self.request("/api/model-status")[2]),
                         {"local": True, "sdkVersion": "1.1.1"})
        (self.root / app.MODEL_FILES[-1]).write_bytes(b"")
        self.assertFalse(json.loads(self.request("/api/model-status")[2])["local"])
        (self.root / app.MODEL_FILES[-1]).unlink()
        (self.root / app.MODEL_FILES[-1]).symlink_to(self.root.parent / "secret.txt")
        self.assertFalse(json.loads(self.request("/api/model-status")[2])["local"])

    def test_security_headers_restrict_camera_and_network_hosts(self):
        _, headers, _ = self.request()
        self.assertEqual(headers["Permissions-Policy"], "camera=(self), microphone=(), geolocation=()")
        self.assertEqual(headers["X-Content-Type-Options"], "nosniff")
        self.assertEqual(headers["Referrer-Policy"], "no-referrer")
        self.assertEqual(headers["Cache-Control"], "no-store")
        directives = headers["Content-Security-Policy"].split("; ")
        self.assertIn("connect-src 'self' https://cdn.jsdelivr.net https://storage.googleapis.com", directives)
        self.assertIn("script-src 'self' https://cdn.jsdelivr.net 'wasm-unsafe-eval'", directives)
        self.assertIn("frame-ancestors 'none'", directives)
        self.assertIn("worker-src 'self' blob:", directives)

    def test_serving_does_not_depend_on_working_directory(self):
        previous = Path.cwd()
        try:
            os.chdir(self.root.parent)
            self.assertEqual(self.request()[0], 200)
            self.assertEqual(app.PUBLIC_DIR, APP_DIR / "public")
        finally:
            os.chdir(previous)


class AssetSetupTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.destination = self.root / "model.task"

    def response(self, content=b"model", expected_size=None):
        response = io.BytesIO(content)
        response.headers = {"Content-Length": str(len(content) if expected_size is None else expected_size)}
        response.geturl = lambda: "https://storage.googleapis.com/model.task"
        return response

    def test_downloader_and_server_agree_on_pinned_assets(self):
        self.assertEqual(tuple(path for _, path in setup_models.ASSETS), app.MODEL_FILES)
        self.assertEqual(setup_models.SDK_VERSION, app.SDK_VERSION)
        self.assertEqual(len(setup_models.ASSETS), 6)
        self.assertTrue(all(url.startswith("https://") for url, _ in setup_models.ASSETS))

    def test_successful_download_uses_verified_tls_and_atomic_destination(self):
        self.destination.write_bytes(b"old")
        with patch.object(setup_models, "urlopen", return_value=self.response()) as opening:
            setup_models.download_asset("https://storage.googleapis.com/model.task", self.destination, 12)
        self.assertEqual(self.destination.read_bytes(), b"model")
        options = opening.call_args.kwargs
        self.assertEqual(options["timeout"], 12)
        self.assertEqual(options["context"].verify_mode, ssl.CERT_REQUIRED)
        self.assertTrue(options["context"].check_hostname)
        self.assertEqual(list(self.root.glob(".download-*")), [])

    def test_empty_or_incomplete_download_preserves_existing_asset(self):
        for content, expected_size in ((b"", 0), (b"part", 20)):
            with self.subTest(content=content):
                self.destination.write_bytes(b"original")
                with patch.object(setup_models, "urlopen", return_value=self.response(content, expected_size)):
                    with self.assertRaises(ValueError):
                        setup_models.download_asset("https://storage.googleapis.com/model.task", self.destination)
                self.assertEqual(self.destination.read_bytes(), b"original")
                self.assertEqual(list(self.root.glob(".download-*")), [])

    def test_failed_download_does_not_publish_partial_file(self):
        class InterruptedResponse(io.BytesIO):
            headers = {}

            def geturl(self):
                return "https://storage.googleapis.com/model.task"

            def read(self, _size):
                raise OSError("connection interrupted")

        with patch.object(setup_models, "urlopen", return_value=InterruptedResponse(b"")):
            with self.assertRaises(OSError):
                setup_models.download_asset("https://storage.googleapis.com/model.task", self.destination)
        self.assertFalse(self.destination.exists())
        self.assertEqual(list(self.root.glob(".download-*")), [])

    def test_manifest_records_hashes_without_claiming_publisher_verification(self):
        self.destination.write_bytes(b"model")
        digest = setup_models.file_digest(self.destination)
        record = {"path": "model.task", "sha256": digest, "bytes": 5}
        manifest_path = self.root / "manifest.json"
        setup_models.write_manifest(manifest_path, [record])
        manifest = json.loads(manifest_path.read_text())
        self.assertEqual(manifest["assets"], [record])
        self.assertIn("not compared", manifest["integrityNote"])
        self.assertEqual(len(digest), 64)
        self.assertEqual(list(self.root.glob(".manifest-*")), [])


if __name__ == "__main__":
    unittest.main()
