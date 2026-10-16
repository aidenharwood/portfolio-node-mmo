// Dev check: the act lands and the camps. Which act each region belongs to and the factions it
// may hold, that the world's settled places don't move when camps change, and — as they arrive —
// camp layouts, their placement and the reinforcement waves that hold them.
// Run: node tools/campcheck.mjs [--seed N] [--fingerprint]
import * as THREE from 'three';
import { WorldGen, ACTS } from '../src/world/Gen.js';
import { HeadlessWorld } from '../server/world.js';
import { WorldSim, MAX_CAMP_ENEMIES } from '../src/sim/WorldSim.js';
import { storyPlaces } from '../src/world/story.js';
import { QuestLog } from '../src/rpg/Quests.js';
import { TIERS, campLayout } from '../src/world/campLayout.js';
import { PIECE_BUILDERS } from '../src/world/build/campKit.js';

const arg = (k) => { const i = process.argv.indexOf(k); return i === -1 ? null : process.argv[i + 1]; };
const SEEDS = arg('--seed') ? [Number(arg('--seed'))] : [12345, 1, 777, 4242, 90210];
let failed = 0;
const check = (ok, what) => {
  if (!ok) failed++;
  if (!ok || process.argv.includes('-v')) console.log(`  ${ok ? '✓' : '✗'} ${what}`);
};
const ringOf = (rx, rz) => Math.max(Math.abs(rx), Math.abs(rz));
const regionsTo = (gen, rings) => {
  const out = [];
  for (let rx = -rings; rx <= rings; rx++) for (let rz = -rings; rz <= rings; rz++) out.push(gen.region(rx, rz));
  return out;
};

// ---------------------------------------------------------------- stability
// Every point of interest but the camps (and the frontier posts that come with the act lands), as
// a hash: what must stay where it was for a seed when camps change.
function fingerprint(gen) {
  let h = 0x811c9dc5;
  for (const r of regionsTo(gen, 6)) {
    for (const p of r.pois) {
      if (p.type === 'camp' || p.type === 'frontier') continue;
      const s = `${p.id}@${p.x.toFixed(2)},${p.z.toFixed(2)};`;
      for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
    }
  }
  return h.toString(16);
}
const FINGERPRINTS = { 12345: 'ec3970ea', 1: '232b5288', 777: 'ab4ccd3', 4242: 'c3c27fb2', 90210: '7f0c740' };

if (process.argv.includes('--fingerprint')) {
  for (const seed of SEEDS) console.log(`  ${seed}: '${fingerprint(new WorldGen(seed))}',`);
  process.exit(0);
}

// ---------------------------------------------------------------- act lands
function actLands(gen) {
  const all = regionsTo(gen, 18);
  check(gen.region(0, 0).act === 1, 'Brightwater is in Act I');
  for (const c of gen.cities()) check(gen.region(c.rx, c.rz).act === c.act, `${c.name}'s region is in Act ${c.act}`);
  let bad = 0;
  let early = 0;
  let far = 0;
  for (const r of all) {
    if (!(r.act >= 1 && r.act <= 4)) bad++;
    if ((r.race === 'hive' && r.act < 2) || (r.race === 'synth' && r.act < 3)) early++;
    // A region's act is read off its site's distance, bent by at most ACT_WARP: so a region inside
    // a border's ring sits no further than that beyond it, and one outside no nearer than that short
    // of it. (The edge between two cells lies about half a cell further on.)
    if (ringOf(r.rx, r.rz) > 1 && !gen.cities().some((c) => c.rx === r.rx && c.rz === r.rz)) {
      const d = Math.hypot(r.x, r.z);
      const inner = r.act > 1 ? ACTS[r.act - 2].to : 0;
      if (d > ACTS[r.act - 1].to + 150 + 1 || d < inner - 150 - 1) far++;
    }
  }
  check(bad === 0, `every region has an act (${bad} without)`);
  check(early === 0, `no Hive before Act II and no Synths before Act III (${early} regions)`);
  check(far === 0, `every region is within 150 m of its act's ring (${far} strays)`);
}

