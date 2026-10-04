import '@fontsource-variable/inter';
import './style.css';
import * as THREE from 'three';
import { buildEmblem, disposeEmblem, DIM } from './emblem.js';
import { createMaterials, applyMaterialState, METALS, FINISHES, ENAMELS, GEMS } from './materials.js';
import { getEnvironment, LIGHTS } from './environment.js';
import { PATTERNS, getPatternTexture, getPatternPreview } from './patterns.js';
import { createBackTextures } from './engraving.js';
import { createPanel, icon } from './ui.js';
import { LayerLabels } from './labels.js';
import { download, exportPNG, exportGLB, recordCanvas } from './export.js';

// ================================================================ Состояние

const DEFAULTS = {
  view: 'assembled',
  quality: 'high',
  interaction: 'rotate',
  autoRotate: true,
  form: 'silhouette',
  style: 'enamel',
  metal: 'silver',
  finish: 'polish',
  enamel: 'bordeaux',
  pattern: 'none',
  patternScale: 100,
  resin: true,
  gem: 'ruby',
  light: 'studio',
  theme: 'night',
};

const THEMES = {
  night: { label: 'Ночь', bg: ['#1a1a1d', '#0b0b0c', '#050505'] },
  graphite: { label: 'Графит', bg: ['#3d3e43', '#222326', '#141416'] },
  light: { label: 'Светлый', bg: ['#ffffff', '#ecebe7', '#d4d1ca'] },
};

const opts = (obj, extra = () => ({})) => Object.entries(obj).map(([value, o]) => ({ value, label: o.label, ...extra(o, value) }));

const SCHEMA = {
  title: 'Эмблема СПбГАСУ',
  subtitle: 'Металл, эмаль и смола',
  sections: [
    {
      controls: [
        { type: 'segment', key: 'view', label: 'Вид', options: [
          { value: 'assembled', label: 'Собран', icon: 'circle' },
          { value: 'layers', label: 'По слоям', icon: 'layers' },
        ] },
        { type: 'segment', key: 'quality', label: 'Разрешение', options: [
          { value: 'high', label: 'High' },
          { value: 'medium', label: 'Medium' },
          { value: 'low', label: 'Low' },
        ] },
      ],
    },
    {
      title: 'Взаимодействие',
      controls: [
        { type: 'segment', key: 'interaction', options: [
          { value: 'rotate', label: 'Вращение', icon: 'rotate' },
          { value: 'coin', label: 'Монетка', icon: 'coin' },
        ] },
        { type: 'note', text: (s) => s.interaction === 'coin'
          ? 'Клик подбрасывает эмблему, как монетку, — она приземляется на случайную сторону.'
          : 'Клик по объекту переворачивает его на другую сторону. Потяните, чтобы покрутить.' },
        { type: 'toggle', key: 'autoRotate', text: 'Автоповорот', icon: 'spin' },
      ],
    },
    {
      title: 'Исполнение',
      controls: [
        { type: 'segment', key: 'form', label: 'Форма', options: [
          { value: 'silhouette', label: 'Силуэт' },
          { value: 'plate', label: 'Пластина' },
        ] },
        { type: 'segment', key: 'style', label: 'Знак', options: [
          { value: 'enamel', label: 'Эмаль' },
          { value: 'relief', label: 'Рельеф' },
        ] },
      ],
    },
    {
      title: 'Металл',
      controls: [
        { type: 'pills', key: 'metal', options: opts(METALS, (o) => ({ swatch: o.swatch })) },
        { type: 'segment', key: 'finish', label: 'Обработка', options: opts(FINISHES) },
      ],
    },
    {
      title: 'Эмаль',
      controls: [{ type: 'pills', key: 'enamel', options: opts(ENAMELS, (o) => ({ swatch: o.color })) }],
    },
    {
      title: 'Узор',
      controls: [
        { type: 'pills', key: 'pattern', options: opts(PATTERNS, (o, v) => ({ preview: getPatternPreview(v) })) },
        { type: 'slider', key: 'patternScale', label: 'Размер', min: 50, max: 200, step: 5, format: (v) => `${v}%`, visible: (s) => s.pattern !== 'none' },
      ],
    },
    {
      title: 'Детали',
      controls: [
        { type: 'toggle', key: 'resin', text: 'Эпоксидная смола', icon: 'drop' },
        { type: 'pills', key: 'gem', label: 'Кристалл на обороте', options: opts(GEMS, (o) => ({ swatch: o.swatch })) },
      ],
    },
    {
      title: 'Сцена',
      controls: [
        { type: 'segment', key: 'light', label: 'Свет', options: opts(LIGHTS) },
        { type: 'segment', key: 'theme', label: 'Фон', options: opts(THEMES) },
      ],
    },
    {
      title: 'Экспорт',
      controls: [{ type: 'actions', actions: [
        { action: 'png', icon: 'image', label: 'PNG', hint: 'прозрачный фон' },
        { action: 'glb', icon: 'cube', label: '3D · GLB', hint: 'для PowerPoint' },
        { action: 'video', icon: 'video', label: 'Видео 360°', hint: '6 секунд' },
        { action: 'link', icon: 'link', label: 'Ссылка', hint: 'с настройками' },
      ] }],
    },
  ],
  footer: [
    { action: 'present', icon: 'present', label: 'Режим презентации', kbd: 'P', primary: true },
    { action: 'togglePanel', icon: 'panel', label: 'Скрыть панель', kbd: 'H' },
  ],
};

