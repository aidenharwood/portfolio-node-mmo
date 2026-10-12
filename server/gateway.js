// The gateway: the cluster's front door. Players connect here (behind the ingress); it checks who
// they are, picks a layer for them (server/realm.js — each layer one realm process running a copy
// of the world) and relays their connection to it. It also serves the client and the account API,
// so it's the only thing the ingress sees; gateways hold no game state, so any number can run.
//
// Choosing a layer, in order:
//   1. where the store's affinity sends them — their party's layer, or a layer they're being
//      moved to (an accepted invitation, an admin's teleport);
//   2. the layer that still has them (a reconnect: it lets go once it has saved);
//   3. the fullest layer under the soft cap, so layers fill up instead of spreading everyone thin;
//   4. the emptiest layer under the hard cap (parties and moves may also use the room up to it);
//   5. none: "the realm is full".
// When a layer closes a connection with MOVING (or vanishes), the screen reconnects at once and
// comes through here again.
import WebSocket from 'ws';
import { log, metrics } from './ops.js';

export const MOVING = 4010;
const SLOW_CLIENT = 1 << 20;   // bytes queued to a player: past this their snapshots are skipped...
const DEAD_CLIENT = 8 << 20;   // ...and past this the connection is dropped
const LAYERS_EVERY = 2000;     // ms: the list of layers is re-read at most this often
const RECENT = 10_000;         // ms: players sent to a layer count against it until it reports them
const BAD_FOR = 30_000;        // ms: a layer that refused a connection is avoided this long
const DROPPABLE = '{"t":"snap","d":1'; // how a skippable snapshot starts (see Realm.tick)

export class Gateway {
  constructor({ store, accounts, key = '', softCap = 150, hardCap = 200 }) {
    this.store = store;
    this.accounts = accounts;
    this.key = key;
    this.softCap = softCap;
    this.hardCap = hardCap;
    this.layers = [];
    this.layersAt = 0;
    this.recent = new Map();  // layer id → [times players were sent there]
    this.bad = new Map();     // layer id → avoid until
    this.conns = new Set();
    metrics.gauges = () => ({ connections: this.conns.size, layers: this.layers.length, layer_players: this.layers.reduce((n, l) => n + l.players, 0) });
    this.timer = setInterval(() => this.countWire(), 5000);
  }

  async liveLayers() {
    if (Date.now() - this.layersAt > LAYERS_EVERY) {
      this.layersAt = Date.now();
      this.layers = await this.store.liveLayers();
    }
    return this.layers;
  }

  load(layer) {
    const now = Date.now();
    const list = (this.recent.get(layer.id) ?? []).filter((t) => now - t < RECENT);
    this.recent.set(layer.id, list);
    return layer.players + list.length;
  }

  async choose(charId, tried) {
    const now = Date.now();
    const layers = (await this.liveLayers()).filter((l) => !l.draining && !tried.has(l.id) && !((this.bad.get(l.id) ?? 0) > now));
    if (!layers.length) return null;
    const byId = new Map(layers.map((l) => [l.id, l]));
    const [aff, present] = await Promise.all([this.store.affinity(charId), this.store.present(charId)]);
    for (const want of [aff?.layer, present?.layer]) {
      const l = byId.get(want);
      if (l && this.load(l) < this.hardCap) return this.reserve(l);
    }
    const open = layers.filter((l) => this.load(l) < this.softCap).sort((a, b) => this.load(b) - this.load(a) || a.id - b.id);
    if (open.length) return this.reserve(open[0]);
    const spare = layers.filter((l) => this.load(l) < this.hardCap).sort((a, b) => this.load(a) - this.load(b))[0];
    return spare ? this.reserve(spare) : null;
  }

  // Counted against the layer from the moment it's chosen (many players join at once).
  reserve(layer) {
    (this.recent.get(layer.id) ?? this.recent.set(layer.id, []).get(layer.id)).push(Date.now());
    return layer;
  }

  // ---------------------------------------------------------------- a player's connection
  connect(client, ip) {
    const conn = { client, ip, upstream: null, layer: null, queue: [], authing: false, closed: false };
    this.conns.add(conn);
    client.isAlive = true;
    client.on('pong', () => { client.isAlive = true; });
    const authTimer = setTimeout(() => client.close(4001, 'auth timeout'), 10_000);
    client.on('message', (data, isBinary) => {
      if (isBinary) return;
      metrics.inc('messages_in');
      if (conn.upstream) {
        if (conn.upstream.readyState === 1) conn.upstream.send(data, { binary: false });
        return;
      }
      if (conn.authing) { if (conn.queue.length < 64) conn.queue.push(data); return; }
      let msg;
      try { msg = JSON.parse(data.toString('utf8')); } catch { return; }
      if (msg?.t !== 'auth') return;
      clearTimeout(authTimer);
      conn.authing = true;
      this.route(conn, msg, data).catch((err) => {
        log.error('gateway', err);
        this.refuse(conn, 'Something went wrong — try again.', 1011);
      });
    });
    client.on('close', () => {
      conn.closed = true;
      clearTimeout(authTimer);
      this.conns.delete(conn);
      const up = conn.upstream;
      if (up && up.readyState <= 1) up.close(1000, 'left');
    });
    client.on('error', () => {});
  }