// ---------------------------------------------------------------- placement
function placement(gen) {
  const regions = regionsTo(gen, 12);
  const cityAt = new Set(gen.cities().map((c) => `${c.rx},${c.rz}`));
  const camps = [];
  // Each region places what its act and level call for, as far as the land has room: never more,
  // rarely nothing (water and mountains aside), and bases in about the share planned.
  const rows = { early: { n: 0, zero: 0, big: 0 }, act1: { n: 0, zero: 0, big: 0 }, later: { n: 0, zero: 0, big: 0, camps: 0 } };
  let over = 0;
  let noTier = 0;
  let hubBad = 0;
  let earlyForts = 0;
  for (const r of regions) {
    const mine = r.pois.filter((p) => p.type === 'camp' && !p.story);
    for (const c of mine) { camps.push({ c, r }); if (!c.tier) noTier++; }
    if (r.hub) { if (mine.length > 1 || mine.some((c) => c.tier !== 'outpost')) hubBad++; continue; }
    if (cityAt.has(`${r.rx},${r.rz}`)) { if (mine.length) over++; continue; }
    const n = (t) => mine.filter((c) => c.tier === t).length;
    const [o, k, b] = [n('outpost'), n('camp'), n('base')];
    const kind = r.act === 1 && r.level < 5 ? 'early' : r.act === 1 ? 'act1' : 'later';
    const most = { early: [2, 1, 0], act1: [2, 1, 1], later: [2, 2, 1] }[kind];
    if (o > most[0] || k > most[1] || b > most[2]) over++;
    const row = rows[kind];
    row.n++;
    if (!mine.length) row.zero++;
    else if (b) row.big++;
    if (row.camps !== undefined) row.camps += mine.length;
    if (mine.some((c) => c.stronghold && r.level < 10)) earlyForts++;
  }
  const share = (row, k) => (row.n - row.zero ? row[k] / (row.n - row.zero) : 0);
  check(noTier === 0, `every camp has a tier (${noTier} without)`);
  check(hubBad === 0, 'Brightwater has its outpost, or none (as before)');
  check(over === 0, `no region places more than its tier table allows (${over} over)`);
  const firstLands = rows.early.zero + rows.act1.zero;
  check(firstLands <= Math.ceil((rows.early.n + rows.act1.n) * 0.1), `Act I regions with no camp: ${firstLands} of ${rows.early.n + rows.act1.n}`);
  check(rows.later.zero <= rows.later.n * 0.15, `later regions with no camp: ${rows.later.zero} of ${rows.later.n}`);
  check(share(rows.act1, 'big') <= 0.35, `bases in Act I from level 5: ${rows.act1.big} of ${rows.act1.n - rows.act1.zero}`);
  check(share(rows.later, 'big') >= 0.2 && share(rows.later, 'big') <= 0.45, `bases and strongholds in later acts: ${rows.later.big} of ${rows.later.n - rows.later.zero}`);
  check(share(rows.later, 'camps') >= 2.5, `camps per later region with room: ${share(rows.later, 'camps').toFixed(2)}`);
  check(earlyForts === 0, `no stronghold below level 10 (${earlyForts})`);

  // Apart from each other, off the roads (but their own) and off the towns, cities and story places.
  let close = 0;
  for (let i = 0; i < camps.length; i++) {
    for (let j = i + 1; j < camps.length; j++) {
      const a = camps[i].c;
      const b = camps[j].c;
      if (Math.hypot(a.x - b.x, a.z - b.z) < a.radius + b.radius + 20) close++;
    }
  }
  check(close === 0, `no two camps within 20 m of each other (${close} pairs)`);
  let onRoad = 0;
  let inTown = 0;
  let thin = 0;
  for (const { c, r } of camps) {
    // (Story camps stand where world/story.js puts them.)
    for (let dx = -1; dx <= 1 && !c.story && !r.hub; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        for (const path of gen.region(r.rx + dx, r.rz + dz).roads) {
          const [ex, ez] = path[path.length - 1];
          // Its own way in (which water may cut short just outside it).
          if (Math.hypot(ex - c.x, ez - c.z) < c.radius + 12) continue;
          if (path.some(([x, z]) => Math.hypot(x - c.x, z - c.z) < c.radius + 3)) { onRoad++; dx = dz = 2; break; }
        }
      }
    }
    if (gen.bigNear(r.rx, r.rz).some((t) => Math.hypot(t.x - c.x, t.z - c.z) < t.r + c.radius)) inTown++;
    if (campLayout(c, gen.campProbe).posts.length < TIERS[c.tier].garrison[0]) thin++;
  }
  check(onRoad === 0, `no road runs through a camp but its own (${onRoad} of ${camps.length})`);
  check(inTown === 0, `no camp on a town, city or story place (${inTown})`);
  check(thin === 0, `water and cliffs leave every camp room for its garrison (${thin} short)`);
}

