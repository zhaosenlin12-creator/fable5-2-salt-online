// 度假岛·船厂 —— 客户端场景。
// 地形网格与度假岛地形模块共用同一套高度函数，道具由 prop-kit 拼装。

import { heightAt, bounds, props, colliders, SEA_LEVEL } from './resort-terrain.mjs';
import { buildProps, material } from './prop-kit.mjs';

const SKY = 0x9fd8ef;

function terrainColor(x, z, y) {
  const radius = Math.hypot(x, z);
  const dune = Math.sin(x * 0.31 + z * 0.17) * 0.03 + Math.sin(z * 0.23) * 0.025;
  const wet = y < SEA_LEVEL + 1.4;
  const sand = y < 2.4;
  const grass = y < 5.2;
  if (wet) {
    const k = .78 + dune;
    return [0.40 * k, 0.36 * k, 0.25 * k];
  }
  if (sand) {
    const k = 1 + dune;
    return [0.87 * k, 0.80 * k, 0.62 * k];
  }
  if (grass) {
    const k = .92 + dune;
    return [0.31 * k, 0.55 * k, 0.24 * k];
  }
  const k = .95 + dune;
  return [0.46 * k, 0.47 * k, 0.28 * k];
}

export async function createEnvironment() {
  const { THREE } = window.__G;
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xbfe4f2, 110, 380);

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

  // 海面：随时间轻微起伏，边缘与沙滩自然衔接。
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(half * 5, half * 5, 1, 1),
    material(THREE, { color: 0x1b6f9c, roughness: .22, metalness: .12, transparent: true, opacity: .88 })
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = SEA_LEVEL;
  scene.add(sea);

  const shallow = new THREE.Mesh(
    new THREE.PlaneGeometry(half * 2.4, half * 2.4, 1, 1),
    material(THREE, { color: 0x4fc3d9, roughness: .3, metalness: .05, transparent: true, opacity: .42 })
  );
  shallow.rotation.x = -Math.PI / 2;
  shallow.position.y = SEA_LEVEL + .12;
  scene.add(shallow);

  scene.add(new THREE.HemisphereLight(0xc9f0ff, 0x6d7a4e, 1.15));
  const sun = new THREE.DirectionalLight(0xfff3d2, 2.3);
  sun.position.set(96, 128, 54);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x9fd8ef, .45);
  fill.position.set(-80, 60, -70);
  scene.add(fill);

  const palette = {
    bark: material(THREE, { color: 0x8a6a44, roughness: .95 }),
    leaf: material(THREE, { color: 0x3fa34d, roughness: .9, side: THREE.DoubleSide }),
    coconut: material(THREE, { color: 0x6b4a2f, roughness: .9 }),
    wall: material(THREE, { color: 0xf2e8d6, roughness: .8 }),
    roof: material(THREE, { color: 0xd35400, roughness: .85 }),
    glass: material(THREE, { color: 0x8fd3f4, roughness: .18, metalness: .3, emissive: 0x2b4a58, emissiveIntensity: .35 }),
    container: material(THREE, { color: 0xc0392b, roughness: .78 }),
    trim: material(THREE, { color: 0x9aa3ab, roughness: .5, metalness: .55 }),
    rock: material(THREE, { color: 0x8f8b84, roughness: 1, flatShading: true }),
    hull: material(THREE, { color: 0xeef3f7, roughness: .6 }),
    deck: material(THREE, { color: 0xd8dee6, roughness: .7 }),
    crane: material(THREE, { color: 0xf2a33c, roughness: .6, metalness: .3 }),
    water: material(THREE, { color: 0x37b7d8, roughness: .15, metalness: .2, transparent: true, opacity: .85 }),
    log: material(THREE, { color: 0x8a6a44, roughness: .95 }),
    logEnd: material(THREE, { color: 0xd9b382, roughness: .95 })
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
      sea.position.y = SEA_LEVEL + Math.sin(seconds * .55) * .1;
      shallow.position.y = SEA_LEVEL + .12 + Math.sin(seconds * .8 + 1.4) * .07;
      animators.forEach((entry, index) => {
        if (entry.kind === 'hook') {
          entry.node.position.y = entry.base + Math.sin(seconds * .7 + index) * 1.3;
        }
      });
    }
  };
}