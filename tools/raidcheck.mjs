// Check: raids (gameplay phase 7). The telegraph shapes; the raid bosses' scripts as data (every
// phase's attacks, mechanic, add and cast there to be had); the Brood Mother's layout across many
// copies (three arenas in order, each with its gate in and its chest, the seals onward, the way
// out past the last, everyone on a floor, nothing reachable past a shut gate); raid groups as the
// server runs them (forming, inviting parties and lone players, accepting, the size limits,
// leaving, a party that disbands, the instance key they share); then a raid copy run headlessly
// through the instance manager, the world sim and the characters' own rules: in through a city's
// raid gate (and what's refused), the size cap, each arena's pull and its gate shutting, the
// bosses' health for who's there, marks and their landings, phases at their thresholds, adds,
// a shield that bursts if it isn't broken, enrage, a wipe and the reset, the kills and the gate and
// seal opening, the Choir's seams and its rally, a soak shared and one failed, the Brood Mother's
// hearts (immune until they're torn out), her eggs hatching, her charge down its line, the
// checkpoint, the records and achievements, and each arena's chest once a week per tier.
// Run: node tools/raidcheck.mjs [seed]
import * as THREE from 'three';
import { HeadlessWorld } from '../server/world.js';
import { WorldSim } from '../src/sim/WorldSim.js';
import { Dungeons } from '../src/sim/Dungeons.js';
import { generateDungeon } from '../src/world/DungeonGen.js';
import { Interior } from '../src/world/Interior.js';
import { RAIDS, RAID_SIZE, lockWeek, weekEnds, raidLockKey, instanceDef } from '../src/world/raids.js';
import { BOSS_SCRIPTS, RAID_TYPES, raidHealth, amount } from '../src/combat/bosses.js';
import { ENEMY_TYPES } from '../src/combat/bestiary.js';
import { BESTIARY } from '../src/rpg/codex.js';
import { inShape, packShape, readShape } from '../src/combat/shapes.js';
import { Stats } from '../src/rpg/Stats.js';
import { Inventory } from '../src/items/Inventory.js';
import { QuestLog } from '../src/rpg/Quests.js';
import { CharacterCore } from '../src/rpg/CharacterCore.js';
import { generateArmor } from '../src/items/ArmorGenerator.js';
import { itemFromRecipe } from '../src/items/items.js';
import { GEAR_SETS } from '../src/items/sets.js';
import { Parties } from '../server/parties.js';
import { RaidGroups } from '../server/raidgroups.js';

const seed = Number(process.argv[2] ?? 12345);
let failed = 0;
const check = (ok, what) => {
  if (!ok) failed++;
  console.log(`  ${ok ? '✓' : '✗'} ${what}`);
  return ok;
};
const def = RAIDS.broodmother;

// ---------------------------------------------------------------- shapes
console.log('Shapes:');
{
  const at = [0, 0, 0];
  const circle = { sh: 'circle', p: at, r: 3 };
  const ring = { sh: 'ring', p: at, r: 10, r0: 4 };
  const cone = { sh: 'cone', p: at, r: 10, a: 0, arc: 90 };     // facing +z
  const line = { sh: 'line', p: at, r: 20, a: Math.PI / 2, w: 2 }; // along +x
  const cross = { sh: 'cross', p: at, r: 8, a: 0, w: 2 };
  check(inShape(circle, 2, 2) && !inShape(circle, 3, 3) && inShape(circle, 3, 1, 0.5), 'a circle: in, out, and a body at its edge');
  check(!inShape(ring, 1, 0) && inShape(ring, 6, 0) && !inShape(ring, 11, 0), 'a ring: safe inside its hole and outside it');
  check(inShape(cone, 0, 5) && inShape(cone, 3, 5) && !inShape(cone, 6, 2) && !inShape(cone, 0, -2), 'a cone: in front, at its edge, not to the side or behind');
  check(inShape(line, 15, 0.5) && !inShape(line, 15, 2) && !inShape(line, -3, 0) && !inShape(line, 22, 0), 'a line: along it, not beside, behind or past its end');
  check(inShape(cross, 0, 7) && inShape(cross, -7, 0) && !inShape(cross, 4, 4), 'a cross: along both arms, not between them');
  const back = readShape(JSON.parse(JSON.stringify(packShape({ ...cone, p: [1.234567, 2, 3] }))));
  check(back && back.sh === 'cone' && back.arc === 90 && back.p[0] === 1.23 && !readShape({ sh: 'blob', p: at, r: 1 }) && !readShape({ sh: 'circle', p: at, r: -1 }), 'shapes go over the network rounded, and nonsense is refused');
}

