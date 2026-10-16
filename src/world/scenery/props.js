// The props of camps and strongholds, in the scenery kit's way (world/scenery/kit.js): each kind a
// base made of components — a crate's planks and banding, a drum's hoops and dents, a scrap wall's
// mismatched plates over posts, a resin mound's swellings, a pylon's narrowing faces and light
// rings — seeded, so no two crates or mounds come out the same, and styled by whose camp it is
// (o.kit: 'scav', 'salvage', 'nest', 'relay' or 'den'; a stronghold's race maps the same way).
// Shared shapes come from the scenery kit (roughened lumps, tapered limbs, jagged tiers, lathes),
// placed as bakeable pieces (render/ModelKit.js), so a whole camp still bakes by colour with its
// surfaces; shacks are the building kit's Scav plans.
//
// prop(kind, rng, o) → THREE.Group: its origin on the ground at the piece's middle, facing +z (a
// wall runs along x and faces out along +z). It stays inside the footprint [r, h] PROP_SIZES gives
// (world/campLayout.js PIECES), so its colliders can come from there. o.s scales a boulder or
// mound. Fires, nodes and furnaces say where their flame goes in group.userData.flame
// ({ y, colors, size }); spawners where things come out in userData.mouth.
import * as THREE from 'three';
import { piece, G, shade } from '../../render/ModelKit.js';
import { lump, limb, tier, lathe } from './kit.js';
import { planBuilding, buildPlan } from '../build/kit.js';
import { C, HEARTH, FORGE, HIVE, ARC, CARGO } from '../palette.js';

const TAU = Math.PI * 2;
const BONE = C.bone;
const PLATES = [C.rust, C.metalDark, 0xb08a3e, C.rust, C.steel, 0x6a4a32];
const SANDBAG = 0xa8956a;
const TARPS = [0x8a6a3a, 0x6a7a4a, 0x7a3a2a, 0x5a6a7a];
const PANEL = 0xdfe4ea;

// Footprints [radius, height] (m): as world/campLayout.js PIECES, and the spawners' own.
export const PROP_SIZES = {
  fire: [0.9, 0.6], furnace: [1.3, 2], node: [1, 1.2], pylon: [0.9, 5.5], overhang: [3.4, 3.2],
  stakes: [0.7, 1.4], scrapwall: [1, 2.2], boulder: [1.2, 1.4], mound: [1.1, 1.2], fence: [0.5, 2.4], wallseg: [1.6, 4],
  shack: [1.6, 2.4], tent: [1.5, 2], mast: [0.5, 3.4], heap: [1.2, 1.4], suitrack: [0.8, 2.2], eggs: [0.9, 0.8],
  spire: [0.6, 4.5], pod: [1, 1.6], nest: [1.4, 0.5], bones: [0, 0],
  gunnest: [1.2, 1.6], spitspire: [0.8, 4], turret: [0.8, 2.2], tower: [1.8, 6], throne: [1.5, 2],
  crate: [0.6, 0.9], barrel: [0.4, 1],
  droppad: [1.4, 0.3], droppod: [1.2, 2.4], hivemound: [1.4, 1.6], burrow: [1.3, 0.9],
};
const RACE_KIT = { scav: 'scav', hive: 'nest', synth: 'relay', fauna: 'den', salvage: 'salvage' };
const kitOf = (o) => o.kit ?? RACE_KIT[o.race] ?? 'scav';

// ---------------------------------------------------------------- components
export class Parts {
  constructor(rng, g) { this.rng = rng; this.g = g; }
  r(a, b) { return a + (b - a) * this.rng(); }
  pick(list) { return list[Math.floor(this.rng() * list.length)]; }
  chance(p) { return this.rng() < p; }
  // (The scenery kit's shapes come without normals, or with a sphere's under a roughened lump: they
  // get their own, faceted, as the place's bake takes them.)
  add(geo, color, opts) {
    if (!geo.attributes.normal || geo.type === 'IcosahedronGeometry') geo.computeVertexNormals();
    return piece(this.g, geo, color, opts);
  }
}

// A bar from a to b (a post, a brace, a cable), r thick.
export function bar(P, a, b, r, color, opts = {}) {
  const A = new THREE.Vector3(...a);
  const B = new THREE.Vector3(...b);
  const len = A.distanceTo(B);
  const m = P.add(opts.round ? G.cyl(r, r, len, opts.sides ?? 6) : G.box(r * 2, len, r * 2), color, { pos: A.clone().add(B).multiplyScalar(0.5).toArray(), outline: opts.outline ?? 0.008, pattern: opts.pattern });
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.sub(A).normalize());
  return m;
}

// A rock: a roughened lump, its facets left hard.
export function rock(P, pos, s, color = C.stone, { sy = 0.8, seed = 0 } = {}) {
  P.add(lump(1, { detail: 1, rough: 0.24, floor: -0.4, seed: seed || Math.floor(P.r(1, 1e6)) }), color, { pos, scale: [s * P.r(0.9, 1.15), s * sy, s * P.r(0.85, 1.1)], rot: [0, P.r(0, TAU), 0], pattern: 'rock', outline: 0.02 });
}

