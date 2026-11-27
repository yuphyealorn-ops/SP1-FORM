import { confirmDialog, empty, field, h, select, toast } from '../dom.js';
import { lineChart } from '../charts.js';
import * as M from '../metrics.js';
import * as store from '../store.js';
import { state } from '../state.js';
import { prettyDate } from '../time.js';

const fmtDelta = (d, unit) => `${d > 0 ? '+' : ''}${d} ${unit}`;

export default async function body(view) {
  const uid = state.user.id;
  let data = store.load(uid);
  let chosen = 'waist';
  const box = h('div', { class: 'stack' });

  function profileCard() {
    const form = h('form', { class: 'card stack', novalidate: true },
      h('h2', null, 'About you'),
      h('p', { class: 'small muted' }, 'Used for BMI and relative fat mass. Stored only on this device.'),
      h('div', { class: 'form-grid' },
        field('Height (cm)', h('input', { name: 'height', type: 'number', step: 0.1, value: data.height ?? '', inputmode: 'decimal' })),
        field('Sex (for the RFM formula)', select('sex', [['', 'Prefer not to say'], ['male', 'Male'], ['female', 'Female']], data.sex ?? ''))),
      h('button', { class: 'btn', type: 'submit' }, 'Save'),
      h('div', { class: 'err', role: 'alert' }));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(form), err = form.querySelector('.err');
      const hgt = M.readNumber(fd.get('height'), ...M.RANGE.height);
      if (Number.isNaN(hgt)) { err.textContent = 'Height must be between 100 and 250 cm'; return; }
      err.textContent = '';
      data.height = hgt; data.sex = fd.get('sex') || null;
      persist('Saved');
    });
    return form;
  }

  function entryForm() {
    const last = data.entries[data.entries.length - 1] || {};
    const inputs = M.PARTS.map((p) => field(`${p.label} (${p.unit})`, h('input', { name: p.key, type: 'number', step: 0.1, inputmode: 'decimal', placeholder: last[p.key] != null ? String(last[p.key]) : '' })));
    const form = h('form', { class: 'card stack', novalidate: true },
      h('h2', null, 'Add measurements'),
      h('p', { class: 'small muted' }, 'Fill in only what you measured today. Measure at the same time of day, relaxed, tape snug but not tight.'),
      field('Date', h('input', { name: 'date', type: 'date', value: state.today, max: state.today, required: true })),
      h('div', { class: 'form-grid' }, inputs),
      h('div', { class: 'form-error', role: 'alert', hidden: true }),
      h('button', { class: 'btn primary', type: 'submit' }, 'Save measurements'));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(form), msg = form.querySelector('.form-error');
      form.querySelectorAll('.err').forEach((n) => (n.textContent = ''));
      const entry = { date: fd.get('date') };
      let bad = false;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date) || entry.date > state.today) { msg.textContent = 'Pick a date that is not in the future.'; msg.hidden = false; return; }
      for (const p of M.PARTS) {
        const v = M.readNumber(fd.get(p.key), ...M.rangeFor(p.key));
        if (Number.isNaN(v)) { bad = true; form.querySelector(`[name="${p.key}"]`).closest('.field').querySelector('.err').textContent = 'Check this number'; }
        else if (v != null) entry[p.key] = v;
      }
      if (bad) { msg.textContent = 'Some numbers look wrong.'; msg.hidden = false; return; }
      if (Object.keys(entry).length < 2) { msg.textContent = 'Enter at least one measurement.'; msg.hidden = false; return; }
      msg.hidden = true;
      store.upsertEntry(data, entry);
      persist('Measurements saved');
    });
    return form;
  }

  function summary() {
    const w = M.latest(data.entries, 'weight'), wa = M.latest(data.entries, 'waist'), hi = M.latest(data.entries, 'hip');
    const b = M.bmi(w, data.height), r = M.rfm(data.height, wa, data.sex), whr = M.waistHip(wa, hi);
    const stat = (label, value, note) => h('div', { class: 'card flat' }, h('div', { class: 'small muted' }, label), h('div', { class: 'stat' }, value ?? '–'), note ? h('div', { class: 'small muted' }, note) : null);
    return h('div', { class: 'grid cols-3' },
      stat('BMI', b, M.bmiBand(b) || (data.height ? 'Add your weight' : 'Add your height')),
      stat('Relative fat mass', r != null ? `${r}%` : null, r != null ? 'An estimate, not a diagnosis' : 'Needs height, waist and sex'),
      stat('Waist ÷ hip', whr, whr != null ? (whr < 0.9 ? 'Lower is generally better' : 'Worth watching') : 'Needs waist and hip'));
  }

  function changes() {
    const rows = M.PARTS.map((p) => {
      const c = M.changeSinceStart(data.entries, p.key), now = M.latest(data.entries, p.key);
      if (now == null) return null;
      return h('tr', null, h('td', null, h('button', { class: 'btn small quiet', type: 'button', onclick: () => { chosen = p.key; draw(); } }, p.label)),
        h('td', { class: 'num' }, `${now} ${p.unit}`),
        h('td', { class: 'num' }, c ? h('span', { class: c.delta === 0 ? '' : (p.key === 'waist' || p.key === 'weight' ? (c.delta < 0 ? 'delta-up' : 'delta-down') : (c.delta > 0 ? 'delta-up' : 'delta-down')) }, fmtDelta(c.delta, p.unit)) : '–'),
        h('td', { class: 'small muted' }, c ? `since ${prettyDate(c.since)}` : 'needs 2 entries'));
    }).filter(Boolean);
    if (!rows.length) return empty('No measurements yet', 'Add your first set above. Two or more entries unlock the charts.');
    return h('div', { class: 'card' }, h('h2', null, 'Change since you started'),
      h('table', null, h('thead', null, h('tr', null, h('th', null, 'Body part'), h('th', { class: 'num' }, 'Now'), h('th', { class: 'num' }, 'Change'), h('th', null, ''))), h('tbody', null, rows)));
  }

  function chart() {
    const part = M.PART_BY_KEY[chosen], s = M.series(data.entries, chosen);
    const pick = select('part', M.PARTS.map((p) => [p.key, p.label]), chosen);
    pick.addEventListener('change', () => { chosen = pick.value; draw(); });
    return h('div', { class: 'card' }, h('div', { class: 'row spread' }, h('h2', null, `${part.label} over time`), h('div', null, pick)),
      s.length < 2 ? h('p', { class: 'muted' }, 'Add at least two entries for this body part to see a chart.')
        : [lineChart(s.map((p) => ({ x: p.date, y: p.value })), { unit: part.unit, label: `${part.label} in ${part.unit} over time` }),
          h('p', { class: 'small muted' }, `${s.length} entries from ${prettyDate(s[0].date)} to ${prettyDate(s[s.length - 1].date)}.`)]);
  }

  function history() {
    if (!data.entries.length) return null;
    return h('div', { class: 'card' }, h('h2', null, 'Saved entries'),
      h('ul', { class: 'list' }, [...data.entries].reverse().slice(0, 15).map((e) => h('li', { class: 'row spread' },
        h('span', null, h('strong', null, prettyDate(e.date, state.today)), h('span', { class: 'small muted' }, ' · ', M.PARTS.filter((p) => e[p.key] != null).map((p) => `${p.label.replace(/ \(.*\)/, (m) => m.replace(/[()]/g, '').replace('left', 'L').replace('right', 'R'))} ${e[p.key]}`).join(', '))),
        h('button', { class: 'btn small quiet danger', type: 'button', onclick: async () => {
          if (!(await confirmDialog('Delete this entry from this device?'))) return;
          data.entries = data.entries.filter((x) => x.date !== e.date);
          persist('Entry deleted');
        } }, 'Delete')))));
  }

  function persist(msg) {
    if (!store.save(uid, data)) toast('Could not save. Is browser storage blocked?', true);
    else toast(msg);
    draw();
  }

  function draw() {
    box.replaceChildren(summary(), h('div', { class: 'grid cols-2' }, entryForm(), profileCard()), changes(), chart(), history());
  }

  view.append(h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Body measurements'),
    h('p', null, 'Private by design: these numbers never leave this browser.'))), box);
  draw();
}
