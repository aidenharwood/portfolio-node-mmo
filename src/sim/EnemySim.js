// One enemy, simulated: the state machine that runs every race and behaviour, with no model, no
// effects and no sound. The server runs these for everyone; offline single-player runs the same
// code locally. What players see and hear comes from the view (entities/Enemy.js), which follows
// this state and turns the sim's events (shots, blasts, blinks, wards...) into effects.
//   spawn → idle (wander near home) → chase (the behaviour's footwork) → windup → attack → recover
//   with stagger, return (leashed home) and dead on the side.
// Enemies fight whichever player has the most threat on them (damage dealt, plus being close), and
// take turns per player through attack tokens, so a crowd doesn't all swing at once; those
// waiting spread out around their target. Named elites carry affixes (sim/affixes.js).
// The sim never damages players: their own screens decide what hits them (docs/MULTIPLAYER.md).
// Its sweeps against players only drive the AI (a bash that connects ends early, a charge stops).
import * as THREE from 'three';
import {
  enemyType, enemyAttacks, enemyMaxHp, enemyDamage, enemyRadius, eliteName, liveAttack, sweepReaches,
  CLOSE_KINDS, RANGED_KINDS, MELEE_KINDS, KITERS,
} from './enemyDefs.js';
import { resolveType } from '../combat/bestiary.js';
import { anyComponentSpec, legDamageProfile } from '../combat/HitComponents.js';
import { rollAffixes, affixCount, SHIELD, RALLY, VAMPIRIC_REGEN, OVERCHARGE, VOLATILE } from './affixes.js';
import { inPocket } from '../world/dungeons.js';
import { stopAgainst } from '../world/MeshCollision.js';
import { OpenNav } from './OpenNav.js';

const _to = new THREE.Vector3();
const _desired = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _aim = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _o = new THREE.Vector3();
const _p = new THREE.Vector3();
const _push = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const randIn = ([a, b]) => a + Math.random() * (b - a);
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const r3 = (v) => [Math.round(v.x * 100) / 100, Math.round(v.y * 100) / 100, Math.round(v.z * 100) / 100];
const MAX_SLOPE = 1.25;
const STEP_UP = 0.45;      // the most it steps straight up onto something (a kerb, a plank, a low rock)
const CORPSE_LIFETIME = 9.5;

const AGGRO_RADIUS = 13;
const LEASH_RADIUS = 34;   // how far from home an enemy will follow...
const LEASH_PLAYER = 18;   // ...unless its target is still this close
const RETURN_REGEN = 0.3;  // fraction of max HP per second while walking home
const TARGET_RANGE = 60;   // players further than this aren't considered as targets
const CROWD_RANGE = 40;    // players this close count towards the fight's size...
const CROWD_HP = 0.6;      // ...each one past the first adding this much to its health
const BURN_TICK = 0.5;
const STRUCTURE_LURE = 20; // how much more an event's attackers want what they came for than a player

export class EnemySim {
  // `split`: one of the two halves of a Splitting elite (worth what a summoned minion is);
  // `transient`: called in for a fight (reinforcements, halves) — gone when it gives up.
  // `name` / `tag`: a story enemy's own name and the tag quests know it by (world/story.js).
  constructor(sim, id, typeName, position, { level = 1, camp = null, elite = null, champion = false, affixes = null, variant = null, summoner = null, split = false, transient = false, name = null, tag = null } = {}) {
    if (elite === true) elite = eliteName(resolveType(typeName, variant).race);
    const type = enemyType(typeName, variant, elite, !!summoner || split, !!elite && champion);
    this.sim = sim;
    this.id = id;
    this.type = type;
    this.typeName = typeName;
    this.variant = type.variant;
    this.level = level;
    this.camp = camp;
    this.elite = elite;
    this.summoner = summoner;
    this.split = split;
    this.transient = transient || split;
    this.champion = !!type.champion;
    this.minions = [];
    this.displayName = name ?? (elite ? `${elite}` : type.name);
    this.name = name;
    this.tag = tag;
    this.isBoss = !!type.boss;
    this.faction = 'enemy';
    this.radius = enemyRadius(type);
    this.baseHeight = type.height;
    this.mass = type.mass;
    this.baseMaxHp = enemyMaxHp(type, level);
    this.maxHp = this.baseMaxHp;
    this.hp = this.maxHp;
    this.componentDamage = Object.create(null);
    this.brokenParts = [];
    this.affixes = elite ? (affixes ?? rollAffixes(type.race, affixCount(level, this.champion))) : [];
    this.affix = new Set(this.affixes);
    this.shieldMax = this.affix.has('shielded') ? Math.round(this.baseMaxHp * SHIELD.share) : 0;
    this.shield = this.shieldMax;
    this.calm = 0;                    // seconds since it was last hurt
    this.rallied = 0;                 // seconds left of a commander's rally
    this.pulseT = OVERCHARGE.every;
    this.alive = true;
    this.statuses = {};
    this.attacks = enemyAttacks(type, level).map((a) => ({ ...a, cd: (a.cooldown ?? 0) * Math.random() * 0.6 }));
    this.cur = null;
    this.curIndex = -1;
    this.live = null;
    this.hitIndex = 0;
    this.attackSeq = 0;
    const close = this.attacks.filter((a) => CLOSE_KINDS.has(a.kind));
    this.reach = close.length ? Math.min(...close.map((a) => a.range)) : 2;
    const ranged = this.attacks.filter((a) => RANGED_KINDS.has(a.kind));
    this.maxRange = ranged.length ? Math.max(...ranged.map((a) => a.range)) : 12;

    this.position = new THREE.Vector3(position.x, sim.world.groundHeight(position.x, position.z), position.z);
    this.velocity = new THREE.Vector3();
    this.knockback = new THREE.Vector3();
    this.facing = Math.random() * Math.PI * 2;
    this.home = this.position.clone();
    this.wanderTarget = this.position.clone();
    this.state = 'spawn';
    this.stateTime = 0;
    this.cooldown = randIn(type.cooldown);
    this.poiseAccum = 0;
    this.strafeDir = Math.random() < 0.5 ? 1 : -1;
    this.flank = (id * 2.39996) % (Math.PI * 2); // its own bearing round a target, to surround it
    this.orbitA = 0;
    this.ringJitter = Math.random() * 1.5;
    this.engaged = false;
    this.removeMe = false;
    this.lastPos = this.position.clone();
    this.progressTimer = 1;
    this.stuckCount = 0;
    this.detour = null;
    this.detourTime = 0;
    this.path = null;                 // outdoors, the corners round what's in the way (sim/OpenNav.js)
    this.feetY = null;                // what it stands on (the ground, or something on it)...
    this.feetAt = null;               // ...and where
    this.blinkCd = 0;
    this.frenzy = 0;
    this.ward = null;
    this.lift = 0;
    this.leap = null;
    this.mark = new THREE.Vector3();  // where the current attack is aimed
    this.foe = null;                  // the player being fought (a player proxy from the sim)
    this.retargetT = 0;
    this.threat = new Map();          // player id → threat
    this.credit = new Map();          // player id → damage dealt (kill credit)
    this.hidden = type.behavior === 'ambusher';
    this.hover = type.hover ?? 0;
    this.alt = this.hover;
    this.guarding = false;
    this.landed = false;
  }

  get behavior() { return this.type.behavior; }
  get isRanged() { return KITERS.has(this.type.behavior); }

