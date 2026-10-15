// Dev check: public world events (gameplay phase 6), run in the server's headless world with
// stand-in players — the director's choices on a real world, then each kind of event played
// through the world sim (won, lost, abandoned), the vote, scaling, contribution, an overrun
// closing a settlement's services and the Retake opening them again, and the event chest through
// the character's rules.
// Run: node tools/eventcheck.mjs [seed]
import * as THREE from 'three';
import { HeadlessWorld } from '../server/world.js';
import { WorldSim } from '../src/sim/WorldSim.js';
import { DIRECTOR, GATHER, ELIGIBLE, OVERRUN, EVENT_TYPES } from '../src/sim/WorldEvents.js';
import { Stats } from '../src/rpg/Stats.js';
import { Inventory } from '../src/items/Inventory.js';
import { QuestLog } from '../src/rpg/Quests.js';
import { CharacterCore, eventRoll } from '../src/rpg/CharacterCore.js';
import { ACHIEVEMENT } from '../src/rpg/achievements.js';
import { itemFromRecipe } from '../src/items/items.js';
import { RARITY } from '../src/items/rarity.js';
import { SimHost } from '../server/simhost.js';
import { loadCharacter } from '../server/characters.js';
import { eventCalled, eventObjectives, EVENT_CALL } from '../src/rpg/questWatch.js';
import { roadRoute, RouteFollower } from '../src/sim/Routes.js';
import { CITY_WALL } from '../src/world/places.js';

const seed = Number(process.argv[2] ?? 12345);
const world = new HeadlessWorld(seed);
let failed = 0;
const check = (ok, what) => {
  if (!ok) failed++;
  console.log(`  ${ok ? '✓' : '✗'} ${what}`);
};
const mins = (s) => { const t = Math.round(s); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };

// ---------------------------------------------------------------- the world's sites
const all = [];
for (let ring = 0; ring <= 6; ring++) {
  for (let rx = -ring; rx <= ring; rx++) {
    for (let rz = -ring; rz <= ring; rz++) {
      if (Math.max(Math.abs(rx), Math.abs(rz)) !== ring) continue;
      const region = world.gen.region(rx, rz);
      for (const p of region.pois) all.push({ p, region });
    }
  }
}
const settlement = (race) => all.find(({ p, region }) => ['hamlet', 'settlement', 'town'].includes(p.type) && region.race === race && (p.level ?? region.level) >= 3);
const landmark = all.find(({ p, region }) => p.type === 'landmark' && (p.level ?? region.level) >= 5);

// ---------------------------------------------------------------- a sim with stand-in players
const said = [];
const ended = [];
const overruns = [];
const host = {
  world,
  worldEvents: true,
  emit: (ev) => said.push(ev),
  onKilled() {},
  onEventEnd: (ev) => ended.push(ev),
  onOverrun: (place, on) => overruns.push([place.id, on]),
};
const sim = new WorldSim(host);
const dir = sim.director;
const player = (id) => ({ id, position: new THREE.Vector3(), velocity: new THREE.Vector3(), radius: 0.45, height: 2, alive: true });
const put = (p, x, z) => {
  p.position.set(x, world.groundHeight(x, z), z);
  world.prime([p.position]);
};
const step = (seconds, each = null) => {
  for (let t = 0; t < seconds; t += 0.05) {
    world.track(sim.players.map((p) => p.position));
    sim.update(0.05);
    if (each?.() === false) return;
  }
};
const hit = (p, e, damage) => sim.applyHit(e.id, { by: p.id, damage, source: 'melee', poise: 0, knockback: 0, dir: { x: 0, z: 1 } });
// A defender: every so often, cuts down the event's enemies within `reach` of them.
const defend = (p, ev, reach = 25, rate = 0.5) => {
  let t = 0;
  return () => {
    if ((t += 0.05) < rate) return;
    t = 0;
    for (const e of ev.enemies) {
      if (!e.alive || e.position.distanceTo(p.position) > reach) continue;
      hit(p, e, Math.ceil(e.maxHp * 0.6) + (e.shield ?? 0));
    }
  };
};
// A hunter: goes to each of the event's objectives in turn (pods, engines, the garrison) and
// brings it down.
const hunt = (p, ev, after = 0) => {
  let t = -after;
  return () => {
    if ((t += 0.05) < 1) return;
    t = 0;
    const target = ev.foes.find((e) => e.alive);
    // Nothing left to hunt: back to the heart of it, fighting whatever's come.
    if (!target) {
      if (Math.hypot(p.position.x - ev.x, p.position.z - ev.z) > 6) put(p, ev.x + 2, ev.z + 2);
      for (const e of ev.enemies) if (e.alive && e.position.distanceTo(p.position) < 15) hit(p, e, e.maxHp + (e.shield ?? 0));
      return;
    }
    put(p, target.position.x + 2, target.position.z);
    hit(p, target, Math.ceil(target.maxHp * 0.35) + (target.shield ?? 0));
    for (const e of ev.enemies) if (e.alive && e !== target && e.position.distanceTo(p.position) < 12) hit(p, e, e.maxHp + (e.shield ?? 0));
  };
};
const all2 = (...fns) => () => { for (const f of fns) if (f() === false) return false; };
const reset = () => {
  for (const ev of [...dir.events.values()]) dir.remove(ev);
  for (const e of [...sim.enemies]) sim.removeEnemy(e);
  for (const id of [...dir.overrun.keys()]) dir.free(id);
  dir.rest.clear();
  ended.length = 0;
  said.length = 0;
};
// A character under the shared rules, as the server keeps one (strict: it checks where they stand).
const character = (p, level) => {
  const stats = new Stats();
  stats.level = level;
  const quests = new QuestLog({ hud: null, world, encounters: { isCleared: () => false }, stats, player: { position: p.position } });
  const core = new CharacterCore({ stats, inventory: new Inventory(3), quests, attuned: new Set(['w-hub']), chests: new Set(), shop: { stock: [] }, settings: { lootFilter: 0, threat: 0 }, position: p.position, world, strict: true });
  core.eventTier = () => dir.tierFor(p.id, p.position);
  return core;
};
const startAt = (site, type, level = null) => dir.start({ poi: site.p, type, level: level ?? site.p.level ?? site.region.level, race: EVENT_TYPES[type].race ?? site.region.race });

