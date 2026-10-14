// Procedural animation for the jointed rigs in models/Characters.js.
//   locomotion  — gait cycle with planted feet (leg IK onto the terrain), hip bob/sway/twist,
//                 counter-rotating shoulders, arm swing, lean into acceleration, bank into turns
//   traversal   — jump tuck/fall, flips, corkscrews, slides, dashes, air dashes, mantles, slams, deaths
//   upper body  — weapon-arm poses (model space, with elbow + wrist), off-hand IK grips, look-at
// Owners fill an AnimState each frame (makeAnimState) and call update(); channels run through
// springs so state changes blend instead of popping.
import * as THREE from 'three';
import { solveTwoBone, Spring } from './IK.js';
import { Ragdoll, severRagdoll, deathKick } from './Ragdoll.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const ease = (t) => t * t * (3 - 2 * t);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

const AXIS = new THREE.Vector3(0, -1, 0);
const KNEE_BEND = new THREE.Vector3(0, 0, -1);
const ELBOW_BEND = new THREE.Vector3(0, 0, 1);
const X_AXIS = new THREE.Vector3(1, 0, 0);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const ARM_TO_POSE = new THREE.Quaternion().setFromAxisAngle(X_AXIS, -Math.PI / 2); // bone -Y → pose +Z
const MOUNT_INV = new THREE.Quaternion().setFromAxisAngle(X_AXIS, -Math.PI / 2);   // weapon → hand frame
// Handle weapons (blades, hafts, staves) run *through* the fist instead: along the hand's Z (the
// curl of the fingers), thumb toward the head, this deep below the wrist (× dims.grip).
const HANDLE_DEPTH = 1.38;
// Weapon-in-hand rotation of a handle weapon when nothing places it: edge toward the knuckles.
const HANDLE_REST = new THREE.Quaternion().setFromAxisAngle(Z_AXIS, -Math.PI / 2);

const _e = new THREE.Euler();
const _e2 = new THREE.Euler(0, 0, 0, 'YXZ');
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _q3 = new THREE.Quaternion();
const _qc = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _pole = new THREE.Vector3();
const _fkU = new THREE.Quaternion();
const _fkF = new THREE.Quaternion();
const _fkH = new THREE.Quaternion();
const _qw = new THREE.Quaternion();
const _qh = new THREE.Quaternion();
const _ax = new THREE.Vector3();
const _hy = new THREE.Vector3();
const _hx = new THREE.Vector3();
const _hm = new THREE.Matrix4();
const _hp = new THREE.Vector3();
const _rax = new THREE.Vector3();
const _qChest = new THREE.Quaternion();
const _qModel = new THREE.Quaternion();
const _qInv = new THREE.Quaternion();
const _target = [new THREE.Vector3(), new THREE.Vector3()];

// Hand frame gripping a handle at `grip` (world) for a weapon oriented `qw`: the handle runs along
// the hand's Z and the hand turns about it so its wrist faces the arm (toward a point just below the
// shoulder, where the elbow comes from) — the wrist never bends back on itself, whatever the swing.
// The roll is continuous: last frame's (kept chest-local in `lastY`) is carried onto the new handle
// axis, the shoulder only steers it where that direction is well defined (not along the handle),
// and it turns at most `maxTurn` per frame — so the fist can't flip round the handle.
function handleFrame(qw, grip, shoulder, out, lastY, chestQ, maxTurn = 0.3) {
  _ax.set(0, 0, 1).applyQuaternion(qw);
  _hy.subVectors(shoulder, grip);
  _hy.y -= 0.12;
  const len = _hy.length();
  _hy.addScaledVector(_ax, -_hy.dot(_ax));
  const strength = _hy.length() / Math.max(1e-6, len);
  _hp.copy(lastY).applyQuaternion(chestQ);
  _hp.addScaledVector(_ax, -_hp.dot(_ax));
  const hasPrev = _hp.lengthSq() > 1e-6;
  if (hasPrev) _hp.normalize();
  if (_hy.lengthSq() < 1e-8) _hy.copy(hasPrev ? _hp : _hx.set(0, 1, 0));
  _hy.normalize();
  if (hasPrev) {
    _hy.lerp(_hp, 1 - smoothstep(0.1, 0.45, strength));
    if (_hy.lengthSq() < 1e-6) _hy.copy(_hp);
    _hy.normalize();
    if (_hp.angleTo(_hy) > maxTurn) {
      _rax.crossVectors(_hp, _hy);
      if (_rax.lengthSq() < 1e-10) _rax.copy(_ax);
      _hy.copy(_hp).applyAxisAngle(_rax.normalize(), maxTurn);
      _hy.addScaledVector(_ax, -_hy.dot(_ax)).normalize();
    }
  }
  lastY.copy(_hy).applyQuaternion(_qInv.copy(chestQ).invert());
  _hx.crossVectors(_hy, _ax);
  _hm.makeBasis(_hx, _hy, _ax);
  return out.setFromRotationMatrix(_hm);
}


// Rotates `q` toward `target` by at most `max` radians (both world; used chest-relative).
function capTurn(q, target, max) {
  const ang = q.angleTo(target);
  if (ang <= max) return q.copy(target);
  return q.rotateTowards(target, max);
}
const _air = [new THREE.Vector3(), new THREE.Vector3()];
const _pitch = [0, 0];
const _airPitch = [0, 0];
const _h = [0, 0];

export function makeAnimState() {
  return {
    mode: 'ground',        // ground | air | slide | dash | airdash | mantle | slam | dead | stagger
    vx: 0, vz: 0, vy: 0, facing: 0, grounded: true,
    brokenLegs: [],
    sprint: false,
    t: 0,                  // 0..1 progress for timed modes (dash, mantle, dead)
    dashX: 0, dashZ: 1,    // dash direction, model space
    ground: null,          // (x, z) => world height for foot placement; null = flat
    pose: [0.9, -0.4, 0],  // weapon arm: forearm/weapon direction, model-space Euler (YXZ)
    elbow: 0.5, wrist: 0, snap: false, armSwing: 1,
    place: null,           // chest-local grip point to hold the weapon at (the arms solve by IK)
    handleObj: null,       // held handle weapon (its handle runs through the fist; see handleFrame)
    butt: null,            // { back, up }: place is a shoulder pocket and the grip sits this far
                           // forward/below it along the weapon (stock seated in the shoulder)
    twistSnap: false,
    placeSpace: 'model',   // 'chest': pose is the weapon's direction in the chest frame
    placeRate: 14,         // how fast the grip follows its target (0 = snap); low = heavy
    poseRate: 16,
    recoil: 0,
    offGrip: null,         // world point the off hand grabs (two-handed weapons, bow string)
    offPose: null,         // 'cast' raises the off hand palm-out
    twist: 0, strike: 0,   // chest twist into a swing; forward lean of a strike
    crouch: 0,             // 0..1 knees bent under a heavy swing
    stance: 0,             // 0..1 feet planted wide, left foot forward (fighting stance)
    aimPitch: 0, lookYaw: 0,
    flinch: 0, flip: 0, corkscrew: 0, spin: 0, glide: false,
    hunch: 0,              // permanent stoop (hive bugs, raiders, exo-suits)
  };
}

