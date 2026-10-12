// Smoke test: starts the server, signs up, makes a character, joins the world and chats.
//   node tools/smoke.mjs            one process on a throwaway SQLite database (ROLE=all)
//   node tools/smoke.mjs cluster    a gateway and two realm layers on DATABASE_URL (Postgres);
//                                   two players land on different layers, and world chat and a
//                                   whisper cross between them
// Exits 0 when everything worked. (`npm test` runs the first; CI runs both.)
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomChoice } from '../src/models/heroLooks.js';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const cluster = process.argv[2] === 'cluster';
const BASE = 18000 + Math.floor(Math.random() * 1000);
// Character names are unique for good, so each run's carry a tag (letters: names are words).
const TAG = [...String(Date.now() % 1e5)].map((d) => 'abcdefghij'[d]).join('');
const children = [];
const dataDir = mkdtempSync(path.join(tmpdir(), 'celblade-smoke-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function start(env, label) {
  const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/main.js'], {
    cwd: ROOT, env: { ...process.env, BACKUP_HOURS: '0', LOG_FORMAT: 'text', ...env }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.log = '';
  child.stdout.on('data', (d) => { child.log += d; });
  child.stderr.on('data', (d) => { child.log += d; });
  child.label = label;
  children.push(child);
  return child;
}

async function up(port) {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`http://127.0.0.1:${port}/healthz`)).ok) return; } catch { /* not yet */ }
    await sleep(100);
  }
  throw new Error(`nothing listening on ${port}`);
}

const check = (ok, what) => { if (!ok) throw new Error(what); console.log(`  ✓ ${what}`); };

async function api(port, method, p, body, token) {
  const res = await fetch(`http://127.0.0.1:${port}${p}`, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, ...(await res.json().catch(() => ({}))) };
}

// A player: an account, a character, and a connection that collects what it's sent.
async function player(port, name) {
  const account = `smoke_${name.toLowerCase()}`;
  const reg = await api(port, 'POST', '/api/register', { name: account, password: 'smoke-test-password' });
  check(reg.status === 200 && reg.token, `${name}: account created`);
  const made = await api(port, 'POST', '/api/characters', { name, look: randomChoice() }, reg.token);
  check(made.status === 200 && made.character?.id, `${name}: character created`);
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const got = [];
  ws.onmessage = (e) => got.push(JSON.parse(e.data));
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = () => reject(new Error(`${name}: no connection`)); });
  ws.send(JSON.stringify({ t: 'auth', token: reg.token, character: made.character.id }));
  const until = async (pred, what, ms = 8000) => {
    for (let t = 0; t < ms; t += 50) {
      const m = got.find(pred);
      if (m) return m;
      await sleep(50);
    }
    throw new Error(`${name}: ${what} never came`);
  };
  const welcome = await until((m) => m.t === 'welcome' || m.t === 'error', 'a welcome');
  check(welcome.t === 'welcome', `${name}: in the world${welcome.layer !== null && welcome.layer !== undefined ? ` (layer ${welcome.layer + 1})` : ''}`);
  return { name, ws, got, until, welcome, say: (text) => ws.send(JSON.stringify({ t: 'chat', text })) };
}

async function run() {
  console.log(cluster ? 'Smoke test: gateway + 2 layers on Postgres' : 'Smoke test: one process on SQLite');
  let port;
  if (cluster) {
    if (!process.env.DATABASE_URL) throw new Error('cluster mode needs DATABASE_URL');
    const key = 'smoke-internal-key';
    for (let i = 0; i < 2; i++) start({ ROLE: 'realm', LAYER: String(i), PORT: String(BASE + 1 + i), LAYER_URL: `ws://127.0.0.1:${BASE + 1 + i}/ws`, INTERNAL_KEY: key, TRUST_PROXY: '1' }, `layer${i}`);
    start({ ROLE: 'gateway', PORT: String(BASE), INTERNAL_KEY: key, LAYER_SOFT_CAP: '1', LAYER_HARD_CAP: '4' }, 'gateway');
    port = BASE;
    await Promise.all([up(BASE), up(BASE + 1), up(BASE + 2)]);
    await sleep(1500); // the layers announce themselves
  } else {
    start({ ROLE: 'all', PORT: String(BASE), DATA_DIR: dataDir, DATABASE_URL: '' }, 'server');
    port = BASE;
    await up(BASE);
  }
  const status = await api(port, 'GET', '/api/status');
  check(status.online === true && Number.isInteger(status.seed), 'status answers');
  const a = await player(port, `Smokea${TAG}`);
  const b = await player(port, `Smokeb${TAG}`);
  if (cluster) check(a.welcome.layer !== b.welcome.layer, 'the two players are on different layers');
  a.say('hello from the smoke test');
  await b.until((m) => m.t === 'chat' && m.ch === 'world' && m.text === 'hello from the smoke test', 'world chat');
  check(true, 'world chat reaches the other player');
  a.say(`/w ${b.name} psst`);
  await b.until((m) => m.t === 'chat' && m.ch === 'whisper' && m.text === 'psst', 'a whisper');
  check(true, 'a whisper arrives');
  a.ws.send(JSON.stringify({ t: 'op', seq: 1, op: { op: 'filter', v: 2 } }));
  await a.until((m) => m.t === 'opr' && m.seq === 1, 'an op answer');
  check(true, 'the character answers ops');
  a.ws.close();
  b.ws.close();
}

let failed = false;
try {
  await run();
  console.log('PASS');
} catch (err) {
  failed = true;
  console.error(`FAIL: ${err.message}`);
  for (const c of children) console.error(`--- ${c.label}\n${c.log.slice(-2000)}`);
} finally {
  for (const c of children) c.kill('SIGTERM');
  await sleep(500);
  rmSync(dataDir, { recursive: true, force: true });
  process.exit(failed ? 1 : 0);
}
