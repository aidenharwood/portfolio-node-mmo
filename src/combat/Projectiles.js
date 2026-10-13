// Everything that flies: ballistic bullets (hundreds of m/s, drawn as thin camera-facing tracer
// streaks), rockets that accelerate on a motor, crossbow quarrels and arrows that arc, and spell
// bolts/orbs. All of them sweep their whole frame's travel as a ray against characters, world
// colliders and terrain, so even a 900 m/s sniper round can't tunnel through anything.
import * as THREE from 'three';
import { addOutline } from '../render/Toon.js';
import { FX_TEXTURES } from '../fx/Effects.js';
import { dealDamage } from './Damage.js';
import { PERKS } from '../items/perks.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rayBoxCollider } from './Aim.js';

const arrowGeo = (() => {
  const shaft = new THREE.CylinderGeometry(0.015, 0.015, 0.7, 5).rotateX(Math.PI / 2).toNonIndexed();
  const head = new THREE.ConeGeometry(0.04, 0.12, 5).rotateX(Math.PI / 2).translate(0, 0, 0.4).toNonIndexed();
  const fin = new THREE.BoxGeometry(0.08, 0.005, 0.1).translate(0, 0, -0.3).toNonIndexed();
  for (const g of [shaft, head, fin]) g.deleteAttribute('uv');
  return mergeGeometries([shaft, head, fin]);
})();

const rocketGeo = (() => {
  const body = new THREE.CylinderGeometry(0.07, 0.07, 0.45, 8).rotateX(Math.PI / 2).toNonIndexed();
  const nose = new THREE.ConeGeometry(0.07, 0.16, 8).rotateX(Math.PI / 2).translate(0, 0, 0.3).toNonIndexed();
  const fins = new THREE.BoxGeometry(0.24, 0.02, 0.1).translate(0, 0, -0.2).toNonIndexed();
  const fins2 = new THREE.BoxGeometry(0.02, 0.24, 0.1).translate(0, 0, -0.2).toNonIndexed();
  for (const g of [body, nose, fins, fins2]) g.deleteAttribute('uv');
  return mergeGeometries([body, nose, fins, fins2]);
})();

const bombGeo = (() => {
  const body = new THREE.SphereGeometry(0.16, 12, 9).toNonIndexed();
  const cap = new THREE.CylinderGeometry(0.05, 0.06, 0.08, 8).translate(0, 0.17, 0).toNonIndexed();
  for (const g of [body, cap]) g.deleteAttribute('uv');
  return mergeGeometries([body, cap]);
})();

const GEO = {
  bomb: bombGeo,
  web: new THREE.IcosahedronGeometry(0.2, 0),
  rocket: rocketGeo,
  quarrel: arrowGeo,
  bolt: new THREE.OctahedronGeometry(0.18),
  orb: new THREE.SphereGeometry(0.3, 14, 10),
  arrow: arrowGeo,
};

const materials = new Map();
function material(color) {
  if (!materials.has(color)) materials.set(color, new THREE.MeshBasicMaterial({ color }));
  return materials.get(color);
}