// допустимые значения для чтения настроек из адресной строки
const VALID = {};
for (const sec of SCHEMA.sections) {
  for (const c of sec.controls) if (c.options) VALID[c.key] = c.options.map((o) => o.value);
}

function readHash() {
  const params = new URLSearchParams(location.hash.slice(1));
  const out = {};
  for (const [k, v] of params) {
    if (!(k in DEFAULTS)) continue;
    if (typeof DEFAULTS[k] === 'boolean') out[k] = v === '1';
    else if (typeof DEFAULTS[k] === 'number') out[k] = Math.min(Math.max(Number(v) || DEFAULTS[k], 50), 200);
    else if (VALID[k]?.includes(v)) out[k] = v;
  }
  return { state: out, ui: params.get('ui') !== '0' };
}

function writeHash() {
  const params = new URLSearchParams();
  for (const k of Object.keys(DEFAULTS)) {
    if (state[k] === DEFAULTS[k]) continue;
    params.set(k, typeof state[k] === 'boolean' ? (state[k] ? '1' : '0') : state[k]);
  }
  // ссылка «без панели» (#ui=0) остаётся такой, пока панель скрыта
  if (!initial.ui && app.classList.contains('panel-hidden')) params.set('ui', '0');
  const hash = params.toString();
  history.replaceState(null, '', hash ? `#${hash}` : location.pathname + location.search);
}

const initial = readHash();
const state = { ...DEFAULTS, ...initial.state };
const store = { get: () => state };

// ================================================================ DOM

const $ = (id) => document.getElementById(id);
const app = $('app');
const viewer = $('viewer');
const canvas = $('scene');
const hint = $('hint');
const toastEl = $('toast');

let toastTimer;
function toast(msg, ms = 2600) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms);
}

$('togglePanel').innerHTML = icon('panel', 16);
$('togglePanel').addEventListener('click', () => togglePanel());
if (!initial.ui) app.classList.add('panel-hidden');

// ================================================================ Рендер

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
} catch (e) {
  $('loader').innerHTML = '<p>Не удалось запустить WebGL.<br>Откройте страницу в свежем Chrome, Edge или Safari.</p>';
  throw e;
}
renderer.setClearColor(0x000000, 0);
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 200);
camera.position.set(0, 0, 10);

// stage — наклон за курсором и интро; spinner — вращение пользователем; flipper — переворот/монетка
const stage = new THREE.Group();
const spinner = new THREE.Group();
const flipper = new THREE.Group();
scene.add(stage);
stage.add(spinner);
spinner.add(flipper);

const mats = createMaterials();
const labels = new LayerLabels($('labels'));
const backCache = new Map();
let back = null;
let emblem = null;

