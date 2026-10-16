// Public world events (gameplay phase 6): the director that starts them near players, and the
// events themselves — a settlement to hold against a Hive surge or a Scav siege, a Maker beacon to
// charge while the rift beside it pours out guardians, an overrun settlement to retake. It runs
// inside the world sim (sim/WorldSim.js) when the host asks for it (`host.worldEvents`), so the
// server runs it for a whole layer and offline single-player runs it for one player.
//
// An event goes: gathering (its beacon lit, the tier voted there) → under way (its objectives) →
// won or lost (the chest, or the place overrun and a Retake started) → gone a little later.
// A quest's step can call one at a named place too (startStory: at once, at Normal, no vote).
// What players need to know comes out as each event's state (`view`, `personal`) and the host's
// callbacks:
//   onEventEnd(ev)          won or lost: ev.result { won, people: [{ id, points, top, lead }] }
//   onOverrun(place, on)    a settlement overrun (its folk and services gone) or free again
// Things to defend are stand-ins for enemies to fight, like holo-decoys: { id, kind, position,
// velocity, radius, height, alive, hp, max, structure: true }. An event's enemies (camp: the
// event) go for them (EnemySim.retarget) and wear them down (EnemySim.release → strike): the sim
// counts it, since no player's screen takes the hit.
import * as THREE from 'three';
import { eventWave, campUnits } from '../combat/races.js';
import { enemyDamage } from './enemyDefs.js';
import { rollAffixes, affixCount } from './affixes.js';
import { inPocket } from '../world/dungeons.js';
import { roadRoute, RouteFollower } from './Routes.js';

export const DIRECTOR = {
  every: 10,        // seconds between looks for somewhere to start one
  chance: 0.35,     // of starting one, each look, for a player who's due
  first: 150,       // seconds after arriving before a player's first
  quiet: 300,       // seconds after the last one near a player before the next
  siteRest: 1200,   // seconds a site rests after its event
  gap: 600,         // metres between events
  min: 120,         // a site this far from the player at least…
  max: 320,         // …and no further
  minLevel: 3,      // no events in the starting lands
  perPlayers: 8,    // one more running at once per this many players on the layer
  cap: 6,
  spread: 0.25,     // from level `spreadLevel`, the chance any settlement's event is a Hive surge
  spreadLevel: 8,
};
export const GATHER = 40;      // seconds of gathering: the beacon lit, the vote open
export const OVER = 15;        // seconds a finished event stays on the map
export const OVERRUN = 900;    // seconds a fallen settlement stays overrun (unless retaken)
export const ELIGIBLE = 60;    // contribution points for the chest (a point a second there)
const ABANDON = { reach: 200, after: 45 };
const AREA_PAD = 35;           // participants: within the event's area plus this
const TIER_PAD = 60;           // the event's tier is your Threat within its area plus this
const VOTE_REACH = 9;
const ANNOUNCE = 450;          // metres: who's told an event has begun
const STRAGGLE = { far: 45, after: 20, rout: 60 }; // see stragglers()
const MAX_FOES = 40;           // an event's enemies alive at once, at most
const PLACE_TYPES = new Set(['hamlet', 'settlement', 'town']);
const COUPLING_RING = 3.6;     // metres from a war-walker's heart its couplings ride
const IMMUNE_TELL = 0.6;       // seconds between "it's shielded" sparks (as sim/BossScript.js)

// Each kind of event. `hits`: how many of an on-level enemy's blows a thing to defend takes.
export const EVENT_TYPES = {
  surge: {
    name: 'Hive Surge', race: 'hive', settlement: true, pylons: 3, hits: 160, pods: 2, hatch: 14, waves: 4, wave: 6, gap: 28,
    gather: 'The Hive is coming for {place}. Gather at the beacon.', start: 'Hold the pylons and burst the spore pods',
    won: 'The surge is broken', lost: '{place} is overrun',
  },
  siege: {
    name: 'Scav Siege', race: 'scav', settlement: true, pylons: 3, hits: 160, engines: 2, crew: 2, waves: 2, wave: 6, gap: 20,
    gather: 'Scav siege engines are rolling up on {place}. Gather at the beacon.', start: 'Break the siege engines before they bring the defences down',
    won: 'The siege is lifted', lost: '{place} is overrun',
  },
  anomaly: {
    name: 'Maker Anomaly', race: 'synth', beacon: true, hits: 220, charge: 150, wave: 4, gap: 18,
    gather: 'A Maker beacon is waking at {place}. Gather at it.', start: 'Stand by the beacon while it charges; keep the guardians off it',
    won: 'The anomaly is stable', lost: 'The beacon is destroyed', faded: 'The anomaly fades',
  },
  walker: {
    name: 'Synth War-walker', race: 'synth', settlement: true, walker: true, speed: 1.5, couplings: 3, wave: 4, gap: 24,
    gather: 'A Synth war-walker is marching on {place}. Gather at the beacon.', start: 'Break the war-walker\'s couplings, then bring it down before it reaches {place}',
    won: 'The war-walker falls', lost: '{place} is overrun', faded: 'The war-walker turns back',
  },
  retake: {
    name: 'Retake', settlement: true, garrison: true,
    start: 'Drive out the garrison', won: '{place} is free', faded: 'The garrison has moved on',
  },
};
export const TIER_NAMES = ['Normal', 'Veteran', 'Elite'];

const _at = new THREE.Vector3();
const reach = (p) => (p.type === 'hub' ? p.radius : p.r ?? 12);
const round = (v) => Math.round(v * 10) / 10;

