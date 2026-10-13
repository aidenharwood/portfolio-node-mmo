// The power curve, measured with the game's own formulas and generators: a character at each level
// against enemies of that level. Fails if a level drifts outside the bands in rpg/balance.js.
//   node tools/powercurve.mjs            the table, and a check
//   node tools/powercurve.mjs --quiet    just the check
// The reference character spends their talent points down their class tree (damage and its
// abilities first, then toughness, then a dip into a second tree) and wears gear of their level:
// common at levels 1–2, uncommon at 3–4, rare from 5 (a mix of sets). A Gunslinger built the same
// way is checked for how fast they go down (their tree is less tough). "Hits" are hits of
// the weapon's plain damage (crits averaged in); a Scav Cutter is the trash, its named elite the
// elite, the Scav Warlord (a level above, as strongholds have them) the boss. "Veteran" is the same
// trash on the Veteran Threat tier.
import { Stats } from '../src/rpg/Stats.js';
import { talentPoints } from '../src/rpg/talents.js';
import { generateWeapon } from '../src/items/WeaponGenerator.js';
import { generateArmor } from '../src/items/ArmorGenerator.js';
import { enemyType, enemyMaxHp, enemyAttacks } from '../src/sim/enemyDefs.js';
import { armorReduction, TIERS } from '../src/rpg/balance.js';
import { MELEE_COMBOS } from '../src/combat/attacks.js';

const quiet = process.argv.includes('--quiet');
const VETERAN = TIERS.find((t) => t.id === 'veteran');
const SLOTS = ['head', 'chest', 'hands', 'legs', 'back'];
const SETS = ['pathfinder', 'vanguard', 'bastion', 'raider', 'chitin', 'arcframe', 'ascendant'];
const rarityAt = (L) => (L <= 2 ? 'common' : L <= 4 ? 'uncommon' : 'rare');
const mean = (list) => list.reduce((a, b) => a + b, 0) / list.length;

// A sword's average hit (crits averaged in) with this character's multiplier.
function swordHit(stats, L, rarity, seeds) {
  return mean(seeds.map((seed) => {
    const s = generateWeapon({ level: L, type: 'sword', rarity, seed }).stats;
    return s.damage * (1 + Math.min(0.75, s.critChance + stats.critBonus) * (s.critMult - 1));
  })) * stats.damageMult('melee');
}

// The order a typical character spends talents in.
const ORDER = {
  vanguard: ['v_edge', 'v_edge', 'v_edge', 'v_slam', 'v_plate', 'v_plate', 'v_butcher', 'v_butcher', 'v_butcher', 'v_bulwark', 'v_leap', 'v_rally',
    'v_brawn', 'v_brawn', 'v_brawn', 'v_capstone', 'v_aftershock', 'v_plate', 'v_iron', 'v_iron', 'v_iron', 'v_mirror', 'v_meteor', 'v_warcry',
    'g_aim', 'g_frag', 'g_feet', 'g_feet', 'g_feet'],
  gunslinger: ['g_aim', 'g_aim', 'g_aim', 'g_frag', 'g_feet', 'g_feet', 'g_hollow', 'g_hollow', 'g_hollow', 'g_grapple', 'g_decoy', 'g_overclock',
    'g_deadeye', 'g_deadeye', 'g_deadeye', 'g_capstone', 'g_cluster', 'g_feet', 'g_rhythm', 'g_rhythm', 'g_rhythm', 'g_zipline', 'g_boom', 'g_afterburn',
    'v_edge', 'v_slam', 'v_plate', 'v_plate', 'v_plate'],
};

// A character of level L with talents spent down `tree`, in five armour pieces.
function character(L, kit, tree = 'vanguard') {
  const st = new Stats();
  st.level = L;
  for (const id of ORDER[tree].slice(0, talentPoints(L))) st.learn(id);
  st.setGear(kit);
  return st;
}

