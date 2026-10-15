// The wilds' models (world/scenery/kit.js builds them): for each, a base — a conifer's trunk and
// needle tiers, a broadleaf's forked trunk and crown clumps, a snag's broken limbs, a palm's ringed
// trunk and fronds, a mushroom's stem, ring, cap and gills, a saguaro's ribbed column and arms, a
// rock's fractured body and the chunks fallen against it — seeded, so each grows a few different
// ways (variants), and styled by the land it grows in: moss or snow or ash on whatever faces up,
// blossom, a willow's hanging strands, crystal growing out of a rock.
// SCENERY lists every set the world scatters: `${kind}.${style}#${variant}` (world/World.js).
import * as THREE from 'three';
import { Model, lump, limb, tier, blade, lathe, jitter } from './kit.js';
import { C } from '../palette.js';
import { shade } from '../../render/ModelKit.js';

const TAU = Math.PI * 2;
const SNOW = 0xf2f6fa;
const MOSS = 0x6a9a48;
const LICHEN = 0xb8b48a;
const ASH = 0x8a8480;
const SPORE = 0xa874c8;
const BARK = 0x5a3e2a;

// Where a lump of radius r centred on c is, at direction (a round, b up from the equator).
const onSphere = (c, r, a, b) => [c[0] + Math.cos(a) * Math.cos(b) * r, c[1] + Math.sin(b) * r, c[2] + Math.sin(a) * Math.cos(b) * r];
const yaw = (a) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a);
const pitchYaw = (p, a) => yaw(a).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), p));

// ---------------------------------------------------------------- components
// A trunk: from below the ground up a gentle curve to `h`, flared at its foot, with roots splayed
// round it. Returns the points it ran through (branches grow from them).
function trunk(m, h, r0, r1, { lean = 0.3, bend = 0.25, roots = 3, color = BARK, flare = 0.45, sides = 7, top = null } = {}) {
  const a = m.r(0, TAU);
  const lx = Math.cos(a) * lean;
  const lz = Math.sin(a) * lean;
  const b = m.r(0, TAU);
  const pts = [];
  for (let i = 0; i <= 4; i++) {
    const t = i / 4;
    const s = Math.sin(t * Math.PI) * bend;
    pts.push([lx * t * t + Math.cos(b) * s, -0.3 + (h + 0.3) * t, lz * t * t + Math.sin(b) * s]);
  }
  m.add(limb(pts, r0, r1, { sides: m.far ? 5 : sides, flare, seed: m.seed }), color, { smooth: true, pattern: 'bark', hit: true, bottom: shade(color, 0.78), top: top ?? shade(color, 1.08) });
  for (let k = 0; k < roots; k++) {
    const ra = a + (k / roots) * TAU + m.r(-0.4, 0.4);
    const len = r0 * m.r(2.2, 3.2);
    m.add(limb([[0, r0 * 1.2, 0], [Math.cos(ra) * len * 0.55, r0 * 0.45, Math.sin(ra) * len * 0.55], [Math.cos(ra) * len, -0.12, Math.sin(ra) * len]], r0 * 0.42, r0 * 0.12, { sides: 5 }), color, { smooth: true, pattern: 'bark', bottom: shade(color, 0.8), top: color, small: true });
  }
  return pts;
}

// A branch out of point p toward direction (a round, rising by `rise`), `len` long: returns its tip.
function branch(m, p, a, len, r0, { rise = 0.6, color = BARK, droop = 0, hit = false, small = false } = {}) {
  const dir = new THREE.Vector3(Math.cos(a), rise, Math.sin(a)).normalize();
  const mid = [p[0] + dir.x * len * 0.5, p[1] + dir.y * len * 0.5 + len * 0.08, p[2] + dir.z * len * 0.5];
  const tip = [p[0] + dir.x * len, p[1] + dir.y * len - droop * len, p[2] + dir.z * len];
  m.add(limb([p, mid, tip], r0, r0 * 0.35, { sides: m.far ? 4 : 5 }), color, { smooth: true, pattern: 'bark', hit, small });
  return tip;
}

// A clump of foliage: a roughened lump, lighter on top, shaded in toward the crown's middle.
function clump(m, c, r, color, { hollow = null, sy = 0.85, rough = 0.2, detail = 1, up = undefined, over } = {}) {
  m.add(lump(1, { detail: m.far ? 0 : detail, rough, sy, seed: m.seed + c[0] * 7 }), color, {
    pos: c, rot: [0, m.r(0, TAU), 0], scale: r, smooth: true,
    bottom: shade(color, 0.7), top: shade(color, 1.12), hollow, up, over,
  });
}

