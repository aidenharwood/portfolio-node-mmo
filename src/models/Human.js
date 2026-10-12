// The human body (hero and NPCs), at real proportions: about seven heads tall, legs half the
// height, shoulders two heads across. The skin is a few continuous lofts (render/Loft.js) — torso
// and neck, each arm, each leg — skinned with blended weights, so it bends smoothly at the waist,
// ribs, neck, elbows, knees and hips instead of hinging between rigid pieces; muscle shape comes
// from the cross-sections (deltoids, biceps, forearms, quads, calves, glutes, chest). Clothes are
// bands of the same lofts pushed outward, so they bend with the body. Hands are jointed fists with
// four fingers and a thumb; the head is sculpted (jaw, chin, cheekbones, nose, brow, lips, ears).
// Feet face +Z, the character's left is +X; s = side (+1 left, -1 right).
import * as THREE from 'three';
import { piece, skinPiece, shade, G } from '../render/ModelKit.js';
import { loftGeometry, chainWeights, smoothstep } from '../render/Loft.js';
import { sliceProfile } from '../render/Shell.js';

const LINE = 0x2a1a18; // pupils, lash lines, the mouth
const SCLERA = 0xece6dc;
const SOLE = 0x241c18;

// Skeleton proportions (models/Characters.js skeleton()): 2.05 m tall, hip joints at 1.06, knees
// 0.58, shoulders 1.62, elbows 1.28, wrists 0.99, chin 1.76, eyes 1.92.
export const HUMAN = {
  hipY: 1.12, hipX: 0.1, hipDrop: 0.06, thigh: 0.48, shin: 0.5, ankle: 0.08,
  spine: 0.1, chest: 0.2, neck: 0.3, skull: 0.12, shoulderX: 0.235, shoulderY: 0.2,
  upper: 0.34, fore: 0.29, grip: 0.065, height: 2.05,
};

// Landmarks (model space, bind pose).
const P = HUMAN;
const HIPS = P.hipY;
const HIP_J = P.hipY - P.hipDrop;
const KNEE = HIP_J - P.thigh;
const ANKLE = KNEE - P.shin;
const SPINE = HIPS + P.spine;
const CHEST = SPINE + P.chest;
const NECK = CHEST + P.neck;
const SHOULDER = CHEST + P.shoulderY;
const ELBOW = SHOULDER - P.upper;
const WRIST = ELBOW - P.fore;
const SX = P.shoulderX;
const HX = P.hipX;
export const LANDMARKS = { HIPS, HIP_J, KNEE, ANKLE, SPINE, CHEST, NECK, SHOULDER, ELBOW, WRIST };

// ---------------------------------------------------------------- torso
// Crotch to the base of the skull: seat, hips, waist, ribcage, chest, shoulders, trapezius, neck.
export const TORSO = [
  { y: 0.925, w: 0.05, zf: 0.045, zb: 0.05, n: 2 },
  { y: 0.95, w: 0.13, zf: 0.085, zb: 0.11, n: 2.2 },
  { y: 0.99, w: 0.175, zf: 0.105, zb: 0.132, n: 2.4 },
  { y: 1.04, w: 0.19, zf: 0.112, zb: 0.138, n: 2.5 },
  { y: 1.1, w: 0.182, zf: 0.115, zb: 0.124, n: 2.5 },
  { y: 1.18, w: 0.16, zf: 0.115, zb: 0.112, n: 2.4 },
  { y: 1.26, w: 0.162, zf: 0.122, zb: 0.115, n: 2.4 },
  { y: 1.34, w: 0.174, zf: 0.132, zb: 0.122, n: 2.5 },
  { y: 1.42, w: 0.188, zf: 0.142, zb: 0.13, n: 2.6, pec: 0.006, blade: 0.008 },
  { y: 1.49, w: 0.198, zf: 0.146, zb: 0.134, n: 2.7, pec: 0.018, blade: 0.014 },
  { y: 1.56, w: 0.202, zf: 0.138, zb: 0.132, n: 2.7, pec: 0.012, blade: 0.016 },
  { y: 1.62, w: 0.205, zf: 0.115, zb: 0.12, n: 2.6, blade: 0.008 },
  { y: 1.665, w: 0.19, zf: 0.09, zb: 0.1, n: 2.4 },
  { y: 1.7, w: 0.15, zf: 0.072, zb: 0.084, n: 2.2 },
  { y: 1.73, w: 0.095, zf: 0.062, zb: 0.07, n: 2.1 },
  { y: 1.77, w: 0.068, zf: 0.06, zb: 0.062, n: 2 },
  { y: 1.84, w: 0.064, zf: 0.056, zb: 0.058, n: 2 },
  { y: 1.88, w: 0.055, zf: 0.045, zb: 0.05, n: 2 },
];
const TORSO_W = chainWeights([SPINE, CHEST, NECK + 0.01], [0.06, 0.065, 0.035]);

