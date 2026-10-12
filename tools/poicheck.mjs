// Dev tool: builds one of every landmark and settlement kind in the server's headless world (the
// same builders the client runs), reporting errors, build times and collider counts.
// Run: node tools/poicheck.mjs [seed]
import { HeadlessWorld } from '../server/world.js';
import { LANDMARKS, SETTLEMENTS } from '../src/world/Gen.js';

const seed = Number(process.argv[2] ?? 12345);
const w = new HeadlessWorld(seed);
const want = new Map([...Object.keys(LANDMARKS).map((k) => [`landmark:${k}`, null]), ...Object.keys(SETTLEMENTS).map((k) => [`settlement:${k}`, null])]);
for (let ring = 1; ring < 14 && [...want.values()].some((v) => !v); ring++) {
  for (let rx = -ring; rx <= ring; rx++) {
    for (let rz = -ring; rz <= ring; rz++) {
      if (Math.max(Math.abs(rx), Math.abs(rz)) !== ring) continue;
      for (const p of w.gen.region(rx, rz).pois) {
        const k = `${p.type}:${p.kind}`;
        if (want.has(k) && !want.get(k)) want.set(k, p);
      }
    }
  }
}
let failed = 0;
for (const [k, p] of want) {
  if (!p) { console.log(`${k.padEnd(22)} not found`); continue; }
  const before = w.colliders.size;
  const t0 = performance.now();
  try {
    w.loadPoi(p);
    const o = w.pois.get(p.id);
    let meshes = 0;
    o.group.traverse((m) => { if (m.isMesh) meshes++; });
    console.log(`${k.padEnd(22)} ${(performance.now() - t0).toFixed(1).padStart(6)} ms  ${String(meshes).padStart(3)} meshes  ${w.colliders.size - before} colliders  ${p.name}`);
  } catch (e) {
    failed++;
    console.log(`${k.padEnd(22)} FAILED: ${e.stack.split('\n').slice(0, 3).join(' | ')}`);
  }
}
process.exit(failed ? 1 : 0);
