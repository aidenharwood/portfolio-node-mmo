// Cape cloth: a grid of verlet points — one column per cape bone chain, one row per joint plus the
// hem — pinned along the shoulders. Points trail behind motion through inertia, fall under gravity
// and ripple at speed; columns may bunch together (the cloth folds) but never pull apart, so turns,
// spins and runs throw waves across the width as well as down it. Points are kept off the body:
// the back's actual curve, the seat and leg line, and the thighs as the legs swing. Each frame the
// grid is written back into the cape bones (full frames, so the cloth twists as well as bends).
import * as THREE from 'three';
import { BODY } from '../models/Characters.js';

const GRAVITY = new THREE.Vector3(0, -9.8, 0);
const STEP = 1 / 120;
const ROD = 0;     // keeps its rest length (down each column)
const CROSS = 1;   // never stretches, may fold to 70% (across the width, and the shear diagonals)
const BEND = 2;    // two joints apart: may curve but never fold flat back on itself
const _v = new THREE.Vector3();
const _b = new THREE.Vector3();
const _d = new THREE.Vector3();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _qi = new THREE.Quaternion();
const _qp = new THREE.Quaternion();
const _qc = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _inv = new THREE.Matrix4();
const _invH = new THREE.Matrix4();
const _back = new THREE.Vector3();

// The chest shell's half-width, back depth and squareness at chest-local height y.
const CHEST = BODY.chest;
function backAt(y, out) {
  let i = 0;
  while (i < CHEST.length - 2 && CHEST[i + 1].y < y) i++;
  const a = CHEST[i];
  const b = CHEST[i + 1];
  const t = Math.min(1, Math.max(0, (y - a.y) / (b.y - a.y)));
  out.w = a.w + (b.w - a.w) * t;
  out.zb = a.zb + (b.zb - a.zb) * t;
  out.n = a.n + (b.n - a.n) * t;
  return out;
}
const _sec = { w: 0, zb: 0, n: 2 };

export class CapeCloth {
  constructor(rig) {
    const G = rig.capeGrid;
    this.rig = rig;
    this.cols = G.cols;
    this.n = G.rows + 1;
    this.bones = G.bones;
    this.rest = G.rest;
    const N = this.cols * this.n;
    this.p = Array.from({ length: N }, () => new THREE.Vector3());
    this.prev = Array.from({ length: N }, () => new THREE.Vector3());
    this.normal = Array.from({ length: N }, () => new THREE.Vector3());
    this.anchor = Array.from({ length: this.cols }, () => new THREE.Vector3());
    this.anchorPrev = Array.from({ length: this.cols }, () => new THREE.Vector3());
    this.ready = false;
    this.time = Math.random() * 10;
    this.acc = 0;
    this.legs = rig.legs.map(() => ({ a: new THREE.Vector3(), ab: new THREE.Vector3() }));
    this.clear = rig.capeClear ?? 0;

    const id = (c, r) => c * this.n + r;
    this.id = id;
    this.links = [];
    const link = (c1, r1, c2, r2, mode) => {
      const len = this.rest[c1][r1].distanceTo(this.rest[c2][r2]);
      if (r1 === 0 && r2 === 0) return;
      this.links.push({ a: id(c1, r1), b: id(c2, r2), len, mode, pinA: r1 === 0, pinB: r2 === 0 });
    };
    for (let c = 0; c < this.cols; c++) for (let r = 0; r < this.n - 1; r++) link(c, r, c, r + 1, ROD);
    for (let c = 0; c < this.cols - 1; c++) {
      for (let r = 0; r < this.n; r++) link(c, r, c + 1, r, CROSS);
      for (let r = 0; r < this.n - 1; r++) {
        link(c, r, c + 1, r + 1, CROSS);
        link(c + 1, r, c, r + 1, CROSS);
      }
    }
    for (let c = 0; c < this.cols; c++) for (let r = 0; r < this.n - 2; r++) link(c, r, c, r + 2, BEND);

    // Each bone's cloth frame at rest (chest space); writeBones maps rest frames onto live ones.
    this.restInv = this.bones.map((col, c) => col.map((_, r) => this.frame(this.rest, c, r, new THREE.Quaternion()).invert()));
    this.lastX = this.bones.map(() => new THREE.Vector3(1, 0, 0));
  }