// ---------------------------------------------------------------- frontier posts
// Where a road crosses into a later act's lands, a Warden post stands on the near side of it.
function frontiers(gen) {
  let crossings = 0;
  let missed = 0;
  let wrongSide = 0;
  const regions = regionsTo(gen, 18);
  const posts = regions.flatMap((r) => r.pois.filter((p) => p.type === 'frontier'));
  for (const r of regions) {
    for (const path of r.roads) {
      for (let i = 1; i < path.length; i++) {
        const [ax, az] = path[i - 1];
        const [bx, bz] = path[i];
        const [A, B] = [gen.actAt(ax, az), gen.actAt(bx, bz)];
        if (A === B) continue;
        crossings++;
        const near = posts.filter((p) => Math.hypot(p.x - (ax + bx) / 2, p.z - (az + bz) / 2) < 25);
        if (!near.length) missed++;
        else if (!near.some((p) => gen.actAt(p.x, p.z) < p.act && p.act === Math.max(A, B))) wrongSide++;
      }
    }
  }
  check(crossings > 0 && missed === 0, `a frontier post at every road into a later act (${crossings} crossings, ${missed} without)`);
  check(wrongSide === 0, `on the near side, naming the act ahead (${wrongSide} wrong)`);
}

// ---------------------------------------------------------------- layouts
const STYLES = { scav: 'scav', salvage: 'scav', nest: 'hive', relay: 'synth', den: 'fauna' };
function layouts() {
  console.log('Layouts:');
  const defs = [];
  for (let s = 1; s <= 20; s++) {
    for (const [style, race] of Object.entries(STYLES)) {
      for (const tier of Object.keys(TIERS)) defs.push({ id: `t:${style}:${tier}:${s}`, x: 0, z: 0, radius: TIERS[tier].R, race, style, tier, level: 10, seed: s });
    }
    for (const race of Object.values(STYLES)) defs.push({ id: `t:fort:${race}:${s}`, x: 0, z: 0, radius: TIERS.base.R, race, style: 'fort', tier: 'base', stronghold: true, level: 10, seed: s });
  }
  const bad = {};
  const fail = (what, def) => { (bad[what] ??= []).push(def.id); };
  for (const def of defs) {
    const T = TIERS[def.tier];
    const L = campLayout(def);
    // (Spawner ids carry the camp's id, which is changed here to get past the memo.)
    const plain = (x) => JSON.stringify({ ...x, spawners: x.spawners.map(({ id, ...sp }) => sp) });
    if (plain(L) !== plain(campLayout({ ...def, id: `${def.id}b` }))) fail('deterministic', def);
    if (L.tier !== def.tier || L.R !== T.R) fail('tier and radius', def);
    if (!L.pieces.every((p) => Math.hypot(p.x, p.z) + (p.r ?? 0) <= T.R + 2)) fail('pieces inside R + 2', def);
    if (L.posts.length < T.garrison[1]) fail('enough posts', def);
    if (L.spawners.length < T.spawners[0] || L.spawners.length > T.spawners[1]) fail('spawner count', def);
    if (!L.spawners.every((sp, i) => sp.id === `${def.id}:sp${i}` && sp.kind)) fail('spawner ids', def);
    const solid = L.pieces.filter((p) => p.r > 0);
    if (!L.posts.every((q) => solid.every((p) => Math.hypot(q.x - p.x, q.z - p.z) >= p.r + 0.6))) fail('posts clear of pieces', def);
    if (!L.posts.every((q, i) => L.posts.every((o, j) => i === j || Math.hypot(q.x - o.x, q.z - o.z) >= 1.2))) fail('posts 1.2 m apart', def);
    if (def.tier === 'outpost' ? L.gates.length : !L.gates.length) fail('gates by tier', def);
    if (!!L.throne !== !!def.stronghold) fail('a throne only in a stronghold', def);
    const wet = campLayout({ ...def, id: `${def.id}w` }, (wx) => wx > 5);
    if (![...wet.posts, ...wet.spawners, ...wet.pieces].every((q) => q.x <= 5)) fail('nothing stands in the water', def);
    if (!wet.spawners.length) fail('a spawner even with water', def);
  }
  const kinds = new Set(defs.flatMap((def) => { const L = campLayout(def); return [...L.pieces.map((p) => p.kind), ...L.spawners.map((sp) => sp.kind)]; }));
  const missing = [...kinds].filter((k) => !PIECE_BUILDERS[k]);
  check(!missing.length, `every piece a layout lays out has a builder (${kinds.size} kinds${missing.length ? `; missing ${missing.join(', ')}` : ''})`);
  for (const what of ['deterministic', 'tier and radius', 'pieces inside R + 2', 'enough posts', 'spawner count', 'spawner ids', 'posts clear of pieces', 'posts 1.2 m apart', 'gates by tier', 'a throne only in a stronghold', 'nothing stands in the water', 'a spawner even with water']) {
    check(!bad[what], `${what} (${defs.length} layouts${bad[what] ? `; e.g. ${bad[what].slice(0, 3).join(', ')} of ${bad[what].length}` : ''})`);
  }
}
layouts();

