import * as THREE from 'three';

const _modelRaycaster = new THREE.Raycaster();
const _modelHits = [];

// Anatomical damage components are bound to the rig joints that shape them. Ranged hits use the
// animated mesh surface, then map the contact point to the nearest component here.
const SPEC = {
  biped: [
    { id: 'torso', from: 'hips', to: 'chest', radius: 0.25, threshold: Infinity },
    { id: 'head', bone: 'skull', radius: 0.15, weak: 2, threshold: Infinity, severOnKill: true },
    { id: 'leftArm', from: 'armL.upper', to: 'armL.hand', radius: 0.115, threshold: 38, breakable: true, attacks: ['swing', 'combo', 'bash', 'bolt', 'arrow', 'volley', 'burst', 'fan', 'lob'] },
    { id: 'rightArm', from: 'armR.upper', to: 'armR.hand', radius: 0.115, threshold: 38, breakable: true, attacks: ['swing', 'combo', 'bash', 'bolt', 'arrow', 'volley', 'burst', 'fan', 'lob'] },
    { id: 'leftLeg', from: 'legL.thigh', to: 'legL.foot', radius: 0.14, threshold: 48, breakable: true, attacks: ['charge', 'pounce'] },
    { id: 'rightLeg', from: 'legR.thigh', to: 'legR.foot', radius: 0.14, threshold: 48, breakable: true, attacks: ['charge', 'pounce'] },
  ],
  legs: [
    { id: 'body', bone: 'body', threshold: Infinity },
    { id: 'head', bone: 'head', weak: 1.8, threshold: Infinity, severOnKill: true },
  ],
  hover: [
    { id: 'core', bone: 'body', weak: 1.2, threshold: Infinity },
    { id: 'leftArm', from: 'armL.upper', to: 'armL.hand', radius: 0.12, threshold: 36, breakable: true, attacks: ['bolt', 'burst', 'fan'] },
    { id: 'rightArm', from: 'armR.upper', to: 'armR.hand', radius: 0.12, threshold: 36, breakable: true, attacks: ['bolt', 'burst', 'fan'] },
  ],
};

function legRadius(enemy) {
  if (/crawler|venom/.test(enemy.typeName ?? '')) return 0.055;
  if (/hound|alpha/.test(enemy.typeName ?? '')) return 0.075;
  return Math.max(0.11, Math.min(0.25, enemy.height * 0.095));
}

function headRadius(enemy) {
  const name = enemy.typeName ?? '';
  if (/behemoth/.test(name)) return 0.42;
  if (/thunderhorn|ironhide/.test(name)) return 0.33;
  if (/crawler|venom/.test(name)) return 0.18;
  return 0.16;
}

function legSpec(index, enemy = null) {
  return {
    id: `leg${index}`, from: `leg${index}.upper`, to: `leg${index}.foot`,
    radius: enemy ? legRadius(enemy) : 0.14, threshold: 44, breakable: true, attacks: ['charge', 'pounce'],
  };
}

function specsFor(enemy) {
  const rig = enemy.rig;
  return rig?.kind === 'legs'
    ? [...SPEC.legs, ...rig.legs.map((_, i) => legSpec(i, enemy))]
    : SPEC[rig?.kind] ?? [];
}

// Approximate world-space anatomical volumes used for melee reach and component attribution.
export function hitRegions(enemy) {
  const rig = enemy.rig;
  if (!rig?.model) return [];
  rig.model.updateWorldMatrix(true, true);
  const regions = [];
  for (const s of specsFor(enemy)) {
    const a = rig.model.getObjectByName(`rig:${s.from ?? s.bone}`);
    const b = s.to && rig.model.getObjectByName(`rig:${s.to}`);
    if (!a || (s.to && !b)) continue;
    if (enemy.src?.brokenParts?.includes(s.id)) continue;
    const from = a.getWorldPosition(_a).clone();
    const to = b ? b.getWorldPosition(_b).clone() : from.clone();
    let radius = s.radius;
    if (s.id === 'body' && rig.kind === 'legs') {
      radius = (rig.cfg.bodyWidth ?? 0.6) * 0.5;
      const halfLine = Math.max(0.01, ((rig.cfg.bodyLen ?? radius * 2) - radius * 2) * 0.5);
      _a.set(0, 0, -halfLine);
      a.localToWorld(_a);
      _b.set(0, 0, halfLine);
      a.localToWorld(_b);
      from.copy(_a);
      to.copy(_b);
    }
    if (radius === undefined && s.id === 'head') radius = rig.kind === 'biped' ? 0.15 : headRadius(enemy);
    if (radius === undefined) radius = enemy.height * 0.14;
    regions.push({ ...s, from, to, center: from.clone().lerp(to, 0.5), radius: radius * (enemy.type.scale ?? 1), shape: b || from.distanceToSquared(to) > 1e-8 ? 'capsule' : 'sphere' });
  }
  return regions;
}