// Small dots over the top of a crown or cap: blossom, fruit, berries, spots.
function dots(m, c, r, n, color, { size = 0.13, from = 0.1, to = 1.2 } = {}) {
  for (let i = 0; i < n; i++) {
    const p = onSphere(c, r, m.r(0, TAU), m.r(from, to));
    m.add(new THREE.OctahedronGeometry(size), color, { pos: p, rot: [m.r(0, 1), m.r(0, 1), 0], small: true });
  }
}

// ---------------------------------------------------------------- the models
const MODELS = {
  // A conifer: a straight trunk under four or five jagged tiers, each tier's tips drooping; snowed
  // on in the cold (a smaller white tier settled on each).
  pine(m, style) {
    const leaf = style === 'snow' ? C.snowPine : C.pine;
    const tiers = m.pick([4, 4, 5, 5, 6]);
    const R = m.r(1.55, 1.85);
    const top = m.r(5.2, 5.9);
    trunk(m, top - 0.6, 0.3, 0.07, { lean: 0.15, bend: 0.08, roots: 3, color: 0x4a3324 });
    const y0 = m.r(1.0, 1.3);
    const step = (top - y0 - 1.1) / (tiers - 1);
    for (let i = 0; i < tiers; i++) {
      const t = i / (tiers - 1);
      const r = R * (1 - t * 0.7) * m.r(0.92, 1.06);
      const h = 1.55 - t * 0.35;
      const y = y0 + i * step;
      const ry = m.r(0, TAU);
      const lift = 0.86 + t * 0.2;
      m.add(tier(r, h, { teeth: m.far ? 5 : 8 + Math.round((1 - t) * 3), droop: m.r(0.12, 0.24), seed: m.seed + i }), leaf, {
        pos: [m.r(-0.05, 0.05), y, m.r(-0.05, 0.05)], rot: [m.r(-0.06, 0.06), ry, m.r(-0.06, 0.06)],
        bottom: shade(leaf, 0.62 * lift), top: shade(leaf, 1.1 * lift),
      });
      if (style === 'snow') {
        m.add(tier(r * 0.8, h * 0.6, { teeth: m.far ? 5 : 7, droop: 0.05, notch: 0.4, seed: m.seed + i + 50 }), SNOW, {
          pos: [0, y + h * 0.42, 0], rot: [0, ry + 0.3, 0], bottom: 0xd6e2ee, top: SNOW,
        });
      }
    }
    m.add(tier(0.32, 0.9, { teeth: 5, droop: 0.05 }), style === 'snow' ? SNOW : shade(leaf, 1.12), { pos: [0, top - 0.5, 0] });
  },

  // A broadleaf: a trunk that forks into a few branches under a crown of clumps, its middle shaded.
  // Meadow trees blossom or fruit now and then; marsh trees are willows, their strands hanging;
  // jungle trees stand on buttress roots under a wide, dark crown.
  round(m, style) {
    const leaf = style === 'jungle' ? C.jungleLeaf : style === 'willow' ? 0x6a9a4a : m.pick([C.leaf, C.leaf, 0x6ab04e, 0x4e9a48]);
    const pts = trunk(m, 2.6, style === 'jungle' ? 0.4 : 0.34, 0.17, { lean: 0.35, bend: 0.2, roots: style === 'jungle' ? 5 : 3, flare: style === 'jungle' ? 0.9 : 0.45 });
    const head = pts[4];
    const c = [head[0], 3.4 + m.r(-0.15, 0.25), head[2]];
    const R = m.r(1.45, 1.75) * (style === 'jungle' ? 1.12 : 1);
    const hollow = [c[0], c[1] - 0.4, c[2], R * 1.6, 0.38];
    const n = m.pick([4, 5, 5, 6]);
    const a0 = m.r(0, TAU);
    const tips = [];
    for (let i = 0; i < n; i++) {
      const a = a0 + (i / n) * TAU + m.r(-0.3, 0.3);
      const from = pts[3];
      tips.push(i < 3 ? branch(m, from, a, m.r(1.1, 1.5), 0.12, { rise: m.r(0.5, 0.9), small: true }) : onSphere(c, R * 0.75, a, m.r(-0.4, 0.4)));
    }
    clump(m, c, R, leaf, { hollow, sy: style === 'jungle' ? 0.7 : 0.82 });
    for (const t of tips) clump(m, [t[0], Math.max(t[1], c[1] - 0.9) + m.r(-0.1, 0.3), t[2]], m.r(0.85, 1.15) * R / 1.6, leaf, { hollow, detail: 0 });
    clump(m, [c[0] + m.r(-0.3, 0.3), c[1] + R * 0.55, c[2] + m.r(-0.3, 0.3)], R * 0.6, leaf, { hollow });
    if (style === 'bloom' && m.chance(0.6)) dots(m, c, R * 0.95, 16, m.pick([0xffd6e8, 0xffffff, 0xff9ac0, 0xe85a4a, 0xf0a030]), { size: 0.15 });
    if (style === 'willow') {
      // Strands hanging from the rim of the crown.
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU + m.r(-0.2, 0.2);
        const p = onSphere(c, R * 1.0, a, m.r(-0.35, 0.05));
        m.add(blade(m.r(1.5, 2.2), 0.42, { droop: 1.4, fold: 0.1, lift: 0.1, segs: m.far ? 2 : 4 }), leaf, {
          pos: p, quat: yaw(-a + Math.PI / 2), bottom: shade(leaf, 0.75), top: shade(leaf, 1.05),
        });
      }
    }
    if (style === 'jungle') {
      for (let i = 0; i < 3; i++) {
        const a = m.r(0, TAU);
        m.add(blade(1.3, 0.24, { droop: 1.6, fold: 0, lift: 0, segs: 4 }), 0x3f7a3a, { pos: onSphere(c, R * 0.9, a, -0.4), quat: yaw(-a + Math.PI / 2), small: true });
      }
    }
  },

  // A snag: a dead trunk, broken off, its limbs forking bare. Moss on its tops in the fens, ash in
  // the burnt lands (charred black, the odd ember still in it), bleached in the badlands.
  dead(m, style) {
    const col = style === 'charred' ? C.charred : style === 'bleached' ? 0x9a8a78 : style === 'spore' ? 0x5a4a5e : C.dead;
    const up = style === 'moss' ? MOSS : style === 'charred' ? ASH : style === 'bleached' ? 0xd8ccb8 : style === 'spore' ? SPORE : undefined;
    const h = m.r(3.0, 3.8);
    const pts = trunk(m, h, 0.3, 0.12, { lean: 0.45, bend: 0.35, roots: m.pick([2, 3, 4]), color: col, top: col, flare: 0.4 });
    const n = m.pick([3, 4, 4, 5]);
    for (let i = 0; i < n; i++) {
      const p = pts[2 + (i % 3)];
      const at = [p[0], p[1] - m.r(0, 0.5), p[2]];
      const a = m.r(0, TAU);
      const len = m.r(0.9, 1.6) * (1 - i * 0.1);
      const tip = branch(m, at, a, len, 0.09, { rise: m.r(0.3, 1.1), color: col });
      if (m.chance(0.7)) branch(m, tip, a + m.r(-1, 1), len * 0.55, 0.045, { rise: m.r(0.4, 1.4), color: col });
    }
    // The break at the top: a jagged stub.
    m.add(tier(0.17, 0.35, { teeth: 4, droop: -0.3, notch: 0.5 }), shade(col, 1.25), { pos: [pts[4][0], pts[4][1] - 0.05, pts[4][2]], rot: [Math.PI, 0, 0], small: true });
    if (up) for (const p of m.parts) if (p.color === col) { p.up = up; p.over = 0.5; }
    if (style === 'moss') {
      for (let i = 0; i < 4; i++) {
        const p = pts[2 + (i % 3)];
        const a = m.r(0, TAU);
        m.add(blade(m.r(0.7, 1.1), 0.22, { droop: 1.5, fold: 0, lift: 0, segs: 3 }), 0x7a8a50, { pos: [p[0] + Math.cos(a) * 0.15, p[1], p[2] + Math.sin(a) * 0.15], quat: yaw(-a + Math.PI / 2), small: true });
      }
    }
    if (style === 'charred') for (let i = 0; i < 3; i++) m.add(new THREE.OctahedronGeometry(0.07), 0xff7a2a, { pos: [pts[1][0] + m.r(-0.2, 0.2), m.r(0.4, 1.6), pts[1][2] + 0.24], glow: 1.4, small: true });
  },

  // A palm: a ringed trunk leaning on a long curve, fronds cut into leaflets round its head, a
  // bunch of nuts under them.
  palm(m) {
    const lean = m.r(0.6, 1.6);
    const a = m.r(0, TAU);
    const H = 6.3;
    const segs = 7;
    const at = (t) => [Math.cos(a) * lean * t * t, -0.2 + (H + 0.2) * t, Math.sin(a) * lean * t * t];
    for (let i = 0; i < segs; i++) {
      const t0 = i / segs;
      const t1 = (i + 1) / segs;
      const r = 0.3 - t0 * 0.1;
      m.add(limb([at(t0), at((t0 + t1) / 2), at(t1 + 0.01)], r * 1.18, r * 0.9, { sides: m.far ? 5 : 7 }), 0x7a6444, {
        smooth: true, pattern: 'bark', hit: true, bottom: 0x5a4a32, top: 0x8a7450,
      });
    }
    const head = at(1);
    const n = m.pick([7, 8, 9]);
    const f0 = m.r(0, TAU);
    for (let i = 0; i < n; i++) {
      const fa = f0 + (i / n) * TAU + m.r(-0.15, 0.15);
      m.add(blade(m.r(3.0, 3.7), m.r(0.9, 1.1), { droop: m.r(0.55, 0.85), fold: 0.3, lobes: m.far ? 0 : 6, segs: m.far ? 3 : 6, lift: 0.5 }), C.jungleLeaf, {
        pos: head, quat: pitchYaw(m.r(-0.35, -0.1), -fa + Math.PI / 2), bottom: shade(C.jungleLeaf, 0.72), top: shade(C.jungleLeaf, 1.12),
      });
    }
    for (let i = 0; i < 3; i++) {
      const na = m.r(0, TAU);
      m.add(lump(0.2, { detail: 0 }), 0x6a4a2a, { pos: [head[0] + Math.cos(na) * 0.28, head[1] - 0.25, head[2] + Math.sin(na) * 0.28], small: true });
    }
    m.add(lump(0.34, { detail: 0, sy: 0.8 }), 0x5a7a3a, { pos: [head[0], head[1] + 0.05, head[2]] });
  },

  // A giant mushroom: a curving stem with a ring part way up, a domed cap with a lip, gills under
  // it, pale spots on top.
  shroom(m) {
    const cap = m.pick([C.shroomCap, C.shroomCap, 0xb04a8a, 0x6a4ab8]);
    const lean = m.r(0.1, 0.45);
    const a = m.r(0, TAU);
    const pts = [[0, -0.2, 0], [Math.cos(a) * lean * 0.3, 1.2, Math.sin(a) * lean * 0.3], [Math.cos(a) * lean * 0.7, 2.4, Math.sin(a) * lean * 0.7], [Math.cos(a) * lean, 3.1, Math.sin(a) * lean]];
    m.add(limb(pts, 0.4, 0.26, { sides: m.far ? 6 : 9, flare: 0.35 }), C.shroomStem, { smooth: true, hit: true, bottom: 0xc8b8a4, top: C.shroomStem });
    const ring = pts[2];
    m.add(lathe([[0.25, 0.02], [0.52, -0.16], [0.5, -0.24], [0.28, -0.06]], 10), 0xd8ccb8, { pos: ring, smooth: true, small: true });
    const R = m.r(1.45, 1.75);
    const top = m.r(0.75, 1.05);
    const c = [pts[3][0], 3.0, pts[3][2]];
    m.add(lathe([[R * 1.02, 0.02], [R * 0.95, top * 0.4], [R * 0.75, top * 0.78], [R * 0.4, top * 0.97], [0, top]], m.far ? 8 : 14), cap, {
      pos: c, smooth: true, bottom: shade(cap, 0.75), top: shade(cap, 1.15),
    });
    m.add(lathe([[0.25, -0.1], [R * 0.6, -0.04], [R * 1.02, 0.02]], m.far ? 8 : 14), 0xe8d8c8, { pos: c, smooth: true });
    const spot = shade(cap, 1.9);
    for (let i = 0; i < m.pick([6, 8, 10]); i++) {
      const sa = m.r(0, TAU);
      const sr = m.r(0.25, 0.8);
      const y = top * Math.cos(sr * Math.PI / 2) ** 0.8;
      m.add(new THREE.OctahedronGeometry(1), spot, { scale: [m.r(0.14, 0.24), 0.07, m.r(0.14, 0.24)], small: true, pos: [c[0] + Math.cos(sa) * R * sr, c[1] + y + 0.02, c[2] + Math.sin(sa) * R * sr] });
    }
  },

  // A saguaro: a ribbed column with a rounded top, arms out and up from it, a flower or two.
  cactus(m) {
    const H = m.r(3.9, 4.5);
    const col = C.cactus;
    const look = { smooth: true, hit: true, bottom: shade(col, 0.75), top: shade(col, 1.1) };
    m.add(limb([[0, -0.2, 0], [0, H * 0.5, 0], [0, H, 0]], 0.38, 0.32, { sides: m.far ? 6 : 12, ribs: 0.12, round: true }), col, look);
    const arms = m.pick([1, 2, 2, 3]);
    const a0 = m.r(0, TAU);
    for (let i = 0; i < arms; i++) {
      const a = a0 + (i / arms) * TAU + m.r(-0.4, 0.4);
      const y = m.r(1.6, 2.8);
      const d = m.r(0.9, 1.35);
      const up = m.r(1.0, 1.7);
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      m.add(limb([[0, y, 0], [ca * d * 0.6, y + 0.05, sa * d * 0.6], [ca * d * 0.95, y + 0.35, sa * d * 0.95], [ca * d, y + up, sa * d]], 0.24, 0.2, { sides: m.far ? 6 : 10, ribs: 0.12, round: true }), col, look);
      if (m.chance(0.35)) m.add(new THREE.OctahedronGeometry(0.14), m.pick([0xf0e070, 0xff7aa0, 0xffffff]), { pos: [ca * d, y + up + 0.22, sa * d], small: true });
    }
    if (m.chance(0.5)) m.add(new THREE.OctahedronGeometry(0.16), m.pick([0xf0e070, 0xff7aa0]), { pos: [0, H + 0.35, 0], small: true });
  },

  // A rock: a fractured body, the odd chunk fallen against it, its facets weathered; moss, snow,
  // ash or spores on its top, or crystal growing out of it. Strata in the sandstone and the
  // badlands. `big`: a boulder, more broken.
  rock(m, style, { big = false, color = C.stone, bands = null } = {}) {
    const base = style === 'ash' ? 0x7a7470 : color;
    const up = { moss: MOSS, snow: SNOW, ash: ASH, spore: SPORE, lichen: LICHEN }[style];
    const look = { pattern: 'rock', hit: true, speckle: 0.07, up, over: style === 'snow' ? 0.45 : 0.62, bottom: shade(base, 0.82), top: shade(base, 1.06), bands };
    m.add(lump(1, { detail: 1, rough: big ? 0.26 : 0.2, floor: -0.45, seed: m.seed }), base, { ...look, rot: [0, m.r(0, TAU), 0], scale: [m.r(0.9, 1.15), 1, m.r(0.85, 1.1)] });
    const chunks = big ? m.pick([2, 3]) : m.pick([0, 1, 1, 2]);
    for (let i = 0; i < chunks; i++) {
      const a = m.r(0, TAU);
      const s = m.r(0.32, 0.5);
      m.add(lump(1, { detail: 0, rough: 0.25, floor: -0.4, seed: m.seed + i }), base, { ...look, pos: [Math.cos(a) * 0.85, -0.2, Math.sin(a) * 0.85], rot: [m.r(-0.4, 0.4), m.r(0, TAU), 0], scale: s });
    }
    if (style === 'crystal') {
      for (let i = 0; i < m.pick([2, 3, 4]); i++) {
        const a = m.r(0, TAU);
        const s = m.r(0.18, 0.3);
        m.add(new THREE.OctahedronGeometry(1, 0), C.crystal, {
          pos: [Math.cos(a) * 0.55, m.r(0.4, 0.7), Math.sin(a) * 0.55], rot: [Math.cos(a) * 0.5, m.r(0, TAU), Math.sin(a) * -0.5],
          scale: [s, s * 3.2, s], bottom: 0x6a8aff, top: 0xd8f4ff,
        });
      }
    }
  },

  // A hoodoo: a column of soft stone in bands, pinched in the middle, a harder cap balanced on top.
  hoodoo(m) {
    const col = shade(C.redrock, 1.08);
    const look = { pattern: 'rock', hit: true, speckle: 0.05, bands: [shade(col, 0.86), 0.55] };
    const lean = m.r(-0.15, 0.15);
    m.add(limb([[0, -0.3, 0], [lean * 0.5, 1.6, 0], [lean, 3.4, 0.1], [lean * 1.2, 5.3, 0.15]], 1.35, 0.5, { sides: 9, flare: 0.25, seed: m.seed }), col, { ...look, smooth: false });
    m.add(lump(1, { detail: 1, rough: 0.18, floor: -0.5, seed: m.seed + 3 }), C.redrockDark, { ...look, bands: null, pos: [lean * 1.2 + 0.15, 5.55, 0.15], scale: [m.r(1.3, 1.7), 0.5, m.r(1.2, 1.5)], up: shade(C.redrockDark, 1.25), over: 0.6 });
    for (let i = 0; i < 2; i++) {
      const a = m.r(0, TAU);
      m.add(lump(m.r(0.4, 0.6), { detail: 0, rough: 0.25, floor: -0.4 }), col, { ...look, pos: [Math.cos(a) * 1.4, 0, Math.sin(a) * 1.4] });
    }
  },

  // A crystal cluster: shards growing out of a stone foot, each leaning out, deep at the root and
  // pale at the tip. `spire`: one great shard with a few at its foot.
  crystal(m, style, { spire = false } = {}) {
    const col = spire ? 0xb894ff : 0x8ce0ff;
    const look = (s) => ({ hit: true, bottom: shade(col, 0.6), top: shade(col, 1.3), speckle: 0.04, ...s });
    m.add(lump(spire ? 1.1 : 0.6, { detail: 0, rough: 0.25, floor: -0.3 }), C.stoneDark, { hit: true, pattern: 'rock', pos: [0, 0, 0] });
    if (spire) m.add(new THREE.OctahedronGeometry(1, 0), col, look({ pos: [0, 4.5, 0], scale: [1, 5, 1], rot: [0, m.r(0, TAU), m.r(-0.05, 0.05)] }));
    const n = spire ? 3 : m.pick([4, 5, 6]);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + m.r(-0.4, 0.4);
      const s = (i === 0 && !spire ? 1 : m.r(0.45, 0.8)) * (spire ? 0.7 : 1);
      const out = i === 0 && !spire ? 0 : m.r(0.3, 0.6) * (spire ? 1.6 : 1);
      const tilt = i === 0 && !spire ? 0.1 : m.r(0.3, 0.6);
      m.add(new THREE.OctahedronGeometry(0.55, 0), col, look({
        pos: [Math.cos(a) * out, 1.2 * s - 0.1, Math.sin(a) * out], scale: [s * 0.8, s * 2.6, s * 0.8],
        quat: yaw(-a).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -tilt)),
      }));
    }
  },

  // A bush: a few clumps heaped together, berries or flowers on some.
  bush(m, style) {
    const col = style === 'jungle' ? 0x3f8a3e : m.pick([C.bush, C.bush, 0x6aa850, 0x548a44]);
    const n = m.pick([3, 4, 5]);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + m.r(-0.3, 0.3);
      const d = i === 0 ? 0 : m.r(0.35, 0.6);
      clump(m, [Math.cos(a) * d, i === 0 ? 0.1 : m.r(-0.15, 0.05), Math.sin(a) * d], i === 0 ? 0.75 : m.r(0.45, 0.62), col, { detail: i === 0 ? 1 : 0, sy: 0.85, hollow: [0, -0.3, 0, 1.2, 0.35] });
    }
    if (style !== 'jungle' && m.chance(0.45)) dots(m, [0, 0.15, 0], 0.72, 9, m.pick([0xd83a3a, 0x6a3ad8, 0xffffff, 0xf0c030]), { size: 0.07, from: -0.2 });
  },

  // A dry bush: a tangle of bare twigs over a few dry tufts.
  dryBush(m) {
    for (let i = 0; i < 7; i++) {
      const a = m.r(0, TAU);
      const r = m.r(0.35, 0.65);
      m.add(limb([[0, -0.1, 0], [Math.cos(a) * r * 0.5, m.r(0.2, 0.4), Math.sin(a) * r * 0.5], [Math.cos(a) * r, m.r(0.35, 0.75), Math.sin(a) * r]], 0.035, 0.012, { sides: 3 }), 0x7a6a4a, {});
    }
    for (let i = 0; i < 3; i++) {
      const a = m.r(0, TAU);
      m.add(lump(m.r(0.22, 0.32), { detail: 0, rough: 0.3, sy: 0.7 }), 0x9a8a5a, { pos: [Math.cos(a) * 0.25, 0.15, Math.sin(a) * 0.25], bottom: 0x7a6a40, top: 0xb0a070 });
    }
  },

  // A fern: arching fronds cut into leaflets, round a little crown.
  fern(m) {
    const n = m.pick([6, 7, 8]);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + m.r(-0.2, 0.2);
      m.add(blade(m.r(1.6, 2.2), 0.55, { droop: m.r(0.6, 0.9), fold: 0.2, lobes: m.far ? 0 : 6, segs: m.far ? 3 : 6, lift: 0.9 }), 0x2f8a3a, {
        pos: [0, 0.05, 0], quat: pitchYaw(m.r(-0.7, -0.4), -a + Math.PI / 2), bottom: 0x24642c, top: 0x48a050,
      });
    }
  },

  // A puffball: round and pale, a few darker scales, a frill at its foot.
  puff(m) {
    m.add(lump(0.6, { detail: 1, rough: 0.08, sy: 0.85 }), 0xd8b8e8, { smooth: true, bottom: 0xa888c0, top: 0xf0dcf8 });
    dots(m, [0, 0, 0], 0.55, 7, 0xb898c8, { size: 0.08, from: 0.3, to: 1.4 });
    m.add(tier(0.55, 0.25, { teeth: 7, droop: 0.4, notch: 0.4 }), 0xb898c8, { pos: [0, -0.4, 0] });
  },

  // Reeds: a cattail's stalk and its brown head, and a few long leaves.
  reed(m) {
    const h = m.r(1.2, 1.5);
    m.add(limb([[0, 0, 0], [0.03, h * 0.5, 0], [0.05, h, 0]], 0.025, 0.018, { sides: 4 }), C.reed, {});
    m.add(limb([[0.05, h - 0.05, 0], [0.055, h + 0.3, 0]], 0.05, 0.05, { sides: 6, round: true }), 0x6a4a2a, {});
    for (let i = 0; i < 3; i++) {
      const a = m.r(0, TAU);
      m.add(blade(m.r(0.8, 1.1), 0.05, { droop: 0.35, fold: 0, lift: 0.2, segs: 2 }), 0x6a8a3a, { quat: pitchYaw(-1.25, a), bottom: 0x4a6a2a, top: 0x8aa04a });
    }
  },

  // A grass tuft: a few blades leaning out.
  tuft(m) {
    const n = m.pick([3, 4]);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + m.r(-0.4, 0.4);
      m.add(blade(m.r(0.4, 0.55), 0.09, { droop: 0.15, fold: 0, lift: 1.6, segs: 1 }), 0x62ab4c, { quat: pitchYaw(-1.25, a), bottom: 0x4a8a3a, top: 0x7ac05a });
    }
  },

  // A flower head: petals round a yellow eye (in a tuft's own frame, riding its tip).
  flower(m, style, color) {
    m.add(tier(0.11, 0.03, { teeth: 5, droop: -0.6, notch: 0.55 }), color, { rot: [0, m.r(0, TAU), 0] });
    m.add(lump(0.035, { detail: 0 }), color === 0xfff27a ? 0xd88a2a : 0xf0c830, { pos: [0, 0.03, 0] });
  },
};

