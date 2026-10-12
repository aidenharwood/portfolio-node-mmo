// Visual component library. A weapon is assembled from component KINDS (blade, guard, haft...)
// and each kind has several FORMS — genuinely different shapes, not recolours. Manufacturers
// pick from their own subset of forms (manufacturers.js → forms), giving each brand a design
// language. Stat parts (parts.js) still drive dimensions/features on top of the chosen form.
//
// Every form: { name, build(g, c, a) } — g: target group, c: context (palette, accent...),
// a: anchor/dimension info supplied by the assembler in WeaponModel.js.
import * as THREE from 'three';
import { piece, shade, G } from '../render/ModelKit.js';

export const WOOD = 0x3c414c;    // alloy (was wood)
export const LEATHER = 0x26262e; // polymer wrap (was leather)
export const DARK = 0x2a2a30;
export const BONE = 0xe4e8ef;    // ceramic composite (was bone)
export const GOLD = 0xd8b25a;    // brass

// Shape drawn in XY with length along +Y → length along +Z, flat faces up.
const flatZ = (geo) => geo.rotateX(Math.PI / 2);
const mirror = (pts, s) => pts.map(([x, y]) => [x * s, y]);

export function floatGroup(g, pos, spin = 1.5) {
  const f = new THREE.Group();
  f.position.fromArray(pos);
  f.userData.float = { base: pos[1], spin };
  g.add(f);
  return f;
}

function gem(g, c, pos, r, shape = 'octa') {
  const f = floatGroup(g, pos);
  const geo = shape === 'ico' ? G.ico(r) : shape === 'dodeca' ? G.dodeca(r) : G.octa(r);
  piece(f, geo, c.gemColor, { glow: true, outline: 0.012 });
  return f;
}

// ================================================================ BLADES  a: { z0, len, w, th }
// Hard-light blades: a glowing energy silhouette wrapped round an inset alloy core with spine vents,
// seated in an emitter collar.
function blade(shapeFn, { fuller = false } = {}) {
  return (g, c, a) => {
    const h = a.w / 2;
    piece(g, flatZ(G.extrude(shapeFn(a.len, h), a.th * 0.55, 0.006)), c.accent, { pos: [0, 0, a.z0], glow: true, outline: 0.022 });
    piece(g, flatZ(G.extrude(shapeFn(a.len * 0.84, h * 0.58), a.th, 0.006)), c.pal.metal, { pos: [0, 0, a.z0 - 0.01] });
    const vents = fuller ? 4 : 2;
    for (let i = 0; i < vents; i++) {
      piece(g, G.box(a.w * 0.14, a.th + 0.014, 0.045), DARK, { pos: [0, 0, a.z0 + a.len * (0.1 + i * 0.11)], outline: 0 });
    }
    piece(g, G.box(a.w * 0.75, a.th + 0.03, 0.08), c.pal.primary, { pos: [0, 0, a.z0 + 0.02], outline: 0.012 });
    for (const s of [-1, 1]) piece(g, G.box(0.02, a.th + 0.034, 0.05), c.accent, { pos: [a.w * 0.3 * s, 0, a.z0 + 0.02], glow: true, outline: 0 });
  };
}

function curveShape(build) {
  const s = new THREE.Shape();
  build(s);
  return s;
}

const BLADE = {
  straight: { name: 'Edge Emitter', build: blade((L, h) => G.shape([[-h, 0], [-h, 0.82 * L], [0, L], [h, 0.82 * L], [h, 0]]), { fuller: true }) },
  tapered: { name: 'Tapered Edge', build: blade((L, h) => G.shape([[-h, 0], [-h * 0.5, 0.9 * L], [0, L], [h * 0.5, 0.9 * L], [h, 0]]), { fuller: true }) },
  broad: {
    name: 'Broad Edge',
    build: blade((L, h) => curveShape((s) => {
      s.moveTo(-h, 0); s.lineTo(-h * 1.2, L * 0.62); s.quadraticCurveTo(-h * 1.1, L * 0.92, 0, L); s.lineTo(h * 1.05, L * 0.8); s.lineTo(h, 0);
    }), { fuller: true }),
  },
  leaf: {
    name: 'Leaf Edge',
    build: blade((L, h) => curveShape((s) => {
      s.moveTo(-h * 0.7, 0); s.quadraticCurveTo(-h * 1.8, L * 0.55, 0, L); s.quadraticCurveTo(h * 1.8, L * 0.55, h * 0.7, 0);
    })),
  },
  sabre: {
    name: 'Arc Sabre',
    build: blade((L, h) => curveShape((s) => {
      s.moveTo(-h, 0); s.quadraticCurveTo(-h * 0.4, L * 0.7, h * 1.4, L); s.quadraticCurveTo(h * 1.4, L * 0.4, h, 0);
    })),
  },
  cleaver: { name: 'Cleaver Edge', build: blade((L, h) => G.shape([[-h, 0], [-h * 1.6, L * 0.12], [-h * 1.7, L * 0.95], [h * 0.4, L], [h, L * 0.86], [h, 0]])) },
  tanto: { name: 'Tanto Edge', build: blade((L, h) => G.shape([[-h, 0], [-h, 0.86 * L], [-h * 0.1, L], [h, 0.76 * L], [h, 0]]), { fuller: true }) },
  flamberge: {
    name: 'Wave Edge',
    build: blade((L, h) => curveShape((s) => {
      const n = 7;
      s.moveTo(-h, 0);
      for (let i = 1; i <= n; i++) s.lineTo(-h + (i % 2 ? -0.03 : 0.012), (0.85 * L * i) / n);
      s.lineTo(0, L);
      for (let i = n; i >= 1; i--) s.lineTo(h + (i % 2 ? 0.03 : -0.012), (0.85 * L * i) / n);
      s.lineTo(h, 0);
    })),
  },
  falchion: {
    name: 'Heavy Edge',
    build: blade((L, h) => curveShape((s) => {
      s.moveTo(-h, 0); s.lineTo(-h * 1.5, L * 0.72); s.quadraticCurveTo(-h * 1.4, L * 0.98, 0, L); s.lineTo(h, L * 0.9); s.lineTo(h, 0);
    }), { fuller: true }),
  },
  needle: { name: 'Needle Emitter', build: blade((L, h) => G.shape([[-h * 0.45, 0], [-h * 0.32, 0.95 * L], [0, L * 1.04], [h * 0.32, 0.95 * L], [h * 0.45, 0]])) },
};

// ================================================================ GUARDS  a: { z, w }  — emitter housings
const node = (g, c, x, y, z, r = 0.028) => piece(g, G.sphere(r, 8, 6), c.accent, { pos: [x, y, z], glow: true, outline: 0.006 });

const GUARD = {
  bar: {
    name: 'Crossbar Emitter',
    build: (g, c, a) => {
      piece(g, G.box(a.w, 0.05, 0.07), c.pal.primary, { pos: [0, 0, a.z] });
      for (let i = -2; i <= 2; i++) if (i) piece(g, G.box(0.012, 0.055, 0.075), DARK, { pos: [i * a.w * 0.12, 0, a.z], outline: 0 });
      for (const s of [-1, 1]) node(g, c, (a.w / 2) * s, 0, a.z, 0.035);
    },
  },
  disc: {
    name: 'Ring Emitter',
    build: (g, c, a) => {
      piece(g, G.torus(a.w * 0.36, 0.03, Math.PI * 2, 6, 20), c.pal.primary, { pos: [0, 0, a.z] });
      piece(g, G.torus(a.w * 0.36, 0.012, Math.PI * 2, 4, 20), c.accent, { pos: [0, 0, a.z + 0.02], glow: true, outline: 0 });
      piece(g, G.cylZ(0.06, 0.06, 0.05, 10), c.pal.metal, { pos: [0, 0, a.z], outline: 0.01 });
    },
  },
  heavy: {
    name: 'Reactor Guard',
    build: (g, c, a) => {
      piece(g, G.box(a.w * 0.8, 0.09, 0.1), c.pal.primary, { pos: [0, 0, a.z] });
      for (let i = 0; i < 4; i++) piece(g, G.box(0.03, 0.14, 0.08), c.pal.metal, { pos: [(-0.3 + i * 0.2) * a.w, 0, a.z], outline: 0.008 });
      piece(g, G.box(0.08, 0.1, 0.105), c.accent, { pos: [0, 0, a.z], glow: true, outline: 0 });
    },
  },
  swept: {
    name: 'Arc Hilt',
    build: (g, c, a) => {
      piece(g, G.box(0.1, 0.06, 0.06), c.pal.primary, { pos: [0, 0, a.z] });
      for (const s of [-1, 1]) {
        piece(g, G.tube([[0, 0, a.z], [s * a.w * 0.35, 0, a.z - 0.01], [s * a.w * 0.55, 0, a.z + 0.08], [s * a.w * 0.45, 0, a.z + 0.18]], 0.016, 16, 5), c.pal.metal, { outline: 0.01 });
        node(g, c, s * a.w * 0.45, 0, a.z + 0.18, 0.022);
      }
      piece(g, G.tube([[-a.w * 0.3, 0, a.z], [-0.1, 0, a.z - 0.1], [-0.09, 0, a.z - 0.24], [-0.02, 0, a.z - 0.32]], 0.01, 16, 4), c.accent, { glow: true, outline: 0.006 });
    },
  },
  winged: {
    name: 'Fin Guard',
    build: (g, c, a) => {
      piece(g, G.box(0.09, 0.07, 0.08), c.pal.primary, { pos: [0, 0, a.z] });
      for (const s of [-1, 1]) {
        const wing = flatZ(G.extrude(G.shape(mirror([[0, 0], [a.w * 0.65, -0.1], [a.w * 0.6, 0.0], [a.w * 0.2, 0.05]], s)), 0.025, 0.006));
        piece(g, wing, c.pal.metal, { pos: [0.03 * s, 0, a.z] });
        piece(g, G.box(a.w * 0.45, 0.03, 0.012), c.accent, { pos: [a.w * 0.32 * s, 0, a.z - 0.035], rot: [0, 0.2 * s, 0], glow: true, outline: 0 });
      }
    },
  },
  claw: {
    name: 'Clamp Guard',
    build: (g, c, a) => {
      piece(g, G.box(0.14, 0.07, 0.07), c.pal.primary, { pos: [0, 0, a.z] });
      for (const s of [-1, 1]) {
        piece(g, G.tube([[s * 0.05, 0, a.z], [s * 0.14, 0, a.z + 0.05], [s * 0.12, 0, a.z + 0.15], [s * 0.06, 0, a.z + 0.24]], 0.02, 12, 5), c.pal.metal, { outline: 0.01 });
        node(g, c, s * 0.06, 0, a.z + 0.24, 0.02);
      }
    },
  },
};

