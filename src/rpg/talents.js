// Talents: what a character becomes. One point a level from level 2 (29 at the cap), spent in
// three trees, each tied to a weapon class and a role. A tree's tiers open as points go into it
// (TIERS: 0, 3, 6, 10 and 15 spent there); each tier has bonuses of up to three ranks, an ability
// to unlock (combat/abilities.js) or upgrade, and the last a capstone. A tree takes 24 points to
// fill, so a character fills one and dips into another. A full tree is about +60% to its class.
//   stats    per rank, as gear stats (rpg/Stats.js adds them up): class damage, armour, health…
//   perks    armour or set perks the capstone grants (the Player checks them)
//   ability  the ability this node unlocks · upgrade: [ability, key] the upgrade it gives
export const MAX_LEVEL = 30;
export const TIERS = [0, 3, 6, 10, 15];

export const TREES = {
  vanguard: { name: 'Vanguard', cls: 'melee', role: 'Melee and toughness', color: '#ff8a3a', blurb: 'Hold the line and break theirs: heavier blows, thicker plate, and the abilities to wade in and come out standing.' },
  gunslinger: { name: 'Gunslinger', cls: 'ranged', role: 'Guns and mobility', color: '#5ad1ff', blurb: 'Never where they expect you: sharper shooting, faster feet, tricks to pull the fight your way.' },
  technomancer: { name: 'Technomancer', cls: 'magic', role: 'Magic, tech and support', color: '#c48aff', blurb: 'Bend the field: stronger spells, deeper reserves, and machines and wards that keep a party alive.' },
};
export const TREE_IDS = Object.keys(TREES);

const pc = (v) => `${Math.round(v * 100)}%`;

