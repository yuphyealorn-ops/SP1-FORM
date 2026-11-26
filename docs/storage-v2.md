# Saved data format, version 2

FORM keeps everything in the browser's `localStorage` as one JSON document. Version 2 adds optional body-part measurements to each check-in (Feature A). Nothing else changes, and version 1 data is upgraded automatically.

Code: [`public/js/storage.js`](../public/js/storage.js) (format, migration) and [`public/js/metrics.js`](../public/js/metrics.js) (`BODY_PARTS`, validation ranges). Tests: [`tests/storage.test.js`](../tests/storage.test.js), [`tests/metrics.test.js`](../tests/metrics.test.js).

## Where it is stored

| Key | Holds | Written by |
| --- | --- | --- |
| `form:data` | Version 2 and every later version | This app |
| `gym-app:v1` | Version 1 | The app before this project. Read, upgraded, then removed at the first version 2 save |
| `gym-app:v1-backup` | The original version 1 text, unchanged, only if the upgrade dropped records | This app, at most once. Never read; deleted by "Clear all local data" |
| `gym-app:v2` | The vision prototype's own data, a different shape that includes workout `entries` | The prototype only. This app never reads, writes or removes it |

Export (Progress → Export your data) downloads the same JSON document.

## The document

```text
{
  version:  2
  profile:  the last entered profile, or null
  scans:    check-ins, oldest first (any order is accepted)
  workouts: logged sessions
}
```

### Check-in (an item of `scans`)

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | text, ≤ 120 chars | yes | unique within `scans` |
| `createdAt` | ISO timestamp | yes | stored in UTC |
| `profile` | object | yes | `age` (20–69), `heightCm` (120–230), `weightKg` (30–300), `waistCm` (45–200), `sex` (`male` or `female`, the RFM coefficient) |
| `metrics` | object | yes | RFM results. Recalculated from `profile` and must match, so they can't be edited by hand |
| `measurements` | object | **no, new in v2** | body-part measurements, see below |
| `pose` | object | no | `score` (0–100) and `visibleLandmarks` (0–9) from the framing check. Never the photo or landmarks |

### `measurements` (new in version 2)

Every key is optional. Values are numbers in centimetres.

| Key | Body part | Accepted range |
| --- | --- | --- |
| `chestCm` | Chest | 50 – 200 |
| `shouldersCm` | Shoulders | 60 – 200 |
| `upperArmLeftCm`, `upperArmRightCm` | Upper arm, left and right | 15 – 70 |
| `hipCm` | Hip | 50 – 200 |
| `thighLeftCm`, `thighRightCm` | Thigh, left and right | 25 – 100 |
| `calfLeftCm`, `calfRightCm` | Calf, left and right | 15 – 70 |

Waist is not in `measurements`. It stays in `profile.waistCm` because the RFM estimate needs it and version 1 already stored it there.

Rules:

1. **All optional.** Fields that weren't measured are left out, never stored as `null` or `""`.
2. **No empty object.** A check-in with no body-part measurements has no `measurements` key, so it looks exactly like a version 1 check-in.
3. **Strict when saving and exporting.** A value outside its range rejects the save with a message that names the body part (for example `Upper arm (L) must be between 15 and 70 cm.`). Typos never reach storage, and the saved data is left as it was.
4. **Lenient when loading.** If saved data contains an invalid value (for example, edited by hand), only that measurement is dropped. The check-in is kept.
5. **Unknown keys are stripped** on save, load and export (for example `neckCm`, or anything a photo could leak into). Photos and landmarks are never stored.
6. **Numbers, not strings.** Form input such as `"33.5"` is converted to `33.5` before saving.

The ranges are wide on purpose: they catch typing mistakes, not unusual bodies. See [measuring-guide.md](measuring-guide.md).

### Workout (an item of `workouts`)

Unchanged from version 1: `id`, `createdAt`, `title` (≤ 160 chars), `exercises` (1–100, a count), `minutes` (1–600).

## Full example

This document is valid version 2 data; a test loads it. It has one version 1–style check-in, one check-in with body-part measurements, and one workout.

