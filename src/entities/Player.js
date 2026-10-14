// The player: movement-shooter traversal (jump, double jump, sprint, slide, dash, air dash,
// clamber, ground slam) and a combat layer that switches on the equipped weapon's class.
//   melee  — buffered combo chains (auto-facing nearby foes) + whirlwind on RMB
//   ranged — fires at the reticle; hold RMB to aim down sights; R reloads; spread blooms per shot
//   magic  — casts at the reticle; hold LMB to charge a stronger cast; RMB aims
import * as THREE from 'three';
import { Character, MAX_SLOPE, wrapAngle } from './Character.js';
import { MELEE_COMBOS, WHIRLWIND, DODGE, resolveMeleeAttack } from '../combat/attacks.js';
import { performSweep, dealDamage } from '../combat/Damage.js';
import { updateStatuses } from '../combat/Status.js';
import { armorReduction, tierOf } from '../rpg/balance.js';
import { AbilityKit } from './AbilityKit.js';
import { Inventory } from '../items/Inventory.js';
import { buildWeaponModel, animateWeapon } from '../items/WeaponModel.js';
import { WEAPON_TYPES } from '../items/weaponTypes.js';
import { ELEMENTS } from '../items/elements.js';
import { MANUFACTURERS } from '../items/manufacturers.js';
import { buildHumanoid, HERO_LOOK } from '../models/Characters.js';
import { disposeObject } from '../render/Toon.js';
import { Animator, makeAnimState } from '../anim/Animator.js';
import { CapeCloth } from '../anim/Cloth.js';
import { WEIGHT, CARRY, SPRINT_CARRY, GUN_HOLD, sampleSwing, sampleSpin, toHold } from '../anim/WeaponMotion.js';

// Free arm poses (one-handed guns and casters, and mantles/slams): forearm direction in
// model space (Euler YXZ) plus elbow bend. Melee and two-handed guns use weapon-centric holds
// (anim/WeaponMotion.js) instead.
const REST = { melee: [1.0, -0.35, 0], ranged: [0.5, -0.35, 0], magic: [0.55, -0.3, 0] };
const REST_ELBOW = { melee: 0.45, ranged: 1.3, magic: 0.7 };
const RELOAD = [0.9, 0.35, 0.35];
const MANTLE_POSE = [-1.6, 0, 0];
export const HELD_GUN_SCALE = 0.85;
const EYE_HEIGHT = 1.92; // standing, models/Human.js
const BASE_FOV = 55;
const ARCANE = 0xc9a6ff;
const CHARGE_TIME = 0.7;
// Out of the fight (unhurt this many seconds), health comes back at this share of max a second.
const CALM_REGEN = { after: 5, rate: 0.08 };

// Traversal tuning.
export const MOVE = {
  walk: 6.5, sprint: 10.5, gravity: 30, jump: 10.5, doubleJump: 9.5, airControl: 3.5,
  slideStart: 11, slideGravity: 20, slideFriction: 0.45, slideMinSpeed: 2.5, slideMaxSpeed: 32,
  bulletJump: { speed: 17, lift: 3, boost: 2.5 }, glide: { sink: 0.5, sinkGrow: 1.3, catch: 9, maxTime: 1.8 }, shiftTap: 0.18,
  maxCarry: 36, airTurn: 2.6, airDrag: 0.04, airBrake: 9, groundBleed: 2.2,
  airDash: 15, airDashTime: 0.22, stepUp: 0.5,
  reachGround: 2.3, reachAir: 2.0, mantleTime: 0.34, coyote: 0.12,
  slamSpeed: 34, slamMinHeight: 1.4,
  cost: { doubleJump: 14, airDash: 18 },
};
const RAISED = [-2.3, -0.15, Math.PI / 2];
// Slide attack: a quick whirl with no wind-up (timings for sampleSpin).
const SLIDE_SPIN = { windup: 0.0, active: 0.26, duration: 0.4 };

const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _sightDir = new THREE.Vector3();
const _sightPoint = new THREE.Vector3();
const _origin = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _u = new THREE.Vector3();
const _v = new THREE.Vector3();
const _pose = [0, 0, 0];
const UP = new THREE.Vector3(0, 1, 0);

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const _grip = { obj: null, local: new THREE.Vector3() };
const _hold = { at: new THREE.Vector3(), rot: [0, 0, 0], twist: 0, lean: 0 };
const _rest = { at: new THREE.Vector3(), rot: [0, 0, 0], twist: 0, lean: 0 };
const _butt = { back: 0, up: 0 };
const _eA = new THREE.Euler();
const _qA = new THREE.Quaternion();
const _qB = new THREE.Quaternion();

export class Player extends Character {
  constructor(game) {
    super(game, { maxHp: game.stats.maxHp, radius: 0.45, faction: 'player', height: 2.0 });
    this.speed = 6.5;
    this.maxStamina = 100;
    this.stamina = 100;
    this.staminaDelay = 0;
    this.maxMana = game.stats.maxMana;
    this.mana = this.maxMana;
    this.manaDelay = 0;

    this.state = 'move';
    this.stateTime = 0;
    this.attack = null;
    this.comboIndex = 0;
    this.hitSet = new Set();
    this.trailSpawned = false;
    this.buffer = null;
    this.bufferTime = 0;

    this.moveIntent = new THREE.Vector3();
    this.fireHeld = false;
    this.adsHeld = false;
    this.fireCooldown = 0;
    this.reloadTimer = 0;
    this.aimTimer = 0;
    this.recoil = 0;
    this.bloom = 0;
    this.charge = 0;
    this.swapTimer = 0;
    this.invulnTimer = 0;
    this.inCutscene = false;

    this.dodgeDir = new THREE.Vector3();
    this.vy = 0;
    this.grounded = true;
    this.coyote = 0;
    this.jumpsLeft = 1;
    this.airDashUsed = false;
    this.jumpQueued = 0;
    this.sprintHeld = false;
    this.sprinting = false;
    this.sprintBlock = 0;
    this.airPeak = 0;
    this.mantle = null;
    this.slideDir = new THREE.Vector3();
    this.slideSpeed = 0;
    this.fovKick = 0;
    this.dustTimer = 0;
    this.crouchHeld = false;
    this.shiftWasDown = false;
    this.shiftDownAt = 0;
    this.glideTime = 0;
    this.bulletJumpT = 0;
    this.slideAttack = null;
    this.quickReturn = null;
    this.combo = 0;
    this.comboTimer = 0;
    this.heavyBonus = 1;
    this.walkPhase = 0;
    this.deathFall = 0;
    this.time = 0;
    this.abilities = new AbilityKit(game, this, { gravity: MOVE.gravity });

    this.wardTimer = 0;
    this.secondWindTimer = 0;
    this.phoenixUsed = false;
    this.inventory = new Inventory(3);
    this.weaponModel = null;
    this.muzzle = new THREE.Object3D();
    this.look = null; // appearance colours (models/heroLooks.js); null = the default hero
    this.rig = buildHumanoid(HERO_LOOK);
    this.model = this.rig.model;
    this.root.add(this.model);
    this.anim = makeAnimState();
    this.animator = new Animator(this.rig);
    this.cloth = null;
    this.flipT = 0;
    this.stepOffset = 0;
    this.jumpHeld = false;
    this.jumpCut = false;
    this.gliding = false;
    this.attackFacing = null;
    this.groundFn = (x, z) => this.game.world.supportHeight(x, z, this.position.y + 0.6);
    this.supportFn = (x, z, maxY) => this.game.world.supportHeight(x, z, maxY);
    this.resolveFn = (pos, radius, stepUp, height) => this.game.world.resolve(pos, radius, stepUp, height);
    this.collectMaterials();
  }

  get weapon() { return this.inventory.current; }
  get weaponClass() { return this.weapon?.cls ?? 'melee'; }
  get damageMultiplier() {
    return this.game.stats.damageMult(this.weaponClass) * (this.weaponClass === 'melee' ? this.comboMult : 1) * (1 + this.abilities.damageBonus);
  }
  get critBonus() { return this.game.stats.critBonus; }
  get critDamage() { return this.game.stats.critDamage; }
  get level() { return this.game.stats.level; }
  // The Threat setting (rpg/balance.js: TIERS): what enemies do to us, and shrug off of us.
  get threat() { return tierOf(this.game.char?.tier ?? this.game.settings.threat); }
  elementDamage(element) { return this.game.stats.elementDamage(element); }
  get isAiming() { return this.alive && this.weaponClass !== 'melee' && (this.adsHeld || this.aimTimer > 0); }
  get cameraMode() {
    if (!this.alive) return 'melee';
    if (this.weaponClass === 'melee') return this.state === 'dodge' ? 'melee' : 'aim';
    return this.adsHeld && this.state !== 'dodge' ? 'ads' : 'aim';
  }

  get adsFov() {
    const fov = (this.weapon && WEAPON_TYPES[this.weapon.type].adsFov) ?? 40;
    // A scope magnifies more than open sights.
    return this.weapon?.parts?.sight === 'sight_scope' ? Math.min(fov, 26) : fov;
  }

  // Current cone half-angle (radians) for ranged weapons, used by both firing and the reticle.
  // Spread lives in screen space: the reticle keeps its size when you zoom in, so the narrower
  // aim-down-sights field of view is what tightens the actual cone.
  get spread() {
    const w = this.weapon;
    if (!w || w.cls !== 'ranged') return 0.01;
    const moving = Math.hypot(this.velocity.x, this.velocity.z) > 1 ? 1.25 : 1;
    const zoom = Math.min(1, Math.tan((this.game.camera.fov * Math.PI) / 360) / Math.tan((BASE_FOV * Math.PI) / 360));
    return (w.stats.spread + this.bloom) * moving * zoom;
  }

