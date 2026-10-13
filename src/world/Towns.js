// Hamlets, towns, the story cities and Brightwater: the buildings round the folk and services
// world/places.js placed, built by world/World.js as each place streams in. A town, a city's heart
// or one of its districts is built in one group that is flattened and baked by colour — a handful
// of draw calls however many buildings. Buildings keep off the roads, walls open into gates where
// the roads come through, and every solid part gets a collider, so the server's headless world
// (which builds the same places) collides with the same shapes.
import * as THREE from 'three';
import { piece, flatten, G, shade } from '../render/ModelKit.js';
import { C, HEARTH, FORGE, LAMP, CARGO, RUNE } from './palette.js';
import { TOWN, CITY, HUB_RING, SIZES } from './places.js';

const TAU = Math.PI * 2;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const polar = (a, d) => [Math.sin(a) * d, Math.cos(a) * d];
const WARDEN = 0x3a6a4a; // the Wardens' green
const DOOR = 0x3a2a20;
const CLOTH = [0xc0583a, 0xd9a227, 0x3a7ab0, 0x5a8a4a, 0x9a4a7a];

// Building colours by climate: plaster and red roofs in green country, sandstone and flat roofs in
// the dry lands, timber and thatch in the wet, steel against the cold and in the strange lands.
const STYLES = {
  temperate: { walls: [C.hab, 0xe8dcc0, 0xd8c8a8], roofs: [0x9a3a2a, 0x4a5560], trim: C.metalDark, flat: 0.15, wall: C.stone },
  dry: { walls: [C.sandstone, 0xe0cfa8, 0xd8b890], roofs: [0xb08a5a, 0xb0583a], trim: C.woodDark, flat: 0.8, wall: shade(C.sandstone, 0.9) },
  wet: { walls: [C.wood, 0x8a6a48, 0xa08a68], roofs: [C.thatch, 0x7a6a40], trim: C.woodDark, flat: 0, wall: C.woodDark },
  cold: { walls: [C.steel, 0x8a7a68, C.hab], roofs: [C.metalDark, 0x3a4450], trim: C.metal, flat: 0.1, wall: C.stoneDark },
  tech: { walls: [C.steel, C.hab, 0x9aa4b4], roofs: [C.metalDark, 0x3a3f4a], trim: C.metalDark, flat: 0.6, wall: C.steel },
};
const STYLE_OF = {
  meadow: 'temperate', forest: 'temperate', highland: 'temperate', jungle: 'wet', fungal: 'wet', marsh: 'wet',
  snow: 'cold', mountain: 'cold', desert: 'dry', badlands: 'dry', ash: 'tech', crystal: 'tech',
};
const styleAt = (w, x, z) => STYLES[STYLE_OF[w.gen.biomeAt(x, z)] ?? 'temperate'];

const segDist = (x, z, [ax, az, bx, bz]) => {
  const dx = bx - ax;
  const dz = bz - az;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(ax + dx * t - x, az + dz * t - z);
};

// ---------------------------------------------------------------- frames
// A place's builder: one group at its centre, unturned (angles are world bearings), with ground
// heights relative to it, colliders, and the roads within `reach` (to keep buildings off them).
function site(w, p, reach) {
  const g = new THREE.Group();
  const y0 = w.groundHeight(p.x, p.z);
  g.position.set(p.x, y0, p.z);
  const lines = [];
  for (const r of w.gen.regionsNear(p.x, p.z, [])) {
    for (const pts of r.roads) {
      for (let i = 1; i < pts.length; i++) {
        const [ax, az] = pts[i - 1];
        const [bx, bz] = pts[i];
        if (Math.min(Math.hypot(ax - p.x, az - p.z), Math.hypot(bx - p.x, bz - p.z)) < reach + 14) lines.push([ax, az, bx, bz]);
      }
    }
  }
  return {
    w, p, g, y0, rnd: w.rnd, lines,
    at: (a, d) => [p.x + Math.sin(a) * d, p.z + Math.cos(a) * d],
    gy: (x, z) => w.groundHeight(x, z) - y0,
    // A sub-group standing on the ground at a world point, its front (+z) facing bearing `ry`.
    put(x, z, ry = 0, lift = 0) {
      const h = new THREE.Group();
      h.position.set(x - p.x, w.groundHeight(x, z) - y0 + lift, z - p.z);
      h.rotation.y = ry;
      g.add(h);
      return h;
    },
    col: (x, z, r, h, base = null) => w.addCollider(x, z, r, h, base === null ? w.groundHeight(x, z) : y0 + base),
    // Is a round footprint at (x, z) clear of the roads?
    clear: (x, z, r) => lines.every((s) => segDist(x, z, s) > r + 1.8),
  };
}

// A hamlet's builder: turned to the place's `rot` (local +z faces the road in), local positions.
function hframe(w, p) {
  const g = w.anchor(p.x, p.z, p.rot);
  const y0 = g.position.y;
  const toW = (lx, lz) => [p.x + Math.cos(p.rot) * lx + Math.sin(p.rot) * lz, p.z - Math.sin(p.rot) * lx + Math.cos(p.rot) * lz];
  const gy = (lx, lz) => { const [x, z] = toW(lx, lz); return w.groundHeight(x, z) - y0; };
  return {
    w, p, g, rnd: w.rnd, toW, gy,
    put(lx, lz, ry = 0, lift = 0) {
      const h = new THREE.Group();
      h.position.set(lx, gy(lx, lz) + lift, lz);
      h.rotation.y = ry;
      g.add(h);
      return h;
    },
    col: (lx, lz, r, h) => { const [x, z] = toW(lx, lz); w.addCollider(x, z, r, h); },
    colBox: (lx, lz, hx, hz, ry, h) => { const [x, z] = toW(lx, lz); w.addOrientedBox(x, z, hx, hz, p.rot + ry, h); },
  };
}

// Colliders over a building's footprint (world point, facing ry): circles as wide as its short
// side, in a row along its long one — so none stands out past its faces.
function bodyCol(w, x, z, ry, wd, dp, ht) {
  w.addOrientedBox(x, z, wd / 2, dp / 2, ry, ht);
}

