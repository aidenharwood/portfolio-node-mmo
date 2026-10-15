// Routes along the roads (gameplay phase 6b): the way something crosses the world on foot — a
// Synth war-walker marching on a settlement, later a caravan — and the follower that walks it.
//
// A route runs from a waystone a few regions off, along the roads between waystones (world/Gen.js
// buildRoads: each region draws its roads east and north), to the settlement's own waystone and
// in by its spur road. It keeps out of the cities and the hub, unless the city is where it's going.
// The follower walks it at a steady pace; ground it can't stand on (a ford, a slip) it jumps if
// there's footing within reach, and otherwise it's stuck, and says so.
import { CITY_WALL } from '../world/places.js';

const JOIN = 8;       // metres: a road reaches a waystone if it ends this close to it
const HUB_CLEAR = 60; // metres from the hub's heart a route keeps
const STEP = 2.5;     // metres between a road's points (Gen.roadPath), and the follower's look-ahead

const dist = (a, b) => Math.hypot(a[0] - b.x, a[1] - b.z);
const NEXT = [[1, 0], [0, 1], [-1, 0], [0, -1]]; // E, N, W, S: the same route every time

// The road from region a's waystone to its neighbour b's ([rx, rz] each), or null if none reaches.
function link(gen, a, b) {
  const wa = gen.peekWaystone(a[0], a[1]);
  const wb = gen.peekWaystone(b[0], b[1]);
  if (!wa || !wb) return null;
  // East and north, a region draws its own; west and south, the neighbour drew it the other way.
  const own = b[0] - a[0] === 1 || b[1] - a[1] === 1;
  const [from, to, roads] = own ? [wa, wb, gen.region(a[0], a[1]).roads] : [wb, wa, gen.region(b[0], b[1]).roads];
  const pts = roads.find((p) => p.length > 1 && dist(p[0], from) < JOIN && dist(p.at(-1), to) < JOIN);
  if (!pts) return null;
  return own ? pts : [...pts].reverse();
}

// From a region's waystone in to the site: its spur road if it has one (a hamlet's), else straight
// there; cut short at the edge of its heart.
function lastLeg(gen, region, site) {
  const w = gen.peekWaystone(region.rx, region.rz);
  let pts = region.roads.find((p) => p.length > 1 && dist(p[0], w) < JOIN && dist(p.at(-1), site) < (site.r ?? 0) + 12);
  if (!pts) {
    const n = Math.ceil(Math.hypot(site.x - w.x, site.z - w.z) / STEP);
    pts = Array.from({ length: n + 1 }, (_, i) => [w.x + ((site.x - w.x) * i) / Math.max(1, n), w.z + ((site.z - w.z) * i) / Math.max(1, n)]);
  }
  const out = [];
  for (const p of pts) {
    out.push(p);
    if (dist(p, site) <= (site.r ?? 0) * 0.5) break;
  }
  return out;
}

const lengthOf = (pts) => {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return L;
};

// A route to `site` ({ x, z, r }) along the roads, between `min` and `max` metres long (at least
// four minutes at a war-walker's pace, so one player has time to stop it), from at
// most `hops` waystones off: { points: [[x, z], ...], length, regions } — or null if none fits.
export function roadRoute(gen, site, { min = 360, max = 480, hops = 3 } = {}) {
  const home = gen.regionAt(site.x, site.z);
  // A region with no waystone has no roads in: nothing comes that way.
  if (!gen.peekWaystone(home.rx, home.rz)) return null;
  const cities = gen.cities();
  const ok = (rx, rz) => {
    const w = gen.peekWaystone(rx, rz);
    if (!w || Math.hypot(w.x, w.z) < HUB_CLEAR) return false;
    return cities.every((c) => Math.hypot(c.x - w.x, c.z - w.z) > CITY_WALL + 10);
  };
  const leg = lastLeg(gen, home, site);
  const seen = new Set([`${home.rx},${home.rz}`]);
  // Breadth first out from the settlement's region: each entry the way in, start first.
  let ring = [[[home.rx, home.rz]]];
  for (let h = 0; h < hops; h++) {
    const next = [];
    for (const way of ring) {
      const [cx, cz] = way[0];
      for (const [dx, dz] of NEXT) {
        const n = [cx + dx, cz + dz];
        const key = `${n[0]},${n[1]}`;
        if (seen.has(key) || !ok(n[0], n[1]) || !link(gen, n, way[0])) continue;
        seen.add(key);
        const into = [n, ...way];
        next.push(into);
        const points = [];
        for (let i = 1; i < into.length; i++) points.push(...link(gen, into[i - 1], into[i]).slice(points.length ? 1 : 0));
        points.push(...leg.slice(1));
        const length = lengthOf(points);
        if (length < min || length > max) continue;
        const regions = new Set();
        for (let i = 0; i < points.length; i += 4) regions.add(gen.regionAt(points[i][0], points[i][1]).key);
        regions.add(home.key);
        return { points, length, regions: regions.size };
      }
    }
    ring = next;
  }
  return null;
}

// Walks a body along `points` at `speed` m/s. step(dt) → 'moving', 'arrived' or 'stuck'.
export class RouteFollower {
  constructor(points, { speed, canStand = () => true, skip = 30 }) {
    this.points = points;
    this.speed = speed;
    this.canStand = canStand;
    this.skip = skip;
    this.cum = [0];
    for (let i = 1; i < points.length; i++) this.cum.push(this.cum[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
    this.total = this.cum.at(-1);
    this.d = 0;
    this.skipped = 0;
    this.status = points.length > 1 ? 'moving' : 'arrived';
    this.place(0);
  }

  // Where `d` metres along is: { x, z, heading }.
  at(d) {
    const { points, cum } = this;
    let i = 1;
    while (i < points.length - 1 && cum[i] < d) i++;
    const [ax, az] = points[Math.max(0, i - 1)];
    const [bx, bz] = points[Math.min(i, points.length - 1)];
    const seg = cum[i] - cum[i - 1] || 1;
    const t = Math.min(1, Math.max(0, (d - cum[i - 1]) / seg));
    return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, heading: Math.atan2(bx - ax, bz - az) };
  }

  place(d) {
    this.d = d;
    const p = this.at(d);
    this.x = p.x;
    this.z = p.z;
    this.heading = p.heading;
    this.left = this.total - d;
  }

  step(dt) {
    if (this.status !== 'moving') return this.status;
    let d = Math.min(this.total, this.d + this.speed * dt);
    let p = this.at(d);
    if (!this.canStand(p.x, p.z)) {
      // Footing further on, within reach: over the gap. None: stuck where it last stood.
      let found = false;
      for (let k = STEP; k <= this.skip; k += STEP) {
        const nd = Math.min(this.total, d + k);
        p = this.at(nd);
        if (this.canStand(p.x, p.z)) { d = nd; found = true; break; }
        if (nd >= this.total) break;
      }
      if (!found) return (this.status = 'stuck');
      this.skipped++;
    }
    this.place(d);
    if (d >= this.total) this.status = 'arrived';
    return this.status;
  }
}
