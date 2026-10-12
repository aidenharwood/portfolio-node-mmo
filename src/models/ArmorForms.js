// Armour visual forms. Each slot kind has several shapes; manufacturers choose from their own
// subset (manufacturers.js → forms.armorHead/Chest/Hands/Legs). Forms build onto the humanoid's
// bones (skull, torso, forearm/hand, thigh/shin/foot) so armour reshapes the silhouette and moves
// with the joints. Helms are modelled round a head of radius ~0.23 and leg forms for a 0.42 thigh
// and 0.40 shin; applyArmor fits them to the body (Human.headwear, stretched leg groups).
import * as THREE from 'three';
import { piece, bakeTree, shade, G } from '../render/ModelKit.js';
import { MANUFACTURERS } from '../items/manufacturers.js';
import { RARITY } from '../items/rarity.js';
import { PART_INDEX } from '../items/parts.js';
import { ARMOR_SLOTS } from '../items/armorTypes.js';
import { rivets, panelLine, cable, emblem } from '../render/Greeble.js';
import { makeCapeGrid } from './Characters.js';
import { fist, BODY, HUMAN, bootFoot as footShape } from './Human.js';
import { shellGeometry, onShell, sliceProfile } from '../render/Shell.js';

const GOLD = 0xf0c75e;
const BONE = 0xe4e8ef;
const DARK = 0x2a2a30;


const MATERIAL_COLOR = {
  cloth: (p) => p.secondary,
  leather: (p) => p.secondary,
  chain: (p) => shade(p.metal, 0.75),
  plate: (p) => p.metal,
};

export function armorContext(item) {
  const mfr = MANUFACTURERS[item.manufacturer];
  const rar = RARITY[item.rarity];
  const part = (slot) => PART_INDEX[item.parts[slot]]?.visual ?? {};
  const mat = part('material').material ?? 'leather';
  return {
    item, pal: mfr.palette, rar, tier: rar.tier, mat,
    main: MATERIAL_COLOR[mat](mfr.palette),
    accent: mfr.palette.energy,
    rarityColor: rar.color,
    showAccent: true,
    trim: part('trim'),
  };
}

// ================================================================ HEAD (head group, skull r≈0.24) — helms with lit visors
const visorArc = (g, c, y = 0.03, r = 0.262, h = 0.035) =>
  piece(g, G.torus(r, h, Math.PI * 0.95, 4, 18), c.accent, { pos: [0, y, 0], rot: [Math.PI / 2, 0, 0.025 * Math.PI], glow: true, outline: 0.008 });

export const ARMOR_HEAD = {
  hood: {
    name: 'Techno Hood', hidesHair: true,
    build: (g, c) => {
      piece(g, G.hood(0.3), c.main, { pos: [0, 0.03, -0.03], scale: [1, 1.05, 1.05] });
      piece(g, G.box(0.36, 0.055, 0.05), c.accent, { pos: [0, 0.04, 0.24], glow: true, outline: 0.008 });
      for (const s of [-1, 1]) piece(g, G.cyl(0.06, 0.06, 0.05, 10), c.pal.metal, { pos: [0.26 * s, 0.02, 0.06], rot: [0, 0, Math.PI / 2], outline: 0.01 });
      piece(g, G.box(0.2, 0.26, 0.06), shade(c.main, 0.8), { pos: [0, -0.02, -0.3], rot: [0.3, 0, 0] });
    },
  },
  helm: {
    name: 'Visor Helm', hidesHair: true,
    build: (g, c) => {
      piece(g, G.dome(0.275, 16, 8, 0.58), c.main, { pos: [0, 0.0, 0] });
      visorArc(g, c);
      for (const s of [-1, 1]) piece(g, G.cyl(0.07, 0.07, 0.06, 10), c.pal.secondary, { pos: [0.27 * s, -0.02, 0], rot: [0, 0, Math.PI / 2], outline: 0.01 });
      piece(g, G.cyl(0.01, 0.01, 0.34, 4), c.pal.metal, { pos: [-0.28, 0.26, -0.05], rot: [0, 0, 0.15], outline: 0 });
      piece(g, G.sphere(0.022, 6, 4), c.accent, { pos: [-0.305, 0.43, -0.05], glow: true, outline: 0 });
    },
  },
  greathelm: {
    name: 'Sealed Helm', hidesHair: true, hidesFace: true,
    build: (g, c) => {
      piece(g, G.cyl(0.27, 0.29, 0.44, 16), c.main, { pos: [0, 0.0, 0.0] });
      piece(g, G.dome(0.27, 16, 6, 0.5), c.main, { pos: [0, 0.22, 0] });
      piece(g, G.box(0.3, 0.04, 0.05), c.accent, { pos: [0, 0.04, 0.27], glow: true, outline: 0 });
      piece(g, G.box(0.035, 0.16, 0.05), c.accent, { pos: [0, -0.06, 0.28], glow: true, outline: 0 });
      for (const s of [-1, 1]) for (let i = 0; i < 3; i++) piece(g, G.box(0.04, 0.02, 0.12), DARK, { pos: [0.28 * s, -0.08 + i * 0.05, 0.05], outline: 0 });
      piece(g, G.box(0.04, 0.14, 0.36), c.pal.secondary, { pos: [0, 0.42, -0.02], outline: 0.012 });
    },
  },
  horned: {
    name: 'Crested Helm', hidesHair: true,
    build: (g, c) => {
      piece(g, G.dome(0.275, 16, 8, 0.58), c.main, { pos: [0, 0.0, 0] });
      visorArc(g, c, 0.03, 0.262, 0.028);
      for (const s of [-1, 1]) {
        const fin = G.extrude(G.shape([[0, 0], [0.12, 0.06], [0.42, 0.4], [0.3, 0.42], [0.05, 0.18]].map(([x, y]) => [x * s, y])), 0.03, 0.006).rotateY(Math.PI / 2);
        piece(g, fin, c.pal.metal, { pos: [0.2 * s, 0.12, -0.02] });
        piece(g, G.box(0.02, 0.2, 0.02), c.accent, { pos: [0.33 * s, 0.32, -0.02], rot: [0, 0, -0.75 * s], glow: true, outline: 0 });
      }
    },
  },
  circlet: {
    name: 'Halo Circlet',
    build: (g, c) => {
      piece(g, G.torus(0.25, 0.016, Math.PI * 2, 5, 24), c.trim.gilded ? GOLD : c.pal.metal, { pos: [0, 0.1, 0], rot: [Math.PI / 2 - 0.15, 0, 0], outline: 0.008 });
      piece(g, G.octa(0.045), c.accent, { pos: [0, 0.14, 0.25], scale: [1, 1.4, 0.5], glow: true, outline: 0.008 });
      piece(g, G.torus(0.2, 0.012, Math.PI * 2, 4, 24), c.accent, { pos: [0, 0.42, -0.04], rot: [Math.PI / 2 - 0.3, 0, 0], glow: true, outline: 0 });
    },
  },
  wizard: {
    name: 'Spire Crown', hidesHair: true,
    build: (g, c) => {
      piece(g, G.cyl(0.27, 0.26, 0.14, 16), c.main, { pos: [0, 0.14, 0] });
      for (let i = 0; i < 5; i++) {
        const a = -0.9 + i * 0.45;
        const h = i === 2 ? 0.4 : 0.26;
        piece(g, G.cone(0.04, h, 4), c.pal.metal, { pos: [Math.sin(a) * 0.25, 0.2 + h / 2, Math.cos(a) * 0.23], outline: 0.01 });
        piece(g, G.sphere(0.022, 6, 4), c.accent, { pos: [Math.sin(a) * 0.25, 0.22 + h, Math.cos(a) * 0.23], glow: true, outline: 0 });
      }
      piece(g, G.torus(0.27, 0.012, Math.PI * 2, 4, 20), c.accent, { pos: [0, 0.1, 0], rot: [Math.PI / 2, 0, 0], glow: true, outline: 0 });
    },
  },
};

