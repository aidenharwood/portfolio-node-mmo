// Weapon naming.
//   base name   a model line from the weapon's frame — the component it's built around (a gun's
//               receiver, a blade's hilt, a haft, a staff's shaft, a launcher's tube, a crossbow's
//               prod, a codex's cover, an orb's shell) — plus the weapon type: two guns on the same
//               receiver share a line ("Talon Rifle", "Talon Pistol").
//   supplement  one word from what's fitted to it: the elemental core if it has one ("Caustic
//               Talon Rifle"), otherwise its most notable attachment ("Sniping Talon Rifle").
//   legendary   a name of its own, from its legendary power and its class ("Emberfang", "The
//               Ashen Verdict") — no model line, no supplement.
import { mulberry32, pick } from '../core/rng.js';
import { WEAPON_TYPES } from './weaponTypes.js';
import { FORMS } from './forms.js';
import { ELEMENTS } from './elements.js';

// The component each weapon type is named after.
const FRAME = {
  sword: 'guard', dagger: 'guard', greatsword: 'guard',
  axe: 'haft', spear: 'haft', hammer: 'haft',
  pistol: 'receiver', rifle: 'receiver', shotgun: 'receiver', smg: 'receiver', sniper: 'receiver',
  launcher: 'launcherTube', crossbow: 'limbs',
  wand: 'shaft', staff: 'shaft', scepter: 'shaft', tome: 'cover', orb: 'orbShell',
};

const MODEL_NAMES = {
  receiver: {
    block: ['Bastion', 'Anvil', 'Bulwark'], rounded: ['Comet', 'Nimbus', 'Halo'], angular: ['Talon', 'Raptor', 'Vector'],
    skeletal: ['Wraith', 'Lattice', 'Spindle'], boxy: ['Clunker', 'Hauler', 'Crate'],
  },
  guard: {
    bar: ['Warden', 'Sentinel', 'Paladin'], disc: ['Corona', 'Eclipse', 'Orbit'], heavy: ['Reactor', 'Ironclad', 'Colossus'],
    swept: ['Zephyr', 'Mistral', 'Arc'], winged: ['Seraph', 'Kestrel', 'Valkyr'], claw: ['Grasp', 'Clutch', 'Vise'],
  },
  haft: {
    straight: ['Vanguard', 'Striker', 'Lancer'], banded: ['Ironband', 'Cooper', 'Rivet'], wrapped: ['Bodger', 'Scrapper', 'Patchwork'],
    spiked: ['Thorn', 'Briar', 'Bramble'], bone: ['Vertebra', 'Spine', 'Segment'], twisted: ['Helix', 'Spiral', 'Torque'],
  },
  shaft: {
    straight: ['Beacon', 'Prism', 'Meridian'], twisted: ['Vortex', 'Helix', 'Spiral'], knotted: ['Relay', 'Junction', 'Node'],
    segmented: ['Circuit', 'Array', 'Cascade'], bone: ['Relic', 'Totem', 'Ossuary'],
  },
  launcherTube: { tube: ['Hammerfall', 'Siege', 'Mortar'], quad: ['Swarm', 'Hive', 'Quartet'], drum: ['Carousel', 'Roulette', 'Drumfire'] },
  limbs: { recurve: ['Swallow', 'Recurve', 'Kestrel'], compound: ['Tensor', 'Winch', 'Pulley'], heavy: ['Ballista', 'Rampart', 'Onager'] },
  cover: {
    plain: ['Primer', 'Ledger', 'Folio'], studded: ['Manifest', 'Charter', 'Bastion'], skull: ['Memento', 'Requiem', 'Elegy'],
    eye: ['Oracle', 'Augur', 'Seer'], gilded: ['Gospel', 'Aurum', 'Canticle'],
  },
  orbShell: { gyro: ['Gyre', 'Orrery', 'Gimbal'], shards: ['Splinter', 'Shatter', 'Shardstorm'], halo: ['Halo', 'Corona', 'Aureole'], eye: ['Iris', 'Watcher', 'Pupil'] },
};

// Legendary names: a word from the legendary power, a word from the weapon's class, in one of three
// shapes ("Emberfang", "The Ashen Verdict", "Squall's Oath").
const LEGEND_THEME = {
  cinderheart: { stem: ['Cinder', 'Ember', 'Pyre', 'Kiln', 'Scorch', 'Ash'], adj: ['Ashen', 'Burning', 'Smouldering', 'Molten'] },
  thunderwake: { stem: ['Thunder', 'Storm', 'Tempest', 'Squall', 'Volt', 'Sky'], adj: ['Rolling', 'Storming', 'Crackling', 'Riven'] },
  hungering: { stem: ['Hunger', 'Famine', 'Maw', 'Gorge', 'Leech', 'Glut'], adj: ['Starving', 'Ravenous', 'Gnawing', 'Hollow'] },
};
const LEGEND_FORM = {
  melee: { tail: ['fang', 'wake', 'heart', 'reaver', 'brand', 'edge'], noun: ['Oath', 'Reckoning', 'Requiem', 'Vigil'] },
  ranged: { tail: ['caller', 'maker', 'song', 'herald', 'bark', 'shot'], noun: ['Verdict', 'Sermon', 'Choir', 'Last Word'] },
  magic: { tail: ['crown', 'hymn', 'sigil', 'veil', 'psalm', 'mantle'], noun: ['Litany', 'Canticle', 'Eclipse', 'Covenant'] },
};

export function legendaryName(perkId, cls, rng) {
  const theme = LEGEND_THEME[perkId] ?? LEGEND_THEME.cinderheart;
  const form = LEGEND_FORM[cls] ?? LEGEND_FORM.melee;
  const shape = Math.floor(rng() * 3);
  if (shape === 0) return pick(rng, theme.stem) + pick(rng, form.tail);
  if (shape === 1) return `The ${pick(rng, theme.adj)} ${pick(rng, form.noun)}`;
  return `${pick(rng, theme.stem)}'s ${pick(rng, form.noun)}`;
}

// The model line a weapon's frame belongs to.
export function modelName(type, look, rng) {
  const kind = FRAME[type];
  const id = look?.[kind];
  const pool = MODEL_NAMES[kind]?.[id];
  if (pool) return pick(rng, pool);
  return FORMS[kind]?.[id]?.name.split(' ')[0] ?? WEAPON_TYPES[type].label;
}

// One supplementing word: the elemental core, else the most notable fitted part (the rarest;
// ties broken by the seed). Standard parts carry no word.
export function supplement(element, parts, rng) {
  if (element !== 'none') return ELEMENTS[element].prefix;
  const fitted = Object.values(parts).filter((p) => p.prefix);
  if (!fitted.length) return '';
  const top = Math.max(...fitted.map((p) => p.minTier ?? 0));
  return pick(rng, fitted.filter((p) => (p.minTier ?? 0) === top)).prefix;
}

// The type word in a name, where the plain label would clash with a supplement ("Sniping … Sniper").
const NOUN = { sniper: 'Longrifle' };

export function weaponName({ seed, type, look, parts, element, legendary }) {
  // A separate stream, so naming never shifts a weapon's rolled stats.
  const rng = mulberry32((seed ^ 0x6e616d65) >>> 0);
  const def = WEAPON_TYPES[type];
  if (legendary) return legendaryName(legendary, def.cls, rng);
  const base = `${modelName(type, look, rng)} ${NOUN[type] ?? def.label}`;
  const extra = supplement(element, parts, rng);
  return extra ? `${extra} ${base}` : base;
}
