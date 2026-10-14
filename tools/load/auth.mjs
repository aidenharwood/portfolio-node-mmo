// Load test: accounts. Signs up --accounts new accounts, then signs them in over and over from
// --concurrency connections for --duration seconds, each sign-in followed by a character list.
// Passwords are hashed with scrypt, so this is the server's processor-heaviest request.
//   npm run load:auth [-- [url] [--accounts=20] [--concurrency=10] [--duration=15]]
// A server allows 10 sign-ins and sign-ups a minute from one address unless started with
// AUTH_LIMIT raised (a throwaway server started for the run has it raised): against one that
// hasn't, this mostly shows the limit turning requests away (429). It leaves its accounts behind.
import { randomBytes } from 'node:crypto';
import { options, target, wait, stopped, Timings, serverStats, reportErrors } from './lib.mjs';

const opts = options('npm run load:auth [-- [url] [options]]  — sign-ups and sign-ins against the server', {
  accounts: 20, concurrency: 10, duration: 15,
});
const server = await target(opts.url);
const run = Date.now().toString(36).slice(-6);
const password = randomBytes(12).toString('base64url');
const codes = {};
const signUp = new Timings();
const signIn = new Timings();
const list = new Timings();

async function post(path, body, token, method = 'POST') {
  const t0 = performance.now();
  let status;
  let json = {};
  try {
    const res = await fetch(server.base + path, {
      method, signal: AbortSignal.timeout(15_000),
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    status = res.status;
    json = await res.json().catch(() => ({}));
  } catch (err) {
    status = err.cause?.code ?? err.name;
  }
  codes[`${path} ${status}`] = (codes[`${path} ${status}`] ?? 0) + 1;
  return { status, ms: performance.now() - t0, ...json };
}

console.log(`Accounts: ${opts.accounts} sign-ups, then ${opts.duration} s of sign-ins from ${opts.concurrency} connections → ${server.base}`);
const names = [];
const queue = Array.from({ length: opts.accounts }, (_, i) => `load_${run}_${i}`);
await Promise.all(Array.from({ length: opts.concurrency }, async () => {
  for (let name; (name = queue.shift()) && !stopped();) {
    const r = await post('/api/register', { name, password });
    if (r.status === 200) { signUp.add(r.ms); names.push(name); }
  }
}));
console.log(`  ${names.length} of ${opts.accounts} signed up · ${signUp}`);

const t0 = performance.now();
let running = names.length > 0;
let logins = 0;
const workers = Array.from({ length: opts.concurrency }, async (_, w) => {
  for (let k = w; running; k++) {
    const r = await post('/api/login', { name: names[k % names.length], password });
    if (r.status !== 200) { await wait(200); continue; } // turned away: don't spin
    signIn.add(r.ms);
    logins++;
    const l = await post('/api/characters', null, r.token, 'GET');
    if (l.status === 200) list.add(l.ms);
  }
});
for (let s = 0, last = 0, lastAt = t0; running && s < opts.duration && !stopped(); s += 5) {
  await wait(Math.min(5, opts.duration - s) * 1000);
  const now = performance.now();
  console.log(`  ${Math.round((now - t0) / 1000)} s: ${((logins - last) / ((now - lastAt) / 1000)).toFixed(1)} sign-ins/s`);
  last = logins;
  lastAt = now;
}
running = false;
await Promise.all(workers);
const secs = (performance.now() - t0) / 1000;

console.log(`\n${logins} sign-ins in ${secs.toFixed(1)} s: ${(logins / secs).toFixed(1)} a second`);
console.log(`  sign-up         ${signUp}`);
console.log(`  sign-in         ${signIn}`);
console.log(`  character list  ${list}`);
console.log(`  responses       ${Object.entries(codes).map(([k, n]) => `${k} ×${n}`).join(' · ')}`);
const limited = Object.entries(codes).filter(([k]) => k.endsWith(' 429')).reduce((a, [, n]) => a + n, 0);
if (limited) console.log(`  ${limited} turned away by the sign-in limit (429): for a local server, start it with AUTH_LIMIT=1000`);
const st = await serverStats(server.base);
if (st.rss_bytes) console.log(`  server: ${Math.round(st.rss_bytes / 1048576)} MB resident, ${st.cpu_seconds_total?.toFixed(1)} s of processor so far`);
const errors = reportErrors(server);
await server.stop();
process.exit(names.length === opts.accounts && !errors ? 0 : 1);
