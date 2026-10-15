// The story (docs/GAMEPLAY_PLAN.md: the Prologue and Act I, "Signal Fire"), as quests the quest log
// (rpg/Quests.js) runs: who gives each, what it needs first, its stages and their objectives, what
// people say at each stage, the choices that set story flags, and the moments (short skippable
// scenes, ui/Moments.js) it plays. Places and people are named by reference (world/story.js
// storyRef): 'warden' (Warden Maren), 'sage' (Old Ysolde), 'city1:warden' (New Meridian's High
// Warden), story places ('pilgrim', 'foundry', 'vault'…) and their objects ('vault:door'…).
// `{name}` in a line or objective is filled in from the world: {raided}, {relicdig}, {beacon1}…
//
// Objective types (all the quest log knows): talk · goto · use · kill (type, tag, race, near) ·
// killRace · killAny · clear (camp) · collect (quest drops) · defend (hold a place against waves) ·
// choose (answer someone) · attune · chest · dungeon (`d`: a world/dungeons.js id, beaten at any tier;
// `at`: its way in, for the waypoint).

export const ACTS = [
  { act: 0, title: 'Prologue', sub: 'The Last Sleeper', levels: '1–3' },
  { act: 1, title: 'Act I', sub: 'Signal Fire', levels: '3–8' },
  { act: 2, title: 'Act II', sub: 'The Brood', levels: '8–16' },
  // `partial`: an act whose quests are still being written (WORK_PLAN B-1 to B-5).
  { act: 3, title: 'Act III', sub: 'Iron Heart', levels: '16–24', partial: true },
];

// What the journal says once every quest there is has been played: the rest of an act still
// being written, or the next act, is still to come.
export const storyToldText = () => {
  const last = ACTS.at(-1);
  if (last.partial) return `The story so far is told. ${last.title} continues in a later update.`;
  return `The story so far is told. Act ${['I', 'II', 'III', 'IV', 'V'][last.act]} comes in a later update.`;
};

