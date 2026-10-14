// The building kit's roofs (docs/GRAPHICS_PLAN.md G2): gable, hip, shed, flat behind a parapet
// (crenellated, for the Wardens), sawtooth with glazed teeth, and a dome on a drum. Each is built
// into a group standing on the wall tops (y = 0 there), centred on the block it covers, with its
// ridge along local x; world/build/kit.js turns the group for a ridge the other way. Each returns
// how high it rises above the wall tops.
import * as THREE from 'three';
import { piece, G } from '../../render/ModelKit.js';

// Boxes of the same size share one geometry (render/ModelKit.js bake reuses its work on each).
const boxes = new Map();
export function box(w, h, d) {
  const k = `${w.toFixed(3)},${h.toFixed(3)},${d.toFixed(3)}`;
  let g = boxes.get(k);
  if (!g) {
    if (boxes.size > 6000) boxes.clear();
    boxes.set(k, (g = G.box(w, h, d)));
  }
  return g;
}

// A hip roof as one closed solid: a base len × span, its ridge along x at `rise` (a pyramid when
// it's square).
export function hipGeometry(len, span, rise) {
  const L = len / 2;
  const S = span / 2;
  const r = Math.max(0, L - S);
  const v = [];
  const tri = (a, b, c) => v.push(...a, ...b, ...c);
  const quad = (a, b, c, d) => { tri(a, b, c); tri(a, c, d); };
  const A = [-L, 0, S];
  const B = [L, 0, S];
  const Cb = [L, 0, -S];
  const D = [-L, 0, -S];
  const R0 = [-r, rise, 0];
  const R1 = [r, rise, 0];
  quad(A, B, R1, R0);   // front
  quad(Cb, D, R0, R1);  // back
  tri(B, Cb, R1);       // right
  tri(D, A, R0);        // left
  quad(D, Cb, B, A);    // underside
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  geo.computeVertexNormals();
  return geo;
}

