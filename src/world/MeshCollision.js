// Collision against the triangles of world props (scenery and the meshes of places), rather than
// against an outline of them. Each mesh-backed collider keeps the triangles inside its volume in
// world space, with their normals (outward, as drawn: front faces are what's visible) and a small
// grid once there are many. Triangles act by their facing:
//   walls     steep ones (|n.y| < STEEP) push a mover's body sideways, but only where they cross
//             the band between its step height and its head — so a ring, a hut or a hollow trunk
//             is walls you can be on either side of, not a solid footprint
//   floors    up-facing ones are what can be stood on (the rim of a well, a rock's top, a roof)
//   ceilings  down-facing ones stop a jump from rising through them, and keep a mover from
//             stepping up onto anything above them
import * as THREE from 'three';

const CELL = 8;          // bins for slicing a place's meshes among its colliders
const TRI_CELL = 1.25;   // a collider's own lookup grid, once it has GRID_MIN triangles
const GRID_MIN = 40;
export const STEEP = 0.7; // |normal.y| under this is a wall (steeper than ~45°)
const MESH_PAD = 0.6;     // how far past a place's collider its triangles are still its own
const MESH_PAD_TOP = 1;
const FLAT_EPS = 0.02;    // |normal.y| under this has no area seen from above
const raycaster = new THREE.Raycaster();
const hits = [];
const scratchMesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
const identity = new THREE.Matrix4();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();

const cellKey = (x, z) => `${x},${z}`;

export function colliderContainsPoint(collider, point, pad = 0) {
  if (point.y < collider.y - pad || point.y > collider.y + collider.h + pad) return false;
  return colliderCovers(collider, point.x, point.z, pad);
}

// Is (x, z) within the collider's footprint (circle or turned box), ignoring height?
export function colliderCovers(collider, x, z, pad = 0) {
  const dx = x - collider.x;
  const dz = z - collider.z;
  if (collider.box) {
    const angle = collider.ry ?? 0;
    const lx = Math.cos(angle) * dx - Math.sin(angle) * dz;
    const lz = Math.sin(angle) * dx + Math.cos(angle) * dz;
    return Math.abs(lx) <= collider.hx + pad && Math.abs(lz) <= collider.hz + pad;
  }
  const r = collider.r + pad;
  return dx * dx + dz * dz <= r * r;
}

// The collider's volume as planes (signed distance ≥ 0 inside), grown by `pad` (`padTop` above):
// its floor and top, and its box sides or a 20-sided prism round its circle.
function colliderPlanes(collider, pad = 0, padTop = pad) {
  const y0 = collider.y - pad;
  const y1 = collider.y + collider.h + padTop;
  const angle = collider.ry ?? 0;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const planes = [
    (p) => p[1] - y0,
    (p) => y1 - p[1],
  ];
  if (collider.box) {
    const hx = collider.hx + pad;
    const hz = collider.hz + pad;
    planes.push(
      (p) => hx - (cos * (p[0] - collider.x) - sin * (p[2] - collider.z)),
      (p) => hx + (cos * (p[0] - collider.x) - sin * (p[2] - collider.z)),
      (p) => hz - (sin * (p[0] - collider.x) + cos * (p[2] - collider.z)),
      (p) => hz + (sin * (p[0] - collider.x) + cos * (p[2] - collider.z)),
    );
  } else {
    for (let i = 0; i < 20; i++) {
      const angle = (i / 20) * Math.PI * 2;
      const nx = Math.cos(angle);
      const nz = Math.sin(angle);
      planes.push((p) => collider.r + pad - nx * (p[0] - collider.x) - nz * (p[2] - collider.z));
    }
  }
  return planes;
}

function clipPolygon(poly, signedDistance) {
  if (!poly.length) return poly;
  const out = [];
  let previous = poly[poly.length - 1];
  let dPrevious = signedDistance(previous);
  for (const current of poly) {
    const dCurrent = signedDistance(current);
    const inCurrent = dCurrent >= -1e-5;
    const inPrevious = dPrevious >= -1e-5;
    if (inCurrent !== inPrevious) {
      const t = dPrevious / (dPrevious - dCurrent);
      out.push([
        previous[0] + (current[0] - previous[0]) * t,
        previous[1] + (current[1] - previous[1]) * t,
        previous[2] + (current[2] - previous[2]) * t,
      ]);
    }
    if (inCurrent) out.push(current);
    previous = current;
    dPrevious = dCurrent;
  }
  return out;
}