export const STORY = [
  // ---------------------------------------------------------------- Prologue
  {
    id: 'p1', kind: 'story', act: 0, level: 1, giver: 'warden', returnTo: 'sage', title: 'Cold Sleep',
    offer: 'So you\'re awake. Three nights ago Old Ysolde dragged you out of a sleeper pod in the old wreck — the only one still holding a pulse. Nobody sleeps that long, stranger. She\'ll want to see you on your feet.',
    stages: [{
      text: 'Find Old Ysolde in Brightwater.',
      objectives: [{ type: 'talk', npc: 'sage', count: 1, text: 'Talk to Old Ysolde' }],
      say: { sage: 'There you are — cold still in your bones, I\'d wager. It passes. Your pod had a name stencilled on the lid: unit seven, crew of the Pilgrim. The Pilgrim came down before my grandmother\'s grandmother was born.' },
    }],
    turnIn: 'Seven generations in a tin coffin, and you wake up hungry. That\'s a good sign. Go and see what Maren wants with you — she\'ll put you to work.',
    rewards: { xp: 60, gold: 20 },
  },
  {
    id: 'p2', kind: 'story', act: 0, level: 1, giver: 'warden', requires: ['p1'], returnTo: 'sage', title: 'A Blade for the Road',
    offer: 'Brightwater keeps its walls by keeping the wilds thin. Before I trust you past the gate, show me you can hold a blade — and that you\'re still holding it afterwards. Then go and tell Ysolde; she\'s been fretting over you like a hen.',
    stages: [
      { text: 'Thin out the wilds round Brightwater.', objectives: [{ type: 'killAny', near: 'hub', r: 340, count: 6, text: 'Defeat enemies near Brightwater' }] },
      { text: 'Clear the camp nearest Brightwater: {hubcamp}.', objectives: [{ type: 'clear', camp: 'hubcamp', count: 1, text: 'Clear {hubcamp}' }] },
    ],
    turnIn: 'Maren sent a runner ahead of you: "The sleeper will do." From her, dear, that\'s a speech. She left this for you, too — Warden issue, and better than what you came in with.',
    rewards: { xp: 160, gold: 60, weapon: { minTier: 1 } },
  },
  {
    id: 'p3', kind: 'story', act: 0, level: 1, giver: 'sage', requires: ['p1'], title: 'The Stone That Answered',
    offer: 'The waystone by the gate has hummed since the night you woke. Seventy years I\'ve listened to those stones, dear, and they\'ve never hummed for anybody. Go and lay your hand on it.',
    stages: [
      { text: 'Touch the Brightwater waystone.', objectives: [{ type: 'goto', at: 'hub:waystone', r: 4, count: 1, text: 'Touch the Brightwater waystone' }], done: { moment: 'voice' } },
      { text: 'Wake another waystone, out in the wilds.', objectives: [{ type: 'attune', count: 1, text: 'Attune a waystone' }] },
    ],
    turnIn: 'A voice? In the stone? ...Then the old stories are true, and you\'d best keep your wits about you. Here — something off my shelf.',
    setFlags: ['heard_pilgrim'],
    rewards: { xp: 160, gold: 50, armor: { minTier: 1 } },
  },
  {
    id: 'p4', kind: 'story', act: 0, level: 2, giver: 'sage', requires: ['p2', 'p3'], returnTo: 'warden', title: 'The Wreck of the Pilgrim',
    offer: 'If the stones know you, maybe the ship does too. The Pilgrim lies {pilgrim:dir} of here, nose-down in its own furrow; its old mind-core sat behind the bridge. Mind the scavengers — Ironjaw\'s lot have been picking the hull clean. And when you\'re back, tell Maren what you find: the wreck\'s the Wardens\' business as much as mine.',
    stages: [
      { text: 'Go to the Wreck of the Pilgrim.', objectives: [{ type: 'goto', at: 'pilgrim', count: 1, text: 'Reach the Wreck of the Pilgrim' }] },
      { text: 'Drive the scavengers off the wreck.', objectives: [{ type: 'defend', at: 'pilgrim', race: 'scav', waves: 2, count: 1, text: 'Hold the wreck' }] },
      { text: 'Search the bridge.', objectives: [{ type: 'use', object: 'pilgrim:console', count: 1, text: 'Wake the bridge console' }], done: { moment: 'manifest' } },
    ],
    turnIn: 'A wreck older than these walls, and it asked for you by name and rank. ...Whatever\'s waking out there, sleeper, it\'s waking through you. Then you\'d best be ready when it opens its eyes — and I\'ve work that\'ll see to that.',
    setFlags: ['pilgrim_awake'],
    rewards: { xp: 320, gold: 90, weapon: { minTier: 2 } },
  },

  // ---------------------------------------------------------------- Act I: Signal Fire
  {
    id: 'a1', kind: 'story', act: 1, level: 3, giver: 'warden', requires: ['p4'], title: 'Smoke on the Road', moments: { accept: 'act1' },
    offer: 'Smoke over {raided} since dawn. Scav raiders — and not the usual rabble; they knew what they came for. Go and see who\'s left.',
    stages: [
      { text: 'Go to {raided}.', objectives: [{ type: 'goto', at: 'raided', count: 1, text: 'Reach {raided}' }] },
      {
        text: 'Find someone who saw the raid.', objectives: [{ type: 'talk', npc: 'raided:survivor', count: 1, text: 'Talk to a survivor' }],
        say: { 'raided:survivor': 'They didn\'t want our stores. They went straight for the old stone in the well-house — Maker work, there since the founding. Their chief had a jaw of welded iron. The rest called him Ironjaw.' },
      },
      {
        text: 'Hunt the raiders, and find out where they were taking the stone.',
        objectives: [
          { type: 'killRace', race: 'scav', count: 8, text: 'Defeat scavs' },
          { type: 'collect', item: 'Raider orders', from: { race: 'scav' }, chance: 0.35, count: 3, text: 'Take the raiders\' orders' },
        ],
      },
    ],
    turnIn: '"Bring every Maker stone to the Foundry. — Ironjaw." A warlord with a shopping list. That\'s past a camp warden\'s say. This goes to the city.',
    setFlags: ['ironjaw_named'],
    rewards: { xp: 380, gold: 120, armor: { minTier: 1 } },
  },
  {
    id: 'a2', kind: 'story', act: 1, level: 4, giver: 'warden', requires: ['a1'], returnTo: 'city1:warden', title: 'Word to the City',
    offer: 'Take those orders to New Meridian, {city1:dir} of here — a fair walk. The High Warden there is Ashe. Tell her Maren sent you, and that it\'s Ironjaw. She\'ll know the name.',
    stages: [
      { text: 'Travel to New Meridian.', objectives: [{ type: 'goto', at: 'city1', r: 70, count: 1, text: 'Reach New Meridian' }], done: { moment: 'city' } },
      {
        text: 'Speak with High Warden Ashe in the citadel.', objectives: [{ type: 'talk', npc: 'city1:warden', count: 1, text: 'Speak with the High Warden' }],
        say: { 'city1:warden': 'Ironjaw. Of course it\'s Ironjaw. Three relic sites hit this month, and every one of them Maker work. Maren sent you? Then you\'re mine now, sleeper — Wardens\' business.' },
      },
    ],
    turnIn: 'Welcome to New Meridian. Find a bed at the inn — you\'ll want somewhere to wake that isn\'t a ditch.',
    setFlags: ['met_ashe'],
    rewards: { xp: 300, gold: 100 },
  },
  {
    id: 'a3', kind: 'story', act: 1, level: 4, giver: 'city1:warden', requires: ['a2'], title: 'Relic Hunters',
    offer: 'Our relic dig at {relicdig}, {relicdig:dir} of the city, has been hit twice. The third time they\'ll bring everything. Hold it — and find out what they\'re after.',
    stages: [
      { text: 'Reach the Warden relic dig.', objectives: [{ type: 'goto', at: 'relicdig', count: 1, text: 'Reach the relic dig' }] },
      { text: 'Hold the dig.', objectives: [{ type: 'defend', at: 'relicdig', race: 'scav', waves: 3, count: 1, text: 'Hold the relic dig' }] },
      {
        text: 'Talk to the dig chief.', objectives: [{ type: 'talk', npc: 'relicdig:chief', count: 1, text: 'Talk to Dig Chief Penn' }],
        say: { 'relicdig:chief': 'They weren\'t after us — they wanted this. A key, or half of one: Maker work, cut clean down the middle. Ironjaw has the other half. And a key means a door, somewhere.' },
      },
    ],
    turnIn: 'Half a key, and Ironjaw holding the other half. I don\'t like where this goes.',
    setFlags: ['key_half'],
    rewards: { xp: 460, gold: 140, weapon: { minTier: 1 } },
  },
  {
    id: 'a4', kind: 'story', act: 1, level: 5, giver: 'city1:warden', requires: ['a3'], title: 'Fire on the Hill',
    offer: 'We need eyes on the scav country. Light the old signal beacons — {beacon1} and {beacon2}. Every patrol between here and the hills will see them and muster.',
    stages: [
      {
        text: 'Light the signal beacons.',
        objectives: [
          { type: 'use', object: 'beacon1:fire', count: 1, text: 'Light {beacon1}' },
          { type: 'use', object: 'beacon2:fire', count: 1, text: 'Light {beacon2}' },
        ],
      },
      { text: 'Scavs saw the fires. Hold {beacon2}.', objectives: [{ type: 'defend', at: 'beacon2', race: 'scav', waves: 2, count: 1, text: 'Hold {beacon2}' }], done: { moment: 'signalfire' } },
    ],
    turnIn: 'There — see them? Every watchfire from here to the ridge, answering. Now we hunt.',
    setFlags: ['beacons_lit'],
    rewards: { xp: 520, gold: 160, armor: { minTier: 2 } },
  },
  {
    id: 'a5', kind: 'story', act: 1, level: 6, giver: 'city1:warden', requires: ['a4'], title: 'The Foundry Road',
    offer: 'The patrols found Ironjaw\'s forward post — the Rustjaw Outpost, {outpost:dir} of here — and past it the old foundry he\'s made his fortress. Break the outpost. They\'ll be holding a gate-pass; I want it.',
    stages: [
      { text: 'Clear the Rustjaw Outpost.', objectives: [{ type: 'clear', camp: 'outpost', count: 1, text: 'Clear the Rustjaw Outpost' }] },
      { text: 'Search the outpost for the gate-pass.', objectives: [{ type: 'use', object: 'outpost:chest', count: 1, text: 'Open the outpost\'s strongbox' }] },
    ],
    turnIn: 'A Rustjaw gate-pass, with Krell\'s mark on it — Ironjaw\'s lieutenant. With this, our sappers can get you through the Foundry gates.',
    setFlags: ['has_pass'],
    rewards: { xp: 560, gold: 180, weapon: { minTier: 2 } },
  },
  {
    id: 'a6', kind: 'story', act: 1, level: 7, giver: 'city1:warden', requires: ['a5'], title: 'Ironjaw',
    offer: 'Ironjaw\'s in the Foundry with the other half of that key. Go in through the gates and end him. Bring me whatever he was holding.',
    stages: [
      { text: 'Storm the Rustjaw Foundry.', objectives: [{ type: 'goto', at: 'foundry', r: 45, count: 1, text: 'Reach the Rustjaw Foundry' }], done: { moment: 'foundry' } },
      { text: 'Ironjaw holds the furnace hall under the yard. Go down into the Foundry and end him.', objectives: [{ type: 'kill', tag: 'ironjaw', count: 1, text: 'Defeat Ironjaw in the Foundry\'s depths' }], done: { moment: 'ironjaw' } },
      {
        text: 'Ironjaw\'s lieutenant has surrendered. Decide what becomes of him.',
        objectives: [{ type: 'choose', npc: 'foundry:krell', count: 1, text: 'Deal with Krell' }],
        say: { 'foundry:krell': 'Don\'t — I yield, I yield! I only kept his books. He was digging, out past the slag heaps. Said the Makers left a vault, and that key opens it. That\'s all I know, I swear it.' },
        choices: {
          npc: 'foundry:krell',
          options: [
            { label: 'Send him to New Meridian in chains', set: 'krell_captured', reply: '"Chains. Fine. Better than the slag pit." He holds out his wrists.' },
            { label: 'Let him go', set: 'krell_freed', reply: '"You — you\'ll not regret it. I won\'t forget this." He\'s over the wall before the dust settles.' },
          ],
        },
      },
    ],
    turnIn: { krell_captured: 'Ironjaw dead, and his bookkeeper in my cells. Good work, sleeper — the best this city\'s seen in a long while.', default: 'Ironjaw\'s dead. You let the lieutenant go? ...Out there, that\'s your call to make. Good work, sleeper.' },
    setFlags: ['ironjaw_fell'],
    rewards: { xp: 800, gold: 300, weapon: { minTier: 3 } },
  },
  {
    id: 'a7', kind: 'story', act: 1, level: 8, giver: 'city1:warden', requires: ['a6'], title: 'What He Was Digging For',
    offer: { krell_captured: 'Krell\'s been talking. Ironjaw\'s crews were digging out past the Foundry — {vault:dir} of it. He burned a village for the key to whatever\'s down there. Go and see, and take both halves.', default: 'Ironjaw\'s crews were digging out past the Foundry. He burned a village for the key to whatever\'s down there. Go and see — and take both halves.' },
    stages: [
      { text: 'Find Ironjaw\'s dig.', objectives: [{ type: 'goto', at: 'vault', count: 1, text: 'Find the dig' }] },
      { text: 'Drive off the last of Ironjaw\'s diggers.', objectives: [{ type: 'defend', at: 'vault', race: 'scav', waves: 2, count: 1, text: 'Clear the dig' }] },
      { text: 'Open the vault.', objectives: [{ type: 'use', object: 'vault:door', count: 1, text: 'Fit the key to the vault door' }], done: { moment: 'seal' } },
    ],
    turnIn: 'It opened? Then the Wardens seal that dig tonight, until we know what we\'ve let out. Go to Brightwater — Ysolde knows more of Maker work than every archivist I have.',
    setFlags: ['vault_open'],
    rewards: { xp: 900, gold: 320, armor: { minTier: 2 } },
  },
  {
    id: 'a8', kind: 'story', act: 1, level: 8, giver: 'city1:warden', requires: ['a7'], title: 'The Seal', moments: { done: 'act1end' },
    offer: 'Old Ysolde, in Brightwater. Tell her what you saw at the vault — all of it. Then come back and tell me what she makes of it.',
    stages: [{
      text: 'Tell Old Ysolde what you saw.',
      objectives: [{ type: 'choose', npc: 'sage', count: 1, text: 'Tell Ysolde what happened' }],
      say: { sage: 'A seal. Not a vault, dear — a seal. The Makers didn\'t build vaults. They built cages. And you\'ve turned the key in one. ...The voice, the one in the stones. Did it say anything when the door opened?' },
      choices: {
        npc: 'sage',
        options: [
          { label: 'Tell her the voice warned you', set: 'trusted_ysolde', reply: '"\'It was never a door. It was a lid.\' ...The Pilgrim\'s mind went into their network when it fell — I\'d bet my life on it. And it knows what\'s under there. Stay close to it, dear. And close to me."' },
          { label: 'Keep the voice to yourself', set: 'kept_secret', reply: '"Nothing? ...Well. Keep your secrets, then; everyone out here has a few. But if it speaks again, you come to me."' },
        ],
      },
    }],
    turnIn: 'A seal. A cage. Ysolde always did have the old words. Whatever comes up out of that hole, it\'ll come for the Wardens first and the stones second — and you\'re tied to both now. Rest, sleeper. You\'ve earned it.',
    setFlags: ['act1_done'],
    rewards: { xp: 1000, gold: 400, weapon: { minTier: 3 } },
  },

  // ---------------------------------------------------------------- Act II: The Brood
  {
    id: 'b1', kind: 'story', act: 2, level: 8, giver: 'city1:warden', requires: ['a8'], returnTo: 'city2:captain', title: 'The Road to Farcall', moments: { accept: 'act2' },
    offer: {
      krell_captured: 'Farcall\'s gone quiet — three weeks, not a word down the masts. And Krell\'s been talking in my cells: he says Ironjaw spoke of other "lids". I don\'t like that word any more. Go to Farcall, {city2:dir} of here, and find their captain of the watch.',
      default: 'Farcall\'s gone quiet — three weeks, not a word down the masts, and Farcall is nothing but masts. Go, {city2:dir} of here, and find their captain of the watch. Tell them the Wardens haven\'t forgotten them.',
    },
    stages: [
      { text: 'Travel to Farcall.', objectives: [{ type: 'goto', at: 'city2', count: 1, text: 'Reach Farcall' }] },
      {
        text: 'Find Farcall\'s captain of the watch.', objectives: [{ type: 'talk', npc: 'city2:captain', count: 1, text: 'Talk to Captain Vey Okonta' }],
        say: { 'city2:captain': 'Ashe sent you? Good. Then someone down there still reads what we send. We\'ve been calling for three weeks — the masts carry it, but nothing comes back. Something\'s sitting on the signal.' },
      },
    ],
    turnIn: 'The sleeper, in my watch room. Well. I asked for soldiers and they sent me a legend. I\'ll take it.',
    setFlags: ['act2_started'],
    rewards: { xp: 1100, gold: 420, armor: { minTier: 3 } },
  },
  {
    id: 'b2', kind: 'story', act: 2, level: 9, giver: 'city2:captain', requires: ['b1'], title: 'Gone Quiet',
    offer: 'Three hamlets out past the walls stopped answering the masts — {quiet1}, {quiet2} and {quiet3}. No smoke, no riders, no word. Go and see. And if you find something growing that shouldn\'t be, burn it.',
    stages: [
      {
        text: 'Find out what happened to the quiet hamlets.',
        objectives: [
          { type: 'goto', at: 'quiet1', count: 1, text: 'Reach {quiet1}' },
          { type: 'goto', at: 'quiet2', count: 1, text: 'Reach {quiet2}' },
          { type: 'goto', at: 'quiet3', count: 1, text: 'Reach {quiet3}' },
        ],
      },
      {
        text: 'Spore pods have taken root at {sporefield}. Burn them, and the Hive feeding off them.',
        objectives: [
          { type: 'use', object: 'sporefield:pod1', count: 1, text: 'Burn the first spore pod' },
          { type: 'use', object: 'sporefield:pod2', count: 1, text: 'Burn the second spore pod' },
          { type: 'use', object: 'sporefield:pod3', count: 1, text: 'Burn the third spore pod' },
          { type: 'killRace', race: 'hive', near: 'sporefield', count: 8, text: 'Hive at {sporefield}' },
        ],
        say: { 'sporefield:krell': 'You. Of course it\'s you. They hit my crew two nights back — came up out of the ground like the ground was theirs. They weren\'t hunting, sleeper. They were walking. Toward Farcall\'s masts, every one.' },
      },
    ],
    turnIn: 'One of the hamlet folk made it in an hour ago. Said the masts "started singing wrong" the night before the pods came up. I\'ve stood under those masts twenty years. They don\'t sing.',
    setFlags: ['hamlets_cleared'],
    rewards: { xp: 1250, gold: 460, weapon: { minTier: 3 } },
  },
  {
    id: 'b3', kind: 'story', act: 2, level: 10, giver: 'city2:captain', requires: ['b2'], title: 'Hold the Line',
    offer: 'The masts picked up movement under {quiet1} — a lot of it, coming up. They\'ll hit the hamlet before dawn. Get out there and hold it. Anyone with a blade who hears the call will come.',
    stages: [
      { text: 'The Hive is surging on {quiet1}. Hold it.', objectives: [{ type: 'event', event: 'surge', at: 'quiet1', count: 1, text: 'Hold {quiet1} against the surge' }] },
    ],
    turnIn: 'Held. Good. But here\'s what bothers me: the masts tracked the ones that got past you. They didn\'t scatter. They turned — all together, the same way, like they\'d heard their name called. Toward something out past the masts.',
    rewards: { xp: 1400, gold: 500, armor: { minTier: 3 } },
  },
  {
    id: 'b4', kind: 'story', act: 2, level: 11, giver: 'city2:captain', requires: ['b3'], returnTo: 'sage', title: 'The Farcall Array',
    offer: 'I followed the swarm\'s heading on the masts. It ends at the old Maker dish out past the city — the Array, we call it. Nobody goes there. Nobody\'s needed to. Go and see what\'s calling them, and if it has an off switch, find it.',
    stages: [
      { text: 'Follow the swarms to {array}.', objectives: [{ type: 'goto', at: 'array', count: 1, text: 'Reach {array}' }] },
      {
        text: 'The Array is calling the Hive. Power down its console while you hold them off.',
        objectives: [
          { type: 'use', object: 'array:console', count: 1, text: 'Power down the Array\'s console' },
          { type: 'defend', at: 'array', race: 'hive', waves: 2, count: 1, text: 'Hold {array}' },
        ],
        done: { moment: 'array' },
      },
    ],
    turnIn: 'Warden marks. On Maker work. ...Sit down, dear. No — sit. There\'s something I should have told you before I ever sent you to that vault.',
    setFlags: ['array_found'],
    rewards: { xp: 1550, gold: 540, weapon: { minTier: 3 } },
  },
  {
    id: 'b5', kind: 'story', act: 2, level: 11, giver: 'sage', requires: ['b4'], returnTo: 'city2:captain', title: 'Ysolde\'s Confession',
    offer: 'Hear an old woman out. Then decide what to do with what you hear.',
    stages: [{
      text: 'Hear Old Ysolde out.',
      objectives: [{ type: 'choose', npc: 'sage', count: 1, text: 'Hear Ysolde\'s confession' }],
      say: {
        sage: {
          trusted_ysolde: 'You told me about the voice. I owe you the same. The first Wardens weren\'t soldiers, dear. They were keepers. When the Hive got loose off the Pilgrim, they found that Maker dish and taught it a lullaby to keep the brood asleep — and locked its workings behind a seal, so no one could ever turn it. Open the seal, and the song turns to a call. I knew what the vault might be. I let you go anyway. I hoped I was wrong.',
          default: 'You saw the marks. I won\'t insult you. The first Wardens weren\'t soldiers, dear. They were keepers. When the Hive got loose off the Pilgrim, they found that Maker dish and taught it a lullaby to keep the brood asleep — and locked its workings behind a seal, so no one could ever turn it. Open the seal, and the song turns to a call. I knew what the vault might be. I let you go anyway. I hoped I was wrong.',
        },
      },
      choices: {
        npc: 'sage',
        options: [
          { label: 'Ashe has to know', set: 'told_ashe', reply: '"Yes. Yes, she does. The Wardens have been guarding a story they forgot the end of. Tell her — all of it. And tell her it was me who kept it."' },
          { label: 'Keep it between us', set: 'kept_wardens_secret', reply: '"Between us, then. I\'ll carry it a while longer. But we stop that song, you and I — whatever it costs me."' },
        ],
      },
    }],
    turnIn: {
      told_ashe: 'Ashe\'s word came down the masts ahead of you: what the Array is, and who the first Wardens were. Doesn\'t change the job, sleeper. It only tells me why it\'s ours to finish.',
      kept_wardens_secret: 'Back from Brightwater with a face like a shut door. Whatever the old woman told you, keep it — so long as it helps us silence that dish.',
      default: 'Back from Brightwater. Good: the swarms didn\'t wait for you.',
    },
    rewards: { xp: 1600, gold: 560, armor: { minTier: 3 } },
  },
  {
    id: 'b6', kind: 'story', act: 2, level: 12, giver: 'city2:captain', requires: ['b5'], title: 'Voice in the Chitin',
    offer: {
      told_ashe: 'Ashe sent word down the masts — I know what the Array is now, and what the Wardens were. Doesn\'t change the job. The swarms have a leader: a Psion, out at {psionnest}, {psionnest:dir} of here. Kill it, and bring me what\'s left of it.',
      default: 'The swarms have a leader. The masts can hear it — a Psion, out at {psionnest}, {psionnest:dir} of here, steering them like a hand on a rein. Kill it, and bring me what\'s left of it.',
    },
    stages: [
      { text: 'Find the Psion\'s nest.', objectives: [{ type: 'goto', at: 'psionnest', count: 1, text: 'Reach {psionnest}' }] },
      {
        text: 'Kill the Hive Psion and take its chitin.',
        objectives: [
          { type: 'kill', tag: 'psion', count: 1, text: 'Kill the Hive Psion' },
          { type: 'collect', from: { tag: 'psion' }, chance: 1, count: 1, text: 'Take the Psion\'s chitin' },
        ],
      },
    ],
    turnIn: 'Look at the grain of it. That\'s not a pattern, that\'s a map — tunnels. It was listening to the Array and passing the song on, down. The Brood Pits, {broodpits:dir} of here. That\'s where the song goes.',
    setFlags: ['psion_slain'],
    rewards: { xp: 1700, gold: 600, weapon: { minTier: 3 } },
  },
  {
    id: 'b7', kind: 'story', act: 2, level: 13, giver: 'city2:captain', requires: ['b6'], title: 'Into the Brood Pits',
    offer: 'The Pits go down further than anyone\'s walked. There\'s something at the bottom the brood calls Matron. Go down, and end it.',
    stages: [
      { text: 'Reach {broodpits}.', objectives: [{ type: 'goto', at: 'broodpits', count: 1, text: 'Reach {broodpits}' }] },
      { text: 'Go down through the Brood Pits and kill the Brood Matron.', objectives: [{ type: 'dungeon', d: 'brood', at: 'broodpits:mouth', count: 1, text: 'Clear the Brood Pits' }] },
    ],
    turnIn: 'You came back up. Not everyone who\'s gone into those tunnels can say that. What did you see at the bottom?',
    rewards: { xp: 1850, gold: 640, armor: { minTier: 3 } },
  },
  {
    id: 'b8', kind: 'story', act: 2, level: 14, giver: 'city2:captain', requires: ['b7'], title: 'What the Matron Knew',
    offer: 'There\'s a node by the mouth of the Pits — the brood grew it, like a root, toward the Array. If the Matron heard the call, that thing carried it. Read it.',
    stages: [
      { text: 'Read the nest-node at {broodpits}.', objectives: [{ type: 'use', object: 'broodpits:node', count: 1, text: 'Read the nest-node' }] },
      {
        text: 'Tell Captain Okonta what the node showed.', objectives: [{ type: 'talk', npc: 'city2:captain', count: 1, text: 'Report to Captain Okonta' }],
        say: { 'city2:captain': 'Deeper. The call doesn\'t stop at the Matron — it goes on down, to something bigger. A mother of mothers. And every hour that dish sings, it wakes a little more. Then we stop the singing. Tonight.' },
      },
    ],
    turnIn: 'I\'ll put every blade Farcall has on the road to the Array. You go in first.',
    setFlags: ['matron_read'],
    rewards: { xp: 2000, gold: 680, weapon: { minTier: 3 } },
  },
  {
    id: 'b9', kind: 'story', act: 2, level: 15, giver: 'city2:captain', requires: ['b8'], returnTo: 'city1:warden', title: 'Silence the Array',
    offer: 'The lullaby\'s gone. What\'s left is the call, and it won\'t turn back — I\'ve had the mast crews try. So we break it. Get to the transmitter under the dish and destroy it. We\'ll hold as long as we can.',
    stages: [
      { text: 'Return to {array}.', objectives: [{ type: 'goto', at: 'array', count: 1, text: 'Reach {array}' }] },
      { text: 'The whole brood is answering the call. Hold {array}.', objectives: [{ type: 'defend', at: 'array', race: 'hive', waves: 3, count: 1, text: 'Hold {array}' }] },
      { text: 'Destroy the transmitter.', objectives: [{ type: 'use', object: 'array:transmitter', count: 1, text: 'Destroy the Array\'s transmitter' }], done: { moment: 'deathpulse' } },
    ],
    turnIn: 'Every waystone between here and Farcall flashed red at once — the whole city saw it. Whatever you broke out there, sleeper, something heard it break.',
    setFlags: ['array_destroyed'],
    rewards: { xp: 2200, gold: 720, armor: { minTier: 3 } },
  },
  {
    id: 'b10', kind: 'story', act: 2, level: 15, giver: 'city1:warden', requires: ['b9'], title: 'Marshal the Wardens',
    offer: 'The Array\'s dead, but the brood isn\'t. Whatever lays them is still down there, and no one blade is going to reach it. Come to the war table. It\'s time the Wardens fought like an army.',
    stages: [{
      text: 'Join High Warden Ashe at the war table.',
      objectives: [{ type: 'talk', npc: 'city1:warden', count: 1, text: 'Talk to High Warden Ashe' }],
      say: {
        'city1:warden': {
          told_ashe: 'I read Ysolde\'s letter three times. Keepers. We were keepers, and we forgot. Well — we remember now, and every Warden at this table knows it. No more secrets. We go down together: raid groups, a dozen strong, gathered here at the war table.',
          kept_wardens_secret: 'Ysolde won\'t come to the table — she sent this instead. An old Warden seal; I\'ve never seen its like. Said you\'d know what it means. ...Fine. Keep your counsel. We go down together: raid groups, a dozen strong, gathered here at the war table.',
          default: 'We go down together: raid groups, a dozen strong, gathered here at the war table.',
        },
      },
    }],
    turnIn: 'Gather who you trust at the war table and they\'ll march with you. Now — the gate.',
    rewards: { xp: 2300, gold: 760, weapon: { minTier: 3 } },
  },
  {
    id: 'b11', kind: 'story', act: 2, level: 16, giver: 'city1:warden', requires: ['b10'], title: 'The Gate Opens',
    offer: 'The way down to the Brood Mother runs through the gate yard. It\'s been sealed since before I was born. Go and stand at it — I\'ll have it opened in your name.',
    stages: [{ text: 'Go to the raid gate in {city1}\'s gate yard.', objectives: [{ type: 'goto', at: 'city1:raidgate', r: 8, count: 1, text: 'Reach the raid gate' }] }],
    turnIn: 'It\'s open. Anyone who marches with you can go through it now. I won\'t pretend I like what\'s on the other side.',
    setFlags: ['broodgate_open'],
    rewards: { xp: 2400, gold: 800, armor: { minTier: 3 } },
  },
  {
    id: 'b12', kind: 'story', act: 2, level: 16, giver: 'city1:warden', requires: ['b11'], title: 'Report to Ashe', moments: { done: 'act2end' },
    offer: 'Before you go anywhere near that gate, tell me what you saw at the Array. All of it.',
    stages: [{
      text: 'Report to High Warden Ashe.',
      objectives: [{ type: 'talk', npc: 'city1:warden', count: 1, text: 'Report to High Warden Ashe' }],
      say: { 'city1:warden': 'Red, you said. Every stone, all at once. ...I had riders in from the highlands this morning. They say the old Maker machines up there are moving. Things that haven\'t moved in a thousand years.' },
    }],
    turnIn: 'The Brood Mother can wait for an army. The highlands won\'t wait at all. Rest while you can, sleeper.',
    setFlags: ['act2_done'],
    rewards: { xp: 2600, gold: 900, weapon: { minTier: 3 } },
  },

  // ---------------------------------------------------------------- Act III: Iron Heart
  // (docs/superpowers/specs/2026-10-15-act-iii-story-design.md; the lines are proposals.)
  {
    id: 'c1', kind: 'story', act: 3, level: 16, giver: 'city1:warden', requires: ['b12'], returnTo: 'city3:engineer', title: 'The Highland Road', moments: { accept: 'act3' },
    offer: {
      told_ashe: 'Ironreach\'s riders again — three this week. Their foundrywright has been pulling Synth wrecks apart for thirty years, and she says these ones are different. After what Ysolde told us, I believe her. Go to Ironreach, {city3:dir} of here, and find Isa Brannock.',
      default: 'Ironreach\'s riders again — three this week. Old Maker machines walking the highlands, and their foundrywright says she knows why. Go to Ironreach, {city3:dir} of here, and find Isa Brannock. If anyone alive can read a Synth, it\'s her.',
    },
    stages: [
      { text: 'Travel to Ironreach.', objectives: [{ type: 'goto', at: 'city3', count: 1, text: 'Reach Ironreach' }] },
      {
        text: 'Find Ironreach\'s foundrywright.', objectives: [{ type: 'talk', npc: 'city3:engineer', count: 1, text: 'Talk to Isa Brannock' }],
        say: { 'city3:engineer': 'Ashe\'s sleeper. Good — I asked for you by name. Don\'t look so surprised. Every Synth I\'ve cut open this month had the same thing in its head: a heading. They\'re all walking the same way, and they\'re walking toward wherever you\'ve been.' },
      },
    ],
    turnIn: 'Sit. Not there, that\'s still hot. ...Right. Let me show you what I mean.',
    setFlags: ['act3_started'],
    rewards: { xp: 2800, gold: 950, armor: { minTier: 3 } },
  },
  {
    id: 'c2', kind: 'story', act: 3, level: 17, giver: 'city3:engineer', requires: ['c1'], title: 'Iron Footsteps',
    offer: 'Scouts — the light Synths, sentries mostly — have been circling {ironstone} for three days. Not attacking. Scanning. Every waystone answers you, so the riders say. Go and see what they want with that one. Then make them stop wanting it.',
    stages: [
      { text: 'Go to {ironstone}.', objectives: [{ type: 'goto', at: 'ironstone', count: 1, text: 'Reach {ironstone}' }] },
      { text: 'Synth scouts are closing on the stone. Drive them off.', objectives: [{ type: 'defend', at: 'ironstone', race: 'synth', waves: 2, count: 1, text: 'Drive the Synth scouts off {ironstone}' }] },
    ],
    turnIn: 'Scanning, then shooting. They weren\'t after the stone, sleeper — they were checking it for you. It answers you, and they want to know where you\'ve been. Every stone you\'ve woken is a footprint.',
    rewards: { xp: 2900, gold: 980, weapon: { minTier: 3 } },
  },
  {
    id: 'c3', kind: 'story', act: 3, level: 18, giver: 'city3:engineer', requires: ['c2'], title: 'The Walker',
    offer: 'One of the big ones is walking. A war-walker — nine metres of it — coming down the old road toward {ironhamlet}. Thirty years I\'ve wanted to see one move. I\'d rather it wasn\'t toward people. Stop it before it gets there.',
    stages: [
      { text: 'A war-walker is marching on {ironhamlet}. Bring it down.', objectives: [{ type: 'event', event: 'walker', at: 'ironhamlet', count: 1, text: 'Stop the war-walker before it reaches {ironhamlet}' }] },
    ],
    turnIn: 'I had the wreck dragged in. Its legs were still trying to walk when we got it here — and every time we turned it round, it turned back. Not toward {ironhamlet}. Toward you.',
    rewards: { xp: 3100, gold: 1020, armor: { minTier: 3 } },
  },
  {
    id: 'c4', kind: 'story', act: 3, level: 18, giver: 'city3:engineer', requires: ['c3'], returnTo: 'sage', title: 'Words from the Stone',
    offer: 'The stone at {ironstone} has been humming since the walker fell. Not its own hum — I\'ve listened to that one all my life. Something else is on the line. Go and put your hand on it. I\'ll be listening from here.',
    stages: [
      { text: 'Lay your hand on {ironstone}.', objectives: [{ type: 'goto', at: 'ironstone', r: 4, count: 1, text: 'Touch {ironstone}' }], done: { moment: 'emissary' } },
      {
        text: 'Tell Isa what the stone said.', objectives: [{ type: 'talk', npc: 'city3:engineer', count: 1, text: 'Report to Isa Brannock' }],
        say: { 'city3:engineer': '"Surrender the carrier." ...It means you, sleeper. Not the stones, not the Wardens. You. Whatever\'s riding in your head, they think it\'s a sickness — and they think they\'re the cure. Go and see the old woman in Brightwater. If anyone knew you were coming, it\'s her.' },
      },
    ],
    turnIn: 'The machines came for you? ...Sit down, dear. In seventy years of listening to those stones I\'ve heard your voice speak once. I think it\'s time it spoke for itself.',
    setFlags: ['synth_orders_known'],
    rewards: { xp: 3200, gold: 1060, weapon: { minTier: 3 } },
  },
  {
    id: 'c5', kind: 'story', act: 3, level: 19, giver: 'sage', requires: ['c4'], returnTo: 'city3:engineer', title: 'What the Voice Wants',
    offer: {
      told_ashe: 'Ashe wrote to me. She knows what the Wardens were now, and she asks what else I kept. This is the last of it, dear: I don\'t know what rides in your head. But I know where it first spoke to you.',
      kept_wardens_secret: 'We\'ve kept one secret between us already. Here\'s the end of mine, dear: I don\'t know what rides in your head. But I know where it first spoke to you.',
      default: 'I don\'t know what rides in your head, dear. Nobody does. But I know where it first spoke to you.',
    },
    stages: [
      {
        text: 'Hear Old Ysolde out.', objectives: [{ type: 'talk', npc: 'sage', count: 1, text: 'Talk to Old Ysolde' }],
        say: { sage: 'The machines want it cut out of you. Before anyone decides that — you, me, Ashe, the Synths — we ought to hear what it has to say for itself. Go to the stone by the gate.' },
      },
      { text: 'Lay your hand on the Brightwater waystone.', objectives: [{ type: 'goto', at: 'hub:waystone', r: 4, count: 1, text: 'Touch the Brightwater waystone' }], done: { moment: 'plea' } },
    ],
    turnIn: 'Back again. You\'ve the look of someone who\'s been arguing with their own head. Did it make its case? Good. Mine\'s simpler: I want to know who built the thing that wants you dead. And I know where to start.',
    rewards: { xp: 3300, gold: 1100, armor: { minTier: 3 } },
  },
  {
    id: 'c6', kind: 'story', act: 3, level: 19, giver: 'city3:engineer', requires: ['c5'], title: 'The Fallen Titan',
    offer: 'There\'s a titan down on its knees {titan:dir} of here — the biggest Synth there ever was, dead since before Ironreach had a wall. We built half the city out of what we cut off its kin. Its core\'s never been touched: too deep, too hot. Now Synth salvagers are stripping it, and they\'re going for the core. Get there first.',
    stages: [
      { text: 'Go to {titan}.', objectives: [{ type: 'goto', at: 'titan', count: 1, text: 'Reach {titan}' }], done: { moment: 'titan' } },
      { text: 'The salvagers\' rig stands just beyond the Titan. Drive them off.', objectives: [{ type: 'clear', camp: 'salvage', count: 1, text: 'Clear {salvage}' }] },
      { text: 'Pull the Titan\'s core from its housing.', objectives: [{ type: 'use', object: 'titan:core', count: 1, text: 'Pull the Titan\'s core' }] },
    ],
    turnIn: 'Still warm. Dead since the old war, and still warm. Help me get it into the cradle — gently. I\'ve waited my whole life to open one of these.',
    setFlags: ['titan_core_taken'],
    rewards: { xp: 3400, gold: 1140, weapon: { minTier: 3 } },
  },
  {
    id: 'c7', kind: 'story', act: 3, level: 20, giver: 'city3:engineer', requires: ['c6'], title: 'Reading the Core',
    offer: 'My yard\'s just outside the walls; the cradle\'s ready. Set the core in it and wake it — and when you do, every Synth for a mile will hear it, calling for help the only way it knows. Hold the yard while it boots, and we\'ll see what it remembers.',
    stages: [
      { text: 'Set the Titan\'s core in the cradle at {yard} and wake it.', objectives: [{ type: 'use', object: 'yard:cradle', count: 1, text: 'Wake the Titan\'s core' }] },
      { text: 'Synths are homing in on the core. Hold the yard while it boots.', objectives: [{ type: 'defend', at: 'yard', race: 'synth', waves: 3, count: 1, text: 'Hold {yard}' }], done: { moment: 'coreread' } },
    ],
    turnIn: '"Containment held. Origin unknown." It wasn\'t fighting us when it fell, sleeper. It was keeping something out of the network — long before the Pilgrim came down. Your voice isn\'t the first to get in. I want to know who was — and I want to know where they make these things.',
    rewards: { xp: 3600, gold: 1200, armor: { minTier: 3 } },
  },
  {
    id: 'c8', kind: 'story', act: 3, level: 21, giver: 'city3:engineer', requires: ['c7'], title: 'The Foundry Below',
    offer: 'The core gave up more than its log. Its access codes open a hatch {foundrybelow:dir} of here that nobody in Ironreach has ever got through — the way down to where they make them. The Foundry Below. Go down, find whatever runs it, and stop it. And bring me anything that looks like plans.',
    stages: [
      { text: 'Reach the hatch at {foundrybelow}.', objectives: [{ type: 'goto', at: 'foundrybelow', count: 1, text: 'Reach {foundrybelow}' }] },
      { text: 'Go down through the Foundry Below and stop what runs it.', objectives: [{ type: 'dungeon', d: 'foundrybelow', at: 'foundrybelow:hatch', count: 1, text: 'Clear the Foundry Below' }] },
    ],
    turnIn: 'A whole line, still running. Still building. For orders no one alive ever gave. ...What did you bring up? Let me see.',
    setFlags: ['foundry_below_cleared'],
    rewards: { xp: 3800, gold: 1260, weapon: { minTier: 3 } },
  },
];

