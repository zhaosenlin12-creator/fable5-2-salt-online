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
  // 队友直接复用玩家那套骨骼士兵模型（hunter / female-soldier），
  // 只按兵种换配色，不再用一堆方块拼人。
  const ROLE_PALETTES = {
    assault: { jacket: '#2f7fd0', pants: '#22303f', trim: '#8fd8ff', boots: '#171c22' },
    sniper: { jacket: '#c08a2e', pants: '#3a3226', trim: '#ffd166', boots: '#1e1b15' },
    medic: { jacket: '#2f9a63', pants: '#1f3329', trim: '#9dffc4', boots: '#15201b' }
  };
  const ROLE_KINDS = { assault: 'male', sniper: 'male', medic: 'female' };
  const REVIVE_RANGE = 3.4;
  const BODY_PIVOT = .92;   // 倒地时绕身体中心翻转，避免整个人绕脚后仰倒
  const DOWNED_DROP = .77;  // 倒地后整体下沉，贴合地面

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

  // 材质分区：决定队友身上哪块用兵种主色。
  function roleChannel(mesh, material) {
    const name = String((material && material.name) || '').toLowerCase();
    const meshName = String((mesh && mesh.name) || '').toLowerCase();
    if (/skin|hair|brow|beard|eye|visor/.test(name)) return null;
    if (/feet|boot/.test(meshName)) return 'boots';
    if (/legs/.test(meshName)) return 'pants';
    if (/grey|brown/.test(name)) return 'trim';
    return 'jacket';
  }

  function applyRolePalette(model, palette) {
    if (!model || !model.traverse || !palette) return;
    const cache = new Map();
    model.traverse((mesh) => {
      if (!mesh.isMesh || !mesh.material) return;
      // 武器保持出厂配色，整把枪被染成兵种色太扎眼。
      let weapon = false;
      mesh.traverseAncestors(node => { if (node.userData && node.userData.soldierWeapon) weapon = true; });
      if (weapon) return;
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const next = list.map((material) => {
        const channel = roleChannel(mesh, material);
        if (!channel || !material.color) return material;
        const key = material.uuid + ':' + channel;
        if (!cache.has(key)) {
          const copy = material.clone();
          copy.color.set(palette[channel] || palette.jacket);
          if (copy.emissive) copy.emissive.set(0x000000);
          cache.set(key, copy);
        }
        return cache.get(key);
      });
      mesh.material = Array.isArray(mesh.material) ? next : next[0];
    });
  }

  window.installSquad = function (game) {
    const { THREE, scene } = game;
    const members = new Map();
    let rows = [];
    let map = '';
    let enabled = readEnabled();
    const pointer = new THREE.Vector3();

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

    // 模型没加载出来之前的兜底造型，避免队友凭空消失。
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
      mesh.position.y = 1.55;
      return mesh;
    }

    // 把真实骨骼士兵挂到队友身上。模型是异步加载的，失败就继续用方块兜底。
    function mountSoldier(entry) {
      if (entry.mounted || entry.pending || entry.failed || entry.disposed) return;
      const api = window.HunterAvatar;
      if (!api || typeof api.create !== 'function' || typeof api.whenReady !== 'function') return;
      entry.pending = true;
      const kind = entry.kind;
      const attach = (ok) => {
        entry.pending = false;
        if (entry.disposed || entry.mounted) return;
        if (!ok || !api.isReady(kind)) {
          entry.failed = true;
          return;
        }
        let avatar = null;
        try {
          avatar = api.create(kind, {});
        } catch (err) {
          console.warn('[squad] 士兵模型挂载失败，继续用兜底造型', err);
          entry.failed = true;
          return;
        }
        if (!avatar || !avatar.model) {
          entry.failed = true;
          return;
        }
        applyRolePalette(avatar.model, entry.palette);
        avatar.model.name = 'squad-soldier-' + entry.row.id;
        avatar.model.traverse(node => {
          if (!node.isMesh) return;
          node.castShadow = false;
          node.receiveShadow = true;
        });
        entry.holder.add(avatar.model);
        entry.model = avatar.model;
        entry.rig = avatar.rig;
        entry.mounted = true;
        if (entry.fallback) {
          entry.holder.remove(entry.fallback);
          entry.fallback.traverse(node => { if (node.isMesh) node.geometry.dispose(); });
          entry.fallback = null;
        }
      };
      api.whenReady(kind).then(attach).catch(() => attach(false));
    }

    function create(row) {
      const color = ROLE_COLORS[row.role] || 0xffffff;
      const root = new THREE.Group();
      root.name = 'squad-' + row.id;
      // tilt 绕身体中心翻转，holder 抵消位移，模型本身保持在脚底原点。
      const tilt = new THREE.Group();
      tilt.position.y = BODY_PIVOT;
      const holder = new THREE.Group();
      holder.position.y = -BODY_PIVOT;
      const fallback = body(color);
      holder.add(fallback);
      tilt.add(holder);
      root.add(tilt);
      const light = beacon(color);
      root.add(light);
      light.visible = false;
      scene.add(root);
      const entry = {
        root,
        tilt,
        holder,
        fallback,
        light,
        model: null,
        rig: null,
        row,
        kind: ROLE_KINDS[row.role] || 'male',
        palette: ROLE_PALETTES[row.role] || ROLE_PALETTES.assault,
        mounted: false,
        pending: false,
        failed: false,
        disposed: false,
        speed: 0
      };
      mountSoldier(entry);
      return entry;
    }

    function dispose(entry) {
      if (!entry) return;
      entry.disposed = true;
      entry.root.removeFromParent();
      if (entry.fallback) {
        entry.fallback.traverse(node => { if (node.isMesh) node.geometry.dispose(); });
        entry.fallback = null;
      }
      // 士兵模型是共享模板的克隆，geometry/material 归模板所有，不能在这里释放。
      if (entry.light) {
        entry.light.geometry.dispose();
        if (entry.light.material) entry.light.material.dispose();
      }
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
          entry.root.position.set(row.x, row.y, row.z);
        }
        if (!entry.mounted && !entry.failed) mountSoldier(entry);
        const root = entry.root;
        const mix = 1 - Math.exp(-dt * 12);
        const previousX = root.position.x;
        const previousZ = root.position.z;
        const downed = row.state === 'downed';
        root.position.x += (row.x - root.position.x) * mix;
        root.position.y += ((row.y - (downed ? DOWNED_DROP : 0)) - root.position.y) * mix;
        root.position.z += (row.z - root.position.z) * mix;
        const turn = row.yaw - root.rotation.y;
        root.rotation.y += Math.atan2(Math.sin(turn), Math.cos(turn)) * mix;
        entry.tilt.rotation.z += ((downed ? Math.PI / 2 : 0) - entry.tilt.rotation.z) * mix;
        entry.light.visible = downed;
        if (entry.rig) {
          // 用真实位移推算移动状态，驱动骨骼走路/奔跑动画。
          const moved = Math.hypot(root.position.x - previousX, root.position.z - previousZ);
          const speed = dt > 0 ? moved / dt : 0;
          entry.speed += (speed - entry.speed) * Math.min(1, dt * 8);
          entry.rig.update(dt, { moving: !downed && entry.speed > .12, sprint: entry.speed > 3.2 });
        }
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
