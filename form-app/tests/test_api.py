import unittest

from .helpers import ApiCase


class AuthTests(ApiCase):
    def test_register_login_logout(self):
        c = self.signup("alice")
        self.assertEqual(c.get("/api/me")[1]["user"]["username"], "alice")
        c.post("/api/auth/logout")
        self.assertIsNone(c.get("/api/me")[1]["user"])
        s, _ = c.post("/api/auth/login", {"username": "ALICE", "password": "correct-horse-1"})
        self.assertEqual(s, 200)

    def test_duplicate_and_weak(self):
        self.signup("bob")
        s, d = self.client().post("/api/auth/register", {"username": "bob", "password": "correct-horse-1"})
        self.assertEqual(s, 409)
        s, d = self.client().post("/api/auth/register", {"username": "carl", "password": "short"})
        self.assertEqual((s, "password" in d["error"]["fields"]), (422, True))

    def test_bad_login_is_generic_and_limited(self):
        self.signup("dora")
        c = self.client()
        s, d = c.post("/api/auth/login", {"username": "dora", "password": "nope-nope-1"})
        self.assertEqual(s, 401)
        s2, d2 = c.post("/api/auth/login", {"username": "ghost", "password": "nope-nope-1"})
        self.assertEqual(d["error"]["message"], d2["error"]["message"])
        for _ in range(10):
            s, _ = c.post("/api/auth/login", {"username": "dora", "password": "nope-nope-1"})
        self.assertEqual(s, 429)
        from form.security import RateLimiter
        self.app.login_limiter = RateLimiter(8, 600)  # do not leak into other tests

    def test_requires_auth_and_csrf_header(self):
        c = self.client()
        self.assertEqual(c.get("/api/timetable")[0], 401)
        s, _ = c.call("POST", "/api/auth/login", {"username": "a", "password": "b"}, headers={"X-Requested-With": None})
        self.assertEqual(s, 403)

    def test_bad_bodies(self):
        c = self.client()
        self.assertEqual(c.call("POST", "/api/auth/login", raw=b"{not json")[0], 400)
        self.assertEqual(c.call("POST", "/api/auth/login", raw=b"[]")[0], 422)
        self.assertEqual(c.call("POST", "/api/auth/login", headers={"Content-Type": "text/plain"}, raw=b"x")[0], 415)
        self.assertEqual(c.call("POST", "/api/auth/login", raw=b"x" * 70000)[0], 413)
        self.assertEqual(c.get("/api/nope")[0], 404)

    def test_delete_account_needs_password(self):
        c = self.signup("erin")
        self.assertEqual(c.delete("/api/me", {"password": "wrong-pass-1"})[0], 403)
        self.assertEqual(c.delete("/api/me", {"password": "correct-horse-1"})[0], 200)
        self.assertIsNone(c.get("/api/me")[1]["user"])

    def test_static_is_confined(self):
        c = self.client()
        self.assertEqual(c.get("/")[0], 200)
        for p in ("/../app.py", "/%2e%2e/app.py", "/..%2fapp.py", "/.hidden"):
            self.assertEqual(c.get(p)[0], 404, p)


