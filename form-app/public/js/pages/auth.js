import { post } from '../api.js';
import { bindForm, field, h, select } from '../dom.js';

export function authPage(onDone) {
  let mode = 'login';
  const card = h('div', { class: 'card' });
  const draw = () => {
    const reg = mode === 'register';
    const form = h('form', { novalidate: true },
      h('h2', null, reg ? 'Create your account' : 'Welcome back'),
      field('Username', h('input', { name: 'username', autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false', required: true }), reg ? 'Letters, numbers and underscores, 3–24 characters' : null),
      reg ? field('Display name', h('input', { name: 'display_name', autocomplete: 'nickname', maxlength: 40 }), 'Shown to your group and gym buddies') : null,
      field('Password', h('input', { name: 'password', type: 'password', autocomplete: reg ? 'new-password' : 'current-password', required: true }), reg ? 'At least 8 characters' : null),
      reg ? field('Training level', select('level', [['beginner', 'Beginner'], ['intermediate', 'Intermediate'], ['advanced', 'Advanced']], 'beginner')) : null,
      h('button', { class: 'btn primary', type: 'submit' }, reg ? 'Create account' : 'Sign in'));
    bindForm(form, async (data) => {
      const res = await post(reg ? '/auth/register' : '/auth/login', data);
      await onDone(res.user);
    });
    card.replaceChildren(form,
      h('p', { class: 'small muted' }, reg ? 'Already have an account? ' : 'New here? ',
        h('a', { href: '#', onclick: (e) => { e.preventDefault(); mode = reg ? 'login' : 'register'; draw(); } }, reg ? 'Sign in' : 'Create an account')));
  };
  draw();
  return h('div', { class: 'auth-wrap' }, h('div', { class: 'auth' },
    h('div', { class: 'pitch' },
      h('h1', null, 'FORM'),
      h('p', null, 'Train around your classes, not instead of them.'),
      h('ul', null,
        h('li', null, 'Workouts sized to your timetable, including the walk to the gym and back.'),
        h('li', null, 'Body measurements and a muscle map that stay on your device.'),
        h('li', null, 'Groups with a shared goal, and gym buddies who fit your schedule.'))),
    card));
}
