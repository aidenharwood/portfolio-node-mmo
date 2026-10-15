// Raids on this screen (gameplay phase 7): the city raid gate's dialog (the raids, their tiers, and
// which of their chests this character has opened this week), the raid group at a city's war table
// (server/raidgroups.js runs it online: form, invite, leave), the invitation prompt (Y / N), frames
// for the raid members outside your party, and — down in a raid — the encounter on the HUD: each
// boss's health, its phase, its shield, and how long until it enrages (sim/RaidRun.js sends the
// fights with the copy's state).
import { RAIDS, raidChoices, raidLockKey, lockWeek, weekEnds, sealedText } from '../world/raids.js';
import { BOSS_SCRIPTS } from '../combat/bosses.js';
import { TIERS } from '../rpg/balance.js';
import { esc } from './cards.js';

export const RAID_COLOR = '#ff9a5a';
const INVITE_TTL = 60;

export class RaidUI {
  constructor(game) {
    this.game = game;
    this.raid = null;          // the raid group (online): { id, leader, units: [{ key, leader, members }] }
    this.pos = new Map();      // char id → { x, z, hp, alive }
    this.invite = null;
    this.fight = null;         // the encounter in progress here: { i, b: [...], at }
    this.frames = document.createElement('div');
    this.frames.id = 'raid';
    document.getElementById('hud').appendChild(this.frames);
    this.bars = document.createElement('div');
    this.bars.id = 'raid-boss';
    this.bars.className = 'hidden';
    document.getElementById('hud').appendChild(this.bars);
    this.prompt = document.createElement('div');
    this.prompt.id = 'raid-invite';
    this.prompt.className = 'hidden';
    document.body.appendChild(this.prompt);
    this.prompt.addEventListener('click', (e) => {
      const b = e.target.closest('[data-answer]');
      if (b) this.respond(b.dataset.answer === 'yes');
    });
  }

  get me() { return this.game.net.character?.id ?? null; }
  get online() { return !!this.game.net.inWorld; }
  get size() { return this.raid ? this.raid.units.reduce((n, u) => n + u.members.length, 0) : 0; }
  get isLeader() { return !!this.raid && this.raid.leader === this.me; }
  // Down in a raid with a fight on: the HUD's own boss bar gives way to the encounter's.
  get active() { return !!this.fight; }

  send(act, name) { this.game.net.send({ t: 'raid', act, name }); }

  // ---------------------------------------------------------------- the raid group (online)
  set(raid) {
    this.raid = raid;
    if (!raid) this.pos.clear();
    this.render();
  }

  positions(rp) {
    this.pos.clear();
    for (const [id, x, z, hp, alive] of rp) this.pos.set(id, { x, z, hp, alive });
  }

  invited({ from, size }) {
    this.invite = { from, size, t: INVITE_TTL };
    this.prompt.innerHTML = `
      <b>${esc(from)}</b> invites you to their raid group (${size} so far)
      <span><button data-answer="yes">Accept <kbd>Y</kbd></button><button data-answer="no">Decline <kbd>N</kbd></button></span>`;
    this.prompt.classList.remove('hidden');
    this.game.audio.ui?.('invite');
    this.game.chat.add({ ch: 'raid', text: `${from} invites you to a raid group — Y or /raid accept to join, N or /raid decline.` });
  }

  respond(yes) {
    if (!this.invite) return;
    this.send(yes ? 'accept' : 'decline');
    this.invite = null;
    this.prompt.classList.add('hidden');
  }

  clear() {
    this.raid = null;
    this.pos.clear();
    this.invite = null;
    this.prompt.classList.add('hidden');
    this.render();
  }

  // The raid's members outside your own party (the party has frames of its own).
  others() {
    if (!this.raid) return [];
    const mine = new Set((this.game.partyUI.party?.members ?? []).map((m) => m.id));
    mine.add(this.me);
    return this.raid.units.flatMap((u) => u.members.map((m) => ({ ...m, lead: u.leader === m.id }))).filter((m) => !mine.has(m.id));
  }

  render() {
    const list = this.others();
    if (!list.length) { this.frames.innerHTML = ''; return; }
    this.frames.innerHTML = `<div class="rd-head">Raid · ${this.size}</div>` + list.map((m) => `
      <div class="rd-member ${m.online ? '' : 'offline'} ${this.raid.leader === m.id ? 'leader' : ''}" data-id="${m.id}">
        <b>${esc(m.name)}</b><i class="rd-hp"><em></em></i>
      </div>`).join('');
  }

