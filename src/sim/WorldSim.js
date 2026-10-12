// The living world, simulated: every enemy, the camps and roaming packs they come from, and the
// rules between them and the players — for any number of players. The server runs one for the
// whole realm; offline single-player runs one locally with a single player. It has no models and
// draws nothing; what happens comes out as events (`host.emit`) and callbacks.
//
// host: {
//   world        terrain and colliders: groundHeight, collidersNear, resolve, isWater, blocks,
//                regionAt, zoneAt, poisNear, slopeAt, poiById
//   emit(ev)     something players should see or hear (shots, blasts, blinks, wards, deaths...)
//   onSpawn(e) / onRemove(e)
//   onKilled(e, hit, credit)   credit: [player id, damage] pairs, for rewards
//   onCampCleared(camp)
// }
// Players are proxies the host keeps current: { id, position, velocity, radius, height, alive }.
import * as THREE from 'three';
import { mulberry32 } from '../core/rng.js';
import { campUnits, roamPack } from '../combat/races.js';
import { EnemySim } from './EnemySim.js';

const TOKENS = { melee: 3, ranged: 3 };
const SPAWN_DIST = 55;
const DESPAWN_DIST = 80;
const FORGET_DIST = 400;
const RESPAWN_CLEARANCE = 26; // no player within this of a slot for it to refill
const ROAMERS_PER_PLAYER = 3;
const ROAM_DESPAWN = 95;

export class WorldSim {
  constructor(host) {
    this.host = host;
    this.world = host.world;
    this.time = 0;
    this.players = [];
    this.enemies = [];
    this.byId = new Map();
    this.nextId = 1;
    this.tokens = new Map();   // player id → { melee: Set, ranged: Set }
    this.timers = [];
    this.freezeAI = false;
    this.slow = null;          // optional (enemy) → time scale (offline hitstop)
    this.encounters = new Encounters(this);
    this.bodies = [];          // scratch list for separate()
  }

  setPlayers(list) { this.players = list; }
  playerById(id) { return id === null || id === undefined ? null : this.players.find((p) => p.id === id) ?? null; }
  emit(ev) { this.host.emit(ev); }
  after(delay, fn) { this.timers.push({ t: delay, fn }); }

