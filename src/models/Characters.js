// Character model builders. All face +Z, right side is -X, feet at y=0.
// Every character is a jointed skeleton of THREE.Bones:
//   hips → spine → chest → head → skull
//   chest → arm{L,R}.upper → fore → hand        hips → leg{L,R}.thigh → shin → foot
// Limb segments hang along local -Y in the bind pose (knees fold back, elbows forward). Pieces are
// modelled onto the bones and baked into skinned meshes (ModelKit.bakeSkinned) — rigid per bone,
// except humans' lofted skin and clothes, which blend across the joints (models/Human.js); the
// procedural Animator (anim/Animator.js) drives the bones. Weapons attach to rig.weaponMount,
// whose +Z runs out of the fist and +Y along the back of the hand.
import * as THREE from 'three';
import { piece, bakeSkinned, shade, G } from '../render/ModelKit.js';
import { shellGeometry, onShell, sliceProfile } from '../render/Shell.js';
import { applyArmor, armorHeadFlags, ARMOR_BACK } from './ArmorForms.js';
import {
  HUMAN, BODY, LANDMARKS, fist, torsoPiece, dressArm, dressLeg, buildHead, buildHair, buildBeard, headwear,
} from './Human.js';

export { HUMAN, BODY, fist };

const INK = 0x14101c;
const TINKER = 0x9aff3a; // goblin junk-tech glow
const FORGE = 0xff8a2a;  // ogre forge-core glow
const WHITE = 0xfaf6ee;

// ---------------------------------------------------------------- skeleton
export function bone(parent, name, pos = [0, 0, 0]) {
  const b = new THREE.Bone();
  b.name = `rig:${name}`;
  b.position.fromArray(pos);
  parent.add(b);
  return b;
}

// Builds the bone hierarchy for proportions P. Every biped (hero, NPCs, goblins, ogres) shares it,
// so one animator drives them all.
export function skeleton(P) {
  const model = new THREE.Group();
  const hips = bone(model, 'hips', [0, P.hipY, 0]);
  const spine = bone(hips, 'spine', [0, P.spine, 0]);
  const chest = bone(spine, 'chest', [0, P.chest, 0]);
  const head = bone(chest, 'head', [0, P.neck, P.neckZ ?? 0]);
  const skull = bone(head, 'skull', [0, P.skull, 0.02]);
  const arm = (side, s) => {
    const upper = bone(chest, `arm${side}.upper`, [P.shoulderX * s, P.shoulderY, 0]);
    const fore = bone(upper, `arm${side}.fore`, [0, -P.upper, 0]);
    const hand = bone(fore, `arm${side}.hand`, [0, -P.fore, 0]);
    return { upper, fore, hand };
  };
  const leg = (side, s) => {
    const thigh = bone(hips, `leg${side}.thigh`, [P.hipX * s, -P.hipDrop, 0]);
    const shin = bone(thigh, `leg${side}.shin`, [0, -P.thigh, 0]);
    const foot = bone(shin, `leg${side}.foot`, [0, -P.shin, 0]);
    return { thigh, shin, foot };
  };
  const armL = arm('L', 1);
  const armR = arm('R', -1);
  const mountIn = (hand, name) => {
    const g = new THREE.Group();
    g.name = `rig:${name}`;
    g.position.set(0, -P.grip, 0);
    g.rotation.x = Math.PI / 2; // weapon +Z → down the hand, weapon +Y → back of the hand
    hand.add(g);
    return g;
  };
  const dims = {
    hipY: P.hipY, hipX: P.hipX, hipDrop: P.hipDrop, thigh: P.thigh, shin: P.shin, ankle: P.ankle,
    upper: P.upper, fore: P.fore, grip: P.grip,
  };
  model.userData.rigDims = dims;
  model.userData.rigHeight = P.height;
  return {
    model, hips, spine, chest, torso: chest, head, skull, armL, armR,
    legs: [leg('L', 1), leg('R', -1)],
    weaponMount: mountIn(armR.hand, 'weaponMount'), offMount: mountIn(armL.hand, 'offMount'),
    cape: null, arrow: null, dims, height: P.height,
  };
}

// Cape bones: one chain per column across the width, each running down the cloth's rest points
// (rest[col][joint], chest-local; the last joint is the hem). Returns the bones flattened
// column by column, the order the cape's skin indices use.
export function makeCapeGrid(rig, rest) {
  const bones = rest.map((col, c) => {
    const chain = [];
    let parent = rig.chest;
    for (let r = 0; r < col.length - 1; r++) {
      const at = r === 0 ? col[0] : col[r].clone().sub(col[r - 1]);
      const b = bone(parent, `cape${c}.${r}`, at.toArray());
      chain.push(b);
      parent = b;
    }
    return chain;
  });
  rig.capeGrid = { cols: rest.length, rows: rest[0].length - 1, bones, rest };
  rig.capeBones = bones.flat();
  return rig.capeBones;
}

// Re-finds rig bones on a cloned model (enemy templates are built once and cloned).
export function bindRig(model) {
  const get = (n) => model.getObjectByName(`rig:${n}`) ?? null;
  const arm = (s) => ({ upper: get(`arm${s}.upper`), fore: get(`arm${s}.fore`), hand: get(`arm${s}.hand`) });
  const leg = (s) => ({ thigh: get(`leg${s}.thigh`), shin: get(`leg${s}.shin`), foot: get(`leg${s}.foot`) });
  const capeA = get('capeA');
  return {
    model, hips: get('hips'), spine: get('spine'), chest: get('chest'), torso: get('chest'),
    head: get('head'), skull: get('skull'), armL: arm('L'), armR: arm('R'), legs: [leg('L'), leg('R')],
    weaponMount: get('weaponMount'), offMount: get('offMount'), arrow: get('arrow'),
    cape: capeA ? [capeA, get('capeB')] : null,
    dims: model.userData.rigDims, height: model.userData.rigHeight,
  };
}

