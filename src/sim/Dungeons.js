// The dungeons' copies (gameplay phase 5) and who's in them: the instance manager. The server runs
// one per layer of the realm; offline single-player runs the same code locally, for its one player.
//   - An open-world dungeon has one shared copy (built when someone first goes in): its rooms'
//     residents come back like a camp's, and anyone may walk in.
//   - A private run is a copy for one party (or one player) at a chosen tier: nobody comes back once
//     beaten, and past the final boss stands a reward chest — once a day per dungeon per tier for
//     each character (rpg/CharacterCore.js 'dchest').
//   - Each copy is built in a pocket slot of its own (world/dungeons.js), so copies never meet.
//     An empty copy closes after ten minutes (an open-world one starts over when next entered).
// What's happened in a copy — the key found, power nodes switched on, doors opened, the mini-boss
// and the boss down — is shared by everyone in it, and sent to them (`dun` messages) whenever it
// changes. Things are used through `use`; chests through the character's own operations, which
// ask `claim`.
//
// host: {
//   world, sim                    the world (dungeons are built in it) and its world sim
//   send(playerId, msg)           to one player
//   positionOf(playerId)          where they are now (null when they've gone)
//   cleared?(run)                 the boss is down: the host credits whoever's there
// }
import { DUNGEONS, THEMES, pocketOrigin, SHARED_SLOTS, CLOSE_AFTER, lockDay, lockKey } from '../world/dungeons.js';
import { generateDungeon } from '../world/DungeonGen.js';
import { Interior } from '../world/Interior.js';
import { TIERS } from '../rpg/balance.js';
import { THEMES as LOOT } from '../items/sets.js';

const NEAR = 9;        // metres from a way in (a dungeon's entrance, a gate) to go in
const USE = 4.5;       // metres from something to use it
const GRACE = 12;      // seconds someone may take to arrive before they're counted gone
const RESPAWN = 180;   // seconds before an open-world room fills again
const LOOT_OF = { scav: LOOT.scav, hive: LOOT.hive, synth: LOOT.synth, maker: LOOT.relic, fauna: LOOT.fauna };

export class Dungeons {
  constructor(host) {
    this.host = host;
    this.runs = new Map();    // run id → run
    this.byKey = new Map();   // party key → its private run's id
    this.shared = new Map();  // dungeon id → its open-world copy's id
    this.where = new Map();   // player id → { run, back, at (when they went in) }
    this.nextRun = 1;
    this.free = [];
    this.nextSlot = SHARED_SLOTS;
    this.time = 0;
    this.error = null;
  }

  get world() { return this.host.world; }

  // ---------------------------------------------------------------- copies
  create(def, { tier = null, level = def.level, key = null } = {}) {
    const shared = key === null;
    const id = shared ? `ow-${def.id}` : `r${this.nextRun++}`;
    const slot = shared ? Object.keys(DUNGEONS).indexOf(def.id) : this.free.pop() ?? this.nextSlot++;
    const origin = pocketOrigin(slot);
    const shuffle = shared ? def.seed : (Math.random() * 0xffffffff) >>> 0;
    const layout = generateDungeon(def, { shuffle, level });
    const run = {
      id, def, tier, level, shuffle, slot, origin, layout, shared, key,
      players: new Set(), emptyFor: 0,
      state: { open: new Set(), key: false, nodes: new Set(), mini: false, boss: false, cleared: new Set(), looted: new Map() },
    };
    run.interior = new Interior(layout, origin, { id, dungeon: def.id, tier });
    run.interior.camps = this.campsOf(run);
    this.world.addInterior(run.interior);
    this.runs.set(id, run);
    if (shared) this.shared.set(def.id, id);
    else this.byKey.set(key, id);
    return run;
  }

