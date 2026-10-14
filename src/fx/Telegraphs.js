// A raid boss's marks on this screen (gameplay phase 7): the shapes its script warns of before
// they land (sim/BossScript.js `rt`), filling as the moment comes; the landing (`rb`), which hurts
// the local player if they're caught in it — like an enemy's shot, each screen decides that for its
// own player (the sim never damages players) — and the pools and seams left burning (`hz`) that
// hurt whoever stands in them. Shapes are combat/shapes.js's.
import * as THREE from 'three';
import { inShape, readShape } from '../combat/shapes.js';
import { ELEMENTS } from '../items/elements.js';
import { dealDamage } from '../combat/Damage.js';

const LIFT = 0.07;          // metres over the floor
const POOL_TICK = 0.5;      // seconds between a pool's bites
const FLASH = 0.35;         // seconds a landing flashes
const HEIGHT = 4;           // metres above or below a shape that still counts as in it
const _v = new THREE.Vector3();
const colorOf = (el) => (el && ELEMENTS[el] ? ELEMENTS[el].color : 0xff4a2a);

// A shape's surface in the XZ plane, pointing down +Z (turned to `a` by the mesh): a fan between
// two radii for discs, rings and cones; a strip for lines; two crossed strips for a cross.
function fan(r0, r1, a0, a1, segs) {
  const pos = [];
  for (let i = 0; i < segs; i++) {
    const t0 = a0 + ((a1 - a0) * i) / segs;
    const t1 = a0 + ((a1 - a0) * (i + 1)) / segs;
    const p = (r, t) => [Math.sin(t) * r, 0, Math.cos(t) * r];
    const A = p(r0, t0); const B = p(r1, t0); const C = p(r1, t1); const D = p(r0, t1);
    pos.push(...A, ...B, ...C, ...A, ...C, ...D);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}
function strip(w, len, back = 0) {
  const g = new THREE.PlaneGeometry(w, len + back).rotateX(-Math.PI / 2);
  g.translate(0, 0, (len - back) / 2);
  return g;
}
function shapeGeometry(s, inner = 0) {
  switch (s.sh) {
    case 'circle': return fan(inner * s.r, s.r, 0, Math.PI * 2, 48);
    case 'ring': return fan(s.r0 + (s.r - s.r0) * inner, s.r, 0, Math.PI * 2, 48);
    case 'cone': { const h = (s.arc * Math.PI) / 360; return fan(inner * s.r, s.r, -h, h, Math.max(8, Math.round(s.arc / 6))); }
    case 'line': return strip(s.w, s.r);
    case 'cross': {
      const a = strip(s.w, s.r, s.r);
      const b = strip(s.w, s.r, s.r).rotateY(Math.PI / 2);
      const g = new THREE.BufferGeometry();
      const pa = a.toNonIndexed().attributes.position.array;
      const pb = b.toNonIndexed().attributes.position.array;
      g.setAttribute('position', new THREE.Float32BufferAttribute([...pa, ...pb], 3));
      a.dispose(); b.dispose();
      return g;
    }
  }
  return fan(0, 1, 0, Math.PI * 2, 8);
}
// The edge: a thin band round the outside of a disc, ring or cone (the whole of a line).
function edgeGeometry(s) {
  const e = Math.min(0.35, s.r * 0.08);
  switch (s.sh) {
    case 'circle': return fan(s.r - e, s.r, 0, Math.PI * 2, 48);
    case 'ring': {
      const g1 = fan(s.r - e, s.r, 0, Math.PI * 2, 48).attributes.position.array;
      const g2 = fan(s.r0, s.r0 + e, 0, Math.PI * 2, 48).attributes.position.array;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([...g1, ...g2], 3));
      return g;
    }
    case 'cone': { const h = (s.arc * Math.PI) / 360; return fan(s.r - e, s.r, -h, h, Math.max(8, Math.round(s.arc / 6))); }
    default: return shapeGeometry(s);
  }
}

function material(color, opacity) {
  return new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
}

export class Telegraphs {
  constructor(game) {
    this.game = game;
    this.marks = new Map();   // mark id → { group, zone, fill, edge, s, t, T, follow, need, label }
    this.pools = new Map();   // pool id → { group, s, left, life, dps, el, tick, by }
    this.flashes = [];
    this.root = new THREE.Group();
    this.root.name = 'telegraphs';
    game.scene.add(this.root);
    this.soundAt = 0;
  }

