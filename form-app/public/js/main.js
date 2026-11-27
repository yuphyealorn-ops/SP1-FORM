import { get, post } from './api.js';
import { h, loading, toast } from './dom.js';
import { state } from './state.js';

const ROUTES = [
  { path: /^\/?$/, nav: 'today', load: () => import('./pages/today.js') },
  { path: /^\/plan$/, nav: 'plan', load: () => import('./pages/plan.js') },
  { path: /^\/log$/, nav: 'log', load: () => import('./pages/log.js') },
  { path: /^\/body$/, nav: 'body', load: () => import('./pages/body.js') },
  { path: /^\/muscles$/, nav: 'muscles', load: () => import('./pages/muscles.js') },
  { path: /^\/groups$/, nav: 'groups', load: () => import('./pages/groups.js') },
  { path: /^\/groups\/(\d+)$/, nav: 'groups', load: () => import('./pages/group.js') },
  { path: /^\/buddy$/, nav: 'buddy', load: () => import('./pages/buddy.js') },
  { path: /^\/settings$/, nav: 'settings', load: () => import('./pages/settings.js') },
];
const NAV = [
  ['today', '#/', 'Today'], ['plan', '#/plan', 'Plan'], ['log', '#/log', 'Workouts'], ['body', '#/body', 'Body'],
  ['muscles', '#/muscles', 'Muscles'], ['groups', '#/groups', 'Groups'], ['buddy', '#/buddy', 'Gym buddy'], ['settings', '#/settings', 'Settings'],
];
const app = document.getElementById('app');
let seq = 0;

export async function refreshBase() {
  const [lib, pl] = await Promise.all([get('/library'), get('/places')]);
  state.lib = lib;
  state.places = pl.places;
  state.travel = pl.travel;
}

async function boot() {
  try {
    const me = await get('/me');
    state.today = me.today;
    state.user = me.user;
    if (state.user) await refreshBase();
  } catch (e) {
    app.replaceChildren(h('main', null, h('div', { class: 'notice warn' }, e.message)));
    return;
  }
  render();
}

function shell(content, navKey) {
  const links = NAV.map(([k, href, label]) => h('a', { href, 'aria-current': k === navKey ? 'page' : null }, label));
  return [
    h('header', { class: 'topbar' }, h('div', { class: 'topbar-inner' },
      h('a', { class: 'brand', href: '#/' }, 'FORM'),
      h('nav', { class: 'nav', 'aria-label': 'Main' }, links),
      h('span', { class: 'who' }, state.user.display_name),
      h('button', { class: 'btn small quiet', type: 'button', onclick: logout }, 'Sign out'))),
    content,
  ];
}

async function logout() {
  try { await post('/auth/logout'); } catch { /* already signed out */ }
  state.user = null;
  render();
}

export async function signedIn(user) {
  state.user = user;
  state.today = (await get('/me')).today;
  await refreshBase();
  location.hash = '#/';
  render();
}

async function render() {
  const my = ++seq;
  if (!state.user) {
    const { authPage } = await import('./pages/auth.js');
    app.replaceChildren(authPage(signedIn));
    document.title = 'Sign in · FORM';
    return;
  }
  const path = location.hash.replace(/^#/, '') || '/';
  const route = ROUTES.find((r) => r.path.test(path)) || ROUTES[0];
  const params = (path.match(route.path) || []).slice(1);
  const main = h('main', { id: 'main', tabindex: '-1' }, loading());
  app.replaceChildren(...shell(main, route.nav));
  try {
    const mod = await route.load();
    if (my !== seq) return;
    const view = h('div');
    await mod.default(view, ...params);
    if (my !== seq) return;
    main.replaceChildren(view);
    const t = view.querySelector('h1');
    document.title = (t ? t.textContent + ' · ' : '') + 'FORM';
    if (!render.first) { main.focus({ preventScroll: true }); }
    render.first = false;
  } catch (e) {
    if (my !== seq) return;
    main.replaceChildren(h('div', { class: 'notice warn', role: 'alert' }, e.message || 'Could not load this page'),
      h('button', { class: 'btn', type: 'button', onclick: render }, 'Try again'));
  }
}
render.first = true;

window.addEventListener('hashchange', () => { if (state.user) render(); });
window.addEventListener('auth-lost', () => { if (state.user) { state.user = null; toast('Please sign in again', true); render(); } });
boot();
