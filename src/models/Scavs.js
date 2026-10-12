// The Scav clans: human raiders in scavenged armour, on the human body (models/Human.js) with
// coarser lofts (enemies come in numbers and are small on screen), and the walking exo-suits
// their juggernauts and warlords drive.
//   scav:cutter|ripper|breacher|ironclad|grenadier|firebomber|tech|arctech|juggernaut|warlord
// Kit on the head is modelled in skull space: the cranium is centred (0, 0.1, -0.015) with radii
// (0.094, 0.113, 0.118), the face's front is at z ≈ 0.1, eyes at y 0.078, mouth -0.01, chin -0.08.
import * as THREE from 'three';
import { piece, shade, G } from '../render/ModelKit.js';
import { shellGeometry, onShell, sliceProfile } from '../render/Shell.js';
import { smoothstep } from '../render/Loft.js';
import { skeleton, finish } from './Characters.js';
import { HUMAN, BODY, LANDMARKS, fist, torsoPiece, armPiece, legPiece, bootFoot, buildHead, buildHair } from './Human.js';

export const SCAV = 0xff8a2a; // the clans' glow
const RUST = 0xa8552e;
const KHAKI = 0x6e6248;
const DRAB = 0x4e5040;
const CLOTH = 0x34302e;
const LEATHER = 0x4a3426;
const DARK = 0x26262c;
const GUNMETAL = 0x4a4e58;
const STEEL = 0x9aa0aa;
const HAZARD = 0xd9a227;
const BLOOD = 0x9a2a22;
const SOLE = 0x1e1a18;
const ARC = 0x3ad8ff;

const TORSO_LO = { seg: 16, sub: 2 };
const ARM_LO = { seg: 10, sub: 2 };
const LEG_LO = { seg: 12, sub: 2 };
const { HIPS, KNEE, ANKLE, NECK, ELBOW, WRIST } = LANDMARKS;

// ======================================================================== raiders
// The body under the kit: fatigues into boots, an undersuit, arms bare or sleeved with wrapped
// forearms and gloves, a belt with pouches, and the head (bare-faced, or none at all under a
// full helmet — the helmet is the head then).
function raider(L) {
  const rig = skeleton(HUMAN);
  const { hips, skull } = rig;
  torsoPiece(rig, L.pants, { ...TORSO_LO, y1: HIPS + 0.08, inflate: 0.008, caps: [true, false] });
  torsoPiece(rig, L.under, { ...TORSO_LO, y0: HIPS + 0.04, y1: NECK - 0.015, inflate: 0.004 });
  torsoPiece(rig, L.helm ? L.under : L.skin, { ...TORSO_LO, y0: NECK - 0.05 }, { outline: 0.012 });
  piece(hips, shellGeometry(sliceProfile(BODY.pelvis, 0.0, 0.06), { seg: 20, sub: 2, inflate: 0.018 }), LEATHER, { outline: 0.012 });
  piece(hips, G.box(0.07, 0.05, 0.02), STEEL, { pos: onShell(BODY.pelvis, 0.03, 0, 0.03).pos, outline: 0.008 });
  for (const s of [-1, 1]) {
    const p = onShell(BODY.pelvis, -0.012, 0.9 * s, 0.045);
    piece(hips, G.box(0.07, 0.085, 0.055), shade(LEATHER, 0.8), { pos: p.pos, rot: [0, p.yaw, 0], outline: 0.012 });
  }
  for (const s of [1, -1]) {
    const a = s > 0 ? rig.armL : rig.armR;
    if (L.sleeves) armPiece(rig, s, L.sleeves, { ...ARM_LO, y0: ELBOW + 0.02, inflate: 0.008, caps: [false, true] });
    armPiece(rig, s, L.skin, { ...ARM_LO, y1: L.sleeves ? ELBOW + 0.03 : Infinity, caps: [false, !L.sleeves] });
    armPiece(rig, s, L.wrap, { ...ARM_LO, y0: WRIST + 0.07, y1: ELBOW - 0.04, inflate: 0.008 }, { outline: 0.008 });
    armPiece(rig, s, L.gloves, { ...ARM_LO, y0: WRIST - 0.04, y1: WRIST + 0.065, inflate: 0.012 });
    fist(a.hand, L.gloves, L.fingers ?? L.gloves, s, L.handK ?? 1);
    const l = rig.legs[s > 0 ? 0 : 1];
    legPiece(rig, s, L.pants, { ...LEG_LO, y0: ANKLE + 0.24, inflate: 0.014 });
    const shaft = (y) => 0.018 + 0.012 * smoothstep(ANKLE + 0.2, ANKLE + 0.02, y);
    legPiece(rig, s, L.boots, { ...LEG_LO, y0: ANKLE - 0.04, y1: KNEE - 0.22, inflate: shaft });
    bootFoot(l.foot, L.boots, { s, sole: SOLE, strap: STEEL });
    piece(l.shin, G.sphere(0.058, 10, 8), L.pad ?? GUNMETAL, { pos: [0, 0.0, 0.066], scale: [1, 1.2, 0.6], outline: 0.012 });
  }
  if (!L.helm) buildHead(skull, L, { hidesFace: !!L.masked });
  return rig;
}

