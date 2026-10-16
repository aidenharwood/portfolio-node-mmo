// What the public events set down (gameplay phase 6, sim/WorldEvents.js): a Hive surge's spore
// pods, rooted outside a settlement and hatching drones, and a Scav siege's engines, mortars on
// scrap carriages that shell the defences. Both are rooted in place, on the hover rig
// (anim/LegAnimator.js HoverAnimator) with no hover: the pod breathes and its spores turn; the
// engine judders and kicks back when it fires. A Synth war-walker strides on four legs (the
// quadruped rig) as its event walks it down the road, its power couplings turning round it.
//   hive:sporepod · scav:siege · synth:warwalker · synth:coupling
import { piece, G } from '../render/ModelKit.js';
import { finish } from './Characters.js';
import { hook, hoverSkeleton, legSkeleton, quadLegs, seg } from './Rigs.js';
import { HIVE_GLOW } from './Hive.js';
import { SCAV } from './Scavs.js';
import { SYNTH_GLOW } from './Synths.js';

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

const W_SHELL = 0xd8dde4;
const W_SHELL2 = 0xa8b0bc;
const W_FRAME = 0x2a2e36;
const W_JOINT = 0x4a505c;

// A Synth war-walker: a long armoured hull slung between four jointed legs, nine metres to its
// sensor crest, the Synths' cyan along every seam. A sensor head out front with a slit of an
// eye, twin gun pods under the chin, a mortar battery on its back. Its legs stride with the
// pace its event walks it at (anim/LegAnimator.js); it faces +Z.
function warwalker() {
  const cfg = {
    bodyY: 5.4, legLen: 5.2, bodyLen: 4.6, bodyWidth: 3.2, walk: 2.5, strideK: 1.6, height: 9,
    head: [0, 0.4, 2.6],
    // Knees out, as a walker's are (front knees forward, hind knees back), so long legs never cross.
    legs: quadLegs({ fx: 1.7, fz: 1.8, hx: 1.7, hz: -1.8, hipY: -0.4, upper: 2.7, lower: 2.7, footSpread: 1.3 }).map((l) => ({ ...l, bend: l.front ? 'fwd' : 'back' })),
  };
  const rig = legSkeleton(cfg);
  const { body, head, legs } = rig;
  // The hull: a keel, armour plates over it, ribbed flanks lit along their seams.
  piece(body, G.box(3.0, 1.6, 4.8), W_FRAME, { pos: [0, 0, 0], outline: 0.03 });
  piece(body, G.box(3.4, 0.5, 4.2), W_SHELL, { pos: [0, 0.95, 0], outline: 0.03 });
  piece(body, G.box(2.4, 0.4, 3.2), W_SHELL2, { pos: [0, 1.35, -0.2], outline: 0.024 });
  for (const s of [-1, 1]) {
    piece(body, G.box(0.3, 1.2, 4.4), W_SHELL2, { pos: [1.6 * s, 0.1, 0], rot: [0, 0, -0.12 * s], outline: 0.024 });
    for (let i = 0; i < 5; i++) piece(body, G.box(0.06, 0.8, 0.12), SYNTH_GLOW, { pos: [1.78 * s, 0.1, -1.6 + i * 0.8], glow: true, outline: 0 });
  }
  piece(body, G.box(2.0, 0.08, 0.1), SYNTH_GLOW, { pos: [0, 1.2, 2.1], glow: true, outline: 0 });
  // A battery of mortar tubes on its back, raised at the sky.
  for (let i = 0; i < 3; i++) piece(body, G.cyl(0.26, 0.3, 1.3, 12), W_JOINT, { pos: [-0.7 + i * 0.7, 2.0, -1.2], rot: [-0.5, 0, 0], outline: 0.016 });
  // The sensor head: a wedge with a slit of an eye, and gun pods slung under it.
  piece(head, G.box(1.8, 1.0, 1.4), W_SHELL, { pos: [0, 0, 0.3], outline: 0.026 });
  piece(head, G.box(1.4, 0.16, 0.06), SYNTH_GLOW, { pos: [0, 0.1, 1.02], glow: true, outline: 0 });
  piece(head, G.cone(0.12, 0.9, 6), W_JOINT, { pos: [0, 0.9, 0.1], outline: 0.012 });
  for (const s of [-1, 1]) {
    piece(head, G.cylZ(0.22, 0.22, 1.3, 10), W_FRAME, { pos: [0.75 * s, -0.7, 0.6], outline: 0.016 });
    piece(head, G.cylZ(0.12, 0.12, 0.06, 10), SYNTH_GLOW, { pos: [0.75 * s, -0.7, 1.26], glow: true, outline: 0 });
  }
  // Legs: a heavy thigh, a shin with a glowing knee, a splayed foot.
  for (const leg of legs) {
    piece(leg.upper, G.sphere(0.5, 12, 8), W_JOINT, { outline: 0.02 });
    seg(leg.upper, 2.7, 0.42, 0.32, W_SHELL2, { outline: 0.024 });
    piece(leg.lower, G.sphere(0.38, 10, 8), SYNTH_GLOW, { glow: true, outline: 0.012 });
    seg(leg.lower, 2.7, 0.3, 0.22, W_FRAME, { outline: 0.02 });
    piece(leg.foot, G.cyl(0.55, 0.7, 0.3, 10), W_JOINT, { pos: [0, 0.1, 0], outline: 0.02 });
  }
  return finish(rig);
}

// A war-walker's power coupling: a bright core inside two counter-turning rings, so it can be
// picked out from thirty metres off.
function coupling() {
  const rig = hoverSkeleton({ bodyY: 0, height: 1.2, spin: [{ at: [0, 0.6, 0], rate: 2.4 }, { at: [0, 0.6, 0], rate: -1.6 }] });
  const { body, spin } = rig;
  piece(body, G.octa(0.34), SYNTH_GLOW, { pos: [0, 0.6, 0], glow: true, outline: 0.01 });
  piece(body, G.cyl(0.12, 0.2, 0.3, 8), W_FRAME, { pos: [0, 0.15, 0], outline: 0.012 });
  piece(spin[0], G.torus(0.52, 0.06), W_SHELL, { rot: [Math.PI / 2, 0, 0], outline: 0.01 });
  piece(spin[1], G.torus(0.42, 0.05), W_JOINT, { rot: [0.5, 0, 0], outline: 0.01 });
  return finish(rig);
}

export const EVENT_MODELS = {
  'hive:sporepod': () => sporepod(),
  'scav:siege': () => siege(),
  'synth:warwalker': () => warwalker(),
  'synth:coupling': () => coupling(),
};