// Is triangle (a, b, c) worth keeping for collision? Not if it lies at or under the collider's
// floor (buried, or lying on the ground) — unless it's the underside of something raised up to it
// (a deck's is its ceiling).
function standsUp(collider, a, b, c) {
  const maxY = Math.max(a.y, b.y, c.y);
  const ex = b.x - a.x; const ey = b.y - a.y; const ez = b.z - a.z;
  const fx = c.x - a.x; const fy = c.y - a.y; const fz = c.z - a.z;
  const nx = ey * fz - ez * fy;
  const ny = ez * fx - ex * fz;
  const nz = ex * fy - ey * fx;
  const len2 = nx * nx + ny * ny + nz * nz;
  if (len2 < 1e-12) return false;
  return !(maxY <= collider.y + 0.035 && (ny >= 0 || maxY < collider.y - 0.035 || ny * ny < 0.25 * len2));
}

// Does triangle (a, b, c) reach into the volume `planes` bound?
function meets(planes, a, b, c) {
  let poly = [[a.x, a.y, a.z], [b.x, b.y, b.z], [c.x, c.y, c.z]];
  for (const plane of planes) {
    poly = clipPolygon(poly, plane);
    if (poly.length < 3) return false;
  }
  return true;
}

// A prop's own triangles (`geometry` placed by `matrix`), flat xyz in world space: all of them, not
// cut to the collider's outline — a cut wall is a hole to walk in through.
function propTriangles(collider, geometry, matrix = identity, out = []) {
  const position = geometry?.getAttribute('position');
  if (!position || position.count < 3) return out;
  const index = geometry.index;
  const available = index ? index.count : position.count;
  const start = Math.max(0, geometry.drawRange.start ?? 0);
  const end = Math.min(available, Number.isFinite(geometry.drawRange.count) ? start + geometry.drawRange.count : available);
  // A mirroring matrix turns the winding over; keep front faces facing out.
  const flip = matrix.determinant() < 0;
  for (let i = start; i + 2 < end; i += 3) {
    const ia = index ? index.getX(i) : i;
    const ib = index ? index.getX(i + 1) : i + 1;
    const ic = index ? index.getX(i + 2) : i + 2;
    _a.fromBufferAttribute(position, ia).applyMatrix4(matrix);
    _b.fromBufferAttribute(position, ib).applyMatrix4(matrix);
    _c.fromBufferAttribute(position, ic).applyMatrix4(matrix);
    if (!standsUp(collider, _a, _b, _c)) continue;
    if (flip) out.push(_a.x, _a.y, _a.z, _c.x, _c.y, _c.z, _b.x, _b.y, _b.z);
    else out.push(_a.x, _a.y, _a.z, _b.x, _b.y, _b.z, _c.x, _c.y, _c.z);
  }
  return out;
}

