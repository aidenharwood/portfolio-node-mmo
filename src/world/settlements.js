// The folk of every settlement world/Gen.js and world/places.js place — hamlets, villages, towns,
// the cities' districts and Brightwater's new ring: who they are, how they dress and what they
// say. The generator fixes where each stands and what they do (their role, a trader's stock: the
// server checks that much); the rest is dressing, made the same every time from their seed.
import { mulberry32 } from '../core/rng.js';
import { LOOK_OPTIONS } from '../models/heroLooks.js';
import { HAMLETS, DISTRICT_TITLE } from './places.js';
import { STORY_FOLK } from './story.js';

const FIRST = ['Ada', 'Bram', 'Cass', 'Dov', 'Esme', 'Finn', 'Gale', 'Hedda', 'Ira', 'Joss', 'Kit', 'Lio', 'Mara', 'Nils', 'Orla', 'Pip',
  'Quill', 'Rhea', 'Sol', 'Tamsin', 'Ugo', 'Vera', 'Wren', 'Yara', 'Zed', 'Amara', 'Bo', 'Casimir', 'Della', 'Emeka', 'Fen', 'Ines'];

export const KIND_TITLE = { homestead: 'Homestead', outpost: 'Frontier outpost', mining: 'Mining camp', caravan: 'Caravan', stilts: 'Fen village' };
export const HAMLET_TITLE = { farm: 'Farm hamlet', prospect: 'Prospectors\' hamlet', fen: 'Fen hamlet', nomad: 'Nomad camp' };

// What a place is, for banners and the map: "Fen village", "Town", "City · Market"…
export function placeTitle(p) {
  if (p.type === 'settlement') return KIND_TITLE[p.kind] ?? 'Village';
  if (p.type === 'hamlet') return HAMLET_TITLE[p.kind] ?? 'Hamlet';
  if (p.type === 'town' || p.type === 'hub') return 'Town';
  if (p.type === 'city') return `City · Act ${p.act}`;
  if (p.type === 'district') return DISTRICT_TITLE[p.kind] ?? 'District';
  return '';
}

// Which village kit's people a place's folk dress and talk like.
function kindOf(place) {
  if (place.type === 'hamlet') return HAMLETS[place.kind]?.outfit ?? 'homestead';
  if (place.type === 'town' || place.type === 'hub') return 'town';
  if (place.type === 'city') return 'city';
  if (place.type === 'district') return place.kind === 'gates' ? 'gates' : 'city';
  return place.kind;
}

const TITLES = {
  homestead: ['Farmer', 'Farmhand', 'Beekeeper', 'Herder'],
  outpost: ['Sentry', 'Ranger', 'Signals Officer', 'Medic'],
  mining: ['Miner', 'Foreman', 'Surveyor', 'Blaster'],
  caravan: ['Nomad', 'Outrider', 'Cook', 'Storyteller'],
  stilts: ['Fisher', 'Reedcutter', 'Boatwright', 'Eel Trapper'],
  town: ['Townsfolk', 'Carter', 'Watchman', 'Courier', 'Tinker', 'Lamplighter'],
  city: ['Citizen', 'Clerk', 'Porter', 'Engineer', 'Scholar', 'City Guard'],
  gates: ['Gate Guard', 'Gate Sergeant', 'Seal-keeper'],
};
// Those with a job for you: a hamlet's, and a village's (its side chain).
const HAMLET_GIVER = { farm: 'Farmer', prospect: 'Prospector', fen: 'Fen Elder', nomad: 'Nomad Elder' };
const VILLAGE_GIVER = { homestead: 'Farmer', mining: 'Foreman', outpost: 'Sergeant', caravan: 'Caravan Master', stilts: 'Fen Elder' };
const STORY_LINE = {
  chief: ['Careful where you step — every stone here is older than the city.', 'The Wardens pay us to dig. The scavs want to stop us digging. Makes you wonder what we\'re digging for.'],
  krell: ['I only kept his books. I never swung a hammer for him. Not once.', 'The vault... he talked of nothing else, at the end.'],
};
const TRADER_TITLE = { homestead: 'Produce Seller', outpost: 'Quartermaster', mining: 'Ore Broker', caravan: 'Caravan Trader', stilts: 'Swamp Peddler', town: 'Merchant', city: 'Merchant' };
const STOCK_TITLE = { weapons: 'Gunsmith', armor: 'Armourer' };

