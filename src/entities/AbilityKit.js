// The local player's abilities (combat/abilities.js): the three slots and their cooldowns, using
// them (X, G and T; buttons on touch), and what they leave in the world while they last — Bulwark's
// shield, Arc Barrier's dome, stasis fields, sentry drones, a holo-decoy, a grapple line. Damage
// runs through the usual pipeline as the player's (combat/Damage.js), so it's reported like any
// hit. Each use also goes to the server, which checks it and shows it to everyone near
// (net/Net.js: ability); other players' uses play here through `playRemote` — where a party
// member's heals and rally reach you, and their domes stop shots on your screen too.
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { ABILITIES, abilityPower, cooldownOf } from '../combat/abilities.js';
import { dealDamage } from '../combat/Damage.js';
import { applyComic } from '../render/Toon.js';

export const ABILITY_KEYS = ['KeyX', 'KeyG', 'KeyT'];
export const ABILITY_KEY_LABELS = ['X', 'G', 'T'];

const ORANGE = 0xffb060;
const CYAN = 0x6ae8ff;
const GOLD = 0xffd23f;
const GREEN = 0x5dff8a;
const VIOLET = 0xc48aff;
const ICE = 0x9fe8ff;
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _f = new THREE.Vector3();
const additive = (color, opacity) => new THREE.MeshBasicMaterial({
  color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
});

// ---------------------------------------------------------------- what abilities leave behind
// Bulwark: a curved wall of light in front of its owner.
function makeShield() {
  const geo = new THREE.SphereGeometry(1.5, 24, 12, -Math.PI * 0.36, Math.PI * 0.72, Math.PI * 0.22, Math.PI * 0.5);
  const mesh = new THREE.Mesh(geo, additive(CYAN, 0.32));
  const rim = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 25), new THREE.LineBasicMaterial({ color: CYAN, transparent: true, opacity: 0.8 }));
  const g = new THREE.Group();
  g.add(mesh, rim);
  g.position.set(0, 1.1, -0.35);
  g.rotation.y = Math.PI;
  return g;
}

// A dome (Arc Barrier) or a field on the ground (Stasis Field).
function makeDome(radius, color) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 14, 0, Math.PI * 2, 0, Math.PI / 2), additive(color, 0.16)));
  const ring = new THREE.Mesh(new THREE.RingGeometry(radius - 0.12, radius, 48).rotateX(-Math.PI / 2), additive(color, 0.7));
  ring.position.y = 0.05;
  g.add(ring);
  return g;
}
function makeField(radius) {
  const g = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CircleGeometry(radius, 48).rotateX(-Math.PI / 2), additive(ICE, 0.22));
  disc.position.y = 0.06;
  const ring = new THREE.Mesh(new THREE.RingGeometry(radius - 0.15, radius, 48).rotateX(-Math.PI / 2), additive(ICE, 0.8));
  ring.position.y = 0.07;
  const swirl = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.6, 0.05, 6, 40).rotateX(Math.PI / 2), additive(ICE, 0.5));
  swirl.position.y = 0.5;
  g.add(disc, ring, swirl);
  g.userData.swirl = swirl;
  return g;
}

// Sentry Drone: a squat turret on three legs with a glowing eye.
function makeDrone() {
  const g = new THREE.Group();
  const dark = new THREE.MeshToonMaterial({ color: 0x3a3448 });
  applyComic(dark);
  const shell = new THREE.MeshToonMaterial({ color: 0xd8d2e6 });
  applyComic(shell);
  for (let i = 0; i < 3; i++) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 5), dark);
    const a = (i / 3) * Math.PI * 2;
    leg.position.set(Math.sin(a) * 0.2, 0.25, Math.cos(a) * 0.2);
    leg.rotation.set(Math.cos(a) * 0.45, 0, -Math.sin(a) * 0.45);
    g.add(leg);
  }
  const head = new THREE.Group();
  head.position.y = 0.62;
  head.add(new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10), shell));
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.3, 8).rotateX(Math.PI / 2), dark);
  barrel.position.z = 0.22;
  head.add(barrel);
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshBasicMaterial({ color: VIOLET }));
  eye.position.set(0, 0.05, 0.16);
  head.add(eye);
  g.add(head);
  g.userData.head = head;
  return g;
}