const mem = () => ({ perp: new THREE.Vector3(), set: false });

// Critically damped follow (exact, like IK.js Spring) for each component of `x` toward `target`,
// with velocities in `v`: it starts and stops smoothly, where an exponential lerp would jump to
// full speed the instant its target moved (the 'pop' when a hold or state changes).
function follow(x, v, target, omega, dt) {
  const e = Math.exp(-omega * dt);
  for (let i = 0; i < x.length; i++) {
    const x0 = x[i] - target[i];
    const t = (v[i] + omega * x0) * dt;
    x[i] = target[i] + (x0 + t) * e;
    v[i] = (v[i] - omega * t) * e;
  }
}
const _pa = [0, 0, 0];
const _pt = [0, 0, 0];

// Slerp without the shortest-arc flip (it follows whichever arc the signs of a and b describe).
const _b1 = new THREE.Quaternion();
const _b2 = new THREE.Quaternion();
function slerpArc(a, b, t, out) {
  const cos = clamp(a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w, -1, 1);
  let wa = 1 - t;
  let wb = t;
  if (Math.abs(cos) < 0.9995) {
    const th = Math.acos(cos);
    const s = Math.sin(th);
    wa = Math.sin((1 - t) * th) / s;
    wb = Math.sin(t * th) / s;
  }
  return out.set(a.x * wa + b.x * wb, a.y * wa + b.y * wb, a.z * wa + b.z * wb, a.w * wa + b.w * wb).normalize();
}

// Blends a bone between two poses (FK → IK) continuously over time: of the two arcs between them
// it takes the one landing nearest last frame's result. A plain slerp always takes the shorter
// arc, which switches sides — a hand flipping right over — when the poses are nearly opposite.
function blendQ(out, a, b, t, mem) {
  slerpArc(a, b, t, _b1);
  _b2.set(-b.x, -b.y, -b.z, -b.w);
  slerpArc(a, _b2, t, _b2);
  const pick = mem.set
    ? Math.abs(_b1.dot(mem.q)) >= Math.abs(_b2.dot(mem.q)) ? _b1 : _b2
    : a.dot(b) >= 0 ? _b1 : _b2;
  out.copy(pick);
  mem.q.copy(out);
  mem.set = true;
  return out;
}
const qmem = () => ({ q: new THREE.Quaternion(), set: false });

// The YXZ Euler solution equivalent to `e` that lies closest to `near` (so lerping from it to `near`
// takes the short way round, not a lap of the body).
function nearestEuler(e, near, out) {
  const A = [e.x, e.y, e.z];
  const B = [Math.PI - e.x, e.y + Math.PI, e.z + Math.PI];
  let best = null;
  let bestD = Infinity;
  for (const c of [A, B]) {
    let d = 0;
    for (let i = 0; i < 3; i++) {
      c[i] = near[i] + wrap(c[i] - near[i]);
      d += Math.abs(c[i] - near[i]);
    }
    if (d < bestD) { bestD = d; best = c; }
  }
  out[0] = best[0];
  out[1] = best[1];
  out[2] = best[2];
  return out;
}