// ================================================================ CHEST (seg = { chest, spine, hips, armL, armR, thighL, thighR })
// Plates are lofted from the body's own torso shells (models/Characters.js BODY), inflated to sit
// over the clothes, so armour follows the chest, waist and back instead of being a tube.
const TAU = Math.PI * 2;

// A plate band of `profile` between heights y0..y1 on `g`.
// `open` leaves a gap of that half-angle at the front; `arc` = [start, length] keeps only that span.
function plate(g, profile, y0, y1, color, { inflate = 0.03, open = 0, arc = null, steps = 4, outline = 0.018, glow = false } = {}) {
  const opts = { inflate, ...(open ? { thetaStart: open, thetaLength: TAU - 2 * open } : {}), ...(arc ? { thetaStart: arc[0], thetaLength: arc[1] } : {}) };
  return piece(g, shellGeometry(sliceProfile(profile, y0, y1, steps), opts), color, { outline, glow });
}
// A piece placed flat on a shell surface at height y / angle θ, facing outward.
function onPlate(g, profile, y, theta, out, geo, color, opts = {}) {
  const o = onShell(profile, y, theta, out);
  return piece(g, geo, color, { ...opts, pos: o.pos, rot: [opts.pitch ?? 0, o.yaw, opts.roll ?? 0] });
}
// Curved strap riding a shell surface through (θ, y) waypoints.
function strap(g, profile, waypoints, out, r, color) {
  piece(g, G.tube(waypoints.map(([t, y]) => onShell(profile, y, t, out).pos), r, 24, 6), color, { outline: 0.008 });
}
const reactor = (g, c, profile, y, r = 0.06) => {
  onPlate(g, profile, y, 0, 0.045, G.cylZ(r * 1.45, r * 1.45, 0.04, 14), c.pal.metal, { outline: 0.01 });
  onPlate(g, profile, y, 0, 0.065, G.cylZ(r, r, 0.03, 14), c.accent, { glow: true, outline: 0 });
  onPlate(g, profile, y, 0, 0.07, G.torus(r * 1.15, 0.008, TAU, 4, 16), DARK, { outline: 0 });
};
// Layered shoulder plates on an upper-arm bone (s = side).
function pauldron(arm, c, s, { size = 1, layers = 3, color = c.main, trim = c.accent } = {}) {
  for (let i = 0; i < layers; i++) {
    const k = size * (1 - i * 0.12);
    piece(arm, G.dome(0.17 * k, 16, 7, 0.5), shade(color, 1 - i * 0.07), { pos: [0.035 * s, 0.03 - i * 0.075 * size, 0], rot: [0, 0, -0.42 * s], scale: [1, 0.75, 1.05] });
  }
  piece(arm, G.torus(0.165 * size, 0.012, Math.PI, 4, 16), trim, { pos: [0.035 * s, 0.03, 0], rot: [0, Math.PI / 2, -0.42 * s + Math.PI / 2], glow: true, outline: 0 });
}

