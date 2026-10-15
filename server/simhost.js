// The realm's world simulation: the shared WorldSim (src/sim/) running every enemy for every
// player, on the headless world (server/world.js). The realm (server/realm.js) feeds it player
// states and hit reports and asks it, per player per tick, what that player should hear about.
//
// Protocol additions (inside the realm's snap, and messages of their own):
//   server → client, in snap:  ea [enemy add], ed [ids removed], es [enemy states], ev [events]
//     enemy add   { id, t, v, lv, el, ch, af, su, mh, hp, s }  (ch: a champion, af: affixes; su: its
//                 summoner's id, or -1 for a split half; s: a state, as in es)
//     state       [id, x, y, z, facing, vx, vz, state, stateTime, attack, hitIndex, hp, flags, lift,
//                  alt, foe, attackSeq, maxHp, shield?]
//     event       see src/sim/EnemySim.js (shot, boom, tele, blink, ward, heal, howl, dmg, poof, die)
//   server → client:  reward { xp, gold, kill, at, loot: [recipe], quest? } · camp { id, cleared, near }
//                     bonus { title, xp, gold, at, loot } — a warband broken, a stronghold stormed
//                     reach / defended { id, i } — a quest's place reached, a place held (each
//                     second the server checks where everyone is against their quests:
//                     rpg/questWatch.js; a defence is the world sim's, shared by whoever's there)
//                     dun { id, st: { open, key, nodes, mini, boss, cleared, lift, raid? }, say?, big? }
//                     — a dungeon or raid copy's state (sim/Dungeons.js), to everyone in it whenever
//                     it changes (raid: each encounter's state and its bosses' fights, sim/RaidRun.js)
//     raid events (sim/BossScript.js): rt { id, s: shape, t, el, f?, n?, nm } a mark on the floor ·
//                     rb { id, s, dmg, kb, el, fail? } it lands · hz { id, s, life, dps, el } a pool ·
//                     hzx { id } it's gone · rph { id, ph, name } a phase · renr { id } enraged ·
//                     rimm { id } a hit on an immune boss (combat/shapes.js packs the shapes)
//   public events (sim/WorldEvents.js), twice a second when they've changed:
//                     wev { l: [event view], me: { id: [points, vote, chest] } } — the events near
//                     a player, and their own part in each · ovr { id, on } — a settlement overrun
//                     or free again (the list comes with welcome)
//   client → server:  hit { id, d, src, po, kb, dx, dz }   ·   st { id, el, po }
//                     dun { id } — something in their dungeon used (a key, a power node, a door)
//                     evote { id, tier } — a vote at an event's beacon
import * as THREE from 'three';
import { HeadlessWorld } from './world.js';
import { WorldSim, strongholdXp } from '../src/sim/WorldSim.js';
import { STATE_CODE, FLAG } from '../src/sim/enemyDefs.js';
import { rewardRoll, bonusRoll, visitRoll, eventRoll } from '../src/rpg/CharacterCore.js';
import { reachedPlaces, defenceAt, heldObjectives, questDrops } from '../src/rpg/questWatch.js';
import { maxHit } from './characters.js';
import { PARTY_RANGE } from './parties.js';
import { Grid, metrics, log } from './ops.js';
import { Dungeons } from '../src/sim/Dungeons.js';
import { inPocket } from '../src/world/dungeons.js';
import { HUB } from '../src/world/Gen.js';

const HUB_FOCUS = { x: HUB.x, z: HUB.z };
const TICK_TARGET_MS = 40; // building for arrivals keeps ticks under this when it can (they're 50 ms apart)

