// Check: the dungeons (gameplay phase 5). Every dungeon's layout across many private runs (the main
// route the same in every copy, side rooms reshuffled, nothing overlapping, the key and the power
// before the doors they open, the boss behind them all, every enemy, trap and thing on a floor),
// then copies run headlessly through the instance manager (sim/Dungeons.js) with the world sim and
// the character's own rules as the server runs them: the ways in (and what's refused), floors,
// walls and ceilings in the pocket, rooms filling as you come near, enemies that can't see through
// walls and go round by the corridors, the locked door, the power, the arena's seal, the bosses,
// chests and the reward chest's lockout, a party sharing a private run, empty copies closing, and a
// character saved down there coming back outside.
// Run: node tools/dungeoncheck.mjs [seed]
import * as THREE from 'three';
import { HeadlessWorld } from '../server/world.js';
import { SimHost } from '../server/simhost.js';
import { loadCharacter } from '../server/characters.js';
import { WorldSim } from '../src/sim/WorldSim.js';
import { Dungeons } from '../src/sim/Dungeons.js';
import { generateDungeon } from '../src/world/DungeonGen.js';
import { Interior } from '../src/world/Interior.js';
import { DUNGEONS, LAUNCH, CLOSE_AFTER, inPocket, pocketOrigin, lockKey } from '../src/world/dungeons.js';
import { Stats } from '../src/rpg/Stats.js';
import { Inventory } from '../src/items/Inventory.js';
import { QuestLog } from '../src/rpg/Quests.js';
import { CharacterCore } from '../src/rpg/CharacterCore.js';

const seed = Number(process.argv[2] ?? 12345);
let failed = 0;
const check = (ok, what) => {
  if (!ok) failed++;
  console.log(`  ${ok ? '✓' : '✗'} ${what}`);
  return ok;
};

