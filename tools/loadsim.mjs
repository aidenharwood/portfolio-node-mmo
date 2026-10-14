// Dev tool: the server's world simulation under load, without a server — the realm's SimHost with
// stand-in players spread over camps (and the odd warband), each fighting the camp they're at,
// and each tick's views worked out for every one of them as the realm does.
//   node tools/loadsim.mjs [players] [seconds] [seed]
// Reports enemies alive and engaged, and milliseconds per 20 Hz tick (sim + views); the budget is
// a quarter of a core: 12.5 ms a tick.
import { SimHost } from '../server/simhost.js';

const players = Number(process.argv[2] ?? 60);
const seconds = Number(process.argv[3] ?? 30);
const seed = Number(process.argv[4] ?? 12345);
const TICK = 0.05;

const realm = { sessions: new Map(), parties: { mates: () => [] } };
const host = new SimHost(realm, seed);
const world = host.world;

// Camps to send the players to, nearest the hub first, two or three players to a camp.
const camps = [];
for (let ring = 1; camps.length < players && ring < 30; ring++) {
  for (let rx = -ring; rx <= ring; rx++) {
    for (let rz = -ring; rz <= ring; rz++) {
      if (Math.max(Math.abs(rx), Math.abs(rz)) !== ring) continue;
      for (const p of world.gen.region(rx, rz).pois) if (p.type === 'camp') camps.push(p);
    }
  }
}
const sessions = [];
for (let i = 0; i < players; i++) {
  const camp = camps[Math.floor(i / 2) % camps.length];
  const s = { id: i + 1, send() {} };
  host.join(s);
  const a = i * 2.4;
  s.proxy.position.set(camp.x + Math.cos(a) * (camp.radius + 4), 0, camp.z + Math.sin(a) * (camp.radius + 4));
  s.proxy.position.y = world.groundHeight(s.proxy.position.x, s.proxy.position.z);
  s.proxy.placed = true;
  s.proxy.ready = true;
  s.proxy.alive = true;
  s.camp = camp;
  realm.sessions.set(s.id, s);
  sessions.push(s);
}
world.prime(sessions.map((s) => s.proxy.position));
host.refreshPlayers();

// Each player strolls round their camp and hits whatever's after them now and then.
function act(s, t) {
  const p = s.proxy.position;
  const a = t * 0.3 + s.id;
  p.x = s.camp.x + Math.cos(a) * (s.camp.radius * 0.6);
  p.z = s.camp.z + Math.sin(a) * (s.camp.radius * 0.6);
  p.y = world.groundHeight(p.x, p.z);
  if (Math.random() < TICK * 1.5) {
    let best = null;
    let bd = 4;
    for (const e of host.sim.enemies) {
      if (!e.alive) continue;
      const d = Math.hypot(e.position.x - p.x, e.position.z - p.z);
      if (d < bd) { bd = d; best = e; }
    }
    if (best) host.sim.applyHit(best.id, { by: s.id, damage: Math.ceil(best.maxHp * 0.12), source: 'melee', poise: 10, knockback: 3, dir: { x: 0, z: 1 } });
  }
}

let t = 0;
let ticks = 0;
let simMs = 0;
let viewMs = 0;
let peak = 0;
let alive = 0;
let engaged = 0;
const warm = 5;
while (t < seconds + warm) {
  for (const s of sessions) act(s, t);
  const t0 = performance.now();
  host.tick(TICK);
  const t1 = performance.now();
  for (const s of sessions) {
    const v = host.viewFor(s);
    if (v) JSON.stringify(v.ea);
  }
  host.endTick();
  const t2 = performance.now();
  t += TICK;
  if (t < warm) continue;
  ticks++;
  simMs += t1 - t0;
  viewMs += t2 - t1;
  peak = Math.max(peak, t2 - t0);
  alive += host.sim.enemies.filter((e) => e.alive).length;
  engaged += host.sim.enemies.filter((e) => e.alive && e.engaged).length;
}
const per = (v) => (v / ticks).toFixed(2);
console.log(`${players} players at ${new Set(sessions.map((s) => s.camp.id)).size} camps, ${seconds} s at 20 Hz`);
console.log(`  enemies alive ${Math.round(alive / ticks)}, engaged ${Math.round(engaged / ticks)}`);
console.log(`  per tick: sim ${per(simMs)} ms + views ${per(viewMs)} ms = ${per(simMs + viewMs)} ms (peak ${peak.toFixed(1)} ms; budget 12.5 ms)`);