  // ---------------------------------------------------------------- from the sim
  onEvent(ev, owner) {
    switch (ev.k) {
      case 'rt': return this.mark(ev);
      case 'rb': return this.land(ev, owner);
      case 'hz': return this.pool(ev, owner);
      case 'hzx': return this.unpool(ev.id);
    }
  }

  mark(ev) {
    const s = readShape(ev.s);
    if (!s) return;
    const color = colorOf(ev.el);
    const group = new THREE.Group();
    group.position.set(s.p[0], s.p[1] + LIFT, s.p[2]);
    group.rotation.y = s.a ?? 0;
    const zone = new THREE.Mesh(shapeGeometry(s), material(color, 0.12));
    const fill = new THREE.Mesh(shapeGeometry(s), material(color, 0.34));
    const edge = new THREE.Mesh(edgeGeometry(s), material(color, 0.9));
    fill.scale.setScalar(0.001);
    group.add(zone, fill, edge);
    // A soak's mark says how many it needs.
    let label = null;
    if (ev.n > 1) {
      label = this.label(`${ev.n}`, color);
      label.position.set(0, 1.2, 0);
      group.add(label);
    }
    this.root.add(group);
    const old = this.marks.get(ev.mk);
    if (old) this.drop(old);
    this.marks.set(ev.mk ?? `m${Math.random()}`, { group, zone, fill, edge, s, t: 0, T: Math.max(0.2, ev.t), follow: ev.f ?? null, label });
    const g = this.game;
    if (g.time - this.soundAt > 0.25) {
      this.soundAt = g.time;
      _v.set(s.p[0], s.p[1], s.p[2]);
      g.audio.rumble?.(_v, Math.min(2.5, ev.t));
    }
  }

  // A number over a soak, drawn once into a sprite.
  label(text, color) {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    const x = c.getContext('2d');
    x.font = 'bold 44px sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.lineWidth = 6;
    x.strokeStyle = '#000';
    x.strokeText(text, 32, 34);
    x.fillStyle = `#${new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.5).getHexString()}`;
    x.fillText(text, 32, 34);
    const tex = new THREE.CanvasTexture(c);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    sp.scale.setScalar(1.4);
    return sp;
  }

  // It lands: a flash, and the hit for the local player if they're in it.
  land(ev, owner) {
    const s = readShape(ev.s);
    if (!s) return;
    const m = this.marks.get(ev.mk);
    if (m) { this.marks.delete(ev.mk); this.drop(m); }
    const color = colorOf(ev.el);
    const g = this.game;
    // The flash (not for a raid-wide failure: that's a shake and a wash of colour instead).
    if (ev.fail) g.rig.addShake(0.6);
    else {
      const mesh = new THREE.Mesh(shapeGeometry(s), material(color, 0.75));
      mesh.position.set(s.p[0], s.p[1] + LIFT + 0.02, s.p[2]);
      mesh.rotation.y = s.a ?? 0;
      this.root.add(mesh);
      this.flashes.push({ mesh, t: 0 });
      _v.set(s.p[0], s.p[1], s.p[2]);
      if (g.time - this.soundAt > 0.1) { this.soundAt = g.time; g.audio.explosion(_v, Math.min(6, s.r), 'quake', ev.el ?? 'none'); }
    }
    const p = g.player;
    if (!p.alive || g.state === 'title' || Math.abs(p.position.y - s.p[1]) > HEIGHT) return;
    if (!inShape(s, p.position.x, p.position.z, p.radius)) return;
    this.hurt(ev.dmg, ev.el, s, ev.kb ?? 6, owner, 'explosion');
    if (ev.fail) g.hud.toast('Too few shared it — everyone took the blast');
  }

