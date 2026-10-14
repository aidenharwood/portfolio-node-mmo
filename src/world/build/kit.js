// The building kit (docs/GRAPHICS_PLAN.md G2): a building is a seeded plan — its blocks (a plain
// block, or an L or a T with a wing out back), a roof form for each, which way the ridge runs, the
// door, windows in bays round every face that shows, and its extras (chimney, dormers, a balcony,
// a porch, shutters and flower boxes, half-timbering, beam ends, pipes, light strips, quoins) —
// turned into pieces by modules, in a style (world/build/styles.js). The plan's seed comes from the
// building's own numbers and where it stands, so every screen and the server's world build the
// same thing and take the same colliders from it (one rotated box per block, inside the footprint
// the builder gave it, so folk and roads it kept clear stay clear).
import * as THREE from 'three';
import { piece, G } from '../../render/ModelKit.js';
import { mulberry32 } from '../../core/rng.js';
import { C, LAMP, HEARTH } from '../palette.js';
import { KIT_STYLES, wallSurface, roofSurface, SHUTTERS, FLOWERS, DOORS, PLATES, TARPS } from './styles.js';
import { ROOFS, roofRise, box } from './roofs.js';

const BRICK = 0x8a4a3a;

function hashNums(...nums) {
  let h = 2166136261;
  for (const n of nums) {
    h ^= Math.round(n * 100) | 0;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// A half-disc standing up (an arch's top), `depth` thick along z.
const archGeo = (r, depth) => new THREE.CylinderGeometry(r, r, depth, 12, 1, false, -Math.PI / 2, Math.PI).rotateX(-Math.PI / 2);

// draw: false where nothing is drawn (the server's world): a building gives its colliders only.
// doors: a list to note each front door's doorstep in (world x, y, z) for tools/buildcheck.mjs.
export const KIT = { draw: true, doors: null };

// ---------------------------------------------------------------- the plan
/**
 * o: { wd, dp, ht = 3, storeys = 1, wall, roof, trim, flat, style, simple (one block),
 *      doorX, doorW, doorH, chimney, antenna, awning (colour), sign (colour), signX, wallSurf, roofSurf,
 *      barn (great doors under a front gable, a hayloft), porch (true / false; left out, by style) }
 */
export function planBuilding(o, seed) {
  const rnd = mulberry32(seed);
  const pick = (list) => list[Math.floor(rnd() * list.length)];
  const chance = (p) => rnd() < (p ?? 0);
  const styleName = KIT_STYLES[o.style] ? o.style : 'temperate';
  const S = KIT_STYLES[styleName];
  const { wd, dp } = o;
  const ht = o.ht ?? 3;
  const storeys = o.storeys ?? 1;
  const form = o.barn ? 'gable' : o.flat ? pick(S.flatRoofs) : pick(S.roofs);
  const masses = [];
  const shapeRoll = rnd();
  const shape = o.simple || o.barn || wd < 5.4 || dp < 4.4 ? 'rect' : shapeRoll < 0.3 ? 'L' : shapeRoll < 0.42 ? 'T' : 'rect';
  // Gables to the street (the ridge running front to back) on narrow, deep-enough houses — and
  // always on a barn.
  const frontGable = o.barn || ((form === 'gable' || form === 'hip') && wd <= dp * 1.25 && chance(S.frontGable));
  if (shape === 'rect') {
    masses.push({ x: 0, z: 0, wd, dp, storeys, form, ridge: frontGable ? 'z' : 'x', main: true });
  } else {
    const mainDp = dp * (0.56 + rnd() * 0.1);
    const wingW = Math.max(2.6, Math.min(wd * 0.5, wd * (0.36 + rnd() * 0.14)));
    const wingDp = dp - mainDp + 0.5;
    const side = rnd() < 0.5 ? -1 : 1;
    const wingForm = form === 'dome' || form === 'sawtooth' ? 'parapet' : form;
    masses.push({ x: 0, z: dp / 2 - mainDp / 2, wd, dp: mainDp, storeys, form, ridge: 'x', main: true });
    masses.push({
      x: shape === 'T' ? 0 : side * (wd / 2 - wingW / 2), z: -dp / 2 + wingDp / 2, wd: wingW, dp: wingDp,
      storeys: storeys > 1 && chance(0.5) ? storeys - 1 : storeys, form: wingForm, ridge: 'z',
    });
  }
  const ov = S.overhang ?? 0.32;
  for (const m of masses) {
    const span = m.ridge === 'x' ? m.dp : m.wd;
    const len = m.ridge === 'x' ? m.wd : m.dp;
    m.H = ht * m.storeys;
    // A hip over a block narrower along its ridge than across is a pyramid: pitched by the shorter.
    m.rise = roofRise(m.form, Math.min(span, len * 1.2), S.pitch);
  }
  const main = masses[0];
  const doorW = o.barn ? wd * 0.44 : o.doorW ?? 1.1;
  const plan = {
    o, S, styleName, rnd, ht, ov, masses, main,
    wall: o.wall, roof: o.roof, trim: o.trim ?? C.metalDark,
    wallSurf: o.wallSurf ?? wallSurface(o.wall), roofSurf: o.roofSurf ?? roofSurface(o.roof),
    glow: S.strip ?? LAMP,
    door: {
      x: o.barn ? 0 : o.doorX ?? (wd > 4.5 ? -wd * 0.22 : 0), w: doorW, h: o.barn ? ht * 0.68 : o.doorH ?? 2.0,
      arch: !!S.arch && doorW < 2, col: pick(DOORS), barn: !!o.barn,
    },
    shutter: !o.barn && chance(S.shutters) ? pick(SHUTTERS) : null,
    boxes: chance(S.boxes) ? pick(FLOWERS) : null,
    timber: chance(S.timber),
    vigas: chance(S.vigas),
    pipes: chance(S.pipes),
    quoins: !!S.quoins,
    balcony: storeys >= 2 && chance(S.balcony),
    porch: o.porch === undefined ? !o.awning && chance(S.porch) : !!o.porch && !o.barn,
    spikes: chance(S.spikes),
    tarp: pick(TARPS),
    dormers: main.form !== 'shed' && main.ridge === 'x' && main.rise > 1.4 && main.dp >= 4.4 && chance(S.dormers) ? (wd > 7 ? 2 : 1) : 0,
    chimney: o.chimney ? (rnd() < 0.5 ? -1 : 1) : 0,
    clutter: Math.floor(rnd() * 4),
    window: { w: styleName === 'dry' ? 0.75 : 0.9, h: styleName === 'tech' || styleName === 'warden' ? 0.7 : 0.95 },
  };
  // One rotated box per block, from the ground to the top of its roof.
  plan.cols = masses.map((m) => ({ x: m.x, z: m.z, hx: m.wd / 2 + 0.05, hz: m.dp / 2 + 0.05, h: m.H + m.rise + 0.5 }));
  return plan;
}

// ---------------------------------------------------------------- faces
// A block's four faces: where each is, its run along, its outward normal and the turn (ry) that
// faces a piece's +z out of it.
function facesOf(m) {
  return [
    { key: 'front', cx: m.x, cz: m.z + m.dp / 2, len: m.wd, ry: 0 },
    { key: 'back', cx: m.x, cz: m.z - m.dp / 2, len: m.wd, ry: Math.PI },
    { key: 'right', cx: m.x + m.wd / 2, cz: m.z, len: m.dp, ry: Math.PI / 2 },
    { key: 'left', cx: m.x - m.wd / 2, cz: m.z, len: m.dp, ry: -Math.PI / 2 },
  ].map((f) => ({ ...f, tx: Math.cos(f.ry), tz: -Math.sin(f.ry), nx: Math.sin(f.ry), nz: Math.cos(f.ry) }));
}
// A point on a face: `along` it, at height y, `out` from it.
const at = (f, along, y, out) => [f.cx + f.tx * along + f.nx * out, y, f.cz + f.tz * along + f.nz * out];
// Is this spot of a face against another block (so nothing goes on it)?
const hidden = (plan, m, f, along) => {
  const [x, , z] = at(f, along, 0, 0.3);
  return plan.masses.some((o) => o !== m && Math.abs(x - o.x) < o.wd / 2 && Math.abs(z - o.z) < o.dp / 2);
};

// ---------------------------------------------------------------- modules
function windowAt(h, plan, f, along, y, { lit = true, tall = 1, front = false } = {}) {
  const ww = plan.window.w;
  const wh = plan.window.h * tall;
  const rot = [0, f.ry, 0];
  const P = (a, yy, out) => at(f, along + a, yy, out);
  if (plan.S.junk) {
    piece(h, box(ww + 0.16, wh * 0.5 + 0.14, 0.08), C.metalDark, { pos: P(0, y, 0.03), rot, outline: 0.01 });
    piece(h, box(ww * 0.86, wh * 0.4, 0.04), plan.S.light, { pos: P(0, y, 0.07), rot, glow: true, outline: 0 });
    for (const a of [-0.25, 0, 0.25]) piece(h, box(0.04, wh * 0.5, 0.04), C.rust, { pos: P(a * ww, y, 0.1), rot, outline: 0 });
    return;
  }
  piece(h, box(ww + 0.22, wh + 0.2, 0.1), plan.trim, { pos: P(0, y, 0.02), rot, outline: 0.012 });
  piece(h, box(ww * 0.8, wh * 0.8, 0.04), lit ? LAMP : 0x17232d, { pos: P(0, y, 0.08), rot, glow: lit, outline: 0 });
  piece(h, box(0.05, wh * 0.86, 0.04), plan.trim, { pos: P(0, y, 0.11), rot, outline: 0 });
  piece(h, box(ww * 0.88, 0.05, 0.04), plan.trim, { pos: P(0, y + wh * 0.08, 0.11), rot, outline: 0 });
  piece(h, box(ww + 0.36, 0.08, 0.2), plan.trim, { pos: P(0, y - wh / 2 - 0.12, 0.1), rot, outline: 0.006 });
  if (plan.styleName === 'dry') {
    piece(h, archGeo(ww / 2 + 0.11, 0.1), plan.trim, { pos: P(0, y + wh / 2 + 0.1, 0.02), rot, outline: 0.01 });
    piece(h, archGeo(ww * 0.4, 0.04), LAMP, { pos: P(0, y + wh * 0.4, 0.08), rot, glow: true, outline: 0 });
  }
  if (plan.shutter) {
    for (const s of [-1, 1]) piece(h, box(ww * 0.46, wh + 0.12, 0.06), plan.shutter, { pos: P(s * (ww / 2 + ww * 0.23 + 0.14), y, 0.07), rot, outline: 0.008, pattern: 'planks' });
  }
  if (front && plan.boxes) {
    piece(h, box(ww + 0.16, 0.22, 0.24), plan.S.beam, { pos: P(0, y - wh / 2 - 0.3, 0.17), rot, outline: 0.008 });
    piece(h, box(ww, 0.12, 0.18), C.bush, { pos: P(0, y - wh / 2 - 0.13, 0.17), rot, outline: 0.006 });
    for (const a of [-0.3, 0, 0.3]) piece(h, G.ico(0.08, 0), plan.boxes, { pos: P(a * ww, y - wh / 2 - 0.05, 0.2), rot, outline: 0.004 });
  }
}

function door(h, plan) {
  const m = plan.main;
  const f = facesOf(m)[0];
  const { x, w, h: dh, arch, col } = plan.door;
  const rot = [0, 0, 0];
  const z = f.cz;
  if (plan.door.barn) {
    // Two great leaves, banded and braced, and the hayloft's door up in the gable.
    for (const s of [-1, 1]) piece(h, box(0.18, dh + 0.1, 0.18), plan.trim, { pos: [x + s * (w / 2 + 0.09), dh / 2 + 0.15, z + 0.05], outline: 0.01 });
    piece(h, box(w + 0.5, 0.2, 0.2), plan.trim, { pos: [x, dh + 0.25, z + 0.05], outline: 0.01 });
    for (const s of [-1, 1]) {
      const lx = x + s * w / 4;
      piece(h, box(w / 2 - 0.04, dh, 0.1), col, { pos: [lx, dh / 2 + 0.15, z + 0.06], outline: 0.012, pattern: 'planks' });
      for (const t of [0.2, 0.8]) piece(h, box(w / 2 - 0.12, 0.1, 0.04), plan.trim, { pos: [lx, 0.15 + dh * t, z + 0.13], outline: 0.004 });
      const len = Math.hypot(w / 2 - 0.2, dh * 0.6);
      piece(h, box(0.09, len, 0.04), plan.trim, { pos: [lx, 0.15 + dh / 2, z + 0.13], rot: [0, 0, s * Math.atan2(w / 2 - 0.2, dh * 0.6)], outline: 0.004 });
    }
    const m = plan.main;
    piece(h, box(1.1, 1.0, 0.1), plan.trim, { pos: [x, m.H + m.rise * 0.38, z + 0.03], outline: 0.01 });
    piece(h, box(0.9, 0.8, 0.06), col, { pos: [x, m.H + m.rise * 0.38, z + 0.08], outline: 0.008, pattern: 'planks' });
    piece(h, box(0.12, 0.12, 1.0), plan.trim, { pos: [x, m.H + m.rise * 0.38 + 0.75, z + 0.5], outline: 0.006 });
    return;
  }
  if (plan.S.junk) {
    // A dark way in with a tarp half drawn across it.
    piece(h, box(w + 0.2, dh + 0.1, 0.06), 0x14141a, { pos: [x, dh / 2 + 0.1, z + 0.02], outline: 0.008 });
    piece(h, box(w * 0.6, dh * 0.9, 0.04), plan.tarp, { pos: [x - w * 0.22, dh * 0.5 + 0.15, z + 0.08], rot: [0, 0, 0.04], outline: 0.008, pattern: 'fabric' });
    piece(h, box(w + 0.5, 0.12, 0.12), C.rust, { pos: [x, dh + 0.2, z + 0.06], outline: 0.006 });
    return;
  }
  piece(h, box(w + 0.8, 0.18, 0.9), plan.trim, { pos: [x, 0.09, z + 0.38], rot, outline: 0.012 });
  for (const s of [-1, 1]) piece(h, box(0.14, dh, 0.16), plan.trim, { pos: [x + s * (w / 2 + 0.08), dh / 2 + 0.15, z + 0.04], outline: 0.01 });
  piece(h, box(w, dh, 0.1), col, { pos: [x, dh / 2 + 0.15, z + 0.03], outline: 0.012, pattern: 'planks' });
  if (arch) {
    piece(h, archGeo(w / 2 + 0.16, 0.16), plan.trim, { pos: [x, dh + 0.15, z + 0.04], outline: 0.01 });
    piece(h, archGeo(w / 2, 0.1), col, { pos: [x, dh + 0.15, z + 0.05], outline: 0.008 });
  } else {
    piece(h, box(w + 0.32, 0.16, 0.2), plan.trim, { pos: [x, dh + 0.23, z + 0.05], outline: 0.01 });
  }
  piece(h, box(0.06, 0.5, 0.045), C.metal, { pos: [x + w * 0.31, 0.95, z + 0.1], outline: 0.006 });
  piece(h, G.sphere(0.07, 6, 4), HEARTH, { pos: [x + w * 0.31, 1.02, z + 0.13], glow: true, outline: 0 });
  // A lamp beside it.
  const lx = x + (x > 0 ? -1 : 1) * (w / 2 + 0.55);
  if (Math.abs(lx) < m.wd / 2 - 0.3) {
    piece(h, box(0.06, 0.06, 0.3), plan.trim, { pos: [lx, dh + 0.05, z + 0.15], outline: 0.005 });
    piece(h, box(0.18, 0.24, 0.18), LAMP, { pos: [lx, dh - 0.12, z + 0.3], glow: true, outline: 0.006 });
  }
}

// Half-timbering over a face's storey: posts at its ends and between the bays, rails top and
// bottom, braces in from the corners.
function timber(h, plan, f, y0, y1, bays) {
  const rot = [0, f.ry, 0];
  const c = plan.S.beam;
  const half = f.len / 2 - 0.08;
  const posts = [-half, half, ...bays.slice(0, -1).map((b, i) => (b + bays[i + 1]) / 2)];
  for (const p of posts) piece(h, box(0.14, y1 - y0, 0.06), c, { pos: at(f, p, (y0 + y1) / 2, 0.03), rot, outline: 0.005, pattern: 'planks' });
  for (const y of [y0 + 0.07, y1 - 0.07]) piece(h, box(f.len, 0.14, 0.06), c, { pos: at(f, 0, y, 0.035), rot, outline: 0.005, pattern: 'planks' });
  const hgt = y1 - y0 - 0.14;
  const run = Math.min(1.1, hgt * 0.7);
  const ang = Math.atan2(hgt, run);
  const len = Math.hypot(hgt, run);
  for (const s of [-1, 1]) {
    piece(h, box(0.12, len, 0.05), c, { pos: at(f, s * (half - run / 2), (y0 + y1) / 2, 0.04), rot: [0, f.ry, s * (Math.PI / 2 - ang)], outline: 0.004 });
  }
}

function walls(h, plan, m) {
  const { S, ht } = plan;
  const H = m.H;
  piece(h, box(m.wd + 0.3, 0.4, m.dp + 0.3), S.plinth, { pos: [m.x, 0.15, m.z], outline: 0.02, pattern: plan.styleName === 'wet' ? 'planks' : 'blocks' });
  piece(h, box(m.wd, H, m.dp), plan.wall, { pos: [m.x, H / 2 + 0.05, m.z], outline: 0.04, pattern: plan.wallSurf });
  for (let s = 1; s < m.storeys; s++) piece(h, box(m.wd + 0.2, 0.16, m.dp + 0.2), plan.trim, { pos: [m.x, s * ht + 0.05, m.z], outline: 0.012 });
  const flat = m.form === 'parapet' || m.form === 'crenel' || m.form === 'dome' || m.form === 'sawtooth';
  if (plan.quoins) {
    // Dressed stones up the corners, long and short in turn.
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      for (let y = 0.45, k = 0; y < H - 0.1; y += 0.5, k++) {
        const long = k % 2 === 0;
        piece(h, box(long ? 0.62 : 0.34, 0.42, long ? 0.34 : 0.62), C.stone, { pos: [m.x + sx * (m.wd / 2 - (long ? 0.26 : 0.12)), y + 0.21, m.z + sz * (m.dp / 2 - (long ? 0.12 : 0.26))], outline: 0.006, pattern: 'blocks' });
      }
    }
    piece(h, box(m.wd + 0.34, 0.24, m.dp + 0.34), plan.trim, { pos: [m.x, H - 0.05, m.z], outline: 0.012 });
  } else {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      piece(h, box(0.16, H, 0.16), plan.trim, { pos: [m.x + sx * (m.wd / 2 - 0.06), H / 2 + 0.05, m.z + sz * (m.dp / 2 - 0.06)], outline: 0.012 });
    }
    if (flat) piece(h, box(m.wd + 0.24, 0.2, m.dp + 0.24), plan.trim, { pos: [m.x, H, m.z], outline: 0.012 });
  }
  // The faces: windows in bays on every storey of every face that shows, and what the style puts on them.
  const faces = facesOf(m);
  for (const f of faces) {
    if (hidden(plan, m, f, 0) && hidden(plan, m, f, -f.len / 2 + 0.6) && hidden(plan, m, f, f.len / 2 - 0.6)) continue;
    const n = Math.max(1, Math.floor((f.len - 0.6) / 2.2));
    const bays = Array.from({ length: n }, (_, i) => -f.len / 2 + (i + 0.5) * (f.len / n));
    const isFront = m.main && f.key === 'front';
    for (let s = 0; s < m.storeys; s++) {
      const y = s * ht + (s === 0 ? 1.55 : 1.7);
      if (plan.timber && (m.storeys === 1 || s > 0) && !hidden(plan, m, f, 0)) timber(h, plan, f, s * ht + 0.12, (s + 1) * ht - 0.02, bays);
      if (f.key === 'back' && plan.rnd() < 0.45) continue;
      for (const b of bays) {
        if (hidden(plan, m, f, b)) continue;
        if (isFront && s === 0 && Math.abs(b - plan.door.x) < plan.door.w / 2 + 0.8) continue;
        if (isFront && s === 1 && plan.balcony && Math.abs(b - plan.door.x) < 1.4) continue;
        windowAt(h, plan, f, b, y, { front: isFront && s === 0 });
      }
    }
    // Scrap plates welded over the wall, each its own colour, none quite straight.
    if (plan.S.plates && !hidden(plan, m, f, 0)) {
      const n = Math.max(2, Math.round(f.len * 0.9));
      for (let k = 0; k < n; k++) {
        const pw = 0.5 + plan.rnd() * 0.7;
        const ph = 0.4 + plan.rnd() * 0.7;
        const a = (plan.rnd() - 0.5) * (f.len - pw);
        const yy = 0.4 + plan.rnd() * Math.max(0.1, H - ph - 0.3) + ph / 2;
        const col = PLATES[Math.floor(plan.rnd() * PLATES.length)];
        piece(h, box(pw, ph, 0.04), col, { pos: at(f, a, yy, 0.03 + k * 0.002), rot: [0, f.ry, (plan.rnd() - 0.5) * 0.12], outline: 0.006, pattern: col === C.rust || col === 0x6a4a32 ? 'rust' : 'panels' });
      }
    }
    // Beam ends through the wall under the roof (the dry lands).
    if (plan.vigas && flat && f.key !== 'back') {
      for (let a = -f.len / 2 + 0.5; a < f.len / 2 - 0.3; a += 0.8) {
        if (hidden(plan, m, f, a)) continue;
        piece(h, G.cyl(0.08, 0.08, 0.5, 6).rotateX(Math.PI / 2), plan.S.beam, { pos: at(f, a, H - 0.35, 0.2), rot: [0, f.ry, 0], outline: 0.006 });
      }
    }
    // A light strip along the top of the walls.
    if (plan.S.strip && f.key !== 'back' && !hidden(plan, m, f, 0)) {
      piece(h, box(f.len - 0.3, 0.08, 0.05), plan.S.strip, { pos: at(f, 0, H - 0.3, 0.04), rot: [0, f.ry, 0], glow: true, outline: 0 });
    }
  }
  // Pipes down one side.
  if (plan.pipes && m.main) {
    const f = faces[2];
    const a = f.len * 0.25;
    piece(h, G.cyl(0.08, 0.08, H + 0.6, 8), C.metal, { pos: at(f, a, (H + 0.6) / 2 + 0.2, 0.18), outline: 0.006 });
    piece(h, G.cyl(0.06, 0.06, H * 0.8, 8), C.rust, { pos: at(f, a + 0.3, H * 0.4 + 0.2, 0.15), outline: 0.006 });
    for (let y = 0.8; y < H; y += 1.4) piece(h, box(0.5, 0.08, 0.18), C.metalDark, { pos: at(f, a + 0.15, y, 0.1), rot: [0, f.ry, 0], outline: 0.004 });
  }
}

