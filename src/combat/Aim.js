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
      const t = rayCylinder(_o, _d, c.x, c.z, c.r, c.y, c.y + c.h);
      if (t > minT && t < best) { best = t; target = null; }
    }
    const tg = game.world.raycastGround(_o, _d, best);
    if (tg > minT && tg < best) { best = tg; target = null; }
    out.copy(_o).addScaledVector(_d, best);
    return { distance: best, target };
  }
}
