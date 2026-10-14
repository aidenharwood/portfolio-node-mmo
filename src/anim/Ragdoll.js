// A ragdoll built from a rig's own skeleton, at the moment it dies: a ball at each joint (and at
// the ends that touch things — the top of the head, the toes), joined by rods the length of its
// bones, braced across the torso so that stays one piece, and kept from folding past what joints
// do. The balls fall under gravity (Verlet), are kicked by the killing blow, roll against the
// ground and the world's colliders with friction, and come to rest. Joints are limited among the
// balls themselves (a knee only folds one way of the pelvis, a hip only reaches so far back, a
// spine and a neck bend only so far), so the physics never asks for a pose the skeleton can't
// take. The bones then take only rotations from them — the pelvis's frame, each limb aimed at the
// next joint, knees and elbows as hinges, twists limited — so nothing stretches.
//   anim/Animator.js humanoidRagdoll, anim/LegAnimator.js legRagdoll / hoverRagdoll build one.
import * as THREE from 'three';

const GRAVITY = 16;
const STEP = 1 / 60;
const MAX_STEPS = 6;       // per frame (far-off bodies are animated rarely, with a long step)
const ITERATIONS = 8;
const FRICTION = 0.3;      // share of its sliding speed a joint on the ground loses each step
const DRAG = 0.003;
const STICK = 0.25;          // m/s: a joint sliding slower than this on the ground stops
const SLEEP_MOVE = 0.025;  // m: moved less than this in SLEEP_TIME and it lies still
const SLEEP_TIME = 0.5;

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _q3 = new THREE.Quaternion();
const _q4 = new THREE.Quaternion();
const _qp = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _foot = new THREE.Vector3();
const _from = new THREE.Vector3();
const _s = new THREE.Vector3();
const _A = new Float64Array(9);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// An orthonormal frame (columns: side, up, forward) from an up direction and a rough side one.
function frame(up, side, out) {
  _a.copy(up).normalize();
  _b.copy(side).addScaledVector(_a, -side.dot(_a));
  if (_b.lengthSq() < 1e-10) _b.set(1, 0, 0).addScaledVector(_a, -_a.x);
  _b.normalize();
  _c.crossVectors(_b, _a);
  return out.makeBasis(_b, _a, _c);
}

// What's left of rotation `q` once its angle from `rest` is capped at `max`.
function capAngle(q, rest, max) {
  const angle = rest.angleTo(q);
  if (angle > max) {
    _q4.copy(q);
    q.copy(rest).slerp(_q4, max / angle);
  }
  return q;
}

// Limits the twist of local rotation `q` about bone-local axis `axis`, measured from `rest`.
function capTwist(q, rest, axis, max) {
  _q.copy(rest).invert().multiply(q);              // delta from rest
  const d = _q.x * axis.x + _q.y * axis.y + _q.z * axis.z;
  _q2.set(axis.x * d, axis.y * d, axis.z * d, _q.w);
  const len = Math.hypot(_q2.x, _q2.y, _q2.z, _q2.w);
  if (len < 1e-9) return q;
  _q2.x /= len; _q2.y /= len; _q2.z /= len; _q2.w /= len;  // the twist part of the delta
  const angle = 2 * Math.acos(clamp(Math.abs(_q2.w), 0, 1));
  if (angle <= max) return q;
  const swing = _q3.copy(_q).multiply(_q4.copy(_q2).invert());
  _q2.slerp(_q4.identity(), 1 - max / angle);
  q.copy(rest).multiply(swing).multiply(_q2);
  return q;
}

export class Ragdoll {
  // `model`: the rig's root object (its bones' frames are read from it as it stands now).
  // `size`: how big the body is against a person's (balls and the stillness it rests at grow
  // with it).
  constructor(model, size = 1) {
    this.model = model;
    model.updateWorldMatrix(true, true);
    this.scale = model.getWorldScale(new THREE.Vector3()).y;
    this.size = size;
    this.points = [];
    this.links = [];
    this.drives = [];
    this.groups = [];
    this.asleep = false;
    this.still = 0;
    this.time = 0;
    this.carry = 0;
    this.severedCount = 0;
  }

  // A ball at a bone's origin, or at `offset` in the bone's frame. `r` in model units.
  point(bone, offset = null, r = 0.08) {
    const p = new THREE.Vector3();
    if (offset) bone.localToWorld(p.copy(offset));
    else bone.getWorldPosition(p);
    const radius = r * this.scale * this.size;
    this.points.push({ bone, offset: offset ? offset.clone() : null, r: radius, w: 1 / (radius * radius * 100), p, q: p.clone(), off: false });
    return this.points.length - 1;
  }

