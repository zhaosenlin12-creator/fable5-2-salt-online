'use strict';

// 自检：新地图的落点 / 复活点不能落在道具碰撞盒里，也不能与地形高度脱节。
// 用法：node scripts/map-spawn-self-test.js

const path = require('node:path');
const { pathToFileURL } = require('node:url');
const zones = require('../public/js/expedition-zones');

const MAPS = ['resort', 'lumbermill'];

function inside(box, x, z) {
  return box[0] <= x && box[3] >= x && box[2] <= z && box[5] >= z;
}

async function main() {
  const failures = [];
  for (const id of MAPS) {
    const terrain = await import(pathToFileURL(path.join(__dirname, '..', 'public', 'maps', id + '-terrain.mjs')).href);
    const map = zones.maps[id];
    if (!map) {
      failures.push(id + ': 地图未在 expedition-zones 中注册');
      continue;
    }
    const boxes = terrain.colliders();
    const points = [
      { name: 'landing', x: map.landing.x, z: map.landing.z - map.offset, y: map.landing.y },
      ...map.respawns.map((point, index) => ({ name: 'respawn' + index, x: point.x, z: point.z - map.offset, y: point.y }))
    ];
    for (const point of points) {
      const blockers = boxes.filter(box => inside(box, point.x, point.z));
      if (blockers.length) {
        failures.push(id + '/' + point.name + ' 落在道具碰撞盒内 ' + JSON.stringify(blockers.map(box => [box[0], box[2], box[3], box[5]])));
        continue;
      }
      const ground = Number(terrain.heightAt(point.x, point.z));
      if (!Number.isFinite(ground)) {
        failures.push(id + '/' + point.name + ' 地形高度无效');
        continue;
      }
      if (Math.abs(ground - point.y) > 1.2) {
        failures.push(id + '/' + point.name + ' 出生高度 ' + point.y + ' 与地形 ' + ground.toFixed(2) + ' 相差过大');
      }
    }
    if (!terrain.props.length) failures.push(id + ': 道具表为空');
    console.log('[' + id + '] 落点/复活点 ' + points.length + ' 个，道具 ' + terrain.props.length + ' 件，碰撞盒 ' + boxes.length + ' 个');
  }
  if (failures.length) {
    console.error('\n地图出生点自检失败：');
    for (const line of failures) console.error(' - ' + line);
    process.exit(1);
  }
  console.log('\n地图出生点自检通过');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});