  // Each room's residents as a camp for the world sim (sim/WorldSim.js Encounters).
  campsOf(run) {
    const L = run.layout;
    const o = run.origin;
    const race = THEMES[run.def.theme].race;
    return L.spawns.map((s) => {
      const r = L.rooms[s.room];
      const cx = (r.x + r.w / 2) * L.cell;
      const cz = (r.z + r.h / 2) * L.cell;
      return {
        id: `dr:${run.id}:${s.room}`, type: 'camp', room: true, run: run.id, index: s.room, name: run.def.name,
        x: o.x + cx, z: o.z + cz, radius: Math.hypot(r.w, r.h) * L.cell * 0.5, race, level: run.level,
        respawn: run.shared ? RESPAWN : Infinity,
        boss: s.room === L.boss ? run.def.boss : null,
        units: s.units.map((u) => ({ type: u.type, opts: u.opts, x: o.x + u.x, z: o.z + u.z })),
      };
    });
  }

  close(run) {
    for (const id of run.players) this.where.delete(id);
    this.world.removeInterior(run.id);
    this.host.sim?.encounters.dropCamps(`dr:${run.id}:`);
    this.runs.delete(run.id);
    if (run.shared) this.shared.delete(run.def.id);
    else {
      if (this.byKey.get(run.key) === run.id) this.byKey.delete(run.key);
      this.free.push(run.slot);
    }
  }

  // What a screen needs to build its copy (world/DungeonGen.js gives the same layout from it).
  info(run) {
    return { id: run.id, d: run.def.id, tier: run.tier, lv: run.level, sh: run.shuffle, o: [run.origin.x, run.origin.y, run.origin.z], shared: run.shared };
  }

  stateOf(run) {
    const s = run.state;
    return { open: [...s.open], key: s.key, nodes: [...s.nodes], mini: s.mini, boss: s.boss, cleared: [...s.cleared] };
  }

  tell(run, extra = null) {
    const msg = { t: 'dun', id: run.id, st: this.stateOf(run), ...(extra ?? {}) };
    for (const p of run.players) this.host.send(p, msg);
  }

  runOf(playerId) { return this.runs.get(this.where.get(playerId)?.run) ?? null; }

  // ---------------------------------------------------------------- going in and out
  // Where a dungeon's way in stands in the world (its story place's object).
  entranceOf(def) {
    const ref = def.entrance;
    if (!ref) return null;
    const [head, tail] = ref.split(':');
    for (const p of this.world.storyPlace?.(head) ? [this.world.storyPlace(head)] : []) {
      const n = p.npcs?.find((m) => m.object === ref || m.object === tail);
      if (n) return { x: n.x, z: n.z };
    }
    return null;
  }

  // Can someone at `pos` go in this way? At the dungeon's own entrance, or at a town's or city's
  // dungeon gate.
  atWayIn(def, pos, via) {
    if (via === 'gate') return this.world.folkNear(pos.x, pos.z, NEAR, 'gate').some((n) => n.gate === 'dungeon');
    const e = this.entranceOf(def);
    return !!e && Math.hypot(e.x - pos.x, e.z - pos.z) <= NEAR;
  }

  fail(why) { this.error = why; return null; }

