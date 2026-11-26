import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calculateComposition } from '../public/js/metrics.js';
import {
  clearState, emptyState, exportState, LEGACY_BACKUP_KEY, LEGACY_STORAGE_KEY, loadState, migrate, newerSavedVersion,
  sanitizeState, saveState, SCHEMA_VERSION, STORAGE_KEY, upgradeSavedState,
} from '../public/js/storage.js';

const profile = { age: 35, heightCm: 180, weightKg: 81, waistCm: 90, sex: 'male' };
const timestamp = '2026-10-18T08:00:00.000Z';
const PROTOTYPE_KEY = 'gym-app:v2';

function memoryStorage() {
  const items = new Map();
  return {
    items,
    getItem(key) { return items.has(key) ? items.get(key) : null; },
    setItem(key, value) { items.set(key, String(value)); },
    removeItem(key) { items.delete(key); },
  };
}

function state() {
  return {
    version: 2,
    profile: { ...profile },
    scans: [{ id: 'scan-1', createdAt: timestamp, profile: { ...profile }, metrics: calculateComposition(profile), pose: { score: 100, visibleLandmarks: 9 } }],
    workouts: [{ id: 'workout-1', createdAt: timestamp, title: 'Full body strength', exercises: 6, minutes: 45 }],
  };
}

/** The same data as the version 1 app saved it. */
function v1State() {
  return { ...state(), version: 1 };
}

const measurements = { chestCm: 98.4, shouldersCm: 118, upperArmLeftCm: 33.1, upperArmRightCm: 33.6 };

function measuredState() {
  const value = state();
  value.scans[0].measurements = { ...measurements };
  return value;
}

test('the current schema is version 2', () => {
  assert.equal(SCHEMA_VERSION, 2);
});

test('empty state and absent storage data have independent arrays', () => {
  const first = emptyState();
  const second = emptyState();
  assert.deepEqual(first, { version: 2, profile: null, scans: [], workouts: [] });
  first.scans.push({});
  assert.equal(second.scans.length, 0);
  assert.deepEqual(loadState(memoryStorage()), second);
});

test('validated summaries round trip and export as versioned JSON', () => {
  const storage = memoryStorage();
  const original = state();
  assert.deepEqual(saveState(original, storage), original);
  assert.deepEqual(loadState(storage), original);
  assert.deepEqual(JSON.parse(exportState(original)), original);
  assert.equal(JSON.parse(storage.getItem(STORAGE_KEY)).version, 2);
});

test('photos, raw landmarks and arbitrary fields never persist or export', () => {
  const original = measuredState();
  original.photo = 'secret-top-level-photo';
  original.landmarks = [{ x: 0.5 }];
  original.profile.cameraImage = 'secret-profile-photo';
  original.scans[0].image = 'secret-scan-photo';
  original.scans[0].profile.name = 'secret-name';
  original.scans[0].metrics.photo = 'secret-metrics-photo';
  original.scans[0].pose.landmarks = [{ x: 0.5 }];
  original.scans[0].measurements.photo = 'secret-measurement-photo';
  original.workouts[0].notes = 'secret-notes';
  const storage = memoryStorage();
  const saved = saveState(original, storage);
  assert.deepEqual(saved, measuredState());
  for (const serialized of [storage.getItem(STORAGE_KEY), exportState(original)]) {
    assert.doesNotMatch(serialized, /secret|landmarks|cameraImage/);
  }
  assert.equal(original.scans[0].image, 'secret-scan-photo');
});

test('corrupt JSON and unsupported roots load as empty state', () => {
  const storage = memoryStorage();
  for (const raw of ['{', 'null', '[]', '42', '{"version":3}', '{"version":0}', '{"version":"1"}', '{}', '"data"']) {
    storage.setItem(STORAGE_KEY, raw);
    assert.deepEqual(loadState(storage), emptyState());
  }
});