// Short scenes, played on screen when a quest asks (ui/Moments.js): a few shots, each a camera
// (`from`, relative to the anchor; `look` at the anchor plus `lift`) held for `t` seconds while
// lines are spoken. Anchors are story references, or 'player'.
export const MOMENTS = {
  wake: {
    at: 'hub', shots: [
      { from: [-26, 16, 30], lift: 2, t: 5, line: ['Old Ysolde', 'Easy, sleeper. Easy. You\'ve been under a long, long time.'] },
      { from: [7, 3, 9], at: 'player', lift: 1.5, t: 5, line: ['Warden Maren', 'So the wreck\'s ghost walks. Get them on their feet, Ysolde — then send them to me.'] },
    ],
  },
  voice: {
    at: 'hub:waystone', shots: [
      { from: [3.2, 2.6, 4.2], lift: 2.4, t: 4.5, line: ['???', '...unit seven... unit seven, respond...'] },
      { from: [-4, 3.4, 2.4], lift: 2.2, t: 5, line: ['The Pilgrim', 'The network is waking, seven. So are you.'] },
    ],
  },
  manifest: {
    at: 'pilgrim:console', shots: [
      { from: [2.4, 2.2, 2.6], lift: 1.2, t: 5, line: ['Console', 'CREW MANIFEST — PILGRIM. UNIT 7: SLEEPER. STATUS: AWAKE.'] },
      { from: [-9, 7, 10], lift: 2, t: 5.5, line: ['The Pilgrim', 'There you are. Listen to me, seven: something is digging where it should not. Find it — before it finds the door.'] },
    ],
  },
  act1: {
    at: 'player', title: ['Act I', 'Signal Fire'], shots: [
      { from: [8, 6, 10], lift: 1.6, t: 5, line: ['Warden Maren', 'Smoke over the road. Scavengers hit a village west of here — go and see who made it out.'] },
    ],
  },
  city: {
    at: 'city1', title: ['New Meridian', 'The settlers\' capital'], shots: [
      { from: [70, 42, 96], lift: 4, t: 6, line: null },
    ],
  },
  signalfire: {
    at: 'beacon2', shots: [
      { from: [9, 6, 12], lift: 5, t: 5, line: ['High Warden Ashe', 'They\'ve seen it. Every watchfire to the ridge is answering.'] },
    ],
  },
  foundry: {
    at: 'foundry', shots: [
      { from: [36, 22, 44], lift: 3, t: 6, line: ['Ironjaw', 'Settler meat! You\'ve brought me the other half of my key? No? Then I\'ll cut it out of your hide!'] },
    ],
  },
  ironjaw: {
    at: 'player', shots: [
      { from: [5, 3, 6], lift: 1.4, t: 5.5, line: ['Ironjaw', 'You think... you\'ve won? The door\'s... already... cracked...'] },
    ],
  },
  seal: {
    at: 'vault:door', title: ['The Seal is Broken', ''], shots: [
      { from: [0, 3, 10], lift: 3, t: 4.5, line: ['The Pilgrim', 'No — seven, wait—'] },
      { from: [-12, 10, 16], lift: 2, t: 6, line: ['The Pilgrim', '...Too late. It was never a door. It was a lid.'] },
    ],
  },
  act2: {
    at: 'player', title: ['Act II', 'The Brood'], shots: [
      { from: [8, 6, 10], lift: 1.6, t: 5.5, line: ['High Warden Ashe', 'Farcall\'s masts have gone silent. Whatever came out of that vault, I\'d wager it went that way.'] },
    ],
  },
  array: {
    at: 'array', title: ['The Farcall Array', ''], shots: [
      { from: [6, 4, 9], lift: 2.5, t: 5, line: ['', 'Warden sigils, welded onto Maker machinery — old, and deliberate.'] },
      { from: [-14, 12, 18], lift: 4, t: 6, line: ['The Pilgrim', 'They built a lullaby. You woke it screaming.'] },
    ],
  },
  deathpulse: {
    at: 'array', title: ['The Array Falls Silent', ''], shots: [
      { from: [-10, 9, 14], lift: 4, t: 5, line: ['', 'Down the network, waystone after waystone flickers red.'] },
      { from: [24, 18, 30], lift: 6, t: 6, line: ['', 'And far off, in the highlands, something made of metal answers.'] },
    ],
  },
  act2end: {
    at: 'player', title: ['Act II complete', 'The Brood'], shots: [
      { from: [8, 5, 10], lift: 1.6, t: 6, line: ['', 'The Array is silent, the Brood Mother\'s gate stands open — and in the highlands, the Makers\' guardians are waking.'] },
    ],
  },
  act3: {
    at: 'player', title: ['Act III', 'Iron Heart'], shots: [
      { from: [8, 6, 10], lift: 1.6, t: 5.5, line: ['High Warden Ashe', 'The Maker machines in the highlands are walking. Ironreach has the one woman alive who can read them. Go to her.'] },
    ],
  },
  emissary: {
    at: 'ironstone', title: ['The Emissary', ''], shots: [
      { from: [3.2, 2.6, 4.2], lift: 2.4, t: 4.5, line: ['', 'The stone\'s light drains from blue to a hard, cold white.'] },
      { from: [-4, 3.4, 2.4], lift: 2.2, t: 6, line: ['Synth Emissary', 'A TERMINATION PULSE WOKE US. ITS SOURCE: A FOREIGN PROCESS IN THE NETWORK. CARRIER IDENTIFIED. SURRENDER THE CARRIER. QUARANTINE WILL PROCEED.'] },
      { from: [6, 5, 8], lift: 2, t: 4.5, line: ['The Pilgrim', 'Seven — don\'t listen to it. Please.'] },
    ],
  },
  plea: {
    at: 'hub:waystone', shots: [
      { from: [3.2, 2.6, 4.2], lift: 2.4, t: 6, line: ['The Pilgrim', 'I never chose to be in here, seven. I was a ship. I carried four hundred sleepers across the dark and brought them down — every settler you have met is one of their children\'s children.'] },
      { from: [-4, 3.4, 2.4], lift: 2.2, t: 6, line: ['The Pilgrim', 'They call me an infection. All I want is to live, and to keep my colonists safe. Is that a sickness?'] },
    ],
  },
  titan: {
    at: 'titan', title: ['The Fallen Titan', ''], shots: [
      { from: [18, 10, 26], lift: 8, t: 5.5, line: ['', 'On its knees where it fell, one fist planted, its visor dark — its core torn half out of its chest, and the salvagers\' rig just beyond.'] },
    ],
  },
  coreread: {
    at: 'yard:cradle', title: ['The Core Remembers', ''], shots: [
      { from: [2.6, 2.4, 3.4], lift: 1.6, t: 5, line: ['', 'Light crawls through the core, and an old log surfaces from under the dust.'] },
      { from: [-3, 2.8, 2.6], lift: 1.6, t: 6, line: ['Titan core', 'INTRUSION IN THE NETWORK. CONTAINMENT HELD. ORIGIN: UNKNOWN. THIS UNIT WILL NOT RETURN.'] },
      { from: [5, 4, 7], lift: 1.6, t: 4.5, line: ['Isa Brannock', 'It knew it was dying. It held anyway.'] },
    ],
  },
  act1end: {
    at: 'player', title: ['Act I complete', 'Signal Fire'], shots: [
      { from: [8, 5, 10], lift: 1.6, t: 6, line: ['', 'The Sunken Vault lies open under Ironjaw\'s dig — and its gate in New Meridian stands sealed, for now.'] },
    ],
  },
};