// Holo-Decoy: a copy of its owner's figure in hologram light.
function makeDecoy(model) {
  const g = cloneSkinned(model);
  const mat = additive(CYAN, 0.38);
  g.traverse((o) => {
    if (!o.isMesh) return;
    if (o.material.isShaderMaterial || o.material.side === THREE.BackSide) o.visible = false;
    else o.material = mat;
  });
  return g;
}

function makeLine(color) {
  const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, 1)]);
  return new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }));
}

// ---------------------------------------------------------------- the kit
export class AbilityKit {
  constructor(game, player, { gravity }) {
    this.game = game;
    this.player = player;
    this.gravity = gravity;
    this.cooldowns = {};
    this.things = [];      // what's in the world right now: { kind, until, update?, dispose }
    this.buffs = { rally: 0, overclock: 0, bulwark: 0, pulse: 0, pulseRate: 0, afterburner: false, mirror: false };
    this.shield = null;
    this.grappling = null;
    this.flash = 0;        // the HUD's "not yet" flash
  }

  get stats() { return this.game.stats; }
  get upgrades() { return this.game.stats.talent.upgrades; }
  power(id) { return abilityPower(this.stats, id); }
  cooldownLeft(id) { return Math.max(0, this.cooldowns[id] ?? 0); }

  // What abilities do to the player's numbers (Player reads these).
  get damageBonus() { return this.buffs.rally > 0 ? ABILITIES.rally.damage : 0; }
  get rate() { return this.buffs.overclock > 0 ? ABILITIES.overclock.rate : 1; }
  get moveBonus() { return this.buffs.overclock > 0 && this.buffs.afterburner ? 0.25 : 0; }

  readInput(input) {
    for (let i = 0; i < ABILITY_KEYS.length; i++) if (input.wasPressed(ABILITY_KEYS[i])) this.use(i);
  }

  // Slot `i`'s ability, if it can go now.
  use(i) {
    const g = this.game;
    const p = this.player;
    const id = this.stats.slots[i];
    if (!id) {
      g.hud.toast(this.stats.talent.abilities.length ? 'Nothing in that slot — set it in Talents (N)' : 'Abilities come from talents — press N');
      return false;
    }
    const left = this.cooldownLeft(id);
    if (left > 0) { g.hud.toast(`${ABILITIES[id].name}: ${Math.ceil(left)} s`); this.flash = 0.3; return false; }
    if (!p.alive || p.state === 'mantle' || p.state === 'leap' || p.state === 'grapple' || g.state !== 'playing') return false;
    const at = this[id]();
    if (at === false) return false;
    this.cooldowns[id] = cooldownOf(id, this.upgrades);
    g.net?.ability(id, at);
    return true;
  }

  update(dt) {
    for (const k of Object.keys(this.cooldowns)) this.cooldowns[k] -= dt;
    this.flash = Math.max(0, this.flash - dt);
    const b = this.buffs;
    b.rally -= dt;
    b.overclock -= dt;
    b.bulwark -= dt;
    if (b.pulse > 0) {
      b.pulse -= dt;
      this.player.heal(this.player.maxHp * b.pulseRate * dt);
    }
    if (this.shield) {
      this.shield.visible = b.bulwark > 0 && this.player.alive;
      if (this.shield.visible) this.shield.children[0].material.opacity = 0.26 + 0.08 * Math.sin(this.game.time * 9);
    }
    if (this.grappling) this.updateGrapple(dt);
    const now = this.game.time;
    for (let i = this.things.length - 1; i >= 0; i--) {
      const t = this.things[i];
      t.update?.(dt, now);
      if (now >= t.until) {
        t.end?.();
        this.drop(i);
      }
    }
  }

