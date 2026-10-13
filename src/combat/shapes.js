// Telegraphed areas (gameplay phase 7): the shapes a scripted boss's mechanics mark on the floor
// before they land, and the floor hazards they leave. Pure geometry shared by the sim (which
// counts who stands in a soak) and every screen (which draws the warning and decides whether its
// own player was caught: the sim never damages players).
//   circle  { p, r }                    a disc
//   ring    { p, r, r0 }                a band between r0 and r (stand inside r0 or outside r)
//   cone    { p, r, a, arc }            a wedge from p facing `a` (radians, as enemies face), `arc` degrees wide
//   line    { p, r, a, w }              a strip from p, `r` long towards `a`, `w` wide
//   cross   { p, r, a, w }              two lines through p, at `a` and `a` + 90°, each reaching r both ways
// `p` is [x, y, z]; distances are in metres. A body of radius `br` counts as inside when any of
// it is.
export const SHAPES = ['circle', 'ring', 'cone', 'line', 'cross'];

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// Is the point (x, z), with a body of radius `br`, inside shape `s`?
export function inShape(s, x, z, br = 0) {
  const dx = x - s.p[0];
  const dz = z - s.p[2];
  const d = Math.hypot(dx, dz);
  switch (s.sh) {
    case 'circle': return d <= s.r + br;
    case 'ring': return d <= s.r + br && d >= (s.r0 ?? 0) - br;
    case 'cone': {
      if (d > s.r + br) return false;
      if (d <= br) return true;
      const off = Math.abs(wrap(Math.atan2(dx, dz) - s.a));
      return off <= (s.arc * Math.PI) / 360 + Math.atan2(br, d);
    }
    case 'line': return alongStrip(dx, dz, s.a, s.r, s.w / 2 + br, false);
    case 'cross': return alongStrip(dx, dz, s.a, s.r, s.w / 2 + br, true) || alongStrip(dx, dz, s.a + Math.PI / 2, s.r, s.w / 2 + br, true);
    default: return false;
  }
}

// Within `half` of the axis from the origin at angle `a`, out to `len` (both ways when `both`).
function alongStrip(dx, dz, a, len, half, both) {
  const fx = Math.sin(a);
  const fz = Math.cos(a);
  const u = dx * fx + dz * fz;
  const v = Math.abs(dx * fz - dz * fx);
  if (v > half) return false;
  return both ? Math.abs(u) <= len : u >= -half && u <= len;
}

// A shape as it goes over the network (rounded, only its own fields).
export function packShape(s) {
  const r2 = (v) => Math.round(v * 100) / 100;
  const out = { sh: s.sh, p: s.p.map(r2), r: r2(s.r) };
  if (s.r0 !== undefined) out.r0 = r2(s.r0);
  if (s.a !== undefined) out.a = r2(s.a);
  if (s.arc !== undefined) out.arc = Math.round(s.arc);
  if (s.w !== undefined) out.w = r2(s.w);
  return out;
}

// Reads a shape from the network, or null if it's not one.
export function readShape(o) {
  if (!o || !SHAPES.includes(o.sh) || !Array.isArray(o.p) || o.p.length !== 3 || !(o.r > 0)) return null;
  const s = { sh: o.sh, p: o.p.map(Number), r: Number(o.r) };
  if (o.sh === 'ring') s.r0 = Math.max(0, Math.min(s.r, Number(o.r0) || 0));
  if (o.sh === 'cone') { s.a = Number(o.a) || 0; s.arc = Math.max(1, Math.min(360, Number(o.arc) || 60)); }
  if (o.sh === 'line' || o.sh === 'cross') { s.a = Number(o.a) || 0; s.w = Math.max(0.5, Number(o.w) || 2); }
  return s;
}

// How far across a shape is (for drawing and for culling what's out of sight).
export const shapeReach = (s) => s.r;
