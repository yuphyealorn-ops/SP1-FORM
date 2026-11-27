"""Runtime configuration."""

from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


@dataclass
class Config:
    db_path: Path = ROOT / "data" / "form.db"
    public_dir: Path = ROOT / "public"
    host: str = "127.0.0.1"
    port: int = 8000
    tz: str = "Asia/Bangkok"
    secure_cookies: bool = False
    session_days: int = 30
    now_fn: object = None  # tests inject a fixed clock

    def now(self) -> datetime:
        """Current campus-local time as a naive datetime.

        All class times, buddy sessions and workout dates are campus-local and
        have no timezone attached, so everyone sees the same clock times.
        """
        if self.now_fn is not None:
            return self.now_fn()
        try:
            from zoneinfo import ZoneInfo

            return datetime.now(ZoneInfo(self.tz)).replace(tzinfo=None)
        except Exception:  # tz database missing: fall back to the machine clock
            return datetime.now()
