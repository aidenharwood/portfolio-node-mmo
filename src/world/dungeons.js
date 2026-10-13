// The dungeons (gameplay phase 5): rooms under the world, built far outside the playable land in a
// "pocket" of their own (world/Interior.js) and laid out from each dungeon's seed by
// world/DungeonGen.js. An open-world dungeon has one shared copy per layer of the realm, its
// enemies coming back like a camp's; any of them can also be run as a private copy for a party at a
// chosen tier (sim/Dungeons.js), with a reward chest at the end once a day per tier.
//
// The launch set follows the story: the Rustjaw Foundry (Ironjaw's fortress, Act I), the Sunken
// Vault (the seal he was digging out, opened at the end of Act I) and the Brood Pits (out past
// Farcall, for Act II). Two more themes — a Synth facility and a Wild cavern — are built by the
// same generator, for the dev panel and the checks, until dungeons of their own arrive.

// The grid every dungeon is laid out on, and the pockets they're built in.
export const CELL = 2;            // metres per grid cell
export const GRID = 128;          // cells per side of a dungeon's plot (256 m)
export const POCKET = { x: 60000, z: 60000, y: 300, gap: 400, row: 12 };
// Anything this far east is pocket space (no terrain, no world places): the land never gets here.
export const POCKET_MIN = 50000;
export const inPocket = (x) => x >= POCKET_MIN;
// A pocket slot's corner: the open-world copies take the first slots, private runs the rest.
export function pocketOrigin(slot) {
  return { x: POCKET.x + (slot % POCKET.row) * POCKET.gap, y: POCKET.y, z: POCKET.z + Math.floor(slot / POCKET.row) * POCKET.gap };
}
export const SHARED_SLOTS = 12;

// How long an empty copy waits before it closes (an open-world one starts over).
export const CLOSE_AFTER = 600;   // seconds
// How fast a lift's platform rides (m/s): the copy's keeper moves it, every screen follows.
export const LIFT_SPEED = 2.6;

// Looks and residents of each kind of place. `race`: whose enemies live there; colours for the
// kit (world/InteriorKit.js) and the light down there (world/DungeonView.js).
export const THEMES = {
  scav: {
    name: 'Scav bunker', race: 'scav', key: 'Gate-Key',
    floor: 0x45474c, floorEdge: 0x34363b, wall: 0x7d7a74, wallDark: 0x4a4744, trim: 0x8a5a3a, ceiling: 0x2a2826,
    metal: 0x5c6370, accent: 0xff8a2a, light: 0xffd2a8, glow: 0xffa040,
    fog: 0x120d09, hemi: [0xffe2c4, 0x2a1a10], hemiK: 0.75, sun: 0xffd8b0, sunK: 0.8,
  },
  hive: {
    name: 'Hive tunnels', race: 'hive', key: 'Resin Key',
    floor: 0x4a3a52, floorEdge: 0x382a40, wall: 0x6a4e78, wallDark: 0x42304e, trim: 0x8a6496, ceiling: 0x241a2c,
    metal: 0x6a5472, accent: 0xc46aff, light: 0xd8b0ff, glow: 0xb46aff,
    fog: 0x100a16, hemi: [0xe8ccff, 0x24142a], hemiK: 0.8, sun: 0xe0c0ff, sunK: 0.7, organic: true,
  },
  synth: {
    name: 'Synth facility', race: 'synth', key: 'Access Core',
    floor: 0xb8c0cc, floorEdge: 0x8a94a2, wall: 0xdfe4ea, wallDark: 0x9aa4b2, trim: 0x5c6370, ceiling: 0x6a7480,
    metal: 0x5c6370, accent: 0x3ad8ff, light: 0x9ae8ff, glow: 0x3ad8ff,
    fog: 0x0a1218, hemi: [0xd8f4ff, 0x1a2430], hemiK: 0.7, sun: 0xdff4ff, sunK: 0.8,
  },
  maker: {
    name: 'Maker vault', race: 'synth', key: 'Rune Key',
    floor: 0x4c4a5e, floorEdge: 0x383648, wall: 0x726e8c, wallDark: 0x4a4662, trim: 0x8e88ae, ceiling: 0x242232,
    metal: 0x5a5672, accent: 0x9a7aff, light: 0xd0c4ff, glow: 0x6ae8ff,
    fog: 0x0c0b16, hemi: [0xdcd4ff, 0x1a1426], hemiK: 0.85, sun: 0xd4ccff, sunK: 0.75,
  },
  fauna: {
    name: 'Wild cavern', race: 'fauna', key: 'Bone Key',
    floor: 0x6a6456, floorEdge: 0x544e44, wall: 0x847a66, wallDark: 0x5e5646, trim: 0x8e7e60, ceiling: 0x322e28,
    metal: 0x6a6456, accent: 0x6af0c8, light: 0xc0f8e8, glow: 0x6af0c8,
    fog: 0x0a1210, hemi: [0xd8f8ec, 0x1a2018], hemiK: 0.8, sun: 0xd0f4e8, sunK: 0.7, organic: true,
  },
};

