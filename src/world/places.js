import { VILLAGE_OBJECTS } from '../rpg/sidequests.js';
import { plotOf, plotFrom } from './plots.js';
import { streetPlan } from './streets.js';

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
  campsite: { r: 10, title: 'Campsite' },
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

// ---------------------------------------------------------------- plots
// The ground each kind of settlement stands on (world/plots.js): its shape, inside the radius the
// generator keeps clear for it, leaving room round its middle for the folk and services that stand
// on rings there. Its pads, its walls and (where they're laid out by it) its buildings follow it.
export const hamletPlot = (p) => plotOf(p, { R: p.r, shapes: 'hamlet', inner: 5.5 });
export const villagePlot = (p) => plotOf(p, { R: p.r, shapes: 'hamlet', inner: 9.5 });
export const campsitePlot = (p) => plotOf(p, { R: p.r, shapes: 'campsite', inner: 5.5 });
// (A town's walls stand further out than its old round wall did, where its corners reach: still
// inside the ground the generator keeps clear round it, its radius + 12.)
export const townPlot = (p) => plotOf(p, { R: p.r + 10, shapes: 'town', inner: TOWN.house + 2 });
// (A city's wall: a many-sided ring of straight runs, just outside where its round wall stood.)
export const cityPlot = (p) => plotOf({ id: p.cityId ?? p.id, seed: p.seed }, { R: p.wall + 6, shapes: { blob: 1 }, inner: p.wall + 1 });
export const hubPlot = (hub) => plotOf({ id: 'hub', seed: 0x5eed }, { R: hub.radius + 4, shapes: 'town', inner: hub.radius - 6 });

// ---------------------------------------------------------------- campsites
// Travellers stopped for the night: who they are (by the land), what they're called, and the two
// or three of them round the fire — now and then one with goods to sell.
export const CAMPSITES = {
  wayfarers: { title: 'Wayfarers\' Camp', outfit: 'caravan' },
  hunters: { title: 'Hunters\' Camp', outfit: 'homestead' },
  prospectors: { title: 'Prospectors\' Camp', outfit: 'mining' },
  pilgrims: { title: 'Pilgrims\' Camp', outfit: 'stilts' },
};
const CAMPSITE_BY_BIOME = {
  meadow: 'wayfarers', forest: 'hunters', highland: 'hunters', snow: 'hunters', marsh: 'pilgrims', ash: 'prospectors',
  mountain: 'prospectors', desert: 'wayfarers', badlands: 'prospectors', jungle: 'hunters', crystal: 'pilgrims', fungal: 'pilgrims',
};
const CAMP_A = ['Ember', 'Dusk', 'Long', 'Quiet', 'Last', 'Low', 'Cold', 'Far', 'Lantern', 'Ash', 'Wren', 'Thistle'];
const CAMP_B = ['Fire', 'Rest', 'Hearth', 'Stop', 'Bivouac', 'Night'];
export const campsiteKind = (biome, rng) => (rng() < 0.7 ? CAMPSITE_BY_BIOME[biome] ?? 'wayfarers' : pickOf(rng, Object.keys(CAMPSITES)));
export const campsiteName = (rng) => `${pickOf(rng, CAMP_A)} ${pickOf(rng, CAMP_B)}`;

