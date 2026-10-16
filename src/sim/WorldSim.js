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
//   onCampCleared(camp) / onCampRestored(camp)
//   onHordeBroken(pack, last)  a roaming warband wiped out (`last`: the final kill)
//   onDefended(defence)        a place held against its waves (a quest's 'defend': Encounters.defend)
//   onRoomCleared(camp) / onRoomRestored(camp)  a dungeon room's encounter (sim/Dungeons.js)
//   worldEvents   true: run public events here (sim/WorldEvents.js), with
//   onEventEnd(ev) / onOverrun(place, on)        an event won or lost; a settlement overrun or freed
// }
// Players are proxies the host keeps current: { id, position, velocity, radius, height, alive }.
import * as THREE from 'three';
import { mulberry32 } from '../core/rng.js';
import { campUnits, campSquad, roamPack, roamHorde, strongholdWave } from '../combat/races.js';
import { TIERS, tierOf, campLayout } from '../world/campLayout.js';
import { inPocket } from '../world/dungeons.js';

const DEFEND = { first: 3, gap: 5, reach: 45, idle: 20 }; // a defence's waves, and how long it waits for someone
import { EnemySim } from './EnemySim.js';
import { enemyType } from './enemyDefs.js';
import { WorldEvents } from './WorldEvents.js';

// Attack tokens per player: how many enemies may be attacking one player at once — more as the
// crowd on them grows (`per` more enemies on them add one, up to `max`).
const TOKENS = { melee: { base: 3, per: 6, max: 5 }, ranged: { base: 3, per: 8, max: 5 } };
const LOD_RANGE = 40;      // idle enemies whose camp is further than this from everyone think less often
const LOD_STEP = 0.3;
const HORDE_CHANCE = 0.25; // of a roaming spawn in a region of level 10 and up, a warband instead
const HORDE_GAP = 320;     // metres between warbands
const WAVES = { first: 10, every: 22, count: 3, quiet: 90 }; // stronghold reinforcements
const SPAWN_DIST = 55;     // a dungeon room's; a camp's grow with it (reach)
const DESPAWN_DIST = 80;
const CAMP_REACH = 45;     // a camp wakes, and calls squads, with someone this far beyond its edge
const CAMP_LEAVE = 70;     // and sleeps once everyone's this far beyond it
const LULL = 30;           // seconds without squads after a camp's cleared
const QUIET_REFILL = 60;   // seconds after everyone's gone that a camp fills up again
const SQUAD_AGGRO = 30;    // a squad goes for someone this near its spawner, else to its posts
const FORGET_DIST = 400;
const RESPAWN_CLEARANCE = 26; // no player within this of a slot for it to refill (a dungeon room's)
export const MAX_CAMP_ENEMIES = 600; // alive across every camp: past it, squads wait
const ROAMERS_PER_PLAYER = 3;
const ROAM_DESPAWN = 95;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const FORT_INNER = 12.5;     // a stronghold's walls stand 15 m out from its middle (world/World.js buildFort)

