"""Shared places (gyms and buildings) and the minutes it takes to walk between them."""

import sqlite3

from ..errors import ApiError, conflict
from ..router import route
from ..timeutil import utc_stamp
from ..validation import Validator
from .common import place_dict


@route("GET", "/api/places")
def list_places(ctx):
    places = ctx.db.execute("SELECT * FROM places ORDER BY kind, name COLLATE NOCASE").fetchall()
    travel = ctx.db.execute("SELECT a_id, b_id, minutes FROM travel_times").fetchall()
    return {
        "places": [place_dict(p) for p in places],
        "travel": [{"a": t["a_id"], "b": t["b_id"], "minutes": t["minutes"]} for t in travel],
    }


@route("POST", "/api/places")
def add_place(ctx):
    v = Validator(ctx.json())
    v.str("name", 2, 60)
    v.choice("kind", ["gym", "building"])
    data = v.done()
    try:
        cur = ctx.db.execute(
            "INSERT INTO places (name, name_key, kind, created_by, created_at) VALUES (?, ?, ?, ?, ?)",
            (data["name"], data["name"].lower(), data["kind"], ctx.user["id"], utc_stamp()),
        )
    except sqlite3.IntegrityError:
        raise conflict("A place with that name already exists")
    row = ctx.db.execute("SELECT * FROM places WHERE id = ?", (cur.lastrowid,)).fetchone()
    return 201, place_dict(row)


@route("PUT", "/api/travel")
def set_travel(ctx):
    v = Validator(ctx.json())
    v.int("a_id", min=1)
    v.int("b_id", min=1)
    v.int("minutes", min=0, max=120)
    d = v.done()
    if d["a_id"] == d["b_id"]:
        raise ApiError(422, "validation", "Pick two different places", {"b_id": "Pick a different place"})
    for key in ("a_id", "b_id"):
        if ctx.db.execute("SELECT 1 FROM places WHERE id = ?", (d[key],)).fetchone() is None:
            raise ApiError(422, "validation", "Unknown place", {key: "Unknown place"})
    a, b = sorted((d["a_id"], d["b_id"]))
    ctx.db.execute(
        "INSERT INTO travel_times (a_id, b_id, minutes) VALUES (?, ?, ?) "
        "ON CONFLICT(a_id, b_id) DO UPDATE SET minutes = excluded.minutes",
        (a, b, d["minutes"]),
    )
    return {"a": a, "b": b, "minutes": d["minutes"]}
