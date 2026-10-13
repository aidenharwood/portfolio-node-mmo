// The endless world: streams the generator's terrain (world/Chunks.js) and points of interest
// (world/Gen.js regions) in around the player and out behind them, and owns every ground,
// collision and placement query the game makes.
//   chunks     64 m terrain squares at three levels of detail, a 2 m height grid near the player,
//              scenery (trees, rocks, grass, glowing flora) packed into shared instanced meshes
//   POIs       the hub (Brightwater, a town), villages, hamlets, towns, the cities district by
//              district (world/Towns.js), landmarks (world/Landmarks.js), camps and strongholds
//              (one style per race), towers, ruins, mesas with their floating shards, waystones
//              and chests — built when within reach, disposed when left far behind, each owning
//              its colliders
//   sky        the fog and sky take on the colour (and the fog its depth) of the biome you're in
//   roads      ribbons draped over the terrain between waystones, camps and landmarks
//   colliders  a spatial hash with ownership, so streamed-out content takes its colliders with it:
//              round ones (trees, rocks, posts, folk) and boxes (a dungeon's walls and doors)
//   pockets    dungeons (world/Interior.js) are built far out east, past anywhere the land goes:
//              there the ground is their floors, nothing of the land streams in, and no place of
//              the world stands
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { instancedToon, toonMaterial, disposeObject, noInk } from '../render/Toon.js';
import { piece, bakeTree, G, shade } from '../render/ModelKit.js';
import { mulberry32 } from '../core/rng.js';
import { WorldGen, REGION, WATER_LEVEL, HUB } from './Gen.js';
import { Chunk, CHUNK, RES0 } from './Chunks.js';
import { C, HEARTH, FORGE, HIVE, ARC, CARGO, RUNE } from './palette.js';
import { LANDMARK_BUILDERS, SETTLEMENT_BUILDERS } from './Landmarks.js';
import { HAMLET_BUILDERS, DISTRICT_BUILDERS, buildTown, buildCity, buildCityWall, buildBrightwater, serviceProps } from './Towns.js';
import { STORY_BUILDERS, foundryYard, placeObjects, objectProps } from './StorySites.js';
import { NPCS } from './mapData.js';
import { inPocket, POCKET } from './dungeons.js';
import { storyPlaces } from './story.js';

const GRID = 8;
const TAU = Math.PI * 2;

// Each biome's sky (and fog) colour, and how deep the fog sits: close in the jungle, the fens and
// the spore groves, far off over the desert.
const SKY = {
  meadow: 0xa6d8f2, forest: 0x9fd2e2, highland: 0xbad9ea, snow: 0xd2e4f0, marsh: 0xa2c2b4, ash: 0xa8948a,
  mountain: 0xb2d0e6, desert: 0xf0dcb4, badlands: 0xeec6a4, jungle: 0x9cd6c4, crystal: 0xc4cdfa, fungal: 0xbca6dc,
};
const FOG = { jungle: [60, 200], marsh: [60, 210], fungal: [55, 200], ash: [60, 210], desert: [100, 270], snow: [70, 230] };
const FOG_DEFAULT = [80, 240];

const VIEW = 4;            // chunks kept loaded around the player (Chebyshev radius)
const LOD0_DIST = 110;
const LOD1_DIST = 200;
const HEIGHT_DIST = 200;   // chunks this close keep the exact 2 m height grid
const DETAIL_DIST = 120;   // grass, flowers and glowing flora
const COLLIDE_DIST = 150;  // tree and rock colliders
const POI_LOAD = 300;
const POI_UNLOAD = 360;
const LANDMARK_LOAD = 420; // landmarks and cities are big: built before they loom out of the fog
const LANDMARK_UNLOAD = 480;
const BIG = new Set(['landmark', 'city', 'district', 'citywall']);
// Settlements of every size: what counts as one (a safe place), and how far its ground reaches.
const PLACES = new Set(['settlement', 'hamlet', 'town', 'city']);
const placeReach = (p) => (p.type === 'city' ? p.wall : p.type === 'hub' ? p.radius : p.r);
const FOLK = new Map(NPCS.map((n) => [n.id, n]));
const ROAD_LOAD = 420;
const ROAD_UNLOAD = 520;
const BUDGET_MS = 5;

const ckey = (cx, cz) => (cx + 32768) * 65536 + (cz + 32768);
const hashStr = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

// Scenery types: geometry, colour, outline, capacity, casts shadow, and how it sways in the wind
// ({ amp, base }: amp × the square of the height above base, in the model's own units — trunks,
// rocks and stumps don't sway; crowns and grass tips do).
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
function sceneryTypes() {
  const noUV = (g) => { g.deleteAttribute('uv'); return g; };
  const flat = (list) => mergeGeometries(list.map((g) => noUV(g.index ? g.toNonIndexed() : g)));
  const cactusGeo = flat([
    new THREE.CylinderGeometry(0.32, 0.38, 4.2, 8).translate(0, 2.1, 0),
    new THREE.SphereGeometry(0.32, 8, 4, 0, TAU, 0, Math.PI / 2).translate(0, 4.2, 0),
    new THREE.CylinderGeometry(0.2, 0.2, 1.1, 6).rotateZ(Math.PI / 2).translate(0.75, 2.0, 0),
    new THREE.CylinderGeometry(0.2, 0.22, 1.6, 6).translate(1.3, 2.75, 0),
    new THREE.SphereGeometry(0.2, 6, 3, 0, TAU, 0, Math.PI / 2).translate(1.3, 3.55, 0),
    new THREE.CylinderGeometry(0.18, 0.18, 0.9, 6).rotateZ(Math.PI / 2).translate(-0.6, 2.8, 0),
    new THREE.CylinderGeometry(0.18, 0.2, 1.2, 6).translate(-1.05, 3.35, 0),
    new THREE.SphereGeometry(0.18, 6, 3, 0, TAU, 0, Math.PI / 2).translate(-1.05, 3.95, 0),
  ]);
  const hoodooGeo = flat([
    new THREE.CylinderGeometry(0.9, 1.4, 3, 7).translate(0, 1.5, 0),
    new THREE.CylinderGeometry(0.55, 0.9, 2.4, 7).translate(0.1, 4.2, 0),
    new THREE.DodecahedronGeometry(1.5, 0).scale(1, 0.42, 1).translate(0.15, 5.7, 0),
  ]);
  const frondGeo = flat(Array.from({ length: 7 }, (_, k) => new THREE.BoxGeometry(0.9, 0.08, 3.4).translate(0, 0, 1.7).rotateX(0.55).rotateY((k / 7) * TAU).translate(0, 6.2, 0)));
  const fernGeo = flat(Array.from({ length: 6 }, (_, k) => new THREE.ConeGeometry(0.5, 2.6, 4).scale(1, 1, 0.18).translate(0, 1.3, 0).rotateX(0.85).rotateY((k / 6) * TAU + 0.3)));
  const crystalGeo = flat([[0, 0, 0, 0], [0.5, 0.2, 0.6, 0.5], [-0.45, -0.3, 0.5, -0.45], [0.1, 0.55, 0.45, 0.3]].map(([x, z, s, t]) => new THREE.OctahedronGeometry(0.55, 0).scale(1 - s * 0.6, 2.6 - s * 1.4, 1 - s * 0.6).rotateZ(t).translate(x, 1.2 - s, z)));
  const pineGeo = mergeGeometries([
    new THREE.ConeGeometry(1.6, 2.4, 7).translate(0, 2.4, 0).toNonIndexed(),
    new THREE.ConeGeometry(1.25, 2.0, 7).translate(0, 3.5, 0).toNonIndexed(),
    new THREE.ConeGeometry(0.85, 1.6, 7).translate(0, 4.5, 0).toNonIndexed(),
  ].map(noUV));
  const roundGeo = mergeGeometries([
    new THREE.IcosahedronGeometry(1.7, 0).translate(0, 3.2, 0),
    new THREE.IcosahedronGeometry(1.1, 0).translate(1.0, 2.6, 0.4),
    new THREE.IcosahedronGeometry(1.0, 0).translate(-0.9, 2.8, -0.3),
  ].map(noUV));
  const deadGeo = mergeGeometries([
    new THREE.CylinderGeometry(0.16, 0.3, 3.6, 6).translate(0, 1.8, 0).toNonIndexed(),
    new THREE.CylinderGeometry(0.06, 0.1, 1.4, 5).rotateZ(0.9).translate(0.55, 2.6, 0).toNonIndexed(),
    new THREE.CylinderGeometry(0.05, 0.09, 1.2, 5).rotateZ(-1.0).translate(-0.5, 2.2, 0.1).toNonIndexed(),
    new THREE.CylinderGeometry(0.05, 0.08, 1.0, 5).rotateX(0.9).translate(0, 3.0, 0.4).toNonIndexed(),
  ].map(noUV));
  return {
    trunk: [new THREE.CylinderGeometry(0.22, 0.34, 2.2, 7).translate(0, 1.1, 0), C.woodDark, 0.05, 9000, true],
    pine: [pineGeo, C.pine, 0.06, 7000, true, SWAY.pine],
    snowPine: [pineGeo, C.snowPine, 0.06, 5000, true, SWAY.pine],
    round: [roundGeo, C.leaf, 0.06, 4000, true, SWAY.crown],
    dead: [deadGeo, C.dead, 0.04, 3000, true, SWAY.bare],
    charred: [deadGeo, C.charred, 0.04, 3000, true, SWAY.bare],
    rock: [new THREE.DodecahedronGeometry(1, 0), C.stone, 0.05, 6000, true],
    boulder: [new THREE.DodecahedronGeometry(1, 0), shade(C.stone, 0.92), 0.06, 2500, true],
    bush: [new THREE.IcosahedronGeometry(0.7, 0), C.bush, 0.035, 5000, true, SWAY.bush],
    reed: [new THREE.ConeGeometry(0.05, 1.3, 4).translate(0, 0.65, 0), C.reed, 0, 8000, false, SWAY.reed],
    tuft: [new THREE.ConeGeometry(0.1, 0.45, 4).translate(0, 0.22, 0), 0x62ab4c, 0, 16000, false, SWAY.tuft],
    flowerY: [new THREE.SphereGeometry(0.07, 5, 4), 0xfff27a, 0, 1500, false, SWAY.head],
    flowerW: [new THREE.SphereGeometry(0.07, 5, 4), 0xffffff, 0, 1500, false, SWAY.head],
    flowerP: [new THREE.SphereGeometry(0.07, 5, 4), 0xff8ac6, 0, 1500, false, SWAY.head],
    flowerB: [new THREE.SphereGeometry(0.07, 5, 4), 0x9ad0ff, 0, 1500, false, SWAY.head],
    stem: [new THREE.CylinderGeometry(0.05, 0.07, 0.4, 6).translate(0, 0.2, 0), 0xe8e4d8, 0.015, 2500, false],
    // Desert and badlands
    cactus: [cactusGeo, C.cactus, 0.04, 2500, true],
    dryBush: [new THREE.IcosahedronGeometry(0.55, 0), 0x9a8a5a, 0.03, 3500, false],
    sandRock: [new THREE.DodecahedronGeometry(1, 0), C.sandstone, 0.05, 3000, true],
    redRock: [new THREE.DodecahedronGeometry(1, 0), C.redrock, 0.05, 4000, true],
    hoodoo: [hoodooGeo, shade(C.redrock, 1.08), 0.06, 1200, true],
    // Jungle
    tallTrunk: [new THREE.CylinderGeometry(0.18, 0.3, 6.3, 7).translate(0, 3.15, 0), 0x6a5a3a, 0.04, 3500, true],
    palm: [frondGeo, C.jungleLeaf, 0.04, 3500, true, SWAY.frond],
    fern: [fernGeo, 0x2f8a3a, 0.03, 4000, false, SWAY.fern],
    // Crystal fields
    crystal: [crystalGeo, 0x8ce0ff, 0.04, 3000, true],
    spire: [new THREE.OctahedronGeometry(1, 0).scale(1, 5, 1).translate(0, 4.5, 0), 0xb894ff, 0.06, 800, true],
    // Fungal groves
    shroomStem: [new THREE.CylinderGeometry(0.25, 0.42, 3.2, 8).translate(0, 1.6, 0), C.shroomStem, 0.04, 3000, true],
    shroomCap: [new THREE.SphereGeometry(1.6, 12, 6, 0, TAU, 0, Math.PI / 2).scale(1, 0.55, 1).translate(0, 3.1, 0), C.shroomCap, 0.05, 3000, true],
    puff: [new THREE.IcosahedronGeometry(0.6, 1), 0xd8b8e8, 0.03, 2500, false],
  };
}
const FLORA_TYPES = {
  shard: [new THREE.OctahedronGeometry(0.25).scale(0.6, 2.2, 0.6).translate(0, 0.5, 0), 3000],
  cap: [new THREE.SphereGeometry(0.2, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.6, 1).translate(0, 0.38, 0), 2500],
};
const FLORA_COLOR = {
  highland: 0x7fe8ff, snow: 0xbff4ff, ash: 0xff8a2a, marsh: 0xb84aff, forest: 0x6affc8, meadow: 0x7fe8ff, mountain: 0x7fe8ff,
  desert: 0xffb347, badlands: 0xff8a2a, jungle: 0x6affa0, crystal: 0xb07aff, fungal: 0xff6ae0,
};
// Where ground cover (grass tufts) grows.
const TUFTS = new Set(['meadow', 'forest', 'highland', 'marsh', 'mountain', 'jungle', 'fungal']);
const DENSITY = {
  meadow: { round: 0.06, pine: 0.02, bush: 0.08, rock: 0.025 },
  forest: { pine: 0.32, round: 0.12, bush: 0.08, rock: 0.03 },
  highland: { pine: 0.05, rock: 0.09, boulder: 0.02, bush: 0.03 },
  snow: { snowPine: 0.2, rock: 0.07, boulder: 0.02 },
  marsh: { dead: 0.07, reed: 0.3, bush: 0.08, round: 0.03 },
  ash: { charred: 0.07, rock: 0.09, boulder: 0.02 },
  mountain: { pine: 0.12, snowPine: 0.08, boulder: 0.08, rock: 0.06 },
  desert: { cactus: 0.035, dryBush: 0.04, sandRock: 0.03 },
  badlands: { redRock: 0.07, hoodoo: 0.025, dryBush: 0.04, dead: 0.01 },
  jungle: { palm: 0.16, fern: 0.16, round: 0.06, bush: 0.08 },
  crystal: { crystal: 0.06, spire: 0.012, rock: 0.04 },
  fungal: { shroom: 0.12, puff: 0.05, bush: 0.04, dead: 0.02 },
};

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _col = new THREE.Color();

