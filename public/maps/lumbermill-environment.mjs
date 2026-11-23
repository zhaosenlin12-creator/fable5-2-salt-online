// 山谷·伐木场 —— 客户端场景。
// 地形网格与伐木场地形模块共用同一套高度函数，河道与锯木厂由 prop-kit 拼装。

import { heightAt, bounds, props, colliders, riverX } from './lumbermill-terrain.mjs';
import { buildProps, material } from './prop-kit.mjs';

const SKY = 0xbcd2d8;
const WATER_LEVEL = 1.05;

function terrainColor(x, z, y) {
  const grain = Math.sin(x * 0.29 + z * 0.13) * 0.035 + Math.sin(z * 0.41) * 0.03;
  if (y < 1.3) {
    const k = .92 + grain;
    return [0.36 * k, 0.34 * k, 0.28 * k];
  }
  if (y < 5.2) {
    const k = .9 + grain;
    return [0.29 * k, 0.46 * k, 0.22 * k];
  }
  if (y < 11) {
    const k = .88 + grain;
    return [0.21 * k, 0.36 * k, 0.17 * k];
  }
  const k = .95 + grain;
  return [0.46 * k, 0.43 * k, 0.38 * k];
}

// 沿河心生成一条带状水面。
function buildRiver(THREE) {
  const steps = 90;
  const halfWidth = 4.6;
  const positions = [];
  const indices = [];
  for (let i = 0; i <= steps; i++) {
    const z = -160 + (320 / steps) * i;
    const x = riverX(z);
    positions.push(x - halfWidth, WATER_LEVEL, z);
    positions.push(x + halfWidth, WATER_LEVEL, z);
    if (i < steps) {
      const base = i * 2;
      indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, material(THREE, {
    color: 0x2f7f9c, roughness: .18, metalness: .1, transparent: true, opacity: .86, side: THREE.DoubleSide
  }));
}

export async function createEnvironment() {
  const { THREE } = window.__G;
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xc2d4d8, 95, 340);

  const half = Math.max(Math.abs(bounds.minX), Math.abs(bounds.maxX));
  const segments = 168;
  const terrain = new THREE.PlaneGeometry(half * 2, half * 2, segments, segments);
  terrain.rotateX(-Math.PI / 2);
  const position = terrain.attributes.position;
  const colors = new Float32Array(position.count * 3);
  for (let index = 0; index < position.count; index++) {
    const x = position.getX(index);
    const z = position.getZ(index);
    const y = heightAt(x, z);
    position.setY(index, y);
    const color = terrainColor(x, z, y);
    colors.set(color, index * 3);
  }
  terrain.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  terrain.computeVertexNormals();
  scene.add(new THREE.Mesh(terrain, new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 1, metalness: 0
  })));

  const river = buildRiver(THREE);
  scene.add(river);

  scene.add(new THREE.HemisphereLight(0xd8ecff, 0x4b5a3a, 1.05));
  const sun = new THREE.DirectionalLight(0xfff0cf, 2.1);
  sun.position.set(-78, 116, 62);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xa9c6d0, .4);
  fill.position.set(70, 52, -64);
  scene.add(fill);

  const palette = {
    bark: material(THREE, { color: 0x5d4630, roughness: .95 }),
    leaf: material(THREE, { color: 0x2f6b3c, roughness: .92, side: THREE.DoubleSide }),
    coconut: material(THREE, { color: 0x6b4a2f, roughness: .9 }),
    wall: material(THREE, { color: 0x8c6a45, roughness: .9 }),
    roof: material(THREE, { color: 0xa63f2c, roughness: .8 }),
    glass: material(THREE, { color: 0x9fd0e8, roughness: .2, metalness: .3, emissive: 0x24333a, emissiveIntensity: .3 }),
    container: material(THREE, { color: 0x7a5a3a, roughness: .85 }),
    trim: material(THREE, { color: 0x6f7780, roughness: .55, metalness: .5 }),
    rock: material(THREE, { color: 0x7d7a72, roughness: 1, flatShading: true }),
    hull: material(THREE, { color: 0xded4c2, roughness: .8 }),
    deck: material(THREE, { color: 0xbdb3a2, roughness: .85 }),
    crane: material(THREE, { color: 0xd88f2f, roughness: .6, metalness: .3 }),
    water: material(THREE, { color: 0x4f9fbf, roughness: .15, metalness: .2, transparent: true, opacity: .85 }),
    log: material(THREE, { color: 0x7b5a3a, roughness: .95 }),
    logEnd: material(THREE, { color: 0xd9b382, roughness: .95 }),
    blade: material(THREE, { color: 0xd8dde3, roughness: .35, metalness: .7 })
  };

  const animators = [];
  buildProps(THREE, scene, props, palette, animators);

  const boxes = colliders();

  return {
    scene,
    color: SKY,
    heightAt,
    terrain,
    boxes(x1, z1, x2, z2) {
      const left = Math.min(x1, x2);
      const right = Math.max(x1, x2);
      const near = Math.min(z1, z2);
      const far = Math.max(z1, z2);
      return boxes.filter(box => box[0] <= right && box[3] >= left && box[2] <= far && box[5] >= near);
    },
    update(camera, dt, time) {
      const seconds = Number.isFinite(time) ? time : 0;
      river.position.y = Math.sin(seconds * .9) * .06;
      animators.forEach(entry => {
        if (entry.kind === 'blade') entry.node.rotation.y = seconds * 4.5;
        if (entry.kind === 'hook') entry.node.position.y = entry.base + Math.sin(seconds * .7) * 1.2;
      });
    }
  };
}