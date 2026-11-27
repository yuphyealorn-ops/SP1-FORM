"""Accounts: register, sign in, profile."""

import sqlite3
from datetime import datetime, timedelta, timezone

from ..errors import ApiError, conflict
from ..router import route
from ..security import burn_login_time, hash_password, new_token, token_hash, verify_password
from ..timeutil import utc_stamp
from ..validation import Validator
from .common import get_place, public_user


def _start_session(ctx, user_id):
    token = new_token()
    expires = utc_stamp(datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=ctx.config.session_days))
    ctx.db.execute(
        "INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
        (token_hash(token), user_id, utc_stamp(), expires),
    )
    # tidy up expired sessions now and then
    ctx.db.execute("DELETE FROM sessions WHERE expires_at < ?", (utc_stamp(),))
    ctx.set_session_cookie(token, ctx.config.session_days)


@route("POST", "/api/auth/register", auth=False)
def register(ctx):
    if ctx.app.register_limiter.blocked(ctx.ip):
        raise ApiError(429, "rate_limited", "Too many sign-ups from this computer. Try again later.")
    v = Validator(ctx.json())
    username = v.str("username", 3, 24, pattern=r"^[a-z0-9_]+$", lower=True)
    v.str("display_name", 1, 40, required=False, default=username)
    v.secret("password")
    v.choice("level", ["beginner", "intermediate", "advanced"], required=False, default="beginner")
    data = v.done()
    ctx.app.register_limiter.hit(ctx.ip)

    digest, salt = hash_password(data["password"])
    try:
        cur = ctx.db.execute(
            "INSERT INTO users (username, display_name, password_hash, salt, level, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (data["username"], data["display_name"] or data["username"], digest, salt, data["level"], utc_stamp()),
        )
    except sqlite3.IntegrityError:
        raise conflict("That username is already taken")
    _start_session(ctx, cur.lastrowid)
    row = ctx.db.execute("SELECT * FROM users WHERE id = ?", (cur.lastrowid,)).fetchone()
    return 201, {"user": public_user(row)}


@route("POST", "/api/auth/login", auth=False)
def login(ctx):
    v = Validator(ctx.json())
    username = v.str("username", 1, 24, lower=True)
    password = v.str("password", 1, 128)
    v.done()
    keys = (f"ip:{ctx.ip}", f"user:{username}")
    if any(ctx.app.login_limiter.blocked(k) for k in keys):
        raise ApiError(429, "rate_limited", "Too many failed attempts. Wait about 10 minutes and try again.")
    row = ctx.db.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
    if row is None:
        burn_login_time(password)
        ok = False
    else:
        ok = verify_password(password, row["password_hash"], row["salt"])
    if not ok:
        for k in keys:
            ctx.app.login_limiter.hit(k)
        raise ApiError(401, "bad_credentials", "Wrong username or password")
    ctx.app.login_limiter.reset(f"user:{username}")
    _start_session(ctx, row["id"])
    return {"user": public_user(row)}


@route("POST", "/api/auth/logout", auth=False)
def logout(ctx):
    if ctx.token_hash:
        ctx.db.execute("DELETE FROM sessions WHERE token_hash = ?", (ctx.token_hash,))
    ctx.clear_session_cookie()
    return {"ok": True}


@route("GET", "/api/me", auth=False)
def me(ctx):
    """Returns {user: null} when signed out, so the page can decide what to show."""
    return {"user": public_user(ctx.user) if ctx.user else None, "today": ctx.today().isoformat()}


@route("PATCH", "/api/me")
def update_me(ctx):
    v = Validator(ctx.json())
    sets, args = [], []
    body = ctx.json()
    if "display_name" in body:
        sets.append("display_name = ?")
        args.append(v.str("display_name", 1, 40))
    if "level" in body:
        sets.append("level = ?")
        args.append(v.choice("level", ["beginner", "intermediate", "advanced"]))
    if "default_gym_id" in body:
        gym = body["default_gym_id"]
        if gym is None:
            sets.append("default_gym_id = NULL")
        else:
            v.int("default_gym_id", min=1)
            v.done()
            get_place(ctx.db, gym, "gym")
            sets.append("default_gym_id = ?")
            args.append(gym)
    v.done()
    if sets:
        ctx.db.execute(f"UPDATE users SET {', '.join(sets)} WHERE id = ?", (*args, ctx.user["id"]))
    row = ctx.db.execute("SELECT * FROM users WHERE id = ?", (ctx.user["id"],)).fetchone()
    return {"user": public_user(row)}


@route("DELETE", "/api/me")
def delete_me(ctx):
    """Delete the account and everything the user created. Needs the password."""
    v = Validator(ctx.json())
    password = v.secret("password", min=1)
    v.done()
    if not verify_password(password, ctx.user["password_hash"], ctx.user["salt"]):
        raise ApiError(403, "bad_credentials", "Wrong password")
    uid = ctx.user["id"]
    db = ctx.db
    for g in db.execute("SELECT id FROM groups WHERE owner_id = ?", (uid,)).fetchall():
        heir = db.execute(
            "SELECT user_id FROM group_members WHERE group_id = ? AND user_id != ? ORDER BY joined_at, user_id LIMIT 1",
            (g["id"], uid),
        ).fetchone()
        if heir:
            db.execute("UPDATE groups SET owner_id = ? WHERE id = ?", (heir["user_id"], g["id"]))
            db.execute("UPDATE group_members SET role = 'owner' WHERE group_id = ? AND user_id = ?", (g["id"], heir["user_id"]))
        else:
            db.execute("DELETE FROM groups WHERE id = ?", (g["id"],))
    db.execute("DELETE FROM users WHERE id = ?", (uid,))
    ctx.clear_session_cookie()
    return {"ok": True}