const cache = new Map();
function cached(key, make) {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
}
const glowSprite = (color, size, opacity = 1) => {
  const mat = cached(`s${color}:${opacity}`, () => new THREE.SpriteMaterial({
    map: FX_TEXTURES.soft, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  const s = new THREE.Sprite(mat);
  s.scale.setScalar(size);
  return s;
};
const hot = (color) => new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.55).getHex();

// Bodies for the slower projectiles (bullets have no body — only a tracer).
function makeVisual(kind, color) {
  const g = new THREE.Group();
  const body = kind === 'bomb' ? 0x2a2a30 : kind === 'bolt' || kind === 'orb' ? hot(color) : color;
  const mesh = new THREE.Mesh(GEO[kind], material(body));
  addOutline(mesh, 0.02);
  g.add(mesh);
  if (kind === 'bolt') g.add(glowSprite(color, 0.9, 0.9));
  if (kind === 'orb') { g.add(glowSprite(color, 1.6, 0.8)); g.add(glowSprite(0xffffff, 0.5, 0.8)); }
  if (kind === 'rocket') {
    const ex = glowSprite(0xffc070, 0.9, 1);
    ex.position.z = -0.32;
    g.add(ex);
  }
  if (kind === 'bomb') {
    const fuse = glowSprite(color, 0.45, 1);
    fuse.position.y = 0.24;
    g.add(fuse);
    g.add(glowSprite(color, 0.9, 0.25));
  }
  if (kind === 'web') g.add(glowSprite(0xffffff, 0.8, 0.35));
  if (kind === 'quarrel') {
    const tip = glowSprite(color, 0.3, 1);
    tip.position.z = 0.4;
    g.add(tip);
  }
  return g;
}

// ---------------------------------------------------------------- tracers
// A pooled camera-facing quad stretched from the round's tail to its head (head at local x = 0).
const TRACER_GEO = new THREE.PlaneGeometry(1, 1).translate(-0.5, 0, 0);
const KINETIC = 0xffd8a0;
const NO_TARGETS = [];

class TracerPool {
  constructor(scene, size = 96) {
    this.free = [];
    for (let i = 0; i < size; i++) {
      const mat = new THREE.MeshBasicMaterial({
        map: FX_TEXTURES.streak, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      });
      const m = new THREE.Mesh(TRACER_GEO, mat);
      m.visible = false;
      m.frustumCulled = false;
      scene.add(m);
      this.free.push(m);
    }
  }

  take() { return this.free.pop() ?? null; }

  give(m) {
    m.visible = false;
    this.free.push(m);
  }
}

const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _m = new THREE.Matrix4();
function placeTracer(mesh, head, dir, length, width, camera) {
  _x.copy(dir);
  _z.subVectors(camera.position, head);
  _z.addScaledVector(_x, -_z.dot(_x));
  if (_z.lengthSq() < 1e-8) _z.set(0, 1, 0);
  _z.normalize();
  _y.crossVectors(_z, _x);
  _m.makeBasis(_x, _y, _z);
  mesh.quaternion.setFromRotationMatrix(_m);
  mesh.position.copy(head);
  mesh.scale.set(Math.max(0.05, length), width, 1);
}

// ---------------------------------------------------------------- swept collision
// Ray vs capped vertical cylinder: distance along `d` (unit) or Infinity.
function rayCapsuleCyl(o, d, cx, cz, r, y0, y1) {
  let best = Infinity;
  const ox = o.x - cx;
  const oz = o.z - cz;
  const a = d.x * d.x + d.z * d.z;
  if (a > 1e-8) {
    const b = 2 * (ox * d.x + oz * d.z);
    const c = ox * ox + oz * oz - r * r;
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const sq = Math.sqrt(disc);
      for (const t of [(-b - sq) / (2 * a), (-b + sq) / (2 * a)]) {
        if (t < 0) continue;
        const y = o.y + d.y * t;
        if (y >= y0 && y <= y1) { best = Math.min(best, t); break; }
      }
    }
  }
  if (Math.abs(d.y) > 1e-6) {
    for (const cap of [y1, y0]) {
      const t = (cap - o.y) / d.y;
      if (t < 0 || t >= best) continue;
      const x = ox + d.x * t;
      const z = oz + d.z * t;
      if (x * x + z * z <= r * r) best = t;
    }
  }
  // Starting inside counts as an immediate hit.
  if (ox * ox + oz * oz <= r * r && o.y >= y0 && o.y <= y1) best = 0;
  return best;
}

const _from = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _n = new THREE.Vector3();
const _hit = new THREE.Vector3();
const _look = new THREE.Vector3();
const _hits = [];

export class Projectiles {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.tracers = new TracerPool(game.scene);
  }

  /**
   * kind: 'bullet' | 'bolt' | 'orb' | 'rocket' | 'quarrel' | 'arrow' | 'bomb'. direction is 3D.
   * aoe > 0 explodes on impact/expiry (then `onBurst(pos)`, if given). accel/maxSpeed give rockets
   * a motor. `quiet`: not re-created on other screens as a shot (abilities send their own).
   */
  spawn(o) {
    const size = o.size ?? 1;
    const velocity = o.direction.clone().normalize().multiplyScalar(o.speed);
    const perkPierce = o.weapon ? o.weapon.perks.reduce((n, id) => n + (PERKS[id].pierce ?? 0), 0) : 0;
    const p = {
      ...o,
      pos: o.origin.clone(),
      velocity,
      gravity: o.gravity ?? 0,
      life: o.life ?? 1.5,
      radius: (o.radius ?? (o.kind === 'bullet' ? 0.04 : 0.18)) * size,
      aoe: o.aoe ?? 0,
      pierce: (o.pierce ?? 0) + perkPierce,
      hitSet: new Set(),
      traveled: 0,
      mesh: null,
      tracer: null,
    };
    if (o.kind === 'bullet') {
      p.tracer = this.tracers.take();
      if (p.tracer) {
        p.tracer.material.color.set(o.tracerColor ?? KINETIC);
        p.tracer.material.opacity = o.bright ? 1 : 0.7;
        p.tracerWidth = (o.bright ? 0.13 : 0.075) * (o.tracerScale ?? 1);
        p.tracerLen = Math.min(20, o.speed * 0.024);
      }
    } else {
      p.mesh = makeVisual(o.kind, o.color);
      p.mesh.scale.setScalar(size);
      p.mesh.position.copy(p.pos);
      p.mesh.lookAt(_look.copy(p.pos).add(velocity));
      this.game.scene.add(p.mesh);
    }
    this.list.push(p);
    if (o.owner === this.game.player && !o.quiet) this.game.net?.shotFx(o);
    return p;
  }

  update(dt) {
    const g = this.game;
    const world = g.world;
    const cam = g.camera;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      // A spent round's tracer lingers one frame so its last stretch is seen.
      if (p.spent) { this.remove(i); continue; }

      p.life -= dt;
      // A bomb that has landed sits on its fuse, then goes off.
      if (p.resting) {
        p.mesh.scale.setScalar((p.size ?? 1) * (1 + 0.25 * Math.max(0, Math.sin(p.life * 30))));
        if (p.life <= 0) {
          g.explode(p.pos, p.aoe, p.damage, p.owner, p.weapon, { color: p.color, knockback: p.knockback, scaled: p.scaled, element: p.element, inflict: p.inflict });
          p.onBurst?.(p.pos.clone());
          this.remove(i);
        }
        continue;
      }
      p.velocity.y -= p.gravity * dt;
      if (p.accel) {
        const sp = p.velocity.length();
        if (sp < p.maxSpeed) p.velocity.multiplyScalar(Math.min(p.maxSpeed, sp + p.accel * dt) / sp);
      }
      if (p.homing && !(p.homing.time !== undefined && (p.homing.time -= dt) <= 0)) this.steer(p, dt);
      if (p.kind === 'rocket') {
        p.puff = (p.puff ?? 0) - dt;
        if (p.puff <= 0) { p.puff = 0.02; g.effects.spawnPuff(p.pos, { size: 0.5, life: 0.8, color: 0xc8c2b8 }); }
      } else if (p.kind === 'bomb') {
        p.puff = (p.puff ?? 0) - dt;
        if (p.puff <= 0) { p.puff = 0.04; g.effects.spawnPuff(p.pos, { size: 0.3, life: 0.4, color: 0x8a847c }); }
      } else if (p.kind === 'bolt' || p.kind === 'orb') {
        p.puff = (p.puff ?? 0) - dt;
        if (p.puff <= 0) { p.puff = 0.03; g.effects.spawnMote(p.pos, p.color, p.kind === 'orb' ? 0.6 * (p.size ?? 1) : 0.35 * (p.size ?? 1)); }
      }

      // ---- sweep this frame's travel
      _from.copy(p.pos);
      const len = p.velocity.length() * dt;
      if (len < 1e-6) continue;
      _dir.copy(p.velocity).divideScalar(p.velocity.length());
      let tWorld = len;
      let surface = null;
      for (const c of world.collidersAlongRay(_from, _dir, len)) {
        const pr = p.radius * 0.5;
        const t = c.box ? rayBoxCollider(_from, _dir, c, pr) : rayCapsuleCyl(_from, _dir, c.x, c.z, c.r + pr, c.y, c.y + c.h);
        if (t < tWorld) { tWorld = t; surface = c; }
      }
      const tg = world.raycastGround(_from, _dir, tWorld);
      if (tg < tWorld) { tWorld = tg; surface = 'ground'; }

      // Enemy shots passing close by the player's head whizz.
      if (!p.whizzed && p.owner.faction !== 'player') {
        _look.set(g.player.position.x, g.player.position.y + 1.6, g.player.position.z).sub(_from);
        const along = Math.max(0, Math.min(len, _look.dot(_dir)));
        if (along > 0 && along < len && _look.addScaledVector(_dir, -along).lengthSq() < 2.5 * 2.5) {
          p.whizzed = true;
          g.audio.whiz(_look.copy(_from).addScaledVector(_dir, along));
        }
      }

      // An enemy shot reaching an Arc Barrier's dome (entities/AbilityKit.js) stops at its skin.
      if (p.owner.faction === 'enemy' && g.wards.length && this.warded(p, _from, _dir, len)) { this.remove(i); continue; }

      _hits.length = 0;
      // Other players' shots are cosmetic until the server resolves combat (docs/MULTIPLAYER.md).
      const targets = p.owner.remote ? NO_TARGETS : p.owner.faction === 'player' ? g.enemies : [g.player];
      for (const t of targets) {
        if (!t.alive || p.hitSet.has(t)) continue;
        const tc = rayCapsuleCyl(_from, _dir, t.position.x, t.position.z, t.radius + p.radius, t.position.y, t.position.y + t.height);
        if (tc <= tWorld) _hits.push({ t, tc });
      }
      _hits.sort((a, b) => a.tc - b.tc);

      let end = len;
      let dead = false;
      for (const { t, tc } of _hits) {
        p.hitSet.add(t);
        _hit.copy(_from).addScaledVector(_dir, tc);
        if (p.aoe > 0) { end = tc; dead = true; break; }
        if (!t.canBeHit()) continue;
        dealDamage(g, {
          attacker: p.owner, target: t, base: p.damage, weapon: p.weapon,
          direction: _look.copy(_dir).setY(0).normalize(), knockback: p.knockback ?? 1,
          poise: p.damage * 0.6, source: 'projectile', scaled: p.scaled, element: p.element, inflict: p.inflict,
        });
        if (p.kind === 'bullet') g.effects.bulletImpact(_hit, _n.copy(_dir).negate(), 'body', p.tracerColor ?? KINETIC);
        else g.effects.spawnImpact(_hit, p.color);
        if (p.pierce-- <= 0) { end = tc; dead = true; break; }
      }
      if (!dead && surface && p.fuse > 0 && surface === 'ground') {
        // Bombs come to rest where they land; the fuse burns down (telegraphed on launch).
        p.pos.copy(_from).addScaledVector(_dir, tWorld);
        p.pos.y = world.groundHeight(p.pos.x, p.pos.z) + 0.16 * (p.size ?? 1);
        p.velocity.set(0, 0, 0);
        p.resting = true;
        p.life = p.fuse;
        p.mesh.position.copy(p.pos);
        g.audio.impact(p.pos, 'dirt');
        continue;
      }
      if (!dead && surface) {
        end = tWorld;
        dead = true;
        _hit.copy(_from).addScaledVector(_dir, tWorld);
        if (p.aoe <= 0) this.surfaceImpact(p, _hit, surface);
      }
      p.pos.copy(_from).addScaledVector(_dir, end);
      p.traveled += end;
      if (!world.inBounds(p.pos) || p.pos.y > world.ceilingAt(p.pos.x, p.pos.z)) dead = true;
      if (p.life <= 0) dead = true;

      // ---- visuals
      if (p.tracer) {
        const L = Math.min(p.traveled, p.tracerLen);
        p.tracer.visible = true;
        placeTracer(p.tracer, p.pos, _dir, L, p.tracerWidth, cam);
      } else if (p.mesh) {
        p.mesh.position.copy(p.pos);
        if (p.gravity || p.homing || p.accel) p.mesh.lookAt(_look.copy(p.pos).add(p.velocity));
        else if (p.kind !== 'arrow') p.mesh.rotateZ(dt * 8);
        if (p.kind === 'bomb') p.mesh.rotateX(dt * 9);
      }

      if (dead) {
        if (p.aoe > 0) {
          g.explode(p.pos, p.aoe, p.damage, p.owner, p.weapon, { color: p.color, knockback: p.knockback, scaled: p.scaled, element: p.element, inflict: p.inflict });
          p.onBurst?.(p.pos.clone());
        }
        if (p.tracer) p.spent = true;
        else this.remove(i);
      }
    }
  }

  // Does this frame's travel (from `from`, `len` along `dir`) cross into a dome from outside?
  warded(p, from, dir, len) {
    for (const w of this.game.wards) {
      const r2 = w.radius * w.radius;
      if (from.distanceToSquared(w.pos) <= r2) continue; // fired from inside: it gets out
      _look.copy(from).addScaledVector(dir, len);
      if (_look.distanceToSquared(w.pos) > r2) {
        // Passing through the dome between the two ends?
        const t = Math.max(0, Math.min(len, _n.subVectors(w.pos, from).dot(dir)));
        if (_look.copy(from).addScaledVector(dir, t).distanceToSquared(w.pos) > r2) continue;
      }
      this.game.effects.spawnSparks(_look, 0x6ae8ff, 8);
      if (p.aoe > 0) this.game.explode(_look.clone(), p.aoe, p.damage, p.owner, p.weapon, { color: p.color, knockback: 0, scaled: p.scaled, element: p.element });
      return true;
    }
    return false;
  }

  // Bullet holes, sparks or dust depending on what was hit.
  surfaceImpact(p, pos, surface) {
    const g = this.game;
    if (surface === 'ground') {
      const e = 0.4;
      const w = g.world;
      _n.set(w.groundHeight(pos.x - e, pos.z) - w.groundHeight(pos.x + e, pos.z), 2 * e, w.groundHeight(pos.x, pos.z - e) - w.groundHeight(pos.x, pos.z + e)).normalize();
    } else {
      _n.set(pos.x - surface.x, 0, pos.z - surface.z);
      if (pos.y >= surface.y + surface.h - 0.02 || _n.lengthSq() < 1e-6) _n.set(0, 1, 0);
      else _n.normalize();
    }
    if (p.kind === 'bullet') g.effects.bulletImpact(pos, _n, surface === 'ground' ? 'dirt' : 'hard', p.tracerColor ?? KINETIC);
    else g.effects.spawnImpact(pos, p.color);
    const kind = p.kind === 'bullet' ? (surface === 'ground' ? 'dirt' : 'hard') : p.kind === 'arrow' || p.kind === 'quarrel' ? 'wood' : 'magic';
    g.audio.impact(pos, kind, p.weapon?.element ?? 'none');
  }

  remove(i) {
    const p = this.list[i];
    if (p.tracer) this.tracers.give(p.tracer);
    if (p.mesh) this.game.scene.remove(p.mesh);
    this.list.splice(i, 1);
  }

  // Homing: bend velocity toward the locked target (or the nearest foe ahead), keeping speed.
  steer(p, dt) {
    let t = p.homing.target;
    if (p.owner.faction !== 'player') t = this.game.player.alive ? this.game.player : null;
    else if (!t || !t.alive) {
      t = null;
      let best = 14;
      for (const e of this.game.enemies) {
        if (!e.alive || p.hitSet.has(e)) continue;
        const d = e.position.distanceTo(p.pos);
        if (d < best) { best = d; t = e; }
      }
      p.homing.target = t;
    }
    if (!t) return;
    const speed = p.velocity.length();
    _look.set(t.position.x, t.position.y + t.height * 0.55, t.position.z).sub(p.pos).normalize().multiplyScalar(speed);
    p.velocity.lerp(_look, Math.min(1, p.homing.turn * dt)).setLength(speed);
  }

  clear() {
    for (let i = this.list.length - 1; i >= 0; i--) this.remove(i);
  }
}