const EAOI = 110;          // metres: enemies further than this from a player aren't sent to them
const EVENT_RANGE = 130;
const SHARE_RANGE = 60;    // players this close to a kill share in it
const MELEE_REACH = 12;    // generous: lunges, lag, big enemies
const SHOT_REACH = 240;
const KEEPALIVE = 1000;    // ms: an enemy that hasn't changed is still re-sent this often
const STATUSES = new Set(['fire', 'frost', 'corrosive', 'shock']);
const MAX_SPEED = 50;      // m/s across the ground (bullet-jump chains top out around 36)
const MOVE_BANK = 2;       // seconds of movement a player may bank (delayed, bunched-up states)
const r2 = (v) => Math.round(v * 100) / 100;
const EVENT_SEND = 0.5;    // seconds between public-event updates to each player

export class SimHost {
  constructor(realm, seed) {
    this.realm = realm;
    this.world = new HeadlessWorld(seed);
    this.arriving = []; // proxies placed but waiting on the world round them, in the order they came
    this.worldEvents = true; // the sim runs public events here (sim/WorldEvents.js)
    this.sim = new WorldSim(this);
    // The dungeons' copies on this layer (sim/Dungeons.js): built in the world, their rooms filled
    // by the sim.
    this.dungeons = new Dungeons({
      world: this.world,
      sim: this.sim,
      send: (id, msg) => this.realm.sessions.get(id)?.send(msg),
      positionOf: (id) => { const p = this.realm.sessions.get(id)?.proxy; return p?.placed ? p.position : null; },
      cleared: (run, enc) => (enc ? this.raidCleared(run, enc) : this.dungeonCleared(run)),
    });
    this.events = [];
    this.snaps = new Map();    // enemy → { s, json }: its state this tick (see snapOf)
    this.cleared = new Set();
    this.grid = new Grid(64);
  }

  // ---------------------------------------------------------------- host interface for WorldSim
  emit(ev) { this.events.push(ev); }

  onKilled(e, hit, credit) {
    metrics.inc('kills');
    this.emit({ k: 'die', id: e.id, at: e.position });
    // Each credited character gets their own roll (XP for their level, their own loot, the quest
    // drops their quests are after).
    for (const s of this.sharers(e.position, credit.map(([id]) => id))) {
      const roll = rewardRoll(e, s.core.stats.level, () => s.core.gid(), s.core.tier);
      const quest = questDrops(s.core.quests, { ...roll.kill, at: roll.at });
      if (quest.length) roll.quest = quest;
      this.give(s, { op: 'reward', roll });
    }
  }

  // A place held against its waves (a quest's 'defend'): everyone there whose quests wanted it.
  onDefended(d) {
    for (const s of this.realm.sessions.values()) {
      const p = s.proxy;
      if (!p?.placed || !s.core || Math.hypot(p.position.x - d.x, p.position.z - d.z) > d.r + 50) continue;
      for (const [id, i] of heldObjectives(s.core.quests, d.key)) this.give(s, { op: 'defended', roll: { id, i } });
    }
  }

  // A warband wiped out: everyone who was there gets a bonus.
  onHordeBroken(pack, last) {
    const at = [last.position.x, last.position.y, last.position.z];
    for (const s of this.sharers(last.position)) {
      const roll = bonusRoll({ title: 'Warband broken', kind: 'warband', xp: pack.xp * 0.5, level: pack.level, race: pack.race, items: 1, at }, s.core.stats.level, () => s.core.gid(), s.core.settings.threat);
      this.give(s, { op: 'bonus', roll });
    }
  }

  // ---------------------------------------------------------------- public events
  // An event won: each participant who earned it gets the chest, rolled for them.
  onEventEnd(ev) {
    metrics.inc(ev.res === 'won' ? 'events_won' : 'events_lost');
    for (const person of ev.result.people) {
      const s = this.realm.sessions.get(person.id);
      if (s?.core) this.give(s, { op: 'event', roll: eventRoll(ev, person, s.core.stats.level, () => s.core.gid()) });
    }
  }

  // A settlement overrun (or free again): everyone's screen hides (or brings back) its folk.
  onOverrun(place, on) {
    for (const s of this.realm.sessions.values()) s.send({ t: 'ovr', id: place.id, on: on ? 1 : 0 });
  }

