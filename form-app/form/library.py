"""Static reference data: muscles, exercises, session focuses and group goals.

Muscle points (Feature B): every set gives 1 point to each main muscle and
0.5 points to each helper muscle. Timed exercises (running, rowing ...) give
1 point per 10 minutes instead of per set.
"""

MUSCLES = [
    ("chest", "Chest"),
    ("shoulders", "Shoulders"),
    ("biceps", "Biceps"),
    ("triceps", "Triceps"),
    ("forearms", "Forearms"),
    ("back", "Back"),
    ("core", "Core"),
    ("glutes", "Glutes"),
    ("quads", "Quads"),
    ("hamstrings", "Hamstrings"),
    ("calves", "Calves"),
]
MUSCLE_KEYS = [k for k, _ in MUSCLES]
MUSCLE_LABELS = dict(MUSCLES)

# A muscle group trained for fewer points than this in a week is flagged.
LOW_POINTS_PER_WEEK = 4

LEVELS = ["beginner", "intermediate", "advanced"]


def _ex(key, name, category, kind, main, helper, equipment, compound=False, level="all", rep_unit="reps"):
    return {
        "key": key,
        "name": name,
        "category": category,  # strength | core | power | cardio | speed | mobility
        "kind": kind,  # sets | timed
        "main": main,
        "helper": helper,
        "equipment": equipment,
        "compound": compound,
        "level": level,  # all | intermediate (hidden from beginner plans)
        "rep_unit": rep_unit,
    }


