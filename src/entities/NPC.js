// Friendly townsfolk: idle animation, turn to face the player when near, and an interaction hook.
// Up close they animate every frame; further off a few times a second; past FADE they fade out,
// and past FAR they're neither drawn nor animated.
import * as THREE from 'three';
import { buildHumanoid } from '../models/Characters.js';
import { disposeObject } from '../render/Toon.js';
import { wrapAngle } from './Character.js';
import { Animator, makeAnimState } from '../anim/Animator.js';
import { CapeCloth } from '../anim/Cloth.js';

export const INTERACT_RANGE = 3.2;
const NEAR = 28;
const FADE = 56;
const FAR = 70;
// Folk who give quests (and so wear a marker over their heads).
export const QUEST_ROLES = new Set(['quest', 'warden', 'giver']);

export class NPC {
  // `collider`: false when the place that brought them already put one where they stand.
  constructor(game, def, { collider = true } = {}) {
    this.game = game;
    this.def = def;
    this.id = def.id;
    this.name = def.name;
    this.title = def.title;
    this.role = def.role;
    this.rig = buildHumanoid(def.look);
    this.root = new THREE.Group();
    this.root.add(this.rig.model);
    this.root.position.set(def.x, game.world.groundHeight(def.x, def.z), def.z);
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
    if (collider) game.world.addCollider(def.x, def.z, 0.5, 2);
    // Its own materials fade; an ink hull's material is shared by every figure (render/Toon.js
    // outlineMaterial), so while it's faded the hull is hidden instead.
    this.materials = [];
    this.hulls = [];
    this.rig.model.traverse((o) => {
      if (!o.isMesh) return;
      for (const m of [].concat(o.material)) {
        if (m.userData?.layer !== undefined) this.hulls.push(o);
        else this.materials.push(m);
      }
    });
    this.fade = 1;
    this.slow = 0;
  }

  get position() { return this.root.position; }

  dispose() { disposeObject(this.root); }

  // '?' a quest to hand in here, '…' a running quest wants a word (or an answer) with them, '!'
  // one to take (from those who give them); null otherwise.
  get marker() {
    const log = this.game.quests;
    if (log.readyToTurnIn(this.id).length) return '?';
    if (log.wants(this.id)) return '…';
    if ((QUEST_ROLES.has(this.role) || this.role === 'story') && log.available(this.id).length) return '!';
    return null;
  }

  // The marker keeps its state (offer, talk, or turn-in); its shape identifies the quest type.
  get markerKind() {
    const log = this.game.quests;
    return log.readyToTurnIn(this.id)[0]?.kind
      ?? log.wantedQuest(this.id)?.kind
      ?? (QUEST_ROLES.has(this.role) || this.role === 'story' ? log.available(this.id)[0]?.kind : null)
      ?? null;
  }

  // How solid the figure is (0..1): each figure has its own materials, so it fades on its own.
  setFade(k) {
    if (k === this.fade) return;
    const was = this.fade < 1;
    this.fade = k;
    for (const m of this.materials) {
      if (was !== k < 1) {
        m.transparent = k < 1;
        m.depthWrite = k >= 1;
        m.needsUpdate = true;
      }
      m.opacity = k;
    }
    for (const h of this.hulls) h.visible = k >= 1;
  }

  update(dt) {
    this.time += dt;
    const p = this.game.player.position;
    const d = Math.hypot(p.x - this.position.x, p.z - this.position.z);
    this.root.visible = d < FAR;
    if (!this.root.visible) return;
    this.setFade(d > FADE ? Math.max(0.05, Math.round(((FAR - d) / (FAR - FADE)) * 20) / 20) : 1);
    if (d > NEAR) {
      this.slow += dt;
      if (this.slow < 0.2) return;
      dt = this.slow;
    }
    this.slow = 0;
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
