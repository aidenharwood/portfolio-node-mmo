// A raid boss's fight (gameplay phase 7): runs one boss's script (combat/bosses.js) alongside the
// usual AI. The sim still moves the boss and picks its blows (sim/EnemySim.js); the script decides
// which of them it may use in each phase, and on its own timers marks the floor before something
// lands there (combat/shapes.js), calls adds, raises shields, leaves pools — all as events, like
// the rest of the sim: every screen draws the warning and decides whether its own player was
// caught (the sim never damages players). The sim counts who stood in a soak, from where it
// knows players are.
//
// The script wraps two of its boss's methods rather than the sim knowing about scripts: a hit
// does nothing while the boss is immune (its adds are holding a shield over it), and the crowd
// round a raid boss doesn't add to its health (its health is set for the raid: raidHealth).
//
// enc (sim/RaidRun.js, one arena's encounter): {
//   sim · arena { x0, z0, x1, z1, cx, cz, bx, bz } (world metres; b: the back, away from the way in)
//   players()      the living player proxies in the arena
//   bosses()       the encounter's living bosses (the Choir's three)
//   emit(ev)       an event for everyone in the copy
//   say(text, big) a line on everyone's screen
// }
import * as THREE from 'three';
import { packShape, inShape } from '../combat/shapes.js';
import { BOSS_SCRIPTS, amount, raidHealth } from '../combat/bosses.js';

export const ENRAGE = { damage: 3, rate: 1.5 };
const IMMUNE_TELL = 0.6;     // seconds between "it's immune" sparks
const CAST_WAIT = 1.5;       // seconds a mechanic waits for its boss to be free to cast it
const BODY = 0.45;           // a player's radius, for who's in a shape
const _v = new THREE.Vector3();
const r2 = (v) => Math.round(v * 100) / 100;
const between = ([a, b]) => a + Math.random() * (b - a);
const shuffle = (list) => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

export class BossScript {
  constructor(enc, boss, id) {
    this.enc = enc;
    this.sim = enc.sim;
    this.boss = boss;
    this.id = id;
    this.def = BOSS_SCRIPTS[id];
    if (!this.def) throw new Error(`no boss script ${id}`);
    this.hp0 = boss.baseMaxHp;
    this.base = boss.attacks.map((a) => a.damage);
    this.unit = this.base[0] || 20;
    this.n = 1;
    this.clear();
    this.wrap();
  }

  clear() {
    this.phase = -1;
    this.t = 0;
    this.timers = [];
    this.next = new Map();
    this.adds = [];
    this.hazards = new Map();
    this.immune = false;
    this.enraged = false;
    this.empower = 1;
    this.queued = null;
    this.lock = null;
    this.shieldUntil = 0;
    this.shieldFail = null;
    this.tellT = 0;
    this.nextHaz = 1;
    this.nextMark = 1;
  }

  get phaseDef() { return this.def.phases[Math.max(0, this.phase)]; }
  get mult() { return (this.enraged ? ENRAGE.damage : 1) * this.empower; }

  // ---------------------------------------------------------------- the boss's methods, wrapped
  wrap() {
    const b = this.boss;
    const hit = b.applyHit.bind(b);
    b.applyHit = (h) => {
      if (!this.immune || !b.alive) return hit(h);
      // Shielded by its adds: nothing gets through (it still remembers who tried).
      if (h.by !== null && h.by !== undefined) b.threat.set(h.by, (b.threat.get(h.by) ?? 0) + h.damage * 0.5);
      if (!b.engaged) b.aggro(true, this.sim.playerById(h.by));
      if (this.t - this.tellT > IMMUNE_TELL) {
        this.tellT = this.t;
        this.enc.emit({ k: 'rimm', id: b.id, at: b.position });
      }
      return false;
    };
    const retarget = b.retarget.bind(b);
    b.retarget = (dt) => {
      const m = b.maxHp;
      const hp = b.hp;
      retarget(dt);
      if (b.maxHp !== m) { b.maxHp = m; b.hp = hp; }
    };
    // A charge down a marked line keeps to the line.
    const windup = b.updateWindup.bind(b);
    b.updateWindup = (dt, p) => { windup(dt, p); if (this.locked()) b.facing = this.lock.a; };
    const attack = b.updateAttack.bind(b);
    b.updateAttack = (dt, p) => {
      attack(dt, p);
      if (this.locked() && b.chargeDir) {
        b.facing = this.lock.a;
        b.chargeDir.set(Math.sin(this.lock.a), 0, Math.cos(this.lock.a));
      }
    };
  }