// Where a camp's enemies may be put: inside a fort's walls, for a stronghold; anywhere otherwise.
const campKeep = (def) => (def?.style === 'fort'
  ? (x, z) => Math.abs(x - def.x) <= FORT_INNER && Math.abs(z - def.z) <= FORT_INNER
  : null);

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
    this.pressure = new Map(); // player id → enemies fighting them (this tick)
    this.decoys = [];          // holo-decoys: stand-ins enemies go for (addDecoy)
    this.timers = [];
    this.freezeAI = false;
    this.slow = null;          // optional (enemy) → time scale (offline hitstop)
    this.encounters = new Encounters(this);
    this.director = host.worldEvents ? new WorldEvents(this) : null; // public events
    this.bodies = [];          // scratch list for separate()
  }

  setPlayers(list) { this.players = list; }

  // A holo-decoy (combat/abilities.js): while it lasts, enemies near it go for it instead of its
  // owner (EnemySim.retarget scores it highly). Nothing can hurt it, and nobody's screen is hit.
  addDecoy({ id, owner, position, duration }) {
    this.decoys.push({
      id, owner, decoy: true, position: new THREE.Vector3().copy(position), velocity: new THREE.Vector3(),
      radius: 0.45, height: 2, alive: true, until: this.time + duration,
    });
  }
  playerById(id) { return id === null || id === undefined ? null : this.players.find((p) => p.id === id) ?? null; }
  emit(ev) { this.host.emit(ev); }
  after(delay, fn) { this.timers.push({ t: delay, fn }); }

  update(dt) {
    this.time += dt;
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const tm = this.timers[i];
      if ((tm.t -= dt) <= 0) { this.timers.splice(i, 1); tm.fn(); }
    }
    for (const d of this.decoys) {
      if (this.time < d.until) continue;
      d.alive = false;
      this.forgetPlayer(d.id);
    }
    if (this.decoys.some((d) => !d.alive)) this.decoys = this.decoys.filter((d) => d.alive);
    this.pressure.clear();
    for (const e of this.enemies) if (e.engaged && e.foe) this.pressure.set(e.foe.id, (this.pressure.get(e.foe.id) ?? 0) + 1);
    for (const e of this.enemies) {
      const step = this.slow ? dt * this.slow(e) : dt;
      // Far from everyone and doing nothing: think a few times a second, not every tick.
      if (!e.engaged && e.state === 'idle' && e.alive && (e.camp?.near ?? 0) > LOD_RANGE) {
        e.lodT = (e.lodT ?? 0) + step;
        if (e.lodT < LOD_STEP) continue;
        e.update(e.lodT);
        e.lodT = 0;
      } else e.update(step);
    }
    this.separate();
    for (let i = this.enemies.length - 1; i >= 0; i--) if (this.enemies[i].removeMe) this.removeEnemy(this.enemies[i]);
    this.encounters.update(this.time, dt);
    this.director?.update(dt);
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
    // Never inside a rock, a tent or a wall: the nearest spot nearby with room for it.
    if (this.world.clearSpot) {
      const at = this.world.clearSpot(e.position.x, e.position.z, e.radius, { height: e.height, keep: opts?.keep ?? campKeep(opts?.camp?.def) });
      if (at.moved) e.place(at.x, at.z);
    }
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
    this.director?.onKilled(e);
    // The last of a warband down: it's broken.
    const pack = e.camp;
    if (pack?.horde && !pack.broken && pack.enemies.every((x) => !x.alive)) {
      pack.broken = true;
      this.emit({ k: 'hordeDown', at: e.position, race: pack.race });
      this.host.onHordeBroken?.(pack, e);
    }
  }

  // ---------------------------------------------------------------- attack tokens, per player
  tokensOf(p) {
    let t = this.tokens.get(p.id);
    if (!t) this.tokens.set(p.id, (t = { melee: new Set(), ranged: new Set() }));
    return t;
  }
  tokenAvailable(e, kind) {
    if (!e.foe) return false;
    // A thing to defend can be set on by any number at once.
    if (e.foe.structure) return true;
    const set = this.tokensOf(e.foe)[kind];
    const T = TOKENS[kind];
    return set.has(e) || set.size < Math.min(T.max, T.base + Math.floor((this.pressure.get(e.foe.id) ?? 0) / T.per));
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

// What storming a stronghold is worth on top of its kills: half of what its garrison is worth.
export function strongholdXp(camp) {
  let xp = 0;
  for (const s of camp.slots) xp += enemyType(s.type, s.opts.variant, s.opts.elite ? 'x' : null, false, s.opts.champion).xp * camp.def.level;
  return xp * 0.5;
}

// Encounters in the endless world: camps and roaming packs, around every player.
// A camp's state is created when a player first comes near it (camps are generated with the
// world, so any number exist) and spawns its pack; it despawns (resetting) when everyone has left.
// Each slot respawns its enemy a while after it dies, once nobody is standing right there.
// Roaming packs belong to whichever race owns the ground they spawn on and scale with its level.
// A dungeon's rooms (sim/Dungeons.js) are camps too — their residents placed by the layout
// (`def.units`), coming back after `def.respawn` seconds (never, in a private run) — kept until
// the dungeon closes (dropCamps) rather than forgotten.
export class Encounters {
  constructor(sim) {
    this.sim = sim;
    this.camps = new Map();   // camp id → live state
    this.saved = {};          // camp id → [seconds until each slot respawns]
    this.roamers = [];
    this.roamTimer = 8;
    this.scanTimer = 0;
    this.defences = new Map(); // key → a place being held (defend)
  }

  get world() { return this.sim.world; }

  // A camp's layout (world/campLayout.js), laid out as the screens lay it out.
  layoutOf(def) { return campLayout(def, this.world.gen?.campProbe); }

  // How far beyond a camp's middle it wakes (a dungeon room: as it always has).
  reach(def) { return def.room ? SPAWN_DIST : def.radius + CAMP_REACH; }

  // A camp's garrison, one slot each: its own roster stood on its layout's posts (the boss on
  // its throne); a dungeon room's, where the dungeon put them.
  makeSlots(def) {
    if (def.units) return def.units.map((u) => ({ ...u, enemy: null, respawnAt: 0 }));
    const rng = mulberry32(def.seed ?? 1);
    const list = campUnits(def, rng);
    const L = this.layoutOf(def);
    let k = 0;
    return list.map((s) => {
      const at = (s.opts.boss ? L.throne ?? L.posts[0] : L.posts[k++ % Math.max(1, L.posts.length)]) ?? { x: 0, z: 0 };
      return { ...s, x: def.x + at.x, z: def.z + at.z, enemy: null, respawnAt: 0 };
    });
  }

  campFor(def) {
    let camp = this.camps.get(def.id);
    if (!camp) {
      camp = { def, state: 'dormant', slots: this.makeSlots(def), enemies: [], cleared: false, target: 0, nextWave: 0, lullUntil: 0, quietSince: null };
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
      const scan = Math.max(SPAWN_DIST, TIERS.base.R + CAMP_REACH) + 20;
      for (const p of players) for (const def of this.world.campsNear(p.position.x, p.position.z, scan)) this.campFor(def);
    }
    for (const camp of this.camps.values()) {
      const d = this.nearest(camp.def.x, camp.def.z);
      camp.near = d;
      if (camp.state === 'dormant') {
        if (d < this.reach(camp.def)) this.activate(camp, time);
        else if (d > FORGET_DIST && !camp.def.room) this.forget(camp, time);
        continue;
      }
      camp.enemies = camp.enemies.filter((e) => !e.removeMe || e.alive);
      if (d > (camp.def.room ? DESPAWN_DIST : camp.def.radius + CAMP_LEAVE) && !camp.enemies.some((e) => e.alive && e.engaged)) {
        this.despawn(camp, time);
        continue;
      }
      let alive = 0;
      if (camp.def.room) {
        // A dungeon room's residents come back one by one, `def.respawn` after each falls.
        for (const slot of camp.slots) {
          if (slot.enemy && slot.enemy.alive) { alive++; continue; }
          if (slot.enemy && !slot.enemy.alive) {
            slot.enemy = null;
            slot.respawnAt = time + (camp.def.respawn ?? 75) * (0.8 + Math.random() * 0.4);
          }
          if (!slot.enemy && time >= slot.respawnAt && this.nearest(slot.x, slot.z) > RESPAWN_CLEARANCE) {
            this.spawnSlot(camp, slot);
            alive++;
          }
        }
      } else {
        // A camp in the land is held by squads (updateWaves); the fallen wait for them.
        for (const slot of camp.slots) {
          if (slot.enemy && !slot.enemy.alive) { slot.enemy = null; slot.respawnAt = Infinity; }
        }
        alive = camp.enemies.reduce((n, e) => n + (e.alive ? 1 : 0), 0);
        // Emptied (the first time or again): a breather before the next squad.
        if (alive === 0 && !camp.empty) camp.lullUntil = time + LULL;
        camp.empty = alive === 0;
        alive = this.updateWaves(camp, time, alive);
      }
      // Cleared stays cleared (a quest's clear, a stronghold's bonus, once) until its garrison is
      // back of itself — the squads cut down as they come don't make it a camp to clear again.
      if (alive === 0 && !camp.cleared) {
        camp.cleared = true;
        camp.held = !camp.def.room;
        if (camp.def.room) this.sim.host.onRoomCleared?.(camp);
        else this.sim.host.onCampCleared?.(camp);
      } else if (alive > 0 && camp.cleared && !camp.held) {
        camp.cleared = false;
        if (camp.def.room) this.sim.host.onRoomRestored?.(camp);
        else this.sim.host.onCampRestored?.(camp);
      }
      if (camp.def.stronghold) this.updateStronghold(camp, time);
    }
    this.updateRoamers(time, dt);
    this.updateDefences(time, dt);
  }

  // ------------------------------------------------------------ defences
  // A place to hold (a quest's 'defend', rpg/questWatch.js): begun when someone who must hold it
  // stands there; waves of its faction march in from round its edge at whoever's there, each once
  // the last is down; the last one down and it's held (host.onDefended). Left alone a while, it's
  // called off. `spec`: { key, x, z, r, name, race, level, waves, gate? } — `gate`: the bearing of
  // a fenced place's way in, which its waves come at (from anywhere else they'd only meet the fence).
  defend(spec) {
    let d = this.defences.get(spec.key);
    if (d) return d;
    d = { ...spec, wave: 0, enemies: [], next: this.sim.time + DEFEND.first, idle: 0 };
    this.defences.set(spec.key, d);
    this.sim.emit({ k: 'defend', at: new THREE.Vector3(spec.x, 0, spec.z), name: spec.name, waves: spec.waves });
    return d;
  }

  updateDefences(time, dt) {
    for (const [key, d] of this.defences) {
      d.enemies = d.enemies.filter((e) => !e.gone);
      const there = this.sim.players.filter((p) => p.alive && Math.hypot(p.position.x - d.x, p.position.z - d.z) < d.r + DEFEND.reach);
      if (!there.length) {
        if ((d.idle += dt) > DEFEND.idle) {
          for (const e of d.enemies) if (!e.gone) this.sim.removeEnemy(e);
          this.defences.delete(key);
        }
        continue;
      }
      d.idle = 0;
      if (d.enemies.some((e) => e.alive)) continue;
      if (d.wave >= d.waves) {
        this.defences.delete(key);
        this.sim.emit({ k: 'held', at: new THREE.Vector3(d.x, 0, d.z), name: d.name });
        this.sim.host.onDefended?.(d);
        continue;
      }
      if (time < d.next) continue;
      d.wave++;
      d.next = time + DEFEND.gap;
      const units = roamPack(d.race, d.level, Math.random);
      if (d.wave === d.waves) units.push(...roamPack(d.race, d.level, Math.random).slice(0, 2));
      const foe = there[Math.floor(Math.random() * there.length)];
      // Through a gate, the whole wave comes down its line, close together; elsewhere from any side.
      const from = d.gate ?? Math.random() * Math.PI * 2;
      const spread = d.gate !== undefined ? 0.06 : 0.22;
      units.forEach((u, i) => {
        const a = from + (i - (units.length - 1) / 2) * spread;
        let x = d.x + Math.sin(a) * (d.r + 16);
        let z = d.z + Math.cos(a) * (d.r + 16);
        if (this.world.isWater(x, z)) { x = d.x + Math.sin(a) * d.r; z = d.z + Math.cos(a) * d.r; }
        const e = this.sim.spawnEnemy(u.type, new THREE.Vector3(x, 0, z), { level: d.level, camp: d, elite: u.opts.elite, variant: u.opts.variant, transient: true });
        d.enemies.push(e);
        e.aggro(true, foe);
      });
      this.sim.emit({ k: 'wave', at: new THREE.Vector3(d.x, 0, d.z), name: d.name, n: units.length, wave: d.wave, of: d.waves });
    }
  }

  // A stronghold under attack sounds the alarm, and reinforcements march in from its far side in
  // waves while its boss stands. Once the fight has been over a while, the alarm can go again.
  updateStronghold(camp, time) {
    const fighting = camp.enemies.some((e) => e.alive && e.engaged);
    const alarm = camp.alarm;
    if (!alarm) {
      if (!fighting) return;
      camp.alarm = { next: time + WAVES.first, left: WAVES.count, fought: time };
      this.sim.emit({ k: 'alarm', at: new THREE.Vector3(camp.def.x, 0, camp.def.z), p: [Math.round(camp.def.x), Math.round(camp.def.z)], name: camp.def.name, race: camp.def.race });
      return;
    }
    if (fighting) alarm.fought = time;
    else if (time - alarm.fought > WAVES.quiet) camp.alarm = null;
    const boss = camp.slots.find((s) => s.opts.boss)?.enemy;
    if (fighting && alarm.left > 0 && time >= alarm.next && boss?.alive) {
      alarm.left--;
      alarm.next = time + WAVES.every;
      this.spawnWave(camp);
    }
  }

  spawnWave(camp) {
    const def = camp.def;
    const foe = this.sim.players.filter((p) => p.alive).sort((a, b) => Math.hypot(a.position.x - def.x, a.position.z - def.z) - Math.hypot(b.position.x - def.x, b.position.z - def.z))[0];
    if (!foe) return;
    const units = strongholdWave(def, Math.random);
    const away = Math.atan2(def.x - foe.position.x, def.z - foe.position.z);
    const n = units.length;
    // A fort's come out of its keep, inside the walls on the side away from the fight (from
    // outside they'd have no way in but the gate); an open camp's march in from beyond its edge.
    const keep = campKeep(def);
    const out = keep ? FORT_INNER - 1.5 : def.radius + 5;
    units.forEach((u, i) => {
      const a = away + (i - (n - 1) / 2) * (keep ? 0.35 : 0.16);
      let x = def.x + Math.sin(a) * out;
      let z = def.z + Math.cos(a) * out;
      if (keep) {
        x = def.x + clamp(x - def.x, -FORT_INNER + 1, FORT_INNER - 1);
        z = def.z + clamp(z - def.z, -FORT_INNER + 1, FORT_INNER - 1);
      }
      if (this.world.isWater(x, z)) { x = def.x; z = def.z; }
      const e = this.sim.spawnEnemy(u.type, new THREE.Vector3(x, 0, z), { level: def.level, camp, elite: u.opts.elite, variant: u.opts.variant, transient: true });
      camp.enemies.push(e);
      e.aggro(true, foe);
    });
    this.sim.emit({ k: 'wave', at: new THREE.Vector3(def.x, 0, def.z), name: def.name, n });
  }

  // ------------------------------------------------------------ squads
  // A camp in the land, held: while someone alive is near it and it's short of its target (its
  // garrison, more for a crowd, up to its tier's cap), a squad comes from one of its spawners
  // every so often, filling its empty posts first. Cleared, it lulls a while. With nobody near,
  // it fills again a minute after the last of them left. Returns how many of it are alive.
  updateWaves(camp, time, alive) {
    const def = camp.def;
    const reach = this.reach(def);
    const live = this.sim.players.filter((p) => p.alive && Math.hypot(p.position.x - def.x, p.position.z - def.z) < reach);
    const T = TIERS[tierOf(def)];
    if (!live.length) {
      camp.quietSince ??= time;
      if (time - camp.quietSince >= QUIET_REFILL) {
        for (const slot of camp.slots) if (!slot.enemy) { this.spawnSlot(camp, slot); alive++; }
        camp.quietSince = time;
        camp.held = false;
      }
      return alive;
    }
    camp.quietSince = null;
    const crowd = Math.min(2.5, 1 + 0.5 * (live.length - 1));
    camp.target = Math.min(Math.round(camp.slots.length * crowd), T.cap);
    if (!camp.nextWave) camp.nextWave = time + T.every * (0.85 + Math.random() * 0.3);
    if (alive >= camp.target || time < camp.nextWave || time < camp.lullUntil) return alive;
    let all = 0;
    for (const c of this.camps.values()) for (const e of c.enemies) if (e.alive) all++;
    if (all >= MAX_CAMP_ENEMIES) { camp.nextWave = time + 5; return alive; }
    camp.nextWave = time + T.every * (0.85 + Math.random() * 0.3);
    const size = T.squad[0] + Math.floor(Math.random() * (T.squad[1] - T.squad[0] + 1));
    return alive + this.sendSquad(camp, live, Math.min(size, camp.target - alive, MAX_CAMP_ENEMIES - all));
  }

  // A squad of `n` from the camp's spawner furthest from those there: into its empty posts first
  // (never its boss's: a named foe comes back only with the camp), then more off its roster.
  sendSquad(camp, live, n) {
    const def = camp.def;
    const L = this.layoutOf(def);
    if (!L.spawners.length || n <= 0) return 0;
    const near = (x, z) => Math.min(...live.map((p) => Math.hypot(p.position.x - x, p.position.z - z)));
    const sp = L.spawners.reduce((b, q) => (near(def.x + q.x, def.z + q.z) > near(def.x + b.x, def.z + b.z) ? q : b));
    const sx = def.x + sp.x;
    const sz = def.z + sp.z;
    const foe = live.find((p) => Math.hypot(p.position.x - sx, p.position.z - sz) < SQUAD_AGGRO) ?? null;
    const empty = camp.slots.filter((s) => !s.enemy && !s.opts.boss).slice(0, n);
    const extra = campSquad(def, n - empty.length, Math.random);
    const spot = () => new THREE.Vector3(sx + (Math.random() - 0.5) * 4, 0, sz + (Math.random() - 0.5) * 4);
    let sent = 0;
    for (const slot of empty) {
      const e = this.spawnSlot(camp, slot, spot());
      if (foe) e.aggro(true, foe);
      sent++;
    }
    for (const u of extra) {
      const post = L.posts[Math.floor(Math.random() * L.posts.length)] ?? { x: 0, z: 0 };
      // (Not transient: a squad that finds nobody walks to its post and stays.)
      const e = this.sim.spawnEnemy(u.type, spot(), { level: def.level, camp, elite: u.opts.elite, variant: u.opts.variant });
      e.home.set(def.x + post.x, e.home.y, def.z + post.z);
      camp.enemies.push(e);
      if (foe) e.aggro(true, foe);
      sent++;
    }
    this.sim.emit({ k: 'reinforce', at: new THREE.Vector3(sx, 0, sz), p: [Math.round(sx), Math.round(sz)], race: def.race, kind: sp.kind, n: sent, name: def.name });
    return sent;
  }

  // Far-off camps leave memory; their respawn timers go into the saved table.
  forget(camp, time) {
    const left = camp.slots.map((s) => Math.max(0, Math.round(Math.min(s.respawnAt, time + QUIET_REFILL) - time)));
    if (left.some((v) => v > 0)) this.saved[camp.def.id] = left;
    else delete this.saved[camp.def.id];
    this.camps.delete(camp.def.id);
  }

  activate(camp, time) {
    camp.state = 'active';
    for (const slot of camp.slots) if (time >= slot.respawnAt) { this.spawnSlot(camp, slot); camp.held = false; }
  }

  // `at`: somewhere else it comes in from (a squad's spawner); its post stays its home.
  spawnSlot(camp, slot, at = null) {
    const level = camp.def.level + (slot.opts.boss ? 1 : Math.random() < 0.3 ? 1 : 0);
    // A story stronghold's boss has a name of its own (Ironjaw), and a tag quests know it by; so
    // does a dungeon's mini-boss.
    const story = slot.opts.boss ? camp.def.boss : slot.opts.name ? { name: slot.opts.name } : null;
    const e = this.sim.spawnEnemy(slot.type, at ?? new THREE.Vector3(slot.x, 0, slot.z), {
      level, camp, elite: slot.opts.elite, champion: slot.opts.champion, variant: slot.opts.variant, name: story?.name, tag: story?.tag,
    });
    if (at) e.home.set(slot.x, e.home.y, slot.z);
    slot.enemy = e;
    camp.enemies.push(e);
    return e;
  }

  // (`time`: a camp in the land fills again a minute after the last of them left it.)
  despawn(camp, time = null) {
    if (time !== null && !camp.def.room) {
      const refill = (camp.quietSince ?? time) + QUIET_REFILL;
      for (const slot of camp.slots) if (!slot.enemy || !slot.enemy.alive) slot.respawnAt = Math.min(slot.respawnAt, refill);
    }
    for (const slot of camp.slots) {
      if (slot.enemy) {
        this.sim.removeEnemy(slot.enemy);
        slot.enemy = null;
      }
    }
    for (const e of camp.enemies) if (!e.gone) this.sim.removeEnemy(e);
    camp.enemies = [];
    camp.state = 'dormant';
    camp.alarm = null;
  }

  // A dungeon closed (sim/Dungeons.js): its rooms' encounters and whoever's in them go.
  dropCamps(prefix) {
    for (const [id, camp] of this.camps) {
      if (!id.startsWith(prefix)) continue;
      this.despawn(camp);
      this.camps.delete(id);
    }
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
      pack.near = this.nearest(pack.home.x, pack.home.z);
      const far = pack.enemies.every((e) => this.nearest(e.position.x, e.position.z) > ROAM_DESPAWN);
      if (pack.enemies.length === 0 || (far && !pack.enemies.some((e) => e.engaged))) {
        for (const e of pack.enemies) sim.removeEnemy(e);
        pack.enemies = [];
        pack.dead = true;
      } else if (!pack.enemies.some((e) => e.engaged)) {
        // Drift the pack's home along its heading so it wanders the wilds (a warband marches).
        pack.home.addScaledVector(pack.dir, dt * (pack.horde ? 0.8 : 1.1));
        if (w.zoneAt(pack.home.x, pack.home.z, 30) || w.isWater(pack.home.x, pack.home.z) || Math.hypot(pack.home.x, pack.home.z) < 45) pack.dir.negate();
        for (const e of pack.enemies) e.home.set(pack.home.x + e.offset.x, 0, pack.home.z + e.offset.z);
      }
    }
    this.roamers = this.roamers.filter((r) => !r.dead);

    this.roamTimer -= dt;
    // (Nothing roams down in a dungeon.)
    const live = sim.players.filter((p) => p.alive && !inPocket(p.position.x));
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

  // A roaming pack — or, in regions of level 10 and up, sometimes a whole warband on the march.
  // `force` ({ horde, race, level }) overrides what the ground there would send (dev tools).
  spawnRoamers(x, z, force = null) {
    const region = this.world.regionAt(x, z);
    const level = force?.level ?? region.level;
    const race = force?.race ?? region.race;
    const horde = force?.horde ?? (level >= 10 && Math.random() < HORDE_CHANCE
      && !this.roamers.some((r) => r.horde && Math.hypot(r.home.x - x, r.home.z - z) < HORDE_GAP));
    const units = horde ? roamHorde(race, level, Math.random) : roamPack(race, level, Math.random);
    const pack = {
      home: new THREE.Vector3(x, 0, z), dir: new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize(), enemies: [], roamer: true,
      horde, race, level, xp: 0,
    };
    units.forEach((u, i) => {
      // A loose crowd: each a little further out round a spiral.
      const r = horde ? 1.3 * Math.sqrt(i + 1) : 2.5;
      const offset = new THREE.Vector3(Math.cos(i * 2.4) * r, 0, Math.sin(i * 2.4) * r);
      const e = this.sim.spawnEnemy(u.type, new THREE.Vector3(x + offset.x, 0, z + offset.z), {
        level, camp: pack, elite: u.opts.elite, champion: u.opts.champion, variant: u.opts.variant,
      });
      e.offset = offset;
      pack.xp += e.type.xp * level;
      pack.enemies.push(e);
    });
    this.roamers.push(pack);
    if (horde) this.sim.emit({ k: 'horde', at: pack.home.clone(), p: [Math.round(x), Math.round(z)], race, n: units.length });
  }

  // Save: per camp, seconds until each dead slot respawns (only camps with something pending).
  toJSON(time = this.sim.time) {
    const out = { ...this.saved };
    for (const camp of this.camps.values()) {
      if (camp.def.room) continue;
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