export function finish(rig) {
  const { skeleton: sk } = bakeSkinned(rig.model);
  rig.skeleton = sk;
  return rig;
}

// ---------------------------------------------------------------- shared parts
export function eyes(skull, { x = 0.085, y = 0.025, z = 0.198, r = 0.042, iris = 0x3f8fe0, sclera = WHITE, pupil = INK, slit = false, lash = true }) {
  for (const s of [-1, 1]) {
    piece(skull, G.sphere(r, 14, 10), sclera, { pos: [x * s, y, z], scale: [1.1, 1, 0.45], glow: true, outline: 0 });
    piece(skull, G.cylZ(r * 0.6, r * 0.6, 0.01, 14), iris, { pos: [x * s * 0.97, y - 0.003, z + r * 0.42], glow: true, outline: 0 });
    piece(skull, slit ? G.box(r * 0.22, r * 1.1, 0.01) : G.cylZ(r * 0.3, r * 0.3, 0.01, 10), pupil, { pos: [x * s * 0.97, y - 0.003, z + r * 0.46], glow: true, outline: 0 });
    piece(skull, G.box(r * 0.28, r * 0.28, 0.004), WHITE, { pos: [x * s * 0.97 + r * 0.22, y + r * 0.22, z + r * 0.5], glow: true, outline: 0 });
    if (lash) piece(skull, G.box(r * 2.3, r * 0.34, 0.03), INK, { pos: [x * s, y + r * 0.82, z + 0.004], rot: [0, 0, 0.1 * s], glow: true, outline: 0 });
  }
}

// ---------------------------------------------------------------- humanoid (hero + NPCs)
// The body, head, hands and boots are models/Human.js; this dresses it from a look: trousers,
// an undershirt under an open tech jacket, belt and pouches, and the kit (bandolier, scarf, pack,
// pauldrons, holster, apron) — plus hats and goggles, which (like armour helms) are modelled in
// the headwear space (Human.headwear).
export const HERO_LOOK = {
  skin: 0xf3cba5, hair: 0x5a3a26, hairStyle: 'spiky', eye: 0x3f8fe0, top: 0x3d6fe0, topDark: 0x2b4fa8, trim: 0xf0c75e,
  pants: 0x2a2f45, boots: 0x5a3622, leather: 0x7a4a2a, gloves: 0x3a2a24, metal: 0xc9d1dc, scarf: 0xd94040,
  pauldrons: true, strap: true, glow: 0x6ae8ff, pack: true, comm: true, holster: true,
};

