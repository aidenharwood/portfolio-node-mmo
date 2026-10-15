// Public events on this screen (gameplay phase 6): what's going on near us — offline from the
// local world sim's director (sim/WorldEvents.js), online from the server's `wev` — on the HUD (a
// tracker under the minimap), the map, the minimap and the compass; banners as each one gathers,
// begins and ends; the things it stands up in the world (world/EventProps.js) with their health
// over them; the vote at a beacon (E there); and which settlements are overrun (their folk gone,
// their services shut: World.folkNear and World.npcById ask `world.overrun`).
import * as THREE from 'three';
import { EVENT_TYPES, TIER_NAMES, ELIGIBLE } from '../sim/WorldEvents.js';
import { EventProps } from '../world/EventProps.js';
import { esc } from './cards.js';

export const EVENT_COLOR = '#ff6a4a';
const PULL = 0.25;        // seconds between looks at the local director (offline)
const ANNOUNCE = 450;     // metres: events further off aren't announced, nor tracked on the HUD
const TIER_PAD = 60;      // as sim/WorldEvents.js: the event's tier is your Threat within its area plus this
const BEACON_REACH = 7;
const _v = new THREE.Vector3();

const fill = (text, v) => (text ?? '').replace('{place}', v.pl);
const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export class EventUI {
  constructor(game) {
    this.game = game;
    this.list = [];            // event views near us (sim/WorldEvents.js view())
    this.me = {};              // event id → [contribution points, vote, chest coming (1, 2: top)]
    this.seen = new Map();     // event id → the stage we last announced
    this.pullT = 0;
    this.key = '';
    this.props = new EventProps(game);
    this.labels = new Map();   // structure id → label element
    this.el = document.createElement('div');
    this.el.id = 'event';
    const wrap = document.getElementById('map-wrap');
    wrap?.insertBefore(this.el, document.getElementById('quests'));
  }

  get director() { return this.game.enemyLayer.sim?.director ?? null; }
  get here() { return this.game.player.position; }

  // A new game: nothing known yet. Online, the settlements overrun on this layer come with the
  // welcome; offline the director keeps its own (and hands the world the same map).
  reset(overrun = null) {
    this.list = [];
    this.me = {};
    this.seen.clear();
    this.key = '';
    this.props.clear();
    for (const el of this.labels.values()) el.remove();
    this.labels.clear();
    if (overrun) this.game.world.overrun = new Map(overrun.map((id) => [id, { id }]));
  }

  // Online: the server's word on the events near us.
  onState(msg) {
    this.list = Array.isArray(msg.l) ? msg.l : [];
    this.me = msg.me ?? {};
  }

  // A settlement overrun or freed: its folk go (or come back).
  onOverrun({ id, on }) {
    const map = this.game.world.overrun ??= new Map();
    if (on) map.set(id, { id });
    else map.delete(id);
  }

  update(dt) {
    const d = this.director;
    if (d && (this.pullT -= dt) <= 0) {
      this.pullT = PULL;
      const p = this.here;
      const evs = d.near(p.x, p.z);
      this.list = evs.map((ev) => d.view(ev));
      this.me = Object.fromEntries(evs.map((ev) => [ev.id, d.personal(ev, 0)]));
    }
    this.announce();
    this.props.update(dt, this.list);
    this.render();
    this.updateLabels();
  }

  dist(v) { return Math.hypot(v.x - this.here.x, v.z - this.here.z); }
  taking(v) { return (this.me[v.id]?.[0] ?? 0) > 0; }

  // Banners as an event near us gathers, begins and ends (once each).
  announce() {
    const g = this.game;
    const ids = new Set();
    for (const v of this.list) {
      ids.add(v.id);
      const was = this.seen.get(v.id);
      if (was === v.st) continue;
      this.seen.set(v.id, v.st);
      const T = EVENT_TYPES[v.k];
      if (!T || (this.dist(v) > ANNOUNCE && !this.taking(v))) continue;
      if (v.st === 'gather' && !was) {
        g.hud.banner(v.nm, fill(T.gather, v));
        g.chat?.add({ ch: 'system', text: `Public event: ${v.nm} — ${fill(T.gather, v)}` });
        g.audio.roar?.(_v.set(v.x, g.world.groundHeight(v.x, v.z), v.z), 2);
      } else if (v.st === 'active') {
        g.hud.banner(v.nm, `${fill(T.start, v)}${v.k !== 'retake' ? ` · ${TIER_NAMES[v.ti] ?? 'Normal'}` : ''}`);
      } else if (v.st === 'over' && was) {
        const text = fill(T[v.res] ?? (v.res === 'won' ? T.won : T.lost), v);
        g.hud.banner(v.res === 'won' ? text : v.nm, v.res === 'won' ? (this.me[v.id]?.[2] ? 'The event chest is yours — at the beacon' : 'Too little part in it for the chest') : text);
        if (v.res === 'lost' && T.settlement) g.chat?.add({ ch: 'system', text: `${v.pl} has fallen. Retake it before the garrison digs in.` });
      }
    }
    for (const id of this.seen.keys()) if (!ids.has(id)) this.seen.delete(id);
  }

  // The event that matters most to us: one we're taking part in, else the nearest near enough.
  focus() {
    let best = null;
    let bd = Infinity;
    for (const v of this.list) {
      const d = this.dist(v) - (this.taking(v) ? 1e4 : 0);
      if (d < bd && (this.dist(v) <= ANNOUNCE || this.taking(v))) { bd = d; best = v; }
    }
    return best;
  }

  // ---------------------------------------------------------------- the HUD tracker
  render() {
    const v = this.focus();
    const me = v ? this.me[v.id] ?? [0, -1, 0] : null;
    const key = v ? JSON.stringify([v, me, Math.round(this.dist(v) / 10)]) : '';
    if (key === this.key) return;
    this.key = key;
    if (!v) { this.el.innerHTML = ''; return; }
    const T = EVENT_TYPES[v.k] ?? {};
    const rows = [];
    let step = '';
    if (v.st === 'gather') {
      const [n, vet, el] = v.v ?? [0, 0, 0];
      step = `Gathering — ${v.tl ?? 0} s`;
      if (v.lk) rows.push('<li>Gather at the beacon · Normal tier (no vote)</li>');
      else rows.push(`<li>Vote the tier at the beacon (E): Normal ${n} · Veteran ${vet} · Elite ${el}${me[1] >= 0 ? ` — you: ${TIER_NAMES[me[1]]}` : ''}</li>`);
    } else if (v.st === 'active') {
      step = fill(T.start, v);
      if (v.ph === 'engines' && v.f) rows.push(`<li>Siege engines: ${v.f[0]} of ${v.f[1]} left</li>`);
      else if (v.k === 'surge' && v.f) rows.push(`<li class="${v.f[0] ? '' : 'done'}">Spore pods: ${v.f[0]} of ${v.f[1]} left</li>`);
      else if (v.k === 'retake' && v.f) rows.push(`<li>The garrison: ${v.f[0]} of ${v.f[1]} left${v.tl ? ` · ${clock(v.tl)}` : ''}</li>`);
      else if (v.k === 'walker' && v.wk) {
        // wk: [x, z, hull, max, couplings left, couplings, metres to go]. The event's centre is
        // the walker, so the maps and compass already follow it.
        const [, , hp, max, left, all, togo] = v.wk;
        rows.push(`<li class="${left ? '' : 'done'}">Couplings: ${left} of ${all} left</li>`);
        rows.push(`<li class="ev-bars"><span>Hull</span><i class="ev-hp walker ${left ? 'shielded' : ''}"><em style="width:${Math.max(0, hp / max) * 100}%"></em></i></li>`);
        rows.push(`<li>${togo} m from ${esc(v.pl)}</li>`);
      }
      if (v.w && (v.k !== 'siege' || v.ph === 'hold')) rows.push(`<li class="${v.w[0] >= v.w[1] ? 'done' : ''}">Wave ${Math.max(1, v.w[0])} of ${v.w[1]}</li>`);
      if (v.c !== undefined) rows.push(`<li>Beacon charge ${Math.floor(v.c * 100)}%${v.ct ? ' — contested!' : ''}</li>`);
      const bars = v.s.map(([, kind, , , hp, max]) => `<i class="ev-hp ${kind} ${hp <= 0 ? 'down' : ''}"><em style="width:${Math.max(0, hp / max) * 100}%"></em></i>`).join('');
      if (bars) rows.push(`<li class="ev-bars"><span>${v.k === 'anomaly' ? 'Beacon' : 'Pylons'}</span>${bars}</li>`);
    } else step = v.res === 'won' ? fill(T.won, v) : fill(T[v.res] ?? T.lost, v);
    const part = me[0] > 0 ? `Your part: ${me[0]}${me[0] < ELIGIBLE && v.st === 'active' ? ` (${ELIGIBLE} for the chest)` : ''}` : `${Math.round(this.dist(v))} m away`;
    this.el.innerHTML = `<div class="ev-card ${v.st} ${v.res ?? ''}"><b>${esc(v.nm)}</b><p>${esc(step)}</p>${rows.length ? `<ul>${rows.join('')}</ul>` : ''}`
      + `<small>${v.k !== 'retake' && v.st !== 'gather' ? `${TIER_NAMES[v.ti] ?? 'Normal'} · ` : ''}${v.n > 1 ? `${v.n} taking part · ` : ''}${esc(part)}</small></div>`;
  }

  // Health over each thing to defend, when it's close.
  updateLabels() {
    const g = this.game;
    const w = document.documentElement.clientWidth || window.innerWidth;
    const h = document.documentElement.clientHeight || window.innerHeight;
    const layer = document.getElementById('labels');
    const seen = new Set();
    for (const v of this.list) {
      if (v.st !== 'active') continue;
      for (const [sid, kind, x, z, hp, max] of v.s) {
        if (hp <= 0 || Math.hypot(x - this.here.x, z - this.here.z) > 60) continue;
        seen.add(sid);
        let el = this.labels.get(sid);
        if (!el) {
          el = document.createElement('div');
          el.className = 'ev-plate';
          el.innerHTML = `<span>${kind === 'beacon' ? 'Maker Beacon' : 'Warden Pylon'}</span><i><em></em></i>`;
          layer?.appendChild(el);
          this.labels.set(sid, el);
        }
        el.querySelector('em').style.width = `${Math.max(0, hp / max) * 100}%`;
        _v.set(x, g.world.groundHeight(x, z), z);
        const xy = g.labels.project(_v, kind === 'beacon' ? 5.6 : 4.5, w, h);
        if (!xy) { el.style.display = 'none'; continue; }
        el.style.display = '';
        el.style.transform = `translate(${xy[0]}px, ${xy[1]}px) translate(-50%, -100%)`;
      }
    }
    for (const [sid, el] of this.labels) {
      if (seen.has(sid)) continue;
      el.remove();
      this.labels.delete(sid);
    }
  }

  // ---------------------------------------------------------------- the vote
  // A gathering event's beacon to vote at (main.js offers it with the other things to use).
  interactables() {
    const out = [];
    for (const v of this.list) {
      // A quest's event (`lk`: its tier locked at Normal) has no vote.
      if (v.st !== 'gather' || v.lk) continue;
      out.push({ kind: 'beacon', id: v.id, name: 'Event Beacon', ev: v, position: new THREE.Vector3(v.bx, this.game.world.groundHeight(v.bx, v.bz), v.bz) });
    }
    return out;
  }

  prompt(it) { return `Vote the tier for ${it.ev.nm}`; }

  // E at the beacon: Normal, Veteran or Elite (the most votes win; a tie goes lower).
  voteDialog(it) {
    const g = this.game;
    const v = this.list.find((x) => x.id === it.id) ?? it.ev;
    const counts = v.v ?? [0, 0, 0];
    const mine = this.me[v.id]?.[1] ?? -1;
    g.dialogue.open({
      name: v.nm, title: 'Event Beacon',
      text: `It starts in ${v.tl ?? 0} seconds. Everyone here fights at the tier with the most votes: harder enemies, better rewards.`,
      options: TIER_NAMES.map((name, tier) => ({
        label: `${name}${counts[tier] ? ` (${counts[tier]})` : ''}${mine === tier ? ' — your vote' : ''}`,
        action: ['Enemies as they come', 'Enemies hit harder and shrug off more · better loot, +25% XP', 'Much harder · much better loot, +50% XP'][tier],
        onClick: () => { this.vote(v.id, tier); g.closeMenus(); },
      })),
    });
  }

  vote(id, tier) {
    const d = this.director;
    if (d) d.vote(0, id, tier);
    else this.game.net.send({ t: 'evote', id, tier });
    this.game.hud.toast(`Voted ${TIER_NAMES[tier]}`);
  }

  // ---------------------------------------------------------------- the tier, and the maps
  // The tier that's our Threat while we're in an event under way (online the server works out the
  // same from where it has us).
  tierAt(pos) {
    const d = this.director;
    if (d) return d.tierFor(0, pos);
    for (const v of this.list) if (v.st === 'active' && Math.hypot(pos.x - v.x, pos.z - v.z) <= v.r + TIER_PAD) return v.ti;
    return null;
  }

  // For the minimap, the map and the compass: each event's centre, area and state.
  markers() {
    return this.list.filter((v) => v.st !== 'over' || v.res === 'won').map((v) => ({ id: v.id, x: v.x, z: v.z, r: v.r, name: v.nm, stage: v.st, kind: v.k }));
  }

  // The marker the compass points at: the event we're in or the nearest one announced.
  compassTarget() {
    const v = this.focus();
    return v && v.st !== 'over' ? { x: v.x, z: v.z } : null;
  }
}
