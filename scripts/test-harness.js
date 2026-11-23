'use strict';

/**
 * 端到端自测公共脚手架：拉起一台真实服务端 + 极简 WS 客户端。
 *
 * 服务端用独立的 DATA_DIR 与随机端口启动，避免污染仓库里的 data/ 目录，
 * 也不会和已经在跑的实例抢端口。
 */

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { WebSocket } = require('ws');

const ROOT = path.join(__dirname, '..');
const clients = new Set();

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function startServer(env = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'salt-selftest-'));
  let port = Number(env.PORT) || 3400 + Math.floor(Math.random() * 800);
  let child = null;
  let output = '';
  for (let attempt = 0; attempt < 6 && !child; attempt += 1) {
    child = spawn(process.execPath, ['index.js'], {
      cwd: ROOT,
      env: {
        ...process.env,
        PORT: String(port),
        HOST: '127.0.0.1',
        DATA_DIR: dataDir,
        ...env
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const ready = await new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), 12000);
      const onData = (chunk) => {
        output += String(chunk);
        if (output.includes('Multiplayer WebSocket ready')) {
          clearTimeout(timer);
          child.stdout.off('data', onData);
          resolve(true);
        }
      };
      child.stdout.on('data', onData);
      child.stderr.on('data', chunk => { output += String(chunk); });
      child.on('exit', () => { clearTimeout(timer); resolve(false); });
    });
    if (ready) break;
    child.kill();
    child = null;
    port += 1;
  }
  if (!child) throw new Error('服务端启动失败:\n' + output);
  return {
    port,
    url: 'ws://127.0.0.1:' + port + '/ws',
    output: () => output,
    async stop() {
      try { child.kill(); } catch (error) { /* ignore */ }
      await delay(150);
      try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch (error) { /* ignore */ }
    }
  };
}

function connect(url, name) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const messages = [];
    const waiters = [];
    const timer = setTimeout(() => reject(new Error(name + ' 连接超时')), 8000);
    ws.on('open', () => {
      clearTimeout(timer);
      clients.add(ws);
      resolve({
        ws,
        messages,
        send(payload) { ws.send(JSON.stringify(payload)); },
        waitFor(type, predicate, timeout = 6000) {
          const index = messages.findIndex((message) => (
            message.type === type && (!predicate || predicate(message))
          ));
          if (index >= 0) {
            const found = messages[index];
            messages.splice(index, 1);
            return Promise.resolve(found);
          }
          return new Promise((resolveWait, rejectWait) => {
            const waiter = { type, predicate, resolve: resolveWait, reject: rejectWait };
            waiter.timer = setTimeout(() => {
              const at = waiters.indexOf(waiter);
              if (at >= 0) waiters.splice(at, 1);
              rejectWait(new Error(name + ' 等待 ' + type + ' 超时'));
            }, timeout);
            waiters.push(waiter);
          });
        },
        has(type, predicate) {
          return messages.some((message) => (
            message.type === type && (!predicate || predicate(message))
          ));
        },
        clear() { messages.length = 0; }
      });
    });
    ws.on('error', reject);
    ws.on('message', (raw) => {
      let message;
      try {
        message = JSON.parse(String(raw));
      } catch (error) {
        return;
      }
      messages.push(message);
      for (let i = waiters.length - 1; i >= 0; i -= 1) {
        const waiter = waiters[i];
        if (message.type !== waiter.type || (waiter.predicate && !waiter.predicate(message))) continue;
        waiters.splice(i, 1);
        clearTimeout(waiter.timer);
        waiter.resolve(message);
      }
    });
  });
}

function closeAll() {
  for (const ws of clients) {
    try { ws.close(); } catch (error) { /* ignore */ }
  }
  clients.clear();
}

// 上报坐标：服务端以客户端位置为准（带移动预算保护）。
function state(pos, yaw = 0) {
  return {
    type: 'state',
    pos: { x: pos.x, y: pos.y, z: pos.z },
    yaw,
    pitch: 0,
    active: true,
    visible: true,
    moving: false,
    sprint: false
  };
}

module.exports = { startServer, connect, closeAll, state, delay };