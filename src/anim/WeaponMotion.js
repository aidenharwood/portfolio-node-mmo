// Weapon-centric motion for held weapons. Instead of posing the arm, we say where the weapon is
// (grip position, chest-local) and which way it points (Euler YXZ: [pitch, yaw, roll], pitch
// positive = down, yaw positive = toward the character's left), and the Animator solves the arms
// to it. Melee swings move the grip along arcs *around* the torso with the weapon pointing out
// along the radius, so blades sweep past the body instead of through it.
import * as THREE from 'three';

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const easeOut = (t) => 1 - (1 - t) * (1 - t);
const easeOut3 = (t) => 1 - (1 - t) * (1 - t) * (1 - t);
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const smooth01 = (t) => t * t * (3 - 2 * t);
// Strike curve: slow start (the weight getting moving), whip through the middle, settle.
const strikeCurve = (t) => t * t * t * (t * (t * 6 - 15) + 10);
// Heavy strike: builds speed all the way through the hit — nothing brakes a heavy weapon early.
const heaveCurve = (t) => t * t * (1.6 - 0.6 * t);

// 0 = featherweight, 1 = two-handed heavy. Drives coil, lag, follow-through and body motion.
export const WEIGHT = { dagger: 0.2, sword: 0.45, axe: 0.75, spear: 0.65, greatsword: 1, hammer: 1.1, staff: 0.5 };

// Carry poses (grip at, weapon rot). Heavy two-handers rest on the right shoulder, hands at the
// sternum.
export const CARRY = {
  dagger: { at: [-0.3, -0.16, 0.3], rot: [0.55, -0.25, 0] },
  sword: { at: [-0.33, -0.2, 0.32], rot: [0.32, -0.3, 0] },
  axe: { at: [-0.37, -0.36, 0.1], rot: [1.2, -0.12, 0] },
  spear: { at: [-0.26, -0.1, 0.28], rot: [-0.28, 0.06, 0] },
  greatsword: { at: [-0.13, 0.0, 0.3], rot: [-2.2, 0.36, 0] },
  hammer: { at: [-0.13, 0.0, 0.3], rot: [-2.25, 0.32, 0] },
  staff: { at: [-0.36, -0.1, 0.16], rot: [-1.38, 0.0, 0] },
};
// Sprinting: blades trail behind; heavies stay shouldered.
export const SPRINT_CARRY = {
  dagger: { at: [-0.42, -0.2, -0.04], rot: [0.6, -2.95, 0] },
  sword: { at: [-0.43, -0.22, -0.05], rot: [0.58, -2.95, 0] },
  axe: { at: [-0.36, -0.3, -0.02], rot: [0.9, -2.6, 0] },
};

// Gun holds (two-handed). Aim holds seat the stock in a shoulder pocket (chest-local) and take
// their direction from the camera; at rest the stock stays seated with the muzzle dipped down and
// in (low ready, sights up); launchers ride on top of the shoulder.
export const GUN_HOLD = {
  low: { pocket: [-0.18, 0.2, 0.18], rot: [0.48, 1.0, 0.2] },
  lowSprint: { pocket: [-0.18, 0.18, 0.18], rot: [0.62, 1.05, 0.25] },
  hip: { pocket: [-0.24, -0.03, 0.15] },
  ads: { pocket: [-0.19, 0.2, 0.16] },
  shoulder: { pocket: [-0.3, 0.39, -0.02] },
  reload: { at: [-0.14, -0.02, 0.4], rot: [0.3, 0.55, 0.7] },
  launcherRest: { pocket: [-0.3, 0.39, -0.02], rot: [-0.3, 0.05, 0] },
};

