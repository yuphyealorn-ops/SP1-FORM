"""Training progress: muscle points per period and per week."""

from datetime import timedelta

from ..errors import ApiError
from ..library import MUSCLE_KEYS
from ..progress import insight_text, low_muscles, points_by_muscle
from ..router import route
from ..timeutil import week_start
from .common import entries_between


@route("GET", "/api/progress/muscles")
def muscles(ctx):
    try:
        days = int(ctx.q("days", "7"))
    except ValueError:
        days = 0
    if days not in (7, 14, 30, 90):
        raise ApiError(422, "validation", "days must be 7, 14, 30 or 90", {"days": "Choose 7, 14, 30 or 90"})
    end = ctx.today()
    entries = entries_between(ctx.db, ctx.user["id"], end - timedelta(days=days - 1), end)
    points = points_by_muscle(entries)
    sessions = ctx.db.execute(
        "SELECT COUNT(*) FROM workouts WHERE user_id = ? AND performed_on BETWEEN ? AND ?",
        (ctx.user["id"], (end - timedelta(days=days - 1)).isoformat(), end.isoformat()),
    ).fetchone()[0]
    return {
        "days": days,
        "points": points,
        "low": low_muscles(points, days),
        "insight": insight_text(points, days),
        "sessions": sessions,
    }


@route("GET", "/api/progress/weekly")
def weekly(ctx):
    """Points per muscle and session count for each of the last N weeks (Monday start)."""
    try:
        weeks = max(1, min(26, int(ctx.q("weeks", "12"))))
    except ValueError:
        raise ApiError(422, "validation", "weeks must be a number", {"weeks": "Must be a number"})
    this_week = week_start(ctx.today())
    first = this_week - timedelta(weeks=weeks - 1)
    out = []
    rows = ctx.db.execute(
        "SELECT id, performed_on, duration_min FROM workouts WHERE user_id = ? AND performed_on >= ?",
        (ctx.user["id"], first.isoformat()),
    ).fetchall()
    entries = ctx.db.execute(
        "SELECT e.*, w.performed_on FROM workout_entries e JOIN workouts w ON w.id = e.workout_id "
        "WHERE w.user_id = ? AND w.performed_on >= ?",
        (ctx.user["id"], first.isoformat()),
    ).fetchall()
    for i in range(weeks):
        ws = first + timedelta(weeks=i)
        we = ws + timedelta(days=6)
        lo, hi = ws.isoformat(), we.isoformat()
        ws_rows = [r for r in rows if lo <= r["performed_on"] <= hi]
        pts = points_by_muscle([e for e in entries if lo <= e["performed_on"] <= hi])
        out.append(
            {
                "week_start": lo,
                "sessions": len(ws_rows),
                "minutes": sum(r["duration_min"] for r in ws_rows),
                "points": pts,
                "total_points": round(sum(pts[m] for m in MUSCLE_KEYS), 1),
            }
        )
    return {"weeks": out}