export class Animator {
  constructor(rig) {
    this.rig = rig;
    this.d = rig.dims;
    this.L = rig.dims.thigh + rig.dims.shin;
    this.phase = Math.random();
    this.time = Math.random() * 10;
    this.prevFacing = null;
    this.prevSpeed = 0;
    this.dir = new THREE.Vector2(0, 1); // last travel direction (local)
    this.sp = {
      base: new Spring(4.5), hipX: new Spring(5), lean: new Spring(3.2), bank: new Spring(2.6),
      twist: new Spring(6), hipYaw: new Spring(4), headYaw: new Spring(5), headPitch: new Spring(5),
      ground: new Spring(5, 1), special: new Spring(7), accel: new Spring(2.5), offIK: new Spring(6),
      armX: new Spring(4), armZ: new Spring(4), armBend: new Spring(4), fall: new Spring(4),
      place: new Spring(6), stance: new Spring(5), armDirect: new Spring(4), tuck: new Spring(6),
    };
    this.placeAt = new THREE.Vector3();
    this.placeSet = false;
    this.buttOff = new THREE.Vector3();
    this.pose = [0.9, -0.4, 0];
    this.elbow = 0.5;
    this.wrist = 0;
    this.special = [new THREE.Vector3(), new THREE.Vector3()];
    this.specialPitch = [0, 0];
    this.specialMode = null;
    this.lead = 1;
    this.wasGrounded = true;
    this.shoulderL = rig.armL.upper.position.clone();
    this.handY = [new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 1, 0)];
    this.handleQ = new THREE.Quaternion().copy(HANDLE_REST);
    // Joint memories: bend directions carried between frames so elbows and knees never flip.
    this.ikMem = { armR: mem(), armL: mem(), legs: [mem(), mem()] };
    this.blendMem = { R: [qmem(), qmem(), qmem()], L: [qmem(), qmem(), qmem()] };
    // Which frame `pose` is expressed in ('model' = forearm direction, 'chest' = weapon direction).
    this.poseSpace = 'model';
    this.spin = 0;
    this.flipK = 0;
    this.corkK = 0;
    this.lastIKLocal = null;
    this.lastOrientLocal = null;
    this.poseVel = [0, 0, 0];
    this.placeVel = [0, 0, 0];
    // Hand orientations last frame (chest-local), for capping how fast a hand can turn.
    this.handPrev = [new THREE.Quaternion(), new THREE.Quaternion()];
    this.handSet = [false, false];
    this.ragdoll = null;
  }

  // The current weapon pose re-expressed in `space` (YXZ Euler, chosen nearest to `near`).
  poseIn(space, near = this.pose) {
    if (space === this.poseSpace) return [...this.pose];
    const out = [...this.pose];
    this.convertPose(out, this.poseSpace, space, near);
    return out;
  }

  // Converts a pose between the chest and model frames so it keeps pointing the same way.
  convertPose(pose, from, to, near) {
    const r = this.rig;
    r.chest.getWorldQuaternion(_qChest);
    r.model.getWorldQuaternion(_qModel);
    _e2.set(pose[0], pose[1], pose[2], 'YXZ');
    _q.setFromEuler(_e2).premultiply(from === 'chest' ? _qChest : _qModel);
    _q.premultiply((to === 'chest' ? _qChest : _qModel).invert());
    _e2.setFromQuaternion(_q, 'YXZ');
    nearestEuler(_e2, near, pose);
  }

  // Landing impact (m/s downward) compresses the legs and springs back.
  land(impact) {
    this.sp.base.kick(-Math.min(5, impact * 0.35));
  }

  resetRagdoll() {
    if (this.ragdoll) this.rig.hips.position.copy(this.ragdoll.drives[0].pos0);
    this.ragdoll = null;
  }

  // Dead: the body is a ragdoll of its own skeleton (anim/Ragdoll.js), from the pose it fell in.
  updateRagdoll(dt, s) {
    if (!this.ragdoll) this.ragdoll = humanoidRagdoll(this.rig, s);
    severRagdoll(this.ragdoll, s.brokenLegs, (id) => BIPED_PARTS[id]?.(this.rig));
    this.ragdoll.update(dt, s.world ?? null, s.ground ?? null);
  }

  update(dt, s) {
    if (dt <= 0) return;
    // A body at rest only keeps lying where it lies.
    if (s.mode === 'dead' && this.ragdoll?.asleep) { this.ragdoll.update(dt, null); return; }
    dt = Math.min(dt, 1 / 20);
    const r = this.rig;
    const d = this.d;
    const sp = this.sp;
    const L = this.L;
    const m = r.model;
    this.time += dt;

    // ---- motion in the character's frame (+Z forward, +X = its left)
    const sf = Math.sin(s.facing);
    const cf = Math.cos(s.facing);
    const lz = s.vx * sf + s.vz * cf;
    const lx = s.vx * cf - s.vz * sf;
    const speed = Math.hypot(lx, lz);
    const yawRate = this.prevFacing === null ? 0 : wrap(s.facing - this.prevFacing) / dt;
    this.prevFacing = s.facing;
    const accel = sp.accel.step(clamp((speed - this.prevSpeed) / dt, -40, 40), dt);
    this.prevSpeed = speed;
    if (speed > 0.3) this.dir.set(lx / speed, lz / speed);

    const scale = L / 0.82;
    const run = smoothstep(2.4 * scale, 5.5 * scale, speed);
    const move = smoothstep(0.1, 0.9 * scale, speed);
    const sprint = s.sprint ? smoothstep(7, 10, speed) : 0;
    const brokenLeft = s.brokenLegs?.includes('leftLeg') ?? false;
    const brokenRight = s.brokenLegs?.includes('rightLeg') ?? false;
    const lostLegs = Number(brokenLeft) + Number(brokenRight);
    const mode = s.mode;
    const grounded = s.grounded && (mode === 'ground' || mode === 'stagger' || mode === 'dash');
    // Dash: the direction (model space) and an envelope rising and falling over it. A dash is
    // over in a quarter second, faster than the springs move, so its lunge, dip and lean follow
    // the envelope directly (it starts and ends at zero, so nothing pops).
    const dashX = s.dashX ?? 0;
    const dashZ = s.dashZ ?? 1;
    const dashE = mode === 'dash' ? Math.sin(Math.PI * Math.min(1, clamp(s.t, 0, 1) * 1.15)) : 0;

    // ---- gait: stride is limited by leg reach at the current hip drop, so planted feet never skate
    const drop = L * (0.06 + 0.08 * run + 0.06 * sprint);
    const hipJoint = d.hipY - d.hipDrop - drop;
    const vert = hipJoint - d.ankle;
    const reach = Math.sqrt(Math.max(0.01, (L * 0.97) ** 2 - vert * vert));
    const S = Math.min(2 * reach * 0.96, 0.2 + speed * 0.5);
    const D = Math.min(0.82, lerp(0.6, 0.26, run) - 0.07 * sprint + 0.1 * lostLegs);
    const C = Math.max(0.2, S / D);
    if (s.grounded) this.phase = (this.phase + (speed / C) * dt) % 1;
    const lift = L * lerp(0.12, 0.42, run) * (lostLegs ? 1.18 : 1);
    const stance = sp.stance.step(s.stance ?? 0, dt);

    // ---- foot targets (model space): ground gait
    const ux = this.dir.x;
    const uz = this.dir.y;
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? 1 : -1;
      if (i === 0 ? brokenLeft : brokenRight) {
        _target[i].set(side * d.hipX, -d.hipDrop - L * 0.12, -L * 0.08);
        _pitch[i] = 0;
        continue;
      }
      const ph = (this.phase + i * 0.5) % 1;
      let a;
      let y;
      let pitch;
      if (ph < D) {
        const k = ph / D;
        a = S * (0.5 - k);
        pitch = lerp(-0.12, 0.4, k * k) * run;
        y = Math.max(0, pitch) * 0.1;
      } else {
        const k = (ph - D) / (1 - D);
        a = S * (-0.5 + ease(k));
        y = lift * Math.pow(Math.sin(Math.PI * Math.pow(k, 0.8)), 0.9);
        pitch = 0.7 * Math.sin(Math.PI * k) * (1 - k) - 0.25 * k * k * run;
      }
      const x0 = side * d.hipX * lerp(1.0, 0.6, run) * (1 + 0.5 * stance * (1 - move));
      const idleZ = side * 0.03 + (side > 0 ? 0.17 : -0.12) * L * stance;
      const t = _target[i].set(x0 + ux * a * move, 0, lerp(idleZ, uz * a, move));
      _pitch[i] = pitch * move;
      t.y = y * move;
    }

    // Terrain under each foot, relative to the model (in model units).
    const mScale = m.scale.y || 1;
    m.updateWorldMatrix(true, false);
    const modelY = m.matrixWorld.elements[13];
    for (let i = 0; i < 2; i++) {
      if (i === 0 ? brokenLeft : brokenRight) { _h[i] = 0; continue; }
      if (s.ground && mode !== 'dead') {
        _v.set(_target[i].x, 0, _target[i].z).applyMatrix4(m.matrixWorld);
        _h[i] = clamp((s.ground(_v.x, _v.z) - modelY) / mScale, -0.55, 0.55);
      } else _h[i] = 0;
      _target[i].y += _h[i] + d.ankle;
    }

    // ---- hips
    const groundW = sp.ground.step(grounded ? 1 : 0, dt);
    const supportHeights = [];
    if (!brokenLeft) supportHeights.push(_h[0]);
    if (!brokenRight) supportHeights.push(_h[1]);
    const lowFoot = Math.min(0, ...supportHeights);
    const collapse = lostLegs === 2 ? 0.4 : lostLegs === 1 ? 0.16 : 0;
    let base = d.hipY - drop + lowFoot * groundW - s.hunch * 0.06 - (s.crouch ?? 0) * L * 0.17 - L * collapse;
    if (mode === 'slide') base = d.hipY * 0.55;
    else if (mode === 'dead') base = lerp(d.hipY, d.hipY * 0.14, ease(clamp(s.t * 1.4, 0, 1)));
    else if (mode === 'mantle') base = d.hipY * 0.92;
    const baseY = sp.base.step(base, dt);
    // How high the hips are carried (springs, no bob), for the first-person eye — which keeps only
    // a quarter of the gait's running dip (a full one sinks the view whenever you break into a run).
    this.eyeLift = (this.eyeLift ?? 0) + ((mode === 'ground' ? drop * 0.75 : 0) - (this.eyeLift ?? 0)) * (1 - Math.exp(-8 * dt));
    this.hipsBase = baseY + this.eyeLift;
    const bobAmp = L * lerp(0.025, -0.05, run) * move * groundW;
    const bob = bobAmp * Math.cos(TAU * 2 * (this.phase - D / 2));
    const breathe = Math.sin(this.time * 2.1) * 0.006 * (1 - move);
    const sway = sp.hipX.step(L * 0.03 * Math.sin(TAU * this.phase) * move * (1 - run) * groundW, dt);
    r.hips.position.set(sway, baseY + bob + breathe - d.hipY * 0.13 * dashE, 0);

    // Pelvis twist follows the legs; strafing turns the hips toward travel, shoulders stay on aim.
    const gaitLeg = brokenLeft ? _target[1] : _target[0];
    const nL = gaitLeg.z / Math.max(0.01, S / 2);
    const gaitYaw = -0.14 * clamp(nL, -1, 1) * move * groundW * lerp(0.6, 1, run);
    const strafe = speed > 0.5 ? Math.atan2(lx, Math.abs(lz) + 0.6) * 0.55 * move : 0;
    const strafeYaw = sp.hipYaw.step(strafe * groundW, dt);
    // The hips take a fifth of any torso twist (swings, bladed aiming) so the turn reads full-body.
    const hipYaw = strafeYaw + gaitYaw + sp.twist.x * 0.2;
    const limpRoll = brokenLeft && !brokenRight ? 0.16 : brokenRight && !brokenLeft ? -0.16 : 0;
    const hipRoll = 0.05 * Math.sin(TAU * this.phase) * move * groundW + limpRoll;
    let hipPitch = 0.06 * run * groundW;
    if (mode === 'slide') hipPitch = -0.28;
    else if (mode === 'dash') hipPitch += 0.18 * dashZ * dashE;
    else if (mode === 'airdash') hipPitch = 0.65;
    else if (mode === 'slam') hipPitch = 0.3;
    _e.set(hipPitch, hipYaw, hipRoll, 'YXZ');
    r.hips.quaternion.setFromEuler(_e);

    // Whole-body rotations (pivot at the hips ≈ centre of mass). Flips and corkscrews always
    // complete their turn: cut short (an early landing), they spin on to the end quickly instead
    // of snapping upright.
    if (s.flip > 0) this.flipK = s.flip;
    else if (this.flipK > 0) this.flipK = this.flipK + dt * 3.5 >= 1 ? 0 : this.flipK + dt * 3.5;
    if (s.corkscrew > 0) this.corkK = s.corkscrew;
    else if (this.corkK > 0) this.corkK = this.corkK + dt * 3.5 >= 1 ? 0 : this.corkK + dt * 3.5;
    const flip = this.flipK;
    if (flip > 0) {
      _q.setFromAxisAngle(X_AXIS, TAU * ease(clamp(flip, 0, 1)));
      r.hips.quaternion.premultiply(_q);
    }
    if (this.corkK > 0) {
      const k = clamp(this.corkK, 0, 1);
      _q.setFromAxisAngle(X_AXIS, 1.25 * Math.sin(Math.PI * Math.min(1, k * 1.4)));
      _q2.setFromAxisAngle(Z_AXIS, TAU * ease(k));
      r.hips.quaternion.premultiply(_q).premultiply(_q2);
    }
    if (mode === 'dead') {
      _q.setFromAxisAngle(X_AXIS, -1.45 * ease(clamp(s.t * 1.2, 0, 1)));
      r.hips.quaternion.premultiply(_q);
    }

    // ---- spine / chest / head
    let lean = s.hunch + 0.04 * move + 0.1 * run + 0.14 * sprint + clamp(accel * 0.012, -0.12, 0.2) + s.strike * 0.22;
    if (!s.grounded && mode === 'ground') lean = 0;
    if (mode === 'air') lean = s.hunch + (s.vy > 0 ? -0.06 : 0.08) - (s.glide ? 0.1 : 0);
    else if (mode === 'slide') lean = -0.32 + s.strike * 0.3;
    else if (mode === 'airdash') lean = 0.25;
    else if (mode === 'mantle') lean = 0.5 * Math.sin(Math.PI * clamp(s.t, 0, 1)) + s.hunch;
    else if (mode === 'slam') lean = 0.35;
    else if (mode === 'stagger') lean = -0.35;
    else if (mode === 'dead') lean = -0.25;
    lean -= s.flinch * 0.35;
    const leanS = sp.lean.step(lean, dt) + 0.34 * dashZ * dashE;
    const bankTarget = mode === 'dead' ? 0 : clamp(-yawRate * Math.max(speed, 2) * 0.03, -0.32, 0.32) * (s.grounded ? 1 : 0.5);
    const bank = sp.bank.step(bankTarget, dt) - 0.3 * dashX * dashE;
    if (s.twistSnap) sp.twist.snap(s.twist);
    const twist = sp.twist.step(s.twist, dt);
    const counter = -gaitYaw * 1.6 - strafeYaw;
    r.spine.rotation.set(leanS * 0.55, counter * 0.5 + twist * 0.35, bank * 0.6, 'YXZ');
    const breath = Math.sin(this.time * 2.1) * 0.02;
    r.chest.rotation.set(leanS * 0.45 + breath, counter * 0.5 + twist * 0.45 + s.flinch * 0.2, bank * 0.4, 'YXZ');

    const chestYaw = counter + twist * 0.8;
    const headYaw = sp.headYaw.step(clamp(s.lookYaw - chestYaw - hipYaw, -1.0, 1.0), dt);
    const headPitch = sp.headPitch.step(clamp(-s.aimPitch * 0.6 - leanS * 0.7 + s.flinch * -0.3, -0.8, 0.7), dt);
    r.head.rotation.set(headPitch, headYaw, -bank * 0.3, 'YXZ');

    // Whole-body spin (whirlwinds): followed exactly while it runs; if it's cut short, the body
    // finishes the turn (or unwinds, whichever is nearer) instead of snapping back to facing.
    if (s.spin) this.spin = s.spin;
    else if (this.spin) {
      const lap = Math.round(this.spin / TAU) * TAU;
      this.spin = Math.abs(lap - this.spin) < 0.005 ? 0 : lap + (this.spin - lap) * Math.exp(-16 * dt);
      if (Math.abs(this.spin - lap) < 0.005) this.spin = 0;
    }
    m.rotation.set(0, this.spin, 0);
    m.updateMatrixWorld(true);

    // ---- legs
    const fall = sp.fall.step(smoothstep(2, -6, s.vy), dt);
    if (!s.grounded && this.wasGrounded) this.lead = this.phase < 0.5 ? 1 : 0;
    this.wasGrounded = s.grounded;
    this.tuck = sp.tuck.step(Math.max(flip > 0 ? 1 : 0, s.glide ? 0.3 : 0), dt);
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? 1 : -1;
      const leadLeg = i === this.lead ? 1 : 0;
      // Air pose (hips-local): lead knee drives up on the rise, legs reach down on the fall.
      const tuck = this.tuck;
      const ax = side * d.hipX * lerp(1, 1.2, fall);
      const ay = -d.hipDrop - L * lerp(leadLeg ? 0.52 : 0.9, leadLeg ? 0.88 : 0.95, fall);
      const az = L * lerp(leadLeg ? 0.3 : -0.25, leadLeg ? 0.12 : -0.06, fall);
      _air[i].set(ax, lerp(ay, -d.hipDrop - L * 0.42, tuck), lerp(az, L * 0.35, tuck));
      _airPitch[i] = lerp(leadLeg ? 0.3 : 0.7, 0.25, fall);
      r.hips.localToWorld(_air[i]);
      m.worldToLocal(_air[i]);
      _target[i].lerp(_air[i], 1 - groundW);
      _pitch[i] = lerp(_airPitch[i], _pitch[i], groundW);
    }
    const special = this.specialFeet(s, mode, L);
    let specialW;
    if (mode === 'dash') sp.special.snap(specialW = dashE);
    else specialW = sp.special.step(special ? 1 : 0, dt);
    if (specialW > 0.001) {
      for (let i = 0; i < 2; i++) {
        _target[i].lerp(this.special[i], specialW);
        _pitch[i] = lerp(_pitch[i], this.specialPitch[i], specialW);
      }
    }

    r.hips.getWorldQuaternion(_qc);
    for (let i = 0; i < 2; i++) {
      const leg = r.legs[i];
      if (i === 0 ? brokenLeft : brokenRight) {
        // Leave the severed stump out of foot placement and ground support.
        leg.thigh.quaternion.setFromAxisAngle(X_AXIS, 0.45);
        leg.shin.quaternion.identity();
        leg.foot.quaternion.identity();
        continue;
      }
      const side = i === 0 ? 1 : -1;
      _v.copy(_target[i]).applyMatrix4(m.matrixWorld);
      _pole.set(side * 0.12, mode === 'slide' && i === 1 ? -0.6 : 0, 1).normalize().applyQuaternion(_qc);
      solveTwoBone(leg.thigh, leg.shin, AXIS, KNEE_BEND, d.thigh, d.shin, _v, _pole, this.ikMem.legs[i]);
      // Feet stay level with the body (pitched by the gait), not with the shin.
      _q.copy(_qc).multiply(leg.thigh.quaternion).multiply(leg.shin.quaternion).invert();
      m.getWorldQuaternion(_q2);
      if (specialW > 0.5 || groundW < 0.5) _q2.copy(_qc);
      _q3.setFromAxisAngle(X_AXIS, _pitch[i]);
      leg.foot.quaternion.copy(_q).multiply(_q2).multiply(_q3);
    }

    // ---- weapon arm: pose is the forearm direction (model space) or, for placed holds, the
    // weapon's direction in the chest frame. When the owner switches frames, the current pose is
    // converted first so it keeps pointing the same way and eases on from there.
    const space = s.placeSpace ?? 'model';
    if (space !== this.poseSpace) {
      this.convertPose(this.pose, this.poseSpace, space, s.pose);
      this.poseSpace = space;
    }
    if (s.snap) {
      for (let i = 0; i < 3; i++) this.pose[i] = s.pose[i];
      this.poseVel.fill(0);
    } else follow(this.pose, this.poseVel, s.pose, (s.poseRate ?? 16) * 1.5, dt);
    this.elbow = lerp(this.elbow, s.elbow, s.snap ? 1 : 1 - Math.exp(-12 * dt));
    this.wrist = lerp(this.wrist, s.wrist, 1 - Math.exp(-12 * dt));
    const swing = -clamp(nL, -1, 1) * 0.3 * move * groundW * s.armSwing * (1 - 0.5 * run);
    _e2.set(this.pose[0] + swing, this.pose[1], this.pose[2], 'YXZ');
    _q.setFromEuler(_e2);
    // Compensate for the torso: in model space normally, in hips space while the body tumbles.
    const tumbling = mode === 'dead' || flip > 0 || this.corkK > 0;
    _qc.copy(r.spine.quaternion).multiply(r.chest.quaternion);
    if (!tumbling) _qc.premultiply(r.hips.quaternion);
    _qc.invert();
    _q2.setFromAxisAngle(X_AXIS, this.elbow);
    // A chest-frame pose already rides with the torso; a model-frame one is compensated for it.
    if (this.poseSpace === 'chest') r.armR.upper.quaternion.copy(_q).multiply(_q2).multiply(ARM_TO_POSE);
    else r.armR.upper.quaternion.copy(_qc).multiply(_q).multiply(_q2).multiply(ARM_TO_POSE);
    r.armR.fore.rotation.set(-this.elbow, 0, 0);
    r.armR.hand.rotation.set(-this.wrist, 0, 0);

    // Two-handed placement: the weapon sits at a chest-relative point, aimed along the pose; the
    // weapon arm reaches it by IK (elbow out and down) and the wrist takes up the angle.
    // Holds are chest-relative, so they ride through flips, corkscrews and dashes; only deaths let go.
    const wPlace = sp.place.step(s.place && mode !== 'dead' ? 1 : 0, dt);
    if (s.place) {
      if (!this.placeSet || !s.placeRate) {
        this.placeAt.copy(s.place);
        this.placeVel.fill(0);
      } else {
        this.placeAt.toArray(_pa);
        s.place.toArray(_pt);
        follow(_pa, this.placeVel, _pt, s.placeRate * 1.5, dt);
        this.placeAt.fromArray(_pa);
      }
      this.placeSet = true;
    }
    if (wPlace > 0.01 && this.placeSet) {
      const R = r.armR;
      _fkU.copy(R.upper.quaternion);
      _fkF.copy(R.fore.quaternion);
      _fkH.copy(R.hand.quaternion);
      // Weapon orientation: chest space for body-relative holds and swings, model space otherwise.
      if (this.poseSpace === 'chest') {
        _e2.set(this.pose[0], this.pose[1], this.pose[2], 'YXZ');
        _q.setFromEuler(_e2);
        r.chest.getWorldQuaternion(_qw).multiply(_q);
      } else m.getWorldQuaternion(_qw).multiply(_q);
      _qh.copy(_qw).multiply(MOUNT_INV);
      r.chest.localToWorld(_v.copy(this.placeAt));
      // Shouldered: the grip sits forward of the pocket along the weapon, so the stock stays seated.
      _w.set(0, s.butt ? -s.butt.up : 0, s.butt ? s.butt.back : 0);
      this.buttOff.lerp(_w, 1 - Math.exp(-18 * dt));
      _v.add(_w.copy(this.buttOff).applyQuaternion(_qw));
      _v.add(_w.set(0, 0, -0.08 * s.recoil).applyQuaternion(_qw));
      r.chest.getWorldQuaternion(_qChest);
      if (s.handleObj) handleFrame(_qw, _v, R.upper.getWorldPosition(_w), _qh, this.handY[0], _qChest);
      _v.add(_w.set(0, s.handleObj ? d.grip * HANDLE_DEPTH : d.grip, 0).applyQuaternion(_qh));
      this.capHand(0, _qh, _qChest);
      if (s.handleObj) this.handleQ.copy(_qh).invert().multiply(_qw);
      r.chest.getWorldQuaternion(_q3);
      _pole.set(-0.85, -0.5, -0.15).normalize().applyQuaternion(_q3);
      solveTwoBone(R.upper, R.fore, AXIS, ELBOW_BEND, d.upper, d.fore, _v, _pole, this.ikMem.armR);
      _q3.multiply(R.upper.quaternion).multiply(R.fore.quaternion).invert();
      R.hand.quaternion.copy(_q3).multiply(_qh);
      const bm = this.blendMem.R;
      blendQ(R.upper.quaternion, _fkU, R.upper.quaternion, wPlace, bm[0]);
      blendQ(R.fore.quaternion, _fkF, R.fore.quaternion, wPlace, bm[1]);
      blendQ(R.hand.quaternion, _fkH, R.hand.quaternion, wPlace, bm[2]);
    }
    if (s.handleObj) {
      // Seat the weapon in the fist: its commanded orientation while placed, edge-forward otherwise.
      // Seated the way the last placement left it — never interpolated through the long way
      // round, which flips the blade when its roll crosses 180°.
      s.handleObj.quaternion.copy(MOUNT_INV).multiply(this.handleQ);
      s.handleObj.position.set(0, 0, (HANDLE_DEPTH - 1) * d.grip);
    }
    r.armR.upper.updateMatrixWorld(true);

    // ---- off arm: FK swing/poses, blended toward an IK grip when one is requested
    this.offArmFK(s, mode, nL, move, run, groundW, fall, dt, flip);
    const a = r.armL;
    a.upper.position.copy(this.shoulderL);
    let ikTarget = null;
    let orient = false;
    if (s.offGrip?.obj) {
      const o = s.offGrip.obj;
      r.chest.getWorldQuaternion(_qChest);
      if (s.offGrip.handle) {
        // Two-handed haft or hilt: the fist closes round the handle like the main hand's, turned
        // so its wrist faces the left arm.
        o.getWorldQuaternion(_qw);
        o.localToWorld(_w.copy(s.offGrip.local));
        handleFrame(_qw, _w, a.upper.getWorldPosition(_v), _qh, this.handY[1], _qChest);
        ikTarget = _w.add(_v.set(0, d.grip * HANDLE_DEPTH, 0).applyQuaternion(_qh));
      } else {
        // A gun's foregrip: the fist closes on it in the weapon's orientation (thumb up, like the
        // main hand on the pistol grip), so the IK target is the wrist behind the handle.
        o.getWorldQuaternion(_qh).multiply(MOUNT_INV);
        ikTarget = o.localToWorld(_w.copy(s.offGrip.local)).add(_v.set(0, d.grip, 0).applyQuaternion(_qh));
      }
      this.capHand(1, _qh, _qChest);
      orient = true;
    } else if (s.offGrip) ikTarget = s.offGrip;
    else if (s.offPose === 'cast') ikTarget = r.chest.localToWorld(_w.set(0.06, 0.12, 0.5));
    const wIK = sp.offIK.step(ikTarget ? 1 : 0, dt);
    r.chest.getWorldQuaternion(_qChest);
    if (ikTarget) {
      this.lastIKLocal = r.chest.worldToLocal((this.lastIKLocal ?? new THREE.Vector3()).copy(ikTarget));
      this.lastOrientLocal = orient ? (this.lastOrientLocal ?? new THREE.Quaternion()).copy(_qChest).invert().multiply(_qh) : null;
    }
    if (this.lastIKLocal) {
      this.lastIK = r.chest.localToWorld((this.lastIK ?? new THREE.Vector3()).copy(this.lastIKLocal));
      this.lastOrient = this.lastOrientLocal ? (this.lastOrient ?? new THREE.Quaternion()).copy(_qChest).multiply(this.lastOrientLocal) : null;
    }
    if (wIK > 0.01 && this.lastIK) {
      _fkU.copy(a.upper.quaternion);
      _fkF.copy(a.fore.quaternion);
      _fkH.identity();
      // Reaching across the body: the shoulder rolls forward/inward before the arm
      // has to straighten (up to ~16cm), so cross-body rifle grips can land.
      _v.copy(this.lastIK);
      r.chest.worldToLocal(_v).sub(this.shoulderL);
      const reach = d.upper + d.fore + d.grip;
      const extra = clamp(_v.length() - reach * 0.9, 0, 0.16) * wIK;
      _v.y = 0;
      if (extra > 0 && _v.lengthSq() > 1e-6) a.upper.position.addScaledVector(_v.normalize(), extra);
      a.upper.updateMatrixWorld();
      r.chest.getWorldQuaternion(_q);
      _pole.set(0.5, -0.5, -0.8).normalize().applyQuaternion(_q);
      solveTwoBone(a.upper, a.fore, AXIS, ELBOW_BEND, d.upper, this.lastOrient ? d.fore : d.fore + d.grip, this.lastIK, _pole, this.ikMem.armL);
      if (this.lastOrient) {
        r.chest.getWorldQuaternion(_q).multiply(a.upper.quaternion).multiply(a.fore.quaternion).invert();
        a.hand.quaternion.copy(_q).multiply(this.lastOrient);
      } else a.hand.quaternion.identity();
      const bm = this.blendMem.L;
      blendQ(a.upper.quaternion, _fkU, a.upper.quaternion, wIK, bm[0]);
      blendQ(a.fore.quaternion, _fkF, a.fore.quaternion, wIK, bm[1]);
      blendQ(a.hand.quaternion, _fkH, a.hand.quaternion, wIK, bm[2]);
    } else a.hand.quaternion.identity();
    if (mode === 'dead') this.updateRagdoll(dt, s);
    else if (this.ragdoll) this.resetRagdoll();
  }

  // Caps how fast a gripping hand may turn (chest-relative): steady motion passes untouched, but a
  // sudden change of grip (weapon swap, a new hold) turns the fist over a few frames, not one.
  capHand(i, q, chestQ, max = 0.45) {
    _qInv.copy(chestQ).invert();
    _q2.copy(_qInv).multiply(q);
    if (this.handSet[i]) {
      capTurn(this.handPrev[i], _q2, max);
      q.copy(chestQ).multiply(this.handPrev[i]);
    } else this.handPrev[i].copy(_q2);
    this.handSet[i] = true;
  }

  // Off arm forward kinematics: counter-swing with the legs, pumping when running, balance in the
  // air, reaching on mantles, raised for slams. Writes upper/fore rotations.
  offArmFK(s, mode, nL, move, run, groundW, fall, dt, flip = 0) {
    const a = this.rig.armL;
    const sp = this.sp;
    let x = 0.06;
    let z = 0.1;
    let bend = 0.25;
    if (mode === 'ground' || mode === 'stagger') {
      const nR = -nL;
      const amp = lerp(0.4, 0.95, run) * (s.sprint ? 1.2 : 1);
      x = lerp(0.06, -nR * amp, move * groundW);
      z = 0.1 + 0.08 * run;
      bend = lerp(0.25, 1.45, run) + 0.25 * nR * run;
      if (!s.grounded) { x = lerp(-0.5, -0.25, fall); z = lerp(0.45, 0.95, fall); bend = 0.5; }
      if (mode === 'stagger') { x = -0.9; z = 0.7; bend = 0.6; }
    } else if (mode === 'air') {
      x = lerp(-0.55, -0.25, fall);
      z = lerp(0.45, 0.95, fall) + (s.glide ? 0.35 : 0);
      bend = s.glide ? 0.15 : 0.5;
    } else if (mode === 'slide') {
      x = 0.7; z = 0.55; bend = 0.15;
    } else if (mode === 'dash') {
      x = 0.75; z = 0.4; bend = 0.4;
    } else if (mode === 'airdash') {
      x = 0.95; z = 0.35; bend = 0.2;
    } else if (mode === 'mantle') {
      const t = clamp(s.t, 0, 1);
      x = t < 0.45 ? -2.7 : lerp(-2.7, -0.6, (t - 0.45) / 0.55);
      z = 0.2; bend = t < 0.45 ? 0.3 : 0.9;
    } else if (mode === 'slam') {
      x = -2.4; z = 0.35; bend = 0.6;
    } else if (mode === 'dead') {
      x = -0.4; z = 1.2; bend = 0.3;
    }
    if (flip > 0) { x = -1.0; z = 0.3; bend = 1.6; }
    x += s.flinch * -0.6;
    // Gait swing is already continuous and fast, so on foot it drives the arm directly; pose
    // changes (jumps, slides, dashes, mantles) ease through springs — and the hand-over between
    // the two is itself blended, so coming out of a dash doesn't snap the arm.
    const direct = sp.armDirect.step(mode === 'ground' && s.grounded && flip <= 0 ? 1 : 0, dt);
    const sx = sp.armX.step(x, dt);
    const sz = sp.armZ.step(z, dt);
    const sb = sp.armBend.step(bend, dt);
    x = lerp(sx, x, direct);
    z = lerp(sz, z, direct);
    bend = lerp(sb, bend, direct);
    a.upper.rotation.set(x, 0, z, 'XYZ');
    a.fore.rotation.set(-bend, 0, 0);
  }

  // Foot targets (model space) for modes that override the gait; null when none applies.
  specialFeet(s, mode, L) {
    const d = this.d;
    const r = this.rig;
    const T = this.special;
    const P = this.specialPitch;
    const hipsLocal = (i, x, y, z) => {
      T[i].set(x, y, z);
      r.hips.localToWorld(T[i]);
      r.model.worldToLocal(T[i]);
    };
    switch (mode) {
      case 'slide': {
        T[0].set(d.hipX * 1.1, d.ankle + 0.02, L * 0.78);
        T[1].set(-d.hipX * 0.7, d.ankle, -L * 0.08);
        P[0] = -0.35; P[1] = 0.9;
        return T;
      }
      case 'dash': {
        // A low lunge along the dash: the lead foot reaches ahead (the left one, or the right
        // when dashing right), the trailing leg stretches out behind in a long push-off line,
        // up on its toes; feet apart so they never cross.
        const dx = s.dashX ?? 0;
        const dz = s.dashZ ?? 1;
        const lead = dx < -0.35 ? 1 : 0;
        for (let i = 0; i < 2; i++) {
          const ahead = i === lead ? 0.5 : -0.78;
          T[i].set((i ? -1 : 1) * d.hipX * (i === lead ? 1.5 : 1.3) + dx * L * ahead, d.ankle + (i === lead ? 0.02 : 0.11), dz * L * ahead);
          P[i] = i === lead ? 0.05 : 1.0;
        }
        return T;
      }
      case 'airdash':
        for (let i = 0; i < 2; i++) hipsLocal(i, (i ? -1 : 1) * d.hipX, -d.hipDrop - L * 0.9, -L * (i ? 0.36 : 0.22));
        P[0] = P[1] = 0.9;
        return T;
      case 'mantle':
        hipsLocal(0, d.hipX, -d.hipDrop - L * 0.5, L * 0.32);
        hipsLocal(1, -d.hipX, -d.hipDrop - L * 0.8, L * 0.02);
        P[0] = 0.2; P[1] = 0.6;
        return T;
      case 'slam':
        for (let i = 0; i < 2; i++) hipsLocal(i, (i ? -1 : 1) * d.hipX * 1.25, -d.hipDrop - L * 0.5, L * 0.3);
        P[0] = P[1] = 0.3;
        return T;
      case 'dead':
        for (let i = 0; i < 2; i++) hipsLocal(i, (i ? -1 : 1) * d.hipX * 1.4, -d.hipDrop - L * 0.93, L * (i ? 0.12 : 0.02));
        P[0] = P[1] = 0.6;
        return T;
      default:
        return null;
    }
  }
}