  // Balls that move as one rigid piece (a torso, a pelvis): each step they're put back in the
  // shape they have now, wherever and however turned the rest have pushed them.
  group(list) {
    const ids = list.filter((i) => i >= 0);
    const P = this.points;
    let m = 0;
    const c = new THREE.Vector3();
    for (const i of ids) { c.addScaledVector(P[i].p, 1 / P[i].w); m += 1 / P[i].w; }
    c.divideScalar(m);
    this.groups.push({ ids, rest: ids.map((i) => P[i].p.clone().sub(c)), q: new THREE.Quaternion(), off: false });
  }

  // A rod between two balls at their distance now (`stiff` < 1 gives a little).
  link(a, b, stiff = 1, limb = false) {
    if (a < 0 || b < 0) return;
    this.links.push({ a, b, len: this.points[a].p.distanceTo(this.points[b].p), stiff, kind: 0, limb });
  }

  // Keeps two balls at least `frac` of their distance now apart (or `min` model units).
  apart(a, b, frac, min = 0) {
    if (a < 0 || b < 0) return;
    const len = Math.max(frac * this.points[a].p.distanceTo(this.points[b].p), min * this.scale);
    this.links.push({ a, b, len, stiff: 1, kind: 1, limb: false });
  }

  // Keeps ball b bent out from the line a→c within `spread` radians of `dir` (a direction in the
  // frame of balls `fr`: [up from, up to, side from, side to] — side, up, forward): a knee in
  // front of its hip and ankle, so the leg folds the way a knee does and splays only so far.
  // `like` ([a, b, c] of another joint) takes the way that joint bends instead, wherever it bends
  // enough to say: a foot points the way its knee does.
  hinge(a, b, c, fr, dir, spread = 1.0, like = null) {
    if (a < 0 || b < 0 || c < 0) return;
    this.links.push({ kind: 3, a, b, c, fr, dir: dir.clone(), cos: Math.cos(spread), sin: Math.sin(spread), like, limb: false });
  }

  // Keeps ball b no further than `min` (model units, negative: behind) along `dir` (in the frame
  // of balls `fr`) from ball a: how far back a hip lets its thigh go.
  reach(a, b, fr, dir, min) {
    if (a < 0 || b < 0) return;
    this.links.push({ kind: 4, a, b, fr, dir: dir.clone(), len: min * this.scale, limb: false });
  }

  // Lets two balls' distance range between lo and hi times what it is now (a spine that bends).
  range(a, b, lo, hi) {
    if (a < 0 || b < 0) return;
    const len = this.points[a].p.distanceTo(this.points[b].p);
    this.links.push({ a, b, len: len * lo, hi: len * hi, stiff: 1, kind: 2, limb: false });
  }

  // How a bone takes its rotation from the balls (in parent-before-child order):
  //   root   a frame from up = from→to and side = side[0]→side[1]; also placed at `from`
  //   frame  the same, for a bone further in (the chest from its shoulders), capped at `cone`
  //   aim    turned the least way to point from→to, capped at `cone` from how it stood
  //   limb   aimed, and turned about itself so it bends toward `bend` (its frame) where the next
  //          bone (to→next) goes; its twist capped at `twist`
  //   hinge  a rotation about one axis only (rest × `bend`, in its parent's frame), lo…hi radians
  drive(bone, type, from, to, o = {}) {
    if (!bone || from < 0 || to < 0) return null;
    const P = this.points;
    const d = { bone, type, from, to, ...o, L: bone.quaternion.clone(), L0: bone.quaternion.clone(), off: false };
    bone.updateWorldMatrix(true, false);
    _v.copy(P[to].p);
    _w.copy(P[from].p);
    bone.worldToLocal(_v);
    bone.worldToLocal(_w);
    d.rest = _v.sub(_w).normalize().clone();
    if (type === 'root' || type === 'frame') {
      d.Q0 = bone.getWorldQuaternion(new THREE.Quaternion());
      d.M0 = frame(_v.subVectors(P[to].p, P[from].p), _w.subVectors(P[o.side[1]].p, P[o.side[0]].p), new THREE.Matrix4());
      d.pos0 = bone.position.clone();
    }
    if (type === 'limb' || type === 'hinge') {
      d.bend = o.bend.clone().addScaledVector(d.rest, -o.bend.dot(d.rest)).normalize();
      d.axis = new THREE.Vector3().crossVectors(d.rest, d.bend).normalize();
    }
    this.drives.push(d);
    return d;
  }