// ================================================================ GRIPS  a: { len }  (spans z -len/2..len/2)
const GRIP = {
  wrapped: {
    name: 'Polymer Grip',
    build: (g, c, a) => {
      piece(g, G.cylZ(0.033, 0.037, a.len, 10), LEATHER);
      const n = Math.round(a.len / 0.05);
      for (let i = 0; i < n; i++) piece(g, G.torus(0.037, 0.008, Math.PI * 2, 4, 10), shade(LEATHER, 1.6), { pos: [0, 0, -a.len / 2 + 0.025 + i * 0.05], outline: 0 });
    },
  },
  ridged: {
    name: 'Coil Grip',
    build: (g, c, a) => {
      piece(g, G.cylZ(0.03, 0.034, a.len, 10), DARK);
      for (let i = 0; i < 3; i++) piece(g, G.torus(0.036, 0.014, Math.PI * 2, 4, 10), c.pal.metal, { pos: [0, 0, -a.len / 3 + (i * a.len) / 3], outline: 0.008 });
      piece(g, G.box(0.012, 0.012, a.len * 0.9), c.accent, { pos: [0, 0.033, 0], glow: true, outline: 0 });
    },
  },
  bone: {
    name: 'Composite Grip',
    build: (g, c, a) => {
      const n = 3;
      for (let i = 0; i < n; i++) {
        const z = -a.len / 2 + (a.len / n) * (i + 0.5);
        piece(g, G.cylZ(0.031, 0.035, a.len / n - 0.02, 8), BONE, { pos: [0, 0, z] });
        piece(g, G.cylZ(0.038, 0.038, 0.02, 8), DARK, { pos: [0, 0, z + a.len / n / 2], outline: 0.006 });
      }
    },
  },
  filigree: {
    name: 'Conduit Grip',
    build: (g, c, a) => {
      piece(g, G.cylZ(0.03, 0.032, a.len, 10), c.pal.secondary);
      const pts = [];
      for (let i = 0; i <= 24; i++) {
        const t = i / 24;
        pts.push([Math.cos(t * Math.PI * 6) * 0.034, Math.sin(t * Math.PI * 6) * 0.034, -a.len / 2 + t * a.len]);
      }
      piece(g, G.tube(pts, 0.007, 48, 4), c.accent, { glow: true, outline: 0 });
    },
  },
};

// ================================================================ POMMELS  a: { z }  — power cells and counterweights
const POMMEL = {
  ball: {
    name: 'Cell Cap',
    build: (g, c, a) => {
      piece(g, G.cylZ(0.045, 0.05, 0.09, 10), c.pal.primary, { pos: [0, 0, a.z], outline: 0.012 });
      piece(g, G.torus(0.047, 0.01, Math.PI * 2, 4, 12), c.accent, { pos: [0, 0, a.z], glow: true, outline: 0 });
    },
  },
  disc: {
    name: 'Counterweight',
    build: (g, c, a) => {
      piece(g, G.cylZ(0.065, 0.065, 0.035, 12), c.pal.primary, { pos: [0, 0, a.z], outline: 0.012 });
      piece(g, G.coneZ(0.025, 0.06, 6), c.pal.metal, { pos: [0, 0, a.z - 0.04], rot: [Math.PI, 0, 0], outline: 0.01 });
      node(g, c, 0, 0.065, a.z, 0.015);
    },
  },
  gem: {
    name: 'Core Crystal',
    build: (g, c, a) => {
      piece(g, G.octa(0.055), c.rar.color, { pos: [0, 0, a.z - 0.03], glow: true, outline: 0.012 });
      for (let i = 0; i < 3; i++) {
        const t = (i / 3) * Math.PI * 2;
        piece(g, G.coneZ(0.012, 0.07, 4), c.pal.metal, { pos: [Math.cos(t) * 0.04, Math.sin(t) * 0.04, a.z], rot: [Math.PI, 0, 0], outline: 0 });
      }
    },
  },
  ring: {
    name: 'Tether Ring',
    build: (g, c, a) => {
      piece(g, G.torus(0.05, 0.014, Math.PI * 2, 5, 14), c.pal.metal, { pos: [0, 0, a.z - 0.02], rot: [0, Math.PI / 2, 0], outline: 0.01 });
      piece(g, G.torus(0.05, 0.006, Math.PI * 2, 4, 14), c.accent, { pos: [0.016, 0, a.z - 0.02], rot: [0, Math.PI / 2, 0], glow: true, outline: 0 });
    },
  },
  spike: { name: 'Breaker Spike', build: (g, c, a) => { piece(g, G.coneZ(0.045, 0.14, 6), c.pal.metal, { pos: [0, 0, a.z - 0.03], rot: [Math.PI, 0, 0], outline: 0.012 }); node(g, c, 0, 0, a.z + 0.03, 0.02); } },
  skull: {
    name: 'Skull Core',
    build: (g, c, a) => {
      piece(g, G.sphere(0.055, 10, 8), BONE, { pos: [0, 0, a.z - 0.02], outline: 0.012 });
      for (const s of [-1, 1]) piece(g, G.sphere(0.014, 6, 4), c.accent, { pos: [0.02 * s, 0.045, a.z - 0.015], glow: true, outline: 0 });
    },
  },
};

// ================================================================ AXE HEADS  a: { tip, s }  — heat-edged heads
const AXE_SHAPES = {
  bearded: [[0, -0.08], [-0.16, -0.1], [-0.3, -0.32], [-0.42, -0.2], [-0.46, 0], [-0.4, 0.18], [-0.16, 0.09], [0, 0.08]],
  crescent: [[0, -0.09], [-0.18, -0.06], [-0.34, -0.3], [-0.48, -0.16], [-0.53, 0], [-0.48, 0.16], [-0.34, 0.3], [-0.18, 0.06], [0, 0.09]],
  cleaver: [[0, -0.12], [-0.38, -0.16], [-0.42, 0.2], [-0.05, 0.14], [0, 0.12]],
  wedge: [[0, -0.1], [-0.3, -0.13], [-0.34, 0.13], [0, 0.1]],
};

// Glowing full silhouette behind an inset alloy plate reads as an energised cutting edge.
function axeBlade(g, c, a, shape, s = -1, depth = 0.035) {
  const pts = AXE_SHAPES[shape].map(([x, y]) => [x * a.s * -s, y * a.s]);
  piece(g, flatZ(G.extrude(G.shape(pts), depth * 0.55, 0.006)), c.accent, { pos: [0.04 * s, 0, a.tip], glow: true, outline: 0.02 });
  const inner = pts.map(([x, y]) => [x * 0.82, y * 0.82]);
  piece(g, flatZ(G.extrude(G.shape(inner), depth, 0.006)), c.pal.metal, { pos: [0.04 * s, 0, a.tip] });
  for (const z of [-0.06, 0.06]) piece(g, G.box(0.05, depth + 0.012, 0.025), DARK, { pos: [0.17 * a.s * s, 0, a.tip + z * a.s], outline: 0 });
}

const socket = (g, c, a, w = 0.1) => {
  piece(g, G.box(w, 0.1, 0.28), c.pal.primary, { pos: [0, 0, a.tip] });
  for (const z of [-0.1, 0, 0.1]) piece(g, G.box(w + 0.006, 0.02, 0.02), DARK, { pos: [0, 0.04, a.tip + z], outline: 0 });
};

