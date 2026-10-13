// A dungeon on this screen (gameplay phase 5): the copy the character is in (sim/Dungeons.js), built
// where it stands in its pocket — its floors and walls in the world (world/Interior.js: online this
// screen builds its own; offline the local instance manager already has), drawn by
// world/InteriorKit.js — and everything about being down there: a loading screen on the way in, the
// light (the land hidden, fog and sky gone dark, the light by the theme's fixtures), the copy's
// state as it changes (the key found, power restored, doors opening, the bosses down), the things to
// use, the lift, the traps (each screen's own danger, like an enemy's shot: vents that burst, turrets
// that track you, spore pods), and the rooms seen so far for the minimap and the map.
import * as THREE from 'three';
import { DUNGEONS, THEMES, LIFT_SPEED, lockDay, lockKey } from './dungeons.js';
import { generateDungeon } from './DungeonGen.js';
import { Interior } from './Interior.js';
import { buildInterior } from './InteriorKit.js';
import { TIERS } from '../rpg/balance.js';
import { enemyDamage } from '../sim/enemyDefs.js';
import { dealDamage } from '../combat/Damage.js';
import { esc } from '../ui/cards.js';

// Trap damage is an enemy's at the copy's level (a Scav Cutter's slash is 13): a vent's burst
// stings about as much as one slash, a turret's shot half one, a spore pod's blast one and a half.
const VENT = { period: 4.6, warn: 1.1, burst: 1.3, r: 1.15, tick: 0.5, dmg: 5 };
const TURRET = { range: 22, every: 1.6, dmg: 7, speed: 24, warm: 0.8 };
const POD = { r: 2.4, warn: 0.7, regrow: 24, blast: 3.2, dmg: 20 };
const ELEMENT = { scav: 'fire', hive: 'corrosive', synth: 'shock', maker: 'frost', fauna: 'corrosive' };
const _v = new THREE.Vector3();
const _white = new THREE.Color(0xffffff);
const _w = new THREE.Vector3();

export class DungeonView {
  constructor(game) {
    this.game = game;
    this.run = null;        // the copy we're in: { id, d, tier, lv, sh, o, shared }
    this.interior = null;
    this.mesh = null;
    this.state = { open: [], key: false, nodes: [], mini: false, boss: false, cleared: [] };
    this.pending = new Map(); // run id → state that came before the copy was built
    this.looted = new Set();  // chests this character has opened in this copy
    this.seen = new Set();    // areas (rooms, then corridors) seen
    this.points = new Map();  // thing / door id → its world position (for prompts)
    this.trapState = new Map();
    this.liftWait = 0;
    this.saved = null;
  }

  get active() { return !!this.run; }
  get def() { return this.run ? DUNGEONS[this.run.d] : null; }
  get theme() { return this.run ? THEMES[this.def.theme] : null; }

  // ---------------------------------------------------------------- in and out
  // Going in (the 'dungeon' result of the character's 'enter'): a loading screen while the copy is
  // built, then stood at its entrance.
  enter(info, at, facing = 0) {
    const g = this.game;
    if (this.run) this.teardown();
    const def = DUNGEONS[info.d];
    if (!def) return;
    this.run = info;
    const veil = this.veil(`Entering ${def.name}…`);
    // (Let the loading screen paint before the building starts.)
    setTimeout(() => {
      try {
        this.build(info);
        this.arrive(at, facing);
        g.hud.banner(def.name, info.shared ? `Open world · Level ${info.lv}` : `${TIERS[info.tier ?? 0].name} run · Level ${info.lv}`);
        g.hud.setZone(def.name);
      } catch (err) {
        g.reportError(err);
      }
      setTimeout(() => this.lift(veil), 450);
    }, 40);
  }

