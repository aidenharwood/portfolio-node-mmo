// Physical melee: a swing lands where the weapon's model meets a target's model. Each frame of a
// strike, points over the weapon's striking surface are traced from where they were last frame to
// where they are now, against the target's animated mesh (skinned here on the CPU, the gear it
// holds left out); the first crossing is the contact, and the anatomical component there
// (HitComponents.componentAtPoint, as for shots) is what takes the hit. No reach or arc check:
// what the blade passes through is hit, and nothing else.
// A strike can turn the weapon most of a radian in one frame, so the path between the two poses
// is stepped: the grip moves straight while the weapon turns about it, and the points sweep arcs
// rather than chords that cut inside them.
import * as THREE from 'three';
import { dealDamage } from './Damage.js';
import { componentAtPoint } from './HitComponents.js';

// Strike points: one per CELL-sized cube of the weapon's surface past the leading hand, grown
// coarser for big heads so a swing traces at most MAX_POINTS. Points are kept in runs of CHUNK
// along the weapon, each run tested against only the triangles its own sweep reaches.
const CELL = 0.07;
const MAX_POINTS = 96;
const CHUNK = 8;
// Each step of the path turns the weapon at most MAX_TURN radians.
const MAX_TURN = 0.12;
const MAX_STEPS = 24;

const _v = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _rel = new THREE.Matrix4();
const _inv = new THREE.Matrix4();
const _ab = new THREE.Vector3();
const _ac = new THREE.Vector3();
const _sphere = new THREE.Sphere();
const _closest = new THREE.Vector3();
const _p0 = new THREE.Vector3();
const _p1 = new THREE.Vector3();
const _s0 = new THREE.Vector3();
const _s1 = new THREE.Vector3();
const _q0 = new THREE.Quaternion();
const _q1 = new THREE.Quaternion();
const _q = new THREE.Quaternion();

// The weapon's striking surface as weapon-local points sorted along its length (cached on the
// model): { points: Float32Array xyz, count }.
export function strikePoints(model) {
  if (model.userData.strike) return model.userData.strike;
  model.updateWorldMatrix(true, true);
  _inv.copy(model.matrixWorld).invert();
  // Past the leading hand: what's in the fists (and between them, on a two-hander) isn't swung
  // into anything.
  const from = (model.userData.grip2?.local.z ?? 0) + 0.06;
  const tris = [];
  model.traverseVisible((o) => {
    const pos = o.isMesh && !o.material?.isShaderMaterial ? o.geometry?.attributes.position : null;
    if (!pos) return;
    _rel.multiplyMatrices(_inv, o.matrixWorld);
    const idx = o.geometry.index;
    const n = idx ? idx.count : pos.count;
    for (let i = 0; i + 2 < n; i += 3) {
      for (let k = 0; k < 3; k++) {
        _v.fromBufferAttribute(pos, idx ? idx.getX(i + k) : i + k).applyMatrix4(_rel);
        tris.push(_v.x, _v.y, _v.z);
      }
    }
  });
  let cell = CELL;
  let points = sample(tris, cell, from);
  while (points.length / 3 > MAX_POINTS) points = sample(tris, (cell *= 1.25), from);
  model.userData.strike = { points, count: points.length / 3 };
  return model.userData.strike;
}

// Samples every triangle at half-cell spacing and averages the samples in each cell.
function sample(tris, cell, from) {
  const cells = new Map();
  const step = cell * 0.5;
  for (let i = 0; i < tris.length; i += 9) {
    _a.fromArray(tris, i);
    _b.fromArray(tris, i + 3);
    _c.fromArray(tris, i + 6);
    if (Math.max(_a.z, _b.z, _c.z) < from) continue;
    _ab.subVectors(_b, _a);
    _ac.subVectors(_c, _a);
    const k = Math.max(1, Math.ceil(Math.max(_ab.length(), _ac.length(), _b.distanceTo(_c)) / step));
    for (let u = 0; u <= k; u++) {
      for (let w = 0; u + w <= k; w++) {
        _v.copy(_a).addScaledVector(_ab, u / k).addScaledVector(_ac, w / k);
        if (_v.z < from) continue;
        const key = ((Math.floor(_v.x / cell) + 512) * 1024 + Math.floor(_v.y / cell) + 512) * 4096 + Math.floor(_v.z / cell) + 512;
        let c = cells.get(key);
        if (!c) cells.set(key, (c = [0, 0, 0, 0]));
        c[0] += _v.x;
        c[1] += _v.y;
        c[2] += _v.z;
        c[3]++;
      }
    }
  }
  const list = [...cells.values()].map((c) => [c[0] / c[3], c[1] / c[3], c[2] / c[3]]).sort((p, q) => p[2] - q[2]);
  return Float32Array.from(list.flat());
}