  // ---------------------------------------------------------------- at the gate and the war table
  // A city's raid gate: every raid there is, and which are open to us.
  gateDialog(gate) {
    const g = this.game;
    const dev = !!g.dev?.dungeons;
    g.dialogue.open({
      name: 'Raid Gate', title: gate.title,
      text: 'An arch big enough to march an army through, its seal burning ember-bright. The Wardens hold it open now for any force strong enough to go — a raid group, a party, or the foolhardy alone.',
      // Sealed but in a raid group or party: one of them may have opened it (the server decides).
      options: raidChoices(g.quests.flags, { dev, grouped: g.net.inWorld && (!!this.raid || !!g.partyUI?.party) }).map(({ def, sealed, locked }) => ({
        label: `${def.name} · Level ${def.level}${sealed ? ' · sealed' : ''}`, cls: locked ? '' : 'quest',
        onClick: () => (locked ? g.hud.toast(sealedText(def)) : this.raidDialog(def, gate)),
      })),
    });
  }

  // One raid: what's in it, its tiers, and this week's chests.
  raidDialog(def, gate) {
    const g = this.game;
    const week = lockWeek();
    const days = Math.max(1, Math.ceil((weekEnds() - Date.now()) / 86400000));
    // Each encounter: who's in it (or its phases), and which tiers' chests are opened this week.
    const notes = def.encounters.map((e) => {
      const opened = TIERS.filter((T, i) => g.settings.lockouts?.[raidLockKey(def.id, e.id, i)] === week).map((T) => T.name);
      return {
        title: e.name, tag: opened.length ? `Opened: ${opened.join(', ')}` : 'Chests ready',
        text: e.units.length > 1 ? e.units.map((u) => BOSS_SCRIPTS[u.script]?.name).join(' · ') : BOSS_SCRIPTS[e.units[0].script]?.phases.map((p) => p.name).join(' → ') ?? '',
      };
    });
    const options = TIERS.map((T, i) => {
      const done = def.encounters.filter((e) => g.settings.lockouts?.[raidLockKey(def.id, e.id, i)] === week).length;
      return {
        label: `${T.name}${done ? ` · ${done} of ${def.encounters.length} chests opened this week` : ''}`, cls: done < def.encounters.length ? 'quest' : '',
        onClick: () => this.enter(def, i),
      };
    });
    options.push({ label: 'Back', onClick: () => this.gateDialog(gate) });
    const who = !this.online ? 'You go alone' : this.raid ? `Your raid group of ${this.size} goes together` : g.partyUI.party ? 'Your party goes together (form a raid group at the war table to bring more)' : 'You go alone (form a raid group at the war table to bring others)';
    g.dialogue.open({
      name: def.name, title: `Raid · Level ${def.level} · up to ${def.size}`,
      text: `${def.blurb} ${who}, at a tier of your choosing: each of its ${def.encounters.length} encounters has a chest of its own, once a week for each tier (the week turns in ${days} day${days === 1 ? '' : 's'}). The bosses grow with how many of you there are.`,
      notes, options,
    });
  }

  async enter(def, tier) {
    const g = this.game;
    g.closeMenus();
    const ok = await g.charLink.do({ op: 'enter', d: def.id, mode: 'run', tier, via: 'gate' });
    if (!ok && !g.net.inWorld) g.hud.toast(g.enemyLayer.dungeons?.error ?? `Couldn't go into ${def.name}.`);
  }

  // The war table's raid board: the raid group, and what to do about it.
  warNotes() {
    const notes = [];
    for (const def of Object.values(RAIDS)) {
      notes.push({ title: def.name, tag: `Raid · Lv ${def.level}`, text: `Through the raid gate in the gate yard. ${def.encounters.map((e) => e.name).join(', ')}.` });
    }
    if (this.raid) {
      for (const u of this.raid.units) {
        notes.push({
          title: `${u.members.find((m) => m.id === u.leader)?.name ?? '?'}${u.members.length > 1 ? `'s party` : ''}${u.leader === this.raid.leader ? ' (leads)' : ''}`, tag: `${u.members.length}`,
          text: u.members.map((m) => `${m.name}${m.online ? '' : ' (away)'}`).join(', '),
        });
      }
    }
    return notes;
  }

