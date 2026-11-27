"""Location-aware workout planning.

The planner looks at the gaps in a student's timetable and works out how long a
workout can really be once travel to the gym and back, changing time and a
safety margin before the next class are taken off.

    workout = gap - travel to gym - travel back - changing time - safety margin
"""

import hashlib
import math

from .library import (
    AUTO_FOCUSES,
    DEFAULT_REPS,
    EXERCISES,
    FOCUSES,
    MUSCLE_LABELS,
    SETS_BY_LEVEL,
)

DEFAULTS = {
    "buffer_min": 10,  # changing before and after, split in half
    "safety_min": 5,  # spare minutes before the next class
    "min_workout": 20,
    "max_workout": 90,
    "day_start": 7 * 60,
    "day_end": 21 * 60,
    "default_travel": 10,  # used when no travel time is known
    "free_day_workout": 60,
}


def travel_leg(lookup, a_id, b_id, default):
    """Minutes between two places and whether the number is only an estimate."""
    if a_id is None or b_id is None:
        return default, True
    if a_id == b_id:
        return 0, False
    minutes = lookup(a_id, b_id)
    if minutes is None:
        return default, True
    return minutes, False


def merge_classes(classes):
    """Sort classes and merge any that overlap so gaps are never negative."""
    out = []
    for c in sorted(classes, key=lambda c: (c["start"], c["end"])):
        if out and c["start"] < out[-1]["end"]:
            if c["end"] > out[-1]["end"]:
                out[-1] = dict(out[-1], end=c["end"], place_id=c.get("place_id"))
            continue
        out.append(dict(c))
    return out


