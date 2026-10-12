// Enemy models for the four races, all procedural (ModelKit pieces baked into rigid-skinned
// meshes). Bipeds share the humanoid skeleton (anim/Animator.js drives them); beasts and spiders
// use a many-legged skeleton (anim/LegAnimator.js); drones and wraiths a hovering one.
//   goblin:cutter|scrapper|shield|ironclad|sapper|firebomber|shaman|spark
//   hollow:husk|bloated|archer|marksman|revenant|captain|king|wraith|shade
//   construct:sentry|arcsentry|stalker|bulwark|siege|colossus
//   beast:wolf|frostwolf|alpha|tusker|ironhide|ursa|spider|venom
// MODELS[key]() builds a template rig; bindAny(model) re-finds the bones on a clone.
import * as THREE from 'three';
import { piece, shade, G } from '../render/ModelKit.js';
import { skeleton, bone, finish, eyes, fist, bindRig, buildGoblin, buildOgre } from './Characters.js';

const INK = 0x14101c;
const WHITE = 0xfaf6ee;
const TINKER = 0x9aff3a;
const VOID = 0xb46aff;
const ARC = 0x3ad8ff;
const BONE = 0xe8dfc8;
const BONE_DARK = 0xb8ab90;
const IRON = 0x4a4e58;
const IRON_DARK = 0x2e3138;
const STEEL = 0x8a909c;

// A limb segment hanging along -Y from the bone.
const seg = (b, len, r0, r1, color, opts = {}) => piece(b, G.cyl(r0, r1, len, opts.n ?? 12), color, { pos: [opts.x ?? 0, -len / 2 + (opts.y ?? 0), opts.z ?? 0], outline: opts.outline ?? 0.02 });

// ======================================================================== goblins
function goblinKind(kind) {
  const look = {
    cutter: { cloth: 0x8a5a3a, weapon: 'knife' },
    scrapper: { cloth: 0x6a3a2a, weapon: 'knife', skin: 0x6aa040, scrap: true },
    shield: { cloth: 0x5a5a3a, weapon: 'mace', shield: 'plate' },
    ironclad: { cloth: 0x3a3a46, weapon: 'mace', shield: 'tower', skin: 0x6aa040 },
    sapper: { cloth: 0x7a6a3a, weapon: 'bomb', bomb: 0xffb030 },
    firebomber: { cloth: 0x8a3a2a, weapon: 'bomb', bomb: 0xff5a1a },
    shaman: { cloth: 0x4a3a6a, weapon: 'staff', glow: TINKER },
    spark: { cloth: 0x2a4a6a, weapon: 'staff', glow: ARC },
  }[kind];
  return buildGoblin({
    skin: look.skin ?? 0x7fb24a, cloth: look.cloth, weapon: 'none', pack: kind !== 'sapper' && kind !== 'firebomber' && !kind.startsWith('sha') && kind !== 'spark',
    extra: (rig, c) => {
      const W = rig.weaponMount;
      const O = rig.offMount;
      if (look.weapon === 'knife') {
        // Two curved scrap knives.
        for (const [M, s] of [[W, 1], [O, -1]]) {
          piece(M, G.box(0.04, 0.09, 0.1), c.strap, { pos: [0, 0, 0.02], outline: 0.008 });
          piece(M, G.box(0.02, 0.07, 0.42), c.scrap, { pos: [0, 0.02, 0.27], rot: [0.12, 0, 0], outline: 0.012 });
          piece(M, G.cone(0.035, 0.12, 4), c.scrap, { pos: [0, 0.06, 0.5], rot: [Math.PI / 2 + 0.3, 0, 0], outline: 0.01 });
          if (look.scrap) piece(M, G.box(0.024, 0.02, 0.3), 0xff5a2a, { pos: [0, -0.02, 0.25], glow: true, outline: 0 });
          void s;
        }
        if (look.scrap) {
          piece(rig.skull, G.box(0.36, 0.08, 0.05), 0x8a2a2a, { pos: [0, 0.02, 0.24], outline: 0.01 });
          for (const s of [-1, 1]) piece(rig.chest, G.cone(0.06, 0.2, 5), c.scrap, { pos: [0.24 * s, 0.32, -0.05], rot: [0, 0, -0.5 * s], outline: 0.01 });
        }
      } else if (look.weapon === 'mace') {
        piece(W, G.cylZ(0.03, 0.035, 0.55, 8), 0x5a3a26, { pos: [0, 0, 0.22] });
        piece(W, G.dodeca(0.13), c.scrap, { pos: [0, 0, 0.52] });
        for (let i = 0; i < 5; i++) piece(W, G.cone(0.03, 0.1, 4), STEEL, { pos: [Math.cos(i * 1.26) * 0.13, Math.sin(i * 1.26) * 0.13, 0.52], rot: [0, 0, i * 1.26 - Math.PI / 2], outline: 0.008 });
        // Shield on the off arm (faces forward from the fist).
        const tall = look.shield === 'tower';
        const sh = new THREE.Group();
        O.add(sh);
        sh.position.set(0, 0.05, 0.02);
        sh.rotation.set(-Math.PI / 2, 0, 0);
        piece(sh, G.box(tall ? 0.62 : 0.5, tall ? 0.85 : 0.6, 0.06), tall ? IRON : 0x8a6a3a, { pos: [0, 0, 0.06], outline: 0.025 });
        piece(sh, G.box(tall ? 0.5 : 0.38, tall ? 0.72 : 0.48, 0.03), tall ? IRON_DARK : c.scrap, { pos: [0, 0, 0.1], outline: 0.012 });
        piece(sh, G.sphere(0.08, 10, 8), STEEL, { pos: [0, 0.02, 0.13], outline: 0.01 });
        for (const y of [-0.2, 0.2]) piece(sh, G.box(tall ? 0.5 : 0.4, 0.03, 0.02), TINKER, { pos: [0, y * (tall ? 1.3 : 1), 0.12], glow: true, outline: 0 });
        if (tall) for (let i = 0; i < 3; i++) piece(sh, G.cone(0.04, 0.16, 4), STEEL, { pos: [(i - 1) * 0.2, 0.46, 0.08], outline: 0.01 });
        piece(rig.skull, G.dome(0.27, 14, 7, 0.5), tall ? IRON : c.scrap, { pos: [0, 0.06, 0.0], outline: 0.015 });
      } else if (look.weapon === 'bomb') {
        piece(W, G.sphere(0.13, 12, 10), 0x2a2a30, { pos: [0, 0.02, 0.1], outline: 0.012 });
        piece(W, G.cyl(0.02, 0.02, 0.1, 6), 0x8a6a3a, { pos: [0, 0.16, 0.1], outline: 0.006 });
        piece(W, G.sphere(0.035, 6, 4), look.bomb, { pos: [0, 0.22, 0.1], glow: true, outline: 0 });
        // Bandolier of bombs and a satchel.
        for (let i = 0; i < 4; i++) {
          const a = -0.9 + i * 0.6;
          piece(rig.chest, G.sphere(0.07, 10, 8), 0x2a2a30, { pos: [Math.sin(a) * 0.25, 0.1 + Math.cos(a) * 0.08, 0.2], outline: 0.01 });
          piece(rig.chest, G.sphere(0.02, 6, 4), look.bomb, { pos: [Math.sin(a) * 0.25, 0.18 + Math.cos(a) * 0.08, 0.22], glow: true, outline: 0 });
        }
        piece(rig.chest, G.box(0.34, 0.3, 0.2), 0x6a4a2a, { pos: [0, 0.05, -0.3], rot: [0.15, 0, 0] });
        piece(rig.chest, G.box(0.36, 0.06, 0.22), look.bomb, { pos: [0, 0.2, -0.31], rot: [0.15, 0, 0], glow: true, outline: 0 });
        for (const s of [-1, 1]) piece(rig.skull, G.cylZ(0.075, 0.075, 0.08, 10), 0x2a2a30, { pos: [0.09 * s, 0.1, 0.23], rot: [-0.2, 0, 0], outline: 0.012 });
      } else if (look.weapon === 'staff') {
        piece(W, G.cylZ(0.022, 0.028, 1.3, 7), 0x5a3a26, { pos: [0, 0, 0.3] });
        piece(W, G.sphere(0.13, 10, 8), BONE, { pos: [0, 0, 0.98], scale: [1, 0.9, 1.1] });
        for (const s of [-1, 1]) piece(W, G.cone(0.03, 0.22, 5), BONE, { pos: [0.1 * s, 0.05, 1.05], rot: [-0.6, 0, -0.5 * s], outline: 0.008 });
        piece(W, G.octa(0.08), look.glow, { pos: [0, 0, 1.18], scale: [1, 1.5, 1], glow: true, outline: 0.01 });
        for (let i = 0; i < 3; i++) piece(W, G.box(0.02, 0.18, 0.04), [0xd94040, 0xf0c75e, 0x58cfff][i], { pos: [0.06, -0.12, 0.82 - i * 0.05], rot: [0, 0, 0.2], outline: 0 });
        // Bone mask and feathers.
        piece(rig.skull, G.box(0.34, 0.26, 0.06), BONE, { pos: [0, 0.03, 0.25], rot: [-0.1, 0, 0], outline: 0.015 });
        for (const s of [-1, 1]) piece(rig.skull, G.box(0.06, 0.04, 0.02), look.glow, { pos: [0.08 * s, 0.05, 0.29], glow: true, outline: 0 });
        for (let i = 0; i < 4; i++) piece(rig.skull, G.cone(0.04, 0.32, 4), [0xd94040, 0x58cfff, 0xf0c75e, 0xd94040][i], { pos: [-0.12 + i * 0.08, 0.3, -0.08], rot: [-0.4, 0, (i - 1.5) * 0.25], outline: 0.008 });
        piece(rig.chest, G.torus(0.22, 0.03, Math.PI * 2, 5, 14), BONE_DARK, { pos: [0, 0.32, 0.03], rot: [Math.PI / 2 - 0.2, 0, 0], outline: 0.01 });
      }
    },
  });
}

