// Load test: simulated players. Each signs in to an account and character of its own (made the
// first time), joins the world and jogs a loop somewhere within --spread metres of the hub,
// sending its state 15 times a second, shooting now and then and pinging the server. They join
// --join-rate a second; once all are in, they play for --duration seconds.
//   npm run load:players [-- [url] [--bots=20] [--duration=60] [--join-rate=5] [--spread=300] [--chat=0]]
// Reports how long signing in and getting into the world took, ping round trips, what each
// player receives (snapshots, bytes on the wire), disconnects, and the server's tick times.
// Accounts are <prefix>_aaa, <prefix>_aab, …; their passwords come from a secret kept in
// .load-data/ with their session tokens, so later runs against the same server sign straight
// back in (a server allows 10 sign-ins a minute from one address unless AUTH_LIMIT is raised).
import WebSocket from 'ws';
import { createHmac, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { options, target, wait, sleep, stopped, Timings, serverStats, reportErrors, ROOT } from './lib.mjs';
import { WorldGen, HUB } from '../../src/world/Gen.js';
import { randomChoice } from '../../src/models/heroLooks.js';

const opts = options('npm run load:players [-- [url] [options]]  — simulated players in the world', {
  bots: 20, duration: 60, joinRate: 5, spread: 300, rate: 15, chat: 0, prefix: 'Loadbot',
});
if (!/^[A-Z][a-z]{2,10}$/.test(opts.prefix)) throw new Error('--prefix wants a capitalised word of 3–11 letters');
const server = await target(opts.url);
const WS_URL = `${server.base.replace(/^http/, 'ws')}/ws`;

// Passwords and session tokens, kept between runs (a throwaway server's die with it).
const CREDS = path.join(ROOT, '.load-data', 'players.json');
const creds = existsSync(CREDS) ? JSON.parse(readFileSync(CREDS, 'utf8')) : { secret: randomBytes(24).toString('base64url'), tokens: {} };
const saveCreds = () => { if (!server.throwaway) { mkdirSync(path.dirname(CREDS), { recursive: true }); writeFileSync(CREDS, JSON.stringify(creds, null, 1)); } };
const password = (account) => createHmac('sha256', creds.secret).update(account).digest('base64url').slice(0, 24);

const suffix = (i) => [676, 26, 1].map((d) => String.fromCharCode(97 + (Math.floor(i / d) % 26))).join('');
const tally = (map, k) => map.set(k, (map.get(k) ?? 0) + 1);
const signInT = new Timings();
const welcomeT = new Timings();
// Ping round trips: while bots are joining (until 5 s after the last is in), then settled.
const joiningRtt = new Timings();
const settledRtt = new Timings();
let rtt = joiningRtt;
let ping = new Timings(); // this progress line's
const failures = new Map();
const closes = new Map();
const totals = { snaps: 0, bytes: 0, wire: 0, corrections: 0 };
const bots = [];
let ending = false;

async function api(method, p, body, token) {
  const res = await fetch(server.base + p, {
    method, signal: AbortSignal.timeout(15_000),
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, ...(await res.json().catch(() => ({}))) };
}

let warned = false;
async function signIn(account, name) {
  const key = `${server.base}|${account}`;
  let token = creds.tokens[key];
  let list = token && await api('GET', '/api/characters', null, token);
  if (list?.status !== 200) {
    for (let tries = 0; ; tries++) {
      let auth = await api('POST', '/api/login', { name: account, password: password(account) });
      if (auth.status === 401) auth = await api('POST', '/api/register', { name: account, password: password(account) });
      if (auth.status === 200) { token = auth.token; break; }
      if (auth.status === 409) throw new Error('sign-in: the account exists with another password (made elsewhere, or .load-data/ lost?): try another --prefix');
      if (auth.status !== 429 || tries >= 30 || stopped()) throw new Error(`sign-in: ${auth.error ?? auth.status}`);
      if (!warned) { warned = true; console.log('  (sign-ins rate limited: waiting it out; for a local server, start it with AUTH_LIMIT=1000)'); }
      await wait(5000 + Math.random() * 2000);
    }
    creds.tokens[key] = token;
    list = await api('GET', '/api/characters', null, token);
  }
  let ch = list.characters?.find((c) => c.name === name);
  if (!ch) {
    const made = await api('POST', '/api/characters', { name, look: randomChoice() }, token);
    if (made.status !== 200) throw new Error(`character: ${made.error ?? made.status}${made.status === 409 ? ' (try another --prefix)' : ''}`);
    ch = made.character;
  }
  return { token, ch };
}

async function bot(i) {
  const name = `${opts.prefix}${suffix(i)}`;
  const t0 = performance.now();
  const { token, ch } = await signIn(`${opts.prefix.toLowerCase()}_${suffix(i)}`, name);
  signInT.add(performance.now() - t0);
  const b = { name, ws: null, socket: null, timers: [], snaps: 0, bytes: 0, in: false };
  bots.push(b);
  const t1 = performance.now();
  const ws = b.ws = new WebSocket(WS_URL);
  ws.on('upgrade', (res) => { b.socket = res.socket; });
  ws.on('open', () => ws.send(JSON.stringify({ t: 'auth', token, character: ch.id })));
  ws.on('error', (err) => tally(failures, `socket: ${err.message}`));
  const welcomed = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('no welcome in 20 s')), 20_000);
    ws.on('close', (code, reason) => {
      clearTimeout(timeout);
      for (const t of b.timers) clearInterval(t);
      if (!ending) tally(closes, `${code}${reason.length ? ` ${reason}` : ''}`);
      reject(new Error(`closed ${code} before the welcome`));
    });
    ws.on('message', (data) => {
      b.bytes += data.length;
      const msg = JSON.parse(data);
      if (msg.t === 'snap') b.snaps++;
      else if (msg.t === 'pong') { rtt.add(Date.now() - msg.c); ping.add(Date.now() - msg.c); }
      else if (msg.t === 'pos') totals.corrections++;
      else if (msg.t === 'error') tally(failures, msg.error);
      else if (msg.t === 'welcome') {
        clearTimeout(timeout);
        welcomeT.add(performance.now() - t1);
        b.in = true;
        play(b, i, msg);
        resolve();
      }
    });
  });
  await welcomed;
}

