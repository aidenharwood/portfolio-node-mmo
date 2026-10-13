import { VILLAGE_OBJECTS } from '../rpg/sidequests.js';

// Settlements of every size: hamlets, villages (the kits in world/Gen.js SETTLEMENTS), towns and
// the four story cities. With the world generator (world/Gen.js) this decides where each place's
// folk and services stand — traders, Warden posts, inns, workshops, quest boards, city gates — so
// the server (which checks who stands where) and every screen agree. world/Towns.js builds the
// buildings round them, keeping clear the streets the roads come in by.
//   roles   flavor · giver (a hamlet's side-quest giver) · trader (stock: all, weapons, armor) ·
//           warden (contracts) · innkeeper (rest; respawn here) · smith (the workshop: talent
//           resets) · board (a quest board) · gate (a city's sealed dungeon or raid gate) ·
//           warroom (a city's raid board)
// Angles are world bearings (0 = +z, as polar() below); a place's `rot` faces its front.
const TAU = Math.PI * 2;
export const SIZES = {
  hamlet: { r: 12, title: 'Hamlet' },
  village: { r: 18, title: 'Village' },
  town: { r: 31, title: 'Town' },
  city: { r: 26, title: 'City', district: 22, ring: 52 },
};
// A city's walls: round its districts.
export const CITY_WALL = SIZES.city.ring + SIZES.city.district + 8;

// One city at the heart of each act's lands (docs/GAMEPLAY_PLAN.md: the story), at about the
// distance (so the level) the act is played at.
export const CITIES = [
  { act: 1, name: 'New Meridian', dist: 560, blurb: 'The settlers\' capital: markets, the Wardens\' high command, and the gates to what lies below.' },
  { act: 2, name: 'Farcall', dist: 1450, blurb: 'A city of signal masts on the edge of the Hive\'s country.' },
  { act: 3, name: 'Ironreach', dist: 2500, blurb: 'A foundry city in the highlands, built on the bones of the old war.' },
  { act: 4, name: 'Anchorage', dist: 3400, blurb: 'The last city before the Tether, in the shadow of the anchor.' },
];

const TOWN_A = ['High', 'Salt', 'Copper', 'Dun', 'Grey', 'Hollow', 'Red', 'Stone', 'Lark', 'Ash', 'North', 'Cinder', 'Tallow', 'Wind', 'Fair',
  'Low', 'Brass', 'Ember', 'Iron', 'Silver', 'Glen', 'Oak', 'Brook', 'Thorn'];
const TOWN_B = ['water', 'march', 'ton', 'more', 'wall', 'gate', 'bridge', 'ford', 'haven', 'wick', 'stead', 'field', 'crest', 'by', 'mere', 'hold'];
const HAMLET_A = ['Okafor', 'Lindqvist', 'Tanaka', 'Moreau', 'Vasquez', 'Brennan', 'Adeyemi', 'Kowal', 'Harrow', 'Iversen', 'Sato', 'Delacroix',
  'Mbeki', 'Novak', 'Quill', 'Ferro'];
const HAMLET_B = ['Rest', 'Corner', 'Hollow', 'End', 'Patch', 'Holding', 'Steading', 'Croft'];

// Hamlet styles by biome: a farm's cottages, a prospector's shacks, reed huts on stilts, nomad
// tents. `outfit` dresses their folk like the matching village kit's (world/settlements.js).
export const HAMLETS = {
  farm: { biomes: { meadow: 1.4, forest: 1.2, highland: 0.8, jungle: 0.6, fungal: 0.5, snow: 0.4 }, outfit: 'homestead' },
  prospect: { biomes: { badlands: 1.2, crystal: 1.2, mountain: 1, ash: 1, snow: 0.8, highland: 0.6 }, outfit: 'mining' },
  fen: { biomes: { marsh: 2, jungle: 1, fungal: 1 }, outfit: 'stilts' },
  nomad: { biomes: { desert: 2, badlands: 0.6, ash: 0.5 }, outfit: 'caravan' },
};

const polar = (a, d) => [Math.sin(a) * d, Math.cos(a) * d];
const pickOf = (rng, list) => list[Math.floor(rng() * list.length)];