// ---------------------------------------------------------------- scripts as data
console.log('Boss scripts:');
{
  const bad = [];
  for (const enc of def.encounters) {
    for (const u of enc.units) {
      const S = BOSS_SCRIPTS[u.script];
      const T = ENEMY_TYPES[u.type];
      if (!S || !T) { bad.push(`${enc.id}: ${u.script}/${u.type} missing`); continue; }
      const ids = new Set(T.attacks.map((a) => a.id));
      let last = 2;
      for (const P of S.phases) {
        if (!(P.at <= last)) bad.push(`${u.script}: phases out of order`);
        last = P.at;
        for (const a of P.attacks ?? []) if (!ids.has(a)) bad.push(`${u.script}: no attack ${a}`);
        for (const m of [...(P.use ?? []), ...(P.now ?? [])]) if (!S.mechanics[m]) bad.push(`${u.script}: no mechanic ${m}`);
        for (const a of P.attacks ?? []) if (T.attacks.find((x) => x.id === a)?.cooldown === Infinity) bad.push(`${u.script}: ${a} is a script-only cast`);
      }
      for (const [id, m] of Object.entries(S.mechanics)) {
        if (m.cast && T.attacks.find((x) => x.id === m.cast)?.cooldown !== Infinity) bad.push(`${u.script}.${id}: cast ${m.cast} isn't script-only`);
        if (m.kind === 'charge' && T.attacks.find((x) => x.id === m.attack)?.kind !== 'charge') bad.push(`${u.script}.${id}: no charge ${m.attack}`);
        for (const x of [...(m.units ?? []), ...(m.hatch?.into ?? [])]) if (!ENEMY_TYPES[x.type]) bad.push(`${u.script}.${id}: no type ${x.type}`);
        if ((m.kind === 'aoe' || m.kind === 'hazard') && !readShape({ ...m.shape, p: [0, 0, 0], a: 0 })) bad.push(`${u.script}.${id}: bad shape`);
      }
    }
  }
  check(!bad.length, `every phase's attacks, mechanics, casts, charges and adds exist (${Object.keys(BOSS_SCRIPTS).length} scripts)${bad.length ? ` — ${bad.slice(0, 4).join('; ')}` : ''}`);
  check(Object.keys(RAID_TYPES).every((id) => ENEMY_TYPES[id] && BESTIARY[id]?.lore), `the raid's ${Object.keys(RAID_TYPES).length} enemy types are in the bestiary and the codex`);
  check(raidHealth(1) > 2 && raidHealth(12) === 48 && [1, 2, 4, 8, 12, 16].every((n, i, a) => !i || raidHealth(n) > raidHealth(a[i - 1])), `boss health grows with the raid: ×${raidHealth(1).toFixed(1)} alone, ×${raidHealth(4).toFixed(1)} for four, ×${raidHealth(12)} for twelve`);
  check(amount('per4', 1) === 1 && amount('per4', 12) === 3 && amount('per3', 7) === 3 && amount(2, 12) === 2 && amount('all', 5) === 5, 'counts by the raid\'s size (per4, per3, all, numbers)');
}

