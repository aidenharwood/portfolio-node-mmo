// Game sounds, all procedural (see audio/Engine.js).
//   guns     a supersonic crack + a driven low body + an echoing tail + the action cycling, voiced
//            per weapon type and tinted by element or manufacturer; reloads timed to the reload
//   melee    whooshes that swell into the strike (lower, longer and heavier with weight), blade
//            slices, blunt crunches, crit rings; spins
//   magic    spell charge bed, per-spell casts, element tints, rune hums, arcane blasts
//   world    surface impacts, ricochets, casing tinkles, explosions by kind, arrow whizz
//   movement footsteps from the animator's foot plants (by surface), jumps, thruster double jumps,
//            landings by height, slides, bullet jumps, dashes, rolls, mantles, slams, and wind /
//            slide / glide / charge beds driven by the player's state every frame
import * as THREE from 'three';
import { Engine } from './Engine.js';
import { WEIGHT } from '../anim/WeaponMotion.js';
import { WEAPON_TYPES } from '../items/weaponTypes.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const vary = (v, amt = 0.06) => v * (1 + (Math.random() * 2 - 1) * amt);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// Gun voicing: crack (bright transient), body (driven low sweep), tail (echoing rumble), action.
const GUN = {
  pistol: { crack: 2600, crackDur: 0.045, body: [210, 70], bodyDur: 0.12, tail: 1000, tailDur: 0.4, gain: 0.8, action: 'slide' },
  rifle: { crack: 3300, crackDur: 0.04, body: [160, 55], bodyDur: 0.13, tail: 850, tailDur: 0.6, gain: 0.82, action: 'slide' },
  smg: { crack: 3900, crackDur: 0.03, body: [230, 95], bodyDur: 0.08, tail: 1200, tailDur: 0.28, gain: 0.6, action: null },
  shotgun: { crack: 1900, crackDur: 0.08, body: [120, 38], bodyDur: 0.22, tail: 650, tailDur: 0.85, gain: 1.0, action: 'pump' },
  sniper: { crack: 4300, crackDur: 0.055, body: [130, 34], bodyDur: 0.24, tail: 520, tailDur: 1.5, gain: 1.05, action: 'bolt' },
};
const BLUNT = new Set(['hammer', 'staff']);

export class Sfx {
  constructor(game) {
    this.game = game;
    this.E = new Engine();
    this.loops = null;
    this.prevPhase = new WeakMap();
    this.reloadGroup = null;
    this.charged = false;
    this.time = 0;
  }

  get ok() { return this.E.ready; }

  setVolume(v, muted) { this.E.setVolume(v, muted); }

  // ================================================================ per-frame
  update(dt) {
    const g = this.game;
    const E = this.E;
    if (!E.ready) return;
    this.time += dt;
    E.setListener(g.camera);
    if (!this.loops) this.makeLoops();
    const L = this.loops;
    const p = g.player;
    const live = (g.state === 'playing' || g.state === 'dev') && !g.dev?.paused && p.alive;
    if (!live) {
      for (const l of Object.values(L)) l.set(0, null, null, 0.08);
      this.charged = false;
      return;
    }
    const planar = Math.hypot(p.velocity.x, p.velocity.z);
    const speed = Math.hypot(planar, p.vy);
    // Wind: rushes in with speed (and in the air), gusting.
    const gust = 0.85 + 0.15 * Math.sin(this.time * 1.7) * Math.sin(this.time * 0.63 + 1);
    const air = p.grounded ? 0 : 0.35;
    L.wind.set(smoothstep(6, 30, speed) * (0.32 + air * 0.4) * gust, 320 + speed * 42);
    // Slide scrape: grit that rises with speed.
    const sliding = p.state === 'slide' && p.grounded;
    L.slide.set(sliding ? (0.06 + 0.2 * smoothstep(2, 24, planar)) * (0.85 + Math.random() * 0.3) : 0, 600 + planar * 45, null, sliding ? 0.03 : 0.08);
    // Glide: thruster hiss over a low hum.
    L.glide.set(p.gliding ? 0.15 : 0, 2400 + Math.sin(this.time * 7) * 300, 92 + Math.sin(this.time * 3) * 4);
    // Spell charge: a rising, brightening drone; a chime when full.
    const ch = p.weaponClass === 'magic' && p.charge > 0 ? p.chargeFraction : 0;
    L.charge.set(ch > 0 ? 0.05 + ch * 0.1 : 0, 900 + ch * 2600, 98 + ch * 196, 0.04, 400 + ch * 2600);
    if (ch >= 1 && !this.charged) { this.charged = true; this.chargedChime(p.weapon); }
    if (ch <= 0) this.charged = false;

    this.footsteps(p);
    for (const e of g.enemies) if (e.alive && e.grounded && e.animator) this.enemySteps(e);
  }

  makeLoops() {
    const E = this.E;
    this.loops = {
      wind: E.loop({ color: 'pink', filter: 'bandpass', f: 500, q: 0.6, wet: 0.05 }),
      slide: E.loop({ color: 'white', filter: 'bandpass', f: 900, q: 0.8, wet: 0.05 }),
      glide: E.loop({ color: 'white', filter: 'bandpass', f: 2400, q: 0.5, tone: { f: 92, mix: 0.6, wave: 'triangle' }, wet: 0.1 }),
      charge: E.loop({ color: 'white', filter: 'bandpass', f: 1200, q: 2, tone: { f: 98, mix: 0.9, wave: 'sawtooth', lp: 500 }, wet: 0.2 }),
    };
    this.loops.charge.noiseMix(0.15);
  }

  // ================================================================ footsteps
  // A foot plants when the gait phase crosses 0 (left) or 0.5 (right).
  crossed(who, phase) {
    const prev = this.prevPhase.get(who);
    this.prevPhase.set(who, phase);
    if (prev === undefined) return -1;
    const d = (phase - prev + 1) % 1;
    if (d <= 0 || d > 0.5) return -1;
    for (const [x, side] of [[0, 0], [0.5, 1]]) {
      const a = (x - prev + 1) % 1;
      if (a > 0 && a <= d) return side;
    }
    return -1;
  }

  footsteps(p) {
    const side = this.crossed(p, p.animator.phase);
    if (side < 0 || !p.grounded) return;
    const planar = Math.hypot(p.velocity.x, p.velocity.z);
    if (planar < 0.6 || (p.state !== 'move' && p.state !== 'attack')) return;
    const k = smoothstep(1, 11, planar);
    this.footstep(this.surface(p.position), 0.32 + 0.5 * k, side ? 0.12 : -0.12, null, !!this.game.player.inventory.armor.chest && planar > 8);
  }

  enemySteps(e) {
    const d = e.position.distanceTo(this.E.listener.pos);
    if (d > 26) { this.prevPhase.delete(e); return; }
    const side = this.crossed(e, e.animator.phase);
    if (side < 0 || !e.grounded) return;
    if (Math.hypot(e.velocity.x, e.velocity.z) < 0.5) return;
    const heavy = (e.type.mass ?? 1) >= 2;
    if (heavy) this.stomp(e.position, Math.min(1.4, (e.type.mass ?? 2) / 3));
    else if (d < 14 && this.E.allow('estep', 0.05)) this.footstep(this.surface(e.position), 0.22, 0, e.position);
  }