// ---------------------------------------------------------------- routes (P-1)
// A route from the roads between waystones, toward a settlement two or more regions off.
console.log('Routes:');
const routeSite = all.find(({ p, region }) => ['hamlet', 'settlement', 'town'].includes(p.type) && region.level >= 6 && roadRoute(world.gen, p));
const route = routeSite && roadRoute(world.gen, routeSite.p);
check(!!route, 'a road route to a settlement');
check(route?.length >= 300 && route?.length <= 480, `its length is in band (${Math.round(route?.length)} m)`);
check(route?.regions >= 2, `it crosses regions (${route?.regions})`);
const [lx, lz] = route?.points.at(-1) ?? [Infinity, Infinity];
check(Math.hypot(lx - routeSite?.p.x, lz - routeSite?.p.z) <= (routeSite?.p.r ?? 0) + 6, 'it ends at the settlement');
const towns = world.gen.cities();
check(!!route && route.points.every(([x, z]) => towns.every((c) => Math.hypot(c.x - routeSite.p.x, c.z - routeSite.p.z) < CITY_WALL || Math.hypot(c.x - x, c.z - z) > CITY_WALL + 10) && Math.hypot(x, z) > 60), 'it keeps out of the cities and the hub');
// Walked at 1.5 m/s it arrives in length / speed.
const walk = (pts, canStand) => { const f = new RouteFollower(pts, { speed: 1.5, canStand }); let t = 0; while (f.step(0.05) === 'moving' && t < 2000) t += 0.05; return { f, t }; };
const w1 = route && walk(route.points);
check(w1?.f.status === 'arrived' && Math.abs(w1.t - route.length / 1.5) < 1, `a follower arrives on time (${w1 ? mins(w1.t) : '-'})`);
// A 12 m stretch it can't stand on is jumped; a 40 m one leaves it stuck where it began.
const line = Array.from({ length: 81 }, (_, i) => [i * 2.5, 0]);
const gap = (a, b) => (x) => x < a || x > b;
const w2 = walk(line, gap(100, 112));
check(w2.f.status === 'arrived' && w2.f.skipped === 1, 'a short gap is jumped');
const w3 = walk(line, gap(100, 140));
check(w3.f.status === 'stuck' && w3.f.x < 100, 'a long gap leaves it stuck, before the gap');
// Something an event leads along the route (a caravan, later): the event's area goes with it, so
// whoever follows is told of it all the way, whichever region it's in.
{
  reset();
  const convoy = dir.start({ poi: routeSite.p, type: 'retake', level: 6, race: 'synth' }); // any event will do as a carrier
  const crate = dir.structure(convoy, `${convoy.id}:c`, 'pylon', { x: route.points[0][0], z: route.points[0][1] }, 50);
  convoy.structures.push(crate);
  dir.lead(convoy, crate, new RouteFollower(route.points, { speed: 6, canStand: (x, z) => world.standable(x, z) }));
  const rider = player('rider');
  sim.setPlayers([rider]);
  let told = true;
  const regions = new Set();
  for (let t = 0; t < route.length / 6; t += 10) {
    const behind = new RouteFollower(route.points, { speed: 1 });
    behind.step(Math.max(0, t * 6 - 60)); // 60 m behind it
    put(rider, behind.x, behind.z);
    step(10);
    told &&= dir.near(rider.position.x, rider.position.z).includes(convoy);
    regions.add(world.regionAt(convoy.x, convoy.z).key);
  }
  check(told, 'a led structure is reported to someone following it, all the way');
  check(regions.size >= 2, `it carries the event across regions (${regions.size})`);
  check(Math.hypot(crate.x - convoy.x, crate.z - convoy.z) < 0.01 && crate.position.y === world.groundHeight(crate.x, crate.z), 'the structure and the event move together, on the ground');
  sim.setPlayers([]);
  reset();
}

