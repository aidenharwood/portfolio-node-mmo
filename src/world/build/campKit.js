// The camp kit: how each piece of a camp's layout (world/campLayout.js) is built, for the screen
// and the server's headless world alike (both build the same colliders). The pieces themselves
// are the scenery kit's camp props (world/scenery/props.js): seeded, made of components, styled
// by whose camp it is.
//   buildCampPieces(world, camp, layout)  every piece and spawner, in one baked group
//   PIECE_BUILDERS[kind](world, g, camp, p, at)  one piece: `g` the camp's group (its origin at the
//     camp's middle, on the ground), `p` the piece in camp-local metres, `at(p)` a group stood at it
//   FORT_LOOK[race]  what a stronghold's walls and towers are made of, by race
// Every solid piece gets a collider of its layout footprint.
import * as THREE from 'three';
import { flatten } from '../../render/ModelKit.js';
import { mulberry32 } from '../../core/rng.js';
import { prop, PROP_KINDS } from '../scenery/props.js';

export const FORT_LOOK = {
  scav: { surface: 'rust' },
  hive: { surface: 'chitin' },
  synth: { surface: 'panels' },
  fauna: { surface: 'rock' },
};

// What each solid piece's collider is made of (footstep sounds, hit sparks).
const SURFACE = {
  furnace: 'panels', pylon: 'panels', overhang: 'rock', stakes: 'corrugated', scrapwall: 'rust', boulder: 'rock',
  mound: 'resin', fence: 'panels', mast: 'panels', heap: 'rust', suitrack: 'rust', eggs: 'chitin', spire: 'chitin',
  pod: 'panels', nest: 'rock', gunnest: 'rust', spitspire: 'chitin', turret: 'panels', throne: 'stone',
};
const lookOf = (camp) => FORT_LOOK[camp.race] ?? FORT_LOOK.scav;
// A piece's own stream: the same prop for it every time the camp is built, on any machine.
const seedOf = (camp, p) => ((camp.seed ?? 1) ^ Math.imul(Math.round(p.x * 16) + 7919, 73856093) ^ Math.imul(Math.round(p.z * 16) + 104729, 19349663)) >>> 0;

// One prop stood at a piece; a fence piece is two panels side by side (its footprint is twice a
// panel's), and a fire, a furnace or a node gets its flame.
function place(w, camp, p, at) {
  const o = at(p);
  const rng = mulberry32(seedOf(camp, p));
  const style = { kit: camp.style === 'fort' ? undefined : camp.style, race: camp.race, s: p.s };
  for (const dx of p.kind === 'fence' ? [-0.52, 0.52] : [0]) {
    const m = prop(p.kind, rng, style);
    m.position.x = dx;
    o.add(m);
    const f = m.userData.flame;
    if (f) {
      // (Flames flicker, so they stand apart from the baked camp.)
      const a = w.anchor(camp.x + p.x, camp.z + p.z);
      const flame = new THREE.Group();
      flame.position.y = f.y;
      a.add(flame);
      (w.own?.group ?? w.root).add(a);
      w.flame(flame, seedOf(camp, p), null, 0, f.colors, f.size);
    }
  }
  return o;
}

export const PIECE_BUILDERS = Object.fromEntries(PROP_KINDS.map((k) => [k, (w, g, camp, p, at) => place(w, camp, p, at)]));

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
  // (The server needs only what blocks: its colliders come from the layout's footprints.)
  const draw = !w.headless;
  for (const p of layout.pieces) {
    if (draw) PIECE_BUILDERS[p.kind]?.(w, g, camp, p, at);
    if (p.r > 0) {
      const surface = p.kind === 'wallseg' || p.kind === 'tower' ? lookOf(camp).surface : SURFACE[p.kind] ?? 'stone';
      w.addCollider(camp.x + p.x, camp.z + p.z, p.r, p.h, undefined, surface);
    }
  }
  if (draw) for (const sp of layout.spawners) PIECE_BUILDERS[sp.kind]?.(w, g, camp, { ...sp, rot: Math.atan2(sp.x, sp.z) }, at);
  flatten(g);
  w.finish(g);
  return g;
}