// ---------------------------------------------------------------- swing paths
// Horizontal arc. The swing angle θ (relative to the hips) is split between the torso turning
// (twist τ) and the arm sweeping round the chest (φ), so the arm stays in front of the chest and
// the blade points out along the radius — clear of the body at every point of the swing.
// Optional y1/pitch1 tilt the arc's plane (a diagonal cut) from start to end.
function arcH(u, o, out) {
  const th = lerp(o.from, o.to, u);
  let phi = th - clamp(th * 0.55, -0.9, 1.05);
  phi = clamp(phi, -1.65, 0.42);
  const r = o.r ?? 0.54;
  const k = clamp(u, -0.3, 1.3);
  const y = o.y1 === undefined ? o.y ?? 0.08 : lerp(o.y, o.y1, k);
  out.at.set((o.cx ?? -0.06) + Math.sin(phi) * r, y, (o.cz ?? 0.02) + Math.cos(phi) * r);
  out.rot[0] = o.pitch1 === undefined ? o.pitch ?? 0.08 : lerp(o.pitch, o.pitch1, k);
  out.rot[1] = phi;
  out.rot[2] = o.roll ?? 0;
  out.twist = th - phi;
  out.lean = 0;
  return out;
}

function arcV(u, o, out) {
  // Never coil past "pointing up-back": further and the haft would swing round into the back.
  const a = Math.max(-2.8, lerp(o.from, o.to, u));
  const r = o.r ?? 0.5;
  out.at.set(o.x ?? -0.27, (o.cy ?? 0.2) - Math.sin(a) * r, (o.cz ?? 0.05) + Math.cos(a) * r);
  out.rot[0] = a;
  out.rot[1] = o.yaw ?? 0.05;
  out.rot[2] = o.roll ?? Math.PI / 2;
  out.twist = -0.15;
  out.lean = clamp(a * 0.22, -0.3, 0.3);
  return out;
}

function thrust(u, o, out) {
  out.at.set(lerp(o.from[0], o.to[0], u), lerp(o.from[1], o.to[1], u), lerp(o.from[2], o.to[2], u));
  out.rot[0] = o.rot[0];
  out.rot[1] = o.rot[1];
  out.rot[2] = o.rot[2];
  out.twist = lerp(-0.35, 0.2, clamp(u, 0, 1));
  out.lean = lerp(-0.05, 0.3, clamp(u, 0, 1));
  return out;
}

// Where on its path each swing's windup picks the weapon up (overheads rise in front first).
const WIND_FROM = { overhead: 0.55, stab: 0.6, stabHigh: 0.6 };

// Heavier weapons cut on a diagonal (high on the cocked side, low through the follow-through).
export const PATHS = {
  slashR: (u, out, w = 0.5) => arcH(u, { from: -2.0 + 0.3 * w, to: 1.3 - 0.25 * w, y: 0.1 + 0.2 * w, y1: 0.1 - 0.24 * w, pitch: 0.04 - 0.25 * w, pitch1: 0.04 + 0.42 * w }, out),
  slashL: (u, out, w = 0.5) => arcH(u, { from: 1.3 - 0.25 * w, to: -2.0 + 0.3 * w, y: 0.14 + 0.14 * w, y1: 0.14 - 0.2 * w, pitch: 0.08 - 0.2 * w, pitch1: 0.08 + 0.36 * w }, out),
  overhead: (u, out, w = 0.5) => arcV(u, { from: -2.5, to: 1.05 + 0.15 * w, r: 0.5 + w * 0.14, x: -0.27 - w * 0.05 }, out),
  stab: (u, out) => thrust(u, { from: [-0.38, -0.04, 0.08], to: [-0.17, 0.06, 0.66], rot: [0.05, 0.16, 0] }, out),
  stabHigh: (u, out) => thrust(u, { from: [-0.37, 0.06, 0.08], to: [-0.16, 0.14, 0.66], rot: [-0.03, 0.15, 0] }, out),
  sweepLow: (u, out) => arcH(u, { from: -1.9, to: 1.45, y: -0.25, pitch: 0.5 }, out),
  // Whirlwind: θ is the weapon's angle round the body; sampleSpin drives it.
  spin: (u, out, w = 0.5) => arcH(u, { from: -2.25, to: 0.75, r: 0.6, y: 0.02 - 0.06 * w, pitch: 0.1 + 0.12 * w }, out),
};

const _a = { at: new THREE.Vector3(), rot: [0, 0, 0], twist: 0, lean: 0, crouch: 0 };
const _r = { at: new THREE.Vector3(), rot: [0, 0, 0], twist: 0, lean: 0, crouch: 0 };

// The torso turns at most this far into a swing (the head keeps the target; hips take a share).
const MAX_TWIST = 1.2;
const capTwist = (h) => { h.twist = clamp(h.twist, -MAX_TWIST, MAX_TWIST); return h; };

