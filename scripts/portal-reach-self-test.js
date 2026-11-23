'use strict';

/**
 * 传送门可达性端到端自测：走完「港口时空隧道门 → 青云宗 → 新增传送门 → 远征图」
 * 的真实服务端链路，覆盖度假岛与伐木场两张新图的入口门。
 *
 *   node scripts/portal-reach-self-test.js
 */

const assert = require('node:assert/strict');
const { startServer, connect, closeAll, state, delay } = require('./test-harness');
const qingyun = require('../public/js/qingyun-zone');
const expeditions = require('../public/js/expedition-zones');

async function main() {
  const server = await startServer();
  try {
    const client = await connect(server.url, 'explorer');
    client.send({ type: 'join', name: 'GATE-TEST', soldier: 'classic', spawns: [{ x: 20, y: 0, z: 20 }] });
    const joined = await client.waitFor('joined');

    // 1. 走到港口时空隧道门。
    client.send(state(qingyun.gate));
    await delay(220);
    client.send({ type: 'qingyunEnter' });
    const entered = await client.waitFor('qingyunEntered');
    assert.ok(entered.pos, '进入青云宗后应返回落点');

    // 2. 青云宗里走到度假岛的传送门。
    const resort = expeditions.maps.resort;
    client.send(state(resort.gate));
    await delay(220);
    client.send({ type: 'mapEnter', map: 'resort' });
    const resortEntered = await client.waitFor('mapEntered', (message) => message.map === 'resort');
    assert.deepEqual(
      { x: resortEntered.pos.x, z: resortEntered.pos.z },
      { x: resort.landing.x, z: resort.landing.z },
      '度假岛落点应与地图定义一致'
    );

    // 3. 从度假岛撤回青云宗。
    client.send(state({ x: resort.exit.x, y: resort.landing.y, z: resort.exit.z }));
    await delay(220);
    client.send({ type: 'mapReturn' });
    const returned = await client.waitFor('mapReturned');
    assert.ok(returned.pos, '撤离远征图应返回落点');

    // 4. 青云宗里走到伐木场的传送门。
    const lumbermill = expeditions.maps.lumbermill;
    client.send(state(lumbermill.gate));
    await delay(220);
    client.send({ type: 'mapEnter', map: 'lumbermill' });
    const millEntered = await client.waitFor('mapEntered', (message) => message.map === 'lumbermill');
    assert.deepEqual(
      { x: millEntered.pos.x, z: millEntered.pos.z },
      { x: lumbermill.landing.x, z: lumbermill.landing.z },
      '伐木场落点应与地图定义一致'
    );

    // 5. 快照里的所属地图也应切换成功。
    const snapshot = await client.waitFor('snapshot', (message) => (
      message.you && message.bossMap === 'lumbermill'
    ));
    assert.equal(snapshot.bossMap, 'lumbermill', '快照应显示玩家在伐木场');

    console.log(JSON.stringify({
      ok: true,
      playerId: joined.id,
      qingyunEntered: true,
      resortEntered: true,
      lumbermillEntered: true,
      resortGate: resort.gate,
      lumbermillGate: lumbermill.gate
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
