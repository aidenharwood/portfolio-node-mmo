// Inventory: the game menu's Inventory tab (ui/GameMenu.js), and the trader's shop when opened in
// 'shop' mode. Left: weapons, armour, backpack, trader stock and the drop zone. Right: item card +
// actions. (The character sheet lives on the Character tab.) A trader shows what their stock
// covers (game.trading): everything, or a gunsmith's weapons and an armourer's armour, with the
// fine stock only they carry.
import { RARITY } from '../items/rarity.js';
import { itemValue, isArmor } from '../items/items.js';
import { ARMOR_SLOTS, ARMOR_SLOT_IDS } from '../items/armorTypes.js';
import { itemCardHTML, esc } from './cards.js';

const isStock = (src) => src === 'shop' || src === 'fine';

export class InventoryUI {
  constructor(game, el) {
    this.game = game;
    this.el = el;
    this.mode = 'inventory';
    this.sel = null; // { src: 'slot' | 'armor' | 'pack' | 'shop', i }
    this.drag = null;
    // Hover card: the full item description next to the cursor.
    this.tip = document.createElement('div');
    this.tip.className = 'inv-tip hidden';
    document.body.appendChild(this.tip);
    this.tipTile = null;
    el.addEventListener('click', (e) => this.onClick(e));
    el.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    // Tile images must never start the browser's own drag: it cancels the pointer stream and
    // strands the drag ghost on screen.
    el.addEventListener('dragstart', (e) => e.preventDefault());
    el.addEventListener('pointerleave', () => this.hideTip());
    window.addEventListener('pointermove', (e) => this.onPointerMove(e));
    window.addEventListener('pointerup', (e) => this.onPointerUp(e));
    window.addEventListener('pointercancel', () => this.cancelDrag());
    window.addEventListener('blur', () => this.cancelDrag());
  }

  // ---------------------------------------------------------------- drag & drop
  // Drag any item onto a slot: swaps when both sides fit, highlights where it can go. The drop zone
  // puts it on the ground; at the trader, drag stock in to buy and items onto the stock to sell.
  // Let go anywhere else and nothing happens.
  locOf(el) {
    const src = el.dataset.src;
    return { src, i: src === 'armor' ? el.dataset.i : Number(el.dataset.i) };
  }

  itemAt(loc) {
    if (loc.src === 'shop') return this.game.shop.stock[loc.i] ?? null;
    if (loc.src === 'fine') return this.game.shop.fine?.[loc.i] ?? null;
    return this.game.player.inventory.at(loc);
  }

  onPointerDown(e) {
    if (e.button !== 0) return;
    const t = e.target.closest('.tile[data-src]');
    if (!t || t.classList.contains('empty')) return;
    e.preventDefault(); // no text selection or native drag; the click still selects
    this.cancelDrag();
    this.drag = { from: this.locOf(t), x: e.clientX, y: e.clientY, started: false, source: t };
  }

  // Abandons a drag in progress (pointer cancelled, window lost focus, inventory closed).
  cancelDrag() {
    const d = this.drag;
    this.drag = null;
    if (!d?.started) return;
    d.ghost.remove();
    this.render();
  }