export function planCampsite(place, rng) {
  place.tag = 'w';
  const n = 2 + (rng() < 0.4 ? 1 : 0);
  const npcs = [];
  for (let i = 0; i < n; i++) {
    const role = i === 0 && rng() < 0.35 ? 'trader' : 'flavor';
    npcs.push(folk(place, rng, i, role, place.rot + (i / n) * Math.PI * 2 + 0.4, 2.6 + rng() * 0.6, role === 'trader' ? { stock: 'all' } : {}));
  }
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
// A town's street plan (world/streets.js): its streets, plaza and lots, on its plot.
const plans = new Map();
export function townPlan(place) {
  let plan = plans.get(place.id);
  if (!plan) {
    if (plans.size > 400) plans.clear();
    plans.set(place.id, (plan = streetPlan({ plot: townPlot(place), seed: place.seed ?? 1 })));
  }
  return plan;
}

// One of a place's folk at local (lx, lz), facing bearing `facing`.
function folkAt(place, rng, n, role, lx, lz, facing, extra = {}) {
  return { id: `n:${place.key}:${place.tag}${n}`, place: place.id, role, x: place.x + lx, z: place.z + lz, facing, seed: Math.floor(rng() * 1e9), ...extra };
}

// The services' lots: those fronting the plaza that no road comes in across, the rest after.
function serviceLots(plan, streets, n) {
  const off = (l) => Math.min(Math.PI, ...streets.map((a) => Math.abs(Math.atan2(Math.sin(Math.atan2(l.x, l.z) - a), Math.cos(Math.atan2(l.x, l.z) - a)))));
  const order = [...plan.plazaLots].sort((p, q) => off(q) - off(p));
  const rest = plan.lots.filter((l) => l.kind === 'street').sort((p, q) => Math.hypot(p.x, p.z) - Math.hypot(q.x, q.z));
  return [...order, ...rest].slice(0, n);
}

export function planTown(place, rng, streets) {
  place.tag = 't';
  place.streets = streets;
  const plan = townPlan(place);
  // The inn, the workshop and the Warden post on the plaza, each its keeper at the door.
  const [inn, workshop, post] = serviceLots(plan, streets, 3);
  const P = plan.plaza;
  const side = (u, v) => plan.fromUV(u, v);
  const lot = (l) => ({ x: l.x, z: l.z, ry: l.ry, wd: l.wd, dp: l.dp });
  // The market: the gunsmith's and the armourer's stalls along the side of the plaza away from the
  // workshop, facing in; the quest board at one corner of it.
  const [wu, wv] = plan.toUV(workshop.x, workshop.z);
  const mside = Math.abs(wu) > Math.abs(wv) ? ['u', -Math.sign(wu)] : ['v', -Math.sign(wv)];
  const inward = (d) => {
    const [x, z] = mside[0] === 'u' ? plan.fromUV(-mside[1], 0) : plan.fromUV(0, -mside[1]);
    return Math.atan2(x, z) + d;
  };
  const edgeAt = (along, inset) => (mside[0] === 'u' ? side(mside[1] * (P.hu - inset), along) : side(along, mside[1] * (P.hv - inset)));
  const [t1x, t1z] = edgeAt(-5.2, 3.6);
  const [t2x, t2z] = edgeAt(5.2, 3.6);
  const [bx, bz] = edgeAt(-P.hu + 2.2, 1.6);
  place.services = { inn: lot(inn), workshop: lot(workshop), post: lot(post) };
  const door = (l) => plan.front(l, 1.1);
  const n = [
    folkAt(place, rng, 0, 'innkeeper', ...door(inn), inn.ry),
    folkAt(place, rng, 1, 'smith', ...door(workshop), workshop.ry),
    folkAt(place, rng, 2, 'warden', ...door(post), post.ry),
    folkAt(place, rng, 3, 'trader', t1x, t1z, inward(0), { stock: 'weapons' }),
    folkAt(place, rng, 4, 'trader', t2x, t2z, inward(0), { stock: 'armor' }),
    folkAt(place, rng, 5, 'board', bx, bz, inward(0.5)),
  ];
  // Townsfolk about the streets (the same draws as ever, so nothing after them moves).
  const k = 4 + Math.floor(rng() * 4);
  const ways = plan.streets.length ? plan.streets : [{ dir: 'u', o: 0, u0: -P.hu, u1: P.hu, v0: -1, v1: 1 }];
  for (let i = 0; i < k; i++) {
    const s = ways[i % ways.length];
    // (Out along the street, either end, rather than in the plaza.)
    const t = i % 2 ? 0.6 + rng() * 0.33 : 0.07 + rng() * 0.33;
    const off = (rng() - 0.5) * 2.4;
    const [x, z] = plan.along(s, t, off);
    n.push(folkAt(place, rng, 6 + i, 'flavor', x, z, s.dir === 'u' ? plan.axis + (i % 2 ? 0 : Math.PI) : plan.axis + Math.PI / 2 + (i % 2 ? 0 : Math.PI)));
  }
  // The Wardens' waygate on the plaza, before the workshop: the way down into the dungeons, as a
  // private run (gameplay phase 5). (Placed without drawing from `rng`, so nothing after it moves.)
  const [gx, gz] = plan.front(workshop, 4.2);
  n.push({ id: `n:${place.key}:t20`, place: place.id, role: 'gate', gate: 'dungeon', x: place.x + gx, z: place.z + gz, facing: workshop.ry, seed: 0 });
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
export const CITY = { board: 7.5, door: 13.5, hall: 19.5, folk: 11, heart: 22.5, block: 18 };

// A city's grid: its avenues run along and across the axis of its walls' plot (world/plots.js),
// from wall to wall; its heart is a square round the waystone where they cross, and its four
// districts squares out along them, each laid out on a street plan of its own aligned to the same
// grid (the avenue its main street); the quarters between hold the terraces backed on the walls.
const square = (cx, cz, half, axis) => {
  const s = Math.sin(axis);
  const c = Math.cos(axis);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => [cx + (u * s + v * c) * half, cz + (u * c - v * s) * half]);
};
export const cityAxis = (place) => cityPlot(place).rot;
export const cityHeartPlot = (place) => plotFrom(square(0, 0, CITY.heart, cityAxis(place)));
export const districtPlot = (d) => plotFrom(square(0, 0, CITY.block, d.axis));
const cityPlans = new Map();
const planned = (key, make) => {
  let plan = cityPlans.get(key);
  if (!plan) {
    if (cityPlans.size > 400) cityPlans.clear();
    cityPlans.set(key, (plan = make()));
  }
  return plan;
};
// The heart's plan: the plaza, the citadel's and the inn's great lots on it, halls round it.
export const cityHeartPlan = (place) => planned(place.id, () => streetPlan({ plot: cityHeartPlot(place), axis: cityAxis(place), seed: place.seed ?? 1, plaza: 9, service: [14, 9], lot: [9, 7.5], edge: false, margin: 0.8 }));
// A district's: its square, with lots round it and down its lanes.
// (Its square sized to its use — the market's for stalls, the homes' a green, the gate yard's wide
// for its two great gates — and only the crafts quarter's with a great lot on it, for its workshop.)
const DISTRICT_SQUARE = { market: 7, crafts: 7, homes: 5, gates: 8.5 };
export const districtPlan = (d) => planned(d.id, () => streetPlan({
  plot: districtPlot(d), axis: d.axis, seed: d.seed ?? 1, plaza: DISTRICT_SQUARE[d.kind] ?? 6, street: 5, service: [11.5, 8], lot: [7.2, 6.5],
  edge: true, cross: false, plazaRow: d.kind === 'crafts',
}));
// The terraces backed against a city's walls, and nothing else (its wall's plot: edge lots only).
export const cityWallPlan = (place) => planned(`${place.cityId ?? place.id}|wall`, () => streetPlan({ plot: cityPlot(place), axis: cityAxis(place), seed: place.seed ?? 1, streets: false, plaza: 0, lot: [9, 7.5] }));

// A city's avenues (local outlines, for paving): along and across its axis, from wall to wall,
// `w` wide.
export function cityAvenues(place, w = 8) {
  const axis = cityAxis(place);
  const s = Math.sin(axis);
  const c = Math.cos(axis);
  const L = place.wall - 3;
  const quad = (u0, u1, v0, v1) => [[u0, v0], [u1, v0], [u1, v1], [u0, v1]].map(([u, v]) => [u * s + v * c, u * c - v * s]);
  return [quad(-L, L, -w / 2, w / 2), quad(-w / 2, w / 2, -L, L)];
}

export function planCity(place, rng, streets) {
  place.tag = 'c';
  place.streets = streets;
  const S = SIZES.city;
  const axis = cityAxis(place);
  const heart = cityHeartPlan(place);
  // The citadel and the inn on the plaza, the High Warden and the innkeeper at their doors; the
  // board and the war table on the plaza between them.
  const [citadel, inn] = serviceLots(heart, [], 2);
  place.services = { citadel: { x: citadel.x, z: citadel.z, ry: citadel.ry, wd: citadel.wd, dp: citadel.dp }, inn: { x: inn.x, z: inn.z, ry: inn.ry, wd: inn.wd, dp: inn.dp } };
  const door = (l, out = 1.4) => heart.front(l, out);
  const P = heart.plaza;
  const [cu, cv] = heart.toUV(citadel.x, citadel.z);
  // Across the plaza from the citadel's side, the board and the war table, facing it.
  const back = Math.abs(cu) > Math.abs(cv) ? (t) => heart.fromUV(-Math.sign(cu) * (P.hu - 2.5), t) : (t) => heart.fromUV(t, -Math.sign(cv) * (P.hv - 2.5));
  const toward = (x, z) => Math.atan2(citadel.x - x, citadel.z - z);
  const [bx, bz] = back(-4.5);
  const [wx, wz] = back(4.5);
  place.npcs = [
    folkAt(place, rng, 0, 'warden', ...door(citadel), citadel.ry, { name: HIGH_WARDENS[place.act - 1] }),
    folkAt(place, rng, 1, 'innkeeper', ...door(inn), inn.ry),
    folkAt(place, rng, 2, 'board', bx, bz, toward(bx, bz)),
    folkAt(place, rng, 3, 'warroom', wx, wz, toward(wx, wz)),
  ];
  // Townsfolk about the heart's streets (the same draws as ever).
  for (let i = 0; i < 3; i++) {
    const s = heart.streets[i % Math.max(1, heart.streets.length)];
    const t = rng();
    const [x, z] = s ? heart.along(s, i % 2 ? 0.8 + t * 0.15 : 0.05 + t * 0.15, 1.5) : [0, 0];
    place.npcs.push(folkAt(place, rng, 4 + i, 'flavor', x, z, axis + (i % 2 ? 0 : Math.PI)));
  }
  // Farcall's captain of the watch (Act II; world/story.js STORY_FOLK), by the citadel door. Set
  // without a draw from `rng`, so the districts after keep the layouts they had.
  const [sx, sz] = heart.front(citadel, 1.4);
  const along = [Math.cos(citadel.ry) * 2.2, -Math.sin(citadel.ry) * 2.2];
  if (place.act === 2) {
    place.npcs.push({ id: `n:${place.key}:${place.tag}7`, place: place.id, role: 'story', folk: 'captain', x: place.x + sx + along[0], z: place.z + sz + along[1], facing: citadel.ry, seed: 0x0ce7a });
  }
  // Ironreach's foundrywright (Act III), on the same terms by the same door.
  if (place.act === 3) {
    place.npcs.push({ id: `n:${place.key}:${place.tag}7`, place: place.id, role: 'story', folk: 'engineer', x: place.x + sx + along[0], z: place.z + sz + along[1], facing: citadel.ry, seed: 0x15a3b });
  }
  // The districts out along the avenues, each facing the heart.
  const at = DISTRICTS.map((_, k) => axis + (k * Math.PI) / 2);
  place.quarters = at;
  return DISTRICTS.map((kind, k) => {
    const [lx, lz] = polar(at[k], S.ring);
    const d = {
      type: 'district', id: `d:${place.key}:${k}`, kind, city: place.id, name: `${place.name} ${DISTRICT_TITLE[kind]}`, cityName: place.name,
      x: place.x + lx, z: place.z + lz, r: S.district, rot: at[k] + Math.PI, axis, key: place.key, tag: `d${k}.`, level: place.level, h: place.h,
      seed: Math.floor(rng() * 1e9),
    };
    const plan = districtPlan(d);
    const Q = plan.plaza;
    // Its square's sides in the plan's frame: the one toward the heart and the one away from it.
    const [hu, hv] = plan.toUV(-lx, -lz);
    const away = Math.abs(hu) > Math.abs(hv) ? [-Math.sign(hu), 0] : [0, -Math.sign(hv)];
    const side = (o, t, inset) => (away[0] ? plan.fromUV(away[0] * (Q.hu - inset), t + o) : plan.fromUV(t + o, away[1] * (Q.hv - inset)));
    const facingIn = (x, z) => Math.atan2(-x, -z);
    const out = [];
    let n = 0;
    const add = (role, x, z, facing, extra) => out.push(folkAt(d, rng, n++, role, x, z, facing, extra));
    if (kind === 'market') {
      // Three stalls round the square, their traders facing in.
      for (const [o, stock] of [[-4, 'weapons'], [4, 'armor']]) {
        const [x, z] = side(o, 0, 3);
        add('trader', x, z, facingIn(x, z), { stock });
      }
      // The third on a side square to theirs.
      const [x, z] = away[0] ? plan.fromUV(0, Q.hv - 3) : plan.fromUV(Q.hu - 3, 0);
      add('trader', x, z, facingIn(x, z), { stock: 'all' });
    } else if (kind === 'crafts') {
      // The great workshop at the back of the square, the smith at its door.
      const lot = [...plan.plazaLots].sort((p, q) => Math.hypot(p.x - side(0, 0, -6)[0], p.z - side(0, 0, -6)[1]) - Math.hypot(q.x - side(0, 0, -6)[0], q.z - side(0, 0, -6)[1]))[0];
      d.services = { workshop: lot ? { x: lot.x, z: lot.z, ry: lot.ry, wd: lot.wd, dp: lot.dp } : null };
      const [x, z] = lot ? plan.front(lot, 1.2) : side(0, 0, 2);
      add('smith', x, z, lot ? lot.ry : facingIn(x, z));
    } else if (kind === 'gates') {
      // The sealed gates at the back of the square, facing in.
      // (On the square's two sides off its street, facing each other across it.)
      for (const [s, gate] of [[-1, 'dungeon'], [1, 'raid']]) {
        const [x, z] = plan.fromUV(0, s * (Q.hv - 1.2));
        add('gate', x, z, facingIn(x, z), { gate });
      }
    }
    // Folk about the square's sides and lanes (the same draws as ever).
    const sides = kind === 'homes' ? 4 : 2;
    for (let i = 0; i < sides; i++) {
      const s = plan.streets[i % Math.max(1, plan.streets.length)];
      const t = rng();
      const o = (rng() - 0.5) * 2;
      const [x, z] = s ? plan.along(s, i % 2 ? 0.75 + t * 0.2 : 0.05 + t * 0.2, o) : side(0, 0, 3);
      add('flavor', x, z, Math.atan2(-x, -z));
    }
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
