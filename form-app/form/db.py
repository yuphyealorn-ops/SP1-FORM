"""SQLite schema and connections."""

import sqlite3
from pathlib import Path

SCHEMA_VERSION = 1

SCHEMA = """
CREATE TABLE places (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    name_key TEXT NOT NULL UNIQUE,
    kind TEXT NOT NULL CHECK (kind IN ('gym', 'building')),
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE travel_times (
    a_id INTEGER NOT NULL REFERENCES places(id) ON DELETE CASCADE,
    b_id INTEGER NOT NULL REFERENCES places(id) ON DELETE CASCADE,
    minutes INTEGER NOT NULL CHECK (minutes BETWEEN 0 AND 120),
    PRIMARY KEY (a_id, b_id),
    CHECK (a_id < b_id)
);

CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    password_hash BLOB NOT NULL,
    salt BLOB NOT NULL,
    level TEXT NOT NULL DEFAULT 'beginner'
        CHECK (level IN ('beginner', 'intermediate', 'advanced')),
    default_gym_id INTEGER REFERENCES places(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
);

CREATE TABLE timetable (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
    start_min INTEGER NOT NULL CHECK (start_min BETWEEN 0 AND 1439),
    end_min INTEGER NOT NULL CHECK (end_min BETWEEN 1 AND 1440),
    title TEXT NOT NULL,
    place_id INTEGER REFERENCES places(id) ON DELETE SET NULL,
    CHECK (end_min > start_min)
);
CREATE INDEX idx_timetable_user ON timetable(user_id, weekday);

CREATE TABLE workouts (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    performed_on TEXT NOT NULL,
    start_min INTEGER,
    duration_min INTEGER NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);
CREATE INDEX idx_workouts_user_date ON workouts(user_id, performed_on);

CREATE TABLE workout_entries (
    id INTEGER PRIMARY KEY,
    workout_id INTEGER NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    exercise_key TEXT NOT NULL,
    custom_name TEXT,
    custom_main TEXT,
    custom_helper TEXT,
    sets INTEGER NOT NULL,
    reps INTEGER,
    weight_kg REAL,
    duration_min INTEGER
);
CREATE INDEX idx_entries_workout ON workout_entries(workout_id);

CREATE TABLE groups (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    goal_key TEXT NOT NULL,
    sport TEXT,
    target_date TEXT,
    weekly_target INTEGER NOT NULL DEFAULT 3 CHECK (weekly_target BETWEEN 1 AND 14),
    invite_code TEXT NOT NULL UNIQUE,
    owner_id INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL
);

CREATE TABLE group_members (
    group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
    joined_at TEXT NOT NULL,
    PRIMARY KEY (group_id, user_id)
);
CREATE INDEX idx_group_members_user ON group_members(user_id);

CREATE TABLE group_checkins (
    id INTEGER PRIMARY KEY,
    group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workout_id INTEGER REFERENCES workouts(id) ON DELETE SET NULL,
    session_type TEXT NOT NULL,
    duration_min INTEGER NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    performed_on TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE INDEX idx_checkins_group ON group_checkins(group_id, performed_on);

CREATE TABLE group_posts (
    id INTEGER PRIMARY KEY,
    group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('plan', 'resource')),
    title TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    url TEXT,
    plan_json TEXT,
    created_at TEXT NOT NULL
);
CREATE INDEX idx_posts_group ON group_posts(group_id, created_at);

CREATE TABLE buddy_requests (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    focus TEXT NOT NULL,
    session_on TEXT NOT NULL,
    start_min INTEGER NOT NULL CHECK (start_min BETWEEN 0 AND 1439),
    duration_min INTEGER NOT NULL CHECK (duration_min BETWEEN 20 AND 240),
    place_id INTEGER NOT NULL REFERENCES places(id),
    level TEXT NOT NULL CHECK (level IN ('any', 'beginner', 'intermediate', 'advanced')),
    slots INTEGER NOT NULL CHECK (slots BETWEEN 1 AND 5),
    need_spotter INTEGER NOT NULL DEFAULT 0,
    note TEXT NOT NULL DEFAULT '',
    cancelled INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);
CREATE INDEX idx_buddy_date ON buddy_requests(session_on);

CREATE TABLE buddy_participants (
    request_id INTEGER NOT NULL REFERENCES buddy_requests(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at TEXT NOT NULL,
    PRIMARY KEY (request_id, user_id)
);
"""


def connect(path):
    conn = sqlite3.connect(str(path), timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db(path):
    """Create the database if it does not exist yet. Safe to call every start."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = connect(path)
    try:
        version = conn.execute("PRAGMA user_version").fetchone()[0]
        if version == 0:
            conn.executescript(SCHEMA)
            conn.execute(f"PRAGMA user_version = {SCHEMA_VERSION}")
            conn.commit()
        elif version > SCHEMA_VERSION:
            raise RuntimeError(
                f"{path} was made by a newer version of this app (schema {version})"
            )
        conn.execute("PRAGMA journal_mode = WAL")
    finally:
        conn.close()
