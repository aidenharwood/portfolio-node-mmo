// Dev check: camps, warbands, strongholds and elite affixes, run in the server's headless world
// with a stand-in player — the rosters by level, then each mechanic exercised and checked.
// (How the server copes with crowds of them: tools/loadsim.mjs.)
// Run: node tools/hordecheck.mjs [seed]
import * as THREE from 'three';
import { HeadlessWorld } from '../server/world.js';
import { WorldSim } from '../src/sim/WorldSim.js';
import { campUnits } from '../src/combat/races.js';
import { mulberry32 } from '../src/core/rng.js';
import { AFFIX_IDS } from '../src/sim/affixes.js';

const seed = Number(process.argv[2] ?? 12345);
const world = new HeadlessWorld(seed);
let failed = 0;
const check = (ok, what) => {
  if (!ok) failed++;
  console.log(`  ${ok ? '✓' : '✗'} ${what}`);
};

// ---------------------------------------------------------------- rosters by level
console.log('Camp rosters (size · elites · champions), from the world generator:');
// The near rings in full, and a few far ones (where regions reach level 18 and up).
const camps = [];
for (const ring of [1, 2, 3, 4, 5, 6, 7, 8, 12, 16, 20]) {
  for (let rx = -ring; rx <= ring; rx++) {
    for (let rz = -ring; rz <= ring; rz++) {
      if (Math.max(Math.abs(rx), Math.abs(rz)) !== ring) continue;
      for (const p of world.gen.region(rx, rz).pois) if (p.type === 'camp') camps.push(p);
    }
  }
}
const bands = [[1, 4], [5, 9], [10, 17], [18, 99]];
for (const [lo, hi] of bands) {
  const list = camps.filter((c) => !c.stronghold && c.level >= lo && c.level <= hi);
  if (!list.length) { console.log(`  levels ${lo}–${hi}: no camps found`); continue; }
  const rows = list.map((c) => campUnits(c, mulberry32(c.seed)));
  const size = rows.map((r) => r.length);
  const elites = rows.map((r) => r.filter((u) => u.opts.elite).length);
  const champs = rows.filter((r) => r.some((u) => u.opts.champion)).length;
  console.log(`  levels ${String(lo).padStart(2)}–${String(hi).padEnd(2)}  ${String(list.length).padStart(3)} camps  size ${Math.min(...size)}–${Math.max(...size)}  elites ${Math.min(...elites)}–${Math.max(...elites)}  champions in ${Math.round((champs / list.length) * 100)}%`);
}
const forts = camps.filter((c) => c.stronghold);
if (forts.length) {
  const guards = forts.map((c) => campUnits(c, mulberry32(c.seed)).length - 1);
  console.log(`  strongholds  ${forts.length}, guards ${Math.min(...guards)}–${Math.max(...guards)} (+ the boss)`);
}

// ---------------------------------------------------------------- a sim with one stand-in player
const events = [];
const broken = [];
const cleared = [];
const host = {
  world,
  emit: (ev) => events.push(ev),
  onKilled() {},
  onCampCleared: (camp) => cleared.push(camp),
  onHordeBroken: (pack) => broken.push(pack),
};
const sim = new WorldSim(host);
const me = { id: 1, position: new THREE.Vector3(), velocity: new THREE.Vector3(), radius: 0.45, height: 2, alive: true };
sim.setPlayers([me]);
const run = (seconds, each = null) => {
  for (let t = 0; t < seconds; t += 0.05) {
    world.track([me.position]);
    sim.update(0.05);
    each?.();
  }
};
const place = (x, z) => {
  me.position.set(x, world.groundHeight(x, z), z);
  world.prime([me.position]);
};
const hit = (e, damage) => sim.applyHit(e.id, { by: me.id, damage, source: 'melee', poise: 0, knockback: 0, dir: { x: 0, z: 1 } });
const kinds = () => new Set(events.map((e) => e.k));

