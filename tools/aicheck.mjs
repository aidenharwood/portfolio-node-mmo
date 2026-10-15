// Dev check: enemies and the ground they're put on — spawned clear of scenery, a stronghold's
// reinforcements inside its walls, the way found round obstacles and along hills too steep to
// climb, and a bite that lands on someone stepping back from it. Run in the server's headless world.
// Run: node tools/aicheck.mjs [seed]
import * as THREE from 'three';
import { HeadlessWorld } from '../server/world.js';
import { WorldSim } from '../src/sim/WorldSim.js';

const seed = Number(process.argv[2] ?? 12345);
const world = new HeadlessWorld(seed);
let failed = 0;
const check = (ok, what) => {
  if (!ok) failed++;
  console.log(`  ${ok ? '✓' : '✗'} ${what}`);
};
const host = { world, emit() {}, onKilled() {}, onCampCleared() {}, onHordeBroken() {} };
const mkSim = () => new WorldSim(host);
const player = (x, z) => ({ id: 1, position: new THREE.Vector3(x, world.groundHeight(x, z), z), velocity: new THREE.Vector3(), radius: 0.45, height: 2, alive: true });
// Open, level, dry ground (`r` metres of it) near (x, z), its scenery loaded: somewhere to test
// the AI rather than the map.
function flatSite(x, z, r = 10) {
  for (let ring = 0; ring < 60; ring++) {
    for (let k = 0; k < Math.max(1, ring * 6); k++) {
      const a = (k / Math.max(1, ring * 6)) * Math.PI * 2;
      const cx = x + Math.cos(a) * ring * 40;
      const cz = z + Math.sin(a) * ring * 40;
      world.prime([{ x: cx, z: cz }]);
      let ok = true;
      const h0 = world.groundHeight(cx, cz);
      for (let dx = -r; dx <= r && ok; dx += 2) for (let dz = -r; dz <= r && ok; dz += 2) {
        if (Math.abs(world.groundHeight(cx + dx, cz + dz) - h0) > 1.2 || !world.fits(cx + dx, cz + dz, 0.8)) ok = false;
      }
      if (ok) return { x: cx, z: cz };
    }
  }
  throw new Error('no flat open ground found');
}
const run = (sim, secs, each = null) => { for (let t = 0; t < secs; t += 1 / 30) { each?.(t); sim.update(1 / 30); } };

// ---------------------------------------------------------------- spawning clear of scenery
console.log('Spawns:');
{
  // Somewhere with plenty of scenery: the collider-densest chunk near the middle.
  world.prime([{ x: 0, z: 0 }, { x: 300, z: 300 }, { x: -300, z: 300 }]);
  const solid = [...world.colliders].filter((c) => !c.box && c.r > 0.6 && c.r < 3 && !world.fits(c.x, c.z, 0.5));
  check(solid.length > 20, `${solid.length} rocks and trees to try spawning inside`);
  const sim = mkSim();
  let inside = 0;
  for (const c of solid.slice(0, 60)) {
    const e = sim.spawnEnemy('cutter', new THREE.Vector3(c.x, 0, c.z), { level: 3 });
    if (!world.fits(e.position.x, e.position.z, e.radius * 0.9, e.height)) inside++;
    sim.removeEnemy(e);
  }
  check(inside === 0, `none of ${Math.min(60, solid.length)} enemies spawned on a collider's middle is left inside it (${inside})`);
}

// ---------------------------------------------------------------- stronghold reinforcements
console.log('Strongholds:');
{
  let fort = null;
  for (let ring = 1; ring < 10 && !fort; ring++) {
    for (let rx = -ring; rx <= ring && !fort; rx++) for (let rz = -ring; rz <= ring && !fort; rz++) {
      fort = world.gen.region(rx, rz).pois.find((p) => p.type === 'camp' && p.style === 'fort') ?? null;
    }
  }
  check(!!fort, `a fort found (${fort?.name})`);
  if (fort) {
    world.prime([{ x: fort.x, z: fort.z }]);
    const sim = mkSim();
    const me = player(fort.x, fort.z + 24); // outside the gate
    sim.setPlayers([me]);
    const camp = sim.encounters.campFor(fort);
    sim.encounters.activate(camp, 0);
    for (const e of camp.enemies) e.aggro(true, me);
    const before = new Set(camp.enemies);
    sim.encounters.spawnWave(camp);
    const wave = camp.enemies.filter((e) => !before.has(e));
    const out = wave.filter((e) => Math.abs(e.position.x - fort.x) > 13.6 || Math.abs(e.position.z - fort.z) > 13.6);
    check(wave.length > 0 && out.length === 0, `all ${wave.length} reinforcements come in inside the walls (${out.length} outside)`);
    const guards = [...before].filter((e) => !world.fits(e.position.x, e.position.z, e.radius * 0.9, e.height));
    check(guards.length === 0, `its ${before.size} guards stand clear of its walls and props`);
  }
}