```json
{
  "version": 2,
  "profile": { "age": 21, "heightCm": 172, "weightKg": 68.9, "waistCm": 79.5, "sex": "male" },
  "scans": [
    {
      "id": "c3a1f2d0-0001",
      "createdAt": "2026-11-02T01:30:00.000Z",
      "profile": { "age": 21, "heightCm": 172, "weightKg": 68.5, "waistCm": 80, "sex": "male" },
      "metrics": {
        "bmi": 23.154407787993513,
        "bodyFatPercent": 21,
        "fatMassKg": 14.385,
        "leanMassKg": 54.115,
        "waistHeightRatio": 0.46511627906976744,
        "method": "rfm",
        "source": "tape-measurements"
      },
      "pose": { "score": 100, "visibleLandmarks": 9 }
    },
    {
      "id": "c3a1f2d0-0002",
      "createdAt": "2026-11-30T01:30:00.000Z",
      "profile": { "age": 21, "heightCm": 172, "weightKg": 68.9, "waistCm": 79.5, "sex": "male" },
      "metrics": {
        "bmi": 23.28961600865333,
        "bodyFatPercent": 20.729559748427675,
        "fatMassKg": 14.28266666666667,
        "leanMassKg": 54.617333333333335,
        "waistHeightRatio": 0.4622093023255814,
        "method": "rfm",
        "source": "tape-measurements"
      },
      "measurements": {
        "chestCm": 96.5,
        "shouldersCm": 114,
        "upperArmLeftCm": 31.5,
        "upperArmRightCm": 32,
        "thighLeftCm": 54,
        "thighRightCm": 54.5
      }
    }
  ],
  "workouts": [
    { "id": "w-0001", "createdAt": "2026-11-28T10:00:00.000Z", "title": "Upper body focus", "exercises": 5, "minutes": 35 }
  ]
}
```

## Migration from version 1

Version 1 is the format of the app before this project: the same document without `measurements`, with `"version": 1`, under the key `gym-app:v1`.

1. **When loading**, the app reads `form:data`, or `gym-app:v1` if that is empty. The parsed data goes through `migrate()`, which runs one step per version until it reaches the current version, then through validation.
2. **Step v1 → v2** (`MIGRATIONS[1]`) only sets `"version": 2`. Every new field is optional, so every version 1 check-in is already a valid version 2 check-in.
3. **When the app starts**, `upgradeSavedState()` saves the upgraded copy under `form:data`. This happens once; later starts find version 2 and do nothing. The upgrade uses the same checks as normal loading, so it drops only records the app would ignore anyway (malformed or out of range).
4. **Nothing is lost.** The first save to `form:data` removes `gym-app:v1`. If the upgrade dropped any profile, check-in or workout (or couldn't read the text), the original text is first copied, unchanged, to `gym-app:v1-backup`. If that copy can't be written, `gym-app:v1` stays where it is. When nothing was dropped, no backup is kept, so a check-in deleted later leaves no copy behind. "Clear all local data" deletes the backup as well.
5. **Later saves never touch `gym-app:v1`.** If a tab still running the old app writes there after the upgrade, that data stays; it is not deleted without being seen. (It isn't shown in FORM either. The original version 1 code no longer exists, so this is unlikely.)
6. **If the upgrade can't be saved** (for example, storage is full), the app still shows the upgraded data and tells the user. The version 1 copy stays in place, and the upgrade is tried again at the next start.

Why version 2 uses a new key: the version 1 app has no check for newer data. If version 2 data were saved under `gym-app:v1`, a tab still running the old app would treat it as invalid, show nothing, and overwrite it on its next save.

Why not `gym-app:v2`: the vision prototype already uses that key for a different shape, so this app never reads, writes or deletes it. Both apps do read `gym-app:v1`, though. On the same port (both default to 8000), whichever app saves first takes the version 1 data. The prototype deletes it, while FORM upgrades it. If you still have version 1 data you care about, open FORM first, or run the prototype on another port (`python3 app.py --port 8001`).

## Data from a newer version

If `form:data` holds a version newer than the app knows (for example, a tab left open from before an update), the app says so as it opens, shows empty data, and refuses to save or clear, with the message *"Saved data comes from a newer version of FORM. Reload the latest app before saving so it is not overwritten."* The newer data is never touched. A version stored as digits in text (`"3"`) counts as newer too. Anything else that isn't a whole number, such as `"0x10"`, is treated as invalid data, not as newer, so junk can't block saving forever. Another open tab gets the same warning when a newer build saves. Because every build from version 2 on has this check, later versions keep the `form:data` key.

## Adding version 3 (planned for Week 4: exercises in the workout log)

1. Set `SCHEMA_VERSION = 3` in `storage.js`.
2. Add `MIGRATIONS[2]`, turning version 2 data into version 3 (for example, marking existing free-text workouts as unmapped).
3. Extend validation for the new fields: strict when saving, lenient when loading.
4. Add tests showing that a version 1 document and a version 2 document both load as version 3, and update this file (or add `storage-v3.md`).

Exports from older versions are just older documents. If an import feature is added later, imported files must go through `migrate()` too.
