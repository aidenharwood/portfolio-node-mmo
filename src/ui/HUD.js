// In-game overlay: vitals, gold, compass, zone name, quest tracker, boss bar, reticle + hit
// markers, damage-direction arcs, low-health vignette, weapon card with magazine pips, weapon
// slots, focused-loot card, interaction prompt, banners and toasts.
import { RARITY } from '../items/rarity.js';
import { MANUFACTURERS } from '../items/manufacturers.js';
import { ELEMENTS } from '../items/elements.js';
import { WEAPON_TYPES } from '../items/weaponTypes.js';
import { itemCardHTML, esc } from './cards.js';
import { isArmor } from '../items/items.js';

const $ = (id) => document.getElementById(id);
const TAU = Math.PI * 2;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const COMPASS_PX = 260; // pixels per radian of heading

export class HUD {
  constructor(thumbs) {
    this.thumbs = thumbs;
    this.el = {
      lvl: $('lvl'), hpFill: $('hp-fill'), hpLag: $('hp-lag'), hpText: $('hp-text'),
      stFill: $('st-fill'), mpFill: $('mp-fill'), xpFill: $('xp-fill'), gold: $('gold'), points: $('points'),
      zone: $('zone'), banner: $('banner'), toast: $('toast'), prompt: $('prompt'),
      slots: $('slots'), ammo: $('ammo'), loot: $('loot-card'), quests: $('quests'),
      combo: $('combo'), comboMult: $('combo-mult'), comboCount: $('combo-count'), comboTimer: $('combo-timer'),
      boss: $('bossbar'), bossName: $('boss-name'), bossFill: $('boss-fill'),
      reticle: $('reticle'), charge: $('charge'), hitmarker: $('hitmarker'),
      overlay: $('overlay'), overlayTitle: $('overlay-title'), overlaySub: $('overlay-sub'), overlayButtons: $('overlay-buttons'),
      mpText: $('mp-text'), xpText: $('xp-text'), vignette: $('vignette'), dmgdir: $('dmgdir'),
      wpnCard: $('wpn-card'), wpnName: $('wpn-name'), wpnSub: $('wpn-sub'), mag: $('mag'), compass: $('compass-strip'),
    };
    this.hurtFlash = 0;
    this.arcs = [];
    this.buildCompass();
    this.hpLag = 1;
    this.bannerTime = 0;
    this.toastTime = 0;
    this.hitTime = 0;
    this.keys = {};
  }

  // Only touch innerHTML when the content key changes.
  setHTML(name, key, build) {
    if (this.keys[name] === key) return;
    this.keys[name] = key;
    this.el[name].innerHTML = build();
  }

  update(dt, game) {
    const p = game.player;
    const s = game.stats;
    const e = this.el;
    const hpFrac = p.hp / p.maxHp;
    this.hpLag = this.hpLag > hpFrac ? Math.max(hpFrac, this.hpLag - dt * 0.5) : hpFrac;
    e.hpFill.style.width = `${hpFrac * 100}%`;
    e.hpLag.style.width = `${this.hpLag * 100}%`;
    e.hpText.textContent = `${Math.ceil(p.hp)} / ${p.maxHp}`;
    e.stFill.style.width = `${(p.stamina / p.maxStamina) * 100}%`;
    e.mpFill.style.width = `${(p.mana / p.maxMana) * 100}%`;
    e.mpText.textContent = `${Math.floor(p.mana)}`;
    e.xpFill.style.width = `${(s.xp / s.xpToNext()) * 100}%`;
    e.xpText.textContent = `${s.xp} / ${s.xpToNext()} XP`;
    e.hpFill.parentElement.classList.toggle('low', hpFrac < 0.3 && p.alive);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 2.5);
    const low = p.alive && hpFrac < 0.3 ? 0.5 + 0.22 * Math.sin(performance.now() / 180) : 0;
    e.vignette.style.opacity = Math.min(1, Math.max(low, this.hurtFlash));
    this.updateArcs(dt, game);
    this.updateCompass(game);
    e.lvl.textContent = s.level;
    e.gold.textContent = `${s.gold}g`;
    e.points.style.display = s.points > 0 ? '' : 'none';
    e.points.textContent = `+${s.points} attribute points — press P`;