  surface(pos) {
    const w = this.game.world;
    if (w.isWater(pos.x, pos.z)) return 'water';
    if (pos.y > w.groundHeight(pos.x, pos.z) + 0.08) return 'hard';
    if (w.zoneAt(pos.x, pos.z) || w.nearRoad(pos.x, pos.z)) return 'gravel';
    const b = w.biomeAt(pos.x, pos.z);
    return b === 'snow' || b === 'desert' ? 'snow' : b === 'marsh' ? 'mud'
      : b === 'ash' || b === 'highland' || b === 'mountain' || b === 'badlands' || b === 'crystal' ? 'gravel' : 'grass';
  }

  footstep(surface, intensity = 0.5, pan = 0, pos = null, rattle = false) {
    const E = this.E;
    const v = E.voice({ pos, pan, gain: intensity * 1.0, wet: 0.04, dur: 0.35, reach: 8, priority: pos ? 0 : 1 });
    if (!v) return;
    const t = v.t;
    const o = v.in;
    const p = vary(1, 0.08);
    // Heel thump under every surface.
    E.tone(o, t, { f: 95 * p, f2: 55, dur: 0.07, peak: 0.45, lp: 300 });
    switch (surface) {
      case 'grass':
        E.burst(o, t, { color: 'pink', filter: 'lowpass', f: 900 * p, dur: 0.09, attack: 0.004, peak: 0.55 });
        E.burst(o, t + 0.015, { color: 'white', filter: 'bandpass', f: 3200 * p, q: 0.8, dur: 0.06, peak: 0.12 });
        break;
      case 'gravel':
        E.burst(o, t, { color: 'pink', filter: 'bandpass', f: 1300 * p, q: 0.9, dur: 0.08, peak: 0.5 });
        for (let i = 0; i < 5; i++) E.burst(o, t + rnd(0, 0.07), { color: 'white', filter: 'bandpass', f: rnd(1800, 4200), q: 3, dur: 0.012, peak: rnd(0.15, 0.35) });
        break;
      case 'hard':
        E.burst(o, t, { color: 'white', filter: 'bandpass', f: 1700 * p, q: 1.4, dur: 0.035, attack: 0.0006, peak: 0.6 });
        E.tone(o, t, { f: 320 * p, f2: 260, dur: 0.07, peak: 0.25 });
        break;
      case 'snow':
        for (let i = 0; i < 7; i++) E.burst(o, t + i * 0.012 + rnd(0, 0.006), { color: 'white', filter: 'bandpass', f: rnd(1600, 3000), q: 2, dur: 0.018, peak: rnd(0.2, 0.4) });
        E.burst(o, t, { color: 'pink', filter: 'lowpass', f: 700, dur: 0.1, peak: 0.35 });
        break;
      case 'mud':
        E.burst(o, t, { color: 'brown', filter: 'lowpass', f: 700, f2: 300, dur: 0.14, attack: 0.01, peak: 0.7 });
        E.tone(o, t + 0.03, { f: rnd(250, 400), f2: rnd(600, 900), dur: 0.05, peak: 0.12 });
        break;
      case 'water':
        E.burst(o, t, { color: 'white', filter: 'bandpass', f: 1800 * p, f2: 700, q: 0.9, dur: 0.18, attack: 0.008, peak: 0.6 });
        for (let i = 0; i < 3; i++) E.tone(o, t + rnd(0.03, 0.14), { f: rnd(500, 900), f2: rnd(1100, 1800), dur: 0.04, peak: 0.1 });
        break;
    }
    if (rattle && Math.random() < 0.6) E.ring(o, t + rnd(0.01, 0.04), rnd(2200, 3200), 0.08, 0.05);
  }

  stomp(pos, size = 1) {
    const E = this.E;
    const v = E.voice({ pos, gain: 0.7 * size, wet: 0.15, dur: 0.6, reach: 20, priority: 0 });
    if (!v) return;
    const d = E.drive(v.in, 3);
    E.tone(d, v.t, { f: 70 / Math.sqrt(size), f2: 32, dur: 0.3, peak: 0.9 });
    E.burst(v.in, v.t, { color: 'brown', filter: 'lowpass', f: 400, dur: 0.25, peak: 0.6 });
  }

  // ================================================================ movement
  jump() {
    const E = this.E;
    const v = E.voice({ gain: 0.8, wet: 0.05, dur: 0.4 });
    if (!v) return;
    this.footstep(this.surface(this.game.player.position), 0.45);
    E.whoosh(v.in, v.t, 0.22, 1100, { peakAt: 0.3, q: 0.8, peak: 0.35 });
  }

  // Double jump: a short arcane thruster kick under the feet.
  doubleJump() {
    const E = this.E;
    const v = E.voice({ gain: 0.5, wet: 0.15, dur: 0.6 });
    if (!v) return;
    const t = v.t;
    E.burst(v.in, t, { color: 'white', filter: 'bandpass', f: 900, f2: 2600, q: 0.9, dur: 0.25, attack: 0.004, peak: 0.6 });
    E.tone(v.in, t, { wave: 'triangle', f: 150, f2: 420, dur: 0.2, peak: 0.3, lp: 1200 });
    E.tone(E.drive(v.in, 2.5), t, { f: 90, f2: 45, dur: 0.12, peak: 0.5 });
    E.whoosh(v.in, t + 0.08, 0.35, 1400, { peakAt: 0.4, q: 0.7, peak: 0.25 });
  }

  land(fall) {
    const E = this.E;
    if (fall < 0.4) return;
    const k = clamp(fall / 8, 0.15, 1.2);
    const v = E.voice({ gain: 0.35 + 0.45 * k, wet: 0.08 + 0.1 * k, dur: 0.8 });
    if (!v) return;
    const t = v.t;
    this.footstep(this.surface(this.game.player.position), 0.5 + 0.4 * Math.min(1, k));
    E.tone(E.drive(v.in, 2 + 3 * k), t, { f: 110, f2: 38, dur: 0.12 + 0.2 * k, peak: 0.7 });
    E.burst(v.in, t, { color: 'brown', filter: 'lowpass', f: 600 + 600 * k, f2: 200, dur: 0.15 + 0.25 * k, peak: 0.7 });
    if (k > 0.45) {
      for (let i = 0; i < 6; i++) E.burst(v.in, t + rnd(0.02, 0.25), { color: 'white', filter: 'bandpass', f: rnd(1200, 3500), q: 3, dur: 0.015, peak: rnd(0.08, 0.2) });
      if (this.game.player.inventory.armor.chest) E.ring(v.in, t + 0.02, rnd(1800, 2600), 0.15, 0.08);
    }
  }

