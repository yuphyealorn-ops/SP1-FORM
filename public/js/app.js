import { calculateComposition } from './metrics.js';
import { loadState, saveState, emptyState, exportState, upgradeSavedState, newerSavedVersion, clearState, STORAGE_KEY } from './storage.js';
import { startCamera, stopCamera, loadPhoto, captureCamera, drawPhoto, analyzePhoto } from './scanner.js';

const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
const number = (value, digits = 1) => Number.isFinite(value) ? value.toFixed(digits) : '—';
const formatDate = date => new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(date));
const icons = {
  grid:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  scan:'<path d="M8 3H4a1 1 0 0 0-1 1v4m13-5h4a1 1 0 0 1 1 1v4M3 16v4a1 1 0 0 0 1 1h4m8 0h4a1 1 0 0 0 1-1v-4M3 12h18"/><circle cx="12" cy="7" r="2"/><path d="M8 18v-3a4 4 0 0 1 8 0v3"/>',
  dumbbell:'<path d="m6 6 12 12M4 9l5-5m6 16 5-5M2 7l5-5m10 20 5-5M9 6l9 9M6 9l9 9"/>',
  chart:'<path d="M4 3v17h17M8 14l4-5 4 3 5-8"/>',
  arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.5"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  camera:'<path d="M8 5 6 8H3v12h18V8h-3l-2-3z"/><circle cx="12" cy="13" r="3.5"/>',
  upload:'<path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  shield:'<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z"/><path d="m8 12 3 3 5-6"/>',
  scale:'<rect x="4" y="4" width="16" height="17" rx="3"/><path d="M8 9a6 6 0 0 1 8 0m-4 3 2-4"/>',
  drop:'<path d="M12 3s-7 7.5-7 12a7 7 0 0 0 14 0c0-4.5-7-12-7-12z"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  download:'<path d="M12 3v13m-5-5 5 5 5-5M4 17v4h16v-4"/>',
  trash:'<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
  target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
};
const icon = (name, className = '') => `<svg class="icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.grid}</svg>`;
document.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = icon(el.dataset.icon); });
$('#today').textContent = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date());

let state;
let startupStorageError = null;
let upgradeError = null;
let newerVersion = null;
// Saved data from an older version (v1) is upgraded and saved once, before the first load.
try { upgradeSavedState(); }
catch (error) { upgradeError = error; }
try { state = loadState(); newerVersion = newerSavedVersion(); }
catch (error) { state = emptyState(); startupStorageError = error; }
let view = '';
let photo = null;
let pose = null;
let estimate = null;
let scanMode = 'photo';
let scanBusy = false;
let scanGeneration = 0;
let countdown;
let scanAbortController;
let toastTimer;
let chartMetric = 'weightKg';

function toast(message) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 5000);
}

function persist(next) {
  try { saveState(next); state = loadState(); return true; }
  catch (error) { toast(`Could not save: ${error.message}`); return false; }
}

function latest() { return [...state.scans].sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt))[0]; }

function bodyGuide(compact = false) {
  return `<svg class="body-guide ${compact ? 'compact' : ''}" viewBox="0 0 300 420" role="img" aria-label="Illustrated full-body framing guide, not a detected person">
    <defs><linearGradient id="body-fill-${compact}" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#afc4bd" stop-opacity=".5"/><stop offset="1" stop-color="#536961" stop-opacity=".08"/></linearGradient></defs>
    <path d="M77 32H47v30m176-30h30v30M47 355v30h30m146 0h30v-30" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".4"/>
    <ellipse cx="150" cy="66" rx="23" ry="29" fill="url(#body-fill-${compact})" stroke="currentColor" stroke-opacity=".25"/>
    <path d="M137 93v14l-31 9-15 26-22 73 14 6 34-69-4 56 7 35-8 60 1 68h19l11-69 7-42 8 42 10 69h20l1-68-8-60 6-35-4-56 34 69 14-6-22-73-15-26-31-9V93" fill="url(#body-fill-${compact})" stroke="currentColor" stroke-opacity=".25"/>
    <g fill="none" stroke="#a9d9b2" stroke-width="1.2" opacity=".75"><path d="m111 125 39 4 39-4m-78 0-15 44-17 46m110-90 15 44 17 46m-110-90 17 107h44l17-107m-61 107-2 65-4 69m50-134 3 65 4 69"/><path d="m128 232 22-103 22 103" stroke-dasharray="3 4"/></g>
    <g fill="#c0efaa">${[[111,125],[189,125],[96,169],[204,169],[79,215],[221,215],[128,232],[172,232],[126,297],[175,297],[122,366],[179,366]].map(([x,y])=>`<circle cx="${x}" cy="${y}" r="3"/>`).join('')}</g>
    <path d="M52 204h196" stroke="#ed765b" stroke-width="1"/><circle cx="52" cy="204" r="3" fill="#ed765b"/><circle cx="248" cy="204" r="3" fill="#ed765b"/>
    <path d="M101 390h98" stroke="currentColor" opacity=".15"/>
  </svg>`;
}