const layer = (id) => emblem.layers.find((l) => l.id === id);

function rebuild() {
  if (emblem) disposeEmblem(emblem);
  emblem = buildEmblem({ form: state.form, style: state.style }, mats);
  flipper.add(emblem.group);

  if (!backCache.has(state.form)) {
    backCache.set(state.form, createBackTextures({ outlines: emblem.outlines, gemPos: emblem.gemPos }));
  }
  back = backCache.get(state.form);
  mats.back.map = back.albedo;
  mats.back.roughnessMap = back.rough;
  mats.back.bumpMap = back.bump;
  mats.back.needsUpdate = true;

  applyMaterials();
  applyPattern();
  applyResin();
  updateLayerPositions(motion.explode);
}

function applyMaterials() {
  applyMaterialState(mats, state);
  back?.setFinishRoughness(FINISHES[state.finish].roughness);
  if (emblem) emblem.group.getObjectByName('gem-setting').visible = state.gem !== 'none';
}

function applyPattern() {
  const l = layer('pattern');
  if (state.pattern === 'none') {
    l.object.visible = false;
    return;
  }
  const tex = getPatternTexture(state.pattern, renderer);
  const tile = PATTERNS[state.pattern].tile * (state.patternScale / 100);
  tex.repeat.set(1 / tile, 1 / tile);
  if (mats.pattern.alphaMap !== tex) {
    mats.pattern.alphaMap = tex;
    mats.pattern.needsUpdate = true;
  }
  l.object.visible = true;
}

function applyResin() {
  const l = layer('resin');
  l.object.visible = state.resin;
  l.object.material = state.quality === 'low' ? mats.resinLite : mats.resin;
}

function applyQuality() {
  const dpr = window.devicePixelRatio || 1;
  const q = {
    high: { pr: Math.min(dpr, 2), trans: 1, dispersion: 3, gemTrans: 1 },
    medium: { pr: Math.min(dpr, 1.5), trans: 0.7, dispersion: 0, gemTrans: 1 },
    low: { pr: 1, trans: 0.5, dispersion: 0, gemTrans: 0 },
  }[state.quality];
  renderer.setPixelRatio(q.pr);
  renderer.transmissionResolutionScale = q.trans;
  mats.gem.dispersion = q.dispersion;
  mats.gem.transmission = q.gemTrans;
  mats.gem.needsUpdate = true;
  if (emblem) applyResin();
  resize();
}

function applyLight() {
  scene.environment = getEnvironment(renderer, state.light);
}

const backdrops = new Map();

// Фон рисуется внутри 3D-сцены (а не CSS), чтобы стекло смолы корректно его преломляло
function getBackdrop(theme) {
  if (backdrops.has(theme)) return backdrops.get(theme);
  const [a, b, c] = THEMES[theme].bg;
  const N = 1024;
  const cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(N / 2, N * 0.45, 0, N / 2, N * 0.45, N * 0.75);
  g.addColorStop(0, a);
  g.addColorStop(0.55, b);
  g.addColorStop(1, c);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, N, N);
  // лёгкий шум против полос на тёмном градиенте
  const img = ctx.getImageData(0, 0, N, N);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 3;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  backdrops.set(theme, tex);
  return tex;
}

function applyTheme() {
  document.documentElement.dataset.theme = state.theme;
  scene.background = getBackdrop(state.theme);
}

function labelContent() {
  const metal = METALS[state.metal].label;
  const finish = FINISHES[state.finish].label.toLowerCase();
  const enamel = ENAMELS[state.enamel].short;
  const cloisonne = state.style === 'enamel';
  return {
    rim: { title: 'Контур', subtitle: `${metal}, ${finish}` },
    resin: { title: 'Эпоксидная смола', subtitle: 'Прозрачный купол-линза' },
    ink: { title: 'Знак', subtitle: cloisonne ? `Горячая эмаль · ${enamel}` : 'Металлический рельеф' },
    pattern: { title: 'Узор', subtitle: cloisonne ? 'Гравировка по металлу' : 'Металлическая печать' },
    field: cloisonne
      ? { title: 'Перегородки', subtitle: `${metal}, техника клуазоне` }
      : { title: 'Поле', subtitle: `Непрозрачная эмаль · ${enamel}` },
    base: { title: 'Подложка', subtitle: 'На обороте — гравировка и кристалл' },
  };
}

