// The props of settlements, landmarks, story sites and world events, in the scenery kit's way
// (world/scenery/props.js, kit.js): each a base of components — a lamp's footed post, collars,
// bracket and caged lantern; a stall's boarded counter, striped awning and its goods; a notice
// board's framed panel under a shingled roof — seeded, so no two are quite the same, as bakeable
// pieces (render/ModelKit.js) so a whole town still bakes by colour with its surfaces.
// Each builder adds its pieces to the group it's given, at the given local spot, front +z, inside
// the footprint the builder already collided (the old shapes' sizes are kept).
import * as THREE from 'three';
import { G, shade } from '../../render/ModelKit.js';
import { mulberry32 } from '../../core/rng.js';
import { lump, limb, tier, lathe } from './kit.js';
import { Parts, bar, box } from './props.js';
import { C, LAMP, HEARTH, FORGE, RUNE } from '../palette.js';

const TAU = Math.PI * 2;
const IRON = 0x34363c;
const BRASS = 0xb08a3e;
const PAPER = [0xf0e6cc, 0xe8c870, 0xe8dcc0, 0xd8c8a8];
const FRUIT = [0xd83a3a, 0xe8a030, 0x8ac040, 0x7a3ab0];

// A seeded rng from a place's own numbers, for builders that have none to hand.
export const seedOf = (...n) => mulberry32(n.reduce((h, v) => Math.imul(h ^ (Math.round(v * 100) | 0), 16777619), 2166136261) >>> 0);
const parts = (h, rng) => new Parts(rng ?? seedOf(h.position.x, h.position.z, h.children.length), h);

// ---------------------------------------------------------------- lamps
// A street lamp at (x, y, z) in h, `tall` to its lantern: a stepped foot, a fluted post with
// collars, and a caged lantern on top — or, `hang`, swinging from a curled bracket.
export function lampPost(h, [x, y, z], { tall = 3, hang = false, rng = null } = {}) {
  const P = parts(h, rng);
  P.add(lathe([[0.2, 0], [0.2, 0.12], [0.14, 0.18], [0.12, 0.4], [0.075, 0.5]], 8), IRON, { pos: [x, y, z], outline: 0.01 });
  P.add(G.cyl(0.055, 0.075, tall - 0.5, 8), IRON, { pos: [x, y + 0.5 + (tall - 0.5) / 2, z], pattern: 'panels', outline: 0.01 });
  for (const t of [0.35, 0.92]) P.add(G.cyl(0.09, 0.09, 0.07, 8), BRASS, { pos: [x, y + tall * t, z], outline: 0.004 });
  if (hang) {
    const arc = [];
    for (let i = 0; i <= 5; i++) { const a = (i / 5) * Math.PI * 0.9; arc.push([x + Math.sin(a) * 0.32, y + tall - 0.15 + Math.cos(a) * 0.18 + 0.18, z]); }
    P.add(limb(arc, 0.03, 0.025, { sides: 4 }), IRON, { outline: 0.006 });
    lantern(P, [x + 0.45, y + tall - 0.35, z], 0.85);
  } else lantern(P, [x, y + tall, z], 1);
}

