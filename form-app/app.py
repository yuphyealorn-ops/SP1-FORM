#!/usr/bin/env python3
"""Start the FORM web app:  python3 app.py --seed   then open http://127.0.0.1:8000"""

import argparse
from pathlib import Path

from form.config import Config
from form.seed import run as seed_run
from form.server import make_server


def main():
    p = argparse.ArgumentParser(description="FORM gym app")
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=8000)
    p.add_argument("--db", default=None, help="SQLite file (default: data/form.db)")
    p.add_argument("--seed", action="store_true", help="add demo accounts (password: demo-pass-1)")
    p.add_argument("--secure-cookies", action="store_true", help="set when served over HTTPS")
    p.add_argument("--verbose", action="store_true")
    a = p.parse_args()

    cfg = Config(host=a.host, port=a.port, secure_cookies=a.secure_cookies)
    if a.db:
        cfg.db_path = Path(a.db)
    cfg.db_path.parent.mkdir(parents=True, exist_ok=True)
    server, _ = make_server(cfg, a.verbose)
    seed_run(cfg, demo=a.seed)
    print(f"FORM running at http://{a.host}:{a.port}  (Ctrl+C to stop)")
    if a.seed:
        print("Demo accounts: mali, ken, soe  |  password: demo-pass-1")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
