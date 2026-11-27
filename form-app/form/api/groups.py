"""Fitness groups: shared goal, suggested training types, check-ins and shared plans."""

import json
import secrets
from datetime import date, timedelta

from ..errors import ApiError, conflict, forbidden, not_found
from ..library import GOALS, SPORTS, TRAINING_TYPES, TRAINING_TYPE_KEYS, group_plan
from ..router import route
from ..timeutil import utc_stamp, week_start
from ..validation import Validator
from .common import require_member, require_owner
from .workouts import load_workouts

CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def _code():
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(8))


def _group_dict(g, role=None, members=None):
    out = {
        "id": g["id"],
        "name": g["name"],
        "description": g["description"],
        "goal_key": g["goal_key"],
        "goal_label": GOALS[g["goal_key"]]["label"],
        "sport": g["sport"],
        "sport_label": SPORTS[g["sport"]]["label"] if g["sport"] in SPORTS else None,
        "target_date": g["target_date"],
        "weekly_target": g["weekly_target"],
    }
    if role:
        out["role"] = role
    if members is not None:
        out["member_count"] = members
    return out


@route("GET", "/api/groups")
def my_groups(ctx):
    rows = ctx.db.execute(
        "SELECT g.*, m.role, (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) AS n "
        "FROM groups g JOIN group_members m ON m.group_id = g.id WHERE m.user_id = ? ORDER BY g.created_at DESC, g.id DESC",
        (ctx.user["id"],),
    ).fetchall()
    ws = week_start(ctx.today()).isoformat()
    out = []
    for r in rows:
        mine = ctx.db.execute(
            "SELECT COUNT(*) FROM group_checkins WHERE group_id = ? AND user_id = ? AND performed_on >= ?",
            (r["id"], ctx.user["id"], ws),
        ).fetchone()[0]
        d = _group_dict(r, r["role"], r["n"])
        d["my_week_checkins"] = mine
        out.append(d)
    return {"groups": out}


@route("POST", "/api/groups")
def create_group(ctx):
    v = Validator(ctx.json())
    v.str("name", 3, 50)
    v.text("description", 300)
    v.choice("goal_key", list(GOALS))
    v.choice("sport", list(SPORTS), required=False)
    v.date("target_date", required=False)
    v.int("weekly_target", min=1, max=14, required=False, default=3)
    d = v.done()
    if GOALS[d["goal_key"]].get("needs_sport") and not d["sport"]:
        raise ApiError(422, "validation", "Choose the sport", {"sport": "Choose the sport you are preparing for"})
    if not GOALS[d["goal_key"]].get("needs_sport"):
        d["sport"] = None
    if d["target_date"] and d["target_date"] < ctx.today():
        raise ApiError(422, "validation", "Pick a date in the future", {"target_date": "Date is in the past"})
    n = ctx.db.execute("SELECT COUNT(*) FROM groups WHERE owner_id = ?", (ctx.user["id"],)).fetchone()[0]
    if n >= 10:
        raise ApiError(422, "limit", "You can own up to 10 groups")
    now = utc_stamp()
    for _ in range(5):
        try:
            cur = ctx.db.execute(
                "INSERT INTO groups (name, description, goal_key, sport, target_date, weekly_target, invite_code, owner_id, created_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (d["name"], d["description"], d["goal_key"], d["sport"],
                 d["target_date"].isoformat() if d["target_date"] else None, d["weekly_target"], _code(), ctx.user["id"], now),
            )
            break
        except Exception as e:  # invite code collision: try another
            if "UNIQUE" not in str(e):
                raise
    else:
        raise ApiError(500, "server_error", "Could not create the group")
    gid = cur.lastrowid
    ctx.db.execute("INSERT INTO group_members (group_id, user_id, role, joined_at) VALUES (?, ?, 'owner', ?)", (gid, ctx.user["id"], now))
    g = ctx.db.execute("SELECT * FROM groups WHERE id = ?", (gid,)).fetchone()
    out = _group_dict(g, "owner", 1)
    out["invite_code"] = g["invite_code"]
    return 201, out


