// Body measurements live only in this browser (privacy by design). Namespaced per account.
const key = (uid) => `form.body.${uid}`;
const blank = () => ({ entries: [], height: null, sex: null });

export function load(uid) {
  try {
    const raw = localStorage.getItem(key(uid));
    if (!raw) return blank();
    const d = JSON.parse(raw);
    return {
      entries: Array.isArray(d.entries) ? d.entries.filter((e) => e && typeof e.date === 'string') : [],
      height: typeof d.height === 'number' ? d.height : null,
      sex: d.sex === 'male' || d.sex === 'female' ? d.sex : null,
    };
  } catch {
    return blank();
  }
}
export function save(uid, data) {
  try {
    localStorage.setItem(key(uid), JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}
export function upsertEntry(data, entry) {
  const i = data.entries.findIndex((e) => e.date === entry.date);
  if (i >= 0) data.entries[i] = { ...data.entries[i], ...entry };
  else data.entries.push(entry);
  data.entries.sort((a, b) => (a.date < b.date ? -1 : 1));
  return data;
}
export function clear(uid) {
  try { localStorage.removeItem(key(uid)); } catch { /* ignore */ }
}
