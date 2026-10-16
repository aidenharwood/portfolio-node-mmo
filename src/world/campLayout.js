// A camp's layout: what stands where in it, worked out from its definition alone, so the screen
// that builds it (world/build/campKit.js) and the sim that garrisons it (sim/WorldSim.js) agree.
//   campLayout(def, probe?) → { tier, R, plot, pieces, posts, spawners, gates, throne }
//     plot      its ground (world/plots.js): the outline its perimeter follows, inside radius R
//     pieces    [{ kind, x, z, rot, r, h, s? }]  local metres round the camp's middle; `r` and `h`
//               are what blocks movement there (r 0: nothing does)
//     posts     [{ x, z }]  where its garrison stands, clear of the pieces
//     spawners  [{ id, x, z, kind }]  where its reinforcements come from
//     gates     [{ a, x, z, nx, nz, t }]  the gaps in its perimeter: where (a, the bearing from its
//               middle; a = 0 faces +z), the way out (nx, nz), and how far round the outline (t)
//     throne    { x, z } for a stronghold's boss, else null
//   probe(wx, wz) → true where nothing can stand (water, a cliff): those spots are left out.
// Camps come in tiers (TIERS), from a picket round a fire to a sprawling base. Each faction has a
// kit of pieces (KITS); a stronghold is a base walled and towered all round, with a throne at its
// back. A camp's ground is a plot — a rectangle, a strip, an L, a T, a cross, a wedge or a blob,
// inside its radius — and its perimeter, gates and towers follow that outline.
import { mulberry32 } from '../core/rng.js';
import { plotOf } from './plots.js';

// R: radius (m) · garrison: enemies at rest · spawners · squad: a reinforcement wave's size ·
// every: seconds between waves while someone's there · cap: the most alive there at once.
export const TIERS = {
  picket: { R: 7, garrison: [2, 4], spawners: [1, 1], squad: [1, 2], every: 40, cap: 10 },
  outpost: { R: 10, garrison: [6, 10], spawners: [1, 1], squad: [2, 3], every: 30, cap: 24 },
  camp: { R: 18, garrison: [12, 20], spawners: [1, 2], squad: [3, 4], every: 25, cap: 40 },
  base: { R: 28, garrison: [25, 40], spawners: [2, 3], squad: [4, 6], every: 20, cap: 60 },
};

export function tierOf(def) {
  return def.tier ?? (def.style === 'fort' ? 'base' : 'outpost');
}

// Each faction's pieces, by layer.
export const KITS = {
  scav: { core: 'fire', wall: ['stakes', 'scrapwall'], building: ['shack', 'tent', 'mast', 'heap'], defence: 'gunnest', spawner: 'droppad', clutter: ['crate', 'barrel'] },
  salvage: { core: 'furnace', wall: ['boulder'], building: ['heap', 'suitrack'], defence: 'gunnest', spawner: 'droppad', clutter: ['crate'] },
  nest: { core: 'node', wall: ['mound'], building: ['eggs', 'spire'], defence: 'spitspire', spawner: 'hivemound', clutter: ['eggs'] },
  relay: { core: 'pylon', wall: ['fence'], building: ['pod', 'mast'], defence: 'turret', spawner: 'droppod', clutter: ['crate'] },
  den: { core: 'overhang', wall: ['boulder'], building: ['nest', 'bones'], defence: null, spawner: 'burrow', clutter: ['bones'] },
};
const FORT_KIT = { scav: 'scav', hive: 'nest', synth: 'relay', fauna: 'den' };

// What each piece blocks: footprint radius and height (m). Spawners block nothing (things come
// out of them).
export const PIECES = {
  fire: [0.9, 0.6], furnace: [1.3, 2], node: [1, 1.2], pylon: [0.9, 5.5], overhang: [3.4, 3.2],
  stakes: [0.7, 1.4], scrapwall: [1, 2.2], boulder: [1.2, 1.4], mound: [1.1, 1.2], fence: [1, 2.4], wallseg: [1.6, 4],
  shack: [1.6, 2.4], tent: [1.5, 2], mast: [0.5, 3.4], heap: [1.2, 1.4], suitrack: [0.8, 2.2], eggs: [0.9, 0.8],
  spire: [0.6, 4.5], pod: [1, 1.6], nest: [1.4, 0.5], bones: [0, 0],
  gunnest: [1.2, 1.6], spitspire: [0.8, 4], turret: [0.8, 2.2], tower: [1.8, 6], throne: [1.5, 2],
  crate: [0.6, 0.9], barrel: [0.4, 1],
};