  // Sets it moving: every ball at `velocity`, and `kick` added to the balls listed in `kicked`.
  start(velocity, kick = null, kicked = []) {
    for (const pt of this.points) pt.q.copy(pt.p).addScaledVector(velocity, -STEP);
    if (kick) for (const i of kicked) if (i >= 0) this.points[i].q.addScaledVector(kick, -STEP);
  }

  // Takes out the balls (and what hangs on them) of bones that are gone: a severed limb's.
  sever(bones) {
    if (!bones.size) return;
    const under = (bone) => { for (let b = bone; b; b = b.parent) if (bones.has(b)) return true; return false; };
    for (const pt of this.points) if (!pt.off && under(pt.bone)) pt.off = true;
    for (const g of this.groups) {
      const keep = g.ids.map((i, j) => [i, g.rest[j]]).filter(([i]) => !this.points[i].off);
      g.ids = keep.map(([i]) => i);
      g.rest = keep.map(([, r]) => r);
      if (g.ids.length < 2) { g.off = true; continue; }
      // The shape about its own middle again.
      let m = 0;
      _c.set(0, 0, 0);
      g.ids.forEach((i, j) => { const k = 1 / this.points[i].w; _c.addScaledVector(g.rest[j], k); m += k; });
      _c.divideScalar(m);
      for (const r of g.rest) r.sub(_c);
    }
    for (const d of this.drives) if (!d.off && under(d.bone)) d.off = true;
  }

  // world: { supportHeight(x, z, maxY, ceilFrom, near), resolve(...), collidersNear(x, z, r) }
  // (World), or null with `ground(x, z)` for bare terrain.
  update(dt, world, ground = null) {
    this.time += dt;
    // Shrinking away (a corpse fading out): it lies as it is.
    this.model.updateWorldMatrix(true, false);
    const scale = this.model.getWorldScale(_s).y;
    if (Math.abs(scale - this.scale) > this.scale * 0.02) this.asleep = true;
    if (!this.asleep) {
      this.carry = Math.min(this.carry + dt, MAX_STEPS * STEP);
      let near = null;
      if (world?.collidersNear) {
        let x0 = Infinity; let x1 = -Infinity; let z0 = Infinity; let z1 = -Infinity;
        for (const pt of this.points) {
          x0 = Math.min(x0, pt.p.x); x1 = Math.max(x1, pt.p.x);
          z0 = Math.min(z0, pt.p.z); z1 = Math.max(z1, pt.p.z);
        }
        near = world.collidersNear((x0 + x1) / 2, (z0 + z1) / 2, Math.hypot(x1 - x0, z1 - z0) / 2 + 1);
      }
      while (this.carry >= STEP) {
        this.carry -= STEP;
        this.step(world, near, ground);
      }
      // At rest when, over a while, nothing has got anywhere (settling joints still tremble a
      // little against each other, back and forth).
      this.still += dt;
      if (!this.mark) this.mark = this.points.map((pt) => pt.p.clone());
      if (this.still >= SLEEP_TIME) {
        let moved = 0;
        this.points.forEach((pt, i) => { if (!pt.off) moved = Math.max(moved, pt.p.distanceTo(this.mark[i])); });
        if (moved < SLEEP_MOVE * this.scale * this.size && this.time > 1) this.asleep = true;
        this.points.forEach((pt, i) => this.mark[i].copy(pt.p));
        this.still = 0;
      }
    }
    this.pose();
  }

  step(world, near, ground) {
    const P = this.points;
    for (const pt of P) {
      if (pt.off) continue;
      _v.subVectors(pt.p, pt.q).multiplyScalar(1 - DRAG);
      pt.q.copy(pt.p);
      pt.p.add(_v);
      pt.p.y -= GRAVITY * STEP * STEP;
    }
    for (let it = 0; it < ITERATIONS; it++) {
      this.solveGroups();
      this.solveLinks();
      if (it === ITERATIONS / 2 - 1 || it === ITERATIONS - 1) this.collide(world, near, ground, it === ITERATIONS - 1);
    }
  }

