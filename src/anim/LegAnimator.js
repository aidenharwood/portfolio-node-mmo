// Procedural animation for many-legged rigs (models/Creatures.js legSkeleton): quadrupeds
// (wolves, tuskers, the Ursa) and spiders.
//   gait     each leg cycles stance/swing with its own phase offset — diagonal pairs trot for
//            quadrupeds, alternating fours for spiders — feet planted by two-bone IK onto the
//            terrain (bend directions remembered so knees never flip)
//   body     rides on its feet: height from the ground under them, pitch and roll from the
//            front/back and left/right differences, a bob at twice the stride rate
//   head     looks at its target; the jaw works; the tail sways and lags behind turns
//   poses    bite, charge, howl, pounce, spit, rear (standing slam), swipe, stagger, dead —
//            blended in and out through springs
// Owners fill a state like makeLegState() each frame and call update().
import * as THREE from 'three';
import { solveTwoBone, Spring } from './IK.js';
import { resolveRagdollMeshContacts } from './RagdollContacts.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const ease = (t) => t * t * (3 - 2 * t);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const AXIS = new THREE.Vector3(0, -1, 0);
const BEND = new THREE.Vector3(0, 0, 1);
const X = new THREE.Vector3(1, 0, 0);
const _v = new THREE.Vector3();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _e = new THREE.Euler();

export function makeLegState() {
  return {
    mode: 'ground',      // ground | air | stagger | dead
    vx: 0, vz: 0, facing: 0, grounded: true,
    brokenLegs: [],
    ground: null,        // (x, z) => world height
    pose: 'idle',        // idle | bite | charge | howl | pounce | spit | rear | swipe
    phase: 'none',       // windup | active | recover | none
    t: 0,                // 0..1 progress through the phase
    lookYaw: 0, lookPitch: 0,
    crouch: 0, flinch: 0,
  };
}

export class LegAnimator {
  constructor(rig) {
    this.rig = rig;
    this.cfg = rig.cfg;
    this.phase = Math.random();
    this.time = Math.random() * 10;
    this.prevFacing = null;
    this.sp = {
      y: new Spring(5), pitch: new Spring(4), roll: new Spring(4), crouch: new Spring(6),
      headYaw: new Spring(5), headPitch: new Spring(6), jaw: new Spring(10), dead: new Spring(2),
      rear: new Spring(4), tuck: new Spring(7), tail: new Spring(3), lean: new Spring(6),
    };
    this.mem = rig.legs.map(() => ({ perp: new THREE.Vector3(), set: false }));
    this.feet = rig.legs.map(() => new THREE.Vector3());
    this.dir = new THREE.Vector2(0, 1);
    this.ragdoll = null;
    this.ragdollPose = null;
  }

