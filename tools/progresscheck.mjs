// Dev check: talents, abilities, achievements, titles and the codex, through the character's own
// rules (rpg/CharacterCore.js) — tiers and points hold, saves can't hold more than was earned,
// every ability is defined and scales, records add up to the achievements they should, and the
// codex has an entry for everything that can unlock one.
// Run: node tools/progresscheck.mjs
import * as THREE from 'three';
import { Stats } from '../src/rpg/Stats.js';
import { Inventory } from '../src/items/Inventory.js';
import { CharacterCore } from '../src/rpg/CharacterCore.js';
import { TALENTS, TREE_IDS, TIERS, talentPoints, respecCost, ABILITY_NODE } from '../src/rpg/talents.js';
import { ABILITIES, ABILITY_IDS, abilityPower, cooldownOf } from '../src/combat/abilities.js';
import { ACHIEVEMENTS, TITLES } from '../src/rpg/achievements.js';
import { BESTIARY, PLACES, MAKER_LORE } from '../src/rpg/codex.js';
import { ENEMY_TYPES } from '../src/combat/bestiary.js';
import { LANDMARKS, BIOMES } from '../src/world/Gen.js';
import { MAKER_IDS } from '../src/items/manufacturers.js';
import { AFFIX_IDS } from '../src/sim/affixes.js';

let failed = 0;
const check = (ok, what) => {
  if (!ok) failed++;
  console.log(`  ${ok ? '✓' : '✗'} ${what}`);
};

// ---------------------------------------------------------------- talents
console.log('Talents:');
for (const t of TREE_IDS) {
  const nodes = Object.values(TALENTS).filter((n) => n.tree === t);
  const cost = nodes.reduce((s, n) => s + n.ranks, 0);
  const abilities = nodes.filter((n) => n.ability).map((n) => n.ability);
  check(cost === 24 && abilities.length === 4 && nodes.some((n) => n.capstone), `${t}: 24 points to fill, four abilities (${abilities.join(', ')}), a capstone`);
  check(TIERS.every((_, tier) => nodes.some((n) => n.tier === tier)), `${t}: something in every tier`);
}
check(talentPoints(1) === 0 && talentPoints(30) === 29 && talentPoints(40) === 29, 'one point a level from 2: 29 at the cap');
{
  const s = new Stats();
  s.level = 2;
  check(!s.learn('v_butcher'), 'a tier stays shut until its points are in the tree');
  check(s.learn('v_edge') && !s.learn('v_edge'), 'no more ranks than points');
  s.level = 12;
  for (const id of ['v_edge', 'v_edge', 'v_slam', 'v_plate', 'v_plate']) s.learn(id);
  check(s.learn('v_butcher'), 'six points in Vanguard open its third tier');
  check(!s.learn('v_meteor'), 'an upgrade needs its ability');
  check(s.slots[0] === 'slam', 'an unlocked ability goes in the first empty slot');
  const t = new Stats();
  t.load({ v: 3, level: 4, xp: 0, gold: 0, talents: { v_edge: 3, v_capstone: 1, g_aim: 3 }, slots: ['frag', null, null] });
  check(Object.values(t.talents).reduce((a, b) => a + b, 0) <= 3 && !t.talents.v_capstone && !t.slots[0], 'a save holds only what could have been learned');
  check(respecCost(9) === 0 && respecCost(10) > 0, 'resets are free below level 10');
}

// ---------------------------------------------------------------- abilities
console.log('Abilities:');
check(ABILITY_IDS.length === 12 && ABILITY_IDS.every((id) => ABILITY_NODE[id]), 'twelve abilities, each unlocked by a talent');
check(ABILITY_IDS.every((id) => Object.keys(ABILITIES[id].upgrades ?? {}).length === 1 && Object.values(TALENTS).some((n) => n.upgrade?.[0] === id)), 'each has one upgrade, and a talent that gives it');
{
  const lo = new Stats();
  const hi = new Stats();
  hi.level = 30;
  check(abilityPower(hi, 'slam') / abilityPower(lo, 'slam') > 50, 'ability damage grows with level like a weapon\'s');
  check(cooldownOf('leap', new Set(['meteor'])) === ABILITIES.leap.cooldown - 3, 'Meteor shortens Leap Strike');
}

