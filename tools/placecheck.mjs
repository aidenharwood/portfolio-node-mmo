// Check: settlements of every size (world/Gen.js, world/places.js) — how often each size turns up,
// where the four cities and the towns stand, the services each size offers — and the rules that
// use them, through the character's own rules as the server runs them (server/characters.js
// runOp, positions checked): an innkeeper's bed sets where you wake, a smith resets talents, the
// gunsmiths' and armourers' fine stock, and quests from a town's Warden, a hamlet's folk and a
// quest board — given, taken and handed in only where the giver stands.
// Run: node tools/placecheck.mjs [seed]
import * as THREE from 'three';
import { HeadlessWorld } from '../server/world.js';
import { runOp } from '../server/characters.js';
import { Stats } from '../src/rpg/Stats.js';
import { Inventory } from '../src/items/Inventory.js';
import { QuestLog } from '../src/rpg/Quests.js';
import { CharacterCore, stockFor, fineStockFor } from '../src/rpg/CharacterCore.js';
import { isArmor } from '../src/items/items.js';
import { CITIES, CITY_WALL, SIZES } from '../src/world/places.js';
import { HUB } from '../src/world/Gen.js';

const seed = Number(process.argv[2] ?? 12345);
const w = new HeadlessWorld(seed);
const gen = w.gen;
let failed = 0;
const check = (ok, what) => {
  if (!ok) failed++;
  console.log(`  ${ok ? '✓' : '✗'} ${what}`);
};
const roles = (p) => new Set((p.npcs ?? []).map((n) => n.role));

{
  const geometryWorld = new HeadlessWorld(seed);
  geometryWorld.addOrientedBox(100, 100, 2, 0.5, Math.PI / 4, 3, 0);
  check(geometryWorld.blocks({ x: 101.3, z: 98.7, y: 1 }), 'rotated building collision blocks its actual footprint');
  check(!geometryWorld.blocks({ x: 101.8, z: 101.8, y: 1 }), 'rotated building collision leaves its bounding-box corners clear');
  const mover = { x: 101.3, z: 98.7, y: 0.5 };
  geometryWorld.resolve(mover, 0.2, 0, 1.8);
  check(!geometryWorld.blocks(mover), 'rotated building collision resolves movers outside its walls');
}

const makeMapUi = async (region, hovered = { x: 400, y: 300 }) => {
  const canvas = {
    width: 800,
    height: 600,
    addEventListener() {},
    setPointerCapture() {},
    getContext: () => ({
      fillRect() {},
      strokeText() {},
      fillText() {},
      beginPath() {},
      arc() {},
      lineTo() {},
      moveTo() {},
      closePath() {},
      stroke() {},
      fill() {},
      save() {},
      restore() {},
      translate() {},
      rotate() {},
      rect() {},
      createImageData() { return { data: new Uint8ClampedArray(4) }; },
      putImageData() {},
      drawImage() {},
      clearRect() {},
    }),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
  };
  const info = { textContent: '' };
  const el = {
    classList: { contains: () => false, add() {}, remove() {} },
    querySelector: (sel) => sel === 'canvas' ? canvas : sel === '.map-info' ? info : null,
  };
  const game = {
    attuned: new Set(['w:dust']),
    discovery: { isKnown: () => true },
    world: { gen: { regionAt: () => region, region: () => region } },
    travelTo: (id) => { game.traveledTo = id; },
    customMarker: null,
    questWaypoint: () => null,
    tracked: null,
    quests: { defs: new Map() },
    partyUI: { mates: [] },
    player: { position: { x: 0, z: 0 }, facing: 0 },
    dungeonView: null,
    encounters: { isCleared: () => false },
    openedChests: new Set(),
  };
  const { MapUI } = await import('../src/ui/MapUI.js');
  const map = new MapUI(game, el);
  map.mouse = hovered;
  map.cx = 0;
  map.cz = 0;
  map.zoom = 1;
  map.regionsInView = () => [region];
  map.viewRect = () => [-100, -100, 100, 100];
  return { map, region };
};