  update(dt, s) {
    if (dt <= 0) return;
    dt = Math.min(dt, 1 / 20);
    const r = this.rig;
    const c = this.cfg;
    const sp = this.sp;
    const m = r.model;
    this.time += dt;
    const sf = Math.sin(s.facing);
    const cf = Math.cos(s.facing);
    const lz = s.vx * sf + s.vz * cf;
    const lx = s.vx * cf - s.vz * sf;
    const speed = Math.hypot(lx, lz);
    if (speed > 0.3) this.dir.set(lx / speed, lz / speed);
    const yawRate = this.prevFacing === null ? 0 : wrap(s.facing - this.prevFacing) / dt;
    this.prevFacing = s.facing;
    const move = smoothstep(0.1, 1.0, speed);
    const run = smoothstep(c.walk ?? 2.5, (c.walk ?? 2.5) * 2.4, speed);
    const dead = sp.dead.step(s.mode === 'dead' ? 1 : 0, dt);
    const poseActive = (name) => (s.pose === name ? 1 : 0);

    // ---- gait clock: stride limited by leg reach
    const L = c.legLen;
    const S = Math.min(L * 1.5, 0.2 + speed * (c.strideK ?? 0.3));
    const D = lerp(0.62, 0.4, run);
    const cycle = Math.max(0.25, S / D);
    if (s.grounded && s.mode !== 'dead') this.phase = (this.phase + (speed / cycle) * dt) % 1;
    const lift = L * lerp(0.14, 0.32, run);

    // ---- feet (model space)
    m.updateWorldMatrix(true, false);
    const mScale = m.scale.y || 1;
    const modelY = m.matrixWorld.elements[13];
    const tuck = sp.tuck.step(s.pose === 'pounce' && s.phase === 'active' ? 1 : 0, dt);
    const rear = sp.rear.step(this.rearAmount(s), dt);
    let frontH = 0;
    let backH = 0;
    let leftH = 0;
    let rightH = 0;
    let nf = 0, nb = 0, nl = 0, nr = 0, supported = 0;
    r.legs.forEach((leg, i) => {
      const lc = leg.cfg;
      if (s.brokenLegs?.includes(`leg${i}`)) {
        // The detached limb no longer plants a foot or carries the body's weight.
        this.feet[i].set(lc.foot[0], -L * 0.2, lc.foot[2]);
        return;
      }
      const ph = (this.phase + lc.phase) % 1;
      let a;
      let y;
      if (ph < D) {
        a = S * (0.5 - ph / D);
        y = 0;
      } else {
        const k = (ph - D) / (1 - D);
        a = S * (-0.5 + ease(k));
        y = lift * Math.sin(Math.PI * k);
      }
      const rest = this.feet[i].set(lc.foot[0], 0, lc.foot[2]);
      rest.x += this.dir.x * a * move;
      rest.z += this.dir.y * a * move;
      rest.y = y * move;
      // Poses that move feet: pounce tucks them up, rearing lifts the front pair, a swipe
      // sweeps one front paw across, the charge windup paws the ground.
      if (tuck > 0.01) rest.lerp(_v.set(lc.foot[0] * 0.6, c.bodyY * 0.55, lc.foot[2] * 0.6 + (lc.front ? 0.2 : -0.1)), tuck);
      if (lc.front && rear > 0.01) rest.lerp(_v.set(lc.foot[0] * 0.8, c.bodyY * 0.9 + L * 0.3, lc.foot[2] + L * 0.4), rear);
      if (lc.front && lc.side < 0 && s.pose === 'swipe' && s.phase !== 'none') {
        const k = s.phase === 'windup' ? ease(s.t) : s.phase === 'active' ? 1 - ease(s.t) : 0;
        rest.lerp(_v.set(lc.foot[0] - 0.2, c.bodyY * 0.7, lc.foot[2] + L * 0.5), k);
      }
      if (lc.front && lc.side > 0 && s.pose === 'charge' && s.phase === 'windup') {
        const k = Math.sin(s.t * Math.PI * 4);
        rest.y += Math.max(0, k) * L * 0.25;
        rest.z += k * L * 0.25;
      }
      if (dead > 0.01) rest.lerp(_v.set(lc.foot[0] * 1.6 + lc.side * 0.3, 0.1, lc.foot[2] * 1.1), dead);
      // Terrain under the foot.
      let h = 0;
      if (s.ground) {
        _v.set(rest.x, 0, rest.z).applyMatrix4(m.matrixWorld);
        h = clamp((s.ground(_v.x, _v.z) - modelY) / mScale, -0.6, 0.6);
      }
      rest.y += h + (c.ankle ?? 0.05);
      if (lc.front) { frontH += h; nf++; } else { backH += h; nb++; }
      if (lc.side > 0) { leftH += h; nl++; } else { rightH += h; nr++; }
      supported++;
    });
    const allH = supported ? (frontH + backH) / supported : 0;
    frontH = nf ? frontH / nf : allH;
    backH = nb ? backH / nb : allH;
    leftH = nl ? leftH / nl : allH;
    rightH = nr ? rightH / nr : allH;
    const lost = r.legs.length - supported;
    const loss = lost / Math.max(1, r.legs.length);

    // ---- body
    const crouch = sp.crouch.step(s.crouch + (s.pose === 'charge' && s.phase === 'windup' ? 0.25 : 0) + (s.pose === 'pounce' && s.phase === 'windup' ? 0.35 : 0)
      + (s.pose === 'howl' ? 0.1 : 0) + (s.mode === 'stagger' ? 0.15 : 0), dt);
    const bob = Math.cos(TAU * 2 * this.phase) * L * 0.035 * move * (1 - loss * 0.75);
    const collapse = L * 0.45 * loss;
    const baseY = c.bodyY * (1 - crouch * 0.4) + Math.min(frontH, backH) * 0.5 + Math.max(frontH, backH) * 0.5 - dead * c.bodyY * 0.55 - collapse;
    r.body.position.y = sp.y.step(baseY, dt) + bob;
    const len = c.bodyLen ?? 1;
    let pitch = Math.atan2(backH - frontH, len) + ((nf - nb) / Math.max(1, supported)) * 0.12;
    if (s.pose === 'spit') pitch -= poseActive('spit') * 0.4;
    pitch -= rear * 1.05;
    if (s.pose === 'charge' && s.phase === 'active') pitch += 0.12;
    const roll = Math.atan2(rightH - leftH, (c.bodyWidth ?? 0.6)) * 0.6
      + ((nr - nl) / Math.max(1, supported)) * 0.22 + dead * 1.4 - clamp(yawRate * speed * 0.01, -0.2, 0.2);
    const lean = sp.lean.step(s.flinch * -0.2 + (s.pose === 'bite' && s.phase === 'active' ? 0.12 : 0), dt);
    _e.set(sp.pitch.step(pitch, dt) + lean, 0, sp.roll.step(roll, dt), 'YXZ');
    r.body.quaternion.setFromEuler(_e);
    // Body sway with the gait (quadrupeds roll their shoulders/hips a touch).
    if (r.chest) r.chest.rotation.set(0, Math.sin(TAU * this.phase) * 0.06 * move, 0);

    // ---- head, jaw, tail
    let headPitch = -s.lookPitch * 0.6;
    let jaw = 0.05;
    if (s.pose === 'bite' || s.pose === 'swipe') {
      // Head drops and draws back, then drives forward and up into the bite as the jaw snaps.
      if (s.phase === 'windup') { headPitch += 0.3 * ease(s.t); jaw = 0.5 * s.t; }
      else if (s.phase === 'active') { headPitch += lerp(0.3, -0.25, ease(Math.min(1, s.t * 1.6))); jaw = s.t < 0.55 ? 0.9 : 0.05; }
    } else if (s.pose === 'howl' && s.phase !== 'none') { headPitch -= 1.0; jaw = 0.7; }
    else if (s.pose === 'charge') headPitch += 0.4;
    else if (s.pose === 'spit' && s.phase !== 'none') { headPitch -= 0.25; jaw = s.phase === 'active' ? 0.8 : 0.3; }
    if (s.pose === 'rear' && s.phase !== 'none') jaw = 0.6;
    const headYaw = sp.headYaw.step(clamp(s.lookYaw, -0.8, 0.8) * (1 - dead), dt);
    if (r.neck) r.neck.rotation.set(sp.headPitch.step(headPitch * (1 - dead) + rear * 0.6, dt) * 0.5, headYaw * 0.5, 0, 'YXZ');
    if (r.head) r.head.rotation.set(sp.headPitch.x * 0.5, headYaw * 0.5, 0, 'YXZ');
    if (r.jaw) r.jaw.rotation.x = sp.jaw.step(jaw, dt) * (c.jawOpen ?? 0.6);
    if (r.tail?.length) {
      const sway = sp.tail.step(-yawRate * 0.12, dt);
      r.tail.forEach((b, i) => {
        const k = (i + 1) / r.tail.length;
        b.rotation.set((c.tailDroop ?? 0.25) * (1 - move * 0.5) + dead * 0.3, Math.sin(this.time * (2 + run * 4) + i * 0.7) * 0.18 * k + sway * k, 0, 'YXZ');
      });
    }

    // ---- legs: IK to the feet
    m.updateMatrixWorld(true);
    r.legs.forEach((leg, i) => {
      if (s.brokenLegs?.includes(`leg${i}`)) {
        leg.upper.quaternion.setFromAxisAngle(X, 0.45);
        leg.lower.quaternion.identity();
        leg.foot.quaternion.identity();
        return;
      }
      const lc = leg.cfg;
      _p.copy(this.feet[i]).applyMatrix4(m.matrixWorld);
      // Knee/elbow direction: front elbows back, hind knees forward, spider knees up and out.
      leg.upper.parent.getWorldQuaternion(_q);
      if (lc.bend === 'up') _v.set(lc.side * 0.6, 1, 0);
      else _v.set(lc.side * 0.08, 0, lc.bend === 'back' ? -1 : 1);
      _v.normalize().applyQuaternion(_q);
      solveTwoBone(leg.upper, leg.lower, AXIS, BEND, lc.upper, lc.lower, _p, _v, this.mem[i]);
      // Feet stay level with the ground.
      leg.upper.parent.getWorldQuaternion(_q).multiply(leg.upper.quaternion).multiply(leg.lower.quaternion).invert();
      if (leg.foot) leg.foot.quaternion.copy(_q).multiply(m.getWorldQuaternion(_q2));
    });
    if (s.mode === 'dead') this.updateRagdoll(dt, s);
    else {
      this.ragdoll = null;
      const bones = this.ragdollBones();
      if (!this.ragdollPose) this.ragdollPose = bones.map((bone) => ({
        bone, position: bone.position.clone(), quaternion: bone.quaternion.clone(),
      }));
      else for (const p of this.ragdollPose) {
        p.position.copy(p.bone.position);
        p.quaternion.copy(p.bone.quaternion);
      }
    }
  }