// ================================================================ Движение

const TAU = Math.PI * 2;
// «модельное» время анимаций (мс): идёт вместе с кадрами, поэтому паузы вкладки не ломают анимации
let simTime = 0;
const motion = {
  rotX: 0,
  rotY: -2.4,
  velX: 0,
  velY: 0,
  spin: 0,
  target: { x: 0, y: 0, rate: 1.6 },
  dragging: false,
  lastInteraction: 0,
  zoom: 1,
  explode: 1.25,
  explodeTarget: 0,
  pointer: { nx: 0, ny: 0, inside: false },
  flip: null,
  wobble: null,
  recording: null,
  intro: 0,
};

const ease = {
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  out: (t) => 1 - Math.pow(1 - t, 3),
  outQuart: (t) => 1 - Math.pow(1 - t, 4),
};
const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));
const clamp01 = (t) => Math.min(Math.max(t, 0), 1);

function applyView() {
  if (state.view === 'layers') {
    motion.explodeTarget = 1;
    // целевой ракурс 3/4 с учётом текущего переворота, ближайший к текущему углу
    const want = -0.82 - flipper.rotation.y;
    const k = Math.round((motion.rotY - want) / TAU);
    motion.target = { x: -0.14, y: want + k * TAU, rate: 3 };
  } else {
    motion.explodeTarget = 0;
    const want = -flipper.rotation.y;
    const k = Math.round((motion.rotY - want) / TAU);
    motion.target = { x: 0, y: want + k * TAU, rate: 3 };
  }
  motion.velX = motion.velY = 0;
}

function startFlip() {
  if (motion.flip || motion.recording) return;
  motion.flip = { type: 'flip', t0: simTime, dur: 950, fromY: flipper.rotation.y };
}

function startToss() {
  if (motion.flip || motion.recording) return;
  const k = 5 + Math.floor(Math.random() * 4); // 5–8 полуоборотов
  motion.flip = { type: 'toss', t0: simTime, dur: 1500, fromY: flipper.rotation.y, k };
}

function updateFlip(now) {
  const f = motion.flip;
  if (f) {
    const t = clamp01((now - f.t0) / f.dur);
    if (f.type === 'flip') {
      flipper.rotation.y = f.fromY + Math.PI * ease.inOut(t);
      flipper.rotation.x = Math.sin(Math.PI * t) * 0.16;
      flipper.position.z = Math.sin(Math.PI * t) * 0.45;
    } else {
      const odd = f.k % 2 === 1;
      flipper.rotation.x = f.k * Math.PI * ease.outQuart(t);
      flipper.rotation.z = odd ? Math.PI * ease.inOut(t) : 0;
      flipper.position.z = 4 * t * (1 - t) * 2.2;
    }
    if (t >= 1) {
      const odd = f.type === 'flip' || f.k % 2 === 1;
      flipper.rotation.set(0, (f.fromY + (odd ? Math.PI : 0)) % TAU, 0);
      flipper.position.z = 0;
      if (f.type === 'toss') motion.wobble = { t0: now };
      motion.flip = null;
    }
  } else if (motion.wobble) {
    const t = (now - motion.wobble.t0) / 1000;
    flipper.rotation.x = 0.14 * Math.exp(-5 * t) * Math.sin(t * 22);
    if (t > 1.2) {
      flipper.rotation.x = 0;
      motion.wobble = null;
    }
  }
}

function updateLayerPositions(e) {
  if (!emblem) return;
  const vis = emblem.layers.filter((l) => l.object.visible);
  const mid = (vis.length - 1) / 2;
  vis.forEach((l, i) => (l.object.position.z = (i - mid) * DIM.gap * e));
}

// ================================================================ Камера и размеры

let width = 1;
let height = 1;

