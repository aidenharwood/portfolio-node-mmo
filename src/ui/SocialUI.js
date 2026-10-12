// Friends, ignores, the guild and mail, as the server tells them (server/social.js), and the
// game menu's Guild and Mail tabs (ui/GameMenu.js asks this module for their contents and passes
// it their clicks).
import { itemFromRecipe } from '../items/items.js';
import { RARITY } from '../items/rarity.js';
import { esc } from './cards.js';

const RANK = ['Member', 'Officer', 'Leader'];
const build = (r) => { try { return r ? itemFromRecipe(r) : null; } catch { return null; } };
const ago = (t) => {
  const m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};

export class SocialUI {
  constructor(game) {
    this.game = game;
    this.friends = [];
    this.ignores = [];
    this.guild = null;
    this.unread = 0;
    this.inbox = null;     // loaded when the Mail tab opens
    this.attach = null;    // backpack index chosen to send
  }

  set(msg) {
    this.friends = msg.friends ?? [];
    this.ignores = msg.ignores ?? [];
    this.guild = msg.guild ?? null;
    this.unread = msg.unread ?? 0;
    this.refresh();
  }

  setMail(list) {
    this.inbox = list;
    this.refresh();
  }

  clear() {
    this.friends = [];
    this.ignores = [];
    this.guild = null;
    this.unread = 0;
    this.inbox = null;
  }

  refresh() {
    const m = this.game.menu;
    if (m.isOpen && ['social', 'guild', 'mail'].includes(m.page)) m.renderTab();
  }

  chat(text) { this.game.net.send({ t: 'chat', text }); }

  // ---------------------------------------------------------------- Social tab parts
  friendsHTML() {
    const rows = this.friends.map((f) => `
      <li class="${f.online ? '' : 'offline'}"><span class="np-lv">${f.level}</span><b>${esc(f.name)}</b><small>${f.online ? 'Online' : 'Offline'}</small>
        <span class="gm-row">${f.online ? `<button class="gm-btn" data-act="whisper" data-name="${esc(f.name)}">Whisper</button>` : ''}<button class="gm-btn" data-act="s-unfriend" data-name="${esc(f.name)}">Remove</button></span></li>`).join('');
    const ign = this.ignores.map((n) => `<li><b>${esc(n)}</b><small>Ignored</small><span class="gm-row"><button class="gm-btn" data-act="s-unignore" data-name="${esc(n)}">Unignore</button></span></li>`).join('');
    return `
      <h3>Friends</h3>
      ${rows ? `<ul class="gm-players">${rows}</ul>` : '<p class="pm-empty">No friends yet. /friend Name, or Add Friend on a nearby player.</p>'}
      ${ign ? `<h3>Ignored</h3><ul class="gm-players">${ign}</ul>` : ''}`;
  }

  // ---------------------------------------------------------------- Guild tab
  guildHTML() {
    const g = this.guild;
    if (!g) {
      return `
        <div class="gm-cols"><section class="gm-card gm-wide">
          <h3>Guild</h3>
          <p class="pm-empty">You're not in a guild. Found one, or ask a guild officer for an invitation.</p>
          <form class="gm-form" data-form="guild-create">
            <label>Name<input name="name" maxlength="24" placeholder="The Ember Wardens" required></label>
            <label>Tag<input name="tag" maxlength="4" placeholder="EMB" required></label>
            <button class="gm-btn" type="submit">Found Guild</button>
          </form>
          <p class="hint">Invited? Type /guild accept.</p>
        </section></div>`;
    }
    const officer = g.rank >= 1;
    const leader = g.rank >= 2;
    const rows = g.members.map((m) => {
      const me = m.name === this.game.net.character?.name;
      const below = m.rank < g.rank;
      const tools = !me && below && officer
        ? `${leader ? `<button class="gm-btn" data-act="g-promote" data-name="${esc(m.name)}">${m.rank === 1 ? 'Make Leader' : 'Promote'}</button>` : ''}${leader && m.rank === 1 ? `<button class="gm-btn" data-act="g-demote" data-name="${esc(m.name)}">Demote</button>` : ''}<button class="gm-btn gm-quit" data-act="g-kick" data-name="${esc(m.name)}">Remove</button>`
        : '';
      return `<li class="${m.online ? '' : 'offline'}"><span class="np-lv">${m.level}</span><b>${esc(m.name)}${me ? ' (you)' : ''}</b><small>${RANK[m.rank]} · ${m.online ? 'Online' : 'Offline'}</small><span class="gm-row">${tools}</span></li>`;
    }).join('');
    return `
      <div class="gm-cols">
        <section class="gm-card">
          <h3>${esc(g.name)} <span class="gm-tag">[${esc(g.tag)}]</span></h3>
          ${g.motd ? `<p class="gm-motd">${esc(g.motd)}</p>` : ''}
          <ul class="gm-players">${rows}</ul>
        </section>
        <section class="gm-card">
          <h3>Guild chat</h3>
          <p class="hint">/g message — everyone in the guild hears it, wherever they are.</p>
          ${officer ? `
          <h3>Invite</h3>
          <form class="gm-form" data-form="guild-invite"><label>Player<input name="name" maxlength="16" required></label><button class="gm-btn" type="submit">Invite</button></form>
          <h3>Message of the day</h3>
          <form class="gm-form" data-form="guild-motd"><label>Message<input name="motd" maxlength="200" value="${esc(g.motd)}"></label><button class="gm-btn" type="submit">Set</button></form>` : ''}
          <h3>You</h3>
          <p class="hint">${RANK[g.rank]}${leader ? ' — pass leadership on before you leave, or disband the guild.' : '.'}</p>
          <div class="gm-row">
            <button class="gm-btn gm-quit" data-act="g-leave">Leave Guild</button>
            ${leader ? '<button class="gm-btn gm-quit" data-act="g-disband">Disband</button>' : ''}
          </div>
        </section>
      </div>`;
  }

