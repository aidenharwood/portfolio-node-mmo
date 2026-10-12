// The Hive: alien insectoids, grown rather than built. Hunched bipeds in violet-black carapace
// over mauve flesh — an ant's narrow waist and segmented abdomen, a long head with compound eyes,
// mandibles and antennae — drones with mantis scythes, spitters with a living cannon for a
// forearm, shielded praetorians, the egg-heavy queen; and the floating psions, long-skulled and
// veined with light.
//   hive:drone|bloater|spitter|lancer|praetorian|champion|queen|psion|cryo
import * as THREE from 'three';
import { piece, G } from '../render/ModelKit.js';
import { skeleton, bone, finish } from './Characters.js';
import { hook, hoverSkeleton, INK } from './Rigs.js';

export const HIVE_GLOW = 0xc46aff;
const ACID = 0x9be22d;

// Bug proportions: long-shanked, narrow-waisted, head low and forward. Hips 1.02, shoulders
// 1.56, elbows 1.2, wrists 0.82, knees 0.5.
const HIVE = {
  hipY: 1.02, hipX: 0.13, hipDrop: 0.04, thigh: 0.44, shin: 0.46, ankle: 0.08,
  spine: 0.1, chest: 0.24, neck: 0.28, neckZ: 0.08, skull: 0.1, shoulderX: 0.27, shoulderY: 0.2,
  upper: 0.36, fore: 0.38, grip: 0.07, height: 2.0,
};

const PALETTES = {
  drone: { shell: 0x3a2c48, plate: 0x5a4672, flesh: 0x8a6a7e, blade: 0xd8ccb8, glow: HIVE_GLOW },
  bloater: { shell: 0x3a3442, plate: 0x5a5466, flesh: 0x7e8a5e, blade: 0xd8ccb8, glow: ACID },
  spitter: { shell: 0x2e3440, plate: 0x4a5a5e, flesh: 0x8a7a6a, blade: 0xd8ccb8, glow: ACID },
  lancer: { shell: 0x2a2e2a, plate: 0x4e5a46, flesh: 0x8a7e66, blade: 0xe6dcc0, glow: ACID },
  praetorian: { shell: 0x2e2238, plate: 0x4e3a66, flesh: 0x7a5a72, blade: 0xe0d4bc, glow: HIVE_GLOW },
  champion: { shell: 0x3a1a2c, plate: 0x6a2a44, flesh: 0x8a5a6a, blade: 0xe8c070, glow: 0xff5ad8 },
  queen: { shell: 0x241a30, plate: 0x4a3466, flesh: 0x8e6a8a, blade: 0xe8dcc4, glow: HIVE_GLOW },
};

// A group under a bone or mount (shields), baked with it.
function group(parent, pos = [0, 0, 0], rot = [0, 0, 0]) {
  const g = new THREE.Group();
  g.position.fromArray(pos);
  g.rotation.set(rot[0], rot[1], rot[2]);
  parent.add(g);
  return g;
}

// An ellipsoid: the carapace segments everything here is made of.
const blob = (parent, color, pos, r, opts = {}) => piece(parent, G.sphere(1, opts.ws ?? 12, opts.hs ?? 8), color, { pos, scale: r, rot: opts.rot, glow: opts.glow, outline: opts.outline ?? 0.012 });