// ---------------------------------------------------------------- layouts
console.log('Layout:');
{
  const SHUFFLES = 20;
  const bad = [];
  let ms = 0;
  for (let k = 0; k < SHUFFLES; k++) {
    const t0 = performance.now();
    const L = generateDungeon(def, { shuffle: (k * 7919) >>> 0, level: def.level + (k % 3) * 3 });
    ms += performance.now() - t0;
    const it = new Interior(L, { x: 0, y: 0, z: 0 });
    const arenas = L.arenas;
    if (arenas.length !== def.encounters.length || arenas.some((A, i) => A.enc !== i)) bad.push(`#${k} arenas`);
    const c = (r) => ({ x: (r.x + r.w / 2) * L.cell, z: (r.z + r.h / 2) * L.cell });
    const start = c(L.rooms[0]);
    for (const A of arenas) {
      const r = L.rooms[A.room];
      const gate = L.doors.find((d) => d.kind === 'gate' && d.room === A.room);
      const seal = L.doors.find((d) => d.kind === 'seal' && d.room === A.room);
      if (!gate) bad.push(`#${k} arena ${A.enc}: no gate`);
      if (A.enc < arenas.length - 1 && !seal) bad.push(`#${k} arena ${A.enc}: no seal onward`);
      if (!L.things.some((t) => t.kind === 'reward' && t.enc === A.enc && t.room === A.room)) bad.push(`#${k} arena ${A.enc}: no chest`);
      const units = L.spawns.find((s) => s.room === A.room)?.units ?? [];
      if (units.length !== def.encounters[A.enc].units.length || units.some((u) => !u.opts.script || !u.opts.boss)) bad.push(`#${k} arena ${A.enc}: bosses`);
      for (const u of units) if (it.areaIndex(u.x, u.z) !== A.room) bad.push(`#${k} ${u.type} off its arena`);
      // Shut the gate: no way in; open every door: the way there.
      for (const d of L.doors) it.nav.setBlocked(it.doorCells(d), d === gate);
      if (it.nav.reachable(start.x, start.z, c(r).x, c(r).z)) bad.push(`#${k} arena ${A.enc} reachable through its shut gate`);
      for (const d of L.doors) it.nav.setBlocked(it.doorCells(d), false);
      if (!it.nav.reachable(start.x, start.z, c(r).x, c(r).z)) bad.push(`#${k} arena ${A.enc} out of reach`);
    }
    const lastRoom = arenas[arenas.length - 1]?.room;
    if (!L.things.some((t) => t.kind === 'exit' && t.room === lastRoom) || !L.things.some((t) => t.kind === 'portal')) bad.push(`#${k} ways out`);
    const areas = [...L.rooms, ...L.cors];
    areas.forEach((a, i) => { for (let z = a.z; z < a.z + a.h; z++) for (let x = a.x; x < a.x + a.w; x++) if (L.cells[z * L.W + x] !== i + 1) bad.push(`#${k} overlap`); });
    for (const s of L.spawns) for (const u of s.units) if (it.areaIndex(u.x, u.z) !== s.room || L.pillars.some((p) => Math.hypot(p.x - u.x, p.z - u.z) < p.r + 0.5)) bad.push(`#${k} ${u.type} off the floor`);
    if (L.W * L.cell > 400) bad.push(`#${k} bigger than a pocket slot`);
  }
  const L0 = generateDungeon(def);
  check(!bad.length, `${def.name}: ${SHUFFLES} copies — ${L0.rooms.length} rooms, ${L0.arenas.length} arenas in order, each behind its gate with its chest, ${(ms / SHUFFLES).toFixed(1)} ms each${bad.length ? ` — ${[...new Set(bad)].slice(0, 4).join('; ')}` : ''}`);
}

// ---------------------------------------------------------------- raid groups
console.log('Raid groups:');
{
  const sent = new Map();
  const sessions = new Map();
  const realm = { sessions, standalone: true, store: { pinAffinity: async () => {}, dropAffinity: async () => {} }, social: null, layer: 0 };
  let sid = 1;
  const join = (name) => {
    const s = { id: sid, charId: 100 + sid, name, level: 16, state: { p: [sid, 0, 0], hp: 1, fl: 0 }, send: (m) => sent.get(s).push(m) };
    sid++;
    sent.set(s, []);
    sessions.set(s.id, s);
    return s;
  };
  realm.parties = new Parties(realm);
  const raids = new RaidGroups(realm);
  realm.raids = raids;
  const said = (s, re) => sent.get(s).some((m) => m.t === 'chat' && re.test(m.text));
  const party = (lead, ...rest) => { for (const m of rest) { realm.parties.invite(lead, m.name); realm.parties.accept(m); } return realm.parties.partyOf(lead); };
  const A = [join('Ana'), join('Ben'), join('Cy'), join('Dee')];
  const B = [join('Eve'), join('Fox'), join('Gil')];
  const C = [join('Hal'), join('Ivy'), join('Jo'), join('Kit')];
  const lone = join('Lou');
  const extra = [join('Mo'), join('Ned')];
  party(A[0], A[1], A[2], A[3]);
  party(B[0], B[1], B[2]);
  party(C[0], C[1], C[2], C[3]);
  raids.form(A[1]);
  check(!raids.groupOf(A[1]) && said(A[1], /leader/), 'only a party\'s leader can form a raid group');
  raids.form(A[0]);
  raids.invite(A[0], 'Fox');                     // invites Eve's party, through one of its members
  check(sent.get(B[0]).some((m) => m.t === 'rinvite' && m.from === 'Ana'), 'an invitation to another party goes to its leader, whoever was named');
  raids.accept(B[1]);
  check(!raids.groupOf(B[0]), '…and only its leader can answer for it');
  raids.accept(B[0]);
  raids.invite(A[0], 'Hal');
  raids.accept(C[0]);
  const g = raids.groupOf(A[0]);
  check(g && raids.size(g) === 11 && g.units.length === 3 && raids.keyOf(B[2]) === raids.keyOf(A[3]) && raids.keyOf(C[3]) === `raid:${g.id}`, `three parties linked: ${raids.size(g)} players, one instance key for all of them`);
  raids.invite(A[0], 'Lou');
  raids.accept(lone);
  check(raids.size(g) === RAID_SIZE && raids.keyOf(lone) === raids.keyOf(A[0]), `a lone player joins as a party of one (${raids.size(g)} of ${RAID_SIZE})`);
  party(extra[0], extra[1]);
  raids.invite(A[0], 'Mo');
  check(!sent.get(extra[0]).some((m) => m.t === 'rinvite') && said(A[0], /more than 12|parties at most/), 'no more than twelve');
  raids.invite(B[0], 'Mo');
  check(said(B[0], /Only the raid leader/), 'only the raid leader invites');
  raids.chat(C[2], 'pull on three');
  check(sent.get(lone).some((m) => m.t === 'chat' && m.ch === 'raid' && m.from === 'Jo'), '/ra reaches the whole raid');
  raids.tick(Date.now() + 2000);
  check(sent.get(A[2]).some((m) => m.t === 'rp' && m.rp.length === RAID_SIZE) && sent.get(A[2]).some((m) => m.t === 'raid' && m.raid?.units.length === 4), 'everyone gets the roster and everyone\'s whereabouts once a second');
  realm.parties.leave(B[1]); realm.parties.leave(B[2]);   // Eve's party falls to one: disbanded
  raids.tick(Date.now() + 4000);
  check(raids.size(g) === 9 && !raids.keyOf(B[0]), `a party that disbands is gone from the raid (${raids.size(g)} left)`);
  raids.promote(A[0], 'Hal');
  check(g.leader === C[0].charId, 'the lead passes to another party\'s leader');
  raids.leave(A[0]);
  check(!raids.keyOf(A[1]) && g.units.length === 2 && g.leader === C[0].charId, 'a party leader takes their party out');
  raids.disband(C[0]);
  check(!raids.groups.size && !raids.keyOf(lone) && sent.get(lone).some((m) => m.t === 'raid' && m.raid === null), 'disbanded: everyone told');
}

