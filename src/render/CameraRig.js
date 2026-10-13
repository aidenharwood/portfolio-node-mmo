// Third-person camera. Three framings blend smoothly:
//   melee — centred, pulled back for crowd awareness
//   aim   — over the right shoulder so the screen-centre reticle is clear of the player
//   ads   — tight over-shoulder zoom (hold RMB with ranged/magic)
// The view direction always equals the orbit direction, so screen centre = aim ray.
import * as THREE from 'three';
import { rayCollider } from '../combat/Aim.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

const MODES = {
  melee: { distance: 8.5, shoulder: 0, height: 1.5, fov: 55 },
  aim: { distance: 5.4, shoulder: 1.25, height: 1.85, fov: 55 },
  ads: { distance: 3.4, shoulder: 1.2, height: 1.95, fov: 40 },
};

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.yaw = 0;
    this.pitch = 0.32;
    this.zoom = 1;
    this.sensitivity = 0.0025;
    // Player preferences (main.js applyPrefs): look speed, inverted pitch, field of view outside
    // aim-down-sights, and how hard the camera shakes.
    this.sensScale = 1;
    this.invertY = false;
    this.fov = MODES.melee.fov;
    this.shakeScale = 1;
    this.mode = 'melee';
    this.cur = { ...MODES.melee };
    this.target = new THREE.Vector3();
    this.shake = 0;
    this._focus = new THREE.Vector3();
    this._offset = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._back = new THREE.Vector3();
    this.blockedDist = null;
    this.kickTarget = 0;
    this.kickPitch = 0;
    this.kickYaw = 0;
    this.shakeT = 0;
  }

  // Recoil: kicks the view up (and a touch sideways); most of it recovers, some climb remains.
  kick(up, side = 0) {
    this.kickTarget += up;
    this.kickYaw += side;
    this.pitch = clamp(this.pitch - up * 0.25, -0.55, 1.25);
  }

  addShake(amount) {
    this.shake = Math.min(1, Math.max(this.shake, amount * this.shakeScale));
  }

  forward(out) { return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }
  right(out) { return out.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw)); }

  // Pixels per radian at screen centre, for sizing the spread reticle.
  pixelsPerRadian(height) {
    return height / 2 / Math.tan((this.camera.fov * Math.PI) / 360);
  }

  // `eye` (world point) puts the camera in first person at the player's eyes; null = third person.
  update(dt, input, focusPos, mode, world, adsFov = MODES.ads.fov, fovKick = 0, eye = null) {
    this.mode = mode;
    const sens = this.sensitivity * this.sensScale * (mode === 'ads' ? 0.55 : 1);
    this.yaw -= input.mouseDX * sens;
    // First person can look much further up and down than the orbit allows.
    this.pitch = clamp(this.pitch + input.mouseDY * sens * (this.invertY ? -1 : 1), eye ? -1.45 : -0.55, eye ? 1.45 : 1.25);
    this.zoom = clamp(this.zoom + input.wheel * 0.1, 0.7, 1.6);
    const near = eye ? 0.04 : 0.1;
    if (this.camera.near !== near) {
      this.camera.near = near;
      this.camera.updateProjectionMatrix();
    }

    const goal = mode === 'ads' ? { ...MODES.ads, fov: adsFov } : { ...MODES[mode], fov: this.fov + fovKick };
    const k = 1 - Math.exp(-10 * dt);
    for (const key of Object.keys(goal)) this.cur[key] += (goal[key] - this.cur[key]) * k;
    const dist = this.cur.distance * (mode === 'ads' ? 1 : this.zoom);
    if (Math.abs(this.camera.fov - this.cur.fov) > 0.01) {
      this.camera.fov = this.cur.fov;
      this.camera.updateProjectionMatrix();
    }

    this._focus.copy(focusPos);
    this._focus.y += this.cur.height;
    this.target.lerp(this._focus, 1 - Math.exp(-14 * dt));

    this.kickPitch += (this.kickTarget - this.kickPitch) * (1 - Math.exp(-45 * dt));
    this.kickTarget *= Math.exp(-11 * dt);
    this.kickYaw *= Math.exp(-12 * dt);
    const pitch = this.pitch - this.kickPitch;
    const yaw = this.yaw + this.kickYaw;
    const cp = Math.cos(pitch);
    this._offset.set(Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp);
    this.right(this._right);
    if (eye) {
      this.firstPersonView(dt, eye, focusPos);
      this.applyShake(dt);
      return;
    }
    this.fpSet = false;
    // `frameShift` slides the view sideways (the title screen sets the character right of its menu).
    this.shiftCur = (this.shiftCur ?? 0) + ((this.frameShift ?? 0) - (this.shiftCur ?? 0)) * k;
    const pivot = this._focus.copy(this.target).addScaledVector(this._right, this.cur.shoulder + this.shiftCur);
    // Pull the camera in front of any collider between the player and the desired position.
    let allowed = dist;
    if (world) {
      this._back.copy(this._offset);
      for (const c of world.collidersAlongRay(pivot, this._back, dist)) {
        const t = rayCollider(pivot, this._back, c, 0.25, 0.5, 0.3);
        if (t < allowed) allowed = Math.max(0.6, t - 0.2);
      }
      const tg = world.raycastGround(pivot, this._back, dist);
      if (tg < allowed) allowed = Math.max(0.6, tg - 0.4);
    }
    // Snap in instantly, ease back out so the view doesn't pop.
    if (this.blockedDist === null || allowed < this.blockedDist) this.blockedDist = allowed;
    else this.blockedDist += (allowed - this.blockedDist) * (1 - Math.exp(-5 * dt));
    this.camera.position.copy(pivot).addScaledVector(this._offset, this.blockedDist);
    const floor = (world ? world.groundHeight(this.camera.position.x, this.camera.position.z) : 0) + 0.35;
    if (this.camera.position.y < floor) this.camera.position.y = floor;
    // Indoors the view stays under the ceiling.
    const ceil = (world?.ceilingAt?.(this.camera.position.x, this.camera.position.z) ?? Infinity) - 0.45;
    if (this.camera.position.y > ceil) this.camera.position.y = Math.max(floor, ceil);
    this.camera.lookAt(this.camera.position.x - this._offset.x, this.camera.position.y - this._offset.y, this.camera.position.z - this._offset.z);
    this.applyShake(dt);
  }

  // First person: the camera rides the head, smoothed relative to the body so the gait's bob and
  // sway don't jar, and nudged just forward of the eyes.
  // It looks along yaw/pitch; no orbit, shoulder offset or collision.
  firstPersonView(dt, eye, body) {
    const rel = this._back.subVectors(eye, body);
    if (!this.fpSet) {
      this.fpRel = (this.fpRel ?? new THREE.Vector3()).copy(rel);
      this.fpSet = true;
    }
    this.fpRel.lerp(rel, 1 - Math.exp(-16 * dt));
    this.camera.position.copy(body).add(this.fpRel);
    this.camera.position.x -= Math.sin(this.yaw) * 0.05;
    this.camera.position.z -= Math.cos(this.yaw) * 0.05;
    this.target.copy(this.camera.position);
    this.camera.lookAt(this.camera.position.x - this._offset.x, this.camera.position.y - this._offset.y, this.camera.position.z - this._offset.z);
    // Melee swings tip the view into the stroke (ViewModel sets fpRoll).
    if (this.fpRoll) this.camera.rotateZ(this.fpRoll);
  }

  // Smooth (noise-like) shake rather than per-frame jitter.
  applyShake(dt) {
    this.shakeT += dt;
    if (this.shake > 0) {
      const s = this.shake * this.shake * 0.3;
      const t = this.shakeT * 31;
      this.camera.position.x += (Math.sin(t * 1.13) + Math.sin(t * 2.71) * 0.5) * s * 0.7;
      this.camera.position.y += (Math.sin(t * 1.37 + 1.7) + Math.sin(t * 3.11) * 0.5) * s * 0.7;
      this.camera.rotation.z += Math.sin(t * 0.91 + 0.4) * s * 0.06;
      this.shake = Math.max(0, this.shake - dt * 2.2);
    }
  }
}