// A plate carrier: front and back plates over the chest, straps over the shoulders, pouches.
function plateCarrier(rig, color, { pouches = 3, strap = LEATHER, plate = 0.035 } = {}) {
  const C = BODY.chest;
  const band = sliceProfile(C, -0.08, 0.24, 4);
  piece(rig.chest, shellGeometry(band, { seg: 12, sub: 2, inflate: plate, thetaStart: -1.15, thetaLength: 2.3 }), color, { outline: 0.014 });
  piece(rig.chest, shellGeometry(band, { seg: 12, sub: 2, inflate: plate, thetaStart: Math.PI - 1.05, thetaLength: 2.1 }), color, { outline: 0.014 });
  for (const s of [-1, 1]) {
    const pts = [onShell(C, 0.22, 0.42 * s, plate).pos, onShell(C, 0.33, 1.25 * s, 0.03).pos, onShell(C, 0.33, (Math.PI - 1.2) * s, 0.03).pos, onShell(C, 0.22, (Math.PI - 0.42) * s, plate).pos];
    piece(rig.chest, G.tube(pts, 0.016, 10, 5), strap, { outline: 0.008 });
  }
  for (let i = 0; i < pouches; i++) {
    const t = (i - (pouches - 1) / 2) * 0.42;
    const p = onShell(C, -0.02, t, plate + 0.03);
    piece(rig.chest, G.box(0.075, 0.09, 0.05), shade(color, 0.78), { pos: p.pos, rot: [0, p.yaw, 0], outline: 0.01 });
  }
}

// A scavenged shoulder plate on one arm (s = +1 left).
function pauldron(rig, s, color, { spikes = 0, stripe = null, k = 1 } = {}) {
  const u = (s > 0 ? rig.armL : rig.armR).upper;
  piece(u, G.dome(0.12 * k, 12, 6), color, { pos: [0.025 * s, 0.035, 0], rot: [0, 0, -0.5 * s], scale: [1, 0.8, 1.1], outline: 0.012 });
  if (stripe) piece(u, G.box(0.02, 0.05, 0.13 * k), stripe, { pos: [0.11 * s * k, 0.0, 0], rot: [0, 0, -0.5 * s], glow: stripe === SCAV, outline: 0 });
  for (let i = 0; i < spikes; i++) {
    const z = (i - (spikes - 1) / 2) * 0.06;
    piece(u, G.cone(0.02, 0.11, 5), STEEL, { pos: [0.07 * s, 0.11, z], rot: [0, 0, -0.55 * s], outline: 0.008 });
  }
}

// ---------------------------------------------------------------- headgear (skull space)
function rebreather(skull, color, glow) {
  piece(skull, G.sphere(1, 12, 8), color, { pos: [0, -0.028, 0.082], scale: [0.07, 0.058, 0.055], outline: 0.01 });
  piece(skull, G.cylZ(0.026, 0.03, 0.04, 10), DARK, { pos: [0, -0.042, 0.134], rot: [0.3, 0, 0], outline: 0.008 });
  piece(skull, G.cylZ(0.017, 0.017, 0.01, 10), glow, { pos: [0, -0.048, 0.155], rot: [0.3, 0, 0], glow: true, outline: 0 });
  for (const s of [-1, 1]) piece(skull, G.cyl(0.02, 0.02, 0.05, 8), DARK, { pos: [0.064 * s, -0.048, 0.088], rot: [0.4, 0, 0.6 * s], outline: 0.008 });
  piece(skull, G.torus(0.1, 0.008, Math.PI * 2, 4, 16), DARK, { pos: [0, 0.0, -0.012], rot: [Math.PI / 2 + 0.25, 0, 0], scale: [1, 1.18, 1], outline: 0 });
}

function goggles(skull, glow, { r = 0.025, frame = DARK } = {}) {
  for (const s of [-1, 1]) {
    piece(skull, G.cylZ(r + 0.007, r + 0.004, 0.03, 12), frame, { pos: [0.038 * s, 0.08, 0.103], rot: [-0.1, 0.12 * s, 0], outline: 0.008 });
    piece(skull, G.cylZ(r, r, 0.01, 12), glow, { pos: [0.039 * s, 0.08, 0.12], rot: [-0.1, 0.12 * s, 0], glow: true, outline: 0 });
  }
  piece(skull, G.torus(0.103, 0.009, Math.PI * 2, 4, 18), frame, { pos: [0, 0.085, -0.012], rot: [Math.PI / 2 - 0.12, 0, 0], scale: [1, 1.2, 1], outline: 0 });
}

