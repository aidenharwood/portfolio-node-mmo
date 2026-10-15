// Screen-projected labels for world things: enemy nameplates, NPC names + quest markers,
// loot names (so you can scan the ground), and a quest waypoint clamped to the screen edge.
import * as THREE from 'three';
import { RARITY } from '../items/rarity.js';
import { esc } from './cards.js';
import { AFFIXES } from '../sim/affixes.js';
import { marksHtml, markHtml } from './questMarks.js';

const css = (hex) => `#${(hex ?? 0xffd23f).toString(16).padStart(6, '0')}`;
// Quest marks over folk and props (ui/questMarks.js): all that apply, in a line; names and titles
// up close, the marks alone further out.
const LABEL_NEAR = 26;  // names and titles this close...
const MARKER_FAR = 80;  // ...and quest marks out to here (folk are built from 85 m: main.js FOLK_NEAR)

const _v = new THREE.Vector3();

function levelColor(diff) {
  if (diff >= 3) return '#ff5a5a';
  if (diff >= 1) return '#ffb347';
  if (diff <= -3) return '#9a9a9a';
  if (diff <= -1) return '#7be07b';
  return '#ffffff';
}

export class WorldLabels {
  constructor(layer, camera) {
    this.layer = layer;
    this.camera = camera;
    this.els = new Map();
  }

  el(key, cls) {
    let el = this.els.get(key);
    if (!el) {
      el = document.createElement('div');
      el.className = cls;
      this.layer.appendChild(el);
      this.els.set(key, el);
    }
    return el;
  }

  forget(key) {
    this.els.get(key)?.remove();
    this.els.delete(key);
  }

  // Returns screen coords or null if behind the camera / off-screen.
  project(pos, yOffset, w, h) {
    _v.set(pos.x, pos.y + yOffset, pos.z).project(this.camera);
    if (_v.z > 1 || Math.abs(_v.x) > 1.1 || Math.abs(_v.y) > 1.1) return null;
    return [((_v.x + 1) / 2) * w, ((1 - _v.y) / 2) * h];
  }

  place(el, xy) {
    if (!xy) { el.style.display = 'none'; return; }
    el.style.display = '';
    el.style.transform = `translate(${xy[0]}px, ${xy[1]}px) translate(-50%, -100%)`;
  }