// ---------------------------------------------------------------- a raid, headless
console.log(`A raid (seed ${seed}):`);
const w = new HeadlessWorld(seed);
const players = new Map();
const events = [];
const sent = [];
const host = {
  world: w, emit: (ev) => events.push(ev), onKilled() {},
  onRoomCleared: (camp) => dun.onRoomCleared(camp),
  onRoomRestored: (camp) => dun.onRoomRestored(camp),
};
const sim = new WorldSim(host);
const cores = new Map();
const dun = new Dungeons({
  world: w, sim,
  send: (id, msg) => sent.push({ id, msg }),
  positionOf: (id) => players.get(id)?.position ?? null,
  cleared: (run, enc) => {
    const roll = { raid: run.def.id, enc: enc.def.id, name: enc.def.name, tier: run.tier ?? 0, final: enc === run.raid.last, flawless: !enc.fell };
    for (const id of run.players) cores.get(id)?.apply({ op: 'rclear', roll });
  },
});
function player(id, key, level = 16) {
  const position = new THREE.Vector3();
  const proxy = { id, position, velocity: new THREE.Vector3(), radius: 0.45, height: 2, alive: true };
  players.set(id, proxy);
  sim.setPlayers([...players.values()]);
  const stats = new Stats();
  stats.level = level;
  const quests = new QuestLog({ hud: null, world: w, encounters: { isCleared: () => false }, stats, player: { position } });
  const core = new CharacterCore({ stats, inventory: new Inventory(3), quests, attuned: new Set(['w-hub']), chests: new Set(), shop: { stock: [], fine: [] }, settings: { lootFilter: 0 }, position, world: w, strict: true });
  const who = () => ({ id, position, party: `solo:${id}`, raid: key, level: stats.level, flags: quests.flags });
  core.dungeons = {
    enter: (ask) => dun.enter(who(), ask),
    leave: () => dun.leave(who()),
    current: () => { const r = dun.runOf(id); return r && { dungeon: r.def.id, tier: r.tier, shared: r.shared, raid: !!r.raid }; },
    claim: (tid, kind) => dun.claim(id, `c${id}`, tid, position, kind),
  };
  cores.set(id, core);
  return { id, proxy, core, position, stats };
}
const op = (core, o) => core.apply({ ...o, roll: core.roll(o) }).ok;
const step = (s = 1, dt = 0.05) => { for (let t = 0; t < s; t += dt) { dun.tick(dt); sim.update(dt); } };
const stand = (P, x, z) => P.position.set(x, w.groundHeight(x, z), z);
const hit = (e, damage, by = 1) => sim.applyHit(e.id, { by, damage, source: 'melee', dir: { x: 0, z: 1 } });
const toFrac = (e, f, by = 1) => { if (e.hp > e.maxHp * f) hit(e, Math.ceil(e.hp - e.maxHp * f) + 1, by); };
const since = (n) => events.slice(n);

