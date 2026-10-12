// Messages between the processes of a realm: world and guild chat, whispers, friends coming and
// going, party and guild invitations across layers, admin actions. Each message is addressed —
// 'all' (every realm layer) or 'layer:<id>' — and every process sees every message (its own
// included) and keeps what's addressed to it.
//   LocalBus: one process (`npm start`): straight back to the handlers.
//   PgBus: the cluster: Postgres LISTEN/NOTIFY on the realm's database (no extra service), on a
//   connection of its own that's re-made if it drops.
import pg from 'pg';
import { log, metrics } from './ops.js';

const CHANNEL = 'celblade';
const MAX_PAYLOAD = 7900; // bytes (Postgres refuses a NOTIFY over 8000)

class Handlers {
  constructor() { this.handlers = []; }
  on(fn) { this.handlers.push(fn); }
  deliver(to, msg) {
    metrics.inc('bus_in');
    for (const fn of this.handlers) {
      try { fn(to, msg); } catch (err) { log.error('bus', err); }
    }
  }
}

export class LocalBus extends Handlers {
  publish(to, msg) {
    metrics.inc('bus_out');
    queueMicrotask(() => this.deliver(to, structuredClone(msg)));
  }
  async close() {}
}

export class PgBus extends Handlers {
  constructor(url) {
    super();
    this.url = url;
    this.pool = new pg.Pool({ connectionString: url, max: 2 });
    this.pool.on('error', () => {});
    this.client = null;
    this.closed = false;
    this.ready = this.listen();
  }

  async listen() {
    while (!this.closed) {
      const client = new pg.Client({ connectionString: this.url });
      try {
        await client.connect();
        client.on('notification', (n) => {
          let m;
          try { m = JSON.parse(n.payload); } catch { return; }
          this.deliver(m.to, m.msg);
        });
        const lost = new Promise((resolve) => { client.on('error', resolve); client.on('end', resolve); });
        await client.query(`LISTEN ${CHANNEL}`);
        this.client = client;
        await lost;
        if (!this.closed) log.warn('bus', 'lost the database connection; listening again');
      } catch (err) {
        if (!this.closed) log.warn('bus', `can't listen: ${err.message}`);
      }
      this.client = null;
      client.end().catch(() => {});
      if (!this.closed) await new Promise((r) => setTimeout(r, 1000));
    }
  }

  publish(to, msg) {
    const payload = JSON.stringify({ to, msg });
    if (Buffer.byteLength(payload) > MAX_PAYLOAD) { log.warn('bus', `message too large to send (${msg.k})`); return; }
    metrics.inc('bus_out');
    this.pool.query('SELECT pg_notify($1, $2)', [CHANNEL, payload]).catch((err) => log.warn('bus', `send failed: ${err.message}`));
  }

  async close() {
    this.closed = true;
    await this.client?.end().catch(() => {});
    await this.pool.end().catch(() => {});
  }
}

export const openBus = (url) => (url ? new PgBus(url) : new LocalBus());