  get overrun() { return this.sim.director.overrunList(); }

  // The tier of the event a player's in (their Threat while it lasts), else null.
  eventTier(session) {
    const p = session.proxy;
    return p?.placed ? this.sim.director.tierFor(session.id, p.position) : null;
  }

  vote(s, m) {
    if (s.proxy?.placed && typeof m.id === 'string') this.sim.director.vote(s.id, m.id.slice(0, 16), Number(m.tier));
  }

  // Twice a second, each player hears about the events near them, when anything's changed: each
  // event's view (worked out once however many it goes to) and their own part in it.
  sendEvents(dt) {
    if ((this.eventTimer = (this.eventTimer ?? 0) - dt) > 0) return;
    this.eventTimer = EVENT_SEND;
    const d = this.sim.director;
    const views = new Map();
    for (const s of this.realm.sessions.values()) {
      const p = s.proxy;
      if (!p?.placed) continue;
      const list = inPocket(p.position.x) ? [] : d.near(p.position.x, p.position.z);
      if (!list.length && !s.eventsSent) continue;
      const parts = [];
      const me = {};
      for (const ev of list) {
        if (!views.has(ev)) views.set(ev, JSON.stringify(d.view(ev)));
        parts.push(views.get(ev));
        me[ev.id] = d.personal(ev, s.id);
      }
      const text = `{"t":"wev","l":[${parts.join(',')}],"me":${JSON.stringify(me)}}`;
      if (text === s.eventsSent) continue;
      s.eventsSent = list.length ? text : null;
      s.send(text);
    }
  }

  // The characters a feat near `pos` is shared with: those credited, those close by, and their
  // party members a little further off.
  sharers(pos, credited = []) {
    const near = new Set(credited);
    for (const p of this.sim.players) {
      if (p.alive && Math.hypot(p.position.x - pos.x, p.position.z - pos.z) <= SHARE_RANGE) near.add(p.id);
    }
    for (const id of [...near]) {
      const s = this.realm.sessions.get(id);
      if (!s) continue;
      for (const m of this.realm.parties.mates(s)) {
        const q = m.proxy?.position;
        if (m.proxy?.placed && q && Math.hypot(q.x - pos.x, q.z - pos.z) <= PARTY_RANGE) near.add(m.id);
      }
    }
    return [...near].map((id) => this.realm.sessions.get(id)).filter((s) => s?.core);
  }

  // A server-rolled change to a character: applied to the server's copy and sent to theirs.
  give(s, op) {
    s.core.time = this.sim.time;
    s.core.apply(op);
    s.dirty = true;
    s.level = s.core.stats.level;
    s.send({ t: 'sop', op });
  }

  // A dungeon's room emptied or filled again, and the dungeon beaten: everyone in that copy has it
  // in their records.
  onRoomCleared(camp) { this.dungeons.onRoomCleared(camp); }
  onRoomRestored(camp) { this.dungeons.onRoomRestored(camp); }
  dungeonCleared(run) {
    for (const id of run.players) {
      const s = this.realm.sessions.get(id);
      if (s?.core) this.give(s, { op: 'dclear', roll: { d: run.def.id, tier: run.tier, name: run.def.name } });
    }
  }
  // One of a raid's encounters beaten (sim/RaidRun.js): everyone in the copy has it in their records.
  raidCleared(run, enc) {
    const roll = { raid: run.def.id, enc: enc.def.id, name: enc.def.name, tier: run.tier ?? 0, final: enc === run.raid.last, flawless: !enc.fell };
    for (const id of run.players) {
      const s = this.realm.sessions.get(id);
      if (s?.core) this.give(s, { op: 'rclear', roll });
    }
  }

