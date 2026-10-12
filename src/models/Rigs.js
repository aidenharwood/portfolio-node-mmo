// The non-human enemy rigs and the pieces every faction's models share. Bipeds use the humanoid
// skeleton (models/Characters.js skeleton()) and anim/Animator.js; these add:
//   legSkeleton    many-legged creatures (anim/LegAnimator.js): a body, optional chest, neck,
//                  head, jaw and tail chain, and any number of two-bone legs
//   hoverSkeleton  floating ones (anim/LegAnimator.js HoverAnimator): a body, spinning rings,
//                  optional arms and a trailing robe or tendrils
//   bindAny        re-finds the bones of any rig kind on a cloned model
import * as THREE from 'three';
import { piece, G } from '../render/ModelKit.js';
import { bone, bindRig } from './Characters.js';

export const INK = 0x14101c;
export const WHITE = 0xfaf6ee;

// A limb segment hanging along -Y from the bone.
export const seg = (b, len, r0, r1, color, opts = {}) => piece(b, G.cyl(r0, r1, len, opts.n ?? 10), color, {
  pos: [opts.x ?? 0, -len / 2 + (opts.y ?? 0), opts.z ?? 0], rot: opts.rot, outline: opts.outline ?? 0.02,
});

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

// Four legs, trotting: diagonal pairs move together.
export function quadLegs({ fx, fz, hx, hz, hipY, upper, lower, footSpread = 1.05 }) {
  const mk = (side, front, phase) => ({
    hip: [side * (front ? fx : hx), hipY, front ? fz : hz], upper, lower,
    foot: [side * (front ? fx : hx) * footSpread, 0, front ? fz + 0.04 : hz - 0.02], side, front, phase, bend: front ? 'back' : 'fwd',
  });
  return [mk(1, true, 0), mk(-1, true, 0.5), mk(1, false, 0.5), mk(-1, false, 0)];
}

// Six legs in two alternating tripods (front and hind of one side with the middle of the other),
// so three feet are always down.
export function hexLegs({ zs, x, hipY, upper, lower, spread = 1.3, bend = ['back', 'fwd', 'fwd'] }) {
  const legs = [];
  zs.forEach((z, i) => {
    for (const side of [1, -1]) {
      const phase = (i % 2 === 0) === (side > 0) ? 0 : 0.5;
      legs.push({ hip: [side * x, hipY, z], upper, lower, foot: [side * x * spread, 0, z * 1.08], side, front: i === 0, phase, bend: bend[i] });
    }
  });
  return legs;
}

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

// A curved blade, claw, horn or tendril: a tapering tube through `pts`, as a few cone-ish
// segments so it stays cheap (radius r0 → r1 along the points); `smooth: n` resamples the points
// along a curve into n segments first, for long bends.
export function hook(parent, pts, r0, r1, color, opts = {}) {
  let P = pts.map((p) => new THREE.Vector3(...p));
  if (opts.smooth) P = new THREE.CatmullRomCurve3(P).getPoints(opts.smooth);
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i];
    const b = P[i + 1];
    const d = new THREE.Vector3().subVectors(b, a);
    const len = d.length();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    const e = new THREE.Euler().setFromQuaternion(q);
    const ra = r0 + ((r1 - r0) * i) / (P.length - 1);
    const rb = r0 + ((r1 - r0) * (i + 1)) / (P.length - 1);
    const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
    piece(parent, G.cyl(rb, ra, len, opts.n ?? 6), color, { pos: mid.toArray(), rot: [e.x, e.y, e.z], outline: opts.outline ?? 0.01, glow: opts.glow });
  }
}