// The dungeons. `level`: the open-world copy's level (a private run is at least the level of
// whoever starts it). `entrance`: the story place whose object is the way in (world/story.js).
// `open`: an open-world copy exists; `needs`: a story flag before anyone may go in.
export const DUNGEONS = {
  foundry: {
    id: 'foundry', name: 'The Rustjaw Foundry', theme: 'scav', level: 7, seed: 0x5f0d0a, open: true, entrance: 'foundry:gate',
    blurb: 'Ironjaw\'s fortress: a slag-black foundry sunk into the hill, where the scav clans melt down whatever they steal.',
    boss: { type: 'warlord', name: 'Ironjaw', tag: 'ironjaw' }, mini: { type: 'juggernaut', name: 'Slagmaw' },
  },
  vault: {
    id: 'vault', name: 'The Sunken Vault', theme: 'maker', level: 9, seed: 0x5e41a7, open: false, entrance: 'vault:door', needs: { flag: 'vault_open' },
    blurb: 'Behind the seal Ironjaw broke: the Makers\' halls, going down, and whatever they set to keep them.',
    boss: { type: 'colossus', name: 'The Seal Warden', tag: 'sealwarden' }, mini: { type: 'bulwark', name: 'Keeper of the Lower Door' },
  },
  brood: {
    id: 'brood', name: 'The Brood Pits', theme: 'hive', level: 13, seed: 0xb200d5, open: true, entrance: 'broodpits:mouth',
    blurb: 'Hive tunnels out past Farcall, chewed down through the rock to the nests — and the thing that lays in them.',
    boss: { type: 'queen', name: 'The Brood Matron', tag: 'matron' }, mini: { type: 'praetorian', name: 'The Gravid Guard' },
  },
  // The other two themes, for the dev panel and the checks.
  synthlab: {
    id: 'synthlab', name: 'Relay Station Kappa', theme: 'synth', level: 16, seed: 0x5717ab, open: false, dev: true,
    blurb: 'A Synth relay facility, still humming.',
    boss: { type: 'colossus', name: 'Overseer Kappa' }, mini: { type: 'bulwark', name: 'Bulwark Prime' },
  },
  caverns: {
    id: 'caverns', name: 'The Echoing Caverns', theme: 'fauna', level: 12, seed: 0xca7e55, open: false, dev: true,
    blurb: 'Crystal caves where the wild things den.',
    boss: { type: 'behemoth', name: 'The Old Bull' }, mini: { type: 'thunderhorn', name: 'Greyhorn' },
  },
};
export const LAUNCH = ['foundry', 'vault', 'brood'];

// The UTC day, for the reward chest's lockout (once a day per dungeon per tier).
export const lockDay = (ms = Date.now()) => Math.floor(ms / 86400000);
export const lockKey = (dungeon, tier) => `${dungeon}:${tier}`;
