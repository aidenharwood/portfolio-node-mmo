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

// Exact animated-mesh surface hit for ranged attacks and aim. `undefined` means the entity has
// no model to raycast; `null` means its model was tested and the ray missed it.
export function rayHitModel(entity, origin, direction, far = Infinity) {
  const model = entity.rig?.model ?? entity.model;
  if (!model) return undefined;
  model.updateWorldMatrix(true, true);
  _modelRaycaster.set(origin, direction);
  _modelRaycaster.near = 0;
  _modelRaycaster.far = far;
  _modelHits.length = 0;
  model.traverseVisible((object) => {
    if (object.isMesh && object.geometry && object.layers.test(_modelRaycaster.layers)) {
      object.raycast(_modelRaycaster, _modelHits);
    }
  });
  if (!_modelHits.length) return null;
  _modelHits.sort((a, b) => a.distance - b.distance);
  const hit = _modelHits[0];
  return { distance: hit.distance, point: hit.point.clone(), object: hit.object, faceIndex: hit.faceIndex };
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
    model.traverseVisible((mesh) => {
      if (!mesh.isSkinnedMesh || mesh.material?.isShaderMaterial) return;
      const positions = mesh.geometry?.getAttribute('position');
      if (!positions) return;
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