  // A pool (or seam) that bites whoever stands in it, every half second while it lasts.
  pool(ev, owner) {
    const s = readShape(ev.s);
    if (!s) return;
    this.unpool(ev.id);
    const color = colorOf(ev.el);
    const group = new THREE.Group();
    group.position.set(s.p[0], s.p[1] + LIFT - 0.01, s.p[2]);
    group.rotation.y = s.a ?? 0;
    const body = new THREE.Mesh(shapeGeometry(s), material(color, 0.28));
    const edge = new THREE.Mesh(edgeGeometry(s), material(color, 0.7));
    group.add(body, edge);
    this.root.add(group);
    this.pools.set(ev.id, { group, body, edge, s, left: ev.life, life: ev.life, dps: ev.dps, el: ev.el, tick: 0, by: owner });
  }

  unpool(id) {
    const P = this.pools.get(id);
    if (!P) return;
    this.pools.delete(id);
    this.drop(P);
  }

  hurt(damage, el, s, kb, owner, source) {
    const g = this.game;
    const p = g.player;
    const level = owner?.level ?? g.dungeonView?.run?.lv ?? p.level;
    const at = new THREE.Vector3(s.p[0], s.p[1], s.p[2]);
    const attacker = owner ?? { faction: 'enemy', damageMultiplier: 1, critBonus: 0, position: at, radius: 0.5, height: 2, alive: true, remote: false, level };
    // Pushed away from the middle of a disc, or out to the side of a line.
    let dir = _v.subVectors(p.position, at).setY(0);
    if ((s.sh === 'line' || s.sh === 'cross') && s.a !== undefined) {
      const fx = Math.sin(s.a);
      const fz = Math.cos(s.a);
      const side = dir.x * fz - dir.z * fx >= 0 ? 1 : -1;
      dir = _v.set(fz * side, 0, -fx * side);
    }
    if (dir.lengthSq() < 1e-4) dir.set(1, 0, 0);
    dir.normalize();
    dealDamage(g, { attacker, target: p, base: damage, scaled: true, element: el, inflict: el, source, knockback: kb, direction: dir.clone(), canCrit: false });
  }

  drop(m) {
    this.root.remove(m.group ?? m.mesh);
    (m.group ?? m.mesh).traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) { o.material.map?.dispose(); o.material.dispose(); }
    });
  }

  // Out of the raid (or a new copy): everything goes.
  clear() {
    for (const m of this.marks.values()) this.drop(m);
    for (const P of this.pools.values()) this.drop(P);
    for (const f of this.flashes) this.drop(f);
    this.marks.clear();
    this.pools.clear();
    this.flashes.length = 0;
  }

  // ---------------------------------------------------------------- every frame
  update(dt) {
    const g = this.game;
    for (const [id, m] of this.marks) {
      m.t += dt;
      const k = Math.min(1, m.t / m.T);
      m.fill.scale.setScalar(Math.max(0.001, k));
      m.edge.material.opacity = 0.6 + 0.4 * Math.sin(m.t * (8 + 14 * k));
      // Following the player it's on (their view here, or the local player).
      if (m.follow !== null) {
        const who = g.enemyLayer.playerFor(m.follow);
        if (who) m.group.position.set(who.position.x, who.position.y + LIFT, who.position.z);
      }
      // (Its landing never came — a charge's line, or the boss fell: it fades out.)
      if (m.t > m.T + 0.6) { this.marks.delete(id); this.drop(m); }
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.t += dt;
      f.mesh.material.opacity = 0.75 * Math.max(0, 1 - f.t / FLASH);
      if (f.t >= FLASH) { this.drop(f); this.flashes.splice(i, 1); }
    }
    const p = g.player;
    for (const [id, P] of this.pools) {
      P.left -= dt;
      const fade = Math.min(1, P.left / 1.2, (P.life - P.left) / 0.4 + 0.2);
      P.body.material.opacity = 0.28 * fade * (0.85 + 0.15 * Math.sin(g.time * 3 + P.life));
      P.edge.material.opacity = 0.7 * fade;
      if (P.left <= 0) { this.pools.delete(id); this.drop(P); continue; }
      if ((P.tick -= dt) > 0) continue;
      if (p.alive && Math.abs(p.position.y - P.s.p[1]) < HEIGHT && inShape(P.s, p.position.x, p.position.z, p.radius * 0.5)) {
        P.tick = POOL_TICK;
        this.hurt(P.dps * POOL_TICK, P.el, P.s, 0, P.by?.alive ? P.by : null, 'status');
      }
    }
  }
}