// The torso cut into bone-local shells (render/Shell.js profiles) for armour plates, details placed
// with onShell, and the cape's collision: chest, abdomen (spine bone) and pelvis (hips bone).
const band = (y0, y1, origin, steps) => sliceProfile(TORSO, y0, y1, steps).map((r) => ({ ...r, y: r.y - origin }));
export const BODY = {
  chest: band(CHEST - 0.1, CHEST + 0.38, CHEST, 13),
  spine: band(SPINE - 0.06, SPINE + 0.22, SPINE, 7),
  pelvis: band(HIPS - 0.19, HIPS + 0.12, HIPS, 8),
};

// ---------------------------------------------------------------- arms (left; mirrored for the right)
const ARM = [
  { y: WRIST - 0.04, x: SX, w: 0.02, zf: 0.026, zb: 0.024, n: 2.2 },
  { y: WRIST - 0.015, x: SX, w: 0.021, zf: 0.028, zb: 0.026, n: 2.2 },
  { y: WRIST + 0.03, x: SX, wo: 0.024, wi: 0.023, zf: 0.032, zb: 0.03, n: 2.3 },
  { y: WRIST + 0.1, x: SX, wo: 0.031, wi: 0.029, zf: 0.037, zb: 0.035, n: 2.3 },
  { y: WRIST + 0.18, x: SX + 0.001, wo: 0.039, wi: 0.035, zf: 0.045, zb: 0.04, n: 2.3 },
  { y: ELBOW - 0.045, x: SX + 0.001, wo: 0.042, wi: 0.04, zf: 0.046, zb: 0.042, n: 2.3 },
  { y: ELBOW, x: SX + 0.001, wo: 0.04, wi: 0.042, zf: 0.042, zb: 0.045, n: 2.2 },
  { y: ELBOW + 0.06, x: SX + 0.001, w: 0.044, zf: 0.05, zb: 0.048, n: 2.2 },
  { y: ELBOW + 0.14, x: SX + 0.001, wo: 0.049, wi: 0.047, zf: 0.057, zb: 0.053, n: 2.3 },
  { y: ELBOW + 0.22, x: SX + 0.003, wo: 0.053, wi: 0.046, zf: 0.054, zb: 0.054, n: 2.3 },
  { y: SHOULDER - 0.05, x: SX + 0.005, wo: 0.061, wi: 0.047, zf: 0.056, zb: 0.055, n: 2.4 },
  { y: SHOULDER + 0.01, x: SX + 0.005, wo: 0.064, wi: 0.043, zf: 0.053, zb: 0.053, n: 2.4 },
  { y: SHOULDER + 0.05, x: SX + 0.001, wo: 0.052, wi: 0.031, zf: 0.043, zb: 0.044, n: 2.3 },
  { y: SHOULDER + 0.075, x: SX - 0.005, wo: 0.03, wi: 0.012, zf: 0.024, zb: 0.024, n: 2.1 },
];
const ARM_BUMPS = [
  { y: ELBOW + 0.13, t: 0, h: 0.006, sy: 0.05, st: 0.5 },              // biceps
  { y: ELBOW + 0.17, t: Math.PI, h: 0.005, sy: 0.06, st: 0.6 },        // triceps
  { y: ELBOW, t: Math.PI, h: 0.006, sy: 0.02, st: 0.4 },               // point of the elbow
  { y: ELBOW - 0.06, t: 0.8, h: 0.005, sy: 0.05, st: 0.6 },            // forearm extensors
];
const ARM_W = chainWeights([ELBOW], [0.04]);

// ---------------------------------------------------------------- legs (left; mirrored for the right)
const LEG = [
  { y: ANKLE - 0.04, x: HX, w: 0.03, zf: 0.032, zb: 0.034 },
  { y: ANKLE - 0.01, x: HX, w: 0.03, zf: 0.032, zb: 0.036 },
  { y: ANKLE + 0.06, x: HX, wo: 0.032, wi: 0.034, zf: 0.034, zb: 0.04 },
  { y: ANKLE + 0.16, x: HX, wo: 0.04, wi: 0.042, zf: 0.038, zb: 0.046 },
  { y: KNEE - 0.27, x: HX, wo: 0.047, wi: 0.052, zf: 0.042, zb: 0.058 },
  { y: KNEE - 0.18, x: HX, wo: 0.053, wi: 0.058, zf: 0.045, zb: 0.067 },
  { y: KNEE - 0.1, x: HX, w: 0.055, zf: 0.047, zb: 0.062 },
  { y: KNEE - 0.04, x: HX, w: 0.052, zf: 0.05, zb: 0.052 },
  { y: KNEE, x: HX, wo: 0.054, wi: 0.055, zf: 0.056, zb: 0.05 },
  { y: KNEE + 0.06, x: HX, wo: 0.058, wi: 0.066, zf: 0.06, zb: 0.055 },
  { y: KNEE + 0.16, x: HX, wo: 0.07, wi: 0.072, zf: 0.07, zb: 0.066 },
  { y: KNEE + 0.28, x: HX, wo: 0.082, wi: 0.078, zf: 0.08, zb: 0.077 },
  { y: KNEE + 0.39, x: HX + 0.002, wo: 0.091, wi: 0.082, zf: 0.084, zb: 0.086 },
  { y: HIP_J, x: HX + 0.005, wo: 0.092, wi: 0.068, zf: 0.084, zb: 0.09 },
  { y: HIP_J + 0.06, x: HX + 0.005, wo: 0.075, wi: 0.04, zf: 0.07, zb: 0.075 },
  { y: HIP_J + 0.09, x: HX, wo: 0.04, wi: 0.015, zf: 0.035, zb: 0.04 },
];
const LEG_BUMPS = [
  { y: KNEE + 0.01, t: 0, h: 0.008, sy: 0.025, st: 0.45 },             // kneecap
  { y: KNEE + 0.08, t: -0.9, h: 0.006, sy: 0.04, st: 0.5 },            // vastus medialis
  { y: KNEE - 0.17, t: -2.5, h: 0.006, sy: 0.06, st: 0.6 },            // calf, inner head
  { y: KNEE - 0.13, t: 2.5, h: 0.004, sy: 0.05, st: 0.6 },             // calf, outer head
];
const LEG_W = chainWeights([KNEE, HIP_J - 0.02], [0.05, 0.07]);

