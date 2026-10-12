// Endless world generation. Everything here is a pure function of (seed, position), so any part of
// the world can be rebuilt identically at any time and nothing but the seed needs saving.
//   shape     continental basins and lakes, rolling hills, ridged mountain ranges inside a range
//             mask, and rivers along a warped noise's zero line; the hub plain stays gentle
//   climate   temperature / moisture / corruption fields (domain-warped) → biomes
//   regions   the world is cut into Voronoi regions (~REGION apart): each has a name, biome,
//             owning race, danger level (rising with distance from the hub) and its points of
//             interest — camps, a waystone, towers, ruins, mesas, chests, maybe a stronghold —
//             plus roads to its neighbours. Features flatten pads and raise mesas in the terrain.
import { makeNoise2D, fbm, smoothstep } from '../core/noise.js';
import { mulberry32 } from '../core/rng.js';

export const REGION = 240;
export const WATER_LEVEL = -0.9;
export const HUB = { id: 'hub', name: 'Brightwater Outpost', x: 0, z: 0, radius: 15 };

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const hash2 = (a, b, s) => {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(s | 0, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
};

// Which races claim which biomes (weights).
const RACE_BY_BIOME = {
  meadow: { goblin: 0.5, beast: 0.35, construct: 0.15 },
  forest: { beast: 0.55, goblin: 0.3, hollow: 0.15 },
  highland: { construct: 0.5, goblin: 0.35, beast: 0.15 },
  snow: { beast: 0.5, construct: 0.3, hollow: 0.2 },
  marsh: { hollow: 0.6, beast: 0.25, goblin: 0.15 },
  ash: { hollow: 0.55, construct: 0.3, goblin: 0.15 },
  mountain: { construct: 0.45, beast: 0.35, hollow: 0.2 },
};

// Region names: biome-flavoured adjective + landform.
const NAME = {
  meadow: [['Bright', 'Golden', 'Willow', 'Summer', 'Clover', 'Amber', 'Glimmer'], ['Vale', 'Downs', 'Fields', 'Meadow', 'Lea', 'Reach']],
  forest: [['Thorn', 'Elder', 'Moss', 'Bramble', 'Whisper', 'Fern', 'Hollow'], ['wood', 'weald', 'Grove', 'Thicket', 'Tangle', 'Wilds']],
  highland: [['Sun', 'Red', 'Dust', 'Copper', 'Wind', 'Iron', 'Sky'], ['Mesa', 'Steppe', 'Heights', 'Plateau', 'Bluffs', 'Tablelands']],
  snow: [['Frost', 'Rime', 'White', 'Shiver', 'Glacier', 'Pale', 'Winter'], ['fell', 'Reach', 'Barrow', 'Drifts', 'Expanse', 'Crown']],
  marsh: [['Mire', 'Bog', 'Murk', 'Sunken', 'Rot', 'Grey', 'Reed'], ['fen', 'Marsh', 'Sump', 'Mires', 'Slough', 'Shallows']],
  ash: [['Ash', 'Cinder', 'Ember', 'Soot', 'Char', 'Scorch', 'Pyre'], ['fields', 'Barrens', 'Waste', 'Scar', 'Hollows', 'Flats']],
  mountain: [['Storm', 'Grim', 'High', 'Broken', 'Spine', 'Thunder', 'Crag'], ['peak', 'Spires', 'Ridge', 'Teeth', 'Pass', 'Crags']],
};
const CAMP_NAME = {
  goblin: ['Warcamp', 'Scrapyard', 'Raider Camp', 'Junk Fort', 'Snare Den', 'Rustcamp'],
  hollow: ['Bonepit', 'Ossuary', 'Barrow', 'Grave Ring', 'Dead Camp', 'Mournfield'],
  construct: ['Relay Node', 'Foundry Post', 'Signal Spire', 'Assembly Yard', 'Conduit Hub', 'Array'],
  beast: ['Den', 'Lair', 'Hollow', 'Nest', 'Burrows', 'Run'],
};
const STRONGHOLD_NAME = {
  goblin: 'Warlord Fort', hollow: 'Crypt of Kings', construct: 'Colossus Foundry', beast: 'Elder Lair',
};

function weighted(rng, weights) {
  let total = 0;
  for (const w of Object.values(weights)) total += w;
  let r = rng() * total;
  for (const [k, w] of Object.entries(weights)) {
    r -= w;
    if (r <= 0) return k;
  }
  return Object.keys(weights)[0];
}

export class WorldGen {
  constructor(seed) {
    this.seed = seed >>> 0;
    const s = this.seed;
    this.nE = makeNoise2D(s ^ 0x1a2b);
    this.nH = makeNoise2D(s ^ 0x2b3c);
    this.nD = makeNoise2D(s ^ 0x3c4d);
    this.nM = makeNoise2D(s ^ 0x4d5e);
    this.nR = makeNoise2D(s ^ 0x5e6f);
    this.nV = makeNoise2D(s ^ 0x6f70);
    this.nW = makeNoise2D(s ^ 0x7081);
    this.nT = makeNoise2D(s ^ 0x8192);
    this.nQ = makeNoise2D(s ^ 0x92a3);
    this.nC = makeNoise2D(s ^ 0xa3b4);
    this.nB = makeNoise2D(s ^ 0xb4c5);
    this.regions = new Map();
    this.order = [];
  }

  // ------------------------------------------------------------------ shape
  // How "wild" the land is: the hub plain is gentle, the wilds open up beyond it.
  wild(x, z) { return smoothstep(80, 260, Math.hypot(x, z)); }

  mountainMask(x, z) {
    return smoothstep(0.16, 0.42, fbm(this.nM, x * 0.0013 + 31, z * 0.0013 - 17, 3)) * this.wild(x, z);
  }

  // ~0 on a river's centre line, growing away from it.
  riverValue(x, z) {
    const wx = x + fbm(this.nW, x * 0.004, z * 0.004, 2) * 60;
    const wz = z + fbm(this.nW, z * 0.004 + 9, x * 0.004, 2) * 60;
    return fbm(this.nV, wx * 0.0024, wz * 0.0024, 2);
  }

  // Terrain before features (pads, mesas): what POIs are placed against.
  baseHeight(x, z) {
    const wild = this.wild(x, z);
    const cont = fbm(this.nE, x * 0.0019, z * 0.0019, 4);
    // Basins dip below the water line only where the continental field is lowest (lakes, not seas).
    let h = (cont > -0.15 ? cont * 13 : -1.95 + (cont + 0.15) * 26) * (0.4 + 0.6 * wild) + 3;
    h += fbm(this.nH, x * 0.011, z * 0.011, 3) * 6.5 * (0.45 + 0.55 * wild);
    h += this.nD(x * 0.06, z * 0.06) * 0.55;
    const mm = this.mountainMask(x, z);
    if (mm > 0.001) {
      let r = 0;
      let amp = 1;
      let norm = 0;
      let fx = x * 0.0042;
      let fz = z * 0.0042;
      for (let o = 0; o < 4; o++) {
        const n = 1 - Math.abs(this.nR(fx, fz));
        r += n * n * amp;
        norm += amp;
        amp *= 0.5;
        fx *= 2.03;
        fz *= 2.03;
      }
      h += mm * (14 + (r / norm) * 62);
    }
    // Rivers: a wide shallow valley with a channel below the water line.
    const rv = Math.abs(this.riverValue(x, z));
    const rw = wild * (1 - mm);
    if (rw > 0.001 && rv < 0.2) {
      h = lerp(h, Math.min(h, WATER_LEVEL + 1.4), smoothstep(0.2, 0.06, rv) * 0.7 * rw);
      h = lerp(h, WATER_LEVEL - 2.1, smoothstep(0.05, 0.015, rv) * rw);
    }
    return h;
  }

  // Final terrain height: base + mesas + flattened pads (camps, waystones, towers, strongholds,
  // the hub). Features come from the regions around (x, z).
  height(x, z) {
    let h = this.baseHeight(x, z);
    const feats = this.featuresNear(x, z);
    for (const m of feats.mesas) {
      const d = Math.hypot(x - m.x, z - m.z);
      if (d > m.r + 36) continue;
      let k = smoothstep(m.r + 4.5, m.r, d);
      if (m.ramp !== null) {
        const a = Math.abs(Math.atan2(Math.sin(Math.atan2(z - m.z, x - m.x) - m.ramp), Math.cos(Math.atan2(z - m.z, x - m.x) - m.ramp)));
        k = Math.max(k, smoothstep(m.r + 34, m.r, d) * smoothstep(0.34, 0.2, a));
      }
      h += (Math.max(h, m.top) - h) * k;
    }
    for (const p of feats.pads) {
      const d = Math.hypot(x - p.x, z - p.z);
      if (d < p.r + p.fall) h += (p.h - h) * smoothstep(p.r + p.fall, p.r, d);
    }
    return h;
  }

  // ------------------------------------------------------------------ climate / biomes
  climate(x, z) {
    const wx = x + fbm(this.nB, x * 0.006, z * 0.006, 2) * 45;
    const wz = z + fbm(this.nB, z * 0.006 + 5, x * 0.006, 2) * 45;
    const near = 1 - smoothstep(150, 420, Math.hypot(x, z)); // temperate around the hub
    const t = fbm(this.nT, wx * 0.0019, wz * 0.0019, 3) * (1 - near * 0.8);
    const m = fbm(this.nQ, wx * 0.0021 + 40, wz * 0.0021, 3);
    const c = fbm(this.nC, wx * 0.0016, wz * 0.0016 + 70, 3) * (1 - near);
    return { t, m, c };
  }

  biomeAt(x, z) {
    if (this.mountainMask(x, z) > 0.55) return 'mountain';
    const { t, m, c } = this.climate(x, z);
    if (t < -0.3) return 'snow';
    if (c > 0.33) return 'ash';
    if (m > 0.3 && this.baseHeight(x, z) < 4) return 'marsh';
    if (t > 0.18 && m < -0.12) return 'highland';
    if (m > 0.02) return 'forest';
    return 'meadow';
  }

  isWaterAt(x, z) { return this.height(x, z) < WATER_LEVEL - 0.15; }

  // ------------------------------------------------------------------ regions
  cellOf(x, z) { return [Math.round(x / REGION), Math.round(z / REGION)]; }

  site(rx, rz) {
    if (rx === 0 && rz === 0) return [0, 0];
    const h = hash2(rx, rz, this.seed);
    const jx = ((h & 0xffff) / 0xffff - 0.5) * 0.6;
    const jz = ((h >>> 16) / 0xffff - 0.5) * 0.6;
    return [(rx + jx) * REGION, (rz + jz) * REGION];
  }

  // Region (Voronoi cell) owning a point.
  regionAt(x, z) {
    const [cx, cz] = this.cellOf(x, z);
    let best = null;
    let bd = Infinity;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const [sx, sz] = this.site(cx + dx, cz + dz);
        const d = (x - sx) * (x - sx) + (z - sz) * (z - sz);
        if (d < bd) { bd = d; best = [cx + dx, cz + dz]; }
      }
    }
    return this.region(best[0], best[1]);
  }

  // Regions whose features might reach (x, z): the 3×3 cells around it.
  regionsNear(x, z, out = []) {
    out.length = 0;
    const [cx, cz] = this.cellOf(x, z);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) out.push(this.region(cx + dx, cz + dz));
    return out;
  }

  featuresNear(x, z) {
    const [cx, cz] = this.cellOf(x, z);
    const key = cx * 100003 + cz;
    if (this._featKey === key) return this._feat;
    const mesas = [];
    const pads = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const r = this.region(cx + dx, cz + dz);
        mesas.push(...r.mesas);
        pads.push(...r.pads);
      }
    }
    this._featKey = key;
    this._feat = { mesas, pads };
    return this._feat;
  }

  region(rx, rz) {
    const key = `${rx},${rz}`;
    let r = this.regions.get(key);
    if (r) return r;
    r = this.buildRegion(rx, rz, key);
    this.regions.set(key, r);
    this.order.push(key);
    if (this.order.length > 400) this.regions.delete(this.order.shift());
    return r;
  }

  slopeBase(x, z) {
    const e = 2;
    return Math.hypot(this.baseHeight(x + e, z) - this.baseHeight(x - e, z), this.baseHeight(x, z + e) - this.baseHeight(x, z - e)) / (2 * e);
  }

  // Is (x, z) inside region (rx, rz)'s Voronoi cell?
  owns(rx, rz, x, z) {
    const [sx, sz] = this.site(rx, rz);
    const d0 = (x - sx) * (x - sx) + (z - sz) * (z - sz);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        if (!dx && !dz) continue;
        const [ox, oz] = this.site(rx + dx, rz + dz);
        if ((x - ox) * (x - ox) + (z - oz) * (z - oz) < d0) return false;
      }
    }
    return true;
  }

  buildRegion(rx, rz, key) {
    const rng = mulberry32(hash2(rx, rz, this.seed ^ 0x51ed));
    const [sx, sz] = this.site(rx, rz);
    const hub = rx === 0 && rz === 0;
    const dist = Math.hypot(sx, sz);
    const biome = hub ? 'meadow' : this.biomeAt(sx, sz);
    const ring = Math.max(Math.abs(rx), Math.abs(rz));
    let race = weighted(rng, RACE_BY_BIOME[biome]);
    if (ring <= 1 && (race === 'hollow' || race === 'construct')) race = rng() < 0.6 ? 'goblin' : 'beast';
    const level = hub ? 1 : Math.max(1, Math.round(1 + dist / 130 + (rng() - 0.5) * 0.8));
    const [adj, noun] = NAME[biome];
    const a = adj[Math.floor(rng() * adj.length)];
    const n = noun[Math.floor(rng() * noun.length)];
    const name = hub ? 'Brightwater Vale' : /^[a-z]/.test(n) ? a + n : `${a} ${n}`;
    const region = { key, rx, rz, x: sx, z: sz, biome, race, level, name, hub, pois: [], mesas: [], pads: [], roads: [], roadCells: new Set() };

    // Candidate spots inside the region, on dry, gentle, non-mountain ground, apart from each other.
    const taken = [];
    const free = (x, z, gap) => taken.every((t) => Math.hypot(t.x - x, t.z - z) > gap + t.r);
    const spot = (minGap, { r = 6, maxSlope = 0.45, near = null, tries = 60, minHub = 70 } = {}) => {
      for (let i = 0; i < tries; i++) {
        let x;
        let z;
        if (near) {
          const ang = rng() * Math.PI * 2;
          const d = near.min + rng() * (near.max - near.min);
          x = near.x + Math.cos(ang) * d;
          z = near.z + Math.sin(ang) * d;
        } else {
          x = sx + (rng() - 0.5) * REGION * 1.1;
          z = sz + (rng() - 0.5) * REGION * 1.1;
        }
        if (!this.owns(rx, rz, x, z)) continue;
        if (Math.hypot(x, z) < minHub) continue;
        const h = this.baseHeight(x, z);
        if (h < WATER_LEVEL + 0.8) continue;
        if (this.mountainMask(x, z) > 0.35) continue;
        if (this.slopeBase(x, z) > maxSlope) continue;
        if (!free(x, z, minGap)) continue;
        taken.push({ x, z, r });
        return { x, z, h };
      }
      return null;
    };
    const pad = (x, z, r, h, fall = 12, dirt = false) => region.pads.push({ x, z, r, h, fall, dirt });

    if (hub) {
      taken.push({ x: 0, z: 0, r: 40 });
      pad(0, 0, HUB.radius + 3, 0, 20, true);
      region.pois.push({ type: 'hub', id: 'hub', x: 0, z: 0, radius: HUB.radius, name: HUB.name });
      region.pois.push({ type: 'waystone', id: 'w-hub', x: 0, z: 18, name: 'Brightwater' });
      pad(0, 18, 3, 0, 6);
    } else {
      const w = this.waystoneSpot(rx, rz);
      if (w) {
        const h = this.baseHeight(w.x, w.z);
        taken.push({ x: w.x, z: w.z, r: 4 });
        region.pois.push({ type: 'waystone', id: `w:${key}`, x: w.x, z: w.z, name: region.name });
        pad(w.x, w.z, 3, h, 6);
      }
    }

    // Camps (and maybe a stronghold) of the owning race.
    const campStyle = { goblin: 'goblin', hollow: 'grave', construct: 'relay', beast: 'den' }[race];
    const camps = hub ? 1 : 2 + (rng() < 0.45 ? 1 : 0);
    const names = [...CAMP_NAME[race]];
    for (let i = 0; i < camps; i++) {
      const R = 10 + Math.floor(rng() * 4);
      const c = spot(42, { r: R + 6, maxSlope: 0.35, minHub: hub ? 55 : 70 });
      if (!c) continue;
      const nm = names.splice(Math.floor(rng() * names.length), 1)[0];
      region.pois.push({
        type: 'camp', id: `c:${key}:${i}`, x: c.x, z: c.z, radius: R, race, style: rng() < 0.25 && race === 'goblin' ? 'ogre' : campStyle,
        level: level + (rng() < 0.35 ? 1 : 0), name: `${region.name.split(' ')[0]} ${nm}`, seed: Math.floor(rng() * 1e9),
      });
      pad(c.x, c.z, R + 2, c.h, 11, true);
    }
    if (!hub && level >= 4 && rng() < 0.28) {
      const c = spot(50, { r: 24, maxSlope: 0.3 });
      if (c) {
        region.pois.push({
          type: 'camp', id: `s:${key}`, x: c.x, z: c.z, radius: 15, race, style: 'fort', stronghold: true,
          level: level + 2, name: `${region.name} ${STRONGHOLD_NAME[race]}`, seed: Math.floor(rng() * 1e9),
        });
        pad(c.x, c.z, 19, c.h, 14, true);
      }
    }

    // Verticality: mesas (rugged biomes favour them), a tower, ruins — with chests up top.
    let chestN = 0;
    const chest = (x, z, extra = {}) => region.pois.push({ type: 'chest', id: `k:${key}:${chestN++}`, x, z, level: level + (extra.bonus ?? 0), ...extra });
    const mesaN = (biome === 'highland' ? 2 : biome === 'meadow' || biome === 'ash' ? 1 : rng() < 0.4 ? 1 : 0) - (hub ? 1 : 0);
    for (let i = 0; i < mesaN; i++) {
      const r = 9 + rng() * 15;
      const c = spot(30, { r: r + 10, maxSlope: 0.5 });
      if (!c) continue;
      const hgt = 6 + rng() * 7;
      const m = { x: c.x, z: c.z, r, h: hgt, top: c.h + hgt, ramp: r > 14 && rng() < 0.7 ? rng() * Math.PI * 2 : null };
      region.mesas.push(m);
      region.pois.push({ type: 'mesa', id: `m:${key}:${i}`, ...m });
      if (rng() < 0.7) chest(c.x, c.z, { onMesa: true, bonus: 1 });
    }
    if (rng() < (hub ? 1 : 0.55)) {
      const t = hub ? spot(15, { r: 6, near: { x: 30, z: 26, min: 0, max: 12 }, minHub: 20 }) : spot(25, { r: 6 });
      if (t) {
        const id = `t:${key}`;
        region.pois.push({ type: 'tower', id, x: t.x, z: t.z, h: 5.5 + rng() * 2 });
        pad(t.x, t.z, 4, t.h, 6);
        chest(t.x, t.z, { on: id, bonus: 1 });
      }
    }
    if (!hub && rng() < 0.4) {
      const r = 9 + rng() * 3;
      const c = spot(25, { r: r + 4, maxSlope: 0.35 });
      if (c) {
        const id = `r:${key}`;
        region.pois.push({ type: 'ruin', id, x: c.x, z: c.z, r });
        pad(c.x, c.z, r + 1, c.h, 8);
        chest(c.x, c.z, { ruin: id, bonus: 1 });
      }
    }
    // A cache or two hidden in the wilds.
    for (let i = 0, n = hub ? 0 : 1 + (rng() < 0.5 ? 1 : 0); i < n; i++) {
      const c = spot(15, { r: 2 });
      if (c) chest(c.x, c.z);
    }

    this.buildRoads(region);
    return region;
  }

  // ------------------------------------------------------------------ roads
  // Each region draws its roads east and north to neighbouring waystones (so every pair is drawn
  // once), plus spurs from its waystone to its camps and landmarks.
  buildRoads(region) {
    const way = region.pois.find((p) => p.type === 'waystone');
    if (!way) return;
    const rng = mulberry32(hash2(region.rx, region.rz, this.seed ^ 0xa0ad));
    const stops = [];
    for (const [dx, dz] of [[1, 0], [0, 1]]) {
      const n = this.peekWaystone(region.rx + dx, region.rz + dz);
      if (n) stops.push(n);
    }
    for (const p of region.pois) {
      if (p.type === 'camp' || p.type === 'tower' || p.type === 'ruin' || p.type === 'hub') stops.push({ x: p.x, z: p.z, inset: (p.radius ?? p.r ?? 3) * 0.7 });
    }
    for (const s of stops) {
      const pts = this.roadPath(way, s, rng);
      if (pts.length < 2) continue;
      region.roads.push(pts);
      for (const [x, z] of pts) region.roadCells.add(`${Math.floor(x / 4)},${Math.floor(z / 4)}`);
    }
  }

  // A neighbour's waystone without building the whole neighbour (which would recurse).
  peekWaystone(rx, rz) {
    if (rx === 0 && rz === 0) return { x: 0, z: 18 };
    return this.waystoneSpot(rx, rz);
  }

  // Where a region's waystone stands: near its site, on dry gentle ground. Its own seeded stream,
  // so a region and its neighbours (drawing roads to it) always agree.
  waystoneSpot(rx, rz) {
    const rng = mulberry32(hash2(rx, rz, this.seed ^ 0x77e1));
    const [sx, sz] = this.site(rx, rz);
    for (let i = 0; i < 40; i++) {
      const a = rng() * Math.PI * 2;
      const d = rng() * 60;
      const x = sx + Math.cos(a) * d;
      const z = sz + Math.sin(a) * d;
      if (this.baseHeight(x, z) > WATER_LEVEL + 0.8 && this.mountainMask(x, z) < 0.35 && this.slopeBase(x, z) < 0.45) return { x, z };
    }
    return null;
  }

  roadPath(a, b, rng) {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const L = Math.hypot(dx, dz);
    if (L < 8 || L > REGION * 1.8) return [];
    const nx = -dz / L;
    const nz = dx / L;
    const wob1 = (rng() - 0.5) * L * 0.18;
    const wob2 = (rng() - 0.5) * L * 0.12;
    const out = [];
    const steps = Math.ceil(L / 2.5);
    const inset = b.inset ?? 0;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      if (L * (1 - t) < inset) break;
      const bend = Math.sin(Math.PI * t) * wob1 + Math.sin(Math.PI * 2 * t) * wob2;
      const x = a.x + dx * t + nx * bend;
      const z = a.z + dz * t + nz * bend;
      // Roads skip stretches of water and mountain (fords and passes are left to the player).
      if (this.baseHeight(x, z) < WATER_LEVEL + 0.2 || this.mountainMask(x, z) > 0.45) {
        if (out.length > 1) break;
        out.length = 0;
        continue;
      }
      out.push([x, z]);
    }
    return out;
  }

  nearRoad(x, z) {
    const ix = Math.floor(x / 4);
    const iz = Math.floor(z / 4);
    const regions = this.regionsNear(x, z, this._rn ??= []);
    for (const r of regions) {
      if (!r.roadCells.size) continue;
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if (r.roadCells.has(`${ix + a},${iz + b}`)) return true;
    }
    return false;
  }
}