// Follows a held weapon frame to frame and lands what it passes through.
export class WeaponSweep {
  constructor() {
    this.model = null;
    this.prev = new THREE.Matrix4();
    this.cur = new THREE.Matrix4();
    this.tracked = false;
    this.ready = false;
    this.path = new Float32Array(0); // strike points' world positions, step by step
  }

  // Forget the last pose (the wielder skipped frames: dead, teleported).
  reset() {
    this.tracked = false;
    this.ready = false;
  }

  // Call once a frame, after the wielder is posed: last frame's pose becomes the sweep's start.
  follow(model) {
    if (!model) { this.model = null; this.reset(); return; }
    model.updateWorldMatrix(true, false);
    this.ready = this.tracked && model === this.model;
    this.prev.copy(this.cur);
    this.cur.copy(model.matrixWorld);
    this.model = model;
    this.tracked = true;
  }

  // Hits every target (once a swing, via hitSet) the weapon passed through since last frame, at
  // the point it first met each, in the order it met them.
  strike(game, attacker, attack, targets, hitSet, weapon = null) {
    if (!this.ready) return;
    const { points, count } = strikePoints(this.model);
    this.prev.decompose(_p0, _q0, _s0);
    this.cur.decompose(_p1, _q1, _s1);
    const turn = 2 * Math.acos(Math.min(1, Math.abs(_q0.dot(_q1))));
    const steps = Math.min(MAX_STEPS, Math.max(1, Math.ceil(turn / MAX_TURN)));
    if (this.path.length < (steps + 1) * count * 3) this.path = new Float32Array((MAX_STEPS + 1) * count * 3);
    const path = this.path;
    for (let j = 0; j <= steps; j++) {
      const k = j / steps;
      _m.compose(_v.lerpVectors(_p0, _p1, k), _q.slerpQuaternions(_q0, _q1, k), _a.lerpVectors(_s0, _s1, k));
      for (let i = 0; i < count; i++) _b.fromArray(points, i * 3).applyMatrix4(_m).toArray(path, (j * count + i) * 3);
    }
    const contacts = [];
    for (const t of targets) {
      if (t === attacker || !t.alive || hitSet.has(t)) continue;
      const c = firstContact(t, path, steps, count);
      if (c) contacts.push(c);
    }
    contacts.sort((p, q) => p.time - q.time);
    for (const { target: t, point } of contacts) {
      hitSet.add(t);
      const dir = new THREE.Vector3(t.position.x - attacker.position.x, 0, t.position.z - attacker.position.z);
      if (dir.lengthSq() > 1e-6) dir.normalize();
      else attacker.forward(dir);
      dealDamage(game, {
        attacker, target: t, base: attack.damage, weapon, direction: dir,
        knockback: attack.knockback, poise: attack.poise, source: 'melee', attack,
        component: t.faction === 'enemy' ? componentAtPoint(t, point) : null, point,
        ...(weapon ? {} : { element: attack.element, inflict: attack.status ?? attack.element }),
      });
    }
  }
}

// ---------------------------------------------------------------- the target's surface
// Scratch buffers, grown as needed: world vertex positions (with the pass that last skinned each),
// bones' skinning matrices, and the triangles near the sweep (v0, edge1, edge2 — 9 floats each).
let _world = new Float32Array(0);
let _stamps = new Uint32Array(0);
let _stamp = 0;
let _boneM = new Float32Array(0);
let _tris = new Float32Array(0);
let _triCount = 0;
const _box = { min: [0, 0, 0], max: [0, 0, 0] };
const _parts = new WeakMap();
// How far a vertex blended across a joint can stray from where its main bone alone puts it.
const PART_SLACK = 0.15;

