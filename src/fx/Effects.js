// Visual effects: layered explosions, streaking sparks, muzzle flares, slash ribbons, lightning,
// smoke and damage numbers. Glows use procedural soft textures on additive sprites; smoke and
// fireballs are chunky cel-shaded puffs with ink outlines, to sit with the comic look.
import * as THREE from 'three';
import { toonMaterial, addOutline } from '../render/Toon.js';

const DEG = Math.PI / 180;
const _v = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
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
  // Crescent trail: bright outer edge, fading at both ends of the arc (u = along arc, v = radial).
  slash: canvasTexture(256, 64, (g, w, h) => {
    const img = g.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      const v = y / (h - 1);
      const radial = Math.pow(Math.max(0, 1 - Math.abs(v - 0.82) / 0.82), 2.2) + (Math.abs(v - 0.86) < 0.05 ? 0.6 : 0);
      for (let x = 0; x < w; x++) {
        const u = x / (w - 1);
        const a = Math.min(1, radial) * Math.pow(Math.sin(u * Math.PI), 0.7);
        const o = (y * w + x) * 4;
        img.data[o] = img.data[o + 1] = img.data[o + 2] = 255;
        img.data[o + 3] = a * 255;
      }
    }
    g.putImageData(img, 0, 0);
  }),
};

export const FX_TEXTURES = TEX;

const spriteMat = (map, color, opacity = 1, additive = true) => new THREE.SpriteMaterial({
  map, color, transparent: true, opacity, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
});