// ---------------------------------------------------------------- how common, and where
console.log(`Settlements (seed ${seed}):`);
const R = 12;
const count = { hamlet: 0, settlement: 0, town: 0 };
const towns = [];
let regions = 0;
let bad = 0;
for (let rx = -R; rx <= R; rx++) {
  for (let rz = -R; rz <= R; rz++) {
    regions++;
    for (const p of gen.region(rx, rz).pois) {
      if (count[p.type] !== undefined) count[p.type]++;
      if (p.type === 'town') towns.push(p);
      const has = roles(p);
      if (p.type === 'settlement' && !(has.has('trader') && has.has('board'))) bad++;
      if (p.type === 'hamlet' && !has.has('giver')) bad++;
      if (p.type === 'town' && !['innkeeper', 'smith', 'warden', 'board'].every((r) => has.has(r))) bad++;
      if (p.type === 'town' && !['weapons', 'armor'].every((s) => p.npcs.some((n) => n.stock === s))) bad++;
    }
  }
}
const share = (n) => `${n} (${((n / regions) * 100).toFixed(0)}%)`;
check(count.hamlet / regions > 0.3, `hamlets are common: ${share(count.hamlet)} of ${regions} regions`);
check(count.settlement / regions > 0.25 && count.settlement / regions < 0.45, `villages at about a third of the regions: ${share(count.settlement)}`);
check(count.town / regions > 0.06 && count.town / regions < 0.14, `a town in about one region of nine: ${share(count.town)}`);
check(!bad, 'every village has a trader and a quest board; every hamlet, someone with a job; every town its inn, workshop, Warden post, gunsmith, armourer and board');
{
  // Every one of the folk (and every board and gate) has an id of its own: the server finds them by it.
  const ids = new Set();
  let twins = 0;
  for (let rx = -R; rx <= R; rx++) for (let rz = -R; rz <= R; rz++) for (const p of gen.region(rx, rz).pois) for (const n of p.npcs ?? []) twins += ids.has(n.id) ? 1 : (ids.add(n.id), 0);
  for (const c of gen.cities()) for (const p of gen.region(c.rx, c.rz).pois) for (const n of p.npcs ?? []) if (!ids.has(n.id)) ids.add(n.id);
  check(!twins, `every one of the ${ids.size} folk, boards and gates has an id of its own${twins ? ` (${twins} share one)` : ''}`);
}
let closest = Infinity;
for (const a of towns) for (const b of towns) if (a !== b) closest = Math.min(closest, Math.hypot(a.x - b.x, a.z - b.z));
check(closest > 80, `towns stand apart: the closest two are ${Math.round(closest)} m`);
const hub = gen.region(0, 0).pois.find((p) => p.type === 'hub');
check(['smith', 'board'].every((r) => roles(hub).has(r)) && hub.npcs.some((n) => n.stock === 'weapons') && hub.npcs.some((n) => n.stock === 'armor'), 'Brightwater is a town: a workshop, a gunsmith, an armourer and a quest board round the old camp');

{
  const region = {
    rx: 0, rz: 0, x: 0, z: 0, name: 'Dust Steppe', level: 5, hub: false, race: 'scav',
    pois: [
      { type: 'waystone', id: 'w:dust', x: 55, z: 0, name: 'Dust Steppe' },
      { type: 'settlement', x: 36, z: 8, key: 'sandsail', name: 'Sandsail Caravan', way: { x: 0, z: 0 } },
    ],
  };
  const { map } = await makeMapUi(region);
  const pois = map.pois();
  const regionNodes = pois.filter((p) => p.name === 'Dust Steppe' && (p.kind === 'location' || p.kind === 'waystone'));
  const caravan = pois.find((p) => p.kind === 'settlement' && p.name === 'Sandsail Caravan');
  check(!caravan?.id, 'unrelated settlements do not claim a region waystone');
  check(regionNodes.length === 1 && regionNodes[0].kind === 'location' && regionNodes[0].id === 'w:dust', 'Dust Steppe and its waystone share one map node');
  check(regionNodes[0]?.hoverDy === -50, 'the region hover label sits above the nameplate');
  check(map.pick(450, 270)?.kind === 'location', 'the full region nameplate has an expanded hitbox');
  map.mouse = { x: 400, y: 282 };
  const hit = map.pick(map.mouse.x, map.mouse.y);
  map.click();
  check(hit?.kind === 'location' && hit.active && map.game.traveledTo === 'w:dust', 'the named region label fast-travels through its waystone');
}

