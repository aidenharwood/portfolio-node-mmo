// What the public events set down (gameplay phase 6, sim/WorldEvents.js): a Hive surge's spore
// pods, rooted outside a settlement and hatching drones, and a Scav siege's engines, mortars on
// scrap carriages that shell the defences. Both are rooted in place, on the hover rig
// (anim/LegAnimator.js HoverAnimator) with no hover: the pod breathes and its spores turn; the
// engine judders and kicks back when it fires.
//   hive:sporepod · scav:siege
import { piece, G } from '../render/ModelKit.js';
import { finish } from './Characters.js';
import { hook, hoverSkeleton } from './Rigs.js';
import { HIVE_GLOW } from './Hive.js';
import { SCAV } from './Scavs.js';

const SHELL = 0x3a2c48;
const FLESH = 0x7e5a86;
const RESIN = 0x4a3a52;
const ACID = 0x9be22d;
const blob = (parent, color, pos, r, opts = {}) => piece(parent, G.sphere(1, opts.ws ?? 14, opts.hs ?? 10), color, { pos, scale: r, rot: opts.rot, glow: opts.glow, outline: opts.outline ?? 0.016 });

// A bladder of spawn the size of a cart: a swollen sac on a root-mound, ribbed with chitin and
// veined with light, a crown of spore-vents on top, and tendrils run out into the ground.
function sporepod() {
  const rig = hoverSkeleton({ bodyY: 0.05, height: 2.3, robe: [0, 0, 0], spin: [{ at: [0, 2.15, 0], rate: 0.6 }] });
  const { body, robe, spin } = rig;
  blob(body, RESIN, [0, 0.2, 0], [1.15, 0.35, 1.05], { outline: 0.02 });
  blob(body, FLESH, [0, 1.05, 0], [0.82, 0.95, 0.78], { ws: 18, hs: 14, outline: 0.02 });
  blob(body, 0x9a74a2, [0.32, 1.35, 0.42], [0.36, 0.42, 0.3]);
  blob(body, 0x9a74a2, [-0.38, 0.85, 0.36], [0.32, 0.38, 0.3]);
  // Ribs of chitin up its sides.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    hook(body, [[c * 0.75, 0.35, s * 0.7], [c * 0.9, 0.95, s * 0.84], [c * 0.62, 1.65, s * 0.58], [c * 0.2, 1.95, s * 0.2]], 0.07, 0.03, SHELL, { outline: 0.012, smooth: 6 });
  }
  // Veins of light between the ribs, and a seam glowing where it's ready to split.
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + 0.26;
    hook(body, [[Math.cos(a) * 0.7, 0.4, Math.sin(a) * 0.66], [Math.cos(a) * 0.86, 1.0, Math.sin(a) * 0.8], [Math.cos(a + 0.3) * 0.5, 1.75, Math.sin(a + 0.3) * 0.48]], 0.025, 0.008, HIVE_GLOW, { glow: true, outline: 0, smooth: 6 });
  }
  piece(body, G.box(0.06, 0.8, 0.1), ACID, { pos: [0, 1.1, 0.79], glow: true, outline: 0 });
  // The crown: vents that breathe out spores.
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    piece(body, G.cone(0.13, 0.42, 6), SHELL, { pos: [Math.cos(a) * 0.32, 1.98, Math.sin(a) * 0.3], rot: [Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5], outline: 0.01 });
    blob(body, ACID, [Math.cos(a) * 0.4, 2.18, Math.sin(a) * 0.38], [0.06, 0.06, 0.06], { glow: true, outline: 0 });
  }
  // Tendrils out into the ground.
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.4;
    const c = Math.cos(a);
    const s = Math.sin(a);
    hook(robe, [[c * 0.6, 0.3, s * 0.6], [c * 1.1, 0.12, s * 1.1], [c * 1.6, 0.02, s * 1.6], [c * 2.1, -0.05, s * 2.1]], 0.14, 0.03, i % 2 ? SHELL : RESIN, { outline: 0.012, smooth: 6 });
  }
  // Spores turning over the crown.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    piece(spin[0], G.sphere(0.07, 6, 4), i % 2 ? ACID : HIVE_GLOW, { pos: [Math.cos(a) * 0.6, Math.sin(i * 1.9) * 0.18, Math.sin(a) * 0.6], glow: true, outline: 0 });
  }
  return finish(rig);
}

const RUST = 0xa8552e;
const DARK = 0x26262c;
const GUNMETAL = 0x4a4e58;
const STEEL = 0x9aa0aa;
const HAZARD = 0xd9a227;
const TYRE = 0x1e1a18;
const PLANK = 0x6a5038;

