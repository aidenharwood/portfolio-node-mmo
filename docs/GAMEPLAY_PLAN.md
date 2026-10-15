# Gameplay plan: progression, scale and story

The core loop works: explore, fight camps and packs, loot, level. What's missing is a sense of
getting somewhere, and danger that keeps up with you. This plan covers:
- re-tuning the power curve;
- larger and harder fights;
- difficulty tiers;
- abilities, talents and achievements;
- settlements of every size;
- a story with side quests;
- dungeons, public world events and raids.

It's split into phases that each leave the game playable, tested and documented.

**Decisions from you:**
- **Dungeons:** both. Open-world sites shared by your layer, plus instanced versions for parties.
- **Large-scale content:** public world events, plus instanced raids.
- **Difficulty:** fixed level zones, plus opt-in tiers that raise enemy power for better loot.
- **Progression systems:** abilities and a talent tree, plus achievements, titles and a codex.

Anything marked *(default)* below is my assumption. Change it when you review.

---

## 1. Where we are

### Status, 2026-10-14
- **Built:** phases 1–5 and 7 (balance and hordes, talents and achievements, settlements, the
  quest system and Act I, dungeons, the Brood Mother raid). Each has its Node check in `npm test`.
- **Phase 6 (public world events):** 6a is built (see 8): the director, Hive Surges, Scav
  Sieges, Maker Anomalies, overrun settlements and the Retake. 6b is under way: routes along the
  roads and the Synth war-walker are built (P-1, P-2, on branch `p-walker`); the stampede, the
  director's rules for walkers, escort quests and the close-out aren't.
- **Phase 8 (Acts II–IV and the endgame):** Act II (8a) is built (b1–b12). Act III (8b) is under
  way: its story design ([the Act III spec](superpowers/specs/2026-10-15-act-iii-story-design.md))
  is approved. Ironreach, quests c1–c7 and the Fallen Titan with Brannock's Yard are built (WORK_PLAN
  B-1 and B-2, branch `act-iii`, on top of the war-walker branch `p-walker`). The Foundry Below, the
  Colossus foundry and the act's choice come next (B-3 to B-5).
- **Stabilising:** a pass over what the phases left open (WORK_PLAN S-1 to S-4): the server's
  scenery colliders matched to the client's, the deploy files and docs matched to the real
  pipeline, and trades and mail made safe against a layer crashing. Each is on its own branch
  waiting for review, not yet on `main`.
- **Next:** what's left, in order and by who's on it, is in [WORK_PLAN.md](WORK_PLAN.md) (its
  lanes table), with the reasons in [ROADMAP.md](ROADMAP.md).