// ---------------------------------------------------------------- kit
// A building, local to group h with its front on +z: walls on a plinth, a pitched roof (gables
// filled) or a flat one, a door, lit windows on every storey, and whatever extras it's given — a
// chimney, an antenna, an awning over the door, a glowing sign.
function building(h, o) {
  const { wd, dp, ht = 3, storeys = 1, wall, roof, trim = C.metalDark, flat = false } = o;
  const H = ht * storeys;
  const variation = o.variant === undefined
    ? Math.abs(Math.floor((wd * 13 + dp * 7 + ht * 3 + storeys * 11 + (wall & 255)) * 10)) % 4
    : Math.abs(Math.floor(o.variant * 4)) % 4;
  piece(h, G.box(wd + 0.3, 0.4, dp + 0.3), trim, { pos: [0, 0.15, 0], outline: 0.02 });
  piece(h, G.box(wd, H, dp), wall, { pos: [0, H / 2 + 0.05, 0], outline: 0.04 });
  for (let s = 1; s < storeys; s++) piece(h, G.box(wd + 0.2, 0.16, dp + 0.2), trim, { pos: [0, s * ht + 0.05, 0], outline: 0.012 });
  for (const x of [-1, 1]) for (const z of [-1, 1]) {
    piece(h, G.box(0.14, H, 0.14), trim, { pos: [x * (wd / 2 - 0.1), H / 2 + 0.05, z * (dp / 2 - 0.1)], outline: 0.012 });
  }
  if (flat) {
    piece(h, G.box(wd + 0.3, 0.25, dp + 0.3), trim, { pos: [0, H + 0.15, 0], outline: 0.025 });
    piece(h, G.box(wd * 0.4, 0.9, dp * 0.4), roof, { pos: [-wd * 0.15, H + 0.7, -dp * 0.1], outline: 0.025 });
    for (const s of [-1, 1]) {
      piece(h, G.box(wd + 0.2, 0.38, 0.16), trim, { pos: [0, H + 0.43, s * (dp / 2 - 0.08)], outline: 0.012 });
      piece(h, G.box(0.16, 0.38, dp - 0.16), trim, { pos: [s * (wd / 2 - 0.08), H + 0.43, 0], outline: 0.012 });
    }
  } else {
    const rise = dp * 0.36;
    for (const s of [-1, 1]) piece(h, G.box(wd + 0.6, 0.18, dp * 0.62), roof, { pos: [0, H + dp * 0.18, s * dp * 0.26], rot: [s * 0.6, 0, 0], outline: 0.03 });
    const roofRows = Math.max(2, Math.floor(dp / 2.2));
    for (const s of [-1, 1]) for (let row = 1; row <= roofRows; row++) {
      const t = row / (roofRows + 1);
      piece(h, G.box(wd + 0.2, 0.07, 0.12), trim, { pos: [0, H + rise * (1 - t) + 0.08, s * dp * t * 0.5], rot: [s * 0.6, 0, 0], outline: 0.008 });
    }
    piece(h, G.box(wd + 0.65, 0.22, 0.3), trim, { pos: [0, H + rise, 0], outline: 0.02 });
    const gable = G.extrude(G.shape([[-wd / 2, 0], [wd / 2, 0], [0, rise]]), 0.12, 0.008);
    for (const s of [-1, 1]) piece(h, gable.clone(), wall, { pos: [0, H, s * (dp / 2 - 0.04)], outline: 0.03 });
    for (const s of [-1, 1]) piece(h, G.box(wd + 0.5, 0.18, 0.16), trim, { pos: [0, H + 0.06, s * dp * 0.52], outline: 0.015 });
  }
  const doorX = o.doorX ?? (wd > 4.5 ? -wd * 0.22 : 0);
  const doorW = o.doorW ?? 1.1;
  const doorH = o.doorH ?? 2.0;
  piece(h, G.box(doorW + 0.7, 0.18, 0.82), trim, { pos: [doorX, 0.09, dp / 2 + 0.34], outline: 0.012 });
  for (const side of [-1, 1]) piece(h, G.box(0.12, doorH, 0.16), trim, { pos: [doorX + side * (doorW / 2 + 0.08), doorH / 2 + 0.15, dp / 2 + 0.04], outline: 0.01 });
  piece(h, G.box(doorW + 0.28, 0.14, 0.18), trim, { pos: [doorX, doorH + 0.22, dp / 2 + 0.04], outline: 0.01 });
  piece(h, G.box(doorW, doorH, 0.1), DOOR, { pos: [doorX, doorH / 2 + 0.15, dp / 2 + 0.03], outline: 0.012 });
  piece(h, G.box(0.06, 0.58, 0.045), C.metal, { pos: [doorX + doorW * 0.31, 0.92, dp / 2 + 0.095], outline: 0.008 });
  piece(h, G.sphere(0.07, 6, 4), HEARTH, { pos: [doorX + doorW * 0.31, 0.98, dp / 2 + 0.13], glow: true, outline: 0 });
  for (let s = 0; s < storeys; s++) {
    const y = s * ht + 1.9;
    const windowW = variation === 2 ? 0.72 : 0.9;
    const windowH = variation === 1 ? 1.05 : 0.8;
    for (let x = -wd / 2 + 1.1; x <= wd / 2 - 0.9; x += 2.2) {
      if (!s && Math.abs(x + 0.2 - doorX) < doorW / 2 + 0.75) continue;
      const wx = x + 0.2;
      piece(h, G.box(windowW + 0.22, windowH + 0.2, 0.1), trim, { pos: [wx, y, dp / 2 + 0.02], outline: 0.012 });
      piece(h, G.box(windowW, windowH, 0.05), 0x17232d, { pos: [wx, y, dp / 2 + 0.09], outline: 0 });
      piece(h, G.box(windowW * 0.78, windowH * 0.76, 0.035), LAMP, { pos: [wx, y, dp / 2 + 0.125], glow: true, outline: 0 });
      piece(h, G.box(0.055, windowH * 0.9, 0.035), trim, { pos: [wx, y, dp / 2 + 0.15], outline: 0 });
      piece(h, G.box(windowW * 0.94, 0.055, 0.035), trim, { pos: [wx, y, dp / 2 + 0.15], outline: 0 });
      if (variation === 2) for (const side of [-1, 1]) piece(h, G.box(0.16, windowH + 0.16, 0.12), roof, { pos: [wx + side * (windowW / 2 + 0.12), y, dp / 2 + 0.08], outline: 0.008 });
    }
    for (const sx of [-1, 1]) {
      const wx = sx * (wd / 2 + 0.02);
      piece(h, G.box(0.1, windowH + 0.2, 1.02), trim, { pos: [wx, y, 0], outline: 0.01 });
      piece(h, G.box(0.05, windowH, 0.82), 0x17232d, { pos: [wx + sx * 0.07, y, 0], outline: 0 });
      piece(h, G.box(0.035, windowH * 0.76, 0.64), LAMP, { pos: [wx + sx * 0.105, y, 0], glow: true, outline: 0 });
      piece(h, G.box(0.035, windowH * 0.9, 0.055), trim, { pos: [wx + sx * 0.13, y, 0], outline: 0 });
      piece(h, G.box(0.035, 0.055, 0.76), trim, { pos: [wx + sx * 0.13, y, 0], outline: 0 });
    }
  }
  if (variation === 0) {
    piece(h, G.box(wd * 0.58, 0.12, 0.14), trim, { pos: [0, H * 0.62, dp / 2 + 0.07], outline: 0.008 });
    for (const x of [-1, 1]) piece(h, G.box(0.12, H * 0.62, 0.14), trim, { pos: [x * (wd * 0.29), H * 0.31, dp / 2 + 0.07], outline: 0.008 });
  } else if (variation === 1 && !flat) {
    piece(h, G.cyl(0.32, 0.32, 0.1, 8).rotateX(Math.PI / 2), C.metalDark, { pos: [0, H + dp * 0.17, dp / 2 + 0.09], outline: 0.012 });
    piece(h, G.cyl(0.18, 0.18, 0.12, 8).rotateX(Math.PI / 2), LAMP, { pos: [0, H + dp * 0.17, dp / 2 + 0.16], glow: true, outline: 0 });
  } else if (variation === 3) {
    for (const side of [-1, 1]) {
      piece(h, G.box(0.24, H * 0.58, 0.18), trim, { pos: [side * (wd / 2 - 0.36), H * 0.3, dp / 2 + 0.08], outline: 0.01 });
      piece(h, G.box(0.58, 0.18, 0.18), trim, { pos: [side * (wd / 2 - 0.36), H * 0.62, dp / 2 + 0.08], outline: 0.01 });
    }
  }
  if (o.chimney) piece(h, G.box(0.6, 2.2, 0.6), trim, { pos: [wd * 0.3, H + 1.1, -dp * 0.2], outline: 0.02 });
  if (o.antenna) {
    piece(h, G.cyl(0.04, 0.05, 2.4, 5), C.metal, { pos: [-wd * 0.32, H + 1.6, -dp * 0.25], outline: 0.008 });
    piece(h, G.sphere(0.07, 6, 4), 0xff4a3a, { pos: [-wd * 0.32, H + 2.85, -dp * 0.25], glow: true, outline: 0 });
  }
  if (o.awning) {
    piece(h, G.box(wd * 0.7, 0.08, 1.5), o.awning, { pos: [0, 2.75, dp / 2 + 0.7], rot: [0.25, 0, 0], outline: 0.02 });
    for (const sx of [-1, 1]) piece(h, G.cyl(0.05, 0.05, 2.6, 5), C.metalDark, { pos: [sx * wd * 0.33, 1.4, dp / 2 + 1.35], outline: 0.008 });
  }
  if (o.sign) piece(h, G.box(Math.min(2.4, wd * 0.45), 0.6, 0.08), o.sign, { pos: [o.signX ?? wd * 0.2, Math.min(H - 0.5, 3.4), dp / 2 + 0.06], glow: true, outline: 0.012 });
  return h;
}

// A sub-group of h offset by (x, y, z) and turned by ry: for building a part off-centre.
function sub(h, x, y, z, ry = 0) {
  const s = new THREE.Group();
  s.position.set(x, y, z);
  s.rotation.y = ry;
  h.add(s);
  return s;
}

function lamp(f, x, z, tall = 3) {
  const y = f.gy(x, z);
  const [lx, lz] = [x - f.p.x, z - f.p.z];
  piece(f.g, G.cyl(0.07, 0.1, tall, 6), C.metalDark, { pos: [lx, y + tall / 2, lz], outline: 0.01 });
  piece(f.g, G.box(0.34, 0.34, 0.34), LAMP, { pos: [lx, y + tall + 0.1, lz], glow: true, outline: 0.012 });
  piece(f.g, G.cone(0.32, 0.3, 4), C.metalDark, { pos: [lx, y + tall + 0.42, lz], rot: [0, Math.PI / 4, 0], outline: 0.01 });
  f.col(x, z, 0.15, tall);
}

// A market stall (local to h, front +z): counter, posts, an awning, and its goods — weapons
// racked, armour on a stand, or a bit of everything.
function stall(h, cloth, goods = 'all') {
  piece(h, G.box(2.8, 1.0, 1.0), C.woodDark, { pos: [0, 0.5, 0], outline: 0.03 });
  for (const x of [-1.35, 1.35]) piece(h, G.box(0.1, 2.6, 0.1), C.metal, { pos: [x, 1.3, -0.45], outline: 0.012 });
  piece(h, G.box(3.1, 0.08, 1.8), cloth, { pos: [0, 2.6, 0.15], rot: [0.2, 0, 0], outline: 0.015 });
  if (goods === 'weapons') {
    piece(h, G.box(2.4, 0.08, 0.12), C.woodDark, { pos: [0, 2.1, -0.45], outline: 0.008 });
    for (let i = 0; i < 4; i++) piece(h, G.box(0.08, 1.3, 0.14), C.metalDark, { pos: [-0.95 + i * 0.62, 1.6, -0.38], rot: [0.12, 0, 0.12], outline: 0.01 });
    piece(h, G.box(0.55, 0.12, 0.24), C.metal, { pos: [0.6, 1.07, 0.1], rot: [0, 0.4, 0], outline: 0.01 });
  } else if (goods === 'armor') {
    piece(h, G.cyl(0.05, 0.05, 1.4, 5), C.metalDark, { pos: [-0.8, 1.7, -0.35], outline: 0.008 });
    piece(h, G.box(0.62, 0.7, 0.32), C.steel, { pos: [-0.8, 1.95, -0.35], outline: 0.015 });
    piece(h, G.sphere(0.2, 8, 6), C.steel, { pos: [-0.8, 2.5, -0.35], outline: 0.012 });
    piece(h, G.box(0.55, 0.35, 0.42), C.hide, { pos: [0.55, 1.17, 0.05], outline: 0.012 });
  } else {
    piece(h, G.box(0.3, 0.3, 0.3), CARGO[0], { pos: [-0.7, 1.15, 0], outline: 0.012 });
    piece(h, G.cyl(0.12, 0.12, 0.4, 8), HEARTH, { pos: [0.6, 1.2, 0], glow: true, outline: 0.012 });
  }
}