// ======================================================================== the Hollow
const HOLLOW = {
  hipY: 0.92, hipX: 0.12, hipDrop: 0.04, thigh: 0.42, shin: 0.4, ankle: 0.08,
  spine: 0.08, chest: 0.22, neck: 0.34, skull: 0.18, shoulderX: 0.28, shoulderY: 0.26,
  upper: 0.34, fore: 0.31, grip: 0.065, height: 1.95,
};

// Skeletal limbs: bone shafts with knobbed joints.
function boneArm(arm, s, color, { hand = true, sleeve = null, claws = null, gauntlet = null } = {}) {
  piece(arm.upper, G.sphere(0.06, 10, 8), color, { pos: [0, -0.01, 0], outline: 0.012 });
  seg(arm.upper, 0.32, 0.035, 0.03, color);
  if (sleeve) seg(arm.upper, 0.22, 0.08, 0.075, sleeve, { y: 0.02 });
  piece(arm.fore, G.sphere(0.045, 8, 6), color, { outline: 0.01 });
  seg(arm.fore, 0.28, 0.03, 0.025, color);
  seg(arm.fore, 0.26, 0.022, 0.02, shade(color, 0.85), { x: 0.035 * s });
  if (gauntlet) seg(arm.fore, 0.16, 0.06, 0.055, gauntlet, { y: -0.12 });
  if (hand) fist(arm.hand, gauntlet ?? color, gauntlet ?? color, s, 0.9, { claws });
}

function boneLeg(leg, color, { greave = null } = {}) {
  piece(leg.thigh, G.sphere(0.07, 10, 8), color, { outline: 0.012 });
  seg(leg.thigh, 0.4, 0.04, 0.035, color);
  piece(leg.shin, G.sphere(0.055, 10, 8), color, { outline: 0.012 });
  seg(leg.shin, 0.38, 0.035, 0.03, color);
  if (greave) seg(leg.shin, 0.26, 0.075, 0.065, greave, { y: -0.06 });
  piece(leg.foot, G.box(0.1, 0.05, 0.2), greave ?? color, { pos: [0, -0.04, 0.06], outline: 0.012 });
}

function ribs(chest, color, glow = VOID) {
  piece(chest, G.cyl(0.03, 0.03, 0.42, 8), color, { pos: [0, 0.12, -0.08], outline: 0.01 });
  for (let i = 0; i < 4; i++) piece(chest, G.torus(0.16 - i * 0.015, 0.018, Math.PI * 1.5, 4, 12), color, { pos: [0, 0.24 - i * 0.075, -0.03], rot: [Math.PI / 2, 0, Math.PI * 0.25], scale: [1.15, 1, 1], outline: 0.008 });
  piece(chest, G.sphere(0.06, 8, 6), glow, { pos: [0, 0.12, 0], glow: true, outline: 0 });
}

function skull(head, color, glow, { jaw = true } = {}) {
  piece(head, G.sphere(0.19, 14, 12), color, { scale: [0.95, 1, 1.05] });
  piece(head, G.box(0.22, 0.1, 0.18), color, { pos: [0, -0.13, 0.05] });
  for (const s of [-1, 1]) {
    piece(head, G.sphere(0.055, 8, 6), INK, { pos: [0.075 * s, 0.0, 0.16], scale: [1, 0.8, 0.5], outline: 0 });
    piece(head, G.sphere(0.025, 6, 4), glow, { pos: [0.075 * s, 0.0, 0.185], glow: true, outline: 0 });
  }
  if (jaw) for (const x of [-0.06, -0.02, 0.02, 0.06]) piece(head, G.box(0.025, 0.04, 0.02), WHITE, { pos: [x, -0.11, 0.14], outline: 0 });
}