// Where a melee swing aims on an enemy (Player.aimSwing turns and tilts the swing through it):
// high on a biped's torso, the middle of a beast's body or a floater's core.
export function aimPoint(enemy, out) {
  const main = hitRegions(enemy).find((r) => r.id === 'torso' || r.id === 'body' || r.id === 'core');
  if (!main) return out.copy(enemy.position).setY(enemy.position.y + enemy.height * 0.6);
  return out.copy(main.from).lerp(main.to, main.id === 'torso' ? 0.85 : 0.5);
}

// Fallback volumes for entities without a raycastable mesh. Enemies use their authored component
// map above; the local player uses its bone chains.
export function bodyRegions(entity) {
  if (entity.faction === 'enemy') return hitRegions(entity);
  const rig = entity.rig;
  if (!rig?.model || !rig.hips || !rig.legs) return [];
  rig.model.updateWorldMatrix(true, true);
  const point = (bone) => bone?.getWorldPosition(new THREE.Vector3()) ?? null;
  const capsule = (id, fromBone, toBone, radius) => {
    const from = point(fromBone), to = point(toBone);
    return from && to ? { id, from, to, center: from.clone().lerp(to, 0.5), radius, shape: 'capsule' } : null;
  };
  const sphere = (id, bone, radius) => {
    const center = point(bone);
    return center ? { id, from: center, to: center, center, radius, shape: 'sphere' } : null;
  };
  return [
    capsule('torso', rig.hips, rig.chest, 0.25),
    sphere('head', rig.skull ?? rig.head, 0.14),
    capsule('leftArm', rig.armL?.upper, rig.armL?.hand, 0.1),
    capsule('rightArm', rig.armR?.upper, rig.armR?.hand, 0.1),
    ...rig.legs.flatMap((leg, i) => [capsule(`leg${i}`, leg.thigh, leg.foot, 0.13)]),
  ].filter(Boolean);
}

// ---------------------------------------------------------------- skinned meshes on the CPU
// Three's own SkinnedMesh.raycast re-multiplies a bone's matrices for every influence of every
// corner of every triangle, and its culling sphere ignores how far the ray reaches, so a shot's
// short step through the air fully tested every body further along its line. Aim, shots and
// sweeps run that against every enemy in a fight each frame. Here the bone matrices are combined
// once per mesh, each vertex is skinned once (a vertex is shared by ~5 triangles) straight into
// world space, and the result is kept while the pose holds (several shots or sweeps reaching the
// same body in a frame skin it once).
const SKINNED_RAYCAST = THREE.SkinnedMesh.prototype.raycast;
const _skinCache = new WeakMap(); // mesh → { geometry, version, mats, pos, box }
let _mats = new Float32Array(16 * 64);
const _boneM = new THREE.Matrix4();

// Can `mesh` take the fast path? (Three's raycast stays for morphs and multi-material meshes.)
function plainSkinned(mesh) {
  const g = mesh.geometry;
  return mesh.isSkinnedMesh && !Array.isArray(mesh.material) && !g.morphAttributes.position
    && g.attributes.skinIndex && g.attributes.skinWeight && mesh.raycast === SKINNED_RAYCAST;
}