export const ARMOR_CHEST = {
  vest: {
    name: 'Utility Rig',
    build: (g, c) => {
      const { chest: C, spine: S } = BODY;
      plate(g.chest, C, -0.1, 0.27, c.main, { inflate: 0.03, open: 0.42, steps: 5 });
      plate(g.spine, S, -0.05, 0.22, c.main, { inflate: 0.032, open: 0.42 });
      plate(g.spine, S, -0.06, -0.01, shade(c.main, 0.75), { inflate: 0.04, open: 0.42, outline: 0.012 });
      for (const s of [-1, 1]) {
        strap(g.chest, C, [[0.5 * s, 0.18], [0.62 * s, 0.3], [0.75 * s, 0.36], [(Math.PI - 0.7) * s, 0.3], [(Math.PI - 0.55) * s, 0.16]], 0.04, 0.028, c.pal.secondary);
        for (const [y, t] of [[0.07, 0.62], [-0.04, 0.62]]) {
          onPlate(g.chest, C, y, t * s, 0.07, G.box(0.1, 0.1, 0.06), shade(c.main, 0.72), { outline: 0.008 });
          onPlate(g.chest, C, y + 0.05, t * s, 0.1, G.box(0.08, 0.016, 0.012), c.accent, { glow: true, outline: 0 });
        }
        onPlate(g.spine, S, 0.06, 1.1 * s, 0.065, G.box(0.09, 0.12, 0.07), shade(c.main, 0.72), { outline: 0.008 });
      }
      piece(g.chest, G.torus(0.12, 0.03, TAU, 6, 18), c.pal.secondary, { pos: [0, 0.29, 0], rot: [Math.PI / 2, 0, 0], scale: [1, 0.8, 1], outline: 0.01 });
      if (!c.capeWorn) onPlate(g.chest, C, 0.1, Math.PI, 0.085, G.box(0.26, 0.32, 0.1), c.pal.secondary);
      if (!c.capeWorn) onPlate(g.chest, C, 0.1, Math.PI, 0.14, G.box(0.04, 0.24, 0.02), c.accent, { glow: true, outline: 0 });
    },
  },
  cuirass: {
    name: 'Power Cuirass',
    build: (g, c) => {
      const { chest: C, spine: S, pelvis: Pv } = BODY;
      plate(g.chest, C, -0.1, 0.29, c.main, { inflate: 0.036, steps: 6 });
      // Pectoral plates: thick bevelled slabs sitting on the chest curve.
      const pecPts = [[-0.11, 0.06], [0.1, 0.07], [0.13, -0.02], [0.07, -0.08], [-0.1, -0.06]];
      for (const s of [-1, 1]) {
        const o = onShell(C, 0.15, 0.5 * s, 0.05);
        // Mirror by reflecting the outline (not the mesh) so faces keep their winding.
        const geo = G.extrude(G.shape(s > 0 ? pecPts : pecPts.map(([x, y]) => [-x, y]).reverse()), 0.035, 0.01);
        piece(g.chest, geo, shade(c.main, 1.12), { pos: o.pos, rot: [-0.12, o.yaw, 0] });
        onPlate(g.chest, C, 0.21, 0.42 * s, 0.075, G.box(0.08, 0.01, 0.01), c.accent, { glow: true, outline: 0 });
      }
      reactor(g.chest, c, C, 0.08);
      plate(g.chest, C, 0.27, 0.36, c.pal.metal, { inflate: 0.035, steps: 3, outline: 0.012 });
      // Segmented abdomen plates, each a band a little proud of the last.
      for (let i = 0; i < 3; i++) {
        const y0 = 0.16 - i * 0.075;
        plate(g.spine, S, y0 - 0.06, y0, i % 2 ? shade(c.main, 0.88) : c.main, { inflate: 0.03 + i * 0.004, arc: [-1.35, 2.7], steps: 3, outline: 0.012 });
      }
      plate(g.spine, S, -0.06, 0.22, shade(c.pal.secondary, 0.8), { inflate: 0.024, outline: 0.012 });
      for (const s of [-1, 1]) {
        pauldron(g[s > 0 ? 'armL' : 'armR'], c, s, { size: 1.05 });
        onPlate(g.hips, Pv, -0.04, 0.55 * s, 0.05, G.box(0.13, 0.18, 0.03), c.main, { pitch: -0.1 });
      }
      // Back power pack with twin cells and vents.
      if (!c.capeWorn) onPlate(g.chest, C, 0.1, Math.PI, 0.1, G.box(0.36, 0.38, 0.13), c.pal.secondary);
      if (!c.capeWorn) for (const s of [-1, 1]) onPlate(g.chest, C, 0.1, Math.PI + 0.22 * s, 0.17, G.cyl(0.045, 0.045, 0.32, 10), c.accent, { glow: true, outline: 0.008 });
      if (!c.capeWorn) for (let i = 0; i < 4; i++) onPlate(g.chest, C, -0.02 + i * 0.05, Math.PI, 0.17, G.box(0.12, 0.012, 0.01), DARK, { outline: 0 });
    },
  },
  robe: {
    name: 'Techrobe',
    build: (g, c) => {
      const { chest: C, spine: S, pelvis: Pv } = BODY;
      plate(g.chest, C, -0.1, 0.31, c.main, { inflate: 0.024, open: 0.22, steps: 6 });
      plate(g.spine, S, -0.06, 0.22, c.main, { inflate: 0.026, open: 0.22 });
      plate(g.hips, Pv, 0.0, 0.11, c.pal.secondary, { inflate: 0.03, outline: 0.012 });
      plate(g.hips, Pv, 0.045, 0.065, c.accent, { inflate: 0.034, glow: true, outline: 0 });
      // Coat tails: flaps that ride the thighs (front) and hang from the hips (back).
      const flap = (w0, w1, len) => G.extrude(G.shape([[-w0, 0], [w0, 0], [w1, -len], [w1 * 0.4, -len - 0.04], [-w1, -len]]), 0.02, 0.006);
      for (const s of [-1, 1]) {
        const thigh = g[s > 0 ? 'thighL' : 'thighR'];
        piece(thigh, flap(0.09, 0.12, 0.48), c.main, { pos: [0.01 * s, -0.04, 0.115], rot: [-0.06, 0, 0] });
        piece(thigh, G.box(0.02, 0.4, 0.024), c.accent, { pos: [-0.075 * s, -0.24, 0.13], rot: [-0.06, 0, 0], glow: true, outline: 0 });
        piece(thigh, flap(0.09, 0.12, 0.48), shade(c.main, 0.9), { pos: [0.04 * s, -0.04, -0.12], rot: [0.08, 0, 0] });
      }
      onPlate(g.hips, Pv, -0.06, Math.PI, 0.03, flap(0.14, 0.18, 0.5), c.main, { pitch: 0.1 });
      // High collar and glowing seams down the opening.
      piece(g.chest, shellGeometry([{ y: 0.24, w: 0.19, zf: 0.12, zb: 0.13, n: 2.3 }, { y: 0.32, w: 0.115, zf: 0.09, zb: 0.095, n: 2.2 }, { y: 0.38, w: 0.105, zf: 0.09, zb: 0.09, n: 2.2 }],
        { thetaStart: 0.6, thetaLength: TAU - 1.2, inflate: 0.02 }), c.pal.secondary, { outline: 0.014 });
      for (const s of [-1, 1]) {
        strap(g.chest, C, [[0.22 * s, 0.3], [0.24 * s, 0.15], [0.24 * s, 0.0], [0.23 * s, -0.1]], 0.03, 0.009, c.accent);
        piece(g[s > 0 ? 'armL' : 'armR'], G.dome(0.15, 14, 6, 0.5), c.pal.secondary, { pos: [0.03 * s, 0.02, 0], rot: [0, 0, -0.45 * s], scale: [1, 0.7, 1] });
      }
      reactor(g.chest, c, C, 0.2, 0.04);
    },
  },
  brigandine: {
    name: 'Hexplate Rig',
    build: (g, c) => {
      const { chest: C, spine: S } = BODY;
      plate(g.chest, C, -0.1, 0.3, c.pal.secondary, { inflate: 0.026, steps: 6 });
      plate(g.spine, S, -0.06, 0.22, c.pal.secondary, { inflate: 0.028 });
      const hex = G.cylZ(0.052, 0.052, 0.022, 6);
      const rows = [[g.chest, C, [0.22, 0.13, 0.04, -0.05]], [g.spine, S, [0.15, 0.06]]];
      for (const [bone, prof, ys] of rows) {
        ys.forEach((y, ri) => {
          for (let k = -3; k <= 3; k++) {
            const t = k * 0.34 + (ri % 2 ? 0.17 : 0);
            if (Math.abs(t) > 1.15) continue;
            onPlate(bone, prof, y, t, 0.042, hex, (k + ri) % 3 ? c.main : shade(c.main, 1.15), { roll: Math.PI / 6, outline: 0.006 });
          }
        });
      }
      onPlate(g.chest, C, 0.1, 0, 0.06, G.box(0.03, 0.34, 0.02), c.accent, { glow: true, outline: 0 });
      for (const s of [-1, 1]) {
        const arm = g[s > 0 ? 'armL' : 'armR'];
        piece(arm, G.box(0.2, 0.06, 0.24), c.main, { pos: [0.06 * s, 0.07, 0], rot: [0, 0, -0.4 * s] });
        piece(arm, G.box(0.18, 0.05, 0.22), shade(c.main, 0.85), { pos: [0.09 * s, -0.01, 0], rot: [0, 0, -0.55 * s] });
        strap(g.chest, C, [[1.3 * s, 0.2], [1.45 * s, 0.05], [1.4 * s, -0.1]], 0.035, 0.022, DARK);
      }
    },
  },
  mantle: {
    name: 'Reactor Mantle',
    build: (g, c) => {
      const { chest: C, spine: S } = BODY;
      plate(g.chest, C, -0.1, 0.26, c.main, { inflate: 0.03, steps: 5 });
      plate(g.spine, S, -0.06, 0.22, shade(c.main, 0.85), { inflate: 0.03 });
      // Flared mantle over the shoulders with a lit rim.
      piece(g.chest, shellGeometry([
        { y: 0.12, w: 0.34, zf: 0.22, zb: 0.22, n: 2.4 }, { y: 0.21, w: 0.34, zf: 0.2, zb: 0.2, n: 2.4 },
        { y: 0.28, w: 0.25, zf: 0.15, zb: 0.16, n: 2.3 }, { y: 0.33, w: 0.15, zf: 0.1, zb: 0.11, n: 2.2 },
      ], { thetaStart: 0.35, thetaLength: TAU - 0.7, caps: false }), c.pal.metal);
      piece(g.chest, shellGeometry([{ y: 0.115, w: 0.345, zf: 0.225, zb: 0.225, n: 2.4 }, { y: 0.135, w: 0.345, zf: 0.225, zb: 0.225, n: 2.4 }],
        { thetaStart: 0.35, thetaLength: TAU - 0.7, inflate: 0.004 }), c.accent, { glow: true, outline: 0 });
      // Back reactor column with glowing rings.
      if (!c.capeWorn) onPlate(g.chest, C, 0.05, Math.PI, 0.12, G.cyl(0.1, 0.1, 0.42, 14), c.pal.secondary);
      if (!c.capeWorn) for (const y of [-0.1, 0.03, 0.16]) onPlate(g.chest, C, y + 0.05, Math.PI, 0.12, G.torus(0.105, 0.014, TAU, 4, 16), c.accent, { pitch: Math.PI / 2, glow: true, outline: 0 });
      for (const s of [-1, 1]) strap(g.chest, C, [[0.95 * s, 0.22], [0.5 * s, 0.1], [0, 0.0], [-0.5 * s, -0.08]], 0.04, 0.018, c.pal.secondary);
      reactor(g.chest, c, C, 0.0, 0.05);
    },
  },
};