test('malformed local records are discarded while valid records survive', () => {
  const original = state();
  original.scans.push({ ...original.scans[0], id: 'bad-scan', metrics: { ...original.scans[0].metrics, bodyFatPercent: 10 } });
  original.scans.push({ id: 'missing-measurements' });
  original.workouts.push({ ...original.workouts[0], id: 'bad-workout', minutes: -10 });
  original.workouts.push(null);
  original.profile = { ...profile, age: 10 };
  const expected = state();
  expected.profile = null;
  const storage = memoryStorage();
  storage.setItem(STORAGE_KEY, JSON.stringify(original));
  assert.deepEqual(loadState(storage), expected);
});

test('sanitization allows recovery from missing arrays and removes duplicate ids', () => {
  assert.deepEqual(sanitizeState({ version: 1, scans: 'bad' }), emptyState());
  const original = state();
  original.scans.push({ ...original.scans[0] });
  original.workouts.push({ ...original.workouts[0] });
  assert.deepEqual(sanitizeState(original), state());
});

test('invalid new data fails explicitly before replacing a saved state', () => {
  const storage = memoryStorage();
  saveState(state(), storage);
  for (const mutate of [
    item => { item.version = 3; },
    item => { item.scans = null; },
    item => { item.profile.weightKg = NaN; },
    item => { item.scans[0].metrics.bodyFatPercent = Infinity; },
    item => { item.scans[0].metrics.method = 'photo'; },
    item => { item.scans[0].createdAt = 'yesterday'; },
    item => { item.scans[0].pose.score = 101; },
    item => { item.scans[0].pose.visibleLandmarks = 33; },
    item => { item.workouts[0].minutes = 0; },
    item => { item.workouts[0].exercises = 1.5; },
    item => { item.workouts[0].title = ''; },
    item => { item.workouts.push({ ...item.workouts[0] }); },
  ]) {
    const invalid = state();
    mutate(invalid);
    assert.throws(() => saveState(invalid, storage), TypeError);
    assert.throws(() => exportState(invalid), TypeError);
    assert.deepEqual(loadState(storage), state());
  }
});

test('quota and unavailable storage errors are reported with their cause', () => {
  const quotaError = new Error('Quota exceeded');
  assert.throws(() => saveState(state(), { getItem() { return null; }, setItem() { throw quotaError; } }), error => {
    assert.match(error.message, /Could not save/);
    assert.equal(error.cause, quotaError);
    return true;
  });
  const securityError = new Error('Storage denied');
  assert.throws(() => loadState({ getItem() { throw securityError; } }), error => {
    assert.match(error.message, /Unable to read/);
    assert.equal(error.cause, securityError);
    return true;
  });
});

test('profiles are normalized and scans without a pose summary remain valid', () => {
  const original = state();
  original.profile.heightCm = '180';
  original.scans[0].profile.waistCm = '90';
  delete original.scans[0].pose;
  const expected = state();
  delete expected.scans[0].pose;
  assert.deepEqual(saveState(original, memoryStorage()), expected);
});

// Body-part measurements (new in version 2)

test('body-part measurements round trip; unknown measurement keys are stripped', () => {
  const original = measuredState();
  original.scans[0].measurements.neckCm = 38;
  const storage = memoryStorage();
  assert.deepEqual(saveState(original, storage), measuredState());
  assert.deepEqual(loadState(storage), measuredState());
  assert.deepEqual(JSON.parse(exportState(original)), measuredState());
});

test('form strings are stored as numbers and blank fields are left out', () => {
  const original = state();
  original.scans[0].measurements = { chestCm: '98.4', hipCm: '', calfLeftCm: null, thighLeftCm: '  ' };
  const expected = state();
  expected.scans[0].measurements = { chestCm: 98.4 };
  assert.deepEqual(saveState(original, memoryStorage()), expected);
});

test('a check-in with no body-part measurements stores no measurements key', () => {
  for (const empty of [{}, { chestCm: '' }, null]) {
    const original = state();
    original.scans[0].measurements = empty;
    const saved = saveState(original, memoryStorage());
    assert.deepEqual(saved, state());
    assert.equal('measurements' in saved.scans[0], false);
  }
});

