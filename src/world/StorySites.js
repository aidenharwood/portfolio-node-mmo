// The story's sites (world/story.js) and the objects quests use, built when they stream in
// (world/World.js loadPoi): the Wardens' relic dig, the signal beacons, the dig at the Sunken
// Vault, the Rustjaw Foundry's yard — and every object a quest has you use (a console, a beacon's
// fire, a strongbox, the vault door, a village's rubble, deep cut, relay and lanterns). An object
// has a part that's always there and two that depend on whether *you* have used it ("on" and
// "off"); those are kept apart (world.objectParts) so each screen shows its own character's world,
// while the world everyone shares stays the same. Colliders as everywhere else.
import * as THREE from 'three';
import { piece, bakeTree, flatten, G, shade } from '../render/ModelKit.js';
import { C, HEARTH, FORGE, LAMP, RUNE, CARGO } from './palette.js';

const TAU = Math.PI * 2;
const VOID = 0x0a0c12;
const SEAL = 0x9a6aff;
const WARDEN = 0x3a6a4a; // the Wardens' green (world/Towns.js)
const SIGIL = 0xf0c75e;  // the order's gold sigil
const CALL = 0xff3a5a;   // the Farcall Array calling the Hive
const SYNTH = 0x3ad8ff;  // the Synths' cyan (models/Synths.js SYNTH_GLOW)

// A rod from local point a to b.
const _a = new THREE.Vector3();
const _d = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const UP = new THREE.Vector3(0, 1, 0);
function rod(g, a, b, r, color, outline = 0.01) {
  _a.fromArray(a);
  _d.fromArray(b).sub(_a);
  const len = _d.length();
  _e.setFromQuaternion(_q.setFromUnitVectors(UP, _d.normalize()));
  piece(g, G.cyl(r, r, len, 6), color, { pos: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], rot: [_e.x, _e.y, _e.z], outline });
}

// A Warden plate welded onto Maker work: green steel with the gold sigil, a bead of weld round
// its edge. Faces local +z, centred at (x, y, z).
function wardenPlate(g, x, y, z, wd, ht) {
  piece(g, G.box(wd, ht, 0.08), WARDEN, { pos: [x, y, z], outline: 0.012 });
  piece(g, G.octa(Math.min(wd, ht) * 0.22), SIGIL, { pos: [x, y + ht * 0.06, z + 0.06], scale: [1, 1.25, 0.3], outline: 0.006 });
  for (const s of [-1, 1]) {
    piece(g, G.box(wd + 0.1, 0.07, 0.12), C.metal, { pos: [x, y + s * ht / 2, z], outline: 0 });
    piece(g, G.box(0.07, ht + 0.1, 0.12), C.metal, { pos: [x + s * wd / 2, y, z], outline: 0 });
  }
}

// A group standing at a world point on the ground, turned to `ry` (its +z faces bearing ry).
function at(w, x, z, ry = 0, lift = 0) {
  const g = new THREE.Group();
  g.position.set(x, w.groundHeight(x, z) + lift, z);
  g.rotation.y = ry;
  return g;
}
// A world point `d` metres out on bearing `a` from (x, z).
const out = (x, z, a, d) => [x + Math.sin(a) * d, z + Math.cos(a) * d];

// The parts of an object that show whether it's been used: baked, hidden until the screen knows.
function parts(w, id, build) {
  const on = new THREE.Group();
  const off = new THREE.Group();
  build(on, off);
  for (const g of [on, off]) {
    bakeTree(g, { surfaces: true });
    g.visible = false;
    (w.own?.group ?? w.root).add(g);
  }
  w.objectParts?.set(id, { on, off, owner: w.own });
  return { on, off };
}
// Places a parts group at an object's world anchor ({ pos, ry }).
const place = (g, wa) => { g.position.copy(wa.pos); g.rotation.set(0, wa.ry, 0); };
// A collider at a point local to an object's anchor.
const wcol = (w, wa, lx, lz, r, h) => w.addCollider(wa.pos.x + Math.cos(wa.ry) * lx + Math.sin(wa.ry) * lz, wa.pos.z - Math.sin(wa.ry) * lx + Math.cos(wa.ry) * lz, r, h);