// A crest of spikes from the brow over the crown to the nape.
function mohawk(skull, color, n = 8, h = 0.09) {
  for (let i = 0; i < n; i++) {
    const a = 0.75 - (i / (n - 1)) * 2.2; // from the front of the crown, over the top, to the back
    const nx = 0;
    const ny = Math.cos(a);
    const nz = Math.sin(a);
    const len = h * (1 - Math.abs(i / (n - 1) - 0.35) * 0.6);
    piece(skull, G.cone(0.022, len, 4), color, {
      pos: [nx, 0.1 + ny * (0.113 + len * 0.3), -0.015 + nz * (0.118 + len * 0.3)], rot: [a, 0, 0], scale: [0.5, 1, 1.3], outline: 0.008,
    });
  }
}

// A full-face helmet that is the head: an egg of plate round where the head would be, a visor
// with a glowing slit and a jaw guard.
function helmet(skull, color, glow, { crest = 0, plume = null } = {}) {
  piece(skull, G.sphere(1, 16, 12), color, { pos: [0, 0.07, 0.0], scale: [0.122, 0.158, 0.146], outline: 0.014 });
  piece(skull, G.box(0.17, 0.052, 0.03), DARK, { pos: [0, 0.078, 0.128], outline: 0.008 });
  piece(skull, G.box(0.15, 0.014, 0.01), glow, { pos: [0, 0.08, 0.145], glow: true, outline: 0 });
  piece(skull, G.box(0.13, 0.075, 0.045), shade(color, 0.75), { pos: [0, -0.03, 0.115], rot: [0.25, 0, 0], outline: 0.01 });
  for (let i = 0; i < 3; i++) piece(skull, G.box(0.1, 0.008, 0.01), DARK, { pos: [0, -0.012 - i * 0.02, 0.14 - i * 0.005], rot: [0.25, 0, 0], outline: 0 });
  for (const s of [-1, 1]) piece(skull, G.cyl(0.03, 0.03, 0.02, 10), shade(color, 0.75), { pos: [0.122 * s, 0.06, 0], rot: [0, 0, Math.PI / 2], outline: 0.008 });
  if (crest) piece(skull, G.box(0.025, 0.05, 0.26), crest, { pos: [0, 0.225, -0.01], outline: 0.01 });
  if (plume) for (let i = 0; i < 5; i++) piece(skull, G.cone(0.02, 0.1, 4), plume, { pos: [0, 0.24, 0.08 - i * 0.05], rot: [-0.3 - i * 0.2, 0, 0], outline: 0.006 });
}

// A rubber gas hood with big round eyepieces, a filter can and a cap.
function gasMask(skull, rubber, glow, cap) {
  piece(skull, G.sphere(1, 16, 12), rubber, { pos: [0, 0.07, 0.0], scale: [0.118, 0.155, 0.142], outline: 0.014 });
  for (const s of [-1, 1]) {
    piece(skull, G.cylZ(0.036, 0.034, 0.03, 12), DARK, { pos: [0.045 * s, 0.078, 0.122], rot: [0, 0.25 * s, 0], outline: 0.008 });
    piece(skull, G.cylZ(0.028, 0.028, 0.01, 12), glow, { pos: [0.048 * s, 0.078, 0.138], rot: [0, 0.25 * s, 0], glow: true, outline: 0 });
  }
  piece(skull, G.cylZ(0.04, 0.034, 0.07, 12), GUNMETAL, { pos: [0, -0.04, 0.15], rot: [0.45, 0, 0], outline: 0.01 });
  for (let i = 0; i < 3; i++) piece(skull, G.torus(0.04, 0.005, Math.PI * 2, 3, 12), DARK, { pos: [0, -0.04 - i * 0.008, 0.16 + i * 0.016], rot: [0.45, 0, 0], outline: 0 });
  piece(skull, G.dome(0.135, 14, 6, 0.42), cap, { pos: [0, 0.11, -0.01], scale: [0.95, 0.9, 1.05], outline: 0.012 });
  piece(skull, G.box(0.2, 0.012, 0.08), cap, { pos: [0, 0.135, 0.13], rot: [0.12, 0, 0], outline: 0.008 });
}

// A small group under a bone or mount (shields, drones), baked along with it.
function group(parent) {
  const g = new THREE.Group();
  parent.add(g);
  return g;
}

// ---------------------------------------------------------------- weapons (mount space: +Z out of the fist)
function machete(M, blade, edge, { len = 0.5, serrated = false } = {}) {
  piece(M, G.cylZ(0.018, 0.018, 0.13, 8), LEATHER, { pos: [0, 0, 0], outline: 0.008 });
  piece(M, G.box(0.03, 0.08, 0.025), GUNMETAL, { pos: [0, 0.005, 0.075], outline: 0.008 });
  const shape = G.shape([[0, -0.022], [len * 0.8, -0.034], [len, 0.0], [len * 0.9, 0.035], [0, 0.026]]);
  piece(M, G.extrude(shape, 0.012, 0.003).rotateY(-Math.PI / 2), blade, { pos: [0, 0, 0.085], outline: 0.01 });
  piece(M, G.box(0.016, 0.008, len * 0.82), edge, { pos: [0, -0.03, 0.085 + len * 0.42], rot: [-0.02, 0, 0], glow: true, outline: 0 });
  if (serrated) for (let i = 0; i < 5; i++) piece(M, G.cone(0.012, 0.03, 3), blade, { pos: [0, 0.034, 0.14 + i * 0.07], rot: [0, 0, 0], outline: 0.006 });
}

