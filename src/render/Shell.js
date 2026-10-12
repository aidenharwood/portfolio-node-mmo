// Lofted body shells: torsos, pelvises and the armour plates that hug them. Each profile row is a
// superellipse cross-section at height y with half-width w, front depth zf, back depth zb and
// squareness n (2 = ellipse, higher = boxier), plus optional pectoral (`pec`) and shoulder-blade
// (`blade`) lobes. Rows are interpolated with Catmull-Rom, so a handful of rows gives a smooth,
// tapered, anatomical shape instead of a cylinder.
// Angles θ run around Y from the front (+Z, θ = 0) toward the character's left (+X, θ = π/2).
import * as THREE from 'three';

const TAU = Math.PI * 2;
const KEYS = ['y', 'w', 'zf', 'zb', 'n', 'pec', 'blade'];
const DEFAULTS = { n: 2.4, pec: 0, blade: 0 };

const cr = (p0, p1, p2, p3, t) => {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
};

function rowsOf(profile, sub) {
  const P = profile.map((r) => ({ ...DEFAULTS, ...r }));
  const out = [];
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[Math.max(0, i - 1)];
    const p1 = P[i];
    const p2 = P[i + 1];
    const p3 = P[Math.min(P.length - 1, i + 2)];
    for (let k = 0; k < sub; k++) {
      const t = k / sub;
      const r = {};
      for (const key of KEYS) r[key] = cr(p0[key], p1[key], p2[key], p3[key], t);
      out.push(r);
    }
  }
  out.push(P[P.length - 1]);
  return out;
}

// Cross-section point at angle θ (unit-free row r); returns [x, z].
export function sectionXZ(r, theta, inflate = 0) {
  const s = Math.sin(theta);
  const c = Math.cos(theta);
  const e = 2 / r.n;
  let x = r.w * Math.sign(s) * Math.pow(Math.abs(s), e);
  let z = (c >= 0 ? r.zf : r.zb) * Math.sign(c) * Math.pow(Math.abs(c), e);
  const a = Math.abs(Math.atan2(s, c));
  if (r.pec && a < Math.PI / 2) z += r.pec * Math.exp(-(((a - 0.55) / 0.32) ** 2)) * c;
  if (r.blade && a > Math.PI / 2) z += r.blade * Math.exp(-(((Math.PI - a - 0.6) / 0.35) ** 2)) * c;
  if (inflate) {
    const len = Math.hypot(x, z) || 1;
    x += (x / len) * inflate;
    z += (z / len) * inflate;
  }
  return [x, z];
}

/**
 * Shell geometry. opts: seg (around), sub (rows between profile rows), thetaStart/thetaLength
 * (open garments: a gap at the front is thetaStart = g, thetaLength = 2π - 2g), inflate (metres
 * pushed outward — armour over a body), caps (close full shells top/bottom).
 */
export function shellGeometry(profile, { seg = 32, sub = 4, thetaStart = 0, thetaLength = TAU, inflate = 0, caps = true } = {}) {
  const rows = rowsOf(profile, sub);
  const full = thetaLength >= TAU - 1e-6;
  const cols = full ? seg : seg + 1;
  const pos = [];
  const idx = [];
  for (const r of rows) {
    for (let j = 0; j < cols; j++) {
      const [x, z] = sectionXZ(r, thetaStart + (thetaLength * j) / seg, inflate);
      pos.push(x, r.y, z);
    }
  }
  for (let i = 0; i < rows.length - 1; i++) {
    for (let j = 0; j < seg; j++) {
      const a = i * cols + j;
      const b = i * cols + (full ? (j + 1) % cols : j + 1);
      const c = a + cols;
      const d = b + cols;
      idx.push(a, b, d, a, d, c);
    }
  }
  if (full && caps) {
    for (const [ri, down] of [[0, true], [rows.length - 1, false]]) {
      const base = pos.length / 3;
      const r = rows[ri];
      pos.push(0, r.y, 0);
      for (let j = 0; j < cols; j++) {
        const [x, z] = sectionXZ(r, thetaStart + (thetaLength * j) / seg, inflate);
        pos.push(x, r.y, z);
      }
      for (let j = 0; j < seg; j++) {
        const a = base + 1 + j;
        const b = base + 1 + ((j + 1) % cols);
        if (down) idx.push(base, b, a); else idx.push(base, a, b);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Where to put a detail on a shell: position on the surface at height y and angle θ (pushed out by
// `out`) and the yaw that faces the detail outward. Returns { pos: [x, y, z], yaw }.
export function onShell(profile, y, theta, out = 0.01) {
  const rows = rowsOf(profile, 8);
  let r = rows[0];
  if (y >= rows[rows.length - 1].y) r = rows[rows.length - 1];
  else if (y > rows[0].y) {
    for (let i = 0; i < rows.length - 1; i++) {
      const a = rows[i];
      const b = rows[i + 1];
      if (y >= a.y && y <= b.y) {
        const t = (y - a.y) / (b.y - a.y || 1);
        r = {};
        for (const key of KEYS) r[key] = a[key] + (b[key] - a[key]) * t;
        break;
      }
    }
  }
  const [x0, z0] = sectionXZ(r, theta - 0.01);
  const [x1, z1] = sectionXZ(r, theta + 0.01);
  const [x, z] = sectionXZ(r, theta, out);
  // Outward normal of the section curve: the tangent (dx, dz) turned a quarter → (-dz, dx).
  return { pos: [x, y, z], yaw: Math.atan2(-(z1 - z0), x1 - x0) };
}

// A horizontal band of a profile between y0 and y1 (belts, hems, armour segments).
export function sliceProfile(profile, y0, y1, steps = 3) {
  const rows = rowsOf(profile, 8);
  const at = (y) => {
    if (y <= rows[0].y) return { ...rows[0], y };
    for (let i = 0; i < rows.length - 1; i++) {
      const a = rows[i];
      const b = rows[i + 1];
      if (y >= a.y && y <= b.y) {
        const t = (y - a.y) / (b.y - a.y || 1);
        const r = {};
        for (const key of KEYS) r[key] = a[key] + (b[key] - a[key]) * t;
        return r;
      }
    }
    return { ...rows[rows.length - 1], y };
  };
  return Array.from({ length: steps }, (_, i) => at(y0 + ((y1 - y0) * i) / (steps - 1)));
}

// Scales a profile (armour sized up from a body profile, display models, etc.).
export const scaleProfile = (profile, k = 1, dy = 0) => profile.map((r) => ({ ...r, y: r.y + dy, w: r.w * k, zf: r.zf * k, zb: r.zb * k }));
