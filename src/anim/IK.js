// Analytic two-bone IK (hip–knee–ankle, shoulder–elbow–wrist) plus a critically damped spring.
// Bones follow the rig convention in models/Characters.js: both segments extend along the same
// local axis, and the child (middle joint) sits `len1` along that axis.
import * as THREE from 'three';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

const _inv = new THREE.Matrix4();
const _basisW = new THREE.Matrix4();
const _basisL = new THREE.Matrix4();
const _T = new THREE.Vector3();
const _P = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _perp = new THREE.Vector3();
const _u = new THREE.Vector3();
const _w = new THREE.Vector3();
const _bend = new THREE.Vector3();
const _end = new THREE.Vector3();
const _x = new THREE.Vector3();
const _qi = new THREE.Quaternion();
const _prev = new THREE.Vector3();
const _rax = new THREE.Vector3();

/**
 * Points `upper`→`lower` so the end effector (len2 along `axis` from `lower`) reaches `target`.
 * axis:    unit vector both segments run along in their local frames (e.g. (0,-1,0)).
 * bendDir: unit vector (⊥ axis) in the upper bone's frame that the lower segment folds toward.
 * target:  world position. pole: world direction the middle joint should point toward.
 * mem:     optional { perp: Vector3, set } carried between frames: the last bend direction is
 *          carried onto the new limb line, the pole only steers it where the pole is well defined
 *          (not lined up with the limb), and it turns at most `maxTurn` radians per call — so an
 *          elbow or knee can never flip in a single frame.
 * The caller must have updated upper.parent.matrixWorld.
 */
export function solveTwoBone(upper, lower, axis, bendDir, len1, len2, target, pole, mem = null, maxTurn = 0.35) {
  _inv.copy(upper.parent.matrixWorld).invert();
  _T.copy(target).applyMatrix4(_inv);
  _P.copy(pole).transformDirection(_inv);
  _dir.subVectors(_T, upper.position);
  let d = _dir.length();
  if (d < 1e-6) { _dir.copy(axis); d = len1; } else _dir.divideScalar(d);
  d = clamp(d, Math.abs(len1 - len2) + 1e-3, (len1 + len2) * 0.9995);

  const cosA = clamp((len1 * len1 + d * d - len2 * len2) / (2 * len1 * d), -1, 1);
  const sinA = Math.sqrt(1 - cosA * cosA);
  _perp.copy(_P).addScaledVector(_dir, -_P.dot(_dir));
  const strength = _perp.length() / Math.max(1e-6, _P.length());
  if (_perp.lengthSq() < 1e-8) {
    _perp.set(_dir.y, -_dir.x, 0);
    if (_perp.lengthSq() < 1e-8) _perp.set(0, _dir.z, -_dir.y);
  }
  _perp.normalize();
  if (mem) {
    if (mem.set) {
      _prev.copy(mem.perp).addScaledVector(_dir, -mem.perp.dot(_dir));
      if (_prev.lengthSq() > 1e-6) {
        _prev.normalize();
        const t = clamp((strength - 0.08) / 0.32, 0, 1);
        const w = t * t * (3 - 2 * t);
        _perp.lerp(_prev, 1 - w);
        if (_perp.lengthSq() < 1e-6) _perp.copy(_prev);
        _perp.normalize();
        const ang = _prev.angleTo(_perp);
        if (ang > maxTurn) {
          _rax.crossVectors(_prev, _perp);
          if (_rax.lengthSq() < 1e-10) _rax.copy(_dir);
          _perp.copy(_prev).applyAxisAngle(_rax.normalize(), maxTurn);
          _perp.addScaledVector(_dir, -_perp.dot(_dir)).normalize();
        }
      }
    }
    mem.perp.copy(_perp);
    mem.set = true;
  }
  _u.copy(_dir).multiplyScalar(cosA).addScaledVector(_perp, sinA);           // upper segment
  _end.copy(upper.position).addScaledVector(_dir, d);
  _w.copy(upper.position).addScaledVector(_u, len1);                          // middle joint
  _w.subVectors(_end, _w).normalize();                                        // lower segment
  _bend.copy(_w).addScaledVector(_u, -_w.dot(_u));
  if (_bend.lengthSq() < 1e-8) _bend.copy(_perp).negate();
  _bend.normalize();

  // Upper orientation maps (axis, bendDir) onto (upper segment, bend direction).
  _x.crossVectors(axis, bendDir);
  _basisL.makeBasis(axis, bendDir, _x).transpose();
  _x.crossVectors(_u, _bend);
  _basisW.makeBasis(_u, _bend, _x).multiply(_basisL);
  upper.quaternion.setFromRotationMatrix(_basisW);
  // Lower: a pure hinge taking the axis onto the lower segment in the upper's frame.
  _qi.copy(upper.quaternion).invert();
  _w.applyQuaternion(_qi);
  lower.quaternion.setFromUnitVectors(axis, _w);
}

// Critically damped spring (exact solution, stable at any dt). `freq` ~ how many times per
// second it closes most of the gap. `kick()` adds velocity for impacts and recoils.
export class Spring {
  constructor(freq = 6, value = 0) {
    this.omega = Math.PI * 2 * freq * 0.5;
    this.x = value;
    this.v = 0;
  }

  step(target, dt) {
    const w = this.omega;
    const x0 = this.x - target;
    const e = Math.exp(-w * dt);
    const t = (this.v + w * x0) * dt;
    this.x = target + (x0 + t) * e;
    this.v = (this.v - w * t) * e;
    return this.x;
  }

  kick(v) { this.v += v; }
  snap(value) { this.x = value; this.v = 0; }
}