    this.renderSlots(p);
    this.renderWeapon(p);

    const showCombo = p.combo > 0;
    e.combo.style.display = showCombo ? '' : 'none';
    if (showCombo) {
      e.comboMult.textContent = `×${p.comboMult.toFixed(1)}`;
      e.comboCount.textContent = `COMBO ${p.combo}`;
      e.comboTimer.style.width = `${Math.max(0, p.comboTimer / 3) * 100}%`;
      e.combo.classList.toggle('hot', p.comboMult >= 2);
    }
    this.renderQuests(game);
    this.renderBoss(game);
    this.renderReticle(dt, game);

    this.bannerTime -= dt;
    e.banner.style.opacity = Math.max(0, Math.min(1, this.bannerTime));
    this.toastTime -= dt;
    e.toast.style.opacity = Math.max(0, Math.min(1, this.toastTime * 2));
  }

  // Active weapon card: name in rarity colour, type/maker/element, big ammo count and pips.
  renderWeapon(p) {
    const e = this.el;
    const w = p.weapon;
    e.wpnCard.style.display = w ? '' : 'none';
    if (!w) return;
    const key = `${w.uid}`;
    if (this.keys.wpn !== key) {
      this.keys.wpn = key;
      e.wpnCard.style.setProperty('--rc', RARITY[w.rarity].css);
      e.wpnName.textContent = w.name;
      const el = w.element !== 'none' ? ` · ${ELEMENTS[w.element].label}` : '';
      e.wpnSub.textContent = `${WEAPON_TYPES[w.type].label} · ${MANUFACTURERS[w.manufacturer].name}${el}`;
      this.keys.mag = null;
    }
    if (w.cls === 'ranged') {
      const mag = w.stats.magSize;
      if (p.reloadTimer > 0) {
        const k = 1 - p.reloadTimer / w.stats.reloadTime;
        e.ammo.innerHTML = `<span class="rl">RELOADING ${Math.round(k * 100)}%</span>`;
      } else e.ammo.innerHTML = `${w.ammo}<small> / ${mag}</small>`;
      e.ammo.classList.toggle('low', w.ammo <= Math.ceil(mag * 0.25) && p.reloadTimer <= 0);
      const magKey = `${w.ammo}|${mag}`;
      if (this.keys.mag !== magKey) {
        this.keys.mag = magKey;
        e.mag.innerHTML = mag <= 40 ? Array.from({ length: mag }, (_, i) => `<i class="${i < w.ammo ? '' : 'spent'}"></i>`).join('') : '';
      }
    } else {
      e.ammo.classList.remove('low');
      e.ammo.innerHTML = w.cls === 'magic' ? `${Math.round(w.stats.manaCost)}<small> MP / cast</small>` : (p.combo > 0 ? `${p.combo}<small> hits</small>` : '');
      if (this.keys.mag !== 'none') { this.keys.mag = 'none'; e.mag.innerHTML = ''; }
    }
  }

  // Compass strip: ticks every 15°, cardinal letters, and diamonds for the quest/custom markers.
  buildCompass() {
    const strip = this.el.compass;
    const parts = [];
    for (let d = 0; d < 360; d += 15) {
      const card = { 0: 'N', 90: 'E', 180: 'S', 270: 'W', 45: 'NE', 135: 'SE', 225: 'SW', 315: 'NW' }[d];
      parts.push(card ? `<span class="cd ${d === 0 ? 'n' : ''}" data-b="${d}">${card}</span>` : `<i class="tick ${d % 45 === 0 ? 'major' : ''}" data-b="${d}"></i>`);
    }
    parts.push('<i class="mk" data-mk="quest"></i><i class="mk custom" data-mk="custom"></i>');
    // Party members (up to three others).
    for (let i = 0; i < 3; i++) parts.push(`<i class="mk party" data-mk="party${i}"></i>`);
    strip.innerHTML = parts.join('');
    this.compassItems = [...strip.children].map((el) => ({ el, b: el.dataset.b !== undefined ? (+el.dataset.b * Math.PI) / 180 : null, mk: el.dataset.mk }));
  }

  updateCompass(game) {
    const heading = wrap(-game.rig.yaw);
    const p = game.player.position;
    const qw = game.questWaypoint();
    const cm = game.customMarker;
    const mates = (game.partyUI?.mates ?? []).filter((m) => m.online && m.known);
    for (const it of this.compassItems) {
      let b = it.b;
      if (it.mk) {
        const t = it.mk === 'quest' ? qw : it.mk === 'custom' ? cm : mates[+it.mk.slice(5)];
        if (!t) { it.el.style.display = 'none'; continue; }
        it.el.style.display = '';
        b = Math.atan2(t.x - p.x, -(t.z - p.z));
      }
      let x = wrap(b - heading) * COMPASS_PX;
      if (it.mk) x = Math.max(-200, Math.min(200, x));
      it.el.style.transform = `translateX(${x.toFixed(1)}px)${it.el.classList.contains('cd') ? ' translateX(-50%)' : it.mk ? ' rotate(45deg)' : ''}`;
      it.el.style.opacity = Math.abs(x) > 230 ? 0 : 1;
    }
  }

  // A red arc at the screen edge pointing to whoever just hurt you.
  damageFrom(game, pos) {
    this.hurtFlash = Math.max(this.hurtFlash, 0.6);
    if (!pos) return;
    const p = game.player.position;
    const el = document.createElement('div');
    el.className = 'ddir';
    this.el.dmgdir.appendChild(el);
    this.arcs.push({ el, pos: pos.clone(), t: 0 });
    if (this.arcs.length > 6) this.arcs.shift().el.remove();
    this.updateArcs(0, game);
    return p;
  }

  updateArcs(dt, game) {
    const heading = wrap(-game.rig.yaw);
    const p = game.player.position;
    for (let i = this.arcs.length - 1; i >= 0; i--) {
      const a = this.arcs[i];
      a.t += dt;
      if (a.t > 1.2) { a.el.remove(); this.arcs.splice(i, 1); continue; }
      const b = Math.atan2(a.pos.x - p.x, -(a.pos.z - p.z));
      a.el.style.transform = `rotate(${wrap(b - heading)}rad)`;
      a.el.style.opacity = 1 - Math.max(0, (a.t - 0.5) / 0.7);
    }
  }

  renderSlots(p) {
    const inv = p.inventory;
    const key = inv.slots.map((w) => w?.uid ?? '-').join(',') + `|${inv.active}`;
    this.setHTML('slots', key, () => inv.slots.map((w, i) => {
      const color = w ? RARITY[w.rarity].css : 'transparent';
      const img = w ? `<img src="${this.thumbs.get(w)}" alt="">` : '';
      return `<div class="slot ${i === inv.active ? 'active' : ''}" style="--rc:${color}">
        <span class="key">${i + 1}</span>${img}
        <span class="name">${w ? esc(w.name) : 'Empty'}</span>
        <span class="type">${w ? WEAPON_TYPES[w.type].label : ''}</span></div>`;
    }).join(''));
  }

  renderQuests(game) {
    const log = game.quests;
    const key = JSON.stringify(log.active);
    this.setHTML('quests', key, () => Object.entries(log.active).map(([id, prog]) => {
      const q = log.defs.get(id);
      if (!q) return '';
      const done = log.isComplete(id);
      const objectives = done
        ? `<li class="done">Return to ${esc(game.npcs.find((n) => n.id === q.giver)?.name ?? 'camp')}</li>`
        : q.objectives.map((o, i) => `<li class="${prog[i] >= o.count ? 'done' : ''}">${esc(o.text)} ${Math.min(prog[i], o.count)}/${o.count}</li>`).join('');
      return `<div class="quest"><b>${esc(q.title)}</b><ul>${objectives}</ul></div>`;
    }).join(''));
  }

  renderBoss(game) {
    const boss = game.enemies.find((en) => en.type.boss && en.alive && en.engaged);
    this.el.boss.style.display = boss ? '' : 'none';
    if (!boss) return;
    this.el.bossName.textContent = `${boss.displayName} · Lv ${boss.level}`;
    this.el.bossFill.style.width = `${(boss.hp / boss.maxHp) * 100}%`;
  }

  renderReticle(dt, game) {
    const p = game.player;
    const e = this.el;
    // Melee shows a centre dot when there's loot in reach to aim at, or in first person.
    const melee = p.weaponClass === 'melee';
    // Aiming down a sight in first person, the sight itself is the reticle.
    const show = game.state === 'playing' && p.alive && (!melee || game.lootNear || game.firstPerson) && !(game.firstPerson && game.viewModel?.sighted);
    e.reticle.style.display = show ? '' : 'none';
    e.reticle.classList.toggle('dot', melee);
    e.reticle.classList.toggle('on-loot', !!game.focusedDrop);
    this.hitTime -= dt;
    e.hitmarker.style.opacity = Math.max(0, this.hitTime * 4);
    if (!show) return;
    const ppr = game.rig.pixelsPerRadian(window.innerHeight);
    const gap = 5 + (p.weaponClass === 'ranged' ? p.spread * ppr : 3);
    e.reticle.style.setProperty('--gap', `${Math.min(gap, 120)}px`);
    e.reticle.classList.toggle('on-enemy', !!game.aim.target);
    const charge = p.chargeFraction;
    e.charge.style.display = charge > 0 ? '' : 'none';
    e.charge.style.setProperty('--p', `${charge * 360}deg`);
    e.charge.classList.toggle('full', charge >= 1);
  }

  hitMarker(crit, kill) {
    this.hitTime = kill ? 0.35 : 0.2;
    this.el.hitmarker.className = kill ? 'kill' : crit ? 'crit' : '';
  }

  setZone(name) {
    this.el.zone.textContent = name;
  }

  setPrompt(text) {
    this.el.prompt.innerHTML = text ?? '';
    this.el.prompt.style.display = text ? '' : 'none';
  }

  // Focused loot card (looking at a drop), compared against the equipped weapon.
  setLoot(weapon, current, backpackFull, armorSlots = {}) {
    if (weapon && isArmor(weapon)) current = armorSlots[weapon.slot];
    const key = weapon ? `${weapon.uid}|${current?.uid}|${backpackFull}` : '';
    if (this.keys.loot === key) return;
    this.keys.loot = key;
    const el = this.el.loot;
    if (!weapon) { el.classList.add('hidden'); return; }
    const hold = current ? `Swap for ${esc(current.name)}` : 'Equip now';
    const footer = `<div class="lc-prompt"><kbd>F</kbd> ${backpackFull ? 'Pick up (swaps with equipped)' : 'Pick up'}</div>`
      + `<div class="lc-prompt lc-hold"><kbd>Hold F</kbd> ${hold}<i></i></div>`;
    el.innerHTML = itemCardHTML(weapon, { compare: current, thumb: this.thumbs.get(weapon), footer });
    el.classList.remove('hidden');
  }

  // Progress of a held F (0..1) on the loot card's swap prompt.
  setLootHold(frac) {
    const v = frac.toFixed(2);
    if (v === this.keys.hold) return;
    this.keys.hold = v;
    this.el.loot.style.setProperty('--hold', v);
  }

  banner(text, sub = '') {
    this.el.banner.innerHTML = `${esc(text)}${sub ? `<small>${esc(sub)}</small>` : ''}`;
    this.bannerTime = 2.6;
  }

  toast(text) {
    this.el.toast.textContent = text;
    this.toastTime = 1.8;
  }

  showOverlay(title, sub, buttons = []) {
    this.el.overlayTitle.textContent = title;
    this.el.overlaySub.textContent = sub;
    this.el.overlayButtons.innerHTML = '';
    for (const b of buttons) {
      const btn = document.createElement('button');
      btn.textContent = b.label;
      btn.onclick = (ev) => { ev.stopPropagation(); b.onClick(); };
      this.el.overlayButtons.appendChild(btn);
    }
    this.el.overlay.classList.remove('hidden');
  }

  hideOverlay() {
    this.el.overlay.classList.add('hidden');
  }

  reset() {
    this.hpLag = 1;
    this.keys = {};
    this.hurtFlash = 0;
    for (const a of this.arcs) a.el.remove();
    this.arcs = [];
    this.setLoot(null);
  }
}