function hollowBiped(kind) {
  const P = { ...HOLLOW };
  if (kind === 'king') Object.assign(P, { hipY: 1.05, thigh: 0.48, shin: 0.46, shoulderX: 0.36, upper: 0.4, fore: 0.36, height: 2.3 });
  const rig = skeleton(P);
  const { hips, spine, chest, skull: head } = rig;
  const glow = kind === 'shade' ? 0xbff4ff : VOID;
  if (kind === 'husk' || kind === 'bloated') {
    const skin = kind === 'bloated' ? 0x8aa060 : 0x8a9a7a;
    const rag = 0x4a4038;
    piece(hips, G.sphere(0.17, 12, 10), rag, { scale: [1.1, 0.7, 0.9] });
    for (let i = 0; i < 5; i++) piece(hips, G.box(0.08, 0.3, 0.02), shade(rag, 0.85), { pos: [-0.16 + i * 0.08, -0.2, 0.14], rot: [-0.15, 0, (i - 2) * 0.08], outline: 0.008 });
    piece(spine, G.sphere(0.17, 12, 10), skin, { pos: [0, 0.1, 0.02], scale: [1, 1.1, 0.85] });
    piece(chest, G.sphere(0.2, 14, 10), skin, { pos: [0, 0.12, -0.02], scale: [1.1, 1, 0.85] });
    ribs(chest, BONE_DARK);
    piece(chest, G.box(0.42, 0.22, 0.04), rag, { pos: [0.05, 0.02, 0.17], rot: [0, 0, 0.2], outline: 0.01 });
    if (kind === 'bloated') {
      piece(spine, G.sphere(0.32, 16, 12), skin, { pos: [0, 0.08, 0.12], scale: [1, 0.95, 1] });
      for (let i = 0; i < 7; i++) {
        const a = i * 0.9;
        piece(spine, G.sphere(0.05, 8, 6), 0x9be22d, { pos: [Math.cos(a) * 0.25, 0.08 + Math.sin(a * 1.7) * 0.15, 0.25 + Math.sin(a) * 0.1], glow: true, outline: 0.006 });
      }
    }
    piece(head, G.sphere(0.18, 14, 12), skin, { scale: [0.95, 1.05, 1] });
    piece(head, G.box(0.2, 0.1, 0.15), shade(skin, 0.8), { pos: [0, -0.12, 0.06], rot: [0.25, 0, 0] });
    for (const s of [-1, 1]) piece(head, G.sphere(0.03, 6, 4), glow, { pos: [0.07 * s, 0.02, 0.165], glow: true, outline: 0 });
    for (const x of [-0.05, 0, 0.05]) piece(head, G.cone(0.015, 0.05, 4), BONE, { pos: [x, -0.13, 0.15], rot: [Math.PI, 0, 0], outline: 0 });
    for (const [arm, s] of [[rig.armL, 1], [rig.armR, -1]]) {
      piece(arm.upper, G.sphere(0.08, 10, 8), skin);
      seg(arm.upper, 0.32, 0.06, 0.05, skin);
      piece(arm.fore, G.sphere(0.055, 10, 8), shade(skin, 0.85));
      seg(arm.fore, 0.29, 0.05, 0.04, skin);
      fist(arm.hand, shade(skin, 0.8), skin, s, 1, { claws: BONE });
    }
    rig.legs.forEach((leg) => {
      piece(leg.thigh, G.sphere(0.09, 10, 8), rag);
      seg(leg.thigh, 0.4, 0.075, 0.06, rag);
      piece(leg.shin, G.sphere(0.06, 10, 8), skin);
      seg(leg.shin, 0.38, 0.055, 0.045, skin);
      piece(leg.foot, G.box(0.12, 0.06, 0.22), shade(skin, 0.8), { pos: [0, -0.04, 0.06] });
    });
  } else {
    // Skeletal warriors.
    const armor = kind === 'king' ? 0x2a2438 : kind === 'captain' ? 0x3a3a4a : kind === 'revenant' ? IRON : null;
    const trim = kind === 'king' || kind === 'captain' ? 0xd9a227 : STEEL;
    piece(hips, G.torus(0.13, 0.03, Math.PI * 2, 5, 12), BONE, { rot: [Math.PI / 2, 0, 0], outline: 0.01 });
    piece(spine, G.cyl(0.03, 0.03, 0.26, 8), BONE, { pos: [0, 0.1, -0.06] });
    ribs(chest, BONE, glow);
    skull(head, BONE, glow);
    for (const [arm, s] of [[rig.armL, 1], [rig.armR, -1]]) boneArm(arm, s, BONE, { gauntlet: armor, sleeve: kind === 'archer' || kind === 'marksman' ? 0x3a3446 : null });
    rig.legs.forEach((leg) => boneLeg(leg, BONE, { greave: armor }));
    if (kind === 'archer' || kind === 'marksman') {
      const cloak = kind === 'marksman' ? 0x2a3a2e : 0x3a3446;
      piece(head, G.hood(0.24, 1.0), cloak, { pos: [0, 0.03, -0.03] });
      piece(chest, G.box(0.44, 0.5, 0.05), cloak, { pos: [0, 0.0, -0.17], rot: [0.12, 0, 0], outline: 0.012 });
      piece(chest, G.cyl(0.06, 0.05, 0.45, 8), 0x5a3a26, { pos: [0.1, 0.12, -0.24], rot: [0.25, 0, -0.4] });
      const W = rig.weaponMount;
      const R = kind === 'marksman' ? 0.6 : 0.5;
      const bow = G.torus(R, 0.022, Math.PI, 5, 18).rotateZ(-Math.PI / 2).rotateY(-Math.PI / 2);
      piece(W, bow, kind === 'marksman' ? 0x2a2a30 : BONE_DARK, { pos: [0, 0, -R] });
      piece(W, G.box(0.01, R * 2, 0.01), glow, { pos: [0, 0, -R], glow: true, outline: 0 });
      piece(W, G.box(0.06, 0.14, 0.08), 0x5a4a3a, { pos: [0, 0, -0.02], outline: 0.008 });
      const arrow = bone(W, 'arrow', [0, 0.02, -R - 0.02]);
      piece(arrow, G.cylZ(0.01, 0.01, 0.7, 4), BONE, { pos: [0, 0, 0.3], outline: 0 });
      piece(arrow, G.coneZ(0.03, 0.08, 4), glow, { pos: [0, 0, 0.68], glow: true, outline: 0.008 });
      rig.arrow = arrow;
    } else {
      // Armoured: breastplate, pauldrons, helm with a glowing slit, sword and shield.
      const big = kind === 'king';
      piece(chest, G.dome(0.26, 14, 10, 0.62), armor, { pos: [0, 0.1, 0.02], scale: [1.1, 1, 0.95], outline: 0.02 });
      piece(chest, G.box(0.06, 0.32, 0.03), trim, { pos: [0, 0.12, 0.26], outline: 0.008 });
      for (const s of [-1, 1]) {
        piece(rig[s > 0 ? 'armL' : 'armR'].upper, G.dome(0.15, 12, 6), armor, { pos: [0.03 * s, 0.03, 0], rot: [0, 0, -0.45 * s], outline: 0.015 });
        piece(rig[s > 0 ? 'armL' : 'armR'].upper, G.torus(0.145, 0.015, Math.PI * 2, 4, 14), trim, { pos: [0.03 * s, 0.03, 0], rot: [Math.PI / 2, 0.45 * s, 0], outline: 0 });
      }
      piece(head, G.dome(0.23, 14, 8, 0.6), armor, { pos: [0, 0.03, 0], outline: 0.015 });
      piece(head, G.box(0.24, 0.035, 0.03), glow, { pos: [0, 0.0, 0.2], glow: true, outline: 0 });
      piece(hips, G.box(0.36, 0.3, 0.05), shade(armor, 0.85), { pos: [0, -0.18, 0.12], rot: [-0.1, 0, 0], outline: 0.012 });
      piece(chest, G.box(0.5, 0.75, 0.03), big ? 0x3a1a4a : 0x2a2430, { pos: [0, -0.05, -0.2], rot: [0.08, 0, 0], outline: 0.012 });
      if (kind === 'captain' || big) for (let i = 0; i < 5; i++) piece(head, G.cone(0.03, 0.12 + (i === 2 ? 0.08 : 0), 5), trim, { pos: [(i - 2) * 0.07, 0.22, 0.02], outline: 0.008 });
      if (big) {
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2;
          piece(head, G.cone(0.035, 0.18, 4), 0xd9a227, { pos: [Math.cos(a) * 0.17, 0.24, Math.sin(a) * 0.17], outline: 0.008 });
        }
        piece(head, G.torus(0.18, 0.025, Math.PI * 2, 5, 18), 0xd9a227, { pos: [0, 0.2, 0], rot: [Math.PI / 2, 0, 0], outline: 0.01 });
      }
      const W = rig.weaponMount;
      const len = big ? 1.5 : 0.95;
      piece(W, G.box(0.05, 0.05, 0.22), 0x2a2430, { pos: [0, 0, 0.0] });
      piece(W, G.box(big ? 0.4 : 0.3, 0.05, 0.06), trim, { pos: [0, 0, 0.13], outline: 0.01 });
      piece(W, G.box(big ? 0.13 : 0.08, 0.025, len), big ? 0x3a3a46 : STEEL, { pos: [0, 0, 0.16 + len / 2], outline: 0.012 });
      piece(W, G.box(0.02, 0.028, len * 0.85), glow, { pos: [0, 0, 0.16 + len * 0.45], glow: true, outline: 0 });
      if (!big) {
        const sh = new THREE.Group();
        rig.offMount.add(sh);
        sh.position.set(0, 0.04, 0.02);
        sh.rotation.set(-Math.PI / 2, 0, 0);
        piece(sh, G.cyl(0.3, 0.3, 0.05, 6), armor, { rot: [Math.PI / 2, 0, 0], pos: [0, 0, 0.06], outline: 0.02 });
        piece(sh, G.cyl(0.22, 0.22, 0.03, 6), trim, { rot: [Math.PI / 2, 0, 0], pos: [0, 0, 0.09], outline: 0.01 });
        piece(sh, G.octa(0.07), glow, { pos: [0, 0, 0.12], glow: true, outline: 0.006 });
      }
    }
  }
  return finish(rig);
}

