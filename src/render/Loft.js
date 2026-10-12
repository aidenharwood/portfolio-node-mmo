// Skinned lofts: the smooth, anatomical surfaces characters are made of. A loft is a stack of
// cross-sections ("rows") up model-space Y in the bind pose, interpolated with Catmull-Rom, so a
// dozen rows give a smooth limb or torso. Each row is a superellipse round its own centre (x, z)
// with separate half-widths outward and inward (a calf bulges more on the inside), separate front
// and back depths, and the torso's pectoral / shoulder-blade lobes (same maths as render/Shell.js,
// so armour lofted from a Shell profile sits exactly on a loft of the same rows). `bumps` add
// Gaussian swellings (muscle bellies, kneecaps). Every vertex is skinned by a weight function of
// its height, so one continuous surface bends smoothly across the joints.
//
// Row keys: y; x, z (centre, default 0); w, or wo/wi (half-width outward/inward: toward +X on the
// left side, side = 1); zf, zb (front/back depth); n (squareness, 2 = ellipse); pec, blade.
// Angles θ run round Y from the front (+Z, θ = 0) toward +X.
import * as THREE from 'three';

const TAU = Math.PI * 2;
const KEYS = ['y', 'x', 'z', 'wp', 'wn', 'zf', 'zb', 'n', 'pec', 'blade'];

const cr = (p0, p1, p2, p3, t) => {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
};
export const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// A row with its side resolved: wp / wn are the half-widths toward +X / -X.
function norm(r, side) {
  const wo = r.wo ?? r.w;
  const wi = r.wi ?? r.w;
  return {
    y: r.y, x: (r.x ?? 0) * side, z: r.z ?? 0, wp: side > 0 ? wo : wi, wn: side > 0 ? wi : wo,
    zf: r.zf, zb: r.zb, n: r.n ?? 2.4, pec: r.pec ?? 0, blade: r.blade ?? 0,
  };
}

function dense(rows, sub, side) {
  const P = rows.map((r) => norm(r, side));
  const out = [];
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[Math.max(0, i - 1)];
    const p1 = P[i];
    const p2 = P[i + 1];
    const p3 = P[Math.min(P.length - 1, i + 2)];
    for (let k = 0; k < sub; k++) {
      const r = {};
      for (const key of KEYS) r[key] = cr(p0[key], p1[key], p2[key], p3[key], k / sub);
      out.push(r);
    }
  }
  out.push(P[P.length - 1]);
  return out;
}

const lerpRow = (a, b, t) => {
  const r = {};
  for (const k of KEYS) r[k] = a[k] + (b[k] - a[k]) * t;
  return r;
};

// The rows between heights y0 and y1, with exact rows on the cuts.
function clip(rows, y0, y1) {
  const out = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const p = rows[i - 1];
    if (p) for (const yc of [y0, y1]) if (p.y < yc && r.y > yc) out.push(lerpRow(p, r, (yc - p.y) / (r.y - p.y)));
    if (r.y >= y0 && r.y <= y1 && !(out.length && r.y - out[out.length - 1].y < 1e-4)) out.push(r);
  }
  return out;
}

const angle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// Section point of row r at angle θ, pushed out along the section's radius by `push`.
function point(r, th, push, out) {
  const s = Math.sin(th);
  const c = Math.cos(th);
  const e = 2 / r.n;
  let x = (s >= 0 ? r.wp : r.wn) * Math.sign(s) * Math.pow(Math.abs(s), e);
  let z = (c >= 0 ? r.zf : r.zb) * Math.sign(c) * Math.pow(Math.abs(c), e);
  const a = Math.abs(Math.atan2(s, c));
  if (r.pec && a < Math.PI / 2) z += r.pec * Math.exp(-(((a - 0.55) / 0.32) ** 2)) * c;
  if (r.blade && a > Math.PI / 2) z += r.blade * Math.exp(-(((Math.PI - a - 0.6) / 0.35) ** 2)) * c;
  if (push) {
    const len = Math.hypot(x, z) || 1;
    x += (x / len) * push;
    z += (z / len) * push;
  }
  out[0] = r.x + x;
  out[1] = r.z + z;
}

