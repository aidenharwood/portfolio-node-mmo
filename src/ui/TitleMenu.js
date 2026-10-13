// Title screen: the logo over a slow flight round your character, and the menus.
//   Online (the page came from the Cel Blade server): sign in or create an account, then pick,
//   create or delete a character and enter the realm. "Play Offline" switches to the local game.
//   Offline: Continue (the saved character and where they are), New Game (confirmed when it would
//   replace a save), Settings and Controls (the pause menu's pages).
// Up/Down (or W/S outside text fields) move between items, Enter picks, Esc backs out.
import { esc } from './cards.js';
import { readSave } from '../core/Save.js';
import { typing } from '../core/Input.js';
import { LOOK_OPTIONS, LOOK_KEYS, DEFAULT_CHOICE, randomChoice } from '../models/heroLooks.js';

const MAX_CHARACTERS = 6;
const LOOK_LABEL = { skin: 'Skin', hair: 'Hair', style: 'Style', outfit: 'Outfit', eye: 'Eyes', beard: 'Beard' };
const hex = (c) => `#${c.toString(16).padStart(6, '0')}`;
const swatch = (c) => `<i class="tt-sw" style="background:${hex(c)}"></i>`;

function lookValue(key, i) {
  const v = LOOK_OPTIONS[key][i];
  if (key === 'style') return v[0].toUpperCase() + v.slice(1);
  if (key === 'beard') return v ? 'Yes' : 'No';
  if (key === 'outfit') return swatch(v[0]) + swatch(v[2]);
  return swatch(v);
}