  slideStart() {
    const E = this.E;
    const v = E.voice({ gain: 0.45, wet: 0.05, dur: 0.4 });
    if (!v) return;
    E.burst(v.in, v.t, { color: 'white', filter: 'bandpass', f: 1400, f2: 900, q: 0.8, dur: 0.18, attack: 0.01, peak: 0.6 });
    E.burst(v.in, v.t, { color: 'brown', filter: 'lowpass', f: 500, dur: 0.12, peak: 0.4 });
  }

  bulletJump() {
    const E = this.E;
    const v = E.voice({ gain: 0.7, wet: 0.18, dur: 0.9, priority: 2 });
    if (!v) return;
    const t = v.t;
    E.tone(E.drive(v.in, 4), t, { f: 130, f2: 45, dur: 0.18, peak: 0.9 });
    E.burst(v.in, t, { color: 'brown', filter: 'lowpass', f: 1200, f2: 250, dur: 0.2, peak: 0.6 });
    E.whoosh(v.in, t + 0.02, 0.55, 2400, { peakAt: 0.25, q: 0.6, peak: 0.55 });
    E.tone(v.in, t, { wave: 'triangle', f: 380, f2: 1100, dur: 0.25, peak: 0.18, lp: 3000 });
  }

  airDash() {
    const E = this.E;
    const v = E.voice({ gain: 0.6, wet: 0.15, dur: 0.6, priority: 2 });
    if (!v) return;
    const t = v.t;
    E.whoosh(v.in, t, 0.32, 3000, { peakAt: 0.25, q: 0.7, peak: 0.7, color: 'white', spread: 3 });
    E.tone(v.in, t, { wave: 'triangle', f: 260, f2: 820, dur: 0.18, peak: 0.25, lp: 2000 });
    E.tone(E.drive(v.in, 3), t, { f: 85, f2: 50, dur: 0.12, peak: 0.5 });
  }

  // Ground dash: the push-off scuff, then a short, bright rush of air.
  dash() {
    const E = this.E;
    const v = E.voice({ gain: 0.5, wet: 0.08, dur: 0.5 });
    if (!v) return;
    const t = v.t;
    this.footstep(this.surface(this.game.player.position), 0.45);
    E.whoosh(v.in, t, 0.22, 1800, { peakAt: 0.2, q: 0.7, peak: 0.6, color: 'white' });
    E.tone(v.in, t, { wave: 'triangle', f: 200, f2: 520, dur: 0.12, peak: 0.12, lp: 1600 });
  }

  mantle() {
    const E = this.E;
    const v = E.voice({ gain: 0.8, wet: 0.05, dur: 0.6 });
    if (!v) return;
    const t = v.t;
    E.burst(v.in, t, { color: 'pink', filter: 'bandpass', f: 1500, q: 1, dur: 0.03, attack: 0.0005, peak: 0.6 });
    E.burst(v.in, t + 0.04, { color: 'pink', filter: 'bandpass', f: 1300, q: 1, dur: 0.03, attack: 0.0005, peak: 0.5 });
    E.whoosh(v.in, t + 0.05, 0.3, 800, { peakAt: 0.5, q: 0.8, peak: 0.3 });
    this.footstep('hard', 0.45);
  }

  // Ground slam dive: a rising whistle into the impact (the explosion supplies the boom).
  slamDive() {
    const E = this.E;
    const v = E.voice({ gain: 0.5, wet: 0.1, dur: 0.6, priority: 2 });
    if (!v) return;
    E.whoosh(v.in, v.t, 0.45, 2600, { peakAt: 0.9, q: 0.9, peak: 0.6, spread: 3 });
    E.tone(v.in, v.t, { f: 700, f2: 1500, glide: 0.4, dur: 0.42, attack: 0.3, peak: 0.08 });
  }

  // ================================================================ guns
  // `pos`: another player's shot, heard from where it was fired (ours play at the listener).
  shot(w, pos = null) {
    if (w.type === 'launcher') return this.launch(w, pos);
    if (w.type === 'crossbow') return this.crossbow(w, pos);
    const E = this.E;
    const G = GUN[w.type] ?? GUN.rifle;
    const v = E.voice({ gain: G.gain * 1.9, wet: 0.3, dur: G.tailDur + 0.9, priority: pos ? 1 : 2, pos, reach: 45 });
    if (!v) return;
    const t = v.t;
    const o = v.in;
    const p = vary(1, 0.05);
    // Crack: the supersonic snap and muzzle blast.
    E.burst(o, t, { color: 'white', filter: 'highpass', f: G.crack * 0.55 * p, dur: G.crackDur, attack: 0.0004, peak: 0.85 });
    E.burst(o, t, { color: 'white', filter: 'bandpass', f: G.crack * p, q: 0.9, dur: G.crackDur * 0.6, attack: 0.0003, peak: 0.6 });
    // Body: the punch in the chest.
    const drv = E.drive(o, 4);
    E.tone(drv, t, { wave: 'triangle', f: G.body[0] * p, f2: G.body[1] * p, glide: G.bodyDur * 0.8, dur: G.bodyDur, attack: 0.001, peak: 0.9 });
    E.burst(drv, t, { color: 'brown', filter: 'lowpass', f: 1000, f2: 200, dur: G.bodyDur * 1.3, attack: 0.001, peak: 0.75 });
    // Tail: the shot rolling off the valley.
    E.burst(o, t + 0.01, { color: 'pink', filter: 'lowpass', f: G.tail, f2: G.tail * 0.35, dur: G.tailDur, attack: 0.008, peak: 0.26 });
    this.action(G.action, t, o);
    this.tint(w, t, o, 1);
  }

  launch(w, pos = null) {
    const E = this.E;
    const v = E.voice({ gain: 0.9, wet: 0.25, dur: 1.4, priority: pos ? 1 : 2, pos, reach: 45 });
    if (!v) return;
    const t = v.t;
    E.tone(E.drive(v.in, 4), t, { f: 95, f2: 38, dur: 0.3, peak: 0.9 });
    E.burst(v.in, t, { color: 'brown', filter: 'lowpass', f: 900, f2: 200, dur: 0.35, peak: 0.7 });
    E.whoosh(v.in, t + 0.02, 0.8, 1800, { peakAt: 0.15, q: 0.6, peak: 0.6, color: 'white', spread: 3 });
    E.burst(v.in, t + 0.1, { color: 'white', filter: 'highpass', f: 2500, dur: 0.9, attack: 0.05, peak: 0.12 });
    this.tint(w, t, v.in, 0.8);
  }

  crossbow(w, pos = null) {
    const E = this.E;
    const v = E.voice({ gain: 1.4, wet: 0.12, dur: 0.8, priority: pos ? 1 : 2, pos, reach: 30 });
    if (!v) return;
    const t = v.t;
    // String release: a plucked, quickly damped twang.
    E.tone(v.in, t, { wave: 'sawtooth', f: vary(170), f2: 150, dur: 0.25, peak: 0.45, lp: 2800, lp2: 400 });
    E.tone(v.in, t, { f: 85, f2: 70, dur: 0.2, peak: 0.4 });
    E.burst(v.in, t, { color: 'brown', filter: 'lowpass', f: 700, dur: 0.06, attack: 0.0005, peak: 0.6 });
    E.whoosh(v.in, t + 0.01, 0.22, 2200, { peakAt: 0.2, q: 1, peak: 0.25 });
    this.tint(w, t, v.in, 0.6);
  }