// ---------------------------------------------------------------- the director
console.log('The director:');
{
  const scav = settlement('scav');
  const hive = settlement('hive');
  check(!!scav && !!hive && !!landmark, `the world has places for each (${scav?.p.name}, ${hive?.p.name}, ${landmark?.p.name})`);
  const kinds = new Set();
  for (const { p, region } of all) {
    if (!['hamlet', 'settlement', 'town', 'landmark', 'ruin'].includes(p.type)) continue;
    const t = dir.typeFor(p, region.race, p.level ?? region.level);
    if (t) kinds.add(`${p.type === 'landmark' || p.type === 'ruin' ? 'site' : 'place'}:${t}`);
  }
  check(kinds.has('place:surge') && kinds.has('place:siege') && kinds.has('site:anomaly') && !kinds.has('site:surge') && !kinds.has('place:anomaly'),
    `surges and sieges at settlements, anomalies at landmarks and ruins (${[...kinds].sort().join(', ')})`);
  // Nothing at the hub, in the starting lands or in a city.
  const lows = dir.sites(0, 0).filter((s) => s.level < DIRECTOR.minLevel);
  check(!lows.length && !dir.sites(0, 0).some((s) => ['city', 'hub'].includes(s.poi.type)), 'none in the starting lands, the hub or a city');

  // A player near a settlement: nothing for the first while, then one 120–320 m away.
  const me = player(1);
  sim.setPlayers([me]);
  put(me, scav.p.x + 200, scav.p.z);
  let first = null;
  step(DIRECTOR.first - 5, () => { if (dir.events.size) { first = sim.time; return false; } });
  check(first === null, `nothing in the first ${DIRECTOR.first - 5} s after arriving`);
  step(240, () => { if (dir.events.size) { first = sim.time; return false; } });
  const ev = [...dir.events.values()][0];
  const d = ev && Math.hypot(ev.site.x - me.position.x, ev.site.z - me.position.z);
  check(!!ev && d >= DIRECTOR.min && d <= DIRECTOR.max, `then one: ${ev?.name} (${ev?.type}), ${Math.round(d)} m off, after ${Math.round(first)} s`);
  check(ev?.stage === 'gather' && said.some((s) => s.k === 'evstart'), 'it gathers first, and says so');
  step(DIRECTOR.every * 6);
  check([...dir.events.values()].filter((e) => e.stage !== 'over').length === 1, 'and no second one starts near it');
  reset();
  sim.setPlayers([]);
}

// ---------------------------------------------------------------- the vote
console.log('The vote:');
{
  const site = settlement('scav');
  const [a, b, c] = [player(11), player(12), player(13)];
  sim.setPlayers([a, b, c]);
  for (const p of [a, b, c]) put(p, site.p.x, site.p.z + 30);
  const ev = startAt(site, 'siege');
  check(!dir.vote(a.id, ev.id, 2), 'no voting from away from the beacon');
  for (const p of [a, b, c]) put(p, ev.bx + 1, ev.bz);
  dir.vote(a.id, ev.id, 2);
  dir.vote(b.id, ev.id, 2);
  dir.vote(c.id, ev.id, 1);
  check(dir.tally(ev) === 2, 'the most votes win (Elite 2, Veteran 1)');
  dir.vote(b.id, ev.id, 1);
  check(dir.tally(ev) === 1, 'a tie goes to the lower tier (Elite 1, Veteran 2)');
  check(dir.tierFor(a.id) === null, 'no tier till it\'s under way');
  step(GATHER + 1);
  check(ev.stage === 'active' && ev.tier === 1 && dir.tierFor(a.id) === 1, 'under way at Veteran: it\'s the Threat of everyone there');
  put(c, ev.x + ev.r + 200, ev.z);
  check(dir.tierFor(c.id) === null, 'and nobody\'s away from it');
  const elites = ev.enemies.filter((e) => e.elite);
  check(!elites.length || elites.every((e) => e.affixes.length >= 2), 'its elites carry the tier\'s extra affix');
  reset();
  sim.setPlayers([]);
}

