// The story's places and people (gameplay phase 4: the Prologue and Act I), set deliberately in
// every world like the cities: the wreck of the Pilgrim on the road from Brightwater toward New
// Meridian; round New Meridian two signal beacons and the Wardens' relic dig; out past it, in the
// scav country, Ironjaw's outpost, his fortress the Rustjaw Foundry, and the dig he was making at
// the Sunken Vault. Each is a point of interest of the region it stands in (world/Gen.js asks
// storyIn), placed on the flattest open ground near where the story wants it, so it's the same on
// the server and every screen.
// `storyRef` turns the names quests use ("pilgrim:console", "city1:warden", "raided:survivor",
// "home:camp"…) into a place to point at and, where there is one, the id of the person, object or
// camp the server checks — the quest log's and the waypoints' one way of finding anything.
import { mulberry32 } from '../core/rng.js';
import { SIZES, CITY_WALL, folkFor } from './places.js';
import { roadRoute } from '../sim/Routes.js';

const TAU = Math.PI * 2;

// Where each place goes: from an anchor (the hub, New Meridian, another story place), a bearing
// relative to the line from the hub out to New Meridian, and a distance. `r`: its footprint.
export const STORY_PLACES = {
  pilgrim: { name: 'Wreck of the Pilgrim', from: 'hub', turn: -0.35, frac: 0.45, r: 22, flat: [10, 22], act: 0 },
  foundry: { name: 'Rustjaw Foundry', from: 'hub', turn: 0.3, dist: 930, r: 16, flat: [12, 22], act: 1 },
  outpost: { name: 'Rustjaw Outpost', from: 'foundry', toward: 'hub', dist: 150, r: 12, flat: [10, 16], act: 1 },
  vault: { name: 'The Sunken Vault', from: 'foundry', turn: 0.9, dist: 200, r: 16, flat: [10, 18], act: 1 },
  beacon1: { name: 'Eastwatch Beacon', from: 'city1', turn: -1.4, dist: CITY_WALL + 70, r: 5, flat: [4, 7], act: 1 },
  beacon2: { name: 'Highwatch Beacon', from: 'city1', turn: 1.0, dist: CITY_WALL + 150, r: 5, flat: [4, 7], act: 1 },
  relicdig: { name: 'Warden Relic Dig', from: 'city1', turn: 2.3, dist: CITY_WALL + 90, r: 14, flat: [8, 14], act: 1 },
  // Act II's dungeon (gameplay phase 5), out past Farcall.
  broodpits: { name: 'The Brood Pits', from: 'city2', turn: 2.2, dist: CITY_WALL + 180, r: 14, flat: [10, 16], act: 2 },
  // Act II: the Maker listening station the first Wardens re-tuned to hush the Hive, out on open
  // ground past Farcall's masts; it faces the city (`face`), the way the player comes in.
  array: { name: 'The Farcall Array', from: 'city2', turn: -2.6, dist: CITY_WALL + 170, r: 16, flat: [10, 18], act: 2, face: 'city2' },
  // Act II round Farcall: the field where the spore pods took root, and the nest of the Psion
  // driving the swarms.
  sporefield: { name: 'The Spore Field', from: 'city2', turn: -1.2, dist: CITY_WALL + 140, r: 12, flat: [8, 14], act: 2 },
  psionnest: { name: 'Psion\'s Nest', from: 'city2', turn: 0.9, dist: CITY_WALL + 220, r: 12, flat: [8, 14], act: 2 },
  // Act III round Ironreach: the Fallen Titan, kneeling where it fell in the old war, facing the
  // city built from its kin; the Synth salvagers' camp just beyond it (reached after it); and Isa Brannock's
  // salvage yard just outside the walls.
  titan: { name: 'The Fallen Titan', from: 'city3', turn: 1.3, dist: CITY_WALL + 300, r: 14, flat: [10, 16], act: 3, face: 'city3' },
  salvage: { name: 'Salvage Rig', from: 'titan', away: 'city3', dist: 70, r: 11, flat: [8, 14], act: 3, keep: 0.3, around: [0, 0.6, -0.6, 1.2, -1.2] },
  yard: { name: 'Brannock\'s Yard', from: 'city3', turn: -0.6, dist: CITY_WALL + 50, r: 12, flat: [8, 14], act: 3, face: 'city3' },
};
// (New places go on the end: each draws from the seed in turn, so the earlier ones stay put.)
const ORDER = ['foundry', 'outpost', 'vault', 'beacon1', 'beacon2', 'relicdig', 'pilgrim', 'broodpits', 'array', 'sporefield', 'psionnest', 'titan', 'salvage', 'yard'];