// A Scav siege mortar: a fat barrel raised at the sky on a turntable, on a carriage of welded
// plate and scavenged truck wheels, hazard-striped, with a rack of shells, a smoking exhaust and
// the clans' glow in its sights. It faces +Z (the barrel leans forward), and idles with a judder.
function siege() {
  // (All on the body: the hover rig's robe sways, and a carriage shouldn't.)
  const rig = hoverSkeleton({ bodyY: 0.0, height: 3.2, spin: [{ at: [0, 1.55, 0], rate: 0 }] });
  const { body, spin } = rig;
  const robe = body;
  // The carriage: a deck on two axles, four wheels.
  piece(robe, G.box(2.1, 0.32, 2.8), RUST, { pos: [0, 0.78, 0], outline: 0.02 });
  piece(robe, G.box(2.2, 0.08, 2.9), DARK, { pos: [0, 0.98, 0], outline: 0.014 });
  for (const z of [-0.95, 0.95]) {
    piece(robe, G.cylZ(0.08, 0.08, 2.5, 8).rotateY(Math.PI / 2), STEEL, { pos: [0, 0.55, z], outline: 0.01 });
    for (const x of [-1.15, 1.15]) {
      const w = G.cyl(0.55, 0.55, 0.36, 14).rotateZ(Math.PI / 2);
      piece(robe, w, TYRE, { pos: [x, 0.55, z], outline: 0.02 });
      piece(robe, G.cyl(0.28, 0.28, 0.4, 10).rotateZ(Math.PI / 2), GUNMETAL, { pos: [x, 0.55, z], outline: 0.012 });
    }
  }
  // Plate skirts, hazard-striped, and outriggers dug into the ground.
  for (const x of [-1.08, 1.08]) piece(robe, G.box(0.08, 0.5, 2.6), GUNMETAL, { pos: [x, 0.9, 0], outline: 0.012 });
  for (let i = 0; i < 5; i++) piece(robe, G.box(0.1, 0.12, 0.34), i % 2 ? DARK : HAZARD, { pos: [1.13, 1.0, -1.0 + i * 0.5], outline: 0 });
  for (const [x, z] of [[-1.3, 1.5], [1.3, 1.5], [-1.3, -1.5], [1.3, -1.5]]) {
    hook(robe, [[x * 0.75, 0.8, z * 0.8], [x, 0.4, z], [x * 1.05, 0.05, z * 1.05]], 0.08, 0.06, STEEL, { outline: 0.012 });
    piece(robe, G.box(0.36, 0.06, 0.36), DARK, { pos: [x * 1.05, 0.03, z * 1.05], outline: 0.01 });
  }
  // A rack of shells at the back, and planks lashed on as a step.
  for (let i = 0; i < 4; i++) {
    piece(robe, G.cyl(0.13, 0.13, 0.62, 10), GUNMETAL, { pos: [-0.6 + i * 0.4, 1.32, -1.15], outline: 0.012 });
    piece(robe, G.cone(0.13, 0.22, 10), SCAV, { pos: [-0.6 + i * 0.4, 1.74, -1.15], glow: true, outline: 0.006 });
  }
  piece(robe, G.box(1.6, 0.06, 0.3), PLANK, { pos: [0, 0.72, -1.6], rot: [0.3, 0, 0], outline: 0.01 });
  // The turntable and the cradle the barrel sits in.
  piece(body, G.cyl(0.85, 0.95, 0.3, 16), GUNMETAL, { pos: [0, 1.15, 0.1], outline: 0.016 });
  for (const x of [-0.55, 0.55]) piece(body, G.box(0.16, 0.9, 0.9), RUST, { pos: [x, 1.6, 0.1], outline: 0.014 });
  // The barrel, leaning forward at the sky: breech, a reinforcing band, a flared muzzle.
  const tilt = -0.85;
  const barrel = spin[0];
  barrel.rotation.x = tilt;
  piece(barrel, G.cyl(0.42, 0.48, 0.6, 16), DARK, { pos: [0, -0.15, 0], outline: 0.016 });
  piece(barrel, G.cyl(0.36, 0.38, 2.0, 16), GUNMETAL, { pos: [0, 1.0, 0], outline: 0.016 });
  for (const y of [0.5, 1.3]) piece(barrel, G.cyl(0.4, 0.4, 0.12, 16), RUST, { pos: [0, y, 0], outline: 0.01 });
  piece(barrel, G.cyl(0.46, 0.38, 0.28, 16), STEEL, { pos: [0, 2.08, 0], outline: 0.014 });
  piece(barrel, G.cyl(0.3, 0.3, 0.05, 16), SCAV, { pos: [0, 2.22, 0], glow: true, outline: 0 });
  // A gunner's sight and a smoking exhaust stack.
  piece(body, G.box(0.18, 0.22, 0.3), DARK, { pos: [0.75, 1.95, 0.45], outline: 0.01 });
  piece(body, G.sphere(0.06, 8, 6), SCAV, { pos: [0.75, 1.98, 0.62], glow: true, outline: 0 });
  piece(body, G.cyl(0.11, 0.14, 1.1, 10), DARK, { pos: [-0.75, 1.8, -0.55], outline: 0.012 });
  piece(body, G.cyl(0.15, 0.11, 0.12, 10), RUST, { pos: [-0.75, 2.38, -0.55], outline: 0.01 });
  return finish(rig);
}

export const EVENT_MODELS = {
  'hive:sporepod': () => sporepod(),
  'scav:siege': () => siege(),
};
