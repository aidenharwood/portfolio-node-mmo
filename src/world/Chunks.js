// Terrain chunks for the endless world: 64 m squares streamed in around the player.
//   heights  a 2 m grid (LOD0) is kept for chunks near the player — every ground query, raycast
//            and collision reads it, interpolated on exactly the triangles that are drawn; far
//            away a query samples the generator directly (same grid points, same answer).
//   meshes   three levels of detail (2 / 4 / 8 m) by distance, each with a skirt that hides the
//            cracks between neighbouring levels; vertex colours carry biome, rock, sand, snow,
//            camp dirt, settlement paving and a little noise. Normals come from the generator across chunk borders,
//            so there are no lighting seams.
//   tiles    each chunk paints a small top-down tile for the map and minimap.
import * as THREE from 'three';
import { smoothstep } from '../core/noise.js';
import { toonMaterial, chainCompile } from '../render/Toon.js';
import { withTerrain } from '../render/Surfaces.js';
import { WATER_LEVEL } from './Gen.js';

export const CHUNK = 64;
export const RES0 = 32;               // LOD0 cells per side (2 m)
const LOD_RES = [32, 16, 8];
export const TILE = 32;               // map tile pixels per chunk side (2 m / px)

export const BIOME_COLOR = {
  meadow: new THREE.Color(0x7bbd5e),
  forest: new THREE.Color(0x5c9a4a),
  highland: new THREE.Color(0xa3b46a),
  snow: new THREE.Color(0xe6edf2),
  marsh: new THREE.Color(0x6a8a4c),
  ash: new THREE.Color(0x6e5e56),
  mountain: new THREE.Color(0x8c877d),
  desert: new THREE.Color(0xe2c48c),
  badlands: new THREE.Color(0xc27448),
  jungle: new THREE.Color(0x3f9a4a),
  crystal: new THREE.Color(0x9aa4dc),
  fungal: new THREE.Color(0x7d5c8e),
};
// Badlands rock in bands by height, so terraces and canyon walls show their strata.
const STRATA = [0xc27448, 0xae5e3a, 0xd4905e, 0x9c5236].map((c) => new THREE.Color(c));
const SANDSTONE = new THREE.Color(0xc9a070);
const SPORE_MOSS = new THREE.Color(0xa874c8);
const VEIN = new THREE.Color(0xc8f0ff);
const ROCK = new THREE.Color(0x9a948a);
const SNOWCAP = new THREE.Color(0xeef3f6);
const SAND = new THREE.Color(0xd9c992);
const LAKEBED = new THREE.Color(0x5f8a78);
const DIRT = new THREE.Color(0xc4a271);
const PAVE = new THREE.Color(0xb7b1a5); // a city's flagstones (a pad's `dirt: 'stone'`)
const _c = new THREE.Color();

let sharedMaterial = null;
export function terrainMaterial() {
  sharedMaterial ??= withTerrain(toonMaterial(0xffffff, { vertexColors: true }), chainCompile);
  return sharedMaterial;
}

export const chunkKey = (cx, cz) => `${cx},${cz}`;

export class Chunk {
  constructor(gen, cx, cz) {
    this.gen = gen;
    this.cx = cx;
    this.cz = cz;
    this.key = chunkKey(cx, cz);
    this.x0 = cx * CHUNK;
    this.z0 = cz * CHUNK;
    this.heights = null;   // LOD0 grid (RES0+1)², when near the player
    this.mesh = null;
    this.lod = -1;
    this.tile = null;
    this.scenery = null;   // per-type instance matrices (filled by World)
    this.colliders = [];
  }

  // LOD0 height grid (2 m), for exact queries near the player.
  ensureHeights() {
    if (this.heights) return this.heights;
    const n = RES0 + 1;
    const h = new Float32Array(n * n);
    const step = CHUNK / RES0;
    for (let iz = 0; iz < n; iz++) for (let ix = 0; ix < n; ix++) h[iz * n + ix] = this.gen.height(this.x0 + ix * step, this.z0 + iz * step);
    this.heights = h;
    return h;
  }

  dropHeights() { this.heights = null; }

  // Height on the drawn LOD0 triangles (grid diagonal from (0,1) to (1,0) in each cell).
  heightAt(x, z) {
    const h = this.heights;
    const step = CHUNK / RES0;
    const fx = Math.min(RES0 - 1e-6, Math.max(0, (x - this.x0) / step));
    const fz = Math.min(RES0 - 1e-6, Math.max(0, (z - this.z0) / step));
    const ix = Math.floor(fx);
    const iz = Math.floor(fz);
    const u = fx - ix;
    const v = fz - iz;
    const n = RES0 + 1;
    const ha = h[iz * n + ix];
    const hb = h[(iz + 1) * n + ix];
    const hc = h[(iz + 1) * n + ix + 1];
    const hd = h[iz * n + ix + 1];
    if (u + v <= 1) return ha + (hd - ha) * u + (hb - ha) * v;
    return hc + (hb - hc) * (1 - u) + (hd - hc) * (1 - v);
  }