// Clothes by place: [top, top shade, trousers], plus hats and extras.
const OUTFITS = {
  homestead: { cloth: [[0x8a6a3a, 0x6a4a2a, 0x3a4a6a], [0x5a7a3a, 0x3a5a2a, 0x4a3a2a], [0xb0583a, 0x7a3a2a, 0x3a3a46]], hats: ['cap', null, null], apron: 0.3 },
  outpost: { cloth: [[0x4a5a4a, 0x2a3a2a, 0x2a2e36], [0x5a5f6a, 0x3a3f4a, 0x2a2e36], [0x6a6040, 0x4a4228, 0x3a3a3a]], hats: ['helmet', 'helmet', null], pauldrons: 0.6 },
  mining: { cloth: [[0xd9a227, 0x9a6a1a, 0x3a3a46], [0x8a5a3a, 0x5a3a26, 0x2a2e36], [0x5a6a7a, 0x3a4a5a, 0x3a3a3a]], hats: ['helmet', 'cap', null], goggles: 0.6 },
  caravan: { cloth: [[0xc0583a, 0x8a3a24, 0xd9c09a], [0x3a7ab0, 0x2a5a8a, 0xd9c09a], [0xd9a227, 0x9a6a1a, 0x6a4a2a]], hats: ['hood', null, 'hood'], cape: 0.4 },
  stilts: { cloth: [[0x4a6a5a, 0x2a4a3a, 0x3a3a2a], [0x6a5a4a, 0x4a3a2a, 0x3a3a2a], [0x3a5a6a, 0x2a3a4a, 0x2a2a2a]], hats: [null, 'hood', 'cap'] },
  town: { cloth: [[0x7a4a3a, 0x5a3426, 0x3a3a46], [0x3a5a7a, 0x2a4058, 0x3a3a3a], [0x8a7a4a, 0x645630, 0x4a3a2a], [0x5a3a6a, 0x3e2848, 0x2e2e36]], hats: ['cap', null, null, 'hood'], apron: 0.15 },
  city: { cloth: [[0x2a4a7a, 0x1e3458, 0x2a2e36], [0x7a2a3a, 0x561e28, 0x2e2e36], [0xd0c8b8, 0xa8a090, 0x3a3a46], [0x3a6a5a, 0x284a40, 0x2a2e36]], hats: [null, null, 'cap', null], cape: 0.25 },
  gates: { cloth: [[0x3a6a4a, 0x2a4a34, 0x2a2e36], [0x4a5060, 0x30343d, 0x2a2e36]], hats: ['helmet', 'helmet'], pauldrons: 0.9 },
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
  town: [
    'The walls went up after the raids. Best thing we ever built.',
    'Market\'s every day out here. Nobody can afford to wait for one.',
    'The inn\'s beds are hard, but the walls are thick.',
    'Patrols go out at dawn. Most days they all come back.',
    'The Wardens pin bounties on the board. Read it twice, sign once.',
    'Roads are safer near town. That\'s not saying much.',
  ],
  city: [
    'New faces every week. The city keeps spilling out past its walls.',
    'The gates in the yard are sealed. The Wardens say something waits below.',
    'Mind the clerks. Paperwork is the only thing out here deadlier than the wilds.',
    'They say the waystone in the plaza was here before the city. I believe it.',
    'The war table never sleeps. Someone\'s always planning the next push.',
    'Lost? The market\'s that way. Everything\'s for sale but a way home.',
  ],
  gates: [
    'Nothing\'s come through the seal. Nothing\'s gone in either. Yet.',
    'Stand back from the seal. It hums when you get close.',
    'When the Wardens open these, it\'ll be for an army, not a stroll.',
    'We watch the gates in shifts. The seal watches us back.',
  ],
};

const TRADER_LINE = {
  homestead: 'Fresh from the fields — and a few things that aren\'t. Take a look.',
  outpost: 'Requisitioned, surplus, slightly used. All of it works. Probably.',
  mining: 'Ore buys gear and gear buys ore. What have you got?',
  caravan: 'From every corner we\'ve crossed. Fair prices, mostly.',
  stilts: 'Dried, salvaged, dredged up. Everything\'s for sale but the boats.',
  town: 'Bit of everything, and fair prices. Have a look.',
  city: 'If it\'s made, mined or salvaged, it passes through this market sooner or later.',
};
const STOCK_LINE = {
  weapons: 'Rifles, blades, focus rods — the good stock\'s on the back rack, if you\'ve the gold for it.',
  armor: 'Plate, mesh and padding. It won\'t stop everything, but it\'ll stop the first thing. Ask about the fine pieces.',
};
const ROLE_LINE = {
  innkeeper: 'Warm beds, hot food, and the door\'s never locked. Rest here and this is where you\'ll wake if the road takes you down.',
  smith: 'Talents set wrong? I can strip you back to bare iron and you learn it all again — free for green hands, gold for the rest.',
};