// ======================================================================== constructs (bipeds)
const STALKER = {
  hipY: 1.0, hipX: 0.16, hipDrop: 0.04, thigh: 0.46, shin: 0.48, ankle: 0.08,
  spine: 0.1, chest: 0.26, neck: 0.34, skull: 0.12, shoulderX: 0.34, shoulderY: 0.24,
  upper: 0.34, fore: 0.32, grip: 0.07, height: 2.05,
};
const BULWARK = {
  hipY: 1.05, hipX: 0.3, hipDrop: 0.05, thigh: 0.48, shin: 0.45, ankle: 0.12,
  spine: 0.14, chest: 0.42, neck: 0.62, neckZ: 0.12, skull: 0.08, shoulderX: 0.66, shoulderY: 0.46,
  upper: 0.5, fore: 0.52, grip: 0.12, height: 2.8,
};

function constructBiped(kind) {
  const plate = kind === 'colossus' ? 0x6a5a48 : 0x7a8290;
  const dark = 0x3a3e48;
  const glow = ARC;
  if (kind === 'stalker') {
    const rig = skeleton(STALKER);
    const { hips, spine, chest, skull: head } = rig;
    piece(hips, G.box(0.36, 0.16, 0.24), dark, { outline: 0.02 });
    piece(spine, G.cyl(0.07, 0.08, 0.2, 8), STEEL, { pos: [0, 0.08, 0] });
    piece(chest, G.box(0.46, 0.36, 0.32), plate, { pos: [0, 0.12, 0], outline: 0.025 });
    piece(chest, G.box(0.3, 0.2, 0.05), dark, { pos: [0, 0.14, 0.17], outline: 0.012 });
    for (const s of [-1, 1]) piece(chest, G.box(0.03, 0.18, 0.06), glow, { pos: [0.18 * s, 0.14, 0.17], glow: true, outline: 0 });
    for (const s of [-1, 1]) piece(chest, G.cylZ(0.05, 0.06, 0.2, 8), dark, { pos: [0.14 * s, 0.2, -0.22], outline: 0.012 });
    piece(head, G.box(0.26, 0.18, 0.3), plate, { pos: [0, 0.02, 0.04], outline: 0.02 });
    piece(head, G.cylZ(0.08, 0.08, 0.06, 14), dark, { pos: [0, 0.02, 0.2], outline: 0.012 });
    piece(head, G.sphere(0.06, 10, 8), glow, { pos: [0, 0.02, 0.22], glow: true, outline: 0 });
    for (const [arm, s] of [[rig.armL, 1], [rig.armR, -1]]) {
      piece(arm.upper, G.sphere(0.09, 10, 8), dark);
      piece(arm.upper, G.box(0.14, 0.32, 0.14), plate, { pos: [0, -0.16, 0], outline: 0.02 });
      piece(arm.fore, G.box(0.1, 0.3, 0.12), dark, { pos: [0, -0.15, 0], outline: 0.015 });
      piece(arm.fore, G.box(0.03, 0.2, 0.13), glow, { pos: [0.06 * s, -0.15, 0], glow: true, outline: 0 });
      // Arm blades instead of hands.
      piece(arm.hand, G.box(0.03, 0.7, 0.12), STEEL, { pos: [0, -0.3, 0.04], rot: [0.15, 0, 0], outline: 0.012 });
      piece(arm.hand, G.box(0.034, 0.5, 0.02), glow, { pos: [0, -0.3, 0.1], rot: [0.15, 0, 0], glow: true, outline: 0 });
    }
    rig.legs.forEach((leg) => {
      piece(leg.thigh, G.box(0.16, 0.44, 0.18), plate, { pos: [0, -0.22, 0], outline: 0.02 });
      piece(leg.shin, G.sphere(0.08, 8, 6), dark);
      piece(leg.shin, G.box(0.11, 0.46, 0.12), dark, { pos: [0, -0.23, -0.04], rot: [0.12, 0, 0], outline: 0.015 });
      piece(leg.shin, G.box(0.12, 0.2, 0.06), plate, { pos: [0, -0.12, 0.07], outline: 0.012 });
      piece(leg.foot, G.box(0.16, 0.06, 0.3), dark, { pos: [0, -0.04, 0.08], outline: 0.015 });
      for (const s of [-1, 1]) piece(leg.foot, G.cone(0.03, 0.1, 4), STEEL, { pos: [0.05 * s, -0.05, 0.25], rot: [Math.PI / 2, 0, 0], outline: 0.008 });
    });
    return finish(rig);
  }
  // Bulwark / siege / colossus: heavy frames with a back-mounted mortar.
  const P = kind === 'colossus' ? { ...BULWARK, hipY: 1.7, thigh: 0.78, shin: 0.74, hipX: 0.5, chest: 0.7, neck: 1.0, shoulderX: 1.08, shoulderY: 0.76, upper: 0.82, fore: 0.85, grip: 0.2, height: 4.6, ankle: 0.18, spine: 0.22 } : BULWARK;
  const k = kind === 'colossus' ? 1.62 : 1;
  const rig = skeleton(P);
  const { hips, spine, chest, skull: head } = rig;
  piece(hips, G.box(0.7 * k, 0.3 * k, 0.5 * k), dark, { outline: 0.03 });
  piece(spine, G.cyl(0.16 * k, 0.2 * k, 0.24 * k, 10), STEEL, { pos: [0, 0.1 * k, 0] });
  piece(chest, G.box(1.1 * k, 0.75 * k, 0.75 * k), plate, { pos: [0, 0.25 * k, 0], outline: 0.035 });
  piece(chest, G.box(0.7 * k, 0.4 * k, 0.06), dark, { pos: [0, 0.3 * k, 0.38 * k], outline: 0.015 });
  piece(chest, G.cylZ(0.14 * k, 0.14 * k, 0.08, 16), glow, { pos: [0, 0.3 * k, 0.42 * k], glow: true, outline: 0.012 });
  for (const s of [-1, 1]) piece(chest, G.box(0.06, 0.5 * k, 0.6 * k), dark, { pos: [0.56 * k * s, 0.25 * k, 0], outline: 0.015 });
  // Mortar on the back.
  const mortar = kind === 'siege' || kind === 'colossus' ? 1.3 : 1;
  piece(chest, G.cyl(0.2 * k * mortar, 0.24 * k * mortar, 0.7 * k * mortar, 12), dark, { pos: [0.25 * k, 0.75 * k, -0.35 * k], rot: [-0.5, 0, 0], outline: 0.025 });
  piece(chest, G.torus(0.2 * k * mortar, 0.03 * k, Math.PI * 2, 5, 16), glow, { pos: [0.25 * k, 1.05 * k * (0.9 + mortar * 0.1), -0.5 * k], rot: [Math.PI / 2 - 0.5, 0, 0], glow: true, outline: 0 });
  if (kind === 'colossus') for (let i = 0; i < 4; i++) piece(chest, G.cone(0.1 * k, 0.4 * k, 5), 0xd9a227, { pos: [(i - 1.5) * 0.25 * k, 0.7 * k, 0.1 * k], outline: 0.012 });
  piece(head, G.box(0.36 * k, 0.22 * k, 0.32 * k), plate, { pos: [0, 0.04, 0.1 * k], outline: 0.02 });
  piece(head, G.box(0.28 * k, 0.05 * k, 0.03), glow, { pos: [0, 0.04, 0.27 * k], glow: true, outline: 0 });
  for (const [arm, s] of [[rig.armL, 1], [rig.armR, -1]]) {
    piece(arm.upper, G.sphere(0.24 * k, 12, 10), dark);
    piece(arm.upper, G.box(0.36 * k, 0.5 * k, 0.36 * k), plate, { pos: [0, -0.25 * k, 0], outline: 0.025 });
    piece(arm.fore, G.box(0.32 * k, 0.52 * k, 0.32 * k), dark, { pos: [0, -0.26 * k, 0], outline: 0.02 });
    piece(arm.fore, G.box(0.05, 0.3 * k, 0.33 * k), glow, { pos: [0.16 * k * s, -0.26 * k, 0], glow: true, outline: 0 });
    piece(arm.hand, G.box(0.36 * k, 0.26 * k, 0.36 * k), plate, { pos: [0, -0.12 * k, 0], outline: 0.02 });
    for (let i = 0; i < 3; i++) piece(arm.hand, G.box(0.08 * k, 0.16 * k, 0.1 * k), dark, { pos: [(i - 1) * 0.11 * k, -0.3 * k, 0.1 * k], outline: 0.01 });
  }
  rig.legs.forEach((leg) => {
    piece(leg.thigh, G.box(0.34 * k, 0.48 * k, 0.36 * k), plate, { pos: [0, -0.24 * k, 0], outline: 0.025 });
    piece(leg.shin, G.sphere(0.16 * k, 10, 8), dark);
    piece(leg.shin, G.box(0.3 * k, 0.45 * k, 0.32 * k), dark, { pos: [0, -0.23 * k, 0], outline: 0.02 });
    piece(leg.foot, G.box(0.4 * k, 0.16 * k, 0.6 * k), plate, { pos: [0, -0.06 * k, 0.1 * k], outline: 0.025 });
  });
  return finish(rig);
}

