// The camp kit: how each piece of a camp's layout (world/campLayout.js) is built, for the screen
// and the server's headless world alike (both build the same colliders).
//   buildCampPieces(world, camp, layout)  every piece and spawner, in one baked group
//   PIECE_BUILDERS[kind](world, g, camp, p, at)  one piece: `g` the camp's group (its origin at the
//     camp's middle, on the ground), `p` the piece in camp-local metres, `at(p)` a group stood at it
//   FORT_LOOK[race]  a stronghold's walls, towers and throne, by race
// Pieces built by the world's own helpers (fires, tents, crates, barrels) add their own colliders;
// the rest get one of their layout footprint here.
import * as THREE from 'three';
import { piece, flatten, G, shade } from '../../render/ModelKit.js';
import { building } from './kit.js';
import { C, FORGE, HIVE, ARC } from '../palette.js';

export const FORT_LOOK = {
  scav: { wall: C.steel, glow: FORGE, cap: C.metalDark, surface: 'rust' },
  hive: { wall: C.resin, glow: HIVE, cap: C.resinDark, heaped: true, spires: true, surface: 'chitin' },
  synth: { wall: 0x6a7280, glow: ARC, cap: C.metalDark, surface: 'panels' },
  fauna: { wall: C.stoneDark, glow: 0xffb030, cap: C.stone, heaped: true, surface: 'rock' },
};

// What each solid piece's collider is made of (footstep sounds, hit sparks).
const SURFACE = {
  furnace: 'panels', pylon: 'panels', overhang: 'rock', stakes: 'corrugated', scrapwall: 'rust', boulder: 'rock',
  mound: 'resin', fence: 'panels', mast: 'panels', heap: 'rust', suitrack: 'rust', eggs: 'chitin', spire: 'chitin',
  pod: 'panels', nest: 'rock', gunnest: 'rust', spitspire: 'chitin', turret: 'panels', throne: 'stone',
};
// Pieces whose builders (the world's helpers) add their own colliders.
const SELF_COLLIDING = new Set(['fire', 'node', 'shack', 'tent', 'crate', 'barrel']);

const lookOf = (camp) => FORT_LOOK[camp.race] ?? FORT_LOOK.scav;
const synthy = (camp) => camp.race === 'synth' || camp.style === 'relay';