// The raid gate in a city's gate yard.
const city = w.gen.cities()[1];
const yard = w.poisNear(city.x, city.z, 160, ['district']).find((d) => d.kind === 'gates');
const gateNpc = yard?.npcs.find((n) => n.role === 'gate' && n.gate === 'raid');
check(!!gateNpc, `${city.name}'s gate yard has its raid gate`);
const R = [];
for (let i = 0; i < 6; i++) R.push(player(1 + i, 'raid:7'));
const low = player(40, 'raid:7', 9);
for (const P of [...R, low]) stand(P, gateNpc.x + 1.5, gateNpc.z + 1);
check(!op(low.core, { op: 'enter', d: 'broodmother', mode: 'run', tier: 1, via: 'gate' }) && /level 14/.test(dun.error), `refused below its level ("${dun.error}")`);
stand(R[0], gateNpc.x + 60, gateNpc.z);
check(!op(R[0].core, { op: 'enter', d: 'broodmother', mode: 'run', tier: 1, via: 'gate' }), 'refused away from the gate');
stand(R[0], gateNpc.x + 1.5, gateNpc.z + 1);
const waygate = w.npcById('n:0,0:b20');
const atWaygate = player(41, 'raid:9');
stand(atWaygate, waygate.x + 1, waygate.z + 1);
check(!op(atWaygate.core, { op: 'enter', d: 'broodmother', mode: 'run', tier: 0, via: 'gate' }), 'a dungeon waygate isn\'t a raid gate');
for (const P of R) op(P.core, { op: 'enter', d: 'broodmother', mode: 'run', tier: 1, via: 'gate' });
const run = dun.runOf(1);
check(!!run?.raid && R.every((P) => dun.runOf(P.id) === run && P.core.dungeon?.d === 'broodmother' && P.core.tier === 1), `the raid group (${R.length}) into one Veteran copy of ${def.name}, level ${run?.level}`);
// The size cap: twelve in a copy.
const more = [];
for (let i = 0; i < RAID_SIZE - R.length; i++) { const P = player(60 + i, 'raid:7'); stand(P, gateNpc.x + 1.5, gateNpc.z + 1); op(P.core, { op: 'enter', d: 'broodmother', mode: 'run', tier: 1, via: 'gate' }); more.push(P); }
const thirteenth = player(80, 'raid:7');
stand(thirteenth, gateNpc.x + 1.5, gateNpc.z + 1);
check(run.players.size === RAID_SIZE && !op(thirteenth.core, { op: 'enter', d: 'broodmother', mode: 'run', tier: 1, via: 'gate' }) && /full/.test(dun.error), `twelve in, the thirteenth refused ("${dun.error}")`);
// The rest go back out by the portal: six fight.
const L = run.layout;
const it = run.interior;
const portal = L.things.find((t) => t.kind === 'portal');
for (const P of more) { stand(P, it.x0 + portal.x + 0.5, it.z0 + portal.z); op(P.core, { op: 'leave' }); players.delete(P.id); }
sim.setPlayers([...players.values()].filter((p) => R.some((P) => P.id === p.id)));
for (const id of [40, 41, 80]) players.delete(id);
check(run.players.size === R.length, `six left inside (${run.players.size})`);

const centre = (room) => { const r = L.rooms[room]; return { x: it.x0 + (r.x + r.w / 2) * L.cell, z: it.z0 + (r.z + r.h / 2) * L.cell }; };
const camp = (room) => sim.encounters.camps.get(`dr:${run.id}:${room}`);
const clearRoom = (room) => {
  const c = centre(room);
  R.forEach((P, i) => stand(P, c.x + (i % 3) - 1, c.z + Math.floor(i / 3) - 0.5));
  step(1.5);
  for (const e of [...sim.enemies]) if (e.alive && e.camp?.def.index === room) hit(e, 1e8);
  step(1);
};
const encOf = (i) => run.raid.encounters[i];
const intoArena = (i, spread = 1.4) => {
  const c = centre(encOf(i).room);
  R.forEach((P, k) => stand(P, c.x + ((k % 3) - 1) * spread, c.z + (Math.floor(k / 3) - 0.5) * spread - 4));
};
const bossesOf = (i) => [...encOf(i).scripts.values()].map((s) => s.boss);
const doorOpen = (d) => run.state.open.has(d.id) && it.isOpen(d.id);

// Trash before the first arena.
clearRoom(1);
check(run.state.cleared.has(1), 'the first hall\'s trash down');

// ---------------------------------------------------------------- the Brood Warden
const E0 = encOf(0);
intoArena(0);
step(1.5);
const warden = bossesOf(0)[0];
const ws = E0.scripts.get('warden');
const want = Math.round(ws.hp0 * raidHealth(6));
check(!!warden && E0.state === 'fight' && !doorOpen(E0.gate) && w.blocks({ x: it.x0 + (E0.gate.axis === 'x' ? E0.gate.line : (E0.gate.s0 + E0.gate.s1) / 2), y: it.origin.y + E0.gate.floor + 1, z: it.z0 + (E0.gate.axis === 'x' ? (E0.gate.s0 + E0.gate.s1) / 2 : E0.gate.line) }),
  `${warden?.displayName} pulled: the gate shuts behind the raid`);
