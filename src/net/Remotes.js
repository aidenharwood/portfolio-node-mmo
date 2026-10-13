// The other players around us: created and removed as the realm brings them into and out of
// view, fed their network states, and their effects (shots, spells, runes) replayed here as
// cosmetics — combat between players and the world is resolved by its owner until the server
// takes it over (docs/MULTIPLAYER.md).
import * as THREE from 'three';
import { RemotePlayer } from './RemotePlayer.js';

const INTERP_DELAY = 120; // ms: render others this far in the past (a little over two send intervals)
const FX_STALE = 400;     // ms: effects older than this when a frame comes round are dropped
const MAX_PENDING_FX = 200;
const _o = new THREE.Vector3();
const _d = new THREE.Vector3();

export class Remotes {
  constructor(game) {
    this.game = game;
    this.byId = new Map();
    this.list = [];
    this.timers = [];
    this.pending = [];
  }

  add(msg) {
    this.remove(msg.id);
    const r = new RemotePlayer(this.game, msg);
    this.game.scene.add(r.root);
    this.byId.set(msg.id, r);
    this.list = [...this.byId.values()];
  }

  remove(id) {
    const r = this.byId.get(id);
    if (!r) return;
    this.game.scene.remove(r.root);
    this.game.labels.forget(r);
    r.dispose();
    this.byId.delete(id);
    this.list = [...this.byId.values()];
  }

  clear() {
    for (const id of [...this.byId.keys()]) this.remove(id);
    this.timers.length = 0;
    this.pending.length = 0;
  }

  look(msg) {
    this.byId.get(msg.id)?.applyProfile(msg);
  }

  // Effects wait for the next frame (and are dropped if they've gone stale), so a backgrounded
  // tab — no frames, messages still arriving — doesn't pile up a backlog of shots to replay.
  snap(msg) {
    for (const [id, rt, s] of msg.ps) this.byId.get(id)?.push(rt, s);
    const at = performance.now();
    for (const [id, fx] of msg.fx ?? []) {
      if (this.pending.length < MAX_PENDING_FX) this.pending.push({ id, fx, at });
    }
  }

  playFx(r, fx) {
    const g = this.game;
    if (fx.k === 'shot') {
      _o.fromArray(fx.o);
      _d.fromArray(fx.d);
      if (_d.lengthSq() < 1e-6) return;
      g.projectiles.spawn({
        kind: fx.pk, owner: r, origin: _o, direction: _d, color: fx.c, speed: fx.sp, life: Math.min(fx.lf, 5),
        gravity: fx.gv, size: fx.sz, aoe: fx.ao ?? 0, tracerColor: fx.tc, bright: !!fx.br, tracerScale: fx.ts,
        accel: fx.ac ?? 0, maxSpeed: fx.ms ?? 0,
      });
      if (fx.m) {
        const w = r.weapon;
        g.effects.spawnMuzzle(_o, fx.c, fx.pk === 'bullet' ? _d : null, w?.type === 'shotgun' || w?.type === 'sniper' ? 1.4 : 1);
        if (w?.cls === 'magic') g.audio.cast(w, (fx.sz ?? 1) > 1.2, _o);
        else if (w?.cls === 'ranged') g.audio.shot(w, _o);
      }
    } else if (fx.k === 'ab') {
      g.player.abilities.playRemote(r, fx);
    } else if (fx.k === 'rune') {
      const pos = new THREE.Vector3().fromArray(fx.p);
      const delay = Math.min(fx.dl, 3);
      g.effects.spawnRune(pos, fx.r, fx.c, delay);
      g.audio.rune(pos, delay);
      this.timers.push({ t: delay, fn: () => {
        g.explode(pos, fx.r, 0, r, r.weapon, { color: fx.c });
        g.effects.spawnPillar(pos, fx.r, fx.c);
      } });
    }
  }

  update(dt) {
    const T = this.game.net.serverNow() - INTERP_DELAY;
    for (const r of this.list) r.update(dt, T);
    const now = performance.now();
    for (const { id, fx, at } of this.pending) {
      const r = this.byId.get(id);
      if (r && now - at < FX_STALE) this.playFx(r, fx);
    }
    this.pending.length = 0;
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const tm = this.timers[i];
      if ((tm.t -= dt) <= 0) { this.timers.splice(i, 1); tm.fn(); }
    }
  }
}
