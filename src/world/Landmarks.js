// Landmarks and settlements: the one-off sights and the friendly places world/Gen.js scatters
// through the regions, built here from the model kit when they stream in (world/World.js
// loadPoi). Each builder works in its POI's own frame — `p.rot` turns it, +z is its front (a
// settlement's front faces its waystone and the road in) — keeps clear of the spots Gen reserved
// (a landmark's cache, a settlement's folk), and gives every solid part a collider, so the
// server's headless world (server/world.js) collides with the same shapes.
import * as THREE from 'three';
import { piece, bakeTree, flatten, G, shade } from '../render/ModelKit.js';
import { loftGeometry } from '../render/Loft.js';
import { fist, sculptHead } from '../models/Human.js';
import { C, RUNE, LAVA, LAMP, HEARTH, CARGO } from './palette.js';
import { building } from './build/kit.js';
import { kitStyleOf } from './build/styles.js';
import { lump } from './scenery/kit.js';
import { lampPost as kitLamp, stall as kitStall, crop as kitCrop, rockShape, seedOf } from './scenery/placeProps.js';

const TAU = Math.PI * 2;
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _d = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const UP = new THREE.Vector3(0, 1, 0);

// ---------------------------------------------------------------- frame helpers
// A POI's local (lx, lz) in the world.
export const toWorld = (p, lx, lz) => [p.x + Math.cos(p.rot) * lx + Math.sin(p.rot) * lz, p.z - Math.sin(p.rot) * lx + Math.cos(p.rot) * lz];

// Builder context: the world, the POI, its anchored group, and local helpers.
function frame(w, p) {
  const g = w.anchor(p.x, p.z, p.rot);
  const y0 = g.position.y;
  return {
    g, y0, rnd: w.rnd,
    // Ground height under a local point, relative to the anchor.
    gy: (lx, lz) => { const [x, z] = toWorld(p, lx, lz); return w.groundHeight(x, z) - y0; },
    // A collider at a local point; `base` is its foot, local to the anchor (default: the ground there).
    col: (lx, lz, r, h, base = null) => {
      const [x, z] = toWorld(p, lx, lz);
      w.addCollider(x, z, r, h, base === null ? w.groundHeight(x, z) : y0 + base);
    },
    colBox: (lx, lz, hx, hz, ry, h, base = null) => {
      const [x, z] = toWorld(p, lx, lz);
      w.addOrientedBox(x, z, hx, hz, p.rot + ry, h, base === null ? w.groundHeight(x, z) : y0 + base);
    },
  };
}

// A cylinder from local point a to b (limbs, struts, branches, beams).
function beam(g, a, b, r, color, { taper = 1, seg = 8, outline = 0.04, glow = false } = {}) {
  _a.fromArray(a);
  _b.fromArray(b);
  _d.subVectors(_b, _a);
  const len = _d.length();
  _q.setFromUnitVectors(UP, _d.normalize());
  _e.setFromQuaternion(_q);
  return piece(g, G.cyl(r * taper, r, len, seg), color, { pos: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], rot: [_e.x, _e.y, _e.z], outline, glow });
}

// A sub-group of g at (x, y, z).
function sub(g, x, y, z) {
  const s = new THREE.Group();
  s.position.set(x, y, z);
  g.add(s);
  return s;
}

// Polar placement within a POI: angle `a` (0 = its front), distance d.
const polar = (a, d) => [Math.sin(a) * d, Math.cos(a) * d];