  // ---------- inventory ----------
  get perks() { return this.game.stats.perks; }
  // Vertical component of the aim direction (other players' comes over the network).
  get aimY() { return this.game.aim.dir.y; }

  // Rebuilds the body with equipped armour, re-attaches the weapon, and refreshes gear stats.
  refreshAppearance() {
    this.game.stats.setGear(Object.values(this.inventory.armor));
    this.rebuildModel();
  }

  rebuildModel() {
    if (this.weaponModel) {
      this.rig.weaponMount.remove(this.weaponModel);
      disposeObject(this.weaponModel);
      this.weaponModel = null;
    }
    this.root.remove(this.model);
    disposeObject(this.model);
    this.rig = buildHumanoid(this.look ?? HERO_LOOK, this.inventory.armor);
    this.model = this.rig.model;
    this.root.add(this.model);
    const phase = this.animator?.phase ?? 0;
    this.animator = new Animator(this.rig);
    this.animator.phase = phase;
    this.cloth = this.rig.capeBones ? new CapeCloth(this.rig) : null;
    this.weaponModel = null;
    this.refreshWeaponModel();
  }

  // First person draws the body shadow-only (no colour, no depth): it still casts its shadow but
  // never gets in front of the camera at its eyes; the viewmodel draws the hands and weapon.
  setFirstPerson(on) {
    this.firstPerson = on;
    const applied = on ? this.model : null;
    if (this.fpBody === applied) return;
    this.fpBody = applied;
    this.model.traverse((o) => {
      if (!o.isMesh || this.weaponModel?.getObjectById(o.id)) return;
      if (o.material.isShaderMaterial || o.material.side === THREE.BackSide) { o.visible = !on; return; } // outlines (shared)
      o.material.colorWrite = !on;
      o.material.depthWrite = !on;
    });
  }

  // The first-person eye: straight above the body, at eye height scaled by how high the hips are
  // carried — so crouches, slides, landings and mantles lower it smoothly (the animator's springs),
  // while the head's own motion (gait bob, flips, corkscrews, lunges, leans) never throws the view
  // about. The camera rig nudges it forward and smooths it further.
  eyePosition(out) {
    const d = this.rig.dims;
    const k = clamp((this.animator.hipsBase ?? d.hipY) / d.hipY, 0.35, 1.08);
    return out.copy(this.position).setY(this.position.y + EYE_HEIGHT * k * this.rig.model.scale.y);
  }

  refreshWeaponModel() {
    if (this.weaponModel) {
      this.rig.weaponMount.remove(this.weaponModel);
      disposeObject(this.weaponModel);
    }
    this.weaponModel = this.weapon && this.weapon.kind !== 'armor' ? buildWeaponModel(this.weapon) : null;
    if (this.weaponModel && this.weapon.cls === 'ranged') this.weaponModel.scale.setScalar(HELD_GUN_SCALE);
    if (this.weaponModel) {
      this.rig.weaponMount.add(this.weaponModel);
      this.weaponModel.add(this.muzzle);
      this.muzzle.position.copy(this.weaponModel.userData.muzzle ?? new THREE.Vector3(0, 0, 1));
    }
    this.collectMaterials();
  }

  equip(index) {
    if (index === this.inventory.active || !this.inventory.slots[index]) return;
    if (!this.game.charLink.do({ op: 'select', i: index })) return;
    this.refreshWeaponModel();
    if (this.reloadTimer > 0) this.game.audio.stopReload();
    this.game.audio.draw(this.weapon);
    this.swapTimer = 0.25;
    this.reloadTimer = 0;
    this.charge = 0;
    if (this.state === 'attack') this.setState('move');
  }

  // ---------- input ----------
  readInput(input, rig) {
    rig.forward(_fwd);
    rig.right(_right);
    let x = (input.down('KeyD', 'ArrowRight') ? 1 : 0) - (input.down('KeyA', 'ArrowLeft') ? 1 : 0);
    let z = (input.down('KeyW', 'ArrowUp') ? 1 : 0) - (input.down('KeyS', 'ArrowDown') ? 1 : 0);
    // The touch stick, when it's in use, steers instead (an analog direction).
    const stick = input.stick;
    if (stick && !x && !z) { x = stick.x; z = stick.z; }
    this.moveIntent.set(0, 0, 0).addScaledVector(_fwd, z).addScaledVector(_right, x);
    if (this.moveIntent.lengthSq() > 1) this.moveIntent.normalize();
    this.cameraYaw = Math.atan2(_fwd.x, _fwd.z);

    // Leaving quick melee: firing or aiming snaps back to the previous weapon.
    if (this.quickReturn && (input.wasPressed('Mouse0', 'KeyJ') || input.down('Mouse2', 'KeyK'))) this.endQuickMelee();
    this.fireHeld = input.down('Mouse0', 'KeyJ');
    const ranged = this.weaponClass !== 'melee';
    this.altHeld = input.down('Mouse2', 'KeyK');
    this.adsHeld = ranged && this.altHeld;
    if (input.wasPressed('Mouse0', 'KeyJ')) this.queue('light');
    if (!ranged && input.wasPressed('Mouse2', 'KeyK') && this.grounded) this.queue('heavy');
    // Shift: hold to sprint, tap to dash (an air dash in the air).
    const shiftDown = input.down('ShiftLeft', 'ShiftRight');
    const now = performance.now() / 1000;
    if (shiftDown && !this.shiftWasDown) this.shiftDownAt = now;
    if (!shiftDown && this.shiftWasDown && now - this.shiftDownAt < MOVE.shiftTap) this.queue('dodge');
    this.shiftWasDown = shiftDown;
    // Touch: pushing the stick out past its ring sprints (a tap there never dashes).
    this.sprintHeld = shiftDown || !!stick?.sprint;
    this.crouchHeld = input.down('KeyC');
    if (input.wasPressed('Space')) this.jumpQueued = 0.15;
    this.jumpHeld = input.down('Space');
    if (input.wasPressed('Mouse3', 'Mouse4')) this.queue('dodge');
    if (input.wasPressed('KeyR')) this.queue('reload');
    if (input.wasPressed('KeyQ')) this.quickMelee();
    for (let i = 0; i < this.inventory.slots.length; i++) {
      if (input.wasPressed(`Digit${i + 1}`)) { this.quickReturn = null; this.equip(i); }
    }
    this.abilities.readInput(input);
  }

  queue(action) {
    this.buffer = action;
    this.bufferTime = 0.3;
  }

  setState(s) {
    this.state = s;
    this.stateTime = 0;
  }

  // ---------- update ----------
  update(dt) {
    this.time += dt;
    this.maxHp = this.game.stats.maxHp;
    this.maxMana = this.game.stats.maxMana;
    this.hp = Math.min(this.hp, this.maxHp);
    if (this.weaponModel) animateWeapon(this.weaponModel, this.time);

    if (!this.alive) {
      this.velocity.multiplyScalar(Math.exp(-8 * dt));
      this.integrate(dt);
      this.animate(dt);
      this.updateMaterials(dt);
      return;
    }
    if (this.noclip) { this.updateNoclip(dt); return; }
    this.stateTime += dt;
    this.bufferTime -= dt;
    if (this.bufferTime <= 0) this.buffer = null;
    this.invulnTimer -= dt;
    this.wardTimer -= dt;
    this.secondWindTimer -= dt;
    this.fireCooldown -= dt;
    this.aimTimer -= dt;
    this.swapTimer -= dt;
    this.jumpQueued -= dt;
    this.flinch = Math.max(0, (this.flinch ?? 0) - dt);
    this.bulletJumpT = Math.max(0, this.bulletJumpT - dt);
    if (this.flipT > 0) this.flipT = this.flipT + dt / 0.5 >= 1 ? 0 : this.flipT + dt / 0.5;
    // Variable jump height: letting go of Space early cuts the rise short.
    if (this.jumpCut && !this.jumpHeld && this.vy > 2 && !this.grounded) { this.vy *= 0.55; this.jumpCut = false; }
    this.comboTimer -= dt;
    if (this.comboTimer <= 0) this.combo = 0;
    if (this.quickReturn) {
      if (this.state === 'attack' || this.slideAttack || this.buffer === 'light') this.quickReturn.timer = 1.8;
      else if ((this.quickReturn.timer -= dt) <= 0) this.endQuickMelee();
    }
    this.sprintBlock -= dt;
    this.recoil = Math.max(0, this.recoil - dt * 6);
    const w = this.weapon;
    if (w?.cls === 'ranged') this.bloom = Math.max(0, this.bloom - dt * (w.stats.spread * 3 + 0.02));
    this.regen(dt);
    this.updateReload(dt);
    updateStatuses(this, dt, this.game);
    this.abilities.update(dt);

    // (A leap flies its arc and a grapple is pulled along its line: neither steers.)
    switch (this.state) {
      case 'move': this.updateMove(dt); break;
      case 'attack': this.updateAttack(dt); break;
      case 'dodge': this.updateDodge(); break;
      case 'slide': this.updateSlide(dt); break;
      case 'airdash': this.updateAirDash(); break;
      case 'slam': this.velocity.multiplyScalar(Math.exp(-4 * dt)); break;
      case 'mantle': break;
      case 'hurt':
        this.velocity.multiplyScalar(Math.exp(-10 * dt));
        if (this.stateTime > 0.3) this.setState('move');
        break;
    }
    this.integrate(dt);
    const planar = Math.hypot(this.velocity.x, this.velocity.z);
    const kick = Math.min(18, Math.max(0, planar - 7) * 0.65) + (this.bulletJumpT > 0 ? 5 : 0) + (this.state === 'airdash' ? 4 : 0) + (this.state === 'dodge' ? 2 : 0);
    this.fovKick += (kick - this.fovKick) * (1 - Math.exp(-6 * dt));
    this.animate(dt);
    this.tint.setRGB(0, 0, 0);
    if (this.charge > 0) this.tint.setRGB(0.25, 0.18, 0.4).multiplyScalar(Math.min(1, this.charge / CHARGE_TIME));
    this.updateMaterials(dt);
  }