// World positions of `mesh`'s vertices as posed now (bones' world matrices must be current), with
// their bounding box: { pos: Float32Array (xyz per vertex), box: [minX, minY, minZ, maxX, maxY, maxZ] }.
export function skinnedWorldPositions(mesh) {
  const g = mesh.geometry;
  const position = g.attributes.position;
  const bones = mesh.skeleton.bones;
  const inverses = mesh.skeleton.boneInverses;
  const nb = bones.length;
  if (_mats.length < nb * 16) _mats = new Float32Array(nb * 16);
  // bone.matrixWorld · boneInverse · bindMatrix: a bind-space vertex straight to world space.
  for (let i = 0; i < nb; i++) {
    _boneM.multiplyMatrices(bones[i].matrixWorld, inverses[i]).multiply(mesh.bindMatrix);
    _mats.set(_boneM.elements, i * 16);
  }
  let c = _skinCache.get(mesh);
  if (c && c.geometry === g && c.version === position.version && c.mats.length === nb * 16) {
    let same = true;
    for (let i = 0, n = nb * 16; i < n; i++) if (c.mats[i] !== _mats[i]) { same = false; break; }
    if (same) return c;
  }
  const count = position.count;
  if (!c || c.pos.length !== count * 3) c = { pos: new Float32Array(count * 3), box: new Float32Array(6), mats: new Float32Array(nb * 16) };
  else if (c.mats.length !== nb * 16) c.mats = new Float32Array(nb * 16);
  c.geometry = g;
  c.version = position.version;
  c.mats.set(_mats.subarray(0, nb * 16));
  const si = g.attributes.skinIndex;
  const sw = g.attributes.skinWeight;
  const direct = !position.isInterleavedBufferAttribute && !si.isInterleavedBufferAttribute && !sw.isInterleavedBufferAttribute
    && !position.normalized && !sw.normalized && position.itemSize === 3 && si.itemSize === 4 && sw.itemSize === 4;
  const P = position.array;
  const I = si.array;
  const W = sw.array;
  const out = c.pos;
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (let v = 0; v < count; v++) {
    let x, y, z;
    if (direct) { x = P[v * 3]; y = P[v * 3 + 1]; z = P[v * 3 + 2]; } else { x = position.getX(v); y = position.getY(v); z = position.getZ(v); }
    let wx = 0, wy = 0, wz = 0;
    for (let k = 0; k < 4; k++) {
      const w = direct ? W[v * 4 + k] : sw.getComponent(v, k);
      if (w === 0) continue;
      const e = (direct ? I[v * 4 + k] : si.getComponent(v, k)) * 16;
      wx += w * (_mats[e] * x + _mats[e + 4] * y + _mats[e + 8] * z + _mats[e + 12]);
      wy += w * (_mats[e + 1] * x + _mats[e + 5] * y + _mats[e + 9] * z + _mats[e + 13]);
      wz += w * (_mats[e + 2] * x + _mats[e + 6] * y + _mats[e + 10] * z + _mats[e + 14]);
    }
    out[v * 3] = wx; out[v * 3 + 1] = wy; out[v * 3 + 2] = wz;
    if (wx < x0) x0 = wx; if (wx > x1) x1 = wx;
    if (wy < y0) y0 = wy; if (wy > y1) y1 = wy;
    if (wz < z0) z0 = wz; if (wz > z1) z1 = wz;
  }
  c.box[0] = x0; c.box[1] = y0; c.box[2] = z0; c.box[3] = x1; c.box[4] = y1; c.box[5] = z1;
  _skinCache.set(mesh, c);
  return c;
}

// Does the segment [near, far] of the ray (unit `d`) pass through the sphere?
function segmentHitsSphere(o, d, sphere, near, far) {
  const cx = sphere.center.x - o.x, cy = sphere.center.y - o.y, cz = sphere.center.z - o.z;
  const tca = cx * d.x + cy * d.y + cz * d.z;
  const d2 = cx * cx + cy * cy + cz * cz - tca * tca;
  const r2 = sphere.radius * sphere.radius;
  if (d2 > r2) return false;
  const thc = Math.sqrt(r2 - d2);
  return tca + thc >= near && tca - thc <= far;
}