export class WorldEvents {
  constructor(sim) {
    this.sim = sim;
    this.events = new Map();   // id → event
    this.overrun = new Map();  // place id → { id, x, z, r, name, until, race }
    this.rest = new Map();     // site id → when it may have another
    this.last = new Map();     // player id → when an event near them last ended
    this.seen = new Map();     // player id → when the director first saw them
    this.timer = DIRECTOR.every;
    this.nextId = 1;
    this.rng = Math.random;
    // The world asks it who's overrun (World.folkNear, World.npcById).
    this.world.overrun = this.overrun;
  }

  get world() { return this.sim.world; }
  get time() { return this.sim.time; }

  // ================================================================ the director
  update(dt) {
    for (const ev of [...this.events.values()]) this.updateEvent(ev, dt);
    for (const [id, o] of this.overrun) if (this.time >= o.until && ![...this.events.values()].some((ev) => ev.site.id === id && ev.stage !== 'over')) this.free(id);
    if ((this.timer -= dt) > 0) return;
    this.timer = DIRECTOR.every;
    this.plan();
  }

  live() { return this.sim.players.filter((p) => p.alive && !p.decoy && !inPocket(p.position.x)); }

  // Is a player due an event? Not before they've been about a while, nor soon after the last one
  // near them.
  due(p) {
    const time = this.time;
    if (!this.seen.has(p.id)) this.seen.set(p.id, time);
    const last = this.last.get(p.id) ?? this.seen.get(p.id) - DIRECTOR.quiet + DIRECTOR.first;
    return time - last >= DIRECTOR.quiet;
  }

  plan() {
    const players = this.live();
    for (const id of this.seen.keys()) if (!this.sim.players.some((p) => p.id === id)) { this.seen.delete(id); this.last.delete(id); }
    const running = [...this.events.values()].filter((ev) => ev.stage !== 'over' && ev.type !== 'retake').length;
    if (!players.length || running >= Math.min(DIRECTOR.cap, 1 + Math.floor(this.sim.players.length / DIRECTOR.perPlayers))) return;
    const due = players.filter((p) => this.due(p) && !this.eventNear(p.position.x, p.position.z, DIRECTOR.gap));
    if (!due.length || this.rng() > DIRECTOR.chance) return;
    const p = due[Math.floor(this.rng() * due.length)];
    const sites = this.sites(p.position.x, p.position.z);
    if (sites.length) this.start(this.pick(sites));
  }

  // A site, settlements twice as likely as anomalies (there are far more landmarks and ruins).
  pick(sites) {
    const w = (s) => (EVENT_TYPES[s.type].settlement ? 2 : 1);
    let r = this.rng() * sites.reduce((a, s) => a + w(s), 0);
    for (const s of sites) if ((r -= w(s)) <= 0) return s;
    return sites[0];
  }

  eventNear(x, z, d) {
    for (const ev of this.events.values()) if (ev.stage !== 'over' && Math.hypot(ev.x - x, ev.z - z) < d) return ev;
    return null;
  }

  // Where an event could start near (x, z), and which: settlements in Hive or Scav land hold
  // against their surges and sieges (any settlement, further out, against the spreading Hive);
  // landmarks and ruins wake as Maker anomalies.
  sites(x, z) {
    const out = [];
    const time = this.time;
    for (const poi of this.world.poisNear(x, z, DIRECTOR.max, ['hamlet', 'settlement', 'town', 'landmark', 'ruin'])) {
      const d = Math.hypot(poi.x - x, poi.z - z);
      if (d < DIRECTOR.min || (this.rest.get(poi.id) ?? 0) > time || this.overrun.has(poi.id)) continue;
      if (this.eventNear(poi.x, poi.z, DIRECTOR.gap)) continue;
      const region = this.world.regionAt(poi.x, poi.z);
      const level = poi.level ?? region.level;
      if (level < DIRECTOR.minLevel) continue;
      const type = this.typeFor(poi, region.race, level);
      if (type) out.push({ poi, type, level, race: EVENT_TYPES[type].race ?? region.race });
    }
    return out;
  }

  typeFor(poi, race, level) {
    if (PLACE_TYPES.has(poi.type)) {
      if (race === 'hive') return 'surge';
      if (race === 'scav') return 'siege';
      return level >= DIRECTOR.spreadLevel && this.rng() < DIRECTOR.spread ? 'surge' : null;
    }
    return level >= 5 ? 'anomaly' : null;
  }

  // ================================================================ an event
  // `spec`: { poi, type, level, race } (the dev tools can start any type anywhere).
  start(spec) {
    const { poi, type } = spec;
    const T = EVENT_TYPES[type];
    const time = this.time;
    // A walker needs a road to come by: none, no walker.
    const route = T.walker ? roadRoute(this.world.gen, poi) : null;
    if (T.walker && !route) return null;
    const id = `ev${this.nextId++}`;
    const place = poi.name ?? `the ruins in ${this.world.regionAt(poi.x, poi.z).name}`;
    const ev = {
      id, type, T, director: this, site: poi, place, x: poi.x, z: poi.z, r: Math.max(10, reach(poi)), level: Math.max(1, spec.level ?? 1),
      race: spec.race ?? T.race ?? 'scav', stage: 'gather', began: time, until: time + (type === 'retake' ? 0 : GATHER),
      tier: spec.tier ?? 0, locked: !!spec.locked, story: !!spec.story, votes: new Map(), structures: [], foes: [], enemies: [], people: new Map(),
      wave: 0, waves: T.waves ?? 0, next: 0, lastWave: -Infinity, charge: 0, warden: false, phase: null,
      xp: 0, idle: 0, n: 1, near: 0, res: null, result: null, named: [], route, walker: null, couplings: [], unshielded: false,
    };
    ev.name = type === 'retake' ? `Retake ${place}` : `${T.name} at ${place}`;
    // The beacon: by the settlement's heart, or beside the landmark.
    const b = T.beacon ? this.beside(poi, ev.r + 5) : this.spot(poi.x, poi.z, 3.5, poi.rot ?? 0);
    ev.bx = b.x;
    ev.bz = b.z;
    ev.by = this.world.groundHeight(b.x, b.z);
    if (T.beacon) {
      const a = Math.atan2(b.x - poi.x, b.z - poi.z);
      const rift = this.spot(b.x + Math.sin(a) * 15, b.z + Math.cos(a) * 15, 0, a);
      ev.rx = rift.x;
      ev.rz = rift.z;
      // The anomaly's area is round its beacon, not the landmark.
      ev.x = (b.x + rift.x) / 2;
      ev.z = (b.z + rift.z) / 2;
      ev.r = 18;
    }
    this.events.set(id, ev);
    this.rest.set(poi.id, time + DIRECTOR.siteRest);
    if (type === 'retake') this.activate(ev);
    this.sim.emit({ k: 'evstart', at: new THREE.Vector3(ev.x, 0, ev.z), id, name: ev.name });
    return ev;
  }

