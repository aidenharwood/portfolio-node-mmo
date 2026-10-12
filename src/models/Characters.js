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

// ---------------------------------------------------------------- skeleton
export function bone(parent, name, pos = [0, 0, 0]) {
  const b = new THREE.Bone();
  b.name = `rig:${name}`;
  b.position.fromArray(pos);
  parent.add(b);
  return b;
}

// Builds the bone hierarchy for proportions P. Every biped (hero, NPCs, scavs, hive bugs, synths)
// shares it, so one animator drives them all.
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