  action(kind, t, o) {
    if (kind === 'slide') this.click(o, t + rnd(0.035, 0.05), 3800, 0.16);
    else if (kind === 'pump') { this.clack(o, t + 0.3, 0.55); this.slideNoise(o, t + 0.33, 0.07); this.clack(o, t + 0.42, 0.65, 0.8); }
    else if (kind === 'bolt') { this.clack(o, t + 0.45, 0.45); this.slideNoise(o, t + 0.5, 0.12); this.clack(o, t + 0.66, 0.55, 0.85); }
  }

  // Element (or, plain, the maker's signature) tint layered over weapon sounds.
  tint(w, t, o, scale = 1) {
    const E = this.E;
    const el = w.element;
    if (el === 'fire') {
      for (let i = 0; i < 6; i++) E.burst(o, t + rnd(0.01, 0.22), { color: 'white', filter: 'bandpass', f: rnd(1500, 4500), q: 2, dur: 0.012, peak: 0.22 * scale });
      E.burst(o, t, { color: 'brown', filter: 'lowpass', f: 500, dur: 0.3, attack: 0.03, peak: 0.25 * scale });
    } else if (el === 'shock') {
      E.tone(o, t, { wave: 'square', f: 1800, f2: 220, dur: 0.12, peak: 0.1 * scale, lp: 3500 });
      for (let i = 0; i < 4; i++) E.burst(o, t + rnd(0, 0.1), { color: 'white', filter: 'highpass', f: 4000, dur: 0.01, peak: 0.2 * scale });
    } else if (el === 'frost') {
      E.fm(o, t + 0.005, { f: 2400, ratio: 3.51, index: 1.2, dur: 0.4, peak: 0.07 * scale });
      E.fm(o, t + 0.03, { f: 3700, ratio: 2.1, index: 0.8, dur: 0.3, peak: 0.04 * scale });
    } else if (el === 'corrosive') {
      for (let i = 0; i < 5; i++) E.tone(o, t + rnd(0.02, 0.25), { f: rnd(300, 700), f2: rnd(900, 1500), dur: 0.05, peak: 0.07 * scale });
    } else {
      const m = w.manufacturer;
      if (m === 'kessler') E.tone(o, t, { f: 2800, f2: 700, dur: 0.07, peak: 0.07 * scale });
      else if (m === 'voltaic') E.tone(o, t, { wave: 'sawtooth', f: 1400, f2: 300, dur: 0.06, peak: 0.05 * scale, lp: 2500 });
      else if (m === 'rattlecap') for (let i = 0; i < 3; i++) E.burst(o, t + rnd(0.04, 0.14), { filter: 'bandpass', f: rnd(2000, 3500), q: 4, dur: 0.015, peak: 0.16 * scale });
      else if (m === 'rime') E.fm(o, t, { f: 3200, ratio: 2.7, index: 0.8, dur: 0.2, peak: 0.05 * scale });
      else if (m === 'aether' || m === 'hollow') E.fm(o, t, { f: m === 'hollow' ? 220 : 660, ratio: 1.5, index: 1.5, dur: 0.35, peak: 0.06 * scale });
    }
  }

  click(o, t, f = 3500, peak = 0.2) {
    this.E.burst(o, t, { color: 'white', filter: 'bandpass', f, q: 3, dur: 0.012, attack: 0.0003, peak });
    this.E.ring(o, t, f * 0.8, 0.04, peak * 0.35, [1, 2.3]);
  }

  clack(o, t, peak, pitch = 1) {
    const E = this.E;
    E.burst(o, t, { color: 'white', filter: 'bandpass', f: 1600 * pitch, q: 1.5, dur: 0.035, attack: 0.0004, peak });
    E.burst(o, t, { color: 'brown', filter: 'lowpass', f: 500, dur: 0.05, peak: peak * 0.6 });
    E.ring(o, t, 1100 * pitch, 0.07, peak * 0.22);
  }

  clunk(o, t, peak) {
    const E = this.E;
    E.tone(o, t, { f: 180, f2: 120, dur: 0.12, peak: peak * 0.6 });
    E.burst(o, t, { color: 'brown', filter: 'lowpass', f: 900, dur: 0.08, attack: 0.0005, peak });
    E.ring(o, t, 600, 0.15, peak * 0.2);
  }

  slideNoise(o, t, dur, peak = 0.12) {
    this.E.burst(o, t, { color: 'white', filter: 'bandpass', f: 2500, f2: 1400, q: 1.5, dur, attack: dur * 0.3, peak });
  }

  // Reload choreography across the reload time; cancelled if the weapon is swapped away.
  reload(w, T) {
    this.stopReload();
    const E = this.E;
    const g = E.group({ gain: 0.6, wet: 0.06, dur: T + 0.6, priority: 2 });
    if (!g) return;
    this.reloadGroup = g;
    const t = g.t;
    const o = g.in;
    switch (w.type) {
      case 'shotgun': {
        const n = 4;
        for (let i = 0; i < n; i++) {
          const at = t + T * (0.1 + i * 0.17);
          this.slideNoise(o, at - 0.05, 0.05, 0.07);
          this.clack(o, at, 0.3, 1.35);
        }
        this.clack(o, t + T * 0.86, 0.5);
        this.slideNoise(o, t + T * 0.86 + 0.03, 0.07);
        this.clack(o, t + T * 0.86 + 0.12, 0.6, 0.8);
        break;
      }
      case 'launcher':
        this.clunk(o, t + T * 0.15, 0.6);
        E.burst(o, t + T * 0.45, { color: 'pink', filter: 'bandpass', f: 400, f2: 1100, q: 1, dur: 0.3, attack: 0.1, peak: 0.25 });
        this.clunk(o, t + T * 0.85, 0.8);
        this.click(o, t + T * 0.88, 2600, 0.25);
        break;
      case 'crossbow':
        for (let i = 0; i < 10; i++) this.click(o, t + T * (0.08 + i * 0.05), 1800 + i * 90, 0.14);
        this.clack(o, t + T * 0.72, 0.5, 0.9);
        this.click(o, t + T * 0.86, 3000, 0.2);
        break;
      default:
        this.click(o, t + T * 0.08, 3000, 0.22);           // mag release
        this.slideNoise(o, t + T * 0.1, 0.09, 0.1);        // mag out
        this.slideNoise(o, t + T * 0.48, 0.07, 0.08);      // mag in
        this.clack(o, t + T * 0.55, 0.42, 1.1);            // seated
        if (w.type === 'sniper') {
          this.clack(o, t + T * 0.76, 0.4);
          this.slideNoise(o, t + T * 0.79, 0.1);
          this.clack(o, t + T * 0.86, 0.5, 0.85);
        } else {
          this.clack(o, t + T * 0.84, 0.35, 1.2);          // charging handle back…
          this.clack(o, t + T * 0.84 + 0.07, 0.5, 0.85);   // …and home
        }
    }
  }

