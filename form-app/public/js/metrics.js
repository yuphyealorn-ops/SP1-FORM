// Body measurement maths. Pure functions, no DOM.
export const PARTS = [
  { key: 'weight', label: 'Weight', unit: 'kg', muscles: [] },
  { key: 'waist', label: 'Waist', unit: 'cm', muscles: ['core'] },
  { key: 'hip', label: 'Hip', unit: 'cm', muscles: ['glutes'] },
  { key: 'chest', label: 'Chest', unit: 'cm', muscles: ['chest'] },
  { key: 'shoulders', label: 'Shoulders', unit: 'cm', muscles: ['shoulders'] },
  { key: 'armL', label: 'Upper arm (left)', unit: 'cm', muscles: ['biceps', 'triceps'] },
  { key: 'armR', label: 'Upper arm (right)', unit: 'cm', muscles: ['biceps', 'triceps'] },
  { key: 'thighL', label: 'Thigh (left)', unit: 'cm', muscles: ['quads', 'hamstrings'] },
  { key: 'thighR', label: 'Thigh (right)', unit: 'cm', muscles: ['quads', 'hamstrings'] },
  { key: 'calfL', label: 'Calf (left)', unit: 'cm', muscles: ['calves'] },
  { key: 'calfR', label: 'Calf (right)', unit: 'cm', muscles: ['calves'] },
];
export const PART_BY_KEY = Object.fromEntries(PARTS.map((p) => [p.key, p]));

export const round1 = (n) => Math.round(n * 10) / 10;

export function bmi(weightKg, heightCm) {
  if (!(weightKg > 0) || !(heightCm > 0)) return null;
  const m = heightCm / 100;
  return round1(weightKg / (m * m));
}
export function bmiBand(v) {
  if (v == null) return '';
  return v < 18.5 ? 'Under' : v < 25 ? 'Healthy range' : v < 30 ? 'Over' : 'High';
}
// Relative Fat Mass (Woolcott & Bergman, 2018): 64 - 20*(height/waist) + 12*(female ? 1 : 0)
export function rfm(heightCm, waistCm, sex) {
  if (!(heightCm > 0) || !(waistCm > 0) || (sex !== 'male' && sex !== 'female')) return null;
  return round1(64 - 20 * (heightCm / waistCm) + (sex === 'female' ? 12 : 0));
}
export function waistHip(waist, hip) {
  return waist > 0 && hip > 0 ? Math.round((waist / hip) * 100) / 100 : null;
}

// Entries sorted by date; returns [{date, value}] for one part.
export function series(entries, key) {
  return entries
    .filter((e) => typeof e[key] === 'number' && isFinite(e[key]))
    .map((e) => ({ date: e.date, value: e[key] }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
export function changeSinceStart(entries, key) {
  const s = series(entries, key);
  if (s.length < 2) return null;
  const first = s[0], last = s[s.length - 1];
  return { first: first.value, last: last.value, delta: round1(last.value - first.value), since: first.date, points: s.length };
}
export function latest(entries, key) {
  const s = series(entries, key);
  return s.length ? s[s.length - 1].value : null;
}
// Accepts a form value; returns a number, null for blank, or NaN if invalid/out of range.
export function readNumber(raw, min, max) {
  const t = String(raw ?? '').trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return isFinite(n) && n >= min && n <= max ? n : NaN;
}
export const RANGE = { weight: [20, 300], height: [100, 250] };
export const rangeFor = (key) => RANGE[key] || [5, 250];

// Pair weekly muscle points with the measurement nearest each week start (for "training vs body change").
export function pairWeeks(weeks, entries, key, muscles) {
  const s = series(entries, key);
  return weeks.map((w) => {
    const pts = muscles.reduce((a, m) => a + (w.points[m] || 0), 0);
    const upTo = s.filter((x) => x.date <= addDaysISO(w.week_start, 6));
    return { week: w.week_start, points: round1(pts), value: upTo.length ? upTo[upTo.length - 1].value : null };
  });
}
function addDaysISO(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}