export class TitleMenu {
  constructor(game, el) {
    this.game = game;
    this.el = el;
    this.page = 'main';
    this.error = '';
    this.register = false;
    this.chars = [];
    this.draft = { name: '', look: { ...DEFAULT_CHOICE } };
    this.deleting = null;
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (b) this.act(b.dataset.act, b.dataset);
    });
    el.addEventListener('submit', (e) => {
      e.preventDefault();
      this.submit(e.target);
    });
    el.addEventListener('input', (e) => {
      if (e.target.name === 'charname') this.draft.name = e.target.value;
    });
    // Hovering or focusing a character shows them on the title flight.
    el.addEventListener('focusin', (e) => {
      const id = e.target.closest('[data-act="play"]')?.dataset.id;
      const c = id && this.chars.find((ch) => String(ch.id) === id);
      if (c) this.game.previewLook(c.look);
    });
    el.addEventListener('pointerover', (e) => e.target.closest('.tt-menu button')?.focus({ preventScroll: true }));
    window.addEventListener('keydown', (e) => {
      if (!this.isOpen || this.game.state !== 'title') return;
      const arrows = e.code === 'ArrowDown' || e.code === 'ArrowUp';
      const step = e.code === 'ArrowDown' || e.code === 'KeyS' ? 1 : e.code === 'ArrowUp' || e.code === 'KeyW' ? -1 : 0;
      if (!step || (typing(e) && !arrows)) return;
      e.preventDefault();
      const items = [...this.el.querySelectorAll('.tt-menu button, .tt-form input')];
      const i = items.indexOf(document.activeElement);
      items[(i + step + items.length) % items.length]?.focus();
    });
  }

  get isOpen() { return !this.el.classList.contains('hidden'); }
  get net() { return this.game.net; }

  open(page = 'main', { error = '' } = {}) {
    this.page = page;
    this.error = error;
    this.el.classList.remove('hidden');
    this.render();
    const first = this.el.querySelector('.tt-form input') ?? this.el.querySelector('.tt-menu button');
    first?.focus({ preventScroll: true });
  }

  close() {
    this.el.classList.add('hidden');
  }

  // The online landing page: the character list if a session is remembered, else sign-in.
  async openOnline() {
    if (!this.net.token) { this.open('login'); return; }
    this.open('loading');
    try {
      this.chars = await this.net.characters();
      this.open('chars');
    } catch (err) {
      this.open('login', { error: this.net.token ? err.message : '' });
    }
  }

  back() {
    if (this.page === 'create' || this.page === 'delete') {
      this.game.previewLook(this.chars[0]?.look ?? DEFAULT_CHOICE);
      this.open('chars');
    } else if (this.page === 'confirm') this.open('main');
  }

  async act(what, data = {}) {
    const g = this.game;
    switch (what) {
      // offline
      case 'continue': g.start(); break;
      case 'new': if (readSave()) this.open('confirm'); else g.startNewGame(); break;
      case 'confirm-new': g.startNewGame(); break;
      case 'cancel': this.back(); break;
      case 'offline': g.useOffline(); break;
      case 'online': g.useOnline(); break;
      case 'settings':
      case 'controls':
        this.close();
        g.menu.open(what, { context: 'title' });
        break;
      // online
      case 'toggle-register':
        this.register = !this.register;
        this.open('login');
        break;
      case 'play': {
        const c = this.chars.find((ch) => String(ch.id) === data.id);
        if (c) g.enterRealm(c);
        break;
      }
      case 'create':
        this.draft = { name: '', look: randomChoice() };
        g.previewLook(this.draft.look);
        this.open('create');
        break;
      case 'look-prev':
      case 'look-next': {
        const k = data.k;
        const n = LOOK_OPTIONS[k].length;
        this.draft.look[k] = (this.draft.look[k] + (what === 'look-next' ? 1 : -1) + n) % n;
        this.el.querySelector(`.tt-look[data-k="${k}"] b`).innerHTML = lookValue(k, this.draft.look[k]);
        g.previewLook(this.draft.look);
        break;
      }
      case 'look-random':
        this.draft.look = randomChoice();
        g.previewLook(this.draft.look);
        for (const k of LOOK_KEYS) this.el.querySelector(`.tt-look[data-k="${k}"] b`).innerHTML = lookValue(k, this.draft.look[k]);
        break;
      case 'back': this.back(); break;
      case 'delete':
        this.deleting = this.chars.find((ch) => String(ch.id) === data.id) ?? null;
        if (this.deleting) this.open('delete');
        break;
      case 'confirm-delete':
        try {
          await this.net.deleteCharacter(this.deleting.id);
          this.chars = this.chars.filter((ch) => ch !== this.deleting);
          this.open('chars');
        } catch (err) {
          this.open('chars', { error: err.message });
        }
        break;
      case 'signout':
        await this.net.signOut();
        this.chars = [];
        this.open('login');
        break;
    }
  }

  async submit(form) {
    const fd = new FormData(form);
    const busy = (on) => form.querySelectorAll('button, input').forEach((b) => { b.disabled = on; });
    if (form.dataset.form === 'signin') {
      const name = String(fd.get('name') ?? '').trim();
      const password = String(fd.get('password') ?? '');
      if (this.register && password !== fd.get('password2')) { this.showError("The passwords don't match."); return; }
      busy(true);
      try {
        await this.net.signIn(name, password, this.register);
        this.register = false;
        await this.openOnline();
      } catch (err) {
        busy(false);
        this.showError(err.message);
      }
    } else if (form.dataset.form === 'create') {
      busy(true);
      try {
        const name = this.draft.name.trim();
        const c = await this.net.createCharacter(name.charAt(0).toUpperCase() + name.slice(1), this.draft.look);
        this.chars.unshift(c);
        this.game.enterRealm(c);
      } catch (err) {
        busy(false);
        this.showError(err.message);
      }
    }
  }

  showError(text) {
    const el = this.el.querySelector('.tt-error');
    if (el) el.textContent = text;
  }

  render() {
    const logo = '<h1 class="tt-logo"><span class="tt-cel">CEL</span><span class="tt-blade">BLADE</span></h1>';
    const err = `<p class="tt-error" role="alert">${esc(this.error)}</p>`;
    const realm = this.net.status ? `<p class="tt-foot">Realm online · ${this.net.status.players} playing</p>` : '';
    const html = {
      loading: () => `<p class="tt-status">Connecting…</p>`,
      joining: () => `<p class="tt-status">Entering the world…</p>`,
      login: () => `
        <form class="tt-form" data-form="signin">
          <h2>${this.register ? 'Create an account' : 'Sign in'}</h2>
          <label>Account name<input name="name" autocomplete="username" maxlength="20" required></label>
          <label>Password<input name="password" type="password" autocomplete="${this.register ? 'new-password' : 'current-password'}" maxlength="200" required></label>
          ${this.register ? '<label>Confirm password<input name="password2" type="password" autocomplete="new-password" maxlength="200" required></label><p class="tt-hint">Account names: 3–20 letters, digits or _. Passwords: at least 8 characters.</p>' : ''}
          ${err}
          <nav class="tt-menu">
            <button type="submit" class="primary">${this.register ? 'Create Account' : 'Sign In'}</button>
            <button type="button" data-act="toggle-register">${this.register ? 'I Have an Account' : 'Create an Account'}</button>
            <button type="button" data-act="offline">Play Offline<small>Single-player, saved on this device</small></button>
            <button type="button" data-act="settings">Settings</button>
          </nav>
        </form>${realm}`,
      chars: () => `
        <p class="tt-account">Signed in as <b>${esc(this.net.account?.name ?? '')}</b></p>
        <nav class="tt-menu tt-chars">
          ${this.chars.map((c, i) => `
            <div class="tt-char">
              <button data-act="play" data-id="${c.id}" class="${i === 0 ? 'primary' : ''}">${esc(c.name)}
                <small>Level ${c.level}${c.online ? ' · in the world now' : ''}</small></button>
              <button class="tt-del" data-act="delete" data-id="${c.id}" title="Delete ${esc(c.name)}" aria-label="Delete ${esc(c.name)}">✕</button>
            </div>`).join('')}
          ${this.chars.length < MAX_CHARACTERS ? `<button data-act="create" class="${this.chars.length ? '' : 'primary'}">New Character</button>` : ''}
          <button data-act="settings">Settings</button>
          <button data-act="controls">Controls</button>
          <button data-act="signout">Sign Out</button>
          <button data-act="offline">Play Offline</button>
        </nav>
        ${err}${realm}`,
      create: () => `
        <form class="tt-form" data-form="create">
          <h2>New character</h2>
          <label>Name<input name="charname" maxlength="16" required autocomplete="off" spellcheck="false" value="${esc(this.draft.name)}"></label>
          <p class="tt-hint">3–16 letters, starting with a capital. Names are seen by everyone.</p>
          <div class="tt-looks">
            ${LOOK_KEYS.map((k) => `
              <div class="tt-look" data-k="${k}">
                <span>${LOOK_LABEL[k]}</span>
                <button type="button" data-act="look-prev" data-k="${k}" aria-label="Previous ${LOOK_LABEL[k]}">‹</button>
                <b>${lookValue(k, this.draft.look[k])}</b>
                <button type="button" data-act="look-next" data-k="${k}" aria-label="Next ${LOOK_LABEL[k]}">›</button>
              </div>`).join('')}
          </div>
          ${err}
          <nav class="tt-menu">
            <button type="submit" class="primary">Create &amp; Enter World</button>
            <button type="button" data-act="look-random">Randomise Look</button>
            <button type="button" data-act="back">Back <kbd>Esc</kbd></button>
          </nav>
        </form>`,
      delete: () => `
        <div class="tt-confirm">
          <h2>Delete ${esc(this.deleting?.name ?? '')}?</h2>
          <p>Their level ${this.deleting?.level ?? 1} progress, gear and quests are gone for good. The name becomes free for anyone.</p>
        </div>
        <nav class="tt-menu">
          <button data-act="confirm-delete" class="danger">Delete Character</button>
          <button data-act="cancel">Cancel <kbd>Esc</kbd></button>
        </nav>`,
      confirm: () => `
        <div class="tt-confirm">
          <h2>Start a new game?</h2>
          <p>Your level ${this.game.stats.level} character, their gear and their world will be replaced by a new one.</p>
        </div>
        <nav class="tt-menu">
          <button data-act="confirm-new" class="danger">Start New Game</button>
          <button data-act="cancel">Cancel <kbd>Esc</kbd></button>
        </nav>`,
      main: () => this.offlineHTML(),
    }[this.page] ?? (() => '');
    this.el.innerHTML = `<div class="tt-col">${logo}${html()}</div>`;
  }

  offlineHTML() {
    const g = this.game;
    const save = readSave();
    const p = g.player.position;
    const region = save ? g.world.regionAt(p.x, p.z) : null;
    const cont = save ? `
      <button data-act="continue" class="primary">Continue
        <small>Level ${g.stats.level} · ${esc(region?.name ?? 'Brightwater')} · ${g.stats.gold}g</small></button>` : '';
    return `
      <nav class="tt-menu">
        ${cont}
        <button data-act="new" class="${save ? '' : 'primary'}">New Game</button>
        ${this.net.online ? '<button data-act="online">Online Realm<small>Back to the shared world</small></button>' : ''}
        <button data-act="settings">Settings</button>
        <button data-act="controls">Controls</button>
      </nav>
      ${this.net.outdated ? '<p class="tt-error" role="alert">The realm\'s server is running older code than the game it serves — it was updated since it started. Restart the server to play online; offline play works meanwhile.</p>' : ''}
      <p class="tt-foot">${this.net.mode === 'probing' ? 'Looking for the realm…' : 'Progress saves automatically.'}</p>`;
  }
}