export const hamletName = (rng) => `${pickOf(rng, HAMLET_A)}'s ${pickOf(rng, HAMLET_B)}`;
export const townName = (rng) => pickOf(rng, TOWN_A) + pickOf(rng, TOWN_B);

// One of a place's folk: `role` (and extras such as a trader's stock) at bearing `a`, `d` metres
// from the place's centre, facing it. Ids are the region's key and the place's tag.
function folk(place, rng, n, role, a, d, extra = {}) {
  const [lx, lz] = polar(a, d);
  return { id: `n:${place.key}:${place.tag}${n}`, place: place.id, role, x: place.x + lx, z: place.z + lz, facing: a + Math.PI, seed: Math.floor(rng() * 1e9), ...extra };
}

export const folkFor = folk;

// The High Warden of each story city (the rest of the folk take names from their seeds).
export const HIGH_WARDENS = ['High Warden Ashe', 'High Warden Imre', 'High Warden Tal', 'High Warden Sela'];

// `n` bearings in the gaps between `streets` (bearings), each at least `clear` off any street:
// every gap gets its share by size, spread evenly inside it.
export function between(streets, n, clear = 0.42) {
  if (!streets.length) return Array.from({ length: n }, (_, i) => (i / n) * TAU + 0.4);
  const s = streets.map((a) => ((a % TAU) + TAU) % TAU).sort((a, b) => a - b);
  const gaps = s.map((a, i) => ({ from: a, size: (i + 1 < s.length ? s[i + 1] : s[0] + TAU) - a }));
  const room = gaps.map((g) => Math.max(0.02, g.size - 2 * clear));
  const total = room.reduce((t, r) => t + r, 0);
  const share = room.map((r) => (r / total) * n);
  const k = share.map(Math.floor);
  let left = n - k.reduce((t, v) => t + v, 0);
  for (const [, i] of share.map((v, i) => [v - Math.floor(v), i]).sort((a, b) => b[0] - a[0])) {
    if (left-- <= 0) break;
    k[i]++;
  }
  const out = [];
  gaps.forEach((g, i) => {
    const c = Math.min(clear, g.size / 2);
    for (let j = 0; j < k[i]; j++) out.push(g.from + c + (Math.max(0, g.size - 2 * c) * (j + 0.5)) / k[i]);
  });
  return out;
}

// Pushes bearings apart until neighbours are at least `min` apart (buildings that would touch).
export function spread(list, min) {
  const out = list.map((a, i) => ({ a: ((a % TAU) + TAU) % TAU, i })).sort((p, q) => p.a - q.a);
  for (let it = 0; it < 8 && out.length > 1; it++) {
    for (let j = 0; j < out.length; j++) {
      const p = out[j];
      const q = out[(j + 1) % out.length];
      const gap = j + 1 < out.length ? q.a - p.a : q.a + TAU - p.a;
      if (gap >= min) continue;
      p.a -= (min - gap) / 2;
      q.a += (min - gap) / 2;
    }
  }
  const back = [];
  for (const p of out) back[p.i] = p.a;
  return back;
}

// ---------------------------------------------------------------- hamlets
// A few homes round a fire off the road: someone with a job for you, and a neighbour or two.
export function planHamlet(place, rng) {
  place.tag = 'h';
  const npcs = [folk(place, rng, 0, 'giver', place.rot + 0.6, 3.4)];
  const n = 1 + (rng() < 0.5 ? 1 : 0);
  for (let i = 1; i <= n; i++) npcs.push(folk(place, rng, i, 'flavor', place.rot + [4.0, 5.6][i - 1], 3.2 + rng() * 1.5));
  place.npcs = npcs;
}

