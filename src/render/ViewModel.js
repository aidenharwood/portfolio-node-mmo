// First-person weapon view: a copy of the held weapon drawn just in front of the camera (the
// body's own weapon is hidden) with gloved hands and forearms holding it — both hands on
// two-handed weapons and on a gun's foregrip, the free hand up at the lower left otherwise. The
// hands are the body's own jointed fists (models/Human.js), fingers round the handle.
//   holds    per weapon type: daggers point forward, swords and axes up at the right, greatswords
//            and hammers two-handed across the body, spears couched forward, staves upright,
//            guns low at the right and raised so their sight line (WeaponModel userData.sight)
//            sits exactly on the screen centre when aiming; scopes switch to a scope view
//   melee    swings follow the attack's path and timing: an anticipation pull with a little
//            overshoot, an accelerating strike through a mid key (wide swings cross the front of
//            the view), a follow-through past the end, a blade trail in the weapon's energy
//            colour, a camera roll into the swing and a jolt when it connects (the hitstop holds
//            the swing at the point of impact)
//   motion   walk bob, breathing, look sway, jump lift, recoil, reloads, swaps and sprinting
// Shots and spells leave from this copy's muzzle while it's shown.
import * as THREE from 'three';
import { buildWeaponModel, animateWeapon } from '../items/WeaponModel.js';
import { HELD_GUN_SCALE } from '../entities/Player.js';
import { toonMesh, outlineMaterial, INK_SCALE, noInk } from './Toon.js';
import { HERO_LOOK, fist } from '../models/Characters.js';
import { bake } from './ModelKit.js';
import { ELEMENTS } from '../items/elements.js';
import { MANUFACTURERS } from '../items/manufacturers.js';
import { ScopeView } from '../ui/ScopeView.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const ease = (t) => t * t * (3 - 2 * t);
// Ease out with a small overshoot (anticipation settles past the cocked point, then back).
const backOut = (t, s = 1.4) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2);
const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
const dir3 = (x, y, z) => new THREE.Vector3(x, y, z).normalize();

