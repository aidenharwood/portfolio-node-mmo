// Shared bits for the load tests in tools/load: options, the server to aim at, and timings.
//   npm run load:<test> [-- [url] [--option=value ...]]     (--help lists a test's options)
// With no url, the server at http://localhost:8080 if one answers there, otherwise a throwaway one
// started for the run (its own temporary SQLite database, sign-in limit raised) and stopped after.
// A url (or LOAD_URL) aims at that server instead: local or remote, http(s).
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// `--name=value` options over `defaults` (each coerced to its default's type), and the url.
export function options(usage, defaults) {
  const opts = { ...defaults, url: process.env.LOAD_URL || null };
  for (const arg of process.argv.slice(2)) {
    const m = /^--([a-z][a-z-]*)(?:=(.*))?$/.exec(arg);
    if (!m) { opts.url = arg; continue; }
    const key = m[1].replace(/-(.)/g, (_, c) => c.toUpperCase());
    if (key === 'help') { console.log(`${usage}\n\nOptions (defaults):\n${Object.entries(defaults).map(([k, v]) => `  --${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}=${v}`).join('\n')}`); process.exit(0); }
    if (!(key in defaults)) throw new Error(`unknown option --${m[1]} (try --help)`);
    const d = defaults[key];
    opts[key] = typeof d === 'number' ? Number(m[2]) : typeof d === 'boolean' ? m[2] !== 'false' && m[2] !== '0' : (m[2] ?? '');
    if (typeof d === 'number' && !Number.isFinite(opts[key])) throw new Error(`--${m[1]} wants a number`);
  }
  return opts;
}

export async function healthy(base) {
  try { return (await fetch(`${base}/healthz`, { signal: AbortSignal.timeout(2000) })).ok; } catch { return false; }
}

// The server to test: { base, spawned, stop() }.
export async function target(url) {
  if (url) {
    const base = url.replace(/\/+$/, '').replace(/^ws/, 'http');
    if (!await healthy(base)) console.warn(`! ${base}/healthz isn't answering 200; carrying on anyway`);
    return { base, spawned: false, stop: async () => {} };
  }
  if (await healthy('http://localhost:8080')) return { base: 'http://localhost:8080', spawned: false, stop: async () => {} };
  const port = 18000 + Math.floor(Math.random() * 1000);
  const dir = mkdtempSync(path.join(tmpdir(), 'celblade-load-'));
  const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/main.js'], {
    cwd: ROOT,
    env: { ...process.env, ROLE: 'all', PORT: String(port), HOST: '127.0.0.1', DATA_DIR: dir, DATABASE_URL: '', AUTH_LIMIT: '100000', BACKUP_HOURS: '0', LOG_FORMAT: 'text' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  const keep = (d) => { out = (out + d).slice(-4000); };
  child.stdout.on('data', keep);
  child.stderr.on('data', keep);
  const base = `http://127.0.0.1:${port}`;
  const stop = async () => {
    child.kill('SIGTERM');
    await Promise.race([new Promise((r) => child.once('exit', r)), sleep(3000)]);
    rmSync(dir, { recursive: true, force: true });
  };
  for (let i = 0; i < 150 && !await healthy(base); i++) {
    if (child.exitCode !== null) break;
    await sleep(100);
  }
  if (!await healthy(base)) { await stop(); throw new Error(`the throwaway server didn't start:\n${out}`); }
  console.log(`(no server on localhost:8080: started a throwaway one at ${base})`);
  return { base, spawned: true, stop };
}

// Resolves after `ms`, or as soon as Ctrl+C is pressed (`stopped` then reads true).
let interrupted = false;
const waiting = new Set();
process.once('SIGINT', () => {
  interrupted = true;
  console.log('\n(stopping early)');
  for (const r of waiting) r();
});
export const stopped = () => interrupted;
export function wait(ms) {
  if (interrupted) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => { clearTimeout(t); waiting.delete(done); resolve(); };
    const t = setTimeout(done, ms);
    waiting.add(done);
  });
}

// Durations (ms) and their percentiles.
export class Timings {
  constructor() { this.v = []; this.sorted = true; }
  add(ms) { this.v.push(ms); this.sorted = false; }
  get n() { return this.v.length; }
  pct(p) {
    if (!this.v.length) return NaN;
    if (!this.sorted) { this.v.sort((a, b) => a - b); this.sorted = true; }
    return this.v[Math.min(this.v.length - 1, Math.floor((p / 100) * this.v.length))];
  }
  toString() {
    if (!this.v.length) return '—';
    const f = (ms) => (ms < 10 ? ms.toFixed(1) : Math.round(ms));
    return `p50 ${f(this.pct(50))} · p95 ${f(this.pct(95))} · p99 ${f(this.pct(99))} · max ${f(this.pct(100))} ms`;
  }
}

// The server's own view (/healthz, and /metrics where it's open): players, enemies, tick times.
export async function serverStats(base) {
  const out = {};
  try { Object.assign(out, await (await fetch(`${base}/healthz`, { signal: AbortSignal.timeout(2000) })).json()); } catch { /* not answering */ }
  try {
    const res = await fetch(`${base}/metrics`, { signal: AbortSignal.timeout(2000), headers: process.env.METRICS_TOKEN ? { Authorization: `Bearer ${process.env.METRICS_TOKEN}` } : {} });
    if (res.ok) for (const [, k, v] of (await res.text()).matchAll(/^celblade_(\w+) ([\d.e+-]+)$/gm)) out[k] = Number(v);
  } catch { /* closed to us */ }
  return out;
}
