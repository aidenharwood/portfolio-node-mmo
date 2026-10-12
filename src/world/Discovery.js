// Fog of war for the endless world: 8 m cells, stored sparsely as an 8×8 bitmask per explored
// 64 m chunk (two 32-bit words), revealed around the player.
import { CHUNK } from './Chunks.js';

const CELL = 8;
const PER = CHUNK / CELL; // cells per chunk side

export class Discovery {
  constructor() {
    this.chunks = new Map(); // "cx,cz" → Uint32Array(2)
    this.version = 0;
  }

  isKnown(x, z) {
    const ix = Math.floor(x / CELL);
    const iz = Math.floor(z / CELL);
    const cx = Math.floor(ix / PER);
    const cz = Math.floor(iz / PER);
    const m = this.chunks.get(`${cx},${cz}`);
    if (!m) return false;
    const b = (iz - cz * PER) * PER + (ix - cx * PER);
    return ((m[b >> 5] >>> (b & 31)) & 1) === 1;
  }

  // Bitmask for a chunk (or null), for drawing.
  mask(cx, cz) { return this.chunks.get(`${cx},${cz}`) ?? null; }

  reveal(x, z, r = 42) {
    let changed = false;
    const r2 = r * r;
    for (let dz = -r; dz <= r; dz += CELL) {
      for (let dx = -r; dx <= r; dx += CELL) {
        if (dx * dx + dz * dz > r2) continue;
        const ix = Math.floor((x + dx) / CELL);
        const iz = Math.floor((z + dz) / CELL);
        const cx = Math.floor(ix / PER);
        const cz = Math.floor(iz / PER);
        const key = `${cx},${cz}`;
        let m = this.chunks.get(key);
        if (!m) this.chunks.set(key, (m = new Uint32Array(2)));
        const b = (iz - cz * PER) * PER + (ix - cx * PER);
        const bit = 1 << (b & 31);
        if (!(m[b >> 5] & bit)) {
          m[b >> 5] |= bit;
          changed = true;
        }
      }
    }
    if (changed) this.version++;
  }

  toJSON() {
    const out = [];
    for (const [k, m] of this.chunks) {
      const [cx, cz] = k.split(',').map(Number);
      out.push([cx, cz, m[0] >>> 0, m[1] >>> 0]);
    }
    return JSON.stringify(out);
  }

  load(s) {
    this.chunks.clear();
    if (Array.isArray(s)) {
      for (const entry of s) {
        if (!Array.isArray(entry) || entry.length < 4) continue;
        const [cx, cz, a, b] = entry;
        const key = `${cx},${cz}`;
        this.chunks.set(key, new Uint32Array([Number(a) >>> 0, Number(b) >>> 0]));
      }
      this.version++;
      return;
    }
    if (typeof s !== 'string' || !s) return;
    if (s.startsWith('[')) {
      try {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed)) {
          this.load(parsed);
          return;
        }
      } catch { /* malformed JSON: fall back to the legacy string format */ }
    }
    if (!s.includes(':')) return; // old fixed-valley format: start fresh
    for (const part of s.split(';')) {
      const [k, a, b] = part.split(':');
      if (!k || a === undefined) continue;
      this.chunks.set(k, new Uint32Array([parseInt(a, 36) >>> 0, parseInt(b, 36) >>> 0]));
    }
    this.version++;
  }
}

export const FOG_CELL = CELL;
export const FOG_PER_CHUNK = PER;