EXERCISES = [
    # chest
    _ex("bench_press", "Bench press", "strength", "sets", ["chest"], ["triceps", "shoulders"], "barbell", True),
    _ex("incline_db_press", "Incline dumbbell press", "strength", "sets", ["chest"], ["shoulders", "triceps"], "dumbbell", True),
    _ex("push_up", "Push-up", "strength", "sets", ["chest"], ["triceps", "shoulders", "core"], "bodyweight", True),
    _ex("cable_fly", "Cable fly", "strength", "sets", ["chest"], ["shoulders"], "machine"),
    _ex("dips", "Dips", "strength", "sets", ["chest", "triceps"], ["shoulders"], "bodyweight", True, "intermediate"),
    # shoulders
    _ex("overhead_press", "Overhead press", "strength", "sets", ["shoulders"], ["triceps", "core"], "barbell", True),
    _ex("lateral_raise", "Lateral raise", "strength", "sets", ["shoulders"], [], "dumbbell"),
    _ex("face_pull", "Face pull", "strength", "sets", ["shoulders"], ["back"], "machine"),
    # back
    _ex("pull_up", "Pull-up", "strength", "sets", ["back"], ["biceps", "forearms"], "bodyweight", True, "intermediate"),
    _ex("lat_pulldown", "Lat pulldown", "strength", "sets", ["back"], ["biceps", "forearms"], "machine", True),
    _ex("barbell_row", "Barbell row", "strength", "sets", ["back"], ["biceps", "forearms", "core"], "barbell", True),
    _ex("seated_row", "Seated cable row", "strength", "sets", ["back"], ["biceps", "forearms"], "machine", True),
    _ex("db_row", "One-arm dumbbell row", "strength", "sets", ["back"], ["biceps", "forearms"], "dumbbell", True),
    _ex("deadlift", "Deadlift", "strength", "sets", ["back", "glutes", "hamstrings"], ["quads", "forearms", "core"], "barbell", True, "intermediate"),
    # arms
    _ex("db_curl", "Dumbbell curl", "strength", "sets", ["biceps"], ["forearms"], "dumbbell"),
    _ex("hammer_curl", "Hammer curl", "strength", "sets", ["biceps"], ["forearms"], "dumbbell"),
    _ex("triceps_pushdown", "Triceps pushdown", "strength", "sets", ["triceps"], [], "machine"),
    _ex("overhead_triceps", "Overhead triceps extension", "strength", "sets", ["triceps"], ["shoulders"], "dumbbell"),
    _ex("wrist_curl", "Wrist curl", "strength", "sets", ["forearms"], [], "dumbbell"),
    # core
    _ex("plank", "Plank", "core", "sets", ["core"], ["shoulders", "glutes"], "bodyweight", False, "all", "sec"),
    _ex("hanging_knee_raise", "Hanging knee raise", "core", "sets", ["core"], ["forearms"], "bodyweight"),
    _ex("cable_crunch", "Cable crunch", "core", "sets", ["core"], [], "machine"),
    _ex("russian_twist", "Russian twist", "core", "sets", ["core"], [], "bodyweight"),
    _ex("ab_wheel", "Ab wheel rollout", "core", "sets", ["core"], ["shoulders"], "equipment", False, "intermediate"),
    # legs
    _ex("back_squat", "Back squat", "strength", "sets", ["quads", "glutes"], ["hamstrings", "core"], "barbell", True),
    _ex("goblet_squat", "Goblet squat", "strength", "sets", ["quads", "glutes"], ["core"], "dumbbell", True),
    _ex("leg_press", "Leg press", "strength", "sets", ["quads"], ["glutes", "hamstrings"], "machine", True),
    _ex("lunges", "Walking lunges", "strength", "sets", ["quads", "glutes"], ["hamstrings", "core"], "dumbbell", True),
    _ex("bulgarian_split_squat", "Bulgarian split squat", "strength", "sets", ["quads", "glutes"], ["hamstrings", "core"], "dumbbell", True, "intermediate"),
    _ex("romanian_deadlift", "Romanian deadlift", "strength", "sets", ["hamstrings", "glutes"], ["back", "forearms"], "barbell", True),
    _ex("leg_curl", "Leg curl", "strength", "sets", ["hamstrings"], [], "machine"),
    _ex("leg_extension", "Leg extension", "strength", "sets", ["quads"], [], "machine"),
    _ex("hip_thrust", "Hip thrust", "strength", "sets", ["glutes"], ["hamstrings", "core"], "barbell"),
    _ex("calf_raise", "Standing calf raise", "strength", "sets", ["calves"], [], "machine"),
    _ex("box_jumps", "Box jumps", "power", "sets", ["quads", "glutes"], ["calves", "hamstrings"], "bodyweight", True),
    # cardio / speed / mobility (timed)
    _ex("running", "Easy run", "cardio", "timed", ["quads", "hamstrings", "calves"], ["glutes", "core"], "none"),
    _ex("interval_sprints", "Interval sprints", "speed", "timed", ["quads", "hamstrings", "glutes"], ["calves", "core"], "none", False, "intermediate"),
    _ex("jump_rope", "Jump rope", "cardio", "timed", ["calves"], ["quads", "shoulders"], "equipment"),
    _ex("rowing_machine", "Rowing machine", "cardio", "timed", ["back", "quads"], ["biceps", "hamstrings", "core"], "machine"),
    _ex("cycling", "Stationary bike", "cardio", "timed", ["quads"], ["hamstrings", "calves", "glutes"], "machine"),
    _ex("agility_ladder", "Agility ladder drills", "speed", "timed", ["calves", "quads"], ["core"], "equipment"),
    _ex("mobility_flow", "Full-body mobility flow", "mobility", "timed", [], [], "none"),
    _ex("hip_mobility", "Hip & hamstring stretching", "mobility", "timed", [], [], "none"),
]
EXERCISE_BY_KEY = {e["key"]: e for e in EXERCISES}

# Session focus: used by the planner and by Gym Buddy requests.
FOCUSES = {
    "push": {"label": "Push (chest, shoulders, triceps)", "muscles": ["chest", "shoulders", "triceps"]},
    "pull": {"label": "Pull (back, biceps, forearms)", "muscles": ["back", "biceps", "forearms"]},
    "legs": {"label": "Legs (quads, hamstrings, glutes, calves)", "muscles": ["quads", "hamstrings", "glutes", "calves"]},
    "upper": {"label": "Upper body", "muscles": ["chest", "back", "shoulders", "biceps", "triceps"]},
    "full_body": {"label": "Full body", "muscles": ["chest", "back", "shoulders", "quads", "hamstrings", "glutes", "core"]},
    "core": {"label": "Core & mobility", "muscles": ["core"]},
    "cardio": {"label": "Cardio & conditioning", "muscles": []},
}
# Focuses the planner may choose on its own ("auto").
AUTO_FOCUSES = ["push", "pull", "legs", "core"]