// ---------------------------------------------------------------- the triangle store
// { n, v (9 per triangle), nrm (unit, 3 per), box (minX, minY, minZ, maxX, maxY, maxZ per),
//   grid (cells of triangle indices) | null, mark (for de-duplicating grid lookups), and the
//   bounds of them all (x0, y0, z0 – x1, y1, z1) }
export function packTriangles(list) {
  const n = Math.floor(list.length / 9);
  if (!n) return null;
  const v = Float64Array.from(list.length === n * 9 ? list : list.slice(0, n * 9));
  const nrm = new Float32Array(n * 3);
  const box = new Float64Array(n * 6);
  let x0 = Infinity; let z0 = Infinity; let x1 = -Infinity; let z1 = -Infinity;
  let y0 = Infinity; let y1 = -Infinity;
  for (let i = 0; i < n; i++) {
    const o = i * 9;
    const ex = v[o + 3] - v[o]; const ey = v[o + 4] - v[o + 1]; const ez = v[o + 5] - v[o + 2];
    const fx = v[o + 6] - v[o]; const fy = v[o + 7] - v[o + 1]; const fz = v[o + 8] - v[o + 2];
    let nx = ey * fz - ez * fy;
    let ny = ez * fx - ex * fz;
    let nz = ex * fy - ey * fx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    nrm[i * 3] = nx; nrm[i * 3 + 1] = ny; nrm[i * 3 + 2] = nz;
    const b = i * 6;
    box[b] = Math.min(v[o], v[o + 3], v[o + 6]);
    box[b + 1] = Math.min(v[o + 1], v[o + 4], v[o + 7]);
    box[b + 2] = Math.min(v[o + 2], v[o + 5], v[o + 8]);
    box[b + 3] = Math.max(v[o], v[o + 3], v[o + 6]);
    box[b + 4] = Math.max(v[o + 1], v[o + 4], v[o + 7]);
    box[b + 5] = Math.max(v[o + 2], v[o + 5], v[o + 8]);
    x0 = Math.min(x0, box[b]); z0 = Math.min(z0, box[b + 2]);
    x1 = Math.max(x1, box[b + 3]); z1 = Math.max(z1, box[b + 5]);
    y0 = Math.min(y0, box[b + 1]); y1 = Math.max(y1, box[b + 4]);
  }
  const store = { n, v, nrm, box, grid: null, mark: new Uint32Array(n), stamp: 0, x0, y0, z0, x1, y1, z1 };
  if (n >= GRID_MIN) {
    const nx = Math.max(1, Math.ceil((x1 - x0) / TRI_CELL));
    const nz = Math.max(1, Math.ceil((z1 - z0) / TRI_CELL));
    const counts = new Uint32Array(nx * nz + 1);
    const span = (i, each) => {
      const b = i * 6;
      const ix0 = Math.min(nx - 1, Math.floor((box[b] - x0) / TRI_CELL));
      const ix1 = Math.min(nx - 1, Math.floor((box[b + 3] - x0) / TRI_CELL));
      const iz0 = Math.min(nz - 1, Math.floor((box[b + 2] - z0) / TRI_CELL));
      const iz1 = Math.min(nz - 1, Math.floor((box[b + 5] - z0) / TRI_CELL));
      for (let iz = iz0; iz <= iz1; iz++) for (let ix = ix0; ix <= ix1; ix++) each(iz * nx + ix);
    };
    for (let i = 0; i < n; i++) span(i, (k) => counts[k + 1]++);
    for (let k = 0; k < nx * nz; k++) counts[k + 1] += counts[k];
    const items = new Uint32Array(counts[nx * nz]);
    const fill = counts.slice(0, nx * nz);
    for (let i = 0; i < n; i++) span(i, (k) => { items[fill[k]++] = i; });
    store.grid = { nx, nz, start: counts, items };
  }
  return store;
}

// The triangles whose grid cells meet the rectangle [x0, x1] × [z0, z1], into `found`; returns
// how many. (Every triangle, when the store has no grid.)
let found = new Uint32Array(256);
function gather(T, x0, z0, x1, z1) {
  if (x1 < T.x0 || x0 > T.x1 || z1 < T.z0 || z0 > T.z1) return 0;
  const g = T.grid;
  if (!g) {
    if (found.length < T.n) found = new Uint32Array(T.n * 2);
    for (let i = 0; i < T.n; i++) found[i] = i;
    return T.n;
  }
  if (++T.stamp >= 0xffffffff) { T.mark.fill(0); T.stamp = 1; }
  const s = T.stamp;
  const ix0 = Math.max(0, Math.floor((x0 - T.x0) / TRI_CELL));
  const ix1 = Math.min(g.nx - 1, Math.floor((x1 - T.x0) / TRI_CELL));
  const iz0 = Math.max(0, Math.floor((z0 - T.z0) / TRI_CELL));
  const iz1 = Math.min(g.nz - 1, Math.floor((z1 - T.z0) / TRI_CELL));
  let count = 0;
  for (let iz = iz0; iz <= iz1; iz++) {
    for (let ix = ix0; ix <= ix1; ix++) {
      const k = iz * g.nx + ix;
      for (let j = g.start[k]; j < g.start[k + 1]; j++) {
        const i = g.items[j];
        if (T.mark[i] === s) continue;
        T.mark[i] = s;
        if (count >= found.length) {
          const bigger = new Uint32Array(found.length * 2);
          bigger.set(found);
          found = bigger;
        }
        found[count++] = i;
      }
    }
  }
  return count;
}