  // Stamina and mana come back steadily; health only after a while without being hurt.
  regen(dt) {
    this.staminaDelay -= dt;
    this.calm = (this.calm ?? 0) + dt;
    if (this.alive && this.calm > CALM_REGEN.after && this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + this.maxHp * CALM_REGEN.rate * dt);
    const s = this.game.stats;
    if (this.staminaDelay <= 0 && this.state !== 'dodge') this.stamina = Math.min(this.maxStamina, this.stamina + 30 * (1 + s.staminaRegen) * dt);
    this.manaDelay -= dt;
    if (this.manaDelay <= 0) this.mana = Math.min(this.maxMana, this.mana + (12 + this.maxMana * 0.08) * (1 + s.manaRegen) * dt);
  }

  updateReload(dt) {
    if (this.reloadTimer <= 0) return;
    this.reloadTimer -= dt;
    if (this.reloadTimer <= 0 && this.weapon?.cls === 'ranged') this.weapon.ammo = this.weapon.stats.magSize;
  }

  updateMove(dt) {
    const world = this.game.world;
    const wading = world.isWater(this.position.x, this.position.z);
    const wantsSprint = this.sprintHeld && this.moveIntent.lengthSq() > 0.1 && !this.adsHeld && this.charge <= 0 && !wading;
    if (this.fireHeld && this.weaponClass !== 'melee') this.sprintBlock = 0.4;
    this.sprinting = wantsSprint && this.sprintBlock <= 0;
    if (this.sprinting) this.aimTimer = 0;
    const slow = this.adsHeld ? 0.5 : (this.aimTimer > 0 || this.charge > 0) ? 0.72 : 1;
    const base = this.sprinting ? MOVE.sprint : MOVE.walk;
    const speed = base * slow * this.speedMultiplier() * (1 + this.game.stats.moveSpeed + this.abilities.moveBonus) * (wading ? 0.6 : 1);
    _dir.copy(this.moveIntent).multiplyScalar(speed);
    if (this.grounded) this.steerGround(_dir, speed, dt);
    else this.steerAir(_dir, speed, dt);
    // First person: the body always faces where you look.
    if (this.firstPerson || ((this.isAiming || this.charge > 0) && !this.sprinting)) this.turnSmooth(this.cameraYaw ?? this.facing, 22, dt);
    else if (this.moveIntent.lengthSq() > 0.01) this.turnSmooth(Math.atan2(this.moveIntent.x, this.moveIntent.z), 14, dt);

    if (this.jumpQueued > 0) { this.tryJump(); if (this.state !== 'move') return; }
    if (this.crouchHeld && this.grounded && Math.hypot(this.velocity.x, this.velocity.z) > 3) { this.startSlide(); return; }
    if (!this.grounded && this.vy < 4 && this.moveIntent.lengthSq() > 0.2 && this.tryMantle(MOVE.reachAir)) return;
    if (this.buffer === 'dodge') { this.dodgeAction(); return; }
    if (this.wantsSlam()) { this.startSlam(); return; }
    const w = this.weapon;
    if (!w || this.swapTimer > 0) return;
    if (w.cls === 'melee') this.handleMelee();
    else if (w.cls === 'ranged') this.handleRanged();
    else this.handleMagic(dt);
  }

  // ---------- melee ----------
  // Ground slam: attack in the air while looking steeply down from a height.
  wantsSlam() {
    return this.buffer === 'light' && !this.grounded && this.weaponClass === 'melee'
      && this.game.aim.dir.y < -0.55 && this.heightAboveGround() > MOVE.slamMinHeight;
  }

  handleMelee() {
    if (this.buffer === 'light') this.startAttack(0);
    else if (this.buffer === 'heavy' && this.stamina >= WHIRLWIND.staminaCost) this.startAttack(-1);
  }

  comboChain() { return MELEE_COMBOS[WEAPON_TYPES[this.weapon.type].combo]; }

  startAttack(index) {
    const def = index < 0 ? WHIRLWIND : this.comboChain()[index];
    this.attack = resolveMeleeAttack(def, this.weapon, this.abilities.rate);
    if (index < 0) {
      // Heavy attacks cash in the combo counter for one big hit.
      this.heavyBonus = 1 + Math.min(2, this.combo * 0.05);
      this.attack.damage *= this.heavyBonus;
      if (this.combo > 0) this.game.hud.toast(`Combo spent ×${this.heavyBonus.toFixed(1)}`);
      this.combo = 0;
    }
    this.comboIndex = index;
    this.attackSeq = (this.attackSeq ?? 0) + 1; // lets other players' screens tell swings apart
    this.buffer = null;
    this.setState('attack');
    this.hitSet.clear();
    this.trailSpawned = false;
    this.shockDone = false;
    this.game.audio.playerSwing(this.attack, this.weapon);
    this.swingFrom = { at: this.animator.placeAt.clone(), rot: this.animator.poseIn('chest'), twist: this.anim.twist, lean: 0 };
    if (def.staminaCost) {
      this.stamina -= def.staminaCost;
      this.staminaDelay = 0.8;
    }
    // Swings go where you're heading (first person: where you look), bending toward a nearby foe —
    // only one close to the view line in first person, so the camera isn't wrenched round.
    let face = this.firstPerson ? this.cameraYaw ?? this.facing
      : this.moveIntent.lengthSq() > 0.01 ? Math.atan2(this.moveIntent.x, this.moveIntent.z) : this.facing;
    const target = this.game.findSoftTarget(this.position, face, 5, this.firstPerson ? 0.35 : Math.PI * 0.6);
    if (target) face = this.angleTo(target.position);
    this.attackFacing = face;
  }

  // Swings never take the controls away: you keep steering (and sprinting) while the swing's
  // lunge is layered on top, and any traversal move can cut in at any point.
  updateAttack(dt) {
    const a = this.attack;
    const t = this.stateTime;
    const strikeEnd = a.windup + a.active;
    if (this.attackFacing !== null) this.turnSmooth(this.attackFacing, 40, dt);
    this.forward(_fwd);
    this.sprinting = this.sprintHeld && this.moveIntent.lengthSq() > 0.1;
    const speed = (this.sprinting ? MOVE.sprint : MOVE.walk) * (a.spin ? 0.9 : 0.82)
      * this.speedMultiplier() * (1 + this.game.stats.moveSpeed + this.abilities.moveBonus);
    _dir.copy(this.moveIntent).multiplyScalar(speed);
    // The lunge is a step into the strike: it starts late in the wind-up and peaks as the weapon
    // comes through, so the body's weight drives the swing.
    const lk = (t - a.windup * 0.5) / (strikeEnd - a.windup * 0.5);
    if (lk > 0 && lk < 1) _dir.addScaledVector(_fwd, a.lunge * 0.85 * Math.sin(Math.PI * lk));
    if (this.grounded) this.steerGround(_dir, speed, dt);
    else this.steerAir(_dir, speed, dt);

    if (this.jumpQueued > 0) {
      this.tryJump();
      if (this.state !== 'attack') return;
    }
    if (this.buffer === 'dodge') { this.dodgeAction(); return; }
    if (this.crouchHeld && this.grounded && Math.hypot(this.velocity.x, this.velocity.z) > 3) { this.setState('move'); this.startSlide(); return; }
    if (this.wantsSlam()) { this.setState('move'); this.startSlam(); return; }

    if (t >= a.windup && t - dt <= strikeEnd) {
      if (!this.trailSpawned) {
        this.trailSpawned = true;
        const w = this.weapon;
        const shownWeapon = this.game.firstPerson && this.game.viewModel?.model ? this.game.viewModel.model : this.weaponModel;
        this.game.effects.spawnWeaponTrail(shownWeapon, this.facing, {
          direction: a.swing?.path === 'slashL' ? -1 : 1,
          color: w.element !== 'none' ? ELEMENTS[w.element].color : MANUFACTURERS[w.manufacturer].palette.energy,
        });
      }
      performSweep(this.game, this, a, this.game.enemies, this.hitSet, this.weapon);
      if (a.shockwave && !this.shockDone) {
        this.shockDone = true;
        const w = this.weapon;
        this.forward(_fwd);
        const at = this.position.clone().addScaledVector(_fwd, a.range * 0.7);
        const color = w.element !== 'none' ? ELEMENTS[w.element].color : 0xffe2a0;
        this.game.explode(at, a.shockwave.radius, a.damage * a.shockwave.damage, this, w, { color, knockback: a.knockback });
      }
    }

    if (t >= a.cancelAt && this.buffer) {
      if (this.buffer === 'light') return this.startAttack(this.comboIndex < 0 ? 0 : (this.comboIndex + 1) % this.comboChain().length);
      if (this.buffer === 'heavy' && this.comboIndex >= 0 && this.stamina >= WHIRLWIND.staminaCost) return this.startAttack(-1);
    }
    if (t >= a.duration) this.setState('move');
  }

