import { get, post } from '../api.js';
import { empty, field, h, select, toast } from '../dom.js';
import { gyms, placeName, state } from '../state.js';
import { addDays, duration, fmtMin, prettyDate, weekdayOf, WD_SHORT } from '../time.js';

const sel = { date: null, gym: null, focus: 'auto' };

export function planToEntries(workout) {
  return workout.exercises.map((e) => e.kind === 'timed'
    ? { exercise_key: e.key, duration_min: e.duration_min }
    : { exercise_key: e.key, sets: e.sets, reps: parseInt(e.reps, 10) || 10 });
}

function timeline(g) {
  const t = g.timeline, half = Math.floor(g.buffer / 2);
  const seg = (cls, min, label) => {
    const d = h('div', { class: cls, title: `${label}: ${min} min` }, min >= 8 ? label : '');
    d.style.setProperty('flex-grow', String(min));
    d.style.setProperty('flex-basis', '0');
    return d;
  };
  const parts = [];
  if (g.travel_to) parts.push(seg('tl-travel', g.travel_to, 'walk'));
  parts.push(seg('tl-buffer', half, 'change'));
  parts.push(seg('tl-work', g.workout_minutes, 'workout'));
  parts.push(seg('tl-buffer', g.buffer - half, 'change'));
  if (g.travel_back) parts.push(seg('tl-travel', g.travel_back, 'walk'));
  if (t.spare != null && t.spare > 0) parts.push(seg('tl-spare', t.spare, 'spare'));
  return h('div', { class: 'timeline', role: 'img', 'aria-label': 'Breakdown of the gap: walking, changing, workout, spare time' }, parts);
}

function gapCard(g, date, plan, rerender) {
  const title = {
    between: `${fmtMin(g.start)}–${fmtMin(g.end)} · between classes`,
    before: `${fmtMin(g.start)}–${fmtMin(g.end)} · before your first class`,
    after: `${fmtMin(g.start)}–${fmtMin(g.end)} · after your last class`,
    free_day: 'No classes today',
  }[g.kind];
  const card = h('section', { class: 'card' + (g.recommended ? ' accent' : '') });
  card.append(h('div', { class: 'row spread' }, h('h2', null, title),
    g.recommended ? h('span', { class: 'chip accent' }, 'Best fit') : null));
  if (g.prev || g.next) {
    card.append(h('p', { class: 'small muted' },
      g.prev ? `After ${g.prev.title} (ends ${fmtMin(g.prev.end)}). ` : '',
      g.next ? `Next: ${g.next.title} at ${fmtMin(g.next.start)}.` : ''));
  }
  if (!g.feasible) {
    card.append(h('p', null, `${duration(g.gap_minutes)} is not enough once you take off ${g.travel_to + g.travel_back} min of walking, ${g.buffer} min to change${g.safety ? ` and ${g.safety} min spare` : ''}.`),
      h('p', { class: 'small muted' }, 'Try a longer gap, or a closer gym.'));
    return card;
  }
  const maths = g.kind === 'free_day' ? [] : [
    h('div', { class: 'small' },
      `${duration(g.gap_minutes)} gap`,
      g.travel_to ? ` − ${g.travel_to} walk there` : '',
      g.travel_back ? ` − ${g.travel_back} walk back` : '',
      ` − ${g.buffer} changing`, g.safety ? ` − ${g.safety} spare` : '', ' = ',
      h('strong', null, `${g.available} min`), ` → `, h('strong', null, `${g.workout_minutes}-min workout`)),
    timeline(g),
    h('div', { class: 'small muted' }, `Leave at ${fmtMin(g.timeline.leave)}, workout ${fmtMin(g.timeline.workout_start)}–${fmtMin(g.timeline.workout_end)}, back at ${fmtMin(g.timeline.back)}`,
      g.timeline.spare != null ? ` (${g.timeline.spare} min before class).` : '.'),
  ];
  card.append(...maths);
  if (g.estimated) card.append(h('p', { class: 'notice warn small' }, 'A walking time here is a guess (10 min). Set the real time in Settings → Places for a better plan.'));
  if (g.note) card.append(h('p', { class: 'small muted' }, g.note));
  const w = g.workout;
  card.append(h('h3', null, `${w.focus_label} · ${w.total_minutes} min`),
    h('p', { class: 'small muted' }, w.warmup_minutes ? `Warm-up ${w.warmup_minutes} min · ` : '', w.cooldown_minutes ? `cool-down ${w.cooldown_minutes} min` : ''),
    h('ul', { class: 'ex-list' }, w.exercises.map((e) => h('li', null,
      h('span', null, e.name, h('span', { class: 'muted small' }, ` · ${e.main.join(', ')}`)),
      h('span', { class: 'nowrap' }, e.kind === 'timed' ? `${e.duration_min} min` : `${e.sets} × ${e.reps}`)))));
  const past = date > state.today;
  const btn = h('button', { class: 'btn primary', type: 'button', disabled: past,
    title: past ? 'You can log it once you have done it' : null,
    onclick: async (ev) => {
      ev.target.disabled = true;
      try {
        await post('/workouts', { performed_on: date, start: fmtMin(g.timeline ? g.timeline.workout_start : 17 * 60), duration_min: w.total_minutes, note: 'From the planner', entries: planToEntries(w) });
        toast('Workout logged');
        rerender();
      } catch (e) { toast(e.message, true); ev.target.disabled = false; }
    } }, 'Log as done');
  card.append(h('div', { class: 'row' }, btn, past ? h('span', { class: 'small muted' }, 'Available on the day.') : null));
  return card;
}