  // Somewhere standable near (x, z): `d` metres out along `a`, else round about it.
  spot(x, z, d, a) {
    const w = this.world;
    for (let k = 0; k < 12; k++) {
      const ang = a + k * 2.4;
      const r = d * (1 + Math.floor(k / 4) * 0.35);
      const px = x + Math.sin(ang) * r;
      const pz = z + Math.cos(ang) * r;
      if (w.standable(px, pz) && !w.isWater(px, pz) && (w.slopeAt?.(px, pz) ?? 0) < 0.7) return { x: px, z: pz };
    }
    return { x, z };
  }

  // A spot `d` metres out from a place, on open, gentle ground (a beacon by a landmark).
  beside(poi, d) {
    const w = this.world;
    const a0 = poi.rot ?? 0;
    for (let k = 0; k < 8; k++) {
      const a = a0 + (k * Math.PI) / 4;
      const x = poi.x + Math.sin(a) * d;
      const z = poi.z + Math.cos(a) * d;
      if (!w.isWater(x, z) && (w.slopeAt?.(x, z) ?? 0) < 0.45) return { x, z };
    }
    return { x: poi.x + Math.sin(a0) * d, z: poi.z + Math.cos(a0) * d };
  }

  // Gathering's over: the vote counted, the things to defend raised, the attackers set down.
  activate(ev) {
    const T = ev.T;
    const time = this.time;
    ev.stage = 'active';
    ev.began = time;
    if (ev.type !== 'retake' && !ev.locked) ev.tier = this.tally(ev);
    ev.n = Math.max(1, this.present(ev).length);
    const scale = 1 + 0.3 * (ev.n - 1);
    if (T.pylons) {
      for (let i = 0; i < T.pylons; i++) {
        const a = (ev.site.rot ?? 0) + Math.PI / 3 + (i * Math.PI * 2) / T.pylons;
        ev.structures.push(this.structure(ev, `${ev.id}:p${i}`, 'pylon', this.clear(ev, a, Math.max(5, ev.r * 0.4)), T.hits * scale));
      }
    }
    if (T.beacon) ev.structures.push(this.structure(ev, `${ev.id}:b`, 'beacon', { x: ev.bx, z: ev.bz }, T.hits * scale));
    const extra = Math.floor((ev.n - 1) / 3);
    if (T.pods) {
      const n = T.pods + extra;
      for (let i = 0; i < n; i++) {
        const a = (ev.site.rot ?? 0) + Math.PI + (i - (n - 1) / 2) * 0.9;
        const at = this.spot(ev.x + Math.sin(a) * (ev.r + 16), ev.z + Math.cos(a) * (ev.r + 16), 4, a);
        const pod = this.spawn(ev, { type: 'sporepod', opts: {} }, at.x, at.z, { aggro: false, transient: false, objective: true });
        pod.hatchAt = time + 6 + i * 2;
      }
    }
    if (T.engines) {
      ev.phase = 'engines';
      const n = T.engines + extra;
      for (let i = 0; i < n; i++) {
        const a = (ev.site.rot ?? 0) + Math.PI + (i - (n - 1) / 2) * 0.8;
        const at = this.spot(ev.x + Math.sin(a) * (ev.r + 22), ev.z + Math.cos(a) * (ev.r + 22), 4, a);
        const engine = this.spawn(ev, { type: 'siegeengine', opts: {} }, at.x, at.z, { aggro: false, transient: false, objective: true });
        engine.facing = a + Math.PI;
        // Its crew stand by it.
        for (const u of eventWave(ev.race, ev.level, this.rng, T.crew)) {
          const c = this.spot(at.x, at.z, 3.5, this.rng() * Math.PI * 2);
          this.spawn(ev, u, c.x, c.z, { aggro: false, transient: false });
        }
        // The guns open up at the defences; the crews stay by them until someone comes for them.
        engine.foe = this.targetFor(ev, engine);
        engine.engaged = !!engine.foe;
      }
    }
    if (T.walker) this.raiseWalker(ev, extra);
    if (T.garrison) {
      const units = campUnits({ level: ev.level, race: ev.race, style: null, radius: ev.r, stronghold: false }, this.rng);
      units.push(...eventWave(ev.race, ev.level, this.rng, 1, 1));
      units.forEach((u, i) => {
        const a = (i / units.length) * Math.PI * 2;
        const at = this.spot(ev.x + Math.sin(a) * ev.r * (0.25 + (i % 3) * 0.2), ev.z + Math.cos(a) * ev.r * (0.25 + (i % 3) * 0.2), 2, a);
        this.spawn(ev, u, at.x, at.z, { aggro: false, transient: false, objective: true });
      });
      ev.until = this.overrun.get(ev.site.id)?.until ?? time + OVERRUN;
    }
    ev.next = time + 6;
    this.sim.emit({ k: 'evgo', at: new THREE.Vector3(ev.x, 0, ev.z), id: ev.id, name: ev.name, tier: ev.tier });
  }