function maul(M, head, glow, { k = 1 } = {}) {
  piece(M, G.cylZ(0.02, 0.022, 0.62 * k, 8), DARK, { pos: [0, 0, 0.2 * k], outline: 0.01 });
  piece(M, G.box(0.1 * k, 0.1 * k, 0.17 * k), head, { pos: [0, 0, 0.55 * k], outline: 0.012 });
  for (const z of [-0.05, 0.05]) piece(M, G.torus(0.068 * k, 0.012, Math.PI * 2, 4, 12), glow, { pos: [0, 0, (0.55 + z) * k], glow: true, outline: 0 });
  for (const s of [-1, 1]) piece(M, G.cone(0.016, 0.08 * k, 4), STEEL, { pos: [0.03 * s, 0, 0.67 * k], rot: [Math.PI / 2, 0, 0], outline: 0.006 });
}

// A shield on the off hand, facing out of the thumb (forward when guarding).
function shield(rig, face, rim, { w = 0.56, h = 0.95, spikes = 0, window: win = true } = {}) {
  const sh = group(rig.offMount);
  sh.position.set(0, 0.06, 0.02);
  sh.rotation.set(-Math.PI / 2, 0, 0);
  const c = 0.08;
  const outline = G.shape([[-w / 2 + c, -h / 2], [w / 2 - c, -h / 2], [w / 2, -h / 2 + c], [w / 2, h / 2 - c], [w / 2 - c, h / 2], [-w / 2 + c, h / 2], [-w / 2, h / 2 - c], [-w / 2, -h / 2 + c]]);
  piece(sh, G.extrude(outline, 0.04, 0.01), face, { pos: [0, 0.1, 0.08], outline: 0.02 });
  for (const y of [h / 2 - 0.02, -h / 2 + 0.02]) piece(sh, G.box(w + 0.02, 0.05, 0.07), rim, { pos: [0, 0.1 + y, 0.08], outline: 0.01 });
  if (win) {
    piece(sh, G.box(w * 0.6, 0.09, 0.02), 0x2a3a48, { pos: [0, 0.1 + h * 0.28, 0.105], outline: 0.006 });
    piece(sh, G.box(w * 0.58, 0.012, 0.01), SCAV, { pos: [0, 0.1 + h * 0.28 - 0.035, 0.115], glow: true, outline: 0 });
  }
  for (let i = 0; i < 4; i++) piece(sh, G.box(0.07, 0.11, 0.012), i % 2 ? DARK : HAZARD, { pos: [(i - 1.5) * 0.12, 0.1 - h / 2 + 0.12, 0.114], rot: [0, 0, 0.5], outline: 0 });
  for (let i = 0; i < spikes; i++) piece(sh, G.cone(0.03, 0.14, 4), STEEL, { pos: [(i - (spikes - 1) / 2) * 0.16, 0.1 + h / 2 + 0.06, 0.08], outline: 0.008 });
  return sh;
}


// ---------------------------------------------------------------- the raiders
const SKINS = [0xc8946c, 0x8a5a3a, 0xe0b090, 0xa86a48];

function cutter(kind) {
  const ripper = kind === 'ripper';
  const glow = ripper ? 0xff3a2a : SCAV;
  const L = {
    skin: SKINS[ripper ? 1 : 0], hair: 0x2a1a14, eye: 0x6a4a2a, pants: ripper ? DRAB : KHAKI, under: CLOTH, boots: LEATHER,
    gloves: LEATHER, fingers: LEATHER, wrap: ripper ? BLOOD : 0x8a7a5a, masked: true, sleeves: null,
  };
  const rig = raider(L);
  const { chest, skull, hips } = rig;
  plateCarrier(rig, ripper ? GUNMETAL : RUST, { pouches: 2, plate: ripper ? 0.04 : 0.03 });
  pauldron(rig, 1, ripper ? STEEL : GUNMETAL, { stripe: glow, spikes: ripper ? 3 : 0 });
  if (ripper) pauldron(rig, -1, STEEL, { spikes: 3, k: 0.9 });
  // A hip cloth hanging behind, short enough to clear the legs.
  piece(hips, G.box(0.26, 0.2, 0.02), ripper ? BLOOD : RUST, { pos: [0, -0.15, -0.17], rot: [0.28, 0, 0], outline: 0.01 });
  rebreather(skull, ripper ? BLOOD : GUNMETAL, glow);
  goggles(skull, glow);
  mohawk(skull, ripper ? BLOOD : RUST, 8, ripper ? 0.11 : 0.085);
  if (ripper) for (const s of [-1, 1]) piece(chest, G.box(0.02, 0.14, 0.01), glow, { pos: onShell(BODY.chest, 0.08, 0.42 * s, 0.075).pos, rot: [0, 0.42 * s, 0], glow: true, outline: 0 });
  machete(rig.weaponMount, STEEL, glow, { serrated: ripper });
  machete(rig.offMount, STEEL, glow, { serrated: ripper, len: 0.42 });
  return finish(rig);
}

