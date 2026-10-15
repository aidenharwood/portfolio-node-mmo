// A camp's layout: what stands where in it, worked out from its definition alone, so the screen
// that builds it (world/build/campKit.js) and the sim that garrisons it (sim/WorldSim.js) agree.
//   campLayout(def, probe?) → { tier, R, pieces, posts, spawners, gates, throne }
//     pieces    [{ kind, x, z, rot, r, h, s? }]  local metres round the camp's middle; `r` and `h`
//               are what blocks movement there (r 0: nothing does)
//     posts     [{ x, z }]  where its garrison stands, clear of the pieces
//     spawners  [{ id, x, z, kind }]  where its reinforcements come from
//     gates     [{ a }]  the gaps in its perimeter (radians; a = 0 faces +z)
//     throne    { x, z } for a stronghold's boss, else null
//   probe(wx, wz) → true where nothing can stand (water, a cliff): those spots are left out.
// Camps come in three tiers (TIERS). Each faction has a kit of pieces (KITS); a stronghold is a
// base walled and towered all round, with a throne at its back.
import { mulberry32 } from '../core/rng.js';

// R: radius (m) · garrison: enemies at rest · spawners · squad: a reinforcement wave's size ·
// every: seconds between waves while someone's there · cap: the most alive there at once.
export const TIERS = {
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
  stakes: [0.7, 1.4], scrapwall: [1, 2.2], boulder: [1.2, 1.4], mound: [1.1, 1.2], fence: [0.5, 2.4], wallseg: [1.6, 4],
  shack: [1.6, 2.4], tent: [1.5, 2], mast: [0.5, 3.4], heap: [1.2, 1.4], suitrack: [0.8, 2.2], eggs: [0.9, 0.8],
  spire: [0.6, 4.5], pod: [1, 1.6], nest: [1.4, 0.5], bones: [0, 0],
  gunnest: [1.2, 1.6], spitspire: [0.8, 4], turret: [0.8, 2.2], tower: [1.8, 6], throne: [1.5, 2],
  crate: [0.6, 0.9], barrel: [0.4, 1],
};

const LAYERS = { core: 0, perimeter: 1, buildings: 2, defences: 3, spawners: 4, clutter: 5, posts: 6 };
const between = (rng, [a, b]) => a + Math.floor(rng() * (b - a + 1));
const pick = (rng, list) => list[Math.floor(rng() * list.length)];
const angDiff = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

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