  // ---------------------------------------------------------------- Mail tab
  mailHTML() {
    if (!this.inbox) {
      this.game.net.send({ t: 'mail', act: 'list' });
      return '<p class="pm-empty">Fetching your mail…</p>';
    }
    const g = this.game;
    const letters = this.inbox.map((m) => {
      const item = build(m.item);
      const attached = (m.gold || item) && !m.claimed;
      return `
        <article class="gm-letter ${m.read ? '' : 'unread'}">
          <header><b>${esc(m.from_name)}</b><small>${ago(m.sent)}</small></header>
          ${m.body ? `<p>${esc(m.body)}</p>` : ''}
          ${m.gold || item ? `<p class="gm-attach">${m.gold ? `<span class="gold">${m.gold}g</span>` : ''}${item ? `<span style="color:${RARITY[item.rarity].css}">${esc(item.name)}</span>` : ''}${m.claimed ? ' <small>claimed</small>' : ''}</p>` : ''}
          <div class="gm-row">
            ${attached ? `<button class="gm-btn" data-act="m-claim" data-id="${m.id}">Claim</button>` : ''}
            ${m.read ? '' : `<button class="gm-btn" data-act="m-read" data-id="${m.id}">Mark Read</button>`}
            <button class="gm-btn gm-quit" data-act="m-delete" data-id="${m.id}">Delete</button>
          </div>
        </article>`;
    }).join('');
    const pack = g.player.inventory.backpack;
    const att = this.attach !== null ? pack[this.attach] : null;
    if (this.attach !== null && !att) this.attach = null;
    const choices = pack.map((it, i) => (it ? `<option value="${i}" ${i === this.attach ? 'selected' : ''}>${esc(it.name)} (Lv ${it.level})</option>` : '')).join('');
    return `
      <div class="gm-cols">
        <section class="gm-card">
          <h3>Inbox</h3>
          ${letters || '<p class="pm-empty">No mail.</p>'}
        </section>
        <section class="gm-card">
          <h3>Send</h3>
          <form class="gm-form gm-mail" data-form="mail-send">
            <label>To<input name="to" maxlength="16" required></label>
            <label>Message<textarea name="body" maxlength="500" rows="4"></textarea></label>
            <label>Gold<input name="gold" type="number" min="0" max="${g.stats.gold}" value="0"></label>
            <label>Item<select name="bi"><option value="">— nothing —</option>${choices}</select></label>
            <button class="gm-btn" type="submit">Send</button>
          </form>
          <p class="hint">Mail reaches characters whether they're online or not. Gold and items leave your character when you send.</p>
        </section>
      </div>`;
  }

  // ---------------------------------------------------------------- clicks and forms from the tabs
  onAct(act, data) {
    const n = this.game.net;
    switch (act) {
      case 's-friend': return this.chat(`/friend ${data.name}`);
      case 's-unfriend': return this.chat(`/unfriend ${data.name}`);
      case 's-ignore': return this.chat(`/ignore ${data.name}`);
      case 's-unignore': return this.chat(`/unignore ${data.name}`);
      case 'g-promote': return this.chat(`/guild promote ${data.name}`);
      case 'g-demote': return this.chat(`/guild demote ${data.name}`);
      case 'g-kick': return this.chat(`/guild kick ${data.name}`);
      case 'g-leave': return this.chat('/guild leave');
      case 'g-disband': return this.chat('/guild disband');
      case 'm-claim': return n.send({ t: 'mail', act: 'claim', id: Number(data.id) });
      case 'm-read': return n.send({ t: 'mail', act: 'read', id: Number(data.id) });
      case 'm-delete': return n.send({ t: 'mail', act: 'delete', id: Number(data.id) });
    }
  }

  onSubmit(form) {
    const fd = new FormData(form);
    switch (form.dataset.form) {
      case 'guild-create': return this.chat(`/guild create ${String(fd.get('name')).trim()} ${String(fd.get('tag')).trim()}`);
      case 'guild-invite': return this.chat(`/guild invite ${String(fd.get('name')).trim()}`);
      case 'guild-motd': return this.chat(`/guild motd ${String(fd.get('motd')).trim()}`);
      case 'mail-send': {
        const bi = fd.get('bi');
        this.game.net.send({
          t: 'mail', act: 'send', to: String(fd.get('to')).trim(), body: String(fd.get('body') ?? ''),
          gold: Number(fd.get('gold')) || 0, bi: bi === '' || bi === null ? null : Number(bi),
        });
        form.reset();
        return null;
      }
    }
    return null;
  }
}
