'use strict';

/**
 * 服务端权威的 AI 小队队友。
 *
 * 每名开启小队的玩家拥有一支三人小队：突击 / 狙击 / 医疗。小队跟随队长
 * 作战，对附近的机器单位开火；血量归零后倒地，需要队友扶起，倒地超时
 * 后才会退场。医疗兵会治疗队长并自动扶起倒地队友。
 *
 * 伤害、倒地、扶起全部在服务端结算，客户端只负责表现。
 */

const { randomUUID } = require('node:crypto');
const { landingSurface, blocked } = require('./portalBosses');

const ROLES = {
  assault: {
    role: 'assault', label: '突击',
    hp: 300, speed: 6.8, range: 52, damage: 18, gap: 560, spread: .03,
    right: 2.6, forward: -3.4, color: 0x6fd3ff
  },
  sniper: {
    role: 'sniper', label: '狙击',
    hp: 210, speed: 5.2, range: 120, damage: 46, gap: 1800, spread: .006,
    right: -3, forward: -1.6, color: 0xffd166
  },
  medic: {
    role: 'medic', label: '医疗',
    hp: 280, speed: 6.2, range: 38, damage: 10, gap: 900, spread: .036,
    right: 0, forward: -5.6, color: 0x8affa1
  }
};
const ORDER = ['assault', 'sniper', 'medic'];

const BLEED_MS = 45000;
const REVIVE_MS = 2600;
const MEDIC_REVIVE_MS = 5200;
const REJOIN_MS = 12000;
const HEAL_MS = 2400;
const HEAL_AMOUNT = 16;
const REVIVE_RANGE = 3.4;
const MEDIC_RANGE = 7;
const CLEARANCE = .45;

const distance = (a, b) => Math.hypot(a.x - b.x, (a.y || 0) - (b.y || 0), a.z - b.z);
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