  // Shape matching: the rotation that best carries each group's rest shape onto where its balls
  // are (found by turning toward it a few times, from last step's), then the balls onto that.
  solveGroups() {
    const P = this.points;
    for (const g of this.groups) {
      if (g.off) continue;
      let m = 0;
      _c.set(0, 0, 0);
      for (const i of g.ids) { const k = 1 / P[i].w; _c.addScaledVector(P[i].p, k); m += k; }
      _c.divideScalar(m);
      // A = Σ m (p − c) restᵀ, by columns.
      const A = _A;
      A.fill(0);
      g.ids.forEach((i, j) => {
        const k = 1 / P[i].w;
        const r = g.rest[j];
        const dx = (P[i].p.x - _c.x) * k;
        const dy = (P[i].p.y - _c.y) * k;
        const dz = (P[i].p.z - _c.z) * k;
        A[0] += dx * r.x; A[1] += dy * r.x; A[2] += dz * r.x;
        A[3] += dx * r.y; A[4] += dy * r.y; A[5] += dz * r.y;
        A[6] += dx * r.z; A[7] += dy * r.z; A[8] += dz * r.z;
      });
      for (let it = 0; it < 6; it++) {
        _m.makeRotationFromQuaternion(g.q);
        const e = _m.elements;
        // ω = Σ rᵢ × aᵢ / |Σ rᵢ · aᵢ| over the columns i.
        let wx = 0; let wy = 0; let wz = 0; let dot = 0;
        for (let col = 0; col < 3; col++) {
          const rx = e[col * 4]; const ry = e[col * 4 + 1]; const rz = e[col * 4 + 2];
          const ax = A[col * 3]; const ay = A[col * 3 + 1]; const az = A[col * 3 + 2];
          wx += ry * az - rz * ay; wy += rz * ax - rx * az; wz += rx * ay - ry * ax;
          dot += rx * ax + ry * ay + rz * az;
        }
        const inv = 1 / (Math.abs(dot) + 1e-9);
        wx *= inv; wy *= inv; wz *= inv;
        const angle = Math.hypot(wx, wy, wz);
        if (angle < 1e-9) break;
        _v.set(wx / angle, wy / angle, wz / angle);
        g.q.premultiply(_q.setFromAxisAngle(_v, angle)).normalize();
      }
      g.ids.forEach((i, j) => P[i].p.copy(g.rest[j]).applyQuaternion(g.q).add(_c));
    }
  }

  solveLinks() {
    const P = this.points;
    for (const l of this.links) {
      const a = P[l.a];
      const b = P[l.b];
      if (a.off || b.off) continue;
      if (l.kind >= 3) {
        this.solveSide(l, a, b);
        continue;
      }
      _v.subVectors(b.p, a.p);
      const len = _v.length();
      if (len < 1e-9) continue;
      let target = l.len;
      if (l.kind === 1 && len >= l.len) continue;
      if (l.kind === 2) {
        if (len >= l.len && len <= l.hi) continue;
        if (len > l.hi) target = l.hi;
      }
      const k = ((len - target) / len) * l.stiff / (a.w + b.w);
      a.p.addScaledVector(_v, k * a.w);
      b.p.addScaledVector(_v, -k * b.w);
    }
  }

  // A hinge or reach limit (kinds 3 and 4): the frame's direction now, and how far b is short of
  // its side.
  solveSide(l, a, b) {
    const P = this.points;
    const f = l.fr;
    frame(_v.subVectors(P[f[1]].p, P[f[0]].p), _w.subVectors(P[f[3]].p, P[f[2]].p), _m);
    _c.copy(l.dir).applyMatrix4(_m).normalize();
    let short;
    if (l.kind === 3) {
      const c = P[l.c];
      if (c.off) return;
      if (l.like) {
        // The other joint's bend: its middle's offset from the line through its ends.
        const [ka, kb, kc] = l.like.map((i) => P[i].p);
        _v.subVectors(kc, ka);
        const n2 = _v.lengthSq();
        if (n2 > 1e-10) {
          _w.subVectors(kb, ka);
          _w.addScaledVector(_v, -_w.dot(_v) / n2);
          const k = smoothstep(0.03, 0.1, _w.length() / Math.sqrt(n2));
          if (k > 0) _c.multiplyScalar(1 - k).addScaledVector(_w.normalize(), k).normalize();
        }
      }
      // b's offset from the line a→c, and the allowed way across that line.
      _v.subVectors(c.p, a.p);
      const len2 = _v.lengthSq();
      if (len2 < 1e-10) return;
      const t = _w.subVectors(b.p, a.p).dot(_v) / len2;
      _w.addScaledVector(_v, -t);
      _c.addScaledVector(_v, -_c.dot(_v) / len2);
      const fl = _c.length();
      const off = _w.length();
      if (fl < 1e-6 || off < 1e-4) return;
      _c.divideScalar(fl);
      const along = _w.dot(_c);
      if (along >= off * l.cos) return;
      // Turned to the edge of the allowed spread, on the side it's leaning (or straight ahead).
      _a.copy(_w).addScaledVector(_c, -along);
      const lat = _a.length();
      if (lat > 1e-6) _a.divideScalar(lat);
      else _a.set(0, 0, 0);
      _b.copy(_c).multiplyScalar(off * l.cos).addScaledVector(_a, off * (lat > 1e-6 ? l.sin : 0)).sub(_w);
      // Mostly the middle joint moves; the ends give a little.
      const k = 1 / (b.w + (a.w + c.w) * 0.25);
      b.p.addScaledVector(_b, k * b.w);
      a.p.addScaledVector(_b, -k * a.w * 0.25);
      c.p.addScaledVector(_b, -k * c.w * 0.25);
      return;
    }
    short = l.len - _w.subVectors(b.p, a.p).dot(_c);
    if (short <= 0) return;
    const k = short / (a.w + b.w);
    b.p.addScaledVector(_c, k * b.w);
    a.p.addScaledVector(_c, -k * a.w);
  }