const AXE_HEAD = {
  bearded: { name: 'Bearded Heat-Edge', build: (g, c, a) => { socket(g, c, a); axeBlade(g, c, a, 'bearded'); piece(g, G.box(0.12, 0.05, 0.14), c.pal.metal, { pos: [0.09, 0, a.tip] }); } },
  crescent: { name: 'Crescent Edge', build: (g, c, a) => { socket(g, c, a); axeBlade(g, c, a, 'crescent'); } },
  cleaver: { name: 'Cleaver Edge', build: (g, c, a) => { socket(g, c, a, 0.12); axeBlade(g, c, a, 'cleaver', -1, 0.045); node(g, c, -0.3 * a.s, 0.03, a.tip + 0.08, 0.025); } },
  wedge: { name: 'Wedge Breaker', build: (g, c, a) => { socket(g, c, a, 0.14); axeBlade(g, c, a, 'wedge', -1, 0.08); } },
  double: { name: 'Twin-Edge Head', build: (g, c, a) => { socket(g, c, a); axeBlade(g, c, a, 'crescent', -1); axeBlade(g, c, a, 'crescent', 1); } },
  hook: {
    name: 'Hooked Edge',
    build: (g, c, a) => {
      socket(g, c, a);
      axeBlade(g, c, a, 'bearded');
      piece(g, G.tube([[0.05, 0, a.tip], [0.2, 0, a.tip + 0.02], [0.28, 0, a.tip - 0.08], [0.24, 0, a.tip - 0.18]], 0.025, 12, 5), c.pal.metal, { outline: 0.01 });
      node(g, c, 0.24, 0, a.tip - 0.18, 0.022);
    },
  },
  halberd: {
    name: 'Halberd Head',
    build: (g, c, a) => {
      socket(g, c, a);
      axeBlade(g, c, a, 'crescent');
      piece(g, G.coneZ(0.05, 0.36, 6), c.pal.metal, { pos: [0, 0, a.tip + 0.3] });
      piece(g, G.coneZ(0.03, 0.2, 6), c.accent, { pos: [0, 0, a.tip + 0.36], glow: true, outline: 0.008 });
      piece(g, G.cone(0.04, 0.22, 6), c.pal.metal, { pos: [0.15, 0, a.tip], rot: [0, 0, -Math.PI / 2] });
    },
  },
  splitter: {
    name: 'Splitter Head',
    build: (g, c, a) => {
      socket(g, c, a, 0.12);
      axeBlade(g, c, a, 'wedge', -1, 0.07);
      piece(g, G.box(0.2, 0.16, 0.2), shade(c.pal.metal, 0.8), { pos: [0.16, 0, a.tip] });
      piece(g, G.box(0.04, 0.12, 0.12), c.accent, { pos: [0.265, 0, a.tip], glow: true, outline: 0.008 });
    },
  },
};

// ================================================================ HAFTS  a: { len, z0 }  — alloy shafts
const haftBase = (g, a, color, r = 0.04) => piece(g, G.cylZ(r, r + 0.005, a.len, 10), color, { pos: [0, 0, a.z0 + a.len / 2] });
const glowBand = (g, c, z, r = 0.05) => piece(g, G.torus(r, 0.006, Math.PI * 2, 4, 12), c.accent, { pos: [0, 0, z], glow: true, outline: 0 });

const HAFT = {
  straight: {
    name: 'Alloy Haft',
    build: (g, c, a) => {
      haftBase(g, a, WOOD);
      for (const t of [0.35, 0.7]) piece(g, G.cylZ(0.048, 0.048, 0.03, 10), c.pal.metal, { pos: [0, 0, a.z0 + a.len * t], outline: 0.008 });
    },
  },
  banded: {
    name: 'Banded Haft',
    build: (g, c, a) => {
      haftBase(g, a, WOOD);
      for (let i = 0; i < 4; i++) {
        const z = a.z0 + 0.2 + i * (a.len * 0.22);
        piece(g, G.cylZ(0.05, 0.05, 0.035, 10), c.pal.metal, { pos: [0, 0, z], outline: 0.01 });
        glowBand(g, c, z, 0.051);
      }
    },
  },
  wrapped: {
    name: 'Taped Haft',
    build: (g, c, a) => {
      haftBase(g, a, c.pal.secondary);
      const n = Math.floor((a.len * 0.5) / 0.05);
      for (let i = 0; i < n; i++) piece(g, G.torus(0.047, 0.01, Math.PI * 2, 4, 10), LEATHER, { pos: [0, 0, a.z0 + 0.05 + i * 0.05], outline: 0 });
      glowBand(g, c, a.z0 + a.len * 0.8);
    },
  },
  spiked: {
    name: 'Spined Haft',
    build: (g, c, a) => {
      haftBase(g, a, shade(c.pal.metal, 0.8), 0.038);
      for (let i = 0; i < 5; i++) {
        const t = i * 1.3;
        piece(g, G.cone(0.018, 0.07, 4), c.pal.metal, { pos: [Math.cos(t) * 0.045, Math.sin(t) * 0.045, a.z0 + 0.35 + i * 0.1], rot: [0, 0, t - Math.PI / 2], outline: 0 });
      }
      piece(g, G.box(0.012, 0.012, a.len * 0.6), c.accent, { pos: [0, 0.04, a.z0 + a.len * 0.5], glow: true, outline: 0 });
    },
  },
  bone: {
    name: 'Segmented Haft',
    build: (g, c, a) => {
      const n = 4;
      for (let i = 0; i < n; i++) {
        const z = a.z0 + (a.len / n) * (i + 0.5);
        piece(g, G.cylZ(0.038, 0.042, a.len / n - 0.03, 8), BONE, { pos: [0, 0, z] });
        piece(g, G.cylZ(0.048, 0.048, 0.03, 8), DARK, { pos: [0, 0, z - a.len / n / 2], outline: 0.01 });
        glowBand(g, c, z - a.len / n / 2, 0.049);
      }
    },
  },
  twisted: {
    name: 'Coiled Haft',
    build: (g, c, a) => {
      haftBase(g, a, WOOD, 0.036);
      const pts = [];
      for (let i = 0; i <= 30; i++) {
        const t = i / 30;
        pts.push([Math.cos(t * Math.PI * 8) * 0.042, Math.sin(t * Math.PI * 8) * 0.042, a.z0 + t * a.len]);
      }
      piece(g, G.tube(pts, 0.01, 60, 4), c.accent, { glow: true, outline: 0 });
    },
  },
};

// ================================================================ GUN RECEIVERS  a: { B, H, z0 }  → returns { top, mid, z1 }
function rail(g, a, top, mid) {
  piece(g, G.box(0.075, 0.03, a.B * 0.9), DARK, { pos: [0, top + 0.015, mid], outline: 0.012 });
  for (let i = 0; i < 5; i++) piece(g, G.box(0.085, 0.012, 0.018), DARK, { pos: [0, top + 0.03, a.z0 + 0.06 + i * (a.B * 0.18)], outline: 0 });
}

const RECEIVER = {
  block: {
    name: 'Block Receiver',
    build: (g, c, a) => {
      const mid = a.z0 + a.B / 2;
      const top = 0.07 + a.H / 2;
      piece(g, G.box(0.11, a.H, a.B), c.pal.primary, { pos: [0, 0.07, mid] });
      for (const s of [-1, 1]) piece(g, G.box(0.012, a.H * 0.55, a.B * 0.62), c.pal.secondary, { pos: [0.058 * s, 0.06, mid], outline: 0 });
      piece(g, G.box(0.014, 0.04, 0.1), DARK, { pos: [-0.062, 0.1, mid + 0.04], glow: true, outline: 0 });
      rail(g, a, top, mid);
      return { top: top + 0.03, mid, z1: a.z0 + a.B };
    },
  },
  rounded: {
    name: 'Rounded Receiver',
    build: (g, c, a) => {
      const mid = a.z0 + a.B / 2;
      piece(g, G.capsuleZ(0.07, Math.max(0.05, a.B - 0.14), 12), c.pal.primary, { pos: [0, 0.07, mid], scale: [0.85, a.H / 0.14, 1] });
      piece(g, G.cylZ(0.04, 0.04, a.B * 0.5, 10), c.pal.secondary, { pos: [0, 0.07 + a.H * 0.5, mid - a.B * 0.1] });
      for (const s of [-1, 1]) piece(g, G.torus(0.035, 0.008, Math.PI * 2, 4, 12), c.showAccent ? c.accent : DARK, { pos: [0.06 * s, 0.07, mid + a.B * 0.2], rot: [0, Math.PI / 2, 0], glow: c.showAccent, outline: 0 });
      return { top: 0.07 + a.H * 0.5 + 0.04, mid, z1: a.z0 + a.B };
    },
  },
  angular: {
    name: 'Angular Receiver',
    build: (g, c, a) => {
      const B = a.B;
      const H = a.H;
      const profile = G.shape([[0, -H / 2], [B, -H / 2 + 0.03], [B + 0.03, H / 2 - 0.04], [B * 0.75, H / 2], [0.1, H / 2], [-0.03, H / 2 - 0.06]]);
      piece(g, G.extrude(profile, 0.11, 0.008).rotateY(-Math.PI / 2), c.pal.primary, { pos: [0, 0.07, a.z0] });
      for (const s of [-1, 1]) piece(g, G.box(0.012, H * 0.3, B * 0.5), c.pal.secondary, { pos: [0.06 * s, 0.04, a.z0 + B * 0.45], rot: [0.12, 0, 0], outline: 0 });
      const mid = a.z0 + B / 2;
      rail(g, a, 0.07 + H / 2, mid);
      return { top: 0.07 + H / 2 + 0.03, mid, z1: a.z0 + B };
    },
  },
  skeletal: {
    name: 'Skeletal Frame',
    build: (g, c, a) => {
      const mid = a.z0 + a.B / 2;
      const top = 0.07 + a.H / 2;
      piece(g, G.box(0.09, 0.035, a.B), c.pal.primary, { pos: [0, top - 0.018, mid] });
      piece(g, G.box(0.09, 0.035, a.B), c.pal.primary, { pos: [0, 0.07 - a.H / 2 + 0.018, mid] });
      for (const z of [a.z0 + 0.02, a.z0 + a.B - 0.02]) piece(g, G.box(0.09, a.H, 0.035), c.pal.secondary, { pos: [0, 0.07, z] });
      piece(g, G.cylZ(0.035, 0.035, a.B * 0.8, 10), c.accent, { pos: [0, 0.07, mid], glow: true, outline: 0.01 });
      return { top, mid, z1: a.z0 + a.B };
    },
  },
  boxy: {
    name: 'Boxy Receiver',
    build: (g, c, a) => {
      const mid = a.z0 + a.B / 2;
      const H = a.H * 1.15;
      const top = 0.07 + H / 2;
      piece(g, G.box(0.13, H, a.B), c.pal.primary, { pos: [0, 0.07, mid] });
      for (const s of [-1, 1]) {
        piece(g, G.box(0.012, H * 0.7, a.B * 0.4), c.pal.secondary, { pos: [0.068 * s, 0.07, mid - a.B * 0.15], outline: 0.006 });
        for (const z of [-0.08, 0.08]) piece(g, G.cyl(0.012, 0.012, 0.01, 6), 0xd0d0d0, { pos: [0.075 * s, 0.07 + H * 0.25, mid - a.B * 0.15 + z], rot: [0, 0, Math.PI / 2], outline: 0 });
      }
      piece(g, G.box(0.03, 0.03, a.B * 0.5), DARK, { pos: [0, top + 0.07, mid], outline: 0.01 });
      for (const z of [-a.B * 0.22, a.B * 0.22]) piece(g, G.box(0.03, 0.07, 0.03), DARK, { pos: [0, top + 0.035, mid + z], outline: 0.01 });
      return { top: top + 0.09, mid, z1: a.z0 + a.B };
    },
  },
};