test('measurement typos are rejected when saving or exporting, and nothing is overwritten', () => {
  const storage = memoryStorage();
  saveState(measuredState(), storage);
  for (const mutate of [
    item => { item.scans[0].measurements.upperArmLeftCm = 350; },
    item => { item.scans[0].measurements.chestCm = 9; },
    item => { item.scans[0].measurements.chestCm = 'wide'; },
    item => { item.scans[0].measurements.calfRightCm = Infinity; },
    item => { item.scans[0].measurements = [98]; },
    item => { item.scans[0].measurements = 'chest 98'; },
  ]) {
    const invalid = measuredState();
    mutate(invalid);
    assert.throws(() => saveState(invalid, storage), /must/);
    assert.throws(() => exportState(invalid), /must/);
    assert.deepEqual(loadState(storage), measuredState());
  }
});

test('loading keeps a check-in and drops only its bad measurements', () => {
  const original = measuredState();
  original.scans[0].measurements.calfLeftCm = 80;
  original.scans[0].measurements.thighRightCm = 'thick';
  original.scans.push({ ...state().scans[0], id: 'scan-2', measurements: 'not an object' });
  const storage = memoryStorage();
  storage.setItem(STORAGE_KEY, JSON.stringify(original));
  const expected = measuredState();
  expected.scans.push({ ...state().scans[0], id: 'scan-2' });
  assert.deepEqual(loadState(storage), expected);
});

// Migration: version 1 -> version 2

test('migrate upgrades version 1 data without changing its records', () => {
  const legacy = v1State();
  const upgraded = migrate(legacy);
  assert.equal(upgraded.version, 2);
  assert.deepEqual(upgraded.scans, legacy.scans);
  assert.deepEqual(upgraded.workouts, legacy.workouts);
  assert.deepEqual(upgraded.profile, legacy.profile);
  assert.equal(legacy.version, 1, 'the input is not modified');
  assert.deepEqual(migrate(state()), state(), 'current data passes through');
});

test('migrate rejects unknown, newer and malformed versions', () => {
  for (const value of [{ version: 0 }, { version: 3 }, { version: 1.5 }, { version: '1' }, {}, null, [], 'v1']) {
    assert.throws(() => migrate(value), /schema version 1 to 2/);
  }
});

test('version 1 data under the version 1 key loads as version 2', () => {
  const storage = memoryStorage();
  storage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(v1State()));
  assert.deepEqual(loadState(storage), state());
  assert.equal(JSON.parse(exportState(v1State())).version, 2);
});

test('version 1 data keeps its valid records when some are malformed', () => {
  const legacy = v1State();
  legacy.scans.push({ id: 'broken' });
  legacy.workouts.push({ ...legacy.workouts[0], id: 'workout-2', minutes: 0 });
  const storage = memoryStorage();
  storage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(legacy));
  assert.deepEqual(loadState(storage), state());
});

test('the startup upgrade saves version 1 data under the new key; with nothing dropped, no backup is kept', () => {
  const storage = memoryStorage();
  storage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(v1State()));
  assert.equal(upgradeSavedState(storage), 1);
  assert.equal(storage.getItem(LEGACY_STORAGE_KEY), null);
  assert.equal(storage.getItem(LEGACY_BACKUP_KEY), null);
  assert.deepEqual(JSON.parse(storage.getItem(STORAGE_KEY)), state());
  assert.deepEqual(loadState(storage), state());
  assert.equal(upgradeSavedState(storage), null, 'a second run has nothing to do');
});

