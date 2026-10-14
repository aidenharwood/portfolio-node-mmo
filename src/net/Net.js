// Online play. Finds out whether the page was served by the Cel Blade server (server/), talks to
// its account API, and runs the realm connection: sends our state ~15 Hz plus cosmetic effects,
// receives other players, chat and clock sync. Without a server the game runs offline as before.
// Protocol: see server/realm.js.
const TOKEN_KEY = 'celblade.session.v1';
const SEND_INTERVAL = 1 / 15;
const PING_INTERVAL = 2;
const PROFILE_CHECK = 0.4;
const MAX_FX = 16;

const r3 = (v) => Math.round(v * 1000) / 1000;
const vec = (v) => [r3(v.x), r3(v.y), r3(v.z)];

export class Net {
  constructor(game) {
    this.game = game;
    this.mode = 'probing'; // probing | offline | online
    this.status = null;
    this.account = null;   // { name } once signed in
    this.ws = null;
    this.inWorld = false;
    this.id = null;
    this.character = null;
    this.offset = 0;       // server clock − performance.now()
    this.rtt = 0;
    this.bestRtt = Infinity;
    this.sendTimer = 0;
    this.pingTimer = 0;
    this.profileTimer = 0;
    this.profileKey = '';
    this.fx = [];
    this.lastShotAt = -1;
  }

  get online() { return this.mode === 'online'; }
  // The sign-in is this window's own (sessionStorage), so two windows can play two accounts side by
  // side; the latest one is also remembered (localStorage) for windows opened later.
  get token() {
    try { return sessionStorage.getItem(TOKEN_KEY) ?? localStorage.getItem(TOKEN_KEY); } catch { return null; }
  }
  set token(v) {
    try {
      if (v) { sessionStorage.setItem(TOKEN_KEY, v); localStorage.setItem(TOKEN_KEY, v); } else {
        // Signed out here: forget this window's, and the remembered one only if it was this one's.
        if (localStorage.getItem(TOKEN_KEY) === sessionStorage.getItem(TOKEN_KEY)) localStorage.removeItem(TOKEN_KEY);
        sessionStorage.removeItem(TOKEN_KEY);
      }
    } catch { /* storage unavailable */ }
  }

