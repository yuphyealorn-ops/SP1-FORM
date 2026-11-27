import { get } from '../api.js';
import { empty, h } from '../dom.js';
import { MUSCLE_LABEL } from '../bodymap.js';
import { state } from '../state.js';
import { duration, fmtMin, prettyDate } from '../time.js';

export default async function today(view) {
  const [muscles, plan, groups, mine] = await Promise.all([
    get('/progress/muscles?days=7'),
    state.user.default_gym_id ? get(`/planner/day?date=${state.today}`).catch(() => null) : null,
    get('/groups'),
    get('/buddies/mine'),
  ]);
  const best = plan && plan.gaps.find((g) => g.recommended);
  const upcoming = mine.sessions.filter((s) => !s.past && !s.cancelled).slice(0, 3);
  const lowNames = muscles.low.map((m) => MUSCLE_LABEL[m].toLowerCase());

  view.append(
    h('div', { class: 'page-head' }, h('div', null, h('h1', null, `Hi, ${state.user.display_name}`),
      h('p', null, prettyDate(state.today, state.today), ' · ', muscles.sessions ? `${muscles.sessions} workout${muscles.sessions === 1 ? '' : 's'} this week` : 'no workouts logged this week'))),
    h('div', { class: 'grid cols-2' },
      h('section', { class: 'card' }, h('h2', null, 'Your next workout window'),
        best ? [
          h('p', null, h('span', { class: 'stat' }, `${best.workout_minutes}`, h('small', null, 'min')), ' ',
            best.kind === 'between' ? `between classes, ${fmtMin(best.start)}–${fmtMin(best.end)}` : best.kind === 'free_day' ? 'any time today' : `${fmtMin(best.start)}–${fmtMin(best.end)}`),
          h('p', { class: 'small muted' }, `${duration(best.gap_minutes)} gap, minus ${best.travel_to + best.travel_back} min walking and changing time. Focus: ${best.workout.focus_label.split(' (')[0]}.`),
          h('a', { class: 'btn primary', href: '#/plan' }, 'See the plan'),
        ] : plan ? [h('p', null, 'No gap today is long enough for a workout.'), h('a', { class: 'btn', href: '#/plan' }, 'Look at other days')]
          : [h('p', null, 'Set your home gym and timetable and I will find the gaps for you.'), h('a', { class: 'btn primary', href: '#/settings' }, 'Open settings')]),
      h('section', { class: 'card' }, h('h2', null, 'Muscle balance this week'),
        h('p', { class: 'small' }, muscles.insight),
        lowNames.length && lowNames.length < 11 ? h('p', { class: 'small muted' }, 'Good targets for your next session: ', lowNames.slice(0, 3).join(', '), '.') : null,
        h('a', { href: '#/muscles' }, 'Open the muscle map'))),
    h('div', { class: 'grid cols-2' },
      h('section', { class: 'card' }, h('h2', null, 'Groups'),
        groups.groups.length ? h('ul', { class: 'list' }, groups.groups.map((g) => h('li', null,
          h('div', { class: 'row spread' }, h('a', { href: `#/groups/${g.id}` }, g.name), h('span', { class: 'chip' }, `${g.my_week_checkins}/${g.weekly_target} this week`)),
          h('div', { class: 'bar' + (g.my_week_checkins >= g.weekly_target ? ' good' : '') }, (() => { const b = h('span'); b.style.setProperty('--p', Math.min(100, (g.my_week_checkins / g.weekly_target) * 100)); return b; })()))))
          : empty('No group yet', 'Train toward a shared goal with friends.', h('a', { class: 'btn', href: '#/groups' }, 'Create or join a group'))),
      h('section', { class: 'card' }, h('h2', null, 'Gym buddy sessions'),
        upcoming.length ? h('ul', { class: 'list' }, upcoming.map((s) => h('li', null,
          h('strong', null, `${prettyDate(s.session_on, state.today)} ${fmtMin(s.start)}`), ' · ', s.focus_label.split(' (')[0], ' · ', s.place_name,
          h('div', { class: 'small muted' }, s.is_mine ? (s.partners.length ? `With ${s.partners.map((p) => p.display_name).join(', ')}` : 'Waiting for a partner') : `With ${s.host_name}`))))
          : empty('Nothing booked', 'Find a training partner who fits your timetable.', h('a', { class: 'btn', href: '#/buddy' }, 'Find a buddy')))),
  );
}