  // The war-walker sets out from the far end of its road with its couplings round it (more of them
  // the more defenders there are; its hull toughens as any enemy's does, with the crowd fighting
  // it). While any coupling holds, nothing gets through to the hull.
  raiseWalker(ev, extra) {
    const T = ev.T;
    const [x, z] = ev.route.points[0];
    const w = this.spawn(ev, { type: 'warwalker', opts: {} }, x, z, { aggro: false, transient: false, objective: true, name: 'Synth War-walker' });
    ev.walker = w;
    this.lead(ev, w, new RouteFollower(ev.route.points, { speed: T.speed, canStand: (px, pz) => this.world.standable(px, pz) && !this.world.isWater(px, pz) }));
    const n = T.couplings + extra;
    for (let i = 0; i < n; i++) {
      const c = this.spawn(ev, { type: 'walkercoupling', opts: {} }, x, z, { aggro: false, transient: false, objective: true });
      c.ring = (i / n) * Math.PI * 2;
      ev.couplings.push(c);
    }
    this.carryCouplings(ev);
    // They never go home to mend: home is wherever the road has got to, and giving up the fight
    // there would let the crowd rule start their health over (EnemySim.leash, then 'idle').
    for (const e of [w, ...ev.couplings]) e.leash = () => {};
    // Screens show the shield (no damage numbers, the ward) while it holds (EnemySim.immune).
    w.immune = true;
    const hit = w.applyHit.bind(w);
    let tell = -Infinity;
    w.applyHit = (h) => {
      if (!w.alive || !ev.couplings.some((c) => c.alive)) return hit(h);
      // Shielded by its couplings: it remembers who tried.
      if (h.by !== null && h.by !== undefined) w.threat.set(h.by, (w.threat.get(h.by) ?? 0) + h.damage * 0.5);
      if (this.time - tell > IMMUNE_TELL) {
        tell = this.time;
        this.sim.emit({ k: 'rimm', id: w.id, at: w.position });
      }
      return false;
    };
  }

  // The couplings ride round the hull, turning with it.
  carryCouplings(ev) {
    const w = ev.walker;
    const y = this.world.groundHeight(w.position.x, w.position.z);
    for (const c of ev.couplings) {
      if (!c.alive) continue;
      const a = w.facing + c.ring;
      c.velocity.set(0, 0, 0);
      c.position.set(w.position.x + Math.sin(a) * COUPLING_RING, y + c.alt, w.position.z + Math.cos(a) * COUPLING_RING);
      c.home?.copy(c.position);
    }
  }

  // Somewhere for a pylon: `d` out along `a` from the heart, nudged off anything in the way.
  clear(ev, a, d) {
    const w = this.world;
    for (const k of [1, 0.7, 1.25, 0.5, 1.5]) {
      for (const da of [0, 0.35, -0.35]) {
        const x = ev.x + Math.sin(a + da) * d * k;
        const z = ev.z + Math.cos(a + da) * d * k;
        if (!w.standable(x, z)) continue;
        if (!w.blocks?.(_at.set(x, w.groundHeight(x, z) + 1, z))) return { x, z };
      }
    }
    return { x: ev.x + Math.sin(a) * d, z: ev.z + Math.cos(a) * d };
  }

  structure(ev, id, kind, at, hits) {
    const y = this.world.groundHeight(at.x, at.z);
    const max = Math.round(enemyDamage(14, ev.level) * hits);
    return {
      id, kind, event: ev, structure: true, x: at.x, z: at.z, position: new THREE.Vector3(at.x, y, at.z), velocity: new THREE.Vector3(),
      radius: kind === 'beacon' ? 1.2 : 0.8, height: kind === 'beacon' ? 4 : 3, alive: true, hp: max, max,
    };
  }

  // An enemy for an event: its level and race, elites with the tier's extra affixes. `aggro`: sent
  // straight at what it's out to destroy.
  spawn(ev, u, x, z, { aggro = true, transient = true, objective = false, name = null } = {}) {
    const champion = !!u.opts.champion;
    const affixes = u.opts.elite ? rollAffixes(ev.race, affixCount(ev.level, champion) + ev.tier) : null;
    const e = this.sim.spawnEnemy(u.type, new THREE.Vector3(x, 0, z), {
      level: ev.level, camp: ev, elite: u.opts.elite, champion, variant: u.opts.variant, affixes, transient, name: name ?? u.opts.name ?? null,
    });
    ev.enemies.push(e);
    if (objective) ev.foes.push(e);
    if (e.name) ev.named.push(e.name);
    if (aggro) e.aggro(true, this.targetFor(ev, e));
    return e;
  }