// Lofted, skinned bands of the body: torso (and neck), arm or leg. `o` are loft options (y0/y1
// band, inflate, open arcs, caps), `po` piece options (outline, glow).
export function torsoPiece(rig, color, o = {}, po = {}) {
  const geo = loftGeometry(TORSO, { seg: 24, sub: 3, weights: TORSO_W, ...o });
  return skinPiece(rig.model, geo, color, [rig.hips, rig.spine, rig.chest, rig.head], { outline: 0.014, ...po });
}
export function armPiece(rig, s, color, o = {}, po = {}) {
  const a = s > 0 ? rig.armL : rig.armR;
  const geo = loftGeometry(ARM, { seg: 14, sub: 3, side: s, bumps: ARM_BUMPS, weights: ARM_W, ...o });
  return skinPiece(rig.model, geo, color, [a.fore, a.upper], { outline: 0.012, ...po });
}
export function legPiece(rig, s, color, o = {}, po = {}) {
  const l = rig.legs[s > 0 ? 0 : 1];
  const geo = loftGeometry(LEG, { seg: 16, sub: 3, side: s, bumps: LEG_BUMPS, weights: LEG_W, ...o });
  return skinPiece(rig.model, geo, color, [l.shin, l.thigh, rig.hips], { outline: 0.014, ...po });
}

// ---------------------------------------------------------------- hands
// The hand bone sits at the wrist; the hand hangs along -Y, back of the hand outward (+X·s), palm
// in, thumb forward (+Z). Gripped handles run along Z through the curl of the fingers, 1.38 × grip
// below the wrist (anim/Animator.js) — a full curl wraps the fingers round (0, -0.09). curl < 1
// relaxes the hand (nothing in it). k scales it (exo-suits, bulky gauntlets).
const PALM = [
  { y: -0.104, x: 0.027, wo: 0.007, wi: 0.008, zf: 0.03, zb: 0.026, n: 3 },
  { y: -0.096, x: 0.027, wo: 0.0145, wi: 0.016, zf: 0.04, zb: 0.037, n: 3.2 },
  { y: -0.06, x: 0.021, wo: 0.0145, wi: 0.017, zf: 0.037, zb: 0.035, n: 3 },
  { y: -0.025, x: 0.012, wo: 0.014, wi: 0.016, zf: 0.032, zb: 0.03, n: 2.8 },
  { y: 0.0, x: 0.006, wo: 0.013, wi: 0.014, zf: 0.026, zb: 0.024, n: 2.5 },
  { y: 0.012, x: 0.004, wo: 0.01, wi: 0.011, zf: 0.02, zb: 0.019, n: 2.3 },
];
// Index to little finger: across the knuckles (z), knuckle height, phalanx lengths, thickness.
const FINGERS = [
  { z: 0.029, y: -0.096, len: [0.04, 0.024, 0.019], r: 0.0094 },
  { z: 0.009, y: -0.099, len: [0.044, 0.028, 0.02], r: 0.0097 },
  { z: -0.011, y: -0.097, len: [0.041, 0.026, 0.02], r: 0.0091 },
  { z: -0.029, y: -0.091, len: [0.033, 0.02, 0.017], r: 0.0081 },
];
const CURL = [1.4, 1.65, 1.05]; // knuckle, middle and end joints when gripping
const THUMB_GRIP = [[0.006, -0.018, 0.026], [-0.006, -0.05, 0.046], [-0.024, -0.068, 0.04], [-0.034, -0.083, 0.022]];
const THUMB_OPEN = [[0.006, -0.018, 0.026], [0.003, -0.052, 0.045], [-0.002, -0.08, 0.05], [-0.004, -0.1, 0.048]];

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _d = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _eu = new THREE.Euler();
const UP = new THREE.Vector3(0, 1, 0);

