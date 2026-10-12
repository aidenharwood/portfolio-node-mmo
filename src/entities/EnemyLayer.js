// The enemies on this screen and where they come from. Offline, the layer runs the world
// simulation itself (src/sim/WorldSim.js) for the one local player; online, the server runs it
// and the layer follows its snapshots (net/EnemyReplica.js). Either way it keeps one view
// (entities/Enemy.js) per enemy in `game.enemies`, carries the local player's hits and statuses
// back to the sim, and turns the sim's events — shots, blasts, blinks, wards, heals, deaths — into
// effects (and, for shots and blasts, into danger for the local player).
import * as THREE from 'three';
import { WorldSim } from '../sim/WorldSim.js';
import { EnemyReplica } from '../net/EnemyReplica.js';
import { Enemy, prewarmRace, RACE_GLOW } from './Enemy.js';
import { ELEMENTS } from '../items/elements.js';

// Projectile looks by the sim's `proj`.
const PROJ = {
  arrow: { kind: 'arrow', color: 0xd8c9a3, size: 1 },
  energy: { kind: 'bolt', color: 0x3ad8ff, size: 0.6 },
  void: { kind: 'orb', color: 0xb46aff, size: 0.5 },
  web: { kind: 'web', color: 0xeef2f8, size: 1 },
  bomb: { kind: 'bomb', color: 0xffb030, size: 1 },
};
const INTERP_DELAY = 100; // ms: server enemies are shown this far in the past (two ticks)
const EVENT_STALE = 400;  // ms: events this far behind when a frame comes round are dropped
const _o = new THREE.Vector3();
const _d = new THREE.Vector3();
const _p = new THREE.Vector3();
const _q = new THREE.Vector3();

export class EnemyLayer {
  constructor(game) {
    this.game = game;
    this.views = new Map();  // enemy id → view
    this.sim = null;         // offline: the local world sim
    this.myId = 0;
    this.warmTimer = 0;
    this.warmed = new Set();
    this.replicas = null;    // online: enemy id → replica of the server's enemy
    this.pending = [];       // online: events waiting for the render time to reach them
    this.cleared = new Set();
    this.remoteCamps = {
      isCleared: (id) => this.cleared.has(id),
      respawnAll() {}, disengageAll() {}, load() {},
      toJSON: () => ({}),
    };
  }

  get local() { return !!this.sim; }

  // Online: the server's world, followed through its snapshots (net/EnemyReplica.js).
  startRemote(cleared = []) {
    this.clear();
    this.myId = this.game.net.id;
    this.replicas = new Map();
    this.cleared = new Set(cleared);
  }

  // Offline: this screen's own world, one player.
  startLocal() {
    this.clear();
    const g = this.game;
    this.myId = 0;
    const me = {
      id: 0, radius: 0.45, height: 2.0,
      get position() { return g.player.position; },
      get velocity() { return g.player.velocity; },
      get alive() { return g.player.alive; },
    };
    this.sim = new WorldSim({
      world: g.world,
      emit: (ev) => this.onEvent(ev),
      onSpawn: (e) => this.addView(e),
      onRemove: (e) => this.removeView(e.id),
      onKilled: (e) => g.onEnemyKilled(this.views.get(e.id) ?? e),
      onCampCleared: (camp) => g.onCampCleared(camp),
    });
    this.sim.setPlayers([me]);
    // Hitstop holds the enemies in the exchange (the sim runs them at a crawl for the beat).
    this.sim.slow = (e) => {
      const v = this.views.get(e.id);
      return v && g.hitstopTimer > 0 && g.hitstopSet.has(v) ? 0.04 : 1;
    };
  }

  // Camps (for the map, the minimap and contracts): the local sim's, or what the server has said.
  get encounters() { return this.sim?.encounters ?? this.remoteCamps; }

  clear() {
    for (const id of [...this.views.keys()]) this.removeView(id);
    this.sim = null;
    this.replicas = null;
    this.pending.length = 0;
    this.cleared.clear();
  }

  // ---------------------------------------------------------------- online: the server's word
  onSnap(msg) {
    if (!this.replicas) return;
    const ts = msg.ts;
    for (const a of msg.ea ?? []) {
      if (this.replicas.has(a.id)) continue;
      const r = new EnemyReplica(a, ts);
      this.replicas.set(a.id, r);
      this.addView(r);
    }
    for (const id of msg.ed ?? []) {
      this.replicas.delete(id);
      this.removeView(id);
    }
    for (const s of msg.es ?? []) this.replicas.get(s[0])?.push(ts, s);
    for (const ev of msg.ev ?? []) this.pending.push({ ts, ev });
  }

  onCamp({ id, cleared, near, name }) {
    if (cleared) this.cleared.add(id);
    else this.cleared.delete(id);
    if (cleared && near) this.game.onCampCleared({ def: { id, name } });
  }