  stopReload() {
    this.reloadGroup?.stop();
    this.reloadGroup = null;
  }

  // Drawing a weapon: a blade's ring, a haft's knock, a gun's rack, a focus waking up.
  draw(w) {
    const E = this.E;
    const v = E.voice({ gain: 0.4, wet: 0.12, dur: 0.8 });
    if (!v || !w) return;
    const t = v.t;
    const o = v.in;
    if (w.cls === 'melee' && !BLUNT.has(w.type)) {
      E.burst(o, t, { color: 'white', filter: 'bandpass', f: 2200, f2: 6500, q: 2, dur: 0.22, attack: 0.05, peak: 0.25 });
      E.ring(o, t + 0.12, rnd(2300, 2900), 0.6, 0.12);
    } else if (w.cls === 'melee') {
      E.burst(o, t, { color: 'brown', filter: 'lowpass', f: 800, dur: 0.1, peak: 0.5 });
      E.tone(o, t, { f: 210, f2: 160, dur: 0.12, peak: 0.25 });
    } else if (w.cls === 'ranged') {
      this.clack(o, t, 0.35, 1.1);
      this.clack(o, t + 0.12, 0.45, 0.85);
    } else {
      E.tone(o, t, { wave: 'triangle', f: 220, f2: 440, dur: 0.4, attack: 0.15, peak: 0.12 });
      E.fm(o, t + 0.2, { f: 1320, ratio: 2.01, index: 0.6, dur: 0.5, peak: 0.08 });
    }
    this.tint(w, t, o, 0.4);
  }

  // ================================================================ melee
  /**
   * Swing whoosh. delay: until the strike starts moving; dur: strike + follow-through;
   * weight 0..1+; peakAt: where the blade is fastest. pos = null for the player.
   */
  swing({ weapon = null, weight = 0.5, delay = 0, dur = 0.25, peakAt = 0.55, pos = null, gain = 1, spin = false } = {}) {
    const E = this.E;
    const wc = Math.min(1.2, weight);
    const total = spin ? dur * 1.1 : dur;
    const v = E.voice({ pos, delay, gain: (0.3 + 0.2 * wc) * gain, wet: 0.1, dur: total + 0.3, reach: 10, priority: pos ? 1 : 2 });
    if (!v) return;
    const t = v.t;
    const o = v.in;
    const fc = vary(1600 - 950 * Math.min(1, wc), 0.08);
    const heavy = wc > 0.7;
    if (spin) {
      // The blade passes twice: once as the spin builds, again as it carries round.
      E.whoosh(o, t, total * 0.6, fc, { peakAt: 0.7, q: 0.9, peak: 0.9 });
      E.whoosh(o, t + total * 0.45, total * 0.55, fc * 1.1, { peakAt: 0.35, q: 0.9, peak: 0.8 });
    } else {
      E.whoosh(o, t, total, fc, { peakAt, q: 0.9, peak: 0.9 });
      // Thin edge whistle on blades.
      if (!BLUNT.has(weapon?.type)) E.whoosh(o, t + total * 0.1, total * 0.8, fc * 2.6, { peakAt: peakAt * 0.9, q: 3, peak: 0.18, color: 'white' });
    }
    if (heavy) E.tone(o, t + total * 0.1, { f: 55, f2: 85, glide: total * 0.5, dur: total, attack: total * 0.45, peak: 0.3 * wc, lp: 220 });
    if (weapon) this.tint(weapon, t + total * peakAt * 0.8, o, 0.35);
  }

  // Player swing scheduled from a resolved attack (timings already scaled by attack speed).
  playerSwing(attack, weapon) {
    const weight = WEIGHT[weapon?.type] ?? 0.5;
    const start = attack.windup * 0.55;
    if (attack.spin) {
      this.swing({ weapon, weight, delay: attack.windup * 0.7, dur: attack.active + 0.25, spin: true });
      return;
    }
    const len = (attack.windup - start) + attack.active + 0.08 + 0.12 * Math.min(1, weight);
    const peak = (attack.windup - start + attack.active * 0.6) / len;
    this.swing({ weapon, weight, delay: start, dur: len, peakAt: clamp(peak, 0.3, 0.8) });
  }

  // Player melee connecting: blades slice, hafts crunch; heavier weapons land deeper.
  meleeHit(weapon, pos, crit = false) {
    const E = this.E;
    const weight = WEIGHT[weapon?.type] ?? 0.5;
    const blunt = BLUNT.has(weapon?.type);
    const v = E.voice({ pos, gain: 0.75 + 0.25 * Math.min(1, weight), wet: 0.12, dur: 0.8, reach: 14, priority: 2 });
    if (!v) return;
    const t = v.t;
    const o = v.in;
    const d = E.drive(o, blunt ? 5 : 3);
    E.tone(d, t, { f: blunt ? 120 : 150, f2: 45, dur: 0.12 + 0.12 * weight, peak: 0.8 });
    E.burst(d, t, { color: 'brown', filter: 'lowpass', f: blunt ? 900 : 600, f2: 200, dur: 0.1 + 0.08 * weight, attack: 0.001, peak: 0.7 });
    if (blunt) {
      for (let i = 0; i < 5; i++) E.burst(o, t + rnd(0, 0.05), { color: 'white', filter: 'bandpass', f: rnd(700, 1800), q: 2, dur: 0.02, peak: 0.35 });
    } else {
      E.burst(o, t, { color: 'white', filter: 'highpass', f: 2600, dur: 0.07, attack: 0.001, peak: 0.45 });
      E.burst(o, t + 0.005, { color: 'white', filter: 'bandpass', f: 1200, f2: 600, q: 1, dur: 0.1, peak: 0.3 });
    }
    if (crit) E.ring(o, t, rnd(2400, 3100), 0.5, 0.18);
    if (weapon) this.tint(weapon, t, o, 0.6);
  }

  // ================================================================ hits, impacts, kills
  bulletHit(pos, crit = false) {
    const E = this.E;
    if (!E.allow('bhit', 0.018)) return;
    const v = E.voice({ pos, gain: 0.6, wet: 0.08, dur: 0.4, reach: 18, priority: 1 });
    if (v) {
      E.burst(v.in, v.t, { color: 'white', filter: 'bandpass', f: 1300, q: 1.2, dur: 0.035, attack: 0.0005, peak: 0.7 });
      E.tone(E.drive(v.in, 3), v.t, { f: 160, f2: 60, dur: 0.07, peak: 0.6 });
    }
    this.tick(crit);
  }

  // Hit confirmation at the player's ear (distance-independent), brighter for crits.
  tick(crit = false) {
    const E = this.E;
    if (!E.allow('tick', 0.03)) return;
    const v = E.voice({ gain: crit ? 0.3 : 0.18, wet: 0, dur: 0.3, priority: 1 });
    if (!v) return;
    E.burst(v.in, v.t, { color: 'white', filter: 'bandpass', f: crit ? 5200 : 4200, q: 4, dur: 0.018, attack: 0.0004, peak: 0.6 });
    if (crit) E.ring(v.in, v.t, 3300, 0.25, 0.2, [1, 2.4]);
  }