// ---------------------------------------------------------------- objects
// Each takes the world, the place, the object (one of its folk, role 'object') and the builder's
// group to add its fixed pieces to; returns the interact radius it blocks.
export const OBJECT_MODELS = {
  // The Pilgrim's bridge console, dug out of the hull, with the cryo bay's last open pods behind.
  console(w, p, n, g, wa) {
    piece(g, G.box(1.0, 1.0, 0.7), C.metalDark, { pos: [0, 0.5, 0], outline: 0.03 });
    piece(g, G.box(1.2, 0.1, 0.8), C.hull, { pos: [0, 1.08, 0.08], rot: [-0.45, 0, 0], outline: 0.02 });
    for (const s of [-1, 1]) piece(g, G.cyl(0.06, 0.06, 1.4, 6), C.metalDark, { pos: [s * 0.6, 0.3, -0.5], rot: [1.2, 0, 0], outline: 0.008 });
    for (const [x, z, a] of [[-1.9, -1.6, 0.3], [1.9, -1.8, -0.4], [0.2, -2.6, 0.1]]) {
      const pod = new THREE.Group();
      pod.position.set(x, 0, z);
      pod.rotation.y = a;
      g.add(pod);
      piece(pod, G.box(0.9, 0.5, 2.1), C.hull, { pos: [0, 0.25, 0], outline: 0.025 });
      piece(pod, G.box(0.72, 0.06, 1.9), 0x2a3440, { pos: [0, 0.51, 0], outline: 0 });
      piece(pod, G.box(0.9, 0.08, 2.0), 0xbfe6ff, { pos: [0.55, 0.7, 0], rot: [0, 0, 1.1], outline: 0.012 });
    }
    const { on, off } = parts(w, n.id, (onG, offG) => {
      piece(offG, G.box(0.95, 0.04, 0.6), 0x1a2430, { pos: [0, 1.15, 0.1], rot: [-0.45, 0, 0], outline: 0 });
      piece(onG, G.box(0.95, 0.04, 0.6), RUNE, { pos: [0, 1.15, 0.1], rot: [-0.45, 0, 0], glow: true, outline: 0 });
      piece(onG, G.octa(0.22), 0xbfe6ff, { pos: [0, 1.9, 0], scale: [1, 1.6, 1], glow: true, outline: 0.008 });
    });
    place(on, wa);
    place(off, wa);
    return 0.75;
  },

  // A signal beacon's fire: the lighting post at the tower's foot, and the brazier on top — cold
  // coals until it's lit, a fire you can see from the city after.
  beacon(w, p, n, g, wa) {
    piece(g, G.box(0.6, 1.0, 0.5), C.metalDark, { pos: [0, 0.5, 0], outline: 0.02 });
    piece(g, G.box(0.08, 0.6, 0.08), C.metal, { pos: [0.15, 1.2, 0], rot: [0, 0, 0.5], outline: 0.006 });
    piece(g, G.cyl(0.35, 0.35, 0.9, 10), 0x8a2a2a, { pos: [-0.7, 0.45, 0.1], outline: 0.015 });
    const top = { pos: new THREE.Vector3(p.x, w.groundHeight(p.x, p.z) + 7.6, p.z), ry: 0 };
    parts(w, n.id, (onG, offG) => {
      place(onG, top);
      place(offG, top);
      for (let k = 0; k < 5; k++) piece(offG, G.dodeca(0.32), 0x2a2420, { pos: [Math.sin(k * 1.3) * 0.5, 0.25, Math.cos(k * 1.3) * 0.5], outline: 0.01 });
      piece(onG, G.cone(1.1, 2.6, 8), FORGE, { pos: [0, 1.4, 0], glow: true, outline: 0.02 });
      piece(onG, G.cone(0.65, 1.8, 7), LAMP, { pos: [0, 1.1, 0.05], glow: true, outline: 0 });
      piece(onG, G.sphere(0.25, 8, 6), FORGE, { pos: [-0.2, -7.2, 0], glow: true, outline: 0 });
    });
    return 0.6;
  },

  // A scav strongbox: banded steel, a glowing lock — sprung open once you've had what's in it.
  strongbox(w, p, n, g, wa) {
    piece(g, G.box(1.1, 0.6, 0.7), C.metalDark, { pos: [0, 0.3, 0], outline: 0.025 });
    for (const x of [-0.35, 0.35]) piece(g, G.box(0.08, 0.62, 0.72), C.rust, { pos: [x, 0.3, 0], outline: 0.006 });
    const { on, off } = parts(w, n.id, (onG, offG) => {
      piece(offG, G.box(1.12, 0.14, 0.72), C.rust, { pos: [0, 0.67, 0], outline: 0.015 });
      piece(offG, G.box(0.16, 0.16, 0.05), FORGE, { pos: [0, 0.42, 0.38], glow: true, outline: 0 });
      piece(onG, G.box(1.12, 0.14, 0.72), C.rust, { pos: [0, 0.95, -0.38], rot: [-1.2, 0, 0], outline: 0.015 });
      piece(onG, G.box(0.9, 0.05, 0.5), LAMP, { pos: [0, 0.58, 0], glow: true, outline: 0 });
    });
    place(on, wa);
    place(off, wa);
    return 0.65;
  },

  // A Hive spore pod (Act II, the Spore Field): a swollen resin bulb on a chitin root, its sacs
  // glowing; once burned, a charred husk.
  sporepod(w, p, n, g, wa) {
    piece(g, G.cone(0.5, 0.7, 6), C.chitin, { pos: [0, 0.35, 0], outline: 0.02 });
    const { on, off } = parts(w, n.id, (onG, offG) => {
      piece(offG, G.dodeca(0.8), C.resin, { pos: [0, 1.15, 0], scale: [1, 1.35, 1], outline: 0.03 });
      for (let k = 0; k < 4; k++) piece(offG, G.sphere(0.2, 10, 8), 0xc46aff, { pos: [Math.sin(k * 1.6) * 0.62, 0.9 + (k % 2) * 0.5, Math.cos(k * 1.6) * 0.62], glow: true, outline: 0.01 });
      piece(onG, G.dodeca(0.7), C.metalDark, { pos: [0, 0.95, 0], scale: [1, 0.8, 1], rot: [0.3, 0.7, 0], outline: 0.03 });
    });
    place(on, wa);
    place(off, wa);
    return 0.8;
  },

  // The Sunken Vault's door: a ring of Maker stone in the dig's far wall — sealed, until it isn't.
  vaultdoor(w, p, n, g, wa) {
    for (let k = 0; k < 7; k++) {
      const a = -1.2 + k * 0.4;
      piece(g, G.dodeca(2.4), k % 2 ? C.stoneDark : shade(C.stoneDark, 0.9), { pos: [Math.sin(a) * 4.6, 2.2 + (k % 3) * 0.6, -1.6 - Math.cos(a) * 0.8], rot: [k, k * 1.7, 0], scale: [1, 1.3, 0.9], outline: 0.04 });
    }
    piece(g, G.torus(3.2, 0.5, TAU, 8, 32), C.stoneDark, { pos: [0, 3.4, 0], outline: 0.04 });
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU;
      piece(g, G.box(0.18, 0.5, 0.08), RUNE, { pos: [Math.cos(a) * 3.2, 3.4 + Math.sin(a) * 3.2, 0.52], rot: [0, 0, a], glow: true, outline: 0 });
    }
    piece(g, G.box(7.6, 0.5, 2.4), C.stone, { pos: [0, 0.25, 0.4], outline: 0.025 });
    for (const lx of [-3.4, 3.4]) wcol(w, wa, lx, 0, 1.1, 7);
    for (const lx of [-1.4, 0, 1.4]) wcol(w, wa, lx, -0.6, 1.1, 7);
    const { on, off } = parts(w, n.id, (onG, offG) => {
      piece(offG, G.cylZ(2.85, 2.85, 0.6, 28), C.stone, { pos: [0, 3.4, -0.1], outline: 0.03 });
      for (const r of [1.0, 1.9, 2.6]) piece(offG, G.torus(r, 0.07, TAU, 4, 28), SEAL, { pos: [0, 3.4, 0.22], glow: true, outline: 0 });
      piece(onG, G.cylZ(2.85, 2.85, 0.2, 28), VOID, { pos: [0, 3.4, -0.4], outline: 0 });
      piece(onG, G.cone(2.6, 5, 16), SEAL, { pos: [0, 3.4, 2.2], rot: [-Math.PI / 2, 0, 0], scale: [1, 1, 0.12], glow: true, outline: 0 });
      for (let k = 0; k < 4; k++) piece(onG, G.box(1.6, 0.3, 0.6), C.stone, { pos: [-2 + k * 1.3, 0.3, 1.8 + (k % 2) * 0.6], rot: [0, k, 0.2], outline: 0.02 });
    });
    place(on, wa);
    place(off, wa);
    return 0;
  },

  // The way down into the Rustjaw Foundry (a dungeon: world/dungeons.js): a sloped steel bunker at
  // the back of the yard, its shutter half up over the red glow of the furnace hall below.
  foundrygate(w, p, n, g, wa) {
    for (const s of [-1, 1]) {
      piece(g, G.box(1, 4.2, 5), C.steel, { pos: [s * 3.3, 2.1, -1.2], rot: [0, 0, s * -0.06], outline: 0.04 });
      for (let k = 0; k < 4; k++) piece(g, G.box(1.06, 0.3, 0.6), k % 2 ? 0xd9a227 : 0x2a2420, { pos: [s * 3.3, 3.6, 1.1 - k * 0.6], outline: 0 });
    }
    piece(g, G.box(7.8, 0.7, 5.6), C.metalDark, { pos: [0, 4.45, -1.2], rot: [0.12, 0, 0], outline: 0.04 });
    piece(g, G.box(5.6, 0.2, 0.3), FORGE, { pos: [0, 3.95, 1.25], glow: true, outline: 0 });
    // The shutter, and the glow under it.
    piece(g, G.box(5.4, 1.6, 0.35), C.rust, { pos: [0, 3.1, 0.9], outline: 0.03 });
    for (let k = 0; k < 4; k++) piece(g, G.box(5.4, 0.08, 0.38), C.metalDark, { pos: [0, 2.45 + k * 0.4, 0.9], outline: 0 });
    piece(g, G.box(5.4, 2.3, 0.1), VOID, { pos: [0, 1.15, -0.6], outline: 0 });
    piece(g, G.box(5, 0.5, 3), FORGE, { pos: [0, -0.15, -1.6], rot: [-0.35, 0, 0], glow: true, outline: 0 });
    piece(g, G.box(3.4, 1.0, 0.12), 0xb8342a, { pos: [0, 5.25, 1.3], outline: 0.02 });
    piece(g, G.box(2.6, 0.32, 0.05), FORGE, { pos: [0, 5.25, 1.37], glow: true, outline: 0 });
    for (const lx of [-3.3, 3.3]) for (const lz of [-3, -1.2, 0.6]) wcol(w, wa, lx, lz, 0.75, 4.2);
    for (const lx of [-2, 0, 2]) wcol(w, wa, lx, -3.4, 1.1, 4.2);
    return 0;
  },

  // The mouth of the Brood Pits (a dungeon): a resin mound split by a tunnel, ribbed with chitin
  // and spotted with glowing sacs.
  broodmouth(w, p, n, g, wa) {
    for (let k = 0; k < 9; k++) {
      const a = -1.9 + k * 0.48;
      const s = 2.2 + ((k * 37) % 7) * 0.2;
      piece(g, G.dodeca(s), k % 2 ? C.resin : C.resinDark, { pos: [Math.sin(a) * 4.4, s * 0.55, -1.6 - Math.cos(a) * 1.4], rot: [k, k * 1.3, 0], scale: [1, 1.2, 1], outline: 0.04 });
    }
    piece(g, G.dodeca(3.4), C.resin, { pos: [0, 4.8, -2.2], scale: [1.6, 0.7, 1.2], outline: 0.04 });
    piece(g, G.cylZ(2.4, 2.4, 0.4, 20), VOID, { pos: [0, 2.2, -0.8], scale: [1, 1.15, 1], outline: 0 });
    piece(g, G.torus(2.5, 0.35, TAU * 0.62, 6, 20), C.chitin, { pos: [0, 2.2, -0.4], rot: [0, 0, Math.PI * 0.19], outline: 0.03 });
    for (let k = 0; k < 5; k++) {
      const a = -1.2 + k * 0.6;
      piece(g, G.cone(0.3, 2.8, 5), C.chitin, { pos: [Math.sin(a) * 3.6, 5.4, -1.2 - Math.cos(a)], rot: [-0.4 * Math.cos(a), 0, 0.5 * Math.sin(a)], outline: 0.025 });
      piece(g, G.sphere(0.32, 10, 8), 0xc46aff, { pos: [Math.sin(a + 0.3) * 3.3, 1.2 + (k % 3) * 0.9, 0.3 - Math.cos(a)], glow: true, outline: 0.012 });
    }
    for (const lx of [-3.8, 3.8]) for (const lz of [-2.6, -0.6]) wcol(w, wa, lx, lz, 1.4, 5);
    for (const lx of [-1.6, 0, 1.6]) wcol(w, wa, lx, -3.2, 1.3, 5);
    return 0;
  },

  // The Foundry Below's way in (Act III): a Synth blast hatch set in the back wall of a cut, white
  // plate in a graphite frame, cyan along its seams and a lit strip over the lintel. Its doors are
  // shut for good; the way down opens to whoever the story has opened it to (world/dungeons.js).
  hatch(w, p, n, g, wa) {
    piece(g, G.box(6.4, 5.4, 1.2), 0x2a2e36, { pos: [0, 2.7, -0.6], outline: 0.04 });
    for (const s of [-1, 1]) {
      piece(g, G.box(2.2, 4.0, 0.3), 0xd8dde4, { pos: [s * 1.12, 2.1, 0.05], outline: 0.025 });
      piece(g, G.box(0.08, 3.6, 0.06), SYNTH, { pos: [s * 0.04, 2.1, 0.22], glow: true, outline: 0 });
      piece(g, G.box(0.6, 5.0, 1.0), 0x4a505c, { pos: [s * 2.9, 2.5, -0.1], outline: 0.02 });
    }
    piece(g, G.box(4.6, 0.14, 0.1), SYNTH, { pos: [0, 4.4, 0.05], glow: true, outline: 0 });
    piece(g, G.box(5.2, 0.5, 0.8), 0x4a505c, { pos: [0, 4.85, 0], outline: 0.02 });
    for (const lx of [-2.6, -1.2, 0, 1.2, 2.6]) wcol(w, wa, lx, -0.6, 0.9, 5.4);
    return 0;
  },

  // One of the Farcall Array's consoles: a Maker slab of black stone, its face cut with runes, and
  // a Warden panel welded over the top. Screaming red while the Array calls; dark once you've
  // powered it down.
  arrayconsole(w, p, n, g, wa) {
    piece(g, G.box(1.5, 1.0, 0.9), C.obsidian, { pos: [0, 0.5, 0], outline: 0.03 });
    for (const x of [-0.5, 0, 0.5]) piece(g, G.box(0.06, 0.6, 0.04), RUNE, { pos: [x, 0.45, 0.46], glow: true, outline: 0 });
    piece(g, G.box(1.4, 0.1, 0.8), WARDEN, { pos: [0, 1.08, 0.06], rot: [-0.45, 0, 0], outline: 0.02 });
    piece(g, G.octa(0.14), SIGIL, { pos: [0.52, 1.17, -0.2], rot: [-0.45, 0, 0], scale: [1, 0.3, 1.2], outline: 0.004 });
    for (const s of [-1, 1]) piece(g, G.box(0.06, 0.12, 0.85), C.metal, { pos: [s * 0.72, 1.06, 0.06], rot: [-0.45, 0, 0], outline: 0 });
    piece(g, G.box(0.5, 0.9, 0.3), C.steel, { pos: [0, 1.2, -0.55], outline: 0.015 });
    const { on, off } = parts(w, n.id, (onG, offG) => {
      piece(offG, G.box(1.0, 0.04, 0.55), CALL, { pos: [-0.12, 1.15, 0.1], rot: [-0.45, 0, 0], glow: true, outline: 0 });
      piece(offG, G.sphere(0.09, 8, 6), CALL, { pos: [0, 1.75, -0.55], glow: true, outline: 0 });
      piece(onG, G.box(1.0, 0.04, 0.55), 0x1a2430, { pos: [-0.12, 1.15, 0.1], rot: [-0.45, 0, 0], outline: 0 });
      piece(onG, G.sphere(0.09, 8, 6), 0x7aff9a, { pos: [0, 1.75, -0.55], glow: true, outline: 0 });
    });
    place(on, wa);
    place(off, wa);
    return 0.85;
  },

  // The Farcall Array's transmitter: a Maker emitter column under the dish, braced with Warden
  // bands, a crystal at its head pulsing the call. Once you've destroyed it: the crystal shattered
  // on the stones, the column's head split and dark.
  transmitter(w, p, n, g, wa) {
    piece(g, G.box(2.8, 0.4, 2.8), C.stoneDark, { pos: [0, 0.2, 0], outline: 0.03 });
    piece(g, G.box(2.0, 0.4, 2.0), C.obsidian, { pos: [0, 0.6, 0], outline: 0.03 });
    piece(g, G.cyl(0.6, 0.85, 4.2, 8), C.obsidian, { pos: [0, 2.9, 0], outline: 0.04 });
    for (let k = 0; k < 4; k++) piece(g, G.box(0.06, 3.2, 0.04), RUNE, { pos: [Math.sin(k * TAU / 4 + 0.4) * 0.72, 2.8, Math.cos(k * TAU / 4 + 0.4) * 0.72], rot: [0, k * TAU / 4 + 0.4, 0], glow: true, outline: 0 });
    for (const y of [1.6, 3.6]) piece(g, G.cyl(0.84 - (y - 1.6) * 0.06, 0.84 - (y - 1.6) * 0.06, 0.3, 8), WARDEN, { pos: [0, y, 0], outline: 0.012 });
    wardenPlate(g, 0, 2.6, 0.82, 0.9, 1.2);
    const { on, off } = parts(w, n.id, (onG, offG) => {
      piece(offG, G.cyl(0.4, 0.6, 0.5, 8), C.obsidian, { pos: [0, 5.25, 0], outline: 0.03 });
      piece(offG, G.octa(0.55), CALL, { pos: [0, 6.2, 0], scale: [1, 1.7, 1], glow: true, outline: 0.012 });
      for (const [r, y] of [[1.0, 6.0], [1.5, 6.5]]) piece(offG, G.torus(r, 0.04, TAU, 4, 24), CALL, { pos: [0, y, 0], rot: [Math.PI / 2, 0, 0], glow: true, outline: 0 });
      piece(onG, G.cyl(0.45, 0.45, 0.1, 8), VOID, { pos: [0, 5.02, 0], outline: 0 });
      for (let k = 0; k < 6; k++) piece(onG, G.octa(0.18 + (k % 3) * 0.08), k % 2 ? 0x5a2a34 : C.obsidian, { pos: [Math.sin(k * 1.9) * (1.3 + k * 0.15), 0.55, Math.cos(k * 1.9) * (1.3 + k * 0.15)], rot: [k, k * 2, 0.4], scale: [1, 1.6, 1], outline: 0.008 });
      piece(onG, G.box(0.7, 0.5, 0.12), C.metalDark, { pos: [0.6, 0.65, 1.3], rot: [0.2, 0.5, 1.1], outline: 0.01 });
    });
    place(on, wa);
    place(off, wa);
    wcol(w, wa, 0, 0, 1.25, 5);
    return 0;
  },

  // A mine shaft choked with rubble (cleared once you've dug it out).
  rubble(w, p, n, g, wa) {
    for (const s of [-1, 1]) piece(g, G.box(0.22, 2.2, 0.22), C.wood, { pos: [s * 1.1, 1.1, 0], outline: 0.012 });
    piece(g, G.box(2.6, 0.22, 0.26), C.wood, { pos: [0, 2.2, 0], outline: 0.012 });
    const { on, off } = parts(w, n.id, (onG, offG) => {
      for (let k = 0; k < 5; k++) piece(offG, G.dodeca(0.5 + (k % 3) * 0.15), k % 2 ? C.stoneDark : C.stone, { pos: [-0.8 + k * 0.4, 0.35 + (k % 2) * 0.3, 0.3], rot: [k, k * 2, 0], outline: 0.02 });
      piece(onG, G.box(1.8, 1.9, 0.1), VOID, { pos: [0, 1, -0.05], outline: 0 });
      piece(onG, G.dodeca(0.3), C.stoneDark, { pos: [1.2, 0.2, 0.6], outline: 0.015 });
    });
    place(on, wa);
    place(off, wa);
    return 0;
  },

  // The deep cut: a shaft into the dark, braced — charged and sealed once you've set the charges.
  cut(w, p, n, g, wa) {
    piece(g, G.box(2.6, 0.12, 2.6), C.woodDark, { pos: [0, 0.06, 0], outline: 0.02 });
    piece(g, G.box(2.0, 0.14, 2.0), VOID, { pos: [0, 0.08, 0], outline: 0 });
    for (const [x, z] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) piece(g, G.box(0.2, 1.6, 0.2), C.wood, { pos: [x, 0.8, z], outline: 0.01 });
    const { on, off } = parts(w, n.id, (onG, offG) => {
      piece(offG, G.box(0.12, 0.12, 0.12), FORGE, { pos: [1.2, 1.7, 1.2], glow: true, outline: 0 });
      for (let k = 0; k < 4; k++) piece(onG, G.box(2.4, 0.1, 0.4), C.wood, { pos: [0, 0.2, -0.9 + k * 0.6], outline: 0.01 });
      for (const x of [-0.6, 0.6]) piece(onG, G.box(0.3, 0.3, 0.3), 0xb8342a, { pos: [x, 0.4, 0], outline: 0.01 });
      piece(onG, G.box(0.14, 0.14, 0.14), 0xff4a3a, { pos: [0, 0.6, 0], glow: true, outline: 0 });
    });
    place(on, wa);
    place(off, wa);
    return 0;
  },

  // An outpost's relay: a mast and dish, its light dead until it's repaired.
  relay(w, p, n, g, wa) {
    piece(g, G.cyl(0.08, 0.12, 3.6, 6), C.metalDark, { pos: [0, 1.8, 0], outline: 0.012 });
    piece(g, G.dome(0.7, 12, 6), C.hab, { pos: [0.3, 3.2, 0], rot: [0, 0, -1.2], outline: 0.015 });
    piece(g, G.box(0.6, 0.7, 0.4), C.steel, { pos: [0, 0.35, 0.3], outline: 0.015 });
    const { on, off } = parts(w, n.id, (onG, offG) => {
      piece(offG, G.sphere(0.12, 8, 6), 0x3a3030, { pos: [0, 3.75, 0], outline: 0.008 });
      piece(onG, G.sphere(0.13, 8, 6), 0xff4a3a, { pos: [0, 3.75, 0], glow: true, outline: 0 });
      piece(onG, G.torus(0.5, 0.03, TAU, 4, 18), HEARTH, { pos: [0, 2.6, 0], rot: [Math.PI / 2, 0, 0], glow: true, outline: 0 });
      piece(onG, G.box(0.4, 0.12, 0.05), HEARTH, { pos: [0, 0.5, 0.52], glow: true, outline: 0 });
    });
    place(on, wa);
    place(off, wa);
    return 0.4;
  },

  // A marsh-lantern on its post: out, until you light it.
  lantern(w, p, n, g, wa) {
    piece(g, G.cyl(0.07, 0.09, 2.4, 6), C.woodDark, { pos: [0, 1.2, 0], outline: 0.01 });
    piece(g, G.box(0.5, 0.06, 0.06), C.woodDark, { pos: [0.2, 2.4, 0], outline: 0.008 });
    const { on, off } = parts(w, n.id, (onG, offG) => {
      piece(offG, G.box(0.26, 0.34, 0.26), 0x2a2a26, { pos: [0.42, 2.15, 0], outline: 0.01 });
      piece(onG, G.box(0.26, 0.34, 0.26), LAMP, { pos: [0.42, 2.15, 0], glow: true, outline: 0.01 });
    });
    place(on, wa);
    place(off, wa);
    return 0.25;
  },

  // The Fallen Titan's control core (Act III), its armoured housing torn half out of the chest by
  // the salvagers and left at the Titan's knees: the core glowing in it until you pull it, an
  // empty socket after.
  titancore(w, p, n, g, wa) {
    piece(g, G.cyl(1.0, 1.1, 1.6, 12).rotateX(Math.PI / 2), C.steel, { pos: [0, 0.95, 0], rot: [0, 0, 0.12], outline: 0.03 });
    for (const z of [-0.6, 0.6]) piece(g, G.cyl(1.12, 1.12, 0.14, 12).rotateX(Math.PI / 2), C.rust, { pos: [0, 0.95, z], outline: 0.012 });
    piece(g, G.box(2.4, 0.3, 1.8), C.metalDark, { pos: [0, 0.15, 0], outline: 0.02 });
    for (const s of [-1, 1]) piece(g, G.box(0.12, 0.12, 1.6), C.metal, { pos: [s * 0.9, 1.9, 0.2], rot: [0.4, 0, s * 0.3], outline: 0.008 });
    const { on, off } = parts(w, n.id, (onG, offG) => {
      piece(offG, G.sphere(0.55, 14, 10), SYNTH, { pos: [0, 0.95, 0.85], glow: true, outline: 0.01 });
      piece(offG, G.cyl(0.62, 0.62, 0.05, 14).rotateX(Math.PI / 2), 0xe6f6ff, { pos: [0, 0.95, 0.82], glow: true, outline: 0 });
      piece(onG, G.cyl(0.6, 0.6, 0.06, 12).rotateX(Math.PI / 2), VOID, { pos: [0, 0.95, 0.82], outline: 0 });
    });
    place(on, wa);
    place(off, wa);
    return 1.3;
  },

  // Isa Brannock's cradle (Act III): a steel frame on a workbench, cables run out to the yard's
  // generator. Empty, its clamps open, until the Titan's core is set in it and woken; then the core
  // turns, lit, in its rings. (Empty, not a cold core, so it never shows the core before c6's done.)
  cradle(w, p, n, g, wa) {
    piece(g, G.box(2.2, 0.9, 1.2), C.metalDark, { pos: [0, 0.45, 0], outline: 0.025 });
    piece(g, G.box(2.4, 0.1, 1.4), C.steel, { pos: [0, 0.95, 0], outline: 0.012 });
    for (const s of [-1, 1]) {
      piece(g, G.box(0.14, 1.5, 0.14), C.metal, { pos: [s * 0.8, 1.7, 0], outline: 0.008 });
      piece(g, G.cyl(0.05, 0.05, 2.6, 5), 0x1a1a1e, { pos: [s * 0.9, 0.3, -1.4], rot: [1.3, 0, s * 0.2], outline: 0 });
    }
    piece(g, G.box(1.7, 0.12, 0.12), C.metal, { pos: [0, 2.45, 0], outline: 0.008 });
    const { on, off } = parts(w, n.id, (onG, offG) => {
      for (const s of [-1, 1]) piece(offG, G.box(0.1, 0.4, 0.5), 0x4a505c, { pos: [s * 0.62, 1.6, 0], rot: [0, 0, s * 0.5], outline: 0.008 });
      piece(onG, G.sphere(0.55, 14, 10), SYNTH, { pos: [0, 1.6, 0], glow: true, outline: 0.01 });
      piece(onG, G.torus(0.85, 0.05), 0xe6f6ff, { pos: [0, 1.6, 0], rot: [Math.PI / 2, 0, 0], glow: true, outline: 0 });
      piece(onG, G.torus(0.75, 0.04), SYNTH, { pos: [0, 1.6, 0], rot: [0.4, 0.6, 0], glow: true, outline: 0 });
    });
    place(on, wa);
    place(off, wa);
    return 1.3;
  },
};