# Training types a group can use for check-ins.
TRAINING_TYPES = {
    "endurance": {
        "label": "Endurance",
        "description": "Steady running, cycling or rowing to build stamina.",
        "exercises": ["running", "cycling", "rowing_machine", "jump_rope"],
    },
    "lower_strength": {
        "label": "Lower-body strength",
        "description": "Squats, lunges and hip hinges for strong, stable legs.",
        "exercises": ["back_squat", "romanian_deadlift", "lunges", "leg_press", "calf_raise"],
    },
    "upper_strength": {
        "label": "Upper-body strength",
        "description": "Presses and rows for chest, shoulders and back.",
        "exercises": ["bench_press", "overhead_press", "barbell_row", "lat_pulldown"],
    },
    "speed": {
        "label": "Speed & agility",
        "description": "Short sprints and footwork drills with full rest between reps.",
        "exercises": ["interval_sprints", "agility_ladder", "box_jumps"],
    },
    "power": {
        "label": "Power & jumping",
        "description": "Explosive lower-body work such as box jumps and jump rope.",
        "exercises": ["box_jumps", "jump_rope", "goblet_squat"],
    },
    "core": {
        "label": "Core stability",
        "description": "Trunk strength that helps every other lift and sport movement.",
        "exercises": ["plank", "hanging_knee_raise", "russian_twist", "cable_crunch"],
    },
    "mobility": {
        "label": "Mobility & recovery",
        "description": "Easy stretching and movement work to stay loose and avoid injury.",
        "exercises": ["mobility_flow", "hip_mobility"],
    },
    "hypertrophy": {
        "label": "Muscle building",
        "description": "Moderate-weight sets of 8–12 across all major muscle groups.",
        "exercises": ["incline_db_press", "seated_row", "leg_press", "db_curl", "triceps_pushdown"],
    },
    "conditioning": {
        "label": "Conditioning circuit",
        "description": "Mixed cardio and bodyweight rounds that raise heart rate.",
        "exercises": ["rowing_machine", "jump_rope", "push_up", "lunges"],
    },
}
TRAINING_TYPE_KEYS = list(TRAINING_TYPES)

SPORTS = {
    "football": {
        "label": "Football",
        "plan": [
            ("endurance", 2, "Football is mostly repeated running over 90 minutes."),
            ("lower_strength", 2, "Strong legs help with sprinting, kicking and staying injury-free."),
            ("speed", 1, "Short sprints and direction changes copy match movement."),
            ("mobility", 1, "Hips and hamstrings take a lot of load in training."),
        ],
    },
    "basketball": {
        "label": "Basketball",
        "plan": [
            ("power", 2, "Jumping power for rebounds and shots."),
            ("lower_strength", 2, "Leg strength supports landing and quick stops."),
            ("endurance", 1, "Stamina for fast-paced games."),
            ("core", 1, "A stable trunk helps contact and balance."),
        ],
    },
    "badminton": {
        "label": "Badminton",
        "plan": [
            ("speed", 2, "Fast footwork and recovery between shots."),
            ("lower_strength", 1, "Lunging strength for the court corners."),
            ("upper_strength", 1, "Shoulder and back strength for smashes."),
            ("endurance", 1, "Stamina for long rallies."),
            ("mobility", 1, "Shoulders and hips stay healthy."),
        ],
    },
    "volleyball": {
        "label": "Volleyball",
        "plan": [
            ("power", 2, "Jumping for blocks and spikes."),
            ("upper_strength", 1, "Shoulder strength for hitting."),
            ("lower_strength", 1, "Strong legs for repeated jumps."),
            ("core", 1, "Trunk control when swinging and landing."),
            ("mobility", 1, "Shoulder and ankle mobility."),
        ],
    },
    "running": {
        "label": "Running event",
        "plan": [
            ("endurance", 3, "Most of the training should be easy running."),
            ("lower_strength", 1, "Strength work reduces injury risk."),
            ("core", 1, "A stable trunk keeps form late in a run."),
            ("mobility", 1, "Keeps hips and calves loose."),
        ],
    },
    "other": {
        "label": "Other sport",
        "plan": [
            ("endurance", 1, "A base of stamina helps in any sport."),
            ("lower_strength", 1, "Leg strength carries over to most sports."),
            ("upper_strength", 1, "Upper-body strength for balance and contact."),
            ("core", 1, "Core stability for movement control."),
            ("mobility", 1, "Stay loose and recover well."),
        ],
    },
}