// ---------------------------------------------------------------- the shared body
// Pelvis and a segmented abdomen behind it, a narrow waist, an armoured thorax with plates (and
// wing-cases) down the back, a long head with compound eyes, mandibles and antennae; limbs of
// tapering chitin segments with spurs, ending in hooked feet and bare wrists (each caste arms
// them). `k` thickens everything (praetorians, the queen); `gaster` scales the abdomen (0: none).
function bugBody(rig, C, { k = 1, spines = 4, wings = true, crest = 0, antennae = true, gaster = 1 } = {}) {
  const { hips, spine, chest, head, skull } = rig;
  blob(hips, C.shell, [0, -0.02, 0], [0.15 * k, 0.11 * k, 0.13 * k], { outline: 0.014 });
  if (gaster) {
    const g = gaster;
    [[0.02, -0.16, 0.12, 0.1, 0.12], [-0.02, -0.32, 0.145, 0.125, 0.15], [-0.08, -0.48, 0.115, 0.1, 0.12]].forEach(([y, z, rx, ry, rz], i) => {
      blob(hips, i === 1 ? C.plate : C.shell, [0, y * g, z * g], [rx * k * g, ry * k * g, rz * k * g], { outline: 0.014 });
    });
    for (const [y, z, r] of [[0.0, -0.24, 0.11], [-0.05, -0.4, 0.11]]) {
      piece(hips, G.torus(r * k * g, 0.012, Math.PI * 2, 4, 14), C.glow, { pos: [0, y * g, z * g], rot: [0.3, 0, 0], scale: [1, 0.85, 1], glow: true, outline: 0 });
    }
    hook(hips, [[0, -0.12 * g, -0.56 * g], [0, -0.2 * g, -0.62 * g], [0, -0.3 * g, -0.6 * g]], 0.03 * k, 0.005, C.blade);
  }
  // The waist.
  blob(spine, C.flesh, [0, 0.12, 0], [0.065 * k, 0.15, 0.06 * k]);
  blob(spine, C.shell, [0, 0.16, -0.03], [0.07 * k, 0.07, 0.05 * k], { outline: 0.01 });
  // Thorax: a dark shell over a fleshy underside, plates down the back, spurred shoulders.
  blob(chest, C.shell, [0, 0.1, -0.01], [0.19 * k, 0.17 * k, 0.17 * k], { ws: 14, hs: 10, outline: 0.016 });
  blob(chest, C.flesh, [0, 0.02, 0.07 * k], [0.12 * k, 0.12 * k, 0.1 * k]);
  for (let i = 0; i < 3; i++) {
    piece(chest, G.dome(0.17 * k - i * 0.02, 10, 5, 0.5), C.plate, { pos: [0, 0.22 - i * 0.1, -0.1 * k], rot: [-Math.PI / 2 + 0.35, 0, 0], scale: [1.15, 1, 0.55], outline: 0.012 });
  }
  for (let i = 0; i < spines; i++) piece(chest, G.cone(0.03 * k, (0.16 - i * 0.025) * k, 4), C.blade, { pos: [0, 0.3 - i * 0.1, -0.18 * k], rot: [-1.0, 0, 0], outline: 0.008 });
  for (const s of [-1, 1]) piece(chest, G.cone(0.025 * k, 0.12 * k, 4), C.blade, { pos: [0.2 * s * k, 0.2, -0.04], rot: [0, 0, -1.1 * s], outline: 0.008 });
  if (wings) for (const s of [-1, 1]) blob(chest, C.plate, [0.1 * s * k, 0.02, -0.2 * k], [0.09 * k, 0.32 * k, 0.035], { rot: [0.25, 0, 0.22 * s] });
  // Neck and head: long and low, compound eyes, mandibles, a swept crest, antennae.
  blob(head, C.flesh, [0, 0.03, 0.0], [0.055 * k, 0.09, 0.06 * k], { rot: [0.5, 0, 0], outline: 0.01 });
  blob(skull, C.shell, [0, 0.01, 0.06], [0.1 * k, 0.085 * k, 0.19 * k], { ws: 14, hs: 10, outline: 0.014 });
  blob(skull, C.plate, [0, 0.05 * k, 0.02], [0.075 * k, 0.06 * k, 0.15 * k], { outline: 0.01 });
  hook(skull, [[0, 0.06 * k, -0.04], [0, 0.1 * k, -0.16 * k], [0, 0.1 * k + crest * 0.5, -0.3 * k - crest]], 0.05 * k, 0.01, C.plate);
  for (const s of [-1, 1]) {
    blob(skull, C.glow, [0.075 * s * k, 0.03 * k, 0.14 * k], [0.03 * k, 0.04 * k, 0.055 * k], { rot: [0, 0.35 * s, 0], glow: true, outline: 0.008 });
    hook(skull, [[0.04 * s * k, -0.04, 0.2 * k], [0.065 * s * k, -0.07, 0.27 * k], [0.02 * s * k, -0.09, 0.32 * k]], 0.018 * k, 0.004, C.blade);
    if (antennae) hook(skull, [[0.03 * s * k, 0.06 * k, 0.19 * k], [0.07 * s * k, 0.2 * k, 0.24 * k], [0.13 * s * k, 0.33 * k, 0.14 * k], [0.16 * s * k, 0.37 * k, 0.0]], 0.011, 0.003, C.shell, { outline: 0.006 });
  }
  piece(skull, G.box(0.06 * k, 0.012, 0.02), C.glow, { pos: [0, -0.05, 0.23 * k], glow: true, outline: 0 });
  // Arms to the wrist.
  for (const [arm, s] of [[rig.armL, 1], [rig.armR, -1]]) {
    blob(arm.upper, C.shell, [0, 0, 0], [0.065 * k, 0.065 * k, 0.065 * k], { outline: 0.01 });
    blob(arm.upper, C.shell, [0, -0.17, 0], [0.048 * k, 0.18, 0.055 * k]);
    blob(arm.upper, C.plate, [0.022 * s, -0.12, 0.0], [0.04 * k, 0.12, 0.05 * k], { outline: 0.01 });
    blob(arm.fore, C.plate, [0, 0, 0], [0.045 * k, 0.045 * k, 0.045 * k], { outline: 0.01 });
    piece(arm.fore, G.cone(0.025 * k, 0.16 * k, 4), C.blade, { pos: [0, 0.02, -0.08 * k], rot: [-2.2, 0, 0], outline: 0.008 });
    blob(arm.fore, C.plate, [0, -0.19, 0.0], [0.052 * k, 0.2, 0.062 * k]);
    for (let i = 0; i < 2; i++) piece(arm.fore, G.cone(0.016 * k, 0.07 * k, 4), C.blade, { pos: [0, -0.1 - i * 0.12, -0.055 * k], rot: [-2.0, 0, 0], outline: 0.006 });
    blob(arm.hand, C.shell, [0, 0, 0], [0.04 * k, 0.04 * k, 0.04 * k], { outline: 0.01 });
  }
  // Legs: armoured thighs, a spur behind each knee, three hooked toes and a heel claw.
  rig.legs.forEach((leg) => {
    blob(leg.thigh, C.shell, [0, 0, 0], [0.075 * k, 0.075 * k, 0.075 * k], { outline: 0.012 });
    blob(leg.thigh, C.shell, [0, -0.21, 0.01], [0.075 * k, 0.23, 0.085 * k], { outline: 0.014 });
    blob(leg.thigh, C.plate, [0, -0.16, 0.045 * k], [0.06 * k, 0.15, 0.05 * k], { outline: 0.01 });
    blob(leg.shin, C.plate, [0, 0, 0], [0.055 * k, 0.055 * k, 0.055 * k], { outline: 0.01 });
    piece(leg.shin, G.cone(0.03 * k, 0.18 * k, 4), C.blade, { pos: [0, -0.02, -0.1 * k], rot: [-1.9, 0, 0], outline: 0.008 });
    blob(leg.shin, C.plate, [0, -0.23, 0.0], [0.042 * k, 0.24, 0.05 * k]);
    for (const x of [-0.045, 0, 0.045]) hook(leg.foot, [[x * k, -0.02, 0.0], [x * 1.3 * k, -0.05, 0.1 * k], [x * 1.4 * k, -0.08, 0.17 * k]], 0.022 * k, 0.006, x ? C.shell : C.blade);
    hook(leg.foot, [[0, -0.02, -0.01], [0, -0.06, -0.09 * k]], 0.02 * k, 0.006, C.blade);
  });
}

