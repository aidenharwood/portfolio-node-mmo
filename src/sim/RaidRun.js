// A raid's copy at work (gameplay phase 7): its arenas' encounters, for the instance manager
// (sim/Dungeons.js) that holds the copy. Each encounter is idle until one of its bosses is pulled;
// then the arena's gate shuts behind whoever's in it, each boss's script (sim/BossScript.js) runs
// its fight for that many players, and it ends one of two ways:
//   - everyone in the arena down (or gone from it): a wipe — the bosses go home and reset, the
//     gate opens, and the raid can try again;
//   - its bosses all down: the encounter falls — the gate and the seal onward open, its reward
//     chest is there to open (once a week per tier, each character's own), and the host credits
//     whoever was there (`host.cleared(run, enc)`). The last encounter down is the raid beaten.
// Where someone who falls comes back: the arena of the last encounter beaten, else the entrance.
import { BossScript } from './BossScript.js';

const WIPE_AFTER = 3;    // seconds with nobody standing in the arena before it's a wipe

export class RaidRun {
  constructor(dungeons, run) {
    this.dungeons = dungeons;
    this.run = run;
    const L = run.layout;
    const o = run.origin;
    this.encounters = (L.arenas ?? []).map((A) => {
      const r = L.rooms[A.room];
      const x0 = o.x + r.x * L.cell;
      const z0 = o.z + r.z * L.cell;
      const enc = {
        i: A.enc, room: A.room, def: run.def.encounters[A.enc], state: 'idle', scripts: new Map(), empty: 0, at: 0,
        gate: L.doors.find((d) => d.kind === 'gate' && d.room === A.room) ?? null,
        seal: L.doors.find((d) => d.kind === 'seal' && d.room === A.room) ?? null,
        arena: {
          x0, z0, x1: x0 + r.w * L.cell, z1: z0 + r.h * L.cell,
          cx: o.x + A.centre.x, cz: o.z + A.centre.z, bx: o.x + A.back.x, bz: o.z + A.back.z, y: o.y + r.floor,
        },
      };
      enc.ctx = {
        sim: this.sim, arena: enc.arena,
        players: () => this.inArena(enc),
        bosses: () => [...enc.scripts.values()].map((s) => s.boss).filter((b) => b.alive),
        emit: (ev) => this.sim.emit(ev),
        say: (text, big = false) => this.dungeons.tell(run, { say: text, big: big ? 1 : undefined }),
        // (A phase, a rage, a shield up or down: everyone's HUD hears at once.)
        changed: () => { enc.told = 0; this.dungeons.tell(run); },
      };
      return enc;
    });
    // The gates stand open until a fight shuts them.
    for (const e of this.encounters) if (e.gate) dungeons.openDoor(run, e.gate.id);
  }

  get sim() { return this.dungeons.host.sim; }

  // The living players inside an encounter's arena.
  inArena(enc) {
    const A = enc.arena;
    return this.sim.players.filter((p) => p.alive && !p.decoy && this.run.players.has(p.id)
      && p.position.x >= A.x0 && p.position.x <= A.x1 && p.position.z >= A.z0 && p.position.z <= A.z1);
  }
  // Everyone in the copy who's still standing.
  standing() { return this.sim.players.filter((p) => p.alive && this.run.players.has(p.id)).length; }

  campOf(enc) { return this.sim.encounters.camps.get(`dr:${this.run.id}:${enc.room}`) ?? null; }
  isDown(i) { return this.encounters.find((e) => e.i === i)?.state === 'down'; }
  get last() { return this.encounters[this.encounters.length - 1] ?? null; }