// A lantern standing at (x, y, z): a frame of four bars round glowing glass, a peaked cap.
function lantern(P, [x, y, z], s) {
  P.add(G.box(0.3 * s, 0.05 * s, 0.3 * s), IRON, { pos: [x, y, z], outline: 0.006 });
  P.add(G.box(0.24 * s, 0.32 * s, 0.24 * s), LAMP, { pos: [x, y + 0.2 * s, z], glow: true, outline: 0 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.add(G.box(0.03 * s, 0.36 * s, 0.03 * s), IRON, { pos: [x + sx * 0.13 * s, y + 0.2 * s, z + sz * 0.13 * s], outline: 0.003 });
  P.add(G.cone(0.24 * s, 0.2 * s, 4), IRON, { pos: [x, y + 0.48 * s, z], rot: [0, Math.PI / 4, 0], outline: 0.008 });
  P.add(G.sphere(0.035 * s, 6, 4), BRASS, { pos: [x, y + 0.6 * s, z], outline: 0.003 });
}

// ---------------------------------------------------------------- stalls
// A market stall (front +z, the old 2.8 × 1 m counter): a boarded counter with a top, four posts,
// a striped awning with a scalloped edge, and its goods — swords and a shield racked (weapons), a
// cuirass and helm on a stand (armor), or a bit of everything: crates, jars, sacks, fruit, a cell.
export function stall(h, cloth, goods = 'all', rng = null) {
  const P = parts(h, rng);
  const wood = P.pick([C.woodDark, 0x6a4a30, 0x5a3a26]);
  P.add(G.box(2.8, 0.9, 0.9), wood, { pos: [0, 0.45, 0], pattern: 'planks', outline: 0.025 });
  P.add(G.box(2.95, 0.08, 1.05), shade(wood, 1.2), { pos: [0, 0.94, 0], pattern: 'planks', outline: 0.012 });
  for (let i = 0; i < 4; i++) P.add(G.box(0.06, 0.8, 0.02), shade(wood, 0.8), { pos: [-1.05 + i * 0.7, 0.45, 0.46], outline: 0 });
  for (const sx of [-1.35, 1.35]) for (const sz of [-0.45, 0.45]) P.add(G.box(0.09, sz < 0 ? 2.6 : 2.25, 0.09), C.metal, { pos: [sx, (sz < 0 ? 2.6 : 2.25) / 2, sz], outline: 0.01 });
  // The awning: stripes, sloping to the front, and a scalloped valance.
  const stripe = shade(cloth, 1.35);
  for (let i = 0; i < 7; i++) {
    P.add(G.box(3.1 / 7, 0.05, 1.5), i % 2 ? stripe : cloth, { pos: [-1.55 + (i + 0.5) * (3.1 / 7), 2.45, 0.05], rot: [0.24, 0, 0], pattern: 'fabric', outline: 0.012 });
    P.add(G.cone(0.22, 0.25, 3), i % 2 ? stripe : cloth, { pos: [-1.55 + (i + 0.5) * (3.1 / 7), 2.17, 0.81], rot: [Math.PI, Math.PI / 6, 0], scale: [1, 1, 0.15], outline: 0.006 });
  }
  if (goods === 'weapons') {
    bar(P, [-1.2, 2.0, -0.42], [1.2, 2.0, -0.42], 0.04, wood, { pattern: 'planks' });
    for (let i = 0; i < 4; i++) sword(P, [-0.95 + i * 0.62, 1.3, -0.36], P.r(0.9, 1.15));
    P.add(lathe([[0.01, 0.06], [0.32, 0.04], [0.36, 0], [0.32, -0.03], [0.01, -0.04]], 12), P.pick([0x8a2a2a, 0x3a5a8a, C.steel]), { pos: [0.75, 1.3, 0.1], rot: [Math.PI / 2 - 0.4, 0, 0], outline: 0.01 });
    P.add(G.sphere(0.08, 8, 6), BRASS, { pos: [0.75, 1.36, 0.17], outline: 0.004 });
  } else if (goods === 'armor') {
    bar(P, [-0.8, 0.98, -0.3], [-0.8, 2.3, -0.3], 0.03, IRON, { round: true });
    P.add(lathe([[0.18, 0], [0.3, 0.12], [0.33, 0.45], [0.26, 0.62], [0.12, 0.68]], 10), C.steel, { pos: [-0.8, 1.55, -0.3], scale: [1, 1, 0.7], pattern: 'panels', outline: 0.015 });
    for (const s of [-1, 1]) P.add(G.sphere(0.13, 8, 6), shade(C.steel, 0.9), { pos: [-0.8 + s * 0.33, 2.14, -0.3], scale: [1, 0.7, 1], outline: 0.01 });
    P.add(G.dome(0.19, 10, 6), C.steel, { pos: [-0.8, 2.3, -0.3], outline: 0.012 });
    P.add(G.box(0.24, 0.05, 0.03), IRON, { pos: [-0.8, 2.36, -0.12], outline: 0 });
    P.add(G.box(0.55, 0.3, 0.42), C.hide, { pos: [0.5, 1.13, 0.05], rot: [0, 0.2, 0], pattern: 'fabric', outline: 0.012 });
    P.add(G.box(0.45, 0.06, 0.38), shade(C.hide, 0.8), { pos: [0.5, 1.3, 0.05], rot: [0, 0.2, 0.04], outline: 0.006 });
  } else {
    box(P, [-0.95, 0.98, -0.1], 0.36, { ry: P.r(-0.3, 0.3) });
    for (let i = 0; i < 3; i++) P.add(lathe([[0.08, 0], [0.11, 0.08], [0.1, 0.18], [0.05, 0.24], [0.06, 0.28]], 8), P.pick([0x8a5a3a, 0x3a6a7a, 0xb08a5a]), { pos: [-0.4 + i * 0.18, 0.98, 0.12 - i * 0.05], outline: 0.006 });
    P.add(lathe([[0.01, 0], [0.22, 0.02], [0.26, 0.14], [0.27, 0.16]], 10), 0x9a7a4a, { pos: [0.35, 0.98, 0.05], pattern: 'planks', outline: 0.008 });
    for (let i = 0; i < 6; i++) P.add(G.sphere(0.06, 6, 4), P.pick(FRUIT), { pos: [0.35 + P.r(-0.14, 0.14), 1.14, 0.05 + P.r(-0.14, 0.14)], outline: 0.004 });
    P.add(G.cyl(0.1, 0.1, 0.34, 8), HEARTH, { pos: [0.95, 1.15, -0.05], glow: true, outline: 0.01 });
    for (const yy of [0.98, 1.32]) P.add(G.cyl(0.12, 0.12, 0.03, 8), IRON, { pos: [0.95, yy, -0.05], outline: 0.004 });
    P.add(lump(1, { detail: 1, rough: 0.12, sy: 0.9 }), 0xc8b088, { pos: [1.15, 0.35, 0.65], scale: [0.25, 0.32, 0.22], pattern: 'fabric', outline: 0.01 });
  }
}

// A sword standing point down: blade, crossguard, wrapped grip, pommel.
function sword(P, [x, y, z], len) {
  P.add(G.box(0.07, len * 0.75, 0.015), C.metal, { pos: [x, y + len * 0.375, z], rot: [0.12, 0, 0.06], outline: 0.005 });
  P.add(G.box(0.24, 0.04, 0.05), BRASS, { pos: [x + 0.05, y + len * 0.76, z + 0.09], rot: [0.12, 0, 0.06], outline: 0.004 });
  P.add(G.cyl(0.025, 0.025, 0.2, 6), 0x4a2a1a, { pos: [x + 0.06, y + len * 0.88, z + 0.1], rot: [0.12, 0, 0.06], outline: 0.003 });
  P.add(G.sphere(0.04, 6, 4), BRASS, { pos: [x + 0.07, y + len * 1.0, z + 0.12], outline: 0.003 });
}

// ---------------------------------------------------------------- boards and tables
// A notice board (front +z, between its posts 1.9 m apart): braced posts, a framed board under a
// little shingled roof, notices pinned all over it, a lantern hung at one end.
export function noticeBoard(h, rng = null) {
  const P = parts(h, rng);
  for (const x of [-0.95, 0.95]) {
    P.add(G.box(0.14, 2.6, 0.14), C.woodDark, { pos: [x, 1.3, 0], pattern: 'planks', outline: 0.012 });
    bar(P, [x, 0, -0.45], [x, 0.9, -0.05], 0.04, C.woodDark, { pattern: 'planks' });
  }
  P.add(G.box(1.9, 1.3, 0.08), C.wood, { pos: [0, 1.55, 0], pattern: 'planks', outline: 0.02 });
  for (const y of [0.88, 2.22]) P.add(G.box(2.0, 0.08, 0.12), C.woodDark, { pos: [0, y, 0.02], outline: 0.008 });
  for (const s of [-1, 1]) P.add(G.box(1.35, 0.06, 0.55), 0x4a5560, { pos: [s * 0.62, 2.72 - 0.0, 0.0], rot: [0, 0, s * -0.32], pattern: 'shingles', outline: 0.012 });
  P.add(G.box(0.1, 0.1, 0.6), C.woodDark, { pos: [0, 2.94, 0], outline: 0.006 });
  const spots = [[-0.6, 1.8], [-0.1, 1.95], [0.5, 1.75], [-0.45, 1.25], [0.2, 1.35], [0.65, 1.2], [-0.75, 1.6]];
  for (const [i, [x, y]] of spots.entries()) {
    if (i > 4 && P.chance(0.5)) continue;
    const ws = P.r(0.28, 0.4);
    P.add(G.box(ws, ws * 1.2, 0.015), PAPER[i % PAPER.length], { pos: [x + P.r(-0.06, 0.06), y, 0.05], rot: [0, 0, P.r(-0.12, 0.12)], outline: 0.003 });
    P.add(G.sphere(0.025, 5, 4), P.pick([0xb8342a, BRASS, 0x3a5a8a]), { pos: [x, y + ws * 0.5, 0.07], outline: 0 });
  }
  bar(P, [0.95, 2.4, 0.07], [1.25, 2.4, 0.2], 0.02, IRON, { outline: 0.004 });
  lantern(P, [1.25, 2.05, 0.2], 0.6);
}

// The war table where a city's raids are planned (round, 1.3 m): a carved pedestal and rim, a
// map of the land raised in glowing relief, crystal markers, rune lamps on posts round it.
export function warTable(h, rng = null) {
  const P = parts(h, rng);
  P.add(lathe([[1.1, 0], [1.15, 0.08], [0.75, 0.25], [0.6, 0.55], [0.75, 0.75], [1.25, 0.88], [1.38, 0.96]], 16), C.metalDark, { pos: [0, 0, 0], pattern: 'carved', outline: 0.025 });
  P.add(G.cyl(1.38, 1.38, 0.1, 20), C.steel, { pos: [0, 1.0, 0], pattern: 'panels', outline: 0.015 });
  P.add(G.torus(1.38, 0.05, TAU, 5, 28), BRASS, { pos: [0, 1.04, 0], rot: [Math.PI / 2, 0, 0], outline: 0.004 });
  P.add(G.cyl(1.15, 1.15, 0.03, 24), shade(RUNE, 0.45), { pos: [0, 1.07, 0], glow: true, outline: 0 });
  for (let i = 0; i < 7; i++) {
    const a = P.r(0, TAU);
    const d = P.r(0.1, 0.85);
    P.add(lump(1, { detail: 0, rough: 0.25, sy: 0.35 }), RUNE, { pos: [Math.cos(a) * d, 1.1, Math.sin(a) * d], scale: P.r(0.12, 0.28), glow: true, outline: 0 });
  }
  for (const [x, z, c] of [[0.4, -0.2, FORGE], [-0.5, 0.3, 0xff4a3a], [0.1, 0.6, FORGE], [-0.2, -0.6, 0xc46aff]]) {
    P.add(G.octa(0.1), c, { pos: [x, 1.4, z], scale: [1, 1.7, 1], glow: true, outline: 0.006 });
    P.add(G.cyl(0.015, 0.015, 0.25, 4), c, { pos: [x, 1.22, z], glow: true, outline: 0 });
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + 0.4;
    const [x, z] = [Math.sin(a) * 1.9, Math.cos(a) * 1.9];
    P.add(lathe([[0.16, 0], [0.16, 0.1], [0.09, 0.2], [0.07, 1.4], [0.12, 1.5]], 6), C.metalDark, { pos: [x, 0, z], outline: 0.01 });
    P.add(G.octa(0.11), RUNE, { pos: [x, 1.66, z], scale: [1, 1.5, 1], glow: true, outline: 0 });
  }
}

// ---------------------------------------------------------------- greenery
// A tree in a town (its trunk ~3 m to the crown): a trunk flared at the foot under a crown of
// clumps, its middle shaded darker by colour; the leaf colour by climate.
export function townTree(h, [x, y, z], { s = 1, leaf = C.leaf, rng = null } = {}) {
  const P = parts(h, rng);
  const lean = P.r(-0.15, 0.15);
  P.add(limb([[x, y - 0.2, z], [x + lean * 0.3, y + 1.4 * s, z], [x + lean, y + 2.8 * s, z + lean * 0.5]], 0.24 * s, 0.13 * s, { sides: 7, flare: 0.5 }), 0x5a3e2a, { pattern: 'bark', outline: 0.02 });
  const cy = y + 3.2 * s;
  P.add(lump(1, { detail: 1, rough: 0.2, sy: 0.85 }), leaf, { pos: [x + lean, cy, z], scale: 1.35 * s, rot: [0, P.r(0, TAU), 0], outline: 0.035 });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + P.r(-0.4, 0.4);
    P.add(lump(1, { detail: 0, rough: 0.25, sy: 0.85 }), shade(leaf, P.r(0.85, 1.12)), { pos: [x + lean + Math.cos(a) * 0.95 * s, cy + P.r(-0.5, 0.3) * s, z + Math.sin(a) * 0.95 * s], scale: P.r(0.75, 0.95) * s, rot: [0, P.r(0, TAU), 0], outline: 0.025 });
  }
  P.add(lump(1, { detail: 0, rough: 0.2 }), shade(leaf, 1.15), { pos: [x + lean, cy + 1.0 * s, z], scale: 0.8 * s, outline: 0.025 });
}

// A shrub in a planter's soil: a few clumps heaped, flowers in some.
export function shrub(h, [x, y, z], { s = 1, rng = null } = {}) {
  const P = parts(h, rng);
  P.add(lump(1, { detail: 1, rough: 0.18, sy: 0.85 }), C.bush, { pos: [x, y + 0.1 * s, z], scale: 0.6 * s, outline: 0.015 });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + P.r(0, 1);
    P.add(lump(1, { detail: 0, rough: 0.2 }), shade(C.bush, P.r(0.85, 1.15)), { pos: [x + Math.cos(a) * 0.35 * s, y, z + Math.sin(a) * 0.35 * s], scale: 0.4 * s, outline: 0.012 });
  }
  if (P.chance(0.6)) {
    const c = P.pick([0xd94a5a, 0xe8c040, 0xb06ad8, 0xffffff]);
    for (let i = 0; i < 6; i++) P.add(G.octa(0.06), c, { pos: [x + P.r(-0.45, 0.45) * s, y + P.r(0.25, 0.6) * s, z + P.r(-0.45, 0.45) * s], outline: 0 });
  }
}