export const TALENTS = {
  // ======================================================== Vanguard
  v_edge: { tree: 'vanguard', tier: 0, ranks: 3, name: 'Honed Edge', stats: { meleeDamage: 0.07 }, desc: (r) => `+${pc(0.07 * r)} melee damage` },
  v_plate: { tree: 'vanguard', tier: 0, ranks: 3, name: 'Plated', stats: { armorPct: 0.05 }, desc: (r) => `+${pc(0.05 * r)} armour` },
  v_slam: { tree: 'vanguard', tier: 0, ability: 'slam' },
  v_brawn: { tree: 'vanguard', tier: 1, ranks: 3, name: 'Brawn', stats: { healthPct: 0.04 }, desc: (r) => `+${pc(0.04 * r)} max health` },
  v_bulwark: { tree: 'vanguard', tier: 1, ability: 'bulwark' },
  v_aftershock: { tree: 'vanguard', tier: 1, upgrade: ['slam', 'aftershock'], name: 'Aftershock', desc: () => 'Seismic Slam reaches 30% further and leaves survivors slowed.' },
  v_butcher: { tree: 'vanguard', tier: 2, ranks: 3, name: 'Butcher', stats: { meleeDamage: 0.07 }, desc: (r) => `+${pc(0.07 * r)} melee damage` },
  v_leap: { tree: 'vanguard', tier: 2, ability: 'leap' },
  v_mirror: { tree: 'vanguard', tier: 2, upgrade: ['bulwark', 'mirror'], name: 'Mirror Field', desc: () => 'Bulwark lasts half as long again, and shots it stops fly back at whoever fired them.' },
  v_iron: { tree: 'vanguard', tier: 3, ranks: 3, name: 'Iron Hide', stats: { damageTaken: 0.03 }, desc: (r) => `−${pc(0.03 * r)} damage taken` },
  v_rally: { tree: 'vanguard', tier: 3, ability: 'rally' },
  v_meteor: { tree: 'vanguard', tier: 3, upgrade: ['leap', 'meteor'], name: 'Meteor', desc: () => 'Leap Strike lands half as hard again, and comes back 3 seconds sooner.' },
  v_capstone: {
    tree: 'vanguard', tier: 4, name: 'Juggernaut Protocol', capstone: true, stats: { meleeDamage: 0.15 }, perks: ['steadfast', 'devour'],
    desc: () => '+15% melee damage. Nothing knocks you back, and kills restore 2% of your health.',
  },
  v_warcry: { tree: 'vanguard', tier: 4, upgrade: ['rally', 'warcry'], name: 'Warcry', desc: () => 'Rally Cry lasts 4 seconds longer and clears burning, chill and corrosion.' },

  // ======================================================== Gunslinger
  g_aim: { tree: 'gunslinger', tier: 0, ranks: 3, name: 'Steady Aim', stats: { rangedDamage: 0.07 }, desc: (r) => `+${pc(0.07 * r)} ranged damage` },
  g_feet: { tree: 'gunslinger', tier: 0, ranks: 3, name: 'Light Feet', stats: { moveSpeed: 0.03 }, desc: (r) => `+${pc(0.03 * r)} move speed` },
  g_frag: { tree: 'gunslinger', tier: 0, ability: 'frag' },
  g_deadeye: { tree: 'gunslinger', tier: 1, ranks: 3, name: 'Deadeye', stats: { critBonus: 0.03 }, desc: (r) => `+${pc(0.03 * r)} critical hit chance` },
  g_grapple: { tree: 'gunslinger', tier: 1, ability: 'grapple' },
  g_cluster: { tree: 'gunslinger', tier: 1, upgrade: ['frag', 'cluster'], name: 'Cluster Charge', desc: () => 'Frag Grenade scatters three bomblets when it goes off.' },
  g_hollow: { tree: 'gunslinger', tier: 2, ranks: 3, name: 'Hollow Points', stats: { rangedDamage: 0.07 }, desc: (r) => `+${pc(0.07 * r)} ranged damage` },
  g_decoy: { tree: 'gunslinger', tier: 2, ability: 'decoy' },
  g_zipline: { tree: 'gunslinger', tier: 2, upgrade: ['grapple', 'zipline'], name: 'Zipline', desc: () => 'Grapple Line reaches 40% further, and gives your air dash back.' },
  g_rhythm: { tree: 'gunslinger', tier: 3, ranks: 3, name: 'Hardened', stats: { healthPct: 0.04 }, desc: (r) => `+${pc(0.04 * r)} max health` },
  g_overclock: { tree: 'gunslinger', tier: 3, ability: 'overclock' },
  g_boom: { tree: 'gunslinger', tier: 3, upgrade: ['decoy', 'boom'], name: 'Surprise', desc: () => 'Holo-Decoy blows up when it ends.' },
  g_capstone: {
    tree: 'gunslinger', tier: 4, name: 'Bullet Time', capstone: true, stats: { rangedDamage: 0.15, critDamage: 0.2 },
    desc: () => '+15% ranged damage and +20% critical damage.',
  },
  g_afterburn: { tree: 'gunslinger', tier: 4, upgrade: ['overclock', 'afterburner'], name: 'Afterburner', desc: () => 'Overclock also makes you a quarter faster on your feet.' },

  // ======================================================== Technomancer
  t_attune: { tree: 'technomancer', tier: 0, ranks: 3, name: 'Attunement', stats: { magicDamage: 0.07 }, desc: (r) => `+${pc(0.07 * r)} magic damage` },
  t_caps: { tree: 'technomancer', tier: 0, ranks: 3, name: 'Capacitors', stats: { mana: 15 }, desc: (r) => `+${15 * r} max mana` },
  t_drone: { tree: 'technomancer', tier: 0, ability: 'drone' },
  t_flux: { tree: 'technomancer', tier: 1, ranks: 3, name: 'Flux Regen', stats: { manaRegen: 0.15 }, desc: (r) => `+${pc(0.15 * r)} mana regeneration` },
  t_stasis: { tree: 'technomancer', tier: 1, ability: 'stasis' },
  t_twin: { tree: 'technomancer', tier: 1, upgrade: ['drone', 'twin'], name: 'Twin Sentry', desc: () => 'Sentry Drone deploys two turrets.' },
  t_overcharge: { tree: 'technomancer', tier: 2, ranks: 3, name: 'Overcharge', stats: { magicDamage: 0.07 }, desc: (r) => `+${pc(0.07 * r)} magic damage` },
  t_barrier: { tree: 'technomancer', tier: 2, ability: 'barrier' },
  t_freeze: { tree: 'technomancer', tier: 2, upgrade: ['stasis', 'deepfreeze'], name: 'Deep Freeze', desc: () => 'Stasis Field lasts 2 seconds longer, and its cold bites.' },
  t_ward: { tree: 'technomancer', tier: 3, ranks: 3, name: 'Kinetic Ward', stats: { healthPct: 0.03, damageTaken: 0.02 }, desc: (r) => `+${pc(0.03 * r)} max health, −${pc(0.02 * r)} damage taken` },
  t_pulse: { tree: 'technomancer', tier: 3, ability: 'pulse' },
  t_shock: { tree: 'technomancer', tier: 3, upgrade: ['barrier', 'shockdome'], name: 'Shock Dome', desc: () => 'Arc Barrier shocks every enemy inside it.' },
  t_capstone: {
    tree: 'technomancer', tier: 4, name: 'Singularity', capstone: true, stats: { magicDamage: 0.15, manaDiscount: 0.15 },
    desc: () => '+15% magic damage, and spells cost 15% less mana.',
  },
  t_mass: { tree: 'technomancer', tier: 4, upgrade: ['pulse', 'mass'], name: 'Mass Restoration', desc: () => 'Restoration Pulse heals half as much again.' },
};
export const TALENT_IDS = Object.keys(TALENTS);
for (const [id, t] of Object.entries(TALENTS)) {
  t.id = id;
  t.ranks ??= 1;
}
// The node that unlocks each ability.
export const ABILITY_NODE = Object.fromEntries(Object.values(TALENTS).filter((t) => t.ability).map((t) => [t.ability, t.id]));