test('records the upgrade drops are kept in a backup', () => {
  const legacy = v1State();
  legacy.scans.push({ id: 'broken', createdAt: timestamp });
  const original = JSON.stringify(legacy);
  const storage = memoryStorage();
  storage.setItem(LEGACY_STORAGE_KEY, original);
  upgradeSavedState(storage);
  assert.deepEqual(loadState(storage), state());
  assert.match(storage.getItem(LEGACY_BACKUP_KEY), /"broken"/);
  assert.equal(storage.getItem(LEGACY_BACKUP_KEY), original);
});

test('a full disk during the upgrade keeps the version 1 data and still shows it', () => {
  const storage = memoryStorage();
  const original = JSON.stringify(v1State());
  storage.setItem(LEGACY_STORAGE_KEY, original);
  const setItem = storage.setItem;
  storage.setItem = (key, value) => { if (key === STORAGE_KEY) throw new Error('QuotaExceededError'); setItem(key, value); };
  assert.throws(() => upgradeSavedState(storage), /Could not save/);
  assert.equal(storage.getItem(LEGACY_STORAGE_KEY), original);
  assert.equal(storage.getItem(LEGACY_BACKUP_KEY), null);
  assert.deepEqual(loadState(storage), state());
});

test('the version 1 data is not removed when its backup cannot be written', () => {
  const storage = memoryStorage();
  const original = JSON.stringify({ ...v1State(), workouts: [...v1State().workouts, { id: 'broken' }] });
  storage.setItem(LEGACY_STORAGE_KEY, original);
  const setItem = storage.setItem;
  storage.setItem = (key, value) => { if (key === LEGACY_BACKUP_KEY) throw new Error('QuotaExceededError'); setItem(key, value); };
  assert.equal(upgradeSavedState(storage), 1);
  assert.equal(storage.getItem(LEGACY_STORAGE_KEY), original);
  assert.deepEqual(loadState(storage), state());
});

test('version 1 data written after the upgrade (an old tab) is never deleted by later saves', () => {
  const storage = memoryStorage();
  storage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(v1State()));
  upgradeSavedState(storage);
  assert.equal(storage.getItem(LEGACY_BACKUP_KEY), null);
  const fromOldTab = JSON.stringify({ ...v1State(), workouts: [...v1State().workouts, { ...v1State().workouts[0], id: 'workout-2' }] });
  storage.setItem(LEGACY_STORAGE_KEY, fromOldTab);
  saveState(measuredState(), storage);
  assert.equal(storage.getItem(LEGACY_STORAGE_KEY), fromOldTab);
  assert.equal(storage.getItem(LEGACY_BACKUP_KEY), null);
  assert.deepEqual(loadState(storage), measuredState());
});

test('the startup upgrade does nothing without old data', () => {
  for (const [key, raw] of [[null, null], [STORAGE_KEY, JSON.stringify(state())], [LEGACY_STORAGE_KEY, '{'], [LEGACY_STORAGE_KEY, '{"version":0}']]) {
    const storage = memoryStorage();
    if (key) storage.setItem(key, raw);
    const before = new Map(storage.items);
    assert.equal(upgradeSavedState(storage), null);
    assert.deepEqual(storage.items, before);
  }
});

test('a first save without the startup upgrade also retires the version 1 key', () => {
  for (const [legacy, backedUp] of [[v1State(), false], [{ ...v1State(), scans: [...v1State().scans, null] }, true], ['{', true]]) {
    const storage = memoryStorage();
    const original = typeof legacy === 'string' ? legacy : JSON.stringify(legacy);
    storage.setItem(LEGACY_STORAGE_KEY, original);
    saveState(state(), storage);
    assert.equal(storage.getItem(LEGACY_STORAGE_KEY), null);
    assert.equal(storage.getItem(LEGACY_BACKUP_KEY), backedUp ? original : null);
  }
  const storage = memoryStorage();
  storage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(v1State()));
  saveState(loadState(storage), storage);
  assert.deepEqual(JSON.parse(storage.getItem(STORAGE_KEY)), state());
});

