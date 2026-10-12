// The Wild: this world's own animals, none of them anything you'd want for a pet. Six-legged
// razorhounds with blade-finned backs, scorpion-tailed crawlers, armour-shelled thunderhorns with a
// horn like a ram-prow, and the crystal-grown Behemoth. Many-legged rigs (models/Rigs.js
// legSkeleton) run on anim/LegAnimator.js.
//   fauna:hound|rimehound|alpha|crawler|venom|thunderhorn|ironhide|behemoth
import { piece, shade, G } from '../render/ModelKit.js';
import { finish } from './Characters.js';
import { seg, hook, legSkeleton, quadLegs, hexLegs, INK, WHITE } from './Rigs.js';

export const FAUNA_GLOW = 0xffb030;

// ======================================================================== razorhounds
function hound(kind) {
  const alpha = kind === 'alpha';
  const rime = kind === 'rimehound';
  const hide = rime ? 0xa8c0d4 : alpha ? 0x2e3038 : 0x4a5468;
  const back = rime ? 0x7a98b4 : alpha ? 0x1e1e26 : 0x2e3440;
  const belly = rime ? 0xdce8f2 : alpha ? 0x4a4a54 : 0x7a8496;
  const fin = rime ? 0xd8f4ff : alpha ? 0x8a2a22 : 0xc8b89a;
  const glow = rime ? 0x7fe8ff : alpha ? 0xff4a2a : FAUNA_GLOW;
  const cfg = {
    bodyY: 0.72, legLen: 0.68, bodyLen: 1.0, bodyWidth: 0.34, walk: 2.6, strideK: 0.26, height: 1.1, jawOpen: 0.8, tailDroop: 0.3,
    chest: [0, 0.04, 0.36], neck: [0, 0.12, 0.2], head: [0, 0.08, 0.17], jaw: [0, -0.05, 0.05],
    tail: { at: [0, 0.06, -0.52], n: 4, seg: 0.15 },
    legs: hexLegs({ zs: [0.42, 0.0, -0.4], x: 0.15, hipY: -0.06, upper: 0.34, lower: 0.36, spread: 1.12 }),
  };
  const rig = legSkeleton(cfg);
  const { body, chest, neck, head, jaw } = rig;
  // A lean, deep-chested body under overlapping back plates, a ridge of blade fins.
  piece(body, G.capsuleZ(0.17, 0.6, 10), hide, { pos: [0, 0, -0.08], scale: [1, 1.05, 1], outline: 0.014 });
  piece(body, G.capsuleZ(0.12, 0.5, 8), belly, { pos: [0, -0.08, -0.04], outline: 0.01 });
  for (let i = 0; i < 4; i++) piece(body, G.dome(0.17, 10, 5, 0.5), back, { pos: [0, 0.08, 0.16 - i * 0.18], rot: [-0.25, 0, 0], scale: [1.05, 0.7, 0.75], outline: 0.012 });
  const fins = alpha ? 7 : 5;
  for (let i = 0; i < fins; i++) {
    const z = 0.3 - i * (0.75 / (fins - 1));
    const h = (alpha ? 0.26 : 0.18) * (1 - Math.abs(i - fins * 0.35) / fins);
    if (rime) piece(body, G.octa(0.06), fin, { pos: [0, 0.22 + h * 0.4, z], scale: [0.5, h * 9, 1.2], rot: [-0.5, 0, 0], glow: true, outline: 0.006 });
    else piece(body, G.cone(0.05, h, 4), fin, { pos: [0, 0.2 + h * 0.4, z], rot: [-0.6, 0, 0], scale: [0.35, 1, 1.5], outline: 0.008 });
  }
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) piece(body, G.box(0.01, 0.07, 0.03), glow, { pos: [0.165 * s, 0.0, 0.12 - i * 0.07], rot: [0, 0, -0.2 * s], glow: true, outline: 0 });
  piece(chest, G.sphere(0.23, 12, 10), hide, { pos: [0, 0.02, 0.02], scale: [1, 1.05, 1.1], outline: 0.014 });
  piece(chest, G.dome(0.22, 10, 5, 0.5), back, { pos: [0, 0.1, 0.04], rot: [-0.4, 0, 0], scale: [1.1, 0.75, 0.9], outline: 0.012 });
  if (alpha) for (let i = 0; i < 8; i++) {
    const a = -1.3 + (i / 7) * 2.6;
    piece(chest, G.cone(0.05, 0.3, 4), fin, { pos: [Math.sin(a) * 0.2, 0.2 + Math.cos(a) * 0.05, 0.02], rot: [-0.8, 0, -a * 0.7], scale: [0.4, 1, 1.4], outline: 0.008 });
  }
  piece(neck, G.cyl(0.11, 0.13, 0.24, 10), hide, { pos: [0, 0.02, 0.06], rot: [1.1, 0, 0], outline: 0.012 });
  // An eyeless, wedge-shaped head: sensory pits glowing down its sides, a split jaw full of teeth.
  piece(head, G.sphere(1, 12, 10), hide, { pos: [0, 0, 0.08], scale: [0.12, 0.1, 0.2], outline: 0.014 });
  piece(head, G.sphere(1, 10, 8), back, { pos: [0, 0.05, 0.06], scale: [0.1, 0.06, 0.17], outline: 0.01 });
  piece(head, G.cone(0.04, 0.2, 4), fin, { pos: [0, 0.1, -0.06], rot: [-1.2, 0, 0], scale: [0.4, 1, 1.4], outline: 0.008 });
  for (const s of [-1, 1]) {
    for (let i = 0; i < 3; i++) piece(head, G.sphere(0.014, 6, 4), glow, { pos: [0.085 * s, 0.025 - i * 0.012, 0.16 - i * 0.045], glow: true, outline: 0 });
    for (let i = 0; i < 3; i++) piece(head, G.cone(0.012, 0.05, 4), WHITE, { pos: [0.045 * s, -0.07, 0.24 - i * 0.04], rot: [Math.PI, 0, 0], outline: 0 });
  }
  piece(jaw, G.box(0.11, 0.04, 0.22), belly, { pos: [0, -0.02, 0.12], outline: 0.01 });
  piece(jaw, G.box(0.08, 0.01, 0.18), glow, { pos: [0, 0.004, 0.12], glow: true, outline: 0 });
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) piece(jaw, G.cone(0.012, 0.05, 4), WHITE, { pos: [0.04 * s, 0.02, 0.21 - i * 0.04], outline: 0 });
  rig.tail.forEach((b, i) => {
    const last = i === rig.tail.length - 1;
    piece(b, G.cylZ(0.06 - i * 0.012, 0.045 - i * 0.01, 0.17, 8), i % 2 ? back : hide, { pos: [0, 0, -0.08], outline: 0.01 });
    if (last) piece(b, G.coneZ(0.04, 0.22, 4), fin, { pos: [0, 0, -0.24], rot: [0, 0, 0], scale: [0.4, 1.6, 1], outline: 0.008 });
  });
  rig.legs.forEach((leg) => {
    const k = leg.cfg.front ? 1 : 1.1;
    seg(leg.upper, 0.34, 0.075 * k, 0.05, hide, { outline: 0.012 });
    seg(leg.lower, 0.36, 0.042, 0.032, back, { outline: 0.01 });
    piece(leg.lower, G.cone(0.02, 0.1, 4), fin, { pos: [0, -0.02, -0.06], rot: [-2.3, 0, 0], outline: 0.006 });
    for (const x of [-0.03, 0.03]) piece(leg.foot, G.coneZ(0.02, 0.09, 4), INK, { pos: [x, -0.03, 0.06], rot: [0.3, 0, 0], outline: 0.006 });
    piece(leg.foot, G.sphere(0.04, 8, 6), back, { pos: [0, -0.01, 0.01], scale: [1, 0.7, 1.3], outline: 0.008 });
  });
  return finish(rig);
}

