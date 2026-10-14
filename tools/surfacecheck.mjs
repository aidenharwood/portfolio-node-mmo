// Check for the procedural surfaces (render/Surfaces.js, docs/GRAPHICS_PLAN.md G1.1): patterns
// follow each piece's faces at true scale whichever way it's turned, pieces turned alike run on
// into each other, long pieces run their grain along their length — and every place, camp,
// landmark, story site and dungeon still bakes with surfaces on (as it does on screens; the
// server's world skips them), reporting how much of each is patterned and what it costs to build.
// Run: node tools/surfacecheck.mjs [seed]
import * as THREE from 'three';
import { HeadlessWorld } from '../server/world.js';
import { World } from '../src/world/World.js';
import { LANDMARKS, SETTLEMENTS } from '../src/world/Gen.js';
import { HAMLETS, DISTRICTS } from '../src/world/places.js';
import { storyPlaces } from '../src/world/story.js';
import { SURFACE_BAKE, SURFACE_KINDS, surfaceCoords } from '../src/render/Surfaces.js';
import { piece, bake, G } from '../src/render/ModelKit.js';
import { hasCompile } from '../src/render/Toon.js';
import { generateDungeon } from '../src/world/DungeonGen.js';
import { Interior } from '../src/world/Interior.js';
import { DUNGEONS } from '../src/world/dungeons.js';
import { buildInterior } from '../src/world/InteriorKit.js';
import { KIT } from '../src/world/build/kit.js';

let failed = 0;
const fail = (k, msg) => { failed++; console.log(`${k.padEnd(22)} FAILED: ${msg}`); };
const near = (a, b, e = 1e-3) => Math.abs(a - b) < e;