@route("POST", "/api/groups/join")
def join_group(ctx):
    v = Validator(ctx.json())
    v.str("invite_code", 4, 16)
    code = v.done()["invite_code"].upper()
    g = ctx.db.execute("SELECT * FROM groups WHERE invite_code = ?", (code,)).fetchone()
    if g is None:
        raise not_found("No group has that invite code")
    n = ctx.db.execute("SELECT COUNT(*) FROM group_members WHERE group_id = ?", (g["id"],)).fetchone()[0]
    already = ctx.db.execute("SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?", (g["id"], ctx.user["id"])).fetchone()
    if already:
        return {"group": _group_dict(g, None, n), "joined": False}
    if n >= 30:
        raise conflict("This group is full (30 members)")
    ctx.db.execute("INSERT INTO group_members (group_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)", (g["id"], ctx.user["id"], utc_stamp()))
    return 201, {"group": _group_dict(g, "member", n + 1), "joined": True}


def _streak_weeks(week_counts, target, this_week):
    """Consecutive finished weeks (before this one) in which the member met the target."""
    streak, w = 0, this_week - timedelta(weeks=1)
    while week_counts.get(w.isoformat(), 0) >= target:
        streak += 1
        w -= timedelta(weeks=1)
    return streak


@route("GET", "/api/groups/<int:id>")
def group_detail(ctx):
    g, role = require_member(ctx.db, ctx.params["id"], ctx.user["id"])
    today = ctx.today()
    ws = week_start(today)
    gid = g["id"]
    members = ctx.db.execute(
        "SELECT u.id, u.display_name, u.level, m.role FROM group_members m JOIN users u ON u.id = m.user_id "
        "WHERE m.group_id = ? ORDER BY m.role = 'owner' DESC, u.display_name COLLATE NOCASE",
        (gid,),
    ).fetchall()
    checks = ctx.db.execute("SELECT user_id, session_type, duration_min, performed_on FROM group_checkins WHERE group_id = ?", (gid,)).fetchall()

    per_member = {}
    for c in checks:
        d = per_member.setdefault(c["user_id"], {"total": 0, "minutes": 0, "weeks": {}})
        d["total"] += 1
        d["minutes"] += c["duration_min"]
        wk = week_start(date.fromisoformat(c["performed_on"])).isoformat()
        d["weeks"][wk] = d["weeks"].get(wk, 0) + 1

    out_members = []
    for m in members:
        d = per_member.get(m["id"], {"total": 0, "minutes": 0, "weeks": {}})
        out_members.append(
            {
                "id": m["id"],
                "display_name": m["display_name"],
                "level": m["level"],
                "role": m["role"],
                "is_me": m["id"] == ctx.user["id"],
                "week_checkins": d["weeks"].get(ws.isoformat(), 0),
                "total_checkins": d["total"],
                "minutes": d["minutes"],
                "streak_weeks": _streak_weeks(d["weeks"], g["weekly_target"], ws),
            }
        )

    plan = group_plan(g["goal_key"], g["sport"])
    done_this_week = {}
    for c in checks:
        if c["performed_on"] >= ws.isoformat():
            done_this_week[c["session_type"]] = done_this_week.get(c["session_type"], 0) + 1
    members_n = max(1, len(members))
    for block in plan:
        block["done_this_week"] = done_this_week.get(block["type"], 0)
        block["goal_this_week"] = block["sessions_per_week"] * members_n

    week_total = sum(done_this_week.values())
    out = _group_dict(g, role, len(members))
    out["invite_code"] = g["invite_code"] if role == "owner" else None
    out["days_left"] = (date.fromisoformat(g["target_date"]) - today).days if g["target_date"] else None
    out["members"] = out_members
    out["plan"] = plan
    out["progress"] = {
        "week_start": ws.isoformat(),
        "week_checkins": week_total,
        "week_goal": g["weekly_target"] * len(members),
        "total_checkins": len(checks),
        "total_minutes": sum(c["duration_min"] for c in checks),
    }
    return out


@route("POST", "/api/groups/<int:id>/leave")
def leave_group(ctx):
    g, role = require_member(ctx.db, ctx.params["id"], ctx.user["id"])
    if role == "owner":
        heir = ctx.db.execute(
            "SELECT user_id FROM group_members WHERE group_id = ? AND user_id != ? ORDER BY joined_at, user_id LIMIT 1",
            (g["id"], ctx.user["id"]),
        ).fetchone()
        if heir is None:
            ctx.db.execute("DELETE FROM groups WHERE id = ?", (g["id"],))
            return {"ok": True, "deleted": True}
        ctx.db.execute("UPDATE groups SET owner_id = ? WHERE id = ?", (heir["user_id"], g["id"]))
        ctx.db.execute("UPDATE group_members SET role = 'owner' WHERE group_id = ? AND user_id = ?", (g["id"], heir["user_id"]))
    ctx.db.execute("DELETE FROM group_members WHERE group_id = ? AND user_id = ?", (g["id"], ctx.user["id"]))
    return {"ok": True}