  // What an attacker goes for first: the nearest thing standing to defend, else the nearest player.
  targetFor(ev, e) {
    let best = null;
    let bd = Infinity;
    for (const s of ev.structures) {
      if (!s.alive) continue;
      const d = Math.hypot(s.x - e.position.x, s.z - e.position.z);
      if (d < bd) { bd = d; best = s; }
    }
    if (best) return best;
    for (const p of this.live()) {
      const d = p.position.distanceTo(e.position);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  // An enemy's blow landing on a thing to defend (EnemySim.release): in reach, it counts.
  strike(s, e, a) {
    if (!s.alive || !a?.damage) return;
    const d = Math.hypot(s.x - e.position.x, s.z - e.position.z);
    if (d > (a.range ?? 2) + s.radius + e.radius + 0.6) return;
    // Shells are made for walls; a burst lands every round.
    const hits = a.kind === 'lob' ? 2.5 * (a.count ?? 1) : a.kind === 'burst' ? Math.min(3, a.count ?? 1) : 1;
    s.hp = Math.max(0, s.hp - a.damage * hits);
    if (s.hp > 0) return;
    s.alive = false;
    this.sim.emit({ k: 'evfall', at: s.position, p: [round(s.x), round(s.position.y), round(s.z)], id: s.event.id, sid: s.id, kind: s.kind });
    for (const x of this.sim.enemies) if (x.foe === s) x.retargetT = 0;
  }

  // Who's taking part: alive, within the area (and a little more).
  present(ev) {
    return this.live().filter((p) => Math.hypot(p.position.x - ev.x, p.position.z - ev.z) <= ev.r + AREA_PAD);
  }

  person(ev, id) {
    let p = ev.people.get(id);
    if (!p) ev.people.set(id, (p = { c: 0, seen: -Infinity }));
    return p;
  }

  // A kill among the event's enemies: the damage each player dealt is their share in it (an
  // enemy's whole health is worth 100 points, whatever its level).
  onKilled(e) {
    const ev = e.camp;
    if (!ev?.structures || ev.stage !== 'active') return;
    ev.xp += e.type.xp * e.level;
    for (const [id, dmg] of e.credit) this.person(ev, id).c += (100 * dmg) / Math.max(1, e.maxHp);
  }

  updateEvent(ev, dt) {
    const time = this.time;
    ev.enemies = ev.enemies.filter((e) => !e.gone);
    let near = Infinity;
    for (const p of this.sim.players) near = Math.min(near, Math.hypot(p.position.x - ev.x, p.position.z - ev.z));
    ev.near = near;
    if (ev.stage === 'gather') {
      if (time >= ev.until) this.activate(ev);
      return;
    }
    if (ev.stage === 'over') {
      if (time >= ev.until) this.remove(ev);
      return;
    }
    // Under way: what it leads moves on (and the event with it); who's here (a point a second
    // each), how many to scale to.
    const moved = this.moveLead(ev, dt);
    const here = this.present(ev);
    for (const p of here) {
      const who = this.person(ev, p.id);
      who.c += dt;
      who.seen = time;
    }
    let n = 0;
    for (const who of ev.people.values()) if (time - who.seen < 5) n++;
    n = Math.max(1, n);
    if (n > ev.n) {
      // More defenders came: what they defend toughens to match.
      const k = (1 + 0.3 * (n - 1)) / (1 + 0.3 * (ev.n - 1));
      for (const s of ev.structures) { s.max = Math.round(s.max * k); s.hp = Math.round(s.hp * k); }
      ev.n = n;
    }
    // Nobody left within reach: a settlement falls, an anomaly fades, a walker turns back (nobody
    // saw it come), a garrison stays put. Someone waiting for a walker at the settlement it's
    // coming for is still there for it.
    let guard = Infinity;
    if (ev.T.walker) for (const p of this.sim.players) guard = Math.min(guard, Math.hypot(p.position.x - ev.site.x, p.position.z - ev.site.z));
    if (Math.min(near, guard) > ABANDON.reach && ev.type !== 'retake') {
      if ((ev.idle += dt) > ABANDON.after) {
        if (ev.T.walker) this.recall(ev);
        this.finish(ev, false, ev.T.settlement && !ev.T.walker ? 'lost' : 'faded');
        return;
      }
    } else ev.idle = 0;
    this.stragglers(ev, dt, time);
    switch (ev.type) {
      case 'surge': this.updateSurge(ev, time); break;
      case 'siege': this.updateSiege(ev, time); break;
      case 'anomaly': this.updateAnomaly(ev, time, dt); break;
      case 'retake': this.updateRetake(ev, time); break;
      case 'walker': this.updateWalker(ev, time, moved); break;
    }
  }

  // ================================================================ what moves
  // An event can lead something along a route (sim/Routes.js RouteFollower): a structure to defend
  // or an enemy to stop. Each tick it's set down where the follower's got to, on the ground and
  // facing the way it goes, and the event's area goes with it — so who's told of it, who's taking
  // part and who's straggling all follow it across the world.
  lead(ev, body, follower) {
    ev.lead = { body, follower };
    this.placeLead(ev);
  }

  // → the follower's 'moving', 'arrived' or 'stuck'; null with nothing to lead.
  moveLead(ev, dt) {
    if (!ev.lead) return null;
    const status = ev.lead.follower.step(dt);
    this.placeLead(ev);
    return status;
  }

  placeLead(ev) {
    const { body, follower: f } = ev.lead;
    const y = this.world.groundHeight(f.x, f.z);
    if (body.structure) {
      body.x = f.x;
      body.z = f.z;
    } else {
      // An enemy's own legs never take it anywhere: home is wherever it's got to. It faces the
      // way it goes, except while it's turned to strike, and its velocity is the follower's pace
      // (what screens stride its legs by; the next tick sets it down here again regardless).
      const v = f.status === 'moving' ? f.speed : 0;
      body.velocity.set(Math.sin(f.heading) * v, 0, Math.cos(f.heading) * v);
      body.home?.set(f.x, y, f.z);
      if (body.state !== 'windup' && body.state !== 'attack') body.facing = f.heading;
    }
    body.position.set(f.x, y, f.z);
    ev.x = f.x;
    ev.z = f.z;
  }

  standing(ev) { return ev.structures.filter((s) => s.alive).length; }
  aliveFoes(ev) { return ev.foes.filter((e) => e.alive).length; }
  // Wave enemies still up (not the objectives, nor what hatched).
  aliveWave(ev) { return ev.enemies.filter((e) => e.alive && e.wave).length; }
  aliveAll(ev) { return ev.enemies.filter((e) => e.alive).length; }

  // Spore pods hatch drones while they live; waves march in; hold the pylons till it's done.
  updateSurge(ev, time) {
    if (!this.standing(ev)) { this.finish(ev, false, 'lost'); return; }
    for (const pod of ev.foes) {
      if (!pod.alive || time < pod.hatchAt || this.aliveAll(ev) >= MAX_FOES) continue;
      pod.hatchAt = time + ev.T.hatch;
      const n = 1 + Math.floor(ev.n / 3);
      for (let i = 0; i < n; i++) {
        const at = this.spot(pod.position.x, pod.position.z, 2.5, this.rng() * Math.PI * 2);
        this.spawn(ev, { type: 'drone', opts: {} }, at.x, at.z);
      }
      this.sim.emit({ k: 'hatch', at: pod.position, id: pod.id });
    }
    this.waves(ev, time);
    if (ev.wave >= ev.waves && !this.aliveWave(ev) && !this.aliveFoes(ev)) this.finish(ev, true);
  }

  // The engines shell the defences till they're broken; then the crews' friends come to finish it.
  updateSiege(ev, time) {
    if (!this.standing(ev)) { this.finish(ev, false, 'lost'); return; }
    if (ev.phase === 'engines') {
      if (this.aliveFoes(ev)) return;
      ev.phase = 'hold';
      ev.next = time + 6;
      this.sim.emit({ k: 'evstep', at: new THREE.Vector3(ev.x, 0, ev.z), id: ev.id, text: 'The engines are down — hold off what comes next' });
      return;
    }
    this.waves(ev, time);
    if (ev.wave >= ev.waves && !this.aliveWave(ev)) this.finish(ev, true);
  }

  // The beacon charges while someone stands by it and no guardian does; the rift keeps pouring.
  updateAnomaly(ev, time, dt) {
    const beacon = ev.structures[0];
    if (!beacon?.alive) { this.finish(ev, false, 'lost'); return; }
    const by = this.live().filter((p) => Math.hypot(p.position.x - ev.bx, p.position.z - ev.bz) < 12).length;
    ev.contested = ev.enemies.some((e) => e.alive && Math.hypot(e.position.x - ev.bx, e.position.z - ev.bz) < 8);
    if (by && !ev.contested) ev.charge = Math.min(1, ev.charge + (dt / ev.T.charge) * Math.min(1.6, 1 + 0.15 * (by - 1)));
    if (!ev.warden && ev.charge >= 0.5) {
      ev.warden = true;
      const at = this.spot(ev.rx, ev.rz, 2, 0);
      this.spawn(ev, { type: 'bulwark', opts: { elite: true, variant: ev.level >= 6 ? 'siege' : null } }, at.x, at.z, { name: 'Maker Warden' });
      this.sim.emit({ k: 'evstep', at: new THREE.Vector3(ev.x, 0, ev.z), id: ev.id, text: 'A Maker Warden steps out of the rift' });
    }
    if (time >= ev.next && this.aliveAll(ev) < MAX_FOES) {
      ev.next = time + ev.T.gap;
      this.wave(ev, ev.charge > 0.85);
    }
    if (ev.charge >= 1) this.finish(ev, true);
  }

  // The walker comes on down the road, its escorts dropping off behind it as it goes. Brought
  // down, it's won (even on the step it would have arrived); arrived, the settlement falls;
  // stuck, it turns back.
  updateWalker(ev, time, moved) {
    const w = ev.walker;
    if (!w.alive) { this.finish(ev, true); return; }
    this.carryCouplings(ev);
    if (!ev.unshielded && !ev.couplings.some((c) => c.alive)) {
      ev.unshielded = true;
      w.immune = false;
      this.sim.emit({ k: 'shield', id: w.id, at: w.position });
      this.sim.emit({ k: 'evstep', at: new THREE.Vector3(ev.x, 0, ev.z), id: ev.id, text: 'The war-walker\'s shield is down — bring it down!' });
    }
    if (moved === 'arrived' || moved === 'stuck') {
      this.recall(ev);
      this.finish(ev, false, moved === 'arrived' ? 'lost' : 'faded');
      return;
    }
    if (time >= ev.next && this.aliveAll(ev) < MAX_FOES) {
      ev.next = time + ev.T.gap;
      this.wave(ev, false);
    }
  }

  // The walker, its couplings and its escort go (it broke through, or turned back).
  recall(ev) {
    for (const e of ev.enemies) if (e.alive) e.dissolve();
  }

  updateRetake(ev, time) {
    if (!this.aliveFoes(ev)) { this.finish(ev, true); return; }
    if (time >= ev.until) this.finish(ev, false, 'faded');
  }

  // Attackers who've wandered off from the fight (stuck, or chasing someone long gone) give up
  // after a while; and once the last wave's been out a minute, a couple left over break and run —
  // so a straggler can't hold an event open.
  stragglers(ev, dt, time) {
    const last = ev.waves && ev.wave >= ev.waves && time - ev.lastWave > STRAGGLE.rout;
    const left = last ? this.aliveWave(ev) : Infinity;
    for (const e of ev.enemies) {
      if (!e.alive || !e.wave) continue;
      const far = Math.hypot(e.position.x - ev.x, e.position.z - ev.z) > ev.r + STRAGGLE.far;
      const fighting = e.foe && !e.foe.structure && e.foe.alive && e.dist2(e.foe) < 20;
      e.away = far && !fighting ? (e.away ?? 0) + dt : 0;
      if (e.away > STRAGGLE.after || left <= 2) e.dissolve();
    }
  }

  // The next wave when it's due — and the last one's mostly down, or it's been a while.
  waves(ev, time) {
    if (ev.wave >= ev.waves || time < ev.next) return;
    if (this.aliveWave(ev) > 3 && time - ev.lastWave < 40) return;
    ev.wave++;
    ev.lastWave = time;
    ev.next = time + ev.T.gap;
    this.wave(ev, ev.wave === ev.waves);
  }

  // A wave, sized to the defenders, from beyond the edge (an anomaly's from its rift), at whatever
  // stands to be defended. The last is led by elites (a siege's by its captain).
  wave(ev, last) {
    const size = Math.round(ev.T.wave * Math.min(4, 1 + 0.4 * (ev.n - 1)));
    const units = eventWave(ev.race, ev.level, this.rng, size, last ? 1 + Math.floor(ev.n / 4) : 0, last && ev.level >= 12);
    let ox;
    let oz;
    let spread;
    if (ev.T.beacon) { ox = ev.rx; oz = ev.rz; spread = 0.6; } else if (ev.T.walker) {
      // A walker's escort drops off behind it, on the road it came by.
      const f = ev.lead.follower;
      const back = f.at(Math.max(0, f.d - 8));
      ox = back.x;
      oz = back.z;
      spread = 0.25;
    } else {
      // Settlement events come from the side their pods or engines are on, else from anywhere.
      const from = ev.foes.find((e) => e.alive) ?? null;
      const a = from ? Math.atan2(from.position.x - ev.x, from.position.z - ev.z) : this.rng() * Math.PI * 2;
      ox = ev.x + Math.sin(a) * (ev.r + 18);
      oz = ev.z + Math.cos(a) * (ev.r + 18);
      spread = 0.25;
    }
    const base = Math.atan2(ox - ev.x, oz - ev.z);
    units.forEach((u, i) => {
      const a = base + (i - (units.length - 1) / 2) * spread * 0.2;
      const at = this.spot(ox + Math.sin(a) * (i % 4), oz + Math.cos(a) * (i % 4), 1.5, a);
      const name = last && i === 0 && ev.type === 'siege' ? 'Siege Captain' : null;
      const e = this.spawn(ev, u, at.x, at.z, { name });
      e.wave = true;
    });
    this.sim.emit({ k: 'wave', at: new THREE.Vector3(ev.x, 0, ev.z), name: ev.place, n: units.length, wave: ev.wave || undefined, of: ev.waves || undefined });
  }

  // ================================================================ the end of it
  // `why`: 'lost' (a settlement falls, an anomaly's beacon is destroyed) or 'faded' (nobody came,
  // or a garrison moved on).
  finish(ev, won, why = 'lost') {
    const time = this.time;
    ev.stage = 'over';
    ev.until = time + OVER;
    ev.res = won ? 'won' : why;
    const list = [...ev.people].map(([id, p]) => ({ id, points: Math.round(p.c) }));
    const best = list.reduce((m, p) => Math.max(m, p.points), 0);
    const people = won ? list.filter((p) => p.points >= ELIGIBLE).map((p) => ({ ...p, top: p.points >= best * 0.5, lead: p.points === best && list.length >= 3 })) : [];
    ev.result = { won, people };
    for (const p of this.sim.players) if (Math.hypot(p.position.x - ev.x, p.position.z - ev.z) < 500) this.last.set(p.id, time);
    // What's left of a beaten attack melts away; the objectives of a lost one stay till it's gone.
    if (won) for (const e of ev.enemies) if (e.alive) e.dissolve();
    this.sim.emit({ k: 'evend', at: new THREE.Vector3(ev.x, 0, ev.z), id: ev.id, name: ev.name, res: ev.res });
    this.sim.host.onEventEnd?.(ev);
    if (ev.type === 'retake') this.free(ev.site.id);
    else if (!won && ev.T.settlement && why === 'lost') this.fall(ev);
  }

  // A settlement lost: overrun for a while, and a Retake begins at once.
  fall(ev) {
    const p = ev.site;
    this.overrun.set(p.id, { id: p.id, x: p.x, z: p.z, r: reach(p), name: ev.place, race: ev.race, until: this.time + OVERRUN });
    this.sim.host.onOverrun?.(p, true);
    this.start({ poi: p, type: 'retake', level: ev.level, race: ev.race, tier: ev.tier });
  }

  free(id) {
    if (!this.overrun.delete(id)) return;
    this.sim.host.onOverrun?.(this.world.poiById?.(id) ?? { id }, false);
  }

  remove(ev) {
    for (const e of ev.enemies) {
      if (e.gone) continue;
      // Anyone still fighting is let go when they give up; the rest go now.
      if (e.alive && e.engaged && e.foe && !e.foe.structure) e.transient = true;
      else this.sim.removeEnemy(e);
    }
    for (const s of ev.structures) {
      s.alive = false;
      this.sim.tokens.delete(s.id);
    }
    this.events.delete(ev.id);
  }

  // Dev tools and admins: an event of `type` at the nearest place that suits it (within 400 m),
  // else right here.
  startNear(x, z, type, level = null) {
    const T = EVENT_TYPES[type];
    if (!T || type === 'retake') return null;
    const kinds = T.settlement ? ['hamlet', 'settlement', 'town'] : ['landmark', 'ruin'];
    const free = this.world.poisNear(x, z, 400, kinds).filter((p) => !this.overrun.has(p.id) && !this.eventNear(p.x, p.z, 1));
    free.sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z));
    const poi = free[0] ?? { id: `here:${Math.round(x)},${Math.round(z)}`, type: T.settlement ? 'hamlet' : 'ruin', x, z, r: 14, rot: 0, name: T.settlement ? 'the camp' : null };
    const region = this.world.regionAt(poi.x, poi.z);
    return this.start({ poi, type, level: level ?? poi.level ?? region.level, race: T.race ?? region.race });
  }