// ---------------------------------------------------------------- achievements and records
console.log('Achievements:');
check(ACHIEVEMENTS.length >= 40 && new Set(ACHIEVEMENTS.map((a) => a.id)).size === ACHIEVEMENTS.length, `${ACHIEVEMENTS.length} achievements, ids unique, ${TITLES.length} titles`);
{
  // Act III's dungeon has its own: a Foundry Below clear at any tier counts, and nothing else does.
  const down = ACHIEVEMENTS.find((a) => a.id === 'dungeon_foundrybelow');
  check(!!down && down.stat({ dungeons: { foundrybelow: [0, 0, 1, 0] } }) === 1 && down.stat({ dungeons: { brood: [3, 0, 0, 0] } }) === 0, 'Down the Line: a Foundry Below clear counts, another dungeon\'s doesn\'t');
}
const quests = { onKill() {}, advance() {}, onCampCleared() {}, isComplete: () => false, defs: new Map(), toJSON: () => ({ active: {}, completed: [] }) };
const core = new CharacterCore({
  stats: new Stats(), inventory: new Inventory(3), quests, attuned: new Set(['w-hub']), chests: new Set(), shop: { stock: [] },
  settings: { lootFilter: 0 }, position: new THREE.Vector3(), world: null,
});
const kill = (type, extra = {}) => core.apply({ op: 'reward', roll: { xp: 1, gold: 0, loot: [], at: [0, 0, 0], kill: { type, race: ENEMY_TYPES[type].race, level: 1, h: 2, tier: 0, ...extra } } });
const has = (id) => core.achievements[id] !== undefined;
let r = kill('cutter');
check(has('kills_1') && r.fx.some((f) => f.k === 'achievement' && f.id === 'kills_1'), 'the first kill: First Blood, announced');
for (let i = 0; i < 149; i++) kill('cutter');
check(has('scav_150') && !has('hive_150'), '150 Scavs: Scavbane (and nothing for the Hive)');
for (const b of ['warlord', 'queen', 'colossus', 'behemoth']) kill(b, { boss: true });
check(has('boss_all'), 'all four bosses: Kingslayer');
for (const a of AFFIX_IDS) kill('drone', { elite: true, affixes: [a] });
check(has('affixes_all') && core.records.typeAffixes.drone?.shielded, 'an elite of every affix: Seen Them All (and the codex knows which)');
for (let i = 0; i < 100; i++) kill('hound', { tier: 2 });
check(has('veteran_100') && !has('elite_250'), 'Threat kills count for Hardened, not yet Fearless');
core.apply({ op: 'bonus', roll: { title: 'x', kind: 'warband', xp: 1, gold: 0, loot: [], at: [0, 0, 0] } });
check(has('warband_1'), 'a warband broken: Broken Ranks');
for (const b of BIOMES) core.apply({ op: 'visit', roll: { b, l: 3 } });
check(has('biomes_all'), 'every biome walked: Worldwalker');
check(!core.apply({ op: 'visit', roll: { b: BIOMES[0], l: 3 } }).ok, 'nothing new about the same place twice');
core.apply({ op: 'feat', f: 'combo', v: 50 });
check(has('combo_50') && !core.apply({ op: 'feat', f: 'combo', v: 9999 }).ok, 'a 50-hit combo: Bladedancer (and no absurd feats)');
check(core.apply({ op: 'title', id: 'combo_50' }).ok && core.settings.title === 'combo_50', 'its title can be worn');
check(!core.apply({ op: 'title', id: 'kills_1000' }).ok, 'a title not yet earned can\'t');
const copy = new CharacterCore({
  stats: new Stats(), inventory: new Inventory(3), quests, attuned: new Set(['w-hub']), chests: new Set(), shop: { stock: [] },
  settings: { lootFilter: 0, title: 'combo_50' }, position: new THREE.Vector3(), world: null,
});
copy.loadProgress(JSON.parse(JSON.stringify(core.toJSON())));
check(copy.records.kills === core.records.kills && Object.keys(copy.achievements).length === Object.keys(core.achievements).length && copy.settings.title === 'combo_50', 'records, achievements and the title save and load');

// ---------------------------------------------------------------- codex
console.log('Codex:');
check(Object.keys(ENEMY_TYPES).every((id) => BESTIARY[id]?.lore && BESTIARY[id].strengths && BESTIARY[id].weaknesses), 'every enemy type has lore, strengths and weaknesses');
check(Object.keys(LANDMARKS).every((k) => PLACES[k]?.lore), 'every kind of landmark has an entry');
check(MAKER_IDS.every((m) => MAKER_LORE[m]), 'every maker has an entry');

console.log(failed ? `progresscheck: ${failed} failed` : 'progresscheck: all good');
process.exit(failed ? 1 : 0);