The sections below this one are the plan as first written, kept for reference. Where it started
(the power curve as measured then, and the other gaps) is in [Appendix A](#appendix-a--where-the-plan-started).

---

## 2. Phases at a glance

| # | Phase | What you get | Size | Status |
|---|---|---|---|---|
| 1 | Rebalance, hordes and tiers | Combat stays dangerous at every level; bigger fights; elite affixes; difficulty tiers | M | built |
| 2 | Abilities, talents and achievements | Something new to unlock every level; titles and a codex | L | built |
| 3 | Settlements of every size | Hamlets to cities with services, quest boards and side quests | M | built |
| 4 | Quest system v2 and Story Act I | Story-led play from level 1 to about 8 | L | built |
| 5 | Dungeons | Interiors, a generator, open-world and instanced dungeons with tiers | XL | built |
| 6 | Public world events | Faction offensives everyone nearby joins | L | 6a built, 6b under way (the war-walker) |
| 7 | Raids | 8–16 player instances with scripted multi-phase bosses | L | built |
| 8 | Story Acts II–IV and the endgame loop | The rest of the story, more dungeons and raids, and the tiered endgame | XL | waits on 6 |

**Why this order:**
- Balance comes first: it fixes "overpowered" straight away, and everything after it is tuned on its numbers.
- Progression systems come next, so levels mean something.
- Settlements and the quest system give the story somewhere to live.
- Dungeons, events and raids come last because they need the interior, encounter and boss-scripting tech built in phases 5–7.

**Each phase ends with:**
- `npm test`;
- new Node checks;
- in-game captures;
- README updates;
- a short play report to you.

**Server restarts:** phases that change server code need your 8080 server restarted. I won't restart it myself; I'll tell you when.

---

## 3. Phase 1 — Rebalance, hordes and difficulty tiers

**Status: built** (2026-10-13). `npm test` now runs `tools/powercurve.mjs` (every level 1–30 in
band) and `tools/hordecheck.mjs` (rosters, every affix, a warband and a stronghold run headless)
before the smoke test. Where it differs from the plan below:
- **Elites** have ×3.4 health and ×2.3 damage, so they kill you in 5–7 hits rather than 5–6.
- **Tiers:** Veteran damage is ×1.45 (not ×1.35) and Elite ×1.85 (not ×1.7), to land Veteran trash
  at 8–11 hits to die.
- **Best-in-slot** gear measures 1.5–1.8× on-level rare (stats only), short of "about 2×"; legendary
  perks and set effects make up some of the rest. It never one-shots trash.
- **A gentle start:** enemies of levels 1–4 are weaker and reach full strength at 5, and new
  characters start in the common Pathfinder set; without both, a fresh character died in 5–9 hits.
- **Healing** (not in the plan, but needed once enemies can kill you): out of a fight health
  regenerates; the dead drop health cells.
- **Also changed:** the melee combo multiplier tops out at ×2 (was ×3). Vitality gives a share of
  health, and Might no longer adds health. Breaking a warband or storming a stronghold pays a bonus.
- **Affixes** in the open world go by region level and champion; the tiers' extra affixes are kept
  for instances.
- **Performance:** every character, not just enemies, bakes to three draw calls. The server load
  was measured headless (`tools/loadsim.mjs`): 150 stand-in players, ~640 enemies, 8.6 ms a tick.
  The bot-based test against a running server wasn't run, because it would add accounts to yours.

### 3.1 Power curve (targets first, formulas tuned to hit them)
Targets at every level, on-level enemies, rare gear, average talent investment:

| | Hits to kill | Hits to die |
|---|---|---|
| Trash enemy | 3–4 | 12–16 |
| Veteran-tier trash | 5–6 | 8–10 |
| Elite | 10–15 | 5–6 |
| Boss, solo | 60–90 seconds | — |
| Best-in-slot gear (legendary, full set) | about 2× faster than on-level rare gear, never one-shots | — |

Changes:
- **Weapons:**
  - level growth goes to 1.16 a level, matching enemy health, so on-level gear keeps pace;
  - the rarity spread is compressed to common 1.0, uncommon 1.06, rare 1.14, epic 1.22, legendary 1.30;
  - maker and part bonuses are normalised to about ±10%.
- **Player damage:** the +3%-a-level bonus goes. The extra edge comes from talents (phase 2), set bonuses and rarity.
- **Attributes:** they become talents in phase 2. Until then, each point after the 5th gives less (diminishing returns).
- **Armour:**
  - damage reduction is measured against the attacker's level: `reduction = A / (A + 40 × 1.12^(enemy level − 1))`;
  - full heavy armour sits at about 50–55% against on-level enemies.
- **Enemies:** damage growth goes from 1.11 to 1.13 a level, to match player health growth.
- **Level gaps:**
  - enemies 3 or more levels above you take less from you (−8% per level, to −40%);
  - enemies 5 or more levels below give a tenth of the experience and no extra loot luck.
- **Existing characters:** points are refunded and re-spent on load, and gear regenerates on the new curve automatically.
- **Check:** `tools/powercurve.mjs` (the table above) becomes a test that fails if a level drifts outside its targets.

### 3.2 Hordes
Camp size grows with region level:

| Region level | Camp size | Elites | Champion |
|---|---|---|---|
| 1–4 | 4–6 | 0 | — |
| 5–9 | 6–9 | 0–1 | — |
| 10–17 | 8–12 | 1–2 | 30% of camps |
| 18 and up | 10–16 | 2–3 | always |

- **Roaming hordes:** in regions of level 10 and up, bands of 10–20 roam occasionally as small events, flagged on the minimap.
- **Strongholds:** the boss, 10–14 guards and reinforcement waves when the alarm goes up.
- **Elite affixes:** about eight to start, two or more at higher tiers, with a coloured aura and named on the nameplate:
  - Shielded: a shield that must be broken first;
  - Frenzied: speeds up at low health;
  - Vampiric;
  - Volatile: explodes when it dies;
  - Blinking: teleports;
  - Splitting: Hive only, splits when it dies;
  - Overcharged: Synths only, a shock aura;
  - Commander: buffs nearby allies.
- **Horde AI:**
  - more enemies may attack at once (the "attack token" limit goes up), but readably;
  - packs surround and flank;
  - ranged enemies hold back and fire in turns.

### 3.3 Difficulty tiers
| Tier | Enemy health | Enemy damage | Extra affixes | Loot |
|---|---|---|---|---|
| Normal | ×1 | ×1 | — | — |
| Veteran | ×1.6 | ×1.35 | +1 | luck +1, rarity floor +1, +25% XP |
| Elite | ×2.5 | ×1.7 | +2 | luck +2, rarity floor +2, +50% XP |
| Nightmare *(later)* | ×4 | ×2.2 | +3 | rarity floor legendary for bosses |

- **Dungeons, raids and events:** the tier is picked when you start.
  - Dungeons and raids: by the party leader.
  - Events: at the event beacon, with a majority vote.
- **Open world:** a personal **Threat** setting under Character, which you can't change mid-fight.
  - Enemies are shared in an MMO world, so the tier changes how hard enemies hit *you* and how much they shrug off *your* damage.
  - Your loot and experience rolls are server-side and use your tier.
  - Everyone else sees normal enemies.

### 3.4 Performance for hordes
- **Draw calls:**
  - each enemy is currently 15–25 draw calls (one per colour, plus outline shells);
  - enemies get baked into three: one lit mesh using per-vertex colours, one glow mesh, one outline;
  - target: 40 enemies on screen for about 120 draw calls.
- **Animation:** distant enemies animate less often (already partly done), and their AI updates less often on the server.
- **Server budget:** measured with the bot tool. Target: 300 active enemies per layer at 20 ticks a second, under a quarter of a core.

---

## 4. Phase 2 — Abilities, talents and achievements

**Status: built** (2026-10-13). `npm test` adds `tools/progresscheck.mjs` (talent tiers and
points, save clamping, every ability and upgrade, achievements through the character's rules,
codex coverage); the smoke test checks talents, Threat and visit records online, and
`tools/powercurve.mjs` now builds its characters from talents. Where it differs from the plan below:
- **Keys:** the guild tab moved from G to U, so abilities could have X, G and T; talents open on N.
- **The curve:** enemy health now grows 17% a level (was 19% with attributes) and enemy damage
  13.5%; damage ranks are +7% and capstones +15% (a full tree ≈ +57% to its class).
- **Tree order:** Gunslinger unlocks Grapple Line before Holo-Decoy and Overclock.
- **Respec** is at any trader for now (gold by level, free below 10); it moves to workshops when
  towns arrive in phase 3.
- **Achievements:** 43, in combat, exploration, collections, progression and feats; story,
  dungeon, raid and event ones come with those phases. Records started with this phase, so older
  characters bring only their kill count and level.
- **Codex:** enemies, kinds of landmark and makers; places and quests grow with phases 3–4.

### 4.1 Talent tree (replaces attribute points)
- **Points:** one per level from 2, so 29 at the level cap of 30 *(default cap)*.
- **Three trees, each tied to a weapon class and a role:**
  - **Vanguard** (melee, toughness);
  - **Gunslinger** (ranged, mobility);
  - **Technomancer** (magic and tech, support).
- **Tiers** open at 0, 3, 6, 10 and 15 points spent in that tree. Each tier has:
  - minor nodes (a small bonus, up to 3 ranks);
  - one ability unlock;
  - ability upgrades.
- **Capstones** at 15 points.
- Bonuses are tuned to the 3.1 targets, so a fully invested tree is about +60% to its class.
- **Respec:** free while you're under level 10, then a gold cost at a town or city workshop.

### 4.2 Abilities
- **Three slots:**
  - keyboard: X, G and T *(default; Q, E, R, F, C and V are taken)*;
  - touch: three buttons above the action cluster;
  - each ability has its own cooldown.
- **Twelve abilities at launch, four per tree:**
  - **Vanguard:**
    - Seismic Slam: a ground blast that knocks enemies down;
    - Bulwark: a frontal energy shield that stops shots;
    - Leap Strike: closes the gap;
    - Rally Cry: a burst of damage and healing for your party.
  - **Gunslinger:**
    - Frag Grenade;
    - Holo-Decoy: draws enemy attention;
    - Overclock: a fire-rate burst;
    - Grapple Line: pulls you to a point.
  - **Technomancer:**
    - Sentry Drone: a turret;
    - Arc Barrier: a dome that blocks projectiles;
    - Stasis Field: slows enemies;
    - Restoration Pulse: party healing over time.
- **Networking:**
  - abilities are operations the server checks (cooldowns, unlocks) and effects every screen plays;
  - their damage runs through the existing damage pipeline;
  - they work with gear perks and set bonuses.

### 4.3 Achievements, titles and codex
- **Achievements:** about 40 at launch, tracked and saved on the server, with points and notifications. Categories:
  - combat (by faction, elites, bosses, affixes);
  - exploration (landmarks, waystones, every biome);
  - story;
  - dungeons, raids and events (clears by tier, without anyone falling);
  - collections (complete sets, legendaries);
  - feats (movement-tech tricks, unusual kills).
- **Titles:** earned from achievements; pick one in the Character tab; shown on your nameplate and in chat.
- **Codex:**
  - a bestiary entry per enemy type, unlocked by kills: lore, strengths, weaknesses, and its tier and affixes once seen;
  - entries for landmarks and makers.

---

## 5. Phase 3 — Settlements of every size

**Status: built** (2026-10-13). `npm test` adds `tools/poicheck.mjs` (every kind of place built
headlessly: services present, nobody standing in a wall) and `tools/placecheck.mjs` (how common each
size is, where towns and cities stand, and every service through the character's rules as the
server runs them). Where it differs from the plan below:
- **How common:** hamlets turn up in about two regions in five; villages stay at the waystones that
  had them (about a third), so existing worlds keep their layouts; towns are one per block of nine
  regions (a region and the ring round it) — about one region in eleven — so there's a town every
  few hundred metres out to the edge rather than one per ring of the whole world.
- **Sizes:** towns are 31 m to their walls; a city is 82 m to its walls (a 26 m heart and four 22 m
  districts round it). Hamlets have 2–3 folk, villages 4–6, towns 9–12, cities about 19.
- **Cities** sit on a spiral out from the hub at the acts' distances (about 500, 1,450, 2,500 and
  3,400 m), moved to open level ground if the spot is in mountains or water. They have no camps
  inside their region and nothing else is built within their walls. Each streams in as six parts:
  its heart, its walls, and four districts.
