// Бесшовные узоры для слоя «Узор». Рисуются на canvas белым по чёрному
// и используются как alphaMap металлической печати.

import * as THREE from 'three';

const N = 512;

export const PATTERNS = {
  none: { label: 'Нет' },
  hatch: { label: 'Штриховка', tile: 15 }, // отсылка к сетке со штриховкой из исторического логотипа
  brick: { label: 'Кладка', tile: 18 },
  blueprint: { label: 'Чертёж', tile: 20 },
  guilloche: { label: 'Гильош', tile: 22 },
  dots: { label: 'Точки', tile: 9 },
  stars: { label: 'Звёзды', tile: 16 },
};

const draw = {
  hatch(ctx) {
    const cell = N / 2;
    const gap = 30;
    ctx.lineWidth = 9;
    for (let cy = 0; cy < 2; cy++) {
      for (let cx = 0; cx < 2; cx++) {
        const x0 = cx * cell + gap / 2;
        const y0 = cy * cell + gap / 2;
        const s = cell - gap;
        ctx.save();
        ctx.beginPath();
        ctx.rect(x0, y0, s, s);
        ctx.clip();
        for (let k = -s; k < s * 2; k += 26) {
          ctx.beginPath();
          ctx.moveTo(x0 + k, y0 + s);
          ctx.lineTo(x0 + k + s, y0);
          ctx.stroke();
        }
        ctx.restore();
      }
    }
  },

  brick(ctx) {
    const rowH = N / 4;
    const w = N / 2;
    const t = 12;
    for (let r = 0; r <= 4; r++) ctx.fillRect(0, r * rowH - t / 2, N, t);
    for (let r = 0; r < 4; r++) {
      const shift = r % 2 ? w / 2 : 0;
      for (let x = shift; x <= N + 1; x += w) {
        ctx.fillRect(x - t / 2, r * rowH, t, rowH);
        if (x - N >= -t) ctx.fillRect(x - N - t / 2, r * rowH, t, rowH);
      }
    }
  },

  blueprint(ctx) {
    for (let i = 0; i <= N; i += 32) {
      const major = i % 128 === 0;
      const t = major ? 6 : 2.2;
      ctx.globalAlpha = major ? 1 : 0.85;
      ctx.fillRect(i - t / 2, 0, t, N);
      ctx.fillRect(0, i - t / 2, N, t);
    }
    ctx.globalAlpha = 1;
    // крестики на узлах крупной сетки
    for (let x = 64; x < N; x += 128) {
      for (let y = 64; y < N; y += 128) {
        ctx.fillRect(x - 14, y - 2.5, 28, 5);
        ctx.fillRect(x - 2.5, y - 14, 5, 28);
      }
    }
  },

  guilloche(ctx) {
    ctx.lineWidth = 3.4;
    const rows = 8;
    const step = N / rows;
    for (let r = -1; r <= rows; r++) {
      for (const phase of [0, Math.PI]) {
        for (const amp of [step * 0.62, step * 0.36]) {
          ctx.beginPath();
          for (let x = 0; x <= N; x += 2) {
            const y = r * step + step / 2 + amp * Math.sin((x / N) * Math.PI * 4 + phase);
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      }
    }
  },

  dots(ctx) {
    const s = N / 8;
    for (let j = 0; j < 8; j++) {
      for (let i = 0; i <= 8; i++) {
        const x = i * s + (j % 2 ? s / 2 : 0);
        const y = j * s + s / 2;
        for (const dx of [0, -N]) {
          ctx.beginPath();
          ctx.arc(x + dx, y, s * 0.17, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  },

  stars(ctx) {
    const s = N / 4;
    const star = (x, y, r) => {
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
        const rr = i % 2 ? r * 0.22 : r;
        ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fill();
    };
    for (let j = 0; j < 4; j++) {
      for (let i = 0; i <= 4; i++) {
        const x = i * s + (j % 2 ? s / 2 : 0);
        const y = j * s + s / 2;
        for (const dx of [0, -N]) {
          star(x + dx, y, s * 0.36);
          ctx.beginPath();
          ctx.arc(x + dx + s / 2, y, s * 0.06, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(x + dx, y + s / 2, s * 0.045, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  },
};

const cache = new Map();

export function getPatternCanvas(name) {
  if (cache.has(name)) return cache.get(name);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = N;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, N, N);
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#fff';
  ctx.lineCap = 'round';
  draw[name]?.(ctx);
  cache.set(name, canvas);
  return canvas;
}

const texCache = new Map();

export function getPatternTexture(name, renderer) {
  if (texCache.has(name)) return texCache.get(name);
  const tex = new THREE.CanvasTexture(getPatternCanvas(name));
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  texCache.set(name, tex);
  return tex;
}

/** Маленькое превью узора для кнопки панели (светлые линии на тёмном). */
export function getPatternPreview(name) {
  if (name === 'none') return null;
  const src = getPatternCanvas(name);
  const c = document.createElement('canvas');
  c.width = c.height = 48;
  const ctx = c.getContext('2d');
  ctx.drawImage(src, 0, 0, N / 2, N / 2, 0, 0, 48, 48);
  return c.toDataURL();
}