// ---------------------------------------------------------------- layouts
console.log('Layouts:');
const SHUFFLES = 25;
for (const def of Object.values(DUNGEONS)) {
  let ms = 0;
  let sameRoute = true;
  const sides = new Set();
  const bad = [];
  for (let k = 0; k < SHUFFLES; k++) {
    const shuffle = (def.seed * 31 + k * 7919) >>> 0;
    const t0 = performance.now();
    const L = generateDungeon(def, { shuffle, level: def.level + (k % 3) * 4 });
    ms += performance.now() - t0;
    const route = L.rooms.filter((r) => r.main).map((r) => `${r.x},${r.z},${r.w},${r.h},${r.floor}`).join('|');
    const base = generateDungeon(def).rooms.filter((r) => r.main).map((r) => `${r.x},${r.z},${r.w},${r.h},${r.floor}`).join('|');
    if (route !== base) sameRoute = false;
    sides.add(L.rooms.filter((r) => !r.main).map((r) => `${r.kind}@${r.x},${r.z}`).join('|'));
    // Areas don't overlap: every cell is claimed by at most one (the cells array is written in
    // order, so count each area's cells against what's there).
    const areas = [...L.rooms, ...L.cors];
    areas.forEach((a, i) => {
      for (let z = a.z; z < a.z + a.h; z++) for (let x = a.x; x < a.x + a.w; x++) if (L.cells[z * L.W + x] !== i + 1) bad.push(`overlap ${def.id}#${k} area ${i}`);
    });
    const it = new Interior(L, { x: 0, y: 0, z: 0 });
    const nav = it.nav;
    const c = (r) => ({ x: (r.x + r.w / 2) * L.cell, z: (r.z + r.h / 2) * L.cell });
    const start = L.rooms[0];
    // (Players ride the lift; the walking grid stops at its shaft: across it, top to bottom.)
    const lc = L.lift >= 0 ? L.cors[L.lift] : null;
    const across = lc ? (lc.axis === 'x' ? lc.z : lc.x) * L.cell + L.cell : 0;
    const end = (u) => (lc.axis === 'x' ? { x: u, z: across } : { x: across, z: u });
    const top = lc && end(lc.dir > 0 ? lc.shaft.u0 - 1 : lc.shaft.u1 + 1);
    const bot = lc && end(lc.dir > 0 ? lc.shaft.u1 + 1 : lc.shaft.u0 - 1);
    const go = (a, b) => nav.reachable(a.x, a.z, b.x, b.z);
    const reach = (r) => go(c(start), c(r)) || (!!lc && go(c(start), top) && go(bot, c(r)));
    // Doors shut, as a copy begins.
    for (const d of L.doors) if (d.kind !== 'open') nav.setBlocked(it.doorCells(d), true);
    const key = L.rooms.find((r) => r.kind === 'key');
    const locked = L.doors.find((d) => d.kind === 'locked');
    if (locked && (!key || !reach(key))) bad.push(`key out of reach ${def.id}#${k}`);
    if (reach(L.rooms[L.boss])) bad.push(`boss reachable with the doors shut ${def.id}#${k}`);
    // Open the locked door: the power nodes must be reachable now, before the power door.
    if (locked) nav.setBlocked(it.doorCells(locked), false);
    const power = L.doors.find((d) => d.kind === 'power');
    const nodes = L.rooms.filter((r) => r.kind === 'node');
    if (power && (nodes.length !== power.needs || nodes.some((r) => !reach(r)))) bad.push(`power nodes ${def.id}#${k}`);
    for (const d of L.doors) nav.setBlocked(it.doorCells(d), false);
    if (!reach(L.rooms[L.boss])) bad.push(`boss unreachable with every door open ${def.id}#${k}`);
    for (const t of L.things) if (!reach(L.rooms[t.room]) && t.kind !== 'portal') bad.push(`thing ${t.kind} unreachable ${def.id}#${k}`);
    // Stairs no steeper than a ramp you can walk; the lift drops a long way.
    for (const cr of L.cors) {
      if (cr.lift) { if (cr.fa - cr.fb < 6) bad.push(`lift too short ${def.id}#${k}`); continue; }
      const len = (cr.axis === 'x' ? cr.w : cr.h) * L.cell;
      if (Math.abs(cr.fa - cr.fb) / len > 0.6) bad.push(`steep stairs ${def.id}#${k}`);
    }
    // Everyone and everything stands on a floor, in the room it belongs to, clear of the pillars.
    const onFloor = (x, z, room) => it.areaIndex(x, z) === room && !L.pillars.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + 0.6);
    for (const s of L.spawns) for (const u of s.units) if (!onFloor(u.x, u.z, s.room)) bad.push(`${u.type} off the floor ${def.id}#${k}`);
    for (const t of L.things) if (!onFloor(t.x, t.z, t.room)) bad.push(`${t.kind} off the floor ${def.id}#${k}`);
    for (const x of L.traps) if (it.areaIndex(x.x, x.z) < 0) bad.push(`${x.kind} trap off the floor ${def.id}#${k}`);
    if (!L.things.some((t) => t.kind === 'reward') || !L.things.some((t) => t.kind === 'exit') || !L.things.some((t) => t.kind === 'portal')) bad.push(`things missing ${def.id}#${k}`);
    if (!L.spawns.find((s) => s.room === L.boss)?.units.some((u) => u.opts.boss)) bad.push(`no boss ${def.id}#${k}`);
  }
  check(!bad.length && sameRoute, `${def.name} (${def.theme}): ${SHUFFLES} copies — the same main route, ${sides.size} different side-room layouts, ${(ms / SHUFFLES).toFixed(1)} ms each${bad.length ? ` — ${bad.slice(0, 4).join('; ')}${bad.length > 4 ? ` (+${bad.length - 4})` : ''}` : ''}`);
}