- **Services:** the gate yard's dungeon and raid gates are sealed until phases 5 and 7; the war
  table lists the strongholds near the city (the raid board proper comes with phase 7). Villages all
  have a trader now, plus a quest board. Gunsmiths and armourers carry a fine stock (rare or better,
  a level ahead, up to the cap) besides their share of the everyday stock.
- **Quests:** boards hold three postings (bounty, camp to clear, salvage or waystone survey), hamlet
  givers an errand, and town and city Wardens contracts — with the objective types that exist now;
  phase 4's quest system gives them more to ask.
- **Brightwater:** a town of 30 m round the old camp; its reactor stays the inn. Its tower moved
  outside the new walls.
- Existing worlds: only town and city regions (and a few of their neighbours' features that stood
  where a town or city now does) changed; everything new elsewhere comes from a stream of its own.

| Size | Radius | Buildings | Folk | Services | How common |
|---|---|---|---|---|---|
| Hamlet | about 12 m | 2–4 | 2–3 | a side-quest giver | common, any biome |
| Village | about 20 m | 6–10 | 4–6 | trader, quest board | one region in three |
| Town | about 35 m | 12–20, walls and gates | 8–12 | weapon and armour traders, Warden post (contracts), inn (rest and respawn), workshop (respec) | about one per ring of regions |
| City | 60 m and up, in districts | 40 and up | 15–25 | everything, plus dungeon and raid gates and a raid board | three or four in the world; story hubs |

- **Building on what exists:** the current homestead, outpost, mining, caravan and stilt builders become village kits; hamlets, towns and cities get new builders.
- **Brightwater Vale** becomes a town.
- **Placement:** cities are placed deliberately, one at the heart of each act's region. Towns and villages scatter along roads.
- **Performance:**
  - buildings merge by colour per district;
  - townsfolk animate only near you (already the case) and fade out with distance;
  - cities stream in by district.
- **Hooks for later phases:** settlements can come under attack (phase 6 events); towns and cities hold quest boards (phase 4) and dungeon gates (phase 5).

---

## 6. Phase 4 — Quest system v2 and Story Act I

**Status: built** (2026-10-13). `npm test` adds `tools/questcheck.mjs`: the Prologue and Act I
played from Warden Maren's first word to Old Ysolde's last through the character's rules as the
server runs them (places reached and defences held as the server reports them, quest drops, objects
used, both choices and their flags, nothing taken or handed in out of order or away from who it goes
back to), a village of each kind's side chain, and the story's achievements. Where it differs from
the plan below:
- **Quests** run in stages (each with its text, objectives, lines people say and a moment when it's
  done); objective types are goto, talk, kill (type, faction, a named foe's tag, near a place),
  clear, use, collect (quest drops), defend (waves of the local faction), choose, plus the old attune
  and chest. Escort waits, as planned. Quests that finish where they're done hand themselves in,
  and a village's chain carries straight on.
- **The story:** 12 quests (Prologue 4, Act I 8), 10 moments, 2 choices (Krell: in chains or let go;
  Ysolde: told about the voice or not). Its places — the wreck of the Pilgrim, Eastwatch and
  Highwatch beacons, the Wardens' relic dig, the Rustjaw Outpost, the Rustjaw Foundry and the Sunken
  Vault — are set in every world from its seed, like the cities, on the flattest open ground near
  where the story wants them. The Foundry is an open-world stronghold with **Ironjaw** as its named
  boss; the Sunken Vault is, for now, his dig round a sealed Maker door — opening it ends Act I, and
  the dungeon behind it comes with phase 5.
- **Side quests:** five chains of three (15 quests), one per kind of village, so every homestead,
  mine, caravan stop, outpost and fen village in the world has one; the boards' generated postings
  (bounties, camps to clear with captives to free, salvage runs, waystone surveys, deliveries) carry
  on beside them.
- **Talking:** a quest's step can give anyone lines, so story folk, villagers and objects take part;
  markers over heads show a quest to take (gold), to hand in (green) and someone a quest wants
  (teal). Folk call out as you arrive (`BARKS`), once a visit.
- **The journal:** Story, Side and Contracts tabs, each quest's step, objectives and who it goes back
  to, the story so far act by act, and a Track button; the tracked quest leads the HUD, compass,
  minimap and map. The story's places show on the map in gold. Seven story achievements (three with
  titles: *the Last Sleeper*, *Ironjaw's Bane*, *the Good Neighbour*).
- **Online:** the server watches each player's quests every second (places reached, defences
  started and held) and rolls quest drops into kills; `use` and `choose` are new ops. A build check
  keeps clients offline against a server running older rules.