// ---------------------------------------------------------------- each kind, won
const play = (label, site, type, setup, limit = 900) => {
  console.log(`${label}:`);
  const [a, b] = [player(21), player(22)];
  sim.setPlayers([a, b]);
  put(a, site.p.x, site.p.z);
  put(b, site.p.x + 3, site.p.z);
  const ev = startAt(site, type);
  step(GATHER + 0.5);
  check(ev.stage === 'active', `${ev.name}: under way after the gathering`);
  const each = setup(ev, a, b);
  const t0 = sim.time;
  step(limit, () => { each(); if (ev.stage === 'over') return false; });
  return { ev, a, b, took: sim.time - t0 };
};

{
  const site = settlement('hive') ?? settlement('scav');
  const { ev, a, b, took } = play('Hive Surge, defended', site, 'surge', (ev, a, b) => all2(defend(a, ev, 20), hunt(b, ev, 20)));
  check(ev.res === 'won', `won in ${mins(took)} (pylons standing ${ev.structures.filter((s) => s.alive).length}/${ev.structures.length}, waves ${ev.wave}/${ev.waves})`);
  check(ev.foes.length >= 2 && ev.foes.every((e) => !e.alive), `every spore pod burst (${ev.foes.length})`);
  check(said.some((s) => s.k === 'hatch'), 'the pods hatched drones while they lived');
  const people = ev.result.people;
  check(people.length === 2 && people.every((p) => p.points >= ELIGIBLE), `both defenders earned the chest (${people.map((p) => `${p.points} pts${p.top ? ', top' : ''}`).join(' · ')})`);
  check(ended.includes(ev), 'the host heard it end');
  check(ev.enemies.every((e) => !e.alive), 'what was left of it melted away');
  void a; void b;
  reset();
}

{
  const site = settlement('scav');
  const { ev, took } = play('Scav Siege, defended', site, 'siege', (ev, a, b) => all2(defend(a, ev, 30), hunt(b, ev)));
  check(ev.res === 'won', `won in ${mins(took)} (engines ${ev.foes.filter((e) => e.type.name === 'Siege Engine').length}, waves ${ev.wave}/${ev.waves})`);
  check(said.some((s) => s.k === 'evstep' && s.id === ev.id), 'the engines fell before the waves came');
  check(ev.named.includes('Siege Captain'), 'the last wave was led by the Siege Captain');
  reset();
}

{
  const site = { p: landmark.p, region: landmark.region };
  const { ev, took } = play('Maker Anomaly, held', site, 'anomaly', (ev, a, b) => {
    put(a, ev.bx + 2, ev.bz);
    put(b, ev.bx - 2, ev.bz);
    return all2(defend(a, ev, 22), defend(b, ev, 22));
  });
  check(ev.res === 'won' && ev.charge >= 1, `charged to full in ${mins(took)}`);
  check(ev.warden && ev.named.includes('Maker Warden'), 'a Maker Warden came out at half charge');
  check(ev.structures[0].alive, `the beacon stood (${Math.round(ev.structures[0].hp)}/${ev.structures[0].max})`);
  reset();
}

