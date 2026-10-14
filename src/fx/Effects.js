// Visual effects: layered explosions, particle sword sweeps, muzzle flares, lightning, smoke and
// damage numbers. Frequent effects use fixed-capacity GPU particle pools; occasional screen-space
// accents use procedural soft textures.
import * as THREE from 'three';
import { ParticleSystem, GLOW_KIND, SOLID_KIND, spray } from '../render/Particles.js';

const DEG = Math.PI / 180;
const _v = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _scale = new THREE.Vector3();
const rand = (a, b) => a + Math.random() * (b - a);

// ---------------------------------------------------------------- procedural textures
function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const TEX = {
  soft: canvasTexture(64, 64, (g, w) => {
    const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.35, 'rgba(255,255,255,0.55)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, w, w);
  }),
  ring: canvasTexture(128, 128, (g, w) => {
    const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    r.addColorStop(0, 'rgba(255,255,255,0)');
    r.addColorStop(0.62, 'rgba(255,255,255,0)');
    r.addColorStop(0.84, 'rgba(255,255,255,1)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, w, w);
  }),
  star: canvasTexture(128, 128, (g, w) => {
    const c = w / 2;
    for (const [sx, sy] of [[1, 0.09], [0.09, 1], [0.55, 0.05], [0.05, 0.55]]) {
      g.save();
      g.translate(c, c);
      if (sx === 0.55 || sy === 0.55) g.rotate(Math.PI / 4);
      g.scale(sx, sy);
      const r = g.createRadialGradient(0, 0, 0, 0, 0, c);
      r.addColorStop(0, 'rgba(255,255,255,1)');
      r.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = r;
      g.beginPath();
      g.arc(0, 0, c, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
  }),
  streak: canvasTexture(128, 16, (g, w, h) => {
    const r = g.createLinearGradient(0, 0, w, 0);
    r.addColorStop(0, 'rgba(255,255,255,0)');
    r.addColorStop(0.75, 'rgba(255,255,255,0.9)');
    r.addColorStop(1, 'rgba(255,255,255,1)');
    g.fillStyle = r;
    const v = g.createLinearGradient(0, 0, 0, h);
    g.fillRect(0, h * 0.3, w, h * 0.4);
    v.addColorStop(0, 'rgba(255,255,255,0)');
    v.addColorStop(0.5, 'rgba(255,255,255,0.4)');
    v.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = v;
    g.globalCompositeOperation = 'lighter';
    g.fillRect(w * 0.5, 0, w * 0.5, h);
  }),
  smoke: canvasTexture(64, 64, (g, w) => {
    for (let i = 0; i < 6; i++) {
      const x = w / 2 + (Math.random() - 0.5) * w * 0.3;
      const y = w / 2 + (Math.random() - 0.5) * w * 0.3;
      const r = g.createRadialGradient(x, y, 0, x, y, w * 0.32);
      r.addColorStop(0, 'rgba(255,255,255,0.5)');
      r.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = r;
      g.fillRect(0, 0, w, w);
    }
  }),
};

export const FX_TEXTURES = TEX;

const spriteMat = (map, color, opacity = 1, additive = true) => new THREE.SpriteMaterial({
  map, color, transparent: true, opacity, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
});

const casingGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.045, 6).rotateZ(Math.PI / 2);
const casingMat = new THREE.MeshToonMaterial({ color: 0xd9a441 });
const decalGeo = new THREE.CircleGeometry(1, 10);
const UP = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion();

export class Effects {
  constructor(scene, camera, layer) {
    this.scene = scene;
    this.camera = camera;
    this.layer = layer;
    this.items = [];
    // Fixed-capacity GPU pools keep frequent combat effects to two instanced draws.
    this.glowParticles = new ParticleSystem(scene, { capacity: 4096 });
    this.solidParticles = new ParticleSystem(scene, { capacity: 2048, solid: true });
    this.smokeParticles = new ParticleSystem(scene, { capacity: 1536, soft: true });
    this.ambientClock = 0;
    this.rainClock = 0;
    this.emberClock = 0;
    this.fireflyClock = 0;
    this.ambientPos = new THREE.Vector3();
    // Reused local lights follow nearby scenery emitters; keeping the pool fixed avoids shader
    // recompiles and the cost of one light for every streamed torch and fire.
    this.sceneryLights = Array.from({ length: 4 }, () => {
      const light = new THREE.PointLight(0xff9a45, 0, 12, 1.8);
      light.castShadow = false;
      scene.add(light);
      return light;
    });
    this.sceneryLightBudget = 2;
    this.numbers = [];
    // One pooled flash light (adding/removing lights would force shader recompiles).
    this.flashLight = new THREE.PointLight(0xffb060, 0, 22, 1.8);
    this.flashLevel = 0;
    scene.add(this.flashLight);
    // Pooled spent casings and bullet holes (recycled oldest-first; no per-shot allocation).
    this.casings = [];
    this.casingIndex = 0;
    for (let i = 0; i < 48; i++) {
      const m = new THREE.Mesh(casingGeo, casingMat);
      m.visible = false;
      m.castShadow = false;
      scene.add(m);
      this.casings.push({ m, v: new THREE.Vector3(), spin: new THREE.Vector3(), life: 0 });
    }
    this.decals = [];
    this.decalIndex = 0;
    for (let i = 0; i < 80; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0x17131a, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
      });
      const m = new THREE.Mesh(decalGeo, mat);
      m.visible = false;
      scene.add(m);
      this.decals.push({ m, life: 0 });
    }
  }

  add(obj, life, onUpdate, dispose) {
    this.scene.add(obj);
    this.items.push({ obj, t: 0, life, onUpdate, dispose });
  }

  setQuality(name) {
    const budgets = name === 'high' ? [4096, 2048, 1400] : name === 'low' ? [720, 360, 220] : [2048, 1024, 700];
    this.glowParticles.setBudget(budgets[0]);
    this.solidParticles.setBudget(budgets[1]);
    this.smokeParticles.setBudget(budgets[2]);
    this.sceneryLightBudget = name === 'high' ? 4 : name === 'low' ? 1 : 2;
  }

  // A camera-facing glow that scales and fades.
  glow(pos, color, { size = 1, grow = 0, life = 0.2, map = TEX.soft, opacity = 1, additive = true, rotation = 0 } = {}) {
    const mat = spriteMat(map, color, opacity, additive);
    mat.rotation = rotation;
    const s = new THREE.Sprite(mat);
    s.position.copy(pos);
    s.scale.setScalar(size);
    this.add(s, life, (k) => {
      s.scale.setScalar(size * (1 + grow * k));
      mat.opacity = opacity * (1 - k) * (1 - k * 0.3);
    }, () => mat.dispose());
    return s;
  }

  // Bright streak that flies along `vel`, oriented to its screen-space motion.
  streak(pos, vel, color, { life = 0.35, length = 0.5, width = 0.06, gravity = 18, drag = 2 } = {}) {
    const mat = spriteMat(TEX.streak, color, 1);
    const s = new THREE.Sprite(mat);
    s.position.copy(pos);
    const v = vel.clone();
    this.add(s, life, (k, dt) => {
      v.y -= gravity * dt;
      v.multiplyScalar(Math.exp(-drag * dt));
      s.position.addScaledVector(v, dt);
      _a.copy(s.position).project(this.camera);
      _b.copy(s.position).addScaledVector(v, 0.02).project(this.camera);
      mat.rotation = Math.atan2((_b.y - _a.y), (_b.x - _a.x) * this.camera.aspect);
      const sp = v.length();
      s.scale.set(length * (0.4 + Math.min(1.5, sp * 0.08)) * (1 - k * 0.5), width, 1);
      mat.opacity = 1 - k * k;
    }, () => mat.dispose());
  }

  flash(pos, color, intensity) {
    this.flashLight.position.copy(pos);
    this.flashLight.color.set(color);
    this.flashLevel = Math.max(this.flashLevel, intensity);
  }

  // ------------------------------------------------------------ melee
  spawnSlash(origin, facing, { arc = 120, range = 2.5, color = 0xffffff, height = 1.0, vertical = false, direction = 1 } = {}) {
    const sweep = Math.min(arc, 360) * DEG;
    const count = arc >= 300 ? 40 : Math.max(18, Math.round(arc * 0.22));
    for (let i = 0; i < count; i++) {
      const t = i / Math.max(1, count - 1);
      const theta = (t - 0.5) * sweep * Math.sign(direction || 1);
      const radius = range * rand(0.78, 0.96);
      const angle = facing + theta;
      const pos = _a.set(origin.x + Math.sin(angle) * radius, origin.y + height + (vertical ? (t - 0.5) * 1.6 : rand(-0.18, 0.18)), origin.z + Math.cos(angle) * radius);
      const radial = _v.set(Math.sin(angle), 0, Math.cos(angle));
      const tangent = _b.set(Math.cos(angle), vertical ? (t < 0.5 ? 0.8 : -0.8) : 0, -Math.sin(angle)).multiplyScalar(Math.sign(direction || 1));
      const vel = tangent.multiplyScalar(rand(7, 11)).addScaledVector(radial, rand(2.5, 4.5));
      this.glowParticles.emit(pos, vel, { life: rand(0.11, 0.2), gravity: 0, drag: 1.8, size: rand(0.03, 0.06), sizeTo: 0.003, color: i % 4 ? color : 0xffffff, to: color, alpha: 1, alphaTo: 0, kind: GLOW_KIND.spark, length: rand(0.24, 0.42) });
    }
  }

  // Sparks leave the weapon's actual head/blade/striking end. Sampling the local model bounds
  // keeps this working for swords, hammers, axes and spears without type-specific offsets.
  spawnWeaponTrail(model, facing, { color = 0xffffff, direction = 1 } = {}) {
    if (!model) return false;
    model.updateWorldMatrix(true, true);
    const inv = new THREE.Matrix4().copy(model.matrixWorld).invert();
    const bounds = new THREE.Box3();
    const meshBounds = new THREE.Box3();
    const relative = new THREE.Matrix4();
    model.traverse((o) => {
      if (!o.isMesh || !o.geometry) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      if (!o.geometry.boundingBox) return;
      relative.multiplyMatrices(inv, o.matrixWorld);
      meshBounds.copy(o.geometry.boundingBox).applyMatrix4(relative);
      bounds.union(meshBounds);
    });
    if (bounds.isEmpty()) return false;
    const z0 = bounds.min.z + (bounds.max.z - bounds.min.z) * 0.54;
    const z1 = bounds.max.z;
    const sign = Math.sign(direction || 1);
    const n = 18;
    for (let i = 0; i < n; i++) {
      const u = 0.35 + Math.random() * 0.65;
      const local = new THREE.Vector3(rand(bounds.min.x, bounds.max.x), rand(bounds.min.y, bounds.max.y), z0 + (z1 - z0) * u);
      const pos = model.localToWorld(local);
      const tangent = _v.set(Math.cos(facing), rand(-0.12, 0.12), -Math.sin(facing)).multiplyScalar(sign * rand(4, 8));
      const radial = _b.set(Math.sin(facing), 0, Math.cos(facing));
      tangent.addScaledVector(radial, rand(1, 3));
      this.glowParticles.emit(pos, tangent, { life: rand(0.1, 0.17), gravity: 0, drag: 2.3, size: rand(0.025, 0.045), sizeTo: 0.002, color, to: color, alpha: 1, alphaTo: 0, kind: GLOW_KIND.spark, length: rand(0.18, 0.32) });
    }
    return true;
  }

  blood(pos, normal, intensity = 1, color = 0x8d1822) {
    const count = Math.max(5, Math.round(9 * intensity));
    for (let i = 0; i < count; i++) {
      const v = _a.copy(normal).multiplyScalar(rand(1.2, 3.8) * intensity);
      v.add(_b.set(rand(-2.2, 2.2), rand(-0.5, 2.5), rand(-2.2, 2.2)));
      this.solidParticles.emit(pos, v, { life: rand(0.35, 0.75), gravity: 10, drag: 0.8, size: rand(0.045, 0.095), sizeTo: 0.008, color, to: color, kind: SOLID_KIND.drop, fade: 0.68 });
    }
  }

  // ------------------------------------------------------------ hits & guns
  spawnSparks(pos, color = 0xfff2a8, count = 8) {
    this.glow(pos, color, { size: 0.9, life: 0.1, grow: 0.5 });
    this.glow(pos, 0xffffff, { size: 0.45, life: 0.06 });
    for (let i = 0; i < count; i++) {
      const v = spray(_v, 0.58, rand(5, 11));
      this.glowParticles.emit(pos, v, { life: rand(0.18, 0.35), gravity: 12, drag: 1.5, size: 0.045, sizeTo: 0.008, color: i % 3 ? color : 0xffffff, to: color, kind: GLOW_KIND.spark, length: 0.32, alpha: 1, alphaTo: 0 });
    }
  }

  directionalSparks(pos, normal, color, count = 5, { reverse = false, speed = 5, gravity = 12 } = {}) {
    const sign = reverse ? -1 : 1;
    for (let i = 0; i < count; i++) {
      const v = _a.copy(normal).multiplyScalar(rand(speed * 0.55, speed * 1.25) * sign);
      v.add(_b.set(rand(-2.5, 2.5), rand(-1.5, 2.5), rand(-2.5, 2.5)));
      this.glowParticles.emit(pos, v, { life: rand(0.12, 0.27), gravity, drag: 1.2, size: 0.035, sizeTo: 0.005, color: i % 3 ? color : 0xffffff, to: color, kind: GLOW_KIND.spark, length: 0.25 });
    }
  }

  // Material-aware debris. Kinds accept the G1 names and the older collision categories.
  surfaceImpact(pos, normal, kind = 'stone', count = 6) {
    const wood = ['wood', 'planks', 'timber', 'beams', 'thatch', 'splinter'].includes(kind);
    const crystal = ['crystal', 'shard'].includes(kind);
    const goo = ['goo', 'resin', 'chitin'].includes(kind);
    const metal = ['metal', 'panels', 'corrugated', 'rust', 'hard'].includes(kind);
    const color = wood ? 0xb98952 : crystal ? 0x9deaff : goo ? 0x8edc58 : metal ? 0xffd27a : 0xb8b0a5;
    for (let i = 0; i < count; i++) {
      const v = spray(_v, 0.45, rand(1.8, metal ? 5.5 : 3.8));
      v.addScaledVector(normal, rand(0.4, 2.2));
      const shape = wood ? SOLID_KIND.splinter : crystal ? SOLID_KIND.shard : goo ? SOLID_KIND.drop : SOLID_KIND.chip;
      this.solidParticles.emit(pos, v, { life: rand(0.35, 0.75), gravity: 11, drag: 0.7, size: rand(0.07, 0.16), sizeTo: 0.01, turn: rand(0, Math.PI * 2), spin: rand(-5, 5), color, to: color, kind: shape, fade: 0.72 });
    }
    if (goo) this.glowParticles.emit(pos, spray(_v, 0.8, 1.5), { life: 0.45, gravity: 2, size: 0.16, sizeTo: 0.04, color, kind: GLOW_KIND.soft, alpha: 0.7 });
  }

  elementHit(pos, element, count = 5) {
    if (element === 'none' || !element) return;
    const colors = { fire: 0xff762e, shock: 0x67dcff, frost: 0xbdefff, corrosive: 0x9be22d };
    const color = colors[element] ?? 0xffffff;
    if (element === 'fire') {
      for (let i = 0; i < count; i++) this.glowParticles.emit(pos, spray(_v, 0.75, rand(1.5, 4)), { life: rand(0.18, 0.36), gravity: -1.8, drag: 1.4, size: 0.045, sizeTo: 0.008, color, kind: GLOW_KIND.ember, alpha: 1, alphaTo: 0 });
    } else if (element === 'shock') {
      for (let i = 0; i < 2; i++) this.glowParticles.emit(pos, spray(_v, 0.5, rand(2, 5)), { life: 0.12, drag: 3, size: 0.045, sizeTo: 0.005, color, kind: GLOW_KIND.spark, length: 0.22 });
    } else if (element === 'frost') {
      for (let i = 0; i < count; i++) this.solidParticles.emit(pos, spray(_v, 0.65, rand(1.2, 3)), { life: rand(0.3, 0.55), gravity: 2.5, drag: 0.7, size: 0.07, sizeTo: 0.005, color, to: 0xffffff, kind: SOLID_KIND.shard, fade: 0.68 });
    } else if (element === 'corrosive') {
      for (let i = 0; i < count; i++) this.solidParticles.emit(pos, spray(_v, 0.55, rand(0.8, 2.2)), { life: rand(0.25, 0.45), gravity: 8, drag: 1, size: 0.065, sizeTo: 0.008, color, to: 0x5c9d1c, kind: SOLID_KIND.drop, fade: 0.62 });
    }
  }

  // Projectile impact: small flare, a few streaks and a smoke wisp.
  spawnImpact(pos, color) {
    this.glow(pos, color, { size: 0.7, life: 0.12, grow: 0.8 });
    this.glow(pos, 0xffffff, { size: 0.35, life: 0.07 });
    for (let i = 0; i < 4; i++) this.glowParticles.emit(pos, spray(_v, 0.55, rand(4, 8)), { life: 0.2, gravity: 7, drag: 1.4, size: 0.035, sizeTo: 0.006, color, kind: GLOW_KIND.spark, length: 0.24 });
    this.spawnPuff(pos, { size: 0.35, life: 0.4 });
  }

  // Muzzle flash: a hot core, a short forward flame along the barrel, side petals, a puff of smoke.
  // Kinetic guns pass `dir`; casters without it get a plain flare.
  spawnMuzzle(pos, color, dir = null, scale = 1) {
    const kinetic = !!dir;
    const c = kinetic ? 0xffc46b : color;
    this.glow(pos, 0xffffff, { size: 0.28 * scale, life: 0.035 });
    this.glow(pos, c, { map: TEX.star, size: 0.55 * scale, life: 0.045, rotation: Math.random() * Math.PI });
    if (kinetic) {
      _v.copy(pos).addScaledVector(dir, 0.18 * scale);
      this.streak(_v, dir.clone().multiplyScalar(2), c, { life: 0.04, length: 0.9 * scale, width: 0.22 * scale, gravity: 0, drag: 0 });
      this.spawnPuff(_v, { size: 0.25 * scale, life: 0.5, color: 0xb9b4ad });
    } else {
      this.glow(pos, color, { size: 1.1 * scale, life: 0.09, opacity: 0.5 });
    }
    this.flash(pos, c, 3 * scale);
  }

  // Bullet hit by surface: 'dirt' kicks up dust and grit, 'hard' throws sparks, 'body' a hit flare.
  // Hard and dirt hits leave a bullet hole oriented to the surface normal.
  bulletImpact(pos, normal, surface, color = 0xffd8a0) {
    if (surface === 'body') {
      this.glow(pos, 0xffffff, { size: 0.32, life: 0.05 });
      this.glow(pos, color, { map: TEX.star, size: 0.6, life: 0.07, rotation: Math.random() * 3 });
      this.directionalSparks(pos, normal, color, 4, { reverse: true, speed: 3, gravity: 4 });
      return;
    }
    this.glow(pos, 0xfff0c8, { size: 0.22, life: 0.04 });
    this.surfaceImpact(pos, normal, surface, surface === 'hard' ? 6 : 5);
    if (['hard', 'metal', 'panels', 'corrugated', 'rust'].includes(surface)) {
      this.directionalSparks(pos, normal, 0xffd27a, 5, { speed: 5, gravity: 14 });
      this.spawnPuff(pos, { size: 0.22, life: 0.4, color: 0xa8a39c });
    } else if (surface === 'dirt' || surface === 'ground') {
      for (let i = 0; i < 4; i++) {
        _a.copy(normal).multiplyScalar(rand(2.5, 5)).add(_b.set(rand(-1.5, 1.5), rand(0, 2), rand(-1.5, 1.5)));
        this.streak(pos, _a, 0x5a4632, { life: rand(0.25, 0.4), length: 0.12, width: 0.03, gravity: 20, drag: 1 });
      }
      this.spawnPuff(pos, { size: 0.45, life: 0.7, color: 0xbfae8e });
    }
    if (surface === 'hard' || surface === 'dirt' || surface === 'ground') this.decal(pos, normal, surface === 'hard' ? 0.045 : 0.07);
  }

  decal(pos, normal, size) {
    const d = this.decals[this.decalIndex];
    this.decalIndex = (this.decalIndex + 1) % this.decals.length;
    d.m.position.copy(pos).addScaledVector(normal, 0.01);
    d.m.quaternion.setFromUnitVectors(_v.set(0, 0, 1), normal);
    d.m.rotateZ(Math.random() * 6);
    d.m.scale.setScalar(size * rand(0.85, 1.2));
    d.m.visible = true;
    d.m.material.opacity = 0.85;
    d.life = 9;
  }

  // Spent casing flicked out of the ejection port; it tumbles, bounces once or twice and fades.
  spawnCasing(pos, vel) {
    const c = this.casings[this.casingIndex];
    this.casingIndex = (this.casingIndex + 1) % this.casings.length;
    c.m.position.copy(pos);
    c.m.visible = true;
    c.m.scale.setScalar(1);
    c.v.copy(vel);
    c.spin.set(rand(-20, 20), rand(-20, 20), rand(-20, 20));
    c.life = 2.2;
  }

  updatePools(dt, ground) {
    for (const c of this.casings) {
      if (!c.m.visible) continue;
      c.life -= dt;
      c.v.y -= 22 * dt;
      c.m.position.addScaledVector(c.v, dt);
      c.m.rotation.x += c.spin.x * dt;
      c.m.rotation.y += c.spin.y * dt;
      c.m.rotation.z += c.spin.z * dt;
      const gy = ground ? ground(c.m.position.x, c.m.position.z) + 0.012 : -Infinity;
      if (c.m.position.y < gy) {
        c.m.position.y = gy;
        if (c.v.y < -1.5) {
          this.onCasing?.(c.m.position);
          c.v.y *= -0.35;
          c.v.x *= 0.5;
          c.v.z *= 0.5;
          c.spin.multiplyScalar(0.5);
        } else {
          c.v.set(0, 0, 0);
          c.spin.set(0, 0, 0);
        }
      }
      if (c.life < 0.4) c.m.scale.setScalar(Math.max(0.01, c.life / 0.4));
      if (c.life <= 0) c.m.visible = false;
    }
    for (const d of this.decals) {
      if (!d.m.visible) continue;
      d.life -= dt;
      if (d.life < 2) d.m.material.opacity = 0.85 * Math.max(0, d.life / 2);
      if (d.life <= 0) d.m.visible = false;
    }
  }

  // Short-lived glow left behind by bolts and orbs.
  spawnMote(pos, color, size = 0.3) {
    this.glow(pos, color, { size, life: 0.25, grow: -0.6, opacity: 0.7 });
  }

  // ------------------------------------------------------------ explosions
  spawnBurst(pos, radius, color, element = 'none') {
    const c = new THREE.Color(color);
    const center = pos.clone();
    if (center.y < 0.4) center.y += 0.4;
    // Flash + plasma core
    this.glow(center, 0xffffff, { size: radius * 1.6, life: 0.12, grow: 0.4 });
    this.glow(center, color, { size: radius * 1.3, life: 0.32, grow: 0.9 });
    this.glow(center, color, { map: TEX.star, size: radius * 2.2, life: 0.14, rotation: Math.random() });
    this.flash(center, color, 30 + radius * 6);

    // Ground shockwave + airborne ring
    const ringGeo = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ map: TEX.ring, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.set(pos.x, pos.y + 0.12, pos.z);
    this.add(ring, 0.4, (k) => {
      ring.scale.setScalar(radius * (0.25 + 1.05 * Math.sqrt(k)));
      ringMat.opacity = 1 - k;
    }, () => { ringGeo.dispose(); ringMat.dispose(); });
    this.glow(center, color, { map: TEX.ring, size: radius * 0.6, grow: 3, life: 0.28, opacity: 0.8 });

    // Fireball → smoke: cel-shaded GPU puffs rise out of the blast and dither away.
    const puffs = Math.min(22, 7 + Math.round(radius * 2.2));
    for (let i = 0; i < puffs; i++) {
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.7 + 0.2, Math.random() - 0.5).normalize();
      const at = center.clone().addScaledVector(dir, radius * rand(0.04, 0.26));
      const vel = dir.multiplyScalar(rand(0.7, 2.2));
      vel.y += rand(0.7, 2.1);
      this.smokeParticles.emit(at, vel, { life: rand(1.2, 1.8), gravity: -0.35, drag: 0.35, size: radius * rand(0.22, 0.34), sizeTo: radius * rand(0.52, 0.78), turn: rand(0, Math.PI * 2), spin: rand(-0.3, 0.3), color: 0x81736e, to: 0x514d54, alpha: 0.34, alphaTo: 0, kind: GLOW_KIND.smoke });
    }

    // The burst's fast debris uses the same fixed-capacity instanced pools as ordinary impacts.
    const count = Math.min(22, 8 + Math.round(radius * 3));
    for (let i = 0; i < count; i++) {
      const v = spray(_v, 0.72, rand(6, 14));
      this.glowParticles.emit(center, v, { life: rand(0.35, 0.7), gravity: 14, drag: 1.2, size: 0.055, sizeTo: 0.008, color: i % 2 ? color : 0xffe2a0, kind: GLOW_KIND.ember, alpha: 1, alphaTo: 0 });
    }
    for (let i = 0; i < 4; i++) {
      const v = spray(_v, 0.65, rand(5, 9));
      this.solidParticles.emit(center, v, { life: 0.9, gravity: 22, drag: 0.25, size: rand(0.14, 0.24), sizeTo: 0.02, turn: rand(0, Math.PI * 2), spin: rand(-8, 8), color: 0x3a3438, kind: SOLID_KIND.chip, fade: 0.7 });
    }

    // Element silhouettes stay distinct even when the blast shares the same damage radius.
    if (element === 'shock') {
      for (let i = 0; i < 3; i++) {
        const end = center.clone().add(spray(_v, 0.5, rand(radius * 0.55, radius)));
        this.spawnBolt(center, end, color);
        const branch = center.clone().lerp(end, rand(0.38, 0.68));
        branch.add(spray(_v, 0.6, radius * 0.42));
        this.spawnBolt(center.clone().lerp(end, 0.5), branch, color);
      }
    } else if (element === 'frost') {
      for (let i = 0; i < 10; i++) this.solidParticles.emit(center, spray(_v, 0.8, rand(3, 8)), { life: 0.7, gravity: 3, drag: 0.35, size: rand(0.11, 0.22), sizeTo: 0.01, turn: rand(0, Math.PI * 2), spin: rand(-3, 3), color: 0xc8f5ff, to: 0x8bd5ed, kind: SOLID_KIND.shard, fade: 0.76 });
      this.spawnPuff(center, { size: radius * 0.7, life: 0.8, color: 0xbdefff });
    } else if (element === 'corrosive') {
      for (let i = 0; i < 9; i++) this.solidParticles.emit(center, spray(_v, 0.55, rand(1.5, 4)), { life: 0.65, gravity: 8, drag: 0.8, size: rand(0.08, 0.15), sizeTo: 0.01, color: 0xa7e53d, to: 0x65a822, kind: SOLID_KIND.drop, fade: 0.7 });
      this.spawnCorrosivePool(center, radius, color);
    }

    // Scorch mark that lingers on the ground.
    const scGeo = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
    const scMat = new THREE.MeshBasicMaterial({ map: TEX.soft, color: 0x120c0a, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    const scorch = new THREE.Mesh(scGeo, scMat);
    scorch.position.set(pos.x, pos.y + 0.05, pos.z);
    scorch.scale.setScalar(radius * 0.75);
    this.add(scorch, 5, (k) => { scMat.opacity = 0.55 * (1 - k * k); }, () => { scGeo.dispose(); scMat.dispose(); });
  }

  spawnCorrosivePool(pos, radius, color) {
    const geo = new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.34, depthWrite: false, side: THREE.DoubleSide });
    const pool = new THREE.Mesh(geo, mat);
    pool.position.set(pos.x, pos.y + 0.045, pos.z);
    this.add(pool, 2.2, (k) => {
      const pulse = 1 + 0.035 * Math.sin(k * 50);
      pool.scale.setScalar(radius * (0.58 + 0.08 * k) * pulse);
      mat.opacity = 0.34 * (1 - k) * (0.85 + 0.15 * Math.sin(k * 44));
    }, () => { geo.dispose(); mat.dispose(); });
    for (let i = 0; i < 8; i++) {
      const at = pos.clone().add(_v.set(rand(-0.45, 0.45), 0.08, rand(-0.45, 0.45)).multiplyScalar(radius));
      this.glowParticles.emit(at, _v.set(rand(-0.12, 0.12), rand(0.35, 0.8), rand(-0.12, 0.12)), { life: rand(0.7, 1.3), gravity: 0.2, drag: 0.4, size: 0.07, sizeTo: 0.025, color, alpha: 0.8, alphaTo: 0, kind: GLOW_KIND.soft });
    }
  }

  // Non-explosive energy pulse (jumps, attunes, teleports): ground ring, air ring and a flare.
  spawnRing(pos, radius, color) {
    const ringGeo = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ map: TEX.ring, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.set(pos.x, pos.y + 0.06, pos.z);
    this.add(ring, 0.35, (k) => { ring.scale.setScalar(radius * (0.3 + Math.sqrt(k))); ringMat.opacity = 1 - k; }, () => { ringGeo.dispose(); ringMat.dispose(); });
    this.glow(pos, color, { map: TEX.ring, size: radius * 0.5, grow: 2.2, life: 0.25, opacity: 0.8 });
    this.glow(pos, color, { size: radius * 0.8, life: 0.15 });
  }

  // A rune burning onto the ground: outer ring, a spinning star glyph and inner ring that tighten
  // as it arms over `duration`.
  spawnRune(pos, radius, color, duration) {
    const group = new THREE.Group();
    group.position.set(pos.x, pos.y + 0.07, pos.z);
    const geo = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
    const mk = (map, opacity) => new THREE.MeshBasicMaterial({ map, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending });
    const ringMat = mk(TEX.ring, 0.9);
    const glyphMat = mk(TEX.star, 0.8);
    const coreMat = mk(TEX.soft, 0.3);
    const ring = new THREE.Mesh(geo, ringMat);
    const inner = new THREE.Mesh(geo, ringMat);
    const glyph = new THREE.Mesh(geo, glyphMat);
    const core = new THREE.Mesh(geo, coreMat);
    group.add(ring, inner, glyph, core);
    this.add(group, duration, (k) => {
      ring.scale.setScalar(radius * (1.25 - 0.2 * k));
      inner.scale.setScalar(radius * 0.62 * (1 - 0.3 * k));
      glyph.scale.setScalar(radius * 0.95);
      glyph.rotation.y = k * 3;
      inner.rotation.y = -k * 2;
      core.scale.setScalar(radius * (0.4 + 0.9 * k));
      ringMat.opacity = 0.6 + 0.4 * Math.sin(k * 25);
      coreMat.opacity = 0.2 + 0.5 * k;
    }, () => { geo.dispose(); ringMat.dispose(); glyphMat.dispose(); coreMat.dispose(); });
    this.glow(pos, color, { size: radius * 0.6, life: 0.12 });
  }

  // Column of light where a rune detonates.
  spawnPillar(pos, radius, color) {
    const h = 3.5 + radius;
    const geo = new THREE.CylinderGeometry(radius * 0.18, radius * 0.32, h, 18, 1, true);
    geo.translate(0, h / 2, 0);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const core = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const m = new THREE.Mesh(geo, mat);
    const c = new THREE.Mesh(geo, core);
    c.scale.set(0.35, 1, 0.35);
    const g = new THREE.Group();
    g.add(m, c);
    g.position.copy(pos);
    this.add(g, 0.35, (k) => {
      g.scale.set(1 + k * 0.5, 1 - k * 0.3, 1 + k * 0.5);
      mat.opacity = 0.5 * (1 - k);
      core.opacity = 0.8 * (1 - k) * (1 - k);
    }, () => { geo.dispose(); mat.dispose(); core.dispose(); });
  }

  // Ground warning for area attacks: an outer ring plus a disc that fills in until impact.
  spawnTelegraph(pos, radius, duration, color = 0xff3a1a) {
    const group = new THREE.Group();
    group.position.set(pos.x, pos.y + 0.08, pos.z);
    const geo = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ map: TEX.ring, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const ring = new THREE.Mesh(geo, ringMat);
    ring.scale.setScalar(radius * 1.08);
    const fillMat = new THREE.MeshBasicMaterial({ map: TEX.soft, color, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending });
    const fill = new THREE.Mesh(geo, fillMat);
    group.add(ring, fill);
    this.add(group, duration, (k) => {
      fill.scale.setScalar(Math.max(0.01, k) * radius * 1.3);
      ringMat.opacity = 0.55 + 0.45 * Math.sin(k * 30);
    }, () => { geo.dispose(); ringMat.dispose(); fillMat.dispose(); });
  }

  // Jagged arc of lightning: a hot core tube inside a wider glow, with flares at both ends.
  spawnBolt(from, to, color) {
    const pts = [];
    const steps = 8;
    for (let i = 0; i <= steps; i++) {
      _v.lerpVectors(from, to, i / steps);
      const j = i === 0 || i === steps ? 0 : 0.4;
      pts.push(new THREE.Vector3(_v.x + (Math.random() - 0.5) * j, (_v.y || 1.1) + (Math.random() - 0.5) * j, _v.z + (Math.random() - 0.5) * j));
    }
    const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.1);
    const coreGeo = new THREE.TubeGeometry(curve, 32, 0.03, 4);
    const glowGeo = new THREE.TubeGeometry(curve, 32, 0.11, 6);
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const glowMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending });
    const group = new THREE.Group();
    group.add(new THREE.Mesh(coreGeo, coreMat), new THREE.Mesh(glowGeo, glowMat));
    this.add(group, 0.2, (k) => { coreMat.opacity = 1 - k; glowMat.opacity = 0.45 * (1 - k); }, () => {
      coreGeo.dispose(); glowGeo.dispose(); coreMat.dispose(); glowMat.dispose();
    });
    this.glow(pts[0], color, { size: 0.6, life: 0.15 });
    this.glow(pts[steps], color, { map: TEX.star, size: 0.9, life: 0.18, rotation: Math.random() });
  }

  // Soft dust / smoke puff.
  spawnPuff(pos, { size = 0.5, life = 0.6, color = 0xc8c2b8 } = {}) {
    const s = this.glow(pos, color, { map: TEX.smoke, size: size * 0.6, grow: 1.6, life, opacity: 0.55, additive: false, rotation: Math.random() * 6 });
    const drift = new THREE.Vector3((Math.random() - 0.5) * 0.4, 0.5, (Math.random() - 0.5) * 0.4);
    const item = this.items[this.items.length - 1];
    const base = item.onUpdate;
    item.onUpdate = (k, dt) => { base(k, dt); s.position.addScaledVector(drift, dt); };
  }

  damageNumber(pos, text, kind = '', color = null, icon = null) {
    const el = document.createElement('div');
    el.className = `dmg ${kind}`;
    el.textContent = text;
    if (icon === 'weakpoint') {
      const marker = document.createElement('span');
      marker.className = 'dmg-weakpoint-icon';
      marker.setAttribute('role', 'img');
      marker.setAttribute('aria-label', 'Weak point');
      el.append(marker);
    }
    if (color) el.style.color = color;
    this.layer.appendChild(el);
    this.numbers.push({ el, pos: pos.clone(), t: 0, life: 0.9, drift: (Math.random() - 0.5) * 0.8 });
  }

  // dt freezes during hitstop; realDt keeps UI-ish things (numbers) moving.
  update(dt, realDt, focus = null, biome = null, worldTime = 0, flames = null) {
    this.glowParticles.update(dt, this.camera);
    this.solidParticles.update(dt, this.camera);
    this.smokeParticles.update(dt, this.camera);
    if (focus && biome) this.updateAmbient(dt, focus, biome, worldTime, flames);
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      const k = Math.min(it.t / it.life, 1);
      it.onUpdate?.(k, dt);
      if (k >= 1) {
        this.scene.remove(it.obj);
        it.dispose?.();
        this.items.splice(i, 1);
      }
    }
    this.flashLevel *= Math.exp(-14 * realDt);
    this.flashLight.intensity = this.flashLevel < 0.05 ? 0 : this.flashLevel;

    const w = window.innerWidth;
    const h = window.innerHeight;
    for (let i = this.numbers.length - 1; i >= 0; i--) {
      const n = this.numbers[i];
      n.t += realDt;
      n.pos.y += realDt * 0.45;
      n.pos.x += realDt * n.drift;
      const k = n.t / n.life;
      if (k >= 1) {
        n.el.remove();
        this.numbers.splice(i, 1);
        continue;
      }
      _v.copy(n.pos).project(this.camera);
      if (_v.z > 1) { n.el.style.opacity = 0; continue; }
      const x = ((_v.x + 1) / 2) * w;
      const y = ((1 - _v.y) / 2) * h;
      const s = k < 0.15 ? 1.6 - (k / 0.15) * 0.6 : 1;
      n.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${s})`;
      n.el.style.opacity = k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1;
    }
  }

  // Lightweight biome ambience in a player-centred volume; particles travel on the GPU after birth.
  updateAmbient(dt, focus, biome, worldTime, flames) {
    const snow = biome === 'snow';
    const leaves = biome === 'forest';
    const crystal = biome === 'crystal';
    const highland = biome === 'highland';
    const mountain = biome === 'mountain';
    const ash = biome === 'ash';
    const rate = ({ snow: 18, forest: 1.5, fungal: 8, jungle: 7, marsh: 5, desert: 5, badlands: 7, ash: 8, meadow: 5, highland: 3, mountain: 3, crystal: 2 })[biome] ?? 0;
    if (rate) this.ambientClock += dt;
    else this.ambientClock = 0;
    const interval = rate ? 1 / rate : Infinity;
    while (this.ambientClock >= interval) {
      this.ambientClock -= interval;
      const radius = snow || leaves ? 13 : mountain ? 12 : 9;
      const y = snow ? rand(3, 9) : leaves ? rand(2, 7) : mountain ? rand(2, 6) : rand(0.35, 3.8);
      this.ambientPos.set(focus.x + rand(-radius, radius), focus.y + y, focus.z + rand(-radius, radius));
      if (snow) {
        _v.set(rand(-0.18, 0.18), -rand(0.35, 0.8), rand(-0.18, 0.18));
        this.solidParticles.emit(this.ambientPos, _v, { life: 5, gravity: 0, drag: 0, size: rand(0.07, 0.13), sizeTo: 0.045, kind: SOLID_KIND.flake, color: 0xd8f1ff, to: 0xb8d9ef, fade: 0.8, spin: rand(-0.5, 0.5) });
      } else if (leaves) {
        this.solidParticles.emit(this.ambientPos, spray(_v, 0.15, rand(0.25, 0.7)), { life: 4, gravity: 2.2, drag: 0.12, size: rand(0.11, 0.18), sizeTo: 0.035, turn: rand(0, Math.PI * 2), spin: rand(-1.5, 1.5), kind: SOLID_KIND.leaf, color: Math.random() < 0.5 ? 0x718f42 : 0xb58a35, to: 0x806b36, fade: 0.75 });
      } else if (crystal) {
        this.solidParticles.emit(this.ambientPos, spray(_v, 0.3, rand(0.08, 0.22)), { life: rand(2.4, 4), gravity: -0.015, drag: 0.08, size: rand(0.035, 0.07), sizeTo: 0.008, turn: rand(0, Math.PI * 2), spin: rand(-0.5, 0.5), color: Math.random() < 0.5 ? 0x9deaff : 0xd6baff, to: 0x82c9ed, kind: SOLID_KIND.shard, fade: 0.72 });
      } else if (mountain) {
        _v.set(rand(-7, -3), rand(-0.25, 0.25), rand(-1.4, 1.4));
        this.glowParticles.emit(this.ambientPos, _v, { life: rand(0.7, 1.3), gravity: 0, drag: 0.05, size: 0.014, sizeTo: 0.004, color: 0xd4e4e8, to: 0xb8cbd4, alpha: 0.38, alphaTo: 0, kind: GLOW_KIND.spark, length: rand(0.45, 0.8) });
      } else if (highland) {
        _v.set(rand(0.25, 0.75), rand(-0.05, 0.25), rand(-0.2, 0.2)).multiplyScalar(rand(0.3, 0.8));
        this.solidParticles.emit(this.ambientPos, _v, { life: rand(2.8, 4.2), gravity: 1.3, drag: 0.08, size: rand(0.055, 0.11), sizeTo: 0.012, turn: rand(0, Math.PI * 2), spin: rand(-1.2, 1.2), color: 0xb8a65c, to: 0x877747, kind: SOLID_KIND.leaf, fade: 0.75 });
      } else {
        const colors = {
          fungal: [0xb58be2, 0x9d72d8], jungle: [0xb8df75, 0x8fcf69], marsh: [0x91c4ac, 0x75a894],
          desert: [0xe3c58f, 0xc7a475], badlands: [0xc58c65, 0xa66e50], ash: [0xc17c4e, 0x865b4e],
          meadow: [0xf2d88c, 0xd8be72],
        }[biome] ?? [0xc7a475, 0xc7a475];
        const hot = ash && Math.random() < 0.32;
        this.glowParticles.emit(this.ambientPos, spray(_v, 0.35, rand(0.08, hot ? 0.38 : 0.28)), { life: rand(2.8, 4.5), gravity: hot ? -0.05 : -0.025, drag: 0.08, size: rand(0.025, 0.06), sizeTo: 0.01, color: hot ? 0xff8442 : colors[0], to: colors[1], alpha: biome === 'desert' || biome === 'badlands' ? 0.48 : 0.64, alphaTo: 0, kind: hot ? GLOW_KIND.ember : GLOW_KIND.mote });
      }
    }

    // Fireflies gather among forest leaves at night; their low birth rate keeps them inside the
    // same fixed GPU pool budget as the other ambient effects.
    const night = Math.sin(worldTime * 0.022 + 0.7) < -0.35;
    if (leaves && night) {
      this.fireflyClock += dt;
      while (this.fireflyClock >= 0.25) {
        this.fireflyClock -= 0.25;
        this.ambientPos.set(focus.x + rand(-13, 13), focus.y + rand(0.4, 3.5), focus.z + rand(-13, 13));
        const color = Math.random() < 0.5 ? 0xb9ee72 : 0xffd978;
        this.glowParticles.emit(this.ambientPos, spray(_v, 0.12, 0.04), { life: rand(2.2, 3.8), gravity: 0, drag: 0.15, size: rand(0.035, 0.065), sizeTo: 0.025, color, to: color, alpha: 0.82, alphaTo: 0.12, kind: GLOW_KIND.mote });
      }
    } else this.fireflyClock = 0;

    // A slow, deterministic wet-biome weather cycle; rain remains a modest streak effect in the
    // glow pool and stops automatically outside jungle and marsh.
    const raining = (biome === 'jungle' || biome === 'marsh') && Math.sin(worldTime * 0.022 + 0.7) > 0.15;
    if (!raining) this.rainClock = 0;
    else {
      this.rainClock += dt;
      while (this.rainClock >= 1 / 55) {
        this.rainClock -= 1 / 55;
        this.ambientPos.set(focus.x + rand(-16, 16), focus.y + rand(7, 13), focus.z + rand(-16, 16));
        _v.set(rand(-0.25, 0.25), -rand(13, 18), rand(-0.25, 0.25));
        this.glowParticles.emit(this.ambientPos, _v, { life: 0.58, gravity: 0, drag: 0, size: 0.018, sizeTo: 0.008, color: 0x9bc9dc, to: 0x9bc9dc, alpha: 0.34, alphaTo: 0, kind: GLOW_KIND.spark, length: 0.24 });
      }
    }

    // A few upward embers drift from the closest visible world flames.
    this.emberClock += dt;
    if (flames?.length && this.emberClock >= 0.06) {
      this.emberClock %= 0.06;
      const nearby = [];
      for (const flame of flames) {
        if (!flame.group?.parent) continue;
        flame.group.updateWorldMatrix(true, false);
        flame.group.getWorldPosition(_v);
        flame.group.getWorldScale(_scale);
        const d2 = _v.distanceToSquared(focus);
        if (d2 < 32 * 32) nearby.push({ ...flame, source: flame, sourceScale: Math.max(0.45, flame.size ?? 1) * Math.max(0.45, (_scale.x + _scale.y + _scale.z) / 3), d2 });
      }
      nearby.sort((a, b) => a.d2 - b.d2);
      const lit = nearby.filter((f) => f.d2 < 19 * 19).slice(0, this.sceneryLightBudget);
      for (let i = 0; i < this.sceneryLights.length; i++) {
        const light = this.sceneryLights[i];
        const flame = lit[i];
        if (!flame) { light.intensity = 0; continue; }
        flame.group.getWorldPosition(light.position);
        light.position.y += 0.55;
        const source = flame;
        const colors = source.colors ?? [0xff7a1a];
        light.color.set(colors[0] ?? 0xff7a1a);
        const base = (source?.base || (colors[0] === 0xc46aff ? 5.5 : colors[0] === 0x8ae8ff ? 9 : 7.5)) * flame.sourceScale;
        // Firelight wanders slowly; keep the range narrow so nearby surfaces never strobe.
        const phase = source?.seed ?? 0;
        const pulse = 0.98 + Math.sin(worldTime * 1.1 + phase) * 0.012 + Math.sin(worldTime * 2.3 + phase * 1.7) * 0.008;
        light.intensity = i < this.sceneryLightBudget ? base * pulse : 0;
        light.distance = (colors[0] === 0xc46aff ? 10 : 13) * flame.sourceScale;
      }
      for (const flame of nearby.slice(0, 3)) {
        flame.group.getWorldPosition(this.ambientPos);
        const hot = flame.colors?.[0] ?? 0xff7a1a;
        const tip = flame.colors?.[1] ?? 0xffd84a;
        // A wide, almost stationary bed of fire fills the mouth of each emitter. Long-lived
        // overlapping particles keep the base solid while the smaller tongues rise above it.
        if (worldTime >= (flame.source.baseNext ?? -Infinity)) {
          const initialBed = flame.source.baseNext == null;
          const n = initialBed ? 10 : 1;
          for (let i = 0; i < n; i++) {
            const angle = initialBed ? (i / n) * Math.PI * 2 + rand(-0.24, 0.24) : rand(0, Math.PI * 2);
            const radius = initialBed ? rand(0.16, 0.38) : rand(0.19, 0.36);
            _a.copy(this.ambientPos).add(_b.set(Math.cos(angle) * radius, 0.04, Math.sin(angle) * radius).multiplyScalar(flame.sourceScale));
            const size = rand(0.48, 0.88) * flame.sourceScale;
            this.glowParticles.emit(_a, _v.set(rand(-0.035, 0.035), rand(-0.015, 0.035), rand(-0.035, 0.035)).multiplyScalar(flame.sourceScale), { life: rand(6.5, 9.5), gravity: 0, drag: 0, size, sizeTo: size * rand(0.88, 1.12), turn: angle * 0.12 + rand(-0.2, 0.2), spin: rand(-0.035, 0.035), color: hot, to: hot, alpha: 0.82, alphaTo: 0.72, kind: GLOW_KIND.flame, length: rand(0.95, 1.4) });
          }
          flame.source.baseNext = worldTime + (initialBed ? 0.3 : rand(0.34, 0.48));
        }
        // A few broad outer tongues and hotter inner licks rise above the stationary base.
        for (let i = 0; i < 2; i++) {
          _a.copy(this.ambientPos).add(_b.set(rand(-0.12, 0.12), rand(0.02, 0.1), rand(-0.12, 0.12)).multiplyScalar(flame.sourceScale));
          const size = rand(0.24, 0.5) * flame.sourceScale;
          this.glowParticles.emit(_a, _v.set(rand(-0.32, 0.32), rand(0.62, 1.15), rand(-0.32, 0.32)).multiplyScalar(flame.sourceScale), { life: rand(0.65, 1.25), gravity: -0.08, drag: 0.52, size, sizeTo: size * rand(0.3, 0.62), turn: rand(-0.3, 0.3), spin: rand(-0.32, 0.32), color: hot, to: hot, alpha: 0.9, alphaTo: 0.72, kind: GLOW_KIND.flame, length: rand(0.38, 0.78) });
        }
        for (let i = 0; i < 2; i++) {
          _a.copy(this.ambientPos).add(_b.set(rand(-0.07, 0.07), rand(0.02, 0.12), rand(-0.07, 0.07)).multiplyScalar(flame.sourceScale));
          const size = rand(0.13, 0.34) * flame.sourceScale;
          this.glowParticles.emit(_a, _v.set(rand(-0.24, 0.24), rand(0.82, 1.42), rand(-0.24, 0.24)).multiplyScalar(flame.sourceScale), { life: rand(0.5, 1.05), gravity: -0.04, drag: 0.62, size, sizeTo: size * rand(0.22, 0.48), turn: rand(-0.25, 0.25), spin: rand(-0.28, 0.28), color: tip, to: hot, alpha: 0.9, alphaTo: 0.68, kind: GLOW_KIND.flame, length: rand(0.32, 0.64) });
        }
        if (Math.random() < 0.58) {
          _a.copy(this.ambientPos).add(_b.set(rand(-0.06, 0.06), 0.08, rand(-0.06, 0.06)).multiplyScalar(flame.sourceScale));
          this.glowParticles.emit(_a, _v.set(rand(-0.35, 0.35), rand(1.4, 2.7), rand(-0.35, 0.35)).multiplyScalar(flame.sourceScale), { life: rand(0.55, 1.05), gravity: 0.55, drag: 0.25, size: rand(0.018, 0.032) * flame.sourceScale, sizeTo: 0.004 * flame.sourceScale, color: tip, to: hot, alpha: 0.9, alphaTo: 0, kind: GLOW_KIND.ember });
        }
        if (worldTime >= (flame.source.smokeNext ?? -Infinity)) {
          _a.copy(this.ambientPos).add(_b.set(rand(-0.08, 0.08), 0.16, rand(-0.08, 0.08)).multiplyScalar(flame.sourceScale));
          this.smokeParticles.emit(_a, _v.set(rand(-0.28, 0.28), rand(0.45, 0.8), rand(-0.28, 0.28)).multiplyScalar(flame.sourceScale), { life: rand(2.1, 3.4), gravity: -0.06, drag: 0.12, size: rand(0.2, 0.32) * flame.sourceScale, sizeTo: rand(0.62, 0.92) * flame.sourceScale, turn: rand(-0.5, 0.5), spin: rand(-0.24, 0.24), color: 0x77716d, to: 0x484951, alpha: 0.22, alphaTo: 0, kind: GLOW_KIND.smoke });
          flame.source.smokeNext = worldTime + rand(0.28, 0.42);
        }
      }
    } else for (const light of this.sceneryLights) light.intensity = 0;
  }

  clear() {
    this.glowParticles.clear();
    this.solidParticles.clear();
    this.smokeParticles.clear();
    this.ambientClock = 0;
    this.rainClock = 0;
    this.emberClock = 0;
    this.fireflyClock = 0;
    for (const c of this.casings) c.m.visible = false;
    for (const d of this.decals) d.m.visible = false;
    for (const it of this.items) { this.scene.remove(it.obj); it.dispose?.(); }
    this.items.length = 0;
    for (const n of this.numbers) n.el.remove();
    this.numbers.length = 0;
    this.flashLevel = 0;
  }
}