// ======================================================================== crawlers
// Eight legs under a flat, plated shell; pincers; a segmented tail that curls up over the back
// to a glowing stinger.
function crawler(kind) {
  const venom = kind === 'venom';
  const shell = venom ? 0x3a4a2a : 0x2a3e44;
  const plate = venom ? 0x5a6a3a : 0x3e5a62;
  const legC = venom ? 0x24301c : 0x1e2a30;
  const glow = venom ? 0x9be22d : FAUNA_GLOW;
  const legs = [];
  const zs = [0.24, 0.08, -0.08, -0.22];
  const fz = [0.85, 0.36, -0.2, -0.64];
  zs.forEach((z, i) => {
    for (const side of [1, -1]) {
      const phase = (i % 2 === 0) === (side > 0) ? 0 : 0.5;
      legs.push({ hip: [side * 0.2, 0.0, z], upper: 0.52, lower: 0.68, foot: [side * 0.92, 0, fz[i]], side, front: i < 2, phase, bend: 'up' });
    }
  });
  const cfg = {
    bodyY: 0.5, legLen: 0.95, bodyLen: 0.8, bodyWidth: 1.6, walk: 2.8, strideK: 0.22, height: 0.9, jawOpen: 0.5, tailDroop: 0.62,
    head: [0, 0.0, 0.34], jaw: [0, -0.04, 0.1], tail: { at: [0, 0.08, -0.5], n: 5, seg: 0.15 }, legs,
  };
  const rig = legSkeleton(cfg);
  const { body, head, jaw } = rig;
  piece(body, G.sphere(0.3, 14, 10), shell, { pos: [0, 0.02, 0.06], scale: [1.05, 0.55, 1.1], outline: 0.014 });
  for (let i = 0; i < 3; i++) piece(body, G.sphere(0.27 - i * 0.03, 12, 8), plate, { pos: [0, 0.05, -0.18 - i * 0.12], scale: [1.1, 0.5, 0.65], outline: 0.012 });
  for (let i = 0; i < 5; i++) piece(body, G.sphere(0.03, 6, 4), glow, { pos: [(i % 2 ? 0.1 : -0.1) * (1 - i * 0.1), 0.17 - i * 0.01, 0.12 - i * 0.12], glow: true, outline: 0 });
  piece(head, G.sphere(0.16, 12, 8), shell, { scale: [1.15, 0.7, 1], outline: 0.012 });
  for (const [x, y] of [[0.05, 0.07], [-0.05, 0.07], [0.1, 0.05], [-0.1, 0.05], [0.03, 0.1], [-0.03, 0.1]]) piece(head, G.sphere(0.022, 6, 4), glow, { pos: [x, y, 0.13], glow: true, outline: 0 });
  // Pincers.
  for (const s of [-1, 1]) {
    hook(head, [[0.12 * s, -0.02, 0.06], [0.24 * s, 0.0, 0.2], [0.22 * s, 0.0, 0.36]], 0.05, 0.03, plate);
    hook(head, [[0.22 * s, 0.0, 0.36], [0.16 * s, 0.0, 0.48], [0.1 * s, 0.0, 0.5]], 0.03, 0.006, legC);
    hook(head, [[0.25 * s, -0.01, 0.38], [0.24 * s, -0.01, 0.48], [0.18 * s, -0.01, 0.52]], 0.022, 0.005, legC);
  }
  for (const s of [-1, 1]) hook(jaw, [[0.04 * s, 0, 0.02], [0.06 * s, -0.06, 0.08], [0.02 * s, -0.11, 0.07]], 0.02, 0.004, venom ? glow : WHITE);
  rig.tail.forEach((b, i) => {
    piece(b, G.sphere(0.075 - i * 0.008, 8, 6), i % 2 ? plate : shell, { pos: [0, 0, -0.075], scale: [1.1, 0.85, 1.25], outline: 0.01 });
    if (i === rig.tail.length - 1) {
      piece(b, G.sphere(0.07, 10, 8), glow, { pos: [0, 0, -0.17], glow: true, outline: 0.008 });
      hook(b, [[0, 0, -0.2], [0, -0.06, -0.3], [0, -0.14, -0.3]], 0.025, 0.004, legC);
    }
  });
  rig.legs.forEach((leg) => {
    piece(leg.upper, G.sphere(0.055, 8, 6), legC, { outline: 0.01 });
    seg(leg.upper, 0.52, 0.045, 0.036, legC, { outline: 0.012 });
    piece(leg.lower, G.sphere(0.045, 8, 6), plate, { outline: 0.01 });
    seg(leg.lower, 0.68, 0.034, 0.01, legC, { outline: 0.01 });
  });
  return finish(rig);
}