  // Going in: `who` { id, position, party (a key), level, flags (story flags), dev } and the ask
  // { d (dungeon), mode ('open' | 'run'), tier, via ('entrance' | 'gate') }. Returns the roll for
  // the character's 'enter' operation, { run, at, facing, back } — or null (this.error says why).
  enter(who, ask) {
    this.error = null;
    const def = DUNGEONS[ask?.d];
    if (!def || (def.dev && !who.dev)) return this.fail('No such place.');
    const p = who.position;
    if (!who.dev && !this.atWayIn(def, p, ask.via)) return this.fail('Too far from the way in.');
    if (def.needs?.flag && !who.flags?.[def.needs.flag] && !who.dev) return this.fail(`${def.name} is sealed.`);
    let run;
    if (ask.mode === 'open') {
      if (!def.open) return this.fail(`${def.name} can only be run as a private copy.`);
      run = this.runs.get(this.shared.get(def.id)) ?? this.create(def);
    } else {
      const tier = Number.isInteger(ask.tier) && ask.tier >= 0 && ask.tier < TIERS.length ? ask.tier : 0;
      const cur = this.runs.get(this.byKey.get(who.party));
      if (cur && cur.def === def && cur.tier === tier) run = cur;
      else {
        if (cur && [...cur.players].some((id) => id !== who.id)) return this.fail(`Your party is in ${cur.def.name} (${TIERS[cur.tier].name}) — join them there, or wait for them to come out.`);
        if (cur) this.close(cur);
        run = this.create(def, { tier, level: Math.max(def.level, who.level ?? 1), key: who.party });
      }
    }
    // (Anyone already in a copy leaves it first, where they came in.)
    const was = this.where.get(who.id);
    const back = was ? was.back : [p.x, p.y, p.z];
    if (was) this.out(who.id);
    this.where.set(who.id, { run: run.id, back, at: this.time });
    run.players.add(who.id);
    run.emptyFor = 0;
    const s = run.layout.start;
    this.tell(run);
    return { run: this.info(run), at: [run.origin.x + s.x, run.origin.y + s.floor, run.origin.z + s.z], facing: s.facing, back };
  }

  // Leaving by the way out (the portal by the entrance, or past the boss): back where they came
  // in. Returns the roll for the character's 'leave' operation, { at }, or null.
  leave(who) {
    const w = this.where.get(who.id);
    const run = this.runOf(who.id);
    if (!w || !run) return null;
    const p = who.position;
    const L = run.layout;
    const near = L.things.some((t) => (t.kind === 'portal' || (t.kind === 'exit' && run.state.boss))
      && Math.hypot(run.origin.x + t.x - p.x, run.origin.z + t.z - p.z) <= USE);
    if (!near && !who.dev) return null;
    this.out(who.id);
    return { at: w.back };
  }

  // No longer in their copy (gone out, gone elsewhere, gone from the realm).
  out(id) {
    const w = this.where.get(id);
    if (!w) return;
    this.where.delete(id);
    this.runs.get(w.run)?.players.delete(id);
  }

  // Where someone in a copy comes back to after a fall: its entrance hall.
  startOf(playerId) {
    const run = this.runOf(playerId);
    if (!run) return null;
    const s = run.layout.start;
    return { x: run.origin.x + s.x, y: run.origin.y + s.floor, z: run.origin.z + s.z, facing: s.facing, name: run.def.name };
  }

  // ---------------------------------------------------------------- inside
  thingAt(run, id) { return run.layout.things.find((t) => t.id === id) ?? null; }
  doorAt(run, id) { return run.layout.doors.find((d) => d.id === id) ?? null; }

  // Something used: the key picked up, a power node switched on, the locked door unlocked.
  // Returns a line for the screen, or null when nothing came of it.
  use(playerId, id, pos, name = 'Someone') {
    const run = this.runOf(playerId);
    if (!run) return null;
    const o = run.origin;
    const s = run.state;
    const t = this.thingAt(run, id);
    if (t) {
      if (Math.hypot(o.x + t.x - pos.x, o.z + t.z - pos.z) > USE) return null;
      if (t.kind === 'key' && !s.key) {
        s.key = true;
        this.tell(run, { say: `${name} found the ${THEMES[run.def.theme].key}.` });
        return 'key';
      }
      if (t.kind === 'node' && !s.nodes.has(t.id)) {
        s.nodes.add(t.id);
        const door = run.layout.doors.find((d) => d.kind === 'power');
        const n = s.nodes.size;
        const of = door?.needs ?? n;
        if (door && n >= of) this.openDoor(run, door.id);
        this.tell(run, { say: n >= of ? 'Power restored — the sealed door grinds open.' : `Power ${n} / ${of}.` });
        return 'node';
      }
      return null;
    }
    const d = this.doorAt(run, id);
    if (!d || s.open.has(d.id)) return null;
    const lx = d.axis === 'x' ? d.line : (d.s0 + d.s1) / 2;
    const lz = d.axis === 'x' ? (d.s0 + d.s1) / 2 : d.line;
    if (Math.hypot(o.x + lx - pos.x, o.z + lz - pos.z) > USE + 1.5) return null;
    if (d.kind === 'locked' && s.key) {
      this.openDoor(run, d.id);
      this.tell(run, { say: `${name} unlocked the door.` });
      return 'door';
    }
    return null;
  }