// A crop plant at (x, y, z) in h: grain (stalks heavy with ears) where `grain`, else a leafy head.
export function crop(h, [x, y, z], color, { grain = false, rng = null } = {}) {
  const P = parts(h, rng);
  if (grain) {
    for (let i = 0; i < 4; i++) {
      const a = P.r(0, TAU);
      const lx = x + Math.cos(a) * 0.12;
      const lz = z + Math.sin(a) * 0.12;
      const top = [lx + Math.cos(a) * 0.12, y + P.r(0.8, 1.0), lz + Math.sin(a) * 0.12];
      bar(P, [lx, y, lz], top, 0.015, shade(color, 0.85), { outline: 0 });
      P.add(G.capsule(0.035, 0.16, 4), color, { pos: [top[0], top[1] + 0.08, top[2]], rot: [Math.cos(a) * 0.4, 0, -Math.sin(a) * 0.4], outline: 0.004 });
    }
    return;
  }
  P.add(tier(0.32, 0.35, { teeth: 5, droop: 0.4, notch: 0.4 }), shade(color, 0.9), { pos: [x, y + 0.05, z], rot: [0, P.r(0, TAU), 0], outline: 0.008 });
  P.add(lump(1, { detail: 0, rough: 0.15 }), shade(color, 1.15), { pos: [x, y + 0.28, z], scale: 0.2, outline: 0.006 });
}