function build(def, probe) {
  const seed = (def.seed ?? 1) >>> 0;
  const stream = (layer) => mulberry32((seed ^ (0x1a41 + LAYERS[layer])) >>> 0);
  const tier = tierOf(def);
  const T = TIERS[tier];
  const R = T.R;
  const fort = def.style === 'fort';
  const kit = KITS[fort ? FORT_KIT[def.race] ?? 'scav' : def.style] ?? KITS.scav;
  const pieces = [];
  const blocked = (x, z) => !!probe && probe(def.x + x, def.z + z);
  const add = (kind, x, z, rot = 0, extra = {}) => {
    if (blocked(x, z)) return null;
    const [r, h] = PIECES[kind] ?? [0, 0];
    const p = { kind, x, z, rot, r, h, ...extra };
    pieces.push(p);
    return p;
  };
  const clear = (x, z, r, gap = 1.5) => pieces.every((p) => Math.hypot(p.x - x, p.z - z) >= p.r + r + gap);

  // The core, at the middle.
  add(kit.core, 0, 0, stream('core')() * Math.PI * 2);

  // The perimeter, broken at its gates.
  let rng = stream('perimeter');
  const gates = [];
  if (fort || tier === 'base') {
    const a = rng() * Math.PI * 2;
    gates.push({ a }, { a: a + Math.PI + (rng() - 0.5) * 1.2 });
  } else if (tier === 'camp') {
    const n = between(rng, [1, 2]);
    const a = rng() * Math.PI * 2;
    for (let i = 0; i < n; i++) gates.push({ a: a + i * (Math.PI * (0.8 + rng() * 0.4)) });
  }
  const gateHalf = tier === 'camp' && !fort ? 0.25 : 0.225;
  const wallKind = fort ? 'wallseg' : null;
  const span = tier === 'outpost' && !fort ? 0.5 + rng() * 0.2 : 1;
  const start = rng() * Math.PI * 2;
  const [wr] = PIECES[wallKind ?? kit.wall[0]];
  const steps = Math.ceil((Math.PI * 2 * R) / (wr * 2.1));
  for (let i = 0; i < steps; i++) {
    const t = i / steps;
    if (t > span) break;
    const a = start + t * Math.PI * 2;
    if (gates.some((g) => angDiff(g.a, a) < gateHalf)) continue;
    const kind = wallKind ?? pick(rng, kit.wall);
    const [r] = PIECES[kind];
    // Heaped walls (boulders, mounds) lie a little ragged; built ones stand true.
    const d = R - r + (wallKind || kind === 'fence' || kind === 'scrapwall' ? 0 : (rng() - 0.5) * 0.6);
    add(kind, Math.sin(a) * d, Math.cos(a) * d, a, kind === 'boulder' || kind === 'mound' ? { s: 0.8 + rng() * 0.5 } : {});
  }

  // Buildings, round the middle and apart from each other.
  rng = stream('buildings');
  const nBuild = tier === 'outpost' ? 1 : tier === 'camp' ? 3 : 6;
  for (let i = 0; i < nBuild; i++) {
    // One of each kind first, then any.
    const kind = i < kit.building.length ? kit.building[i] : pick(rng, kit.building);
    const [r] = PIECES[kind];
    for (let k = 0; k < 40; k++) {
      const a = rng() * Math.PI * 2;
      const d = R * (0.35 + rng() * 0.45);
      const x = Math.sin(a) * d;
      const z = Math.cos(a) * d;
      if (Math.hypot(x, z) + r > R - 1.5 || !clear(x, z, r) || gates.some((g) => angDiff(g.a, a) < 0.4 && d > R * 0.6)) continue;
      add(kind, x, z, a + Math.PI);
      break;
    }
  }

  // Defences: by each gate, and (a base's) at four corners.
  rng = stream('defences');
  const guard = fort ? 'tower' : kit.defence;
  if (guard && tier !== 'outpost') {
    const [r] = PIECES[guard];
    for (const g of gates) {
      const a = g.a + (gateHalf + 0.12) * (rng() < 0.5 ? 1 : -1);
      const d = R - r - (fort ? 0 : 1);
      add(guard, Math.sin(a) * d, Math.cos(a) * d, a);
    }
    if (tier === 'base') {
      const a0 = gates[0]?.a ?? 0;
      for (let i = 0; i < 4; i++) {
        const a = a0 + Math.PI / 4 + (i * Math.PI) / 2;
        if (gates.some((g) => angDiff(g.a, a) < 0.5)) continue;
        const d = R - r - (fort ? 0 : 1.5);
        if (clear(Math.sin(a) * d, Math.cos(a) * d, r, 0.2)) add(guard, Math.sin(a) * d, Math.cos(a) * d, a);
      }
    }
  }
  const throne = def.stronghold ? { x: 0, z: -0.6 * R } : null;
  if (throne) add('throne', throne.x, throne.z - 2, 0);

  // Spawners: just inside a gate, or (an outpost's) at its back.
  rng = stream('spawners');
  const nSpawn = between(rng, T.spawners);
  const spawners = [];
  const spawnAt = [];
  for (let i = 0; i < nSpawn; i++) {
    const g = gates[i % Math.max(1, gates.length)];
    const a = g ? g.a + (i >= gates.length ? 0.6 : 0) : Math.PI + (rng() - 0.5) * 0.6;
    const d = g ? R - 4.5 : R * 0.7;
    spawnAt.push([Math.sin(a) * d, Math.cos(a) * d]);
  }
  for (const [x, z] of spawnAt) {
    if (blocked(x, z)) continue;
    spawners.push({ id: `${def.id}:sp${spawners.length}`, x, z, kind: kit.spawner });
  }

  // Clutter: crates, barrels, eggs, bones.
  rng = stream('clutter');
  const nClutter = tier === 'outpost' ? 3 : tier === 'camp' ? 6 : 10;
  for (let i = 0; i < nClutter; i++) {
    const kind = pick(rng, kit.clutter);
    const [r] = PIECES[kind];
    for (let k = 0; k < 20; k++) {
      const a = rng() * Math.PI * 2;
      const d = R * (0.2 + rng() * 0.6);
      const x = Math.sin(a) * d;
      const z = Math.cos(a) * d;
      if (!clear(x, z, r, 0.8) || spawners.some((sp) => Math.hypot(sp.x - x, sp.z - z) < 3)) continue;
      add(kind, x, z, rng() * Math.PI * 2);
      break;
    }
  }

  // Posts: spots on open ground for the garrison, spread out.
  rng = stream('posts');
  const want = T.garrison[1];
  const posts = [];
  const inner = 0.85 * R;
  for (let k = 0; k < 6000 && posts.length < want; k++) {
    const a = rng() * Math.PI * 2;
    const d = Math.sqrt(rng()) * inner;
    const x = Math.sin(a) * d;
    const z = Math.cos(a) * d;
    const gap = k < 3000 ? 2.2 : 1.2;
    if (blocked(x, z)) continue;
    if (!pieces.every((p) => !p.r || Math.hypot(p.x - x, p.z - z) >= p.r + 0.6)) continue;
    if (!posts.every((q) => Math.hypot(q.x - x, q.z - z) >= gap)) continue;
    posts.push({ x, z });
  }

  // With water or cliffs over every spawner spot, its reinforcements come up from the post
  // nearest the middle instead.
  if (!spawners.length && posts.length) {
    const p = posts.reduce((b, q) => (Math.hypot(q.x, q.z) < Math.hypot(b.x, b.z) ? q : b));
    spawners.push({ id: `${def.id}:sp0`, x: p.x, z: p.z, kind: kit.spawner });
  }
  return { tier, R, pieces, posts, spawners, gates, throne };
}
