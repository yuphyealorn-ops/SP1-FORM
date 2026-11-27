import { get, post } from '../api.js';
import { bindForm, empty, field, h, select, toast } from '../dom.js';
import { gyms, state } from '../state.js';
import { duration, fmtMin, prettyDate } from '../time.js';

const tone = (s) => (s >= 80 ? 'good' : s >= 60 ? 'accent' : s >= 40 ? 'warn' : '');

export default async function buddy(view) {
  const open = h('div', { class: 'stack' }), mineBox = h('div', { class: 'stack' });
  const refresh = () => { load().catch((e) => toast(e.message, true)); };

  async function load() {
    const [o, m] = await Promise.all([get('/buddies'), get('/buddies/mine')]);
    open.replaceChildren(...(o.sessions.length ? o.sessions.map((s) => h('article', { class: 'card' },
      h('div', { class: 'row spread' }, h('h3', null, `${prettyDate(s.session_on, state.today)} ${fmtMin(s.start)} · ${s.focus_label.split(' (')[0]}`),
        h('span', { class: `chip ${tone(s.match.score)}` }, `${s.match.label} · ${s.match.score}`)),
      h('p', { class: 'small muted' }, `${s.host_name} (${s.host_level}) · ${s.place_name} · ${duration(s.duration)} · ${s.slots - s.taken} spot${s.slots - s.taken === 1 ? '' : 's'} left`,
        s.need_spotter ? ' · wants a spotter' : '', s.level !== 'any' ? ` · ${s.level} level` : ''),
      s.note ? h('p', { class: 'small' }, `“${s.note}”`) : null,
      h('ul', { class: 'list' }, s.match.reasons.map((r) => h('li', { class: 'small' }, h('span', { class: r.ok === true ? 'delta-up' : r.ok === false ? 'delta-down' : 'muted' }, r.ok === true ? 'Yes · ' : r.ok === false ? 'No · ' : '… '), r.text))),
      s.joined ? h('span', { class: 'chip good' }, 'You joined') : h('button', { class: 'btn primary', type: 'button', onclick: async (e) => {
        e.target.disabled = true;
        try { const r = await post(`/buddies/${s.id}/join`); toast(r.fit.message); refresh(); } catch (err) { toast(err.message, true); e.target.disabled = false; }
      } }, 'Join session')))
      : [empty('No open sessions', 'Post your own and let others find you.')]));
    mineBox.replaceChildren(...(m.sessions.length ? m.sessions.map((s) => h('article', { class: 'card flat' },
      h('div', { class: 'row spread' }, h('strong', null, `${prettyDate(s.session_on, state.today)} ${fmtMin(s.start)} · ${s.focus_label.split(' (')[0]} · ${s.place_name}`),
        s.cancelled ? h('span', { class: 'chip bad' }, 'cancelled') : s.past ? h('span', { class: 'chip' }, 'done') : null),
      h('p', { class: 'small muted' }, s.is_mine ? (s.partners.length ? `Partners: ${s.partners.map((p) => p.display_name).join(', ')}` : `Waiting for a partner (${s.slots} spot${s.slots === 1 ? '' : 's'})`) : `Hosted by ${s.host_name}`),
      !s.past && !s.cancelled ? h('button', { class: 'btn small danger', type: 'button', onclick: async () => {
        try { await post(`/buddies/${s.id}/${s.is_mine ? 'cancel' : 'leave'}`); toast(s.is_mine ? 'Session cancelled' : 'You left the session'); refresh(); } catch (err) { toast(err.message, true); }
      } }, s.is_mine ? 'Cancel session' : 'Leave') : null))
      : [h('p', { class: 'muted small' }, 'Nothing yet.')]));
  }

  const f = state.lib;
  const form = h('form', { class: 'card', novalidate: true }, h('h2', null, 'Post a session'),
    h('div', { class: 'form-grid' },
      field('Focus', select('focus', f.focuses.map((x) => [x.key, x.label]), 'legs')),
      field('Gym', select('place_id', gyms().map((g) => [g.id, g.name]), state.user.default_gym_id))),
    h('div', { class: 'form-grid' },
      field('Date', h('input', { name: 'session_on', type: 'date', min: state.today, value: state.today, required: true })),
      field('Start', h('input', { name: 'start', type: 'time', value: '17:00', required: true })),
      field('Minutes', h('input', { name: 'duration_min', type: 'number', min: 20, max: 240, value: 60 }))),
    h('div', { class: 'form-grid' },
      field('Partner level', select('level', [['any', 'Any level'], ['beginner', 'Beginner'], ['intermediate', 'Intermediate'], ['advanced', 'Advanced']], 'any')),
      field('Spots', h('input', { name: 'slots', type: 'number', min: 1, max: 5, value: 1 }))),
    h('label', { class: 'check field' }, h('input', { type: 'checkbox', name: 'need_spotter' }), 'I want a spotter'),
    field('Note (optional)', h('input', { name: 'note', maxlength: 200, placeholder: 'e.g. Heavy squats, happy to share the rack' })),
    h('button', { class: 'btn primary', type: 'submit' }, 'Post session'));
  bindForm(form, async (d, el) => {
    const r = await post('/buddies', { ...d, duration_min: Number(d.duration_min), slots: Number(d.slots), place_id: Number(d.place_id), need_spotter: el.querySelector('[name="need_spotter"]').checked });
    toast(r.fit.fits ? 'Session posted. ' + r.fit.message : 'Posted, but note: ' + r.fit.message);
    refresh();
  });

  view.append(h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Gym buddy'),
    h('p', null, 'Find a training partner. Sessions are ranked by fit with your classes and walking time, your gym, the muscles you have neglected, and level.'))),
    h('div', { class: 'grid cols-2' }, h('div', { class: 'stack' }, h('h2', null, 'Open sessions for you'), open), h('div', { class: 'stack' }, form, h('h2', null, 'Your sessions'), mineBox)));
  await load();
}