  // The story flags of the others going in with someone (their raid group, else their party): one
  // who has opened a raid's gate opens it for them all (DEC-4, sim/Dungeons.js opened).
  matesFlags(s) {
    const raids = this.realm.raids;
    const group = raids?.groupOf?.(s);
    const party = this.realm.parties.partyOf(s);
    const others = group ? raids.sessions(group) : party ? this.realm.parties.members(party) : [];
    return others.filter((o) => o !== s && o.core).map((o) => o.core.quests.flags);
  }

  // The instance manager as one character's operations see it (rpg/CharacterCore.js `dungeons`):
  // going in with their party (or alone, or with their raid group), coming out, and the chests
  // that are theirs.
  dungeonPort(s) {
    const d = this.dungeons;
    const who = () => ({
      id: s.id, position: s.proxy.position, party: this.realm.parties.partyOf(s)?.id ?? `solo:${s.charId}`,
      raid: this.realm.raids?.keyOf(s) ?? null, level: s.core?.stats.level ?? 1, flags: s.core?.quests.flags ?? {},
      mates: this.matesFlags(s),
    });
    return {
      enter: (ask) => d.enter(who(), ask),
      leave: () => d.leave(who()),
      current: () => { const r = d.runOf(s.id); return r && { dungeon: r.def.id, tier: r.tier, shared: r.shared, raid: !!r.raid }; },
      claim: (id, kind) => d.claim(s.id, s.charId, id, s.proxy.position, kind),
    };
  }

  onCampCleared(camp) { this.campChanged(camp, true); }
  onCampRestored(camp) { this.campChanged(camp, false); }

  campChanged(camp, cleared) {
    if (cleared) this.cleared.add(camp.def.id);
    else this.cleared.delete(camp.def.id);
    const dist = (s) => {
      const p = s.proxy?.position;
      return p ? Math.hypot(p.x - camp.def.x, p.z - camp.def.z) : Infinity;
    };
    const there = new Set([...this.realm.sessions.values()].filter((s) => dist(s) < camp.def.radius + 60));
    // Party members of those who were there, within reach, count as there.
    for (const s of [...there]) for (const m of this.realm.parties.mates(s)) if (dist(m) <= PARTY_RANGE) there.add(m);
    for (const s of this.realm.sessions.values()) {
      const near = there.has(s);
      s.send({ t: 'camp', id: camp.def.id, cleared, near, name: camp.def.name });
      // Those there when it fell get it on their quests — and, for a stronghold, a bonus.
      if (cleared && near && s.core) {
        const op = { op: 'camp', id: camp.def.id, roll: {} };
        s.core.apply(op);
        s.dirty = true;
        s.send({ t: 'sop', op });
        if (camp.def.stronghold) {
          const at = [camp.def.x, this.world.groundHeight(camp.def.x, camp.def.z), camp.def.z];
          const roll = bonusRoll({ title: `${camp.def.name} stormed`, kind: 'stronghold', xp: strongholdXp(camp), level: camp.def.level, race: camp.def.race, items: 2, at }, s.core.stats.level, () => s.core.gid(), s.core.settings.threat);
          this.give(s, { op: 'bonus', roll });
        }
      }
    }
  }

  // A player's holo-decoy (combat/abilities.js), for enemies near it to go for.
  addDecoy(session, p, duration) {
    session.decoys = (session.decoys ?? 0) + 1;
    this.sim.addDecoy({ id: `d${session.id}:${session.decoys}`, owner: session.id, position: new THREE.Vector3().fromArray(p), duration });
  }

  // Builds the world round Brightwater now (it stays built: see tick).
  primeHub() {
    const t0 = performance.now();
    this.world.prime([HUB_FOCUS]);
    log.info('sim', `built Brightwater's surroundings in ${Math.round(performance.now() - t0)} ms`);
  }

  // ---------------------------------------------------------------- players
  // In a fight: an enemy is after them, or one they've hurt is still fighting.
  inCombat(session) {
    for (const e of this.sim.enemies) if (e.alive && e.engaged && (e.foe?.id === session.id || e.threat.has(session.id))) return true;
    return false;
  }