// Story folk with names of their own (looks fixed; world/settlements.js dresses them).
export const STORY_FOLK = {
  chief: { name: 'Orla Penn', title: 'Dig Chief', look: { skin: 0xc68a5e, hair: 0x2a1a12, hairStyle: 'bun', top: 0x8a6a3a, topDark: 0x5a4424, trim: 0xf0c75e, pants: 0x3a3a46, boots: 0x3a2a1a, leather: 0x6a4a2a, metal: 0xc9d1dc, glow: 0xffb347, hat: 'helmet', hatColor: 0xd9a227, goggles: true, apron: 0x5a5f6a } },
  krell: { name: 'Krell', title: 'Ironjaw\'s Lieutenant', look: { skin: 0xe0ac84, hair: 0x1f1a17, hairStyle: 'spiky', top: 0x6a3a2a, topDark: 0x4a2418, trim: 0xb0583a, pants: 0x2e2e36, boots: 0x2a2018, leather: 0x4a3a2a, metal: 0x8a909c, glow: 0xff8a2a, beard: 0x1f1a17, pauldrons: true } },
  // Farcall's captain of the watch (Act II), in Warden green, with a mast officer's goggles.
  captain: { name: 'Vey Okonta', title: 'Captain of the Watch', look: { skin: 0x8d5a3b, hair: 0x1a1412, hairStyle: 'short', top: 0x3a6a4a, topDark: 0x2a4a34, trim: 0xd0d0d0, pants: 0x2a2e36, boots: 0x3a2a1a, leather: 0x4a3a2a, metal: 0xc9d1dc, glow: 0x7aff9a, goggles: true, pauldrons: true, cape: 0x2a4a34 } },
  // Ironreach's foundrywright (Act III), who reads dead Synths for a living: a soot-black apron
  // over shop greys, welding goggles up on her brow, the Synths' cyan on her tools.
  engineer: { name: 'Isa Brannock', title: 'Foundrywright', look: { skin: 0xd8a37c, hair: 0x6a3a22, hairStyle: 'bun', top: 0x5a5f6a, topDark: 0x3a3e46, trim: 0xd9a227, pants: 0x2a2e36, boots: 0x2a2018, leather: 0x4a3a2a, metal: 0x9aa0aa, glow: 0x3ad8ff, goggles: true, apron: 0x22242a } },
};

// Whether (x, z) keeps clear of the hub, the cities, the waystones (and the villages and towns
// round them), and the places already set.
function clearOf(gen, x, z, r, placed) {
  if (Math.hypot(x, z) < 90 + r) return false;
  for (const c of gen.cities()) if (Math.hypot(c.x - x, c.z - z) < CITY_WALL + r + 25) return false;
  const [cx, cz] = gen.cellOf(x, z);
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      const t = gen.townAt(cx + dx, cz + dz);
      if (t && Math.hypot(t.x - x, t.z - z) < SIZES.town.r + r + 25) return false;
      const w = gen.peekWaystone(cx + dx, cz + dz);
      if (w && Math.hypot(w.x - x, w.z - z) < SIZES.village.r + r + 22) return false;
    }
  }
  return Object.values(placed).every((p) => Math.hypot(p.x - x, p.z - z) > p.r + r + 40);
}

// The region (Voronoi cell) that owns (x, z).
function cellAt(gen, x, z) {
  const [cx, cz] = gen.cellOf(x, z);
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) if (gen.owns(cx + dx, cz + dz, x, z)) return [cx + dx, cz + dz];
  return [cx, cz];
}