// Ray (unit `d`) against an axis-aligned box [x0, y0, z0, x1, y1, z1] within [near, far].
function segmentHitsBox(o, d, b, near, far) {
  let t0 = near, t1 = far;
  for (let a = 0; a < 3; a++) {
    const oa = a === 0 ? o.x : a === 1 ? o.y : o.z;
    const da = a === 0 ? d.x : a === 1 ? d.y : d.z;
    if (Math.abs(da) < 1e-12) { if (oa < b[a] || oa > b[a + 3]) return false; continue; }
    let ta = (b[a] - oa) / da, tb = (b[a + 3] - oa) / da;
    if (ta > tb) { const t = ta; ta = tb; tb = t; }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return false;
  }
  return true;
}

// Nearest triangle of a skinned mesh the ray (unit `d`) meets within [near, far]: the distance, or
// Infinity. Faces cull by the material's side, as Three's raycast does.
function raySkinned(mesh, o, d, near, far) {
  const { pos, box } = skinnedWorldPositions(mesh);
  if (!segmentHitsBox(o, d, box, near, far)) return { t: Infinity, face: -1 };
  const g = mesh.geometry;
  const side = mesh.material.side;
  const cull = side === THREE.FrontSide || side === THREE.BackSide;
  const flip = side === THREE.BackSide;
  const index = g.index?.array ?? null;
  const start = Math.max(0, g.drawRange.start);
  const end = Math.min(index ? g.index.count : g.attributes.position.count, g.drawRange.start + g.drawRange.count);
  const ox = o.x, oy = o.y, oz = o.z, dx = d.x, dy = d.y, dz = d.z;
  let best = Infinity;
  let face = -1;
  for (let i = start; i + 2 < end; i += 3) {
    let a = index ? index[i] * 3 : i * 3;
    const b = index ? index[i + 1] * 3 : (i + 1) * 3;
    let c = index ? index[i + 2] * 3 : (i + 2) * 3;
    if (flip) { const t = a; a = c; c = t; }
    const ax = pos[a], ay = pos[a + 1], az = pos[a + 2];
    const e1x = pos[b] - ax, e1y = pos[b + 1] - ay, e1z = pos[b + 2] - az;
    const e2x = pos[c] - ax, e2y = pos[c + 1] - ay, e2z = pos[c + 2] - az;
    // Möller–Trumbore, as Three's Ray.intersectTriangle.
    const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
    let DdN = dx * nx + dy * ny + dz * nz;
    let sign;
    if (DdN > 0) { if (cull) continue; sign = 1; } else if (DdN < 0) { sign = -1; DdN = -DdN; } else continue;
    const qx = ox - ax, qy = oy - ay, qz = oz - az;
    const DdQxE2 = sign * (dx * (qy * e2z - qz * e2y) + dy * (qz * e2x - qx * e2z) + dz * (qx * e2y - qy * e2x));
    if (DdQxE2 < 0) continue;
    const DdE1xQ = sign * (dx * (e1y * qz - e1z * qy) + dy * (e1z * qx - e1x * qz) + dz * (e1x * qy - e1y * qx));
    if (DdE1xQ < 0 || DdQxE2 + DdE1xQ > DdN) continue;
    const QdN = -sign * (qx * nx + qy * ny + qz * nz);
    if (QdN < 0) continue;
    const t = QdN / DdN;
    if (t < near || t > far || t >= best) continue;
    best = t;
    face = Math.floor(i / 3);
  }
  return { t: best, face };
}

const _sphere = new THREE.Sphere();
const _dirN = new THREE.Vector3();
const _fast = [];

