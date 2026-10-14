// Fog of war as a picture, for the map and the minimap: one pixel per 8 m cell over a block of
// chunks, opaque where unexplored and clear where seen, drawn scaled up with smoothing (which is
// what softens its edges). Rebuilt only when more is explored or the view leaves the block it
// covers, so a frame draws it with one drawImage instead of a blurred rectangle per cell.
import { CHUNK } from '../world/Chunks.js';
import { FOG_PER_CHUNK } from '../world/Discovery.js';

const PER = FOG_PER_CHUNK;

// Writes the fog for chunks x0..x1 × z0..z1 into `px` (RGBA, (x1-x0+1)·PER wide, north up: the
// top row is the far edge of z1): `rgba` everywhere, alpha 0 on the cells that have been seen.
export function fogPixels(discovery, x0, z0, x1, z1, px, rgba) {
  const W = (x1 - x0 + 1) * PER;
  const H = (z1 - z0 + 1) * PER;
  px[0] = rgba[0]; px[1] = rgba[1]; px[2] = rgba[2]; px[3] = rgba[3];
  const words = new Uint32Array(px.buffer, px.byteOffset, W * H);
  words.fill(words[0]);
  const clear = (cx, cz, m) => {
    for (let b = 0; b < 64; b++) {
      if (!((m[b >> 5] >>> (b & 31)) & 1)) continue;
      const ix = (cx - x0) * PER + (b % PER);
      const iz = (cz - z0) * PER + ((b / PER) | 0);
      px[((H - 1 - iz) * W + ix) * 4 + 3] = 0;
    }
  };
  // Whichever is fewer: the chunks in the block, or the chunks ever explored.
  if ((x1 - x0 + 1) * (z1 - z0 + 1) > discovery.chunks.size) {
    for (const [key, m] of discovery.chunks) {
      const i = key.indexOf(',');
      const cx = +key.slice(0, i);
      const cz = +key.slice(i + 1);
      if (cx >= x0 && cx <= x1 && cz >= z0 && cz <= z1) clear(cx, cz, m);
    }
  } else {
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const m = discovery.mask(cx, cz);
        if (m) clear(cx, cz, m);
      }
    }
  }
}

// Softens the fog's edges once, when it's built (rather than a blur filter every frame): box blurs
// of the alpha channel of `px` (W × H), across then down, `passes` times. Each pass spreads an
// edge over a cell either side.
export function blurAlpha(px, W, H, passes, buf) {
  const n = W * H;
  const a = buf?.length >= n * 2 ? buf : new Uint8Array(n * 2);
  const t = a.subarray(n, n * 2);
  for (let i = 0; i < n; i++) a[i] = px[i * 4 + 3];
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < H; y++) {
      const r = y * W;
      for (let x = 0; x < W; x++) t[r + x] = (a[r + (x ? x - 1 : 0)] + a[r + x] + a[r + (x < W - 1 ? x + 1 : x)]) / 3 + 0.5;
    }
    for (let y = 0; y < H; y++) {
      const up = (y ? y - 1 : 0) * W;
      const dn = (y < H - 1 ? y + 1 : y) * W;
      const r = y * W;
      for (let x = 0; x < W; x++) a[r + x] = (t[up + x] + t[r + x] + t[dn + x]) / 3 + 0.5;
    }
  }
  for (let i = 0; i < n; i++) px[i * 4 + 3] = a[i];
  return a;
}

export class FogLayer {
  // `rgba`: the fog's colour (0–255 each); `soft`: blur passes over its edges (see blurAlpha);
  // `pad`: extra chunks kept round the asked-for block.
  constructor(rgba, soft = 1, pad = 2) {
    this.rgba = rgba;
    this.soft = soft;
    this.pad = pad;
    this.canvas = null;
    this.range = null;     // [x0, z0, x1, z1]: the chunks it covers
    this.version = -1;     // the discovery version it was built from
  }

  // Makes sure it covers chunks cx0..cx1 × cz0..cz1. False when that would take more than
  // `maxCells` pixels (so far out the fog isn't worth drawing).
  cover(discovery, cx0, cz0, cx1, cz1, maxCells = 600000) {
    const r = this.range;
    if (r && this.version === discovery.version && cx0 >= r[0] && cz0 >= r[1] && cx1 <= r[2] && cz1 <= r[3]) return true;
    const px = this.pad + Math.ceil((cx1 - cx0 + 1) * 0.25);
    const pz = this.pad + Math.ceil((cz1 - cz0 + 1) * 0.25);
    const x0 = cx0 - px;
    const z0 = cz0 - pz;
    const x1 = cx1 + px;
    const z1 = cz1 + pz;
    const W = (x1 - x0 + 1) * PER;
    const H = (z1 - z0 + 1) * PER;
    if (W * H > maxCells) return false;
    const c = (this.canvas ??= document.createElement('canvas'));
    if (c.width !== W || c.height !== H) {
      c.width = W;
      c.height = H;
      this.img = null;
    }
    const ctx = c.getContext('2d');
    this.img ??= ctx.createImageData(W, H);
    fogPixels(discovery, x0, z0, x1, z1, this.img.data, this.rgba);
    if (this.soft) this.buf = blurAlpha(this.img.data, W, H, this.soft, this.buf);
    ctx.putImageData(this.img, 0, 0);
    this.range = [x0, z0, x1, z1];
    this.version = discovery.version;
    return true;
  }

  // Where it lies in the world: its west edge, its north edge (the larger z) and its size in metres.
  get bounds() {
    const [x0, z0, x1, z1] = this.range;
    return { x: x0 * CHUNK, zTop: (z1 + 1) * CHUNK, w: (x1 - x0 + 1) * CHUNK, h: (z1 - z0 + 1) * CHUNK };
  }
}