// A quest board (local to h, front +z): a roofed board on two posts with notices pinned to it.
function questBoard(h) {
  for (const x of [-0.95, 0.95]) piece(h, G.box(0.14, 2.6, 0.14), C.woodDark, { pos: [x, 1.3, 0], outline: 0.012 });
  piece(h, G.box(2.0, 1.3, 0.1), C.wood, { pos: [0, 1.55, 0], outline: 0.02 });
  piece(h, G.box(2.3, 0.08, 0.6), C.woodDark, { pos: [0, 2.62, 0.05], rot: [0.25, 0, 0], outline: 0.012 });
  [[-0.6, 1.8], [-0.1, 1.95], [0.5, 1.75], [-0.45, 1.25], [0.2, 1.35], [0.65, 1.2]].forEach(([x, y], i) => {
    piece(h, G.box(0.36, 0.42, 0.02), i % 3 ? 0xf0e6cc : 0xe8c870, { pos: [x, y, 0.07], rot: [0, 0, i % 2 ? 0.08 : -0.06], outline: 0.004 });
  });
  piece(h, G.box(0.16, 0.2, 0.16), LAMP, { pos: [1.05, 2.35, 0.2], glow: true, outline: 0.008 });
}

// The war table where a city's raids are planned: a round table under a holographic map.
function warTable(h) {
  piece(h, G.cyl(1.3, 1.1, 0.9, 16), C.metalDark, { pos: [0, 0.45, 0], outline: 0.025 });
  piece(h, G.cyl(1.38, 1.38, 0.12, 16), C.steel, { pos: [0, 0.96, 0], outline: 0.015 });
  piece(h, G.cyl(1.1, 1.1, 0.04, 20), RUNE, { pos: [0, 1.3, 0], glow: true, outline: 0 });
  for (const [x, z, c] of [[0.4, -0.2, FORGE], [-0.5, 0.3, 0xff4a3a], [0.1, 0.6, FORGE], [-0.2, -0.6, 0xc46aff]]) {
    piece(h, G.octa(0.12), c, { pos: [x, 1.55, z], scale: [1, 1.6, 1], glow: true, outline: 0.008 });
  }
  for (let i = 0; i < 4; i++) {
    const [x, z] = polar((i / 4) * TAU + 0.4, 1.9);
    piece(h, G.box(0.18, 1.6, 0.18), C.metalDark, { pos: [x, 0.8, z], outline: 0.01 });
    piece(h, G.box(0.22, 0.12, 0.22), RUNE, { pos: [x, 1.66, z], glow: true, outline: 0 });
  }
}

// A sealed gate in a city's gate yard: a great arch, runes up its pillars and a seal across the
// way — violet for the road down to the dungeons, ember for the raids.
function sealedGate(h, kind) {
  const seal = kind === 'raid' ? 0xff7a3a : 0x9a6aff;
  for (const s of [-1, 1]) {
    piece(h, G.box(1.6, 8.5, 1.8), C.stoneDark, { pos: [s * 3.9, 4.25, 0], outline: 0.04 });
    piece(h, G.box(2.1, 0.7, 2.3), C.stone, { pos: [s * 3.9, 0.35, 0], outline: 0.02 });
    for (let k = 0; k < 4; k++) piece(h, G.box(0.5, 0.12, 0.06), seal, { pos: [s * 3.9, 2 + k * 1.6, 0.93], glow: true, outline: 0 });
  }
  piece(h, G.box(9.6, 1.5, 2.0), C.stone, { pos: [0, 9.2, 0], outline: 0.04 });
  piece(h, G.box(10.4, 0.4, 2.4), C.stoneDark, { pos: [0, 10.1, 0], outline: 0.025 });
  piece(h, G.octa(0.6), seal, { pos: [0, 9.2, 1.05], scale: [1, 1.3, 0.4], glow: true, outline: 0.015 });
  piece(h, G.box(6.2, 8.1, 0.14), shade(seal, 0.35), { pos: [0, 4.25, 0], outline: 0.01 });
  for (let k = 0; k < 5; k++) piece(h, G.box(5.6 - (k % 2) * 1.2, 0.1, 0.18), seal, { pos: [0, 1.2 + k * 1.55, 0], glow: true, outline: 0 });
  piece(h, G.box(7.6, 0.3, 3.0), C.stone, { pos: [0, 0.15, 0.7], outline: 0.02 });
}

// A town's waygate (gameplay phase 5): a Warden arch on the plaza, sealed in violet light — the
// way down into the dungeons for a private run.
function waygate(h) {
  const seal = 0x9a6aff;
  for (const s of [-1, 1]) {
    piece(h, G.box(0.8, 4.4, 0.9), C.stoneDark, { pos: [s * 1.75, 2.2, 0], outline: 0.03 });
    piece(h, G.box(1.1, 0.45, 1.2), C.stone, { pos: [s * 1.75, 0.22, 0], outline: 0.02 });
    for (let k = 0; k < 3; k++) piece(h, G.box(0.3, 0.1, 0.05), seal, { pos: [s * 1.75, 1.2 + k * 1.1, 0.47], glow: true, outline: 0 });
  }
  piece(h, G.box(4.6, 0.8, 1.1), C.stone, { pos: [0, 4.7, 0], outline: 0.03 });
  piece(h, G.octa(0.36), seal, { pos: [0, 4.7, 0.6], scale: [1, 1.3, 0.4], glow: true, outline: 0.012 });
  piece(h, G.box(2.7, 4.2, 0.1), shade(seal, 0.35), { pos: [0, 2.1, 0], outline: 0.008 });
  for (let k = 0; k < 4; k++) piece(h, G.box(2.4 - (k % 2) * 0.6, 0.07, 0.14), seal, { pos: [0, 0.7 + k * 1, 0], glow: true, outline: 0 });
}

// Bearings where the roads cross a circle of radius R round the place (merged when close).
function crossings(f, R) {
  const out = [];
  for (const [ax, az, bx, bz] of f.lines) {
    const da = Math.hypot(ax - f.p.x, az - f.p.z) - R;
    const db = Math.hypot(bx - f.p.x, bz - f.p.z) - R;
    if (da * db > 0 || da === db) continue;
    const t = da / (da - db);
    const a = Math.atan2(ax + (bx - ax) * t - f.p.x, az + (bz - az) * t - f.p.z);
    if (!out.some((g) => Math.abs(wrap(g - a)) < 0.15)) out.push(a);
  }
  return out;
}