// ================================================================ HANDS (per arm: seg = { upper, fore, hand }, s = side)
// The forearm hangs along -Y from the elbow (0.26 long); the hand bone sits at the wrist.
const ring = (g, r, y, color, glow = false, t = 0.012) =>
  piece(g, G.torus(r, t, Math.PI * 2, 4, 16), color, { pos: [0, y, 0], rot: [Math.PI / 2, 0, 0], glow, outline: glow ? 0 : 0.006 });

export const ARMOR_HANDS = {
  wraps: {
    name: 'Wired Wraps',
    build: (g, c, s) => {
      for (let i = 0; i < 4; i++) ring(g.fore, 0.07 - i * 0.003, -0.08 - i * 0.045, i % 2 ? c.main : c.accent, i % 2 === 0, 0.016);
      fist(g.hand, c.main, shade(c.main, 0.85), s, 1.05);
      piece(g.hand, G.box(0.066, 0.012, 0.094), c.accent, { pos: [0.004 * s, -0.074, 0.004], glow: true, outline: 0 });
    },
  },
  gloves: {
    name: 'Tech Gloves',
    build: (g, c, s) => {
      piece(g.fore, G.cyl(0.08, 0.07, 0.12, 12), shade(c.main, 0.8), { pos: [0, -0.2, 0], outline: 0.01 });
      ring(g.fore, 0.078, -0.145, c.accent, true, 0.01);
      fist(g.hand, c.main, c.main, s, 1.06);
      piece(g.hand, G.box(0.02, 0.05, 0.065), c.pal.metal, { pos: [0.034 * s, -0.045, 0.004], outline: 0.008 });
    },
  },
  gauntlets: {
    name: 'Power Gauntlets',
    build: (g, c, s) => {
      piece(g.fore, G.sphere(0.088, 12, 10), c.main, { pos: [0, 0.005, -0.01] });
      piece(g.fore, G.cyl(0.1, 0.08, 0.22, 14), c.main, { pos: [0, -0.15, 0] });
      ring(g.fore, 0.1, -0.055, c.accent, true, 0.012);
      piece(g.fore, G.box(0.05, 0.06, 0.05), c.accent, { pos: [0.095 * s, -0.15, 0], glow: true, outline: 0.006 });
      piece(g.fore, G.cyl(0.018, 0.018, 0.2, 6), c.pal.metal, { pos: [-0.088 * s, -0.14, 0.02], outline: 0.006 });
      fist(g.hand, c.main, shade(c.main, 0.85), s, 1.2);
      piece(g.hand, G.box(0.08, 0.04, 0.115), c.pal.metal, { pos: [0.012 * s, -0.1, 0.004], outline: 0.008 });
    },
  },
  bracers: {
    name: 'Emitter Bracers',
    build: (g, c, s) => {
      piece(g.fore, G.cyl(0.08, 0.074, 0.18, 12), c.pal.metal, { pos: [0, -0.16, 0] });
      piece(g.fore, G.cyl(0.045, 0.045, 0.02, 12), c.accent, { pos: [0.08 * s, -0.16, 0], rot: [0, 0, Math.PI / 2], glow: true, outline: 0.006 });
      piece(g.fore, G.torus(0.05, 0.009, Math.PI * 2, 4, 14), c.pal.secondary, { pos: [0.082 * s, -0.16, 0], rot: [0, Math.PI / 2, 0], outline: 0 });
      fist(g.hand, shade(c.main, 0.7), shade(c.main, 0.7), s, 1.04);
    },
  },
  claws: {
    name: 'Talon Gauntlets',
    build: (g, c, s) => {
      piece(g.fore, G.cyl(0.078, 0.07, 0.15, 12), c.main, { pos: [0, -0.18, 0], outline: 0.01 });
      fist(g.hand, shade(c.main, 0.8), shade(c.main, 0.8), s, 1.05);
      for (const z of [-0.032, 0, 0.032]) piece(g.hand, G.cone(0.016, 0.17, 4), c.accent, { pos: [0.01 * s, -0.2, z], rot: [Math.PI, 0, 0], glow: true, outline: 0.008 });
    },
  },
};

