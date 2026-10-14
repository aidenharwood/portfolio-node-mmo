// Drawing a dungeon (gameplay phase 5): world/Interior.js's rooms, corridors, stairs and lift, from
// the same modelling kit as everything else (render/ModelKit.js), styled by its theme
// (world/dungeons.js THEMES) — a Scav bunker's rusted plate and caged bulbs, Hive tunnels' resin
// and glowing sacs, a Synth facility's white panels and light strips, a Maker vault's runes, a
// Wild cavern's rock and crystals. Walls are drawn from the very boxes that collide. What moves or
// changes (doors, the lift, the things to use, traps) is kept apart in groups of its own for
// world/DungeonView.js to animate; everything else is baked into a handful of meshes.
import * as THREE from 'three';
import { piece, bakeTree, flatten, G, shade } from '../render/ModelKit.js';
import { mulberry32 } from '../core/rng.js';
import { THEMES } from './dungeons.js';

const TAU = Math.PI * 2;
const GOLD = 0xf0c674;
// What each theme's walls, floors and trim are drawn as (render/Surfaces.js).
const SURFACES = {
  scav: { wall: 'concrete', wallDark: 'concrete', floor: 'concrete', floorEdge: 'panels', trim: 'rust', ceiling: 'concrete', metal: 'panels' },
  hive: { wall: 'resin', wallDark: 'resin', floor: 'resin', floorEdge: 'resin', trim: 'resin', ceiling: 'resin' },
  synth: { wall: 'panels', wallDark: 'panels', floor: 'panels', floorEdge: 'panels', ceiling: 'panels', metal: 'panels' },
  maker: { wall: 'carved', wallDark: 'carved', floor: 'blocks', floorEdge: 'blocks', trim: 'carved', ceiling: 'carved' },
  fauna: { wall: 'rock', wallDark: 'rock', floor: 'rock', floorEdge: 'rock', ceiling: 'rock' },
};
// The same, by colour, for a bake.
const surfacesOf = (theme) => {
  const T = THEMES[theme];
  return Object.fromEntries(Object.entries(SURFACES[theme] ?? {}).map(([k, kind]) => [T[k], kind]));
};
const VOID = 0x07080c;

// A group at local (x, y, z), turned to `ry`.
function group(parent, x, y, z, ry = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = ry;
  parent.add(g);
  return g;
}

// ---------------------------------------------------------------- fixtures and clutter, per theme
// A light on a wall (or hanging, in a corridor): what glows in the dark down there.
const FIXTURES = {
  scav(g, T, hang) {
    if (hang) piece(g, G.cyl(0.03, 0.03, 0.8, 4), T.metal, { pos: [0, 0.4, 0], outline: 0 });
    piece(g, G.box(0.36, 0.4, 0.3), T.metal, { pos: [0, 0, hang ? 0 : 0.1], outline: 0.015 });
    piece(g, G.sphere(0.16, 8, 6), T.glow, { pos: [0, -0.12, hang ? 0 : 0.22], glow: true, outline: 0 });
  },
  hive(g, T) {
    for (let k = 0; k < 3; k++) piece(g, G.sphere(0.14 + k * 0.04, 8, 6), k === 1 ? T.glow : shade(T.glow, 0.8), { pos: [(k - 1) * 0.22, Math.sin(k * 2) * 0.12, 0.15], glow: true, outline: 0.01 });
    piece(g, G.dodeca(0.32), T.wallDark, { pos: [0, 0, 0], scale: [1.3, 0.8, 0.6], outline: 0.015 });
  },
  synth(g, T, hang) {
    piece(g, G.box(hang ? 1.6 : 0.22, hang ? 0.08 : 1.4, hang ? 0.3 : 0.08), T.glow, { pos: [0, 0, hang ? 0 : 0.06], glow: true, outline: 0 });
    piece(g, G.box(hang ? 1.75 : 0.34, hang ? 0.12 : 1.55, hang ? 0.4 : 0.06), T.trim, { pos: [0, hang ? 0.06 : 0, 0], outline: 0.012 });
  },
  maker(g, T) {
    piece(g, G.box(0.7, 0.9, 0.12), T.wallDark, { pos: [0, 0, 0.04], outline: 0.015 });
    piece(g, G.octa(0.2), T.glow, { pos: [0, 0, 0.14], scale: [1, 1.5, 0.4], glow: true, outline: 0 });
    piece(g, G.box(0.5, 0.05, 0.03), T.accent, { pos: [0, -0.32, 0.12], glow: true, outline: 0 });
  },
  fauna(g, T) {
    for (let k = 0; k < 3; k++) piece(g, G.octa(0.16 + k * 0.05), k === 1 ? T.glow : shade(T.glow, 0.85), { pos: [(k - 1) * 0.18, k * 0.08, 0.12], rot: [0.3 * k, k, 0.4 - 0.3 * k], scale: [0.7, 2, 0.7], glow: true, outline: 0.01 });
  },
};