// A mantis scythe from a wrist mount (+Z out of the wrist, curving toward -Y: down when the
// forearm points forward).
function scythe(M, color, { len = 0.6, r = 0.032, edge = null } = {}) {
  hook(M, [[0, 0.0, -0.04], [0, 0.03, len * 0.35], [0, -0.04, len * 0.75], [0, -0.17, len]], r, 0.004, color, { outline: 0.01 });
  if (edge) piece(M, G.box(0.008, 0.008, len * 0.6), edge, { pos: [0, -0.018, len * 0.48], rot: [0.12, 0, 0], glow: true, outline: 0 });
}

// ---------------------------------------------------------------- castes
function drone(kind) {
  const C = PALETTES[kind];
  const rig = skeleton(HIVE);
  const bloat = kind === 'bloater';
  bugBody(rig, C, { spines: bloat ? 2 : 4, wings: !bloat, gaster: bloat ? 0 : 1 });
  scythe(rig.weaponMount, C.blade, { len: bloat ? 0.42 : 0.6 });
  scythe(rig.offMount, C.blade, { len: bloat ? 0.42 : 0.6 });
  if (bloat) {
    // The abdomen swollen into a veined, glowing sac of acid: it bursts when the bloater dies.
    const { hips } = rig;
    blob(hips, C.flesh, [0, -0.02, -0.36], [0.34, 0.31, 0.4], { ws: 16, hs: 12, outline: 0.016 });
    blob(hips, C.shell, [0, 0.12, -0.12], [0.2, 0.12, 0.16], { outline: 0.012 });
    for (let i = 0; i < 10; i++) {
      const a = i * 0.83;
      const y = -0.02 + Math.sin(a * 1.7) * 0.2;
      const r = 0.045 + (i % 3) * 0.012;
      const sx = Math.cos(a);
      piece(hips, G.sphere(r, 8, 6), ACID, { pos: [sx * 0.3, y, -0.36 - Math.sin(a) * 0.3], glow: true, outline: 0.006 });
    }
    for (const s of [-1, 1]) hook(hips, [[0.16 * s, 0.18, -0.14], [0.32 * s, 0.08, -0.34], [0.28 * s, -0.14, -0.56], [0.1 * s, -0.28, -0.66]], 0.014, 0.01, ACID, { glow: true, outline: 0 });
    hook(hips, [[0, 0.24, -0.3], [0, 0.22, -0.58], [0, 0.02, -0.76]], 0.014, 0.01, ACID, { glow: true, outline: 0 });
  }
  return finish(rig);
}

