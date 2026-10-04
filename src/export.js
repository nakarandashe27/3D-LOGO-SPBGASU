// Экспорт: PNG-кадр, GLB-модель (вставляется в PowerPoint как 3D-объект), видео 360°.

import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

export function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Рендерит текущий кадр в повышенном разрешении с прозрачным фоном. */
export function exportPNG(renderer, render, scale = 2) {
  return new Promise((resolve) => {
    const prev = renderer.getPixelRatio();
    renderer.setPixelRatio(Math.min(prev * scale, 4));
    render();
    renderer.domElement.toBlob((blob) => {
      renderer.setPixelRatio(prev);
      resolve(blob);
    }, 'image/png');
  });
}

/** Узор хранится как alphaMap — glTF так не умеет, поэтому запекаем его в RGBA-текстуру. */
function patternToRGBA(alphaTexture) {
  const src = alphaTexture.image;
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  const ctx = c.getContext('2d');
  ctx.drawImage(src, 0, 0);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  for (let i = 0; i < img.data.length; i += 4) {
    const a = img.data[i];
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
    img.data[i + 3] = a;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export function exportGLB(emblemGroup, materials) {
  const root = emblemGroup.clone(true);
  root.position.set(0, 0, 0);
  root.rotation.set(0, 0, 0);
  root.scale.setScalar(emblemGroup.scale.x);
  // слои собираем в исходное положение (на случай экспорта из режима «По слоям»)
  for (const child of root.children) child.position.z = 0;

  root.traverse((o) => {
    if (!o.isMesh) return;
    if (o.material === materials.resin || o.material === materials.resinLite) {
      // transmission поддерживают не все программы — экспортируем как лёгкое стекло
      o.material = new THREE.MeshStandardMaterial({
        name: 'epoxy-resin',
        color: 0xffffff,
        transparent: true,
        opacity: 0.12,
        roughness: 0.04,
        metalness: 0,
      });
    } else if (o.material === materials.pattern) {
      const alpha = materials.pattern.alphaMap;
      if (!alpha) return;
      const geo = o.geometry.clone();
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * alpha.repeat.x, uv.getY(i) * alpha.repeat.y);
      o.geometry = geo;
      o.material = new THREE.MeshStandardMaterial({
        name: 'pattern-print',
        color: materials.pattern.color,
        metalness: 1,
        roughness: materials.pattern.roughness,
        map: patternToRGBA(alpha),
        alphaTest: 0.5,
        side: THREE.DoubleSide,
      });
    } else if (Array.isArray(o.material)) {
      o.material = o.material.map((m) =>
        m === materials.back
          ? new THREE.MeshStandardMaterial({
              name: 'metal-engraved',
              color: m.color,
              metalness: 1,
              roughness: 1,
              roughnessMap: m.roughnessMap,
              map: m.map,
            })
          : m,
      );
    } else if (o.material === materials.gem) {
      o.material = new THREE.MeshPhysicalMaterial({
        name: 'gem',
        color: materials.gem.color,
        metalness: 0,
        roughness: 0.02,
        transmission: 1,
        ior: materials.gem.ior,
        flatShading: true,
      });
    }
  });

  return new Promise((resolve, reject) => {
    new GLTFExporter().parse(
      root,
      (glb) => resolve(new Blob([glb], { type: 'model/gltf-binary' })),
      reject,
      { binary: true, onlyVisible: true },
    );
  });
}

export function pickVideoMime() {
  const candidates = [
    ['video/mp4;codecs=avc1.640028', 'mp4'],
    ['video/mp4', 'mp4'],
    ['video/webm;codecs=vp9', 'webm'],
    ['video/webm', 'webm'],
  ];
  for (const [mime, ext] of candidates) {
    if (window.MediaRecorder && MediaRecorder.isTypeSupported(mime)) return { mime, ext };
  }
  return null;
}

/** Записывает canvas, пока выполняется сценарий оборота. */
export function recordCanvas(canvas, durationMs, fps = 60) {
  const fmt = pickVideoMime();
  if (!fmt) return Promise.reject(new Error('MediaRecorder не поддерживается этим браузером'));
  const stream = canvas.captureStream(fps);
  const rec = new MediaRecorder(stream, { mimeType: fmt.mime, videoBitsPerSecond: 18_000_000 });
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  return new Promise((resolve, reject) => {
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      resolve({ blob: new Blob(chunks, { type: fmt.mime.split(';')[0] }), ext: fmt.ext });
    };
    rec.onerror = (e) => reject(e.error || e);
    rec.start(250);
    setTimeout(() => rec.state !== 'inactive' && rec.stop(), durationMs);
  });
}
