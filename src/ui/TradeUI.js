// The trade window (server/trade.js decides everything; this shows it and sends what you do).
// Your backpack below: click an item to put it in your offer or take it back out; set the gold.
// Any change unlocks both offers. Lock, and when both sides are locked, confirm; the swap happens
// on the server when both have confirmed. A request from someone else waits at the top of the
// screen: Y accepts, N declines (or click).
import { itemFromRecipe } from '../items/items.js';
import { RARITY } from '../items/rarity.js';
import { itemCardHTML, esc } from './cards.js';

const build = (r) => { try { return itemFromRecipe(r); } catch { return null; } };

export class TradeUI {
  constructor(game) {
    this.game = game;
    this.state = null;
    this.request = null;   // { from, t }
    this.el = document.createElement('div');
    this.el.id = 'trade';
    this.el.className = 'hidden';
    document.body.appendChild(this.el);
    this.prompt = document.createElement('div');
    this.prompt.id = 'trade-req';
    this.prompt.className = 'hidden';
    document.body.appendChild(this.prompt);
    this.tip = document.createElement('div');
    this.tip.className = 'inv-tip hidden';
    document.body.appendChild(this.tip);
    this.el.addEventListener('click', (e) => this.onClick(e));
    this.el.addEventListener('change', (e) => { if (e.target.name === 'gold') this.sendOffer(); });
    this.el.addEventListener('keydown', (e) => { if (e.code !== 'Escape') e.stopPropagation(); });
    this.el.addEventListener('pointermove', (e) => this.hover(e));
    this.el.addEventListener('pointerleave', () => this.tip.classList.add('hidden'));
    this.prompt.addEventListener('click', (e) => {
      const b = e.target.closest('[data-answer]');
      if (b) this.respond(b.dataset.answer === 'yes');
    });
  }

  get isOpen() { return !!this.state; }
  send(act, extra = {}) { this.game.net.send({ t: 'trade', act, ...extra }); }

  // ---------------------------------------------------------------- requests
  requested(from) {
    this.request = { from, t: 30 };
    this.prompt.innerHTML = `<b>${esc(from)}</b> wants to trade <span><button data-answer="yes">Accept <kbd>Y</kbd></button><button data-answer="no">Decline <kbd>N</kbd></button></span>`;
    this.prompt.classList.remove('hidden');
    this.game.chat.add({ ch: 'system', text: `${from} wants to trade — Y to accept, N to decline.` });
  }

  respond(yes) {
    if (!this.request) return;
    this.send(yes ? 'accept' : 'decline');
    this.request = null;
    this.prompt.classList.add('hidden');
  }

  // ---------------------------------------------------------------- the window
  set(state, reason) {
    const g = this.game;
    const was = this.isOpen;
    this.state = state;
    if (!state) {
      this.el.classList.add('hidden');
      this.tip.classList.add('hidden');
      if (reason) g.hud.toast(reason);
      if (was && g.state === 'menu' && !g.menu.isOpen) g.closeMenus();
      return;
    }
    if (!was) g.openMenu(() => {});
    this.el.classList.remove('hidden');
    this.render();
  }

  myItems() { return this.state?.mine.items.map((x) => x.i) ?? []; }

  sendOffer(items = this.myItems()) {
    const gold = Math.max(0, Math.floor(Number(this.el.querySelector('[name="gold"]')?.value) || 0));
    this.send('offer', { items, gold });
  }

  tile(item, attrs) {
    if (!item) return `<div class="tile empty"></div>`;
    return `<button class="tile" style="--rc:${RARITY[item.rarity].css}" ${attrs}><img src="${this.game.thumbs.get(item)}" alt="" draggable="false"><span class="lvl">${item.level}</span></button>`;
  }