// ---------------------------------------------------------------- stone
// A broken rock's shape (in place of a dodecahedron of radius r, a roughened lump about as big),
// faceted, for heaps, spoil, ore and rubble.
export function rockShape(r, seed = 0) {
  const g = lump(r, { detail: 1, rough: 0.22, seed });
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------- world events
// (world/EventProps.js) Each returns { g, glow, spin? }: glow is the group that lights and turns.
const WARDEN = 0x58cfff;
const MAKER = 0xffd27a;
const RIFT = 0xb46aff;
const STEEL = 0x8c96a6;
const DARK = 0x2a2f3a;
const PLATE = 0x4e5868;
const STONE = 0x6d6a78;

// A Warden pylon: a braced mast on a weighted, bolted foot, conduits up it, an energy crown and a
// shield ring round it.
export function eventPylon() {
  const g = new THREE.Group();
  const P = new Parts(mulberry32(7), g);
  P.add(lathe([[0.9, 0], [0.9, 0.18], [0.7, 0.3], [0.4, 0.38]], 8), DARK, { pattern: 'panels', outline: 0.02 });
  for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; P.add(G.cyl(0.05, 0.05, 0.06, 6), STEEL, { pos: [Math.cos(a) * 0.78, 0.2, Math.sin(a) * 0.78], outline: 0 }); }
  P.add(G.cyl(0.14, 0.2, 3.0, 8), STEEL, { pos: [0, 1.85, 0], pattern: 'panels', outline: 0.016 });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU;
    bar(P, [Math.cos(a) * 0.7, 0.3, Math.sin(a) * 0.7], [Math.cos(a) * 0.15, 2.0, Math.sin(a) * 0.15], 0.06, PLATE);
    bar(P, [Math.cos(a + 0.5) * 0.24, 0.35, Math.sin(a + 0.5) * 0.24], [Math.cos(a + 0.5) * 0.18, 3.1, Math.sin(a + 0.5) * 0.18], 0.025, WARDEN, { outline: 0 });
  }
  P.add(lathe([[0.2, 0], [0.42, 0.08], [0.4, 0.3], [0.25, 0.38]], 8), PLATE, { pos: [0, 3.0, 0], outline: 0.014 });
  const glow = new THREE.Group();
  const Q = new Parts(mulberry32(8), glow);
  Q.add(G.octa(0.3), WARDEN, { pos: [0, 3.75, 0], scale: [1, 1.4, 1], glow: true, outline: 0.01 });
  Q.add(G.torus(0.7, 0.04, TAU, 6, 24).rotateX(Math.PI / 2), WARDEN, { pos: [0, 2.2, 0], glow: true, outline: 0 });
  for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU; Q.add(G.octa(0.07), WARDEN, { pos: [Math.cos(a) * 0.7, 2.2, Math.sin(a) * 0.7], glow: true, outline: 0 }); }
  g.add(glow);
  return { g, glow, spin: glow };
}