  // Puts it down somewhere else on the ground (a clear spot at spawn, out of something it ended
  // up inside): home and its idea of where it was go with it.
  place(x, z) {
    this.position.set(x, this.sim.world.groundHeight(x, z), z);
    this.home.copy(this.position);
    this.wanderTarget.copy(this.position);
    this.lastPos.copy(this.position);
  }

  forward(out = new THREE.Vector3()) { return out.set(Math.sin(this.facing), 0, Math.cos(this.facing)); }
  angleTo(pos) { return Math.atan2(pos.x - this.position.x, pos.z - this.position.z); }
  turnTowards(angle, maxStep) {
    const d = wrapAngle(angle - this.facing);
    this.facing = wrapAngle(this.facing + Math.max(-maxStep, Math.min(maxStep, d)));
  }
  speedMultiplier() { return this.statuses.chill ? 1 - this.statuses.chill.slow : 1; }
  heal(amount) { if (this.alive) this.hp = Math.min(this.maxHp, this.hp + amount); }
  dist2(p) { return Math.hypot(p.position.x - this.position.x, p.position.z - this.position.z); }

  setState(s) {
    if (s === 'chase' || s === 'stagger' || s === 'dead' || s === 'return' || s === 'idle') this.sim.releaseToken(this);
    if (s === 'chase' && this.state !== 'chase' && this.foe) {
      const p = this.foe.position;
      this.orbitA = Math.atan2(this.position.x - p.x, this.position.z - p.z);
    }
    if (s !== 'attack') this.leap = null;
    this.state = s;
    this.stateTime = 0;
  }

  // Engages `by` (or whoever is nearest), and the camp joins in.
  isPlayerIgnored(p) {
    return !!p?.inCutscene;
  }

  aggro(force = false, by = null) {
    if (!this.alive || (this.state === 'return' && !force)) return;
    if (by && by.alive && !this.isPlayerIgnored(by)) this.foe = by;
    if (this.foe && this.isPlayerIgnored(this.foe)) this.foe = null;
    if (this.engaged) return;
    this.foe ??= this.nearestPlayer(TARGET_RANGE);
    if (!this.foe) return;
    this.engaged = true;
    this.hidden = false;
    if (this.state === 'idle' || this.state === 'return') this.setState('chase');
    if (this.camp) this.sim.alert(this.camp, this);
  }

  leash() {
    if (!this.alive) return;
    this.engaged = false;
    this.foe = null;
    this.setState('return');
  }

