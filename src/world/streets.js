// Street plans: how a settlement's ground (its plot, world/plots.js) is cut into streets and the
// lots along them — a main street along the plot's length and a cross street, meeting at a plaza;
// back streets parallel to them where the ground has room for houses on both sides; building lots
// in rows down both sides of every street, each facing it; and a row round the edge, backing onto
// the wall and facing in. Worked out from the place alone (its plot, its seed), so the generator
// (which stands the folk and services on it, world/places.js) and every builder (world/Towns.js)
// agree, on the server too.
//   streetPlan(opts) → { axis, streets, lots, plazaLots, plaza, toUV, fromUV, front(lot, out), along(street, t, side) }
//     streets  [{ dir: 'u' | 'v', o, u0, u1, v0, v1, w, main }]  in the plan's own frame (u along the
//              main street, v across it)
//     lots     [{ x, z, ry, wd, dp, kind: 'plaza' | 'street' | 'edge' }]  local metres (world axes);
//              ry the bearing its front (+z of a building stood there) faces; wd along its front
//     plaza    { hu, hv }  its half-extents round the middle
import { mulberry32 } from '../core/rng.js';

// Do two turned rectangles ({ x, z, ry, hw: half along its front, hd: half deep }) overlap?
function overlap(a, b) {
  for (const t of [a.ry, a.ry + Math.PI / 2, b.ry, b.ry + Math.PI / 2]) {
    const ax = Math.cos(t);
    const az = -Math.sin(t);
    const proj = (r) => {
      const c = r.x * ax + r.z * az;
      // (Its own axes: across its front (cos ry, -sin ry), and its depth (sin ry, cos ry).)
      const e = Math.abs(Math.cos(r.ry) * ax - Math.sin(r.ry) * az) * r.hw + Math.abs(Math.sin(r.ry) * ax + Math.cos(r.ry) * az) * r.hd;
      return [c - e, c + e];
    };
    const [a0, a1] = proj(a);
    const [b0, b1] = proj(b);
    if (a1 <= b0 || b1 <= a0) return false;
  }
  return true;
}
const cornersOf = (r) => {
  const c = Math.cos(r.ry);
  const s = Math.sin(r.ry);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, k]) => [r.x + c * i * r.hw + s * k * r.hd, r.z - s * i * r.hw + c * k * r.hd]);
};

// The outlines of a plan's streets and plaza (local metres), one by one to `add` (for paving).
export function streetPads(plan, add) {
  const quad = (u0, u1, v0, v1) => [[u0, v0], [u1, v0], [u1, v1], [u0, v1]].map(([u, v]) => plan.fromUV(u, v));
  for (const s of plan.streets) add(quad(s.u0, s.u1, s.v0, s.v1));
  add(quad(-plan.plaza.hu, plan.plaza.hu, -plan.plaza.hv, plan.plaza.hv));
}