function spitter(kind) {
  const C = PALETTES[kind];
  const lancer = kind === 'lancer';
  const rig = skeleton(HIVE);
  bugBody(rig, C, { spines: lancer ? 0 : 3, crest: lancer ? 0.06 : 0 });
  const { chest, skull } = rig;
  // A throat sac that glows as it fills.
  blob(skull, C.glow, [0, -0.07, 0.1], [0.05, 0.04, 0.065], { glow: true, outline: 0.008 });
  // Acid sacs on the back (the lancer carries a bundle of spines instead).
  if (lancer) {
    for (let i = 0; i < 7; i++) {
      const x = (i - 3) * 0.045;
      piece(chest, G.cone(0.016, 0.5 - Math.abs(i - 3) * 0.05, 4), C.blade, { pos: [x, 0.36, -0.24], rot: [-0.45, 0, -x * 1.5], outline: 0.006 });
    }
  } else {
    for (const s of [-1, 1]) blob(chest, C.glow, [0.11 * s, 0.14, -0.25], [0.1, 0.12, 0.1], { glow: true, outline: 0.01 });
  }
  // The weapon arm is a living cannon: a ridged, fleshy barrel with a glowing maw, an acid
  // bladder swelling along it.
  const W = rig.weaponMount;
  const len = lancer ? 0.62 : 0.4;
  piece(W, G.cylZ(lancer ? 0.04 : 0.055, lancer ? 0.05 : 0.075, len, 10), C.flesh, { pos: [0, 0.02, len / 2 - 0.05], outline: 0.012 });
  for (let i = 0; i < (lancer ? 5 : 3); i++) piece(W, G.torus(lancer ? 0.05 : 0.07, 0.016, Math.PI * 2, 4, 10), C.plate, { pos: [0, 0.02, 0.02 + i * 0.11], outline: 0.008 });
  piece(W, G.torus(lancer ? 0.04 : 0.055, 0.014, Math.PI * 2, 4, 10), C.glow, { pos: [0, 0.02, len - 0.05], glow: true, outline: 0 });
  blob(W, C.glow, [0, 0.08, 0.1], [0.06, 0.05, 0.09], { glow: true, outline: 0.008 });
  if (lancer) {
    // The next spine, shown loaded while it draws a bead.
    const shot = bone(W, 'arrow', [0, 0.02, len - 0.12]);
    piece(shot, G.coneZ(0.02, 0.3, 4), C.blade, { pos: [0, 0, 0.1], outline: 0.006 });
    rig.arrow = shot;
  }
  scythe(rig.offMount, C.blade, { len: 0.36, r: 0.024 });
  finish(rig);
  if (rig.arrow) rig.arrow.scale.setScalar(1e-4);
  return rig;
}