// How many of each layer a tier has: buildings, inner wall runs, clutter.
const COUNTS = {
  picket: { build: 1, runs: 0, clutter: 3 },
  outpost: { build: 2, runs: 0, clutter: 5 },
  camp: { build: 5, runs: 1, clutter: 10 },
  base: { build: 9, runs: 2, clutter: 18 },
};

const LAYERS = { core: 0, perimeter: 1, buildings: 2, defences: 3, spawners: 4, clutter: 5, posts: 6 };
const between = (rng, [a, b]) => a + Math.floor(rng() * (b - a + 1));
const pick = (rng, list) => list[Math.floor(rng() * list.length)];

const memo = new Map();

export function campLayout(def, probe = null) {
  const key = `${def.id}|${def.seed}|${probe ? 1 : 0}`;
  const hit = memo.get(key);
  if (hit) return hit;
  const layout = build(def, probe);
  if (memo.size > 4000) memo.clear();
  memo.set(key, layout);
  return layout;
}

// A camp's plot (world/plots.js): a stronghold's ground is built (rectangles, Ls, Ts, crosses,
// wedges); a camp's anything, a blob or a strip as often as not; an outpost's or a picket's
// chunkier (no room in a thin one for its garrison round its fire).
export function campPlot(def) {
  const R = def.radius ?? TIERS[tierOf(def)].R;
  const tier = tierOf(def);
  return plotOf(def, { R, shapes: def.style === 'fort' ? 'fort' : tier === 'picket' ? 'campsite' : tier === 'outpost' ? 'outpost' : 'camp' });
}

