// Achievements: goals across everything a character does, worth points, the bigger ones granting
// a title to wear. Progress comes from the character's records (CharacterCore.records: kills by
// faction, type and Threat, bosses, warbands broken, places visited, sets worn…), which change only
// through the character's operations — so the server counts them online, and both copies agree.
// Dungeons, raids, public events and the story add theirs as they come.
//   stat(records, core) → how far along · goal · points · title (worn in the Character tab)
import { BIOMES, LANDMARKS } from '../world/Gen.js';
import { GEAR_SETS } from '../items/sets.js';
import { MAKER_IDS } from '../items/manufacturers.js';
import { AFFIX_IDS } from '../sim/affixes.js';
import { SIDE_CHAINS } from './sidequests.js';

const n = (o) => Object.keys(o ?? {}).length;
// Settlements visited of one size, by their ids' prefix (world/Gen.js: h hamlets, v villages, o
// towns, y cities).
const placesOf = (r, prefix) => r.settlements.filter((id) => id.startsWith(`${prefix}:`)).length;
const BOSSES = ['warlord', 'queen', 'colossus', 'behemoth'];
// The kinds of village whose side chain (rpg/sidequests.js) has been seen through to its end.
function chainsDone(c) {
  const kinds = new Set();
  for (const id of c.quests?.completed ?? []) {
    const m = /^side:(\w+):(\d+)@/.exec(id);
    if (m && Number(m[2]) === (SIDE_CHAINS[m[1]]?.quests.length ?? 0) - 1) kinds.add(m[1]);
  }
  return kinds.size;
}
const flag = (c, f) => +!!c.quests?.flags?.[f];
// Dungeons beaten (records.dungeons: id → [open world, Normal, Veteran, Elite] clears).
const LAUNCH = ['foundry', 'vault', 'brood'];
const clears = (r, from = 0, to = 3) => Object.values(r.dungeons ?? {}).reduce((s, row) => s + row.slice(from, to + 1).reduce((a, b) => a + b, 0), 0);
// Raids (records.raids: raid id → { encounter id → [Normal, Veteran, Elite] kills, `<id>:flawless`
// the same with nobody falling, `clears` the raid beaten }).
const raidKills = (r, raid, key, from = 0) => (r.raids?.[raid]?.[key] ?? []).slice(from).reduce((a, b) => a + b, 0);
const flawless = (r) => Object.values(r.raids ?? {}).reduce((s, rec) => s + Object.entries(rec).filter(([k]) => k.endsWith(':flawless')).reduce((a, [, row]) => a + row.reduce((x, y) => x + y, 0), 0), 0);
// Public events won (records.events: kind → [Normal, Veteran, Elite] wins).
const eventWins = (r, kind = null, tier = null) => Object.entries(r.events ?? {}).filter(([k]) => !kind || k === kind)
  .reduce((s, [, row]) => s + (tier === null ? row.reduce((a, b) => a + b, 0) : row[tier] ?? 0), 0);
// The sets that drop anywhere (a raid's own sets have achievements of their own).
const OPEN_SETS = Object.keys(GEAR_SETS).filter((id) => !GEAR_SETS[id].raid);

export const CATEGORIES = {
  story: 'Story', dungeons: 'Dungeons', raids: 'Raids', events: 'Events', combat: 'Combat', exploration: 'Exploration', collections: 'Collections', progression: 'Progression', feats: 'Feats',
};