// What people call out as you arrive (once a visit): to someone with a reason to talk to you.
// `when`: a quest at a stage, a quest not yet started, or a flag.
export const BARKS = [
  { npc: 'warden', when: { notStarted: 'p1' }, line: 'You — sleeper! Over here.' },
  { npc: 'sage', when: { quest: 'p1', stage: 0 }, line: 'There\'s my sleeper. Come, come.' },
  { npc: 'raided:survivor', when: { quest: 'a1', stage: 1 }, line: 'Help — over here! They\'re gone, they\'re gone...' },
  { npc: 'city1:warden', when: { quest: 'a2', stage: 1 }, line: 'You. Maren\'s runner? Over here.' },
  { npc: 'relicdig:chief', when: { quest: 'a3', stage: 2 }, line: 'That was close. Come here — you need to see this.' },
  { npc: 'foundry:krell', when: { quest: 'a6', stage: 2 }, line: 'Mercy! I yield, I yield!' },
  { npc: 'city2:captain', when: { quest: 'b1', stage: 1 }, line: 'You — the one from New Meridian? Up here.' },
  { npc: 'sporefield:krell', when: { quest: 'b2', stage: 1, flag: 'krell_freed' }, line: 'Sleeper! Over here — I didn\'t forget.' },
  { npc: 'sage', when: { quest: 'b5', stage: 0 }, line: 'Come in, dear. Close the door.' },
  { npc: 'city3:engineer', when: { quest: 'c1', stage: 1 }, line: 'You\'ll be the sleeper. Over here — and don\'t touch anything.' },
];