### 6.1 Quest system v2
- **Chains and flags:** story quest chains with requirements, plus story flags such as "the vault is open" or "Ironjaw fell" that change dialogue and world state.
- **Objective types:**
  - go to a place;
  - talk to someone;
  - kill N of a type or faction;
  - clear a camp or dungeon;
  - use an object;
  - collect a quest drop;
  - defend a point or survive waves;
  - escort *(later)*.
- **Dialogue:** branching choices, choices that set flags, and NPCs who speak on arrival.
- **Story moments:** short camera-and-dialogue scenes that you can skip.
- **Journal:** tabs for Story, Side and Contracts; tracked objectives on the compass, minimap and map (the markers already exist).
- **Side quests:**
  - handwritten chains per settlement kind (a homestead's missing child, a caravan escort, a mine cave-in);
  - generated quest-board jobs (bounties, deliveries, rescues, salvage runs) themed by the local faction.

### 6.2 Story outline (draft for your review)
**Premise:**
- Long ago the precursors, the **Makers**, wove a network across this world: the waystones, the Ring, and the Tether reaching up to orbit. Then they vanished.
- Generations ago the colony ship **Pilgrim** came down here (its wreck is a landmark). Its survivors became the settlers; those who turned on them became the **Scav clans**.
- The ship's sealed cargo was Hive spores: the **Hive** "came down with the old ships", and has bred in the dark ever since.
- The colony's war machines, the **Synths**, were never switched off.
- You are the last sleeper of the Pilgrim, pulled from a cryo-pod in the wreck. The waystones *remember* you, because the Pilgrim's mind is in the Maker network and it is waking up through you.

| Act | Levels | Arc | Big moments |
|---|---|---|---|
| Prologue | 1–3 | You wake in Brightwater. Warden Maren, Old Ysolde, the first waystone answers you. | First camp, first waystone, the Pilgrim's voice |
| I. Signal Fire | 3–8 | The scav warlord **Ironjaw** is raiding settlers for Maker relics. Trace him to the **Rustjaw Foundry**, his fortress (open-world dungeon), and to the **Sunken Vault** he was digging out (instanced dungeon). | Ironjaw falls; the vault was a *seal*, and now it's open |
| II. The Brood | 8–16 | Hive surges on settlements (events). Ysolde admits the Hive came on the Pilgrim. The **Farcall Array** is calling them. The **Brood Pits** (dungeon). | Raid: **The Brood Mother** (the Hive Queen) |
| III. Iron Heart | 16–24 | Synths wake across the highlands: the waystones' waking roused the Makers' old guardians. War-walkers cross regions (events). The **Foundry Below** (dungeon); the Fallen Titan. | The Colossus foundry; the Synths' true orders |
| IV. The Tether | 24–30 | The Ring opens and the Tether reconnects. Climb to the anchor. | Final raid: **The Tether Crown**; you choose the network's fate: shut it down, take it, or wake the Makers |

- **This phase:** the Prologue and Act I, with about 12 story quests and about 15 side quests in the Act I region.
- **Phase 8:** Acts II–IV.
- Every act unlocks its region's city, a dungeon, events, achievements and titles.

---

## 7. Phase 5 — Dungeons

**Status: built** (2026-10-13). `npm test` adds `tools/dungeoncheck.mjs` (every dungeon's layout
across many private runs, then copies run headlessly through the instance manager, the world sim and
the character's rules) and the smoke test goes down a dungeon through Brightwater's waygate on a real
server. Where it differs from the plan below:
- **Pockets:** copies are built far out east (60 km+, past anywhere the land goes) in slots 400 m
  apart, on a 2 m grid. There the world's ground is the copy's floors (stairs are ramps under their
  steps), walls, lintels and doors are box colliders (new), and the ceiling caps the camera and
  shots. Nothing of the land streams in, spawns, roams or is "visited" out there.
- **Light:** the land, sky and grass are hidden, the fog closes in to the theme's colour, the sky
  light and sun take the theme's tint, and the one moving light hangs over you (the light count
  stays fixed, so no shaders recompile); fixtures glow, with bloom on the higher qualities.
- **Navigation:** breadth-first flow fields on the copy's grid, shared by everyone heading for the
  same cell; enemies cut corners to the furthest point in sight, don't see you through walls, and
  don't ride the lift.
- **Layout:** every dungeon has the same shape of main route — entrance hall, three halls, the
  mini-boss's arena (pillars, its seal opens when the mini-boss falls), a hall, the lift down an
  8 m drop, a hall, the final boss's hall — with a locked door (its key in a side room) and a door
  that needs power (two nodes in side rooms) before the arena; stairs where a hall is lower. The
  main route is the dungeon's own; side rooms, residents, traps and treasure are rolled again for
  every private run. Traps are each screen's own danger (like enemy shots): vents, turrets that
  track you, and spore pods in organic themes. The lift runs on each screen.
- **Open-world and private:** the Foundry and the Brood Pits have open-world copies (rooms refill
  three minutes after they're emptied, the boss too); the Sunken Vault is private-only, sealed until
  Act I opens it. Private runs are at a tier — the run's Threat for everyone in it — and at least the
  level of whoever starts it; the reward chest is once a day per dungeon per tier (the UTC day).
  Waygates: every town and Brightwater got one on the plaza; cities use their gate yard's dungeon
  gate. Empty copies close after ten minutes (an open-world one starts over).
- **The launch set:** Ironjaw moved down into the Foundry as its final boss (Act I's "Defeat Ironjaw"
  now sends you through the furnace hall gate; the stronghold on top is Gorrak the Foreman's); the
  Vault's boss is the Seal Warden; the Brood Pits are a new story place past Farcall (the Brood
  Matron). Synth facilities and Wild caverns are built by the generator and reachable from the dev
  panel until dungeons of their own arrive.
- **Achievements:** five (Delver, Into Every Dark *(title)*, Private Business, Regular, Deep and Dark
  *(title)*); clears are recorded per dungeon as open world, Normal, Veteran and Elite.

### 7.1 Interior tech
- **Pocket spaces:**
  - interiors are built far outside the playable land, at their own coordinates;
  - the terrain, sky and fog switch to an interior mode there;
  - the world's ground lookup returns the dungeon's floors, so movement, physics and enemies all just work.
- **Kit:** rooms, corridors, doors, stairs and lifts, built from the same modelling kit as everything else.
  - Collisions come from wall segments; the world currently only has round colliders, so this adds box colliders.
  - Lighting comes from faction-themed light fixtures.
- **Enemy navigation:** a coarse grid search inside interiors, so enemies follow you through doors and round corners.
- **Transitions:** a loading screen ("Entering the Sunken Vault…"); the minimap switches to an interior map.

### 7.2 Generator
- **A graph of rooms:**
  - a main route with side rooms;
  - keys and locked doors, and power-the-door puzzles;
  - traps (vents, turrets, spore pods);
  - a mini-boss, a final boss and treasure rooms.
- **Themed per faction:**
  - Scav bunkers;
  - Hive tunnels and nests;
  - Synth facilities;
  - Maker vaults;
  - Wild caverns.
- Seeded, so every dungeon has a fixed layout. Instanced copies reshuffle side rooms per run.

### 7.3 Open-world and instanced
- **Open-world dungeons:**
  - entrances are points of interest in the world, on the map;
  - one shared interior per layer;
  - enemies respawn like camps.
- **Instanced dungeons:**
  - the same places, entered through a gate in a town or city, or at the entrance;
  - a private copy for your party at a chosen tier;
  - no outside respawns;
  - a reward chest at the end, once per day per tier *(default lockout)*.
- **Server:**
  - an instance manager per layer, tied to the party (parties already gather on one layer);
  - an empty instance closes after 10 minutes;
  - offline single-player runs the same code locally.
- **Launch set:** three dungeons, the Rustjaw Foundry, the Sunken Vault and the Brood Pits, matching the story.

---

## 8. Phase 6 — Public world events

**Status: 6a built** (2026-10-14); 6b not started. `npm test` adds `tools/eventcheck.mjs`, which
covers:
- the director on a real world;
- the vote;
- each event won, lost and abandoned through the world sim, with stand-in players;
- scaling and contribution;
- an overrun closing a settlement's services under the server's rules, and the Retake;
- the chest and achievements through the character's rules;
- the server's side, with a stand-in realm: `wev`, votes, the tier, the chest as a server op,
  and `ovr`.

The design is in 8.1–8.6 below, and the original outline after it. Where 6a differs from the design:
- **Chest XP** is a third of what the event's enemies were worth, between 40 and 120 × the
  event's level (half was up to three levels at once).
  - *Rarity:* the chest uses the same roll as a stormed stronghold, which adds the tier's rarity
    floor on top of rare, so an Elite event's items are legendary.
- **Health of things to defend:** a pylon takes 160 on-level blows of 14 damage, the beacon 220.
  Shells count 2.5 blows against them.
  - *Measured with stand-in defenders:* a defended surge takes 1½–3 minutes and an anomaly about
    2. An undefended siege falls in about 2½ minutes.
- **An anomaly nobody guards** is usually wrecked by its guardians within a minute, rather than
  fading. Either way nothing is overrun.
- **Stragglers (added):**
  - wave enemies that stay 45 m from the fight for 20 seconds give up;
  - a minute after the last wave, two or fewer left break and run;
  - so one stuck attacker can't hold an event open.
- **Sites:** settlements are picked twice as often as landmarks and ruins, which are far more
  common. Ruins are named after their region.
- **Admins** can start and settle events online with `/admin event surge|siege|anomaly|win|lose`.
  The dev panel does the same offline.
- **Server restart:** 6a changes server code, so your 8080 server needs a restart to run events.

### 8.0 6b so far: the war-walker (P-1, P-2)

**Status: built** (2026-10-15, branch `p-walker`). `tools/eventcheck.mjs` adds routes (one built
from the roads, walked, a short gap jumped and a long one leaving it stuck), something led along a
route across regions with whoever follows it told all the way, and the walker won, lost (overrun
and a Synth Retake), abandoned, stuck, killed on the tick it arrives, its couplings, scaling, pace
and hull, and its state on the wire.
- **Routes** (`sim/Routes.js`): from a waystone up to three regions off, along the roads between
  waystones, to the settlement's waystone and in by its spur; 360–480 m long (at least four
  minutes' walk). A settlement with no such road (or whose region has no waystone) gets no walker. They keep out of
  the cities and the hub unless the city is where they're going *(default)*. A follower walks a
  route at a steady pace, jumps ground it can't stand on if there's footing within 30 m, and is
  otherwise stuck.
- **An event can lead something** along a route, a structure or an enemy. Its centre moves with
  it, so `wev`, participation, stragglers and abandonment follow it without other changes.
- **The Synth War-walker** (`walker`): a settlement event. It sets out 360–480 m off and walks at
  1.5 m/s (four to five and a half minutes). Three power couplings (one more per three extra defenders) ride
  round its hull, which can't be hurt while any holds; an escort wave drops off behind it every
  24 s. Win: bring it down. Lost: it arrives, and the settlement is overrun with a Synth Retake.
  Abandoned (nobody within 200 m of it or of the settlement for 45 s) or stuck: it turns back
  and nothing is overrun *(default)*. Waiting for it at the beacon counts as being there.
  - *Toughness:* not an elite (the elite tint and affixes don't suit it). Its hull is about 1.6
    Colossus fights. `eventcheck` budgets one player alone: running out to meet it, its three
    couplings, its hull, and a sixth more for its escort comes to about 3:50, inside the shortest
    walk (4:00). It's tight alone and comfortable for a group. More players toughen it by the
    usual crowd rule, not on top of it, and it never goes home to mend: stepping back out of
    reach doesn't heal it.
  - *Shielded:* while its couplings hold, screens show it immune (the ward, no damage numbers).
    The couplings ride 3.2 m up beside its legs, within a jump of a melee swing.
  - *For now* only a quest (A-2's hook, Act III's "The Walker") or the console starts one; the
    director, `/admin event walker` and the dev panel come with P-4.

### 8.1 Split
- **6a (now):**
  - the director;
  - the framework every event uses: things to defend, participants and contribution, scaling,
    the tier vote, the event chest;
  - three event types that hold a place: Hive Surge, Scav Siege and Maker Anomaly;
  - failure: an overrun settlement and the Retake event;
  - two new enemies, the Spore Pod and the Siege Engine;
  - achievements, the codex, the dev panel, `tools/eventcheck.mjs`, and the docs.
- **6b (next):** the two events that move.
  - Synth War-walker: a walker that follows a path, with weak points.
  - Wild Stampede: caravans as moving things to defend.
  - Both need path-following, which 6a doesn't.

### 8.2 The director (`sim/WorldEvents.js`, inside the world sim)
- **One per layer, and one offline.** It's the same code online and offline, like camps.
- **When:** checked every 10 seconds.
  - A player is due an event 2½ minutes after arriving, then 5 minutes after the last event
    near them ended *(default)*.
  - At most `1 + players ÷ 8` events run on a layer at once, up to 6.
  - Events stand at least 600 m apart.
  - A site rests for 20 minutes after its last event.
- **Where:** 120–320 m from a player who's due one, in a region of level 3 or more. Nothing in
  the hub, a city or a dungeon.
- **What:** chosen by the site and the region's faction.
  - A hamlet, village or town in Hive land gets a Hive Surge.
  - In Scav land it gets a Scav Siege.
  - From level 8, any settlement has a quarter chance of a Hive Surge, as Act II's Hive spreads.
  - A landmark or ruin of level 5 or more gets a Maker Anomaly.
  - Synth and Wild settlements wait for 6b's events.
- **Announced** to everyone within 450 m with a banner, a chat line, and a marker on the map,
  minimap and compass.

### 8.3 How every event runs
- **Stages:**
  1. *Gathering:* 40 seconds. The beacon is lit; whoever stands at it can vote the tier.
  2. *Under way:* the event's own objectives (8.4).
  3. *Won or lost:* rewards or consequences. The marker stays 15 seconds.
- **Abandoned:** if nobody is within 200 m for 45 seconds, a settlement event is lost and the
  settlement falls; an anomaly fades away.
- **Things to defend:** pylons, a beacon. Each has health, which the event's enemies wear down.
  - Enemies choose them over players, unless a player is hurting them enough to draw them off.
  - The damage is counted in the sim, since no player's screen takes it.
  - Health is measured in an on-level enemy's hits, so an unguarded pylon falls in under a minute.
- **Participants:** anyone within the event's area plus 35 m while it's under way.
  - *Contribution:* one point a second present, plus 100 points for each enemy's worth of
    damage dealt to the event's enemies. It's measured against the enemy's health, so level
    doesn't matter.
  - *Reward:* everyone with 60 points or more (about a minute there) gets the event chest.
    Anyone with at least half the top score gets one extra item.
- **Scaling:** to the number of participants (`n`).
  - Wave size: ×(1 + 0.4 × (n − 1)), at most ×4.
  - Pods and engines: one more per three extra players.
  - Things to defend: ×(1 + 0.3 × (n − 1)) health.
  - Enemy health already grows with the crowd.
- **Tier:** voted at the beacon while gathering.
  - Press E there to choose Normal, Veteran or Elite.
  - The most votes win; ties and no votes go to the lower tier.
  - Inside the event's area the tier is everyone's Threat, as a private run's is.
  - Elites get its extra affixes.
  - The chest gets its luck, rarity floor and XP.
- **The event chest:** handed out by the server, like a warband's bonus.
  - XP: half of what the event's enemies were worth.
  - Gold.
  - Two items, rare or better, plus one for a top contributor.
  - It lands at the beacon.

### 8.4 The three event types of 6a
| Event | Where | Objectives | Lost when |
|---|---|---|---|
| **Hive Surge** | a settlement | 3 Warden pylons round its heart. Spore pods (2, plus one per three extra players) root outside and hatch drones every 14 s; 4 waves march in. Win: every wave down and every pod burst. | every pylon falls |
| **Scav Siege** | a settlement | Siege engines (2, plus scaling) set up outside with juggernaut crews and shell the pylons from 40 m. Break the engines, then hold off 2 waves, the last led by a Siege Captain (an elite). | every pylon falls |
| **Maker Anomaly** | a landmark or ruin | A Maker beacon charges while someone stands within 12 m of it, and stalls while an enemy does. A rift beside it pours out Synth waves every 18 s, with a named Maker Warden at half charge. Win at full charge. | the beacon is destroyed (no lasting harm) |

### 8.5 Failure: overrun, and the Retake
- **When a Surge or Siege is lost,** the settlement is overrun for 15 minutes:
  - its folk are gone, and so are its services (traders, the inn, the board, its quest givers);
  - the server refuses them as it refuses anyone out of reach.
- **The Retake** starts at once. A garrison of the attackers holds the settlement: a camp of
  its level, with one more elite. Kill them all to retake it and earn the event chest.
- **Left alone,** the garrison leaves after the 15 minutes and the folk drift back.
- **Not saved:** overrun is held per layer (and offline per session), not in saves *(default)*.

### 8.6 Everything else
- **New enemies:** the Spore Pod (Hive) and the Siege Engine (Scav). Both are rooted in place,
  have their own models, and get codex entries.
- **Records and achievements:** records keep event wins by type and tier, retakes, and how often
  you were top contributor. A new Events category:
  - First Responder: complete an event;
  - Steadfast: complete 25, with the title *the Steadfast*;
  - Hold the Line: repel a Hive Surge;
  - Raise the Siege: break a Scav Siege;
  - Signal in the Noise: stabilise a Maker anomaly;
  - Not On My Watch: complete an event on Elite;
  - Reclaimer: retake an overrun settlement;
  - Leading from the Front: be top contributor in an event with three or more players.
- **Network** (`docs/MULTIPLAYER.md`):
  - `wev`: the events near you, sent twice a second when something changed, with your own
    contribution;
  - `ovr`: a settlement overrun or freed (the list comes with `welcome`);
  - `evote`: a vote.
- **Dev panel:** start any event at the reticle, win or lose the current one.
- **Check:** `tools/eventcheck.mjs` covers:
  - the director's choices on a real world;
  - each event played headlessly through the world sim, with stand-in players:
    - won and lost;
    - scaling;
    - the vote;
    - contribution;
    - chests through the character's rules;
    - an overrun closing services, and the Retake reopening them;
  - the achievements.

### 8.7 The original outline
- **Director:**
  - per layer on the server (and offline), it picks events in regions near players;
  - cooldowns stop the same event repeating or two events stacking;
  - events are announced on screen and on the map.
- **Five event types:**
  - **Hive Surge:** waves attack a settlement; defend its points; burst spore pods.
  - **Scav Siege:** siege engines and juggernauts batter an outpost; destroy the engines, then hold.
  - **Synth War-walker:** a moving Colossus-class walker crosses the region with escorts; break its weak points before it reaches a town.
  - **Wild Stampede:** thunderhorns and a Behemoth drive across a caravan route; protect the caravans.
  - **Maker Anomaly:** a vault beacon charges while waves pour out; hold it to the end for a relic cache.
- **Scaling and rewards:**
  - health and wave size scale with the number of players taking part;
  - contribution is tracked for rewards;
  - the tier is voted at the beacon;
  - an event chest at the end, plus achievements.
- **Failure has consequences:**
  - a lost settlement is overrun for a while: its services close and its folk flee;
  - a retake event follows.

---

## 9. Phase 7 — Raids

**Status: built** (2026-10-14). `npm test` adds `tools/raidcheck.mjs`: the telegraph shapes, every
boss script checked against its bestiary entry, the Brood Mother's layout across many copies, raid
groups as the server runs them, then a raid copy played headlessly through the instance manager,
the world sim and the characters' own rules (pulls, phases, adds, shields, soaks, a wipe and the
reset, each kill, the chests and their lockouts). The smoke test forms a raid group on a real server
and talks in raid chat. Where it differs from the plan below:
- **Who can go:** a raid group, a party, or one player alone. Boss health follows how many are
  in the fight (`raidHealth`: ×48 a solo boss for twelve, ×2.2 for one, since the plan asked for
  60–90 s solo bosses and a raid boss lasting about four times that), and so do the mechanics that
  count players (one acid spit per four of you, soaks needing a third of the raid) *(default)*.
- **Raid groups** (`server/raidgroups.js`): up to four parties (a lone player counts as a party of
  one), twelve players. Formed with `/raid form` or at a city's war table; the raid leader invites a
  party by naming any of its members and its leader answers; `/ra` is raid chat; raid frames show
  the members outside your party. A group lives on one layer, as parties do.
- **Getting in:** through the raid gate in a city's gate yard, once Act II's "The Gate Opens" has
  set `broodgate_open` (DEC-4: anyone in the raid group or party with it takes the rest in; no
  level floor). Until that quest exists, the gate stays sealed.
- **The copy:** the dungeon generator lays it out from a route of its own: entrance hall, then
  three halls of trash (5–8 a hall, with elites) and three arenas (36–44 m). Each arena's gate
  shuts behind the raid when its boss is pulled. If everyone is down or out of the arena for three
  seconds it's a wipe: the boss resets, its adds and pools go, and the gate opens. A kill opens the
  gate and the seal onward. After a fall you come back in the last arena you've beaten.
- **The framework** (`sim/BossScript.js`, data in `combat/bosses.js`): the usual AI still moves the
  boss and picks its attacks, limited to each phase's list, while the script runs mechanics on their
  own timers.
  - *Mechanic kinds:* marked shapes that land (circle, ring, cone, line, cross; on the boss, on
    players, following one, or scattered round the arena; repeating), pools left burning, soaks,
    a charge down a marked line, adds (spawning from the walls, round the boss or at set points;
    eggs that hatch if left), a shield that bursts if it isn't broken in time, immunity while
    "weak point" adds live, seams strung between bosses, a move to the arena's centre or back, and
    a heal.
  - *Enrage:* three times the damage, with mechanics half again as often.
  - *Damage* is checked on each screen, as for enemy shots (`fx/Telegraphs.js`); the sim counts
    who stood in a soak.
- **The Brood Mother** (level 16; Normal, Veteran, Elite):
  - *The Brood Warden.* Its guard blocks frontal hits. A Carapace Sweep (cone), Acid Spit (one
    per four players, leaving pools) and a Brood Rush at whoever is furthest. At 70% and 35% the
    brood pours out of the walls; at 35% its carapace hardens and bursts over the arena unless the
    raid breaks it within 14 seconds. Enrages at 7 minutes.
  - *The Psion Choir.* Vael's Dirge (a ring: stand close or well clear), Kzhar's Shriek (lines at
    a third of the raid), Ixa's Lullaby (a soak that follows someone, needs a third of the raid,
    or everyone takes the blast), and Resonance seams between the three. When one falls the
    others hit 30% harder. Enrages at 7½ minutes.
  - *The Brood Mother.* Egg clutches hatch after 14 seconds, plus Acid Rain. At 70% she withdraws
    behind three Brood Hearts and can't be hurt until they're torn out, while the nest convulses
    every 14 seconds. At 40% she frenzies: Spore Rain, Devour (a charge down a marked line at
    whoever is furthest) and a Gravid Burst soak. Enrages at 9 minutes.
- **Rewards:** each arena has its own chest, once a week per encounter per tier (the week turns at
  00:00 UTC on Monday). Its items are rare or better, epic or better from the last chest. The
  **Broodbane** set is heavy, legendary, and only comes from these chests: always from the last,
  35% (plus 10% per tier) from the others. Private runs' tiers now add their extra affixes to elites
  (dungeons too, as 3.3 planned).
- **New enemies:** the Brood Warden, the Choir's three psions, the Brood Mother, Brood Clutches and
  Brood Hearts (new models: `models/Brood.js`), all in the codex.
- **Achievements:** seven, under a new Raids category: Through the Gate, Silence, Matricide
  (*the Matricide*), Into the Deep Nest, The Brood Ends (*Queenslayer*), Untouched (a boss down
  with nobody falling) and Broodbane (*Broodbane*). Outfitter now counts only the seven makers' sets.

- **Raid groups:** two to four parties linked, so 8–16 players *(default 12)*. Formed at a city raid board, or by inviting party leaders.
- **Boss scripting framework:**
  - phases at health thresholds;
  - attack patterns with telegraphs;
  - adds and arena hazards;
  - shields and weak points;
  - an enrage timer.
  - Written as data, like the bestiary.
- **First raid: *The Brood Mother*,** the Act II finale:
  - three bosses (Brood Warden, Psion Choir, the Brood Mother);
  - Normal, Veteran and Elite tiers;
  - raid-only legendary set pieces;
  - weekly reward lockouts *(default)*.
- *The Tether Crown* follows in phase 8.

---

## 10. Phase 8 — Story Acts II–IV and the endgame loop

**Status: not started.** Phase 6a built the event director this phase needs, for Act II's Hive
surges on settlements and the endgame's rotating schedule. Proposed order:
1. **Phase 6 first**, so Act II's surges are public events rather than one-off quest waves (6a's
   Hive Surge is the one Act II will call on; 6b's war-walker is Act III's).