  spawn(type, position, opts) {
    if (!this.sim) return null;
    const e = this.sim.spawnEnemy(type, position, opts);
    return this.views.get(e.id) ?? null;
  }

  addView(src) {
    const v = new Enemy(this.game, src, this);
    this.views.set(src.id, v);
    this.game.enemies.push(v);
    this.game.scene.add(v.root);
    return v;
  }

  removeView(id) {
    const v = this.views.get(id);
    if (!v) return;
    this.views.delete(id);
    const list = this.game.enemies;
    const i = list.indexOf(v);
    if (i !== -1) list.splice(i, 1);
    this.game.scene.remove(v.root);
    v.dispose();
  }

  // The player a sim target refers to, on this screen (the local player or another player's view).
  playerFor(foe) {
    const id = foe && typeof foe === 'object' ? foe.id : foe;
    if (id === null || id === undefined) return null;
    if (id === this.myId) return this.game.player;
    return this.game.remotes?.byId.get(id) ?? null;
  }

  update(dt, held) {
    const g = this.game;
    if (this.sim) {
      this.sim.freezeAI = !!g.dev?.flags.freezeAI;
      this.sim.update(dt);
    } else if (this.replicas) {
      // Shown a little in the past; events play when the render time reaches them, in step with
      // the enemies they come from (stale ones — a tab in the background — are dropped).
      const T = g.net.serverNow() - INTERP_DELAY;
      for (const r of this.replicas.values()) r.update(T);
      let n = 0;
      while (n < this.pending.length && this.pending[n].ts <= T) n++;
      for (const { ts, ev } of this.pending.splice(0, n)) if (T - ts < EVENT_STALE) this.onEvent(ev);
    }
    for (const v of [...g.enemies]) v.update(held(v));
    // Build the models of races whose land is near before their first camp shows up.
    this.warmTimer -= dt;
    if (this.warmTimer <= 0) {
      this.warmTimer = 3;
      const p = g.player.position;
      const races = new Set([g.world.regionAt(p.x, p.z).race]);
      for (const def of g.world.poisNear(p.x, p.z, 260, ['camp'])) races.add(def.race);
      for (const r of races) if (r && !this.warmed.has(r)) { this.warmed.add(r); prewarmRace(r); }
    }
  }

  // ---------------------------------------------------------------- hits from this screen
  reportHit(view, hit) {
    const msg = {
      by: this.myId, damage: hit.damage, source: hit.source, poise: hit.poise ?? 0, knockback: hit.knockback ?? 0,
      dir: { x: hit.direction?.x ?? 0, z: hit.direction?.z ?? 0 },
    };
    if (this.sim) {
      this.sim.applyHit(view.id, msg);
      view.hp = view.src.hp;
      view.alive = view.src.alive;
      return;
    }
    // Online: reported to the server, and shown at once (a kill too) — the server's word follows.
    const r = (v) => Math.round(v * 100) / 100;
    this.game.net.send({ t: 'hit', id: view.id, d: msg.damage, src: msg.source, po: msg.poise, kb: msg.knockback, dx: r(msg.dir.x), dz: r(msg.dir.z) });
    view.hp = Math.max(0, view.hp - msg.damage);
    view.predicted = 0.6;
    if (view.hp <= 0) view.alive = false;
  }

  reportStatus(view, el, potency) {
    if (this.sim) view.src.addStatus(el, potency, this.myId);
    else this.game.net.send({ t: 'st', id: view.id, el, po: Math.round(potency) });
  }

  // Dev: kill outright.
  kill(view) {
    if (this.sim) this.sim.applyHit(view.id, { by: this.myId, damage: view.src.hp + 1, source: 'status', dir: { x: 0, z: 1 } });
  }

