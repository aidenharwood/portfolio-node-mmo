// The Synths: war machines nobody switched off. One design language — white shell panels over a
// graphite frame, cyan light along the seams — from the sentry drones that orbit overhead, through
// the blade-armed stalkers and mortar-backed bulwarks, to the Colossus.
//   synth:sentry|arc|stalker|bulwark|siege|colossus
import { piece, G } from '../render/ModelKit.js';
import { skeleton, finish } from './Characters.js';
import { seg, hoverSkeleton } from './Rigs.js';

export const SYNTH_GLOW = 0x3ad8ff;
const SHELL = 0xd8dde4;
const SHELL2 = 0xa8b0bc;
const FRAME = 0x2a2e36;
const JOINT = 0x4a505c;
const AMBER = 0xffc23a;

// ======================================================================== sentries (hover)
// A lens-eyed core between two shell halves, gun pods either side, a stabiliser ring and a
// thruster underneath.
function sentry(kind) {
  const arc = kind === 'arc';
  const shell = arc ? 0xe6f2fa : SHELL;
  const glow = arc ? 0xbff4ff : SYNTH_GLOW;
  const rig = hoverSkeleton({ bodyY: 0.5, height: 1.0, spin: [{ at: [0, 0, 0], rate: 3 }, { at: [0, -0.04, 0], rate: -5 }] });
  const { body, spin } = rig;
  piece(body, G.sphere(0.23, 14, 10), FRAME, { outline: 0.012 });
  piece(body, G.dome(0.3, 16, 6, 0.42), shell, { pos: [0, 0.035, 0], scale: [1, 0.85, 1.05], outline: 0.016 });
  piece(body, G.dome(0.3, 16, 6, 0.42), shell, { pos: [0, -0.035, 0], rot: [Math.PI, 0, 0], scale: [1, 0.7, 1.05], outline: 0.016 });
  piece(body, G.torus(0.25, 0.012, Math.PI * 2, 4, 24), glow, { rot: [Math.PI / 2, 0, 0], glow: true, outline: 0 });
  // The eye.
  piece(body, G.cylZ(0.11, 0.12, 0.08, 16), FRAME, { pos: [0, 0, 0.27], outline: 0.012 });
  piece(body, G.cylZ(0.075, 0.075, 0.02, 16), glow, { pos: [0, 0, 0.315], glow: true, outline: 0 });
  piece(body, G.cylZ(0.03, 0.03, 0.02, 10), 0xffffff, { pos: [0, 0, 0.322], glow: true, outline: 0 });
  // Gun pods.
  for (const s of [-1, 1]) {
    piece(body, G.box(0.1, 0.12, 0.3), shell, { pos: [0.36 * s, -0.03, 0.04], outline: 0.012 });
    piece(body, G.box(0.06, 0.03, 0.2), FRAME, { pos: [0.3 * s, -0.03, 0.04], outline: 0.008 });
    piece(body, G.cylZ(0.028, 0.028, 0.18, 8), FRAME, { pos: [0.36 * s, -0.03, 0.26], outline: 0.008 });
    piece(body, G.cylZ(0.02, 0.02, 0.02, 8), glow, { pos: [0.36 * s, -0.03, 0.355], glow: true, outline: 0 });
  }
  // Sensor fin and thruster.
  piece(body, G.box(0.02, 0.16, 0.18), shell, { pos: [0, 0.3, -0.1], rot: [-0.4, 0, 0], outline: 0.008 });
  piece(body, G.sphere(0.022, 6, 4), 0xff4a3a, { pos: [0, 0.38, -0.16], glow: true, outline: 0 });
  piece(body, G.cone(0.13, 0.16, 10), FRAME, { pos: [0, -0.27, 0], rot: [Math.PI, 0, 0], outline: 0.012 });
  piece(body, G.cone(0.08, 0.2, 10), glow, { pos: [0, -0.4, 0], rot: [Math.PI, 0, 0], glow: true, outline: 0 });
  piece(spin[0], G.torus(0.44, 0.03, Math.PI * 2, 5, 28), shell, { rot: [Math.PI / 2, 0, 0], outline: 0.01 });
  for (let i = 0; i < 3; i++) piece(spin[0], G.box(0.1, 0.05, 0.1), glow, { pos: [Math.cos(i * 2.09) * 0.44, 0, Math.sin(i * 2.09) * 0.44], glow: true, outline: 0 });
  piece(spin[1], G.torus(0.34, 0.016, Math.PI * 2, 4, 24), glow, { rot: [Math.PI / 2, 0, 0], glow: true, outline: 0 });
  if (arc) {
    // Tesla coils on top.
    for (const s of [-1, 1]) {
      piece(body, G.cyl(0.02, 0.03, 0.18, 6), FRAME, { pos: [0.12 * s, 0.32, 0.02], outline: 0.008 });
      for (let i = 0; i < 3; i++) piece(body, G.torus(0.04, 0.01, Math.PI * 2, 4, 10), glow, { pos: [0.12 * s, 0.27 + i * 0.05, 0.02], rot: [Math.PI / 2, 0, 0], glow: true, outline: 0 });
      piece(body, G.sphere(0.035, 8, 6), 0xffffff, { pos: [0.12 * s, 0.43, 0.02], glow: true, outline: 0 });
    }
  }
  return finish(rig);
}