// ======================================================================== many-legged rigs
// cfg: bodyY, legLen, bodyLen, bodyWidth, chest [x,y,z] | null, neck, head, jaw, tail { at, n, seg },
//      legs [{ hip [x,y,z] (body space), upper, lower, foot [x, ?, z] rest (model space),
//              side ±1, front, phase, bend: back|fwd|up }]
export function legSkeleton(cfg) {
  const model = new THREE.Group();
  const body = bone(model, 'body', [0, cfg.bodyY, 0]);
  const chest = cfg.chest ? bone(body, 'chest', cfg.chest) : null;
  const front = chest ?? body;
  const neck = cfg.neck ? bone(front, 'neck', cfg.neck) : null;
  const head = cfg.head ? bone(neck ?? front, 'head', cfg.head) : null;
  const jaw = cfg.jaw ? bone(head, 'jaw', cfg.jaw) : null;
  const tail = [];
  if (cfg.tail) {
    let parent = body;
    for (let i = 0; i < cfg.tail.n; i++) {
      const b = bone(parent, `tail${i}`, i === 0 ? cfg.tail.at : [0, 0, -cfg.tail.seg]);
      tail.push(b);
      parent = b;
    }
  }
  const legs = cfg.legs.map((lc, i) => {
    const onChest = lc.front && chest;
    const hp = onChest ? [lc.hip[0] - cfg.chest[0], lc.hip[1] - cfg.chest[1], lc.hip[2] - cfg.chest[2]] : lc.hip;
    const upper = bone(onChest ? chest : body, `leg${i}.upper`, hp);
    const lower = bone(upper, `leg${i}.lower`, [0, -lc.upper, 0]);
    const foot = bone(lower, `leg${i}.foot`, [0, -lc.lower, 0]);
    return { upper, lower, foot, cfg: lc };
  });
  model.userData.legCfg = cfg;
  model.userData.rigHeight = cfg.height;
  return { model, body, chest, neck, head, jaw, tail, legs, cfg, height: cfg.height, kind: 'legs' };
}

function quadLegs({ fx, fz, hx, hz, hipY, upper, lower, footSpread = 1.05 }) {
  const mk = (side, front, phase) => ({
    hip: [side * (front ? fx : hx), hipY, front ? fz : hz], upper, lower,
    foot: [side * (front ? fx : hx) * footSpread, 0, front ? fz + 0.04 : hz - 0.02], side, front, phase, bend: front ? 'back' : 'fwd',
  });
  // Trot: diagonal pairs move together.
  return [mk(1, true, 0), mk(-1, true, 0.5), mk(1, false, 0.5), mk(-1, false, 0)];
}

function wolf(kind) {
  const alpha = kind === 'alpha';
  const frost = kind === 'frostwolf';
  const fur = frost ? 0xbcd4e6 : alpha ? 0x3e3a38 : 0x6f6a66;
  const back = frost ? 0x8aa8c4 : alpha ? 0x262422 : 0x4a4644;
  const belly = frost ? 0xe6f0f8 : alpha ? 0x5a5450 : 0xa8a29a;
  const eye = frost ? 0x7fe8ff : alpha ? 0xff4a2a : 0xffb030;
  const cfg = {
    bodyY: 0.74, legLen: 0.7, bodyLen: 0.85, bodyWidth: 0.34, walk: 2.6, strideK: 0.28, height: 1.1, jawOpen: 0.7, tailDroop: 0.5,
    chest: [0, 0.04, 0.32], neck: [0, 0.12, 0.2], head: [0, 0.1, 0.18], jaw: [0, -0.05, 0.05],
    tail: { at: [0, 0.08, -0.44], n: 3, seg: 0.17 },
    legs: quadLegs({ fx: 0.15, fz: 0.36, hx: 0.15, hz: -0.36, hipY: -0.06, upper: 0.36, lower: 0.36 }),
  };
  const rig = legSkeleton(cfg);
  const { body, chest, neck, head, jaw } = rig;
  piece(body, G.capsuleZ(0.21, 0.5, 12), fur, { pos: [0, 0, -0.08], scale: [1, 1.05, 1] });
  piece(body, G.capsuleZ(0.14, 0.4, 10), belly, { pos: [0, -0.1, -0.02], outline: 0.012 });
  piece(body, G.box(0.22, 0.06, 0.6), back, { pos: [0, 0.2, -0.1], outline: 0.012 });
  piece(chest, G.sphere(0.25, 14, 10), fur, { pos: [0, 0.02, 0.02], scale: [1, 1.05, 1.1] });
  // Ruff: a collar of fur spikes (a full mane on the alpha).
  for (let i = 0; i < (alpha ? 12 : 7); i++) {
    const a = -1.4 + (i / ((alpha ? 12 : 7) - 1)) * 2.8;
    piece(chest, G.cone(alpha ? 0.09 : 0.07, alpha ? 0.3 : 0.2, 4), back, { pos: [Math.sin(a) * 0.2, 0.18 + Math.cos(a) * 0.06, 0.02 + Math.cos(a) * 0.05], rot: [-0.9, 0, -a * 0.6], outline: 0.01 });
  }
  piece(neck, G.cyl(0.12, 0.14, 0.24, 10), fur, { pos: [0, 0.02, 0.06], rot: [1.1, 0, 0] });
  piece(head, G.sphere(0.15, 12, 10), fur, { scale: [1, 0.9, 1.05] });
  piece(head, G.box(0.12, 0.1, 0.24), fur, { pos: [0, -0.03, 0.17], outline: 0.015 });
  piece(head, G.sphere(0.035, 8, 6), INK, { pos: [0, 0.0, 0.29], outline: 0 });
  for (const s of [-1, 1]) {
    piece(head, G.cone(0.05, 0.16, 4), back, { pos: [0.08 * s, 0.15, -0.02], rot: [-0.2, 0, -0.25 * s], outline: 0.012 });
    piece(head, G.sphere(0.03, 6, 4), eye, { pos: [0.07 * s, 0.04, 0.12], glow: true, outline: 0 });
  }
  piece(jaw, G.box(0.1, 0.04, 0.2), belly, { pos: [0, -0.02, 0.12], outline: 0.012 });
  for (const s of [-1, 1]) piece(jaw, G.cone(0.015, 0.05, 4), WHITE, { pos: [0.035 * s, 0.025, 0.2], outline: 0 });
  for (const s of [-1, 1]) piece(head, G.cone(0.015, 0.05, 4), WHITE, { pos: [0.035 * s, -0.08, 0.26], rot: [Math.PI, 0, 0], outline: 0 });
  rig.tail.forEach((b, i) => piece(b, G.cylZ(0.07 - i * 0.015, 0.05 - i * 0.012, 0.2, 8), i === rig.tail.length - 1 ? belly : fur, { pos: [0, 0, -0.09], outline: 0.012 }));
  if (frost) for (let i = 0; i < 5; i++) piece(body, G.octa(0.05), 0xbff4ff, { pos: [(i % 2 ? 0.08 : -0.08), 0.24, 0.1 - i * 0.12], scale: [0.6, 1.6, 0.6], glow: true, outline: 0.006 });
  if (alpha) for (let i = 0; i < 3; i++) piece(body, G.box(0.02, 0.15, 0.01), 0xd94040, { pos: [0.21, 0.04, -0.15 + i * 0.07], rot: [0, 0, 0.5], glow: true, outline: 0 });
  rig.legs.forEach((leg) => {
    const k = leg.cfg.front ? 1 : 1.12;
    seg(leg.upper, 0.36, 0.08 * k, 0.06, fur);
    seg(leg.lower, 0.36, 0.045, 0.04, fur);
    piece(leg.foot, G.box(0.09, 0.05, 0.12), back, { pos: [0, -0.02, 0.03], outline: 0.012 });
  });
  return finish(rig);
}