// Pushes a circle (`pos`, `radius`) out of box collider `c`: away from the box's nearest point, or
// (its centre inside) out by the shortest way.
function pushOutOfBox(pos, radius, c) {
  const angle = c.ry ?? 0;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = pos.x - c.x;
  const dz = pos.z - c.z;
  const local = { x: cos * dx - sin * dz, z: sin * dx + cos * dz };
  const qx = Math.min(c.hx, Math.max(-c.hx, local.x));
  const qz = Math.min(c.hz, Math.max(-c.hz, local.z));
  const ox = local.x - qx;
  const oz = local.z - qz;
  const d2 = ox * ox + oz * oz;
  if (d2 >= radius * radius) return;
  if (d2 > 1e-10) {
    const d = Math.sqrt(d2);
    local.x = qx + (ox / d) * radius;
    local.z = qz + (oz / d) * radius;
  } else {
    const px = c.hx - Math.abs(local.x) + radius;
    const pz = c.hz - Math.abs(local.z) + radius;
    if (px < pz) local.x += Math.sign(local.x || 1) * px;
    else local.z += Math.sign(local.z || 1) * pz;
  }
  pos.x = c.x + cos * local.x + sin * local.z;
  pos.z = c.z - sin * local.x + cos * local.z;
}

export class World {
  constructor(scene, seed = 1) {
    this.scene = scene;
    this.seed = seed >>> 0;
    this.gen = new WorldGen(this.seed);
    this.colliders = new Set();
    this.grid = new Map();
    this.flames = [];
    this.shards = [];
    this.spinners = [];         // turning parts (wind turbines)
    this.objectParts = new Map(); // a quest object's id → its { on, off } parts (shown as used or not)
    this.interiors = new Map();   // dungeons built in their pockets: id → world/Interior.js
    this.onPoiLoad = null;      // (poi, owner) hooks: the game dresses settlements with their folk
    this.onPoiUnload = null;
    this.skyBiome = 'meadow';
    this.skyTimer = 0;
    this.waystones = new Map(); // loaded waystones (id → state)
    this.chests = new Map();    // loaded chests
    this.root = new THREE.Group();
    scene.add(this.root);
    this.chunks = new Map();
    this.pois = new Map();      // loaded POIs: id → owner record
    this.roads = new Map();     // loaded road groups: region key → owner record
    this.tiles = new Map();     // map tiles kept for explored chunks: ckey → canvas
    this.focus = new THREE.Vector3(1e9, 0, 1e9);
    this.planned = new THREE.Vector3(1e9, 0, 1e9);
    this.jobs = [];
    this.own = null;
    this.rnd = Math.random;
    this.isAttuned = () => false;
    this.isOpened = () => false;
    this.setupLighting();
    this.buildWater();
    this.buildScenerySets();
  }

  // ------------------------------------------------------------ queries
  groundHeight(x, z) {
    if (inPocket(x)) return this.pocketGround(x, z);
    const ch = this.chunks.get(ckey(Math.floor(x / CHUNK), Math.floor(z / CHUNK)));
    if (ch) {
      if (ch.heights) return ch.heightAt(x, z);
      if (ch.lodGrid) return ch.lodHeightAt(x, z);
    }
    return this.analyticHeight(x, z);
  }

  // The generator sampled on the 2 m grid and interpolated on the same triangles as the mesh.
  analyticHeight(x, z) {
    const step = CHUNK / RES0;
    const fx = x / step;
    const fz = z / step;
    const ix = Math.floor(fx);
    const iz = Math.floor(fz);
    const u = fx - ix;
    const v = fz - iz;
    const ha = this.vertexHeight(ix, iz);
    const hb = this.vertexHeight(ix, iz + 1);
    const hd = this.vertexHeight(ix + 1, iz);
    if (u + v <= 1) return ha + (hd - ha) * u + (hb - ha) * v;
    const hc = this.vertexHeight(ix + 1, iz + 1);
    return hc + (hb - hc) * (1 - u) + (hd - hc) * (1 - v);
  }

  // The generator's height at a vertex (ix, iz) of the 2 m grid.
  vertexHeight(ix, iz) {
    const step = CHUNK / RES0;
    return this.gen.height(ix * step, iz * step);
  }

  slopeAt(x, z) {
    const e = 1;
    const dx = this.groundHeight(x + e, z) - this.groundHeight(x - e, z);
    const dz = this.groundHeight(x, z + e) - this.groundHeight(x, z - e);
    return Math.hypot(dx, dz) / (2 * e);
  }

  // ------------------------------------------------------------ pockets (dungeons)
  interiorAt(x, z) {
    if (!inPocket(x)) return null;
    for (const it of this.interiors.values()) if (it.contains(x, z)) return it;
    return null;
  }
  // In a pocket the ground is a dungeon's floor, and outside its rooms far below them.
  pocketGround(x, z) {
    const it = this.interiorAt(x, z);
    return it ? it.floorAt(x, z) : POCKET.y - 40;
  }
  // The ceiling over (x, z): a dungeon's, else the open sky.
  ceilingAt(x, z) { return inPocket(x) ? this.interiorAt(x, z)?.ceilingAt(x, z) ?? Infinity : Infinity; }
  // Somewhere an enemy may be put (a blink, a summons): dry land, or a dungeon's floor.
  standable(x, z) { return inPocket(x) ? !!this.interiorAt(x, z)?.standable(x, z) : !this.isWater(x, z); }
  addInterior(it) {
    this.interiors.get(it.id)?.detach();
    this.interiors.set(it.id, it);
    it.attach(this);
    return it;
  }
  removeInterior(id) {
    const it = this.interiors.get(id);
    if (!it) return;
    it.detach();
    this.interiors.delete(id);
  }
  // A story place's point of interest by its key (world/story.js): 'foundry', 'vault'…
  storyPlace(key) {
    const S = storyPlaces(this.gen)[key];
    return S ? this.gen.region(S.rx, S.rz).pois.find((p) => p.story === key) ?? null : null;
  }
  // The encounters near (x, z) for the world sim: the land's camps, or a dungeon's rooms.
  campsNear(x, z, r) {
    if (!inPocket(x)) return this.poisNear(x, z, r, ['camp']);
    const it = this.interiorAt(x, z);
    return it ? it.camps.filter((c) => Math.hypot(c.x - x, c.z - z) <= r + c.radius) : [];
  }

  biomeAt(x, z) { return this.gen.biomeAt(x, z); }
  regionAt(x, z) { return this.gen.regionAt(x, z); }
  isWater(x, z) { return this.groundHeight(x, z) < WATER_LEVEL - 0.15; }
  nearRoad(x, z) { return this.gen.nearRoad(x, z); }

  // First intersection of a ray with the terrain (any direction), or Infinity.
  raycastGround(o, d, maxT = 200) {
    const step = 0.75;
    let prevT = 0;
    if (o.y - this.groundHeight(o.x, o.z) < 0) return 0;
    for (let t = step; t <= maxT; t += step) {
      const above = o.y + d.y * t - this.groundHeight(o.x + d.x * t, o.z + d.z * t);
      if (above < 0) {
        let a = prevT;
        let b = t;
        for (let i = 0; i < 8; i++) {
          const m = (a + b) / 2;
          if (o.y + d.y * m - this.groundHeight(o.x + d.x * m, o.z + d.z * m) < 0) b = m; else a = m;
        }
        return (a + b) / 2;
      }
      prevT = t;
    }
    return Infinity;
  }

  cellKey(ix, iz) { return (ix + 40000) * 80000 + (iz + 40000); }

  // An axis-aligned box (a wall, a door): `hx` and `hz` its half sizes; `r` bounds it for the grid.
  addBox(x, z, hx, hz, h = 3, y = this.groundHeight(x, z)) {
    return this.addOrientedBox(x, z, hx, hz, 0, h, y);
  }

  addOrientedBox(x, z, hx, hz, ry, h = 3, y = this.groundHeight(x, z)) {
    const c = this.addCollider(x, z, Math.hypot(hx, hz), h, y);
    c.box = true;
    c.hx = hx;
    c.hz = hz;
    c.ry = ry;
    return c;
  }

  addCollider(x, z, r, h = 3, y = this.groundHeight(x, z)) {
    const c = { x, z, r, h, y, cells: [] };
    this.colliders.add(c);
    for (let ix = Math.floor((x - r) / GRID); ix <= Math.floor((x + r) / GRID); ix++) {
      for (let iz = Math.floor((z - r) / GRID); iz <= Math.floor((z + r) / GRID); iz++) {
        const k = this.cellKey(ix, iz);
        let cell = this.grid.get(k);
        if (!cell) this.grid.set(k, (cell = []));
        cell.push(c);
        c.cells.push(k);
      }
    }
    this.own?.colliders.push(c);
    return c;
  }

  removeCollider(c) {
    if (!this.colliders.delete(c)) return;
    for (const k of c.cells) {
      const cell = this.grid.get(k);
      if (!cell) continue;
      const i = cell.indexOf(c);
      if (i !== -1) cell.splice(i, 1);
      if (!cell.length) this.grid.delete(k);
    }
  }

  collidersNear(x, z, r = 0) {
    const out = [];
    for (let ix = Math.floor((x - r) / GRID); ix <= Math.floor((x + r) / GRID); ix++) {
      for (let iz = Math.floor((z - r) / GRID); iz <= Math.floor((z + r) / GRID); iz++) {
        const cell = this.grid.get(this.cellKey(ix, iz));
        if (cell) for (const c of cell) if (!out.includes(c)) out.push(c);
      }
    }
    return out;
  }

  // Colliders in grid cells along a ray (coarse broad-phase for aiming / camera).
  collidersAlongRay(o, d, maxT) {
    const seen = new Set();
    const steps = Math.ceil(Math.min(maxT, 200) / (GRID / 2));
    for (let i = 0; i <= steps; i++) {
      const t = Math.min(maxT, i * (GRID / 2));
      for (const c of this.collidersNear(o.x + d.x * t, o.z + d.z * t, GRID / 2)) seen.add(c);
    }
    return seen;
  }

  // Highest standable surface at (x, z) not above maxY (terrain or collider tops).
  supportHeight(x, z, maxY = Infinity) {
    let h = this.groundHeight(x, z);
    for (const c of this.collidersNear(x, z)) {
      const top = c.y + c.h;
      if (top <= h || top > maxY) continue;
      const dx = x - c.x;
      const dz = z - c.z;
      const angle = c.ry ?? 0;
      const lx = Math.cos(angle) * dx - Math.sin(angle) * dz;
      const lz = Math.sin(angle) * dx + Math.cos(angle) * dz;
      if (c.box ? Math.abs(lx) < c.hx && Math.abs(lz) < c.hz : dx * dx + dz * dz < c.r * c.r) h = top;
    }
    return h;
  }

