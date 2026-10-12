// Friendly townsfolk: idle animation, turn to face the player when near, and an interaction hook.
import * as THREE from 'three';
import { buildHumanoid } from '../models/Characters.js';
import { wrapAngle } from './Character.js';
import { Animator, makeAnimState } from '../anim/Animator.js';
import { CapeCloth } from '../anim/Cloth.js';

export const INTERACT_RANGE = 3.2;

export class NPC {
  constructor(game, def) {
    this.game = game;
    this.def = def;
    this.id = def.id;
    this.name = def.name;
    this.title = def.title;
    this.role = def.role;
    this.rig = buildHumanoid(def.look);
    this.root = new THREE.Group();
    this.root.add(this.rig.model);
    this.root.position.set(def.x, 0, def.z);
    this.baseFacing = def.facing ?? 0;
    this.facing = this.baseFacing;
    this.root.rotation.y = this.facing;
    this.time = Math.random() * 10;
    this.height = 2.1;
    this.radius = 0.5;
    this.lineIndex = 0;
    this.anim = makeAnimState();
    this.anim.pose = [1.3, -0.12, 0];
    this.anim.elbow = 0.35;
    this.anim.armSwing = 0;
    this.anim.ground = (x, z) => game.world.groundHeight(x, z);
    this.animator = new Animator(this.rig);
    this.cloth = this.rig.capeBones ? new CapeCloth(this.rig) : null;
    game.world.addCollider(def.x, def.z, 0.5, 2);
  }

  get position() { return this.root.position; }

  // '!' quest available, '?' quest ready to turn in, null otherwise.
  get marker() {
    if (this.role !== 'quest') return null;
    const log = this.game.quests;
    if (log.readyToTurnIn(this.id).length) return '?';
    if (log.available(this.id).length) return '!';
    return null;
  }

  update(dt) {
    this.time += dt;
    const p = this.game.player.position;
    const d = Math.hypot(p.x - this.position.x, p.z - this.position.z);
    const target = d < 7 ? Math.atan2(p.x - this.position.x, p.z - this.position.z) : this.baseFacing;
    this.facing += wrapAngle(target - this.facing) * (1 - Math.exp(-4 * dt));
    this.root.rotation.y = this.facing;
    // Idle: breathing and weight shifts from the animator; eyes on the player when they're near.
    const s = this.anim;
    s.facing = this.facing;
    s.lookYaw = d < 7 ? Math.max(-1, Math.min(1, wrapAngle(target - this.facing))) : Math.sin(this.time * 0.4) * 0.3;
    s.aimPitch = Math.sin(this.time * 0.7) * 0.05;
    this.animator.update(dt, s);
    this.cloth?.update(dt, 0);
  }
}
