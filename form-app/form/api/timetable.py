"""A student's weekly class timetable. Only the owner can see or change it."""

from ..errors import ApiError, not_found
from ..router import route
from ..validation import Validator
from .common import get_place


def _row(r):
    return {"id": r["id"], "weekday": r["weekday"], "start": r["start_min"], "end": r["end_min"], "title": r["title"], "place_id": r["place_id"]}


@route("GET", "/api/timetable")
def list_timetable(ctx):
    rows = ctx.db.execute(
        "SELECT * FROM timetable WHERE user_id = ? ORDER BY weekday, start_min", (ctx.user["id"],)
    ).fetchall()
    return {"classes": [_row(r) for r in rows]}


@route("POST", "/api/timetable")
def add_class(ctx):
    v = Validator(ctx.json())
    v.int("weekday", min=0, max=6)
    v.time("start")
    v.time("end")
    v.str("title", 1, 60)
    v.int("place_id", min=1, required=False)
    d = v.done()
    if d["end"] <= d["start"]:
        raise ApiError(422, "validation", "The class must end after it starts", {"end": "Must be after the start time"})
    if d["place_id"] is not None:
        get_place(ctx.db, d["place_id"])
    count = ctx.db.execute("SELECT COUNT(*) FROM timetable WHERE user_id = ?", (ctx.user["id"],)).fetchone()[0]
    if count >= 100:
        raise ApiError(422, "limit", "You can store up to 100 classes")
    cur = ctx.db.execute(
        "INSERT INTO timetable (user_id, weekday, start_min, end_min, title, place_id) VALUES (?, ?, ?, ?, ?, ?)",
        (ctx.user["id"], d["weekday"], d["start"], d["end"], d["title"], d["place_id"]),
    )
    return 201, _row(ctx.db.execute("SELECT * FROM timetable WHERE id = ?", (cur.lastrowid,)).fetchone())


@route("DELETE", "/api/timetable/<int:id>")
def delete_class(ctx):
    cur = ctx.db.execute("DELETE FROM timetable WHERE id = ? AND user_id = ?", (ctx.params["id"], ctx.user["id"]))
    if cur.rowcount == 0:
        raise not_found("Class not found")
    return {"ok": True}