function title(eyebrow, heading, description, action = '') {
  return `<div class="page-heading"><div><div class="eyebrow">${eyebrow}</div><h1>${heading}</h1><p>${description}</p></div>${action}</div>`;
}

function stat(label, value, unit, caption, symbol, accent = '') {
  return `<article class="stat-card ${accent}"><div class="stat-label">${label}<span class="stat-icon">${icon(symbol)}</span></div><div class="stat-value">${value}<span>${unit}</span></div><div class="stat-caption">${caption}</div></article>`;
}

/** Line chart for one or more series of { date, value } points sharing a unit. */
function lineChart(series, { id, unit, label }) {
  const all = series.flatMap(line => line.points);
  const width = 620, height = 220, left = 45, right = 590, top = 20, bottom = 180;
  const values = all.map(point => point.value), times = all.map(point => Date.parse(point.date));
  const min = Math.min(...values) - 2, max = Math.max(...values) + 2;
  const first = Math.min(...times), last = Math.max(...times);
  const x = date => last === first ? (left+right)/2 : left + (right-left)*(Date.parse(date)-first)/(last-first);
  const y = value => bottom - (value-min)/(max-min)*(bottom-top);
  return `<svg class="trend-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(label)}">
    <defs><linearGradient id="${id}-fill" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#ed583f" stop-opacity=".16"/><stop offset="1" stop-color="#ed583f" stop-opacity="0"/></linearGradient></defs>
    ${[0,1,2,3].map(i=>{ const lineY=top+(bottom-top)*i/3;return `<path d="M${left} ${lineY}H${right}" stroke="#e9e7e1" stroke-dasharray="3 5"/><text x="2" y="${lineY+4}" class="chart-label">${number(max-(max-min)*i/3,1)}</text>`;}).join('')}
    ${series.map(({ name, color, points: linePoints }) => {
      const coords = linePoints.map(point => [x(point.date), y(point.value)]);
      const line = coords.map(([px,py])=>`${px},${py}`).join(' ');
      return `${coords.length>1&&series.length===1?`<polygon points="${coords[0][0]},${bottom} ${line} ${coords.at(-1)[0]},${bottom}" fill="url(#${id}-fill)"/>`:''}${coords.length>1?`<polyline points="${line}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round"/>`:''}
      ${coords.map(([px,py],i)=>`<circle cx="${px}" cy="${py}" r="4" fill="${color}" stroke="white" stroke-width="2"><title>${name ? `${esc(name)} · ` : ''}${esc(formatDate(linePoints[i].date))}: ${number(linePoints[i].value)} ${unit}</title></circle>`).join('')}`;
    }).join('')}
    <text x="${left}" y="211" class="chart-label">${esc(formatDate(first))}</text>${last>first?`<text x="${right}" y="211" text-anchor="end" class="chart-label">${esc(formatDate(last))}</text>`:''}
  </svg>${series.length>1?`<div class="chart-legend">${series.map(line=>`<span><i style="background:${line.color}"></i>${esc(line.name)}</span>`).join('')}</div>`:''}`;
}

function chart(metric = chartMetric) {
  const scans = [...state.scans].sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt));
  if (!scans.length) return `<div class="chart-empty"><div class="empty-chart-lines"><span></span><span></span><span></span></div><div class="empty-chart-copy">${icon('chart')}<strong>Every trend starts with a first check-in.</strong><span>Your measurements will appear here as you go.</span><a href="#scan">Add your baseline ${icon('arrow')}</a></div></div>`;
  const values = scans.map(scan => metric === 'weightKg' ? scan.profile.weightKg : scan.metrics.bodyFatPercent);
  const unit = metric === 'weightKg' ? 'kg' : '%';
  return lineChart([{ color: '#ed583f', points: scans.map((scan,i) => ({ date: scan.createdAt, value: values[i] })) }], { id: 'trend', unit,
    label: `${metric === 'weightKg' ? 'Body weight' : 'Estimated body fat'} across ${scans.length} check-ins, from ${number(values[0])} to ${number(values.at(-1))} ${unit}. Full values are in Progress.` });
}

function trendPanel() {
  return `<section class="panel trend-panel"><div class="panel-heading"><div><span class="eyebrow">THE BIGGER PICTURE</span><h2>Your progress over time</h2></div><div class="segmented" aria-label="Chart metric"><button data-metric="weightKg" aria-pressed="${chartMetric==='weightKg'}" class="${chartMetric==='weightKg'?'selected':''}">Weight</button><button data-metric="bodyFatPercent" aria-pressed="${chartMetric==='bodyFatPercent'}" class="${chartMetric==='bodyFatPercent'?'selected':''}">Est. body fat</button></div></div><div id="chart-container">${chart()}</div><div class="panel-foot"><span>Measured consistently. Viewed in context.</span><a href="#progress">All check-ins ${icon('arrow')}</a></div></section>`;
}

