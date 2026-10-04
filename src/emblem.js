// Геометрия эмблемы: SVG-контуры логотипа → булевы операции (Clipper) → слои 3D-объекта.
// Все размеры — в единицах viewBox исходного SVG (высота эмблемы ≈ 130).

import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import ClipperLib from 'clipper-lib';
import { EMBLEM_PATHS } from './assets/emblem.js';

const C = ClipperLib;
const SCALE = 1000; // Clipper работает в целых числах
const NZ = C.PolyFillType.pftNonZero;

export const DIM = {
  margin: 3.2, // отступ силуэта от знака
  fillet: 1.8, // скругление внутренних углов силуэта
  corniceY: 39, // граница фронтона с карнизом и корпуса (локальные координаты)
  plateMargin: 5.5,
  rim: 1.35, // ширина металлического контура
  base: 3.0, // толщина подложки
  rimHeight: 1.7,
  resinHeight: 1.5,
  gap: 28, // шаг между слоями в разобранном виде
  worldScale: 1 / 40,
};

export const STYLES = {
  // Знак — эмаль в металлических перегородках (клуазоне), как в фирменных цветах
  enamel: { fieldFull: false, fieldH: 0.95, fieldBevel: 0.06, inkZ: 0, inkH: 0.8, inkBevel: 0.04 },
  // Знак — полированный металлический рельеф на эмалевом поле
  relief: { fieldFull: true, fieldH: 0.38, fieldBevel: 0, inkZ: 0.38, inkH: 0.92, inkBevel: 0.16 },
};

// ---------------------------------------------------------------- Clipper helpers

function run(type, subject, clip, toTree = false) {
  const c = new C.Clipper();
  c.AddPaths(subject, C.PolyType.ptSubject, true);
  if (clip) c.AddPaths(clip, C.PolyType.ptClip, true);
  const out = toTree ? new C.PolyTree() : new C.Paths();
  c.Execute(type, out, NZ, NZ);
  return out;
}

const union = (paths) => run(C.ClipType.ctUnion, paths);
const difference = (a, b) => run(C.ClipType.ctDifference, a, b);
const outers = (paths) => paths.filter((p) => C.Clipper.Orientation(p));

function offset(paths, delta) {
  const co = new C.ClipperOffset(2, 0.02 * SCALE);
  co.AddPaths(paths, C.JoinType.jtRound, C.EndType.etClosedPolygon);
  const out = new C.Paths();
  co.Execute(out, delta * SCALE);
  return out;
}

function convexHull(paths) {
  const pts = paths.flat().map((p) => [p.X, p.Y]);
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  const upper = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), p) <= 0) lower.pop();
    lower.push(p);
  }
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return [lower.concat(upper).map(([X, Y]) => ({ X, Y }))];
}

function toShapes(paths) {
  const tree = run(C.ClipType.ctUnion, paths, null, true);
  const v = (p) => new THREE.Vector2(p.X / SCALE, p.Y / SCALE);
  const shapes = [];
  (function walk(node) {
    for (const outer of node.Childs()) {
      const shape = new THREE.Shape(outer.Contour().map(v));
      for (const hole of outer.Childs()) {
        shape.holes.push(new THREE.Path(hole.Contour().map(v)));
        walk(hole); // острова внутри отверстий
      }
      shapes.push(shape);
    }
  })(tree);
  return shapes;
}

function boundsOf(paths) {
  const b = C.Clipper.GetBounds(paths);
  return {
    minX: b.left / SCALE,
    maxX: b.right / SCALE,
    minY: b.top / SCALE,
    maxY: b.bottom / SCALE,
  };
}

/** Clipper-контуры → массивы точек в единицах эмблемы (для рисования на canvas). */
export function pathsToPoints(paths) {
  return paths.map((p) => p.map((q) => [q.X / SCALE, q.Y / SCALE]));
}

// ---------------------------------------------------------------- SVG → контуры

let INK = null;
let CENTER = null;

function parseInk() {
  if (INK) return INK;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg">${EMBLEM_PATHS.map((d) => `<path d="${d}"/>`).join('')}</svg>`;
  const data = new SVGLoader().parse(svg);
  let all = [];
  for (const path of data.paths) {
    const polys = [];
    for (const sub of path.subPaths) {
      const pts = sub.getPoints(14);
      if (pts.length < 3) continue;
      polys.push(pts.map((p) => ({ X: Math.round(p.x * SCALE), Y: Math.round(-p.y * SCALE) })));
    }
    // Каждый <path> сначала разрешаем по правилу nonzero отдельно, затем объединяем все
    all = all.concat(union(polys));
  }
  let ink = union(all);
  const b = C.Clipper.GetBounds(ink);
  const cx = Math.round((b.left + b.right) / 2);
  const cy = Math.round((b.top + b.bottom) / 2);
  for (const poly of ink) for (const p of poly) { p.X -= cx; p.Y -= cy; }
  ink = C.Clipper.CleanPolygons(ink, 0.006 * SCALE).filter((p) => p.length > 2);
  CENTER = { x: cx / SCALE, y: -cy / SCALE }; // центр в координатах SVG
  INK = ink;
  return INK;
}

