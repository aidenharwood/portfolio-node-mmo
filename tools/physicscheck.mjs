// Check: movement against the world and the ragdolls' physics.
//   walls      a slide into a dungeon's wall loses its speed into it instead of gaining speed
//              toward the void behind it, and nothing fast passes through a wall (box or mesh)
//   meshes     a hollow prop (a ring of stones) can be walked round, stood on and dropped into,
//              and is left alone inside; a solid crate is stepped onto or blocks; an overhead deck
//              stops a jump; the inside of a solid is solid and the inside of a ring is not
//   ragdolls   a dead body's joints keep their lengths, come to rest on the ground (and on a
//              prop's top), and nothing of it ends up under the ground
// Run: node tools/physicscheck.mjs
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { HeadlessWorld } from '../server/world.js';
import { generateDungeon } from '../src/world/DungeonGen.js';
import { Interior } from '../src/world/Interior.js';
import { DUNGEONS, pocketOrigin } from '../src/world/dungeons.js';
import { stopAgainst } from '../src/world/MeshCollision.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { MODELS, bindAny } from '../src/models/Creatures.js';
import { Animator, makeAnimState } from '../src/anim/Animator.js';
import { LegAnimator, makeLegState, HoverAnimator, makeHoverState } from '../src/anim/LegAnimator.js';
import { prepareRagdoll } from '../src/anim/Ragdoll.js';

let failed = 0;
const check = (ok, what) => {
  if (!ok) failed++;
  console.log(`  ${ok ? '✓' : '✗'} ${what}`);
  return ok;
};
const DT = 1 / 60;
const RADIUS = 0.45;
const STEP_UP = 0.5;
const HEIGHT = 2.0;

// ---------------------------------------------------------------- dungeon walls
console.log('Dungeon walls:');
{
  const w = new HeadlessWorld(7);
  const def = DUNGEONS.foundry;
  const L = generateDungeon(def);
  const it = w.addInterior(new Interior(L, pocketOrigin(0)));
  // The start room, and the middle of its west wall (no corridor through it).
  const room = L.rooms[0];
  const cell = L.cell;
  const wallX = it.x0 + room.x * cell;
  let z = it.z0 + (room.z + room.h / 2) * cell;
  for (const o of L.openings.filter((o) => o.room === 0 && o.axis === 'x' && Math.abs(o.line - room.x * cell) < 1e-6)) {
    if (Math.abs(z - it.z0 - (o.s0 + o.s1) / 2) < (o.s1 - o.s0) / 2 + 2) z = it.z0 + room.z * cell + 1.5;
  }
  const floor = it.floorAt(wallX + 3, z);
  // The way a slide used to read the slope next to the wall: across it, into the void.
  const e = 0.8;
  const px = wallX + 0.3 + RADIUS;
  const oldPull = (w.groundHeight(px + e, z) - w.groundHeight(px - e, z)) / (2 * e);
  const slope = w.surfaceSlope(px, floor, z, STEP_UP);
  check(Math.abs(oldPull) > 5 && Math.abs(slope.x) < 0.05 && Math.abs(slope.z) < 0.05,
    `beside a wall the floor reads flat (${slope.x.toFixed(2)}, ${slope.z.toFixed(2)}), not the old drop toward the void (${oldPull.toFixed(1)})`);

  // A slide into the wall: the player's slide rules (slope pull, low friction, the 32 m/s cap).
  const p = new THREE.Vector3(wallX + 6, floor, z);
  const v = new THREE.Vector3(-14, 0, 0.6);
  const kb = new THREE.Vector3();
  const push = new THREE.Vector3();
  let maxSpeed = 0;
  let minX = Infinity;
  for (let i = 0; i < 180; i++) {
    const g = w.surfaceSlope(p.x, p.y, p.z, STEP_UP);
    v.x -= g.x * 20 * DT;
    v.z -= g.z * 20 * DT;
    v.multiplyScalar(Math.exp(-0.45 * DT));
    const sp = Math.hypot(v.x, v.z);
    if (sp > 32) v.multiplyScalar(32 / sp);
    push.set(0, 0, 0);
    w.move(p, v.x * DT, v.z * DT, RADIUS, STEP_UP, HEIGHT, push);
    stopAgainst(push, v, kb);
    p.y = w.supportHeight(p.x, p.z, p.y + STEP_UP);
    if (i > 30) maxSpeed = Math.max(maxSpeed, Math.hypot(v.x, v.z));
    minX = Math.min(minX, p.x);
  }
  check(maxSpeed < 1.5, `a slide into the wall stops against it (top speed after hitting it ${maxSpeed.toFixed(2)} m/s)`);
  check(minX >= wallX + 0.3 + RADIUS - 0.02, `and stays on its side (closest ${(minX - wallX).toFixed(2)} m from the wall's line)`);

  // A glancing slide keeps its speed along the wall, and never gains any.
  p.set(wallX + 3, floor, z - 4);
  v.set(-10, 0, 10);
  const start = Math.hypot(v.x, v.z);
  let peak = 0;
  for (let i = 0; i < 40; i++) {
    const g = w.surfaceSlope(p.x, p.y, p.z, STEP_UP);
    v.x -= g.x * 20 * DT;
    v.z -= g.z * 20 * DT;
    push.set(0, 0, 0);
    w.move(p, v.x * DT, v.z * DT, RADIUS, STEP_UP, HEIGHT, push);
    stopAgainst(push, v, kb);
    peak = Math.max(peak, Math.hypot(v.x, v.z));
  }
  check(peak <= start + 1e-6 && Math.abs(v.z) > 9, `a glancing slide runs along the wall without speeding up (peak ${peak.toFixed(2)} of ${start.toFixed(2)} m/s, ${v.z.toFixed(2)} along it)`);

  // Flat out at a thin wall (a shut door is half a metre thick): never through it.
  const thin = new HeadlessWorld(7);
  thin.addBox(0, 0, 0.25, 4, 4, 0);
  let through = 0;
  for (const speed of [10, 20, 36, 60]) {
    const q = new THREE.Vector3(-1.2, 0, 0);
    for (let i = 0; i < 20; i++) thin.move(q, speed / 20, 0, RADIUS, 0, HEIGHT);
    if (q.x > 0) through++;
  }
  check(!through, 'at up to 60 m/s (a frame of 1/20 s) nothing passes through a door-thick box');
}

