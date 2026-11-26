import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assessPose, BODY_PARTS, calculateComposition, normalizeMeasurement, normalizeMeasurements, normalizeProfile } from '../public/js/metrics.js';

const profile = { age: 35, heightCm: 180, weightKg: 81, waistCm: 90, sex: 'male' };

function close(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-10, `Expected ${expected}, received ${actual}`);
}

function fullBody() {
  const points = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.99 }));
  for (const [index, x, y] of [
    [0, 0.5, 0.1], [11, 0.38, 0.25], [12, 0.62, 0.25],
    [23, 0.42, 0.5], [24, 0.58, 0.5], [25, 0.43, 0.7],
    [26, 0.57, 0.7], [27, 0.44, 0.9], [28, 0.56, 0.9],
  ]) Object.assign(points[index], { x, y });
  return points;
}

test('male golden case returns unrounded tape-measurement summaries', () => {
  const metrics = calculateComposition(profile);
  close(metrics.bmi, 25);
  close(metrics.bodyFatPercent, 24);
  close(metrics.fatMassKg, 19.44);
  close(metrics.leanMassKg, 61.56);
  close(metrics.waistHeightRatio, 0.5);
  assert.equal(metrics.method, 'rfm');
  assert.equal(metrics.source, 'tape-measurements');
  assert.equal(metrics.muscleMassKg, undefined);
  assert.equal(metrics.category, undefined);
});

test('female golden case uses the published sex term and retains precision', () => {
  const metrics = calculateComposition({ age: 40, heightCm: 165, weightKg: 60, waistCm: 75, sex: 'female' });
  close(metrics.bodyFatPercent, 32);
  close(metrics.bmi, 22.03856749311295);
  close(metrics.fatMassKg, 19.2);
  close(metrics.leanMassKg, 40.8);
  close(metrics.waistHeightRatio, 0.45454545454545453);
});

test('normalizes numeric strings and drops unknown profile fields', () => {
  const input = { age: '35', heightCm: ' 180 ', weightKg: '81', waistCm: '90', sex: 'male', photo: 'private' };
  assert.deepEqual(normalizeProfile(input), profile);
  assert.deepEqual(calculateComposition(input), calculateComposition(profile));
  assert.equal(input.heightCm, ' 180 ');
});

test('adult age boundaries and plausible measurement boundaries are accepted', () => {
  for (const age of [20, 69]) assert.doesNotThrow(() => calculateComposition({ ...profile, age }));
  for (const heightCm of [120, 230]) assert.doesNotThrow(() => calculateComposition({ ...profile, heightCm }));
  for (const weightKg of [30, 300]) assert.doesNotThrow(() => calculateComposition({ ...profile, weightKg }));
  assert.doesNotThrow(() => calculateComposition({ ...profile, heightCm: 120, waistCm: 45 }));
  assert.doesNotThrow(() => calculateComposition({ ...profile, heightCm: 120, waistCm: 200, sex: 'female' }));
});

test('rejects ages and measurements outside supported bounds', () => {
  for (const [field, value] of [
    ['age', 19], ['age', 70], ['heightCm', 119.9], ['heightCm', 230.1],
    ['weightKg', 29.9], ['weightKg', 300.1], ['waistCm', 44.9], ['waistCm', 200.1],
  ]) assert.throws(() => calculateComposition({ ...profile, [field]: value }), RangeError);
});

test('rejects malformed, nonfinite and missing measurements', () => {
  for (const value of [NaN, Infinity, -Infinity, 'Infinity', '', '  ', null, undefined, true, [], {}]) {
    for (const field of ['age', 'heightCm', 'weightKg', 'waistCm']) {
      assert.throws(() => calculateComposition({ ...profile, [field]: value }), TypeError);
    }
  }
  for (const value of [null, [], undefined, 'profile']) assert.throws(() => calculateComposition(value), TypeError);
  for (const sex of ['', 'other', 'Male', undefined]) assert.throws(() => calculateComposition({ ...profile, sex }), TypeError);
});