  // ---------------------------------------------------------------- the sim's events
  onEvent(ev) {
    const g = this.game;
    const v = ev.id !== undefined ? this.views.get(ev.id) : null;
    switch (ev.k) {
      case 'shot': this.shot(ev, v); break;
      case 'boom': {
        _p.fromArray(ev.p);
        const owner = v ?? this.ghost(ev);
        g.explode(_p, ev.r, ev.dmg, owner, null, {
          color: ev.nova ? RACE_GLOW.hollow : ev.el ? ELEMENTS[ev.el].color : 0xff5a2a,
          knockback: ev.kb, scaled: true, element: ev.el, inflict: ev.el,
        });
        if (ev.nova) g.effects.spawnRing(_p, ev.r, RACE_GLOW.hollow);
        if (ev.sh) g.rig.addShake(ev.sh * Math.max(0, 1 - _p.distanceTo(g.player.position) / 40));
        break;
      }
      case 'tele':
        _p.fromArray(ev.p);
        g.effects.spawnTelegraph(_p, ev.r, ev.t, ev.el ? ELEMENTS[ev.el]?.color ?? 0x9be22d : 0x9be22d);
        if (ev.fuse) g.audio.fuse?.(_p, ev.t);
        break;
      case 'blink': {
        const h = v ? v.height * 0.5 : 0.9;
        _p.fromArray(ev.from).setY(ev.from[1] + h);
        g.effects.spawnPuff(_p, { size: 1.6, life: 0.5, color: 0x2a1a3a });
        g.effects.glow(_p, RACE_GLOW.hollow, { size: 2, grow: 1, life: 0.3 });
        _q.fromArray(ev.to).setY(ev.to[1] + h);
        g.effects.glow(_q, RACE_GLOW.hollow, { size: 2.2, grow: 0.6, life: 0.35 });
        g.audio.blink?.(_q);
        break;
      }
      case 'ward': {
        const t = this.views.get(ev.to);
        if (!v || !t) break;
        const from = v.muzzle(_o);
        _p.copy(t.position).setY(t.position.y + t.height * 0.6);
        const color = ev.el === 'shock' ? 0x58cfff : RACE_GLOW.goblin;
        g.effects.spawnBolt(from, _p, color);
        g.effects.spawnRing(t.position, t.radius * 2.5, color);
        g.audio.ward?.(_p);
        break;
      }
      case 'heal':
        for (const [id, amount] of ev.list) {
          const t = this.views.get(id);
          if (!t) continue;
          g.effects.spawnRing(t.position, t.radius * 2.2, 0x9be22d);
          _p.copy(t.position).setY(t.position.y + t.height * 0.7);
          g.effects.damageNumber(_p, `+${amount}`, 'xp', '#9be22d');
        }
        if (v) {
          g.effects.spawnRing(v.position, ev.r, 0x9be22d);
          g.audio.ward?.(v.position, true);
        }
        break;
      case 'howl':
        if (v) g.effects.spawnRing(v.position, ev.r * 0.5, 0xff4a2a);
        break;
      case 'dmg':
        if (v) {
          _p.copy(v.position).setY(v.position.y + v.height * 0.7);
          g.effects.damageNumber(_p, ev.n, '', ELEMENTS[ev.el]?.css ?? null);
        }
        break;
      case 'poof':
        if (v) g.effects.spawnPuff(v.position, { size: 1.4, life: 0.6, color: 0x3a3440 });
        break;
      case 'die':
        if (v) g.audio.kill(v.position, !!(v.type.boss || v.elite));
        break;
    }
  }

  // A stand-in shooter for an enemy this screen doesn't have (just out of view).
  ghost(ev) {
    return { faction: 'enemy', damageMultiplier: 1, critBonus: 0, position: new THREE.Vector3().fromArray(ev.o ?? ev.p), radius: 0.5, height: 1.8, alive: true, remote: false };
  }

  // An enemy projectile: flown on every screen, dangerous only to the player it reaches here.
  shot(ev, v) {
    const g = this.game;
    const look = PROJ[ev.proj] ?? PROJ.arrow;
    const el = ev.el;
    const color = ev.proj === 'bomb' ? (el ? ELEMENTS[el].color : 0xffb030) : el && look.kind !== 'arrow' ? ELEMENTS[el].color : look.color;
    _o.fromArray(ev.o);
    _d.fromArray(ev.d);
    // Bolts leave the shooter's hand (or staff) as this screen draws it.
    if (v && (look.kind === 'bolt' || look.kind === 'orb')) v.muzzle(_o);
    const homing = ev.hom ? { turn: ev.hom.turn, time: ev.hom.time, target: this.playerFor(ev.hom.tid) } : null;
    g.projectiles.spawn({
      kind: look.kind, owner: v ?? this.ghost(ev), origin: _o.clone(), direction: _d.clone(), speed: ev.sp, damage: ev.dmg,
      knockback: ev.kb ?? 3, color, size: ev.proj === 'bomb' ? (ev.big ? 1.6 : 1) : look.size, life: ev.life, scaled: true,
      pierce: ev.pi ?? 0, element: el, inflict: ev.inf, homing: homing?.target ? homing : null,
      gravity: ev.gv ?? 0, aoe: ev.ao ?? 0, fuse: ev.fu ?? 0,
    });
    if (ev.proj === 'bomb') {
      _p.fromArray(ev.lp);
      g.effects.spawnTelegraph(_p, ev.ao, ev.lt, el === 'shock' ? 0x3ad8ff : 0xff5a1a);
      if (ev.m && v) g.audio.swing({ pos: v.position, weight: 0.6, dur: 0.25 });
    } else if (ev.m) {
      if (ev.proj === 'arrow') g.audio.bow(_o);
      else {
        if (ev.proj === 'energy') g.effects.spawnMuzzle?.(_o, PROJ.energy.color, _d, 0.6);
        g.audio.enemyShot?.(_o, ev.proj);
      }
    }
  }
}