function roof(h, plan, m) {
  const turn = m.ridge === 'z';
  const g = new THREE.Group();
  g.position.set(m.x, m.H + 0.05, m.z);
  g.rotation.y = turn ? Math.PI / 2 : 0;
  h.add(g);
  const r = {
    len: turn ? m.dp : m.wd, span: turn ? m.wd : m.dp, rise: m.rise, ov: plan.ov,
    roof: plan.roof, wall: plan.wall, trim: plan.trim, beam: plan.S.beam,
    roofSurf: plan.roofSurf, wallSurf: plan.wallSurf, glow: plan.glow, clutter: m.main ? plan.clutter : 0,
  };
  return (ROOFS[m.form] ?? ROOFS.gable)(g, r);
}

function extras(h, plan, tops) {
  const { o, main: m } = plan;
  const H = m.H;
  if (plan.chimney && !plan.S.junk) {
    const x = plan.chimney * (m.wd / 2 - 0.75);
    const z = m.z - m.dp * 0.15;
    const top = tops[0] + 0.9;
    const col = plan.styleName === 'temperate' || plan.styleName === 'city' ? BRICK : C.stoneDark;
    piece(h, box(0.62, top + 0.5, 0.62), col, { pos: [x, H + top / 2 - 0.2, z], outline: 0.02, pattern: col === BRICK ? 'brick' : 'blocks' });
    piece(h, box(0.78, 0.14, 0.78), plan.trim, { pos: [x, H + top + 0.1, z], outline: 0.01 });
    piece(h, G.cyl(0.12, 0.12, 0.3, 6), 0x2a2420, { pos: [x + 0.1, H + top + 0.3, z], outline: 0.006 });
  }
  for (let i = 0; i < plan.dormers; i++) {
    // A shed dormer on the front slope, its window lit.
    const x = plan.dormers === 1 ? (plan.door.x > 0 ? -m.wd * 0.18 : m.wd * 0.18) : (i ? 1 : -1) * m.wd * 0.24;
    const th = Math.atan2(m.rise, m.dp / 2);
    const dz = m.dp * 0.22;
    const y = H + m.rise - dz * Math.tan(th);
    const z = m.z + dz;
    piece(h, box(1.3, 1.0, 1.3), plan.wall, { pos: [x, y + 0.15, z], outline: 0.015, pattern: plan.wallSurf });
    piece(h, box(1.55, 0.12, 1.6), plan.roof, { pos: [x, y + 0.72, z + 0.1], rot: [0.16, 0, 0], outline: 0.012, pattern: plan.roofSurf });
    const f = { cx: x, cz: z + 0.65, ry: 0, tx: 1, tz: 0, nx: 0, nz: 1, len: 1.3 };
    piece(h, box(0.8, 0.62, 0.08), plan.trim, { pos: at(f, 0, y + 0.18, 0.02), outline: 0.008 });
    piece(h, box(0.62, 0.46, 0.04), LAMP, { pos: at(f, 0, y + 0.18, 0.07), glow: true, outline: 0 });
  }
  const f = facesOf(m)[0];
  if (plan.spikes && plan.S.junk) {
    for (let a = -m.wd / 2 + 0.3; a <= m.wd / 2 - 0.2; a += 0.55) {
      piece(h, G.cone(0.06, 0.45, 4), C.metal, { pos: [a, H + 0.05, f.cz + plan.ov - 0.05], rot: [0.5, 0, 0], outline: 0.004 });
    }
  }
  if (plan.S.junk && plan.chimney) {
    piece(h, G.cyl(0.12, 0.12, tops[0] + 1.6, 8), C.metal, { pos: [plan.chimney * m.wd * 0.3, H + (tops[0] + 1.6) / 2, m.z - m.dp * 0.25], outline: 0.008 });
    piece(h, G.cyl(0.2, 0.14, 0.2, 8), C.rust, { pos: [plan.chimney * m.wd * 0.3, H + tops[0] + 1.6, m.z - m.dp * 0.25], outline: 0.006 });
  }
  if (plan.balcony) {
    const bw = 2.4;
    const x = plan.door.x;
    const y = plan.ht + 0.1;
    piece(h, box(bw, 0.14, 1.0), plan.trim, { pos: [x, y, f.cz + 0.5], outline: 0.012 });
    for (let a = -bw / 2 + 0.06; a <= bw / 2; a += 0.4) piece(h, box(0.05, 0.85, 0.05), plan.S.beam, { pos: [x + a, y + 0.5, f.cz + 0.96], outline: 0.004 });
    for (const s of [-1, 1]) piece(h, box(0.05, 0.85, 0.9), plan.S.beam, { pos: [x + s * (bw / 2 - 0.03), y + 0.5, f.cz + 0.5], outline: 0.004 });
    piece(h, box(bw, 0.07, 0.1), plan.S.beam, { pos: [x, y + 0.95, f.cz + 0.96], outline: 0.004 });
    for (const s of [-1, 1]) piece(h, box(0.1, 0.1, 1.0), plan.S.beam, { pos: [x + s * (bw / 2 - 0.2), y - 0.12, f.cz + 0.5], rot: [0.5, 0, 0], outline: 0.004 });
    windowAt(h, { ...plan, shutter: null }, f, x, y + 1.15, { tall: 2 });
  }
  if (plan.porch) {
    // A little roof over the door on two posts.
    const pw = plan.door.w + 1.6;
    const x = plan.door.x;
    for (const s of [-1, 1]) piece(h, box(0.14, 2.6, 0.14), plan.S.beam, { pos: [x + s * (pw / 2 - 0.1), 1.3, f.cz + 1.25], outline: 0.008, pattern: 'planks' });
    piece(h, box(pw + 0.3, 0.12, 1.7), plan.roof, { pos: [x, 2.72, f.cz + 0.7], rot: [0.22, 0, 0], outline: 0.015, pattern: plan.roofSurf });
    piece(h, box(pw, 0.12, 0.14), plan.S.beam, { pos: [x, 2.55, f.cz + 1.25], outline: 0.006 });
  }
  if (o.antenna) {
    // On the ridge of a pitched roof; from the deck of a flat one.
    const pitched = m.form === 'gable' || m.form === 'hip' || m.form === 'shed';
    const [ax, az] = !pitched ? [-m.wd * 0.32, m.z - m.dp * 0.25] : m.ridge === 'x' ? [-m.wd * 0.3, m.z] : [m.x, m.z - m.dp * 0.25];
    const base = pitched ? H + tops[0] - (m.form === 'shed' ? m.rise * 0.6 : 0.3) : H + 0.1;
    piece(h, G.cyl(0.04, 0.05, 2.6, 5), C.metal, { pos: [ax, base + 1.3, az], outline: 0.008 });
    piece(h, G.sphere(0.07, 6, 4), 0xff4a3a, { pos: [ax, base + 2.65, az], glow: true, outline: 0 });
  }
  if (o.awning) {
    piece(h, box(m.wd * 0.7, 0.08, 1.5), o.awning, { pos: [0, 2.75, f.cz + 0.7], rot: [0.25, 0, 0], outline: 0.02, pattern: 'fabric' });
    for (const sx of [-1, 1]) piece(h, G.cyl(0.05, 0.05, 2.6, 5), C.metalDark, { pos: [sx * m.wd * 0.33, 1.4, f.cz + 1.35], outline: 0.008 });
  }
  if (o.sign) piece(h, box(Math.min(2.4, m.wd * 0.45), 0.6, 0.08), o.sign, { pos: [o.signX ?? m.wd * 0.2, Math.min(H - 0.5, 3.4), f.cz + 0.06], glow: true, outline: 0.012 });
}