// A Warden flare beacon: a lashed tripod, a brazier in a cage, the flame in it.
export function eventFlare() {
  const g = new THREE.Group();
  const P = new Parts(mulberry32(9), g);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU;
    bar(P, [Math.cos(a) * 0.6, 0, Math.sin(a) * 0.6], [Math.cos(a) * 0.08, 2.3, Math.sin(a) * 0.08], 0.05, STEEL, { round: true });
  }
  P.add(G.torus(0.2, 0.03, TAU, 4, 10), 0x6a5a4a, { pos: [0, 1.9, 0], rot: [Math.PI / 2, 0, 0], outline: 0 });
  P.add(lathe([[0.05, 0], [0.22, 0.05], [0.28, 0.22], [0.3, 0.26]], 10), DARK, { pos: [0, 2.2, 0], outline: 0.012 });
  for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; bar(P, [Math.cos(a) * 0.28, 2.45, Math.sin(a) * 0.28], [Math.cos(a) * 0.2, 2.85, Math.sin(a) * 0.2], 0.015, STEEL); }
  const glow = new THREE.Group();
  const Q = new Parts(mulberry32(10), glow);
  Q.add(G.sphere(0.2, 10, 8), 0xffb347, { pos: [0, 2.6, 0], glow: true, outline: 0 });
  Q.add(G.cone(0.16, 0.55, 8), 0xffe0a0, { pos: [0, 2.95, 0], glow: true, outline: 0 });
  g.add(glow);
  return { g, glow };
}

