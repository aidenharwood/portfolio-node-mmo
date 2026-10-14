import * as THREE from 'three';

const CELL = 8;
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
  const dx = point.x - collider.x;
  const dz = point.z - collider.z;
  if (collider.box) {
    const angle = collider.ry ?? 0;
    const lx = Math.cos(angle) * dx - Math.sin(angle) * dz;
    const lz = Math.sin(angle) * dx + Math.cos(angle) * dz;
    return Math.abs(lx) <= collider.hx + pad && Math.abs(lz) <= collider.hz + pad;
  }
  const r = collider.r + pad;
  return dx * dx + dz * dz <= r * r;
}

function colliderPlanes(collider) {
  const y0 = collider.y;
  const y1 = collider.y + collider.h;
  const angle = collider.ry ?? 0;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const planes = [
    (p) => p[1] - y0,
    (p) => y1 - p[1],
  ];
  if (collider.box) {
    planes.push(
      (p) => collider.hx - (cos * (p[0] - collider.x) - sin * (p[2] - collider.z)),
      (p) => collider.hx + (cos * (p[0] - collider.x) - sin * (p[2] - collider.z)),
      (p) => collider.hz - (sin * (p[0] - collider.x) + cos * (p[2] - collider.z)),
      (p) => collider.hz + (sin * (p[0] - collider.x) + cos * (p[2] - collider.z)),
    );
  } else {
    for (let i = 0; i < 20; i++) {
      const angle = (i / 20) * Math.PI * 2;
      const nx = Math.cos(angle);
      const nz = Math.sin(angle);
      planes.push((p) => collider.r - nx * (p[0] - collider.x) - nz * (p[2] - collider.z));
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

function convexHull(points) {
  const unique = new Map();
  for (const p of points) unique.set(`${Math.round(p.x * 1000)},${Math.round(p.z * 1000)}`, { x: p.x, z: p.z });
  const sorted = [...unique.values()].sort((a, b) => a.x - b.x || a.z - b.z);
  if (sorted.length < 3) return null;
  const cross = (o, a, b) => (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);
  const lower = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), p) <= 1e-8) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), p) <= 1e-8) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  const hull = lower.concat(upper);
  return hull.length >= 3 ? hull : null;
}

export function meshHullFromGeometry(collider, geometry, matrix = identity) {
  const position = geometry?.getAttribute('position');
  if (!position) return null;
  const points = [];
  for (let i = 0; i < position.count; i++) {
    _a.fromBufferAttribute(position, i).applyMatrix4(matrix);
    if (_a.y > collider.y + 0.035 && colliderContainsPoint(collider, _a, 0.025)) points.push({ x: _a.x, z: _a.z });
  }
  return convexHull(points);
}

export function meshSupportTrianglesFromGeometry(geometry, matrix = identity) {
  const position = geometry?.getAttribute('position');
  if (!position) return [];
  const index = geometry.index;
  const available = index ? index.count : position.count;
  const start = Math.max(0, geometry.drawRange.start ?? 0);
  const end = Math.min(available, Number.isFinite(geometry.drawRange.count) ? start + geometry.drawRange.count : available);
  const triangles = [];
  for (let i = start; i + 2 < end; i += 3) {
    const ia = index ? index.getX(i) : i;
    const ib = index ? index.getX(i + 1) : i + 1;
    const ic = index ? index.getX(i + 2) : i + 2;
    _a.fromBufferAttribute(position, ia).applyMatrix4(matrix);
    _b.fromBufferAttribute(position, ib).applyMatrix4(matrix);
    _c.fromBufferAttribute(position, ic).applyMatrix4(matrix);
    const area = (_b.x - _a.x) * (_c.z - _a.z) - (_b.z - _a.z) * (_c.x - _a.x);
    if (Math.abs(area) < 1e-8) continue;
    triangles.push([
      _a.x, _a.y, _a.z,
      _b.x, _b.y, _b.z,
      _c.x, _c.y, _c.z,
    ]);
  }
  return triangles;
}

export function meshHeightAt(collider, x, z, maxY = Infinity) {
  if (!collider.meshSupportTriangles?.length) return null;
  if (!colliderContainsPoint(collider, { x, y: collider.y + collider.h / 2, z }, 0.025)) return null;
  let best = -Infinity;
  for (const t of collider.meshSupportTriangles) {
    const ax = t[0]; const az = t[2];
    const bx = t[3]; const bz = t[5];
    const cx = t[6]; const cz = t[8];
    const denominator = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    if (Math.abs(denominator) < 1e-8) continue;
    const wa = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / denominator;
    const wb = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / denominator;
    const wc = 1 - wa - wb;
    if (wa < -1e-5 || wb < -1e-5 || wc < -1e-5) continue;
    const y = wa * t[1] + wb * t[4] + wc * t[7];
    if (y >= collider.y - 0.025 && y <= Math.min(maxY, collider.y + collider.h + 0.025) && y > best) best = y;
  }
  return Number.isFinite(best) ? best : null;
}