// Camera space: +x right, +y up, -z ahead. `dir` is where the weapon points (blade, barrel).
const REST = {
  dagger: { pos: v3(0.25, -0.25, -0.5), dir: dir3(-0.08, 0.32, -1) },
  sword: { pos: v3(0.3, -0.29, -0.6), dir: dir3(-0.3, 0.62, -0.72) },
  axe: { pos: v3(0.3, -0.3, -0.6), dir: dir3(-0.28, 0.72, -0.6) },
  greatsword: { pos: v3(0.2, -0.33, -0.56), dir: dir3(-0.34, 0.72, -0.6) },
  hammer: { pos: v3(0.22, -0.34, -0.55), dir: dir3(-0.42, 0.62, -0.66) },
  spear: { pos: v3(0.22, -0.27, -0.48), dir: dir3(-0.1, 0.14, -1) },
  staff: { pos: v3(0.3, -0.3, -0.6), dir: dir3(-0.12, 1, -0.35) },
  staffCast: { pos: v3(0.24, -0.3, -0.58), dir: dir3(-0.06, 0.32, -1) },
  gun: { pos: v3(0.21, -0.19, -0.52), dir: dir3(-0.03, 0.012, -1) },
  launcher: { pos: v3(0.33, -0.36, -0.5), dir: dir3(-0.02, 0.02, -1) },
  gunSprint: { pos: v3(0.3, -0.36, -0.5), dir: dir3(-0.55, -0.3, -0.8) },
  gunReload: { pos: v3(0.16, -0.34, -0.5), dir: dir3(-0.35, 0.35, -0.85) },
  caster: { pos: v3(0.26, -0.28, -0.55), dir: dir3(-0.05, 0.08, -1) },
};
// Where the eye sits behind each sight's eye end when aiming (open sights need a little room).
const EYE = { iron: 0.3, holo: 0.32, scope: 0.09 };
const ADS_Z = -0.55;
// Melee swing keys: cocked (end of wind-up) → mid-strike → through (end of the strike). The mid key
// keeps wide swings sweeping across the front of the view rather than round behind the camera.
// `roll` tips the camera into the swing.
const SWING = {
  slashR: { roll: 1, keys: [{ pos: v3(0.55, -0.05, -0.8), dir: dir3(0.55, 0.75, -0.25) }, { pos: v3(0.05, -0.18, -0.9), dir: dir3(0, 0.3, -1) }, { pos: v3(-0.55, -0.45, -0.75), dir: dir3(-0.8, -0.35, -0.5) }] },
  slashL: { roll: -1, keys: [{ pos: v3(-0.5, -0.07, -0.8), dir: dir3(-0.55, 0.75, -0.25) }, { pos: v3(-0.02, -0.2, -0.9), dir: dir3(0, 0.3, -1) }, { pos: v3(0.55, -0.45, -0.75), dir: dir3(0.8, -0.35, -0.5) }] },
  overhead: { roll: 0.3, keys: [{ pos: v3(0.18, 0.12, -0.7), dir: dir3(0.05, 0.85, 0.2) }, { pos: v3(0.1, -0.08, -0.9), dir: dir3(0.02, 0.4, -1) }, { pos: v3(0.05, -0.5, -0.85), dir: dir3(0, -0.6, -0.8) }] },
  stab: { roll: 0, keys: [{ pos: v3(0.32, -0.32, -0.42), dir: dir3(-0.06, 0.1, -1) }, { pos: v3(0.22, -0.26, -0.8), dir: dir3(-0.03, 0.07, -1) }, { pos: v3(0.14, -0.2, -1.1), dir: dir3(0, 0.05, -1) }] },
  stabHigh: { roll: 0, keys: [{ pos: v3(0.3, -0.25, -0.42), dir: dir3(-0.06, 0.06, -1) }, { pos: v3(0.2, -0.2, -0.8), dir: dir3(-0.03, 0.04, -1) }, { pos: v3(0.1, -0.14, -1.15), dir: dir3(0, 0.02, -1) }] },
  sweepLow: { roll: 0.7, keys: [{ pos: v3(0.7, -0.5, -0.6), dir: dir3(0.85, 0.1, -0.4) }, { pos: v3(0, -0.5, -0.9), dir: dir3(0, 0.1, -1) }, { pos: v3(-0.7, -0.5, -0.7), dir: dir3(-0.85, 0.1, -0.4) }] },
  spin: { roll: 1.2, keys: [{ pos: v3(0.7, -0.2, -0.65), dir: dir3(0.95, 0.15, -0.1) }, { pos: v3(0, -0.22, -0.95), dir: dir3(0, 0.12, -1) }, { pos: v3(-0.85, -0.25, -0.65), dir: dir3(-0.95, 0.1, -0.2) }] },
};
const HEAVY = new Set(['greatsword', 'hammer', 'spear']);
// The free hand: low at the left, out of the way; raised palm-forward while casting.
const OFF_HAND = { rest: { pos: v3(-0.34, -0.33, -0.52), dir: dir3(0.25, 0.45, -1) }, cast: { pos: v3(-0.22, -0.2, -0.5), dir: dir3(0.1, 0.9, -0.5) } };

const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();
const _qc = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _elbow = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

// Orientation whose +Z is `dir`. Blades show their flat (local Y) to the camera; guns keep their
// top up.
function orient(dir, upright, out) {
  _z.copy(dir);
  if (upright) {
    _y.set(0, 1, 0).addScaledVector(_z, -_z.y);
    if (_y.lengthSq() < 1e-4) _y.set(0, 0, 1);
    _y.normalize();
    _x.crossVectors(_y, _z);
  } else {
    _y.set(0, 0, 1).addScaledVector(_z, -_z.z);
    if (_y.lengthSq() < 1e-4) _y.set(0, 1, 0).addScaledVector(_z, -_z.y);
    _y.normalize();
    _x.crossVectors(_y, _z);
  }
  return out.setFromRotationMatrix(_m.makeBasis(_x, _y, _z));
}

// Ink outlines are a fixed width in world units, so on things a hand's length from the eye they
// come out several times heavier than on the world — thick enough to swallow a sight's notch.
// Everything drawn here follows the 'view' ink scale (Toon.js INK_SCALE), which thins further
// down the sights; set each frame in update().
const VM_INK = 0.42;
const VM_INK_ADS = 0.15;
const toViewInk = (o) => {
  const ink = o.isMesh && o.material.uniforms?.uThickness;
  if (ink) o.material = outlineMaterial(ink.value, undefined, 'view');
};