// A wall round the place at radius R: panels on a footing with a glowing band, a tower every so
// often, and a gate — two towers and a beam over the road — wherever a road comes through.
function ringWall(f, R, { ht = 3.2, thick = 0.8, gate = 4.8, tower = 1.8, every = 9, color = C.stone, cap = C.stoneDark, band = HEARTH, roof = C.metalDark }) {
  const gates = crossings(f, R);
  const half = (gate / 2 + tower / 2) / R;
  const n = Math.max(12, Math.round((TAU * R) / 3.4));
  const step = TAU / n;
  const len = 2 * R * Math.sin(step / 2) + 0.12;
  const towerAt = (a, big) => {
    const [x, z] = f.at(a, R);
    const y = f.gy(x, z);
    const T = tower * (big ? 1.2 : 1);
    const th = ht + (big ? 2.4 : 1.4);
    const at = (h) => [x - f.p.x, y + h, z - f.p.z];
    piece(f.g, G.box(T, th, T), color, { pos: at(th / 2 - 0.2), rot: [0, a, 0], outline: 0.035 });
    piece(f.g, G.box(T + 0.4, 0.35, T + 0.4), cap, { pos: at(th), rot: [0, a, 0], outline: 0.02 });
    piece(f.g, G.cone(T * 0.85, 1.3, 4), roof, { pos: at(th + 0.8), rot: [0, a + Math.PI / 4, 0], outline: 0.02 });
    piece(f.g, G.box(0.3, 0.3, 0.3), LAMP, { pos: [x - f.p.x - Math.sin(a) * (T / 2 + 0.1), y + th - 0.7, z - f.p.z - Math.cos(a) * (T / 2 + 0.1)], glow: true, outline: 0.008 });
    f.col(x, z, T * 0.72, th);
  };
  for (let i = 0; i < n; i++) {
    const a = i * step + step / 2;
    if (gates.some((g) => Math.abs(wrap(a - g)) < half)) continue;
    const [x, z] = f.at(a, R);
    const y = f.gy(x, z);
    piece(f.g, G.box(len, ht, thick), color, { pos: [x - f.p.x, y + ht / 2 - 0.2, z - f.p.z], rot: [0, a, 0], outline: 0.03 });
    piece(f.g, G.box(len, 0.3, thick + 0.25), cap, { pos: [x - f.p.x, y + ht - 0.05, z - f.p.z], rot: [0, a, 0], outline: 0.02 });
    const ix = -Math.sin(a) * (thick / 2 + 0.03);
    const iz = -Math.cos(a) * (thick / 2 + 0.03);
    piece(f.g, G.box(len, 0.1, 0.05), band, { pos: [x - f.p.x + ix, y + ht - 0.6, z - f.p.z + iz], rot: [0, a, 0], glow: true, outline: 0 });
    f.col(x, z, len / 2 + 0.05, ht);
    if (i % every === 0 && !gates.some((g) => Math.abs(wrap(a - g)) < half + step * 1.5)) towerAt(a, false);
  }
  for (const g0 of gates) {
    for (const s of [-1, 1]) towerAt(g0 + s * half, true);
    const [ax, az] = f.at(g0 - half, R);
    const [bx, bz] = f.at(g0 + half, R);
    const y = Math.max(f.gy(ax, az), f.gy(bx, bz)) + ht + 1.6;
    const mx = (ax + bx) / 2 - f.p.x;
    const mz = (az + bz) / 2 - f.p.z;
    piece(f.g, G.box(Math.hypot(bx - ax, bz - az) + tower, 0.7, thick + 0.4), cap, { pos: [mx, y, mz], rot: [0, g0, 0], outline: 0.03 });
    piece(f.g, G.box(1.2, 0.5, 0.06), band, { pos: [mx - Math.sin(g0) * (thick / 2 + 0.25), y, mz - Math.cos(g0) * (thick / 2 + 0.25)], rot: [0, g0, 0], glow: true, outline: 0 });
  }
}

// The services that aren't people — quest boards, a city's war table and sealed gates — stand
// where world/places.js put their "folk" (the server checks those spots). Into a builder's group,
// or a group of their own.
export function serviceProps(w, p, f = null) {
  const s = f ?? site(w, p, 0);
  let any = false;
  for (const n of p.npcs ?? []) {
    if (n.role === 'board') {
      questBoard(s.put(n.x, n.z, n.facing));
      s.col(n.x, n.z, 0.7, 2.6);
    } else if (n.role === 'warroom') {
      warTable(s.put(n.x, n.z, n.facing));
      s.col(n.x, n.z, 1.45, 1.3);
    } else if (n.role === 'gate' && p.type !== 'district') {
      waygate(s.put(n.x, n.z, n.facing));
      for (const lx of [-1.75, 1.75]) s.col(n.x + Math.cos(n.facing) * lx, n.z - Math.sin(n.facing) * lx, 0.6, 4.8);
    } else if (n.role === 'gate') {
      sealedGate(s.put(n.x, n.z, n.facing), n.gate);
      for (const lx of [-3.9, -1.9, 0, 1.9, 3.9]) s.col(n.x + Math.cos(n.facing) * lx, n.z - Math.sin(n.facing) * lx, lx === 0 || Math.abs(lx) > 3 ? 1.15 : 0.9, 9);
    } else continue;
    any = true;
  }
  if (!f && any) {
    flatten(s.g);
    w.finish(s.g);
  }
}

// The inn: two storeys, a lit sign over the door, an awning and benches outside.
function inn(h, st, big = false) {
  const wd = big ? 12 : 10;
  const dp = big ? 8 : 7;
  building(h, { wd, dp, ht: 3.1, storeys: big ? 3 : 2, wall: st.walls[0], roof: st.roofs[0], trim: st.trim, chimney: true, awning: 0xb0583a, sign: LAMP, doorX: 0, doorW: 1.6 });
  piece(h, G.box(0.08, 0.08, 1.3), C.metalDark, { pos: [wd / 2 - 0.6, 3.3, dp / 2 + 0.6], outline: 0.006 });
  piece(h, G.box(0.1, 0.8, 1.0), 0xd9a227, { pos: [wd / 2 - 0.6, 2.75, dp / 2 + 0.95], outline: 0.012 });
  for (const s of [-1, 1]) piece(h, G.box(1.8, 0.45, 0.5), C.woodDark, { pos: [s * (wd / 2 - 1.6), 0.45, dp / 2 + 0.6], outline: 0.012 });
  return { wd, dp, ht: 3.1 * (big ? 3 : 2) + 2 };
}

// The workshop: a smithy, its doors open on the forge, a chimney glowing, an anvil to one side.
function workshop(h, st, big = false) {
  const wd = big ? 11 : 8;
  const dp = big ? 8 : 6;
  building(h, { wd, dp, ht: 3.4, wall: st.walls[1], roof: C.metalDark, trim: st.trim, flat: true, doorX: 0, doorW: 2.6, doorH: 2.5 });
  piece(h, G.box(2.0, 1.4, 0.12), FORGE, { pos: [0, 1.0, dp / 2 + 0.05], glow: true, outline: 0.008 });
  piece(h, G.box(1.1, 3.6, 1.1), C.stoneDark, { pos: [wd / 2 - 1.2, 3.4 + 1.6, -dp / 2 + 1.2], outline: 0.02 });
  piece(h, G.box(0.8, 0.2, 0.8), FORGE, { pos: [wd / 2 - 1.2, 3.4 + 3.45, -dp / 2 + 1.2], glow: true, outline: 0 });
  piece(h, G.box(0.5, 0.65, 0.5), C.stoneDark, { pos: [-wd / 2 + 0.8, 0.33, dp / 2 + 0.9], outline: 0.015 });
  piece(h, G.box(0.9, 0.25, 0.4), C.metalDark, { pos: [-wd / 2 + 0.8, 0.78, dp / 2 + 0.9], outline: 0.015 });
  for (let i = 0; i < 4; i++) piece(h, G.box(0.08, 0.9, 0.06), C.metal, { pos: [wd / 2 - 1.0 - i * 0.35, 1.7, dp / 2 + 0.06], outline: 0.006 });
  return { wd, dp, ht: 5.5 };
}

// The Warden post: a blockhouse with a watchtower and a beacon, the Wardens' green banners.
function wardenPost(h) {
  building(h, { wd: 8, dp: 6.5, ht: 3.2, wall: C.steel, roof: C.metalDark, trim: C.metalDark, flat: true, antenna: true, doorX: 0 });
  piece(h, G.box(2.6, 9, 2.6), C.steel, { pos: [-2.4, 4.5, -1.6], outline: 0.035 });
  piece(h, G.box(3.2, 0.4, 3.2), C.metalDark, { pos: [-2.4, 9.1, -1.6], outline: 0.02 });
  piece(h, G.cyl(0.35, 0.35, 0.5, 8), HEARTH, { pos: [-2.4, 9.6, -1.6], glow: true, outline: 0.01 });
  for (const s of [-1, 1]) {
    piece(h, G.box(0.9, 2.2, 0.05), WARDEN, { pos: [s * 2.3, 2.3, 3.3], outline: 0.012 });
    piece(h, G.octa(0.2), 0xf0c75e, { pos: [s * 2.3, 2.6, 3.34], scale: [1, 1, 0.3], outline: 0.006 });
  }
  return { wd: 8, dp: 6.5, ht: 9.5 };
}

// A city's Warden citadel: a great hall on a terrace, a keep behind it rising to a beacon.
function citadel(h) {
  piece(h, G.box(14, 0.3, 11), C.stoneDark, { pos: [0, 0.15, 0], outline: 0.03 });
  building(sub(h, 0, 0.3, 1), { wd: 12, dp: 7, ht: 3.6, storeys: 2, wall: C.stone, roof: C.metalDark, trim: C.stoneDark, flat: true, doorX: 0, doorW: 2.2, doorH: 3 });
  piece(h, G.box(5.5, 16, 5.5), C.stone, { pos: [0, 8.8, -2.6], outline: 0.04 });
  piece(h, G.box(6.4, 0.7, 6.4), C.stoneDark, { pos: [0, 16.9, -2.6], outline: 0.025 });
  piece(h, G.octa(0.9), HEARTH, { pos: [0, 18.4, -2.6], scale: [1, 1.6, 1], glow: true, outline: 0.02 });
  for (const s of [-1, 1]) {
    piece(h, G.box(0.08, 3.2, 0.08), C.metalDark, { pos: [s * 2.0, 18.6, -2.6], outline: 0.006 });
    piece(h, G.box(1.2, 4.2, 0.06), WARDEN, { pos: [s * 4.2, 4.2, 4.6], outline: 0.015 });
    piece(h, G.octa(0.3), 0xf0c75e, { pos: [s * 4.2, 4.8, 4.65], scale: [1, 1, 0.3], outline: 0.006 });
  }
  for (let k = 0; k < 4; k++) piece(h, G.box(0.9, 1.4, 0.08), LAMP, { pos: [-1.6 + (k % 2) * 3.2, 9 + Math.floor(k / 2) * 4, 0.18], glow: true, outline: 0.01 });
  return { wd: 12, dp: 10, ht: 17 };
}