// ======================================================================== stalker
// A slender android: faceless helmet with a light bar for eyes, a glowing core, monoblade arms.
const STALKER = {
  hipY: 1.06, hipX: 0.15, hipDrop: 0.04, thigh: 0.46, shin: 0.48, ankle: 0.08,
  spine: 0.1, chest: 0.26, neck: 0.32, skull: 0.12, shoulderX: 0.32, shoulderY: 0.24,
  upper: 0.34, fore: 0.32, grip: 0.07, height: 2.1,
};

function stalker() {
  const rig = skeleton(STALKER);
  const { hips, spine, chest, head, skull } = rig;
  const G_ = SYNTH_GLOW;
  piece(hips, G.box(0.3, 0.14, 0.2), FRAME, { outline: 0.016 });
  for (const s of [-1, 1]) piece(hips, G.box(0.06, 0.18, 0.2), SHELL, { pos: [0.17 * s, -0.04, 0], rot: [0, 0, 0.12 * s], outline: 0.012 });
  piece(hips, G.box(0.16, 0.12, 0.04), SHELL, { pos: [0, -0.06, 0.11], outline: 0.01 });
  // An exposed spine of stacked discs round a light.
  for (let i = 0; i < 3; i++) piece(spine, G.cyl(0.075, 0.075, 0.035, 10), JOINT, { pos: [0, 0.03 + i * 0.07, 0], outline: 0.01 });
  piece(spine, G.cyl(0.04, 0.04, 0.22, 8), G_, { pos: [0, 0.1, 0], glow: true, outline: 0 });
  // Chest: shell over the frame, a round core, shoulder yoke.
  piece(chest, G.sphere(1, 14, 10), FRAME, { pos: [0, 0.12, -0.02], scale: [0.2, 0.2, 0.15], outline: 0.014 });
  piece(chest, G.sphere(1, 14, 10), SHELL, { pos: [0, 0.14, 0.02], scale: [0.22, 0.19, 0.15], outline: 0.016 });
  piece(chest, G.cylZ(0.055, 0.06, 0.04, 14), FRAME, { pos: [0, 0.14, 0.16], outline: 0.008 });
  piece(chest, G.cylZ(0.04, 0.04, 0.02, 14), G_, { pos: [0, 0.14, 0.18], glow: true, outline: 0 });
  for (const s of [-1, 1]) piece(chest, G.box(0.012, 0.16, 0.02), G_, { pos: [0.12 * s, 0.08, 0.15], rot: [0, 0.4 * s, -0.25 * s], glow: true, outline: 0 });
  piece(chest, G.box(0.5, 0.06, 0.14), SHELL2, { pos: [0, 0.27, -0.02], outline: 0.012 });
  piece(chest, G.box(0.2, 0.24, 0.1), FRAME, { pos: [0, 0.12, -0.17], outline: 0.012 });
  for (const s of [-1, 1]) piece(chest, G.cyl(0.03, 0.03, 0.3, 6), JOINT, { pos: [0.07 * s, 0.25, -0.2], rot: [-0.2, 0, 0], outline: 0.008 });
  // Neck and the faceless helmet.
  piece(head, G.cyl(0.04, 0.05, 0.14, 8), JOINT, { pos: [0, 0.06, 0], outline: 0.01 });
  piece(skull, G.sphere(1, 16, 12), SHELL, { pos: [0, 0.03, 0.02], scale: [0.105, 0.13, 0.135], outline: 0.014 });
  piece(skull, G.box(0.19, 0.045, 0.1), FRAME, { pos: [0, 0.03, 0.09], outline: 0.008 });
  piece(skull, G.box(0.17, 0.014, 0.02), G_, { pos: [0, 0.032, 0.14], glow: true, outline: 0 });
  for (const s of [-1, 1]) piece(skull, G.box(0.015, 0.1, 0.16), SHELL2, { pos: [0.1 * s, 0.07, -0.06], rot: [-0.5, 0, 0.15 * s], outline: 0.008 });
  // Arms: shell over joints, and blades for hands.
  for (const [arm, s] of [[rig.armL, 1], [rig.armR, -1]]) {
    piece(arm.upper, G.sphere(0.07, 10, 8), JOINT, { outline: 0.012 });
    piece(arm.upper, G.dome(0.1, 12, 6), SHELL, { pos: [0.02 * s, 0.02, 0], rot: [0, 0, -0.5 * s], scale: [1, 0.8, 1.1], outline: 0.012 });
    seg(arm.upper, 0.3, 0.045, 0.04, FRAME, { outline: 0.012 });
    piece(arm.upper, G.capsule(0.05, 0.14, 8), SHELL, { pos: [0.012 * s, -0.17, 0.01], outline: 0.012 });
    piece(arm.fore, G.sphere(0.05, 8, 6), JOINT, { outline: 0.01 });
    piece(arm.fore, G.capsule(0.05, 0.18, 8), SHELL, { pos: [0, -0.16, 0], outline: 0.014 });
    piece(arm.fore, G.box(0.012, 0.16, 0.02), G_, { pos: [0.05 * s, -0.16, 0], glow: true, outline: 0 });
    piece(arm.hand, G.box(0.06, 0.06, 0.08), FRAME, { pos: [0, -0.02, 0], outline: 0.01 });
    const M = s > 0 ? rig.offMount : rig.weaponMount;
    const blade = G.shape([[0, -0.035], [0.62, -0.02], [0.76, 0.03], [0.6, 0.04], [0, 0.03]]);
    piece(M, G.extrude(blade, 0.014, 0.003).rotateY(-Math.PI / 2), SHELL2, { pos: [0, -0.01, -0.02], outline: 0.01 });
    piece(M, G.box(0.018, 0.008, 0.62), G_, { pos: [0, -0.046, 0.33], rot: [-0.02, 0, 0], glow: true, outline: 0 });
  }
  // Legs: shell thighs and shin guards, joints exposed, long blade-toed feet.
  rig.legs.forEach((leg, i) => {
    const s = i === 0 ? 1 : -1;
    piece(leg.thigh, G.sphere(0.075, 10, 8), JOINT, { outline: 0.012 });
    seg(leg.thigh, 0.42, 0.055, 0.045, FRAME, { outline: 0.012 });
    piece(leg.thigh, G.capsule(0.07, 0.2, 8), SHELL, { pos: [0.01 * s, -0.2, 0.02], outline: 0.014 });
    piece(leg.shin, G.sphere(0.06, 8, 6), JOINT, { outline: 0.01 });
    seg(leg.shin, 0.44, 0.045, 0.035, FRAME, { outline: 0.012 });
    piece(leg.shin, G.box(0.09, 0.3, 0.06), SHELL, { pos: [0, -0.18, 0.05], rot: [0.06, 0, 0], outline: 0.012 });
    piece(leg.shin, G.box(0.06, 0.012, 0.03), G_, { pos: [0, -0.06, 0.085], glow: true, outline: 0 });
    piece(leg.foot, G.box(0.1, 0.05, 0.26), FRAME, { pos: [0, -0.045, 0.06], outline: 0.012 });
    piece(leg.foot, G.box(0.11, 0.04, 0.12), SHELL, { pos: [0, -0.02, 0.12], rot: [0.2, 0, 0], outline: 0.01 });
    for (const x of [-0.035, 0.035]) piece(leg.foot, G.coneZ(0.02, 0.08, 4), SHELL2, { pos: [x, -0.055, 0.22], outline: 0.006 });
  });
  return finish(rig);
}