// A plank crate, banded, a stencil on its side (or a steel cargo box for the Synths).
export function box(P, pos, s, { steel = false, ry = 0 } = {}) {
  const [x, y, z] = pos;
  const col = steel ? P.pick([C.steel, C.hullDark, 0x4a5a6a]) : P.pick([C.wood, 0x8a6a48, 0x6a4a30, P.pick(CARGO)]);
  const rot = [0, ry, 0];
  P.add(G.box(0.9 * s, 0.86 * s, 0.9 * s), col, { pos: [x, y + 0.43 * s, z], rot, pattern: steel ? 'panels' : 'planks', outline: 0.015 });
  const edge = steel ? C.metalDark : C.woodDark;
  for (const yy of [0.04, 0.82]) P.add(G.box(0.96 * s, 0.08 * s, 0.96 * s), edge, { pos: [x, y + yy * s, z], rot, outline: 0.01 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const c = Math.cos(ry);
    const sn = Math.sin(ry);
    const lx = sx * 0.44 * s;
    const lz = sz * 0.44 * s;
    P.add(G.box(0.1 * s, 0.86 * s, 0.1 * s), edge, { pos: [x + c * lx + sn * lz, y + 0.43 * s, z - sn * lx + c * lz], rot, outline: 0.006 });
  }
  if (steel) P.add(G.box(0.5 * s, 0.05 * s, 0.92 * s), HEARTH, { pos: [x, y + 0.6 * s, z], rot, glow: true, outline: 0 });
  else if (P.chance(0.6)) P.add(G.box(0.36 * s, 0.24 * s, 0.02), P.pick([0xd9a227, 0xe8dcc0, 0xb8342a]), { pos: [x + Math.sin(ry) * 0.46 * s, y + 0.45 * s, z + Math.cos(ry) * 0.46 * s], rot, outline: 0 });
}

// A drum: hooped, dented, its paint worn; or a fire barrel with vents glowing.
export function drum(P, pos, { fire = false, col = null } = {}) {
  const [x, y, z] = pos;
  const c = col ?? (fire ? C.rust : P.pick([0x8a2a2a, 0x3a5a7a, 0x4a6a3a, 0xb08a3e, C.rust]));
  const r = fire ? 0.42 : 0.36;
  const h = fire ? 0.9 : 1.0;
  P.add(lathe([[r * 0.96, 0], [r, h * 0.12], [r * 0.97, h * 0.5], [r, h * 0.88], [r * 0.96, h], [0.0, h]], 14), c, { pos: [x, y, z], pattern: P.chance(0.5) ? 'rust' : 'panels', outline: 0.015 });
  for (const t of [0.12, 0.5, 0.88]) P.add(G.torus(r + 0.01, 0.025, TAU, 4, 16), C.metalDark, { pos: [x, y + h * t, z], rot: [Math.PI / 2, 0, 0], outline: 0.004 });
  if (fire) {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + P.r(0, 0.5);
      P.add(G.box(0.1, 0.14, 0.02), FORGE, { pos: [x + Math.cos(a) * (r + 0.005), y + h * 0.4, z + Math.sin(a) * (r + 0.005)], rot: [0, -a + Math.PI / 2, 0], glow: true, outline: 0 });
    }
  } else P.add(G.cyl(0.08, 0.08, 0.05, 8), C.metal, { pos: [x + r * 0.45, y + h + 0.02, z], outline: 0.004 });
}

// Scrap plates welded at odd angles over a face `w` wide and `h` tall (z = the face).
function plates(P, w, h, z, { y0 = 0.1, n = null } = {}) {
  const count = n ?? Math.max(3, Math.round(w * h * 1.4));
  for (let k = 0; k < count; k++) {
    const pw = P.r(0.45, 0.95);
    const ph = P.r(0.4, 0.9);
    const col = P.pick(PLATES);
    P.add(G.box(pw, ph, 0.05), col, {
      pos: [P.r(-w / 2 + pw / 2, w / 2 - pw / 2), y0 + P.r(ph / 2, Math.max(ph / 2, h - ph / 2)), z + k * 0.004],
      rot: [0, P.r(-0.05, 0.05), P.r(-0.12, 0.12)], pattern: col === C.rust || col === 0x6a4a32 ? 'rust' : 'panels', outline: 0.008,
    });
  }
}

// Spikes along a top edge from x0 to x1 at height y.
function spikes(P, x0, x1, y, z, { step = 0.32, len = 0.35, col = C.metal } = {}) {
  for (let x = x0; x <= x1; x += step) P.add(G.cone(0.05, len * P.r(0.8, 1.3), 4), col, { pos: [x, y + len / 2, z], rot: [P.r(-0.2, 0.2), 0, P.r(-0.2, 0.2)], outline: 0.004 });
}

// A heap of sandbags, rows staggered, w long.
function sandbags(P, w, rows, z, { y0 = 0 } = {}) {
  for (let r = 0; r < rows; r++) {
    const n = Math.max(1, Math.round(w / 0.6) - (r % 2));
    for (let i = 0; i < n; i++) {
      const x = -((n - 1) * 0.6) / 2 + i * 0.6;
      P.add(lump(1, { detail: 1, rough: 0.06, sy: 1 }), shade(SANDBAG, P.r(0.88, 1.06)), { pos: [x, y0 + 0.14 + r * 0.24, z], scale: [0.32, 0.15, 0.22], rot: [0, P.r(-0.15, 0.15), 0], pattern: 'fabric', outline: 0.012 });
    }
  }
}

// A resin swelling: a lump, glossy dark below, its veins glowing.
function swelling(P, pos, s, { glow = true } = {}) {
  P.add(lump(1, { detail: 1, rough: 0.16, floor: -0.35, sy: 0.75 }), P.pick([C.resin, C.resinDark]), { pos, scale: s, rot: [0, P.r(0, TAU), 0], pattern: 'resin', outline: 0.02 });
  if (glow) {
    for (let i = 0; i < 3; i++) {
      const a = P.r(0, TAU);
      P.add(G.box(0.05, 0.03, s * 0.8), HIVE, { pos: [pos[0] + Math.cos(a) * s * 0.55, pos[1] + s * 0.38, pos[2] + Math.sin(a) * s * 0.55], rot: [P.r(-0.5, 0.5), -a, 0.5], glow: true, outline: 0 });
    }
  }
}

// A chitin horn: a tapering, curving spine in alternating plates.
function horn(P, pos, h, r0, { lean = 0.4, dir = 0, col = C.chitin } = {}) {
  const pts = [];
  for (let i = 0; i <= 4; i++) {
    const t = i / 4;
    pts.push([pos[0] + Math.cos(dir) * lean * h * t * t, pos[1] + h * t, pos[2] + Math.sin(dir) * lean * h * t * t]);
  }
  P.add(limb(pts, r0, r0 * 0.12, { sides: 7, ribs: 0.08 }), col, { pattern: 'resin', outline: 0.02 });
  for (let i = 1; i < 4; i++) P.add(G.torus(r0 * (1 - i * 0.22), 0.04, TAU, 4, 12), i % 2 ? C.resinDark : HIVE, { pos: pts[i], rot: [Math.PI / 2, 0, 0], glow: i % 2 === 0, outline: 0 });
}

// An egg: tall, leathery, a glowing seam down its front.
function egg(P, pos, h) {
  P.add(lathe([[0.01, 0], [0.24, 0.08], [0.3, 0.4], [0.24, 0.75], [0.12, 0.95], [0, 1]], 10), C.egg, { pos, scale: [P.r(0.85, 1.05), h, P.r(0.85, 1.05)], pattern: 'resin', outline: 0.012 });
  P.add(G.box(0.035, h * 0.55, 0.02), HIVE, { pos: [pos[0], pos[1] + h * 0.5, pos[2] + 0.28], rot: [0.15, 0, 0], glow: true, outline: 0 });
}

