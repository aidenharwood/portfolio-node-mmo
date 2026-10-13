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
// choose (answer someone) · attune · chest.

export const ACTS = [
  { act: 0, title: 'Prologue', sub: 'The Last Sleeper', levels: '1–3' },
  { act: 1, title: 'Act I', sub: 'Signal Fire', levels: '3–8' },
];

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
    id: 'p2', kind: 'story', act: 0, level: 1, giver: 'warden', requires: ['p1'], title: 'A Blade for the Road',
    offer: 'Brightwater keeps its walls by keeping the wilds thin. Before I trust you past the gate, show me you can hold a blade — and that you\'re still holding it afterwards.',
    stages: [
      { text: 'Thin out the wilds round Brightwater.', objectives: [{ type: 'killAny', near: 'hub', r: 340, count: 6, text: 'Defeat enemies near Brightwater' }] },
      { text: 'Clear the camp nearest Brightwater: {hubcamp}.', objectives: [{ type: 'clear', camp: 'hubcamp', count: 1, text: 'Clear {hubcamp}' }] },
    ],
    turnIn: 'Not bad, sleeper. Not bad at all. Take this — Warden issue, and better than what you came in with.',
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
    id: 'p4', kind: 'story', act: 0, level: 2, giver: 'sage', requires: ['p2', 'p3'], title: 'The Wreck of the Pilgrim',
    offer: 'If the stones know you, maybe the ship does too. The Pilgrim lies {pilgrim:dir} of here, nose-down in its own furrow; its old mind-core sat behind the bridge. Mind the scavengers — Ironjaw\'s lot have been picking the hull clean.',
    stages: [
      { text: 'Go to the Wreck of the Pilgrim.', objectives: [{ type: 'goto', at: 'pilgrim', count: 1, text: 'Reach the Wreck of the Pilgrim' }] },
      { text: 'Drive the scavengers off the wreck.', objectives: [{ type: 'defend', at: 'pilgrim', race: 'scav', waves: 2, count: 1, text: 'Hold the wreck' }] },
      { text: 'Search the bridge.', objectives: [{ type: 'use', object: 'pilgrim:console', count: 1, text: 'Wake the bridge console' }], done: { moment: 'manifest' } },
    ],
    turnIn: 'It knew you. Your name, your rank — and it asked for you by both. Whatever\'s waking in the stones, dear, it\'s waking through you.',
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
    id: 'a8', kind: 'story', act: 1, level: 8, giver: 'city1:warden', requires: ['a7'], returnTo: 'sage', title: 'The Seal', moments: { done: 'act1end' },
    offer: 'Old Ysolde, in Brightwater. Tell her what you saw at the vault — all of it.',
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
    turnIn: 'Whatever comes up out of that hole, it\'ll come for the Wardens first and the stones second — and you\'re tied to both now. Rest, sleeper. You\'ve earned it.',
    setFlags: ['act1_done'],
    rewards: { xp: 1000, gold: 400, weapon: { minTier: 3 } },
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
      { from: [8, 6, 10], lift: 1.6, t: 5, line: null },
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
];