const PRAETORIAN = { ...HIVE, hipY: 1.08, thigh: 0.47, shin: 0.49, spine: 0.11, chest: 0.27, shoulderX: 0.32, shoulderY: 0.22, upper: 0.38, fore: 0.37, height: 2.2 };

function praetorian(kind) {
  const C = PALETTES[kind];
  const champ = kind === 'champion';
  const rig = skeleton(PRAETORIAN);
  bugBody(rig, C, { k: 1.25, spines: 5, crest: 0.12, antennae: false, gaster: 0.8 });
  const { chest, skull } = rig;
  // A war crest: a flat fan of chitin swept back over the head, its edge glowing.
  const fan = G.shape([[0, 0], [0.06, 0.16], [0.2, 0.3], [0.38, 0.32], [0.46, 0.2], [0.36, 0.06], [0.16, -0.04]]);
  piece(skull, G.extrude(fan, 0.025, 0.006).rotateY(Math.PI / 2).scale(1, champ ? 1.3 : 1, champ ? 1.2 : 1), C.plate, { pos: [0, 0.06, 0.06], outline: 0.012 });
  hook(skull, champ ? [[0, 0.3, -0.02], [0, 0.46, -0.2], [0, 0.4, -0.44]] : [[0, 0.24, -0.02], [0, 0.37, -0.18], [0, 0.32, -0.38]], 0.01, 0.01, C.glow, { glow: true, outline: 0 });
  // Heavy shoulder plates with spikes.
  for (const [arm, s] of [[rig.armL, 1], [rig.armR, -1]]) {
    piece(arm.upper, G.dome(0.15, 12, 6), C.plate, { pos: [0.03 * s, 0.03, 0], rot: [0, 0, -0.5 * s], scale: [1, 0.8, 1.15], outline: 0.014 });
    for (let i = 0; i < 3; i++) piece(arm.upper, G.cone(0.024, 0.14 - i * 0.02, 4), C.blade, { pos: [(0.08 + i * 0.03) * s, 0.1 - i * 0.03, -0.06 + i * 0.06], rot: [0, 0, -0.6 * s], outline: 0.008 });
  }
  blob(chest, C.glow, [0, 0.1, 0.17], [0.07, 0.11, 0.04], { glow: true, outline: 0.008 });
  // Blade arm: a long sword of bone with a glowing edge.
  const W = rig.weaponMount;
  hook(W, [[0, 0, -0.04], [0, 0.02, 0.4], [0, 0.0, 0.8], [0, -0.06, 1.0]], 0.045, 0.006, C.blade, { outline: 0.012 });
  piece(W, G.box(0.008, 0.01, 0.7), C.glow, { pos: [0, -0.03, 0.5], glow: true, outline: 0 });
  // Shield arm: a curved carapace plate grown on the off forearm, ridged, facing out of the
  // thumb (forward when guarding).
  const sh = group(rig.offMount, [0, 0.06, 0.02], [-Math.PI / 2, 0, 0]);
  blob(sh, C.plate, [0, 0.12, 0.06], [0.3, 0.46, 0.08], { ws: 14, hs: 10, outline: 0.018 });
  blob(sh, C.shell, [0, 0.12, 0.1], [0.2, 0.34, 0.06], { outline: 0.01 });
  for (let i = 0; i < 3; i++) piece(sh, G.cone(0.03, 0.12, 4), C.blade, { pos: [(i - 1) * 0.12, 0.56, 0.06], outline: 0.008 });
  piece(sh, G.sphere(0.04, 8, 6), C.glow, { pos: [0, 0.12, 0.155], glow: true, outline: 0.006 });
  return finish(rig);
}

const QUEEN = { ...HIVE, hipY: 1.14, thigh: 0.5, shin: 0.52, spine: 0.12, chest: 0.3, neck: 0.32, neckZ: 0.1, shoulderX: 0.34, shoulderY: 0.22, upper: 0.44, fore: 0.44, grip: 0.08, height: 2.45 };