2. **8a: Act II, *The Brood*** (levels 8–16). Farcall as its hub, the Farcall Array as a new story
   place, the Brood Pits story (the dungeon already exists), about 12 quests and Ysolde's
   confession. It ends at the Brood Mother's raid gate: the story then opens the gate, replacing
   phase 7's level-14 gate.
3. **8b: Act III, *Iron Heart*** (16–24). Ironreach, the Synth war-walkers as events, a new
   dungeon (the Foundry Below), the Fallen Titan and the Colossus foundry.
4. **8c: Act IV, *The Tether*** (24–30). Anchorage, the Ring and the Tether, the second raid (*The
   Tether Crown*, on the same boss framework) and the ending choice.
5. **8d: the endgame.**
   - A Nightmare tier for dungeons and raids at the level cap: ×4 health, ×2.2 damage, +3
     affixes, legendary floor for bosses (3.3).
   - The rotating event schedule.
   - More legendary sets.
   - Achievements and titles for all of it.

- **Story:**
  - Acts II–IV with their cities, about 12 story quests each, side quests, and two more dungeons;
  - the second raid;
  - the ending choice.
- **Endgame at the level cap:**
  - tiered dungeons up to Nightmare;
  - a rotating event schedule;
  - achievements and titles;
  - chasing legendary sets.