  ragdollBones() {
    const r = this.rig;
    return [r.body, r.chest, r.neck, r.head, ...(r.tail ?? []), ...r.legs.flatMap((leg) => [leg.upper, leg.lower, leg.foot])].filter(Boolean);
  }

  updateRagdoll(dt, s) {
    const r = this.rig;
    const bones = this.ragdollBones();
    if (!this.ragdoll) {
      const pose = this.ragdollPose ?? bones.map((bone) => ({
        bone, position: bone.position.clone(), quaternion: bone.quaternion.clone(),
      }));
      const saved = new Map(pose.map((p) => [p.bone, p]));
      const seed = Math.random() * Math.PI * 2;
      this.ragdoll = {
        pose, time: 0, bodyY: saved.get(r.body).position.y, bodyV: 0,
        joints: bones.map((bone, i) => {
          const core = i < 4 + (r.tail?.length ?? 0);
          const p = saved.get(bone);
          _e.setFromQuaternion(p.quaternion, 'XYZ');
          return {
            bone, base: _q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), _e.y).clone(),
            x: _e.x, z: _e.z,
            tx: i === 0 ? (Math.sin(seed) < 0 ? -1 : 1) * (1.25 + Math.abs(Math.sin(seed * 2)) * 0.2)
              : core ? Math.sin(seed + i) * 0.28 : 0,
            tz: i === 0 ? Math.cos(seed) * 0.48 : core ? Math.cos(seed + i) * 0.18 : 0,
            limitX: i === 0 ? 1.65 : core ? 0.8 : 1.35,
            limitZ: i === 0 ? 0.85 : core ? 0.65 : 0.75,
            vx: Math.sin(seed + i * 2.7) * (core ? 0.25 : 0.12),
            vz: Math.cos(seed + i * 1.9) * (core ? 0.2 : 0.12),
            core,
          };
        }),
        contacts: [...r.legs.map((leg) => leg.foot), r.head].filter(Boolean),
      };
    }
    const sim = this.ragdoll;
    sim.time += dt;
    dt = Math.min(dt, 1 / 30);
    for (const p of sim.pose) if (p.bone !== r.body) p.bone.position.copy(p.position);
    const floorY = Math.max(0.08, this.cfg.bodyY * 0.16);
    sim.bodyV -= 9.8 * dt;
    sim.bodyY = Math.max(floorY, sim.bodyY + sim.bodyV * dt);
    if (sim.bodyY <= floorY) sim.bodyV = 0;
    r.body.position.y = sim.bodyY;
    for (const j of sim.joints) {
      if (j.core) {
        const k = j.bone === r.body ? 13 : 10;
        const damp = j.bone === r.body ? 5.8 : 5.0;
        j.vx += ((j.tx - j.x) * k - j.vx * damp) * dt;
        j.vz += ((j.tz - j.z) * k - j.vz * damp) * dt;
      } else {
        j.bone.getWorldQuaternion(_q).invert();
        _v.set(0, -9.8, 0).applyQuaternion(_q);
        j.vx += (-_v.z * 0.48 - j.vx * 5.2) * dt;
        j.vz += (_v.x * 0.48 - j.vz * 5.2) * dt;
      }
      j.x += j.vx * dt;
      j.z += j.vz * dt;
      j.x = clamp(j.x, -j.limitX, j.limitX);
      j.z = clamp(j.z, -j.limitZ, j.limitZ);
      _e.set(j.x, 0, j.z, 'XYZ');
      j.bone.quaternion.copy(j.base).multiply(_q.setFromEuler(_e));
      r.model.updateWorldMatrix(true, false);
    }
    if (s.ground) {
      r.model.updateWorldMatrix(true, true);
      for (const bone of sim.contacts) {
        bone.getWorldPosition(_p);
        const floor = s.ground(_p.x, _p.z) + 0.025;
        if (_p.y >= floor) continue;
        _p.y = floor;
        bone.parent.worldToLocal(_p);
        bone.position.copy(_p);
      }
    }
    resolveRagdollMeshContacts(r, s);
  }

  // How far the creature rears up onto its hind legs (rear pose, and the swipe's half-rear).
  rearAmount(s) {
    if (s.pose === 'rear') {
      if (s.phase === 'windup') return ease(s.t);
      if (s.phase === 'active') return 1 - ease(Math.min(1, s.t * 3));
      return 0;
    }
    if (s.pose === 'swipe' && s.phase === 'windup') return 0.35 * ease(s.t);
    if (s.pose === 'howl' && s.phase !== 'none') return 0.15;
    return 0;
  }
}