function queen() {
  const C = PALETTES.queen;
  const rig = skeleton(QUEEN);
  bugBody(rig, C, { k: 1.3, spines: 0, wings: false, crest: 0.1, antennae: false, gaster: 0 });
  const { hips, chest, skull } = rig;
  // The crown: a great fan of chitin behind the head, spined along its rim, veined with light.
  const fan = G.shape([[0, 0], [0.05, 0.28], [0.22, 0.52], [0.48, 0.64], [0.7, 0.52], [0.74, 0.28], [0.56, 0.06], [0.26, -0.06]]);
  piece(skull, G.extrude(fan, 0.03, 0.008).rotateY(Math.PI / 2), C.plate, { pos: [0, 0.08, 0.04], outline: 0.014 });
  const rim = [[0.05, 0.28], [0.22, 0.52], [0.48, 0.64], [0.7, 0.52], [0.74, 0.28]];
  for (const [b, y] of rim) piece(skull, G.cone(0.03, 0.24, 4), C.blade, { pos: [0, 0.08 + y + 0.08, 0.04 - b - 0.03], rot: [-0.4 - b * 1.6, 0, 0], outline: 0.008 });
  hook(skull, [[0, 0.12, -0.02], [0, 0.44, -0.2], [0, 0.6, -0.48], [0, 0.42, -0.7]], 0.012, 0.012, C.glow, { glow: true, outline: 0 });
  // The egg-heavy abdomen trailing from the hips, ringed and glowing between the segments.
  const ab = [[0, -0.02, -0.3, 0.24], [0, -0.1, -0.62, 0.3], [0, -0.22, -0.96, 0.34], [0, -0.36, -1.28, 0.26]];
  ab.forEach(([x, y, z, r], i) => {
    blob(hips, i % 2 ? C.shell : C.plate, [x, y, z], [r, r * 0.85, r * 1.1], { ws: 14, hs: 10, outline: 0.016 });
    piece(hips, G.torus(r * 0.86, 0.02, Math.PI * 2, 4, 16), C.glow, { pos: [x, y, z + r * 0.75], glow: true, outline: 0 });
  });
  // A second, smaller pair of arms folded at the chest.
  for (const s of [-1, 1]) {
    hook(chest, [[0.18 * s, 0.05, 0.12], [0.26 * s, -0.12, 0.26], [0.12 * s, -0.08, 0.36]], 0.035, 0.022, C.shell);
    hook(chest, [[0.12 * s, -0.08, 0.36], [0.06 * s, -0.2, 0.42]], 0.018, 0.004, C.blade);
  }
  blob(chest, C.glow, [0, 0.14, 0.22], [0.09, 0.13, 0.05], { glow: true, outline: 0.008 });
  scythe(rig.weaponMount, C.blade, { len: 0.95, r: 0.05, edge: C.glow });
  scythe(rig.offMount, C.blade, { len: 0.95, r: 0.05, edge: C.glow });
  return finish(rig);
}

