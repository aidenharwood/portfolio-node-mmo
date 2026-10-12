// The realm's world simulation: the shared WorldSim (src/sim/) running every enemy for every
// player, on the headless world (server/world.js). The realm (server/realm.js) feeds it player
// states and hit reports and asks it, per player per tick, what that player should hear about.
//
// Protocol additions (inside the realm's snap, and messages of their own):
//   server → client, in snap:  ea [enemy add], ed [ids removed], es [enemy states], ev [events]
//     enemy add   { id, t, v, lv, el, su, mh, hp, s }        (s: a state, as in es)
//     state       [id, x, y, z, facing, vx, vz, state, stateTime, attack, hitIndex, hp, flags, lift,
//                  alt, foe, attackSeq, maxHp]
//     event       see src/sim/EnemySim.js (shot, boom, tele, blink, ward, heal, howl, dmg, poof, die)
//   server → client:  reward { xp, gold, kill, at, loot: [recipe] }   ·   camp { id, cleared, near }
//   client → server:  hit { id, d, src, po, kb, dx, dz }   ·   st { id, el, po }
import * as THREE from 'three';
import { HeadlessWorld } from './world.js';
import { WorldSim } from '../src/sim/WorldSim.js';
import { STATE_CODE, FLAG } from '../src/sim/enemyDefs.js';
import { rewardRoll } from '../src/rpg/CharacterCore.js';
import { maxHit } from './characters.js';
import { PARTY_RANGE } from './parties.js';
import { Grid, metrics } from './ops.js';

const EAOI = 110;          // metres: enemies further than this from a player aren't sent to them
const EVENT_RANGE = 130;
const SHARE_RANGE = 60;    // players this close to a kill share in it
const MELEE_REACH = 12;    // generous: lunges, lag, big enemies
const SHOT_REACH = 240;
const KEEPALIVE = 1000;    // ms: an enemy that hasn't changed is still re-sent this often
const STATUSES = new Set(['fire', 'frost', 'corrosive', 'shock']);
const MAX_SPEED = 50;      // m/s across the ground (bullet-jump chains top out around 36)
const MOVE_BANK = 2;       // seconds of movement a player may bank (delayed, bunched-up states)
const r2 = (v) => Math.round(v * 100) / 100;

export class SimHost {
  constructor(realm, seed) {
    this.realm = realm;
    this.world = new HeadlessWorld(seed);
    this.sim = new WorldSim(this);
    this.events = [];
    this.snaps = new Map();    // enemy → { s, json }: its state this tick (see snapOf)
    this.cleared = new Set();
    this.grid = new Grid(64);
  }

  // ---------------------------------------------------------------- host interface for WorldSim
  emit(ev) { this.events.push(ev); }

  onKilled(e, hit, credit) {
    metrics.inc('kills');
    this.emit({ k: 'die', id: e.id, at: e.position });
    const near = new Set(credit.map(([id]) => id));
    for (const p of this.sim.players) {
      if (p.alive && Math.hypot(p.position.x - e.position.x, p.position.z - e.position.z) <= SHARE_RANGE) near.add(p.id);
    }
    // Party members a little further off share in it too.
    for (const id of [...near]) {
      const s = this.realm.sessions.get(id);
      if (!s) continue;
      for (const m of this.realm.parties.mates(s)) {
        const q = m.proxy?.position;
        if (m.proxy?.placed && q && Math.hypot(q.x - e.position.x, q.z - e.position.z) <= PARTY_RANGE) near.add(m.id);
      }
    }
    // Each credited character gets their own roll (XP for their level, their own loot).
    for (const id of near) {
      const s = this.realm.sessions.get(id);
      if (!s?.core) continue;
      const op = { op: 'reward', roll: rewardRoll(e, s.core.stats.level, () => s.core.gid()) };
      s.core.time = this.sim.time;
      s.core.apply(op);
      s.dirty = true;
      s.level = s.core.stats.level;
      s.send({ t: 'sop', op });
    }
  }

  onCampCleared(camp) { this.campChanged(camp, true); }
  onCampRestored(camp) { this.campChanged(camp, false); }

