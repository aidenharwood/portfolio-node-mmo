// The folk of the settlements world/Gen.js places: who they are, how they dress and what they
// say. Gen fixes where each stands and whether one trades (the server needs that much); the rest
// is dressing, made the same every time from their seed.
import { mulberry32 } from '../core/rng.js';
import { LOOK_OPTIONS } from '../models/heroLooks.js';

const FIRST = ['Ada', 'Bram', 'Cass', 'Dov', 'Esme', 'Finn', 'Gale', 'Hedda', 'Ira', 'Joss', 'Kit', 'Lio', 'Mara', 'Nils', 'Orla', 'Pip',
  'Quill', 'Rhea', 'Sol', 'Tamsin', 'Ugo', 'Vera', 'Wren', 'Yara', 'Zed', 'Amara', 'Bo', 'Casimir', 'Della', 'Emeka', 'Fen', 'Ines'];

export const KIND_TITLE = { homestead: 'Homestead', outpost: 'Frontier outpost', mining: 'Mining camp', caravan: 'Caravan', stilts: 'Fen village' };

const TITLES = {
  homestead: ['Farmer', 'Farmhand', 'Beekeeper', 'Herder'],
  outpost: ['Sentry', 'Ranger', 'Signals Officer', 'Medic'],
  mining: ['Miner', 'Foreman', 'Surveyor', 'Blaster'],
  caravan: ['Nomad', 'Outrider', 'Cook', 'Storyteller'],
  stilts: ['Fisher', 'Reedcutter', 'Boatwright', 'Eel Trapper'],
};
const TRADER_TITLE = { homestead: 'Produce Seller', outpost: 'Quartermaster', mining: 'Ore Broker', caravan: 'Caravan Trader', stilts: 'Swamp Peddler' };

// Clothes by place: [top, top shade, trousers], plus hats and extras.
const OUTFITS = {
  homestead: { cloth: [[0x8a6a3a, 0x6a4a2a, 0x3a4a6a], [0x5a7a3a, 0x3a5a2a, 0x4a3a2a], [0xb0583a, 0x7a3a2a, 0x3a3a46]], hats: ['cap', null, null], apron: 0.3 },
  outpost: { cloth: [[0x4a5a4a, 0x2a3a2a, 0x2a2e36], [0x5a5f6a, 0x3a3f4a, 0x2a2e36], [0x6a6040, 0x4a4228, 0x3a3a3a]], hats: ['helmet', 'helmet', null], pauldrons: 0.6 },
  mining: { cloth: [[0xd9a227, 0x9a6a1a, 0x3a3a46], [0x8a5a3a, 0x5a3a26, 0x2a2e36], [0x5a6a7a, 0x3a4a5a, 0x3a3a3a]], hats: ['helmet', 'cap', null], goggles: 0.6 },
  caravan: { cloth: [[0xc0583a, 0x8a3a24, 0xd9c09a], [0x3a7ab0, 0x2a5a8a, 0xd9c09a], [0xd9a227, 0x9a6a1a, 0x6a4a2a]], hats: ['hood', null, 'hood'], cape: 0.4 },
  stilts: { cloth: [[0x4a6a5a, 0x2a4a3a, 0x3a3a2a], [0x6a5a4a, 0x4a3a2a, 0x3a3a2a], [0x3a5a6a, 0x2a3a4a, 0x2a2a2a]], hats: [null, 'hood', 'cap'] },
};

