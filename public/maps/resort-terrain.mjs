// 度假岛·船厂 —— 热带海岛 + 在建的豪华游轮船厂。
// 地形、道具与碰撞盒共用这一份定义，客户端与服务端完全一致。

import { smoothstep, lerp, random, collidersFor } from './prop-kit.mjs';

export const id = 'resort';
export const titleKey = 'expedition.maps.resort';
export const bounds = { minX: -140, maxX: 140, minZ: -140, maxZ: 140 };
export const landing = { x: 10, z: -52, y: 1.6 };

export const SEA_LEVEL = -4.2;

const PADS = [
  { x: 10, z: -52, rx: 27, rz: 20, y: 1.6 },   // 船厂平台
  { x: -36, z: 28, rx: 24, rz: 18, y: 3.6 },   // 度假村广场
  { x: 44, z: 24, rx: 17, rz: 15, y: 3.2 }     // 观海台
];

export function heightAt(x, z) {
  const radius = Math.hypot(x, z);
  const plateau = 3.6 * (1 - smoothstep(46, 74, radius));
  const beach = 1.4 * (1 - smoothstep(72, 88, radius));
  const sea = -8 * smoothstep(84, 104, radius);
  const dune = Math.sin(x * 0.11) * Math.cos(z * 0.09) * 0.5 +
    Math.sin(x * 0.047 + z * 0.061) * 0.42;
  let height = plateau + beach + sea + dune * (1 - smoothstep(62, 82, radius));
  for (const pad of PADS) {
    const distance = Math.hypot((x - pad.x) / pad.rx, (z - pad.z) / pad.rz);
    const weight = 1 - smoothstep(0.62, 1, distance);
    if (weight > 0) height = lerp(height, pad.y, weight);
  }
  return height;
}

function insidePad(x, z, pad, margin = 1) {
  return Math.hypot((x - pad.x) / (pad.rx * margin), (z - pad.z) / (pad.rz * margin)) < 1;
}

function inAnyPad(x, z, margin = 1) {
  return PADS.some(pad => insidePad(x, z, pad, margin));
}

const CONTAINER_COLORS = [0xc0392b, 0x1f6f8b, 0xd68910, 0x2e7d32, 0x6c3483, 0xb9770e];
const ROOF_COLORS = [0xd35400, 0xb03a2e, 0xc0392b, 0xa04000];

function buildProps() {
  const rand = random(0x5A1701);
  const props = [];

  // 船厂：船台上的游轮、塔吊、成堆的集装箱。
  props.push({ kind: 'ship', x: 10, z: -66, y: 1.6, yaw: 0.16, length: 27, width: 7.4 });
  props.push({ kind: 'crane', x: -12, z: -46, y: 1.6, yaw: -0.5, height: 15 });
  props.push({ kind: 'crane', x: 33, z: -60, y: 1.6, yaw: 2.5, height: 12 });

  let containers = 0;
  for (let attempt = 0; attempt < 260 && containers < 26; attempt++) {
    const x = 22 + rand() * 26;
    const z = -68 + rand() * 28;
    if (Math.hypot(x - 10, z + 66) < 17) continue;
    const stack = 1 + Math.floor(rand() * 2);
    for (let level = 0; level < stack; level++) {
      props.push({
        kind: 'container',
        x, z: z + level * 0.1,
        y: 1.6 + level * 2.6,
        yaw: (rand() - .5) * .5,
        paint: CONTAINER_COLORS[Math.floor(rand() * CONTAINER_COLORS.length)]
      });
      containers++;
    }
  }

  // 度假村：几栋带屋顶的海景房与泳池。
  const villas = [
    { x: -46, z: 20, w: 13, h: 6.4, d: 10 },
    { x: -24, z: 38, w: 11, h: 5.8, d: 9 },
    { x: -46, z: 40, w: 12, h: 6.2, d: 9 },
    { x: 38, z: 34, w: 10, h: 5.4, d: 8 }
  ];
  villas.forEach((villa, index) => {
    props.push({
      kind: 'building',
      x: villa.x, z: villa.z, y: heightAt(villa.x, villa.z),
      yaw: (villa.x + villa.z) * .01,
      w: villa.w, h: villa.h, d: villa.d,
      roof: ROOF_COLORS[index % ROOF_COLORS.length]
    });
  });
  props.push({ kind: 'pool', x: -30, z: 22, y: heightAt(-30, 22), r: 6.5, d: .8 });

  for (let i = 0; i < 12; i++) {
    const angle = rand() * Math.PI * 2;
    const radius = 6 + rand() * 15;
    const x = -34 + Math.cos(angle) * radius;
    const z = 30 + Math.sin(angle) * radius;
    props.push({ kind: 'umbrella', x, z, y: heightAt(x, z), yaw: rand() * 6.28 });
  }

  // 椰林：覆盖整座沙丘，避开建筑与广场。
  let palms = 0;
  for (let attempt = 0; attempt < 2000 && palms < 72; attempt++) {
    const angle = rand() * Math.PI * 2;
    const radius = 22 + rand() * 58;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    if (inAnyPad(x, z, .92)) continue;
    props.push({
      kind: 'palm', x, z, y: heightAt(x, z),
      yaw: rand() * 6.28,
      height: 5.4 + rand() * 2.6,
      lean: (rand() - .5) * .22
    });
    palms++;
  }

  // 礁石：散落在浅滩与礁盘上。
  let rocks = 0;
  for (let attempt = 0; attempt < 2000 && rocks < 58; attempt++) {
    const angle = rand() * Math.PI * 2;
    const radius = 74 + rand() * 28;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    props.push({ kind: 'rock', x, z, y: heightAt(x, z), r: .8 + rand() * 1.9, yaw: rand() * 6.28 });
    rocks++;
  }

  return props;
}

export const props = buildProps();

export function colliders() {
  return collidersFor(props);
}
