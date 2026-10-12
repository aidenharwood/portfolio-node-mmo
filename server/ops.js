// Running the server: structured logs, metrics, a spatial grid for "who is near whom", and
// database backups.
//   LOG_FORMAT=json   one JSON object per line (for log shippers); otherwise readable lines
//   GET /healthz      200 { ok, uptime, players, enemies, tickMs } while ready (503 while a realm
//                     layer is closing, so the cluster stops sending players to it)
//   GET /metrics      Prometheus text: players, enemies, tick time, messages and bytes out, ...
//   BACKUP_HOURS      how often the database is copied to DATA_DIR/backups (default 6; 0 = off),
//                     keeping BACKUP_KEEP copies (default 8)
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------- logs
const JSON_LOGS = process.env.LOG_FORMAT === 'json';
function write(level, tag, msg, extra) {
  if (JSON_LOGS) {
    process.stdout.write(`${JSON.stringify({ t: new Date().toISOString(), level, tag, msg, ...extra })}\n`);
    return;
  }
  const line = `${new Date().toISOString().slice(11, 19)} [${tag}] ${msg}${extra && Object.keys(extra).length ? ` ${JSON.stringify(extra)}` : ''}`;
  (level === 'error' ? console.error : level === 'warn' ? console.warn : console.log)(line);
}
export const log = {
  info: (tag, msg, extra) => write('info', tag, msg, extra),
  warn: (tag, msg, extra) => write('warn', tag, msg, extra),
  error: (tag, msg, extra) => write('error', tag, msg instanceof Error ? msg.stack : msg, extra),
};

// ---------------------------------------------------------------- metrics
export const metrics = {
  started: Date.now(),
  counters: { messages_in: 0, messages_out: 0, bytes_out: 0, wire_bytes_out: 0, hits: 0, kills: 0, trades: 0, logins: 0, slow_clients_dropped: 0, snapshots_skipped: 0 },
  tickMs: [],   // the last 200 tick durations
  gauges: () => ({}),
  ready: () => true,

  tick(ms) {
    this.tickMs.push(ms);
    if (this.tickMs.length > 200) this.tickMs.shift();
  },
  inc(name, n = 1) { this.counters[name] = (this.counters[name] ?? 0) + n; },
  pct(p) {
    if (!this.tickMs.length) return 0;
    const s = [...this.tickMs].sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
  },

  health() {
    const g = this.gauges();
    return { ok: this.ready(), uptime: Math.round((Date.now() - this.started) / 1000), ...g, tickMs: Math.round(this.pct(50) * 100) / 100 };
  },

  // Prometheus exposition format.
  text() {
    const g = this.gauges();
    const lines = [];
    const put = (name, type, value, help) => { lines.push(`# HELP celblade_${name} ${help}`, `# TYPE celblade_${name} ${type}`, `celblade_${name} ${value}`); };
    put('uptime_seconds', 'gauge', Math.round((Date.now() - this.started) / 1000), 'Seconds since the server started.');
    for (const [k, v] of Object.entries(g)) put(k, 'gauge', v, `Current ${k.replace(/_/g, ' ')}.`);
    put('tick_ms_p50', 'gauge', this.pct(50).toFixed(3), 'Median realm tick time (ms) over the last 200 ticks.');
    put('tick_ms_p95', 'gauge', this.pct(95).toFixed(3), '95th percentile realm tick time (ms).');
    put('tick_ms_max', 'gauge', Math.max(0, ...this.tickMs).toFixed(3), 'Slowest of the last 200 ticks (ms).');
    for (const [k, v] of Object.entries(this.counters)) put(`${k}_total`, 'counter', v, `Total ${k.replace(/_/g, ' ')}.`);
    const cpu = process.cpuUsage();
    put('cpu_seconds_total', 'counter', ((cpu.user + cpu.system) / 1e6).toFixed(3), 'Processor time this process has used.');
    const mem = process.memoryUsage();
    put('heap_bytes', 'gauge', mem.heapUsed, 'V8 heap in use.');
    put('rss_bytes', 'gauge', mem.rss, 'Resident memory.');
    return `${lines.join('\n')}\n`;
  },
};

// ---------------------------------------------------------------- spatial grid
// Things bucketed by square cells, rebuilt each tick: finding what's within r of a point looks at
// the few cells that can hold it instead of everything in the realm.
export class Grid {
  constructor(cell = 64) {
    this.cell = cell;
    this.cells = new Map();
  }

  key(cx, cz) { return cx * 1_000_003 + cz; }

  clear() { this.cells.clear(); }

  add(item, x, z) {
    const k = this.key(Math.floor(x / this.cell), Math.floor(z / this.cell));
    let list = this.cells.get(k);
    if (!list) this.cells.set(k, (list = []));
    list.push(item);
  }

  // Everything in the cells overlapping the square of half-size r round (x, z) (callers check
  // the exact distance).
  near(x, z, r, out = []) {
    const c = this.cell;
    const x0 = Math.floor((x - r) / c);
    const x1 = Math.floor((x + r) / c);
    const z0 = Math.floor((z - r) / c);
    const z1 = Math.floor((z + r) / c);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const list = this.cells.get(this.key(cx, cz));
        if (list) for (const it of list) out.push(it);
      }
    }
    return out;
  }
}

// ---------------------------------------------------------------- backups
// A consistent copy of the live SQLite database (VACUUM INTO), every few hours, keeping the
// newest. (Postgres is backed up from outside: pg_dump — see docs/DEPLOY.md.)
export function startBackups(store, dataDir) {
  const hours = Number(process.env.BACKUP_HOURS ?? 6);
  const keep = Number(process.env.BACKUP_KEEP ?? 8);
  if (!(hours > 0) || store.kind !== 'sqlite') return null;
  const dir = path.join(dataDir, 'backups');
  mkdirSync(dir, { recursive: true });
  const run = async () => {
    const file = path.join(dir, `celblade-${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
    try {
      await store.backup(file);
      const old = readdirSync(dir).filter((f) => f.startsWith('celblade-') && f.endsWith('.db')).sort();
      for (const f of old.slice(0, Math.max(0, old.length - keep))) rmSync(path.join(dir, f));
      log.info('backup', `saved ${path.basename(file)}`);
    } catch (err) {
      log.error('backup', err);
    }
  };
  return setInterval(run, hours * 3600_000);
}