function createSquad({ players, mapKey, fire, damageTarget, targets, heal, notify }) {
  const squads = new Map();
  let cache = new Map();

  function hostiles(map) {
    if (!cache.has(map)) cache.set(map, targets(map) || []);
    return cache.get(map);
  }

  // 编队站位：以队长朝向为基准的固定偏移。
  function formation(owner, spec) {
    const yaw = owner.yaw || 0;
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    return {
      x: owner.pos.x + cos * spec.right + sin * spec.forward,
      y: owner.pos.y,
      z: owner.pos.z - sin * spec.right + cos * spec.forward
    };
  }

  function spawn(squad, role, owner, now) {
    const spec = ROLES[role];
    const spot = formation(owner, spec);
    const member = {
      id: randomUUID(),
      role,
      label: spec.label,
      hp: spec.hp,
      maxHp: spec.hp,
      x: spot.x,
      y: spot.y,
      z: spot.z,
      yaw: owner.yaw || 0,
      state: 'active',
      fireAt: now + 900,
      downAt: 0,
      bleedAt: 0,
      reviving: null,
      spec
    };
    squad.members.push(member);
    return member;
  }

  function memberOf(squad, role) {
    return squad.members.find(member => member.role === role) || null;
  }

  // 按 id 找到队友：巡逻怪结算伤害、队长发起扶起都要用。
  function findMember(id) {
    for (const [ownerId, squad] of squads) {
      const member = squad.members.find(item => item.id === id);
      if (member) return { ownerId, squad, member, owner: squad.owner };
    }
    return null;
  }

  function surface(map, x, z, referenceY) {
    const landing = landingSurface(map, x, z, referenceY + 30, referenceY);
    // 服务端的粗糙地形表在大地图上并不精确，限制在队长高度附近以免队友浮空。
    return clamp(landing.y, referenceY - 6, referenceY + 6);
  }

  function move(member, map, target, owner, dt) {
    const spec = member.spec;
    const dx = target.x - member.x;
    const dz = target.z - member.z;
    const length = Math.hypot(dx, dz);
    if (length < .35) return false;
    const step = Math.min(length, spec.speed * dt);
    const next = { x: member.x + dx / length * step, y: member.y, z: member.z + dz / length * step };
    if (blocked(map, member, next, CLEARANCE)) return false;
    member.x = next.x;
    member.z = next.z;
    member.y = surface(map, member.x, member.z, owner.pos.y);
    member.yaw = Math.atan2(dx, dz);
    return true;
  }

  function engage(member, map, list, now, owner) {
    const spec = member.spec;
    if (now < member.fireAt) return;
    const origin = { x: member.x, y: member.y + 1.35, z: member.z };
    let best = null;
    let bestRange = Infinity;
    for (const target of list) {
      const range = Math.hypot(target.x - member.x, target.z - member.z);
      if (range > spec.range || range < 1.2 || range >= bestRange) continue;
      if (blocked(map, origin, { x: target.x, y: target.y + 1, z: target.z }, 0)) continue;
      best = target;
      bestRange = range;
    }
    if (!best) return;
    const dir = {
      x: best.x - origin.x,
      y: (best.y + 1) - origin.y,
      z: best.z - origin.z
    };
    const norm = Math.hypot(dir.x, dir.y, dir.z) || 1;
    dir.x /= norm;
    dir.y /= norm;
    dir.z /= norm;
    const spread = spec.spread;
    dir.x += (Math.random() - .5) * spread;
    dir.y += (Math.random() - .5) * spread;
    dir.z += (Math.random() - .5) * spread;
    const length = Math.hypot(dir.x, dir.y, dir.z) || 1;
    dir.x /= length;
    dir.y /= length;
    dir.z /= length;
    member.yaw = Math.atan2(dir.x, dir.z);
    member.fireAt = now + spec.gap;
    fire(member, origin, dir, best, owner);
    if (Math.random() < clamp(1 - spread * 12, .25, 1)) damageTarget(map, best.id, spec.damage, now, owner);
  }

  function reviveProgress(member, owner, now) {
    if (!member.reviving) return;
    if (member.reviving.by === 'owner') {
      if (distance(owner.pos, member) > REVIVE_RANGE) {
        member.reviving = null;
        return;
      }
    } else if (distance(member.reviving.helper, member) > MEDIC_RANGE) {
      member.reviving = null;
      return;
    }
    if (now - member.reviving.at < member.reviving.until) return;
    member.reviving = null;
    member.state = 'active';
    member.hp = Math.round(member.maxHp * .45);
    member.downAt = 0;
    member.bleedAt = 0;
    member.fireAt = now + 600;
    notify?.('revived', member, owner);
  }

  function updateMember(squad, member, owner, map, now, list) {
    const spec = member.spec;
    if (member.state === 'downed') {
      if (member.bleedAt && now >= member.bleedAt) {
        squad.members = squad.members.filter(item => item !== member);
        squad.nextJoinAt[member.role] = now + REJOIN_MS;
        notify?.('lost', member, owner);
        return;
      }
      reviveProgress(member, owner, now);
      return;
    }
    // 医疗兵：治疗队长，并自动扶起倒地队友。
    if (spec.role === 'medic') {
      if (now - (member.lastHeal || 0) >= HEAL_MS) {
        member.lastHeal = now;
        heal(owner, HEAL_AMOUNT);
      }
      for (const other of squad.members) {
        if (other === member || other.state !== 'downed' || other.reviving) continue;
        if (distance(member, other) > MEDIC_RANGE) continue;
        other.reviving = { by: 'medic', at: now, until: MEDIC_REVIVE_MS, helper: member };
        break;
      }
    }
    const engaged = list.some(target => {
      const range = Math.hypot(target.x - member.x, target.z - member.z);
      return range <= spec.range && range >= 1.2;
    });
    const follow = formation(owner, spec);
    if (!engaged || distance(member, follow) > 14) move(member, map, follow, owner, squad.dt);
    if (engaged) {
      member.y = surface(map, member.x, member.z, owner.pos.y);
      engage(member, map, list, now, owner);
    }
  }

  function updateSquad(squad, owner, now) {
    const map = mapKey(owner);
    if (squad.map !== map) {
      // 队长换图（港口 → 青云宗 → 远征图）：队友必须跟着传送，
      // 否则会留在旧地图的坐标里卡在墙里，永远打不到也倒不了。
      squad.map = map;
      for (const member of squad.members) {
        const spot = formation(owner, member.spec);
        member.x = spot.x;
        member.z = spot.z;
        member.y = surface(map, member.x, member.z, owner.pos.y);
        member.yaw = owner.yaw || 0;
      }
    }
    const list = hostiles(map);
    // 每个角色各自计时：开局三人同时到场，阵亡后单独补员。
    for (const role of ORDER) {
      if (memberOf(squad, role)) continue;
      if (now < (squad.nextJoinAt[role] || 0)) continue;
      spawn(squad, role, owner, now);
      squad.nextJoinAt[role] = now + REJOIN_MS;
    }
    for (const member of squad.members.slice()) {
      updateMember(squad, member, owner, map, now, list);
    }
  }

  function tick(now, dt) {
    cache = new Map();
    const live = new Set();
    for (const player of players()) {
      if (!player.joined || !player.active || !player.alive) continue;
      if (player.squadEnabled === false) continue;
      live.add(player.id);
      let squad = squads.get(player.id);
      if (!squad) {
        squad = { owner: player, members: [], nextJoinAt: {}, dt: dt || .1 };
        squads.set(player.id, squad);
      }
      squad.dt = dt || .1;
      updateSquad(squad, player, now);
    }
    for (const id of [...squads.keys()]) if (!live.has(id)) squads.delete(id);
  }

  function revive(player, memberId, now) {
    const squad = squads.get(player.id);
    if (!squad) return false;
    const member = squad.members.find(item => item.id === memberId);
    if (!member || member.state !== 'downed') return false;
    if (distance(player.pos, member) > REVIVE_RANGE) return false;
    if (member.reviving && member.reviving.by === 'owner') return false;
    member.reviving = { by: 'owner', at: now, until: REVIVE_MS, helper: player };
    notify?.('reviveStarted', member, player);
    return true;
  }

  // 队友被巡逻怪命中：血量归零后倒地，等待队长（E 键）或医疗兵扶起。
  // 队长自己的血量不再由队友代扣，否则队长阵亡前队友永远打不倒。
  function damageMember(id, amount, now, origin) {
    const found = findMember(id);
    if (!found) return false;
    const member = found.member;
    if (member.state !== 'active') return false;
    member.hp = Math.max(0, member.hp - amount);
    if (member.hp > 0) return true;
    member.state = 'downed';
    member.downAt = now;
    member.bleedAt = now + BLEED_MS;
    member.reviving = null;
    notify?.('downed', member, found.owner, { origin: origin || null });
    return true;
  }

  // 供共享巡逻怪瞄准：只有活动状态的队友才是有效目标，倒地后不再挨打。
  function exposed(map) {
    const rows = [];
    for (const [ownerId, squad] of squads) {
      if (map && squad.map !== map) continue;
      for (const member of squad.members) {
        if (member.state !== 'active') continue;
        rows.push({
          id: member.id,
          owner: ownerId,
          role: member.role,
          x: member.x,
          y: member.y,
          z: member.z
        });
      }
    }
    return rows;
  }

  function snapshot(map) {
    const rows = [];
    for (const [ownerId, squad] of squads) {
      if (map && squad.map !== map) continue;
      for (const member of squad.members) {
        rows.push({
          id: member.id,
          owner: ownerId,
          role: member.role,
          label: member.label,
          hp: Math.round(member.hp),
          maxHp: member.maxHp,
          x: member.x,
          y: member.y,
          z: member.z,
          yaw: member.yaw,
          state: member.state,
          downAt: member.downAt,
          bleedAt: member.bleedAt,
          reviving: member.reviving ? { by: member.reviving.by, until: member.reviving.until } : null
        });
      }
    }
    return rows;
  }

  return { tick, revive, damageMember, exposed, snapshot, squads };
}

module.exports = { createSquad, ROLES };
