# FORM

A gym web app for university students: plan workouts around your timetable (including the walk to the gym), track your body privately, train with a group and find a gym buddy.

## Group Member
- Chanyuphyea Lorn
- Wai Yan Min
- Shraman Shakya

## What it does

| Area | What you get |
|---|---|
| **Location-aware planner** | Finds every gap in your day. Workout length = gap − walk there − walk back − 10 min changing − 5 min spare, so a 2-hour break with a gym 15 min away gives a 75-minute workout that still gets you back before class. |
| **Fitness groups** | Create or join with an invite code around a shared goal (e.g. football competition prep). The app suggests training types (endurance, lower-body strength, speed, mobility) with weekly session counts. |
| **Group check-ins and sharing** | Check in after sessions, share workout plans (from your own log) and resources, see weekly progress and streaks for every member. |
| **Gym buddy** (replaces "sports meetup") | Post a training session; others see open sessions ranked 0–100 by timetable and walking-time fit (35), gym (25), muscles they have neglected (25) and level (15), with the reasons shown. |
| **Body measurements** | Weight, waist, hip, chest, shoulders, upper arm L/R, thigh L/R, calf L/R. BMI, relative fat mass, waist-to-hip, per-part charts and change since start. |
| **Muscle map** | Every logged set earns muscle points (1 per set for main muscles, 0.5 for helpers). Front and back body heatmap, under-trained muscles flagged, and a "training vs body change" view that puts weekly points next to a measurement. |

Body measurements are stored only in your browser. The server never receives them.

Not included: before/after pose photos (stretch goal).

## Run it

Needs Python 3.11+ only. No packages to install.

```
python3 app.py --seed        # --seed adds demo accounts: mali, ken, soe (password: demo-pass-1)
```

Open http://127.0.0.1:8000. Without `--seed` you start with just the campus places and register your own account.
Options: `--port`, `--host`, `--db FILE`, `--secure-cookies` (use behind HTTPS), `--verbose`.

## Tests

```
python3 -m unittest discover -s tests -t .     # logic + API (25 tests)
node --test tests/js/*.test.js                  # measurement maths (5 tests)
pip install playwright && playwright install chromium
python3 scripts/e2e.py --shots shots            # full browser journey with screenshots
```

## How it is built

- **Back end:** Python standard library only. `http.server`, SQLite (WAL, foreign keys, schema versioning), scrypt password hashing.
- **Front end:** plain JavaScript modules, no build step, no CDN. Charts and the body map are hand-drawn SVG.
- `form/planner.py` travel-aware planner · `form/matching.py` buddy scoring · `form/progress.py` muscle points · `form/library.py` exercises, goals, training types.

## Security notes

- Sessions use an HttpOnly, SameSite=Lax cookie; only a hash of the token is stored.
- State-changing requests need an `X-Requested-With: form` header (CSRF defence) and JSON bodies up to 64 KB.
- Login is rate limited (8 failures per 10 minutes) and does not reveal whether a username exists.
- Strict Content-Security-Policy (`default-src 'self'`), no inline scripts or styles; user text is never inserted as HTML.
- Groups are invisible to non-members; timetables, workouts and check-ins are private to their owner.
- Demo passwords are for local use only. Do not deploy with `--seed`.

## Known limits

- Walking times are shared by everyone and entered by hand; unknown pairs are assumed to be 10 minutes and flagged as estimates.
- Times are campus-local (Asia/Bangkok, set in `form/config.py`).
- No email, password reset or push notifications.