test('clearing removes FORM data, version 1 data and its backup, but not the prototype data', () => {
  const storage = memoryStorage();
  storage.setItem(LEGACY_STORAGE_KEY, JSON.stringify({ ...v1State(), scans: [...v1State().scans, { id: 'broken' }] }));
  upgradeSavedState(storage);
  assert.notEqual(storage.getItem(LEGACY_BACKUP_KEY), null);
  storage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(v1State()));
  storage.setItem(PROTOTYPE_KEY, 'prototype');
  assert.deepEqual(clearState(storage), emptyState());
  assert.deepEqual(loadState(storage), emptyState());
  assert.equal(storage.getItem(LEGACY_STORAGE_KEY), null);
  assert.equal(storage.getItem(LEGACY_BACKUP_KEY), null);
  assert.equal(storage.getItem(PROTOTYPE_KEY), 'prototype');
});

test('the current key wins over the version 1 key', () => {
  const storage = memoryStorage();
  storage.setItem(STORAGE_KEY, JSON.stringify(measuredState()));
  storage.setItem(LEGACY_STORAGE_KEY, JSON.stringify({ ...v1State(), scans: [] }));
  assert.deepEqual(loadState(storage), measuredState());
  assert.equal(upgradeSavedState(storage), null);
});

test("the prototype's storage key is never read, written or removed", () => {
  const storage = memoryStorage();
  const prototype = JSON.stringify({ ...measuredState(), workouts: [{ ...state().workouts[0], entries: [{ exercise: 'bench-press', sets: 3 }] }] });
  storage.setItem(PROTOTYPE_KEY, prototype);
  assert.deepEqual(loadState(storage), emptyState());
  assert.equal(upgradeSavedState(storage), null);
  saveState(state(), storage);
  assert.equal(storage.getItem(PROTOTYPE_KEY), prototype);
});

test('data from a newer version is detected and never overwritten', () => {
  for (const version of [3, '3']) {
    const storage = memoryStorage();
    const newer = JSON.stringify({ version, profile: null, scans: [], workouts: [], future: true });
    storage.setItem(STORAGE_KEY, newer);
    assert.deepEqual(loadState(storage), emptyState());
    assert.equal(newerSavedVersion(storage), 3);
    assert.equal(upgradeSavedState(storage), null);
    assert.throws(() => saveState(state(), storage), /newer version/);
    assert.throws(() => clearState(storage), /newer version/);
    assert.equal(storage.getItem(STORAGE_KEY), newer);
  }
});

test('junk versions are not treated as newer, so they never block saving', () => {
  for (const version of ['0x10', '3.5', '', ' ', true, [3], { v: 3 }, 2.5, Infinity]) {
    const storage = memoryStorage();
    storage.setItem(STORAGE_KEY, JSON.stringify({ version, scans: [], workouts: [] }));
    assert.equal(newerSavedVersion(storage), null, JSON.stringify(version));
    assert.deepEqual(saveState(state(), storage), state());
  }
});

test('current, older, absent and corrupt data are not reported as newer', () => {
  for (const [key, raw] of [[STORAGE_KEY, JSON.stringify(state())], [LEGACY_STORAGE_KEY, JSON.stringify(v1State())], [null, null], [STORAGE_KEY, '{']]) {
    const storage = memoryStorage();
    if (key) storage.setItem(key, raw);
    assert.equal(newerSavedVersion(storage), null);
  }
});

test('the full example in docs/storage-v2.md is valid version 2 data', () => {
  const doc = readFileSync(new URL('../docs/storage-v2.md', import.meta.url), 'utf8');
  const example = JSON.parse(doc.match(/## Full example[\s\S]*?```json\n([\s\S]*?)```/)[1]);
  assert.equal(example.version, SCHEMA_VERSION);
  assert.deepEqual(saveState(example, memoryStorage()), example, 'saving strips or changes nothing');
  assert.ok(example.scans.some(scan => !('measurements' in scan)), 'shows a check-in without measurements');
  assert.ok(example.scans.some(scan => scan.measurements), 'shows a check-in with measurements');
});