// A rounded segment (finger bone, thumb) from a to b.
function segment(parent, a, b, r, color, outline) {
  _d.subVectors(b, a);
  const len = _d.length();
  _q.setFromUnitVectors(UP, _d.normalize());
  _eu.setFromQuaternion(_q);
  const mid = _a.addVectors(a, b).multiplyScalar(0.5);
  return piece(parent, new THREE.CapsuleGeometry(r, Math.max(1e-3, len), 2, 6), color, { pos: mid.toArray(), rot: [_eu.x, _eu.y, _eu.z], outline });
}

export function fist(hand, palm, fingers, s, k = 1, { claws = null, curl = 1 } = {}) {
  const palmGeo = loftGeometry(PALM, { seg: 14, sub: 2, side: s, caps: [true, true], dome: 0.3 }).scale(k, k, k);
  piece(hand, palmGeo, palm, { outline: 0.008 * k });
  piece(hand, G.sphere(1, 10, 8), palm, { pos: [0.004 * s * k, -0.045 * k, 0.028 * k], scale: [0.013 * k, 0.026 * k, 0.015 * k], outline: 0.006 * k });
  for (const f of FINGERS) {
    const p = new THREE.Vector3(0.027 * s, f.y, f.z).multiplyScalar(k);
    let a = 0;
    f.len.forEach((len, i) => {
      a += CURL[i] * curl;
      const q = p.clone().add(_b.set(-Math.sin(a) * s, -Math.cos(a), 0).multiplyScalar(len * k));
      segment(hand, p, q, f.r * k * (1 - i * 0.07), fingers, 0.006 * k);
      if (claws && i === 0) {
        piece(hand, G.cone(0.011 * k, 0.05 * k, 4), claws, { pos: [q.x, q.y - 0.02 * k, q.z], rot: [Math.PI, 0, -0.25 * s], outline: 0.006 });
      }
      p.copy(q);
    });
  }
  const T = THUMB_OPEN.map((o, i) => new THREE.Vector3().fromArray(o).lerp(_b.fromArray(THUMB_GRIP[i]), curl));
  T.forEach((v) => { v.x *= s; v.multiplyScalar(k); });
  for (let i = 0; i < 3; i++) segment(hand, T[i], T[i + 1], (0.0112 - i * 0.0007) * k, fingers, 0.006 * k);
}

// ---------------------------------------------------------------- feet
// A boot round the foot bone (the ankle): lofted heel to toe, on a sole. Loft rows run along the
// foot (y → +Z once turned); z is minus the section centre's height, zf the depth below it and zb
// the height above.
const FOOT = [
  { y: -0.112, z: 0.03, w: 0.028, zf: 0.03, zb: 0.03, n: 2.2 },
  { y: -0.09, z: 0.022, wo: 0.044, wi: 0.042, zf: 0.04, zb: 0.05, n: 2.5 },
  { y: -0.03, z: 0.012, wo: 0.05, wi: 0.047, zf: 0.05, zb: 0.07, n: 2.6 },
  { y: 0.04, z: 0.022, wo: 0.053, wi: 0.05, zf: 0.04, zb: 0.05, n: 2.7 },
  { y: 0.11, z: 0.035, wo: 0.058, wi: 0.056, zf: 0.027, zb: 0.035, n: 2.8 },
  { y: 0.17, z: 0.04, wo: 0.052, wi: 0.05, zf: 0.022, zb: 0.027, n: 2.6 },
  { y: 0.205, z: 0.043, w: 0.036, zf: 0.019, zb: 0.02, n: 2.3 },
  { y: 0.224, z: 0.045, w: 0.014, zf: 0.01, zb: 0.01, n: 2 },
];
const FOOTPRINT = [[0, -0.118], [0.036, -0.11], [0.051, -0.08], [0.053, -0.02], [0.06, 0.06], [0.065, 0.12],
  [0.06, 0.18], [0.042, 0.218], [0, 0.232], [-0.037, 0.222], [-0.054, 0.18], [-0.06, 0.12], [-0.05, 0.06],
  [-0.044, -0.02], [-0.049, -0.08], [-0.035, -0.11]];
const footLoft = (s, o = {}) => loftGeometry(FOOT, { seg: 18, sub: 3, side: s, ...o }).rotateX(Math.PI / 2);

export function bootFoot(foot, color, { s = 1, sole = SOLE, toe = null, strap = null } = {}) {
  piece(foot, footLoft(s, { caps: [true, true] }), color, { outline: 0.014 });
  piece(foot, footLoft(s, { y0: 0.15, inflate: 0.004, caps: [false, true] }), toe ?? shade(color, 1.12), { outline: 0.01 });
  if (strap) piece(foot, footLoft(s, { y0: 0.025, y1: 0.045, inflate: 0.006 }), strap, { outline: 0 });
  const pts = FOOTPRINT.map(([x, z]) => [x * s, z]);
  const geo = G.extrude(G.shape(s > 0 ? pts : pts.reverse()), 0.02, 0.004).rotateX(Math.PI / 2);
  piece(foot, geo, sole, { pos: [0, -0.069, 0], outline: 0.012 });
}