function tusker(kind) {
  const iron = kind === 'ironhide';
  const hide = iron ? 0x5a4a44 : 0x7a5a44;
  const dark = iron ? 0x3a302c : 0x4a3428;
  const cfg = {
    bodyY: 0.86, legLen: 0.6, bodyLen: 1.1, bodyWidth: 0.6, walk: 2.2, strideK: 0.26, height: 1.35, jawOpen: 0.4, tailDroop: 0.4,
    chest: [0, 0.05, 0.38], neck: [0, 0.02, 0.28], head: [0, -0.02, 0.18], jaw: [0, -0.1, 0.08],
    tail: { at: [0, 0.12, -0.62], n: 2, seg: 0.12 },
    legs: quadLegs({ fx: 0.24, fz: 0.42, hx: 0.24, hz: -0.42, hipY: -0.2, upper: 0.32, lower: 0.32, footSpread: 1.0 }),
  };
  const rig = legSkeleton(cfg);
  const { body, chest, neck, head, jaw } = rig;
  piece(body, G.sphere(0.48, 16, 12), hide, { pos: [0, 0.02, -0.1], scale: [0.95, 0.9, 1.35] });
  piece(chest, G.sphere(0.46, 16, 12), hide, { pos: [0, 0.1, 0], scale: [1, 1.05, 1] });
  // Bristle ridge along the spine.
  for (let i = 0; i < 9; i++) piece(body, G.cone(0.05, 0.22, 4), dark, { pos: [0, 0.44 - Math.abs(i - 3) * 0.03, 0.45 - i * 0.12], rot: [-0.5, 0, 0], outline: 0.01 });
  if (iron) {
    for (let i = 0; i < 4; i++) piece(body, G.box(0.7, 0.08, 0.26), IRON, { pos: [0, 0.38 - Math.abs(i - 1.5) * 0.04, 0.25 - i * 0.24], rot: [0.1, 0, 0], outline: 0.02 });
    piece(chest, G.box(0.5, 0.3, 0.06), IRON, { pos: [0, 0.1, 0.44], outline: 0.02 });
  }
  piece(neck, G.sphere(0.3, 12, 10), hide, { pos: [0, 0, 0.04] });
  piece(head, G.box(0.4, 0.36, 0.42), hide, { pos: [0, 0, 0.12], outline: 0.02 });
  piece(head, G.cylZ(0.14, 0.16, 0.16, 12), shade(hide, 1.2), { pos: [0, -0.06, 0.38], outline: 0.015 });
  for (const s of [-1, 1]) {
    piece(head, G.sphere(0.03, 6, 4), INK, { pos: [0.05 * s, -0.06, 0.46], outline: 0 });
    piece(head, G.sphere(0.035, 6, 4), 0xff7a1a, { pos: [0.16 * s, 0.08, 0.3], glow: true, outline: 0 });
    piece(head, G.cone(0.06, 0.16, 4), dark, { pos: [0.16 * s, 0.22, 0.05], rot: [-0.3, 0, -0.4 * s], outline: 0.012 });
    // Tusks curling up from the jaw.
    piece(jaw, G.tube([[0.12 * s, 0, 0.2], [0.2 * s, 0.08, 0.32], [0.18 * s, 0.24, 0.38]], 0.035, 10, 6), iron ? STEEL : BONE, { outline: 0.012 });
  }
  piece(jaw, G.box(0.3, 0.1, 0.3), dark, { pos: [0, 0, 0.16], outline: 0.015 });
  rig.tail.forEach((b) => piece(b, G.cylZ(0.04, 0.03, 0.14, 6), dark, { pos: [0, 0, -0.06], outline: 0.008 }));
  rig.legs.forEach((leg) => {
    seg(leg.upper, 0.32, 0.12, 0.09, hide);
    seg(leg.lower, 0.32, 0.07, 0.06, dark);
    piece(leg.foot, G.box(0.12, 0.08, 0.12), INK, { pos: [0, -0.02, 0.02], outline: 0.01 });
  });
  return finish(rig);
}

function ursa() {
  const fur = 0x5a4232;
  const dark = 0x3a2a20;
  const moss = 0x5f7a4a;
  const cfg = {
    bodyY: 1.35, legLen: 1.25, bodyLen: 2.0, bodyWidth: 1.2, walk: 2.4, strideK: 0.3, height: 2.6, jawOpen: 0.6, tailDroop: 0.3,
    chest: [0, 0.12, 0.7], neck: [0, 0.18, 0.45], head: [0, 0.02, 0.32], jaw: [0, -0.16, 0.12],
    tail: { at: [0, 0.2, -1.05], n: 1, seg: 0.2 },
    legs: quadLegs({ fx: 0.46, fz: 0.75, hx: 0.48, hz: -0.72, hipY: -0.15, upper: 0.62, lower: 0.62, footSpread: 1.0 }),
  };
  const rig = legSkeleton(cfg);
  const { body, chest, neck, head, jaw } = rig;
  piece(body, G.sphere(0.95, 18, 14), fur, { pos: [0, 0.05, -0.2], scale: [0.95, 0.85, 1.25] });
  piece(chest, G.sphere(0.95, 18, 14), fur, { pos: [0, 0.25, 0], scale: [1.05, 1.0, 0.95] });
  // Moss and arcane stone shards grown into its back.
  for (let i = 0; i < 9; i++) {
    const z = 0.6 - i * 0.22;
    const x = (i % 3 - 1) * 0.35;
    piece(body, G.octa(0.22 + (i % 2) * 0.1), 0x8c877d, { pos: [x, 0.75 - Math.abs(x) * 0.4, z], rot: [i, i * 0.7, 0.3], scale: [0.7, 1.6, 0.7], outline: 0.02 });
    if (i % 3 === 1) piece(body, G.box(0.06, 0.3, 0.06), 0x7fe8ff, { pos: [x, 0.95 - Math.abs(x) * 0.4, z], rot: [i, i * 0.7, 0.3], glow: true, outline: 0 });
  }
  piece(body, G.dome(0.6, 12, 8, 0.4), moss, { pos: [0, 0.35, -0.1], scale: [1.3, 0.8, 1.6], outline: 0.015 });
  piece(neck, G.sphere(0.55, 14, 10), fur, { pos: [0, 0, 0.08] });
  piece(head, G.sphere(0.48, 14, 12), fur, { scale: [1.05, 0.95, 1] });
  piece(head, G.box(0.36, 0.28, 0.4), shade(fur, 1.2), { pos: [0, -0.1, 0.38], outline: 0.02 });
  piece(head, G.sphere(0.09, 8, 6), INK, { pos: [0, -0.04, 0.6], outline: 0 });
  for (const s of [-1, 1]) {
    piece(head, G.sphere(0.13, 10, 8), fur, { pos: [0.34 * s, 0.38, -0.06], outline: 0.015 });
    piece(head, G.sphere(0.06, 8, 6), 0x7fe8ff, { pos: [0.2 * s, 0.12, 0.38], glow: true, outline: 0 });
    piece(head, G.box(0.02, 0.2, 0.02), 0x7fe8ff, { pos: [0.24 * s, 0.25, 0.34], rot: [0, 0, 0.4 * s], glow: true, outline: 0 });
  }
  piece(jaw, G.box(0.32, 0.12, 0.38), dark, { pos: [0, 0, 0.28], outline: 0.015 });
  for (const s of [-1, 1]) piece(jaw, G.cone(0.04, 0.12, 4), WHITE, { pos: [0.1 * s, 0.1, 0.42], outline: 0 });
  rig.tail.forEach((b) => piece(b, G.sphere(0.14, 8, 6), fur, { pos: [0, 0, -0.05] }));
  rig.legs.forEach((leg) => {
    seg(leg.upper, 0.62, 0.32, 0.24, fur);
    seg(leg.lower, 0.62, 0.22, 0.2, fur);
    piece(leg.foot, G.box(0.36, 0.14, 0.38), dark, { pos: [0, -0.04, 0.06], outline: 0.02 });
    if (leg.cfg.front) for (let i = 0; i < 4; i++) piece(leg.foot, G.cone(0.04, 0.2, 4), BONE, { pos: [(i - 1.5) * 0.08, -0.05, 0.28], rot: [Math.PI / 2 + 0.3, 0, 0], outline: 0.01 });
  });
  return finish(rig);
}

