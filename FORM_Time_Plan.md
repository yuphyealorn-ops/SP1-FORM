# FORM — 12-Week Time Plan

**Before midterm:** Week 1–5 · 26 Nov – 30 Dec 2026
**After midterm:** Week 6–12 · 12 Jan – 28 Feb 2027

---

## 🟠 Before Midterm (26 Nov – 30 Dec 2026)
Goal: Feature A (body-part measurements) fully working, and the exercise library ready for Feature B.

### 🧱 Week 1 (26 Nov – 2 Dec): Groundwork & Data Format
- [ ] Review current code (app.py, scanner.js, metrics.js, storage.js) and agree on who owns which file — review done ([docs/code-review.md](docs/code-review.md)); ownership still to be agreed by the team
- [x] Design storage v2 data format for check-ins ([docs/storage-v2.md](docs/storage-v2.md))
    - [x] New fields: chest, shoulders, upper arm L/R, hip, thigh L/R, calf L/R
    - [x] All new fields optional (old check-ins stay valid)
- [x] Write migration: v1 saved data → v2 automatically on load
- [x] Add validation ranges for each new measurement in metrics.js (catch typos like 350 cm)
- [x] Write measuring guide text (where to put the tape for each body part) ([docs/measuring-guide.md](docs/measuring-guide.md))

### 📏 Week 2 (3 – 9 Dec): Feature A — Check-in Form
- [ ] Add new measurement fields to the check-in form
    - [ ] Left / right inputs for arm, thigh, calf
    - [ ] Short "where to measure" hint under each field
- [ ] Show validation messages inline (out of range, empty)
- [ ] Save new fields with each check-in and include them in data export
- [x] Unit tests: validation ranges + v1 → v2 migration (done early, in Week 1)

### 📈 Week 3 (10 – 16 Dec): Feature A — Progress Charts
- [ ] Trend line chart for each body part over time
- [ ] "Change since start" number for each body part (+/− cm)
- [ ] Left vs. right comparison for arm, thigh, calf
- [ ] Empty states (e.g. "Add 2 check-ins to see a trend")
- [ ] Test: old check-ins still load and display correctly

### 🏋️ Week 4 (17 – 23 Dec): Feature B — Exercise Library (exercises.js)
- [ ] Create exercises.js with ~40 common exercises
    - [ ] Each exercise: main muscle(s) + helper muscle(s)
    - [ ] Muscle groups: chest, shoulders, biceps, triceps, forearms, back, core, quads, hamstrings, glutes, calves
- [ ] Update workout log: pick an exercise from the list (search by name)
- [ ] Keep a "custom exercise" option (user picks the muscles)
- [ ] Mark old free-text workout entries as unmapped

### 🎯 Week 5 (24 – 30 Dec): Midterm Checkpoint
- [ ] Manual test of Feature A end to end (check-in → save → charts → export)
- [ ] Fix bugs found during testing
- [ ] Update README with the new measurement features
- [ ] Prepare midterm report and demo
- [ ] ✔ Midterm milestone: Feature A complete + exercise library ready

---

## 🟢 After Midterm (12 Jan – 28 Feb 2027)
Goal: finish Feature B, combine A + B, test with AU students, and deliver the final app.

### 🔥 Week 6–7 (12 – 25 Jan): Feature B — Muscle Points & Body Map (progress.js)
- [ ] Apply midterm feedback from our advisor
- [ ] Create progress.js: weekly points per muscle group
    - [ ] Main muscle = 1 point per set, helper = 0.5 points per set
- [ ] SVG body map (front view) coloured by points: high / medium / low
- [ ] Bar chart: points per muscle group this week
- [ ] Low-training insight message (e.g. a muscle group under 4 points this week)
- [ ] Unit tests: point calculation with sample workouts

### 🔗 Week 8–9 (26 Jan – 8 Feb): Combining A + B — Training vs. Body Change
- [ ] Map muscle groups to body measurements
    - [ ] Chest → chest
    - [ ] Upper arm → biceps + triceps
    - [ ] Thigh → quads + hamstrings
    - [ ] Calf → calves
    - [ ] Shoulders → shoulders
- [ ] Combined view: average training per week next to measurement change for each area
- [ ] Period selector (last 4 / 8 / 12 weeks)
- [ ] Clear note in the UI: "this shows a pattern, not proof"
- [ ] (Optional) Simple overall progress summary card

### 🧪 Week 10 (9 – 15 Feb): Testing with AU Students
- [ ] Recruit 5–8 AU students to try the app
- [ ] Short feedback form (ease of measuring, clarity of charts and body map)
- [ ] Collect and group the feedback by problem

### 🎨 Week 11 (16 – 22 Feb): Fixes & UI Polish
- [ ] Fix the most common problems from student feedback
- [ ] Make all major views responsive (laptop + phone browser)
- [ ] Add loading indicators and error states
- [ ] (Stretch) Pose-guided before/after photo comparison using landmarks

### ✅ Week 12 (23 – 28 Feb): Final Testing, Documentation & Demo
- [ ] Manual test of every major flow (check-in → charts → workout log → body map → combined view)
- [ ] All automated tests passing
- [ ] Privacy check: photos never saved, data stays in the browser
- [ ] Update README, model card and measuring guide
- [ ] Final report and demo video

---

### ⏱️ Buffer & Priorities
- If we fall behind, cut in this order: before/after photos → overall summary card → period selector.
- Must-have by midterm: Feature A complete. Must-have by Week 9: Feature B + combined view.
- The 31 Dec – 11 Jan break is not counted. Use it only to catch up if needed.
