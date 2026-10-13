// Smoke test: starts the server, signs up, makes a character, joins the world and chats — then
// stands by a camp of level 10 or more and checks its enemies (elites with their affixes) stream
// in and play back on the client's replicas, that Threat can't change mid-fight, that a new
// character has no talent points, and that the server notes where they've been (for
// achievements); and walks the other round Brightwater's services (a quest board's postings
// taken, a rest that restocks the fine stock, nothing done for someone out of reach).
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
import { WorldGen } from '../src/world/Gen.js';
import { generateDungeon } from '../src/world/DungeonGen.js';
import { DUNGEONS } from '../src/world/dungeons.js';
import { EnemyReplica } from '../src/net/EnemyReplica.js';

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

// A player at a camp of level 10+: its enemies (led by elites) stream in, every add builds a
// replica and every state plays back on it; Threat changes out of a fight but not in one.
async function horde(a, seed) {
  const opr = async (seq, op) => {
    a.ws.send(JSON.stringify({ t: 'op', seq, op }));
    return a.until((m) => m.t === 'opr' && m.seq === seq, `answer ${seq}`);
  };
  check((await opr(2, { op: 'threat', v: 1 })).ok, 'Threat changes out of a fight');
  check(!(await opr(4, { op: 'learn', id: 'v_edge' })).ok, 'no talent points at level 1');
  const gen = new WorldGen(seed);
  let camp = null;
  for (let ring = 3; ring < 14 && !camp; ring++) {
    for (let rx = -ring; rx <= ring && !camp; rx++) {
      for (let rz = -ring; rz <= ring && !camp; rz++) {
        if (Math.max(Math.abs(rx), Math.abs(rz)) === ring) camp = gen.region(rx, rz).pois.find((p) => p.type === 'camp' && !p.stronghold && p.level >= 10) ?? null;
      }
    }
  }
  check(!!camp, `a level ${camp?.level} camp to stand in`);
  const at = [camp.x, gen.baseHeight?.(camp.x, camp.z) ?? 0, camp.z];
  const send = () => a.ws.send(JSON.stringify({ t: 's', p: at, f: 0, v: [0, 0, 0], gr: 1, st: 'move', sT: 0, ci: 0, aq: 0, fl: 0, hp: 1 }));
  const replicas = new Map();
  let states = 0;
  let visits = 0;
  const seen = (pred, ms = 15000) => new Promise((resolve, reject) => {
    const t0 = Date.now();
    const tick = setInterval(() => {
      send();
      for (const m of a.got.splice(0)) {
        if (m.t === 'sop' && m.op?.op === 'visit') visits++;
        if (m.t !== 'snap') continue;
        for (const e of m.ea ?? []) replicas.set(e.id, new EnemyReplica(e, m.ts));
        for (const s of m.es ?? []) {
          const r = replicas.get(s[0]);
          if (!r) continue;
          r.push(m.ts, s);
          r.update(m.ts);
          states++;
        }
      }
      if (pred()) { clearInterval(tick); resolve(); } else if (Date.now() - t0 > ms) { clearInterval(tick); reject(new Error('the camp never showed up')); }
    }, 70);
  });
  await seen(() => [...replicas.values()].some((r) => r.elite && r.affixes.length) && states > 20);
  const elites = [...replicas.values()].filter((r) => r.elite);
  check(true, `${replicas.size} enemies stream in and play back (${states} states), ${elites.length} of them elites: ${elites.map((r) => `${r.displayName} [${r.affixes.join(', ')}]${r.champion ? ' (champion)' : ''}`).join('; ')}`);
  await seen(() => [...replicas.values()].some((r) => r.engaged && r.foe === a.welcome.id));
  check(!(await opr(3, { op: 'threat', v: 0 })).ok, 'Threat stays put mid-fight');
  await seen(() => visits > 0);
  check(visits > 0, `the server noted where they went (${visits} visit${visits === 1 ? '' : 's'})`);
}