// ---------------------------------------------------------------- hamlets
// A few homes round a fire, their fronts on the road in (local +z); the folk Gen placed stand in
// the yard, so buildings keep to the back and sides.
const lp = polar;
export const HAMLET_BUILDERS = {
  // A farm: two cottages and a shed round the fire, a little field out back behind a fence.
  farm(w, p) {
    const f = hframe(w, p);
    const st = styleAt(w, p.x, p.z);
    const { rnd } = f;
    for (const [a, d] of [[2.15, 7.6], [-2.0, 8.0]]) {
      const [lx, lz] = lp(a, d);
      const wd = 5.2 + rnd();
      building(f.put(lx, lz, a + Math.PI), { wd, dp: 4.4, ht: 2.8, wall: st.walls[Math.floor(rnd() * 3)], roof: st.roofs[0], trim: st.trim, chimney: rnd() < 0.6 });
      bodyCol(w, ...f.toW(lx, lz), p.rot + a + Math.PI, wd, 4.4, 4.5);
    }
    const [sx, sz] = lp(Math.PI + 0.62, 8.2);
    building(f.put(sx, sz, Math.PI + 0.62 + Math.PI), { wd: 3.4, dp: 3, ht: 2.4, wall: C.wood, roof: C.metalDark, trim: C.woodDark, flat: true });
    f.col(sx, sz, 1.9, 3);
    const crop = st === STYLES.dry ? 0xd8b84a : 0x5aa84e;
    for (let r = 0; r < 4; r++) {
      for (let k = 0; k < 5; k++) {
        const [cx, cz] = lp(Math.PI - 0.5 + (k - 2) * 0.1, 8.8 + r * 1.05);
        piece(f.g, G.cone(0.3, 0.8, 5), crop, { pos: [cx, f.gy(cx, cz) + 0.38, cz], rot: [0, rnd() * 3, 0], outline: 0.01 });
      }
    }
    for (let k = -3; k <= 3; k++) {
      const [cx, cz] = lp(Math.PI - 0.5 + k * 0.1, 12.6);
      piece(f.g, G.box(0.12, 1.0, 0.12), C.wood, { pos: [cx, f.gy(cx, cz) + 0.5, cz], outline: 0.01 });
    }
    const [lx, lz] = lp(0.95, 6.4);
    piece(f.g, G.cyl(0.07, 0.09, 2.8, 6), C.metalDark, { pos: [lx, f.gy(lx, lz) + 1.4, lz], outline: 0.01 });
    piece(f.g, G.sphere(0.18, 8, 6), LAMP, { pos: [lx, f.gy(lx, lz) + 2.9, lz], glow: true, outline: 0.01 });
    flatten(f.g);
    w.finish(f.g);
    w.barrel(...f.toW(...lp(-1.3, 6.6)));
    w.campfire(...f.toW(0, 0), { scale: 0.8 });
  },

  // A prospector's claim: steel shacks, a little drill rig over a glowing seam, an ore cart.
  prospect(w, p) {
    const f = hframe(w, p);
    const { rnd } = f;
    const biome = w.gen.biomeAt(p.x, p.z);
    const ore = biome === 'crystal' ? C.crystal : biome === 'ash' ? FORGE : 0x7ab0d8;
    for (const [a, d] of [[2.1, 7.4], [-2.15, 7.6]]) {
      const [lx, lz] = lp(a, d);
      building(f.put(lx, lz, a + Math.PI), { wd: 4.4, dp: 3.6, ht: 2.6, wall: C.steel, roof: C.metalDark, trim: 0xd9a227, flat: true, antenna: rnd() < 0.5 });
      bodyCol(w, ...f.toW(lx, lz), p.rot + a + Math.PI, 4.4, 3.6, 3.4);
    }
    const [rx, rz] = lp(Math.PI, 8.4);
    const ry = f.gy(rx, rz);
    for (const [ox, oz] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]]) {
      piece(f.g, G.box(0.22, 6.2, 0.22), 0xd9a227, { pos: [rx + ox * 0.55, ry + 3, rz + oz * 0.55], rot: [oz * 0.1, 0, -ox * 0.1], outline: 0.015 });
    }
    piece(f.g, G.box(1.2, 1.0, 1.2), C.metalDark, { pos: [rx, ry + 5.6, rz], outline: 0.02 });
    piece(f.g, G.cyl(0.14, 0.14, 5, 6), C.metal, { pos: [rx, ry + 2.7, rz], outline: 0.01 });
    piece(f.g, G.cyl(1.6, 1.6, 0.08, 14), ore, { pos: [rx, ry + 0.05, rz], glow: true, outline: 0 });
    f.col(rx, rz, 1.7, 6);
    const [hx, hz] = lp(Math.PI + 0.85, 9);
    for (let k = 0; k < 5; k++) {
      const s = 0.5 + rnd() * 0.7;
      const ox = hx + (rnd() - 0.5) * 2.4;
      const oz = hz + (rnd() - 0.5) * 2.4;
      piece(f.g, G.dodeca(s), k % 2 ? C.stoneDark : ore, { pos: [ox, f.gy(ox, oz) + s * 0.4, oz], rot: [rnd(), rnd(), 0], scale: [1, 0.7, 1], glow: k % 2 === 0, outline: k % 2 ? 0.02 : 0 });
    }
    f.col(hx, hz, 1.8, 1.5);
    const cart = f.put(...lp(1.25, 7.2), 1.25 + Math.PI / 2);
    piece(cart, G.box(1.8, 0.8, 1.1), C.rust, { pos: [0, 0.75, 0], outline: 0.02 });
    for (const x of [-0.6, 0.6]) for (const z of [-0.6, 0.6]) piece(cart, G.cylZ(0.28, 0.28, 0.14, 10), C.metalDark, { pos: [x, 0.28, z], rot: [0, Math.PI / 2, 0], outline: 0.01 });
    piece(cart, G.dodeca(0.45), ore, { pos: [0, 1.25, 0], scale: [1.3, 0.6, 1], glow: true, outline: 0 });
    f.col(...lp(1.25, 7.2), 1.1, 1.2);
    flatten(f.g);
    w.finish(f.g);
    w.campfire(...f.toW(0, 0), { scale: 0.8 });
  },

  // Reed huts on stilts over the wet ground, a boardwalk between them, a boat drawn up.
  fen(w, p) {
    const f = hframe(w, p);
    const { g, rnd, gy, colBox } = f;
    const strut = (parent, a, b, width, material) => {
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const dz = b[2] - a[2];
      const length = Math.hypot(dx, dy, dz);
      piece(parent, G.box(width, length, width), material, {
        pos: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2],
        rot: [Math.atan2(dz, dy), 0, Math.atan2(-dx, dy)],
        outline: 0.012,
      });
    };
    const huts = [[2.0, 7.8], [-2.05, 8.0], [Math.PI, 8.6]];
    for (let i = 0; i < huts.length; i++) {
      const [a, d] = huts[i];
      const [lx, lz] = lp(a, d);
      const width = 3.6 + rnd() * 0.5;
      const depth = 3.5 + rnd() * 0.45;
      const lift = 1.65 + rnd() * 0.2;
      const roof = i === 1 ? shade(C.thatch, 0.82) : i === 2 ? shade(C.thatch, 1.12) : C.thatch;
      const wall = i === 1 ? shade(C.wood, 0.82) : i === 2 ? 0x7a694c : shade(C.wood, 1.15);
      const hut = f.put(lx, lz, a + Math.PI, lift);
      const postX = width * 0.39;
      const postZ = depth * 0.39;
      piece(hut, G.box(width + 0.62, 0.26, depth + 0.62), C.woodDark, { pos: [0, 0, 0], outline: 0.03 });
      piece(hut, G.box(width + 0.18, 0.12, depth + 0.18), C.wood, { pos: [0, 0.18, 0], outline: 0.02 });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        piece(hut, G.cyl(0.15, 0.19, lift + 0.3, 7), C.woodDark, { pos: [sx * postX, -lift / 2, sz * postZ], outline: 0.015 });
        piece(hut, G.cyl(0.24, 0.28, 0.22, 7), shade(C.woodDark, 0.8), { pos: [sx * postX, -lift - 0.13, sz * postZ], outline: 0.012 });
        strut(hut, [sx * postX, -lift + 0.12, sz * postZ], [sx * (postX - 0.28), 0.06, sz * (postZ - 0.28)], 0.17, C.wood);
      }
      piece(hut, G.box(width, 2.5, depth), wall, { pos: [0, 1.42, 0], outline: 0.04 });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) piece(hut, G.box(0.18, 2.5, 0.18), C.woodDark, { pos: [sx * (width / 2 - 0.1), 1.42, sz * (depth / 2 - 0.1)], outline: 0.015 });
      for (let x = -width / 2 + 0.35; x <= width / 2 - 0.2; x += 0.58) {
        if (Math.abs(x) < 0.62) continue;
        piece(hut, G.box(0.09, 2.25, 0.08), C.wood, { pos: [x, 1.42, depth / 2 + 0.045], outline: 0.008 });
      }
      for (const y of [0.35, 2.45]) piece(hut, G.box(width + 0.1, 0.12, 0.14), C.woodDark, { pos: [0, y, depth / 2 + 0.06], outline: 0.01 });

      const doorWidth = 0.88;
      piece(hut, G.box(doorWidth, 1.75, 0.12), 0x30241b, { pos: [0, 1.08, depth / 2 + 0.08], outline: 0.018 });
      for (const sx of [-1, 1]) piece(hut, G.box(0.1, 1.9, 0.14), C.woodDark, { pos: [sx * 0.52, 1.13, depth / 2 + 0.13], outline: 0.01 });
      strut(hut, [-0.35, 0.35, depth / 2 + 0.16], [0.35, 1.8, depth / 2 + 0.16], 0.08, C.wood);
      for (const sx of [-1, 1]) {
        const wx = sx * (width * 0.29);
        piece(hut, G.box(0.88, 0.9, 0.16), C.woodDark, { pos: [wx, 1.65, depth / 2 + 0.08], outline: 0.012 });
        piece(hut, G.box(0.66, 0.68, 0.06), 0x172a29, { pos: [wx, 1.65, depth / 2 + 0.18], outline: 0 });
        piece(hut, G.box(0.48, 0.5, 0.04), LAMP, { pos: [wx, 1.65, depth / 2 + 0.22], glow: true, outline: 0 });
        piece(hut, G.box(0.06, 0.78, 0.04), C.wood, { pos: [wx, 1.65, depth / 2 + 0.25], outline: 0 });
        piece(hut, G.box(0.72, 0.06, 0.04), C.wood, { pos: [wx, 1.65, depth / 2 + 0.25], outline: 0 });
        for (const shutter of [-1, 1]) piece(hut, G.box(0.13, 0.76, 0.12), shade(C.wood, 0.78), { pos: [wx + shutter * 0.55, 1.65, depth / 2 + 0.1], outline: 0.01 });
      }

      const eaveY = 2.72;
      const roofRise = 1.65;
      const slope = 0.72;
      for (const side of [-1, 1]) piece(hut, G.box(width + 0.8, 0.18, depth * 0.7), roof, { pos: [0, eaveY + roofRise / 2, side * depth * 0.22], rot: [side * slope, 0, 0], outline: 0.04 });
      const gable = G.extrude(G.shape([[-width / 2, 0], [width / 2, 0], [0, roofRise]]), 0.14, 0.01);
      for (const side of [-1, 1]) {
        const z = side * (depth / 2 + 0.04);
        piece(hut, gable.clone(), wall, { pos: [0, eaveY, z], outline: 0.03 });
        strut(hut, [-width * 0.42, eaveY + 0.08, z], [0, eaveY + roofRise - 0.1, z], 0.16, C.woodDark);
        strut(hut, [0, eaveY + roofRise - 0.1, z], [width * 0.42, eaveY + 0.08, z], 0.16, C.woodDark);
      }
      const rows = 4;
      const cols = 4;
      for (const side of [-1, 1]) for (let row = 0; row < rows; row++) {
        const t = (row + 0.5) / rows;
        for (let col = 0; col < cols; col++) {
          const tx = -width / 2 - 0.18 + (col + 0.5) * (width + 0.36) / cols + (row % 2) * 0.08;
          const tz = side * (depth * 0.22 + depth * 0.23 * t);
          const ty = eaveY + roofRise / 2 - Math.sin(slope) * depth * 0.23 * t + 0.08;
          const tile = (row + col + (side > 0 ? i : 0)) % 3 ? roof : shade(roof, 0.78);
          piece(hut, G.box((width + 0.3) / cols, 0.12, depth * 0.25 / rows + 0.08), tile, { pos: [tx, ty, tz], rot: [side * slope, 0, 0], outline: 0.015 });
        }
      }
      piece(hut, G.box(width + 0.9, 0.2, 0.3), C.woodDark, { pos: [0, eaveY + roofRise, 0], outline: 0.02 });
      if (i === 1) piece(hut, G.cyl(0.13, 0.17, 1.25, 7), C.woodDark, { pos: [width * 0.28, eaveY + roofRise + 0.55, -depth * 0.2], outline: 0.012 });

      for (const sx of [-1, 1]) {
        piece(hut, G.box(0.12, 0.68, 0.12), C.woodDark, { pos: [sx * 0.85, 0.38, depth / 2 + 0.8], outline: 0.01 });
        piece(hut, G.box(0.12, 0.68, 0.12), C.woodDark, { pos: [sx * 0.85, 0.38, depth / 2 + 1.5], outline: 0.01 });
      }
      piece(hut, G.box(1.95, 0.16, 1.9), C.wood, { pos: [0, 0.12, depth / 2 + 1.15], outline: 0.018 });
      piece(hut, G.box(2.05, 0.12, 2.0), roof, { pos: [0, 2.88, depth / 2 + 0.75], rot: [0.16, 0, 0], outline: 0.02 });
      colBox(lx, lz, width / 2 + 0.5, depth / 2 + 0.55, a + Math.PI, 6.8);

      const start = 2.4;
      const end = d - depth / 2 - 1.0;
      const pathLength = Math.max(1.2, end - start);
      const pathD = (start + end) / 2;
      const [px, pz] = lp(a, pathD);
      const path = f.put(px, pz, a);
      piece(path, G.box(1.5, 0.16, pathLength), C.woodDark, { pos: [0, 0.42, 0], outline: 0.02 });
      for (let z = -pathLength / 2 + 0.18; z < pathLength / 2; z += 0.42) piece(path, G.box(1.42, 0.05, 0.07), C.wood, { pos: [0, 0.52, z], outline: 0.006 });
      for (const sx of [-1, 1]) {
        for (let z = -pathLength / 2 + 0.5; z < pathLength / 2; z += 1.5) piece(path, G.cyl(0.06, 0.08, 0.88, 5), C.wood, { pos: [sx * 0.72, 0.86, z], outline: 0.008 });
        piece(path, G.box(0.08, 0.08, pathLength), C.wood, { pos: [sx * 0.72, 1.22, 0], outline: 0.008 });
      }
      colBox(px, pz, 0.78, pathLength / 2, a, 0.62);
    }
    const [jx, jz] = lp(Math.PI - 0.8, 10.4);
    piece(g, G.box(1.1, 0.45, 3.4), C.woodDark, { pos: [jx, gy(jx, jz) + 0.22, jz], rot: [0, rnd(), 0], outline: 0.02 });
    const reedColor = [0x526b42, 0x778447, 0x947c45];
    for (let cluster = 0; cluster < 20; cluster++) {
      const a = rnd() * TAU;
      const d = 12 + rnd() * 4.5;
      const [rx, rz] = lp(a, d);
      for (let stem = 0; stem < 3; stem++) {
        const x = rx + (rnd() - 0.5) * 0.85;
        const z = rz + (rnd() - 0.5) * 0.85;
        const height = 1.3 + rnd() * 1.8;
        const lean = (rnd() - 0.5) * 0.3;
        piece(g, G.cyl(0.035, 0.06, height, 5), reedColor[stem], { pos: [x, gy(x, z) + height / 2, z], rot: [lean, 0, lean], outline: 0.006 });
        piece(g, G.box(0.12, 0.48, 0.1), reedColor[(stem + 1) % reedColor.length], { pos: [x + lean * 1.5, gy(x, z) + height * 0.62, z], rot: [lean, 0, -0.35], outline: 0.005 });
        if (stem === 0) piece(g, G.cyl(0.07, 0.08, 0.35, 6), C.woodDark, { pos: [x, gy(x, z) + height + 0.12, z], outline: 0.006 });
      }
    }
    for (let pool = 0; pool < 7; pool++) {
      const a = rnd() * TAU;
      const d = 11.5 + rnd() * 5;
      const [x, z] = lp(a, d);
      const radius = 0.8 + rnd() * 0.8;
      piece(g, G.cyl(radius, radius * 1.1, 0.035, 9), 0x456b69, { pos: [x, gy(x, z) + 0.025, z], outline: 0 });
      piece(g, G.cyl(radius * 0.48, radius * 0.5, 0.045, 7), 0x638178, { pos: [x - radius * 0.15, gy(x, z) + 0.05, z + radius * 0.08], outline: 0 });
    }
    for (const a of [0.95, -0.95]) {
      const [lx, lz] = lp(a, 5.8);
      piece(g, G.cyl(0.07, 0.1, 3.2, 6), C.woodDark, { pos: [lx, gy(lx, lz) + 1.6, lz], outline: 0.01 });
      piece(g, G.box(0.5, 0.09, 0.09), C.woodDark, { pos: [lx + 0.2, gy(lx, lz) + 3.05, lz], outline: 0.008 });
      piece(g, G.sphere(0.2, 8, 6), LAMP, { pos: [lx + 0.38, gy(lx, lz) + 2.95, lz], glow: true, outline: 0.01 });
    }
    flatten(g);
    w.finish(g);
    w.campfire(...f.toW(0, 0), { scale: 0.8 });
  },

  // Nomads camped for the season: cloth tents, a wagon, rugs by the fire, a banner.
  nomad(w, p) {
    const f = hframe(w, p);
    const { rnd } = f;
    for (const [a, d, k] of [[2.0, 7.4, 0], [-2.0, 7.6, 1], [Math.PI + 0.7, 8.2, 2]]) {
      const [lx, lz] = lp(a, d);
      const t = f.put(lx, lz, a + Math.PI);
      piece(t, G.cone(2.3, 3.0, 6), CLOTH[(k + Math.floor(rnd() * 3)) % CLOTH.length], { pos: [0, 1.5, 0], outline: 0.035 });
      piece(t, G.cyl(0.05, 0.05, 1.0, 5), C.wood, { pos: [0, 3.3, 0], outline: 0.008 });
      piece(t, G.box(0.9, 1.5, 0.08), 0x2a2018, { pos: [0, 0.75, 1.55], rot: [-0.45, 0, 0], outline: 0.01 });
      f.col(lx, lz, 2.1, 3);
    }
    const wag = f.put(...lp(Math.PI - 0.75, 8.6), Math.PI - 0.75 + Math.PI / 2);
    piece(wag, G.box(4.6, 1.4, 2.2), C.woodDark, { pos: [0, 1.3, 0], outline: 0.03 });
    piece(wag, new THREE.CylinderGeometry(1.2, 1.2, 4.4, 12, 1, true, 0, Math.PI).rotateZ(Math.PI / 2), CLOTH[1], { pos: [0, 2.0, 0], outline: 0.03 });
    for (const x of [-1.5, 1.5]) for (const z of [-1.15, 1.15]) piece(wag, G.cylZ(0.6, 0.6, 0.3, 12), 0x2a2420, { pos: [x, 0.6, z], outline: 0.015 });
    f.col(...lp(Math.PI - 0.75, 8.6), 2.4, 3);
    for (let k = 0; k < 3; k++) {
      const [rx, rz] = lp(-0.8 + k * 0.5, 2.6);
      piece(f.g, G.box(1.6, 0.03, 1.1), CLOTH[(k + 2) % CLOTH.length], { pos: [rx, f.gy(rx, rz) + 0.03, rz], rot: [0, rnd(), 0], outline: 0 });
    }
    const [bx, bz] = lp(-1.1, 6.6);
    piece(f.g, G.cyl(0.05, 0.05, 4.2, 5), C.wood, { pos: [bx, f.gy(bx, bz) + 2.1, bz], outline: 0.01 });
    piece(f.g, G.box(0.04, 1.3, 0.9), CLOTH[0], { pos: [bx, f.gy(bx, bz) + 3.5, bz + 0.45], outline: 0.01 });
    flatten(f.g);
    w.finish(f.g);
    w.campfire(...f.toW(0, 0), { scale: 0.8 });
  },
};

