// What the Brood Mother brings into her fight (gameplay phase 7): clutches of eggs that hatch if
// they're left, and the Brood Hearts her shield is drawn from. Both are rooted in place, on the
// hover rig (anim/LegAnimator.js HoverAnimator) with no hover: the body breathes, the motes over a
// heart turn.
//   hive:eggsac|broodheart
import { piece, G } from '../render/ModelKit.js';
import { finish } from './Characters.js';
import { hook, hoverSkeleton } from './Rigs.js';
import { HIVE_GLOW } from './Hive.js';

const SHELL = 0x3a2c48;
const FLESH = 0x8e6a8a;
const RESIN = 0x4a3a52;
const ACID = 0x9be22d;
const blob = (parent, color, pos, r, opts = {}) => piece(parent, G.sphere(1, opts.ws ?? 12, opts.hs ?? 8), color, { pos, scale: r, rot: opts.rot, glow: opts.glow, outline: opts.outline ?? 0.014 });

// A mound of resin with five eggs set in it, veined with light, one already split.
function eggsac() {
  const rig = hoverSkeleton({ bodyY: 0.05, height: 1.5, spin: [] });
  const { body } = rig;
  blob(body, RESIN, [0, 0.12, 0], [0.95, 0.28, 0.85], { outline: 0.02 });
  const eggs = [[0, 0.62, 0, 0.42], [0.42, 0.45, 0.18, 0.32], [-0.38, 0.44, 0.22, 0.34], [0.12, 0.42, -0.4, 0.3], [-0.2, 0.38, -0.34, 0.27]];
  eggs.forEach(([x, y, z, r], i) => {
    blob(body, i === 0 ? FLESH : 0x7a5a7e, [x, y, z], [r, r * 1.35, r], { rot: [x * 0.6, 0, -z * 0.6], ws: 14, hs: 10 });
    // Veins of light up each egg.
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + i;
      hook(body, [[x + Math.cos(a) * r * 0.9, y - r * 0.9, z + Math.sin(a) * r * 0.9], [x + Math.cos(a) * r * 1.02, y, z + Math.sin(a) * r * 1.02], [x + Math.cos(a + 0.4) * r * 0.6, y + r * 1.1, z + Math.sin(a + 0.4) * r * 0.6]], 0.016, 0.006, HIVE_GLOW, { glow: true, outline: 0, smooth: 5 });
    }
  });
  // The one that's splitting: a glowing seam and a claw showing.
  piece(body, G.box(0.05, 0.5, 0.08), ACID, { pos: [0, 0.66, 0.41], glow: true, outline: 0 });
  hook(body, [[0.04, 0.6, 0.38], [0.12, 0.72, 0.48], [0.08, 0.84, 0.5]], 0.03, 0.006, 0xe0d4bc, { outline: 0.008, smooth: 4 });
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    piece(body, G.cone(0.08, 0.5, 5), SHELL, { pos: [Math.cos(a) * 0.85, 0.15, Math.sin(a) * 0.75], rot: [Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9], outline: 0.01 });
  }
  return finish(rig);
}

// A heart of the nest: a great knot of flesh under chitin plates, beating, rooted in the floor by
// tendrils, with spore motes circling over it.
function broodheart() {
  const rig = hoverSkeleton({ bodyY: 1.2, height: 2.8, robe: [0, -0.7, 0], spin: [{ at: [0, 1.0, 0], rate: 0.8 }] });
  const { body, robe, spin } = rig;
  blob(body, FLESH, [0, 0, 0], [0.95, 1.05, 0.9], { ws: 18, hs: 14, outline: 0.02 });
  blob(body, 0xa87aa0, [0.25, 0.3, 0.35], [0.45, 0.5, 0.4]);
  blob(body, 0xa87aa0, [-0.35, -0.1, 0.3], [0.4, 0.45, 0.38]);
  // Plates of carapace over it.
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const y = (i % 2 ? 0.25 : -0.2);
    piece(body, G.sphere(1, 10, 6), SHELL, { pos: [Math.cos(a) * 0.82, y, Math.sin(a) * 0.78], rot: [0, -a, 0.3], scale: [0.12, 0.55, 0.42], outline: 0.014 });
  }
  // Veins of light, and a glowing core seen through a split.
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    hook(body, [[Math.cos(a) * 0.5, -0.9, Math.sin(a) * 0.5], [Math.cos(a) * 0.96, -0.2, Math.sin(a) * 0.92], [Math.cos(a + 0.5) * 0.8, 0.55, Math.sin(a + 0.5) * 0.76], [Math.cos(a + 0.9) * 0.3, 1.0, Math.sin(a + 0.9) * 0.3]], 0.03, 0.01, HIVE_GLOW, { glow: true, outline: 0, smooth: 8 });
  }
  blob(body, ACID, [0, 0.1, 0.8], [0.18, 0.4, 0.1], { glow: true, outline: 0.008 });
  // Roots into the floor.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    hook(robe, [[c * 0.3, 0.3, s * 0.3], [c * 0.7, -0.1, s * 0.7], [c * 1.1, -0.4, s * 1.1], [c * 1.5, -0.5, s * 1.5]], 0.16, 0.04, i % 2 ? SHELL : RESIN, { outline: 0.012, smooth: 6 });
  }
  // Spores turning over it.
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    piece(spin[0], G.sphere(0.07, 6, 4), i % 2 ? ACID : HIVE_GLOW, { pos: [Math.cos(a) * 0.9, Math.sin(i * 1.7) * 0.2, Math.sin(a) * 0.9], glow: true, outline: 0 });
  }
  return finish(rig);
}

export const BROOD_MODELS = {
  'hive:eggsac': () => eggsac(),
  'hive:broodheart': () => broodheart(),
};
