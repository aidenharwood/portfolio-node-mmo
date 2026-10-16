// Plots: the shape of ground a place stands on — a camp, a base, a hamlet, a town, a landmark —
// so that places aren't all circles. A plot is a polygon round the place's own spot (its local
// metres, world axes): a rectangle, a long strip, an L, a T, a cross, a wedge or an irregular
// blob, turned any way. It is worked out from the place's seed and its bounding radius alone (no
// draws from anyone's stream), and always fits inside that radius, so the world generator's
// spacing, roads and clearances (all by radius) hold, and the screen and the server agree. The
// place's own spot (where its road and waystone lead, where Gen found level ground) is the point
// deepest inside the plot.
//   plotOf(place, opts) → Plot (memoised)  · makePlot(seed, R, opts) → Plot
//   Plot: { shape, R, rot, poly: [[x, z], …], inner (room round its spot), area, perimeter,
//           sdf(x, z)        signed distance to the outline (< 0 inside)
//           inside(x, z, m)  at least m inside it
//           sample(rng, m)   a random point m inside it (or null)
//           at(t), walk(step, t0)  points round the outline (t 0–1): { x, z, nx, nz, a, t }
//           corners()        where the outline turns: { x, z, a, convex } }
import { mulberry32 } from '../core/rng.js';

const TAU = Math.PI * 2;

// Which shapes each kind of place takes, with their weights.
export const PLOT_SHAPES = {
  camp: { rect: 2, strip: 1, L: 2, T: 1, wedge: 1, blob: 2 },
  outpost: { rect: 2, L: 1, wedge: 1, blob: 3 },
  fort: { rect: 3, L: 2, T: 1, cross: 1, wedge: 1 },
  hamlet: { rect: 2, strip: 2, L: 1, wedge: 1, blob: 2 },
  town: { rect: 2, L: 1, T: 1, cross: 1, blob: 2 },
  site: { rect: 1, strip: 1, L: 1, wedge: 1, blob: 3 },
  campsite: { blob: 3, rect: 1, wedge: 1 },
};

// opts: shapes (a PLOT_SHAPES name or { shape: weight }), inner (room the plot must leave round
// its spot, for places whose folk stand on a ring), fill (how much of the radius it reaches).
export function makePlot(seed, R, { shapes = 'camp', inner = 0, fill = 0.97 } = {}) {
  const rng = mulberry32((seed ^ 0x9107) >>> 0);
  const table = typeof shapes === 'string' ? PLOT_SHAPES[shapes] : shapes;
  const total = Object.values(table).reduce((a, b) => a + b, 0);
  let roll = rng() * total;
  let shape = 'blob';
  for (const [k, w] of Object.entries(table)) { if ((roll -= w) < 0) { shape = k; break; } }
  const rot = rng() * TAU;
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  // A shape (in its own frame, x across and z along) moved so its deepest point is the place's
  // spot, scaled to reach R * fill from it, and turned.
  const fit = (pts) => {
    const h = deepest(pts);
    let q = pts.map(([x, z]) => [x - h[0], z - h[1]]);
    const reach = Math.max(...q.map(([x, z]) => Math.hypot(x, z)));
    q = q.map(([x, z]) => [(x / reach) * R * fill, (z / reach) * R * fill]);
    return q.map(([x, z]) => [x * c + z * s, -x * s + z * c]);
  };
  let p = build(shape, R, rot, fit(SHAPES[shape](rng)));
  // Too thin to leave the room asked for: a square, and failing that a lumpy round.
  if (inner > 0 && p.inner < inner) p = build('rect', R, rot, fit(SHAPES.rect(rng, 1)));
  if (inner > 0 && p.inner < inner) p = build('blob', R, rot, fit(round(14, rng, 0.03, false)));
  return p;
}