// ---------------------------------------------------------------- towns
const bearingOf = (p, n) => Math.atan2(n.x - p.x, n.z - p.z);
const nearFolk = (p, x, z, r) => (p.npcs ?? []).some((n) => Math.hypot(n.x - x, n.z - z) < r);

// A ring of houses at radius `d` round the place: wherever there's room off the roads, the folk
// and the bearings in `skip` ([bearing, half-width]).
function houseRing(f, st, d, { step = 0.36, skip = [], storeys = 0.3, flat = false, big = 1 } = {}) {
  const { rnd } = f;
  const pick = (list) => list[Math.floor(rnd() * list.length)];
  let n = 0;
  for (let a = rnd() * step; a < TAU - step * 0.5; a += step) {
    if (skip.some(([b, hw]) => Math.abs(wrap(a - b)) < hw)) continue;
    const wd = (5.4 + rnd() * 2.4) * big;
    const dp = (4.4 + rnd() * 1.4) * big;
    const [x, z] = f.at(a, d);
    if (!f.clear(x, z, Math.hypot(wd, dp) / 2) || nearFolk(f.p, x, z, Math.hypot(wd, dp) / 2 + 1)) continue;
    const s = rnd() < storeys ? 2 : 1;
    building(f.put(x, z, a + Math.PI), {
      wd, dp, ht: 3, storeys: s, wall: pick(st.walls), roof: pick(st.roofs), trim: st.trim, flat: flat !== (rnd() < 0.12),
      chimney: rnd() < 0.4, antenna: rnd() < 0.2, awning: rnd() < 0.15 ? pick(CLOTH) : null,
    });
    bodyCol(f.w, x, z, a + Math.PI, wd, dp, 3 * s + 1.5);
    n++;
  }
  return n;
}

