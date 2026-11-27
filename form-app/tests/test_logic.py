import unittest

from form.matching import fit_to_timetable, score_request
from form.planner import build_workout, choose_focus, merge_classes, plan_gaps
from form.progress import entry_points, low_muscles, points_by_muscle
from form.validation import Validator
from form.errors import ApiError

A, B, GYM = 1, 2, 10


def lookup_with(**kw):
    table = {(1, 10): 15, (2, 10): 8}
    return lambda a, b: 0 if a == b else table.get((min(a, b), max(a, b)))


class PlannerTests(unittest.TestCase):
    def test_two_hour_break_with_15_minute_gym(self):
        classes = [{"start": 540, "end": 660, "place_id": A}, {"start": 780, "end": 900, "place_id": A}]
        gaps = plan_gaps(classes, GYM, lookup_with())
        mid = [g for g in gaps if g["kind"] == "between"][0]
        # 120 - 15 - 15 - 10 buffer - 5 safety = 75
        self.assertEqual(mid["workout_minutes"], 75)
        self.assertEqual(mid["timeline"]["back"] + mid["timeline"]["spare"], 780)
        self.assertGreaterEqual(mid["timeline"]["spare"], 5)

    def test_short_gap_is_not_feasible(self):
        classes = [{"start": 540, "end": 600, "place_id": A}, {"start": 640, "end": 700, "place_id": A}]
        mid = [g for g in plan_gaps(classes, GYM, lookup_with()) if g["kind"] == "between"][0]
        self.assertFalse(mid["feasible"])
        self.assertEqual(mid["workout_minutes"], 0)

    def test_overlapping_classes_merge(self):
        m = merge_classes([{"start": 60, "end": 120}, {"start": 100, "end": 200}])
        self.assertEqual(len(m), 1)
        self.assertEqual(m[0]["end"], 200)

    def test_unknown_travel_is_flagged_as_estimate(self):
        classes = [{"start": 540, "end": 600, "place_id": 99}, {"start": 800, "end": 900, "place_id": 99}]
        mid = [g for g in plan_gaps(classes, GYM, lookup_with()) if g["kind"] == "between"][0]
        self.assertTrue(mid["estimated"])

    def test_workout_fits_budget_and_focus(self):
        for minutes in (20, 45, 75, 90):
            w = build_workout(minutes, "legs", "intermediate", seed=3)
            self.assertLessEqual(w["total_minutes"], minutes)
            self.assertTrue(w["exercises"])

    def test_focus_prefers_neglected_muscles(self):
        pts = {m: 10 for m in ["chest", "shoulders", "triceps", "back", "biceps", "forearms", "core"]}
        pts.update({"quads": 0, "hamstrings": 0, "glutes": 0, "calves": 0})
        self.assertEqual(choose_focus(pts)[0], "legs")


class ProgressTests(unittest.TestCase):
    def row(self, key, sets, reps=10, dur=None):
        return {"exercise_key": key, "sets": sets, "reps": reps, "duration_min": dur, "custom_main": None, "custom_helper": None}

    def test_main_full_helper_half(self):
        p = entry_points(self.row("bench_press", 3))
        self.assertEqual(p["chest"], 3)
        self.assertEqual(p["triceps"], 1.5)

    def test_low_muscles(self):
        pts = points_by_muscle([self.row("bench_press", 4)])
        self.assertIn("quads", low_muscles(pts))
        self.assertNotIn("chest", low_muscles(pts))


class MatchingTests(unittest.TestCase):
    def test_clash_and_tight(self):
        cls = [{"start": 600, "end": 660, "place_id": A, "title": "Maths"}]
        self.assertFalse(fit_to_timetable(cls, 630, 690, GYM, lookup_with())["fits"])
        tight = fit_to_timetable(cls, 662, 720, GYM, lookup_with())
        self.assertTrue(tight["tight"])
        self.assertTrue(fit_to_timetable(cls, 700, 760, GYM, lookup_with())["fits"])

    def test_score_range(self):
        viewer = {"level": "beginner", "default_gym_id": GYM, "classes": [], "low_muscles": ["quads"]}
        req = {"focus": "legs", "start": 600, "duration": 60, "place_id": GYM, "level": "any"}
        s = score_request(viewer, req, lookup_with())
        self.assertGreaterEqual(s["score"], 80)


class ValidatorTests(unittest.TestCase):
    def test_collects_errors(self):
        v = Validator({"a": "x", "n": 500})
        v.int("n", min=1, max=10)
        v.date("d")
        with self.assertRaises(ApiError) as cm:
            v.done()
        self.assertEqual(cm.exception.status, 422)
        self.assertEqual(set(cm.exception.fields), {"n", "d"})

    def test_rejects_bool_as_int(self):
        v = Validator({"n": True})
        v.int("n")
        with self.assertRaises(ApiError):
            v.done()


if __name__ == "__main__":
    unittest.main()
