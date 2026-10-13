// Character progression: level (up to the cap), XP, gold, talents and the abilities on hand.
//   talents   talent id → rank (rpg/talents.js): one point a level from level 2, spent in three
//             trees — class damage, toughness, mobility, mana — and the abilities they unlock
//   slots     the three abilities on X, G and T (combat/abilities.js)
// Gear (armour pieces and their sets) and talents both add to the same stats; health also grows
// with level by itself. Enemies are tuned against all of this (rpg/balance.js).
import { GEAR_SETS } from '../items/sets.js';
import { GROWTH, scale } from './balance.js';
import { MAX_LEVEL, TALENTS, talentEffects, talentPoints, spentTotal, canLearn } from './talents.js';

const HEALTH = 110;  // base health at level 1 (growing with GROWTH.health)
export const SLOTS = 3;
// Saves from before version 3 spent attribute points; talents replaced them (a fresh start).
const VERSION = 3;

export class Stats {
  constructor() {
    this.level = 1;
    this.xp = 0;
    this.gold = 0;
    this.kills = 0;
    this.talents = {};
    this.slots = Array(SLOTS).fill(null);
    this.gear = {};
    this.gearPerks = new Set();
    this.gearSets = {};
    this.talent = talentEffects({});   // what the talents add up to: stats, perks, abilities, upgrades
    this.perks = new Set();            // gear's and talents' together (the Player checks these)
  }

  // Sums stats and perks from equipped armour, then the bonuses of every set worn deep enough
  // (items/sets.js). gearSets counts the pieces worn of each set.
  setGear(items) {
    const g = {};
    const perks = new Set();
    const sets = {};
    for (const it of items) {
      if (!it) continue;
      for (const [k, v] of Object.entries(it.stats)) g[k] = (g[k] ?? 0) + v;
      for (const p of it.perks) perks.add(p);
      if (it.set) sets[it.set] = (sets[it.set] ?? 0) + 1;
    }
    for (const [id, n] of Object.entries(sets)) {
      for (const b of GEAR_SETS[id]?.bonuses ?? []) {
        if (n < b.n) continue;
        for (const [k, v] of Object.entries(b.stats ?? {})) g[k] = (g[k] ?? 0) + v;
        for (const p of b.perks ?? []) perks.add(p);
      }
    }
    this.gear = g;
    this.gearPerks = perks;
    this.gearSets = sets;
    this.perks = new Set([...perks, ...this.talent.perks]);
  }

  // After the talents change: what they add up to, and the perks with the gear's.
  refreshTalents() {
    this.talent = talentEffects(this.talents);
    this.perks = new Set([...this.gearPerks, ...this.talent.perks]);
  }

  // A stat from gear and talents together.
  bonus(k) { return (this.gear[k] ?? 0) + (this.talent.stats[k] ?? 0); }

  get points() { return Math.max(0, talentPoints(this.level) - spentTotal(this.talents)); }
  get maxed() { return this.level >= MAX_LEVEL; }
  get armor() { return (this.gear.armor ?? 0) * (1 + this.bonus('armorPct')); }
  // Bonus damage for hits of an element (set bonuses), and the share of spells' mana cost waived.
  elementDamage(element) { return this.gear[`${element}Damage`] ?? 0; }
  get manaDiscount() { return Math.min(0.6, this.bonus('manaDiscount')); }
  get moveSpeed() { return this.bonus('moveSpeed'); }
  get manaRegen() { return this.bonus('manaRegen'); }
  get staminaRegen() { return this.bonus('staminaRegen'); }
  get critBonus() { return this.bonus('critBonus'); }
  get critDamage() { return this.bonus('critDamage'); }
  get damageTaken() { return Math.min(0.5, this.bonus('damageTaken')); }
  resist(element) {
    const key = { fire: 'resistFire', shock: 'resistShock', frost: 'resistFrost', corrosive: 'resistCorrosive' }[element];
    return key ? Math.min(0.75, this.gear[key] ?? 0) : 0;
  }

