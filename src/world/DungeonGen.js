// A dungeon's layout (gameplay phase 5), worked out from its seed: a graph of rectangular rooms on
// a 2 m grid, joined by corridors. The main route runs from the entrance hall through four halls
// and the mini-boss's arena to the final boss — behind a locked door (its key in a side room), a
// door that needs power (switched on in side rooms), the arena's seal (open once the mini-boss
// falls), stairs where it drops a level and a lift where it drops a long way. Side rooms hang off
// the route: the key, the power nodes, treasure. Traps (vents, turrets, spore pods), light
// fixtures and clutter go round the rooms.
//
// The main route is the dungeon's own (its seed): every copy has the same one. Side rooms, who's
// in each room, traps and treasure come from `shuffle`, so a private run (sim/Dungeons.js) gets
// its own; the open-world copy uses the dungeon's seed for both. Pure data, the same on the
// server and every screen: world/Interior.js builds the floors and walls from it, the server's
// sim fills its rooms, world/InteriorKit.js draws it.
//
// All positions are metres from the plot's corner (x, z) and its base height (floor heights).
import { mulberry32 } from '../core/rng.js';
import { roomUnits } from '../combat/races.js';
import { CELL, GRID, THEMES } from './dungeons.js';

const between = (rng, [a, b]) => a + Math.floor(rng() * (b - a + 1));
const pick = (rng, list) => list[Math.floor(rng() * list.length)];
const COR = 2;          // corridor width (cells)
const COR_CEIL = 4.5;   // corridor headroom (m)
const SIDE_CEIL = 5;

// The main route: each room, the door into it from the one before (the arena's seal is on the
// arena's side), and the lift down into the second-last hall.
const ROUTE = [
  { kind: 'start', w: [7, 8], h: [7, 8], ceil: 5.5 },
  { kind: 'hall', w: [9, 12], h: [9, 12], ceil: 6.5, door: 'open' },
  { kind: 'hall', w: [9, 12], h: [9, 12], ceil: 6.5, door: 'open' },
  { kind: 'hall', w: [9, 12], h: [9, 12], ceil: 6.5, door: 'locked' },
  { kind: 'mini', w: [12, 13], h: [12, 13], ceil: 8, door: 'power' },
  { kind: 'hall', w: [9, 12], h: [9, 12], ceil: 6.5, door: 'seal', sealFrom: true },
  { kind: 'hall', w: [9, 11], h: [9, 11], ceil: 6.5, door: 'open', lift: true },
  { kind: 'boss', w: [15, 16], h: [15, 16], ceil: 10, door: 'open' },
];
const LOCKED = 3;  // the room behind the locked door
const POWERED = 4; // ...behind the powered one
// Side rooms: what each holds and which rooms of the route it may branch off (before the door it
// opens, for the key and the power).
const SIDES = [
  { kind: 'key', hosts: [1, 2] },
  { kind: 'node', hosts: [1, 2, 3] },
  { kind: 'node', hosts: [2, 3, 1] },
  { kind: 'treasure', hosts: [2, 3, 5, 6] },
  { kind: 'treasure', hosts: [1, 3, 5, 6] },
];
const DROPS = [0, 0, 0, 1.5, 2.5, 3];
const LIFT_DROP = 8;

// ---------------------------------------------------------------- rectangles on the grid
const inGrid = (r) => r.x >= 2 && r.z >= 2 && r.x + r.w <= GRID - 2 && r.z + r.h <= GRID - 2;
function overlaps(rects, r, pad, skip = null) {
  for (const e of rects) {
    if (e === skip) continue;
    if (r.x - pad < e.x + e.w && r.x + r.w + pad > e.x && r.z - pad < e.z + e.h && r.z + r.h + pad > e.z) return true;
  }
  return false;
}

// A corridor `len` cells long off room `A`'s `dir` side, and a w × h room at its far end.
function attach(rng, A, dir, len, w, h) {
  const along = dir === 'E' || dir === 'W';
  const side = along ? A.h : A.w;
  const o = (along ? A.z : A.x) + 1 + Math.floor(rng() * Math.max(1, side - COR - 1));
  const far = along ? h : w;
  const b = o - 1 - Math.floor(rng() * Math.max(1, far - COR - 1));
  if (along) {
    const cx = dir === 'E' ? A.x + A.w : A.x - len;
    return {
      cor: { x: cx, z: o, w: len, h: COR, axis: 'x', dir: dir === 'E' ? 1 : -1 },
      room: { x: dir === 'E' ? cx + len : cx - w, z: b, w, h },
    };
  }
  const cz = dir === 'S' ? A.z + A.h : A.z - len;
  return {
    cor: { x: o, z: cz, w: COR, h: len, axis: 'z', dir: dir === 'S' ? 1 : -1 },
    room: { x: b, z: dir === 'S' ? cz + len : cz - h, w, h },
  };
}