@route("DELETE", "/api/groups/<int:id>")
def delete_group(ctx):
    g, role = require_member(ctx.db, ctx.params["id"], ctx.user["id"])
    require_owner(role)
    ctx.db.execute("DELETE FROM groups WHERE id = ?", (g["id"],))
    return {"ok": True}


@route("POST", "/api/groups/<int:id>/members/<int:uid>/remove")
def remove_member(ctx):
    g, role = require_member(ctx.db, ctx.params["id"], ctx.user["id"])
    require_owner(role)
    if ctx.params["uid"] == ctx.user["id"]:
        raise ApiError(422, "validation", "Use leave to exit your own group")
    cur = ctx.db.execute("DELETE FROM group_members WHERE group_id = ? AND user_id = ?", (g["id"], ctx.params["uid"]))
    if cur.rowcount == 0:
        raise not_found("Member not found")
    return {"ok": True}


# ---------------------------------------------------------------- check-ins
def _checkin_dict(r, me):
    return {
        "id": r["id"],
        "user_id": r["user_id"],
        "display_name": r["display_name"],
        "is_me": r["user_id"] == me,
        "session_type": r["session_type"],
        "session_label": TRAINING_TYPES[r["session_type"]]["label"] if r["session_type"] in TRAINING_TYPES else r["session_type"],
        "duration_min": r["duration_min"],
        "note": r["note"],
        "performed_on": r["performed_on"],
    }


@route("GET", "/api/groups/<int:id>/checkins")
def list_checkins(ctx):
    g, _ = require_member(ctx.db, ctx.params["id"], ctx.user["id"])
    rows = ctx.db.execute(
        "SELECT c.*, u.display_name FROM group_checkins c JOIN users u ON u.id = c.user_id "
        "WHERE c.group_id = ? ORDER BY c.performed_on DESC, c.id DESC LIMIT 100",
        (g["id"],),
    ).fetchall()
    return {"checkins": [_checkin_dict(r, ctx.user["id"]) for r in rows]}


@route("POST", "/api/groups/<int:id>/checkins")
def add_checkin(ctx):
    g, _ = require_member(ctx.db, ctx.params["id"], ctx.user["id"])
    v = Validator(ctx.json())
    v.choice("session_type", TRAINING_TYPE_KEYS)
    v.int("duration_min", min=5, max=300)
    v.date("performed_on", required=False, default=ctx.today())
    v.text("note", 200)
    v.int("workout_id", min=1, required=False)
    d = v.done()
    day = d["performed_on"]
    if day > ctx.today():
        raise ApiError(422, "validation", "Check in after the session", {"performed_on": "Date is in the future"})
    if day < ctx.today() - timedelta(days=14):
        raise ApiError(422, "validation", "You can check in up to 14 days back", {"performed_on": "Too long ago"})
    if d["workout_id"]:
        own = ctx.db.execute("SELECT 1 FROM workouts WHERE id = ? AND user_id = ?", (d["workout_id"], ctx.user["id"])).fetchone()
        if own is None:
            raise ApiError(422, "validation", "Unknown workout", {"workout_id": "Pick one of your own workouts"})
    dup = ctx.db.execute(
        "SELECT COUNT(*) FROM group_checkins WHERE group_id = ? AND user_id = ? AND performed_on = ?",
        (g["id"], ctx.user["id"], day.isoformat()),
    ).fetchone()[0]
    if dup >= 3:
        raise conflict("You already checked in 3 times that day")
    cur = ctx.db.execute(
        "INSERT INTO group_checkins (group_id, user_id, workout_id, session_type, duration_min, note, performed_on, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (g["id"], ctx.user["id"], d["workout_id"], d["session_type"], d["duration_min"], d["note"], day.isoformat(), utc_stamp()),
    )
    row = ctx.db.execute(
        "SELECT c.*, u.display_name FROM group_checkins c JOIN users u ON u.id = c.user_id WHERE c.id = ?", (cur.lastrowid,)
    ).fetchone()
    return 201, _checkin_dict(row, ctx.user["id"])