// ---------------------------------------------------------------- arms and legs, dressed
// Sleeves to the elbow over bare forearms, gloves and fists (bare = no armour gloves).
export function dressArm(rig, s, L, { gloves, bare }) {
  const a = s > 0 ? rig.armL : rig.armR;
  armPiece(rig, s, L.top, { y0: ELBOW + 0.02, inflate: 0.008, caps: [false, true] });
  armPiece(rig, s, L.topDark, { y0: ELBOW - 0.005, y1: ELBOW + 0.045, inflate: 0.018 });
  armPiece(rig, s, L.skin, { y1: ELBOW + 0.03 });
  if (s > 0 && L.glow) armPiece(rig, s, L.glow, { y0: ELBOW + 0.19, y1: ELBOW + 0.205, inflate: 0.015 }, { glow: true, outline: 0 });
  if (L.pauldrons) {
    piece(a.upper, G.dome(0.11, 14, 6), L.metal, { pos: [0.022 * s, 0.035, 0], rot: [0, 0, -0.45 * s], scale: [1, 0.85, 1.05] });
    piece(a.upper, G.torus(0.106, 0.012, Math.PI * 2, 4, 16), L.trim, { pos: [0.022 * s, 0.035, 0], rot: [Math.PI / 2, 0.45 * s, 0], outline: 0.01 });
    piece(a.upper, G.box(0.016, 0.045, 0.1), L.glow, { pos: [0.12 * s, -0.01, 0], rot: [0, 0, -0.45 * s], glow: true, outline: 0 });
  }
  if (!bare) return;
  const cuff = (y) => 0.009 + 0.008 * smoothstep(WRIST + 0.02, WRIST + 0.075, y);
  armPiece(rig, s, gloves, { y0: WRIST - 0.04, y1: WRIST + 0.075, inflate: cuff });
  if (s > 0) {
    // Wrist computer on the off arm.
    piece(a.fore, G.box(0.026, 0.075, 0.052), L.metal, { pos: [0.044, -0.195, 0], outline: 0.01 });
    piece(a.fore, G.box(0.005, 0.055, 0.04), L.glow ?? 0x6ae8ff, { pos: [0.058, -0.195, 0], glow: true, outline: 0 });
  }
  fist(a.hand, gloves, L.skin, s, 1, { curl: L.curl ?? 1 });
}

// Trousers tucked into boots (bare = no armour on the legs).
export function dressLeg(rig, s, L, { bare }) {
  const l = rig.legs[s > 0 ? 0 : 1];
  legPiece(rig, s, L.pants, { y0: bare ? ANKLE + 0.24 : ANKLE + 0.04, inflate: 0.013 });
  if (s < 0 && L.holster) {
    piece(l.thigh, G.box(0.045, 0.16, 0.1), L.leather, { pos: [0.115 * s, -0.17, 0.0], outline: 0.012 });
    piece(l.thigh, G.box(0.036, 0.055, 0.032), L.metal, { pos: [0.115 * s, -0.06, -0.025], outline: 0.008 });
    piece(l.thigh, G.torus(0.094, 0.01, Math.PI * 2, 4, 18), L.leather, { pos: [0, -0.28, 0], rot: [Math.PI / 2, 0, 0], outline: 0.008 });
  } else {
    piece(l.thigh, G.box(0.03, 0.1, 0.09), shade(L.leather, 0.78), { pos: [0.097 * s, -0.2, 0.01], outline: 0.01 });
  }
  piece(l.shin, G.sphere(0.045, 12, 10), bare ? shade(L.leather, 0.78) : L.pants, { pos: [0, 0.005, 0.068], scale: [1, 1.15, 0.5], outline: 0.012 });
  if (!bare) return;
  const shaft = (y) => 0.017 + 0.012 * smoothstep(ANKLE + 0.2, ANKLE + 0.02, y);
  legPiece(rig, s, L.boots, { y0: ANKLE - 0.04, y1: KNEE - 0.2, inflate: shaft });
  legPiece(rig, s, shade(L.boots, 1.25), { y0: KNEE - 0.215, y1: KNEE - 0.17, inflate: 0.028 }, { outline: 0.012 });
  for (const y of [ANKLE + 0.12, ANKLE + 0.19]) legPiece(rig, s, L.metal, { y0: y, y1: y + 0.014, inflate: shaft(y) + 0.005 }, { outline: 0 });
  bootFoot(l.foot, L.boots, { s, strap: L.metal });
}

