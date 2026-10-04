// Процедурная «фотостудия» для отражений: циклорама с мягкими световыми полосами по кругу
// плюс чёткие софтбоксы для бликов. Никаких внешних HDR-файлов — всё строится на лету и работает офлайн.

import * as THREE from 'three';

// cyclo.bands: [азимут°, ширина°, яркость]; азимут 0° — за камерой, 90° — справа, 180° — за объектом
export const LIGHTS = {
  studio: {
    label: 'Студия',
    ambient: 0x101012,
    cyclo: {
      color: 0xffffff,
      power: 1.35,
      base: 0.4,
      bands: [
        [0, 60, 0.9],
        [58, 40, 0.75],
        [115, 55, 0.6],
        [180, 70, 0.5],
        [245, 55, 0.65],
        [302, 40, 0.8],
      ],
    },
    panels: [
      { pos: [-3.2, 3.6, 5.2], size: [5.5, 3.6], color: 0xffffff, power: 5.2 }, // ключевой софтбокс
      { pos: [6, 0.6, 2.4], size: [1.1, 9], color: 0xffffff, power: 3.6 }, // стрипбокс справа
      { pos: [-6.2, -0.4, -0.8], size: [1.1, 9], color: 0xffffff, power: 2.2 }, // стрипбокс слева
      { pos: [0, 5.5, -4.5], size: [10, 1.3], color: 0xffffff, power: 2.4 }, // контровой сверху
      { pos: [2.5, -1.5, 6], size: [2.2, 2.2], color: 0xffffff, power: 1.2 }, // заполняющий
    ],
  },
  contrast: {
    label: 'Контраст',
    ambient: 0x060607,
    cyclo: {
      color: 0xffffff,
      power: 0.8,
      base: 0.1,
      bands: [
        [0, 36, 0.7],
        [70, 20, 1.0],
        [140, 30, 0.4],
        [220, 30, 0.4],
        [290, 20, 1.0],
      ],
    },
    panels: [
      { pos: [-5.5, 1, 3.5], size: [0.7, 10], color: 0xffffff, power: 9 },
      { pos: [5.5, 1, 3.5], size: [0.7, 10], color: 0xffffff, power: 7 },
      { pos: [0, 6, 1], size: [8, 0.6], color: 0xffffff, power: 4 },
    ],
  },
  warm: {
    label: 'Тёплый',
    ambient: 0x120e0b,
    cyclo: {
      color: 0xffdcb4,
      power: 1.3,
      base: 0.38,
      bands: [
        [0, 60, 0.9],
        [58, 40, 0.75],
        [120, 55, 0.5],
        [180, 70, 0.45],
        [250, 55, 0.55],
        [305, 40, 0.7],
      ],
    },
    panels: [
      { pos: [-3.5, 3.5, 5], size: [6, 4], color: 0xffd9a8, power: 4.6 },
      { pos: [6, 1, 1.5], size: [1.4, 8], color: 0xffb877, power: 3.2 },
      { pos: [-6, 0, -1], size: [1.4, 8], color: 0x9fc4ff, power: 1.6 },
      { pos: [0, 5.5, -4.5], size: [10, 1.3], color: 0xffe2c4, power: 2.0 },
    ],
  },
};

const cache = new Map();

export function getEnvironment(renderer, key) {
  if (cache.has(key)) return cache.get(key);
  const preset = LIGHTS[key];
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(preset.ambient);

  const disposables = [];

  // Циклорама
  const cycloTex = cycloramaTexture(preset.cyclo);
  const cycloGeo = new THREE.CylinderGeometry(9, 9, 16, 96, 1, true);
  const cycloMat = new THREE.MeshBasicMaterial({
    map: cycloTex,
    color: new THREE.Color(preset.cyclo.color).multiplyScalar(preset.cyclo.power),
    side: THREE.BackSide,
  });
  scene.add(new THREE.Mesh(cycloGeo, cycloMat));
  disposables.push(cycloTex, cycloGeo, cycloMat);

  // Чёткие софтбоксы
  const plane = new THREE.PlaneGeometry(1, 1);
  disposables.push(plane);
  for (const p of preset.panels) {
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(p.color).multiplyScalar(p.power),
      side: THREE.DoubleSide,
    });
    disposables.push(mat);
    const mesh = new THREE.Mesh(plane, mat);
    mesh.position.set(...p.pos);
    mesh.scale.set(p.size[0], p.size[1], 1);
    mesh.lookAt(0, 0, 0);
    scene.add(mesh);
  }

  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(scene, 0.03);
  pmrem.dispose();
  disposables.forEach((d) => d.dispose());

  cache.set(key, rt.texture);
  return rt.texture;
}

// Развёртка циклорамы: по горизонтали — азимут, по вертикали — градиент (светлый верх, тёмный низ)
function cycloramaTexture({ base, bands }) {
  const W = 512;
  const H = 128;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(W, H);
  const angDist = (a, b) => {
    const d = Math.abs(a - b) % 360;
    return d > 180 ? 360 - d : d;
  };
  for (let x = 0; x < W; x++) {
    // u=0 у CylinderGeometry смотрит в +Z (за камеру), угол растёт к +X
    const az = (x / W) * 360;
    let k = base;
    for (const [center, width, power] of bands) {
      const d = angDist(az, center) / (width / 2);
      k += power * Math.exp(-d * d * 1.4);
    }
    for (let y = 0; y < H; y++) {
      const v = y / (H - 1); // 0 — верх
      const vertical = 0.25 + 0.75 * Math.pow(1 - v, 1.3) + 0.35 * Math.exp(-((v - 0.32) ** 2) / 0.01);
      const val = Math.min(255, Math.round(k * vertical * 200));
      const i = (y * W + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = val;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}
