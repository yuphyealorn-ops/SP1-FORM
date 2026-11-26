# FORM: our gym app

Senior Project I · 2/2026

FORM helps AU students see how their training really changes their body, not just their weight. It adds body-part tape measurements (Feature A) and a muscle-group training map (Feature B), then shows how much each area was trained next to how that body part changed. It is free, and private: data stays in your browser.

**Status:** Week 1 of 12 is done. See [PROGRESS.md](PROGRESS.md) for what's finished and [FORM_Time_Plan.md](FORM_Time_Plan.md) for the plan.

## Team

- Wai Yan Min
- Shraman Shakya
- Chanyuphyea Lorn

## Run it

Requires Python 3.10+ and a modern browser. No packages to install.

```sh
python3 app.py          # then open http://localhost:8000
python3 app.py --open   # opens the browser for you
python3 app.py --port 8080
```

The server only listens on your own computer (`127.0.0.1`) and serves only `public/`. Open the app through it rather than opening `index.html` directly, so the camera works.

The pose scan downloads the MediaPipe model from a CDN on first use. To work offline, download it once with `python3 scripts/setup_models.py`.

## What it does today

- **Body check-in:** age, height, weight, waist and the RFM equation coefficient give an estimated body fat, fat mass, fat-free mass, BMI and waist-to-height ratio.
- **Pose scan:** camera or photo. A pretrained pose model checks that your whole body is in frame. Photos are never saved.
- **Progress:** weight and body-fat trend, check-in history, data export.
- **Training log:** templates or your own session (name, minutes, number of exercises).
- **Under the hood (Week 1):** saved-data format version 2 with optional body-part measurements, automatic upgrade of older data, and validation ranges that catch typos. The form fields for body parts arrive in Week 2.

All numbers are wellness estimates, not medical measurements. See the [model card](docs/model-card.md).

## Test it

Needs Node.js 20+ for the JavaScript tests.

```sh
npm test                # JavaScript and Python tests
npm run test:js         # node --test tests/*.test.js
npm run test:py         # python3 -m unittest discover -s tests -p "test_*.py"
npm run check           # syntax check of the browser modules
```

## Files

| Path | What it is |
| --- | --- |
| `app.py` | Local Python server (standard library only) |
| `public/js/app.js` | All views, routing and form handling |
| `public/js/metrics.js` | Input validation (including body-part ranges), RFM calculation, pose framing check |
| `public/js/storage.js` | Saved-data format, migrations, export |
| `public/js/scanner.js` | Camera/photo input and pose detection |
| `scripts/setup_models.py` | Optional offline model download |
| `tests/` | JavaScript (`node:test`) and Python (`unittest`) tests |
| `docs/measuring-guide.md` | Where and how to measure each body part |
| `docs/storage-v2.md` | Saved-data format and how older data is upgraded |
| `docs/code-review.md` | Week 1 code review and file ownership |
| `docs/model-card.md` | Models, equations, limits |
| `docs/project-notes.md` | Design decisions and data flow |

## Privacy

Photos and camera frames are processed in the browser and discarded. Check-ins and workouts are saved only in this browser's `localStorage`, which is not encrypted and is separate for each browser and port. Export your data before clearing browser data. There is no account, upload endpoint or analytics.

## Platform

FORM is a web app for now. A native iOS/Android app was the original idea and is still open: see "Open decisions" in [PROGRESS.md](PROGRESS.md).