  magicHit(pos, element, crit = false) {
    const E = this.E;
    if (!E.allow('mhit', 0.03)) return;
    const v = E.voice({ pos, gain: 0.5, wet: 0.2, dur: 0.6, reach: 16 });
    if (v) {
      E.burst(v.in, v.t, { color: 'white', filter: 'bandpass', f: 2600, f2: 900, q: 1.5, dur: 0.18, attack: 0.002, peak: 0.5 });
      E.tone(v.in, v.t, { wave: 'triangle', f: 600, f2: 180, dur: 0.15, peak: 0.25 });
      this.tint({ element, manufacturer: 'aether' }, v.t, v.in, 0.7);
    }
    this.tick(crit);
  }

  playerHurt(frac) {
    const E = this.E;
    if (!E.allow('hurt', 0.06)) return;
    const k = clamp(frac * 4, 0.3, 1);
    const v = E.voice({ gain: 0.35 + 0.3 * k, wet: 0.05, dur: 0.6, priority: 2 });
    if (!v) return;
    E.tone(E.drive(v.in, 4), v.t, { f: 120, f2: 40, dur: 0.18 + 0.1 * k, peak: 0.8 });
    E.burst(v.in, v.t, { color: 'brown', filter: 'lowpass', f: 700, dur: 0.15, peak: 0.6 });
    E.burst(v.in, v.t, { color: 'white', filter: 'bandpass', f: 900, q: 0.8, dur: 0.09, peak: 0.25 });
  }

  kill(pos, big = false) {
    const E = this.E;
    const v = E.voice({ pos, gain: big ? 0.8 : 0.45, wet: 0.2, dur: 1.2, reach: 22, priority: 1 });
    if (v) {
      E.tone(E.drive(v.in, 3), v.t, { f: big ? 80 : 110, f2: 35, dur: big ? 0.6 : 0.25, peak: 0.7 });
      E.burst(v.in, v.t + 0.02, { color: 'brown', filter: 'lowpass', f: 500, f2: 150, dur: big ? 0.6 : 0.25, peak: 0.5 });
    }
    // A clean confirmation chime at the ear.
    const c = E.voice({ gain: 0.16, wet: 0.15, dur: 0.6 });
    if (c) E.fm(c.in, c.t + 0.03, { f: 1568, ratio: 2, index: 0.4, dur: 0.35, peak: 0.25 });
  }

  // Shots landing in the world: dirt puffs, ricochets off hard things, arrows thunking in.
  impact(pos, kind, element = 'none') {
    const E = this.E;
    if (!E.allow('imp-' + kind, 0.025)) return;
    const v = E.voice({ pos, gain: 0.45, wet: 0.12, dur: 0.6, reach: 14, priority: 0 });
    if (!v) return;
    const t = v.t;
    const o = v.in;
    if (kind === 'dirt') {
      E.burst(o, t, { color: 'pink', filter: 'lowpass', f: 1200, f2: 400, dur: 0.07, attack: 0.0006, peak: 0.6 });
      E.tone(o, t, { f: 140, f2: 70, dur: 0.05, peak: 0.3 });
    } else if (kind === 'hard') {
      E.burst(o, t, { color: 'white', filter: 'highpass', f: 2500, dur: 0.025, attack: 0.0003, peak: 0.6 });
      if (Math.random() < 0.35) E.tone(o, t + 0.01, { f: rnd(2400, 3200), f2: rnd(900, 1400), dur: rnd(0.2, 0.32), peak: 0.12, vib: [rnd(30, 60), 80] });
      else E.ring(o, t, rnd(900, 1500), 0.12, 0.12);
    } else if (kind === 'wood') {
      E.burst(o, t, { color: 'brown', filter: 'lowpass', f: 900, dur: 0.06, attack: 0.0005, peak: 0.7 });
      E.tone(o, t, { f: 240, f2: 160, dur: 0.06, peak: 0.35 });
    } else {
      E.burst(o, t, { color: 'white', filter: 'bandpass', f: 2000, f2: 700, q: 1.2, dur: 0.2, peak: 0.4 });
      this.tint({ element, manufacturer: 'aether' }, t, o, 0.6);
    }
  }

  // Spent brass hitting the ground: a couple of tiny inharmonic pings.
  casing(pos) {
    const E = this.E;
    if (!E.allow('casing', 0.04)) return;
    const v = E.voice({ pos, gain: 0.18, wet: 0.05, dur: 0.3, reach: 5, priority: 0 });
    if (!v) return;
    E.ring(v.in, v.t, rnd(4200, 5600), 0.12, 0.4, [1, 1.47, 2.09]);
    if (Math.random() < 0.6) E.ring(v.in, v.t + rnd(0.05, 0.11), rnd(4400, 5800), 0.07, 0.2, [1, 1.47]);
  }

  // Explosions by kind: 'blast' (rockets), 'quake' (slams, stomps, shockwaves), 'arcane' (spells).
  explosion(pos, radius = 3, kind = 'blast', element = 'none') {
    const E = this.E;
    const size = clamp(radius / 4, 0.4, 1.8);
    const v = E.voice({ pos, gain: 0.7 + 0.3 * size, wet: 0.45, dur: 2.2, reach: 30 + 20 * size, priority: 2 });
    if (!v) return;
    const t = v.t;
    const o = v.in;
    const sub = E.drive(o, 3);
    E.tone(sub, t, { f: (kind === 'quake' ? 60 : 75) / Math.sqrt(size), f2: 26, glide: 0.5 + 0.2 * size, dur: 0.7 + 0.3 * size, peak: kind === 'arcane' ? 0.55 : 0.95 });
    E.burst(o, t, { color: 'white', filter: 'highpass', f: 1800, dur: 0.05, attack: 0.0005, peak: 0.6 });
    E.burst(o, t, { color: 'brown', filter: 'lowpass', f: 1400, f2: 180, dur: 0.6 + 0.35 * size, attack: 0.003, peak: 0.9 });
    if (kind === 'quake') {
      E.burst(o, t + 0.02, { color: 'brown', filter: 'lowpass', f: 160, dur: 1.2 * size, attack: 0.05, peak: 0.7 });
      for (let i = 0; i < 8; i++) E.burst(o, t + rnd(0.05, 0.6), { color: 'pink', filter: 'bandpass', f: rnd(500, 1600), q: 2, dur: 0.03, peak: rnd(0.1, 0.25) });
    } else if (kind === 'arcane') {
      E.fm(o, t, { f: 523, ratio: 1.5, index: 2, dur: 0.9, peak: 0.25 });
      E.fm(o, t + 0.02, { f: 784, ratio: 2.01, index: 1.2, dur: 0.7, peak: 0.15 });
      E.burst(o, t, { color: 'white', filter: 'bandpass', f: 3000, f2: 800, q: 1, dur: 0.5, peak: 0.25 });
    } else {
      for (let i = 0; i < 10; i++) E.burst(o, t + rnd(0.08, 0.9), { color: 'white', filter: 'bandpass', f: rnd(800, 3000), q: 2, dur: rnd(0.01, 0.03), peak: rnd(0.08, 0.2) });
    }
    if (element !== 'none') this.tint({ element }, t, o, 1);
  }

