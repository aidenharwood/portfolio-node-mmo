// Reticle aiming: casts a ray from the camera through screen centre against enemies,
// world colliders and the ground. Ranged/magic fire toward the resulting point.
import * as THREE from 'three';

const _o = new THREE.Vector3();
const _d = new THREE.Vector3();
const MAX_RANGE = 150;

// Ray vs vertical cylinder (side only). Returns distance along ray or Infinity.
export function rayCylinder(o, d, cx, cz, r, y0, y1) {
  const ox = o.x - cx;
  const oz = o.z - cz;
  const a = d.x * d.x + d.z * d.z;
  if (a < 1e-8) return Infinity;
  const b = 2 * (ox * d.x + oz * d.z);
  const c = ox * ox + oz * oz - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return Infinity;
  const sq = Math.sqrt(disc);
  for (const t of [(-b - sq) / (2 * a), (-b + sq) / (2 * a)]) {
    if (t < 0) continue;
    const y = o.y + d.y * t;
    if (y >= y0 && y <= y1) return t;
  }
  return Infinity;
}

// Ray vs axis-aligned box (a dungeon's wall or door): distance along the ray, 0 starting inside,
// or Infinity.
export function rayBox(o, d, x0, x1, y0, y1, z0, z1) {
  let tmin = 0;
  let tmax = Infinity;
  let t1;
  let t2;
  if (Math.abs(d.x) < 1e-9) { if (o.x < x0 || o.x > x1) return Infinity; } else {
    t1 = (x0 - o.x) / d.x; t2 = (x1 - o.x) / d.x;
    if (t1 > t2) [t1, t2] = [t2, t1];
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return Infinity;
  }
  if (Math.abs(d.y) < 1e-9) { if (o.y < y0 || o.y > y1) return Infinity; } else {
    t1 = (y0 - o.y) / d.y; t2 = (y1 - o.y) / d.y;
    if (t1 > t2) [t1, t2] = [t2, t1];
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return Infinity;
  }
  if (Math.abs(d.z) < 1e-9) { if (o.z < z0 || o.z > z1) return Infinity; } else {
    t1 = (z0 - o.z) / d.z; t2 = (z1 - o.z) / d.z;
    if (t1 > t2) [t1, t2] = [t2, t1];
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return Infinity;
  }
  return tmin;
}

// A ray against a box collider, turned by its `ry` as the world turns them (world/World.js: a
// point's local coordinates are R(ry)·(point − centre)), so the ray is turned into the box's frame.
const _lo = new THREE.Vector3();
const _ld = new THREE.Vector3();
export function rayBoxCollider(o, d, c, pad = 0, below = 0, above = 0) {
  const a = c.ry ?? 0;
  if (!a) return rayBox(o, d, c.x - c.hx - pad, c.x + c.hx + pad, c.y - below, c.y + c.h + above, c.z - c.hz - pad, c.z + c.hz + pad);
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const ox = o.x - c.x;
  const oz = o.z - c.z;
  _lo.set(cos * ox - sin * oz, o.y, sin * ox + cos * oz);
  _ld.set(cos * d.x - sin * d.z, d.y, sin * d.x + cos * d.z);
  return rayBox(_lo, _ld, -c.hx - pad, c.hx + pad, c.y - below, c.y + c.h + above, -c.hz - pad, c.hz + pad);
}

// A ray against any world collider (a round one's side, or a box), widened by `pad` and stretched
// `below`/`above` its bottom and top.
export function rayCollider(o, d, c, pad = 0, below = 0, above = 0) {
  if (c.box) return rayBoxCollider(o, d, c, pad, below, above);
  return rayCylinder(o, d, c.x, c.z, c.r + pad, c.y - below, c.y + c.h + above);
}

export class Aim {
  constructor() {
    this.point = new THREE.Vector3();
    this.dir = new THREE.Vector3(0, 0, -1);
    this.target = null;
    this.distance = MAX_RANGE;
  }

  update(game) {
    const cam = game.camera;
    cam.getWorldDirection(this.dir);
    const hit = this.cast(game, cam.position, this.dir, this.point);
    this.distance = hit.distance;
    this.target = hit.target;
    return this;
  }

  // What a ray from `origin` along unit `dir` hits first (enemy, collider or ground, within
  // MAX_RANGE). Writes the point into `out`. Also used for aiming down a first-person sight,
  // whose line isn't always the screen centre.
  cast(game, origin, dir, out) {
    _o.copy(origin);
    _d.copy(dir);
    // Ignore anything between the camera and the player (e.g. a tree behind you).
    const p = game.player.position;
    const minT = Math.max(0, Math.hypot(p.x - _o.x, p.z - _o.z) - 0.6);
    const minEnemyT = 0.5;

    let best = MAX_RANGE;
    let target = null;
    for (const e of game.enemies) {
      if (!e.alive) continue;
      const t = rayCylinder(_o, _d, e.position.x, e.position.z, e.radius * 1.1, e.position.y, e.position.y + e.height);
      if (t > minEnemyT && t < best) { best = t; target = e; }
    }
    for (const c of game.world.collidersAlongRay(_o, _d, best)) {
      const t = rayCollider(_o, _d, c);
      if (t > minT && t < best) { best = t; target = null; }
    }
    // Indoors, the ceiling.
    if (_d.y > 1e-4) {
      const t = (game.world.ceilingAt(_o.x, _o.z) - _o.y) / _d.y;
      if (t > minT && t < best) { best = t; target = null; }
    }
    const tg = game.world.raycastGround(_o, _d, best);
    if (tg > minT && tg < best) { best = tg; target = null; }
    out.copy(_o).addScaledVector(_d, best);
    return { distance: best, target };
  }
}