// ---------------------------------------------------------------- the sets
// Each scattered kind: its model, its styles (by biome), how many variants, whether it has a far
// model (drawn past the nearest chunks), whether it has blades in it (drawn double-sided), the line
// weight of its ink, whether it casts a shadow, and how it sways ({ amp, base }: amp × the square of the height
// above base, in the model's units — trunks and rocks don't sway; crowns and grass tips do).
const SWAY = {
  crown: { amp: 0.008, base: 1.8 },
  pine: { amp: 0.004, base: 0.6 },
  bare: { amp: 0.002, base: 0.8 },
  bush: { amp: 0.03, base: -0.6 },
  reed: { amp: 0.06, base: 0 },
  tuft: { amp: 0.3, base: 0 },
  head: { amp: 0.27, base: -0.35 }, // flowers ride the tips of the tufts they grow from
  frond: { amp: 0.012, base: 4.5 },
  fern: { amp: 0.035, base: 0 },
};
const ROCKY = { meadow: 'moss', forest: 'moss', highland: 'lichen', marsh: 'moss', jungle: 'moss', snow: 'snow', mountain: 'snow', ash: 'ash', crystal: 'crystal', fungal: 'spore' };
export const KINDS = {
  pine: { model: 'pine', variants: 3, styles: ['plain'], far: true, outline: 0.05, wind: SWAY.pine },
  snowPine: { model: 'pine', variants: 3, styles: ['snow'], far: true, outline: 0.05, wind: SWAY.pine },
  round: { model: 'round', variants: 3, far: true, double: true, styles: ['plain', 'bloom', 'willow', 'jungle'], by: { meadow: 'bloom', marsh: 'willow', jungle: 'jungle' }, outline: 0.05, wind: SWAY.crown },
  dead: { model: 'dead', variants: 3, far: true, double: true, styles: ['plain', 'moss', 'bleached', 'spore'], by: { marsh: 'moss', badlands: 'bleached', fungal: 'spore' }, outline: 0.04, wind: SWAY.bare },
  charred: { model: 'dead', variants: 3, far: true, styles: ['charred'], outline: 0.04, wind: SWAY.bare },
  rock: { model: 'rock', variants: 2, styles: ['plain', 'moss', 'lichen', 'snow', 'ash', 'crystal', 'spore'], by: ROCKY, outline: 0.05 },
  boulder: { model: 'rock', variants: 2, styles: ['plain', 'moss', 'lichen', 'snow', 'ash', 'crystal', 'spore'], by: ROCKY, outline: 0.06, opts: { big: true, color: shade(C.stone, 0.92) } },
  sandRock: { model: 'rock', variants: 2, styles: ['plain'], outline: 0.05, opts: { color: C.sandstone, bands: [shade(C.sandstone, 0.86), 0.4] } },
  redRock: { model: 'rock', variants: 2, styles: ['plain'], outline: 0.05, opts: { color: C.redrock, bands: [shade(C.redrock, 0.85), 0.35] } },
  hoodoo: { model: 'hoodoo', variants: 2, styles: ['plain'], outline: 0.06 },
  cactus: { model: 'cactus', variants: 3, far: true, styles: ['plain'], outline: 0.04 },
  palm: { model: 'palm', variants: 3, far: true, double: true, styles: ['plain'], outline: 0.04, wind: SWAY.frond },
  fern: { model: 'fern', variants: 3, far: true, double: true, styles: ['plain'], outline: 0.025, shadow: false, wind: SWAY.fern },
  crystal: { model: 'crystal', variants: 2, styles: ['plain'], outline: 0.04 },
  spire: { model: 'crystal', variants: 2, styles: ['plain'], outline: 0.06, opts: { spire: true } },
  shroom: { model: 'shroom', variants: 3, far: true, styles: ['plain'], outline: 0.05 },
  puff: { model: 'puff', variants: 2, styles: ['plain'], outline: 0.03, shadow: false },
  bush: { model: 'bush', variants: 3, styles: ['plain', 'jungle'], by: { jungle: 'jungle' }, outline: 0.035, wind: SWAY.bush },
  dryBush: { model: 'dryBush', variants: 2, styles: ['plain'], outline: 0.02, shadow: false },
  reed: { model: 'reed', variants: 2, double: true, styles: ['plain'], outline: 0, shadow: false, wind: SWAY.reed },
  tuft: { model: 'tuft', variants: 2, double: true, styles: ['plain'], outline: 0, shadow: false, wind: SWAY.tuft },
  flowerY: { model: 'flower', variants: 1, styles: ['plain'], outline: 0, shadow: false, wind: SWAY.head, opts: 0xfff27a },
  flowerW: { model: 'flower', variants: 1, styles: ['plain'], outline: 0, shadow: false, wind: SWAY.head, opts: 0xffffff },
  flowerP: { model: 'flower', variants: 1, styles: ['plain'], outline: 0, shadow: false, wind: SWAY.head, opts: 0xff8ac6 },
  flowerB: { model: 'flower', variants: 1, styles: ['plain'], outline: 0, shadow: false, wind: SWAY.head, opts: 0x9ad0ff },
};