  build(info) {
    const g = this.game;
    const def = DUNGEONS[info.d];
    const origin = { x: info.o[0], y: info.o[1], z: info.o[2] };
    // Offline the local instance manager has built it already; online this screen builds its own.
    let it = g.world.interiors.get(info.id);
    this.owned = !it;
    if (!it) it = g.world.addInterior(new Interior(generateDungeon(def, { shuffle: info.sh, level: info.lv }), origin, { id: info.id, dungeon: def.id, tier: info.tier }));
    this.interior = it;
    this.mesh = buildInterior(it);
    g.scene.add(this.mesh.root);
    this.looted.clear();
    this.seen.clear();
    this.trapState.clear();
    this.points.clear();
    const L = it.layout;
    for (const t of L.things) this.points.set(t.id, new THREE.Vector3(it.x0 + t.x, it.origin.y + t.floor, it.z0 + t.z));
    for (const d of L.doors) {
      const x = d.axis === 'x' ? d.line : (d.s0 + d.s1) / 2;
      const z = d.axis === 'x' ? (d.s0 + d.s1) / 2 : d.line;
      // A door's prompt from the side you come at it.
      const side = d.axis === 'x' ? [x - d.into * 1.6, z] : [x, z - d.into * 1.6];
      this.points.set(d.id, new THREE.Vector3(it.x0 + side[0], it.origin.y + d.floor, it.z0 + side[1]));
    }
    this.state = { open: [], key: false, nodes: [], mini: false, boss: false, cleared: [] };
    const early = this.pending.get(info.id);
    this.pending.clear();
    if (early) this.apply(early.st, true);
    this.indoors(true);
  }

  arrive(at, facing) {
    const g = this.game;
    const p = g.player;
    g.closeMenus();
    p.position.fromArray(at);
    p.position.y = g.world.supportHeight(at[0], at[2], at[1] + 2);
    p.velocity.set(0, 0, 0);
    p.vy = 0;
    p.facing = facing;
    g.rig.yaw = facing + Math.PI;
    g.rig.target.copy(p.position);
    g.encounters.disengageAll();
    g.effects.spawnRing(p.position.clone(), 3, this.theme.accent);
    g.audio.blink?.(p.position);
    g.save();
  }

  // Coming out (the 'outside' result of 'leave'): back where we went in.
  leave(at) {
    const g = this.game;
    const name = this.def?.name;
    const veil = this.veil('Back to the surface…');
    setTimeout(() => {
      this.teardown();
      const p = g.player;
      p.position.set(at[0], at[1], at[2]);
      g.world.prime(p.position);
      p.position.y = g.world.supportHeight(at[0], at[2], at[1] + 30);
      p.velocity.set(0, 0, 0);
      p.vy = 0;
      g.rig.target.copy(p.position);
      g.encounters.disengageAll();
      g.regionKey = null;
      g.zone = null;
      if (name) g.hud.toast(`Left ${name}`);
      g.save();
      setTimeout(() => this.lift(veil), 300);
    }, 40);
  }

  teardown() {
    const g = this.game;
    if (this.mesh) {
      g.scene.remove(this.mesh.root);
      this.mesh.root.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    }
    if (this.owned && this.interior) g.world.removeInterior(this.interior.id);
    this.mesh = null;
    this.interior = null;
    this.run = null;
    this.indoors(false);
  }

  // The loading screen on the way in or out.
  veil(text) {
    const el = document.createElement('div');
    el.className = 'dun-veil';
    el.innerHTML = `<p>${esc(text)}</p><div class="ld-bar"><i></i></div>`;
    document.body.appendChild(el);
    return el;
  }
  lift(el) {
    el.classList.add('done');
    setTimeout(() => el.remove(), 500);
  }