// The Maker beacon: a stepped plinth of carved stone, a gilt spire banded in runes, rings turning.
export function eventBeacon() {
  const g = new THREE.Group();
  const P = new Parts(mulberry32(11), g);
  P.add(G.cyl(1.5, 1.7, 0.4, 6), STONE, { pos: [0, 0.2, 0], pattern: 'carved', outline: 0.02 });
  P.add(G.cyl(1.0, 1.2, 0.4, 6), STONE, { pos: [0, 0.6, 0], pattern: 'carved', outline: 0.02 });
  for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + Math.PI / 6; P.add(G.box(0.3, 0.06, 0.04), MAKER, { pos: [Math.cos(a) * 1.4, 0.25, Math.sin(a) * 1.4], rot: [0, -a + Math.PI / 2, 0], glow: true, outline: 0 }); }
  P.add(lathe([[0.55, 0], [0.5, 0.3], [0.32, 0.5], [0.3, 1.6], [0.22, 2.6], [0.12, 3.4]], 6), 0xb8a26a, { pos: [0, 0.8, 0], outline: 0.016 });
  for (const y of [1.6, 2.4, 3.2]) P.add(G.cyl(0.33 - (y - 1.6) * 0.1, 0.33 - (y - 1.6) * 0.1, 0.08, 6), MAKER, { pos: [0, y, 0], glow: true, outline: 0 });
  const glow = new THREE.Group();
  const Q = new Parts(mulberry32(12), glow);
  Q.add(G.octa(0.45), MAKER, { pos: [0, 4.55, 0], scale: [1, 1.3, 1], glow: true, outline: 0.01 });
  for (const [y, r] of [[1.6, 1.0], [2.8, 0.8], [3.8, 0.6]]) Q.add(G.torus(r, 0.05, TAU, 6, 28).rotateX(Math.PI / 2), MAKER, { pos: [0, y, 0], glow: true, outline: 0 });
  g.add(glow);
  return { g, glow, spin: glow };
}