// ---------------------------------------------------------------- the coordinates
// The extent of a piece's surface coordinates over the triangles facing `axis` (local).
function extent(mesh, kind, axis) {
  const g = mesh.geometry.toNonIndexed();
  surfaceCoords(g, kind, mesh);
  const pos = g.attributes.position;
  const uv = g.attributes.puv;
  const n = new THREE.Vector3();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const box = { u0: Infinity, u1: -Infinity, v0: Infinity, v1: -Infinity };
  for (let t = 0; t < pos.count; t += 3) {
    a.fromBufferAttribute(pos, t);
    b.fromBufferAttribute(pos, t + 1);
    c.fromBufferAttribute(pos, t + 2);
    n.subVectors(b, a).cross(c.clone().sub(a)).normalize();
    if (n.dot(axis) < 0.99) continue;
    for (let k = 0; k < 3; k++) {
      box.u0 = Math.min(box.u0, uv.getX(t + k));
      box.u1 = Math.max(box.u1, uv.getX(t + k));
      box.v0 = Math.min(box.v0, uv.getY(t + k));
      box.v1 = Math.max(box.v1, uv.getY(t + k));
    }
  }
  return box;
}
{
  const g = new THREE.Group();
  const Z = new THREE.Vector3(0, 0, 1);
  // A wall 4 wide and 3 high, turned and tipped: its face spans 4 × 3 metres.
  const wall = piece(g, G.box(4, 3, 0.2), 0xffffff, { pos: [5, 1.5, -2], rot: [0.3, 0.9, 0], pattern: 'brick' });
  wall.updateMatrix();
  let e = extent(wall, 'brick', Z);
  if (!near(e.u1 - e.u0, 4) || !near(e.v1 - e.v0, 3)) fail('coords', `turned wall face spans ${(e.u1 - e.u0).toFixed(3)} × ${(e.v1 - e.v0).toFixed(3)}, not 4 × 3`);
  // Scaled: a unit box stretched to 6 × 2 spans 6 × 2.
  const big = piece(g, G.box(1, 1, 1), 0xffffff, { scale: [6, 2, 0.5], rot: [0, 2.1, 0], pattern: 'blocks' });
  big.updateMatrix();
  e = extent(big, 'blocks', Z);
  if (!near(e.u1 - e.u0, 6) || !near(e.v1 - e.v0, 2)) fail('coords', `scaled face spans ${(e.u1 - e.u0).toFixed(3)} × ${(e.v1 - e.v0).toFixed(3)}, not 6 × 2`);
  // Two walls turned alike, side by side along their own length: one's coordinates carry on
  // where the other's end.
  const ry = 0.7;
  const along = new THREE.Vector3(Math.cos(ry), 0, -Math.sin(ry));
  const w1 = piece(g, G.box(4, 3, 0.2), 0xffffff, { pos: [10, 1.5, 3], rot: [0, ry, 0] });
  const w2 = piece(g, G.box(4, 3, 0.2), 0xffffff, { pos: [10 + along.x * 4, 1.5, 3 + along.z * 4], rot: [0, ry, 0] });
  w1.updateMatrix();
  w2.updateMatrix();
  const e1 = extent(w1, 'planks', Z);
  const e2 = extent(w2, 'planks', Z);
  if (!near(e1.u1, e2.u0) || !near(e1.v0, e2.v0)) fail('coords', `walls turned alike don't run on (${e1.u1.toFixed(3)} → ${e2.u0.toFixed(3)})`);
  // A post's boards run up it.
  const post = piece(g, G.box(0.14, 3, 0.14), 0xffffff, {});
  post.updateMatrix();
  e = extent(post, 'planks', Z);
  if (!near(e.u1 - e.u0, 3)) fail('coords', `a post's grain runs ${(e.u1 - e.u0).toFixed(3)} m along u, not its 3 m length`);
  // Baked: patterned and plain pieces of one colour share a mesh, drawn with surfaces.
  SURFACE_BAKE.on = true;
  const h = new THREE.Group();
  piece(h, G.box(2, 2, 2), 0x808080, { pattern: 'brick' });
  piece(h, G.sphere(1), 0x808080, { pos: [3, 0, 0], pattern: false });
  piece(h, G.box(1, 1, 1), 0x404040, { pos: [-3, 0, 0] });
  bake(h);
  const meshes = h.children.filter((m) => m.isMesh);
  const grey = meshes.find((m) => m.material.color.getHex() === 0x808080);
  if (meshes.length !== 2) fail('bake', `${meshes.length} meshes, not 2`);
  else if (!grey?.geometry.attributes.pat || !hasCompile(grey.material, 'surfaces')) fail('bake', 'the patterned colour lost its surfaces');
  else if (meshes.find((m) => m !== grey).geometry.attributes.pat) fail('bake', 'a colour with no pattern got coordinates');
  console.log(`coords: ${failed ? 'problems' : 'ok'} (turned, scaled, run on, grain, mixed bake)`);
}

// ---------------------------------------------------------------- every place, baked
const seed = Number(process.argv[2] ?? 12345);
const w = new HeadlessWorld(seed);
// Drawn as a screen draws them (the server's world plans buildings and bakes nothing).
KIT.draw = true;
w.finish = World.prototype.finish.bind(w);
const CAMPS = ['scav', 'salvage', 'nest', 'relay', 'den', 'fort:scav', 'fort:hive', 'fort:synth', 'fort:fauna'];
const want = new Map([
  ['hub:', null], ['hubtown:', null],
  ...Object.keys(LANDMARKS).map((k) => [`landmark:${k}`, null]),
  ...Object.keys(SETTLEMENTS).map((k) => [`settlement:${k}`, null]),
  ...Object.keys(HAMLETS).map((k) => [`hamlet:${k}`, null]),
  ['town:', null], ['city:', null], ['citywall:', null],
  ...DISTRICTS.map((k) => [`district:${k}`, null]),
  ...CAMPS.map((k) => [`camp:${k}`, null]),
]);
const keyOf = (p) => (p.type === 'camp' ? `camp:${p.stronghold ? `fort:${p.race}` : p.style}` : `${p.type}:${p.kind ?? ''}`);
for (let ring = 0; ring < 24 && [...want.values()].some((v) => !v); ring++) {
  for (let rx = -ring; rx <= ring; rx++) {
    for (let rz = -ring; rz <= ring; rz++) {
      if (Math.max(Math.abs(rx), Math.abs(rz)) !== ring) continue;
      for (const p of w.gen.region(rx, rz).pois) {
        const k = keyOf(p);
        if (want.has(k) && !want.get(k)) want.set(k, p);
      }
    }
  }
}
for (const S of Object.values(storyPlaces(w.gen))) {
  const p = w.gen.region(S.rx, S.rz).pois.find((q) => q.story === S.key);
  if (p) want.set(`story:${S.key}`, p);
}