// ---------------------------------------------------------------- reinforcement waves
// A headless sim (as tools/hordecheck.mjs runs one) at a base, with stand-in players.
function waves() {
  console.log('Waves:');
  const world = new HeadlessWorld(12345);
  const events = [];
  const cleared = [];
  const host = { world, emit: (ev) => events.push(ev), onKilled() {}, onCampCleared: (c) => cleared.push(c) };
  let base = null;
  for (let ring = 1; ring < 12 && !base; ring++) {
    for (let rx = -ring; rx <= ring && !base; rx++) {
      for (let rz = -ring; rz <= ring && !base; rz++) {
        if (Math.max(Math.abs(rx), Math.abs(rz)) !== ring) continue;
        base = world.gen.region(rx, rz).pois.find((p) => p.type === 'camp' && p.tier === 'base' && !p.stronghold && !p.story) ?? null;
      }
    }
  }
  const player = (id) => ({ id, position: new THREE.Vector3(), velocity: new THREE.Vector3(), radius: 0.45, height: 2, alive: true });
  const fresh = (n) => {
    const sim = new WorldSim(host);
    const ps = Array.from({ length: n }, (_, i) => player(i + 1));
    sim.setPlayers(ps);
    return { sim, ps };
  };
  const put = (p, x, z) => p.position.set(x, world.groundHeight(x, z), z);
  const atGate = (p, i = 0) => put(p, base.x + base.radius + 4, base.z + i * 2);
  const run = (sim, ps, seconds, each = null) => {
    for (let t = 0; t < seconds; t += 0.1) {
      world.track(ps.map((p) => p.position));
      sim.update(0.1);
      each?.(t);
    }
  };
  const kill = (sim, e) => sim.applyHit(e.id, { by: 1, damage: e.hp + (e.shield ?? 0) + 1, source: 'melee', poise: 0, knockback: 0, dir: { x: 0, z: 1 } });
  const alive = (camp) => camp.enemies.filter((e) => e.alive).length;
  const reinforced = (from = 0) => events.slice(from).filter((e) => e.k === 'reinforce').length;

  // 1. One player at the gate: a full garrison; ten down, and squads bring it back.
  {
    const { sim, ps } = fresh(1);
    atGate(ps[0]);
    run(sim, ps, 1);
    const camp = sim.encounters.camps.get(base.id);
    const garrison = camp?.slots.length ?? 0;
    check(camp?.state === 'active' && alive(camp) === garrison, `a base wakes with its garrison (${camp && alive(camp)} of ${garrison})`);
    for (const e of camp.enemies.filter((x) => x.alive).slice(0, 10)) kill(sim, e);
    const from = events.length;
    let most = 0;
    run(sim, ps, 25, () => { most = Math.max(most, alive(camp)); });
    check(reinforced(from) >= 1 && alive(camp) > garrison - 10 && most <= garrison, `squads come to fill it (${reinforced(from)} in 25 s; ${alive(camp)} of ${garrison}, never above)`);
  }
  // 2. Four players: the target rises to 2.5× (capped), and is never passed.
  {
    const { sim, ps } = fresh(4);
    ps.forEach((p, i) => atGate(p, i));
    run(sim, ps, 1);
    const camp = sim.encounters.camps.get(base.id);
    const want = Math.min(Math.round(camp.slots.length * 2.5), TIERS.base.cap);
    let most = 0;
    run(sim, ps, 120, () => { most = Math.max(most, alive(camp)); });
    check(camp.target === want && most <= want && most > camp.slots.length, `four there: the target is ${camp.target} (want ${want}), the most at once ${most}`);
  }
  // 3. Dead players call nothing.
  {
    const { sim, ps } = fresh(4);
    ps.forEach((p, i) => { atGate(p, i); p.alive = i === 0; });
    run(sim, ps, 1);
    const camp = sim.encounters.camps.get(base.id);
    check(camp.target === camp.slots.length, `the dead don't raise the crowd (target ${camp.target} for ${camp.slots.length})`);
    put(ps[0], base.x + base.radius + 60, base.z);
    for (const e of camp.enemies.filter((x) => x.alive).slice(0, 10)) kill(sim, e);
    const from = events.length;
    run(sim, ps, 60);
    check(reinforced(from) === 0, `with only the dead near, no squads come (${reinforced(from)})`);
  }
  // 4. Four players clearing it: it can be cleared, and a lull follows.
  {
    const { sim, ps } = fresh(4);
    ps.forEach((p, i) => atGate(p, i));
    run(sim, ps, 1);
    const camp = sim.encounters.camps.get(base.id);
    cleared.length = 0;
    run(sim, ps, 90, (t) => {
      if (!cleared.includes(camp) && Math.round(t * 10) % 5 === 0) for (const e of camp.enemies) if (e.alive) kill(sim, e);
    });
    check(cleared.includes(camp), 'four players can clear a base');
    if (cleared.includes(camp)) {
      // Cleared again, then 28 s with nobody killing: no squad in the lull.
      for (const e of camp.enemies) if (e.alive) kill(sim, e);
      run(sim, ps, 1);
      const from = events.length;
      run(sim, ps, 28);
      check(reinforced(from) === 0, `a lull of 30 s after it's cleared (${reinforced(from)} squads)`);
    }
  }
  // 5. Nobody near: it fills again a minute after they've gone.
  {
    const { sim, ps } = fresh(1);
    atGate(ps[0]);
    run(sim, ps, 1);
    const camp = sim.encounters.camps.get(base.id);
    const garrison = camp.slots.length;
    for (const e of camp.enemies.filter((x) => x.alive).slice(0, Math.floor(garrison / 2))) kill(sim, e);
    run(sim, ps, 0.5);
    put(ps[0], base.x + base.radius + 200, base.z);
    run(sim, ps, 59);
    const short = camp.slots.some((sl) => sl.respawnAt > sim.time);
    run(sim, ps, 2);
    atGate(ps[0]);
    run(sim, ps, 1);
    check(short && camp.state === 'active' && alive(camp) === garrison, `left alone a minute, it fills again (short at 59 s: ${short}; ${alive(camp)} of ${garrison} at 61 s)`);
  }
  // 6. A story camp's named foe is never sent again by a squad.
  {
    let story = null;
    for (const S of Object.values(storyPlaces(world.gen))) story ??= world.gen.region(S.rx, S.rz).pois.find((p) => p.type === 'camp' && p.boss) ?? null;
    if (!story) console.log('  (no story camp with a named foe)');
    else {
      const { sim, ps } = fresh(1);
      put(ps[0], story.x + story.radius + 4, story.z);
      run(sim, ps, 1);
      const camp = sim.encounters.camps.get(story.id);
      run(sim, ps, 60, () => { for (const e of camp.enemies) if (e.alive && !e.isBoss) kill(sim, e); });
      const bosses = camp.enemies.filter((e) => e.alive && (e.isBoss || (story.boss.tag && e.tag === story.boss.tag)));
      check(bosses.length === 1, `${story.name}: one named foe, however many squads (${bosses.length})`);
    }
  }
  // 7. Eight players at a base for two minutes: the cost, and the cap.
  {
    const one = fresh(1);
    atGate(one.ps[0]);
    run(one.sim, one.ps, 2);
    let t0 = performance.now();
    run(one.sim, one.ps, 30);
    const solo = (performance.now() - t0) / 300;
    const { sim, ps } = fresh(8);
    ps.forEach((p, i) => put(p, base.x + base.radius + 4, base.z - 8 + i * 2));
    run(sim, ps, 2);
    const camp = sim.encounters.camps.get(base.id);
    let most = 0;
    t0 = performance.now();
    run(sim, ps, 120, (t) => {
      if (Math.round(t * 10) % 5 === 0) { const live = camp.enemies.filter((e) => e.alive); if (live.length) kill(sim, live[Math.floor(Math.random() * live.length)]); }
      most = Math.max(most, sim.enemies.filter((e) => e.alive).length);
    });
    const crowd = (performance.now() - t0) / 1200;
    check(crowd < solo * 2.5 + 0.5 && most <= MAX_CAMP_ENEMIES, `eight at a base: ${crowd.toFixed(2)} ms a tick (one: ${solo.toFixed(2)} ms), at most ${most} alive`);
  }
}
if (!arg('--seed')) waves();

