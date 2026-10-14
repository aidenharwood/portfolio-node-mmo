// Equipped weapon slots (any class in any slot, Borderlands-style), armour slots, and a backpack
// that holds either kind of item.
import { itemFromRecipe, isArmor } from './items.js';
import { ARMOR_SLOT_IDS } from './armorTypes.js';

export const BACKPACK_SIZE = 20;

export class Inventory {
  constructor(size = 3) {
    this.slots = new Array(size).fill(null);
    this.armor = Object.fromEntries(ARMOR_SLOT_IDS.map((s) => [s, null]));
    this.backpack = new Array(BACKPACK_SIZE).fill(null);
    this.active = 0;
  }

  get current() { return this.slots[this.active]; }
  get backpackFree() { return this.backpack.filter((w) => !w).length; }
  get isFull() { return this.backpackFree === 0; }

  canAdd(item) {
    if (isArmor(item)) return !this.armor[item.slot] || this.backpackFree > 0;
    return this.slots.some((slot) => !slot) || this.backpackFree > 0;
  }

  // Pick-up rule: empty matching equipment slot first, then backpack. Returns where it went, or null if full.
  add(item) {
    if (isArmor(item)) {
      if (!this.armor[item.slot]) {
        this.armor[item.slot] = item;
        return 'equipped';
      }
      return this.stash(item) ? 'backpack' : null;
    }
    const empty = this.slots.indexOf(null);
    if (empty !== -1) {
      this.slots[empty] = item;
      if (!this.current) this.active = empty;
      return 'equipped';
    }
    return this.stash(item) ? 'backpack' : null;
  }

  stash(item) {
    const i = this.backpack.indexOf(null);
    if (i === -1) return false;
    this.backpack[i] = item;
    return true;
  }

  // Swap backpack[bi] into an equipment slot (weapon slot index, or the armour piece's own slot).
  equipFromBackpack(bi, slot) {
    const item = this.backpack[bi];
    if (!item) return;
    if (isArmor(item)) {
      this.backpack[bi] = this.armor[item.slot];
      this.armor[item.slot] = item;
      return;
    }
    this.backpack[bi] = this.slots[slot];
    this.slots[slot] = item;
    if (!this.current) this.active = slot;
  }

  unequip(slot) {
    const item = this.slots[slot];
    if (!item || !this.stash(item)) return false;
    this.slots[slot] = null;
    this.ensureActive();
    return true;
  }

  unequipArmor(slot) {
    const item = this.armor[slot];
    if (!item || !this.stash(item)) return false;
    this.armor[slot] = null;
    return true;
  }

  // Removes an item wherever it lives. Returns true if found.
  remove(item) {
    let i = this.slots.indexOf(item);
    if (i !== -1) {
      this.slots[i] = null;
      this.ensureActive();
      return true;
    }
    for (const s of ARMOR_SLOT_IDS) {
      if (this.armor[s] === item) {
        this.armor[s] = null;
        return true;
      }
    }
    i = this.backpack.indexOf(item);
    if (i !== -1) {
      this.backpack[i] = null;
      return true;
    }
    return false;
  }

  // ---- generic locations: { src: 'slot' | 'armor' | 'pack', i }
  at(loc) {
    if (loc.src === 'slot') return this.slots[loc.i];
    if (loc.src === 'armor') return this.armor[loc.i];
    return this.backpack[loc.i];
  }

  put(loc, item) {
    if (loc.src === 'slot') this.slots[loc.i] = item;
    else if (loc.src === 'armor') this.armor[loc.i] = item;
    else this.backpack[loc.i] = item;
  }

  // Can `item` live at `loc`? (weapons in weapon slots, armour in its own slot, anything packed)
  fits(item, loc) {
    if (!item) return true;
    if (loc.src === 'slot') return !isArmor(item);
    if (loc.src === 'armor') return isArmor(item) && item.slot === loc.i;
    return true;
  }

  // Drag-and-drop move: swaps with whatever is at `to` when both sides accept their new item.
  move(from, to) {
    if (from.src === to.src && String(from.i) === String(to.i)) return false;
    const a = this.at(from);
    const b = this.at(to);
    if (!a || !this.fits(a, to) || !this.fits(b, from)) return false;
    this.put(to, a);
    this.put(from, b);
    // The wielded weapon stays wielded wherever it's dragged.
    if (from.src === 'slot' && to.src === 'slot' && this.active === from.i) this.active = to.i;
    else if (from.src === 'slot' && to.src === 'slot' && this.active === to.i) this.active = from.i;
    this.ensureActive();
    return true;
  }

  ensureActive() {
    if (this.current) return;
    const i = this.slots.findIndex(Boolean);
    this.active = i === -1 ? 0 : i;
  }

  select(index) {
    if (!this.slots[index]) return false;
    this.active = index;
    return true;
  }

  toJSON() {
    return {
      active: this.active,
      slots: this.slots.map((w) => w?.recipe ?? null),
      armor: Object.fromEntries(ARMOR_SLOT_IDS.map((s) => [s, this.armor[s]?.recipe ?? null])),
      backpack: this.backpack.map((w) => w?.recipe ?? null),
    };
  }

  load(data) {
    // Recipes that no longer build (removed types, corrupt entries) are dropped, not fatal.
    const build = (r) => {
      if (!r) return null;
      try { return itemFromRecipe(r); } catch (err) { console.warn('Dropped unreadable item', r, err); return null; }
    };
    this.slots = (data.slots ?? []).map(build);
    while (this.slots.length < 3) this.slots.push(null);
    for (const s of ARMOR_SLOT_IDS) this.armor[s] = build(data.armor?.[s]);
    this.backpack = (data.backpack ?? []).map(build);
    while (this.backpack.length < BACKPACK_SIZE) this.backpack.push(null);
    // Repair misplaced items (older saves could end up with armour in a weapon slot): move each
    // to where it belongs — its own empty slot, else the backpack, else drop it into the pack's
    // overflow so nothing is lost.
    const misplaced = [];
    this.slots.forEach((it, i) => { if (it && isArmor(it)) { misplaced.push(it); this.slots[i] = null; } });
    for (const s of ARMOR_SLOT_IDS) {
      const it = this.armor[s];
      if (it && (!isArmor(it) || it.slot !== s)) { misplaced.push(it); this.armor[s] = null; }
    }
    for (const it of misplaced) {
      if (isArmor(it) && !this.armor[it.slot]) this.armor[it.slot] = it;
      else if (!isArmor(it) && this.slots.indexOf(null) !== -1) this.slots[this.slots.indexOf(null)] = it;
      else if (!this.stash(it)) this.backpack.push(it);
    }
    this.active = data.active ?? 0;
    this.ensureActive();
  }
}