// r: { len, span, rise, ov (eaves), roof, wall, trim, roofSurf, wallSurf, glow }
export const ROOFS = {
  // Two slabs meeting at a ridge, the gable ends filled in the wall's colour, bargeboards.
  gable(g, r) {
    const { len, span, rise, ov } = r;
    const th = Math.atan2(rise, span / 2);
    const half = span / 2 + ov;
    const slope = half / Math.cos(th);
    const t = 0.16;
    const mz = half / 2;
    const my = rise - mz * Math.tan(th);
    for (const s of [-1, 1]) {
      piece(g, box(len + ov * 2, t, slope), r.roof, { pos: [0, my + Math.cos(th) * t / 2, s * (mz + Math.sin(th) * t / 2)], rot: [s * th, 0, 0], outline: 0.03, pattern: r.roofSurf });
      for (const e of [-1, 1]) piece(g, box(0.1, 0.24, slope), r.trim, { pos: [e * (len / 2 + ov - 0.02), my - 0.04, s * mz], rot: [s * th, 0, 0], outline: 0.008 });
    }
    piece(g, box(len + ov * 2 + 0.1, 0.16, 0.3), r.trim, { pos: [0, rise + 0.1, 0], outline: 0.012 });
    const gable = G.extrude(G.shape([[-span / 2, 0], [span / 2, 0], [0, rise]]), 0.1, 0.006).rotateY(Math.PI / 2);
    for (const e of [-1, 1]) piece(g, gable.clone(), r.wall, { pos: [e * (len / 2 - 0.05), 0, 0], outline: 0.02, pattern: r.wallSurf });
    return rise + 0.2;
  },

  // Four slopes; a ridge cap where it has a ridge.
  hip(g, r) {
    const { len, span, rise, ov } = r;
    const th = Math.atan2(rise, span / 2);
    const drop = ov * Math.tan(th);
    piece(g, hipGeometry(len + ov * 2, span + ov * 2, rise + drop), r.roof, { pos: [0, -drop, 0], outline: 0.03, pattern: r.roofSurf });
    // A fascia under the eaves all round.
    piece(g, box(len + ov * 2, 0.12, span + ov * 2), r.trim, { pos: [0, -drop - 0.06, 0], outline: 0.01 });
    const ridge = len - span;
    if (ridge > 0.3) piece(g, box(ridge + 0.2, 0.14, 0.24), r.trim, { pos: [0, rise + 0.04, 0], outline: 0.01 });
    return rise + 0.1;
  },

  // One slope, high at the back; the sides and back filled to meet it.
  shed(g, r) {
    const { len, span, rise, ov } = r;
    const th = Math.atan2(rise, span);
    const run = span + ov * 2;
    const slope = run / Math.cos(th);
    const t = 0.16;
    piece(g, box(len + ov * 2, t, slope), r.roof, { pos: [0, rise / 2 + Math.cos(th) * t / 2, Math.sin(th) * t / 2], rot: [th, 0, 0], outline: 0.03, pattern: r.roofSurf });
    const side = G.extrude(G.shape([[-span / 2, 0], [span / 2, 0], [span / 2, rise]]), 0.1, 0.006).rotateY(Math.PI / 2);
    for (const e of [-1, 1]) piece(g, side.clone(), r.wall, { pos: [e * (len / 2 - 0.05), 0, 0], outline: 0.02, pattern: r.wallSurf });
    piece(g, box(len, rise, 0.12), r.wall, { pos: [0, rise / 2, -span / 2 + 0.06], outline: 0.02, pattern: r.wallSurf });
    piece(g, box(len + ov * 2, 0.14, 0.14), r.trim, { pos: [0, -ov * Math.tan(th) + 0.02, span / 2 + ov], outline: 0.008 });
    return rise + 0.2;
  },

  // A flat roof behind a parapet with a coping, and something on it: a water tank, a vent, a
  // rack of panels.
  parapet(g, r, { ph = 0.6, merlons = false } = {}) {
    const { len, span } = r;
    piece(g, box(len - 0.1, 0.16, span - 0.1), r.trim, { pos: [0, 0.08, 0], outline: 0.01 });
    for (const s of [-1, 1]) {
      piece(g, box(len + 0.08, ph, 0.22), r.wall, { pos: [0, ph / 2, s * (span / 2 - 0.07)], outline: 0.02, pattern: r.wallSurf });
      piece(g, box(0.22, ph, span - 0.3), r.wall, { pos: [s * (len / 2 - 0.07), ph / 2, 0], outline: 0.02, pattern: r.wallSurf });
      piece(g, box(len + 0.2, 0.1, 0.32), r.trim, { pos: [0, ph + 0.05, s * (span / 2 - 0.07)], outline: 0.008 });
      piece(g, box(0.32, 0.1, span), r.trim, { pos: [s * (len / 2 - 0.07), ph + 0.05, 0], outline: 0.008 });
    }
    if (merlons) {
      for (const s of [-1, 1]) {
        for (let x = -len / 2 + 0.4; x <= len / 2 - 0.3; x += 0.95) piece(g, box(0.5, 0.45, 0.3), r.wall, { pos: [x, ph + 0.32, s * (span / 2 - 0.07)], outline: 0.01, pattern: r.wallSurf });
        for (let z = -span / 2 + 1.35; z <= span / 2 - 1.2; z += 0.95) piece(g, box(0.3, 0.45, 0.5), r.wall, { pos: [s * (len / 2 - 0.07), ph + 0.32, z], outline: 0.01, pattern: r.wallSurf });
      }
    }
    const k = r.clutter ?? 0;
    if (k === 1 && len > 4) {
      // A water tank on legs.
      const x = len * 0.22;
      for (const [ox, oz] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) piece(g, box(0.1, 0.9, 0.1), r.beam, { pos: [x + ox, 0.6, -span * 0.12 + oz], outline: 0.006 });
      piece(g, G.cyl(0.75, 0.75, 1.1, 10), r.beam, { pos: [x, 1.6, -span * 0.12], outline: 0.015, pattern: 'planks' });
      piece(g, G.cone(0.82, 0.35, 10), r.trim, { pos: [x, 2.33, -span * 0.12], outline: 0.01 });
    } else if (k === 2) {
      // A vent stack.
      piece(g, box(0.9, 0.7, 0.9), r.trim, { pos: [-len * 0.25, 0.5, -span * 0.15], outline: 0.012, pattern: 'panels' });
      piece(g, G.cyl(0.18, 0.18, 0.8, 8), r.trim, { pos: [-len * 0.25, 1.2, -span * 0.15], outline: 0.008 });
    } else if (k === 3 && len > 4) {
      // Panels tilted to the sky.
      for (let i = 0; i < 2; i++) piece(g, box(1.4, 0.06, 0.9), 0x1d2a4a, { pos: [-0.8 + i * 1.6, 0.6, -span * 0.12], rot: [-0.5, 0, 0], outline: 0.008 });
    }
    return ph + (merlons ? 0.55 : 0.1);
  },

  crenel(g, r) { return ROOFS.parapet(g, r, { ph: 0.75, merlons: true }); },

  // Glazed teeth in a row across a flat deck, lit from within.
  sawtooth(g, r) {
    const { len, span } = r;
    piece(g, box(len, 0.16, span), r.trim, { pos: [0, 0.08, 0], outline: 0.012 });
    const n = Math.max(2, Math.round(len / 2.6));
    const tw = len / n;
    const th = 1.1;
    const tooth = G.extrude(G.shape([[-tw / 2, 0], [tw / 2, 0], [tw / 2, th]]), span - 0.2, 0.006);
    for (let i = 0; i < n; i++) {
      const x = -len / 2 + (i + 0.5) * tw;
      piece(g, tooth.clone(), r.roof, { pos: [x, 0.16, 0], outline: 0.02, pattern: r.roofSurf });
      piece(g, box(0.05, th * 0.62, span - 0.6), r.glow, { pos: [x + tw / 2 + 0.03, 0.16 + th * 0.42, 0], glow: true, outline: 0 });
    }
    return th + 0.2;
  },

  // A low parapet with a dome on a drum in the middle, and a finial.
  dome(g, r) {
    ROOFS.parapet(g, r, { ph: 0.35 });
    const R = Math.min(r.len, r.span) * 0.34;
    piece(g, G.cyl(R, R, 0.5, 16), r.wall, { pos: [0, 0.4, 0], outline: 0.02, pattern: r.wallSurf });
    piece(g, G.dome(R, 18, 8), r.roof, { pos: [0, 0.65, 0], outline: 0.03, pattern: r.roofSurf });
    piece(g, G.cyl(0.05, 0.08, 0.7, 6), r.trim, { pos: [0, 0.65 + R + 0.3, 0], outline: 0.006 });
    piece(g, G.sphere(0.12, 8, 6), r.glow, { pos: [0, 0.65 + R + 0.7, 0], glow: true, outline: 0.006 });
    return 0.65 + R + 0.8;
  },

  // A conical cap for round towers and ancient or organic landmarks.
  cone(g, r) {
    const R = Math.min(r.len, r.span) * 0.44;
    const H = R * 1.2;
    piece(g, G.cyl(R, R, 0.16, 16), r.trim, { pos: [0, 0.08, 0], outline: 0.01 });
    piece(g, G.cone(R, H, 16), r.roof, { pos: [0, 0.16 + H / 2, 0], outline: 0.03, pattern: r.roofSurf });
    piece(g, G.cyl(0.06, 0.09, 0.35, 7), r.trim, { pos: [0, H + 0.28, 0], outline: 0.008 });
    return H + 0.46;
  },
};

// How high each form rises over a block `span` across (before its own extras), for planning.
export function roofRise(form, span, pitch) {
  if (form === 'gable' || form === 'hip') return span * pitch;
  if (form === 'shed') return span * pitch * 0.6;
  if (form === 'dome') return span * 0.34 + 1.45;
  if (form === 'cone') return span * 0.53 + 0.46;
  if (form === 'parapet') return 0.7;
  if (form === 'crenel' || form === 'sawtooth') return 1.3;
  return 0;
}