// The objects among a place's folk, into the builder's group `g` (whose origin is the place's
// centre `p`): each at its spot, with its collider.
export function objectProps(w, p, g, origin) {
  for (const n of p.npcs ?? []) {
    if (n.role !== 'object' || !OBJECT_MODELS[n.model]) continue;
    const wa = { pos: new THREE.Vector3(n.x, w.groundHeight(n.x, n.z), n.z), ry: n.facing ?? 0 };
    const h = new THREE.Group();
    h.position.set(wa.pos.x - origin.x, wa.pos.y - origin.y, wa.pos.z - origin.z);
    h.rotation.y = wa.ry;
    g.add(h);
    const r = OBJECT_MODELS[n.model](w, p, n, h, wa);
    if (r) w.addCollider(n.x, n.z, r, n.model === 'console' ? 1.2 : 1.1);
  }
}

// ---------------------------------------------------------------- sites
// A builder's group at a site's centre, unturned.
function siteGroup(w, p) {
  const g = new THREE.Group();
  g.position.set(p.x, w.groundHeight(p.x, p.z), p.z);
  return g;
}
const local = (g, x, z, w) => [x - g.position.x, w.groundHeight(x, z) - g.position.y, z - g.position.z];

export const STORY_BUILDERS = {
  // The Wardens' relic dig: a trench round a half-dug Maker monolith, scaffolds, tents, crates and
  // floodlights, a Warden banner.
  relicdig(w, p) {
    const g = siteGroup(w, p);
    const rnd = w.rnd;
    const back = p.rot + Math.PI;
    const [mx, mz] = out(p.x, p.z, back, 3);
    const m = at(w, mx, mz, p.rot);
    m.position.sub(g.position);
    g.add(m);
    piece(m, G.box(7, 0.4, 4), C.dirtDark, { pos: [0, 0.1, 0], outline: 0.02 });
    piece(m, G.box(1.3, 4.2, 0.9), C.obsidian, { pos: [0, 2.1, 0], rot: [0.12, 0, 0.06], outline: 0.04 });
    for (let k = 0; k < 4; k++) piece(m, G.box(0.08, 0.7, 0.04), RUNE, { pos: [-0.3 + (k % 2) * 0.6, 1.2 + k * 0.7, 0.46], rot: [0.12, 0, 0], glow: true, outline: 0 });
    for (const [x, z] of [[-2.4, -1.4], [2.4, -1.4], [-2.4, 1.4], [2.4, 1.4]]) piece(m, G.box(0.12, 3.2, 0.12), C.wood, { pos: [x, 1.6, z], outline: 0.008 });
    for (const y of [1.4, 2.8]) piece(m, G.box(5, 0.1, 0.12), C.wood, { pos: [0, y, -1.4], outline: 0.006 });
    w.addCollider(mx, mz, 1.1, 4.2);
    for (const k of [-1, 1]) {
      const [tx, tz] = out(p.x, p.z, back + k * 1.25, 8.5);
      const t = at(w, tx, tz, back + k * 1.25 + Math.PI);
      t.position.sub(g.position);
      g.add(t);
      piece(t, G.cone(2.2, 2.6, 4), C.canvas, { pos: [0, 1.3, 0], rot: [0, Math.PI / 4, 0], outline: 0.03 });
      piece(t, G.box(0.9, 1.4, 0.06), 0x3a2a20, { pos: [0, 0.7, 1.4], rot: [-0.5, 0, 0], outline: 0.008 });
      w.addCollider(tx, tz, 1.7, 2.4);
    }
    for (let k = 0; k < 4; k++) {
      const [cx, cz] = out(p.x, p.z, p.rot + 1.6 + k * 0.4, 6.5 + (k % 2));
      const c = at(w, cx, cz, rnd() * 3);
      c.position.sub(g.position);
      g.add(c);
      piece(c, G.box(0.9, 0.9, 0.9), CARGO[k % CARGO.length], { pos: [0, 0.45, 0], outline: 0.015 });
      w.addCollider(cx, cz, 0.62, 0.9);
    }
    for (const k of [-1, 1]) {
      const [lx, lz] = out(p.x, p.z, back + k * 0.55, 6.5);
      const [x, y, z] = local(g, lx, lz, w);
      piece(g, G.cyl(0.07, 0.09, 4, 6), C.metalDark, { pos: [x, y + 2, z], outline: 0.01 });
      piece(g, G.box(0.6, 0.35, 0.3), LAMP, { pos: [x, y + 4, z], glow: true, outline: 0.01 });
      w.addCollider(lx, lz, 0.15, 4);
    }
    const [bx, bz] = out(p.x, p.z, p.rot + 0.9, 7);
    const [x, y, z] = local(g, bx, bz, w);
    piece(g, G.cyl(0.05, 0.05, 4.4, 5), C.woodDark, { pos: [x, y + 2.2, z], outline: 0.01 });
    piece(g, G.box(0.05, 1.4, 1.0), 0x3a6a4a, { pos: [x, y + 3.6, z + 0.5], outline: 0.01 });
    objectProps(w, p, g, g.position);
    flatten(g);
    w.finish(g);
  },

  // A signal beacon: a lattice tower with a brazier on top, and the post to light it from.
  beacon(w, p) {
    const g = siteGroup(w, p);
    const H = 7.2;
    for (const [x, z] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]]) {
      piece(g, G.box(0.18, H + 0.4, 0.18), C.metalDark, { pos: [x * 0.8, H / 2, z * 0.8], rot: [z * 0.05, 0, -x * 0.05], outline: 0.012 });
      w.addCollider(p.x + x * 0.8, p.z + z * 0.8, 0.25, H);
    }
    for (const y of [2, 4.2, 6.2]) for (const s of [-1, 1]) {
      piece(g, G.box(2.4, 0.08, 0.08), C.metal, { pos: [0, y, s * 1.15], outline: 0.006 });
      piece(g, G.box(0.08, 0.08, 2.4), C.metal, { pos: [s * 1.15, y, 0], outline: 0.006 });
    }
    piece(g, G.box(2.6, 0.2, 2.6), C.metalDark, { pos: [0, H, 0], outline: 0.02 });
    piece(g, G.cyl(0.9, 0.6, 0.7, 10), C.rust, { pos: [0, H + 0.45, 0], outline: 0.02 });
    objectProps(w, p, g, g.position);
    flatten(g);
    w.finish(g);
  },

  // The Brood Pits (a dungeon, for Act II): creep spread round the tunnel mouth, egg clutches, resin
  // spires and the bones of what wandered too close.
  broodpits(w, p) {
    const g = siteGroup(w, p);
    const rnd = w.rnd;
    piece(g, G.cyl(p.r * 0.9, p.r, 0.12, 24), C.resinDark, { pos: [0, 0.02, 0], outline: 0 });
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * TAU + rnd() * 0.3;
      const d = p.r * (0.55 + rnd() * 0.35);
      const [x, y, z] = local(g, p.x + Math.sin(a) * d, p.z + Math.cos(a) * d, w);
      if (Math.abs(Math.atan2(Math.sin(a - p.rot), Math.cos(a - p.rot))) < 0.5) continue; // the way up to the mouth
      if (k % 3 === 0) {
        piece(g, G.cone(0.5, 4 + rnd() * 3, 6), C.chitin, { pos: [x, y + 2, z], rot: [rnd() * 0.3, 0, rnd() * 0.3], outline: 0.03 });
        w.addCollider(p.x + Math.sin(a) * d, p.z + Math.cos(a) * d, 0.6, 5);
      } else {
        for (let e = 0; e < 4; e++) piece(g, G.sphere(0.35, 10, 8), C.egg, { pos: [x + Math.sin(e * 1.7) * 0.5, y + 0.3 + (e > 2 ? 0.35 : 0), z + Math.cos(e * 1.7) * 0.4], scale: [1, 1.3, 1], outline: 0.012 });
        piece(g, G.sphere(0.2, 8, 6), 0xc46aff, { pos: [x, y + 0.9, z], glow: true, outline: 0 });
      }
    }
    for (let k = 0; k < 4; k++) {
      const [x, y, z] = local(g, p.x + (rnd() - 0.5) * p.r, p.z + (rnd() - 0.5) * p.r, w);
      piece(g, G.cyl(0.08, 0.06, 1.4, 6), C.bone, { pos: [x, y + 0.1, z], rot: [Math.PI / 2, rnd() * 3, 0], outline: 0.01 });
    }
    objectProps(w, p, g, g.position);
    flatten(g);
    w.finish(g);
  },

  // The Foundry Below (Act III): a cut into the ground, rock walls either side and behind, the blast
  // hatch at its back; light poles on either side and old Synth scrap left lying where it fell.
  // Local +z faces Ironreach, the way in.
  foundrybelow(w, p) {
    const g = siteGroup(w, p);
    const rnd = w.rnd;
    for (let k = 0; k < 11; k++) {
      // Walls of rock round the back half of the cut, open toward the city.
      const a = p.rot + Math.PI + (k - 5) * 0.32;
      const [x, z] = out(p.x, p.z, a, p.r - 1.5 + (k % 2) * 0.8);
      const [x3, y3, z3] = local(g, x, z, w);
      const s = 1.8 + rnd() * 0.9;
      piece(g, G.dodeca(s), k % 3 ? C.stoneDark : C.stone, { pos: [x3, y3 + s * 0.6, z3], rot: [rnd() * 3, rnd() * 3, 0], scale: [1, 1.3, 1], outline: 0.04 });
      w.addCollider(x, z, s * 0.85, s * 1.6);
    }
    for (const s of [-1, 1]) {
      const [x, z] = out(p.x, p.z, p.rot + s * 0.9, p.r - 3);
      const [x3, y3, z3] = local(g, x, z, w);
      piece(g, G.cyl(0.08, 0.1, 4.2, 6), 0x2a2e36, { pos: [x3, y3 + 2.1, z3], outline: 0.01 });
      piece(g, G.box(0.45, 0.2, 0.3), SYNTH, { pos: [x3, y3 + 4.2, z3], glow: true, outline: 0.006 });
      w.addCollider(x, z, 0.25, 4.2);
    }
    for (let k = 0; k < 3; k++) {
      // Off to the sides, never in front of the hatch.
      const [sx, sz] = out(p.x, p.z, p.rot + (k % 2 ? 1 : -1) * (1.1 + rnd() * 0.6), 4 + rnd() * 3);
      const [x3, y3, z3] = local(g, sx, sz, w);
      piece(g, G.box(1.2 + rnd(), 0.4, 0.8), 0xd8dde4, { pos: [x3, y3 + 0.2, z3], rot: [rnd() * 0.4, rnd() * 3, rnd() * 0.4], outline: 0.015 });
    }
    objectProps(w, p, g, g.position);
    flatten(g);
    w.finish(g);
  },

  // The Farcall Array (Act II): the Maker listening station the first Wardens re-tuned to sing the
  // Hive asleep. A great dish on a lattice of black Maker stone at the back, rune-cut pylons either
  // side, cables out to the consoles; over all of it, plates of Warden green welded on with the
  // order's gold sigil. Local +z faces Farcall (the way in); the stone apron in the middle is open
  // ground, the place to hold.
  array(w, p) {
    const g = siteGroup(w, p);
    const rnd = w.rnd;
    const cs = Math.cos(p.rot);
    const sn = Math.sin(p.rot);
    const W = (lx, lz) => [p.x + cs * lx + sn * lz, p.z - sn * lx + cs * lz];
    // A sub-group on the ground at a local point, turned with the place (plus `ry`).
    const put = (lx, lz, ry = 0) => {
      const [x, z] = W(lx, lz);
      const h = at(w, x, z, p.rot + ry);
      h.position.sub(g.position);
      g.add(h);
      return h;
    };
    const col = (lx, lz, r, h) => w.addCollider(...W(lx, lz), r, h);
    // The apron: Maker stone, a ring of runes round the ground to hold.
    const apron = put(0, 0);
    piece(apron, G.cyl(10, 10.4, 0.14, 36), C.stoneDark, { pos: [0, 0.03, 0], outline: 0 });
    piece(apron, G.torus(9.2, 0.07, TAU, 4, 48), RUNE, { pos: [0, 0.12, 0], rot: [Math.PI / 2, 0, 0], glow: true, outline: 0 });
    for (let k = 0; k < 8; k++) piece(apron, G.box(0.08, 0.04, 1.4), RUNE, { pos: [Math.sin(k * TAU / 8) * 8, 0.12, Math.cos(k * TAU / 8) * 8], rot: [0, k * TAU / 8, 0], glow: true, outline: 0 });

    // The dish on its lattice, at the back.
    const T = put(0, -11.5);
    const H = 9;
    for (const [x, z] of [[-2.6, -2.6], [2.6, -2.6], [-2.6, 2.6], [2.6, 2.6]]) {
      piece(T, G.box(0.6, H, 0.6), C.obsidian, { pos: [x, H / 2, z], outline: 0.035 });
      piece(T, G.box(0.05, H * 0.8, 0.05), RUNE, { pos: [x + Math.sign(x) * 0.32, H / 2, z], glow: true, outline: 0 });
      col(x, -11.5 + z, 0.45, H);
    }
    for (const y of [2.6, 5.4]) {
      for (const [a, b] of [[[-2.6, y, 2.6], [2.6, y + 2.4, 2.6]], [[2.6, y, -2.6], [-2.6, y + 2.4, -2.6]], [[-2.6, y, -2.6], [-2.6, y + 2.4, 2.6]], [[2.6, y, 2.6], [2.6, y + 2.4, -2.6]]]) rod(T, a, b, 0.12, C.metalDark);
    }
    piece(T, G.box(6.4, 0.5, 6.4), C.obsidian, { pos: [0, H, 0], outline: 0.04 });
    piece(T, G.cyl(1.1, 1.5, 1.8, 10), C.steel, { pos: [0, H + 1.1, 0], outline: 0.03 });
    const dish = new THREE.Group();
    dish.position.set(0, H + 3.8, 0);
    dish.rotation.set(-0.7, 0, 0);
    T.add(dish);
    piece(dish, G.dome(8, 32, 8, 0.32), C.hab, { rot: [Math.PI, 0, 0], scale: [1, 0.55, 1], outline: 0.06 });
    piece(dish, G.torus(6.8, 0.16, TAU, 4, 44), C.metal, { pos: [0, -2.34, 0], rot: [Math.PI / 2, 0, 0], outline: 0.02 }); // on the bowl's lip
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU;
      rod(dish, [Math.cos(a) * 5.5, -2, Math.sin(a) * 5.5], [0, 3.2, 0], 0.1, C.metal);
    }
    piece(dish, G.cone(0.6, 1.4, 8), C.obsidian, { pos: [0, 3.5, 0], rot: [Math.PI, 0, 0], outline: 0.02 });
    piece(dish, G.sphere(0.24, 8, 6), CALL, { pos: [0, 4.3, 0], glow: true, outline: 0 });
    // The Wardens' work on it: plates on the front legs and the platform's lip.
    for (const s of [-1, 1]) wardenPlate(T, s * 2.6, 3.4, 2.95, 1.3, 2.0);
    wardenPlate(T, 0, H, 3.25, 2.4, 0.9);

    // Rune-cut pylons either side, each banded with a welded plate.
    for (const s of [-1, 1]) {
      const y = put(s * 9, -4.5, -s * 0.5);
      piece(y, G.box(1.7, 6.4, 1.3), C.obsidian, { pos: [0, 3.2, 0], rot: [0, 0, s * 0.03], outline: 0.04 });
      for (let k = 0; k < 3; k++) piece(y, G.box(0.07, 1.1, 0.04), RUNE, { pos: [-0.4 + k * 0.4, 4.4 - (k % 2) * 0.8, 0.66], glow: true, outline: 0 });
      piece(y, G.cone(0.95, 1.2, 4), C.obsidian, { pos: [0, 7, 0], rot: [0, Math.PI / 4, 0], outline: 0.03 });
      wardenPlate(y, 0, 2.2, 0.68, 1.5, 1.4);
      col(s * 9, -4.5, 1.15, 6.4);
    }

    // Cables from the consoles back to the works; Warden lamps at the way in.
    const [cl, cr] = [W(-4.8, 5.1), W(4.8, 5.1)];
    for (const [cx, cz] of [cl, cr]) {
      const lx = cs * (cx - p.x) - sn * (cz - p.z);
      const lz = sn * (cx - p.x) + cs * (cz - p.z);
      const c = put(0, 0);
      piece(c, G.tube([[lx, 0.15, lz - 0.6], [lx * 0.6, 0.12, -2], [lx * 0.2, 0.12, -6], [Math.sign(lx) * 2.4, 0.15, -9]], 0.11, 14, 5), 0x2a2e36, { outline: 0.01 });
    }
    for (const s of [-1, 1]) {
      const l = put(s * 6.5, 11.5);
      piece(l, G.cyl(0.08, 0.1, 4, 6), C.metalDark, { pos: [0, 2, 0], outline: 0.01 });
      piece(l, G.box(0.6, 0.35, 0.3), LAMP, { pos: [0, 4, 0], glow: true, outline: 0.01 });
      piece(l, G.box(0.5, 1.2, 0.04), WARDEN, { pos: [0, 2.8, 0.1], outline: 0.008 });
      col(s * 6.5, 11.5, 0.15, 4);
    }
    // The old Warden line round its back: barricades of Maker stone and steel, broken in places.
    for (let k = 0; k < 7; k++) {
      const a = Math.PI * 0.55 + k * (Math.PI * 0.9 / 6);
      if (k === 3) continue; // a gap behind the dish
      const lx = Math.sin(a) * 15;
      const lz = Math.cos(a) * 15;
      const b = put(lx, lz, a); // its length along the ring, its face (-z) to the apron
      const wd = 2.4 + rnd() * 0.8;
      piece(b, G.box(wd, 1.1, 0.6), k % 2 ? C.stoneDark : C.steel, { pos: [0, 0.55, 0], rot: [0, 0, (rnd() - 0.5) * 0.12], outline: 0.025 });
      if (k % 2) piece(b, G.box(wd * 0.6, 0.6, 0.08), WARDEN, { pos: [0, 0.7, -0.34], outline: 0.008 });
      for (const t of [-1, 0, 1]) col(lx + Math.cos(a) * t * (wd / 2 - 0.4), lz - Math.sin(a) * t * (wd / 2 - 0.4), 0.45, 1.1);
    }
    objectProps(w, p, g, g.position);
    flatten(g);
    w.finish(g);
  },

  // Ironjaw's dig at the Sunken Vault: a pit cut down to the door, scaffolds round its rim, a crane,
  // spoil heaps and scav junk, work lights.
  vault(w, p) {
    const g = siteGroup(w, p);
    const rnd = w.rnd;
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * TAU;
      if (Math.abs(Math.atan2(Math.sin(a - p.rot), Math.cos(a - p.rot))) < 0.5) continue; // the way down
      const [sx, sz] = out(p.x, p.z, a, 11.5);
      const [x, y, z] = local(g, sx, sz, w);
      piece(g, G.box(0.16, 3, 0.16), C.wood, { pos: [x, y + 1.5, z], outline: 0.01 });
      if (k % 2 === 0) piece(g, G.box(3.2, 0.12, 0.5), C.wood, { pos: [x, y + 3, z], rot: [0, -a, 0], outline: 0.008 });
      w.addCollider(sx, sz, 0.2, 3);
    }
    for (let k = 0; k < 5; k++) {
      const a = p.rot + 1.2 + k * 0.85;
      const [hx, hz] = out(p.x, p.z, a, 14 + rnd() * 2);
      const [x, y, z] = local(g, hx, hz, w);
      const s = 1.2 + rnd() * 0.8;
      piece(g, G.dodeca(s), k % 2 ? C.dirtDark : C.dirt, { pos: [x, y + s * 0.35, z], rot: [rnd(), rnd() * 3, 0], scale: [1.4, 0.6, 1.2], outline: 0.02 });
    }
    const [cx, cz] = out(p.x, p.z, p.rot + Math.PI * 0.6, 10);
    const [x, y, z] = local(g, cx, cz, w);
    piece(g, G.box(0.5, 9, 0.5), 0xd9a227, { pos: [x, y + 4.5, z], outline: 0.025 });
    piece(g, G.box(0.35, 0.35, 7), 0xd9a227, { pos: [x + Math.sin(p.rot + Math.PI) * 3, y + 8.8, z + Math.cos(p.rot + Math.PI) * 3], rot: [0, p.rot, 0], outline: 0.02 });
    w.addCollider(cx, cz, 0.5, 9);
    for (let k = 0; k < 6; k++) {
      const [jx, jz] = out(p.x, p.z, p.rot - 1.3 - k * 0.3, 13 + (k % 2));
      const [x2, y2, z2] = local(g, jx, jz, w);
      piece(g, G.box(1.4, 0.1, 0.9), k % 2 ? C.rust : C.metalDark, { pos: [x2, y2 + 0.25, z2], rot: [rnd() * 0.5, rnd() * 3, rnd() * 0.5], outline: 0.012 });
    }
    for (const k of [-1, 1]) {
      const [lx, lz] = out(p.x, p.z, p.rot + k * 0.8, 9);
      const [x3, y3, z3] = local(g, lx, lz, w);
      piece(g, G.cyl(0.07, 0.09, 3.6, 6), C.metalDark, { pos: [x3, y3 + 1.8, z3], outline: 0.01 });
      piece(g, G.box(0.5, 0.3, 0.3), LAMP, { pos: [x3, y3 + 3.6, z3], glow: true, outline: 0.01 });
    }
    objectProps(w, p, g, g.position);
    flatten(g);
    w.finish(g);
  },

  // Brannock's Yard (Act III), Isa's salvage yard outside Ironreach's walls: a ring of fence panels
  // open toward the city, a gutted Synth hull on its side, a gantry crane over the bench, and slag
  // still glowing. Its open middle is the ground c7 holds while the core wakes.
  yard(w, p) {
    const g = siteGroup(w, p);
    const R = p.r - 1;
    // Fence panels round the yard, a gap toward the city (p.rot faces it).
    for (let k = 0; k < 16; k++) {
      const a = p.rot + Math.PI / 16 + (k * Math.PI) / 8;
      if (Math.abs(Math.atan2(Math.sin(a - p.rot), Math.cos(a - p.rot))) < 0.4) continue;
      const [x, z] = out(p.x, p.z, a, R);
      const [x3, y3, z3] = local(g, x, z, w);
      piece(g, G.box(0.12, 2.2, 0.12), C.metalDark, { pos: [x3, y3 + 1.1, z3], outline: 0.008 });
      piece(g, G.box(2 * R * Math.sin(Math.PI / 16) + 0.1, 1.6, 0.05), C.metal, { pos: [x3, y3 + 1.0, z3], rot: [0, a, 0], outline: 0.006 });
      // A panel blocks along its length: a row of small colliders on the ring.
      for (const t of [-0.08, -0.04, 0, 0.04, 0.08]) {
        const [cx, cz] = out(p.x, p.z, a + t, R);
        w.addCollider(cx, cz, 0.45, 2.2);
      }
    }
    // A gutted Synth hull, on its side at the back, its seams long dark.
    {
      const [hx, hz] = out(p.x, p.z, p.rot + Math.PI + 0.5, R - 4);
      const [x3, y3, z3] = local(g, hx, hz, w);
      piece(g, G.box(3.2, 1.8, 4.6), 0xd8dde4, { pos: [x3, y3 + 1.0, z3], rot: [0, p.rot + 0.6, 1.3], outline: 0.03 });
      piece(g, G.box(2.8, 1.4, 4.2), 0x2a2e36, { pos: [x3 + 0.3, y3 + 1.1, z3], rot: [0, p.rot + 0.6, 1.3], outline: 0.02 });
      for (let i = 0; i < 4; i++) piece(g, G.box(0.06, 0.6, 0.12), 0x2a4450, { pos: [x3 - 0.9, y3 + 0.4 + i * 0.5, z3 + (i - 1.5) * 0.4], rot: [0, p.rot + 0.6, 1.3], outline: 0 });
      w.addCollider(hx, hz, 2.4, 2.2);
    }
    // A gantry crane over the bench, chain and hook hanging.
    {
      const [cx, cz] = out(p.x, p.z, p.rot + Math.PI, 2.5);
      const [x3, y3, z3] = local(g, cx, cz, w);
      const crane = new THREE.Group();
      crane.position.set(x3, y3, z3);
      crane.rotation.y = p.rot;
      g.add(crane);
      for (const s of [-1, 1]) {
        piece(crane, G.box(0.3, 5.2, 0.3), C.rust, { pos: [s * 3, 2.6, 0], outline: 0.012 });
        w.addCollider(cx + Math.cos(p.rot) * s * 3, cz - Math.sin(p.rot) * s * 3, 0.35, 5.2);
      }
      piece(crane, G.box(6.6, 0.4, 0.4), C.rust, { pos: [0, 5.2, 0], outline: 0.012 });
      piece(crane, G.box(0.05, 2.4, 0.05), C.metalDark, { pos: [0.6, 3.8, 0], outline: 0 });
      piece(crane, G.box(0.4, 0.2, 0.3), C.metalDark, { pos: [0.6, 2.55, 0], outline: 0.006 });
    }
    // Slag heaps still glowing.
    for (const [a, d] of [[1.9, R - 3], [-2.1, R - 3.5]]) {
      const [sx, sz] = out(p.x, p.z, p.rot + a, d);
      const [x3, y3, z3] = local(g, sx, sz, w);
      for (let k = 0; k < 4; k++) piece(g, G.dodeca(0.5 + (k % 2) * 0.2), 0x2a2420, { pos: [x3 + Math.sin(k * 1.7) * 0.6, y3 + 0.3, z3 + Math.cos(k * 1.7) * 0.6], outline: 0.01 });
      piece(g, G.sphere(0.25, 8, 6), FORGE, { pos: [x3, y3 + 0.5, z3], glow: true, outline: 0 });
      w.addCollider(sx, sz, 1.1, 1);
    }
    objectProps(w, p, g, g.position);
    flatten(g);
    w.finish(g);
  },
};