test('rejects an implausible estimate instead of clamping it', () => {
  assert.throws(() => calculateComposition({ ...profile, heightCm: 230, waistCm: 45 }), /implausible/);
  assert.throws(() => calculateComposition({ ...profile, heightCm: 160, waistCm: 50 }), /implausible/);
});

test('a complete upright front-facing pose is ready with a framing score', () => {
  assert.deepEqual(assessPose(fullBody()), { ready: true, score: 100, issues: [], visibleLandmarks: 9 });
});

test('absent and partial person detections cannot pass', () => {
  for (const landmarks of [undefined, null, [], {}]) {
    const result = assessPose(landmarks);
    assert.equal(result.ready, false);
    assert.equal(result.score, 0);
    assert.equal(result.visibleLandmarks, 0);
    assert.ok(result.issues.length);
  }
  assert.equal(assessPose(fullBody().slice(0, 29)).ready, false);
  assert.equal(assessPose(fullBody().slice(0, 20)).ready, false);
});

test('cropped or obscured required landmarks fail framing', () => {
  for (const [property, value] of [['x', 0.99], ['y', 0.01], ['visibility', 0.64]]) {
    const points = fullBody();
    points[28][property] = value;
    const result = assessPose(points);
    assert.equal(result.ready, false);
    assert.equal(result.visibleLandmarks, 8);
    assert.ok(result.score < 100);
    assert.ok(result.issues.length > 0);
  }
  const points = fullBody();
  points[0].visibility = 0.65;
  points[0].y = 0.03;
  points[27].y = points[28].y = 0.97;
  assert.equal(assessPose(points).ready, true);
});

test('nonfinite or invalid pose values cannot pass', () => {
  for (const [property, value] of [['x', NaN], ['y', Infinity], ['z', NaN], ['visibility', -1], ['visibility', 1.1], ['visibility', '0.9']]) {
    const points = fullBody();
    points[11][property] = value;
    const result = assessPose(points);
    assert.equal(result.ready, false);
    assert.ok(result.score < 100);
  }
});

test('side-on, tilted, non-upright and distant poses cannot pass', () => {
  const sideOn = fullBody();
  sideOn[11].x = 0.49;
  sideOn[12].x = 0.51;
  assert.equal(assessPose(sideOn).ready, false);
  const tilted = fullBody();
  tilted[11].y = 0.4;
  assert.equal(assessPose(tilted).ready, false);
  const inverted = fullBody();
  inverted[25].y = inverted[26].y = 0.4;
  assert.equal(assessPose(inverted).ready, false);
  const distant = fullBody().map(point => ({ ...point, y: 0.4 + point.y * 0.2 }));
  assert.equal(assessPose(distant).ready, false);
});

test('body-part measurements are optional and keep only entered, known fields', () => {
  assert.deepEqual(normalizeMeasurements(undefined), {});
  assert.deepEqual(normalizeMeasurements(null), {});
  assert.deepEqual(normalizeMeasurements({}), {});
  assert.deepEqual(
    normalizeMeasurements({ chestCm: '98.5', upperArmLeftCm: 33, upperArmRightCm: '', calfLeftCm: null, neckCm: 38 }),
    { chestCm: 98.5, upperArmLeftCm: 33 },
  );
});

test('every body part has a label, a tape hint and a sensible range', () => {
  assert.equal(new Set(BODY_PARTS.map(part => part.id)).size, BODY_PARTS.length);
  for (const { id, label, hint, range: [min, max] } of BODY_PARTS) {
    assert.match(id, /Cm$/);
    assert.ok(label && hint);
    assert.ok(min > 0 && max > min);
    assert.doesNotThrow(() => normalizeMeasurements({ [id]: min }));
    assert.doesNotThrow(() => normalizeMeasurements({ [id]: max }));
  }
});

test('obvious measurement typos are caught before saving', () => {
  assert.throws(() => normalizeMeasurements({ upperArmLeftCm: 350 }), RangeError);
  assert.throws(() => normalizeMeasurements({ chestCm: 9 }), RangeError);
  for (const value of [NaN, Infinity, 'wide', true, [], {}]) {
    assert.throws(() => normalizeMeasurements({ thighRightCm: value }), TypeError);
  }
  for (const value of [[], 'chest', 42]) assert.throws(() => normalizeMeasurements(value), TypeError);
});