export const PIECE_BUILDERS = {
  // ---------------------------------------------------------------- cores
  fire: (w, g, camp, p) => w.campfire(camp.x + p.x, camp.z + p.z),
  node: (w, g, camp, p, at) => {
    // The Hive's glowing node, creep spread round it with light in its veins.
    w.campfire(camp.x + p.x, camp.z + p.z, { style: 'node' });
    const o = at(p);
    const R = Math.min(camp.radius * 0.62, 8);
    piece(o, G.cyl(R, R * 1.1, 0.08, 14), C.resin, { pos: [0, 0.02, 0], outline: 0.02 });
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const len = R * (0.6 + ((i * 37) % 10) / 25);
      piece(o, G.box(0.08, 0.03, len), HIVE, { pos: [Math.sin(a) * len * 0.5, 0.08, Math.cos(a) * len * 0.5], rot: [0, a, 0], glow: true, outline: 0 });
    }
  },
  furnace: (w, g, camp, p, at) => {
    // The slag furnace the juggernauts' suits are patched up at.
    const o = at(p);
    piece(o, G.cyl(1.0, 1.2, 1.8, 10), C.metalDark, { pos: [0, 0.9, 0] });
    piece(o, G.cyl(0.25, 0.3, 2.0, 8), C.metal, { pos: [0.4, 2.6, -0.3], outline: 0.012 });
    piece(o, G.box(0.7, 0.5, 0.1), FORGE, { pos: [0, 0.7, 1.12], glow: true, outline: 0.01 });
    piece(o, G.torus(0.95, 0.06, Math.PI * 2, 4, 16), FORGE, { pos: [0, 1.8, 0], rot: [Math.PI / 2, 0, 0], glow: true, outline: 0 });
  },
  pylon: (w, g, camp, p, at) => {
    // Synths: a conduit platform round a humming pylon.
    const o = at(p);
    const R = Math.min(camp.radius * 0.45, 5);
    piece(o, G.cyl(R, R * 1.06, 0.4, 16), C.metalDark, { pos: [0, 0.2, 0], outline: 0.03 });
    piece(o, G.torus(R, 0.06, Math.PI * 2, 4, 32), ARC, { pos: [0, 0.42, 0], rot: [Math.PI / 2, 0, 0], glow: true, outline: 0 });
    piece(o, G.cyl(0.55, 0.8, 5.5, 8), C.steel, { pos: [0, 2.75, 0], outline: 0.03 });
    for (const y of [2, 3.6, 5]) piece(o, G.torus(0.95, 0.08, Math.PI * 2, 4, 20), ARC, { pos: [0, y, 0], rot: [Math.PI / 2, 0, 0], glow: true, outline: 0.01 });
    piece(o, G.octa(0.6), ARC, { pos: [0, 6.4, 0], scale: [1, 1.6, 1], glow: true, outline: 0.02 });
  },
  overhang: (w, g, camp, p, at) => {
    // The wild: a rocky overhang over a nest of branches.
    const o = at(p);
    piece(o, G.dodeca(3.2), C.stone, { pos: [0, 1.2, 0], rot: [0.3, p.rot, 0.2], scale: [1.4, 0.9, 1] });
    piece(o, G.dodeca(2.2), shade(C.stone, 0.9), { pos: [1.2, 2.6, 0.6], rot: [0.5, p.rot, 0.1], scale: [1.3, 0.6, 1] });
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      piece(o, G.cyl(0.07, 0.09, 1.6, 5), C.woodDark, { pos: [Math.cos(a) * 4.2, 0.25, Math.sin(a) * 4.2], rot: [Math.PI / 2, a + 0.6, 0.3], outline: 0.01 });
    }
  },

  // ---------------------------------------------------------------- perimeters
  stakes: (w, g, camp, p) => {
    const t = p.rot + Math.PI / 2;
    for (const off of [-0.4, 0.4]) {
      w.stake(g, camp.x + p.x + Math.sin(t) * off, camp.z + p.z + Math.cos(t) * off, 1.2 + ((off + 1) * 0.3), -0.4, p.rot);
    }
  },
  scrapwall: (w, g, camp, p, at) => {
    const o = at(p);
    piece(o, G.box(2.1, 2.2, 0.12), C.rust, { pos: [0, 1.1, 0], rot: [0.04, 0, 0.02], outline: 0.015 });
    piece(o, G.box(1.1, 0.9, 0.05), 0xb08a3e, { pos: [-0.4, 1.4, 0.09], rot: [0, 0, 0.08], outline: 0.008 });
    for (const s of [-1, 1]) piece(o, G.box(0.14, 2.5, 0.14), C.metalDark, { pos: [s * 1.0, 1.2, -0.1], outline: 0.008 });
    for (let k = -1; k <= 1; k++) piece(o, G.cone(0.08, 0.5, 4), C.metal, { pos: [k * 0.7, 2.45, 0], outline: 0.006 });
  },
  boulder: (w, g, camp, p, at) => {
    const s = p.s ?? 1;
    piece(at(p), G.dodeca(1.2 * s), camp.style === 'den' ? C.stoneDark : C.stone, { pos: [0, 0.4 * s, 0], rot: [p.x, p.z, 0], scale: [1, 0.8, 1] });
  },
  mound: (w, g, camp, p, at) => {
    const s = p.s ?? 1;
    const o = at(p);
    piece(o, G.dodeca(1.1 * s), (Math.round(p.x * 7) & 1) ? C.resin : C.resinDark, { pos: [0, 0.3 * s, 0], rot: [p.x, p.z, 0], scale: [1, 0.75, 1], outline: 0.02 });
    if ((Math.round(p.z * 5) & 3) === 0) piece(o, G.sphere(0.16, 8, 6), HIVE, { pos: [0, 0.85 * s, 0], glow: true, outline: 0.01 });
  },
  fence: (w, g, camp, p, at) => {
    const o = at(p);
    piece(o, G.box(0.16, 2.4, 0.16), C.metalDark, { pos: [1.05, 1.2, 0], outline: 0.01 });
    for (const y of [0.8, 1.7]) piece(o, G.box(2.1, 0.06, 0.04), ARC, { pos: [0, y, 0], glow: true, outline: 0 });
    piece(o, G.sphere(0.07, 6, 4), ARC, { pos: [1.05, 2.45, 0], glow: true, outline: 0 });
  },
  wallseg: (w, g, camp, p, at) => {
    const L = lookOf(camp);
    const o = at(p);
    const i = Math.round((Math.atan2(p.x, p.z) + Math.PI) * 10);
    const broken = i % 7 === 3;
    const h = broken ? 2.2 : 4;
    if (L.heaped) {
      piece(o, G.dodeca(1.9), i % 2 ? L.wall : shade(L.wall, 1.1), { pos: [0, h * 0.3, 0], rot: [i, i * 1.7, 0], scale: [1, h / 3, 1] });
      if (L.spires && i % 2 === 0) piece(o, G.cone(0.3, 1.6, 5), C.chitin, { pos: [0, h * 0.75, 0], rot: [0.2 * Math.sin(i), 0, 0.2 * Math.cos(i)], outline: 0.02 });
      return;
    }
    piece(o, G.box(3.45, h + 2, 1.6), i % 2 ? L.wall : shade(L.wall, 0.9), { pos: [0, h / 2 - 1, 0], outline: 0.05 });
    piece(o, G.box(2.4, 0.12, 1.65), L.glow, { pos: [0, h * 0.55, 0], glow: true, outline: 0 });
    if (!broken) piece(o, G.box(3.55, 0.25, 1.7), L.cap, { pos: [0, h + 0.12, 0], outline: 0.03 });
    if (camp.race === 'scav' && !broken) {
      // Spikes along the top, and a scrap plate welded over the face.
      for (let k = -1; k <= 1; k++) piece(o, G.cone(0.1, 0.7, 4), C.metal, { pos: [k * 0.9, h + 0.55, 0], outline: 0.006 });
      piece(o, G.box(1.2, 1.1, 0.04), i % 3 ? C.rust : 0xb08a3e, { pos: [0.4, h * 0.3, 0.82], rot: [0, 0, 0.05], outline: 0.006 });
    } else if (camp.race === 'synth') {
      piece(o, G.box(0.5, h + 0.4, 1.7), C.hab, { pos: [1.7, h / 2, 0], outline: 0.02, pattern: 'panels' });
    }
  },

  // ---------------------------------------------------------------- buildings
  shack: (w, g, camp, p) => w.tent(camp.x + p.x, camp.z + p.z, p.rot, { r: 1.5, style: 'shack' }),
  tent: (w, g, camp, p) => w.tent(camp.x + p.x, camp.z + p.z, p.rot, { r: 1.5 }),
  mast: (w, g, camp, p, at) => {
    const o = at(p);
    if (synthy(camp)) {
      // A relay mast: a dark spar with an arc light, cabled to the ground.
      piece(o, G.box(0.5, 3.2, 0.5), C.metalDark, { pos: [0, 1.6, 0], outline: 0.02 });
      piece(o, G.sphere(0.22, 8, 6), ARC, { pos: [0, 3.4, 0], glow: true, outline: 0.01 });
      piece(o, G.tube([[0, 0.15, 0], [0.8, 0.05, 0.4], [1.6, 0.2, 0.9]], 0.06, 10, 5), 0x2a2e36, { outline: 0.008 });
      return;
    }
    // A junk radio mast with a skull, a clan banner and blinking lights.
    piece(o, G.cyl(0.12, 0.16, 3.4, 6), C.metalDark, { pos: [0, 1.7, 0] });
    for (let i = 0; i < 3; i++) piece(o, G.box(0.5 - i * 0.1, 0.3, 0.4), [C.rust, 0xb08a3e, C.metal][i], { pos: [0, 0.5 + i * 0.75, 0], rot: [0, i * 0.7, 0.1], outline: 0.012 });
    piece(o, G.sphere(0.28, 10, 8), C.bone, { pos: [0, 3.1, 0], scale: [1, 0.9, 1.1] });
    piece(o, G.dome(0.4, 10, 5), C.metal, { pos: [0.3, 3.5, 0], rot: [0, 0, -1.1], outline: 0.012 });
    for (const yy of [1.4, 2.2]) piece(o, G.sphere(0.06, 6, 4), FORGE, { pos: [0.15, yy, 0.15], glow: true, outline: 0 });
    piece(o, G.box(1.0, 0.7, 0.04), 0xb8342a, { pos: [0.5, 2.2, 0], outline: 0.02 });
  },
  heap: (w, g, camp, p, at) => {
    const o = at(p);
    for (let i = 0; i < 7; i++) {
      const a = i * 2.4;
      piece(o, G.box(0.6 + (i % 3) * 0.3, 0.15, 0.5 + (i % 2) * 0.4), [C.rust, C.metalDark, C.metal][i % 3], { pos: [Math.sin(a) * 0.5, 0.2 + i * 0.12, Math.cos(a) * 0.5], rot: [0.3 * Math.sin(i), a, 0.3 * Math.cos(i)], outline: 0.012 });
    }
  },
  suitrack: (w, g, camp, p, at) => {
    // A rack with a juggernaut's half-patched suit hung on it.
    const o = at(p);
    for (const s of [-1, 1]) piece(o, G.box(0.14, 2.3, 0.14), C.metalDark, { pos: [s * 0.7, 1.15, 0], outline: 0.008 });
    piece(o, G.box(1.6, 0.14, 0.14), C.metalDark, { pos: [0, 2.25, 0], outline: 0.008 });
    piece(o, G.box(0.9, 1.0, 0.6), C.rust, { pos: [0, 1.4, 0], outline: 0.02 });
    piece(o, G.sphere(0.32, 10, 8), C.metal, { pos: [0, 2.05, 0.05], outline: 0.012 });
    piece(o, G.box(0.5, 0.08, 0.02), FORGE, { pos: [0, 2.05, 0.36], glow: true, outline: 0 });
  },
  eggs: (w, g, camp, p, at) => {
    // A clutch of eggs, each with a glowing seam.
    const o = at(p);
    const n = 3 + (Math.abs(Math.round(p.x * 3)) % 3);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + p.rot;
      const ex = Math.sin(a) * 0.45;
      const ez = Math.cos(a) * 0.45;
      const h = 0.45 + (k % 3) * 0.1;
      piece(o, G.sphere(0.3, 10, 8), C.egg, { pos: [ex, h * 0.6, ez], scale: [0.9, (h / 0.3) * 0.55, 0.9], outline: 0.012 });
      piece(o, G.box(0.04, h * 0.6, 0.02), HIVE, { pos: [ex, h * 0.75, ez + 0.27], glow: true, outline: 0 });
    }
  },
  spire: (w, g, camp, p, at) => {
    // A chitin spire, bowed toward the node.
    const o = at(p);
    const h = 4;
    for (let k = 0; k < 3; k++) {
      const t = k / 3;
      piece(o, G.cone(0.55 * (1 - t * 0.55), h * 0.42, 6), k % 2 ? C.chitin : C.resinDark, { pos: [0, h * (0.2 + t * 0.32), -t * 0.5], rot: [-(0.18 + t * 0.3), 0, 0], outline: 0.025 });
    }
    piece(o, G.torus(0.42, 0.05, Math.PI * 2, 4, 12), HIVE, { pos: [0, h * 0.3, 0], rot: [Math.PI / 2, 0, 0], glow: true, outline: 0 });
  },
  pod: (w, g, camp, p, at) => {
    // A Synth cargo pod, lying where it was set down.
    const o = at(p);
    piece(o, G.capsule(0.65, 1.1, 10), C.metalDark, { pos: [0, 0.7, 0], rot: [0, 0, Math.PI / 2], outline: 0.02 });
    piece(o, G.box(1.9, 0.08, 0.06), ARC, { pos: [0, 0.75, 0.64], glow: true, outline: 0 });
    piece(o, G.box(0.3, 0.3, 1.4), C.steel, { pos: [0.6, 0.15, 0], outline: 0.01 });
  },
  nest: (w, g, camp, p, at) => {
    const o = at(p);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      piece(o, G.cyl(0.06, 0.08, 1.4, 5), C.woodDark, { pos: [Math.cos(a) * 1.1, 0.22, Math.sin(a) * 1.1], rot: [Math.PI / 2, a + 0.6, 0.3], outline: 0.01 });
    }
    piece(o, G.sphere(0.25, 8, 6), C.egg, { pos: [0.2, 0.2, 0], outline: 0.01 });
  },
  bones: (w, g, camp, p, at) => {
    const o = at(p);
    for (let i = 0; i < 4; i++) piece(o, G.cyl(0.05, 0.06, 0.7, 5), C.bone, { pos: [Math.sin(i * 1.7) * 0.6, 0.08, Math.cos(i * 1.7) * 0.6], rot: [Math.PI / 2, i * 1.3, 0], outline: 0.008 });
  },

  // ---------------------------------------------------------------- defences
  gunnest: (w, g, camp, p, at) => {
    // Sandbags round a mounted gun, facing out.
    const o = at(p);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 1.4 - Math.PI * 0.7;
      piece(o, G.box(0.8, 0.4, 0.45), 0x8a7a58, { pos: [Math.sin(a) * 1.0, 0.25 + (i % 2) * 0.05, Math.cos(a) * 1.0], rot: [0, a, 0], outline: 0.012 });
    }
    piece(o, G.box(0.14, 0.9, 0.14), C.metalDark, { pos: [0, 0.6, 0], outline: 0.008 });
    piece(o, G.box(0.35, 0.3, 0.6), C.metal, { pos: [0, 1.15, 0.05], outline: 0.01 });
    piece(o, G.cyl(0.06, 0.06, 1.2, 6), C.metalDark, { pos: [0, 1.2, 0.8], rot: [Math.PI / 2, 0, 0], outline: 0.006 });
  },
  spitspire: (w, g, camp, p, at) => {
    const o = at(p);
    piece(o, G.cone(0.75, 4, 7), C.chitin, { pos: [0, 2, 0], outline: 0.03 });
    piece(o, G.sphere(0.45, 10, 8), HIVE, { pos: [0, 3.3, 0.35], scale: [1, 1.2, 1], glow: true, outline: 0.02 });
  },
  turret: (w, g, camp, p, at) => {
    const o = at(p);
    piece(o, G.cyl(0.7, 0.85, 0.9, 8), C.metalDark, { pos: [0, 0.45, 0], outline: 0.02 });
    piece(o, G.box(0.9, 0.6, 1.0), C.steel, { pos: [0, 1.25, 0], outline: 0.02, pattern: 'panels' });
    for (const s of [-1, 1]) piece(o, G.cyl(0.07, 0.07, 1.1, 6), C.metalDark, { pos: [s * 0.22, 1.3, 0.95], rot: [Math.PI / 2, 0, 0], outline: 0.006 });
    piece(o, G.sphere(0.12, 8, 6), ARC, { pos: [0, 1.45, 0.52], glow: true, outline: 0 });
  },
  tower: (w, g, camp, p, at) => {
    const L = lookOf(camp);
    const o = at(p);
    if (L.spires) {
      piece(o, G.cone(2.0, 6, 7), L.cap, { pos: [0, 2, 0], outline: 0.06 });
      piece(o, G.cone(1.1, 6.5, 6), C.chitin, { pos: [0, 6.5, 0], rot: [0.15, 0, 0], outline: 0.05 });
      piece(o, G.torus(1.4, 0.08, Math.PI * 2, 4, 24), L.glow, { pos: [0, 3.6, 0], rot: [Math.PI / 2, 0, 0], glow: true, outline: 0 });
    } else if (camp.race === 'scav') {
      // A watchtower: a plated hut on rusted stilts, braced, a ladder up one leg.
      for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) piece(o, G.box(0.3, 4.6, 0.3), C.rust, { pos: [ox * 1.1, 2.1, oz * 1.1], outline: 0.02 });
      for (const s of [-1, 1]) {
        piece(o, G.box(0.14, 3.6, 0.14), C.metalDark, { pos: [0, 2.2, s * 1.1], rot: [0, 0, s * 0.62], outline: 0.008 });
        piece(o, G.box(0.14, 3.6, 0.14), C.metalDark, { pos: [s * 1.1, 2.2, 0], rot: [s * 0.62, 0, 0], outline: 0.008 });
      }
      for (let k = 0; k < 7; k++) piece(o, G.box(0.6, 0.06, 0.08), C.metal, { pos: [1.1, 0.5 + k * 0.6, -1.4], outline: 0.004 });
      const hut = new THREE.Group();
      hut.position.set(0, 4.4, 0);
      o.add(hut);
      piece(hut, G.box(3.2, 0.25, 3.2), C.metalDark, { pos: [0, -0.1, 0], outline: 0.02 });
      building(hut, { wd: 2.8, dp: 2.8, ht: 2.0, wall: C.metalDark, roof: C.rust, trim: C.rust, style: 'scav', simple: true, doorX: 0.6, doorW: 0.8, doorH: 1.6 });
      piece(hut, G.box(0.5, 0.3, 0.5), FORGE, { pos: [0, 3.2, 0], glow: true, outline: 0.01 });
    } else if (camp.race === 'synth') {
      // A pylon: six white faces narrowing upward, light in rings, a glowing cap.
      piece(o, G.cyl(1.5, 1.8, 7.4, 6), L.wall, { pos: [0, 2.7, 0], outline: 0.05, pattern: 'panels' });
      piece(o, G.cyl(1.9, 1.9, 0.5, 6), L.cap, { pos: [0, 0.25, 0], outline: 0.02 });
      piece(o, G.cone(1.3, 1.4, 6), C.hab, { pos: [0, 7.1, 0], outline: 0.03, pattern: 'panels' });
      piece(o, G.octa(0.45), L.glow, { pos: [0, 8.3, 0], scale: [1, 1.6, 1], glow: true, outline: 0.012 });
      piece(o, G.torus(1.6, 0.08, Math.PI * 2, 4, 24), L.glow, { pos: [0, 6.2, 0], rot: [Math.PI / 2, 0, 0], glow: true, outline: 0 });
    } else {
      piece(o, G.cyl(1.6, 1.8, 7, 12), L.wall, { pos: [0, 2.8, 0], outline: 0.06 });
      piece(o, G.dome(1.6, 12, 6), L.cap, { pos: [0, 6.3, 0], outline: 0.05 });
      piece(o, G.torus(1.65, 0.08, Math.PI * 2, 4, 24), L.glow, { pos: [0, 5.6, 0], rot: [Math.PI / 2, 0, 0], glow: true, outline: 0 });
    }
  },
  throne: (w, g, camp, p, at) => {
    const L = lookOf(camp);
    const o = at(p);
    piece(o, G.box(3, 1, 2), L.cap, { pos: [0, 0.5, 0.9] });
    piece(o, G.box(3, 4, 0.8), L.wall, { pos: [0, 2.5, 0] });
    piece(o, G.box(0.3, 3.2, 0.05), L.glow, { pos: [0, 2.6, 0.42], glow: true, outline: 0 });
    for (const s of [-1, 1]) piece(o, G.cone(0.3, 1.2, 6), C.bone, { pos: [1.4 * s, 5, 0], outline: 0.02 });
  },

  // ---------------------------------------------------------------- spawners (nothing blocks)
  droppad: (w, g, camp, p, at) => {
    // A hardstanding where the trucks pull in, hazard-striped.
    const o = at(p);
    piece(o, G.cyl(2.2, 2.3, 0.08, 16), C.metalDark, { pos: [0, 0.04, 0], outline: 0.01 });
    for (let i = 0; i < 6; i++) piece(o, G.box(0.5, 0.02, 0.14), 0xd8a830, { pos: [-1.25 + i * 0.5, 0.09, 1.9], rot: [0, 0.5, 0], outline: 0 });
  },
  hivemound: (w, g, camp, p, at) => {
    // A broken-open mound, the pit in it glowing.
    const o = at(p);
    piece(o, G.torus(1.3, 0.45, Math.PI * 2, 6, 14), C.resinDark, { pos: [0, 0.2, 0], rot: [Math.PI / 2, 0, 0], outline: 0.02 });
    piece(o, G.cyl(0.95, 0.95, 0.04, 12), HIVE, { pos: [0, 0.05, 0], glow: true, outline: 0 });
  },
  droppod: (w, g, camp, p, at) => {
    // Where the Synths' pods come down: a scorched ring and beacon lights.
    const o = at(p);
    piece(o, G.torus(1.8, 0.05, Math.PI * 2, 4, 24), ARC, { pos: [0, 0.05, 0], rot: [Math.PI / 2, 0, 0], glow: true, outline: 0 });
    piece(o, G.cyl(1.7, 1.75, 0.03, 16), 0x2a2e36, { pos: [0, 0.02, 0], outline: 0 });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      piece(o, G.sphere(0.1, 6, 4), ARC, { pos: [Math.sin(a) * 2.1, 0.12, Math.cos(a) * 2.1], glow: true, outline: 0 });
    }
  },
  burrow: (w, g, camp, p, at) => {
    const o = at(p);
    piece(o, G.cyl(1.0, 1.0, 0.03, 12), 0x1a140e, { pos: [0, 0.03, 0], outline: 0 });
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      piece(o, G.dodeca(0.35 + (i % 3) * 0.1), C.stoneDark, { pos: [Math.sin(a) * 1.3, 0.12, Math.cos(a) * 1.3], rot: [i, i * 2, 0], scale: [1, 0.6, 1] });
    }
  },

  // ---------------------------------------------------------------- clutter
  crate: (w, g, camp, p) => w.crate(camp.x + p.x, camp.z + p.z, p.rot, 0.9 + ((Math.abs(Math.round(p.x * 10)) % 4) * 0.1)),
  barrel: (w, g, camp, p) => w.barrel(camp.x + p.x, camp.z + p.z),
};

export function buildCampPieces(w, camp, layout) {
  const g = w.anchor(camp.x, camp.z);
  const y0 = g.position.y;
  // A group stood on the ground at a piece, turned its way.
  const at = (p) => {
    const o = new THREE.Group();
    o.position.set(p.x, w.groundHeight(camp.x + p.x, camp.z + p.z) - y0, p.z);
    o.rotation.y = p.rot ?? 0;
    g.add(o);
    return o;
  };
  for (const p of layout.pieces) {
    PIECE_BUILDERS[p.kind]?.(w, g, camp, p, at);
    if (p.r > 0 && !SELF_COLLIDING.has(p.kind)) {
      const surface = p.kind === 'wallseg' || p.kind === 'tower' ? lookOf(camp).surface : SURFACE[p.kind] ?? 'stone';
      w.addCollider(camp.x + p.x, camp.z + p.z, p.r, p.h, undefined, surface);
    }
  }
  for (const sp of layout.spawners) PIECE_BUILDERS[sp.kind]?.(w, g, camp, { ...sp, rot: Math.atan2(sp.x, sp.z) }, at);
  flatten(g);
  w.finish(g);
  return g;
}