// ---------------------------------------------------------------- the final review's findings
function reviewed() {
  console.log('Review fixes:');
  const world = new HeadlessWorld(12345);
  const events = [];
  const cleared = [];
  const host = { world, emit: (ev) => events.push(ev), onKilled() {}, onCampCleared: (c) => cleared.push(c) };
  const find = (test) => {
    for (let ring = 1; ring < 14; ring++) {
      for (let rx = -ring; rx <= ring; rx++) {
        for (let rz = -ring; rz <= ring; rz++) {
          if (Math.max(Math.abs(rx), Math.abs(rz)) !== ring) continue;
          const c = world.gen.region(rx, rz).pois.find((p) => p.type === 'camp' && !p.story && test(p));
          if (c) return c;
        }
      }
    }
    return null;
  };
  const player = (id) => ({ id, position: new THREE.Vector3(), velocity: new THREE.Vector3(), radius: 0.45, height: 2, alive: true });
  const put = (p, x, z) => p.position.set(x, world.groundHeight(x, z), z);
  const run = (sim, ps, seconds, each = null) => {
    for (let t = 0; t < seconds; t += 0.1) {
      world.track(ps.map((p) => p.position));
      sim.update(0.1);
      each?.(t);
    }
  };
  const kill = (sim, e) => sim.applyHit(e.id, { by: 1, damage: e.hp + (e.shield ?? 0) + 1, source: 'melee', poise: 0, knockback: 0, dir: { x: 0, z: 1 } });

  // 1. A stronghold cleared and its squads cut down as they come is cleared once, not every lull.
  {
    const fort = find((p) => p.stronghold);
    const sim = new WorldSim(host);
    const ps = [player(1), player(2)];
    sim.setPlayers(ps);
    ps.forEach((p, i) => put(p, fort.x + fort.radius + 4, fort.z + i * 2));
    run(sim, ps, 1);
    const camp = sim.encounters.camps.get(fort.id);
    cleared.length = 0;
    run(sim, ps, 600, (t) => { if (Math.round(t * 10) % 5 === 0) for (const e of camp.enemies) if (e.alive) kill(sim, e); });
    const n = cleared.filter((c) => c === camp).length;
    check(n === 1, `a stronghold held down for 10 min counts as cleared once (${n})`);
  }
  // 2. A crowd standing back from every spawner still brings squads in, and they stay.
  {
    const base = find((p) => p.tier === 'base' && !p.stronghold);
    const L = campLayout(base, world.gen.campProbe);
    let best = null;
    for (let a = 0; a < Math.PI * 2; a += 0.05) {
      const x = base.x + Math.sin(a) * (base.radius + 7);
      const z = base.z + Math.cos(a) * (base.radius + 7);
      const d = Math.min(...L.spawners.map((s) => Math.hypot(base.x + s.x - x, base.z + s.z - z)));
      if (!best || d > best.d) best = { x, z, d };
    }
    const sim = new WorldSim(host);
    const ps = [1, 2, 3, 4].map(player);
    sim.setPlayers(ps);
    ps.forEach((p, i) => put(p, best.x + i, best.z));
    run(sim, ps, 1);
    const camp = sim.encounters.camps.get(base.id);
    const from = events.length;
    let most = 0;
    run(sim, ps, 120, () => { most = Math.max(most, camp.enemies.filter((e) => e.alive).length); });
    const poofs = events.slice(from).filter((e) => e.k === 'poof').length;
    check(best.d > 30 && most > camp.slots.length && poofs === 0, `four players ${Math.round(best.d)} m from every spawner: squads come and stay (${most} at most for ${camp.slots.length}; ${poofs} vanished)`);
  }
  // 3. A saved generated quest at a camp the world no longer has is dropped, and its giver offers again.
  {
    const q = new QuestLog({ world, hud: null, stats: { level: 5 }, player: { position: new THREE.Vector3() } });
    const gone = { id: 'contract:7', kind: 'contract', giver: 'warden', theme: 'warden', generated: true, target: 'c:3,3:9', title: 'Contract: Gone', objectives: [{ type: 'clear', camp: 'c:3,3:9', count: 1, text: 'Clear it' }], rewards: { xp: 10 } };
    const here = find(() => true);
    const kept = { ...gone, id: 'contract:8', giver: 'w2', target: here.id, objectives: [{ type: 'clear', camp: here.id, count: 1, text: 'Clear it' }] };
    q.load({ generated: [gone, kept], active: { 'contract:7': [0], 'contract:8': [0] } });
    check(!q.active['contract:7'] && !!q.active['contract:8'], 'a saved camp quest whose camp is gone is dropped; one whose camp is there stays');
  }
  // 4. A boss's camp with nowhere to stand doesn't throw.
  {
    const sim = new WorldSim(host);
    let wet = null;
    for (let x = -2000; x < 2000 && !wet; x += 37) for (let z = -2000; z < 2000 && !wet; z += 41) if (world.gen.campProbe(x, z) && world.gen.campProbe(x + 6, z) && world.gen.campProbe(x, z + 6) && world.gen.campProbe(x - 6, z - 6)) wet = { x, z };
    let threw = null;
    try {
      sim.encounters.makeSlots({ id: 'sc:t:boss', type: 'camp', x: wet.x, z: wet.z, radius: 6, tier: 'outpost', race: 'hive', style: 'nest', level: 12, seed: 3, boss: { type: 'psion', name: 'T', tag: 't' }, story: 't' });
    } catch (e) { threw = e.message; }
    check(!threw, `a boss camp with no dry posts lays out without throwing (${threw ?? 'ok'})`);
  }
  // 5. A stronghold's garrison stands at its posts, the walls 28 m out now, not crammed in a 12.5 m keep.
  {
    const fort = find((p) => p.stronghold);
    const sim = new WorldSim(host);
    const ps = [player(1)];
    sim.setPlayers(ps);
    put(ps[0], fort.x + fort.radius + 30, fort.z);
    run(sim, ps, 1);
    const camp = sim.encounters.camps.get(fort.id);
    const far = camp.slots.filter((s) => s.enemy && Math.hypot(s.enemy.position.x - s.x, s.enemy.position.z - s.z) > 3).length;
    check(camp.state === 'active' && far <= 2, `a stronghold's guards stand at their posts (${far} of ${camp.slots.length} pushed more than 3 m off)`);
  }
}
if (!arg('--seed')) reviewed();

for (const seed of SEEDS) {
  console.log(`Seed ${seed}:`);
  const gen = new WorldGen(seed);
  check(fingerprint(gen) === FINGERPRINTS[seed], `the settled places are where they were (seed ${seed})`);
  actLands(gen);
  placement(gen);
  frontiers(gen);
}

console.log(failed ? `campcheck: ${failed} failed` : 'campcheck: all good');
process.exit(failed ? 1 : 0);
