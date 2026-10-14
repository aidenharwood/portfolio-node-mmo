# Cel Blade — remaining content and gameplay improvements

> **Drafted:** 2026-10-14
> **Based on:** `README.md`, [`GAMEPLAY_PLAN.md`](GAMEPLAY_PLAN.md), [`MULTIPLAYER.md`](MULTIPLAYER.md) and [`DEPLOY.md`](DEPLOY.md) as they stand on `main` of `aidenharwood/portfolio-node-mmo`.
> **Not read:** the source code, commit history, issues, or the `.claude` folder. Anything marked **(check)** is inferred from the docs and needs confirming against the code.
> **Sizes** follow GAMEPLAY_PLAN's scale: **S** = a focused change inside an existing system, **M** = about phase 3, **L** = about phases 6–7, **XL** = about phase 5.

---

## 1. Summary

The engine and systems are well ahead of the content. Gameplay phases 1–5 and 7 are built, 6a is built, and every system has its own Node check in `npm test`. What's missing is mostly authored content: the story stops at level 8 of 30, only three of five public events exist, there is one raid of two, and Nightmare isn't built.

Remaining work, in order:

1. A short **stabilise** pass (collider parity, persistence audit, CI and deploy checks).
2. **Act II** (8a), before 6b, because it needs only the Hive Surge that already exists.
3. **Path-following and escort tech**, built once, then **6b** (war-walker, stampede) and escort quests on top of it.
4. **Act III** (8b), **Act IV and the Tether Crown raid** (8c), then the **endgame** (8d).

The biggest gameplay gains outside the phase plan:

- tiers that add mechanics rather than only multipliers;
- group-finding tools;
- key rebinding and accessibility options;
- first-hour onboarding;
- telemetry, so the many "(default)" numbers in the docs get tuned from real play.

Things to leave alone: server authority, instanced loot, raids that scale down to one player, and the habit of a headless check per system. Those are the project's strengths.

---

## 2. Where things stand

| Area | Built | Remaining |
| --- | --- | --- |
| Story | Prologue and Act I: 12 quests, 10 moments, 2 choices, 15 village side quests (5 chains of 3) | Acts II–IV (levels 8–30) |
| Settlements | Hamlets, villages, towns, Brightwater, four story cities with services | Story use of Farcall, Ironreach and Anchorage as act hubs |
| Dungeons | Rustjaw Foundry, Sunken Vault, Brood Pits (open-world and private, three tiers) | Two more planned; Synth, Maker and Wild themes exist but are reachable only from the dev panel |
| Public events | Director, Hive Surge, Scav Siege, Maker Anomaly, overrun and Retake | War-walker and Stampede (6b); Synth and Wild settlements get no events until then |
| Raids | The Brood Mother (3 bosses, 3 tiers, Broodbane set, weekly chests) | The Tether Crown |
| Difficulty | Normal, Veteran, Elite (Threat) | Nightmare |
| Progression | 3 talent trees, 12 abilities, 73 achievements (28 titles), codex | Content for Acts II–IV; anything after level 30 |
| Social | Parties, raid groups, friends, guilds, mail, trade, moderation | Four ❌ items in MULTIPLAYER.md's status table (see 6.3) |
| Operations | One process and a layers-plus-gateways cluster, metrics, backups | Binary snapshots, PgBouncer, regions in a layer (not needed yet, see 7) |

---

## 3. Decisions needed before authoring

GAMEPLAY_PLAN §12 still lists these as unconfirmed defaults, and the story draft is marked "your call". The first three block writing Acts III and IV.