// Height of triangle i over (x, z), or NaN when (x, z) is outside it (seen from above).
function heightOn(T, i, x, z) {
  const v = T.v;
  const o = i * 9;
  const ax = v[o]; const az = v[o + 2];
  const bx = v[o + 3]; const bz = v[o + 5];
  const cx = v[o + 6]; const cz = v[o + 8];
  const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
  if (Math.abs(d) < 1e-10) return NaN;
  const wa = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d;
  const wb = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d;
  const wc = 1 - wa - wb;
  if (wa < -1e-6 || wb < -1e-6 || wc < -1e-6) return NaN;
  return wa * v[o + 1] + wb * v[o + 4] + wc * v[o + 7];
}

// Gives a collider its collision triangles: from `meshData` ({ meshGeometry, meshMatrix }, the
// prop as drawn), whole.
export function attachMeshCollider(collider, meshData) {
  collider.meshGeometry = meshData.meshGeometry;
  collider.meshMatrix = meshData.meshMatrix ?? identity;
  collider.tris = packTriangles(propTriangles(collider, collider.meshGeometry, collider.meshMatrix));
  return collider;
}

// The highest floor (up-facing surface) of the collider's mesh at (x, z) no higher than maxY, or
// null. Ceilings (down-facing surfaces) above `ceilFrom` hide what's above them: a mover with its
// step height at ceilFrom can't come up through the cap of a rock or the deck of a platform.
export function meshSupportAt(collider, x, z, maxY = Infinity, ceilFrom = Infinity) {
  const T = collider.tris;
  if (!T) return null;
  const count = gather(T, x, z, x, z);
  let up = -Infinity;
  let ceil = Infinity;
  for (let k = 0; k < count; k++) {
    const i = found[k];
    const b = i * 6;
    if (x < T.box[b] || x > T.box[b + 3] || z < T.box[b + 2] || z > T.box[b + 5]) continue;
    const ny = T.nrm[i * 3 + 1];
    if (ny > -FLAT_EPS && ny < FLAT_EPS) continue;
    if (ny > 0 ? T.box[b + 1] > maxY : T.box[b + 4] <= ceilFrom) continue;
    const y = heightOn(T, i, x, z);
    if (Number.isNaN(y)) continue;
    if (ny > 0) { if (y <= maxY && y > up) up = y; }
    else if (y > ceilFrom && y < ceil) ceil = y;
  }
  if (up > ceil) {
    // Something overhead: only what's under it can be reached.
    const top = up;
    up = -Infinity;
    for (let k = 0; k < count; k++) {
      const i = found[k];
      if (T.nrm[i * 3 + 1] < FLAT_EPS) continue;
      const y = heightOn(T, i, x, z);
      if (!Number.isNaN(y) && y < ceil && y > up && y < top) up = y;
    }
  }
  return Number.isFinite(up) ? up : null;
}

// The lowest ceiling (down-facing surface) of the collider's mesh over (x, z) above fromY.
export function meshCeilingAt(collider, x, z, fromY) {
  const T = collider.tris;
  if (!T) return Infinity;
  const count = gather(T, x, z, x, z);
  let ceil = Infinity;
  for (let k = 0; k < count; k++) {
    const i = found[k];
    const b = i * 6;
    if (T.nrm[i * 3 + 1] > -FLAT_EPS || T.box[b + 4] <= fromY) continue;
    if (x < T.box[b] || x > T.box[b + 3] || z < T.box[b + 2] || z > T.box[b + 5]) continue;
    const y = heightOn(T, i, x, z);
    if (!Number.isNaN(y) && y > fromY && y < ceil) ceil = y;
  }
  return ceil;
}

