// Endless world generation. Everything here is a pure function of (seed, position), so any part of
// the world can be rebuilt identically at any time and nothing but the seed needs saving.
//   shape     continental basins and lakes; hills that roll gently round the hub and stand up into
//             ridgelines in rugged country; ridged mountain ranges inside a range mask; rivers along
//             a warped noise's zero line — and landforms by climate (blended, so the land stays
//             continuous across borders): dune seas in the deserts, plateaus stepped into terraces
//             and cut by canyons in the badlands
//   climate   temperature / moisture / strangeness fields (domain-warped) → twelve biomes
//   regions   the world is cut into Voronoi regions (~REGION apart): each has a name, biome,
//             owning race, danger level (rising with distance from the hub) and its points of
//             interest — a waystone (often with a friendly village built round it, so it sits on
//             the roads), a landmark, camps, maybe a stronghold, mesas, towers, ruins, chests and a
//             hamlet — plus roads to its neighbours. Features flatten pads and raise mesas in the
//             terrain.
//   places    settlements of every size (world/places.js): hamlets off the roads in most regions,
//             villages at a third of the waystones, a walled town at about one waystone in nine
//             (one per region and the ring round it), and the four story cities — one at the heart
//             of each act's lands, in districts. Brightwater, at the hub, is a town.
import { makeNoise2D, fbm, smoothstep } from '../core/noise.js';
import { mulberry32 } from '../core/rng.js';
import { SIZES, CITIES, CITY_WALL, HAMLETS, planHamlet, dressVillage, planTown, planCity, planHub, hamletName, townName, pathBearing } from './places.js';
import { storyPlaces, storyIn } from './story.js';
import { TIERS, campLayout } from './campLayout.js';