// ---------------------------------------------------------------- psions (hover)
// A frail body under a long skull swept back and veined with light, a third eye burning in the
// brow, huge black eyes, three-fingered hands raised to cast, a halo of shards turning above, and
// curling tendrils trailing where legs would be.
function psion(kind) {
  const cryo = kind === 'cryo';
  const shell = cryo ? 0x8aa8c4 : 0x3a2c48;
  const flesh = cryo ? 0xc8dcea : 0x8a6a7e;
  const glow = cryo ? 0xbff4ff : HIVE_GLOW;
  const rig = hoverSkeleton({ bodyY: 1.3, height: 2.0, arms: { x: 0.19, y: 0.12, z: 0.04, upper: 0.28, fore: 0.28 }, robe: [0, -0.18, 0], spin: [{ at: [0, 0.94, -0.16], rate: 1.3 }] });
  const { body, arms, robe, spin } = rig;
  blob(body, shell, [0, 0.05, 0], [0.16, 0.2, 0.13], { outline: 0.014 });
  blob(body, flesh, [0, 0.0, 0.07], [0.09, 0.14, 0.06]);
  for (let i = 0; i < 3; i++) piece(body, G.torus(0.11 - i * 0.015, 0.014, Math.PI * 2, 4, 12), shell, { pos: [0, -0.14 - i * 0.06, 0], rot: [Math.PI / 2, 0, 0], outline: 0.008 });
  for (const s of [-1, 1]) piece(body, G.cone(0.03, 0.14, 4), shell, { pos: [0.15 * s, 0.2, -0.02], rot: [0, 0, -1.2 * s], outline: 0.008 });
  blob(body, flesh, [0, 0.27, 0.0], [0.05, 0.08, 0.05], { outline: 0.01 });
  // Face: small and smooth, huge black eyes.
  blob(body, flesh, [0, 0.4, 0.06], [0.085, 0.1, 0.08], { outline: 0.012 });
  for (const s of [-1, 1]) {
    piece(body, G.sphere(0.035, 10, 8), INK, { pos: [0.04 * s, 0.415, 0.125], rot: [0, 0, 0.5 * s], scale: [1.3, 0.75, 0.5], glow: true, outline: 0 });
    piece(body, G.sphere(0.008, 6, 4), glow, { pos: [0.045 * s, 0.42, 0.142], glow: true, outline: 0 });
  }
  // The skull: long, swept back and up, a third eye in the brow, veins of light along it.
  blob(body, shell, [0, 0.55, -0.1], [0.13, 0.14, 0.27], { rot: [0.45, 0, 0], ws: 16, hs: 12, outline: 0.014 });
  blob(body, shell, [0, 0.72, -0.36], [0.075, 0.08, 0.17], { rot: [0.75, 0, 0], outline: 0.012 });
  blob(body, shell, [0, 0.47, 0.03], [0.1, 0.085, 0.1], { outline: 0.012 });
  blob(body, glow, [0, 0.5, 0.13], [0.022, 0.034, 0.012], { rot: [-0.3, 0, 0], glow: true, outline: 0.006 });
  for (const s of [-1, 0, 1]) {
    const x = s * 0.06;
    const dy = s ? -0.016 : 0;
    hook(body, [[x * 0.5, 0.55 + dy, 0.12], [x, 0.69 + dy, -0.02], [x, 0.74 + dy, -0.19], [x * 0.7, 0.8 + dy, -0.36]], 0.013, 0.006, glow, { glow: true, outline: 0, smooth: 6 });
  }
  // Halo: shards orbiting over the head.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    piece(spin[0], G.octa(0.045), glow, { pos: [Math.cos(a) * 0.32, Math.sin(i * 2.1) * 0.04, Math.sin(a) * 0.32], scale: [0.6, 1.6, 0.6], glow: true, outline: 0.006 });
  }
  // Tendrils, curling as they trail.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const len = 0.75 + (i % 3) * 0.15;
    const out = 0.1 + (i % 2) * 0.06;
    const c = Math.cos(a);
    const s = Math.sin(a);
    hook(robe, [[c * 0.06, 0, s * 0.05], [c * (0.06 + out), -len * 0.4, s * (0.05 + out)], [c * (0.04 + out * 0.6), -len * 0.75, s * (0.04 + out * 0.6)], [c * (0.1 + out), -len, s * (0.1 + out)]], 0.045, 0.006, i % 2 ? shell : flesh, { outline: 0.008, smooth: 8 });
  }
  for (let i = 0; i < 4; i++) piece(robe, G.sphere(0.022, 6, 4), glow, { pos: [Math.cos(i * 1.6) * 0.1, -0.2 - i * 0.14, Math.sin(i * 1.6) * 0.09], glow: true, outline: 0 });
  for (const [arm, s] of arms.map((a, i) => [a, i === 0 ? 1 : -1])) {
    blob(arm.upper, shell, [0, -0.14, 0], [0.035, 0.15, 0.035], { outline: 0.01 });
    blob(arm.fore, flesh, [0, -0.14, 0], [0.028, 0.15, 0.028], { outline: 0.008 });
    for (let k = 0; k < 3; k++) hook(arm.hand, [[0, 0, 0], [(k - 1) * 0.03 * s, -0.08, 0.02], [(k - 1) * 0.05 * s, -0.15, 0.05]], 0.012, 0.003, shell, { outline: 0.006, smooth: 4 });
    piece(arm.hand, G.sphere(0.045, 8, 6), glow, { pos: [0, -0.03, 0.03], glow: true, outline: 0 });
  }
  return finish(rig);
}

export const HIVE_MODELS = {
  'hive:drone': () => drone('drone'),
  'hive:bloater': () => drone('bloater'),
  'hive:spitter': () => spitter('spitter'),
  'hive:lancer': () => spitter('lancer'),
  'hive:praetorian': () => praetorian('praetorian'),
  'hive:champion': () => praetorian('champion'),
  'hive:queen': () => queen(),
  'hive:psion': () => psion('psion'),
  'hive:cryo': () => psion('cryo'),
};