const cities = gen.cities();
check(cities.length === CITIES.length && cities.every((c, i) => c.name === CITIES[i].name && c.act === i + 1), 'four story cities, one for each act');
check(cities.every((c) => Math.abs(Math.hypot(c.x, c.z) - c.dist) < 700), `each about as far out as its act is played: ${cities.map((c) => `${c.name} ${Math.round(Math.hypot(c.x, c.z))} m`).join(', ')}`);
check(cities.every((c) => gen.flatness(c.x, c.z, [40]) < 12), 'each on open, level ground');
let cityBad = 0;
let inside = 0;
for (const c of cities) {
  const r = gen.region(c.rx, c.rz);
  const heart = r.pois.find((p) => p.type === 'city');
  const ds = r.pois.filter((p) => p.type === 'district');
  const all = new Set([...heart.npcs, ...ds.flatMap((d) => d.npcs)].map((n) => n.role));
  if (ds.length !== 4 || ds.some((d) => Math.hypot(d.x - c.x, d.z - c.z) + d.r > CITY_WALL)) cityBad++;
  if (!['warden', 'innkeeper', 'board', 'warroom', 'smith', 'gate', 'trader'].every((x) => all.has(x))) cityBad++;
  for (let dx = -2; dx <= 2; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      for (const p of gen.region(c.rx + dx, c.rz + dz).pois) {
        if (['camp', 'landmark', 'settlement', 'hamlet', 'town', 'waystone', 'mesa'].includes(p.type) && Math.hypot(p.x - c.x, p.z - c.z) < CITY_WALL + (p.radius ?? p.r ?? 0) + 2 && p.id !== `w:${c.rx},${c.rz}`) inside++;
      }
    }
  }
}
check(!cityBad, 'each city: its heart and four districts inside its walls, with a Warden, an inn, a board, the war table, a smith, the sealed gates and traders');
check(!inside, `nothing else stands within a city's walls${inside ? ` (${inside} do)` : ''}`);

// ---------------------------------------------------------------- the services, as the server checks them
console.log('Services:');
const town = [...towns].sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
const near = (role, p = town, extra = () => true) => p.npcs.find((n) => n.role === role && extra(n));
const position = new THREE.Vector3();
const stats = new Stats();
const host = { hud: null, world: w, encounters: { isCleared: () => false }, stats, player: { position } };
const quests = new QuestLog(host);
const core = new CharacterCore({
  stats, inventory: new Inventory(3), quests, attuned: new Set(['w-hub']), chests: new Set(), shop: { stock: [], fine: [] },
  settings: { lootFilter: 1 }, position, world: w, strict: true,
});
// Stand a couple of steps in front of one of the folk (or by a board).
const by = (n, d = 2) => position.set(n.x + Math.sin(n.facing) * d, 0, n.z + Math.cos(n.facing) * d);
const away = () => position.set(town.x + 400, 0, town.z + 400);
const op = (o) => runOp(core, { op: o });

const inn = near('innkeeper');
away();
check(!op({ op: 'rest', at: inn.id }).ok, 'no resting at an inn from across the map');
by(inn);
check(op({ op: 'rest', at: inn.id }).ok && core.settings.home === inn.id, `rest with ${town.name}'s innkeeper: you'll wake there now`);
check(core.shop.stock.length > 0 && core.shop.fine.length > 0, 'resting restocks the traders, the fine stock too');
check(!op({ op: 'rest', at: near('smith').id }).ok, 'a smith keeps no beds');
position.set(HUB.x + 1, 0, HUB.z + 2);
check(op({ op: 'rest' }).ok && core.settings.home === null, 'rest at Brightwater\'s reactor: home again');

stats.level = 12;
stats.gold = 5000;
for (const id of ['v_edge', 'v_edge', 'v_plate']) stats.learn(id);
away();
check(!op({ op: 'respec' }).ok, 'past level 10, no talent reset away from a workshop');
by(near('smith'));
const gold = stats.gold;
check(op({ op: 'respec' }).ok && stats.gold < gold && !Object.keys(stats.talents).length, `a smith resets them, for gold (${gold - stats.gold}g)`);