function breacher(kind) {
  const iron = kind === 'ironclad';
  const plate = iron ? GUNMETAL : DRAB;
  const L = { skin: SKINS[2], pants: DRAB, under: CLOTH, boots: DARK, gloves: DARK, wrap: CLOTH, helm: true, sleeves: CLOTH, pad: plate };
  const rig = raider(L);
  const { skull, hips } = rig;
  plateCarrier(rig, plate, { pouches: 3, plate: 0.045, strap: DARK });
  pauldron(rig, 1, plate, { stripe: HAZARD, k: 1.15, spikes: iron ? 2 : 0 });
  pauldron(rig, -1, plate, { k: 1.15, spikes: iron ? 2 : 0 });
  // Thigh plates.
  for (const [l, s] of [[rig.legs[0], 1], [rig.legs[1], -1]]) piece(l.thigh, G.box(0.05, 0.22, 0.13), plate, { pos: [0.085 * s, -0.17, 0.02], rot: [0, 0, 0.12 * s], outline: 0.012 });
  piece(hips, shellGeometry(sliceProfile(BODY.pelvis, -0.16, -0.02, 3), { seg: 14, sub: 1, inflate: 0.03, thetaStart: -0.7, thetaLength: 1.4 }), plate, { outline: 0.012 });
  helmet(skull, iron ? STEEL : plate, SCAV, { crest: iron ? SCAV : 0 });
  maul(rig.weaponMount, GUNMETAL, iron ? SCAV : ARC);
  shield(rig, iron ? GUNMETAL : 0x5a5e66, DARK, iron ? { w: 0.66, h: 1.2, spikes: 4, window: false } : {});
  return finish(rig);
}

function grenadier(kind) {
  const fire = kind === 'firebomber';
  const glow = fire ? 0xff5a1a : 0xffb030;
  const coat = fire ? 0x6a2a20 : 0x5a4e36;
  const L = { skin: SKINS[3], pants: fire ? CLOTH : KHAKI, under: coat, boots: LEATHER, gloves: DARK, wrap: CLOTH, helm: true, sleeves: coat };
  const rig = raider(L);
  const { chest, skull } = rig;
  const C = BODY.chest;
  gasMask(skull, fire ? 0x3a2a26 : 0x3a3a34, glow, fire ? BLOOD : DRAB);
  // Bandolier of grenades from the left shoulder to the right hip.
  const pts = [[0.62, 0.27], [0.45, 0.18], [0.05, 0.06], [-0.35, -0.03], [-0.7, -0.09]].map(([t, y]) => onShell(C, y, t, 0.03).pos);
  piece(chest, G.tube(pts, 0.022, 20, 5), LEATHER, { outline: 0.01 });
  for (const [t, y] of [[0.42, 0.17], [0.15, 0.09], [-0.12, 0.04], [-0.38, -0.02]]) {
    const p = onShell(C, y, t, 0.06);
    piece(chest, G.cyl(0.03, 0.03, 0.07, 8), DARK, { pos: p.pos, rot: [0, p.yaw, 0.5], outline: 0.008 });
    piece(chest, G.cyl(0.032, 0.032, 0.012, 8), glow, { pos: p.pos, rot: [0, p.yaw, 0.5], glow: true, outline: 0 });
  }
  // Pack: a satchel of charges, or the firebomber's fuel tanks.
  const back = onShell(C, 0.08, Math.PI, 0.09);
  if (fire) {
    for (const s of [-1, 1]) {
      piece(chest, G.capsule(0.07, 0.3, 10), BLOOD, { pos: [0.08 * s, back.pos[1], back.pos[2] - 0.02], outline: 0.012 });
      piece(chest, G.cyl(0.074, 0.074, 0.03, 10), glow, { pos: [0.08 * s, back.pos[1] - 0.06, back.pos[2] - 0.02], glow: true, outline: 0 });
    }
    piece(chest, G.tube([[0.08, back.pos[1] + 0.22, back.pos[2] - 0.02], [0.2, 0.25, -0.05], [-0.2, -0.05, 0.12]], 0.012, 12, 4), DARK, { outline: 0 });
  } else {
    piece(chest, G.box(0.28, 0.3, 0.14), coat, { pos: back.pos, outline: 0.012 });
    piece(chest, G.box(0.3, 0.06, 0.15), glow, { pos: [back.pos[0], back.pos[1] + 0.1, back.pos[2]], glow: true, outline: 0 });
  }
  // A grenade in the throwing hand.
  const W = rig.weaponMount;
  piece(W, G.cylZ(0.042, 0.042, 0.1, 10), DARK, { pos: [0, 0, 0.02], outline: 0.01 });
  piece(W, G.cylZ(0.044, 0.044, 0.02, 10), glow, { pos: [0, 0, 0.02], glow: true, outline: 0 });
  piece(W, G.box(0.02, 0.05, 0.03), STEEL, { pos: [0, 0.045, 0.06], outline: 0.006 });
  return finish(rig);
}

