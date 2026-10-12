// Cel Blade server. One program, three roles (ROLE):
//   all      (default, `npm start`) the game client, the account API and the realm in one process,
//            on SQLite — http://localhost:8080
//   gateway  the cluster's front door: the client, the API, and players' connections, relayed to
//            a realm layer (server/gateway.js). Any number of them.
//   realm    one layer of the world (server/realm.js), reached only through gateways. As many as
//            the player count needs; each runs its own copy of the world.
// The cluster roles share Postgres (DATABASE_URL), which is also their message bus.
// Env: PORT, HOST, DATA_DIR (SQLite), DATABASE_URL, NODE_ENV=production (caching on, dev endpoints
// off), TRUST_PROXY=1 (behind a reverse proxy: take the client address from X-Forwarded-For),
// ADMINS (account names), LOG_FORMAT=json, METRICS_TOKEN (require it for /metrics), METRICS_PORT
// (serve /metrics on this port only),
// BACKUP_HOURS / BACKUP_KEEP (SQLite), INTERNAL_KEY (gateways ↔ layers), LAYER / LAYER_URL /
// POD_IP (a layer's number and address), LAYER_SOFT_CAP / LAYER_HARD_CAP. See docs/DEPLOY.md.
import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Store } from './store.js';
import { openBus } from './bus.js';
import { Accounts } from './accounts.js';
import { Realm } from './realm.js';
import { Gateway } from './gateway.js';
import { createApi } from './api.js';
import { log, metrics, startBackups } from './ops.js';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const ROLE = process.env.ROLE ?? 'all';
const PORT = Number(process.env.PORT ?? 8080);
const HOST = process.env.HOST ?? '0.0.0.0';
const DEV = process.env.NODE_ENV !== 'production';
const DATA_DIR = path.resolve(ROOT, process.env.DATA_DIR ?? 'data');
const DATABASE_URL = process.env.DATABASE_URL || null;
const INTERNAL_KEY = process.env.INTERNAL_KEY ?? '';
const METRICS_PORT = Number(process.env.METRICS_PORT ?? 0);

if (!['all', 'gateway', 'realm'].includes(ROLE)) throw new Error(`ROLE must be all, gateway or realm (not ${ROLE})`);
if (ROLE !== 'all' && !DATABASE_URL) throw new Error(`ROLE=${ROLE} needs DATABASE_URL (the cluster shares Postgres)`);

// Only the client is served: never the server code, the database or anything else in the folder.
const PUBLIC = ['index.html', 'style.css', 'manifest.webmanifest', 'icon.svg', 'src/', ...(DEV ? ['tools/'] : [])];
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

// A layer's number: LAYER, or the ordinal a StatefulSet puts at the end of the pod's name.
function layerNumber() {
  if (process.env.LAYER !== undefined) return Number(process.env.LAYER);
  const m = /-(\d+)$/.exec(process.env.HOSTNAME ?? os.hostname());
  return m ? Number(m[1]) : 0;
}

const store = await new Store({ url: DATABASE_URL, dir: DATA_DIR }).init();
const seed = await store.worldSeed();
const accounts = new Accounts(store);
const bus = ROLE === 'gateway' ? null : openBus(DATABASE_URL);
const clientAddress = (req) => (process.env.TRUST_PROXY ? String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() : '') || req.socket.remoteAddress || '?';

let realm = null;
let gateway = null;
if (ROLE === 'gateway') {
  gateway = new Gateway({
    store, accounts, key: INTERNAL_KEY,
    softCap: Number(process.env.LAYER_SOFT_CAP ?? 150), hardCap: Number(process.env.LAYER_HARD_CAP ?? 200),
  });
} else {
  const layer = ROLE === 'realm' ? layerNumber() : 0;
  const url = ROLE === 'realm' ? (process.env.LAYER_URL ?? `ws://${process.env.POD_IP ?? '127.0.0.1'}:${PORT}/ws`) : '';
  realm = await new Realm({ store, accounts, bus, seed, layer, url, standalone: ROLE === 'all' }).start();
}
const api = ROLE === 'realm' ? null : createApi({ store, accounts, seed, clientAddress });

async function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
  if (rel === '') rel = 'index.html';
  const file = path.resolve(ROOT, rel);
  const inside = file.startsWith(ROOT + path.sep);
  const allowed = inside && PUBLIC.some((p) => (p.endsWith('/') ? rel.startsWith(p) : rel === p));
  if (!allowed) { res.writeHead(404).end('Not found'); return; }
  let info;
  try { info = await stat(file); } catch { res.writeHead(404).end('Not found'); return; }
  if (!info.isFile()) { res.writeHead(404).end('Not found'); return; }
  res.writeHead(200, {
    'Content-Type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
    'Content-Length': info.size,
    'Cache-Control': DEV ? 'no-store' : 'no-cache',
    'Last-Modified': info.mtime.toUTCString(),
    'X-Content-Type-Options': 'nosniff',
  });
  if (req.method === 'HEAD') { res.end(); return; }
  createReadStream(file).pipe(res);
}

