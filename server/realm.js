// The live world: who's connected, where they are and what they look like (relayed to whoever is
// near enough to see them), chat, cosmetic effects, character saves — and the world simulation
// (server/simhost.js): every enemy, run here for everyone, with combat and loot.
// See docs/MULTIPLAYER.md.
//
// A realm process is one *layer*: in the cluster several run copies of the same world, players
// reach them through a gateway (server/gateway.js), and the layers talk over the bus
// (server/bus.js) — world and guild chat, whispers, invitations, admin actions. A character is on
// one layer at a time: the layer holds it in the store's presence table, saves it, then lets go.
// Moving a player to another layer closes their connection with MOVING; their screen reconnects
// straight away and the gateway puts them where the store's affinity says.
//
// Close codes: 4001 auth timeout · 4003 auth failed · 4004 replaced by a newer sign-in ·
//   4008 flooding · 4010 moving (reconnect now) · 4011 banned · 4012 kicked · 1012 restarting
//
// Protocol (JSON over WebSocket; `t` is the message type):
//   client → server
//     auth    { token, character }            first message; answered by welcome or error
//     s       { p, f, v, gr, st, ... }        own state, ~15 Hz (see cleanState)
//     profile { lv, w, a }                    level, weapon in hand and armour, as item recipes
//     fx      { list: [...] }                 cosmetic effects (shots, casts, runes) to show others
//     chat    { text }                        world by default; /s nearby, /w Name whisper, /who
//     save    { data }                        this screen's own business: discovery, marker, pos
//     op      { seq, op }                     a change to the character (server/characters.js)
//     resync                                  "send me my whole character again"
//     ping    { c }                           clock sync; answered by pong { c, s }
//     hit, st                                 hits and statuses on enemies (server/simhost.js)
//   server → client
//     welcome { id, seed, time, tick, character, camps, ground, layer }
//     add     { id, name, lv, look, w, a, s, rt }   a player came into view
//     remove  { id }                                 …went out of view or left
//     look    { id, lv, w, a }                       a visible player changed gear or level
//     snap    { ts, ps: [[id, rt, state]], fx: [[id, fx]], ea, ed, es, ev }   each tick
//     reward, camp                                   (server/simhost.js)
//     opr     { seq, ok, roll, h }                   the answer to an op (h: fingerprint)
//     sop     { op }                                 a change the server made (kill rewards...)
//     char    { data, ground }                       the whole character (on resync)
//     ch      { h }                                  periodic fingerprint
//     pos     { p }                                  "you can't be there": back to p
//     chat    { ch, from, to, text }
//     kicked  { reason }
import { SimHost } from './simhost.js';
import { loadCharacter, characterData, groundList, runOp } from './characters.js';
import { Parties } from './parties.js';
import { Trades } from './trade.js';
import { Social } from './social.js';
import { Admin } from './admin.js';
import { Grid, metrics, log } from './ops.js';

const TICK_MS = 50;
const AOI = 160;           // metres: players further apart than this don't see each other
// Players further off are sent less often: every 2nd tick past MID, every 3rd past FAR. Screens
// draw others ~120 ms in the past and carry them on along their velocity, so the gaps don't show.
const LOD_MID = 50;
const LOD_FAR = 100;
const SAY_RANGE = 60;
const MAX_SAVE = 256 * 1024;
const MAX_CHAT = 200;
const STATES = new Set(['move', 'attack', 'dodge', 'slide', 'airdash', 'slam', 'mantle', 'hurt']);
const FX_KINDS = new Set(['shot', 'rune', 'muzzle']);