// Exact animated-mesh surface hit for ranged attacks and aim. `undefined` means the entity has
// no model to raycast; `null` means its model was tested and the ray missed it.
// Skinned meshes carry generous bake-time culling spheres (render/ModelKit.js) that move only with
// the model itself, so a ray that reaches none of them is turned away before any bone is updated.
export function rayHitModel(entity, origin, direction, far = Infinity) {
  const model = entity.rig?.model ?? entity.model;
  if (!model) return undefined;
  _dirN.copy(direction).normalize();
  _modelRaycaster.set(origin, _dirN);
  _modelRaycaster.near = 0;
  _modelRaycaster.far = far;
  _modelHits.length = 0;
  model.updateWorldMatrix(true, false);
  _fast.length = 0;
  let others = false;
  model.traverseVisible((object) => {
    if (!object.isMesh || !object.geometry || !object.layers.test(_modelRaycaster.layers)) return;
    // A raycast of its own (outline shells opt out of hits with a no-op) needs no bones from us.
    if (Object.hasOwn(object, 'raycast')) { object.raycast(_modelRaycaster, _modelHits); return; }
    if (!plainSkinned(object)) { others = true; return; }
    object.updateWorldMatrix(object.parent !== model, false);
    if (object.boundingSphere === null) object.computeBoundingSphere();
    _sphere.copy(object.boundingSphere).applyMatrix4(object.matrixWorld);
    if (segmentHitsSphere(origin, _dirN, _sphere, 0, far)) _fast.push(object);
  });
  let best = far;
  let hit = null;
  for (const h of _modelHits) {
    if (h.distance <= best) { best = h.distance; hit = { distance: h.distance, point: h.point.clone(), object: h.object, faceIndex: h.faceIndex }; }
  }
  if (!_fast.length && !others) return hit;
  model.updateWorldMatrix(false, true);
  for (const mesh of _fast) {
    const r = raySkinned(mesh, origin, _dirN, 0, best);
    if (r.t <= best && r.face >= 0) {
      best = r.t;
      hit = { distance: r.t, point: new THREE.Vector3().copy(origin).addScaledVector(_dirN, r.t), object: mesh, faceIndex: r.face };
    }
  }
  if (others) {
    _modelRaycaster.far = best;
    _modelHits.length = 0;
    model.traverseVisible((object) => {
      if (object.isMesh && object.geometry && object.layers.test(_modelRaycaster.layers) && !Object.hasOwn(object, 'raycast') && !plainSkinned(object)) {
        object.raycast(_modelRaycaster, _modelHits);
      }
    });
    for (const h of _modelHits) {
      if (h.distance <= best) { best = h.distance; hit = { distance: h.distance, point: h.point.clone(), object: h.object, faceIndex: h.faceIndex }; }
    }
  }
  _fast.length = 0;
  return hit;
}

