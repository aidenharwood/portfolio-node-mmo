// An enemy as seen on this screen: its model, animation, effects and sound, following its
// simulation (src/sim/EnemySim.js) — the local sim offline, or the server's state, interpolated,
// online (net/EnemyReplica.js). The view never decides how the enemy behaves; it shows it:
//   - the moments of an attack (telegraphs, swing sounds, slashes, charge dust, landings) come
//     from the sim's state changes; shots, blasts, blinks and wards arrive as events
//     (entities/EnemyLayer.js);
//   - whether its attacks hit the local player is decided here, against the enemy as this player
//     sees it (so a dodge you saw land, landed);
//   - hits on it are taken here (blocks and wards shown and applied) and reported to the sim.
// Rigs: bipeds use the humanoid Animator, the wild's many-legged animals the LegAnimator, sentries
// and psions the HoverAnimator — each fed from the same attack phase.
import * as THREE from 'three';
import { Character, wrapAngle } from './Character.js';
import { performSweep } from '../combat/Damage.js';
import { statusTint } from '../combat/Status.js';
import { ENEMY_TYPES, liveAttack, SUPPORT_KINDS, RANGED_KINDS } from '../sim/enemyDefs.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { MODELS, bindAny } from '../models/Creatures.js';
import { applyComic } from '../render/Toon.js';
import { Animator, makeAnimState } from '../anim/Animator.js';
import { LegAnimator, makeLegState, HoverAnimator, makeHoverState } from '../anim/LegAnimator.js';
import { AFFIXES, RALLY } from '../sim/affixes.js';

export { ENEMY_TYPES };

const TELEGRAPH = new THREE.Color(0xff2a10);
const FRENZY = new THREE.Color(0x5a0a04);
const _fwd = new THREE.Vector3();
const _p = new THREE.Vector3();
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export const RACE_GLOW = { scav: 0xff8a2a, hive: 0xc46aff, synth: 0x3ad8ff, fauna: 0xffb030 };
const WARD = 0x7fd8ff; // a tech's shield bubble

// Biped arm poses: forearm/weapon direction (model-space Euler YXZ) and elbow bend.
const POSE = {
  rest: [0.9, -0.4, 0, 0.5],
  reach: [0.15, -0.15, 0, 0.3],
  gun: [0.55, -0.3, 0, 0.55],
  staff: [0.55, -0.2, 0, 1.0],
  aim: [0, 0, 0, 0.25],
  raised: [-2.3, -0.3, Math.PI / 2, 1.1],
  slam: [1.2, 0, Math.PI / 2, 0.12],
  cutFrom: [0.15, -2.1, 0, 0.7],
  cutTo: [0.4, 1.4, 0, 0.15],
  backFrom: [0.2, 1.5, Math.PI, 0.7],
  backTo: [0.45, -1.9, Math.PI, 0.15],
  stabFrom: [0.35, -0.6, 0, 1.4],
  stabTo: [0.05, 0.05, 0, 0.05],
  throwBack: [-2.5, -0.5, 0, 1.6],
  throwFwd: [-0.4, 0.1, 0, 0.2],
  cast: [-0.45, 0.05, 0, 0.3],
  castHigh: [-2.5, 0, 0, 0.15],
  chargeBack: [1.6, -0.5, 0, 0.4],
  chargeFwd: [0.25, 0.2, 0, 0.2],
};
// Leg-rig poses per attack kind.
const LEG_POSE = { bite: 'bite', combo: 'swipe', swing: 'swipe', charge: 'charge', pounce: 'pounce', bolt: 'spit', stomp: 'rear', howl: 'howl', summon: 'howl' };

// One built model per model key; instances clone it (shared geometry, own materials so hit
// flashes and tints stay per-enemy, own skeleton so each animates).
const TEMPLATES = new Map();
function instantiate(key) {
  let tpl = TEMPLATES.get(key);
  if (!tpl) {
    tpl = MODELS[key]();
    TEMPLATES.set(key, tpl);
  }
  const model = cloneSkinned(tpl.model);
  const materials = [];
  let skeleton = null;
  model.traverse((o) => {
    if (o.isSkinnedMesh) {
      if (!skeleton) skeleton = o.skeleton;
      else if (o.skeleton !== skeleton) o.bind(skeleton, o.bindMatrix);
    }
    if (o.isMesh && !o.material.isShaderMaterial) {
      o.material = o.material.clone();
      if (o.material.isMeshToonMaterial) applyComic(o.material);
      materials.push(o.material);
    }
  });
  const rig = bindAny(model);
  rig.materials = materials;
  rig.skeleton = skeleton;
  if (rig.arrow) rig.arrow.scale.setScalar(1e-4);
  return rig;
}

