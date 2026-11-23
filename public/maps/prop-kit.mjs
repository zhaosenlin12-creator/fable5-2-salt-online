// 远征地图共用的地形与道具构件工具。
// 道具表只描述「摆了什么」，碰撞盒由 propCollider 单独推导，
// 客户端搭场景、服务端算掩体，两边读的是同一份数据。

export const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
export const lerp = (a, b, t) => a + (b - a) * t;

export function smoothstep(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

// 固定种子的伪随机，保证客户端与服务端生成同一批道具。
export function random(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function box(THREE, material, w, h, d, x, y, z, yaw = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.rotation.y = yaw;
  return mesh;
}

export function cyl(THREE, material, rTop, rBottom, h, segments, x, y, z, yaw = 0, pitch = 0) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, segments), material);
  mesh.position.set(x, y, z);
  mesh.rotation.y = yaw;
  mesh.rotation.x = pitch;
  return mesh;
}

export function cone(THREE, material, radius, h, segments, x, y, z, yaw = 0) {
  const mesh = new THREE.Mesh(new THREE.ConeGeometry(radius, h, segments), material);
  mesh.position.set(x, y, z);
  mesh.rotation.y = yaw;
  return mesh;
}

export function sphere(THREE, material, radius, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(radius, 0), material);
  mesh.position.set(x, y, z);
  return mesh;
}

// 轴对齐包围盒碰撞体（局部坐标）：[x0, y0, z0, x1, y1, z1]。
function push(colliders, x, y, z, w, h, d, yaw = 0) {
  const sin = Math.abs(Math.sin(yaw));
  const cos = Math.abs(Math.cos(yaw));
  const dx = (cos * w + sin * d) / 2;
  const dz = (sin * w + cos * d) / 2;
  colliders.push([x - dx, y - h / 2, z - dz, x + dx, y + h / 2, z + dz]);
}

// 每种道具对应的碰撞体。客户端搭场景时也调用它，保证两边一致。
export function propCollider(prop, colliders) {
  const { kind, x, y, z } = prop;
  const yaw = prop.yaw || 0;
  switch (kind) {
    case 'palm': {
      const height = prop.height || 6.4;
      push(colliders, x, y + height / 2, z, .7, height, .7, yaw);
      break;
    }
    case 'building': {
      const w = prop.w || 12;
      const h = prop.h || 6;
      const d = prop.d || 9;
      push(colliders, x, y + h / 2, z, w, h, d, yaw);
      break;
    }
    case 'container': {
      const w = prop.w || 6;
      const h = prop.h || 2.6;
      const d = prop.d || 2.4;
      push(colliders, x, y + h / 2, z, w, h, d, yaw);
      break;
    }
    case 'rock': {
      const r = prop.r || 1.2;
      push(colliders, x, y + r * .4, z, r * 1.7, r * 1.1, r * 1.7, yaw);
      break;
    }
    case 'ship': {
      const length = prop.length || 26;
      const width = prop.width || 7;
      push(colliders, x, y + 2.2, z, length, 4.4, width, yaw);
      push(colliders, x, y + 5.2, z, length * .74, 1.6, width * .78, yaw);
      break;
    }
    case 'crane': {
      const height = prop.height || 13;
      push(colliders, x, y + height / 2, z, 2.4, height, 2.4, yaw);
      break;
    }
    case 'pool': {
      const r = prop.r || 5;
      push(colliders, x, y + .1, z, r * 2, .4, r * 2 * (prop.d || 1));
      break;
    }
    case 'pine': {
      const height = prop.height || 8;
      push(colliders, x, y + height * .3, z, .9, height * .6, .9, yaw);
      break;
    }
    case 'log': {
      const length = prop.length || 6;
      const radius = prop.r || .42;
      push(colliders, x, y + radius, z, length, radius * 2, radius * 2, yaw);
      break;
    }
    case 'cabin': {
      const w = prop.w || 6;
      const h = prop.h || 3.4;
      const d = prop.d || 5;
      push(colliders, x, y + h / 2, z, w, h, d, yaw);
      break;
    }
    case 'sawmill': {
      const w = prop.w || 16;
      const h = prop.h || 8;
      const d = prop.d || 12;
      push(colliders, x, y + h / 2, z, w, h, d, yaw);
      break;
    }
    case 'truck': {
      push(colliders, x, y + 1.8, z, 12, 3.4, 3, yaw);
      break;
    }
    case 'conveyor': {
      const length = prop.length || 16;
      push(colliders, x, y + 3.4, z, length, 1.2, 2, yaw);
      break;
    }
    case 'stump': {
      const r = prop.r || .7;
      push(colliders, x, y + .45, z, 1.6, .9, 1.6);
      break;
    }
    default:
      break;
  }
}

export function collidersFor(props) {
  const colliders = [];
  for (const prop of props) propCollider(prop, colliders);
  return colliders;
}