  // Down there: the land hidden, the sky and fog gone dark, light from the theme's fixtures (the
  // one moving light hangs over us).
  indoors(on) {
    const g = this.game;
    const w = g.world;
    const s = g.scene;
    if (on) {
      const T = this.theme;
      this.saved ??= {
        fogNear: s.fog.near, fogFar: s.fog.far, hemi: [w.hemi.color.clone(), w.hemi.groundColor.clone(), w.hemi.intensity],
        sun: [w.sun.color.clone(), w.sun.intensity], hub: [w.hubLight.position.clone(), w.hubLight.color.clone(), w.hubLight.intensity, w.hubLight.distance],
      };
      w.root.visible = false;
      if (g.grass?.mesh) g.grass.mesh.visible = false;
      s.background.set(T.fog);
      s.fog.color.set(T.fog);
      s.fog.near = 12;
      s.fog.far = 70;
      w.hemi.color.set(T.hemi[0]);
      w.hemi.groundColor.set(T.hemi[1]);
      w.hemi.intensity = T.hemiK;
      this.setSun(T.sun, T.sunK);
      w.hubLight.color.set(T.light).lerp(_white, 0.35);
      w.hubLight.intensity = 9;
      w.hubLight.distance = 20;
    } else if (this.saved) {
      const v = this.saved;
      this.saved = null;
      w.root.visible = true;
      if (g.grass?.mesh) g.grass.mesh.visible = true;
      s.fog.near = v.fogNear;
      s.fog.far = v.fogFar;
      w.hemi.color.copy(v.hemi[0]);
      w.hemi.groundColor.copy(v.hemi[1]);
      w.hemi.intensity = v.hemi[2];
      this.setSun(v.sun[0], v.sun[1]);
      w.hubLight.position.copy(v.hub[0]);
      w.hubLight.color.copy(v.hub[1]);
      w.hubLight.intensity = v.hub[2];
      w.hubLight.distance = v.hub[3];
      w.skyTimer = 0;
    }
  }
  setSun(color, k) {
    const w = this.game.world;
    w.sun.color.set(color);
    w.sun.intensity = k;
    for (const l of this.game.shadows?.csm?.lights ?? []) { l.color.set(color); l.intensity = k; }
  }

  // Where we come back after a fall: the copy's entrance hall.
  homePoint() {
    const it = this.interior;
    const s = it.layout.start;
    return { x: it.x0 + s.x, z: it.z0 + s.z, y: it.origin.y + s.floor, facing: s.facing, name: this.def.name };
  }

  // ---------------------------------------------------------------- the copy's state
  onState(msg) {
    if (!this.run || msg.id !== this.run.id || !this.interior) {
      this.pending.set(msg.id, msg);
      if (msg.say && this.run) this.game.hud.toast(msg.say);
      return;
    }
    this.apply(msg.st, false);
    if (msg.say) this.game.hud.toast(msg.say);
  }

  apply(st, instant) {
    if (!st) return;
    const it = this.interior;
    const before = this.state;
    this.state = { open: st.open ?? [], key: !!st.key, nodes: st.nodes ?? [], mini: !!st.mini, boss: !!st.boss, cleared: st.cleared ?? [], lift: st.lift ?? null };
    // This screen's own copy of the lift (online) settles where the keeper says it rests.
    const L = this.state.lift;
    if (L && this.owned && it.lift && L.y === L.to && Math.abs(it.lift.y - L.y) > 0.05) it.setLift(L.y);
    for (const id of this.state.open) {
      it.setDoor(id, true);
      const m = this.mesh?.doors.get(id);
      if (m && !m.open) { m.open = true; if (instant) m.t = 1; }
    }
    if (!instant && this.state.boss && !before.boss) this.game.audio.rune?.(this.game.player.position, 0.8);
  }

  // A chest opened (this character's 'dloot' / 'dchest').
  opened(id) {
    this.looted.add(id);
  }

  lockedOut() {
    const r = this.run;
    return !r || r.shared ? true : this.game.settings.lockouts?.[lockKey(r.d, r.tier ?? 0)] === lockDay();
  }

  // ---------------------------------------------------------------- things to use
  interactables() {
    const out = [];
    if (!this.run || !this.interior) return out;
    const L = this.interior.layout;
    const s = this.state;
    for (const t of L.things) {
      if ((t.kind === 'key' && s.key) || (t.kind === 'node' && s.nodes.includes(t.id))) continue;
      if (t.kind === 'exit' && !s.boss) continue;
      if (t.kind === 'reward' && (this.run.shared || !s.boss || this.looted.has(t.id) || this.lockedOut())) continue;
      if (t.kind === 'chest' && this.looted.has(t.id)) continue;
      out.push({ kind: 'dthing', id: t.id, t, name: t.kind, position: this.points.get(t.id) });
    }
    for (const d of L.doors) if (d.kind !== 'open' && !s.open.includes(d.id)) out.push({ kind: 'dthing', id: d.id, door: d, name: 'door', position: this.points.get(d.id) });
    // The lift, called from whichever end it isn't at.
    const lift = this.interior.lift;
    const rest = this.state.lift && this.state.lift.y === this.state.lift.to;
    if (lift && rest) {
      const c = lift.cor;
      const sh = c.shaft;
      const across = (c.axis === 'x' ? c.z : c.x) * L.cell + L.cell;
      for (const [end, u, y] of [['top', c.dir > 0 ? sh.u0 - 1.4 : sh.u1 + 1.4, sh.top], ['bottom', c.dir > 0 ? sh.u1 + 1.4 : sh.u0 - 1.4, sh.bottom]]) {
        if (Math.abs(lift.y - y) < 0.2) continue;
        const pos = (this.points.get(`lift:${end}`) ?? this.points.set(`lift:${end}`, new THREE.Vector3()).get(`lift:${end}`))
          .set(this.interior.x0 + (c.axis === 'x' ? u : across), this.interior.origin.y + y, this.interior.z0 + (c.axis === 'x' ? across : u));
        out.push({ kind: 'dthing', id: `lift:${end}`, lift: y, name: 'lift', position: pos });
      }
    }
    return out;
  }