  // ---------------------------------------------------------------- every tick
  tick(dt) {
    for (const enc of this.encounters) {
      if (enc.state === 'down') continue;
      const camp = this.campOf(enc);
      if (!camp) continue;
      // Each boss as it comes into the world gets its script (health set for who's in the copy).
      for (const slot of camp.slots) {
        const e = slot.enemy;
        if (!e?.alive || enc.scripts.get(slot.opts.script)?.boss === e || !slot.opts.script) continue;
        const s = new BossScript(enc.ctx, e, slot.opts.script);
        s.scale(this.standing() || 1);
        enc.scripts.set(slot.opts.script, s);
      }
      const scripts = [...enc.scripts.values()];
      if (enc.state === 'idle') {
        if (scripts.some((s) => s.boss.alive && s.boss.engaged)) this.pull(enc);
        continue;
      }
      // In the fight (anyone in the copy falling spoils a flawless kill).
      for (const s of scripts) s.update(dt);
      if (!enc.fell && this.sim.players.some((p) => !p.alive && this.run.players.has(p.id))) enc.fell = true;
      // Every few seconds the fight's state goes out again (the enrage clocks stay true).
      if ((enc.told = (enc.told ?? 0) + dt) > 5) { enc.told = 0; this.dungeons.tell(this.run); }
      // One of several bosses down: the rest rally.
      for (const s of scripts) {
        if (s.boss.alive || s.fallen) continue;
        s.fallen = true;
        s.end();
        const left = scripts.filter((x) => x.boss.alive);
        if (left.length && enc.def.rally) {
          for (const x of left) x.rally(enc.def.rally.by ?? 1.3);
          enc.ctx.say(enc.def.rally.say ?? `${s.boss.displayName} falls — the others fight harder!`, true);
        }
        this.dungeons.tell(this.run);
      }
      // Everyone down, gone, or the bosses gave up: a wipe.
      const someone = this.inArena(enc).length > 0;
      enc.empty = someone ? 0 : enc.empty + dt;
      const holding = scripts.some((s) => s.boss.alive && s.boss.engaged);
      if (enc.empty > WIPE_AFTER || (!holding && !someone)) this.wipe(enc);
    }
  }

  pull(enc) {
    enc.state = 'fight';
    enc.at = this.dungeons.time;
    enc.empty = 0;
    enc.fell = false;
    const n = Math.max(1, this.inArena(enc).length);
    for (const s of enc.scripts.values()) { s.fallen = false; s.begin(n); }
    // Every boss of the encounter joins in at once.
    const foe = this.inArena(enc)[0] ?? null;
    for (const s of enc.scripts.values()) if (!s.boss.engaged && foe) s.boss.aggro(true, foe);
    if (enc.gate) this.shut(enc.gate.id);
    this.dungeons.tell(this.run, { say: `${enc.def.name} — the gate seals behind you!`, big: 1 });
  }

  wipe(enc) {
    enc.state = 'idle';
    for (const s of enc.scripts.values()) {
      s.end();
      const b = s.boss;
      if (b.alive) {
        b.threat.clear();
        b.hp = b.maxHp;
        if (b.engaged) b.leash();
      }
    }
    // (A boss that fell in a wipe comes back with the rest: the camp spawns it again.)
    const camp = this.campOf(enc);
    if (camp && [...enc.scripts.values()].some((s) => !s.boss.alive)) {
      this.sim.encounters.despawn(camp);
      for (const slot of camp.slots) slot.respawnAt = 0;
      enc.scripts.clear();
    }
    if (enc.gate) this.dungeons.openDoor(this.run, enc.gate.id);
    this.dungeons.tell(this.run, { say: `The raid has fallen — ${enc.def.name} waits again.`, big: 1 });
  }

  shut(id) {
    const run = this.run;
    run.state.open.delete(id);
    run.interior.setDoor(id, false);
  }

  // An arena's camp emptied: its encounter is beaten.
  onRoomCleared(camp) {
    const enc = this.encounters.find((e) => e.room === camp.def.index);
    if (!enc || enc.state === 'down') return false;
    enc.state = 'down';
    for (const s of enc.scripts.values()) s.end();
    if (enc.gate) this.dungeons.openDoor(this.run, enc.gate.id);
    if (enc.seal) this.dungeons.openDoor(this.run, enc.seal.id);
    const final = enc === this.last;
    if (final) this.run.state.boss = true;
    this.dungeons.host.cleared?.(this.run, enc);
    const say = final ? `${enc.def.name} has fallen. ${this.run.def.name} is beaten — its chest is yours to open.` : `${enc.def.name} has fallen. Its chest is yours to open, and the way on stands open.`;
    this.dungeons.tell(this.run, { say, big: 1 });
    return true;
  }

  // Where someone comes back after a fall: the last arena beaten (its gate open), else the
  // entrance hall.
  checkpoint() {
    const done = this.encounters.filter((e) => e.state === 'down');
    const e = done[done.length - 1];
    if (!e) return null;
    return { x: e.arena.cx, y: e.arena.y, z: e.arena.cz, facing: 0, name: e.def.name };
  }

  // For everyone's screens: each encounter's state and its bosses' fights.
  state() {
    return this.encounters.map((e) => ({
      i: e.i, st: e.state,
      b: e.state === 'fight' ? [...e.scripts.values()].filter((s) => s.boss.alive).map((s) => s.info) : [],
    }));
  }
}