  // A rune burning into the ground: a low hum that rises until it goes off.
  rune(pos, delay) {
    const E = this.E;
    const v = E.voice({ pos, gain: 0.3, wet: 0.3, dur: delay + 0.2, reach: 16, priority: 0 });
    if (!v) return;
    E.tone(v.in, v.t, { wave: 'triangle', f: 110, f2: 330, glide: delay, dur: delay, attack: delay * 0.7, peak: 0.4, lp: 1200 });
    E.burst(v.in, v.t, { color: 'white', filter: 'bandpass', f: 1500, f2: 4000, q: 2, dur: delay, attack: delay * 0.8, peak: 0.12 });
  }

  // ================================================================ magic
  cast(w, charged, pos = null) {
    const E = this.E;
    const spell = WEAPON_TYPES[w.type]?.spell;
    const big = charged ? 1.4 : 1;
    const v = E.voice({ gain: 0.6 * big, wet: 0.3, dur: 1.4, priority: pos ? 1 : 2, pos, reach: 35 });
    if (!v) return;
    const t = v.t;
    const o = v.in;
    switch (spell) {
      case 'bolt':
        E.tone(o, t, { f: vary(1500), f2: 240, dur: 0.14, peak: 0.45 });
        E.tone(o, t, { wave: 'square', f: vary(750), f2: 160, dur: 0.12, peak: 0.08, lp: 3000 });
        E.burst(o, t, { color: 'white', filter: 'bandpass', f: 3200, f2: 1200, q: 1.3, dur: 0.1, peak: 0.35 });
        E.tone(E.drive(o, 2), t, { f: 110, f2: 55, dur: 0.1, peak: 0.4 * big });
        break;
      case 'orb':
        E.tone(E.drive(o, 2), t, { f: 230, f2: 85, dur: 0.35, peak: 0.6 });
        E.whoosh(o, t, 0.5, 900, { peakAt: 0.25, q: 0.9, peak: 0.45 });
        E.fm(o, t + 0.02, { f: 440, ratio: 1.5, index: 1.5, dur: 0.6, peak: 0.12 });
        break;
      case 'seeker': {
        const n = Math.min(8, Math.round((w.stats.missiles ?? 3) * (charged ? 2 : 1)));
        for (let i = 0; i < n; i++) E.tone(o, t + i * 0.035, { f: vary(900, 0.15), f2: vary(2000, 0.1), dur: 0.08, peak: 0.25 });
        E.whoosh(o, t, 0.4, 1600, { peakAt: 0.3, q: 1, peak: 0.25 });
        break;
      }
      case 'chain':
        // Crackling arc: a buzzing saw gated by a scatter of sparks.
        E.tone(o, t, { wave: 'sawtooth', f: 72, dur: 0.3, peak: 0.25, lp: 2400, hold: 0.15 });
        for (let i = 0; i < 12; i++) E.burst(o, t + rnd(0, 0.28), { color: 'white', filter: 'highpass', f: rnd(2500, 6000), dur: rnd(0.008, 0.02), peak: rnd(0.25, 0.55) });
        E.tone(o, t, { wave: 'square', f: 1900, f2: 300, dur: 0.15, peak: 0.08, lp: 4000 });
        break;
      case 'nova':
        E.tone(o, t, { wave: 'triangle', f: 160, f2: 480, dur: 0.3, peak: 0.3, lp: 1800 });
        E.fm(o, t + 0.05, { f: 660, ratio: 1.5, index: 1, dur: 0.5, peak: 0.1 });
        break;
      default:
        E.tone(o, t, { f: 800, f2: 300, dur: 0.15, peak: 0.3 });
    }
    if (charged) E.tone(E.drive(o, 3), t, { f: 70, f2: 35, dur: 0.4, peak: 0.6 });
    this.tint(w, t, o, 0.8);
  }

  chargedChime(w) {
    const E = this.E;
    const v = E.voice({ gain: 0.25, wet: 0.35, dur: 1 });
    if (!v) return;
    E.fm(v.in, v.t, { f: 1046, ratio: 2.01, index: 0.5, dur: 0.6, peak: 0.3 });
    E.fm(v.in, v.t + 0.06, { f: 1568, ratio: 2.01, index: 0.4, dur: 0.6, peak: 0.2 });
    if (w) this.tint(w, v.t, v.in, 0.4);
  }

  // ================================================================ enemies
  enemySwing(e) {
    const heavy = (e.type.mass ?? 1) >= 2;
    this.swing({ pos: e.position, weight: heavy ? 1.1 : 0.4, dur: (e.cur?.active ?? 0.15) + (heavy ? 0.3 : 0.15), peakAt: 0.5, gain: heavy ? 1.1 : 0.8 });
  }

  bow(pos) {
    const E = this.E;
    const v = E.voice({ pos, gain: 1.1, wet: 0.1, dur: 0.6, reach: 14 });
    if (!v) return;
    E.tone(v.in, v.t, { wave: 'sawtooth', f: vary(240), f2: 210, dur: 0.18, peak: 0.35, lp: 2200, lp2: 300 });
    E.burst(v.in, v.t, { color: 'brown', filter: 'lowpass', f: 600, dur: 0.05, attack: 0.0005, peak: 0.4 });
    E.whoosh(v.in, v.t, 0.2, 2000, { peakAt: 0.2, q: 1, peak: 0.2 });
  }

  // Something flew past your head.
  whiz(pos) {
    const E = this.E;
    if (!E.allow('whiz', 0.05)) return;
    const v = E.voice({ pos, gain: 0.55, wet: 0.05, dur: 0.4, reach: 6, priority: 1 });
    if (!v) return;
    E.whoosh(v.in, v.t, 0.2, 3200, { peakAt: 0.4, q: 2, peak: 0.6, color: 'white', spread: 2.5 });
  }

  // Low rumble building under a telegraphed slam.
  rumble(pos, dur) {
    const E = this.E;
    const v = E.voice({ pos, gain: 0.5, wet: 0.2, dur: dur + 0.2, reach: 20 });
    if (!v) return;
    E.burst(v.in, v.t, { color: 'brown', filter: 'lowpass', f: 120, f2: 260, dur, attack: dur * 0.85, peak: 0.8 });
  }