// Token bucket per message type: `rate` per second, holding up to `burst`.
const LIMITS = { s: [30, 45], profile: [2, 6], fx: [30, 60], chat: [1.2, 5], save: [1, 4], ping: [3, 6], hit: [60, 120], st: [30, 60], op: [20, 40], resync: [0.5, 2], party: [2, 6], trade: [6, 12], mail: [2, 6] };
const SLOW_CLIENT = 1 << 20;   // bytes queued: past this, snapshots for that player are skipped...
const DEAD_CLIENT = 8 << 20;   // ...and past this, the connection is dropped
const SAVE_EVERY = 30_000;  // ms: characters are written back this often (and when they leave)
const CHECK_EVERY = 10_000; // ms: fingerprint sent to each player this often
const ANNOUNCE_EVERY = 5_000; // ms: this layer tells the store it's up (and how full)
const PRESENCE_EVERY = 15_000; // ms: …and refreshes its hold on its players
const MOVE_TTL = 60_000;    // ms: how long a move to another layer waits for the player to arrive
export const MOVING = 4010;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const num = (v, lo, hi, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
const vec3 = (a, lim) => (Array.isArray(a) && a.length === 3 ? a.map((v) => num(v, -lim, lim)) : null);
const round = (v, k = 1000) => Math.round(v * k) / k;

// Only known fields of known types are relayed, clamped to sane ranges.
function cleanState(s) {
  if (!s || typeof s !== 'object') return null;
  const p = vec3(s.p, 1e6);
  if (!p) return null;
  return {
    p: p.map((v) => round(v)), f: round(num(s.f, -7, 7)), v: (vec3(s.v, 300) ?? [0, 0, 0]).map((v) => round(v, 100)),
    gr: s.gr ? 1 : 0, st: STATES.has(s.st) ? s.st : 'move', sT: round(num(s.sT, 0, 60)),
    ci: Math.round(num(s.ci, -1, 16)), aq: Math.round(num(s.aq, 0, 1e9)), fl: Math.round(num(s.fl, 0, 0xffff)),
    ay: round(num(s.ay, -1, 1)), cy: round(num(s.cy, -7, 7)), ft: round(num(s.ft, 0, 1)), bj: round(num(s.bj, 0, 1)),
    rt: round(num(s.rt, 0, 10)), ch: round(num(s.ch, 0, 10)), md: round(num(s.md, 0, 3)), sa: round(num(s.sa, 0, 3)),
    hp: round(num(s.hp, 0, 1, 1)),
  };
}

// An item recipe: a flat object of a few short primitives.
function cleanRecipe(r) {
  if (!r || typeof r !== 'object' || Array.isArray(r)) return null;
  const out = {};
  const entries = Object.entries(r);
  if (entries.length > 12) return null;
  for (const [k, v] of entries) {
    if (k.length > 16) return null;
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    else if (typeof v === 'string' && v.length <= 24) out[k] = v;
    else if (v === null || typeof v === 'boolean') out[k] = v;
    else return null;
  }
  return out;
}

function cleanFx(fx) {
  if (!fx || typeof fx !== 'object' || !FX_KINDS.has(fx.k)) return null;
  const out = { k: fx.k };
  for (const [k, v] of Object.entries(fx)) {
    if (k === 'k') continue;
    if (Object.keys(out).length > 20 || k.length > 4) return null;
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = round(v);
    else if (typeof v === 'boolean') out[k] = v;
    else if (typeof v === 'string' && v.length <= 16) out[k] = v;
    else if (Array.isArray(v) && v.length === 3) { const a = vec3(v, 1e6); if (!a) return null; out[k] = a.map((x) => round(x)); }
    else return null;
  }
  return out;
}

const cleanText = (t) => String(t ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, MAX_CHAT);

class Session {
  constructor(realm, ws, account, character) {
    this.realm = realm;
    this.ws = ws;
    this.id = realm.nextId++;
    this.accountId = account.id;
    this.admin = account.role === 'admin';
    this.mutedUntil = account.muted_until ?? 0;
    this.tag = null;      // guild tag (server/social.js)
    this.charId = character.id;
    this.name = character.name;
    this.look = character.look;
    this.level = character.level;
    this.weapon = null;
    this.armor = {};
    this.state = null;
    this.stateAt = 0;      // server time the latest state arrived
    this.stateSeq = 0;
    this.known = new Map(); // other session → last stateSeq sent to this one
    this.fxOut = [];
    this.wireOut = 0;      // bytes the socket had written at the last count (after compression)
    this.buckets = Object.fromEntries(Object.entries(LIMITS).map(([k, [, burst]]) => [k, { n: burst, at: Date.now() }]));
    this.strikes = 0;
  }

  // `droppable`: a snapshot, which a player whose connection is backed up can do without (the
  // next one supersedes it).
  send(msg, droppable = false) {
    const ws = this.ws;
    if (ws.readyState !== 1) return;
    if (ws.bufferedAmount > DEAD_CLIENT) {
      metrics.inc('slow_clients_dropped');
      ws.terminate();
      return;
    }
    if (droppable && ws.bufferedAmount > SLOW_CLIENT) { metrics.inc('snapshots_skipped'); return; }
    const text = typeof msg === 'string' ? msg : JSON.stringify(msg);
    metrics.inc('messages_out');
    metrics.inc('bytes_out', text.length);
    ws.send(text);
  }

  allow(type) {
    const lim = LIMITS[type];
    if (!lim) return true;
    const b = this.buckets[type];
    const now = Date.now();
    b.n = Math.min(lim[1], b.n + ((now - b.at) / 1000) * lim[0]);
    b.at = now;
    if (b.n < 1) return false;
    b.n -= 1;
    return true;
  }

  get position() { return this.state?.p ?? null; }

  profile() {
    return { id: this.id, lv: this.level, w: this.weapon, a: this.armor, gt: this.tag };
  }
}

export class Realm {
  // `layer`: this process's layer number (0 when it's the only one); `url`: where gateways reach
  // it; `standalone`: no gateway or other layers (`npm start`), so nobody can be moved.
  constructor({ store, accounts, bus, seed, layer = 0, url = '', standalone = true }) {
    this.store = store;
    this.accounts = accounts;
    this.bus = bus;
    this.seed = seed;
    this.layer = layer;
    this.url = url;
    this.standalone = standalone;
    this.draining = false;
    this.joining = new Set();  // character ids part-way through joining
    this.sessions = new Map(); // id → Session
    this.nextId = 1;
    this.simhost = new SimHost(this, this.seed);
    this.parties = new Parties(this);
    this.trades = new Trades(this);
    this.social = new Social(this);
    this.admin = new Admin(this);
    this.lastTick = Date.now();
    this.tickNo = 0;
    this.grid = new Grid(64);
    metrics.gauges = () => ({
      layer: this.layer, players: this.sessions.size, enemies: this.simhost.enemyCount, parties: this.parties.parties.size,
      world_colliders: this.simhost.world.colliders.size, world_chunks: this.simhost.world.chunks.size,
    });
    metrics.ready = () => !this.draining;
    this.timer = setInterval(() => this.tick(), TICK_MS);
    bus.on((to, msg) => { if (to === 'all' || to === `layer:${layer}`) this.onBus(msg); });
  }

  // Up: whoever this layer held before a crash is let go, then it says it's open.
  async start() {
    await this.store.clearLayer(this.layer);
    await this.announce();
    this.announceTimer = setInterval(() => this.announce().catch((err) => log.warn('realm', `announce failed: ${err.message}`)), ANNOUNCE_EVERY);
    this.presenceTimer = setInterval(() => this.store.refreshLayer(this.layer).catch(() => {}), PRESENCE_EVERY);
    return this;
  }

  announce() { return this.store.announceLayer(this.layer, this.url, this.sessions.size, this.draining); }

  sessionOf(charId) {
    for (const s of this.sessions.values()) if (s.charId === charId) return s;
    return null;
  }

  // A new socket: wait for its auth message, then bring the character into the world.
  connect(ws, ip) {
    let session = null;
    let joining = false;
    const early = []; // messages that came while joining
    const authTimer = setTimeout(() => ws.close(4001, 'auth timeout'), 10_000);
    const handle = (s, msg) => {
      metrics.inc('messages_in');
      try { this.handle(s, msg); } catch (err) { log.error('realm', err, { player: s.name }); }
    };
    ws.on('message', (raw, isBinary) => {
      if (isBinary) return;
      let msg;
      try { msg = JSON.parse(raw.toString('utf8')); } catch { return; }
      if (!msg || typeof msg.t !== 'string') return;
      if (session) { handle(session, msg); return; }
      if (joining) { if (early.length < 64) early.push(msg); return; }
      if (msg.t !== 'auth') return;
      clearTimeout(authTimer);
      joining = true;
      this.join(ws, msg).then((s) => {
        if (!s) { ws.close(4003, 'auth failed'); return; }
        if (ws.readyState !== 1) { this.leave(s); return; } // gone while joining
        session = s;
        for (const m of early.splice(0)) handle(s, m);
      }).catch((err) => {
        log.error('realm', err);
        ws.close(1011, 'server error');
      });
    });
    ws.on('close', () => {
      clearTimeout(authTimer);
      if (session) this.leave(session);
    });
    ws.on('error', () => {});
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    ws.ip = ip;
  }

  async join(ws, msg) {
    const fail = (error) => { ws.send(JSON.stringify({ t: 'error', error })); return null; };
    if (this.draining) return fail('This layer is closing — try again.');
    const charId = Number(msg.character);
    if (this.joining.has(charId)) return fail('Already joining.');
    this.joining.add(charId);
    try {
      const account = await this.accounts.resolve(msg.token);
      if (!account) return fail('Your session has expired — sign in again.');
      if (account.banned_until > Date.now()) return fail(`This account is banned until ${new Date(account.banned_until).toUTCString()}.`);
      let character = await this.store.character(charId);
      if (!character || character.accountId !== account.id) return fail('No such character.');
      // One copy of a character in the world: a second sign-in replaces the first. Here, the old
      // session goes (saved first); on another layer it's told to go, and this waits until that
      // layer has saved it and let go.
      for (const s of [...this.sessions.values()]) {
        if (s.charId !== charId) continue;
        s.send({ t: 'kicked', reason: 'This character signed in somewhere else.' });
        s.ws.close(4004, 'replaced');
        await this.leave(s);
      }
      let waited = false;
      for (let tries = 0; !(await this.store.claim(charId, character.name, account.id, this.layer)); tries++) {
        if (tries === 0) this.bus.publish('all', { k: 'kick', charId, reason: 'This character signed in somewhere else.', code: 4004, except: this.layer });
        if (tries >= 24) return fail('Your character is still leaving the world elsewhere — try again in a moment.');
        waited = true;
        await sleep(250);
      }
      if (waited) character = await this.store.character(charId); // as the other layer left it
      if (ws.readyState !== 1) { await this.store.release(charId, this.layer); return null; }
      const intent = await this.store.takeIntent(charId);
      return await this.enter(ws, account, character, intent);
    } finally {
      this.joining.delete(charId);
    }
  }

  async enter(ws, account, character, intent) {
    const session = new Session(this, ws, account, character);
    this.sessions.set(session.id, session);
    this.simhost.join(session);
    const { core, extras } = loadCharacter(session, character.data, this.simhost);
    session.core = core;
    session.extras = extras;
    session.level = core.stats.level;
    session.savedAt = Date.now();
    session.checkAt = Date.now() + CHECK_EVERY;
    session.dirty = !character.data;
    session.send({
      t: 'welcome', id: session.id, seed: this.seed, time: Date.now(), tick: TICK_MS, layer: this.standalone ? null : this.layer,
      character: { id: character.id, name: character.name, look: character.look, data: characterData(core, extras) },
      camps: [...this.simhost.cleared],
      ground: groundList(core),
    });
    this.parties.online(session);
    await this.social.online(session);
    metrics.inc('logins');
    log.info('realm', `+ ${character.name}`, { account: account.name, ip: ws.ip, layer: this.layer, online: this.sessions.size });
    this.system(`${character.name} entered the world.`, session);
    if (intent) this.arrive(session, intent);
    return session;
  }

  // Someone moved here with something to do: stand by a player (an admin's teleport), or join
  // the party whose invitation they accepted on their old layer.
  arrive(s, intent) {
    if (intent.near) {
      const t = this.sessionOf(intent.near);
      if (t?.state) {
        s.core.teleportUntil = s.core.time + 10;
        s.send({ t: 'pos', p: t.state.p });
      }
    }
    if (intent.party) this.parties.arrived(s, intent.party);
    if (intent.regroup) this.parties.regroup(s, intent.regroup);
  }

  // Out of the world at once; then saved, and only then is the character let go (so another
  // layer taking it reads the save). Safe to call more than once.
  leave(session) {
    if (session.leaving) return session.leaving;
    if (!this.sessions.has(session.id)) return Promise.resolve();
    this.trades.gone(session);
    this.parties.offline(session);
    this.sessions.delete(session.id);
    this.simhost.leave(session);
    for (const other of this.sessions.values()) {
      if (other.known.delete(session)) other.send({ t: 'remove', id: session.id });
    }
    log.info('realm', `- ${session.name}`, { online: this.sessions.size });
    this.system(`${session.name} left the world.`);
    session.leaving = (async () => {
      await this.saveCharacter(session);
      if (!this.sessionOf(session.charId)) await this.store.release(session.charId, this.layer).catch((err) => log.error('realm', err));
      this.social.offline(session);
    })();
    return session.leaving;
  }

  // Sends a player to another layer: their screen reconnects at once, and the gateway puts them
  // there; `intent` is what to do when they arrive (see arrive).
  async move(s, layer, intent = null) {
    if (this.standalone || layer === this.layer) return false;
    await this.store.setAffinity(s.charId, layer, intent, MOVE_TTL);
    s.ws.close(MOVING, 'moving');
    return true;
  }

  handle(s, msg) {
    if (!s.allow(msg.t)) {
      // Persistent flooding gets the connection dropped.
      if (++s.strikes > 200) s.ws.close(4008, 'rate limit');
      return;
    }
    switch (msg.t) {
      case 's': {
        const st = cleanState(msg);
        if (!st) return;
        // Somewhere they can't have got to: put back where they were.
        if (!this.simhost.updatePlayer(s, st)) break;
        s.state = st;
        s.stateAt = Date.now();
        s.stateSeq++;
        s.stateJson = JSON.stringify([s.id, s.stateAt, st]);   // as it goes out in snapshots
        break;
      }
      case 'op': {
        s.core.time = this.simhost.sim.time;
        const r = runOp(s.core, msg);
        if (r.ok) {
          s.dirty = true;
          s.level = s.core.stats.level;
        }
        s.send({ t: 'opr', seq: msg.seq, ok: r.ok, roll: r.roll, h: s.core.hash() });
        break;
      }
      case 'resync': s.send({ t: 'char', data: characterData(s.core, s.extras), ground: groundList(s.core) }); break;
      case 'party': this.parties.handle(s, msg); break;
      case 'trade': this.trades.handle(s, msg); break;
      case 'mail': this.social.mail(s, msg); break;
      case 'hit': this.simhost.hit(s, msg); break;
      case 'st': this.simhost.status(s, msg); break;
      case 'profile': {
        s.level = s.core.stats.level;
        s.weapon = cleanRecipe(msg.w);
        const armor = {};
        if (msg.a && typeof msg.a === 'object') {
          for (const [slot, r] of Object.entries(msg.a).slice(0, 8)) {
            const c = cleanRecipe(r);
            if (c && slot.length <= 12) armor[slot] = c;
          }
        }
        s.armor = armor;
        const look = { t: 'look', ...s.profile() };
        for (const other of this.sessions.values()) if (other.known.has(s)) other.send(look);
        break;
      }
      case 'fx': {
        if (!Array.isArray(msg.list)) return;
        const list = msg.list.slice(0, 16).map(cleanFx).filter(Boolean);
        for (const other of this.sessions.values()) {
          if (other.known.has(s)) for (const fx of list) other.fxOut.push([s.id, fx]);
        }
        break;
      }
      case 'chat': this.chat(s, cleanText(msg.text)); break;
      case 'save': {
        // Only what's this screen's own: the character itself lives here.
        const data = msg.data;
        if (!data || typeof data !== 'object' || Array.isArray(data)) return;
        if (JSON.stringify(data).length > MAX_SAVE) { s.send({ t: 'error', error: 'Save too large.' }); return; }
        if (data.discovery && typeof data.discovery === 'object') s.extras.discovery = data.discovery;
        if (data.marker === null || (data.marker && Number.isFinite(data.marker.x) && Number.isFinite(data.marker.z))) s.extras.marker = data.marker ? { x: data.marker.x, z: data.marker.z } : null;
        if (s.state) s.extras.pos = s.state.p;
        s.dirty = true;
        break;
      }
      case 'ping': s.send({ t: 'pong', c: msg.c, s: Date.now() }); break;
    }
  }

  chat(s, text) {
    if (!text) return;
    const cmd0 = /^\/(\w+)(?:\s+(.*))?$/.exec(text);
    const name0 = cmd0?.[1].toLowerCase();
    // A muted player can't talk on any channel (commands still work).
    if ((!cmd0 || ['p', 'party', 'g', 's', 'w'].includes(name0)) && s.mutedUntil > Date.now()) {
      s.send({ t: 'chat', ch: 'system', text: `You're muted until ${new Date(s.mutedUntil).toUTCString()}.` });
      return;
    }
    if (cmd0 && (this.admin.command(s, name0, cmd0[2]) || this.social.command(s, name0, cmd0[2]))) return;
    if (name0 === 'trade') return this.trades.request(s, (cmd0[2] ?? '').trim());
    if (text === '/who') { this.who(s).catch((err) => log.error('realm', err)); return; }
    const whisper = /^\/w\s+(\S+)\s+(.+)$/i.exec(text);
    if (whisper) { this.whisper(s, whisper[1], whisper[2]).catch((err) => log.error('realm', err)); return; }
    // Party commands and chat (server/parties.js).
    const cmd = /^\/(\w+)(?:\s+(.*))?$/.exec(text);
    if (cmd) {
      const arg = (cmd[2] ?? '').trim();
      switch (cmd[1].toLowerCase()) {
        case 'p': case 'party': if (arg) this.parties.chat(s, arg); return;
        case 'invite': return this.parties.invite(s, arg);
        case 'accept': return this.parties.accept(s);
        case 'decline': return this.parties.decline(s);
        case 'leave': return this.parties.leave(s);
        case 'kick': return this.parties.kick(s, arg);
        case 'promote': return this.parties.promote(s, arg);
      }
    }
    const say = /^\/s\s+(.+)$/i.exec(text);
    if (say) {
      const msg = { t: 'chat', ch: 'say', from: s.name, text: say[1] };
      for (const o of this.sessions.values()) if ((o === s || this.distance(o, s) <= SAY_RANGE) && !this.social.ignores(o, s)) o.send(msg);
      return;
    }
    if (text.startsWith('/')) {
      s.send({ t: 'chat', ch: 'system', text: 'Commands: /s nearby · /w Name whisper · /p party · /g guild · /invite /accept /decline /leave /kick /promote (party) · /trade Name · /friend /unfriend /ignore /unignore Name · /guild · /report Name reason · /who' });
      return;
    }
    this.bus.publish('all', { k: 'chat', from: s.name, fromChar: s.charId, text });
  }

  async who(s) {
    const [count, list, layers] = await Promise.all([this.store.onlineCount(), this.store.onlineList(40), this.store.liveLayers()]);
    const names = list.map((o) => (layers.length > 1 ? `${o.name} (${o.layer + 1})` : o.name));
    const where = this.standalone ? '' : ` on ${layers.length} layer${layers.length === 1 ? '' : 's'} — you're on layer ${this.layer + 1}`;
    s.send({ t: 'chat', ch: 'system', text: `${count} online${where}: ${names.join(', ')}${count > names.length ? ', …' : ''}` });
  }

  async whisper(s, name, text) {
    if (s.mutedUntil > Date.now()) { s.send({ t: 'chat', ch: 'system', text: "You're muted." }); return; }
    const local = [...this.sessions.values()].find((o) => o.name.toLowerCase() === name.toLowerCase());
    const where = local ? { id: local.charId, layer: this.layer } : await this.store.presentByName(name);
    if (!where) { s.send({ t: 'chat', ch: 'system', text: `${name} isn't online.` }); return; }
    this.bus.publish(`layer:${where.layer}`, { k: 'whisper', from: s.name, fromChar: s.charId, fromLayer: this.layer, toChar: where.id, text });
  }

  // A message for one character wherever they are (each layer passes it on if they're there).
  deliver(charId, msg, layer = null) {
    this.bus.publish(layer === null ? 'all' : `layer:${layer}`, { k: 'deliver', toChar: charId, msg });
  }

  // ---------------------------------------------------------------- from other layers (and this one)
  onBus(m) {
    switch (m.k) {
      case 'chat': {
        const msg = { t: 'chat', ch: 'world', from: m.from, text: m.text };
        for (const o of this.sessions.values()) if (!o.ignoring?.has(m.fromChar)) o.send(msg);
        return;
      }
      case 'whisper': {
        const to = this.sessionOf(m.toChar);
        const back = (text) => this.deliver(m.fromChar, { t: 'chat', ch: 'system', text }, m.fromLayer);
        if (!to) return back("They aren't online.");
        if (to.ignoring?.has(m.fromChar)) return back(`${to.name} isn't taking whispers from you.`);
        const msg = { t: 'chat', ch: 'whisper', from: m.from, to: to.name, text: m.text };
        to.send(msg);
        if (to.charId !== m.fromChar) this.deliver(m.fromChar, msg, m.fromLayer);
        return;
      }
      case 'deliver': this.sessionOf(m.toChar)?.send(m.msg); return;
      case 'announce': for (const o of this.sessions.values()) o.send({ t: 'announce', text: m.text }); return;
      case 'kick':
        if (m.except === this.layer) return;
        for (const o of [...this.sessions.values()]) {
          if ((m.charId && o.charId === m.charId) || (m.accountId && o.accountId === m.accountId)) {
            o.send({ t: 'kicked', reason: m.reason });
            o.ws.close(m.code ?? 4012, 'kicked');
            this.leave(o);
          }
        }
        return;
      case 'summon': {
        const o = this.sessionOf(m.charId);
        if (o) this.move(o, m.layer, { near: m.near });
        return;
      }
      default:
        this.social.onBus(m);
        this.parties.onBus(m);
        this.admin.onBus(m);
    }
  }

  system(text, except = null) {
    const msg = { t: 'chat', ch: 'system', text };
    for (const o of this.sessions.values()) if (o !== except) o.send(msg);
  }

  distance(a, b) {
    const pa = a.position;
    const pb = b.position;
    if (!pa || !pb) return Infinity;
    return Math.hypot(pa[0] - pb[0], pa[2] - pb[2]);
  }

  // Each tick, every player hears about the players around them: who came into view, who left,
  // fresh states, and the effects those players made.
  tick() {
    const now = Date.now();
    const dt = Math.min(0.1, (now - this.lastTick) / 1000);
    this.lastTick = now;
    this.tickNo++;
    const t0 = performance.now();
    try { this.simhost.tick(dt); } catch (err) { log.error('sim', err); }
    const list = [...this.sessions.values()];
    // Who's near whom, from a grid rebuilt each tick (not every pair of players).
    const grid = this.grid;
    grid.clear();
    for (const s of list) if (s.state) grid.add(s, s.state.p[0], s.state.p[2]);
    this.parties.tick(now);
    this.trades.tick(now);
    this.social.tick(now);
    for (const s of list) {
      const wire = s.ws._socket?.bytesWritten ?? s.wireOut;
      metrics.inc('wire_bytes_out', wire - s.wireOut);
      s.wireOut = wire;
      s.core.expire(this.simhost.sim.time);
      if (s.dirty && now - s.savedAt > SAVE_EVERY) this.saveCharacter(s);
      if (now > s.checkAt) {
        s.checkAt = now + CHECK_EVERY;
        s.send({ t: 'ch', h: s.core.hash() });
      }
    }
    for (const viewer of list) {
      if (!viewer.state) continue;
      const ps = [];
      const cand = new Set(grid.near(viewer.state.p[0], viewer.state.p[2], AOI * 1.15));
      for (const other of viewer.known.keys()) cand.add(other);
      for (const other of cand) {
        if (other === viewer || !other.state || !this.sessions.has(other.id)) continue;
        const d = this.distance(viewer, other);
        const near = d <= AOI;
        const seen = viewer.known.get(other);
        if (near && seen === undefined) {
          viewer.known.set(other, other.stateSeq);
          viewer.send({ t: 'add', name: other.name, look: other.look, ...other.profile(), s: other.state, rt: other.stateAt });
        } else if (!near && seen !== undefined && d > AOI * 1.15) {
          viewer.known.delete(other);
          viewer.send({ t: 'remove', id: other.id });
        } else if (seen !== undefined && seen !== other.stateSeq
          && (d <= LOD_MID || (this.tickNo + other.id) % (d <= LOD_FAR ? 2 : 3) === 0)) {
          viewer.known.set(other, other.stateSeq);
          ps.push(other.stateJson);
        }
      }
      const w = this.simhost.viewFor(viewer);
      if (ps.length || viewer.fxOut.length || (w && (w.ea.length || w.ed.length || w.es.length || w.ev.length))) {
        // Put together from JSON made once per state, rather than encoding every state again for
        // each player it goes to. One that only moves things along can be skipped by a connection
        // that's backed up ("d":1, which a gateway checks for too).
        const droppable = !(w && (w.ea.length || w.ed.length || w.ev.length));
        let text = `{"t":"snap",${droppable ? '"d":1,' : ''}"ts":${now},"ps":[${ps.join(',')}],"fx":${JSON.stringify(viewer.fxOut)}`;
        if (w) text += `,"ea":${JSON.stringify(w.ea)},"ed":${JSON.stringify(w.ed)},"es":[${w.es.join(',')}],"ev":[${w.ev.join(',')}]`;
        viewer.send(`${text}}`, droppable);
        viewer.fxOut = [];
      }
    }
    this.simhost.endTick();
    metrics.tick(performance.now() - t0);
  }

  // Drops connections that stopped answering pings (closed laptops, dead networks).
  heartbeat() {
    for (const s of this.sessions.values()) {
      if (!s.ws.isAlive) { s.ws.terminate(); continue; }
      s.ws.isAlive = false;
      s.ws.ping();
    }
  }

  // A player's look changed in a way others should see (their guild tag).
  relook(s) {
    const look = { t: 'look', ...s.profile() };
    for (const other of this.sessions.values()) if (other.known.has(s)) other.send(look);
  }

  // A player's saves go one after another (a slow write can never land after a newer one).
  saveCharacter(s) {
    if (s.state) s.extras.pos = s.state.p;
    const data = characterData(s.core, s.extras);
    const level = s.core.stats.level;
    s.dirty = false;
    s.savedAt = Date.now();
    s.saving = (s.saving ?? Promise.resolve())
      .then(() => this.store.saveCharacter(s.charId, data, level))
      .catch((err) => { s.dirty = true; log.error('realm', err, { saving: s.name }); });
    return s.saving;
  }

  // Closing: no one new comes here; everyone is saved and let go. In the cluster their screens
  // reconnect at once and the gateway puts them on another layer; on its own, they wait for this
  // server to come back.
  async shutdown(reason = 'The server is restarting.') {
    clearInterval(this.timer);
    clearInterval(this.announceTimer);
    clearInterval(this.presenceTimer);
    this.draining = true;
    await this.announce().catch(() => {});
    // Parties stay together: each goes, whole, to the least busy other layer.
    if (!this.standalone) await this.parties.evacuate().catch((err) => log.error('realm', err));
    const list = [...this.sessions.values()];
    for (const s of list) {
      if (this.standalone) {
        s.send({ t: 'kicked', reason });
        s.ws.close(1012, 'restart');
      } else s.ws.close(MOVING, 'moving');
    }
    await Promise.all(list.map((s) => this.leave(s)));
    await this.store.dropLayer(this.layer).catch(() => {});
  }
}