// Clutter along the walls: four kinds per theme.
const PROPS = {
  scav: [
    (g, T) => { piece(g, G.box(1.2, 1, 1), T.trim, { pos: [0, 0.5, 0], outline: 0.025 }); piece(g, G.box(1.24, 0.12, 1.04), T.metal, { pos: [0, 0.75, 0], outline: 0.01 }); },
    (g, T) => { for (const x of [-0.45, 0.45]) piece(g, G.cyl(0.4, 0.4, 1.1, 10), x < 0 ? 0x8a3a2a : T.metal, { pos: [x, 0.55, 0], outline: 0.02 }); },
    (g, T) => { for (let k = 0; k < 3; k++) piece(g, G.cyl(0.18, 0.18, 2.4, 8), T.metal, { pos: [-0.4 + k * 0.4, 0.18 + (k % 2) * 0.3, 0], rot: [0, 0, Math.PI / 2], outline: 0.012 }); },
    (g, T) => { piece(g, G.dodeca(0.8), T.wallDark, { pos: [0, 0.35, 0], scale: [1.4, 0.6, 1], outline: 0.02 }); piece(g, G.box(0.6, 0.1, 0.4), T.accent, { pos: [0.2, 0.62, 0.1], rot: [0.3, 0.4, 0], glow: true, outline: 0 }); },
  ],
  hive: [
    (g, T) => { for (let k = 0; k < 4; k++) piece(g, G.sphere(0.32, 10, 8), 0xd8c8c0, { pos: [Math.sin(k * 1.7) * 0.4, 0.3 + (k > 2 ? 0.3 : 0), Math.cos(k * 1.7) * 0.3], scale: [1, 1.3, 1], outline: 0.012 }); },
    (g, T) => { piece(g, G.dodeca(0.9), T.wall, { pos: [0, 0.3, 0], scale: [1.3, 0.7, 1.1], outline: 0.02 }); piece(g, G.sphere(0.2, 8, 6), T.glow, { pos: [0.3, 0.75, 0.2], glow: true, outline: 0 }); },
    (g, T) => { for (let k = 0; k < 3; k++) piece(g, G.cone(0.22, 2.2 - k * 0.4, 6), 0x2a2232, { pos: [(k - 1) * 0.5, 1 - k * 0.2, 0], rot: [0.15 * (k - 1), 0, 0.2 * (1 - k)], outline: 0.015 }); },
    (g, T) => { piece(g, G.torus(0.6, 0.2, TAU, 6, 12), T.trim, { pos: [0, 0.2, 0], rot: [Math.PI / 2, 0, 0], outline: 0.015 }); piece(g, G.sphere(0.35, 10, 8), 0xd8c8c0, { pos: [0, 0.35, 0], outline: 0.012 }); },
  ],
  synth: [
    (g, T) => { piece(g, G.box(1, 2.4, 0.8), T.trim, { pos: [0, 1.2, 0], outline: 0.025 }); for (let k = 0; k < 4; k++) piece(g, G.box(0.8, 0.05, 0.02), k % 2 ? T.accent : 0x9aff9a, { pos: [0, 0.5 + k * 0.45, 0.41], glow: true, outline: 0 }); },
    (g, T) => { piece(g, G.box(1.3, 1, 0.7), T.wallDark, { pos: [0, 0.5, 0], outline: 0.02 }); piece(g, G.box(1.1, 0.5, 0.05), T.glow, { pos: [0, 0.95, 0.2], rot: [-0.5, 0, 0], glow: true, outline: 0 }); },
    (g, T) => { piece(g, G.cyl(0.5, 0.5, 0.7, 12), T.metal, { pos: [0, 0.35, 0], rot: [Math.PI / 2, 0, 0], outline: 0.02 }); piece(g, G.torus(0.5, 0.06, TAU, 4, 14), T.accent, { pos: [0, 0.35, 0.36], glow: true, outline: 0 }); },
    (g, T) => { piece(g, G.box(1.1, 0.9, 1.1), T.wall, { pos: [0, 0.45, 0], outline: 0.02 }); piece(g, G.box(1.14, 0.1, 1.14), T.accent, { pos: [0, 0.6, 0], glow: true, outline: 0 }); },
  ],
  maker: [
    (g, T) => { piece(g, G.box(0.8, 3.2, 0.6), T.wallDark, { pos: [0, 1.6, 0], rot: [0, 0, 0.08], outline: 0.025 }); piece(g, G.box(0.08, 2.4, 0.02), T.glow, { pos: [0, 1.7, 0.31], glow: true, outline: 0 }); },
    (g, T) => { piece(g, G.cyl(0.45, 0.55, 2.2, 8), T.wall, { pos: [0, 1.1, 0], outline: 0.025 }); piece(g, G.torus(0.47, 0.05, TAU, 4, 16), T.accent, { pos: [0, 1.6, 0], rot: [Math.PI / 2, 0, 0], glow: true, outline: 0 }); },
    (g, T) => { piece(g, G.box(1.2, 0.7, 1.2), T.trim, { pos: [0, 0.35, 0], rot: [0, 0.6, 0], outline: 0.02 }); piece(g, G.octa(0.3), T.glow, { pos: [0, 0.95, 0], glow: true, outline: 0.01 }); },
    (g, T) => { piece(g, G.dodeca(0.7), T.wallDark, { pos: [0, 0.3, 0], scale: [1.4, 0.55, 1], outline: 0.02 }); piece(g, G.box(1, 0.04, 0.04), T.accent, { pos: [0, 0.5, 0.3], rot: [0, 0.3, 0.2], glow: true, outline: 0 }); },
  ],
  fauna: [
    (g, T) => { piece(g, G.dodeca(1.0), T.wall, { pos: [0, 0.4, 0], scale: [1.3, 0.8, 1.1], rot: [0.3, 1, 0.2], outline: 0.025 }); },
    (g, T) => { for (let k = 0; k < 4; k++) piece(g, G.octa(0.22 + k * 0.05), k % 2 ? T.glow : shade(T.glow, 0.8), { pos: [Math.sin(k * 1.9) * 0.4, 0.4 + k * 0.1, Math.cos(k * 1.9) * 0.3], rot: [0.3 * k, k, 0.4], scale: [0.7, 2.2, 0.7], glow: true, outline: 0.01 }); },
    (g) => { for (let k = 0; k < 4; k++) piece(g, G.cyl(0.07, 0.05, 1.2, 6), 0xeee3c8, { pos: [Math.sin(k) * 0.5, 0.06, Math.cos(k * 2) * 0.4], rot: [Math.PI / 2, k * 0.8, 0], outline: 0.01 }); piece(g, G.sphere(0.25, 8, 6), 0xeee3c8, { pos: [0.1, 0.2, 0], scale: [1, 0.8, 1.2], outline: 0.01 }); },
    (g, T) => { piece(g, G.cyl(0.1, 0.14, 0.9, 6), 0xe6dccb, { pos: [0, 0.45, 0], outline: 0.012 }); piece(g, G.dome(0.5, 10, 6), T.glow, { pos: [0, 0.9, 0], glow: true, outline: 0.012 }); },
  ],
};