// ---------------------------------------------------------------- lost, and retaken
console.log('Lost, overrun, retaken:');
{
  const site = settlement('scav');
  const place = site.p;
  const trader = (place.npcs ?? []).find((n) => n.role === 'trader');
  const me = player(31);
  sim.setPlayers([me]);
  put(me, place.x, place.z);
  const ev = startAt(site, 'siege');
  step(GATHER + 20);
  const engines = ev.foes;
  const crews = ev.enemies.filter((e) => !engines.includes(e));
  check(crews.length >= 2 && crews.every((c) => engines.some((g) => g.position.distanceTo(c.position) < 10)) && engines.every((g) => g.foe?.structure),
    `the engines shell the pylons while their crews (${crews.length}) stay by them`);
  const t0 = sim.time;
  const hits = [];
  step(900, () => {
    for (const s of ev.structures) if (!s.alive && !hits.includes(s.id)) hits.push(s.id);
    if (ev.stage === 'over') return false;
  });
  check(ev.res === 'lost', `undefended, it falls in ${mins(sim.time - t0)} (the pylons went one by one: ${hits.length}/${ev.structures.length})`);
  check(dir.overrun.has(place.id) && overruns.some(([id, on]) => id === place.id && on), `${place.name} is overrun`);
  if (trader) {
    check(!world.folkNear(trader.x, trader.z, 3, 'trader').length, 'its trader is gone');
    check(!world.npcById(trader.id, me.position), 'and nobody there answers');
    const shopper = character(player(39), place.level ?? 5);
    shopper.position.set(trader.x + 1, 0, trader.z);
    check(!shopper.nearTrader(), 'the server\'s rules find no trader to buy from or sell to');
  } else check(!world.npcById((place.npcs ?? [])[0]?.id, me.position), 'nobody there answers');
  const retake = [...dir.events.values()].find((e) => e.type === 'retake' && e.site === place);
  check(!!retake && retake.stage === 'active' && retake.foes.length >= 5, `the Retake begins at once: a garrison of ${retake?.foes.length}`);
  check(ev.result.people.length === 0, 'nobody gets a chest for losing');
  const t1 = sim.time;
  const retaking = hunt(me, retake);
  step(600, () => { retaking(); if (retake.stage === 'over') return false; });
  check(retake.res === 'won', `retaken in ${mins(sim.time - t1)}`);
  check(!dir.overrun.has(place.id) && overruns.some(([id, on]) => id === place.id && !on), 'the settlement is free again');
  if (trader) check(world.folkNear(trader.x, trader.z, 3, 'trader').length === 1, 'and its trader is back');
  check(retake.result.people.some((p) => p.id === me.id), 'the retaker earned the chest');
  reset();
}
{
  // Left alone: the garrison moves on after a while.
  const site = settlement('scav');
  const me = player(32);
  sim.setPlayers([me]);
  put(me, site.p.x, site.p.z);
  const ev = startAt(site, 'siege');
  dir.activate(ev);
  dir.finish(ev, false, 'lost');
  const retake = [...dir.events.values()].find((e) => e.type === 'retake');
  put(me, site.p.x + 600, site.p.z);
  step(OVERRUN + 5);
  check(retake.res === 'faded' && !dir.overrun.has(site.p.id), `left alone, the garrison moves on after ${OVERRUN / 60} minutes`);
  reset();
}
{
  // An anomaly nobody defends fades or is wrecked; nothing is overrun.
  const me = player(33);
  sim.setPlayers([me]);
  put(me, landmark.p.x + 400, landmark.p.z);
  const ev = startAt(landmark, 'anomaly');
  step(GATHER + 60);
  check(['faded', 'lost'].includes(ev.res) && !dir.overrun.size && !ev.result.people.length, `an anomaly nobody defends ends (${ev.res}) with no harm done and no chest`);
  reset();
}

// ---------------------------------------------------------------- scaling and contribution
console.log('Scaling and contribution:');
{
  const site = settlement('hive') ?? settlement('scav');
  const size = (n) => {
    const ps = Array.from({ length: n }, (_, i) => player(40 + i));
    sim.setPlayers(ps);
    ps.forEach((p, i) => put(p, site.p.x + i, site.p.z));
    const ev = startAt(site, 'surge');
    step(GATHER + 0.5);
    const pylon = ev.structures[0].max;
    const pods = ev.foes.length;
    ev.next = 0;
    const before = sim.enemies.length;
    dir.wave(ev, false);
    const wave = sim.enemies.length - before;
    reset();
    return { pylon, pods, wave };
  };
  const one = size(1);
  const four = size(4);
  check(four.wave > one.wave && four.pylon > one.pylon && four.pods > one.pods,
    `four defenders face more: waves ${one.wave} → ${four.wave}, pods ${one.pods} → ${four.pods}, pylon health ${one.pylon} → ${four.pylon}`);

  // Someone who wandered in for half a minute doesn't earn the chest; a minute does.
  const [stay, pass] = [player(51), player(52)];
  sim.setPlayers([stay, pass]);
  put(stay, site.p.x, site.p.z);
  put(pass, site.p.x + 500, site.p.z);
  const ev = startAt(site, 'surge');
  step(GATHER + 0.5);
  step(30, () => { put(pass, site.p.x + 1, site.p.z); });
  put(pass, site.p.x + 500, site.p.z);
  step(40);
  dir.finish(ev, true);
  const got = new Set(ev.result.people.map((p) => p.id));
  check(got.has(stay.id) && !got.has(pass.id), `a minute there earns the chest, half of one doesn't (${ev.result.people.map((p) => p.points).join(', ')} pts)`);
  reset();
}

