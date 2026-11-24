// 程序化角色贴图。
//
// 仓库里的 soldier GLB 只有 UV，没有贴图（glTF images:0 / textures:0），
// 所以所有角色渲染出来都是一块死板的纯色。这里用 Canvas 现场生成
// 布料织纹 / 皮肤颗粒 / 头发丝路，绑到模型自带的 UV 上，
// 不引入任何外部图片资源，也不改变模型本身的骨骼与配色。
(() => {
  'use strict';

  const SIZE = 256;
  const caches = new Map();
  let three = null;

  function getThree() {
    if (three) return three;
    three = window.__G && window.__G.THREE ? window.__G.THREE : null;
    return three;
  }

  function context2d(size) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    return canvas.getContext('2d');
  }

  function hash(x, y, seed) {
    let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1274126177);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  }

  function smooth(t) {
    return t * t * (3 - 2 * t);
  }

  function valueNoise(x, y, seed) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = smooth(x - xi);
    const yf = smooth(y - yi);
    const a = hash(xi, yi, seed);
    const b = hash(xi + 1, yi, seed);
    const c = hash(xi, yi + 1, seed);
    const d = hash(xi + 1, yi + 1, seed);
    const top = a + (b - a) * xf;
    const bottom = c + (d - c) * xf;
    return top + (bottom - top) * yf;
  }

  function fbm(x, y, seed, octaves) {
    const oct = octaves || 4;
    let sum = 0;
    let amp = .5;
    let freq = 1;
    let norm = 0;
    for (let i = 0; i < oct; i += 1) {
      sum += valueNoise(x * freq, y * freq, seed + i * 17) * amp;
      norm += amp;
      amp *= .5;
      freq *= 2;
    }
    return sum / norm;
  }

  function clampByte(value) {
    if (value < 0) return 0;
    if (value > 255) return 255;
    return value | 0;
  }

  // 战术布料：细密织纹 + 低频污渍 + 缝线。
  function buildFabric(seed) {
    const color = context2d(SIZE);
    const rough = context2d(SIZE);
    const colorData = color.createImageData(SIZE, SIZE);
    const roughData = rough.createImageData(SIZE, SIZE);
    for (let y = 0; y < SIZE; y += 1) {
      for (let x = 0; x < SIZE; x += 1) {
        const u = x / SIZE;
        const v = y / SIZE;
        const warp = (x % 4 < 2) ? 1 : -1;
        const weft = (y % 4 < 2) ? 1 : -1;
        const weave = (warp + weft) * 3;
        const blotch = (fbm(u * 5, v * 5, seed, 4) - .5) * 30;
        const grime = Math.max(0, fbm(u * 2.3 + 9, v * 2.3 + 3, seed + 131, 3) - .58) * -80;
        const seam = (Math.abs(((u * 6) % 1) - .5) > .47 || Math.abs(((v * 4) % 1) - .5) > .47) ? -26 : 0;
        const value = clampByte(234 + weave + blotch + grime + seam);
        const index = (y * SIZE + x) * 4;
        colorData.data[index] = value;
        colorData.data[index + 1] = value;
        colorData.data[index + 2] = value;
        colorData.data[index + 3] = 255;
        const r = clampByte(206 + (warp + weft) * 6 + (fbm(u * 9, v * 9, seed + 7, 3) - .5) * 44);
        roughData.data[index] = r;
        roughData.data[index + 1] = r;
        roughData.data[index + 2] = r;
        roughData.data[index + 3] = 255;
      }
    }
    color.putImageData(colorData, 0, 0);
    rough.putImageData(roughData, 0, 0);
    return { color: color.canvas, rough: rough.canvas };
  }

  // 皮肤：毛孔颗粒 + 轻微色斑。
  function buildSkin(seed) {
    const color = context2d(SIZE);
    const rough = context2d(SIZE);
    const colorData = color.createImageData(SIZE, SIZE);
    const roughData = rough.createImageData(SIZE, SIZE);
    for (let y = 0; y < SIZE; y += 1) {
      for (let x = 0; x < SIZE; x += 1) {
        const u = x / SIZE;
        const v = y / SIZE;
        const pores = (hash(x, y, seed) - .5) * 14;
        const blotch = (fbm(u * 4, v * 4, seed + 31, 3) - .5) * 16;
        const value = clampByte(238 + pores + blotch);
        const index = (y * SIZE + x) * 4;
        colorData.data[index] = clampByte(value + 2);
        colorData.data[index + 1] = clampByte(value - 4);
        colorData.data[index + 2] = clampByte(value - 12);
        colorData.data[index + 3] = 255;
        const r = clampByte(196 + pores * 1.6 + blotch * 1.2);
        roughData.data[index] = r;
        roughData.data[index + 1] = r;
        roughData.data[index + 2] = r;
        roughData.data[index + 3] = 255;
      }
    }
    color.putImageData(colorData, 0, 0);
    rough.putImageData(roughData, 0, 0);
    return { color: color.canvas, rough: rough.canvas };
  }

  // 头发：竖向发丝条纹。
  function buildHair(seed) {
    const color = context2d(SIZE);
    const rough = context2d(SIZE);
    const colorData = color.createImageData(SIZE, SIZE);
    const roughData = rough.createImageData(SIZE, SIZE);
    for (let y = 0; y < SIZE; y += 1) {
      for (let x = 0; x < SIZE; x += 1) {
        const u = x / SIZE;
        const v = y / SIZE;
        const strand = Math.sin((u * 64 + fbm(u * 3, v * 3, seed, 2) * 6) * Math.PI) * 12;
        const shade = (fbm(u * 6, v * 6, seed + 19, 3) - .5) * 18;
        const value = clampByte(226 + strand + shade);
        const index = (y * SIZE + x) * 4;
        colorData.data[index] = value;
        colorData.data[index + 1] = value;
        colorData.data[index + 2] = value;
        colorData.data[index + 3] = 255;
        const r = clampByte(210 + strand * 2);
        roughData.data[index] = r;
        roughData.data[index + 1] = r;
        roughData.data[index + 2] = r;
        roughData.data[index + 3] = 255;
      }
    }
    color.putImageData(colorData, 0, 0);
    rough.putImageData(roughData, 0, 0);
    return { color: color.canvas, rough: rough.canvas };
  }

  const BUILDERS = { fabric: buildFabric, skin: buildSkin, hair: buildHair };
  const SEEDS = { fabric: 101, skin: 17, hair: 43 };

  function kindOf(material) {
    const name = String((material && material.name) || '').toLowerCase();
    if (/skin/.test(name)) return 'skin';
    if (/visor|glass|lens/.test(name)) return null;
    if (/hair|brow|beard/.test(name)) return 'hair';
    if (/eye/.test(name)) return null;
    return 'fabric';
  }

  function entryFor(kind) {
    if (caches.has(kind)) return caches.get(kind);
    const T = getThree();
    if (!T || !BUILDERS[kind]) return null;
    const built = BUILDERS[kind](SEEDS[kind]);
    const map = new T.CanvasTexture(built.color);
    map.colorSpace = T.SRGBColorSpace;
    map.wrapS = T.RepeatWrapping;
    map.wrapT = T.RepeatWrapping;
    map.anisotropy = 4;
    map.needsUpdate = true;
    const rough = new T.CanvasTexture(built.rough);
    rough.colorSpace = T.NoColorSpace;
    rough.wrapS = T.RepeatWrapping;
    rough.wrapT = T.RepeatWrapping;
    rough.needsUpdate = true;
    const entry = { map, rough };
    caches.set(kind, entry);
    return entry;
  }

  // 给材质挂上程序化贴图（原地修改并返回同一材质）。
  function decorate(material) {
    if (!material || !material.color) return material;
    const kind = kindOf(material);
    if (!kind) return material;
    const entry = entryFor(kind);
    if (!entry) return material;
    if (!material.map) material.map = entry.map;
    if (!material.roughnessMap) material.roughnessMap = entry.rough;
    return material;
  }

  // 给已经建好的模型补贴图（模型是共享模板克隆，材质按 uuid 缓存，不会重复生成）。
  function applyToModel(model) {
    if (!model || !model.traverse) return model;
    const seen = new Set();
    model.traverse((node) => {
      if (!node.isMesh || !node.material) return;
      const list = Array.isArray(node.material) ? node.material : [node.material];
      const next = list.map((material) => {
        if (!material || seen.has(material.uuid)) return material;
        seen.add(material.uuid);
        return decorate(material);
      });
      node.material = Array.isArray(node.material) ? next : next[0];
    });
    return model;
  }

  function dispose() {
    for (const entry of caches.values()) {
      entry.map.dispose();
      entry.rough.dispose();
    }
    caches.clear();
  }

  window.SoldierTextures = { decorate, applyToModel, dispose };
})();