export const ACHIEVEMENTS = [
  // ---------------------------------------------------------------- story
  { id: 'story_prologue', cat: 'story', name: 'The Last Sleeper', desc: 'Finish the Prologue.', goal: 1, points: 10, title: 'the Last Sleeper', stat: (r, c) => +!!c.quests?.completed?.has('p4') },
  { id: 'story_beacons', cat: 'story', name: 'Signal Fire', desc: 'Light the beacons round New Meridian.', goal: 1, points: 10, stat: (r, c) => flag(c, 'beacons_lit') },
  { id: 'story_ironjaw', cat: 'story', name: 'The Jaw Breaks', desc: 'Defeat Ironjaw in the Rustjaw Foundry.', goal: 1, points: 15, stat: (r, c) => flag(c, 'ironjaw_fell') },
  { id: 'story_krell', cat: 'story', name: 'Judgement', desc: 'Decide what becomes of Krell.', goal: 1, points: 5, stat: (r, c) => flag(c, 'krell_captured') || flag(c, 'krell_freed') },
  { id: 'story_act1', cat: 'story', name: 'It Was Never a Door', desc: 'Finish Act I: Signal Fire.', goal: 1, points: 25, title: 'Ironjaw\'s Bane', stat: (r, c) => flag(c, 'act1_done') },
  { id: 'side_chain_1', cat: 'story', name: 'Neighbourly', desc: 'See a village\'s own story through to its end.', goal: 1, points: 10, stat: (r, c) => chainsDone(c) },
  { id: 'side_chain_all', cat: 'story', name: 'Pillar of the Community', desc: 'See through the stories of a homestead, a mining village, a caravan stop, an outpost and a fen village.', goal: Object.keys(SIDE_CHAINS).length, points: 25, title: 'the Good Neighbour', stat: (r, c) => chainsDone(c) },
  // ---------------------------------------------------------------- dungeons
  { id: 'dungeon_1', cat: 'dungeons', name: 'Delver', desc: 'Defeat a dungeon\'s final boss.', goal: 1, points: 10, stat: (r) => clears(r) },
  { id: 'dungeon_launch', cat: 'dungeons', name: 'Into Every Dark', desc: 'Defeat the final bosses of the Rustjaw Foundry, the Sunken Vault and the Brood Pits.', goal: LAUNCH.length, points: 25, title: 'the Delver', stat: (r) => LAUNCH.filter((d) => (r.dungeons?.[d] ?? []).some((v) => v > 0)).length },
  { id: 'dungeon_run', cat: 'dungeons', name: 'Private Business', desc: 'Finish a private run.', goal: 1, points: 10, stat: (r) => clears(r, 1) },
  { id: 'dungeon_10', cat: 'dungeons', name: 'Regular', desc: 'Finish 10 private runs.', goal: 10, points: 15, stat: (r) => clears(r, 1) },
  { id: 'dungeon_elite', cat: 'dungeons', name: 'Deep and Dark', desc: 'Finish a private run on Elite.', goal: 1, points: 25, title: 'Deepdelver', stat: (r) => clears(r, 3) },
  // ---------------------------------------------------------------- raids
  { id: 'raid_warden', cat: 'raids', name: 'Through the Gate', desc: 'Defeat the Brood Warden.', goal: 1, points: 10, stat: (r) => raidKills(r, 'broodmother', 'warden') },
  { id: 'raid_choir', cat: 'raids', name: 'Silence', desc: 'Defeat the Psion Choir.', goal: 1, points: 15, stat: (r) => raidKills(r, 'broodmother', 'choir') },
  { id: 'raid_mother', cat: 'raids', name: 'Matricide', desc: 'Defeat the Brood Mother.', goal: 1, points: 25, title: 'the Matricide', stat: (r) => raidKills(r, 'broodmother', 'mother') },
  { id: 'raid_veteran', cat: 'raids', name: 'Into the Deep Nest', desc: 'Beat the Brood Mother\'s raid on Veteran or Elite.', goal: 1, points: 20, stat: (r) => raidKills(r, 'broodmother', 'clears', 1) },
  { id: 'raid_elite', cat: 'raids', name: 'The Brood Ends', desc: 'Beat the Brood Mother\'s raid on Elite.', goal: 1, points: 30, title: 'Queenslayer', stat: (r) => raidKills(r, 'broodmother', 'clears', 2) },
  { id: 'raid_flawless', cat: 'raids', name: 'Untouched', desc: 'Defeat a raid boss without anyone in the raid falling.', goal: 1, points: 20, stat: (r) => flawless(r) },
  { id: 'raid_set', cat: 'raids', name: 'Broodbane', desc: 'Wear all five pieces of the Broodbane set.', goal: 1, points: 25, title: 'Broodbane', stat: (r) => +!!r.fullSets.broodbane },
  // ---------------------------------------------------------------- public events
  { id: 'event_1', cat: 'events', name: 'First Responder', desc: 'Complete a public event.', goal: 1, points: 10, stat: (r) => eventWins(r) },
  { id: 'event_25', cat: 'events', name: 'Steadfast', desc: 'Complete 25 public events.', goal: 25, points: 25, title: 'the Steadfast', stat: (r) => eventWins(r) },
  { id: 'event_surge', cat: 'events', name: 'Hold the Line', desc: 'Repel a Hive Surge.', goal: 1, points: 10, stat: (r) => eventWins(r, 'surge') },
  { id: 'event_siege', cat: 'events', name: 'Raise the Siege', desc: 'Break a Scav Siege.', goal: 1, points: 10, stat: (r) => eventWins(r, 'siege') },
  { id: 'event_anomaly', cat: 'events', name: 'Signal in the Noise', desc: 'Stabilise a Maker anomaly.', goal: 1, points: 10, stat: (r) => eventWins(r, 'anomaly') },
  { id: 'event_elite', cat: 'events', name: 'Not On My Watch', desc: 'Complete a public event voted to Elite.', goal: 1, points: 20, stat: (r) => eventWins(r, null, 2) },
  { id: 'event_retake', cat: 'events', name: 'Reclaimer', desc: 'Retake an overrun settlement.', goal: 1, points: 15, stat: (r) => eventWins(r, 'retake') },
  { id: 'event_lead', cat: 'events', name: 'Leading from the Front', desc: 'Contribute the most to a public event with three or more taking part.', goal: 1, points: 15, stat: (r) => r.eventLead },
  // ---------------------------------------------------------------- combat
  { id: 'kills_1', cat: 'combat', name: 'First Blood', desc: 'Defeat an enemy.', goal: 1, points: 5, stat: (r) => r.kills },
  { id: 'kills_250', cat: 'combat', name: 'Hunter', desc: 'Defeat 250 enemies.', goal: 250, points: 10, stat: (r) => r.kills },
  { id: 'kills_1000', cat: 'combat', name: 'Slayer', desc: 'Defeat 1,000 enemies.', goal: 1000, points: 20, title: 'the Relentless', stat: (r) => r.kills },
  { id: 'scav_150', cat: 'combat', name: 'Scavbane', desc: 'Defeat 150 Scavs.', goal: 150, points: 10, title: 'Scavbane', stat: (r) => r.race.scav ?? 0 },
  { id: 'hive_150', cat: 'combat', name: 'Bugsquasher', desc: 'Defeat 150 of the Hive.', goal: 150, points: 10, title: 'Bugsquasher', stat: (r) => r.race.hive ?? 0 },
  { id: 'synth_150', cat: 'combat', name: 'Scrapper', desc: 'Defeat 150 Synths.', goal: 150, points: 10, title: 'Scrapper', stat: (r) => r.race.synth ?? 0 },
  { id: 'fauna_150', cat: 'combat', name: 'Big Game', desc: 'Defeat 150 of the Wild.', goal: 150, points: 10, title: 'the Huntsman', stat: (r) => r.race.fauna ?? 0 },
  { id: 'elites_10', cat: 'combat', name: 'Named and Shamed', desc: 'Defeat 10 named elites.', goal: 10, points: 10, stat: (r) => r.elites },
  { id: 'elites_100', cat: 'combat', name: 'Elitekiller', desc: 'Defeat 100 named elites.', goal: 100, points: 20, title: 'Elitekiller', stat: (r) => r.elites },
  { id: 'champion_1', cat: 'combat', name: "Champion's Bane", desc: 'Defeat a champion.', goal: 1, points: 10, stat: (r) => r.champions },
  { id: 'affixes_all', cat: 'combat', name: 'Seen Them All', desc: 'Defeat an elite with each of the eight affixes.', goal: AFFIX_IDS.length, points: 20, stat: (r) => n(r.affixes) },
  { id: 'boss_warlord', cat: 'combat', name: 'Uncrowned', desc: 'Defeat a Scav Warlord.', goal: 1, points: 10, stat: (r) => r.bosses.warlord ?? 0 },
  { id: 'boss_queen', cat: 'combat', name: 'Regicide', desc: 'Defeat a Hive Queen.', goal: 1, points: 10, stat: (r) => r.bosses.queen ?? 0 },
  { id: 'boss_colossus', cat: 'combat', name: 'Scrap Metal', desc: 'Defeat a Colossus.', goal: 1, points: 10, stat: (r) => r.bosses.colossus ?? 0 },
  { id: 'boss_behemoth', cat: 'combat', name: 'The Bigger They Come', desc: 'Defeat a Behemoth.', goal: 1, points: 10, stat: (r) => r.bosses.behemoth ?? 0 },
  { id: 'boss_all', cat: 'combat', name: 'Kingslayer', desc: "Defeat every faction's boss.", goal: BOSSES.length, points: 25, title: 'Kingslayer', stat: (r) => BOSSES.filter((b) => r.bosses[b]).length },
  { id: 'warband_1', cat: 'combat', name: 'Broken Ranks', desc: 'Break a warband.', goal: 1, points: 10, stat: (r) => r.warbands },
  { id: 'warband_10', cat: 'combat', name: 'Warbreaker', desc: 'Break 10 warbands.', goal: 10, points: 20, title: 'Warbreaker', stat: (r) => r.warbands },
  { id: 'stronghold_1', cat: 'combat', name: 'Over the Walls', desc: 'Storm a stronghold.', goal: 1, points: 10, stat: (r) => r.strongholds },
  { id: 'stronghold_10', cat: 'combat', name: 'Siegebreaker', desc: 'Storm 10 strongholds.', goal: 10, points: 25, title: 'Siegebreaker', stat: (r) => r.strongholds },
  { id: 'veteran_100', cat: 'combat', name: 'Hardened', desc: 'Defeat 100 enemies on Veteran Threat or above.', goal: 100, points: 15, stat: (r) => (r.threat[1] ?? 0) + (r.threat[2] ?? 0) },
  { id: 'elite_250', cat: 'combat', name: 'Fearless', desc: 'Defeat 250 enemies on Elite Threat.', goal: 250, points: 25, title: 'the Fearless', stat: (r) => r.threat[2] ?? 0 },
  // ---------------------------------------------------------------- exploration
  { id: 'waystones_5', cat: 'exploration', name: 'Waymaker', desc: 'Attune 5 waystones.', goal: 5, points: 10, stat: (r, c) => c.attuned.size - 1 },
  { id: 'waystones_20', cat: 'exploration', name: 'Pathfinder', desc: 'Attune 20 waystones.', goal: 20, points: 20, title: 'Pathfinder', stat: (r, c) => c.attuned.size - 1 },
  { id: 'landmarks_5', cat: 'exploration', name: 'Sightseer', desc: 'Find 5 landmarks.', goal: 5, points: 10, stat: (r) => r.landmarks.length },
  { id: 'landmarks_all', cat: 'exploration', name: 'Wonders of the World', desc: 'Find a landmark of every kind.', goal: Object.keys(LANDMARKS).length, points: 25, title: 'the Wayfarer', stat: (r) => n(r.landmarkKinds) },
  { id: 'biomes_all', cat: 'exploration', name: 'Worldwalker', desc: 'Set foot in every biome.', goal: BIOMES.length, points: 20, title: 'Worldwalker', stat: (r) => n(r.biomes) },
  { id: 'region_20', cat: 'exploration', name: 'Far Reaches', desc: 'Reach a region of level 20.', goal: 20, points: 15, stat: (r) => r.regionLevel },
  { id: 'settlements_5', cat: 'exploration', name: 'Friendly Faces', desc: 'Visit 5 settlements.', goal: 5, points: 10, stat: (r) => r.settlements.length },
  { id: 'hamlets_10', cat: 'exploration', name: 'Off the Beaten Track', desc: 'Visit 10 hamlets.', goal: 10, points: 10, stat: (r) => placesOf(r, 'h') },
  { id: 'towns_5', cat: 'exploration', name: 'Walls and Gates', desc: 'Visit 5 towns.', goal: 5, points: 15, stat: (r) => placesOf(r, 'o') },
  { id: 'cities_4', cat: 'exploration', name: 'The Four Cities', desc: 'Visit New Meridian, Farcall, Ironreach and Anchorage.', goal: 4, points: 25, title: 'Citizen of the Four', stat: (r) => placesOf(r, 'y') },
  // ---------------------------------------------------------------- collections
  { id: 'legendary_1', cat: 'collections', name: 'Legendary', desc: 'Pick up a legendary.', goal: 1, points: 10, stat: (r) => r.legendaries },
  { id: 'legendary_10', cat: 'collections', name: 'Hoarder', desc: 'Pick up 10 legendaries.', goal: 10, points: 20, title: 'the Gilded', stat: (r) => r.legendaries },
  { id: 'fullset_1', cat: 'collections', name: 'Matching', desc: 'Wear all five pieces of a set.', goal: 1, points: 10, stat: (r) => n(r.fullSets) },
  { id: 'fullset_all', cat: 'collections', name: 'Outfitter', desc: 'Wear all five pieces of each of the seven makers\' sets.', goal: OPEN_SETS.length, points: 25, title: 'the Outfitted', stat: (r) => OPEN_SETS.filter((id) => r.fullSets[id]).length },
  { id: 'makers_all', cat: 'collections', name: 'Connoisseur', desc: 'Carry gear from all seven makers.', goal: MAKER_IDS.length, points: 15, stat: (r) => n(r.makers) },
  // ---------------------------------------------------------------- progression
  { id: 'level_10', cat: 'progression', name: 'Rising', desc: 'Reach level 10.', goal: 10, points: 10, stat: (r, c) => c.stats.level },
  { id: 'level_20', cat: 'progression', name: 'Veteran', desc: 'Reach level 20.', goal: 20, points: 15, stat: (r, c) => c.stats.level },
  { id: 'level_30', cat: 'progression', name: 'Paragon', desc: 'Reach level 30.', goal: 30, points: 25, title: 'Paragon', stat: (r, c) => c.stats.level },
  { id: 'capstone', cat: 'progression', name: 'Specialist', desc: 'Learn a capstone talent.', goal: 1, points: 15, stat: (r, c) => Object.keys(c.stats.talents).filter((id) => id.endsWith('_capstone')).length },
  { id: 'quests_10', cat: 'progression', name: 'Helping Hand', desc: 'Complete 10 quests.', goal: 10, points: 10, stat: (r) => r.quests },
  { id: 'quests_50', cat: 'progression', name: 'Folk Hero', desc: 'Complete 50 quests.', goal: 50, points: 20, title: 'Folk Hero', stat: (r) => r.quests },
  // ---------------------------------------------------------------- feats
  { id: 'combo_50', cat: 'feats', name: 'Bladedancer', desc: 'Reach a 50-hit melee combo.', goal: 50, points: 15, title: 'Bladedancer', stat: (r) => r.bestCombo },
  { id: 'multi_5', cat: 'feats', name: 'Massacre', desc: 'Defeat 5 enemies within 2 seconds.', goal: 5, points: 15, stat: (r) => r.bestMulti },
  { id: 'air_kill', cat: 'feats', name: 'Death From Above', desc: 'Defeat an enemy while in the air.', goal: 1, points: 10, stat: (r) => r.airKills },
];
export const ACHIEVEMENT = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));
export const TITLES = ACHIEVEMENTS.filter((a) => a.title);