  // Each ball out of walls and props and onto what's under it; a ball resting on something loses
  // its fall and some of its slide. Rods along limbs are kept off the ground at their middles too.
  collide(world, near, ground, walls) {
    const P = this.points;
    for (const pt of P) {
      if (pt.off) continue;
      const r = pt.r;
      if (walls && world?.resolve) {
        _foot.set(pt.p.x, pt.p.y - r * 0.7, pt.p.z);
        _from.set(pt.q.x, pt.q.y - r * 0.7, pt.q.z);
        world.resolve(_foot, r, 0, r * 1.4, _from, 0, near ?? undefined);
        pt.p.x = _foot.x;
        pt.p.z = _foot.z;
      }
      const floor = this.floorAt(world, near, ground, pt.p.x, pt.p.z, Math.max(pt.p.y, pt.q.y) + r);
      if (pt.p.y - r < floor) {
        pt.p.y = floor + r;
        pt.q.y = pt.p.y;
        // Sliding slows; barely sliding, it sticks.
        const slide = Math.hypot(pt.p.x - pt.q.x, pt.p.z - pt.q.z);
        const keep = slide < STICK * STEP ? 0 : 1 - FRICTION;
        pt.q.x = pt.p.x - (pt.p.x - pt.q.x) * keep;
        pt.q.z = pt.p.z - (pt.p.z - pt.q.z) * keep;
      }
    }
    for (const l of this.links) {
      if (!l.limb) continue;
      const a = P[l.a];
      const b = P[l.b];
      if (a.off || b.off) continue;
      _v.addVectors(a.p, b.p).multiplyScalar(0.5);
      const r = Math.min(a.r, b.r);
      const floor = this.floorAt(world, near, ground, _v.x, _v.z, _v.y + r);
      const under = floor + r - _v.y;
      if (under > 0) {
        a.p.y += under;
        b.p.y += under;
        a.q.y = Math.max(a.q.y, a.p.y - 1e-4);
        b.q.y = Math.max(b.q.y, b.p.y - 1e-4);
      }
    }
  }

  floorAt(world, near, ground, x, z, maxY) {
    if (world?.supportHeight) return world.supportHeight(x, z, maxY, Infinity, near ?? undefined);
    return ground ? ground(x, z) : -Infinity;
  }

