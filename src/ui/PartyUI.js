// The party, on this screen (server/parties.js runs it): frames on the HUD for each other member
// (level, name, distance, health; dimmed while they're offline; the leader marked), the invite
// prompt (Y accept · N decline, or click), and where the members are — for the compass, the
// minimap and the world map, at any distance — in the party's own colour.
import { esc } from './cards.js';

export const PARTY_COLOR = '#7dffb0';
const INVITE_TTL = 60;

export class PartyUI {
  constructor(game) {
    this.game = game;
    this.party = null;
    this.pos = new Map();   // character id → { x, z, hp, alive } (from the server, twice a second)
    this.invite = null;     // { from, size, t }
    this.frames = document.createElement('div');
    this.frames.id = 'party';
    document.getElementById('hud').appendChild(this.frames);
    this.prompt = document.createElement('div');
    this.prompt.id = 'party-invite';
    this.prompt.className = 'hidden';
    document.body.appendChild(this.prompt);
    this.prompt.addEventListener('click', (e) => {
      const b = e.target.closest('[data-answer]');
      if (b) this.respond(b.dataset.answer === 'yes');
    });
  }

  get me() { return this.game.net.character?.id ?? null; }
  get isLeader() { return !!this.party && this.party.leader === this.me; }
  get full() { return !!this.party && this.party.members.length >= 4; }

  // The other members, with where they are (the server's word, or their view here if closer).
  get mates() {
    if (!this.party) return [];
    return this.party.members.filter((m) => m.id !== this.me).map((m) => {
      const view = m.sid ? this.game.remotes.byId.get(m.sid) : null;
      const p = this.pos.get(m.id);
      const x = view ? view.position.x : p?.x;
      const z = view ? view.position.z : p?.z;
      return { ...m, x, z, hp: view ? view.hpFrac : p?.hp ?? 1, alive: p ? !!p.alive : true, known: x !== undefined };
    });
  }

  isMate(sid) { return !!this.party?.members.some((m) => m.sid === sid && m.id !== this.me); }
  hasMember(name) { return !!this.party?.members.some((m) => m.name.toLowerCase() === String(name).toLowerCase()); }

  send(act, name) { this.game.net.send({ t: 'party', act, name }); }

  set(party) {
    this.party = party;
    if (!party) this.pos.clear();
    this.render();
    if (this.game.menu.isOpen && this.game.menu.page === 'social') this.game.menu.renderTab('social');
  }

  positions(pp) {
    this.pos.clear();
    for (const [id, x, z, hp, alive] of pp) this.pos.set(id, { x, z, hp, alive });
  }

  invited({ from, size }) {
    this.invite = { from, size, t: INVITE_TTL };
    this.prompt.innerHTML = `
      <b>${esc(from)}</b> invites you to ${size > 1 ? `their party (${size}/4)` : 'a party'}
      <span><button data-answer="yes">Accept <kbd>Y</kbd></button><button data-answer="no">Decline <kbd>N</kbd></button></span>`;
    this.prompt.classList.remove('hidden');
    this.game.audio.ui?.('invite');
    this.game.chat.add({ ch: 'party', text: `${from} invites you to a party — Y or /accept to join, N or /decline.` });
  }

  respond(yes) {
    if (!this.invite) return;
    this.send(yes ? 'accept' : 'decline');
    this.invite = null;
    this.prompt.classList.add('hidden');
  }

  clear() {
    this.party = null;
    this.pos.clear();
    this.invite = null;
    this.prompt.classList.add('hidden');
    this.render();
  }

  render() {
    const mates = this.mates;
    if (!mates.length) { this.frames.innerHTML = ''; return; }
    this.frames.innerHTML = `<div class="pt-head">Party</div>` + mates.map((m) => `
      <div class="pt-member ${m.online ? '' : 'offline'} ${this.party.leader === m.id ? 'leader' : ''}" data-id="${m.id}">
        <span class="pt-lv">${m.level || '·'}</span>
        <b>${esc(m.name)}</b><small></small>
        <i class="pt-hp"><em></em></i>
      </div>`).join('');
  }

  update(dt) {
    if (this.invite && (this.invite.t -= dt) <= 0) {
      this.invite = null;
      this.prompt.classList.add('hidden');
    }
    if (!this.party) return;
    const p = this.game.player.position;
    for (const m of this.mates) {
      const el = this.frames.querySelector(`.pt-member[data-id="${m.id}"]`);
      if (!el) { this.render(); return; }
      el.querySelector('small').textContent = !m.online ? 'offline' : !m.known ? '' : !m.alive ? 'down' : `${Math.round(Math.hypot(m.x - p.x, m.z - p.z))} m`;
      el.querySelector('em').style.width = `${Math.max(0, Math.min(1, m.hp)) * 100}%`;
      el.classList.toggle('down', m.online && !m.alive);
    }
  }
}
