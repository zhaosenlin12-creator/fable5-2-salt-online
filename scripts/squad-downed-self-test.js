'use strict';

/**
 * 小队倒地 / 扶起集成自测：用真实的共享巡逻怪 + 真实的小队服务，
 * 验证「队友被机器单位打中 → 倒地 → 队长扶起 → 重新参战」这条链路。
 *
 *   node scripts/squad-downed-self-test.js
 */

const assert = require('node:assert/strict');
const { createSquad } = require('../services/squad');
const { createSharedPatrols } = require('../services/sharedPatrols');

const notices = [];
const patrolShots = [];
const memberShots = [];
const destroyed = [];

const player = {
  id: 'captain',
  joined: true,
  active: true,
  alive: true,
  hp: 100,
  yaw: 0,
  protectedUntil: 0,
  // 青云宗巡逻怪锚点在 z = offsetZ + 9 = -591，队长站在怪群中间。
  pos: { x: 0, y: 2, z: -591 }
};

let squad;
let patrols;

squad = createSquad({
  players: () => [player],
  mapKey: () => 'qingyun',
  fire(member, origin, dir, target) {
    memberShots.push({ id: member.id, role: member.role });
  },
  damageTarget(map, id, amount) {
    return patrols.damageUnit(map, id, amount, Date.now(), player);
  },
  targets: (map) => patrols.snapshot(map).map(unit => ({
    id: unit.id, x: unit.x, y: unit.y, z: unit.z, kind: unit.kind
  })),
  heal(owner, amount) {
    owner.hp = Math.min(100, owner.hp + amount);
  },
  notify(kind, member, owner, extra) {
    notices.push({ kind, id: member.id, role: member.role, origin: extra && extra.origin });
  }
});

patrols = createSharedPatrols({
  players: () => [player],
  mapKey: () => 'qingyun',
  eligible: (target, now) => target.joined && target.active && target.alive && target.protectedUntil <= now,
  fire(unit, origin, dir, range) {
    patrolShots.push({ id: unit.id, kind: unit.kind, origin, dir });
  },
  damage(target, unit, amount) {
    player.hp = Math.max(0, player.hp - amount);
  },
  destroy(who, unit) {
    destroyed.push({ id: unit.id, kind: unit.kind });
  },
  // 与 realtime/multiplayer.js 保持一致：机器单位把队友当作可命中目标。
  extraTargets: (map) => squad.exposed(map),
  damageExtra(target, unit, amount, now, origin) {
    squad.damageMember(target.id, amount, now, origin);
  }
});

let now = Date.now();
patrols.tick(now);
squad.tick(now, 0.1);

const rows = squad.snapshot('qingyun');
assert.equal(rows.length, 3, '小队应有三名队友');
const captainHp = player.hp;

// 让机器单位开火若干轮：队友必须有独立血量并真的挨打。
let damagedMember = null;
for (let step = 0; step < 40 && !damagedMember; step += 1) {
  now += 100;
  patrols.tick(now);
  squad.tick(now, 0.1);
  const row = squad.snapshot('qingyun').find(item => item.hp < item.maxHp);
  if (row) damagedMember = row;
}
assert.ok(damagedMember, '机器单位应该能打中队友（队友必须有独立血量）');
assert.equal(player.hp, captainHp, '队友挨打不应扣队长的血');
assert.ok(patrolShots.length > 0, '机器单位应该开火');

// 直接把队友打空血，验证倒地 → 扶起 → 重新参战。
const target = squad.snapshot('qingyun').find(row => row.role === 'assault');
assert.equal(squad.damageMember(target.id, 9999, now, { x: target.x, y: target.y, z: target.z }), true);
const downed = squad.snapshot('qingyun').find(row => row.id === target.id);
assert.equal(downed.state, 'downed', '血量归零后队友应倒地');
assert.ok(notices.some(item => item.kind === 'downed' && item.id === target.id), '倒地应通知队长');

// 倒地后不再被机器单位锁定。
assert.equal(squad.exposed('qingyun').some(row => row.id === target.id), false, '倒地队友不应再被瞄准');

// 队长走近后按 E 扶起：2.6 秒后队友回到活动状态。
assert.equal(squad.revive(player, target.id, now), false, '超范围不应允许扶起');
player.pos = { x: downed.x + 1, y: downed.y, z: downed.z };
assert.equal(squad.revive(player, target.id, now), true, '范围内应可以扶起');
now += 3000;
squad.tick(now, 0.1);
const revived = squad.snapshot('qingyun').find(row => row.id === target.id);
assert.equal(revived.state, 'active', '扶起完成后队友应重新活动');
assert.ok(revived.hp > 0 && revived.hp < revived.maxHp, '扶起后应恢复部分血量');
assert.ok(notices.some(item => item.kind === 'revived' && item.id === target.id), '扶起应通知队长');

console.log(JSON.stringify({
  ok: true,
  damagedMember: damagedMember.role,
  downed: true,
  revived: true,
  memberShots: memberShots.length,
  patrolShots: patrolShots.length
}, null, 2));