// streets: false — no streets or plaza, only the row round the edge (a city's terraces); cross:
// false — no cross street (a small square on a through street).
export function streetPlan({ plot, axis = plot.rot, seed = 1, plaza = 8, street = 5, back = 4, lot = [7.2, 6.8], service = [10.5, 8.5], margin = 1.5, edge = true, room = null, streets: withStreets = true, cross = true, plazaRow = true }) {
  const rng = mulberry32((seed ^ 0x57ee7) >>> 0);
  const su = Math.sin(axis);
  const cu = Math.cos(axis);
  // u = (sin a, cos a) along the main street; v = (cos a, -sin a) across it.
  const toUV = (x, z) => [x * su + z * cu, x * cu - z * su];
  const fromUV = (u, v) => [u * su + v * cu, u * cu - v * su];
  const R = plot.R;
  const inside = (u, v, m) => plot.inside(...fromUV(u, v), m);
  const P = { hu: plaza, hv: plaza };
  // A rectangle in the plan's frame as a turned one: its front faces along u.
  const rectUV = (u0, u1, v0, v1) => {
    const [x, z] = fromUV((u0 + u1) / 2, (v0 + v1) / 2);
    return { x, z, ry: axis, hw: (v1 - v0) / 2, hd: (u1 - u0) / 2 };
  };
  const streets = [];
  const run = (dir, o, w, main) => {
    const at = (t) => (dir === 'u' ? [t, o] : [o, t]);
    let lo = null;
    let hi = null;
    for (let t = 0; t <= R; t += 0.5) { if (!inside(...at(t), w / 2 + margin)) break; hi = t; }
    for (let t = 0; t >= -R; t -= 0.5) { if (!inside(...at(t), w / 2 + margin)) break; lo = t; }
    if (lo === null || hi === null || hi - lo < 12) return null;
    const s = dir === 'u' ? { dir, o, w, main, u0: lo, u1: hi, v0: o - w / 2, v1: o + w / 2 } : { dir, o, w, main, u0: o - w / 2, u1: o + w / 2, v0: lo, v1: hi };
    s.rect = rectUV(s.u0, s.u1, s.v0, s.v1);
    streets.push(s);
    return s;
  };
  if (withStreets) {
    run('u', 0, street, true);
    if (cross) run('v', 0, street, true);
  }
  // Back streets, a block apart, only where there's ground for a row of houses beyond them too.
  const first = Math.max(street / 2 + 0.6 + lot[1] + 1.2 + lot[1] + 0.6 + back / 2, plaza + service[1] + 1.2 + back / 2);
  for (const dir of !withStreets ? [] : cross ? ['u', 'v'] : ['u']) {
    for (const sgn of [1, -1]) {
      for (let k = 0; k < 4; k++) {
        const o = sgn * (first + k * (back + 2 * lot[1] + 2.4));
        const beyond = o + sgn * (back / 2 + 0.6 + lot[1] + 2.5);
        if (!inside(...(dir === 'u' ? [0, beyond] : [beyond, 0]), margin)) break;
        if (!run(dir, o, back, false)) break;
      }
    }
  }
  const solids = [...streets.map((s) => s.rect), ...(withStreets ? [rectUV(-P.hu, P.hu, -P.hv, P.hv)] : [])];
  const lots = [];
  const fits = (r) => {
    if (solids.some((s) => overlap(r, s))) return false;
    if (lots.some((l) => overlap(r, l))) return false;
    if (!cornersOf(r).every(([x, z]) => plot.inside(x, z, margin))) return false;
    if (room && !room(r.x, r.z, Math.hypot(r.hw, r.hd))) return false;
    return true;
  };
  // A lot centred (x, z), its front facing bearing ry, wd along its front and dp deep.
  const add = (x, z, ry, wd, dp, kind) => {
    const r = { x, z, ry, wd, dp, hw: wd / 2, hd: dp / 2, kind };
    if (!fits(r)) return null;
    lots.push(r);
    return r;
  };
  const bearing = (fu, fv) => { const [x, z] = fromUV(fu, fv); return Math.atan2(x, z); };

  // Lots fronting the plaza first (where a place's services go): two to a side, either side of
  // the street that leaves it there.
  const plazaLots = [];
  for (const [fu, fv] of !withStreets || !plazaRow ? [] : cross ? [[0, -1], [0, 1], [-1, 0], [1, 0]] : [[0, -1], [0, 1]]) {
    for (const s of [-1, 1]) {
      const [wd, dp] = service;
      const along = street / 2 + 0.8 + wd / 2;
      const out = plaza + 0.6 + dp / 2;
      const [u, v] = Math.abs(fu) > 0.5 ? [-fu * out, s * along] : [s * along, -fv * out];
      const l = add(...fromUV(u, v), bearing(fu, fv), wd, dp, 'plaza');
      if (l) plazaLots.push(l);
    }
  }
  // Down both sides of a street, facing it.
  const rowAlong = (s) => {
    for (const side of [1, -1]) {
      const len = s.dir === 'u' ? s.u1 - s.u0 : s.v1 - s.v0;
      let t = 0.5 + rng() * 1.5;
      while (t < len - 2) {
        const wd = lot[0] * (0.85 + rng() * 0.3);
        const dp = lot[1] * (0.85 + rng() * 0.25);
        const off = s.w / 2 + 0.6 + dp / 2;
        const c = (s.dir === 'u' ? s.u0 : s.v0) + t + wd / 2;
        const [u, v] = s.dir === 'u' ? [c, s.o + side * off] : [s.o + side * off, c];
        const [fu, fv] = s.dir === 'u' ? [0, -side] : [-side, 0];
        const l = add(...fromUV(u, v), bearing(fu, fv), wd, dp, 'street');
        t += l ? wd + 0.5 + rng() * 0.8 : 1.2;
      }
    }
  };
  for (const s of streets.filter((q) => q.main)) rowAlong(s);
  // A row round the edge, backing onto it and facing in.
  if (edge) {
    for (const e of plot.edges) {
      if (e.len < lot[0] + 2) continue;
      let t = 1 + rng() * 1.5;
      while (t < e.len - 1) {
        const wd = lot[0] * (0.85 + rng() * 0.3);
        const dp = lot[1] * (0.85 + rng() * 0.25);
        const k = (t + wd / 2) / e.len;
        const ex = e.ax + e.dx * k - e.nx * (dp / 2 + margin + 0.4);
        const ez = e.az + e.dz * k - e.nz * (dp / 2 + margin + 0.4);
        const l = add(ex, ez, Math.atan2(-e.nx, -e.nz), wd, dp, 'edge');
        t += l ? wd + 0.5 + rng() * 0.8 : 1.2;
      }
    }
  }
  for (const s of streets.filter((q) => !q.main)) rowAlong(s);
  return {
    axis, streets, lots, plaza: P, plazaLots, toUV, fromUV,
    // The point `out` metres in front of a lot's front (a doorstep, where its keeper stands).
    front: (l, out = 1) => [l.x + Math.sin(l.ry) * (l.dp / 2 + out), l.z + Math.cos(l.ry) * (l.dp / 2 + out)],
    // A point t (0–1) of the way along a street's middle, `side` metres off it.
    along(s, t, side = 0) {
      return s.dir === 'u' ? fromUV(s.u0 + (s.u1 - s.u0) * t, s.o + side) : fromUV(s.o + side, s.v0 + (s.v1 - s.v0) * t);
    },
  };
}