function mix(a, b, k, out) {
  out.at.lerpVectors(a.at, b.at, k); // safe when out is b
  for (let i = 0; i < 3; i++) out.rot[i] = lerp(a.rot[i], b.rot[i], k);
  out.twist = lerp(a.twist ?? 0, b.twist ?? 0, k);
  out.lean = lerp(a.lean ?? 0, b.lean ?? 0, k);
  out.crouch = lerp(a.crouch ?? 0, b.crouch ?? 0, k);
  return out;
}

export const toHold = (h, out) => {
  out.at.fromArray(h.at);
  out.rot[0] = h.rot[0];
  out.rot[1] = h.rot[1];
  out.rot[2] = h.rot[2];
  out.twist = 0;
  out.lean = 0;
  out.crouch = 0;
  return out;
};

// Grip at path position u, weapon pointing as it did at u - lag: lag > 0 trails the hands (the
// weight hasn't caught up), lag < 0 runs ahead (the wrist has snapped it through).
function sample(path, u, lag, w, out) {
  path(u - lag, _r, w);
  path(u, out, w);
  out.rot[0] = _r.rot[0];
  out.rot[1] = _r.rot[1];
  out.rot[2] = _r.rot[2];
  return out;
}

/**
 * Samples a melee swing at time t.
 * attack: resolved move (windup/active/duration); path: PATHS key; from: hold at the swing start;
 * rest: hold to recover into; weight: 0..1. Writes into `out` ({ at, rot, twist, lean, crouch }).
 * Weight shapes every phase: a longer hang at the cocked point, a strike that keeps accelerating
 * through the hit, the weapon trailing the hands then whipping through, a deeper follow-through
 * that drags the body round and down, and a slower heave back to the carry.
 */
export function sampleSwing(t, attack, pathName, from, rest, weight, out) {
  const path = PATHS[pathName] ?? PATHS.slashR;
  const w = weight;
  const wc = Math.min(1, w);
  const coil = 0.06 + 0.2 * w;
  const over = 0.05 + 0.17 * w;
  const lagMax = 0.04 + 0.13 * w;
  const whip = lagMax * (0.75 - 0.5 * wc);
  const twistMul = 1 + w * 0.25;
  const strikeEnd = attack.windup + attack.active;
  const settle = Math.max(0.05, (attack.duration - strikeEnd) * (0.3 + 0.3 * wc));
  if (t < attack.windup) {
    // Wind up *along the arc*: ease off the carry onto the swing's leading edge, draw back to the
    // cocked point, then hang there while the body coils and sinks (heavier = longer hang).
    const k = t / attack.windup;
    const d = easeOut(Math.min(1, k / (0.85 - 0.3 * wc)));
    sample(path, lerp(WIND_FROM[pathName] ?? 0.25, -coil, d), lagMax * (d * d - 0.35 * Math.sin(Math.PI * d)), w, _a);
    _a.twist *= 1 + w * 0.25 * d;
    _a.lean -= 0.14 * w * d;
    _a.crouch = 0.3 * w * d;
    return mix(from, capTwist(_a), smooth01(Math.min(1, k / 0.4)), out);
  }
  if (t < strikeEnd) {
    const k = (t - attack.windup) / attack.active;
    const e = lerp(strikeCurve(k), heaveCurve(k), wc);
    sample(path, lerp(-coil, 1, e), lerp(lagMax, -whip, smooth01(k)), w, out);
    out.twist *= twistMul;
    out.lean += 0.15 + 0.15 * w;
    out.crouch = lerp(0.3, 0.75, k) * w;
    return capTwist(out);
  }
  if (t < strikeEnd + settle) {
    // Follow-through: the weapon carries on past the target and the body goes with it.
    const k = (t - strikeEnd) / settle;
    sample(path, 1 + over * easeOut3(k), lerp(-whip, 0, easeOut(k)), w, out);
    out.twist *= twistMul;
    out.lean += 0.15 + 0.15 * w + 0.12 * w * easeOut(k);
    out.crouch = 0.75 * w;
    return capTwist(out);
  }
  path(1 + over, _a, w);
  _a.twist *= twistMul;
  capTwist(_a);
  _a.lean += 0.15 + 0.27 * w;
  _a.crouch = 0.75 * w;
  const k = clamp((t - strikeEnd - settle) / Math.max(0.05, attack.duration - strikeEnd - settle), 0, 1);
  // Heave back: heavy weapons come up off the follow-through slowly, then settle onto the carry.
  return mix(_a, rest, wc > 0.5 ? smooth01(Math.pow(k, 1.3)) : easeInOut(k), out);
}