class DataTests(ApiCase):
    def test_timetable_is_private(self):
        a, b = self.signup("fay"), self.signup("gus")
        s, d = a.post("/api/timetable", {"weekday": 0, "start": "09:00", "end": "11:00", "title": "Maths"})
        self.assertEqual(s, 201)
        self.assertEqual(b.get("/api/timetable")[1]["classes"], [])
        self.assertEqual(b.delete(f"/api/timetable/{d['id']}")[0], 404)
        self.assertEqual(a.post("/api/timetable", {"weekday": 0, "start": "11:00", "end": "10:00", "title": "x"})[0], 422)

    def test_workout_log_progress_and_privacy(self):
        a, b = self.signup("hal"), self.signup("ivy")
        s, w = a.post("/api/workouts", {"performed_on": "2026-11-24", "duration_min": 50, "entries": [
            {"exercise_key": "bench_press", "sets": 4, "reps": 8, "weight_kg": 50},
            {"exercise_key": "custom", "name": "Cable fly", "main": ["chest"], "sets": 3, "reps": 12}]})
        self.assertEqual(s, 201, w)
        self.assertEqual(w["points"]["chest"], 7)
        pts = a.get("/api/progress/muscles?days=7")[1]
        self.assertEqual(pts["points"]["chest"], 7)
        self.assertIn("quads", pts["low"])
        self.assertEqual(b.get("/api/progress/muscles?days=7")[1]["points"]["chest"], 0)
        self.assertEqual(b.delete(f"/api/workouts/{w['id']}")[0], 404)
        self.assertEqual(a.post("/api/workouts", {"performed_on": "2026-12-30", "duration_min": 30, "entries": [{"exercise_key": "push_up", "sets": 1, "reps": 5}]})[0], 422)
        self.assertEqual(a.post("/api/workouts", {"performed_on": "2026-11-24", "duration_min": 30, "entries": [{"exercise_key": "nope", "sets": 1, "reps": 5}]})[0], 422)
        self.assertEqual(len(a.get("/api/progress/weekly?weeks=4")[1]["weeks"]), 4)

    def test_planner_uses_travel(self):
        c = self.signup("jon")
        places = c.get("/api/places")[1]
        gym = next(p for p in places["places"] if p["kind"] == "gym")
        bld = next(p for p in places["places"] if p["kind"] == "building")
        self.assertEqual(c.put("/api/travel", {"a_id": gym["id"], "b_id": bld["id"], "minutes": 15})[0], 200)
        for start, end in (("09:00", "11:00"), ("13:00", "15:00")):
            c.post("/api/timetable", {"weekday": 0, "start": start, "end": end, "title": "Class", "place_id": bld["id"]})
        s, d = c.get(f"/api/planner/day?date=2026-11-30&gym_id={gym['id']}")
        self.assertEqual(s, 200, d)
        mid = next(g for g in d["gaps"] if g["kind"] == "between")
        self.assertEqual((mid["travel_to"], mid["travel_back"], mid["workout_minutes"]), (15, 15, 75))
        self.assertEqual(c.get("/api/planner/day?date=2026-11-30")[0], 422)  # no gym chosen yet