// Convert nearby static world meshes into small, collider-local triangle meshes. The source is
// spatially indexed once so city and settlement colliders do not each scan every triangle.
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
    const geometry = mesh.geometry;
    const position = geometry?.getAttribute('position');
    if (!position || position.count < 3) return;
    const index = geometry.index;
    const start = Math.max(0, geometry.drawRange.start ?? 0);
    const available = index ? index.count : position.count;
    const end = Math.min(available, Number.isFinite(geometry.drawRange.count) ? start + geometry.drawRange.count : available);
    for (let i = start; i + 2 < end; i += 3) {
      const ia = index ? index.getX(i) : i;
      const ib = index ? index.getX(i + 1) : i + 1;
      const ic = index ? index.getX(i + 2) : i + 2;
      _a.fromBufferAttribute(position, ia).applyMatrix4(mesh.matrixWorld);
      _b.fromBufferAttribute(position, ib).applyMatrix4(mesh.matrixWorld);
      _c.fromBufferAttribute(position, ic).applyMatrix4(mesh.matrixWorld);
      addTriangle(_a, _b, _c);
    }
  });

  if (!triangles.length) return 0;
  const data = new Float32Array(triangles);
  let built = 0;
  for (const collider of colliders) {
    const x0 = collider.x - collider.r;
    const x1 = collider.x + collider.r;
    const z0 = collider.z - collider.r;
    const z1 = collider.z + collider.r;
    const ids = new Set(longTriangles);
    for (let ix = Math.floor(x0 / CELL); ix <= Math.floor(x1 / CELL); ix++) {
      for (let iz = Math.floor(z0 / CELL); iz <= Math.floor(z1 / CELL); iz++) {
        for (const id of bins.get(cellKey(ix, iz)) ?? []) ids.add(id);
      }
    }
    if (!ids.size) continue;
    const planes = colliderPlanes(collider);
    const positions = [];
    const hullPoints = [];
    for (const id of ids) {
      const offset = id * 9;
      const maxY = Math.max(data[offset + 1], data[offset + 4], data[offset + 7]);
      if (maxY <= collider.y + 0.035) continue;
      const poly = [
        [data[offset], data[offset + 1], data[offset + 2]],
        [data[offset + 3], data[offset + 4], data[offset + 5]],
        [data[offset + 6], data[offset + 7], data[offset + 8]],
      ];
      for (const plane of planes) {
        if (!poly.length) break;
        const clipped = clipPolygon(poly, plane);
        poly.length = 0;
        poly.push(...clipped);
      }
      if (poly.length < 3) continue;
      for (let i = 1; i + 1 < poly.length; i++) {
        positions.push(...poly[0], ...poly[i], ...poly[i + 1]);
      }
      for (const p of poly) {
        const v = { x: p[0], y: p[1], z: p[2] };
        if (v.y > collider.y + 0.035 && colliderContainsPoint(collider, v, 0.025)) hullPoints.push(v);
      }
    }
    if (positions.length < 9) continue;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    collider.meshGeometry = geometry;
    collider.meshMatrix = identity;
    collider.ownsMeshGeometry = true;
    collider.meshHull = convexHull(hullPoints);
    collider.meshSupportTriangles = meshSupportTrianglesFromGeometry(geometry);
    built++;
  }
  return built;
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

export function pointInMeshHull(point, hull) {
  if (!hull || hull.length < 3) return false;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i];
    const b = hull[(i + 1) % hull.length];
    if ((b.x - a.x) * (point.z - a.z) - (b.z - a.z) * (point.x - a.x) < -1e-7) return false;
  }
  return true;
}

export function pushOutOfMeshHull(pos, radius, hull) {
  if (!hull || hull.length < 3) return false;
  let inside = true;
  let bestD2 = Infinity;
  let bestX = 0;
  let bestZ = 0;
  let bestNx = 0;
  let bestNz = 0;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i];
    const b = hull[(i + 1) % hull.length];
    const ex = b.x - a.x;
    const ez = b.z - a.z;
    const len2 = ex * ex + ez * ez;
    if (len2 < 1e-10) continue;
    const cross = ex * (pos.z - a.z) - ez * (pos.x - a.x);
    if (cross < -1e-7) inside = false;
    const t = THREE.MathUtils.clamp(((pos.x - a.x) * ex + (pos.z - a.z) * ez) / len2, 0, 1);
    const qx = a.x + ex * t;
    const qz = a.z + ez * t;
    const dx = pos.x - qx;
    const dz = pos.z - qz;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestD2) {
      bestD2 = d2;
      bestX = qx;
      bestZ = qz;
      const len = Math.sqrt(len2);
      bestNx = ez / len;
      bestNz = -ex / len;
    }
  }
  if (!inside && bestD2 >= radius * radius) return false;
  if (inside) {
    pos.x = bestX + bestNx * radius;
    pos.z = bestZ + bestNz * radius;
  } else {
    let dx = pos.x - bestX;
    let dz = pos.z - bestZ;
    const d = Math.sqrt(bestD2);
    if (d > 1e-4) { dx /= d; dz /= d; }
    else { dx = bestNx; dz = bestNz; }
    pos.x = bestX + dx * radius;
    pos.z = bestZ + dz * radius;
  }
  return true;
}