// ---------------------------------------------------------------- a run, headless
console.log(`A run (seed ${seed}):`);
const w = new HeadlessWorld(seed);
const players = new Map(); // id → proxy
const sent = [];
let clearedRuns = [];
const host = {
  world: w, emit() {}, onKilled() {},
  onRoomCleared: (camp) => dun.onRoomCleared(camp),
  onRoomRestored: (camp) => dun.onRoomRestored(camp),
};
const sim = new WorldSim(host);
const dun = new Dungeons({
  world: w, sim,
  send: (id, msg) => sent.push({ id, msg }),
  positionOf: (id) => players.get(id)?.position ?? null,
  cleared: (run) => { clearedRuns.push(run.id); for (const id of run.players) cores.get(id)?.apply({ op: 'dclear', roll: { d: run.def.id, tier: run.tier, name: run.def.name } }); },
});
const cores = new Map();
function player(id, party, level = 8) {
  const position = new THREE.Vector3();
  const proxy = { id, position, velocity: new THREE.Vector3(), radius: 0.45, height: 2, alive: true, party };
  players.set(id, proxy);
  sim.setPlayers([...players.values()]);
  const stats = new Stats();
  stats.level = level;
  const quests = new QuestLog({ hud: null, world: w, encounters: { isCleared: () => false }, stats, player: { position } });
  const core = new CharacterCore({ stats, inventory: new Inventory(3), quests, attuned: new Set(['w-hub']), chests: new Set(), shop: { stock: [], fine: [] }, settings: { lootFilter: 0 }, position, world: w, strict: true });
  const who = () => ({ id, position, party, level: stats.level, flags: quests.flags });
  core.dungeons = {
    enter: (ask) => dun.enter(who(), ask),
    leave: () => dun.leave(who()),
    current: () => { const r = dun.runOf(id); return r && { dungeon: r.def.id, tier: r.tier, shared: r.shared }; },
    claim: (tid, kind) => dun.claim(id, `c${id}`, tid, position, kind),
  };
  cores.set(id, core);
  return { id, proxy, core, position, stats, quests };
}
// An operation as the server runs it: rolled where it's rolled, then applied.
function op(core, o) {
  const roll = core.roll(o);
  return core.apply({ ...o, roll }).ok;
}
const step = (s = 1, dt = 0.05) => { for (let t = 0; t < s; t += dt) { dun.tick(dt); sim.update(dt); } };
const stand = (P, x, z) => { P.position.set(x, w.groundHeight(x, z), z); };

const A = player(1, 'solo:1');
const gate = w.storyPlace('foundry').npcs.find((n) => n.object === 'foundry:gate');
stand(A, gate.x + 200, gate.z);
check(!op(A.core, { op: 'enter', d: 'foundry', mode: 'open', via: 'entrance' }), `refused far from the way in ("${dun.error}")`);
const door = w.storyPlace('vault').npcs.find((n) => n.object === 'vault:door');
stand(A, door.x + 1, door.z + 1);
check(!op(A.core, { op: 'enter', d: 'vault', mode: 'run', tier: 0, via: 'entrance' }), `the Sunken Vault refused before the seal is broken ("${dun.error}")`);
check(!dun.enter({ id: 1, position: A.position, party: 'x', level: 8, flags: {} }, { d: 'synthlab', mode: 'run', tier: 0 }), 'the dev-only dungeons refused');
// The Foundry Below (Act III): sealed at its hatch until the Fallen Titan's core is taken (c6).
{
  const hatch = w.storyPlace('foundrybelow')?.npcs.find((n) => n.object === 'foundrybelow:hatch');
  const at = hatch && new THREE.Vector3(hatch.x + 1, w.groundHeight(hatch.x + 1, hatch.z + 1), hatch.z + 1);
  const who = (flags) => ({ id: 91, position: at, party: 'solo:91', level: 21, flags });
  check(!!hatch && !dun.enter(who({}), { d: 'foundrybelow', mode: 'run', tier: 0, via: 'entrance' }) && /sealed/.test(dun.error), `the Foundry Below refused at its hatch before the Titan's core is taken ("${dun.error}")`);
  check(!!hatch && !!dun.enter(who({ titan_core_taken: true }), { d: 'foundrybelow', mode: 'run', tier: 0, via: 'entrance' }), 'and let in once it is');
  if (hatch) dun.out(91);
}
stand(A, gate.x + 1.5, gate.z + 1.5);
const back = [A.position.x, A.position.y, A.position.z];
check(op(A.core, { op: 'enter', d: 'foundry', mode: 'open', via: 'entrance' }) && A.core.dungeon?.d === 'foundry', 'into the Rustjaw Foundry\'s open-world copy from its gate');
const run = dun.runOf(1);
const it = run.interior;
const L = it.layout;
const start = dun.startOf(1);
A.position.set(start.x, start.y, start.z);
check(inPocket(A.position.x) && Math.abs(w.groundHeight(A.position.x, A.position.z) - start.y) < 1e-6 && w.ceilingAt(A.position.x, A.position.z) === start.y + L.rooms[0].ceil,
  `standing on its floor in the pocket (${Math.round(A.position.x)}, ${Math.round(A.position.z)}), under a ${L.rooms[0].ceil} m ceiling`);
