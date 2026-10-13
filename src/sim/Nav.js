// Finding the way indoors (a dungeon's rooms: world/Interior.js): the interior's 2 m grid, where
// enemies go round walls and through doors rather than straight at whoever they're after. A
// breadth-first "flow field" is worked out from where a target stands (kept a second, shared by
// everyone heading there); an enemy follows it downhill, cutting corners to the furthest point
// along it still in sight.
const STEP_UP = 1.3; // the most a floor may rise or fall from one cell to the next (stairs)
const KEEP = 1;      // seconds a field is kept
const MAX_FIELDS = 48;
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export class NavGrid {
  // `interior`: its layout's cells (area per cell), floor heights and the doors' cells.
  constructor(interior) {
    const L = interior.layout;
    this.it = interior;
    this.W = L.W;
    this.cell = L.cell;
    const n = this.W * this.W;
    this.walk = new Uint8Array(n);
    this.h = new Float32Array(n);
    this.blocked = new Uint8Array(n); // closed doors
    for (let i = 0; i < n; i++) {
      if (!L.cells[i]) continue;
      const x = (i % this.W + 0.5) * this.cell;
      const z = (Math.floor(i / this.W) + 0.5) * this.cell;
      if (interior.inShaft(x, z)) continue; // nobody walks a lift shaft
      this.walk[i] = 1;
      this.h[i] = interior.localFloor(x, z);
    }
    // Nobody walks through the arenas' pillars.
    for (const p of L.pillars ?? []) {
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const k = this.index(p.x + dx * this.cell * 0.6, p.z + dz * this.cell * 0.6);
          if (k >= 0) this.walk[k] = 0;
        }
      }
    }
    this.fields = new Map();
    this.version = 0;
  }

  index(lx, lz) {
    const i = Math.floor(lx / this.cell);
    const j = Math.floor(lz / this.cell);
    return i < 0 || j < 0 || i >= this.W || j >= this.W ? -1 : j * this.W + i;
  }
  centre(k) { return { x: (k % this.W + 0.5) * this.cell, z: (Math.floor(k / this.W) + 0.5) * this.cell }; }
  open(k) { return k >= 0 && this.walk[k] === 1 && !this.blocked[k]; }
  step(a, b) { return this.open(b) && Math.abs(this.h[a] - this.h[b]) <= STEP_UP; }

  // A door shut or opened: its cells, and every field worked out through them, change.
  setBlocked(cells, shut) {
    for (const k of cells) this.blocked[k] = shut ? 1 : 0;
    this.fields.clear();
    this.version++;
  }

  // Steps from every cell to `goal` (-1: no way there).
  field(goal, time) {
    const f0 = this.fields.get(goal);
    if (f0 && time - f0.t < KEEP) return f0.d;
    const W = this.W;
    const d = f0?.d ?? new Int16Array(W * W);
    d.fill(-1);
    if (!this.open(goal)) return d;
    const queue = new Int32Array(W * W);
    let head = 0;
    let tail = 0;
    d[goal] = 0;
    queue[tail++] = goal;
    while (head < tail) {
      const k = queue[head++];
      const x = k % W;
      const z = (k - x) / W;
      for (const [dx, dz] of N4) {
        const nx = x + dx;
        const nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= W || nz >= W) continue;
        const m = nz * W + nx;
        if (d[m] !== -1 || !this.step(k, m)) continue;
        d[m] = d[k] + 1;
        queue[tail++] = m;
      }
    }
    if (this.fields.size >= MAX_FIELDS && !f0) this.fields.delete(this.fields.keys().next().value);
    this.fields.set(goal, { d, t: time });
    return d;
  }

  // Can one see (and walk) straight from cell a to cell b? Cells along the line, all open, the
  // floor never jumping more than a step.
  los(a, b) {
    const W = this.W;
    let x = a % W;
    let z = (a - x) / W;
    const bx = b % W;
    const bz = (b - bx) / W;
    const dx = Math.abs(bx - x);
    const dz = Math.abs(bz - z);
    const sx = x < bx ? 1 : -1;
    const sz = z < bz ? 1 : -1;
    let err = dx - dz;
    let prev = a;
    for (let guard = 0; guard < 400; guard++) {
      if (x === bx && z === bz) return true;
      const e2 = 2 * err;
      if (e2 > -dz) { err -= dz; x += sx; }
      if (e2 < dx) { err += dx; z += sz; }
      const k = z * W + x;
      if (!this.step(prev, k)) return false;
      prev = k;
    }
    return false;
  }

  // Which way from (fx, fz) towards (tx, tz) — local metres: { x, z, via, dist } (via: round a
  // corner rather than straight there), or null when there's no way.
  next(fx, fz, tx, tz, time) {
    const a = this.index(fx, fz);
    const b = this.index(tx, tz);
    if (a < 0 || b < 0) return null;
    const straight = Math.hypot(tx - fx, tz - fz);
    if (a === b || (this.open(a) && this.open(b) && this.los(a, b))) return { x: tx, z: tz, via: false, dist: straight };
    const f = this.field(b, time);
    let from = a;
    // Standing somewhere the grid doesn't count (a doorway's edge, a wall's skin): from the
    // nearest cell it does.
    if (f[from] < 0) {
      from = -1;
      for (const [dx, dz] of [...N4, [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const m = a + dz * this.W + dx;
        if (m >= 0 && m < f.length && f[m] >= 0 && (from < 0 || f[m] < f[from])) from = m;
      }
      if (from < 0) return null;
    }
    let cur = from;
    let best = -1;
    for (let s = 0; s < 10; s++) {
      const n = this.downhill(cur, f);
      if (n < 0) break;
      cur = n;
      if (this.los(from, cur)) best = cur;
      else break;
    }
    if (best < 0) best = this.downhill(from, f);
    if (best < 0) return { x: tx, z: tz, via: false, dist: straight };
    const p = this.centre(best);
    return { x: p.x, z: p.z, via: true, dist: Math.max(straight, f[from] * this.cell) };
  }

  downhill(k, f) {
    const W = this.W;
    const x = k % W;
    let best = -1;
    for (const [dx, dz] of N4) {
      const nx = x + dx;
      if (nx < 0 || nx >= W) continue;
      const m = k + dz * W + dx;
      if (m < 0 || m >= f.length || f[m] < 0) continue;
      if (f[m] < f[k] && (best < 0 || f[m] < f[best])) best = m;
    }
    return best;
  }

  // Is (bx, bz) in sight from (ax, az) — local metres?
  sees(ax, az, bx, bz) {
    const a = this.index(ax, az);
    const b = this.index(bx, bz);
    return a >= 0 && b >= 0 && (a === b || this.los(a, b));
  }

  // Is there a way between two points (local metres)? For checks.
  reachable(ax, az, bx, bz, time = 0) {
    const a = this.index(ax, az);
    const b = this.index(bx, bz);
    return a >= 0 && b >= 0 && this.field(b, time)[a] >= 0;
  }
}