// Clips triangle i to the slab y0 ≤ y ≤ y1: its outline seen from above into _poly (x, z pairs)
// and heights into _polyY. Returns the number of points (a triangle cut twice has up to five).
const _poly = new Float64Array(10);
const _polyY = new Float64Array(5);
const _bufA = new Float64Array(15);
const _bufB = new Float64Array(15);
function cutBelow(src, n, dst, level, keepAbove) {
  let m = 0;
  for (let k = 0; k < n; k++) {
    const p = k * 3;
    const q = ((k + n - 1) % n) * 3;
    const dp = keepAbove ? src[p + 1] - level : level - src[p + 1];
    const dq = keepAbove ? src[q + 1] - level : level - src[q + 1];
    if ((dp >= 0) !== (dq >= 0)) {
      const t = dq / (dq - dp);
      dst[m * 3] = src[q] + (src[p] - src[q]) * t;
      dst[m * 3 + 1] = src[q + 1] + (src[p + 1] - src[q + 1]) * t;
      dst[m * 3 + 2] = src[q + 2] + (src[p + 2] - src[q + 2]) * t;
      m++;
    }
    if (dp >= 0) {
      dst[m * 3] = src[p]; dst[m * 3 + 1] = src[p + 1]; dst[m * 3 + 2] = src[p + 2];
      m++;
    }
  }
  return m;
}
function slab(T, i, y0, y1) {
  const o = i * 9;
  for (let k = 0; k < 9; k++) _bufA[k] = T.v[o + k];
  let n = cutBelow(_bufA, 3, _bufB, y0, true);
  if (n < 2) return 0;
  n = cutBelow(_bufB, n, _bufA, y1, false);
  if (n < 2) return 0;
  for (let k = 0; k < n; k++) {
    _poly[k * 2] = _bufA[k * 3];
    _poly[k * 2 + 1] = _bufA[k * 3 + 2];
    _polyY[k] = _bufA[k * 3 + 1];
  }
  return n;
}

// Pushes a body standing at `pos` (radius `radius`; it can step over anything below y0 and fits
// under anything above y1) out of the collider's walls. `from` (where it was before this move)
// says which side of a wall it came from, so a fast mover can't come out the far side of one.
// Returns whether it moved.
export function pushOutOfMeshWalls(collider, pos, radius, y0, y1, from = null) {
  const T = collider.tris;
  if (!T || y1 <= y0) return false;
  const count = gather(T, pos.x - radius, pos.z - radius, pos.x + radius, pos.z + radius);
  let moved = false;
  for (let k = 0; k < count; k++) {
    const i = found[k];
    const ny = T.nrm[i * 3 + 1];
    if (ny >= STEEP || ny <= -STEEP) continue;
    const b = i * 6;
    if (T.box[b + 4] < y0 || T.box[b + 1] > y1) continue;
    const cx = pos.x;
    const cz = pos.z;
    if (cx + radius < T.box[b] || cx - radius > T.box[b + 3] || cz + radius < T.box[b + 2] || cz - radius > T.box[b + 5]) continue;
    const n = slab(T, i, y0, y1);
    if (n < 2) continue;
    // Horizontal normal (out of the front face) and how far the centre is along it from the plane,
    // at the middle of what's left of the triangle.
    const nx = T.nrm[i * 3];
    const nz = T.nrm[i * 3 + 2];
    const h = Math.hypot(nx, nz);
    const ux = nx / h;
    const uz = nz / h;
    let ym = 0;
    for (let j = 0; j < n; j++) ym += _polyY[j];
    ym /= n;
    const o = i * 9;
    const planeAt = (x, z) => (nx * (x - T.v[o]) + ny * (ym - T.v[o + 1]) + nz * (z - T.v[o + 2])) / h;
    const s = planeAt(cx, cz);
    // Closest point of the polygon's outline to the centre, and whether the centre is inside it.
    let best = Infinity;
    let qx = 0;
    let qz = 0;
    let sign = 0;
    let inside = n >= 3;
    for (let j = 0; j < n; j++) {
      const ax = _poly[j * 2];
      const az = _poly[j * 2 + 1];
      const bx = _poly[((j + 1) % n) * 2];
      const bz = _poly[((j + 1) % n) * 2 + 1];
      const ex = bx - ax;
      const ez = bz - az;
      const len2 = ex * ex + ez * ez;
      const cross = ex * (cz - az) - ez * (cx - ax);
      if (len2 > 1e-12) {
        const sg = cross > 1e-9 ? 1 : cross < -1e-9 ? -1 : 0;
        if (sg && sign && sg !== sign) inside = false;
        if (sg) sign = sg;
      }
      const t = len2 > 1e-12 ? Math.min(1, Math.max(0, ((cx - ax) * ex + (cz - az) * ez) / len2)) : 0;
      const px = ax + ex * t;
      const pz = az + ez * t;
      const d2 = (cx - px) * (cx - px) + (cz - pz) * (cz - pz);
      if (d2 < best) { best = d2; qx = px; qz = pz; }
    }
    if (!sign) inside = false;
    // Crossed it since `from`: its plane changed sides and the way here passed through it.
    let crossed = false;
    if (from) {
      const sf = planeAt(from.x, from.z);
      if ((sf > 1e-6 && s < 0) || (sf < -1e-6 && s > 0)) {
        const t = sf / (sf - s);
        crossed = pointInPoly(n, from.x + (cx - from.x) * t, from.z + (cz - from.z) * t, 0.02);
        if (crossed) {
          // Back to the side it came from, clear by its radius.
          const side = sf > 0 ? 1 : -1;
          pos.x += ux * (side * radius - s);
          pos.z += uz * (side * radius - s);
          moved = true;
          continue;
        }
      }
    }
    const d = Math.sqrt(best);
    if (inside) {
      // Over or under a slanted face within the body: out along its normal, to the side it's on.
      const side = s >= 0 ? 1 : -1;
      let reach = -Infinity;
      for (let j = 0; j < n; j++) reach = Math.max(reach, side * ((_poly[j * 2] - cx) * ux + (_poly[j * 2 + 1] - cz) * uz));
      const shift = Math.max(0, reach) + radius;
      pos.x += ux * side * shift;
      pos.z += uz * side * shift;
      moved = true;
      continue;
    }
    if (d >= radius) continue;
    if (d > 1e-6) {
      pos.x = qx + ((cx - qx) / d) * radius;
      pos.z = qz + ((cz - qz) / d) * radius;
    } else {
      const side = s >= 0 ? 1 : -1;
      pos.x = qx + ux * side * radius;
      pos.z = qz + uz * side * radius;
    }
    moved = true;
  }
  return moved;
}

