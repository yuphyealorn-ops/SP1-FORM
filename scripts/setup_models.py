#!/usr/bin/env python3
"""Download the pinned pose runtime and model for local browser inference."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import ssl
import sys
import tempfile
from datetime import datetime, timezone
from http.client import HTTPException
from pathlib import Path
from urllib.error import URLError
from urllib.request import Request, urlopen

APP_DIR = Path(__file__).resolve().parents[1]
PUBLIC_DIR = APP_DIR / "public"
SDK_VERSION = "1.1.1"
CDN_BASE = f"https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@{SDK_VERSION}"
ASSETS = (
    (f"{CDN_BASE}/vision_bundle.mjs", "vendor/mediapipe/vision_bundle.mjs"),
    (f"{CDN_BASE}/wasm/vision_wasm_internal.js", "vendor/mediapipe/wasm/vision_wasm_internal.js"),
    (f"{CDN_BASE}/wasm/vision_wasm_internal.wasm", "vendor/mediapipe/wasm/vision_wasm_internal.wasm"),
    (f"{CDN_BASE}/wasm/vision_wasm_nosimd_internal.js", "vendor/mediapipe/wasm/vision_wasm_nosimd_internal.js"),
    (f"{CDN_BASE}/wasm/vision_wasm_nosimd_internal.wasm", "vendor/mediapipe/wasm/vision_wasm_nosimd_internal.wasm"),
    ("https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
     "models/pose_landmarker_lite.task"),
)


def file_digest(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def download_asset(url: str, destination: Path, timeout: float = 60) -> None:
    """Verify TLS and atomically replace the destination after a complete download."""
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary: Path | None = None
    try:
        request = Request(url, headers={"User-Agent": "GymApp-ModelSetup/1.0"})
        with urlopen(request, timeout=timeout, context=ssl.create_default_context()) as response:
            if not response.geturl().startswith("https://"):
                raise ValueError("An asset redirected away from HTTPS")
            expected_size = response.headers.get("Content-Length")
            count = 0
            with tempfile.NamedTemporaryFile(dir=destination.parent, prefix=".download-", delete=False) as output:
                temporary = Path(output.name)
                while True:
                    block = response.read(1024 * 1024)
                    if not block:
                        break
                    output.write(block)
                    count += len(block)
                output.flush()
                os.fsync(output.fileno())
            if count == 0:
                raise ValueError("The server returned an empty asset")
            if expected_size is not None and count != int(expected_size):
                raise ValueError("The download was incomplete (Content-Length mismatch)")
        os.replace(temporary, destination)
        temporary = None
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def write_manifest(path: Path, records: list[dict[str, object]]) -> None:
    document = {
        "sdkVersion": SDK_VERSION,
        "recordedAt": datetime.now(timezone.utc).isoformat(),
        "integrityNote": "SHA-256 values describe downloaded bytes; they are not compared with independent publisher checksums.",
        "assets": records,
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent, prefix=".manifest-", delete=False) as output:
            temporary = Path(output.name)
            json.dump(document, output, indent=2)
            output.write("\n")
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, path)
        temporary = None
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--force", action="store_true", help="Replace even existing non-empty assets")
    parser.add_argument("--timeout", type=float, default=60, help="Network timeout per operation, in seconds")
    args = parser.parse_args()
    if not 0 < args.timeout < float("inf"):
        parser.error("--timeout must be a finite positive number")
    records = []
    try:
        for url, relative_path in ASSETS:
            destination = PUBLIC_DIR / relative_path
            if args.force or not destination.is_file() or destination.stat().st_size == 0:
                print(f"Downloading {relative_path} …", flush=True)
                download_asset(url, destination, args.timeout)
            else:
                print(f"Using existing {relative_path}")
            records.append({"path": relative_path, "url": url, "bytes": destination.stat().st_size,
                            "sha256": file_digest(destination)})
        write_manifest(PUBLIC_DIR / "models/assets-manifest.json", records)
    except (OSError, URLError, HTTPException, ValueError) as error:
        print(f"Model setup failed: {error}\nExisting files were preserved; rerun when your connection is available.", file=sys.stderr)
        return 1
    print("Local model assets are ready. Reload the app.\nHashes record downloaded bytes; publisher checksums were not independently verified.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