function resize() {
  const r = viewer.getBoundingClientRect();
  width = Math.max(1, Math.round(r.width));
  height = Math.max(1, Math.round(r.height));
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(viewer);

function targetDistance(e) {
  const b = emblem.outlines.bounds;
  const s = DIM.worldScale;
  const h = (b.maxY - b.minY) * s * (1 + 0.38 * e);
  const depth = e * 5 * DIM.gap * s;
  const w = (b.maxX - b.minX) * s + depth * 0.85;
  const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const dH = h / 0.72 / (2 * tan);
  const dW = w / 0.8 / (2 * tan * camera.aspect);
  return Math.max(dH, dW) * motion.zoom;
}

// ================================================================ Ввод

const raycaster = new THREE.Raycaster();
const pointers = new Map();
let drag = null;
let pinch = null;

function hitTest(clientX, clientY) {
  const r = canvas.getBoundingClientRect();
  const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  return raycaster.intersectObject(emblem.group, true).length > 0;
}

function interacted() {
  motion.lastInteraction = simTime;
  hint.classList.add('hidden');
}

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 1) {
    drag = { x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, t0: performance.now(), t: performance.now(), moved: false };
    motion.dragging = true;
    motion.velX = motion.velY = 0;
  } else if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom: motion.zoom };
    drag = null;
  }
  interacted();
});

canvas.addEventListener('pointermove', (e) => {
  const r = canvas.getBoundingClientRect();
  motion.pointer.nx = ((e.clientX - r.left) / r.width) * 2 - 1;
  motion.pointer.ny = -(((e.clientY - r.top) / r.height) * 2 - 1);
  motion.pointer.inside = true;
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (pinch && pointers.size >= 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    motion.zoom = THREE.MathUtils.clamp((pinch.zoom * pinch.d) / d, 0.55, 1.8);
    return;
  }
  if (!drag) return;
  const now = performance.now();
  const dx = e.clientX - drag.x;
  const dy = e.clientY - drag.y;
  const dt = Math.max((now - drag.t) / 1000, 1 / 240);
  if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 5) drag.moved = true;
  if (drag.moved) {
    motion.target = null;
    const ry = dx * 0.0085;
    const rx = dy * 0.0065;
    motion.rotY += ry;
    motion.rotX = THREE.MathUtils.clamp(motion.rotX + rx, -1.3, 1.3);
    motion.velY = damp(motion.velY, ry / dt, 18, dt);
    motion.velX = damp(motion.velX, rx / dt, 18, dt);
    canvas.classList.add('grabbing');
  }
  drag.x = e.clientX;
  drag.y = e.clientY;
  drag.t = now;
  interacted();
});

function endPointer(e) {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinch = null;
  if (drag && pointers.size === 0) {
    const quick = performance.now() - drag.t0 < 450;
    if (!drag.moved && quick && e.type === 'pointerup' && hitTest(e.clientX, e.clientY)) {
      if (state.view === 'layers') set('view', 'assembled');
      else if (state.interaction === 'coin') startToss();
      else startFlip();
    }
    // если палец/мышь остановились перед отпусканием — без инерции
    if (performance.now() - drag.t > 80) motion.velX = motion.velY = 0;
    drag = null;
    motion.dragging = false;
    canvas.classList.remove('grabbing');
  }
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('pointerleave', () => (motion.pointer.inside = false));

let lastHover = 0;
canvas.addEventListener('pointermove', (e) => {
  if (motion.dragging || !emblem) return;
  const now = performance.now();
  if (now - lastHover < 60) return;
  lastHover = now;
  canvas.classList.toggle('over', hitTest(e.clientX, e.clientY));
});

canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    motion.zoom = THREE.MathUtils.clamp(motion.zoom * Math.exp(e.deltaY * 0.0012), 0.55, 1.8);
    interacted();
  },
  { passive: false },
);