// Points a character of `level` has to spend: one a level from level 2.
export const talentPoints = (level) => Math.max(0, Math.min(level, MAX_LEVEL) - 1);

// Points spent in each tree.
export function spentIn(ranks) {
  const out = Object.fromEntries(TREE_IDS.map((t) => [t, 0]));
  for (const [id, r] of Object.entries(ranks)) if (TALENTS[id]) out[TALENTS[id].tree] += r;
  return out;
}
export const spentTotal = (ranks) => Object.values(ranks).reduce((a, b) => a + b, 0);

// Can a character of `level` with `ranks` take one more rank of `id`? (A reason when not.)
export function canLearn(ranks, id, level) {
  const t = TALENTS[id];
  if (!t) return 'No such talent';
  if ((ranks[id] ?? 0) >= t.ranks) return 'Fully learned';
  if (spentTotal(ranks) >= talentPoints(level)) return 'No points to spend';
  if (spentIn(ranks)[t.tree] < TIERS[t.tier]) return `Needs ${TIERS[t.tier]} points in ${TREES[t.tree].name}`;
  if (t.upgrade && !ranks[ABILITY_NODE[t.upgrade[0]]]) return 'Unlock the ability first';
  return null;
}

// What the learned talents add up to: stats (summed over ranks), perks, abilities unlocked and
// their upgrades.
export function talentEffects(ranks) {
  const stats = {};
  const perks = new Set();
  const abilities = [];
  const upgrades = new Set();
  for (const [id, r] of Object.entries(ranks)) {
    const t = TALENTS[id];
    if (!t || r <= 0) continue;
    for (const [k, v] of Object.entries(t.stats ?? {})) stats[k] = (stats[k] ?? 0) + v * r;
    for (const p of t.perks ?? []) perks.add(p);
    if (t.ability) abilities.push(t.ability);
    if (t.upgrade) upgrades.add(t.upgrade[1]);
  }
  return { stats, perks, abilities, upgrades };
}

// What respeccing costs: nothing below level 10, then gold by level (at a trader's workshop).
export const RESPEC_FREE_BELOW = 10;
export const respecCost = (level) => (level < RESPEC_FREE_BELOW ? 0 : level * 40);
