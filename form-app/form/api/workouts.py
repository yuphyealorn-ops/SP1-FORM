"""Workout log."""

import json

from ..errors import ApiError, not_found
from ..library import EXERCISE_BY_KEY, MUSCLE_KEYS
from ..progress import entry_points
from ..router import route
from ..timeutil import utc_stamp
from ..validation import Validator


def entry_dict(e):
    out = {
        "exercise_key": e["exercise_key"],
        "sets": e["sets"],
        "reps": e["reps"],
        "weight_kg": e["weight_kg"],
        "duration_min": e["duration_min"],
    }
    if e["exercise_key"] == "custom":
        out["name"] = e["custom_name"]
        out["main"] = json.loads(e["custom_main"] or "[]")
        out["helper"] = json.loads(e["custom_helper"] or "[]")
    else:
        ex = EXERCISE_BY_KEY.get(e["exercise_key"])
        out["name"] = ex["name"] if ex else e["exercise_key"]
    return out


def workout_dict(w, entries):
    total = {}
    for e in entries:
        for m, p in entry_points(e).items():
            total[m] = round(total.get(m, 0) + p, 1)
    return {
        "id": w["id"],
        "performed_on": w["performed_on"],
        "start": w["start_min"],
        "duration_min": w["duration_min"],
        "note": w["note"],
        "entries": [entry_dict(e) for e in entries],
        "points": total,
    }


def load_workouts(db, user_id, start=None, end=None, limit=200):
    sql, args = "SELECT * FROM workouts WHERE user_id = ?", [user_id]
    if start:
        sql += " AND performed_on >= ?"
        args.append(start.isoformat())
    if end:
        sql += " AND performed_on <= ?"
        args.append(end.isoformat())
    sql += " ORDER BY performed_on DESC, id DESC LIMIT ?"
    args.append(limit)
    rows = db.execute(sql, args).fetchall()
    if not rows:
        return []
    ids = [r["id"] for r in rows]
    marks = ",".join("?" * len(ids))
    by = {}
    for e in db.execute(f"SELECT * FROM workout_entries WHERE workout_id IN ({marks}) ORDER BY position", ids):
        by.setdefault(e["workout_id"], []).append(e)
    return [workout_dict(w, by.get(w["id"], [])) for w in rows]


def _clean_entries(raw):
    if not isinstance(raw, list) or not raw:
        raise ApiError(422, "validation", "Add at least one exercise", {"entries": "Add at least one exercise"})
    if len(raw) > 30:
        raise ApiError(422, "validation", "Too many exercises", {"entries": "At most 30 exercises per workout"})
    out, errors = [], {}
    for i, item in enumerate(raw):
        v = Validator(item if isinstance(item, dict) else {})
        key = v.choice("exercise_key", ["custom", *EXERCISE_BY_KEY])
        ex = EXERCISE_BY_KEY.get(key)
        timed = (ex["kind"] == "timed") if ex else (isinstance(item, dict) and item.get("reps") in (None, "") and item.get("duration_min") not in (None, ""))
        d = {"exercise_key": key, "custom_name": None, "custom_main": None, "custom_helper": None}
        if key == "custom":
            d["custom_name"] = v.str("name", 1, 60)
            d["custom_main"] = json.dumps(v.str_list("main", MUSCLE_KEYS, 11))
            d["custom_helper"] = json.dumps(v.str_list("helper", MUSCLE_KEYS, 11))
        if timed:
            d["duration_min"] = v.int("duration_min", min=1, max=240)
            d["sets"], d["reps"], d["weight_kg"] = 1, None, None
        else:
            d["sets"] = v.int("sets", min=1, max=20)
            d["reps"] = v.int("reps", min=1, max=200)
            d["weight_kg"] = v.num("weight_kg", min=0, max=500, required=False)
            d["duration_min"] = None
        for k, msg in v.errors.items():
            errors[f"entries.{i}.{k}"] = msg
        out.append(d)
    if errors:
        raise ApiError(422, "validation", "Please fix the highlighted fields", errors)
    return out


def save_workout(db, user_id, d, entries):
    cur = db.execute(
        "INSERT INTO workouts (user_id, performed_on, start_min, duration_min, note, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        (user_id, d["performed_on"].isoformat(), d["start"], d["duration_min"], d["note"], utc_stamp()),
    )
    wid = cur.lastrowid
    for pos, e in enumerate(entries):
        db.execute(
            "INSERT INTO workout_entries (workout_id, position, exercise_key, custom_name, custom_main, custom_helper, sets, reps, weight_kg, duration_min) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (wid, pos, e["exercise_key"], e["custom_name"], e["custom_main"], e["custom_helper"], e["sets"], e["reps"], e["weight_kg"], e["duration_min"]),
        )
    return wid


@route("GET", "/api/workouts")
def list_workouts(ctx):
    v = Validator({"from": ctx.q("from"), "to": ctx.q("to")})
    start = v.date("from", required=False)
    end = v.date("to", required=False)
    v.done()
    return {"workouts": load_workouts(ctx.db, ctx.user["id"], start, end)}


@route("POST", "/api/workouts")
def add_workout(ctx):
    body = ctx.json()
    v = Validator(body)
    v.date("performed_on")
    v.time("start", required=False)
    v.int("duration_min", min=5, max=300)
    v.text("note", 300)
    d = v.done()
    if d["performed_on"] > ctx.today():
        raise ApiError(422, "validation", "Log a workout after you have done it", {"performed_on": "Date is in the future"})
    entries = _clean_entries(body.get("entries"))
    wid = save_workout(ctx.db, ctx.user["id"], d, entries)
    row = ctx.db.execute("SELECT * FROM workouts WHERE id = ?", (wid,)).fetchone()
    ents = ctx.db.execute("SELECT * FROM workout_entries WHERE workout_id = ? ORDER BY position", (wid,)).fetchall()
    return 201, workout_dict(row, ents)


@route("DELETE", "/api/workouts/<int:id>")
def delete_workout(ctx):
    cur = ctx.db.execute("DELETE FROM workouts WHERE id = ? AND user_id = ?", (ctx.params["id"], ctx.user["id"]))
    if cur.rowcount == 0:
        raise not_found("Workout not found")
    return {"ok": True}
