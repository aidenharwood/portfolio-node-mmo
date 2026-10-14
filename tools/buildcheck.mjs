// Check for the building kit (world/build/, docs/GRAPHICS_PLAN.md G2): plans are the same every time
// for the same building; the server's world (which only plans buildings) takes exactly the
// colliders a screen does; every building's front door has open ground in front of it; and how
// many buildings, pieces and draw calls each place comes to.
// Run: node tools/buildcheck.mjs [seed]
import * as THREE from 'three';
import { HeadlessWorld } from '../server/world.js';
import { World } from '../src/world/World.js';
import { SETTLEMENTS } from '../src/world/Gen.js';
import { HAMLETS, DISTRICTS } from '../src/world/places.js';
import { KIT, planBuilding, building } from '../src/world/build/kit.js';
import { KIT_STYLES } from '../src/world/build/styles.js';
import { C } from '../src/world/palette.js';

let failed = 0;
const fail = (k, msg) => { failed++; console.log(`${k.padEnd(24)} FAILED: ${msg}`); };

// ---------------------------------------------------------------- plans
KIT.draw = true;
{
  let n = 0;
  for (const style of Object.keys(KIT_STYLES)) {
    for (const flat of [false, true]) {
      for (let seed = 1; seed <= 40; seed++) {
        const o = { wd: 5 + (seed % 5), dp: 4.5 + (seed % 3), ht: 3, storeys: 1 + (seed % 3), wall: C.hab, roof: C.metalDark, flat, style, chimney: seed % 2 === 0 };
        const a = planBuilding(o, seed * 7919);
        const b = planBuilding(o, seed * 7919);
        if (JSON.stringify(a.cols) !== JSON.stringify(b.cols) || JSON.stringify(a.masses) !== JSON.stringify(b.masses)) fail(`plan:${style}`, `seed ${seed} planned two ways`);
        // Every block inside the footprint it was given, and a collider over each.
        for (const m of a.masses) {
          if (Math.abs(m.x) + m.wd / 2 > o.wd / 2 + 1e-6 || Math.abs(m.z) + m.dp / 2 > o.dp / 2 + 1e-6) fail(`plan:${style}`, `seed ${seed}: a block outside the footprint`);
        }
        if (a.cols.length !== a.masses.length) fail(`plan:${style}`, `seed ${seed}: ${a.cols.length} colliders for ${a.masses.length} blocks`);
        // Built twice: the same pieces in the same places.
        const g1 = new THREE.Group();
        const g2 = new THREE.Group();
        building(g1, o);
        building(g2, o);
        if (!g1.children.length || !g2.children.length) fail(`build:${style}`, `seed ${seed} produced an empty building`);
        const sig = (g) => g.children.map((c) => `${c.userData.piece?.color}:${c.position.toArray().map((v) => v.toFixed(3))}`).join('|');
        if (sig(g1) !== sig(g2)) fail(`build:${style}`, `seed ${seed} built two ways`);
        n++;
      }
    }
  }
  console.log(`plans: ${failed ? 'problems' : 'ok'} (${n} plans, every style, pitched and flat, planned and built twice)`);
}

// Every explicit footprint and roof module remains inside its plan and gets a collider.
for (const footprint of ['rect', 'L', 'T', 'U', 'court']) {
  for (const roofForm of ['gable', 'hip', 'shed', 'parapet', 'dome', 'cone', 'sawtooth', 'crenel']) {
    const plan = planBuilding({ wd: 14, dp: 12, ht: 3, storeys: 2, wall: C.resin, roof: C.chitin, style: 'hive', footprint, roofForm }, 771);
    if (plan.cols.length !== plan.masses.length || !plan.cols.every((c) => c.surface === 'resin')) fail(`plan:${footprint}/${roofForm}`, 'collider surface or count differs from its mass');
    for (const m of plan.masses) {
      if (Math.abs(m.x) + m.wd / 2 > 7 + 1e-6 || Math.abs(m.z) + m.dp / 2 > 6 + 1e-6) fail(`plan:${footprint}/${roofForm}`, 'mass extends outside its footprint');
      if (m.H + m.rise < m.H) fail(`plan:${footprint}/${roofForm}`, 'roof collider height is below the wall height');
    }
    const group = new THREE.Group();
    building(group, { wd: 14, dp: 12, ht: 3, storeys: 2, wall: C.resin, roof: C.chitin, style: 'hive', footprint, roofForm });
    if (!group.children.length) fail(`build:${footprint}/${roofForm}`, 'no geometry was built');
  }
}