  // Pushes a circle at `pos` out of colliders it overlaps vertically. stepUp lets a mover ignore
  // colliders whose top is within that height of its feet.
  resolve(pos, radius, stepUp = 0, height = 1.8) {
    for (const c of this.collidersNear(pos.x, pos.z, radius)) {
      if (pos.y + stepUp >= c.y + c.h || pos.y + height <= c.y) continue;
      if (c.box) { pushOutOfBox(pos, radius, c); continue; }
      const dx = pos.x - c.x;
      const dz = pos.z - c.z;
      const min = c.r + radius;
      const d2 = dx * dx + dz * dz;
      if (d2 >= min * min) continue;
      const d = Math.sqrt(d2) || 0.001;
      pos.x = c.x + (dx / d) * min;
      pos.z = c.z + (dz / d) * min;
    }
  }

  blocks(pos) {
    for (const c of this.collidersNear(pos.x, pos.z)) {
      const dx = pos.x - c.x;
      const dz = pos.z - c.z;
      const angle = c.ry ?? 0;
      const lx = Math.cos(angle) * dx - Math.sin(angle) * dz;
      const lz = Math.sin(angle) * dx + Math.cos(angle) * dz;
      const inside = c.box ? Math.abs(lx) < c.hx && Math.abs(lz) < c.hz : dx * dx + dz * dz < c.r * c.r;
      if (inside && pos.y >= c.y && pos.y <= c.y + c.h) return true;
    }
    return false;
  }

  inBounds(pos) {
    const yLimit = inPocket(pos.x) || inPocket(this.focus.x) ? 800 : 260;
    if (pos.y >= yLimit || pos.y <= -60) return false;
    const d2 = Math.hypot(pos.x - this.focus.x, pos.z - this.focus.z);
    // Pocket spaces are local maps (the whole dungeon sits far away from the overworld), so the
    // regular 600 m world cull would prune shots and abilities before they do anything useful.
    if (inPocket(pos.x) || inPocket(this.focus.x)) return d2 < 2000;
    return d2 < 600;
  }

  // The hub, a settlement (a hamlet, village, town or city) or a camp at (x, z) (for banners,
  // footsteps and scatter), else null. `pad` widens the safe places — roaming packs keep further
  // off.
  zoneAt(x, z, pad = 0) {
    if (inPocket(x)) return null;
    if (Math.hypot(x - HUB.x, z - HUB.z) < HUB.radius + 4 + pad) return HUB;
    for (const r of this.gen.regionsNear(x, z, this._zr ??= [])) {
      for (const p of r.pois) {
        if (p.type === 'camp' && Math.hypot(x - p.x, z - p.z) < p.radius + 8) return p;
        if (PLACES.has(p.type) && Math.hypot(x - p.x, z - p.z) < placeReach(p) + 6 + pad) return p;
      }
    }
    return null;
  }

  // The district of a city you're in, if you are.
  districtAt(x, z) {
    if (inPocket(x)) return null;
    for (const r of this.gen.regionsNear(x, z, this._dr ??= [])) {
      for (const p of r.pois) if (p.type === 'district' && Math.hypot(x - p.x, z - p.z) < p.r + 2) return p;
    }
    return null;
  }

  // One of the folk (or a service that stands where folk would: a board, a gate) by id: the hub's
  // hand-placed ones (world/mapData.js), or a place's, wherever Gen put them — loaded or not. A
  // board's job slots ("…#1") are the board. `near` (a position): only look in the regions round
  // it (the server asks on a player's behalf).
  npcById(id, near = null) {
    if (typeof id !== 'string' || id.length > 40) return null;
    id = id.split('#')[0];
    const fixed = FOLK.get(id);
    if (fixed) return fixed;
    const [kind, key] = id.split(':');
    if (kind !== 'n' || !key) return null;
    const [rx, rz] = key.split(',').map(Number);
    if (!Number.isInteger(rx) || !Number.isInteger(rz)) return null;
    if (near) {
      const [cx, cz] = this.gen.cellOf(near.x, near.z);
      if (Math.abs(rx - cx) > 2 || Math.abs(rz - cz) > 2) return null;
    }
    for (const p of this.gen.region(rx, rz).pois) {
      const n = p.npcs?.find((m) => m.id === id);
      if (n) {
        n.place ??= p.id;
        return n;
      }
    }
    return null;
  }

  // The place one of the folk belongs to (a village, a town, a city's district…).
  placeOf(npc) {
    if (!npc?.place) return npc && FOLK.has(npc.id) ? this.poiById('hub') : null;
    return this.poiById(npc.place);
  }

  // Folk of a role within `reach` of (x, z) — traders, innkeepers, smiths — the hub's and every
  // place's, from the generator (a place's folk stand within its radius, so the regions round
  // (x, z) hold them).
  folkNear(x, z, reach, role) {
    const out = [];
    if (inPocket(x)) return out;
    for (const n of NPCS) if (n.role === role && Math.hypot(n.x - x, n.z - z) <= reach) out.push(n);
    for (const r of this.gen.regionsNear(x, z, this._fr ??= [])) {
      for (const p of r.pois) {
        if (!p.npcs || Math.hypot(p.x - x, p.z - z) > reach + 40) continue;
        for (const n of p.npcs) if (n.role === role && Math.hypot(n.x - x, n.z - z) <= reach) out.push(n);
      }
    }
    return out;
  }

  // The landmark you're at (within sight of its foot), else null.
  landmarkAt(x, z) {
    if (inPocket(x)) return null;
    for (const r of this.gen.regionsNear(x, z, this._lr ??= [])) {
      for (const p of r.pois) if (p.type === 'landmark' && Math.hypot(x - p.x, z - p.z) < p.r + 14) return p;
    }
    return null;
  }

  // Every POI of the given types within `radius` of (x, z), from the generator (loaded or not).
  poisNear(x, z, radius, types = null) {
    const out = [];
    if (inPocket(x)) return out;
    const span = Math.ceil(radius / REGION) + 1;
    const [cx, cz] = this.gen.cellOf(x, z);
    for (let dx = -span; dx <= span; dx++) {
      for (let dz = -span; dz <= span; dz++) {
        const r = this.gen.region(cx + dx, cz + dz);
        for (const p of r.pois) {
          if (types && !types.includes(p.type)) continue;
          if (Math.hypot(p.x - x, p.z - z) <= radius) out.push(p);
        }
      }
    }
    return out;
  }

  poiById(id) {
    const key = id === 'w-hub' || id === 'hub' ? '0,0' : id.split(':')[1];
    if (!key) return null;
    const [rx, rz] = key.split(',').map(Number);
    return this.gen.region(rx, rz).pois.find((p) => p.id === id) ?? null;
  }

  // ------------------------------------------------------------ streaming
  update(dt, time, focus) {
    this.focus.copy(focus);
    const snap = 90 / 2048;
    const fx = Math.round(focus.x / snap) * snap;
    const fz = Math.round(focus.z / snap) * snap;
    this.sun.position.set(fx + 18, focus.y + 34, fz + 12);
    this.sun.target.position.set(fx, focus.y, fz);
    this.water.position.set(Math.round(focus.x / CHUNK) * CHUNK, WATER_LEVEL, Math.round(focus.z / CHUNK) * CHUNK);
    // Down in a dungeon the land stays as it was left (nothing of it streams in out there).
    const below = inPocket(focus.x);
    if (!below && this.planned.distanceTo(focus) > 10) this.plan(focus);
    if (!below) this.work(BUDGET_MS);
    for (const f of this.flames) {
      const k = 1 + Math.sin(time * 13 + f.seed) * 0.08 + Math.sin(time * 7.3 + f.seed) * 0.06;
      f.group.scale.set(k, 1 + (k - 1) * 2.5, k);
      if (f.light) f.light.intensity = f.base * (0.85 + (k - 1) * 2);
    }
    for (const s of this.shards) {
      s.group.rotation.y = time * 0.3 + s.seed;
      s.group.position.y = s.base + Math.sin(time * 0.8 + s.seed) * 0.5;
    }
    for (const s of this.spinners) s.group.rotation.z = time * s.speed;
    if (!below) this.updateSky(dt, focus);
    for (const w of this.waystones.values()) {
      w.crystal.rotation.y = time * 1.2;
      w.ring.rotation.z = time * (w.active ? 2.4 : 0.4);
      w.crystal.position.y = 3.3 + Math.sin(time * 2 + w.seed) * 0.12;
    }
  }

  // The sky and fog drift towards the colour (and depth) of the biome underfoot.
  updateSky(dt, focus) {
    this.skyTimer -= dt;
    if (this.skyTimer <= 0) {
      this.skyTimer = 0.5;
      this.skyBiome = this.gen.biomeAt(focus.x, focus.z);
    }
    const s = this.scene;
    if (!s.fog || !s.background?.isColor) return;
    const k = 1 - Math.exp(-Math.min(dt, 0.1) * 0.7);
    s.background.lerp(_col.set(SKY[this.skyBiome] ?? SKY.meadow), k);
    s.fog.color.copy(s.background);
    const [near, far] = FOG[this.skyBiome] ?? FOG_DEFAULT;
    s.fog.near += (near - s.fog.near) * k;
    s.fog.far += (far - s.fog.far) * k;
  }

  // Switches to another world (new game / loading a save): everything streamed out, new generator.
  setSeed(seed) {
    seed >>>= 0;
    if (seed === this.seed) return;
    for (const ch of this.chunks.values()) this.unloadChunk(ch);
    this.chunks.clear();
    for (const [id, o] of [...this.pois]) this.unload(o, this.pois, id);
    for (const [k, o] of [...this.roads]) this.unload(o, this.roads, k);
    this.tiles.clear();
    this.jobs = [];
    this.planned.set(1e9, 0, 1e9);
    this.seed = seed;
    this.gen = new WorldGen(seed);
    this.packScenery();
  }

  // Loads everything around `focus` immediately (new game, fast travel).
  prime(focus) {
    this.focus.copy(focus);
    if (inPocket(focus.x)) return;
    this.plan(focus);
    this.work(Infinity);
  }

  // Works out what should be loaded around `focus` and queues the jobs, nearest first.
  plan(focus) {
    this.planned.copy(focus);
    const fcx = Math.floor(focus.x / CHUNK);
    const fcz = Math.floor(focus.z / CHUNK);
    const want = new Set();
    const jobs = [];
    for (let dx = -VIEW; dx <= VIEW; dx++) {
      for (let dz = -VIEW; dz <= VIEW; dz++) {
        const cx = fcx + dx;
        const cz = fcz + dz;
        const k = ckey(cx, cz);
        want.add(k);
        const d = Math.hypot((cx + 0.5) * CHUNK - focus.x, (cz + 0.5) * CHUNK - focus.z);
        const lod = d < LOD0_DIST ? 0 : d < LOD1_DIST ? 1 : 2;
        let ch = this.chunks.get(k);
        if (!ch) {
          ch = new Chunk(this.gen, cx, cz);
          this.chunks.set(k, ch);
        }
        ch.dist = d;
        ch.wantHeights = d < HEIGHT_DIST;
        ch.wantLod = lod;
        ch.wantDetail = d < DETAIL_DIST;
        ch.wantColliders = d < COLLIDE_DIST;
        if (ch.wantHeights !== !!ch.heights || ch.lod !== lod || ch.wantDetail !== !!ch.detail || ch.wantColliders !== ch.collided || !ch.scenery) jobs.push({ d, run: () => this.syncChunk(ch) });
      }
    }
    for (const [k, ch] of this.chunks) {
      if (want.has(k)) continue;
      this.unloadChunk(ch);
      this.chunks.delete(k);
    }
    // Points of interest and roads in reach.
    const span = Math.ceil(POI_LOAD / REGION) + 1;
    const [rcx, rcz] = this.gen.cellOf(focus.x, focus.z);
    for (let dx = -span; dx <= span; dx++) {
      for (let dz = -span; dz <= span; dz++) {
        const r = this.gen.region(rcx + dx, rcz + dz);
        for (const p of r.pois) {
          const d = Math.hypot(p.x - focus.x, p.z - focus.z);
          if (d < (BIG.has(p.type) ? LANDMARK_LOAD : POI_LOAD) && !this.pois.has(p.id)) jobs.push({ d, run: () => this.loadPoi(p) });
        }
        const rd = Math.hypot(r.x - focus.x, r.z - focus.z);
        if (rd < ROAD_LOAD && r.roads.length && !this.roads.has(r.key)) jobs.push({ d: rd, run: () => this.loadRoads(r) });
      }
    }
    for (const [id, o] of this.pois) if (Math.hypot(o.poi.x - focus.x, o.poi.z - focus.z) > (BIG.has(o.poi.type) ? LANDMARK_UNLOAD : POI_UNLOAD)) this.unload(o, this.pois, id);
    for (const [k, o] of this.roads) if (Math.hypot(o.region.x - focus.x, o.region.z - focus.z) > ROAD_UNLOAD) this.unload(o, this.roads, k);
    jobs.sort((a, b) => a.d - b.d);
    this.jobs = jobs;
  }