  // A quest's step calls for an event at a place (rpg/questWatch.js eventCalled): it starts at
  // once, its tier locked at Normal (no vote), whatever the director's spacing (quiet, gap, cap,
  // the site's rest). One already running there is the one (whoever started it); a place overrun
  // has to be retaken first. Returns the event, or null.
  startStory(siteId, type) {
    const T = EVENT_TYPES[type];
    if (!T || type === 'retake' || !siteId || this.overrun.has(siteId)) return null;
    for (const ev of this.events.values()) if (ev.site.id === siteId && ev.stage !== 'over') return ev;
    const poi = this.world.poiById?.(siteId);
    if (!poi || PLACE_TYPES.has(poi.type) !== !!T.settlement) return null;
    const region = this.world.regionAt(poi.x, poi.z);
    return this.start({ poi, type, level: poi.level ?? region.level, race: T.race ?? region.race, tier: 0, locked: true, story: true });
  }

  // Dev tools: win or lose the event nearest (x, z) now.
  force(x, z, won) {
    let best = null;
    let bd = Infinity;
    for (const ev of this.events.values()) {
      if (ev.stage === 'over') continue;
      const d = Math.hypot(ev.x - x, ev.z - z);
      if (d < bd) { bd = d; best = ev; }
    }
    if (!best) return null;
    if (best.stage === 'gather') this.activate(best);
    if (won) for (const p of this.present(best)) this.person(best, p.id).c = Math.max(this.person(best, p.id).c, ELIGIBLE);
    this.finish(best, won, won ? 'lost' : best.T.settlement && best.type !== 'retake' ? 'lost' : 'faded');
    return best;
  }

