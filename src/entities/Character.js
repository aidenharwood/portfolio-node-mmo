// Shared base for anything that moves, fights and dies.
import * as THREE from 'three';
import { stopAgainst } from '../world/MeshCollision.js';

const WHITE = new THREE.Color(1, 1, 1);
const _push = new THREE.Vector3();

export const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
export const MAX_SLOPE = 1.25; // rise/run a walker can climb (~51°); steeper needs jumping/clambering

export class Character {
  constructor(game, { maxHp = 100, radius = 0.5, faction = 'neutral', mass = 1, height = 1.8 } = {}) {
    this.game = game;
    this.root = new THREE.Group();
    this.velocity = new THREE.Vector3();
    this.knockback = new THREE.Vector3();
    this.maxHp = maxHp;
    this.hp = maxHp;
    this.radius = radius;
    this.faction = faction;
    this.mass = mass;
    this.height = height;
    this.alive = true;
    this.facing = 0;
    this.flashTimer = 0;
    this.tint = new THREE.Color(0, 0, 0);
    this.statuses = {};
    this.materials = [];
  }

  get position() { return this.root.position; }
  get damageMultiplier() { return 1; }
  get critBonus() { return 0; }

  collectMaterials() {
    this.materials = [];
    this.root.traverse((o) => {
      if (o.isMesh && o.material.isMeshToonMaterial) this.materials.push(o.material);
    });
  }

  forward(out = new THREE.Vector3()) {
    return out.set(Math.sin(this.facing), 0, Math.cos(this.facing));
  }

  angleTo(pos) {
    return Math.atan2(pos.x - this.position.x, pos.z - this.position.z);
  }

  turnTowards(angle, maxStep) {
    const d = wrapAngle(angle - this.facing);
    this.facing = wrapAngle(this.facing + Math.max(-maxStep, Math.min(maxStep, d)));
  }

  speedMultiplier() { return this.statuses.chill ? 1 - this.statuses.chill.slow : 1; }
  damageTakenMultiplier(_element, _source) { return this.statuses.corrode ? 1 + this.statuses.corrode.amp : 1; }

  heal(amount) {
    if (this.alive) this.hp = Math.min(this.maxHp, this.hp + amount);
  }

  canBeHit() { return this.alive; }

  takeHit(hit) {
    if (!this.canBeHit()) return false;
    this.hp = Math.max(0, this.hp - hit.damage);
    if (hit.source !== 'status') this.flashTimer = 0.1;
    this.knockback.addScaledVector(hit.direction, hit.knockback / this.mass);
    this.onHit(hit);
    if (this.hp <= 0) {
      this.alive = false;
      this.statuses = {};
      this.onDeath(hit);
    }
    return true;
  }

  onHit() {}
  onDeath() {}

  // Ground movement: slide along colliders, refuse cliffs steeper than MAX_SLOPE, stick to terrain.
  integrate(dt) {
    const world = this.game.world;
    const p = this.position;
    const ox = p.x;
    const oz = p.z;
    const oy = world.groundHeight(ox, oz);
    p.y = oy;
    _push.set(0, 0, 0);
    world.move(p, (this.velocity.x + this.knockback.x) * dt, (this.velocity.z + this.knockback.z) * dt, this.radius, 0, this.height, _push);
    stopAgainst(_push, this.velocity, this.knockback);
    this.knockback.multiplyScalar(Math.exp(-7 * dt));
    let ny = world.groundHeight(p.x, p.z);
    const dist = Math.hypot(p.x - ox, p.z - oz);
    if (dist > 1e-4 && (ny - oy) / dist > MAX_SLOPE) {
      p.x = ox;
      p.z = oz;
      ny = oy;
    }
    p.y = ny;
    this.root.rotation.y = this.facing;
  }

  updateMaterials(dt) {
    this.flashTimer = Math.max(0, this.flashTimer - dt);
    const c = this.flashTimer > 0 ? WHITE : this.tint;
    for (const m of this.materials) m.emissive.copy(c);
  }
}
