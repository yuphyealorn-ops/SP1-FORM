"""Small helpers for campus-local dates and clock times."""

import re
from datetime import date, datetime, timedelta, timezone

_HHMM = re.compile(r"^([01]\d|2[0-3]):([0-5]\d)$")


def parse_hhmm(text):
    """'09:30' -> 570. Returns None if the text is not a valid time."""
    m = _HHMM.match(text or "")
    if not m:
        return None
    return int(m.group(1)) * 60 + int(m.group(2))


def fmt_hhmm(minutes):
    minutes = int(minutes)
    if minutes >= 1440:
        return "24:00"
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


def parse_date(text):
    """'2026-11-23' -> date, or None."""
    try:
        if not isinstance(text, str) or len(text) != 10:
            return None
        return date.fromisoformat(text)
    except ValueError:
        return None


def weekday(d: date) -> int:
    """Monday = 0 ... Sunday = 6."""
    return d.weekday()


def week_start(d: date) -> date:
    return d - timedelta(days=d.weekday())


def iso(d) -> str:
    return d.isoformat()


def utc_stamp(now: datetime = None) -> str:
    return (now or datetime.now(timezone.utc).replace(tzinfo=None)).replace(microsecond=0).isoformat() + "Z"
