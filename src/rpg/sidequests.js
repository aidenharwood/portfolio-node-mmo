// Side quests: a handwritten chain for each kind of village (world/places.js dressVillage gives
// every village someone with a job — its 'giver' — and the objects its chain needs). A chain is
// three quests in order; each village offers its own run of it ("home" in a reference is that
// village: 'home:giver', 'home:camp' — the camp nearest it, 'home:next' — the nearest other
// village or town, 'home:rubble1' — one of its objects). Rewards grow with the character's level
// (`k`: how much of a level's worth). A quest with no `returnTo` completes where it's done.

export const SIDE_CHAINS = {
  homestead: {
    title: 'The Missing Child',
    quests: [
      {
        title: 'Pell\'s Tracks', k: 0.8, returnTo: null,
        offer: 'My girl Pell went after the goats at dusk and never came back. Her tracks go off toward {home:camp} — and that\'s where the noises come from, nights.',
        stages: [{ text: 'Follow Pell\'s tracks toward {home:camp}.', objectives: [{ type: 'goto', at: 'home:camp', r: 45, count: 1, text: 'Follow the tracks' }] }],
        turnIn: 'Pell\'s ribbon, snagged on the stakes by the camp. She\'s in there.',
      },
      {
        title: 'Into the Camp', k: 1.1, returnTo: null,
        offer: 'If she\'s in that camp... please. Please.',
        stages: [{ text: 'Clear {home:camp}.', objectives: [{ type: 'clear', camp: 'home:camp', count: 1, text: 'Clear {home:camp}' }] }],
        turnIn: 'From inside an upturned barrel, a small voice: "Is it safe now?"',
      },
      {
        title: 'Home Again', k: 1.2, returnTo: 'home:giver', item: true,
        offer: 'You found her? Bring her home. Bring her home.',
        stages: [{ text: 'Take Pell home.', objectives: [{ type: 'talk', npc: 'home:giver', count: 1, text: 'Bring Pell home' }] }],
        turnIn: 'Pell! You foolish, wonderful girl. — Thank you. Thank you. Take this; it\'s all we have that\'s worth anything.',
      },
    ],
  },
  mining: {
    title: 'Cave-In',
    quests: [
      {
        title: 'Dig Them Out', k: 1, returnTo: 'home:giver',
        offer: 'The new cut came down this morning with four of ours behind it. Get the rubble off the shafts — there, there and there — before the air goes.',
        stages: [{
          text: 'Clear the rubble from the shafts.',
          objectives: [
            { type: 'use', object: 'home:rubble1', count: 1, text: 'Clear the first shaft' },
            { type: 'use', object: 'home:rubble2', count: 1, text: 'Clear the second shaft' },
            { type: 'use', object: 'home:rubble3', count: 1, text: 'Clear the third shaft' },
          ],
        }],
        turnIn: 'Three of them out alive. The fourth... the fourth\'s still in there, past the deep cut. And something came up the cut after them.',
      },
      {
        title: 'What Broke In', k: 1.1, returnTo: null,
        offer: 'Whatever was down there has come up the cut and into the hills. Thin them out before they find the camp.',
        stages: [{ text: 'Thin out what came up the cut.', objectives: [{ type: 'killAny', near: 'home', r: 280, count: 10, text: 'Defeat creatures near {home}' }] }],
        turnIn: 'The things that came up out of the cut are thinned out, for now.',
      },
      {
        title: 'Seal the Deep Cut', k: 1.2, returnTo: 'home:giver', item: true,
        offer: 'Seal the deep cut. Whatever they found down there can stay down there.',
        stages: [{ text: 'Seal the deep cut.', objectives: [{ type: 'use', object: 'home:cut', count: 1, text: 'Set the charges on the deep cut' }] }],
        turnIn: 'Sealed. You\'ve done right by us — the whole seam knows your name tonight.',
      },
    ],
  },
  caravan: {
    title: 'The Long Road',
    quests: [
      {
        title: 'Scout Ahead', k: 0.9, returnTo: null,
        offer: 'We roll for {home:next} at first light, but the road\'s been bad. Walk it ahead of us — see it\'s clear.',
        stages: [{ text: 'Scout the road to {home:next}.', objectives: [{ type: 'goto', at: 'home:next', r: 40, count: 1, text: 'Reach {home:next}' }] }],
        turnIn: 'The road\'s clear as far as {home:next}. For now.',
      },
      {
        title: 'Ambush', k: 1.1, returnTo: null,
        offer: 'Riders on the ridge — they\'ve been watching the wagons all day. When they come, hold them off.',
        stages: [{ text: 'Defend the caravan.', objectives: [{ type: 'defend', at: 'home', waves: 2, count: 1, text: 'Hold the wagons' }] }],
        turnIn: 'The wagons are whole. Barely.',
      },
      {
        title: 'Goods Delivered', k: 1.2, returnTo: 'home:next-trader', item: true,
        offer: 'Take the manifest on to the trader at {home:next}. They\'ll pay — they always pay the one who brings the paper.',
        stages: [{ text: 'Deliver the manifest at {home:next}.', objectives: [{ type: 'talk', npc: 'home:next-trader', count: 1, text: 'Deliver the manifest' }] }],
        turnIn: 'From the caravan? About time. Tell them their credit\'s good here — and this is for your trouble.',
      },
    ],
  },
  outpost: {
    title: 'Signal Lost',
    quests: [
      {
        title: 'Repair the Relay', k: 1, returnTo: 'home:giver',
        offer: 'Our relay\'s been dead three days, and a patrol went out before it died. Get it working.',
        stages: [{ text: 'Repair the outpost\'s relay.', objectives: [{ type: 'use', object: 'home:relay', count: 1, text: 'Repair the relay' }] }],
        turnIn: 'Relay\'s up — and the first thing it caught was the patrol\'s distress beacon, still going, out in the wilds.',
      },
      {
        title: 'The Lost Patrol', k: 1.1, returnTo: 'home:giver',
        offer: 'They didn\'t make it, did they. Bring back their tags, at least — from whatever took them.',
        stages: [{ text: 'Recover the patrol\'s tags.', objectives: [{ type: 'collect', item: 'Patrol tags', from: { near: 'home', r: 450 }, chance: 0.4, count: 3, text: 'Recover the patrol\'s tags' }] }],
        turnIn: 'Three tags. Three good soldiers. Their names go on the wall tonight.',
      },
      {
        title: 'Hold the Wall', k: 1.2, returnTo: null, item: true,
        offer: 'Whatever killed the patrol followed the beacon here. They\'ll hit the wall tonight. Hold it with us.',
        stages: [{ text: 'Hold the outpost\'s wall.', objectives: [{ type: 'defend', at: 'home', waves: 3, count: 1, text: 'Hold the wall' }] }],
        turnIn: 'They\'ll think twice before they hit this wall again. The fort\'s yours whenever you need it.',
      },
    ],
  },
  stilts: {
    title: 'Lanterns in the Fen',
    quests: [
      {
        title: 'Relight the Lanterns', k: 1, returnTo: 'home:giver',
        offer: 'The marsh-lanterns went out in the storm, and something\'s been coming up out of the water since. Relight them — all three.',
        stages: [{
          text: 'Relight the marsh-lanterns.',
          objectives: [
            { type: 'use', object: 'home:lantern1', count: 1, text: 'Light the first lantern' },
            { type: 'use', object: 'home:lantern2', count: 1, text: 'Light the second lantern' },
            { type: 'use', object: 'home:lantern3', count: 1, text: 'Light the third lantern' },
          ],
        }],
        turnIn: 'Lit, all three. Now we\'ll see them coming.',
      },
      {
        title: 'The Night Things', k: 1.1, returnTo: null,
        offer: 'They come for the light. Stand with us when they do.',
        stages: [{ text: 'Hold the village.', objectives: [{ type: 'defend', at: 'home', waves: 2, count: 1, text: 'Hold the village' }] }],
        turnIn: 'The things from the water came for the light — and the light held.',
      },
      {
        title: 'Calm Water', k: 1.2, returnTo: 'home:giver', item: true,
        offer: 'It\'s quiet. First time in a month. Come and sit a while.',
        stages: [{ text: 'Return to the village.', objectives: [{ type: 'talk', npc: 'home:giver', count: 1, text: 'Return to the village' }] }],
        turnIn: 'The fen\'s calm, and the boats go out at dawn. Stay for supper, at least — and take this.',
      },
    ],
  },
};

// The objects each kind of village keeps for its chain (local bearing from its front, distance):
// world/places.js puts them in, world/Towns.js builds them.
export const VILLAGE_OBJECTS = {
  mining: [['rubble1', Math.PI - 0.62, 7.2, 'rubble'], ['rubble2', Math.PI + 0.62, 7.2, 'rubble'], ['rubble3', 1.6, 6.6, 'rubble'], ['cut', Math.PI, 8.8, 'cut']],
  outpost: [['relay', Math.PI, 8.4, 'relay']],
  stilts: [['lantern1', 1.55, 8.4, 'lantern'], ['lantern2', -1.55, 8.4, 'lantern'], ['lantern3', Math.PI + 0.42, 7.2, 'lantern']],
};