// ======================================================================== thunderhorns
function thunderhorn(kind) {
  const iron = kind === 'ironhide';
  const hide = iron ? 0x4a5058 : 0x5e5a62;
  const plate = iron ? 0x7a8a9a : 0xa8743a;
  const dark = iron ? 0x2e343c : 0x3a3036;
  const horn = iron ? 0xc8dcea : 0xe6d8b8;
  const glow = iron ? 0x7fe8ff : FAUNA_GLOW;
  const cfg = {
    bodyY: 0.88, legLen: 0.62, bodyLen: 1.15, bodyWidth: 0.62, walk: 2.2, strideK: 0.26, height: 1.35, jawOpen: 0.4, tailDroop: 0.4,
    chest: [0, 0.05, 0.4], neck: [0, 0.02, 0.28], head: [0, -0.02, 0.2], jaw: [0, -0.12, 0.08],
    tail: { at: [0, 0.1, -0.64], n: 2, seg: 0.13 },
    legs: quadLegs({ fx: 0.25, fz: 0.44, hx: 0.25, hz: -0.44, hipY: -0.2, upper: 0.32, lower: 0.32, footSpread: 1.0 }),
  };
  const rig = legSkeleton(cfg);
  const { body, chest, neck, head, jaw } = rig;
  piece(body, G.sphere(0.48, 14, 10), hide, { pos: [0, 0.0, -0.1], scale: [0.95, 0.85, 1.35], outline: 0.018 });
  piece(chest, G.sphere(0.46, 14, 10), hide, { pos: [0, 0.08, 0], outline: 0.018 });
  // A beetle's shell over the back: overlapping plates down a central ridge.
  for (let i = 0; i < 4; i++) {
    piece(body, G.dome(0.48 - i * 0.03, 14, 6, 0.42), plate, { pos: [0, 0.16, 0.32 - i * 0.26], rot: [-0.3, 0, 0], scale: [1.05, 0.75, 0.6], outline: 0.016 });
    piece(body, G.box(0.06, 0.06, 0.22), dark, { pos: [0, 0.52 - i * 0.03, 0.3 - i * 0.26], rot: [-0.3, 0, 0], outline: 0.008 });
  }
  if (iron) for (let i = 0; i < 4; i++) piece(body, G.octa(0.1), glow, { pos: [(i % 2 ? 0.25 : -0.25), 0.4, 0.2 - i * 0.22], scale: [0.6, 1.4, 0.6], glow: true, outline: 0.006 });
  // Vents along the flanks.
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) piece(body, G.box(0.02, 0.16, 0.04), glow, { pos: [0.45 * s, -0.02, 0.24 - i * 0.14], rot: [0, 0, -0.25 * s], glow: true, outline: 0 });
  piece(neck, G.sphere(0.3, 12, 10), hide, { pos: [0, 0, 0.04], outline: 0.014 });
  // Head: a frill of plate behind it, a blunt armoured face, a great horn sweeping up off the nose.
  piece(head, G.dome(0.46, 14, 6, 0.45), plate, { pos: [0, 0.12, -0.06], rot: [Math.PI / 2 - 0.5, 0, 0], scale: [1.1, 1, 0.5], outline: 0.016 });
  piece(head, G.box(0.42, 0.34, 0.42), hide, { pos: [0, 0, 0.14], outline: 0.018 });
  piece(head, G.box(0.36, 0.14, 0.3), plate, { pos: [0, 0.16, 0.18], rot: [0.12, 0, 0], outline: 0.012 });
  hook(head, [[0, 0.04, 0.36], [0, 0.16, 0.56], [0, 0.42, 0.66], [0, 0.66, 0.56]], 0.11, 0.02, horn, { outline: 0.014, n: 8 });
  hook(head, [[0, 0.18, 0.28], [0, 0.3, 0.36], [0, 0.36, 0.33]], 0.05, 0.01, horn, { outline: 0.01 });
  for (const s of [-1, 1]) {
    piece(head, G.sphere(0.035, 6, 4), glow, { pos: [0.18 * s, 0.06, 0.32], glow: true, outline: 0 });
    hook(jaw, [[0.12 * s, 0, 0.2], [0.18 * s, 0.06, 0.3], [0.16 * s, 0.18, 0.34]], 0.03, 0.006, horn);
  }
  piece(jaw, G.box(0.3, 0.1, 0.3), dark, { pos: [0, 0, 0.16], outline: 0.012 });
  rig.tail.forEach((b) => piece(b, G.cylZ(0.05, 0.035, 0.15, 6), dark, { pos: [0, 0, -0.07], outline: 0.008 }));
  rig.legs.forEach((leg) => {
    seg(leg.upper, 0.32, 0.13, 0.1, hide, { outline: 0.016 });
    piece(leg.upper, G.dome(0.15, 10, 5), plate, { pos: [0, 0.0, 0], scale: [1, 0.8, 1.1], outline: 0.012 });
    seg(leg.lower, 0.32, 0.085, 0.07, dark, { outline: 0.012 });
    piece(leg.foot, G.cyl(0.1, 0.12, 0.1, 8), dark, { pos: [0, -0.02, 0.02], outline: 0.01 });
    for (const x of [-0.06, 0, 0.06]) piece(leg.foot, G.coneZ(0.035, 0.08, 4), horn, { pos: [x, -0.04, 0.12], outline: 0.006 });
  });
  return finish(rig);
}

