// The game menu: a full-screen hub for your character — Character (level, attributes, stats),
// Inventory (gear and backpack; the trader's shop too), Journal (quests), Map, Social (online:
// who's around, whispers), Settings and Controls. The world keeps running while it's open (your
// character stands and stays in danger: the header shows your health); only single-player freezes,
// and only while the window is in the background.
//   Esc opens it (last tab) and closes it · I/Tab inventory · M map · L journal · P character ·
//   O social · Q/E step through tabs.
// Over the title screen it holds just Settings and Controls.
import { esc } from './cards.js';
import { defaultPrefs } from '../core/Prefs.js';
import { ATTRIBUTES } from '../rpg/Stats.js';
import { RARITY } from '../items/rarity.js';
import { ARMOR_SLOTS, ARMOR_SLOT_IDS } from '../items/armorTypes.js';

const TABS = [
  { id: 'character', label: 'Character', key: 'P' },
  { id: 'inventory', label: 'Inventory', key: 'I' },
  { id: 'journal', label: 'Journal', key: 'L' },
  { id: 'map', label: 'Map', key: 'M' },
  { id: 'social', label: 'Social', key: 'O', online: true },
  { id: 'guild', label: 'Guild', key: 'G', online: true },
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
  ]],
  ['World', [
    ['Interact', 'E'],
    ['Pick up loot', 'F, aiming at it'],
    ['Swap loot for what you use', 'Hold F'],
    ['Game menu', 'Esc'],
    ['Character · inventory · journal', 'P · I or Tab · L'],
    ['Map · social · guild', 'M · O · G (online)'],
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
    ['Menu · chat · view', 'The buttons at the top'],
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
      if (e.code === 'Escape' || (/^Key[QEIMLPOG]$|^Tab$/.test(e.code) && !/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))) return;
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
      character: this.characterHTML, journal: this.journalHTML, social: this.socialHTML, settings: this.settingsHTML, controls: this.controlsHTML,
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
      const region = g.world.regionAt(p.position.x, p.position.z);
      const name = g.net.inWorld ? esc(g.net.character?.name ?? '') : 'Wanderer';
      const hp = p.maxHp ? p.hp / p.maxHp : 1;
      const key = `${name}|${g.stats.level}|${region.name}|${Math.round(hp * 200)}`;
      if (key !== this.whoKey) {
        this.whoKey = key;
        this.q('.gm-who').innerHTML = `
          <span class="gm-lv">${g.stats.level}</span>
          <span class="gm-name">${name}<small>${esc(region.name)} · region level ${region.level}</small></span>
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
      case 'attr':
        g.charLink.do({ op: 'spend', a: t.dataset.a });
        this.renderTab();
        break;
      case 'filter':
        g.charLink.do({ op: 'filter', v: Number(t.dataset.v) });
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
    const attrs = Object.entries(ATTRIBUTES).map(([id, a]) => {
      const bonus = s.gear[id] ? ` <em>+${s.gear[id]}</em>` : '';
      return `<div class="attr"><div><b>${a.name}</b> ${s.attr[id]}${bonus}<small>${a.desc}</small></div>
        <button data-act="attr" data-a="${id}" ${s.points > 0 ? '' : 'disabled'} aria-label="Raise ${a.name}">+</button></div>`;
    }).join('');
    const mitigation = Math.round((1 - 100 / (100 + s.armor)) * 100);
    const gear = (item, label) => item
      ? `<li><span>${label}</span><b style="color:${RARITY[item.rarity].css}">${esc(item.name)}</b><small>Lv ${item.level}</small></li>`
      : `<li class="none"><span>${label}</span><b>—</b></li>`;
    const filter = FILTERS.map((label, i) => `<button class="${g.settings.lootFilter === i ? 'on' : ''}" data-act="filter" data-v="${i}">${label}</button>`).join('');
    return `
      <div class="gm-cols">
        <section class="gm-card">
          <h3>Level</h3>
          <div class="gm-level"><b>${s.level}</b><div><div class="gm-xp"><i style="width:${(xp * 100).toFixed(1)}%"></i></div><small>${s.xp} / ${s.xpToNext()} XP to level ${s.level + 1}</small></div></div>
          <div class="pm-stats"><span><b>${s.gold}</b>gold</span><span><b>${s.kills}</b>kills</span><span><b>${s.points}</b>points to spend</span></div>
          <h3>Attributes</h3>
          ${s.points ? `<div class="pts">${s.points} attribute point${s.points > 1 ? 's' : ''} to spend</div>` : ''}
          ${attrs}
        </section>
        <section class="gm-card">
          <h3>Combat</h3>
          <div class="derived">
            <div>Max Health <b>${s.maxHp}</b></div><div>Max Mana <b>${s.maxMana}</b></div>
            <div>Armour <b>${Math.round(s.armor)} (−${mitigation}%)</b></div><div>Move speed <b>${pct(1 + s.moveSpeed)}</b></div>
            <div>Melee damage <b>${pct(s.damageMult('melee'))}</b></div><div>Ranged damage <b>${pct(s.damageMult('ranged'))}</b></div>
            <div>Magic damage <b>${pct(s.damageMult('magic'))}</b></div><div>Crit bonus <b>+${(s.critBonus * 100).toFixed(1)}%</b></div>
          </div>
          <h3>Equipped</h3>
          <ul class="gm-gear">
            ${inv.slots.map((w, i) => gear(w, `Weapon ${i + 1}${i === inv.active ? ' ◆' : ''}`)).join('')}
            ${ARMOR_SLOT_IDS.map((sl) => gear(inv.armor[sl], ARMOR_SLOTS[sl].label)).join('')}
          </ul>
          <h3>Loot filter</h3>
          <div class="filter">${filter}</div>
          <p class="hint">Drops below the filter are auto-scrapped for gold.</p>
        </section>
      </div>`;
  }

  journalHTML() {
    const log = this.game.quests;
    const active = Object.keys(log.active);
    const giver = { warden: 'Warden Maren', sage: 'Old Ysolde' };
    const rows = active.map((id) => {
      const q = log.defs.get(id);
      if (!q) return '';
      const prog = log.active[id];
      const done = log.isComplete(id);
      const goals = done ? `<li class="done">Ready to turn in to ${esc(giver[q.giver] ?? 'the quest giver')}</li>`
        : q.objectives.map((o, i) => `<li class="${prog[i] >= o.count ? 'done' : ''}">${esc(o.text)} <b>${Math.min(prog[i], o.count)}/${o.count}</b></li>`).join('');
      return `<article class="gm-quest ${done ? 'ready' : ''}"><h4>${esc(q.title)}</h4>${giver[q.giver] ? `<small>From ${giver[q.giver]}</small>` : ''}<ul>${goals}</ul></article>`;
    }).join('');
    return `
      <div class="gm-cols">
        <section class="gm-card gm-wide">
          <h3>Active quests</h3>
          ${rows || '<p class="pm-empty">No active quests. Warden Maren and Old Ysolde at Brightwater always have work.</p>'}
          <p class="hint">${log.completed.size} quest${log.completed.size === 1 ? '' : 's'} completed.</p>
        </section>
      </div>`;
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
          ${toggle('shadows', 'Shadows', pr.shadows)}
          ${toggle('outlines', 'Ink outlines', pr.outlines)}
          ${toggle('hatching', 'Comic hatching', pr.hatching)}
          ${toggle('motionFX', 'Speed blur & lines', pr.motionFX)}
          ${slider('shake', 'Camera shake', 0, 1, 0.05, pr.shake, FMT.shake)}
          ${slider('renderScale', 'Resolution', 0.5, 1, 0.05, pr.renderScale, FMT.renderScale)}
          ${toggle('dynamicRes', 'Adaptive resolution', pr.dynamicRes)}
          ${toggle('fullscreen', 'Fullscreen in play', pr.fullscreen)}
          <p class="hint">Fullscreen lets Esc open and close menus without the browser taking the mouse away (Chrome, Edge). Hold Esc to leave it. Adaptive resolution lowers the resolution while the frame rate struggles. Graphics quality: Low draws the scene as it is; Medium adds finer ink, a soft glow and a field of grass; High adds ambient occlusion, long-range shadows and denser grass.</p>
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