  // ---------------------------------------------------------------- server and account API
  async probe() {
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 2500);
      const res = await fetch('/api/status', { signal: ctl.signal, cache: 'no-store' });
      clearTimeout(timer);
      const json = res.ok ? await res.json() : null;
      // A server running older code than the game files it hands out (changed since it started, or
      // from before it could tell) would disagree with this client about the world and its rules:
      // stay offline until it restarts.
      this.outdated = !!json?.online && (!json.build || json.stale === true);
      this.mode = json?.online && !this.outdated ? 'online' : 'offline';
      this.status = json;
    } catch {
      this.mode = 'offline';
    }
    return this.mode;
  }

  async request(method, path, body) {
    const token = this.token;
    let res;
    try {
      res = await fetch(path, {
        method,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        cache: 'no-store',
      });
    } catch {
      throw new Error("Can't reach the server.");
    }
    const json = await res.json().catch(() => ({}));
    if (res.status === 401 && token) { this.token = null; this.account = null; }
    if (!res.ok) throw new Error(json.error ?? `Server error (${res.status}).`);
    return json;
  }

  async signIn(name, password, register = false) {
    const out = await this.request('POST', register ? '/api/register' : '/api/login', { name, password });
    this.token = out.token;
    this.account = out.account;
    return out.account;
  }

  async signOut() {
    try { await this.request('POST', '/api/logout'); } catch { /* signing out locally regardless */ }
    this.token = null;
    this.account = null;
  }

  async characters() {
    const out = await this.request('GET', '/api/characters');
    this.account = out.account;
    return out.characters;
  }

  createCharacter(name, look) { return this.request('POST', '/api/characters', { name, look }).then((o) => o.character); }
  deleteCharacter(id) { return this.request('DELETE', `/api/characters/${id}`); }

  // ---------------------------------------------------------------- realm connection
  // Resolves with the welcome (world seed and the character's save) once the realm accepts us.
  connect(characterId) {
    this.disconnect();
    return new Promise((resolve, reject) => {
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${proto}//${location.host}/ws`);
      this.ws = ws;
      let welcomed = false;
      ws.onopen = () => ws.send(JSON.stringify({ t: 'auth', token: this.token, character: characterId }));
      ws.onmessage = (e) => {
        let msg;
        try { msg = JSON.parse(e.data); } catch { return; }
        if (!welcomed) {
          if (msg.t === 'welcome') {
            welcomed = true;
            this.onWelcome(msg);
            resolve(msg);
          } else if (msg.t === 'error') { ws.refusal = msg.error; }
          return;
        }
        this.onMessage(msg);
      };
      ws.onclose = (e) => {
        if (this.ws !== ws) return;
        const was = this.inWorld;
        this.ws = null;
        this.inWorld = false;
        if (!welcomed) reject(Object.assign(new Error(ws.refusal ?? "Couldn't join the world."), { code: e.code }));
        else if (was) this.game.onDisconnected(this.kickReason ?? (e.code === 1012 ? 'The server is restarting.' : 'Lost connection to the server.'), e.code);
        this.kickReason = null;
      };
    });
  }

  disconnect() {
    const ws = this.ws;
    this.ws = null;
    this.inWorld = false;
    this.id = null;
    if (ws && ws.readyState <= 1) ws.close(1000, 'bye');
    this.game.remotes?.clear();
    this.game.partyUI?.clear();
    this.game.tradeUI?.clear();
    this.game.socialUI?.clear();
    if (this.game.enemyLayer?.replicas) this.game.enemyLayer.clear();
  }

  send(msg) {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(msg));
  }

  onWelcome(msg) {
    this.id = msg.id;
    this.character = msg.character;
    this.offset = msg.time - performance.now();
    this.bestRtt = Infinity;
    this.inWorld = true;
    this.profileKey = '';
    this.fx = [];
  }

  onMessage(msg) {
    const g = this.game;
    switch (msg.t) {
      case 'add': g.remotes.add(msg); break;
      case 'remove': g.remotes.remove(msg.id); break;
      case 'look': g.remotes.look(msg); break;
      case 'snap': g.remotes.snap(msg); g.enemyLayer.onSnap(msg); break;
      case 'camp': g.enemyLayer.onCamp(msg); break;
      case 'dun': g.dungeonView.onState(msg); break;
      case 'wev': g.eventUI.onState(msg); break;
      case 'ovr': g.eventUI.onOverrun(msg); break;
      case 'party': g.partyUI.set(msg.party); break;
      case 'invite': g.partyUI.invited(msg); break;
      case 'pp': g.partyUI.positions(msg.pp); break;
      case 'raid': g.raidUI.set(msg.raid); break;
      case 'rinvite': g.raidUI.invited(msg); break;
      case 'rp': g.raidUI.positions(msg.rp); break;
      case 'tradeReq': g.tradeUI.requested(msg.from); break;
      case 'trade': g.tradeUI.set(msg.state, msg.reason); break;
      case 'social': g.socialUI.set(msg); break;
      case 'mail': g.socialUI.setMail(msg.list); break;
      case 'mailNew': g.hud.toast(`New mail from ${msg.from}`); g.chat.add({ ch: 'system', text: `New mail from ${msg.from} — open Mail in the menu.` }); break;
      case 'announce': g.hud.banner('Announcement', msg.text); g.chat.add({ ch: 'system', text: `[Announcement] ${msg.text}` }); break;
      // The character (net/CharacterLink.js): answers to our changes, the server's own changes,
      // the whole thing on a resync, and fingerprints.
      case 'opr': g.charLink.onAck(msg); break;
      case 'sop': g.charLink.onServerOp(msg.op); break;
      case 'char': g.loadCharacter(msg.data, msg.ground); break;
      case 'ch': g.charLink.onCheck(msg.h); break;
      // Somewhere we couldn't have got to (too fast): back where the server last had us.
      case 'pos': g.player.position.fromArray(msg.p); g.player.velocity.set(0, 0, 0); g.player.vy = 0; break;
      case 'chat': g.chat.add(msg); break;
      case 'pong': this.onPong(msg); break;
      case 'kicked': this.kickReason = msg.reason; break;
      case 'error': g.hud.toast(msg.error); break;
    }
  }

  // Clock sync: keep the offset from the fastest recent round trip (least queueing noise), and
  // let it drift slowly toward newer samples so a changed route doesn't strand it.
  onPong({ c, s }) {
    const now = performance.now();
    const rtt = now - c;
    this.rtt = this.rtt ? this.rtt * 0.8 + rtt * 0.2 : rtt;
    const offset = s - (c + rtt / 2);
    this.bestRtt = Math.min(this.bestRtt * 1.02, rtt);
    if (rtt <= this.bestRtt * 1.2) this.offset = this.offset * 0.7 + offset * 0.3;
  }

  serverNow() { return performance.now() + this.offset; }

  // ---------------------------------------------------------------- per frame
  update(dt) {
    if (!this.inWorld) return;
    if ((this.pingTimer -= dt) <= 0) {
      this.pingTimer = PING_INTERVAL;
      this.send({ t: 'ping', c: performance.now() });
    }
    if ((this.profileTimer -= dt) <= 0) {
      this.profileTimer = PROFILE_CHECK;
      this.sendProfile();
    }
    if ((this.sendTimer -= dt) <= 0) {
      this.sendTimer += SEND_INTERVAL;
      if (this.sendTimer < 0) this.sendTimer = SEND_INTERVAL;
      this.sendState();
      if (this.fx.length) {
        this.send({ t: 'fx', list: this.fx.splice(0, MAX_FX) });
        this.fx.length = 0;
      }
    }
  }

  sendState() {
    const g = this.game;
    const p = g.player;
    const fl = (p.sprinting ? 1 : 0) | (p.adsHeld ? 2 : 0) | (p.isAiming || p.charge > 0 ? 4 : 0) | (p.gliding ? 8 : 0) | (p.alive ? 0 : 16);
    this.send({
      t: 's', p: vec(p.position), f: r3(p.facing),
      v: [r3(p.velocity.x + p.knockback.x), r3(p.vy), r3(p.velocity.z + p.knockback.z)],
      gr: p.grounded ? 1 : 0, st: p.state, sT: r3(p.stateTime), ci: p.comboIndex ?? 0, aq: p.attackSeq ?? 0, fl,
      ay: r3(g.aim.dir.y), cy: r3(p.cameraYaw ?? p.facing), ft: r3(p.flipT), bj: r3(p.bulletJumpT),
      rt: r3(Math.max(0, p.reloadTimer)), ch: r3(p.charge), md: r3(p.mantle?.dur ?? 0), sa: r3(p.slideAttack?.t ?? 0),
      hp: r3(p.maxHp ? p.hp / p.maxHp : 1),
    });
  }

  // Level, weapon in hand and armour (as recipes), sent when any of them changes.
  sendProfile() {
    const g = this.game;
    const inv = g.player.inventory;
    const w = inv.current?.recipe ?? null;
    const a = {};
    for (const [slot, item] of Object.entries(inv.armor)) if (item) a[slot] = item.recipe;
    const msg = { t: 'profile', lv: g.stats.level, w, a, ti: g.settings.title ?? null };
    const key = JSON.stringify(msg);
    if (key === this.profileKey) return;
    this.profileKey = key;
    this.send(msg);
  }

  // ---------------------------------------------------------------- cosmetic effects for others
  // Our projectiles, re-created on other screens without damage. The first one of a frame (a
  // volley's first pellet) also carries the muzzle flash and the sound.
  shotFx(o) {
    if (!this.inWorld || this.fx.length >= MAX_FX) return;
    const first = this.lastShotAt !== this.game.time;
    this.lastShotAt = this.game.time;
    const fx = {
      k: 'shot', o: vec(o.origin), d: vec(o.direction), pk: o.kind, c: o.color ?? 0xffffff, sp: o.speed,
      lf: o.life ?? 1.5, gv: o.gravity ?? 0, m: first,
    };
    if (o.size) fx.sz = o.size;
    if (o.aoe) fx.ao = o.aoe;
    if (o.tracerColor !== undefined) fx.tc = o.tracerColor;
    if (o.bright) fx.br = true;
    if (o.tracerScale) fx.ts = o.tracerScale;
    if (o.accel) { fx.ac = o.accel; fx.ms = o.maxSpeed; }
    this.fx.push(fx);
  }

  // An ability used (entities/AbilityKit.js): the server checks it and shows it to everyone near.
  // `at`: where it went (a point), or a grenade's [origin, direction].
  ability(id, at) {
    if (!this.inWorld) return;
    const msg = { t: 'ab', id };
    if (Array.isArray(at)) { msg.o = vec(at[0]); msg.d = vec(at[1]); } else if (at?.isVector3) msg.p = vec(at);
    this.send(msg);
  }

  runeFx(pos, radius, color, delay) {
    if (!this.inWorld || this.fx.length >= MAX_FX) return;
    this.fx.push({ k: 'rune', p: vec(pos), r: radius, c: color, dl: delay });
  }
}