check(Math.abs(warden.maxHp - want) <= 1 && warden.hp === warden.maxHp, `its health for six: ${warden.maxHp} (×${raidHealth(6).toFixed(1)} a solo boss's)`);
step(1);
check(Math.abs(warden.maxHp - want) <= 1, '…and the crowd round it doesn\'t add to that');
let n0 = events.length;
step(12);
const marks = since(n0).filter((e) => e.k === 'rt');
const lands = since(n0).filter((e) => e.k === 'rb');
const pools = since(n0).filter((e) => e.k === 'hz');
check(marks.length >= 2 && marks.every((m) => readShape(m.s)) && lands.some((l) => marks.some((m) => m.mk === l.mk)) && pools.length > 0,
  `its mechanics mark the floor and land (${marks.length} marks: ${[...new Set(marks.map((m) => m.nm))].join(', ')}; ${lands.length} landings, ${pools.length} acid pools)`);
const spit = marks.find((m) => m.nm === 'Acid Spit');
check(!!spit && R.some((P) => inShape(readShape(spit.s), P.position.x, P.position.z, 0.5)), 'acid spit lands on members of the raid');
n0 = events.length;
toFrac(warden, 0.69);
step(0.5);
const brood = ws.adds.filter((a) => a.e.alive);
check(ws.phase === 1 && since(n0).some((e) => e.k === 'rph' && e.ph === 1) && brood.length === amount('per3', 6) + amount('per4', 6) * 2,
  `at seven tenths, "${BOSS_SCRIPTS.warden.phases[1].name}": the brood comes out of the walls (${brood.length})`);
toFrac(warden, 0.34);
step(0.5);
check(ws.phase === 2 && warden.shield > 0, `at a third, "${BOSS_SCRIPTS.warden.phases[2].name}": its carapace hardens (${warden.shield} shield)`);
n0 = events.length;
step(BOSS_SCRIPTS.warden.mechanics.harden.time + 1.5);
check(warden.shield === 0 && since(n0).some((e) => e.k === 'rb' && readShape(e.s)?.r >= 80), 'not broken in time: it bursts over the whole arena');
const d0 = warden.attacks[0].damage;
ws.t = BOSS_SCRIPTS.warden.enrage - 0.5;
step(1);
check(ws.enraged && warden.attacks[0].damage === Math.round(ws.base[0] * 3) && d0 === ws.base[0], `enraged at ${BOSS_SCRIPTS.warden.enrage / 60} minutes: three times the damage`);
// Everyone down: a wipe.
for (const P of R) P.proxy.alive = false;
step(4.5);
check(E0.state === 'idle' && doorOpen(E0.gate) && warden.alive && !ws.enraged && ws.adds.length === 0 && sim.enemies.filter((e) => e.alive && e.summoner === warden).length === 0,
  'everyone down: a wipe — the adds go, the gate opens, the Warden goes home');
step(8);
check(warden.hp === warden.maxHp && !warden.engaged, '…and it\'s whole again, waiting');
for (const P of R) P.proxy.alive = true;
intoArena(0);
step(1.5);
check(E0.state === 'fight' && ws.phase === 0, 'pulled again from the start');
hit(warden, 1e9);
step(1.5);
check(E0.state === 'down' && doorOpen(E0.gate) && doorOpen(E0.seal) && run.state.cleared.has(E0.room), 'the Warden down: its gate and the seal onward open');
check(R.every((P) => P.core.records.raids.broodmother?.warden?.[1] === 1 && P.core.achievements.raid_warden !== undefined && P.core.achievements.raid_flawless !== undefined),
  'in everyone\'s records (Veteran), with "Through the Gate" and — nobody fell — "Untouched"');
const cp = dun.startOf(R[0].id);
check(cp && Math.hypot(cp.x - centre(E0.room).x, cp.z - centre(E0.room).z) < 1, 'a fall now comes back in the Warden\'s arena');
// Its chest: once a week for this tier.
const chest0 = L.things.find((t) => t.kind === 'reward' && t.enc === 0);
stand(R[0], it.x0 + chest0.x + 1, it.z0 + chest0.z);
const g0 = R[0].stats.gold;
const got0 = op(R[0].core, { op: 'dchest', id: chest0.id });
const key0 = raidLockKey('broodmother', 'warden', 1);
check(got0 && R[0].stats.gold > g0 && R[0].core.ground.size >= 3 && R[0].core.settings.lockouts[key0] === lockWeek(), `the Warden's chest: ${R[0].core.ground.size} items and gold, locked for the week`);
check(!op(R[0].core, { op: 'dchest', id: chest0.id }), '…and not again');
const chest2 = L.things.find((t) => t.kind === 'reward' && t.enc === 2);
stand(R[1], it.x0 + chest2.x + 1, it.z0 + chest2.z);
check(!op(R[1].core, { op: 'dchest', id: chest2.id }), 'the last arena\'s chest stays shut while its boss stands');