  // ---------- aiming ----------
  // Direction from the weapon's muzzle to the reticle's world point, jittered within `cone`.
  // Aiming down a sight in first person, the point is where the sight line lands instead (the dot
  // or front post), which recoil and sway can carry off the screen centre.
  aimDirection(cone, out) {
    this.muzzle.getWorldPosition(_origin);
    const g = this.game;
    const aim = g.aim;
    let point = aim.point;
    let dir = aim.dir;
    if (g.firstPerson && g.viewModel?.sighted && g.viewModel.sightDirection(_sightDir)) {
      aim.cast(g, g.camera.position, _sightDir, _sightPoint);
      point = _sightPoint;
      dir = _sightDir;
    }
    out.subVectors(point, _origin);
    // Converge on the aim point. Only if that point is behind/at the muzzle fall back to the ray.
    if (out.length() < 0.4 || out.dot(dir) <= 0) out.copy(dir);
    out.normalize();
    if (cone > 0) {
      _u.crossVectors(out, UP).normalize();
      _v.crossVectors(_u, out).normalize();
      const r = Math.sqrt(Math.random()) * cone;
      const a = Math.random() * Math.PI * 2;
      out.addScaledVector(_u, Math.cos(a) * r).addScaledVector(_v, Math.sin(a) * r).normalize();
    }
    return out;
  }

  faceAim() {
    this.facing = this.cameraYaw ?? this.facing;
    this.aimTimer = 0.7;
    this.recoil = 1;
    this.root.rotation.y = this.facing;
    this.root.updateMatrixWorld(true);
  }

  // ---------- ranged ----------
  handleRanged() {
    const w = this.weapon;
    const s = w.stats;
    if (this.buffer === 'reload' && w.ammo < s.magSize && this.reloadTimer <= 0) {
      this.buffer = null;
      this.startReload();
      return;
    }
    if (this.reloadTimer > 0) return;
    const wants = WEAPON_TYPES[w.type].auto ? this.fireHeld : this.buffer === 'light';
    if (!wants || this.fireCooldown > 0) return;
    if (w.ammo <= 0) { this.startReload(); return; }
    this.buffer = null;
    this.fireCooldown = 1 / (s.fireRate * this.abilities.rate);
    w.ammo--;
    this.shoot(w);
    if (w.ammo <= 0) this.startReload();
  }

  startReload() {
    this.reloadTimer = this.weapon.stats.reloadTime / this.abilities.rate;
    this.game.audio.reload(this.weapon, this.reloadTimer);
  }

  shoot(w) {
    const s = w.stats;
    this.faceAim();
    const def = WEAPON_TYPES[w.type];
    const kind = def.projectile ?? 'bullet';
    const elemental = w.element !== 'none';
    const color = elemental ? ELEMENTS[w.element].color : MANUFACTURERS[w.manufacturer].palette.energy;
    const cone = this.spread;
    this.shotCount = (this.shotCount ?? 0) + 1;
    this.game.audio.shot(w);
    const bullet = kind === 'bullet';
    for (let i = 0; i < s.pellets; i++) {
      this.aimDirection(cone, _dir);
      if (kind === 'quarrel') _dir.y += 0.02; // a little hold-over for the arc
      this.game.projectiles.spawn({
        kind, owner: this, weapon: w, origin: _origin, direction: _dir, color,
        speed: s.projectileSpeed, damage: s.damage, knockback: s.knockback,
        life: kind === 'rocket' ? 4 : bullet ? 320 / s.projectileSpeed : 2.5,
        gravity: kind === 'rocket' ? 0 : bullet || kind === 'quarrel' ? 9.8 : def.gravity ?? 0,
        pierce: s.pierce ?? 0, aoe: s.aoe ?? 0,
        // Tracer rounds: every third shot (every shotgun volley's first pellet) burns brighter.
        tracerColor: elemental ? color : undefined,
        bright: bullet && (s.pellets > 1 ? i === 0 : this.shotCount % 3 === 0),
        tracerScale: w.type === 'sniper' ? 1.6 : s.pellets > 1 ? 0.7 : 1,
        accel: kind === 'rocket' ? 90 : 0, maxSpeed: kind === 'rocket' ? 85 : 0,
      });
    }
    this.bloom = Math.min(s.spread * 1.2 + 0.004, this.bloom + s.spread * 0.25 + 0.001);
    // Flash and brass come off whichever copy of the gun is on show (the first-person one too).
    const gun = this.muzzle.parent ?? this.weaponModel;
    gun.getWorldDirection(_v);
    this.game.effects.spawnMuzzle(_origin, color, bullet ? _v : null, w.type === 'shotgun' || w.type === 'sniper' ? 1.4 : w.type === 'pistol' ? 0.8 : 1);
    if (bullet) {
      // Casing out of the right-hand ejection port.
      const port = gun.localToWorld(_u.set(-0.08, 0.1, 0.05));
      _v.set(-1, 0.6, -0.2).transformDirection(gun.matrixWorld).multiplyScalar(3 + Math.random());
      _v.add(this.velocity);
      this.game.effects.spawnCasing(port, _v);
    }
    const RECOIL = { pistol: 0.022, rifle: 0.012, smg: 0.009, shotgun: 0.05, sniper: 0.07, launcher: 0.05, crossbow: 0.025 };
    const k = (RECOIL[w.type] ?? 0.015) * (this.adsHeld ? 0.7 : 1);
    this.game.rig.kick(k, (Math.random() - 0.5) * k * 0.6);
    this.game.rig.addShake(w.type === 'shotgun' || w.type === 'launcher' ? 0.12 : 0.02);
  }

  // ---------- magic ----------
  handleMagic(dt) {
    const w = this.weapon;
    const s = w.stats;
    if (this.fireHeld && this.fireCooldown <= 0) {
      this.charge += dt;
      return;
    }
    if (this.charge <= 0) return;
    const charged = this.charge >= CHARGE_TIME;
    this.charge = 0;
    this.buffer = null;
    const cost = s.manaCost * (charged ? 3 : 1) * (1 - this.game.stats.manaDiscount);
    if (this.mana < cost) {
      this.game.hud.toast('Not enough mana');
      return;
    }
    this.mana -= cost;
    this.manaDelay = 0.6;
    this.fireCooldown = (1 / (s.castRate * this.abilities.rate)) * (charged ? 1.4 : 1);
    this.cast(w, charged);
  }

  get chargeFraction() { return Math.min(1, this.charge / CHARGE_TIME); }

  cast(w, charged) {
    const s = w.stats;
    const spell = WEAPON_TYPES[w.type].spell;
    const color = w.element !== 'none' ? ELEMENTS[w.element].color : ARCANE;
    const power = charged ? 2.5 : 1;
    this.faceAim();
    this.game.audio.cast(w, charged);

    if (spell === 'chain') {
      this.castChain(w, power, color);
      return;
    }
    if (spell === 'seeker') {
      const n = Math.round(s.missiles * (charged ? 2 : 1));
      for (let i = 0; i < n; i++) {
        this.aimDirection(0.35, _dir);
        _dir.y += 0.25;
        this.game.projectiles.spawn({
          kind: 'bolt', owner: this, weapon: w, origin: _origin, direction: _dir,
          speed: s.projectileSpeed, damage: s.damage * (charged ? 1.3 : 1), knockback: s.knockback, color,
          size: 0.6, life: 3, homing: { target: this.game.aim.target, turn: 5 },
        });
      }
      this.game.effects.spawnMuzzle(_origin, color);
      return;
    }
    if (spell === 'nova') {
      // Codex: a rune burns onto the ground where you aim and detonates a moment later; charged
      // casts ripple a cascade of runes out along the aim line.
      this.muzzle.getWorldPosition(_origin);
      const target = this.runeTarget(34);
      if (charged) {
        const start = this.position.clone().addScaledVector(this.forward(_fwd), 4);
        for (let i = 0; i < 5; i++) {
          const pt = start.clone().lerp(target, i / 4);
          pt.y = this.game.world.supportHeight(pt.x, pt.z, pt.y + 2);
          this.game.runeStrike(pt, s.radius * 0.72, s.damage * 1.1, w, color, 0.28 + i * 0.09, s.knockback);
        }
      } else this.game.runeStrike(target, s.radius, s.damage * 1.3, w, color, 0.35, s.knockback);
      this.game.effects.spawnMuzzle(_origin, color);
      return;
    }
    this.aimDirection(0, _dir);
    this.game.projectiles.spawn({
      kind: spell === 'orb' ? 'orb' : 'bolt', owner: this, weapon: w, origin: _origin, direction: _dir,
      speed: s.projectileSpeed, damage: s.damage * power, knockback: s.knockback, color,
      size: charged ? 1.7 : 1, life: 2.2,
      aoe: spell === 'orb' ? s.radius * (charged ? 1.4 : 1) : charged ? 2 : 0,
    });
    this.game.effects.spawnMuzzle(_origin, color);
  }

  // Ground point under the reticle (clamped to `range`), for placed spells.
  runeTarget(range) {
    const aim = this.game.aim;
    const cam = this.game.camera.position;
    const pt = aim.distance > range ? cam.clone().addScaledVector(aim.dir, range) : aim.point.clone();
    if (pt.distanceTo(this.position) > range) pt.sub(this.position).setLength(range).add(this.position);
    pt.y = this.game.world.supportHeight(pt.x, pt.z, pt.y + 1.5);
    return pt;
  }