function tech(kind) {
  const arc = kind === 'arctech';
  const glow = arc ? 0x7fe8ff : ARC;
  const L = {
    skin: SKINS[arc ? 2 : 1], hair: arc ? 0xe8e0d0 : 0x2a1a14, hairStyle: 'short', eye: 0x4a6a3a, pants: CLOTH, under: arc ? 0x2a3a4a : 0x3a4a3e,
    boots: LEATHER, gloves: GUNMETAL, fingers: DARK, wrap: CLOTH, sleeves: arc ? 0x2a3a4a : 0x3a4a3e,
  };
  const rig = raider(L);
  const { chest, skull } = rig;
  const C = BODY.chest;
  buildHair(skull, L);
  goggles(skull, glow, { r: 0.03, frame: GUNMETAL });
  // Headset with an aerial.
  piece(skull, G.box(0.03, 0.06, 0.05), GUNMETAL, { pos: [-0.105, 0.06, -0.01], outline: 0.008 });
  piece(skull, G.cyl(0.004, 0.004, 0.22, 4), STEEL, { pos: [-0.11, 0.18, -0.03], rot: [-0.15, 0, 0.1], outline: 0 });
  piece(skull, G.sphere(0.012, 6, 4), glow, { pos: [-0.12, 0.29, -0.05], glow: true, outline: 0 });
  // Tool harness and a power cell on the back.
  plateCarrier(rig, LEATHER, { pouches: 4, plate: 0.025, strap: DARK });
  const back = onShell(C, 0.1, Math.PI, 0.08);
  piece(chest, G.box(0.24, 0.3, 0.12), GUNMETAL, { pos: back.pos, outline: 0.012 });
  for (const s of [-1, 1]) piece(chest, G.cyl(0.035, 0.035, 0.26, 8), glow, { pos: [0.065 * s, back.pos[1], back.pos[2] - 0.065], glow: true, outline: 0.008 });
  // A little helper drone over the right shoulder.
  const d = group(chest);
  d.position.set(-0.3, 0.55, -0.12);
  piece(d, G.sphere(0.06, 10, 8), STEEL, { scale: [1, 0.7, 1], outline: 0.01 });
  piece(d, G.torus(0.085, 0.01, Math.PI * 2, 4, 14), GUNMETAL, { rot: [Math.PI / 2, 0, 0], outline: 0.006 });
  piece(d, G.sphere(0.022, 6, 4), glow, { pos: [0, -0.01, 0.05], glow: true, outline: 0 });
  // The emitter rod: a pole with coils round a glowing core at the tip (shots leave from it).
  const W = rig.weaponMount;
  piece(W, G.cylZ(0.016, 0.018, 1.32, 8), GUNMETAL, { pos: [0, 0, 0.36], outline: 0.01 });
  for (let i = 0; i < 3; i++) piece(W, G.torus(0.05 - i * 0.008, 0.012, Math.PI * 2, 4, 12), STEEL, { pos: [0, 0, 0.94 + i * 0.07], outline: 0.006 });
  piece(W, G.octa(0.05), glow, { pos: [0, 0, 1.15], scale: [1, 1, 1.4], glow: true, outline: 0.006 });
  for (const s of [-1, 1]) piece(W, G.box(0.008, 0.1, 0.12), STEEL, { pos: [0.05 * s, 0, 1.0], rot: [0, 0, 0.3 * s], outline: 0.006 });
  piece(W, G.box(0.05, 0.06, 0.12), LEATHER, { pos: [0, 0, 0.0], outline: 0.008 });
  return finish(rig);
}

// ======================================================================== exo-suits
// Walking powered frames with a raider strapped in, head out under a roll cage. The ogre-sized
// skeleton: shoulders 2.04, elbows 1.52, wrists 1.02, hips 1.08, knees 0.53.
const EXO = {
  hipY: 1.08, hipX: 0.3, hipDrop: 0.05, thigh: 0.5, shin: 0.43, ankle: 0.1,
  spine: 0.12, chest: 0.42, neck: 0.5, neckZ: 0.12, skull: 0.12, shoulderX: 0.62, shoulderY: 0.42,
  upper: 0.52, fore: 0.5, grip: 0.17, height: 2.75,
};