// A white panel column, narrowing up in six faces, light in rings: the Synths' building block.
function column(P, pos, h, r0, r1, { rings = 2, cap = true } = {}) {
  P.add(G.cyl(r1, r0, h, 6), PANEL, { pos: [pos[0], pos[1] + h / 2, pos[2]], pattern: 'panels', outline: 0.02 });
  for (let i = 1; i <= rings; i++) {
    const t = i / (rings + 1);
    P.add(G.cyl(r0 + (r1 - r0) * t + 0.03, r0 + (r1 - r0) * t + 0.03, 0.08, 6), ARC, { pos: [pos[0], pos[1] + h * t, pos[2]], glow: true, outline: 0 });
  }
  if (cap) P.add(G.octa(r1 * 0.9), ARC, { pos: [pos[0], pos[1] + h + r1 * 0.8, pos[2]], scale: [1, 1.5, 1], glow: true, outline: 0.01 });
}

// Branches laid in a ring, crossing: a nest.
function twigs(P, r, n, { y = 0.15, col = C.woodDark } = {}) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + P.r(-0.2, 0.2);
    const d = r * P.r(0.75, 1);
    const len = P.r(1.0, 1.7);
    const t = a + Math.PI / 2 + P.r(-0.5, 0.5);
    const cx = Math.cos(a) * d;
    const cz = Math.sin(a) * d;
    bar(P, [cx - Math.cos(t) * len / 2, y + P.r(0, 0.15), cz - Math.sin(t) * len / 2], [cx + Math.cos(t) * len / 2, y + P.r(0, 0.2), cz + Math.sin(t) * len / 2], P.r(0.04, 0.07), col, { round: true, sides: 5, pattern: 'bark' });
  }
}

// A bone: a shaft with knobs at each end.
function bone(P, pos, len, ry) {
  const [x, y, z] = pos;
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  bar(P, [x - c * len / 2, y, z - s * len / 2], [x + c * len / 2, y, z + s * len / 2], 0.045, BONE, { round: true, sides: 6 });
  for (const e of [-1, 1]) for (const k of [-1, 1]) P.add(G.sphere(0.06, 6, 4), BONE, { pos: [x + c * e * len / 2 - s * k * 0.04, y, z + s * e * len / 2 + c * k * 0.04], outline: 0.005 });
}

