# Act II — The Brood: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Act II's 12 story quests (levels 8–16), their moments, barks and flags to the game, so that `questcheck` plays Prologue → Act I → Act II end to end on both branches of the Act II choice.

**Architecture:** Act II is data in `src/rpg/storyline.js` (the same `STORY` / `MOMENTS` / `BARKS` shape as Act I), plus two story places in `src/world/story.js`. The engine gets three small extensions: flag-keyed `say` lines, a `dungeon` objective driven by the existing `dclear` op, and a flag condition on story folk. Everything runs through `QuestLog` and `CharacterCore`, so server and offline play are identical.

**Tech Stack:** Node ESM, three.js (headless on the server). The checks are `tools/*check.mjs`, run by `npm test`.

**Spec:** [`docs/superpowers/specs/2026-10-14-act-ii-story-design.md`](../specs/2026-10-14-act-ii-story-design.md). Work-plan tasks: A-5, A-6 and A-7 in [`docs/WORK_PLAN.md`](../../WORK_PLAN.md).

## Global Constraints

- **Shared checkout.** Commit only your own paths (`git commit -- <paths>`), never `git add -A`. Change `docs/WORK_PLAN.md` only in Story-lane blocks (A-5, A-6 and A-7 once claimed, DEC-1a, DEC-9, the Story row, new log lines), with small Edit replacements.
- **Never restart the server on port 8080.** `src/rpg/`, `src/world/` and `src/sim/` change the build hash, so log "(user) restart the server" on each task that touches them.
- **Quest ids:** `b1`–`b12`, `kind: 'story'`, `act: 2`. `b1.requires = ['a8']`, and each later quest requires the one before it.
- **Givers:**
  - `city1:warden` (High Warden Ashe; the code says "her") for b1, b10, b11 and b12.
  - `city2:captain` (**Captain Vey Okonta**, a new character added in Task 2, chosen by the user on 2026-10-14) for b2–b4 and b6–b9. Vey is a signal-mast officer: dry and exact, and runs Farcall's watch from the masts. High Warden Imre (`city2:warden`) stays in the background with no Act II lines.
  - `sage` (Ysolde) for b5.
  - Write Vey's lines without pronouns; the user hasn't given any.