  prompt(it) {
    const T = this.theme;
    const s = this.state;
    if (it.lift !== undefined) return 'Call the lift';
    if (it.door) {
      const d = it.door;
      if (d.kind === 'locked') return s.key ? 'Unlock the door' : `Locked — the ${T.key} is somewhere down here`;
      if (d.kind === 'power') return `Sealed — power ${s.nodes.length} / ${d.needs}: switch the power nodes on`;
      return `Sealed — ${this.def.mini.name} holds the way on`;
    }
    switch (it.t.kind) {
      case 'portal': return `Leave ${this.def.name}`;
      case 'exit': return 'Take the way out';
      case 'key': return `Take the ${T.key}`;
      case 'node': return 'Switch the power node on';
      case 'chest': return 'Open the chest';
      case 'reward': return `Open the reward chest (${TIERS[this.run.tier ?? 0].name})`;
      default: return 'Use';
    }
  }

  use(it) {
    const g = this.game;
    if (it.lift !== undefined) { this.send(it.id); return; }
    if (it.door) {
      if (it.door.kind === 'locked' && this.state.key) this.send(it.id);
      else g.hud.toast(this.prompt(it));
      return;
    }
    const kind = it.t.kind;
    if (kind === 'portal' || kind === 'exit') g.charLink.do({ op: 'leave' });
    else if (kind === 'chest') g.charLink.do({ op: 'dloot', id: it.id });
    else if (kind === 'reward') g.charLink.do({ op: 'dchest', id: it.id });
    else this.send(it.id);
  }

  // Something used, told to whoever keeps the copy (the server, or the local manager offline).
  send(id) {
    const g = this.game;
    if (g.net.inWorld) g.net.send({ t: 'dun', id });
    else g.enemyLayer.dungeons?.use(0, id, g.player.position, 'You');
  }

  // ---------------------------------------------------------------- every frame
  update(dt) {
    if (!this.run || !this.interior || !this.mesh) return;
    const g = this.game;
    const it = this.interior;
    const p = g.player.position;
    // The light over us.
    g.world.hubLight.position.set(p.x, p.y + 3.4, p.z);
    // Doors slide open into the walls.
    for (const m of this.mesh.doors.values()) {
      if (!m.open || m.t >= 1) continue;
      m.t = Math.min(1, m.t + dt / 0.9);
      const k = m.t * m.t * (3 - 2 * m.t);
      for (const h of m.halves) h.g.position.x = h.s * (m.span / 4 + k * (m.span / 2 - 0.1));
      m.sign.visible = m.t < 0.5;
    }
    // Power cells lit as the nodes come on.
    for (const m of this.mesh.doors.values()) {
      if (m.d.kind !== 'power') continue;
      m.sign.children.forEach((c, i) => { c.visible = true; c.scale.setScalar(i < this.state.nodes.length ? 1.25 : 1); });
    }
    // Things: the portals turn, the key bobs, the reward glints; what's taken or opened shows it.
    const time = g.time;
    for (const [id, m] of this.mesh.things) {
      const kind = m.t.kind;
      if (m.parts.spin) m.parts.spin.rotation[kind === 'portal' || kind === 'exit' ? 'z' : 'y'] = time * (kind === 'key' ? 1.6 : 0.9);
      if (kind === 'key') { m.parts.off.visible = !this.state.key; if (m.parts.spin) m.parts.spin.position.y = 1.75 + Math.sin(time * 2) * 0.12; }
      if (kind === 'node') { const on = this.state.nodes.includes(id); m.parts.on.visible = on; m.parts.off.visible = !on; }
      if (kind === 'exit') m.group.visible = this.state.boss;
      if (kind === 'reward') { m.group.visible = !this.run.shared; m.parts.on.visible = this.state.boss && !this.looted.has(id) && !this.lockedOut(); }
      if ((kind === 'chest' || kind === 'reward') && m.parts.lid) m.parts.lid.rotation.x += ((this.looted.has(id) ? -1.4 : 0) - m.parts.lid.rotation.x) * Math.min(1, dt * 6);
    }
    this.updateLift(dt);
    this.updateTraps(dt);
    // The rooms seen: where we stand, and the next ones along open ways.
    const k = it.areaIndex(p.x - it.x0, p.z - it.z0);
    if (k >= 0 && !this.seen.has(k)) this.see(k);
  }