function pointInPoly(n, x, z, pad) {
  if (n < 3) {
    // A wall seen edge-on: on the segment.
    const ax = _poly[0]; const az = _poly[1];
    const bx = _poly[2]; const bz = _poly[3];
    const ex = bx - ax; const ez = bz - az;
    const len2 = ex * ex + ez * ez;
    const t = len2 > 1e-12 ? ((x - ax) * ex + (z - az) * ez) / len2 : 0;
    if (t < -pad || t > 1 + pad) return false;
    const px = ax + ex * t; const pz = az + ez * t;
    return (x - px) * (x - px) + (z - pz) * (z - pz) <= pad * pad + 1e-6;
  }
  let sign = 0;
  let flat = true;
  for (let j = 0; j < n; j++) {
    const ax = _poly[j * 2]; const az = _poly[j * 2 + 1];
    const bx = _poly[((j + 1) % n) * 2]; const bz = _poly[((j + 1) % n) * 2 + 1];
    const ex = bx - ax; const ez = bz - az;
    const len = Math.hypot(ex, ez);
    if (len < 1e-9) continue;
    const cross = (ex * (z - az) - ez * (x - ax)) / len;
    if (Math.abs(cross) > 1e-6) flat = false;
    if (cross > pad) { if (sign < 0) return false; sign = 1; }
    else if (cross < -pad) { if (sign > 0) return false; sign = -1; }
  }
  if (!flat) return true;
  // Degenerate (a vertical wall): within its extent along the line.
  let lo = Infinity; let hi = -Infinity;
  const ax = _poly[0]; const az = _poly[1];
  let ex = 0; let ez = 0;
  for (let j = 1; j < n; j++) {
    const dx = _poly[j * 2] - ax; const dz = _poly[j * 2 + 1] - az;
    if (dx * dx + dz * dz > ex * ex + ez * ez) { ex = dx; ez = dz; }
  }
  const len2 = ex * ex + ez * ez;
  if (len2 < 1e-12) return false;
  for (let j = 0; j < n; j++) {
    const t = ((_poly[j * 2] - ax) * ex + (_poly[j * 2 + 1] - az) * ez) / len2;
    lo = Math.min(lo, t); hi = Math.max(hi, t);
  }
  const t = ((x - ax) * ex + (z - az) * ez) / len2;
  return t >= lo - pad && t <= hi + pad;
}