// Templates take tens of ms to build, so the models of a race whose land is coming up are
// built ahead of time, one per idle slot, instead of all at once when its first camp spawns.
const warmQueue = [];
let warming = false;
const idle = (fn) => (window.requestIdleCallback ? window.requestIdleCallback(fn, { timeout: 400 }) : setTimeout(fn, 16));
export function prewarmRace(race) {
  for (const t of Object.values(ENEMY_TYPES)) {
    if (t.race !== race) continue;
    for (const key of [t.model, ...Object.values(t.variants ?? {}).map((v) => v.model)]) {
      if (key && !TEMPLATES.has(key) && !warmQueue.includes(key)) warmQueue.push(key);
    }
  }
  if (warming || !warmQueue.length) return;
  warming = true;
  const next = () => {
    const key = warmQueue.shift();
    if (key && !TEMPLATES.has(key)) TEMPLATES.set(key, MODELS[key]());
    if (warmQueue.length) idle(next);
    else warming = false;
  };
  idle(next);
}

const WARD_GEO = new THREE.SphereGeometry(1, 20, 14);
const AURA_GEO = new THREE.RingGeometry(0.78, 1, 40).rotateX(-Math.PI / 2);

export class Enemy extends Character {
  // `src`: the EnemySim (offline) or EnemyReplica (online) this view follows; `layer` reports hits.
  constructor(game, src, layer) {
    const type = src.type;
    super(game, { maxHp: src.maxHp, radius: src.radius, faction: 'enemy', mass: type.mass, height: type.height });
    this.src = src;
    this.layer = layer;
    this.id = src.id;
    this.type = type;
    this.typeName = src.typeName;
    this.variant = type.variant;
    this.level = src.level;
    this.elite = src.elite;
    this.champion = !!src.champion;
    this.horde = !!(src.horde ?? src.camp?.horde);
    this.affixes = src.affixes ?? [];
    this.shieldMax = src.shieldMax ?? 0;
    this.shield = this.shieldMax;
    this.rallied = false;
    this.summoned = !!(src.summoner || src.split);
    this.displayName = src.displayName;
    this.isBoss = !!type.boss;
    this.attacks = src.attacks;
    this.camp = src.camp ?? null;
    this.state = src.state;
    this.stateTime = src.stateTime;
    this.cur = null;
    this.hitIndex = 0;
    this.attackSeq = 0;
    this.hitSet = new Set();
    this.engaged = false;
    this.hidden = false;
    this.guarding = false;
    this.ward = null;
    this.wardMesh = null;
    this.frenzy = 0;
    this.lift = 0;
    this.alt = 0;
    this.foe = null;
    this.predicted = 0; // online: seconds a predicted kill / health waits for the server's word

    const scale = type.scale ?? 1;
    this.rig = instantiate(type.model);
    this.model = this.rig.model;
    this.model.scale.setScalar(scale);
    this.root.add(this.model);
    this.rigKind = this.rig.kind;
    if (this.rigKind === 'legs') {
      this.anim = makeLegState();
      this.animator = new LegAnimator(this.rig);
    } else if (this.rigKind === 'hover') {
      this.anim = makeHoverState();
      this.animator = new HoverAnimator(this.rig);
    } else {
      this.anim = makeAnimState();
      this.anim.hunch = type.hunch ?? 0;
      this.anim.armSwing = type.armSwing ?? 0.6;
      this.animator = new Animator(this.rig);
      this.armPose = [...this.restPose()];
      // The shield arm's guard: a frame in front of the chest the off hand holds the shield in.
      if (type.block && this.rig.offMount) {
        const d = this.rig.dims;
        this.guardFrame = new THREE.Object3D();
        this.guardFrame.position.set(d.upper * 0.55, d.upper * 0.35, (d.upper + d.fore) * 0.62);
        this.guardFrame.rotation.set(Math.PI / 2, 0.25, 0);
        this.rig.chest.add(this.guardFrame);
        this.guardGrip = { obj: this.guardFrame, local: new THREE.Vector3() };
      }
    }
    this.groundFn = (x, z) => game.world.groundHeight(x, z);
    this.collectMaterials();
    this.sync();
    this.root.rotation.y = this.facing;
    // A summoned minion arrives in a ring of its race's colour.
    if (this.summoned) game.effects.spawnRing(this.position, 1.6, RACE_GLOW[type.race] ?? 0xffffff);
    // An elite's affixes show as an aura at its feet, in the first one's colour (a champion's wider).
    if (this.affixes.length) {
      this.aura = new THREE.Mesh(AURA_GEO, new THREE.MeshBasicMaterial({
        color: AFFIXES[this.affixes[0]]?.color ?? 0xffd23f, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      this.aura.scale.setScalar(this.radius * (this.champion ? 2.6 : 2));
      this.aura.position.y = 0.06;
      this.root.add(this.aura);
    }
  }

  get behavior() { return this.type.behavior; }

  restPose() {
    return POSE[this.type.stance] ?? POSE.rest;
  }

  // ================================================================ following the sim
  sync() {
    const s = this.src;
    this.position.copy(s.position);
    this.facing = s.facing;
    this.velocity.copy(s.velocity);
    this.knockback.copy(s.knockback);
    this.maxHp = s.maxHp;
    // A predicted hit or kill (online) stands until the server has had time to agree.
    if (this.predicted <= 0) {
      // Hits from other players show as a flash too.
      if (s.hp < this.hp - 0.5 && s.alive) this.flashTimer = Math.max(this.flashTimer, 0.08);
      this.hp = s.hp;
      this.shield = s.shield ?? 0;
      this.alive = s.alive;
    } else if (!s.alive) this.alive = false;
    this.rallied = s.rallied === true || s.rallied > 0;
    this.state = s.state;
    this.stateTime = s.stateTime;
    this.cur = s.cur;
    this.hitIndex = s.hitIndex;
    this.lift = s.lift;
    this.alt = s.alt;
    this.hidden = s.hidden;
    this.guarding = s.guarding;
    this.ward = s.ward;
    this.frenzy = s.frenzy;
    this.engaged = s.engaged;
    this.statuses = s.statuses;
    this.foe = this.layer.playerFor(s.foe);
  }

  update(dt) {
    // Hitstop holds the body where it is; it catches up when the beat ends.
    const held = dt < 0.004;
    const prev = this.state;
    const prevSeq = this.attackSeq;
    const prevHit = this.hitIndex;
    this.predicted -= dt;
    if (!held) this.sync();
    this.attackSeq = this.src.attackSeq;
    if (this.state !== prev || this.attackSeq !== prevSeq || this.hitIndex !== prevHit) this.onTransition(prev, prevSeq !== this.attackSeq, prevHit);
    this.root.rotation.y = this.facing;
    this.grounded = this.lift < 0.05 && !this.src.hover;

    if (this.alive && this.state === 'attack') this.strike(dt);
    this.visuals(dt);
    this.animate(dt);
    this.updateMaterials(dt);
  }

  // The moments of an attack, as the sim's state moves through it.
  onTransition(prev, newAttack, prevHit) {
    const g = this.game;
    const a = this.cur;
    const s = this.state;
    if (s === 'windup' && newAttack && a) {
      if (a.kind === 'stomp' || a.kind === 'nova') {
        g.effects.spawnTelegraph(this.position, a.radius, a.windup, a.kind === 'nova' ? RACE_GLOW.hive : 0xff3a1a);
        g.audio.rumble(this.position, a.windup);
      } else if (a.kind === 'charge') g.audio.roar?.(this.position, this.type.mass);
      else if (a.kind === 'howl' || (a.kind === 'summon' && a.howl)) g.audio.howl?.(this.position, this.isBoss);
      else if (a.kind === 'ward' || a.kind === 'heal' || a.kind === 'summon' || a.kind === 'bolt' || a.kind === 'fan') g.audio.enemyCast?.(this.position, a.proj ?? a.kind, a.windup);
      else if (a.kind === 'lob') g.audio.fuse?.(this.position, a.windup);
    }
    if (s === 'attack' && (prev !== 'attack' || newAttack) && a) {
      this.hitSet.clear();
      if (a.kind === 'swing' || a.kind === 'combo' || a.kind === 'bite' || a.kind === 'bash') g.audio.enemySwing(this);
      else if (a.kind === 'pounce') g.audio.screech?.(this.position);
    }
    if (prev === 'attack' && a) {
      const melee = a.kind === 'swing' || a.kind === 'combo' || a.kind === 'bite' || a.kind === 'bash';
      if (melee && this.rigKind === 'biped' && (s === 'recover' || s === 'windup')) {
        g.effects.spawnSlash(this.position, this.facing, { arc: a.arc, range: a.range, color: 0xff5a3a, height: this.height * 0.4 });
      }
      if (a.kind === 'charge' && s === 'stagger') {
        g.rig.addShake(0.4);
        g.audio.stomp?.(this.position, 1);
      }
      if (a.kind === 'pounce' && s === 'recover') {
        // The landing reaches a little further than the leap.
        this.strikeOnce(liveAttack(a, this.frenzy > 0, this.rallied), 360, this.radius + 1.2);
        g.effects.spawnPuff(this.position, { size: 1.2, life: 0.5 });
        g.audio.stomp?.(this.position, 0.6);
      }
    }
    if (s === 'windup' && prev === 'attack' && this.hitIndex !== prevHit) this.hitSet.clear();
  }

  // Does this attack hit the local player (as this screen sees it)?
  strike(dt) {
    const a = this.cur;
    if (!a) return;
    const L = liveAttack(a, this.frenzy > 0, this.rallied);
    switch (a.kind) {
      case 'swing': case 'combo': case 'bite': case 'bash':
        this.strikeOnce(L, L.arc, L.range);
        break;
      case 'charge':
        this.strikeOnce(L, 110, this.radius + 0.9);
        if (this.stateTime > 0.05 && Math.random() < dt * 20) this.game.effects.spawnPuff(this.position, { size: 0.6 * this.type.mass, life: 0.5 });
        break;
      case 'pounce':
        this.strikeOnce(L, 360, this.radius + 0.3);
        break;
    }
  }

  strikeOnce(L, arc, range) {
    const p = this.game.player;
    if (!p.alive || this.hitSet.has(p) || this.game.state === 'title') return;
    performSweep(this.game, this, { ...L, arc, range }, [p], this.hitSet);
  }

  visuals(dt) {
    // Rising out of the ground, sinking away when dead, hovering, crouched in hiding.
    if (this.state === 'spawn') {
      const k = Math.min(this.stateTime / 0.6, 1);
      this.model.position.y = -2 * (1 - k) * (1 - k);
    } else this.model.position.y = this.lift - (this.hidden ? 0.15 : 0);
    if (this.state === 'dead') {
      const k = Math.min(this.stateTime / 1.3, 1);
      const shrink = Math.max(0, (k - 0.6) / 0.4);
      this.model.scale.setScalar((this.type.scale ?? 1) * Math.max(0.001, 1 - shrink * shrink));
    }
    if (this.rig.arrow) this.rig.arrow.scale.setScalar(this.state === 'windup' && this.alive ? 1 : 1e-4);
    // Tints: statuses, frenzy, elite gold — and the red telegraph while winding up an attack.
    statusTint(this, this.tint, this.stateTime);
    if (this.tint.r + this.tint.g + this.tint.b < 0.05) {
      if (this.frenzy > 0) this.tint.copy(FRENZY);
      else if (this.elite) this.tint.setRGB(0.22, 0.16, 0.02);
      else if (this.rallied) this.tint.setRGB(0.1, 0.075, 0);
    }
    if (this.aura) {
      this.aura.visible = this.alive && this.state !== 'spawn';
      this.aura.material.opacity = 0.45 + 0.2 * Math.sin(this.stateTime * 3 + this.id);
      this.aura.position.y = 0.15 - (this.src.hover ? this.alt : 0); // on the ground under floaters too
    }
    if (this.state === 'windup' && this.cur && !SUPPORT_KINDS.has(this.cur.kind)) {
      const T = this.hitIndex > 0 ? this.cur.windup * 0.45 : this.cur.windup;
      const k = this.stateTime / T;
      this.tint.copy(TELEGRAPH).multiplyScalar(0.15 + 0.55 * k * (0.6 + 0.4 * Math.sin(this.stateTime * 40)));
    }
    if (this.ward || this.shield > 0 || this.wardMesh) this.updateWard();
    void dt;
  }

  // Where shots leave the body (for effects; the sim fires from its own estimate): the tip of the
  // weapon (staff, cannon) as drawn, or the type's muzzle point.
  muzzle(out) {
    const r = this.rig;
    this.forward(_fwd);
    if (this.rigKind === 'hover') return r.body.getWorldPosition(out).addScaledVector(_fwd, 0.45);
    if (this.rigKind === 'legs') return (r.head ?? r.body).getWorldPosition(out).addScaledVector(_fwd, 0.25);
    const m = this.type.muzzle;
    if (m?.tip) return r.weaponMount.localToWorld(out.set(0, 0, m.tip));
    return out.copy(this.position).addScaledVector(_fwd, m?.f ?? 0.6).setY(this.position.y + this.height * (m?.y ?? 0.72));
  }

  // ================================================================ damage
  canBeHit() {
    return this.alive;
  }

  // A hit from the local player: the guard and ward this screen shows are applied here, then it's
  // reported to the sim (which owns health, kills and rewards).
  takeHit(hit) {
    if (!this.alive) return false;
    // A guard blocks most of a frontal hit (melee and shots); explosions and flanks get through.
    if (this.guarding && this.type.block && hit.source !== 'status' && hit.source !== 'explosion') {
      const fx = Math.sin(this.facing);
      const fz = Math.cos(this.facing);
      if (-(hit.direction.x * fx + hit.direction.z * fz) > 0.35) {
        hit.damage = Math.max(1, Math.round(hit.damage * (1 - this.type.block)));
        hit.poise *= 0.4;
        hit.knockback *= 0.35;
        hit.blocked = true;
        _p.copy(this.position).addScaledVector(this.forward(_fwd), this.radius + 0.1).setY(this.position.y + this.height * 0.55);
        this.game.effects.spawnSparks(_p, 0xfff6d0, 10);
        this.game.audio.block?.(_p);
      }
    }
    if (this.ward && hit.source !== 'status') hit.damage = Math.max(1, Math.round(hit.damage * (1 - this.ward.reduce)));
    if (this.rallied && hit.source !== 'status') hit.damage = Math.max(1, Math.round(hit.damage * RALLY.taken));
    if (hit.source !== 'status') this.flashTimer = 0.1;
    this.layer.reportHit(this, hit);
    return true;
  }

  // Elemental statuses go to the sim (shock's chain is resolved by the caller, here).
  applyStatus(element, potency) {
    if (element === 'shock') this.statuses = { ...this.statuses, shocked: { time: 0.25 } };
    this.layer.reportStatus(this, element, potency);
  }

  // The bubble of a tech's ward, or of a Shielded elite's shield.
  updateWard() {
    const up = this.ward || this.shield > 0;
    if (up && !this.wardMesh) {
      const mat = new THREE.MeshBasicMaterial({ color: WARD, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending });
      this.wardMesh = new THREE.Mesh(WARD_GEO, mat);
      this.root.add(this.wardMesh);
    }
    const m = this.wardMesh;
    if (!up || !this.alive) {
      m.visible = false;
      return;
    }
    m.visible = true;
    const r = Math.max(this.radius * 1.5, this.height * 0.62);
    m.scale.set(r, this.height * 0.65, r);
    m.position.y = this.height * 0.5;
    const left = this.ward ? this.ward.time ?? 2 : 2;
    m.material.opacity = 0.16 + 0.06 * Math.sin(this.stateTime * 6) + (left < 1 ? -0.1 * (1 - left) : 0);
  }

  // Materials and the skeleton (bone texture) are per-instance; geometry belongs to the template.
  dispose() {
    this.gone = true;
    for (const m of this.rig.materials) m.dispose();
    this.rig.materials.length = 0;
    this.rig.skeleton?.dispose();
    this.wardMesh?.material.dispose();
    this.aura?.material.dispose();
  }

  // ================================================================ animation
  phaseInfo() {
    const a = this.cur;
    if (!a) return ['none', 0];
    if (this.state === 'windup') return ['windup', clamp(this.stateTime / (this.hitIndex > 0 ? a.windup * 0.45 : a.windup), 0, 1)];
    if (this.state === 'attack') return ['active', clamp(this.stateTime / Math.max(0.05, a.active), 0, 1)];
    if (this.state === 'recover') return ['recover', clamp(this.stateTime / Math.max(0.05, a.recover), 0, 1)];
    return ['none', 0];
  }

  animate(dt) {
    const me = this.game.player;
    // Far-off enemies (fogged out) skip the full solve most frames.
    const far = this.position.distanceToSquared(me.position) > 90 * 90;
    if (far && (this.skip = ((this.skip ?? 0) + 1) % 6) !== 0) return;
    const step = far ? dt * 6 : dt;
    const p = this.foe ?? me;
    if (this.rigKind === 'legs') this.animateLegs(step, p);
    else if (this.rigKind === 'hover') this.animateHover(step, p);
    else this.animateBiped(step, p);
  }

  lookAngles(s, p) {
    s.lookYaw = this.engaged && p.alive ? clamp(wrapAngle(this.angleTo(p.position) - this.facing), -1, 1) : 0;
    const dy = p.position.y + p.height * 0.5 - (this.position.y + this.height * 0.6);
    s.lookPitch = this.engaged ? clamp(Math.atan2(dy, Math.max(1, this.position.distanceTo(p.position))), -0.6, 0.6) : 0;
  }

  animateLegs(dt, p) {
    const s = this.anim;
    s.facing = this.facing;
    s.vx = this.velocity.x + this.knockback.x;
    s.vz = this.velocity.z + this.knockback.z;
    s.grounded = this.lift < 0.05;
    s.ground = this.state === 'spawn' ? null : this.groundFn;
    s.flinch = Math.max(this.flashTimer / 0.1, 0);
    s.mode = this.state === 'dead' ? 'dead' : this.state === 'stagger' ? 'stagger' : 'ground';
    const [phase, t] = this.phaseInfo();
    const a = this.cur;
    s.pose = a && phase !== 'none' ? (a.kind === 'stomp' && !a.rear ? 'swipe' : LEG_POSE[a.kind] ?? 'bite') : 'idle';
    s.phase = phase;
    s.t = t;
    s.crouch = this.hidden ? 0.7 : 0;
    this.lookAngles(s, p);
    this.animator.update(dt, s);
  }

  animateHover(dt, p) {
    const s = this.anim;
    s.facing = this.facing;
    s.vx = this.velocity.x + this.knockback.x;
    s.vz = this.velocity.z + this.knockback.z;
    s.flinch = Math.max(this.flashTimer / 0.1, 0);
    s.mode = this.state === 'dead' ? 'dead' : this.state === 'stagger' ? 'stagger' : 'ground';
    const [phase, t] = this.phaseInfo();
    s.pose = this.cur && (this.cur.kind === 'burst' || this.behavior === 'flyer') ? 'fire' : 'cast';
    s.phase = phase;
    s.t = t;
    this.lookAngles(s, p);
    this.animator.update(dt, s);
  }

  animateBiped(dt, p) {
    const s = this.anim;
    s.facing = this.facing;
    s.vx = this.velocity.x + this.knockback.x;
    s.vz = this.velocity.z + this.knockback.z;
    s.vy = 0;
    s.grounded = this.lift < 0.05;
    s.sprint = this.state === 'attack' && this.cur?.kind === 'charge';
    s.ground = this.state === 'spawn' ? null : this.groundFn;
    s.flinch = Math.max(this.flashTimer / 0.1, 0) * 0.7;
    s.mode = this.state === 'dead' ? 'dead' : this.state === 'stagger' ? 'stagger' : 'ground';
    s.t = this.state === 'dead' ? Math.min(1, this.stateTime / 0.7) : 0;
    this.lookAngles(s, p);
    s.strike = 0;
    s.twist = 0;
    s.crouch = 0;
    s.offGrip = null;
    s.offPose = this.type.offPose ?? null;

    const [phase, t] = this.phaseInfo();
    const a = this.cur;
    let P = this.restPose();
    let k = 1 - Math.exp(-12 * dt);
    if (this.type.stance === 'gun' && a && RANGED_KINDS.has(a.kind)) {
      // A gun arm comes up to aim through the windup and holds through the recoil.
      if (phase === 'windup' || phase === 'active' || (phase === 'recover' && t < 0.4)) {
        P = POSE.aim;
        k = 1 - Math.exp(-14 * dt);
        s.strike = phase === 'active' ? 0.5 : 0;
      }
    } else if (a && phase !== 'none') {
      const kind = a.kind;
      const overhead = a.overhead || this.type.mass >= 2.4;
      if (kind === 'swing' || kind === 'combo') {
        const back = kind === 'combo' && this.hitIndex % 2 === 1;
        const from = overhead && kind === 'swing' ? POSE.raised : back ? POSE.backFrom : POSE.cutFrom;
        const to = overhead && kind === 'swing' ? POSE.slam : back ? POSE.backTo : POSE.cutTo;
        if (phase === 'windup') { P = from; k = 1 - Math.exp(-(this.hitIndex ? 14 : 7) * dt); s.twist = back ? 0.4 : -0.45; s.crouch = overhead ? 0.25 * t : 0; }
        else if (phase === 'active') { P = to; k = Math.min(1, t * 1.2); s.strike = 1; s.twist = back ? -0.3 : 0.35; s.crouch = overhead ? 0.35 : 0.1; }
        else if (t < 0.4) P = to;
      } else if (kind === 'bash') {
        if (a.stab) {
          if (phase === 'windup') { P = POSE.stabFrom; s.twist = -0.3; }
          else if (phase === 'active') { P = POSE.stabTo; k = Math.min(1, t * 2); s.strike = 1; s.twist = 0.2; }
        } else if (phase !== 'recover') { s.strike = phase === 'active' ? 1 : 0.4; s.twist = phase === 'active' ? -0.1 : -0.35; }
      } else if (kind === 'lob') {
        if (phase === 'windup') { P = POSE.throwBack; s.twist = -0.5; k = 1 - Math.exp(-8 * dt); }
        else { P = POSE.throwFwd; k = 1 - Math.exp(-25 * dt); s.twist = 0.3; s.strike = phase === 'recover' ? 1 - t : 0; }
      } else if (kind === 'stomp' || kind === 'nova') {
        if (phase === 'windup') { P = kind === 'nova' ? POSE.castHigh : POSE.raised; s.crouch = 0.15; s.offPose = 'cast'; k = 1 - Math.exp(-6 * dt); }
        else { P = POSE.slam; k = 1 - Math.exp(-30 * dt); s.crouch = phase === 'recover' ? 0.5 * (1 - t) : 0.5; s.strike = 0.6; }
      } else if (kind === 'charge') {
        if (phase === 'windup') { P = POSE.chargeBack; s.crouch = 0.4 * t; s.strike = 0.6; }
        else if (phase === 'active') { P = POSE.chargeFwd; s.strike = 1; }
      } else {
        // Casting: staff (or empty hand) forward, the off hand raised palm-out.
        P = kind === 'summon' || kind === 'ward' || kind === 'heal' ? POSE.castHigh : POSE.cast;
        if (phase !== 'recover' || t < 0.5) s.offPose = 'cast';
      }
    }
    // Shield up while guarding.
    if (this.guardGrip && (this.guarding || (a?.kind === 'bash' && !a.stab && phase !== 'none' && phase !== 'recover')) && this.alive && this.state !== 'stagger') {
      this.guardFrame.position.z = (this.rig.dims.upper + this.rig.dims.fore) * (a?.kind === 'bash' && phase === 'active' ? 0.82 : 0.62);
      s.offGrip = this.guardGrip;
    }
    for (let i = 0; i < 3; i++) this.armPose[i] += (P[i] - this.armPose[i]) * k;
    this.armPose[3] += (P[3] - this.armPose[3]) * k;
    s.pose[0] = this.armPose[0];
    s.pose[1] = this.armPose[1];
    s.pose[2] = this.armPose[2];
    s.elbow = this.armPose[3];
    s.snap = true;
    this.animator.update(dt, s);
  }
}