  see(k) {
    const L = this.interior.layout;
    const nR = L.rooms.length;
    this.seen.add(k);
    // A room shows the corridors leading out of it; a corridor the rooms at its ends.
    if (k < nR) for (const o of L.openings) { if (o.room === k) this.seen.add(nR + o.cor); }
    else { const c = L.cors[k - nR]; this.seen.add(c.a); this.seen.add(c.b); }
  }

  // The lift is the copy's (sim/Dungeons.js moves it, so everyone in there sees one platform):
  // standing on it at rest a moment asks it to go; online, this screen rides its own copy of the
  // platform after the keeper's word (offline the local keeper moves this very one).
  updateLift(dt) {
    const it = this.interior;
    const lift = it.lift;
    const L = this.state.lift;
    if (!lift || !L) return;
    const p = this.game.player.position;
    const on = it.inShaft(p.x - it.x0, p.z - it.z0) && Math.abs(p.y - (it.origin.y + lift.y)) < 1.5;
    if (on && L.y === L.to) {
      this.liftWait += dt;
      if (this.liftWait > 0.9) { this.liftWait = -2; this.send('lift'); }
    } else if (!on) this.liftWait = Math.min(0, this.liftWait + dt);
    if (this.owned) {
      const d = L.to - lift.y;
      if (Math.abs(d) > 1e-3) it.setLift(Math.abs(d) <= LIFT_SPEED * dt ? L.to : lift.y + Math.sign(d) * LIFT_SPEED * dt);
    }
    if (this.mesh.lift) this.mesh.lift.group.position.y = lift.y;
  }