---

## 11. Things that cut across every phase
- **Saving:**
  - new character data: talents, abilities, achievements, titles, story flags, tier and lockouts;
  - versioned, migrated on load;
  - stored on the server for online characters.
- **Server authority:** the server checks and rolls everything that grants progress (rewards, cooldowns, quest steps, instance entry), as it does today.
- **Mobile:** ability buttons, a tier picker, and journal and codex screens laid out for touch.
- **Testing:**
  - Node checks for the power curve, generators and quests;
  - `npm test` (the multiplayer smoke test);
  - bot load tests for hordes and events;
  - scripted in-game captures (`tools/enemyshots.js` and new dungeon and event tours).
- **Docs:** README sections per system; `docs/MULTIPLAYER.md` covers instances and raid groups.
- **Scenery colliders match on the server** (fixed 2026-10-14, WORK_PLAN S-1).
  - The graphics work gave the client's trees, rocks and cacti mesh-shaped colliders, with wider
    round ones as a fallback.
  - The server's headless world now builds the scenery geometry (without drawing it), so its
    colliders get the same triangles. `tools/physicscheck.mjs` compares the two collider by
    collider, so the server can't drift back to the wider circles unnoticed.

## 12. Open questions *(my defaults in brackets; change any when you review)*
- **Level cap:** 30, with the regions past 30 kept as cap-level zones that tiers make harder [yes].
- **Death penalty:** none beyond the respawn walk; in dungeons, the whole party wiping sends you back to the last checkpoint [yes].
- **Dungeon reward lockout:** daily per tier; raids weekly [yes].
- **Raid size:** 12, as up to three parties [yes].
- **Ability keys:** X, G and T, rebindable later [yes].
- **The story draft above:** tone, names and the ending choice [your call].