  drop(i) {
    const t = this.things[i];
    if (t.mesh) this.game.scene.remove(t.mesh);
    if (t.ward) this.game.wards.splice(this.game.wards.indexOf(t.ward), 1);
    this.things.splice(i, 1);
  }

  add(thing, duration) {
    thing.until = this.game.time + duration;
    if (thing.mesh) this.game.scene.add(thing.mesh);
    if (thing.ward) this.game.wards.push(thing.ward);
    this.things.push(thing);
    return thing;
  }

  clear() {
    for (let i = this.things.length - 1; i >= 0; i--) this.drop(i);
    this.cooldowns = {};
    Object.assign(this.buffs, { rally: 0, overclock: 0, bulwark: 0, pulse: 0 });
    this.grappling?.line && this.game.scene.remove(this.grappling.line);
    this.grappling = null;
  }

  // The point on the ground at the reticle, no further than `range` from the player.
  groundTarget(range) {
    const p = this.player.position;
    const a = this.game.aim.point;
    _v.set(a.x - p.x, 0, a.z - p.z);
    if (_v.length() > range) _v.setLength(range);
    const x = p.x + _v.x;
    const z = p.z + _v.z;
    return new THREE.Vector3(x, this.game.world.supportHeight(x, z, Math.max(p.y, a.y) + 1), z);
  }

  gesture() {
    this.player.anim.offPose = 'cast';
    this.game.after(0.45, () => { if (this.player.anim.offPose === 'cast') this.player.anim.offPose = null; });
  }