  join(session) {
    // `placed`: they've said where they are; `ready`: the world round them is built (see tick).
    session.proxy = { id: session.id, session, position: new THREE.Vector3(), velocity: new THREE.Vector3(), radius: 0.45, height: 2.0, alive: false, placed: false, ready: false };
    session.knownEnemies = new Map(); // enemy id → { s: last state sent, at: when }
  }

  leave(session) {
    this.arriving = this.arriving.filter((p) => p !== session.proxy);
    this.dungeons.out(session.id);
    this.sim.forgetPlayer(session.id);
    this.refreshPlayers();
  }

  // A player's reported state: accepted unless it's further than they could have moved (a
  // movement bank tolerates states arriving late or bunched up; travel and respawn are let through).
  // Returns false when refused (the player is told where they really are).
  updatePlayer(session, st) {
    const p = session.proxy;
    const now = performance.now();
    if (p.placed) {
      p.bank = Math.min(MAX_SPEED * MOVE_BANK, (p.bank ?? MAX_SPEED) + ((now - p.at) / 1000) * MAX_SPEED);
      const d = Math.hypot(st.p[0] - p.position.x, st.p[2] - p.position.z);
      const free = session.core && session.core.time < session.core.teleportUntil;
      if (d > p.bank + 3 && !free) {
        session.strikes += 2;
        session.send({ t: 'pos', p: [r2(p.position.x), r2(p.position.y), r2(p.position.z)] });
        p.at = now;
        return false;
      }
      p.bank = Math.max(0, p.bank - d);
    }
    p.at = now;
    p.position.fromArray(st.p);
    p.velocity.set(st.v[0], 0, st.v[2]);
    p.alive = !(st.fl & 16);
    if (!p.placed) {
      // First word from this player: the world round them is built over the next ticks (a slice
      // a tick, so nobody else waits on it), and only then do they count — before anything
      // spawns round them.
      p.placed = true;
      this.arriving.push(p);
    }
    return true;
  }

  refreshPlayers() {
    this.sim.setPlayers([...this.realm.sessions.values()].map((s) => s.proxy).filter((p) => p?.placed && p.ready));
  }

  // ---------------------------------------------------------------- per tick
  tick(dt) {
    this.snaps.clear();
    // Every couple of seconds, somewhere new for anyone? (Biomes, regions, landmarks, settlements
    // go into their records: rpg/achievements.js.)
    if ((this.visitTimer = (this.visitTimer ?? 0) - dt) <= 0) {
      this.visitTimer = 2;
      for (const s of this.realm.sessions.values()) {
        const p = s.proxy;
        if (!p?.placed || !s.core || inPocket(p.position.x)) continue;
        const roll = visitRoll(this.world, p.position.x, p.position.z, s.core.records);
        if (roll) this.give(s, { op: 'visit', roll });
      }
    }
    // Every second: quests' places reached, and places to hold (rpg/questWatch.js).
    if ((this.questTimer = (this.questTimer ?? 0) - dt) <= 0) {
      this.questTimer = 1;
      for (const s of this.realm.sessions.values()) {
        const p = s.proxy;
        if (!p?.ready || !p.alive || !s.core || inPocket(p.position.x)) continue;
        for (const [id, i] of reachedPlaces(s.core.quests, p.position.x, p.position.z)) this.give(s, { op: 'reach', roll: { id, i } });
        const d = defenceAt(s.core.quests, this.world, p.position.x, p.position.z);
        if (d) this.sim.encounters.defend(d);
      }
    }
    // The world round everyone, those who just arrived first (in what the last tick left spare);
    // then whoever's surroundings are built joins the simulation. Brightwater's stays built, empty
    // or not: it's where new characters start and everyone comes back to, and the biggest build.
    const foci = [HUB_FOCUS, ...[...this.realm.sessions.values()].filter((s) => s.proxy?.placed).map((s) => s.proxy.position)];
    this.world.track(foci, this.arriving.map((p) => p.position), TICK_TARGET_MS - (metrics.tickMs.at(-1) ?? 0));
    if (this.arriving.length) {
      const ready = this.arriving.filter((p) => this.world.ready(p.position));
      if (ready.length) {
        for (const p of ready) p.ready = true;
        this.arriving = this.arriving.filter((p) => !p.ready);
        this.refreshPlayers();
      }
    }
    this.dungeons.tick(dt);
    this.sim.update(dt);
    this.grid.clear();
    for (const e of this.sim.enemies) this.grid.add(e, e.position.x, e.position.z);
    this.sendEvents(dt);
  }