// ---------------------------------------------------------------- shapes (their own frame)
const SHAPES = {
  // A rectangle, from squarish to twice as long as wide.
  rect: (rng, aspect = 1 + rng() * 1.1) => [[-1, -aspect], [1, -aspect], [1, aspect], [-1, aspect]],
  // A long strip, three to four times as long as wide (along a road, a ridge, a shore).
  strip: (rng) => SHAPES.rect(rng, 2.8 + rng() * 1.2),
  // An L: a long arm and a shorter one off its end.
  L(rng) {
    const a = 0.44 + rng() * 0.12;
    const f = rng() < 0.5 ? 1 : -1;
    return [[-a, -1], [a, -1], [a, 1 - 2 * a], [1, 1 - 2 * a], [1, 1], [-a, 1]].map(([x, z]) => [x * f, z]);
  },
  // A T: a cross-bar with a stem down from its middle.
  T(rng) {
    const a = 0.38 + rng() * 0.1;
    const b = 0.38 + rng() * 0.1;
    return [[-a, -1], [a, -1], [a, 1 - 2 * b], [1, 1 - 2 * b], [1, 1], [-1, 1], [-1, 1 - 2 * b], [-a, 1 - 2 * b]];
  },
  // A cross: four arms (a crossroads fort).
  cross(rng) {
    const a = 0.42 + rng() * 0.1;
    return [[-a, -1], [a, -1], [a, -a], [1, -a], [1, a], [a, a], [a, 1], [-a, 1], [-a, a], [-1, a], [-1, -a], [-a, -a]];
  },
  // A wedge: wide at one end, narrowing to the other.
  wedge(rng) {
    const n = 0.3 + rng() * 0.3;
    return [[-1, -1], [1, -1], [n, 1], [-n, 1]];
  },
  // A blob: an irregular, lumpy outline drawn out along one axis, never quite round.
  blob: (rng) => round(9 + Math.floor(rng() * 5), rng, 0.3 + rng() * 0.15),
};

function round(n, rng, lump, drawnOut = true) {
  const k1 = 2 + Math.floor(rng() * 2);
  const k2 = 3 + Math.floor(rng() * 3);
  const p1 = rng() * TAU;
  const p2 = rng() * TAU;
  const sx = drawnOut ? 1 / Math.sqrt(1 + rng() * 0.7) : 1;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const k = 1 - lump * (0.5 + 0.3 * Math.sin(k1 * a + p1) + 0.2 * Math.sin(k2 * a + p2));
    pts.push([Math.sin(a) * k * sx, Math.cos(a) * k]);
  }
  return pts;
}

// ---------------------------------------------------------------- geometry
// Signed distance from (x, z) to the polygon's outline: < 0 inside.
function signedDistance(poly, x, z) {
  let d = Infinity;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, az] = poly[j];
    const [bx, bz] = poly[i];
    const dx = bx - ax;
    const dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    d = Math.min(d, Math.hypot(x - ax - dx * t, z - az - dz * t));
    if ((az > z) !== (bz > z) && x < ax + ((z - az) / dz) * dx) inside = !inside;
  }
  return inside ? -d : d;
}

// The point deepest inside a polygon (a grid over its bounds, then a finer one round the best).
function deepest(poly) {
  let x0 = Infinity; let x1 = -Infinity; let z0 = Infinity; let z1 = -Infinity;
  for (const [x, z] of poly) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  let best = [(x0 + x1) / 2, (z0 + z1) / 2];
  let bd = -signedDistance(poly, ...best);
  let span = Math.max(x1 - x0, z1 - z0) / 2;
  for (let pass = 0; pass < 4; pass++) {
    const [cx, cz] = best;
    for (let iz = -8; iz <= 8; iz++) for (let ix = -8; ix <= 8; ix++) {
      const x = cx + (ix / 8) * span;
      const z = cz + (iz / 8) * span;
      const d = -signedDistance(poly, x, z);
      if (d > bd) { bd = d; best = [x, z]; }
    }
    span /= 4;
  }
  return best;
}

