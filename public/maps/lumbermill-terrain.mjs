// 山谷·伐木场 —— 一条蜿蜒河谷穿过松林，谷底是伐木场与锯木厂。
// 与度假岛共用 prop-kit 的道具与碰撞盒推导，客户端与服务端读同一份数据。

import { smoothstep, lerp, random, collidersFor } from './prop-kit.mjs';

export const id = 'lumbermill';
export const titleKey = 'expedition.maps.lumbermill';
export const bounds = { minX: -160, maxX: 160, minZ: -160, maxZ: 160 };
export const landing = { x: -54, z: 6, y: 4 };

const PADS = [
  { x: -54, z: 6, rx: 32, rz: 26, y: 4 },    // 伐木场
  { x: 58, z: 30, rx: 26, rz: 22, y: 5 },    // 锯木厂
  { x: -28, z: -76, rx: 20, rz: 16, y: 3 }   // 林间营地
];

// 河道在南北方向蜿蜒，x 随 z 正弦摆动。
export function riverX(z) {
  return Math.sin(z * 0.045) * 26;
}

export function heightAt(x, z) {
  const bank = Math.abs(x - riverX(z));
  const ridge = 15 * smoothstep(34, 105, bank);
  const bed = -3.4 * (1 - smoothstep(4, 16, bank));
  const relief = smoothstep(26, 48, bank);
  const noise = (Math.sin(x * .08 + z * .05) * .8 + Math.sin(x * .031 - z * .043) * 1.3) * relief;
  let height = 4 + ridge + bed + noise;
  for (const pad of PADS) {
    const distance = Math.hypot((x - pad.x) / pad.rx, (z - pad.z) / pad.rz);
    const weight = 1 - smoothstep(0.6, 1, distance);
    if (weight > 0) height = lerp(height, pad.y, weight);
  }
  return height;
}

function inAnyPad(x, z, margin = 1) {
  return PADS.some(pad => Math.hypot((x - pad.x) / (pad.rx * margin), (z - pad.z) / (pad.rz * margin)) < 1);
}

function buildProps() {
  const rand = random(0x51A7E0);
  const props = [];

  // 伐木场：原木堆、装材卡车、传送带与树桩。
  props.push({ kind: 'sawmill', x: 58, z: 30, y: 5, yaw: -0.35, w: 17, h: 8.5, d: 13 });
  // 卡车停在伐木场西侧空地，避开复活点与原木堆。
  props.push({ kind: 'truck', x: -70, z: 6, y: heightAt(-70, 6), yaw: 1.15 });
  props.push({ kind: 'conveyor', x: 40, z: 34, y: 5, yaw: .42, length: 19 });
  props.push({ kind: 'conveyor', x: 26, z: 40, y: 4.4, yaw: .42, length: 15 });

  for (let i = 0; i < 9; i++) {
    const x = -70 + (i % 3) * 7.5;
    const z = -12 + Math.floor(i / 3) * 4.4;
    props.push({ kind: 'log', x, z, y: heightAt(x, z), yaw: .08 * (i % 2 ? 1 : -1), length: 6.4, r: .44 });
  }
  for (let i = 0; i < 6; i++) {
    const x = 48 + (i % 3) * 6.2;
    const z = 46 + Math.floor(i / 3) * 4.2;
    props.push({ kind: 'log', x, z, y: heightAt(x, z), yaw: .12 * (i % 2 ? 1 : -1), length: 5.8, r: .4 });
  }

  // 林间营地。
  const cabins = [
    { x: -36, z: -70, w: 7, h: 3.6, d: 5.5 },
    { x: -22, z: -84, w: 6.4, h: 3.4, d: 5 },
    { x: -14, z: -66, w: 6.8, h: 3.5, d: 5.2 },
    { x: -40, z: -86, w: 6.2, h: 3.3, d: 4.8 }
  ];
  for (const cabin of cabins) {
    props.push({
      kind: 'cabin', x: cabin.x, z: cabin.z, y: heightAt(cabin.x, cabin.z),
      yaw: (cabin.x - cabin.z) * .012, w: cabin.w, h: cabin.h, d: cabin.d
    });
  }

  // 松林：坡地上密集分布，河床与空地留白。
  let pines = 0;
  for (let attempt = 0; attempt < 4000 && pines < 150; attempt++) {
    const x = -152 + rand() * 304;
    const z = -152 + rand() * 304;
    if (inAnyPad(x, z, .95)) continue;
    const bank = Math.abs(x - riverX(z));
    if (bank < 12) continue;
    if (Math.hypot(x - 58, z - 30) < 26) continue;
    props.push({
      kind: 'pine', x, z, y: heightAt(x, z),
      yaw: rand() * 6.28,
      height: 6.4 + rand() * 4.2
    });
    pines++;
  }

  // 树桩与碎石。
  let stumps = 0;
  for (let attempt = 0; attempt < 1200 && stumps < 26; attempt++) {
    const angle = rand() * Math.PI * 2;
    const radius = 26 + rand() * 74;
    const x = -58 + Math.cos(angle) * radius;
    const z = 8 + Math.sin(angle) * radius;
    if (inAnyPad(x, z, .8)) continue;
    props.push({ kind: 'stump', x, z, y: heightAt(x, z), r: .6 + rand() * .45 });
    stumps++;
  }

  let rocks = 0;
  for (let attempt = 0; attempt < 1600 && rocks < 40; attempt++) {
    const x = -150 + rand() * 300;
    const z = -150 + rand() * 300;
    if (inAnyPad(x, z, .9)) continue;
    if (Math.abs(x - riverX(z)) < 9) continue;
    props.push({ kind: 'rock', x, z, y: heightAt(x, z), r: .7 + rand() * 1.7, yaw: rand() * 6.28 });
    rocks++;
  }

  return props;
}

export const props = buildProps();

export function colliders() {
  return collidersFor(props);
}
