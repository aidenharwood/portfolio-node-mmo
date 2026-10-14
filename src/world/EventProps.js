// What public events stand up in the world (gameplay phase 6, sim/WorldEvents.js), on this screen:
// the beacon lit where an event gathers (a Warden flare at a settlement's heart; at an anomaly, the
// Maker beacon itself, brightening as it charges), the Warden pylons a settlement holds, and the
// rift an anomaly's guardians pour out of. Built from the modelling kit as each event comes near
// and let go when it ends; a pylon that falls goes dark and leans over. (The spore pods and
// siege engines are enemies, drawn with the rest: entities/Enemy.js.)
import * as THREE from 'three';
import { piece, bake, G } from '../render/ModelKit.js';
import { disposeObject } from '../render/Toon.js';

const WARDEN = 0x58cfff;
const MAKER = 0xffd27a;
const RIFT = 0xb46aff;
const STEEL = 0x8c96a6;
const DARK = 0x2a2f3a;
const PLATE = 0x4e5868;
const STONE = 0x6d6a78;

// A Warden pylon: a braced mast on a weighted foot, an energy crown and a shield ring round it.
function pylon() {
  const g = new THREE.Group();
  piece(g, G.cyl(0.75, 0.9, 0.35, 8), DARK, { pos: [0, 0.17, 0], outline: 0.02 });
  piece(g, G.cyl(0.16, 0.22, 3.0, 8), STEEL, { pos: [0, 1.7, 0], outline: 0.016 });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    piece(g, G.box(0.12, 1.6, 0.12), PLATE, { pos: [Math.cos(a) * 0.42, 0.95, Math.sin(a) * 0.42], rot: [Math.sin(a) * 0.32, 0, -Math.cos(a) * 0.32], outline: 0.012 });
  }
  piece(g, G.cyl(0.4, 0.3, 0.3, 8), PLATE, { pos: [0, 3.15, 0], outline: 0.014 });
  const glow = new THREE.Group();
  piece(glow, G.octa(0.32), WARDEN, { pos: [0, 3.65, 0], glow: true, outline: 0.01 });
  piece(glow, G.torus(0.7, 0.04, Math.PI * 2, 6, 24).rotateX(Math.PI / 2), WARDEN, { pos: [0, 2.2, 0], glow: true, outline: 0 });
  g.add(glow);
  return { g, glow, spin: glow };
}

// A Warden flare beacon: a tripod with a lamp burning in a cage.
function flare() {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    piece(g, G.cyl(0.05, 0.07, 2.4, 6), STEEL, { pos: [Math.cos(a) * 0.35, 1.1, Math.sin(a) * 0.35], rot: [Math.sin(a) * 0.18, 0, -Math.cos(a) * 0.18], outline: 0.01 });
  }
  piece(g, G.cyl(0.24, 0.2, 0.2, 8), DARK, { pos: [0, 2.3, 0], outline: 0.012 });
  const glow = new THREE.Group();
  piece(glow, G.sphere(0.22, 10, 8), 0xffb347, { pos: [0, 2.6, 0], glow: true, outline: 0 });
  piece(glow, G.cone(0.16, 0.5, 8), 0xffe0a0, { pos: [0, 2.95, 0], glow: true, outline: 0 });
  g.add(glow);
  return { g, glow };
}

// The Maker beacon: a stepped plinth of old stone, a gilt spire, rings turning about it.
function makerBeacon() {
  const g = new THREE.Group();
  piece(g, G.cyl(1.5, 1.7, 0.4, 6), STONE, { pos: [0, 0.2, 0], outline: 0.02 });
  piece(g, G.cyl(1.0, 1.2, 0.4, 6), STONE, { pos: [0, 0.6, 0], outline: 0.02 });
  piece(g, G.cyl(0.18, 0.5, 3.4, 6), 0xb8a26a, { pos: [0, 2.5, 0], outline: 0.016 });
  const glow = new THREE.Group();
  piece(glow, G.octa(0.45), MAKER, { pos: [0, 4.55, 0], glow: true, outline: 0.01 });
  for (const [y, r] of [[1.6, 1.0], [2.8, 0.8], [3.8, 0.6]]) piece(glow, G.torus(r, 0.05, Math.PI * 2, 6, 28).rotateX(Math.PI / 2), MAKER, { pos: [0, y, 0], glow: true, outline: 0 });
  g.add(glow);
  return { g, glow, spin: glow };
}