// ---------------------------------------------------------------- props with meshes
console.log('Props with meshes:');
// A ring of stones (an open well, a hollow stump): 1.2 m high, 3 m across, 0.4 m thick.
function ringGeometry(radius, thick, height, n = 16) {
  const parts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const len = 2 * Math.PI * radius / n + 0.05;
    const g = new THREE.BoxGeometry(len, height, thick);
    g.translate(0, height / 2, radius);
    g.rotateY(a);
    parts.push(g.toNonIndexed());
  }
  return mergeGeometries(parts);
}
{
  const w = new HeadlessWorld(7);
  const at = new THREE.Vector3(500, 0, 500);
  const gy = w.groundHeight(at.x, at.z);
  const ringH = 1.2;
  const m = new THREE.Matrix4().makeTranslation(at.x, gy, at.z);
  const ring = w.addCollider(at.x, at.z, 1.75, ringH + 0.1, gy, 'stone', { meshGeometry: ringGeometry(1.5, 0.4, ringH), meshMatrix: m });
  check(!!ring.tris && ring.tris.n > 100, `the ring keeps its triangles (${ring.tris?.n ?? 0})`);
  const ground = (x, z) => w.groundHeight(x, z);

  // Walking in from outside: stopped at the outer face, not pushed round it.
  const p = new THREE.Vector3(at.x + 4, ground(at.x + 4, at.z), at.z);
  for (let i = 0; i < 120; i++) {
    w.move(p, -6 * DT, 0, RADIUS, STEP_UP, HEIGHT);
    p.y = w.supportHeight(p.x, p.z, p.y + STEP_UP, p.y + STEP_UP);
  }
  const d = Math.hypot(p.x - at.x, p.z - at.z);
  check(d > 1.7 + RADIUS - 0.05 && d < 1.7 + RADIUS + 0.1 && Math.abs(p.z - at.z) < 0.05, `walking into it stops at its wall (${d.toFixed(2)} m from the middle)`);

  // Its rim can be stood on.
  const rim = w.supportHeight(at.x + 1.5, at.z, gy + 5);
  check(Math.abs(rim - (gy + ringH)) < 0.02, `its rim is somewhere to stand (${(rim - gy).toFixed(2)} m up)`);
  // Inside it, the floor is the ground, not its top: something dropped in falls in.
  const inside = w.supportHeight(at.x + 0.2, at.z, gy + 5);
  check(Math.abs(inside - ground(at.x + 0.2, at.z)) < 0.02, 'inside it the floor is the ground (a body dropped in lands inside)');
  // And a body inside is left inside, held off the inner face — not thrown out of the ring.
  const q = new THREE.Vector3(at.x + 0.5, ground(at.x + 0.5, at.z), at.z);
  for (let i = 0; i < 60; i++) w.move(q, 3 * DT, 0, RADIUS, STEP_UP, HEIGHT);
  const dq = Math.hypot(q.x - at.x, q.z - at.z);
  check(dq < 1.3 - RADIUS + 0.05 && dq > 0.5, `a body inside walks to the inner face and stays inside (${dq.toFixed(2)} m from the middle)`);
  check(!w.blocks({ x: at.x, y: gy + 0.6, z: at.z }), 'the inside of the ring is open');
  check(w.blocks({ x: at.x + 1.5, y: gy + 0.6, z: at.z }), 'the stone of the ring is solid');

  // Falling onto the rim from above lands on it; falling down the middle lands on the ground.
  for (const [x, want, what] of [[at.x + 1.5, gy + ringH, 'onto the rim'], [at.x, ground(at.x, at.z), 'down the middle']]) {
    const f = new THREE.Vector3(x, gy + 6, at.z);
    let vy = 0;
    for (let i = 0; i < 240; i++) {
      const oy = f.y;
      vy -= 30 * DT;
      f.y += vy * DT;
      w.move(f, 0, 0, RADIUS, STEP_UP, HEIGHT);
      const s = w.supportHeight(f.x, f.z, Math.max(f.y, oy) + STEP_UP, oy + STEP_UP);
      if (f.y <= s) { f.y = s; vy = 0; }
    }
    check(Math.abs(f.y - want) < 0.05, `dropped ${what}, it lands there (${(f.y - gy).toFixed(2)} m up)`);
  }
}
{
  const w = new HeadlessWorld(7);
  const at = new THREE.Vector3(600, 0, 600);
  const gy = w.groundHeight(at.x, at.z);
  const box = (sx, sy, sz, y = 0) => new THREE.BoxGeometry(sx, sy, sz).translate(0, sy / 2 + y, 0);
  // A low crate (stepped onto), a tall one (a wall), and a deck on posts (overhead).
  const low = w.addCollider(at.x, at.z, 0.8, 0.45, gy, 'planks', { meshGeometry: box(1, 0.4, 1), meshMatrix: new THREE.Matrix4().makeTranslation(at.x, gy, at.z) });
  const tall = w.addCollider(at.x + 6, at.z, 0.8, 2.1, gy, 'planks', { meshGeometry: box(1, 2, 1), meshMatrix: new THREE.Matrix4().makeTranslation(at.x + 6, w.groundHeight(at.x + 6, at.z), at.z) });
  const deckY = w.groundHeight(at.x + 12, at.z) + 2.6;
  w.addCollider(at.x + 12, at.z, 2.2, 3, deckY - 0.3, 'planks', { meshGeometry: box(3, 0.3, 3, -0.3), meshMatrix: new THREE.Matrix4().makeTranslation(at.x + 12, deckY, at.z) });
  check(!!low.tris && !!tall.tris, 'crates keep their triangles');
  const lowTop = w.supportHeight(at.x, at.z, gy + STEP_UP, gy + STEP_UP);
  check(Math.abs(lowTop - (gy + 0.4)) < 0.02, 'a crate under step height is stepped onto');
  const p = new THREE.Vector3(at.x + 6 - 3, w.groundHeight(at.x + 3, at.z), at.z);
  for (let i = 0; i < 90; i++) w.move(p, 8 * DT, 0, RADIUS, STEP_UP, HEIGHT);
  check(p.x < at.x + 6 - 0.5 - RADIUS + 0.02, 'a tall crate stops a body walking into it');
  // Jumping up under the deck: it can't come up through it onto its top.
  const gx = w.groundHeight(at.x + 12, at.z);
  const room = w.headroom(at.x + 12, at.z, gx + HEIGHT - 0.05);
  check(Math.abs(room - (deckY - 0.3)) < 0.02, `under the deck, its underside is the ceiling (${(room - gx).toFixed(2)} m up)`);
  const top = w.supportHeight(at.x + 12, at.z, deckY + 0.2, gx + STEP_UP);
  check(Math.abs(top - gx) < 0.02, 'from under it, its top is out of reach (no stepping up through it)');
  const onto = w.supportHeight(at.x + 12, at.z, deckY + 0.2, deckY + 0.1);
  check(Math.abs(onto - deckY) < 0.02, 'from above it, its top is a floor');
  // Thin mesh wall (a plank fence): no tunnelling at speed either way.
  const fence = w.addCollider(at.x, at.z + 10, 2.2, 1.5, gy, 'planks', { meshGeometry: box(4, 1.4, 0.08), meshMatrix: new THREE.Matrix4().makeTranslation(at.x, w.groundHeight(at.x, at.z + 10), at.z + 10) });
  let through = 0;
  for (const dir of [1, -1]) {
    for (const speed of [12, 30, 60]) {
      const q = new THREE.Vector3(at.x + 0.3, 0, at.z + 10 - dir * 1.2);
      q.y = w.groundHeight(q.x, q.z);
      for (let i = 0; i < 20; i++) w.move(q, 0, dir * speed / 20, RADIUS, STEP_UP, HEIGHT);
      if (Math.sign(q.z - (at.z + 10)) === dir) through++;
    }
  }
  check(!!fence.tris && !through, 'a plank-thin fence stops movers from either side at up to 60 m/s');
}