// The set a kind growing at (x, z) in `biome` is drawn from: its style there, and a variant picked
// by where it stands (not from the scatter's own random numbers, which then run as they always have).
export function sceneryKey(kind, biome, x, z) {
  const k = KINDS[kind];
  const style = k.by?.[biome] ?? k.styles[0];
  const v = Math.floor(((jitter(x, 0, z, 11) + 1) / 2) * k.variants * 0.9999);
  return `${kind}.${style}#${v}`;
}

// A per-instance tint (a little lighter or darker, warmer or cooler) for the one at (x, z).
export function sceneryTint(x, z, out) {
  const l = 1 + jitter(x, 1, z, 3) * 0.09;
  const w = jitter(x, 2, z, 4) * 0.05;
  return out.setRGB(l * (1 + w), l, l * (1 - w));
}

// Builds a set's model: { geo, hit } (world/scenery/kit.js Model.build). far: as seen from afar.
const cache = new Map();
export function sceneryModel(key, { draw = true, far = false } = {}) {
  const ck = `${key}|${draw}|${far}`;
  if (cache.has(ck)) return cache.get(ck);
  const [kind, rest] = key.split('.');
  const [style] = rest.split('#');
  const k = KINDS[kind];
  let h = 2166136261;
  for (const ch of key) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const m = new Model(h >>> 0, { far });
  MODELS[k.model](m, style, k.opts);
  const built = m.build({ draw });
  cache.set(ck, built);
  return built;
}

// Every set's key (for the checks, and anything that wants them all).
export const SCENERY_KEYS = Object.entries(KINDS).flatMap(([kind, k]) => k.styles.flatMap((s) => Array.from({ length: k.variants }, (_, v) => `${kind}.${s}#${v}`)));
