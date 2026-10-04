import * as THREE from 'three';

const linear = (r, g, b) => new THREE.Color().setRGB(r, g, b, THREE.LinearSRGBColorSpace);

// Базовые цвета металлов — физически корректные значения F0 (линейное пространство)
export const METALS = {
  gold: { label: 'Золото', swatch: '#e7c36a', color: linear(1.0, 0.71, 0.29) },
  rosegold: { label: 'Розовое золото', swatch: '#e9b19c', color: linear(0.98, 0.6, 0.47) },
  copper: { label: 'Медь', swatch: '#d38a64', color: linear(0.955, 0.58, 0.42) },
  silver: { label: 'Серебро', swatch: '#ececec', color: linear(0.96, 0.95, 0.93) },
  titanium: { label: 'Титан', swatch: '#9b9993', color: linear(0.54, 0.5, 0.45) },
  blacknickel: { label: 'Чёрный никель', swatch: '#4b4b4e', color: linear(0.13, 0.13, 0.14) },
};

export const FINISHES = {
  polish: { label: 'Полировка', roughness: 0.1, anisotropy: 0 },
  satin: { label: 'Сатин', roughness: 0.32, anisotropy: 0.8 },
  matte: { label: 'Мат', roughness: 0.55, anisotropy: 0 },
};

export const ENAMELS = {
  bordeaux: { label: 'Бордо СПбГАСУ', short: 'бордо', color: '#924145' },
  terracotta: { label: 'Терракота', short: 'терракота', color: '#9e2c09' },
  navy: { label: 'Синий', short: 'синий', color: '#1f3c9c' },
  emerald: { label: 'Изумруд', short: 'изумруд', color: '#0e6a50' },
  graphite: { label: 'Графит', short: 'графит', color: '#26282d' },
  ivory: { label: 'Слоновая кость', short: 'слоновая кость', color: '#ebe4d4' },
};

export const GEMS = {
  ruby: { label: 'Рубин', swatch: '#d4173a', color: '#ff3355', attenuation: '#c0001e', ior: 1.77 },
  sapphire: { label: 'Сапфир', swatch: '#2c55e0', color: '#4d78ff', attenuation: '#0a2fc4', ior: 1.77 },
  diamond: { label: 'Бриллиант', swatch: '#f4f7ff', color: '#ffffff', attenuation: '#ffffff', ior: 2.42 },
  none: { label: 'Нет', swatch: null },
};

export function createMaterials() {
  const metal = new THREE.MeshPhysicalMaterial({
    name: 'metal',
    metalness: 1,
    roughness: 0.06,
  });

  // Оборот подложки: гравировка через bump + roughness + затемнение
  const back = new THREE.MeshPhysicalMaterial({
    name: 'metal-engraved',
    metalness: 1,
    roughness: 1,
    bumpScale: -1.4,
  });

  const enamel = new THREE.MeshPhysicalMaterial({
    name: 'enamel',
    metalness: 0,
    roughness: 0.42,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    color: ENAMELS.bordeaux.color,
  });

  const pattern = new THREE.MeshPhysicalMaterial({
    name: 'pattern',
    metalness: 1,
    roughness: 0.14,
    alphaTest: 0.5,
    side: THREE.DoubleSide,
  });

  const resin = new THREE.MeshPhysicalMaterial({
    name: 'epoxy-resin',
    metalness: 0,
    roughness: 0.02,
    transmission: 1,
    thickness: 1.4,
    ior: 1.52,
    specularIntensity: 0.8,
    attenuationColor: new THREE.Color('#fff6e6'),
    attenuationDistance: 0.6,
  });

  // Облегчённая смола для слабых устройств (без transmission-прохода)
  const resinLite = new THREE.MeshPhysicalMaterial({
    name: 'epoxy-resin-lite',
    metalness: 0,
    roughness: 0.03,
    transparent: true,
    opacity: 0.14,
    clearcoat: 1,
    depthWrite: false,
  });

  const gem = new THREE.MeshPhysicalMaterial({
    name: 'gem',
    metalness: 0,
    roughness: 0,
    transmission: 1,
    thickness: 2.6,
    ior: 1.77,
    dispersion: 3,
    specularIntensity: 1,
    envMapIntensity: 2.2,
    flatShading: true,
    attenuationDistance: 0.08,
  });

  // Чернение — тёмный сплав, вплавленный в металл (штриховка и дата классического логотипа)
  const niello = new THREE.MeshPhysicalMaterial({
    name: 'niello',
    color: '#2c2c30',
    metalness: 0.55,
    roughness: 0.34,
  });

  // Матовый металл — второй уровень рельефа
  const metalMatte = new THREE.MeshPhysicalMaterial({
    name: 'metal-matte',
    metalness: 1,
    roughness: 0.5,
  });

  return { metal, back, enamel, pattern, resin, resinLite, gem, niello, metalMatte };
}

/** Применяет состояние (металл, обработка, эмаль, камень, исполнение) к материалам. */
export function applyMaterialState(m, state) {
  const metal = METALS[state.metal];
  const finish = FINISHES[state.finish];

  m.metal.color.copy(metal.color);
  m.metal.roughness = finish.roughness;
  m.metal.anisotropy = finish.anisotropy;
  m.metal.anisotropyRotation = 0;

  m.back.color.copy(metal.color);

  m.metalMatte.color.copy(metal.color);
  m.metalMatte.roughness = Math.max(finish.roughness + 0.3, 0.48);
  m.niello.clearcoat = state.resin ? 0 : 0.7;

  m.enamel.color.set(ENAMELS[state.enamel].color);
  // под смолой эмаль не лакируем — глянец даёт сама смола
  m.enamel.clearcoat = state.resin ? 0 : 1;
  m.enamel.roughness = state.resin ? 0.5 : 0.4;

  // Узор: на металле — матовая гравировка, на эмали — полированная металлическая печать
  if (state.style === 'enamel') {
    m.pattern.color.copy(metal.color).multiplyScalar(0.5);
    m.pattern.roughness = 0.62;
  } else {
    m.pattern.color.copy(metal.color);
    m.pattern.roughness = Math.min(finish.roughness + 0.08, 0.6);
  }

  const gem = GEMS[state.gem];
  if (gem.color) {
    m.gem.color.set(gem.color);
    m.gem.attenuationColor.set(gem.attenuation);
    m.gem.ior = gem.ior;
    m.gem.attenuationDistance = state.gem === 'diamond' ? Infinity : 0.08;
  }
}
