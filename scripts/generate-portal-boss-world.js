'use strict';

/**
 * 生成远征地图的服务端地形表。
 *
 * 客户端的 heightAt 是解析函数，服务端为了做视线遮挡与掩体判定，需要一份
 * 采样网格。本脚本从地图地形模块重新采样 heights，并把道具碰撞盒写入 boxes。
 * 已有地图的数据原样保留。
 *
 *   node scripts/generate-portal-boss-world.js
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const WORLD_FILE = path.join(ROOT, 'services', 'portal-boss-world.json');

const TARGETS = [
  {
    id: 'resort',
    module: '../public/maps/resort-terrain.mjs',
    x0: -145, z0: -145, step: 2.5, n: 117
  },
  {
    id: 'lumbermill',
    module: '../public/maps/lumbermill-terrain.mjs',
    x0: -162.5, z0: -162.5, step: 2.5, n: 131
  }
];

const round = value => Math.round(value * 100) / 100;

async function sample(target) {
  const module = await import(target.module);
  const { heightAt, colliders } = module;
  if (typeof heightAt !== 'function' || typeof colliders !== 'function') {
    throw new Error(`${target.id}: terrain module must export heightAt() and colliders()`);
  }
  const { x0, z0, step, n } = target;
  const heights = new Array(n * n);
  for (let row = 0; row < n; row++) {
    const z = z0 + row * step;
    for (let column = 0; column < n; column++) {
      heights[row * n + column] = Math.round(heightAt(x0 + column * step, z) * 100);
    }
  }
  const boxes = colliders().map(box => box.map(round));
  return { x0, z0, n, step, heights, boxes };
}

async function main() {
  const world = JSON.parse(fs.readFileSync(WORLD_FILE, 'utf8'));
  for (const target of TARGETS) {
    const area = await sample(target);
    world[target.id] = area;
    console.log(`[world] ${target.id}: ${area.n}x${area.n} heights, ${area.boxes.length} boxes`);
  }
  fs.writeFileSync(WORLD_FILE, JSON.stringify(world));
  console.log('[world] wrote', path.relative(ROOT, WORLD_FILE));
}

main().catch(error => {
  console.error('[world] failed:', error.message);
  process.exit(1);
});