// ---------------------------------------------------------------- hovering rigs
// Drones and wraiths: a body that floats, bobs, tilts into its motion and recoils when it fires;
// spinning rings; optional arms (wraiths raise them to cast) and a trailing robe.
export function makeHoverState() {
  return { vx: 0, vz: 0, vy: 0, facing: 0, mode: 'ground', pose: 'idle', phase: 'none', t: 0, lookPitch: 0, lookYaw: 0, flinch: 0 };
}

export class HoverAnimator {
  constructor(rig) {
    this.rig = rig;
    this.time = Math.random() * 10;
    this.sp = { pitch: new Spring(3), roll: new Spring(3), dead: new Spring(2), cast: new Spring(6), recoil: new Spring(8) };
    this.ragdoll = null;
    this.ragdollPose = null;
  }

  update(dt, s) {
    if (dt <= 0) return;
    dt = Math.min(dt, 1 / 20);
    const r = this.rig;
    const sp = this.sp;
    this.time += dt;
    const sf = Math.sin(s.facing);
    const cf = Math.cos(s.facing);
    const lz = s.vx * sf + s.vz * cf;
    const lx = s.vx * cf - s.vz * sf;
    const dead = sp.dead.step(s.mode === 'dead' ? 1 : 0, dt);
    const casting = s.phase === 'windup' || (s.phase === 'active' && s.pose !== 'fire');
    const cast = sp.cast.step(casting ? 1 : 0, dt);
    const recoil = sp.recoil.step(s.phase === 'active' && s.pose === 'fire' ? 1 : 0, dt);
    r.body.position.y = r.cfg.bodyY + Math.sin(this.time * 2.2) * 0.08 * (1 - dead) - dead * r.cfg.bodyY * 0.7;
    const pitch = sp.pitch.step(clamp(lz * 0.05, -0.35, 0.35) - s.lookPitch * 0.5 - recoil * 0.2 + s.flinch * -0.3, dt);
    const roll = sp.roll.step(clamp(-lx * 0.06, -0.4, 0.4) + dead * 1.2, dt);
    _e.set(pitch + dead * 0.6, 0, roll, 'YXZ');
    r.body.quaternion.setFromEuler(_e);
    if (s.mode !== 'dead') for (const ring of r.spin ?? []) ring.rotation.y += dt * (ring.userData.rate ?? 4) * (1 - dead * 0.9);
    if (r.arms) {
      r.arms.forEach((arm, i) => {
        const side = i === 0 ? 1 : -1;
        arm.upper.rotation.set(lerp(0.35 + Math.sin(this.time * 1.7 + i) * 0.08, -1.25, cast), 0, side * lerp(0.35, 0.55, cast), 'XYZ');
        arm.fore.rotation.set(lerp(-0.6, -0.15, cast), 0, 0);
      });
    }
    if (r.robe) r.robe.rotation.set(clamp(lz * 0.08, -0.4, 0.5) + Math.sin(this.time * 2.6) * 0.06, Math.sin(this.time * 1.9) * 0.1, 0, 'YXZ');
    if (s.mode === 'dead') this.updateRagdoll(dt, s);
    else {
      this.ragdoll = null;
      const bones = this.ragdollBones();
      if (!this.ragdollPose) this.ragdollPose = bones.map((bone) => ({
        bone, position: bone.position.clone(), quaternion: bone.quaternion.clone(),
      }));
      else for (const p of this.ragdollPose) {
        p.position.copy(p.bone.position);
        p.quaternion.copy(p.bone.quaternion);
      }
    }
  }