// ---------------------------------------------------------------- hands and forearms
const FOREARM_GEO = new THREE.CylinderGeometry(0.03, 0.045, 1, 10, 1).translate(0, 0.5, 0);
const CUFF_GEO = new THREE.CylinderGeometry(0.04, 0.034, 0.075, 10).translate(0, 0.03, 0);
// Hands a touch over life size, as first-person hands usually are. A hand's frame (Human.fist):
// the handle runs along its z, the wrist sits HANDLE above it toward the elbow (+y).
const HAND_K = 1.12;
const HANDLE = 0.065 * 1.38 * HAND_K;
// A gun's pistol grip leans back from the receiver: the fist's thumb side points up it.
const GUN_GRIP_AXIS = new THREE.Vector3(0, 0.95, 0.3).normalize();

function makeArm(side, colors) {
  const fore = new THREE.Group();
  const sleeve = toonMesh(FOREARM_GEO, colors.forearm, { outline: 0.012, castShadow: false, receiveShadow: false });
  const cuff = toonMesh(CUFF_GEO, colors.cuff, { outline: 0.01, castShadow: false, receiveShadow: false });
  fore.add(sleeve, cuff);
  const hand = new THREE.Group();
  const fistOf = (curl) => {
    const g = new THREE.Group();
    fist(g, colors.glove, colors.fingers, side, HAND_K, { curl });
    hand.add(bake(g));
    return g;
  };
  return { fore, sleeve, hand, grip: fistOf(1), open: fistOf(0.35) };
}

// ---------------------------------------------------------------- blade trail
const TRAIL_N = 14;
const TRAIL_LIFE = 0.09;

export class ViewModel {
  constructor(camera) {
    this.root = new THREE.Group();
    this.root.visible = false;
    camera.add(this.root);
    this.weapon = null;
    this.model = null;
    this.pos = new THREE.Vector3();
    this.quat = new THREE.Quaternion();
    this.sway = new THREE.Vector2();
    this.lastYaw = null;
    this.lastPitch = 0;
    this.ads = 0;
    this.sprint = 0;
    this.reload = 0;
    this.lift = 0;
    this.jolt = 0;
    this.roll = 0;
    this.time = 0;
    this.sighted = false;
    this.scoped = false;
    this.arms = null;
    this.armKey = null;
    this.offPos = new THREE.Vector3();
    this.offQuat = new THREE.Quaternion();
    this.scopeView = new ScopeView(document.getElementById('scope'));
    this.buildTrail();
  }