// ---------------------------------------------------------------- the Psion Choir
clearRoom(3);
const E1 = encOf(1);
intoArena(1);
step(2);
const choir = bossesOf(1);
const names = choir.map((b) => b.displayName);
check(choir.length === 3 && E1.state === 'fight' && choir.every((b) => b.engaged) && !doorOpen(E1.gate), `the Choir pulled together: ${names.join(', ')}`);
// Resonance: seams strung between the three.
n0 = events.length;
E1.scripts.get('sorrow').fire('resonance');
step(2.5);
const seams = since(n0).filter((e) => e.k === 'hz' && e.s.sh === 'line');
check(seams.length === 3, `Resonance strings ${seams.length} seams between them`);
// A lullaby shared — and one too few stood in.
const sleep = E1.scripts.get('sleep');
const L1 = BOSS_SCRIPTS.sleep.mechanics.lullaby;
const need = amount(L1.soak.need, 6);
const c1 = centre(E1.room);
R.forEach((P, k) => stand(P, c1.x + (k % 3) * 0.6, c1.z + Math.floor(k / 3) * 0.6));
n0 = events.length;
sleep.fire('lullaby');
step(L1.warn + 2);
const shared = since(n0).find((e) => e.k === 'rb' && !e.fail);
check(!!shared && !since(n0).some((e) => e.fail) && shared.dmg < Math.round(sleep.unit * L1.dmg * sleep.mult), `the Lullaby shared by all six (it needs ${need}): each takes less (${shared?.dmg})`);
R.forEach((P, k) => stand(P, c1.x + (k - 2.5) * 6, c1.z));
n0 = events.length;
sleep.fire('lullaby');
step(L1.warn + 2);
check(since(n0).some((e) => e.k === 'rb' && e.fail && readShape(e.s).r >= 100), 'spread out, too few in it: everyone takes the blast');
// One falls; the others rally.
const rage = E1.scripts.get('rage');
const d1 = rage.boss.attacks[0].damage;
hit(E1.scripts.get('sorrow').boss, 1e9);
step(0.5);
check(rage.empower > 1.2 && rage.boss.attacks[0].damage > d1 && E1.state === 'fight', `Vael falls: the others sing louder (×${rage.empower})`);
for (const b of choir) if (b.alive) hit(b, 1e9);
step(1.5);
check(E1.state === 'down' && doorOpen(E1.seal) && R.every((P) => P.core.records.raids.broodmother?.choir?.[1] === 1 && P.core.achievements.raid_choir !== undefined), 'the Choir silenced: "Silence", and the way on opens');

// ---------------------------------------------------------------- the Brood Mother
clearRoom(5);
const E2 = encOf(2);
intoArena(2);
step(2);
const mother = bossesOf(2)[0];
const ms = E2.scripts.get('mother');
check(!!mother && E2.state === 'fight', `${mother?.displayName} pulled`);
// Her clutch: eggs, and what comes of leaving them.
ms.fire('clutch');
step(1.6);
const eggs = ms.adds.filter((a) => a.e.typeName === 'eggsac');
check(eggs.length === amount('per4', 6), `she lays a clutch (${eggs.length})`);
step(BOSS_SCRIPTS.mother.mechanics.clutch.hatch.after + 0.5);
check(eggs.every((a) => !a.e.alive) && ms.adds.some((a) => a.e.typeName === 'drone' && a.e.alive), 'left alone, the eggs hatch into drones');
for (const a of [...ms.adds]) if (a.e.alive) hit(a.e, 1e9);
// The Brood Shield: hearts, and her immune till they're torn out.
n0 = events.length;
toFrac(mother, 0.69);
step(0.5);
const hearts = ms.adds.filter((a) => a.e.typeName === 'broodheart');
const back = run.layout.arenas.find((A) => A.enc === 2).back;
check(ms.phase === 1 && hearts.length === 3 && ms.immune && mother.immune && Math.hypot(mother.position.x - (it.x0 + back.x), mother.position.z - (it.z0 + back.z)) < 2 && since(n0).some((e) => e.k === 'blink'),
  'at seven tenths: she withdraws to the back of the nest behind three Brood Hearts');
