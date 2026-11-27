"""Starter places for a fresh database, and optional demo accounts."""

from datetime import timedelta

from .db import connect
from .library import EXERCISE_BY_KEY
from .security import hash_password
from .timeutil import utc_stamp

PLACES = [
    ("Campus Gym", "gym"),
    ("Sports Complex Gym", "gym"),
    ("Building A", "building"),
    ("Building B", "building"),
    ("Science Building", "building"),
    ("Library", "building"),
]
# minutes on foot between places (by name)
TRAVEL = [
    ("Campus Gym", "Building A", 15),
    ("Campus Gym", "Building B", 8),
    ("Campus Gym", "Science Building", 12),
    ("Campus Gym", "Library", 6),
    ("Sports Complex Gym", "Building A", 5),
    ("Sports Complex Gym", "Building B", 18),
    ("Sports Complex Gym", "Science Building", 20),
    ("Sports Complex Gym", "Library", 10),
    ("Campus Gym", "Sports Complex Gym", 10),
    ("Building A", "Building B", 7),
    ("Building A", "Science Building", 9),
    ("Building A", "Library", 6),
    ("Building B", "Science Building", 4),
    ("Building B", "Library", 5),
    ("Science Building", "Library", 6),
]


def seed_places(db):
    """Add the starter places once. Does nothing if any place exists."""
    if db.execute("SELECT 1 FROM places LIMIT 1").fetchone():
        return
    ids = {}
    for name, kind in PLACES:
        cur = db.execute("INSERT INTO places (name, name_key, kind, created_at) VALUES (?, ?, ?, ?)", (name, name.lower(), kind, utc_stamp()))
        ids[name] = cur.lastrowid
    for a, b, m in TRAVEL:
        x, y = sorted((ids[a], ids[b]))
        db.execute("INSERT INTO travel_times (a_id, b_id, minutes) VALUES (?, ?, ?)", (x, y, m))


def seed_demo(db, today):
    """Three demo students sharing a football-prep group. Password for all: demo-pass-1"""
    if db.execute("SELECT 1 FROM users WHERE username = 'mali'").fetchone():
        return
    place = {r["name"]: r["id"] for r in db.execute("SELECT id, name FROM places")}
    now = utc_stamp()
    people = [("mali", "Mali", "intermediate"), ("ken", "Ken", "beginner"), ("soe", "Soe", "advanced")]
    uid = {}
    for username, display, level in people:
        digest, salt = hash_password("demo-pass-1")
        cur = db.execute(
            "INSERT INTO users (username, display_name, password_hash, salt, level, default_gym_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (username, display, digest, salt, level, place["Campus Gym"], now),
        )
        uid[username] = cur.lastrowid

    def cls(user, weekday, start, end, title, where):
        db.execute(
            "INSERT INTO timetable (user_id, weekday, start_min, end_min, title, place_id) VALUES (?, ?, ?, ?, ?, ?)",
            (user, weekday, start, end, title, place[where]),
        )

    # Mali: Mon class 09:00-11:00 in Building A, next class 13:00 in Building B (2 h gap)
    for wd in (0, 2):
        cls(uid["mali"], wd, 9 * 60, 11 * 60, "Data Structures", "Building A")
        cls(uid["mali"], wd, 13 * 60, 15 * 60, "Statistics", "Building B")
    cls(uid["mali"], 1, 10 * 60, 12 * 60, "Networks", "Science Building")
    for wd in (0, 3):
        cls(uid["ken"], wd, 8 * 60, 10 * 60, "Calculus", "Building B")
        cls(uid["ken"], wd, 14 * 60, 16 * 60, "Physics", "Science Building")

    def workout(user, days_ago, minutes, entries):
        day = today - timedelta(days=days_ago)
        cur = db.execute(
            "INSERT INTO workouts (user_id, performed_on, start_min, duration_min, note, created_at) VALUES (?, ?, ?, ?, '', ?)",
            (user, day.isoformat(), 17 * 60, minutes, now),
        )
        for pos, (key, sets, reps, kg, dur) in enumerate(entries):
            db.execute(
                "INSERT INTO workout_entries (workout_id, position, exercise_key, sets, reps, weight_kg, duration_min) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (cur.lastrowid, pos, key, sets, reps, kg, dur),
            )

    def pick(*names):
        return [k for k in names if k in EXERCISE_BY_KEY]

    chest = pick("bench_press", "push_up")
    legs = pick("back_squat", "lunges")
    for days_ago, ex in ((1, chest), (3, chest), (5, legs)):
        workout(uid["mali"], days_ago, 55, [(k, 3, 10, 40 if k != "push_up" else None, None) for k in ex])

    # group
    cur = db.execute(
        "INSERT INTO groups (name, description, goal_key, sport, target_date, weekly_target, invite_code, owner_id, created_at) "
        "VALUES (?, ?, 'sport_prep', 'football', ?, 3, 'FOOTBALL', ?, ?)",
        ("Inter-faculty football prep", "Getting match-fit for the faculty cup.", (today + timedelta(days=42)).isoformat(), uid["mali"], now),
    )
    gid = cur.lastrowid
    for u, role in (("mali", "owner"), ("ken", "member"), ("soe", "member")):
        db.execute("INSERT INTO group_members (group_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)", (gid, uid[u], role, now))
    for u, ago, kind, mins in (("mali", 1, "endurance", 40), ("soe", 1, "lower_strength", 50), ("ken", 2, "speed", 30), ("mali", 4, "lower_strength", 45)):
        db.execute(
            "INSERT INTO group_checkins (group_id, user_id, session_type, duration_min, note, performed_on, created_at) VALUES (?, ?, ?, ?, '', ?, ?)",
            (gid, uid[u], kind, mins, (today - timedelta(days=ago)).isoformat(), now),
        )
    db.execute(
        "INSERT INTO group_posts (group_id, user_id, kind, title, body, url, plan_json, created_at) VALUES (?, ?, 'resource', ?, ?, ?, NULL, ?)",
        (gid, uid["soe"], "Warm-up routine before sprints", "Ten minutes, works well before speed day.", "https://example.com/sprint-warmup", now),
    )

    # an open buddy session from Soe the day after tomorrow, 17:00 at the Campus Gym
    db.execute(
        "INSERT INTO buddy_requests (user_id, focus, session_on, start_min, duration_min, place_id, level, slots, need_spotter, note, created_at) "
        "VALUES (?, 'legs', ?, ?, 60, ?, 'any', 2, 1, 'Heavy squats, would like a spotter.', ?)",
        (uid["soe"], (today + timedelta(days=2)).isoformat(), 17 * 60, place["Campus Gym"], now),
    )


def run(config, demo=False):
    db = connect(config.db_path)
    try:
        seed_places(db)
        if demo:
            seed_demo(db, config.now().date())
        db.commit()
    finally:
        db.close()
