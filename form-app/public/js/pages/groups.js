import { post, get } from '../api.js';
import { bindForm, empty, field, h, select, toast } from '../dom.js';
import { state } from '../state.js';
import { prettyDate } from '../time.js';

export default async function groups(view) {
  const { groups: mine } = await get('/groups');
  const lib = state.lib;

  const goalSel = select('goal_key', lib.goals.map((g) => [g.key, g.label]), 'sport_prep');
  const sportWrap = field('Sport', select('sport', lib.sports.map((s) => [s.key, s.label]), 'football'), 'We suggest training types that suit it.');
  goalSel.addEventListener('change', () => { sportWrap.hidden = !lib.goals.find((g) => g.key === goalSel.value).needs_sport; });
  const create = h('form', { class: 'card', novalidate: true },
    h('h2', null, 'Start a group'),
    field('Group name', h('input', { name: 'name', maxlength: 50, required: true, placeholder: 'e.g. Faculty cup prep' })),
    field('Shared goal', goalSel), sportWrap,
    h('div', { class: 'form-grid' },
      field('Target date (optional)', h('input', { name: 'target_date', type: 'date', min: state.today })),
      field('Sessions per week each', h('input', { name: 'weekly_target', type: 'number', min: 1, max: 14, value: 3 }))),
    field('Description (optional)', h('textarea', { name: 'description', maxlength: 300 })),
    h('button', { class: 'btn primary', type: 'submit' }, 'Create group'));
  bindForm(create, async (d) => {
    const body = { ...d, weekly_target: Number(d.weekly_target) };
    if (!body.target_date) delete body.target_date;
    if (sportWrap.hidden) delete body.sport;
    const g = await post('/groups', body);
    toast(`Group created. Invite code: ${g.invite_code}`);
    location.hash = `#/groups/${g.id}`;
  });

  const join = h('form', { class: 'card', novalidate: true },
    h('h2', null, 'Join with a code'),
    field('Invite code', h('input', { name: 'invite_code', maxlength: 16, autocapitalize: 'characters', autocomplete: 'off', required: true })),
    h('button', { class: 'btn', type: 'submit' }, 'Join group'));
  bindForm(join, async (d) => {
    const r = await post('/groups/join', d);
    toast(r.joined ? 'You joined the group' : 'You are already in this group');
    location.hash = `#/groups/${r.group.id}`;
  });

  view.append(h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Groups'), h('p', null, 'Train toward a goal together. Check in after each session.'))),
    mine.length ? h('div', { class: 'grid cols-2' }, mine.map((g) => h('a', { class: 'card', href: `#/groups/${g.id}` },
      h('h2', null, g.name), h('p', { class: 'small muted' }, g.goal_label, g.sport_label ? ` · ${g.sport_label}` : '', g.target_date ? ` · by ${prettyDate(g.target_date)}` : ''),
      h('div', { class: 'chips' }, h('span', { class: 'chip' }, `${g.member_count} member${g.member_count === 1 ? '' : 's'}`), h('span', { class: 'chip accent' }, `${g.my_week_checkins}/${g.weekly_target} this week`)))))
      : empty('No groups yet', 'Create one for your team or club, or join with a code a friend sent you.'),
    h('div', { class: 'grid cols-2' }, create, join));
}