// Walk into a wall: pushed back out.
const r0 = L.rooms[0];
const wallX = it.x0 + r0.x * L.cell;
const probe = new THREE.Vector3(wallX + 0.1, start.y, it.z0 + (r0.z + r0.h / 2) * L.cell + 0.3);
w.resolve(probe, 0.45, 0, 1.8);
check(probe.x >= wallX + 0.3 + 0.45 - 1e-6, 'its walls hold (a body is pushed back out of one)');
const camp = (room) => sim.encounters.camps.get(`dr:${run.id}:${room}`);
const centre = (r) => ({ x: it.x0 + (r.x + r.w / 2) * L.cell, z: it.z0 + (r.z + r.h / 2) * L.cell });
step(3);
check(sim.enemies.length > 0 && sim.enemies.every((e) => it.areaIndex(e.position.x - it.x0, e.position.z - it.z0) >= 0), `rooms fill as you come near (${sim.enemies.length} enemies, all on its floors)`);

// The next room's residents don't see you through the wall; one sent after you goes round.
const h1 = L.rooms[1];
const h2 = L.rooms[2];
const at1 = centre(h1);
stand(A, at1.x, at1.z);
step(2);
const others = sim.enemies.filter((e) => e.alive && e.camp?.def.index === 2);
check(others.length > 0 && others.every((e) => !e.engaged || e.sees(A.proxy)), `${others.length} in the next hall don't come at you through the wall`);
for (const e of [...sim.enemies]) if (e.alive && e.camp?.def.index === 1) sim.applyHit(e.id, { by: 1, damage: 1e7, source: 'melee', dir: { x: 0, z: 1 } });
step(2);
const chaser = sim.enemies.find((e) => e.alive && e.camp?.def.index === 2);
let walked = true;
let reached = false;
if (chaser) {
  chaser.aggro(true, A.proxy);
  for (let t = 0; t < 30 && !reached; t += 0.05) {
    dun.tick(0.05);
    sim.update(0.05);
    if (it.areaIndex(chaser.position.x - it.x0, chaser.position.z - it.z0) < 0) walked = false;
    // Close enough to strike, or (a shooter) round the corner with you in its sights.
    if (chaser.position.distanceTo(A.position) < 3.5 || (!chaser.blind && chaser.sees(A.proxy) && chaser.position.distanceTo(A.position) < chaser.maxRange)) reached = true;
  }
}
check(!!chaser && reached && walked, `one sent after you (${chaser?.displayName}) goes round by the corridor until it has you${chaser ? ` (from ${Math.round(Math.hypot(centre(h2).x - at1.x, centre(h2).z - at1.z))} m off, never through a wall)` : ''}`);
for (const e of [...sim.enemies]) if (e.alive) sim.applyHit(e.id, { by: 1, damage: 1e7, source: 'melee', dir: { x: 0, z: 1 } });
step(1);

