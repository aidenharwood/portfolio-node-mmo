// The scenery kit (docs/GRAPHICS_PLAN.md G2, for the wilds): as a building is a seeded plan built
// from modules in a style (world/build/), a tree, a rock or a cactus is a seeded model built from
// components — a trunk with its roots flared and its branches forked, crown clumps, needle tiers,
// fronds, ribs, strata — in a style for the land it grows in (moss or snow on whatever faces up,
// lichen, crystal growing out of it). world/scenery/models.js holds the models; this is what they
// are built with.
// A model is assembled into one geometry: every piece's colour in its vertices (so a whole tree,
// trunk and crown and fruit, is one instanced draw), its surface (render/Surfaces.js: bark, rock)
// in `puv`/`pat` where surfaces are baked, and, apart, the pieces it collides with (a tree's trunk,
// not its crown) for the world's colliders — the same on a screen and on the server.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../../core/rng.js';
import { SURFACE_BAKE, surfaceCoords, noSurface } from '../../render/Surfaces.js';

const TAU = Math.PI * 2;
const _c = new THREE.Color();
const _v = new THREE.Vector3();
const _n = new THREE.Vector3();

// A steady pseudo-random number in [-1, 1] for a point: the same wherever that point turns up, so
// the corners several faces share move together (no cracks) and a screen and the server agree.
export function jitter(x, y, z, seed = 0) {
  let h = Math.imul(Math.round(x * 1000) | 0, 73856093) ^ Math.imul(Math.round(y * 1000) | 0, 19349663)
    ^ Math.imul(Math.round(z * 1000) | 0, 83492791) ^ Math.imul(seed | 0, 2654435761);
  h = Math.imul(h ^ (h >>> 15), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (((h ^ (h >>> 16)) >>> 0) / 4294967295) * 2 - 1;
}

// ---------------------------------------------------------------- shapes
/**
 * A lump: a sphere roughened by `rough` of its radius (moving each corner in and out along itself),
 * squashed to `sy`, its underside flattened below `floor` (of its radius). detail 0 is 20 faces
 * (a chunky rock), 1 is 80 (a crown clump, a boulder).
 */
export function lump(r, { detail = 1, rough = 0.18, sy = 1, floor = -1, seed = 0 } = {}) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    _v.fromBufferAttribute(p, i).normalize();
    const k = 1 + rough * jitter(_v.x, _v.y, _v.z, seed);
    _v.multiplyScalar(k);
    _v.y = Math.max(_v.y, floor);
    p.setXYZ(i, _v.x * r, _v.y * r * sy, _v.z * r);
  }
  return g;
}

/**
 * A limb: a tapered tube along `points` ([x, y, z]…), radius r0 at the first and r1 at the last,
 * `sides` round, its end capped (a dome when `round`). Trunks, branches, roots, cactus arms.
 * flare: the first ring spread wider by this much (a trunk's root flare); knob: bumps round the
 * rings (a cactus's ribs: every other side pushed out this much).
 */