  onPointerMove(e) {
    const d = this.drag;
    if (!d) { if (this.isOpen) this.updateTip(e); return; }
    if (!d.started) {
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6) return;
      d.started = true;
      d.item = this.itemAt(d.from);
      this.hideTip();
      d.ghost = document.createElement('img');
      d.ghost.className = 'drag-ghost';
      d.ghost.src = this.game.thumbs.get(d.item);
      document.body.appendChild(d.ghost);
      d.source.classList.add('dragging');
      this.markTargets(d);
    }
    d.ghost.style.left = `${e.clientX}px`;
    d.ghost.style.top = `${e.clientY}px`;
    const over = document.elementFromPoint(e.clientX, e.clientY);
    const tile = over?.closest('.tile[data-src], .inv-drop');
    if (d.hover && d.hover !== tile) d.hover.classList.remove('drop-hover');
    d.hover = tile && tile.classList.contains('drop-ok') ? tile : null;
    d.hover?.classList.add('drop-hover');
  }

  // Valid targets glow: the item fits there and whatever is there fits back where it came from.
  markTargets(d) {
    const inv = this.game.player.inventory;
    for (const t of this.el.querySelectorAll('.tile[data-src]')) {
      const loc = this.locOf(t);
      let ok;
      if (isStock(d.from.src)) ok = loc.src === 'pack' && !inv.at(loc);
      else if (isStock(loc.src)) ok = true;
      else ok = inv.fits(d.item, loc) && inv.fits(inv.at(loc), d.from);
      t.classList.toggle('drop-ok', ok && t !== d.source);
    }
    this.el.querySelector('.inv-drop')?.classList.toggle('drop-ok', !isStock(d.from.src));
  }

  onPointerUp(e) {
    const d = this.drag;
    this.drag = null;
    if (!d?.started) return;
    d.ghost.remove();
    // Swallow the click this release produces (if any), but never a later one.
    this.suppressClick = true;
    setTimeout(() => { this.suppressClick = false; }, 0);
    // Every change goes through the character's rules (rpg/CharacterCore.js via game.charLink).
    const g = this.game;
    const link = g.charLink;
    const over = document.elementFromPoint(e.clientX, e.clientY);
    const tile = over?.closest('.tile[data-src]');
    const toGround = !!over?.closest('.inv-drop');
    if (tile && tile.classList.contains('drop-ok')) {
      const to = this.locOf(tile);
      if (isStock(d.from.src)) {
        if (!link.do({ op: 'buy', i: d.from.i, to: to.i, ...(d.from.src === 'fine' ? { fine: true } : {}) })) g.hud.toast('Not enough gold');
      } else if (isStock(to.src)) link.do({ op: 'sell', loc: d.from });
      else if (link.do({ op: 'move', from: d.from, to })) this.sel = to;
    } else if (toGround && !isStock(d.from.src)) link.do({ op: 'drop', loc: d.from });
    this.render();
  }

  get isOpen() { return !this.el.classList.contains('hidden'); }

  open(mode = 'inventory') {
    this.mode = mode;
    this.sel = null;
    this.el.classList.remove('hidden');
    this.render();
  }

  close() {
    this.cancelDrag();
    this.hideTip();
    this.el.classList.add('hidden');
  }

  // ---------------------------------------------------------------- hover card
  updateTip(e) {
    const t = e.target?.closest?.('.tile[data-src]');
    const tile = t && !t.classList.contains('empty') && this.el.contains(t) ? t : null;
    if (!tile) { this.hideTip(); return; }
    if (tile !== this.tipTile) {
      const loc = this.locOf(tile);
      const item = this.itemAt(loc);
      if (!item) { this.hideTip(); return; }
      this.tipTile = tile;
      const price = isStock(loc.src) ? `<div class="lc-prompt">Price ${itemValue(item) * 3}g</div>` : '';
      this.tip.innerHTML = itemCardHTML(item, { compare: this.compareFor(item, loc.src), thumb: this.game.thumbs.get(item), footer: price, sets: this.game.stats.gearSets });
      this.tip.classList.remove('hidden');
    }
    // Beside the cursor, flipped and clamped to stay on screen.
    const w = this.tip.offsetWidth;
    const h = this.tip.offsetHeight;
    let x = e.clientX + 22;
    if (x + w > window.innerWidth - 8) x = e.clientX - 22 - w;
    const y = Math.max(8, Math.min(window.innerHeight - h - 8, e.clientY - 40));
    this.tip.style.left = `${Math.max(8, x)}px`;
    this.tip.style.top = `${y}px`;
  }

  hideTip() {
    this.tipTile = null;
    this.tip.classList.add('hidden');
  }

  selected() {
    if (!this.sel) return null;
    const inv = this.game.player.inventory;
    const { src, i } = this.sel;
    if (src === 'slot') return inv.slots[i];
    if (src === 'armor') return inv.armor[i];
    if (src === 'pack') return inv.backpack[i];
    if (src === 'fine') return this.game.shop.fine?.[i] ?? null;
    return this.game.shop.stock[i] ?? null;
  }

  tile(item, src, i, label = '') {
    if (!item) return `<button class="tile empty" data-action="select" data-src="${src}" data-i="${i}">${label}</button>`;
    const sel = this.sel?.src === src && String(this.sel.i) === String(i) ? 'sel' : '';
    const active = src === 'slot' && i === this.game.player.inventory.active ? 'active' : '';
    return `<button class="tile ${sel} ${active}" style="--rc:${RARITY[item.rarity].css}" data-action="select" data-src="${src}" data-i="${i}" aria-label="${esc(item.name)}">
      <img src="${this.game.thumbs.get(item)}" alt="" draggable="false"><span class="lvl">${item.level}</span>${label ? `<span class="slotno">${label}</span>` : ''}</button>`;
  }

  // What an item would replace (shown as ▲/▼ on its card); nothing for gear already worn.
  compareFor(item, src = this.sel?.src) {
    const inv = this.game.player.inventory;
    if (!item || src === 'slot' || src === 'armor') return null;
    if (isArmor(item)) return inv.armor[item.slot];
    return inv.current?.cls === item.cls ? inv.current : inv.slots.find((x) => x?.cls === item.cls);
  }

  render() {
    this.hideTip();
    const g = this.game;
    const s = g.stats;
    const inv = g.player.inventory;
    const shop = this.mode === 'shop';
    const item = this.selected();
    const T = g.trading ?? { name: 'Tobbin', stock: 'all' };
    const sells = (x) => T.stock === 'all' || (isArmor(x) ? 'armor' : 'weapons') === T.stock;
    const stockTiles = (list, src) => list.map((x, i) => (sells(x) ? this.tile(x, src, i) : '')).join('');

    let actions = '';
    if (item) {
      const value = itemValue(item);
      const sell = shop ? `<button data-action="sell">Sell +${value}g</button>` : `<button data-action="scrap">Scrap +${Math.ceil(value * 0.5)}g</button>`;
      const { src } = this.sel;
      if (src === 'pack') {
        const equip = isArmor(item)
          ? `<button data-action="equip">Equip ${ARMOR_SLOTS[item.slot].label}</button>`
          : [0, 1, 2].map((k) => `<button data-action="equip" data-slot="${k}">Equip → ${k + 1}</button>`).join('');
        actions = `<div class="row">${equip}</div><div class="row"><button data-action="drop">Drop</button>${sell}</div>`;
      } else if (src === 'slot' || src === 'armor') {
        const wield = src === 'slot' && this.sel.i !== inv.active ? '<button data-action="activate">Wield</button>' : '';
        actions = `<div class="row">${wield}<button data-action="unequip" ${inv.backpackFree ? '' : 'disabled'}>Unequip</button></div>
          <div class="row"><button data-action="drop">Drop</button>${sell}</div>`;
      } else {
        const price = value * 3;
        actions = `<div class="row"><button data-action="buy" ${s.gold >= price && inv.backpackFree ? '' : 'disabled'}>Buy −${price}g</button></div>`;
      }
    }

    this.el.innerHTML = `
      <div class="inv-panel">
        <div class="inv-body">
          <section class="inv-gear">
            <div class="gear-row">
              <div><h3>Weapons</h3><div class="tiles equip">${inv.slots.map((x, i) => this.tile(x, 'slot', i, String(i + 1))).join('')}</div></div>
              <div><h3>Armour</h3><div class="tiles equip">${ARMOR_SLOT_IDS.map((sl) => this.tile(inv.armor[sl], 'armor', sl, ARMOR_SLOTS[sl].label)).join('')}</div></div>
            </div>
            <h3>Backpack <small>${inv.backpack.filter(Boolean).length}/${inv.backpack.length}</small></h3>
            <div class="tiles pack">${inv.backpack.map((x, i) => this.tile(x, 'pack', i)).join('')}</div>
            ${shop ? `<h3>${esc(T.name)}'s wares <small>${s.gold}g to spend</small></h3><div class="tiles pack">${stockTiles(g.shop.stock, 'shop')}</div>` : ''}
            ${shop && T.stock !== 'all' ? `<h3>Fine stock <small>rare or better, a level ahead</small></h3><div class="tiles pack">${stockTiles(g.shop.fine ?? [], 'fine')}</div>` : ''}
            <div class="inv-drop">Drop here to leave it on the ground</div>
            <p class="hint">Hover an item for its details. Drag items between slots to equip or swap them${shop ? ', stock into your backpack to buy, and your items onto the stock to sell' : ''}.</p>
          </section>
          <section class="inv-detail">
            ${item ? itemCardHTML(item, { compare: this.compareFor(item), thumb: g.thumbs.get(item), sets: g.stats.gearSets }) + `<div class="actions">${actions}</div>` : '<p class="hint">Select an item.</p>'}
          </section>
        </div>
      </div>`;
  }

  onClick(e) {
    if (this.suppressClick) { this.suppressClick = false; return; }
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const g = this.game;
    const link = g.charLink;
    const item = this.selected();
    const action = btn.dataset.action;

    switch (action) {
      case 'close': g.closeMenus(); return;
      case 'select': {
        const src = btn.dataset.src;
        const i = src === 'armor' ? btn.dataset.i : Number(btn.dataset.i);
        this.sel = this.sel?.src === src && this.sel.i === i ? null : { src, i };
        break;
      }
      case 'equip':
        if (isArmor(item)) {
          if (link.do({ op: 'equip', bi: this.sel.i })) this.sel = { src: 'armor', i: item.slot };
        } else if (link.do({ op: 'equip', bi: this.sel.i, slot: Number(btn.dataset.slot) })) this.sel = { src: 'slot', i: Number(btn.dataset.slot) };
        break;
      case 'activate':
        g.player.equip(this.sel.i);
        break;
      case 'unequip':
        if (link.do({ op: 'unequip', loc: this.sel })) this.sel = null;
        break;
      case 'drop':
        link.do({ op: 'drop', loc: this.sel });
        this.sel = null;
        break;
      case 'scrap':
      case 'sell':
        if (link.do({ op: action, loc: this.sel })) this.sel = null;
        break;
      case 'buy':
        if (link.do({ op: 'buy', i: this.sel.i, ...(this.sel.src === 'fine' ? { fine: true } : {}) })) this.sel = null;
        else g.hud.toast('Not enough gold, or no room');
        break;
    }
    this.render();
  }
}