// The locked door: shut (it blocks, and there's no way through) until the key's found.
const locked = L.doors.find((d) => d.kind === 'locked');
const doorAt = (d) => ({ x: it.x0 + (d.axis === 'x' ? d.line : (d.s0 + d.s1) / 2), z: it.z0 + (d.axis === 'x' ? (d.s0 + d.s1) / 2 : d.line) });
const behind = L.rooms[locked.room];
const dl = doorAt(locked);
const shutNow = () => w.blocks({ x: dl.x, y: it.origin.y + locked.floor + 1, z: dl.z });
const through = () => it.nav.reachable(at1.x - it.x0, at1.z - it.z0, centre(behind).x - it.x0, centre(behind).z - it.z0);
const shut0 = shutNow() && !through();
stand(A, dl.x + (locked.axis === 'x' ? -locked.into * 2 : 0), dl.z + (locked.axis === 'x' ? 0 : -locked.into * 2));
const tooSoon = dun.use(1, locked.id, A.position, 'A');
const key = L.things.find((t) => t.kind === 'key');
stand(A, it.x0 + key.x + 1, it.z0 + key.z);
const gotKey = dun.use(1, key.id, A.position, 'A') === 'key';
stand(A, dl.x + (locked.axis === 'x' ? -locked.into * 2 : 0), dl.z + (locked.axis === 'x' ? 0 : -locked.into * 2));
const unlocked = dun.use(1, locked.id, A.position, 'A') === 'door';
check(shut0 && !tooSoon && gotKey && unlocked && !shutNow() && through(), 'the locked door holds (no way through) until the key is found and it\'s unlocked');
// Power: both nodes switched on open the power door.
const power = L.doors.find((d) => d.kind === 'power');
for (const t of L.things.filter((x) => x.kind === 'node')) { stand(A, it.x0 + t.x + 1, it.z0 + t.z); dun.use(1, t.id, A.position, 'A'); }
check(run.state.open.has(power.id) && it.isOpen(power.id), `power restored at ${power.needs} nodes opens the power door`);
// The arena: its seal opens when the mini-boss falls.
const seal = L.doors.find((d) => d.kind === 'seal');
const mini = L.rooms[L.mini];
stand(A, centre(mini).x, centre(mini).z);
step(2);
const champ = sim.enemies.find((e) => e.alive && e.camp?.def.index === L.mini && e.champion);
const sealShut = !it.isOpen(seal.id);
for (const e of [...sim.enemies]) if (e.alive && e.camp?.def.index === L.mini) sim.applyHit(e.id, { by: 1, damage: 1e7, source: 'melee', dir: { x: 0, z: 1 } });
step(2);
check(!!champ && champ.displayName === DUNGEONS.foundry.mini.name && sealShut && it.isOpen(seal.id), `${champ?.displayName ?? 'the mini-boss'} down opens the arena's seal`);
// The lift: one platform for the whole copy — called from the top, it rides up and everyone hears.
const lc = it.lift.cor;
const across = (lc.axis === 'x' ? lc.z : lc.x) * L.cell + L.cell;
const topU = lc.dir > 0 ? lc.shaft.u0 - 1.4 : lc.shaft.u1 + 1.4;
stand(A, it.x0 + (lc.axis === 'x' ? topU : across), it.z0 + (lc.axis === 'x' ? across : topU));
const told = sent.length;
const called = dun.use(1, 'lift:top', A.position, 'A') === 'lift';
const busy = dun.use(1, 'lift:bottom', A.position, 'A') === null;
step(5);
const arrived = Math.abs(run.state.lift.y - lc.shaft.top) < 1e-6 && Math.abs(it.lift.y - lc.shaft.top) < 1e-6;
const heard = sent.slice(told).filter((m) => m.msg.st?.lift).length >= 2;
check(called && busy && arrived && heard && !w.blocks({ x: it.x0 + (lc.axis === 'x' ? topU + lc.dir * 1.5 : across), y: it.origin.y + lc.shaft.top + 1, z: it.z0 + (lc.axis === 'x' ? across : topU + lc.dir * 1.5) }), 'the lift: called from the top, it rides up (one platform for everyone, told when it moves and when it arrives), and its top gate opens');
// The boss: Ironjaw, down in the furnace hall.
const bossRoom = L.rooms[L.boss];
stand(A, centre(bossRoom).x, centre(bossRoom).z);
step(2);
const boss = sim.enemies.find((e) => e.alive && e.camp?.def.index === L.boss);
for (const e of [...sim.enemies]) if (e.alive && e.camp?.def.index === L.boss) sim.applyHit(e.id, { by: 1, damage: 1e7, source: 'melee', dir: { x: 0, z: 1 } });
step(2);
check(boss?.name === 'Ironjaw' && boss.tag === 'ironjaw' && run.state.boss && clearedRuns.includes(run.id), `${boss?.displayName ?? 'its boss'} (tag ${boss?.tag}) down: the dungeon cleared`);
check(A.core.records.dungeons.foundry?.[0] === 1 && A.core.achievements.dungeon_1 !== undefined, 'it\'s in the character\'s records (open world), and "Delver" earned');
// Treasure: once each; no reward chest in the open world.
const chest = L.things.find((t) => t.kind === 'chest');
stand(A, it.x0 + chest.x + 1, it.z0 + chest.z);
const gold0 = A.stats.gold;
const first = op(A.core, { op: 'dloot', id: chest.id });
const again = op(A.core, { op: 'dloot', id: chest.id });
const reward = L.things.find((t) => t.kind === 'reward');
stand(A, it.x0 + reward.x + 1, it.z0 + reward.z);
check(first && !again && A.stats.gold > gold0 && A.core.ground.size >= 2 && !op(A.core, { op: 'dchest', id: reward.id }), 'a treasure chest opens once for each character (gold and loot); no reward chest in the open world');
// The open world fills again (like a camp), the way out past the boss.
const ex = L.things.find((t) => t.kind === 'exit');
stand(A, it.x0 + ex.x + 1, it.z0 + ex.z);
const left = op(A.core, { op: 'leave' });
check(left && !A.core.dungeon && !dun.runOf(1), 'out by the way past the boss');
check(camp(L.boss)?.slots.every((s) => s.respawnAt < Infinity), 'in the open world the boss comes back, like a camp\'s');