@route("DELETE", "/api/groups/<int:id>/checkins/<int:cid>")
def delete_checkin(ctx):
    g, _ = require_member(ctx.db, ctx.params["id"], ctx.user["id"])
    cur = ctx.db.execute(
        "DELETE FROM group_checkins WHERE id = ? AND group_id = ? AND user_id = ?", (ctx.params["cid"], g["id"], ctx.user["id"])
    )
    if cur.rowcount == 0:
        raise not_found("Check-in not found")
    return {"ok": True}


# -------------------------------------------------------------------- posts
def _post_dict(r, me, role):
    return {
        "id": r["id"],
        "user_id": r["user_id"],
        "display_name": r["display_name"],
        "kind": r["kind"],
        "title": r["title"],
        "body": r["body"],
        "url": r["url"],
        "plan": json.loads(r["plan_json"]) if r["plan_json"] else None,
        "created_at": r["created_at"],
        "can_delete": r["user_id"] == me or role == "owner",
    }


@route("GET", "/api/groups/<int:id>/posts")
def list_posts(ctx):
    g, role = require_member(ctx.db, ctx.params["id"], ctx.user["id"])
    rows = ctx.db.execute(
        "SELECT p.*, u.display_name FROM group_posts p JOIN users u ON u.id = p.user_id WHERE p.group_id = ? ORDER BY p.id DESC LIMIT 100",
        (g["id"],),
    ).fetchall()
    return {"posts": [_post_dict(r, ctx.user["id"], role) for r in rows]}


@route("POST", "/api/groups/<int:id>/posts")
def add_post(ctx):
    g, role = require_member(ctx.db, ctx.params["id"], ctx.user["id"])
    v = Validator(ctx.json())
    v.choice("kind", ["plan", "resource"])
    v.str("title", 2, 80)
    v.text("body", 1000)
    v.url("url")
    v.int("workout_id", min=1, required=False)
    d = v.done()
    plan = None
    if d["kind"] == "plan":
        if not d["workout_id"] and not d["body"]:
            raise ApiError(422, "validation", "Describe the plan or attach one of your workouts", {"body": "Write the plan or pick a workout"})
        if d["workout_id"]:
            found = [w for w in load_workouts(ctx.db, ctx.user["id"], limit=1000) if w["id"] == d["workout_id"]]
            if not found:
                raise ApiError(422, "validation", "Unknown workout", {"workout_id": "Pick one of your own workouts"})
            w = found[0]
            plan = {
                "duration_min": w["duration_min"],
                "exercises": [
                    {"name": e["name"], "sets": e["sets"], "reps": e["reps"], "duration_min": e["duration_min"]} for e in w["entries"]
                ],
            }
    elif not d["url"] and not d["body"]:
        raise ApiError(422, "validation", "Add a link or a few words", {"url": "Add a link or write a note"})
    cur = ctx.db.execute(
        "INSERT INTO group_posts (group_id, user_id, kind, title, body, url, plan_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (g["id"], ctx.user["id"], d["kind"], d["title"], d["body"], d["url"], json.dumps(plan) if plan else None, utc_stamp()),
    )
    row = ctx.db.execute("SELECT p.*, u.display_name FROM group_posts p JOIN users u ON u.id = p.user_id WHERE p.id = ?", (cur.lastrowid,)).fetchone()
    return 201, _post_dict(row, ctx.user["id"], role)


@route("DELETE", "/api/groups/<int:id>/posts/<int:pid>")
def delete_post(ctx):
    g, role = require_member(ctx.db, ctx.params["id"], ctx.user["id"])
    post = ctx.db.execute("SELECT user_id FROM group_posts WHERE id = ? AND group_id = ?", (ctx.params["pid"], g["id"])).fetchone()
    if post is None:
        raise not_found("Post not found")
    if post["user_id"] != ctx.user["id"] and role != "owner":
        raise forbidden("Only the author or the group owner can delete this")
    ctx.db.execute("DELETE FROM group_posts WHERE id = ?", (ctx.params["pid"],))
    return {"ok": True}