  openDoor(run, id) {
    run.state.open.add(id);
    run.interior.setDoor(id, true);
  }

  // A room's residents all down (the world sim): the arena's seal opens once the mini-boss falls;
  // the boss down is the dungeon beaten.
  onRoomCleared(camp) {
    const run = this.runs.get(camp.def.run);
    if (!run) return;
    const s = run.state;
    s.cleared.add(camp.def.index);
    const L = run.layout;
    let say = null;
    if (camp.def.index === L.mini && !s.mini) {
      s.mini = true;
      for (const d of L.doors) if (d.kind === 'seal') this.openDoor(run, d.id);
      say = `${run.def.mini.name} is down — the arena's seal opens.`;
    }
    if (camp.def.index === L.boss && !s.boss) {
      s.boss = true;
      say = run.shared ? `${run.def.boss.name} has fallen. The way out stands open.` : `${run.def.boss.name} has fallen. The reward chest is yours to open.`;
      this.host.cleared?.(run);
    }
    this.tell(run, say ? { say } : null);
  }

  // An open-world room filled again.
  onRoomRestored(camp) {
    const run = this.runs.get(camp.def.run);
    if (!run) return;
    run.state.cleared.delete(camp.def.index);
    if (camp.def.index === run.layout.boss) run.state.boss = false;
    this.tell(run);
  }

  // A chest someone's opening (rpg/CharacterCore.js 'dloot' / 'dchest'): is it there, are they by
  // it, is it theirs to open? Marks it opened for them. Returns what the loot is rolled from, or
  // null. `charKey`: the character's own id (chests are each character's).
  claim(playerId, charKey, id, pos, kind) {
    const run = this.runOf(playerId);
    if (!run) return null;
    const t = this.thingAt(run, id);
    if (!t || (kind === 'reward' ? t.kind !== 'reward' : t.kind !== 'chest')) return null;
    const x = run.origin.x + t.x;
    const z = run.origin.z + t.z;
    if (Math.hypot(x - pos.x, z - pos.z) > USE) return null;
    if (kind === 'reward' && (run.shared || !run.state.boss)) return null;
    const mine = run.state.looted.get(charKey) ?? new Set();
    if (mine.has(id)) return null;
    mine.add(id);
    run.state.looted.set(charKey, mine);
    return {
      dungeon: run.def.id, tier: run.tier ?? 0, level: run.level, at: [x, run.origin.y + t.floor + 0.8, z],
      theme: LOOT_OF[run.def.theme] ?? null,
    };
  }

  // ---------------------------------------------------------------- every tick
  tick(dt) {
    this.time += dt;
    for (const run of [...this.runs.values()]) {
      // Anyone gone some other way (fast travel, a fall back to town, gone from the realm).
      for (const id of [...run.players]) {
        const w = this.where.get(id);
        if (w && this.time - w.at < GRACE) continue;
        const p = this.host.positionOf(id);
        if (!p || !run.interior.contains(p.x, p.z)) this.out(id);
      }
      if (run.players.size) run.emptyFor = 0;
      else if ((run.emptyFor += dt) > CLOSE_AFTER) this.close(run);
    }
  }

  get stats() {
    return { runs: this.runs.size, shared: this.shared.size, inside: this.where.size };
  }
}

// Through the gates and at the way in: the dungeons someone may go into, and how.
export function dungeonChoices(flags = {}, { dev = false } = {}) {
  return Object.values(DUNGEONS).filter((d) => (!d.dev || dev)).map((d) => ({
    def: d, locked: !!d.needs?.flag && !flags[d.needs.flag],
  }));
}

export { lockDay, lockKey };