// The main route, laid out east across the plot with turns north and south (never back west, so
// it can't wind into itself).
function placeRoute(rng) {
  for (let attempt = 0; attempt < 80; attempt++) {
    const rects = [];
    const rooms = [];
    const cors = [];
    const S = ROUTE[0];
    const start = { x: 4, z: Math.floor(GRID / 2) - 4 + between(rng, [-10, 10]), w: between(rng, S.w), h: between(rng, S.h), kind: 'start', ceil: S.ceil, floor: 0, main: true, i: 0 };
    rooms.push(start);
    rects.push(start);
    let ok = true;
    let last = 'E';
    for (let i = 1; i < ROUTE.length; i++) {
      const spec = ROUTE[i];
      const A = rooms[i - 1];
      let placed = false;
      for (let t = 0; t < 50 && !placed; t++) {
        const r = rng();
        // Mostly onward; a turn north or south now and then (not straight back the way it turned).
        const dir = r < 0.55 ? 'E' : r < 0.78 ? (last === 'S' ? 'E' : 'N') : (last === 'N' ? 'E' : 'S');
        const len = spec.lift ? 8 : between(rng, [3, 6]);
        const { cor, room } = attach(rng, A, dir, len, between(rng, spec.w), between(rng, spec.h));
        if (!inGrid(cor) || !inGrid(room) || overlaps(rects, cor, 1, A) || overlaps(rects, room, 1)) continue;
        const drop = spec.lift ? LIFT_DROP : pick(rng, DROPS);
        Object.assign(room, { kind: spec.kind, ceil: spec.ceil, floor: A.floor - drop, main: true, i });
        Object.assign(cor, { a: i - 1, b: i, door: spec.door, sealFrom: !!spec.sealFrom, lift: !!spec.lift, main: true });
        rooms.push(room);
        cors.push(cor);
        rects.push(cor, room);
        last = dir;
        placed = true;
      }
      if (!placed) { ok = false; break; }
    }
    if (ok) return { rooms, cors, rects };
  }
  throw new Error('dungeon: no room for the main route');
}

// Side rooms off the route, from the run's own stream.
function placeSides(rng, rooms, cors, rects) {
  const placedKinds = [];
  for (const S of SIDES) {
    let placed = false;
    for (let t = 0; t < 70 && !placed; t++) {
      const host = pick(rng, S.hosts);
      const A = rooms[host];
      const dir = pick(rng, ['E', 'W', 'N', 'S']);
      const { cor, room } = attach(rng, A, dir, between(rng, [2, 4]), between(rng, [6, 8]), between(rng, [6, 8]));
      if (!inGrid(cor) || !inGrid(room) || overlaps(rects, cor, 1, A) || overlaps(rects, room, 1)) continue;
      const i = rooms.length;
      Object.assign(room, { kind: S.kind, ceil: SIDE_CEIL, floor: A.floor, main: false, host, i });
      Object.assign(cor, { a: host, b: i, door: 'open', main: false });
      rooms.push(room);
      cors.push(cor);
      rects.push(cor, room);
      placed = true;
    }
    if (placed) placedKinds.push(S.kind);
  }
  return placedKinds;
}