---

## Appendix A — Where the plan started

Measured before phase 1, and kept as the plan's starting point (phase 1 replaced attribute
points with talents and re-tuned the curve; see 3).

### The power curve was the main problem
A melee player at each level, all attribute points in Might, gear of their level at a typical
rarity, against a same-level Scav Cutter (measured with the game's own formulas):

| Level | Gear rarity | Player damage | Enemy health | Swings to kill | Hits to die |
|---|---|---|---|---|---|
| 1 | common | 1× | 1× | 2.5 | 25 |
| 5 | uncommon | 3.6× | 1.8× | 1.3 | 34 |
| 10 | rare | 12.9× | 3.8× | 0.75 | 45 |
| 20 | epic | 98× | 17× | 0.43 | 80 |
| 30 | legendary | 688× | 74× | 0.27 | 199 |

By level 8 everything dies in one hit, and you can stand in a camp for a minute. The causes:
- **Attributes stack linearly:** 3 points a level at +5% each, so +135% damage by level 10.
- **A per-level damage bonus** (+3% a level) sits on top of weapon level growth.
- **Rarity spreads too wide:** a legendary deals 1.55× a common, and maker and part bonuses stack on top.
- **Armour reduction isn't measured against the attacker's level:** `100 / (100 + armour)` with armour growing 12% a level, so it keeps rising until enemies barely hurt.

### Other gaps
- **Fights are small:** camps are 4–8 enemies, roaming packs 2–4, and strongholds a boss plus 6.
- **Settlements are one size:** five kinds, each a few buildings, a few folk and sometimes a trader.
- **Quests are a handful:** three fixed ones, generated contracts and hunts, and a bounty. There's no story.
- **No endgame and no goals beyond the next level:** no dungeons, events, raids, achievements or abilities.