  buildTrail() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_N * 2 * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(TRAIL_N * 2 * 3), 3));
    const idx = [];
    for (let i = 0; i < TRAIL_N - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    geo.setIndex(idx);
    this.trailMesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }));
    this.trailMesh.frustumCulled = false;
    this.trailMesh.renderOrder = 2;
    this.root.add(this.trailMesh);
    this.trail = []; // { base, tip, age }
    this.trailColor = new THREE.Color();
  }

  setWeapon(weapon) {
    if (weapon === this.weapon) return;
    if (this.model) {
      this.root.remove(this.model);
      // (outline materials are shared across everything — never dispose those)
      this.model.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); if (!o.material.isShaderMaterial) o.material.dispose(); } });
    }
    this.weapon = weapon;
    this.trail.length = 0;
    this.sightReticle = null;
    this.model = weapon && weapon.kind !== 'armor' ? buildWeaponModel(weapon) : null;
    if (!this.model) return;
    this.model.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = false;
      o.receiveShadow = false;
      toViewInk(o);
      if (!o.material.isShaderMaterial) noInk(o.material); // its own hull ink, not the world's
    });
    if (weapon.cls === 'ranged') this.model.scale.setScalar(HELD_GUN_SCALE);
    const box = new THREE.Box3().setFromObject(this.model);
    // Without a defined sight line (launchers, crossbows): just over the top of the weapon.
    this.sightY = box.max.y * 0.92;
    this.tipZ = box.max.z;
    const el = weapon.element !== 'none' ? ELEMENTS[weapon.element].color : MANUFACTURERS[weapon.manufacturer]?.palette.energy ?? 0xffffff;
    this.trailColor.set(el);
    this.sightReticle = this.model.getObjectByName('sightReticle');
    this.root.add(this.model);
  }

  // Gloves follow the hands armour (a gauntlet's darker metal when one is worn).
  ensureArms(p) {
    const hands = p.inventory.armor.hands;
    const look = { ...HERO_LOOK, ...p.look };
    const key = `${hands?.uid ?? 'bare'}:${look.skin}`;
    if (this.armKey === key && this.arms) return;
    if (this.arms) for (const a of this.arms) { this.root.remove(a.fore, a.hand); }
    // Bare forearms and fingerless gloves, as the body wears them; a gauntlet's metal when worn.
    const colors = hands
      ? { forearm: 0x5a6070, cuff: 0x8a909c, glove: 0x4a4f5c, fingers: 0x4a4f5c }
      : { forearm: look.skin, cuff: look.gloves ?? look.leather, glove: look.gloves ?? look.leather, fingers: look.skin };
    this.arms = [makeArm(-1, colors), makeArm(1, colors)]; // [right, left]
    for (const a of this.arms) {
      this.root.add(a.fore, a.hand);
      for (const part of [a.fore, a.hand]) {
        part.traverse(toViewInk);
        part.traverse((o) => { if (o.isMesh && !o.material.isShaderMaterial) noInk(o.material); });
      }
    }
    this.armKey = key;
  }

  restPose(p) {
    const w = this.weapon;
    if (w.cls === 'melee') return REST[w.type] ?? REST.sword;
    if (w.type === 'staff') return p.isAiming || p.charge > 0 ? REST.staffCast : REST.staff;
    if (w.cls === 'magic') return REST.caster;
    if (w.type === 'launcher') return REST.launcher;
    return REST.gun;
  }

  // Melee hit landed: a jolt through the weapon.
  onImpact(crit = false) {
    this.jolt = crit ? 1.4 : 1;
  }

  update(dt, p, rig, active) {
    // The shot origin follows whichever copy of the weapon is on show.
    const host = active && this.model ? this.model : p.weaponModel;
    if (host && p.muzzle.parent !== host) {
      host.add(p.muzzle);
      p.muzzle.position.copy(host.userData.muzzle ?? _p.set(0, 0, 1));
    }
    if (p.weaponModel) p.weaponModel.visible = !active;
    if (!active) {
      this.root.visible = false;
      this.lastYaw = null;
      this.sighted = this.scoped = false;
      this.scopeView.hide();
      rig.fpRoll = 0;
      return;
    }
    this.setWeapon(p.weapon);
    this.ensureArms(p);
    this.time += dt;
    const w = this.weapon;
    const k = 1 - Math.exp(-14 * dt);

    // ---- target pose
    let pos = _p;
    let swingT = -1; // 0..1 through the strike while swinging
    let roll = 0;
    if (w) {
      const pose = this.restPose(p);
      pos.copy(pose.pos);
      const upright = w.cls !== 'melee' && w.type !== 'staff';
      orient(pose.dir, upright, _qa);
      if (p.state === 'attack' && p.attack && w.cls === 'melee') {
        const a = p.attack;
        const sw = SWING[a.swing?.path] ?? SWING.slashR;
        const keys = sw.keys;
        const t = p.stateTime;
        const strikeEnd = a.windup + a.active;
        let from;
        let to;
        let u;
        if (t < a.windup) { from = pose; to = keys[0]; u = backOut(t / a.windup); }
        else if (t < strikeEnd) {
          // Accelerating through the strike, split at the mid key.
          const s = (t - a.windup) / a.active;
          swingT = s;
          const k2 = s * s * (2 - s);
          if (k2 < 0.5) { from = keys[0]; to = keys[1]; u = k2 * 2; } else { from = keys[1]; to = keys[2]; u = k2 * 2 - 1; }
          roll = sw.roll * Math.sin(Math.PI * s);
        } else {
          // Follow-through: carry on a little past the end, then settle back to the hold.
          const r = clamp((t - strikeEnd) / Math.max(0.05, a.duration - strikeEnd), 0, 1);
          if (r < 0.3) {
            from = keys[2];
            to = { pos: _a.lerpVectors(keys[1].pos, keys[2].pos, 1.18), dir: _b.lerpVectors(keys[1].dir, keys[2].dir, 1.18).normalize() };
            u = ease(r / 0.3);
          } else {
            from = { pos: _a.lerpVectors(keys[1].pos, keys[2].pos, 1.18), dir: _b.lerpVectors(keys[1].dir, keys[2].dir, 1.18).normalize() };
            to = pose;
            u = ease((r - 0.3) / 0.7);
          }
          if (r < 0.15 && t - strikeEnd < 0.06) swingT = 1;
        }
        pos.lerpVectors(from.pos, to.pos, u);
        orient(from.dir, false, _qa);
        orient(to.dir, false, _qb);
        _qa.slerp(_qb, clamp(u, 0, 1.2));
      } else if (w.cls === 'ranged') {
        this.ads += ((p.cameraMode === 'ads' ? 1 : 0) - this.ads) * (1 - Math.exp(-16 * dt));
        this.sprint += ((p.sprinting ? 1 : 0) - this.sprint) * k;
        this.reload += ((p.reloadTimer > 0 ? 1 : 0) - this.reload) * (1 - Math.exp(-10 * dt));
        if (this.sprint > 0.01) { pos.lerp(REST.gunSprint.pos, this.sprint); orient(REST.gunSprint.dir, true, _qb); _qa.slerp(_qb, this.sprint); }
        if (this.reload > 0.01) { pos.lerp(REST.gunReload.pos, this.reload); orient(REST.gunReload.dir, true, _qb); _qa.slerp(_qb, this.reload); }
        if (this.ads > 0.01) {
          // Aiming: the sight line straight down the screen centre.
          orient(_z.set(0, 0, -1), true, _qb);
          const sg = this.model.userData.sight;
          const S = this.model.scale.x;
          // (aimed, the gun's local +x points to the camera's left, hence +x here for a sight
          // mounted off to the gun's left)
          if (sg) _x.set((sg.x ?? 0) * S, -sg.y * S, -EYE[sg.kind] + sg.z * S);
          else _x.set(0, -this.sightY - 0.006, ADS_Z);
          pos.lerp(_x, this.ads);
          _qa.slerp(_qb, this.ads);
        }
      }
      if (w.cls !== 'melee' && p.recoil > 0) {
        // Recoil: shots and casts kick the weapon back and up — aimed, mostly straight back, so
        // even sustained automatic fire keeps the sight in view (the camera's own kick is the
        // climb you fight).
        const A = this.ads;
        pos.z += (0.07 - 0.035 * A) * p.recoil;
        pos.y += 0.012 * (1 - A) * p.recoil;
        _qb.setFromAxisAngle(_x.set(1, 0, 0), (0.12 - 0.1 * A) * p.recoil);
        _qa.premultiply(_qb);
      }
    } else {
      pos.copy(REST.sword.pos);
      orient(REST.sword.dir, false, _qa);
    }
    if (w?.cls !== 'ranged') this.ads = 0;
    INK_SCALE.view.value = VM_INK + (VM_INK_ADS - VM_INK) * this.ads;

    // ---- motion: walk bob, breathing, look sway, jump lift, impact jolt, weapon swap
    const planar = Math.hypot(p.velocity.x, p.velocity.z);
    const steps = clamp(planar / 8, 0, 1.3) * (p.grounded ? 1 : 0) * (1 - this.ads * 0.85);
    const ph = (p.animator?.phase ?? 0) * Math.PI * 2;
    const bobX = Math.sin(ph) * 0.014 * steps;
    const bobY = -Math.abs(Math.sin(ph)) * 0.02 * steps + Math.sin(this.time * 1.7) * 0.004 * (1 - this.ads);
    pos.x += bobX;
    pos.y += bobY;
    if (this.lastYaw !== null) {
      const dyaw = Math.atan2(Math.sin(rig.yaw - this.lastYaw), Math.cos(rig.yaw - this.lastYaw));
      this.sway.x += (clamp(dyaw * 3, -0.6, 0.6) - this.sway.x) * (1 - Math.exp(-10 * dt));
      this.sway.y += (clamp((rig.pitch - this.lastPitch) * 3, -0.6, 0.6) - this.sway.y) * (1 - Math.exp(-10 * dt));
    }
    this.lastYaw = rig.yaw;
    this.lastPitch = rig.pitch;
    const swayK = 1 - this.ads * 0.8;
    pos.x += this.sway.x * 0.05 * swayK;
    pos.y -= this.sway.y * 0.04 * swayK;
    this.lift += (clamp(-(p.vy ?? 0) * 0.006, -0.05, 0.05) - this.lift) * k;
    pos.y += this.lift;
    if (this.jolt > 0) {
      pos.x += (Math.random() - 0.5) * 0.02 * this.jolt;
      pos.y += (Math.random() - 0.5) * 0.02 * this.jolt;
      this.jolt = Math.max(0, this.jolt - dt * 9);
    }
    if (p.swapTimer > 0) pos.y -= 0.35 * clamp(p.swapTimer / 0.25, 0, 1);

    // Follow: swings snap to their timing; heavy weapons settle into holds more slowly.
    const rate = p.state === 'attack' ? 70 : HEAVY.has(w?.type) ? 13 : 20;
    const f = 1 - Math.exp(-rate * dt);
    this.pos.lerp(pos, f);
    this.quat.slerp(_qa, f);
    this.roll += (roll * 0.045 - this.roll) * (1 - Math.exp(-18 * dt));
    rig.fpRoll = this.roll;

    // ---- scope view: a scoped gun fully aimed hides the viewmodel behind the scope overlay
    const sg = this.model?.userData.sight;
    this.sighted = !!sg && this.ads > 0.85;
    this.scoped = sg?.kind === 'scope' && this.ads > 0.92;
    if (this.scoped) {
      this.scopeView.show(w);
      this.scopeView.setRange(p.game.aim.distance);
    } else this.scopeView.hide();
    this.root.visible = !this.scoped;

    if (this.model) {
      this.model.position.copy(this.pos);
      this.model.quaternion.copy(this.quat);
      animateWeapon(this.model, this.time);
      if (this.sightReticle) this.collimate();
    }
    this.updateHands(p, bobX, bobY);
    this.updateTrail(dt, swingT >= 0.25 && w?.cls === 'melee');
  }

  // World direction of the sight line as the eye sees it: from the camera to a far point on the
  // line. Shots aimed down a sight follow it (Player.aimDirection).
  sightDirection(out) {
    const sg = this.model?.userData.sight;
    if (!sg) return false;
    this.model.updateWorldMatrix(true, false);
    out.set(sg.x ?? 0, sg.y, sg.z + 300).applyMatrix4(this.model.matrixWorld);
    this.root.parent.getWorldPosition(_y);
    out.sub(_y).normalize();
    return true;
  }

  // A holo sight's reticle is collimated: drawn on the glass where the line from the eye to
  // the sight line's far point crosses it, so they always mark where the gun points, whatever
  // sway or recoil does to the eye's position behind the glass.
  collimate() {
    const sg = this.model.userData.sight;
    const sx = sg.x ?? 0;
    this.model.updateMatrix();
    _m.copy(this.model.matrix).invert();
    _a.set(0, 0, 0).applyMatrix4(_m);            // the eye (camera) in the gun's frame
    _b.set(sx, sg.y, sg.z + 300);
    const t = (sg.z - _a.z) / (_b.z - _a.z);
    // The reticle lives in its sight's own group (side-mounted sights sit `sx` off the gun's axis).
    const x = clamp(_a.x + (_b.x - _a.x) * t, sx - 0.03, sx + 0.03) - (this.sightReticle.parent === this.model ? 0 : sx);
    const y = clamp(_a.y + (_b.y - _a.y) * t, sg.y - 0.026, sg.y + 0.026);
    this.sightReticle.position.set(x, y, sg.z + 0.002);
  }

  // Right hand on the grip; left on the second grip of two-handed weapons and guns, supporting
  // the right on pistols, otherwise free. Forearms run back to elbows below the screen edge.
  updateHands(p, bobX, bobY) {
    const [R, L] = this.arms;
    const m = this.model;
    const w = this.weapon;
    const gun = w?.cls === 'ranged';
    // Handles run along the weapon (blades, hafts, foregrips); a gun's grip runs up into it.
    const along = _p.set(0, 0, 1).applyQuaternion(this.quat);
    if (m) {
      m.updateMatrix();
      const axis = gun ? _z.copy(GUN_GRIP_AXIS).applyQuaternion(this.quat) : along;
      this.placeHand(R, _a.set(0, gun ? -0.11 : 0, gun ? -0.04 : 0).applyMatrix4(m.matrix), axis, 1);
    } else {
      this.placeHand(R, _a.set(0.36, -0.44, -0.6), UP, 1, true);
    }
    const grip2 = m?.userData.grip2;
    const twoHand = grip2 && (grip2.when === 'always' || p.isAiming || p.charge > 0);
    if (twoHand) {
      // Guns: the fist sits under the foregrip rather than inside the receiver.
      _b.copy(grip2.local);
      if (w.cls === 'ranged') _b.y -= 0.045;
      this.placeHand(L, _b.applyMatrix4(m.matrix), along, -1);
    } else if (m && w.type === 'pistol') {
      this.placeHand(L, _b.set(0.04, -0.1, -0.03).applyMatrix4(m.matrix), _z.copy(GUN_GRIP_AXIS).applyQuaternion(this.quat), -1);
    } else {
      // Free hand: low at the left, raised while casting; pulled down out of the way of swings.
      const casting = w?.cls === 'magic' && (p.isAiming || p.charge > 0);
      const pose = casting ? OFF_HAND.cast : OFF_HAND.rest;
      _b.copy(pose.pos);
      _b.x += bobX * 0.8;
      _b.y += bobY * 0.8 + this.lift;
      if (p.state === 'attack') _b.y -= 0.18;
      this.offPos.lerp(_b, 0.25);
      orient(pose.dir, true, _qc);
      this.offQuat.slerp(_qc, 0.25);
      this.placeHand(L, this.offPos, _z.set(0, 1, 0).applyQuaternion(this.offQuat), -1, true);
    }
  }

  // A fist round `grip` with its handle along `axis`, turned so the wrist faces the elbow (behind,
  // below and outside the hand); the forearm runs from the wrist to the elbow.
  placeHand(arm, grip, axis, side, open = false) {
    const elbow = _elbow.set(0.15 * -side, -0.34, 0.3).add(grip);
    _z.copy(axis).normalize();
    _y.subVectors(elbow, grip);
    _y.addScaledVector(_z, -_y.dot(_z));
    if (_y.lengthSq() < 1e-8) _y.set(0, -1, 0).addScaledVector(_z, _z.y);
    _y.normalize();
    _x.crossVectors(_y, _z);
    arm.hand.quaternion.setFromRotationMatrix(_m.makeBasis(_x, _y, _z));
    const wrist = arm.hand.position.copy(grip).addScaledVector(_y, HANDLE);
    arm.grip.visible = !open;
    arm.open.visible = open;
    _x.subVectors(elbow, wrist);
    const len = _x.length();
    arm.fore.position.copy(wrist);
    arm.fore.quaternion.setFromUnitVectors(UP, _x.divideScalar(len));
    arm.sleeve.scale.set(1, len, 1);
  }

  // A ribbon between the blade's base and tip over the last few frames of a swing.
  updateTrail(dt, swinging) {
    const t = this.trail;
    for (const s of t) s.age += dt;
    while (t.length && t[t.length - 1].age > TRAIL_LIFE) t.pop();
    if (swinging && this.model) {
      const m = this.model;
      m.updateMatrix();
      const tip = new THREE.Vector3(0, 0, this.tipZ).applyMatrix4(m.matrix);
      const base = new THREE.Vector3(0, 0, this.tipZ * 0.72).applyMatrix4(m.matrix);
      t.unshift({ tip, base, age: 0 });
      if (t.length > TRAIL_N) t.length = TRAIL_N;
    }
    const pos = this.trailMesh.geometry.attributes.position;
    const col = this.trailMesh.geometry.attributes.color;
    const c = this.trailColor;
    for (let i = 0; i < TRAIL_N; i++) {
      const s = t[Math.min(i, t.length - 1)];
      if (!s) { pos.setXYZ(i * 2, 0, 0, 0); pos.setXYZ(i * 2 + 1, 0, 0, 0); col.setXYZ(i * 2, 0, 0, 0); col.setXYZ(i * 2 + 1, 0, 0, 0); continue; }
      pos.setXYZ(i * 2, s.base.x, s.base.y, s.base.z);
      pos.setXYZ(i * 2 + 1, s.tip.x, s.tip.y, s.tip.z);
      const a = i < t.length ? (1 - s.age / TRAIL_LIFE) * (1 - i / TRAIL_N) * 0.4 : 0;
      col.setXYZ(i * 2, 0, 0, 0);
      col.setXYZ(i * 2 + 1, c.r * a, c.g * a, c.b * a);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    this.trailMesh.visible = t.length > 1;
  }
}