  // Instant arc that jumps from the reticle target to nearby foes, losing 20% per jump.
  castChain(w, power, color) {
    const s = w.stats;
    const g = this.game;
    this.muzzle.getWorldPosition(_origin);
    let target = g.aim.target && g.aim.distance <= s.chainRange ? g.aim.target : null;
    if (!target) {
      // Chain magic seeks: lock onto the foe closest to the aim ray (within ~2m of it).
      const cam = g.camera.position;
      let best = 2;
      for (const e of g.enemies) {
        if (!e.alive || e.position.distanceTo(this.position) > s.chainRange) continue;
        _v.set(e.position.x, e.position.y + e.height * 0.5, e.position.z).sub(cam);
        const along = _v.dot(g.aim.dir);
        if (along <= 0) continue;
        const off = Math.sqrt(Math.max(0, _v.lengthSq() - along * along));
        if (off < best) { best = off; target = e; }
      }
    }
    if (!target) {
      g.effects.spawnBolt(_origin, g.aim.point.clone().sub(_origin).clampLength(0, 6).add(_origin), color);
      return;
    }
    const hit = new Set();
    let from = _origin.clone();
    let dmg = s.damage * power;
    for (let i = 0; i <= s.chains && target; i++) {
      hit.add(target);
      const to = target.position.clone();
      to.y += target.height * 0.55;
      g.effects.spawnBolt(from, to, color);
      dealDamage(g, {
        attacker: this, target, base: dmg, weapon: w, source: 'projectile',
        direction: to.clone().sub(from).setY(0).normalize(), knockback: s.knockback, poise: dmg * 0.5,
      });
      from = to;
      dmg *= 0.8;
      let next = null;
      let best = 7;
      for (const e of g.enemies) {
        if (!e.alive || hit.has(e)) continue;
        const d = e.position.distanceTo(target.position);
        if (d < best) { best = d; next = e; }
      }
      target = next;
    }
  }

  // ---------- traversal ----------
  // Dash on foot, air-dash when airborne — from any state that allows input.
  dodgeAction() {
    if (this.state === 'attack') this.setState('move');
    if (!this.grounded) this.tryAirDash();
    else this.tryDodge();
  }

  // Ground steering. Surplus momentum (slides, dashes, bullet-jump landings) bleeds off gently;
  // otherwise heading and speed are steered separately, so turns carve arcs at speed (snappy at a
  // jog), speed ramps up into a sprint, and a hard reversal plants and pivots.
  steerGround(target, speed, dt) {
    const vx = this.velocity.x;
    const vz = this.velocity.z;
    const cur = Math.hypot(vx, vz);
    if (cur > speed + 0.5) {
      const k = 1 - Math.exp(-MOVE.groundBleed * dt);
      this.velocity.x += (target.x - vx) * k;
      this.velocity.z += (target.z - vz) * k;
      return;
    }
    const want = Math.hypot(target.x, target.z);
    let heading = cur > 0.25 ? Math.atan2(vx, vz) : Math.atan2(target.x, target.z);
    let next;
    if (want > 0.01) {
      const goal = Math.atan2(target.x, target.z);
      const diff = wrapAngle(goal - heading);
      if (Math.abs(diff) > 2.4 && cur > 2) {
        next = Math.max(0, cur - 70 * dt);
      } else {
        const turn = lerp(20, 8, clamp(cur / MOVE.sprint, 0, 1)) * dt;
        heading += clamp(diff, -turn, turn);
        const accel = cur < MOVE.walk ? 45 : 20;
        next = cur < want ? Math.min(want, cur + accel * dt) : Math.max(want, cur - 40 * dt);
      }
      if (cur <= 0.25) heading = goal;
    } else {
      next = Math.max(0, cur - 42 * dt);
    }
    this.velocity.x = Math.sin(heading) * next;
    this.velocity.z = Math.cos(heading) * next;
  }

  // Air steering: input redirects carried momentum (bullet jumps, slide hops, dashes, glides)
  // without braking it — only pulling hard against it slows you. Below jogging pace it's normal
  // air control toward the input.
  steerAir(target, speed, dt) {
    const vx = this.velocity.x;
    const vz = this.velocity.z;
    const cur = Math.hypot(vx, vz);
    const want = Math.hypot(target.x, target.z);
    if (cur <= speed + 0.25) {
      const k = Math.min(1, MOVE.airControl * dt);
      if (want > 0.01 || cur < speed) {
        this.velocity.x += (target.x - vx) * k;
        this.velocity.z += (target.z - vz) * k;
      }
      return;
    }
    let next = cur * Math.exp(-MOVE.airDrag * dt);
    let heading = Math.atan2(vx, vz);
    if (want > 0.01) {
      const diff = wrapAngle(Math.atan2(target.x, target.z) - heading);
      if (Math.abs(diff) > 2.4) next = Math.max(speed, next - MOVE.airBrake * dt);
      else heading += clamp(diff, -MOVE.airTurn * dt, MOVE.airTurn * dt);
    }
    this.velocity.x = Math.sin(heading) * next;
    this.velocity.z = Math.cos(heading) * next;
  }

  // Eased turn toward an angle: fast when far, settling softly (no robotic constant-rate spin).
  turnSmooth(angle, rate, dt) {
    const d = wrapAngle(angle - this.facing);
    const step = clamp(d * (1 - Math.exp(-rate * dt)), -rate * 1.4 * dt, rate * 1.4 * dt);
    this.facing = wrapAngle(this.facing + step);
  }

  heightAboveGround() {
    return this.position.y - this.game.world.supportHeight(this.position.x, this.position.z, this.position.y + 0.1);
  }

  tryJump() {
    this.jumpQueued = 0;
    if (this.grounded || this.coyote > 0) {
      // Only vault on a jump press when the ledge is too tall to simply hop (keeps momentum flowing).
      if (this.tryMantle(MOVE.reachGround, 1.3)) return;
      this.vy = MOVE.jump;
      this.grounded = false;
      this.coyote = 0;
      this.airPeak = this.position.y;
      this.jumpCut = true;
      this.game.audio.jump();
      return;
    }
    if (this.jumpsLeft > 0 && this.stamina >= MOVE.cost.doubleJump) {
      this.jumpsLeft--;
      this.stamina -= MOVE.cost.doubleJump;
      this.staminaDelay = 0.5;
      this.vy = MOVE.doubleJump;
      if (this.moveIntent.lengthSq() > 0.1) {
        const sp = Math.max(Math.hypot(this.velocity.x, this.velocity.z), MOVE.walk);
        this.velocity.x = this.moveIntent.x * sp;
        this.velocity.z = this.moveIntent.z * sp;
      }
      this.flipT = 0.001; // tuck-and-flip, purely animation
      this.jumpCut = false;
      this.game.audio.doubleJump();
    }
  }

  // Clamber onto a ledge in front (terrain step, rock, crate, wall, platform) within `reach` of the feet.
  tryMantle(reach, minRise = 0.6) {
    const p = this.position;
    _dir.copy(this.moveIntent);
    if (_dir.lengthSq() < 0.01) this.forward(_dir);
    _dir.setY(0).normalize();
    const world = this.game.world;
    for (const d of [0.55, 0.95]) {
      const px = p.x + _dir.x * (this.radius + d);
      const pz = p.z + _dir.z * (this.radius + d);
      const top = world.supportHeight(px, pz, p.y + reach);
      const rise = top - p.y;
      if (rise < minRise || rise > reach) continue;
      // Needs headroom above the ledge and something to stand on (not the far side of a thin post).
      if (world.blocks({ x: px, y: top + 1.0, z: pz }) || world.blocks({ x: px, y: top + 1.7, z: pz })) continue;
      const tx = px + _dir.x * 0.2;
      const tz = pz + _dir.z * 0.2;
      if (world.supportHeight(tx, tz, top + 0.3) < top - 0.4) continue;
      this.mantle = { from: p.clone(), to: new THREE.Vector3(tx, top, tz), dur: MOVE.mantleTime + rise * 0.04 };
      this.facing = Math.atan2(_dir.x, _dir.z);
      this.vy = 0;
      this.velocity.set(0, 0, 0);
      this.setState('mantle');
      this.game.audio.mantle();
      return true;
    }
    return false;
  }

