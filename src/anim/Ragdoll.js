// A ragdoll built from a rig's own skeleton, at the moment it dies: a ball at each joint, joined
// by rods the length of its bones; the torso, the head, the shins with their feet (and anything
// big in a fist) stiff pieces kept in shape by shape matching, with more balls on their real
// outline so armour, bellies and crests lie on the ground instead of sinking into it. Joints are
// limited among the balls themselves — a knee folds one way and splays only so far, a hip swings
// only so far up, out and back, a spine bends and twists a little, a head turns and tips only so
// far — so the physics never asks for a pose the skeleton can't take. The balls fall (Verlet),
// are kicked the way the blow came, collide with the ground and the world's colliders and props
// with friction, and settle. The bones take only rotations from them — stiff pieces turned as
// their balls have turned, limbs aimed at the next joint, elbows as hinges — so nothing stretches.
//   anim/Animator.js humanoidRagdoll, anim/LegAnimator.js legRagdoll / hoverRagdoll build one.
import * as THREE from 'three';

const GRAVITY = 16;
const STEP = 1 / 60;
const MAX_STEPS = 6;       // per frame (far-off bodies are animated rarely, with a long step)
const ITERATIONS = 8;
const FRICTION = 0.3;      // share of its sliding speed a joint on the ground loses each step
const DRAG = 0.003;
const STICK = 0.25;        // m/s: a joint sliding slower than this on the ground stops
const SLEEP_MOVE = 0.025;  // m: moved less than this in SLEEP_TIME and it lies still
const SLEEP_TIME = 0.5;
const SETTLE_FROM = 1.2;   // s after death the motion starts dying away…
const SETTLE_DRAG = 0.12;  // …to this much lost each step, two seconds on
const REST_BY = 6;         // s: lying still by now, whatever (corpses fade from 8 s)

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _q4 = new THREE.Quaternion();
const _qp = new THREE.Quaternion();
const _pv = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _foot = new THREE.Vector3();
const _from = new THREE.Vector3();
const _s = new THREE.Vector3();
const _A = new Float64Array(9);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// An orthonormal frame (columns: side, up, forward) from an up direction and a rough side one.
// (Its own scratch: callers hand it the shared ones.)
const _fu = new THREE.Vector3();
const _fs = new THREE.Vector3();
const _ff = new THREE.Vector3();
function frame(up, side, out) {
  _fu.copy(up).normalize();
  _fs.copy(side).addScaledVector(_fu, -side.dot(_fu));
  if (_fs.lengthSq() < 1e-10) _fs.set(1, 0, 0).addScaledVector(_fu, -_fu.x);
  _fs.normalize();
  _ff.crossVectors(_fs, _fu);
  return out.makeBasis(_fs, _fu, _ff);
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

// ---------------------------------------------------------------- the body's outline
// For each mesh of a model (shared by every clone of it), per bone: its surface thinned out to a
// point every OUTLINE_CELL or so, and the vertices standing out furthest along 26 directions — in
// the bone's frame for skinned meshes (by the bone each vertex follows most), in the mesh's own
// for pieces parented to a bone. Bodies are shaped by these, not by the joints alone, so armour,
// bellies and skirts rest on the ground rather than sinking into it.
const OUTLINE_CELL = 0.09;
const DIRS = [];
for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
  if (x || y || z) DIRS.push(new THREE.Vector3(x, y, z).normalize());
}
const outlines = new WeakMap();
function outlineOf(mesh) {
  let out = outlines.get(mesh.geometry);
  if (out) return out;
  out = new Map(); // bone index (-1: rigid) → Float32Array of points (xyz)
  const g = mesh.geometry;
  const pos = g.getAttribute('position');
  const si = mesh.isSkinnedMesh ? g.getAttribute('skinIndex') : null;
  const sw = mesh.isSkinnedMesh ? g.getAttribute('skinWeight') : null;
  // Picked as bound (the mesh's own frame), then only the picks are taken into their bones'.
  const per = new Map(); // bone → { score, at (extremes), cells: Map(key → xyz) }
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    let bone = -1;
    if (si) {
      let w = 0;
      for (let k = 0; k < 4; k++) if (sw.getComponent(i, k) > w) { w = sw.getComponent(i, k); bone = si.getComponent(i, k); }
    }
    let b = per.get(bone);
    if (!b) per.set(bone, (b = { score: new Float64Array(26).fill(-Infinity), at: new Float32Array(78), cells: new Map() }));
    for (let d = 0; d < 26; d++) {
      const D = DIRS[d];
      const sc = x * D.x + y * D.y + z * D.z;
      if (sc > b.score[d]) { b.score[d] = sc; b.at[d * 3] = x; b.at[d * 3 + 1] = y; b.at[d * 3 + 2] = z; }
    }
    const key = `${Math.floor(x / OUTLINE_CELL)},${Math.floor(y / OUTLINE_CELL)},${Math.floor(z / OUTLINE_CELL)}`;
    if (!b.cells.has(key)) b.cells.set(key, [x, y, z]);
  }
  const v = new THREE.Vector3();
  for (const [bone, b] of per) {
    const list = new Float32Array(78 + b.cells.size * 3);
    list.set(b.at);
    let k = 78;
    for (const c of b.cells.values()) { list[k++] = c[0]; list[k++] = c[1]; list[k++] = c[2]; }
    if (bone >= 0) {
      // Into the bone's frame, as bound.
      const toBone = new THREE.Matrix4().multiplyMatrices(mesh.skeleton.boneInverses[bone], mesh.bindMatrix);
      for (let j = 0; j < list.length; j += 3) v.fromArray(list, j).applyMatrix4(toBone).toArray(list, j);
    }
    out.set(bone, list);
  }
  outlines.set(mesh.geometry, out);
  return out;
}