  refuse(conn, error, code) {
    if (conn.client.readyState !== 1) return;
    conn.client.send(JSON.stringify({ t: 'error', error }));
    conn.client.close(code, 'refused');
  }

  async route(conn, auth, raw) {
    const account = await this.accounts.resolve(auth.token);
    if (!account) return this.refuse(conn, 'Your session has expired — sign in again.', 4003);
    if (account.banned_until > Date.now()) return this.refuse(conn, `This account is banned until ${new Date(account.banned_until).toUTCString()}.`, 4011);
    const charId = Number(auth.character);
    if (!(await this.store.characters(account.id)).some((c) => c.id === charId)) return this.refuse(conn, 'No such character.', 4003);
    const tried = new Set();
    for (let attempt = 0; attempt < 4 && !conn.closed; attempt++) {
      const layer = await this.choose(charId, tried);
      if (!layer) {
        metrics.inc('realm_full');
        return this.refuse(conn, tried.size ? "Couldn't reach the world — try again." : 'The realm is full — try again in a minute.', 4005);
      }
      tried.add(layer.id);
      if (await this.open(conn, layer, raw)) return undefined;
      this.bad.set(layer.id, Date.now() + BAD_FOR);
      metrics.inc('layer_unreachable');
      log.warn('gateway', `layer ${layer.id} unreachable at ${layer.url}`);
    }
    return undefined;
  }

  // Connects to `layer` and relays the player through it. False if it couldn't be reached.
  open(conn, layer, raw) {
    return new Promise((resolve) => {
      const up = new WebSocket(layer.url, {
        headers: { 'x-forwarded-for': conn.ip, ...(this.key ? { 'x-internal-key': this.key } : {}) },
        perMessageDeflate: false,
        handshakeTimeout: 5000,
        maxPayload: 4 << 20,
      });
      let opened = false;
      up.on('error', () => { if (!opened) resolve(false); });
      up.on('open', () => {
        opened = true;
        resolve(true);
        if (conn.closed) { up.close(1000, 'left'); return; }
        conn.upstream = up;
        conn.layer = layer.id;
        metrics.inc('routed');
        up.send(raw, { binary: false });
        for (const q of conn.queue.splice(0)) up.send(q, { binary: false });
      });
      up.on('message', (data) => this.down(conn, data));
      up.on('close', (code, reason) => {
        if (!opened || conn.closed || conn.upstream !== up) return;
        // The layer's word goes to the player (moving, kicked, banned, restarting…). A layer that
        // dropped them without one has gone: they're moving too, to a layer that's up.
        const pass = (code >= 4000 && code < 5000) || code === 1012 ? code : MOVING;
        conn.client.close(pass, String(reason ?? '').slice(0, 100));
      });
    });
  }

  // Layer → player, with backpressure: a player whose connection is backed up skips snapshots
  // (the next one replaces them) and is dropped if it falls far enough behind.
  down(conn, data) {
    const c = conn.client;
    if (c.readyState !== 1) return;
    if (c.bufferedAmount > DEAD_CLIENT) {
      metrics.inc('slow_clients_dropped');
      c.terminate();
      return;
    }
    if (c.bufferedAmount > SLOW_CLIENT && data.length > DROPPABLE.length && data.toString('latin1', 0, DROPPABLE.length) === DROPPABLE) {
      metrics.inc('snapshots_skipped');
      return;
    }
    metrics.inc('messages_out');
    metrics.inc('bytes_out', data.length);
    c.send(data, { binary: false });
  }

  countWire() {
    for (const conn of this.conns) {
      const sock = conn.client._socket;
      if (!sock) continue;
      const w = sock.bytesWritten;
      metrics.inc('wire_bytes_out', w - (conn.wire ?? 0));
      conn.wire = w;
    }
  }

  // Drops players whose connection stopped answering (closed laptops, dead networks).
  heartbeat() {
    for (const conn of this.conns) {
      const c = conn.client;
      if (!c.isAlive) { c.terminate(); continue; }
      c.isAlive = false;
      c.ping();
    }
  }

  // Closing (a rolling update): every player reconnects at once, through another gateway.
  shutdown() {
    clearInterval(this.timer);
    for (const conn of this.conns) conn.client.close(MOVING, 'moving');
  }
}