// Is the point inside the collider's mesh — in its solid, or shut in by it? Rays out along the six
// axes: when most of the surfaces they first meet are seen from behind, it's in the solid (a
// trunk, a boulder, a wall); when every way out but down meets a surface, it's shut in (the inside
// of a closed hut). The inside of a ring or a hollow stump, open above, is neither.
const AXES = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
export function meshContainsPoint(collider, p) {
  const T = collider.tris;
  if (!T) return false;
  let back = 0;
  let front = 0;
  let shut = 0;
  for (const [dx, dy, dz] of AXES) {
    let bestT = Infinity;
    let facing = 0;
    for (let i = 0; i < T.n; i++) {
      const b = i * 6;
      // Axis rays: the triangle's box has to straddle the ray's line.
      if (dx === 0 && (p.x < T.box[b] || p.x > T.box[b + 3])) continue;
      if (dy === 0 && (p.y < T.box[b + 1] || p.y > T.box[b + 4])) continue;
      if (dz === 0 && (p.z < T.box[b + 2] || p.z > T.box[b + 5])) continue;
      const t = rayTriangle(T, i, p, dx, dy, dz);
      if (t < bestT) {
        bestT = t;
        facing = dx * T.nrm[i * 3] + dy * T.nrm[i * 3 + 1] + dz * T.nrm[i * 3 + 2];
      }
    }
    if (bestT === Infinity) continue;
    if (facing > 0) back++;
    else front++;
    if (dy >= 0) shut++;
  }
  return (back > 0 && back > front) || shut === 5;
}

function rayTriangle(T, i, p, dx, dy, dz) {
  const v = T.v;
  const o = i * 9;
  const e1x = v[o + 3] - v[o]; const e1y = v[o + 4] - v[o + 1]; const e1z = v[o + 5] - v[o + 2];
  const e2x = v[o + 6] - v[o]; const e2y = v[o + 7] - v[o + 1]; const e2z = v[o + 8] - v[o + 2];
  const px = dy * e2z - dz * e2y;
  const py = dz * e2x - dx * e2z;
  const pz = dx * e2y - dy * e2x;
  const det = e1x * px + e1y * py + e1z * pz;
  if (Math.abs(det) < 1e-12) return Infinity;
  const inv = 1 / det;
  const tx = p.x - v[o]; const ty = p.y - v[o + 1]; const tz = p.z - v[o + 2];
  const u = (tx * px + ty * py + tz * pz) * inv;
  if (u < 0 || u > 1) return Infinity;
  const qx = ty * e1z - tz * e1y;
  const qy = tz * e1x - tx * e1z;
  const qz = tx * e1y - ty * e1x;
  const w = (dx * qx + dy * qy + dz * qz) * inv;
  if (w < 0 || u + w > 1) return Infinity;
  const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
  return t > 1e-6 ? t : Infinity;
}