test('the nine body parts from the proposal are covered, left and right separately', () => {
  assert.deepEqual(BODY_PARTS.map(part => part.id), [
    'chestCm', 'shouldersCm', 'upperArmLeftCm', 'upperArmRightCm', 'hipCm',
    'thighLeftCm', 'thighRightCm', 'calfLeftCm', 'calfRightCm',
  ]);
});

test('values just outside each range are rejected with the body part named', () => {
  for (const { id, label, range: [min, max] } of BODY_PARTS) {
    for (const value of [min - 0.1, max + 0.1]) {
      assert.throws(() => normalizeMeasurement(id, value), error => error instanceof RangeError && error.message.startsWith(label));
    }
  }
});

test('one field can be checked on its own for inline form messages', () => {
  assert.equal(normalizeMeasurement('upperArmLeftCm', '33.5'), 33.5);
  assert.equal(normalizeMeasurement('upperArmLeftCm', 33.5), 33.5);
  for (const blank of [undefined, null, '', '   ']) assert.equal(normalizeMeasurement('chestCm', blank), undefined);
  assert.throws(() => normalizeMeasurement('upperArmLeftCm', 350), /Upper arm \(L\) must be between 15 and 70 cm/);
  assert.throws(() => normalizeMeasurement('calfRightCm', 'big'), /Calf \(R\) must be a finite number/);
  assert.throws(() => normalizeMeasurement('neckCm', 38), /Unknown body-part measurement/);
});

test('common typing mistakes fall outside the ranges', () => {
  // Missing or misplaced decimal point, and values typed in inches.
  for (const [id, value] of [
    ['upperArmRightCm', 335], ['upperArmRightCm', 3.35], ['chestCm', 985], ['chestCm', 38],
    ['hipCm', 40], ['thighLeftCm', 22], ['calfLeftCm', 14], ['shouldersCm', 46],
  ]) assert.throws(() => normalizeMeasurement(id, value), RangeError, `${id}: ${value}`);
});

/** Rows of the first markdown table under `heading`, as arrays of trimmed cells. */
function tableRows(file, heading) {
  const text = readFileSync(new URL(`../docs/${file}`, import.meta.url), 'utf8');
  const section = text.split(heading)[1]?.split('\n## ')[0];
  assert.ok(section, `${file} has no "${heading}" section`);
  return section.split('\n')
    .filter(line => line.startsWith('|') && !/^\|\s*-/.test(line))
    .slice(1)
    .map(line => line.split('|').slice(1, -1).map(cell => cell.trim()));
}

/** "Upper arm (L)" and "Upper arm (R)" share the guide row "Upper arm (L and R)". */
const guideName = label => label.replace(/ \((L|R)\)$/, ' (L and R)');

test('the measuring guide gives each body part the same short hint as the form', () => {
  const hints = new Map(tableRows('measuring-guide.md', '## Where to put the tape').map(([name, hint]) => [name, hint]));
  for (const { label, hint } of BODY_PARTS) {
    assert.equal(hints.get(guideName(label)), hint, `measuring-guide.md row "${guideName(label)}"`);
  }
});

test('the documented ranges match the validation ranges', () => {
  const guide = new Map(tableRows('measuring-guide.md', '## Typing mistakes FORM catches').map(([name, range]) => [name, range]));
  const format = new Map(tableRows('storage-v2.md', '### `measurements`')
    .flatMap(([keys, , range]) => [...keys.matchAll(/`(\w+)`/g)].map(([, id]) => [id, range])));
  for (const { id, label, range: [min, max] } of BODY_PARTS) {
    assert.equal(guide.get(guideName(label)), `${min} – ${max}`, `measuring-guide.md range for ${label}`);
    assert.equal(format.get(id), `${min} – ${max}`, `storage-v2.md range for ${id}`);
  }
  assert.equal(format.size, BODY_PARTS.length, 'storage-v2.md lists exactly the BODY_PARTS keys');
});
