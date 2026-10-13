// The realm's world on the server: terrain heights and colliders, without rendering anything.
// It is the client's World (src/world/World.js) with the drawing switched off, so enemies collide
// with exactly the trees, rocks, tents and walls players see. Instead of streaming around one
// camera it keeps what's around every player: chunk scenery colliders near anyone, and the
// colliders of points of interest (camps, forts, towers...) a little further out.
import { World } from '../src/world/World.js';
import { Chunk, CHUNK } from '../src/world/Chunks.js';
import { inPocket } from '../src/world/dungeons.js';

const CHUNK_LOAD = 150;    // scenery colliders within this of any player
const CHUNK_UNLOAD = 200;
const POI_LOAD = 220;      // point-of-interest colliders within this of any player
const POI_UNLOAD = 280;
const BUDGET_MS = 6;       // per tick, for building what came into range
const ckey = (cx, cz) => `${cx},${cz}`;
const TILE = 32;           // grid vertices per side of a cached tile of heights (64 m)
const MAX_TILES = 4096;    // ~34 MB of heights, then the cache starts over

export class HeadlessWorld extends World {
  constructor(seed) {
    super({ add() {}, remove() {} }, seed);
    this.wantChunks = new Set();
    this.queue = [];
    this.heightTiles = new Map();
    this.objectParts = null; // quest objects' looks are each screen's business
  }

  // Nothing to light, flood or draw.
  setupLighting() { this.sun = { position: { set() {} }, target: { position: { set() {} } } }; }
  buildWater() { this.water = { position: { set() {} } }; }
  buildScenerySets() { this.sets = {}; }
  packScenery() { this.sceneryDirty = false; }

  // Heights straight from the generator, on the same triangles the clients' terrain uses (in a
  // pocket, a dungeon's floors).
  groundHeight(x, z) { return inPocket(x) ? this.pocketGround(x, z) : this.analyticHeight(x, z); }

  // The generator's heights at the grid's vertices, kept in tiles: every step an enemy takes asks
  // for the ground under it, and the noise behind a height is the costliest thing the sim does.
  // Same numbers as the generator's (it's only remembered), so they match the clients' exactly.
  vertexHeight(ix, iz) {
    const key = ((ix >> 5) + 32768) * 65536 + ((iz >> 5) + 32768);
    let tile = this.heightTiles.get(key);
    if (!tile) {
      if (this.heightTiles.size >= MAX_TILES) this.heightTiles.clear();
      tile = new Float64Array(TILE * TILE).fill(NaN);
      this.heightTiles.set(key, tile);
    }
    const i = ((iz & (TILE - 1)) << 5) | (ix & (TILE - 1));
    let h = tile[i];
    if (Number.isNaN(h)) h = tile[i] = super.vertexHeight(ix, iz);
    return h;
  }

  // Keeps colliders loaded around `foci` (player positions); builds new ones within a time budget.
  track(foci) {
    // Players down in a dungeon need nothing of the land round them.
    foci = foci.filter((f) => !inPocket(f.x));
    const want = new Set();
    const jobs = [];
    for (const f of foci) {
      const r = Math.ceil(CHUNK_LOAD / CHUNK);
      const fcx = Math.floor(f.x / CHUNK);
      const fcz = Math.floor(f.z / CHUNK);
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          const cx = fcx + dx;
          const cz = fcz + dz;
          const d = Math.hypot((cx + 0.5) * CHUNK - f.x, (cz + 0.5) * CHUNK - f.z);
          if (d > CHUNK_LOAD) continue;
          const k = ckey(cx, cz);
          want.add(k);
          if (!this.chunks.has(k)) jobs.push({ d, k, run: () => this.loadChunk(cx, cz) });
        }
      }
      for (const p of this.poisNear(f.x, f.z, POI_LOAD)) {
        if (!this.pois.has(p.id)) jobs.push({ d: Math.hypot(p.x - f.x, p.z - f.z), k: p.id, run: () => this.loadPoi(p) });
      }
    }
    // Unload what nobody is near any more.
    for (const [k, ch] of this.chunks) {
      if (want.has(k)) continue;
      const cx = (ch.cx + 0.5) * CHUNK;
      const cz = (ch.cz + 0.5) * CHUNK;
      if (foci.every((f) => Math.hypot(cx - f.x, cz - f.z) > CHUNK_UNLOAD)) this.dropChunk(k, ch);
    }
    for (const [id, o] of this.pois) {
      if (foci.every((f) => Math.hypot(o.poi.x - f.x, o.poi.z - f.z) > POI_UNLOAD)) this.unload(o, this.pois, id);
    }
    const seen = new Set();
    this.queue = jobs.filter((j) => !seen.has(j.k) && seen.add(j.k)).sort((a, b) => a.d - b.d);
    this.work(BUDGET_MS);
  }

  // Everything near `foci` at once (startup, a player arriving): nothing may spawn inside a wall.
  prime(foci) {
    this.track(Array.isArray(foci) ? foci : [foci]);
    this.work(Infinity);
  }

  work(budget) {
    const t0 = performance.now();
    while (this.queue.length && performance.now() - t0 < budget) this.queue.shift().run();
  }

  loadChunk(cx, cz) {
    const k = ckey(cx, cz);
    if (this.chunks.has(k)) return;
    const ch = new Chunk(this.gen, cx, cz);
    this.chunks.set(k, ch);
    this.scatterChunk(ch);
    ch.scenery = null; // instance matrices are for drawing; only the colliders matter here
    this.own = ch;
    for (const c of ch.sceneryColliders) this.addCollider(c.x, c.z, c.r, c.h, c.y);
    this.own = null;
    ch.collided = true;
  }

  dropChunk(k, ch) {
    for (const c of ch.colliders) this.removeCollider(c);
    ch.colliders.length = 0;
    this.chunks.delete(k);
  }

  // A point of interest is built as on the client (its colliders come out of building it), then
  // its meshes are let go.
  loadPoi(p) {
    super.loadPoi(p);
    const o = this.pois.get(p.id);
    if (o) {
      o.group = { traverse() {} };
      this.flames = [];
      this.shards = [];
      this.spinners = [];
    }
  }

  unload(o, map, id) {
    for (const c of o.colliders) this.removeCollider(c);
    if (o.waystone) this.waystones.delete(o.waystone);
    if (o.chest) this.chests.delete(o.chest);
    map.delete(id);
  }

  get stats() {
    return { chunks: this.chunks.size, pois: this.pois.size, colliders: this.colliders.size };
  }
}