  locked() {
    const b = this.boss;
    if (!this.lock) return false;
    if (b.cur !== this.lock.attack || (b.state !== 'windup' && b.state !== 'attack')) { this.lock = null; return false; }
    return true;
  }

  // ---------------------------------------------------------------- the fight
  // Its health for `n` players (shown before the pull, set again as it begins).
  scale(n) {
    const b = this.boss;
    this.n = Math.max(1, n);
    const hp = Math.round(this.hp0 * raidHealth(this.n) * (this.def.health ?? 1));
    const k = b.maxHp > 0 ? b.hp / b.maxHp : 1;
    b.baseMaxHp = hp;
    b.maxHp = hp;
    b.hp = Math.round(hp * k);
  }

  // Pulled, with `n` players in the fight.
  begin(n) {
    this.end();
    this.clear();
    this.scale(n);
    this.boss.hp = this.boss.maxHp;
    this.enterPhase(0);
  }

  // The fight's over (won, or everyone down): its adds, pools and marks go.
  end() {
    for (const a of this.adds) if (a.e.alive) a.e.dissolve();
    for (const id of this.hazards.keys()) this.enc.emit({ k: 'hzx', id, at: this.boss.position });
    this.adds = [];
    this.hazards.clear();
    this.timers = [];
    this.immune = false;
    this.lock = null;
    this.queued = null;
    const b = this.boss;
    b.immune = false;
    b.shield = 0;
    b.shieldMax = 0;
    b.attacks.forEach((a, i) => { a.damage = this.base[i]; });
    this.enraged = false;
    this.empower = 1;
    this.setDamage();
  }

  enterPhase(i) {
    const P = this.def.phases[i];
    this.phase = i;
    // Its attacks for this phase: the rest wait (the script's own casts never come up by themselves).
    const allowed = new Set(P.attacks ?? this.boss.attacks.map((a) => a.id));
    for (const a of this.boss.attacks) {
      if (a.cooldown === Infinity) continue;
      a.cd = allowed.has(a.id) ? Math.min(a.cd, Math.random() * 1.5) : Infinity;
    }
    if (i > 0 || P.say) this.enc.emit({ k: 'rph', id: this.boss.id, ph: i, name: P.name, at: this.boss.position });
    if (P.say) this.enc.say(P.say, true);
    this.next.clear();
    for (const id of P.use ?? []) {
      const m = this.def.mechanics[id];
      this.next.set(id, m.first ?? between(m.every ?? [10, 14]));
    }
    for (const id of P.now ?? []) this.fire(id);
    this.enc.changed?.();
  }

  enrage() {
    this.enraged = true;
    this.setDamage();
    this.enc.emit({ k: 'renr', id: this.boss.id, at: this.boss.position });
    this.enc.say(`${this.boss.displayName} is enraged!`, true);
    this.enc.changed?.();
  }

  // Another of the encounter's bosses fell: those left fight harder.
  rally(by = 1.3) {
    this.empower *= by;
    this.setDamage();
  }

  setDamage() {
    const k = this.mult;
    this.boss.attacks.forEach((a, i) => { if (this.base[i] !== undefined) a.damage = Math.round(this.base[i] * k); });
  }