// The earliest point (as a fraction of the frame) any strike point's path crosses `target`'s
// surface, or null. `path` holds steps + 1 poses of `count` points.
function firstContact(target, path, steps, count) {
  const root = target.rig?.model ?? target.model;
  if (!root) return null;
  boundsOf(path, steps, count, 0, count, _box);
  root.updateWorldMatrix(true, true);
  _triCount = 0;
  const skip = new Set([target.rig?.weaponMount, target.rig?.offMount, target.rig?.arrow].filter(Boolean));
  collect(root, skip);
  if (!_triCount) return null;
  // Runs of points along the weapon: each tests only the triangles inside its own sweep, and each
  // step of it only those inside that step's.
  const runs = [];
  for (let start = 0; start < count; start += CHUNK) {
    const end = Math.min(count, start + CHUNK);
    boundsOf(path, steps, count, start, end, _box);
    const near = [];
    for (let k = 0; k < _triCount; k++) if (triInBox(k, _box)) near.push(k);
    if (near.length) runs.push({ start, end, near });
  }
  const local = [];
  // Step by step, so the first step that meets the surface holds the first contact.
  for (let j = 1; j <= steps; j++) {
    let best = Infinity;
    let from = -1;
    for (const { start, end, near } of runs) {
      stepBounds(path, count, j, start, end, _box);
      local.length = 0;
      for (const k of near) if (triInBox(k, _box)) local.push(k);
      if (!local.length) continue;
      for (let i = start; i < end; i++) {
        const a = ((j - 1) * count + i) * 3;
        const b = (j * count + i) * 3;
        const ox = path[a], oy = path[a + 1], oz = path[a + 2];
        const dx = path[b] - ox, dy = path[b + 1] - oy, dz = path[b + 2] - oz;
        if (dx * dx + dy * dy + dz * dz < 1e-10) continue;
        for (const k of local) {
          const t = segTri(ox, oy, oz, dx, dy, dz, k);
          if (t < best) { best = t; from = a; }
        }
      }
    }
    if (from >= 0) {
      const to = from + count * 3;
      const point = new THREE.Vector3(path[from], path[from + 1], path[from + 2]).lerp(_v.fromArray(path, to), best);
      return { target, time: (j - 1 + best) / steps, point };
    }
  }
  return null;
}

// Gathers the visible body triangles under `o` that fall in the sweep's box (outline shells,
// held gear and markers left out).
function collect(o, skip) {
  if (!o.visible || skip.has(o)) return;
  if (o.isMesh && o.geometry?.attributes.position && !o.material?.isShaderMaterial && o.material?.side !== THREE.BackSide) addMesh(o);
  for (const c of o.children) collect(c, skip);
}

function addMesh(mesh) {
  const geo = mesh.geometry;
  // Its bounding sphere against the sweep first (a baked skinned mesh's has slack for any pose).
  if (!mesh.isSkinnedMesh && !geo.boundingSphere) geo.computeBoundingSphere();
  const bound = mesh.isSkinnedMesh ? mesh.boundingSphere : geo.boundingSphere;
  if (bound && !sphereMeetsBox(_sphere.copy(bound).applyMatrix4(mesh.matrixWorld), _box)) return;
  if (mesh.isSkinnedMesh && geo.attributes.skinIndex) addSkinned(mesh);
  else addRigid(mesh);
}