  xpToNext() { return Math.round(60 * Math.pow(this.level, 1.6)); }

  get maxHp() {
    return Math.round(HEALTH * scale(GROWTH.health, this.level) * (1 + this.bonus('healthPct')) + (this.gear.hp ?? 0));
  }
  get maxMana() { return Math.round(90 + this.level * 2 + this.bonus('mana')); }

  // Damage with weapons of a class: talents and gear (affixes and set bonuses) each multiply it.
  damageMult(cls = 'melee') {
    return (1 + (this.talent.stats[`${cls}Damage`] ?? 0)) * (1 + (this.gear[`${cls}Damage`] ?? 0));
  }

  // Returns number of levels gained (none past the cap, where XP stops counting).
  addXp(amount) {
    if (this.level >= MAX_LEVEL) { this.xp = 0; return 0; }
    this.xp += amount;
    let gained = 0;
    while (this.level < MAX_LEVEL && this.xp >= this.xpToNext()) {
      this.xp -= this.xpToNext();
      this.level++;
      gained++;
    }
    if (this.level >= MAX_LEVEL) this.xp = 0;
    return gained;
  }

  // One more rank of a talent; a newly unlocked ability goes in the first empty slot.
  learn(id) {
    if (canLearn(this.talents, id, this.level)) return false;
    this.talents[id] = (this.talents[id] ?? 0) + 1;
    this.refreshTalents();
    const ability = TALENTS[id].ability;
    if (ability && !this.slots.includes(ability)) {
      const i = this.slots.indexOf(null);
      if (i !== -1) this.slots[i] = ability;
    }
    return true;
  }

  // Every point back, every slot empty.
  respec() {
    this.talents = {};
    this.slots = Array(SLOTS).fill(null);
    this.refreshTalents();
  }

  // Puts an unlocked ability in slot `i` (null clears it); it leaves any other slot it was in.
  slot(i, ability) {
    if (!Number.isInteger(i) || i < 0 || i >= SLOTS) return false;
    if (ability !== null && !this.talent.abilities.includes(ability)) return false;
    if (ability !== null) this.slots = this.slots.map((s) => (s === ability ? null : s));
    this.slots[i] = ability;
    return true;
  }

  toJSON() {
    return { v: VERSION, level: this.level, xp: this.xp, gold: this.gold, kills: this.kills, talents: { ...this.talents }, slots: [...this.slots] };
  }

  // Ranks are checked as they're loaded (in an order that respects the tiers), so a save can only
  // hold what could have been learned; slots only abilities that are unlocked.
  load(d) {
    Object.assign(this, { level: Math.min(MAX_LEVEL, d.level), xp: d.xp, gold: d.gold, kills: d.kills ?? 0 });
    this.talents = {};
    if ((d.v ?? 1) >= 3 && d.talents && typeof d.talents === 'object') {
      const want = Object.entries(d.talents).filter(([id, r]) => TALENTS[id] && Number.isInteger(r) && r > 0);
      want.sort((a, b) => TALENTS[a[0]].tier - TALENTS[b[0]].tier || (TALENTS[a[0]].upgrade ? 1 : 0) - (TALENTS[b[0]].upgrade ? 1 : 0));
      for (let pass = 0; pass < 5; pass++) {
        for (const [id, r] of want) while ((this.talents[id] ?? 0) < r && !canLearn(this.talents, id, this.level)) this.talents[id] = (this.talents[id] ?? 0) + 1;
      }
    }
    this.refreshTalents();
    this.slots = Array(SLOTS).fill(null);
    if (Array.isArray(d.slots)) d.slots.slice(0, SLOTS).forEach((a, i) => { if (a && this.talent.abilities.includes(a) && !this.slots.includes(a)) this.slots[i] = a; });
  }
}
