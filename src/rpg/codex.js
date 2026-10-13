// The codex (Journal › Codex): what a character has learned about the world. An enemy's entry
// opens with its first kill (its sub-types and the affixes its elites carried fill in as they're
// seen), a kind of landmark's when one is found, a maker's when you carry its gear. Everything it
// knows comes from the character's records (rpg/achievements.js).
export const BESTIARY = {
  // ---------------------------------------------------------------- the Scav clans
  cutter: {
    lore: 'The clans send their young in first, in plates cut from whatever didn\'t move fast enough. Cutters fight in swarms and take turns at you.',
    strengths: 'Quick, and many of them. Rippers hit half as hard again.',
    weaknesses: 'Light armour: anything that sweeps a wide arc cuts through a pack.',
  },
  breacher: {
    lore: 'A riot shield bolted together from hull plate, and a maul behind it. Breachers hold the clan\'s line and bash anyone who gets close.',
    strengths: 'The shield turns most of what hits it from the front.',
    weaknesses: 'Slow to turn: flank it, or blast it — explosions go round shields.',
  },
  grenadier: {
    lore: 'Clan bombers who mix their own charges, and not always to the recipe. They keep their distance and lob.',
    strengths: 'Their grenades are marked before they land, but they come in from range.',
    weaknesses: 'Fragile up close; the marked ground gives you time to move.',
  },
  tech: {
    lore: 'Every clan keeps a tech or two: the ones who can make the old shield emitters and repair rigs work.',
    strengths: 'Shields its friends, patches them up, and zaps you while it does.',
    weaknesses: 'Kill it first and the rest fall apart faster.',
  },
  juggernaut: {
    lore: 'A mining exo-suit with the safety limits torn out and a scav at the controls. Juggernauts are the clans\' heavy muscle.',
    strengths: 'A great deal of health, and blows that land like rockfalls.',
    weaknesses: 'Slow, and each swing is telegraphed: dash out and punish.',
  },
  warlord: {
    lore: 'A clan\'s chief, in a crimson exo-suit hung with the banners of the clans it beat. When it weakens it calls its cutters in.',
    strengths: 'Sweeping blows, a stomp that shakes the ground, and a horde behind it.',
    weaknesses: 'Its reinforcements come late: burst it down before then.',
  },
  // ---------------------------------------------------------------- the Hive
  drone: {
    lore: 'The Hive came down with the old ships and has been breeding ever since. Drones are its workers and its soldiers, with scythes for forelimbs.',
    strengths: 'Tough for their size. Bloaters burst into acid when they die.',
    weaknesses: 'Not quick: keep moving and fight them on your terms.',
  },
  spitter: {
    lore: 'A drone grown round a living cannon. Spitters hang back behind the scythes and spit acid; lancers fire spines that go through you.',
    strengths: 'Range, and acid that eats armour.',
    weaknesses: 'Close the gap and there\'s little to them.',
  },
  psion: {
    lore: 'Floating minds of the Hive, all skull and veins of light. They see through the swarm\'s eyes and blink away when you get close.',
    strengths: 'Homing psi orbs, and they teleport away from melee.',
    weaknesses: 'Fragile: guns and spells catch them where blades can\'t.',
  },
  praetorian: {
    lore: 'The Queen\'s guard: armoured duellists with bone blades and a shield of chitin. Champions lead the guard.',
    strengths: 'Blocks frontal blows and lunges across the gap.',
    weaknesses: 'Its guard drops while it attacks — strike after it does.',
  },
  queen: {
    lore: 'The heart of a nest: crowned in chitin, trailing her egg sac. Where a Queen lives, the Hive keeps coming.',
    strengths: 'A scream that corrodes everything near her, psi volleys, and broods on call.',
    weaknesses: 'Her scream is slow to build: be somewhere else when it lands.',
  },
  // ---------------------------------------------------------------- the Synths
  sentry: {
    lore: 'Patrol drones from a war nobody remembers ending. They still circle their posts, and they still shoot.',
    strengths: 'They fly, circling out of a blade\'s reach, and fire in bursts.',
    weaknesses: 'Thin shells: a few shots bring them down.',
  },
  stalker: {
    lore: 'A hunting chassis built to run down soldiers. Stalkers charge, blade first.',
    strengths: 'Charges from range that knock you flat.',
    weaknesses: 'A charge that hits a wall stuns it.',
  },
  bulwark: {
    lore: 'A siege platform on legs, with a mortar on its back. Bulwarks shell anything that moves and stamp on what gets close.',
    strengths: 'Long-range mortar fire and a heavy stomp.',
    weaknesses: 'Slow: get inside its range and stay mobile.',
  },
  colossus: {
    lore: 'A war engine the size of a house, still following orders from a command that has long gone silent.',
    strengths: 'Barrages, fans of fire, stomps — and sentries it deploys as it weakens.',
    weaknesses: 'It turns slowly: keep to its sides.',
  },
  // ---------------------------------------------------------------- the Wild
  hound: {
    lore: 'Six-legged pack hunters native to this world. Razorhounds circle their prey and dart in when it looks away.',
    strengths: 'Fast, and always in packs.',
    weaknesses: 'Fragile one at a time: keep your back to something.',
  },
  alpha: {
    lore: 'The biggest of a pack. When an alpha howls the whole pack frenzies.',
    strengths: 'Its howl makes the pack faster and fiercer.',
    weaknesses: 'Take it first and the pack loses its nerve.',
  },
  crawler: {
    lore: 'Scorpion-tailed ambushers that wait in the brush. They spit resin to slow you, then pounce.',
    strengths: 'Ambushes, sticky resin, a pouncing strike. Venom crawlers corrode.',
    weaknesses: 'Once found, they\'re no match for a straight fight.',
  },
  thunderhorn: {
    lore: 'Armour-shelled grazers that defend their herds by charging. The ground shakes when they come.',
    strengths: 'Charges that send you flying, and thick shells.',
    weaknesses: 'They charge in straight lines: step aside.',
  },
  behemoth: {
    lore: 'Old as the valleys and grown through with crystal. A behemoth rules the wild for miles around.',
    strengths: 'Mauling combos, charges, a rearing stomp, and its pack on call.',
    weaknesses: 'Every attack is broad and heavy: read it and it can be danced around.',
  },
};