export const REGION = 240;
export const WATER_LEVEL = -0.9;
export const HUB = { id: 'hub', name: 'Brightwater', x: 0, z: 0, radius: 30 };
export const BIOMES = ['meadow', 'forest', 'highland', 'snow', 'marsh', 'ash', 'mountain', 'desert', 'badlands', 'jungle', 'crystal', 'fungal'];

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const hash2 = (a, b, s) => {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(s | 0, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
};
const pick = (rng, list) => list[Math.floor(rng() * list.length)];

// Which races (factions) claim which biomes (weights).
const RACE_BY_BIOME = {
  meadow: { scav: 0.5, fauna: 0.35, synth: 0.15 },
  forest: { fauna: 0.55, scav: 0.3, hive: 0.15 },
  highland: { synth: 0.5, scav: 0.35, fauna: 0.15 },
  snow: { fauna: 0.5, synth: 0.3, hive: 0.2 },
  marsh: { hive: 0.6, fauna: 0.25, scav: 0.15 },
  ash: { hive: 0.55, synth: 0.3, scav: 0.15 },
  mountain: { synth: 0.45, fauna: 0.35, hive: 0.2 },
  desert: { scav: 0.45, synth: 0.35, fauna: 0.2 },
  badlands: { scav: 0.5, synth: 0.3, fauna: 0.2 },
  jungle: { fauna: 0.6, hive: 0.25, scav: 0.15 },
  crystal: { synth: 0.55, hive: 0.3, fauna: 0.15 },
  fungal: { hive: 0.5, fauna: 0.35, scav: 0.15 },
};

// The act lands: rings out from the hub, one per act of the story, their borders bent by noise
// and taken whole region by whole region. `to` is the (warped) distance each runs out to; its
// levels follow from level ≈ 1 + distance / 130.
export const ACTS = [
  { act: 1, to: 1000, levels: [1, 8], name: 'Scav country' },
  { act: 2, to: 2000, levels: [8, 16], name: 'Hive country' },
  { act: 3, to: 3000, levels: [16, 24], name: 'Synth country' },
  { act: 4, to: Infinity, levels: [24, 30], name: 'The Maker lands' },
];
const ACT_WARP = 150;
// Which factions each act's lands may hold, and how much more (or less) than their biome says.
export const RACE_BY_ACT = {
  1: { scav: 1, fauna: 1 },
  2: { hive: 2.5, scav: 1, fauna: 1 },
  3: { synth: 3, hive: 1, scav: 0.6, fauna: 0.8 },
  4: { synth: 1, hive: 1, scav: 1, fauna: 1 },
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
  desert: [['Sun', 'Dune', 'Sand', 'Glass', 'Mirage', 'Bleach', 'Salt'], ['Sea', 'Wastes', 'Expanse', 'Flats', 'Dunes', 'Basin']],
  badlands: [['Red', 'Rust', 'Broken', 'Ochre', 'Dust', 'Scour', 'Sunder'], ['Canyons', 'Badlands', 'Gulch', 'Mesas', 'Breaks', 'Gorge']],
  jungle: [['Verdant', 'Tangle', 'Emerald', 'Steam', 'Vine', 'Lush', 'Drowned'], ['Jungle', 'Canopy', 'Tangle', 'Wilds', 'Deeps', 'Green']],
  crystal: [['Prism', 'Shard', 'Glass', 'Gleam', 'Lattice', 'Quartz', 'Halo'], ['Fields', 'Spires', 'Expanse', 'Reach', 'Garden', 'Shelf']],
  fungal: [['Spore', 'Glow', 'Mycel', 'Bloom', 'Puff', 'Velvet', 'Dusk'], ['wood', 'Grove', 'Hollows', 'Caps', 'Thicket', 'Gardens']],
};
const CAMP_NAME = {
  scav: ['Warcamp', 'Scrapyard', 'Raider Camp', 'Junk Fort', 'Chop Shop', 'Rustcamp'],
  hive: ['Brood Pit', 'Spawning Mound', 'Hive Node', 'Egg Field', 'Creep', 'Chitin Spire'],
  synth: ['Relay Node', 'Foundry Post', 'Signal Spire', 'Assembly Yard', 'Conduit Hub', 'Array'],
  fauna: ['Den', 'Lair', 'Hollow', 'Nest', 'Burrows', 'Run'],
};
const STRONGHOLD_NAME = {
  scav: 'Warlord Fort', hive: 'Queen\'s Hive', synth: 'Colossus Foundry', fauna: 'Behemoth Lair',
};

// Landmarks: one-off sights, about one a region. Which biomes favour each (weights), footprint
// radius (m), whether the ground is levelled under it, the steepest ground it will stand on, the
// first region ring it can appear in, where its cache sits (local, metres; +z is the landmark's
// front) and its names. world/World.js builds them.
export const LANDMARKS = {
  wreck: {
    biomes: { meadow: 1, highland: 1.2, desert: 1.4, badlands: 1, snow: 1, ash: 0.6, crystal: 0.6 }, r: 22, pad: true, slope: 0.3, chest: [7, -2],
    name: (r) => `Wreck of the ${pick(r, ['Halcyon', 'Meridian', 'Pilgrim', 'Starward', 'Covenant', 'Icarus', 'Long Night', 'Vesper', 'Argo'])}`,
  },
  skeleton: {
    biomes: { desert: 1.6, badlands: 1, ash: 1.2, snow: 0.8, highland: 0.5 }, r: 18, slope: 0.4, chest: [0, 3],
    name: (r) => `${pick(r, ['The Leviathan', 'The Old Wyrm', 'The Behemoth', 'The Colossus', 'The Sky Whale'])}'s Bones`,
  },
  ring: {
    biomes: { crystal: 1.6, meadow: 0.7, highland: 0.8, forest: 0.4, snow: 0.6, desert: 0.6 }, r: 12, pad: true, slope: 0.4, chest: [0, 5],
    name: (r) => `${pick(r, ['Ring', 'Gate', 'Halo', 'Circle'])} of ${pick(r, ['Ages', 'the Makers', 'Echoes', 'Dawn', 'the First', 'Stars'])}`,
  },
  titan: {
    biomes: { highland: 1.2, badlands: 1.2, ash: 1, snow: 0.8, meadow: 0.5, desert: 0.6 }, r: 12, slope: 0.4, chest: [0, 6],
    name: (r) => `The ${pick(r, ['Sleeping', 'Kneeling', 'Silent', 'Shattered', 'Broken', 'Last'])} Titan`, // (not 'Fallen': the story's own, world/story.js)
  },
  monoliths: {
    biomes: { meadow: 1.2, forest: 1, marsh: 0.8, highland: 0.6, snow: 0.5 }, r: 11, pad: true, slope: 0.35, chest: [0, 0],
    name: (r) => `The ${pick(r, ['Whispering', 'Singing', 'Old', 'Watching', 'Hollow', 'Dreaming'])} Stones`,
  },
  spires: {
    biomes: { crystal: 2, snow: 0.8, mountain: 0.6, highland: 0.4 }, r: 14, slope: 0.5, chest: [0, 0],
    name: (r) => `${pick(r, ['Prism', 'Glass', 'Singing', 'Halo', 'Frost', 'Starfall'])} Spires`,
  },
  elder: {
    biomes: { forest: 1.4, jungle: 1.4, marsh: 0.8, meadow: 0.5 }, r: 14, pad: true, slope: 0.35, chest: [0, 6],
    name: (r) => `The ${pick(r, ['Elder', 'Mother', 'Old', 'Great', 'First', 'Hollow'])} Tree`,
  },
  caps: {
    biomes: { fungal: 2, marsh: 0.8, jungle: 0.7, forest: 0.3 }, r: 14, slope: 0.45, chest: [0, 0],
    name: (r) => `${pick(r, ["Giant's", 'Glowcap', 'Velvet', 'Elder', 'Dusk', 'Moonlit'])} Caps`,
  },
  array: {
    biomes: { highland: 1.2, meadow: 0.9, snow: 1, desert: 0.8, badlands: 0.6, mountain: 0.4 }, r: 13, pad: true, slope: 0.3, chest: [-5, 6],
    name: (r) => `${pick(r, ['Deep Sky', 'Listening', 'Echo', 'Vigil', 'Long Range', 'Far Sky'])} Array`,
  },
  arcology: {
    biomes: { marsh: 1.4, jungle: 1.2, forest: 0.8, meadow: 0.6, fungal: 0.6 }, r: 18, slope: 0.4, chest: [0, 0],
    name: (r) => `Ruins of ${pick(r, ['Arcadia', 'New Haven', 'Solace', 'Tessaly', 'Concord', 'Meridia', 'Ostrava'])}`,
  },
  arch: {
    biomes: { badlands: 2, desert: 1.4, highland: 0.6 }, r: 14, slope: 0.6, chest: [0, 0],
    name: (r) => `${pick(r, ['Sun', 'Sky', 'Wind', 'Red', "Giant's", 'Hollow'])} Arch`,
  },
  statue: {
    biomes: { meadow: 1, desert: 1, forest: 0.6, highland: 0.6, jungle: 0.6, snow: 0.5 }, r: 12, slope: 0.4, chest: [5, 3],
    name: (r) => `The ${pick(r, ['Fallen', 'Last', 'Forgotten', 'Weeping', 'Broken'])} ${pick(r, ['King', 'Queen', 'Pilot', 'Founder', 'Guardian', 'Prophet'])}`,
  },
  vents: {
    biomes: { ash: 2.2, badlands: 0.4, mountain: 0.3 }, r: 13, slope: 0.5, chest: [0, 0],
    name: (r) => `${pick(r, ['Ember', 'Cinder', 'Smoke', 'Brimstone', 'Furnace'])} Vents`,
  },
  elevator: {
    biomes: { meadow: 0.25, highland: 0.3, desert: 0.3, badlands: 0.25, snow: 0.2, crystal: 0.3, forest: 0.15, jungle: 0.15, marsh: 0.1, ash: 0.15, fungal: 0.1 },
    r: 12, pad: true, slope: 0.3, minRing: 2, chest: [0, 9],
    name: (r) => `The ${pick(r, ['Skyward', 'Severed', 'Endless', 'Broken', 'Silver'])} Tether`,
  },
};

// Friendly settlements, built round a region's waystone: which biomes favour each kind, and how
// likely one keeps a trader. Their folk are placed here (the server checks traders' positions);
// world/World.js builds the place and the client dresses its people (world/settlements.js).
export const SETTLEMENTS = {
  homestead: {
    biomes: { meadow: 1.4, forest: 1, jungle: 0.6, highland: 0.6, fungal: 0.3 }, trader: 0.45,
    name: (r) => `${pick(r, ['Harrow', 'Okafor', 'Lindqvist', 'Tanaka', 'Moreau', 'Vasquez', 'Brennan', 'Adeyemi', 'Kowal'])} Homestead`,
  },
  outpost: {
    biomes: { highland: 1, snow: 1.2, desert: 0.8, badlands: 1, ash: 0.8, mountain: 0.8, crystal: 0.6, meadow: 0.4 }, trader: 0.85,
    name: (r) => `Fort ${pick(r, ['Vigil', 'Hale', 'Resolve', 'Kessler', 'Dawn', 'Ardent', 'Haven'])}`,
  },
  mining: {
    biomes: { badlands: 1.4, crystal: 1.4, mountain: 1, ash: 1, snow: 0.6, highland: 0.6 }, trader: 0.6,
    name: (r) => `${pick(r, ['Deepcut', 'Glitter', 'Rockjaw', 'Seam', 'Lodestar', 'Brightvein'])} Mine`,
  },
  caravan: {
    biomes: { desert: 2, badlands: 0.8, highland: 0.8, meadow: 0.5 }, trader: 1,
    name: (r) => `${pick(r, ['Wandering', 'Dust', 'Long Road', 'Sandsail', 'Drifter', 'Sunrunner'])} Caravan`,
  },
  stilts: {
    biomes: { marsh: 2, jungle: 1.2, fungal: 0.8 }, trader: 0.5,
    name: (r) => pick(r, ['Reedwater', 'Stillwater', 'Heron Rest', 'Mistwater', 'Lanternfen', 'Bogholm']),
  },
};
export const SETTLEMENT_RADIUS = 18;

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
// Weights of each entry of `table` for a biome (and ring), leaving out the ones it can't have.
function affinity(table, biome, ring) {
  const out = {};
  for (const [k, def] of Object.entries(table)) {
    const w = def.biomes[biome] ?? 0;
    if (w > 0 && ring >= (def.minRing ?? 0)) out[k] = w;
  }
  return out;
}
const NO_LANDFORM = { dune: 0, terrace: 0 };

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
    this.nG = makeNoise2D(s ^ 0xc5d6);
    this.nK = makeNoise2D(s ^ 0xd6e7);
    this.nU = makeNoise2D(s ^ 0xe7f8);
    this.nA = makeNoise2D(s ^ 0xac75);
    this.regions = new Map();
    this.order = [];
    this._cx = NaN;
    this._cz = NaN;
    this._clim = { t: 0, m: 0, c: 0 };
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

  // How the land is shaped here, from the climate — blended, so the ground stays continuous across
  // biome borders: dunes in the deserts, terraced plateaus in the badlands (weights 0..1 that
  // reach 1 inside those biomes; see biomeAt).
  landform(x, z) {
    const { t, m } = this.climate(x, z);
    const dune = smoothstep(0.16, 0.24, t) * smoothstep(-0.11, -0.19, m);
    const dry = smoothstep(0.06, 0.14, t) * smoothstep(0.01, -0.07, m);
    return { dune, terrace: dry * (1 - dune) };
  }

  // Terrain before features (pads, mesas): what POIs are placed against.
  baseHeight(x, z) {
    const wild = this.wild(x, z);
    const cont = fbm(this.nE, x * 0.0019, z * 0.0019, 4);
    // Basins dip below the water line only where the continental field is lowest (lakes, not seas).
    let h = (cont > -0.15 ? cont * 13 : -1.95 + (cont + 0.15) * 26) * (0.4 + 0.6 * wild) + 3;
    // Rugged country: hills stand taller and ridgelines run across them; plains stay plain.
    const rug = smoothstep(-0.12, 0.38, fbm(this.nG, x * 0.0011 + 7, z * 0.0011 - 3, 2)) * wild;
    const { dune, terrace } = wild > 0 ? this.landform(x, z) : NO_LANDFORM;
    h += fbm(this.nH, x * 0.011, z * 0.011, 3) * 6.5 * (0.45 + 0.55 * wild) * (0.8 + 1.1 * rug + 0.9 * terrace) * (1 - 0.6 * dune);
    h += this.nD(x * 0.06, z * 0.06) * 0.55;
    if (rug > 0.02) {
      let r = 0;
      let amp = 1;
      let norm = 0;
      let fx = x * 0.0055 + 13;
      let fz = z * 0.0055 - 29;
      for (let o = 0; o < 3; o++) {
        const n = 1 - Math.abs(this.nR(fx, fz));
        r += n * n * amp;
        norm += amp;
        amp *= 0.5;
        fx *= 2.07;
        fz *= 2.07;
      }
      h += rug * (1 - dune) * Math.pow(r / norm, 1.6) * 26;
    }
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
    // Dune seas: long windward slopes up to a crest and a short slip face, meandering across the
    // sand, taller in some fields than others.
    if (dune > 0.01) {
      const u = (x * 0.83 + z * 0.56) / 34 + fbm(this.nU, x * 0.005, z * 0.005, 2) * 2.4;
      const s = u - Math.floor(u);
      const crest = s < 0.7 ? smoothstep(0, 0.7, s) : 1 - smoothstep(0.7, 1, s);
      const amp = 2.5 + 3.5 * (0.5 + 0.5 * this.nU(x * 0.004 + 9, z * 0.004 - 2));
      h += dune * (crest * amp + this.nU(x * 0.05, z * 0.05) * 0.35);
    }
    // Badlands: winding canyons cut first, then the land lifted and stepped into flat treads with
    // steep risers — so the canyon walls step too.
    if (terrace > 0.01) {
      const wx = x + fbm(this.nK, z * 0.004, x * 0.004 + 3, 2) * 50;
      const wz = z + fbm(this.nK, x * 0.004 - 5, z * 0.004, 2) * 50;
      const cv = Math.abs(fbm(this.nK, wx * 0.0026 + 11, wz * 0.0026 - 7, 2));
      if (cv < 0.075) h -= 15 * smoothstep(0.075, 0.03, cv) * terrace;
      const step = 3.4;
      const k = (h + 5) / step;
      const f = k - Math.floor(k);
      h = lerp(h, (Math.floor(k) + smoothstep(0.6, 0.9, f)) * step, terrace);
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

  // Final terrain height: base + mesas + flattened pads (settlements, camps, waystones, towers,
  // strongholds, levelled landmarks, the hub). Features come from the regions around (x, z).
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
  // Remembers the last point asked about: a chunk asks for the climate (biome, landform) of the
  // same spot several times in a row.
  climate(x, z) {
    if (x === this._cx && z === this._cz) return this._clim;
    const wx = x + fbm(this.nB, x * 0.006, z * 0.006, 2) * 45;
    const wz = z + fbm(this.nB, z * 0.006 + 5, x * 0.006, 2) * 45;
    const near = 1 - smoothstep(150, 420, Math.hypot(x, z)); // temperate around the hub
    const c = this._clim;
    c.t = fbm(this.nT, wx * 0.0019, wz * 0.0019, 3) * (1 - near * 0.8);
    c.m = fbm(this.nQ, wx * 0.0021 + 40, wz * 0.0021, 3);
    c.c = fbm(this.nC, wx * 0.0016, wz * 0.0016 + 70, 3) * (1 - near);
    this._cx = x;
    this._cz = z;
    return c;
  }

  // Cold → snow; strange → ash (hot), fungal groves (wet) or crystal fields; wet lowland → marsh;
  // hot and dry → desert, then badlands; hot and wet → jungle; dry → highland steppe; wet →
  // forest; otherwise meadow. Mountains wherever the range mask peaks.
  biomeAt(x, z) {
    if (this.mountainMask(x, z) > 0.55) return 'mountain';
    const { t, m, c } = this.climate(x, z);
    if (t < -0.3) return 'snow';
    if (c > 0.27) return t > 0.12 ? 'ash' : m > 0.04 ? 'fungal' : 'crystal';
    if (m > 0.3 && this.baseHeight(x, z) < 4) return 'marsh';
    if (t > 0.2 && m < -0.15) return 'desert';
    if (t > 0.1 && m < -0.03) return 'badlands';
    if (t > 0.14 && m > 0.16) return 'jungle';
    if (t > -0.06 && m < -0.08) return 'highland';
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

  // Which act's lands a region is in (ACTS): by its site's distance from the hub, bent by noise.
  // The hub and the ring round it are Act I, and each story city's region is its own act's.
  actOf(rx, rz) {
    const key = `${rx},${rz}`;
    const memo = (this._acts ??= new Map());
    let act = memo.get(key);
    if (act) return act;
    const city = this.cities().find((c) => c.rx === rx && c.rz === rz);
    if (city) act = city.act;
    else if (Math.max(Math.abs(rx), Math.abs(rz)) <= 1) act = 1;
    else {
      const [sx, sz] = this.site(rx, rz);
      const d = Math.hypot(sx, sz) + ACT_WARP * this.nA(sx / 1600, sz / 1600);
      act = ACTS.find((a) => d < a.to).act;
    }
    memo.set(key, act);
    return act;
  }

  // The act of the region owning (x, z), without building it.
  actAt(x, z) {
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
    return this.actOf(best[0], best[1]);
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

  // ------------------------------------------------------------------ towns and cities
  // The four story cities (world/places.js CITIES): along a wide spiral out from the hub, one at
  // the heart of each act's lands, each on the flattest open ground near the centre of a region
  // there (looking further round when that's mountains or water). That region is the city's: its
  // waystone is the city's heart.
  cities() {
    if (this._cities) return this._cities;
    const rng = mulberry32(hash2(17, 29, this.seed ^ 0xc17e));
    const base = rng() * Math.PI * 2;
    const around = [[0, 0]];
    for (const r of [180, 360, 540]) for (let i = 0; i < 8; i++) around.push([Math.sin((i * Math.PI) / 4) * r, Math.cos((i * Math.PI) / 4) * r]);
    this._cities = CITIES.map((c, k) => {
      const a = base + k * 1.2 + (rng() - 0.5) * 0.3;
      let best = null;
      for (const [ox, oz] of around) {
        const tx = Math.sin(a) * c.dist + ox;
        const tz = Math.cos(a) * c.dist + oz;
        const [cx, cz] = this.cellOf(tx, tz);
        const cells = [];
        for (let dx = -1; dx <= 1; dx++) {
          for (let dz = -1; dz <= 1; dz++) {
            const [sx, sz] = this.site(cx + dx, cz + dz);
            cells.push({ rx: cx + dx, rz: cz + dz, x: sx, z: sz, s: Infinity, d: Math.hypot(sx - tx, sz - tz) });
          }
        }
        cells.sort((p, q) => p.d - q.d);
        best ??= cells[0];
        for (const r of cells.slice(0, 2)) {
          for (let i = 0; i < 18; i++) {
            const d = i ? 10 + i * 4 : 0;
            const x = r.x + Math.sin(i * 2.4) * d;
            const z = r.z + Math.cos(i * 2.4) * d;
            if (!this.owns(r.rx, r.rz, x, z)) continue;
            const s = this.flatness(x, z, [40, 76]);
            if (s < best.s) best = { rx: r.rx, rz: r.rz, x, z, s };
            if (s < 5) break;
          }
          if (best.s < 7) break;
        }
        if (best.s < 7) break;
      }
      return { ...c, k, rx: best.rx, rz: best.rz, x: best.x, z: best.z, h: Math.max(this.baseHeight(best.x, best.z), WATER_LEVEL + 1.5) };
    });
    return this._cities;
  }

  cityAt(rx, rz) { return this.cities().find((c) => c.rx === rx && c.rz === rz) ?? null; }

  // How far the ground strays from level over a round site (the most, in metres, on rings of the
  // given radii), or Infinity where it's wet or mountainous: what a town or city needs.
  flatness(x, z, radii) {
    const h0 = this.baseHeight(x, z);
    if (h0 < WATER_LEVEL + 1.2 || this.mountainMask(x, z) > 0.3) return Infinity;
    let most = 0;
    for (const r of radii) {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + r;
        const px = x + Math.sin(a) * r;
        const pz = z + Math.cos(a) * r;
        const h = this.baseHeight(px, pz);
        if (h < WATER_LEVEL + 0.4 || this.mountainMask(px, pz) > 0.45) return Infinity;
        most = Math.max(most, Math.abs(h - h0));
      }
    }
    return most;
  }

  // Towns: about one in every block of nine regions (a region and the ring round it), at the
  // waystone of one of the block's regions with level ground round it and room from its
  // neighbours — none in the hub's block (Brightwater is its town), nor in or near a city's.
  townAt(rx, rz) {
    const t = this.townOf(Math.round(rx / 3), Math.round(rz / 3));
    return t && t.rx === rx && t.rz === rz ? t : null;
  }

  townOf(bx, bz) {
    const key = `${bx},${bz}`;
    const memo = (this._towns ??= new Map());
    if (memo.has(key)) return memo.get(key);
    let town = null;
    const cells = [];
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) cells.push([bx * 3 + dx, bz * 3 + dz]);
    const cities = this.cities();
    if ((bx || bz) && !cells.some(([rx, rz]) => cities.some((c) => c.rx === rx && c.rz === rz))) {
      const rng = mulberry32(hash2(bx, bz, this.seed ^ 0x70e7));
      for (let i = cells.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [cells[i], cells[j]] = [cells[j], cells[i]];
      }
      const name = this.townName(bx, bz);
      for (const [rx, rz] of cells) {
        const w = this.waystoneSpot(rx, rz);
        if (!w || this.flatness(w.x, w.z, [16, 30]) > 4.5) continue;
        if (cities.some((c) => Math.hypot(c.x - w.x, c.z - w.z) < CITY_WALL + 140)) continue;
        let crowded = false;
        for (let dx = -1; dx <= 1 && !crowded; dx++) {
          for (let dz = -1; dz <= 1 && !crowded; dz++) {
            const n = dx || dz ? this.peekWaystone(rx + dx, rz + dz) : null;
            if (n && Math.hypot(n.x - w.x, n.z - w.z) < 80) crowded = true;
          }
        }
        if (crowded) continue;
        town = { rx, rz, x: w.x, z: w.z, h: this.baseHeight(w.x, w.z), name };
        break;
      }
    }
    memo.set(key, town);
    return town;
  }

  // A town's name: no two blocks near each other share one (the later of a pair takes another).
  townName(bx, bz) {
    const first = (x, z) => townName(mulberry32(hash2(x, z, this.seed ^ 0x7a3e)));
    const mine = first(bx, bz);
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        if ((dx < 0 || (dx === 0 && dz < 0)) && first(bx + dx, bz + dz) === mine) return townName(mulberry32(hash2(bx, bz, this.seed ^ 0x7a3f)));
      }
    }
    return mine;
  }

  // Towns and cities in the regions round (rx, rz) — big enough to spill over a region's edge —
  // as ground this region's own features keep off.
  bigNear(rx, rz) {
    const out = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const t = dx || dz ? this.townAt(rx + dx, rz + dz) : null;
        if (t) out.push({ x: t.x, z: t.z, r: SIZES.town.r + 12 });
      }
    }
    for (const c of this.cities()) {
      if ((c.rx !== rx || c.rz !== rz) && Math.abs(c.rx - rx) <= 1 && Math.abs(c.rz - rz) <= 1) out.push({ x: c.x, z: c.z, r: CITY_WALL + 12 });
    }
    // The story's places (world/story.js), here or next door.
    for (const s of Object.values(storyPlaces(this))) {
      if (Math.abs(s.rx - rx) <= 1 && Math.abs(s.rz - rz) <= 1) out.push({ x: s.x, z: s.z, r: s.r + 10 });
    }
    return out;
  }

  // The roads the west and south neighbours draw to a region's waystone, replayed from their own
  // streams (as their buildRoads draws them, without building them).
  roadsInto(region) {
    const out = [];
    for (const [nx, nz, k] of [[region.rx - 1, region.rz, 1], [region.rx, region.rz - 1, 2]]) {
      const a = this.peekWaystone(nx, nz);
      if (!a) continue;
      const rng = mulberry32(hash2(nx, nz, this.seed ^ 0xa0ad));
      for (const [dx, dz] of [[1, 0], [0, 1]].slice(0, k)) {
        const b = this.peekWaystone(nx + dx, nz + dz);
        if (!b) continue;
        const pts = this.roadPath(a, b, rng);
        if (nx + dx === region.rx && nz + dz === region.rz && pts.length > 1) out.push(pts);
      }
    }
    return out;
  }

  // Bearings of the roads that leave (x, z) — the waystone's spot: this region's own, and the ones
  // its neighbours draw to it.
  streetsAt(region, x, z) {
    const out = [];
    const from = (pts) => Math.hypot(pts[0][0] - x, pts[0][1] - z) < 6;
    for (const pts of region.roads) if (from(pts)) out.push(pathBearing(x, z, pts));
    for (const pts of this.roadsInto(region)) {
      const back = [...pts].reverse();
      if (from(back)) out.push(pathBearing(x, z, back));
    }
    return out;
  }

  // Bearings where those roads cross a circle of radius R round (x, z): Brightwater's streets (its
  // waystone isn't at its heart), and the path in to the waystone.
  hubStreets(region, R = 20) {
    const out = [0];
    for (const pts of [...region.roads, ...this.roadsInto(region)]) {
      for (let i = 1; i < pts.length; i++) {
        const da = Math.hypot(pts[i - 1][0], pts[i - 1][1]) - R;
        const db = Math.hypot(pts[i][0], pts[i][1]) - R;
        if (da * db <= 0 && da !== db) out.push(Math.atan2(pts[i][0], pts[i][1]));
      }
    }
    return out;
  }

  buildRegion(rx, rz, key) {
    const rng = mulberry32(hash2(rx, rz, this.seed ^ 0x51ed));
    // What came with settlements of every size (more village folk, quest boards, hamlets) draws
    // from a stream of its own, so regions keep the layouts they had.
    const extra = mulberry32(hash2(rx, rz, this.seed ^ 0x3a7c));
    const [sx, sz] = this.site(rx, rz);
    const hub = rx === 0 && rz === 0;
    const dist = Math.hypot(sx, sz);
    const biome = hub ? 'meadow' : this.biomeAt(sx, sz);
    const ring = Math.max(Math.abs(rx), Math.abs(rz));
    // The act decides which factions may hold the region, its biome which of them likely does. The
    // draws the region's stream made for this before the act lands are still made (and thrown
    // away), so everything after keeps its place; the faction and the camps draw from a stream
    // of their own.
    const was = weighted(rng, RACE_BY_BIOME[biome]);
    if (ring <= 1 && (was === 'hive' || was === 'synth')) rng();
    const campRng = mulberry32(hash2(rx, rz, this.seed ^ 0xca39));
    const act = this.actOf(rx, rz);
    const allowed = {};
    for (const [r, m] of Object.entries(RACE_BY_ACT[act])) if (RACE_BY_BIOME[biome][r]) allowed[r] = RACE_BY_BIOME[biome][r] * m;
    const race = Object.keys(allowed).length ? weighted(campRng, allowed) : Object.keys(RACE_BY_ACT[act])[0];
    const level = hub ? 1 : Math.max(1, Math.round(1 + dist / 130 + (rng() - 0.5) * 0.8));
    const [adj, noun] = NAME[biome];
    const a = adj[Math.floor(rng() * adj.length)];
    const n = noun[Math.floor(rng() * noun.length)];
    const name = hub ? 'Brightwater Vale' : /^[a-z]/.test(n) ? a + n : `${a} ${n}`;
    const region = { key, rx, rz, x: sx, z: sz, biome, race, act, level, name, hub, pois: [], mesas: [], pads: [], roads: [], roadCells: new Set() };
    const town = hub ? null : this.townAt(rx, rz);
    const city = hub ? null : this.cityAt(rx, rz);

    // Candidate spots inside the region, on dry, gentle, non-mountain ground, apart from each other
    // (and off any town or city next door).
    const taken = this.bigNear(rx, rz);
    // (`legacy`: ground the camps of old held, kept clear for the features after them; the camps
    // themselves no longer stand there, so a camp may.)
    const free = (x, z, gap, camp = false) => taken.every((t) => (camp && t.legacy) || Math.hypot(t.x - x, t.z - z) > gap + t.r);
    const spot = (minGap, { r = 6, maxSlope = 0.45, near = null, tries = 60, minHub = 70, rand = rng, legacy = false, camp = false, ok = null } = {}) => {
      for (let i = 0; i < tries; i++) {
        let x;
        let z;
        if (near) {
          const ang = rand() * Math.PI * 2;
          const d = near.min + rand() * (near.max - near.min);
          x = near.x + Math.cos(ang) * d;
          z = near.z + Math.sin(ang) * d;
        } else {
          x = sx + (rand() - 0.5) * REGION * 1.1;
          z = sz + (rand() - 0.5) * REGION * 1.1;
        }
        if (!this.owns(rx, rz, x, z)) continue;
        if (Math.hypot(x, z) < minHub) continue;
        const h = this.baseHeight(x, z);
        if (h < WATER_LEVEL + 0.8) continue;
        if (this.mountainMask(x, z) > 0.35) continue;
        if (this.slopeBase(x, z) > maxSlope) continue;
        if (!free(x, z, minGap, camp)) continue;
        if (ok && !ok(x, z)) continue;
        taken.push({ x, z, r, legacy });
        return { x, z, h };
      }
      return null;
    };
    const pad = (x, z, r, h, fall = 12, dirt = false) => region.pads.push({ x, z, r, h, fall, dirt });
    let chestN = 0;
    const chest = (x, z, extra = {}) => region.pois.push({ type: 'chest', id: `k:${key}:${chestN++}`, x, z, level: level + (extra.bonus ?? 0), ...extra });

    if (hub) {
      // Brightwater: a town now, its walls round the old camp.
      taken.push({ x: 0, z: 0, r: HUB.radius + 14 });
      pad(0, 0, HUB.radius + 3, 0, 20);
      pad(0, 0, 14, 0, 4, true);
      region.pois.push({ type: 'hub', id: 'hub', x: 0, z: 0, radius: HUB.radius, name: HUB.name });
      region.pois.push({ type: 'waystone', id: 'w-hub', x: 0, z: 18, name: 'Brightwater' });
      pad(0, 18, 3, 0, 6);
    } else {
      const w = this.waystoneSpot(rx, rz);
      if (w) {
        let h = this.baseHeight(w.x, w.z);
        if (city || town) {
          // A city or a town round the waystone: the waystone stands in its plaza. Its services are
          // laid out once the roads are known (below).
          const wall = city ? CITY_WALL : SIZES.town.r;
          h = (city ?? town).h;
          taken.push({ x: w.x, z: w.z, r: wall + 12 });
          pad(w.x, w.z, wall + 2, h, city ? 22 : 16);
          pad(w.x, w.z, city ? SIZES.city.r + 6 : 11, h, 3, city ? 'stone' : true);
          region.pois.push(city
            ? { type: 'city', id: `y:${key}`, key, x: w.x, z: w.z, r: SIZES.city.r, wall, h, name: city.name, act: city.act, blurb: city.blurb, level, seed: Math.floor(rng() * 1e9) }
            : { type: 'town', id: `o:${key}`, key, x: w.x, z: w.z, r: wall, h, name: town.name, level, seed: Math.floor(rng() * 1e9) });
        } else if (rng() < (ring === 1 ? 0.55 : 0.4)) {
          // A friendly village round the waystone (so on the roads), in about two regions of five.
          const kinds = affinity(SETTLEMENTS, biome, ring);
          const c = Object.keys(kinds).length ? spot(0, { r: SETTLEMENT_RADIUS + 8, maxSlope: 0.32, near: { x: w.x, z: w.z, min: 11, max: 15 } }) : null;
          if (c) {
            const kind = weighted(rng, kinds);
            const S = SETTLEMENTS[kind];
            const rot = Math.atan2(w.x - c.x, w.z - c.z); // its front faces the waystone and the road
            const npcs = [];
            const trader = rng() < S.trader;
            const count = 2 + (rng() < 0.5 ? 1 : 0) + (trader ? 1 : 0);
            for (let i = 0; i < count; i++) {
              const role = trader && i === 0 ? 'trader' : 'flavor';
              const ang = rot + (role === 'trader' ? 0.15 : 1.7 + i * 1.45 + (rng() - 0.5) * 0.5);
              const d = role === 'trader' ? 5.5 : 3.2 + rng() * 2.6;
              npcs.push({ id: `n:${key}:${i}`, role, x: c.x + Math.sin(ang) * d, z: c.z + Math.cos(ang) * d, facing: ang + Math.PI, seed: Math.floor(rng() * 1e9) });
            }
            const place = {
              type: 'settlement', id: `v:${key}`, key, kind, x: c.x, z: c.z, r: SETTLEMENT_RADIUS, rot, h: c.h, name: S.name(rng), level,
              way: { x: w.x, z: w.z }, npcs, seed: Math.floor(rng() * 1e9),
            };
            dressVillage(place, extra);
            region.pois.push(place);
            pad(c.x, c.z, SETTLEMENT_RADIUS, c.h, 10, true);
            h = c.h;
          }
        }
        taken.push({ x: w.x, z: w.z, r: 4 });
        region.pois.push({ type: 'waystone', id: `w:${key}`, x: w.x, z: w.z, name: city?.name ?? town?.name ?? region.name });
        pad(w.x, w.z, 3, h, 6);
      }
      // A landmark: something worth the walk, in about three regions of four.
      if (rng() < (ring === 1 ? 0.55 : 0.75)) {
        const kinds = affinity(LANDMARKS, biome, ring);
        if (Object.keys(kinds).length) {
          const kind = weighted(rng, kinds);
          const L = LANDMARKS[kind];
          const c = spot(45, { r: L.r + 6, maxSlope: L.slope });
          if (c) {
            const rot = rng() * Math.PI * 2;
            const id = `l:${key}`;
            region.pois.push({ type: 'landmark', id, kind, x: c.x, z: c.z, r: L.r, rot, h: c.h, name: L.name(rng), level, seed: Math.floor(rng() * 1e9) });
            if (L.pad) pad(c.x, c.z, L.r * 0.85, c.h, 10, kind === 'wreck');
            const [lx, lz] = L.chest;
            chest(c.x + Math.cos(rot) * lx + Math.sin(rot) * lz, c.z - Math.sin(rot) * lx + Math.cos(rot) * lz, { landmark: id, bonus: 2 });
          }
        }
      }
    }

    // Where the camps stood before the act lands: their draws from the region's stream are still
    // made, and their ground kept, so the features after them keep their places. The camps
    // themselves are placed last, from a stream of their own (placeCamps).
    {
      const n = hub ? 1 : city ? 0 : 2 + (rng() < 0.45 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const R = 10 + Math.floor(rng() * 4);
        if (!spot(42, { r: R + 6, maxSlope: 0.35, minHub: hub ? 55 : 70, legacy: true })) continue;
        for (let k = 0; k < 4; k++) rng(); // its name, style, level and seed
      }
      if (!hub && !city && level >= 4 && rng() < 0.28 && spot(50, { r: 24, maxSlope: 0.3, legacy: true })) rng();
    }

    // Verticality: mesas (canyon and desert country is full of them), a tower, ruins — with chests
    // up top.
    const mesaN = (biome === 'badlands' ? 2 + (rng() < 0.5 ? 1 : 0) : biome === 'highland' ? 2 : biome === 'meadow' || biome === 'ash' || biome === 'desert' ? 1 : rng() < 0.4 ? 1 : 0) - (hub ? 1 : 0);
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
    if (rng() < (hub ? 1 : 0.45)) {
      const t = hub ? spot(15, { r: 6, near: { x: 48, z: 42, min: 0, max: 12 }, minHub: 40 }) : spot(25, { r: 6 });
      if (t) {
        const id = `t:${key}`;
        region.pois.push({ type: 'tower', id, x: t.x, z: t.z, h: 5.5 + rng() * 2 });
        pad(t.x, t.z, 4, t.h, 6);
        chest(t.x, t.z, { on: id, bonus: 1 });
      }
    }
    if (!hub && rng() < 0.35) {
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
    for (let i = 0, k = hub ? 0 : 1 + (rng() < 0.5 ? 1 : 0); i < k; i++) {
      const c = spot(15, { r: 2 });
      if (c) chest(c.x, c.z);
    }

    // The story's places here (world/story.js): their ground was kept clear from the start.
    for (const p of storyIn(this, rx, rz)) {
      region.pois.push(p);
      if (p.type === 'camp') pad(p.x, p.z, p.radius + (p.stronghold ? 4 : 2), p.h, p.stronghold ? 14 : 11, true);
      else if (p.kind === 'vault') {
        pad(p.x, p.z, p.r, p.h, 8, true);
        pad(p.x, p.z, 7, p.h - 3.5, 4, true);
      } else if (p.type === 'story') pad(p.x, p.z, p.r, p.h, 6, p.kind === 'relicdig' || (p.kind === 'array' && 'stone'));
      else pad(p.x, p.z, p.r * 0.85, p.h, 10, true);
    }

    // A hamlet: a few homes off the road, in most regions (fewer where there's a village or a
    // town already; none in a city's).
    const settled = region.pois.some((p) => p.type === 'settlement' || p.type === 'town');
    if (!city && extra() < (hub ? 0.5 : settled ? 0.3 : 0.62)) {
      const kinds = affinity(HAMLETS, biome, ring);
      const c = Object.keys(kinds).length ? spot(16, { r: SIZES.hamlet.r + 4, maxSlope: 0.3, minHub: 90, rand: extra }) : null;
      if (c) {
        const way = region.pois.find((p) => p.type === 'waystone');
        const place = {
          type: 'hamlet', id: `h:${key}`, key, kind: weighted(extra, kinds), x: c.x, z: c.z, r: SIZES.hamlet.r,
          rot: way ? Math.atan2(way.x - c.x, way.z - c.z) : extra() * Math.PI * 2, h: c.h, name: hamletName(extra), level, seed: Math.floor(extra() * 1e9),
        };
        planHamlet(place, extra);
        region.pois.push(place);
        pad(c.x, c.z, SIZES.hamlet.r, c.h, 9);
        pad(c.x, c.z, 5, c.h, 3, true);
      }
    }

    // The camps, from a stream of their own: bigger ones first, while there's room. Each keeps
    // inside the region by a margin (so 20 m and more from its neighbours' camps), off every road it can know of
    // and on ground with room for its garrison.
    if (!city) {
      const plan = [];
      if (hub) plan.push('outpost');
      else if (act === 1 && level < 5) plan.push(...(campRng() < 0.5 ? ['camp'] : []), 'outpost', 'outpost');
      else {
        const roll = campRng();
        if (act === 1) { if (roll < 0.25) plan.push('base'); }
        else if (level >= 10 && roll < 0.28) plan.push('fort');
        else if (roll < 0.4) plan.push('base');
        plan.push('camp');
        if (act > 1 && campRng() < 0.5) plan.push('camp');
        plan.push('outpost');
        if (campRng() < 0.5) plan.push('outpost');
      }
      const known = this.roadsKnown(region);
      const roads = known.roads;
      const way = region.pois.find((p) => p.type === 'waystone');
      let draws = known.draws;
      // The road buildRoads will run to a camp here (its spur): the stream as it will stand then.
      const spurTo = (x, z, R) => {
        if (!way) return { pts: [], used: 0 };
        const rr = mulberry32(hash2(rx, rz, this.seed ^ 0xa0ad));
        for (let k = 0; k < draws; k++) rr();
        const pts = this.roadPath(way, { x, z, inset: R * 0.7 }, rr);
        return { pts, used: pts.length || Math.hypot(x - way.x, z - way.z) >= 8 && Math.hypot(x - way.x, z - way.z) <= REGION * 1.8 ? 2 : 0 };
      };
      const placed = [];
      const campStyle = { scav: 'scav', hive: 'nest', synth: 'relay', fauna: 'den' }[race];
      const names = [...CAMP_NAME[race]];
      let n = 0;
      for (const kind of plan) {
        const tier = kind === 'fort' ? 'base' : kind;
        const R = TIERS[tier].R;
        const ok = (x, z, margin = 10) => {
          for (let k = 0; k < 16; k++) {
            const a = (k / 16) * Math.PI * 2;
            if (!this.owns(rx, rz, x + Math.sin(a) * (R + 11), z + Math.cos(a) * (R + 11))) return false;
          }
          if (!roads.every((path) => path.every(([px, pz]) => Math.hypot(px - x, pz - z) > R + margin))) return false;
          // Nor may its own road in run through a camp already here.
          const { pts } = spurTo(x, z, R);
          return placed.every((q) => pts.every(([px, pz]) => Math.hypot(px - q.x, pz - q.z) > q.radius + 10));
        };
        // Where roads leave no room, an outpost may stand by one (though none runs through it);
        // Brightwater's streets fill its region, so the Prologue's first camp may stand by one.
        const at = (o) => spot(R + 18, { r: R + 2, maxSlope: 0.35, minHub: hub ? 55 : 70, rand: campRng, camp: true, tries: R > 20 ? 250 : 150, ok: o });
        // An outpost tries the ground the old camps stood on first: it's known to fit one.
        const old = tier === 'outpost' ? taken.find((t) => t.legacy && !t.used && free(t.x, t.z, R + 18, true) && ok(t.x, t.z, 3)) : null;
        if (old) { old.used = true; taken.push({ x: old.x, z: old.z, r: R + 2 }); }
        const c = (old && { x: old.x, z: old.z, h: this.baseHeight(old.x, old.z) })
          ?? at(ok) ?? (tier === 'outpost' ? at((x, z) => ok(x, z, 3)) : null) ?? (hub ? at(null) : null);
        if (!c) continue;
        const nm = names.length ? names.splice(Math.floor(campRng() * names.length), 1)[0] : CAMP_NAME[race][0];
        const seed = Math.floor(campRng() * 1e9);
        const poi = kind === 'fort'
          ? { type: 'camp', id: `s:${key}`, x: c.x, z: c.z, radius: R, tier, race, style: 'fort', stronghold: true, level: level + 2, name: `${region.name} ${STRONGHOLD_NAME[race]}`, seed }
          : {
            type: 'camp', id: tier === 'base' ? `b:${key}` : `c:${key}:${n++}`, x: c.x, z: c.z, radius: R, tier, race,
            style: campRng() < 0.25 && race === 'scav' ? 'salvage' : campStyle, level: level + (tier === 'base' ? 1 : campRng() < 0.35 ? 1 : 0),
            name: `${region.name.split(' ')[0]} ${nm}`, seed,
          };
        // Room for its garrison once water and cliffs are left out, or it isn't placed.
        if (campLayout(poi, this.campProbe).posts.length < TIERS[tier].garrison[0]) { taken.pop(); continue; }
        region.pois.push(poi);
        placed.push(poi);
        pad(c.x, c.z, R + 2, c.h, R > 20 ? 16 : 11, true);
        const spur = spurTo(c.x, c.z, R);
        if (spur.pts.length) roads.push(spur.pts);
        draws += spur.used;
      }
    }

    this.buildRoads(region);
    // Frontier posts: where one of its roads crosses into a later act's lands, a Warden post on
    // the near side, about 10 m short of the line, across the road. (No draws: they follow from
    // the roads.)
    let fn = 0;
    for (const path of region.roads) {
      for (let i = 1; i < path.length; i++) {
        const A = this.actAt(path[i - 1][0], path[i - 1][1]);
        const B = this.actAt(path[i][0], path[i][1]);
        if (A === B) continue;
        const dir = A < B ? -1 : 1; // along the path toward the near side
        let k = A < B ? i - 1 : i;
        let walked = 0;
        while (walked < 10 && k + dir >= 0 && k + dir < path.length) {
          walked += Math.hypot(path[k + dir][0] - path[k][0], path[k + dir][1] - path[k][1]);
          k += dir;
        }
        let [x, z] = path[k];
        if (this.actAt(x, z) >= Math.max(A, B)) [x, z] = A < B ? path[i - 1] : path[i];
        if (region.pois.some((p) => p.type === 'frontier' && Math.hypot(p.x - x, p.z - z) < 15)) continue;
        const [ox, oz] = path[Math.max(0, k - 1)];
        const [qx, qz] = path[Math.min(path.length - 1, k + 1)];
        region.pois.push({ type: 'frontier', id: `f:${key}:${fn++}`, x, z, rot: Math.atan2(qx - ox, qz - oz), act: Math.max(A, B), name: ACTS[Math.max(A, B) - 1].name });
      }
    }
    // Towns and cities lay out their services between the streets the roads come in by; a city's
    // districts are points of interest of their own, so it streams in a district at a time.
    for (const p of [...region.pois]) {
      if (p.type === 'hub') {
        planHub(p, extra, this.hubStreets(region));
        // The town round the old camp streams in as a part of its own.
        region.pois.push({ type: 'hubtown', id: 'ht:0,0', x: 0, z: 0, name: HUB.name });
      }
      else if (p.type === 'town') planTown(p, extra, this.streetsAt(region, p.x, p.z));
      else if (p.type === 'city') {
        for (const d of planCity(p, extra, this.streetsAt(region, p.x, p.z))) {
          region.pois.push(d);
          pad(d.x, d.z, d.r - 4, p.h, 3, 'stone');
        }
        region.pois.push({ type: 'citywall', id: `yw:${key}`, x: p.x, z: p.z, wall: p.wall, h: p.h, quarters: p.quarters, name: p.name, act: p.act });
      }
    }
    return region;
  }

  // ------------------------------------------------------------------ roads
  // Each region draws its roads east and north to neighbouring waystones (so every pair is drawn
  // once), plus spurs from its waystone to its camps, landmarks and hamlet. Villages, towns and
  // cities stand round their waystone, so the roads run through them.
  buildRoads(region) {
    const way = region.pois.find((p) => p.type === 'waystone');
    if (!way) return;
    const rng = mulberry32(hash2(region.rx, region.rz, this.seed ^ 0xa0ad));
    for (const s of this.roadStops(region)) {
      const pts = this.roadPath(way, s, rng);
      if (pts.length < 2) continue;
      region.roads.push(pts);
      for (const [x, z] of pts) region.roadCells.add(`${Math.floor(x / 4)},${Math.floor(z / 4)}`);
    }
  }

  // The roads a region will have, drawn before its camps are placed (the camps are its last
  // stops, so these come out the same when buildRoads draws them), and the ones its west and south
  // neighbours draw into it.
  // { roads, draws }: `draws`, how far into the region's road stream they took it.
  roadsKnown(region) {
    const roads = this.trunksNear(region);
    const way = region.pois.find((p) => p.type === 'waystone');
    if (!way) return { roads, draws: 0 };
    let draws = 0;
    const base = mulberry32(hash2(region.rx, region.rz, this.seed ^ 0xa0ad));
    const rng = () => { draws++; return base(); };
    for (const s of this.roadStops(region)) {
      const pts = this.roadPath(way, s, rng);
      if (pts.length > 1) roads.push(pts);
    }
    return { roads, draws };
  }

  // The roads between waystones that the eight regions round this one draw (a region draws its
  // own east and north, first from its road stream), which may cut across this one's corners.
  trunksNear(region) {
    const out = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        if (!dx && !dz) continue;
        const nx = region.rx + dx;
        const nz = region.rz + dz;
        const a = this.peekWaystone(nx, nz);
        if (!a) continue;
        const rng = mulberry32(hash2(nx, nz, this.seed ^ 0xa0ad));
        for (const [ex, ez] of [[1, 0], [0, 1]]) {
          const b = this.peekWaystone(nx + ex, nz + ez);
          if (!b) continue;
          const pts = this.roadPath(a, b, rng);
          if (pts.length > 1) out.push(pts);
        }
      }
    }
    return out;
  }

  // Where a region's roads go from its waystone: its east and north neighbours' waystones, then
  // its own places, in the order they were placed.
  roadStops(region) {
    const stops = [];
    for (const [dx, dz] of [[1, 0], [0, 1]]) {
      const n = this.peekWaystone(region.rx + dx, region.rz + dz);
      if (n) stops.push(n);
    }
    for (const p of region.pois) {
      if (p.type === 'camp' || p.type === 'tower' || p.type === 'ruin' || p.type === 'hub') stops.push({ x: p.x, z: p.z, inset: (p.radius ?? p.r ?? 3) * 0.7 });
      else if (p.type === 'landmark') stops.push({ x: p.x, z: p.z, inset: p.r + 2 });
      else if (p.type === 'hamlet') stops.push({ x: p.x, z: p.z, inset: p.r * 0.45 });
    }
    return stops;
  }

  // Ground a camp's layout leaves out (world/campLayout.js): water and cliffs, by the land's own
  // shape, so the screen and the sim lay every camp out alike.
  campProbe = (x, z) => this.baseHeight(x, z) < WATER_LEVEL + 0.2 || this.slopeBase(x, z) > 0.6;

  // A neighbour's waystone without building the whole neighbour (which would recurse).
  peekWaystone(rx, rz) {
    if (rx === 0 && rz === 0) return { x: 0, z: 18 };
    return this.waystoneSpot(rx, rz);
  }

  // Where a region's waystone stands: near its site, on dry gentle ground (a city's is its heart;
  // none stands inside a city's walls). Its own seeded stream, so a region and its neighbours
  // (drawing roads to it) always agree.
  waystoneSpot(rx, rz) {
    const cities = this.cities();
    for (const c of cities) if (c.rx === rx && c.rz === rz) return { x: c.x, z: c.z };
    const rng = mulberry32(hash2(rx, rz, this.seed ^ 0x77e1));
    const [sx, sz] = this.site(rx, rz);
    for (let i = 0; i < 40; i++) {
      const a = rng() * Math.PI * 2;
      const d = rng() * 60;
      const x = sx + Math.cos(a) * d;
      const z = sz + Math.sin(a) * d;
      if (this.baseHeight(x, z) > WATER_LEVEL + 0.8 && this.mountainMask(x, z) < 0.35 && this.slopeBase(x, z) < 0.45) {
        return cities.some((c) => Math.hypot(c.x - x, c.z - z) < CITY_WALL + 24) ? null : { x, z };
      }
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