/**
 * Whirlwind. Returns the whole-body spin angle (radians, model about its up axis) and writes the
 * hold into `out`. The body counter-turns to coil, then the spin builds speed with the weapon held
 * out at arm's length on the right, trailing the turn; it carries past a full turn as the weapon
 * sweeps across the front, and the feet catch it and turn back to face forward.
 */
export function sampleSpin(t, attack, from, rest, weight, out) {
  const path = PATHS.spin;
  const w = weight;
  const wc = Math.min(1, w);
  const coilAngle = 0.3 + 0.4 * wc;
  const carry = 0.25 + 0.3 * wc;                  // how far past a full turn the spin runs
  const brake = 0.55 + 0.35 * wc;                 // turn left for the follow-through to spend
  const strikeEnd = attack.windup + attack.active;
  const settle = Math.max(0.08, (attack.duration - strikeEnd) * (0.45 + 0.15 * wc));
  const TURN = Math.PI * 2;
  // u along PATHS.spin: 0 = cocked behind the right hip, ~0.37 = straight out to the right, 1 = across the front.
  const OUT = 0.37;
  if (t < attack.windup) {
    const k = t / attack.windup;
    const d = easeOut(Math.min(1, k / (0.8 - 0.2 * wc)));
    sample(path, 0, -0.08 * Math.sin(Math.PI * d), w, _a);
    _a.twist *= 1 + 0.5 * w * d;
    _a.lean = 0.08 * d;
    _a.crouch = 0.45 * wc * d + 0.15;
    mix(from, _a, smooth01(Math.min(1, k / 0.45)), out);
    return -coilAngle * d;
  }
  if (t < strikeEnd) {
    // Spin builds speed; the weapon swings out to arm's length and trails the turn.
    // Continuous with the wind-up: the trail and the coiled torso ease over, they don't jump.
    const k = (t - attack.windup) / attack.active;
    const spin = lerp(-coilAngle, TURN - brake, lerp(k * k, smooth01(k), 0.45));
    sample(path, OUT * easeOut(Math.min(1, k / 0.45)), (0.1 * (1 - k) + 0.04) * smooth01(Math.min(1, k / 0.25)), w, out);
    out.twist *= lerp(attack.windup > 0 ? 1 + 0.5 * w : 1, 0.55, smooth01(Math.min(1, k / 0.3)));
    out.lean = -0.1 * wc;
    out.crouch = 0.55 * wc + 0.15;
    // No wind-up (slide attacks): blend in from the hold the spin started from.
    if (attack.windup < 0.05) mix(from, out, smooth01(Math.min(1, k / 0.25)), out);
    return spin;
  }
  if (t < strikeEnd + settle) {
    // The body brakes; the weapon carries on across the front and drags the torso after it.
    const k = (t - strikeEnd) / settle;
    const spin = lerp(TURN - brake, TURN + carry, easeOut3(k));
    sample(path, lerp(OUT, 1, easeOut(k)), lerp(0.04, -0.06, k), w, out);
    out.twist *= lerp(0.55, 1 + 0.4 * w, k);
    out.lean = lerp(-0.1 * wc, 0.2 + 0.15 * w, k);
    out.crouch = 0.55 * wc + 0.15;
    return spin;
  }
  const k = clamp((t - strikeEnd - settle) / Math.max(0.05, attack.duration - strikeEnd - settle), 0, 1);
  path(1, _a, w);
  _a.twist *= 1 + 0.4 * w;
  _a.lean = 0.2 + 0.15 * w;
  _a.crouch = 0.55 * wc + 0.15;
  mix(_a, rest, smooth01(k), out);
  return TURN + carry * (1 - smooth01(Math.min(1, k * 1.4)));
}
