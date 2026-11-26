import { calculateComposition, normalizeMeasurement, normalizeMeasurements, normalizeProfile, BODY_PARTS } from './metrics.js';

/**
 * Saved-data format. The full description, with examples, is in docs/storage-v2.md.
 *
 * Version 2 adds optional body-part measurements to each check-in. From version 2 on, data lives under one
 * stable key: every build since then refuses to overwrite data from a newer version, so later versions can
 * keep using the same key.
 *
 * Version 1 data lives under LEGACY_STORAGE_KEY and is upgraded automatically. It must never be overwritten
 * with version 2 data, because the version 1 build has no newer-version check and would discard it.
 * The first version 2 save removes the version 1 key (keeping its text under LEGACY_BACKUP_KEY only if the
 * upgrade dropped records); later saves never touch either key, and clearState deletes both.
 *
 * The vision prototype (gym-app-demo) stores a different "version 2" under "gym-app:v2". This app never reads,
 * writes or deletes that key. Both apps do read the version 1 key, so on the same port whichever saves first
 * takes the version 1 data.
 */
export const STORAGE_KEY = 'form:data';
export const LEGACY_STORAGE_KEY = 'gym-app:v1';
export const LEGACY_BACKUP_KEY = 'gym-app:v1-backup';
export const SCHEMA_VERSION = 2;

/**
 * One step per schema version: MIGRATIONS[n] turns version-n data into version n + 1.
 * Steps only reshape data. Validation runs afterwards, on the upgraded result.
 */
const MIGRATIONS = {
  // v1 -> v2: check-ins gain an optional `measurements` object. Every v1 record is already a valid v2 record
  // without it, so the records carry over unchanged.
  1: data => ({ ...data, version: 2 }),
};

export function emptyState() {
  return { version: SCHEMA_VERSION, profile: null, scans: [], workouts: [] };
}

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** True for data written by a newer FORM build (also when its version was stored as digits, such as "3"). */
function isNewer(data) {
  if (!object(data)) return false;
  const version = typeof data.version === 'string' && /^\s*\d+\s*$/.test(data.version) ? Number(data.version) : data.version;
  return Number.isInteger(version) && version > SCHEMA_VERSION;
}

/** Upgrade parsed data of any supported version to SCHEMA_VERSION. Throws for unknown or newer versions. */
export function migrate(data) {
  if (!object(data) || !Number.isInteger(data.version) || data.version < 1 || data.version > SCHEMA_VERSION) {
    throw new TypeError(`Gym data must use schema version 1 to ${SCHEMA_VERSION}.`);
  }
  let current = data;
  while (current.version < SCHEMA_VERSION) current = MIGRATIONS[current.version](current);
  return current;
}

function text(value, label, maxLength) {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength) {
    throw new TypeError(`${label} must be nonempty text of at most ${maxLength} characters.`);
  }
  return value.trim();
}

function date(value) {
  if (typeof value !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) ||
      !Number.isFinite(Date.parse(value))) {
    throw new TypeError('Record date must be a valid ISO timestamp.');
  }
  return new Date(value).toISOString();
}

function number(value, label, min, max, integer = false) {
  if (!Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
    throw new TypeError(`${label} must be ${integer ? 'an integer' : 'a number'} between ${min} and ${max}.`);
  }
  return value;
}

function profile(value) {
  const clean = normalizeProfile(value);
  calculateComposition(clean);
  return clean;
}

/** Keep each valid body-part measurement from saved data, dropping only the invalid ones. */
function lenientMeasurements(value) {
  if (!object(value)) return {};
  const clean = {};
  for (const { id } of BODY_PARTS) {
    try {
      const measurement = normalizeMeasurement(id, value[id]);
      if (measurement !== undefined) clean[id] = measurement;
    } catch { /* drop this measurement, keep the check-in */ }
  }
  return clean;
}

