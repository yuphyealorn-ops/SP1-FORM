import { del, get, post } from '../api.js';
import { MUSCLE_LABEL } from '../bodymap.js';
import { confirmDialog, empty, field, h, select, toast } from '../dom.js';
import { state } from '../state.js';
import { addDays, duration, prettyDate } from '../time.js';

function entryText(e) {
  if (e.reps == null && e.duration_min != null) return `${e.duration_min} min`;
  return `${e.sets} × ${e.reps}${e.weight_kg ? ` @ ${e.weight_kg} kg` : ''}`;
}

function exerciseRow(onRemove) {
  const ex = state.lib.exercises;
  const cats = [...new Set(ex.map((e) => e.category))];
  const pick = h('select', { name: 'exercise_key', 'aria-label': 'Exercise' },
    cats.map((c) => h('optgroup', { label: c[0].toUpperCase() + c.slice(1) },
      ex.filter((e) => e.category === c).map((e) => h('option', { value: e.key }, e.name)))),
    h('optgroup', { label: 'Other' }, h('option', { value: 'custom' }, 'Something else…')));
  const customName = h('input', { name: 'name', placeholder: 'Exercise name', maxlength: 60, 'aria-label': 'Custom exercise name' });
  const muscles = h('div', { class: 'chips' }, state.lib.muscles.map((m) =>
    h('label', { class: 'check small' }, h('input', { type: 'checkbox', name: 'main', value: m.key }), m.label)));
  const custom = h('div', { hidden: true, class: 'stack' }, customName, h('div', { class: 'small muted' }, 'Main muscles worked:'), muscles);
  const sets = h('input', { name: 'sets', type: 'number', min: 1, max: 20, value: 3, 'aria-label': 'Sets', inputmode: 'numeric' });
  const reps = h('input', { name: 'reps', type: 'number', min: 1, max: 200, value: 10, 'aria-label': 'Reps', inputmode: 'numeric' });
  const kg = h('input', { name: 'weight_kg', type: 'number', min: 0, max: 500, step: 0.5, placeholder: 'kg', 'aria-label': 'Weight in kg', inputmode: 'decimal' });
  const mins = h('input', { name: 'duration_min', type: 'number', min: 1, max: 240, value: 20, 'aria-label': 'Minutes', inputmode: 'numeric' });
  const setBox = h('div', { class: 'form-grid' }, h('div', null, h('label', null, 'Sets'), sets), h('div', null, h('label', null, 'Reps'), reps), h('div', null, h('label', null, 'Weight (kg)'), kg));
  const timeBox = h('div', { hidden: true }, h('label', null, 'Minutes'), mins);
  const err = h('div', { class: 'err', role: 'alert' });
  const root = h('div', { class: 'card flat stack' }, h('div', { class: 'row spread' }, pick,
    h('button', { class: 'btn small quiet', type: 'button', onclick: onRemove }, 'Remove')), custom, setBox, timeBox, err);
  const sync = () => {
    const k = pick.value, e = ex.find((x) => x.key === k);
    const timed = e ? e.kind === 'timed' : false;
    custom.hidden = k !== 'custom';
    setBox.hidden = timed;
    timeBox.hidden = !timed;
  };
  pick.addEventListener('change', sync);
  sync();
  root.read = () => {
    const k = pick.value, e = ex.find((x) => x.key === k);
    const timed = e && e.kind === 'timed';
    const out = { exercise_key: k };
    if (k === 'custom') {
      out.name = customName.value;
      out.main = [...muscles.querySelectorAll('input:checked')].map((i) => i.value);
    }
    if (timed) out.duration_min = Number(mins.value);
    else { out.sets = Number(sets.value); out.reps = Number(reps.value); if (kg.value !== '') out.weight_kg = Number(kg.value); }
    return out;
  };
  root.showError = (msg) => { err.textContent = msg; };
  return root;
}