function build(def, probe) {
  const seed = (def.seed ?? 1) >>> 0;
  const stream = (layer) => mulberry32((seed ^ (0x1a41 + LAYERS[layer])) >>> 0);
  const tier = tierOf(def);
  const T = TIERS[tier];
  const N = COUNTS[tier];
  // (A story camp keeps the radius its site was made for.)
  const R = def.radius ?? T.R;
  const fort = def.style === 'fort';
  const kit = KITS[fort ? FORT_KIT[def.race] ?? 'scav' : def.style] ?? KITS.scav;
  const plot = campPlot(def);
  const pieces = [];
  const blocked = (x, z) => !!probe && probe(def.x + x, def.z + z);
  // Folk who belong here (a story camp's): nothing is built where they stand.
  const folk = (def.npcs ?? []).map((n) => [n.x - def.x, n.z - def.z]);
  const add = (kind, x, z, rot = 0, extra = {}) => {
    if (blocked(x, z)) return null;
    const [r, h] = PIECES[kind] ?? [0, 0];
    if (folk.some(([fx, fz]) => Math.hypot(fx - x, fz - z) < r + 1.2)) return null;
    const p = { kind, x, z, rot, r, h, ...extra };
    pieces.push(p);
    return p;
  };
  const clear = (x, z, r, gap = 1.5) => pieces.every((p) => Math.hypot(p.x - x, p.z - z) >= p.r + r + gap);
  const heapOf = (kind, rng, lo, span) => (kind === 'boulder' || kind === 'mound' ? { s: lo + rng() * span } : {});

  // The core, at the plot's heart (the camp's own spot). (A small lair is a nest in the open: no
  // room on its ground for the great overhang.)
  const small = tier === 'picket' || tier === 'outpost';
  add(small && kit.core === 'overhang' ? 'nest' : kit.core, 0, 0, stream('core')() * Math.PI * 2);

  // The perimeter round the plot's outline, broken at its gates (placed by how far round it).
  let rng = stream('perimeter');
  const gateT = [];
  if (fort || tier === 'base') {
    const t = rng();
    gateT.push(t, t + 0.5 + (rng() - 0.5) * 0.2);
  } else if (tier === 'camp') {
    const n = between(rng, [1, 2]);
    const t = rng();
    for (let i = 0; i < n; i++) gateT.push(t + i * (0.4 + rng() * 0.2));
  }
  const gateLen = fort ? 6.5 : tier === 'camp' ? 5.5 : 5;
  const gates = gateT.map((t) => {
    const q = plot.at(t);
    return { a: Math.atan2(q.x, q.z), x: q.x, z: q.z, nx: q.nx, nz: q.nz, t: q.t };
  });
  // How far round the outline (m) a point is from the nearest gate.
  const gateGap = (t) => Math.min(Infinity, ...gates.map((g) => { const d = Math.abs(t - g.t) % 1; return Math.min(d, 1 - d) * plot.perimeter; }));
  const nearGate = (x, z, d) => gates.some((g) => Math.hypot(g.x - x, g.z - z) < d);
  const wallKind = fort ? 'wallseg' : null;
  // A picket's or an outpost's perimeter runs only part way round: a windbreak, a few stakes.
  const span = tier === 'picket' ? 0.25 + rng() * 0.2 : tier === 'outpost' && !fort ? 0.5 + rng() * 0.2 : 1;
  const start = rng();
  const [wr] = PIECES[wallKind ?? kit.wall[0]];
  // A stronghold's outer corners carry its towers: no wall right up against them.
  const corners = plot.corners().filter((c) => c.convex);
  const nearCorner = (x, z, d) => fort && corners.some((c) => Math.hypot(c.x - x, c.z - z) < d);
  for (const q of plot.walk(wr * 2.1, start)) {
    if (((q.t - start + 1) % 1) > span) continue;
    if (gateGap(q.t) < gateLen / 2 + wr * 0.6) continue;
    const kind = wallKind ?? pick(rng, kit.wall);
    const [r] = PIECES[kind];
    if (nearCorner(q.x, q.z, r + 1.2)) continue;
    // Heaped walls (boulders, mounds) lie a little ragged; built ones stand true, just inside.
    const heaped = !wallKind && kind !== 'fence' && kind !== 'scrapwall';
    const d = r + (heaped ? (rng() - 0.5) * 0.6 : 0);
    add(kind, q.x - q.nx * d, q.z - q.nz * d, q.a, heapOf(kind, rng, 0.8, 0.5));
  }
  // Inside a camp or a base, short straight runs of wall split it into yards.
  for (let k = 0; k < N.runs; k++) {
    const kind = kit.wall[0];
    const [r] = PIECES[kind];
    const from = plot.sample(rng, 4);
    if (!from) continue;
    // Along the plot's long way, or across it.
    const dir = plot.rot + (rng() < 0.5 ? 0 : Math.PI / 2) + (rng() - 0.5) * 0.3;
    const len = 6 + rng() * Math.min(10, R * 0.4);
    const n = Math.max(2, Math.round(len / (r * 2.1)));
    for (let i = 0; i < n; i++) {
      const x = from.x + Math.sin(dir) * i * r * 2.1;
      const z = from.z + Math.cos(dir) * i * r * 2.1;
      if (!plot.inside(x, z, r + 2.5) || Math.hypot(x, z) < 4 || nearGate(x, z, gateLen + 2)) continue;
      add(kind, x, z, dir + Math.PI / 2, heapOf(kind, rng, 0.7, 0.4));
    }
  }

  // Buildings, about the plot and apart from each other, facing its heart.
  rng = stream('buildings');
  for (let i = 0; i < N.build; i++) {
    // One of each kind first, then any.
    const kind = i < kit.building.length ? kit.building[i] : pick(rng, kit.building);
    const [r] = PIECES[kind];
    for (let k = 0; k < 40; k++) {
      const q = plot.sample(rng, r + 2.2);
      if (!q || Math.hypot(q.x, q.z) < r + 3 || !clear(q.x, q.z, r) || nearGate(q.x, q.z, gateLen + r + 2)) continue;
      add(kind, q.x, q.z, Math.atan2(-q.x, -q.z));
      break;
    }
  }

  // Defences: by each gate, and (a base's) at its outer corners; a stronghold's towers on every
  // outer corner of its walls.
  rng = stream('defences');
  const guard = fort ? 'tower' : kit.defence;
  if (guard && tier !== 'outpost' && tier !== 'picket') {
    const [r] = PIECES[guard];
    for (const g of gates) {
      const side = rng() < 0.5 ? 1 : -1;
      const q = plot.at(g.t + (side * (gateLen / 2 + r + 0.6)) / plot.perimeter);
      const d = fort ? r * 0.6 : r + 0.8;
      add(guard, q.x - q.nx * d, q.z - q.nz * d, q.a);
    }
    if (tier === 'base') {
      for (const c of fort ? corners : corners.slice(0, 4)) {
        const d = fort ? r * 0.4 : r + 1.2;
        const x = c.x - Math.sin(c.a) * d;
        const z = c.z - Math.cos(c.a) * d;
        if (nearGate(x, z, gateLen / 2 + r + 1)) continue;
        if (clear(x, z, r, 0.2)) add(guard, x, z, c.a);
      }
    }
  }
  // A stronghold's throne: at its back, as far from its main gate as its ground runs.
  let throne = null;
  if (def.stronghold) {
    const g0 = gates[0] ?? { x: 0, z: R };
    const tr = mulberry32((seed ^ 0x7417) >>> 0);
    let best = null;
    for (let k = 0; k < 200; k++) {
      const q = plot.sample(tr, 4.5);
      if (!q || !clear(q.x, q.z, 1.5, 1)) continue;
      const d = Math.hypot(q.x - g0.x, q.z - g0.z) - Math.hypot(q.x, q.z) * 0.35;
      if (!best || d > best.d) best = { ...q, d };
    }
    throne = best ? { x: best.x, z: best.z } : { x: 0, z: -0.4 * plot.inner };
    add('throne', throne.x, throne.z, Math.atan2(g0.x - throne.x, g0.z - throne.z));
  }

  // Spawners: just inside a gate, or (where there are none) at the open side of its ground.
  rng = stream('spawners');
  const nSpawn = between(rng, T.spawners);
  const spawnAt = [];
  for (let i = 0; i < nSpawn; i++) {
    const g = gates[i];
    if (g) { spawnAt.push([g.x - g.nx * 4.5, g.z - g.nz * 4.5]); continue; }
    const q = plot.at(start + span + (1 - span) / 2 + i * 0.13 + (rng() - 0.5) * 0.05);
    const d = Math.min(4, plot.inner * 0.6);
    spawnAt.push([q.x - q.nx * d, q.z - q.nz * d]);
  }
  const spawners = [];
  for (let [x, z] of spawnAt) {
    // (Where its spot falls outside a narrow arm of ground, toward the heart until it's in.)
    for (let k = 0; k < 10 && !plot.inside(x, z, 0.5); k++) { x *= 0.85; z *= 0.85; }
    if (blocked(x, z) || !plot.inside(x, z, 0.5)) continue;
    spawners.push({ id: `${def.id}:sp${spawners.length}`, x, z, kind: kit.spawner });
  }

  // Clutter: crates, barrels, eggs, bones, in heaps by the buildings and walls (as things are left
  // where they're used).
  rng = stream('clutter');
  const by = pieces.filter((p) => p.r >= 0.8 && plot.inside(p.x, p.z, 1.5));
  for (let i = 0; i < N.clutter; i++) {
    const kind = pick(rng, kit.clutter);
    const [r] = PIECES[kind];
    for (let k = 0; k < 20; k++) {
      const near = by.length ? by[Math.floor(rng() * by.length)] : { x: 0, z: 0, r: 2 };
      const a = rng() * Math.PI * 2;
      const x = near.x + Math.sin(a) * (near.r + r + 0.9 + rng() * 1.2);
      const z = near.z + Math.cos(a) * (near.r + r + 0.9 + rng() * 1.2);
      if (!plot.inside(x, z, r + 1)) continue;
      if (!clear(x, z, r, 0.8) || spawners.some((sp) => Math.hypot(sp.x - x, sp.z - z) < 3)) continue;
      add(kind, x, z, rng() * Math.PI * 2);
      break;
    }
  }

  // Posts: spots on open ground inside its outline for the garrison, spread out.
  rng = stream('posts');
  const want = T.garrison[1];
  const posts = [];
  for (let k = 0; k < 12000 && posts.length < want; k++) {
    const x = (rng() * 2 - 1) * R;
    const z = (rng() * 2 - 1) * R;
    // (Spread out first; closer, and nearer the walls, where its ground is tight.)
    if (!plot.inside(x, z, k < 6000 ? 1.4 : k < 9000 ? 0.8 : 0.4)) continue;
    const gap = k < 3000 ? 2.2 : 1.2;
    if (!pieces.every((p) => !p.r || Math.hypot(p.x - x, p.z - z) >= p.r + 0.6)) continue;
    if (!posts.every((q) => Math.hypot(q.x - x, q.z - z) >= gap)) continue;
    if (blocked(x, z)) continue; // (the costliest test, last)
    posts.push({ x, z });
  }

  // With water or cliffs over every spawner spot, its reinforcements come up from the post
  // nearest the middle instead.
  if (!spawners.length && posts.length) {
    const p = posts.reduce((b, q) => (Math.hypot(q.x, q.z) < Math.hypot(b.x, b.z) ? q : b));
    spawners.push({ id: `${def.id}:sp0`, x: p.x, z: p.z, kind: kit.spawner });
  }
  return { tier, R, plot, pieces, posts, spawners, gates, throne };
}