  // Height on the drawn mesh at its current level of detail (far chunks without the 2 m grid).
  lodHeightAt(x, z) {
    const res = this.lodRes;
    const h = this.lodGrid;
    const step = CHUNK / res;
    const fx = Math.min(res - 1e-6, Math.max(0, (x - this.x0) / step));
    const fz = Math.min(res - 1e-6, Math.max(0, (z - this.z0) / step));
    const ix = Math.floor(fx);
    const iz = Math.floor(fz);
    const u = fx - ix;
    const v = fz - iz;
    const n = res + 1;
    const ha = h[iz * n + ix];
    const hb = h[(iz + 1) * n + ix];
    const hc = h[(iz + 1) * n + ix + 1];
    const hd = h[iz * n + ix + 1];
    if (u + v <= 1) return ha + (hd - ha) * u + (hb - ha) * v;
    return hc + (hb - hc) * (1 - u) + (hd - hc) * (1 - v);
  }

  // Builds (or rebuilds at a new level of detail) the render mesh.
  buildMesh(lod) {
    const res = LOD_RES[lod];
    const step = CHUNK / res;
    const n = res + 1;
    const gen = this.gen;
    // Heights with a one-sample border (for normals continuous across chunks).
    const B = n + 2;
    const H = new Float32Array(B * B);
    const use0 = lod === 0 && this.heights;
    for (let iz = -1; iz <= res + 1; iz++) {
      for (let ix = -1; ix <= res + 1; ix++) {
        const inside = ix >= 0 && iz >= 0 && ix <= res && iz <= res;
        H[(iz + 1) * B + ix + 1] = use0 && inside ? this.heights[iz * (RES0 + 1) + ix] : gen.height(this.x0 + ix * step, this.z0 + iz * step);
      }
    }
    this.lodRes = res;
    this.lodGrid = new Float32Array(n * n);
    for (let iz = 0; iz < n; iz++) for (let ix = 0; ix < n; ix++) this.lodGrid[iz * n + ix] = H[(iz + 1) * B + ix + 1];
    const verts = n * n;
    const skirt = res * 4;
    const pos = new Float32Array((verts + skirt * 2) * 3);
    const nor = new Float32Array((verts + skirt * 2) * 3);
    const col = new Float32Array((verts + skirt * 2) * 3);
    const feats = gen.featuresNear(this.x0 + CHUNK / 2, this.z0 + CHUNK / 2);
    for (let iz = 0; iz < n; iz++) {
      for (let ix = 0; ix < n; ix++) {
        const i = iz * n + ix;
        const x = this.x0 + ix * step;
        const z = this.z0 + iz * step;
        const h = H[(iz + 1) * B + ix + 1];
        const dx = H[(iz + 1) * B + ix + 2] - H[(iz + 1) * B + ix];
        const dz = H[(iz + 2) * B + ix + 1] - H[iz * B + ix + 1];
        const nx = -dx;
        const ny = 2 * step;
        const nz = -dz;
        const nl = Math.hypot(nx, ny, nz);
        pos[i * 3] = x - this.x0;
        pos[i * 3 + 1] = h;
        pos[i * 3 + 2] = z - this.z0;
        nor[i * 3] = nx / nl;
        nor[i * 3 + 1] = ny / nl;
        nor[i * 3 + 2] = nz / nl;
        this.colorAt(x, z, h, Math.hypot(dx, dz) / (2 * step), feats, _c);
        col[i * 3] = _c.r;
        col[i * 3 + 1] = _c.g;
        col[i * 3 + 2] = _c.b;
      }
    }
    const idx = [];
    for (let iz = 0; iz < res; iz++) {
      for (let ix = 0; ix < res; ix++) {
        const a = iz * n + ix;
        const b = (iz + 1) * n + ix;
        const c = (iz + 1) * n + ix + 1;
        const d = iz * n + ix + 1;
        idx.push(a, b, d, b, c, d);
      }
    }
    // Skirt: each edge vertex dropped well below, stitched to the edge — hides LOD cracks.
    const drop = 2 + lod * 3;
    let k = verts;
    const edges = [];
    for (let i = 0; i < res; i++) edges.push([i, 0, i + 1, 0], [res, i, res, i + 1], [i + 1, res, i, res], [0, i + 1, 0, i]);
    for (const [ax, az, bx, bz] of edges) {
      const ia = az * n + ax;
      const ib = bz * n + bx;
      const ka = k++;
      const kb = k++;
      for (const [src, dst] of [[ia, ka], [ib, kb]]) {
        pos[dst * 3] = pos[src * 3];
        pos[dst * 3 + 1] = pos[src * 3 + 1] - drop;
        pos[dst * 3 + 2] = pos[src * 3 + 2];
        nor[dst * 3] = nor[src * 3];
        nor[dst * 3 + 1] = nor[src * 3 + 1];
        nor[dst * 3 + 2] = nor[src * 3 + 2];
        col[dst * 3] = col[src * 3] * 0.8;
        col[dst * 3 + 1] = col[src * 3 + 1] * 0.8;
        col[dst * 3 + 2] = col[src * 3 + 2] * 0.8;
      }
      idx.push(ia, ka, ib, ib, ka, kb, ia, ib, ka, ib, kb, ka);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    if (this.mesh) {
      this.mesh.geometry.dispose();
      this.mesh.geometry = geo;
    } else {
      this.mesh = new THREE.Mesh(geo, terrainMaterial());
      this.mesh.position.set(this.x0, 0, this.z0);
      this.mesh.receiveShadow = true;
      this.mesh.matrixAutoUpdate = false;
      this.mesh.updateMatrix();
    }
    this.lod = lod;
    if (!this.tile) this.paintTile(H, B, res, step);
    return this.mesh;
  }

  colorAt(x, z, h, slope, feats, out) {
    const gen = this.gen;
    const biome = gen.biomeAt(x, z);
    if (biome === 'badlands') out.copy(STRATA[((Math.floor((h + 60) / 1.7) % 4) + 4) % 4]);
    else out.copy(BIOME_COLOR[biome]);
    if (biome === 'fungal') {
      const n = gen.nD(x * 0.05, z * 0.05);
      if (n > 0.25) out.lerp(SPORE_MOSS, Math.min(1, (n - 0.25) * 1.5));
    } else if (biome === 'crystal') {
      const v = Math.abs(gen.nD(x * 0.09 + 3, z * 0.09));
      if (v < 0.05) out.lerp(VEIN, (0.05 - v) * 14);
    } else if (biome === 'desert') {
      out.multiplyScalar(0.97 + gen.nD(x * 0.11, z * 0.03) * 0.05);
    }
    if (h > 30) out.lerp(SNOWCAP, smoothstep(30, 44, h));
    if (slope > 0.75 && biome !== 'badlands') out.lerp(biome === 'desert' ? SANDSTONE : ROCK, smoothstep(0.75, 1.2, slope));
    if (h < WATER_LEVEL + 0.7) out.lerp(SAND, smoothstep(WATER_LEVEL + 0.7, WATER_LEVEL + 0.1, h));
    if (h < WATER_LEVEL - 0.3) out.copy(LAKEBED);
    for (const p of feats.pads) {
      if (!p.dirt) continue;
      const d = Math.hypot(x - p.x, z - p.z);
      if (d < p.r + 4) out.lerp(p.dirt === 'stone' ? PAVE : DIRT, smoothstep(p.r + 4, p.r - 1, d) * 0.85);
    }
    return out.multiplyScalar(0.94 + gen.nD(x * 0.15, z * 0.15) * 0.06);
  }

  // Top-down map tile (north up), hill-shaded, water painted in.
  paintTile(H, B, res, step) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = TILE;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(TILE, TILE);
    const feats = this.gen.featuresNear(this.x0 + CHUNK / 2, this.z0 + CHUNK / 2);
    const s = res / TILE;
    for (let py = 0; py < TILE; py++) {
      for (let px = 0; px < TILE; px++) {
        const gx = Math.min(res, Math.round(px * s));
        const gz = Math.min(res, Math.round((TILE - 1 - py) * s));
        const h = H[(gz + 1) * B + gx + 1];
        const x = this.x0 + gx * step;
        const z = this.z0 + gz * step;
        const shade = 1 + (H[(gz + 1) * B + gx + 2] - H[(gz + 1) * B + gx] - (H[(gz + 2) * B + gx + 1] - H[gz * B + gx + 1])) * (0.16 / step);
        if (h < WATER_LEVEL - 0.15) _c.setRGB(0.29, 0.62, 0.82);
        else this.colorAt(x, z, h, 0, feats, _c).multiplyScalar(shade);
        const o = (py * TILE + px) * 4;
        img.data[o] = Math.min(255, Math.pow(_c.r, 1 / 2.2) * 255);
        img.data[o + 1] = Math.min(255, Math.pow(_c.g, 1 / 2.2) * 255);
        img.data[o + 2] = Math.min(255, Math.pow(_c.b, 1 / 2.2) * 255);
        img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    this.tile = canvas;
  }

  dispose() {
    this.mesh?.geometry.dispose();
    this.mesh = null;
  }
}