// ================================================================ LEGS (per leg: seg = { thigh, shin, foot }, s = side)
// Thigh 0.42 and shin 0.40 hang along -Y (stretched onto the body's); the foot bone is the ankle,
// sole bottom at y = -0.08. Boots are the body's own lofted boot (Human.bootFoot).
const bootFoot = (foot, color, s = 1) => footShape(foot, color, { s, sole: DARK });

export const ARMOR_LEGS = {
  boots: {
    name: 'Mag Boots',
    build: (g, c, s) => {
      piece(g.shin, G.cyl(0.1, 0.092, 0.26, 14), c.main, { pos: [0, -0.27, 0] });
      ring(g.shin, 0.1, -0.15, c.accent, true, 0.012);
      bootFoot(g.foot, c.main, s);
      piece(g.foot, G.box(0.13, 0.007, 0.33), c.accent, { pos: [0, -0.07, 0.056], glow: true, outline: 0.006 });
      piece(g.foot, G.cyl(0.04, 0.04, 0.02, 10), c.pal.metal, { pos: [0.098 * s, 0, 0], rot: [0, 0, Math.PI / 2], outline: 0.006 });
      piece(g.foot, G.cyl(0.02, 0.02, 0.022, 8), c.accent, { pos: [0.102 * s, 0, 0], rot: [0, 0, Math.PI / 2], glow: true, outline: 0 });
    },
  },
  greaves: {
    name: 'Plated Greaves',
    build: (g, c, s) => {
      piece(g.thigh, G.box(0.05, 0.2, 0.15), c.main, { pos: [0.1 * s, -0.2, 0], rot: [0, 0, 0.08 * s] });
      piece(g.thigh, G.box(0.054, 0.02, 0.1), c.accent, { pos: [0.106 * s, -0.12, 0], rot: [0, 0, 0.08 * s], glow: true, outline: 0 });
      piece(g.shin, G.sphere(0.085, 12, 8), c.main, { pos: [0, 0, 0.055], scale: [1, 1.1, 0.7] });
      piece(g.shin, G.sphere(0.03, 8, 6), c.accent, { pos: [0, 0, 0.115], glow: true, outline: 0 });
      piece(g.shin, G.cyl(0.098, 0.088, 0.3, 14), c.main, { pos: [0, -0.22, 0.005] });
      piece(g.shin, G.box(0.03, 0.2, 0.02), c.accent, { pos: [0, -0.22, 0.096], glow: true, outline: 0 });
      bootFoot(g.foot, shade(c.main, 0.85), s);
    },
  },
  sabatons: {
    name: 'Servo Boots',
    build: (g, c, s) => {
      piece(g.shin, G.sphere(0.08, 12, 8), c.main, { pos: [0, 0, 0.05], scale: [1, 1, 0.7] });
      piece(g.shin, G.cyl(0.095, 0.088, 0.24, 14), c.main, { pos: [0, -0.27, 0] });
      piece(g.shin, G.cyl(0.022, 0.022, 0.34, 6), c.pal.metal, { pos: [0, -0.2, -0.1], outline: 0.006 });
      piece(g.shin, G.cyl(0.036, 0.036, 0.07, 8), c.accent, { pos: [0, -0.06, -0.1], glow: true, outline: 0.006 });
      bootFoot(g.foot, c.main, s);
      for (let i = 0; i < 3; i++) piece(g.foot, G.box(0.16, 0.05, 0.09), shade(c.main, 1 - i * 0.08), { pos: [0, -0.005 - i * 0.012, 0.07 + i * 0.065], rot: [0.3, 0, 0], outline: 0.008 });
      piece(g.foot, G.box(0.12, 0.08, 0.06), c.pal.metal, { pos: [0, -0.03, -0.09], outline: 0.008 });
    },
  },
  wraps: {
    name: 'Strider Wraps',
    build: (g, c, s) => {
      for (let i = 0; i < 5; i++) ring(g.shin, 0.088 - i * 0.002, -0.12 - i * 0.055, i % 2 ? c.accent : c.main, !!(i % 2), 0.018);
      bootFoot(g.foot, shade(c.main, 0.6), s);
      for (const z of [0.0, 0.07, 0.14]) piece(g.foot, G.box(0.158, 0.016, 0.024), c.main, { pos: [0, 0.012 - z * 0.25, z], rot: [-0.3, 0, 0], outline: 0 });
    },
  },
};