GOALS = {
    "sport_prep": {
        "label": "Get ready for a sport or competition",
        "needs_sport": True,
        "plan": None,  # depends on the sport
    },
    "fat_loss": {
        "label": "Lose body fat",
        "plan": [
            ("conditioning", 2, "Raises heart rate and calorie use."),
            ("lower_strength", 1, "Large muscles burn the most energy."),
            ("upper_strength", 1, "Keeps muscle while body fat drops."),
            ("endurance", 1, "Easy steady cardio on a lighter day."),
        ],
    },
    "muscle_gain": {
        "label": "Build muscle",
        "plan": [
            ("hypertrophy", 2, "Moderate-weight sets across the body."),
            ("upper_strength", 1, "Heavier pressing and pulling."),
            ("lower_strength", 1, "Heavier leg work."),
            ("core", 1, "Core strength supports bigger lifts."),
        ],
    },
    "strength": {
        "label": "Get stronger",
        "plan": [
            ("upper_strength", 2, "Heavy presses and rows."),
            ("lower_strength", 2, "Heavy squats and hinges."),
            ("mobility", 1, "Recovery between heavy days."),
        ],
    },
    "endurance_event": {
        "label": "Build stamina (fun run, 5K, 10K)",
        "plan": [
            ("endurance", 3, "Mostly easy running or cycling."),
            ("lower_strength", 1, "Strength keeps legs durable."),
            ("mobility", 1, "Helps recovery after long sessions."),
        ],
    },
    "general_fitness": {
        "label": "General fitness and health",
        "plan": [
            ("upper_strength", 1, "Basic upper-body strength."),
            ("lower_strength", 1, "Basic leg strength."),
            ("endurance", 1, "Heart and lung fitness."),
            ("core", 1, "Posture and back health."),
            ("mobility", 1, "Stay flexible."),
        ],
    },
}

DEFAULT_REPS = {
    # (compound, isolation) rep ranges by level
    "beginner": ("10–12", "12–15"),
    "intermediate": ("8–10", "10–15"),
    "advanced": ("5–8", "8–12"),
}
SETS_BY_LEVEL = {"beginner": 3, "intermediate": 3, "advanced": 4}


def group_plan(goal_key, sport=None):
    """The suggested week for a group goal: list of training-type blocks."""
    goal = GOALS[goal_key]
    if goal.get("needs_sport"):
        raw = SPORTS.get(sport or "other", SPORTS["other"])["plan"]
    else:
        raw = goal["plan"]
    plan = []
    for type_key, per_week, why in raw:
        t = TRAINING_TYPES[type_key]
        plan.append(
            {
                "type": type_key,
                "label": t["label"],
                "sessions_per_week": per_week,
                "why": why,
                "description": t["description"],
                "exercises": [
                    {"key": k, "name": EXERCISE_BY_KEY[k]["name"]} for k in t["exercises"]
                ],
            }
        )
    return plan


def public_library():
    return {
        "muscles": [{"key": k, "label": v} for k, v in MUSCLES],
        "exercises": EXERCISES,
        "focuses": [{"key": k, **v} for k, v in FOCUSES.items()],
        "training_types": [{"key": k, **v} for k, v in TRAINING_TYPES.items()],
        "goals": [
            {"key": k, "label": v["label"], "needs_sport": bool(v.get("needs_sport"))}
            for k, v in GOALS.items()
        ],
        "sports": [{"key": k, "label": v["label"]} for k, v in SPORTS.items()],
        "levels": LEVELS,
        "low_points_per_week": LOW_POINTS_PER_WEEK,
    }
