import { h, s } from './dom.js';

export const MUSCLE_LABEL = {
  chest: 'Chest', shoulders: 'Shoulders', biceps: 'Biceps', triceps: 'Triceps', forearms: 'Forearms',
  back: 'Back', core: 'Core', glutes: 'Glutes', quads: 'Quads', hamstrings: 'Hamstrings', calves: 'Calves',
};

// Right-hand-side polygons (x > 100). The left side is a mirror image.
const FRONT = [
  ['shoulders', '121,66 143,70 150,90 134,93 124,80'],
  ['chest', '102,72 121,68 126,84 124,100 102,102'],
  ['core', '104,106 123,106 121,152 104,158'],
  ['biceps', '136,96 152,94 156,128 140,130'],
  ['forearms', '141,134 157,132 165,174 150,178'],
  ['quads', '103,164 130,162 133,240 111,246'],
  ['calves', '112,256 131,252 128,322 116,328'],
];
const BACK = [
  ['shoulders', '121,66 143,70 150,90 134,93 124,80'],
  ['back', '102,64 121,68 128,90 125,128 102,134'],
  ['triceps', '136,96 152,94 156,128 140,130'],
  ['forearms', '141,134 157,132 165,174 150,178'],
  ['glutes', '102,150 127,152 131,186 102,190'],
  ['hamstrings', '103,194 131,190 133,244 111,248'],
  ['calves', '112,256 131,252 128,322 116,328'],
];
const BASE = [
  'M70 64 H130 L128 160 H72 Z',
  'M72 156 H128 L134 336 H112 L100 262 L88 336 H66 Z',
  'M70 66 L52 98 L58 180 L74 178 L76 96 Z',
  'M130 66 L148 98 L142 180 L126 178 L124 96 Z',
  'M92 52 H108 V66 H92 Z',
];

export function heatLevel(p) {
  if (!p) return 0;
  return p < 2 ? 1 : p < 4 ? 2 : p < 8 ? 3 : p < 14 ? 4 : 5;
}
const mirror = (pts) => pts.split(' ').map((p) => { const [x, y] = p.split(','); return `${200 - x},${y}`; }).join(' ');

function figure(title, regions, points, selected, onSelect) {
  const svg = s('svg', { viewBox: '0 0 200 345', role: 'group', 'aria-label': title });
  BASE.forEach((d) => svg.append(s('path', { class: 'body-base', d })));
  svg.append(s('circle', { class: 'body-base', cx: 100, cy: 32, r: 19 }));
  for (const [key, pts] of regions) {
    for (const poly of [pts, mirror(pts)]) {
      const p = points[key] || 0;
      const node = s('polygon', {
        class: `m heat-${heatLevel(p)}${selected === key ? ' on' : ''}`,
        points: poly, 'data-muscle': key, tabindex: 0, role: 'button',
        'aria-label': `${MUSCLE_LABEL[key]}: ${p} points`,
      }, s('title', null, `${MUSCLE_LABEL[key]}: ${p} points`));
      node.addEventListener('click', () => onSelect && onSelect(key));
      node.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect && onSelect(key); } });
      svg.append(node);
    }
  }
  return svg;
}

export function bodyMap(points, { selected = null, onSelect = null } = {}) {
  return h('div', { class: 'bodymap' },
    h('figure', null, figure('Front of body', FRONT, points, selected, onSelect), h('figcaption', null, 'Front')),
    h('figure', null, figure('Back of body', BACK, points, selected, onSelect), h('figcaption', null, 'Back')));
}

export function heatScale() {
  return h('div', { class: 'scale', 'aria-hidden': 'true' }, 'Less ', [0, 1, 2, 3, 4, 5].map((n) => h('i', { class: `heat-${n}` })), ' More');
}