// ================================================================ landmarks
export const LANDMARK_BUILDERS = {
  // A starship come down nose-first in its own furrow: lofted hull with a painted band and exposed
  // ribs, dead engines, one wing raised and the other torn off among the debris.
  wreck(w, p) {
    const { g, rnd, gy, col } = frame(w, p);
    const rows = [
      { y: -17, w: 5.0, zf: 3.4, zb: 3.0, n: 3 },
      { y: -11, w: 5.6, zf: 4.0, zb: 3.3, n: 3 },
      { y: -2, w: 5.2, zf: 3.8, zb: 3.0, n: 2.8 },
      { y: 7, w: 4.2, zf: 3.2, zb: 2.6, n: 2.6 },
      { y: 13, w: 2.6, zf: 2.4, zb: 1.8, n: 2.3 },
      { y: 17.5, w: 0.5, zf: 0.6, zb: 0.4, n: 2 },
    ];
    const hull = new THREE.Group();
    hull.position.set(0, 2.2, 0);
    hull.rotation.set(0.11, 0, 0.17);
    g.add(hull);
    const loft = (o) => loftGeometry(rows, { seg: 20, sub: 3, ...o }).rotateX(Math.PI / 2);
    piece(hull, loft({ caps: [true, true] }), C.hull, { outline: 0.06 });
    piece(hull, loft({ y0: -8, y1: -4.5, inflate: 0.08 }), C.paint, { outline: 0.03 });
    piece(hull, loft({ y0: 9, y1: 10.2, inflate: 0.08 }), C.paint, { outline: 0.02 });
    piece(hull, loft({ y0: -17, y1: -12, inflate: 0.1 }), C.hullDark, { outline: 0.04 });
    // Bridge windows near the nose, dark now.
    for (const s of [-1, 1]) piece(hull, G.box(0.12, 0.7, 2.6), 0x1c2a3a, { pos: [2.55 * s, 1.7, 10.5], rot: [0, 0, -0.5 * s], outline: 0.01 });
    // Torn plating amidships: ribs showing.
    for (const z of [1.2, 2.6, 4.0]) piece(hull, G.torus(3.4, 0.16, Math.PI, 4, 18), C.metalDark, { pos: [0, 0.2, z], rot: [0, 0, 0.1], outline: 0.02 });
    piece(hull, G.box(4.6, 0.3, 3.4), 0x1a1c22, { pos: [0, 2.85, 2.6], outline: 0.02 });
    // Engines: three dead nozzles, one still smouldering.
    for (const [x, y] of [[-3, 1.2], [3, 1.2], [0, 2.4]]) {
      piece(hull, G.cylZ(1.25, 1.6, 3.2, 14), C.hullDark, { pos: [x, y, -18.6], outline: 0.04 });
      piece(hull, G.cylZ(0.9, 0.9, 0.2, 14), x === 0 ? 0xff7a3a : 0x22252c, { pos: [x, y, -20.2], glow: x === 0, outline: 0 });
    }
    // The raised wing (and its torn twin, lying in the dirt).
    const wingShape = G.shape([[0, 0], [9, -3], [10, -6.5], [8.5, -7], [0, -5.5]]);
    piece(hull, G.extrude(wingShape, 0.35, 0.05).rotateX(Math.PI / 2), C.hull, { pos: [4.4, 0.6, 0], rot: [0, 0, 0.2], outline: 0.04 });
    piece(hull, G.box(0.4, 1.2, 0.2), C.paint, { pos: [12.5, 2.4, -5.6], rot: [0, 0, 0.2], outline: 0.01 });
    const ly = gy(-12, 3);
    piece(g, G.extrude(wingShape, 0.35, 0.05).rotateX(Math.PI / 2), shade(C.hull, 0.9), { pos: [-9, ly + 0.6, 9], rot: [0.25, 2.6, -0.3], outline: 0.04 });
    col(-12, 4, 2.6, 1.4);
    // Debris: hull plates and crates thrown along the furrow.
    for (let i = 0; i < 12; i++) {
      const a = rnd() * TAU;
      const d = 9 + rnd() * 11;
      const [lx, lz] = polar(a, d);
      if (Math.hypot(lx - 7, lz + 2) < 3.5) continue; // the cache
      const s = 0.8 + rnd() * 1.6;
      piece(g, G.box(2.2 * s, 0.14, 1.4 * s), rnd() < 0.3 ? C.paint : shade(C.hull, 0.8 + rnd() * 0.2), { pos: [lx, gy(lx, lz) + 0.2, lz], rot: [(rnd() - 0.5) * 0.8, rnd() * 3, (rnd() - 0.5) * 0.8], outline: 0.025 });
    }
    w.finish(g);
    // The hull, as a row of colliders along its length (the nose is buried, the tail stands high).
    for (let z = -19; z <= 15; z += 3) {
      const r = z > 9 ? 2.6 : 4.6;
      const [lx, lz] = [Math.sin(0.17) * -2.2, z];
      col(lx, lz, r, 2.2 + 3.4 - z * 0.11, -1);
    }
    col(6, 0, 1.2, 3.5);
  },

  // A colossal creature's bones: an arched spine, ribs curving up and over (the cache sits
  // beneath them), a horned skull with its jaw in the sand, a tail trailing into the ground.
  skeleton(w, p) {
    const { g, rnd, gy, col } = frame(w, p);
    const bone = C.bone;
    const old = shade(C.bone, 0.85);
    const spineY = (z) => 1 + 6.5 * Math.sin(Math.PI * Math.min(1, Math.max(0, (z + 16) / 30)));
    for (let z = -18; z <= 11; z += 1.9) {
      const y = spineY(z) + Math.min(0, gy(0, z));
      piece(g, G.box(1.7, 1.3, 1.5), z % 4 < 2 ? bone : old, { pos: [0, y, z], rot: [0.2, 0, 0], outline: 0.04 });
      piece(g, G.cone(0.45, 1.6, 5), bone, { pos: [0, y + 1.3, z - 0.2], rot: [-0.3, 0, 0], outline: 0.03 });
    }
    for (let i = 0; i < 8; i++) {
      const z = -8 + i * 2.1;
      const y = spineY(z);
      const reach = 6.4 + Math.sin(i * 1.3) * 0.8;
      for (const s of [-1, 1]) {
        if (rnd() < 0.15) continue; // a broken rib
        const end = [s * reach, gy(s * reach, z + 1.4) + 0.2, z + 1.4];
        piece(g, G.tube([[0, y, z], [s * 3.3, y + 1.2, z + 0.3], [s * 6.1, y * 0.45, z + 1], end], 0.42, 18, 6), i % 2 ? bone : old, { outline: 0.04 });
        col(end[0], end[2], 0.6, 2.4);
      }
    }
    // Skull, jaw, horns and teeth.
    const sy = Math.max(1.5, spineY(13) * 0.5);
    piece(g, G.sphere(1, 14, 10), bone, { pos: [0, sy + 0.6, 14.5], scale: [2.8, 2.2, 3.8], outline: 0.06 });
    piece(g, G.box(4.2, 1.1, 5.6), old, { pos: [0, gy(0, 16) + 0.4, 16], rot: [-0.08, 0, 0], outline: 0.05 });
    for (const s of [-1, 1]) {
      piece(g, G.sphere(0.8, 10, 8), 0x2a2420, { pos: [1.5 * s, sy + 1.4, 16.4], outline: 0 });
      piece(g, G.tube([[1.8 * s, sy + 1.9, 13.4], [3.6 * s, sy + 3.6, 12.6], [4.6 * s, sy + 6, 13.8], [4.2 * s, sy + 7.6, 15.2]], 0.42, 14, 6), old, { outline: 0.04 });
      for (let k = 0; k < 3; k++) piece(g, G.cone(0.25, 1.2, 5), C.bone, { pos: [s * (1.6 - k * 0.5), sy - 0.6, 18 - k * 0.2], rot: [Math.PI, 0, 0], outline: 0.02 });
    }
    // Tail vertebrae sinking into the ground.
    for (let i = 0; i < 6; i++) {
      const z = -19.5 - i * 1.6;
      piece(g, G.box(1.2 - i * 0.12, 0.9, 1.1), old, { pos: [0, gy(0, z) + 0.6 - i * 0.12, z], rot: [0.3, 0, 0.1 * i], outline: 0.03 });
    }
    w.finish(g);
    col(0, 15, 3.6, sy + 3);
    for (let z = -16; z <= 10; z += 4) col(0, z, 1.1, spineY(z) + 0.8);
  },

  // A precursor gate: a great ring held between two pillars on a stepped plinth, its inner rim
  // alight, a crystal turning at its heart.
  ring(w, p) {
    const { g, y0, col, colBox } = frame(w, p);
    const R = 8.2;
    const cy = 9.6;
    piece(g, G.box(19, 1.2, 4.4), C.stoneDark, { pos: [0, 0.4, 0], outline: 0.05 });
    for (let i = 0; i < 3; i++) piece(g, G.box(6 - i * 1.2, 0.4, 1.2), C.stone, { pos: [0, 0.2 + i * 0.4 - 0.4, 2.6 + (2 - i) * 0.7], outline: 0.03 });
    for (const s of [-1, 1]) {
      piece(g, G.box(2.2, cy - 1.6, 2.2), C.stone, { pos: [7.6 * s, (cy - 1.6) / 2 + 0.8, 0], outline: 0.05 });
      piece(g, G.box(2.6, 0.5, 2.6), shade(C.stone, 1.08), { pos: [7.6 * s, cy - 0.6, 0], outline: 0.04 });
      for (let k = 0; k < 3; k++) piece(g, G.box(0.12, 1.1, 1.4), RUNE, { pos: [6.45 * s, 2.4 + k * 2.2, 0], glow: true, outline: 0 });
    }
    piece(g, G.torus(R, 0.95, TAU, 8, 56), C.stoneDark, { pos: [0, cy + R * 0.18, 0], outline: 0.06 });
    piece(g, G.torus(R - 0.95, 0.2, TAU, 5, 56), RUNE, { pos: [0, cy + R * 0.18, 0], glow: true, outline: 0 });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      piece(g, G.box(0.9, 0.5, 2.2), shade(C.stone, 1.1), { pos: [Math.cos(a) * R, cy + R * 0.18 + Math.sin(a) * R, 0], rot: [0, 0, a], outline: 0.03 });
    }
    w.finish(g);
    const [cx, cz] = toWorld(p, 0, 0);
    w.floatingShard(cx, y0 + cy + R * 0.18, cz, 0.8);
    for (const s of [-1, 1]) colBox(7.6 * s, 0, 1.3, 1.3, 0, 9.5);
    colBox(0, 0, 9.5, 2.2, 0, 1.2, -0.2);
  },

  // A war machine taller than a house, down on one knee long ago: one fist on the ground, the
  // other arm across its raised knee, its visor dark.
  titan(w, p) {
    const { g, col, colBox } = frame(w, p);
    const snow = w.gen.biomeAt(p.x, p.z) === 'snow';
    const plate = C.steel;
    const rust = C.rust;
    piece(g, G.box(5, 2.2, 3.2), plate, { pos: [0, 5.4, -0.6], outline: 0.05 });
    piece(g, G.box(6.2, 6, 4.2), plate, { pos: [0, 9.6, 0], rot: [0.22, 0, 0], outline: 0.06 });
    piece(g, G.box(4.2, 2.6, 0.4), rust, { pos: [0, 10.2, 2.1], rot: [0.22, 0, 0], outline: 0.03 });
    piece(g, G.cylZ(0.9, 0.9, 0.3, 12), 0x3a4a5a, { pos: [0, 9.8, 2.35], rot: [0.22, 0, 0], outline: 0.02 });
    piece(g, G.box(2.6, 2.2, 2.6), plate, { pos: [0, 13.6, 1.4], rot: [0.35, 0.25, 0.05], outline: 0.04 });
    piece(g, G.box(2.0, 0.35, 0.2), 0x5a2a2a, { pos: [0.1, 13.7, 2.75], rot: [0.35, 0.25, 0.05], outline: 0.01 });
    piece(g, G.cyl(0.08, 0.08, 2.4, 4), C.metal, { pos: [-0.8, 15.5, 0.8], rot: [0.2, 0, 0.3], outline: 0.01 });
    for (const s of [-1, 1]) {
      piece(g, G.dome(2.3, 12, 6), rust, { pos: [4.2 * s, 12.2, 0.2], rot: [0, 0, -0.5 * s], scale: [1, 0.8, 1.1], outline: 0.05 });
      if (snow) piece(g, G.dome(1.6, 10, 5), 0xf2f6fa, { pos: [4.4 * s, 13.4, 0.2], scale: [1, 0.35, 1], outline: 0.02 });
    }
    if (snow) piece(g, G.box(2.7, 0.35, 2.7), 0xf2f6fa, { pos: [0, 14.75, 1.15], rot: [0.35, 0.25, 0.05], outline: 0.02 });
    // Right arm: fist planted on the ground.
    beam(g, [4.4, 11.4, 0], [4.8, 7, 1.8], 1.0, plate);
    beam(g, [4.8, 7, 1.8], [4.6, 1.8, 3.6], 0.9, plate);
    piece(g, G.box(2.2, 2.0, 2.2), rust, { pos: [4.6, 1.0, 3.8], outline: 0.04 });
    // Left arm: forearm across the raised knee.
    beam(g, [-4.4, 11.4, 0], [-4.9, 7.4, 1.2], 1.0, plate);
    beam(g, [-4.9, 7.4, 1.2], [-3.0, 5.6, 4.0], 0.9, plate);
    piece(g, G.box(2.0, 1.8, 2.0), rust, { pos: [-2.6, 5.2, 4.6], outline: 0.04 });
    // Legs: the right knee down, the left raised.
    beam(g, [2, 5, -0.6], [2.6, 1.1, 1.6], 1.2, plate);
    beam(g, [2.6, 1.1, 1.6], [2.6, 0.9, -3.6], 1.0, rust);
    piece(g, G.box(2.2, 1.4, 3.2), plate, { pos: [2.6, 0.6, -4.6], outline: 0.04 });
    beam(g, [-2, 5, -0.6], [-2.6, 4.6, 3.2], 1.2, plate);
    beam(g, [-2.6, 4.6, 3.2], [-2.6, 0.9, 3.4], 1.0, rust);
    piece(g, G.box(2.4, 1.4, 3.4), plate, { pos: [-2.6, 0.6, 4.2], outline: 0.04 });
    w.finish(g);
    colBox(0, 0, 3.1, 2.1, 0, 6.2, 6.4);
    colBox(0, 1.4, 1.3, 1.3, 0, 3.2, 12.5);
    col(4.6, 3.8, 1.4, 2.2);
    col(-2.6, 4.2, 1.6, 5);
    col(2.6, -4.2, 1.6, 1.4);
    col(4.8, 1.8, 1.1, 8);
  },

  // A circle of standing stones with glowing glyphs round an altar and a turning rune crystal.
  monoliths(w, p) {
    const { g, y0, rnd, gy, col, colBox } = frame(w, p);
    const n = 10;
    for (let i = 0; i < n; i++) {
      if (i === 0) continue; // the way in, facing the front
      const a = (i / n) * TAU;
      const [lx, lz] = polar(a, 8.2);
      const h = 4.2 + rnd() * 2.6;
      const y = gy(lx, lz);
      piece(g, G.box(1.5, h, 0.9), i % 3 ? C.stoneDark : shade(C.stoneDark, 0.9), { pos: [lx, y + h / 2 - 0.3, lz], rot: [-0.05 + (rnd() - 0.5) * 0.08, a, (rnd() - 0.5) * 0.1], outline: 0.05 });
      piece(g, G.box(0.18, h * 0.55, 0.06), RUNE, { pos: [lx - Math.sin(a) * 0.48, y + h * 0.5, lz - Math.cos(a) * 0.48], rot: [0, a, 0], glow: true, outline: 0 });
      if (i % 3 === 1) piece(g, G.box(2.2, 0.6, 1.1), C.stone, { pos: [lx, y + h + 0.1, lz], rot: [0, a, 0.08], outline: 0.04 });
      colBox(lx, lz, 0.75, 0.45, a, h, y - 0.3);
    }
    piece(g, G.cyl(1.3, 1.5, 1.0, 8), C.stone, { pos: [0, 0.5, -2.8], outline: 0.04 });
    piece(g, G.box(2.6, 0.3, 1.6), shade(C.stone, 1.08), { pos: [0, 1.1, -2.8], outline: 0.03 });
    piece(g, G.torus(1.32, 0.05, TAU, 4, 20), RUNE, { pos: [0, 0.75, -2.8], rot: [Math.PI / 2, 0, 0], glow: true, outline: 0 });
    w.finish(g);
    const [ax, az] = toWorld(p, 0, -2.8);
    w.floatingShard(ax, y0 + 4.6, az, 0.45);
    col(0, -2.8, 1.5, 1.25);
  },

  // Giant crystals breaking out of the ground, glowing from within.
  spires(w, p) {
    const { g, rnd, gy, col } = frame(w, p);
    const n = 6 + Math.floor(rnd() * 3);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + rnd() * 0.5;
      const d = 5 + rnd() * 6;
      const [lx, lz] = polar(a, d);
      const s = 1.2 + rnd() * 1.6;
      const h = 8 + rnd() * 16;
      const tilt = 0.08 + rnd() * 0.3;
      const y = gy(lx, lz);
      const rot = [Math.cos(a) * tilt, a, -Math.sin(a) * tilt];
      piece(g, G.octa(1), i % 2 ? C.crystal : shade(C.crystal, 0.85), { pos: [lx, y + h * 0.35, lz], rot, scale: [s, h / 2, s], outline: 0.05 });
      piece(g, G.octa(1), C.crystalDeep, { pos: [lx, y + h * 0.35, lz], rot, scale: [s * 0.45, h * 0.46, s * 0.45], glow: true, outline: 0 });
      col(lx, lz, s * 0.9, h * 0.8);
      for (let k = 0; k < 3; k++) {
        const [sx, sz] = polar(a + (rnd() - 0.5) * 0.8, d + 2 + rnd() * 2.5);
        const ss = 0.3 + rnd() * 0.5;
        piece(g, G.octa(1), C.crystal, { pos: [sx, gy(sx, sz) + ss, sz], rot: [rnd() - 0.5, rnd() * 3, rnd() - 0.5], scale: [ss, ss * 2.6, ss], outline: 0.02 });
      }
    }
    w.finish(g);
  },

  // A tree from another age: a trunk a car could drive into, roots like walls, a crown of
  // lantern-fruit.
  elder(w, p) {
    const { g, rnd, gy, col } = frame(w, p);
    const biome = w.gen.biomeAt(p.x, p.z);
    const leaf = biome === 'jungle' ? C.jungleLeaf : biome === 'marsh' ? C.moss : C.leaf;
    const bark = 0x5a4232;
    piece(g, G.cyl(1.7, 2.7, 16, 12), bark, { pos: [0, 8, 0], outline: 0.06 });
    piece(g, G.box(1.4, 2.2, 0.2), 0x1a140f, { pos: [0, 1.1, 2.55], outline: 0.01 });
    piece(g, G.box(0.3, 0.3, 0.05), LAMP, { pos: [0.9, 2.5, 2.6], glow: true, outline: 0 });
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU + 0.45; // none straight ahead: that's the way to the cache
      const [ex, ez] = polar(a, 6.5 + rnd() * 2.5);
      const [mx, mz] = polar(a, 3.4);
      piece(g, G.tube([[0, 2.4, 0], [mx, 1.6, mz], [ex, gy(ex, ez) - 0.2, ez]], 0.55 + rnd() * 0.25, 12, 6), bark, { outline: 0.04 });
      col(mx, mz, 0.7, 1.6);
    }
    const tips = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + rnd() * 0.4;
      const [bx, bz] = polar(a, 5.5 + rnd() * 2.5);
      const tip = [bx, 17.5 + rnd() * 3, bz];
      beam(g, [0, 12 + i * 0.5, 0], tip, 0.55, bark, { taper: 0.5 });
      tips.push(tip);
    }
    for (const t of tips) piece(g, lump(1, { detail: 1, rough: 0.2, sy: 0.85, seed: Math.round(t[0] * 10) }), leaf, { pos: [t[0], t[1] + 1.2, t[2]], rot: [rnd(), rnd(), rnd()], scale: 4 + rnd() * 1.6, outline: 0.06 });
    piece(g, lump(1, { detail: 1, rough: 0.18, sy: 0.85, seed: 3 }), shade(leaf, 0.9), { pos: [0, 21, 0], scale: 5.5, outline: 0.06 });
    for (let i = 0; i < 10; i++) {
      const t = tips[i % tips.length];
      piece(g, G.sphere(0.32, 8, 6), LAMP, { pos: [t[0] + (rnd() - 0.5) * 5, t[1] - 2.6, t[2] + (rnd() - 0.5) * 5], glow: true, outline: 0.01 });
    }
    w.finish(g);
    col(0, 0, 2.7, 16);
  },

  // Mushrooms the size of towers, caps spotted with glowing freckles.
  caps(w, p) {
    const { g, rnd, gy, col } = frame(w, p);
    const biome = w.gen.biomeAt(p.x, p.z);
    const cap = biome === 'jungle' ? 0xc0483a : biome === 'marsh' ? 0x8a6a4a : C.shroomCap;
    const n = 5;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + rnd() * 0.6;
      const [lx, lz] = polar(a, 5.5 + rnd() * 5);
      const h = 6 + rnd() * 9;
      const r = 3 + rnd() * 3.5;
      const lean = (rnd() - 0.5) * 0.25;
      const y = gy(lx, lz);
      piece(g, G.cyl(0.65 + h * 0.03, 0.9 + h * 0.05, h, 10), C.shroomStem, { pos: [lx, y + h / 2, lz], rot: [lean, 0, lean], outline: 0.04 });
      piece(g, G.dome(r, 16, 7, 0.5), cap, { pos: [lx + lean * h * 0.5, y + h, lz - lean * h * 0.5], scale: [1, 0.55, 1], outline: 0.06 });
      piece(g, G.cone(r * 0.95, 0.8, 16), shade(cap, 0.6), { pos: [lx + lean * h * 0.5, y + h - 0.35, lz - lean * h * 0.5], rot: [Math.PI, 0, 0], outline: 0 });
      for (let k = 0; k < 6; k++) {
        const sa = rnd() * TAU;
        const sd = r * (0.2 + rnd() * 0.6);
        piece(g, G.sphere(0.32 + rnd() * 0.3, 8, 4), 0xff8ae8, { pos: [lx + lean * h * 0.5 + Math.cos(sa) * sd, y + h + r * 0.55 * Math.sqrt(1 - (sd / r) ** 2) - 0.1, lz - lean * h * 0.5 + Math.sin(sa) * sd], scale: [1, 0.4, 1], glow: true, outline: 0 });
      }
      col(lx, lz, 1 + h * 0.05, h);
    }
    for (let i = 0; i < 9; i++) {
      const [lx, lz] = polar(rnd() * TAU, 3 + rnd() * 10);
      const s = 0.4 + rnd() * 0.6;
      const y = gy(lx, lz);
      piece(g, G.cyl(0.12 * s, 0.16 * s, 1.2 * s, 6), C.shroomStem, { pos: [lx, y + 0.6 * s, lz], outline: 0.01 });
      piece(g, G.dome(0.6 * s, 10, 5), cap, { pos: [lx, y + 1.2 * s, lz], scale: [1, 0.6, 1], outline: 0.02 });
    }
    w.finish(g);
  },

  // A deep-space listening post: a great dish on a lattice tower, its control shed still lit.
  array(w, p) {
    const { g, col } = frame(w, p);
    const H = 7;
    for (const [lx, lz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) {
      piece(g, G.box(0.35, H, 0.35), C.steel, { pos: [lx, H / 2, lz], outline: 0.03 });
      col(lx, lz, 0.35, H);
    }
    for (const y of [2.4, 4.8]) {
      for (const [a, b] of [[[-2, y, -2], [2, y + 2, -2]], [[2, y, 2], [-2, y + 2, 2]], [[-2, y, 2], [-2, y + 2, -2]], [[2, y, -2], [2, y + 2, 2]]]) beam(g, a, b, 0.09, C.metal, { outline: 0.01, seg: 5 });
    }
    piece(g, G.box(5.2, 0.4, 5.2), C.metalDark, { pos: [0, H, 0], outline: 0.04 });
    piece(g, G.cyl(0.9, 1.2, 1.6, 10), C.steel, { pos: [0, H + 1, 0], outline: 0.03 });
    const dish = new THREE.Group();
    dish.position.set(0, H + 3.4, 0);
    dish.rotation.set(-0.85, 0.4, 0);
    g.add(dish);
    piece(dish, G.dome(6.5, 28, 8, 0.32), C.hab, { pos: [0, 0, 0], rot: [Math.PI, 0, 0], scale: [1, 0.55, 1], outline: 0.06 });
    piece(dish, G.torus(6.1, 0.12, TAU, 4, 40), C.metal, { pos: [0, -2.1, 0], rot: [Math.PI / 2, 0, 0], outline: 0.02 });
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU;
      beam(dish, [Math.cos(a) * 4.5, -1.7, Math.sin(a) * 4.5], [0, 2.6, 0], 0.08, C.metal, { outline: 0.01, seg: 5 });
    }
    piece(dish, G.cone(0.5, 1.2, 8), C.metalDark, { pos: [0, 2.9, 0], rot: [Math.PI, 0, 0], outline: 0.02 });
    piece(dish, G.sphere(0.18, 6, 4), 0xff4a3a, { pos: [0, 3.6, 0], glow: true, outline: 0 });
    // Control shed and a radome.
    piece(g, G.box(5.4, 3, 3.6), C.hab, { pos: [7, 1.5, -4], rot: [0, 0.3, 0], outline: 0.04 });
    piece(g, G.box(5.6, 0.25, 3.8), C.metalDark, { pos: [7, 3.1, -4], rot: [0, 0.3, 0], outline: 0.03 });
    for (const x of [-1.2, 0.6, 2]) piece(g, G.box(0.9, 0.6, 0.06), LAMP, { pos: [7 + x * Math.cos(0.3), 1.9, -4 + 1.83 - x * Math.sin(0.3)], rot: [0, 0.3, 0], glow: true, outline: 0 });
    piece(g, G.cyl(0.5, 0.6, 1.4, 8), C.steel, { pos: [-6.5, 0.7, -5], outline: 0.03 });
    piece(g, G.sphere(1.7, 14, 10), C.hab, { pos: [-6.5, 2.6, -5], outline: 0.04 });
    piece(g, G.tube([[0, 0.15, 0], [3.5, 0.1, -2], [7, 0.15, -4]], 0.12, 12, 5), 0x2a2e36, { outline: 0.01 });
    w.finish(g);
    col(7, -4, 2.9, 3.1);
    col(-6.5, -5, 1.8, 4.2);
    col(0, 0, 2.4, 0.4, H - 0.2);
  },

  // The bones of a city: tilted tower stumps with dark window bands, vines down their faces,
  // rubble in the old plaza.
  arcology(w, p) {
    const { g, rnd, gy, col } = frame(w, p);
    const biome = w.gen.biomeAt(p.x, p.z);
    const overgrown = biome === 'marsh' || biome === 'jungle' || biome === 'fungal' || biome === 'forest';
    const wall = shade(C.stone, 0.95);
    const n = 4;
    for (let i = 0; i < n; i++) {
      const a = 0.9 + (i / (n - 1)) * (TAU - 1.8);
      const [lx, lz] = polar(a, 9 + rnd() * 4);
      const wd = 5.5 + rnd() * 2.5;
      const h = 12 + rnd() * 18;
      const tilt = [(rnd() - 0.5) * 0.1, a, (rnd() - 0.5) * 0.1];
      const y = gy(lx, lz) - 1;
      const t = new THREE.Group();
      t.position.set(lx, y, lz);
      t.rotation.set(...tilt);
      g.add(t);
      piece(t, G.box(wd, h, wd), i % 2 ? wall : shade(wall, 0.9), { pos: [0, h / 2, 0], outline: 0.06 });
      for (let f = 3; f < h - 1; f += 3) {
        for (const [fx, fz, ry] of [[0, wd / 2 + 0.03, 0], [0, -wd / 2 - 0.03, 0], [wd / 2 + 0.03, 0, Math.PI / 2], [-wd / 2 - 0.03, 0, Math.PI / 2]]) {
          piece(t, G.box(wd * 0.8, 0.7, 0.06), 0x252a33, { pos: [fx, f, fz], rot: [0, ry, 0], outline: 0 });
        }
      }
      for (let k = 0; k < 4; k++) piece(t, G.box(wd * (0.2 + rnd() * 0.3), 1 + rnd() * 3, wd * (0.2 + rnd() * 0.3)), wall, { pos: [(rnd() - 0.5) * wd * 0.6, h + 0.5, (rnd() - 0.5) * wd * 0.6], outline: 0.04 });
      if (overgrown) {
        for (let k = 0; k < 3; k++) {
          const vx = (rnd() - 0.5) * wd * 0.8;
          piece(t, G.box(0.5, h * (0.3 + rnd() * 0.4), 0.2), C.moss, { pos: [vx, h * 0.3, wd / 2 + 0.12], outline: 0.01 });
        }
      }
      col(lx, lz, wd * 0.6, h);
    }
    for (let i = 0; i < 10; i++) {
      const [lx, lz] = polar(rnd() * TAU, 4 + rnd() * 12);
      const s = 0.8 + rnd() * 1.4;
      piece(g, G.box(1.6 * s, 0.9 * s, 1.2 * s), shade(wall, 0.85), { pos: [lx, gy(lx, lz) + 0.3 * s, lz], rot: [rnd() * 0.6, rnd() * 3, rnd() * 0.6], outline: 0.03 });
    }
    w.finish(g);
  },

  // A natural arch of banded red rock, the cache in its shade.
  arch(w, p) {
    const { g, rnd, gy, col } = frame(w, p);
    const span = 8 + rnd() * 2;
    const top = 6 + rnd() * 2;
    for (const s of [-1, 1]) {
      const y = gy(span * s, 0);
      for (let k = 0; k < 4; k++) {
        const r = 2.6 - k * 0.2;
        piece(g, rockShape(r), k % 2 ? C.redrock : C.redrockDark, { pos: [span * s, y + 1 + k * 2, 0], rot: [k, k * 1.3, 0], scale: [1, 0.75, 0.9], outline: 0.05 });
      }
      col(span * s, 0, 2.6, top + 1);
    }
    const yMid = (gy(-span, 0) + gy(span, 0)) / 2;
    piece(g, G.torus(span, 2.2, Math.PI, 7, 20), C.redrock, { pos: [0, yMid + top, 0], scale: [1, 0.9, 1.1], outline: 0.06 });
    piece(g, G.torus(span + 0.9, 1.0, Math.PI, 5, 20), C.redrockDark, { pos: [0, yMid + top + 0.3, 0.6], scale: [1, 0.9, 1], outline: 0.03 });
    piece(g, G.torus(span - 0.6, 0.9, Math.PI, 5, 20), shade(C.redrock, 1.12), { pos: [0, yMid + top - 0.2, -0.8], scale: [1, 0.9, 1], outline: 0.03 });
    w.finish(g);
  },

  // A fallen monument: a colossal carved head lying on its ear, a hand still raised from the
  // ground, the empty feet on their plinth.
  statue(w, p) {
    const { g, gy, col } = frame(w, p);
    const stone = shade(C.stone, 1.02);
    const head = new THREE.Group();
    // On its side, face turned up towards whoever comes to look.
    head.position.set(-3, gy(-3, -1) + 2.6, -1);
    head.rotation.set(-0.35, 0.45, Math.PI / 2);
    head.scale.setScalar(26);
    g.add(head);
    sculptHead(head, stone, shade(stone, 0.55));
    const hand = new THREE.Group();
    hand.position.set(6.5, gy(6.5, -4) + 6.2, -4);
    hand.rotation.set(Math.PI, 0.4, 0.1);
    hand.scale.setScalar(15);
    g.add(hand);
    fist(hand, stone, stone, 1, 1, { curl: 0.55 });
    beam(g, [6.5, gy(6.5, -4) - 0.5, -4], [6.5, gy(6.5, -4) + 6.4, -4], 0.75, stone, { taper: 0.85, seg: 10 });
    const py = gy(0, -9);
    piece(g, G.box(7, 1.6, 4.4), C.stoneDark, { pos: [0, py + 0.5, -9], outline: 0.05 });
    for (const s of [-1, 1]) piece(g, G.box(1.6, 2.4, 3), stone, { pos: [1.5 * s, py + 2.4, -8.6], rot: [0, 0, 0.05 * s], outline: 0.04 });
    w.finish(g);
    col(-3, -1, 4.2, 5.5);
    col(6.5, -4, 1.4, 8);
    col(0, -9, 3.6, 3.6);
  },

  // Volcanic vents: cones crusted in black glass with lava glowing in their mouths, cracks of fire
  // between them.
  vents(w, p) {
    const { g, rnd, gy, col } = frame(w, p);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU + rnd() * 0.5;
      const [lx, lz] = polar(a, 5 + rnd() * 6);
      const r = 2 + rnd() * 1.6;
      const h = 2.4 + rnd() * 2.6;
      const y = gy(lx, lz);
      piece(g, G.cyl(r * 0.45, r, h, 9), C.charred, { pos: [lx, y + h / 2, lz], outline: 0.05 });
      piece(g, G.cyl(r * 0.36, r * 0.36, 0.2, 9), LAVA, { pos: [lx, y + h - 0.05, lz], glow: true, outline: 0 });
      for (let k = 0; k < 3; k++) {
        const [sx, sz] = polar(a + (rnd() - 0.5), 5 + rnd() * 8);
        const ss = 0.4 + rnd() * 0.7;
        piece(g, G.octa(1), C.obsidian, { pos: [sx, gy(sx, sz) + ss, sz], rot: [rnd(), rnd() * 3, rnd()], scale: [ss, ss * 2.4, ss], outline: 0.02 });
      }
      const fl = new THREE.Group();
      const [wx, wz] = toWorld(p, lx, lz);
      fl.position.set(wx, w.groundHeight(wx, wz) + h, wz);
      piece(fl, G.cone(r * 0.32, 1.6, 7), LAVA, { pos: [0, 0.7, 0], glow: true, outline: 0 });
      piece(fl, G.cone(r * 0.18, 1.1, 6), 0xffd84a, { pos: [0, 0.5, 0], glow: true, outline: 0 });
      bakeTree(fl);
      w.own.group.add(fl);
      w.flame(fl, wx * 7 + wz, null, 0, [LAVA, 0xffd84a], 0.7 + r * 0.12);
      col(lx, lz, r * 0.85, h);
    }
    for (let i = 0; i < 8; i++) {
      const a = rnd() * TAU;
      const [lx, lz] = polar(a, 1 + rnd() * 9);
      piece(g, G.box(0.18, 0.08, 2 + rnd() * 3), LAVA, { pos: [lx, gy(lx, lz) + 0.04, lz], rot: [0, a + (rnd() - 0.5), 0], glow: true, outline: 0 });
    }
    w.finish(g);
  },

  // The stump of a space elevator: a tether climbing out of sight from a buttressed anchor, lit
  // rings marching up it, its broken end lost in the haze.
  elevator(w, p) {
    const { g, rnd, col } = frame(w, p);
    const H = 70 + rnd() * 40;
    piece(g, G.cyl(6.2, 7.2, 3.2, 16), C.stone, { pos: [0, 1.6, 0], outline: 0.06 });
    piece(g, G.torus(6.4, 0.18, TAU, 4, 48), HEARTH, { pos: [0, 2.9, 0], rot: [Math.PI / 2, 0, 0], glow: true, outline: 0 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + Math.PI / 6;
      beam(g, [Math.sin(a) * 9.5, 0, Math.cos(a) * 9.5], [Math.sin(a) * 4.2, 10, Math.cos(a) * 4.2], 0.8, C.stoneDark, { taper: 0.7, outline: 0.04 });
      const [bx, bz] = polar(a, 8.5);
      col(bx, bz, 1.0, 2.5);
    }
    piece(g, G.cyl(2.6, 3.2, H, 14), C.steel, { pos: [0, 3 + H / 2, 0], outline: 0.06 });
    for (let y = 12; y < H; y += 9) piece(g, G.torus(3.0, 0.22, TAU, 4, 28), y % 18 < 9 ? HEARTH : C.metal, { pos: [0, y, 0], rot: [Math.PI / 2, 0, 0], glow: y % 18 < 9, outline: y % 18 < 9 ? 0 : 0.02 });
    for (let k = 0; k < 5; k++) {
      const a = k * 1.3;
      piece(g, G.cone(1.1, 3 + k, 5), C.steel, { pos: [Math.sin(a) * 1.4, 3 + H + 1 + k * 0.4, Math.cos(a) * 1.4], rot: [Math.sin(a) * 0.3, 0, Math.cos(a) * 0.3], outline: 0.04 });
    }
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU;
      beam(g, [Math.sin(a) * 5.6, 3.1, Math.cos(a) * 5.6], [Math.sin(a) * 2.9, H * 0.6, Math.cos(a) * 2.9], 0.14, 0x2a2e36, { outline: 0.01, seg: 5 });
    }
    for (const [lx, lz] of [[-9, 4], [9, -3]]) {
      piece(g, G.dome(2.4, 14, 6), C.hab, { pos: [lx, 0, lz], outline: 0.04 });
      col(lx, lz, 2.3, 2.3);
    }
    w.finish(g);
    col(0, 0, 7, 3.2);
    col(0, 0, 3.2, H, 3);
  },
};