window.addEventListener('keydown', (e) => {
  if (e.target.closest?.('input, textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (k === 'h' || k === 'р') togglePanel();
  else if (k === 'f' || k === 'а') toggleFullscreen();
  else if (k === 'p' || k === 'з') presentationMode();
  else if (k === 'l' || k === 'д') set('view', state.view === 'layers' ? 'assembled' : 'layers');
  else if (k === 'r' || k === 'к') set('autoRotate', !state.autoRotate);
  else if (k === ' ') {
    e.preventDefault();
    if (state.interaction === 'coin') startToss();
    else startFlip();
  } else return;
  interacted();
});

function togglePanel() {
  app.classList.toggle('panel-hidden');
}

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen?.();
  else document.documentElement.requestFullscreen?.().catch(() => {});
}

function presentationMode() {
  app.classList.add('panel-hidden');
  if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
  toast('Режим презентации · H — панель, Esc — выход из полноэкранного режима', 3200);
}

// ================================================================ Экспорт

let busy = false;

async function onAction(action) {
  if (action === 'reset') {
    const rebuildNeeded = state.form !== DEFAULTS.form || state.style !== DEFAULTS.style;
    Object.assign(state, DEFAULTS);
    if (rebuildNeeded) rebuild();
    applyQuality();
    applyMaterials();
    applyPattern();
    applyResin();
    applyLight();
    applyTheme();
    applyView();
    motion.zoom = 1;
    syncUI();
    toast('Настройки сброшены');
    return;
  }
  if (action === 'togglePanel') return togglePanel();
  if (action === 'present') return presentationMode();
  if (action === 'link') {
    writeHash();
    try {
      await navigator.clipboard.writeText(location.href);
      toast('Ссылка с текущими настройками скопирована');
    } catch {
      toast('Скопируйте адрес из строки браузера');
    }
    return;
  }
  if (busy) return;
  busy = true;
  try {
    if (action === 'png') {
      const blob = await exportPNG(renderer, () => {
        scene.background = null; // прозрачный фон
        renderer.render(scene, camera);
        scene.background = getBackdrop(state.theme);
      }, 2);
      download(blob, 'spbgasu-emblem.png');
      toast('PNG сохранён');
    } else if (action === 'glb') {
      const blob = await exportGLB(emblem.group, mats);
      download(blob, 'spbgasu-emblem.glb');
      toast('GLB сохранён — в PowerPoint: Вставка → 3D-модели');
    } else if (action === 'video') {
      if (state.view === 'layers') set('view', 'assembled');
      const duration = 6000;
      motion.recording = { t0: performance.now(), dur: duration, y0: motion.rotY, x0: motion.rotX };
      toast('Запись 360°…', duration);
      const { blob, ext } = await recordCanvas(canvas, duration + 120);
      motion.recording = null;
      download(blob, `spbgasu-emblem-360.${ext}`);
      toast(`Видео сохранено (${ext.toUpperCase()})`);
    }
  } catch (err) {
    console.error(err);
    motion.recording = null;
    toast(`Не получилось: ${err.message || err}`);
  } finally {
    busy = false;
  }
}

// ================================================================ Связка с панелью

const panel = createPanel($('panel'), SCHEMA, store, { onChange: set, onAction });

function syncUI() {
  panel.update(state);
  labels.setContent(labelContent());
  const touch = matchMedia('(pointer: coarse)').matches;
  const tap = touch ? 'Тап' : 'Клик';
  hint.textContent = `${touch ? 'Проведите' : 'Потяните'} — повернуть · ${tap} — ${state.interaction === 'coin' ? 'подбросить' : 'перевернуть'}`;
  writeHash();
}

function set(key, value) {
  if (state[key] === value) return;
  state[key] = value;
  switch (key) {
    case 'form':
    case 'style':
      rebuild();
      break;
    case 'metal':
    case 'finish':
    case 'enamel':
    case 'gem':
      applyMaterials();
      break;
    case 'pattern':
    case 'patternScale':
      applyPattern();
      break;
    case 'resin':
      applyResin();
      applyMaterials();
      break;
    case 'quality':
      applyQuality();
      break;
    case 'light':
      applyLight();
      break;
    case 'theme':
      applyTheme();
      break;
    case 'view':
      applyView();
      break;
    case 'autoRotate':
      motion.lastInteraction = 0;
      break;
  }
  syncUI();
}

// ================================================================ Цикл

let lastFrame = performance.now();
let firstFrame = true;

function frame() {
  const t = performance.now();
  const dt = Math.min((t - lastFrame) / 1000, 1 / 20);
  lastFrame = t;
  tick(dt);
  render();
}

function tick(dt) {
  simTime += dt * 1000;
  const now = simTime;
  const m = motion;

  // --- вращение
  if (m.recording) {
    const t = clamp01((performance.now() - m.recording.t0) / m.recording.dur);
    m.rotY = m.recording.y0 + TAU * t;
    m.rotX = damp(m.rotX, 0, 4, dt);
  } else if (m.target && !m.dragging) {
    m.rotX = damp(m.rotX, m.target.x, m.target.rate, dt);
    m.rotY = damp(m.rotY, m.target.y, m.target.rate, dt);
    if (Math.abs(m.rotY - m.target.y) < 0.002 && Math.abs(m.rotX - m.target.x) < 0.002) m.target = null;
  } else if (!m.dragging) {
    m.rotY += m.velY * dt;
    m.rotX = THREE.MathUtils.clamp(m.rotX + m.velX * dt, -1.3, 1.3);
    m.velY *= Math.exp(-dt * 3.2);
    m.velX *= Math.exp(-dt * 3.2);
  }
  const idle = now - m.lastInteraction > 2200;
  const spinning = state.autoRotate && state.view === 'assembled' && idle && !m.dragging && !m.flip && !m.recording && !m.target;
  m.spin = damp(m.spin, spinning ? 0.34 : 0, 1.5, dt);
  m.rotY += m.spin * dt;
  if (spinning) m.rotX = damp(m.rotX, 0, 0.8, dt);
  spinner.rotation.set(m.rotX, m.rotY, 0);

  updateFlip(now);

  // --- разборка на слои
  m.explode = damp(m.explode, m.explodeTarget, m.explode > m.explodeTarget && now - m.intro < 3000 ? 2.2 : 4, dt);
  updateLayerPositions(m.explode);

  // --- интро и наклон за курсором
  const introT = clamp01((now - m.intro) / 1800);
  stage.scale.setScalar(0.9 + 0.1 * ease.out(introT));
  const tiltOn = m.pointer.inside && !m.dragging && state.view === 'assembled' && !m.recording;
  stage.rotation.x = damp(stage.rotation.x, tiltOn ? -m.pointer.ny * 0.1 : 0, 3, dt);
  stage.rotation.y = damp(stage.rotation.y, tiltOn ? m.pointer.nx * 0.16 : 0, 3, dt);

  // --- камера
  camera.position.z = damp(camera.position.z, targetDistance(m.explode), firstFrame ? 1000 : 5, dt);
}

function render() {
  renderer.render(scene, camera);
  labels.update(emblem.layers, camera, width, height, state.view === 'layers' ? motion.explode : 0);

  if (firstFrame) {
    firstFrame = false;
    $('loader').classList.add('done');
    setTimeout(() => $('loader')?.remove(), 900);
    viewer.classList.add('ready');
  }
}

// ================================================================ Старт

async function init() {
  try {
    await Promise.all([
      document.fonts.load('600 40px "Inter Variable"', 'САНКТ-ПЕТЕРБУРГ 1832'),
      document.fonts.load('400 12px "Inter Variable"', 'Эмблема'),
    ]);
  } catch {
    /* шрифт не критичен */
  }
  applyTheme();
  applyLight();
  rebuild();
  applyQuality();
  syncUI();
  if (state.view === 'layers') applyView();
  resize();
  renderer.setAnimationLoop(frame);
}

init();

// для отладки из консоли
window.__emblem = {
  state,
  motion,
  scene,
  camera,
  renderer,
  set,
  flip: () => (state.interaction === 'coin' ? startToss() : startFlip()),
  action: onAction,
  // прокрутить анимацию вперёд на seconds (для проверки без реального времени)
  advance(seconds, step = 1 / 60) {
    for (let i = 0; i < Math.round(seconds / step); i++) tick(step);
    render();
  },
  get emblem() {
    return emblem;
  },
};