// Lamps round a ring, off the roads and the folk.
function lampRing(f, d, step = 0.62) {
  for (let a = 0.3; a < TAU; a += step) {
    const [x, z] = f.at(a, d);
    if (f.clear(x, z, 0.4) && !nearFolk(f.p, x, z, 1.6)) lamp(f, x, z);
  }
}

// Market stalls behind the place's traders.
function stalls(f, out = 2) {
  for (const n of f.p.npcs) {
    if (n.role !== 'trader') continue;
    const a = bearingOf(f.p, n);
    const d = Math.hypot(n.x - f.p.x, n.z - f.p.z) + out;
    const [x, z] = f.at(a, d);
    stall(f.put(x, z, a + Math.PI), CLOTH[Math.floor(f.rnd() * CLOTH.length)], n.stock ?? 'all');
    f.col(x, z, 1.45, 1.1);
  }
}

// A walled town round its waystone: the market and the board on the plaza, the inn, the workshop
// and the Warden post on the inner ring, houses round the ring street, walls and gates.
export function buildTown(w, p) {
  const R = p.r;
  const f = site(w, p, R + 4);
  const st = styleAt(w, p.x, p.z);
  const S = p.services;
  const flat = f.rnd() < st.flat;
  for (const [key, make] of [['inn', inn], ['workshop', workshop], ['post', wardenPost]]) {
    const a = S[key];
    const [x, z] = f.at(a, TOWN.service);
    const b = make(f.put(x, z, a + Math.PI), st);
    bodyCol(w, x, z, a + Math.PI, b.wd, b.dp, b.ht);
  }
  stalls(f);
  serviceProps(w, p, f);
  // A few smaller things on the inner ring between the services: a water tower, a shed.
  const busy = [S.inn, S.workshop, S.post, S.market, S.board].map((b) => [b, 0.62]);
  for (let a = 0.2, k = 0; a < TAU && k < 3; a += 0.55) {
    const [x, z] = f.at(a, TOWN.service);
    if (busy.some(([b, hw]) => Math.abs(wrap(a - b)) < hw) || !f.clear(x, z, 2.6) || nearFolk(p, x, z, 3)) continue;
    const h = f.put(x, z, a + Math.PI);
    if (k++ % 2 === 0) {
      for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) piece(h, G.box(0.18, 4.5, 0.18), C.metalDark, { pos: [ox, 2.25, oz], outline: 0.012 });
      piece(h, G.cyl(1.5, 1.5, 2.2, 12), st.walls[2], { pos: [0, 5.6, 0], outline: 0.03 });
      piece(h, G.cone(1.7, 1.0, 12), st.roofs[0], { pos: [0, 7.2, 0], outline: 0.02 });
      f.col(x, z, 1.6, 7.5);
    } else {
      building(h, { wd: 3.6, dp: 3, ht: 2.4, wall: st.walls[2], roof: st.roofs[1], trim: st.trim, flat: true });
      f.col(x, z, 2, 3);
    }
  }
  houseRing(f, st, TOWN.house, { flat });
  lampRing(f, TOWN.street + 1.6);
  for (const a of [0.5, 2.6, 4.7]) {
    const [x, z] = f.at(a, 3.4);
    if (f.clear(x, z, 0.2) && !nearFolk(p, x, z, 1.5)) lamp(f, x, z, 2.6);
  }
  ringWall(f, R, { color: st.wall, cap: st.trim, roof: st.roofs[0] });
  flatten(f.g);
  w.finish(f.g);
}

// ---------------------------------------------------------------- cities
// A city's heart: the plaza round its waystone (the board and the war table on it), the Warden
// citadel and the inn on the hall ring with other great halls between, the city walls.
export function buildCity(w, p) {
  const f = site(w, p, CITY.hall + 12);
  const st = styleAt(w, p.x, p.z);
  const S = p.services;
  const big = [['citadel', citadel], ['inn', (h) => inn(h, st, true)]];
  for (const [key, make] of big) {
    const a = S[key];
    const [x, z] = f.at(a, CITY.hall);
    const b = make(f.put(x, z, a + Math.PI));
    bodyCol(w, x, z, a + Math.PI, b.wd, b.dp, b.ht);
  }
  serviceProps(w, p, f);
  // Planters and banners round the plaza.
  for (let a = 0.15; a < TAU; a += TAU / 10) {
    const [x, z] = f.at(a, 4.6);
    if (!f.clear(x, z, 0.8) || nearFolk(p, x, z, 1.8)) continue;
    const h = f.put(x, z, a);
    piece(h, G.box(1.4, 0.6, 1.4), C.stoneDark, { pos: [0, 0.3, 0], outline: 0.015 });
    piece(h, G.ico(0.7, 0), C.bush, { pos: [0, 0.95, 0], outline: 0.015 });
    f.col(x, z, 0.8, 1.2);
  }
  houseRing(f, st, CITY.hall, { step: 0.62, skip: [[S.citadel, 0.75], [S.inn, 0.7]], storeys: 1, big: 1.35, flat: true });
  lampRing(f, 26.5, 0.4);
  flatten(f.g);
  w.finish(f.g);
}