  ragdollBones() {
    const r = this.rig;
    return [r.body, ...(r.arms ?? []).flatMap((arm) => [arm.upper, arm.fore, arm.hand]), r.robe].filter(Boolean);
  }

  updateRagdoll(dt, s) {
    const r = this.rig;
    const bones = this.ragdollBones();
    if (!this.ragdoll) {
      const pose = this.ragdollPose ?? bones.map((bone) => ({
        bone, position: bone.position.clone(), quaternion: bone.quaternion.clone(),
      }));
      const saved = new Map(pose.map((p) => [p.bone, p]));
      const seed = Math.random() * Math.PI * 2;
      this.ragdoll = {
        pose, time: 0, bodyY: saved.get(r.body).position.y, bodyV: 0,
        joints: bones.map((bone, i) => {
          const p = saved.get(bone);
          _e.setFromQuaternion(p.quaternion, 'XYZ');
          return {
            bone, base: _q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), _e.y).clone(),
            x: _e.x, z: _e.z,
            tx: i === 0 ? (Math.sin(seed) < 0 ? -1 : 1) * 1.35 : Math.sin(seed + i) * 0.3,
            tz: i === 0 ? Math.cos(seed) * 0.55 : Math.cos(seed + i) * 0.22,
            limitX: i === 0 ? 1.65 : 1.15, limitZ: i === 0 ? 0.85 : 0.75,
            vx: Math.sin(seed + i * 2.3) * (i === 0 ? 0.35 : 0.18),
            vz: Math.cos(seed + i * 1.7) * (i === 0 ? 0.3 : 0.16),
          };
        }),
        contacts: (r.arms ?? []).map((arm) => arm.hand),
      };
    }
    const sim = this.ragdoll;
    sim.time += dt;
    dt = Math.min(dt, 1 / 30);
    for (const p of sim.pose) if (p.bone !== r.body) p.bone.position.copy(p.position);
    const floorY = Math.max(0.08, this.rig.cfg.bodyY * 0.12);
    sim.bodyV -= 9.8 * dt;
    sim.bodyY = Math.max(floorY, sim.bodyY + sim.bodyV * dt);
    if (sim.bodyY <= floorY) sim.bodyV = 0;
    r.body.position.y = sim.bodyY;
    for (let i = 0; i < sim.joints.length; i++) {
      const j = sim.joints[i];
      if (i === 0 || j.bone === r.robe) {
        const k = i === 0 ? 12 : 7;
        const d = i === 0 ? 5.5 : 4.5;
        j.vx += ((j.tx - j.x) * k - j.vx * d) * dt;
        j.vz += ((j.tz - j.z) * k - j.vz * d) * dt;
      } else {
        j.bone.getWorldQuaternion(_q).invert();
        _v.set(0, -9.8, 0).applyQuaternion(_q);
        j.vx += (-_v.z * 0.5 - j.vx * 5.4) * dt;
        j.vz += (_v.x * 0.5 - j.vz * 5.4) * dt;
      }
      j.x = clamp(j.x + j.vx * dt, -j.limitX, j.limitX);
      j.z = clamp(j.z + j.vz * dt, -j.limitZ, j.limitZ);
      _e.set(j.x, 0, j.z, 'XYZ');
      j.bone.quaternion.copy(j.base).multiply(_q.setFromEuler(_e));
      r.model.updateWorldMatrix(true, false);
    }
    if (s.ground) {
      r.model.updateWorldMatrix(true, true);
      for (const bone of sim.contacts) {
        bone.getWorldPosition(_p);
        if (_p.y >= s.ground(_p.x, _p.z) + 0.025) continue;
        _p.y = s.ground(_p.x, _p.z) + 0.025;
        bone.parent.worldToLocal(_p);
        bone.position.copy(_p);
      }
    }
    resolveRagdollMeshContacts(r, s);
  }
}