// The Rustjaw Foundry's yard, round its fort (world/World.js buildFort): smokestacks glowing at
// the lip, and slag heaps still hot.
export function foundryYard(w, p) {
  const g = siteGroup(w, p);
  const rnd = w.rnd;
  for (const [lx, lz, h] of [[-9, -24, 16], [0, -26, 19], [9, -24, 14]]) {
    const [x, y, z] = local(g, p.x + lx, p.z + lz, w);
    piece(g, G.cyl(1.2, 1.6, h, 12), C.rust, { pos: [x, y + h / 2, z], outline: 0.04 });
    piece(g, G.torus(1.25, 0.12, TAU, 4, 18), FORGE, { pos: [x, y + h - 0.3, z], rot: [Math.PI / 2, 0, 0], glow: true, outline: 0 });
    for (const yy of [h * 0.3, h * 0.6]) piece(g, G.torus(1.45, 0.1, TAU, 4, 18), C.metalDark, { pos: [x, y + yy, z], rot: [Math.PI / 2, 0, 0], outline: 0.01 });
    w.addCollider(p.x + lx, p.z + lz, 1.6, h);
  }
  for (let k = 0; k < 5; k++) {
    const a = rnd() * TAU;
    const d = 20 + rnd() * 5;
    const [hx, hz] = [p.x + Math.sin(a) * d, p.z + Math.cos(a) * d];
    if (hz > p.z + 14 && Math.abs(hx - p.x) < 8) continue; // the gate's road
    const [x, y, z] = local(g, hx, hz, w);
    const s = 1.4 + rnd();
    piece(g, G.dodeca(s), 0x2a2420, { pos: [x, y + s * 0.3, z], rot: [rnd(), rnd() * 3, 0], scale: [1.3, 0.55, 1.1], outline: 0.02 });
    piece(g, G.dodeca(s * 0.4), FORGE, { pos: [x, y + s * 0.62, z], rot: [rnd(), rnd() * 3, 0], scale: [1.2, 0.4, 1], glow: true, outline: 0 });
    w.addCollider(hx, hz, s * 1.1, s * 0.6);
  }
  const [bx, by, bz] = local(g, p.x - 4, p.z + 17, w);
  piece(g, G.box(3.4, 1.2, 0.1), 0xb8342a, { pos: [bx, by + 5.2, bz], outline: 0.02 });
  piece(g, G.box(2.6, 0.4, 0.05), FORGE, { pos: [bx, by + 5.2, bz + 0.07], glow: true, outline: 0 });
  flatten(g);
  w.finish(g);
}

// Objects on any other place with folk (a landmark's, a camp's): into a group of their own.
export function placeObjects(w, p) {
  if (!(p.npcs ?? []).some((n) => n.role === 'object')) return;
  const g = siteGroup(w, p);
  objectProps(w, p, g, g.position);
  flatten(g);
  w.finish(g);
}