// ================================================================ BACK (capes: skinned cloth on a grid of bone chains; anim/Cloth.js simulates it)
const CAPE_ROWS = 25;
const CAPE_COLS = 13;
const CAPE_THICK = 0.016;
export const CAPE_BONES = 6;     // joints down each column
export const CAPE_COLUMNS = 5;   // bone columns across the width, so the cloth ripples side to side

// Point on the cape's centre surface (offset from the anchor) at s ∈ [0, 1] down, u ∈ [-1, 1] across.
function capeOffset(shape, s, u, out = 0) {
  const len = shape.len + (shape.edge ? shape.edge(u) * Math.pow(s, 6) : 0);
  const w = shape.top + (shape.bottom - shape.top) * Math.pow(s, 0.8);
  const z = (shape.wrap ?? 0.1) * u * u * (1 - s) * (1 - s) - 0.035 * Math.sin(Math.PI * s) - out;
  return [u * w, -s * len, z];
}

/**
 * Cloth slab in the bind pose, hanging from `anchor` (model space), skinned to the grid of cape
 * bones: blended down each column across its joints (so it bends smoothly instead of folding like
 * plates) and across the width between neighbouring columns (so it ripples side to side). shape: { len, top, bottom (half-widths), wrap (how far the top corners
 * curl forward round the shoulders), edge(u) → extra hem length at u ∈ [-1, 1] }.
 * A sub-strip (trims, circuit lines) is s0..s1 down the length and u0..u1 across.
 */