  updateMantleMotion() {
    const m = this.mantle;
    const k = Math.min(1, this.stateTime / m.dur);
    const p = this.position;
    // Up, then over — on eased curves that overlap, so the climb is one smooth arc with no change
    // of pace partway (in first person you ride it).
    const ease = (a, b) => { const t = clamp((k - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
    p.y = m.from.y + (m.to.y + 0.05 - m.from.y) * ease(0, 0.6);
    const across = ease(0.22, 1);
    p.x = m.from.x + (m.to.x - m.from.x) * across;
    p.z = m.from.z + (m.to.z - m.from.z) * across;
    if (k >= 1) {
      p.copy(m.to);
      this.grounded = true;
      this.vy = 0;
      this.mantle = null;
      this.forward(_fwd);
      this.velocity.copy(_fwd).multiplyScalar(2);
      this.setState('move');
    }
  }

  // Hold-to-slide: momentum is physical — slopes pull you downhill, friction is low on the flat,
  // and you can steer, shoot, cast or spin-attack without leaving the slide.
  startSlide() {
    const planar = Math.hypot(this.velocity.x, this.velocity.z);
    this.slideDir.set(this.velocity.x, 0, this.velocity.z);
    if (planar < 0.5) this.slideDir.copy(this.moveIntent);
    this.slideDir.setY(0).normalize();
    this.slideSpeed = Math.max(planar * 1.05, MOVE.slideStart);
    this.velocity.copy(this.slideDir).multiplyScalar(this.slideSpeed);
    this.slideAttack = null;
    this.sprinting = false;
    this.setState('slide');
    this.game.audio.slideStart();
  }

  updateSlide(dt) {
    const w = this.game.world;
    const p = this.position;
    let vx = this.velocity.x;
    let vz = this.velocity.z;
    if (this.grounded) {
      const e = 0.8;
      const gx = (w.groundHeight(p.x + e, p.z) - w.groundHeight(p.x - e, p.z)) / (2 * e);
      const gz = (w.groundHeight(p.x, p.z + e) - w.groundHeight(p.x, p.z - e)) / (2 * e);
      vx -= gx * MOVE.slideGravity * dt;
      vz -= gz * MOVE.slideGravity * dt;
      const f = Math.exp(-MOVE.slideFriction * dt);
      vx *= f;
      vz *= f;
    }
    let speed = Math.hypot(vx, vz);
    if (this.moveIntent.lengthSq() > 0.1 && speed > 0.1) {
      const cur = Math.atan2(vx, vz);
      const turn = Math.max(-2.2 * dt, Math.min(2.2 * dt, wrapAngle(Math.atan2(this.moveIntent.x, this.moveIntent.z) - cur)));
      vx = Math.sin(cur + turn) * speed;
      vz = Math.cos(cur + turn) * speed;
    }
    if (speed > MOVE.slideMaxSpeed) {
      vx *= MOVE.slideMaxSpeed / speed;
      vz *= MOVE.slideMaxSpeed / speed;
      speed = MOVE.slideMaxSpeed;
    }
    this.velocity.set(vx, 0, vz);
    this.slideSpeed = speed;
    if (speed > 0.1) this.slideDir.set(vx / speed, 0, vz / speed);
    if (!this.slideAttack && !this.isAiming) this.facing = Math.atan2(this.slideDir.x, this.slideDir.z);
    else if (this.isAiming) this.turnTowards(this.cameraYaw ?? this.facing, 20 * dt);

    this.dustTimer -= dt;
    if (this.grounded && this.dustTimer <= 0) {
      this.dustTimer = Math.max(0.02, 0.09 - speed * 0.003);
      this.game.effects.spawnPuff(p.clone().setY(p.y + 0.15));
    }

    if (this.jumpQueued > 0) return this.grounded || this.coyote > 0 ? this.bulletJump() : this.tryJump();
    if (this.buffer === 'dodge') { this.setState('move'); return this.dodgeAction(); }
    const weapon = this.weapon;
    if (weapon && this.swapTimer <= 0) {
      if (weapon.cls === 'melee') {
        if (this.buffer === 'light' && !this.slideAttack) this.startSlideAttack();
      } else if (weapon.cls === 'ranged') this.handleRanged();
      else this.handleMagic(dt);
    }
    if (this.slideAttack) this.updateSlideAttack(dt);
    if (this.grounded && speed < MOVE.slideMinSpeed && this.stateTime > 0.25) this.setState('move');
    else if (!this.crouchHeld && !this.slideAttack) this.setState('move');
  }

  startSlideAttack() {
    this.buffer = null;
    const st = this.weapon.stats;
    this.swingFrom = { at: this.animator.placeAt.clone(), rot: this.animator.poseIn('chest'), twist: this.anim.twist, lean: 0 };
    this.slideAttack = {
      t: 0, hitSet: new Set(),
      def: { damage: st.damage * 1.3, range: 2.8 * st.range, arc: 360, knockback: 6 * st.knockback, poise: 20, hitstop: 0.04, shake: 0.12 },
    };
    const w = this.weapon;
    const color = w.element !== 'none' ? ELEMENTS[w.element].color : MANUFACTURERS[w.manufacturer].palette.energy;
    const shownWeapon = this.game.firstPerson && this.game.viewModel?.model ? this.game.viewModel.model : this.weaponModel;
    this.game.effects.spawnWeaponTrail(shownWeapon, this.facing, { color });
    this.game.audio.swing({ weapon: w, weight: 0.5, dur: 0.32, spin: true });
  }

  updateSlideAttack(dt) {
    const sa = this.slideAttack;
    sa.t += dt;
    if (sa.t >= 0.05 && sa.t <= 0.3) performSweep(this.game, this, sa.def, this.game.enemies, sa.hitSet, this.weapon);
    if (sa.t >= 0.4) this.slideAttack = null;
  }

  // Bullet jump: launch from a slide along the camera's aim, carrying slide speed into the air.
  bulletJump() {
    this.jumpQueued = 0;
    const L = _v.copy(this.game.aim.dir);
    L.y += 0.45;
    L.normalize().multiplyScalar(MOVE.bulletJump.speed);
    const hl = Math.hypot(L.x, L.z) || 1;
    const carry = Math.min(MOVE.maxCarry, Math.max(hl, this.slideSpeed + MOVE.bulletJump.boost));
    this.velocity.set((L.x / hl) * carry, 0, (L.z / hl) * carry);
    this.vy = L.y + MOVE.bulletJump.lift;
    this.grounded = false;
    this.coyote = 0;
    this.jumpsLeft = 1;
    this.airDashUsed = false;
    this.airPeak = this.position.y;
    this.facing = Math.atan2(L.x, L.z);
    this.flipT = 0;
    this.bulletJumpT = 0.45;
    this.slideAttack = null;
    this.setState('move');
    for (let i = 0; i < 3; i++) this.game.effects.spawnPuff(this.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.1, (Math.random() - 0.5) * 0.6)), { size: 0.45, life: 0.45 });
    this.jumpCut = false;
    this.game.rig.addShake(0.08);
    this.game.audio.bulletJump();
  }

  // ---------- quick melee ----------
  // Q swings your melee weapon from any loadout; firing or aiming snaps straight back.
  quickMelee() {
    if (this.weaponClass === 'melee') { this.queue('light'); return; }
    const idx = this.inventory.slots.findIndex((w) => w?.cls === 'melee');
    if (idx < 0) { this.game.hud.toast('No melee weapon equipped'); return; }
    const back = this.inventory.active;
    this.equip(idx);
    this.swapTimer = 0;
    this.quickReturn = { slot: back, timer: 1.8 };
    this.queue('light');
  }

  endQuickMelee() {
    const r = this.quickReturn;
    this.quickReturn = null;
    if (!r) return;
    if (this.state === 'attack') this.setState('move');
    this.equip(r.slot);
    this.swapTimer = 0.05;
  }

  // ---------- melee combo ----------
  addCombo(n = 1) {
    this.combo += n;
    this.comboTimer = 3;
  }

  get comboMult() {
    const c = this.combo;
    return c >= 50 ? 2 : c >= 30 ? 1.7 : c >= 15 ? 1.4 : c >= 5 ? 1.2 : 1;
  }

  tryAirDash() {
    this.buffer = null;
    if (this.airDashUsed || this.stamina < MOVE.cost.airDash) return;
    this.airDashUsed = true;
    this.stamina -= MOVE.cost.airDash;
    this.staminaDelay = 0.6;
    if (this.moveIntent.lengthSq() > 0.01) this.dodgeDir.copy(this.moveIntent).normalize();
    else this.forward(this.dodgeDir);
    this.facing = Math.atan2(this.dodgeDir.x, this.dodgeDir.z);
    this.dashCarry = Math.hypot(this.velocity.x, this.velocity.z);
    this.dashSpeed = Math.min(MOVE.maxCarry, Math.max(MOVE.airDash, this.dashCarry + 4));
    this.setState('airdash');
    this.game.audio.airDash();
  }

  updateAirDash() {
    this.velocity.copy(this.dodgeDir).multiplyScalar(this.dashSpeed);
    this.vy = 0;
    if (this.stateTime >= MOVE.airDashTime) {
      this.velocity.setLength(Math.max(this.dashSpeed * 0.75, this.dashCarry));
      this.setState('move');
    }
  }

  startSlam() {
    this.buffer = null;
    this.vy = -MOVE.slamSpeed;
    this.velocity.multiplyScalar(0.3);
    this.slamFrom = this.position.y;
    this.setState('slam');
    this.game.audio.slamDive();
  }

  slamImpact() {
    const w = this.weapon;
    const fall = Math.max(0, this.slamFrom - this.position.y);
    const radius = 3.2 + Math.min(2.5, fall * 0.15);
    const color = w && w.element !== 'none' ? ELEMENTS[w.element].color : 0xffe2a0;
    const dmg = (w?.stats.damage ?? 10) * (1.3 + Math.min(1.2, fall * 0.06));
    this.game.explode(this.position.clone(), radius, dmg, this, w, { color, knockback: 12 });
    this.game.rig.addShake(0.6);
    this.game.hitstop(0.08, this);
    this.velocity.multiplyScalar(0.3);
    this.setState('move');
  }

  onLand(fall) {
    this.jumpsLeft = 1;
    this.airDashUsed = false;
    this.glideTime = 0;
    this.bulletJumpT = 0;
    this.flipT = 0;
    this.jumpCut = false;
    this.animator.land(Math.sqrt(2 * MOVE.gravity * Math.max(0, fall)));
    if (this.state === 'slam') { this.slamImpact(); return; }
    if (this.state === 'leap') { this.abilities.leapLand(); return; }
    this.game.audio.land(fall);
    if (fall > 3.5) {
      for (let i = 0; i < 4; i++) this.game.effects.spawnPuff(this.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.2, 0.1, (Math.random() - 0.5) * 1.2)));
      this.game.rig.addShake(Math.min(0.4, fall * 0.04));
    }
  }

  // Full 3D movement: colliders (with step-up), cliff slopes, gravity, standing on platforms.
  integrate(dt) {
    const world = this.game.world;
    const p = this.position;
    if (this.state === 'mantle') {
      this.updateMantleMotion();
      this.root.rotation.y = this.facing;
      return;
    }
    const ox = p.x;
    const oz = p.z;
    const oy = p.y;
    p.x += (this.velocity.x + this.knockback.x) * dt;
    p.z += (this.velocity.z + this.knockback.z) * dt;
    this.knockback.multiplyScalar(Math.exp(-7 * dt));
    world.resolve(p, this.radius, MOVE.stepUp, this.height);
    // Terrain cliffs: walkers can't climb steeper than MAX_SLOPE (jump + clamber instead).
    const gOld = world.groundHeight(ox, oz);
    const gNew = world.groundHeight(p.x, p.z);
    const dist = Math.hypot(p.x - ox, p.z - oz);
    if (dist > 1e-4 && gNew > oy + MOVE.stepUp && (gNew - gOld) / dist > MAX_SLOPE) {
      p.x = ox;
      p.z = oz;
    }

    // Aim glide: aiming in mid-air hangs you in place for a moment.
    const gliding = !this.grounded && this.altHeld && this.glideTime < MOVE.glide.maxTime
      && (this.state === 'move' || this.state === 'slide' || this.state === 'attack') && this.bulletJumpT < 0.3;
    this.gliding = gliding;
    const wasGrounded = this.grounded;
    if (gliding) {
      // Hover, not low gravity: rising or falling, vertical speed is caught and settles onto a slow
      // sink that deepens over the glide; horizontal momentum is untouched.
      this.glideTime += dt;
      const sink = -(MOVE.glide.sink + MOVE.glide.sinkGrow * this.glideTime);
      this.vy += (sink - this.vy) * (1 - Math.exp(-MOVE.glide.catch * dt));
    } else if (this.state !== 'airdash') this.vy -= MOVE.gravity * dt;
    if (this.state === 'slam') this.vy = Math.min(this.vy, -MOVE.slamSpeed);
    p.y += this.vy * dt;
    this.airPeak = Math.max(this.airPeak, p.y);
    const support = world.supportHeight(p.x, p.z, Math.max(p.y, oy) + MOVE.stepUp);
    if (p.y <= support) {
      const wasAir = !this.grounded;
      p.y = support;
      this.vy = 0;
      this.grounded = true;
      this.coyote = MOVE.coyote;
      if (wasAir) this.onLand(this.airPeak - p.y);
      this.airPeak = p.y;
    } else if (this.grounded && this.vy <= 0 && p.y - support < 0.6) {
      p.y = support; // stick to slopes and step down small ledges
      this.vy = 0;
    } else {
      if (this.grounded) this.airPeak = p.y;
      this.grounded = false;
      this.coyote -= dt;
    }
    // Steps up onto crates/ledges (and small drops) snap the collider; the body eases over them.
    const dy = p.y - oy;
    if (wasGrounded && this.grounded && Math.abs(dy) > 0.1 + Math.hypot(p.x - ox, p.z - oz) * 0.6) {
      this.stepOffset = clamp(this.stepOffset - dy, -0.6, 0.6);
    }
    this.stepOffset *= Math.exp(-14 * dt);
    this.root.rotation.y = this.facing;
  }

  // ---------- dodge ----------
  tryDodge() {
    this.buffer = null;
    const cost = DODGE.stamina * (this.perks.has('fleet') ? 0.75 : 1);
    if (this.stamina < cost) return false;
    this.stamina -= cost;
    this.staminaDelay = 0.6;
    this.charge = 0;
    this.dashOn = this.moveIntent.lengthSq() > 0.01;
    if (this.dashOn) this.dodgeDir.copy(this.moveIntent).normalize();
    else this.forward(this.dodgeDir).negate();
    // Free-running, the body turns into the dash; aiming or in first person it keeps facing the
    // view (the animation lunges whichever way it goes).
    if (this.dashOn && !(this.firstPerson || this.isAiming || this.charge > 0)) this.facing = Math.atan2(this.dodgeDir.x, this.dodgeDir.z);
    this.setState('dodge');
    this.game.audio.dash();
    return true;
  }

  // Bursts out at full speed and eases down to the run (or to a stop, backing off) — no dead
  // moment at the end, the move state just carries on from there.
  updateDodge() {
    const k = Math.min(this.stateTime / DODGE.duration, 1);
    const peak = DODGE.speed * (this.perks.has('fleet') ? 1.2 : 1);
    const exit = this.dashOn && this.moveIntent.lengthSq() > 0.01 ? MOVE.sprint : 2;
    this.velocity.copy(this.dodgeDir).multiplyScalar(exit + (peak - exit) * Math.pow(1 - k, 1.6));
    if (k >= 1) this.setState('move');
  }

  // Dev noclip: fly with WASD (camera-relative), Space up, C down, Shift fast; no collision.
  updateNoclip(dt) {
    const speed = this.sprintHeld ? 45 : 15;
    this.position.addScaledVector(this.moveIntent, speed * dt);
    if (this.jumpHeld) this.position.y += speed * dt;
    if (this.crouchHeld) this.position.y -= speed * dt;
    this.velocity.set(0, 0, 0);
    this.vy = 0;
    this.grounded = false;
    if (this.moveIntent.lengthSq() > 0.01) this.turnSmooth(Math.atan2(this.moveIntent.x, this.moveIntent.z), 12, dt);
    this.root.rotation.y = this.facing;
    this.setState('move');
    this.animate(dt);
    this.updateMaterials(dt);
  }

  // ---------- damage ----------
  canBeHit() {
    if (!this.alive || this.invulnTimer > 0 || this.god || this.state === 'leap') return false;
    return !(this.state === 'dodge' && this.stateTime < DODGE.iframes);
  }

  // Armour (measured against the attacker's level) + elemental resistance + Warded.
  damageTakenMultiplier(element, source, attacker) {
    const s = this.game.stats;
    let m = super.damageTakenMultiplier() * (1 - armorReduction(s.armor, attacker?.level ?? s.level)) * (1 - s.resist(element));
    if (attacker?.faction === 'enemy') m *= this.threat.damage;
    m *= 1 - s.damageTaken;
    if (source !== 'status' && this.perks.has('warded') && this.wardTimer <= 0) {
      m *= 0.5;
      this.wardTimer = 8;
    }
    return m;
  }

  takeHit(hit) {
    if (!this.abilities.guard(hit)) return false;
    if (this.perks.has('juggernaut') || this.perks.has('steadfast')) hit = { ...hit, knockback: 0 };
    if (this.perks.has('phoenix') && !this.phoenixUsed && this.canBeHit() && this.hp - hit.damage <= 0) {
      this.phoenixUsed = true;
      const ok = super.takeHit({ ...hit, damage: this.hp - 1 });
      this.hp = this.maxHp * 0.5;
      this.invulnTimer = 1.5;
      this.game.effects.spawnRing(this.position, 4, 0xff9420);
      this.game.hud.banner('Phoenix', 'Risen from the ashes');
      return ok;
    }
    return super.takeHit(hit);
  }

  // Getting hit costs you a charge and plays a flinch, but never takes control away.
  onHit(hit) {
    if (hit.poise <= 0) return;
    this.charge = 0;
    this.invulnTimer = 0.5;
    this.flinch = 0.3;
  }

  onDamaged(hit) {
    this.calm = 0;
    if (hit.source !== 'status') this.game.hud.damageFrom(this.game, hit.attacker && hit.attacker !== this ? hit.attacker.position : null);
    if (this.perks.has('thorns') && hit.source === 'melee' && hit.attacker?.alive && hit.attacker !== this) {
      dealDamage(this.game, {
        attacker: this, target: hit.attacker, base: hit.damage * 0.3, scaled: true, source: 'status',
        direction: hit.attacker.position.clone().sub(this.position).setY(0).normalize(), poise: 0,
      });
    }
    if (this.perks.has('secondWind') && this.alive && this.secondWindTimer <= 0 && this.hp < this.maxHp * 0.3) {
      this.secondWindTimer = 60;
      this.heal(this.maxHp * 0.3);
      this.game.hud.toast('Second Wind!');
    }
  }

  onDeath(hit) {
    const direction = hit?.direction;
    this.deathKick = direction ? [direction.x, direction.y, direction.z] : [0, 0, 0];
    this.setState('dead');
    this.game.onPlayerDeath();
  }

  revive() {
    this.alive = true;
    this.hp = this.maxHp;
    this.mana = this.maxMana;
    this.stamina = this.maxStamina;
    this.deathFall = 0;
    this.deathKick = null;
    this.animator.resetRagdoll();
    this.statuses = {};
    this.knockback.set(0, 0, 0);
    this.velocity.set(0, 0, 0);
    this.vy = 0;
    this.mantle = null;
    this.abilities.clear();
    this.setState('move');
  }

  // ---------- animation ----------
  // Camera aim re-expressed in the chest's frame (last frame's torso pose; the lag is invisible),
  // so gun holds share one space with every other weapon hold and blend without pops.
  aimInChest(out) {
    const r = this.rig;
    const yaw = clamp(wrapAngle((this.cameraYaw ?? this.facing) - this.facing), -1, 1);
    _eA.set(-Math.asin(clamp(this.aimY, -1, 1)), yaw, 0, 'YXZ');
    _qA.setFromEuler(_eA);
    _qB.copy(r.hips.quaternion).multiply(r.spine.quaternion).multiply(r.chest.quaternion).invert().multiply(_qA);
    _eA.setFromQuaternion(_qB, 'YXZ');
    out[0] = _eA.x;
    out[1] = _eA.y;
    out[2] = _eA.z;
    return out;
  }

  carryHold(type) {
    return toHold(CARRY[type] ?? CARRY.sword, _rest);
  }

  animate(dt) {
    const s = this.anim;
    const w = this.weapon;
    const cls = this.weaponClass;
    const st = this.state;
    s.facing = this.facing;
    s.vx = this.velocity.x + this.knockback.x;
    s.vz = this.velocity.z + this.knockback.z;
    s.vy = this.vy;
    s.grounded = this.grounded;
    s.sprint = this.sprinting;
    s.ground = this.groundFn;
    s.supportHeight = this.supportFn;
    s.resolve = this.resolveFn;
    s.flinch = this.flinch > 0 ? this.flinch / 0.3 : 0;
    s.flip = this.flipT;
    s.corkscrew = this.bulletJumpT > 0 && st === 'move' ? 1 - this.bulletJumpT / 0.45 : 0;
    s.glide = this.gliding;
    s.spin = 0;
    s.twist = 0;
    s.strike = 0;
    s.crouch = 0;
    s.stance = 0;
    s.snap = false;
    s.offGrip = null;
    s.offPose = null;
    s.place = null;
    s.handleObj = this.weaponModel?.userData.handle ? this.weaponModel : null;
    s.butt = null;
    s.twistSnap = st === 'attack' || !!this.slideAttack;
    s.placeSpace = 'chest';
    s.placeRate = 14;
    s.poseRate = 16;
    s.recoil = this.recoil;
    s.armSwing = cls === 'melee' ? 1 : 0.25;
    s.deathKick = this.deathKick;
    s.t = 0;
    if (!this.alive) {
      this.deathFall = Math.min(1, this.deathFall + dt * 1.6);
      s.mode = 'dead';
      s.t = this.deathFall;
    } else if (st === 'dodge') {
      s.mode = 'dash';
      s.t = this.stateTime / DODGE.duration;
      // The dash's direction in the body's frame (it may lunge sideways or back).
      const c = Math.cos(this.facing);
      const n = Math.sin(this.facing);
      s.dashX = this.dodgeDir.x * c - this.dodgeDir.z * n;
      s.dashZ = this.dodgeDir.x * n + this.dodgeDir.z * c;
    }
    else if (st === 'slide') s.mode = 'slide';
    else if (st === 'airdash') s.mode = 'airdash';
    else if (st === 'mantle') { s.mode = 'mantle'; s.t = this.mantle ? this.stateTime / this.mantle.dur : 1; }
    else if (st === 'slam') s.mode = 'slam';
    else s.mode = this.grounded ? 'ground' : 'air';

    // ---- weapon: a weapon-centric hold (grip position + direction, chest space) whenever the
    // body is steady; free arm poses for mantles, slams and death.
    const grip = this.weaponModel?.userData.grip2;
    const twoHanded = !!grip && grip.when === 'always';
    // Mid-flip the gun doesn't chase the camera (the arms would wrap round the tumbling body).
    const aiming = this.alive && !!w && (this.isAiming || this.charge > 0) && !(this.flipT > 0 || s.corkscrew > 0);
    const steady = this.alive && st !== 'mantle' && st !== 'slam' && st !== 'airdash';
    let pose = REST[cls];
    let elbow = REST_ELBOW[cls];
    let hold = null;
    if (st === 'mantle') { pose = MANTLE_POSE; elbow = 0.3; }
    else if (st === 'slam') { pose = RAISED; elbow = 0.4; }
    else if (!steady) elbow = 1.4;
    else if (cls === 'melee' || (w?.type === 'staff' && !aiming)) {
      const type = w?.type ?? 'sword';
      const weight = WEIGHT[type] ?? 0.5;
      if (st === 'attack') {
        const a = this.attack;
        if (a.spin) s.spin = sampleSpin(this.stateTime, a, this.swingFrom, this.carryHold(type), weight, _hold);
        else sampleSwing(this.stateTime, a, a.swing.path, this.swingFrom, this.carryHold(type), weight, _hold);
        s.snap = true;
        s.placeRate = 0;
        s.twist = _hold.twist;
        s.strike = _hold.lean;
        s.crouch = _hold.crouch;
        // Feet set wide for the swing (heavier = wider), back to the carry stance as it recovers.
        s.stance = this.stateTime < a.duration * 0.85 ? 0.35 + 0.65 * Math.min(1, weight) : 0;
      } else if (this.slideAttack) {
        s.spin = sampleSpin(this.slideAttack.t, SLIDE_SPIN, this.swingFrom, this.carryHold(type), weight * 0.6, _hold);
        s.snap = true;
        s.placeRate = 0;
        s.twist = _hold.twist;
      } else {
        const sprintHold = this.sprinting && this.grounded ? SPRINT_CARRY[type] : null;
        toHold(sprintHold ?? CARRY[type] ?? CARRY.sword, _hold);
        // Carried weight bobs with the stride and lags behind the body's motion.
        const moving = Math.min(1, Math.hypot(this.velocity.x, this.velocity.z) / 6);
        _hold.at.y += Math.sin(this.animator.phase * Math.PI * 4) * 0.022 * (0.5 + weight) * moving;
        s.placeRate = lerp(20, 6, weight / 1.1);
        s.poseRate = s.placeRate;
      }
      hold = _hold;
      s.armSwing = 0;
    } else if (twoHanded || (w?.type === 'staff' && aiming)) {
      const wm = this.weaponModel;
      const sc = wm?.scale.x ?? 1;
      if (this.reloadTimer > 0 && !wm?.userData.shoulderMount) toHold(GUN_HOLD.reload, _hold);
      else if (wm?.userData.shoulderMount) {
        // Launchers ride on top of the right shoulder, aimed or at rest.
        _hold.at.fromArray(GUN_HOLD.shoulder.pocket);
        if (aiming) this.aimInChest(_hold.rot);
        else { _hold.rot[0] = 0.12; _hold.rot[1] = 0.05; _hold.rot[2] = 0; }
        _butt.back = 0.24;
        _butt.up = 0.27 * sc;
        s.butt = _butt;
        s.placeRate = 18;
      } else if (aiming && w?.type === 'staff') {
        _hold.at.set(-0.22, 0.02, 0.38);
        this.aimInChest(_hold.rot);
        s.placeRate = 22;
      } else if (aiming) {
        // Stock seated in the shoulder pocket (lower, under the arm, for hip fire).
        _hold.at.fromArray(this.adsHeld ? GUN_HOLD.ads.pocket : GUN_HOLD.hip.pocket);
        this.aimInChest(_hold.rot);
        _butt.back = -(wm?.userData.buttZ ?? -0.42) * sc;
        _butt.up = 0.06 * sc;
        s.butt = _butt;
        s.placeRate = 22;
        s.poseRate = 30;
      } else {
        // Low ready: stock still seated, muzzle dipped down and across, sights up.
        const low = this.sprinting ? GUN_HOLD.lowSprint : GUN_HOLD.low;
        _hold.at.fromArray(low.pocket);
        _hold.rot[0] = low.rot[0];
        _hold.rot[1] = low.rot[1];
        _hold.rot[2] = low.rot[2];
        _butt.back = -(wm?.userData.buttZ ?? -0.42) * sc;
        _butt.up = 0.06 * sc;
        s.butt = _butt;
      }
      hold = _hold;
      s.armSwing = 0;
    } else if (this.reloadTimer > 0) { pose = RELOAD; elbow = 1.55; }
    else if (aiming) {
      _pose[0] = -Math.asin(clamp(this.aimY, -1, 1));
      _pose[1] = 0.12;
      _pose[2] = 0;
      pose = _pose;
      elbow = grip ? 0.9 : 0.55;
      s.placeSpace = 'model';
    } else s.placeSpace = 'model';
    if (hold) {
      s.place = hold.at;
      pose = hold.rot;
    } else if (!s.place) s.placeSpace = 'model';
    s.pose[0] = pose[0] - this.recoil * 0.3;
    s.pose[1] = pose[1];
    s.pose[2] = pose[2];
    s.elbow = elbow + this.recoil * 0.25;
    s.wrist = 0;

    // ---- off hand: grips two-handed weapons, works the magazine on reloads, raises to cast.
    const free = steady && !this.slideAttack;
    if (free && grip && (twoHanded || aiming)) {
      _grip.obj = this.weaponModel;
      _grip.handle = !!this.weaponModel.userData.handle;
      _grip.local.copy(grip.local);
      if (this.reloadTimer > 0 && cls === 'ranged') {
        const k = 1 - this.reloadTimer / this.weapon.stats.reloadTime;
        _grip.local.set(0, -0.16 - 0.12 * Math.sin(Math.PI * k), 0.14);
      }
      s.offGrip = _grip;
      // Shouldered long guns blade the torso so the support arm reaches the foregrip.
      if (cls === 'ranged' && st !== 'attack') s.twist = s.butt ? (this.adsHeld ? -0.58 : -0.45) : -0.2;
    } else if (this.charge > 0 && cls === 'magic') s.offPose = 'cast';

    // ---- head and eyes follow the camera; fully when aiming.
    const camYaw = this.cameraYaw ?? this.facing;
    s.lookYaw = clamp(wrapAngle(camYaw - this.facing), -1.2, 1.2) * (aiming ? 1 : 0.5);
    s.aimPitch = aiming ? Math.asin(clamp(this.aimY, -1, 1)) : 0;

    this.model.position.y = this.stepOffset;
    this.animator.update(dt, s);
    this.cloth?.update(dt, Math.hypot(this.velocity.x, this.velocity.z));
  }
}