function build(shape, R, rot, poly) {
  // Wound so that (dz, -dx) along each edge points out of the plot.
  let area = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) area += poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
  if (area > 0) poly = [...poly].reverse();
  area = Math.abs(area) / 2;
  const edges = poly.map((a, i) => {
    const b = poly[(i + 1) % poly.length];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len = Math.hypot(dx, dz);
    return { ax: a[0], az: a[1], dx, dz, len, nx: dz / len, nz: -dx / len };
  });
  // (Checked against the polygon itself, whichever way the axes run.)
  const e0 = edges[0];
  const mx = e0.ax + e0.dx / 2;
  const mz = e0.az + e0.dz / 2;
  if (signedDistance(poly, mx + e0.nx * 0.01 * R, mz + e0.nz * 0.01 * R) < 0) for (const e of edges) { e.nx = -e.nx; e.nz = -e.nz; }
  const perimeter = edges.reduce((t, e) => t + e.len, 0);
  let signed = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) signed += poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
  const wind = Math.sign(signed);
  const sdf = (x, z) => signedDistance(poly, x, z);
  const plot = {
    shape, R, rot, poly, area, perimeter, edges, sdf,
    inner: -sdf(0, 0),
    inside: (x, z, m = 0) => sdf(x, z) < -m,
    sample(rng, m = 0, tries = 80) {
      for (let k = 0; k < tries; k++) {
        const x = (rng() * 2 - 1) * R;
        const z = (rng() * 2 - 1) * R;
        if (sdf(x, z) < -m) return { x, z };
      }
      return null;
    },
    at(t) {
      const u = ((t % 1) + 1) % 1;
      let s = u * perimeter;
      for (const e of edges) {
        if (s <= e.len || e === edges[edges.length - 1]) {
          const k = Math.min(1, s / e.len);
          return { x: e.ax + e.dx * k, z: e.az + e.dz * k, nx: e.nx, nz: e.nz, a: Math.atan2(e.nx, e.nz), t: u, k, len: e.len };
        }
        s -= e.len;
      }
      return null;
    },
    // Points every `step` metres round the outline, from t0 of the way round.
    walk(step, t0 = 0) {
      const n = Math.max(3, Math.round(perimeter / step));
      return Array.from({ length: n }, (_, i) => plot.at(t0 + i / n));
    },
    // Where round the outline (0–1) a bearing from the place's spot meets it.
    tOf(a) {
      let best = 0;
      let bd = Infinity;
      for (let i = 0; i < 128; i++) {
        const q = plot.at(i / 128);
        const d = Math.abs(Math.atan2(Math.sin(Math.atan2(q.x, q.z) - a), Math.cos(Math.atan2(q.x, q.z) - a)));
        if (d < bd) { bd = d; best = i / 128; }
      }
      return best;
    },
    // Where the outline turns by more than ~25°: each with the bearing out between its edges, and
    // whether it's an outer (convex) corner.
    corners() {
      const out = [];
      edges.forEach((e, i) => {
        const p = edges[(i + edges.length - 1) % edges.length];
        const turn = Math.acos(Math.max(-1, Math.min(1, p.nx * e.nx + p.nz * e.nz)));
        if (turn < 0.45) return;
        // Turning the way the outline winds is an outer corner; the other way, an inner one.
        const convex = Math.sign(p.dx * e.dz - p.dz * e.dx) === wind;
        out.push({ x: e.ax, z: e.az, a: Math.atan2(p.nx + e.nx, p.nz + e.nz), convex });
      });
      return out;
    },
  };
  return plot;
}

// A plot of a given outline ([[x, z], …] round a place's spot, R its reach): a street's, a plaza's.
export function plotFrom(poly, R = Math.max(...poly.map(([x, z]) => Math.hypot(x, z)))) {
  return build('poly', R, 0, poly);
}

// A place's plot (memoised by id, seed and options). Its seed is the place's own, or its id's.
const memo = new Map();
export function plotOf(place, opts = {}) {
  const R = opts.R ?? place.radius ?? place.r;
  const key = `${place.id}|${place.seed ?? 0}|${R}|${typeof opts.shapes === 'string' ? opts.shapes : ''}|${opts.inner ?? 0}|${opts.fill ?? ''}`;
  let p = memo.get(key);
  if (!p) {
    if (memo.size > 6000) memo.clear();
    memo.set(key, (p = makePlot((place.seed ?? hashId(place.id)) >>> 0, R, opts)));
  }
  return p;
}

export function hashId(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

// How far (x, z) is outside a terrain pad's edge (< 0 inside): by its plot where it has one
// (world/Gen.js pads: { x, z, r, plot?, margin? }), else its circle.
export function padEdge(p, x, z) {
  if (!p.plot) return Math.hypot(x - p.x, z - p.z) - p.r;
  return p.plot.sdf(x - p.x, z - p.z) - (p.margin ?? 0);
}