function overview() {
  const last = latest();
  const recent = state.workouts.filter(workout=>Date.now()-Date.parse(workout.createdAt)<7*86400000).length;
  return `${title('BUILD YOUR BASELINE', 'Your progress, in perspective.', 'A little more insight. A little more intention. One check-in at a time.', `<a href="#scan" class="button primary">${icon('plus')} New body check-in</a>`)}
    <section class="stats-grid" aria-label="Latest check-in metrics">
      ${stat('Body weight',number(last?.profile.weightKg),'kg',last?`Logged ${esc(formatDate(last.createdAt))}`:'Add your first measurement','scale')}
      ${stat('Estimated body fat',number(last?.metrics.bodyFatPercent),'%',last?'RFM · from tape measurements':'A measurement-based estimate','drop','accent-stat')}
      ${stat('Estimated fat-free mass',number(last?.metrics.leanMassKg),'kg','Includes muscle, bone, water & organs','target')}
      ${stat('Training this week',String(recent),'sessions','Your last 7 days of logged workouts','dumbbell')}
    </section>
    <section class="scan-hero">
      <div class="hero-copy"><div class="hero-chip"><span class="live-dot"></span> BODY AWARENESS, REIMAGINED</div><h2>Get to know<br>your starting point.</h2><p>Pair a body-pose scan with a few simple measurements. Turn your next check-in into a useful point of reference.</p><a class="button light" href="#scan">Start a body check-in ${icon('arrow')}</a><div class="hero-footnote">${icon('shield')} Photos processed on your device</div></div>
      <div class="hero-visual"><div class="visual-grid"></div>${bodyGuide(true)}<span class="guide-label guide-top">FULL-BODY<br><strong>Pose scan</strong></span><span class="guide-label guide-bottom">YOUR BASELINE<br><strong>Built over time</strong></span><span class="visual-caption">ILLUSTRATED SCAN GUIDE</span></div>
    </section>
    <div class="overview-bottom">${trendPanel()}<section class="panel next-panel"><span class="eyebrow">SHOW UP FOR YOURSELF</span><div class="training-art">${icon('dumbbell')}<span>01</span></div><h2>A plan for your next session.</h2><p>Keep your routine simple. Pick a session, move at your own pace, and log it when you finish.</p><a href="#training" class="text-link">Find your session ${icon('arrow')}</a></section></div>
    <div class="quiet-note">${icon('info')} Composition values are estimates from your measurements. The photo scan checks pose and framing. <a href="#method">Learn how it works</a></div>`;
}

function field(id,label,unit,min,max,step='0.1',placeholder='') {
  const current=state.profile?.[id] ?? '';
  return `<label class="field" for="${id}"><span>${label}</span><span class="input-wrap"><input id="${id}" name="${id}" type="number" inputmode="decimal" required min="${min}" max="${max}" step="${step}" value="${esc(current)}" placeholder="${placeholder}"><span>${unit}</span></span></label>`;
}

function scanView() {
  return `${title('A MOMENT TO CHECK IN','Meet your new baseline.','A full-body photo for your pose. A tape measure for your composition.')}
    <div class="scan-tabs segmented"><button data-scan-mode="photo" class="selected" aria-pressed="true">${icon('scan')} Photo + measurements</button><button data-scan-mode="manual" aria-pressed="false">${icon('scale')} Measurements only</button></div>
    <div class="scan-layout">
      <section class="panel camera-panel" id="camera-panel"><div class="panel-heading"><div><span class="step-number">01</span><h2>Your body-pose scan</h2></div><span class="small-tag">ON-DEVICE AI</span></div>
        <div class="scan-stage" id="scan-stage"><div class="stage-guide" id="stage-guide">${bodyGuide()}<span class="stage-label">Stand tall. Keep your whole body in frame.</span></div><video id="camera-preview" playsinline muted hidden aria-label="Live camera preview"></video><canvas id="scan-canvas" hidden aria-label="Your photo and detected body landmarks"></canvas><span class="stage-badge">${icon('scan')} FULL-BODY FRAMING</span><span id="countdown" class="countdown" hidden></span></div>
        <div class="capture-actions"><button id="start-camera" class="button primary">${icon('camera')} Use camera</button><label class="button secondary upload-button" for="photo-file">${icon('upload')} Upload photo<input id="photo-file" type="file" accept="image/jpeg,image/png,image/webp"></label><button id="capture-photo" class="button primary" hidden>${icon('camera')} Capture in 5s</button><button id="stop-camera" class="button secondary" hidden>Stop camera</button><button id="analyze-photo" class="button primary" hidden>${icon('scan')} Analyze photo</button></div>
        <div id="scan-status" class="scan-status" role="status" aria-live="polite">Use a JPG, PNG, or WebP under 15 MB. Your photo is not saved.</div>
        <div class="scan-tips"><span>${icon('check')} One person, head to toe</span><span>${icon('check')} Face the camera</span><span>${icon('check')} Even light, clear background</span></div>
      </section>
      <section class="panel measurement-panel"><div class="panel-heading"><div><span class="step-number" id="measurement-step">02</span><h2>The measurements</h2></div>${icon('scale')}</div><p class="section-description">Use your current measurements. The photo checks your pose; these numbers estimate your composition.</p>
        <form id="measurement-form"><div class="form-grid">${field('heightCm','Height','cm',120,230,'0.1','e.g. 175')}${field('weightKg','Body weight','kg',30,300,'0.1','e.g. 75')}${field('waistCm','Waist circumference','cm',45,200,'0.1','e.g. 85')}${field('age','Age','years',20,69,'1','20–69')}</div>
          <label class="field" for="sex"><span>Equation coefficient</span><select id="sex" name="sex" required><option value="">Choose a coefficient</option><option value="male" ${state.profile?.sex==='male'?'selected':''}>Male coefficient</option><option value="female" ${state.profile?.sex==='female'?'selected':''}>Female coefficient</option></select></label>
          <p class="field-help">RFM uses sex-specific coefficients from its original study, validated for ages 20–69. The app does not infer this from a photo.</p>
          <details class="measure-help"><summary>Where should I measure my waist? ${icon('info')}</summary><p>Stand relaxed. Wrap the tape horizontally around your unclothed waist at the upper edge of your right hip bone. Measure after a normal exhale without compressing your skin. Use the same spot and technique each time.</p></details>
          <div id="form-error" class="form-error" role="alert" hidden></div><button class="button dark full-width" id="calculate-button" type="submit">Calculate estimates ${icon('arrow')}</button>
        </form>
        <div id="estimate-result"></div><p class="privacy-note">${icon('shield')} Saved check-ins contain measurements only. Photos and body landmarks are discarded.</p>
      </section>
    </div><div class="quiet-note">${icon('info')} A camera cannot directly measure body fat, muscle, or visceral fat. These are RFM estimates, not a clinical body-composition scan. <a href="#method">See the method</a></div>`;
}