  // What one player should hear this tick: enemies coming into and out of range, their states,
  // and the events near them.
  viewFor(s) {
    const p = s.proxy;
    if (!p?.placed) return null;
    const known = s.knownEnemies;
    const ea = [];
    const ed = [];
    const es = [];
    const here = new Set();
    const now = performance.now();
    // Only the enemies in nearby cells, plus the ones this player already knows (to see them off).
    const cand = new Set(this.grid.near(p.position.x, p.position.z, EAOI * 1.15));
    for (const id of known.keys()) { const e = this.sim.byId.get(id); if (e) cand.add(e); }
    for (const e of cand) {
      const d = Math.hypot(e.position.x - p.position.x, e.position.z - p.position.z);
      if (d > (known.has(e.id) ? EAOI * 1.15 : EAOI)) continue;
      here.add(e.id);
      const snap = this.snapOf(e);
      const last = known.get(e.id);
      if (!last) {
        known.set(e.id, { s: snap.s, at: now });
        ea.push({
          id: e.id, t: e.typeName, v: e.variant, lv: e.level, el: e.elite || null, ch: e.champion ? 1 : undefined, af: e.affixes.length ? e.affixes : undefined,
          hd: e.camp?.horde ? 1 : undefined, nm: e.name ?? undefined,
          su: e.summoner?.id ?? (e.split ? -1 : 0), mh: e.maxHp, hp: Math.round(e.hp), s: snap.s,
        });
      } else if (now - last.at > KEEPALIVE || changed(snap.s, last.s, (now - last.at) / 1000)) {
        // Only what changed (the player's screen carries an unchanged enemy on by itself).
        known.set(e.id, { s: snap.s, at: now });
        es.push(snap.json);
      } else metrics.inc('states_saved');
    }
    for (const id of known.keys()) if (!here.has(id)) { known.delete(id); ed.push(id); }
    const ev = [];
    for (const v of this.events) {
      const at = v.at;
      if (at && Math.hypot(at.x - p.position.x, at.z - p.position.z) > EVENT_RANGE) continue;
      if (v.json === undefined) {
        const { at: _, ...out } = v;
        v.json = JSON.stringify(out);
      }
      ev.push(v.json);
    }
    // `es` and `ev` are JSON already.
    return { ea, ed, es, ev };
  }

  // An enemy's state this tick, worked out once however many players it goes to: the array (to
  // compare with what each of them was sent last) and its JSON (to send).
  snapOf(e) {
    let snap = this.snaps.get(e);
    if (!snap) {
      const s = this.stateOf(e);
      snap = { s, json: JSON.stringify(s) };
      this.snaps.set(e, snap);
    }
    return snap;
  }

  endTick() { this.events.length = 0; }

  get enemyCount() { return this.sim.enemies.length; }