/**
 * Loft geometry (indexed, smooth normals). Options:
 *   seg, sub       segments round / rows between given rows
 *   side           1 = as given (left), -1 = mirrored to the right (x, widths, bumps, arcs)
 *   y0, y1         keep only this band (clothing: a sleeve, a cuff, a boot shaft)
 *   thetaStart, thetaLength   an open arc (a jacket open at the front)
 *   inflate        metres pushed outward (number, or a function of y) — clothes over skin
 *   bumps          [{ y, t, h, sy, st }]: Gaussian swellings h high at height y, angle t
 *   caps           [bottom, top] close the ends (full rings only), domed by `dome` × the radius
 *   weights        (y) → [[boneIndex, weight], …]: adds skinIndex / skinWeight
 */
export function loftGeometry(rows, o = {}) {
  const {
    seg = 24, sub = 3, side = 1, y0 = -Infinity, y1 = Infinity, thetaStart = 0, thetaLength = TAU,
    inflate = 0, bumps = [], caps = [false, false], dome = 0.4, weights = null,
  } = o;
  const R = clip(dense(rows, sub, side), y0, y1);
  const full = thetaLength >= TAU - 1e-6;
  const cols = full ? seg : seg + 1;
  const t0 = side < 0 && !full ? -(thetaStart + thetaLength) : thetaStart;
  const infl = typeof inflate === 'function' ? inflate : () => inflate;
  const pos = [];
  const idx = [];
  const xz = [0, 0];
  for (const r of R) {
    const base = infl(r.y);
    for (let j = 0; j < cols; j++) {
      const th = t0 + (thetaLength * j) / seg;
      let push = base;
      for (const b of bumps) {
        const dt = angle(th - b.t * side);
        push += b.h * Math.exp(-(((r.y - b.y) / (b.sy ?? 0.04)) ** 2) - (dt / (b.st ?? 0.6)) ** 2);
      }
      point(r, th, push, xz);
      pos.push(xz[0], r.y, xz[1]);
    }
  }
  for (let i = 0; i < R.length - 1; i++) {
    for (let j = 0; j < seg; j++) {
      const a = i * cols + j;
      const b = i * cols + (full ? (j + 1) % cols : j + 1);
      idx.push(a, b, b + cols, a, b + cols, a + cols);
    }
  }
  if (full) {
    for (const [ri, down] of [[0, true], [R.length - 1, false]]) {
      if (!caps[down ? 0 : 1]) continue;
      const r = R[ri];
      const ringStart = ri * cols;
      const reach = Math.min(r.wp + r.wn, r.zf + r.zb) / 2;
      const c = pos.length / 3;
      pos.push(r.x, r.y + (down ? -1 : 1) * reach * dome, r.z);
      for (let j = 0; j < seg; j++) {
        const a = ringStart + j;
        const b = ringStart + ((j + 1) % cols);
        if (down) idx.push(c, b, a); else idx.push(c, a, b);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  if (weights) {
    const n = pos.length / 3;
    const si = new Uint16Array(n * 4);
    const sw = new Float32Array(n * 4);
    for (let v = 0; v < n; v++) {
      const ws = weights(pos[v * 3 + 1]);
      let sum = 0;
      for (const [, w] of ws) sum += w;
      ws.slice(0, 4).forEach(([b, w], k) => { si[v * 4 + k] = b; sw[v * 4 + k] = w / (sum || 1); });
    }
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  }
  g.computeVertexNormals();
  return g;
}

// Weights down a vertical chain in the bind pose: bones listed bottom to top, the joint between
// bone k and k + 1 at height ys[k], blended over ±rs[k] (blends must not overlap).
export function chainWeights(ys, rs) {
  return (y) => {
    const out = [];
    let prev = 1;
    for (let k = 0; k <= ys.length; k++) {
      const t = k < ys.length ? smoothstep(ys[k] - rs[k], ys[k] + rs[k], y) : 0;
      if (prev - t > 1e-4) out.push([k, prev - t]);
      prev = t;
    }
    return out;
  };
}