// ======================================================================== heavy frames
// Bulwarks (and the Colossus, k ≈ 1.6): a broad shell body with a sensor turret for a head, arm
// shields, a mortar on the back; shots leave from the mortar.
const BULWARK = {
  hipY: 1.1, hipX: 0.3, hipDrop: 0.05, thigh: 0.48, shin: 0.45, ankle: 0.12,
  spine: 0.14, chest: 0.42, neck: 0.62, neckZ: 0.12, skull: 0.08, shoulderX: 0.66, shoulderY: 0.46,
  upper: 0.5, fore: 0.52, grip: 0.12, height: 2.8,
};
const COLOSSUS = {
  ...BULWARK, hipY: 1.75, hipX: 0.5, thigh: 0.78, shin: 0.74, ankle: 0.18, spine: 0.22, chest: 0.7, neck: 1.0,
  shoulderX: 1.08, shoulderY: 0.76, upper: 0.82, fore: 0.85, grip: 0.2, height: 4.6,
};

function heavy(kind) {
  const boss = kind === 'colossus';
  const siege = kind === 'siege';
  const k = boss ? 1.62 : 1;
  const P = siege ? SHELL2 : SHELL;
  const trim = boss ? AMBER : siege ? AMBER : SHELL2;
  const G_ = SYNTH_GLOW;
  const rig = skeleton(boss ? COLOSSUS : BULWARK);
  const { hips, spine, chest, skull } = rig;
  // Pelvis and waist.
  piece(hips, G.box(0.66 * k, 0.28 * k, 0.46 * k), FRAME, { outline: 0.03 });
  for (const s of [-1, 1]) piece(hips, G.box(0.08 * k, 0.32 * k, 0.4 * k), P, { pos: [0.36 * k * s, -0.08 * k, 0], rot: [0, 0, 0.15 * s], outline: 0.02 });
  piece(hips, G.box(0.36 * k, 0.26 * k, 0.06 * k), P, { pos: [0, -0.12 * k, 0.24 * k], rot: [-0.1, 0, 0], outline: 0.016 });
  piece(spine, G.cyl(0.18 * k, 0.22 * k, 0.26 * k, 12), JOINT, { pos: [0, 0.1 * k, 0], outline: 0.02 });
  piece(spine, G.torus(0.2 * k, 0.025 * k, Math.PI * 2, 4, 18), G_, { pos: [0, 0.12 * k, 0], rot: [Math.PI / 2, 0, 0], glow: true, outline: 0 });
  // Body: a broad rounded shell over a frame, sensor array and core in front.
  piece(chest, G.box(0.9 * k, 0.6 * k, 0.6 * k), FRAME, { pos: [0, 0.22 * k, -0.04 * k], outline: 0.025 });
  piece(chest, G.sphere(1, 18, 12), P, { pos: [0, 0.26 * k, 0.02 * k], scale: [0.62 * k, 0.42 * k, 0.42 * k], outline: 0.035 });
  piece(chest, G.box(0.56 * k, 0.12 * k, 0.1 * k), FRAME, { pos: [0, 0.42 * k, 0.36 * k], rot: [-0.3, 0, 0], outline: 0.012 });
  for (let i = 0; i < 3; i++) piece(chest, G.cylZ(0.045 * k, 0.045 * k, 0.04, 12), G_, { pos: [(i - 1) * 0.15 * k, 0.43 * k, 0.42 * k], rot: [-0.3, 0, 0], glow: true, outline: 0 });
  piece(chest, G.cylZ(0.13 * k, 0.15 * k, 0.08, 16), FRAME, { pos: [0, 0.16 * k, 0.43 * k], outline: 0.012 });
  piece(chest, G.cylZ(0.1 * k, 0.1 * k, 0.04, 16), G_, { pos: [0, 0.16 * k, 0.47 * k], glow: true, outline: 0 });
  for (const s of [-1, 1]) piece(chest, G.box(0.04 * k, 0.3 * k, 0.04 * k), trim, { pos: [0.4 * k * s, 0.22 * k, 0.33 * k], rot: [0, 0.6 * s, 0], outline: 0 });
  // Sensor turret for a head.
  piece(skull, G.box(0.34 * k, 0.18 * k, 0.3 * k), P, { pos: [0, 0.03 * k, 0.08 * k], outline: 0.02 });
  piece(skull, G.box(0.3 * k, 0.05 * k, 0.04), FRAME, { pos: [0, 0.04 * k, 0.24 * k], outline: 0.008 });
  piece(skull, G.box(0.26 * k, 0.018 * k, 0.03), G_, { pos: [0, 0.042 * k, 0.26 * k], glow: true, outline: 0 });
  // The mortar on the back (twin on the siege model and the Colossus), with its ammunition drum.
  const tubes = siege || boss ? [-1, 1] : [1];
  for (const s of tubes) {
    const x = (tubes.length > 1 ? 0.26 * s : 0.22) * k;
    piece(chest, G.cyl(0.16 * k, 0.2 * k, 0.75 * k, 12), FRAME, { pos: [x, 0.72 * k, -0.4 * k], rot: [-0.45, 0, 0], outline: 0.022 });
    piece(chest, G.torus(0.165 * k, 0.03 * k, Math.PI * 2, 5, 16), G_, { pos: [x, 1.04 * k, -0.25 * k], rot: [Math.PI / 2 - 0.45, 0, 0], glow: true, outline: 0 });
    piece(chest, G.torus(0.2 * k, 0.03 * k, Math.PI * 2, 4, 16), trim, { pos: [x, 0.5 * k, -0.5 * k], rot: [Math.PI / 2 - 0.45, 0, 0], outline: 0.008 });
  }
  piece(chest, G.cyl(0.2 * k, 0.2 * k, 0.3 * k, 12), JOINT, { pos: [tubes.length > 1 ? 0 : -0.22 * k, 0.42 * k, -0.48 * k], rot: [0, 0, Math.PI / 2], outline: 0.016 });
  if (boss) {
    // Missile pods on the shoulders and a crown of antenna fins.
    for (const s of [-1, 1]) {
      piece(chest, G.box(0.36 * k, 0.26 * k, 0.4 * k), P, { pos: [0.52 * k * s, 0.62 * k, -0.06 * k], outline: 0.02 });
      for (let i = 0; i < 4; i++) piece(chest, G.cylZ(0.04 * k, 0.04 * k, 0.03, 8), AMBER, { pos: [(0.52 + (i % 2 - 0.5) * 0.15) * k * s, (0.62 + (Math.floor(i / 2) - 0.5) * 0.11) * k, 0.15 * k], glow: true, outline: 0 });
    }
    for (let i = 0; i < 5; i++) piece(skull, G.box(0.02 * k, (0.22 - Math.abs(i - 2) * 0.05) * k, 0.12 * k), AMBER, { pos: [(i - 2) * 0.07 * k, 0.2 * k, -0.04 * k], rot: [-0.3, 0, (i - 2) * 0.15], outline: 0.008 });
  }
  // Arms: shell pauldrons, frame upper arms, armoured forearms that double as shields, claws.
  for (const [arm, s] of [[rig.armL, 1], [rig.armR, -1]]) {
    piece(arm.upper, G.sphere(0.2 * k, 12, 10), JOINT, { outline: 0.02 });
    piece(arm.upper, G.dome(0.3 * k, 14, 7), P, { pos: [0.05 * s * k, 0.06 * k, 0], rot: [0, 0, -0.45 * s], scale: [1, 0.8, 1.1], outline: 0.025 });
    piece(arm.upper, G.box(0.04 * k, 0.04 * k, 0.26 * k), G_, { pos: [0.3 * k * s, -0.02 * k, 0], rot: [0, 0, -0.5 * s], glow: true, outline: 0 });
    seg(arm.upper, 0.46 * k, 0.13 * k, 0.12 * k, FRAME, { outline: 0.02 });
    piece(arm.fore, G.sphere(0.15 * k, 10, 8), JOINT, { outline: 0.016 });
    piece(arm.fore, G.box(0.34 * k, 0.5 * k, 0.36 * k), P, { pos: [0, -0.27 * k, 0], outline: 0.025 });
    piece(arm.fore, G.box(0.05, 0.32 * k, 0.04 * k), G_, { pos: [0.175 * k * s, -0.27 * k, 0], glow: true, outline: 0 });
    piece(arm.fore, G.box(0.04 * k, 0.36 * k, 0.05 * k), trim, { pos: [0, -0.27 * k, 0.185 * k], outline: 0 });
    piece(arm.hand, G.box(0.3 * k, 0.2 * k, 0.3 * k), FRAME, { pos: [0, -0.08 * k, 0], outline: 0.02 });
    for (let i = 0; i < 3; i++) piece(arm.hand, G.box(0.07 * k, 0.2 * k, 0.09 * k), JOINT, { pos: [(i - 1) * 0.1 * k, -0.24 * k, 0.08 * k], rot: [0.3, 0, 0], outline: 0.012 });
  }
  // Legs: shell thighs, knee guards, armoured shins, broad feet with toes.
  rig.legs.forEach((leg) => {
    piece(leg.thigh, G.sphere(0.2 * k, 10, 8), JOINT, { outline: 0.02 });
    piece(leg.thigh, G.box(0.32 * k, 0.44 * k, 0.36 * k), P, { pos: [0, -0.25 * k, 0], outline: 0.025 });
    piece(leg.shin, G.sphere(0.16 * k, 10, 8), JOINT, { outline: 0.016 });
    piece(leg.shin, G.dome(0.18 * k, 12, 6), P, { pos: [0, 0.02 * k, 0.06 * k], rot: [Math.PI / 2 - 0.2, 0, 0], outline: 0.016 });
    piece(leg.shin, G.box(0.28 * k, 0.42 * k, 0.3 * k), FRAME, { pos: [0, -0.23 * k, 0], outline: 0.02 });
    piece(leg.shin, G.box(0.24 * k, 0.3 * k, 0.06 * k), P, { pos: [0, -0.22 * k, 0.16 * k], outline: 0.014 });
    piece(leg.foot, G.box(0.38 * k, 0.14 * k, 0.5 * k), FRAME, { pos: [0, -0.06 * k, 0.08 * k], outline: 0.025 });
    for (const x of [-0.12, 0, 0.12]) piece(leg.foot, G.box(0.1 * k, 0.1 * k, 0.16 * k), P, { pos: [x * k, -0.08 * k, 0.36 * k], rot: [0.15, 0, 0], outline: 0.014 });
    piece(leg.foot, G.box(0.14 * k, 0.1 * k, 0.12 * k), P, { pos: [0, -0.08 * k, -0.2 * k], outline: 0.012 });
  });
  return finish(rig);
}

export const SYNTH_MODELS = {
  'synth:sentry': () => sentry('sentry'),
  'synth:arc': () => sentry('arc'),
  'synth:stalker': () => stalker(),
  'synth:bulwark': () => heavy('bulwark'),
  'synth:siege': () => heavy('siege'),
  'synth:colossus': () => heavy('colossus'),
};