function serveMetrics(req, res) {
  const token = process.env.METRICS_TOKEN;
  if (token && req.headers.authorization !== `Bearer ${token}`) { res.writeHead(401).end(); return; }
  res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4', 'Cache-Control': 'no-store' }).end(metrics.text());
}

// With METRICS_PORT, metrics are served there and only there (a port the ingress never sees).
if (METRICS_PORT) {
  http.createServer((req, res) => {
    if (new URL(req.url, 'http://localhost').pathname === '/metrics') serveMetrics(req, res);
    else res.writeHead(404).end();
  }).listen(METRICS_PORT, HOST);
}

// Dev-only frame capture (same as serve.py): POST a PNG data URL to /__shot/<name> → .shots/<name>.png
async function devShot(req, res, url) {
  const name = url.pathname.slice('/__shot/'.length).replace(/[^a-zA-Z0-9_-]/g, '') || 'shot';
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = Buffer.concat(chunks).toString();
  await mkdir(path.join(ROOT, '.shots'), { recursive: true });
  await writeFile(path.join(ROOT, '.shots', `${name}.png`), Buffer.from(body.split(',', 2)[1] ?? '', 'base64'));
  res.writeHead(204).end();
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/healthz') {
      const h = metrics.health();
      res.writeHead(h.ok ? 200 : 503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify({ role: ROLE, ...h }));
      return;
    }
    if (url.pathname === '/metrics' && !METRICS_PORT) return serveMetrics(req, res);
    // Dev-only: shut down as on SIGTERM (which Windows can't send) — for trying rolling restarts.
    if (DEV && req.method === 'POST' && url.pathname === '/__shutdown') { res.writeHead(204).end(); shutdown(); return; }
    if (!api) { res.writeHead(404).end('Not found'); return; } // a layer serves players only
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    if (DEV && req.method === 'POST' && url.pathname.startsWith('/__shot/')) return await devShot(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }
    await serveStatic(req, res, url);
  } catch (err) {
    log.error('http', err);
    if (!res.headersSent) res.writeHead(500);
    res.end();
  }
});

// Players' connections are compressed (permessage-deflate, which every browser speaks):
// snapshots are repetitive JSON and shrink several times over. Each connection keeps its own small
// compression window, so consecutive snapshots compress against each other. In the cluster the
// gateway does this; its connections to the layers inside the cluster aren't compressed.
// (The browser's own window is its choice: Safari doesn't say what it is, and requiring a size
// turns its connection away.)
const wss = new WebSocketServer({
  noServer: true,
  maxPayload: 512 * 1024,
  perMessageDeflate: ROLE === 'realm' ? false : {
    zlibDeflateOptions: { level: 1, memLevel: 7 },
    serverMaxWindowBits: 13,
    threshold: 256,
  },
});
server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname !== '/ws') { socket.destroy(); return; }
  // A layer only takes connections from gateways (when they share a key).
  if (ROLE === 'realm' && INTERNAL_KEY && req.headers['x-internal-key'] !== INTERNAL_KEY) { socket.destroy(); return; }
  wss.handleUpgrade(req, socket, head, (ws) => (gateway ?? realm).connect(ws, clientAddress(req)));
});
const heartbeat = setInterval(() => (gateway ?? realm).heartbeat(), 20_000);
const backups = ROLE === 'all' ? startBackups(store, DATA_DIR) : null;
// A bug in one handler is logged, not fatal: the realm keeps running for everyone else.
process.on('uncaughtException', (err) => log.error('crash', err));
process.on('unhandledRejection', (err) => log.error('crash', err instanceof Error ? err : String(err)));

server.listen(PORT, HOST, () => {
  log.info('server', `Cel Blade ${ROLE} — http://localhost:${PORT}`, {
    mode: DEV ? 'development' : 'production', seed, database: store.kind, ...(realm && ROLE === 'realm' ? { layer: realm.layer, url: realm.url } : {}),
  });
});

let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  log.info('server', 'shutting down');
  setTimeout(() => process.exit(0), 20_000).unref(); // the cluster's grace period is longer
  clearInterval(heartbeat);
  if (backups) clearInterval(backups);
  try {
    gateway?.shutdown();
    await realm?.shutdown();
  } catch (err) { log.error('server', err); }
  wss.close();
  await bus?.close();
  await store.close().catch(() => {});
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