export function buildHumanoid(look = HERO_LOOK, gear = null) {
  const L = { ...HERO_LOOK, cape: null, scarf: null, pauldrons: false, strap: false, comm: false, holster: false, ...look };
  let flags = { hidesHair: false, hidesFace: false };
  if (gear?.head) { L.hat = null; flags = armorHeadFlags(gear.head); }
  if (gear?.chest) { L.pauldrons = false; L.strap = false; L.pack = false; }
  if (gear?.back || L.cape) L.pack = false;
  const rig = skeleton(HUMAN);
  const { hips, spine, chest, skull } = rig;
  rig.headwear = headwear(skull);
  const gloves = L.gloves ?? L.leather;
  const darkLeather = shade(L.leather, 0.78);
  const { HIPS, NECK } = LANDMARKS;

  // --- skin and clothes: trousers, undershirt, neck, and an open jacket over them
  const OPEN = { thetaStart: 0.3, thetaLength: Math.PI * 2 - 0.6 };
  torsoPiece(rig, L.pants, { y1: HIPS + 0.08, inflate: 0.008, caps: [true, false] });
  torsoPiece(rig, L.topDark, { y0: HIPS + 0.04, y1: NECK - 0.015, inflate: 0.004 });
  torsoPiece(rig, L.skin, { y0: NECK - 0.05 }, { outline: 0.012 });
  torsoPiece(rig, L.top, { y0: HIPS + 0.055, y1: NECK - 0.035, inflate: 0.016, ...OPEN });
  torsoPiece(rig, shade(L.top, 0.8), { y0: HIPS + 0.05, y1: HIPS + 0.085, inflate: 0.024, ...OPEN });

  // --- belt and pouches
  const Pv = BODY.pelvis;
  piece(hips, shellGeometry(sliceProfile(Pv, 0.0, 0.065), { inflate: 0.017 }), L.leather, { outline: 0.016 });
  const buckle = onShell(Pv, 0.032, 0, 0.026);
  piece(hips, G.box(0.09, 0.065, 0.026), L.trim, { pos: buckle.pos, rot: [0, buckle.yaw, 0], outline: 0.012 });
  piece(hips, G.box(0.04, 0.03, 0.012), L.glow, { pos: onShell(Pv, 0.032, 0, 0.041).pos, rot: [0, buckle.yaw, 0], glow: true, outline: 0 });
  for (const s of [-1, 1]) {
    const pouch = onShell(Pv, -0.01, 0.95 * s, 0.045);
    piece(hips, G.box(0.07, 0.09, 0.06), darkLeather, { pos: pouch.pos, rot: [0, pouch.yaw, 0], outline: 0.012 });
    const flap = onShell(Pv, 0.037, 0.95 * s, 0.049);
    piece(hips, G.box(0.075, 0.024, 0.068), L.leather, { pos: flap.pos, rot: [0.15, flap.yaw, 0], outline: 0 });
  }
  const back = onShell(Pv, 0.0, Math.PI, 0.038);
  piece(hips, G.box(0.14, 0.08, 0.055), darkLeather, { pos: back.pos, rot: [0, back.yaw, 0], outline: 0.012 });

  // --- jacket details: collar open at the throat, piping, pocket and badge
  const C = BODY.chest;
  piece(chest, shellGeometry([
    { y: 0.25, w: 0.17, zf: 0.1, zb: 0.108, n: 2.3 }, { y: 0.3, w: 0.112, zf: 0.08, zb: 0.09, n: 2.2 }, { y: 0.35, w: 0.094, zf: 0.084, zb: 0.084, n: 2.1 },
  ], { thetaStart: 0.55, thetaLength: Math.PI * 2 - 1.1, inflate: 0.01 }), L.topDark, { outline: 0.014 });
  for (const s of [-1, 1]) {
    const pts = [];
    for (const y of [0.26, 0.18, 0.08, -0.02, -0.1]) pts.push(onShell(C, y, 0.3 * s, 0.018).pos);
    piece(chest, G.tube(pts, 0.007, 20, 5), L.trim, { outline: 0 });
  }
  const pocket = onShell(C, 0.1, -0.62, 0.018);
  piece(chest, G.box(0.085, 0.065, 0.018), shade(L.top, 0.8), { pos: pocket.pos, rot: [-0.1, pocket.yaw, 0], outline: 0.01 });
  const badge = onShell(C, 0.11, 0.62, 0.02);
  piece(chest, G.cylZ(0.036, 0.036, 0.018, 6), L.metal, { pos: badge.pos, rot: [-0.1, badge.yaw, 0], outline: 0.01 });
  piece(chest, G.cylZ(0.023, 0.023, 0.018, 6), L.glow, { pos: onShell(C, 0.11, 0.62, 0.029).pos, rot: [-0.1, badge.yaw, 0], glow: true, outline: 0 });
  if (L.belly) piece(spine, G.sphere(0.17, 16, 12), L.top, { pos: [0, 0.05, 0.07], scale: [1.05, 0.95, 0.9] });
  if (L.apron) {
    const z = L.belly ? 0.25 : 0.145;
    piece(spine, G.box(0.34, 0.6, 0.025), L.apron, { pos: [0, -0.12, z], rot: [L.belly ? -0.05 : -0.06, 0, 0], outline: 0.015 });
    piece(spine, G.box(0.13, 0.09, 0.02), shade(L.apron, 0.8), { pos: [0.07, -0.17, z + 0.02], outline: 0.008 });
  }
  if (L.strap) {
    // Bandolier from the left shoulder across to the right hip, riding the jacket.
    const pts = [[0.62, 0.27], [0.45, 0.18], [0.05, 0.06], [-0.35, -0.03], [-0.7, -0.09]].map(([t, y]) => onShell(C, y, t, 0.03).pos);
    piece(chest, G.tube(pts, 0.019, 24, 6), L.leather, { outline: 0.01 });
    for (const [t, y] of [[0.42, 0.17], [0.05, 0.06], [-0.33, -0.02]]) {
      const st = onShell(C, y, t, 0.046);
      piece(chest, G.box(0.034, 0.044, 0.022), L.metal, { pos: st.pos, rot: [0, st.yaw, 0.55], outline: 0.008 });
    }
  }
  if (L.scarf) {
    piece(chest, G.torus(0.105, 0.035, Math.PI * 2, 6, 16), L.scarf, { pos: [0, 0.3, 0.005], rot: [Math.PI / 2, 0, 0], scale: [1, 0.85, 1], outline: 0.015 });
  }
  if (L.pack) {
    const pk = onShell(C, 0.1, Math.PI, 0.065);
    piece(chest, G.box(0.28, 0.32, 0.12), 0x3c414c, { pos: pk.pos });
    piece(chest, G.box(0.3, 0.045, 0.13), 0x2a2e36, { pos: [pk.pos[0], 0.25, pk.pos[2]], outline: 0.01 });
    for (const s of [-1, 1]) piece(chest, G.cyl(0.045, 0.045, 0.27, 10), L.glow, { pos: [0.075 * s, 0.09, pk.pos[2] - 0.075], glow: true, outline: 0.008 });
    piece(chest, G.cyl(0.007, 0.007, 0.3, 4), L.metal, { pos: [-0.11, 0.39, pk.pos[2] - 0.03], outline: 0 });
    piece(chest, G.sphere(0.016, 6, 4), L.glow, { pos: [-0.11, 0.55, pk.pos[2] - 0.03], glow: true, outline: 0 });
  }

  // --- head: face, hair, beard; hats, goggles and the comm in the headwear space
  buildHead(skull, L, flags);
  if (!flags.hidesHair) buildHair(skull, L);
  if (L.beard && !flags.hidesFace) buildBeard(skull, L);
  const hw = rig.headwear;
  buildHat(hw, L);
  if (L.goggles) {
    piece(hw, G.torus(0.25, 0.02, Math.PI * 2, 4, 18), 0x3a2a1e, { pos: [0, 0.13, 0.02], rot: [Math.PI / 2 - 0.35, 0, 0], scale: [1.05, 1, 1], outline: 0.008 });
    for (const s of [-1, 1]) {
      piece(hw, G.cylZ(0.055, 0.055, 0.06, 10), 0xb08a3e, { pos: [0.09 * s, 0.17, 0.21], rot: [-0.35, 0, 0], outline: 0.01 });
      piece(hw, G.cylZ(0.04, 0.04, 0.02, 10), L.glow ?? 0xffb347, { pos: [0.09 * s, 0.18, 0.245], rot: [-0.35, 0, 0], glow: true, outline: 0 });
    }
  }
  if (L.comm && !gear?.head) {
    piece(hw, G.box(0.035, 0.07, 0.06), L.metal, { pos: [-0.222, -0.01, 0], outline: 0.01 });
    piece(hw, G.box(0.01, 0.03, 0.02), L.glow, { pos: [-0.241, 0.0, 0.0], glow: true, outline: 0 });
  }

  // --- limbs
  for (const s of [1, -1]) {
    dressArm(rig, s, L, { gloves, bare: !gear?.hands });
    dressLeg(rig, s, L, { bare: !gear?.legs });
  }

  // --- cape from the look (NPCs); the hero's comes from the Back slot via applyArmor
  if (L.cape && !gear?.back) {
    ARMOR_BACK.cloak.build(rig, { main: L.cape, accent: L.glow ?? L.trim, pal: { metal: L.metal, secondary: L.topDark, primary: L.top } });
  }

  if (gear) applyArmor(rig, gear);
  return finish(rig);
}