// The rift: a tear standing in the air, edged with broken stone.
function rift() {
  const g = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    piece(g, G.dodeca(0.5 + (i % 3) * 0.2), STONE, { pos: [Math.cos(a) * 2.6, 0.3, Math.sin(a) * 2.6], rot: [i, i * 2, 0], outline: 0.016 });
  }
  const glow = new THREE.Group();
  piece(glow, G.torus(1.8, 0.14, Math.PI * 2, 6, 32), RIFT, { pos: [0, 2.6, 0], glow: true, outline: 0 });
  piece(glow, G.sphere(1.2, 16, 12), 0x4a1a7a, { pos: [0, 2.6, 0], scale: [1.2, 1.6, 0.18], glow: true, outline: 0 });
  g.add(glow);
  return { g, glow, spin: glow, face: true };
}

export class EventProps {
  constructor(game) {
    this.game = game;
    this.items = new Map(); // key → { g, glow, spin, ... }
  }

  make(key, build, x, z) {
    let it = this.items.get(key);
    if (it) return it;
    it = build();
    bake(it.g);
    for (const c of it.g.children) if (c.isGroup) bake(c);
    it.g.position.set(x, this.game.world.groundHeight(x, z), z);
    this.game.scene.add(it.g);
    this.items.set(key, it);
    return it;
  }

  // Keeps the props of the events in `list` (sim/WorldEvents.js view()) standing, and lets the rest go.
  update(dt, list) {
    const want = new Set();
    const t = this.game.time;
    for (const v of list) {
      if (v.st === 'over' && v.res !== 'won') continue;
      if (v.k === 'anomaly') {
        const b = v.s[0];
        const beacon = this.make(`${v.id}:b`, makerBeacon, v.bx, v.bz);
        want.add(`${v.id}:b`);
        const charge = v.c ?? 0;
        beacon.glow.scale.setScalar(0.6 + charge * 0.6 + Math.sin(t * 4) * 0.03);
        beacon.spin.rotation.y += dt * (0.4 + charge * 2.5);
        beacon.g.visible = !b || b[4] > 0;
        if (v.rx !== undefined && v.st !== 'over') {
          const r = this.make(`${v.id}:r`, rift, v.rx, v.rz);
          want.add(`${v.id}:r`);
          r.g.rotation.y = Math.atan2(v.bx - v.rx, v.bz - v.rz);
          r.glow.children.forEach((c, i) => { c.rotation.z = t * (i ? -0.6 : 1.2); });
        }
        continue;
      }
      if (v.k !== 'retake' && (v.st === 'gather' || v.st === 'active')) {
        const f = this.make(`${v.id}:f`, flare, v.bx, v.bz);
        want.add(`${v.id}:f`);
        f.glow.scale.setScalar(1 + Math.sin(t * 9) * 0.08);
      }
      for (const [sid, kind, x, z, hp] of v.s) {
        if (kind !== 'pylon') continue;
        const p = this.make(sid, pylon, x, z);
        want.add(sid);
        const down = hp <= 0;
        p.glow.visible = !down;
        p.spin.rotation.y += dt * 1.5;
        // A fallen pylon leans over, dark.
        p.g.rotation.z += ((down ? 0.5 : 0) - p.g.rotation.z) * Math.min(1, dt * 3);
      }
    }
    for (const [key, it] of this.items) {
      if (want.has(key)) continue;
      this.game.scene.remove(it.g);
      disposeObject(it.g);
      this.items.delete(key);
    }
  }

  clear() { this.update(0, []); }
}
