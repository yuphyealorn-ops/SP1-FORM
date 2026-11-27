export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const WD_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function fmtMin(m) {
  const h = Math.floor(m / 60) % 24, mm = m % 60;
  return String(h).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
}
export function parseISO(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function toISO(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
export function addDays(iso, n) {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}
export function weekdayOf(iso) { return (parseISO(iso).getDay() + 6) % 7; } // Monday = 0
export function weekStart(iso) { return addDays(iso, -weekdayOf(iso)); }
export function prettyDate(iso, today) {
  if (today) {
    if (iso === today) return 'Today';
    if (iso === addDays(today, 1)) return 'Tomorrow';
    if (iso === addDays(today, -1)) return 'Yesterday';
  }
  const d = parseISO(iso);
  return `${WD_SHORT[weekdayOf(iso)]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
export function duration(min) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