/** Training templates, as free text. Week 4 links exercises to muscle groups (public/js/exercises.js). */
const routines = [
  { id: 'full', title: 'Full body foundations', tag: 'STRENGTH', minutes: 40, description: 'A balanced session of familiar movement patterns.', exercises: [
    ['Goblet squat', '3 × 8–10'], ['Dumbbell bench press', '3 × 8–10'], ['Seated cable row', '3 × 10–12'], ['Romanian deadlift', '3 × 8–10'], ['Dead bug', '3 × 8 each side']] },
  { id: 'upper', title: 'Upper body focus', tag: 'STRENGTH', minutes: 35, description: 'A simple mix of pushing and pulling movements.', exercises: [
    ['Dumbbell bench press', '3 × 8–10'], ['Lat pulldown', '3 × 10–12'], ['Seated shoulder press', '2 × 8–10'], ['Seated cable row', '3 × 10–12'], ['Dumbbell curl', '2 × 10–12']] },
  { id: 'recovery', title: 'Move & reset', tag: 'RECOVERY', minutes: 20, description: 'Make some space for lighter movement.', exercises: [
    ['Easy walk or cycle', '10 minutes'], ['Shoulder circles', '2 minutes'], ['Gentle hip mobility', '4 minutes'], ['Comfortable stretching', '4 minutes']] },
];

function training() {
  return `${title('BUILD THE HABIT','A little stronger, session by session.','Simple templates to adapt to your experience, equipment, and comfort.')}
    <div class="training-banner"><div>${icon('dumbbell')}<span><strong>${state.workouts.length} sessions in your training log</strong><small>Consistency is something you build.</small></span></div><a href="#progress" class="text-link">View your history ${icon('arrow')}</a></div>
    <div class="routine-grid">${routines.map((routine,i)=>`<article class="panel routine-card"><div class="routine-top"><span class="eyebrow">${routine.tag}</span><span class="routine-number">0${i+1}</span></div><h2>${routine.title}</h2><p>${routine.description}</p><div class="routine-meta"><span>${icon('clock')} ~${routine.minutes} min</span><span>${routine.exercises.length} exercises</span></div><ol class="exercise-list">${routine.exercises.map(([name,detail])=>`<li><span>${esc(name)}</span><small>${esc(detail)}</small></li>`).join('')}</ol><button class="button ${i===0?'primary':'secondary'} full-width" data-routine="${routine.id}">Log this session ${icon('plus')}</button></article>`).join('')}</div>
    <section class="panel custom-workout"><div><span class="eyebrow">MAKE IT YOURS</span><h2>Did your own thing?</h2><p>Log a session that fits the way you train.</p></div><form id="workout-form"><label class="field" for="workout-title"><span>Session name</span><input id="workout-title" name="title" required maxlength="80" placeholder="e.g. Evening strength session"></label><label class="field" for="workout-minutes"><span>Minutes</span><input id="workout-minutes" name="minutes" type="number" inputmode="numeric" min="1" max="600" step="1" required placeholder="45"></label><label class="field" for="workout-exercises"><span>Exercises</span><input id="workout-exercises" name="exercises" type="number" inputmode="numeric" min="1" max="100" step="1" required placeholder="5"></label>
      <button class="button dark" type="submit">Save session ${icon('check')}</button></form></section>
    <p class="quiet-note">${icon('info')} Templates are general examples, not a personalized prescription. Choose manageable loads and movements that are comfortable for you.</p>`;
}