function spider(kind) {
  const venom = kind === 'venom';
  const shell = venom ? 0x3a4a2a : 0x3a2e2a;
  const legC = venom ? 0x2a3420 : 0x2a201e;
  const mark = venom ? 0x9be22d : 0xff5a2a;
  const legs = [];
  const zs = [0.22, 0.08, -0.06, -0.2];
  const fz = [0.8, 0.35, -0.2, -0.65];
  zs.forEach((z, i) => {
    for (const side of [1, -1]) {
      const phase = ((i % 2 === 0) === (side > 0)) ? 0 : 0.5;
      legs.push({ hip: [side * 0.2, 0.02, z], upper: 0.55, lower: 0.72, foot: [side * 0.95, 0, fz[i]], side, front: i < 2, phase, bend: 'up' });
    }
  });
  const cfg = { bodyY: 0.55, legLen: 1.0, bodyLen: 0.8, bodyWidth: 1.6, walk: 2.8, strideK: 0.22, height: 0.9, head: [0, 0.0, 0.32], jaw: [0, -0.04, 0.1], legs };
  const rig = legSkeleton(cfg);
  const { body, head, jaw } = rig;
  piece(body, G.sphere(0.3, 14, 10), shell, { pos: [0, 0.02, 0.05], scale: [1, 0.75, 1.1] });
  piece(body, G.sphere(0.48, 16, 12), shell, { pos: [0, 0.18, -0.6], scale: [0.95, 0.85, 1.15] });
  for (let i = 0; i < 3; i++) piece(body, G.box(0.42 - i * 0.08, 0.03, 0.08), mark, { pos: [0, 0.6 - i * 0.04, -0.4 - i * 0.22], rot: [0.3 + i * 0.3, 0, 0], glow: true, outline: 0 });
  for (let i = 0; i < 6; i++) piece(body, G.cone(0.04, 0.16, 4), legC, { pos: [Math.cos(i) * 0.25, 0.55, -0.6 + Math.sin(i) * 0.2], outline: 0.008 });
  piece(head, G.sphere(0.18, 12, 10), shell, { scale: [1.1, 0.85, 1] });
  for (const [x, y] of [[0.05, 0.08], [-0.05, 0.08], [0.11, 0.05], [-0.11, 0.05], [0.04, 0.13], [-0.04, 0.13]]) piece(head, G.sphere(0.03, 6, 4), 0xff2a2a, { pos: [x, y, 0.15], glow: true, outline: 0 });
  for (const s of [-1, 1]) piece(jaw, G.tube([[0.06 * s, 0, 0.02], [0.08 * s, -0.08, 0.1], [0.04 * s, -0.16, 0.08]], 0.025, 8, 5), venom ? 0x9be22d : BONE, { outline: 0.008 });
  rig.legs.forEach((leg) => {
    piece(leg.upper, G.sphere(0.06, 8, 6), legC);
    seg(leg.upper, 0.55, 0.05, 0.04, legC, { outline: 0.012 });
    piece(leg.lower, G.sphere(0.045, 8, 6), shell);
    seg(leg.lower, 0.72, 0.035, 0.012, legC, { outline: 0.01 });
  });
  return finish(rig);
}

// ======================================================================== hovering rigs
export function hoverSkeleton(cfg) {
  const model = new THREE.Group();
  const body = bone(model, 'body', [0, cfg.bodyY, 0]);
  const spin = (cfg.spin ?? []).map((s, i) => {
    const b = bone(body, `spin${i}`, s.at);
    b.userData.rate = s.rate;
    return b;
  });
  let arms = null;
  if (cfg.arms) {
    arms = [1, -1].map((side) => {
      const upper = bone(body, `arm${side > 0 ? 'L' : 'R'}.upper`, [cfg.arms.x * side, cfg.arms.y, cfg.arms.z ?? 0]);
      const fore = bone(upper, `arm${side > 0 ? 'L' : 'R'}.fore`, [0, -cfg.arms.upper, 0]);
      const hand = bone(fore, `arm${side > 0 ? 'L' : 'R'}.hand`, [0, -cfg.arms.fore, 0]);
      return { upper, fore, hand };
    });
  }
  const robe = cfg.robe ? bone(body, 'robe', cfg.robe) : null;
  model.userData.hoverCfg = cfg;
  model.userData.rigHeight = cfg.height;
  return { model, body, spin, arms, robe, cfg, height: cfg.height, kind: 'hover' };
}

function sentry(kind) {
  const arc = kind === 'arcsentry';
  const shell = arc ? 0xc8d0dc : STEEL;
  const glow = arc ? 0xbff4ff : ARC;
  const rig = hoverSkeleton({ bodyY: 0.5, height: 1.0, spin: [{ at: [0, 0, 0], rate: 3 }, { at: [0, -0.05, 0], rate: -5 }] });
  const { body, spin } = rig;
  piece(body, G.sphere(0.32, 16, 12), shell, { scale: [1, 0.85, 1.05] });
  piece(body, G.sphere(0.2, 12, 10), IRON_DARK, { pos: [0, 0.0, 0.18], scale: [1, 1, 0.8], outline: 0.012 });
  piece(body, G.sphere(0.1, 10, 8), glow, { pos: [0, 0.0, 0.32], glow: true, outline: 0.01 });
  for (const s of [-1, 1]) {
    piece(body, G.box(0.14, 0.12, 0.34), IRON, { pos: [0.36 * s, -0.04, 0.05], outline: 0.015 });
    piece(body, G.cylZ(0.035, 0.035, 0.2, 8), IRON_DARK, { pos: [0.36 * s, -0.04, 0.28], outline: 0.008 });
    piece(body, G.cylZ(0.025, 0.025, 0.02, 8), glow, { pos: [0.36 * s, -0.04, 0.38], glow: true, outline: 0 });
  }
  piece(body, G.cone(0.14, 0.2, 8), IRON_DARK, { pos: [0, -0.32, 0], rot: [Math.PI, 0, 0], outline: 0.012 });
  piece(body, G.cone(0.08, 0.18, 8), glow, { pos: [0, -0.44, 0], rot: [Math.PI, 0, 0], glow: true, outline: 0 });
  piece(body, G.cyl(0.012, 0.012, 0.3, 4), IRON_DARK, { pos: [0.1, 0.4, -0.05], outline: 0 });
  piece(body, G.sphere(0.03, 6, 4), 0xff4a3a, { pos: [0.1, 0.56, -0.05], glow: true, outline: 0 });
  piece(spin[0], G.torus(0.46, 0.035, Math.PI * 2, 5, 28), shell, { rot: [Math.PI / 2, 0, 0], outline: 0.012 });
  for (let i = 0; i < 3; i++) piece(spin[0], G.box(0.1, 0.05, 0.1), glow, { pos: [Math.cos(i * 2.09) * 0.46, 0, Math.sin(i * 2.09) * 0.46], glow: true, outline: 0 });
  piece(spin[1], G.torus(0.34, 0.02, Math.PI * 2, 4, 24), glow, { rot: [Math.PI / 2, 0, 0], glow: true, outline: 0 });
  if (arc) for (let i = 0; i < 4; i++) piece(body, G.torus(0.08, 0.015, Math.PI * 2, 4, 10), glow, { pos: [0, 0.3 - i * 0.04, -0.2], rot: [0.3, 0, 0], glow: true, outline: 0 });
  return finish(rig);
}