  stateOf(e) {
    const s = e.statuses;
    const fl = (e.engaged ? FLAG.engaged : 0) | (e.hidden ? FLAG.hidden : 0) | (e.guarding ? FLAG.guarding : 0) | (e.ward ? FLAG.ward : 0)
      | (e.frenzy > 0 ? FLAG.frenzy : 0) | (s.burn ? FLAG.burn : 0) | (s.chill ? FLAG.chill : 0) | (s.corrode ? FLAG.corrode : 0)
      | (s.shocked ? FLAG.shocked : 0) | (e.alive ? FLAG.alive : 0) | (e.rallied > 0 ? FLAG.rallied : 0) | (e.immune ? FLAG.immune : 0);
    const st = [
      e.id, r2(e.position.x), r2(e.position.y), r2(e.position.z), r2(e.facing), r2(e.velocity.x), r2(e.velocity.z),
      STATE_CODE[e.state], r2(e.stateTime), e.curIndex, e.hitIndex, Math.round(e.hp), fl, r2(e.lift), r2(e.alt),
      e.foe?.id ?? -1, e.attackSeq, e.maxHp,
    ];
    if (e.shieldMax || e.brokenParts.length) st.push(e.shieldMax ? Math.round(e.shield) : null);
    if (e.brokenParts.length) st.push(e.brokenParts);
    return st;
  }

  // ---------------------------------------------------------------- reports from players
  // A hit, as seen on the hitter's screen: believed if it's plausible (in reach, not more damage
  // than their level allows), then applied by the sim.
  hit(s, m) {
    const e = this.sim.byId.get(Number(m.id));
    const p = s.proxy;
    if (!e || !e.alive || !p?.placed || !p.alive) return;
    const damage = Number(m.d);
    if (!Number.isFinite(damage) || damage <= 0) return;
    const src = m.src === 'melee' || m.src === 'explosion' || m.src === 'status' ? m.src : 'projectile';
    const reach = src === 'melee' ? MELEE_REACH + e.radius : SHOT_REACH;
    if (Math.hypot(e.position.x - p.position.x, e.position.z - p.position.z) > reach) return;
    // No more than the weapons they carry could do.
    if (damage > maxHit(s.core)) { s.strikes += 5; return; }
    const dx = Number(m.dx) || 0;
    const dz = Number(m.dz) || 0;
    const len = Math.hypot(dx, dz) || 1;
    metrics.inc('hits');
    this.sim.applyHit(e.id, {
      by: s.id, damage: Math.round(damage), source: src,
      component: typeof m.cp === 'string' ? m.cp.slice(0, 24) : null,
      poise: Math.min(500, Math.max(0, Number(m.po) || 0)), knockback: Math.min(60, Math.max(0, Number(m.kb) || 0)),
      dir: { x: dx / len, z: dz / len },
    });
  }

  status(s, m) {
    const e = this.sim.byId.get(Number(m.id));
    if (!e || !e.alive || !STATUSES.has(m.el) || !s.proxy?.placed) return;
    const potency = Math.min(maxHit(s.core), Math.max(0, Number(m.po) || 0));
    e.addStatus(m.el, potency, s.id);
  }
}

// Has an enemy's state moved on from the last one sent, beyond what the player's screen works out
// by itself (stateTime counting up)? Positions to 5 cm, facing to ~2°.
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
function changed(a, b, dt) {
  if (a[7] !== b[7] || a[9] !== b[9] || a[10] !== b[10] || a[11] !== b[11] || a[12] !== b[12] || a[15] !== b[15] || a[16] !== b[16] || a[17] !== b[17] || a[18] !== b[18] || JSON.stringify(a[19]) !== JSON.stringify(b[19])) return true;
  if (Math.abs(a[1] - b[1]) > 0.05 || Math.abs(a[2] - b[2]) > 0.05 || Math.abs(a[3] - b[3]) > 0.05) return true;
  if (Math.abs(wrap(a[4] - b[4])) > 0.03 || Math.abs(a[5] - b[5]) > 0.1 || Math.abs(a[6] - b[6]) > 0.1) return true;
  if (Math.abs(a[13] - b[13]) > 0.03 || Math.abs(a[14] - b[14]) > 0.03) return true;
  return Math.abs(a[8] - (b[8] + dt)) > 0.12;
}