// ---------------------------------------------------------------- places
const seed = Number(process.argv[2] ?? 12345);
const probe = new HeadlessWorld(seed);
const want = new Map([
  ['hubtown:', null], ['town:', null], ['city:', null], ['citywall:', null],
  ...Object.keys(SETTLEMENTS).map((k) => [`settlement:${k}`, null]),
  ...Object.keys(HAMLETS).map((k) => [`hamlet:${k}`, null]),
  ...DISTRICTS.map((k) => [`district:${k}`, null]),
  ['camp:scav', null], ['camp:fort:scav', null], ['camp:fort:synth', null],
]);
const keyOf = (p) => (p.type === 'camp' ? `camp:${p.stronghold ? `fort:${p.race}` : p.style}` : `${p.type}:${p.kind ?? ''}`);
for (let ring = 0; ring < 24 && [...want.values()].some((v) => !v); ring++) {
  for (let rx = -ring; rx <= ring; rx++) {
    for (let rz = -ring; rz <= ring; rz++) {
      if (Math.max(Math.abs(rx), Math.abs(rz)) !== ring) continue;
      for (const p of probe.gen.region(rx, rz).pois) {
        const k = keyOf(p);
        if (want.has(k) && !want.get(k)) want.set(k, p);
      }
    }
  }
}
// The colliders a world took for a place, in a stable order.
const collidersOf = (w, p) => w.pois.get(p.id).colliders.map((c) => [c.x, c.z, c.r, c.h, c.y, c.hx ?? 0, c.hz ?? 0, c.ry ?? 0].map((v) => v.toFixed(4)).join(',')).sort().join('|');
for (const [k, p] of want) {
  if (!p) { console.log(`${k.padEnd(24)} not found`); continue; }
  // The server's way: plans only, nothing baked.
  const server = new HeadlessWorld(seed);
  KIT.draw = false;
  server.loadPoi(p);
  // A screen's way: every piece built and baked.
  const screen = new HeadlessWorld(seed);
  screen.finish = World.prototype.finish.bind(screen);
  KIT.draw = true;
  KIT.doors = [];
  World.prototype.loadPoi.call(screen, p);
  const doors = KIT.doors;
  KIT.doors = null;
  if (collidersOf(server, p) !== collidersOf(screen, p)) fail(k, 'the server and a screen took different colliders');
  // Doors: open ground on the doorstep (the place's own colliders, and anything streamed in by it).
  const blockedDoors = [];
  // (Doors up on platforms and stilts open onto those.)
  for (const d of doors) if (d.y - screen.groundHeight(d.x, d.z) < 1 && screen.blocks({ x: d.x, z: d.z, y: screen.groundHeight(d.x, d.z) + 0.9 })) blockedDoors.push(d);
  if (blockedDoors.length) fail(k, `${blockedDoors.length} of ${doors.length} doors blocked (${blockedDoors.map((d) => `${d.footprint}@${d.x.toFixed(1)},${d.z.toFixed(1)}`).join('; ')})`);
  let draws = 0;
  screen.pois.get(p.id).group.traverse((m) => { if (m.isMesh && !m.material.isShaderMaterial) draws++; });
  console.log(`${k.padEnd(24)} ${String(doors.length).padStart(3)} buildings  ${String(draws).padStart(3)} draws  ${String(screen.pois.get(p.id).colliders.length).padStart(4)} colliders`);
}
KIT.draw = false;
console.log(failed ? `${failed} problem(s)` : 'buildcheck: ok');
process.exit(failed ? 1 : 0);