// A city's walls, a point of interest of their own (so the city streams in a part at a time):
// gates where the roads come through, terraces backed against them between the districts, and
// trees along the boulevard.
export function buildCityWall(w, p) {
  const f = site(w, p, p.wall + 4);
  const st = styleAt(w, p.x, p.z);
  const half = Math.asin(SIZES.city.district / SIZES.city.ring);
  const quarters = p.quarters ?? [];
  houseRing(f, st, p.wall - 8, { step: 0.11, skip: quarters.map((b) => [b, half + 0.1]), storeys: 0.75, flat: true });
  for (let a = 0.05; a < TAU; a += 0.16) {
    if (quarters.some((b) => Math.abs(wrap(a - b)) < half + 0.05)) continue;
    const [x, z] = f.at(a, 38 + (Math.round(a / 0.16) % 2) * 3);
    if (!f.clear(x, z, 1.2)) continue;
    const t = f.put(x, z);
    piece(t, G.cyl(0.2, 0.3, 2.2, 7), C.woodDark, { pos: [0, 1.1, 0], outline: 0.03 });
    piece(t, G.ico(1.5, 0), C.leaf, { pos: [0, 3.1, 0], outline: 0.04 });
    f.col(x, z, 0.35, 3);
  }
  ringWall(f, p.wall, { ht: 5.6, thick: 1.4, gate: 6.4, tower: 3, every: 7, color: C.stone, cap: C.stoneDark, roof: st.roofs[0] });
  flatten(f.g);
  w.finish(f.g);
}

// The districts round a city's heart, each built on its own (local +z faces the city's heart;
// the side toward it opens on the boulevard).
function district(w, p) {
  const f = site(w, p, p.r + 4);
  f.st = styleAt(w, p.x, p.z);
  f.front = [[p.rot, 0.75]];
  return f;
}
function finishDistrict(w, f, ring = {}) {
  houseRing(f, f.st, 16.5, { step: 0.5, skip: f.front, storeys: 0.6, ...ring });
  houseRing(f, f.st, 22.5, { step: 0.38, skip: f.front, storeys: 0.6, ...ring });
  lampRing(f, 10.5, 0.9);
  flatten(f.g);
  w.finish(f.g);
}

export const DISTRICT_BUILDERS = {
  // The market: traders' stalls round a square with an obelisk, shops with awnings round that.
  market(w, p) {
    const f = district(w, p);
    stalls(f);
    const h = f.put(p.x, p.z, p.rot);
    piece(h, G.box(1.6, 0.5, 1.6), C.stoneDark, { pos: [0, 0.25, 0], outline: 0.02 });
    piece(h, G.box(0.7, 4.2, 0.7), C.stone, { pos: [0, 2.6, 0], outline: 0.03 });
    piece(h, G.octa(0.4), RUNE, { pos: [0, 5.1, 0], scale: [1, 1.5, 1], glow: true, outline: 0.01 });
    f.col(p.x, p.z, 1, 4.6);
    for (let k = 0; k < 5; k++) {
      const [x, z] = f.at(p.rot + 1.2 + k * 0.9, 4.2 + f.rnd() * 1.5);
      if (!nearFolk(p, x, z, 1.5)) {
        const c = f.put(x, z, f.rnd() * 3);
        piece(c, G.box(0.9, 0.9, 0.9), CARGO[k % CARGO.length], { pos: [0, 0.45, 0], outline: 0.015 });
        f.col(x, z, 0.62, 0.9);
      }
    }
    finishDistrict(w, f, { storeys: 0.5 });
  },

  // The crafts quarter: the great workshop behind the smith, forges and a crane.
  crafts(w, p) {
    const f = district(w, p);
    const smith = p.npcs.find((n) => n.role === 'smith');
    const a = smith ? bearingOf(p, smith) : p.rot + Math.PI;
    const [x, z] = f.at(a, 12.5);
    const b = workshop(f.put(x, z, a + Math.PI), f.st, true);
    bodyCol(w, x, z, a + Math.PI, b.wd, b.dp, b.ht);
    f.front.push([a, 0.55]);
    const [cx, cz] = f.at(a + 1.2, 9);
    if (!nearFolk(p, cx, cz, 2)) {
      const c = f.put(cx, cz, a);
      piece(c, G.box(0.6, 11, 0.6), 0xd9a227, { pos: [0, 5.5, 0], outline: 0.03 });
      piece(c, G.box(0.4, 0.4, 7), 0xd9a227, { pos: [0, 10.8, 2.6], outline: 0.02 });
      piece(c, G.cyl(0.03, 0.03, 4, 4), 0x2a2e36, { pos: [0, 8.6, 5.4], outline: 0 });
      piece(c, G.box(1, 0.7, 1), C.metalDark, { pos: [0, 6.3, 5.4], outline: 0.02 });
      f.col(cx, cz, 0.6, 11);
    }
    finishDistrict(w, f, { flat: true });
  },

  // The homes: tall houses round a green with a couple of trees.
  homes(w, p) {
    const f = district(w, p);
    for (const [la, d] of [[Math.PI * 0.5, 4], [-Math.PI * 0.6, 5]]) {
      const [x, z] = f.at(p.rot + la, d);
      if (nearFolk(p, x, z, 2.2)) continue;
      const t = f.put(x, z);
      piece(t, G.cyl(0.22, 0.32, 2.4, 7), C.woodDark, { pos: [0, 1.2, 0], outline: 0.03 });
      piece(t, G.ico(1.6, 0), C.leaf, { pos: [0, 3.4, 0], outline: 0.04 });
      f.col(x, z, 0.4, 3);
    }
    const g = f.put(p.x, p.z);
    piece(g, G.cyl(3.2, 3.2, 0.08, 18), 0x5f9e4c, { pos: [0, 0.04, 0], outline: 0 });
    finishDistrict(w, f, { storeys: 0.85, step: 0.44 });
  },

  // The gate yard: the sealed dungeon and raid gates (built with the services), braziers, and
  // the guards' halls along the sides.
  gates(w, p) {
    const f = district(w, p);
    serviceProps(w, p, f);
    for (const n of p.npcs) if (n.role === 'gate') f.front.push([bearingOf(p, n), 0.9]);
    for (const s of [-1, 1]) {
      const [x, z] = f.at(p.rot + Math.PI + s * 1.5, 6);
      const b = f.put(x, z);
      piece(b, G.cyl(0.45, 0.3, 1.1, 8), C.metalDark, { pos: [0, 0.55, 0], outline: 0.015 });
      piece(b, G.cone(0.38, 0.9, 7), FORGE, { pos: [0, 1.5, 0], glow: true, outline: 0.01 });
      f.col(x, z, 0.5, 1.2);
    }
    finishDistrict(w, f, { flat: true, storeys: 0.2 });
  },
};

// ---------------------------------------------------------------- Brightwater
// The hub grew into a town: round the old camp (the reactor, Tobbin's kiosk, the Warden, Old
// Ysolde — world/World.js buildHub) a ring of new buildings — the workshop, the gunsmith's and the
// armourer's behind their keepers, houses — and walls with gates where the roads come in.
export function buildBrightwater(w, p) {
  const f = site(w, p, p.radius + 4);
  const st = STYLES.temperate;
  const S = p.services;
  const [wx, wz] = f.at(S.workshop, HUB_RING.shop);
  const ws = workshop(f.put(wx, wz, S.workshop + Math.PI), st);
  bodyCol(w, wx, wz, S.workshop + Math.PI, ws.wd, ws.dp, ws.ht);
  for (const [key, sign, goods] of [['guns', FORGE, 'weapons'], ['armour', HEARTH, 'armor']]) {
    const a = S[key];
    const [x, z] = f.at(a, HUB_RING.shop);
    const h = f.put(x, z, a + Math.PI);
    building(h, { wd: 7, dp: 5.5, ht: 3.2, wall: key === 'guns' ? C.steel : st.walls[1], roof: st.roofs[key === 'guns' ? 1 : 0], trim: st.trim, sign, awning: CLOTH[key === 'guns' ? 0 : 2], doorX: 0 });
    stall(sub(h, -2.4, 0, 4.4), CLOTH[key === 'guns' ? 1 : 3], goods);
    bodyCol(w, x, z, a + Math.PI, 7, 5.5, 4.5);
    const ry = a + Math.PI;
    w.addCollider(x + Math.cos(ry) * -2.4 + Math.sin(ry) * 4.4, z - Math.sin(ry) * -2.4 + Math.cos(ry) * 4.4, 1.3, 1.1);
  }
  serviceProps(w, p, f);
  const skip = [[S.workshop, 0.5], [S.guns, 0.45], [S.armour, 0.45], [0, 0.3]];
  houseRing(f, st, HUB_RING.house, { step: 0.33, skip });
  lampRing(f, 16.5, 0.7);
  ringWall(f, p.radius, { ht: 3, thick: 0.6, color: 0xc8d0da, cap: C.metalDark, band: HEARTH, roof: C.metalDark });
  flatten(f.g);
  w.finish(f.g);
}