// Kinds of landmark, as the codex tells them.
export const PLACES = {
  wreck: { name: 'Wrecks', lore: 'The ships that brought the first settlers — and, some say, the Hive — lie where they came down.' },
  skeleton: { name: 'Great Bones', lore: 'The bones of animals bigger than anything that lives now. Nobody knows what killed them.' },
  ring: { name: 'Rings', lore: 'Maker gates that hum when you stand in them. None has opened in living memory.' },
  titan: { name: 'Fallen Titans', lore: 'War machines larger than a Colossus, toppled and half-buried.' },
  monoliths: { name: 'Monoliths', lore: 'Standing stones of Maker glass, carved with writing nobody can read.' },
  spires: { name: 'Spires', lore: 'Needles of rock and crystal that sing when the wind is right.' },
  elder: { name: 'Elder Trees', lore: 'Trees older than the settlements, wider than a house, that the wild gives a wide berth.' },
  caps: { name: 'Giant Caps', lore: 'Mushrooms grown tall as towers on the spores of the fungal groves.' },
  array: { name: 'Arrays', lore: 'Listening dishes from before the war, still turned to the sky.' },
  arcology: { name: 'Arcologies', lore: 'Maker cities built to hold thousands. Empty now, mostly.' },
  arch: { name: 'Arches', lore: 'Stone bridges the wind cut, high over the badlands.' },
  statue: { name: 'Statues', lore: 'Figures of the Makers, or of what they wanted to be.' },
  vents: { name: 'Vents', lore: 'Fissures breathing heat from deep below, where the Makers drew their power.' },
  elevator: { name: 'Space Elevators', lore: 'A cable climbing out of sight. Where it goes, nobody has come back to say.' },
};

// What the codex says of each maker, beyond its gear's blurb.
export const MAKER_LORE = {
  frontier: 'The settlers\' own workshops: plain kit, made to be fixed in the field.',
  warden: 'The Wardens\' armoury, issuing the gear that holds the line between the settlements and everything else.',
  ironhide: 'The mining guilds, whose exo-plate was built for rock that fights back.',
  rustjaw: 'Scav workshops. Their guns are loud, fast, and mostly don\'t explode.',
  hivecraft: 'Weapons and armour grown from Hive chitin by harvesters who know the risks.',
  voltaic: 'Synth cores, gutted and rewired. Do not lick.',
  maker: 'Precursor relics from the vaults. Nobody knows how they work.',
};
