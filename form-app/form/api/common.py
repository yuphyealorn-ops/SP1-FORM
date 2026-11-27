"""Helpers shared by several API modules."""

from datetime import timedelta

from ..errors import ApiError, forbidden, not_found
from ..progress import points_by_muscle


def public_user(row):
    return {
        "id": row["id"],
        "username": row["username"],
        "display_name": row["display_name"],
        "level": row["level"],
        "default_gym_id": row["default_gym_id"],
    }


def travel_lookup(db):
    """Function (a_id, b_id) -> minutes or None, reading the shared travel table."""
    known = {(r["a_id"], r["b_id"]): r["minutes"] for r in db.execute("SELECT a_id, b_id, minutes FROM travel_times")}

    def lookup(a, b):
        if a == b:
            return 0
        return known.get((min(a, b), max(a, b)))

    return lookup


def classes_for(db, user_id, weekday):
    rows = db.execute(
        "SELECT start_min, end_min, title, place_id FROM timetable "
        "WHERE user_id = ? AND weekday = ? ORDER BY start_min",
        (user_id, weekday),
    ).fetchall()
    return [{"start": r["start_min"], "end": r["end_min"], "title": r["title"], "place_id": r["place_id"]} for r in rows]


def entries_between(db, user_id, start_date, end_date):
    return db.execute(
        "SELECT e.* FROM workout_entries e JOIN workouts w ON w.id = e.workout_id "
        "WHERE w.user_id = ? AND w.performed_on BETWEEN ? AND ?",
        (user_id, start_date.isoformat(), end_date.isoformat()),
    ).fetchall()


def muscle_points(db, user_id, end_date, days=7):
    start = end_date - timedelta(days=days - 1)
    return points_by_muscle(entries_between(db, user_id, start, end_date))


def get_place(db, place_id, kind=None):
    row = db.execute("SELECT * FROM places WHERE id = ?", (place_id,)).fetchone()
    if row is None or (kind and row["kind"] != kind):
        raise ApiError(422, "validation", "Unknown place", {"place_id": "Choose a place from the list"})
    return row


def place_dict(row):
    return {"id": row["id"], "name": row["name"], "kind": row["kind"]}


def require_member(db, group_id, user_id):
    """Return the group row if the user is in it. Hides the group from everyone else."""
    g = db.execute("SELECT * FROM groups WHERE id = ?", (group_id,)).fetchone()
    if g is None:
        raise not_found("Group not found")
    m = db.execute(
        "SELECT role FROM group_members WHERE group_id = ? AND user_id = ?", (group_id, user_id)
    ).fetchone()
    if m is None:
        raise not_found("Group not found")
    return g, m["role"]


def require_owner(role):
    if role != "owner":
        raise forbidden("Only the group owner can do this")