// ---------------------------------------------------------------- ragdolls
console.log('Ragdolls:');
{
  // Seeded, so every run kicks every body the same way.
  let seed = 9001;
  const random = Math.random;
  Math.random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const w = new HeadlessWorld(7);
  const at = (x, z) => new THREE.Vector3(x, w.groundHeight(x, z), z);
  // A crate (a mesh prop) to fall onto, and a wall to fall against.
  const crateAt = at(720, 700);
  const crateTop = crateAt.y + 0.7;
  w.addCollider(crateAt.x, crateAt.z, 1.0, 0.8, crateAt.y, 'planks', { meshGeometry: new THREE.BoxGeometry(1.6, 0.7, 1.6).translate(0, 0.35, 0), meshMatrix: new THREE.Matrix4().makeTranslation(crateAt.x, crateAt.y, crateAt.z) });
  const wallAt = at(760, 700);
  w.addBox(wallAt.x + 0.9, wallAt.z, 0.3, 4, 4, wallAt.y - 1);
  // A dungeon's floor, far out in its pocket.
  const L = generateDungeon(DUNGEONS.foundry);
  const it = w.addInterior(new Interior(L, pocketOrigin(1)));
  const room = L.rooms[0];
  const inRoom = new THREE.Vector3(it.x0 + (room.x + room.w / 2) * L.cell, 0, it.z0 + (room.z + room.h / 2) * L.cell);
  inRoom.y = it.floorAt(inRoom.x, inRoom.z);

  const MODELS_TO_TRY = ['scav:cutter', 'scav:juggernaut', 'hive:queen', 'synth:colossus', 'fauna:hound', 'fauna:crawler', 'fauna:behemoth', 'hive:psion', 'hive:broodheart'];
  const kill = (key, where, kick) => {
    const tpl = MODELS[key]();
    prepareRagdoll(tpl.model);
    const model = cloneSkinned(tpl.model);
    let sk = null;
    model.traverse((o) => { if (o.isSkinnedMesh) { if (!sk) sk = o.skeleton; else if (o.skeleton !== sk) o.bind(sk, o.bindMatrix); } });
    const rig = bindAny(model);
    const kind = rig.kind ?? 'biped';
    const root = new THREE.Group();
    root.position.copy(where);
    root.add(model);
    const an = kind === 'legs' ? new LegAnimator(rig) : kind === 'hover' ? new HoverAnimator(rig) : new Animator(rig);
    const s = kind === 'legs' ? makeLegState() : kind === 'hover' ? makeHoverState() : makeAnimState();
    s.ground = (x, z) => w.groundHeight(x, z);
    s.world = w;
    let settled = null;
    for (let i = 0; i < 60 * 8; i++) {
      s.mode = i >= 20 ? 'dead' : 'ground';
      if (i === 20) { s.vx = kick.x; s.vz = kick.z; }
      if (i > 23) { s.vx *= 0.9; s.vz *= 0.9; }
      root.updateMatrixWorld(true);
      an.update(DT, s);
      if (settled === null && an.ragdoll?.asleep) settled = (i - 20) / 60;
    }
    model.updateMatrixWorld(true);
    return { rd: an.ragdoll, model, rig, settled };
  };
  // Every bone above what's under it, and the skeleton where its balls are.
  const survey = ({ rd, model }, floorAt) => {
    let low = Infinity;
    let off = 0;
    let nan = false;
    model.traverse((o) => {
      if (!o.isBone) return;
      const p = o.getWorldPosition(new THREE.Vector3());
      if (!Number.isFinite(p.x + p.y + p.z)) nan = true;
      low = Math.min(low, p.y - floorAt(p));
    });
    for (const d of rd.drives) {
      if (d.off) continue;
      const to = rd.points[d.to];
      const posed = to.offset ? to.bone.localToWorld(to.offset.clone()) : to.bone.getWorldPosition(new THREE.Vector3());
      off = Math.max(off, posed.distanceTo(to.p) / rd.size);
    }
    const stretch = Math.max(...rd.links.filter((l) => l.kind === 0 && l.len > 0.05).map((l) => Math.abs(rd.points[l.a].p.distanceTo(rd.points[l.b].p) - l.len) / l.len));
    return { low, off, nan, stretch };
  };
  const terrain = (p) => w.groundHeight(p.x, p.z);
  let worst = { low: Infinity, off: 0, stretch: 0, settle: 0 };
  let bad = [];
  for (const [k, key] of MODELS_TO_TRY.entries()) {
    const a = (k / MODELS_TO_TRY.length) * Math.PI * 2;
    const r = kill(key, at(700 + k * 9, 640), new THREE.Vector3(Math.sin(a) * 3, 0, Math.cos(a) * 3));
    const m = survey(r, terrain);
    worst = { low: Math.min(worst.low, m.low), off: Math.max(worst.off, m.off), stretch: Math.max(worst.stretch, m.stretch), settle: Math.max(worst.settle, r.settled ?? 99) };
    if (m.nan || m.low < -0.03 || m.off > 0.15 || m.stretch > 0.08 || r.settled === null) bad.push(`${key} (low ${m.low.toFixed(2)}, off ${m.off.toFixed(2)}, stretch ${(m.stretch * 100).toFixed(0)}%, ${r.settled === null ? 'never rests' : `rests at ${r.settled.toFixed(1)} s`})`);
  }
  check(!bad.length, `bodies of every kind fall onto the ground, keep their bones out of it and their skeletons on their joints, and come to rest (worst: bone ${worst.low.toFixed(2)} m, skeleton ${worst.off.toFixed(2)} of its size off, rods ${(worst.stretch * 100).toFixed(1)}%, rest by ${worst.settle.toFixed(1)} s)${bad.length ? `: ${bad.join('; ')}` : ''}`);

  // Onto a crate: something of it ends up lying on the top, and nothing of it inside.
  const onCrate = kill('scav:cutter', at(crateAt.x - 1.3, crateAt.z), new THREE.Vector3(3.5, 0, 0));
  const balls = onCrate.rd.points.filter((p) => !p.off);
  const resting = balls.filter((p) => Math.abs(p.p.x - crateAt.x) < 0.8 && Math.abs(p.p.z - crateAt.z) < 0.8 && Math.abs(p.p.y - p.r - crateTop) < 0.05);
  const inside = balls.filter((p) => Math.abs(p.p.x - crateAt.x) < 0.8 - p.r * 0.5 && Math.abs(p.p.z - crateAt.z) < 0.8 - p.r * 0.5 && p.p.y < crateTop - 0.02 && p.p.y > crateAt.y);
  check(resting.length >= 3 && !inside.length, `a body falling on a crate lies across its top (${resting.length} joints on it, ${inside.length} inside it)`);

  // Against a wall: nothing of it goes through.
  const byWall = kill('scav:juggernaut', at(wallAt.x - 0.6, wallAt.z), new THREE.Vector3(5, 0, 0));
  const through = byWall.rd.points.filter((p) => !p.off && p.p.x > wallAt.x + 0.6);
  check(!through.length, `a body knocked into a wall stays on its side of it (${through.length} joints through)`);

  // In a dungeon: it lies on the room's floor, not in the void under the pocket.
  const below = kill('fauna:hound', inRoom, new THREE.Vector3(1, 0, 2));
  const m = survey(below, (p) => it.floorAt(p.x, p.z));
  check(m.low > -0.03 && below.rd.centre.y - inRoom.y < 0.6, `a body in a dungeon lies on its floor (centre ${(below.rd.centre.y - inRoom.y).toFixed(2)} m up)`);
  Math.random = random;
}

console.log(failed ? `${failed} problem(s)` : 'physicscheck: ok');
process.exit(failed ? 1 : 0);
