# FORM: progress log

What has been done, update by update. The plan itself is in [FORM_Time_Plan.md](FORM_Time_Plan.md).

**How to add an update:** add a new entry at the top of the log with the date and plan week, what was done (with links), how it was checked, any decisions, and what's next. Tick the matching boxes in the time plan, and update the status table and open decisions below.

## Status

| Week | Dates | Focus | Status |
| --- | --- | --- | --- |
| 1 | 26 Nov – 2 Dec | Groundwork & data format | ✅ Done. File ownership still to be agreed |
| 2 | 3 – 9 Dec | Feature A: check-in form | ⏭️ Next. Unit tests already done |
| 3 | 10 – 16 Dec | Feature A: progress charts | Not started |
| 4 | 17 – 23 Dec | Feature B: exercise library | Not started |
| 5 | 24 – 30 Dec | Midterm checkpoint | Not started |
| 6–7 | 12 – 25 Jan | Feature B: muscle points & body map | Not started |
| 8–9 | 26 Jan – 8 Feb | Combining A + B | Not started |
| 10 | 9 – 15 Feb | Testing with AU students | Not started |
| 11 | 16 – 22 Feb | Fixes & UI polish | Not started |
| 12 | 23 – 28 Feb | Final testing, docs & demo | Not started |

## Open decisions

Questions the team needs to settle, with the deadline that matters.