// ---------------------------------------------------------------- villages
// The village kits keep the folk they always had; each now also has a trader (if it had none), a
// neighbour or two more, and a quest board by the plaza — inside the kit's open front.
export function dressVillage(place, rng) {
  place.tag = 'v';
  if (!place.npcs.some((n) => n.role === 'trader')) place.npcs.push(folk(place, rng, 0, 'trader', place.rot + 0.15, 5.5));
  // The first newcomer is the one with a job for you (the village's side chain, rpg/sidequests.js).
  const n = 1 + (rng() < 0.6 ? 1 : 0);
  for (let i = 1; i <= n; i++) place.npcs.push(folk(place, rng, i, i === 1 ? 'giver' : 'flavor', place.rot + [0.85, 3.9][i - 1], 4 + rng() * 1.2));
  place.npcs.push(folk(place, rng, 9, 'board', place.rot - 0.6, 7.2, { facing: place.rot }));
  // The objects its chain needs (no draws on `rng`: what's generated after stays where it was).
  (VILLAGE_OBJECTS[place.kind] ?? []).forEach(([object, la, d, model], j) => {
    const a = place.rot + la;
    place.npcs.push({
      id: `n:${place.key}:v${20 + j}`, place: place.id, role: 'object', object, model, x: place.x + Math.sin(a) * d, z: place.z + Math.cos(a) * d, facing: a + Math.PI, seed: 0,
    });
  });
}

// ---------------------------------------------------------------- towns
// Round the waystone's plaza: the market (weapon and armour traders at their stalls) and the quest
// board; on the inner ring the inn, the workshop and the Warden post, each with its keeper at the
// door; houses on the outer ring, walls round it all, gates where the roads come in. Townsfolk
// stand about the ring street. `streets`: the bearings the roads leave by.
export const TOWN = { stall: 6.4, board: 6.8, door: 10, service: 15, street: 19.5, house: 25 };
export function planTown(place, rng, streets) {
  place.tag = 't';
  place.streets = streets;
  const [inn, workshop, post, market, board] = spread(between(streets, 5, 0.5), 0.75);
  place.services = { inn, workshop, post, market, board };
  const n = [
    folk(place, rng, 0, 'innkeeper', inn, TOWN.door),
    folk(place, rng, 1, 'smith', workshop, TOWN.door),
    folk(place, rng, 2, 'warden', post, TOWN.door),
    folk(place, rng, 3, 'trader', market - 0.36, TOWN.stall, { stock: 'weapons' }),
    folk(place, rng, 4, 'trader', market + 0.36, TOWN.stall, { stock: 'armor' }),
    folk(place, rng, 5, 'board', board, TOWN.board),
  ];
  const k = 4 + Math.floor(rng() * 4);
  between(streets, k, 0.3).forEach((a, i) => n.push(folk(place, rng, 6 + i, 'flavor', a + (rng() - 0.5) * 0.15, TOWN.street + (rng() - 0.5) * 1.2)));
  // The Wardens' waygate on the plaza, before the workshop: the way down into the dungeons, as a
  // private run (gameplay phase 5). (Placed without drawing from `rng`, so nothing after it moves.)
  const [gx, gz] = polar(workshop, 7.4);
  n.push({ id: `n:${place.key}:t20`, place: place.id, role: 'gate', gate: 'dungeon', x: place.x + gx, z: place.z + gz, facing: workshop + Math.PI, seed: 0 });
  place.npcs = n;
}

