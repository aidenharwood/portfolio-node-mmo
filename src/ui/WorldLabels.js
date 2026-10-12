// Screen-projected labels for world things: enemy nameplates, NPC names + quest markers,
// loot names (so you can scan the ground), and a quest waypoint clamped to the screen edge.
import * as THREE from 'three';
import { RARITY } from '../items/rarity.js';
import { esc } from './cards.js';

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
        const key = `${e.level}|${p.alive}`;
        if (el._key !== key) {
          el._key = key;
          el.innerHTML = `<div class="np-name" style="color:${levelColor(e.level - game.stats.level)}">Lv ${e.level} ${esc(e.displayName)}</div><div class="np-bar"><div></div></div>`;
          el._bar = el.querySelector('.np-bar div');
        }
        el._bar.style.width = `${(e.hp / e.maxHp) * 100}%`;
        el.classList.toggle('targeted', game.aim.target === e);
        this.place(el, this.project(e.position, e.height + 0.35, w, h));
      }

      for (const n of game.npcs) {
        const d = n.position.distanceTo(p.position);
        if (d > 26) continue;
        const el = this.el(n, 'npc-label');
        seen.add(n);
        const marker = n.marker;
        const key = marker ?? '';
        if (el._key !== key) {
          el._key = key;
          el.innerHTML = `${marker ? `<div class="marker">${marker}</div>` : ''}<div class="np-name">${esc(n.name)}</div><div class="np-title">${esc(n.title)}</div>`;
        }
        this.place(el, this.project(n.position, n.height + 0.3, w, h));
      }

      // Other players: name, level and health.
      for (const r of game.remotes?.list ?? []) {
        const d = r.position.distanceTo(p.position);
        if (d > 70) continue;
        const el = this.el(r, 'player-label');
        el.classList.toggle('party', !!game.partyUI?.isMate(r.netId));
        seen.add(r);
        const key = `${r.name}|${r.level}|${r.tag}`;
        if (el._key !== key) {
          el._key = key;
          el.innerHTML = `<div class="np-name"><span class="np-lv">${r.level}</span>${esc(r.name)}${r.tag ? ` <small class="np-tag">[${esc(r.tag)}]</small>` : ''}</div><div class="np-bar"><div></div></div>`;
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
        if (!wp) continue;
        const el = this.el(key, cls);
        seen.add(key);
        const dist = Math.round(Math.hypot(wp.x - p.position.x, wp.z - p.position.z));
        el.innerHTML = `<div class="wp-diamond"></div><div class="wp-dist">${dist}m</div>`;
        _v.set(wp.x, game.world.groundHeight(wp.x, wp.z) + 2, wp.z).project(this.camera);
        let x = _v.x;
        let y = _v.y;
        if (_v.z > 1) { x = -x; y = -y; }
        const off = _v.z > 1 || Math.abs(x) > 0.9 || Math.abs(y) > 0.85;
        if (off) {
          const k = Math.min(0.9 / Math.max(Math.abs(x), 1e-3), 0.85 / Math.max(Math.abs(y), 1e-3));
          x *= k;
          y *= k;
        }
        el.classList.toggle('edge', off);
        el.style.display = dist < 6 ? 'none' : '';
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