1. **Students under 20. Settle before Week 2.** The RFM equation is limited to ages 20–69, so 18–19-year-olds currently can't save any check-in. Option (b) in [code review finding 1](docs/code-review.md#1-students-under-20-cant-save-a-check-in-decide-before-week-2) lets them save weight and body-part measurements without the body-fat estimate. That changes the data format and needs a version bump, so decide before Week 2 builds the form.
2. **File ownership. Settle in Week 1.** Fill in the names in the [ownership table](docs/code-review.md#proposed-ownership).
3. **Web or mobile app. Settle by Week 6.** FORM is a web app for now. The original idea was a native iOS/Android app. Options, from least to most work:
   - stay a responsive web app (phone browsers are already planned for Week 11);
   - make it installable on phones as a PWA (add a manifest and an offline cache);
   - wrap the same web code into App Store / Play Store apps with Capacitor (the camera and pose model in a WebView need testing);
   - rewrite in React Native or Flutter (the UI would be redone).

   Whatever is chosen, keep `metrics.js`, `storage.js` and the coming `exercises.js` and `progress.js` free of page/DOM code so they can be reused. Week 10 student testing needs the app reachable from phones anyway ([finding 4](docs/code-review.md#4-phones-cant-reach-the-app-yet)), so decide before then.

## Log

### 2026-11-26 · Week 1 (26 Nov – 2 Dec): groundwork & data format

**Starting point.** Imported the current app from the local `gym-app-demo` folder (only its README is on GitHub). The demo also contains prototype screens for Weeks 2–9: body-part charts, the exercise list, and the muscle map. Those were **left out on purpose**, so this repo grows week by week with the plan, and the demo stays as the vision reference. Details are in [docs/code-review.md](docs/code-review.md#what-came-into-this-repo).

**Done**

- **Code review and proposed file ownership:** [docs/code-review.md](docs/code-review.md). It has six findings; the most urgent is that under-20 students can't save check-ins. Names in the ownership table are still to be filled in.
- **Data format version 2:** [docs/storage-v2.md](docs/storage-v2.md). Each check-in gets an optional `measurements` object: chest, shoulders, hip, and upper arm, thigh and calf for left and right, all in cm. Blank fields aren't stored, so a check-in without measurements is identical to a version 1 check-in. Workouts are unchanged; exercises come in version 3 (Week 4).
- **Migration v1 → v2:** `migrate()` in [public/js/storage.js](public/js/storage.js) runs one step per version. At startup, data under the old key `gym-app:v1` is upgraded and saved once under `form:data`, and the old key is removed. If the upgrade had to drop a record, the original text is first kept as `gym-app:v1-backup`, which "Clear all local data" also deletes. Data from a newer version is never overwritten, and the app says so when it opens. The prototype's `gym-app:v2` key is never touched.
- **Validation ranges:** `BODY_PARTS` in [public/js/metrics.js](public/js/metrics.js). Ranges are wide enough for real bodies and catch typos (a 350 cm arm, a missing or misplaced decimal point, many values typed in inches). `normalizeMeasurement(id, value)` checks a single field, ready for inline messages in Week 2.
- **Measuring guide:** [docs/measuring-guide.md](docs/measuring-guide.md) covers general rules, where to put the tape for every body part, accepted ranges, and what the numbers can't tell you. The short form hints live in `BODY_PARTS`. Tests compare every hint and range row in the docs with `BODY_PARTS`, and fail if they drift apart.
- **Done early (Week 2 item):** unit tests for the validation ranges and the v1 → v2 migration.
- **Docs:** README rewritten for the project. The model card and project notes were updated to match what the app does in Week 1.

**What users see.** Nothing new yet: Week 1 is groundwork. The app has the current features (check-in with RFM estimate, pose scan, progress, training log). The body-part fields appear in Week 2.

**How it was checked**

- `npm test`: 54 JavaScript tests and 15 Python tests pass.
- Real browser (headless Chrome): data seeded as the old app saved it was upgraded at startup and the old key removed, and the prototype's key was left alone. All five views render. Logging a template session, logging a custom session, saving a check-in, exporting and "Clear all local data" all work. Newer-version data shows a warning. No console errors (22 of 22 checks).
- Phone-sized screen (390 px): no sideways scrolling on any view.
- Independent code review (a separate reviewer agent) found 1 important issue and 7 minor ones. What changed because of it:
  - Saves no longer delete version 1 data: only the first save retires it, keeping a backup whenever the upgrade had to drop something.
  - Data from a newer version is now flagged as the app opens and when another tab saves it. A version stored as digits in text (`"3"`) no longer slips past the check, and junk such as `"0x10"` can't block saving.
  - The doc-sync tests now compare row by row.
  - A re-review approved these fixes and raised three smaller points, all fixed: no backup is kept when nothing was dropped (so deleted check-ins don't linger), a partly failed "Clear all" reloads the screen, and the cross-tab warning was added.
  - Doc claims were corrected: prototype/FORM sharing the version 1 key, the under-20 option needing a version bump, the GitHub Pages notes, and features the measuring guide promised before they exist.
  - Not changed: corrupt `form:data` still hides version 1 data instead of falling back to it (only possible if someone edits storage by hand, and the version 1 data is no longer deleted in that case). Text such as `0x20` is still accepted as a number (the form can't send it; worth tightening if an import feature is added).

**Known limitation.** The original version 1 app's code no longer exists (the demo folder was changed in place, and its GitHub repo has only a README). So the version 1 test data is rebuilt from the format the demo's code accepts as version 1. If a teammate still has real version 1 data in a browser, export it and add it as a test fixture. Until then, an upgrade that has to drop records keeps the original as a backup, so it can't destroy it.

**Decisions**

- The new storage key is `form:data`, not `gym-app:v2`: the prototype already uses that key for a different shape, and sharing it could damage data when both run on the same port.
- Waist stays in the profile (RFM needs it), not in `measurements`.
- Version 1 data is never deleted without being upgraded or backed up, and later saves don't touch the version 1 key.
- Ranges reject typos, not unusual bodies: if a real value is rejected, the range is widened.

**Next: Week 2 (3 – 9 Dec)**

- Settle open decisions 1 and 2 first.
- Add the body-part fields to the check-in form: left/right inputs, the hint from `BODY_PARTS` under each field, and inline errors from `normalizeMeasurement`.
- Saving and export already handle `measurements`, so Week 2 only needs to pass the form values through.
- Optional groundwork from the review: split `app.js` into one module per view, and reformat `styles.css`.