  // The bones from the balls, then the balls from the bones (so limits hold and nothing drifts).
  pose() {
    const P = this.points;
    this.model.updateWorldMatrix(true, false);
    for (const d of this.drives) {
      if (d.off) continue;
      const bone = d.bone;
      const parent = bone.parent;
      parent.updateWorldMatrix(true, false);
      parent.matrixWorld.decompose(_w, _qp, _s);
      _qp.invert();
      _v.subVectors(P[d.to].p, P[d.from].p);
      if (_v.lengthSq() < 1e-12) continue;
      if (d.type === 'root' || d.type === 'frame') {
        frame(_v, _w.subVectors(P[d.side[1]].p, P[d.side[0]].p), _m);
        _m2.copy(d.M0).transpose();
        _m.multiply(_m2);
        _q.setFromRotationMatrix(_m).multiply(d.Q0);
        d.L.copy(_qp).multiply(_q);
        if (d.type === 'frame' && d.cone) capAngle(d.L, d.L0, d.cone);
        if (d.type === 'root') parent.worldToLocal(bone.position.copy(P[d.from].p));
      } else {
        const dir = _v.normalize().applyQuaternion(_qp);    // where it should point, parent's frame
        if (d.type === 'hinge') {
          const along = dir.dot(d.rest);
          const across = dir.dot(d.bend);
          const angle = clamp(Math.atan2(across, along), d.lo ?? 0, d.hi ?? 2.6);
          d.L.setFromAxisAngle(d.axis, angle);
        } else {
          // Turn the least way from where it was.
          _a.copy(d.rest).applyQuaternion(d.L);
          _q.setFromUnitVectors(_a, dir);
          d.L.premultiply(_q);
          if (d.type === 'limb' && d.next >= 0 && !P[d.next].off) {
            // Bent: turned about itself so the knee or elbow folds the way it can. Straight, a limb
            // with a `ref` (a frame of balls and a direction in it: the pelvis's forward) turns
            // to fold that way, so its twist never wanders off while it's straight.
            _b.subVectors(P[d.next].p, P[d.to].p).normalize().applyQuaternion(_qp);
            _b.addScaledVector(dir, -_b.dot(dir));
            let k = smoothstep(0.03, 0.12, _b.length());
            if (k > 0) _b.normalize();
            if (d.ref && k < 1) {
              const f = d.ref;
              frame(_a.subVectors(P[f[1]].p, P[f[0]].p), _c.subVectors(P[f[3]].p, P[f[2]].p), _m);
              _a.copy(d.refDir).applyMatrix4(_m).applyQuaternion(_qp);
              _a.addScaledVector(dir, -_a.dot(dir));
              if (_a.lengthSq() > 1e-6) {
                _b.multiplyScalar(k).addScaledVector(_a.normalize(), 1 - k);
                if (_b.lengthSq() > 1e-8) { _b.normalize(); k = 1; }
              }
            }
            if (k > 0) {
              // Local (rest, bend) onto parent-frame (dir, bent way).
              _m.makeBasis(_c.crossVectors(d.rest, d.bend), d.rest, d.bend);
              _m2.makeBasis(_a.crossVectors(dir, _b), dir, _b);
              _m2.multiply(_m.transpose());
              _q2.setFromRotationMatrix(_m2);
              d.L.slerp(_q2, k);
            }
            if (d.twist !== undefined) capTwist(d.L, d.L0, d.rest, d.twist);
          }
          if (d.cone) capAngle(d.L, d.L0, d.cone);
        }
      }
      bone.quaternion.copy(d.L);
      bone.updateMatrixWorld(true);
    }
  }

  // Where it lies (the first ball, the pelvis or the body), for whoever wants to follow it.
  get centre() { return this.points[0]?.p; }
}

// How a body starts its fall: with the speed it had (`s.vx`, `s.vz` — an enemy's include the
// killing blow's knockback), and its upper body kicked the way the blow came (`s.deathKick`, a
// direction), or the way it was going, or anywhere — never quite straight, so no two fall alike.
export function deathKick(s) {
  const velocity = new THREE.Vector3(s.vx ?? 0, Math.max(0, s.vy ?? 0) * 0.5, s.vz ?? 0);
  if (velocity.length() > 10) velocity.setLength(10);
  const kick = new THREE.Vector3();
  const k = s.deathKick;
  const flat = Math.hypot(velocity.x, velocity.z);
  if (k && Math.hypot(k[0], k[2]) > 1e-3) kick.set(k[0], 0, k[2]).normalize().multiplyScalar(2.2);
  else if (flat > 0.5) kick.set(velocity.x / flat, 0, velocity.z / flat).multiplyScalar(1.6);
  else {
    const a = Math.random() * Math.PI * 2;
    kick.set(Math.sin(a), 0, Math.cos(a)).multiplyScalar(1.2);
  }
  kick.x += (Math.random() - 0.5) * 0.6;
  kick.z += (Math.random() - 0.5) * 0.6;
  return { velocity, kick };
}

// Takes a ragdoll's lost parts out of it (`ids`, combat/HitComponents.js; `boneOf` finds the bone
// each hangs from) when the list has grown.
export function severRagdoll(rd, ids, boneOf) {
  const n = ids?.length ?? 0;
  if (n === rd.severedCount) return;
  rd.severedCount = n;
  const bones = new Set();
  for (const id of ids ?? []) {
    const bone = boneOf(id);
    if (bone) bones.add(bone);
  }
  rd.sever(bones);
}