function wraith(kind) {
  const shade_ = kind === 'shade';
  const cloak = shade_ ? 0x8aa8c4 : 0x2a2234;
  const inner = shade_ ? 0xd8eef8 : 0x140e1c;
  const glow = shade_ ? 0xbff4ff : VOID;
  const rig = hoverSkeleton({ bodyY: 1.25, height: 2.0, arms: { x: 0.24, y: 0.18, z: 0.05, upper: 0.3, fore: 0.3 }, robe: [0, -0.15, 0] });
  const { body, arms, robe } = rig;
  piece(body, G.sphere(0.24, 14, 10), cloak, { pos: [0, 0.1, 0], scale: [1.1, 1.2, 0.95] });
  piece(body, G.hood(0.24, 1.1), cloak, { pos: [0, 0.48, 0.02], scale: [1.05, 1.1, 1.1] });
  piece(body, G.sphere(0.17, 12, 10), inner, { pos: [0, 0.48, 0.08], outline: 0 });
  for (const s of [-1, 1]) piece(body, G.sphere(0.035, 8, 6), glow, { pos: [0.06 * s, 0.5, 0.22], glow: true, outline: 0 });
  piece(body, G.torus(0.2, 0.02, Math.PI * 2, 4, 14), glow, { pos: [0, 0.12, 0], rot: [Math.PI / 2, 0, 0], glow: true, outline: 0 });
  // Robe tail: tattered strips trailing below.
  piece(robe, G.cone(0.32, 1.1, 10), cloak, { pos: [0, -0.5, 0], rot: [Math.PI, 0, 0], scale: [1, 1, 0.9] });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    piece(robe, G.box(0.08, 0.5, 0.02), shade(cloak, 0.85), { pos: [Math.cos(a) * 0.18, -1.05 - (i % 2) * 0.1, Math.sin(a) * 0.16], rot: [Math.sin(a) * 0.3, -a, Math.cos(a) * 0.3], outline: 0.008 });
  }
  for (let i = 0; i < 4; i++) piece(robe, G.torus(0.06, 0.015, Math.PI * 2, 4, 8), 0x5a5a66, { pos: [0.22, -0.2 - i * 0.12, 0.05], rot: [0, i * 1.2, 0], outline: 0 });
  for (const [arm, s] of arms.map((a, i) => [a, i === 0 ? 1 : -1])) {
    seg(arm.upper, 0.3, 0.07, 0.06, cloak);
    seg(arm.fore, 0.3, 0.06, 0.03, inner, { outline: 0.01 });
    for (let k = 0; k < 3; k++) piece(arm.hand, G.cone(0.015, 0.16, 4), BONE, { pos: [(k - 1) * 0.03, -0.06, 0.02], rot: [Math.PI, 0, (k - 1) * 0.3], outline: 0.006 });
    piece(arm.hand, G.sphere(0.05, 8, 6), glow, { pos: [0, 0, 0.02], glow: true, outline: 0 });
    void s;
  }
  return finish(rig);
}

// ======================================================================== registry
export const MODELS = {
  'goblin:cutter': () => goblinKind('cutter'),
  'goblin:scrapper': () => goblinKind('scrapper'),
  'goblin:shield': () => goblinKind('shield'),
  'goblin:ironclad': () => goblinKind('ironclad'),
  'goblin:sapper': () => goblinKind('sapper'),
  'goblin:firebomber': () => goblinKind('firebomber'),
  'goblin:shaman': () => goblinKind('shaman'),
  'goblin:spark': () => goblinKind('spark'),
  ogre: () => buildOgre(),
  'ogre:boss': () => buildOgre({ boss: true, skin: 0xb5473a, metal: 0x4a4a52 }),
  'hollow:husk': () => hollowBiped('husk'),
  'hollow:bloated': () => hollowBiped('bloated'),
  'hollow:archer': () => hollowBiped('archer'),
  'hollow:marksman': () => hollowBiped('marksman'),
  'hollow:revenant': () => hollowBiped('revenant'),
  'hollow:captain': () => hollowBiped('captain'),
  'hollow:king': () => hollowBiped('king'),
  'hollow:wraith': () => wraith('wraith'),
  'hollow:shade': () => wraith('shade'),
  'construct:sentry': () => sentry('sentry'),
  'construct:arcsentry': () => sentry('arcsentry'),
  'construct:stalker': () => constructBiped('stalker'),
  'construct:bulwark': () => constructBiped('bulwark'),
  'construct:siege': () => constructBiped('siege'),
  'construct:colossus': () => constructBiped('colossus'),
  'beast:wolf': () => wolf('wolf'),
  'beast:frostwolf': () => wolf('frostwolf'),
  'beast:alpha': () => wolf('alpha'),
  'beast:tusker': () => tusker('tusker'),
  'beast:ironhide': () => tusker('ironhide'),
  'beast:ursa': () => ursa(),
  'beast:spider': () => spider('spider'),
  'beast:venom': () => spider('venom'),
};

// Re-finds the bones of any rig kind on a cloned model.
export function bindAny(model) {
  const get = (n) => model.getObjectByName(`rig:${n}`) ?? null;
  const legCfg = model.userData.legCfg;
  if (legCfg) {
    const tail = [];
    for (let i = 0; get(`tail${i}`); i++) tail.push(get(`tail${i}`));
    return {
      model, kind: 'legs', cfg: legCfg, height: model.userData.rigHeight,
      body: get('body'), chest: get('chest'), neck: get('neck'), head: get('head'), jaw: get('jaw'), tail,
      legs: legCfg.legs.map((lc, i) => ({ upper: get(`leg${i}.upper`), lower: get(`leg${i}.lower`), foot: get(`leg${i}.foot`), cfg: lc })),
    };
  }
  const hoverCfg = model.userData.hoverCfg;
  if (hoverCfg) {
    const spin = [];
    for (let i = 0; get(`spin${i}`); i++) {
      const b = get(`spin${i}`);
      b.userData.rate = hoverCfg.spin[i].rate;
      spin.push(b);
    }
    const arm = (s) => (get(`arm${s}.upper`) ? { upper: get(`arm${s}.upper`), fore: get(`arm${s}.fore`), hand: get(`arm${s}.hand`) } : null);
    const arms = arm('L') ? [arm('L'), arm('R')] : null;
    return { model, kind: 'hover', cfg: hoverCfg, height: model.userData.rigHeight, body: get('body'), spin, arms, robe: get('robe') };
  }
  return { ...bindRig(model), kind: 'biped' };
}