// ================================================================ BARRELS  a: { z1, len, by, thick, twin }  → muzzle z
function emitter(g, c, a, z, r = 0.05) {
  for (const x of a.twin ? [-0.035, 0.035] : [0]) {
    piece(g, G.torus(r * a.thick, 0.012, Math.PI * 2, 4, 14), c.accent, { pos: [x, a.by, z], glow: true, outline: 0.006 });
  }
}

function tubes(g, c, a, r, color) {
  const xs = a.twin ? [-0.035, 0.035] : [0];
  for (const x of xs) piece(g, G.cylZ(r, r, a.len, 10), color, { pos: [x, a.by, a.z1 + a.len / 2] });
  return xs;
}

const BARREL = {
  plain: {
    name: 'Plain Barrel',
    build: (g, c, a) => {
      for (const x of tubes(g, c, a, 0.033 * a.thick, c.pal.metal)) piece(g, G.cylZ(0.048 * a.thick, 0.045 * a.thick, 0.06, 10), DARK, { pos: [x, a.by, a.z1 + a.len], outline: 0.012 });
      emitter(g, c, a, a.z1 + a.len + 0.035);
      return a.z1 + a.len + 0.05;
    },
  },
  shrouded: {
    name: 'Shrouded Barrel',
    build: (g, c, a) => {
      tubes(g, c, a, 0.03 * a.thick, c.pal.metal);
      piece(g, G.cylZ(0.065 * a.thick, 0.065 * a.thick, a.len * 0.65, 12), c.pal.primary, { pos: [0, a.by, a.z1 + a.len * 0.33] });
      for (let i = 0; i < 4; i++) piece(g, G.torus(0.066 * a.thick, 0.01, Math.PI * 2, 4, 12), c.accent, { pos: [0, a.by, a.z1 + 0.05 + i * a.len * 0.14], glow: true, outline: 0 });
      emitter(g, c, a, a.z1 + a.len + 0.01, 0.04);
      return a.z1 + a.len + 0.03;
    },
  },
  vented: {
    name: 'Vented Barrel',
    build: (g, c, a) => {
      tubes(g, c, a, 0.033 * a.thick, c.pal.metal);
      piece(g, G.box(0.075, 0.03, a.len * 0.75), c.pal.primary, { pos: [0, a.by + 0.045, a.z1 + a.len * 0.42] });
      for (let i = 0; i < 4; i++) piece(g, G.box(0.04, 0.032, 0.03), c.accent, { pos: [0, a.by + 0.046, a.z1 + a.len * (0.15 + i * 0.17)], glow: true, outline: 0 });
      piece(g, G.box(0.1, 0.075, 0.09), DARK, { pos: [0, a.by, a.z1 + a.len + 0.05] });
      for (const s of [-1, 1]) piece(g, G.box(0.012, 0.04, 0.05), c.pal.metal, { pos: [0.052 * s, a.by, a.z1 + a.len + 0.05], glow: true, outline: 0 });
      return a.z1 + a.len + 0.1;
    },
  },
  coil: {
    name: 'Coil Barrel',
    build: (g, c, a) => {
      tubes(g, c, a, 0.025, DARK);
      const n = Math.max(3, Math.round(a.len / 0.08));
      for (let i = 0; i < n; i++) piece(g, G.torus(0.05 * a.thick, 0.012, Math.PI * 2, 4, 12), c.accent, { pos: [0, a.by, a.z1 + 0.04 + (i * (a.len - 0.08)) / (n - 1)], glow: true, outline: 0.006 });
      piece(g, G.coneZ(0.05, 0.08, 8), c.pal.metal, { pos: [0, a.by, a.z1 + a.len + 0.03], rot: [Math.PI, 0, 0], outline: 0.01 });
      return a.z1 + a.len + 0.07;
    },
  },
  flared: {
    name: 'Flared Barrel',
    build: (g, c, a) => {
      for (const x of tubes(g, c, a, 0.035 * a.thick, c.pal.metal)) {
        piece(g, G.cylZ(0.085 * a.thick, 0.04 * a.thick, 0.12, 12), shade(c.pal.metal, 0.85), { pos: [x, a.by, a.z1 + a.len + 0.04] });
      }
      piece(g, G.torus(0.04 * a.thick, 0.012, Math.PI * 2, 4, 12), GOLD, { pos: [0, a.by, a.z1 + a.len * 0.5], outline: 0 });
      emitter(g, c, a, a.z1 + a.len + 0.1, 0.075);
      return a.z1 + a.len + 0.1;
    },
  },
};

// ================================================================ GUN GRIPS (incl. trigger)
function trigger(g) {
  piece(g, G.torus(0.055, 0.012, Math.PI, 4, 10), DARK, { pos: [0, 0, 0.08], rot: [Math.PI, Math.PI / 2, 0], outline: 0 });
  piece(g, G.box(0.015, 0.05, 0.015), DARK, { pos: [0, -0.01, 0.075], outline: 0 });
}

const GUN_GRIP = {
  straight: { name: 'Standard Grip', build: (g, c) => { trigger(g); piece(g, G.box(0.085, 0.24, 0.11), c.pal.secondary, { pos: [0, -0.09, -0.02], rot: [-0.25, 0, 0] }); } },
  raked: {
    name: 'Raked Grip',
    build: (g, c) => {
      trigger(g);
      piece(g, G.box(0.085, 0.25, 0.1), c.pal.secondary, { pos: [0, -0.09, -0.04], rot: [-0.55, 0, 0] });
      for (let i = 0; i < 3; i++) piece(g, G.cyl(0.02, 0.02, 0.09, 6), shade(c.pal.secondary, 0.7), { pos: [0, -0.05 - i * 0.055, 0.0 - i * 0.03], rot: [0, 0, Math.PI / 2], outline: 0 });
    },
  },
  wood: {
    name: 'Brass-Capped Grip',
    build: (g, c) => {
      trigger(g);
      piece(g, G.capsule(0.05, 0.16, 8), c.pal.secondary, { pos: [0, -0.1, -0.03], rot: [-0.35, 0, 0], scale: [0.9, 1, 1.15] });
      piece(g, G.box(0.09, 0.03, 0.12), c.pal.metal, { pos: [0, -0.205, -0.07], rot: [-0.35, 0, 0], outline: 0.01 });
    },
  },
  ergonomic: {
    name: 'Ergonomic Grip',
    build: (g, c) => {
      trigger(g);
      piece(g, G.capsule(0.05, 0.15, 10), c.pal.secondary, { pos: [0, -0.1, -0.03], rot: [-0.3, 0, 0], scale: [0.85, 1, 1.25] });
      piece(g, G.box(0.006, 0.16, 0.02), c.accent, { pos: [0.045, -0.1, -0.0], rot: [-0.3, 0, 0], glow: true, outline: 0 });
    },
  },
};