// A skinned mesh cut from another (a severed limb's skin, bound to copies of its bones) takes its
// outline from it, without working it out again: `ids` maps the source skeleton's bone indices to
// the new one's.
// (No `ids`: the same skeleton — a body's mesh trimmed of what was cut off.)
export function inheritOutline(mesh, source, ids = null) {
  const from = outlineOf(source);
  if (!ids) { outlines.set(mesh.geometry, from); return; }
  const out = new Map();
  for (const [a, b] of ids) {
    const pts = from.get(a);
    if (pts) out.set(b, pts);
  }
  outlines.set(mesh.geometry, out);
}

// Works out a model's outlines ahead (a template, before any copy of it dies).
export function prepareRagdoll(model) {
  model.traverse((mesh) => {
    if (mesh.isMesh && !mesh.material?.isShaderMaterial && mesh.geometry?.getAttribute('position') && (!mesh.isSkinnedMesh || mesh.skeleton)) outlineOf(mesh);
  });
}

// World positions now of the outline candidates of the whole model, by the bone each moves with.
function outlineByBone(model) {
  const byBone = new Map();
  const add = (bone, p) => {
    let list = byBone.get(bone);
    if (!list) byBone.set(bone, (list = []));
    list.push(p);
  };
  model.updateWorldMatrix(true, true);
  model.traverse((mesh) => {
    if (!mesh.isMesh || mesh.material?.isShaderMaterial || !mesh.visible || !mesh.geometry?.getAttribute('position')) return;
    if (mesh.isSkinnedMesh) {
      if (!mesh.skeleton) return;
      for (const [bi, at] of outlineOf(mesh)) {
        const bone = mesh.skeleton.bones[bi];
        if (!bone) continue;
        for (let k = 0; k < at.length; k += 3) add(bone, new THREE.Vector3(at[k], at[k + 1], at[k + 2]).applyMatrix4(bone.matrixWorld));
      }
      return;
    }
    let b = mesh.parent;
    while (b && !b.isBone) b = b.parent;
    if (!b) return;
    const at = outlineOf(mesh).get(-1);
    if (at) for (let k = 0; k < at.length; k += 3) add(b, new THREE.Vector3(at[k], at[k + 1], at[k + 2]).applyMatrix4(mesh.matrixWorld));
  });
  return byBone;
}