// ======================================================================== the Behemoth
// A hunched giant grown over with crystal, four-eyed, tusked twice over, clawed forefeet.
function behemoth() {
  const hide = 0x3a4252;
  const dark = 0x232832;
  const plate = 0x5a6478;
  const crystal = 0xbff4ff;
  const tusk = 0xe8dcc4;
  const glow = FAUNA_GLOW;
  const cfg = {
    bodyY: 1.35, legLen: 1.25, bodyLen: 2.0, bodyWidth: 1.2, walk: 2.4, strideK: 0.3, height: 2.6, jawOpen: 0.6, tailDroop: 0.3,
    chest: [0, 0.12, 0.7], neck: [0, 0.18, 0.45], head: [0, 0.02, 0.32], jaw: [0, -0.16, 0.12],
    tail: { at: [0, 0.2, -1.05], n: 2, seg: 0.24 },
    legs: quadLegs({ fx: 0.46, fz: 0.75, hx: 0.48, hz: -0.72, hipY: -0.15, upper: 0.62, lower: 0.62, footSpread: 1.0 }),
  };
  const rig = legSkeleton(cfg);
  const { body, chest, neck, head, jaw } = rig;
  piece(body, G.sphere(0.95, 18, 12), hide, { pos: [0, 0.05, -0.2], scale: [0.95, 0.85, 1.25], outline: 0.025 });
  piece(chest, G.sphere(0.95, 18, 12), hide, { pos: [0, 0.25, 0], scale: [1.05, 1.0, 0.95], outline: 0.025 });
  // Armour plates down the hump, crystal clusters grown through them.
  for (let i = 0; i < 4; i++) piece(body, G.dome(0.75 - i * 0.06, 14, 6, 0.4), plate, { pos: [0, 0.32, 0.5 - i * 0.42], rot: [-0.25, 0, 0], scale: [1.1, 0.75, 0.62], outline: 0.02 });
  for (let i = 0; i < 9; i++) {
    const z = 0.7 - i * 0.22;
    const x = ((i % 3) - 1) * 0.34;
    piece(body, G.octa(0.2 + (i % 2) * 0.1), crystal, { pos: [x, 0.82 - Math.abs(x) * 0.4, z], rot: [i, i * 0.7, 0.3], scale: [0.6, 1.8, 0.6], glow: true, outline: 0.016 });
  }
  piece(chest, G.dome(0.8, 14, 6, 0.4), plate, { pos: [0, 0.6, 0.0], rot: [-0.2, 0, 0], scale: [1.1, 0.8, 0.8], outline: 0.02 });
  for (const s of [-1, 1]) piece(chest, G.octa(0.26), crystal, { pos: [0.5 * s, 0.95, -0.1], rot: [0.3, 0, -0.5 * s], scale: [0.6, 1.9, 0.6], glow: true, outline: 0.016 });
  piece(neck, G.sphere(0.55, 14, 10), hide, { pos: [0, 0, 0.08], outline: 0.02 });
  // Head: broad and flat, four glowing eyes, a heavy brow plate, upper tusks curving forward.
  piece(head, G.sphere(0.5, 14, 10), hide, { scale: [1.1, 0.8, 1], outline: 0.02 });
  piece(head, G.box(0.7, 0.16, 0.42), plate, { pos: [0, 0.24, 0.14], rot: [0.15, 0, 0], outline: 0.016 });
  piece(head, G.box(0.42, 0.26, 0.4), shade(hide, 1.15), { pos: [0, -0.1, 0.4], outline: 0.016 });
  for (const s of [-1, 1]) {
    for (const [x, y] of [[0.2, 0.12], [0.32, 0.06]]) piece(head, G.sphere(0.05, 8, 6), glow, { pos: [x * s, y, 0.4], glow: true, outline: 0 });
    hook(head, [[0.24 * s, -0.12, 0.42], [0.42 * s, -0.08, 0.66], [0.4 * s, 0.14, 0.86]], 0.08, 0.015, tusk, { outline: 0.014, n: 8 });
    piece(head, G.octa(0.12), crystal, { pos: [0.34 * s, 0.4, -0.08], rot: [-0.4, 0, -0.5 * s], scale: [0.6, 1.8, 0.6], glow: true, outline: 0.01 });
  }
  piece(jaw, G.box(0.36, 0.14, 0.42), dark, { pos: [0, 0, 0.3], outline: 0.016 });
  for (const s of [-1, 1]) hook(jaw, [[0.14 * s, 0.04, 0.46], [0.2 * s, 0.14, 0.56], [0.14 * s, 0.26, 0.58]], 0.045, 0.008, tusk);
  rig.tail.forEach((b, i) => piece(b, G.sphere(0.2 - i * 0.06, 8, 6), hide, { pos: [0, 0, -0.1], scale: [1, 0.9, 1.4], outline: 0.012 }));
  rig.legs.forEach((leg) => {
    seg(leg.upper, 0.62, 0.32, 0.24, hide, { outline: 0.022 });
    piece(leg.upper, G.dome(0.34, 12, 6), plate, { scale: [1, 0.7, 1.1], outline: 0.016 });
    seg(leg.lower, 0.62, 0.22, 0.2, dark, { outline: 0.018 });
    piece(leg.foot, G.box(0.38, 0.14, 0.4), dark, { pos: [0, -0.04, 0.06], outline: 0.016 });
    if (leg.cfg.front) for (let i = 0; i < 4; i++) hook(leg.foot, [[(i - 1.5) * 0.09, -0.04, 0.2], [(i - 1.5) * 0.1, -0.06, 0.34], [(i - 1.5) * 0.1, -0.12, 0.4]], 0.04, 0.006, tusk);
  });
  return finish(rig);
}

export const FAUNA_MODELS = {
  'fauna:hound': () => hound('hound'),
  'fauna:rimehound': () => hound('rimehound'),
  'fauna:alpha': () => hound('alpha'),
  'fauna:crawler': () => crawler('crawler'),
  'fauna:venom': () => crawler('venom'),
  'fauna:thunderhorn': () => thunderhorn('thunderhorn'),
  'fauna:ironhide': () => thunderhorn('ironhide'),
  'fauna:behemoth': () => behemoth(),
};