  // ================================================================ the vote, and the tier
  // A vote at the beacon while it gathers (Normal 0, Veteran 1, Elite 2).
  vote(playerId, evId, tier) {
    const ev = this.events.get(evId);
    const p = this.sim.players.find((q) => q.id === playerId);
    if (!ev || ev.stage !== 'gather' || ev.locked || !p?.alive || ![0, 1, 2].includes(tier)) return false;
    if (Math.hypot(p.position.x - ev.bx, p.position.z - ev.bz) > VOTE_REACH) return false;
    ev.votes.set(playerId, tier);
    return true;
  }

  counts(ev) {
    const c = [0, 0, 0];
    for (const t of ev.votes.values()) c[t]++;
    return c;
  }

  // The most votes win; a tie goes to the lower tier, and so does no vote at all.
  tally(ev) {
    const c = this.counts(ev);
    let best = 0;
    for (let t = 1; t < 3; t++) if (c[t] > c[best]) best = t;
    return best;
  }

  // The tier that's a player's Threat while they're in an event under way, else null.
  tierFor(playerId, at = null) {
    const p = at ?? this.sim.players.find((q) => q.id === playerId)?.position;
    if (!p) return null;
    for (const ev of this.events.values()) {
      if (ev.stage === 'active' && Math.hypot(p.x - ev.x, p.z - ev.z) <= ev.r + TIER_PAD) return ev.tier;
    }
    return null;
  }

