// The game menu: a full-screen hub for your character — Character (level, stats, gear, Threat),
// Talents (ui/TalentsUI.js), Inventory (gear and backpack; the trader's shop too), Journal
// (quests), Map, Social (online: who's around, whispers), Settings and Controls. The world keeps
// running while it's open (your character stands and stays in danger: the header shows your
// health); only single-player freezes, and only while the window is in the background.
//   Esc opens it (last tab) and closes it · I/Tab inventory · M map · L journal · P character ·
//   N talents · O social · U guild · Q/E step through tabs.
// Over the title screen it holds just Settings and Controls.
import { toneOf } from './questMarks.js';
import { esc, setHTML } from './cards.js';
import { defaultPrefs } from '../core/Prefs.js';
import { talentsHTML } from './TalentsUI.js';
import { respecCost, RESPEC_FREE_BELOW } from '../rpg/talents.js';
import { achievementsHTML, codexHTML } from './JournalUI.js';
import { ACHIEVEMENT, TITLES } from '../rpg/achievements.js';
import { ABILITIES } from '../combat/abilities.js';
import { armorReduction, TIERS, tierOf } from '../rpg/balance.js';
import { RARITY } from '../items/rarity.js';
import { ARMOR_SLOTS, ARMOR_SLOT_IDS } from '../items/armorTypes.js';
import { setInfo } from '../items/describe.js';
import { ACTS, STORY, storyToldText } from '../rpg/storyline.js';

const TABS = [
  { id: 'character', label: 'Character', key: 'P' },
  { id: 'talents', label: 'Talents', key: 'N' },
  { id: 'inventory', label: 'Inventory', key: 'I' },
  { id: 'journal', label: 'Journal', key: 'L' },
  { id: 'map', label: 'Map', key: 'M' },
  { id: 'social', label: 'Social', key: 'O', online: true },
  { id: 'guild', label: 'Guild', key: 'U', online: true },
  { id: 'mail', label: 'Mail', online: true },
  { id: 'settings', label: 'Settings' },
  { id: 'controls', label: 'Controls' },
];
const TITLE_TABS = ['settings', 'controls'];

const CONTROLS = [
  ['Movement', [
    ['Move / look', 'WASD · mouse'],
    ['Sprint', 'Hold Shift'],
    ['Dash · air dash', 'Tap Shift · Shift in the air'],
    ['Jump · double jump', 'Space (hold for full height) · Space again'],
    ['Slide', 'Hold C (slopes speed you up)'],
    ['Bullet jump', 'Space while sliding'],
    ['Glide', 'Hold RMB in the air'],
    ['Clamber', 'Walk or jump into a ledge'],
    ['Camera zoom', 'Mouse wheel'],
    ['First / third person', 'V'],
  ]],
  ['Combat', [
    ['Attack · fire', 'LMB (hold to charge magic)'],
    ['Heavy · aim down sights', 'RMB'],
    ['Ground slam', 'LMB in the air, looking down'],
    ['Quick melee', 'Q'],
    ['Reload', 'R'],
    ['Weapons', '1 · 2 · 3'],
    ['Abilities', 'X · G · T (learn them in Talents, N)'],
  ]],
  ['World', [
    ['Interact', 'E'],
    ['Pick up loot', 'F, aiming at it'],
    ['Swap loot for what you use', 'Hold F'],
    ['Game menu', 'Esc'],
    ['Character · talents · inventory · journal', 'P · N · I or Tab · L'],
    ['Map · social · guild', 'M · O · U (online)'],
    ['Chat (online)', 'Enter · / for commands'],
    ['Dev tools · perf overlay', '` or F1 · F3'],
  ]],
  ['Touch', [
    ['Move · sprint', 'Left thumb anywhere on the left (the stick follows it) · hold it right out'],
    ['Look', 'Drag on the right'],
    ['Attack · aim', 'Fire / Aim on the right (drag the same thumb to aim) · Fire and Aim (tap on, tap off) on the left'],
    ['Jump · dodge · slide', 'Their buttons (hold Jump for height, Aim in the air to glide) · Slide stays on until tapped or the stick is let go: slide, then Jump to bullet jump'],
    ['Interact · pick up', 'Tap the prompt · tap the loot card (hold to swap)'],
    ['Weapons', 'Tap a weapon slot'],
    ['Abilities', 'The three buttons over the action cluster'],
    ['Map · journal', 'Tap the minimap · tap the tracked quest'],
    ['Menu · chat · view', 'The buttons at the top left (a dot on the menu: talent points to spend)'],
  ]],
];