function progress() {
  const sorted=[...state.scans].sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt));
  return `${title('KEEP THE BIG PICTURE','Small steps. A story over time.','Your measurements and sessions, together in one place.',`<button id="export-data" class="button secondary" ${!state.scans.length&&!state.workouts.length?'disabled':''}>${icon('download')} Export your data</button>`)}
    ${trendPanel()}<section class="panel history-panel"><div class="panel-heading"><div><span class="eyebrow">YOUR BODY CHECK-INS</span><h2>Measurement history <span class="count-badge">${state.scans.length}</span></h2></div><a class="text-link" href="#scan">Add a check-in ${icon('plus')}</a></div>${sorted.length?`<div class="table-scroll"><table><caption class="sr-only">Body measurement history. Composition values are RFM estimates.</caption><thead><tr><th scope="col">Date</th><th scope="col">Weight</th><th scope="col">Waist</th><th scope="col">Est. body fat</th><th scope="col">Est. fat-free mass</th><th scope="col">Pose check</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead><tbody>${sorted.map(scan=>`<tr><td><strong>${esc(formatDate(scan.createdAt))}</strong></td><td>${number(scan.profile.weightKg)} <small>kg</small></td><td>${number(scan.profile.waistCm)} <small>cm</small></td><td>${number(scan.metrics.bodyFatPercent)}<small>%</small></td><td>${number(scan.metrics.leanMassKg)} <small>kg</small></td><td><span class="small-tag ${scan.pose?'green':''}">${scan.pose?'Framing checked':'Measurements only'}</span></td><td><button class="icon-button" data-delete-scan="${esc(scan.id)}" aria-label="Delete check-in from ${esc(formatDate(scan.createdAt))}">${icon('trash')}</button></td></tr>`).join('')}</tbody></table></div>`:`<div class="empty-state">${icon('scale')}<h3>Your first check-in belongs here.</h3><p>Measure today, then come back to see your story develop.</p><a class="button secondary" href="#scan">Start a check-in ${icon('arrow')}</a></div>`}</section>
    <section class="panel history-panel"><div class="panel-heading"><div><span class="eyebrow">THE WORK YOU PUT IN</span><h2>Training log <span class="count-badge">${state.workouts.length}</span></h2></div><a class="text-link" href="#training">Log a session ${icon('plus')}</a></div>${state.workouts.length?`<div class="workout-log">${[...state.workouts].sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt)).map(workout=>`<div class="workout-row"><span class="workout-row-icon">${icon('dumbbell')}</span><div><strong>${esc(workout.title)}</strong><small>${esc(formatDate(workout.createdAt))} · ${workout.exercises} exercises</small></div><span>${workout.minutes} <small>min</small></span><button class="icon-button" data-delete-workout="${esc(workout.id)}" aria-label="Delete ${esc(workout.title)}">${icon('trash')}</button></div>`).join('')}</div>`:`<div class="empty-state compact-empty"><p>No sessions yet. Your next one can be the first.</p><a href="#training" class="text-link">Explore training ${icon('arrow')}</a></div>`}</section>
    <div class="data-actions"><p>${icon('shield')} Only this browser stores your check-ins. Export a copy before clearing browser data.</p><button class="text-danger" id="clear-data" ${!state.scans.length&&!state.workouts.length&&!state.profile?'disabled':''}>Clear all local data</button></div>`;
}

function method() {
  return `${title('BEHIND YOUR CHECK-IN','Useful insight starts with honesty.','Two different methods, each with a specific job.')}
    <div class="method-grid"><section class="panel method-card"><span class="step-number">01</span><span class="eyebrow">THE PHOTO</span><h2>A pretrained pose model.</h2><p>MediaPipe Pose Landmarker detects 33 body landmarks in a photo. FORM checks that your head, shoulders, hips, knees, and ankles are visible and in frame. The green lines show the actual model output.</p><p>The framing score describes visibility. It is not a confidence score for body composition. A photo does not directly measure your body fat, muscle mass, bone density, or visceral fat.</p><a href="https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker" target="_blank" rel="noreferrer">MediaPipe documentation ↗</a></section>
    <section class="panel method-card"><span class="step-number">02</span><span class="eyebrow">THE MEASUREMENTS</span><h2>A published estimate.</h2><p>Relative Fat Mass (RFM) estimates body-fat percentage from your height, tape-measured waist, and the study's sex-specific coefficient. Body weight converts that percentage into estimated fat and fat-free mass.</p><div class="formula">64 − 20 × (height ÷ waist)<br><span>+ 12 for the female coefficient</span></div><p>Fat-free mass includes muscle, bone, water, and organs. It must not be interpreted as skeletal muscle mass.</p><a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC6054651/" target="_blank" rel="noreferrer">Read the RFM study ↗</a></section></div>
    <section class="panel method-detail"><h2>Put the numbers in context.</h2><div><p>The original RFM study externally validated adults aged 20–69. The equation has individual error, performs less well in leaner people, and was not validated for all populations, including athletes and Asian populations. FORM cannot assess whether it is accurate for you.</p><p>Use consistent measurement technique and focus on trends. These estimates do not replace DXA, professional assessment, or clinical body-composition measurements. Pregnancy and conditions that change body shape or fluid balance can make these estimates inappropriate.</p></div></section>
    <section class="panel method-detail"><h2>Your data, on this device.</h2><div><p>Photos and camera frames are processed in your browser and discarded when you leave the scan. Saving is explicit. Only measurement summaries and workout summaries are kept in this browser's local storage. You can export or delete them in Progress.</p><p>When model assets are not installed locally, the browser downloads them from jsDelivr and Google Storage. These hosts receive ordinary connection metadata. The local server restricts outbound connections to the model hosts; the app has no photo-upload API or analytics.</p></div></section>
    <section class="panel method-detail"><h2>Why there is no body-fat-from-photo model.</h2><div><p>Predicting body fat from a photo would need many photos paired with reference body-fat measurements, such as DXA scans. We don't have that data, and training on height, weight, or BMI categories instead would produce confident-looking but misleading numbers.</p><p>FORM therefore uses a pretrained pose model only to check framing, and a published equation for its estimates. It reports no invented training accuracy.</p></div></section>`;
}