// ---------------------------------------------------------------- head
// Skull-local (the skull bone sits at the top of the neck, level with the ear lobes): cranium,
// then the face lofted chin to brow with the jaw, cheekbones and forehead in its sections.
const CRANIUM = { pos: [0, 0.1, -0.015], r: [0.094, 0.113, 0.118] };
const FACE = [
  { y: -0.079, z: 0.06, w: 0.016, zf: 0.016, zb: 0.022, n: 2 },
  { y: -0.07, z: 0.052, w: 0.03, zf: 0.031, zb: 0.04, n: 2.2 },
  { y: -0.052, z: 0.04, w: 0.049, zf: 0.048, zb: 0.058, n: 2.5 },
  { y: -0.03, z: 0.032, w: 0.062, zf: 0.064, zb: 0.07, n: 2.7 },
  { y: -0.005, z: 0.028, w: 0.068, zf: 0.073, zb: 0.08, n: 2.7 },
  { y: 0.025, z: 0.022, w: 0.074, zf: 0.079, zb: 0.09, n: 2.7 },
  { y: 0.052, z: 0.016, w: 0.083, zf: 0.084, zb: 0.1, n: 2.6 },
  { y: 0.08, z: 0.004, w: 0.088, zf: 0.097, zb: 0.112, n: 2.4 },
  { y: 0.105, z: -0.008, w: 0.09, zf: 0.108, zb: 0.12, n: 2.2 },
  { y: 0.125, z: -0.012, w: 0.088, zf: 0.108, zb: 0.12, n: 2.1 },
];
const NOSE = [
  { y: 0.012, z: 0.112, w: 0.011, zf: 0.012, zb: 0.012, n: 2 },
  { y: 0.022, z: 0.116, w: 0.017, zf: 0.021, zb: 0.016, n: 2.2 },
  { y: 0.038, z: 0.112, w: 0.0125, zf: 0.018, zb: 0.014, n: 2.2 },
  { y: 0.06, z: 0.104, w: 0.0095, zf: 0.013, zb: 0.012, n: 2 },
  { y: 0.082, z: 0.098, w: 0.0085, zf: 0.007, zb: 0.01, n: 2 },
  { y: 0.092, z: 0.096, w: 0.008, zf: 0.004, zb: 0.008, n: 2 },
];
const tint = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t).getHex();

export function buildHead(skull, L, { hidesFace = false } = {}) {
  const skin = L.skin;
  const o = 0.012;
  piece(skull, G.sphere(1, 20, 14), skin, { pos: CRANIUM.pos, scale: CRANIUM.r, outline: o });
  piece(skull, loftGeometry(FACE, { seg: 22, sub: 3, caps: [true, false], dome: 0.5 }), skin, { outline: o });
  for (const s of [-1, 1]) {
    piece(skull, G.sphere(1, 10, 8), skin, { pos: [0.095 * s, 0.066, -0.012], rot: [-0.15, -0.6 * s, 0], scale: [0.012, 0.03, 0.019], outline: 0.006 });
  }
  if (hidesFace) return;
  piece(skull, loftGeometry(NOSE, { seg: 12, sub: 3, caps: [true, true], dome: 0.6 }), skin, { outline: 0.006 });
  for (const s of [-1, 1]) piece(skull, G.sphere(1, 8, 6), skin, { pos: [0.0145 * s, 0.021, 0.111], scale: [0.0095, 0.0075, 0.009], outline: 0.006 });
  piece(skull, G.sphere(1, 16, 6), skin, { pos: [0, 0.098, 0.089], scale: [0.076, 0.017, 0.0145], outline: 0 }); // brow ridge
  // Lips and the line of the mouth.
  const lip = tint(skin, 0xb0524a, 0.32);
  piece(skull, new THREE.CapsuleGeometry(0.006, 0.026, 3, 8).rotateZ(Math.PI / 2), lip, { pos: [0, -0.003, 0.1], scale: [1, 1, 0.8], outline: 0 });
  piece(skull, new THREE.CapsuleGeometry(0.0072, 0.02, 3, 8).rotateZ(Math.PI / 2), lip, { pos: [0, -0.016, 0.096], scale: [1, 1, 0.85], outline: 0 });
  piece(skull, G.box(0.036, 0.0022, 0.004), LINE, { pos: [0, -0.0092, 0.1062], glow: true, outline: 0 });
  // Eyes: whites set into the face, iris, pupil and the lash line; brows.
  for (const s of [-1, 1]) {
    const x = 0.035 * s;
    piece(skull, G.sphere(1, 12, 8), SCLERA, { pos: [x, 0.078, 0.093], scale: [0.0145, 0.0095, 0.009], glow: true, outline: 0 });
    piece(skull, G.cylZ(0.0068, 0.0068, 0.002, 12), L.eye ?? 0x3f8fe0, { pos: [x * 0.97, 0.0775, 0.1015], glow: true, outline: 0 });
    piece(skull, G.cylZ(0.0031, 0.0031, 0.002, 10), LINE, { pos: [x * 0.97, 0.0775, 0.1027], glow: true, outline: 0 });
    piece(skull, G.torus(0.0152, 0.0016, Math.PI * 0.84, 3, 10), LINE, { pos: [x, 0.0745, 0.0985], rot: [0, 0, Math.PI * 0.08], scale: [1, 0.72, 1], glow: true, outline: 0 });
    piece(skull, new THREE.CapsuleGeometry(0.0038, 0.026, 2, 6).rotateZ(Math.PI / 2), L.brow ?? L.hair, { pos: [0.037 * s, 0.1025, 0.1015], rot: [0, 0.3 * s, -0.12 * s], scale: [1, 0.8, 1], outline: 0 });
  }
}

