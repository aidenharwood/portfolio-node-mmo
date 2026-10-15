// Raids (gameplay phase 7): instances for a raid group — two or three parties linked, up to twelve
// players (server/raidgroups.js) — or for a lone party or player, with scripted multi-phase bosses
// (combat/bosses.js, sim/BossScript.js). A raid is a dungeon to the instance manager
// (sim/Dungeons.js): a private copy in a pocket slot, laid out by world/DungeonGen.js from the
// raid's own route — halls of trash between its arenas — and run by sim/RaidRun.js: each arena's
// gate shuts behind the raid when its boss is pulled, and opens again if everyone falls (the boss
// resets) or when the encounter is beaten (its seal onward opens with it). Each arena has its own
// reward chest: once a week per raid, per encounter, per tier, for each character.
//
// They're entered at a city's raid gate (the gate yard, world/places.js), formed at its war table.
// The story opens each one (`needs: { flag }`): a raid member who has the flag takes the whole raid
// group (or, with none, their party) in, whatever anyone's level (DEC-4).
// Boss health and how many of each mechanic come (soaks, marks, adds) follow how many are in the
// fight; the tier is the run's Threat for everyone in it, as in a dungeon.
import { DUNGEONS, lockKey } from './dungeons.js';

export const RAID_SIZE = 12;          // players in one raid copy at most
export const RAID_GRID = 168;         // a raid's plot, cells per side (336 m: a pocket slot is 400)

export const RAIDS = {
  broodmother: {
    id: 'broodmother', raid: true, name: 'The Brood Mother', theme: 'hive', level: 16, seed: 0xb40d3a, size: RAID_SIZE,
    grid: RAID_GRID, open: false,
    // Act II's "The Gate Opens" (quest 11) opens it.
    needs: { flag: 'broodgate_open' },
    blurb: 'Under the Brood Pits, past where the tunnels have any right to go, the nests open into halls the size of cathedrals — and at the bottom of them, the thing that lays the Hive.',
    // The final boss, for whatever reads a dungeon's.
    boss: { type: 'broodmother', name: 'The Brood Mother' },
    route: [
      { kind: 'start', w: [8, 9], h: [8, 9], ceil: 6 },
      { kind: 'hall', w: [12, 13], h: [12, 13], ceil: 8, door: 'open', pack: [5, 7], elites: 1, drops: [0, 1.5] },
      { kind: 'arena', enc: 0, w: [18, 18], h: [18, 18], ceil: 12, door: 'gate', cor: [4, 5], drops: [0] },
      { kind: 'hall', w: [12, 13], h: [12, 13], ceil: 8, door: 'seal', sealFrom: true, pack: [6, 8], elites: 2, drops: [0, 1.5, 2.5] },
      { kind: 'arena', enc: 1, w: [19, 19], h: [19, 19], ceil: 12, door: 'gate', cor: [4, 5], drops: [0], pillars: true },
      { kind: 'hall', w: [11, 12], h: [11, 12], ceil: 8, door: 'seal', sealFrom: true, pack: [6, 8], elites: 2, drops: [1.5, 3] },
      { kind: 'arena', enc: 2, w: [22, 22], h: [22, 22], ceil: 14, door: 'gate', cor: [4, 5], drops: [0] },
    ],
    // `at`: [across, deep] in the arena as you come in (sim/BossScript.js scripts each one).
    encounters: [
      { id: 'warden', name: 'The Brood Warden', units: [{ type: 'broodwarden', script: 'warden', at: [0.5, 0.62] }] },
      {
        id: 'choir', name: 'The Psion Choir',
        units: [
          { type: 'choir', variant: 'sorrow', script: 'sorrow', at: [0.25, 0.7] },
          { type: 'choir', variant: 'rage', script: 'rage', at: [0.5, 0.82] },
          { type: 'choir', variant: 'sleep', script: 'sleep', at: [0.75, 0.7] },
        ],
        // One falls and the others sing louder.
        rally: { by: 1.3, say: 'The Choir\'s song swells — the others grow stronger!' },
      },
      { id: 'mother', name: 'The Brood Mother', units: [{ type: 'broodmother', script: 'mother', at: [0.5, 0.7] }] },
    ],
    // Raid-only gear (items/sets.js): what its chests can hold besides the theme's.
    set: 'broodbane',
  },
};
export const RAID_IDS = Object.keys(RAIDS);

// The week the reward chests lock for (from Monday 00:00 UTC; the epoch was a Thursday).
export const lockWeek = (ms = Date.now()) => Math.floor((ms - 4 * 86400000) / (7 * 86400000));
// When this week's lockouts end, in ms.
export const weekEnds = (ms = Date.now()) => (lockWeek(ms) + 1) * 7 * 86400000 + 4 * 86400000;
// An encounter's chest's lockout key (per raid, encounter and tier).
export const raidLockKey = (raid, enc, tier) => `${lockKey(raid, tier)}:${enc}`;

// A dungeon or a raid by its id (the instance manager runs both).
export const instanceDef = (id) => DUNGEONS[id] ?? RAIDS[id] ?? null;

// At a city's raid gate: the raids someone may go into. `sealed`: the story hasn't opened it to
// them; `locked`: sealed with nobody to take them in (`grouped`: they're in a raid group or a
// party, where one who has it opens it for all — the instance manager has the last word).
export function raidChoices(flags = {}, { dev = false, grouped = false } = {}) {
  return Object.values(RAIDS).map((r) => {
    const sealed = !dev && !!r.needs?.flag && !flags[r.needs.flag];
    return { def: r, sealed, locked: sealed && !grouped };
  });
}

// Why a raid's gate stays shut to someone.
export const sealedText = (def) => `${def.name}'s gate is sealed. The Wardens open it in the story — or go in with someone in your raid group or party who has.`;
