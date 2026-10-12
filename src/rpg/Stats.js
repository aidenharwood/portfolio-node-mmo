// Character progression: level, XP, gold and four attributes that players invest in on level-up.
//   Might    → melee damage, max HP
//   Finesse  → ranged damage, crit chance
//   Arcana   → magic damage, max mana
//   Vitality → max HP
export const ATTRIBUTES = {
  might: { name: 'Might', desc: '+5% melee damage, +3 max HP' },
  finesse: { name: 'Finesse', desc: '+5% ranged damage, +0.5% crit chance' },
  arcana: { name: 'Arcana', desc: '+5% magic damage, +8 max mana' },
  vitality: { name: 'Vitality', desc: '+10 max HP' },
};
const CLASS_ATTR = { melee: 'might', ranged: 'finesse', magic: 'arcana' };
const BASE = 5;
export const POINTS_PER_LEVEL = 3;

export class Stats {
  constructor() {
    this.level = 1;
    this.xp = 0;
    this.gold = 0;
    this.points = 0;
    this.kills = 0;
    this.attr = { might: BASE, finesse: BASE, arcana: BASE, vitality: BASE };
    this.gear = {};
    this.gearPerks = new Set();
  }

  // Sums stats and perks from equipped armour.
  setGear(items) {
    const g = {};
    const perks = new Set();
    for (const it of items) {
      if (!it) continue;
      for (const [k, v] of Object.entries(it.stats)) g[k] = (g[k] ?? 0) + v;
      for (const p of it.perks) perks.add(p);
    }
    this.gear = g;
    this.gearPerks = perks;
  }

  total(attr) { return this.attr[attr] + (this.gear[attr] ?? 0); }
  get armor() { return this.gear.armor ?? 0; }
  get moveSpeed() { return this.gear.moveSpeed ?? 0; }
  get manaRegen() { return this.gear.manaRegen ?? 0; }
  get staminaRegen() { return this.gear.staminaRegen ?? 0; }
  resist(element) {
    const key = { fire: 'resistFire', shock: 'resistShock', frost: 'resistFrost', corrosive: 'resistCorrosive' }[element];
    return key ? Math.min(0.75, this.gear[key] ?? 0) : 0;
  }

  xpToNext() { return Math.round(60 * Math.pow(this.level, 1.6)); }

  get maxHp() { return Math.round(50 + this.total('vitality') * 10 + (this.total('might') - BASE) * 3 + this.level * 8 + (this.gear.hp ?? 0)); }
  get maxMana() { return 50 + this.total('arcana') * 8 + this.level * 2; }
  get critBonus() { return (this.total('finesse') - BASE) * 0.005 + (this.gear.critBonus ?? 0); }

  damageMult(cls = 'melee') {
    const a = this.total(CLASS_ATTR[cls] ?? 'might');
    return (1 + (a - BASE) * 0.05) * (1 + (this.level - 1) * 0.03);
  }

  // Returns number of levels gained.
  addXp(amount) {
    this.xp += amount;
    let gained = 0;
    while (this.xp >= this.xpToNext()) {
      this.xp -= this.xpToNext();
      this.level++;
      this.points += POINTS_PER_LEVEL;
      gained++;
    }
    return gained;
  }

  spend(attr) {
    if (this.points <= 0 || !(attr in this.attr)) return false;
    this.attr[attr]++;
    this.points--;
    return true;
  }

  toJSON() {
    return { level: this.level, xp: this.xp, gold: this.gold, points: this.points, kills: this.kills, attr: this.attr };
  }

  load(d) {
    Object.assign(this, { level: d.level, xp: d.xp, gold: d.gold, points: d.points, kills: d.kills ?? 0 });
    this.attr = { ...this.attr, ...d.attr };
  }
}