// ---------------------------------------------------------------- ragdoll
// The parts a biped can lose (combat/HitComponents.js), by the bone each hangs from.
const BIPED_PARTS = {
  head: (r) => r.head, leftArm: (r) => r.armL.upper, rightArm: (r) => r.armR.upper,
  leftLeg: (r) => r.legs[0].thigh, rightLeg: (r) => r.legs[1].thigh,
};
const KNEE = new THREE.Vector3(0, 0, -1);   // a shin folds back from its thigh (KNEE_BEND), and of the pelvis
const ELBOW = new THREE.Vector3(0, 0, 1);   // a forearm forward from its upper arm (ELBOW_BEND)
const FORWARD = new THREE.Vector3(0, 0, 1);
const DOWN = new THREE.Vector3(0, -1, 0);
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
// Which ways the torso's outline is found (model frame): front, back, sides and between.
const LOWER_SHELL = [V3(0, 0, 1), V3(0, 0, -1), V3(1, 0, 0), V3(-1, 0, 0), V3(1, 0, 1), V3(-1, 0, 1), V3(1, 0, -1), V3(-1, 0, -1),
  V3(0, -1, -1), V3(0, -1, 1), V3(1, -1, 0), V3(-1, -1, 0), V3(0, -1, -0.3)];
const UPPER_SHELL = [V3(0, 0, 1), V3(0, 0, -1), V3(1, 0, 0), V3(-1, 0, 0), V3(1, 0, 1), V3(-1, 0, 1), V3(1, 0, -1), V3(-1, 0, -1), V3(1, 1, 0), V3(-1, 1, 0)];