// ================================================================ STOCKS  a: { z0, len }
function stockProfile(len, kind) {
  if (kind === 'skeleton') {
    const s = G.shape([[0, 0.08], [len, 0.05], [len + 0.03, -0.12], [len - 0.06, -0.12], [0.1, -0.03], [0, -0.03]]);
    const hole = new THREE.Path();
    hole.moveTo(0.06, 0.04); hole.lineTo(len - 0.06, 0.02); hole.lineTo(len - 0.06, -0.07); hole.lineTo(0.12, 0.0); hole.lineTo(0.06, 0.0);
    s.holes.push(hole);
    return s;
  }
  if (kind === 'thumbhole') {
    const s = G.shape([[0, 0.09], [len, 0.08], [len + 0.03, -0.13], [len - 0.08, -0.14], [0.2, -0.1], [0.05, -0.12], [0, -0.03]]);
    const hole = new THREE.Path();
    hole.moveTo(0.06, -0.02); hole.lineTo(0.16, -0.0); hole.lineTo(0.16, -0.07); hole.lineTo(0.07, -0.08);
    s.holes.push(hole);
    return s;
  }
  return G.shape([[0, 0.08], [len, 0.05], [len + 0.03, -0.12], [len - 0.06, -0.13], [0.12, -0.03], [0, -0.03]]);
}

const stockPiece = (g, c, a, kind, color) =>
  piece(g, G.extrude(stockProfile(a.len, kind), 0.07, 0.008).rotateY(Math.PI / 2), color, { pos: [0, 0.05, a.z0] });

const STOCK = {
  solid: { name: 'Solid Stock', build: (g, c, a) => stockPiece(g, c, a, 'solid', c.pal.secondary) },
  padded: {
    name: 'Padded Stock',
    build: (g, c, a) => {
      stockPiece(g, c, a, 'solid', c.pal.secondary);
      piece(g, G.box(0.08, 0.21, 0.05), DARK, { pos: [0, -0.01, a.z0 - a.len - 0.03], outline: 0.012 });
    },
  },
  skeleton: { name: 'Skeleton Stock', build: (g, c, a) => stockPiece(g, c, a, 'skeleton', c.pal.secondary) },
  thumbhole: { name: 'Thumbhole Stock', build: (g, c, a) => stockPiece(g, c, a, 'thumbhole', c.pal.primary) },
  wire: {
    name: 'Wire Stock',
    build: (g, c, a) => {
      const z = a.z0;
      const L = a.len;
      piece(g, G.tube([[0, 0.1, z], [0, 0.08, z - L * 0.5], [0, 0.05, z - L]], 0.012, 8, 4), c.pal.metal, { outline: 0.008 });
      piece(g, G.tube([[0, -0.02, z], [0, -0.07, z - L * 0.6], [0, -0.1, z - L]], 0.012, 8, 4), c.pal.metal, { outline: 0.008 });
      piece(g, G.box(0.07, 0.19, 0.03), DARK, { pos: [0, -0.02, z - L], outline: 0.01 });
    },
  },
};

// ================================================================ MAGAZINES  a: { mid, z1, kind, m }
const MAGAZINE = {
  straight: {
    name: 'Box Magazine',
    build: (g, c, a) => {
      if (a.kind === 'pistol') piece(g, G.box(0.09, 0.03, 0.12), DARK, { pos: [0, -0.21, -0.06], rot: [-0.3, 0, 0], outline: 0.012 });
      else {
        piece(g, G.box(0.06, 0.2 * a.m, 0.09), shade(c.pal.secondary, 0.6), { pos: [0, -0.02 - 0.1 * a.m, a.mid + 0.08] });
        piece(g, G.box(0.065, 0.12 * a.m, 0.02), c.accent, { pos: [0, -0.02 - 0.1 * a.m, a.mid + 0.125], glow: true, outline: 0 });
      }
    },
  },
  curved: {
    name: 'Curved Magazine',
    build: (g, c, a) => {
      if (a.kind === 'pistol') return MAGAZINE.straight.build(g, c, a);
      for (let i = 0; i < 3; i++) piece(g, G.box(0.06, 0.1 * a.m, 0.09), shade(c.pal.secondary, 0.6), { pos: [0, -0.02 - 0.085 * a.m * i, a.mid + 0.06 + 0.03 * i], rot: [-0.22 * i, 0, 0] });
    },
  },
  drum: {
    name: 'Drum Magazine',
    build: (g, c, a) => {
      const z = a.kind === 'pistol' ? 0.02 : a.mid + 0.06;
      piece(g, G.cyl(0.11, 0.11, 0.09, 16), shade(c.pal.secondary, 0.6), { pos: [0, -0.1, z], rot: [0, 0, Math.PI / 2] });
      piece(g, G.cyl(0.05, 0.05, 0.1, 10), c.accent, { pos: [0, -0.1, z], rot: [0, 0, Math.PI / 2], glow: true, outline: 0.01 });
    },
  },
  tube: {
    name: 'Tube Magazine',
    build: (g, c, a) => {
      if (a.kind === 'pistol') return MAGAZINE.straight.build(g, c, a);
      piece(g, G.cylZ(0.035, 0.035, 0.4, 10), DARK, { pos: [0, 0.0, a.z1 + 0.15] });
    },
  },
  cell: {
    name: 'Power Cell',
    build: (g, c, a) => {
      const z = a.kind === 'pistol' ? -0.03 : a.mid + 0.08;
      const y = a.kind === 'pistol' ? -0.2 : -0.1;
      piece(g, G.box(0.07, 0.12, 0.08), DARK, { pos: [0, y, z] });
      for (let i = 0; i < 3; i++) piece(g, G.box(0.075, 0.015, 0.085), c.accent, { pos: [0, y - 0.03 + i * 0.03, z], glow: true, outline: 0 });
    },
  },
};

// ================================================================ MAGIC SHAFTS  a: { z0, len, r }  — focus rods
const SHAFT = {
  straight: {
    name: 'Alloy Rod',
    build: (g, c, a) => {
      piece(g, G.cylZ(a.r * 0.75, a.r, a.len, 10), c.shaftColor, { pos: [0, 0, a.z0 + a.len / 2] });
      for (const t of [0.3, 0.65]) glowBand(g, c, a.z0 + a.len * t, a.r * 1.05);
    },
  },
  twisted: {
    name: 'Coiled Rod',
    build: (g, c, a) => {
      piece(g, G.cylZ(a.r * 0.7, a.r * 0.9, a.len, 8), c.shaftColor, { pos: [0, 0, a.z0 + a.len / 2] });
      const pts = [];
      for (let i = 0; i <= 40; i++) {
        const t = i / 40;
        pts.push([Math.cos(t * Math.PI * 10) * a.r, Math.sin(t * Math.PI * 10) * a.r, a.z0 + t * a.len]);
      }
      piece(g, G.tube(pts, a.r * 0.3, 80, 4), c.accent, { glow: true, outline: 0.006 });
    },
  },
  knotted: {
    name: 'Node Rod',
    build: (g, c, a) => {
      piece(g, G.cylZ(a.r * 0.8, a.r, a.len, 8), c.shaftColor, { pos: [0, 0, a.z0 + a.len / 2] });
      for (let i = 1; i < 4; i++) {
        piece(g, G.cylZ(a.r * 1.6, a.r * 1.6, a.r * 1.6, 8), c.pal.primary, { pos: [0, 0, a.z0 + (a.len * i) / 4], outline: 0.008 });
        glowBand(g, c, a.z0 + (a.len * i) / 4, a.r * 1.65);
      }
    },
  },
  segmented: {
    name: 'Segmented Rod',
    build: (g, c, a) => {
      const n = 5;
      for (let i = 0; i < n; i++) {
        const z = a.z0 + (a.len / n) * (i + 0.5);
        piece(g, G.cylZ(a.r * 0.9, a.r * 0.9, a.len / n - 0.03, 8), i % 2 ? c.pal.metal : c.pal.primary, { pos: [0, 0, z] });
        piece(g, G.cylZ(a.r * 0.5, a.r * 0.5, 0.03, 6), c.accent, { pos: [0, 0, z + a.len / n / 2], glow: true, outline: 0 });
      }
    },
  },
  bone: {
    name: 'Ceramic Rod',
    build: (g, c, a) => {
      const n = 4;
      for (let i = 0; i < n; i++) {
        const z = a.z0 + (a.len / n) * (i + 0.5);
        piece(g, G.cylZ(a.r * 0.8, a.r, a.len / n, 8), BONE, { pos: [0, 0, z] });
        piece(g, G.cylZ(a.r * 1.3, a.r * 1.3, 0.025, 8), DARK, { pos: [0, 0, z - a.len / n / 2], outline: 0.008 });
      }
    },
  },
};

