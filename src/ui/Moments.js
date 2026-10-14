// Story moments (rpg/storyline.js MOMENTS): a few camera shots over a place, with lines spoken
// under a letterbox and, for the big ones, a title card — skippable (Esc, Space, Enter, a click or
// a tap). While one plays the camera is the moment's and the character takes no input; the world
// goes on (online it can't be paused, and a moment is only seconds long). Shots are framed from the
// anchor's front: offsets turn with a place's `rot` (or a person's facing, or the player's).
import * as THREE from 'three';
import { MOMENTS } from '../rpg/storyline.js';
import { esc } from './cards.js';

const EASE = (t) => t * t * (3 - 2 * t);
const _from = new THREE.Vector3();
const _look = new THREE.Vector3();

export class Moments {
  constructor(game) {
    this.game = game;
    this.el = document.createElement('div');
    this.el.id = 'moment';
    this.el.className = 'hidden';
    this.el.innerHTML = '<div class="mo-bar top"></div><div class="mo-title"></div><div class="mo-line"></div><div class="mo-bar bottom"><small>Esc · Space · click to skip</small></div>';
    document.body.appendChild(this.el);
    this.el.addEventListener('pointerdown', (e) => { e.preventDefault(); this.skip(); });
    this.playing = null;
    this.queue = [];
    this.cam = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
  }

  get active() { return !!this.playing; }

  play(id) {
    const M = MOMENTS[id];
    if (!M) return;
    if (this.playing) {
      if (!this.queue.includes(id) && this.playing.id !== id) this.queue.push(id);
      return;
    }
    const anchor = this.anchorOf(M.at);
    if (!anchor) return;
    // A moment from a conversation or objective takes over any open game panel. In particular,
    // reaching the Brightwater waystone can complete its quest while the map is open.
    if (this.game.dialogue?.isOpen || this.game.menu?.isOpen || this.game.state === 'menu') this.game.closeMenus();
    this.game.player.inCutscene = true;
    this.game.player.invulnTimer = Math.max(this.game.player.invulnTimer, 1.2);
    this.playing = { id, M, anchor, shot: 0, t: 0, total: 0 };
    this.el.classList.remove('hidden');
    document.body.classList.add('in-moment');
    const title = this.el.querySelector('.mo-title');
    title.innerHTML = M.title ? `<b>${esc(M.title[0])}</b>${M.title[1] ? `<small>${esc(M.title[1])}</small>` : ''}` : '';
    title.classList.toggle('on', !!M.title);
    this.showShot(0);
    this.game.audio?.chime?.();
  }

  // Where a moment's shots are framed from: the player, or a place or person the story names.
  anchorOf(ref, shotAt = null) {
    const g = this.game;
    const key = shotAt ?? ref;
    if (key === 'player') {
      const p = g.player.position;
      return { x: p.x, y: p.y, z: p.z, rot: g.player.facing ?? 0 };
    }
    const t = g.quests.ref(key);
    if (!t) return null;
    return { x: t.x, y: g.world.groundHeight(t.x, t.z), z: t.z, rot: t.rot ?? 0 };
  }

  showShot(i) {
    const P = this.playing;
    const s = P.M.shots[i];
    P.shot = i;
    P.t = 0;
    P.from = s.at ? this.anchorOf(s.at, s.at) ?? P.anchor : P.anchor;
    const line = this.el.querySelector('.mo-line');
    line.innerHTML = s.line ? `${s.line[0] ? `<b>${esc(s.line[0])}</b>` : ''}<p>${esc(s.line[1])}</p>` : '';
    line.classList.toggle('on', !!s.line);
  }

  // Each frame while playing: the camera eases along the shot (a slow push in), the next shot
  // when this one's time is up, and the end.
  update(dt, camera) {
    const P = this.playing;
    if (!P) return;
    P.t += dt;
    P.total += dt;
    const s = P.M.shots[P.shot];
    if (P.total > 2.6) this.el.querySelector('.mo-title').classList.remove('on');
    if (P.t >= s.t) {
      if (P.shot + 1 < P.M.shots.length) this.showShot(P.shot + 1);
      else return this.end();
    }
    const a = P.from;
    const k = EASE(Math.min(1, P.t / s.t));
    const push = 1 - 0.12 * k;
    const [fx, fy, fz] = s.from;
    const c = Math.cos(a.rot);
    const sn = Math.sin(a.rot);
    _from.set(a.x + (c * fx + sn * fz) * push, a.y + fy * push, a.z + (-sn * fx + c * fz) * push);
    _look.set(a.x, a.y + (s.lift ?? 1.5), a.z);
    camera.position.copy(_from);
    camera.lookAt(_look);
  }

  skip() { if (this.playing) this.end(); }

  end() {
    this.playing = null;
    this.el.classList.add('hidden');
    document.body.classList.remove('in-moment');
    this.game.player.inCutscene = false;
    const next = this.queue.shift();
    if (next) this.play(next);
  }
}
