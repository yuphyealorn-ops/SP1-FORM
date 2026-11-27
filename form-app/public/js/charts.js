import { s } from './dom.js';

const W = 560, H = 230, M = { l: 44, r: 14, t: 14, b: 30 };

function niceRange(min, max) {
  if (min === max) { min -= 1; max += 1; }
  const pad = (max - min) * 0.15;
  return [min - pad, max + pad];
}
const short = (iso) => iso.slice(5).replace('-', '/');

// points: [{x: label, y: number|null}] ; second optional series drawn in the alternate colour.
export function lineChart(points, { unit = '', alt = null, label = 'Chart' } = {}) {
  const svg = s('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': label });
  const all = [...points, ...(alt || [])].map((p) => p.y).filter((v) => v != null);
  if (!all.length) return svg;
  const [lo, hi] = niceRange(Math.min(...all), Math.max(...all));
  const n = points.length;
  const X = (i) => M.l + (n === 1 ? (W - M.l - M.r) / 2 : (i * (W - M.l - M.r)) / (n - 1));
  const Y = (v) => M.t + (1 - (v - lo) / (hi - lo)) * (H - M.t - M.b);
  for (let i = 0; i <= 3; i++) {
    const v = lo + ((hi - lo) * i) / 3, y = Y(v);
    svg.append(s('line', { class: 'grid', x1: M.l, x2: W - M.r, y1: y, y2: y }),
      s('text', { x: M.l - 6, y: y + 4, 'text-anchor': 'end' }, v.toFixed(1)));
  }
  const step = Math.max(1, Math.ceil(n / 6));
  points.forEach((p, i) => {
    if (i % step === 0 || i === n - 1) svg.append(s('text', { x: X(i), y: H - 8, 'text-anchor': 'middle' }, short(p.x)));
  });
  const draw = (pts, cls) => {
    let d = '', pen = false;
    pts.forEach((p, i) => {
      if (p.y == null) { pen = false; return; }
      d += `${pen ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(p.y).toFixed(1)} `;
      pen = true;
    });
    if (d) svg.append(s('path', { class: 'line ' + cls, d }));
    pts.forEach((p, i) => {
      if (p.y != null) svg.append(s('circle', { class: 'dot ' + cls, cx: X(i), cy: Y(p.y), r: 3.5 }, s('title', null, `${p.x}: ${p.y}${unit ? ' ' + unit : ''}`)));
    });
  };
  draw(points, '');
  if (alt) draw(alt, 'alt');
  return svg;
}

// Weekly bars. values: [{x, y}]
export function barChart(values, { label = 'Chart', alt = false } = {}) {
  const svg = s('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': label });
  const max = Math.max(1, ...values.map((v) => v.y));
  const n = values.length, bw = (W - M.l - M.r) / n;
  const Y = (v) => M.t + (1 - v / max) * (H - M.t - M.b);
  for (let i = 0; i <= 3; i++) {
    const v = (max * i) / 3, y = Y(v);
    svg.append(s('line', { class: 'grid', x1: M.l, x2: W - M.r, y1: y, y2: y }),
      s('text', { x: M.l - 6, y: y + 4, 'text-anchor': 'end' }, String(Math.round(v))));
  }
  const step = Math.max(1, Math.ceil(n / 8));
  values.forEach((v, i) => {
    const h = H - M.b - Y(v.y);
    svg.append(s('rect', { class: 'barfill' + (alt ? ' alt' : ''), x: M.l + i * bw + bw * 0.15, y: Y(v.y), width: bw * 0.7, height: Math.max(h, v.y > 0 ? 2 : 0), rx: 3 }, s('title', null, `${v.x}: ${v.y}`)));
    if (i % step === 0) svg.append(s('text', { x: M.l + i * bw + bw / 2, y: H - 8, 'text-anchor': 'middle' }, short(v.x)));
  });
  return svg;
}