// Every story place of a world, worked out once (from the seed and the cities).
export function storyPlaces(gen) {
  if (gen._story) return gen._story;
  const city = gen.cities()[0];
  const out = {};
  const city2 = gen.cities()[1] ?? city;
  const city3 = gen.cities()[2] ?? city2;
  const anchor = { hub: { x: 0, z: 0 }, city1: { x: city.x, z: city.z }, city2: { x: city2.x, z: city2.z }, city3: { x: city3.x, z: city3.z } };
  const main = Math.atan2(city.x, city.z); // the bearing from the hub out to New Meridian
  const rng = mulberry32((gen.seed ^ 0x57a7) >>> 0);
  for (const key of ORDER) {
    const S = STORY_PLACES[key];
    const from = anchor[S.from] ?? out[S.from];
    let tx;
    let tz;
    let a = 0;
    if (S.frac) {
      tx = city.x * S.frac + Math.sin(main + Math.PI / 2) * S.turn * 60;
      tz = city.z * S.frac + Math.cos(main + Math.PI / 2) * S.turn * 60;
    } else {
      // `toward` a place, `away` from one (beyond `from`, seen from it), or on a bearing of its own.
      const to = S.toward ? anchor[S.toward] ?? out[S.toward] : null;
      const off = S.away ? anchor[S.away] ?? out[S.away] : null;
      a = to ? Math.atan2(to.x - from.x, to.z - from.z) : off ? Math.atan2(from.x - off.x, from.z - off.z) : main + S.turn + (rng() - 0.5) * 0.2;
      tx = from.x + Math.sin(a) * S.dist;
      tz = from.z + Math.cos(a) * S.dist;
    }
    // Where to look: round the spot it's wanted at. `around` (a place that belongs beside another):
    // also at bearings either side of it, the same distance out, each searched close in — so rough
    // ground just there sends it a little round, not far off.
    const centres = S.around ? S.around.map((da) => [from.x + Math.sin(a + da) * S.dist, from.z + Math.cos(a + da) * S.dist, Math.abs(da) * S.dist]) : [[tx, tz, 0]];
    let best = null;
    for (const [cx, cz, arc] of centres) {
      for (let i = 0; i < (S.around ? 10 : 40); i++) {
        const d = i ? 6 + i * 4 : 0;
        const x = cx + Math.sin(i * 2.4) * d;
        const z = cz + Math.cos(i * 2.4) * d;
        if (!clearOf(gen, x, z, S.r, out)) continue;
        // `keep`: a place that belongs beside another pays for each metre it strays from where it
        // was wanted, so a flatter spot further off doesn't win by default (places without it are
        // scored as they always were).
        const s = gen.flatness(x, z, S.flat) + (S.keep ?? 0) * (d + arc);
        if (!best || s < best.s) best = { x, z, s };
        if (s < 2.5) break;
      }
      if (best && best.s < 2.5) break;
    }
    best ??= { x: tx, z: tz, s: Infinity };
    const [rx, rz] = cellAt(gen, best.x, best.z);
    const look = S.face ? anchor[S.face] : city;
    const toCity = Math.atan2(look.x - best.x, look.z - best.z);
    out[key] = {
      key, rx, rz, x: best.x, z: best.z, r: S.r, name: S.name, act: S.act, h: Math.max(gen.baseHeight(best.x, best.z), -0.4),
      level: Math.max(1, Math.round(1 + Math.hypot(best.x, best.z) / 130)), rot: key === 'pilgrim' ? main + 0.4 : toCity,
    };
  }
  gen._story = out;
  return out;
}