// How much of a built group is patterned, by kind; and that every patterned mesh draws them.
function survey(k, root) {
  let tris = 0;
  let patterned = 0;
  let draws = 0;
  const kinds = new Map();
  root.traverse((m) => {
    if (!m.isMesh || m.material?.isShaderMaterial) return;
    draws++;
    const geo = m.geometry;
    if (!geo) { fail(k, 'a mesh with no geometry (a merge that failed)'); return; }
    const n = geo.attributes.position.count / 3;
    tris += n;
    const pat = geo.attributes.pat;
    if (!pat) return;
    if (!hasCompile(m.material, 'surfaces')) fail(k, 'a patterned mesh drawn without its surfaces');
    for (let i = 0; i < pat.count; i += 3) {
      const id = pat.getX(i);
      if (!id) continue;
      patterned++;
      kinds.set(SURFACE_KINDS[id], (kinds.get(SURFACE_KINDS[id]) ?? 0) + 1);
    }
  });
  return { tris, patterned, draws, kinds };
}
const totals = new Map();
const pct = (a, b) => `${b ? Math.round((a / b) * 100) : 0}%`.padStart(4);
for (const [k, p] of want) {
  if (!p) continue;
  const t0 = performance.now();
  try {
    // As a screen loads it (the server's world drops what it drew).
    World.prototype.loadPoi.call(w, p);
  } catch (e) {
    fail(k, e.stack.split('\n').slice(0, 3).join(' | '));
    continue;
  }
  const ms = performance.now() - t0;
  const o = w.pois.get(p.id);
  const s = survey(k, o.group);
  for (const [kind, n] of s.kinds) totals.set(kind, (totals.get(kind) ?? 0) + n);
  const top = [...s.kinds].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([kind]) => kind).join(', ');
  console.log(`${k.padEnd(26)} ${ms.toFixed(1).padStart(6)} ms  ${String(s.draws).padStart(4)} draws  ${pct(s.patterned, s.tris)} patterned  ${top}`);
}
// Every dungeon, drawn as a screen draws it.
for (const def of Object.values(DUNGEONS)) {
  const k = `dungeon:${def.id}`;
  const t0 = performance.now();
  try {
    const it = new Interior(generateDungeon(def), { x: 0, y: 0, z: 0 });
    const mesh = buildInterior(it);
    const ms = performance.now() - t0;
    const s = survey(k, mesh.root ?? mesh.group ?? mesh);
    for (const [kind, n] of s.kinds) totals.set(kind, (totals.get(kind) ?? 0) + n);
    if (!s.patterned) fail(k, 'nothing patterned');
    const top = [...s.kinds].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([kind]) => kind).join(', ');
    console.log(`${k.padEnd(26)} ${ms.toFixed(1).padStart(6)} ms  ${String(s.draws).padStart(4)} draws  ${pct(s.patterned, s.tris)} patterned  ${top}`);
  } catch (e) {
    fail(k, e.stack.split('\n').slice(0, 3).join(' | '));
  }
}
const unused = SURFACE_KINDS.filter((kind) => kind && !totals.has(kind));
console.log(`kinds in use: ${[...totals].sort((a, b) => b[1] - a[1]).map(([kind, n]) => `${kind} ${n}`).join(', ')}`);
if (unused.length) console.log(`kinds not yet used by any builder: ${unused.join(', ')}`);
console.log(failed ? `${failed} problem(s)` : 'surfacecheck: ok');
process.exit(failed ? 1 : 0);