  nearestPlayer(range) {
    let best = null;
    let bd = range;
    for (const p of this.sim.players) {
      if (!p.alive || this.isPlayerIgnored(p)) continue;
      const d = this.dist2(p);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  // The player with the most threat (damage dealt, scaled to this enemy's health) who is still in
  // reach, with a little stickiness so targets don't flicker.
  retarget(dt) {
    if (!this.engaged) return;
    if (this.foe && this.isPlayerIgnored(this.foe)) {
      this.foe = null;
      this.engaged = false;
      this.setState('return');
      return;
    }
    this.retargetT -= dt;
    if (this.retargetT > 0 && this.foe?.alive && !this.foe.gone) return;
    this.retargetT = 0.5;
    let best = null;
    let bestScore = -Infinity;
    const consider = (p, bonus) => {
      if (!p.alive || this.isPlayerIgnored(p)) return;
      const d = this.dist2(p);
      if (d > TARGET_RANGE) return;
      const score = ((this.threat.get(p.id) ?? 0) / this.maxHp) * 40 - d + (p === this.foe ? 5 : 0) + bonus;
      if (score > bestScore) { bestScore = score; best = p; }
    };
    for (const p of this.sim.players) consider(p, 0);
    // A holo-decoy close enough draws them off.
    for (const p of this.sim.decoys) if (this.dist2(p) < 20) consider(p, 60);
    // A public event's attackers go for what they came to destroy (sim/WorldEvents.js) unless
    // someone hurts them enough to draw them off.
    for (const s of this.camp?.structures ?? []) consider(s, this.type.lure ?? STRUCTURE_LURE);
    if (best !== this.foe) {
      this.sim.releaseToken(this);
      this.foe = best;
    }
    // A fight with more players in it is a tougher fight (health only grows while it lasts).
    let n = 0;
    for (const p of this.sim.players) if (p.alive && this.dist2(p) < CROWD_RANGE) n++;
    const want = Math.round(this.baseMaxHp * (1 + CROWD_HP * Math.max(0, n - 1)));
    if (want > this.maxHp) {
      this.hp = Math.round((this.hp * want) / this.maxHp);
      this.maxHp = want;
    }
  }

  damp(dt, rate = 10) {
    this.velocity.multiplyScalar(Math.exp(-rate * dt));
  }

  // Steers `desired` (a velocity) around world colliders in the way.
  avoid(desired) {
    const speed = desired.length();
    if (speed < 0.1) return desired;
    if (this.detour) return desired.copy(this.detour).multiplyScalar(speed);
    _dir.copy(desired).divideScalar(speed);
    const px = this.position.x;
    const pz = this.position.z;
    let sx = 0;
    let sz = 0;
    for (const c of this.sim.world.collidersNear(px, pz, 4.5)) {
      // (Walls indoors are boxes: the way round them is the pathfinding's business.)
      if (c.box || (this.hover > 1.5 && c.y + c.h < this.position.y)) continue;
      const dx = c.x - px;
      const dz = c.z - pz;
      const ahead = dx * _dir.x + dz * _dir.z;
      if (ahead <= 0 || ahead > 3 + c.r) continue;
      const lat = dx * _dir.z - dz * _dir.x;
      const clear = c.r + this.radius + 0.3;
      if (Math.abs(lat) > clear) continue;
      const w = (1 - Math.abs(lat) / clear) * 1.6;
      const side = lat > 0 ? -1 : 1;
      sx += _dir.z * side * w;
      sz += -_dir.x * side * w;
    }
    if (sx || sz) desired.set(_dir.x + sx, 0, _dir.z + sz).normalize().multiplyScalar(speed);
    return desired;
  }

  steer(desired, dt, rate) {
    this.avoid(desired);
    // A damaged gait also takes longer to change direction, so a severed leg affects
    // handling as well as the maximum speed used by the footwork behaviours.
    this.velocity.lerp(desired, 1 - Math.exp(-rate * this.locomotionMultiplier * dt));
  }

  // If an enemy that wants to move hasn't made progress, try a sideways detour; a returning
  // enemy that's badly stuck and out of every player's sight just walks home "off-screen".
  checkStuck(dt, wantsToMove) {
    this.detourTime -= dt;
    if (this.detourTime <= 0) this.detour = null;
    this.progressTimer -= dt;
    if (this.progressTimer > 0) return;
    this.progressTimer = 1;
    const moved = Math.hypot(this.position.x - this.lastPos.x, this.position.z - this.lastPos.z);
    this.lastPos.copy(this.position);
    if (!wantsToMove || moved > 0.5) { this.stuckCount = 0; return; }
    this.stuckCount++;
    this.path = null; // whatever way it had isn't working: look again
    // Inside something (a collider that streamed in round it after it spawned): out to the nearest
    // clear spot.
    const world = this.sim.world;
    if (world.fits && !this.hover && !world.fits(this.position.x, this.position.z, this.radius * 0.8, this.height)) {
      const at = world.clearSpot(this.position.x, this.position.z, this.radius, { maxR: 4, height: this.height });
      if (at.moved) {
        this.position.set(at.x, world.groundHeight(at.x, at.z), at.z);
        this.lastPos.copy(this.position);
        this.feetAt = null;
        return;
      }
    }
    if (this.state === 'return' && this.stuckCount >= 3 && !this.nearestPlayer(25)) {
      this.position.copy(this.home);
      this.stuckCount = 0;
      return;
    }
    const target = this.foe ?? { position: this.home };
    const away = Math.atan2(this.position.x - target.position.x, this.position.z - target.position.z);
    const step = (Math.random() < 0.5 ? 1 : -1) * (Math.PI / 2 + Math.random() * 0.9);
    const a = away + step;
    const dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
    const clear = world.standable(this.position.x + dir.x * 2.2, this.position.z + dir.z * 2.2) && !world.blocks(new THREE.Vector3(this.position.x + dir.x * 2.2, world.groundHeight(this.position.x + dir.x * 2.2, this.position.z + dir.z * 2.2) + 0.5, this.position.z + dir.z * 2.2));
    this.detour = clear ? dir : new THREE.Vector3(Math.sin(Math.atan2(this.velocity.x, this.velocity.z) + step), 0, Math.cos(Math.atan2(this.velocity.x, this.velocity.z) + step));
    this.detourTime = clear ? 1.2 : 0.7;
    if (this.stuckCount >= 3) this.stuckCount = 0;
  }

  moveToward(target, speed, dt, rate = 8) {
    const w = this.wayTo(target);
    _to.subVectors(w?.via ? _p.set(w.x, 0, w.z) : target, this.position).setY(0);
    let d = _to.length();
    if (d > 0.01) _to.divideScalar(d);
    if (w?.via) d = Math.max(d, w.dist);
    _desired.copy(_to).multiplyScalar(d > 0.3 ? speed : 0);
    this.steer(_desired, dt, rate);
    if (d > 0.3) this.turnTowards(Math.atan2(_to.x, _to.z), 6 * dt);
    return d;
  }

  // Indoors (a dungeon's rooms: world/Interior.js) the way to a point goes round walls and through
  // open doors (sim/Nav.js): { x, z, via, dist } — the next point to make for (the point itself
  // when it's in sight: `via` false) and how far it is by the way there. Outdoors, chasing or
  // going home, round whatever's in the straight line (openWay); null when nothing is.
  wayTo(target) {
    // What can't move (a siege engine, a spore pod) has no way to go: it fires from where it is.
    if (!this.type.speed) return null;
    if (!inPocket(this.position.x)) return this.state === 'chase' || this.state === 'return' ? this.openWay(target) : null;
    const it = this.sim.world.interiorAt(this.position.x, this.position.z);
    if (!it) return null;
    const w = it.nav.next(this.position.x - it.x0, this.position.z - it.z0, target.x - it.x0, target.z - it.z0, this.sim.time);
    return w && { x: w.x + it.x0, z: w.z + it.z0, via: w.via, dist: w.dist };
  }

  // Outdoors: the next corner on the way round rocks, trees, walls and slopes too steep to climb
  // (sim/OpenNav.js), worked out when the target has moved on or every second or so.
  openWay(target) {
    const world = this.sim.world;
    if (this.hover > 1.5 || !world.fits) return null;
    const nav = (this.sim.openNav ??= new OpenNav(world, MAX_SLOPE));
    nav.tick(this.sim.time);
    const t = this.sim.time;
    let P = this.path;
    if (!P || t >= P.until || Math.hypot(P.tx - target.x, P.tz - target.z) > 2.5) {
      P = this.path = { tx: target.x, tz: target.z, until: t + 0.7 + Math.random() * 0.5, pts: nav.route(this.position, target, this.radius), i: 0 };
    }
    const pts = P.pts;
    if (!pts) return null;
    const px = this.position.x;
    const pz = this.position.z;
    while (P.i < pts.length && Math.hypot(pts[P.i].x - px, pts[P.i].z - pz) < 0.8) P.i++;
    if (P.i >= pts.length) return null;
    let dist = Math.hypot(pts[P.i].x - px, pts[P.i].z - pz);
    for (let k = P.i + 1; k < pts.length; k++) dist += Math.hypot(pts[k].x - pts[k - 1].x, pts[k].z - pts[k - 1].z);
    const last = pts[pts.length - 1];
    dist += Math.hypot(target.x - last.x, target.z - last.z);
    return { x: pts[P.i].x, z: pts[P.i].z, via: true, dist };
  }

  // Can it see `p`? Indoors, only along the grid with nothing in the way.
  sees(p) {
    if (!inPocket(this.position.x)) return true;
    const it = this.sim.world.interiorAt(this.position.x, this.position.z);
    return !it || it.nav.sees(this.position.x - it.x0, this.position.z - it.z0, p.position.x - it.x0, p.position.z - it.z0);
  }

  // Planar direction to the target in _to; returns the distance. Indoors with the target out of
  // sight: towards the next turn of the way there (`blind`), and the distance by that way.
  toFoe(p) {
    _to.subVectors(p.position, this.position).setY(0);
    let d = _to.length();
    this.blind = false;
    const w = this.wayTo(p.position);
    if (w?.via) {
      _to.set(w.x - this.position.x, 0, w.z - this.position.z);
      d = w.dist;
      this.blind = true;
    }
    _to.divideScalar(_to.length() || 1);
    return d;
  }

  get moveSpeed() {
    return this.type.speed * this.speedMultiplier() * this.locomotionMultiplier * (this.frenzy > 0 ? 1.3 : 1);
  }

  get height() {
    return this.baseHeight * legDamageProfile(this.type, this.brokenParts).height;
  }

  get locomotionMultiplier() {
    return legDamageProfile(this.type, this.brokenParts).move;
  }

  // ================================================================ update
  update(dt) {
    if (this.alive && this.sim.freezeAI && this.state !== 'spawn') return;
    this.stateTime += dt;
    this.cooldown -= dt;
    for (const a of this.attacks) a.cd -= dt;
    this.blinkCd -= dt;
    this.frenzy -= dt;
    this.rallied -= dt;
    if (this.ward && (this.ward.time -= dt) <= 0) this.ward = null;
    this.updateStatuses(dt);
    this.retarget(dt);
    if (this.affixes.length && this.alive) this.updateAffixes(dt);

    // Minions fade when whoever called them is gone or has given up; reinforcements and halves
    // when they give up themselves.
    if (this.summoner && this.alive && (this.summoner.gone || !this.summoner.alive || (!this.summoner.engaged && this.state !== 'spawn'))) {
      this.dissolve();
    } else if (this.transient && this.alive && !this.engaged && this.state !== 'spawn') this.dissolve();
    const p = this.foe;
    if (this.alive && this.engaged && this.state !== 'return') {
      if (!p) this.leash();
      else {
        const farFromHome = this.position.distanceTo(this.home) > LEASH_RADIUS * (this.isBoss ? 1.4 : 1);
        const foeGone = this.dist2(p) > LEASH_PLAYER;
        if (farFromHome && foeGone) this.leash();
      }
    }
    this.checkStuck(dt, this.state === 'return' || (this.state === 'chase' && !KITERS.has(this.behavior) && this.behavior !== 'flyer'));
    this.guarding = false;

    switch (this.state) {
      case 'spawn':
        if (this.stateTime >= 0.6) this.setState(this.engaged && this.foe ? 'chase' : 'idle');
        break;
      case 'idle': this.updateIdle(dt); break;
      case 'return': {
        const d = this.moveToward(this.home, this.moveSpeed * 1.4, dt);
        this.hp = Math.min(this.maxHp, this.hp + this.maxHp * RETURN_REGEN * dt);
        if (d < 1.2) {
          this.setState('idle');
          this.threat.clear();
          this.maxHp = this.baseMaxHp;
          this.hp = Math.min(this.hp, this.maxHp);
          if (this.type.behavior === 'ambusher') this.hidden = true;
        }
        break;
      }
      case 'chase': if (this.foe) this.updateChase(dt, this.foe); break;
      case 'windup': if (this.foe) this.updateWindup(dt, this.foe); else this.setState('recover'); break;
      case 'attack': if (this.foe) this.updateAttack(dt, this.foe); else this.setState('recover'); break;
      case 'recover':
        this.damp(dt);
        if (this.type.block && this.stateTime > this.cur.recover * 0.5) this.guarding = true;
        if (this.stateTime >= this.cur.recover) {
          this.cooldown = randIn(this.type.cooldown) * (this.frenzy > 0 ? 0.6 : 1);
          this.setState(this.engaged ? 'chase' : 'return');
        }
        break;
      case 'stagger':
        this.damp(dt, 6);
        if (this.stateTime >= this.type.staggerTime) this.setState(this.engaged ? 'chase' : 'return');
        break;
      case 'dead':
        this.damp(dt, 4);
        if (this.stateTime >= CORPSE_LIFETIME) this.removeMe = true;
        break;
    }

    this.integrate(dt);
    if (this.hover) {
      // Flyers keep their altitude (dipping to strike); everything that floats drops when it dies.
      const dip = this.type.behavior === 'flyer' && (this.state === 'windup' || this.state === 'attack') ? 0.6 : 0;
      const want = this.alive ? this.hover - dip : 0;
      this.alt += (want - this.alt) * (1 - Math.exp(-(this.alive ? 3 : 5) * dt));
      this.position.y += this.alt;
    }
  }

  // Ground movement: slide along colliders, refuse cliffs steeper than MAX_SLOPE, stick to terrain.
  integrate(dt) {
    const world = this.sim.world;
    const p = this.position;
    const ox = p.x;
    const oz = p.z;
    const og = world.groundHeight(ox, oz);
    // Where it stood last step (on the ground, or a kerb or rock it stepped up onto) — unless it's
    // been put somewhere else since (a blink, a spawn, back home).
    const oy = this.feetAt && Math.abs(this.feetAt.x - ox) + Math.abs(this.feetAt.z - oz) < 1e-6 ? Math.max(og, this.feetY) : og;
    p.y = oy;
    // Swept in short steps, so a charge or a knockback can't carry it through a wall.
    _push.set(0, 0, 0);
    world.move(p, (this.velocity.x + this.knockback.x) * dt, (this.velocity.z + this.knockback.z) * dt, this.radius, STEP_UP, this.height, _push);
    stopAgainst(_push, this.velocity, this.knockback);
    this.knockback.multiplyScalar(Math.exp(-7 * dt));
    const dist = Math.hypot(p.x - ox, p.z - oz);
    if (dist > 1e-4 && (world.groundHeight(p.x, p.z) - og) / dist > MAX_SLOPE) {
      // Too steep straight on: slide along the hill (whichever part of the move climbs gently
      // enough, the bigger first) rather than stopping dead against it.
      const mx = p.x - ox;
      const mz = p.z - oz;
      p.x = ox;
      p.z = oz;
      for (const [sx, sz] of Math.abs(mx) >= Math.abs(mz) ? [[mx, 0], [0, mz]] : [[0, mz], [mx, 0]]) {
        const d = Math.abs(sx + sz);
        if (d < 1e-4 || (world.groundHeight(ox + sx, oz + sz) - og) / d > MAX_SLOPE) continue;
        p.x = ox + sx;
        p.z = oz + sz;
        world.resolve(p, this.radius, STEP_UP, this.height, _o.set(ox, oy, oz));
        break;
      }
    }
    const ny = world.supportHeight ? world.supportHeight(p.x, p.z, oy + STEP_UP, oy + STEP_UP) : world.groundHeight(p.x, p.z);
    p.y = ny;
    this.feetY = ny;
    (this.feetAt ??= { x: 0, z: 0 }).x = p.x;
    this.feetAt.z = p.z;
  }

  updateIdle(dt) {
    const radius = this.hidden ? 8 : this.isBoss || this.behavior === 'flyer' ? 16 : AGGRO_RADIUS;
    const near = this.nearestPlayer(radius);
    if (near && this.sees(near)) {
      this.aggro(false, near);
      return;
    }
    if (this.hidden) { this.damp(dt, 6); return; }
    if (this.stateTime > 3 + Math.random() * 3) {
      const a = Math.random() * Math.PI * 2;
      this.wanderTarget.set(this.home.x + Math.cos(a) * 3, 0, this.home.z + Math.sin(a) * 3);
      this.stateTime = 0;
    }
    this.moveToward(this.wanderTarget, Math.min(1.2, this.moveSpeed * 0.4), dt, 4);
  }

  // ================================================================ footwork
  updateChase(dt, p) {
    const dist = this.toFoe(p);
    // Out of sight round a corner: just go after them.
    if (this.blind) {
      this.turnTowards(Math.atan2(_to.x, _to.z), 7 * dt);
      _desired.copy(_to).multiplyScalar(this.moveSpeed);
      this.steer(_desired, dt, 8);
      return;
    }
    if (this.cooldown <= 0) {
      const a = this.pickAttack(dist, p);
      if (a) { this.startAttack(a, p); return; }
    }
    const blink = this.type.blink;
    if (blink && this.blinkCd <= 0 && dist < blink.range) { this.blink(p, blink); return; }
    if (this.affix.has('blinking') && this.blinkCd <= 0 && dist > 7 && dist < 26) { this.blinkTo(p); return; }
    this.guarding = !!this.type.block;
    const speed = this.moveSpeed;
    const b = this.behavior;
    if (KITERS.has(b)) this.kite(dist, speed, dt);
    else if (b === 'flyer') this.orbit(dist, speed, dt);
    else if (b === 'pack') this.circle(dist, speed, dt, p);
    else this.press(dist, speed, dt, p);
  }

  // Elite affixes that act over time (sim/affixes.js).
  updateAffixes(dt) {
    const a = this.affix;
    this.calm += dt;
    if (this.shieldMax && this.shield < this.shieldMax && this.calm > SHIELD.lull) {
      if (this.shield === 0) this.sim.emit({ k: 'shield', id: this.id, at: this.position, up: 1 });
      this.shield = Math.min(this.shieldMax, this.shield + (this.shieldMax / SHIELD.refill) * dt);
    }
    if (a.has('frenzied') && this.hp < this.maxHp * 0.5) this.frenzy = Math.max(this.frenzy, 0.3);
    if (!this.engaged) return;
    if (a.has('vampiric')) this.heal(this.maxHp * VAMPIRIC_REGEN * dt);
    if (a.has('commander')) for (const e of this.allies(RALLY.radius)) if (e !== this) e.rallied = 0.6;
    if (a.has('overcharged') && (this.pulseT -= dt) <= 0) {
      this.pulseT = OVERCHARGE.every;
      const pos = this.position.clone();
      const dmg = Math.round((this.attacks[0]?.damage ?? 10) * OVERCHARGE.damage);
      this.sim.emit({ k: 'tele', at: pos, p: r3(pos), r: OVERCHARGE.radius, t: OVERCHARGE.warn, el: 'shock' });
      this.sim.after(OVERCHARGE.warn, () => {
        if (this.alive) this.sim.emit({ k: 'boom', id: this.id, at: pos, p: r3(pos), r: OVERCHARGE.radius, dmg, kb: 5, el: 'shock' });
      });
    }
  }

  // Close in; while waiting for an opening (no token, on cooldown) circle at the edge of reach.
  press(dist, speed, dt, p) {
    this.turnTowards(Math.atan2(_to.x, _to.z), 7 * dt);
    const b = this.behavior;
    const engage = this.reach + p.radius - 0.5;
    const ready = this.cooldown <= 0 && (this.isBoss || this.sim.tokenAvailable(this, 'melee'));
    const sp = speed * (this.guarding ? 0.75 : 1);
    if (dist > engage + 3 || ready) _desired.copy(_to).multiplyScalar(dist > engage ? sp : 0);
    else if (b === 'brute' || b === 'boss' || b === 'charger') _desired.copy(_to).multiplyScalar(dist > engage + 0.8 ? sp * 0.5 : 0);
    else {
      // Waiting for an opening: work round to its own bearing on the target (so a crowd surrounds
      // them and comes at their flanks and back), then shuffle there.
      const ring = engage + (b === 'swarm' ? 1.0 : 1.8);
      const radial = clamp(dist - ring, -1, 1);
      const off = wrapAngle(this.flank - Math.atan2(-_to.x, -_to.z));
      const shuffle = b === 'swarm' ? 0.7 : b === 'shield' ? 0.3 : 0.45;
      let side = this.strafeDir;
      let lateral = shuffle;
      if (Math.abs(off) > 0.4) {
        side = Math.sign(off);
        lateral = Math.max(shuffle, b === 'shield' ? 0.45 : 0.85);
      } else if (Math.random() < dt * (b === 'swarm' ? 0.9 : b === 'duelist' ? 0.6 : 0.3)) this.strafeDir *= -1;
      _desired.set(-_to.z * side, 0, _to.x * side).multiplyScalar(sp * lateral).addScaledVector(_to, radial * sp * 0.6);
    }
    this.steer(_desired, dt, 8);
  }

  // Hold a band of distance and strafe.
  kite(dist, speed, dt) {
    this.turnTowards(Math.atan2(_to.x, _to.z), 7 * dt);
    if (Math.random() < dt * 0.4) this.strafeDir *= -1;
    const near = this.type.keepAway ?? 7;
    const far = Math.max(near + 2, this.maxRange * 0.75);
    const radial = dist < near ? -1 : dist > far ? 1 : 0;
    _desired.set(-_to.z * this.strafeDir, 0, _to.x * this.strafeDir).multiplyScalar(speed * 0.5).addScaledVector(_to, radial * speed);
    this.steer(_desired, dt, 6);
  }

  // Flyers circle their target at their orbit radius, drifting.
  orbit(dist, speed, dt) {
    this.turnTowards(Math.atan2(_to.x, _to.z), 6 * dt);
    if (Math.random() < dt * 0.25) this.strafeDir *= -1;
    const R = this.type.orbit ?? 10;
    const radial = clamp((dist - R) / 3, -1, 1);
    _desired.set(-_to.z * this.strafeDir, 0, _to.x * this.strafeDir).multiplyScalar(speed * 0.7).addScaledVector(_to, radial * speed);
    this.steer(_desired, dt, 2.5);
  }

  // Pack hunters circle their target at a distance and dart in when an opening comes.
  circle(dist, speed, dt, p) {
    const ready = this.cooldown <= 0 && this.sim.tokenAvailable(this, 'melee');
    if (ready) {
      this.turnTowards(Math.atan2(_to.x, _to.z), 8 * dt);
      _desired.copy(_to).multiplyScalar(speed);
      this.steer(_desired, dt, 6);
      return;
    }
    const R = 5 + this.ringJitter;
    this.orbitA += (this.strafeDir * speed * 0.5 * dt) / R;
    if (Math.random() < dt * 0.1) this.strafeDir *= -1;
    _p.set(p.position.x + Math.sin(this.orbitA) * R, 0, p.position.z + Math.cos(this.orbitA) * R);
    _desired.subVectors(_p, this.position).setY(0);
    const d = _desired.length();
    _desired.multiplyScalar(d > 0.01 ? (speed * Math.min(1, d / 2.5)) / d : 0);
    if (d > 0.6) this.turnTowards(Math.atan2(_desired.x, _desired.z), 6 * dt);
    else this.turnTowards(Math.atan2(_to.x, _to.z), 6 * dt);
    this.steer(_desired, dt, 5);
  }

  // Casters step through the void away from a player who closes in.
  blink(p, b) {
    const away = Math.atan2(this.position.x - p.position.x, this.position.z - p.position.z);
    const w = this.sim.world;
    for (let i = 0; i < 6; i++) {
      const a = away + (Math.random() - 0.5) * 2.2;
      const x = this.position.x + Math.sin(a) * b.distance;
      const z = this.position.z + Math.cos(a) * b.distance;
      if (!w.standable(x, z) || w.blocks(_p.set(x, w.groundHeight(x, z) + 0.5, z))) continue;
      const from = r3(this.position);
      this.position.set(x, w.groundHeight(x, z), z);
      this.sim.emit({ k: 'blink', id: this.id, from, to: r3(this.position), at: this.position });
      this.blinkCd = b.cooldown;
      this.lastPos.copy(this.position);
      return;
    }
    this.blinkCd = 1;
  }

  // Blinking elites step through the void to just beside their target, on its far side.
  blinkTo(p) {
    const w = this.sim.world;
    const back = Math.atan2(p.position.x - this.position.x, p.position.z - this.position.z);
    for (let i = 0; i < 6; i++) {
      const a = back + (Math.random() - 0.5) * 2.4;
      const x = p.position.x + Math.sin(a) * 2.6;
      const z = p.position.z + Math.cos(a) * 2.6;
      if (!w.standable(x, z) || w.blocks(_p.set(x, w.groundHeight(x, z) + 0.5, z))) continue;
      const from = r3(this.position);
      this.position.set(x, w.groundHeight(x, z), z);
      this.facing = Math.atan2(p.position.x - x, p.position.z - z);
      this.sim.emit({ k: 'blink', id: this.id, from, to: r3(this.position), at: this.position });
      this.blinkCd = 6 + Math.random() * 2;
      this.lastPos.copy(this.position);
      this.cooldown = Math.max(this.cooldown, 0.35);
      return;
    }
    this.blinkCd = 1;
  }

  // ================================================================ attacks
  tokenKind(a) {
    if (this.isBoss || this.summoner) return null;
    if (MELEE_KINDS.has(a.kind)) return 'melee';
    if (RANGED_KINDS.has(a.kind)) return 'ranged';
    return null;
  }

  pickAttack(dist, p) {
    let total = 0;
    const opts = [];
    for (const a of this.attacks) {
      if (a.cd > 0) continue;
      if (this.attackDisabled(a)) continue;
      if (a.minLevel && this.level < a.minLevel) continue;
      if (a.hpBelow && this.hp / this.maxHp > a.hpBelow) continue;
      // (A blow with a lunge behind it can start from a little further out.)
      const reach = CLOSE_KINDS.has(a.kind) ? a.range + p.radius - 0.2 + (a.lunge ?? 0) * a.active * 0.4 : a.range;
      if (dist > reach || dist < (a.min ?? 0)) continue;
      const tk = this.tokenKind(a);
      if (tk && !this.sim.tokenAvailable(this, tk)) continue;
      if (!this.useful(a)) continue;
      const w = (a.weight ?? 1) * (a.cooldown ? 1.6 : 1);
      opts.push([a, w]);
      total += w;
    }
    let r = Math.random() * total;
    for (const [a, w] of opts) if ((r -= w) <= 0) return a;
    return null;
  }

  attackDisabled(attack) {
    if (!this.brokenParts.length) return false;
    return this.brokenParts.some((id) => anyComponentSpec(id)?.attacks?.includes(attack.kind));
  }

  allies(radius) {
    const out = [];
    for (const e of this.sim.enemies) {
      if (!e.alive || e.state === 'dead') continue;
      if (e.type.race !== this.type.race) continue;
      if (e.position.distanceToSquared(this.position) > radius * radius) continue;
      out.push(e);
    }
    return out;
  }

  // Support moves only when they'd do something.
  useful(a) {
    switch (a.kind) {
      case 'summon': return this.minions.filter((m) => m.alive).length < a.maxMinions;
      case 'ward': {
        const list = this.allies(a.range).filter((e) => e !== this && !e.ward && e.engaged);
        list.sort((x, y) => x.hp / x.maxHp - y.hp / y.maxHp || (y.type.mass - x.type.mass));
        this.castTarget = list[0] ?? null;
        return !!this.castTarget;
      }
      case 'heal': return this.allies(a.radius).some((e) => e.hp < e.maxHp * 0.7);
      case 'howl': return this.allies(a.radius).some((e) => e !== this && e.frenzy <= 0);
      default: return true;
    }
  }

  startAttack(a, p) {
    this.cur = a;
    this.curIndex = this.attacks.indexOf(a);
    this.attackSeq++;
    this.live = liveAttack(a, this.frenzy > 0, this.rallied > 0);
    this.hitIndex = 0;
    a.cd = a.cooldown ?? 0;
    const tk = this.tokenKind(a);
    if (tk) this.sim.takeToken(this, tk);
    this.mark.copy(p.position);
    this.setState('windup');
  }

  windupTime() {
    const a = this.cur;
    return this.hitIndex > 0 ? a.windup * 0.45 : a.windup;
  }

  updateWindup(dt, p) {
    const a = this.cur;
    const kind = a.kind;
    const ranged = RANGED_KINDS.has(kind) || kind === 'charge' || kind === 'pounce';
    const close = CLOSE_KINDS.has(kind) || kind === 'bash';
    if (close) {
      // Keeps closing while it winds up — a quick bite at a run, a heavy blow at a walk — so just
      // backing off doesn't dodge it; stepping aside, rolling or blocking still do.
      const dist = this.dist2(p);
      const want = a.range * 0.5 + p.radius;
      const quick = a.windup < 0.5;
      const at = this.angleTo(p.position);
      _desired.set(Math.sin(at), 0, Math.cos(at)).multiplyScalar(dist > want ? this.moveSpeed * (quick ? 0.75 : 0.35) : 0);
      this.velocity.lerp(_desired, 1 - Math.exp(-8 * dt));
    } else if (kind !== 'charge') this.damp(dt);
    this.turnTowards(this.angleTo(p.position), (ranged || this.hitIndex > 0 ? 6 : close && a.windup < 0.5 ? 7 : 4) * dt);
    this.mark.copy(p.position);
    if (kind === 'bash' || kind === 'shield') this.guarding = true;
    if (this.stateTime < this.windupTime()) return;
    this.release(a, p);
  }

  release(a, p) {
    const L = this.live;
    // A blow at something an event's defenders hold (no screen takes it: the sim counts it).
    if (p.structure) p.event.director.strike(p, this, L);
    switch (a.kind) {
      case 'swing': case 'combo': case 'bite': case 'bash': {
        this.landed = false;
        // The lunge carries it as far as it takes to bring its target well into reach (within
        // limits): a fixed step fell short of anyone who'd taken a pace back.
        const lunge = a.lunge ?? 0;
        const travel = this.dist2(p) - (a.range * 0.55 + p.radius);
        this.lungeK = lunge > 0 ? clamp(travel / (lunge * a.active * 0.5), 0.5, 1.8) : 1;
        this.setState('attack');
        return;
      }
      case 'charge':
        this.landed = false;
        this.forward(this.chargeDir ?? (this.chargeDir = new THREE.Vector3()));
        this.setState('attack');
        return;
      case 'pounce': {
        this.landed = false;
        _o.subVectors(this.mark, this.position).setY(0);
        const d = Math.min(_o.length(), a.range);
        _o.setLength(Math.max(0.5, d - p.radius * 0.5));
        this.setState('attack');
        this.leap = { vx: _o.x / a.active, vz: _o.z / a.active, h: 1.0 + d * 0.12 };
        return;
      }
      case 'burst':
        this.shots = 0;
        this.setState('attack');
        return;
      case 'arrow': this.fireArrow(L, p); break;
      case 'bolt': case 'fan': this.fireFan(L, p); break;
      case 'lob':
        for (let i = 0; i < (a.count ?? 1); i++) this.lob(L, p, i);
        break;
      case 'stomp': case 'nova':
        this.sim.emit({
          k: 'boom', id: this.id, at: this.position, p: r3(this.position), r: L.radius, dmg: L.damage, kb: L.knockback,
          el: L.element !== 'none' ? L.element : undefined, nova: a.kind === 'nova' ? 1 : 0, sh: 0.8,
        });
        break;
      case 'ward': this.castWard(L); break;
      case 'heal': this.castHeal(L); break;
      case 'howl': this.castHowl(L); break;
      case 'summon': this.summon(L); break;
    }
    this.setState('recover');
  }

  // Would this sweep reach the target right now? (AI flow only: players decide their own hits.)
  reaches(arc, range, p) {
    return p.alive && sweepReaches(this.position, this.facing, this.height, arc, range, p);
  }

  updateAttack(dt, p) {
    const a = this.cur;
    const t = this.stateTime;
    switch (a.kind) {
      case 'swing': case 'combo': case 'bite': case 'bash': {
        this.forward(_fwd);
        const lunge = (a.lunge ?? 0) * (this.lungeK ?? 1);
        // A little homing through the first half (a bite snaps round at a dodge; a blade less so).
        if (t < a.active * 0.5) this.turnTowards(this.angleTo(p.position), (a.kind === 'bite' ? 5 : 2.5) * dt);
        this.velocity.copy(_fwd).multiplyScalar((a.kind === 'bash' ? lunge * (1 - 0.5 * t / a.active) : lunge * (1 - t / a.active)) * this.locomotionMultiplier);
        if (a.kind === 'bash') this.guarding = !a.stab;
        if (!this.landed && this.reaches(a.arc, a.range, p)) this.landed = true;
        if (t >= a.active || (a.kind === 'bash' && this.landed)) {
          if (a.kind === 'combo' && this.hitIndex < (a.hits ?? 2) - 1) {
            this.hitIndex++;
            this.landed = false;
            this.state = 'windup';
            this.stateTime = 0;
            return;
          }
          this.setState('recover');
        }
        return;
      }
      case 'charge': {
        // Locked in early, a little homing, then committed.
        if (t < a.active * 0.35) {
          this.turnTowards(this.angleTo(p.position), 1.4 * dt);
          this.forward(this.chargeDir);
        }
        this.facing = Math.atan2(this.chargeDir.x, this.chargeDir.z);
        this.velocity.copy(this.chargeDir).multiplyScalar(a.speed * this.speedMultiplier());
        const hit = this.reaches(110, this.radius + 0.9, p);
        // Crashing into something solid stuns the charger.
        const moved = Math.hypot(this.position.x - this.lastPos.x, this.position.z - this.lastPos.z);
        this.crash = moved < 0.01 ? (this.crash ?? 0) + dt : 0;
        if (this.crash > 0.12 && t > 0.2) {
          this.crash = 0;
          this.setState('stagger');
          return;
        }
        this.lastPos.copy(this.position);
        if (hit || t >= a.active) this.setState('recover');
        return;
      }
      case 'pounce': {
        const k = clamp(t / a.active, 0, 1);
        if (this.leap) {
          this.velocity.set(this.leap.vx, 0, this.leap.vz);
          this.lift = 4 * this.leap.h * k * (1 - k);
        }
        if (k >= 1) {
          this.lift = 0;
          this.velocity.multiplyScalar(0.2);
          this.setState('recover');
        }
        return;
      }
      case 'burst': {
        this.damp(dt, 6);
        this.turnTowards(this.angleTo(p.position), 5 * dt);
        const n = a.count ?? 3;
        while (this.shots < n && t >= (this.shots / n) * a.active) {
          this.shots++;
          this.fireFan({ ...this.live, count: 1, fan: 0 }, p, 0.6);
        }
        if (t >= a.active) this.setState('recover');
        return;
      }
      default:
        this.setState('recover');
    }
  }

  // Where shots leave the body (from the body's proportions; the view draws the shot from its own
  // rig, close enough not to notice).
  muzzle(out) {
    this.forward(_fwd);
    const t = this.type;
    const y = this.position.y;
    if (this.hover) return out.copy(this.position).setY(y + this.height * 0.5).addScaledVector(_fwd, 0.45);
    if (t.rig !== 'biped') return out.copy(this.position).setY(y + this.height * 0.75).addScaledVector(_fwd, this.radius + 0.25);
    const m = t.muzzle;
    return out.copy(this.position).addScaledVector(_fwd, m?.f ?? 0.6).setY(y + this.height * (m?.y ?? 0.72));
  }

  // Aim at the target's chest, leading their motion a little; `spread` in metres.
  aimAt(origin, speed, spread, out) {
    const p = this.foe;
    const flight = origin.distanceTo(p.position) / speed;
    out.copy(p.position).addScaledVector(p.velocity, flight * 0.6);
    out.y += p.height * 0.55;
    out.x += (Math.random() - 0.5) * spread;
    out.z += (Math.random() - 0.5) * spread;
    return out.sub(origin).normalize();
  }

  // A projectile, as an event: every screen flies it; only the player it hits is hurt by it.
  shoot(L, origin, dir, extra = {}) {
    const el = L.element && L.element !== 'none' ? L.element : undefined;
    this.sim.emit({
      k: 'shot', id: this.id, at: origin, o: r3(origin), d: r3(dir), proj: L.proj ?? 'arrow', sp: L.speed, dmg: L.damage,
      kb: L.knockback ?? 3, life: Math.round(((L.range / L.speed) * 1.4 + 0.4) * 100) / 100, pi: L.pierce ?? 0,
      el, inf: L.status ?? el, hom: L.homing ? { turn: L.homing, time: (L.range / L.speed) * 0.7, tid: this.foe?.id ?? null } : undefined,
      ...extra,
    });
  }

  fireArrow(L, p) {
    const origin = this.muzzle(_o);
    this.aimAt(origin, L.speed, L.pierce ? 0.4 : 1.2, _aim);
    this.shoot(L, origin, _aim, { m: 1 });
    void p;
  }

  fireFan(L, p, spread = 0.6) {
    const origin = this.muzzle(_o);
    this.aimAt(origin, L.speed, spread, _aim);
    const n = L.count ?? 1;
    const fan = L.fan ?? 0;
    for (let i = 0; i < n; i++) {
      const off = n > 1 ? (i / (n - 1) - 0.5) * fan : 0;
      _dir.copy(_aim).applyAxisAngle(UP, off);
      this.shoot(L, origin, _dir, i === 0 ? { m: 1 } : {});
    }
    void p;
  }

  // Bombs and mortar shells: a ballistic arc to where the target is heading, its landing marked.
  lob(L, p, i) {
    const w = this.sim.world;
    const origin = this.muzzle(_o);
    const T0 = 0.55 + origin.distanceTo(p.position) / 16;
    const T = clamp(T0, 0.7, 1.7);
    _p.copy(p.position).addScaledVector(p.velocity, T * 0.5);
    if (i > 0) { const a = Math.random() * Math.PI * 2; const r = 2 + Math.random() * 2.5; _p.x += Math.cos(a) * r; _p.z += Math.sin(a) * r; }
    _p.y = w.groundHeight(_p.x, _p.z);
    const grav = 22;
    _dir.set((_p.x - origin.x) / T, (_p.y - origin.y + 0.5 * grav * T * T) / T, (_p.z - origin.z) / T);
    const speed = _dir.length();
    _dir.divideScalar(speed);
    const el = L.element && L.element !== 'none' ? L.element : undefined;
    this.sim.emit({
      k: 'shot', id: this.id, at: origin, o: r3(origin), d: [_dir.x, _dir.y, _dir.z].map((v) => Math.round(v * 1e4) / 1e4), proj: 'bomb',
      sp: Math.round(speed * 100) / 100, gv: grav, dmg: L.damage, kb: L.knockback, ao: L.radius, fu: L.fuse ?? 0, life: Math.round((T + 3) * 100) / 100,
      big: this.type.mass >= 3 ? 1 : 0, el, inf: el, lp: r3(_p), lt: Math.round((T + (L.fuse ?? 0)) * 100) / 100, m: i === 0 ? 1 : 0,
    });
  }

  castWard(L) {
    const t = this.castTarget;
    if (!t || !t.alive) return;
    t.ward = { time: L.duration, reduce: L.reduce };
    this.sim.emit({ k: 'ward', id: this.id, to: t.id, at: t.position, el: L.element });
  }

  castHeal(L) {
    const list = [];
    for (const e of this.allies(L.radius)) {
      const amount = Math.round(e.maxHp * L.amount);
      e.heal(amount);
      list.push([e.id, amount]);
    }
    this.sim.emit({ k: 'heal', id: this.id, r: L.radius, list, at: this.position });
  }

  castHowl(L) {
    for (const e of this.allies(L.radius)) {
      e.frenzy = L.duration;
      if (!e.engaged) e.aggro(false, this.foe);
    }
    this.sim.emit({ k: 'howl', id: this.id, r: L.radius, at: this.position });
  }

  summon(L) {
    const n = Math.min(L.count, L.maxMinions - this.minions.filter((m) => m.alive).length);
    this.minions = this.minions.filter((m) => m.alive);
    // The pack comes running in from the edge; the rest hatch or are deployed beside the summoner.
    const far = this.type.race === 'fauna' && !inPocket(this.position.x) ? 11 : 3.2;
    for (let i = 0; i < n; i++) {
      const a = this.facing + Math.PI + (i - (n - 1) / 2) * 0.9;
      let x = this.position.x + Math.sin(a) * far;
      let z = this.position.z + Math.cos(a) * far;
      // Indoors with a wall there: at the summoner's side instead.
      if (!this.sim.world.standable(x, z)) { x = this.position.x + Math.sin(a) * 1.2; z = this.position.z + Math.cos(a) * 1.2; }
      if (!this.sim.world.standable(x, z)) continue;
      const e = this.sim.spawnEnemy(L.summon, _p.set(x, 0, z), { level: Math.max(1, this.level - 1), summoner: this });
      e.engaged = true;
      e.hidden = false;
      e.foe = this.foe;
      this.minions.push(e);
    }
  }

  // ================================================================ damage
  // A hit as reported by the player who landed it (blocks and wards already taken off on their
  // screen, which saw the guard): health, credit, threat, knockback, stagger and death.
  applyHit(hit) {
    if (!this.alive) return false;
    const by = hit.by ?? null;
    let damage = hit.damage;
    this.calm = 0;
    const part = hit.component && anyComponentSpec(hit.component);
    let componentAccumulated = 0;
    if (part?.breakable && !this.brokenParts.includes(part.id)) {
      componentAccumulated = (this.componentDamage[part.id] ?? 0) + Math.max(0, hit.damage);
      this.componentDamage[part.id] = componentAccumulated;
    }
    // A shield soaks up hits until it breaks.
    if (this.shield > 0) {
      const soak = Math.min(this.shield, damage);
      this.shield -= soak;
      damage -= soak;
      if (this.shield <= 0) {
        this.shield = 0;
        this.sim.emit({ k: 'shield', id: this.id, at: this.position });
      }
    }
    this.hp = Math.max(0, this.hp - damage);
    if (by !== null) {
      this.credit.set(by, (this.credit.get(by) ?? 0) + hit.damage);
      this.threat.set(by, (this.threat.get(by) ?? 0) + hit.damage);
    }
    if (hit.dir) {
      this.knockback.x += (hit.dir.x * (hit.knockback ?? 0)) / this.mass;
      this.knockback.z += (hit.dir.z * (hit.knockback ?? 0)) / this.mass;
    }
    if (hit.status) this.addStatus(hit.status.el, hit.status.potency, by);
    if (this.hp <= 0) {
      this.alive = false;
      this.statuses = {};
      // Parts accumulate damage while alive, but only the lethal hit can sever one. Heads are
      // weak points and sever on a lethal headshot; limbs still require their accumulated threshold.
      if (part && !this.brokenParts.includes(part.id)
        && (part.severOnKill || (part.breakable && componentAccumulated >= part.threshold))) {
        this.brokenParts.push(part.id);
        this.sim.emit({ k: 'part', id: this.id, part: part.id, at: this.position });
      }
      this.onDeath(hit);
      return true;
    }
    if (!this.engaged) this.aggro(true, this.sim.playerById(by));
    if ((hit.poise ?? 0) > 0) {
      this.poiseAccum += hit.poise;
      if (this.type.poise === 0 || this.poiseAccum >= this.type.poise) {
        this.poiseAccum = 0;
        this.lift = 0;
        this.setState('stagger');
      }
    }
    return true;
  }

  // Elemental statuses that stay on the enemy (shock's chain is resolved by the hitter).
  addStatus(el, potency, by) {
    if (!this.alive) return;
    const s = this.statuses;
    switch (el) {
      case 'fire': s.burn = { time: 3, tick: BURN_TICK, dps: Math.max(2, potency * 0.35), by }; break;
      case 'frost': s.chill = { time: 2.5, slow: 0.45 }; break;
      case 'corrosive': s.corrode = { time: 4, amp: 0.25 }; break;
      case 'shock': s.shocked = { time: 0.25 }; break;
    }
  }

  updateStatuses(dt) {
    const s = this.statuses;
    for (const key of Object.keys(s)) {
      const st = s[key];
      st.time -= dt;
      if (key === 'burn' && this.alive) {
        st.tick -= dt;
        if (st.tick <= 0) {
          st.tick += BURN_TICK;
          const n = Math.max(1, Math.round(st.dps * BURN_TICK * (s.corrode ? 1 + s.corrode.amp : 1)));
          this.sim.emit({ k: 'dmg', id: this.id, n, el: 'fire', at: this.position });
          this.applyHit({ by: st.by, damage: n, source: 'status', poise: 0 });
          if (!this.alive) return;
        }
      }
      if (st.time <= 0) delete s[key];
    }
  }

  onDeath(hit) {
    this.setState('dead');
    this.engaged = false;
    this.lift = 0;
    this.velocity.set(0, 0, 0);
    if (hit.dir) this.knockback.set(hit.dir.x * 4, 0, hit.dir.z * 4);
    this.ward = null;
    const burst = this.type.deathBurst;
    if (burst) {
      // Bloaters burst a moment after they drop.
      const pos = this.position.clone();
      const dmg = enemyDamage(burst.damage, this.level);
      this.sim.emit({ k: 'tele', at: pos, p: r3(pos), r: burst.radius, t: 0.6, el: burst.element, fuse: 1 });
      this.sim.after(0.6, () => this.sim.emit({ k: 'boom', id: this.id, at: pos, p: r3(pos), r: burst.radius, dmg, kb: 8, el: burst.element }));
    }
    if (this.affix.has('volatile')) {
      const pos = this.position.clone();
      const dmg = Math.round((this.attacks[0]?.damage ?? 10) * VOLATILE.damage);
      this.sim.emit({ k: 'tele', at: pos, p: r3(pos), r: VOLATILE.radius, t: VOLATILE.fuse, el: 'fire', fuse: 1 });
      this.sim.after(VOLATILE.fuse, () => this.sim.emit({ k: 'boom', id: this.id, at: pos, p: r3(pos), r: VOLATILE.radius, dmg, kb: 10, el: 'fire', sh: 0.5 }));
    }
    if (this.affix.has('splitting')) this.splitApart();
    this.sim.onKilled(this, hit);
  }

  // A Splitting elite comes apart into two of its kind, already fighting.
  splitApart() {
    const pos = this.position.clone();
    const foe = this.foe;
    this.sim.after(0.35, () => {
      for (const side of [-1, 1]) {
        const a = this.facing + side * 1.7;
        const x = pos.x + Math.sin(a) * 1.3;
        const z = pos.z + Math.cos(a) * 1.3;
        if (!this.sim.world.standable(x, z)) continue;
        const e = this.sim.spawnEnemy(this.typeName, _p.set(x, 0, z), { level: this.level, variant: this.variant, split: true });
        e.hidden = false;
        if (foe?.alive && !foe.gone) e.aggro(true, foe);
      }
    });
  }

  // Quietly gone (a minion whose summoner left): no rewards.
  dissolve() {
    this.alive = false;
    this.engaged = false;
    this.sim.emit({ k: 'poof', id: this.id, at: this.position });
    this.setState('dead');
  }
}
