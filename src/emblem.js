// Геометрия эмблемы: SVG-контуры логотипа → булевы операции (Clipper) → слои 3D-объекта.
// Все размеры — в единицах viewBox исходного SVG (высота эмблемы ≈ 130).

import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import ClipperLib from 'clipper-lib';
import { EMBLEM_PATHS } from './assets/emblem.js';
import { CLASSIC_PATHS, CLASSIC_CLIP } from './assets/emblem-classic.js';

const C = ClipperLib;
const SCALE = 1000; // Clipper работает в целых числах
const NZ = C.PolyFillType.pftNonZero;
const EO = C.PolyFillType.pftEvenOdd;

export const DIM = {
  margin: 3.2, // отступ силуэта от знака
  fillet: 1.8, // скругление внутренних углов силуэта
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
  // без касаний в одной точке — иначе триангуляция (earcut) может «залить» отверстия
  c.StrictlySimple = true;
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

export function toShapes(paths) {
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

// ---------------------------------------------------------------- Версии логотипа

/**
 * Описание версий. Координаты — в единицах SVG (y вниз), как в исходном файле.
 * ink — основной цвет (эмаль/рельеф), accent — второй цвет (чернение), cut — то, что
 * в логотипе лежит белым поверх основного цвета и прорезает его.
 */
const VERSIONS = {
  new: {
    ink: EMBLEM_PATHS,
    fill: NZ,
    gem: { x: 38.84, y: 15.2 },
    // «фасад»: фронтон со свесом карниза + прямой корпус до самого низа
    silhouette: ({ ink, svgY }) => {
      const cornice = svgY(26);
      const pediment = convexHull(intersect(ink, [rectPath(-1e3, cornice, 1e3, 1e3)]));
      const body = boundsOf(intersect(ink, [rectPath(-1e3, -1e3, 1e3, cornice)]));
      const all = boundsOf(ink);
      return [...pediment, rectPath(body.minX, all.minY, body.maxX, cornice + 0.5)];
    },
    back: {
      axis: 38.84,
      cornice: { y: [24.6, 25.6], half: 33 },
      lines: { y: 34, step: 7.4, width: 58 },
      divider: 71.5,
      founded: 78.6,
      year: 91,
      site: 111.5,
      dots: 126,
    },
  },
  classic: {
    ink: CLASSIC_PATHS.red,
    cut: CLASSIC_PATHS.white,
    accent: CLASSIC_PATHS.gray,
    fill: EO,
    clip: CLASSIC_CLIP,
    clean: 0.04, // в исходном SVG много микросегментов
    gem: { x: 31.3, y: 30.8 },
    // решётка со штриховкой + здание + блок надписи с датой
    silhouette: ({ ink, accent, svgY }) => {
      const grid = boundsOf(intersect(accent, [rectPath(-1e3, svgY(76), 1e3, 1e3)]));
      const building = convexHull(intersect(ink, [rectPath(-1e3, svgY(106.5), 1e3, 1e3)]));
      const text = boundsOf(intersect(ink, [rectPath(-1e3, -1e3, 1e3, svgY(106.5))]));
      const year = boundsOf(intersect(accent, [rectPath(-1e3, -1e3, 1e3, svgY(122))]));
      return [
        rectPath(grid.minX, grid.minY, grid.maxX, grid.maxY),
        ...building,
        rectPath(text.minX, year.minY, text.maxX, text.maxY),
      ];
    },
    back: {
      axis: 31.3,
      cornice: { y: [39.6, 40.6], half: 28 },
      lines: { y: 50.5, step: 7.2, width: 56 },
      divider: 89,
      founded: 95.5,
      year: 106.5,
      site: 120,
      dots: 127,
      // заштрихованная сетка на месте решётки с лицевой стороны: [x0, y0, x1, y1]
      hatch: [
        [16.5, 2.5, 80.5, 19],
        [64.5, 19, 80.5, 71],
      ],
    },
  },
};

const parsed = new Map();

/** SVG-контуры → Clipper-полигоны (y вверх, ещё без центрирования). */
function svgToPolys(ds, fill) {
  if (!ds?.length) return [];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg">${ds.map((d) => `<path d="${d}"/>`).join('')}</svg>`;
  const data = new SVGLoader().parse(svg);
  let all = [];
  for (const path of data.paths) {
    const polys = [];
    for (const sub of path.subPaths) {
      const pts = sub.getPoints(14);
      if (pts.length < 3) continue;
      polys.push(pts.map((p) => ({ X: Math.round(p.x * SCALE), Y: Math.round(-p.y * SCALE) })));
    }
    // каждый <path> разрешаем по своему правилу заливки, затем объединяем
    const c = new C.Clipper();
    c.AddPaths(polys, C.PolyType.ptSubject, true);
    const out = new C.Paths();
    c.Execute(C.ClipType.ctUnion, out, fill, fill);
    all = all.concat(out);
  }
  return union(all);
}

function parseVersion(version) {
  if (parsed.has(version)) return parsed.get(version);
  const v = VERSIONS[version];
  let ink = svgToPolys(v.ink, v.fill);
  let accent = svgToPolys(v.accent, v.fill);
  if (v.cut) ink = difference(ink, svgToPolys(v.cut, v.fill));
  if (v.clip) {
    const { x, y, width, height } = v.clip;
    const box = [rectPath(x, -(y + height), x + width, -y)];
    ink = intersect(ink, box);
    accent = intersect(accent, box);
  }
  const b = C.Clipper.GetBounds(accent.length ? ink.concat(accent) : ink);
  const cx = Math.round((b.left + b.right) / 2);
  const cy = Math.round((b.top + b.bottom) / 2);
  const shift = (paths) => {
    for (const poly of paths) for (const p of poly) { p.X -= cx; p.Y -= cy; }
    return C.Clipper.CleanPolygons(paths, (v.clean ?? 0.006) * SCALE).filter((p) => p.length > 2);
  };
  const result = { ink: shift(ink), accent: shift(accent), center: { x: cx / SCALE, y: -cy / SCALE } };
  parsed.set(version, result);
  return result;
}

/** Переводит точку из координат SVG-эмблемы в локальные координаты модели. */
export function svgToLocal(version, x, y) {
  const { center } = parseVersion(version);
  return new THREE.Vector2(x - center.x, center.y - y);
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

/** Верхняя/нижняя точка контура для выносок: на краю, как можно ближе к оси x = 0. */
function extremePoint(paths, top) {
  let edge = top ? -Infinity : Infinity;
  for (const poly of paths) for (const p of poly) edge = top ? Math.max(edge, p.Y) : Math.min(edge, p.Y);
  let lo = Infinity;
  let hi = -Infinity;
  for (const poly of paths) {
    for (const p of poly) {
      if (Math.abs(p.Y - edge) > 0.3 * SCALE) continue;
      lo = Math.min(lo, p.X);
      hi = Math.max(hi, p.X);
    }
  }
  const x = Math.min(Math.max(0, lo), hi);
  return { x: x / SCALE, y: edge / SCALE + (top ? -0.4 : 0.4) };
}

export function getOutlines(form, version = 'new') {
  const key = `${version}:${form}`;
  if (outlineCache.has(key)) return outlineCache.get(key);
  const v = VERSIONS[version];
  const { ink, accent, center } = parseVersion(version);
  const marks = accent.length ? union(ink.concat(accent)) : ink;
  const mb = boundsOf(marks);
  let silhouette;
  if (form === 'plate') {
    // скруглённая табличка, как мемориальная доска на фасаде
    silhouette = offset([rectPath(mb.minX, mb.minY, mb.maxX, mb.maxY)], DIM.plateMargin);
  } else {
    const svgY = (y) => center.y - y;
    silhouette = offset(union(v.silhouette({ ink, accent, svgY })), DIM.margin);
    silhouette = offset(offset(silhouette, DIM.fillet), -DIM.fillet); // скругляем внутренние углы
  }
  silhouette = union(outers(silhouette));
  const rimInner = offset(silhouette, -DIM.rim);
  const outlines = {
    ink,
    accent,
    silhouette,
    rimInner,
    rim: difference(silhouette, rimInner),
    field: difference(rimInner, marks),
    engraveBorder: [offset(silhouette, -2.4), offset(silhouette, -3.1)],
    bounds: boundsOf(silhouette),
    anchors: {
      outline: { top: extremePoint(silhouette, true), bottom: extremePoint(silhouette, false) },
      ink: { top: extremePoint(ink, true), bottom: extremePoint(ink, false) },
      accent: accent.length ? { top: extremePoint(accent, true), bottom: extremePoint(accent, false) } : null,
    },
  };
  outlineCache.set(key, outlines);
  return outlines;
}

/** Раскладка гравировки оборота в локальных координатах модели. */
export function getBackLayout(version) {
  const v = VERSIONS[version];
  const b = v.back;
  const L = (x, y) => svgToLocal(version, x, y);
  const y = (svgY) => L(0, svgY).y;
  return {
    axis: L(b.axis, 0).x,
    gem: L(v.gem.x, v.gem.y),
    cornice: { y: b.cornice.y.map(y), half: b.cornice.half },
    lines: Array.from({ length: 5 }, (_, i) => y(b.lines.y + i * b.lines.step)),
    lineWidth: b.lines.width,
    divider: y(b.divider),
    founded: y(b.founded),
    year: y(b.year),
    site: y(b.site),
    dots: y(b.dots),
    hatch: (b.hatch || []).map(([x0, y0, x1, y1]) => {
      const a = L(x0, y0);
      const c = L(x1, y1);
      return { minX: Math.min(a.x, c.x), maxX: Math.max(a.x, c.x), minY: Math.min(a.y, c.y), maxY: Math.max(a.y, c.y) };
    }),
  };
}

// ---------------------------------------------------------------- Геометрия

function extrudeShape(shape, height, b, bevelSegments) {
  const geo = new THREE.ExtrudeGeometry(shape, {
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

function polygonArea(points) {
  let a = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    a += points[j].x * points[i].y - points[i].x * points[j].y;
  }
  return Math.abs(a / 2);
}

/** Площадь лицевой крышки ExtrudeGeometry (вторая половина группы 0). */
function lidArea(geo) {
  const pos = geo.attributes.position;
  let area = 0;
  for (const g of geo.groups) {
    if (g.materialIndex !== 0) continue;
    for (let k = g.start + g.count / 2; k < g.start + g.count; k += 3) {
      const ax = pos.getX(k);
      const ay = pos.getY(k);
      area += Math.abs((pos.getX(k + 1) - ax) * (pos.getY(k + 2) - ay) - (pos.getX(k + 2) - ax) * (pos.getY(k + 1) - ay)) / 2;
    }
  }
  return area;
}

/**
 * Выдавливание с фаской. Фаска three.js сдвигает вершины по биссектрисам и на острых
 * пиках выворачивает контур — тогда крышка «заливает» отверстия. Поэтому каждую фигуру
 * проверяем по площади и при сбое строим её без фаски.
 */
function extrude(paths, height, bevel = 0, bevelSegments = 3) {
  const b = Math.min(bevel, height / 2 - 0.0005);
  const geos = toShapes(paths).map((shape) => {
    let geo = extrudeShape(shape, height, b, bevelSegments);
    if (b > 0) {
      const expected = polygonArea(shape.getPoints()) - shape.holes.reduce((sum, h) => sum + polygonArea(h.getPoints()), 0);
      if (lidArea(geo) > expected * 1.01 + 0.01) {
        geo.dispose();
        geo = extrudeShape(shape, height, 0, 1);
      }
    }
    return geo;
  });
  if (geos.length === 1) return geos[0];
  const merged = mergeGeometries(geos, false);
  geos.forEach((g) => g.dispose());
  return merged;
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

/**
 * Строит объект эмблемы.
 * @returns {{ group: THREE.Group, layers: Array, outlines: object, backLayout: object }}
 */
export function buildEmblem({ form, style, logo = 'new' }, materials) {
  const o = getOutlines(form, logo);
  const backLayout = getBackLayout(logo);
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
  gem.position.set(backLayout.gem.x, backLayout.gem.y, -DIM.base);
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

  // Второй цвет логотипа (штриховка и дата в классической версии): чернение или матовый рельеф
  let accent = null;
  if (o.accent.length) {
    const h = style === 'enamel' ? st.inkH : st.inkH * 0.6;
    const accentGeo = extrude(o.accent, h, st.inkBevel * 0.6, 2);
    accentGeo.translate(0, 0, st.inkZ);
    accent = new THREE.Mesh(accentGeo, style === 'enamel' ? materials.niello : materials.metalMatte);
    accent.name = 'accent';
  }

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

  const A = o.anchors;
  const layers = [
    { id: 'base', object: base, z: -DIM.base * 0.5, ...A.outline },
    { id: 'field', object: field, z: st.fieldH, ...A.outline },
    { id: 'pattern', object: pattern, z: st.fieldH, ...A.outline },
    accent && { id: 'accent', object: accent, z: st.inkZ + st.inkH, ...A.accent },
    { id: 'ink', object: ink, z: st.inkZ + st.inkH, ...A.ink },
    { id: 'resin', object: resin, z: DIM.resinHeight, ...A.outline },
    { id: 'rim', object: rim, z: DIM.rimHeight, ...A.outline },
  ].filter(Boolean);
  for (const l of layers) {
    l.anchor = new THREE.Vector3(l.top.x, l.top.y, l.z);
    group.add(l.object);
  }
  return { group, layers, outlines: o, backLayout };
}

export function disposeEmblem(emblem) {
  emblem.group.traverse((obj) => {
    if (obj.isMesh) obj.geometry.dispose();
  });
  emblem.group.removeFromParent();
}