// ---------------------------------------------------------------- private runs
console.log('Private runs:');
const P1 = player(11, 'party:7', 9);
const P2 = player(12, 'party:7', 9);
const P3 = player(13, 'party:7', 9);
const waygate = w.npcById('n:0,0:b20');
for (const P of [P1, P2, P3]) { stand(P, waygate.x + 1, waygate.z + 1); P.quests.flags.vault_open = true; }
check(op(P1.core, { op: 'enter', d: 'vault', mode: 'run', tier: 1, via: 'gate' }), 'into a private copy of the Sunken Vault (Veteran) through Brightwater\'s waygate');
const pr = dun.runOf(11);
check(op(P2.core, { op: 'enter', d: 'vault', mode: 'run', tier: 1, via: 'gate' }) && dun.runOf(12) === pr, 'a party member walks into the same copy');
check(!op(P3.core, { op: 'enter', d: 'vault', mode: 'run', tier: 2, via: 'gate' }) && /Your party is in/.test(dun.error), 'another tier refused while the party\'s in theirs');
check(pr.level >= 9 && pr.tier === 1 && P1.core.tier === 1 && !pr.shared, `at the party's level (${pr.level}) and its tier — the Threat that counts down there`);
const PL = pr.layout;
const PI = pr.interior;
const pc = (r) => ({ x: PI.x0 + (r.x + r.w / 2) * PL.cell, z: PI.z0 + (r.z + r.h / 2) * PL.cell });
stand(P1, pc(PL.rooms[PL.boss]).x, pc(PL.rooms[PL.boss]).z);
stand(P2, pc(PL.rooms[PL.boss]).x + 2, pc(PL.rooms[PL.boss]).z);
step(2);
for (const e of [...sim.enemies]) if (e.alive && e.camp?.def.run === pr.id) sim.applyHit(e.id, { by: 11, damage: 1e7, source: 'melee', dir: { x: 0, z: 1 } });
step(2);
const keeper = sim.encounters.camps.get(`dr:${pr.id}:${PL.boss}`);
check(pr.state.boss && keeper.slots.every((s) => s.respawnAt === Infinity), 'the boss down; nothing comes back in a private copy');
check(P1.core.records.dungeons.vault?.[2] === 1 && P2.core.records.dungeons.vault?.[2] === 1, 'both party members have the Veteran clear in their records');
const pReward = PL.things.find((t) => t.kind === 'reward');
stand(P1, PI.x0 + pReward.x + 1, PI.z0 + pReward.z);
const got = op(P1.core, { op: 'dchest', id: pReward.id });
const loot = P1.core.ground.size;
check(got && loot >= 3 && P1.core.settings.lockouts?.[lockKey('vault', 1)] !== undefined, `the reward chest: ${loot} items, rare and better`);
check(!op(P1.core, { op: 'dchest', id: pReward.id }), '...once (not again)');
// Out, and in again at another tier and the same one: the chest is once a day per tier.
const pex = PL.things.find((t) => t.kind === 'portal');
for (const P of [P1, P2]) { stand(P, PI.x0 + pex.x + 0.5, PI.z0 + pex.z); op(P.core, { op: 'leave' }); }
const lockedRun = (tier) => {
  stand(P1, waygate.x + 1, waygate.z + 1);
  op(P1.core, { op: 'enter', d: 'vault', mode: 'run', tier, via: 'gate' });
  const r = dun.runOf(11);
  const rc = (x) => ({ x: r.interior.x0 + (x.x + x.w / 2) * r.layout.cell, z: r.interior.z0 + (x.z + x.h / 2) * r.layout.cell });
  stand(P1, rc(r.layout.rooms[r.layout.boss]).x, rc(r.layout.rooms[r.layout.boss]).z);
  step(2);
  for (const e of [...sim.enemies]) if (e.alive && e.camp?.def.run === r.id) sim.applyHit(e.id, { by: 11, damage: 1e7, source: 'melee', dir: { x: 0, z: 1 } });
  step(2);
  const rw = r.layout.things.find((t) => t.kind === 'reward');
  stand(P1, r.interior.x0 + rw.x + 1, r.interior.z0 + rw.z);
  const ok = op(P1.core, { op: 'dchest', id: rw.id });
  const pt = r.layout.things.find((t) => t.kind === 'portal');
  stand(P1, r.interior.x0 + pt.x + 0.5, r.interior.z0 + pt.z);
  op(P1.core, { op: 'leave' });
  return { ok, id: r.id, slot: r.slot };
};
const elite = lockedRun(2);
const vet = lockedRun(1);
check(elite.ok && !vet.ok, 'another tier\'s chest opens the same day; the same tier\'s doesn\'t');
// Empty copies close after ten minutes; their pocket slots are used again.
const before = dun.runs.size;
step(CLOSE_AFTER + 5, 1);
const closed = !dun.runs.has(elite.id) && !dun.runs.has(vet.id) && !w.interiors.has(elite.id) && ![...sim.encounters.camps.keys()].some((k) => k.startsWith(`dr:${vet.id}:`));
stand(P3, waygate.x + 1, waygate.z + 1);
op(P3.core, { op: 'enter', d: 'foundry', mode: 'run', tier: 0, via: 'gate' });
const again2 = dun.runOf(13);
check(closed && dun.free.length >= 0 && [elite.slot, vet.slot].includes(again2?.slot), `empty copies closed after ${CLOSE_AFTER / 60} minutes (${before} → ${dun.runs.size - 1} left) and a pocket slot used again`);

// ---------------------------------------------------------------- saved down there
console.log('Saved down there:');
const realm = { sessions: new Map(), parties: { partyOf: () => null, mates: () => [] } };
const simhost = new SimHost(realm, seed);
const session = { id: 99, charId: 'c99', proxy: { position: new THREE.Vector3() } };
const saved = { ...P3.core.toJSON(), pos: [again2.origin.x + 10, again2.origin.y, again2.origin.z + 10] };
const { extras } = loadCharacter(session, saved, simhost);
check(!inPocket(session.proxy.position.x) && Math.hypot(session.proxy.position.x - waygate.x, session.proxy.position.z - waygate.z) < 3 && !inPocket(extras.pos[0]),
  'a character saved in a dungeon comes back outside, where they went in');
check(pocketOrigin(0).x >= 50000, 'pockets lie far past the land');

console.log(failed ? `dungeoncheck: ${failed} failed` : 'dungeoncheck: all good');
process.exit(failed ? 1 : 0);