  work(budget) {
    const t0 = performance.now();
    let n = 0;
    while (this.jobs.length && (n === 0 || performance.now() - t0 < budget)) {
      this.jobs.shift().run();
      n++;
    }
    if (n && this.sceneryDirty) this.packScenery();
  }

  syncChunk(ch) {
    if (!this.chunks.has(ckey(ch.cx, ch.cz))) return;
    if (ch.wantHeights && !ch.heights) ch.ensureHeights();
    if (ch.lod !== ch.wantLod) {
      const fresh = !ch.mesh;
      ch.buildMesh(ch.wantLod);
      if (fresh) this.root.add(ch.mesh);
      if (ch.tile) this.tiles.set(ckey(ch.cx, ch.cz), ch.tile);
    }
    if (!ch.wantHeights && ch.heights) ch.dropHeights();
    if (!ch.scenery) {
      this.scatterChunk(ch);
      this.sceneryDirty = true;
    }
    if (ch.wantDetail !== !!ch.detail) {
      ch.detail = ch.wantDetail;
      this.sceneryDirty = true;
    }
    if (ch.wantColliders && !ch.collided) {
      this.own = ch;
      for (const c of ch.sceneryColliders) this.addCollider(c.x, c.z, c.r, c.h, c.y);
      this.own = null;
      ch.collided = true;
    } else if (!ch.wantColliders && ch.collided) {
      for (const c of ch.colliders) this.removeCollider(c);
      ch.colliders.length = 0;
      ch.collided = false;
    }
  }

  unloadChunk(ch) {
    if (ch.mesh) this.root.remove(ch.mesh);
    ch.dispose();
    for (const c of ch.colliders) this.removeCollider(c);
    ch.colliders.length = 0;
    if (ch.scenery) this.sceneryDirty = true;
    ch.scenery = null;
  }

  unload(o, map, id) {
    if (o.poi) this.onPoiUnload?.(o.poi, o);
    this.root.remove(o.group);
    disposeObject(o.group);
    for (const c of o.colliders) this.removeCollider(c);
    this.flames = this.flames.filter((f) => f.owner !== o);
    this.shards = this.shards.filter((s) => s.owner !== o);
    this.spinners = this.spinners.filter((s) => s.owner !== o);
    for (const [id, pr] of this.objectParts) if (pr.owner === o) this.objectParts.delete(id);
    if (o.waystone) this.waystones.delete(o.waystone);
    if (o.chest) this.chests.delete(o.chest);
    map.delete(id);
  }

  // Map tile for an explored chunk (painted on demand if it was never loaded this session).
  tileFor(cx, cz) {
    const k = ckey(cx, cz);
    let t = this.tiles.get(k);
    if (!t) {
      const ch = new Chunk(this.gen, cx, cz);
      ch.buildMesh(2);
      ch.dispose();
      t = ch.tile;
      this.tiles.set(k, t);
    }
    return t;
  }

  // ------------------------------------------------------------ scenery
  buildScenerySets() {
    this.sets = {};
    for (const [k, [geo, color, outline, cap, shadow, wind = null]] of Object.entries(sceneryTypes())) {
      const inst = instancedToon(geo, color, cap, { outline, castShadow: shadow, wind });
      inst.group.traverse((o) => { o.frustumCulled = false; });
      inst.finish(0);
      this.root.add(inst.group);
      this.sets[k] = { inst, cap, body: inst.group.children[0], hull: inst.group.children[1] ?? null };
      // Small things that never had an ink hull (grass tufts, reeds, flowers) get no screen-space
      // ink either: at their size it would turn them black.
      if (!outline) noInk(this.sets[k].body.material);
    }
    for (const [k, [geo, cap]] of Object.entries(FLORA_TYPES)) {
      const mesh = new THREE.InstancedMesh(geo, noInk(new THREE.MeshBasicMaterial({ color: 0xffffff })), cap);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
      mesh.frustumCulled = false;
      mesh.count = 0;
      this.root.add(mesh);
      this.sets[k] = { mesh, cap, colors: true };
    }
  }

  // Deterministic scatter for one chunk: per-type instance matrices (and flora colours), plus the
  // colliders for trees and rocks. Clear of camps, landmarks, roads and water.
  scatterChunk(ch) {
    const rnd = mulberry32(hashStr(`${this.seed}:${ch.cx},${ch.cz}`));
    const gen = this.gen;
    const lists = {};
    const colors = {};
    const colliders = [];
    const push = (k, x, y, z, s, { ry = rnd() * Math.PI * 2, sy = s, tilt = 0, color = null } = {}) => {
      _e.set(tilt * (rnd() - 0.5), ry, tilt * (rnd() - 0.5));
      _m.compose(_v.set(x, y, z), _q.setFromEuler(_e), _s.set(s, sy, s));
      (lists[k] ??= []).push(..._m.elements);
      if (color !== null) (colors[k] ??= []).push(color.r, color.g, color.b);
    };
    const pois = this.poisNear(ch.x0 + CHUNK / 2, ch.z0 + CHUNK / 2, CHUNK + 40);
    const blocked = (x, z) => {
      for (const p of pois) {
        const pad = p.type === 'hub' ? HUB.radius + 6 : p.type === 'camp' ? p.radius + (p.stronghold ? 12 : 5)
          : PLACES.has(p.type) ? placeReach(p) + 6 : ['district', 'citywall', 'hubtown'].includes(p.type) ? 0 : p.type === 'landmark' ? p.r + 3
            : p.type === 'story' ? p.r + 6 : p.type === 'tower' ? 6 : p.type === 'ruin' ? p.r + 4 : p.type === 'mesa' ? 0 : 3;
        if (pad && Math.hypot(x - p.x, z - p.z) < pad) return true;
      }
      return gen.nearRoad(x, z);
    };
    const STEP = 5;
    for (let gx = 0; gx < CHUNK; gx += STEP) {
      for (let gz = 0; gz < CHUNK; gz += STEP) {
        const x = ch.x0 + gx + rnd() * STEP;
        const z = ch.z0 + gz + rnd() * STEP;
        const biome = gen.biomeAt(x, z);
        const roll = rnd();
        const near = Math.hypot(x, z) < 22;
        const y = this.analyticHeight(x, z);
        if (y < WATER_LEVEL + 0.3 || near || blocked(x, z)) continue;
        const slope = this.slopeFast(x, z);
        // Glowing flora and ground cover.
        const fr = rnd();
        if (fr < (biome === 'crystal' ? 0.09 : 0.035) && slope < 0.9 && !(biome === 'meadow' && rnd() < 0.85)) {
          _col.set(FLORA_COLOR[biome]);
          for (let k = 0; k < 3; k++) {
            if (biome === 'forest' || biome === 'marsh') {
              const s = 0.6 + rnd() * 0.7;
              const px = x + (rnd() - 0.5) * 1.2;
              const pz = z + (rnd() - 0.5) * 1.2;
              push('stem', px, y, pz, s, { ry: 0 });
              push('cap', px, y, pz, s, { ry: 0, color: _col });
            } else push('shard', x + (rnd() - 0.5) * 0.8, y, z + (rnd() - 0.5) * 0.8, 0.5 + rnd() * 0.9, { tilt: 0.8, color: _col });
          }
        }
        if (TUFTS.has(biome) && slope < 0.8) {
          for (let k = 0; k < 3; k++) {
            const tx = x + (rnd() - 0.5) * STEP;
            const tz = z + (rnd() - 0.5) * STEP;
            const ty = this.analyticHeight(tx, tz);
            if (ty < WATER_LEVEL + 0.2) continue;
            const s = 0.6 + rnd() * 0.9;
            push('tuft', tx, ty, tz, s, { tilt: 0.4 });
            if (biome === 'meadow' && rnd() < 0.25) push(['flowerY', 'flowerW', 'flowerP', 'flowerB'][Math.floor(rnd() * 4)], tx + 0.2, ty + 0.28 * s, tz + 0.1, 1, { ry: 0 });
          }
        }
        const dens = DENSITY[biome];
        let acc = 0;
        let kind = null;
        for (const [k, p] of Object.entries(dens)) {
          acc += p;
          if (roll < acc) { kind = k; break; }
        }
        if (!kind || (slope > 0.9 && kind !== 'boulder' && kind !== 'rock')) continue;
        const s = 0.75 + rnd() * 0.7;
        if (kind === 'pine' || kind === 'round' || kind === 'snowPine') {
          push(kind, x, y - 0.1, z, s);
          const m = lists[kind].slice(-16);
          (lists.trunk ??= []).push(...m);
          colliders.push({ x, z, r: 0.4 * s, h: 6 * s, y });
        } else if (kind === 'palm') {
          push('palm', x, y - 0.1, z, s, { tilt: 0.3 });
          (lists.tallTrunk ??= []).push(...lists.palm.slice(-16));
          colliders.push({ x, z, r: 0.35 * s, h: 6.5 * s, y });
        } else if (kind === 'shroom') {
          const ss = s * (0.8 + rnd() * 0.9);
          push('shroomCap', x, y - 0.05, z, ss, { tilt: 0.2 });
          (lists.shroomStem ??= []).push(...lists.shroomCap.slice(-16));
          colliders.push({ x, z, r: 0.45 * ss, h: 3.6 * ss, y });
        } else if (kind === 'cactus') {
          push('cactus', x, y - 0.1, z, s, { tilt: 0.12 });
          colliders.push({ x, z, r: 0.45 * s, h: 4.4 * s, y });
        } else if (kind === 'hoodoo') {
          const hs = 0.8 + rnd() * 0.9;
          push('hoodoo', x, y - 0.3, z, hs, { tilt: 0.1 });
          colliders.push({ x, z, r: 1.3 * hs, h: 6 * hs, y });
        } else if (kind === 'crystal') {
          const cs = 0.7 + rnd() * 1.2;
          push('crystal', x, y - 0.15, z, cs, { tilt: 0.4 });
          colliders.push({ x, z, r: 0.8 * cs, h: 2.4 * cs, y });
        } else if (kind === 'spire') {
          const cs = 0.6 + rnd() * 0.8;
          push('spire', x, y - 0.5, z, cs, { tilt: 0.35 });
          colliders.push({ x, z, r: 0.9 * cs, h: 8 * cs, y });
        } else if (kind === 'sandRock' || kind === 'redRock') {
          const rs = 0.5 + rnd() * 1.4;
          push(kind, x, y + rs * 0.25, z, rs, { sy: rs * 0.7, tilt: 3 });
          colliders.push({ x, z, r: rs * 0.85, h: rs, y });
        } else if (kind === 'fern' || kind === 'dryBush' || kind === 'puff') {
          push(kind, x, kind === 'puff' ? y + s * 0.3 : y, z, s * (kind === 'fern' ? 1.1 : 1), { sy: kind === 'dryBush' ? s * 0.7 : s, tilt: 0.3 });
        } else if (kind === 'dead' || kind === 'charred') {
          push(kind, x, y - 0.1, z, s);
          colliders.push({ x, z, r: 0.35 * s, h: 4 * s, y });
        } else if (kind === 'rock') {
          const rs = 0.4 + rnd() * 1.1;
          push('rock', x, y + rs * 0.25, z, rs, { sy: rs * 0.75, tilt: 3 });
          colliders.push({ x, z, r: rs * 0.85, h: rs, y });
        } else if (kind === 'boulder') {
          const bs = 1.8 + rnd() * 2.6;
          push('boulder', x, y + bs * 0.3, z, bs, { sy: bs * 0.8, tilt: 3 });
          colliders.push({ x, z, r: bs * 0.85, h: bs * 1.05, y });
        } else if (kind === 'bush') {
          push('bush', x, y + s * 0.3, z, s * 1.1, { sy: s * 0.75, tilt: 1 });
        } else if (kind === 'reed') {
          for (let k = 0; k < 4; k++) {
            const rx = x + (rnd() - 0.5) * 2;
            const rz = z + (rnd() - 0.5) * 2;
            push('reed', rx, this.analyticHeight(rx, rz), rz, 0.8 + rnd() * 0.6);
          }
        }
      }
    }
    const DETAIL = new Set(['tuft', 'flowerY', 'flowerW', 'flowerP', 'flowerB', 'stem', 'cap', 'shard']);
    ch.scenery = {};
    for (const [k, list] of Object.entries(lists)) ch.scenery[k] = { m: new Float32Array(list), c: colors[k] ? new Float32Array(colors[k]) : null, detail: DETAIL.has(k) };
    ch.sceneryColliders = colliders;
  }