// ================================================================ settlements
// Folk stand round the plaza (Gen places them); buildings go on a ring behind, leaving the front
// (towards the waystone and the road) open.
const ringSlot = (p, k, n, d) => {
  const a = 0.95 + (n === 1 ? 0.5 : k / (n - 1)) * (TAU - 1.9);
  return { a, at: polar(a, d) };
};

// A village house (or barn), local to group g with its entry facing +z: the building kit's
// (world/build/kit.js), one block so it fills the box its builder collides with.
function house(g, x, y, z, ry, { wd = 6, dp = 5, ht = 3.2, wall = C.hab, roof = C.rust, trim = C.metalDark, barn = false, porch = true, chimney = false, style = 'temperate' } = {}) {
  const h = new THREE.Group();
  h.position.set(x, y, z);
  h.rotation.y = ry;
  g.add(h);
  building(h, { wd, dp, ht, wall, roof, trim, barn, porch, chimney, style, simple: true });
  return h;
}

// A lamp post, its lantern hung from a bracket (world/scenery/placeProps.js).
function lampPost(g, x, y, z) {
  kitLamp(g, [x, y, z], { tall: 3, hang: true, rng: seedOf(x, z) });
}

// The trader's stall, just behind where they stand.
function traderStall(w, p, f) {
  const t = p.npcs.find((n) => n.role === 'trader');
  if (!t) return;
  const a = Math.atan2(t.x - p.x, t.z - p.z) - p.rot;
  const [lx, lz] = polar(a, 7.4);
  const s = new THREE.Group();
  s.position.set(lx, f.gy(lx, lz), lz);
  s.rotation.y = a + Math.PI;
  f.g.add(s);
  s.scale.setScalar(0.93);
  kitStall(s, CARGO[1], 'all', seedOf(p.x, p.z));
  f.col(lx, lz, 1.3, 1);
}