  update(game) {
    const seen = new Set();
    const marked = []; // where folk with marks on screen stand (see the waypoint, below)
    const w = document.documentElement.clientWidth || window.innerWidth;
    const h = document.documentElement.clientHeight || window.innerHeight;
    const p = game.player;
    const playing = game.state === 'playing' || game.state === 'dead';

    if (playing) {
      for (const e of game.enemies) {
        if (!e.alive || e.state === 'spawn') continue;
        const d = e.position.distanceTo(p.position);
        if (d > 34 || (!e.engaged && d > 20 && e.hp >= e.maxHp)) continue;
        const el = this.el(e, 'plate');
        seen.add(e);
        const key = `${e.level}|${p.alive}|${game.stats.level}`;
        if (el._key !== key) {
          el._key = key;
          // An elite's affixes (and whether it's a champion) under its name, in their colours.
          const tags = [...(e.champion ? ['<b>Champion</b>'] : []), ...e.affixes.map((id) => `<span style="color:${css(AFFIXES[id]?.color)}">${AFFIXES[id]?.name ?? id}</span>`)];
          el.innerHTML = `<div class="np-name" style="color:${levelColor(e.level - game.stats.level)}">Lv ${e.level} ${esc(e.displayName)}</div>`
            + `${tags.length ? `<div class="np-affix">${tags.join(' · ')}</div>` : ''}<div class="np-bar"><div></div>${e.shieldMax ? '<i></i>' : ''}</div>`;
          el._bar = el.querySelector('.np-bar div');
          el._shield = el.querySelector('.np-bar i');
        }
        el._bar.style.width = `${(e.hp / e.maxHp) * 100}%`;
        if (el._shield) el._shield.style.width = `${Math.max(0, e.shield / e.shieldMax) * 100}%`;
        el.classList.toggle('targeted', game.aim.target === e);
        this.place(el, this.project(e.position, e.height + 0.35, w, h));
      }

      for (const n of [...game.npcs, ...(game.props?.values() ?? [])]) {
        const d = n.position.distanceTo(p.position);
        if (d > (n.role === 'flavor' ? 12 : MARKER_FAR)) continue;
        const marks = n.marks ?? [];
        // Past the names' reach, only those with a mark over them.
        if (d > LABEL_NEAR && !marks.length) continue;
        const el = this.el(n, 'npc-label');
        seen.add(n);
        // What they call out as you come near (main.js updateBarks), for a few seconds.
        const say = n.bark && n.bark.until > game.time ? n.bark.text : '';
        const key = `${marks.map((m) => `${m.state}.${m.tone}.${m.kind}.${m.n}`).join(',')}|${say}`;
        if (el._key !== key) {
          el._key = key;
          el.innerHTML = `${say ? `<div class="np-say">${esc(say)}</div>` : ''}${marks.length ? marksHtml(marks) : ''}<div class="np-name">${esc(n.name)}</div><div class="np-title">${esc(n.title ?? '')}</div>`;
        }
        // (Touch layouts show the titles of townsfolk only up close.)
        el.classList.toggle('far', d > 10 && !marks.length);
        // Far off, just the marks (smaller with distance).
        el.classList.toggle('marker-only', d > LABEL_NEAR);
        el.style.setProperty('--qm-scale', d > LABEL_NEAR ? Math.max(0.6, 1 - (d - LABEL_NEAR) / 90).toFixed(2) : '1');
        const xy = this.project(n.position, n.height + 0.3, w, h);
        this.place(el, xy);
        // (Their marks on screen stand in for the tracked waypoint, when it's them it leads to.)
        if (xy && marks.length) marked.push(n.position);
      }

      // Other players: name, level and health.
      for (const r of game.remotes?.list ?? []) {
        const d = r.position.distanceTo(p.position);
        if (d > 70) continue;
        const el = this.el(r, 'player-label');
        el.classList.toggle('party', !!game.partyUI?.isMate(r.netId));
        seen.add(r);
        const key = `${r.name}|${r.level}|${r.tag}|${r.title}`;
        if (el._key !== key) {
          el._key = key;
          el.innerHTML = `<div class="np-name"><span class="np-lv">${r.level}</span>${esc(r.name)}${r.tag ? ` <small class="np-tag">[${esc(r.tag)}]</small>` : ''}</div>${r.title ? `<div class="np-title">${esc(r.title)}</div>` : ''}<div class="np-bar"><div></div></div>`;
          el._bar = el.querySelector('.np-bar div');
        }
        el._bar.style.width = `${r.hpFrac * 100}%`;
        el.style.opacity = d > 45 ? 0.6 : 1;
        this.place(el, this.project(r.position, r.height + 0.45, w, h));
      }

      for (const d of game.drops) {
        const dist = d.position.distanceTo(p.position);
        if (dist > 16 && d.tier < 3) continue;
        if (dist > 40) continue;
        const el = this.el(d, 'loot-label');
        seen.add(d);
        if (!el._key) {
          el._key = 1;
          el.textContent = d.weapon.name;
          el.style.color = RARITY[d.weapon.rarity].css;
        }
        el.classList.toggle('focus', game.focusedDrop === d);
        el.style.opacity = d.remaining < 8 ? 0.5 : 1;
        this.place(el, this.project(d.position, 1.25, w, h));
      }

      for (const [key, wp, cls] of [['waypoint', game.questWaypoint(), 'waypoint'], ['marker', game.customMarker, 'waypoint custom']]) {
        // The quest waypoint gives way to the overhead marks of whoever it leads to, while those show.
        const atMarked = key === 'waypoint' && marked.some((m) => Math.hypot(m.x - wp?.x, m.z - wp?.z) < 2.5);
        if (!wp) continue;
        const el = this.el(key, cls);
        seen.add(key);
        const dist = Math.round(Math.hypot(wp.x - p.position.x, wp.z - p.position.z));
        // The tracked quest's waypoint wears its mark (as over the head of whoever it leads to).
        const html = `${wp.mark ? markHtml(wp.mark) : '<div class="wp-diamond"></div>'}<div class="wp-dist">${dist}m</div>`;
        if (el._html !== html) { el._html = html; el.innerHTML = html; }
        _v.set(wp.x, game.world.groundHeight(wp.x, wp.z) + 2, wp.z).project(this.camera);
        let x = _v.x;
        let y = _v.y;
        if (_v.z > 1) { x = -x; y = -y; }
        // (Touch layouts keep it off the top and bottom rows of buttons and bars.)
        const ey = game.touchActive ? 0.65 : 0.85;
        const off = _v.z > 1 || Math.abs(x) > 0.9 || Math.abs(y) > ey;
        if (off) {
          const k = Math.min(0.9 / Math.max(Math.abs(x), 1e-3), ey / Math.max(Math.abs(y), 1e-3));
          x *= k;
          y *= k;
        }
        el.classList.toggle('edge', off);
        el.style.display = dist < 6 || atMarked ? 'none' : '';
        el.style.transform = `translate(${((x + 1) / 2) * w}px, ${((1 - y) / 2) * h}px) translate(-50%, -50%)`;
      }
    }

    for (const [key, el] of this.els) {
      if (!seen.has(key)) {
        el.remove();
        this.els.delete(key);
      }
    }
  }
}