// ================================================================ WAND / STAFF HEADS  a: { tip, size }  → muzzle z
const HEAD = {
  prongs: {
    name: 'Emitter Prongs',
    build: (g, c, a) => {
      const s = a.size;
      piece(g, G.cylZ(0.05 * s, 0.04 * s, 0.08 * s, 12), c.pal.metal, { pos: [0, 0, a.tip] });
      const n = c.tier >= 2 ? 4 : 3;
      for (let i = 0; i < n; i++) {
        const t = (i / n) * Math.PI * 2;
        const pts = [[0.04, 0.02], [0.15, 0.14], [0.14, 0.3], [0.05, 0.4]].map(([r, z]) => [Math.cos(t) * r * s, Math.sin(t) * r * s, a.tip + z * s]);
        piece(g, G.tube(pts, 0.016 * s, 12, 5), c.pal.metal, { outline: 0.008 });
      }
      gem(g, c, [0, 0, a.tip + 0.22 * s], 0.1 * s, c.gemShape);
      return a.tip + 0.22 * s;
    },
  },
  orbcage: {
    name: 'Caged Core',
    build: (g, c, a) => {
      const s = a.size;
      for (let i = 0; i < 3; i++) {
        const t = (i / 3) * Math.PI * 2;
        const pts = [[0.03, 0], [0.13, 0.1], [0.13, 0.25], [0, 0.34]].map(([r, z]) => [Math.cos(t) * r * s, Math.sin(t) * r * s, a.tip + z * s]);
        piece(g, G.tube(pts, 0.013 * s, 12, 4), c.pal.metal, { outline: 0.006 });
      }
      gem(g, c, [0, 0, a.tip + 0.17 * s], 0.09 * s, 'ico');
      return a.tip + 0.17 * s;
    },
  },
  cluster: {
    name: 'Crystal Cluster',
    build: (g, c, a) => {
      const s = a.size;
      piece(g, G.cylZ(0.05 * s, 0.035 * s, 0.06 * s, 8), c.pal.metal, { pos: [0, 0, a.tip] });
      const shards = [[0, 0, 0.18, 0, 0, 1.2], [0.06, 0.03, 0.12, 0.5, -0.4, 0.8], [-0.06, 0.02, 0.13, 0.4, 0.5, 0.8], [0.0, -0.06, 0.12, -0.5, 0, 0.7]];
      for (const [x, y, z, rx, ry, k] of shards) {
        piece(g, G.octa(0.06 * s), c.gemColor, { pos: [x * s, y * s, a.tip + z * s], rot: [Math.PI / 2 + rx, ry, 0], scale: [0.6 * k, 2 * k, 0.6 * k], glow: true, outline: 0.01 });
      }
      return a.tip + 0.25 * s;
    },
  },
  antler: {
    name: 'Antenna Array',
    build: (g, c, a) => {
      const s = a.size;
      for (const sd of [-1, 1]) {
        piece(g, G.tube([[0, 0, a.tip], [sd * 0.08 * s, 0, a.tip + 0.12 * s], [sd * 0.18 * s, 0, a.tip + 0.2 * s], [sd * 0.2 * s, 0, a.tip + 0.34 * s]], 0.016 * s, 12, 5), c.pal.metal, { outline: 0.008 });
        piece(g, G.tube([[sd * 0.12 * s, 0, a.tip + 0.16 * s], [sd * 0.08 * s, 0.05 * s, a.tip + 0.26 * s]], 0.012 * s, 6, 4), c.accent, { glow: true, outline: 0.006 });
      }
      gem(g, c, [0, 0, a.tip + 0.2 * s], 0.07 * s, 'dodeca');
      return a.tip + 0.2 * s;
    },
  },
  ring: {
    name: 'Halo Emitter',
    build: (g, c, a) => {
      const s = a.size;
      piece(g, G.torus(0.14 * s, 0.022 * s, Math.PI * 2, 6, 24), c.pal.metal, { pos: [0, 0, a.tip + 0.16 * s], rot: [0, Math.PI / 2, 0] });
      piece(g, G.cylZ(0.03 * s, 0.03 * s, 0.04 * s, 8), c.pal.metal, { pos: [0, 0, a.tip + 0.01 * s] });
      gem(g, c, [0, 0, a.tip + 0.16 * s], 0.07 * s, c.gemShape);
      return a.tip + 0.16 * s;
    },
  },
  crescent: {
    name: 'Crescent Emitter',
    build: (g, c, a) => {
      const s = a.size;
      piece(g, G.torus(0.18 * s, 0.03 * s, Math.PI * 1.3, 6, 20), c.pal.metal, { pos: [0, 0, a.tip + 0.2 * s], rot: [0, Math.PI / 2, -Math.PI * 0.15 - Math.PI / 2] });
      gem(g, c, [0, 0, a.tip + 0.2 * s], 0.09 * s, c.gemShape);
      return a.tip + 0.2 * s;
    },
  },
  branch: {
    name: 'Root Conduit',
    build: (g, c, a) => {
      const s = a.size;
      for (let i = 0; i < 3; i++) {
        const t = (i / 3) * Math.PI * 2;
        const pts = [[0.02, 0], [0.12, 0.08], [0.06, 0.2], [0.12, 0.32]].map(([r, z], k) => [Math.cos(t + k * 0.5) * r * s, Math.sin(t + k * 0.5) * r * s, a.tip + z * s]);
        piece(g, G.tube(pts, 0.016 * s, 12, 5), c.accent, { glow: true, outline: 0.008 });
      }
      gem(g, c, [0, 0, a.tip + 0.18 * s], 0.08 * s, 'dodeca');
      return a.tip + 0.18 * s;
    },
  },
  claw: {
    name: 'Clamp Head',
    build: (g, c, a) => {
      const s = a.size;
      piece(g, G.sphere(0.06 * s, 10, 8), c.pal.primary, { pos: [0, 0, a.tip] });
      for (let i = 0; i < 3; i++) {
        const t = (i / 3) * Math.PI * 2;
        const pts = [[0.04, 0.02], [0.13, 0.1], [0.12, 0.24], [0.02, 0.33]].map(([r, z]) => [Math.cos(t) * r * s, Math.sin(t) * r * s, a.tip + z * s]);
        piece(g, G.tube(pts, 0.022 * s, 12, 5), shade(c.pal.primary, 0.8), { outline: 0.008 });
        piece(g, G.coneZ(0.02 * s, 0.07 * s, 5), BONE, { pos: [Math.cos(t) * 0.02 * s, Math.sin(t) * 0.02 * s, a.tip + 0.35 * s], rot: [0, 0, 0], outline: 0.006 });
      }
      gem(g, c, [0, 0, a.tip + 0.18 * s], 0.08 * s, c.gemShape);
      return a.tip + 0.18 * s;
    },
  },
  spire: {
    name: 'Spire Core',
    build: (g, c, a) => {
      const s = a.size;
      piece(g, G.cylZ(0.06 * s, 0.04 * s, 0.07 * s, 10), c.pal.metal, { pos: [0, 0, a.tip] });
      const f = floatGroup(g, [0, 0, a.tip + 0.28 * s], 0.8);
      piece(f, G.octa(0.08 * s), c.gemColor, { rot: [Math.PI / 2, 0, 0], scale: [0.8, 3, 0.8], glow: true, outline: 0.012 });
      const o = floatGroup(g, [0, 0, a.tip + 0.28 * s], -2.5);
      for (let i = 0; i < 3; i++) {
        const t = (i / 3) * Math.PI * 2;
        piece(o, G.octa(0.03 * s), c.gemColor, { pos: [Math.cos(t) * 0.14 * s, Math.sin(t) * 0.14 * s, 0], glow: true, outline: 0.006 });
      }
      return a.tip + 0.28 * s;
    },
  },
};

// ================================================================ TOME COVERS  (codex centred at z 0.25)
// Holo-codex: an alloy slab with circuit inlay that projects glowing pages.
function book(g, c) {
  piece(g, G.box(0.36, 0.08, 0.46), c.bindingColor, { pos: [0, 0, 0.25] });
  piece(g, G.box(0.3, 0.085, 0.4), shade(c.bindingColor, 0.7), { pos: [0.01, 0, 0.25], outline: 0 });
  piece(g, G.cylZ(0.05, 0.05, 0.46, 8), c.pal.metal, { pos: [-0.18, 0, 0.25] });
  for (const z of [0.1, 0.25, 0.4]) piece(g, G.box(0.26, 0.006, 0.012), c.accent, { pos: [0.02, 0.044, z], glow: true, outline: 0 });
  piece(g, G.box(0.012, 0.006, 0.32), c.accent, { pos: [0.15, 0.044, 0.25], glow: true, outline: 0 });
  const f = floatGroup(g, [0, 0.32, 0.25]);
  piece(f, G.octa(0.08), c.gemColor, { glow: true, outline: 0.012 });
  const pages = floatGroup(g, [0, 0.25, 0.25], 1.2);
  for (const s of [-1, 1]) piece(pages, G.box(0.13, 0.004, 0.17), c.accent, { pos: [0.22 * s, 0, 0], rot: [0.3 * s, 0, 0.4 * s], glow: true, outline: 0.006 });
}

const COVER = {
  plain: { name: 'Slate Codex', build: (g, c) => { book(g, c); piece(g, G.torus(0.09, 0.01, Math.PI * 2, 4, 20), c.accent, { pos: [0, 0.046, 0.25], rot: [Math.PI / 2, 0, 0], glow: true, outline: 0 }); } },
  studded: {
    name: 'Riveted Codex',
    build: (g, c) => {
      book(g, c);
      for (const x of [-0.13, 0.13]) for (const z of [0.06, 0.44]) piece(g, G.cyl(0.02, 0.02, 0.02, 6), c.pal.metal, { pos: [x, 0.05, z], outline: 0 });
      piece(g, G.box(0.05, 0.07, 0.08), c.pal.metal, { pos: [0.19, 0, 0.25], outline: 0.01 });
    },
  },
  skull: {
    name: 'Skull Codex',
    build: (g, c) => {
      book(g, c);
      piece(g, G.sphere(0.07, 10, 8), BONE, { pos: [0, 0.06, 0.27], scale: [1, 0.5, 1.1], outline: 0.01 });
      for (const s of [-1, 1]) piece(g, G.sphere(0.016, 6, 4), c.accent, { pos: [0.025 * s, 0.09, 0.29], glow: true, outline: 0 });
    },
  },
  eye: {
    name: 'Seer Codex',
    build: (g, c) => {
      book(g, c);
      piece(g, G.sphere(0.06, 12, 8), 0xffffff, { pos: [0, 0.05, 0.25], scale: [1.3, 0.4, 0.8], glow: true, outline: 0.01 });
      piece(g, G.sphere(0.03, 8, 6), c.accent, { pos: [0, 0.07, 0.25], scale: [1, 0.5, 1], glow: true, outline: 0 });
    },
  },
  gilded: {
    name: 'Gilded Codex',
    build: (g, c) => {
      book(g, c);
      for (const x of [-0.16, 0.16]) for (const z of [0.04, 0.46]) piece(g, G.box(0.06, 0.1, 0.06), GOLD, { pos: [x, 0, z], outline: 0.01 });
      piece(g, G.torus(0.08, 0.01, Math.PI * 2, 4, 20), GOLD, { pos: [0, 0.046, 0.25], rot: [Math.PI / 2, 0, 0], outline: 0 });
    },
  },
};

