// Finding the way outdoors: round rocks, trees, tents and walls, and up hills only where they're
// gentle enough to climb. Asked only when the straight way to a point is blocked: a small A* over
// a 1 m grid round the walker and where it's going, the result pulled taut so it walks straight
// lines between the corners it has to turn. (Indoors, a dungeon's rooms have their own grid:
// sim/Nav.js.)
// Which cells are open is remembered for everyone (by body size) and forgotten every few seconds,
// as the colliders round players come and go.
const CELL = 1;
const PAD = 10;          // cells of room round the two ends for the search to go round things
const MAX_SPAN = 48;     // further apart than this (metres), and it doesn't look: just head that way
const MAX_EXPAND = 1800; // cells expanded before settling for the closest it got
const FORGET = 4;        // seconds the open cells are kept
const SIZES = [0.45, 0.8, 1.2, 1.6]; // body radii, rounded up to one of these
const N8 = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];

const sizeOf = (r) => {
  for (let i = 0; i < SIZES.length; i++) if (r <= SIZES[i] + 0.05) return i;
  return SIZES.length - 1;
};

export class OpenNav {
  // `maxSlope`: the steepest rise per metre a walker can climb (sim/EnemySim.js MAX_SLOPE).
  constructor(world, maxSlope) {
    this.world = world;
    this.maxSlope = maxSlope;
    this.cells = new Map();
    this.heights = new Map();
    this.at = 0;
  }

  tick(time) {
    if (time - this.at < FORGET) return;
    this.at = time;
    this.cells.clear();
    this.heights.clear();
  }

  key(i, j) { return (i + 1e5) * 2e5 + (j + 1e5); }

  height(i, j) {
    const k = this.key(i, j);
    let h = this.heights.get(k);
    if (h === undefined) this.heights.set(k, (h = this.world.groundHeight((i + 0.5) * CELL, (j + 0.5) * CELL)));
    return h;
  }

  // Is there room for a body of size `s` in cell (i, j)?
  open(i, j, s) {
    const k = this.key(i, j) * 4 + s;
    let o = this.cells.get(k);
    if (o === undefined) this.cells.set(k, (o = this.world.fits((i + 0.5) * CELL, (j + 0.5) * CELL, SIZES[s], 1.6)));
    return o;
  }

  // Can a walker go from cell a to the next cell b (not up anything too steep)?
  step(ai, aj, bi, bj, len) {
    return (this.height(bi, bj) - this.height(ai, aj)) / len <= this.maxSlope * 0.9;
  }