function scan(value, strict) {
  if (!object(value)) throw new TypeError('Scan must be an object.');
  const cleanProfile = profile(value.profile);
  const metrics = calculateComposition(cleanProfile);
  if (!object(value.metrics) || value.metrics.method !== 'rfm' || value.metrics.source !== 'tape-measurements') {
    throw new TypeError('Scan must contain measurement-based RFM metrics.');
  }
  for (const key of ['bmi', 'bodyFatPercent', 'fatMassKg', 'leanMassKg', 'waistHeightRatio']) {
    if (!Number.isFinite(value.metrics[key]) || Math.abs(value.metrics[key] - metrics[key]) > 1e-8) {
      throw new TypeError('Scan metrics do not match the recorded measurements.');
    }
  }
  const clean = {
    id: text(value.id, 'Scan id', 120),
    createdAt: date(value.createdAt),
    profile: cleanProfile,
    metrics,
  };
  if (value.measurements !== undefined && value.measurements !== null) {
    const measurements = strict ? normalizeMeasurements(value.measurements) : lenientMeasurements(value.measurements);
    // A check-in without body-part measurements has no `measurements` key, exactly like a v1 check-in.
    if (Object.keys(measurements).length) clean.measurements = measurements;
  }
  if (value.pose !== undefined && value.pose !== null) {
    if (!object(value.pose)) throw new TypeError('Pose summary must be an object.');
    clean.pose = {
      score: number(value.pose.score, 'Framing score', 0, 100, true),
      visibleLandmarks: number(value.pose.visibleLandmarks, 'Visible landmark count', 0, 9, true),
    };
  }
  return clean;
}

function workout(value) {
  if (!object(value)) throw new TypeError('Workout must be an object.');
  return {
    id: text(value.id, 'Workout id', 120),
    createdAt: date(value.createdAt),
    title: text(value.title, 'Workout title', 160),
    exercises: number(value.exercises, 'Exercise count', 1, 100, true),
    minutes: number(value.minutes, 'Workout minutes', 1, 600),
  };
}

/**
 * Strict mode (saving, exporting) throws on the first invalid value so a typo never reaches storage.
 * Lenient mode (loading) keeps every valid record and drops the rest.
 */
function normalizeState(value, strict) {
  let data;
  try { data = migrate(value); }
  catch (error) {
    if (strict) throw error;
    return emptyState();
  }
  const clean = emptyState();
  if (data.profile !== null && data.profile !== undefined) {
    try { clean.profile = profile(data.profile); }
    catch (error) { if (strict) throw error; }
  }
  for (const [field, validate] of [['scans', scan], ['workouts', workout]]) {
    if (!Array.isArray(data[field])) {
      if (strict) throw new TypeError(`${field} must be an array.`);
      continue;
    }
    const ids = new Set();
    for (const record of data[field]) {
      try {
        const normalized = validate(record, strict);
        if (ids.has(normalized.id)) throw new TypeError(`Duplicate ${field} id.`);
        ids.add(normalized.id);
        clean[field].push(normalized);
      } catch (error) {
        if (strict) throw error;
      }
    }
  }
  return clean;
}

/** Keep valid records from untrusted data, strip every unknown field, and upgrade to the current schema. */
export function sanitizeState(value) {
  return normalizeState(value, false);
}

/** Parsed saved data: the current key first, then the version 1 key. Null when absent or unreadable JSON. */
function readSaved(storage) {
  let raw;
  try {
    raw = storage.getItem(STORAGE_KEY);
    if (raw === null) raw = storage.getItem(LEGACY_STORAGE_KEY);
  }
  catch (error) { throw new Error('Unable to read saved gym data. Browser storage is unavailable.', { cause: error }); }
  if (raw === null) return null;
  try { return JSON.parse(raw); }
  catch { return null; }
}

/** Load and upgrade saved data in memory. Corrupt or unsupported data opens as an empty state. */
export function loadState(storage = globalThis.localStorage) {
  return sanitizeState(readSaved(storage));
}

