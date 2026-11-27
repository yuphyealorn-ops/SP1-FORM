"""Muscle points from logged workouts (Feature B)."""

import json

from .library import EXERCISE_BY_KEY, LOW_POINTS_PER_WEEK, MUSCLE_KEYS, MUSCLE_LABELS


def _json_list(value):
    if not value:
        return []
    if isinstance(value, list):
        return value
    try:
        data = json.loads(value)
        return [m for m in data if m in MUSCLE_KEYS] if isinstance(data, list) else []
    except (ValueError, TypeError):
        return []


def entry_muscles(entry):
    """Return (main, helper, timed) for a workout entry (dict or sqlite Row)."""
    key = entry["exercise_key"]
    if key == "custom":
        main = _json_list(entry["custom_main"])
        helper = _json_list(entry["custom_helper"])
        timed = entry["reps"] is None and entry["duration_min"] is not None
        return main, helper, timed
    ex = EXERCISE_BY_KEY.get(key)
    if ex is None:  # exercise removed from the library: keep the log, give no points
        return [], [], False
    return ex["main"], ex["helper"], ex["kind"] == "timed"


def entry_points(entry):
    main, helper, timed = entry_muscles(entry)
    if timed:
        units = max(1, round((entry["duration_min"] or 10) / 10))
    else:
        units = max(1, entry["sets"] or 1)
    points = {}
    for m in main:
        points[m] = points.get(m, 0) + units
    for m in helper:
        if m not in main:
            points[m] = points.get(m, 0) + units * 0.5
    return points


def points_by_muscle(entries):
    """Total points for every muscle group (all groups present, default 0)."""
    total = {m: 0.0 for m in MUSCLE_KEYS}
    for e in entries:
        for m, p in entry_points(e).items():
            total[m] += p
    return {m: round(v, 1) for m, v in total.items()}


def low_muscles(points, days=7):
    """Muscle groups with fewer points than the weekly minimum (scaled to the window)."""
    threshold = LOW_POINTS_PER_WEEK * days / 7
    return [m for m in MUSCLE_KEYS if points.get(m, 0) < threshold]


def insight_text(points, days=7):
    low = low_muscles(points, days)
    if not low:
        return "Every muscle group has had some work. Nicely balanced."
    if len(low) == len(MUSCLE_KEYS):
        return "No training logged in this period yet."
    names = ", ".join(MUSCLE_LABELS[m].lower() for m in low[:4])
    more = f" and {len(low) - 4} more" if len(low) > 4 else ""
    return f"Under-trained: {names}{more}. Fewer than {LOW_POINTS_PER_WEEK} points in a week."
