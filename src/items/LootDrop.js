// A weapon lying in the world: pops out of a corpse, floats, shows a rarity-coloured beam,
// and despawns after a rarity-dependent lifetime so low-tier clutter clears itself.
import * as THREE from 'three';
import { animateWeapon } from './WeaponModel.js';
import { buildItemModel, isArmor } from './items.js';
import { RARITY } from './rarity.js';

const LIFETIME = [75, 120, 300, Infinity, Infinity]; // seconds, by rarity tier
const BLINK = 8;

export class LootDrop {
  constructor(game, weapon, position, { pop = true } = {}) {
    this.game = game;
    this.weapon = weapon;
    this.age = 0;
    const rar = RARITY[weapon.rarity];
    this.tier = rar.tier;
    this.life = LIFETIME[rar.tier];

    this.root = new THREE.Group();
    this.root.position.copy(position);

    this.holder = new THREE.Group();
    this.holder.position.y = 0.5;
    this.model = buildItemModel(weapon);
    if (isArmor(weapon)) {
      this.model.scale.setScalar(0.9);
      this.model.position.y = weapon.slot === 'legs' ? -0.3 : weapon.slot === 'chest' ? 0.05 : weapon.slot === 'back' ? 0.3 : 0.1;
    } else {
      this.model.rotation.x = -Math.PI / 2; // point the weapon skyward
      this.model.position.y = -0.25;
    }
    this.holder.add(this.model);
    this.root.add(this.holder);

    const beamHeight = 1.5 + rar.tier * 1.3;
    this.beamMat = new THREE.MeshBasicMaterial({
      color: rar.color, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.05 + rar.tier * 0.015, 0.14, beamHeight, 8, 1, true), this.beamMat);
    beam.position.y = beamHeight / 2;
    this.root.add(beam);

    this.ringMat = new THREE.MeshBasicMaterial({ color: rar.color, transparent: true, opacity: 0.8, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.58, 28), this.ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    this.root.add(ring);

    this.velocity = new THREE.Vector3();
    this.airborne = pop;
    if (pop) {
      const a = Math.random() * Math.PI * 2;
      const s = 1.5 + Math.random() * 2;
      this.velocity.set(Math.cos(a) * s, 6, Math.sin(a) * s);
      this.root.position.y += 0.8;
    }
  }

  get position() { return this.root.position; }
  get expired() { return this.age >= this.life; }
  get remaining() { return this.life - this.age; }

  update(dt, time) {
    this.age += dt;
    const ground = this.game.world.supportHeight(this.root.position.x, this.root.position.z, this.root.position.y + 0.3);
    if (this.airborne) {
      this.velocity.y -= 20 * dt;
      this.root.position.addScaledVector(this.velocity, dt);
      this.game.world.resolve(this.root.position, 0.3);
      if (this.root.position.y <= ground) {
        this.root.position.y = ground;
        this.airborne = false;
      }
    } else {
      this.root.position.y = ground;
    }
    this.holder.rotation.y += dt * 1.4;
    this.holder.position.y = 0.55 + Math.sin(this.age * 2.5) * 0.08;
    animateWeapon(this.model, time);

    let alpha = 1;
    if (this.remaining < BLINK) alpha = Math.sin(this.age * 14) > 0 ? 1 : 0.15;
    this.beamMat.opacity = (0.35 + Math.sin(this.age * 4) * 0.1) * alpha;
    this.ringMat.opacity = 0.8 * alpha;
    this.holder.visible = alpha > 0.5 || this.remaining > BLINK;
  }

  dispose() {
    this.root.traverse((o) => {
      if (o.isMesh) {
        o.geometry.dispose();
        if (!o.material.isShaderMaterial) o.material.dispose();
      }
    });
  }
}
