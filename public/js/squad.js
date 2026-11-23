(() => {
  'use strict';

  const SETTINGS_KEY = 'saltline.settings.v1';
  const ROLE_COLORS = {
    assault: 0x6fd3ff,
    sniper: 0xffd166,
    medic: 0x8affa1
  };
  const ROLE_KEYS = {
    assault: 'squad.assault',
    sniper: 'squad.sniper',
    medic: 'squad.medic'
  };
  const REVIVE_RANGE = 3.4;

  function messages() {
    return (window.__SALT_I18N__ || {}).messages || {};
  }

  function t(key, vars) {
    const value = String(key || '').split('.').reduce((acc, part) => (
      acc && typeof acc === 'object' ? acc[part] : undefined
    ), messages());
    if (typeof value !== 'string') return key;
    return value.replace(/\{(\w+)\}/g, (match, name) => (
      vars && Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match
    ));
  }

  function readEnabled() {
    try {
      const data = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
      return data && typeof data.squadEnabled === 'boolean' ? data.squadEnabled : true;
    } catch {
      return true;
    }
  }

  function persist(enabled) {
    try {
      const data = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') || {};
      data.squadEnabled = enabled;
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(data));
    } catch { /* ignore */ }
  }

  window.installSquad = function (game) {
    const { THREE, scene } = game;
    const members = new Map();
    let rows = [];
    let map = '';
    let enabled = readEnabled();
    const pointer = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);

    const panel = document.createElement('div');
    panel.id = 'squad-panel';
    panel.style.cssText = 'position:fixed;left:18px;bottom:104px;z-index:11;display:none;gap:6px;flex-direction:column;' +
      'font:600 12px/1.4 system-ui,sans-serif;color:#eaf6ff;pointer-events:none;text-shadow:0 1px 3px #000a';
    document.body.append(panel);

    const prompt = document.createElement('div');
    prompt.id = 'squad-prompt';
    prompt.style.cssText = 'position:fixed;left:50%;bottom:23%;transform:translateX(-50%);z-index:12;display:none;' +
      'padding:7px 14px;background:#101d27d8;border:1px solid #4fd2ff66;border-radius:8px;color:#eaf6ff;' +
      'font:600 13px/1.4 system-ui,sans-serif;pointer-events:none';
    document.body.append(prompt);

    function body(color) {
      const group = new THREE.Group();
      const suit = new THREE.MeshStandardMaterial({ color, roughness: .72, metalness: .08 });
      const gear = new THREE.MeshStandardMaterial({ color: 0x1d2530, roughness: .8, metalness: .1 });
      const skin = new THREE.MeshStandardMaterial({ color: 0xd7b28c, roughness: .85 });

      const torso = new THREE.Mesh(new THREE.BoxGeometry(.5, .74, .28), suit);
      torso.position.y = 1.12;
      group.add(torso);

      const vest = new THREE.Mesh(new THREE.BoxGeometry(.54, .38, .32), gear);
      vest.position.y = 1.18;
      group.add(vest);

      const head = new THREE.Mesh(new THREE.SphereGeometry(.145, 12, 10), skin);
      head.position.y = 1.63;
      group.add(head);

      const helmet = new THREE.Mesh(new THREE.SphereGeometry(.165, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), gear);
      helmet.position.y = 1.66;
      group.add(helmet);

      const armL = new THREE.Mesh(new THREE.BoxGeometry(.13, .48, .14), suit);
      armL.position.set(-.33, 1.16, .04);
      group.add(armL);
      const armR = new THREE.Mesh(new THREE.BoxGeometry(.13, .48, .14), suit);
      armR.position.set(.33, 1.16, .06);
      group.add(armR);

      const legL = new THREE.Mesh(new THREE.BoxGeometry(.17, .72, .19), gear);
      legL.position.set(-.13, .38, 0);
      group.add(legL);
      const legR = new THREE.Mesh(new THREE.BoxGeometry(.17, .72, .19), gear);
      legR.position.set(.13, .38, 0);
      group.add(legR);

      const rifle = new THREE.Mesh(new THREE.BoxGeometry(.07, .1, .66), gear);
      rifle.position.set(.19, 1.24, .28);
      group.add(rifle);

      group.traverse(node => { if (node.isMesh) node.castShadow = false; });
      return group;
    }

    function beacon(color) {
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(.09, .09, 1.7, 8, 1, true),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .55, depthWrite: false, toneMapped: false })
      );
      mesh.position.y = 1.5;
      return mesh;
    }

    function create(row) {
      const color = ROLE_COLORS[row.role] || 0xffffff;
      const model = body(color);
      const light = beacon(color);
      model.add(light);
      light.visible = false;
      model.name = 'squad-' + row.id;
      scene.add(model);
      return { model, light, row };
    }

    function dispose(entry) {
      if (!entry) return;
      entry.model.removeFromParent();
      entry.model.traverse(node => {
        if (node.isMesh) node.geometry.dispose();
      });
    }

    function clear() {
      for (const entry of members.values()) dispose(entry);
      members.clear();
    }

    function snapshot(nextMap, nextRows) {
      if (nextMap !== map) clear();
      map = nextMap;
      rows = Array.isArray(nextRows) ? nextRows : [];
      const wanted = new Set(rows.map(row => row.id));
      for (const id of [...members.keys()]) {
        if (!wanted.has(id)) {
          dispose(members.get(id));
          members.delete(id);
        }
      }
    }

    function myRows() {
      const id = window.__mp?.id;
      if (!id) return [];
      return rows.filter(row => row.owner === id);
    }

    function nearestDowned() {
      const player = game.player;
      if (!player) return null;
      let best = null;
      let bestDistance = REVIVE_RANGE;
      for (const row of myRows()) {
        if (row.state !== 'downed') continue;
        const distance = Math.hypot(row.x - player.pos.x, row.z - player.pos.z);
        if (distance > bestDistance) continue;
        bestDistance = distance;
        best = row;
      }
      return best;
    }

    function renderPanel() {
      const mine = myRows();
      if (!enabled || !mine.length) {
        panel.style.display = 'none';
        return;
      }
      panel.style.display = 'flex';
      const html = mine.map(row => {
        const label = t(ROLE_KEYS[row.role] || row.role);
        const downed = row.state === 'downed';
        const color = '#' + (ROLE_COLORS[row.role] || 0xffffff).toString(16).padStart(6, '0');
        const width = Math.max(0, Math.min(100, Math.round(row.hp / row.maxHp * 100)));
        const state = downed
          ? (row.reviving ? (row.reviving.by === 'owner' ? t('squad.reviving') : t('squad.medicReviving')) : t('squad.downed'))
          : '';
        return '<div style="display:flex;align-items:center;gap:6px">' +
          '<span style="width:34px;color:' + color + '">' + label + '</span>' +
          '<span style="width:78px;height:6px;border-radius:3px;background:#ffffff22;overflow:hidden;display:inline-block">' +
          '<span style="display:block;height:100%;width:' + width + '%;background:' + color + '"></span></span>' +
          '<span style="opacity:.85">' + state + '</span></div>';
      }).join('');
      if (panel.innerHTML !== html) panel.innerHTML = html;
    }

    function renderPrompt() {
      const target = enabled ? nearestDowned() : null;
      if (!target) {
        prompt.style.display = 'none';
        return;
      }
      const label = t(ROLE_KEYS[target.role] || target.role);
      const message = target.reviving && target.reviving.by === 'owner'
        ? t('squad.reviving')
        : t('squad.revivePrompt', { name: label });
      if (prompt.textContent !== message) prompt.textContent = message;
      prompt.style.display = 'block';
    }

    function update(dt) {
      for (const row of rows) {
        let entry = members.get(row.id);
        if (!entry) {
          entry = create(row);
          members.set(row.id, entry);
          entry.model.position.set(row.x, row.y, row.z);
        }
        const model = entry.model;
        const mix = 1 - Math.exp(-dt * 12);
        model.position.x += (row.x - model.position.x) * mix;
        model.position.y += (row.y - model.position.y) * mix;
        model.position.z += (row.z - model.position.z) * mix;
        const turn = row.yaw - model.rotation.y;
        model.rotation.y += Math.atan2(Math.sin(turn), Math.cos(turn)) * mix;
        const downed = row.state === 'downed';
        model.rotation.z += ((downed ? Math.PI / 2 : 0) - model.rotation.z) * mix;
        model.position.y += (downed ? -.35 : 0);
        entry.light.visible = downed;
        if (downed) entry.light.position.y = 1.9;
      }
      renderPanel();
      renderPrompt();
    }

    function shot(message) {
      if (!message || !message.origin || !message.dir) return;
      pointer.set(message.origin.x, message.origin.y, message.origin.z);
      const dir = new THREE.Vector3(message.dir.x, message.dir.y, message.dir.z);
      const end = pointer.clone().addScaledVector(dir, 46);
      game.fx?.tracer?.(pointer, end);
    }

    function notice(message) {
      if (!message) return;
      if (message.kind === 'downed') game.toast?.(t('squad.memberDown', { name: t(ROLE_KEYS[message.role] || message.role) }));
      if (message.kind === 'revived') game.toast?.(t('squad.memberRevived', { name: t(ROLE_KEYS[message.role] || message.role) }));
    }

    // 断线重连后 id 会变，需要重新把开关状态同步给服务端。
    let sentId = '';
    function sendMode(force) {
      const mp = window.__mp;
      if (!mp?.send || !mp.joined) return;
      const id = mp.id || '';
      if (!force && sentId === id) return;
      sentId = id;
      mp.send({ type: 'squadMode', enabled });
    }

    function ensureSettingRow() {
      const pane = document.querySelector('.panel-b[data-pane="settings"]');
      if (!pane || pane.querySelector('[data-act="squadEnabled"]')) return;
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = '<label id="l-squad">' + t('squad.toggle') + '</label>' +
        '<button class="toggle" data-act="squadEnabled" aria-labelledby="l-squad" aria-pressed="false">' +
        '<i></i><span>' + t('squad.off') + '</span></button>';
      pane.insertBefore(row, pane.firstChild);
    }

    function refreshToggle() {
      const button = document.querySelector('[data-act="squadEnabled"]');
      if (!button) return;
      button.setAttribute('aria-pressed', String(enabled));
      const state = button.querySelector('span');
      if (state) state.textContent = t(enabled ? 'squad.on' : 'squad.off');
    }

    document.addEventListener('click', (event) => {
      const button = event.target && event.target.closest && event.target.closest('[data-act="squadEnabled"]');
      if (!button) return;
      event.preventDefault();
      enabled = !enabled;
      persist(enabled);
      refreshToggle();
      sendMode(true);
    }, true);

    document.addEventListener('keydown', (event) => {
      if (event.code !== 'KeyE' || event.repeat) return;
      if (!enabled) return;
      const boat = document.getElementById('sail-interact');
      if (boat && !boat.hidden) return;
      const target = nearestDowned();
      if (!target) return;
      window.__mp?.send?.({ type: 'squadRevive', id: target.id });
    }, true);

    const refresh = () => {
      ensureSettingRow();
      refreshToggle();
      sendMode();
    };
    document.addEventListener('DOMContentLoaded', refresh);
    window.addEventListener('pageshow', refresh);
    refresh();
    window.setInterval(refresh, 400);
    sendMode();

    return { snapshot, update, shot, notice, enabled: () => enabled };
  };
})();