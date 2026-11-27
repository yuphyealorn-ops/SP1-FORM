import test from 'node:test';
import assert from 'node:assert/strict';
import { bmi, changeSinceStart, pairWeeks, readNumber, rfm, waistHip } from '../../public/js/metrics.js';
import { addDays, fmtMin, weekStart, weekdayOf } from '../../public/js/time.js';

test('bmi and rfm', () => {
  assert.equal(bmi(70, 175), 22.9);
  assert.equal(bmi(0, 175), null);
  assert.equal(rfm(175, 82, 'male'), 21.3);
  assert.equal(rfm(175, 82, 'female'), 33.3);
  assert.equal(rfm(175, 82, null), null);
  assert.equal(waistHip(80, 100), 0.8);
});
test('change since start uses first and latest entry', () => {
  const e = [{ date: '2026-11-24', armR: 32.5 }, { date: '2026-11-01', armR: 31 }, { date: '2026-11-10' }];
  const c = changeSinceStart(e, 'armR');
  assert.deepEqual([c.first, c.last, c.delta, c.since], [31, 32.5, 1.5, '2026-11-01']);
  assert.equal(changeSinceStart([{ date: '2026-11-01', armR: 31 }], 'armR'), null);
});
test('readNumber validates range and decimal comma', () => {
  assert.equal(readNumber('', 5, 250), null);
  assert.equal(readNumber('82,5', 5, 250), 82.5);
  assert.ok(Number.isNaN(readNumber('9999', 5, 250)));
  assert.ok(Number.isNaN(readNumber('abc', 5, 250)));
});
test('pairWeeks takes the latest measurement up to each week end', () => {
  const weeks = [{ week_start: '2026-11-02', points: { biceps: 3, triceps: 1 } }, { week_start: '2026-11-09', points: {} }];
  const p = pairWeeks(weeks, [{ date: '2026-11-03', armR: 30 }], 'armR', ['biceps', 'triceps']);
  assert.deepEqual(p.map((x) => [x.points, x.value]), [[4, 30], [0, 30]]);
});
test('time helpers', () => {
  assert.equal(fmtMin(75), '01:15');
  assert.equal(weekdayOf('2026-11-30'), 0);
  assert.equal(weekStart('2026-12-02'), '2026-11-30');
  assert.equal(addDays('2026-12-30', 3), '2027-01-02');
});