export const SETTLEMENT_BUILDERS = {
  // A farm: house and barn, a silo, a wind turbine turning over rows of crops.
  homestead(w, p) {
    const f = frame(w, p);
    const { g, rnd, gy, col, colBox } = f;
    const biome = w.gen.biomeAt(p.x, p.z);
    const crop = biome === 'highland' || biome === 'meadow' ? 0xd8b84a : 0x5aa84e;
    const slots = [0, 1, 2, 3].map((k) => ringSlot(p, k, 4, 11.5));
    const [h1, h2, h3, h4] = slots;
    house(g, h1.at[0], gy(...h1.at), h1.at[1], h1.a + Math.PI, { wd: 7, dp: 5.5, ht: 3.4, variant: rnd(), chimney: true, style: kitStyleOf(biome) });
    colBox(h1.at[0], h1.at[1], 3.85, 3.1, h1.a + Math.PI, 5.9);
    house(g, h2.at[0], gy(...h2.at), h2.at[1], h2.a + Math.PI, { wd: 8, dp: 6, ht: 4.2, wall: 0x9a3a2a, roof: C.metalDark, trim: C.metal, variant: rnd(), barn: true, style: kitStyleOf(biome) });
    colBox(h2.at[0], h2.at[1], 4.35, 3.35, h2.a + Math.PI, 6.9);
    // Silo
    piece(g, G.cyl(1.6, 1.6, 8, 14), C.hab, { pos: [h3.at[0], gy(...h3.at) + 4, h3.at[1]], outline: 0.04 });
    piece(g, G.dome(1.62, 14, 6), C.metal, { pos: [h3.at[0], gy(...h3.at) + 8, h3.at[1]], outline: 0.03 });
    for (const y of [2, 4.5, 7]) piece(g, G.torus(1.62, 0.06, TAU, 4, 24), C.metalDark, { pos: [h3.at[0], gy(...h3.at) + y, h3.at[1]], rot: [Math.PI / 2, 0, 0], outline: 0 });
    for (const s of [-1, 1]) beam(g, [h3.at[0] + s * 0.48, gy(...h3.at) + 0.8, h3.at[1] + 1.45], [h3.at[0] + s * 0.48, gy(...h3.at) + 7.3, h3.at[1] + 1.45], 0.045, C.metalDark, { outline: 0.012, seg: 6 });
    for (let y = 1.1; y < 7.2; y += 0.7) piece(g, G.box(1.0, 0.07, 0.08), C.metalDark, { pos: [h3.at[0], gy(...h3.at) + y, h3.at[1] + 1.48], outline: 0.008 });
    piece(g, G.box(0.82, 1.15, 0.12), C.metalDark, { pos: [h3.at[0], gy(...h3.at) + 1.25, h3.at[1] + 1.58], outline: 0.02 });
    piece(g, G.box(0.58, 0.9, 0.06), C.hab, { pos: [h3.at[0], gy(...h3.at) + 1.25, h3.at[1] + 1.67], outline: 0.012 });
    piece(g, G.cyl(0.16, 0.2, 0.55, 8), C.metalDark, { pos: [h3.at[0], gy(...h3.at) + 8.38, h3.at[1]], outline: 0.015 });
    col(...h3.at, 1.7, 9.6);
    // Wind turbine
    const ty = gy(...h4.at);
    piece(g, G.cyl(0.18, 0.32, 12, 8), C.hab, { pos: [h4.at[0], ty + 6, h4.at[1]], outline: 0.03 });
    piece(g, G.box(0.7, 0.7, 1.6), C.hab, { pos: [h4.at[0], ty + 12.2, h4.at[1]], rot: [0, h4.a, 0], outline: 0.02 });
    const rotor = new THREE.Group();
    rotor.position.set(h4.at[0] + Math.sin(h4.a) * 0.9, ty + 12.2, h4.at[1] + Math.cos(h4.a) * 0.9);
    rotor.rotation.y = h4.a;
    for (let i = 0; i < 3; i++) piece(rotor, G.box(0.35, 5.2, 0.08), C.hab, { pos: [Math.sin((i / 3) * TAU) * 2.6, Math.cos((i / 3) * TAU) * 2.6, 0], rot: [0, 0, -(i / 3) * TAU], outline: 0.02 });
    bakeTree(rotor);
    w.own.group.add(rotor);
    w.spinners.push({ group: rotor, speed: 1.4, owner: w.own, axis: 'z', baseRot: h4.a });
    col(...h4.at, 0.4, 12);
    // Crop field behind, fenced.
    const back = Math.PI;
    for (let r = 0; r < 6; r++) {
      for (let k = 0; k < 9; k++) {
        const [lx, lz] = polar(back + (k - 4) * 0.07, 15 + r * 1.3);
        kitCrop(g, [lx, gy(lx, lz), lz], crop, { grain: crop === 0xd8b84a, rng: seedOf(lx, lz, rnd()) });
      }
    }
    for (let k = -5; k <= 5; k++) {
      const [lx, lz] = polar(back + k * 0.062, 14);
      piece(g, G.box(0.12, 1.1, 0.12), C.wood, { pos: [lx, gy(lx, lz) + 0.55, lz], outline: 0.01 });
    }
    for (const [x, z] of [polar(2.4, 8), polar(-2.4, 8)]) lampPost(g, x, gy(x, z), z);
    traderStall(w, p, f);
    flatten(g);
    w.finish(g);
    w.crate(...toWorld(p, ...polar(1.3, 9.5)), rnd() * 3, 1);
    w.barrel(...toWorld(p, ...polar(-1.2, 9)));
  },

  // A frontier fort: prefab walls with a gate on the road, a watchtower, habs, a landing pad and
  // two turrets keeping the gate.
  outpost(w, p) {
    const f = frame(w, p);
    const { g, gy, col } = f;
    const R = 15.5;
    for (let a = 0.42; a < TAU - 0.42; a += 0.2) {
      const [lx, lz] = polar(a, R);
      const y = gy(lx, lz);
      piece(g, G.box(3.2, 3.4, 0.5), Math.round(a / 0.2) % 2 ? C.steel : shade(C.steel, 0.9), { pos: [lx, y + 1.5, lz], rot: [0, a, 0], outline: 0.04 });
      piece(g, G.box(3.2, 0.12, 0.55), HEARTH, { pos: [lx, y + 2.6, lz], rot: [0, a, 0], glow: true, outline: 0 });
      col(lx, lz, 1.7, 3.2);
    }
    for (const s of [-1, 1]) {
      const [lx, lz] = polar(0.42 * s, R);
      const y = gy(lx, lz);
      piece(g, G.box(1.2, 4.4, 1.2), C.metalDark, { pos: [lx, y + 2.2, lz], outline: 0.03 });
      piece(g, G.box(1.4, 0.8, 1.6), C.steel, { pos: [lx, y + 4.8, lz], rot: [0, 0.42 * s, 0], outline: 0.03 });
      piece(g, G.cylZ(0.1, 0.12, 1.6, 6), C.metalDark, { pos: [lx + Math.sin(0.42 * s) * 0.9, y + 4.9, lz + 0.9], outline: 0.01 });
      col(lx, lz, 0.9, 4.4);
    }
    // Watchtower at the back.
    const [tx, tz] = polar(Math.PI, 11);
    const ty = gy(tx, tz);
    for (const [ox, oz] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) piece(g, G.box(0.2, 7, 0.2), C.steel, { pos: [tx + ox, ty + 3.5, tz + oz], outline: 0.02 });
    piece(g, G.box(3.4, 2.4, 3.4), C.hab, { pos: [tx, ty + 8.1, tz], outline: 0.04 });
    piece(g, G.box(3.8, 0.25, 3.8), C.metalDark, { pos: [tx, ty + 9.4, tz], outline: 0.03 });
    piece(g, G.box(2.6, 0.5, 0.08), HEARTH, { pos: [tx, ty + 8.4, tz + 1.72], glow: true, outline: 0 });
    piece(g, G.cylZ(0.35, 0.25, 0.6, 8), LAMP, { pos: [tx, ty + 9.9, tz + 1.2], glow: true, outline: 0.01 });
    col(tx, tz, 2, 9.6);
    // Habs and a landing pad.
    for (const k of [0, 2]) {
      const s = ringSlot(p, k, 3, 10);
      const [wx, wz] = toWorld(p, ...s.at);
      w.tent(wx, wz, p.rot + s.a + Math.PI, { r: 2.2 });
    }
    const pad = ringSlot(p, 1, 3, 9).at;
    const py = gy(...pad);
    piece(g, G.cyl(3.6, 3.8, 0.3, 8), C.metalDark, { pos: [pad[0], py + 0.15, pad[1]], outline: 0.03 });
    piece(g, G.torus(3.0, 0.08, TAU, 4, 32), 0xffb347, { pos: [pad[0], py + 0.32, pad[1]], rot: [Math.PI / 2, 0, 0], glow: true, outline: 0 });
    piece(g, G.box(2.4, 0.04, 0.4), 0xffb347, { pos: [pad[0], py + 0.32, pad[1]], glow: true, outline: 0 });
    traderStall(w, p, f);
    w.finish(g);
    for (const a of [2.2, -2.2]) w.crate(...toWorld(p, ...polar(a, 12.5)), a, 1.1);
    w.barrel(...toWorld(p, ...polar(1.6, 12)));
  },

  // A mine: a drill rig sunk into a glowing seam, a conveyor up to an ore heap, a crane, huts.
  mining(w, p) {
    const f = frame(w, p);
    const { g, rnd, gy, col, colBox } = f;
    const biome = w.gen.biomeAt(p.x, p.z);
    const ore = biome === 'crystal' ? C.crystal : biome === 'ash' ? LAVA : 0x7ab0d8;
    const [rx, rz] = polar(Math.PI, 11);
    const ry = gy(rx, rz);
    for (const s of [-1, 1]) beam(g, [rx + 3 * s, ry, rz], [rx + 0.3 * s, ry + 13, rz], 0.35, C.steel, { outline: 0.03 });
    beam(g, [rx, ry, rz - 3], [rx, ry + 13, rz - 0.3], 0.3, C.steel, { outline: 0.03 });
    piece(g, G.box(2.2, 2, 2.2), C.paint, { pos: [rx, ry + 9, rz], outline: 0.04 });
    piece(g, G.cyl(0.25, 0.25, 9, 8), C.metal, { pos: [rx, ry + 4.5, rz], outline: 0.02 });
    piece(g, G.cone(0.9, 1.8, 8), C.metalDark, { pos: [rx, ry + 0.6, rz], rot: [Math.PI, 0, 0], outline: 0.02 });
    piece(g, G.cyl(2.2, 2.2, 0.1, 16), ore, { pos: [rx, ry + 0.06, rz], glow: true, outline: 0 });
    col(rx, rz, 3.2, 13);
    // Conveyor up to the ore heap.
    const heap = ringSlot(p, 0, 3, 11).at;
    const hy = gy(...heap);
    beam(g, [rx, ry + 2.5, rz], [heap[0], hy + 4.5, heap[1]], 0.5, C.metalDark, { outline: 0.03 });
    for (let k = 0; k < 7; k++) {
      const [ox, oz] = [heap[0] + (rnd() - 0.5) * 4, heap[1] + (rnd() - 0.5) * 4];
      const s = 0.7 + rnd() * 1.2;
      piece(g, rockShape(s), k % 3 ? C.stoneDark : ore, { pos: [ox, gy(ox, oz) + s * 0.4, oz], rot: [rnd(), rnd(), 0], scale: [1, 0.7, 1], glow: k % 3 === 0, outline: k % 3 ? 0.03 : 0 });
    }
    col(heap[0], heap[1], 2.6, 2);
    // Crane
    const cr = ringSlot(p, 2, 3, 12).at;
    const cy = gy(...cr);
    piece(g, G.box(0.5, 10, 0.5), 0xd9a227, { pos: [cr[0], cy + 5, cr[1]], outline: 0.03 });
    beam(g, [cr[0], cy + 9.6, cr[1]], [cr[0] * 0.5, cy + 9.2, cr[1] * 0.5], 0.22, 0xd9a227, { outline: 0.02 });
    piece(g, G.cyl(0.03, 0.03, 4, 4), 0x2a2e36, { pos: [cr[0] * 0.5, cy + 7.2, cr[1] * 0.5], outline: 0 });
    piece(g, G.box(0.9, 0.6, 0.9), C.metalDark, { pos: [cr[0] * 0.5, cy + 5, cr[1] * 0.5], outline: 0.02 });
    col(cr[0], cr[1], 0.6, 10);
    // Huts, either side of the rig.
    for (const a of [2.1, -2.1]) {
      const [hx, hz] = polar(a, 13);
      house(g, hx, gy(hx, hz), hz, a + Math.PI, { wd: 5, dp: 4, ht: 2.8, wall: C.steel, roof: C.metalDark, trim: 0xd9a227, variant: rnd(), porch: false, style: kitStyleOf(biome) });
      colBox(hx, hz, 2.9, 2.4, a + Math.PI, 4.8);
    }
    for (const [x, z] of [polar(2.3, 8), polar(-2.3, 8)]) lampPost(g, x, gy(x, z), z);
    traderStall(w, p, f);
    flatten(g);
    w.finish(g);
  },

  // A caravan halted for the night: crawler wagons drawn up in a ring under bright canopies,
  // awnings and rugs, a fire, banners.
  caravan(w, p) {
    const f = frame(w, p);
    const { g, rnd, gy, col } = f;
    const cloth = [0xc0583a, 0xd9a227, 0x3a7ab0, 0xe8dcc0];
    for (let k = 0; k < 4; k++) {
      const s = ringSlot(p, k, 4, 11);
      const y = gy(...s.at);
      const v = new THREE.Group();
      v.position.set(s.at[0], y, s.at[1]);
      v.rotation.y = s.a + Math.PI / 2;
      g.add(v);
      piece(v, G.box(6.4, 1.8, 2.6), C.woodDark, { pos: [0, 1.6, 0], outline: 0.04 });
      piece(v, new THREE.CylinderGeometry(1.45, 1.45, 6.2, 12, 1, true, 0, Math.PI).rotateZ(Math.PI / 2), cloth[k % 4], { pos: [0, 2.5, 0], outline: 0.04 });
      for (const x of [-2.2, 0, 2.2]) for (const z of [-1.35, 1.35]) piece(v, G.cylZ(0.75, 0.75, 0.4, 12), 0x2a2420, { pos: [x, 0.75, z], outline: 0.02 });
      piece(v, G.box(1.2, 1.2, 2.4), C.metalDark, { pos: [3.6, 1.2, 0], outline: 0.03 });
      col(...s.at, 3.2, 3.8);
    }
    // Awning over rugs, a fire, banners.
    const aw = polar(Math.PI, 6.5);
    const ay = gy(...aw);
    for (const [ox, oz] of [[-2, -1.5], [2, -1.5], [-2, 1.5], [2, 1.5]]) piece(g, G.cyl(0.06, 0.06, 2.6, 5), C.wood, { pos: [aw[0] + ox, ay + 1.3, aw[1] + oz], outline: 0.01 });
    piece(g, G.box(4.6, 0.06, 3.6), cloth[1], { pos: [aw[0], ay + 2.62, aw[1]], rot: [0.08, 0, 0], outline: 0.02 });
    for (let k = 0; k < 3; k++) piece(g, G.box(1.8, 0.03, 1.2), cloth[(k + 2) % 4], { pos: [aw[0] + (k - 1) * 1.4, ay + 0.03, aw[1] + (rnd() - 0.5)], rot: [0, rnd() * 0.5, 0], outline: 0 });
    for (const a of [1.2, -1.2, 2.6]) {
      const [bx, bz] = polar(a, 14);
      const by = gy(bx, bz);
      piece(g, G.cyl(0.05, 0.05, 4.4, 5), C.wood, { pos: [bx, by + 2.2, bz], outline: 0.01 });
      piece(g, G.box(0.04, 1.4, 0.9), cloth[Math.abs(Math.round(a * 3)) % 4], { pos: [bx, by + 3.6, bz + 0.45], outline: 0.01 });
    }
    traderStall(w, p, f);
    w.finish(g);
    w.campfire(...toWorld(p, ...polar(-2.4, 8.5)));
  },

  // A village on stilts: huts on platforms over the wet ground, boardwalks between them, lanterns,
  // a jetty with boats.
  stilts(w, p) {
    const f = frame(w, p);
    const { g, rnd, gy, col } = f;
    const plank = C.wood;
    for (let k = 0; k < 4; k++) {
      const s = ringSlot(p, k, 4, 11.5);
      const y = gy(...s.at) + 1.6;
      const hut = new THREE.Group();
      hut.position.set(s.at[0], y, s.at[1]);
      hut.rotation.y = s.a + Math.PI;
      g.add(hut);
      piece(hut, G.box(5, 0.3, 5), plank, { pos: [0, 0, 0], outline: 0.03 });
      for (const [ox, oz] of [[-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2], [2.2, 2.2]]) piece(hut, G.cyl(0.14, 0.16, 2.6, 6), C.woodDark, { pos: [ox, -1.2, oz], outline: 0.01 });
      building(sub(hut, 0, 0.15, 0), { wd: 3.6, dp: 3.6, ht: 2.4, wall: shade(plank, 1.15), wallSurf: 'planks', roof: C.thatch, trim: C.woodDark, style: 'wet', simple: true, porch: false, doorX: 0 });
      col(...s.at, 2.8, 6.2);
      // Boardwalk back to the plaza.
      const [bx, bz] = polar(s.a, 6.5);
      piece(g, G.box(1.4, 0.16, 6.5), plank, { pos: [bx, gy(bx, bz) + 0.5, bz], rot: [0, s.a, 0], outline: 0.02 });
    }
    // Jetty and boats at the back.
    const [jx, jz] = polar(Math.PI, 15.5);
    const jy = gy(jx, jz);
    piece(g, G.box(2, 0.2, 7), plank, { pos: [jx, jy + 0.5, jz], rot: [0, Math.PI, 0], outline: 0.02 });
    for (const s of [-1, 1]) {
      const bx = jx + 2.2 * s;
      piece(g, G.box(1.2, 0.5, 3.8), C.woodDark, { pos: [bx, jy + 0.25, jz + (rnd() - 0.5)], rot: [0, 0.2 * s, 0], outline: 0.02 });
    }
    for (const [x, z] of [polar(1.9, 7.5), polar(-1.9, 7.5), polar(Math.PI, 8.5)]) lampPost(g, x, gy(x, z), z);
    traderStall(w, p, f);
    flatten(g);
    w.finish(g);
  },
};
