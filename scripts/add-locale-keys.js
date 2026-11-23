'use strict';

// 合并新增的远征地图与小队文案到语言包，保持原有键顺序与两空格缩进。

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const LOCALES = path.join(ROOT, 'locales');

const ADDITIONS = {
  'zh-CN.json': {
    expeditionMaps: { resort: '度假岛·船厂', lumbermill: '山谷·伐木场' },
    squad: {
      toggle: '小队 AI 队友',
      on: '开',
      off: '关',
      assault: '突击',
      sniper: '狙击',
      medic: '医疗',
      downed: '倒地',
      reviving: '扶起中…',
      medicReviving: '医疗兵正在扶起',
      revivePrompt: '按 E 扶起 {name}',
      memberDown: '{name} 已倒地，需要队友扶起',
      memberRevived: '{name} 已归队'
    },
    godMode: {
      toggle: '无敌',
      on: '开',
      off: '关',
      hint: '开启后免疫一切伤害（仅私有服）'
    }
  },
  'en-US.json': {
    expeditionMaps: { resort: 'Resort Island Shipyard', lumbermill: 'Valley Lumber Mill' },
    squad: {
      toggle: 'AI Squad Mates',
      on: 'On',
      off: 'Off',
      assault: 'Assault',
      sniper: 'Sniper',
      medic: 'Medic',
      downed: 'Down',
      reviving: 'Reviving…',
      medicReviving: 'Medic is reviving',
      revivePrompt: 'Press E to revive {name}',
      memberDown: '{name} is down and needs a revive',
      memberRevived: '{name} is back on their feet'
    },
    godMode: {
      toggle: 'Invincible',
      on: 'On',
      off: 'Off',
      hint: 'Take no damage (private servers only)'
    }
  }
};

for (const [file, addition] of Object.entries(ADDITIONS)) {
  const target = path.join(LOCALES, file);
  const data = JSON.parse(fs.readFileSync(target, 'utf8'));
  data.expedition = data.expedition || {};
  data.expedition.maps = data.expedition.maps || {};
  Object.assign(data.expedition.maps, addition.expeditionMaps);
  data.squad = Object.assign(data.squad || {}, addition.squad);
  data.godMode = Object.assign(data.godMode || {}, addition.godMode);
  fs.writeFileSync(target, JSON.stringify(data, null, 2) + '\n');
  console.log('[locale] updated', file);
}