// A person's name (the same everywhere: the quest log names givers with it too). Given their
// place, no two of its folk share one: each takes the name their seed picks, or the next free one
// along, in the place's own order.
const NAMELESS = new Set(['object', 'board', 'gate', 'warroom', 'story']);
const seedName = (n) => FIRST[Math.floor(mulberry32((n.seed ^ 0x5eed) >>> 0)() * FIRST.length)];
export function folkName(n, place = null) {
  if (!place?.npcs) return seedName(n);
  let names = place._names;
  if (!names) {
    names = new Map();
    const used = new Set();
    for (const m of place.npcs) {
      if (NAMELESS.has(m.role) || m.name) continue;
      let k = FIRST.indexOf(seedName(m));
      for (let t = 0; t < FIRST.length && used.has(FIRST[k]); t++) k = (k + 1) % FIRST.length;
      used.add(FIRST[k]);
      names.set(m.id, FIRST[k]);
    }
    Object.defineProperty(place, '_names', { value: names, enumerable: false });
  }
  return names.get(n.id) ?? seedName(n);
}

// The NPC definition (entities/NPC.js) for one of a place's folk.
export function settlementFolk(place, n) {
  // The story's own people (world/story.js): their names, looks and lines are fixed.
  const S = n.role === 'story' ? STORY_FOLK[n.folk] : null;
  if (S) {
    return {
      id: n.id, name: S.name, title: S.title, role: 'story', x: n.x, z: n.z, facing: n.facing, look: S.look,
      lines: STORY_LINE[n.folk] ?? ['...'], greeting: null,
    };
  }
  const rnd = mulberry32(n.seed >>> 0);
  const pick = (list) => list[Math.floor(rnd() * list.length)];
  const kind = kindOf(place);
  const O = OUTFITS[kind] ?? OUTFITS.homestead;
  let [top, topDark, pants] = pick(O.cloth);
  const role = n.role;
  if (role === 'warden') [top, topDark, pants] = [0x3a6a4a, 0x2a4a34, 0x2a2e36];
  const look = {
    skin: pick(LOOK_OPTIONS.skin), hair: pick(LOOK_OPTIONS.hair.slice(0, 5)), hairStyle: pick(['short', 'long', 'bun', 'bald', 'spiky']),
    eye: pick(LOOK_OPTIONS.eye), top, topDark, pants, trim: pick([0xd0d0d0, 0xf0c75e, 0xb0583a]),
    boots: 0x3a2a1a, leather: pick([0x5a3a26, 0x6a4a2a, 0x4a3a2a]), metal: 0xc9d1dc, glow: pick([0xffb347, 0x7aff9a, 0x6ae8ff]),
    hat: pick(O.hats), hatColor: topDark,
    curl: 0.35,
  };
  if (rnd() < 0.3) look.beard = look.hair;
  if (role === 'trader' || role === 'innkeeper' || rnd() < (O.apron ?? 0)) look.apron = pick([0x5a5f6a, 0x7a5a3a, 0x3a4a3a]);
  if (rnd() < (O.pauldrons ?? 0) || role === 'warden') look.pauldrons = true;
  if (rnd() < (O.goggles ?? 0) || role === 'smith') look.goggles = true;
  if (rnd() < (O.cape ?? 0)) look.cape = topDark;
  if (role === 'warden') Object.assign(look, { cape: 0x2a4a34, glow: 0x7aff9a, hat: rnd() < 0.5 ? 'helmet' : null });
  if (role === 'smith') Object.assign(look, { apron: 0x4a3020, hat: null, hairStyle: pick(['short', 'bald']) });
  if (role === 'innkeeper' && rnd() < 0.5) look.belly = true;
  const name = folkName(n, place);
  const stock = n.stock ?? 'all';
  const title = role === 'trader' ? (STOCK_TITLE[stock] ?? TRADER_TITLE[kind] ?? 'Trader')
    : role === 'warden' ? (place.type === 'district' || place.type === 'city' ? 'High Warden' : 'Post Warden')
      : role === 'innkeeper' ? 'Innkeeper'
        : role === 'smith' ? (place.type === 'district' ? 'Master Smith' : 'Smith')
          : role === 'giver' ? (place.type === 'hamlet' ? HAMLET_GIVER[place.kind] : VILLAGE_GIVER[place.kind]) ?? 'Settler'
            : pick(TITLES[kind] ?? TITLES.homestead);
  const lines = LINES[kind] ?? LINES.homestead;
  const start = Math.floor(rnd() * lines.length);
  return {
    id: n.id, name: n.name ?? (role === 'warden' ? `Warden ${name}` : name), title, role, stock, x: n.x, z: n.z, facing: n.facing, look,
    lines: [...lines.slice(start), ...lines.slice(0, start)],
    greeting: role === 'trader' ? (STOCK_LINE[stock] ?? TRADER_LINE[kind] ?? TRADER_LINE.town) : ROLE_LINE[role] ?? null,
  };
}