  // ================================================================ what players are told
  // The events a player at (x, z) should know of.
  near(x, z, range = ANNOUNCE + 250) {
    return [...this.events.values()].filter((ev) => Math.hypot(ev.x - x, ev.z - z) <= range);
  }

  // An event as screens show it (the same for everyone; `personal` adds one player's part).
  view(ev) {
    const time = this.time;
    const v = {
      id: ev.id, k: ev.type, nm: ev.name, pl: ev.place, st: ev.stage, x: round(ev.x), z: round(ev.z), r: Math.round(ev.r), lv: ev.level, ti: ev.tier,
      bx: round(ev.bx), bz: round(ev.bz), n: ev.n,
      tl: ev.stage === 'gather' || ev.stage === 'over' || ev.type === 'retake' ? Math.max(0, Math.ceil(ev.until - time)) : undefined,
      s: ev.structures.map((s) => [s.id, s.kind, round(s.x), round(s.z), Math.ceil(s.hp), s.max]),
    };
    if (ev.locked) v.lk = 1;
    else if (ev.stage === 'gather') v.v = this.counts(ev);
    if (ev.waves) v.w = [ev.wave, ev.waves];
    if (ev.foes.length) v.f = [this.aliveFoes(ev), ev.foes.length];
    if (ev.T.beacon) { v.c = Math.round(ev.charge * 1000) / 1000; v.rx = round(ev.rx); v.rz = round(ev.rz); if (ev.contested) v.ct = 1; }
    if (ev.walker) {
      const w = ev.walker;
      v.wk = [round(w.position.x), round(w.position.z), Math.max(0, Math.ceil(w.hp)), w.maxHp, ev.couplings.filter((c) => c.alive).length, ev.couplings.length, Math.round(ev.lead.follower.left)];
    }
    if (ev.phase) v.ph = ev.phase;
    if (ev.res) v.res = ev.res;
    return v;
  }

  // One player's part in it: [contribution points, their vote (or -1), a chest coming?].
  personal(ev, id) {
    const who = ev.people.get(id);
    const won = ev.result?.people.find((p) => p.id === id);
    return [Math.round(who?.c ?? 0), ev.votes.get(id) ?? -1, won ? (won.top ? 2 : 1) : 0];
  }

  overrunList() { return [...this.overrun.values()].map((o) => o.id); }
}