  campChanged(camp, cleared) {
    if (cleared) this.cleared.add(camp.def.id);
    else this.cleared.delete(camp.def.id);
    const dist = (s) => {
      const p = s.proxy?.position;
      return p ? Math.hypot(p.x - camp.def.x, p.z - camp.def.z) : Infinity;
    };
    const there = new Set([...this.realm.sessions.values()].filter((s) => dist(s) < camp.def.radius + 60));
    // Party members of those who were there, within reach, count as there.
    for (const s of [...there]) for (const m of this.realm.parties.mates(s)) if (dist(m) <= PARTY_RANGE) there.add(m);
    for (const s of this.realm.sessions.values()) {
      const near = there.has(s);
      s.send({ t: 'camp', id: camp.def.id, cleared, near, name: camp.def.name });
      // Those there when it fell get it on their quests.
      if (cleared && near && s.core) {
        const op = { op: 'camp', id: camp.def.id, roll: {} };
        s.core.apply(op);
        s.dirty = true;
        s.send({ t: 'sop', op });
      }
    }
  }

  // ---------------------------------------------------------------- players
  join(session) {
    session.proxy = { id: session.id, session, position: new THREE.Vector3(), velocity: new THREE.Vector3(), radius: 0.45, height: 2.0, alive: false, placed: false };
    session.knownEnemies = new Map(); // enemy id → { s: last state sent, at: when }
  }

  leave(session) {
    this.sim.forgetPlayer(session.id);
    this.refreshPlayers();
  }

  // A player's reported state: accepted unless it's further than they could have moved (a
  // movement bank tolerates states arriving late or bunched up; travel and respawn are let through).
  // Returns false when refused (the player is told where they really are).
  updatePlayer(session, st) {
    const p = session.proxy;
    const now = performance.now();
    if (p.placed) {
      p.bank = Math.min(MAX_SPEED * MOVE_BANK, (p.bank ?? MAX_SPEED) + ((now - p.at) / 1000) * MAX_SPEED);
      const d = Math.hypot(st.p[0] - p.position.x, st.p[2] - p.position.z);
      const free = session.core && session.core.time < session.core.teleportUntil;
      if (d > p.bank + 3 && !free) {
        session.strikes += 2;
        session.send({ t: 'pos', p: [r2(p.position.x), r2(p.position.y), r2(p.position.z)] });
        p.at = now;
        return false;
      }
      p.bank = Math.max(0, p.bank - d);
    }
    p.at = now;
    p.position.fromArray(st.p);
    p.velocity.set(st.v[0], 0, st.v[2]);
    p.alive = !(st.fl & 16);
    if (!p.placed) {
      // First word from this player: build the world around them before anything spawns.
      p.placed = true;
      this.world.prime([p.position]);
      this.refreshPlayers();
    }
    return true;
  }

  refreshPlayers() {
    this.sim.setPlayers([...this.realm.sessions.values()].map((s) => s.proxy).filter((p) => p?.placed));
  }

  // ---------------------------------------------------------------- per tick
  tick(dt) {
    this.snaps.clear();
    const foci = this.sim.players.map((p) => p.position);
    if (foci.length) this.world.track(foci);
    this.sim.update(dt);
    this.grid.clear();
    for (const e of this.sim.enemies) this.grid.add(e, e.position.x, e.position.z);
  }

  // What one player should hear this tick: enemies coming into and out of range, their states,
  // and the events near them.
  viewFor(s) {
    const p = s.proxy;
    if (!p?.placed) return null;
    const known = s.knownEnemies;
    const ea = [];
    const ed = [];
    const es = [];
    const here = new Set();
    const now = performance.now();
    // Only the enemies in nearby cells, plus the ones this player already knows (to see them off).
    const cand = new Set(this.grid.near(p.position.x, p.position.z, EAOI * 1.15));
    for (const id of known.keys()) { const e = this.sim.byId.get(id); if (e) cand.add(e); }
    for (const e of cand) {
      const d = Math.hypot(e.position.x - p.position.x, e.position.z - p.position.z);
      if (d > (known.has(e.id) ? EAOI * 1.15 : EAOI)) continue;
      here.add(e.id);
      const snap = this.snapOf(e);
      const last = known.get(e.id);
      if (!last) {
        known.set(e.id, { s: snap.s, at: now });
        ea.push({ id: e.id, t: e.typeName, v: e.variant, lv: e.level, el: e.elite || null, su: e.summoner?.id ?? 0, mh: e.maxHp, hp: Math.round(e.hp), s: snap.s });
      } else if (now - last.at > KEEPALIVE || changed(snap.s, last.s, (now - last.at) / 1000)) {
        // Only what changed (the player's screen carries an unchanged enemy on by itself).
        known.set(e.id, { s: snap.s, at: now });
        es.push(snap.json);
      } else metrics.inc('states_saved');
    }
    for (const id of known.keys()) if (!here.has(id)) { known.delete(id); ed.push(id); }
    const ev = [];
    for (const v of this.events) {
      const at = v.at;
      if (at && Math.hypot(at.x - p.position.x, at.z - p.position.z) > EVENT_RANGE) continue;
      if (v.json === undefined) {
        const { at: _, ...out } = v;
        v.json = JSON.stringify(out);
      }
      ev.push(v.json);
    }
    // `es` and `ev` are JSON already.
    return { ea, ed, es, ev };
  }