// The way a limb along `line` folds, turned with it about frame `m`'s side axis (column 0) from
// `way` (a knee's forward when the leg hangs straight down); kept as it is where the limb points
// along that axis and the turn can't say.
const _sw = new THREE.Vector3();
const _sx = new THREE.Vector3();
function swungWay(way, m, line) {
  _sx.setFromMatrixColumn(m, 0);
  _sw.crossVectors(line, _sx);
  const len = _sw.length() / (line.length() || 1);
  const k = smoothstep(0.2, 0.5, len);
  if (k > 0) way.multiplyScalar(1 - k).addScaledVector(_sw.normalize(), k).normalize();
  return way;
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
    this.joints = [];
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
  // (Every ball of a group counts the same in it, so one at its edge touching the ground lifts and
  // turns the whole as much as one at its middle.)
  group(list) {
    const ids = [...new Set(list.filter((i) => i >= 0))];
    const P = this.points;
    const c = new THREE.Vector3();
    for (const i of ids) c.add(P[i].p);
    c.divideScalar(ids.length);
    // Its weight shared out evenly, so the rods pulling on it see the same body.
    let m = 0;
    for (const i of ids) m += 1 / P[i].w;
    for (const i of ids) P[i].w = ids.length / m;
    const g = { ids, rest: ids.map((i) => P[i].p.clone().sub(c)), q: new THREE.Quaternion(), off: false };
    this.groups.push(g);
    return g;
  }

  // Keeps stiff piece `b` from turning against piece `a` about the line from ball `axis[0]` to
  // `axis[1]` (a spine, a neck) more than `max` radians either way from how they are now; each
  // piece's way round is the line between two of its balls (`sideA`, `sideB`).
  twist(a, b, axis, sideA, sideB, max) {
    if (!a || !b || [...axis, ...sideA, ...sideB].some((i) => i < 0)) return;
    const l = { kind: 5, a: axis[0], b: axis[1], ga: a, gb: b, axis, sideA, sideB, max, limb: false };
    l.rest = this.turn(l);
    this.links.push(l);
  }

  // How far piece gb is turned from piece ga about the twist's axis now (signed radians).
  turn(l) {
    const P = this.points;
    _v.subVectors(P[l.axis[1]].p, P[l.axis[0]].p).normalize();
    _a.subVectors(P[l.sideA[1]].p, P[l.sideA[0]].p);
    _a.addScaledVector(_v, -_a.dot(_v));
    _b.subVectors(P[l.sideB[1]].p, P[l.sideB[0]].p);
    _b.addScaledVector(_v, -_b.dot(_v));
    return Math.atan2(_c.crossVectors(_a, _b).dot(_v), _a.dot(_b));
  }

  // The outline candidates (world, as it stands now) of what moves with `bones`.
  outline(bones) {
    this.byBone ??= outlineByBone(this.model);
    const pts = [];
    for (const bone of bones) for (const p of this.byBone.get(bone) ?? []) pts.push(p);
    return pts;
  }

  // Balls on the outline of what moves with `bones` (a torso, a creature's body), where it stands
  // out furthest each way of `dirs` (in the model's frame), each `r` across and just inside the
  // surface; attached to `bone`. Put them in the bones' rigid group. Returns their indices.
  // After the extremes, up to `extra` more are spread over the rest of the outline, each as far
  // from those already placed as it can be, until none of it is more than `gap` (model units)
  // from one (a long abdomen, a shell's flanks, a skirt).
  // `seeds` (world points: balls already there, a joint) count as placed but aren't added.
  shell(bones, dirs, r, bone, extra = 0, gap = 0.2, seeds = []) {
    const pts = this.outline(bones);
    if (!pts.length) return [];
    const q = this.model.getWorldQuaternion(_q);
    const radius = r * this.scale * this.size;
    const chosen = [...seeds];
    for (const d of dirs) {
      _v.copy(d).normalize().applyQuaternion(q);
      let top = -Infinity;
      let at = null;
      for (const p of pts) {
        const sc = p.dot(_v);
        if (sc > top) { top = sc; at = p; }
      }
      if (!chosen.includes(at)) chosen.push(at);
    }
    for (let k = 0; k < extra; k++) {
      let far = 0;
      let at = null;
      for (const p of pts) {
        let near = Infinity;
        for (const c of chosen) near = Math.min(near, p.distanceToSquared(c));
        if (near > far) { far = near; at = p; }
      }
      if (!at || far < (Math.max(radius * 2, gap * this.scale * this.size)) ** 2) break;
      chosen.push(at);
    }
    // Each just inside the surface: in from it toward the middle of the outline.
    const mid = new THREE.Vector3();
    for (const p of pts) mid.add(p);
    mid.divideScalar(pts.length);
    return chosen.slice(seeds.length).map((p) => {
      _w.subVectors(mid, p);
      const len = _w.length();
      _w.multiplyScalar(len > radius ? radius / len : 0).add(p);
      return this.point(bone, bone.worldToLocal(_w.clone()), r);
    });
  }

  // A ball at the far end of what moves with `bone` alone, the way `dir` (in the bone's frame)
  // points: a fist's knuckles, the toe of a boot, a paw, a robe's hem. -1 if it has nothing on it
  // reaching further than `min` (model units) from the bone.
  tip(bone, dir, r, min = 0, of = [bone]) {
    const pts = this.outline(of);
    if (!pts.length) return -1;
    bone.updateWorldMatrix(true, false);
    _v.copy(dir).normalize().transformDirection(bone.matrixWorld);
    bone.getWorldPosition(_w);
    let top = -Infinity;
    let at = null;
    for (const p of pts) {
      const sc = _a.subVectors(p, _w).dot(_v);
      if (sc > top) { top = sc; at = p; }
    }
    const radius = r * this.scale * this.size;
    if (top < min * this.scale + radius) return -1;
    _a.copy(at).addScaledVector(_v, -radius);
    return this.point(bone, bone.worldToLocal(_a.clone()), r);
  }

  // A stiff part on a ball joint at ball `from` (a head on its neck, a robe from a body): a pivot
  // ball there, balls on the outline of what moves with `of`, and balls at its far end (`axis`,
  // the bone's frame) and its two sides (± `side`) — the frame its bone is turned by (call
  // drive(bone, 'frame', pivot, end, { side: [right, left] }) in its place among the drives).
  piece(bone, of, from, axis, side, r, extra = 8, gap = 0.15) {
    const pivot = this.point(bone, null, r);
    this.joint(from, pivot);
    const end = this.tip(bone, axis, r, 0, of);
    const left = this.tip(bone, side, r, 0, of);
    const right = this.tip(bone, side.clone().negate(), r, 0, of);
    const all = [pivot, end, left, right, ...this.shell(of, [], r, bone, extra, gap)].filter((i) => i >= 0);
    const group = this.group(all);
    return { pivot, end, left, right, all, group, ok: end >= 0 && left >= 0 && right >= 0 && left !== right };
  }

  // Grows ball i (at the root of `bone`) to the thickness of what moves with the bone round the
  // line from it to ball j (a pauldron, a heavy forearm, a haunch), up to `max` model units.
  thick(i, bone, j, max) {
    if (i < 0 || j < 0) return;
    const pt = this.points[i];
    const a = pt.p;
    _v.subVectors(this.points[j].p, a);
    const len2 = _v.lengthSq();
    let far = 0;
    for (const p of this.outline([bone])) {
      const t = len2 > 1e-10 ? clamp(_w.subVectors(p, a).dot(_v) / len2, 0, 1) : 0;
      far = Math.max(far, _w.copy(a).addScaledVector(_v, t).distanceTo(p));
    }
    const r = Math.min(far * 0.9, max * this.scale * this.size);
    if (r > pt.r) {
      pt.r = r;
      pt.w = 1 / (r * r * 100);
    }
  }

  // A ball joint: two balls (of two stiff pieces) kept together, solved after everything else.
  joint(a, b) {
    if (a < 0 || b < 0) return;
    this.link(a, b);
    this.joints.push(this.links.at(-1));
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
  // `swing`: the way it folds turns with the limb as it swings about the frame's side (a knee
  // faces forward standing, up with the thigh raised).
  hinge(a, b, c, fr, dir, spread = 1.0, swing = false) {
    if (a < 0 || b < 0 || c < 0) return;
    this.links.push({ kind: 3, a, b, c, fr, dir: dir.clone(), cos: Math.cos(spread), sin: Math.sin(spread), swing, limb: false });
  }

  // Keeps ball b no further than `min` (model units, negative: behind) along `dir` (in the frame
  // of balls `fr`) from ball a: how far back a hip lets its thigh go.
  reach(a, b, fr, dir, min) {
    if (a < 0 || b < 0) return;
    this.links.push({ kind: 4, a, b, fr, dir: dir.clone(), len: min * this.scale, limb: false });
  }

  // Lets the joint at b bend at most `max` radians from straight (a, b and c along the limb): its
  // ends kept at least that far apart.
  bend(a, b, c, max) {
    if (a < 0 || b < 0 || c < 0) return;
    const P = this.points;
    const l1 = P[a].p.distanceTo(P[b].p);
    const l2 = P[b].p.distanceTo(P[c].p);
    const min = Math.sqrt(Math.max(0, l1 * l1 + l2 * l2 + 2 * l1 * l2 * Math.cos(max)));
    this.links.push({ a, b: c, len: Math.min(min, P[a].p.distanceTo(P[c].p)), stiff: 1, kind: 1, limb: false });
  }

  // Lets two balls' distance range between lo and hi times what it is now (a spine that bends).
  range(a, b, lo, hi) {
    if (a < 0 || b < 0) return;
    const len = this.points[a].p.distanceTo(this.points[b].p);
    this.links.push({ a, b, len: len * lo, hi: len * hi, stiff: 1, kind: 2, limb: false });
  }

  // How a bone takes its rotation from the balls (in parent-before-child order):
  //   root   a frame from up = from→to and side = side[0]→side[1] — or, given `group`, turned as
  //          that stiff piece has turned; also placed at `from`
  //   frame  the same, for a bone further in (the chest with its block), capped at `cone`
  //   aim    turned the least way to point from→to, capped at `cone` from how it stood
  //   limb   aimed, and turned about itself so it bends toward `bend` (its frame) where the next
  //          bone (to→next) goes
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
      if (!o.group) d.M0 = frame(_v.subVectors(P[to].p, P[from].p), _w.subVectors(P[o.side[1]].p, P[o.side[0]].p), new THREE.Matrix4());
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
    this.byBone = null;
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
      _c.set(0, 0, 0);
      for (const r of g.rest) _c.add(r);
      _c.divideScalar(g.rest.length);
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
      if (!this.placed && world?.move) this.unstick(world);
      if (world?.collidersNear) {
        let x0 = Infinity; let x1 = -Infinity; let z0 = Infinity; let z1 = -Infinity;
        for (const pt of this.points) {
          x0 = Math.min(x0, pt.p.x); x1 = Math.max(x1, pt.p.x);
          z0 = Math.min(z0, pt.p.z); z1 = Math.max(z1, pt.p.z);
        }
        // (Bounded, should anything ever fly apart.)
        near = world.collidersNear((x0 + x1) / 2, (z0 + z1) / 2, Math.min(Math.hypot(x1 - x0, z1 - z0) / 2 + 1, 12 * this.size));
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
        if ((moved < SLEEP_MOVE * this.scale * this.size && this.time > 1) || this.time > REST_BY) this.asleep = true;
        this.points.forEach((pt, i) => this.mark[i].copy(pt.p));
        this.still = 0;
      }
    }
    this.pose();
  }

  // Limbs alive can reach through a wall or into a crate (the animation doesn't look); a body
  // that dies like that has each joint brought back to its own side, swept out from the middle of
  // the body (its first ball) to where the joint is, stopping where the world's colliders do.
  unstick(world) {
    this.placed = true;
    const P = this.points;
    const mid = P[0].p;
    for (const pt of P) {
      if (pt.off || pt === P[0]) continue;
      _foot.set(mid.x, pt.p.y - pt.r * 0.7, mid.z);
      world.move(_foot, pt.p.x - mid.x, pt.p.z - mid.z, pt.r, 0, pt.r * 1.4);
      _v.set(_foot.x - pt.p.x, 0, _foot.z - pt.p.z);
      if (_v.lengthSq() < 1e-6) continue;
      pt.p.add(_v);
      pt.q.add(_v);
    }
  }

  step(world, near, ground) {
    const P = this.points;
    // Once the fall is over, what's left of the motion dies away (joints pressed against each
    // other and the ground would otherwise tremble on).
    const drag = DRAG + SETTLE_DRAG * smoothstep(SETTLE_FROM, SETTLE_FROM + 2, this.time);
    for (const pt of P) {
      if (pt.off) continue;
      _v.subVectors(pt.p, pt.q).multiplyScalar(1 - drag);
      pt.q.copy(pt.p);
      pt.p.add(_v);
      pt.p.y -= GRAVITY * STEP * STEP;
    }
    for (let it = 0; it < ITERATIONS; it++) {
      this.solveGroups();
      this.solveLinks();
      if (it % 2 === 1) this.collide(world, near, ground, it === ITERATIONS - 1);
    }
  }

  // Shape matching: the rotation that best carries each group's rest shape onto where its balls
  // are (found by turning toward it a few times, from last step's), then the balls onto that.
  solveGroups() {
    const P = this.points;
    for (const g of this.groups) {
      if (g.off) continue;
      _c.set(0, 0, 0);
      for (const i of g.ids) _c.add(P[i].p);
      _c.divideScalar(g.ids.length);
      // A = Σ (p − c) restᵀ, by columns.
      const A = _A;
      A.fill(0);
      g.ids.forEach((i, j) => {
        const r = g.rest[j];
        const dx = P[i].p.x - _c.x;
        const dy = P[i].p.y - _c.y;
        const dz = P[i].p.z - _c.z;
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
    this.solve(this.links);
    // Ball joints last, so a piece stays on its socket whatever else tugs at it.
    this.solve(this.joints);
  }

  solve(links) {
    const P = this.points;
    for (const l of links) {
      const a = P[l.a];
      const b = P[l.b];
      if (a.off || b.off) continue;
      if (l.kind === 5) {
        this.solveTwist(l);
        continue;
      }
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

  // A twist limit (kind 5): past it, both pieces are turned back about the axis, half each.
  solveTwist(l) {
    if (l.ga.off || l.gb.off) return;
    let d = this.turn(l) - l.rest;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    if (Math.abs(d) <= l.max) return;
    const over = d - Math.sign(d) * l.max;
    const P = this.points;
    _v.subVectors(P[l.axis[1]].p, P[l.axis[0]].p).normalize();
    // (A copy: the pivot can be one of the balls being turned.)
    const pivot = _pv.copy(P[l.axis[0]].p);
    const spin = (g, angle) => {
      _q.setFromAxisAngle(_v, angle);
      for (const i of g.ids) P[i].p.sub(pivot).applyQuaternion(_q).add(pivot);
    };
    spin(l.gb, -over / 2);
    spin(l.ga, over / 2);
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
      if (l.swing) swungWay(_c, _m, _v.subVectors(c.p, a.p));
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
      const r = (a.r + b.r) / 2;
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

  // The bones from the balls: rotations only (the root bone also placed), parents first.
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
        if (d.group && !d.group.off) {
          // A stiff piece: turned just as its balls have turned since (the shape match's own).
          _q.copy(d.group.q).multiply(d.Q0);
        } else {
          frame(_v, _w.subVectors(P[d.side[1]].p, P[d.side[0]].p), _m);
          _m2.copy(d.M0).transpose();
          _m.multiply(_m2);
          _q.setFromRotationMatrix(_m).multiply(d.Q0);
        }
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
              _a.copy(d.refDir).applyMatrix4(_m);
              if (d.refSwing) swungWay(_a.negate(), _m, _c.subVectors(P[d.to].p, P[d.from].p)).negate();
              _a.applyQuaternion(_qp);
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

// ---------------------------------------------------------------- a part on its own
// A severed limb, a head, a beast's leg (entities/Dismemberment.js), on the bones it took with it
// (`root` and its bones, under `model`): each bone a stiff piece with balls over what moves with
// it, on ball joints to the next, bending at each only so far — an arm folds at the elbow and the
// wrist, a leg at the knee. A foot, a skull or a jaw stays stiff on the bone before it.
const STIFF = /foot|skull|jaw/;
export function partRagdoll(model, root, size, velocity, spin) {
  const rd = new Ragdoll(model, size);
  const kids = (b) => b.children.filter((c) => c.isBone);
  // The pieces, parents first.
  const segs = [];
  const visit = (bone, parent) => {
    let seg = parent;
    if (!(parent && !kids(bone).length && STIFF.test(bone.name))) {
      seg = { bones: [bone], parent, children: [] };
      parent?.children.push(seg);
      segs.push(seg);
    } else seg.bones.push(bone);
    for (const c of kids(bone)) visit(c, seg);
  };
  visit(root, null);
  const r = 0.045;
  for (const seg of segs) seg.origin = rd.point(seg.bones[0], null, r);
  for (const seg of segs) {
    // Where each piece after it hangs on: a ball of this one, at that joint.
    seg.ends = seg.children.map((c) => rd.point(seg.bones[0], seg.bones[0].worldToLocal(rd.points[c.origin].p.clone()), r));
    if (seg.children.length) rd.thick(seg.origin, seg.bones[0], seg.children[0].origin, 0.16);
    const seeds = [seg.origin, ...seg.ends].map((i) => rd.points[i].p);
    seg.shell = rd.shell(seg.bones, [], r, seg.bones[0], 8, 0.1, seeds);
    const all = [seg.origin, ...seg.ends, ...seg.shell];
    // (A bone with nothing on it still needs a second ball to turn by.)
    if (all.length < 2) all.push(rd.point(seg.bones[0], new THREE.Vector3(0, -0.05, 0), r));
    seg.all = all;
    seg.group = rd.group(all);
  }
  for (const seg of segs) {
    seg.children.forEach((c, k) => rd.joint(seg.ends[k], c.origin));
    if (!seg.parent) continue;
    // Bends at most so far from straight: measured to the far end of this piece.
    const far = seg.ends[0] ?? seg.all.reduce((a, b) => (rd.points[b].p.distanceTo(rd.points[seg.origin].p) > rd.points[a].p.distanceTo(rd.points[seg.origin].p) ? b : a));
    if (far !== seg.origin) rd.bend(seg.parent.origin, seg.origin, far, 2.3);
  }
  for (const seg of segs) {
    for (const bone of seg.bones) rd.drive(bone, bone === root ? 'root' : 'frame', seg.origin, seg.all[1], { group: seg.group });
  }
  // Thrown, and turning end over end (the far pieces flung one way, the root the other).
  const tips = segs.filter((g) => !g.children.length).flatMap((g) => g.all);
  rd.start(velocity, spin, tips);
  return rd;
}