const LINES = {
  homestead: [
    'Soil out here grows anything if you keep the crawlers off it.',
    'The turbine sings when the wind turns. Means weather.',
    'We sell what we don\'t eat. Which is not much, some years.',
    'Saw lights over the ridge last night. Not ours.',
    'Wells are deep and the water\'s sweet. Help yourself.',
    'Raiders took the north field twice. Third time we had rifles.',
  ],
  outpost: [
    'Walls hold. Mostly. Keep your weapon where I can see it.',
    'Signals from the old arrays keep repeating. Nobody can read them.',
    'We patrol to the waystone and back. Further than that, you\'re on your own.',
    'Landing pad\'s for supply drops. Haven\'t had one in a month.',
    'If you\'re heading out, fill your canteen. The land lies about how close things are.',
    'The turrets bark at shadows. Better that than the other way round.',
  ],
  mining: [
    'The seam glows at night. Pretty, until it gets in your lungs.',
    'Drill bit wore through again. Third this season.',
    'Ore goes out on the crawlers, credits come back. Sometimes.',
    'Found something in the deep cut that wasn\'t rock. We sealed it.',
    'Keep off the conveyor. It doesn\'t stop for anyone.',
    'Every mountain has a heart. We just borrow a bit of it.',
  ],
  caravan: [
    'We never stay more than three nights. The land doesn\'t like it.',
    'Followed the old tether here. You can see it for days.',
    'Trade, stories, a seat by the fire — pick two.',
    'The dunes move. Maps don\'t. Trust the stars instead.',
    'There\'s a wreck out west older than the waystones. We don\'t camp near it.',
    'Sit, eat. Road\'s long and you look like you\'ve walked it.',
  ],
  stilts: [
    'Everything floats here, or it sinks. Mind your step.',
    'Eels are biting. So are the other things.',
    'Lanterns stay lit all night. Something out there doesn\'t like the light.',
    'Reeds make good roofs and bad walls.',
    'The old city\'s under the water, past the far posts. Don\'t dive there.',
    'Boats are for fishing. Not for leaving. Nobody leaves.',
  ],
};

const TRADER_LINE = {
  homestead: 'Fresh from the fields — and a few things that aren\'t. Take a look.',
  outpost: 'Requisitioned, surplus, slightly used. All of it works. Probably.',
  mining: 'Ore buys gear and gear buys ore. What have you got?',
  caravan: 'From every corner we\'ve crossed. Fair prices, mostly.',
  stilts: 'Dried, salvaged, dredged up. Everything\'s for sale but the boats.',
};

// The NPC definition (entities/NPC.js) for one of a settlement's folk.
export function settlementFolk(place, n) {
  const rnd = mulberry32(n.seed >>> 0);
  const pick = (list) => list[Math.floor(rnd() * list.length)];
  const O = OUTFITS[place.kind] ?? OUTFITS.homestead;
  const [top, topDark, pants] = pick(O.cloth);
  const trader = n.role === 'trader';
  const look = {
    skin: pick(LOOK_OPTIONS.skin), hair: pick(LOOK_OPTIONS.hair.slice(0, 5)), hairStyle: pick(['short', 'long', 'bun', 'bald', 'spiky']),
    eye: pick(LOOK_OPTIONS.eye), top, topDark, pants, trim: pick([0xd0d0d0, 0xf0c75e, 0xb0583a]),
    boots: 0x3a2a1a, leather: pick([0x5a3a26, 0x6a4a2a, 0x4a3a2a]), metal: 0xc9d1dc, glow: pick([0xffb347, 0x7aff9a, 0x6ae8ff]),
    hat: pick(O.hats), hatColor: topDark,
    curl: 0.35,
  };
  if (rnd() < 0.3) look.beard = look.hair;
  if (trader || rnd() < (O.apron ?? 0)) look.apron = pick([0x5a5f6a, 0x7a5a3a, 0x3a4a3a]);
  if (rnd() < (O.pauldrons ?? 0)) look.pauldrons = true;
  if (rnd() < (O.goggles ?? 0)) look.goggles = true;
  if (rnd() < (O.cape ?? 0)) look.cape = topDark;
  const lines = LINES[place.kind] ?? LINES.homestead;
  const start = Math.floor(rnd() * lines.length);
  return {
    id: n.id, name: pick(FIRST), title: trader ? TRADER_TITLE[place.kind] : pick(TITLES[place.kind] ?? TITLES.homestead),
    role: trader ? 'trader' : 'flavor', x: n.x, z: n.z, facing: n.facing, look,
    lines: [...lines.slice(start), ...lines.slice(0, start)], greeting: trader ? TRADER_LINE[place.kind] : null,
  };
}
