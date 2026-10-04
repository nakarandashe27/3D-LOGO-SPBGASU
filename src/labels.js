// Выноски слоёв для режима «По слоям»: HTML-подписи, привязанные к 3D-точкам.

import * as THREE from 'three';

const v = new THREE.Vector3();

export class LayerLabels {
  constructor(container) {
    this.container = container;
    this.items = new Map();
  }

  setContent(content) {
    // content: { [layerId]: { title, subtitle } }
    for (const [id, c] of Object.entries(content)) {
      let el = this.items.get(id);
      if (!el) {
        el = document.createElement('div');
        el.className = 'label';
        el.innerHTML = '<i class="label-dot"></i><i class="label-line"></i><div class="label-text"><b></b><span></span></div>';
        this.container.appendChild(el);
        this.items.set(id, el);
      }
      el.querySelector('b').textContent = c.title;
      el.querySelector('span').textContent = c.subtitle;
    }
  }

  update(layers, camera, width, height, amount) {
    const visible = layers.filter((l) => l.object.visible);
    for (const [id, el] of this.items) {
      const index = visible.findIndex((l) => l.id === id);
      if (index < 0 || amount < 0.02) {
        el.style.opacity = '0';
        continue;
      }
      const layer = visible[index];
      // подписи чередуются сверху/снизу и ступенькой по высоте, чтобы не налезать друг на друга
      const isTop = index % 2 === 1;
      layer.anchor.y = isTop ? layer.top : layer.bottom;
      layer.object.updateWorldMatrix(true, false);
      v.copy(layer.anchor).applyMatrix4(layer.object.matrixWorld).project(camera);
      const x = (v.x * 0.5 + 0.5) * width;
      const y = (-v.y * 0.5 + 0.5) * height;
      const len = 24 + ((index >> 1) % 2) * 46;
      el.classList.toggle('top', isTop);
      el.classList.toggle('bottom', !isTop);
      el.style.setProperty('--len', `${len}px`);
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      const t = Math.min(Math.max((amount - 0.55) / 0.4, 0), 1);
      el.style.opacity = String(t * t);
    }
  }
}