  slopeFast(x, z) {
    const e = 1.5;
    const g = this.gen;
    return Math.hypot(g.height(x + e, z) - g.height(x - e, z), g.height(x, z + e) - g.height(x, z - e)) / (2 * e);
  }

  // Re-packs every loaded chunk's scenery into the shared instanced meshes.
  packScenery() {
    this.sceneryDirty = false;
    const counts = {};
    for (const [k, set] of Object.entries(this.sets)) {
      let n = 0;
      const target = set.colors ? set.mesh : set.body;
      const arr = target.instanceMatrix.array;
      const colArr = set.colors ? set.mesh.instanceColor.array : null;
      for (const ch of this.chunks.values()) {
        const sc = ch.scenery?.[k];
        if (!sc || (sc.detail && !ch.detail)) continue;
        const cnt = Math.min(sc.m.length / 16, set.cap - n);
        if (cnt <= 0) break;
        arr.set(cnt * 16 === sc.m.length ? sc.m : sc.m.subarray(0, cnt * 16), n * 16);
        if (colArr && sc.c) colArr.set(sc.c.subarray(0, cnt * 3), n * 3);
        n += cnt;
      }
      counts[k] = n;
      // Most biomes use a few of the sets: an empty one would still cost a draw (and a shadow
      // draw) every frame.
      (set.colors ? set.mesh : set.body).visible = n > 0;
      if (set.colors) {
        set.mesh.count = n;
        set.mesh.instanceMatrix.needsUpdate = true;
        set.mesh.instanceColor.needsUpdate = true;
      } else {
        set.body.count = n;
        set.body.instanceMatrix.needsUpdate = true;
        if (set.hull) {
          set.hull.instanceMatrix.array.set(arr.subarray(0, n * 16));
          set.hull.count = n;
          set.hull.instanceMatrix.needsUpdate = true;
        }
      }
    }
    this.sceneryCounts = counts;
  }

  // ------------------------------------------------------------ points of interest
  loadPoi(p) {
    if (this.pois.has(p.id)) return;
    const o = { poi: p, group: new THREE.Group(), colliders: [] };
    this.own = o;
    this.rnd = mulberry32(hashStr(p.id) ^ this.seed);
    switch (p.type) {
      case 'hub': this.buildHub(); break;
      case 'camp': this.buildCamp(p); break;
      case 'tower': this.buildTower(p); break;
      case 'ruin': this.buildRuin(p); break;
      case 'mesa': this.buildMesa(p); break;
      case 'waystone': this.buildWaystone(p); break;
      case 'chest': this.buildChest(p); break;
      case 'landmark': LANDMARK_BUILDERS[p.kind]?.(this, p); break;
      case 'settlement': SETTLEMENT_BUILDERS[p.kind]?.(this, p); serviceProps(this, p); placeObjects(this, p); break;
      case 'hamlet': HAMLET_BUILDERS[p.kind]?.(this, p); break;
      case 'town': buildTown(this, p); break;
      case 'hubtown': buildBrightwater(this, this.poiById('hub')); break;
      case 'city': buildCity(this, p); break;
      case 'citywall': buildCityWall(this, p); break;
      case 'district': DISTRICT_BUILDERS[p.kind]?.(this, p); break;
      case 'story': STORY_BUILDERS[p.kind]?.(this, p); break;
    }
    // The story's own touches on a camp or a landmark, and the objects quests use there.
    if (p.story === 'foundry') foundryYard(this, p);
    if (p.story && p.type !== 'story') placeObjects(this, p);
    this.onPoiLoad?.(p, o);
    this.own = null;
    this.rnd = Math.random;
    this.root.add(o.group);
    this.pois.set(p.id, o);
  }

  setWaystoneActive(id, active) {
    const w = this.waystones.get(id);
    if (!w) return;
    w.active = active;
    w.crystal.traverse((o) => { if (o.isMesh && o.material.color) o.material.color.set(active ? 0x7fe8ff : 0x7a7a8a); });
  }

  setChestOpen(id, open) {
    const c = this.chests.get(id);
    if (!c) return;
    c.open = open;
    c.lid.rotation.x = open ? -1.9 : 0;
  }

  // ------------------------------------------------------------ build helpers
  setupLighting() {
    const s = this.scene;
    s.background = new THREE.Color(0xa6d8f2);
    s.fog = new THREE.Fog(0xa6d8f2, 80, 240);
    this.hemi = new THREE.HemisphereLight(0xdff1ff, 0x6a8f5a, 0.7);
    s.add(this.hemi);
    const sun = (this.sun = new THREE.DirectionalLight(0xfff4e0, 2.6));
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = sc.bottom = -45;
    sc.right = sc.top = 45;
    sc.near = 1;
    sc.far = 120;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.04;
    s.add(sun, sun.target);
    // The hub reactor's glow is a permanent light (a changing light count would recompile every
    // shader as the hub streams in and out).
    this.hubLight = new THREE.PointLight(0x8ae8ff, 18, 16, 1.6);
    this.hubLight.position.set(HUB.x, 1.4, HUB.z);
    s.add(this.hubLight);
  }

  buildWater() {
    const geo = new THREE.PlaneGeometry(CHUNK * (VIEW * 2 + 4), CHUNK * (VIEW * 2 + 4)).rotateX(-Math.PI / 2);
    this.water = new THREE.Mesh(geo, toonMaterial(0x4aa8d8, { transparent: true, opacity: 0.82 }));
    this.water.receiveShadow = true;
    this.root.add(this.water);
  }

  // A group anchored on the terrain at (x, z).
  anchor(x, z, rot = 0) {
    const g = new THREE.Group();
    g.position.set(x, this.groundHeight(x, z), z);
    g.rotation.y = rot;
    return g;
  }

  finish(g) {
    bakeTree(g);
    (this.own?.group ?? this.root).add(g);
    return g;
  }

  flame(group, seed, light = null, base = 0) {
    const f = { group, seed, light, base, owner: this.own };
    this.flames.push(f);
    return f;
  }

