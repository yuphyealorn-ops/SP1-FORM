"""Gym Buddy: find a training partner whose session fits your timetable, gym and muscle balance."""

from datetime import datetime, timedelta

from ..errors import ApiError, conflict, forbidden, not_found
from ..library import FOCUSES, LEVELS
from ..matching import fit_to_timetable, score_request
from ..progress import low_muscles
from ..router import route
from ..timeutil import fmt_hhmm, parse_date, utc_stamp, weekday
from ..validation import Validator
from .common import classes_for, get_place, muscle_points, travel_lookup

MAX_AHEAD_DAYS = 21


def _starts_at(day, start_min):
    return datetime(day.year, day.month, day.day) + timedelta(minutes=start_min)


def _request_dict(r, taken, joined, me):
    return {
        "id": r["id"],
        "host_id": r["user_id"],
        "host_name": r["host_name"],
        "host_level": r["host_level"],
        "is_mine": r["user_id"] == me,
        "joined": joined,
        "focus": r["focus"],
        "focus_label": FOCUSES[r["focus"]]["label"],
        "session_on": r["session_on"],
        "start": r["start_min"],
        "duration": r["duration_min"],
        "place_id": r["place_id"],
        "place_name": r["place_name"],
        "level": r["level"],
        "slots": r["slots"],
        "taken": taken,
        "need_spotter": bool(r["need_spotter"]),
        "note": r["note"],
        "cancelled": bool(r["cancelled"]),
    }


_SELECT = (
    "SELECT r.*, u.display_name AS host_name, u.level AS host_level, p.name AS place_name, "
    "(SELECT COUNT(*) FROM buddy_participants bp WHERE bp.request_id = r.id) AS taken "
    "FROM buddy_requests r JOIN users u ON u.id = r.user_id JOIN places p ON p.id = r.place_id "
)


def _viewer(ctx, day):
    points = muscle_points(ctx.db, ctx.user["id"], ctx.today(), 7)
    return {
        "level": ctx.user["level"],
        "default_gym_id": ctx.user["default_gym_id"],
        "classes": classes_for(ctx.db, ctx.user["id"], weekday(day)),
        "low_muscles": low_muscles(points, 7),
    }


def _score(ctx, r, lookup, cache):
    day = parse_date(r["session_on"])
    if day not in cache:
        cache[day] = _viewer(ctx, day)
    return score_request(
        cache[day], {"focus": r["focus"], "start": r["start_min"], "duration": r["duration_min"], "place_id": r["place_id"], "level": r["level"]}, lookup
    )


@route("GET", "/api/buddies")
def open_sessions(ctx):
    """Open sessions from other students, best match first."""
    now = ctx.now()
    rows = ctx.db.execute(
        _SELECT + "WHERE r.cancelled = 0 AND r.user_id != ? AND r.session_on >= ? AND r.session_on <= ?",
        (ctx.user["id"], now.date().isoformat(), (now.date() + timedelta(days=MAX_AHEAD_DAYS)).isoformat()),
    ).fetchall()
    joined = {r["request_id"] for r in ctx.db.execute("SELECT request_id FROM buddy_participants WHERE user_id = ?", (ctx.user["id"],))}
    lookup, cache, out = travel_lookup(ctx.db), {}, []
    focus = ctx.q("focus")
    for r in rows:
        if _starts_at(parse_date(r["session_on"]), r["start_min"]) <= now:
            continue
        if focus and r["focus"] != focus:
            continue
        is_joined = r["id"] in joined
        if r["taken"] >= r["slots"] and not is_joined:
            continue
        d = _request_dict(r, r["taken"], is_joined, ctx.user["id"])
        d["match"] = _score(ctx, r, lookup, cache)
        out.append(d)
    out.sort(key=lambda d: (-d["match"]["score"], d["session_on"], d["start"], d["id"]))
    return {"sessions": out}


@route("GET", "/api/buddies/mine")
def my_sessions(ctx):
    now = ctx.now()
    rows = ctx.db.execute(
        _SELECT + "WHERE r.session_on >= ? AND (r.user_id = ? OR r.id IN (SELECT request_id FROM buddy_participants WHERE user_id = ?)) "
        "ORDER BY r.session_on, r.start_min",
        ((now.date() - timedelta(days=1)).isoformat(), ctx.user["id"], ctx.user["id"]),
    ).fetchall()
    out = []
    for r in rows:
        people = ctx.db.execute(
            "SELECT u.id, u.display_name FROM buddy_participants bp JOIN users u ON u.id = bp.user_id WHERE bp.request_id = ? ORDER BY bp.joined_at",
            (r["id"],),
        ).fetchall()
        d = _request_dict(r, r["taken"], any(p["id"] == ctx.user["id"] for p in people), ctx.user["id"])
        d["partners"] = [{"id": p["id"], "display_name": p["display_name"]} for p in people]
        d["past"] = _starts_at(parse_date(r["session_on"]), r["start_min"]) <= now
        out.append(d)
    return {"sessions": out}