- **Flags, exactly these names:**
  - `act2_started` (b1), `hamlets_cleared` (b2), `array_found` (b4), `told_ashe` | `kept_wardens_secret` (b5's choice), `psion_slain` (b6), `matron_read` (b8), `array_destroyed` (b9), `broodgate_open` (b11), `act2_done` (b12).
  - Act I flags read: `trusted_ysolde`, `kept_secret`, `krell_captured`, `krell_freed`.
- **Moments:** `act2` (title card on b1 accept, `title: ['Act II', 'The Brood']`), `array` (b4), `deathpulse` (b9), `act2end` (b12 done, `title: ['Act II complete', 'The Brood']`).
- **Copy:**
  - Use these two lines verbatim, both spoken by `'The Pilgrim'`:
    - in `array`: "They built a lullaby. You woke it screaming."
    - in b5's `trusted_ysolde` opening: "You told me about the voice. I owe you the same." (spoken by Ysolde)
  - All other lines are new. Write them in Act I's voice (short, spoken, British spelling) and keep them consistent with spec §2.
  - Name no new people or places beyond the spec's. The founding Warden stays unnamed.
- **No raid needed:** nothing in b1–b12 requires a raid clear.

## Review Focus

1. **A character that finished Act I before this ships** gets `b1` offered by Ashe on next login. Test: Task 4.
2. **The Brood Pits cleared before b7 was taken** doesn't satisfy b7. Only a `dclear` while the objective is current counts, and the dungeon can be run again. Test: Task 3.
3. **Every flag-keyed line resolves** for all four Act I flag combinations: no `undefined` said or offered. Test: Task 9.
4. **The second choice branch** (`kept_wardens_secret`) plays to `act2_done`, not just the first option. Test: Task 9.
5. **Krell appears at the Spore Field only for `krell_freed`.** A character who captured him never sees him there. Test: Task 2.

---

## Prerequisites from other lanes (contracts, not built here)

| Needed by | From | Contract this plan consumes |
|---|---|---|
| Task 5 | **A-2** quest-to-event hook | An objective type that A-2 defines for "a quest-started Hive Surge at a ref, Normal tier, participation counts", plus a way for `questcheck` to satisfy it (A-2's `eventcheck` harness). Use A-2's shape exactly as recorded in its notes. |
| Task 6, Task 7 | **A-4** Farcall Array place | Story place key `array` in `STORY_PLACES`, with objects `array:console` (b4's `use`) and `array:transmitter` (b9's `use`), and a hold area usable as `defend at: 'array'`. If A-4 lands with other names, use those and update this table. |
| Task 8 | **A-3** story-flag raid gate (DEC-4) | The gate reads `broodgate_open`. |
| Every quest task | **A-1** flag registry | Register every flag above in A-1's registry. If A-1 isn't done yet, the Story lane adds them when it lands. |

Tasks 1–4 have no prerequisites and can start now.

---

### Task 1: Flag-keyed `say` lines, and the Act II entry in ACTS

**Files:**
- Modify: `src/rpg/Quests.js:633-635` (`talkTo`)
- Modify: `src/rpg/storyline.js:13-16` (`ACTS`)
- Test: `tools/questcheck.mjs`

**Interfaces:**
- Produces: a stage's `say[ref]` may be a string or a flag-keyed object `{ <flag>: text, default: text }`, resolved by `QuestLog.pick`, the same rule as `offer` and `turnIn`. `ACTS[2] = { act: 2, title: 'Act II', sub: 'The Brood', levels: '8–16' }`.

- [ ] **Step 1: Write the failing check.** In `questcheck.mjs`, before the story section, add a block named `'Lines keyed by story flags'`. Build a throwaway `QuestLog` on the same host, register a fake quest def `{ id: 'zz', kind: 'story', giver: 'warden', stages: [{ text: 't', objectives: [{ type: 'talk', npc: 'warden' }], say: { warden: { trusted_ysolde: 'A', default: 'B' } } }] }`, accept it, and set `flags.trusted_ysolde = true`. Then assert:
  - `talkTo('warden')` pushes a `say` event with text `'A'`;
  - with the flag cleared, it pushes `'B'`.
- [ ] **Step 2: Run `node tools/questcheck.mjs`.** Expected: ✗ on the new check (the text is `[object Object]`).
- [ ] **Step 3: Implement.** In `talkTo`, use `this.fill(this.pick(text), q)`. Add the ACTS row.
- [ ] **Step 4: Run `node tools/questcheck.mjs`.** Expected: `questcheck: all good`.
- [ ] **Step 5: Commit.** `git commit -m "Quests: say lines can be keyed by story flags; Act II in ACTS" -- src/rpg/Quests.js src/rpg/storyline.js tools/questcheck.mjs`

### Task 2: Captain Vey Okonta and the Act II story places (the Spore Field, the Psion's nest)

**Files:**
- Modify: `src/world/story.js`: `STORY_FOLK` (`captain`), `STORY_PLACES`, `ORDER` (append only), `storyIn`, and `resolve` for the hamlet refs and `cityN:<folk>`
- Modify: `src/world/places.js` `planCity`: add the captain to the act-2 city's heart
- Test: `tools/poicheck.mjs`, `tools/questcheck.mjs`

**Interfaces:**
- Produces:
  - `STORY_FOLK.captain = { name: 'Vey Okonta', title: 'Captain of the Watch', look: {...} }`, in Warden colours (see `settlements.js:189`) with a mast-officer touch (goggles).
  - In `planCity`, only when `place.act === 2`, append `{ id: \`n:${place.key}:c7\`, place: place.id, role: 'story', folk: 'captain', x, z, facing, seed: 0x0ce7a }` near the citadel (bearing `citadel + 0.35`, distance `CITY.door`). Build it without `folk()`, because `folk()` draws from `rng` and an extra draw would move every district.
  - `resolve` for `cityN:<tail>` matches `n.role === tail || n.folk === tail`, so `city2:captain` finds Vey.
  - Already supported, no change needed: folk `when` with `flag` (`QuestLog.whenHolds`, `src/rpg/Quests.js:697`).
  - `sporefield`: `{ name: 'The Spore Field', from: 'city2', turn: -1.2, dist: CITY_WALL + 140, r: 12, flat: [8, 14], act: 2 }`. It is a `type: 'story', kind: 'sporefield'` POI with three objects, `sporefield:pod1` to `sporefield:pod3` (model `'sporepod'`, or `'strongbox'` until a model exists), and story folk `krell` with `when: { quest: 'b2', flag: 'krell_freed' }`.
  - `psionnest`: `{ name: 'Psion\'s Nest', from: 'city2', turn: 0.9, dist: CITY_WALL + 220, r: 12, flat: [8, 14], act: 2 }`. It is a `type: 'camp'` POI, `race: 'hive'`, `style` per existing hive camps, `level: Math.max(12, P.level)`, `boss: { type: 'psion', name: 'Hive Psion', tag: 'psion' }`.
  - On the existing `broodpits` POI, a second object: `broodpits:node` (model `'console'` until a nest-node model exists), a few metres from `broodpits:mouth`. It is b8's `use` target. Don't reuse the mouth, which enters the dungeon.
  - Refs `quiet1`, `quiet2`, `quiet3`: the three hamlets nearest `city2` (same pattern as `raided`, sorted by distance and resolved once), each `target(hamlet)`.
- [ ] **Step 1: Write the failing checks.**
  - `poicheck`:
    - `storyKeys()` includes `sporefield` and `psionnest`, and each resolves through `storyRef`;
    - the places from Act I sit at the same coordinates as before this change (record them for seed 12345 before editing);
    - the four city districts' seeds are unchanged.
  - `questcheck`:
    - `storyRef(w, 'city2:captain')` resolves to an npc named "Vey Okonta";
    - `quiet1`–`quiet3` resolve to three different hamlets;
    - Krell's folk `when` holds for `{ b2 active, krell_freed }` and fails for `krell_captured`.
- [ ] **Step 2: Run `node tools/poicheck.mjs && node tools/questcheck.mjs`.** Expected: ✗ on the new checks.
- [ ] **Step 3: Implement.** Append to `ORDER` only, so earlier places don't move. Hive camp spawning already reads `camp.def.boss` (`src/sim/WorldSim.js:445`), so the Psion gets its name and tag for free.
- [ ] **Step 4: Run `npm test`.** Expected: all green, including `buildcheck` (server and client colliders for the new places).
- [ ] **Step 5: Commit** with `-- src/world/story.js src/world/places.js tools/poicheck.mjs tools/questcheck.mjs`. Log "(user) restart the server".

### Task 3: The `dungeon` objective

**Files:**
- Modify: `src/rpg/Quests.js`: add `dungeonCleared(d)`; document `dungeon` in the objective-type list in `storyline.js:9-11`
- Modify: `src/rpg/CharacterCore.js:456` (`case 'dclear'`): call `this.quests.dungeonCleared(r.d)`
- Modify: `tools/questcheck.mjs` `playStage`: handle `dungeon` with `give({ op: 'dclear', roll: { d: o.d, tier: 0, name: 'x' } })`
- Test: `tools/questcheck.mjs`

**Interfaces:**
- Produces: objective `{ type: 'dungeon', d: '<dungeon id>', count: 1, text }`, where `d` is a key of `DUNGEONS` in `src/world/dungeons.js` (the Brood Pits is `'brood'`). Any tier, and open world, counts.

- [ ] **Step 1: Write the failing check** `'a dungeon clear counts only while the step is current'`. Use a fake quest with one `dungeon` objective for `'brood'`:
  - a `dclear` for `'brood'` **before** accepting → after accepting, progress is 0;
  - a `dclear` for `'foundry'` after accepting → still 0;
  - a `dclear` for `'brood'` → complete.
- [ ] **Step 2: Run `node tools/questcheck.mjs`.** Expected: ✗.
- [ ] **Step 3: Implement** `dungeonCleared(d: string): void`, as `this.advance((o) => o.type === 'dungeon' && o.d === d)`.
- [ ] **Step 4: Run `npm test`.** Expected: green.
- [ ] **Step 5: Commit** with `-- src/rpg/Quests.js src/rpg/CharacterCore.js src/rpg/storyline.js tools/questcheck.mjs`. Log "(user) restart the server".

### Task 4: Quests b1–b2 (The Road to Farcall, Gone Quiet)

**Files:**
- Modify: `src/rpg/storyline.js`: `STORY` (after `a8`), `MOMENTS` (`act2`), `BARKS`
- Modify: `tools/questcheck.mjs`: extend the end-of-story asserts
- Test: `tools/questcheck.mjs`

**Interfaces:**
- Consumes: Task 1 (flag-keyed `say`), Task 2 (`sporefield:pod1..3`, `quiet1..3`).

**Content** (spec §3 rows 1–2):

- **b1**, giver `city1:warden`, `returnTo: 'city2:captain'`, `moments: { accept: 'act2' }`. Offer keyed by `krell_captured` (Ashe mentions Krell spoke of other "lids") and `default`.
  - Stage 1: `goto city2`.
  - Stage 2: `talk city2:captain`.
  - `setFlags: ['act2_started']`.
- **b2**, giver `city2:captain`.
  - Stage 1: `goto` `quiet1`, `quiet2` and `quiet3` (three objectives).
  - Stage 2: `use` `sporefield:pod1..3`, plus `killRace` with `race: 'hive', near: 'sporefield', count: 8`. The `say` for `sporefield:krell` is Krell's hint.
  - `setFlags: ['hamlets_cleared']`.
  - The turn-in carries the survivor's "started singing wrong".
- Bark: `sporefield:krell` when `{ quest: 'b2', stage: 1 }`.
- Rewards: follow Act I's progression (`a8` gives xp 1000 and gold 400). Scale up by about 10% per quest and alternate weapon and armour, `minTier: 3`.

- [ ] **Step 1: Write the failing check.** After the story loop, assert:
  - `quests.flags.act2_started && quests.flags.hamlets_cleared`;
  - a fresh `QuestLog` with `completed = new Set(STORY.filter(q => q.act < 2).map(q => q.id))` gets `b1` in `available('city1:warden')` (Review Focus 1).
- [ ] **Step 2: Run `node tools/questcheck.mjs`.** Expected: ✗.
- [ ] **Step 3: Add b1, b2, `act2` and the bark.**
- [ ] **Step 4: Run `npm test`.** Expected: green. `questcheck` prints both quests' stages.
- [ ] **Step 5: Commit** with `-- src/rpg/storyline.js tools/questcheck.mjs`.

### Task 5: Quest b3 (Hold the Line)

**Prerequisite:** A-2 is `done`.

**Files:** `src/rpg/storyline.js`; `tools/questcheck.mjs` (`playStage` handles A-2's objective through A-2's harness)

- [ ] **Step 1: Write the failing check:** the story loop reaches b3's turn-in.
- [ ] **Step 2: Run `node tools/questcheck.mjs`.** Expected: ✗ at b3.
- [ ] **Step 3: Add b3.** Giver `city2:captain`. One stage: A-2's event objective at `quiet1` (the named settlement). The turn-in says the Hive is moving *toward* something.
- [ ] **Step 4: Run `npm test`.** Expected: green.
- [ ] **Step 5: Commit** with `-- src/rpg/storyline.js tools/questcheck.mjs`.

### Task 6: Quests b4–b5 (The Farcall Array, Ysolde's Confession)

**Prerequisite:** A-4 is `done`.

**Files:** `src/rpg/storyline.js` (`STORY`, `MOMENTS.array`, `BARKS`); `tools/questcheck.mjs`

**Content** (spec §3 rows 4–5 and §4):

- **b4**, giver `city2:captain`, `returnTo: 'sage'`.
  - Stage 1: `goto array`.
  - Stage 2: `use array:console` and `defend at: 'array', race: 'hive', waves: 2`. `done: { moment: 'array' }`.
  - `setFlags: ['array_found']`.
- **b5**, giver `sage`. One stage: `choose npc: 'sage'`.
  - `say.sage` is keyed: `trusted_ysolde` (the verbatim line, followed by the confession) and `default` (the player confronts her: the `kept_secret` path).
  - The choices:
    - `{ label: 'Tell Ashe the truth', set: 'told_ashe' }`
    - `{ label: 'Keep it between us', set: 'kept_wardens_secret' }`
  - Each has a reply in Ysolde's voice. `turnIn` is keyed by both flags.
- Bark: `sage` when `{ quest: 'b5', stage: 0 }`.

- [ ] **Step 1: Write the failing check:** after the loop, `quests.flags.array_found`, and exactly one of `told_ashe` / `kept_wardens_secret` is set.
- [ ] **Step 2: Run `node tools/questcheck.mjs`.** Expected: ✗.
- [ ] **Step 3: Add b4, b5, the `array` moment and the bark.**
- [ ] **Step 4: Run `npm test`.** Expected: green.
- [ ] **Step 5: Commit** with `-- src/rpg/storyline.js tools/questcheck.mjs`.

### Task 7: Quests b6–b9 (Voice in the Chitin, Into the Brood Pits, What the Matron Knew, Silence the Array)

**Files:** `src/rpg/storyline.js` (`STORY`, `MOMENTS.deathpulse`); `tools/questcheck.mjs`

**Interfaces:**
- Consumes: Task 2 (`psionnest`, tag `psion`), Task 3 (`dungeon` objective), A-4 (`array:transmitter`).

**Content** (spec §3 rows 6–9):

- **b6**, giver `city2:captain`.
  - Stage 1: `goto psionnest`.
  - Stage 2: `kill tag: 'psion'` and `collect` `{ from: { tag: 'psion' }, chance: 1, count: 1, text: 'Take the Psion\'s chitin' }`.
  - `setFlags: ['psion_slain']`.
- **b7**, giver `city2:captain`. Stage 1: `goto broodpits`. Stage 2: `{ type: 'dungeon', d: 'brood' }`.
- **b8**, giver `city2:captain`. Stage 1: `use broodpits:node` (Task 2), the nest-node read. Stage 2: `talk city2:captain`. `setFlags: ['matron_read']`.
- **b9**, giver `city2:captain`, `returnTo: 'city1:warden'`.
  - Stage 1: `goto array`.
  - Stage 2: `defend at: 'array', race: 'hive', waves: 3`.
  - Stage 3: `use array:transmitter`, `done: { moment: 'deathpulse' }`.
  - `setFlags: ['array_destroyed']`.
- `deathpulse`: two shots. The waystones flicker red; then a far-off metallic answer, with no named speaker or a `''` caption.

- [ ] **Step 1: Write the failing check:** after the loop, `psion_slain`, `matron_read` and `array_destroyed` are all set. Also check that `records.dungeons.brood` was incremented by the run.
- [ ] **Step 2: Run `node tools/questcheck.mjs`.** Expected: ✗.
- [ ] **Step 3: Add b6–b9 and `deathpulse`.** `playStage`'s kill branch already credits `o.tag ?? o.from?.tag`, so b6's `kill` and `collect` pair needs no harness change.
- [ ] **Step 4: Run `npm test`.** Expected: green.
- [ ] **Step 5: Commit** with `-- src/rpg/storyline.js tools/questcheck.mjs`.

### Task 8: Quests b10–b12 and the act close

**Prerequisite:** A-3 is `done` (the gate reads `broodgate_open`).

**Files:** `src/rpg/storyline.js` (`STORY`, `MOMENTS.act2end`); `tools/questcheck.mjs`; `tools/raidcheck.mjs` if A-3 didn't already cover the flag-set path through the story

**Content** (spec §3 rows 10–12, §4):

- **b10**, giver `city1:warden`. One `talk city1:warden` stage, with `say` keyed `told_ashe` (Ashe leads openly; Ysolde is absent) and `kept_wardens_secret` (Ashe leads; Ysolde's token). This introduces raid groups: the text points to the war table and the group UI.
- **b11**, giver `city1:warden`. `goto` the Brood Mother raid gate ref (A-3's). `setFlags: ['broodgate_open']`.
- **b12**, giver `city1:warden`. One `talk` stage. `moments: { done: 'act2end' }`. `turnIn` seeds Act III: reports of Synth movement in the highlands. `setFlags: ['act2_done']`.

- [ ] **Step 1: Write the failing check:** after the loop, `act2_done && broodgate_open`, and `core.records.raids` is still empty. The act completed without a raid clear.
- [ ] **Step 2: Run `node tools/questcheck.mjs`.** Expected: ✗.
- [ ] **Step 3: Add b10–b12 and `act2end`.**
- [ ] **Step 4: Run `npm test`.** Expected: green.
- [ ] **Step 5: Commit** with `-- src/rpg/storyline.js tools/questcheck.mjs`.

### Task 9: Both branches, and every Act I combination

**Files:** `tools/questcheck.mjs`

**Interfaces:**
- Produces: `playStory(choices: Record<questId, optionIndex>) → { quests, core }`. It runs the story loop on a fresh `QuestLog` and `CharacterCore` against the same `HeadlessWorld`. `playStage`'s `choose` branch reads `choices[id] ?? 0`.

- [ ] **Step 1: Refactor.** Wrap the existing story loop in `playStory`, with the `choose` index taken from `choices`. The current asserts keep running on `playStory({})`.
- [ ] **Step 2: Add the checks.** For each of the 8 combinations `{ a6: 0|1, a8: 0|1, b5: 0|1 }`:
  - the run reaches `act2_done`;
  - exactly one of each pair of choice flags is set;
  - every `say`, `offer` and `turnIn` text produced during the run is a non-empty string not containing `undefined` or `[object` (collect them from the `fx` `say` events and from `quests.pick` on each quest's `offer` and `turnIn`).
- [ ] **Step 3: Run `node tools/questcheck.mjs`.** Expected: `all good`, with 8 combination lines. Check the runtime stays under about 10 s; if it doesn't, run the side chains only once.
- [ ] **Step 4: Run `npm test`.** Expected: green.
- [ ] **Step 5: Commit** with `-- tools/questcheck.mjs`. Then update WORK_PLAN A-5, A-6 and A-7 (status `review`, notes, log line), and ask the user to:
  1. restart the server;
  2. read Act II's lines in `storyline.js` (they own the final dialogue);
  3. play from b1.