// A loop of radius 7 m round a spot of its own; ranged bots fire bursts (as tools/bot.mjs does).
function play(b, i, welcome) {
  const { ws } = b;
  const gen = new WorldGen(welcome.seed);
  const type = ['rifle', 'pistol', 'smg', 'sword', 'staff'][i % 5];
  const ranged = i % 5 < 3;
  ws.send(JSON.stringify({ t: 'profile', lv: 5, w: { kind: 'weapon', seed: 4242 + i, level: 5, type, rarity: 'rare' }, a: {} }));
  const a0 = Math.random() * Math.PI * 2;
  const r0 = Math.sqrt(Math.random()) * opts.spread;
  const cx = HUB.x + Math.cos(a0) * r0;
  const cz = HUB.z + Math.sin(a0) * r0;
  const step = 1 / opts.rate;
  let t = Math.random() * 10;
  b.timers.push(setInterval(() => {
    t += step;
    const a = t * 0.55;
    const x = cx + Math.cos(a) * 7;
    const z = cz + Math.sin(a) * 7;
    const v = [-Math.sin(a) * 3.85, 0, Math.cos(a) * 3.85];
    const f = Math.atan2(v[0], v[2]);
    const y = gen.height(x, z);
    const firing = ranged && t % 6 < 1.2;
    ws.send(JSON.stringify({ t: 's', p: [x, y, z], f, v, gr: 1, st: 'move', sT: 0, ci: 0, aq: 0, fl: firing ? 4 : 0, ay: 0, cy: f, hp: 1 }));
    if (firing && Math.round(t / step) % 2 === 0) {
      const d = [Math.sin(f), 0.02, Math.cos(f)];
      ws.send(JSON.stringify({ t: 'fx', list: [{ k: 'shot', o: [x + d[0] * 0.8, y + 1.45, z + d[2] * 0.8], d, pk: 'bullet', c: 0xffd8a0, sp: 400, lf: 0.8, gv: 9.8, wt: type, m: true }] }));
    }
  }, step * 1000));
  b.timers.push(setInterval(() => ws.send(JSON.stringify({ t: 'ping', c: Date.now() })), 1000));
  if (opts.chat > 0) b.timers.push(setInterval(() => ws.send(JSON.stringify({ t: 'chat', text: `load test chatter from ${b.name}` })), opts.chat * 1000));
}