function route() {
  const requested=location.hash.slice(1) || 'overview';
  view=['overview','scan','training','progress','method'].includes(requested)?requested:'overview';
  clearScanMedia(); scanMode='photo';
  $('#main').innerHTML=({overview,scan:scanView,training,progress,method}[view])();
  $('#breadcrumb').textContent=({overview:'Overview',scan:'Body scan',training:'Training',progress:'Progress',method:'How it works'})[view];
  document.title=`${$('#breadcrumb').textContent} · FORM`;
  document.querySelectorAll('[data-view]').forEach(link=>{
    link.classList.toggle('active',link.dataset.view===view);
    if(link.dataset.view===view)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
  });
  bindView();
  window.scrollTo({top:0,behavior:'instant'});
}

function showScanStatus(message,isError=false) {
  if(!$('#scan-status'))return;
  $('#scan-status').textContent=message;
  $('#scan-status').classList.toggle('error',isError);
}

function invalidateEstimate() {
  estimate=null;
  if($('#estimate-result'))$('#estimate-result').innerHTML='';
}

function cameraButtons(active) {
  $('#start-camera').hidden=active;
  $('#capture-photo').hidden=!active;
  $('#stop-camera').hidden=!active;
  $('.upload-button').hidden=active;
  $('#analyze-photo').hidden=active || !photo;
}

function showPhoto(source) {
  photo=source;pose=null;invalidateEstimate();
  $('#camera-preview').hidden=true;
  $('#stage-guide').hidden=true;
  $('#scan-canvas').hidden=false;
  drawPhoto($('#scan-canvas'),source);
  cameraButtons(false);
  $('#analyze-photo').hidden=false;
  showScanStatus('Photo ready. Analyze it to check full-body framing. The model runs in your browser.');
}

function updateScanMode(mode) {
  clearScanMedia();
  $('#photo-file').disabled=false;
  $('#scan-stage').classList.remove('is-analyzing');
  $('#countdown').textContent='';
  $('#countdown').hidden=true;
  $('#analyze-photo').disabled=false;
  $('#capture-photo').disabled=false;
  $('#start-camera').disabled=false;
  scanMode=mode;pose=null;photo=null;invalidateEstimate();
  $('#camera-panel').hidden=mode==='manual';
  $('.scan-layout').classList.toggle('manual-mode',mode==='manual');
  $('#measurement-step').textContent=mode==='manual'?'01':'02';
  document.querySelectorAll('[data-scan-mode]').forEach(button=>{button.classList.toggle('selected',button.dataset.scanMode===mode);button.setAttribute('aria-pressed',button.dataset.scanMode===mode);});
  if(mode==='photo') {
    $('#camera-preview').hidden=true;$('#scan-canvas').hidden=true;$('#stage-guide').hidden=false;$('#countdown').hidden=true;
    cameraButtons(false);$('#analyze-photo').disabled=false;$('#capture-photo').disabled=false;$('#start-camera').disabled=false;
    showScanStatus('Use a JPG, PNG, or WebP under 15 MB. Your photo is not saved.');
  }
}

