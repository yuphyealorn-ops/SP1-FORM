"""Gym Buddy matching.

A student posts a training session ("Leg day, Saturday 17:00, campus gym, need
one partner"). Other students see the open sessions ranked by how well each
one suits them:

    time fit   35  does it fit around my classes, including travel?
    location   25  same gym as my home gym, or how far away is it?
    focus      25  does it train muscles I have neglected this week?
    level      15  is the partner at a similar training level?
"""

from .library import FOCUSES, LEVELS, MUSCLE_LABELS
from .planner import DEFAULTS, merge_classes, travel_leg
from .timeutil import fmt_hhmm


def fit_to_timetable(classes, start, end, gym_id, lookup, default_travel=None, safety=None):
    """Check a session [start, end) against one day's classes.

    Returns {fits, tight, conflict, message, spare}.
    """
    default_travel = DEFAULTS["default_travel"] if default_travel is None else default_travel
    safety = DEFAULTS["safety_min"] if safety is None else safety
    classes = merge_classes(classes)
    if not classes:
        return {"fits": True, "tight": False, "conflict": None, "spare": None, "message": "Your timetable is free that day."}

    for c in classes:
        if c["start"] < end and start < c["end"]:
            return {
                "fits": False,
                "tight": False,
                "conflict": c.get("title"),
                "spare": None,
                "message": f"Clashes with your {c.get('title') or 'class'} ({fmt_hhmm(c['start'])}–{fmt_hhmm(c['end'])}).",
            }

    prev = max((c for c in classes if c["end"] <= start), key=lambda c: c["end"], default=None)
    nxt = min((c for c in classes if c["start"] >= end), key=lambda c: c["start"], default=None)

    if prev:
        t_in, _ = travel_leg(lookup, prev.get("place_id"), gym_id, default_travel)
        if prev["end"] + t_in > start:
            return {
                "fits": False,
                "tight": True,
                "conflict": None,
                "spare": None,
                "message": f"Too tight after your {prev.get('title') or 'class'}: about {t_in} min to reach the gym.",
            }
    if nxt:
        t_out, _ = travel_leg(lookup, gym_id, nxt.get("place_id"), default_travel)
        spare = nxt["start"] - (end + t_out)
        if spare < safety:
            return {
                "fits": False,
                "tight": True,
                "conflict": None,
                "spare": spare,
                "message": f"Too tight before your {nxt.get('title') or 'next class'} at {fmt_hhmm(nxt['start'])}: about {t_out} min to get back.",
            }
        return {
            "fits": True,
            "tight": False,
            "conflict": None,
            "spare": spare,
            "message": f"Fits around your classes. You would be back {spare} min before {nxt.get('title') or 'your next class'}.",
        }
    return {"fits": True, "tight": False, "conflict": None, "spare": None, "message": "Fits after your last class."}


def _level_gap(a, b):
    return abs(LEVELS.index(a) - LEVELS.index(b))


def score_request(viewer, req, lookup):
    """Score one open session for one viewer.

    viewer: {level, default_gym_id, classes, low_muscles}
    req:    {focus, start, duration, place_id, level}
    """
    reasons = []

    # time fit (35)
    fit = fit_to_timetable(viewer["classes"], req["start"], req["start"] + req["duration"], req["place_id"], lookup)
    if fit["fits"]:
        time_pts = 35
    elif fit["tight"]:
        time_pts = 10
    else:
        time_pts = 0
    reasons.append({"ok": fit["fits"], "text": fit["message"]})

    # location (25)
    home = viewer.get("default_gym_id")
    if home is None:
        loc_pts = 10
        reasons.append({"ok": None, "text": "Set a home gym in your profile to improve location matching."})
    elif home == req["place_id"]:
        loc_pts = 25
        reasons.append({"ok": True, "text": "Same gym as your home gym."})
    else:
        minutes, estimated = travel_leg(lookup, home, req["place_id"], DEFAULTS["default_travel"])
        if estimated:
            loc_pts = 5
            reasons.append({"ok": None, "text": "Travel time from your home gym is not set yet."})
        else:
            loc_pts = 15 if minutes <= 10 else 8 if minutes <= 20 else 3
            reasons.append({"ok": minutes <= 10, "text": f"About {minutes} min from your home gym."})

    # focus (25)
    muscles = FOCUSES[req["focus"]]["muscles"]
    if not muscles:
        focus_pts = 15
        reasons.append({"ok": None, "text": "Cardio session. It does not change your muscle balance."})
    else:
        low = [m for m in muscles if m in viewer["low_muscles"]]
        share = len(low) / len(muscles)
        focus_pts = round(10 + 15 * share)
        if low:
            names = ", ".join(MUSCLE_LABELS[m].lower() for m in low[:3])
            reasons.append({"ok": True, "text": f"Trains {names}, which you have done least this week."})
        else:
            reasons.append({"ok": None, "text": "Trains muscles you have already covered this week."})

    # level (15)
    if req["level"] == "any":
        level_pts = 15
        reasons.append({"ok": True, "text": "Open to any level."})
    else:
        gap = _level_gap(viewer["level"], req["level"])
        level_pts = {0: 15, 1: 8}.get(gap, 0)
        text = {0: "Same training level as you.", 1: "One level away from yours. Should still work."}.get(
            gap, "Two levels away from yours. Check the plan with them first."
        )
        reasons.append({"ok": gap == 0 if gap < 2 else False, "text": text})

    score = time_pts + loc_pts + focus_pts + level_pts
    label = "Great match" if score >= 80 else "Good match" if score >= 60 else "Possible" if score >= 40 else "Weak match"
    return {"score": score, "label": label, "fits": fit["fits"], "reasons": reasons}
