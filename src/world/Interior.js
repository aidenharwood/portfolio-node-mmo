// A dungeon built in its pocket (gameplay phase 5): the layout from world/DungeonGen.js placed at
// an origin far outside the playable land. It answers what the world is asked about the ground
// there — the floor under a point (a room's, a flight of stairs', the lift's platform), the
// ceiling over it — and puts up its walls, lintels, doors and lift gates as box colliders, so
// movement, physics, shots, the camera and enemies all just work. Doors that are shut are colliders
// too, and cells the grid's pathfinding (sim/Nav.js) can't pass. The same on the server (no
// meshes) and every screen (world/InteriorKit.js draws it).
import { NavGrid } from '../sim/Nav.js';

const T = 0.6;          // wall thickness
const DOOR_H = 4.4;     // a doorway's height (corridors are 4.5 m high)
const VOID = 40;        // how far below its floors the ground is, outside a dungeon's rooms

export class Interior {
  // `run`: the copy this is (sim/Dungeons.js) — its id, dungeon, tier.
  constructor(layout, origin, run = {}) {
    this.layout = layout;
    this.origin = { ...origin };
    this.run = run;
    this.id = run.id ?? layout.id;
    const span = layout.W * layout.cell;
    this.x0 = origin.x;
    this.z0 = origin.z;
    this.x1 = origin.x + span;
    this.z1 = origin.z + span;
    this.nR = layout.rooms.length;
    this.shut = new Map();     // door id → its collider while it's shut
    this.doorOpen = new Map(); // door id → open?
    this.colliders = [];       // walls and lintels (boxes)
    this.pillars = [];         // the arenas' pillars (round)
    this.camps = [];           // its rooms' encounters (sim/Dungeons.js), for the world sim
    const c = layout.lift >= 0 ? layout.cors[layout.lift] : null;
    // The lift (world/DungeonView.js runs it on screen): where its platform is, between floors.
    this.lift = c ? { cor: c, y: c.shaft.bottom, gates: { top: null, bottom: null } } : null;
    this.nav = new NavGrid(this);
  }

  contains(x, z) { return x >= this.x0 && x < this.x1 && z >= this.z0 && z < this.z1; }

  // The area (room or corridor) at a local point, as an index into rooms then corridors (-1: rock).
  areaIndex(lx, lz) {
    const L = this.layout;
    const i = Math.floor(lx / L.cell);
    const j = Math.floor(lz / L.cell);
    if (i < 0 || j < 0 || i >= L.W || j >= L.W) return -1;
    return L.cells[j * L.W + i] - 1;
  }
  areaAt(x, z) {
    const k = this.areaIndex(x - this.x0, z - this.z0);
    if (k < 0) return null;
    return k < this.nR ? this.layout.rooms[k] : this.layout.cors[k - this.nR];
  }
  roomAt(x, z) {
    const k = this.areaIndex(x - this.x0, z - this.z0);
    return k >= 0 && k < this.nR ? this.layout.rooms[k] : null;
  }

  inShaft(lx, lz) {
    const c = this.lift?.cor;
    if (!c) return false;
    if (this.areaIndex(lx, lz) !== this.nR + this.layout.cors.indexOf(c)) return false;
    const u = c.axis === 'x' ? lx : lz;
    return u >= c.shaft.u0 && u <= c.shaft.u1;
  }

  // The floor at a local point, relative to the base: a room's, stairs' (along the corridor), a
  // lift corridor's top or bottom, or the platform in its shaft.
  localFloor(lx, lz) {
    const k = this.areaIndex(lx, lz);
    if (k < 0) return -VOID;
    if (k < this.nR) return this.layout.rooms[k].floor;
    const c = this.layout.cors[k - this.nR];
    const u = c.axis === 'x' ? lx : lz;
    if (c.shaft) {
      if (u >= c.shaft.u0 && u <= c.shaft.u1) return this.lift.y;
      const before = c.dir > 0 ? u < c.shaft.u0 : u > c.shaft.u1;
      return before ? c.fa : c.fb;
    }
    const t = Math.min(1, Math.max(0, (u - c.u0) / (c.u1 - c.u0)));
    return c.fa + (c.fb - c.fa) * t;
  }
  floorAt(x, z) { return this.origin.y + this.localFloor(x - this.x0, z - this.z0); }