  // Orientation of the cloth around bone (c, r): Y up the column, X across toward the next column.
  frame(pts, c, r, out, cols = this.cols) {
    const P = (cc, rr) => (Array.isArray(pts[0]) ? pts[cc][rr] : pts[this.id(cc, rr)]);
    _y.subVectors(P(c, r), P(c, r + 1)).normalize();
    const c0 = c < cols - 1 ? c : c - 1;
    _x.subVectors(P(c0 + 1, r), P(c0, r)).add(P(c0 + 1, r + 1)).sub(P(c0, r + 1));
    _x.addScaledVector(_y, -_x.dot(_y));
    if (_x.lengthSq() < 1e-8) _x.copy(this.lastX?.[c] ?? _x.set(1, 0, 0));
    _x.normalize();
    if (this.lastX) this.lastX[c].copy(_x);
    _z.crossVectors(_x, _y);
    _m.makeBasis(_x, _y, _z);
    return out.setFromRotationMatrix(_m);
  }

  reset() {
    const M = this.rig.chest.matrixWorld;
    for (let c = 0; c < this.cols; c++) {
      for (let r = 0; r < this.n; r++) {
        const i = this.id(c, r);
        this.p[i].copy(this.rest[c][r]).applyMatrix4(M);
        this.prev[i].copy(this.p[i]);
      }
      this.anchorPrev[c].copy(this.p[this.id(c, 0)]);
    }
    this.ready = true;
  }

  // dt: seconds; speed: the wearer's planar speed (drives flutter).
  update(dt, speed = 0) {
    if (dt <= 0) return;
    const r = this.rig;
    r.chest.updateWorldMatrix(true, false);
    const M = r.chest.matrixWorld;
    for (let c = 0; c < this.cols; c++) this.anchor[c].copy(this.rest[c][0]).applyMatrix4(M);
    const mid = this.cols >> 1;
    if (!this.ready || this.anchor[mid].distanceTo(this.p[this.id(mid, 0)]) > 3) this.reset();
    _inv.copy(M).invert();
    _invH.copy(r.hips.matrixWorld).invert();
    _back.set(0, 0, -1).transformDirection(M);
    r.legs.forEach((leg, i) => {
      leg.thigh.getWorldPosition(this.legs[i].a);
      leg.shin.getWorldPosition(this.legs[i].ab).sub(this.legs[i].a);
    });
    this.time += dt;
    this.normals();

    this.acc = Math.min(this.acc + dt, 0.1);
    const steps = Math.max(1, Math.floor(this.acc / STEP));
    this.acc -= steps * STEP;
    const gust = Math.min(1, speed / 9);
    for (let s = 1; s <= steps; s++) {
      for (let c = 0; c < this.cols; c++) this.p[this.id(c, 0)].lerpVectors(this.anchorPrev[c], this.anchor[c], s / steps);
      for (let c = 0; c < this.cols; c++) {
        // The shoulders' motion this substep: cloth also loses energy relative to its wearer
        // (internal friction), so a sudden start or stop can't whip the hem up over the head.
        _y.subVectors(this.anchor[c], this.anchorPrev[c]).divideScalar(steps);
        for (let k = 1; k < this.n; k++) {
          const i = this.id(c, k);
          const p = this.p[i];
          _v.subVectors(p, this.prev[i]).multiplyScalar(0.988);
          _v.addScaledVector(_x.subVectors(_v, _y), -0.03);
          this.prev[i].copy(p);
          p.add(_v).addScaledVector(GRAVITY, STEP * STEP);
          // Flutter along the cloth's own normal, phased down and across the cape so waves travel
          // over it; grows toward the hem and with speed, with a faint idle stir.
          const h = k / (this.n - 1);
          const amp = h * (0.00022 * gust + 0.00002);
          const wave = Math.sin(this.time * 9.5 - k * 1.25 + c * 1.7) + 0.35 * Math.sin(this.time * 5.3 + c * 2.9 - k * 0.6);
          p.addScaledVector(this.normal[i], wave * amp);
        }
      }
      for (let it = 0; it < 4; it++) {
        this.solveLinks();
        for (let c = 0; c < this.cols; c++) {
          for (let k = 1; k < this.n; k++) {
            // Body contact shifts the cloth without launching it: the push mostly moves the point's
            // previous position too, so swinging legs can't pump energy into the cape stride by stride.
            const i = this.id(c, k);
            _d.copy(this.p[i]);
            this.collide(this.p[i]);
            this.prev[i].addScaledVector(_d.subVectors(this.p[i], _d), 0.8);
          }
        }
      }
    }
    for (let c = 0; c < this.cols; c++) this.anchorPrev[c].copy(this.anchor[c]);
    this.writeBones();
  }

