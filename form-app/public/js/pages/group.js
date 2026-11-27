import { del, get, post } from '../api.js';
import { bindForm, confirmDialog, empty, field, h, select, toast } from '../dom.js';
import { state } from '../state.js';
import { duration, prettyDate } from '../time.js';

export default async function group(view, id) {
  const [g, ci, ps, ws] = await Promise.all([get(`/groups/${id}`), get(`/groups/${id}/checkins`), get(`/groups/${id}/posts`), get('/workouts')]);
  const types = state.lib.training_types;
  const again = () => { view.replaceChildren(); group(view, id).catch((e) => toast(e.message, true)); };
  const prog = g.progress;
  const pct = (n, d) => Math.min(100, d ? (n / d) * 100 : 0);
  const bar = (n, d, good) => { const s = h('span'); s.style.setProperty('--p', pct(n, d)); return h('div', { class: 'bar' + (good ? ' good' : '') }, s); };

  const header = h('div', { class: 'page-head' }, h('div', null, h('h1', null, g.name),
    h('p', null, g.goal_label, g.sport_label ? ` · ${g.sport_label}` : '', g.days_left != null ? ` · ${g.days_left >= 0 ? g.days_left + ' days to go' : 'target date passed'}` : '')),
    h('a', { class: 'btn small', href: '#/groups' }, 'All groups'));

  const invite = g.invite_code ? h('div', { class: 'notice' }, 'Invite code: ', h('strong', null, g.invite_code), ' · share it with the people you want in the group.') : null;
  const overview = h('section', { class: 'card' }, h('h2', null, 'This week'),
    h('div', { class: 'stat' }, `${prog.week_checkins}`, h('small', null, `of ${prog.week_goal} sessions`)), bar(prog.week_checkins, prog.week_goal, prog.week_checkins >= prog.week_goal),
    h('p', { class: 'small muted' }, `${prog.total_checkins} check-ins and ${duration(prog.total_minutes)} trained in total.`),
    h('table', null, h('thead', null, h('tr', null, h('th', null, 'Member'), h('th', { class: 'num' }, 'This week'), h('th', { class: 'num' }, 'Streak'))),
      h('tbody', null, g.members.map((m) => h('tr', null,
        h('td', null, m.display_name, m.is_me ? ' (you)' : '', m.role === 'owner' ? h('span', { class: 'chip' }, 'owner') : null),
        h('td', { class: 'num' }, `${m.week_checkins}/${g.weekly_target}`), h('td', { class: 'num' }, m.streak_weeks ? `${m.streak_weeks} wk` : '–'))))));

  const plan = h('section', { class: 'card' }, h('h2', null, 'Suggested training this week'),
    h('p', { class: 'small muted' }, 'Based on your goal. Counts are for the whole group.'),
    h('ul', { class: 'list' }, g.plan.map((b) => h('li', null,
      h('div', { class: 'row spread' }, h('strong', null, b.label), h('span', { class: 'chip' }, `${b.done_this_week}/${b.goal_this_week}`)),
      bar(b.done_this_week, b.goal_this_week, b.done_this_week >= b.goal_this_week),
      h('p', { class: 'small' }, b.why), h('p', { class: 'small muted' }, 'Try: ', b.exercises.map((e) => e.name).join(', '))))));

  const ciForm = h('form', { class: 'card', novalidate: true }, h('h2', null, 'Check in'),
    field('Session type', select('session_type', types.map((t) => [t.key, t.label]), g.plan[0] ? g.plan[0].type : types[0].key)),
    h('div', { class: 'form-grid' }, field('Minutes', h('input', { name: 'duration_min', type: 'number', min: 5, max: 300, value: 45, required: true })),
      field('Date', h('input', { name: 'performed_on', type: 'date', value: state.today, max: state.today }))),
    field('Note (optional)', h('input', { name: 'note', maxlength: 200 })),
    h('button', { class: 'btn primary', type: 'submit' }, 'Check in'));
  bindForm(ciForm, async (d) => { await post(`/groups/${id}/checkins`, { ...d, duration_min: Number(d.duration_min) }); toast('Checked in'); again(); });

  const feed = h('section', { class: 'card' }, h('h2', null, 'Recent check-ins'),
    ci.checkins.length ? h('ul', { class: 'list' }, ci.checkins.slice(0, 12).map((c) => h('li', { class: 'row spread' },
      h('span', null, h('strong', null, c.is_me ? 'You' : c.display_name), ` · ${c.session_label} · ${duration(c.duration_min)}`, c.note ? h('span', { class: 'small muted' }, ` · ${c.note}`) : null,
        h('div', { class: 'small muted' }, prettyDate(c.performed_on, state.today))),
      c.is_me ? h('button', { class: 'btn small quiet danger', type: 'button', onclick: async () => { await del(`/groups/${id}/checkins/${c.id}`); again(); } }, 'Undo') : null)))
      : empty('No check-ins yet', 'Be the first.'));

  const kindSel = select('kind', [['resource', 'Resource (link or tip)'], ['plan', 'Workout plan']], 'resource');
  const wSel = select('workout_id', [['', 'Describe it below'], ...ws.workouts.slice(0, 15).map((w) => [w.id, `${prettyDate(w.performed_on, state.today)} · ${w.entries.map((e) => e.name).slice(0, 2).join(', ')}`])], '');
  const wField = field('Share one of your workouts', wSel);
  const urlField = field('Link (optional)', h('input', { name: 'url', type: 'url', placeholder: 'https://', maxlength: 300 }));
  const sync = () => { wField.hidden = kindSel.value !== 'plan'; urlField.hidden = kindSel.value !== 'resource'; };
  kindSel.addEventListener('change', sync); sync();
  const postForm = h('form', { class: 'card', novalidate: true }, h('h2', null, 'Share with the group'),
    field('Type', kindSel), field('Title', h('input', { name: 'title', maxlength: 80, required: true })), wField, urlField,
    field('Notes', h('textarea', { name: 'body', maxlength: 1000 })), h('button', { class: 'btn primary', type: 'submit' }, 'Post'));
  bindForm(postForm, async (d) => {
    const body = { kind: d.kind, title: d.title, body: d.body };
    if (d.kind === 'plan' && d.workout_id) body.workout_id = Number(d.workout_id);
    if (d.kind === 'resource' && d.url) body.url = d.url;
    await post(`/groups/${id}/posts`, body); toast('Shared'); again();
  });

  const board = h('section', { class: 'card' }, h('h2', null, 'Shared plans and resources'),
    ps.posts.length ? h('ul', { class: 'list' }, ps.posts.map((p) => h('li', null,
      h('div', { class: 'row spread' }, h('strong', null, p.title, ' ', h('span', { class: 'chip' }, p.kind)),
        p.can_delete ? h('button', { class: 'btn small quiet danger', type: 'button', onclick: async () => { if (await confirmDialog('Delete this post?')) { await del(`/groups/${id}/posts/${p.id}`); again(); } } }, 'Delete') : null),
      h('div', { class: 'small muted' }, `${p.display_name}`),
      p.body ? h('p', { class: 'small' }, p.body) : null,
      p.url ? h('p', { class: 'small' }, h('a', { href: p.url, rel: 'noopener noreferrer nofollow', target: '_blank' }, p.url)) : null,
      p.plan ? h('ul', { class: 'ex-list' }, p.plan.exercises.map((e) => h('li', null, h('span', null, e.name), h('span', null, e.reps != null ? `${e.sets} × ${e.reps}` : `${e.duration_min} min`)))) : null)))
      : empty('Nothing shared yet', 'Post a workout plan or a useful link.'));

  const leave = h('div', { class: 'row' }, h('button', { class: 'btn danger small', type: 'button', onclick: async () => {
    if (!(await confirmDialog('Leave this group?', 'Leave'))) return;
    await post(`/groups/${id}/leave`); location.hash = '#/groups';
  } }, 'Leave group'), g.role === 'owner' ? h('button', { class: 'btn danger small', type: 'button', onclick: async () => {
    if (!(await confirmDialog('Delete the group for everyone? This cannot be undone.'))) return;
    await del(`/groups/${id}`); location.hash = '#/groups';
  } }, 'Delete group') : null);

  view.append(header, invite, g.description ? h('p', null, g.description) : null,
    h('div', { class: 'grid cols-2' }, overview, plan), h('div', { class: 'grid cols-2' }, ciForm, feed), h('div', { class: 'grid cols-2' }, postForm, board), leave);
}