// A player round Brightwater (a town since gameplay phase 3): the server finds its folk and quest
// board by id and checks the player stands with them.
async function services(b, seed) {
  let seq = 100;
  const opr = async (op) => {
    const s = ++seq;
    b.ws.send(JSON.stringify({ t: 'op', seq: s, op }));
    return b.until((m) => m.t === 'opr' && m.seq === s, `answer ${s}`);
  };
  const gen = new WorldGen(seed);
  const hub = gen.region(0, 0).pois.find((p) => p.type === 'hub');
  const stand = async (x, z) => {
    for (let i = 0; i < 4; i++) {
      b.ws.send(JSON.stringify({ t: 's', p: [x, gen.height(x, z), z], f: 0, v: [0, 0, 0], gr: 1, st: 'move', sT: 0, ci: 0, aq: 0, fl: 0, hp: 1 }));
      await sleep(120);
    }
  };
  const before = (n) => [n.x + Math.sin(n.facing) * 1.6, n.z + Math.cos(n.facing) * 1.6];
  const board = hub.npcs.find((n) => n.role === 'board');
  await stand(...before(board));
  const posted = await opr({ op: 'talk', npc: board.id });
  check(posted.ok && posted.roll?.offers?.length === 3 && posted.roll.offers.every((q) => q?.giver?.startsWith(`${board.id}#`)), `Brightwater's quest board has three postings: ${posted.roll?.offers?.map((q) => q?.title).join(', ')}`);
  check((await opr({ op: 'accept', id: posted.roll.offers[0].id })).ok, 'one of them taken at the board');
  check(!(await opr({ op: 'talk', npc: 'n:300,300:t0' })).ok, 'no talking to someone across the world');
  const smith = hub.npcs.find((n) => n.role === 'smith');
  await stand(...before(smith));
  check(!(await opr({ op: 'rest', at: smith.id })).ok, 'a smith keeps no beds');
  await stand(1, 3);
  const rest = await opr({ op: 'rest' });
  check(rest.ok && rest.roll?.stock?.length > 0 && rest.roll?.fine?.length > 0, 'a rest at the reactor restocks the traders, fine stock and all');
  // Down into a dungeon through Brightwater's waygate (gameplay phase 5), and out by its portal.
  const waygate = hub.npcs.find((n) => n.role === 'gate' && n.gate === 'dungeon');
  check(!(await opr({ op: 'enter', d: 'foundry', mode: 'run', tier: 0, via: 'gate' })).ok, 'no going down from away from a way in');
  await stand(...before(waygate));
  const down = await opr({ op: 'enter', d: 'foundry', mode: 'run', tier: 0, via: 'gate' });
  const run = down.roll?.run;
  const st = run && await b.until((m) => m.t === 'dun' && m.id === run.id, 'the copy\'s state');
  check(down.ok && run?.d === 'foundry' && down.roll.at[0] > 50000 && !!st?.st, `down into a private copy of the Rustjaw Foundry through the waygate (at ${down.roll?.at?.map(Math.round).join(', ')})`);
  const L = generateDungeon(DUNGEONS.foundry, { shuffle: run.sh, level: run.lv });
  const portal = L.things.find((t) => t.kind === 'portal');
  const px = run.o[0] + portal.x + 0.6;
  const pz = run.o[2] + portal.z;
  for (let i = 0; i < 4; i++) {
    b.ws.send(JSON.stringify({ t: 's', p: [px, run.o[1] + portal.floor, pz], f: 0, v: [0, 0, 0], gr: 1, st: 'move', sT: 0, ci: 0, aq: 0, fl: 0, hp: 1 }));
    await sleep(120);
  }
  const up = await opr({ op: 'leave' });
  check(up.ok && Math.hypot(up.roll.at[0] - waygate.x, up.roll.at[2] - waygate.z) < 4, 'out by its portal, back at the waygate (the same layout on both sides)');
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
  check(typeof status.build === 'string' && status.stale === false, `status names the build it runs (${status.build}) and it's current`);
  await services(b, status.seed);
  if (!cluster) await horde(a, status.seed);
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