  // Traps: each screen's own danger, like an enemy's shot is.
  updateTraps(dt) {
    const g = this.game;
    const it = this.interior;
    const L = it.layout;
    const T = this.theme;
    const me = g.player;
    if (!me.alive) return;
    const p = me.position;
    const el = ELEMENT[L.theme];
    const lv = this.run.lv;
    for (const x of L.traps) {
      const m = this.mesh.traps.get(x.id);
      const wx = it.x0 + x.x;
      const wz = it.z0 + x.z;
      const wy = it.origin.y + x.floor;
      const d = Math.hypot(p.x - wx, p.z - wz);
      if (d > 40) continue;
      let st = this.trapState.get(x.id);
      if (!st) this.trapState.set(x.id, (st = { cd: 0, t: 0, gone: 0 }));
      if (x.kind === 'vent') {
        // Glows, then bursts, on a cycle of its own.
        const c = (g.time + x.phase) % VENT.period;
        const burst = c > VENT.period - VENT.burst;
        const warn = !burst && c > VENT.period - VENT.burst - VENT.warn;
        m.part.glow.visible = burst || (warn && Math.floor(c * 8) % 2 === 0);
        m.part.plume.visible = burst;
        if (burst) m.part.plume.scale.set(1, 0.6 + Math.random() * 0.5, 1);
        st.cd -= dt;
        if (burst && d < VENT.r + me.radius && Math.abs(p.y - wy) < 2 && st.cd <= 0) {
          st.cd = VENT.tick;
          this.hurt(enemyDamage(VENT.dmg, lv), el, _v.set(wx, wy, wz));
        }
      } else if (x.kind === 'turret') {
        // Tracks you while it can see you, and fires — until its room is cleared: then it slumps.
        if (this.state.cleared.includes(x.area)) {
          m.part.head.rotation.x += (0.45 - m.part.head.rotation.x) * Math.min(1, dt * 3);
          continue;
        }
        const sees = d < TURRET.range && Math.abs(p.y - wy) < 6 && it.nav.sees(x.x, x.z, p.x - it.x0, p.z - it.z0);
        const want = sees ? Math.atan2(p.x - wx, p.z - wz) - (x.facing ?? 0) : 0;
        const head = m.part.head;
        let dr = Math.atan2(Math.sin(want - head.rotation.y), Math.cos(want - head.rotation.y));
        head.rotation.y += Math.sign(dr) * Math.min(Math.abs(dr), dt * 2.6);
        st.t = sees ? st.t + dt : 0;
        st.cd -= dt;
        dr = Math.atan2(Math.sin(want - head.rotation.y), Math.cos(want - head.rotation.y));
        if (sees && st.t > TURRET.warm && st.cd <= 0 && Math.abs(dr) < 0.25) {
          st.cd = TURRET.every;
          const a = (x.facing ?? 0) + head.rotation.y;
          const o = [wx + Math.sin(a) * 1.2, wy + 1.45, wz + Math.cos(a) * 1.2];
          _w.set(p.x, p.y + 1.1, p.z).sub(_v.fromArray(o)).normalize();
          g.enemyLayer.shot({ o, d: [_w.x, _w.y, _w.z], sp: TURRET.speed, dmg: enemyDamage(TURRET.dmg, lv), proj: 'energy', el: el === 'corrosive' ? null : el, m: true, life: 1.4 }, null);
        }
      } else if (x.kind === 'pod') {
        // Swells when you come close, then bursts; grows back a while later.
        if (st.gone > 0) {
          st.gone -= dt;
          m.part.sac.visible = st.gone <= 0;
          if (st.gone <= 0) m.part.sac.scale.setScalar(1);
          continue;
        }
        if (st.t > 0 || d < POD.r) {
          st.t += dt;
          m.part.sac.scale.setScalar(1 + st.t * 0.6);
          if (st.t >= POD.warn) {
            st.t = 0;
            st.gone = POD.regrow;
            m.part.sac.visible = false;
            g.explode(_v.set(wx, wy + 0.6, wz).clone(), POD.blast, enemyDamage(POD.dmg, lv), this.attacker(_v), null, { color: L.theme === 'hive' ? T.glow : 0xb6f04a, knockback: 5, scaled: true, element: 'corrosive', inflict: 'corrosive' });
          }
        } else m.part.sac.scale.setScalar(1 + Math.sin(g.time * 3 + x.phase) * 0.04);
      }
    }
  }

  attacker(at) {
    return { faction: 'enemy', damageMultiplier: 1, critBonus: 0, position: at.clone(), radius: 0.5, height: 1, alive: true, remote: false, level: this.run.lv };
  }

  hurt(damage, element, at) {
    const g = this.game;
    dealDamage(g, { attacker: this.attacker(at), target: g.player, base: damage, scaled: true, element, inflict: element, source: 'explosion', knockback: 2, direction: _w.subVectors(g.player.position, at).setY(0).normalize() });
  }

  // What the dungeon asks of you next, for the compass and the maps: the key while a locked door
  // stands between you and the boss, the power nodes while the power door does, then the boss's
  // hall, and once the boss is down the way out.
  waypoint() {
    const it = this.interior;
    if (!it) return null;
    const L = it.layout;
    const s = this.state;
    const p = this.game.player.position;
    const at = (x, z, radius = 2.5) => ({ x: it.x0 + x, z: it.z0 + z, radius });
    const nearest = (list) => list.sort((a, b) => Math.hypot(it.x0 + a.x - p.x, it.z0 + a.z - p.z) - Math.hypot(it.x0 + b.x - p.x, it.z0 + b.z - p.z))[0];
    const locked = L.doors.find((d) => d.kind === 'locked' && !s.open.includes(d.id));
    if (locked && !s.key) { const k = L.things.find((t) => t.kind === 'key'); if (k) return at(k.x, k.z); }
    if (locked && s.key) return at(locked.axis === 'x' ? locked.line : (locked.s0 + locked.s1) / 2, locked.axis === 'x' ? (locked.s0 + locked.s1) / 2 : locked.line);
    const power = L.doors.find((d) => d.kind === 'power' && !s.open.includes(d.id));
    if (power) { const n = nearest(L.things.filter((t) => t.kind === 'node' && !s.nodes.includes(t.id))); if (n) return at(n.x, n.z); }
    if (!s.boss) {
      const r = L.rooms[s.mini ? L.boss : L.mini];
      return at((r.x + r.w / 2) * L.cell, (r.z + r.h / 2) * L.cell, Math.min(r.w, r.h) * L.cell * 0.4);
    }
    const out = L.things.find((t) => t.kind === 'exit');
    return out ? at(out.x, out.z) : null;
  }