  // Enemy shots building up: psi (psions), energy (techs, synths), web (crawlers' resin), and
  // the hum of a tech's shield or repair field.
  enemyCast(pos, kind, dur = 0.6) {
    const E = this.E;
    if (!E.allow('ecast', 0.08)) return;
    const v = E.voice({ pos, gain: 0.45, wet: 0.35, dur: dur + 0.5, reach: 18 });
    if (!v) return;
    const t = v.t;
    const o = v.in;
    if (kind === 'psi') {
      E.tone(o, t, { wave: 'sawtooth', f: 90, f2: 180, glide: dur, dur: dur + 0.15, attack: dur * 0.8, peak: 0.35, lp: 700, vib: [6, 12] });
      E.fm(o, t + dur * 0.4, { f: 233, ratio: 1.41, index: 3, dur: dur * 0.8, peak: 0.18 });
    } else if (kind === 'energy' || kind === 'fan') {
      E.tone(o, t, { wave: 'square', f: 300, f2: 1400, glide: dur, dur, attack: dur * 0.9, peak: 0.12, lp: 3000 });
      E.burst(o, t, { color: 'white', filter: 'bandpass', f: 1200, f2: 4200, q: 3, dur, attack: dur * 0.9, peak: 0.15 });
    } else if (kind === 'web') {
      E.burst(o, t, { color: 'pink', filter: 'bandpass', f: 2600, f2: 1200, q: 4, dur: 0.25, peak: 0.35 });
      E.tone(o, t + 0.05, { f: 500, f2: 260, dur: 0.15, peak: 0.15, vib: [40, 60] });
    } else {
      E.fm(o, t, { f: vary(392), ratio: 2.01, index: 1.2, dur: dur + 0.3, attack: dur * 0.6, peak: 0.22 });
      E.fm(o, t + dur * 0.5, { f: vary(587), ratio: 2.01, index: 0.8, dur: dur * 0.8, peak: 0.16 });
      E.burst(o, t, { color: 'white', filter: 'bandpass', f: 3000, q: 1.5, dur, attack: dur * 0.7, peak: 0.08 });
    }
  }

  // An enemy shot leaving: zaps for energy, a warbling moan for psi, a wet flick for acid, resin
  // and spines.
  enemyShot(pos, kind) {
    const E = this.E;
    if (!E.allow('eshot-' + kind, 0.04)) return;
    const v = E.voice({ pos, gain: 0.85, wet: 0.15, dur: 0.6, reach: 16 });
    if (!v) return;
    if (kind === 'energy') {
      E.tone(v.in, v.t, { wave: 'square', f: vary(1800), f2: 300, dur: 0.1, peak: 0.25, lp: 4000 });
      E.burst(v.in, v.t, { color: 'white', filter: 'highpass', f: 2500, dur: 0.04, attack: 0.0005, peak: 0.3 });
    } else if (kind === 'psi') {
      E.tone(v.in, v.t, { wave: 'sawtooth', f: vary(220), f2: 110, dur: 0.35, peak: 0.25, lp: 900, vib: [9, 14] });
    } else {
      E.burst(v.in, v.t, { color: 'pink', filter: 'lowpass', f: 1400, f2: 500, dur: 0.12, attack: 0.002, peak: 0.45 });
    }
  }

  // A razorhound (or the Behemoth calling its pack): rising, wavering, long.
  howl(pos, big = false) {
    const E = this.E;
    const v = E.voice({ pos, gain: big ? 0.9 : 0.6, wet: 0.55, dur: 2.6, reach: 45, priority: 2 });
    if (!v) return;
    const f = big ? 160 : 420;
    E.tone(v.in, v.t, { wave: 'sawtooth', f, f2: f * 1.45, glide: 0.5, dur: 1.6, attack: 0.25, peak: 0.25, lp: big ? 900 : 1800, vib: [5.5, f * 0.025] });
    E.tone(v.in, v.t + 0.05, { wave: 'triangle', f: f * 2, f2: f * 2.9, glide: 0.5, dur: 1.4, attack: 0.3, peak: 0.12, vib: [5.5, f * 0.05] });
    if (big) E.burst(E.drive(v.in, 2), v.t, { color: 'brown', filter: 'lowpass', f: 400, dur: 1.2, attack: 0.15, peak: 0.6 });
  }

  // A charge winding up: a snort and a growl, bigger with mass.
  roar(pos, mass = 1) {
    const E = this.E;
    const size = clamp(mass / 3, 0.4, 2);
    const v = E.voice({ pos, gain: 0.5 + 0.3 * size, wet: 0.3, dur: 1.2, reach: 24 });
    if (!v) return;
    E.burst(v.in, v.t, { color: 'pink', filter: 'bandpass', f: 1200, q: 1, dur: 0.12, attack: 0.01, peak: 0.4 });
    E.tone(E.drive(v.in, 3), v.t + 0.1, { wave: 'sawtooth', f: 110 / Math.sqrt(size), f2: 70 / Math.sqrt(size), dur: 0.7, attack: 0.15, peak: 0.35, lp: 600, vib: [22, 8] });
  }

  // A crawler's screech before it pounces.
  screech(pos) {
    const E = this.E;
    const v = E.voice({ pos, gain: 0.9, wet: 0.2, dur: 0.6, reach: 18 });
    if (!v) return;
    E.burst(v.in, v.t, { color: 'white', filter: 'bandpass', f: 3800, f2: 2200, q: 6, dur: 0.3, attack: 0.02, peak: 0.5 });
    E.tone(v.in, v.t, { wave: 'square', f: 1900, f2: 1400, dur: 0.25, peak: 0.08, vib: [60, 120] });
  }

  // Stepping through the void.
  blink(pos) {
    const E = this.E;
    const v = E.voice({ pos, gain: 0.5, wet: 0.4, dur: 0.8, reach: 20 });
    if (!v) return;
    E.whoosh(v.in, v.t, 0.3, 900, { peakAt: 0.85, q: 1.2, peak: 0.7 });
    E.fm(v.in, v.t + 0.25, { f: 311, ratio: 1.41, index: 2, dur: 0.4, peak: 0.2 });
  }

  // A blow turned on a shield: a heavy clang.
  block(pos) {
    const E = this.E;
    if (!E.allow('block', 0.05)) return;
    const v = E.voice({ pos, gain: 0.55, wet: 0.2, dur: 0.8, reach: 16 });
    if (!v) return;
    E.burst(v.in, v.t, { color: 'white', filter: 'bandpass', f: 1800, q: 1, dur: 0.03, attack: 0.0005, peak: 0.7 });
    E.ring(v.in, v.t, rnd(420, 520), 0.5, 0.3, [1, 2.76, 5.4]);
    E.tone(v.in, v.t, { f: 140, f2: 90, dur: 0.12, peak: 0.3 });
  }

  // A lit fuse hissing.
  fuse(pos, dur) {
    const E = this.E;
    const v = E.voice({ pos, gain: 0.25, wet: 0.05, dur: dur + 0.1, reach: 12 });
    if (!v) return;
    E.burst(v.in, v.t, { color: 'white', filter: 'highpass', f: 4500, dur, attack: 0.02, peak: 0.35 });
  }

  // Wards and mending: a bright shimmer.
  ward(pos, heal = false) {
    const E = this.E;
    const v = E.voice({ pos, gain: 0.35, wet: 0.45, dur: 1.2, reach: 18 });
    if (!v) return;
    for (const [i, f] of (heal ? [523, 659, 784] : [698, 880]).entries()) E.fm(v.in, v.t + i * 0.06, { f, ratio: 2.01, index: 0.6, dur: 0.6, peak: 0.18 });
    E.burst(v.in, v.t, { color: 'white', filter: 'bandpass', f: 5000, q: 2, dur: 0.5, peak: 0.08 });
  }
}