// ---------------------------------------------------------------- cities
// A city: its heart (the waystone's plaza, with the Warden citadel, the inn, a quest board and the
// war table where raids are planned) and four districts round it between the roads — the market
// (weapon, armour and general traders), the crafts quarter (the workshop), the homes, and the gate
// yard (the sealed dungeon and raid gates). Each district is a point of interest of its own, so a
// city is built a district at a time as it streams in.
export const DISTRICTS = ['market', 'crafts', 'homes', 'gates'];
export const DISTRICT_TITLE = { market: 'Market', crafts: 'Crafts Quarter', homes: 'Homes', gates: 'Gate Yard' };
export const CITY = { board: 7.5, door: 13.5, hall: 19.5, folk: 11 };
export function planCity(place, rng, streets) {
  place.tag = 'c';
  place.streets = streets;
  const S = SIZES.city;
  const [citadel, inn, board, war] = spread(between(streets, 4, 0.42), 0.9);
  place.services = { citadel, inn, board, war };
  place.npcs = [
    folk(place, rng, 0, 'warden', citadel, CITY.door, { name: HIGH_WARDENS[place.act - 1] }),
    folk(place, rng, 1, 'innkeeper', inn, CITY.door),
    folk(place, rng, 2, 'board', board, CITY.board),
    folk(place, rng, 3, 'warroom', war, CITY.board),
    ...between(streets, 3, 0.3).map((a, i) => folk(place, rng, 4 + i, 'flavor', a + 0.45, CITY.folk + rng() * 1.5)),
  ];
  // Districts between the roads, kept from overlapping (each spans ~0.85 radians of the ring).
  const at = spread(between(streets, DISTRICTS.length, 0.5), 2 * Math.asin(S.district / S.ring) + 0.06);
  place.quarters = at;
  return DISTRICTS.map((kind, k) => {
    const [lx, lz] = polar(at[k], S.ring);
    const d = {
      type: 'district', id: `d:${place.key}:${k}`, kind, city: place.id, name: `${place.name} ${DISTRICT_TITLE[kind]}`, cityName: place.name,
      x: place.x + lx, z: place.z + lz, r: S.district, rot: at[k] + Math.PI, key: place.key, tag: `d${k}.`, level: place.level, h: place.h,
      seed: Math.floor(rng() * 1e9),
    };
    const out = [];
    // One at a time: each takes the next id.
    const add = (role, la, ld, extra) => out.push(folk(d, rng, out.length, role, d.rot + la, ld, extra));
    if (kind === 'market') {
      add('trader', -0.55, 6.5, { stock: 'weapons' });
      add('trader', 0.55, 6.5, { stock: 'armor' });
      add('trader', Math.PI, 6.5, { stock: 'all' });
    } else if (kind === 'crafts') add('smith', Math.PI, 7);
    else if (kind === 'gates') {
      add('gate', Math.PI - 0.68, 10, { gate: 'dungeon' });
      add('gate', Math.PI + 0.68, 10, { gate: 'raid' });
    }
    // Folk about the square's sides (its back holds the workshop, or the gates).
    const sides = kind === 'homes' ? [1.4, -1.4, 2.4, -2.4] : [1.45, -1.45];
    for (const la of sides) add('flavor', la + (rng() - 0.5) * 0.2, 8.5 + rng() * 1.5);
    d.npcs = out;
    return d;
  });
}

// ---------------------------------------------------------------- Brightwater
// The hub grew into a town. Its old camp is the plaza — the reactor (rest), Tobbin's kiosk, Warden
// Maren and Old Ysolde (world/mapData.js) — and round it, between the roads, stand the workshop,
// the gunsmith's and the armourer's (each keeper at the door), a quest board, and townsfolk.
export const HUB_RING = { board: 15.5, door: 18, shop: 23, house: 25.5 };
export function planHub(place, rng, streets) {
  place.key = '0,0';
  place.tag = 'b';
  place.streets = streets;
  const [workshop, guns, armour, board] = spread(between(streets, 4, 0.5), 0.8);
  place.services = { workshop, guns, armour, board };
  place.npcs = [
    folk(place, rng, 0, 'smith', workshop, HUB_RING.door),
    folk(place, rng, 1, 'trader', guns, HUB_RING.door, { stock: 'weapons' }),
    folk(place, rng, 2, 'trader', armour, HUB_RING.door, { stock: 'armor' }),
    folk(place, rng, 3, 'board', board, HUB_RING.board),
    ...between([...streets, workshop, guns, armour, board], 4, 0.3).map((a, i) => folk(place, rng, 4 + i, 'flavor', a, HUB_RING.door + (rng() - 0.5))),
  ];
  // The Wardens' waygate, before the workshop (as in every town).
  const [gx, gz] = polar(workshop, 12.5);
  place.npcs.push({ id: 'n:0,0:b20', place: place.id, role: 'gate', gate: 'dungeon', x: place.x + gx, z: place.z + gz, facing: workshop + Math.PI, seed: 0 });
}

// Bearing of a road leaving (x, z), from where it is `at` metres out (or its far end).
export function pathBearing(x, z, pts, at = 18) {
  const p = pts.find(([px, pz]) => Math.hypot(px - x, pz - z) > at) ?? pts[pts.length - 1];
  return Math.atan2(p[0] - x, p[1] - z);
}