// Elite affixes, one at a time, on a Hive Drone (Splitting is the Hive's) or a Synth Sentry
// (Overcharged is the Synths').
console.log('Elite affixes:');
const open = camps.find((c) => !c.stronghold && c.level <= 6) ?? camps[0];
place(open.x + 40, open.z + 40);
for (const id of AFFIX_IDS) {
  events.length = 0;
  const type = id === 'overcharged' ? 'stalker' : 'drone';
  const at = new THREE.Vector3(me.position.x + 6, 0, me.position.z);
  const e = sim.spawnEnemy(type, at, { level: 8, elite: true, affixes: [id] });
  const ally = sim.spawnEnemy(type, at.clone().add(new THREE.Vector3(2, 0, 2)), { level: 8 });
  e.aggro(true, me);
  ally.aggro(true, me);
  run(1.5);
  switch (id) {
    case 'shielded': {
      const hp = e.hp;
      hit(e, Math.round(e.shieldMax * 0.6));
      check(e.hp === hp && e.shield > 0, `Shielded: a hit under the shield's size leaves health alone (${Math.round(e.shield)}/${e.shieldMax} shield left)`);
      hit(e, e.shieldMax);
      check(e.shield === 0 && e.hp < hp && kinds().has('shield'), 'Shielded: the shield breaks, the rest gets through');
      break;
    }
    case 'frenzied':
      hit(e, Math.round(e.maxHp * 0.6));
      run(0.2);
      check(e.frenzy > 0, 'Frenzied: frenzied below half health');
      break;
    case 'vampiric': {
      hit(e, Math.round(e.maxHp * 0.5));
      const hp = e.hp;
      run(2);
      check(e.hp > hp, `Vampiric: regenerates in a fight (${Math.round(hp)} → ${Math.round(e.hp)})`);
      break;
    }
    case 'volatile':
      hit(e, e.hp + e.shield + 1);
      run(1.2);
      check(events.some((v) => v.k === 'boom' && v.id === e.id), 'Volatile: blows up after it dies');
      break;
    case 'blinking': {
      me.position.x += 14;
      const from = e.position.clone();
      run(3);
      check(kinds().has('blink') && e.position.distanceTo(from) > 4, 'Blinking: teleports to its target');
      me.position.x -= 14;
      break;
    }
    case 'splitting': {
      const before = sim.enemies.filter((x) => x.alive).length;
      hit(e, e.hp + 1);
      run(0.6);
      const halves = sim.enemies.filter((x) => x.alive && x.split);
      check(halves.length === 2 && sim.enemies.filter((x) => x.alive).length === before + 1, 'Splitting: comes apart into two halves');
      check(halves.every((x) => x.type.dropChance === 0 && x.engaged), 'Splitting: the halves fight on and drop nothing');
      for (const x of halves) hit(x, x.hp + 1);
      break;
    }
    case 'overcharged':
      run(4);
      check(events.some((v) => v.k === 'boom' && v.id === e.id && v.el === 'shock'), 'Overcharged: shock pulses');
      break;
    case 'commander':
      run(0.3);
      check(ally.rallied > 0 && e.rallied <= 0, 'Commander: rallies allies near it');
      break;
  }
  for (const x of [e, ally]) if (x.alive) hit(x, x.hp + x.shield + 1);
  run(2);
}

// A warband: spawned in a region of level 10+, and broken.
console.log('Warbands:');
const high = camps.find((c) => c.level >= 12 && !c.stronghold);
if (!high) console.log('  (no region of level 10+ found)');
else {
  place(high.x + 70, high.z + 70);
  events.length = 0;
  let tries = 0;
  while (!sim.encounters.roamers.some((r) => r.horde) && tries++ < 200) sim.encounters.spawnRoamers(me.position.x + 30, me.position.z + 30);
  const pack = sim.encounters.roamers.find((r) => r.horde);
  check(!!pack && pack.enemies.length >= 10 && pack.enemies.length <= 20, `a warband of ${pack?.enemies.length} spawns (in ${tries + 1} roaming spawns)`);
  check(kinds().has('horde'), 'it is announced');
  if (pack) {
    check(pack.enemies.some((e) => e.elite), `it is led by elites (${pack.enemies.filter((e) => e.elite).length}, champion: ${pack.enemies.some((e) => e.champion)})`);
    run(1);
    for (const e of [...pack.enemies]) if (e.alive) hit(e, e.hp + e.shield + 1);
    run(1.5);
    check(broken.includes(pack) && kinds().has('hordeDown'), 'killing them all breaks it');
  }
}

// A stronghold: the alarm, and reinforcements while the boss stands.
console.log('Strongholds:');
const fort = forts[0];
if (!fort) console.log('  (no stronghold found)');
else {
  place(fort.x + fort.radius + 30, fort.z);
  run(1);
  const camp = sim.encounters.camps.get(fort.id);
  check(camp?.state === 'active', `${fort.name} is up (level ${fort.level}, ${camp?.enemies.length} enemies)`);
  me.position.set(fort.x + fort.radius - 2, world.groundHeight(fort.x + fort.radius - 2, fort.z), fort.z);
  events.length = 0;
  const guard = camp.enemies.find((e) => !e.isBoss);
  hit(guard, 1);
  run(40, () => { me.position.x = fort.x + fort.radius - 2; });
  check(kinds().has('alarm'), 'the alarm is raised');
  const waves = events.filter((e) => e.k === 'wave').length;
  check(waves >= 1, `reinforcements come (${waves} wave${waves === 1 ? '' : 's'} in 40 s)`);
  check(camp.enemies.some((e) => e.transient && e.engaged), 'and join the fight');
  // Everything there dies: cleared.
  for (let i = 0; i < 4; i++) {
    for (const e of [...camp.enemies]) if (e.alive) hit(e, e.hp + e.shield + 1);
    run(1);
  }
  check(cleared.includes(camp), 'clearing it counts');
}

console.log(failed ? `hordecheck: ${failed} failed` : 'hordecheck: all good');
process.exit(failed ? 1 : 0);