  ceilingAt(x, z) {
    const k = this.areaIndex(x - this.x0, z - this.z0);
    if (k < 0) return Infinity;
    if (k < this.nR) { const r = this.layout.rooms[k]; return this.origin.y + r.floor + r.ceil; }
    return this.origin.y + this.layout.cors[k - this.nR].ceilY;
  }

  // Can something stand at (x, z)? Somewhere in the rooms, not down the lift shaft.
  standable(x, z) {
    const lx = x - this.x0;
    const lz = z - this.z0;
    return this.areaIndex(lx, lz) >= 0 && !this.inShaft(lx, lz);
  }

  // World coordinates of a local point.
  at(lx, lz, floor = 0) { return { x: this.x0 + lx, y: this.origin.y + floor, z: this.z0 + lz }; }

  // ---------------------------------------------------------------- walls and doors
  // Puts the walls up in `world` (box colliders), and the doors that are shut.
  attach(world) {
    this.world = world;
    const L = this.layout;
    const y0 = this.origin.y;
    const box = (cx, cz, hx, hz, bottom, top) => {
      const c = world.addBox(this.x0 + cx, this.z0 + cz, hx, hz, top - bottom, y0 + bottom);
      this.colliders.push(c);
      return c;
    };
    // Each area's sides, less the openings in them: the room's own (where corridors come in), and
    // a corridor's two ends.
    const sideRuns = (a0, a1, cuts) => {
      const runs = [];
      let s = a0;
      for (const [c0, c1] of cuts.sort((p, q) => p[0] - q[0])) {
        if (c0 > s) runs.push([s, c0]);
        s = Math.max(s, c1);
      }
      if (s < a1) runs.push([s, a1]);
      return runs;
    };
    const walls = (r, bottom, top, isRoom) => {
      const cell = L.cell;
      const X0 = r.x * cell;
      const X1 = (r.x + r.w) * cell;
      const Z0 = r.z * cell;
      const Z1 = (r.z + r.h) * cell;
      // [line, along x?, from, to]
      const sides = isRoom
        ? [[X0, false, Z0, Z1], [X1, false, Z0, Z1], [Z0, true, X0, X1], [Z1, true, X0, X1]]
        : r.axis === 'x' ? [[Z0, true, X0, X1], [Z1, true, X0, X1]] : [[X0, false, Z0, Z1], [X1, false, Z0, Z1]];
      for (const [line, alongX, a0, a1] of sides) {
        const cuts = isRoom
          ? L.openings.filter((o) => o.room === r.i && o.line === line && (o.axis === 'x') === !alongX).map((o) => [o.s0, o.s1])
          : [];
        for (const [s0, s1] of sideRuns(a0, a1, cuts)) {
          const ext0 = s0 === a0 ? T / 2 : 0;
          const ext1 = s1 === a1 ? T / 2 : 0;
          const mid = (s0 - ext0 + s1 + ext1) / 2;
          const half = (s1 + ext1 - s0 + ext0) / 2;
          if (alongX) box(mid, line, half, T / 2, bottom, top);
          else box(line, mid, T / 2, half, bottom, top);
        }
      }
    };
    for (const r of L.rooms) walls(r, r.floor - 1, r.floor + r.ceil, true);
    for (const c of L.cors) walls(c, Math.min(c.fa, c.fb) - 1, c.ceilY, false);
    // Over each opening, the room's wall from the corridor's ceiling up to its own.
    for (const o of L.openings) {
      const r = L.rooms[o.room];
      const c = L.cors[o.cor];
      const top = r.floor + r.ceil;
      if (c.ceilY >= top - 0.05) continue;
      const mid = (o.s0 + o.s1) / 2;
      const half = (o.s1 - o.s0) / 2;
      if (o.axis === 'x') box(o.line, mid, T / 2, half, c.ceilY, top);
      else box(mid, o.line, half, T / 2, c.ceilY, top);
    }
    for (const p of L.pillars ?? []) {
      const r = L.rooms[p.room];
      this.pillars.push(world.addCollider(this.x0 + p.x, this.z0 + p.z, p.r, r.ceil, y0 + r.floor));
    }
    for (const d of L.doors) if (d.kind !== 'open') this.setDoor(d.id, this.doorOpen.get(d.id) ?? false);
    if (this.lift) this.setLift(this.lift.y);
  }