const slider = (key, label, min, max, step, value, fmt) => `
  <label class="pm-set"><span>${label}</span>
    <input type="range" data-pref="${key}" min="${min}" max="${max}" step="${step}" value="${value}">
    <b data-out="${key}">${fmt(value)}</b></label>`;
const toggle = (key, label, on) => `
  <label class="pm-set"><span>${label}</span><button type="button" class="pm-toggle ${on ? 'on' : ''}" data-toggle="${key}">${on ? 'On' : 'Off'}</button></label>`;
// A setting with a few named options: each press moves to the next.
const CHOICES = {
  touchControls: [['auto', 'Auto'], ['on', 'On'], ['off', 'Off']],
  graphics: [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']],
  antialias: [['off', 'Off'], ['fxaa', 'FXAA'], ['msaa', '4× MSAA'], ['msaa+fxaa', 'MSAA + FXAA']],
  shadowQuality: [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']],
};
const choice = (key, label, value) => `
  <label class="pm-set"><span>${label}</span><button type="button" class="pm-toggle on" data-choice="${key}">${CHOICES[key].find(([v]) => v === value)?.[1] ?? value}</button></label>`;
const FMT = {
  volume: (v) => `${Math.round(v * 100)}%`,
  sensitivity: (v) => `${(+v).toFixed(2)}×`,
  fov: (v) => `${Math.round(v)}°`,
  shake: (v) => `${Math.round(v * 100)}%`,
  renderScale: (v) => `${Math.round(v * 100)}%`,
  touchLook: (v) => `${(+v).toFixed(2)}×`,
};
const pct = (v) => `${Math.round((v - 1) * 100) >= 0 ? '+' : ''}${Math.round((v - 1) * 100)}%`;
const FILTERS = ['All loot', 'Uncommon+', 'Rare+'];

export class GameMenu {
  constructor(game, el) {
    this.game = game;
    this.el = el;
    this.page = 'character';   // the open tab
    this.lastTab = 'character';
    this.context = 'game';     // 'title': settings and controls only
    this.shop = false;
    this.socialTimer = 0;
    el.innerHTML = `
      <div class="gm-frame">
        <header class="gm-head">
          <div class="gm-who"></div>
          <nav class="gm-tabs" role="tablist"></nav>
          <div class="gm-act">
            <span class="gm-gold"></span>
            <button class="gm-btn" data-act="resume">Resume <kbd>Esc</kbd></button>
            <button class="gm-btn gm-quit" data-act="quit"></button>
          </div>
        </header>
        <main class="gm-body">
          <section class="gm-pane gm-html"></section>
          <section class="gm-pane gm-inv"></section>
          <section class="gm-pane gm-map"></section>
        </main>
        <footer class="gm-foot"><span class="gm-hint"></span><span class="gm-status"></span></footer>
      </div>`;
    this.q = (s) => el.querySelector(s);
    this.html = this.q('.gm-html');
    // The inventory and the map keep their own elements and code; the menu hosts them as tabs.
    this.q('.gm-inv').appendChild(game.inventoryUI.el);
    this.q('.gm-map').appendChild(game.mapUI.el);

    el.addEventListener('click', (e) => this.onClick(e));
    el.addEventListener('submit', (e) => {
      e.preventDefault();
      game.socialUI.onSubmit(e.target);
    });
    el.addEventListener('input', (e) => {
      const key = e.target.dataset?.pref;
      if (!key) return;
      const v = +e.target.value;
      this.game.setPref(key, v);
      const out = this.el.querySelector(`[data-out="${key}"]`);
      if (out) out.textContent = FMT[key](v);
    });
    // Keys typed here (sliders, buttons) must not drive the player; Esc and the menu's own
    // shortcuts still reach main.js.
    el.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' || (/^Key[QEIMLPNOU]$|^Tab$/.test(e.code) && !/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))) return;
      e.stopPropagation();
    });
  }

  get isOpen() { return !this.el.classList.contains('hidden'); }
  get tabs() {
    if (this.context === 'title') return TABS.filter((t) => TITLE_TABS.includes(t.id));
    return TABS.filter((t) => !t.online || this.game.net.inWorld);
  }

  open(page = this.lastTab, { context = 'game', shop = false } = {}) {
    this.context = context;
    this.shop = shop;
    if (!this.tabs.some((t) => t.id === page)) page = this.tabs[0].id;
    this.page = page;
    if (context === 'game') this.lastTab = page;
    this.el.classList.remove('hidden');
    this.el.classList.toggle('gm-title', context === 'title');
    this.show(page);
  }

  close() {
    this.game.inventoryUI.close();
    this.game.mapUI.close();
    this.el.classList.add('hidden');
  }

  // Esc inside the menu: over the title, back to it; in game, back to play.
  back() {
    if (this.context === 'title') { this.close(); this.game.showTitle(); return; }
    this.game.closeMenus();
  }

  step(dir) {
    const tabs = this.tabs;
    const i = tabs.findIndex((t) => t.id === this.page);
    this.open(tabs[(i + dir + tabs.length) % tabs.length].id, { context: this.context });
  }

  show(tab) {
    const g = this.game;
    this.q('.gm-tabs').innerHTML = this.tabs.map((t) => `
      <button role="tab" class="gm-tab ${t.id === tab ? 'on' : ''}" aria-selected="${t.id === tab}" data-tab="${t.id}">${t.id === 'inventory' && this.shop ? 'Trade' : t.label}${t.key && this.context === 'game' ? `<kbd>${t.key}</kbd>` : ''}</button>`).join('');
    // (On a narrow screen the tabs scroll sideways: the open one is brought into sight.)
    const nav = this.q('.gm-tabs');
    const on = nav.querySelector('.gm-tab.on');
    if (on && nav.scrollWidth > nav.clientWidth) nav.scrollLeft = on.offsetLeft - (nav.clientWidth - on.offsetWidth) / 2;
    const title = this.context === 'title';
    this.q('.gm-quit').textContent = title ? 'Back to Title' : g.net.inWorld ? 'Leave World' : 'Quit to Title';
    this.q('.gm-quit').dataset.act = title ? 'back' : 'quit';
    this.q('[data-act="resume"]').classList.toggle('hidden', title);
    this.q('.gm-hint').innerHTML = title ? '<kbd>Esc</kbd> back' : '<kbd>Q</kbd><kbd>E</kbd> switch tabs · <kbd>Esc</kbd> back to the world';

    // Which pane: the inventory and map host their own UIs; everything else is rendered here.
    const inv = tab === 'inventory';
    const map = tab === 'map';
    this.q('.gm-inv').classList.toggle('on', inv);
    this.q('.gm-map').classList.toggle('on', map);
    this.html.classList.toggle('on', !inv && !map);
    if (inv) g.inventoryUI.open(this.shop ? 'shop' : 'inventory');
    else g.inventoryUI.close();
    if (map) g.mapUI.open();
    else g.mapUI.close();
    if (!inv && !map) this.renderTab(tab);
    this.update(0);
  }

  renderTab(tab = this.page) {
    const su = this.game.socialUI;
    const fn = {
      character: this.characterHTML, talents: () => talentsHTML(this.game), journal: this.journalHTML, social: this.socialHTML,
      settings: this.settingsHTML, controls: this.controlsHTML,
      guild: () => su.guildHTML(), mail: () => su.mailHTML(),
    }[tab];
    this.html.innerHTML = `<div class="gm-tab-${tab}">${fn ? fn.call(this) : ''}</div>`;
  }

  // Live parts: health in the header (the world doesn't stop), the who-and-where line, and the
  // social list now and then.
  update(dt) {
    if (!this.isOpen) return;
    const g = this.game;
    const title = this.context === 'title';
    if (!title) {
      const p = g.player;
      // (Down in a dungeon: the dungeon, and its copy's level.)
      const below = g.dungeonView?.active;
      const region = below ? { name: g.dungeonView.def.name, level: g.dungeonView.run.lv } : g.world.regionAt(p.position.x, p.position.z);
      const name = g.net.inWorld ? esc(g.net.character?.name ?? '') : 'Wanderer';
      const hp = p.maxHp ? p.hp / p.maxHp : 1;
      const key = `${name}|${g.stats.level}|${region.name}|${Math.round(hp * 200)}`;
      if (key !== this.whoKey) {
        this.whoKey = key;
        this.q('.gm-who').innerHTML = `
          <span class="gm-lv">${g.stats.level}</span>
          <span class="gm-name">${name}<small>${esc(region.name)} · ${below ? 'dungeon' : 'region'} level ${region.level}</small></span>
          <span class="gm-hp ${hp < 0.35 ? 'low' : ''}" title="Health"><i style="width:${(hp * 100).toFixed(1)}%"></i><b>${Math.ceil(p.hp)} / ${p.maxHp}</b></span>`;
      }
      this.q('.gm-gold').textContent = `${g.stats.gold}g`;
    } else {
      this.q('.gm-who').innerHTML = '<span class="gm-name">Settings</span>';
      this.q('.gm-gold').textContent = '';
    }
    const status = g.state === 'paused' ? 'Paused while the window is in the background'
      : g.net.inWorld ? `Online · ${g.remotes.list.length} nearby · ${Math.round(g.net.rtt)} ms` : title ? '' : 'The world keeps moving while this menu is open';
    if (status !== this.statusText) {
      this.statusText = status;
      this.q('.gm-status').textContent = status;
    }
    if (this.page === 'social' && (this.socialTimer -= dt) <= 0) {
      this.socialTimer = 1;
      this.renderTab('social');
    }
  }

  onClick(e) {
    const g = this.game;
    const t = e.target.closest('[data-act], [data-toggle], [data-choice], [data-tab]');
    if (!t) return;
    if (t.dataset.choice) {
      const key = t.dataset.choice;
      const opts = CHOICES[key];
      const next = opts[(opts.findIndex(([v]) => v === g.prefs[key]) + 1) % opts.length];
      g.setPref(key, next[0]);
      t.textContent = next[1];
      return;
    }
    if (t.dataset.tab) { this.open(t.dataset.tab, { context: this.context, shop: this.shop && t.dataset.tab === 'inventory' }); return; }
    if (t.dataset.toggle) {
      const key = t.dataset.toggle;
      g.setPref(key, !g.prefs[key]);
      t.classList.toggle('on', g.prefs[key]);
      t.textContent = g.prefs[key] ? 'On' : 'Off';
      return;
    }
    if (/^[sgm]-/.test(t.dataset.act)) { g.socialUI.onAct(t.dataset.act, t.dataset); return; }
    switch (t.dataset.act) {
      case 'resume': g.closeMenus(); break;
      case 'quit': g.quitToTitle(); break;
      case 'back': this.back(); break;
      case 'learn':
        g.charLink.do({ op: 'learn', id: t.dataset.id });
        this.renderTab();
        break;
      case 'slot':
        g.charLink.do({ op: 'slot', i: Number(t.dataset.i), a: t.dataset.a || null });
        this.renderTab();
        break;
      case 'respec': {
        // Past the free levels, a smith at a workshop does it (rpg/CharacterCore.js 'respec').
        const cost = respecCost(g.stats.level);
        if (cost > 0 && !g.nearRole('smith')) g.hud.toast(`From level ${RESPEC_FREE_BELOW}, talents are reset by a smith at a town's or city's workshop (${cost}g)`);
        else if (!g.charLink.do({ op: 'respec' })) g.hud.toast(cost ? `Not enough gold (${cost}g)` : 'Nothing to reset');
        break;
      }
        this.renderTab();
        break;
      case 'talents': this.open('talents'); break;
      case 'journal': this.journalPage = t.dataset.v; this.renderTab(); break;
      case 'qtab': this.questTab = t.dataset.v; this.renderTab(); break;
      case 'track': g.setTracked(t.dataset.v); this.renderTab(); break;
      case 'title':
        g.charLink.do({ op: 'title', id: t.dataset.v || null });
        this.renderTab();
        break;
      case 'filter':
        g.charLink.do({ op: 'filter', v: Number(t.dataset.v) });
        this.renderTab();
        break;
      case 'threat':
        if (g.inCombat()) g.hud.toast('Not in the middle of a fight');
        else g.charLink.do({ op: 'threat', v: Number(t.dataset.v) });
        this.renderTab();
        break;
      case 'whisper':
        g.closeMenus();
        g.chat.open(`/w ${t.dataset.name} `);
        break;
      case 'invite': g.partyUI.send('invite', t.dataset.name); break;
      case 'trade': g.net.send({ t: 'trade', act: 'request', name: t.dataset.name }); break;
      case 'kick': g.partyUI.send('kick', t.dataset.name); break;
      case 'promote': g.partyUI.send('promote', t.dataset.name); break;
      case 'party-leave': g.partyUI.send('leave'); break;
      case 'party-yes': g.partyUI.respond(true); this.renderTab('social'); break;
      case 'party-no': g.partyUI.respond(false); this.renderTab('social'); break;
      case 'who':
        g.net.send({ t: 'chat', text: '/who' });
        g.closeMenus();
        g.chat.open();
        break;
      case 'defaults':
        for (const [k, v] of Object.entries(defaultPrefs())) g.setPref(k, v);
        this.renderTab();
        break;
    }
  }

  // ---------------------------------------------------------------- tabs
  characterHTML() {
    const g = this.game;
    const s = g.stats;
    const inv = g.player.inventory;
    const xp = s.xp / s.xpToNext();
    const abilities = s.slots.map((id, i) => `<li><kbd>${['X', 'G', 'T'][i]}</kbd>${id ? ABILITIES[id].name : '<em>empty</em>'}</li>`).join('');
    // Titles: those earned (rpg/achievements.js), and none.
    const earned = TITLES.filter((a) => g.char.achievements[a.id] !== undefined);
    const wearing = g.settings.title ?? '';
    const titles = [['', 'None'], ...earned.map((a) => [a.id, a.title])]
      .map(([id, label]) => `<button class="${wearing === id ? 'on' : ''}" data-act="title" data-v="${id}">${esc(label)}</button>`).join('');
    const mitigation = Math.round(armorReduction(s.armor, s.level) * 100);
    const gear = (item, label) => item
      ? `<li><span>${label}</span><b style="color:${RARITY[item.rarity].css}">${esc(item.name)}</b><small>Lv ${item.level}</small></li>`
      : `<li class="none"><span>${label}</span><b>—</b></li>`;
    const filter = FILTERS.map((label, i) => `<button class="${g.settings.lootFilter === i ? 'on' : ''}" data-act="filter" data-v="${i}">${label}</button>`).join('');
    const tier = tierOf(g.settings.threat);
    const threat = TIERS.map((T, i) => `<button class="${tier === T ? 'on' : ''}" data-act="threat" data-v="${i}" ${g.inCombat() ? 'disabled' : ''}>${T.name}</button>`).join('');
    const threatText = tier.xp === 1 ? 'Enemies as they come.'
      : `Enemies hit you ${Math.round((tier.damage - 1) * 100)}% harder and take ${Math.round((1 - 1 / tier.health) * 100)}% less from you. Your kills: +${Math.round((tier.xp - 1) * 100)}% XP, more luck, and nothing below ${['common', 'uncommon', 'rare'][tier.floor]}.`;
    // Every set worn, most pieces first, with its bonuses lit as they're reached.
    const sets = Object.entries(s.gearSets).sort((a, b) => b[1] - a[1]).map(([id, n]) => setHTML(setInfo(id, n))).join('');
    return `
      <div class="gm-cols">
        <section class="gm-card">
          <h3>Level</h3>
          <div class="gm-level"><b>${s.level}</b><div><div class="gm-xp"><i style="width:${(xp * 100).toFixed(1)}%"></i></div><small>${s.xp} / ${s.xpToNext()} XP to level ${s.level + 1}</small></div></div>
          <div class="pm-stats"><span><b>${s.gold}</b>gold</span><span><b>${s.kills}</b>kills</span><span><b>${s.points}</b>talent points</span></div>
          <h3>Talents &amp; abilities</h3>
          ${s.points ? `<div class="pts">${s.points} talent point${s.points > 1 ? 's' : ''} to spend</div>` : ''}
          <ul class="gm-abilities">${abilities}</ul>
          <button class="gm-btn" data-act="talents">Open talents <kbd>N</kbd></button>
          <h3>Title</h3>
          <div class="filter">${titles}</div>
          <p class="hint">${earned.length ? `Shown under your name and in chat. ${ACHIEVEMENT[wearing]?.name ? `Earned by “${esc(ACHIEVEMENT[wearing].name)}”.` : ''}` : 'Titles come from achievements (Journal › Achievements).'}</p>
        </section>
        <section class="gm-card">
          <h3>Combat</h3>
          <div class="derived">
            <div>Max Health <b>${s.maxHp}</b></div><div>Max Mana <b>${s.maxMana}</b></div>
            <div title="Damage your armour stops from enemies of your level">Armour <b>${Math.round(s.armor)} (−${mitigation}%)</b></div><div>Move speed <b>${pct(1 + s.moveSpeed)}</b></div>
            <div>Melee damage <b>${pct(s.damageMult('melee'))}</b></div><div>Ranged damage <b>${pct(s.damageMult('ranged'))}</b></div>
            <div>Magic damage <b>${pct(s.damageMult('magic'))}</b></div><div>Crit bonus <b>+${(s.critBonus * 100).toFixed(1)}%</b></div>
          </div>
          <h3>Equipped</h3>
          <ul class="gm-gear">
            ${inv.slots.map((w, i) => gear(w, `Weapon ${i + 1}${i === inv.active ? ' ◆' : ''}`)).join('')}
            ${ARMOR_SLOT_IDS.map((sl) => gear(inv.armor[sl], ARMOR_SLOTS[sl].label)).join('')}
          </ul>
          ${sets ? `<h3>Sets</h3><div class="gm-sets">${sets}</div>` : ''}
          <h3>Threat</h3>
          <div class="filter">${threat}</div>
          <p class="hint">${threatText} It can't change mid-fight.</p>
          <h3>Loot filter</h3>
          <div class="filter">${filter}</div>
          <p class="hint">Drops below the filter are auto-scrapped for gold.</p>
        </section>
      </div>`;
  }

  // The Journal: quests, achievements or the codex.
  journalHTML() {
    const page = this.journalPage ?? 'quests';
    const tabs = [['quests', 'Quests'], ['achievements', 'Achievements'], ['codex', 'Codex']]
      .map(([id, label]) => `<button class="${page === id ? 'on' : ''}" data-act="journal" data-v="${id}">${label}</button>`).join('');
    const body = page === 'achievements' ? achievementsHTML(this.game) : page === 'codex' ? codexHTML(this.game) : this.questsHTML();
    return `<div class="filter jr-tabs">${tabs}</div>${body}`;
  }

  // The quest log in three tabs: the Story (what's under way, and the acts so far), Side (village
  // chains, hamlets' errands, Old Ysolde's) and Contracts (the Wardens', hunts, the boards'). Each
  // quest at its step, with what's left and who it goes back to; one can be tracked, to lead the
  // HUD, the compass and the maps.
  questsHTML() {
    const g = this.game;
    const log = g.quests;
    const TABS = [['story', 'Story'], ['side', 'Side'], ['contracts', 'Contracts']];
    const tab = this.questTab ?? TABS.map(([id]) => id).find((id) => log.activeIds(id).length) ?? 'story';
    const tabs = TABS.map(([id, label]) => {
      const n = log.activeIds(id).length;
      return `<button class="${tab === id ? 'on' : ''}" data-act="qtab" data-v="${id}">${label}${n ? ` <small>${n}</small>` : ''}</button>`;
    }).join('');
    const cards = log.activeIds(tab).sort((a, b) => (b === g.tracked) - (a === g.tracked)).map((id) => this.questCard(id)).join('');
    const empty = {
      story: this.storyNext(),
      side: 'No side quests. Every village has a story of its own to tell, hamlets have errands, and Old Ysolde has her own.',
      contracts: 'No contracts. Every Warden pays bounties, and every town and city has a quest board.',
    }[tab];
    return `
      <div class="gm-cols">
        <section class="gm-card gm-wide">
          <div class="filter qtabs">${tabs}</div>
          ${cards || `<p class="pm-empty">${empty}</p>`}
          ${tab === 'story' ? `<h3>The story so far</h3>${this.storyHTML()}` : ''}
          <p class="hint">${log.completed.size} quest${log.completed.size === 1 ? '' : 's'} completed. A tracked quest leads the HUD, the compass and the maps.</p>
        </section>
      </div>`;
  }

  questCard(id) {
    const g = this.game;
    const log = g.quests;
    const q = log.defs.get(id);
    if (!q) return '';
    const prog = log.active[id];
    const done = log.isComplete(id);
    const stages = log.stagesOf(q);
    const at = Math.min(log.stage[id] ?? 0, stages.length - 1);
    // Handing it in is a step of its own: the last one, live once everything before it is done.
    const handIn = q.returnTo !== null;
    const objectives = log.objectivesOf(id);
    const total = objectives.length + (handIn ? 1 : 0);
    const completed = objectives.reduce((n, o, i) => n + (prog[i] >= (o.count ?? 1) ? 1 : 0), 0);
    const goals = objectives.map((o, i) => {
      const n = o.count ?? 1;
      return `<li class="${prog[i] >= n ? 'done' : ''}">${esc(log.fill(o.text, q))}${n > 1 ? ` <b>${Math.min(prog[i], n)}/${n}</b>` : ''}</li>`;
    }).join('') + (handIn ? `<li class="handin qm-${toneOf(q.kind)} ${done ? '' : 'later'}">Hand in to ${esc(log.returnTo(q))}</li>` : '');
    const act = q.kind === 'story' ? ACTS.find((A) => A.act === q.act) : null;
    const steps = stages.length + (handIn ? 1 : 0);
    const meta = [act && `${act.title}: ${act.sub}`, q.level && `Level ${q.level}`, steps > 1 && `Step ${done && handIn ? steps : at + 1} of ${steps}`].filter(Boolean).join(' · ');
    const text = done ? (handIn ? `Hand it in to ${log.returnTo(q)}.` : '') : log.fill(stages[at]?.text ?? '', q);
    const tracked = g.tracked === id;
    return `<article class="gm-quest ${done ? 'ready' : ''} ${tracked ? 'tracked' : ''}">
      <h4><span>${esc(q.title)}</span><button class="gm-btn" aria-pressed="${tracked}" data-act="track" data-v="${esc(id)}">${tracked ? '✓ Tracking' : 'Track quest'}</button></h4>
      <small>${esc(meta)}</small>${text ? `<p>${esc(text)}</p>` : ''}<div class="gm-quest-progress"><span>${done ? (handIn ? 'Ready to hand in' : 'Complete') : `${completed} of ${total} objectives`}</span><i><b style="width:${total ? Math.round(completed / total * 100) : 100}%"></b></i></div><ul>${goals}</ul></article>`;
  }

  // Where the story goes next, when nothing of it is under way.
  storyNext() {
    const log = this.game.quests;
    const q = STORY.find((s) => !log.completed.has(s.id) && !log.active[s.id] && log.requirementsMet(s));
    if (q) return `Next: <b>${esc(q.title)}</b> — ${esc(log.giverName(log.giverId(q)))} has it.`;
    return STORY.every((s) => log.completed.has(s.id)) ? storyToldText() : 'Finish what\'s under way to go on.';
  }

  // The story act by act: quests done, the one under way, the next, and how many more to come.
  storyHTML() {
    const log = this.game.quests;
    return ACTS.map((A) => {
      const qs = STORY.filter((q) => q.act === A.act);
      const done = qs.filter((q) => log.completed.has(q.id)).length;
      let more = 0;
      const rows = qs.map((q) => {
        if (log.completed.has(q.id)) return `<li class="done">${esc(q.title)}</li>`;
        if (log.active[q.id]) return `<li class="now">${esc(q.title)} <small>under way</small></li>`;
        if (log.requirementsMet(q)) return `<li class="next">${esc(q.title)} <small>${esc(log.giverName(log.giverId(q)))}</small></li>`;
        more++;
        return '';
      }).join('');
      return `<div class="gm-story ${done === qs.length ? 'done' : ''}"><h4>${esc(A.title)} · ${esc(A.sub)}<small>Levels ${esc(A.levels)} · ${done} / ${qs.length}</small></h4>
        <ul>${rows}${more ? `<li class="locked">${more} more to come</li>` : ''}</ul></div>`;
    }).join('');
  }

  socialHTML() {
    const g = this.game;
    const me = g.player.position;
    const near = [...g.remotes.list].sort((a, b) => a.position.distanceTo(me) - b.position.distanceTo(me));
    const party = g.partyUI;
    const canInvite = (r) => !party.party || (party.isLeader && !party.full && !party.hasMember(r.name));
    const rows = near.map((r) => `
      <li><span class="np-lv">${r.level}</span><b>${esc(r.name)}</b><small>${Math.round(r.position.distanceTo(me))} m · ${esc(r.weapon?.name ?? 'Unarmed')}</small>
        <span class="gm-row">${canInvite(r) && !party.isMate(r.netId) ? `<button class="gm-btn" data-act="invite" data-name="${esc(r.name)}">Invite</button>` : ''}${r.position.distanceTo(me) < 20 ? `<button class="gm-btn" data-act="trade" data-name="${esc(r.name)}">Trade</button>` : ''}<button class="gm-btn" data-act="whisper" data-name="${esc(r.name)}">Whisper</button>${g.socialUI.friends.some((f) => f.name === r.name) ? '' : `<button class="gm-btn" data-act="s-friend" data-name="${esc(r.name)}">Add Friend</button>`}<button class="gm-btn gm-quit" data-act="s-ignore" data-name="${esc(r.name)}">Ignore</button></span></li>`).join('');
    const members = party.party ? party.party.members.map((m) => {
      const self = m.id === party.me;
      const leader = party.party.leader === m.id;
      return `<li class="${m.online ? '' : 'offline'}"><span class="np-lv party">${m.level || '·'}</span><b>${esc(m.name)}${self ? ' (you)' : ''}</b><small>${leader ? 'Leader' : m.online ? 'Member' : 'Offline'}</small>
        <span class="gm-row">${party.isLeader && !self ? `<button class="gm-btn" data-act="promote" data-name="${esc(m.name)}">Lead</button><button class="gm-btn gm-quit" data-act="kick" data-name="${esc(m.name)}">Remove</button>` : ''}</span></li>`;
    }).join('') : '';
    const invite = party.invite ? `<p class="gm-invite"><b>${esc(party.invite.from)}</b> invites you to a party. <button class="gm-btn" data-act="party-yes">Accept</button><button class="gm-btn" data-act="party-no">Decline</button></p>` : '';
    return `
      <div class="gm-cols">
        <section class="gm-card">
          <h3>Party</h3>
          ${invite}
          ${members ? `<ul class="gm-players">${members}</ul><button class="gm-btn gm-quit" data-act="party-leave">Leave Party</button>` : '<p class="pm-empty">Not in a party. Invite players nearby, or /invite Name. Party members share kills and camps within 100 m and show on your compass and maps.</p>'}
          <h3>Players nearby</h3>
          ${rows ? `<ul class="gm-players">${rows}</ul>` : '<p class="pm-empty">Nobody within sight. Others appear here (and on the minimap) as they come near.</p>'}
        </section>
        <section class="gm-card">
          ${g.socialUI.friendsHTML()}
          <h3>You</h3>
          <dl class="gm-dl"><dt>Character</dt><dd>${esc(g.net.character?.name ?? '')}</dd><dt>Account</dt><dd>${esc(g.net.account?.name ?? '—')}</dd><dt>Latency</dt><dd>${Math.round(g.net.rtt)} ms</dd></dl>
          <h3>Chat</h3>
          <dl class="gm-dl"><dt>Enter</dt><dd>World chat</dd><dt>/s message</dt><dd>Say (nearby)</dd><dt>/p message</dt><dd>Party</dd><dt>/w Name message</dt><dd>Whisper</dd><dt>/r message</dt><dd>Reply to a whisper</dd></dl>
          <button class="gm-btn" data-act="who">Who's online</button>
        </section>
      </div>`;
  }

  settingsHTML() {
    const pr = this.game.prefs;
    return `
      <div class="pm-groups">
        <section class="gm-card"><h3>Sound</h3>
          ${slider('volume', 'Volume', 0, 1, 0.01, pr.volume, FMT.volume)}
          ${toggle('muted', 'Mute', pr.muted)}
        </section>
        <section class="gm-card"><h3>Controls</h3>
          ${toggle('firstPerson', 'First-person view (V)', pr.firstPerson)}
          ${slider('sensitivity', 'Mouse sensitivity', 0.2, 3, 0.05, pr.sensitivity, FMT.sensitivity)}
          ${toggle('invertY', 'Invert vertical look', pr.invertY)}
          ${slider('fov', 'Field of view', 45, 85, 1, pr.fov, FMT.fov)}
          ${choice('touchControls', 'Touch controls', pr.touchControls)}
          ${slider('touchLook', 'Touch look speed', 0.3, 3, 0.05, pr.touchLook, FMT.touchLook)}
        </section>
        <section class="gm-card"><h3>Display</h3>
          ${choice('graphics', 'Graphics quality', pr.graphics)}
          ${choice('antialias', 'Antialiasing', pr.antialias)}
          ${choice('shadowQuality', 'Shadow map quality', pr.shadowQuality)}
          ${toggle('shadows', 'Shadows', pr.shadows)}
          ${toggle('outlines', 'Ink outlines', pr.outlines)}
          ${toggle('hatching', 'Comic hatching', pr.hatching)}
          ${toggle('motionFX', 'Speed blur & lines', pr.motionFX)}
          ${toggle('gore', 'Gore effects', pr.gore)}
          ${slider('shake', 'Camera shake', 0, 1, 0.05, pr.shake, FMT.shake)}
          ${slider('renderScale', 'Resolution scale', 0.5, 1.5, 0.05, pr.renderScale, FMT.renderScale)}
          ${toggle('dynamicRes', 'Adaptive resolution', pr.dynamicRes)}
          ${toggle('fullscreen', 'Fullscreen in play', pr.fullscreen)}
          <p class="hint">FXAA smooths the finished image, including ink outlines; MSAA smooths geometry during rendering. Try MSAA + FXAA if outlines still look jagged. Higher shadow-map quality and resolution use more GPU memory and time. Resolution scale tops out at twice the screen's CSS resolution, and adaptive resolution can lower it while frames run slow. Fullscreen lets Esc open and close menus without the browser taking the mouse away (Chrome, Edge); hold Esc to leave it. Graphics quality: Low draws the scene as it is; Medium adds finer ink, a soft glow and a field of grass; High adds ambient occlusion, long-range shadows and denser grass.</p>
        </section>
      </div>
      <div class="pm-foot"><button class="gm-btn" data-act="defaults">Reset to defaults</button></div>`;
  }

  controlsHTML() {
    const groups = CONTROLS.map(([title, rows]) => `
      <section class="gm-card"><h3>${title}</h3>
        <dl class="gm-dl">${rows.map(([what, keys]) => `<dt>${esc(what)}</dt><dd>${esc(keys)}</dd>`).join('')}</dl>
      </section>`).join('');
    return `
      <div class="pm-groups">${groups}</div>
      <p class="pm-note">Momentum carries: bullet jumps launch faster than the slide that fed them, glides only slow your fall, and air dashes add to your speed.</p>`;
  }
}