  warOptions() {
    if (!this.online) return [];
    const opts = [];
    if (!this.raid) opts.push({ label: 'Form a raid group', cls: 'quest', onClick: () => { this.send('form'); this.game.closeMenus(); } });
    else {
      opts.push({ label: 'Invite a party: /raid invite Name', onClick: () => { this.game.closeMenus(); this.game.chat.open?.('/raid invite '); } });
      opts.push({ label: this.isLeader ? 'Disband the raid group' : 'Take your party out of the raid', onClick: () => { this.send(this.isLeader ? 'disband' : 'leave'); this.game.closeMenus(); } });
    }
    return opts;
  }

  // ---------------------------------------------------------------- the fight on the HUD
  // The copy's state as it comes (world/DungeonView.js keeps it): the encounter whose fight is on.
  syncFight() {
    const dv = this.game.dungeonView;
    const list = dv.active && dv.raid ? dv.state.raid ?? [] : [];
    const on = list.find((e) => e.st === 'fight');
    if (!on) { this.fight = null; return; }
    if (this.fight?.src !== on) this.fight = { src: on, i: on.i, b: on.b, at: this.game.time, def: dv.def.encounters[on.i] };
  }

  updateBars() {
    const g = this.game;
    this.syncFight();
    const f = this.fight;
    this.bars.classList.toggle('hidden', !f);
    if (!f) { this.bars.innerHTML = ''; this.barKey = ''; return; }
    const since = g.time - f.at;
    const rows = f.b.map((b) => {
      const v = g.enemyLayer.views.get(b.id);
      const S = BOSS_SCRIPTS[b.s];
      return { b, v, S, phase: S?.phases[b.ph]?.name ?? '', enrage: b.en === null ? null : Math.max(0, b.en - since) };
    });
    // Built once per fight's shape; filled every frame.
    const key = `${f.i}:${rows.map((r) => `${r.b.id}.${r.b.ph}`).join(',')}`;
    if (key !== this.barKey) {
      this.barKey = key;
      this.bars.innerHTML = `<div class="rb-title">${esc(f.def?.name ?? 'Encounter')}</div>` + rows.map((r) => `
        <div class="rb-boss" data-id="${r.b.id}">
          <div class="rb-name"><b>${esc(r.v?.displayName ?? r.S?.name ?? 'Boss')}</b><small>${esc(r.phase)}</small></div>
          <div class="boss-track"><i class="rb-fill"></i><i class="rb-shield"></i></div>
        </div>`).join('') + '<div class="rb-enrage"></div>';
    }
    let soonest = null;
    for (const r of rows) {
      const el = this.bars.querySelector(`.rb-boss[data-id="${r.b.id}"]`);
      if (!el) continue;
      const v = r.v;
      const frac = v ? Math.max(0, v.hp / v.maxHp) : 1;
      el.querySelector('.rb-fill').style.width = `${frac * 100}%`;
      el.querySelector('.rb-shield').style.width = `${v && v.shield > 0 ? Math.min(1, v.shield / v.maxHp) * 100 : 0}%`;
      el.classList.toggle('immune', !!v?.immune);
      el.classList.toggle('dead', !!v && !v.alive);
      if (r.enrage !== null) soonest = soonest === null ? r.enrage : Math.min(soonest, r.enrage);
    }
    const en = this.bars.querySelector('.rb-enrage');
    if (en) {
      const enraged = f.b.some((b) => b.rg) || soonest === 0;
      en.textContent = enraged ? 'Enraged' : soonest !== null ? `Enrage in ${Math.floor(soonest / 60)}:${String(Math.floor(soonest % 60)).padStart(2, '0')}` : '';
      en.classList.toggle('on', enraged);
    }
  }

  update(dt) {
    if (this.invite && (this.invite.t -= dt) <= 0) {
      this.invite = null;
      this.prompt.classList.add('hidden');
    }
    this.updateBars();
    if (!this.raid) return;
    for (const m of this.others()) {
      const el = this.frames.querySelector(`.rd-member[data-id="${m.id}"]`);
      if (!el) { this.render(); return; }
      const p = this.pos.get(m.id);
      el.querySelector('em').style.width = `${Math.max(0, Math.min(1, p?.hp ?? 1)) * 100}%`;
      el.classList.toggle('down', !!p && !p.alive);
    }
  }
}