// The rift: a tear standing in the air, its torn edge burning, broken stone heaved up round it.
export function eventRift() {
  const g = new THREE.Group();
  const P = new Parts(mulberry32(13), g);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU + P.r(-0.2, 0.2);
    const s = P.r(0.45, 0.9);
    P.add(rockShape(1, i + 3), STONE, { pos: [Math.cos(a) * 2.6, s * 0.3, Math.sin(a) * 2.6], scale: [s, s * P.r(1.0, 1.8), s], rot: [Math.cos(a) * 0.4, P.r(0, TAU), -Math.sin(a) * 0.4], pattern: 'rock', outline: 0.016 });
    if (i % 2) P.add(G.octa(0.18), RIFT, { pos: [Math.cos(a) * 2.2, 0.3, Math.sin(a) * 2.2], scale: [1, 2, 1], glow: true, outline: 0 });
  }
  const glow = new THREE.Group();
  const Q = new Parts(mulberry32(14), glow);
  Q.add(G.torus(1.8, 0.14, TAU, 6, 32), RIFT, { pos: [0, 2.6, 0], glow: true, outline: 0 });
  Q.add(G.sphere(1.2, 16, 12), 0x4a1a7a, { pos: [0, 2.6, 0], scale: [1.2, 1.6, 0.18], glow: true, outline: 0 });
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU;
    Q.add(G.cone(0.1, Q.r(0.4, 0.8), 4), 0xe0b0ff, { pos: [Math.cos(a) * 1.9, 2.6 + Math.sin(a) * 1.9, 0], rot: [0, 0, a - Math.PI / 2], glow: true, outline: 0 });
  }
  g.add(glow);
  return { g, glow, spin: glow, face: true };
}