// ---------------------------------------------------------------- the chest and the records
console.log('The event chest, through the character\'s rules:');
{
  const site = settlement('hive') ?? settlement('scav');
  const level = site.p.level ?? site.region.level;
  const [a, b, c] = [player(61), player(62), player(63)];
  sim.setPlayers([a, b, c]);
  for (const p of [a, b, c]) put(p, site.p.x, site.p.z);
  const core = character(a, level);
  core.settings.threat = 0;
  const ev = startAt(site, 'surge');
  for (const p of [a, b, c]) put(p, ev.bx, ev.bz);
  for (const p of [a, b, c]) dir.vote(p.id, ev.id, 2);
  for (const p of [a, b, c]) put(p, site.p.x, site.p.z);
  step(GATHER + 0.5);
  check(core.tier === 2, 'inside an Elite event under way, Elite is the character\'s Threat');
  const away = character(player(64), level);
  check(away.tier === 0, 'outside it, their own');
  step(70, () => { for (const e of ev.enemies) if (e.alive && e.position.distanceTo(a.position) < 20) hit(a, e, e.maxHp + (e.shield ?? 0)); });
  dir.finish(ev, true);
  const mine = ev.result.people.find((p) => p.id === a.id);
  check(!!mine && mine.top && mine.lead, `the one who did the most is its top contributor and led it (${mine?.points} pts of ${ev.result.people.map((p) => p.points).join(', ')})`);
  const roll = eventRoll(ev, mine, core.stats.level, () => core.gid());
  const items = roll.loot.map((l) => itemFromRecipe(l.recipe));
  check(items.length === 3 && items.every((it) => RARITY[it.rarity].tier >= 2), `the chest: ${roll.xp} XP, ${roll.gold}g and ${items.length} items, rare or better (${items.map((it) => it.rarity).join(', ')})`);
  const gold = core.stats.gold;
  const r = core.apply({ op: 'event', roll });
  check(r.ok && core.stats.gold === gold + roll.gold && core.records.events.surge?.[2] === 1 && core.records.eventLead === 1, 'applied: gold, XP, loot at the beacon, and a Hive Surge won on Elite in the records');
  const done = new Set(Object.keys(core.achievements));
  check(['event_1', 'event_surge', 'event_elite', 'event_lead'].every((id) => done.has(id)), `achievements: ${['event_1', 'event_surge', 'event_elite', 'event_lead'].filter((id) => done.has(id)).map((id) => ACHIEVEMENT[id].name).join(', ')}`);
  check(!core.apply({ op: 'event', roll: { ...roll, kind: 'nonsense' } }).ok && !core.apply({ op: 'event', roll: { ...roll, tier: 7 } }).ok, 'a chest for no kind of event, or no tier, is refused');
  for (const kind of ['siege', 'anomaly', 'retake']) core.apply({ op: 'event', roll: { ...eventRoll({ ...ev, type: kind, tier: 0 }, { points: 80 }, level, () => core.gid()) } });
  const all = new Set(Object.keys(core.achievements));
  check(['event_siege', 'event_anomaly', 'event_retake'].every((id) => all.has(id)), 'a siege, an anomaly and a retake each have theirs');
  reset();
  sim.setPlayers([]);
}