function bindScan() {
  document.querySelectorAll('[data-scan-mode]').forEach(button=>button.addEventListener('click',()=>updateScanMode(button.dataset.scanMode)));
  $('#photo-file').addEventListener('change',async event=>{
    const file=event.target.files[0];if(!file)return;
    const generation=++scanGeneration;stopCamera();
    try {const source=await loadPhoto(file);if(generation===scanGeneration)showPhoto(source);}
    catch(error){if(generation===scanGeneration)showScanStatus(error.message,true);}
    event.target.value='';
  });
  $('#start-camera').addEventListener('click',async()=>{
    const generation=++scanGeneration;
    const button=$('#start-camera');button.disabled=true;showScanStatus('Waiting for camera access…');
    try {
      const video=$('#camera-preview');
      if(await startCamera(video) && generation===scanGeneration) {
        photo=null;pose=null;invalidateEstimate();video.hidden=false;$('#stage-guide').hidden=true;$('#scan-canvas').hidden=true;
        cameraButtons(true);showScanStatus('Step back until your head and feet fit. Capture gives you 5 seconds to get into position.');
      }
    }catch(error){if(generation===scanGeneration)showScanStatus(error.message,true);}
    finally{button.disabled=false;}
  });
  $('#stop-camera').addEventListener('click',()=>{
    clearInterval(countdown);stopCamera();$('#countdown').hidden=true;$('#capture-photo').disabled=false;
    const video=$('#camera-preview');video.pause();video.srcObject=null;video.hidden=true;
    $('#stage-guide').hidden=false;cameraButtons(false);showScanStatus('Camera stopped. You can start again or upload a photo.');
  });
  $('#capture-photo').addEventListener('click',()=>{
    let remaining=5;const generation=scanGeneration;$('#capture-photo').disabled=true;$('#countdown').hidden=false;$('#countdown').textContent=remaining;
    countdown=setInterval(()=>{
      if(generation!==scanGeneration){clearInterval(countdown);return;}
      remaining-=1;$('#countdown').textContent=remaining;
      if(remaining===0){clearInterval(countdown);$('#countdown').hidden=true;$('#capture-photo').disabled=false;
        try {const video=$('#camera-preview');const frame=captureCamera(video);video.pause();video.srcObject=null;video.hidden=true;showPhoto(frame);}catch(error){showScanStatus(error.message,true);}
      }
    },1000);
  });
  $('#analyze-photo').addEventListener('click',async()=>{
    if(!photo || scanBusy)return;
    scanBusy=true;pose=null;invalidateEstimate();const generation=++scanGeneration;
    const source=photo,canvas=$('#scan-canvas');
    const controller=new AbortController();scanAbortController=controller;
    $('#analyze-photo').disabled=true;$('#start-camera').disabled=true;$('#photo-file').disabled=true;
    $('#scan-stage').classList.add('is-analyzing');
    try {
      const result=await analyzePhoto(source,canvas,message=>{if(generation===scanGeneration)showScanStatus(message);},controller.signal);
      if(generation!==scanGeneration || result.cancelled)return;
      pose=result;
      showScanStatus(result.ready?`Framing checked · ${result.visibleLandmarks}/9 required landmarks visible. Add your measurements to continue.`:result.issues.join(' '),!result.ready);
    }catch(error){if(generation===scanGeneration)showScanStatus(error.message,true);}
    finally{if(generation===scanGeneration){scanBusy=false;scanAbortController=null;$('#analyze-photo').disabled=false;$('#start-camera').disabled=false;$('#photo-file').disabled=false;$('#scan-stage').classList.remove('is-analyzing');}}
  });
  $('#measurement-form').addEventListener('input',()=>{invalidateEstimate();$('#form-error').hidden=true;});
  $('#measurement-form').addEventListener('submit',event=>{
    event.preventDefault();
    try {
      if(scanMode==='photo'&&!pose?.ready)throw new Error('Analyze a clear, full-body photo first, or choose Measurements only above.');
      const values=Object.fromEntries(new FormData(event.currentTarget));
      const profile={sex:values.sex,age:Number(values.age),heightCm:Number(values.heightCm),weightKg:Number(values.weightKg),waistCm:Number(values.waistCm)};
      const metrics=calculateComposition(profile);
      estimate={profile,metrics};$('#form-error').hidden=true;
      $('#estimate-result').innerHTML=`<div class="result-header"><span class="eyebrow">YOUR ESTIMATED BASELINE</span><span class="small-tag">RFM EQUATION</span></div><div class="result-main">${number(metrics.bodyFatPercent)}<span>%</span><small>Estimated body fat</small></div><div class="result-grid"><div><strong>${number(metrics.fatMassKg)} <small>kg</small></strong><span>Estimated fat mass</span></div><div><strong>${number(metrics.leanMassKg)} <small>kg</small></strong><span>Estimated fat-free mass</span></div><div><strong>${number(metrics.bmi)}</strong><span>BMI · kg/m²</span></div><div><strong>${number(metrics.waistHeightRatio,2)}</strong><span>Waist-to-height ratio</span></div></div><p class="field-help">Estimates from your tape measurements, not your photo. Fat-free mass is not muscle mass.</p><button id="save-checkin" class="button primary full-width">Save this check-in ${icon('check')}</button><p class="field-help">This saves your measurements in this browser. Your photo will be discarded.</p>`;
      $('#save-checkin').addEventListener('click',()=>{
        if(!estimate)return;
        const entry={id:crypto.randomUUID(),createdAt:new Date().toISOString(),...estimate,pose:scanMode==='photo'&&pose?.ready?{score:pose.score,visibleLandmarks:pose.visibleLandmarks}:null};
        if(persist({...state,profile:estimate.profile,scans:[...state.scans,entry]})){toast('Check-in saved. A new point in your progress.');location.hash='progress';}
      });
      $('#estimate-result').scrollIntoView({behavior:'smooth',block:'nearest'});
    }catch(error){$('#form-error').textContent=error.message;$('#form-error').hidden=false;}
  });
}