export default async function plan(view) {
  const gs = gyms();
  sel.date = sel.date || state.today;
  sel.gym = sel.gym || state.user.default_gym_id || (gs[0] && gs[0].id);
  const out = h('div', { class: 'stack' });
  const days = Array.from({ length: 7 }, (_, i) => addDays(state.today, i));
  const strip = h('div', { class: 'week-strip', role: 'group', 'aria-label': 'Choose a day' });
  const drawStrip = () => strip.replaceChildren(...days.map((d) => h('button', { type: 'button', 'aria-pressed': String(d === sel.date), onclick: () => { sel.date = d; drawStrip(); load(); } },
    h('span', { class: 'w' }, d === state.today ? 'Today' : WD_SHORT[weekdayOf(d)]), h('span', { class: 'd' }, String(Number(d.slice(8)))))));
  drawStrip();

  const gymSel = select('gym', gs.map((g) => [g.id, g.name]), sel.gym);
  gymSel.addEventListener('change', () => { sel.gym = Number(gymSel.value); load(); });
  const focusSel = select('focus', [['auto', 'Auto (least-trained muscles)'], ...state.lib.focuses.map((f) => [f.key, f.label])], sel.focus);
  focusSel.addEventListener('change', () => { sel.focus = focusSel.value; load(); });

  async function load() {
    if (!sel.gym) { out.replaceChildren(empty('Add a gym first', 'Add a gym under Settings → Places.')); return; }
    try {
      const d = await get(`/planner/day?date=${sel.date}&gym_id=${sel.gym}&focus=${sel.focus}`);
      const classes = d.classes.length
        ? h('p', { class: 'small muted' }, 'Classes: ', d.classes.map((c) => `${c.title} ${fmtMin(c.start)}–${fmtMin(c.end)}${c.place_id ? ' @ ' + placeName(c.place_id) : ''}`).join(' · '))
        : null;
      const noTimetable = !d.classes.length && !state.noTimetableHint;
      out.replaceChildren(
        h('p', null, h('strong', null, prettyDate(d.date, state.today)), ' at ', d.gym.name, '. ', d.focus_reason),
        classes,
        noTimetable ? h('p', { class: 'notice small' }, 'No classes on this day. Add your timetable in Settings so the planner can work around it.') : null,
        ...d.gaps.map((g) => gapCard(g, d.date, d, load)));
    } catch (e) { out.replaceChildren(h('div', { class: 'notice warn', role: 'alert' }, e.message)); }
  }

  view.append(
    h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Plan a workout'),
      h('p', null, 'Every gap in your timetable, sized for the walk to the gym and back.'))),
    h('div', { class: 'card flat stack' }, strip, h('div', { class: 'grid cols-2' },
      field('Gym', gymSel), field('Focus', focusSel))),
    out);
  await load();
}