// ---------------------------------------------------------------- a quest's event (A-2)
// A story step ({ type: 'event', event: 'surge', at }) calls a Hive Surge at its place when someone
// on it comes near (rpg/questWatch.js eventCalled → WorldEvents.startStory); winning it while
// earning the chest moves the step on for each who did (eventObjectives → the 'evwon' op).
console.log('A quest\'s event:');
const questEvent = (id, home) => ({
  id, kind: 'story', giver: 'warden', home, title: 'Hold the Line',
  stages: [{ text: 'Hold {home}.', objectives: [{ type: 'event', event: 'surge', at: 'home', count: 1, text: 'Hold {home}' }] }],
});
const onQuest = (core, q) => { core.quests.defs.set(q.id, q); core.quests.begin(q.id); return core; };
{
  const site = settlement('hive') ?? settlement('scav');
  const place = site.p;
  const level = place.level ?? site.region.level;
  const [a, b] = [player(81), player(82)];
  sim.setPlayers([a, b]);
  const q = questEvent('zev1', place.id);
  const [ca, cb] = [onQuest(character(a, level), q), onQuest(character(b, level), q)];
  put(a, place.x + 400, place.z);
  check(!eventCalled(ca.quests, a.position.x, a.position.z), 'far from the place, the step calls nothing');
  put(a, place.x + (place.radius ?? place.r ?? 12) + EVENT_CALL - 10, place.z);
  const call = eventCalled(ca.quests, a.position.x, a.position.z);
  check(call?.site === place.id && call.type === 'surge', `coming near ${place.name}, it calls a surge there`);
  // The director's spacing doesn't hold it back: the site resting, the player just had one.
  dir.rest.set(place.id, sim.time + 9999);
  dir.last.set(a.id, sim.time);
  const ev = dir.startStory(call.site, call.type);
  check(!!ev && ev.story && ev.locked && ev.type === 'surge' && ev.site === place && ev.stage === 'gather',
    `started at once, whatever the director's spacing (${ev?.name})`);
  check(dir.startStory(call.site, call.type) === ev && dir.events.size === 1, 'called again (every second), it\'s the same event');
  put(a, ev.bx, ev.bz);
  check(!dir.vote(a.id, ev.id, 2) && dir.view(ev).lk === 1 && dir.view(ev).v === undefined, 'no vote: its tier is locked (lk), and nobody\'s told of one');
  put(a, place.x, place.z);
  put(b, place.x + 3, place.z);
  step(GATHER + 0.5);
  check(ev.stage === 'active' && ev.tier === 0, 'under way at Normal');
  const each = all2(defend(a, ev, 20), hunt(b, ev, 20));
  const t0 = sim.time;
  step(900, () => { each(); if (ev.stage === 'over') return false; });
  check(ev.res === 'won' && ev.result.people.length === 2, `two stand-in players won it in ${mins(sim.time - t0)} (${ev.result.people.map((p) => `${p.points} pts`).join(' · ')})`);
  // What the host does as it ends (server/simhost.js onEventEnd; main.js offline): for each who
  // earned the chest, the steps it counts for.
  for (const person of ev.result.people) {
    const core = person.id === a.id ? ca : cb;
    for (const [id, i] of eventObjectives(core.quests, ev)) core.apply({ op: 'evwon', roll: { id, i } });
  }
  check(ca.quests.isComplete(q.id) && cb.quests.isComplete(q.id), 'the step moved on for both');
  check(!ca.apply({ op: 'evwon', roll: { id: q.id, i: 0 } }).ok, 'and not twice');
  check(!eventCalled(ca.quests, place.x, place.z), 'done, it calls nothing more');
  const other = onQuest(character(player(83), level), questEvent('zev2', place.id));
  check(!eventObjectives(other.quests, { type: 'siege', site: place }).length && eventObjectives(other.quests, { type: 'surge', site: { id: 'elsewhere' } }).length === 0,
    'a different kind of event, or one somewhere else, doesn\'t count');
  reset();
  sim.setPlayers([]);
}
{
  // Lost (abandoned): no step, the place overrun; once it's retaken, the step can call it again.
  const site = settlement('hive') ?? settlement('scav');
  const place = site.p;
  const level = place.level ?? site.region.level;
  const me = player(84);
  sim.setPlayers([me]);
  const q = questEvent('zev3', place.id);
  const core = onQuest(character(me, level), q);
  put(me, place.x, place.z);
  const ev = dir.startStory(eventCalled(core.quests, me.position.x, me.position.z)?.site, 'surge');
  step(GATHER + 1);
  put(me, place.x + 600, place.z);
  step(120, () => { if (ev.stage === 'over') return false; });
  check(ev.res === 'lost' && !ev.result.people.length && eventObjectives(core.quests, ev).length === 1 &&!core.quests.isComplete(q.id),
    `abandoned, it's lost (${ev.res}) and the step stays where it was`);
  check(dir.overrun.has(place.id) && dir.startStory(place.id, 'surge') === null, `${place.name} overrun: no story surge there till it's retaken`);
  const retake = [...dir.events.values()].find((e) => e.type === 'retake' && e.site === place);
  put(me, place.x, place.z);
  const retaking = hunt(me, retake);
  step(600, () => { retaking(); if (retake.stage === 'over') return false; });
  check(retake.res === 'won' && !dir.overrun.has(place.id), 'retaken');
  const again = dir.startStory(eventCalled(core.quests, me.position.x, me.position.z)?.site, 'surge');
  check(!!again && again !== ev && again.story && again.stage === 'gather', 'and the step calls its surge again');
  reset();
  sim.setPlayers([]);
}