// The story's points of interest in region (rx, rz) (with their folk and the objects quests use),
// and the ground they keep (`taken`) and level (`pads`).
export function storyIn(gen, rx, rz) {
  const all = storyPlaces(gen);
  const out = [];
  for (const P of Object.values(all)) {
    if (P.rx !== rx || P.rz !== rz) continue;
    const key = `${rx},${rz}`;
    const base = { key, x: P.x, z: P.z, rot: P.rot, h: P.h, name: P.name, level: P.level, story: P.key, seed: (gen.seed ^ (Math.round(P.x) * 73856093) ^ (Math.round(P.z) * 19349663)) >>> 0 };
    const rng = mulberry32(base.seed);
    let poi;
    if (P.key === 'pilgrim') {
      poi = { ...base, type: 'landmark', id: `p:${key}:pilgrim`, kind: 'wreck', r: P.r, tag: 'sp' };
      // The bridge console (on the wreck's open side, by the nose) and the cryo bay's open pods.
      poi.npcs = [folkFor(poi, rng, 0, 'object', P.rot + 0.42, 13.5, { object: 'pilgrim:console', model: 'console', facing: P.rot + Math.PI / 2 })];
    } else if (P.key === 'foundry') {
      poi = {
        ...base, type: 'camp', id: `sf:${key}`, radius: 15, race: 'scav', style: 'fort', stronghold: true, level: Math.max(7, P.level),
        boss: { name: 'Gorrak the Foreman' }, tag: 'sf',
      };
      // Krell, Ironjaw's lieutenant, kneels by the gate once his chief has fallen; at the back of
      // the yard, the way down into the foundry itself (a dungeon: world/dungeons.js).
      poi.npcs = [
        folkFor(poi, rng, 0, 'story', P.rot + 0.5, 9, { folk: 'krell', when: { quest: 'a6', stage: 2 } }),
        folkFor(poi, rng, 1, 'object', Math.atan2(8, -8), Math.hypot(8, 8), { object: 'foundry:gate', model: 'foundrygate', facing: 0 }),
      ];
    } else if (P.key === 'outpost') {
      poi = { ...base, type: 'camp', id: `sc:${key}`, radius: 12, race: 'scav', style: 'scav', level: Math.max(6, P.level), tag: 'so' };
      poi.npcs = [folkFor(poi, rng, 0, 'object', P.rot + Math.PI, 3.2, { object: 'outpost:chest', model: 'strongbox' })];
    } else if (P.key === 'vault') {
      poi = { ...base, type: 'story', kind: 'vault', id: `p:${key}:vault`, r: P.r, tag: 'sv' };
      poi.npcs = [folkFor(poi, rng, 0, 'object', P.rot + Math.PI, 7.5, { object: 'vault:door', model: 'vaultdoor', facing: P.rot })];
    } else if (P.key === 'broodpits') {
      poi = { ...base, type: 'story', kind: 'broodpits', id: `p:${key}:broodpits`, r: P.r, tag: 'sbp' };
      // The way down, and (Act II) the nest-node the Matron's brood grew round the Array's call.
      poi.npcs = [
        folkFor(poi, rng, 0, 'object', P.rot, 3, { object: 'broodpits:mouth', model: 'broodmouth', facing: P.rot + Math.PI }),
        folkFor(poi, rng, 1, 'object', P.rot + 1.2, 6, { object: 'broodpits:node', model: 'console', facing: P.rot + 1.2 + Math.PI }),
      ];
    } else if (P.key === 'sporefield') {
      // A Hive nest grown round three spore pods (the Hive the quest asks you to kill live here,
      // whatever race holds the region), and Krell (if he was let go in Act I), whose crew the Hive
      // hit too.
      poi = { ...base, type: 'camp', id: `sc:${key}:spore`, radius: 12, race: 'hive', style: 'nest', level: 9, tag: 'ssf' };
      poi.npcs = [
        ...[0, 1, 2].map((i) => folkFor(poi, rng, i, 'object', P.rot + i * 2.1, 7, { object: `sporefield:pod${i + 1}`, model: 'sporepod' })),
        folkFor(poi, rng, 3, 'story', P.rot + 1.05, 4, { folk: 'krell', when: { quest: 'b2', flag: 'krell_freed' } }),
      ];
    } else if (P.key === 'psionnest') {
      // A Hive nest with a Psion at its head: the voice driving the swarms (Act II).
      poi = {
        ...base, type: 'camp', id: `sc:${key}:psion`, radius: 12, race: 'hive', style: 'nest', level: Math.max(12, P.level),
        boss: { type: 'psion', name: 'Hive Psion', tag: 'psion' }, tag: 'spn',
      };
      poi.npcs = [];
    } else if (P.key === 'array') {
      // The open apron in the middle is the ground to hold (`defend at: 'array'`); two consoles
      // the Wardens welded onto the Maker works on its city side (b4 powers down the first), the
      // transmitter under the dish (b9 destroys it).
      poi = { ...base, type: 'story', kind: 'array', id: `p:${key}:array`, r: P.r, tag: 'sa' };
      poi.npcs = [
        folkFor(poi, rng, 0, 'object', P.rot - 0.75, 7, { object: 'array:console', model: 'arrayconsole' }),
        folkFor(poi, rng, 1, 'object', P.rot + Math.PI, 6.5, { object: 'array:transmitter', model: 'transmitter', facing: P.rot }),
        folkFor(poi, rng, 2, 'object', P.rot + 0.75, 7, { object: 'array:console2', model: 'arrayconsole' }),
      ];
    } else if (P.key === 'titan') {
      // The kneeling titan (world/Landmarks.js titan), its control core's housing torn out and left
      // at its knees, in front, where the salvagers dropped it.
      poi = { ...base, type: 'landmark', id: `p:${key}:titan`, kind: 'titan', r: P.r, tag: 'stt' };
      poi.npcs = [folkFor(poi, rng, 0, 'object', P.rot, 8, { object: 'titan:core', model: 'titancore', facing: P.rot })];
    } else if (P.key === 'salvage') {
      // The Synths stripping the titan (Act III): a relay camp, whatever race holds the region.
      poi = { ...base, type: 'camp', id: `sc:${key}:salvage`, radius: 11, race: 'synth', style: 'relay', level: Math.max(19, P.level), tag: 'ssr' };
      poi.npcs = [];
    } else if (P.key === 'yard') {
      // Isa's yard: the cradle at the back, under the crane, facing the gap toward the city.
      poi = { ...base, type: 'story', kind: 'yard', id: `p:${key}:yard`, r: P.r, tag: 'sy', gate: P.rot };
      poi.npcs = [folkFor(poi, rng, 0, 'object', P.rot + Math.PI, 2.5, { object: 'yard:cradle', model: 'cradle', facing: P.rot })];
    } else if (P.key === 'relicdig') {
      poi = { ...base, type: 'story', kind: 'relicdig', id: `p:${key}:relicdig`, r: P.r, tag: 'sr' };
      poi.npcs = [folkFor(poi, rng, 0, 'story', P.rot, 4, { folk: 'chief' })];
    } else {
      poi = { ...base, type: 'story', kind: 'beacon', id: `p:${key}:${P.key}`, r: P.r, tag: `sb${P.key.slice(-1)}` };
      poi.npcs = [folkFor(poi, rng, 0, 'object', P.rot, 2.6, { object: `${P.key}:fire`, model: 'beacon' })];
    }
    out.push(poi);
  }
  return out;
}

