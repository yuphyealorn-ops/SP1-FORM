import { get } from '../api.js';
import { MUSCLE_LABEL, bodyMap, heatScale } from '../bodymap.js';
import { barChart, lineChart } from '../charts.js';
import { empty, h, select } from '../dom.js';
import * as M from '../metrics.js';
import * as store from '../store.js';
import { state } from '../state.js';
import { prettyDate } from '../time.js';

export default async function muscles(view) {
  let days = 7, selected = null, partKey = 'armR';
  const data = store.load(state.user.id);
  const weekly = (await get('/progress/weekly?weeks=12')).weeks;
  const mapBox = h('div'), linkBox = h('div');

  async function drawMap() {
    const r = await get(`/progress/muscles?days=${days}`);
    const list = state.lib.muscles.map((m) => {
      const p = r.points[m.key], low = r.low.includes(m.key);
      const bar = h('div', { class: 'bar' }, (() => { const s = h('span'); s.style.setProperty('--p', Math.min(100, (p / 16) * 100)); return s; })());
      return h('div', { class: 'muscle-row' + (low ? ' low' : '') }, h('span', { class: 'name' }, m.label), bar, h('span', { class: 'num small' }, String(p)));
    });
    const detail = selected ? h('p', { class: 'notice' }, h('strong', null, MUSCLE_LABEL[selected]), `: ${r.points[selected]} points in the last ${days} days.`, r.low.includes(selected) ? ' Under-trained, so a good target.' : '') : h('p', { class: 'small muted' }, 'Tap a muscle on the body for its points.');
    mapBox.replaceChildren(h('div', { class: 'grid cols-2' },
      h('div', { class: 'card' }, bodyMap(r.points, { selected, onSelect: (k) => { selected = k; drawMap(); } }), h('div', { class: 'row spread' }, heatScale(), h('span', { class: 'small muted' }, `${r.sessions} workout${r.sessions === 1 ? '' : 's'}`)), detail),
      h('div', { class: 'card' }, h('h2', null, 'Points by muscle'), h('p', { class: 'small' }, r.insight), list)));
  }

  function drawLink() {
    const part = M.PART_BY_KEY[partKey];
    const pick = select('part', M.PARTS.filter((p) => p.muscles.length).map((p) => [p.key, p.label]), partKey);
    pick.addEventListener('change', () => { partKey = pick.value; drawLink(); });
    const pairs = M.pairWeeks(weekly, data.entries, partKey, part.muscles);
    const withVal = pairs.filter((p) => p.value != null);
    const totalPts = M.round1(pairs.reduce((a, p) => a + p.points, 0));
    const ch = M.changeSinceStart(data.entries, partKey);
    let verdict;
    if (!ch) verdict = `Add at least two ${part.label.toLowerCase()} measurements on the Body page to compare.`;
    else if (totalPts === 0) verdict = `Your ${part.label.toLowerCase()} changed ${ch.delta > 0 ? '+' : ''}${ch.delta} ${part.unit}, but no ${part.muscles.map((m) => MUSCLE_LABEL[m].toLowerCase()).join(' or ')} training is logged in these 12 weeks.`;
    else verdict = `${part.label} ${ch.delta > 0 ? '+' : ''}${ch.delta} ${part.unit} since ${prettyDate(ch.since)}, with ${totalPts} ${part.muscles.map((m) => MUSCLE_LABEL[m].toLowerCase()).join(' + ')} points over the last 12 weeks. This shows the two side by side. It does not prove one caused the other.`;
    linkBox.replaceChildren(h('div', { class: 'card' },
      h('div', { class: 'row spread' }, h('h2', null, 'Training vs body change'), h('div', null, pick)),
      h('p', null, verdict),
      h('h3', null, `Weekly points · ${part.muscles.map((m) => MUSCLE_LABEL[m]).join(' + ')}`),
      barChart(pairs.map((p) => ({ x: p.week, y: p.points })), { label: 'Weekly muscle points' }),
      h('h3', null, `${part.label} (${part.unit})`),
      withVal.length >= 2 ? lineChart(pairs.map((p) => ({ x: p.week, y: p.value })), { unit: part.unit, label: `${part.label} by week` })
        : empty('Not enough measurements', 'Two entries in the last 12 weeks are needed for this chart.', h('a', { class: 'btn', href: '#/body' }, 'Add measurements'))));
  }

  view.append(h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Muscle map'), h('p', null, 'Which muscles your training has actually reached.')),
    h('div', { class: 'seg', role: 'group', 'aria-label': 'Period' }, [7, 30, 90].map((d) => {
      const b = h('button', { type: 'button', 'aria-pressed': String(d === days), onclick: () => { days = d; b.parentElement.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); drawMap(); } }, `${d} days`);
      return b;
    }))), mapBox, h('div', null), linkBox);
  await drawMap();
  drawLink();
}
