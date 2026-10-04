// Гравировка на обороте подложки. Рисуется на canvas в координатах эмблемы
// и превращается в три карты: цвет (затемнение), шероховатость и рельеф (bump).

import * as THREE from 'three';
import { pathsToPoints } from './emblem.js';

const K = 14; // пикселей на единицу эмблемы
const FONT = '"Inter Variable", Inter, system-ui, sans-serif';

const LINES = ['САНКТ-ПЕТЕРБУРГСКИЙ', 'ГОСУДАРСТВЕННЫЙ', 'АРХИТЕКТУРНО-', 'СТРОИТЕЛЬНЫЙ', 'УНИВЕРСИТЕТ'];

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function tinted(mask, color) {
  const c = makeCanvas(mask.width, mask.height);
  const ctx = c.getContext('2d');
  ctx.drawImage(mask, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, c.width, c.height);
  return c;
}

const gray = (v) => {
  const n = Math.round(Math.min(Math.max(v, 0), 1) * 255);
  return `rgb(${n},${n},${n})`;
};

function drawMask({ bounds, engraveBorder, gemPos }) {
  const W = Math.ceil((bounds.maxX - bounds.minX) * K);
  const H = Math.ceil((bounds.maxY - bounds.minY) * K);
  const mask = makeCanvas(W, H);
  const ctx = mask.getContext('2d');
  // Изображение «как видно сзади»: ось X зеркальна относительно локальной
  const X = (x) => (bounds.maxX - x) * K;
  const Y = (y) => (bounds.maxY - y) * K;
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#fff';
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // Двойная рамка по контуру
  engraveBorder.forEach((paths, i) => {
    ctx.lineWidth = (i === 0 ? 0.34 : 0.16) * K;
    for (const poly of pathsToPoints(paths)) {
      ctx.beginPath();
      poly.forEach(([x, y], j) => (j ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))));
      ctx.closePath();
      ctx.stroke();
    }
  });

  // Лучи вокруг кристалла — как клинчатые камни над аркой на фасаде
  const gx = X(gemPos.x);
  const gy = Y(gemPos.y);
  const rays = 40;
  ctx.lineWidth = 0.26 * K;
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2;
    const r1 = 5.3;
    const r2 = i % 2 ? 8.1 : 9.6;
    ctx.beginPath();
    ctx.moveTo(gx + Math.cos(a) * r1 * K, gy + Math.sin(a) * r1 * K);
    ctx.lineTo(gx + Math.cos(a) * r2 * K, gy + Math.sin(a) * r2 * K);
    ctx.stroke();
  }
  ctx.lineWidth = 0.18 * K;
  ctx.beginPath();
  ctx.arc(gx, gy, 4.85 * K, 0, Math.PI * 2);
  ctx.stroke();

  // Линия карниза
  const cx = X(0);
  ctx.lineWidth = 0.22 * K;
  for (const y of [40.4, 39.4]) {
    ctx.beginPath();
    ctx.moveTo(cx - 33 * K, Y(y));
    ctx.lineTo(cx + 33 * K, Y(y));
    ctx.stroke();
  }

  // Полное название
  const text = (str, y, size, weight = 600, spacing = 0.08) => {
    ctx.font = `${weight} ${size * K}px ${FONT}`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${spacing * size * K}px`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(str, cx + (spacing * size * K) / 2, Y(y));
  };
  ctx.font = `600 ${5 * K}px ${FONT}`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${0.08 * 5 * K}px`;
  const widest = Math.max(...LINES.map((l) => ctx.measureText(l).width));
  const size = Math.min(4.6, (5 * (58 * K)) / widest);
  LINES.forEach((line, i) => text(line, 31 - i * 7.4, size));

  // Разделитель
  ctx.lineWidth = 0.22 * K;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx + s * 3.6 * K, Y(-6.5));
    ctx.lineTo(cx + s * 22 * K, Y(-6.5));
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(cx, Y(-6.5 + 1.5));
  ctx.lineTo(cx + 1.5 * K, Y(-6.5));
  ctx.lineTo(cx, Y(-6.5 - 1.5));
  ctx.lineTo(cx - 1.5 * K, Y(-6.5));
  ctx.closePath();
  ctx.fill();

  text('ОСНОВАН В', -13.6, 2.7, 560, 0.42);
  text('1832', -26, 12.5, 680, 0.03);
  text('SPBGASU.RU', -46.5, 2.5, 560, 0.42);

  for (const dx of [-3.2, 0, 3.2]) {
    const x = cx + dx * K;
    const y = Y(-61);
    const r = 0.75 * K;
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r, y);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r, y);
    ctx.closePath();
    ctx.fill();
  }
  return mask;
}

export function createBackTextures({ outlines, gemPos }) {
  const mask = drawMask({ bounds: outlines.bounds, engraveBorder: outlines.engraveBorder, gemPos });
  const { width: W, height: H } = mask;

  const albedoCanvas = makeCanvas(W, H);
  {
    const ctx = albedoCanvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(tinted(mask, '#5c5c5c'), 0, 0);
  }

  const bumpCanvas = makeCanvas(W, H);
  {
    const ctx = bumpCanvas.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    ctx.filter = 'blur(1.2px)';
    ctx.drawImage(mask, 0, 0);
  }

  const roughCanvas = makeCanvas(W, H);
  const engravedMask = tinted(mask, gray(0.72));

  const albedo = new THREE.CanvasTexture(albedoCanvas);
  albedo.colorSpace = THREE.SRGBColorSpace;
  const bump = new THREE.CanvasTexture(bumpCanvas);
  bump.colorSpace = THREE.NoColorSpace;
  const rough = new THREE.CanvasTexture(roughCanvas);
  rough.colorSpace = THREE.NoColorSpace;
  for (const t of [albedo, bump, rough]) t.anisotropy = 8;

  function setFinishRoughness(r) {
    const ctx = roughCanvas.getContext('2d');
    ctx.fillStyle = gray(r);
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(engravedMask, 0, 0);
    rough.needsUpdate = true;
  }
  setFinishRoughness(0.08);

  return {
    albedo,
    bump,
    rough,
    setFinishRoughness,
    dispose() {
      albedo.dispose();
      bump.dispose();
      rough.dispose();
    },
  };
}