function buildHat(head, L) {
  const c = L.hatColor ?? L.topDark;
  switch (L.hat) {
    case 'hood':
      piece(head, G.hood(0.33), c, { pos: [0, 0.03, -0.04], scale: [1, 1.05, 1.05] });
      piece(head, G.torus(0.22, 0.012, Math.PI * 1.2, 4, 16), L.glow ?? 0xb0e0ff, { pos: [0, 0.03, 0.06], rot: [0, 0, -0.1 * Math.PI], glow: true, outline: 0 });
      piece(head, G.cone(0.12, 0.3, 8), c, { pos: [0, 0.05, -0.32], rot: [-1.9, 0, 0] });
      break;
    case 'helmet':
      piece(head, G.dome(0.27, 16, 8, 0.55), L.metal, { pos: [0, 0.02, 0] });
      piece(head, G.box(0.3, 0.04, 0.03), L.glow ?? 0x6ae8ff, { pos: [0, 0.1, 0.25], glow: true, outline: 0.006 });
      piece(head, G.torus(0.265, 0.025, Math.PI * 2, 5, 18), shade(L.metal, 0.7), { pos: [0, 0.02, 0], rot: [Math.PI / 2, 0, 0], outline: 0.012 });
      piece(head, G.box(0.04, 0.16, 0.04), L.metal, { pos: [0, -0.02, 0.27], outline: 0.012 });
      piece(head, G.cone(0.04, 0.16, 6), L.trim, { pos: [0, 0.3, 0], outline: 0.012 });
      break;
    case 'wizard':
      piece(head, G.cyl(0.42, 0.42, 0.03, 20), c, { pos: [0, 0.14, 0] });
      piece(head, G.cone(0.25, 0.6, 12), c, { pos: [0, 0.44, -0.04], rot: [-0.25, 0, 0.15] });
      piece(head, G.cyl(0.26, 0.26, 0.06, 16), L.trim, { pos: [0, 0.18, 0], outline: 0.012 });
      break;
    case 'cap':
      piece(head, G.dome(0.255, 14, 6, 0.5), c, { pos: [0, 0.04, 0] });
      piece(head, G.box(0.26, 0.025, 0.16), c, { pos: [0, 0.06, 0.26], rot: [0.15, 0, 0], outline: 0.012 });
      break;
  }
}

// ---------------------------------------------------------------- goblin (grunt / archer)
const GOBLIN = {
  hipY: 0.66, hipX: 0.12, hipDrop: 0.03, thigh: 0.27, shin: 0.28, ankle: 0.08,
  spine: 0.06, chest: 0.2, neck: 0.3, neckZ: 0.06, skull: 0.17, shoulderX: 0.27, shoulderY: 0.22,
  upper: 0.25, fore: 0.23, grip: 0.06, height: 1.45,
};