  // Per-point cloth normals (central differences), refreshed once a frame for the flutter.
  normals() {
    const { cols, n, p } = this;
    for (let c = 0; c < cols; c++) {
      for (let k = 0; k < n; k++) {
        const i = this.id(c, k);
        _d.subVectors(p[this.id(c, Math.min(n - 1, k + 1))], p[this.id(c, Math.max(0, k - 1))]);
        _x.subVectors(p[this.id(Math.min(cols - 1, c + 1), k)], p[this.id(Math.max(0, c - 1), k)]);
        this.normal[i].crossVectors(_x, _d);
        if (this.normal[i].lengthSq() < 1e-10) this.normal[i].copy(_back);
        else this.normal[i].normalize();
      }
    }
  }

  solveLinks() {
    const p = this.p;
    for (const L of this.links) {
      const a = p[L.a];
      const b = p[L.b];
      _d.subVectors(b, a);
      const len = _d.length() || 1e-6;
      let target;
      if (L.mode === ROD) target = L.len;
      else if (L.mode === CROSS) {
        if (len > L.len) target = L.len;
        else if (len < L.len * 0.7) target = L.len * 0.7;
        else continue;
      } else {
        if (len >= L.len * 0.775) continue;
        target = L.len * 0.775;
      }
      const diff = (len - target) / len;
      if (L.pinA) b.addScaledVector(_d, -diff);
      else if (L.pinB) a.addScaledVector(_d, diff);
      else {
        a.addScaledVector(_d, diff * 0.5);
        b.addScaledVector(_d, -diff * 0.5);
      }
    }
  }

  // Keep a point off the back (its real curve), behind the seat and leg line, and off the thighs.
  collide(p) {
    const r = this.rig;
    _b.copy(p).applyMatrix4(_inv);
    if (_b.y > -0.15) {
      const S = backAt(_b.y, _sec);
      const pad = 0.022 + this.clear;
      const ax = Math.abs(_b.x) / (S.w + pad);
      // Behind the curved back; beside the body it may hang level with the sides, never in front;
      // above the shoulder line it stays behind them (a hard stop can't flop it over the head).
      let limit = ax < 1 ? -(S.zb + pad) * Math.pow(1 - Math.pow(ax, S.n), 1 / S.n) : 0;
      if (_b.y > 0.2) limit = Math.min(limit, -0.17 - this.clear);
      if (_b.z > limit) { _b.z = limit; p.copy(_b).applyMatrix4(r.chest.matrixWorld); }
      return;
    }
    _b.copy(p).applyMatrix4(_invH);
    // Seat, then the leg line: the hem may swing but never round in front of the legs.
    const lim = _b.y > -0.3 ? -0.215 - this.clear : -0.13;
    if (_b.z > lim) { _b.z = lim; p.copy(_b).applyMatrix4(r.hips.matrixWorld); }
    for (const { a, ab } of this.legs) {
      // Thigh capsule: hip joint → knee.
      const t = Math.max(0, Math.min(1, _b.subVectors(p, a).dot(ab) / ab.lengthSq()));
      const closest = _v.copy(a).addScaledVector(ab, t);
      _b.subVectors(p, closest);
      const dist = _b.length();
      if (dist < 0.125 && dist > 1e-5) p.copy(closest).addScaledVector(_b, 0.125 / dist);
    }
  }

  // Each bone takes the rotation carrying its rest cloth frame onto the live one (chest space),
  // expressed relative to its parent bone up the column.
  writeBones() {
    this.rig.chest.getWorldQuaternion(_qc).invert();
    for (let c = 0; c < this.cols; c++) {
      _qp.identity();
      const col = this.bones[c];
      for (let k = 0; k < col.length; k++) {
        this.frame(this.p, c, k, _q).premultiply(_qc).multiply(this.restInv[c][k]);
        col[k].quaternion.copy(_qi.copy(_qp).invert().multiply(_q));
        _qp.copy(_q);
      }
    }
  }
}