// ---------------------------------------------------------------- finding things by name
// The nearest POI of `types` to (x, z) within `range`, optionally matching `pred`.
function nearest(world, x, z, range, types, pred = () => true) {
  let best = null;
  let bd = Infinity;
  for (const p of world.poisNear(x, z, range, types)) {
    if (!pred(p)) continue;
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}
const npcOf = (p, pred) => p?.npcs?.find(pred) ?? null;
// `rot`: which way a place (or a person) faces, for framing story moments (ui/Moments.js).
// `gate`: the bearing a place's only way in faces (a fenced yard), for what comes to attack it.
const target = (p, extra = {}) => p && { x: p.x, z: p.z, r: p.radius ?? p.r ?? 3, name: p.name, poi: p.id, rot: p.rot ?? 0, ...(p.gate !== undefined ? { gate: p.gate } : {}), ...extra };
const person = (n, place) => n && { x: n.x, z: n.z, r: 3, name: place?.name, npc: n.id, rot: n.facing ?? 0 };

// What a quest's reference names: { x, z, r, name, rot, npc?, poi?, camp? }, or null. `ctx.home`:
// the place a side quest belongs to (its village), for "home:…" references. The world is the same
// every time from its seed, so each is worked out once (quest markers ask every frame).
export function storyRef(world, ref, ctx = {}) {
  if (!ref || typeof ref !== 'string') return null;
  const cache = (world.gen._refs ??= new Map());
  const key = ctx.home ? `${ctx.home}|${ref}` : ref;
  if (cache.has(key)) return cache.get(key);
  const out = resolve(world, ref, ctx);
  // Found, it's kept. Not found is kept too for the refs worked out from the seed alone (searching
  // again every frame would cost a hitch each time); others may yet turn up as the world streams.
  if (out || SEEDED.has(ref)) cache.set(key, out);
  return out;
}
const SEEDED = new Set(['ironstone', 'ironhamlet']);

function resolve(world, ref, ctx) {
  const gen = world.gen;
  const fixed = world.npcById?.(ref);
  if (fixed) return { x: fixed.x, z: fixed.z, r: 3, name: fixed.name, npc: fixed.id, rot: fixed.facing ?? 0 };
  const [head, tail] = ref.split(':');
  if (ref === 'hub') return { x: 0, z: 0, r: 30, name: 'Brightwater', poi: 'hub' };
  if (ref === 'hub:waystone') return { x: 0, z: 18, r: 4, name: 'Brightwater waystone', poi: 'w-hub' };
  if (head === 'hub') {
    const hub = world.poiById('hub');
    return person(npcOf(hub, (n) => n.role === tail), hub);
  }
  if (/^city\d$/.test(head)) {
    const c = gen.cities()[Number(head.slice(4)) - 1];
    if (!c) return null;
    const heart = gen.region(c.rx, c.rz).pois.find((p) => p.type === 'city');
    if (!tail) return { x: c.x, z: c.z, r: CITY_WALL, name: c.name, poi: heart?.id };
    // The raid gate, in the city's gate yard (world/places.js planCity).
    if (tail === 'raidgate') {
      const yard = gen.region(c.rx, c.rz).pois.find((p) => p.type === 'district' && p.kind === 'gates' && p.city === heart?.id);
      return person(npcOf(yard, (n) => n.role === 'gate' && n.gate === 'raid'), yard);
    }
    return person(npcOf(heart, (n) => n.role === tail || n.folk === tail), heart);
  }
  const S = storyPlaces(gen)[head];
  if (S) {
    const poi = gen.region(S.rx, S.rz).pois.find((p) => p.story === head);
    if (!poi) return null;
    if (!tail) return target(poi, poi.type === 'camp' ? { camp: poi.id, r: poi.radius } : {});
    const n = npcOf(poi, (m) => m.object === ref || m.folk === tail);
    return n ? person(n, poi) : null;
  }
  // The village Ironjaw's raiders burned: the nearest to Brightwater (or, failing one, a hamlet).
  if (head === 'raided') {
    const v = nearest(world, 0, 0, 700, ['settlement']) ?? nearest(world, 0, 0, 700, ['hamlet']);
    if (!tail) return target(v);
    return person(npcOf(v, (n) => n.role === 'trader') ?? npcOf(v, (n) => n.role === 'giver') ?? npcOf(v, (n) => n.role === 'flavor'), v);
  }
  // The three hamlets out past Farcall that stopped answering (Act II): the nearest to the city.
  if (/^quiet[123]$/.test(head)) {
    const c = gen.cities()[1];
    if (!c) return null;
    const near = world.poisNear(c.x, c.z, 1400, ['hamlet']).sort((a, b) => Math.hypot(a.x - c.x, a.z - c.z) - Math.hypot(b.x - c.x, b.z - c.z));
    return target(near[Number(head.slice(5)) - 1]) ?? null;
  }
  // Act III round Ironreach: the waystone the Synth scouts scan, and where the emissary speaks
  // (the nearest to the city outside its walls), and the settlement the first war-walker marches
  // on (the nearest with a road a walker can come down: sim/Routes.js).
  if (head === 'ironstone' || head === 'ironhamlet') {
    const c = gen.cities()[2];
    if (!c) return null;
    const by = (a, b) => Math.hypot(a.x - c.x, a.z - c.z) - Math.hypot(b.x - c.x, b.z - c.z);
    if (head === 'ironstone') {
      // Out in the open: not a village's or town's own square (the scouts would be fought among
      // its folk, and it could be the walker's settlement too).
      const inSquare = (p) => world.poisNear(p.x, p.z, 120, ['hamlet', 'settlement', 'town']).some((s) => Math.hypot(s.x - p.x, s.z - p.z) < (s.r ?? 12) + 10);
      const stones = world.poisNear(c.x, c.z, 1400, ['waystone']).filter((p) => Math.hypot(p.x - c.x, p.z - c.z) > CITY_WALL && !inSquare(p)).sort(by);
      return target(stones[0], { r: 4 }) ?? null;
    }
    const homes = world.poisNear(c.x, c.z, 1400, ['hamlet', 'settlement', 'town']).sort(by);
    return target(homes.find((p) => roadRoute(gen, p))) ?? null;
  }
  if (ref === 'hubcamp') return target(nearest(world, 0, 0, 500, ['camp'], (c) => !c.stronghold && !c.story), { camp: true });
  if (head === 'home' && ctx.home) {
    const home = world.poiById(ctx.home);
    if (!home) return null;
    if (!tail) return target(home);
    if (tail === 'giver') return person(npcOf(home, (n) => n.role === 'giver'), home);
    if (tail === 'camp') {
      const c = nearest(world, home.x, home.z, 520, ['camp'], (p) => !p.stronghold && !p.story);
      return c && target(c, { camp: c.id, r: c.radius });
    }
    if (tail === 'next' || tail === 'next-trader') {
      const n = nearest(world, home.x, home.z, 900, ['settlement', 'town'], (p) => p.id !== home.id);
      if (!n) return null;
      return tail === 'next' ? target(n) : person(npcOf(n, (m) => m.role === 'trader'), n);
    }
    return person(npcOf(home, (n) => n.object === `home:${tail}` || n.object === tail), home);
  }
  return null;
}
// For tests and tools: every story place's resolved target.
export const storyKeys = () => [...ORDER];
export { TAU as _TAU };