  render() {
    const s = this.state;
    const g = this.game;
    const pack = g.player.inventory.backpack;
    const offered = new Set(this.myItems());
    const mine = s.mine.items.map(({ i }) => this.tile(pack[i], `data-act="take" data-i="${i}" data-pack="${i}"`)).join('');
    const theirs = s.theirs.items.map(({ recipe }, k) => this.tile(build(recipe), `data-theirs="${k}"`)).join('');
    const bothLocked = s.mine.locked && s.theirs.locked;
    const badge = (o) => (o.confirmed ? '<em class="tr-ok">Confirmed</em>' : o.locked ? '<em class="tr-lock">Locked</em>' : '<em>Choosing…</em>');
    this.el.innerHTML = `
      <div class="tr-panel">
        <header><h2>Trade <small>with ${esc(s.with)}</small></h2><button class="gm-btn" data-act="cancel">Cancel <kbd>Esc</kbd></button></header>
        <div class="tr-cols">
          <section class="tr-side"><h3>Your offer ${badge(s.mine)}</h3>
            <div class="tiles tr-offer">${mine || '<p class="hint">Click items in your backpack to offer them.</p>'}</div>
            <label class="tr-gold">Gold <input name="gold" type="number" min="0" max="${g.stats.gold}" value="${s.mine.gold}"> <small>of ${g.stats.gold}g</small></label>
          </section>
          <section class="tr-side"><h3>${esc(s.with)}'s offer ${badge(s.theirs)}</h3>
            <div class="tiles tr-offer">${theirs || '<p class="hint">Nothing yet.</p>'}</div>
            <p class="tr-gold">Gold <b>${s.theirs.gold}g</b></p>
          </section>
        </div>
        <h3>Your backpack</h3>
        <div class="tiles tr-pack">${pack.map((it, i) => (it && !offered.has(i) ? this.tile(it, `data-act="give" data-i="${i}" data-pack="${i}"`) : '<div class="tile empty"></div>')).join('')}</div>
        <footer>
          <p class="hint">Any change unlocks both offers. When both are locked, both confirm, and the swap happens.</p>
          <button class="gm-btn" data-act="lock" ${s.mine.locked ? 'disabled' : ''}>Lock Offer</button>
          <button class="gm-btn tr-confirm" data-act="confirm" ${bothLocked && !s.mine.confirmed ? '' : 'disabled'}>Confirm Trade</button>
        </footer>
      </div>`;
  }

  onClick(e) {
    const b = e.target.closest('[data-act]');
    if (!b || !this.state) return;
    const i = Number(b.dataset.i);
    switch (b.dataset.act) {
      case 'give': this.sendOffer([...this.myItems(), i]); break;
      case 'take': this.sendOffer(this.myItems().filter((x) => x !== i)); break;
      case 'lock': this.send('lock'); break;
      case 'confirm': this.send('confirm'); break;
      case 'cancel': this.send('cancel'); break;
    }
  }

  hover(e) {
    const t = e.target.closest('[data-pack], [data-theirs]');
    const item = !t ? null : t.dataset.pack !== undefined ? this.game.player.inventory.backpack[Number(t.dataset.pack)] : build(this.state?.theirs.items[Number(t.dataset.theirs)]?.recipe);
    if (!item) { this.tip.classList.add('hidden'); return; }
    if (this.tip.dataset.key !== t.outerHTML) {
      this.tip.dataset.key = t.outerHTML;
      this.tip.innerHTML = itemCardHTML(item, { thumb: this.game.thumbs.get(item) });
    }
    this.tip.classList.remove('hidden');
    const w = this.tip.offsetWidth;
    const h = this.tip.offsetHeight;
    let x = e.clientX + 22;
    if (x + w > window.innerWidth - 8) x = e.clientX - 22 - w;
    this.tip.style.left = `${Math.max(8, x)}px`;
    this.tip.style.top = `${Math.max(8, Math.min(window.innerHeight - h - 8, e.clientY - 40))}px`;
  }

  update(dt) {
    if (this.request && (this.request.t -= dt) <= 0) {
      this.request = null;
      this.prompt.classList.add('hidden');
    }
  }

  clear() {
    this.state = null;
    this.request = null;
    this.el.classList.add('hidden');
    this.prompt.classList.add('hidden');
    this.tip.classList.add('hidden');
  }
}