export default async function log(view) {
  const list = h('div', { class: 'stack' });
  const formBox = h('div');

  async function load() {
    const { workouts } = await get(`/workouts?from=${addDays(state.today, -60)}`);
    if (!workouts.length) { list.replaceChildren(empty('No workouts yet', 'Log one above, or use a plan from the Plan page.')); return; }
    list.replaceChildren(...workouts.map((w) => h('article', { class: 'card' },
      h('div', { class: 'row spread' }, h('h3', null, prettyDate(w.performed_on, state.today), ' · ', duration(w.duration_min)),
        h('button', { class: 'btn small quiet danger', type: 'button', onclick: async () => {
          if (!(await confirmDialog('Delete this workout? Your muscle points will go down too.'))) return;
          try { await del(`/workouts/${w.id}`); toast('Workout deleted'); load(); } catch (e) { toast(e.message, true); }
        } }, 'Delete')),
      w.note ? h('p', { class: 'small muted' }, w.note) : null,
      h('ul', { class: 'ex-list' }, w.entries.map((e) => h('li', null, h('span', null, e.name), h('span', { class: 'nowrap' }, entryText(e))))),
      h('div', { class: 'chips' }, Object.entries(w.points).sort((a, b) => b[1] - a[1]).map(([m, p]) => h('span', { class: 'chip' }, `${MUSCLE_LABEL[m]} ${p}`))))));
  }

  function openForm() {
    const rows = h('div', { class: 'stack' });
    const addRow = () => { const r = exerciseRow(() => { if (rows.children.length > 1) r.remove(); }); rows.append(r); };
    addRow();
    const form = h('form', { class: 'card stack', novalidate: true },
      h('h2', null, 'Log a workout'),
      h('div', { class: 'form-grid' },
        field('Date', h('input', { name: 'performed_on', type: 'date', value: state.today, max: state.today, required: true })),
        field('Total minutes', h('input', { name: 'duration_min', type: 'number', min: 5, max: 300, value: 45, required: true, inputmode: 'numeric' }))),
      field('Note (optional)', h('input', { name: 'note', maxlength: 300 })),
      rows,
      h('div', { class: 'row' }, h('button', { class: 'btn', type: 'button', onclick: addRow }, 'Add exercise'),
        h('button', { class: 'btn primary', type: 'submit' }, 'Save workout'),
        h('button', { class: 'btn quiet', type: 'button', onclick: () => formBox.replaceChildren(openBtn) }, 'Cancel')),
      h('div', { class: 'form-error', role: 'alert', hidden: true }));
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const fd = new FormData(form);
      const msg = form.querySelector('.form-error');
      msg.hidden = true;
      [...rows.children].forEach((r) => r.showError(''));
      try {
        await post('/workouts', {
          performed_on: fd.get('performed_on'), duration_min: Number(fd.get('duration_min')), note: fd.get('note'),
          entries: [...rows.children].map((r) => r.read()),
        });
        toast('Workout saved');
        formBox.replaceChildren(openBtn);
        load();
      } catch (e) {
        let used = false;
        for (const [k, m] of Object.entries(e.fields || {})) {
          const mt = k.match(/^entries\.(\d+)\.(.*)$/);
          if (mt && rows.children[mt[1]]) { rows.children[mt[1]].showError(`${mt[2]}: ${m}`); used = true; }
        }
        msg.textContent = used ? 'Please fix the exercises marked below.' : e.message;
        msg.hidden = false;
      }
    });
    formBox.replaceChildren(form);
    form.querySelector('select').focus();
  }
  const openBtn = h('button', { class: 'btn primary', type: 'button', onclick: openForm }, 'Log a workout');
  formBox.append(openBtn);

  view.append(h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Workouts'),
    h('p', null, 'Every set earns muscle points: 1 per set for main muscles, half a point for helpers.'))), formBox, h('h2', null, 'Last 60 days'), list);
  await load();
}
