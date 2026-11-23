'use strict';

/**
 * 中文魔改「无敌」端到端自测：
 *   1. SALT_MOD=1 的私服里，开了无敌的玩家不掉血，也收不到 damaged；
 *   2. 同一个私服里，没开无敌的玩家正常掉血（证明判定生效而不是整体失效）；
 *   3. 公网默认（未开 SALT_MOD）时，无敌请求被忽略，玩家照常掉血。
 *
 *   node scripts/god-mode-self-test.js
 */

const assert = require('node:assert/strict');
const { startServer, connect, closeAll, state, delay } = require('./test-harness');

const VICTIM_POS = { x: 0, y: 0, z: 0 };
const SHOOTER_POS = { x: 0, y: 0, z: 5 };
const SHOT_DIR = { x: 0, y: -0.049937, z: -0.998752 };

async function scenario({ mods, god }) {
  const server = await startServer(mods ? { SALT_MOD: '1' } : {});
  try {
    const victim = await connect(server.url, 'victim');
    const shooter = await connect(server.url, 'shooter');
    victim.send({ type: 'join', name: 'TARGET', soldier: 'classic', spawns: [{ x: 20, y: 0, z: 20 }] });
    shooter.send({ type: 'join', name: 'GUNNER', soldier: 'classic', spawns: [{ x: 20, y: 0, z: 20 }] });
    const victimJoined = await victim.waitFor('joined');
    await shooter.waitFor('joined');

    const modSnapshot = await victim.waitFor('snapshot', (message) => message.mods);
    assert.equal(modSnapshot.mods.god, Boolean(mods), '快照里的 mods.god 应与服务端开关一致');

    // 出生保护期内打不中伤害，等保护结束。
    await delay(5200);

    shooter.send(state(SHOOTER_POS));
    victim.send(state(VICTIM_POS));
    await delay(320);

    if (god) {
      victim.send({ type: 'godMode', enabled: true });
      await delay(200);
    }
    victim.clear();

    shooter.send({
      type: 'shot',
      weapon: 'pac9',
      origin: { x: SHOOTER_POS.x, y: SHOOTER_POS.y + 1.2, z: SHOOTER_POS.z },
      dir: SHOT_DIR
    });
    shooter.send({ type: 'hit', targetId: victimJoined.id });
    await delay(700);

    const damaged = victim.messages.find((message) => message.type === 'damaged');
    const snapshot = await victim.waitFor('snapshot', (message) => message.you && message.you.hp !== undefined);
    return {
      mods: Boolean(mods),
      god,
      damaged: damaged ? damaged.amount : null,
      hp: snapshot.you.hp
    };
  } finally {
    await server.stop();
  }
}

async function main() {
  const baseline = await scenario({ mods: true, god: false });
  assert.equal(baseline.damaged, 34, '没开无敌时 PAC-9 应造成 34 点伤害');
  assert.ok(baseline.hp < 100, '没开无敌时血量应下降');

  const invincible = await scenario({ mods: true, god: true });
  assert.equal(invincible.damaged, null, '开了无敌不应收到 damaged');
  assert.equal(invincible.hp, 100, '开了无敌血量应保持满值');

  const publicServer = await scenario({ mods: false, god: true });
  assert.equal(publicServer.damaged, 34, '公网默认应忽略无敌请求，玩家照常掉血');
  assert.ok(publicServer.hp < 100, '公网默认血量应下降');

  console.log(JSON.stringify({
    ok: true,
    baseline,
    invincible,
    publicServer
  }, null, 2));
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
}).finally(() => {
  closeAll();
  setTimeout(() => process.exit(process.exitCode || 0), 150);
});