class GroupTests(ApiCase):
    def test_group_flow_and_privacy(self):
        a, b, outsider = self.signup("kim"), self.signup("lou"), self.signup("max")
        s, g = a.post("/api/groups", {"name": "Cup prep", "goal_key": "sport_prep", "sport": "football", "weekly_target": 3})
        self.assertEqual(s, 201, g)
        self.assertEqual(a.post("/api/groups", {"name": "x", "goal_key": "sport_prep"})[0], 422)
        self.assertEqual(b.post("/api/groups/join", {"invite_code": g["invite_code"].lower()})[0], 201)
        self.assertEqual(b.post("/api/groups/join", {"invite_code": "NOSUCH99"})[0], 404)
        gid = g["id"]
        d = b.get(f"/api/groups/{gid}")[1]
        self.assertIsNone(d["invite_code"])  # only the owner sees it
        self.assertEqual({p["type"] for p in d["plan"]}, {"endurance", "lower_strength", "speed", "mobility"})
        self.assertEqual(outsider.get(f"/api/groups/{gid}")[0], 404)
        self.assertEqual(outsider.post(f"/api/groups/{gid}/checkins", {"session_type": "speed", "duration_min": 30})[0], 404)
        s, c = b.post(f"/api/groups/{gid}/checkins", {"session_type": "speed", "duration_min": 30, "performed_on": "2026-11-25"})
        self.assertEqual(s, 201, c)
        self.assertEqual(a.post(f"/api/groups/{gid}/checkins", {"session_type": "bogus", "duration_min": 30})[0], 422)
        self.assertEqual(a.delete(f"/api/groups/{gid}/checkins/{c['id']}")[0], 404)  # not hers
        prog = a.get(f"/api/groups/{gid}")[1]
        self.assertEqual(prog["progress"]["week_checkins"], 1)
        self.assertEqual(prog["progress"]["week_goal"], 6)
        s, p = b.post(f"/api/groups/{gid}/posts", {"kind": "resource", "title": "Drill video", "url": "https://example.com/v"})
        self.assertEqual(s, 201)
        self.assertEqual(b.post(f"/api/groups/{gid}/posts", {"kind": "resource", "title": "Bad", "url": "javascript:alert(1)"})[0], 422)
        self.assertEqual(a.delete(f"/api/groups/{gid}/posts/{p['id']}")[0], 200)  # owner may moderate
        self.assertEqual(b.delete(f"/api/groups/{gid}")[0], 403)
        self.assertEqual(a.post(f"/api/groups/{gid}/leave")[0], 200)  # ownership passes to lou
        self.assertEqual(b.get(f"/api/groups/{gid}")[1]["role"], "owner")

    def test_share_workout_as_plan(self):
        a = self.signup("nia")
        _, g = a.post("/api/groups", {"name": "Lifters", "goal_key": "muscle_gain"})
        _, w = a.post("/api/workouts", {"performed_on": "2026-11-24", "duration_min": 40, "entries": [{"exercise_key": "push_up", "sets": 3, "reps": 12}]})
        s, p = a.post(f"/api/groups/{g['id']}/posts", {"kind": "plan", "title": "My push day", "workout_id": w["id"]})
        self.assertEqual(s, 201, p)
        self.assertEqual(p["plan"]["exercises"][0]["name"], "Push-up")


class BuddyTests(ApiCase):
    def test_buddy_flow(self):
        host, guest, busy = self.signup("ola"), self.signup("pat"), self.signup("quin")
        gym = next(p for p in host.get("/api/places")[1]["places"] if p["kind"] == "gym")
        body = {"focus": "legs", "session_on": "2026-11-27", "start": "17:00", "duration_min": 60, "place_id": gym["id"], "slots": 1}
        self.assertEqual(host.post("/api/buddies", {**body, "session_on": "2026-11-20"})[0], 422)  # past
        s, r = host.post("/api/buddies", body)
        self.assertEqual(s, 201, r)
        found = guest.get("/api/buddies")[1]["sessions"]
        self.assertEqual([x["id"] for x in found], [r["id"]])
        self.assertIn("score", found[0]["match"])
        self.assertEqual(host.get("/api/buddies")[1]["sessions"], [])  # own sessions are not listed as open
        self.assertEqual(host.post(f"/api/buddies/{r['id']}/join")[0], 409)
        busy.post("/api/timetable", {"weekday": 4, "start": "16:30", "end": "18:00", "title": "Lab"})
        self.assertEqual(busy.post(f"/api/buddies/{r['id']}/join")[0], 409)  # clashes with a class
        self.assertEqual(guest.post(f"/api/buddies/{r['id']}/join")[0], 201)
        self.assertEqual(guest.post(f"/api/buddies/{r['id']}/join")[0], 409)
        self.assertEqual(self.signup("rae").post(f"/api/buddies/{r['id']}/join")[0], 409)  # full
        mine = host.get("/api/buddies/mine")[1]["sessions"][0]
        self.assertEqual([p["display_name"] for p in mine["partners"]], ["pat"])
        self.assertEqual(guest.post(f"/api/buddies/{r['id']}/cancel")[0], 403)
        self.assertEqual(host.post(f"/api/buddies/{r['id']}/cancel")[0], 200)
        self.assertEqual(guest.get("/api/buddies")[1]["sessions"], [])


if __name__ == "__main__":
    unittest.main()