// A carved head in one material (monuments): the same skull, face, nose, brow, lips and ears,
// with hollow eyes. Outlines are for the scale it's shown at, so pass them in.
export function sculptHead(parent, color, dark = shade(color, 0.6), ink = 0.004) {
  piece(parent, G.sphere(1, 16, 12), color, { pos: CRANIUM.pos, scale: CRANIUM.r, outline: ink });
  piece(parent, loftGeometry(FACE, { seg: 18, sub: 2, caps: [true, false], dome: 0.5 }), color, { outline: ink });
  piece(parent, loftGeometry(NOSE, { seg: 10, sub: 2, caps: [true, true], dome: 0.6 }), color, { outline: ink });
  for (const s of [-1, 1]) {
    piece(parent, G.sphere(1, 8, 6), color, { pos: [0.095 * s, 0.066, -0.012], rot: [-0.15, -0.6 * s, 0], scale: [0.012, 0.03, 0.019], outline: ink });
    piece(parent, G.sphere(1, 10, 8), dark, { pos: [0.035 * s, 0.078, 0.088], scale: [0.016, 0.01, 0.008], outline: 0 });
  }
  piece(parent, G.sphere(1, 14, 6), color, { pos: [0, 0.098, 0.089], scale: [0.076, 0.017, 0.0145], outline: 0 });
  piece(parent, new THREE.CapsuleGeometry(0.006, 0.026, 3, 8).rotateZ(Math.PI / 2), color, { pos: [0, -0.003, 0.1], scale: [1, 1, 0.8], outline: 0 });
  piece(parent, new THREE.CapsuleGeometry(0.0072, 0.02, 3, 8).rotateZ(Math.PI / 2), color, { pos: [0, -0.016, 0.096], scale: [1, 1, 0.85], outline: 0 });
  piece(parent, new THREE.CylinderGeometry(0.06, 0.07, 0.12, 12), color, { pos: [0, -0.05, -0.02], outline: ink });
}

// Old-style headwear (hats, goggles, visors and every armour helm) is modelled round a head of
// radius ~0.23 at its own origin; this group fits that space onto the real head.
export function headwear(skull) {
  const g = new THREE.Group();
  g.name = 'headwear';
  g.position.set(0, 0.062, -0.006);
  g.scale.set(0.46, 0.6, 0.56);
  skull.add(g);
  return g;
}