// ---------------------------------------------------------------- the dungeon
export function buildInterior(it) {
  const L = it.layout;
  const T = THEMES[L.theme];
  const rnd = mulberry32((L.shuffle ^ 0x1d0c) >>> 0);
  const cell = L.cell;
  const root = new THREE.Group();
  root.position.set(it.origin.x, it.origin.y, it.origin.z);
  root.name = `dungeon:${it.id}`;
  const shell = group(root, 0, 0, 0);   // floors, walls, fixtures, clutter
  const lid = group(root, 0, 0, 0);     // ceilings (they throw no shadows)
  const organic = !!T.organic;

  // Floors: a slab per room with a darker inlay, and corridors — flat, a flight of stairs, or a
  // lift corridor's top and bottom.
  for (const r of L.rooms) {
    const w = r.w * cell;
    const h = r.h * cell;
    const cx = (r.x + r.w / 2) * cell;
    const cz = (r.z + r.h / 2) * cell;
    piece(shell, G.box(w, 1, h), T.floorEdge, { pos: [cx, r.floor - 0.5, cz], outline: 0 });
    if (w > 6 && h > 6) piece(shell, G.box(w - 3.2, 0.06, h - 3.2), T.floor, { pos: [cx, r.floor + 0.01, cz], outline: 0 });
    if (r.kind === 'boss' || r.kind === 'mini' || r.kind === 'arena') {
      piece(shell, G.cyl(Math.min(w, h) * 0.22, Math.min(w, h) * 0.22, 0.05, 32), T.trim, { pos: [cx, r.floor + 0.04, cz], outline: 0 });
      piece(shell, G.torus(Math.min(w, h) * 0.22, 0.07, TAU, 4, 40), T.accent, { pos: [cx, r.floor + 0.07, cz], rot: [Math.PI / 2, 0, 0], glow: true, outline: 0 });
    }
    // Ceiling, with drips or pipes.
    piece(lid, G.box(w + 0.6, 0.6, h + 0.6), T.ceiling, { pos: [cx, r.floor + r.ceil + 0.3, cz], outline: 0 });
    const n = Math.round((w * h) / 60);
    for (let k = 0; k < n; k++) {
      const x = (r.x + 0.7 + rnd() * (r.w - 1.4)) * cell;
      const z = (r.z + 0.7 + rnd() * (r.h - 1.4)) * cell;
      if (organic) piece(lid, G.cone(0.25 + rnd() * 0.25, 0.8 + rnd() * 1.4, 5), T.wallDark, { pos: [x, r.floor + r.ceil - 0.5, z], rot: [Math.PI, 0, 0], outline: 0.015 });
      else piece(lid, G.box(0.25, 0.25, 4 + rnd() * 6), T.metal, { pos: [x, r.floor + r.ceil - 0.3, z], rot: [0, rnd() < 0.5 ? 0 : Math.PI / 2, 0], outline: 0.012 });
    }
  }
  for (const c of L.cors) {
    const along = c.axis === 'x';
    const len = (along ? c.w : c.h) * cell;
    const wid = (along ? c.h : c.w) * cell;
    const cx = (c.x + c.w / 2) * cell;
    const cz = (c.z + c.h / 2) * cell;
    const lo = Math.min(c.fa, c.fb);
    piece(lid, G.box(along ? len : wid + 0.6, 0.6, along ? wid + 0.6 : len), T.ceiling, { pos: [cx, c.ceilY + 0.3, cz], outline: 0 });
    if (c.shaft) {
      // The top of a lift corridor stands on a block down to the bottom; the shaft between.
      const s = c.shaft;
      const topLen = Math.abs((c.dir > 0 ? s.u0 : s.u1) - c.u0);
      const botLen = Math.abs(c.u1 - (c.dir > 0 ? s.u1 : s.u0));
      const mid = (a, b) => (a + b) / 2;
      const topMid = mid(c.u0, c.dir > 0 ? s.u0 : s.u1);
      const botMid = mid(c.u1, c.dir > 0 ? s.u1 : s.u0);
      const across = (along ? c.z : c.x) * cell + wid / 2;
      const put = (u, l, y, hgt, color) => piece(shell, G.box(along ? l : wid, hgt, along ? wid : l), color, { pos: [along ? u : across, y, along ? across : u], outline: 0.02 });
      put(topMid, topLen, (c.fa + lo) / 2 - 0.5, c.fa - lo + 1, T.wallDark);
      put(topMid, topLen - 0.2, c.fa + 0.02, 0.05, T.floor);
      put(botMid, botLen, lo - 0.5, 1, T.floorEdge);
      put(mid(s.u0, s.u1), s.u1 - s.u0, lo - 1.2, 0.4, VOID);
      // Rails at the shaft's corners, and a light over it.
      for (const a of [s.u0 + 0.2, s.u1 - 0.2]) {
        for (const b of [across - wid / 2 + 0.2, across + wid / 2 - 0.2]) {
          piece(shell, G.box(0.18, c.fa - lo + 4.2, 0.18), T.metal, { pos: [along ? a : b, (c.fa + lo + 4.2) / 2 - 0.2, along ? b : a], outline: 0.015 });
        }
      }
      piece(shell, G.box(along ? s.u1 - s.u0 : 0.3, 0.3, along ? 0.3 : s.u1 - s.u0), T.accent, { pos: [along ? mid(s.u0, s.u1) : across, c.fa + 4.6, along ? across : mid(s.u0, s.u1)], glow: true, outline: 0 });
      continue;
    }
    if (Math.abs(c.fa - c.fb) < 0.05) {
      piece(shell, G.box(along ? len : wid, 1, along ? wid : len), T.floorEdge, { pos: [cx, c.fa - 0.5, cz], outline: 0 });
      continue;
    }
    // Stairs: steps of about 0.35 m from room A's floor to room B's.
    const steps = Math.max(2, Math.ceil(Math.abs(c.fb - c.fa) / 0.35));
    for (let k = 0; k < steps; k++) {
      const t0 = k / steps;
      const t1 = (k + 1) / steps;
      const u = c.u0 + (c.u1 - c.u0) * ((t0 + t1) / 2);
      const top = c.fa + (c.fb - c.fa) * ((t0 + t1) / 2);
      const sl = len / steps;
      const across = (along ? c.z : c.x) * cell + wid / 2;
      piece(shell, G.box(along ? sl + 0.02 : wid, top - lo + 1, along ? wid : sl + 0.02), k % 2 ? T.floorEdge : T.floor, { pos: [along ? u : across, (top + lo - 1) / 2, along ? across : u], outline: 0.012 });
    }
  }

  // Walls: drawn from the boxes that collide, with a skirting and a trim (lumps of rock or resin
  // where it's organic).
  const x0 = it.x0;
  const z0 = it.z0;
  const y0 = it.origin.y;
  for (const c of it.colliders) {
    const cx = c.x - x0;
    const cz = c.z - z0;
    const cy = c.y - y0;
    piece(shell, G.box(c.hx * 2, c.h, c.hz * 2), T.wall, { pos: [cx, cy + c.h / 2, cz], outline: 0.03 });
    if (c.h < 2) continue; // (a lintel)
    const long = Math.max(c.hx, c.hz) * 2;
    const alongX = c.hx > c.hz;
    if (organic) {
      const n = Math.max(1, Math.round(long / 3));
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n - 0.5;
        const s = 0.9 + rnd() * 0.9;
        piece(shell, G.dodeca(s), rnd() < 0.5 ? T.wall : T.wallDark, {
          pos: [cx + (alongX ? t * long : 0), cy + 1 + rnd() * (c.h - 2), cz + (alongX ? 0 : t * long)],
          rot: [rnd() * 3, rnd() * 3, rnd() * 3], scale: [alongX ? 1.4 : 0.5, 1.2, alongX ? 0.5 : 1.4], outline: 0.02,
        });
      }
    } else {
      // Pilasters every few metres along a long wall (steel beams, panel seams, carved piers), and
      // a darker band low down.
      const n = Math.floor(long / 4.2);
      for (let k = 1; k <= n; k++) {
        const t = k / (n + 1) - 0.5;
        piece(shell, G.box(alongX ? 0.45 : c.hx * 2 + 0.3, c.h, alongX ? c.hz * 2 + 0.3 : 0.45), T.trim, { pos: [cx + (alongX ? t * long : 0), cy + c.h / 2, cz + (alongX ? 0 : t * long)], outline: 0.015 });
      }
      piece(shell, G.box(c.hx * 2 + 0.06, 1.1, c.hz * 2 + 0.06), T.wallDark, { pos: [cx, cy + 0.55 + 1, cz], outline: 0.012 });
      piece(shell, G.box(c.hx * 2 + 0.08, 0.5, c.hz * 2 + 0.08), T.wallDark, { pos: [cx, cy + 1.25, cz], outline: 0.012 });
      piece(shell, G.box(c.hx * 2 + 0.1, 0.18, c.hz * 2 + 0.1), T.trim, { pos: [cx, cy + c.h - 1.2, cz], outline: 0.012 });
      if (L.theme === 'synth' || L.theme === 'maker') piece(shell, G.box(c.hx * 2 + 0.12, 0.06, c.hz * 2 + 0.12), T.accent, { pos: [cx, cy + 3.1, cz], glow: true, outline: 0 });
    }
  }

  // Pillars in the arenas.
  for (const p of L.pillars ?? []) {
    const r = L.rooms[p.room];
    piece(shell, G.cyl(p.r, p.r * 1.15, r.ceil, organic ? 7 : 10), T.wallDark, { pos: [p.x, r.floor + r.ceil / 2, p.z], outline: 0.03 });
    piece(shell, G.box(p.r * 2.6, 0.4, p.r * 2.6), T.trim, { pos: [p.x, r.floor + 0.2, p.z], outline: 0.02 });
    piece(shell, G.torus(p.r * 1.02, 0.05, TAU, 4, 16), T.accent, { pos: [p.x, r.floor + 2.6, p.z], rot: [Math.PI / 2, 0, 0], glow: true, outline: 0 });
  }

  // Light fixtures and clutter.
  for (const l of L.lights) {
    const g = group(shell, l.x, l.y, l.z, l.facing ?? 0);
    FIXTURES[L.theme](g, T, !!l.hang);
  }
  for (const p of L.props) {
    const g = group(shell, p.x, p.floor, p.z, (p.facing ?? 0) + (rnd() - 0.5) * 0.5);
    g.scale.setScalar(p.s);
    PROPS[L.theme][p.k](g, T);
  }

  // Door frames everywhere a corridor comes into a room; doors that close.
  const doors = new Map();
  for (const d of L.doors) {
    const mid = (d.s0 + d.s1) / 2;
    const span = d.s1 - d.s0;
    const ry = d.axis === 'x' ? Math.PI / 2 : 0; // the frame's local x runs along the opening
    const fx = d.axis === 'x' ? d.line : mid;
    const fz = d.axis === 'x' ? mid : d.line;
    const frame = group(shell, fx, d.floor, fz, ry);
    for (const s of [-1, 1]) piece(frame, G.box(0.55, 4.6, 0.9), T.trim, { pos: [s * (span / 2 + 0.2), 2.3, 0], outline: 0.025 });
    piece(frame, G.box(span + 1, 0.55, 0.9), T.trim, { pos: [0, 4.55, 0], outline: 0.025 });
    if (d.kind === 'open') continue;
    const g = group(root, fx, d.floor, fz, ry);
    // (A raid arena's gate: bars of ember light, shut while its fight is on.)
    const color = d.kind === 'seal' ? T.accent : d.kind === 'gate' ? 0xff7a3a : d.kind === 'locked' ? 0xffb030 : 0x5ee6ff;
    const halves = [];
    for (const s of [-1, 1]) {
      const h = group(g, s * span / 4, 0, 0);
      if (d.kind === 'seal' || d.kind === 'gate') {
        for (let k = 0; k < 3; k++) piece(h, G.box(0.16, 4.2, 0.16), color, { pos: [(k - 1) * 0.6, 2.1, 0], glow: true, outline: 0.01 });
        piece(h, G.box(span / 2 - 0.05, 0.2, 0.3), T.wallDark, { pos: [0, 0.1, 0], outline: 0.012 });
        piece(h, G.box(span / 2 - 0.05, 0.2, 0.3), T.wallDark, { pos: [0, 4.2, 0], outline: 0.012 });
      } else {
        piece(h, G.box(span / 2 - 0.04, 4.3, 0.3), T.wallDark, { pos: [0, 2.15, 0], outline: 0.02 });
        piece(h, G.box(span / 2 - 0.3, 0.12, 0.32), color, { pos: [0, 2.4, 0], glow: true, outline: 0 });
        for (const y of [0.9, 3.6]) piece(h, G.box(span / 2 - 0.2, 0.18, 0.34), T.metal, { pos: [0, y, 0], outline: 0.01 });
      }
      halves.push({ g: h, s });
    }
    // The lock: an amber light (locked), the power it needs (one cell per node), or the seal's eye.
    const sign = group(g, 0, 4.95, 0.3);
    if (d.kind === 'power') for (let k = 0; k < Math.max(1, d.needs); k++) piece(sign, G.box(0.3, 0.2, 0.06), 0x3a1a1a, { pos: [(k - (d.needs - 1) / 2) * 0.45, 0, 0], outline: 0.008 });
    else piece(sign, G.octa(0.22), color, { scale: [1, 1.3, 0.4], glow: true, outline: 0.01 });
    doors.set(d.id, { group: g, halves, span, sign, d, t: 0, open: false });
  }

  // The lift's platform.
  let lift = null;
  if (it.lift) {
    const c = it.lift.cor;
    const along = c.axis === 'x';
    const wid = (along ? c.h : c.w) * cell;
    const s = c.shaft;
    const across = (along ? c.z : c.x) * cell + wid / 2;
    const u = (s.u0 + s.u1) / 2;
    const g = group(root, along ? u : across, it.lift.y, along ? across : u);
    piece(g, G.box(along ? s.u1 - s.u0 - 0.1 : wid - 0.1, 0.4, along ? wid - 0.1 : s.u1 - s.u0 - 0.1), T.metal, { pos: [0, -0.2, 0], outline: 0.02 });
    piece(g, G.box(along ? s.u1 - s.u0 - 0.4 : wid - 0.4, 0.04, along ? wid - 0.4 : s.u1 - s.u0 - 0.4), 0xd9a227, { pos: [0, 0.01, 0], outline: 0 });
    for (const a of [-1, 1]) piece(g, G.box(along ? 0.1 : wid - 0.2, 1.1, along ? wid - 0.2 : 0.1), T.trim, { pos: [along ? a * ((s.u1 - s.u0) / 2 - 0.1) : 0, 0.55, along ? 0 : a * ((s.u1 - s.u0) / 2 - 0.1)], outline: 0.012 });
    piece(g, G.box(0.3, 0.9, 0.3), T.trim, { pos: [0, 0.45, 0], outline: 0.015 });
    piece(g, G.box(0.2, 0.12, 0.2), T.accent, { pos: [0, 0.95, 0], glow: true, outline: 0 });
    lift = { group: g };
  }

  // The things to use: the way out, the key, power nodes, treasure, the reward chest and the way out
  // past the boss.
  const things = new Map();
  for (const t of L.things) {
    const g = group(root, t.x, t.floor, t.z, t.facing ?? 0);
    const parts = { on: group(g, 0, 0, 0), off: group(g, 0, 0, 0), spin: null, lid: null };
    if (t.kind === 'portal' || t.kind === 'exit') {
      for (const s of [-1, 1]) piece(g, G.box(0.5, 4.2, 0.5), T.trim, { pos: [s * 1.6, 2.1, 0], outline: 0.025 });
      piece(g, G.box(3.9, 0.5, 0.6), T.trim, { pos: [0, 4.3, 0], outline: 0.025 });
      parts.spin = group(g, 0, 2.1, 0);
      piece(parts.spin, G.torus(1.25, 0.09, TAU, 4, 28), T.accent, { glow: true, outline: 0 });
      piece(parts.spin, G.torus(0.8, 0.06, TAU * 0.7, 4, 20), T.glow, { glow: true, outline: 0 });
      piece(g, G.cyl(1.2, 1.2, 0.04, 28), shade(T.fog, 2.2), { pos: [0, 2.1, -0.02], rot: [Math.PI / 2, 0, 0], glow: true, outline: 0 });
    } else if (t.kind === 'key') {
      piece(g, G.cyl(0.55, 0.7, 1.1, 8), T.trim, { pos: [0, 0.55, 0], outline: 0.025 });
      parts.spin = group(parts.off, 0, 1.75, 0);
      piece(parts.spin, G.octa(0.3), 0xffb030, { scale: [0.6, 1.4, 0.25], glow: true, outline: 0.012 });
      piece(parts.spin, G.torus(0.42, 0.04, TAU, 4, 18), GOLD, { glow: true, outline: 0 });
    } else if (t.kind === 'node') {
      piece(g, G.box(1.4, 1.2, 1), T.wallDark, { pos: [0, 0.6, 0], outline: 0.025 });
      piece(g, G.box(1.2, 0.5, 0.06), T.metal, { pos: [0, 0.9, 0.52], rot: [-0.3, 0, 0], outline: 0.01 });
      piece(g, G.cyl(0.18, 0.18, 1.6, 8), T.metal, { pos: [0, 2, 0], outline: 0.015 });
      piece(parts.off, G.sphere(0.32, 10, 8), 0x7a1a1a, { pos: [0, 2.9, 0], outline: 0.012 });
      piece(parts.on, G.sphere(0.36, 10, 8), T.accent, { pos: [0, 2.9, 0], glow: true, outline: 0.012 });
      piece(parts.on, G.box(1.0, 0.35, 0.05), T.glow, { pos: [0, 0.92, 0.55], rot: [-0.3, 0, 0], glow: true, outline: 0 });
    } else if (t.kind === 'chest' || t.kind === 'reward') {
      const big = t.kind === 'reward' ? 1.35 : 1;
      const trim = t.kind === 'reward' ? GOLD : T.accent;
      piece(g, G.box(1.4 * big, 0.8 * big, 0.9 * big), t.kind === 'reward' ? 0x5a3622 : T.trim, { pos: [0, 0.4 * big, 0], outline: 0.025 });
      piece(g, G.box(1.44 * big, 0.12, 0.94 * big), trim, { pos: [0, 0.62 * big, 0], glow: t.kind !== 'reward', outline: 0.01 });
      parts.lid = group(g, 0, 0.8 * big, -0.45 * big);
      piece(parts.lid, G.box(1.44 * big, 0.3 * big, 0.94 * big), t.kind === 'reward' ? 0x6a4228 : T.trim, { pos: [0, 0.15 * big, 0.45 * big], outline: 0.02 });
      piece(parts.lid, G.box(0.3, 0.3, 0.06), trim, { pos: [0, 0.05, 0.94 * big], glow: true, outline: 0.008 });
      if (t.kind === 'reward') {
        parts.spin = group(parts.on, 0, 2.6, 0);
        piece(parts.spin, G.octa(0.3), GOLD, { glow: true, outline: 0.01 });
      }
    }
    for (const sub of [parts.on, parts.off]) if (!sub.children.length) g.remove(sub);
    things.set(t.id, { group: g, parts, t });
  }

  // Traps: vents (a grate and the plume that bursts from it), turrets (a head that tracks you), and
  // spore pods.
  const traps = new Map();
  for (const x of L.traps) {
    const g = group(root, x.x, x.floor, x.z, x.facing ?? 0);
    const part = {};
    if (x.kind === 'vent') {
      piece(g, G.box(1.8, 0.14, 1.8), T.metal, { pos: [0, 0.05, 0], outline: 0.012 });
      for (let k = -2; k <= 2; k++) piece(g, G.box(0.12, 0.16, 1.6), VOID, { pos: [k * 0.32, 0.06, 0], outline: 0 });
      part.glow = group(g, 0, 0, 0);
      piece(part.glow, G.box(1.5, 0.05, 1.5), T.accent, { pos: [0, 0.02, 0], glow: true, outline: 0 });
      part.plume = group(g, 0, 0, 0);
      piece(part.plume, G.cyl(0.75, 0.25, 3.4, 10, 1, true), organic ? 0xb6f04a : T.light, { pos: [0, 1.7, 0], glow: true, outline: 0 });
      part.plume.visible = false;
    } else if (x.kind === 'turret') {
      piece(g, G.cyl(0.55, 0.7, 1.1, 10), T.wallDark, { pos: [0, 0.55, 0], outline: 0.025 });
      part.head = group(g, 0, 1.45, 0);
      piece(part.head, G.box(0.9, 0.55, 0.8), T.metal, { outline: 0.02 });
      for (const s of [-1, 1]) piece(part.head, G.cylZ(0.08, 0.08, 1.1, 8), T.wallDark, { pos: [s * 0.2, 0, 0.75], outline: 0.012 });
      piece(part.head, G.box(0.3, 0.12, 0.06), 0xff3a2a, { pos: [0, 0.1, 0.42], glow: true, outline: 0 });
    } else {
      part.sac = group(g, 0, 0, 0);
      piece(part.sac, G.sphere(0.6, 12, 10), organic && L.theme === 'hive' ? 0x7a4a8a : 0x6a7a4a, { pos: [0, 0.55, 0], scale: [1, 1.2, 1], outline: 0.02 });
      piece(part.sac, G.sphere(0.32, 10, 8), L.theme === 'hive' ? T.glow : 0xb6f04a, { pos: [0, 0.75, 0.32], glow: true, outline: 0 });
      for (let k = 0; k < 5; k++) piece(part.sac, G.cone(0.08, 0.5, 5), 0x2a2232, { pos: [Math.sin(k * 1.26) * 0.45, 0.25, Math.cos(k * 1.26) * 0.45], rot: [Math.cos(k * 1.26) * 0.6, 0, -Math.sin(k * 1.26) * 0.6], outline: 0.01 });
    }
    traps.set(x.id, { group: g, part, x });
  }

  // Everything that never moves merges by colour: a whole dungeon in a few dozen draw calls.
  flatten(shell);
  flatten(lid);
  bakeTree(root, { surfaces: surfacesOf(L.theme) });
  // Ceilings light nothing from above and must not darken the rooms with their shadows.
  lid.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  shell.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return { root, doors, things, traps, lift };
}