// A fresh character's records.
export function newRecords() {
  return {
    kills: 0, race: {}, types: {}, variants: {}, typeAffixes: {}, elites: 0, champions: 0, bosses: {}, affixes: {}, threat: [0, 0, 0],
    warbands: 0, strongholds: 0, quests: 0, biomes: {}, landmarks: [], landmarkKinds: {}, settlements: [], regionLevel: 0, dungeons: {}, raids: {},
    events: {}, eventLead: 0,
    legendaries: 0, fullSets: {}, makers: {}, bestCombo: 0, bestMulti: 0, airKills: 0,
  };
}

// Records as saved, filled out to the current shape (and nothing else kept).
export function loadRecords(d) {
  const r = newRecords();
  if (!d || typeof d !== 'object') return r;
  for (const k of Object.keys(r)) {
    const v = d[k];
    if (typeof r[k] === 'number') r[k] = Number.isFinite(v) ? v : 0;
    else if (Array.isArray(r[k])) r[k] = Array.isArray(v) ? v.slice(0, 5000) : r[k];
    else if (v && typeof v === 'object' && !Array.isArray(v)) r[k] = { ...v };
  }
  return r;
}

export const progressOf = (a, records, core) => Math.min(a.goal, Math.max(0, a.stat(records, core) ?? 0));
export const pointsOf = (done) => Object.keys(done).reduce((s, id) => s + (ACHIEVEMENT[id]?.points ?? 0), 0);