export function material(THREE, options) {
  return new THREE.MeshStandardMaterial(options);
}

// 依据道具表生成场景节点。animators 收集需要逐帧动的部件。
export function buildProps(THREE, scene, props, palette, animators) {
  const group = new THREE.Group();
  group.name = 'expedition-props';
  for (const prop of props) {
    const built = buildProp(THREE, prop, palette, animators);
    if (built) group.add(built);
  }
  scene.add(group);
  return group;
}

function buildProp(THREE, prop, palette, animators) {
  const { kind, x, y, z } = prop;
  const yaw = prop.yaw || 0;
  switch (kind) {
    case 'palm': {
      const group = new THREE.Group();
      const height = prop.height || 6.4;
      const lean = prop.lean || 0;
      const trunk = cyl(THREE, palette.bark, .19, .3, height, 7, 0, height / 2, 0);
      trunk.rotation.z = lean;
      group.add(trunk);
      const topX = Math.sin(lean) * height;
      const fronds = prop.fronds || 7;
      for (let i = 0; i < fronds; i++) {
        const angle = (i / fronds) * Math.PI * 2 + yaw;
        const leaf = cone(THREE, palette.leaf, 1.05, 3.1, 4, 0, 0, 0);
        leaf.rotation.set(0, -angle, Math.PI / 2 - .42);
        leaf.position.set(
          topX + Math.cos(angle) * 1.25,
          height - .1,
          Math.sin(angle) * 1.25
        );
        group.add(leaf);
      }
      group.add(sphere(THREE, palette.coconut, .22, topX, height - .35, 0));
      group.position.set(x, y, z);
      return group;
    }
    case 'building': {
      const group = new THREE.Group();
      const w = prop.w || 12;
      const h = prop.h || 6;
      const d = prop.d || 9;
      group.add(box(THREE, prop.paint || palette.wall, w, h, d, 0, h / 2, 0, yaw));
      group.add(cone(THREE, prop.roof || palette.roof, Math.max(w, d) * .74, h * .5, 4, 0, h + h * .24, 0, Math.PI / 4));
      if (prop.windows !== false) {
        const count = Math.max(2, Math.floor(w / 3.4));
        for (let i = 0; i < count; i++) {
          const offset = (i - (count - 1) / 2) * 3.1;
          group.add(box(THREE, palette.glass, 1.7, 1.5, .12,
            offset * Math.cos(yaw), h * .58, offset * Math.sin(yaw), yaw));
        }
      }
      group.position.set(x, y, z);
      return group;
    }
    case 'container': {
      const group = new THREE.Group();
      const w = prop.w || 6;
      const h = prop.h || 2.6;
      const d = prop.d || 2.4;
      group.add(box(THREE, prop.paint || palette.container, w, h, d, 0, h / 2, 0, yaw));
      group.add(box(THREE, palette.trim, w * 1.01, .16, d * 1.02, 0, h * .82, 0, yaw));
      group.position.set(x, y, z);
      return group;
    }
    case 'rock': {
      const r = prop.r || 1.2;
      const mesh = sphere(THREE, prop.paint || palette.rock, r, x, y + r * .38, z);
      mesh.scale.set(1, .68 + (prop.squash || 0), 1);
      mesh.rotation.set(.2, yaw, .12);
      return mesh;
    }
    case 'ship': {
      const group = new THREE.Group();
      const length = prop.length || 26;
      const width = prop.width || 7;
      group.add(box(THREE, palette.hull, length, 4.4, width, 0, 2.2, 0, yaw));
      const bow = cone(THREE, palette.hull, width * .52, length * .17, 4, length * .5, 2.2, 0, Math.PI / 4);
      bow.rotation.set(0, 0, -Math.PI / 2);
      group.add(bow);
      group.add(box(THREE, palette.deck, length * .74, .35, width * .78, -length * .05, 4.5, 0, yaw));
      group.add(box(THREE, palette.trim, 5, 3.4, width * .72, -length * .22, 6.4, 0, yaw));
      group.add(cyl(THREE, palette.trim, .34, .34, 6, 8, length * .18, 7.4, 0, yaw));
      group.position.set(x, y, z);
      return group;
    }
    case 'crane': {
      const group = new THREE.Group();
      const height = prop.height || 13;
      group.add(box(THREE, palette.crane, 1.5, height, 1.5, 0, height / 2, 0, yaw));
      group.add(box(THREE, palette.crane, 1.1, 1.1, 16, 0, height, -5.5, yaw));
      group.add(box(THREE, palette.trim, 2.2, 2.2, 2.2, 0, height - 1.2, 1.6, yaw));
      const hook = box(THREE, palette.trim, .3, 6, .3, 0, height - 4.4, -12, yaw);
      group.add(hook);
      group.position.set(x, y, z);
      if (animators) animators.push({ kind: 'hook', node: hook, base: height - 4.4 });
      return group;
    }
    case 'pool': {
      const r = prop.r || 5;
      const mesh = cyl(THREE, palette.water, r, r, .18, 24, x, y + .12, z);
      mesh.scale.set(1, 1, prop.d || 1);
      return mesh;
    }
    case 'umbrella': {
      const group = new THREE.Group();
      group.add(cyl(THREE, palette.trim, .07, .07, 3, 6, 0, 1.5, 0));
      group.add(cone(THREE, prop.paint || palette.roof, 1.7, .9, 10, 0, 3.2, 0));
      group.position.set(x, y, z);
      return group;
    }
    case 'pine': {
      const group = new THREE.Group();
      const height = prop.height || 8;
      group.add(cyl(THREE, palette.bark, .22, .34, height * .34, 6, 0, height * .17, 0));
      group.add(cone(THREE, palette.leaf, height * .3, height * .46, 7, 0, height * .5, 0));
      group.add(cone(THREE, palette.leaf, height * .22, height * .38, 7, 0, height * .72, 0));
      group.add(cone(THREE, palette.leaf, height * .14, height * .3, 7, 0, height * .9, 0));
      group.position.set(x, y, z);
      return group;
    }
    case 'log': {
      const group = new THREE.Group();
      const length = prop.length || 6;
      const radius = prop.r || .42;
      const log = cyl(THREE, palette.log, radius, radius, length, 8, 0, 0, 0, yaw);
      log.rotation.z = Math.PI / 2;
      log.position.set(0, radius, 0);
      group.add(log);
      const end = cyl(THREE, palette.logEnd, radius * .96, radius * .96, .06, 8, length / 2 - .04, radius, 0, yaw);
      end.rotation.z = Math.PI / 2;
      group.add(end);
      group.position.set(x, y, z);
      return group;
    }
    case 'cabin': {
      const group = new THREE.Group();
      const w = prop.w || 6;
      const h = prop.h || 3.4;
      const d = prop.d || 5;
      group.add(box(THREE, palette.log, w, h, d, 0, h / 2, 0, yaw));
      group.add(cone(THREE, palette.roof, Math.max(w, d) * .72, h * .62, 4, 0, h + h * .3, 0, Math.PI / 4));
      group.add(box(THREE, palette.trim, 1.1, 2, .12, 0, 1, d / 2 + .02, yaw));
      group.position.set(x, y, z);
      return group;
    }
    case 'sawmill': {
      const group = new THREE.Group();
      const w = prop.w || 16;
      const h = prop.h || 8;
      const d = prop.d || 12;
      group.add(box(THREE, palette.wall, w, h, d, 0, h / 2, 0, yaw));
      group.add(box(THREE, palette.trim, w + 1.2, .7, d + 1.2, 0, h + .3, 0, yaw));
      group.add(cyl(THREE, palette.trim, .8, .8, h + 3, 8, w * .28, (h + 3) / 2, d * .2, yaw));
      // 锯片挂在两层节点上：内层绕自身轴自转，外层把轴摆到水平。
      const spinner = new THREE.Group();
      spinner.add(cyl(THREE, palette.blade, 2.6, 2.6, .28, 20, 0, 0, 0, 0));
      const mount = new THREE.Group();
      mount.add(spinner);
      mount.rotation.set(0, yaw, Math.PI / 2);
      mount.position.set(-w * .46, 2.9, 0);
      group.add(mount);
      group.position.set(x, y, z);
      if (animators) animators.push({ kind: 'blade', node: spinner, base: 2.9 });
      return group;
    }
    case 'truck': {
      const group = new THREE.Group();
      group.add(box(THREE, palette.crane, 3.2, 2.8, 2.8, 3.4, 2.1, 0, yaw));
      group.add(box(THREE, palette.glass, 2.2, 1.1, 2.9, 4.6, 2.9, 0, yaw));
      group.add(box(THREE, palette.trim, 8.4, .6, 2.6, -2.6, 1.5, 0, yaw));
      for (let i = 0; i < 3; i++) {
        group.add(box(THREE, palette.log, 2.4, .8, 2.4, -5 + i * 2.6, 2.1, 0, yaw));
      }
      group.position.set(x, y, z);
      return group;
    }
    case 'conveyor': {
      const group = new THREE.Group();
      const length = prop.length || 16;
      const belt = box(THREE, palette.trim, length, .35, 1.6, 0, 3.4, 0, yaw);
      belt.rotation.z = prop.tilt || .28;
      group.add(belt);
      group.add(cyl(THREE, palette.trim, .35, .35, 2.4, 8, length * .42, 1.4, 0, yaw));
      group.add(cyl(THREE, palette.trim, .35, .35, 2.4, 8, -length * .42, 2.6, 0, yaw));
      group.position.set(x, y, z);
      return group;
    }
    case 'stump': {
      const r = prop.r || .7;
      return cyl(THREE, palette.logEnd, r, r * 1.1, .9, 10, x, y + .45, z);
    }
    default:
      return null;
  }
}