/** The version of saved data written by a newer FORM build, or null. The app warns and will not save over it. */
export function newerSavedVersion(storage = globalThis.localStorage) {
  const data = readSaved(storage);
  return isNewer(data) ? Number(data.version) : null;
}

/**
 * Run once when the app starts. When the saved data is older than SCHEMA_VERSION, save the upgraded copy
 * under STORAGE_KEY. Returns the version it upgraded from, or null. It applies the same checks as loadState,
 * so it only drops records the app would ignore anyway; if it drops any, the original text is kept under
 * LEGACY_BACKUP_KEY.
 */
export function upgradeSavedState(storage = globalThis.localStorage) {
  const data = readSaved(storage);
  if (!object(data) || !Number.isInteger(data.version) || data.version < 1 || data.version >= SCHEMA_VERSION) {
    return null;
  }
  saveState(sanitizeState(data), storage);
  return data.version;
}

/** True when loading this saved text would lose a profile, check-in or workout (or the text is unreadable). */
function dropsRecords(raw) {
  let data;
  try { data = JSON.parse(raw); }
  catch { return true; }
  const count = value => (object(value) && value.profile ? 1 : 0) +
    (Array.isArray(value?.scans) ? value.scans.length : 0) + (Array.isArray(value?.workouts) ? value.workouts.length : 0);
  return count(data) !== count(sanitizeState(data));
}

/**
 * Remove the version 1 key once its data has been saved under STORAGE_KEY. If the upgrade dropped records,
 * the original text is first copied to LEGACY_BACKUP_KEY so nothing is lost; if that copy fails, the
 * version 1 key stays. Otherwise no backup is kept, so a check-in deleted later leaves no copy behind.
 */
function retireLegacy(storage) {
  try {
    const legacy = storage.getItem(LEGACY_STORAGE_KEY);
    if (legacy === null) return;
    if (dropsRecords(legacy)) storage.setItem(LEGACY_BACKUP_KEY, legacy);
    storage.removeItem(LEGACY_STORAGE_KEY);
  } catch { /* leaving the version 1 copy where it is loses nothing */ }
}

/** Save numeric summaries only. Photos, landmarks and unknown fields are never persisted. */
export function saveState(state, storage = globalThis.localStorage) {
  const clean = normalizeState(state, true);
  let raw = null;
  try { raw = storage.getItem(STORAGE_KEY); }
  catch { /* unavailable storage is reported by setItem below */ }
  let existing = null;
  try { existing = JSON.parse(raw); }
  catch { /* corrupt data may be replaced */ }
  if (isNewer(existing)) {
    throw new Error('Saved data comes from a newer version of FORM. Reload the latest app before saving so it is not overwritten.');
  }
  try { storage.setItem(STORAGE_KEY, JSON.stringify(clean)); }
  catch (error) {
    throw new Error('Could not save gym data. Browser storage may be full or unavailable.', { cause: error });
  }
  // With no STORAGE_KEY yet, the state being saved was loaded from the version 1 key (loadState falls back to
  // it), so this first save replaces that data. Later saves leave the version 1 key alone, so anything an old
  // tab writes there afterwards is never deleted without being seen.
  if (raw === null) retireLegacy(storage);
  return clean;
}

/** Delete everything FORM saved in this browser, including version 1 data and its backup. */
export function clearState(storage = globalThis.localStorage) {
  const clean = saveState(emptyState(), storage);
  try {
    storage.removeItem(LEGACY_STORAGE_KEY);
    storage.removeItem(LEGACY_BACKUP_KEY);
  } catch (error) {
    throw new Error('Could not clear older saved data from browser storage.', { cause: error });
  }
  return clean;
}

/** Return a portable JSON export with the same validation and privacy rules as saving. */
export function exportState(state) {
  return JSON.stringify(normalizeState(state, true), null, 2);
}
