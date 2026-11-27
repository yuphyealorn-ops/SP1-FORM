"""Location-aware workout planner (requirement 1)."""

from ..errors import ApiError
from ..library import FOCUSES
from ..planner import build_workout, choose_focus, plan_gaps, recommended_gap
from ..router import route
from ..timeutil import weekday
from ..validation import Validator
from .common import classes_for, get_place, muscle_points, travel_lookup


@route("GET", "/api/planner/day")
def plan_day(ctx):
    v = Validator({"date": ctx.q("date") or ctx.today().isoformat(), "gym_id": _int_or_none(ctx.q("gym_id")), "focus": ctx.q("focus") or "auto"})
    day = v.date("date")
    gym_id = v.int("gym_id", min=1, required=False)
    focus_in = v.choice("focus", ["auto", *FOCUSES])
    v.done()
    if gym_id is None:
        gym_id = ctx.user["default_gym_id"]
    if gym_id is None:
        raise ApiError(422, "validation", "Choose a gym first", {"gym_id": "Choose the gym you train at"})
    gym = get_place(ctx.db, gym_id, "gym")

    classes = classes_for(ctx.db, ctx.user["id"], weekday(day))
    lookup = travel_lookup(ctx.db)
    gaps = plan_gaps(classes, gym_id, lookup)
    best = recommended_gap(gaps)

    points = muscle_points(ctx.db, ctx.user["id"], ctx.today(), 7)
    if focus_in == "auto":
        focus, reason = choose_focus(points, rotation=weekday(day))
    else:
        focus, reason = focus_in, f"You chose {FOCUSES[focus_in]['label'].split(' (')[0].lower()}."

    for i, g in enumerate(gaps):
        g["recommended"] = i == best
        g["workout"] = build_workout(g["workout_minutes"], focus, ctx.user["level"], seed=day.toordinal() * 10 + i) if g["feasible"] else None
    return {
        "date": day.isoformat(),
        "weekday": weekday(day),
        "gym": {"id": gym["id"], "name": gym["name"]},
        "classes": classes,
        "gaps": gaps,
        "focus": focus,
        "focus_reason": reason,
        "points": points,
    }


def _int_or_none(s):
    try:
        return int(s) if s not in (None, "") else None
    except ValueError:
        return s  # lets the validator reject it