// Convert a true mesh-surface hit into the anatomical component used by dismemberment and damage.
export function componentAtPoint(enemy, point) {
  let nearest = null;
  let nearestCenterline = Infinity;
  for (const region of hitRegions(enemy)) {
    _segmentAxis.subVectors(region.to, region.from);
    const lengthSq = _segmentAxis.lengthSq();
    const t = lengthSq > 1e-8
      ? Math.max(0, Math.min(1, _toPoint.subVectors(point, region.from).dot(_segmentAxis) / lengthSq))
      : 0;
    _segmentPoint.copy(region.from).addScaledVector(_segmentAxis, t);
    const centerlineDistance = _segmentPoint.distanceTo(point);
    if (centerlineDistance < nearestCenterline) { nearestCenterline = centerlineDistance; nearest = region.id; }
  }
  return nearest;
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _segmentAxis = new THREE.Vector3();
const _toPoint = new THREE.Vector3();
const _segmentPoint = new THREE.Vector3();

// Exact ray/capsule intersection (unit ray direction), including both spherical caps.
export function rayHitRegion(ro, rd, region, pad = 0) {
  const r = region.radius + pad;
  if (region.shape !== 'capsule') {
    _ba.subVectors(ro, region.center);
    const b = _ba.dot(rd);
    const c = _ba.lengthSq() - r * r;
    const h = b * b - c;
    if (h < 0) return Infinity;
    const t = -b - Math.sqrt(h);
    return t >= 0 ? t : (-b + Math.sqrt(h) >= 0 ? -b + Math.sqrt(h) : Infinity);
  }
  _ba.subVectors(region.to, region.from);
  _oa.subVectors(ro, region.from);
  const baba = _ba.lengthSq();
  if (baba < 1e-8) return sphereHit(ro, rd, region.from, r);
  const bard = _ba.dot(rd), baoa = _ba.dot(_oa), rdoa = rd.dot(_oa), oaoa = _oa.lengthSq();
  const qa = baba - bard * bard;
  const qb = baba * rdoa - baoa * bard;
  const qc = baba * oaoa - baoa * baoa - r * r * baba;
  const h = qb * qb - qa * qc;
  if (h >= 0 && qa > 1e-8) {
    const t = (-qb - Math.sqrt(h)) / qa;
    const y = baoa + t * bard;
    if (t >= 0 && y > 0 && y < baba) return t;
  }
  return Math.min(sphereHit(ro, rd, region.from, r), sphereHit(ro, rd, region.to, r));
}

function sphereHit(ro, rd, center, radius) {
  _oa.subVectors(ro, center);
  const b = _oa.dot(rd), c = _oa.lengthSq() - radius * radius, h = b * b - c;
  if (h < 0) return Infinity;
  const t = -b - Math.sqrt(h);
  return t >= 0 ? t : (-b + Math.sqrt(h) >= 0 ? -b + Math.sqrt(h) : Infinity);
}

const _ba = new THREE.Vector3();
const _oa = new THREE.Vector3();

export function componentSpec(id, rigKind = 'biped', enemy = null) {
  if (rigKind === 'legs' && /^leg\d+$/.test(id)) return legSpec(Number(id.slice(3)), enemy);
  return (SPEC[rigKind] ?? []).find((s) => s.id === id) ?? null;
}

export function anyComponentSpec(id) {
  if (/^leg\d+$/.test(id)) return legSpec(Number(id.slice(3)));
  for (const specs of Object.values(SPEC)) {
    const found = specs.find((s) => s.id === id);
    if (found) return found;
  }
  return null;
}

// Shared anatomy response for the sim and its network replica. The game uses a kinematic body
// capsule, so this profile changes that body's stance height as well as its locomotion limits.
export function legDamageProfile(type, brokenParts = []) {
  let legs;
  let lost;
  if (type.rig === 'biped') {
    legs = 2;
    lost = ['leftLeg', 'rightLeg'].filter((id) => brokenParts.includes(id)).length;
  } else {
    const model = type.model ?? '';
    legs = /fauna:(?:crawler|venom)/.test(model) ? 8
      : /fauna:(?:hound|rimehound|alpha)/.test(model) ? 6
        : /fauna:(?:thunderhorn|ironhide|behemoth)/.test(model) ? 4
          : type.rig === 'spider' ? 8 : type.rig === 'quad' ? 4 : 0;
    lost = brokenParts.filter((id) => /^leg\d+$/.test(id)).length;
  }
  lost = Math.min(legs, lost);
  if (!legs || !lost) return { legs, lost: 0, move: 1, height: 1 };
  const fraction = lost / legs;
  return {
    legs,
    lost,
    move: type.rig === 'biped' ? Math.max(0.24, 1 - 0.76 * fraction) : Math.max(0.28, 1 - 0.72 * fraction),
    height: type.rig === 'biped' ? 1 - 0.14 * fraction : 1 - 0.36 * fraction,
  };
}

// Approximate the point a melee sweep reaches on a target's live component volumes. The enemy
// body/range filter remains the broad phase; this returns the nearest anatomical region inside
// the attack arc so blades can damage or sever the part they actually meet.
export function componentForSweep(enemy, attacker, attack) {
  const model = enemy.rig?.model;
  if (model) {
    model.updateWorldMatrix(true, true);
    let nearest = null;
    let nearestDistance = Infinity;
    const halfArc = (attack.arc * Math.PI) / 360;
    const minY = attacker.position.y - 0.4;
    const maxY = attacker.position.y + attacker.height * 0.9;
    attacker.forward(_forward);
    const ax = attacker.position.x;
    const az = attacker.position.z;
    model.traverseVisible((mesh) => {
      if (!mesh.isSkinnedMesh || mesh.material?.isShaderMaterial) return;
      const positions = mesh.geometry?.getAttribute('position');
      if (!positions) return;
      const g = mesh.geometry;
      if (g.attributes.skinIndex && g.attributes.skinWeight && !g.morphAttributes.position) {
        // Posed once (see skinnedWorldPositions), and passed over whole when out of reach.
        const { pos, box } = skinnedWorldPositions(mesh);
        if (box[1] > maxY || box[4] < minY) return;
        const ex = Math.max(box[0] - ax, 0, ax - box[3]);
        const ez = Math.max(box[2] - az, 0, az - box[5]);
        if (Math.hypot(ex, ez) > attack.range + 0.08) return;
        const cosHalf = Math.cos(halfArc);
        for (let i = 0, n = positions.count; i < n; i++) {
          const y = pos[i * 3 + 1];
          if (y < minY || y > maxY) continue;
          const dx = pos[i * 3] - ax;
          const dz = pos[i * 3 + 2] - az;
          const distance = Math.hypot(dx, dz);
          if (distance > attack.range + 0.08 || distance >= nearestDistance) continue;
          if (attack.arc < 360 && distance > 1e-3 && (_forward.x * dx + _forward.z * dz) / distance < cosHalf) continue;
          nearestDistance = distance;
          nearest = (nearest ?? new THREE.Vector3()).set(pos[i * 3], y, pos[i * 3 + 2]);
        }
        return;
      }
      for (let i = 0; i < positions.count; i++) {
        mesh.getVertexPosition(i, _meshLocal);
        _meshPoint.copy(_meshLocal).applyMatrix4(mesh.matrixWorld);
        if (_meshPoint.y < minY || _meshPoint.y > maxY) continue;
        const dx = _meshPoint.x - attacker.position.x;
        const dz = _meshPoint.z - attacker.position.z;
        const distance = Math.hypot(dx, dz);
        if (distance > attack.range + 0.08 || distance >= nearestDistance) continue;
        if (attack.arc < 360 && distance > 1e-3 &&
          (_forward.x * dx + _forward.z * dz) / distance < Math.cos(halfArc)) continue;
        nearestDistance = distance;
        nearest = _meshPoint.clone();
      }
    });
    return nearest ? componentAtPoint(enemy, nearest) : null;
  }

  let nearest = null;
  let nearestSurface = Infinity;
  const halfArc = (attack.arc * Math.PI) / 360;
  attacker.forward(_forward);
  for (const r of bodyRegions(enemy)) {
    const sx = r.to.x - r.from.x;
    const sz = r.to.z - r.from.z;
    const den = sx * sx + sz * sz;
    const u = den > 1e-8 ? Math.max(0, Math.min(1, ((attacker.position.x - r.from.x) * sx + (attacker.position.z - r.from.z) * sz) / den)) : 0;
    const x = r.from.x + sx * u;
    const z = r.from.z + sz * u;
    const dx = x - attacker.position.x;
    const dz = z - attacker.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist - r.radius > attack.range) continue;
    if (attack.arc < 360 && dist > 1e-3 && _forward.angleTo(_dir2.set(dx, 0, dz)) > halfArc + Math.atan2(r.radius, dist)) continue;
    if (Math.abs((r.center.y) - (attacker.position.y + attacker.height * 0.5)) > enemy.height * 0.6 + 0.5) continue;
    const surface = Math.max(0, dist - r.radius);
    if (surface < nearestSurface) { nearestSurface = surface; nearest = r.id; }
  }
  return nearest;
}

const _forward = new THREE.Vector3();
const _dir2 = new THREE.Vector3();
const _meshLocal = new THREE.Vector3();
const _meshPoint = new THREE.Vector3();

export function componentBoneRoot(enemy, id) {
  const kind = enemy.rig?.kind;
  const bone = kind === 'legs' && /^leg\d+$/.test(id) ? `${id}.upper`
    : kind === 'legs' && id === 'head' ? 'head'
      : kind === 'biped' ? ({ head: 'head', leftArm: 'armL.upper', rightArm: 'armR.upper', leftLeg: 'legL.thigh', rightLeg: 'legR.thigh' })[id]
      : kind === 'hover' ? ({ leftArm: 'armL.upper', rightArm: 'armR.upper' })[id] : null;
  if (!bone) return [];
  const root = enemy.rig.model.getObjectByName(`rig:${bone}`);
  if (!root) return [];
  const names = [];
  root.traverse((o) => { if (o.isBone) names.push(o.name); });
  return names;
}
