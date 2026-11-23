'use strict';

/**
 * AI 小队服务端自测：编队生成、跟随、倒地、扶起、医疗治疗与开关。
 *
 *   node scripts/squad-self-test.js
 */

const assert = require('node:assert/strict');
const { createSquad } = require('../services/squad');

const shots = [];
const notices = [];
const damaged = [];
let hostile = [];

const player = {
  id: 'p1',
  joined: true,
  active: true,
  alive: true,
  hp: 60,
  yaw: 0,
  pos: { x: -32, y: 0, z: 6 }
};

const squad = createSquad({
  players: () => [player],
  mapKey: () => 'port',
  fire(member, origin, dir, target, owner) {
    shots.push({ id: member.id, role: member.role, origin, dir });
  },
  damageTarget(map, id, amount) {
    damaged.push({ map, id, amount });
    return true;
  },
  targets: () => hostile,
  heal(owner, amount) {
    owner.hp += amount;
  },
  notify(kind, member) {
    notices.push({ kind, id: member.id, role: member.role });
  }
});

let now = 1000;
squad.tick(now, 0.1);
const rows = squad.snapshot('port');
assert.equal(rows.length, 3, '小队应有三名队友');
assert.deepEqual(rows.map(row => row.role).sort(), ['assault', 'medic', 'sniper']);
assert.ok(rows.every(row => row.state === 'active'), '刚生成时应全部处于活动状态');

// 跟随：队友应当落在队长周围的编队偏移里。
const offsets = rows.map(row => ({
  role: row.role,
  distance: Math.hypot(row.x - player.pos.x, row.z - player.pos.z)
}));
assert.ok(offsets.every(item => item.distance < 12), '队友应跟在队长附近');

// 敌人进入射程后开火。
hostile = [{ id: 'u1', x: player.pos.x + 10, y: 0, z: player.pos.z, kind: 'hound' }];
now += 2000;
squad.tick(now, 0.1);
assert.ok(shots.length > 0, '小队应对附近敌人开火');
assert.ok(damaged.length > 0, '小队开火应对巡逻怪造成伤害');

// 受伤倒地。
const assault = squad.snapshot('port').find(row => row.role === 'assault');
assert.equal(
  squad.damageMember(assault.id, 9999, now, { x: player.pos.x, y: 0, z: player.pos.z }),
  true,
  '巡逻怪命中队友应结算伤害'
);
const downed = squad.snapshot('port').find(row => row.state === 'downed');
assert.ok(downed, '队友应会倒地');
assert.ok(notices.some(item => item.kind === 'downed'), '倒地应通知队长');

// 队长自己挨打不再由队友代扣血：队友的血量是独立的。
const sniper = squad.snapshot('port').find(row => row.role === 'sniper');
const before = sniper.hp;
player.hp = 60;
assert.equal(squad.damageMember(sniper.id, 0, now, null), true, '零伤害不应改变状态');
assert.equal(squad.snapshot('port').find(row => row.role === 'sniper').hp, before, '队友血量不应被队长受击牵连');

// 队长扶起：距离太远时应拒绝。
assert.equal(squad.revive(player, downed.id, now), false, '超范围不应允许扶起');
player.pos = { x: downed.x + 1, y: downed.y, z: downed.z };
assert.equal(squad.revive(player, downed.id, now), true, '范围内应可以扶起');
now += 3000;
squad.tick(now, 0.1);
const revived = squad.snapshot('port').find(row => row.id === downed.id);
assert.equal(revived.state, 'active', '扶起完成后队友应重新活动');
assert.ok(revived.hp > 0 && revived.hp < revived.maxHp, '扶起后应恢复部分血量');

// 医疗兵治疗队长。
player.hp = 50;
now += 3000;
squad.tick(now, 0.1);
assert.ok(player.hp > 50, '医疗兵应治疗队长');

// 关闭小队后不再生成队友。
player.squadEnabled = false;
now += 13000;
squad.tick(now, 0.1);
assert.equal(squad.snapshot('port').length, 0, '关闭后不应保留小队');

console.log(JSON.stringify({ ok: true, roles: 3, revive: true, medicHeal: true }));