function exoSuit(kind) {
  const boss = kind === 'warlord';
  const P = boss ? 0x8a2a22 : HAZARD;     // hull plating
  const F = boss ? 0x2a2224 : GUNMETAL;   // frame
  const trim = boss ? 0xd9a227 : DARK;
  const rig = skeleton(EXO);
  const { hips, spine, chest, head, skull } = rig;

  // Pelvis: an armoured box on hip actuators, a skirt plate.
  piece(hips, G.box(0.62, 0.26, 0.42), F, { pos: [0, -0.02, 0], outline: 0.025 });
  for (const s of [-1, 1]) piece(hips, G.cyl(0.14, 0.14, 0.16, 12), DARK, { pos: [0.3 * s, -0.05, 0], rot: [0, 0, Math.PI / 2], outline: 0.015 });
  piece(hips, G.box(0.42, 0.24, 0.05), P, { pos: [0, -0.16, 0.22], rot: [-0.15, 0, 0], outline: 0.015 });
  for (let i = 0; i < 3; i++) piece(hips, G.box(0.06, 0.18, 0.012), trim, { pos: [(i - 1) * 0.12, -0.16, 0.248], rot: [-0.15, 0, 0.5], outline: 0 });

  // Waist gimbal with pistons.
  piece(spine, G.cyl(0.2, 0.22, 0.3, 12), DARK, { pos: [0, 0.12, 0], outline: 0.02 });
  for (const s of [-1, 1]) piece(spine, G.cyl(0.035, 0.035, 0.42, 6), STEEL, { pos: [0.15 * s, 0.16, -0.16], outline: 0.008 });

  // Hull: a rounded body, front grille, power pack and exhaust stacks behind.
  piece(chest, G.sphere(1, 18, 12), P, { pos: [0, 0.15, -0.04], scale: [0.6, 0.44, 0.46], outline: 0.03 });
  piece(chest, G.box(0.5, 0.26, 0.08), F, { pos: [0, 0.08, 0.4], rot: [-0.2, 0, 0], outline: 0.015 });
  for (let i = 0; i < 4; i++) piece(chest, G.box(0.4, 0.025, 0.02), SCAV, { pos: [0, 0.0 + i * 0.055, 0.44 - i * 0.012], rot: [-0.2, 0, 0], glow: true, outline: 0 });
  piece(chest, G.box(0.66, 0.5, 0.3), F, { pos: [0, 0.25, -0.42], outline: 0.02 });
  for (const s of [-1, 1]) {
    piece(chest, G.cyl(0.07, 0.08, 0.55, 10), DARK, { pos: [0.22 * s, 0.72, -0.5], outline: 0.012 });
    piece(chest, G.cyl(0.06, 0.06, 0.04, 10), SCAV, { pos: [0.22 * s, 1.0, -0.5], glow: true, outline: 0 });
  }
  for (let i = 0; i < 3; i++) piece(chest, G.box(0.08, 0.3, 0.012), trim, { pos: [-0.3 + i * 0.12, 0.2, 0.38], rot: [-0.3, 0.55, 0.5], outline: 0 });
  // Roll cage over the pilot: a bar side to side and one front to back.
  piece(chest, G.tube([[-0.3, 0.38, 0.1], [-0.28, 0.72, 0.12], [0, 0.92, 0.12], [0.28, 0.72, 0.12], [0.3, 0.38, 0.1]], 0.026, 20, 5), F, { outline: 0.01 });
  piece(chest, G.tube([[0, 0.92, 0.12], [0, 0.86, -0.12], [0, 0.6, -0.2]], 0.026, 10, 5), F, { outline: 0.01 });
  piece(chest, G.box(0.28, 0.3, 0.06), DARK, { pos: [0, 0.6, -0.14], outline: 0.012 });

  // The pilot: goggled, masked, head up out of the hull.
  piece(head, G.cyl(0.055, 0.065, 0.16, 10), CLOTH, { pos: [0, 0.06, 0.02], outline: 0.01 });
  const pilot = { skin: SKINS[boss ? 1 : 3], hair: 0x2a1a14, eye: 0x6a4a2a };
  buildHead(skull, pilot, { hidesFace: true });
  rebreather(skull, boss ? BLOOD : GUNMETAL, SCAV);
  goggles(skull, SCAV);
  if (boss) mohawk(skull, BLOOD, 9, 0.12);

  // Arms: pauldrons, actuated upper arms, armoured forearms, big mechanical hands.
  for (const [arm, s] of [[rig.armL, 1], [rig.armR, -1]]) {
    piece(arm.upper, G.sphere(0.2, 12, 10), DARK, { outline: 0.02 });
    piece(arm.upper, G.dome(0.3, 14, 7), P, { pos: [0.06 * s, 0.06, 0], rot: [0, 0, -0.45 * s], scale: [1, 0.85, 1.1], outline: 0.025 });
    piece(arm.upper, G.box(0.04, 0.05, 0.3), trim, { pos: [0.3 * s, -0.02, 0], rot: [0, 0, -0.5 * s], outline: 0 });
    piece(arm.upper, G.cyl(0.14, 0.13, 0.44, 12), F, { pos: [0, -0.26, 0], outline: 0.02 });
    piece(arm.upper, G.cyl(0.03, 0.03, 0.4, 6), STEEL, { pos: [0, -0.24, 0.15], outline: 0.008 });
    piece(arm.fore, G.sphere(0.15, 12, 10), DARK, { outline: 0.015 });
    piece(arm.fore, G.box(0.3, 0.44, 0.32), P, { pos: [0, -0.25, 0], outline: 0.025 });
    piece(arm.fore, G.box(0.05, 0.22, 0.2), SCAV, { pos: [0.15 * s, -0.25, 0], glow: true, outline: 0 });
    fist(arm.hand, F, DARK, s, 2.6);
    if (boss) for (let i = 0; i < 3; i++) piece(arm.upper, G.cone(0.05, 0.24, 5), trim, { pos: [(0.14 + i * 0.07) * s, 0.26 - i * 0.04, -0.12 + i * 0.12], rot: [0, 0, -0.5 * s], outline: 0.01 });
  }
  // Legs: armoured thighs, knee guards, piston shins, broad feet.
  rig.legs.forEach((leg, i) => {
    const s = i === 0 ? 1 : -1;
    piece(leg.thigh, G.box(0.3, 0.44, 0.32), P, { pos: [0, -0.24, 0], outline: 0.025 });
    piece(leg.shin, G.sphere(0.15, 10, 8), DARK, { outline: 0.015 });
    piece(leg.shin, G.dome(0.17, 12, 6), P, { pos: [0, 0.02, 0.06], rot: [Math.PI / 2 - 0.2, 0, 0], outline: 0.015 });
    piece(leg.shin, G.box(0.26, 0.4, 0.28), F, { pos: [0, -0.22, 0], outline: 0.02 });
    piece(leg.shin, G.cyl(0.03, 0.03, 0.36, 6), STEEL, { pos: [0.1 * s, -0.2, -0.16], outline: 0.008 });
    piece(leg.foot, G.box(0.34, 0.14, 0.5), F, { pos: [0, -0.04, 0.1], outline: 0.025 });
    piece(leg.foot, G.box(0.36, 0.08, 0.16), P, { pos: [0, -0.02, 0.33], rot: [0.3, 0, 0], outline: 0.015 });
  });
  // Hydraulic sledge.
  const W = rig.weaponMount;
  const k = boss ? 1.25 : 1;
  piece(W, G.cylZ(0.055, 0.055, 1.4, 8), DARK, { pos: [0, 0, 0.41], outline: 0.015 });
  piece(W, G.box(0.5 * k, 0.38 * k, 0.38 * k), F, { pos: [0, 0, 1.1], outline: 0.025 });
  for (const z of [-0.13, 0.13]) piece(W, G.box(0.52 * k, 0.4 * k, 0.05), P, { pos: [0, 0, 1.1 + z * k], outline: 0.012 });
  for (const s of [-1, 1]) piece(W, G.box(0.04, 0.2 * k, 0.2 * k), SCAV, { pos: [0.26 * k * s, 0, 1.1], glow: true, outline: 0 });
  piece(W, G.cylZ(0.09 * k, 0.12 * k, 0.12, 10), DARK, { pos: [0, 0.24 * k, 1.1], rot: [-Math.PI / 2, 0, 0], outline: 0.01 });
  if (boss) {
    piece(W, G.coneZ(0.09, 0.34, 6), STEEL, { pos: [0, 0, 1.1 + 0.19 * k + 0.16], outline: 0.012 });
    // Trophy rack: two poles on the power pack flying clan banners.
    for (const s of [-1, 1]) {
      piece(chest, G.cyl(0.025, 0.025, 1.3, 6), DARK, { pos: [0.3 * s, 1.0, -0.55], rot: [-0.15, 0, -0.12 * s], outline: 0.008 });
      piece(chest, G.box(0.38, 0.5, 0.03), s > 0 ? BLOOD : trim, { pos: [0.52 * s, 1.36, -0.62], rot: [-0.15, 0, -0.12 * s], outline: 0.012 });
      piece(chest, G.dome(0.09, 10, 6), STEEL, { pos: [0.39 * s, 1.68, -0.62], rot: [-0.4, 0, 0], outline: 0.008 });
    }
  }
  return finish(rig);
}

export const SCAV_MODELS = {
  'scav:cutter': () => cutter('cutter'),
  'scav:ripper': () => cutter('ripper'),
  'scav:breacher': () => breacher('breacher'),
  'scav:ironclad': () => breacher('ironclad'),
  'scav:grenadier': () => grenadier('grenadier'),
  'scav:firebomber': () => grenadier('firebomber'),
  'scav:tech': () => tech('tech'),
  'scav:arctech': () => tech('arctech'),
  'scav:juggernaut': () => exoSuit('juggernaut'),
  'scav:warlord': () => exoSuit('warlord'),
};
