// Tiny DOM helpers. Text is always inserted with textContent, never as HTML.
const SVG_NS = 'http://www.w3.org/2000/svg';

function apply(el, props) {
  for (const [k, v] of Object.entries(props || {})) {
    if (v === false || v == null) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.setAttribute('class', v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked' || k === 'disabled' || k === 'selected') el[k] = !!v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
}
function append(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}
// Let append/prepend/replaceChildren skip null/false so conditional children are easy to write.
for (const m of ['append', 'prepend', 'replaceChildren']) {
  const orig = Element.prototype[m];
  Element.prototype[m] = function (...kids) {
    return orig.apply(this, kids.flat(Infinity).filter((k) => k != null && k !== false));
  };
}

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  apply(el, props);
  append(el, kids);
  return el;
}
export function s(tag, props, ...kids) {
  const el = document.createElementNS(SVG_NS, tag);
  apply(el, props);
  append(el, kids);
  return el;
}
export const $ = (sel, root = document) => root.querySelector(sel);

export function field(label, input, hint) {
  const id = input.id || 'f-' + Math.random().toString(36).slice(2, 8);
  input.id = id;
  const name = input.getAttribute('name');
  return h('div', { class: 'field' },
    h('label', { for: id }, label), input,
    hint ? h('div', { class: 'hint' }, hint) : null,
    h('div', { class: 'err', 'data-err': name, role: 'alert' }));
}
export function select(name, options, value) {
  return h('select', { name }, options.map(([v, l]) => h('option', { value: v, selected: String(v) === String(value) }, l)));
}

// Wire a <form> so submit shows errors from the API next to each field.
export function bindForm(form, onSubmit) {
  const general = h('div', { class: 'form-error', role: 'alert', hidden: true });
  form.prepend(general);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    form.querySelectorAll('[data-err]').forEach((n) => (n.textContent = ''));
    general.hidden = true;
    const btn = form.querySelector('button[type="submit"]');
    if (btn) btn.disabled = true;
    try {
      await onSubmit(Object.fromEntries(new FormData(form)), form);
    } catch (err) {
      let shown = false;
      for (const [k, msg] of Object.entries(err.fields || {})) {
        const slot = form.querySelector(`[data-err="${CSS.escape(k)}"]`);
        if (slot) { slot.textContent = msg; shown = true; }
      }
      if (!shown || !err.fields || !Object.keys(err.fields).length) {
        general.textContent = err.message || 'Something went wrong';
        general.hidden = false;
      }
      const first = form.querySelector('.err:not(:empty)');
      if (first) first.parentElement.querySelector('input,select,textarea')?.focus();
    } finally {
      if (btn) btn.disabled = false;
    }
  });
}

export function toast(message, bad = false) {
  let box = document.querySelector('.toasts');
  if (!box) { box = h('div', { class: 'toasts', 'aria-live': 'polite' }); document.body.append(box); }
  const t = h('div', { class: 'toast' + (bad ? ' bad' : '') }, message);
  box.append(t);
  setTimeout(() => t.remove(), 4200);
}

export function confirmDialog(message, okLabel = 'Delete') {
  return new Promise((resolve) => {
    const dlg = h('dialog', null,
      h('p', null, message),
      h('div', { class: 'row' },
        h('button', { class: 'btn danger', type: 'button', onclick: () => { dlg.close(); resolve(true); } }, okLabel),
        h('button', { class: 'btn', type: 'button', onclick: () => { dlg.close(); resolve(false); } }, 'Cancel')));
    dlg.addEventListener('close', () => { dlg.remove(); resolve(false); });
    document.body.append(dlg);
    dlg.showModal();
  });
}

export const empty = (title, text, action) =>
  h('div', { class: 'empty' }, h('h3', null, title), text ? h('p', null, text) : null, action || null);
export const loading = () => h('div', { class: 'spinner', role: 'status' }, 'Loading…');