  loadRoads(region) {
    const o = { region, group: new THREE.Group(), colliders: [] };
    this.own = o;
    const verts = [];
    const width = 2.8;
    const posts = [];
    for (const pts of region.roads) {
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, az] = pts[i];
        const [bx, bz] = pts[i + 1];
        const tl = Math.hypot(bx - ax, bz - az) || 1;
        const ox = (-(bz - az) / tl) * (width / 2);
        const oz = ((bx - ax) / tl) * (width / 2);
        const y = (x, z) => this.groundHeight(x, z) + 0.07;
        const A1 = [ax + ox, y(ax + ox, az + oz), az + oz];
        const A2 = [ax - ox, y(ax - ox, az - oz), az - oz];
        const B1 = [bx + ox, y(bx + ox, bz + oz), bz + oz];
        const B2 = [bx - ox, y(bx - ox, bz - oz), bz - oz];
        verts.push(...A1, ...B2, ...B1, ...A1, ...A2, ...B2);
        // Beacon posts every ~35 m, alternating sides.
        if (i % 14 === 6 && i < pts.length - 6) {
          const side = (i / 14) % 2 ? 1 : -1;
          const px = ax + (-(bz - az) / tl) * 2.4 * side;
          const pz = az + ((bx - ax) / tl) * 2.4 * side;
          if (!this.zoneAt(px, pz)) posts.push([px, this.groundHeight(px, pz), pz]);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, toonMaterial(C.dirt));
    mesh.material.side = THREE.DoubleSide;
    mesh.material.polygonOffset = true;
    mesh.material.polygonOffsetFactor = -2;
    mesh.receiveShadow = true;
    o.group.add(mesh);
    if (posts.length) {
      const postSet = instancedToon(new THREE.BoxGeometry(0.18, 1.6, 0.18).translate(0, 0.8, 0), C.metalDark, posts.length, { outline: 0.02 });
      const caps = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.16).scale(1, 1.5, 1).translate(0, 1.78, 0), new THREE.MeshBasicMaterial({ color: HEARTH }), posts.length);
      posts.forEach(([x, y, z], i) => {
        _m.makeTranslation(x, y, z);
        postSet.setMatrixAt(i, _m);
        caps.setMatrixAt(i, _m);
        this.addCollider(x, z, 0.2, 1.6, y);
      });
      postSet.finish();
      caps.instanceMatrix.needsUpdate = true;
      caps.computeBoundingSphere();
      o.group.add(postSet.group, caps);
    }
    this.own = null;
    this.root.add(o.group);
    this.roads.set(region.key, o);
  }

  // Hub reactor (cyan plasma), a camp fire barrel (orange) or a hive node (violet); flicker.
  campfire(x, z, { scale = 1, style = 'barrel' } = {}) {
    const g = this.anchor(x, z);
    g.scale.setScalar(scale);
    let flameY;
    let colors;
    if (style === 'reactor') {
      piece(g, G.cyl(1.15, 1.35, 0.35, 10), C.metalDark, { pos: [0, 0.17, 0] });
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        piece(g, G.box(0.22, 1.7, 0.22), C.metal, { pos: [Math.cos(a) * 0.9, 1.0, Math.sin(a) * 0.9], rot: [0, -a, 0] });
      }
      piece(g, G.torus(0.95, 0.08, Math.PI * 2, 6, 24), C.metal, { pos: [0, 1.85, 0], rot: [Math.PI / 2, 0, 0] });
      piece(g, G.torus(0.7, 0.04, Math.PI * 2, 4, 24), HEARTH, { pos: [0, 0.4, 0], rot: [Math.PI / 2, 0, 0], glow: true, outline: 0 });
      flameY = 0.45;
      colors = [HEARTH, 0xe6fdff];
    } else if (style === 'node') {
      // A resin mound split open on a glowing sac, ribs of chitin curling over it.
      piece(g, G.dodeca(0.8), C.resinDark, { pos: [0, 0.18, 0], scale: [1, 0.5, 1], outline: 0.02 });
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        piece(g, G.cone(0.1, 1.0, 5), C.chitin, { pos: [Math.cos(a) * 0.62, 0.62, Math.sin(a) * 0.62], rot: [-Math.sin(a) * 0.55, 0, Math.cos(a) * 0.55], outline: 0.012 });
      }
      flameY = 0.35;
      colors = [HIVE, 0xf0d8ff];
    } else {
      piece(g, G.cyl(0.42, 0.38, 0.9, 12), C.rust, { pos: [0, 0.45, 0] });
      for (const y of [0.15, 0.75]) piece(g, G.torus(0.43, 0.035, Math.PI * 2, 4, 14), C.metalDark, { pos: [0, y, 0], rot: [Math.PI / 2, 0, 0], outline: 0.01 });
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        piece(g, G.box(0.1, 0.12, 0.02), 0xff8a2a, { pos: [Math.cos(a) * 0.41, 0.45, Math.sin(a) * 0.41], rot: [0, -a + Math.PI / 2, 0], glow: true, outline: 0 });
      }
      flameY = 0.9;
      colors = [0xff7a1a, 0xffd84a];
    }
    bakeTree(g);
    const flame = new THREE.Group();
    flame.position.y = flameY;
    piece(flame, G.cone(0.38, 1.0, 7), colors[0], { pos: [0, 0.45, 0], glow: true, outline: 0.02 });
    piece(flame, G.cone(0.22, 0.7, 6), colors[1], { pos: [0, 0.35, 0.03], glow: true, outline: 0 });
    bakeTree(flame);
    g.add(flame);
    (this.own?.group ?? this.root).add(g);
    this.flame(flame, x * 7 + z);
    this.addCollider(x, z, (style === 'reactor' ? 1.3 : 0.5) * scale, style === 'reactor' ? 2.0 : 1.0);
  }

  // Hab domes for the hub; scrap shacks for scav camps.
  tent(x, z, rot, { r = 1.7, style = 'dome' } = {}) {
    const g = this.anchor(x, z, rot);
    if (style === 'dome') {
      piece(g, G.dome(r, 18, 8, 0.5), C.hab, { pos: [0, 0, 0], outline: 0.04 });
      piece(g, G.torus(r, 0.08, Math.PI * 2, 5, 24), C.metal, { pos: [0, 0.08, 0], rot: [Math.PI / 2, 0, 0], outline: 0.02 });
      for (const a of [0.9, 1.6, 2.3]) piece(g, G.torus(r * 0.98, 0.025, Math.PI, 4, 18), C.metal, { rot: [0, a, 0], outline: 0 });
      piece(g, G.box(0.8, 1.2, 0.5), C.metalDark, { pos: [0, 0.6, r - 0.15] });
      piece(g, G.box(0.6, 0.06, 0.05), HEARTH, { pos: [0, 1.22, r + 0.11], glow: true, outline: 0 });
      piece(g, G.box(0.5, 0.15, 0.04), HEARTH, { pos: [r * 0.62, r * 0.6, 0], rot: [0, Math.PI / 2, -0.7], glow: true, outline: 0 });
      piece(g, G.cyl(0.03, 0.03, 0.9, 4), C.metal, { pos: [-0.4, r + 0.3, -0.3], outline: 0.008 });
      piece(g, G.sphere(0.05, 6, 4), 0xff4a3a, { pos: [-0.4, r + 0.78, -0.3], glow: true, outline: 0 });
      this.finish(g);
      this.addCollider(x, z, r * 0.92, r * 0.9);
      return;
    }
    // Scrap shack: mismatched plates, slanted roof, glowing junk window, smoking pipe.
    const w = r * 1.5;
    const d = r * 1.3;
    const plates = [C.rust, C.metalDark, 0xb08a3e, C.rust];
    piece(g, G.box(w, 1.8, d), C.metalDark, { pos: [0, 0.9, 0] });
    plates.forEach((col, i) => piece(g, G.box(w * 0.48, 0.8, 0.04), col, { pos: [(i % 2 ? 0.25 : -0.25) * w, 0.5 + Math.floor(i / 2) * 0.8, d / 2 + 0.02], rot: [0, 0, (i - 1.5) * 0.04], outline: 0.012 }));
    piece(g, G.box(w * 1.15, 0.08, d * 1.25), C.rust, { pos: [0, 1.95, 0], rot: [0.18, 0, 0], outline: 0.02 });
    piece(g, G.box(0.6, 1.1, 0.06), 0x1a1a1e, { pos: [-w * 0.2, 0.55, d / 2 + 0.05], outline: 0 });
    piece(g, G.box(0.35, 0.25, 0.05), FORGE, { pos: [w * 0.27, 1.2, d / 2 + 0.05], glow: true, outline: 0.006 });
    piece(g, G.cyl(0.09, 0.09, 1.0, 8), C.metal, { pos: [w * 0.35, 2.3, -d * 0.2], outline: 0.01 });
    this.finish(g);
    this.addCollider(x, z, Math.max(w, d) * 0.62, 1.9);
  }

  crate(x, z, rot = 0, s = 1, y = null) {
    const g = this.anchor(x, z, rot);
    if (y !== null) g.position.y = y;
    const col = CARGO[Math.abs(Math.round(x * 3 + z * 7)) % CARGO.length];
    piece(g, G.box(0.9 * s, 0.9 * s, 0.9 * s), col, { pos: [0, 0.45 * s, 0] });
    for (const yy of [0.05, 0.85]) piece(g, G.box(0.95 * s, 0.1 * s, 0.95 * s), C.metalDark, { pos: [0, yy * s, 0], outline: 0.015 });
    piece(g, G.box(0.5 * s, 0.06 * s, 0.92 * s), HEARTH, { pos: [0, 0.6 * s, 0], glow: true, outline: 0 });
    this.finish(g);
    this.addCollider(x, z, 0.62 * s, 0.9 * s, g.position.y);
  }

  barrel(x, z) {
    const g = this.anchor(x, z);
    piece(g, G.cyl(0.36, 0.36, 1.0, 12), 0x8a2a2a, { pos: [0, 0.5, 0] });
    piece(g, G.cyl(0.37, 0.37, 0.12, 12), 0xd9a227, { pos: [0, 0.62, 0], outline: 0 });
    piece(g, G.cyl(0.18, 0.18, 0.08, 10), C.metal, { pos: [0, 1.03, 0], outline: 0.01 });
    piece(g, G.torus(0.37, 0.02, Math.PI * 2, 4, 16), HEARTH, { pos: [0, 0.3, 0], rot: [Math.PI / 2, 0, 0], glow: true, outline: 0 });
    this.finish(g);
    this.addCollider(x, z, 0.45, 1.0);
  }

  // A scav scrap barricade plate (world coordinates, inside group g).
  stake(g, x, z, h, lean = 0, ry = 0) {
    const y0 = this.groundHeight(x, z) - g.position.y;
    piece(g, G.box(0.7, h, 0.06), C.rust, { pos: [x - g.position.x, y0 + h / 2, z - g.position.z], rot: [lean * 0.6, ry, 0], outline: 0.015 });
    piece(g, G.cone(0.06, 0.3, 4), C.metal, { pos: [x - g.position.x, y0 + h + 0.12, z - g.position.z], rot: [lean * 0.6, ry, 0], outline: 0.01 });
  }

  // ------------------------------------------------------------ hub
  // Brightwater: the old camp (reactor, habs, Tobbin's kiosk, the comm mast) is its plaza; the
  // town round it ('hubtown', a part of its own) is world/Towns.js's.
  buildHub() {
    const H = HUB;
    this.campfire(H.x, H.z, { style: 'reactor' });
    for (const a of [0.6, 2.2, 3.9, 5.2]) this.tent(H.x + Math.cos(a) * 9.5, H.z + Math.sin(a) * 9.5, -a - Math.PI / 2, { r: 1.9 });

    // Trader kiosk
    const stall = this.anchor(H.x + 5, H.z - 5.6, -0.5);
    piece(stall, G.box(2.6, 0.95, 0.9), C.metalDark, { pos: [0, 0.48, 0] });
    piece(stall, G.box(2.62, 0.06, 0.92), HEARTH, { pos: [0, 0.9, 0], glow: true, outline: 0 });
    for (const x of [-1.25, 1.25]) piece(stall, G.box(0.1, 2.5, 0.1), C.metal, { pos: [x, 1.25, -0.4], outline: 0.012 });
    piece(stall, G.box(2.9, 0.08, 1.6), 0xb06a2a, { pos: [0, 2.5, 0.2], rot: [0.18, 0, 0], outline: 0.015 });
    piece(stall, G.box(1.6, 0.5, 0.04), 0xffb347, { pos: [0, 2.05, -0.38], glow: true, outline: 0.01 });
    piece(stall, G.box(0.3, 0.3, 0.3), CARGO[0], { pos: [-0.7, 1.12, 0], outline: 0.012 });
    piece(stall, G.cyl(0.12, 0.12, 0.4, 8), HEARTH, { pos: [0.6, 1.17, 0], glow: true, outline: 0.012 });
    this.finish(stall);
    this.addCollider(stall.position.x, stall.position.z, 1.3, 1);

    // Comm mast with holo emblem
    const mast = this.anchor(H.x - 5.8, H.z - 4.6);
    for (const [lx, lz] of [[-0.3, -0.3], [0.3, -0.3], [0, 0.3]]) piece(mast, G.cyl(0.04, 0.06, 5.2, 5), C.metal, { pos: [lx * 0.5, 2.6, lz * 0.5], outline: 0.01 });
    for (let i = 1; i < 5; i++) piece(mast, G.torus(0.2, 0.025, Math.PI * 2, 4, 10), C.metal, { pos: [0, i * 1.0, 0], rot: [Math.PI / 2, 0, 0], outline: 0 });
    piece(mast, G.dome(0.55, 12, 6), C.hab, { pos: [0.35, 4.7, 0], rot: [0, 0, -1.2], outline: 0.015 });
    piece(mast, G.sphere(0.08, 6, 4), 0xff4a3a, { pos: [0, 5.3, 0], glow: true, outline: 0 });
    piece(mast, G.box(1.1, 1.1, 0.02), 0x3d6fe0, { pos: [0.7, 3.0, 0], glow: true, outline: 0.01 });
    piece(mast, G.octa(0.22), 0xf0c75e, { pos: [0.7, 3.0, 0.03], scale: [1, 1, 0.3], glow: true, outline: 0 });
    this.finish(mast);
    this.addCollider(mast.position.x, mast.position.z, 0.4, 5);

    this.crate(H.x + 7.4, H.z - 3.2, 0.3);
    this.crate(H.x + 7.9, H.z - 2.0, 0.9, 0.8);
    this.barrel(H.x + 3.2, H.z - 7.2);
    this.barrel(H.x - 7.5, H.z + 2.5);
    this.crate(H.x - 2.5, H.z + 9.8, 0.4);

    // Shard posts and the hub's floating crystal.
    for (const [x, z] of [[-11, -9], [11, 8], [9, -11], [-12, 9]]) {
      const g = this.anchor(H.x + x, H.z + z);
      piece(g, G.cyl(0.08, 0.12, 3.2, 6), 0x3a3a44, { pos: [0, 1.6, 0], outline: 0.02 });
      piece(g, G.torus(0.22, 0.04, Math.PI * 2, 4, 12), 0xb08a3e, { pos: [0, 3.2, 0], rot: [Math.PI / 2, 0, 0], outline: 0.01 });
      piece(g, G.octa(0.16), RUNE, { pos: [0, 3.4, 0], scale: [1, 1.5, 1], glow: true, outline: 0.01 });
      this.finish(g);
      this.addCollider(H.x + x, H.z + z, 0.2, 3.2);
    }
    this.floatingShard(H.x - 10, 9, H.z + 10, 0.7);
  }

  floatingShard(x, y, z, s) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    piece(g, G.octa(1.0 * s), RUNE, { scale: [0.7, 2.2, 0.7], glow: true, outline: 0.04 });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      piece(g, G.octa(0.35 * s), 0xbff4ff, { pos: [Math.cos(a) * 2 * s, (i % 2 ? 0.6 : -0.6) * s, Math.sin(a) * 2 * s], scale: [0.6, 1.8, 0.6], glow: true, outline: 0.02 });
    }
    bakeTree(g);
    (this.own?.group ?? this.root).add(g);
    this.shards.push({ group: g, base: y, seed: x, owner: this.own });
  }

  // ------------------------------------------------------------ camps
  buildCamp(camp) {
    const rnd = this.rnd;
    const { x, z, radius: R } = camp;
    if (camp.style === 'fort') return this.buildFort(camp);
    const g = this.anchor(x, z);
    if (camp.style === 'scav') {
      this.campfire(x, z);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + rnd();
        this.tent(x + Math.cos(a) * (R - 2.5), z + Math.sin(a) * (R - 2.5), -a - Math.PI / 2, { r: 1.5, style: 'shack' });
      }
      // A junk radio mast with a skull, a clan banner and blinking lights.
      piece(g, G.cyl(0.12, 0.16, 3.4, 6), C.metalDark, { pos: [2.4, 1.7, -1.6] });
      for (let i = 0; i < 3; i++) piece(g, G.box(0.5 - i * 0.1, 0.3, 0.4), [C.rust, 0xb08a3e, C.metal][i], { pos: [2.4, 0.5 + i * 0.75, -1.6], rot: [0, i * 0.7, 0.1], outline: 0.012 });
      piece(g, G.sphere(0.28, 10, 8), C.bone, { pos: [2.4, 3.1, -1.6], scale: [1, 0.9, 1.1] });
      piece(g, G.dome(0.4, 10, 5), C.metal, { pos: [2.7, 3.5, -1.6], rot: [0, 0, -1.1], outline: 0.012 });
      for (const yy of [1.4, 2.2]) piece(g, G.sphere(0.06, 6, 4), FORGE, { pos: [2.55, yy, -1.45], glow: true, outline: 0 });
      piece(g, G.box(1.0, 0.7, 0.04), 0xb8342a, { pos: [2.9, 2.2, -1.6], outline: 0.02 });
      this.addCollider(x + 2.4, z - 1.6, 0.4, 3.4);
      for (let a = 0; a < Math.PI * 2; a += 0.55) {
        if (rnd() < 0.4) continue;
        const bx = x + Math.cos(a) * (R + 1.2);
        const bz = z + Math.sin(a) * (R + 1.2);
        for (const off of [-0.45, 0.45]) this.stake(g, bx + Math.cos(a + Math.PI / 2) * off, bz + Math.sin(a + Math.PI / 2) * off, 1.3 + rnd() * 0.5, -0.4, -a + Math.PI / 2);
        this.addCollider(bx, bz, 0.7, 1.4);
      }
      for (let i = 0; i < 4; i++) this.crate(x + (rnd() - 0.5) * R, z + (rnd() - 0.5) * R, rnd() * 3, 0.8 + rnd() * 0.4);
    } else if (camp.style === 'salvage') {
      this.campfire(x, z, { scale: 1.4 });
      for (let a = 0; a < Math.PI * 2; a += 0.42) {
        if (rnd() < 0.3) continue;
        const s = 1.2 + rnd() * 1.4;
        const bx = Math.cos(a) * (R + 1.5);
        const bz = Math.sin(a) * (R + 1.5);
        piece(g, G.dodeca(s), C.stone, { pos: [bx, s * 0.4, bz], rot: [rnd() * 3, rnd() * 3, 0], scale: [1, 0.8, 1] });
        this.addCollider(x + bx, z + bz, s * 0.85, s * 1.1);
      }
      // Scrap heap and slag furnace, where the juggernauts' suits are patched up.
      for (let i = 0; i < 7; i++) piece(g, G.box(0.6 + rnd() * 0.6, 0.15, 0.5 + rnd() * 0.5), [C.rust, C.metalDark, C.metal][i % 3], { pos: [-3 + (rnd() - 0.5) * 1.6, 0.2 + i * 0.12, 2 + (rnd() - 0.5) * 1.6], rot: [rnd(), rnd() * 3, rnd()], outline: 0.012 });
      this.addCollider(x - 3, z + 2, 1.2, 1.2);
      piece(g, G.cyl(1.0, 1.2, 1.8, 10), C.metalDark, { pos: [3, 0.9, -2.5] });
      piece(g, G.cyl(0.25, 0.3, 2.0, 8), C.metal, { pos: [3.4, 2.6, -2.8], outline: 0.012 });
      piece(g, G.box(0.7, 0.5, 0.1), FORGE, { pos: [3, 0.7, -1.38], glow: true, outline: 0.01 });
      piece(g, G.torus(0.95, 0.06, Math.PI * 2, 4, 16), FORGE, { pos: [3, 1.8, -2.5], rot: [Math.PI / 2, 0, 0], glow: true, outline: 0 });
      this.addCollider(x + 3, z - 2.5, 1.25, 2);
    } else if (camp.style === 'nest') {
      // The Hive: resin mounds ringing a glowing node, creep spread over the ground with light in
      // its veins, clutches of eggs, and chitin spires curving up out of it all.
      this.campfire(x, z, { style: 'node' });
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2 + rnd() * 0.3;
        const len = R * (0.45 + rnd() * 0.4);
        piece(g, G.box(0.08, 0.03, len), HIVE, { pos: [Math.cos(a) * len * 0.5, 0.08, Math.sin(a) * len * 0.5], rot: [0, -a + Math.PI / 2, 0], glow: true, outline: 0 });
      }
      piece(g, G.cyl(R * 0.62, R * 0.7, 0.08, 14), C.resin, { pos: [0, 0.02, 0], outline: 0.02 });
      for (let a = 0; a < Math.PI * 2; a += 0.42) {
        if (rnd() < 0.3) continue;
        const d = R - 0.5 + rnd() * 2;
        const bx = Math.cos(a) * d;
        const bz = Math.sin(a) * d;
        const s = 0.9 + rnd() * 1.2;
        const gy = this.groundHeight(x + bx, z + bz) - g.position.y;
        piece(g, G.dodeca(s), rnd() < 0.5 ? C.resin : C.resinDark, { pos: [bx, gy + s * 0.25, bz], rot: [rnd() * 3, rnd() * 3, 0], scale: [1, 0.75, 1], outline: 0.02 });
        if (rnd() < 0.35) piece(g, G.sphere(0.16, 8, 6), HIVE, { pos: [bx, gy + s * 0.75, bz], glow: true, outline: 0.01 });
        this.addCollider(x + bx, z + bz, s * 0.8, s);
      }
      // Clutches of eggs, each with a glowing seam.
      for (let i = 0; i < 4; i++) {
        const a = rnd() * Math.PI * 2;
        const d = R * (0.3 + rnd() * 0.4);
        const cx = Math.cos(a) * d;
        const cz = Math.sin(a) * d;
        const gy = this.groundHeight(x + cx, z + cz) - g.position.y;
        const n = 3 + Math.floor(rnd() * 3);
        for (let k = 0; k < n; k++) {
          const ex = cx + (rnd() - 0.5) * 1.2;
          const ez = cz + (rnd() - 0.5) * 1.2;
          const h = 0.45 + rnd() * 0.25;
          piece(g, G.sphere(0.3, 10, 8), C.egg, { pos: [ex, gy + h * 0.6, ez], scale: [0.9, h / 0.3 * 0.55, 0.9], outline: 0.012 });
          piece(g, G.box(0.04, h * 0.6, 0.02), HIVE, { pos: [ex, gy + h * 0.75, ez + 0.27], glow: true, outline: 0 });
        }
        this.addCollider(x + cx, z + cz, 0.9, 0.8);
      }
      // Chitin spires, bowed toward the node.
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + rnd();
        const d = R * 0.62;
        const px = Math.cos(a) * d;
        const pz = Math.sin(a) * d;
        const h = 3 + rnd() * 2;
        const gy = this.groundHeight(x + px, z + pz) - g.position.y;
        for (let k = 0; k < 3; k++) {
          const t = k / 3;
          const lean = 0.18 + t * 0.3;
          piece(g, G.cone(0.55 * (1 - t * 0.55), h * 0.42, 6), k % 2 ? C.chitin : C.resinDark, {
            pos: [px * (1 - t * 0.14), gy + h * (0.2 + t * 0.32), pz * (1 - t * 0.14)], rot: [Math.sin(a) * lean, 0, -Math.cos(a) * lean], outline: 0.025,
          });
        }
        piece(g, G.torus(0.42, 0.05, Math.PI * 2, 4, 12), HIVE, { pos: [px, gy + h * 0.3, pz], rot: [Math.PI / 2, 0, 0], glow: true, outline: 0 });
        this.addCollider(x + px, z + pz, 0.6, h);
      }
    } else if (camp.style === 'relay') {
      // Synths: a conduit platform round a humming pylon, cable runs and cargo pods.
      piece(g, G.cyl(R * 0.45, R * 0.48, 0.4, 16), C.metalDark, { pos: [0, 0.2, 0], outline: 0.03 });
      piece(g, G.torus(R * 0.45, 0.06, Math.PI * 2, 4, 32), ARC, { pos: [0, 0.42, 0], rot: [Math.PI / 2, 0, 0], glow: true, outline: 0 });
      piece(g, G.cyl(0.55, 0.8, 5.5, 8), C.steel, { pos: [0, 2.75, 0], outline: 0.03 });
      for (const y of [2, 3.6, 5]) piece(g, G.torus(0.95, 0.08, Math.PI * 2, 4, 20), ARC, { pos: [0, y, 0], rot: [Math.PI / 2, 0, 0], glow: true, outline: 0.01 });
      piece(g, G.octa(0.6), ARC, { pos: [0, 6.4, 0], scale: [1, 1.6, 1], glow: true, outline: 0.02 });
      this.addCollider(x, z, 0.9, 5.5);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + rnd() * 0.4;
        const px = Math.cos(a) * (R - 1.5);
        const pz = Math.sin(a) * (R - 1.5);
        piece(g, G.box(0.5, 3.2, 0.5), C.metalDark, { pos: [px, 1.6, pz], outline: 0.02 });
        piece(g, G.sphere(0.22, 8, 6), ARC, { pos: [px, 3.4, pz], glow: true, outline: 0.01 });
        piece(g, G.tube([[px, 0.15, pz], [px * 0.5, 0.05, pz * 0.5], [0, 0.4, 0]], 0.06, 10, 5), 0x2a2e36, { outline: 0.008 });
        this.addCollider(x + px, z + pz, 0.4, 3.2);
      }
      for (let i = 0; i < 3; i++) this.crate(x + (rnd() - 0.5) * R * 1.2, z + (rnd() - 0.5) * R * 1.2, rnd() * 3, 1 + rnd() * 0.3);
    } else {
      // The wild: a ring of boulders round a rocky overhang, a nest of branches and gnawed bones.
      for (let a = 0; a < Math.PI * 2; a += 0.5) {
        if (rnd() < 0.35) continue;
        const s = 1.0 + rnd() * 1.6;
        const bx = Math.cos(a) * (R + 1);
        const bz = Math.sin(a) * (R + 1);
        piece(g, G.dodeca(s), C.stoneDark, { pos: [bx, s * 0.35, bz], rot: [rnd() * 3, rnd() * 3, 0], scale: [1, 0.8, 1] });
        this.addCollider(x + bx, z + bz, s * 0.85, s);
      }
      const ca = rnd() * Math.PI * 2;
      const cx = Math.cos(ca) * R * 0.5;
      const cz = Math.sin(ca) * R * 0.5;
      piece(g, G.dodeca(3.2), C.stone, { pos: [cx, 1.2, cz], rot: [0.3, ca, 0.2], scale: [1.4, 0.9, 1] });
      piece(g, G.dodeca(2.2), shade(C.stone, 0.9), { pos: [cx + Math.cos(ca) * 1.5, 2.6, cz + Math.sin(ca) * 1.5], rot: [0.5, ca, 0.1], scale: [1.3, 0.6, 1] });
      this.addCollider(x + cx, z + cz, 3.4, 3.2);
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        piece(g, G.cyl(0.07, 0.09, 1.6, 5), C.woodDark, { pos: [Math.cos(a) * 1.3, 0.25, Math.sin(a) * 1.3], rot: [Math.PI / 2, a + 0.6, 0.3], outline: 0.01 });
      }
      for (let i = 0; i < 6; i++) piece(g, G.cyl(0.05, 0.06, 0.7, 5), C.bone, { pos: [(rnd() - 0.5) * R, 0.1, (rnd() - 0.5) * R], rot: [Math.PI / 2, rnd() * 3, 0], outline: 0.008 });
    }
    this.finish(g);
  }

  // Strongholds: the race's walled seat, boss within. Walls and glow by race; the Hive's walls
  // and the wild's are heaped rather than built.
  buildFort(camp) {
    const { x, z } = camp;
    const look = {
      scav: { wall: C.steel, glow: FORGE, cap: C.metalDark, fire: 'barrel' },
      hive: { wall: C.resin, glow: HIVE, cap: C.resinDark, fire: 'node', heaped: true, spires: true },
      synth: { wall: 0x6a7280, glow: ARC, cap: C.metalDark, fire: 'barrel' },
      fauna: { wall: C.stoneDark, glow: 0xffb030, cap: C.stone, fire: 'barrel', heaped: true },
    }[camp.race] ?? { wall: C.steel, glow: FORGE, cap: C.metalDark, fire: 'barrel' };
    const half = 15;
    const gate = 4;
    this.campfire(x - 6, z + 3, { scale: 1.2, style: look.fire });
    this.campfire(x + 6, z + 3, { scale: 1.2, style: look.fire });
    const g = this.anchor(x, z);
    const y0 = g.position.y;
    const wallH = 4;
    const seg = 3;
    const sides = [
      { from: [-half, -half], to: [half, -half] },
      { from: [-half, -half], to: [-half, half] },
      { from: [half, -half], to: [half, half] },
      { from: [-half, half], to: [half, half], gate: true },
    ];
    for (const s of sides) {
      const [ax, az] = s.from;
      const [bx, bz] = s.to;
      const n = Math.round(Math.hypot(bx - ax, bz - az) / seg);
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        const px = ax + (bx - ax) * t;
        const pz = az + (bz - az) * t;
        if (s.gate && Math.abs(px) < gate) continue;
        const broken = i % 5 === 2;
        const h = broken ? wallH * 0.55 : wallH;
        const horizontal = Math.abs(bz - az) < 0.1;
        const sx = horizontal ? seg + 0.05 : 1.6;
        const sz = horizontal ? 1.6 : seg + 0.05;
        if (look.heaped) {
          piece(g, G.dodeca(1.9), i % 2 ? look.wall : shade(look.wall, 1.1), { pos: [px, h * 0.3, pz], rot: [i, i * 1.7, 0], scale: [1, h / 3, 1] });
          if (look.spires && i % 2 === 0) piece(g, G.cone(0.3, 1.6, 5), C.chitin, { pos: [px, h * 0.75, pz], rot: [0.2 * Math.sin(i), 0, 0.2 * Math.cos(i)], outline: 0.02 });
        } else {
          piece(g, G.box(sx, h + 2, sz), i % 2 ? look.wall : shade(look.wall, 0.9), { pos: [px, h / 2 - 1, pz], outline: 0.05 });
          piece(g, G.box(horizontal ? seg * 0.7 : 1.65, 0.12, horizontal ? 1.65 : seg * 0.7), look.glow, { pos: [px, h * 0.55, pz], glow: true, outline: 0 });
          if (!broken) piece(g, G.box(sx + 0.1, 0.25, sz + 0.1), look.cap, { pos: [px, h + 0.12, pz], outline: 0.03 });
        }
        for (let k = -1; k <= 1; k++) {
          const o = (k * seg) / 3;
          this.addCollider(x + px + (horizontal ? o : 0), z + pz + (horizontal ? 0 : o), 1.0, h, y0);
        }
      }
    }
    // Corner towers (chitin spires for the Hive).
    for (const [cx, cz] of [[-half, -half], [half, -half], [-half, half], [half, half]]) {
      if (look.spires) {
        piece(g, G.cone(2.4, 6, 7), look.cap, { pos: [cx, 2, cz], outline: 0.06 });
        piece(g, G.cone(1.3, 6.5, 6), C.chitin, { pos: [cx, 6.5, cz], rot: [0.15 * Math.sign(cz), 0, -0.15 * Math.sign(cx)], outline: 0.05 });
      } else {
        piece(g, G.cyl(2.2, 2.5, 8, 12), look.wall, { pos: [cx, 3, cz], outline: 0.06 });
        piece(g, G.dome(2.0, 12, 6), look.cap, { pos: [cx, 7, cz], outline: 0.05 });
      }
      piece(g, G.torus(2.25, 0.08, Math.PI * 2, 4, 24), look.glow, { pos: [cx, look.spires ? 3.6 : 6.2, cz], rot: [Math.PI / 2, 0, 0], scale: look.spires ? 0.62 : 1, glow: true, outline: 0 });
      this.addCollider(x + cx, z + cz, 2.5, 7, y0);
    }
    // Gate frame
    for (const s of [-1, 1]) {
      piece(g, G.box(0.8, 4.5, 0.8), look.cap, { pos: [gate * s, 2.25, half], outline: 0.03 });
      piece(g, G.box(0.15, 4.0, 0.15), look.glow, { pos: [(gate - 0.45) * s, 2.2, half], glow: true, outline: 0 });
    }
    piece(g, G.box(gate * 2 + 0.8, 0.6, 0.8), look.cap, { pos: [0, 4.6, half], outline: 0.03 });
    // Stair blocks up to the wall walk inside the gate.
    for (let i = 0; i < 4; i++) {
      const bx = -gate - 2.5 - i * 2.2;
      const bh = 1 + i;
      piece(g, G.box(2.2, bh, 2.2), look.cap, { pos: [bx, bh / 2, half - 2.4], outline: 0.04 });
      this.addCollider(x + bx, z + half - 2.4, 1.2, bh, y0);
    }
    // Throne
    piece(g, G.box(3, 1, 2), look.cap, { pos: [0, 0.5, -half + 3] });
    piece(g, G.box(3, 4, 0.8), look.wall, { pos: [0, 2.5, -half + 2.1] });
    piece(g, G.box(0.3, 3.2, 0.05), look.glow, { pos: [0, 2.6, -half + 2.52], glow: true, outline: 0 });
    for (const s of [-1, 1]) piece(g, G.cone(0.3, 1.2, 6), C.bone, { pos: [1.4 * s, 5, -half + 2.1], outline: 0.02 });
    this.addCollider(x, z - half + 2.6, 1.8, 2, y0);
    this.finish(g);
  }

  // ------------------------------------------------------------ verticality POIs
  // Steel sensor mast: lattice legs, grated platform, dish and beacon. Climb via stacked cargo.
  buildTower(t) {
    const g = this.anchor(t.x, t.z);
    const y0 = g.position.y;
    const h = t.h;
    for (const [lx, lz] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]]) {
      piece(g, G.box(0.18, h + 0.4, 0.18), C.steel, { pos: [lx, (h + 0.4) / 2, lz] });
      this.addCollider(t.x + lx, t.z + lz, 0.25, h - 0.4, y0);
    }
    for (const y of [h * 0.35, h * 0.7]) {
      piece(g, G.box(3.0, 0.1, 0.1), C.metal, { pos: [0, y, 1.4], rot: [0, 0, 0.6], outline: 0.012 });
      piece(g, G.box(3.0, 0.1, 0.1), C.metal, { pos: [0, y, -1.4], rot: [0, 0, -0.6], outline: 0.012 });
      piece(g, G.box(0.1, 0.1, 3.0), C.metal, { pos: [1.4, y, 0], rot: [0.6, 0, 0], outline: 0.012 });
      piece(g, G.box(0.1, 0.1, 3.0), C.metal, { pos: [-1.4, y, 0], rot: [-0.6, 0, 0], outline: 0.012 });
    }
    piece(g, G.box(3.6, 0.25, 3.6), C.metalDark, { pos: [0, h - 0.12, 0] });
    piece(g, G.box(3.62, 0.06, 3.62), RUNE, { pos: [0, h - 0.27, 0], glow: true, outline: 0 });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      piece(g, G.box(0.08, 0.9, 0.08), C.metal, { pos: [Math.cos(a) * 1.75, h + 0.45, Math.sin(a) * 1.75], outline: 0.01 });
    }
    piece(g, G.torus(1.75, 0.04, Math.PI * 2, 4, 24), C.metal, { pos: [0, h + 0.9, 0], rot: [Math.PI / 2, 0, 0], outline: 0.008 });
    piece(g, G.box(0.14, 2.4, 0.14), C.steel, { pos: [1.2, h + 1.2, 1.2] });
    piece(g, G.dome(0.8, 12, 6), C.hab, { pos: [1.2, h + 2.4, 1.2], rot: [0.9, 0.8, 0], outline: 0.015 });
    piece(g, G.octa(0.22), RUNE, { pos: [-1.2, h + 1.3, -1.2], scale: [1, 1.6, 1], glow: true, outline: 0.012 });
    this.finish(g);
    this.addCollider(t.x, t.z, 2.0, 0.35, y0 + h - 0.35);
    const a = this.rnd() * Math.PI * 2;
    const sx = t.x + Math.cos(a) * 3.6;
    const sz = t.z + Math.sin(a) * 3.6;
    this.crate(sx, sz, a, 1.1);
    const cx = t.x + Math.cos(a + 0.5) * 2.6;
    const cz = t.z + Math.sin(a + 0.5) * 2.6;
    this.crate(cx, cz, a, 1.2);
    this.crate(cx, cz, a + 0.3, 1.1, this.groundHeight(cx, cz) + 1.08);
  }

  towerTop(t) { return this.groundHeight(t.x, t.z) + t.h; }

  buildRuin(r) {
    const g = this.anchor(r.x, r.z);
    const y0 = g.position.y;
    const n = 9;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2.4;
      const d = r.r * (1 - i / (n + 2));
      const px = Math.cos(a) * d;
      const pz = Math.sin(a) * d;
      const h = 0.9 + i * 0.75;
      const gy = this.groundHeight(r.x + px, r.z + pz) - y0;
      piece(g, G.cyl(1.0, 1.15, h - gy + 1, 9), i % 2 ? C.stone : shade(C.stone, 0.92), { pos: [px, gy + (h - gy + 1) / 2 - 1, pz], outline: 0.04 });
      piece(g, G.cyl(1.2, 1.2, 0.25, 9), shade(C.stone, 1.08), { pos: [px, h - 0.12, pz], outline: 0.03 });
      piece(g, G.torus(1.03, 0.035, Math.PI * 2, 4, 18), RUNE, { pos: [px, h - 0.45, pz], rot: [Math.PI / 2, 0, 0], glow: true, outline: 0 });
      this.addCollider(r.x + px, r.z + pz, 1.15, h, y0);
    }
    const ch = this.ruinTop(r) - y0;
    piece(g, G.cyl(1.4, 1.6, ch + 1, 10), shade(C.stone, 0.95), { pos: [0, ch / 2 - 0.5, 0], outline: 0.05 });
    piece(g, G.cyl(1.7, 1.7, 0.3, 10), shade(C.stone, 1.08), { pos: [0, ch - 0.15, 0], outline: 0.03 });
    this.addCollider(r.x, r.z, 1.6, ch, y0);
    for (let i = 0; i < 3; i++) {
      const a = this.rnd() * Math.PI * 2;
      piece(g, G.box(3, 1.2, 0.8), C.stoneDark, { pos: [Math.cos(a) * (r.r + 3), 0.4, Math.sin(a) * (r.r + 3)], rot: [0, a, 0.15], outline: 0.04 });
    }
    this.finish(g);
  }

  ruinTop(r) { return this.groundHeight(r.x, r.z) + 0.9 + 9 * 0.75 + 0.8; }

  // Mesas are terrain; they bring a skirt of fallen rock and a floating crystal overhead.
  buildMesa(m) {
    const rnd = this.rnd;
    const g = this.anchor(m.x, m.z);
    for (let i = 0; i < m.r * 1.2; i++) {
      const a = rnd() * Math.PI * 2;
      const d = m.r + 4 + rnd() * 4;
      const x = m.x + Math.cos(a) * d;
      const z = m.z + Math.sin(a) * d;
      if (this.gen.nearRoad(x, z)) continue;
      const rs = 0.6 + rnd() * 1.4;
      const y = this.groundHeight(x, z);
      piece(g, G.dodeca(rs), C.stone, { pos: [x - m.x, y - g.position.y + rs * 0.2, z - m.z], rot: [rnd() * 3, rnd() * 3, 0], scale: [1, 0.8, 1] });
      this.addCollider(x, z, rs * 0.8, rs, y);
    }
    this.finish(g);
    this.floatingShard(m.x, m.top + 9 + m.r * 0.2, m.z, 1 + m.r / 20);
  }

  buildWaystone(w) {
    const g = this.anchor(w.x, w.z);
    piece(g, G.cyl(1.1, 1.3, 0.35, 8), C.stoneDark, { pos: [0, 0.17, 0], outline: 0.03 });
    piece(g, G.box(0.7, 2.4, 0.5), C.stone, { pos: [0, 1.5, 0], outline: 0.04 });
    piece(g, G.box(0.18, 1.2, 0.06), 0x58cfff, { pos: [0, 1.6, 0.26], glow: true, outline: 0 });
    for (const s of [-1, 1]) piece(g, G.box(0.16, 2.0, 0.16), C.stoneDark, { pos: [0.5 * s, 1.3, 0], rot: [0, 0, -0.12 * s], outline: 0.02 });
    this.finish(g);
    const crystal = new THREE.Group();
    crystal.position.y = 3.3;
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.35), new THREE.MeshBasicMaterial({ color: 0x7a7a8a }));
    core.scale.set(0.8, 1.5, 0.8);
    crystal.add(core);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.04, 5, 32), new THREE.MeshBasicMaterial({ color: 0x7a7a8a }));
    ring.rotation.x = Math.PI / 2 - 0.3;
    crystal.add(ring);
    g.add(crystal);
    this.addCollider(w.x, w.z, 0.7, 2.7);
    this.waystones.set(w.id, { ...w, group: g, crystal, ring, position: g.position, active: false, seed: w.x });
    this.own.waystone = w.id;
    this.setWaystoneActive(w.id, this.isAttuned(w.id));
  }

  // Supply cache: armoured case with glowing seams; the lid hinges open.
  buildChest(c) {
    let y;
    if (c.on) y = this.towerTop(this.poiById(c.on));
    else if (c.ruin) y = this.ruinTop(this.poiById(c.ruin));
    else y = this.groundHeight(c.x, c.z);
    const g = new THREE.Group();
    g.position.set(c.x, y, c.z);
    g.rotation.y = this.rnd() * Math.PI * 2;
    piece(g, G.box(1.0, 0.5, 0.65), C.metalDark, { pos: [0, 0.25, 0] });
    for (const sx of [-0.44, 0.44]) piece(g, G.box(0.08, 0.54, 0.68), 0xd9a227, { pos: [sx, 0.26, 0], outline: 0.01 });
    piece(g, G.box(1.02, 0.04, 0.67), 0xffd23f, { pos: [0, 0.48, 0], glow: true, outline: 0 });
    bakeTree(g);
    const lid = new THREE.Group();
    lid.position.set(0, 0.5, -0.32);
    piece(lid, G.box(1.0, 0.18, 0.65), C.metalDark, { pos: [0, 0.09, 0.32] });
    for (const sx of [-0.44, 0.44]) piece(lid, G.box(0.08, 0.2, 0.68), 0xd9a227, { pos: [sx, 0.09, 0.32], outline: 0.01 });
    piece(lid, G.box(0.3, 0.05, 0.3), 0xffd23f, { pos: [0, 0.19, 0.32], glow: true, outline: 0.008 });
    piece(lid, G.box(0.14, 0.14, 0.04), 0xffe27a, { pos: [0, 0.05, 0.66], glow: true, outline: 0.008 });
    bakeTree(lid);
    g.add(lid);
    this.own.group.add(g);
    this.chests.set(c.id, { ...c, group: g, lid, position: g.position, open: false });
    this.own.chest = c.id;
    this.setChestOpen(c.id, this.isOpened(c.id));
  }
}