  update(dt) {
    this.time += dt;
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const tm = this.timers[i];
      if ((tm.t -= dt) <= 0) { this.timers.splice(i, 1); tm.fn(); }
    }
    for (const e of this.enemies) e.update(this.slow ? dt * this.slow(e) : dt);
    this.separate();
    for (let i = this.enemies.length - 1; i >= 0; i--) if (this.enemies[i].removeMe) this.removeEnemy(this.enemies[i]);
    this.encounters.update(this.time, dt);
  }

  // Bodies don't overlap: enemies shove each other apart (heavier ones give way less) and step out
  // of players' way (each player's own screen moves the player). Bodies are sorted along x and
  // each only meets those within reach of it there, rather than every other body in the world.
  separate() {
    const bodies = this.bodies;
    bodies.length = 0;
    let reach = 0;
    for (const e of this.enemies) if (e.alive) { bodies.push(e); reach = Math.max(reach, e.radius); }
    if (!bodies.length) return;
    for (const p of this.players) if (p.alive) { bodies.push(p); reach = Math.max(reach, p.radius); }
    reach *= 2;
    bodies.sort((a, b) => a.position.x - b.position.x);
    for (let i = 0; i < bodies.length; i++) {
      const A = bodies[i];
      const enemyA = A instanceof EnemySim;
      for (let j = i + 1; j < bodies.length; j++) {
        const B = bodies[j];
        if (B.position.x - A.position.x > reach) break;
        const enemyB = B instanceof EnemySim;
        if (enemyA && enemyB) this.push(A, B, true);
        else if (enemyA) this.push(A, B, false);
        else if (enemyB) this.push(B, A, false);
      }
    }
  }

  push(A, B, both) {
    const a = A.position;
    const b = B.position;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const min = A.radius + B.radius;
    const d2 = dx * dx + dz * dz;
    if (d2 >= min * min || d2 === 0) return;
    if (a.y > b.y + B.height || b.y > a.y + A.height) return;
    const d = Math.sqrt(d2);
    const ma = A.mass ?? 1;
    const mb = B.mass ?? 1;
    if (!both) { a.x -= (dx / d) * (min - d); a.z -= (dz / d) * (min - d); return; }
    const pa = ((min - d) * mb) / (ma + mb);
    const pb = ((min - d) * ma) / (ma + mb);
    a.x -= (dx / d) * pa; a.z -= (dz / d) * pa;
    b.x += (dx / d) * pb; b.z += (dz / d) * pb;
  }

  spawnEnemy(type, position, opts) {
    const e = new EnemySim(this, this.nextId++, type, position, opts);
    this.enemies.push(e);
    this.byId.set(e.id, e);
    this.host.onSpawn?.(e);
    return e;
  }

  removeEnemy(e) {
    const i = this.enemies.indexOf(e);
    if (i !== -1) this.enemies.splice(i, 1);
    this.byId.delete(e.id);
    this.releaseToken(e);
    e.gone = true;
    this.host.onRemove?.(e);
  }

  // A hit reported by a player (offline: straight from the local game).
  applyHit(id, hit) {
    const e = this.byId.get(id);
    return e ? e.applyHit(hit) : false;
  }

  onKilled(e, hit) {
    this.host.onKilled?.(e, hit, [...e.credit]);
  }

  // ---------------------------------------------------------------- attack tokens, per player
  tokensOf(p) {
    let t = this.tokens.get(p.id);
    if (!t) this.tokens.set(p.id, (t = { melee: new Set(), ranged: new Set() }));
    return t;
  }
  tokenAvailable(e, kind) {
    if (!e.foe) return false;
    const set = this.tokensOf(e.foe)[kind];
    return set.has(e) || set.size < TOKENS[kind];
  }
  takeToken(e, kind) { if (e.foe) this.tokensOf(e.foe)[kind].add(e); }
  releaseToken(e) {
    for (const t of this.tokens.values()) { t.melee.delete(e); t.ranged.delete(e); }
  }

  alert(camp, from) {
    for (const e of camp.enemies) if (e !== from && e.alive && e.position.distanceTo(from.position) < 18) e.aggro(false, from.foe);
  }

  // A player left (or died, offline): enemies after them look for someone else or go home.
  forgetPlayer(id) {
    this.tokens.delete(id);
    for (const e of this.enemies) {
      e.threat.delete(id);
      if (e.foe?.id === id) e.retargetT = 0;
    }
  }
}

// Encounters in the endless world: camps and roaming packs, around every player.
// A camp's state is created when a player first comes near it (camps are generated with the
// world, so any number exist) and spawns its pack; it despawns (resetting) when everyone has left.
// Each slot respawns its enemy a while after it dies, once nobody is standing right there.
// Roaming packs belong to whichever race owns the ground they spawn on and scale with its level.
export class Encounters {
  constructor(sim) {
    this.sim = sim;
    this.camps = new Map();   // camp id → live state
    this.saved = {};          // camp id → [seconds until each slot respawns]
    this.roamers = [];
    this.roamTimer = 8;
    this.scanTimer = 0;
  }

  get world() { return this.sim.world; }

  makeSlots(def) {
    const rng = mulberry32(def.seed ?? 1);
    const list = campUnits(def, rng);
    return list.map((s, i) => {
      let x = def.x;
      let z = def.z;
      if (s.opts.boss) z -= def.radius * 0.6;
      else {
        const a = (i / list.length) * Math.PI * 2 + 0.4;
        const r = def.radius * (0.35 + ((i * 37) % 10) / 20);
        x += Math.cos(a) * r;
        z += Math.sin(a) * r;
      }
      return { ...s, x, z, enemy: null, respawnAt: 0 };
    });
  }