// ---------------------------------------------------------------- the dungeon
// `def`: one of world/dungeons.js DUNGEONS · `shuffle`: the run's seed (the dungeon's own for the
// open-world copy) · `level`: who lives there is rolled for this level.
export function generateDungeon(def, { shuffle = def.seed, level = def.level } = {}) {
  const theme = THEMES[def.theme];
  const rng = mulberry32(def.seed >>> 0);
  const run = mulberry32((shuffle ^ 0x9e3779b9) >>> 0);
  const { rooms, cors, rects } = placeRoute(rng);
  const kinds = placeSides(run, rooms, cors, rects);
  const W = GRID;

  // Corridor floors: level, a flight of stairs where the rooms differ, or a lift shaft.
  for (const c of cors) {
    c.fa = rooms[c.a].floor;
    c.fb = rooms[c.b].floor;
    const len = c.axis === 'x' ? c.w : c.h;
    // Metres along the corridor's axis where it leaves room A and reaches room B.
    const a0 = (c.axis === 'x' ? c.x : c.z) * CELL;
    const a1 = a0 + len * CELL;
    c.u0 = c.dir > 0 ? a0 : a1;
    c.u1 = c.dir > 0 ? a1 : a0;
    c.ceilY = Math.max(c.fa, c.fb) + COR_CEIL;
    if (c.lift) {
      // Cells 3 and 4 from room A are the shaft: the platform rides between the two floors.
      const k0 = 3;
      const s0 = c.u0 + c.dir * k0 * CELL;
      const s1 = s0 + c.dir * 2 * CELL;
      c.shaft = { u0: Math.min(s0, s1), u1: Math.max(s0, s1), top: c.fa, bottom: c.fb };
      c.ceilY = c.fa + 6;
    }
  }

  // Which area (room, then corridor) each cell belongs to: 0 for rock.
  const areas = [...rooms, ...cors];
  const cells = new Int16Array(W * W);
  areas.forEach((r, k) => {
    for (let z = r.z; z < r.z + r.h; z++) for (let x = r.x; x < r.x + r.w; x++) cells[z * W + x] = k + 1;
  });

  // Doors and openings: where each corridor meets its rooms. The door in it is on room B's side
  // (on room A's for the arena's seal); a side room's is an open arch.
  // (No key room found a place: the locked door stands open; likewise power with no nodes.)
  const nodes = kinds.filter((k) => k === 'node').length;
  const doorKind = (c) => ((c.door === 'locked' && !kinds.includes('key')) || (c.door === 'power' && !nodes) ? 'open' : c.door);
  const openings = [];
  const doors = [];
  for (const c of cors) {
    for (const end of ['a', 'b']) {
      const room = rooms[c[end]];
      const atB = end === 'b';
      // The boundary the corridor crosses into this room, and the span it opens in its wall.
      const line = c.axis === 'x'
        ? ((c.dir > 0) === atB ? c.x + c.w : c.x) * CELL
        : ((c.dir > 0) === atB ? c.z + c.h : c.z) * CELL;
      const s0 = (c.axis === 'x' ? c.z : c.x) * CELL;
      const o = {
        room: room.i, cor: cors.indexOf(c), axis: c.axis, line, s0, s1: s0 + COR * CELL, floor: atB ? c.fb : c.fa,
        // Which way into the room from the corridor (+1: up the axis).
        into: atB ? c.dir : -c.dir, door: null,
      };
      const kind = doorKind(c);
      const here = c.sealFrom ? !atB : atB;
      if (here) {
        o.door = `d${doors.length}`;
        doors.push({ id: o.door, kind, room: room.i, cor: o.cor, axis: o.axis, line, s0, s1: o.s1, floor: o.floor, into: o.into, needs: kind === 'power' ? nodes : 0 });
      }
      openings.push(o);
    }
  }

  // The things to use: the way out (start), the key, the power nodes, treasure, and after the
  // boss the reward chest and the way out.
  const things = [];
  const center = (r) => ({ x: (r.x + r.w / 2) * CELL, z: (r.z + r.h / 2) * CELL });
  const entryOf = (r) => openings.find((o) => o.room === r.i && cors[o.cor].b === r.i) ?? openings.find((o) => o.room === r.i);
  const exitOf = (r) => openings.find((o) => o.room === r.i && cors[o.cor].a === r.i && cors[o.cor].main);
  // A point `back` metres in from the wall opposite opening `o`, on the room's middle line.
  const opposite = (r, o, back) => {
    const c = center(r);
    if (!o) return c;
    if (o.axis === 'x') return { x: o.into > 0 ? (r.x + r.w) * CELL - back : r.x * CELL + back, z: c.z };
    return { x: c.x, z: o.into > 0 ? (r.z + r.h) * CELL - back : r.z * CELL + back };
  };
  const facingInto = (o) => (o.axis === 'x' ? (o.into > 0 ? Math.PI / 2 : -Math.PI / 2) : (o.into > 0 ? 0 : Math.PI));
  const start = rooms[0];
  const out = exitOf(start);
  // From the start, facing the way on (the way it goes out of the start room is "into" the corridor).
  const onward = out ? facingInto(out) + Math.PI : 0;
  const portal = opposite(start, out, 1.3);
  things.push({ id: 't0', kind: 'portal', room: 0, ...portal, floor: start.floor, facing: onward });
  for (const r of rooms) {
    if (r.kind === 'key' || r.kind === 'node' || r.kind === 'treasure') {
      const c = center(r);
      things.push({ id: `t${things.length}`, kind: r.kind === 'treasure' ? 'chest' : r.kind, room: r.i, ...c, floor: r.floor, facing: facingInto(entryOf(r)) + Math.PI });
    }
  }
  const boss = rooms.find((r) => r.kind === 'boss');
  const bossIn = entryOf(boss);
  const back = opposite(boss, bossIn, 3);
  const side = bossIn.axis === 'x' ? { x: 0, z: 3.2 } : { x: 3.2, z: 0 };
  const faceIn = facingInto(bossIn) + Math.PI;
  things.push({ id: `t${things.length}`, kind: 'reward', room: boss.i, x: back.x - side.x, z: back.z - side.z, floor: boss.floor, facing: faceIn });
  things.push({ id: `t${things.length}`, kind: 'exit', room: boss.i, x: back.x + side.x, z: back.z + side.z, floor: boss.floor, facing: faceIn });

  // Free spots in a room for enemies, traps and clutter: clear of the walls, the openings and the
  // things in it — and of the pillars holding up the two arenas' roofs.
  const pillars = [];
  for (const r of rooms) {
    if (r.kind !== 'boss' && r.kind !== 'mini') continue;
    for (const fx of [0.25, 0.75]) for (const fz of [0.25, 0.75]) pillars.push({ room: r.i, x: (r.x + r.w * fx) * CELL, z: (r.z + r.h * fz) * CELL, r: 0.85 });
  }
  const taken = pillars.map((p) => ({ x: p.x, z: p.z }));
  const clearOf = (r, x, z, pad) => {
    if (x < r.x * CELL + 1.6 || x > (r.x + r.w) * CELL - 1.6 || z < r.z * CELL + 1.6 || z > (r.z + r.h) * CELL - 1.6) return false;
    for (const o of openings) {
      if (o.room !== r.i) continue;
      const ox = o.axis === 'x' ? o.line : (o.s0 + o.s1) / 2;
      const oz = o.axis === 'x' ? (o.s0 + o.s1) / 2 : o.line;
      if (Math.hypot(ox - x, oz - z) < 5) return false;
    }
    for (const t of things) if (t.room === r.i && Math.hypot(t.x - x, t.z - z) < 3) return false;
    for (const t of taken) if (Math.hypot(t.x - x, t.z - z) < pad) return false;
    return true;
  };
  const spot = (rand, r, pad = 1.8, region = null) => {
    for (let k = 0; k < 40; k++) {
      let x = (r.x + 1 + rand() * (r.w - 2)) * CELL;
      let z = (r.z + 1 + rand() * (r.h - 2)) * CELL;
      if (region) ({ x, z } = region(x, z));
      if (clearOf(r, x, z, pad)) { taken.push({ x, z }); return { x, z }; }
    }
    return null;
  };

  // Who's in each room (the run's own roll): halls hold a band of the theme's race, side rooms a
  // guard or two, the arena the mini-boss and a pair at its side, the last room the boss.
  const race = theme.race;
  const spawns = [];
  for (const r of rooms) {
    let units = [];
    if (r.kind === 'hall') units = roomUnits(race, level, run, 3 + Math.floor(run() * 2) + (level >= 10 ? 1 : 0), level >= 10 ? 1 : run() < 0.3 ? 1 : 0);
    else if (r.kind === 'key' || r.kind === 'node') units = roomUnits(race, level, run, 2 + Math.floor(run() * 2), level >= 12 && run() < 0.5 ? 1 : 0);
    else if (r.kind === 'treasure') units = run() < 0.5 ? roomUnits(race, level, run, 2) : [];
    else if (r.kind === 'mini') units = [{ type: def.mini.type, opts: { elite: true, champion: true, name: def.mini.name } }, ...roomUnits(race, level, run, 2)];
    else if (r.kind === 'boss') units = [{ type: def.boss.type, opts: { boss: true } }];
    if (!units.length) continue;
    const placed = [];
    for (const u of units) {
      // The boss waits at the far end, the mini-boss in the middle of the arena.
      let at = null;
      if (u.opts.boss) at = opposite(r, entryOf(r), 7);
      else if (r.kind === 'mini' && u.opts.champion) at = center(r);
      else at = spot(run, r, 2.2);
      if (at) placed.push({ ...u, x: at.x, z: at.z });
    }
    spawns.push({ room: r.i, units: placed });
  }

  // Traps: vents across some corridors and treasure rooms, turrets on hall walls, spore pods
  // where it's organic.
  const traps = [];
  const trap = (kind, x, z, floor, extra = {}) => traps.push({ id: `x${traps.length}`, kind, x, z, floor, phase: run() * 4, ...extra });
  for (const c of cors) {
    if (!c.main || c.lift) continue;
    const len = (c.axis === 'x' ? c.w : c.h) * CELL;
    if (len < 8 || run() > 0.45) continue;
    for (const f of [0.33, 0.67]) {
      const u = c.u0 + (c.u1 - c.u0) * f;
      const w = (c.axis === 'x' ? c.z : c.x) * CELL + CELL;
      const x = c.axis === 'x' ? u : w;
      const z = c.axis === 'x' ? w : u;
      trap('vent', x, z, c.fa + (c.fb - c.fa) * f, { area: rooms.length + cors.indexOf(c) });
    }
  }
  for (const r of rooms) {
    if (r.kind === 'hall' && run() < 0.45) {
      // A turret on the wall facing the way in.
      const o = entryOf(r);
      const at = opposite(r, o, 0.9);
      trap('turret', at.x, at.z, r.floor, { area: r.i, facing: facingInto(o) + Math.PI });
    }
    if (theme.organic && (r.kind === 'hall' || r.kind === 'treasure')) {
      const n = r.kind === 'treasure' ? 3 : 2 + Math.floor(run() * 3);
      for (let k = 0; k < n; k++) { const at = spot(run, r, 2.4); if (at) trap('pod', at.x, at.z, r.floor, { area: r.i }); }
    } else if (r.kind === 'treasure') {
      for (let k = 0; k < 2; k++) { const at = spot(run, r, 2.4); if (at) trap('vent', at.x, at.z, r.floor, { area: r.i }); }
    }
  }

  // Light fixtures round the walls and down the corridors; clutter along the walls.
  const lights = [];
  const props = [];
  const wallSpots = (r, every, inset) => {
    const out = [];
    const sides = [
      { n: r.w, at: (k) => ({ x: (r.x + k) * CELL, z: r.z * CELL + inset, facing: 0 }) },
      { n: r.w, at: (k) => ({ x: (r.x + k) * CELL, z: (r.z + r.h) * CELL - inset, facing: Math.PI }) },
      { n: r.h, at: (k) => ({ x: r.x * CELL + inset, z: (r.z + k) * CELL, facing: Math.PI / 2 }) },
      { n: r.h, at: (k) => ({ x: (r.x + r.w) * CELL - inset, z: (r.z + k) * CELL, facing: -Math.PI / 2 }) },
    ];
    for (const s of sides) {
      for (let k = every / 2; k < s.n - 0.5; k += every) {
        const p = s.at(k);
        if (openings.some((o) => o.room === r.i && Math.hypot((o.axis === 'x' ? o.line : (o.s0 + o.s1) / 2) - p.x, (o.axis === 'x' ? (o.s0 + o.s1) / 2 : o.line) - p.z) < 4.5)) continue;
        out.push(p);
      }
    }
    return out;
  };
  for (const r of rooms) {
    const lift = Math.min(r.ceil - 1, 3.4);
    for (const p of wallSpots(r, r.kind === 'boss' || r.kind === 'mini' ? 3 : 4, 0.35)) lights.push({ ...p, y: r.floor + lift, area: r.i });
    const spots = wallSpots(r, 2, 1.1);
    const n = Math.min(spots.length, (r.kind === 'start' ? 3 : 5) + Math.floor(run() * 4));
    for (let k = 0; k < n; k++) {
      const s = spots.splice(Math.floor(run() * spots.length), 1)[0];
      if (!s || things.some((t) => t.room === r.i && Math.hypot(t.x - s.x, t.z - s.z) < 2.5)) continue;
      props.push({ ...s, floor: r.floor, k: Math.floor(run() * 4), s: 0.8 + run() * 0.5, area: r.i });
    }
  }
  for (const c of cors) {
    const len = c.axis === 'x' ? c.w : c.h;
    const w = (c.axis === 'x' ? c.z : c.x) * CELL + CELL;
    for (let k = 1.5; k < len; k += 3) {
      const u = c.u0 + c.dir * k * CELL;
      if (c.shaft && u > c.shaft.u0 - 1 && u < c.shaft.u1 + 1) continue;
      lights.push({ x: c.axis === 'x' ? u : w, z: c.axis === 'x' ? w : u, y: c.ceilY - 0.4, area: rooms.length + cors.indexOf(c), hang: true });
    }
  }

  const lift = cors.find((c) => c.lift) ?? null;
  return {
    id: def.id, name: def.name, theme: def.theme, level, shuffle, W, cell: CELL,
    rooms, cors, cells, openings, doors, things, spawns, traps, lights, props, pillars,
    start: { x: center(start).x, z: center(start).z, floor: start.floor, facing: onward },
    boss: boss.i, mini: rooms.find((r) => r.kind === 'mini').i, lift: lift ? cors.indexOf(lift) : -1, sides: kinds,
  };
}