// weapon: club (default) | none; extra(rig, colours) adds kit (shields, knives, bombs, staves,
// masks, packs) before the model is baked.
export function buildGoblin({ archer = false, skin = 0x7fb24a, cloth = 0x8a5a3a, accent = 0xc4453a, weapon = 'club', extra = null, pack = true } = {}) {
  const rig = skeleton(GOBLIN);
  const { hips, spine, chest, skull } = rig;
  const skinDark = shade(skin, 0.75);
  const skinLight = shade(skin, 1.12);
  const scrap = 0x8a8f99;
  const strap = 0x4a2c1a;

  // hips: rope belt, loincloth, scrap tassets
  piece(hips, G.sphere(0.2, 14, 10), cloth, { pos: [0, -0.05, 0], scale: [1.05, 0.7, 0.85] });
  piece(hips, G.cyl(0.215, 0.215, 0.06, 14), strap, { pos: [0, 0.04, 0], scale: [1, 1, 0.85], outline: 0.012 });
  piece(hips, G.box(0.18, 0.26, 0.03), cloth, { pos: [0, -0.14, 0.18], rot: [-0.12, 0, 0] });
  piece(hips, G.box(0.2, 0.22, 0.03), shade(cloth, 0.8), { pos: [0, -0.12, -0.17], rot: [0.12, 0, 0] });
  for (const s of [-1, 1]) piece(hips, G.box(0.1, 0.12, 0.02), scrap, { pos: [0.17 * s, -0.06, 0.06], rot: [0, 0.9 * s, 0.12 * s], outline: 0.01 });
  piece(hips, G.box(0.06, 0.05, 0.03), TINKER, { pos: [0, 0.04, 0.185], glow: true, outline: 0.008 });

  // spine: pot belly
  piece(spine, G.sphere(0.25, 16, 12), skinLight, { pos: [0, 0.1, 0.05], scale: [1, 0.95, 0.92] });
  piece(spine, G.box(0.006, 0.08, 0.006), skinDark, { pos: [0, 0.06, 0.28], glow: true, outline: 0 });

  // chest: barrel chest, harness, gear on the back
  piece(chest, G.sphere(0.26, 16, 12), skin, { pos: [0, 0.08, -0.02], scale: [1.08, 0.95, 0.9] });
  for (const s of [-1, 1]) piece(chest, G.sphere(0.11, 10, 8), skin, { pos: [0.18 * s, 0.2, -0.04] });
  piece(chest, G.box(0.05, 0.55, 0.03), strap, { pos: [0, 0.05, 0.22], rot: [0, 0, 0.7], outline: 0.012 });
  piece(chest, G.cyl(0.07, 0.085, 0.12, 10), skin, { pos: [0, 0.3, 0.04], outline: 0.012 });
  if (archer) {
    piece(chest, G.cyl(0.08, 0.07, 0.48, 10), 0x6a3f24, { pos: [0.1, 0.1, -0.28], rot: [0.25, 0, -0.4] });
    for (const [x, z] of [[0.2, -0.34], [0.24, -0.3], [0.16, -0.28]]) {
      piece(chest, G.cyl(0.008, 0.008, 0.2, 4), 0xd8c9a3, { pos: [x, 0.4, z], rot: [0.25, 0, -0.4], outline: 0 });
      piece(chest, G.box(0.05, 0.08, 0.005), accent, { pos: [x + 0.04, 0.48, z - 0.02], rot: [0.25, 0, -0.4], outline: 0.008 });
    }
  } else if (pack) {
    piece(chest, G.box(0.3, 0.34, 0.16), 0x5a4a3a, { pos: [0, 0.1, -0.3], rot: [0.15, 0, 0] });
    piece(chest, G.cyl(0.06, 0.06, 0.28, 8), TINKER, { pos: [0.08, 0.12, -0.4], rot: [0.15, 0, 0], glow: true, outline: 0.01 });
    piece(chest, G.cyl(0.015, 0.015, 0.3, 4), 0x2a2a2a, { pos: [-0.1, 0.34, -0.34], rot: [0.5, 0, 0.3], outline: 0 });
    piece(chest, G.box(0.08, 0.06, 0.04), scrap, { pos: [-0.08, 0.02, -0.39], rot: [0.15, 0, 0], outline: 0.008 });
  }

  // head: big skull, long swept ears, hooked nose, toothy grin, goggles
  piece(skull, G.sphere(0.25, 18, 14), skin, { scale: [1.1, 0.95, 1] });
  piece(skull, G.sphere(0.2, 14, 10), skin, { pos: [0, -0.1, 0.06], scale: [1.05, 0.62, 0.95] });
  for (const s of [-1, 1]) {
    piece(skull, G.cone(0.08, 0.46, 6), skin, { pos: [0.33 * s, 0.07, -0.05], rot: [0.25, 0, -(Math.PI / 2 - 0.4) * s] });
    piece(skull, G.cone(0.045, 0.3, 6), shade(skin, 1.25), { pos: [0.31 * s, 0.07, -0.02], rot: [0.25, 0, -(Math.PI / 2 - 0.4) * s], outline: 0 });
    piece(skull, G.torus(0.025, 0.007, Math.PI * 2, 4, 8), scrap, { pos: [0.4 * s, 0.03, -0.08], rot: [0, Math.PI / 2, 0], outline: 0 });
  }
  piece(skull, G.coneZ(0.06, 0.26, 6), skin, { pos: [0, -0.06, 0.3], rot: [0.75, 0, 0] });
  piece(skull, G.sphere(0.05, 10, 8), skin, { pos: [0, -0.01, 0.245], outline: 0.01 });
  piece(skull, G.sphere(0.03, 8, 6), skinDark, { pos: [0, -0.15, 0.37], outline: 0.008 });
  piece(skull, G.box(0.34, 0.06, 0.09), skinDark, { pos: [0, 0.1, 0.18], rot: [-0.2, 0, 0], outline: 0.012 });
  eyes(skull, { x: 0.095, y: 0.035, z: 0.222, r: 0.045, sclera: 0xffe94a, iris: 0xff9a1a, pupil: 0x2a0a00, slit: true, lash: false });
  piece(skull, G.box(0.22, 0.04, 0.02), 0x2a0a10, { pos: [0, -0.13, 0.252], glow: true, outline: 0 });
  for (const x of [-0.08, -0.03, 0.03, 0.08]) piece(skull, G.cone(0.016, 0.055, 4), WHITE, { pos: [x, -0.105 - Math.abs(x) * 0.1, 0.256], rot: [Math.PI, 0, 0], outline: 0 });
  for (const s of [-1, 1]) piece(skull, G.cone(0.02, 0.07, 4), WHITE, { pos: [0.1 * s, -0.15, 0.25], outline: 0.006 });
  if (archer) {
    piece(skull, G.hood(0.29, 1.05), cloth, { pos: [0, 0.06, -0.05], scale: [1.08, 0.95, 1] });
  } else {
    for (let i = 0; i < 4; i++) piece(skull, G.cone(0.05, 0.2 - i * 0.02, 5), INK, { pos: [0, 0.24 - i * 0.02, 0.05 - i * 0.09], rot: [-0.3 - i * 0.25, 0, 0] });
  }
  piece(skull, G.torus(0.25, 0.022, Math.PI * 2, 4, 18), 0x4a3a2a, { pos: [0, 0.13, 0.02], rot: [Math.PI / 2 - 0.35, 0, 0], scale: [1.08, 1, 1], outline: 0.008 });
  for (const s of [-1, 1]) {
    piece(skull, G.cylZ(0.06, 0.06, 0.06, 10), scrap, { pos: [0.09 * s, 0.17, 0.2], rot: [-0.35, 0, 0], outline: 0.01 });
    piece(skull, G.cylZ(0.045, 0.045, 0.02, 10), TINKER, { pos: [0.09 * s, 0.18, 0.235], rot: [-0.35, 0, 0], glow: true, outline: 0 });
  }

  // limbs: wiry arms with clawed hands, knobbly legs, big flat feet
  for (const [arm, s] of [[rig.armL, 1], [rig.armR, -1]]) {
    piece(arm.upper, G.sphere(0.085, 10, 8), skin, { pos: [0.01 * s, -0.01, 0] });
    piece(arm.upper, G.cyl(0.07, 0.058, 0.22, 10), skin, { pos: [0, -0.13, 0] });
    if (s < 0 && !archer) {
      piece(arm.upper, G.dome(0.12, 10, 5), scrap, { pos: [0.02 * s, 0.02, 0], rot: [0, 0, -0.6 * s] });
      piece(arm.upper, G.cone(0.025, 0.1, 4), 0xb8bcc6, { pos: [0.08 * s, 0.1, 0], rot: [0, 0, -0.6 * s], outline: 0.008 });
    }
    piece(arm.fore, G.sphere(0.06, 10, 8), skinDark, { outline: 0.01 });
    piece(arm.fore, G.cyl(0.058, 0.05, 0.2, 10), skin, { pos: [0, -0.1, 0] });
    piece(arm.fore, G.cyl(0.064, 0.06, 0.07, 10), strap, { pos: [0, -0.18, 0], outline: 0.01 });
    fist(arm.hand, skinDark, skin, s, 0.95, { claws: 0xe8e0d0 });
  }
  rig.legs.forEach((leg, i) => {
    const s = i === 0 ? 1 : -1;
    piece(leg.thigh, G.sphere(0.09, 10, 8), skin, { pos: [0, -0.01, 0] });
    piece(leg.thigh, G.cyl(0.085, 0.065, 0.25, 10), skin, { pos: [0, -0.13, 0] });
    piece(leg.shin, G.sphere(0.07, 10, 8), skinDark, { pos: [0, 0, 0.01], outline: 0.01 });
    piece(leg.shin, G.cyl(0.062, 0.05, 0.25, 10), skin, { pos: [0, -0.13, 0] });
    piece(leg.shin, G.cyl(0.066, 0.062, 0.06, 10), strap, { pos: [0, -0.2, 0], outline: 0.008 });
    piece(leg.foot, G.sphere(0.06, 10, 8), skinDark, { scale: [1, 0.8, 1] });
    piece(leg.foot, G.box(0.15, 0.07, 0.22), skinDark, { pos: [0, -0.045, 0.07] });
    for (const x of [-0.045, 0, 0.045]) piece(leg.foot, G.coneZ(0.022, 0.07, 4), WHITE, { pos: [x * s + 0.0, -0.06, 0.205], outline: 0.006 });
  });

  // weapon hand: scrap club, or an arc-bow with a nocked bolt
  const W = rig.weaponMount;
  if (archer) {
    const bow = G.torus(0.48, 0.025, Math.PI, 5, 18).rotateZ(-Math.PI / 2).rotateY(-Math.PI / 2);
    // Held at the grip (bow apex); the string sits 0.48 behind the fist, where the off hand draws.
    piece(W, bow, 0x6a3f24, { pos: [0, 0, -0.48] });
    for (const y of [-0.48, 0.48]) piece(W, G.sphere(0.035, 6, 4), accent, { pos: [0, y, -0.48], outline: 0.01 });
    piece(W, G.box(0.01, 0.96, 0.01), TINKER, { pos: [0, 0, -0.48], glow: true, outline: 0 });
    piece(W, G.box(0.06, 0.14, 0.08), 0x5a4a3a, { pos: [0, 0, -0.02], outline: 0.008 });
    piece(W, G.box(0.065, 0.06, 0.02), TINKER, { pos: [0, 0, 0.025], glow: true, outline: 0 });
    const arrow = bone(W, 'arrow', [0, 0.02, -0.5]);
    piece(arrow, G.cylZ(0.01, 0.01, 0.7, 4), 0xd8c9a3, { pos: [0, 0, 0.3], outline: 0 });
    piece(arrow, G.coneZ(0.03, 0.08, 4), TINKER, { pos: [0, 0, 0.68], glow: true, outline: 0.008 });
    rig.arrow = arrow;
  } else if (weapon === 'club') {
    piece(W, G.cylZ(0.12, 0.05, 0.85, 10), 0x7a4f32, { pos: [0, 0, 0.4] });
    piece(W, G.torus(0.065, 0.02, Math.PI * 2, 4, 10), strap, { pos: [0, 0, 0.08], outline: 0.01 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      piece(W, G.cone(0.03, 0.12, 5), 0xb8bcc6, { pos: [Math.cos(a) * 0.12, Math.sin(a) * 0.12, 0.63 + (i % 2) * 0.1], rot: [0, 0, a - Math.PI / 2], outline: 0.01 });
    }
    piece(W, G.cylZ(0.04, 0.04, 0.1, 8), TINKER, { pos: [0, 0.1, 0.5], glow: true, outline: 0.008 });
  }
  extra?.(rig, { skin, cloth, accent, skinDark, scrap, strap });
  finish(rig);
  if (rig.arrow) rig.arrow.scale.setScalar(1e-4);
  return rig;
}

// ---------------------------------------------------------------- ogre (brute / boss)
const OGRE = {
  hipY: 1.08, hipX: 0.3, hipDrop: 0.05, thigh: 0.5, shin: 0.43, ankle: 0.1,
  spine: 0.12, chest: 0.42, neck: 0.6, neckZ: 0.22, skull: 0.12, shoulderX: 0.6, shoulderY: 0.48,
  upper: 0.52, fore: 0.5, grip: 0.13, height: 2.75,
};

export function buildOgre({ boss = false, skin = 0x6f8fc0, cloth = 0x5a3a26, metal = 0x8a8f99, glow = 0xff5a2a } = {}) {
  const rig = skeleton(OGRE);
  const { hips, spine, chest, skull } = rig;
  const skinLight = shade(skin, 1.2);
  const skinDark = shade(skin, 0.7);
  const core = boss ? glow : FORGE;

  // hips: wide belt, forge buckle, loincloth
  piece(hips, G.sphere(0.48, 18, 12), cloth, { pos: [0, -0.08, 0], scale: [1.05, 0.6, 0.85] });
  piece(hips, G.cyl(0.52, 0.52, 0.14, 18), 0x4a2c1a, { pos: [0, 0.06, 0.02], scale: [1, 1, 0.85] });
  piece(hips, G.box(0.22, 0.18, 0.06), metal, { pos: [0, 0.06, 0.46], outline: 0.015 });
  piece(hips, G.box(0.14, 0.1, 0.05), core, { pos: [0, 0.06, 0.49], glow: true, outline: 0 });
  piece(hips, G.box(0.5, 0.45, 0.04), cloth, { pos: [0, -0.32, 0.4], rot: [-0.15, 0, 0] });
  piece(hips, G.box(0.6, 0.4, 0.04), cloth, { pos: [0, -0.3, -0.36], rot: [0.15, 0, 0] });
  for (const s of [-1, 1]) piece(hips, G.box(0.06, 0.06, 0.06), metal, { pos: [0.4 * s, 0.06, 0.3], outline: 0.01 });

  // spine: the belly
  piece(spine, G.sphere(0.56, 20, 14), skinLight, { pos: [0, 0.18, 0.12], scale: [1, 0.95, 0.95] });
  piece(spine, G.box(0.008, 0.14, 0.008), skinDark, { pos: [0, 0.1, 0.65], glow: true, outline: 0 });

  // chest: massive torso, traps, harness
  piece(chest, G.sphere(0.5, 20, 14), skin, { pos: [0, 0.18, -0.06], scale: [1.2, 0.92, 0.95] });
  for (const s of [-1, 1]) piece(chest, G.sphere(0.27, 14, 10), skin, { pos: [0.48 * s, 0.42, -0.04] });
  piece(chest, G.torus(0.34, 0.06, Math.PI * 2, 6, 18), 0xb08a3e, { pos: [0, 0.56, 0.08], rot: [Math.PI / 2 - 0.3, 0, 0], outline: 0.012 });
  piece(chest, G.box(0.1, 0.9, 0.05), 0x4a2c1a, { pos: [0, 0.1, 0.42], rot: [0, 0, 0.6], outline: 0.012 });
  if (boss) {
    piece(chest, G.box(0.7, 0.45, 0.1), metal, { pos: [0, 0.26, 0.44], rot: [-0.2, 0, 0] });
    piece(chest, G.box(0.3, 0.05, 0.11), glow, { pos: [0, 0.3, 0.5], rot: [-0.2, 0, 0], glow: true, outline: 0 });
    for (let i = 0; i < 3; i++) piece(chest, G.cone(0.07, 0.3, 6), 0xe8e0d0, { pos: [(i - 1) * 0.2, 0.5, -0.5], rot: [-0.8, 0, 0], outline: 0.012 });
  }

  // head: small, low and forward, jaw with tusks, heavy brow, helm
  piece(skull, G.sphere(0.27, 16, 12), skin);
  piece(skull, G.box(0.38, 0.17, 0.27), skin, { pos: [0, -0.16, 0.08] });
  piece(skull, G.box(0.42, 0.08, 0.13), skinDark, { pos: [0, 0.09, 0.2], outline: 0.015 });
  for (const s of [-1, 1]) {
    piece(skull, G.cone(0.05, 0.2, 6), WHITE, { pos: [0.12 * s, -0.08, 0.2], rot: [0.1, 0, 0.15 * s], outline: 0.012 });
    piece(skull, G.sphere(0.06, 8, 6), skin, { pos: [0.26 * s, 0, 0], scale: [0.6, 1, 0.8], outline: 0.012 });
  }
  eyes(skull, { x: 0.09, y: 0.03, z: 0.235, r: 0.036, sclera: boss ? glow : 0xffe94a, iris: boss ? 0xffffff : 0xff9a1a, pupil: 0x2a0a00, lash: false });
  piece(skull, G.box(0.16, 0.02, 0.02), 0x2a0a10, { pos: [0, -0.2, 0.22], glow: true, outline: 0 });
  piece(skull, G.dome(0.29, 16, 8, 0.45), metal, { pos: [0, 0.05, -0.02] });
  piece(skull, G.torus(0.28, 0.03, Math.PI * 2, 5, 18), shade(metal, 0.7), { pos: [0, 0.07, -0.02], rot: [Math.PI / 2, 0, 0], outline: 0.012 });
  if (boss) {
    for (const s of [-1, 1]) piece(skull, G.tube([[0.22 * s, 0.12, 0], [0.42 * s, 0.25, 0], [0.5 * s, 0.5, -0.05], [0.42 * s, 0.68, -0.12]], 0.05, 16, 6), 0xe8e0d0);
    for (let i = 0; i < 5; i++) {
      const a = -0.6 + i * 0.3;
      piece(skull, G.cone(0.04, 0.16, 4), 0xf0c75e, { pos: [Math.sin(a) * 0.24, 0.3, Math.cos(a) * 0.2], outline: 0.01 });
    }
  }

  // limbs: huge arms with metal bracers, tree-trunk legs
  for (const [arm, s] of [[rig.armL, 1], [rig.armR, -1]]) {
    piece(arm.upper, G.sphere(0.22, 14, 10), skin, { pos: [0.03 * s, -0.02, 0] });
    piece(arm.upper, G.cyl(0.19, 0.15, 0.44, 14), skin, { pos: [0, -0.26, 0] });
    if (boss) {
      piece(arm.upper, G.dome(0.3, 12, 6), metal, { pos: [0.05 * s, 0.06, 0], rot: [0, 0, -0.5 * s] });
      for (let i = 0; i < 3; i++) piece(arm.upper, G.cone(0.06, 0.28, 6), 0xe8e0d0, { pos: [(0.12 + i * 0.08) * s, 0.28 - i * 0.05, -0.1 + i * 0.1], rot: [0, 0, -0.5 * s], outline: 0.012 });
    }
    piece(arm.fore, G.sphere(0.15, 12, 10), skinDark, { outline: 0.015 });
    piece(arm.fore, G.cyl(0.16, 0.14, 0.42, 14), skin, { pos: [0, -0.22, 0] });
    piece(arm.fore, G.cyl(0.175, 0.165, 0.18, 14), metal, { pos: [0, -0.32, 0], outline: 0.015 });
    piece(arm.fore, G.box(0.05, 0.12, 0.05), core, { pos: [0.17 * s, -0.32, 0], glow: true, outline: 0 });
    fist(arm.hand, skinDark, skin, s, 2.1);
  }
  rig.legs.forEach((leg) => {
    piece(leg.thigh, G.sphere(0.22, 14, 10), skin, { pos: [0, -0.02, 0] });
    piece(leg.thigh, G.cyl(0.21, 0.17, 0.46, 14), skin, { pos: [0, -0.24, 0] });
    piece(leg.shin, G.sphere(0.16, 12, 10), skinDark);
    piece(leg.shin, G.cyl(0.175, 0.15, 0.4, 14), skin, { pos: [0, -0.2, 0] });
    piece(leg.shin, G.cyl(0.185, 0.18, 0.09, 14), metal, { pos: [0, -0.05, 0], outline: 0.015 });
    piece(leg.foot, G.sphere(0.14, 12, 8), skinDark, { scale: [1, 0.7, 1] });
    piece(leg.foot, G.box(0.32, 0.14, 0.42), skinDark, { pos: [0, -0.04, 0.1] });
    for (const x of [-0.1, 0, 0.1]) piece(leg.foot, G.sphere(0.05, 8, 6), shade(skin, 0.6), { pos: [x, -0.06, 0.32], outline: 0.008 });
  });

  // weapon hand: forge hammer
  const W = rig.weaponMount;
  const hs = boss ? 1.25 : 1;
  piece(W, G.cylZ(0.055, 0.055, 1.4, 8), 0x6a4a2a, { pos: [0, 0, 0.41] });
  piece(W, G.box(0.6 * hs, 0.42 * hs, 0.42 * hs), shade(metal, 0.85), { pos: [0, 0, 1.11] });
  for (const z of [-0.14, 0.14]) piece(W, G.box(0.62 * hs, 0.44 * hs, 0.06), shade(metal, 0.6), { pos: [0, 0, 1.11 + z * hs], outline: 0.012 });
  piece(W, G.torus(0.065, 0.02, Math.PI * 2, 4, 10), 0x4a2c1a, { pos: [0, 0, 0.11], outline: 0.01 });
  for (const s of [-1, 1]) piece(W, G.box(0.05, 0.22 * hs, 0.22 * hs), core, { pos: [0.31 * hs * s, 0, 1.11], glow: true, outline: 0 });
  if (boss) for (const s of [-1, 1]) piece(W, G.cone(0.08, 0.3, 6), 0xe8e0d0, { pos: [0, 0.32 * hs * s, 1.11], rot: [s < 0 ? Math.PI : 0, 0, 0], outline: 0.012 });
  return finish(rig);
}