// Gives a place's colliders the triangles of its meshes (`group`, as built) that are theirs. The
// source is spatially indexed once so city and settlement colliders do not each scan every
// triangle. A collider's triangles can reach past its outline: World.regrid files it by them.
export function buildMeshColliderData(colliders, group) {
  if (!colliders?.length || !group) return 0;
  group.updateWorldMatrix(true, true);
  const triangles = [];
  const bins = new Map();
  const longTriangles = [];
  const addTriangle = (a, b, c) => {
    const id = triangles.length / 9;
    triangles.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    const minX = Math.min(a.x, b.x, c.x);
    const maxX = Math.max(a.x, b.x, c.x);
    const minZ = Math.min(a.z, b.z, c.z);
    const maxZ = Math.max(a.z, b.z, c.z);
    const ix0 = Math.floor(minX / CELL);
    const ix1 = Math.floor(maxX / CELL);
    const iz0 = Math.floor(minZ / CELL);
    const iz1 = Math.floor(maxZ / CELL);
    if ((ix1 - ix0 + 1) * (iz1 - iz0 + 1) > 16) {
      longTriangles.push(id);
      return;
    }
    for (let ix = ix0; ix <= ix1; ix++) for (let iz = iz0; iz <= iz1; iz++) {
      const key = cellKey(ix, iz);
      let bin = bins.get(key);
      if (!bin) bins.set(key, (bin = []));
      bin.push(id);
    }
  };

  group.traverse((mesh) => {
    if (!mesh.isMesh || mesh.isInstancedMesh || mesh.isSkinnedMesh || !mesh.visible || mesh.userData.noCollision) return;
    // Ink hulls (inverted shells drawn behind the surface) are the same shape again.
    if (mesh.material?.isShaderMaterial || mesh.material?.side === THREE.BackSide) return;
    const geometry = mesh.geometry;
    const position = geometry?.getAttribute('position');
    if (!position || position.count < 3) return;
    const index = geometry.index;
    const start = Math.max(0, geometry.drawRange.start ?? 0);
    const available = index ? index.count : position.count;
    const end = Math.min(available, Number.isFinite(geometry.drawRange.count) ? start + geometry.drawRange.count : available);
    const flip = mesh.matrixWorld.determinant() < 0;
    for (let i = start; i + 2 < end; i += 3) {
      const ia = index ? index.getX(i) : i;
      const ib = index ? index.getX(i + 1) : i + 1;
      const ic = index ? index.getX(i + 2) : i + 2;
      _a.fromBufferAttribute(position, ia).applyMatrix4(mesh.matrixWorld);
      _b.fromBufferAttribute(position, ib).applyMatrix4(mesh.matrixWorld);
      _c.fromBufferAttribute(position, ic).applyMatrix4(mesh.matrixWorld);
      if (flip) addTriangle(_a, _c, _b);
      else addTriangle(_a, _b, _c);
    }
  });

  if (!triangles.length) return 0;
  const data = triangles;
  let built = 0;
  const pa = new THREE.Vector3();
  const pb = new THREE.Vector3();
  const pc = new THREE.Vector3();
  for (const collider of colliders) {
    const x0 = collider.x - collider.r - MESH_PAD;
    const x1 = collider.x + collider.r + MESH_PAD;
    const z0 = collider.z - collider.r - MESH_PAD;
    const z1 = collider.z + collider.r + MESH_PAD;
    const ids = new Set(longTriangles);
    for (let ix = Math.floor(x0 / CELL); ix <= Math.floor(x1 / CELL); ix++) {
      for (let iz = Math.floor(z0 / CELL); iz <= Math.floor(z1 / CELL); iz++) {
        for (const id of bins.get(cellKey(ix, iz)) ?? []) ids.add(id);
      }
    }
    if (!ids.size) continue;
    // Whole triangles that reach into the collider (grown a little: what it stands for is often
    // a bit bigger than its outline), never cut — a cut wall is a hole to walk in through.
    const planes = colliderPlanes(collider, MESH_PAD, MESH_PAD_TOP);
    const positions = [];
    for (const id of ids) {
      const o = id * 9;
      pa.set(data[o], data[o + 1], data[o + 2]);
      pb.set(data[o + 3], data[o + 4], data[o + 5]);
      pc.set(data[o + 6], data[o + 7], data[o + 8]);
      if (standsUp(collider, pa, pb, pc) && meets(planes, pa, pb, pc)) positions.push(...data.slice(o, o + 9));
    }
    if (positions.length < 9) continue;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    collider.meshGeometry = geometry;
    collider.meshMatrix = identity;
    collider.ownsMeshGeometry = true;
    collider.tris = packTriangles(positions);
    built++;
  }
  return built;
}

// Takes out of each velocity the part going into `push` (the way colliders pushed a mover back,
// World.move): running into a wall stops the speed into it and keeps the speed along it.
export function stopAgainst(push, ...velocities) {
  const len = Math.hypot(push.x, push.z);
  if (len < 1e-6) return;
  const nx = push.x / len;
  const nz = push.z / len;
  for (const v of velocities) {
    const into = v.x * nx + v.z * nz;
    if (into < 0) {
      v.x -= nx * into;
      v.z -= nz * into;
    }
  }
}

// Return the nearest actual triangle hit for a world collider with mesh data. `undefined` means
// it has no mesh data; `null` means the mesh was tested and missed its collider bounds.
export function rayHitColliderMesh(collider, origin, direction, far = Infinity) {
  if (!collider.meshGeometry) return undefined;
  raycaster.set(origin, direction);
  raycaster.near = 0;
  raycaster.far = far;
  hits.length = 0;
  scratchMesh.geometry = collider.meshGeometry;
  scratchMesh.matrixAutoUpdate = false;
  scratchMesh.matrix.copy(collider.meshMatrix ?? identity);
  scratchMesh.matrixWorld.copy(collider.meshMatrix ?? identity);
  scratchMesh.raycast(raycaster, hits);
  if (!hits.length) return null;
  hits.sort((a, b) => a.distance - b.distance);
  const hit = hits.find((candidate) => colliderContainsPoint(collider, candidate.point, 0.025));
  if (!hit) return null;
  return { distance: hit.distance, point: hit.point.clone(), object: hit.object };
}
