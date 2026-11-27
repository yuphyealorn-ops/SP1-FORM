import json
import tempfile
import threading
import unittest
from datetime import datetime
from http.client import HTTPConnection
from pathlib import Path

from form.config import Config
from form.seed import run as seed_run
from form.server import make_server

NOW = datetime(2026, 11, 25, 12, 0)  # a Wednesday


class Client:
    def __init__(self, port):
        self.port, self.cookie = port, None

    def call(self, method, path, body=None, headers=None, raw=None):
        c = HTTPConnection("127.0.0.1", self.port, timeout=10)
        h = {"X-Requested-With": "form", "Content-Type": "application/json"}
        h.update(headers or {})
        if self.cookie:
            h["Cookie"] = self.cookie
        data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
        c.request(method, path, body=data, headers={k: v for k, v in h.items() if v is not None})
        r = c.getresponse()
        payload = r.read()
        sc = r.getheader("Set-Cookie")
        if sc:
            pair = sc.split(";")[0]
            self.cookie = None if pair.endswith("=") else pair
        c.close()
        try:
            return r.status, json.loads(payload)
        except ValueError:
            return r.status, payload.decode()

    def get(self, p): return self.call("GET", p)
    def post(self, p, b=None): return self.call("POST", p, b if b is not None else {})
    def put(self, p, b): return self.call("PUT", p, b)
    def patch(self, p, b): return self.call("PATCH", p, b)
    def delete(self, p, b=None): return self.call("DELETE", p, b if b is not None else {})


class ApiCase(unittest.TestCase):
    demo = False

    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cfg = Config(db_path=Path(cls.tmp.name) / "t.db", port=0, now_fn=lambda: NOW)
        cls.server, cls.app = make_server(cfg)
        seed_run(cfg, demo=cls.demo)
        cls.port = cls.server.server_address[1]
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.tmp.cleanup()

    def client(self):
        return Client(self.port)

    def signup(self, name, level="beginner"):
        c = self.client()
        s, d = c.post("/api/auth/register", {"username": name, "password": "correct-horse-1", "level": level})
        self.assertEqual(s, 201, d)
        return c
