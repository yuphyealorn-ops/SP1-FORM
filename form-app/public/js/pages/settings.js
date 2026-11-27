import { del, get, patch, post, put } from '../api.js';
import * as store from '../store.js';
import { bindForm, confirmDialog, empty, field, h, select, toast } from '../dom.js';
import { refreshBase } from '../main.js';
import { gyms, placeName, state } from '../state.js';
import { WEEKDAYS, fmtMin } from '../time.js';

export default async function settings(view) {
  const ttBox = h('div'), travelBox = h('div');

  async function drawTimetable() {
    const { classes } = await get('/timetable');
    ttBox.replaceChildren(classes.length ? h('table', null, h('thead', null, h('tr', null, h('th', null, 'Day'), h('th', null, 'Time'), h('th', null, 'Class'), h('th', null, ''))),
      h('tbody', null, classes.map((c) => h('tr', null, h('td', null, WEEKDAYS[c.weekday]), h('td', { class: 'nowrap' }, `${fmtMin(c.start)}–${fmtMin(c.end)}`),
        h('td', null, c.title, c.place_id ? h('div', { class: 'small muted' }, placeName(c.place_id)) : null),
        h('td', null, h('button', { class: 'btn small quiet danger', type: 'button', 'aria-label': `Delete ${c.title}`, onclick: async () => { await del(`/timetable/${c.id}`); drawTimetable(); } }, 'Delete'))))))
      : empty('No classes yet', 'Add your classes so the planner can find the gaps.'));
  }

  function drawTravel() {
    const gs = gyms(), others = state.places.filter((p) => p.kind === 'building');
    const known = (a, b) => (state.travel.find((t) => (t.a === a && t.b === b) || (t.a === b && t.b === a)) || {}).minutes;
    travelBox.replaceChildren(gs.length && others.length ? h('table', null, h('thead', null, h('tr', null, h('th', null, 'Walking time (min)'), gs.map((g) => h('th', { class: 'num' }, g.name)))),
      h('tbody', null, others.map((b) => h('tr', null, h('td', null, b.name), gs.map((g) => {
        const inp = h('input', { type: 'number', min: 0, max: 120, value: known(g.id, b.id) ?? '', 'aria-label': `Minutes from ${b.name} to ${g.name}`, inputmode: 'numeric' });
        inp.addEventListener('change', async () => {
          if (inp.value === '') return;
          try { await put('/travel', { a_id: g.id, b_id: b.id, minutes: Number(inp.value) }); await refreshBase(); toast('Saved'); } catch (e) { toast(e.message, true); }
        });
        return h('td', { class: 'num' }, inp);
      }))))) : empty('Add a gym and a building first'));
  }

  const profile = h('form', { class: 'card', novalidate: true }, h('h2', null, 'Profile'),
    field('Display name', h('input', { name: 'display_name', value: state.user.display_name, maxlength: 40 })),
    h('div', { class: 'form-grid' },
      field('Training level', select('level', [['beginner', 'Beginner'], ['intermediate', 'Intermediate'], ['advanced', 'Advanced']], state.user.level)),
      field('Home gym', select('default_gym_id', [['', 'Not set'], ...gyms().map((g) => [g.id, g.name])], state.user.default_gym_id ?? ''))),
    h('button', { class: 'btn primary', type: 'submit' }, 'Save'));
  bindForm(profile, async (d) => {
    const r = await patch('/me', { display_name: d.display_name, level: d.level, default_gym_id: d.default_gym_id ? Number(d.default_gym_id) : null });
    state.user = r.user; toast('Profile saved');
  });

  const cls = h('form', { class: 'card', novalidate: true }, h('h2', null, 'Add a class'),
    h('div', { class: 'form-grid' }, field('Day', select('weekday', WEEKDAYS.map((d, i) => [i, d]), 0)),
      field('Starts', h('input', { name: 'start', type: 'time', value: '09:00', required: true })), field('Ends', h('input', { name: 'end', type: 'time', value: '11:00', required: true }))),
    h('div', { class: 'form-grid' }, field('Class name', h('input', { name: 'title', maxlength: 60, required: true })),
      field('Building', select('place_id', [['', 'Not set'], ...state.places.filter((p) => p.kind === 'building').map((p) => [p.id, p.name])], ''))),
    h('button', { class: 'btn primary', type: 'submit' }, 'Add class'));
  bindForm(cls, async (d, el) => {
    const body = { ...d, weekday: Number(d.weekday) };
    if (d.place_id) body.place_id = Number(d.place_id); else delete body.place_id;
    await post('/timetable', body); toast('Class added'); el.querySelector('[name="title"]').value = ''; drawTimetable();
  });

  const place = h('form', { class: 'card', novalidate: true }, h('h2', null, 'Add a place'),
    h('div', { class: 'form-grid' }, field('Name', h('input', { name: 'name', maxlength: 60, required: true })), field('Type', select('kind', [['building', 'Building'], ['gym', 'Gym']], 'building'))),
    h('button', { class: 'btn', type: 'submit' }, 'Add place'));
  bindForm(place, async (d, el) => { await post('/places', d); await refreshBase(); toast('Place added'); el.reset(); settings.redraw(); });
  settings.redraw = () => { view.replaceChildren(); settings(view); };

  const exportData = h('button', { class: 'btn', type: 'button', onclick: () => {
    const blob = new Blob([JSON.stringify({ exported: state.today, body: store.load(state.user.id) }, null, 2)], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: 'form-body-data.json' }); document.body.append(a); a.click(); a.remove();
  } }, 'Download my body data');
  const wipe = h('button', { class: 'btn danger', type: 'button', onclick: async () => {
    if (await confirmDialog('Delete all body measurements stored on this device?')) { store.clear(state.user.id); toast('Body data deleted'); }
  } }, 'Delete body data on this device');
  const account = h('form', { class: 'card', novalidate: true }, h('h2', null, 'Delete account'),
    h('p', { class: 'small muted' }, 'Removes your account, workouts, timetable and check-ins from the server. Groups you own pass to another member.'),
    field('Confirm with your password', h('input', { name: 'password', type: 'password', autocomplete: 'current-password' })),
    h('button', { class: 'btn danger', type: 'submit' }, 'Delete my account'));
  bindForm(account, async (d) => {
    if (!(await confirmDialog('Delete your account for good?'))) return;
    await del('/me', d); store.clear(state.user.id); state.user = null; location.hash = '#/'; location.reload();
  });

  view.append(h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Settings'))),
    h('div', { class: 'grid cols-2' }, profile, h('section', { class: 'card stack' }, h('h2', null, 'Your data'),
      h('p', { class: 'small muted' }, 'Body measurements live only in this browser. Everything else (workouts, timetable, groups) is stored on the FORM server.'), exportData, wipe)),
    h('h2', null, 'Timetable'), h('div', { class: 'card' }, ttBox), cls,
    h('h2', null, 'Places and walking times'), h('p', { class: 'small muted' }, 'Shared by everyone on campus, so fix a wrong number and it helps your friends too.'),
    h('div', { class: 'card' }, travelBox), place, account);
  await drawTimetable();
  drawTravel();
}