// Builds a plan into group h (front +z). Returns its colliders (local boxes).
export function buildPlan(h, plan) {
  if (!KIT.draw) return plan.cols;
  const tops = [];
  for (const m of plan.masses) {
    walls(h, plan, m);
    tops.push(roof(h, plan, m));
  }
  door(h, plan);
  extras(h, plan, tops);
  return plan.cols;
}

// A building into group h (front +z, standing on the ground at its origin). Returns its
// colliders, local to h: { x, z, hx, hz, h } (see bodyCols).
export function building(h, o) {
  const seed = hashNums(h.position.x, h.position.z, o.wd, o.dp, o.ht ?? 3, o.storeys ?? 1, (o.wall ?? 0) & 0xffff, (o.roof ?? 0) & 0xffff);
  const plan = planBuilding(o, seed);
  if (KIT.doors) {
    h.updateWorldMatrix(true, false);
    const m = plan.main;
    const v = new THREE.Vector3(plan.door.x, 0, m.z + m.dp / 2 + 1.1).applyMatrix4(h.matrixWorld);
    KIT.doors.push({ x: v.x, y: v.y, z: v.z, w: plan.door.w });
  }
  return buildPlan(h, plan);
}

// A building's colliders into the world, for a building standing at world (x, z) turned to ry.
export function bodyCols(w, x, z, ry, cols) {
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  for (const b of cols) w.addOrientedBox(x + c * b.x + s * b.z, z - s * b.x + c * b.z, b.hx, b.hz, ry, b.h);
}