  // ---------------------------------------------------------------- maps
  // The rooms seen so far, in world units (the minimap draws in world space).
  drawRooms(ctx, px = 1) {
    const it = this.interior;
    if (!it) return;
    const L = it.layout;
    const c = L.cell;
    const nR = L.rooms.length;
    const areas = [...L.rooms, ...L.cors];
    ctx.lineWidth = 1.4 * px;
    areas.forEach((a, k) => {
      if (!this.seen.has(k)) return;
      const here = k < nR && this.state.cleared.includes(k);
      ctx.fillStyle = k < nR ? (a.kind === 'boss' ? 'rgba(200,70,60,0.55)' : here ? 'rgba(120,130,150,0.5)' : 'rgba(150,170,200,0.55)') : 'rgba(130,150,180,0.45)';
      ctx.fillRect(it.x0 + a.x * c, it.z0 + a.z * c, a.w * c, a.h * c);
      ctx.strokeStyle = 'rgba(220,235,255,0.8)';
      ctx.strokeRect(it.x0 + a.x * c, it.z0 + a.z * c, a.w * c, a.h * c);
    });
    // Doors still shut, across their openings.
    ctx.lineWidth = 3 * px;
    for (const d of L.doors) {
      if (d.kind === 'open' || this.state.open.includes(d.id) || !this.seen.has(d.room)) continue;
      ctx.strokeStyle = d.kind === 'locked' ? '#ffb030' : d.kind === 'power' ? '#5ee6ff' : '#c46aff';
      ctx.beginPath();
      if (d.axis === 'x') { ctx.moveTo(it.x0 + d.line, it.z0 + d.s0); ctx.lineTo(it.x0 + d.line, it.z0 + d.s1); } else { ctx.moveTo(it.x0 + d.s0, it.z0 + d.line); ctx.lineTo(it.x0 + d.s1, it.z0 + d.line); }
      ctx.stroke();
    }
    for (const t of L.things) {
      if (!this.seen.has(t.room)) continue;
      if ((t.kind === 'key' && this.state.key) || (t.kind === 'exit' && !this.state.boss) || (t.kind === 'reward' && (this.run.shared || !this.state.boss))) continue;
      const color = { portal: '#5ee6ff', exit: '#5ee6ff', key: '#ffb030', node: this.state.nodes.includes(t.id) ? '#5ee6ff' : '#ff5a5a', chest: this.looted.has(t.id) ? '#777' : '#f0c674', reward: '#f0c674' }[t.kind];
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(it.x0 + t.x, it.z0 + t.z, 1.6 * px, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // The whole map (ui/MapUI.js), fitted to a canvas: every room seen, where we are, the doors.
  drawMap(ctx, W, H) {
    const it = this.interior;
    if (!it) return;
    const L = it.layout;
    let x0 = Infinity;
    let z0 = Infinity;
    let x1 = -Infinity;
    let z1 = -Infinity;
    for (const a of [...L.rooms, ...L.cors]) {
      x0 = Math.min(x0, a.x); z0 = Math.min(z0, a.z); x1 = Math.max(x1, a.x + a.w); z1 = Math.max(z1, a.z + a.h);
    }
    const c = L.cell;
    const k = Math.min((W - 80) / ((x1 - x0) * c), (H - 120) / ((z1 - z0) * c));
    ctx.save();
    ctx.translate(W / 2, H / 2 + 20);
    ctx.scale(k, k);
    ctx.translate(-(it.x0 + ((x0 + x1) / 2) * c), -(it.z0 + ((z0 + z1) / 2) * c));
    this.drawRooms(ctx, 1 / k * 2.2);
    const p = this.game.player.position;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(p.x, p.z, 7 / k, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