def plan_gaps(classes, gym_id, lookup, **opts):
    """Return one dict per free gap in the day, with a feasible workout length."""
    o = {**DEFAULTS, **opts}
    classes = merge_classes(classes)
    raw = []
    if not classes:
        raw.append({"kind": "free_day", "start": o["day_start"], "end": o["day_end"], "prev": None, "next": None})
    else:
        if classes[0]["start"] > o["day_start"]:
            raw.append({"kind": "before", "start": o["day_start"], "end": classes[0]["start"], "prev": None, "next": classes[0]})
        for a, b in zip(classes, classes[1:]):
            if b["start"] > a["end"]:
                raw.append({"kind": "between", "start": a["end"], "end": b["start"], "prev": a, "next": b})
        if classes[-1]["end"] < o["day_end"]:
            raw.append({"kind": "after", "start": classes[-1]["end"], "end": o["day_end"], "prev": classes[-1], "next": None})

    gaps = []
    for g in raw:
        gap_minutes = g["end"] - g["start"]
        estimated = False
        travel_to = travel_back = 0
        if g["kind"] in ("between", "after"):
            travel_to, est = travel_leg(lookup, g["prev"].get("place_id"), gym_id, o["default_travel"])
            estimated = estimated or est
        if g["kind"] in ("between", "before"):
            travel_back, est = travel_leg(lookup, gym_id, g["next"].get("place_id"), o["default_travel"])
            estimated = estimated or est
        safety = o["safety_min"] if g["next"] else 0
        available = gap_minutes - travel_to - travel_back - o["buffer_min"] - safety

        if g["kind"] == "free_day":
            workout = o["free_day_workout"]
            available = workout
        elif available >= o["min_workout"]:
            workout = min(o["max_workout"], available // 5 * 5)
        else:
            workout = 0

        timeline = None
        if workout:
            half = o["buffer_min"] // 2
            leave = g["start"]
            arrive = leave + travel_to
            w_start = arrive + half
            w_end = w_start + workout
            leave_gym = w_end + (o["buffer_min"] - half)
            back = leave_gym + travel_back
            timeline = {
                "leave": leave,
                "arrive_gym": arrive,
                "workout_start": w_start,
                "workout_end": w_end,
                "leave_gym": leave_gym,
                "back": back,
                "spare": (g["end"] - back) if g["next"] else None,
            }
            if g["kind"] == "free_day":
                timeline = None

        note = None
        if g["kind"] == "before":
            note = "Travel from home to the gym is not counted."
        elif g["kind"] == "after":
            note = "Travel home after your workout is not counted."
        elif g["kind"] == "free_day":
            note = "No classes today, so any 60-minute slot works."

        gaps.append(
            {
                "kind": g["kind"],
                "start": g["start"],
                "end": g["end"],
                "gap_minutes": gap_minutes,
                "prev": _brief(g["prev"]),
                "next": _brief(g["next"]),
                "travel_to": travel_to,
                "travel_back": travel_back,
                "estimated": estimated,
                "buffer": o["buffer_min"],
                "safety": safety,
                "available": max(0, available),
                "workout_minutes": workout,
                "feasible": workout > 0,
                "timeline": timeline,
                "note": note,
            }
        )
    return gaps


def _brief(c):
    if not c:
        return None
    return {"title": c.get("title"), "start": c["start"], "end": c["end"], "place_id": c.get("place_id")}


def recommended_gap(gaps):
    """Index of the gap that allows the longest workout, or None."""
    best = None
    for i, g in enumerate(gaps):
        if g["feasible"] and (best is None or g["workout_minutes"] > gaps[best]["workout_minutes"]):
            best = i
    return best


def choose_focus(points, rotation=0):
    """Pick the session focus whose muscles got the least work this week."""
    scored = []
    for i, f in enumerate(AUTO_FOCUSES):
        muscles = FOCUSES[f]["muscles"]
        avg = sum(points.get(m, 0) for m in muscles) / len(muscles)
        scored.append((round(avg, 3), (i - rotation) % len(AUTO_FOCUSES), f))
    scored.sort()
    avg, _, focus = scored[0]
    label = FOCUSES[focus]["label"].split(" (")[0]
    if all(s[0] == 0 for s in scored):
        reason = f"Nothing logged this week yet, so we are rotating: {label.lower()} today."
    else:
        reason = f"{label} has had the least work this week ({avg:.1f} points per muscle)."
    return focus, reason


def _jitter(seed, key):
    h = hashlib.md5(f"{seed}:{key}".encode()).hexdigest()[:6]
    return int(h, 16) / 0xFFFFFF * 0.4


def build_workout(minutes, focus, level, seed=0):
    """Pick exercises that fit the time and the focus."""
    if focus not in FOCUSES:
        raise ValueError("unknown focus")
    if level not in SETS_BY_LEVEL:
        level = "beginner"
    warm = 5 if minutes >= 30 else 0
    budget = minutes - warm
    sets = SETS_BY_LEVEL[level]
    block = math.ceil(sets * 2.5)
    muscles = FOCUSES[focus]["muscles"]
    allowed = lambda e: level != "beginner" or e["level"] == "all"

    items = []
    if focus == "cardio":
        pool = [e for e in EXERCISES if e["category"] in ("cardio", "speed") and allowed(e)]
        pool.sort(key=lambda e: _jitter(seed, e["key"]))
        n = min(3, max(1, budget // 10))
        base = (budget // n) // 5 * 5
        extra = budget - base * n
        for i, e in enumerate(pool[:n]):
            dur = base + (extra if i == 0 else 0)
            items.append(_timed_item(e, dur))
        used = sum(i["est_minutes"] for i in items)
    else:
        pool = [e for e in EXERCISES if e["kind"] == "sets" and set(e["main"]) & set(muscles) and allowed(e)]
        covered = set()
        chosen = []
        used = 0
        while budget - used >= block and len(chosen) < 7 and pool:
            def score(e):
                new = len((set(e["main"]) & set(muscles)) - covered)
                helper_new = len((set(e["helper"]) & set(muscles)) - covered)
                s = new + 0.15 * helper_new
                if e["compound"] and len(chosen) < 3:
                    s += 0.5
                same = sum(1 for c in chosen if set(c["main"]) == set(e["main"]))
                s -= 0.6 * same
                return s + _jitter(seed, e["key"])

            best = max(pool, key=score)
            pool.remove(best)
            chosen.append(best)
            covered |= set(best["main"]) & set(muscles)
            used += block
        chosen.sort(key=lambda e: (not e["compound"], e["category"] == "core"))
        for e in chosen:
            items.append(_set_item(e, sets, level))

    cool = budget - used
    cooldown = cool if cool >= 5 else 0
    return {
        "focus": focus,
        "focus_label": FOCUSES[focus]["label"],
        "level": level,
        "minutes": minutes,
        "warmup_minutes": warm,
        "exercises": items,
        "cooldown_minutes": cooldown,
        "total_minutes": warm + used + cooldown,
    }


def _set_item(e, sets, level):
    compound_reps, iso_reps = DEFAULT_REPS[level]
    if e["rep_unit"] == "sec":
        reps = "20–30 sec" if level == "beginner" else "30–45 sec"
        rest = 45
    else:
        reps = compound_reps if e["compound"] else iso_reps
        rest = 90 if e["compound"] else 60
    return {
        "key": e["key"],
        "name": e["name"],
        "kind": "sets",
        "sets": sets,
        "reps": reps,
        "rest_sec": rest,
        "est_minutes": math.ceil(sets * 2.5),
        "main": [MUSCLE_LABELS[m] for m in e["main"]],
        "helper": [MUSCLE_LABELS[m] for m in e["helper"]],
    }


def _timed_item(e, minutes):
    return {
        "key": e["key"],
        "name": e["name"],
        "kind": "timed",
        "duration_min": minutes,
        "est_minutes": minutes,
        "main": [MUSCLE_LABELS[m] for m in e["main"]],
        "helper": [MUSCLE_LABELS[m] for m in e["helper"]],
    }