@route("POST", "/api/buddies")
def create_session(ctx):
    v = Validator(ctx.json())
    v.choice("focus", list(FOCUSES))
    v.date("session_on")
    v.time("start")
    v.int("duration_min", min=20, max=240)
    v.int("place_id", min=1)
    v.choice("level", ["any", *LEVELS], required=False, default="any")
    v.int("slots", min=1, max=5, required=False, default=1)
    v.bool("need_spotter")
    v.text("note", 200)
    d = v.done()
    get_place(ctx.db, d["place_id"], "gym")
    now = ctx.now()
    if d["session_on"] > now.date() + timedelta(days=MAX_AHEAD_DAYS):
        raise ApiError(422, "validation", f"Plan at most {MAX_AHEAD_DAYS} days ahead", {"session_on": "Too far ahead"})
    if _starts_at(d["session_on"], d["start"]) <= now:
        raise ApiError(422, "validation", "Pick a time in the future", {"start": "That time has already passed"})
    active = ctx.db.execute(
        "SELECT COUNT(*) FROM buddy_requests WHERE user_id = ? AND cancelled = 0 AND session_on >= ?",
        (ctx.user["id"], now.date().isoformat()),
    ).fetchone()[0]
    if active >= 10:
        raise ApiError(422, "limit", "You can have up to 10 open sessions")
    cur = ctx.db.execute(
        "INSERT INTO buddy_requests (user_id, focus, session_on, start_min, duration_min, place_id, level, slots, need_spotter, note, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (ctx.user["id"], d["focus"], d["session_on"].isoformat(), d["start"], d["duration_min"], d["place_id"], d["level"],
         d["slots"], int(d["need_spotter"]), d["note"], utc_stamp()),
    )
    fit = fit_to_timetable(classes_for(ctx.db, ctx.user["id"], weekday(d["session_on"])), d["start"], d["start"] + d["duration_min"], d["place_id"], travel_lookup(ctx.db))
    row = ctx.db.execute(_SELECT + "WHERE r.id = ?", (cur.lastrowid,)).fetchone()
    out = _request_dict(row, 0, False, ctx.user["id"])
    out["fit"] = fit
    return 201, out


def _open_row(ctx, rid):
    r = ctx.db.execute(_SELECT + "WHERE r.id = ?", (rid,)).fetchone()
    if r is None:
        raise not_found("Session not found")
    return r


@route("POST", "/api/buddies/<int:id>/join")
def join_session(ctx):
    r = _open_row(ctx, ctx.params["id"])
    if r["user_id"] == ctx.user["id"]:
        raise conflict("This is your own session")
    if r["cancelled"]:
        raise conflict("This session was cancelled")
    day = parse_date(r["session_on"])
    if _starts_at(day, r["start_min"]) <= ctx.now():
        raise conflict("This session has already started")
    if ctx.db.execute("SELECT 1 FROM buddy_participants WHERE request_id = ? AND user_id = ?", (r["id"], ctx.user["id"])).fetchone():
        raise conflict("You already joined this session")
    if r["taken"] >= r["slots"]:
        raise conflict("This session is full")
    fit = fit_to_timetable(classes_for(ctx.db, ctx.user["id"], weekday(day)), r["start_min"], r["start_min"] + r["duration_min"], r["place_id"], travel_lookup(ctx.db))
    if fit["conflict"]:
        raise conflict(fit["message"])
    ctx.db.execute("INSERT INTO buddy_participants (request_id, user_id, joined_at) VALUES (?, ?, ?)", (r["id"], ctx.user["id"], utc_stamp()))
    return 201, {"ok": True, "fit": fit, "when": f"{r['session_on']} {fmt_hhmm(r['start_min'])}"}


@route("POST", "/api/buddies/<int:id>/leave")
def leave_session(ctx):
    cur = ctx.db.execute("DELETE FROM buddy_participants WHERE request_id = ? AND user_id = ?", (ctx.params["id"], ctx.user["id"]))
    if cur.rowcount == 0:
        raise not_found("You have not joined this session")
    return {"ok": True}


@route("POST", "/api/buddies/<int:id>/cancel")
def cancel_session(ctx):
    r = _open_row(ctx, ctx.params["id"])
    if r["user_id"] != ctx.user["id"]:
        raise forbidden("Only the person who posted the session can cancel it")
    ctx.db.execute("UPDATE buddy_requests SET cancelled = 1 WHERE id = ?", (r["id"],))
    return {"ok": True}
