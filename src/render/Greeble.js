// Surface detail kit for the Borderlands-style look: rivets, panel lines, vent rows, cables,
// brand stripes and per-manufacturer emblems. Everything is emitted as bakeable pieces, so the
// extra detail costs no extra draw calls once a model is baked.
import * as THREE from 'three';
import { piece, G, shade } from './ModelKit.js';

const DARK = 0x1e1e24;

// Small domed rivet heads. points: [[x, y, z], ...]; axis: which way the heads face.
export function rivets(g, color, points, { r = 0.011, axis = 'x' } = {}) {
  const rot = axis === 'x' ? [0, 0, Math.PI / 2] : axis === 'z' ? [Math.PI / 2, 0, 0] : [0, 0, 0];
  for (const p of points) piece(g, G.cyl(r, r * 1.15, r * 0.8, 6), color, { pos: p, rot, outline: 0 });
}

// Thin recessed seam. size: [w, h, d].
export function panelLine(g, pos, size, rot = [0, 0, 0]) {
  piece(g, G.box(...size), DARK, { pos, rot, outline: 0 });
}

// A row of slots along `dir` (unit [x,y,z]) starting at `pos`.
export function vents(g, pos, dir, { count = 4, spacing = 0.03, size = [0.006, 0.03, 0.014] } = {}) {
  for (let i = 0; i < count; i++) {
    piece(g, G.box(...size), DARK, { pos: [pos[0] + dir[0] * spacing * i, pos[1] + dir[1] * spacing * i, pos[2] + dir[2] * spacing * i], outline: 0 });
  }
}

export function cable(g, points, color, r = 0.008) {
  piece(g, G.tube(points, r, Math.max(8, points.length * 6), 5), color, { outline: 0.005 });
}

// Two-tone brand stripe (manufacturer secondary + accent pinstripe).
export function brandStripe(g, c, pos, size, rot = [0, 0, 0]) {
  piece(g, G.box(...size), c.pal.secondary, { pos, rot, outline: 0 });
  piece(g, G.box(size[0] * 1.02, size[1] * 0.2, size[2] * 1.02), c.accent, { pos, rot, glow: true, outline: 0 });
}

// ---------------------------------------------------------------- manufacturer emblems
// Built facing +Z in a unit box around the origin; `place` positions/orients them on a surface.
const EMBLEMS = {
  ironhide: (t, c) => {
    piece(t, G.box(0.9, 0.35, 0.2), c.pal.metal, { pos: [0, 0.25, 0] });
    piece(t, G.box(0.5, 0.45, 0.2), c.pal.metal, { pos: [0, -0.15, 0] });
    piece(t, G.box(0.25, 0.12, 0.22), c.accent, { pos: [0, 0.25, 0.02], glow: true });
  },
  vesper: (t, c) => {
    piece(t, G.octa(0.5), c.accent, { scale: [0.7, 1, 0.25], glow: true });
    piece(t, G.torus(0.55, 0.06, Math.PI * 2, 4, 16), c.pal.metal, {});
  },
  emberfall: (t, c) => {
    piece(t, G.cone(0.35, 0.9, 6), c.accent, { pos: [0, 0.05, 0], scale: [1, 1, 0.3], glow: true });
    piece(t, G.cone(0.2, 0.5, 6), c.pal.metal, { pos: [0.3, -0.15, 0], scale: [1, 1, 0.3] });
  },
  kessler: (t, c) => {
    for (const s of [-1, 1]) piece(t, G.box(0.18, 0.75, 0.2), c.accent, { pos: [0.22 * s, 0, 0], rot: [0, 0, 0.6 * s], glow: true });
    piece(t, G.box(0.9, 0.12, 0.2), c.pal.metal, { pos: [0, -0.4, 0] });
  },
  rattlecap: (t, c) => {
    piece(t, G.torus(0.35, 0.12, Math.PI * 2, 5, 14), 0xd9a227, {});
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      piece(t, G.box(0.16, 0.16, 0.2), 0xd9a227, { pos: [Math.cos(a) * 0.5, Math.sin(a) * 0.5, 0], rot: [0, 0, a] });
    }
    piece(t, G.sphere(0.14, 8, 6), c.accent, { glow: true });
  },
  voltaic: (t, c) => {
    for (const [x, y, r] of [[0.1, 0.32, -0.5], [-0.05, 0, 0.6], [0.1, -0.32, -0.5]]) piece(t, G.box(0.14, 0.42, 0.2), c.accent, { pos: [x, y, 0], rot: [0, 0, r], glow: true });
  },
  aether: (t, c) => {
    piece(t, G.octa(0.55), c.accent, { scale: [0.35, 1, 0.2], glow: true });
    piece(t, G.octa(0.55), c.accent, { scale: [1, 0.35, 0.2], glow: true });
    piece(t, G.torus(0.3, 0.05, Math.PI * 2, 4, 14), c.pal.metal, {});
  },
  hollow: (t, c) => {
    piece(t, G.sphere(0.45, 12, 8), 0xe8e4f0, { scale: [1.3, 0.55, 0.3] });
    piece(t, G.sphere(0.2, 8, 6), c.accent, { pos: [0, 0, 0.08], scale: [1, 1, 0.4], glow: true });
  },
  rime: (t, c) => {
    for (const a of [0, Math.PI / 3, -Math.PI / 3]) piece(t, G.box(0.1, 1.0, 0.2), c.accent, { rot: [0, 0, a], glow: true });
    piece(t, G.octa(0.16), c.pal.metal, {});
  },
};

/**
 * Stamp the manufacturer's emblem onto `g`.
 * pos: surface point; yaw: rotation about Y so the emblem faces outward; size: emblem width.
 */
export function emblem(g, c, pos, { yaw = 0, pitch = 0, size = 0.06 } = {}) {
  const build = EMBLEMS[c.mfr];
  if (!build) return;
  const t = new THREE.Group();
  t.position.fromArray(pos);
  t.rotation.set(pitch, yaw, 0, 'YXZ');
  t.scale.setScalar(size);
  piece(t, G.cylZ(0.75, 0.75, 0.12, 16), shade(c.pal.primary, 0.6), { pos: [0, 0, -0.08] });
  build(t, c);
  t.updateMatrix();
  for (const child of [...t.children]) {
    child.updateMatrix();
    child.matrix.premultiply(t.matrix);
    child.matrix.decompose(child.position, child.quaternion, child.scale);
    child.userData.piece.outline = Math.min(child.userData.piece.outline, 0.006);
    g.add(child);
  }
}