  campFor(def) {
    let camp = this.camps.get(def.id);
    if (!camp) {
      camp = { def, state: 'dormant', slots: this.makeSlots(def), enemies: [], cleared: false };
      const saved = this.saved[def.id];
      if (Array.isArray(saved)) camp.slots.forEach((s, i) => { s.respawnAt = this.sim.time + (saved[i] ?? 0); });
      this.camps.set(def.id, camp);
    }
    return camp;
  }

  isCleared(id) { return !!this.camps.get(id)?.cleared; }

  // Distance from (x, z) to the nearest player (alive or not: they're still there).
  nearest(x, z) {
    let d = Infinity;
    for (const p of this.sim.players) d = Math.min(d, Math.hypot(p.position.x - x, p.position.z - z));
    return d;
  }

  update(time, dt) {
    const players = this.sim.players;
    this.scanTimer -= dt;
    if (this.scanTimer <= 0) {
      this.scanTimer = 0.5;
      for (const p of players) for (const def of this.world.poisNear(p.position.x, p.position.z, SPAWN_DIST + 20, ['camp'])) this.campFor(def);
    }
    for (const camp of this.camps.values()) {
      const d = this.nearest(camp.def.x, camp.def.z);
      if (camp.state === 'dormant') {
        if (d < SPAWN_DIST) this.activate(camp, time);
        else if (d > FORGET_DIST) this.forget(camp, time);
        continue;
      }
      camp.enemies = camp.enemies.filter((e) => !e.removeMe || e.alive);
      if (d > DESPAWN_DIST && !camp.enemies.some((e) => e.alive && e.engaged)) {
        this.despawn(camp);
        continue;
      }
      let alive = 0;
      for (const slot of camp.slots) {
        if (slot.enemy && slot.enemy.alive) { alive++; continue; }
        if (slot.enemy && !slot.enemy.alive) {
          slot.enemy = null;
          slot.respawnAt = time + (camp.def.stronghold ? 300 : 75) * (0.8 + Math.random() * 0.4);
        }
        if (!slot.enemy && time >= slot.respawnAt && this.nearest(slot.x, slot.z) > RESPAWN_CLEARANCE) {
          this.spawnSlot(camp, slot);
          alive++;
        }
      }
      if (alive === 0 && !camp.cleared) {
        camp.cleared = true;
        this.sim.host.onCampCleared?.(camp);
      } else if (alive > 0 && camp.cleared) {
        camp.cleared = false;
        this.sim.host.onCampRestored?.(camp);
      }
    }
    this.updateRoamers(time, dt);
  }

  // Far-off camps leave memory; their respawn timers go into the saved table.
  forget(camp, time) {
    const left = camp.slots.map((s) => Math.max(0, Math.round(s.respawnAt - time)));
    if (left.some((v) => v > 0)) this.saved[camp.def.id] = left;
    else delete this.saved[camp.def.id];
    this.camps.delete(camp.def.id);
  }

  activate(camp, time) {
    camp.state = 'active';
    for (const slot of camp.slots) if (time >= slot.respawnAt) this.spawnSlot(camp, slot);
  }

  spawnSlot(camp, slot) {
    const level = camp.def.level + (slot.opts.boss ? 1 : Math.random() < 0.3 ? 1 : 0);
    const e = this.sim.spawnEnemy(slot.type, new THREE.Vector3(slot.x, 0, slot.z), { level, camp, elite: slot.opts.elite, variant: slot.opts.variant });
    slot.enemy = e;
    camp.enemies.push(e);
  }

  despawn(camp) {
    for (const slot of camp.slots) {
      if (slot.enemy) {
        this.sim.removeEnemy(slot.enemy);
        slot.enemy = null;
      }
    }
    camp.enemies = [];
    camp.state = 'dormant';
  }