/** Переводит точку из координат SVG-эмблемы в локальные координаты модели. */
export function svgToLocal(x, y) {
  parseInk();
  return new THREE.Vector2(x - CENTER.x, CENTER.y - y);
}

const outlineCache = new Map();

function rectPath(minX, minY, maxX, maxY) {
  const s = SCALE;
  return [
    { X: Math.round(minX * s), Y: Math.round(minY * s) },
    { X: Math.round(maxX * s), Y: Math.round(minY * s) },
    { X: Math.round(maxX * s), Y: Math.round(maxY * s) },
    { X: Math.round(minX * s), Y: Math.round(maxY * s) },
  ];
}

const intersect = (a, b) => run(C.ClipType.ctIntersection, a, b);

export function getOutlines(form) {
  if (outlineCache.has(form)) return outlineCache.get(form);
  const ink = parseInk();
  const ib = boundsOf(ink);
  let silhouette;
  if (form === 'plate') {
    // скруглённая табличка, как мемориальная доска на фасаде
    silhouette = offset([rectPath(ib.minX, ib.minY, ib.maxX, ib.maxY)], DIM.plateMargin);
  } else {
    // «фасад»: фронтон со свесом карниза + прямой корпус до самого низа
    const pediment = convexHull(intersect(ink, [rectPath(-1e3, DIM.corniceY, 1e3, 1e3)]));
    const bodyBounds = boundsOf(intersect(ink, [rectPath(-1e3, -1e3, 1e3, DIM.corniceY)]));
    const body = rectPath(bodyBounds.minX, ib.minY, bodyBounds.maxX, DIM.corniceY + 0.5);
    silhouette = offset(union([...pediment, body]), DIM.margin);
    silhouette = offset(offset(silhouette, DIM.fillet), -DIM.fillet); // скругляем внутренние углы
  }
  silhouette = union(outers(silhouette));
  const rimInner = offset(silhouette, -DIM.rim);
  const outlines = {
    ink,
    silhouette,
    rimInner,
    rim: difference(silhouette, rimInner),
    field: difference(rimInner, ink),
    engraveBorder: [offset(silhouette, -2.4), offset(silhouette, -3.1)],
    bounds: boundsOf(silhouette),
    inkBounds: boundsOf(ink),
  };
  outlineCache.set(form, outlines);
  return outlines;
}

// ---------------------------------------------------------------- Геометрия

function extrude(paths, height, bevel = 0, bevelSegments = 3) {
  const b = Math.min(bevel, height / 2 - 0.0005);
  const geo = new THREE.ExtrudeGeometry(toShapes(paths), {
    depth: Math.max(height - 2 * Math.max(b, 0), 0.0005),
    steps: 1,
    curveSegments: 1,
    bevelEnabled: b > 0,
    bevelThickness: b,
    bevelSize: b,
    bevelOffset: -b,
    bevelSegments,
  });
  geo.translate(0, 0, Math.max(b, 0));
  return geo;
}

/** Купол из смолы: вертикальные стенки, скруглённый край и плоская вершина. */
function dome(paths, height, edge = 1.0, rise = 0.75) {
  const depth = height - rise;
  const geo = new THREE.ExtrudeGeometry(toShapes(paths), {
    depth,
    steps: 1,
    curveSegments: 1,
    bevelEnabled: true,
    bevelThickness: rise,
    bevelSize: edge,
    bevelOffset: -edge,
    bevelSegments: 7,
  });
  // нижнее скругление уходит внутрь подложки и не видно
  return geo;
}

/** Делит группу «крышек» ExtrudeGeometry на лицевую (0) и оборотную (2). */
function splitLids(geo, bounds) {
  const groups = geo.groups.slice();
  geo.clearGroups();
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  const w = bounds.maxX - bounds.minX;
  const h = bounds.maxY - bounds.minY;
  for (const g of groups) {
    if (g.materialIndex !== 0) {
      geo.addGroup(g.start, g.count, g.materialIndex);
      continue;
    }
    const half = g.count / 2;
    geo.addGroup(g.start, half, 2); // нижняя крышка = оборот
    geo.addGroup(g.start + half, half, 0);
    for (let i = g.start; i < g.start + half; i++) {
      // UV для оборота: изображение читается, когда смотрим сзади
      uv.setXY(i, (bounds.maxX - pos.getX(i)) / w, (pos.getY(i) - bounds.minY) / h);
    }
  }
  uv.needsUpdate = true;
}