// ---------------------------------------------------------------- finding the way
console.log('Pathing:');
{
  // A wall of rocks between a cutter and its target: it gets round and reaches them.
  const sim = mkSim();
  const { x: x0, z: z0 } = flatSite(2000, 2000);
  const wall = [];
  for (let k = -6; k <= 6; k++) wall.push(world.addCollider(x0 + k * 1.2, z0, 0.9, 3));
  const me = player(x0, z0 + 8);
  me.position.y = world.groundHeight(me.position.x, me.position.z);
  sim.setPlayers([me]);
  const e = sim.spawnEnemy('cutter', new THREE.Vector3(x0 + 0.5, 0, z0 - 6), { level: 3 });
  e.home.set(x0, 0, z0 - 6);
  e.aggro(true, me);
  let best = Infinity;
  run(sim, 12, () => { best = Math.min(best, e.dist2(me)); });
  check(best < 3.5, `round a 15 m wall of rocks to its target (closest ${best.toFixed(1)} m)`);
  for (const c of wall) world.removeCollider(c);

  // The steepest bit of hillside near the middle: it climbs by the gentler way, or along it.
  let steep = null;
  for (let x = -400; x <= 400 && !steep; x += 4) for (let z = -400; z <= 400 && !steep; z += 4) {
    if (world.isWater(x, z)) continue;
    const h = world.groundHeight(x, z);
    const up = world.groundHeight(x, z + 3) - h;
    if (up / 3 > 1.5 && up < 9 && !world.isWater(x, z - 4)) steep = { x, z };
  }
  if (!steep) console.log('  (no slope steep enough nearby to test)');
  else {
    world.prime([steep]);
    const sim2 = mkSim();
    const top = player(steep.x, steep.z + 7);
    sim2.setPlayers([top]);
    const e2 = sim2.spawnEnemy('cutter', new THREE.Vector3(steep.x, 0, steep.z - 3), { level: 3 });
    e2.aggro(true, top);
    const start = e2.dist2(top);
    let moved = 0;
    let last = e2.position.clone();
    run(sim2, 10, () => { moved += e2.position.distanceTo(last); last.copy(e2.position); });
    check(moved > 15, `at the foot of a cliff it doesn't stand still against it (walked ${moved.toFixed(1)} m; from ${start.toFixed(1)} to ${e2.dist2(top).toFixed(1)} m off)`);
  }
}

// ---------------------------------------------------------------- melee
console.log('Melee:');
{
  // A razorhound bites at someone backing off at walking pace: its bite still reaches them.
  const { x: x0, z: z0 } = flatSite(2600, 2600);
  let reached = 0;
  let tries = 0;
  for (let k = 0; k < 20; k++) {
    const sim = mkSim();
    const me = player(x0, z0);
    sim.setPlayers([me]);
    const e = sim.spawnEnemy('hound', new THREE.Vector3(x0, 0, z0 - 2.4), { level: 3 });
    e.aggro(true, me);
    e.cooldown = 0;
    let bit = false;
    let started = false;
    run(sim, 2.5, () => {
      if (e.state === 'windup') started = true;
      if (started && !bit) me.position.z += (4 / 30); // backing off at 4 m/s once it winds up
      me.position.y = world.groundHeight(me.position.x, me.position.z);
      if (e.state === 'attack' && e.reaches(e.cur.arc, e.cur.range, me)) bit = true;
    });
    if (started) tries++;
    if (bit) reached++;
  }
  check(tries >= 15 && reached >= tries * 0.7, `a hound's bite reaches someone backing off at 4 m/s (${reached} of ${tries})`);
}

console.log(failed ? `aicheck: ${failed} FAILED` : 'aicheck: ok');
process.exit(failed ? 1 : 0);