// ================================================================ SPEAR HEADS  a: { tip, s, barbs }  — energy lances
function spearBlade(g, c, a, pts, depth = 0.03) {
  const scaled = pts.map(([x, y]) => [x * a.s, y * a.s]);
  piece(g, flatZ(G.extrude(G.shape(scaled), depth * 0.55, 0.006)), c.accent, { pos: [0, 0, a.tip], glow: true, outline: 0.02 });
  const inner = scaled.map(([x, y]) => [x * 0.55, y * 0.85]);
  piece(g, flatZ(G.extrude(G.shape(inner), depth, 0.006)), c.pal.metal, { pos: [0, 0, a.tip] });
}
const spearSocket = (g, c, a) => {
  piece(g, G.cylZ(0.035, 0.055, 0.16, 8), c.pal.primary, { pos: [0, 0, a.tip - 0.04] });
  glowBand(g, c, a.tip - 0.06, 0.05);
};

const SPEAR_HEAD = {
  leaf: { name: 'Leaf Lance', build: (g, c, a) => { spearSocket(g, c, a); spearBlade(g, c, a, [[0, 0], [-0.07, 0.12], [-0.06, 0.32], [0, 0.48], [0.06, 0.32], [0.07, 0.12]]); } },
  pike: {
    name: 'Pike Emitter',
    build: (g, c, a) => {
      spearSocket(g, c, a);
      piece(g, G.coneZ(0.035, 0.45 * a.s, 4), c.pal.metal, { pos: [0, 0, a.tip + 0.22 * a.s] });
      for (const t of [0.08, 0.2]) piece(g, G.torus(0.04 - t * 0.1, 0.008, Math.PI * 2, 4, 10), c.accent, { pos: [0, 0, a.tip + t * a.s], glow: true, outline: 0 });
    },
  },
  winged: {
    name: 'Winged Lance',
    build: (g, c, a) => {
      spearSocket(g, c, a);
      spearBlade(g, c, a, [[0, 0], [-0.06, 0.1], [-0.05, 0.36], [0, 0.5], [0.05, 0.36], [0.06, 0.1]]);
      for (const s of [-1, 1]) {
        piece(g, G.box(0.12, 0.025, 0.035), c.pal.primary, { pos: [0.08 * s, 0, a.tip + 0.02], outline: 0.01 });
        node(g, c, 0.14 * s, 0, a.tip + 0.02, 0.02);
      }
    },
  },
  trident: {
    name: 'Trident Array',
    build: (g, c, a) => {
      piece(g, G.box(0.26 * a.s, 0.04, 0.05), c.pal.primary, { pos: [0, 0, a.tip] });
      for (const x of [-0.12, 0, 0.12]) {
        piece(g, G.coneZ(0.025, (x ? 0.3 : 0.4) * a.s, 4), c.pal.metal, { pos: [x * a.s, 0, a.tip + (x ? 0.15 : 0.2) * a.s] });
        node(g, c, x * a.s, 0, a.tip + (x ? 0.3 : 0.4) * a.s, 0.018);
      }
    },
  },
  glaive: {
    name: 'Glaive Edge',
    build: (g, c, a) => {
      spearSocket(g, c, a);
      const s = curveShape((sh) => {
        sh.moveTo(-0.04, 0); sh.quadraticCurveTo(-0.16, 0.25, -0.02, 0.55); sh.quadraticCurveTo(0.06, 0.3, 0.05, 0);
      });
      piece(g, flatZ(G.extrude(s, 0.016, 0.006)).scale(a.s, 1, a.s), c.accent, { pos: [0, 0, a.tip], glow: true, outline: 0.02 });
      piece(g, flatZ(G.extrude(s, 0.03, 0.006)).scale(a.s * 0.6, 1, a.s * 0.85), c.pal.metal, { pos: [0, 0, a.tip] });
    },
  },
  hooked: {
    name: 'Hooked Lance',
    build: (g, c, a) => {
      spearSocket(g, c, a);
      spearBlade(g, c, a, [[0, 0], [-0.05, 0.1], [-0.04, 0.34], [0, 0.46], [0.04, 0.34], [0.05, 0.1]]);
      piece(g, G.tube([[0.04, 0, a.tip + 0.05], [0.16, 0, a.tip + 0.06], [0.2, 0, a.tip - 0.05], [0.15, 0, a.tip - 0.12]], 0.018, 10, 4), c.pal.metal, { outline: 0.008 });
    },
  },
};

// ================================================================ HAMMER HEADS  a: { tip, s, glow }  — piston and shock mauls
const HAMMER_HEAD = {
  block: {
    name: 'Piston Maul',
    build: (g, c, a) => {
      const s = a.s;
      piece(g, G.box(0.36 * s, 0.22 * s, 0.22 * s), shade(c.pal.metal, 0.85), { pos: [0, 0, a.tip] });
      for (const x of [-0.24, 0.24]) piece(g, G.cyl(0.11 * s, 0.11 * s, 0.1 * s, 12), c.pal.primary, { pos: [x * s, 0, a.tip], rot: [0, 0, Math.PI / 2] });
      for (const y of [-1, 1]) piece(g, G.cyl(0.025 * s, 0.025 * s, 0.5 * s, 6), c.pal.metal, { pos: [0, 0.13 * s * y, a.tip], rot: [0, 0, Math.PI / 2], outline: 0.008 });
      piece(g, G.box(0.14 * s, 0.1 * s, 0.225 * s), c.accent, { pos: [0, 0, a.tip], glow: true, outline: 0 });
    },
  },
  round: {
    name: 'Drum Driver',
    build: (g, c, a) => {
      const s = a.s;
      piece(g, G.cyl(0.14 * s, 0.14 * s, 0.44 * s, 14), shade(c.pal.metal, 0.85), { pos: [0, 0, a.tip], rot: [0, 0, Math.PI / 2] });
      for (const x of [-0.23, 0.23]) piece(g, G.cyl(0.16 * s, 0.16 * s, 0.04, 14), c.pal.primary, { pos: [x * s, 0, a.tip], rot: [0, 0, Math.PI / 2], outline: 0.01 });
      for (const x of [-0.1, 0, 0.1]) piece(g, G.torus(0.142 * s, 0.01, Math.PI * 2, 4, 16), c.accent, { pos: [x * s, 0, a.tip], rot: [0, Math.PI / 2, 0], glow: true, outline: 0 });
    },
  },
  flanged: {
    name: 'Flanged Breaker',
    build: (g, c, a) => {
      const s = a.s;
      piece(g, G.cylZ(0.07 * s, 0.07 * s, 0.3 * s, 8), c.pal.primary, { pos: [0, 0, a.tip] });
      for (let i = 0; i < 6; i++) {
        const t = (i / 6) * Math.PI * 2;
        const fl = flatZ(G.extrude(G.shape([[0, -0.14], [0.14, -0.08], [0.14, 0.08], [0, 0.14]]), 0.025, 0.005)).scale(s, 1, s);
        piece(g, fl, c.pal.metal, { pos: [0, 0, a.tip], rot: [0, 0, t] });
      }
      for (const z of [-0.12, 0.12]) piece(g, G.torus(0.075 * s, 0.01, Math.PI * 2, 4, 12), c.accent, { pos: [0, 0, a.tip + z * s], glow: true, outline: 0 });
    },
  },
  spiked: {
    name: 'Shock Star',
    build: (g, c, a) => {
      const s = a.s;
      piece(g, G.sphere(0.15 * s, 12, 10), shade(c.pal.metal, 0.8), { pos: [0, 0, a.tip] });
      const dirs = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0.7, 0.7, 0], [-0.7, 0.7, 0], [0.7, -0.7, 0], [-0.7, -0.7, 0], [0, 0.7, 0.7], [0.7, 0, 0.7], [-0.7, 0, 0.7]];
      dirs.forEach(([x, y, z], i) => {
        const m = piece(g, G.cone(0.035 * s, 0.13 * s, 5), i % 3 ? c.pal.metal : c.accent, { pos: [x * 0.17 * s, y * 0.17 * s, a.tip + z * 0.17 * s], glow: !(i % 3), outline: 0.008 });
        m.lookAt(m.position.clone().add(new THREE.Vector3(x, y, z)));
        m.rotateX(Math.PI / 2);
      });
      piece(g, G.torus(0.155 * s, 0.012, Math.PI * 2, 4, 20), c.accent, { pos: [0, 0, a.tip], rot: [Math.PI / 2, 0, 0], glow: true, outline: 0 });
    },
  },
  warpick: {
    name: 'Rail Pick',
    build: (g, c, a) => {
      const s = a.s;
      piece(g, G.box(0.18 * s, 0.2 * s, 0.2 * s), shade(c.pal.metal, 0.85), { pos: [0.1 * s, 0, a.tip] });
      piece(g, G.cone(0.06 * s, 0.38 * s, 4), c.pal.metal, { pos: [-0.2 * s, 0, a.tip], rot: [0, 0, Math.PI / 2 + 0.25] });
      piece(g, G.box(0.3 * s, 0.02, 0.02), c.accent, { pos: [-0.12 * s, 0.035 * s, a.tip], rot: [0, 0, 0.25], glow: true, outline: 0 });
      piece(g, G.box(0.04, 0.16 * s, 0.16 * s), c.accent, { pos: [0.2 * s, 0, a.tip], glow: true, outline: 0.01 });
    },
  },
};