  update(dt) {
    const b = this.boss;
    if (!b.alive) return;
    this.t += dt;
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const tm = this.timers[i];
      if ((tm.t -= dt) <= 0) { this.timers.splice(i, 1); tm.fn(); }
    }
    for (const [id, until] of this.hazards) if (this.t >= until) this.hazards.delete(id);
    const phases = this.def.phases;
    while (this.phase + 1 < phases.length && b.hp / b.maxHp <= phases[this.phase + 1].at) this.enterPhase(this.phase + 1);
    if (!this.enraged && this.def.enrage && this.t >= this.def.enrage) this.enrage();
    this.updateAdds();
    this.updateShield();
    // The phase's mechanics, each on its own clock (a queued cast first).
    if (this.queued) {
      const q = this.queued;
      if (this.free() || this.t - q.at > CAST_WAIT) { this.queued = null; this.run(q.id, this.free()); }
    }
    const rate = (this.phaseDef.faster ?? 1) * (this.enraged ? ENRAGE.rate : 1);
    for (const [id, left] of this.next) {
      const t = left - dt * rate;
      if (t > 0) { this.next.set(id, t); continue; }
      const m = this.def.mechanics[id];
      if (this.queued) { this.next.set(id, 0.3); continue; }
      this.next.set(id, between(m.every ?? [10, 14]));
      this.fire(id);
    }
  }

  // Can the boss cast now (not in the middle of something)?
  free() {
    const b = this.boss;
    return b.alive && !!b.foe && (b.state === 'chase' || b.state === 'idle');
  }

  // A mechanic: one it casts waits until it's free to (a little while, then goes anyway).
  fire(id) {
    const m = this.def.mechanics[id];
    if (!m) return;
    if (m.when === 'immune' && !this.immune) return;
    if (m.when === '!immune' && this.immune) return;
    if ((m.cast || m.kind === 'charge') && !this.free()) { this.queued = { id, at: this.t }; return; }
    this.run(id, true);
  }

  run(id, canCast) {
    const m = this.def.mechanics[id];
    const b = this.boss;
    if (m.cast && canCast) {
      const a = b.attacks.find((x) => x.id === m.cast);
      if (a && b.foe) b.startAttack(a, b.foe);
    }
    if (m.say) this.enc.say(m.say);
    switch (m.kind) {
      case 'aoe': this.aoe(m); break;
      case 'charge': if (canCast) this.charge(m); break;
      case 'hazard': this.hazard(m); break;
      case 'adds': this.spawnAdds(id, m); break;
      case 'shield': this.raiseShield(m); break;
      case 'links': this.links(m); break;
      case 'move': this.move(m); break;
      case 'heal': {
        const amount = Math.round(b.maxHp * (m.share ?? 0.1));
        b.heal(amount);
        this.enc.emit({ k: 'heal', id: b.id, r: 3, list: [[b.id, amount]], at: b.position });
        break;
      }
    }
  }

  after(t, fn) { this.timers.push({ t, fn }); }

  // ---------------------------------------------------------------- where things go
  pos(x, z) { return [r2(x), r2(this.sim.world.groundHeight(x, z)), r2(z)]; }
  arenaPoint(margin = 3) {
    const A = this.enc.arena;
    const w = this.sim.world;
    for (let k = 0; k < 12; k++) {
      const x = A.x0 + margin + Math.random() * (A.x1 - A.x0 - 2 * margin);
      const z = A.z0 + margin + Math.random() * (A.z1 - A.z0 - 2 * margin);
      if (w.standable(x, z)) return { x, z };
    }
    return { x: A.cx, z: A.cz };
  }
  farthest(list) {
    const b = this.boss.position;
    return [...list].sort((p, q) => Math.hypot(q.position.x - b.x, q.position.z - b.z) - Math.hypot(p.position.x - b.x, p.position.z - b.z))[0] ?? null;
  }
  // Players picked for a mechanic: `how` of them (foe, random, farthest, each).
  pick(how, count) {
    const list = this.enc.players();
    if (!list.length) return [];
    const b = this.boss;
    switch (how) {
      case 'foe': return [b.foe && list.includes(b.foe) ? b.foe : list[0]];
      case 'farthest': return [this.farthest(list)];
      case 'each': return list.slice(0, count || list.length);
      default: return shuffle(list).slice(0, Math.max(1, count));
    }
  }

  // The shapes a mechanic marks: where each starts, which way it points, and who it follows.
  placements(m) {
    const b = this.boss;
    const A = this.enc.arena;
    const n = Math.max(1, this.enc.players().length);
    const count = m.count === undefined ? 1 : amount(m.count, n);
    const out = [];
    const angleTo = (o, t) => Math.atan2(t.x - o.x, t.z - o.z);
    if (m.at === 'boss' || m.at === 'center') {
      const o = m.at === 'boss' ? { x: b.position.x, z: b.position.z } : { x: A.cx, z: A.cz };
      const aims = m.aim === 'spin' ? null : this.pick(m.aim ?? 'foe', count);
      for (let i = 0; i < (aims ? Math.max(1, aims.length) : count); i++) {
        const t = aims?.[i]?.position;
        out.push({ x: o.x, z: o.z, a: t ? angleTo(o, t) : aims ? b.facing : Math.random() * Math.PI * 2 });
      }
    } else if (m.at === 'arena') {
      for (let i = 0; i < count; i++) { const p = this.arenaPoint(); out.push({ ...p, a: Math.random() * Math.PI * 2 }); }
    } else {
      for (const p of this.pick(m.at ?? 'random', count)) {
        out.push({ x: p.position.x, z: p.position.z, a: angleTo(p.position, b.position) + Math.PI, follow: m.follow ? p : null });
      }
    }
    return out;
  }

  shapeAt(spec, at) {
    const s = { sh: spec.sh, p: this.pos(at.x, at.z), r: spec.r };
    if (spec.r0 !== undefined) s.r0 = spec.r0;
    if (spec.sh === 'cone') { s.a = at.a; s.arc = spec.arc ?? 90; }
    if (spec.sh === 'line' || spec.sh === 'cross') { s.a = at.a; s.w = spec.w ?? 3; }
    return s;
  }

  // ---------------------------------------------------------------- mechanics
  aoe(m) {
    const rep = m.repeat ?? { n: 1, gap: 0 };
    for (let k = 0; k < (rep.n ?? 1); k++) {
      const go = () => {
        for (const at of this.placements(m)) {
          const s = this.shapeAt(m.shape, at);
          if (k && rep.grow) { s.r += rep.grow * k; if (s.r0 !== undefined) s.r0 += rep.grow * k; }
          if (k && rep.turn && s.a !== undefined) s.a += rep.turn * k;
          this.mark(m, s, at.follow ?? null);
        }
      };
      if (k === 0) go(); else this.after(k * rep.gap, go);
    }
  }

  // A shape on the floor, landing `m.warn` seconds later.
  mark(m, s, follow) {
    const b = this.boss;
    const warn = m.warn ?? 1.5;
    const need = m.soak ? amount(m.soak.need, Math.max(1, this.enc.players().length)) : undefined;
    const mk = this.markId();
    this.enc.emit({ k: 'rt', id: b.id, mk, s: packShape(s), t: warn, el: m.el, f: follow?.id, n: need, nm: m.name, at: { x: s.p[0], z: s.p[2] } });
    this.after(warn, () => this.land(m, s, follow, need, mk));
  }

  // Each mark's id, so the screens can match its landing to it.
  markId() { return `${this.boss.id}.${this.nextMark++}`; }

  land(m, s, follow, need, mk) {
    if (!this.boss.alive) return;
    if (follow?.alive) s.p = this.pos(follow.position.x, follow.position.z);
    const unit = this.unit * this.mult;
    let dmg = unit * (m.dmg ?? 1);
    let fail = false;
    if (m.soak) {
      const inside = this.enc.players().filter((p) => inShape(s, p.position.x, p.position.z, BODY)).length;
      if (inside >= need) dmg *= need / inside;
      else fail = true;
    }
    this.enc.emit({ k: 'rb', id: this.boss.id, mk, s: packShape(s), dmg: Math.round(dmg), kb: m.kb ?? 6, el: m.el, at: { x: s.p[0], z: s.p[2] } });
    if (fail) {
      const A = this.enc.arena;
      const all = { sh: 'circle', p: this.pos(A.cx, A.cz), r: 120 };
      this.enc.emit({ k: 'rb', id: this.boss.id, s: packShape(all), dmg: Math.round(unit * (m.soak.fail ?? 1)), kb: 10, el: m.el, fail: 1, at: { x: A.cx, z: A.cz } });
      this.enc.say(`Too few shared the ${m.name ?? 'blast'}!`);
    }
    if (m.leave) this.pool({ ...s, sh: s.sh === 'ring' ? 'circle' : s.sh }, m.leave.life ?? 15, unit * (m.leave.dps ?? 0.2), m.el);
  }

  // A pool (or seam) that burns whoever stands in it.
  pool(s, life, dps, el) {
    const id = `${this.boss.id}:${this.nextHaz++}`;
    this.hazards.set(id, this.t + life);
    this.enc.emit({ k: 'hz', id, s: packShape(s), life, dps: Math.round(dps), el, at: { x: s.p[0], z: s.p[2] } });
  }

  hazard(m) {
    for (const at of this.placements(m)) {
      const s = this.shapeAt(m.shape, at);
      const warn = m.warn ?? 1.2;
      this.enc.emit({ k: 'rt', id: this.boss.id, mk: this.markId(), s: packShape(s), t: warn, el: m.el, nm: m.name, at: { x: s.p[0], z: s.p[2] } });
      this.after(warn, () => { if (this.boss.alive) this.pool(s, m.life ?? 20, this.unit * this.mult * (m.dps ?? 0.25), m.el); });
    }
  }

  // The boss's own charge, down a marked line at whoever `aim` picks.
  charge(m) {
    const b = this.boss;
    const a = b.attacks.find((x) => x.id === m.attack);
    const [t] = this.pick(m.aim ?? 'farthest', 1);
    if (!a || !t) return;
    const angle = Math.atan2(t.position.x - b.position.x, t.position.z - b.position.z);
    b.foe = t;
    b.retargetT = a.windup + a.active + 0.5;
    b.facing = angle;
    b.startAttack(a, t);
    this.lock = { attack: a, a: angle };
    const s = { sh: 'line', p: this.pos(b.position.x, b.position.z), r: a.speed * a.active + b.radius, a: angle, w: m.w ?? b.radius * 2 + 1 };
    this.enc.emit({ k: 'rt', id: b.id, mk: this.markId(), s: packShape(s), t: a.windup, el: m.el, nm: m.name, at: { x: s.p[0], z: s.p[2] } });
  }

  spawnAdds(id, m) {
    const b = this.boss;
    const A = this.enc.arena;
    const n = Math.max(1, this.enc.players().length);
    const spots = [];
    const total = (m.units ?? []).reduce((s, u) => s + amount(u.n ?? 1, n), 0);
    const edge = (i) => {
      // Round the walls, spread out.
      const u = (i + Math.random() * 0.6) / total;
      const per = 2 * (A.x1 - A.x0 + A.z1 - A.z0);
      let d = u * per;
      const inset = 3;
      const W = A.x1 - A.x0;
      const H = A.z1 - A.z0;
      if (d < W) return { x: A.x0 + d, z: A.z0 + inset };
      d -= W;
      if (d < H) return { x: A.x1 - inset, z: A.z0 + d };
      d -= H;
      if (d < W) return { x: A.x1 - d, z: A.z1 - inset };
      d -= W;
      return { x: A.x0 + inset, z: A.z1 - d };
    };
    let i = 0;
    for (const u of m.units ?? []) {
      for (let k = 0; k < amount(u.n ?? 1, n); k++, i++) {
        let at;
        if (m.at === 'points' && m.points?.length) {
          const [fx, fz] = m.points[i % m.points.length];
          at = { x: A.x0 + (A.x1 - A.x0) * fx, z: A.z0 + (A.z1 - A.z0) * fz };
        } else if (m.at === 'around') {
          const a = (i / total) * Math.PI * 2;
          at = { x: b.position.x + Math.sin(a) * 6, z: b.position.z + Math.cos(a) * 6 };
        } else if (m.at === 'arena') at = this.arenaPoint(4);
        else at = edge(i);
        if (!this.sim.world.standable(at.x, at.z)) at = this.arenaPoint();
        spots.push({ u, at });
      }
    }
    const foes = this.enc.players();
    // (Nudged clear of pillars and the like, but never out through the arena's walls.)
    const keep = (x, z) => x >= A.x0 + 1.5 && x <= A.x1 - 1.5 && z >= A.z0 + 1.5 && z <= A.z1 - 1.5;
    for (const { u, at } of spots) {
      const e = this.sim.spawnEnemy(u.type, _v.set(at.x, 0, at.z), { level: b.level, variant: u.variant ?? null, elite: u.elite ?? null, summoner: b, keep });
      e.hidden = false;
      const foe = foes.length ? foes[Math.floor(Math.random() * foes.length)] : b.foe;
      if (foe) e.aggro(true, foe);
      this.adds.push({ e, m: id, at: this.t });
    }
    if (m.immune && spots.length) {
      this.immune = true;
      b.immune = true;
      this.enc.emit({ k: 'shield', id: b.id, at: b.position, up: 1 });
      this.enc.changed?.();
    }
  }

  updateAdds() {
    if (!this.adds.length) return;
    const b = this.boss;
    for (const a of this.adds) {
      const m = this.def.mechanics[a.m];
      if (!m?.hatch || !a.e.alive || a.hatched || this.t - a.at < m.hatch.after) continue;
      // Left too long: it bursts open.
      a.hatched = true;
      const at = a.e.position.clone();
      a.e.dissolve();
      const foes = this.enc.players();
      for (const u of m.hatch.into) {
        for (let k = 0; k < (u.n ?? 1); k++) {
          const ang = Math.random() * Math.PI * 2;
          const e = this.sim.spawnEnemy(u.type, _v.set(at.x + Math.sin(ang) * 1.2, 0, at.z + Math.cos(ang) * 1.2), { level: b.level, variant: u.variant ?? null, summoner: b });
          e.hidden = false;
          const foe = foes.length ? foes[Math.floor(Math.random() * foes.length)] : b.foe;
          if (foe) e.aggro(true, foe);
          this.adds.push({ e, m: '_hatched', at: this.t });
        }
      }
    }
    this.adds = this.adds.filter((a) => a.e.alive);
    if (this.immune && !this.adds.some((a) => this.def.mechanics[a.m]?.immune)) {
      this.immune = false;
      b.immune = false;
      this.enc.emit({ k: 'shield', id: b.id, at: b.position });
      this.enc.say(`${b.displayName}'s shield breaks!`, true);
    }
  }

  // ---------------------------------------------------------------- shields
  raiseShield(m) {
    const b = this.boss;
    b.shieldMax = Math.round(b.maxHp * (m.share ?? 0.15));
    b.shield = b.shieldMax;
    this.shieldUntil = this.t + (m.time ?? 15);
    this.shieldFail = m.fail ?? null;
    this.enc.emit({ k: 'shield', id: b.id, at: b.position, up: 1 });
  }

  updateShield() {
    const b = this.boss;
    if (!this.shieldFail) return;
    if (b.shield <= 0) {
      this.shieldFail = null;
      b.shieldMax = 0;
      this.enc.say(`${b.displayName}'s shield is broken!`);
      return;
    }
    if (this.t < this.shieldUntil) return;
    // Not broken in time: it bursts, and the shield goes with it.
    const fail = this.shieldFail;
    this.shieldFail = null;
    b.shield = 0;
    b.shieldMax = 0;
    this.enc.emit({ k: 'shield', id: b.id, at: b.position });
    if (fail.say) this.enc.say(fail.say, true);
    this.aoe(fail);
  }

  // ---------------------------------------------------------------- the Choir's seams
  links(m) {
    const list = this.enc.bosses();
    if (list.length < 2) return;
    // Only one of them strings the seams: the first still singing.
    if (list[0] !== this.boss) return;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const A = list[i].position;
        const B = list[j].position;
        const len = Math.hypot(B.x - A.x, B.z - A.z);
        if (len < 2) continue;
        const s = { sh: 'line', p: this.pos(A.x, A.z), r: len, a: Math.atan2(B.x - A.x, B.z - A.z), w: m.w ?? 2.4 };
        const mk = this.markId();
        this.enc.emit({ k: 'rt', id: this.boss.id, mk, s: packShape(s), t: m.warn ?? 2, el: m.el, nm: m.name, at: { x: s.p[0], z: s.p[2] } });
        this.after(m.warn ?? 2, () => {
          if (!this.boss.alive) return;
          const unit = this.unit * this.mult;
          this.enc.emit({ k: 'rb', id: this.boss.id, mk, s: packShape(s), dmg: Math.round(unit * (m.dmg ?? 1)), kb: 8, el: m.el, at: { x: s.p[0], z: s.p[2] } });
          this.pool(s, m.life ?? 8, unit * (m.dps ?? 0.3), m.el);
        });
      }
    }
  }

  move(m) {
    const b = this.boss;
    const A = this.enc.arena;
    const to = m.to === 'back' ? { x: A.bx, z: A.bz } : { x: A.cx, z: A.cz };
    const from = [r2(b.position.x), r2(b.position.y), r2(b.position.z)];
    b.position.set(to.x, this.sim.world.groundHeight(to.x, to.z), to.z);
    b.lastPos.copy(b.position);
    b.velocity.set(0, 0, 0);
    this.enc.emit({ k: 'blink', id: b.id, from, to: [r2(b.position.x), r2(b.position.y), r2(b.position.z)], at: b.position });
  }

  // ---------------------------------------------------------------- for the HUD
  get info() {
    const b = this.boss;
    return {
      id: b.id, s: this.id, ph: Math.max(0, this.phase), t: Math.round(this.t),
      en: this.def.enrage ? Math.max(0, Math.round(this.def.enrage - this.t)) : null, im: this.immune ? 1 : 0, rg: this.enraged ? 1 : 0,
    };
  }
}