  detach() {
    for (const c of [...this.colliders, ...this.pillars]) this.world?.removeCollider(c);
    for (const c of this.shut.values()) this.world?.removeCollider(c);
    for (const g of Object.values(this.lift?.gates ?? {})) if (g) this.world?.removeCollider(g);
    this.colliders = [];
    this.pillars = [];
    this.shut.clear();
  }

  // The grid cells on the corridor's side of a door (blocked while it's shut).
  doorCells(d) {
    const L = this.layout;
    const c = L.cors[d.cor];
    const out = [];
    for (let z = c.z; z < c.z + c.h; z++) {
      for (let x = c.x; x < c.x + c.w; x++) {
        const cx = (x + 0.5) * L.cell;
        const cz = (z + 0.5) * L.cell;
        if (Math.abs((d.axis === 'x' ? cx : cz) - d.line) < L.cell) out.push(z * L.W + x);
      }
    }
    return out;
  }

  // A door shut (a collider across it, its cells closed to the pathfinding) or open.
  setDoor(id, open) {
    const d = this.layout.doors.find((x) => x.id === id);
    if (!d || d.kind === 'open') return;
    this.doorOpen.set(id, open);
    const had = this.shut.get(id);
    if (open && had) {
      this.world?.removeCollider(had);
      this.shut.delete(id);
    } else if (!open && !had && this.world) {
      const mid = (d.s0 + d.s1) / 2;
      const half = (d.s1 - d.s0) / 2;
      const x = d.axis === 'x' ? d.line : mid;
      const z = d.axis === 'x' ? mid : d.line;
      const c = this.world.addBox(this.x0 + x, this.z0 + z, d.axis === 'x' ? 0.25 : half, d.axis === 'x' ? half : 0.25, DOOR_H + 0.6, this.origin.y + d.floor - 0.5);
      this.shut.set(id, c);
    }
    this.nav.setBlocked(this.doorCells(d), !open);
  }
  isOpen(id) {
    const d = this.layout.doors.find((x) => x.id === id);
    return !d || d.kind === 'open' || !!this.doorOpen.get(id);
  }

  // The lift's platform at `y` (local): the gate at the top stands open only while the platform is
  // up there, the bottom one only while it's down.
  setLift(y) {
    const lift = this.lift;
    if (!lift) return;
    lift.y = y;
    const c = lift.cor;
    const s = c.shaft;
    const w = this.world;
    if (!w) return;
    const across = (c.axis === 'x' ? c.z : c.x) * this.layout.cell + this.layout.cell;
    const gate = (key, u, floor, shut) => {
      const g = lift.gates[key];
      if (shut && !g) {
        const x = c.axis === 'x' ? u : across;
        const z = c.axis === 'x' ? across : u;
        lift.gates[key] = w.addBox(this.x0 + x, this.z0 + z, c.axis === 'x' ? 0.2 : this.layout.cell, c.axis === 'x' ? this.layout.cell : 0.2, 7, this.origin.y + floor - 0.5);
      } else if (!shut && g) {
        w.removeCollider(g);
        lift.gates[key] = null;
      }
    };
    // Which end of the shaft meets the top corridor depends on the way the corridor runs.
    const topU = c.dir > 0 ? s.u0 : s.u1;
    const botU = c.dir > 0 ? s.u1 : s.u0;
    gate('top', topU, s.top, Math.abs(y - s.top) > 0.15);
    gate('bottom', botU, s.bottom, Math.abs(y - s.bottom) > 0.15);
  }
}