// ---------------------------------------------------------------- the kinds
const PROPS = {
  // The camp's fire: a drum with its vents glowing (scav); a ring of stones round logs (den).
  fire(P, o) {
    if (kitOf(o) === 'den') {
      for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; rock(P, [Math.cos(a) * 0.7, 0.05, Math.sin(a) * 0.7], P.r(0.17, 0.24), C.stoneDark); }
      for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + 0.4; bar(P, [Math.cos(a) * 0.5, 0.05, Math.sin(a) * 0.5], [0, 0.4, 0], 0.07, C.woodDark, { round: true, pattern: 'bark' }); }
      P.g.userData.flame = { y: 0.25, colors: [0xff7a1a, 0xffd84a], size: 0.8 };
      return;
    }
    drum(P, [0, 0, 0], { fire: true });
    for (let i = 0; i < 3; i++) { const a = P.r(0, TAU); bar(P, [Math.cos(a) * 0.15, 0.82, Math.sin(a) * 0.15], [Math.cos(a) * 0.55, 1.05, Math.sin(a) * 0.55], 0.03, C.metalDark, { round: true }); }
    for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU + 0.3; P.add(G.box(0.3, 0.12, 0.2), C.woodDark, { pos: [Math.cos(a) * 0.7, 0.08, Math.sin(a) * 0.7], rot: [0, -a, 0], pattern: 'planks', outline: 0.008 }); }
    P.g.userData.flame = { y: 0.9, colors: [0xff7a1a, 0xffd84a], size: 0.9 };
  },

  // A slag furnace: a squat riveted belly on legs, a glowing mouth, a stack, a bellows.
  furnace(P) {
    P.add(lathe([[0.95, 0], [1.15, 0.3], [1.2, 0.9], [1.0, 1.5], [0.5, 1.75], [0.3, 1.8]], 12), C.metalDark, { pos: [0, 0.1, 0], pattern: 'panels', outline: 0.025 });
    for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + 0.4; bar(P, [Math.cos(a) * 0.9, 0, Math.sin(a) * 0.9], [Math.cos(a) * 1.05, 0.5, Math.sin(a) * 1.05], 0.08, C.rust); }
    P.add(G.torus(1.18, 0.05, TAU, 4, 20), FORGE, { pos: [0, 0.95, 0], rot: [Math.PI / 2, 0, 0], glow: true, outline: 0 });
    P.add(G.box(0.7, 0.5, 0.1), FORGE, { pos: [0, 0.6, 1.12], glow: true, outline: 0.01 });
    P.add(G.box(0.9, 0.12, 0.3), C.metal, { pos: [0, 0.32, 1.15], outline: 0.008 });
    P.add(G.cyl(0.22, 0.28, 1.6, 8), C.rust, { pos: [0.35, 2.4, -0.3], pattern: 'rust', outline: 0.012 });
    P.add(G.cyl(0.3, 0.3, 0.1, 8), C.metalDark, { pos: [0.35, 3.2, -0.3], outline: 0.006 });
    P.add(G.box(0.5, 0.35, 0.7), 0x6a4a32, { pos: [-1.0, 0.4, 0.4], rot: [0, 0.4, 0.15], pattern: 'fabric', outline: 0.01 });
    P.g.userData.flame = { y: 1.8, colors: [0xff7a1a, 0xffd84a], size: 1.1 };
  },

  // The Hive's node: a resin mound split open on a glowing sac, ribs of chitin curling over it.
  node(P) {
    P.add(lump(1, { detail: 1, rough: 0.15, floor: -0.3, sy: 0.55 }), C.resinDark, { pos: [0, 0.15, 0], scale: 0.9, pattern: 'resin', outline: 0.02 });
    P.add(G.sphere(0.42, 12, 8), HIVE, { pos: [0, 0.45, 0], scale: [1, 0.8, 1], glow: true, outline: 0.01 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + P.r(-0.2, 0.2);
      P.add(limb([[Math.cos(a) * 0.85, 0, Math.sin(a) * 0.85], [Math.cos(a) * 0.8, 0.6, Math.sin(a) * 0.8], [Math.cos(a) * 0.35, 1.05, Math.sin(a) * 0.35]], 0.11, 0.03, { sides: 5 }), C.chitin, { pattern: 'resin', outline: 0.012 });
    }
    P.g.userData.flame = { y: 0.4, colors: [HIVE, 0xf0d8ff], size: 1.05 };
  },

  // The Synths' pylon: a white column narrowing up on a conduit plinth, light rings, a cap.
  pylon(P) {
    P.add(G.cyl(0.9, 0.9, 0.3, 6), C.metalDark, { pos: [0, 0.15, 0], pattern: 'panels', outline: 0.02 });
    P.add(G.torus(0.88, 0.05, TAU, 4, 6), ARC, { pos: [0, 0.32, 0], rot: [Math.PI / 2, 0, 0], glow: true, outline: 0 });
    column(P, [0, 0.3, 0], 4.6, 0.62, 0.32, { rings: 3 });
    for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU; bar(P, [Math.cos(a) * 0.85, 0.3, Math.sin(a) * 0.85], [Math.cos(a) * 0.45, 2.0, Math.sin(a) * 0.45], 0.06, C.steel); }
  },

  // The den's overhang: a great slab leaning on a heap of boulders, a dark hollow under it.
  overhang(P) {
    const seed = Math.floor(P.r(1, 1e6));
    rock(P, [-1.0, 0.85, 0], 1.6, C.stone, { sy: 0.85, seed });
    rock(P, [1.2, 0.65, -0.4], 1.2, shade(C.stone, 0.92), { sy: 0.8, seed: seed + 1 });
    P.add(lump(1, { detail: 1, rough: 0.2, floor: -0.6, seed: seed + 2 }), shade(C.stone, 1.04), { pos: [0, 2.4, 0.3], scale: [2.6, 0.7, 2.0], rot: [0.12, P.r(-0.3, 0.3), 0.06], pattern: 'rock', outline: 0.03 });
    P.add(G.dome(1.1, 10, 5), 0x1a1614, { pos: [0, 0, 1.0], scale: [1.2, 0.9, 0.5], outline: 0 });
    for (let i = 0; i < 4; i++) rock(P, [P.r(-2.2, 2.2), 0.1, P.r(1.2, 2.2)], P.r(0.25, 0.4), C.stoneDark);
    for (let i = 0; i < 5; i++) P.add(lump(1, { detail: 0, rough: 0.3, sy: 0.4 }), C.moss, { pos: [P.r(-2, 2), 2.85, P.r(-1, 1.4)], scale: P.r(0.3, 0.6), outline: 0.008 });
  },

  // Stakes: two sheets of scrap driven in at a lean, spiked, lashed to a cross-bar.
  stakes(P) {
    for (const x of [-0.35, 0.35]) {
      const h = P.r(1.15, 1.35);
      const col = P.pick(PLATES);
      P.add(G.box(0.62, h, 0.05), col, { pos: [x, h / 2 - 0.05, 0], rot: [-0.25, P.r(-0.1, 0.1), P.r(-0.06, 0.06)], pattern: col === C.rust ? 'rust' : 'panels', outline: 0.012 });
      P.add(G.cone(0.06, 0.3, 4), C.metal, { pos: [x, h + 0.05, -0.28], rot: [-0.25, 0, 0], outline: 0.006 });
    }
    bar(P, [-0.7, 0.75, -0.12], [0.7, 0.8, -0.12], 0.04, C.woodDark, { round: true, pattern: 'bark' });
    for (const x of [-0.5, 0.5]) bar(P, [x, 0, -0.5], [x * 0.9, 0.85, -0.12], 0.05, C.metalDark);
  },

  // A scrap wall: posts, plates welded over them every which way, spikes along the top.
  scrapwall(P) {
    const w = 1.9;
    const h = P.r(1.7, 1.95);
    for (const x of [-w / 2 + 0.08, w / 2 - 0.08]) bar(P, [x, -0.1, -0.05], [x, h + 0.1, -0.05], 0.07, C.metalDark);
    bar(P, [-w / 2, h * 0.5, -0.1], [w / 2, h * 0.55, -0.1], 0.04, C.rust);
    plates(P, w, h, 0.02);
    spikes(P, -w / 2 + 0.1, w / 2 - 0.1, h - 0.05, 0);
    if (P.chance(0.35)) P.add(G.sphere(0.16, 8, 6), BONE, { pos: [P.r(-0.6, 0.6), h * 0.75, 0.12], scale: [1, 0.9, 1.1], outline: 0.008 });
  },

  // A boulder: a fractured rock with a chunk against it, lichen on top (o.s scales it).
  boulder(P, o) {
    const s = o.s ?? 1;
    rock(P, [0, 0.42 * s, 0], 0.88 * s, o.kit === 'den' ? C.stoneDark : C.stone, { sy: 0.85 });
    rock(P, [P.r(-0.4, 0.4) * s, 0.12 * s, 0.6 * s], 0.32 * s, shade(C.stone, 0.9));
    if (P.chance(0.6)) P.add(lump(1, { detail: 0, rough: 0.3, sy: 0.35 }), P.chance(0.5) ? C.moss : 0xb8b48a, { pos: [P.r(-0.2, 0.2) * s, 1.25 * s, 0], scale: 0.45 * s, outline: 0.006 });
  },

  // A resin mound: swellings heaped, veins of light, a few chitin barbs (o.s scales it).
  mound(P, o) {
    const s = o.s ?? 1;
    swelling(P, [0, 0.3 * s, 0], 1.0 * s);
    swelling(P, [P.r(-0.5, 0.5) * s, 0.15 * s, 0.6 * s], 0.5 * s, { glow: false });
    for (let i = 0; i < 3; i++) { const a = P.r(0, TAU); P.add(G.cone(0.08 * s, 0.5 * s, 5), C.chitin, { pos: [Math.cos(a) * 0.55 * s, 0.85 * s, Math.sin(a) * 0.55 * s], rot: [Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6], outline: 0.006 }); }
  },

  // A Synth fence: white posts with a light bar strung between, a panel at the foot.
  fence(P) {
    for (const x of [-0.45, 0.45]) column(P, [x, 0, 0], 2.2, 0.12, 0.09, { rings: 0, cap: false });
    for (const y of [0.9, 1.6]) P.add(G.box(0.9, 0.05, 0.05), ARC, { pos: [0, y, 0], glow: true, outline: 0 });
    P.add(G.box(0.98, 0.45, 0.08), C.steel, { pos: [0, 0.22, 0], pattern: 'panels', outline: 0.01 });
    for (const x of [-0.45, 0.45]) P.add(G.sphere(0.08, 6, 4), ARC, { pos: [x, 2.3, 0], glow: true, outline: 0 });
  },

  // A stronghold's wall: by race — scrap over a frame with a walkway and spikes (scav), white
  // panels between light bands (relay), resin heaped with chitin ribs (nest), boulders and
  // lashed logs (den).
  wallseg(P, o) {
    const k = kitOf(o);
    const w = 3.1;
    const h = 3.7;
    if (k === 'relay') {
      P.add(G.box(w, h, 0.6), PANEL, { pos: [0, h / 2, 0], pattern: 'panels', outline: 0.03 });
      for (const y of [0.9, 2.6]) P.add(G.box(w + 0.02, 0.1, 0.62), ARC, { pos: [0, y, 0], glow: true, outline: 0 });
      P.add(G.box(0.4, h + 0.3, 0.75), C.steel, { pos: [P.pick([-w / 2 + 0.2, w / 2 - 0.2]), (h + 0.3) / 2, 0], pattern: 'panels', outline: 0.02 });
      P.add(G.box(w + 0.1, 0.25, 0.8), C.metalDark, { pos: [0, h + 0.1, 0], outline: 0.015 });
      return;
    }
    if (k === 'nest') {
      for (let i = 0; i < 3; i++) swelling(P, [-w / 2 + 0.75 + i * (w - 1.5) / 2, 0.6 + P.r(0, 0.4), P.r(-0.15, 0.15)], P.r(0.8, 0.95), { glow: i === 1 });
      for (let i = 0; i < 2; i++) horn(P, [-w / 4 + i * w / 2, 0.8, 0.1], P.r(2.4, 3.0), 0.3, { lean: 0.25, dir: Math.PI / 2 });
      return;
    }
    if (k === 'den') {
      for (let i = 0; i < 3; i++) rock(P, [-w / 2 + 0.75 + i * (w - 1.5) / 2, 0.55, P.r(-0.2, 0.2)], P.r(0.65, 0.8), C.stoneDark);
      for (let i = 0; i < 5; i++) bar(P, [-w / 2 + i * w / 4, 0, -0.5], [-w / 2 + i * w / 4 + P.r(-0.3, 0.3), P.r(2.8, 3.6), -0.2], 0.12, C.woodDark, { round: true, pattern: 'bark' });
      bar(P, [-w / 2, 2.0, -0.35], [w / 2, 2.1, -0.35], 0.07, C.wood, { round: true, pattern: 'bark' });
      return;
    }
    // Scav (and salvage): a frame, plates welded over it, a walkway behind, spikes on top.
    for (const x of [-w / 2 + 0.1, 0, w / 2 - 0.1]) bar(P, [x, -0.1, -0.2], [x, h + 0.1, -0.2], 0.1, C.metalDark);
    P.add(G.box(w, h, 0.12), C.metalDark, { pos: [0, h / 2, -0.15], pattern: 'panels', outline: 0.02 });
    plates(P, w, h - 0.2, -0.06, { y0: 0.1 });
    P.add(G.box(w, 0.12, 0.9), C.wood, { pos: [0, h - 1.1, -0.7], pattern: 'planks', outline: 0.012 });
    spikes(P, -w / 2 + 0.1, w / 2 - 0.1, h, -0.15, { step: 0.4, len: 0.45 });
    sandbags(P, w, 2, 0.4);
  },

  // A scrap shack: the building kit's Scav plan, seeded by the camp.
  shack(P) {
    const plan = planBuilding({ wd: 2.4, dp: 2.0, ht: 2.1, wall: C.metalDark, roof: C.rust, trim: C.rust, style: 'scav', simple: true, chimney: true, doorX: -0.45, doorW: 0.8, doorH: 1.7 }, Math.floor(P.r(1, 2 ** 31)));
    buildPlan(P.g, plan);
  },

  // A tent: a ridge of tarp over poles, guy ropes pegged out, its flap tied back; scav patching.
  tent(P, o) {
    const k = kitOf(o);
    const w = 2.0;
    const d = 2.6;
    const h = 1.75;
    const col = k === 'relay' ? PANEL : P.pick(TARPS);
    for (const s of [-1, 1]) {
      P.add(G.box(Math.hypot(w / 2, h) + 0.05, 0.04, d), col, { pos: [s * w / 4, h / 2, 0], rot: [0, 0, -s * Math.atan2(h, w / 2)], pattern: 'fabric', outline: 0.02 });
    }
    for (const z of [-d / 2, d / 2]) bar(P, [0, 0, z], [0, h + 0.15, z], 0.04, C.woodDark, { round: true });
    bar(P, [0, h + 0.05, -d / 2 - 0.05], [0, h + 0.05, d / 2 + 0.05], 0.035, C.woodDark, { round: true });
    P.add(G.extrude(G.shape([[-w / 2, 0], [w / 2, 0], [0, h]]), 0.03, 0), shade(col, 0.85), { pos: [0, 0, -d / 2], pattern: 'fabric', outline: 0.015 });
    P.add(G.extrude(G.shape([[0, 0], [w / 2, 0], [0, h]]), 0.03, 0), shade(col, 0.85), { pos: [0, 0, d / 2], rot: [0, -0.5, 0], pattern: 'fabric', outline: 0.015 });
    for (const sx of [-1, 1]) for (const z of [-d / 2, d / 2]) bar(P, [0, h, z], [sx * (w / 2 + 0.6), 0, z + Math.sign(z) * 0.3], 0.008, 0x8a7a5a, { outline: 0 });
    if (k === 'scav') for (let i = 0; i < 2; i++) P.add(G.box(0.45, 0.4, 0.02), P.pick(PLATES), { pos: [w * 0.25, h * 0.5 + 0.03, P.r(-0.8, 0.8)], rot: [0, 0, -Math.atan2(h, w / 2)], pattern: 'rust', outline: 0.006 });
  },

  // A mast: a junk radio mast with a skull and banner (scav), or a white relay antenna (relay).
  mast(P, o) {
    if (kitOf(o) === 'relay') {
      column(P, [0, 0, 0], 2.9, 0.22, 0.12, { rings: 2, cap: false });
      P.add(G.dome(0.4, 10, 5), PANEL, { pos: [0.15, 3.0, 0], rot: [0, 0, -1.0], pattern: 'panels', outline: 0.012 });
      P.add(G.sphere(0.07, 6, 4), ARC, { pos: [0, 3.3, 0], glow: true, outline: 0 });
      return;
    }
    bar(P, [0, 0, 0], [0.05, 3.2, 0], 0.09, C.metalDark, { round: true });
    for (let i = 0; i < 3; i++) P.add(G.box(0.5 - i * 0.1, 0.3, 0.4), [C.rust, 0xb08a3e, C.metal][i], { pos: [0, 0.4 + i * 0.75, 0], rot: [0, i * 0.7 + P.r(0, 0.5), 0.1], pattern: 'rust', outline: 0.012 });
    for (const a of [0, 2.1, 4.2]) bar(P, [0, 2.4, 0], [Math.cos(a) * 0.45, 0, Math.sin(a) * 0.45], 0.012, 0x6a5a4a, { outline: 0 });
    P.add(G.sphere(0.26, 10, 8), BONE, { pos: [0.05, 3.15, 0], scale: [1, 0.9, 1.1], outline: 0.01 });
    P.add(G.dome(0.36, 10, 5), C.metal, { pos: [0.3, 3.4, 0], rot: [0, 0, -1.1], outline: 0.012 });
    for (const y of [1.4, 2.2]) P.add(G.sphere(0.06, 6, 4), FORGE, { pos: [0.12, y, 0.1], glow: true, outline: 0 });
    P.add(G.box(0.9, 0.65, 0.04), P.pick([0xb8342a, 0xd9a227, 0x3a3a3a]), { pos: [0.5, 2.3, 0], rot: [0, 0, 0.04], pattern: 'fabric', outline: 0.02 });
  },

  // A scrap heap: plates, drums, a wheel, a girder, piled anyhow.
  heap(P) {
    for (let i = 0; i < 9; i++) {
      const col = P.pick(PLATES);
      P.add(G.box(P.r(0.5, 1.1), 0.12, P.r(0.4, 0.9)), col, { pos: [P.r(-0.7, 0.7), 0.1 + i * 0.11, P.r(-0.7, 0.7)], rot: [P.r(-0.6, 0.6), P.r(0, TAU), P.r(-0.6, 0.6)], pattern: 'rust', outline: 0.01 });
    }
    P.add(G.torus(0.35, 0.12, TAU, 6, 14), 0x2a2a2e, { pos: [P.r(-0.6, 0.6), 0.5, 0.6], rot: [P.r(0.5, 1.4), P.r(0, TAU), 0], outline: 0.01 });
    bar(P, [-1.0, 0.1, -0.3], [0.8, 1.2, 0.2], 0.08, C.metalDark);
    drum(P, [0.7, 0.05, -0.6], { col: C.rust });
  },

  // A suit rack: a gantry with a juggernaut's plating hung on it, tools under it.
  suitrack(P) {
    for (const x of [-0.7, 0.7]) bar(P, [x, 0, 0], [x, 2.1, 0], 0.08, C.metalDark);
    bar(P, [-0.75, 2.05, 0], [0.75, 2.05, 0], 0.07, C.metalDark);
    bar(P, [0, 2.05, 0], [0, 1.65, 0], 0.02, C.metal, { round: true });
    P.add(G.box(0.8, 0.7, 0.45), C.rust, { pos: [0, 1.25, 0], pattern: 'rust', outline: 0.015 });
    for (const s of [-1, 1]) P.add(G.sphere(0.25, 8, 6), C.metalDark, { pos: [s * 0.5, 1.5, 0], scale: [1, 0.8, 1], outline: 0.012 });
    P.add(G.box(0.35, 0.3, 0.35), C.metal, { pos: [0, 1.75, 0], outline: 0.01 });
    P.add(G.box(1.2, 0.5, 0.5), C.metalDark, { pos: [0, 0.25, 0.4], pattern: 'panels', outline: 0.012 });
  },

  // A clutch of eggs, leaning together.
  eggs(P) {
    const n = 3 + Math.floor(P.rng() * 3);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU + P.r(-0.3, 0.3);
      const d = k === 0 ? 0 : P.r(0.35, 0.55);
      egg(P, [Math.cos(a) * d, 0, Math.sin(a) * d], P.r(0.55, 0.78));
    }
    P.add(lump(1, { detail: 0, rough: 0.2, sy: 0.25 }), C.resin, { pos: [0, 0, 0], scale: 0.85, pattern: 'resin', outline: 0.01 });
  },

  // A chitin spire, bowed, banded in light.
  spire(P) {
    horn(P, [0, 0, 0], P.r(4.0, 4.4), 0.55, { lean: 0.12, dir: P.r(0, TAU) });
    swelling(P, [0, 0.1, 0], 0.55, { glow: false });
  },

  // A cargo pod: a white capsule on landing legs, a hatch and a light.
  pod(P) {
    P.add(G.capsule(0.65, 0.9), PANEL, { pos: [0, 1.0, 0], rot: [0, 0, Math.PI / 2], scale: [1, 1, 0.9], pattern: 'panels', outline: 0.02 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) bar(P, [sx * 0.55, 0.6, sz * 0.35], [sx * 0.8, 0, sz * 0.6], 0.04, C.metalDark);
    P.add(G.box(0.7, 0.55, 0.04), C.steel, { pos: [0, 1.0, 0.58], pattern: 'panels', outline: 0.01 });
    P.add(G.box(0.6, 0.05, 0.02), ARC, { pos: [0, 1.35, 0.6], glow: true, outline: 0 });
    for (const x of [-0.6, 0.6]) P.add(G.torus(0.62, 0.04, TAU, 4, 14), C.metalDark, { pos: [x, 1.0, 0], rot: [0, Math.PI / 2, 0], outline: 0.004 });
  },

  // A nest: branches laid in a ring, crossing, a lining of moss, bones in it.
  nest(P) {
    twigs(P, 1.15, 16);
    twigs(P, 0.9, 10, { y: 0.28 });
    P.add(lump(1, { detail: 1, rough: 0.2, sy: 0.15 }), shade(C.moss, 0.85), { pos: [0, 0.05, 0], scale: 0.95, outline: 0.008 });
    for (let i = 0; i < 3; i++) bone(P, [P.r(-0.5, 0.5), 0.15, P.r(-0.5, 0.5)], P.r(0.4, 0.6), P.r(0, TAU));
  },

  // Bones: gnawed, scattered, a skull among them now and then.
  bones(P) {
    for (let i = 0; i < 4; i++) bone(P, [P.r(-0.7, 0.7), 0.05, P.r(-0.7, 0.7)], P.r(0.35, 0.7), P.r(0, TAU));
    if (P.chance(0.5)) P.add(G.sphere(0.18, 8, 6), BONE, { pos: [P.r(-0.4, 0.4), 0.12, P.r(-0.4, 0.4)], scale: [1, 0.85, 1.2], outline: 0.008 });
    for (let i = 0; i < 3; i++) bar(P, [P.r(-0.5, 0.5), 0.15, P.r(-0.5, 0.5)], [P.r(-0.6, 0.6), 0.5, P.r(-0.6, 0.6)], 0.025, BONE, { round: true, sides: 5 });
  },

  // A gun nest: a ring of sandbags round a scrap gun on a tripod, its barrel to the front.
  gunnest(P) {
    for (let i = 0; i < 9; i++) {
      if (i === 4) continue;
      const a = Math.PI / 2 + (i / 9) * TAU;
      for (let r = 0; r < 3; r++) P.add(lump(1, { detail: 1, rough: 0.06 }), shade(SANDBAG, P.r(0.88, 1.06)), { pos: [Math.cos(a) * 1.0, 0.14 + r * 0.24, Math.sin(a) * 1.0], scale: [0.36, 0.15, 0.22], rot: [0, -a + Math.PI / 2 + (r % 2) * 0.3, 0], pattern: 'fabric', outline: 0.012 });
    }
    for (const a of [0, 2.1, 4.2]) bar(P, [0, 0.9, 0], [Math.cos(a) * 0.45, 0, Math.sin(a) * 0.45], 0.035, C.metalDark);
    P.add(G.box(0.35, 0.3, 0.6), C.metalDark, { pos: [0, 1.0, 0], pattern: 'panels', outline: 0.012 });
    P.add(G.cylZ(0.06, 0.07, 1.0, 8), C.metal, { pos: [0, 1.05, 0.75], outline: 0.008 });
    P.add(G.box(0.6, 0.45, 0.04), C.rust, { pos: [0, 1.25, 0.32], rot: [-0.15, 0, 0], pattern: 'rust', outline: 0.01 });
  },

  // A drop pad: a scrap platform with a painted target, landing lights at its corners.
  droppad(P) {
    P.add(G.cyl(1.35, 1.4, 0.18, 8), C.metalDark, { pos: [0, 0.09, 0], pattern: 'panels', outline: 0.02 });
    P.add(G.torus(0.8, 0.07, TAU, 4, 8), 0xd9a227, { pos: [0, 0.19, 0], rot: [Math.PI / 2, 0, 0], outline: 0 });
    for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + Math.PI / 4; P.add(G.sphere(0.08, 6, 4), FORGE, { pos: [Math.cos(a) * 1.2, 0.24, Math.sin(a) * 1.2], glow: true, outline: 0 }); }
    P.g.userData.mouth = { y: 0.2 };
  },

  // A spitting spire: a horn swollen at its head, its mouth glowing.
  spitspire(P) {
    horn(P, [0, 0, 0], 3.2, 0.6, { lean: 0.15, dir: P.r(0, TAU) });
    P.add(lump(1, { detail: 1, rough: 0.15, sy: 1.1 }), C.resinDark, { pos: [0, 3.3, 0], scale: 0.55, pattern: 'resin', outline: 0.015 });
    P.add(G.sphere(0.2, 8, 6), HIVE, { pos: [0, 3.4, 0.45], glow: true, outline: 0.01 });
    swelling(P, [0, 0.15, 0], 0.75);
  },

  // A Synth turret: a white housing on a ring mount, twin barrels and a lens.
  turret(P) {
    P.add(G.cyl(0.7, 0.8, 0.5, 6), C.metalDark, { pos: [0, 0.25, 0], pattern: 'panels', outline: 0.02 });
    column(P, [0, 0.5, 0], 0.9, 0.35, 0.3, { rings: 1, cap: false });
    P.add(G.box(0.8, 0.5, 0.8), PANEL, { pos: [0, 1.6, 0], pattern: 'panels', outline: 0.02 });
    for (const x of [-0.18, 0.18]) P.add(G.cylZ(0.06, 0.06, 0.8, 8), C.steel, { pos: [x, 1.6, 0.75], outline: 0.008 });
    P.add(G.sphere(0.1, 8, 6), ARC, { pos: [0, 1.8, 0.42], glow: true, outline: 0 });
  },

  // A drop pod: a scorched capsule driven nose-first into a crater, its petals open.
  droppod(P) {
    P.add(lump(1, { detail: 1, rough: 0.1, sy: 0.18 }), C.dirtDark, { pos: [0, 0, 0], scale: 1.2, outline: 0.01 });
    P.add(G.capsule(0.55, 1.0), PANEL, { pos: [0, 1.0, 0], rot: [0.2, 0, 0.1], pattern: 'panels', outline: 0.02 });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU;
      P.add(G.box(0.5, 0.9, 0.06), C.steel, { pos: [Math.cos(a) * 0.75, 1.9, Math.sin(a) * 0.75], rot: [Math.sin(a) * 0.9, -a, -Math.cos(a) * 0.9], pattern: 'panels', outline: 0.01 });
    }
    P.add(G.torus(0.56, 0.05, TAU, 4, 14), ARC, { pos: [0, 1.6, 0], rot: [Math.PI / 2 + 0.2, 0, 0], glow: true, outline: 0 });
    P.g.userData.mouth = { y: 0.3 };
  },

  // A Hive mound that births: a swollen hill with an opening that glows, ribs round its mouth.
  hivemound(P) {
    P.add(lump(1, { detail: 1, rough: 0.14, floor: -0.3, sy: 0.75 }), C.resin, { pos: [0, 0.2, 0], scale: 1.3, pattern: 'resin', outline: 0.025 });
    P.add(G.sphere(0.45, 10, 8), 0x1a0a22, { pos: [0, 0.7, 0.95], scale: [1, 0.8, 0.5], outline: 0 });
    P.add(G.torus(0.48, 0.07, TAU, 5, 14), HIVE, { pos: [0, 0.7, 1.0], rot: [-0.3, 0, 0], glow: true, outline: 0 });
    for (let i = 0; i < 5; i++) {
      const a = Math.PI / 2 + (i - 2) * 0.45;
      horn(P, [Math.cos(a) * 0.8, 0.3, Math.sin(a) * 0.8], 1.2, 0.12, { lean: 0.5, dir: a + Math.PI });
    }
    P.g.userData.mouth = { y: 0.7, z: 1.1 };
  },

  // A burrow: a mouth of earth and roots under a lip of rock, dug spoil fanned out before it.
  burrow(P) {
    rock(P, [0, 0.3, -0.3], 0.7, C.stoneDark, { sy: 0.6 });
    P.add(G.sphere(0.6, 10, 6), 0x1a1410, { pos: [0, 0.15, 0.35], scale: [1, 0.55, 0.6], outline: 0 });
    P.add(lump(1, { detail: 1, rough: 0.2, sy: 0.2 }), C.dirtDark, { pos: [0, 0, 0.6], scale: [0.95, 1, 0.6], outline: 0.01 });
    for (let i = 0; i < 4; i++) { const a = P.r(-0.6, 0.6); bar(P, [Math.sin(a) * 0.7, 0.5, 0.1], [Math.sin(a) * 0.9, 0.1, 0.6], 0.03, C.woodDark, { round: true, sides: 4 }); }
    P.g.userData.mouth = { y: 0.2, z: 0.6 };
  },

  // A stronghold's tower, by race: a plated hut on braced stilts with a ladder (scav), a white
  // pylon tower (relay), a great chitin spire (nest), a heaped cairn crowned with logs (den).
  tower(P, o) {
    const k = kitOf(o);
    if (k === 'relay') {
      column(P, [0, 0, 0], 5.2, 1.4, 0.8, { rings: 3 });
      return;
    }
    if (k === 'nest') {
      swelling(P, [0, 0.4, 0], 1.2);
      horn(P, [0, 0.5, 0], 5.2, 0.9, { lean: 0.15, dir: P.r(0, TAU) });
      return;
    }
    if (k === 'den') {
      for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU; rock(P, [Math.cos(a) * 0.85, 0.65, Math.sin(a) * 0.85], P.r(0.6, 0.75), C.stoneDark); }
      rock(P, [0, 2.0, 0], 0.95, C.stone);
      for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; bar(P, [Math.cos(a) * 0.5, 3.0, Math.sin(a) * 0.5], [Math.cos(a) * 0.9, 5.4, Math.sin(a) * 0.9], 0.09, C.woodDark, { round: true, pattern: 'bark' }); }
      return;
    }
    const top = 3.4;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) bar(P, [sx * 1.2, 0, sz * 1.2], [sx * 0.85, top, sz * 0.85], 0.1, C.rust);
    for (const y of [1.1, 2.3]) for (const s of [-1, 1]) { bar(P, [-1.1, y, s * 1.1], [1.1, y + 0.6, s * 1.1], 0.05, C.metalDark); bar(P, [s * 1.1, y, -1.1], [s * 1.1, y + 0.6, 1.1], 0.05, C.metalDark); }
    P.add(G.box(2.2, 0.15, 2.2), C.wood, { pos: [0, top, 0], pattern: 'planks', outline: 0.015 });
    P.add(G.box(2.0, 1.4, 2.0), C.metalDark, { pos: [0, top + 0.8, 0], pattern: 'panels', outline: 0.02 });
    plates(P, 2.0, 1.2, 1.02, { y0: top + 0.1, n: 4 });
    P.add(G.box(1.6, 0.18, 0.06), FORGE, { pos: [0, top + 1.15, 1.05], glow: true, outline: 0 });
    P.add(G.box(2.6, 0.12, 2.6), C.rust, { pos: [0, top + 1.7, 0], rot: [0.12, 0, 0], pattern: 'corrugated', outline: 0.015 });
    spikes(P, -1.2, 1.2, top + 1.75, 1.3);
    for (const x of [-0.2, 0.2]) bar(P, [x, 0, 1.6], [x, top, 1.15], 0.035, C.metal);
    for (let y = 0.4; y < top; y += 0.45) bar(P, [-0.2, y, 1.6 - (y / top) * 0.45], [0.2, y, 1.6 - (y / top) * 0.45], 0.025, C.metal);
  },

  // A throne: a chief's seat, by race — welded scrap with trophies (scav), white with light
  // (relay), chitin grown into a seat (nest), a slab draped in hides (den).
  throne(P, o) {
    const k = kitOf(o);
    P.add(G.box(2.6, 0.35, 2.2), k === 'relay' ? C.metalDark : C.stoneDark, { pos: [0, 0.17, 0], pattern: k === 'relay' ? 'panels' : 'blocks', outline: 0.02 });
    if (k === 'relay') {
      P.add(G.box(1.2, 0.5, 1.0), PANEL, { pos: [0, 0.6, 0], pattern: 'panels', outline: 0.02 });
      P.add(G.box(1.2, 1.4, 0.2), PANEL, { pos: [0, 1.2, -0.45], pattern: 'panels', outline: 0.02 });
      P.add(G.box(1.0, 0.06, 0.04), ARC, { pos: [0, 1.7, -0.33], glow: true, outline: 0 });
      return;
    }
    if (k === 'nest') {
      swelling(P, [0, 0.6, 0], 0.8, { glow: false });
      for (let i = 0; i < 5; i++) horn(P, [-0.8 + i * 0.4, 0.4, -0.5], P.r(1.2, 1.7), 0.14, { lean: 0.3, dir: Math.PI / 2 });
      return;
    }
    if (k === 'den') {
      rock(P, [0, 0.7, -0.3], 0.9, C.stone, { sy: 0.9 });
      P.add(G.box(1.3, 0.06, 1.2), C.hide, { pos: [0, 1.0, 0.1], rot: [0.2, 0, 0], pattern: 'fabric', outline: 0.012 });
      for (let i = 0; i < 3; i++) bone(P, [P.r(-0.9, 0.9), 0.4, 0.8], P.r(0.4, 0.6), P.r(0, TAU));
      return;
    }
    P.add(G.box(1.2, 0.5, 1.0), C.metalDark, { pos: [0, 0.6, 0], pattern: 'panels', outline: 0.02 });
    P.add(G.box(1.3, 1.5, 0.2), C.rust, { pos: [0, 1.15, -0.45], pattern: 'rust', outline: 0.02 });
    for (const s of [-1, 1]) P.add(G.box(0.18, 0.5, 0.9), C.metalDark, { pos: [s * 0.6, 1.0, 0], outline: 0.012 });
    spikes(P, -0.6, 0.6, 1.9, -0.45, { step: 0.25, len: 0.4 });
    P.add(G.sphere(0.2, 8, 6), BONE, { pos: [0, 2.0, -0.4], scale: [1, 0.9, 1.1], outline: 0.008 });
    P.add(G.box(0.8, 1.0, 0.03), 0xb8342a, { pos: [0, 1.3, -0.57], pattern: 'fabric', outline: 0.01 });
  },

  // A crate (steel cargo for the Synths), now and then a smaller one on it.
  crate(P, o) {
    const steel = kitOf(o) === 'relay';
    box(P, [0, 0, 0], 1, { steel, ry: P.r(-0.1, 0.1) });
    if (P.chance(0.3)) box(P, [P.r(-0.1, 0.1), 0.86, P.r(-0.1, 0.1)], 0.55, { steel, ry: P.r(0, TAU) });
  },

  // A barrel: a hooped drum, its paint worn.
  barrel(P) {
    drum(P, [0, 0, 0]);
  },
};

export const PROP_KINDS = Object.keys(PROPS);

// A prop of `kind` (see the top), seeded by rng (a function giving [0, 1)).
export function prop(kind, rng, o = {}) {
  const g = new THREE.Group();
  const build = PROPS[kind];
  if (!build) return g;
  build(new Parts(rng, g), o);
  return g;
}