const hp0 = mother.hp;
hit(mother, 1e6);
step(0.2);
check(mother.hp === hp0 && events.some((e) => e.k === 'rimm'), '…and can\'t be hurt while they beat');
n0 = events.length;
ms.fire('cataclysm');
step(3.5);
check(since(n0).some((e) => e.k === 'rb' && readShape(e.s).r >= 80), 'the nest convulses while she\'s shielded');
for (const h of hearts) hit(h.e, 1e9);
step(0.5);
check(!ms.immune && !mother.immune, 'the hearts torn out: her shield breaks');
hit(mother, 1000);
check(mother.hp < hp0, '…and she can be hurt again');
toFrac(mother, 0.39);
step(0.5);
check(ms.phase === 2, `at four tenths: "${BOSS_SCRIPTS.mother.phases[2].name}"`);
// Devour: her charge, down a marked line at the furthest of you.
R.forEach((P, k) => stand(P, mother.position.x + 3 + k * 0.4, mother.position.z));
stand(R[5], mother.position.x - 14, mother.position.z + 2);
// (Her own timers keep going: wait till she's free, then till the line is down.)
ms.next.clear();
for (let k = 0; k < 80 && !ms.free(); k++) step(0.1);
n0 = events.length;
ms.fire('devour');
let line = null;
for (let k = 0; k < 30 && !line; k++) { step(0.05); line = since(n0).find((e) => e.k === 'rt' && e.s.sh === 'line'); }
const aim = Math.atan2(R[5].position.x - mother.position.x, R[5].position.z - mother.position.z);
check(!!line && mother.cur?.id === 'devour' && Math.abs(Math.atan2(Math.sin(line.s.a - aim), Math.cos(line.s.a - aim))) < 0.1, 'Devour: a line marked to the furthest of you, and she winds up down it');
step(0.8);
check(!!line && Math.abs(Math.atan2(Math.sin(mother.facing - line.s.a), Math.cos(mother.facing - line.s.a))) < 0.05, '…keeping to it');
hit(mother, 1e9);
step(1.5);
check(E2.state === 'down' && run.state.boss && R.every((P) => P.core.records.raids.broodmother?.clears?.[1] === 1 && P.core.achievements.raid_mother !== undefined && P.core.achievements.raid_veteran !== undefined),
  `${def.name} beaten: "Matricide" (and its title) and "Into the Deep Nest" for the Veteran clear`);
// The last chest: always a piece of the raid's own set.
stand(R[1], it.x0 + chest2.x + 1, it.z0 + chest2.z);
const before = R[1].core.ground.size;
op(R[1].core, { op: 'dchest', id: chest2.id });
const loot = [...R[1].core.ground.values()].slice(before).map((g) => g.item);
check(loot.length >= 5 && loot.some((i) => i.set === 'broodbane' && i.rarity === 'legendary'), `the Brood Mother's chest: ${loot.length} pieces, among them Broodbane (${loot.find((i) => i.set === 'broodbane')?.name})`);
const exit = L.things.find((t) => t.kind === 'exit');
stand(R[2], it.x0 + exit.x + 1, it.z0 + exit.z);
check(op(R[2].core, { op: 'leave' }) && !R[2].core.dungeon, 'out by the way past her');

// ---------------------------------------------------------------- the week and the set
console.log('Lockouts and loot:');
const monday = Date.UTC(2026, 9, 12, 0, 0, 1);
check(lockWeek(monday) === lockWeek(Date.UTC(2026, 9, 18, 23, 59)) && lockWeek(monday) === lockWeek(Date.UTC(2026, 9, 11, 23, 59)) + 1 && weekEnds(monday) === Date.UTC(2026, 9, 19),
  'the week turns at midnight UTC going into Monday');
check(!R[0].core.settings.lockouts[raidLockKey('broodmother', 'warden', 2)] && raidLockKey('broodmother', 'warden', 1) !== raidLockKey('broodmother', 'warden', 2), 'each tier\'s chests lock apart');
let rolled = 0;
for (let i = 0; i < 1500; i++) if (generateArmor({ level: 16, luck: 3 }).set === 'broodbane') rolled++;
const piece = generateArmor({ level: 16, set: 'broodbane', rarity: 'legendary' });
check(!rolled && itemFromRecipe(piece.recipe).set === 'broodbane' && GEAR_SETS.broodbane.raid === 'broodmother', 'Broodbane never drops by chance — only from the raid — and its recipes come back as themselves');
check(instanceDef('broodmother') === def && instanceDef('foundry')?.id === 'foundry', 'raids and dungeons by one lookup');

console.log(failed ? `raidcheck: ${failed} failed` : 'raidcheck: all good');
process.exit(failed ? 1 : 0);