// ================================================================ LAUNCHER TUBES  a: { len }  → muzzle z
const LAUNCHER_TUBE = {
  tube: {
    name: 'Single Tube',
    build: (g, c, a) => {
      piece(g, G.cylZ(0.1, 0.1, a.len, 14), c.pal.primary, { pos: [0, 0.14, a.len / 2 - 0.35] });
      for (const z of [-0.33, a.len - 0.37]) piece(g, G.cylZ(0.12, 0.12, 0.08, 14), DARK, { pos: [0, 0.14, z], outline: 0.012 });
      piece(g, G.box(0.06, 0.08, 0.2), DARK, { pos: [-0.12, 0.2, 0.05], outline: 0.01 });
      return a.len - 0.3;
    },
  },
  quad: {
    name: 'Quad Pod',
    build: (g, c, a) => {
      piece(g, G.box(0.26, 0.26, a.len * 0.8), c.pal.primary, { pos: [0, 0.16, a.len * 0.4 - 0.3] });
      for (const [x, y] of [[-0.06, 0.1], [0.06, 0.1], [-0.06, 0.22], [0.06, 0.22]]) {
        piece(g, G.cylZ(0.045, 0.045, 0.02, 10), DARK, { pos: [x, y, a.len * 0.8 - 0.3], glow: true, outline: 0 });
      }
      piece(g, G.box(0.27, 0.04, a.len * 0.5), c.accent, { pos: [0, 0.3, a.len * 0.35 - 0.3], glow: c.showAccent, outline: 0.01 });
      return a.len * 0.8 - 0.28;
    },
  },
  drum: {
    name: 'Revolver Drum',
    build: (g, c, a) => {
      piece(g, G.cylZ(0.07, 0.07, a.len, 12), c.pal.metal, { pos: [0, 0.14, a.len / 2 - 0.25] });
      piece(g, G.cylZ(0.17, 0.17, 0.24, 12), c.pal.primary, { pos: [0, 0.14, 0.02] });
      for (let i = 0; i < 6; i++) {
        const t = (i / 6) * Math.PI * 2;
        piece(g, G.cylZ(0.04, 0.04, 0.25, 8), DARK, { pos: [Math.cos(t) * 0.11, 0.14 + Math.sin(t) * 0.11, 0.02], outline: 0 });
      }
      piece(g, G.coneZ(0.11, 0.12, 12), DARK, { pos: [0, 0.14, a.len - 0.22], rot: [Math.PI, 0, 0], outline: 0.012 });
      return a.len - 0.18;
    },
  },
};

// ================================================================ CROSSBOW LIMBS  a: { span, z, metal, repeater }
const LIMBS = {
  recurve: {
    name: 'Recurve Limbs',
    build: (g, c, a) => {
      const sp = a.span;
      for (const s of [-1, 1]) {
        piece(g, G.tube([[0, 0.08, a.z], [0.18 * s * sp, 0.08, a.z - 0.05], [0.34 * s * sp, 0.08, a.z - 0.15], [0.42 * s * sp, 0.08, a.z - 0.1]], 0.022, 12, 5), a.metal ? c.pal.metal : c.pal.primary, { outline: 0.01 });
      }
      piece(g, G.box(0.8 * sp, 0.008, 0.008), c.accent, { pos: [0, 0.08, a.z - 0.12], glow: true, outline: 0 });
    },
  },
  compound: {
    name: 'Compound Limbs',
    build: (g, c, a) => {
      const sp = a.span;
      for (const s of [-1, 1]) {
        piece(g, G.box(0.34 * sp, 0.03, 0.05), a.metal ? c.pal.metal : c.pal.primary, { pos: [0.2 * s * sp, 0.08, a.z - 0.06], rot: [0, 0.35 * s, 0] });
        piece(g, G.cyl(0.04, 0.04, 0.03, 10), DARK, { pos: [0.37 * s * sp, 0.08, a.z - 0.13], outline: 0.008 });
      }
      piece(g, G.box(0.74 * sp, 0.008, 0.008), c.accent, { pos: [0, 0.08, a.z - 0.13], glow: true, outline: 0 });
    },
  },
  heavy: {
    name: 'Steel Prod',
    build: (g, c, a) => {
      const sp = a.span;
      piece(g, G.box(0.86 * sp, 0.05, 0.06), shade(c.pal.metal, 0.85), { pos: [0, 0.08, a.z] });
      for (const s of [-1, 1]) piece(g, G.box(0.06, 0.08, 0.08), c.pal.primary, { pos: [0.43 * s * sp, 0.08, a.z], outline: 0.01 });
      piece(g, G.box(0.86 * sp, 0.008, 0.008), c.accent, { pos: [0, 0.08, a.z - 0.1], glow: true, outline: 0 });
    },
  },
};

// ================================================================ ORB SHELLS  (orb floats above the hand)
function orbCore(g, c, r = 0.11) {
  const f = floatGroup(g, [0, 0.32, 0.2], 1);
  piece(f, G.sphere(r, 16, 12), c.gemColor, { glow: true, outline: 0.012 });
  piece(g, G.cylZ(0.03, 0.035, 0.22, 8), c.pal.primary, { pos: [0, 0, 0.02] });
  piece(g, G.sphere(0.05, 8, 6), c.pal.metal, { pos: [0, 0.03, 0.14], outline: 0.01 });
  return f;
}

const ORB_SHELL = {
  gyro: {
    name: 'Gyroscope Shell',
    build: (g, c) => {
      orbCore(g, c);
      for (const [rate, rot] of [[1.8, [0, 0, 0]], [-2.6, [Math.PI / 2, 0, 0]]]) {
        const f = floatGroup(g, [0, 0.32, 0.2], rate);
        piece(f, G.torus(0.19, 0.012, Math.PI * 2, 4, 24), c.pal.metal, { rot, outline: 0.006 });
      }
    },
  },
  shards: {
    name: 'Shard Halo',
    build: (g, c) => {
      orbCore(g, c, 0.09);
      const f = floatGroup(g, [0, 0.32, 0.2], 2.2);
      for (let i = 0; i < 5; i++) {
        const t = (i / 5) * Math.PI * 2;
        piece(f, G.octa(0.04), c.gemColor, { pos: [Math.cos(t) * 0.2, Math.sin(t) * 0.2, 0], scale: [0.6, 1.6, 0.6], rot: [0, 0, t], glow: true, outline: 0.006 });
      }
    },
  },
  halo: {
    name: 'Twin Halo',
    build: (g, c) => {
      orbCore(g, c);
      for (const [y, rate] of [[0.2, 1.4], [0.44, -1.4]]) {
        const f = floatGroup(g, [0, y, 0.2], rate);
        piece(f, G.torus(0.14, 0.01, Math.PI * 2, 4, 20), c.accent, { rot: [Math.PI / 2, 0, 0], glow: true, outline: 0 });
      }
    },
  },
  eye: {
    name: 'Watching Eye',
    build: (g, c) => {
      const f = orbCore(g, c, 0.12);
      piece(f, G.sphere(0.06, 10, 8), 0xffffff, { pos: [0, 0, 0.08], scale: [1, 1, 0.5], glow: true, outline: 0 });
      piece(f, G.sphere(0.03, 8, 6), DARK, { pos: [0, 0, 0.11], scale: [1, 1, 0.5], glow: true, outline: 0 });
    },
  },
};

export const FORMS = {
  blade: BLADE, guard: GUARD, grip: GRIP, pommel: POMMEL,
  axeHead: AXE_HEAD, haft: HAFT, spearHead: SPEAR_HEAD, hammerHead: HAMMER_HEAD,
  receiver: RECEIVER, barrel: BARREL, gunGrip: GUN_GRIP, stock: STOCK, magazine: MAGAZINE,
  launcherTube: LAUNCHER_TUBE, limbs: LIMBS,
  shaft: SHAFT, head: HEAD, cover: COVER, orbShell: ORB_SHELL,
};

export const KIND_LABEL = {
  blade: 'Blade', guard: 'Guard', grip: 'Grip', pommel: 'Pommel', axeHead: 'Head', haft: 'Haft',
  spearHead: 'Point', hammerHead: 'Head',
  receiver: 'Receiver', barrel: 'Barrel', gunGrip: 'Grip', stock: 'Stock', magazine: 'Magazine',
  launcherTube: 'Tube', limbs: 'Limbs',
  shaft: 'Shaft', head: 'Head', cover: 'Cover', orbShell: 'Shell',
};

export const formIds = (kind) => Object.keys(FORMS[kind]);