// A plain mesh: every vertex by its world matrix.
function addRigid(mesh) {
  const geo = mesh.geometry;
  const pos = geo.attributes.position;
  const n = pos.count;
  if (_world.length < n * 3) _world = new Float32Array(n * 3 * 1.5);
  const e = mesh.matrixWorld.elements;
  for (let v = 0; v < n; v++) {
    const x = pos.getX(v), y = pos.getY(v), z = pos.getZ(v);
    _world[v * 3] = e[0] * x + e[4] * y + e[8] * z + e[12];
    _world[v * 3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
    _world[v * 3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
  }
  const idx = geo.index?.array;
  const m = idx ? geo.index.count : n;
  for (let i = 0; i + 2 < m; i += 3) addTri(idx ? idx[i] : i, idx ? idx[i + 1] : i + 1, idx ? idx[i + 2] : i + 2);
}

// A skinned mesh, part by part (the triangles each bone carries): only the parts that can reach
// the sweep are skinned (as the skinning shader does, from the bones' current world matrices) and
// tested. Reads baked geometry: plain position, skinIndex and skinWeight arrays.
function addSkinned(mesh) {
  const geo = mesh.geometry;
  const parts = partsOf(geo);
  const n = geo.attributes.position.count;
  if (_world.length < n * 3) _world = new Float32Array(n * 3 * 1.5);
  if (_stamps.length < n) _stamps = new Uint32Array(n * 1.5);
  const stamp = ++_stamp;
  boneMatrices(mesh);
  const M = _boneM;
  const p = geo.attributes.position.array;
  const si = geo.attributes.skinIndex.array;
  const sw = geo.attributes.skinWeight.array;
  const idx = geo.index?.array;
  const W = _world;
  for (const part of parts) {
    const o = part.bone * 12;
    const { x, y, z } = part.center;
    _sphere.center.set(
      M[o] * x + M[o + 3] * y + M[o + 6] * z + M[o + 9],
      M[o + 1] * x + M[o + 4] * y + M[o + 7] * z + M[o + 10],
      M[o + 2] * x + M[o + 5] * y + M[o + 8] * z + M[o + 11],
    );
    const scale = Math.sqrt(Math.max(
      M[o] * M[o] + M[o + 1] * M[o + 1] + M[o + 2] * M[o + 2],
      M[o + 3] * M[o + 3] + M[o + 4] * M[o + 4] + M[o + 5] * M[o + 5],
      M[o + 6] * M[o + 6] + M[o + 7] * M[o + 7] + M[o + 8] * M[o + 8],
    ));
    _sphere.radius = part.radius * scale + PART_SLACK;
    if (!sphereMeetsBox(_sphere, _box)) continue;
    for (const i of part.tris) {
      for (let k = 0; k < 3; k++) {
        const v = idx ? idx[i + k] : i + k;
        if (_stamps[v] === stamp) continue;
        _stamps[v] = stamp;
        const vx = p[v * 3], vy = p[v * 3 + 1], vz = p[v * 3 + 2];
        let ox = 0, oy = 0, oz = 0;
        for (let q = 0; q < 4; q++) {
          const w = sw[v * 4 + q];
          if (w === 0) continue;
          const b = si[v * 4 + q] * 12;
          ox += w * (M[b] * vx + M[b + 3] * vy + M[b + 6] * vz + M[b + 9]);
          oy += w * (M[b + 1] * vx + M[b + 4] * vy + M[b + 7] * vz + M[b + 10]);
          oz += w * (M[b + 2] * vx + M[b + 5] * vy + M[b + 8] * vz + M[b + 11]);
        }
        W[v * 3] = ox;
        W[v * 3 + 1] = oy;
        W[v * 3 + 2] = oz;
      }
      addTri(idx ? idx[i] : i, idx ? idx[i + 1] : i + 1, idx ? idx[i + 2] : i + 2);
    }
  }
}

// Each bone's skinning matrix, flattened to 12 floats in _boneM:
// world = matrixWorld · bindMatrixInverse · (bone.matrixWorld · boneInverse) · bindMatrix, where an
// attached mesh's bindMatrixInverse is its world matrix inverted (as of the last render: so not
// read here — the two cancel).
function boneMatrices(mesh) {
  const sk = mesh.skeleton;
  const nb = sk.bones.length;
  if (_boneM.length < nb * 12) _boneM = new Float32Array(nb * 12);
  if (mesh.bindMode === THREE.AttachedBindMode) _rel.identity();
  else _rel.multiplyMatrices(mesh.matrixWorld, mesh.bindMatrixInverse);
  for (let b = 0; b < nb; b++) {
    _m.multiplyMatrices(sk.bones[b].matrixWorld, sk.boneInverses[b]);
    const e = _m.premultiply(_rel).multiply(mesh.bindMatrix).elements;
    const o = b * 12;
    _boneM[o] = e[0]; _boneM[o + 1] = e[1]; _boneM[o + 2] = e[2];
    _boneM[o + 3] = e[4]; _boneM[o + 4] = e[5]; _boneM[o + 5] = e[6];
    _boneM[o + 6] = e[8]; _boneM[o + 7] = e[9]; _boneM[o + 8] = e[10];
    _boneM[o + 9] = e[12]; _boneM[o + 10] = e[13]; _boneM[o + 11] = e[14];
  }
}

// A skinned geometry's triangles grouped by the bone that carries them (their first vertex's
// heaviest weight), each group with its bind-pose bounding sphere; held gear left out. Cached.
function partsOf(geo) {
  let parts = _parts.get(geo);
  if (parts) return parts;
  const p = geo.attributes.position.array;
  const si = geo.attributes.skinIndex.array;
  const sw = geo.attributes.skinWeight.array;
  const idx = geo.index?.array;
  const m = idx ? geo.index.count : geo.attributes.position.count;
  const held = geo.userData.held;
  // Each triangle's bone (-1: held gear).
  const triBone = new Int32Array(m / 3);
  let bones = 0;
  for (let t = 0; t < triBone.length; t++) {
    const a = idx ? idx[t * 3] : t * 3;
    if (held && held[a]) { triBone[t] = -1; continue; }
    let bone = si[a * 4];
    let weight = sw[a * 4];
    for (let q = 1; q < 4; q++) if (sw[a * 4 + q] > weight) { weight = sw[a * 4 + q]; bone = si[a * 4 + q]; }
    triBone[t] = bone;
    if (bone >= bones) bones = bone + 1;
  }
  // Each bone's triangle count and bounds, then its triangles and how far they reach from the
  // bounds' centre.
  const count = new Uint32Array(bones);
  const box = new Float64Array(bones * 6).fill(Infinity);
  for (let b = 0; b < bones; b++) box[b * 6 + 3] = box[b * 6 + 4] = box[b * 6 + 5] = -Infinity;
  for (let t = 0; t < triBone.length; t++) {
    const b = triBone[t];
    if (b < 0) continue;
    count[b]++;
    for (let k = 0; k < 3; k++) {
      const v = (idx ? idx[t * 3 + k] : t * 3 + k) * 3;
      for (let c = 0; c < 3; c++) {
        if (p[v + c] < box[b * 6 + c]) box[b * 6 + c] = p[v + c];
        if (p[v + c] > box[b * 6 + 3 + c]) box[b * 6 + 3 + c] = p[v + c];
      }
    }
  }
  const byBone = [];
  for (let b = 0; b < bones; b++) {
    if (!count[b]) { byBone.push(null); continue; }
    const o = b * 6;
    const center = new THREE.Vector3((box[o] + box[o + 3]) / 2, (box[o + 1] + box[o + 4]) / 2, (box[o + 2] + box[o + 5]) / 2);
    byBone.push({ bone: b, tris: new Uint32Array(count[b]), center, radius: 0, n: 0 });
  }
  for (let t = 0; t < triBone.length; t++) {
    if (triBone[t] < 0) continue;
    const part = byBone[triBone[t]];
    part.tris[part.n++] = t * 3;
    for (let k = 0; k < 3; k++) {
      const v = (idx ? idx[t * 3 + k] : t * 3 + k) * 3;
      const dx = p[v] - part.center.x, dy = p[v + 1] - part.center.y, dz = p[v + 2] - part.center.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > part.radius) part.radius = d2;
    }
  }
  parts = byBone.filter(Boolean).map(({ bone, tris, center, radius }) => ({ bone, tris, center, radius: Math.sqrt(radius) }));
  _parts.set(geo, parts);
  return parts;
}

// Keeps triangle (a, b, c) of _world if it reaches into the sweep's box.
function addTri(a, b, c) {
  const W = _world;
  const ax = W[a * 3], ay = W[a * 3 + 1], az = W[a * 3 + 2];
  const bx = W[b * 3], by = W[b * 3 + 1], bz = W[b * 3 + 2];
  const cx = W[c * 3], cy = W[c * 3 + 1], cz = W[c * 3 + 2];
  if (Math.max(ax, bx, cx) < _box.min[0] || Math.min(ax, bx, cx) > _box.max[0]) return;
  if (Math.max(ay, by, cy) < _box.min[1] || Math.min(ay, by, cy) > _box.max[1]) return;
  if (Math.max(az, bz, cz) < _box.min[2] || Math.min(az, bz, cz) > _box.max[2]) return;
  if (_tris.length < (_triCount + 1) * 9) {
    const grown = new Float32Array(Math.max(9 * 256, _tris.length * 2));
    grown.set(_tris);
    _tris = grown;
  }
  const o = _triCount++ * 9;
  _tris[o] = ax; _tris[o + 1] = ay; _tris[o + 2] = az;
  _tris[o + 3] = bx - ax; _tris[o + 4] = by - ay; _tris[o + 5] = bz - az;
  _tris[o + 6] = cx - ax; _tris[o + 7] = cy - ay; _tris[o + 8] = cz - az;
}

// ---------------------------------------------------------------- geometry
// The box round points start..end over every step of the path (with a little slack).
function boundsOf(path, steps, count, start, end, box) {
  box.min[0] = box.min[1] = box.min[2] = Infinity;
  box.max[0] = box.max[1] = box.max[2] = -Infinity;
  for (let j = 0; j <= steps; j++) {
    for (let i = (j * count + start) * 3; i < (j * count + end) * 3; i += 3) {
      for (let k = 0; k < 3; k++) {
        if (path[i + k] < box.min[k]) box.min[k] = path[i + k];
        if (path[i + k] > box.max[k]) box.max[k] = path[i + k];
      }
    }
  }
  for (let k = 0; k < 3; k++) { box.min[k] -= 0.01; box.max[k] += 0.01; }
}

// The box round points start..end of steps j - 1 and j.
function stepBounds(path, count, j, start, end, box) {
  box.min[0] = box.min[1] = box.min[2] = Infinity;
  box.max[0] = box.max[1] = box.max[2] = -Infinity;
  for (const step of [j - 1, j]) {
    for (let i = (step * count + start) * 3; i < (step * count + end) * 3; i += 3) {
      for (let k = 0; k < 3; k++) {
        if (path[i + k] < box.min[k]) box.min[k] = path[i + k];
        if (path[i + k] > box.max[k]) box.max[k] = path[i + k];
      }
    }
  }
  for (let k = 0; k < 3; k++) { box.min[k] -= 0.01; box.max[k] += 0.01; }
}

function sphereMeetsBox(s, box) {
  _closest.set(
    Math.max(box.min[0], Math.min(s.center.x, box.max[0])),
    Math.max(box.min[1], Math.min(s.center.y, box.max[1])),
    Math.max(box.min[2], Math.min(s.center.z, box.max[2])),
  );
  return _closest.distanceToSquared(s.center) <= s.radius * s.radius;
}

function triInBox(k, box) {
  const o = k * 9;
  for (let a = 0; a < 3; a++) {
    const v0 = _tris[o + a];
    const v1 = v0 + _tris[o + 3 + a];
    const v2 = v0 + _tris[o + 6 + a];
    if (Math.max(v0, v1, v2) < box.min[a] || Math.min(v0, v1, v2) > box.max[a]) return false;
  }
  return true;
}

// Where along the segment o + t·d (t in 0..1) it crosses triangle k, from either side; Infinity
// if it doesn't (Möller–Trumbore).
function segTri(ox, oy, oz, dx, dy, dz, k) {
  const T = _tris;
  const o = k * 9;
  const e1x = T[o + 3], e1y = T[o + 4], e1z = T[o + 5];
  const e2x = T[o + 6], e2y = T[o + 7], e2z = T[o + 8];
  const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
  const det = e1x * px + e1y * py + e1z * pz;
  if (Math.abs(det) < 1e-12) return Infinity;
  const inv = 1 / det;
  const sx = ox - T[o], sy = oy - T[o + 1], sz = oz - T[o + 2];
  const u = (sx * px + sy * py + sz * pz) * inv;
  if (u < 0 || u > 1) return Infinity;
  const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
  const v = (dx * qx + dy * qy + dz * qz) * inv;
  if (v < 0 || u + v > 1) return Infinity;
  const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
  return t >= 0 && t <= 1 ? t : Infinity;
}