  // ======================================================== Vanguard
  slam() {
    const g = this.game;
    const p = this.player;
    const A = ABILITIES.slam;
    const after = this.upgrades.has('aftershock');
    const radius = A.radius * (after ? 1.3 : 1);
    const at = p.position.clone();
    const dmg = this.power('slam') * A.damage;
    g.explode(at, radius, dmg, p, null, { color: ORANGE, knockback: A.knockback, scaled: true });
    if (after) for (const e of g.enemies) if (e.alive && e.position.distanceTo(at) < radius + e.radius) e.applyStatus?.('frost', dmg * 0.3);
    this.slamFx(at, radius);
    p.animator.land(9);
    g.hitstop(0.06, p);
    return at;
  }
  slamFx(at, radius) {
    const g = this.game;
    g.effects.spawnRing(at, radius, ORANGE);
    g.effects.spawnRing(at, radius * 0.6, 0xffe2a0);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      g.effects.spawnPuff(_v.set(at.x + Math.cos(a) * radius * 0.7, at.y + 0.1, at.z + Math.sin(a) * radius * 0.7), { size: 0.9, life: 0.6 });
    }
    g.rig.addShake(0.55 * Math.max(0, 1 - at.distanceTo(g.player.position) / 30));
    g.audio.stomp?.(at, 1.4);
  }

  bulwark() {
    const p = this.player;
    this.buffs.mirror = this.upgrades.has('mirror');
    this.buffs.bulwark = ABILITIES.bulwark.duration * (this.buffs.mirror ? 1.5 : 1);
    if (!this.shield) {
      this.shield = makeShield();
      p.root.add(this.shield);
    }
    this.shield.visible = true;
    this.game.audio.ward?.(p.position);
    return p.position.clone();
  }

  // Bulwark's guard: a hit coming at the front is stopped (a shot) or blunted (anything else).
  // Returns false when the hit is stopped outright.
  guard(hit) {
    if (this.buffs.bulwark <= 0 || hit.source === 'status') return true;
    const f = this.player.forward(_f);
    const d = hit.direction;
    if (!d || d.x * f.x + d.z * f.z > -0.3) return true;
    const g = this.game;
    const p = this.player;
    _v.copy(p.position).addScaledVector(f, 0.9).setY(p.position.y + 1.2);
    g.effects.spawnSparks(_v, CYAN, 12);
    g.audio.block?.(_v);
    if (hit.source === 'projectile') {
      // Mirror Field: back where it came from.
      const from = hit.attacker?.position;
      if (this.buffs.mirror && from) {
        _w.set(from.x, from.y + (hit.attacker.height ?? 1.8) * 0.6, from.z).sub(_v).normalize();
        g.projectiles.spawn({ kind: 'bolt', owner: p, origin: _v.clone(), direction: _w.clone(), speed: 40, damage: hit.damage, scaled: true, color: CYAN, life: 1.5, quiet: true });
      }
      return false;
    }
    hit.damage = Math.max(1, Math.round(hit.damage * ABILITIES.bulwark.melee));
    hit.knockback *= 0.3;
    return true;
  }

  leap() {
    const p = this.player;
    const A = ABILITIES.leap;
    if (p.state !== 'move') return false;
    const to = this.groundTarget(A.range);
    const T = A.flight;
    _v.subVectors(to, p.position);
    p.velocity.set(_v.x / T, 0, _v.z / T);
    p.vy = (_v.y + 0.5 * this.gravity * T * T) / T;
    p.grounded = false;
    p.facing = Math.atan2(_v.x, _v.z);
    p.setState('leap');
    p.flipT = 0.01;
    this.game.audio.jump?.();
    return to;
  }

  // Player.onLand, at the end of a leap.
  leapLand() {
    const g = this.game;
    const p = this.player;
    const A = ABILITIES.leap;
    const meteor = this.upgrades.has('meteor');
    const at = p.position.clone();
    g.explode(at, A.radius, this.power('leap') * A.damage * (meteor ? 1.5 : 1), p, null, { color: ORANGE, knockback: A.knockback, scaled: true });
    this.slamFx(at, A.radius);
    p.velocity.multiplyScalar(0.2);
    p.setState('move');
    g.hitstop(0.07, p);
  }

  rally() {
    const p = this.player;
    const A = ABILITIES.rally;
    const warcry = this.upgrades.has('warcry');
    this.takeRally(warcry);
    this.rallyFx(p.position, A.radius);
    return p.position.clone();
  }
  takeRally(warcry) {
    const p = this.player;
    const A = ABILITIES.rally;
    p.heal(p.maxHp * A.heal);
    this.buffs.rally = A.duration + (warcry ? 4 : 0);
    if (warcry) p.statuses = {};
  }
  rallyFx(at, radius) {
    const g = this.game;
    g.effects.spawnRing(at, radius, GOLD);
    g.effects.spawnRing(at, 2.5, GOLD);
    g.effects.glow(_v.copy(at).setY(at.y + 1.2), GOLD, { size: 3, grow: 1, life: 0.5 });
    g.audio.howl?.(at, true);
  }

  // ======================================================== Gunslinger
  frag() {
    const g = this.game;
    const p = this.player;
    const A = ABILITIES.frag;
    const o = p.position.clone().setY(p.position.y + 1.5).addScaledVector(p.forward(_f), 0.4);
    const d = g.aim.dir.clone();
    d.y += 0.22;
    d.normalize();
    this.throwFrag(o, d, true);
    p.facing = Math.atan2(d.x, d.z);
    this.gesture();
    return [o, d];
  }
  // A grenade from `o` along `d` (cosmetic on other screens: `real` false).
  throwFrag(o, d, real) {
    const g = this.game;
    const A = ABILITIES.frag;
    const cluster = real && this.upgrades.has('cluster');
    const dmg = real ? this.power('frag') * A.damage : 0;
    g.projectiles.spawn({
      kind: 'bomb', owner: real ? this.player : { faction: 'player', remote: true, position: o, alive: true }, origin: o, direction: d,
      speed: A.speed, gravity: 22, damage: dmg, aoe: A.radius, knockback: A.knockback, scaled: true, color: ORANGE, life: A.fuse, quiet: true,
      onBurst: cluster ? (at) => this.cluster(at, dmg) : null,
    });
    g.audio.swing({ pos: o, weight: 0.4, dur: 0.2 });
  }
  cluster(at, dmg) {
    const g = this.game;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + Math.random();
      const pos = at.clone().add(_v.set(Math.cos(a) * 2.6, 0, Math.sin(a) * 2.6));
      pos.y = g.world.supportHeight(pos.x, pos.z, at.y + 2);
      g.after(0.25 + i * 0.12, () => g.explode(pos, 2.4, dmg * 0.4, this.player, null, { color: ORANGE, knockback: 5, scaled: true }));
    }
  }

  grapple() {
    const g = this.game;
    const p = this.player;
    const range = ABILITIES.grapple.range * (this.upgrades.has('zipline') ? 36 / 26 : 1);
    const to = g.aim.point.clone();
    if (to.distanceTo(p.position) > range || g.aim.distance >= 149) {
      g.hud.toast('Nothing to grapple in reach');
      return false;
    }
    // Stop a little short, on the near side of what was hit.
    _v.subVectors(p.position, to).setY(0);
    if (_v.lengthSq() > 0.01) to.addScaledVector(_v.normalize(), 0.7);
    this.startGrapple(to);
    return to;
  }
  startGrapple(to) {
    const p = this.player;
    const line = makeLine(0xd8e6ff);
    this.game.scene.add(line);
    this.grappling = { to, t: 0, line };
    p.setState('grapple');
    p.grounded = false;
    this.game.audio.airDash?.();
  }
  updateGrapple(dt) {
    const p = this.player;
    const gr = this.grappling;
    gr.t += dt;
    _v.subVectors(gr.to, p.position);
    const d = _v.length();
    const hand = _w.copy(p.position).setY(p.position.y + 1.4);
    const pos = gr.line.geometry.attributes.position;
    pos.setXYZ(0, hand.x, hand.y, hand.z);
    pos.setXYZ(1, gr.to.x, gr.to.y, gr.to.z);
    pos.needsUpdate = true;
    gr.line.geometry.computeBoundingSphere();
    if (p.state !== 'grapple' || d < 1.2 || gr.t > 1.4 || !p.alive) {
      this.game.scene.remove(gr.line);
      this.grappling = null;
      if (p.state === 'grapple') {
        p.velocity.multiplyScalar(0.45);
        p.vy = Math.max(p.vy * 0.4, 6);
        p.setState('move');
      }
      if (this.upgrades.has('zipline')) p.airDashUsed = false;
      return;
    }
    _v.divideScalar(d).multiplyScalar(ABILITIES.grapple.speed);
    p.velocity.set(_v.x, 0, _v.z);
    p.vy = _v.y + this.gravity * dt;
    p.facing = Math.atan2(_v.x, _v.z);
  }

  decoy() {
    const g = this.game;
    const A = ABILITIES.decoy;
    const at = this.groundTarget(A.range);
    const boom = this.upgrades.has('boom');
    this.placeDecoy(at, this.player.facing, true, boom);
    // Offline the local sim gets it here; online the server makes it when it hears of the use.
    g.enemyLayer.sim?.addDecoy({ id: `d${g.time.toFixed(2)}`, owner: g.enemyLayer.myId, position: at, duration: A.duration });
    this.gesture();
    return at;
  }
  placeDecoy(at, facing, real, boom) {
    const g = this.game;
    const A = ABILITIES.decoy;
    const mesh = makeDecoy(this.player.model);
    mesh.position.copy(at);
    mesh.rotation.y = facing;
    g.effects.spawnRing(at, 1.6, CYAN);
    this.add({
      kind: 'decoy', mesh,
      update: (dt, now) => { mesh.visible = Math.sin(now * 37) > -0.85; },
      end: () => {
        g.effects.spawnPuff(at, { size: 1.4, life: 0.5, color: 0x9fe8ff });
        if (boom) g.explode(at.clone(), A.radius, real ? this.power('decoy') * A.damage : 0, real ? this.player : { faction: 'player', remote: true, position: at }, null, { color: CYAN, knockback: 9, scaled: true });
      },
    }, A.duration);
  }

  overclock() {
    const p = this.player;
    this.buffs.overclock = ABILITIES.overclock.duration;
    this.buffs.afterburner = this.upgrades.has('afterburner');
    this.game.effects.glow(_v.copy(p.position).setY(p.position.y + 1.2), 0xffe080, { size: 2.4, grow: 0.8, life: 0.4 });
    this.game.audio.chargedChime?.(p.weapon);
    return p.position.clone();
  }

  // ======================================================== Technomancer
  drone() {
    const p = this.player;
    const twin = this.upgrades.has('twin');
    const right = _w.set(Math.cos(p.facing), 0, -Math.sin(p.facing));
    const spots = twin ? [1.6, -1.6] : [1.6];
    const at = spots.map((s) => {
      const x = p.position.x + right.x * s;
      const z = p.position.z + right.z * s;
      return new THREE.Vector3(x, this.game.world.supportHeight(x, z, p.position.y + 1.5), z);
    });
    for (const a of at) this.placeDrone(a, true);
    this.gesture();
    return at[0];
  }
  placeDrone(at, real) {
    const g = this.game;
    const A = ABILITIES.drone;
    const mesh = makeDrone();
    mesh.position.copy(at);
    g.effects.spawnRing(at, 1.2, VIOLET);
    let cd = 0.6;
    const head = mesh.userData.head;
    this.add({
      kind: 'drone', mesh,
      update: (dt) => {
        cd -= dt;
        let best = null;
        let bd = A.range;
        for (const e of g.enemies) {
          if (!e.alive || e.state === 'spawn') continue;
          const d = e.position.distanceTo(at);
          if (d < bd) { bd = d; best = e; }
        }
        if (!best) return;
        _v.set(best.position.x, best.position.y + best.height * 0.55, best.position.z);
        head.lookAt(_v);
        if (cd > 0) return;
        cd = A.every;
        const o = head.getWorldPosition(new THREE.Vector3());
        const dir = _v.clone().sub(o).normalize();
        g.projectiles.spawn({
          kind: 'bolt', owner: real ? this.player : { faction: 'player', remote: true, position: o, alive: true }, origin: o, direction: dir,
          speed: 46, damage: real ? this.power('drone') * A.damage : 0, scaled: true, color: VIOLET, size: 0.6, life: 0.8, quiet: true,
        });
        g.audio.enemyShot?.(o, 'energy');
      },
      end: () => g.effects.spawnPuff(at, { size: 1, life: 0.5, color: 0x6a5a8a }),
    }, A.duration);
  }

  stasis() {
    const A = ABILITIES.stasis;
    const at = this.groundTarget(A.range);
    this.placeField(at, true, this.upgrades.has('deepfreeze'));
    this.gesture();
    return at;
  }
  placeField(at, real, deep) {
    const g = this.game;
    const A = ABILITIES.stasis;
    const mesh = makeField(A.radius);
    mesh.position.copy(at);
    let tick = 0;
    const dmg = real && deep ? this.power('stasis') * A.damage : 0;
    this.add({
      kind: 'stasis', mesh,
      update: (dt) => {
        mesh.userData.swirl.rotation.z += dt * 1.5;
        if (!real || (tick -= dt) > 0) return;
        tick = 1;
        // Everyone inside is chilled (the slow is the sim's: frost's chill), and bitten when deep.
        for (const e of g.enemies) {
          if (!e.alive || e.position.distanceTo(at) > A.radius + e.radius) continue;
          e.applyStatus?.('frost', Math.max(1, dmg));
          if (dmg) dealDamage(g, { attacker: this.player, target: e, base: dmg, scaled: true, source: 'status', element: 'frost', direction: _f.set(0, 0, 1), poise: 0 });
        }
      },
    }, A.duration + (deep ? 2 : 0));
    g.audio.ward?.(at);
  }

  barrier() {
    const p = this.player;
    const at = p.position.clone();
    this.placeDome(at, true, this.upgrades.has('shockdome'));
    this.gesture();
    return at;
  }
  placeDome(at, real, shock) {
    const g = this.game;
    const A = ABILITIES.barrier;
    const mesh = makeDome(A.radius, CYAN);
    mesh.position.copy(at);
    let tick = 0;
    const dmg = real && shock ? this.power('barrier') * A.damage : 0;
    this.add({
      kind: 'barrier', mesh, ward: { pos: at, radius: A.radius },
      update: (dt, now) => {
        mesh.children[0].material.opacity = 0.13 + 0.04 * Math.sin(now * 5);
        if (!dmg || (tick -= dt) > 0) return;
        tick = 0.5;
        for (const e of g.enemies) {
          if (!e.alive || e.position.distanceTo(at) > A.radius + e.radius) continue;
          dealDamage(g, { attacker: this.player, target: e, base: dmg * 0.5, scaled: true, source: 'status', element: 'shock', direction: _f.set(0, 0, 1), poise: 0 });
          e.applyStatus?.('shock', dmg);
        }
      },
    }, A.duration);
    g.audio.ward?.(at);
  }

  pulse() {
    const p = this.player;
    const A = ABILITIES.pulse;
    this.takePulse(this.upgrades.has('mass'));
    this.pulseFx(p.position, A.radius);
    this.gesture();
    return p.position.clone();
  }
  takePulse(mass) {
    const A = ABILITIES.pulse;
    this.buffs.pulse = A.duration;
    this.buffs.pulseRate = (A.heal * (mass ? 1.5 : 1)) / A.duration;
  }
  pulseFx(at, radius) {
    const g = this.game;
    for (let i = 0; i < 3; i++) g.after(i * 0.25, () => g.effects.spawnRing(at, radius * (0.5 + i * 0.25), GREEN));
    g.effects.glow(_v.copy(at).setY(at.y + 1.2), GREEN, { size: 3, grow: 1, life: 0.6 });
    g.audio.ward?.(at, true);
  }

  // ======================================================== someone else's
  // Another player's ability, as the server passed it on: shown here, and for party members in
  // reach the heals and rally act on us.
  playRemote(r, fx) {
    const g = this.game;
    const A = ABILITIES[fx.id];
    if (!A) return;
    const at = fx.p ? new THREE.Vector3().fromArray(fx.p) : r.position.clone();
    const mate = !!g.partyUI?.isMate(r.netId);
    const near = (radius) => mate && g.player.alive && g.player.position.distanceTo(r.position) <= radius;
    switch (fx.id) {
      case 'slam': this.slamFx(at, A.radius * (fx.u ? 1.3 : 1)); break;
      case 'leap': g.after(A.flight, () => this.slamFx(at, A.radius)); break;
      case 'bulwark': g.effects.spawnRing(r.position, 1.5, CYAN); break;
      case 'rally':
        this.rallyFx(r.position, A.radius);
        if (near(A.radius)) { this.takeRally(!!fx.u); g.hud.toast('Rallied!'); }
        break;
      case 'frag':
        if (fx.o && fx.d) this.throwFrag(new THREE.Vector3().fromArray(fx.o), new THREE.Vector3().fromArray(fx.d), false);
        break;
      case 'grapple': g.effects.spawnBolt(r.position.clone().setY(r.position.y + 1.4), at, 0xd8e6ff); break;
      case 'decoy': this.placeDecoy(at, r.facing ?? 0, false, !!fx.u); break;
      case 'overclock': g.effects.glow(_v.copy(r.position).setY(r.position.y + 1.2), 0xffe080, { size: 2.4, grow: 0.8, life: 0.4 }); break;
      case 'drone': this.placeDrone(at, false); if (fx.u) this.placeDrone(at.clone().add(_v.set(-2, 0, 0)), false); break;
      case 'stasis': this.placeField(at, false, !!fx.u); break;
      case 'barrier': this.placeDome(at, false, false); break;
      case 'pulse':
        this.pulseFx(r.position, A.radius);
        if (near(A.radius)) { this.takePulse(!!fx.u); g.hud.toast('Restoration Pulse'); }
        break;
    }
  }
}