// Ribbon arc with polar UVs (u along the arc, v from inner to outer radius).
function arcRibbon(inner, outer, start, length, segments = 40) {
  const pos = [];
  const uv = [];
  const idx = [];
  for (let i = 0; i <= segments; i++) {
    const u = i / segments;
    const a = start + u * length;
    for (const [r, v] of [[inner, 0], [outer, 1]]) {
      pos.push(Math.cos(a) * r, Math.sin(a) * r, 0);
      uv.push(u, v);
    }
    if (i < segments) {
      const k = i * 2;
      idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

const puffGeo = new THREE.IcosahedronGeometry(1, 1);
const casingGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.045, 6).rotateZ(Math.PI / 2);
const casingMat = new THREE.MeshToonMaterial({ color: 0xd9a441 });
const decalGeo = new THREE.CircleGeometry(1, 10);
const UP = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion();
const debrisGeo = new THREE.DodecahedronGeometry(0.12, 0);
const SMOKE = new THREE.Color(0x4f4a54);
const WHITE = new THREE.Color(0xffffff);

export class Effects {
  constructor(scene, camera, layer) {
    this.scene = scene;
    this.camera = camera;
    this.layer = layer;
    this.items = [];
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
  spawnSlash(origin, facing, { arc = 120, range = 2.5, color = 0xffffff, height = 1.0, vertical = false } = {}) {
    const a = Math.min(arc, 360) * DEG;
    const geo = vertical ? arcRibbon(range * 0.35, range, -0.45, 2.7) : arcRibbon(range * 0.3, range, -Math.PI / 2 - a / 2, a, Math.max(16, Math.round(a * 12)));
    const mat = new THREE.MeshBasicMaterial({
      map: TEX.slash, color, transparent: true, opacity: 1, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const core = new THREE.MeshBasicMaterial({
      map: TEX.slash, color: 0xffffff, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(geo, mat);
    const inner = new THREE.Mesh(geo, core);
    inner.scale.setScalar(0.98);
    const group = new THREE.Group();
    for (const m of [mesh, inner]) {
      if (vertical) m.rotation.y = -Math.PI / 2;
      else m.rotation.x = -Math.PI / 2;
      group.add(m);
    }
    group.position.copy(origin);
    group.position.y += vertical ? 1.2 : height;
    group.rotation.y = facing;
    this.add(group, 0.24, (k) => {
      mat.opacity = 1 - k;
      core.opacity = 0.7 * (1 - k) * (1 - k);
      group.scale.setScalar(1 + k * 0.15);
    }, () => { geo.dispose(); mat.dispose(); core.dispose(); });
  }

  // ------------------------------------------------------------ hits & guns
  spawnSparks(pos, color = 0xfff2a8, count = 8) {
    this.glow(pos, color, { size: 0.9, life: 0.1, grow: 0.5 });
    this.glow(pos, 0xffffff, { size: 0.45, life: 0.06 });
    for (let i = 0; i < count; i++) {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8 + 0.1, Math.random() - 0.5).normalize().multiplyScalar(rand(5, 11));
      this.streak(pos, v, i % 3 ? color : 0xffffff, { life: rand(0.18, 0.35), length: 0.45, width: 0.05 });
    }
  }

  // Projectile impact: small flare, a few streaks and a smoke wisp.
  spawnImpact(pos, color) {
    this.glow(pos, color, { size: 0.7, life: 0.12, grow: 0.8 });
    this.glow(pos, 0xffffff, { size: 0.35, life: 0.07 });
    for (let i = 0; i < 4; i++) {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.6, Math.random() - 0.5).normalize().multiplyScalar(rand(4, 8));
      this.streak(pos, v, color, { life: 0.2, length: 0.3, width: 0.04 });
    }
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
      for (let i = 0; i < 4; i++) {
        _a.copy(normal).multiplyScalar(-rand(2, 4)).add(_b.set(rand(-3, 3), rand(0, 3), rand(-3, 3)));
        this.streak(pos, _a, i % 2 ? color : 0xff8a5a, { life: rand(0.1, 0.18), length: 0.25, width: 0.035 });
      }
      return;
    }
    this.glow(pos, 0xfff0c8, { size: 0.22, life: 0.04 });
    if (surface === 'hard') {
      for (let i = 0; i < 5; i++) {
        _a.copy(normal).multiplyScalar(rand(3, 7)).add(_b.set(rand(-4, 4), rand(-1, 4), rand(-4, 4)));
        this.streak(pos, _a, i % 3 ? 0xffd27a : 0xffffff, { life: rand(0.12, 0.26), length: 0.22, width: 0.03, gravity: 14 });
      }
      this.spawnPuff(pos, { size: 0.22, life: 0.4, color: 0xa8a39c });
    } else {
      for (let i = 0; i < 4; i++) {
        _a.copy(normal).multiplyScalar(rand(2.5, 5)).add(_b.set(rand(-1.5, 1.5), rand(0, 2), rand(-1.5, 1.5)));
        this.streak(pos, _a, 0x5a4632, { life: rand(0.25, 0.4), length: 0.12, width: 0.03, gravity: 20, drag: 1 });
      }
      this.spawnPuff(pos, { size: 0.45, life: 0.7, color: 0xbfae8e });
    }
    this.decal(pos, normal, surface === 'hard' ? 0.045 : 0.07);
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
  spawnBurst(pos, radius, color) {
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

    // Fireball → smoke: chunky outlined cel puffs that swell, darken and shrink away.
    const puffs = Math.min(14, 5 + Math.round(radius * 2));
    for (let i = 0; i < puffs; i++) {
      const mat = toonMaterial(color);
      mat.emissive.set(color);
      const m = new THREE.Mesh(puffGeo, mat);
      addOutline(m, 0.035);
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.7 + 0.2, Math.random() - 0.5).normalize();
      m.position.copy(center).addScaledVector(dir, radius * rand(0.05, 0.35));
      const vel = dir.clone().multiplyScalar(rand(1.5, 4.5) * (0.6 + radius * 0.15));
      vel.y += rand(0.5, 2);
      const s0 = radius * rand(0.22, 0.38);
      const spin = new THREE.Vector3(rand(-2, 2), rand(-2, 2), rand(-2, 2));
      this.add(m, rand(0.7, 1.1), (k, dt) => {
        vel.multiplyScalar(Math.exp(-2.5 * dt));
        vel.y += 1.5 * dt;
        m.position.addScaledVector(vel, dt);
        m.rotation.x += spin.x * dt;
        m.rotation.y += spin.y * dt;
        const swell = k < 0.2 ? 0.6 + (k / 0.2) * 0.6 : 1.2 * (1 - (k - 0.2) / 0.8);
        m.scale.setScalar(Math.max(0.001, s0 * swell));
        const heat = Math.max(0, 1 - k * 2.2);
        mat.emissive.copy(c).multiplyScalar(heat * 0.9);
        mat.color.copy(c).lerp(SMOKE, Math.min(1, k * 1.8)).lerp(WHITE, heat * 0.25);
      }, () => mat.dispose());
    }

    // Embers + debris
    for (let i = 0; i < Math.min(22, 8 + radius * 3); i++) {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9 + 0.2, Math.random() - 0.5).normalize().multiplyScalar(rand(6, 14));
      this.streak(center, v, i % 2 ? color : 0xffe2a0, { life: rand(0.35, 0.7), length: 0.6, width: 0.06, gravity: 14, drag: 1.2 });
    }
    for (let i = 0; i < 4; i++) {
      const mat = toonMaterial(0x3a3438);
      const d = new THREE.Mesh(debrisGeo, mat);
      addOutline(d, 0.02);
      d.position.copy(center);
      const v = new THREE.Vector3(Math.random() - 0.5, rand(0.6, 1.2), Math.random() - 0.5).normalize().multiplyScalar(rand(5, 9));
      this.add(d, 0.9, (k, dt) => {
        v.y -= 22 * dt;
        d.position.addScaledVector(v, dt);
        d.rotation.x += dt * 9;
        d.rotation.z += dt * 7;
        d.scale.setScalar(1 - k * k);
      }, () => mat.dispose());
    }

    // Scorch mark that lingers on the ground.
    const scGeo = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
    const scMat = new THREE.MeshBasicMaterial({ map: TEX.soft, color: 0x120c0a, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    const scorch = new THREE.Mesh(scGeo, scMat);
    scorch.position.set(pos.x, pos.y + 0.05, pos.z);
    scorch.scale.setScalar(radius * 0.75);
    this.add(scorch, 5, (k) => { scMat.opacity = 0.55 * (1 - k * k); }, () => { scGeo.dispose(); scMat.dispose(); });
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

  damageNumber(pos, text, kind = '', color = null) {
    const el = document.createElement('div');
    el.className = `dmg ${kind}`;
    el.textContent = text;
    if (color) el.style.color = color;
    this.layer.appendChild(el);
    this.numbers.push({ el, pos: pos.clone(), t: 0, life: 0.9, drift: (Math.random() - 0.5) * 0.8 });
  }

  // dt freezes during hitstop; realDt keeps UI-ish things (numbers) moving.
  update(dt, realDt) {
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
      n.pos.y += realDt * 1.4;
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

  clear() {
    for (const c of this.casings) c.m.visible = false;
    for (const d of this.decals) d.m.visible = false;
    for (const it of this.items) { this.scene.remove(it.obj); it.dispose?.(); }
    this.items.length = 0;
    for (const n of this.numbers) n.el.remove();
    this.numbers.length = 0;
    this.flashLevel = 0;
  }
}