function createGem(materials) {
  const group = new THREE.Group();
  const profile = [
    [0.0, -0.86],
    [0.42, -0.5],
    [1.0, -0.06],
    [1.0, 0.04],
    [0.84, 0.2],
    [0.58, 0.36],
    [0.0, 0.36],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const gemGeo = new THREE.LatheGeometry(profile, 16);
  const gem = new THREE.Mesh(gemGeo, materials.gem);
  gem.name = 'gem';
  gem.rotation.x = -Math.PI / 2; // площадка камня смотрит назад (-Z)
  gem.scale.setScalar(3.4);
  gem.position.z = -0.7;

  const bezelProfile = [
    [1.0, 0.25],
    [1.3, 0.25],
    [1.32, -0.05],
    [1.22, -0.42],
    [1.04, -0.42],
    [0.98, -0.1],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const bezel = new THREE.Mesh(new THREE.LatheGeometry(bezelProfile, 64), materials.metal);
  bezel.name = 'bezel';
  bezel.rotation.x = -Math.PI / 2;
  bezel.scale.setScalar(3.4);
  bezel.position.z = -0.35;
  group.add(bezel, gem);
  return group;
}

export const GEM_SVG_POS = { x: 38.84, y: 15.2 };

/**
 * Строит объект эмблемы.
 * @returns {{ group: THREE.Group, layers: Array, outlines: object }}
 */
export function buildEmblem({ form, style }, materials) {
  const o = getOutlines(form);
  const st = STYLES[style];
  const group = new THREE.Group();
  group.name = 'SPbGASU-emblem';
  group.scale.setScalar(DIM.worldScale);

  // Подложка
  const baseGeo = extrude(o.silhouette, DIM.base, 0.38, 4);
  splitLids(baseGeo, o.bounds);
  baseGeo.translate(0, 0, -DIM.base);
  const base = new THREE.Mesh(baseGeo, [materials.metal, materials.metal, materials.back]);
  base.name = 'base';
  const gem = createGem(materials);
  const gemPos = svgToLocal(GEM_SVG_POS.x, GEM_SVG_POS.y);
  gem.position.set(gemPos.x, gemPos.y, -DIM.base);
  gem.name = 'gem-setting';
  base.add(gem);

  // Поле
  const fieldPaths = st.fieldFull ? o.rimInner : o.field;
  const field = new THREE.Mesh(
    extrude(fieldPaths, st.fieldH, st.fieldBevel, 2),
    style === 'enamel' ? materials.metal : materials.enamel,
  );
  field.name = 'field';

  // Узор (печать поверх поля)
  const patternGeo = new THREE.ShapeGeometry(toShapes(fieldPaths), 1);
  patternGeo.translate(0, 0, st.fieldH + 0.02);
  const pattern = new THREE.Mesh(patternGeo, materials.pattern);
  pattern.name = 'pattern';

  // Знак
  const inkGeo = extrude(o.ink, st.inkH, st.inkBevel, 3);
  inkGeo.translate(0, 0, st.inkZ);
  const ink = new THREE.Mesh(inkGeo, style === 'enamel' ? materials.enamel : materials.metal);
  ink.name = 'ink';

  // Смола
  const resinGeo = dome(o.rimInner, DIM.resinHeight, 1.1, 0.72);
  const resin = new THREE.Mesh(resinGeo, materials.resin);
  resin.name = 'resin';
  resin.renderOrder = 2;

  // Контур
  const rim = new THREE.Mesh(extrude(o.rim, DIM.rimHeight, 0.42, 4), materials.metal);
  rim.name = 'rim';

  const b = o.bounds;
  const top = (z) => new THREE.Vector3(0, b.maxY - 0.5, z);
  const bottom = (z) => new THREE.Vector3(0, b.minY + 0.5, z);

  const layers = [
    { id: 'base', object: base, anchor: bottom(-DIM.base * 0.5) },
    { id: 'field', object: field, anchor: top(st.fieldH) },
    { id: 'pattern', object: pattern, anchor: bottom(st.fieldH) },
    { id: 'ink', object: ink, anchor: top(st.inkZ + st.inkH), anchorInk: true },
    { id: 'resin', object: resin, anchor: bottom(DIM.resinHeight) },
    { id: 'rim', object: rim, anchor: top(DIM.rimHeight) },
  ];
  for (const l of layers) {
    l.top = l.id === 'ink' ? o.inkBounds.maxY - 0.3 : b.maxY - 0.5;
    l.bottom = l.id === 'ink' ? o.inkBounds.minY + 0.3 : b.minY + 0.5;
  }

  for (const l of layers) group.add(l.object);
  return { group, layers, outlines: o, gemPos };
}

export function disposeEmblem(emblem) {
  emblem.group.traverse((obj) => {
    if (obj.isMesh) obj.geometry.dispose();
  });
  emblem.group.removeFromParent();
}