core.apply({ op: 'stock', roll: { stock: stockFor(12), fine: fineStockFor(12) } });
stats.gold = 1e6;
const fineAt = (armor) => core.shop.fine.findIndex((it) => isArmor(it) === armor);
// Brightwater's gunsmith and armourer keep shop on opposite sides of town (a town's stand side by
// side at its market, so either serves you there).
by(near('trader', hub, (n) => n.stock === 'weapons'));
check(!op({ op: 'buy', i: fineAt(true), fine: true }).ok, 'the gunsmith has no fine armour');
check(op({ op: 'buy', i: fineAt(false), fine: true }).ok, 'the gunsmith sells a fine weapon');
by(near('trader', town, (n) => n.stock === 'armor'));
check(op({ op: 'buy', i: fineAt(true), fine: true }).ok, `${town.name}'s armourer sells fine armour`);
const village = (() => {
  for (let r = 1; r < 8; r++) for (let rx = -r; rx <= r; rx++) for (let rz = -r; rz <= r; rz++) {
    const v = gen.region(rx, rz).pois.find((p) => p.type === 'settlement');
    if (v) return v;
  }
  return null;
})();
by(near('trader', village));
check(!op({ op: 'buy', i: 0, fine: true }).ok && op({ op: 'buy', i: 0 }).ok, `${village.name}'s trader sells the everyday stock, not the fine`);

// ---------------------------------------------------------------- quests from the folk
console.log('Quests:');
check(!op({ op: 'talk', npc: 'n:400,400:t0' }).ok && !gen.regions.has('400,400'), 'talking to someone far away is refused, without building their region');
const warden = near('warden');
by(warden);
const contract = op({ op: 'talk', npc: warden.id }).roll?.offer;
check(contract?.kind === 'contract' && contract.giver === warden.id && /^Warden \w+ at /.test(contract.from), `${town.name}'s Warden offers a contract: "${contract?.title}" (return to ${contract?.from})`);
away();
check(!op({ op: 'accept', id: contract.id }).ok, 'it can\'t be taken away from the Warden');
by(warden);
check(op({ op: 'accept', id: contract.id }).ok && quests.active[contract.id], 'taken at the Warden post');
core.apply({ op: 'camp', id: contract.target });
away();
check(!op({ op: 'turnin', id: contract.id }).ok, 'and handed in only there');
by(warden);
check(op({ op: 'turnin', id: contract.id }).ok && !quests.active[contract.id], 'contract done, paid');

const hamlet = (() => {
  for (let r = 1; r < 8; r++) for (let rx = -r; rx <= r; rx++) for (let rz = -r; rz <= r; rz++) {
    const h = gen.region(rx, rz).pois.find((p) => p.type === 'hamlet');
    if (h) return h;
  }
  return null;
})();
const giver = near('giver', hamlet);
by(giver);
const errand = op({ op: 'talk', npc: giver.id }).roll?.offer;
check(errand?.kind === 'errand' && errand.giver === giver.id && errand.title.startsWith(hamlet.name), `${hamlet.name} has an errand: "${errand?.title}"`);
check(op({ op: 'accept', id: errand.id }).ok, 'taken');
const o = errand.objectives[0];
if (o.type === 'clear') core.apply({ op: 'camp', id: o.camp });
else for (let i = 0; i < o.count; i++) quests.advance((x) => x === o);
check(quests.isComplete(errand.id) && op({ op: 'turnin', id: errand.id }).ok, 'done and handed back');

const board = near('board');
by(board, 1.5);
const posted = op({ op: 'talk', npc: board.id }).roll?.offers ?? [];
check(posted.length === 3 && posted.every((q) => q?.kind === 'job' && q.giver.startsWith(`${board.id}#`)), `${town.name}'s quest board has three postings: ${posted.map((q) => `"${q?.title}"`).join(', ')}`);
check(new Set(posted.map((q) => q.id)).size === 3, 'each its own quest');
check(posted.every((q) => op({ op: 'accept', id: q.id }).ok), 'all three can be taken at once');
for (const q of posted) {
  for (const ob of q.objectives) {
    if (ob.type === 'clear') core.apply({ op: 'camp', id: ob.camp });
    else for (let i = 0; i < ob.count; i++) quests.advance((x) => x === ob);
  }
}
check(posted.every((q) => {
  const to = w.npcById(quests.returnId(q));
  by(to, 1.5);
  return op({ op: 'turnin', id: q.id }).ok;
}), `and handed in where each says (${posted.map((q) => (quests.returnId(q).includes('#') ? 'the board' : 'a trader down the road')).join(', ')})`);
check(!Object.keys(quests.active).length && quests.jobs === 4, 'the log is clear; four errands and postings done');

console.log(failed ? `placecheck: ${failed} failed` : 'placecheck: all good');
process.exit(failed ? 1 : 0);
