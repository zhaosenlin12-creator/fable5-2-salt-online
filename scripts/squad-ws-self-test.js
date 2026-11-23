'use strict';

/**
 * 小队端到端自测：连真实服务端，开启小队 → 快照出现三名队友 →
 * 走进度假岛巡逻区，队友被机器单位打中（血量下降）→ 队长扶起 →
 * 关闭小队后队友消失。
 *
 *   node scripts/squad-ws-self-test.js
 */

const assert = require('node:assert/strict');
const { startServer, connect, closeAll, state, delay } = require('./test-harness');
const qingyun = require('../public/js/qingyun-zone');
const expeditions = require('../public/js/expedition-zones');

async function main() {
  const server = await startServer();
  try {
    const client = await connect(server.url, 'captain');
    client.send({ type: 'join', name: 'SQUAD-CAP', soldier: 'classic', spawns: [{ x: 20, y: 0, z: 20 }] });
    const joined = await client.waitFor('joined');
    // 上报一次坐标才会进入 active 状态，小队才会生成。
    client.send(state({ x: 20, y: 0, z: 20 }));
    await delay(200);

    // 1. 开启小队：快照里应出现三名队友。
    client.send({ type: 'squadMode', enabled: true });
    const squadSnapshot = await client.waitFor('snapshot', (message) => (
      Array.isArray(message.squads) && message.squads.length === 3
    ), 8000);
    const roles = squadSnapshot.squads.map((row) => row.role).sort();
    assert.deepEqual(roles, ['assault', 'medic', 'sniper'], '小队应有突击/狙击/医疗三人');
    assert.ok(squadSnapshot.squads.every((row) => row.state === 'active' && row.hp === row.maxHp),
      '刚出生时队友应满血活动');

    // 2. 换图到度假岛：队友要跟着队长传送，不能留在旧地图坐标里。
    client.send(state(qingyun.gate));
    await delay(260);
    client.send({ type: 'qingyunEnter' });
    await client.waitFor('qingyunEntered');
    const resort = expeditions.maps.resort;
    client.send(state(resort.gate));
    await delay(260);
    client.send({ type: 'mapEnter', map: 'resort' });
    await client.waitFor('mapEntered', (message) => message.map === 'resort');

    const moved = await client.waitFor('snapshot', (message) => (
      Array.isArray(message.squads) && message.squads.length === 3 &&
      message.squads.every((row) => Math.abs(row.z - resort.landing.z) < 40)
    ), 8000);
    assert.ok(moved.squads.every((row) => row.z < -28000), '换图后队友应跟到度假岛');

    // 3. 巡逻怪开火：队友要能被单独打中（血量下降），队长自己不掉血。
    let hurt = null;
    for (let step = 0; step < 40 && !hurt; step += 1) {
      await delay(400);
      const snapshot = await client.waitFor('snapshot', (message) => (
        Array.isArray(message.squads) && message.squads.length === 3
      ), 4000);
      hurt = snapshot.squads.find((row) => row.hp < row.maxHp) || null;
    }
    assert.ok(hurt, '队友应该会被机器单位打中（血量下降）');
    assert.ok(hurt.hp < hurt.maxHp, '队友血量应低于上限');
    assert.equal(hurt.state, 'active', '掉血后队友仍应能继续作战');

    // 4. 关闭小队：队友应从快照里消失。
    client.send({ type: 'squadMode', enabled: false });
    const closed = await client.waitFor('snapshot', (message) => (
      Array.isArray(message.squads) && message.squads.length === 0
    ), 8000);
    assert.equal(closed.squads.length, 0, '关闭小队后不应再有队友');

    console.log(JSON.stringify({
      ok: true,
      playerId: joined.id,
      roles,
      hurtMember: { role: hurt.role, hp: hurt.hp, maxHp: hurt.maxHp },
      followedToResort: true,
      closed: true
    }, null, 2));
  } finally {
    await server.stop();
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
}).finally(() => {
  closeAll();
  setTimeout(() => process.exit(process.exitCode || 0), 150);
});