| # | Decision | Suggested default |
| --- | --- | --- |
| 1 | **Story bible:** what the Synths' "true orders" are, what the Makers are, and what each ending means. The outline names them but doesn't define them. | Write one page per act before Act II ships, so Act II can plant the right flags. |
| 2 | **Where the ending choice happens:** inside the Tether Crown raid, or in a story step after it. | After it, as a per-character `choose` step. It's easier to test in `questcheck` and doesn't make a personal choice depend on a 12-player fight. |
| 3 | **What endings change:** world state or only dialogue and titles. | A visible world state (waystone colour, a city's skyline, an epilogue moment) plus a title. Not three content trees. |
| 4 | **Raid gate rule once the story opens it** (replacing the level-14 gate). | A story flag on any raid member opens it for the group, so a friend further behind isn't locked out. |
| 5 | **Nightmare numbers.** GAMEPLAY_PLAN's ×4 health / ×2.2 damage were written against Elite ×2.5 / ×1.7, but Elite shipped as ÷2.5 damage taken and ×1.85 damage dealt. ×2.2 is only about 19% above that. | Re-derive through `tools/powercurve.mjs` with its own hits-to-kill and hits-to-die bands. |
| 6 | **After level 30:** any progression, or only gear and achievements. | A small horizontal system (see 5.5), optional. |
| 7 | **Lockouts for a small realm:** weekly raid chests per tier, daily dungeon chests. | Make them settings, not constants, and consider reduced rewards on repeat clears rather than none. |
| 8 | The remaining §12 defaults (no death penalty, cap 30, raid size 12, keys X/G/T). | Confirm them and delete the "(default)" tags. |

---

## 4. Recommended order

| Step | Work | Size | Depends on | Why here |
| --- | --- | --- | --- | --- |
| 0 | Stabilise (5.0) | S–M | — | Cheap, and the collider issue bites hordes in forests. |
| 1 | **8a Act II — The Brood** (5.1) | L | 6a, decisions 1 and 4 | Anyone past level 8 has no authored arc today. |
| 2 | **Path-following and escort tech**, then **6b** (5.2) | M–L | Step 0 colliders | Act III needs the war-walker. Escort quests and caravan content reuse the same tech. |
| 3 | **8b Act III — Iron Heart** (5.3) | L | Step 2, Act II flags | |
| 4 | **8c Act IV — The Tether, and the Tether Crown** (5.4) | XL | Step 3, decisions 2 and 3 | |
| 5 | **8d Endgame** (5.5) | L | Step 4 | Nightmare and the rotation need both raids. |

GAMEPLAY_PLAN offers 6b or 8a as the next step. I'd take 8a: it only needs the Hive Surge, and it fills the 8–16 gap that players reach first. 6b's moving-defendable tech isn't needed until Act III.

**Parallel track:** the improvements in section 6 slot between steps. The small ones (rebinding, nameplate invite, telemetry) fit alongside Act II. Tier mechanics and dungeon variety should land before step 3, so Acts III and IV benefit.

---

## 5. Remaining content

### 5.0 Stabilise first (S–M)

- **Collider parity (S–M).** The client's trees, rocks and cacti have mesh-shaped colliders, while the server's headless world uses wider circles (up to 1.65 m for a cactus, against a 0.45 m circle before). Enemies get pushed off scenery further than players see. GAMEPLAY_PLAN suggests building the same hulls from the geometry on the server without drawing them. Also add a client/server parity assertion to `tools/physicscheck.mjs`. The suite went red once because the headless world lacked meshes, and a parity check stops that class of break.
- **CI and deploy check (S).** DEPLOY.md says to "push to `master`", but the repo's branch is `main`. **(check)** the workflow trigger. MULTIPLAYER.md also notes the Docker image hadn't been built in the dev environment, so confirm a CI-built image has actually run, including `npm run test:cluster`.
- **Persistence audit (S).** Characters save every 30 s, and a crashed layer loses up to that much. Confirm **(check)** that trade completion, mail claims, chest claims, weekly and daily lockouts (`settings.lockouts`) and legendary drops are written through immediately. Then a crash inside the window can't duplicate an item or refresh a lockout. Events, overrun settlements and ground loot are memory-only by design, which is fine.
- **Doc fixes (S).** MULTIPLAYER.md's Phase 3 text still says "attributes" (talents replaced them). DEPLOY.md's smoke-test line is shorter than what the test now does. GAMEPLAY_PLAN §1 keeps the original power-curve table for reference and could move to an appendix. The README is a systems encyclopaedia of several thousand words; split it into a short README (what it is, how to run it, a screenshot or two, the live link) and `docs/SYSTEMS.md`.

### 5.1 Act II — The Brood, levels 8–16 (L)

**Scope** (from GAMEPLAY_PLAN §10): Farcall as hub, the Farcall Array as a new story place, the Brood Pits story, about 12 quests, Ysolde's confession, and the story opening the Brood Mother raid gate.

**Straw-man quest skeleton** (rewrite freely; objective types are the ones the quest system already has):

1. **The Road to Farcall** (goto, talk): Ashe's handoff from New Meridian; the city hub opens.
2. **Gone Quiet** (goto, use, kill): three hamlets stopped answering; spore pods are rooted outside them.
3. **Hold the Line** (event hook, defend): a quest-started Hive Surge on a named settlement; taking part counts.
4. **Ysolde's Confession** (talk, choose): the Hive came on the Pilgrim. The choice sets flags that Acts III and IV read.
5. **The Farcall Array** (goto, use, defend): the new story place; it is calling the Hive. Power it down in stages while holding.
6. **Voice in the Chitin** (kill a named foe, collect): a captured Psion; the drop gives the Pits' coordinates.
7. **Into the Brood Pits** (dungeon): the existing dungeon, to the Brood Matron.
8. **What the Matron Knew** (talk, use): the nest's location.
9. **Silence the Array** (defend, use): destroy the transmitter under waves.
10. **Marshal the Wardens** (talk): the war table, which also introduces raid groups.
11. **The Gate Opens** (goto): a flag opens the Brood Mother raid gate.
12. **Report to Ashe** (talk, choose, moment): the act closes and plants Act III (the Synths stirring).

**Reuse:**

- the Brood Pits and its Brood Matron;
- the Hive Surge and the Hive's enemies and affixes;
- the Brood Mother raid;
- the README's "deep-space dish array" landmark builder as the base for the Array **(check)**.

**New work:**

- the Farcall Array as a story place in `world/story.js`;
- named foes and about 8–10 moments;
- a flag registry (see section 9);
- achievements for Act II, with titles;
- Farcall's story dressing;
- Act II side content (5.6).

**New tech:**

- **A quest-to-event hook.** Surges are random public events, but a story quest can't wait on randomness. Let a quest step ask the director to start a named event at a given place, with the tier locked to Normal.
- A story-flag-gated raid gate (decision 4).

**Keep the raid optional for story progress.** The story ends at the gate opening, and Act III shouldn't require a raid clear.

**Exit criteria:**

- `tools/questcheck.mjs` plays Act II start to finish, including both choices and the gate flag.
- `tools/eventcheck.mjs` covers a quest-started surge.
- `tools/powercurve.mjs` stays in band at 8–16.
- README and docs updated.
- Server restart noted.

### 5.2 Path-following and escort tech, then 6b (M–L)

**Build once, use three times.** The war-walker, the stampede's caravans and escort quests all need the same thing: a moving, damageable thing the sim walks along a route. The world already has roads linking waystones to use as routes.

**Shared tech:**

- a moving "defendable" in the sim, with health, a route and a stuck-recovery rule;
- interest management for something that crosses regions (`wev` currently covers events within about 700 m);
- scaling with participants, as existing events do.

**The events:**

- **Synth War-walker.** A Colossus-class walker with escorts crosses a region toward a town. Break its weak points before it arrives. Reuse the raid framework's "immunity while weak-point adds live" and shield-bursts-if-not-broken mechanics rather than inventing new ones **(check)**. If it arrives, use the existing overrun and Retake flow.
- **Wild Stampede.** Thunderhorns and a Behemoth drive across a caravan route; protect the caravans.
- **Director rules.** Synth and Wild settlements currently get no events (the director waits for 6b). Add their rules, and `/admin event walker|stampede`.

**Escort objective.** GAMEPLAY_PLAN deferred it ("escort waits"). Add it on the same tech and use it for the caravan village's side chain, which already has a "long road".

**Exit criteria:**

- `tools/eventcheck.mjs` covers both events won, lost and abandoned, scaling, and a walker that gets stuck.
- A load check with a moving entity across region boundaries.
- Events-category achievements, such as a walker down and a stampede stopped.
- Codex entries for the new enemies.

### 5.3 Act III — Iron Heart, levels 16–24 (L)

**Scope:** Ironreach as hub, war-walkers as public events, the Foundry Below (a new dungeon), the Fallen Titan and the Colossus foundry. Waking the waystones roused the Makers' old guardians.

**Straw-man beats:**

- Ironreach, and the first war-walker sightings.
- A Synth emissary and a choice: parley or destroy. This is where the Synths' true orders come out (decision 1).
- The Fallen Titan: retrieve a control core. The README's "kneeling titan mech" landmark is the likely base **(check)**.
- The Foundry Below, the Synth-theme dungeon. The theme is already built.
- The Colossus foundry, with the existing Colossus as the boss.
- The act closes by reading Act II's flags back to the player.

**New work:**

- about 12 quests and 8–10 moments;
- one dungeon (apply the variety ideas in 6.2);
- Synth-flavoured side content;
- a new legendary set for the dungeon (5.5);
- achievements.

**Balance:** level 18 and up adds the champion and an extra affix to camps, so re-run `powercurve` and `hordecheck` on the 16–24 band.

### 5.4 Act IV — The Tether, levels 24–30, and the Tether Crown raid (XL)

**Scope:** Anchorage as hub, the Ring opening, the Tether, a Maker-vault dungeon (the theme exists), the second raid and the ending choice.

**Straw-man beats:**

- Anchorage, and the Ring opening. The "precursor ring gate" landmark is the likely base **(check)**.
- A Maker-vault dungeon.
- **The climb to the anchor.** The space-elevator-stump landmark could be a traversal set-piece, like a vertical gauntlet that uses the game's slide, bullet-jump and glide tech. That's the game's strongest system and a story beat that uses it would stand out.
- The Tether Crown raid.
- The ending choice (decisions 2 and 3), an epilogue moment and titles.

**The second raid.** It should feel different from the Brood Mother on the same `BossScript` framework. The framework currently has circles, rings, cones, lines, crosses, pools, soaks, charges, adds, shields, immunity, seams between bosses, arena moves and heals. Candidate new mechanic kinds:

- **Player-to-player tethers** (seams exist only between bosses).
- **Interruptible casts.**
- **A moving safe zone or shrinking arena.**
- **Relay objects:** carry an orb to a socket.

There is no role system (no taunt or tank), so mechanics lean on positioning. Keep them readable without roles.

**Exit criteria:**

- `tools/raidcheck.mjs` covers the new mechanic kinds, three tiers, wipes and lockouts.
- A load run with 12 stand-in players, server and client. Check the client with F3 on mid-range hardware: 12 skinned players with cloth capes, telegraphs and adds is the heaviest scene in the game.
- Touch layout for 12-player raid frames.

### 5.5 Endgame (8d, L)

- **Nightmare.** Re-derive its numbers (decision 5). It applies to dungeons and raids at the cap, with bands added to `powercurve`, a legendary floor for bosses and +3 affixes.
- **A rotating schedule.** A weekly featured dungeon, a featured event type and a weekly modifier (see 6.9). It gives players a reason to come back that isn't only gear.
- **More legendary sets.** One per new dungeon and raid, on the same pattern as Broodbane (raid-only, always legendary).
- **Itemization chase** (6.8): scrap into a reforge sink, a bad-luck guard and set tokens.
- **Optional post-cap progression.** XP has no use at 30. A small horizontal system, such as ability mastery ranks or Maker-resonance perks, keeps kills meaningful without raising the power curve.
- **Achievements and titles** for all of it.

### 5.6 Content gaps outside the phase plan

- **The Wild has no story role.** Acts I–IV cover Scavs, Hive, Synths and Makers. Build one optional Wild-cavern dungeon (the theme is built and unused) and a small set of Wild-flavoured side chains.
- **Codex lore.** The codex covers enemies, landmark kinds and makers, and nothing from the story. Add entries unlocked by progress (the Pilgrim, the Makers, the Tether, each city), so the story persists after a quest completes.
- **Side content for levels 8–30.** Side quests are chains per village kind. The docs don't say how a repeat of the same chain in another village of that kind behaves. **(check)** how it plays across a region. If it's the same chain everywhere, seeded variants (a different victim, culprit or place) would cut the repetition cheaply.
- **Act-handoff polish:** New Meridian to Farcall, Farcall to Ironreach, Ironreach to Anchorage. Each needs a clear "go here next" through the journal, compass and map.
- **Achievements** for Acts II–IV, the two dungeons, the second raid, the new events and Nightmare.

---

## 6. Gameplay improvements

Each is grounded in what the docs describe. Ordered by how much I'd expect them to matter.

### 6.1 Tiers should change mechanics, not only numbers (M)

**Problem.** Veteran and Elite multiply damage taken and dealt (×1.45 and ×1.85 incoming, ÷1.6 and ÷2.5 outgoing), add affixes in instances, and improve loot. On trash that mostly means longer fights, not harder ones.

**Proposal.** Boss scripts are data (`combat/bosses.js`), so tier overrides are cheap. Veteran adds one extra mechanic per boss and Elite a second, with tighter telegraph windows. Check whether enrage timers differ by tier **(check)**. Nightmare would add a phase.

### 6.2 Dungeon variety and boss scripting (M)

**Problem.** Every dungeon shares one main-route shape: entrance, three halls, mini-boss arena, two halls with a lift, final boss. Only side rooms reshuffle per run. Five dungeons on one shape will feel repetitive.

**Proposal.**

- Give each new dungeon a structural twist: a vertical descent with several lifts, a loop that unlocks a shortcut, a power-door race, a gauntlet of short bosses.
- Run final bosses through `BossScript` (currently raids) at Veteran and up **(check)**, so dungeon tiers differ in play and not only in health.

### 6.3 Group finding and party quality of life (M)

**Problem.** MULTIPLAYER.md lists four unbuilt items: inviting from a nameplate, a leader disbanding the party, fast travel to the waystone nearest a party member, and (in DEPLOY.md) joining a friend's layer. Raid groups are formed with typed commands. Players on different layers can't see each other, so a friend outside your party may be on another layer.

**Proposal.**

- Build the four items.
- Add a looking-for-group list at the war table and the dungeon and raid gates, so people find others without chat.
- Show each public event's participant count on the tracker, so players can choose busy ones.

### 6.4 Input and accessibility (S–M)

**Problem.** The control scheme is deep (slide, bullet jump, glide, dash, clamber, three ability keys, a long menu list) and the docs promise "rebindable later" without a rebind screen. Telegraphs, party colours and nameplates lean on colour.

**Proposal.**

- Key rebinding in Settings.
- A colour-blind palette for telegraphs and party colours, and distinct shapes as well as hues.
- Confirm touch parity for the new group UI: raid frames, the beacon vote, the event tracker and telegraphs.

### 6.5 First-hour experience (M)

**Problem.** I couldn't find a movement tutorial in the docs **(check)**, but the traversal tech is the game's signature and is easy to miss. The hosted title requires an account, which is friction for a casual visitor.

**Proposal.**

- Teach sprint and dash, slide into bullet jump, glide, and clamber inside the Prologue with prompts, with a short optional movement course.
- Add a "try it" path on the hosted title: guest or single-player, keeping accounts for the shared realm.

### 6.6 Telemetry for balance (S–M)

**Problem.** `powercurve` and `hordecheck` guard the bands, but nothing measures real play. Several numbers rest on stand-in defenders or are marked "(default)": event durations, boss enrage timers, chest thresholds.

**Proposal.** Add counters to the existing Prometheus `/metrics`: deaths per region level, time to kill by tier, event win, loss and abandon rates, raid wipes per boss and phase, and chest claims. Review them before tuning Acts III and IV.

### 6.7 Story in the codex (S)

See 5.6. The codex only tracks enemies, landmarks and makers.

### 6.8 Endgame itemization (M)

**Problem.** Rarity and maker spreads were compressed on purpose (best-in-slot is about 1.5–1.8× on-level rare), so a numeric upgrade is small. Loot excitement then rests on perks and set effects. Scrap exists, but there's no sink to turn it into a chase, and gold sinks are few (respec, shops).

**Proposal.**

- Make legendary perks define builds, not add percentages.
- Scrap feeds a reforge of one perk.
- Add a bad-luck guard or set tokens for sets that are raid-only.
- Add a gold sink such as reforging or a cosmetic.

### 6.9 Small-realm friendliness (S–M)

**Problem.** The realm is on a personal cluster, and a quiet realm weakens an MMO. Weekly and daily lockouts are harsh when only a few people play. The director only starts events near an active player.

**Proposal.**

- Make lockouts settings, with reduced repeat rewards.
- Keep solo raids (already supported).
- Add ambient life: Warden patrols and caravans that react to events, so a lone visitor sees a living world.
- Lean on the looking-for-group list (6.3).

### 6.10 Lower priority

| Idea | Why | Size |
| --- | --- | --- |
| Level sync in parties | Enemies five or more levels below give a tenth of the XP, so a higher-level friend flattens content and earns almost nothing. | M |
| Event variety | Surge and Siege depend on the settlement's faction, so many events look the same. Add a convoy and an alpha hunt on the new path tech. | M |
| Weekly modifiers | Part of the rotation (5.5): a mutator for the featured dungeon. | S–M |
| Photo mode | A cel-shaded game screenshots well. The dev panel's noclip and render toggles are most of it. | S |
| Server-judged raid damage | Enemy hits on players are judged on the player's own screen, so a modified client can ignore damage and farm chests. Co-op only limits the harm, so this matters once the population is real. An interim plausibility check on hits landed against health lost is cheap. | M–L |

---

## 7. Technical and operations: what to defer

The docs measure about 110 players per layer and 300 players on three layers. That is far beyond what a portfolio realm is likely to see, so these can wait:

- **Binary snapshots** (about half the wire size).
- **PgBouncer** (matters past about 30 layers).
- **Regions within a layer** on worker threads.
- **External crash reporting.**

**Trigger to revisit:** a layer's p95 tick time creeping toward 35 ms, or sustained player counts near the soft cap of 110. Watch `/metrics` for both.

---

## 8. Definition of done for each workstream

The repo already ends each phase the same way, and this plan keeps it:

1. `npm test` green, with new or extended Node checks for the new content.
2. Power-curve bands re-checked for any new level range or tier.
3. In-game captures (the existing shot tools) of new places and encounters.
4. README and the relevant `docs/` sections updated, and GAMEPLAY_PLAN's status block refreshed.
5. A note when the server code changed and the realm needs a restart.
6. A short play report.

Additions:

- A client frame-rate check (F3) for any new crowd or encounter.
- A touch pass for new UI.

---

## 9. Risks

- **Content volume.** About 36 story quests, 30 or so moments, three story places, two dungeons, a raid, two events, and the achievements that go with them. Mitigate with vertical slices: finish one act end to end (quests, moments, achievements, codex, side content, check) before starting the next.
- **Story consistency.** Prologue and Act I flags drive dialogue today, and Acts II–IV will add many more. Keep one flag registry (a doc or a data file) and have `questcheck` fail on any flag that is read but never set.
- **Raid scaling at the bottom and top.** A boss is tuned from one player (×2.2) up to twelve (×48). Run `raidcheck` at both ends for the Tether Crown.
- **Small-population endgame.** Lockouts, event frequency and group content all lean on there being players (6.9).
- **Visual and systems depth versus content.** The README's graphics and animation sections are far deeper than its content lists. The remaining work is mostly writing, level design and encounter design, so protect time for it.