// ---------------------------------------------------------------- hair and beards
const HAIR_R = [0.103, 0.125, 0.128];
// Hairline height round the head (α from the front toward +X): 0.175 at the forehead, over the
// tops of the ears at the sides, the nape at the back.
const hairline = (a) => 0.0975 + 0.09 * Math.cos(a) - 0.0125 * Math.cos(2 * a);
// A point on the hair cap (polar angle φ from the crown, azimuth α from the front toward +X).
function onCap(phi, alpha, lift = 0) {
  const d = new THREE.Vector3(Math.sin(phi) * Math.sin(alpha), Math.cos(phi), Math.sin(phi) * Math.cos(alpha));
  const p = new THREE.Vector3(d.x * (HAIR_R[0] + lift), d.y * (HAIR_R[1] + lift), d.z * (HAIR_R[2] + lift)).add(new THREE.Vector3(...CRANIUM.pos));
  return { p, d };
}
function capGeometry(cols = 26, rows = 9) {
  const [, cy] = CRANIUM.pos;
  const pos = [];
  const idx = [];
  for (let i = 0; i <= rows; i++) {
    for (let j = 0; j < cols; j++) {
      const a = (j / cols) * Math.PI * 2;
      const edge = Math.acos(Math.min(1, Math.max(-1, (hairline(a) - cy) / HAIR_R[1])));
      pos.push(...onCap((i / rows) * edge, a).p.toArray());
    }
  }
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const a = i * cols + j;
      const b = i * cols + ((j + 1) % cols);
      idx.push(a, a + cols, b + cols, a, b + cols, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function buildHair(skull, L) {
  const style = L.hairStyle;
  if (style === 'bald' || L.hat === 'hood' || L.hat === 'helmet') return;
  const hair = L.hair;
  piece(skull, capGeometry(), hair, { outline: 0.012 });
  // Sideburns: a patch of the face's own surface in front of each ear.
  if (style !== 'long') for (const s of [-1, 1]) piece(skull, loftGeometry(FACE, { seg: 4, sub: 3, side: s, y0: 0.062, y1: 0.128, inflate: 0.003, thetaStart: 1.4, thetaLength: 0.2 }), hair, { outline: 0 });
  if (style === 'spiky') {
    // Short, textured and swept back from a lifted fringe.
    // (polar angle from the crown, azimuth from the front), inside the hairline.
    const tufts = [[0.62, 0], [0.62, 0.42], [0.62, -0.42], [0.35, 0.2], [0.4, -0.75], [0.45, 0.95], [0.12, Math.PI],
      [0.85, 1.45], [0.85, -1.45], [0.55, 1.9], [0.55, -1.9], [0.75, 2.6], [0.75, -2.6], [1.1, Math.PI], [1.35, 2.85],
      [1.35, -2.85], [0.4, 2.6], [0.4, -2.6]];
    const back = new THREE.Vector3(0, 0.25, -0.6);
    for (const [i, [phi, alpha]] of tufts.entries()) {
      const { p, d } = onCap(phi, alpha, -0.004);
      const axis = d.clone().add(back).normalize();
      const h = 0.06 + (i % 3) * 0.008;
      _q.setFromUnitVectors(UP, axis);
      _eu.setFromQuaternion(_q);
      p.addScaledVector(axis, h * 0.3);
      piece(skull, G.cone(0.024 - (i % 2) * 0.003, h, 5), hair, { pos: p.toArray(), rot: [_eu.x, _eu.y, _eu.z], outline: 0.008 });
    }
  } else if (style === 'long') {
    // Shoulder length, falling behind the ears, the ends parted into locks.
    const LONG = [
      { y: -0.15, z: -0.035, w: 0.1, zf: 0.05, zb: 0.07, n: 2.2 },
      { y: -0.07, z: -0.03, w: 0.105, zf: 0.065, zb: 0.095, n: 2.3 },
      { y: 0.02, z: -0.02, w: 0.106, zf: 0.09, zb: 0.125, n: 2.3 },
      { y: 0.1, z: -0.015, w: 0.107, zf: 0.1, zb: 0.134, n: 2.3 },
      { y: 0.17, z: -0.015, w: 0.095, zf: 0.09, zb: 0.116, n: 2.2 },
    ];
    const t0 = 1.45;
    const span = Math.PI * 2 - 2 * t0;
    piece(skull, loftGeometry(LONG, { seg: 22, sub: 3, thetaStart: t0, thetaLength: span }), hair, { outline: 0.012 });
    for (let i = 0; i <= 6; i++) {
      const t = t0 + 0.12 + ((span - 0.24) * i) / 6;
      const r = LONG[0];
      const x = r.w * Math.sin(t);
      const z = r.z + (Math.cos(t) >= 0 ? r.zf : r.zb) * Math.cos(t);
      piece(skull, G.cone(0.021, 0.055 + (i % 2) * 0.02, 5), hair, { pos: [x, r.y - 0.022 - (i % 2) * 0.01, z], rot: [Math.PI, t, 0], scale: [1.3, 1, 0.5], outline: 0.008 });
    }
  } else if (style === 'bun') {
    piece(skull, G.sphere(0.042, 12, 10), hair, { pos: [0, 0.185, -0.118], outline: 0.01 });
    piece(skull, G.torus(0.03, 0.007, Math.PI * 2, 4, 12), shade(hair, 0.7), { pos: [0, 0.17, -0.105], rot: [0.9, 0, 0], outline: 0 });
  }
}

export function buildBeard(skull, L) {
  const b = L.beard;
  piece(skull, loftGeometry(FACE, {
    seg: 24, sub: 3, y1: -0.021, inflate: 0.006, thetaStart: -1.8, thetaLength: 3.6,
    bumps: [{ y: -0.066, t: 0, h: 0.012, sy: 0.022, st: 0.7 }],
  }), b, { outline: 0.01 });
  for (const s of [1, -1]) {
    piece(skull, loftGeometry(FACE, { seg: 10, sub: 3, side: s, y0: -0.03, y1: 0.022, inflate: 0.006, thetaStart: 0.42, thetaLength: 1.38 }), b, { outline: 0.01 });
    piece(skull, loftGeometry(FACE, { seg: 6, sub: 3, side: s, y0: 0.015, y1: 0.07, inflate: 0.006, thetaStart: 1.05, thetaLength: 0.75 }), b, { outline: 0.01 });
    piece(skull, new THREE.CapsuleGeometry(0.0055, 0.016, 2, 6), b, { pos: [0.02 * s, -0.004, 0.1], rot: [0, 0, 0.5 * s], outline: 0.006 });
  }
  piece(skull, new THREE.CapsuleGeometry(0.0068, 0.024, 2, 8).rotateZ(Math.PI / 2), b, { pos: [0, 0.0045, 0.105], outline: 0.006 });
}