// What the players have received since the last call (snapshots, decompressed and wire bytes).
function take() {
  let snaps = 0; let bytes = 0; let wire = 0;
  for (const b of bots) {
    snaps += b.snaps; bytes += b.bytes; b.snaps = 0; b.bytes = 0;
    const read = b.socket?.bytesRead ?? 0;
    wire += read - (b.wireSeen ?? 0);
    b.wireSeen = read;
  }
  totals.snaps += snaps; totals.bytes += bytes; totals.wire += wire;
  return { snaps, bytes, wire };
}

console.log(`Players: ${opts.bots} bots joining ${opts.joinRate}/s, then ${opts.duration} s in the world → ${server.base}`);
const joins = [];
for (let i = 0; i < opts.bots && !stopped(); i++) {
  joins.push(bot(i).catch((err) => tally(failures, err.message)));
  await wait(1000 / opts.joinRate);
}
await Promise.all(joins);
saveCreds();
const online = () => bots.filter((b) => b.in && b.ws.readyState === WebSocket.OPEN).length;
console.log(`  ${online()} of ${opts.bots} in the world · sign-in ${signInT} · into the world ${welcomeT}`);

take();
const before = await serverStats(server.base);
const t0 = performance.now();
const worst = { p50: 0, p95: 0, max: 0 }; // the server's tick times (ms), worst seen
for (let s = 0, lastAt = t0; s < opts.duration && !stopped(); s += 5) {
  ping = new Timings();
  await wait(Math.min(5, opts.duration - s) * 1000);
  const now = performance.now();
  const secs = (now - lastAt) / 1000;
  lastAt = now;
  rtt = settledRtt;
  const got = take();
  const n = Math.max(1, online());
  const st = await serverStats(server.base);
  worst.p50 = Math.max(worst.p50, st.tickMs ?? 0);
  worst.p95 = Math.max(worst.p95, st.tick_ms_p95 ?? 0);
  worst.max = Math.max(worst.max, st.tick_ms_max ?? 0);
  const tick = st.tick_ms_p95 !== undefined ? `tick p50 ${st.tickMs} p95 ${st.tick_ms_p95} ms` : `tick p50 ${st.tickMs} ms`;
  console.log(`  ${Math.round((now - t0) / 1000)} s: ${online()} online · ${(got.snaps / n / secs).toFixed(1)} snaps/s each · ${(got.wire / n / secs / 1024).toFixed(1)} KB/s each on the wire · ping p50 ${Math.round(ping.pct(50))} ms p95 ${Math.round(ping.pct(95))} ms${st.tickMs !== undefined ? ` · server: ${st.players} players, ${st.enemies} enemies, ${tick}` : ''}`);
}
take();
const secs = (performance.now() - t0) / 1000;
const after = await serverStats(server.base);
const ok = online();
ending = true;
for (const b of bots) b.ws.close(1000, 'load test over');
await sleep(500);

const n = Math.max(1, ok);
console.log(`\n${ok} of ${opts.bots} bots stayed in for ${secs.toFixed(0)} s`);
console.log(`  sign-in        ${signInT}`);
console.log(`  into world     ${welcomeT}`);
console.log(`  ping, joining  ${joiningRtt}`);
console.log(`  ping, settled  ${settledRtt}`);
console.log(`  each received  ${(totals.snaps / n / secs).toFixed(1)} snapshots/s, ${(totals.wire / n / secs / 1024).toFixed(1)} KB/s on the wire (${(totals.bytes / n / secs / 1024).toFixed(1)} KB/s of JSON)`);
if (totals.corrections) console.log(`  position corrections: ${totals.corrections}`);
if (worst.p50) console.log(`  server tick    worst p50 ${worst.p50} ms${worst.p95 ? `, worst p95 ${worst.p95} ms, slowest ${worst.max} ms` : ''} (budget 50 ms)`);
if (after.cpu_seconds_total && before.cpu_seconds_total) console.log(`  server process ${((after.cpu_seconds_total - before.cpu_seconds_total) / secs).toFixed(2)} cores, ${Math.round(after.rss_bytes / 1048576)} MB resident`);
for (const [what, map] of [['failed', failures], ['disconnected', closes]]) for (const [k, v] of map) console.log(`  ${what}: ${k} ×${v}`);
const errors = reportErrors(server);
await server.stop();
process.exit(ok === opts.bots && !closes.size && !errors ? 0 : 1);