function logWorkout(title,minutes,exercises) {
  if(persist({...state,workouts:[...state.workouts,{id:crypto.randomUUID(),createdAt:new Date().toISOString(),title,minutes,exercises}]})) {
    toast('Session logged. Keep showing up.');route();
  }
}

async function confirmDelete(title,description) {
  const dialog=$('#confirm-dialog');$('#dialog-title').textContent=title;$('#dialog-description').textContent=description;
  dialog.returnValue='cancel';dialog.showModal();
  return new Promise(resolve=>dialog.addEventListener('close',()=>resolve(dialog.returnValue==='confirm'),{once:true}));
}

function rerender() {
  $('#main').innerHTML=({overview,scan:scanView,training,progress,method}[view])();
  bindView();
}

function bindView() {
  document.querySelectorAll('[data-metric]').forEach(button=>button.addEventListener('click',()=>{
    chartMetric=button.dataset.metric;$('#chart-container').innerHTML=chart();document.querySelectorAll('[data-metric]').forEach(item=>{item.classList.toggle('selected',item.dataset.metric===chartMetric);item.setAttribute('aria-pressed',item.dataset.metric===chartMetric);});
  }));
  if(view==='scan')bindScan();
  if(view==='training'){
    document.querySelectorAll('[data-routine]').forEach(button=>button.addEventListener('click',()=>{
      const routine=routines.find(item=>item.id===button.dataset.routine);logWorkout(routine.title,routine.minutes,routine.exercises.length);
    }));
    $('#workout-form').addEventListener('submit',event=>{
      event.preventDefault();
      const values=Object.fromEntries(new FormData(event.currentTarget));
      logWorkout(values.title.trim(),Number(values.minutes),Number(values.exercises));
    });
  }
  if(view==='progress'){
    $('#export-data').addEventListener('click',()=>{
      try{
        const blob=new Blob([exportState(state)],{type:'application/json'});const url=URL.createObjectURL(blob);
        const link=document.createElement('a');link.href=url;link.download=`form-checkins-${new Date().toISOString().slice(0,10)}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
        toast('Export downloaded. Keep this file somewhere private.');
      }catch(error){toast(error.message);}
    });
    document.querySelectorAll('[data-delete-scan]').forEach(button=>button.addEventListener('click',async()=>{
      if(await confirmDelete('Delete this check-in?','This removes the saved measurements. This action cannot be undone.')){
        const scans=state.scans.filter(scan=>scan.id!==button.dataset.deleteScan);
        const newest=[...scans].sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt))[0];
        if(persist({...state,profile:newest?.profile ?? null,scans})){route();toast('Check-in deleted.');}
      }
    }));
    document.querySelectorAll('[data-delete-workout]').forEach(button=>button.addEventListener('click',async()=>{
      if(await confirmDelete('Delete this session?','This removes the session from your training log.')){
        if(persist({...state,workouts:state.workouts.filter(workout=>workout.id!==button.dataset.deleteWorkout)})){route();toast('Session deleted.');}
      }
    }));
    $('#clear-data').addEventListener('click',async()=>{
      if(await confirmDelete('Clear all your data?','This removes your measurements, profile, and training log from this browser. Export a copy first if you want to keep them.')){
        let message='All local data cleared.';
        try{clearState();}catch(error){message=`Could not clear: ${error.message}`;}
        // Reload either way: a partly finished clear must not leave old data on screen to be saved back.
        try{state=loadState();}catch{state=emptyState();}
        route();toast(message);
      }
    });
  }
}

window.addEventListener('hashchange',()=>{route();$('#main').focus({preventScroll:true});});
window.addEventListener('storage',event=>{
  if(event.key!==STORAGE_KEY)return;
  state=loadState();
  const newer=newerSavedVersion();
  if(view!=='scan'&&view!=='training')route();
  if(newer)toast(`Another tab saved data from a newer version of FORM (format ${newer}). Reload with the latest app; this page won't save over it.`);
  else if(view==='scan'||view==='training')toast('Your saved data changed in another tab.');
});
function clearScanMedia() {
  scanGeneration+=1;
  scanAbortController?.abort();
  scanAbortController=null;
  clearInterval(countdown);
  stopCamera();
  const video=$('#camera-preview');
  if(video){video.pause();video.srcObject=null;}
  const canvas=$('#scan-canvas');
  if(canvas){const context=canvas.getContext('2d');context?.clearRect(0,0,canvas.width,canvas.height);canvas.width=1;canvas.height=1;}
  photo=null;pose=null;estimate=null;scanBusy=false;
}

window.addEventListener('pagehide',clearScanMedia);
window.addEventListener('pageshow',event=>{if(event.persisted){clearScanMedia();if(view==='scan')route();}});
route();
if(startupStorageError)toast(`${startupStorageError.message} Measurements can still be reviewed, but browser storage is unavailable.`);
else if(newerVersion)toast(`Your saved data comes from a newer version of FORM (format ${newerVersion}). Reload the latest app to see it. This page won't save, so the newer data is not overwritten.`);
else if(upgradeError)toast(`Your saved data was loaded but could not be upgraded to the new format yet: ${upgradeError.message}`);