// ---------------------------------------------------------------- the server's side
// The realm's sim host as the server runs it, with a stand-in realm and two players: what they're
// told (wev, ovr), the vote over the wire, the tier on their characters, the chest as a server op.
console.log('On the server (server/simhost.js):');
{
  const realm = { sessions: new Map(), parties: { mates: () => [], partyOf: () => null }, raids: { keyOf: () => null } };
  const host = new SimHost(realm, seed);
  const hd = host.sim.director;
  const site = settlement('scav');
  const session = (id) => {
    const s = { id, charId: id, name: `P${id}`, strikes: 0, out: [], send(m) { this.out.push(typeof m === 'string' ? JSON.parse(m) : m); } };
    realm.sessions.set(id, s);
    host.join(s);
    s.core = loadCharacter(s, null, host).core;
    s.core.stats.level = site.p.level ?? site.region.level;
    return s;
  };
  const move = (s, x, z) => { s.core.teleportUntil = Infinity; host.updatePlayer(s, { p: [x, host.world.groundHeight(x, z), z], v: [0, 0, 0], fl: 0 }); };
  const tick = (seconds) => { for (let t = 0; t < seconds; t += 0.05) host.tick(0.05); };
  const [a, b] = [session(71), session(72)];
  move(a, site.p.x, site.p.z);
  move(b, site.p.x + 900, site.p.z);
  const ev = hd.startNear(site.p.x, site.p.z, 'siege');
  tick(0.6);
  const wev = a.out.filter((m) => m.t === 'wev').at(-1);
  check(!!wev && wev.l.some((v) => v.id === ev.id && v.st === 'gather') && Array.isArray(wev.me[ev.id]), `the player there is told of it (wev: ${wev?.l.map((v) => v.nm).join(', ')})`);
  check(!b.out.some((m) => m.t === 'wev'), 'the one far away isn\'t');
  const sent = a.out.length;
  tick(0.6);
  check(!a.out.slice(sent).some((m) => m.t === 'wev' && m.l[0]?.tl === wev.l[0].tl), 'nothing resent that hasn\'t changed');
  move(a, ev.bx, ev.bz);
  host.vote(a, { id: ev.id, tier: 2 });
  host.vote(b, { id: ev.id, tier: 0 });
  check(ev.votes.get(a.id) === 2 && !ev.votes.has(b.id), 'a vote at the beacon counts; one from far off doesn\'t');
  tick(GATHER);
  check(ev.stage === 'active' && a.core.tier === 2 && b.core.tier === 0, 'under way at Elite: the Threat on the character there, not the one away');
  for (const p of ev.people.values()) p.c = 0;
  hd.person(ev, a.id).c = ELIGIBLE + 5;
  hd.finish(ev, true);
  const chest = a.out.find((m) => m.t === 'sop' && m.op?.op === 'event');
  check(!!chest && a.core.records.events.siege?.[2] === 1 && a.core.achievements.event_siege, `the chest comes as a server op and lands on the character (${chest?.op.roll.title})`);
  check(!b.out.some((m) => m.t === 'sop' && m.op?.op === 'event'), 'and nobody else gets one');
  const ev2 = hd.startNear(site.p.x, site.p.z, 'siege');
  hd.activate(ev2);
  hd.finish(ev2, false, 'lost');
  const ovr = b.out.find((m) => m.t === 'ovr');
  check(!!ovr && ovr.on === 1 && host.overrun.includes(ovr.id), `everyone hears ${ovr ? hd.overrun.get(ovr.id)?.name : '?'} is overrun, and it's in the list a newcomer gets`);
  for (const e of [...hd.events.values()].find((x) => x.type === 'retake').foes) hd.sim.applyHit(e.id, { by: a.id, damage: e.maxHp * 2, source: 'melee', dir: { x: 0, z: 1 } });
  tick(0.2);
  check(b.out.some((m) => m.t === 'ovr' && m.on === 0) && !host.overrun.length, 'and that it\'s free again once retaken');

  // A quest's event, online: the server's watch starts it, and moves the step on for each who
  // earned the chest (a server op, evwon); someone on the same step who wasn't there waits.
  for (const x of [...hd.events.values()]) hd.remove(x);
  hd.rest.clear();
  const hive = settlement('hive') ?? site;
  const q = questEvent('zev4', hive.p.id);
  const [c, d, e] = [session(73), session(74), session(75)];
  for (const s of [c, d, e]) { s.core.stats.level = hive.p.level ?? hive.region.level; onQuest(s.core, q); }
  move(a, site.p.x + 900, site.p.z + 900);
  move(b, site.p.x + 900, site.p.z + 900);
  move(c, hive.p.x, hive.p.z);
  move(d, hive.p.x + 3, hive.p.z);
  move(e, hive.p.x + 900, hive.p.z);
  tick(2);
  const sev = [...hd.events.values()].find((x) => x.story);
  check(!!sev && sev.site.id === hive.p.id && sev.locked, `the server's quest watch starts it for the players on the step (${sev?.name})`);
  const sw = c.out.filter((m) => m.t === 'wev').at(-1)?.l.find((v) => v.id === sev?.id);
  check(sw?.lk === 1 && sw.v === undefined, 'they\'re told of it, its tier locked (wev lk)');
  if (sev) {
    move(c, sev.bx, sev.bz);
    host.vote(c, { id: sev.id, tier: 2 });
    move(c, hive.p.x, hive.p.z);
    tick(GATHER + 2);
    check(sev.stage === 'active' && sev.tier === 0 && c.core.tier === 0, 'under way at Normal, whatever was voted');
    tick(ELIGIBLE + 5);
    hd.finish(sev, true);
  }
  const won = (s) => s.out.some((m) => m.t === 'sop' && m.op?.op === 'evwon' && m.op.roll.id === q.id);
  check(won(c) && won(d) && c.core.quests.isComplete(q.id) && d.core.quests.isComplete(q.id), 'won: the step moved on for both who took part (evwon)');
  check(!won(e) && !e.core.quests.isComplete(q.id), 'not for the one on the same step who wasn\'t there');
}

console.log(failed ? `eventcheck: ${failed} failed` : 'eventcheck: all good');
process.exit(failed ? 1 : 0);