  // Is the straight line from (ax, az) to (bx, bz) walkable for size `s`? Sampled every half metre
  // (the first and last cells are given: it's standing in one, and the other is where it's going).
  clear(ax, az, bx, bz, s) {
    const d = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.ceil(d / 0.5));
    let pi = Math.floor(ax / CELL);
    let pj = Math.floor(az / CELL);
    const li = Math.floor(bx / CELL);
    const lj = Math.floor(bz / CELL);
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      const i = Math.floor((ax + (bx - ax) * t) / CELL);
      const j = Math.floor((az + (bz - az) * t) / CELL);
      if (i === pi && j === pj) continue;
      if (!(i === li && j === lj) && !this.open(i, j, s)) return false;
      if (!this.step(pi, pj, i, j, Math.hypot(i - pi, j - pj) * CELL)) return false;
      pi = i;
      pj = j;
    }
    return true;
  }

  // The corners to walk by from `from` to `to` (each { x, z }), for a body of `radius` — null when
  // the straight line is clear (or they're too far apart to look). If there's no way all the way
  // there, the way to as close as it gets.
  route(from, to, radius) {
    const s = sizeOf(radius);
    if (Math.hypot(to.x - from.x, to.z - from.z) > MAX_SPAN) return null;
    if (this.clear(from.x, from.z, to.x, to.z, s)) return null;
    const si = Math.floor(from.x / CELL);
    const sj = Math.floor(from.z / CELL);
    const gi = Math.floor(to.x / CELL);
    const gj = Math.floor(to.z / CELL);
    const i0 = Math.min(si, gi) - PAD;
    const j0 = Math.min(sj, gj) - PAD;
    const W = Math.max(si, gi) + PAD - i0 + 1;
    const H = Math.max(sj, gj) + PAD - j0 + 1;
    const n = W * H;
    const g = new Float32Array(n).fill(Infinity);
    const prev = new Int32Array(n).fill(-1);
    const shut = new Uint8Array(n);
    const idx = (i, j) => (j - j0) * W + (i - i0);
    const hx = (i, j) => {
      const dx = Math.abs(i - gi);
      const dz = Math.abs(j - gj);
      return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz);
    };
    // A binary heap of [f, index].
    const heap = [];
    const push = (f, k) => {
      heap.push([f, k]);
      let c = heap.length - 1;
      while (c > 0) {
        const p = (c - 1) >> 1;
        if (heap[p][0] <= heap[c][0]) break;
        [heap[p], heap[c]] = [heap[c], heap[p]];
        c = p;
      }
    };
    const pop = () => {
      const top = heap[0];
      const last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let c = 0;
        for (;;) {
          const l = c * 2 + 1;
          const r = l + 1;
          let m = c;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === c) break;
          [heap[m], heap[c]] = [heap[c], heap[m]];
          c = m;
        }
      }
      return top;
    };
    const start = idx(si, sj);
    g[start] = 0;
    push(hx(si, sj), start);
    let best = start;
    let bestH = hx(si, sj);
    let expanded = 0;
    while (heap.length && expanded < MAX_EXPAND) {
      const [, k] = pop();
      if (shut[k]) continue;
      shut[k] = 1;
      expanded++;
      const i = (k % W) + i0;
      const j = Math.floor(k / W) + j0;
      const h = hx(i, j);
      if (h < bestH) { bestH = h; best = k; }
      if (i === gi && j === gj) break;
      for (const [di, dj, len] of N8) {
        const ni = i + di;
        const nj = j + dj;
        if (ni < i0 || nj < j0 || ni >= i0 + W || nj >= j0 + H) continue;
        const nk = idx(ni, nj);
        if (shut[nk]) continue;
        const goal = ni === gi && nj === gj;
        if (!goal && !this.open(ni, nj, s)) continue;
        // Diagonally only past two open sides (no cutting a rock's corner).
        if (di && dj && (!this.open(i + di, j, s) || !this.open(i, j + dj, s))) continue;
        if (!this.step(i, j, ni, nj, len)) continue;
        const ng = g[k] + len;
        if (ng >= g[nk]) continue;
        g[nk] = ng;
        prev[nk] = k;
        push(ng + hx(ni, nj), nk);
      }
    }
    if (best === start) return null;
    // Back from the end, as cell centres (the real target in place of its own cell).
    const cells = [];
    for (let k = best; k !== -1; k = prev[k]) cells.push(k);
    cells.reverse();
    const pts = cells.map((k) => ({ x: ((k % W) + i0 + 0.5) * CELL, z: (Math.floor(k / W) + j0 + 0.5) * CELL }));
    pts[0] = { x: from.x, z: from.z };
    const reached = best === idx(gi, gj);
    if (reached) pts[pts.length - 1] = { x: to.x, z: to.z };
    // Pulled taut: from each corner, on to the furthest point still in a clear line.
    const out = [];
    let a = 0;
    while (a < pts.length - 1) {
      let b = pts.length - 1;
      while (b > a + 1 && !this.clear(pts[a].x, pts[a].z, pts[b].x, pts[b].z, s)) b--;
      out.push(pts[b]);
      a = b;
    }
    // (The target itself isn't a corner: once the last corner's passed, it's straight there.)
    if (reached) out.pop();
    return out.length ? out : null;
  }
}