export function limb(points, r0, r1, { sides = 7, flare = 0, round = false, ribs = 0, seed = 0 } = {}) {
  const pts = points.map((p) => new THREE.Vector3(...p));
  const n = pts.length;
  const pos = [];
  const rings = [];
  // Rings carried along the curve with as little twist as possible.
  let normal = new THREE.Vector3(1, 0, 0);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const dir = (i < n - 1 ? _v.subVectors(pts[i + 1], pts[i]) : _v.subVectors(pts[i], pts[i - 1])).clone().normalize();
    if (i > 0 && i < n - 1) dir.add(_n.subVectors(pts[i], pts[i - 1]).normalize()).normalize();
    normal.sub(dir.clone().multiplyScalar(normal.dot(dir))).normalize();
    if (normal.lengthSq() < 0.5) normal = new THREE.Vector3(0, 0, 1).cross(dir).normalize();
    const bi = new THREE.Vector3().crossVectors(dir, normal);
    let r = r0 + (r1 - r0) * t;
    if (i === 0) r *= 1 + flare;
    const ring = [];
    for (let s = 0; s < sides; s++) {
      const a = (s / sides) * TAU;
      const rr = r * (1 + (ribs && s % 2 ? ribs : 0) + 0.06 * jitter(i, s, n, seed));
      ring.push(pts[i].clone().addScaledVector(normal, Math.cos(a) * rr).addScaledVector(bi, Math.sin(a) * rr));
    }
    rings.push({ ring, dir, r });
  }
  const tri = (a, b, c) => pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  for (let i = 0; i < n - 1; i++) {
    const A = rings[i].ring;
    const B = rings[i + 1].ring;
    for (let s = 0; s < sides; s++) {
      const s1 = (s + 1) % sides;
      tri(A[s], A[s1], B[s1]);
      tri(A[s], B[s1], B[s]);
    }
  }
  // The end: a dome or a flat cap.
  const last = rings[n - 1];
  const tip = pts[n - 1].clone().addScaledVector(last.dir, round ? last.r * 0.9 : 0);
  if (round) {
    const mid = last.ring.map((p) => p.clone().lerp(tip, 0.45).addScaledVector(last.dir, last.r * 0.35));
    for (let s = 0; s < sides; s++) {
      const s1 = (s + 1) % sides;
      tri(last.ring[s], last.ring[s1], mid[s1]);
      tri(last.ring[s], mid[s1], mid[s]);
      tri(mid[s], mid[s1], tip);
    }
  } else {
    for (let s = 0; s < sides; s++) tri(last.ring[s], last.ring[(s + 1) % sides], tip);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

/**
 * A needle tier (a conifer's skirt of branches): a cone `r` across and `h` tall whose rim is cut
 * into `teeth` points, the points drooping by `droop`, the underside drawn so it isn't hollow.
 */
export function tier(r, h, { teeth = 9, droop = 0.18, notch = 0.22, seed = 0 } = {}) {
  const pos = [];
  const tip = new THREE.Vector3(0, h, 0);
  const rim = [];
  const n = teeth * 2;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + jitter(i, seed, 1) * 0.08;
    const point = i % 2 === 0;
    const rr = r * (point ? 1 + 0.08 * jitter(i, seed, 2) : 1 - notch);
    rim.push(new THREE.Vector3(Math.cos(a) * rr, point ? -droop * h : droop * h * 0.4, Math.sin(a) * rr));
  }
  const under = new THREE.Vector3(0, h * 0.18, 0);
  const tri = (a, b, c) => pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  for (let i = 0; i < n; i++) {
    const a = rim[i];
    const b = rim[(i + 1) % n];
    tri(tip, b, a);
    tri(under, a, b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

/**
 * A frond or leaf blade: a strip along an arc from the origin out along +z, `len` long and `w`
 * wide at its widest, drooping by `droop` (its tip that far below a straight line), folded down
 * its spine by `fold` and cut into `lobes` leaflets down each side (0: a plain blade).
 */
export function blade(len, w, { droop = 0.5, fold = 0.25, lobes = 0, segs = 6, lift = 0.6 } = {}) {
  const pos = [];
  const spine = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    spine.push(new THREE.Vector3(0, lift * len * t * (1 - t) * 1.6 - droop * len * t * t, len * t));
  }
  const width = (t, side, i) => {
    const base = Math.sin(Math.PI * Math.min(1, t * 1.15)) * w * 0.5;
    return lobes ? base * (i % 2 ? 0.45 : 1.15) : base;
  };
  const tri = (a, b, c) => pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  for (let i = 0; i < segs; i++) {
    const t0 = i / segs;
    const t1 = (i + 1) / segs;
    for (const side of [-1, 1]) {
      const a = spine[i];
      const b = spine[i + 1];
      const ea = new THREE.Vector3(side * width(t0, side, i), a.y - fold * width(t0, side, i), a.z);
      const eb = new THREE.Vector3(side * width(t1, side, i + 1), b.y - fold * width(t1, side, i + 1), b.z);
      if (side > 0) { tri(a, b, eb); tri(a, eb, ea); } else { tri(a, eb, b); tri(a, ea, eb); }
    }
  }
  const g = new THREE.BufferGeometry();
  // (One-sided: a set with blades in it is drawn double-sided, world/scenery/models.js `double`.)
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

/**
 * A lathe: a profile of [radius, y] pairs turned `sides` times round the y axis (a mushroom's cap
 * and gills, a ring round its stem, a barrel cactus).
 */
export function lathe(profile, sides = 12) {
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(Math.max(0.0001, r), y)), sides);
}

// ---------------------------------------------------------------- the model
// Colours a piece can be given, besides a plain one: run from `bottom` to `top` up the piece's
// height (as placed); a second colour on the faces looking up (`up`, past `over`: moss, snow,
// lichen, sand) — by face, so it lies on the tops of rocks and tiers; darker toward a centre
// (`hollow`: [x, y, z, radius, depth], foliage shaded within); in strata (`bands`: [colour, every
// so many metres up]).
// far: the model as seen from a distance — the same plan (the same random numbers, so the same
// tree), its small pieces left out (those added with `small`) and its shapes coarser (models ask
// `m.far` for how many sides, teeth or facets to give them).
export class Model {
  constructor(seed, { far = false } = {}) {
    this.seed = seed;
    this.far = far;
    this.rnd = mulberry32(seed);
    this.parts = [];
  }

  r(a, b) { return a + (b - a) * this.rnd(); }
  pick(list) { return list[Math.floor(this.rnd() * list.length)]; }
  chance(p) { return this.rnd() < p; }

  /**
   * opts: pos, rot (Euler XYZ), scale (number | [x, y, z]), smooth (shared normals: lumps and
   * limbs read rounded; left out, faceted), pattern (a surface kind), hit (it collides), small
   * (left out from afar),
   * bottom/top (a gradient), up/over (a colour on up-facing faces), hollow, bands, speckle (a little
 * lighter or darker corner by corner), glow (brighter).
   */
  add(geo, color, opts = {}) {
    if (this.far && opts.small) return this;
    const o = new THREE.Object3D();
    if (opts.pos) o.position.fromArray(opts.pos);
    if (opts.rot) o.rotation.set(opts.rot[0], opts.rot[1], opts.rot[2]);
    if (opts.quat) o.quaternion.copy(opts.quat);
    if (opts.scale !== undefined) {
      if (typeof opts.scale === 'number') o.scale.setScalar(opts.scale);
      else o.scale.fromArray(opts.scale);
    }
    o.updateMatrix();
    this.parts.push({ geo, color, o, ...opts });
    return this;
  }

  /**
   * Builds the model: { geo, hit } — geo, everything (position, normal, colour, and the surface's
   * coordinates when surfaces are baked); hit, the pieces it collides with, position only (all of
   * it if none is marked).
   * opts.draw false: only `hit` is wanted (the server's world).
   */
  build({ draw = true } = {}) {
    const parts = [];
    const hits = [];
    const anyHit = this.parts.some((p) => p.hit);
    for (const p of this.parts) {
      const collides = p.hit || !anyHit;
      if (!draw && !collides) continue;
      let g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
      for (const name of Object.keys(g.attributes)) if (name !== 'position') g.deleteAttribute(name);
      if (p.smooth) {
        // Shared normals over the piece's own corners (welded), then split again to merge.
        const w = mergeVertices(g, 1e-4);
        w.computeVertexNormals();
        g = w.toNonIndexed();
      } else g.computeVertexNormals();
      if (collides) hits.push(g.clone().applyMatrix4(p.o.matrix));
      if (!draw) continue;
      if (SURFACE_BAKE.on) {
        if (p.pattern) surfaceCoords(g, p.pattern, p.o);
        else noSurface(g);
      }
      g.applyMatrix4(p.o.matrix);
      paint(g, p);
      parts.push(g);
    }
    for (const h of hits) for (const name of Object.keys(h.attributes)) if (name !== 'position') h.deleteAttribute(name);
    const hit = hits.length ? mergeGeometries(hits) : null;
    if (!draw) return { geo: null, hit };
    const geo = mergeGeometries(parts);
    geo.computeBoundingSphere();
    hit?.computeBoundingSphere();
    return { geo, hit };
  }
}

// A piece's colours into its vertices (linear, as a material's colour is once set).
function paint(g, p) {
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  const n = pos.count;
  const rgb = new Float32Array(n * 3);
  let y0 = 0;
  let y1 = 1;
  if (p.bottom !== undefined) {
    g.computeBoundingBox();
    y0 = g.boundingBox.min.y;
    y1 = Math.max(y0 + 1e-3, g.boundingBox.max.y);
  }
  const base = new THREE.Color(p.color);
  const up = p.up !== undefined ? new THREE.Color(p.up) : null;
  const bottom = p.bottom !== undefined ? new THREE.Color(p.bottom) : null;
  const top = p.top !== undefined ? new THREE.Color(p.top) : base;
  const bands = p.bands ? new THREE.Color(p.bands[0]) : null;
  for (let t = 0; t < n; t += 3) {
    // The face's own normal (for colours by face).
    let faceUp = 0;
    if (up) {
      _n.set(0, 0, 0);
      for (let k = 0; k < 3; k++) _n.x += nor.getX(t + k), _n.y += nor.getY(t + k), _n.z += nor.getZ(t + k);
      faceUp = _n.normalize().y;
    }
    for (let k = t; k < t + 3 && k < n; k++) {
      if (bottom) _c.copy(bottom).lerp(top, (pos.getY(k) - y0) / (y1 - y0));
      else _c.copy(base);
      if (bands && Math.floor(pos.getY(k) / p.bands[1] + 0.3 * jitter(0, Math.floor(pos.getY(k) / p.bands[1]), 0, 9)) % 2) _c.lerp(bands, 0.8);
      if (up && faceUp > (p.over ?? 0.55)) _c.lerp(up, Math.min(1, (faceUp - (p.over ?? 0.55)) * 6));
      if (p.hollow) {
        const [hx, hy, hz, hr, depth] = p.hollow;
        const d = Math.hypot(pos.getX(k) - hx, (pos.getY(k) - hy) * 1.2, pos.getZ(k) - hz) / hr;
        _c.multiplyScalar(1 - depth * Math.max(0, 1 - d));
      }
      if (p.speckle) _c.multiplyScalar(1 + p.speckle * jitter(pos.getX(k), pos.getY(k), pos.getZ(k), 5));
      if (p.glow) _c.multiplyScalar(p.glow);
      rgb[k * 3] = _c.r;
      rgb[k * 3 + 1] = _c.g;
      rgb[k * 3 + 2] = _c.b;
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(rgb, 3));
}