  // An enemy's state this tick, worked out once however many players it goes to: the array (to
  // compare with what each of them was sent last) and its JSON (to send).
  snapOf(e) {
    let snap = this.snaps.get(e);
    if (!snap) {
      const s = this.stateOf(e);
      snap = { s, json: JSON.stringify(s) };
      this.snaps.set(e, snap);
    }
    return snap;
  }

  endTick() { this.events.length = 0; }

  get enemyCount() { return this.sim.enemies.length; }

  stateOf(e) {
    const s = e.statuses;
    const fl = (e.engaged ? FLAG.engaged : 0) | (e.hidden ? FLAG.hidden : 0) | (e.guarding ? FLAG.guarding : 0) | (e.ward ? FLAG.ward : 0)
      | (e.frenzy > 0 ? FLAG.frenzy : 0) | (s.burn ? FLAG.burn : 0) | (s.chill ? FLAG.chill : 0) | (s.corrode ? FLAG.corrode : 0)
      | (s.shocked ? FLAG.shocked : 0) | (e.alive ? FLAG.alive : 0);
    return [
      e.id, r2(e.position.x), r2(e.position.y), r2(e.position.z), r2(e.facing), r2(e.velocity.x), r2(e.velocity.z),
      STATE_CODE[e.state], r2(e.stateTime), e.curIndex, e.hitIndex, Math.round(e.hp), fl, r2(e.lift), r2(e.alt),
      e.foe?.id ?? -1, e.attackSeq, e.maxHp,
    ];
  }

  // ---------------------------------------------------------------- reports from players
  // A hit, as seen on the hitter's screen: believed if it's plausible (in reach, not more damage
  // than their level allows), then applied by the sim.
  hit(s, m) {
    const e = this.sim.byId.get(Number(m.id));
    const p = s.proxy;
    if (!e || !e.alive || !p?.placed || !p.alive) return;
    const damage = Number(m.d);
    if (!Number.isFinite(damage) || damage <= 0) return;
    const src = m.src === 'melee' || m.src === 'explosion' || m.src === 'status' ? m.src : 'projectile';
    const reach = src === 'melee' ? MELEE_REACH + e.radius : SHOT_REACH;
    if (Math.hypot(e.position.x - p.position.x, e.position.z - p.position.z) > reach) return;
    // No more than the weapons they carry could do.
    if (damage > maxHit(s.core)) { s.strikes += 5; return; }
    const dx = Number(m.dx) || 0;
    const dz = Number(m.dz) || 0;
    const len = Math.hypot(dx, dz) || 1;
    metrics.inc('hits');
    this.sim.applyHit(e.id, {
      by: s.id, damage: Math.round(damage), source: src,
      poise: Math.min(500, Math.max(0, Number(m.po) || 0)), knockback: Math.min(60, Math.max(0, Number(m.kb) || 0)),
      dir: { x: dx / len, z: dz / len },
    });
  }

  status(s, m) {
    const e = this.sim.byId.get(Number(m.id));
    if (!e || !e.alive || !STATUSES.has(m.el) || !s.proxy?.placed) return;
    const potency = Math.min(maxHit(s.core), Math.max(0, Number(m.po) || 0));
    e.addStatus(m.el, potency, s.id);
  }
}

// Has an enemy's state moved on from the last one sent, beyond what the player's screen works out
// by itself (stateTime counting up)? Positions to 5 cm, facing to ~2°.
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
function changed(a, b, dt) {
  if (a[7] !== b[7] || a[9] !== b[9] || a[10] !== b[10] || a[11] !== b[11] || a[12] !== b[12] || a[15] !== b[15] || a[16] !== b[16] || a[17] !== b[17]) return true;
  if (Math.abs(a[1] - b[1]) > 0.05 || Math.abs(a[2] - b[2]) > 0.05 || Math.abs(a[3] - b[3]) > 0.05) return true;
  if (Math.abs(wrap(a[4] - b[4])) > 0.03 || Math.abs(a[5] - b[5]) > 0.1 || Math.abs(a[6] - b[6]) > 0.1) return true;
  if (Math.abs(a[13] - b[13]) > 0.03 || Math.abs(a[14] - b[14]) > 0.03) return true;
  return Math.abs(a[8] - (b[8] + dt)) > 0.12;
}