// One level's numbers, averaged over a dozen outfits.
function measure(L) {
  const rarity = rarityAt(L);
  const swords = Array.from({ length: 60 }, (_, i) => 1000 + i);
  const rows = Array.from({ length: 12 }, (_, k) => {
    const kit = SLOTS.map((slot, i) => generateArmor({ level: L, slot, rarity, set: SETS[(k + i * 3) % SETS.length], seed: 500 + k * 31 + i * 7 + L * 101 }));
    const st = character(L, kit);
    const gun = character(L, kit, 'gunslinger');
    return {
      hit: swordHit(st, L, rarity, swords), hp: st.maxHp, red: armorReduction(st.armor, L), taken: 1 - st.damageTaken,
      gunHp: gun.maxHp, gunRed: armorReduction(gun.armor, L), gunTaken: 1 - gun.damageTaken,
    };
  });
  const hit = mean(rows.map((r) => r.hit));
  const hp = mean(rows.map((r) => r.hp));
  const red = mean(rows.map((r) => r.red));
  const taken = mean(rows.map((r) => r.taken));
  const gunEhp = mean(rows.map((r) => r.gunHp / ((1 - r.gunRed) * r.gunTaken)));
  const trash = enemyType('cutter');
  const elite = enemyType('cutter', null, 'Test Elite');
  const swing = (t) => enemyAttacks(t, L)[0].damage * (1 - red) * taken;
  // A boss alone: the sword's three-swing chain, swinging about 55% of the time between dodges.
  const chain = MELEE_COMBOS.sword;
  const perSecond = chain.reduce((a, m) => a + m.damage, 0) / chain.reduce((a, m) => a + m.duration, 0);
  const boss = enemyMaxHp(enemyType('warlord'), L + 1) / (hit * perSecond * 0.55);
  // Best in slot: a legendary sword's best rolls, and a full legendary Bastion set.
  const bisKit = SLOTS.map((slot, i) => generateArmor({ level: L, slot, rarity: 'legendary', set: 'bastion', seed: 900 + i + L }));
  const bisSt = character(L, bisKit);
  const bisHits = swords.map((seed) => swordHit(bisSt, L, 'legendary', [seed])).sort((a, b) => b - a);
  const bis = mean(bisHits.slice(0, 6));
  const bisCrit = mean(swords.slice(0, 20).map((seed) => generateWeapon({ level: L, type: 'sword', rarity: 'legendary', seed }).stats.critMult));
  return {
    L, rarity, hp, red, hit,
    htk: enemyMaxHp(trash, L) / hit,
    htd: hp / swing(trash),
    eliteHtk: enemyMaxHp(elite, L) / hit,
    eliteHtd: hp / swing(elite),
    boss,
    bis: bis / hit,
    bisOneShot: enemyMaxHp(trash, L) / (bis * bisCrit), // hits to kill trash with a BiS crit
    vetHtk: (enemyMaxHp(trash, L) / hit) * VETERAN.health,
    vetHtd: hp / (swing(trash) * VETERAN.damage),
    gunHtd: gunEhp / enemyAttacks(trash, L)[0].damage,
  };
}

// The bands (rpg/balance.js); levels 1–4 are the gentle start and only need to be no harder.
const BANDS = [
  ['htk', 'trash hits to kill', 3, 4, 2.4, 4],
  ['htd', 'trash hits to die', 12, 16, 12, 22],
  ['eliteHtk', 'elite hits to kill', 10, 15, 8, 15],
  ['eliteHtd', 'elite hits to die', 5, 7, 5, 10],
  ['boss', 'boss seconds', 60, 90, 30, 90],
  ['bis', 'best-in-slot damage ×', 1.3, 2.2, 1.3, 2.5],
  ['bisOneShot', 'BiS crit hits to kill', 1.05, Infinity, 1, Infinity],
  ['vetHtk', 'Veteran trash hits to kill', 4.8, 6.5, 3.8, 6.5],
  ['vetHtd', 'Veteran trash hits to die', 8, 11, 8, 15],
  ['gunHtd', 'trash hits to kill a Gunslinger', 11, 16, 11, 22],
];

const results = [];
for (let L = 1; L <= 30; L++) results.push(measure(L));

if (!quiet) {
  console.log('Lv rarity     hp   armour  hit | trash k/d  | elite k/d  | boss s | BiS × crit-k | veteran k/d | gun d');
  for (const r of results) {
    console.log(`${String(r.L).padStart(2)} ${r.rarity.padEnd(8)} ${Math.round(r.hp).toString().padStart(6)} ${(r.red * 100).toFixed(0).padStart(4)}% ${Math.round(r.hit).toString().padStart(6)}`
      + ` | ${r.htk.toFixed(2)} ${r.htd.toFixed(1).padStart(5)} | ${r.eliteHtk.toFixed(1).padStart(4)} ${r.eliteHtd.toFixed(1).padStart(4)}`
      + ` | ${r.boss.toFixed(0).padStart(5)} | ${r.bis.toFixed(2)} ${r.bisOneShot.toFixed(2)}   | ${r.vetHtk.toFixed(1)} ${r.vetHtd.toFixed(1).padStart(4)}  | ${r.gunHtd.toFixed(1)}`);
  }
}

let bad = 0;
for (const r of results) {
  for (const [key, label, lo, hi, earlyLo, earlyHi] of BANDS) {
    const [a, b] = r.L < 5 ? [earlyLo, earlyHi] : [lo, hi];
    const v = r[key];
    if (v < a - 1e-9 || v > b + 1e-9) {
      bad++;
      console.log(`level ${r.L}: ${label} ${v.toFixed(2)} outside ${a}–${b}`);
    }
  }
}
console.log(bad ? `power curve: ${bad} out of band` : 'power curve: every level in band');
process.exit(bad ? 1 : 0);