  // Resting (single-player): everything dead comes back immediately.
  respawnAll() {
    for (const camp of this.camps.values()) for (const slot of camp.slots) slot.respawnAt = 0;
    this.saved = {};
  }

  disengageAll() {
    for (const e of this.sim.enemies) if (e.alive) e.leash();
  }

  // ------------------------------------------------------------ roaming packs
  updateRoamers(time, dt) {
    const sim = this.sim;
    const w = this.world;
    for (const pack of this.roamers) {
      pack.enemies = pack.enemies.filter((e) => !e.removeMe);
      const far = pack.enemies.every((e) => this.nearest(e.position.x, e.position.z) > ROAM_DESPAWN);
      if (pack.enemies.length === 0 || (far && !pack.enemies.some((e) => e.engaged))) {
        for (const e of pack.enemies) sim.removeEnemy(e);
        pack.enemies = [];
        pack.dead = true;
      } else if (!pack.enemies.some((e) => e.engaged)) {
        // Drift the pack's home along its heading so it wanders the wilds.
        pack.home.addScaledVector(pack.dir, dt * 1.1);
        if (w.zoneAt(pack.home.x, pack.home.z, 30) || w.isWater(pack.home.x, pack.home.z) || Math.hypot(pack.home.x, pack.home.z) < 45) pack.dir.negate();
        for (const e of pack.enemies) e.home.set(pack.home.x + e.offset.x, 0, pack.home.z + e.offset.z);
      }
    }
    this.roamers = this.roamers.filter((r) => !r.dead);

    this.roamTimer -= dt;
    const live = sim.players.filter((p) => p.alive);
    if (this.roamTimer > 0 || !live.length || this.roamers.length >= ROAMERS_PER_PLAYER * live.length) return;
    this.roamTimer = (15 + Math.random() * 15) / live.length;
    const p = live[Math.floor(Math.random() * live.length)].position;
    if (Math.hypot(p.x, p.z) < 30) return;
    for (let tries = 0; tries < 10; tries++) {
      const a = Math.random() * Math.PI * 2;
      const r = 60 + Math.random() * 25;
      const x = p.x + Math.cos(a) * r;
      const z = p.z + Math.sin(a) * r;
      if (w.zoneAt(x, z, 30) || w.isWater(x, z) || Math.hypot(x, z) < 45) continue;
      if (w.slopeAt(x, z) > 0.6) continue;
      if (this.nearest(x, z) < 50) continue; // not on top of someone else
      this.spawnRoamers(x, z);
      return;
    }
  }

  spawnRoamers(x, z) {
    const region = this.world.regionAt(x, z);
    const level = region.level;
    const units = roamPack(region.race, level, Math.random);
    const pack = { home: new THREE.Vector3(x, 0, z), dir: new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize(), enemies: [], roamer: true };
    units.forEach((u, i) => {
      const offset = new THREE.Vector3(Math.cos(i * 2.1) * 2.5, 0, Math.sin(i * 2.1) * 2.5);
      const e = this.sim.spawnEnemy(u.type, new THREE.Vector3(x + offset.x, 0, z + offset.z), { level, camp: pack, elite: u.opts.elite, variant: u.opts.variant });
      e.offset = offset;
      pack.enemies.push(e);
    });
    this.roamers.push(pack);
  }

  // Save: per camp, seconds until each dead slot respawns (only camps with something pending).
  toJSON(time = this.sim.time) {
    const out = { ...this.saved };
    for (const camp of this.camps.values()) {
      const left = camp.slots.map((s) => Math.max(0, Math.round(s.respawnAt - time)));
      if (left.some((v) => v > 0)) out[camp.def.id] = left;
      else delete out[camp.def.id];
    }
    return out;
  }

  load(data) {
    this.camps.clear();
    this.saved = {};
    for (const [id, list] of Object.entries(data ?? {})) if (id.includes(':') && Array.isArray(list)) this.saved[id] = list;
  }
}