export function capeGeometry(shape, anchor, segLen, { s0 = 0, s1 = 1, u0 = -1, u1 = 1, thick = CAPE_THICK, out = 0 } = {}) {
  const rows = Math.max(2, Math.round(CAPE_ROWS * (s1 - s0)) + 1);
  const cols = Math.max(2, Math.round(CAPE_COLS * ((u1 - u0) / 2)) + 1);
  const pos = [];
  const si = [];
  const sw = [];
  const idx = [];
  const vert = (s, u, side) => {
    const [x, y, z] = capeOffset(shape, s, u, out);
    pos.push(anchor.x + x, anchor.y + y, anchor.z + z + side * thick * 0.5);
    // Down the column: the joint's bone, shading into its neighbour past the segment's middle.
    const f = -y / segLen;
    const k = Math.min(CAPE_BONES - 1, Math.floor(f));
    const t = f - k;
    const next = k + 1 < CAPE_BONES ? Math.max(0, (t - 0.5) * 0.9) : 0;
    const prev = k > 0 ? Math.max(0, (0.5 - t) * 0.9) : 0;
    const k2 = next > 0 ? k + 1 : prev > 0 ? k - 1 : k;
    const wk = 1 - next - prev;
    // Across: linear between the two nearest columns.
    const g = ((u + 1) / 2) * (CAPE_COLUMNS - 1);
    const c = Math.min(CAPE_COLUMNS - 2, Math.floor(g));
    const tc = g - c;
    const B = (col, row) => col * CAPE_BONES + row;
    si.push(B(c, k), B(c, k2), B(c + 1, k), B(c + 1, k2));
    sw.push(wk * (1 - tc), (1 - wk) * (1 - tc), wk * tc, (1 - wk) * tc);
  };
  for (const side of [1, -1]) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) vert(s0 + ((s1 - s0) * r) / (rows - 1), u0 + ((u1 - u0) * c) / (cols - 1), side);
    }
  }
  const F = 0;
  const B = rows * cols;
  const at = (o, r, c) => o + r * cols + c;
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = at(F, r, c); const b = at(F, r + 1, c); const d = at(F, r + 1, c + 1); const e = at(F, r, c + 1);
      idx.push(a, b, d, a, d, e);
      const a2 = at(B, r, c); const b2 = at(B, r + 1, c); const d2 = at(B, r + 1, c + 1); const e2 = at(B, r, c + 1);
      idx.push(a2, d2, b2, a2, e2, d2);
    }
  }
  for (let r = 0; r < rows - 1; r++) {
    idx.push(at(F, r, 0), at(B, r + 1, 0), at(F, r + 1, 0), at(F, r, 0), at(B, r, 0), at(B, r + 1, 0));
    const L = cols - 1;
    idx.push(at(F, r, L), at(F, r + 1, L), at(B, r + 1, L), at(F, r, L), at(B, r + 1, L), at(B, r, L));
  }
  for (let c = 0; c < cols - 1; c++) {
    const R = rows - 1;
    idx.push(at(F, R, c), at(B, R, c + 1), at(F, R, c + 1), at(F, R, c), at(B, R, c), at(B, R, c + 1));
    idx.push(at(F, 0, c), at(F, 0, c + 1), at(B, 0, c + 1), at(F, 0, c), at(B, 0, c + 1), at(B, 0, c));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Clasp hardware across the shoulders (rigid on the chest bone).
function clasp(chest, c, kind, anchor) {
  const [x, y, z] = [0, anchor[1] + 0.02, anchor[2] + 0.02];
  if (kind === 'bar') {
    piece(chest, G.box(0.42, 0.045, 0.05), c.pal.metal, { pos: [x, y, z], outline: 0.01 });
    for (const s of [-1, 1]) piece(chest, G.cylZ(0.04, 0.04, 0.05, 12), c.pal.metal, { pos: [0.22 * s, y, z], rot: [0, 0, 0], outline: 0.01 });
    piece(chest, G.box(0.3, 0.012, 0.052), c.accent, { pos: [x, y, z], glow: true, outline: 0 });
  } else if (kind === 'discs') {
    for (const s of [-1, 1]) {
      piece(chest, G.cylZ(0.05, 0.05, 0.03, 12), c.pal.metal, { pos: [0.2 * s, y, z + 0.01], outline: 0.01 });
      piece(chest, G.cylZ(0.022, 0.022, 0.032, 10), c.accent, { pos: [0.2 * s, y, z + 0.01], glow: true, outline: 0 });
    }
  } else {
    piece(chest, G.box(0.36, 0.06, 0.06), c.pal.secondary, { pos: [x, y, z], outline: 0.01 });
    piece(chest, G.cylZ(0.05, 0.05, 0.07, 14), c.pal.metal, { pos: [x, y, z - 0.01], outline: 0.01 });
    piece(chest, G.cylZ(0.032, 0.032, 0.072, 14), c.accent, { pos: [x, y, z - 0.012], glow: true, outline: 0 });
  }
}

export const ARMOR_BACK = {
  cloak: { name: 'Field Cloak', shape: { len: 1.02, top: 0.23, bottom: 0.33, wrap: 0.1 }, trims: [[0.88, 0.93]], clasp: 'bar' },
  tattered: {
    name: 'Ragged Shroud', shape: { len: 0.98, top: 0.22, bottom: 0.32, wrap: 0.09, edge: (u) => 0.08 * Math.abs(Math.sin(u * 7.9 + 0.6)) - 0.03 },
    clasp: 'discs', tone: 0.82,
  },
  tech: {
    name: 'Circuit Cape', shape: { len: 0.92, top: 0.24, bottom: 0.3, wrap: 0.11, edge: (u) => (Math.abs(u) < 0.34 ? -0.07 : 0) },
    trims: [[0.03, 0.06]], lines: true, clasp: 'reactor',
  },
  half: { name: 'Officer Mantle', shape: { len: 0.6, top: 0.3, bottom: 0.36, wrap: 0.17 }, trims: [[0.85, 0.92]], clasp: 'bar' },
};
for (const f of Object.values(ARMOR_BACK)) {
  // Every cape form builds through the same path: bones, cloth, trims, clasp.
  f.build = (rig, c) => buildCape(rig, c, f);
}

// Builds a cape onto a humanoid rig (before baking). `rig` may also be a display stand
// ({ model, chest, standalone: true }) for loot models, which skips the bones.
export function buildCape(rig, c, f) {
  const segLen = f.shape.len / CAPE_BONES;
  // Pushed out past any chest armour so the cloth hangs over plates, not inside them.
  const anchorLocal = [0, 0.25, onShell(BODY.chest, 0.25, Math.PI, 0.045).pos[2] - (rig.capeClear ?? 0)];
  const main = f.tone ? shade(c.main, f.tone) : c.main;
  rig.model.updateMatrixWorld(true);
  const anchor = rig.chest.localToWorld(new THREE.Vector3(...anchorLocal));
  rig.model.worldToLocal(anchor);
  // Rest joints of each bone column: the cloth's centre surface at every joint height.
  const rest = [];
  for (let c = 0; c < CAPE_COLUMNS; c++) {
    const u = -1 + (2 * c) / (CAPE_COLUMNS - 1);
    const col = [];
    for (let r = 0; r <= CAPE_BONES; r++) {
      const [x, y, z] = capeOffset({ ...f.shape, edge: null }, r / CAPE_BONES, u);
      col.push(new THREE.Vector3(anchorLocal[0] + x, anchorLocal[1] + y, anchorLocal[2] + z));
    }
    rest.push(col);
  }
  const bones = rig.standalone ? null : makeCapeGrid(rig, rest);
  const cloth = (geo, color, opts = {}) => {
    const m = piece(rig.model, geo, color, { outline: 0.014, ...opts });
    if (bones) m.userData.piece.bones = bones;
    else for (const name of ['skinIndex', 'skinWeight']) geo.deleteAttribute(name);
  };
  cloth(capeGeometry(f.shape, anchor, segLen), main);
  for (const [s0, s1] of f.trims ?? []) cloth(capeGeometry(f.shape, anchor, segLen, { s0, s1, thick: CAPE_THICK + 0.006 }), c.accent, { glow: true, outline: 0 });
  if (f.lines) {
    for (const u of [-0.55, 0.55]) cloth(capeGeometry(f.shape, anchor, segLen, { s0: 0.06, s1: 0.85, u0: u - 0.04, u1: u + 0.04, thick: CAPE_THICK + 0.006 }), c.accent, { glow: true, outline: 0 });
    cloth(capeGeometry(f.shape, anchor, segLen, { s0: 0.0, s1: 0.95, u0: -0.07, u1: 0.07, thick: CAPE_THICK + 0.01 }), c.pal.metal, { outline: 0.008 });
  }
  clasp(rig.chest, c, f.clasp, anchorLocal);
}

export const ARMOR_FORMS = { armorHead: ARMOR_HEAD, armorChest: ARMOR_CHEST, armorHands: ARMOR_HANDS, armorLegs: ARMOR_LEGS, armorBack: ARMOR_BACK };

const formFor = (item) => {
  const kind = ARMOR_SLOTS[item.slot].kind;
  return ARMOR_FORMS[kind][item.look?.[kind]] ?? Object.values(ARMOR_FORMS[kind])[0];
};

// Slot-level surface detail shared by every form: maker's emblem, rivets, seams and power leads.
function armorDetail(target, c, slot, s = 1) {
  c.mfr = c.item.manufacturer;
  if (slot === 'head') {
    emblem(target, c, [0.285, 0.04, 0.02], { yaw: Math.PI / 2, size: 0.05 });
    rivets(target, c.pal.metal, [[-0.27, 0.08, 0.08], [-0.27, -0.02, 0.1], [0.24, 0.16, 0.12]], { axis: 'x', r: 0.01 });
  } else if (slot === 'chest') {
    const C = BODY.chest;
    const em = onShell(C, 0.2, 0.78, 0.06);
    emblem(target.chest, c, em.pos, { yaw: em.yaw, size: 0.055 });
    for (const [y, t] of [[0.26, 0.35], [0.26, -0.35], [-0.06, 0.8], [-0.06, -0.8]]) {
      const r = onShell(C, y, t, 0.045);
      piece(target.chest, G.cylZ(0.011, 0.013, 0.01, 6), c.pal.metal, { pos: r.pos, rot: [0, r.yaw, 0], outline: 0 });
    }
    for (const k of [-1, 1]) {
      const pts = [[Math.PI - 0.25 * k, 0.22], [Math.PI - 0.9 * k, 0.12], [1.5 * k, 0.0], [1.15 * k, -0.08]].map(([t, y]) => onShell(C, y, t, 0.045).pos);
      cable(target.chest, pts, c.pal.secondary, 0.012);
    }
  } else if (slot === 'hands') {
    rivets(target.fore, c.pal.metal, [[0.084 * s, -0.11, 0.035], [0.084 * s, -0.11, -0.035]], { axis: 'x', r: 0.009 });
    emblem(target.fore, c, [0.085 * s, -0.2, 0], { yaw: (Math.PI / 2) * s, size: 0.035 });
  } else if (slot === 'legs') {
    rivets(target.shin, c.pal.metal, [[0.05, -0.36, 0.09], [-0.05, -0.36, 0.09]], { axis: 'z', r: 0.01 });
    panelLine(target.shin, [0, -0.3, 0.1], [0.006, 0.12, 0.006]);
    cable(target.shin, [[0.06 * s, -0.12, -0.08], [0.08 * s, -0.24, -0.07], [0.06 * s, -0.36, -0.06]], c.pal.secondary, 0.009);
  }
}

// Applies equipped armour onto a humanoid rig's bones (before baking).
const FORM_THIGH = 0.42;
const FORM_SHIN = 0.4;
function stretched(bone, k) {
  const g = new THREE.Group();
  g.scale.set(1, k, 1);
  bone.add(g);
  return g;
}

export function applyArmor(rig, gear) {
  const flags = {};
  const head = rig.headwear ?? rig.skull;
  let legs = null;
  const legSeg = () => (legs ??= rig.legs.map((l) => ({
    thigh: stretched(l.thigh, rig.dims.thigh / FORM_THIGH), shin: stretched(l.shin, rig.dims.shin / FORM_SHIN), foot: l.foot,
  })));
  // A cape over chest armour hangs from (and collides against) the plates' surface.
  rig.capeClear = gear.chest ? 0.045 : 0;
  for (const item of Object.values(gear ?? {})) {
    if (!item) continue;
    const c = armorContext(item);
    c.capeWorn = !!gear.back;
    const f = formFor(item);
    if (item.slot === 'head') {
      f.build(head, c);
      armorDetail(head, c, 'head');
      Object.assign(flags, { hidesHair: f.hidesHair, hidesFace: f.hidesFace });
    } else if (item.slot === 'chest') {
      const seg = {
        chest: rig.chest, spine: rig.spine, hips: rig.hips, armL: rig.armL.upper, armR: rig.armR.upper,
        thighL: legSeg()[0].thigh, thighR: legSeg()[1].thigh,
      };
      f.build(seg, c);
      armorDetail(seg, c, 'chest');
    } else if (item.slot === 'hands') {
      for (const [arm, s] of [[rig.armL, 1], [rig.armR, -1]]) {
        f.build(arm, c, s);
        armorDetail(arm, c, 'hands', s);
      }
    } else if (item.slot === 'back') {
      f.build(rig, c);
    } else if (item.slot === 'legs') {
      legSeg().forEach((leg, i) => {
        const s = i === 0 ? 1 : -1;
        f.build(leg, c, s);
        armorDetail(leg, c, 'legs', s);
      });
    }
  }
  return flags;
}

// Standalone display model (loot on the ground, inventory thumbnails).
export function buildArmorModel(item) {
  const root = new THREE.Group();
  const c = armorContext(item);
  const f = formFor(item);
  const grp = (parent, pos) => {
    const g = new THREE.Group();
    g.position.fromArray(pos);
    parent.add(g);
    return g;
  };
  if (item.slot === 'head') {
    const head = grp(root, [0, 0, 0]);
    f.build(head, c);
    armorDetail(head, c, 'head');
  } else if (item.slot === 'chest') {
    // A torso stand at the humanoid's proportions (chest bone at the origin).
    const H = HUMAN;
    const hips = grp(root, [0, -H.spine - H.chest, 0]);
    const spine = grp(hips, [0, H.spine, 0]);
    const chest = grp(spine, [0, H.chest, 0]);
    const seg = {
      chest, spine, hips, armL: grp(chest, [H.shoulderX, H.shoulderY, 0]), armR: grp(chest, [-H.shoulderX, H.shoulderY, 0]),
      thighL: grp(hips, [H.hipX, -H.hipDrop, 0]), thighR: grp(hips, [-H.hipX, -H.hipDrop, 0]),
    };
    f.build(seg, c);
    armorDetail(seg, c, 'chest');
  } else if (item.slot === 'hands') {
    for (const s of [-1, 1]) {
      const upper = grp(root, [0.2 * s, 0.75, 0]);
      const fore = grp(upper, [0, -0.3, 0]);
      const seg = { upper, fore, hand: grp(fore, [0, -0.26, 0]) };
      f.build(seg, c, s);
      armorDetail(seg, c, 'hands', s);
    }
  } else if (item.slot === 'back') {
    // Static drape on a stand (loot / thumbnails): same cloth, no bones.
    f.build({ model: root, chest: grp(root, [0, -0.25, 0]), standalone: true }, c);
  } else {
    for (const s of [-1, 1]) {
      const thigh = grp(root, [0.17 * s, 0.5, 0]);
      const shin = grp(thigh, [0, -0.42, 0]);
      const seg = { thigh, shin, foot: grp(shin, [0, -0.4, 0]) };
      f.build(seg, c, s);
      armorDetail(seg, c, 'legs', s);
    }
  }
  bakeTree(root);
  return root;
}

export const armorFormName = (item) => formFor(item).name;
export const armorHeadFlags = (item) => ({ hidesHair: !!formFor(item).hidesHair, hidesFace: !!formFor(item).hidesFace });