// A humanoid's ragdoll: balls at the pelvis, spine, chest, neck, head, shoulders, elbows, wrists,
// hips, knees, ankles and toes; the torso braced into one piece that bends a little at the spine;
// knees and elbows hinges that fold one way; hips and shoulders twist only so far.
export function humanoidRagdoll(r, s) {
  const rd = new Ragdoll(r.model, (r.height ?? 2.05) / 2.05);
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const pelvis = rd.point(r.hips, null, 0.15);
  const spine = rd.point(r.spine, null, 0.13);
  const chest = rd.point(r.chest, null, 0.15);
  const neck = rd.point(r.head, null, 0.07);
  const arms = [r.armL, r.armR].map((a) => ({
    a, sh: rd.point(a.upper, null, 0.07), el: rd.point(a.fore, null, 0.055), wr: rd.point(a.hand, null, 0.05),
    fist: rd.tip(a.hand, V(0, -1, 0), 0.045, 0.04),
  }));
  const legs = r.legs.map((l) => {
    const toe = rd.tip(l.foot, V(0, -0.35, 1), 0.05, 0.06);
    return {
      l, hip: rd.point(l.thigh, null, 0.09), knee: rd.point(l.shin, null, 0.07), ankle: rd.point(l.foot, null, 0.06),
      toe: toe >= 0 ? toe : rd.point(l.foot, V(0, -0.05, 0.16), 0.05), heel: rd.tip(l.foot, V(0, -0.5, -1), 0.045, 0.03),
    };
  });
  // Joints as thick as the limbs round them (armour, a heavy build).
  for (const { a, sh, el, wr, fist } of arms) {
    rd.thick(sh, a.upper, el, 0.2);
    rd.thick(el, a.fore, wr, 0.16);
    rd.thick(wr, a.fore, el, 0.16);
    // (What's in the fist, when it's part of the body: a maul's head, a blade.)
    rd.thick(fist, a.hand, wr, 0.3);
  }
  for (const { l, hip, knee, ankle } of legs) {
    rd.thick(hip, l.thigh, knee, 0.2);
    rd.thick(knee, l.shin, ankle, 0.16);
    rd.thick(ankle, l.shin, knee, 0.16);
  }
  const [L, R] = arms;
  const [LL, RL] = legs;
  // The torso: pelvis, hips and spine one rigid block; the chest, neck and shoulders another;
  // between them the spine bends and turns a little. Each block's outline (belly, back, sides,
  // shoulders, armour) is balls too, so it lies on the ground as wide as it is.
  const lowerShell = rd.shell([r.hips, r.spine], LOWER_SHELL, 0.05, r.hips, 16);
  const upperShell = rd.shell([r.chest], UPPER_SHELL, 0.05, r.chest, 12);
  const lower = rd.group([pelvis, spine, LL.hip, RL.hip, ...lowerShell]);
  const upper = rd.group([chest, neck, L.sh, R.sh, ...upperShell]);
  rd.twist(lower, upper, [spine, chest], [RL.hip, LL.hip], [R.sh, L.sh], 0.7);
  // The head (and whatever it wears: a helmet, a crest) one stiff piece on its neck.
  const skull = rd.piece(r.head, [r.head, r.skull].filter(Boolean), neck, V(0, 1, 0), V(1, 0, 0), 0.06, 8, 0.12);
  const head = skull.end;
  // It turns and tips only so far: each side of it stays about as far from its shoulder.
  rd.range(L.sh, skull.left, 0.8, 1.25); rd.range(R.sh, skull.right, 0.8, 1.25);
  rd.link(spine, chest);
  rd.range(spine, L.sh, 0.93, 1.03); rd.range(spine, R.sh, 0.93, 1.03);
  rd.range(pelvis, chest, 0.88, 1.01);
  for (const h of [LL.hip, RL.hip]) for (const sh of [L.sh, R.sh]) rd.range(h, sh, 0.85, 1.06);
  // The head nods and turns only so far.
  rd.range(chest, head, 0.86, 1.01);
  rd.range(L.sh, head, 0.8, 1.15); rd.range(R.sh, head, 0.8, 1.15);
  for (const { sh, el, wr, fist } of arms) {
    rd.link(sh, el, 1, true); rd.link(el, wr, 1, true);
    // The hand bends at the wrist only so far.
    rd.link(wr, fist); rd.bend(el, wr, fist, 0.9);
    rd.apart(sh, wr, 0.3);
    // Arms stay out of the body.
    const body = 0.15 * rd.size;
    rd.apart(el, spine, 0, body + 0.01); rd.apart(wr, spine, 0, body); rd.apart(wr, pelvis, 0, body); rd.apart(wr, chest, 0, body);
  }
  // The pelvis's frame (side, up, forward), for the hips' and knees' limits.
  const hips = [pelvis, spine, RL.hip, LL.hip];
  for (const { l, hip, knee, ankle, toe, heel } of legs) {
    rd.link(hip, knee, 1, true);
    // Shin and foot one stiff piece: knee, ankle, toe and heel (a dead body's ankles don't
    // flex to speak of).
    rd.group([knee, ankle, toe, heel]);
    rd.apart(hip, ankle, 0.35);
    rd.apart(knee, chest, 0.5);
    rd.hinge(hip, knee, ankle, hips, FORWARD, 0.9, null, true);
    rd.reach(hip, knee, hips, FORWARD, -0.22 * rd.size);
    // …and only so far up: a thigh rises to about level, curled or flung out sideways; it swings
    // out to the side about 50°, and in across the other a little.
    rd.reach(hip, knee, hips, DOWN, -0.25 * rd.size);
    const thigh = rd.points[hip].p.distanceTo(rd.points[knee].p) / rd.scale;
    const out = l === r.legs[0] ? V3(1, 0, 0) : V3(-1, 0, 0);
    rd.reach(hip, knee, hips, out.clone().negate(), -0.78 * thigh);
    rd.reach(hip, knee, hips, out, -0.42 * thigh);
  }
  rd.apart(LL.knee, RL.knee, 0, 0.14 * rd.size); rd.apart(LL.ankle, RL.ankle, 0, 0.12 * rd.size);
  // How the bones follow, root first.
  rd.drive(r.hips, 'root', pelvis, spine, { side: [RL.hip, LL.hip] });
  rd.drive(r.spine, 'frame', spine, chest, { side: [RL.hip, LL.hip], cone: 1.8 });
  rd.drive(r.chest, 'frame', chest, neck, { side: [R.sh, L.sh], cone: 1.8 });
  if (skull.ok) rd.drive(r.head, 'frame', skull.pivot, skull.end, { side: [skull.right, skull.left], cone: 2.2 });
  else rd.drive(r.head, 'frame', neck, head, { side: [R.sh, L.sh], cone: 2.2 });
  for (const { a, sh, el, wr, fist } of arms) {
    rd.drive(a.upper, 'limb', sh, el, { next: wr, bend: ELBOW });
    rd.drive(a.fore, 'hinge', el, wr, { bend: ELBOW, lo: 0, hi: 2.8 });
    rd.drive(a.hand, 'aim', wr, fist, { cone: 2.4 });
  }
  for (const { l, hip, knee, ankle, toe, heel } of legs) {
    rd.drive(l.thigh, 'limb', hip, knee, { next: ankle, bend: KNEE, ref: hips, refDir: KNEE, refSwing: true, cone: 2.8 });
    // The shin turned with its foot (one piece), so the foot sits on it as it did.
    rd.drive(l.shin, 'frame', knee, ankle, { side: [ankle, toe], cone: 2.8 });
    if (heel >= 0) rd.drive(l.foot, 'frame', ankle, toe, { side: [ankle, heel], cone: 2.4 });
    else rd.drive(l.foot, 'aim', ankle, toe, { cone: 2.4 });
  }
  const { velocity, kick } = deathKick(s);
  rd.start(velocity, kick, [chest, neck, head, L.sh, R.sh, spine]);
  return rd;
}
