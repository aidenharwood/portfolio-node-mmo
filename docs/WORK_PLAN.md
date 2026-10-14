# Cel Blade — working plan

> **Audience:** Claude (Claude Code or chat), working through the remaining content and improvements one task at a time. The file is also readable by humans.
> **Narrative and rationale:** [ROADMAP.md](ROADMAP.md). **Design detail:** [GAMEPLAY_PLAN.md](GAMEPLAY_PLAN.md), [MULTIPLAYER.md](MULTIPLAYER.md), [DEPLOY.md](DEPLOY.md).
> **Created:** 2026-10-14 from ROADMAP.md. Written from the docs only; the source was not read.
> **`(check)`** marks an unverified assumption. When you verify it, correct the text and remove the tag.
> **Paths** follow the README: code under `src/` is cited relative to it (`sim/WorldEvents.js` is `src/sim/WorldEvents.js`). `server/`, `tools/` and `docs/` are repo-root. Verify the first time you open each.
> **Sizes:** S = a focused change inside an existing system, M = about phase 3, L = about phases 6–7, XL = about phase 5.

---

## 1. How to use this file

1. Read sections 1–5 before any work. For a task, read only that task plus the GAMEPLAY_PLAN sections it names.
2. **Pick the task.** Follow the sequence in section 5. A task is eligible only if every ID in `depends` is `done` and every `DEC-` in `needs` is `decided` (or its gate is met).
3. Set the task's `- status:` line to `doing` before starting. Work on one task at a time.
4. As acceptance items become true, change `- [ ]` to `- [x]`. Items tagged `(user)` can only be ticked by the user.
5. When the work is finished:
   - set `done` if everything is ticked and no `(user)` item remains;
   - set `review` if any `(user)` item remains (a server restart, a playtest, a CI run to confirm);
   - set `blocked` with a one-line reason if you cannot continue.
6. **Append** to the task's `- notes:` (dated, never rewrite history) and add a line to the progress log (section 11).
7. Update "Next up" (section 10).
8. If this file disagrees with the code, trust the code. Fix the file and log the correction.
9. New ideas go in the backlog (section 12). Don't do them unasked.

Grep-friendly conventions: tasks are `### ID Title` headings, and status is the line `- status: <value>`. `grep -n "^- status:" docs/WORK_PLAN.md` lists them all.

### Status values

| Status | Meaning |
| --- | --- |
| `todo` | Not started. |
| `doing` | In progress (at most one at a time). |
| `review` | Built and checked; waiting on the user (restart, playtest, confirmation). |
| `blocked` | Can't continue; the reason is in notes. |
| `done` | Finished and confirmed. |
| `parked` | Deliberately not scheduled. Don't start without the user's say-so. |

---

## 2. Working agreement

These come from how the project already works (see GAMEPLAY_PLAN §2 and the README's dev tools).

- **Never restart the user's server on port 8080.** Phases that change shared or server code need a restart, so say so in the log and in your reply.
- **Don't run bot load tests against the user's running server**; they create accounts. `npm run load` starts a throwaway server of its own.
- **One simulation, two hosts.** `sim/`, `rpg/`, `items/`, `combat/`, `core/` and `world/` run on both server and client (and offline). Changes there change the server's build hash, and a client won't go online against a stale build. Never fork logic between server and client.
- **Server authority.** Anything that grants progress (rewards, cooldowns, quest steps, instance entry) is a server-checked op, and offline single-player runs the same code locally.
- **New character data** is versioned and migrated on load. Never break existing saves.
- **New network messages** are documented in `docs/MULTIPLAYER.md`.
- **Story is the user's.** Beat sheets here are proposals. Before writing names, dialogue or plot facts into the game, show the act's beat sheet and get a yes (the `DEC-9`–`DEC-11` gates). Don't resolve open story questions yourself.
- **Decisions.** If a task `needs` an `open` decision, ask the user one concise question and record the answer in section 4. If the user says "use your defaults", record each suggested value as the answer.
- **Keep it playable.** Every task leaves the game running and `npm test` green.
- **No scope creep.** Don't refactor unrelated code or restyle the HUD.

### Standard definition of done

Applies to every task unless it says otherwise:

- [ ] `npm test` passes (it runs the power curve, horde, progression, place, settlement, story, dungeon, surface, building, raid, event and physics checks, then the smoke test).
- [ ] A new or extended Node check covers the new behaviour, in the style of the existing `tools/*check.mjs`.
- [ ] If levels or tiers changed: `node tools/powercurve.mjs` is in band, and `tools/hordecheck.mjs` where relevant.
- [ ] If anything visual or a new crowd or encounter was added: in-game captures (the `tools/*shots.js` helpers) and an F3 frame check.
- [ ] If UI was added: a touch pass.
- [ ] README and the relevant `docs/` text updated; GAMEPLAY_PLAN's status block refreshed if a phase changed.
- [ ] `status` updated, notes appended, progress-log line added, and any restart or playtest the user needs is stated.

---

## 3. Where things stand (2026-10-14)

- **Built:** gameplay phases 1–5 and 7, and 6a (the event director, Hive Surge, Scav Siege, Maker Anomaly, overrun and Retake).
- **Story:** Prologue and Act I (12 quests, 10 moments, 2 choices, 15 village side quests). Levels 8–30 have no authored story.
- **Content counts:** 3 dungeons (Rustjaw Foundry, Sunken Vault, Brood Pits), 1 raid (The Brood Mother), 3 of 5 event types, 73 achievements (28 titles), 4 story cities.
- **Dungeon themes** built but only reachable from the dev panel: Synth, Maker and Wild.
- **Tiers:** Normal, Veteran, Elite. Nightmare is not built.
- **Known issue:** the server's headless world uses wider scenery colliders than the client (up to 1.65 m for a cactus against a 0.45 m circle before).
- **Known limits** (MULTIPLAYER.md): enemy hits on a player are judged on that player's screen; events, overrun settlements, ground loot and camp timers are memory-only; a layer crash loses up to 30 s of progress and its parties.

---

## 4. Decisions register

Status is `open` or `decided`. Claude records the answer, never invents it. "Suggested" is a proposal only.

### DEC-1 Story bible
- status: open
- needs from user: what the Synths' "true orders" are, what the Makers are, what each of the three endings means (shut it down, take it, wake the Makers).
- suggested: one page per act, written before that act's tasks begin.
- blocks: B-2, B-3, B-4, C-1, C-2, C-6
- answer:

### DEC-2 Where the ending choice happens
- status: open
- suggested: a per-character `choose` step after the Tether Crown raid, not inside it (simpler to test in `questcheck`, and it doesn't tie a personal choice to a 12-player fight).
- blocks: C-6
- answer:

### DEC-3 What the endings change
- status: open
- suggested: a visible world state (waystone colour, a city's skyline, an epilogue moment) plus a title. No separate content trees.
- blocks: C-6
- answer:

### DEC-4 Raid gate rule once the story opens it
- status: open
- suggested: a story flag on any raid member opens the gate for the group (so someone further behind isn't locked out), and the level-14 floor is dropped.
- blocks: A-3
- answer:

### DEC-5 Nightmare numbers
- status: open
- context: the original plan's ×4 health and ×2.2 damage were written against Elite ×2.5 and ×1.7. Elite shipped as ÷2.5 damage taken and ×1.85 damage dealt, so ×2.2 is only about 19% above it.
- suggested: re-derive through `tools/powercurve.mjs` with its own hits-to-kill and hits-to-die bands, and ask the user to approve the bands before applying.
- blocks: E-1
- answer:

### DEC-6 Progression after level 30
- status: open
- suggested: a small optional horizontal system (ability mastery ranks or Maker-resonance perks); nothing that raises the power curve.
- blocks: E-5
- answer:

### DEC-7 Lockout policy for a small realm
- status: open
- context: raid chests are weekly per encounter per tier, and dungeon chests daily per dungeon per tier.
- suggested: make the periods settings, not constants, and give reduced rewards on repeat clears instead of none.
- blocks: G-7
- answer:

### DEC-8 Confirm the remaining GAMEPLAY_PLAN §12 defaults
- status: open
- items: level cap 30, no death penalty, raid size 12, ability keys X/G/T.
- suggested: confirm all, and delete the "(default)" tags in GAMEPLAY_PLAN.
- blocks: nothing hard (S-4 can apply it)
- answer:

### DEC-9 Act II beat sheet approved
- status: open
- blocks: A-5, A-6, A-7
- answer:

### DEC-10 Act III beat sheet approved
- status: open
- blocks: B-1, B-2, B-3, B-4, B-5
- answer:

### DEC-11 Act IV beat sheet approved
- status: open
- blocks: C-1 to C-7
- answer:

---

## 5. Sequence

Follow this order. `depends` is the safety net if the order is changed.

1. **Stabilise:** S-1, S-2, S-3, S-4.
2. **Telemetry early:** G-6 (so later tuning uses real data).
3. **Act II:** A-1, A-2, A-3, A-4, A-5, A-6, A-7, A-8, A-9, A-10.
   Between Act II tasks, when the user wants a change of pace, slot in G-4 (rebinding and accessibility), G-3 (group finding) or G-5 (first hour).
4. **Path-following and 6b:** P-1, P-2, P-3, P-4, P-5, P-6.
5. **Before Act III:** G-1 (tier mechanics), G-2 (dungeon variety).
6. **Act III:** B-1 to B-5.
7. **Act IV and the second raid:** C-1 to C-7.
8. **Endgame:** E-1 to E-6.
9. **Anything left:** X-1, X-2, G-7, then parked items by the user's choice.

---

## 6. Tasks — stabilise

### S-1 Server and client collider parity
- status: todo
- size: S–M
- depends: —
- why: the server uses wider circle colliders for trees, rocks and cacti than the client's mesh hulls, so enemies get pushed off scenery further than players see. The test suite went red once because the headless world has no meshes.
- start: `server/world.js` (headless world), `world/MeshCollision.js`, `world/World.js`, `tools/physicscheck.mjs`
- scope:
  - Build the same hulls on the server from the scenery's geometry, without drawing anything (GAMEPLAY_PLAN §11 suggests this).
  - Add a client-versus-server parity assertion so this class of break fails in `npm test`.
- acceptance:
  - [ ] For a fixed seed, server and client collider footprints for trees, rocks and cacti match within a stated tolerance.
  - [ ] `tools/physicscheck.mjs` asserts parity and fails if the headless world drifts.
  - [ ] `tools/hordecheck.mjs` and `tools/loadsim.mjs` still pass; the new ms per tick at 150 stand-in players is recorded in notes (the baseline was 8.6 ms).
  - [ ] Standard DoD.
  - [ ] (user) server restarted and a few minutes spent fighting a camp in a forest.
- notes:

### S-2 CI trigger and deploy verification
- status: todo
- size: S
- depends: —
- why: DEPLOY.md says the first build comes from pushing to `master`, but the repo's branch is `main`. MULTIPLAYER.md also says the Docker image wasn't built in the dev environment.
- start: `.github/workflows/deploy.yaml`, `deploy/k8s/templates/cel-blade/`, `Dockerfile`, `docker-compose.yml`
- acceptance:
  - [ ] The workflow's trigger matches the real default branch, or DEPLOY.md is corrected. **(check)** the actual trigger first.
  - [ ] The test job runs `npm test` and the cluster smoke test.
  - [ ] (user) a CI run has built and pushed the image and the realm runs from it.
- notes:

### S-3 Persistence audit
- status: todo
- size: S
- depends: —
- why: characters save every 30 s and a crashed layer loses up to that much. A crash inside that window must not duplicate an item or refresh a lockout.
- start: `server/characters.js`, `server/store.js`, `server/trade.js`, `server/social.js` (mail), `settings.lockouts`
- scope: **(check)** whether these are written through immediately: trade completion, mail attachment claims, chest claims (dungeon, raid, event), the weekly and daily lockouts, and legendary drops.
- acceptance:
  - [ ] A check (extend the smoke test, or add `tools/persistcheck.mjs`) kills a layer between an op and the next save and asserts there is no duplication and no lockout reset.
  - [ ] Anything not written through is fixed, or the gap is documented in MULTIPLAYER.md's known limits.
  - [ ] Standard DoD.
- notes:

### S-4 Doc fixes
- status: todo
- size: S
- depends: S-2
- scope:
  - MULTIPLAYER.md Phase 3 still says "attributes"; talents replaced them.
  - DEPLOY.md's smoke-test description is shorter than what the test now does.
  - DEPLOY.md's `master` reference, per S-2.
  - GAMEPLAY_PLAN §1 keeps the original power-curve table; move it to an appendix and refresh the status block.
  - Apply DEC-8 once decided (remove the "(default)" tags).
  - Link this plan from the README's dev section.
- acceptance:
  - [ ] Each item above is done or logged as intentionally skipped.
- notes:

### S-5 README split
- status: parked
- size: M
- depends: S-4
- why: the README is a very long systems reference. A short README (what it is, how to run it, a screenshot or two, the live link) plus `docs/SYSTEMS.md` would suit a portfolio repo.
- gate: ask the user first; this rewrites their README.
- acceptance:
  - [ ] (user) approved.
  - [ ] Every section moved verbatim to `docs/SYSTEMS.md`, and the README's links updated.
- notes:

---

## 7. Tasks — content

### Act II — The Brood (levels 8–16)

**Beat sheet (proposed — gate DEC-9).** Objective types are ones the quest system already has.

1. **The Road to Farcall** (goto, talk): Ashe's handoff from New Meridian; Farcall's hub opens.
2. **Gone Quiet** (goto, use, kill): three hamlets stopped answering; spore pods are rooted outside.
3. **Hold the Line** (event hook, defend): a quest-started Hive Surge on a named settlement; taking part counts.
4. **Ysolde's Confession** (talk, choose): the Hive came on the Pilgrim. The choice sets flags that Acts III and IV read.
5. **The Farcall Array** (goto, use, defend): a new story place that is calling the Hive. Power it down in stages while holding.
6. **Voice in the Chitin** (kill a named foe, collect): a captured Psion; the drop gives the Pits' coordinates.
7. **Into the Brood Pits** (dungeon): the existing dungeon, to the Brood Matron.
8. **What the Matron Knew** (talk, use): the nest's location.
9. **Silence the Array** (defend, use): destroy the transmitter under waves.
10. **Marshal the Wardens** (talk): the war table, which introduces raid groups.
11. **The Gate Opens** (goto): a flag opens the Brood Mother raid gate.
12. **Report to Ashe** (talk, choose, moment): the act closes and plants Act III (the Synths stirring).

The story must be completable without the raid: it ends at the gate opening, and Act III must not require a raid clear.

### A-1 Story flag registry and check
- status: todo
- size: S–M
- depends: —
- why: Prologue and Act I flags drive dialogue today, and Acts II–IV add many more.
- start: `rpg/storyline.js`, `rpg/Quests.js`, `world/story.js` (`storyRef`), `tools/questcheck.mjs`
- scope: one registry (a data file or a doc section) listing each flag with who sets it and who reads it, and a `questcheck` step that fails on a flag read but never set, and warns on one set but never read.
- acceptance:
  - [ ] Every existing flag is registered.
  - [ ] `questcheck` fails on an unset-but-read flag (prove it with a deliberate break, then revert).
  - [ ] Standard DoD.
- notes:

### A-2 Quest-to-event hook
- status: todo
- size: M
- depends: —
- why: Hive Surges are random public events, and a story quest can't wait on randomness (GAMEPLAY_PLAN §10 wants Act II's surges to be public events, not one-off quest waves).
- start: `sim/WorldEvents.js`, `rpg/questWatch.js`, `ui/EventUI.js`
- scope:
  - A quest step can ask the director to start a named event at a given place, with the tier locked to Normal.
  - Taking part (at least the 60-point chest threshold) satisfies the step, for each player separately, since the event is public.
  - Decide how story events interact with the director's spacing and cooldown rules. **(check)** and record in notes.
  - Works online (the server watches) and offline.
- acceptance:
  - [ ] `tools/eventcheck.mjs` covers a quest-started surge: started, joined by two stand-in players, won, step advanced for both.
  - [ ] A lost or abandoned story event leaves the step re-attemptable.
  - [ ] The protocol is documented if `wev` changes.
  - [ ] Standard DoD.
  - [ ] (user) server restarted.
- notes:

### A-3 Story-flag raid gate
- status: todo
- size: S–M
- depends: A-1
- needs: DEC-4
- start: `world/raids.js`, `server/raidgroups.js`, the city gate yard
- scope: replace the level-14 gate with the rule from DEC-4; when refused, say why.
- acceptance:
  - [ ] `tools/raidcheck.mjs` covers: flag set opens, flag unset refuses with a reason, and the group rule from DEC-4.
  - [ ] Existing characters past the old gate level aren't locked out of a raid they could enter before. **(check)** and decide a migration rule with the user if they are.
  - [ ] Standard DoD.
- notes:

### A-4 Farcall Array story place and Farcall dressing
- status: todo
- size: M
- depends: S-1
- start: `world/story.js`, `world/Landmarks.js` (the "deep-space dish array" builder is the likely base, **(check)**), `world/Towns.js`, `tools/poicheck.mjs`, `tools/buildcheck.mjs`
- scope: the Array as a story place stood in every world from its seed on flat open ground near Farcall, with consoles for `use` steps and a hold area for `defend` steps; story dressing for Farcall.
- acceptance:
  - [ ] Placement is deterministic for a seed and the place is on the map in gold.
  - [ ] Built headlessly by `poicheck`; the server's colliders match the client's (`buildcheck`); nobody stands inside a wall.
  - [ ] Capture saved.
  - [ ] Standard DoD.
- notes:

### A-5 Quests II-1 to II-4
- status: todo
- size: M
- depends: A-1
- needs: DEC-9
- scope: quests 1–4 of the beat sheet with their stages, lines, barks, moments, flags (registered in A-1) and map markers. Quest 3 uses A-2.
- acceptance:
  - [ ] `tools/questcheck.mjs` plays quests 1–4 through the character's rules as the server runs them, including the choice and its flags, and nothing is taken or handed in out of order.
  - [ ] Moments are skippable and don't block server ops.
  - [ ] Journal, tracker, compass, minimap and map show the new steps.
  - [ ] Standard DoD.
- notes:

### A-6 Quests II-5 to II-9
- status: todo
- size: M
- depends: A-2, A-4, A-5
- needs: DEC-9
- scope: quests 5–9, using the Array, the Brood Pits and named foes.
  - **(check)** whether the `clear` objective supports dungeons. If not, add a dungeon-clear objective driven by the server's `dclear` message.
  - Quest drops are rolled into the kill's reward.
- acceptance:
  - [ ] `questcheck` plays quests 5–9, including a dungeon clear.
  - [ ] `questWatch` handles the Array's `reach` and `defended` states on the server.
  - [ ] Standard DoD.
- notes:

### A-7 Quests II-10 to II-12 and the act close
- status: todo
- size: S–M
- depends: A-3, A-6
- needs: DEC-9
- scope: the war-table raid-group introduction, the gate opening, Ashe's report, the Act III seed moment, and titles.
- acceptance:
  - [ ] `questcheck` plays Act II start to finish, including the gate flag and both Act II choices.
  - [ ] Act II doesn't require a raid clear.
  - [ ] Standard DoD.
- notes:

### A-8 Act II achievements, titles and codex lore
- status: todo
- size: S–M
- depends: A-7
- start: `rpg/achievements.js`, `rpg/codex.js`, `tools/progresscheck.mjs`
- scope: story, dungeon and event achievements for Act II, with titles. Codex entries unlocked by progress (the Pilgrim, Farcall, the Array), since the codex currently covers only enemies, landmark kinds and makers.
- acceptance:
  - [ ] `progresscheck` counts the new achievements through the character's rules and covers the new codex entries.
  - [ ] Standard DoD.
- notes:

### A-9 Act II side content (levels 8–16)
- status: todo
- size: M
- depends: A-5
- scope:
  - First play a region and record how a repeated village-kind chain behaves (the docs don't say). **(check)**
  - If chains repeat identically, add seeded variants (a different victim, culprit or place).
  - Add Hive-flavoured contracts and a few chains for Farcall's districts.
- acceptance:
  - [ ] Findings recorded in notes before any new content is written.
  - [ ] `questcheck` covers the new chains.
  - [ ] Standard DoD.
- notes:

### A-10 Act II close-out
- status: todo
- size: S
- depends: A-8, A-9
- scope: `powercurve` and `hordecheck` bands across 8–16, an F3 frame check at Farcall and the Array, a touch pass over the new UI, docs, GAMEPLAY_PLAN status block (phase 8a built).
- acceptance:
  - [ ] Standard DoD.
  - [ ] (user) a short play report from the user, then set `done`.
- notes:

### Path-following and Phase 6b

### P-1 Moving defendable and path-following in the sim
- status: todo
- size: M
- depends: S-1
- why: the war-walker, the stampede's caravans and escort quests all need a moving, damageable thing the sim walks along a route.
- start: `sim/WorldEvents.js`, `sim/WorldSim.js`, the roads that link waystones (as routes)
- scope: a moving defendable with health, a route, stuck-recovery, scaling with participants, and interest management for something that crosses regions (`wev` currently covers events within about 700 m).
- acceptance:
  - [ ] Headless test: a defendable follows a road across several regions and is reported to nearby players throughout.
  - [ ] A stuck one recovers or fails cleanly.
  - [ ] Standard DoD.
- notes:

### P-2 Synth War-walker event
- status: todo
- size: M
- depends: P-1
- scope: a Colossus-class walker with escorts crosses a region toward a town. Weak points must be broken before it arrives. Reuse the raid framework's immunity-while-weak-point-adds-live and shield mechanics **(check)**. If it arrives, use the existing overrun and Retake flow.
- acceptance:
  - [ ] `tools/eventcheck.mjs` covers won, lost and abandoned, scaling with participants, and a stuck walker.
  - [ ] A new enemy model and a codex entry.
  - [ ] Standard DoD.
  - [ ] (user) server restarted.
- notes:

### P-3 Wild Stampede event
- status: todo
- size: M
- depends: P-1
- scope: thunderhorns and a Behemoth drive across a caravan route; caravans are moving defendables.
- acceptance:
  - [ ] `tools/eventcheck.mjs` covers won, lost and abandoned, and scaling.
  - [ ] Standard DoD.
- notes:

### P-4 Director rules, admin commands and dev panel for 6b
- status: todo
- size: S
- depends: P-2, P-3
- scope: Synth and Wild settlements start receiving events (the director currently skips them). Add `/admin event walker|stampede` and the dev-panel entries.
- acceptance:
  - [ ] `eventcheck` covers the director's choices for Synth and Wild settlements on a real world.
  - [ ] `docs/DEPLOY.md`'s admin table updated.
- notes:

### P-5 Escort objective
- status: todo
- size: M
- depends: P-1
- scope: an escort quest objective on the same tech, used for the caravan village's chain (its "long road" is currently not a real escort).
- acceptance:
  - [ ] `questcheck` covers an escort completed, failed and abandoned.
  - [ ] Standard DoD.
- notes:

### P-6 Phase 6b close-out
- status: todo
- size: S
- depends: P-2, P-3, P-5
- scope: Events-category achievements (a walker down, a stampede stopped), codex entries, a load run with a moving entity across region boundaries, docs, GAMEPLAY_PLAN status (6b built).
- acceptance:
  - [ ] Standard DoD.
  - [ ] (user) a play report.
- notes:

### Act III — Iron Heart (levels 16–24)

**Beat sheet (proposed — gate DEC-10).**

1. Ironreach, and the first war-walker sightings.
2. A Synth emissary and a choice (parley or destroy); the Synths' true orders come out (DEC-1).
3. The Fallen Titan: retrieve a control core. The "kneeling titan mech" landmark is the likely base **(check)**.
4. The Foundry Below: a Synth-theme dungeon.
5. The Colossus foundry: the existing Colossus as boss.
6. The act closes by reading Act II's flags back to the player.

### B-1 Ironreach hub and opening quests
- status: todo
- size: M
- depends: A-10, P-2
- needs: DEC-10
- scope: Ironreach's story dressing, beats 1–2, war-walker hooks into the story (quest-started via A-2), flags registered.
- acceptance:
  - [ ] `questcheck` plays the new quests, including the choice and Act II flags read back.
  - [ ] Standard DoD.
- notes:

### B-2 The Fallen Titan story place and quests
- status: todo
- size: M
- depends: B-1
- needs: DEC-1, DEC-10
- scope: beat 3 and the place.
- acceptance:
  - [ ] Placement, `poicheck` and `buildcheck` as in A-4.
  - [ ] `questcheck` plays the quests.
  - [ ] Standard DoD.
- notes:

### B-3 The Foundry Below dungeon
- status: todo
- size: L
- depends: B-1, G-2
- needs: DEC-1, DEC-10
- start: `world/dungeons.js`, `world/DungeonGen.js`, `sim/Dungeons.js`, `tools/dungeoncheck.mjs`
- scope: a Synth-theme dungeon with a structural twist from G-2 (not the standard route), open-world copy and private runs at all tiers, a reward chest, achievements.
- acceptance:
  - [ ] `dungeoncheck` covers the layout across many private runs and a headless run through the instance manager.
  - [ ] Waygate and gate-yard entry work, with the story flag it needs.
  - [ ] Standard DoD.
- notes:

### B-4 The Colossus foundry
- status: todo
- size: M
- depends: B-3
- needs: DEC-10
- scope: an open-world stronghold or dungeon boss encounter using the existing Colossus, with named mechanics.
- acceptance:
  - [ ] `hordecheck` or `dungeoncheck` covers it, as appropriate.
  - [ ] Standard DoD.
- notes:

### B-5 Act III close-out
- status: todo
- size: M
- depends: B-2, B-4, P-6
- scope: remaining quests (to about 12), moments, side content for levels 16–24, achievements and codex lore, `powercurve` and `hordecheck` across 16–24 (level 18 and up adds champions and an extra affix), docs and status.
- acceptance:
  - [ ] `questcheck` plays Act III start to finish.
  - [ ] Standard DoD.
  - [ ] (user) a play report.
- notes:

### Act IV — The Tether (levels 24–30)

**Beat sheet (proposed — gate DEC-11).**

1. Anchorage, and the Ring opening. The "precursor ring gate" landmark is the likely base **(check)**.
2. A Maker-vault dungeon.
3. **The climb to the anchor:** the "space-elevator stump" landmark as a traversal set-piece that uses slide, bullet jump and glide.
4. The Tether Crown raid.
5. The ending choice (DEC-2, DEC-3), an epilogue moment and titles.

### C-1 Anchorage hub and the Ring
- status: todo
- size: M
- depends: B-5
- needs: DEC-1, DEC-11
- scope: Anchorage's story dressing, the Ring story place and its quests.
- acceptance:
  - [ ] Placement, `poicheck` and `buildcheck` as in A-4; `questcheck` plays them.
  - [ ] Standard DoD.
- notes:

### C-2 Maker-vault dungeon
- status: todo
- size: L
- depends: C-1, G-2
- needs: DEC-1, DEC-11
- scope: a Maker-theme dungeon with a structural twist, all tiers, a reward chest and achievements.
- acceptance:
  - [ ] `dungeoncheck` as in B-3.
  - [ ] Standard DoD.
- notes:

### C-3 The climb (traversal set-piece)
- status: todo
- size: M
- depends: C-1
- needs: DEC-11
- scope: a vertical gauntlet at the elevator stump built for the movement tech, with fall recovery that doesn't punish (no death penalty, DEC-8).
- acceptance:
  - [ ] `physicscheck` covers the set-piece's collision (nothing passes through, ledges clamber).
  - [ ] Touch controls can finish it. **(check)**
  - [ ] Standard DoD.
  - [ ] (user) playtest on keyboard and touch.
- notes:

### C-4 New BossScript mechanic kinds
- status: todo
- size: M
- depends: —
- start: `sim/BossScript.js`, `combat/bosses.js`, `combat/shapes.js`, `fx/Telegraphs.js`
- why: the Tether Crown should feel different from the Brood Mother. The framework has circles, rings, cones, lines, crosses, pools, soaks, charges, adds, shields, immunity, seams between bosses, arena moves and heals. There is no taunt or tank role, so mechanics lean on positioning.
- scope: candidate kinds (confirm the list with the user): player-to-player tethers, interruptible casts, a moving safe zone or shrinking arena, and relay objects (carry an orb to a socket). Each is data-driven, telegraphed and judged on each screen like existing marks, with server counting where needed.
- acceptance:
  - [ ] `tools/raidcheck.mjs` covers each new kind.
  - [ ] Protocol additions documented in MULTIPLAYER.md.
  - [ ] Standard DoD.
  - [ ] (user) server restarted.
- notes:

### C-5 The Tether Crown raid
- status: todo
- size: XL
- depends: C-4, C-2
- needs: DEC-11
- scope: layout, bosses and scripts, Normal, Veteran and Elite tiers (using G-1's tier overrides), chests with lockouts per DEC-7, a raid-only legendary set (see E-3), codex entries, achievements.
- acceptance:
  - [ ] `raidcheck` covers each boss across tiers, wipes, enrage, lockouts and the chests.
  - [ ] A load run with 12 stand-in players, with the server's ms per tick recorded.
  - [ ] A client F3 check with 12 skinned players, cloth capes, telegraphs and adds on mid-range hardware.
  - [ ] Raid frames usable on a phone.
  - [ ] Standard DoD.
  - [ ] (user) a playtest with at least two people.
- notes:

### C-6 Ending choice, epilogue and world state
- status: todo
- size: M
- depends: C-5
- needs: DEC-2, DEC-3
- scope: the per-character choice, the world-state change for each ending, an epilogue moment, titles.
- acceptance:
  - [ ] `questcheck` plays all three endings and their flags.
  - [ ] The world state is per-character, or the shared-world consequence is documented. **(check)** and discuss with the user.
  - [ ] Standard DoD.
- notes:

### C-7 Act IV close-out
- status: todo
- size: M
- depends: C-3, C-5, C-6
- scope: remaining quests (to about 12), moments, side content for levels 24–30, achievements and codex lore, `powercurve` across 24–30, docs and status (phase 8c built).
- acceptance:
  - [ ] `questcheck` plays Act IV start to finish.
  - [ ] Standard DoD.
  - [ ] (user) a play report.
- notes:

### Endgame

### E-1 Nightmare tier
- status: todo
- size: M
- depends: C-5
- needs: DEC-5
- scope: Nightmare for dungeons and raids at the cap, with its own hits-to-kill and hits-to-die bands in `tools/powercurve.mjs`, +3 affixes, a legendary floor for bosses, and the extra mechanic from G-1.
- acceptance:
  - [ ] `powercurve` has Nightmare bands and fails when a level leaves them.
  - [ ] `dungeoncheck` and `raidcheck` run at Nightmare.
  - [ ] Standard DoD.
- notes:

### E-2 Rotating schedule and weekly modifiers
- status: todo
- size: M
- depends: E-1
- scope: a weekly featured dungeon, a featured event type, and a mutator for the featured dungeon.
- acceptance:
  - [ ] A check covers the rotation (deterministic from the UTC week).
  - [ ] The schedule is visible in the journal or map.
  - [ ] Standard DoD.
- notes:

### E-3 Legendary sets for the new content
- status: todo
- size: M
- depends: B-3, C-2, C-5
- start: `items/sets.js`, `models/ArmorForms.js`, `rpg/Stats.js`
- scope: raid-only and dungeon sets on the Broodbane pattern (always legendary, own colours, 2- and 4-piece bonuses).
- acceptance:
  - [ ] A set check (extend `tools/progresscheck.mjs` or `tools/armory.html`) shows each set's pieces and bonuses.
  - [ ] Collection achievements added.
  - [ ] Standard DoD.
- notes:

### E-4 Itemization chase
- status: todo
- size: M
- depends: E-3
- why: rarity and maker spreads were compressed on purpose (best-in-slot is about 1.5–1.8× on-level rare), so a numeric upgrade is small, and gold sinks are few (respec, shops).
- scope: legendary perks that define builds rather than add percentages; scrap feeding a one-perk reforge; a bad-luck guard or set tokens for raid-only sets; a gold sink.
- acceptance:
  - [ ] Each is a server-checked op with a headless check.
  - [ ] `powercurve` stays in band (best-in-slot must stay under the 1.8× cap).
  - [ ] Standard DoD.
- notes:

### E-5 Post-cap progression
- status: parked
- size: M
- depends: E-1
- needs: DEC-6
- notes:

### E-6 Endgame achievements and titles
- status: todo
- size: S
- depends: E-2, E-3, E-4
- scope: achievements and titles for Nightmare, the rotation, the new sets and the second raid.
- acceptance:
  - [ ] `progresscheck` covers them.
  - [ ] Standard DoD.
- notes:

### Other content

### X-1 Wild-faction dungeon and side chains
- status: todo
- size: L
- depends: G-2
- why: Acts I–IV cover Scavs, Hive, Synths and Makers, so the Wild has no story role. The Wild-cavern theme is built and unused.
- scope: one optional Wild-cavern dungeon and a few Wild-flavoured side chains.
- acceptance:
  - [ ] `dungeoncheck` and `questcheck` cover them.
  - [ ] Standard DoD.
- notes:

### X-2 Seeded side-quest variants
- status: todo
- size: M
- depends: A-9
- scope: if A-9 found identical repeats, extend that fix to the original five village chains.
- notes:

---

## 8. Tasks — gameplay improvements

### G-1 Tiers change mechanics, not only numbers
- status: todo
- size: M
- depends: —
- why: Veteran and Elite multiply damage and health, so on trash they mostly lengthen fights.
- start: `combat/bosses.js`, `sim/BossScript.js`
- scope: tier overrides in boss script data. Veteran adds one extra mechanic per boss and Elite a second, with tighter telegraph windows. **(check)** whether enrage timers differ by tier.
- acceptance:
  - [ ] `raidcheck` runs each boss at all three tiers and asserts the extra mechanics are present.
  - [ ] Kill times stay inside the `powercurve` bands.
  - [ ] Standard DoD.
- notes:

### G-2 Dungeon variety and boss scripting reuse
- status: todo
- size: M
- depends: —
- why: every dungeon has the same main-route shape (entrance, three halls, mini-boss arena, two halls with a lift, final boss), and only side rooms reshuffle.
- start: `world/DungeonGen.js`, `world/dungeons.js`, `tools/dungeoncheck.mjs`
- scope: route archetypes for the generator (a vertical descent with several lifts, a loop that unlocks a shortcut, a power-door race, a gauntlet of short bosses) while keeping the seed's main route fixed. **(check)** whether dungeon bosses can run `BossScript`; if so, use it at Veteran and up.
- acceptance:
  - [ ] At least two new archetypes in the generator; the existing three dungeons are unchanged.
  - [ ] `dungeoncheck` covers each archetype's layout, keys and doors before what they open, and nothing overlapping.
  - [ ] Standard DoD.
- notes:

### G-3 Group finding and party quality of life
- status: todo
- size: M
- depends: —
- why: MULTIPLAYER.md lists four unbuilt items, and raid groups are formed with typed commands.
- scope:
  - Invite from a player's nameplate.
  - The leader can disband a party.
  - Fast travel to the waystone nearest a party member.
  - Join a friend's or guildmate's layer from the Social tab (DEPLOY.md "Further").
  - A looking-for-group list at the war table and the dungeon and raid gates.
  - Participant counts on the event tracker.
- acceptance:
  - [ ] Each is a server-checked op with a smoke-test or headless check.
  - [ ] New messages documented in MULTIPLAYER.md.
  - [ ] Touch layout for the new UI.
  - [ ] Standard DoD.
- notes:

### G-4 Input and accessibility
- status: todo
- size: S–M
- depends: —
- why: the control scheme is deep, and "rebindable later" was promised.
- scope: key rebinding in Settings (stored per device, like other settings); a colour-blind palette for telegraphs and party colours, with distinct shapes as well as hues; touch parity for raid frames, the beacon vote, the event tracker and telegraphs.
- acceptance:
  - [ ] Rebinds persist and cover every action in the README's controls table.
  - [ ] Telegraph and party colours switchable without a reload.
  - [ ] Standard DoD.
- notes:

### G-5 First-hour experience
- status: todo
- size: M
- depends: —
- why: I couldn't find a movement tutorial in the docs **(check)**. The hosted title also requires an account.
- scope: prompts in the Prologue that teach sprint and dash, slide into bullet jump, glide and clamber, with a short optional movement course; a guest or single-player "try it" path on the hosted title, keeping accounts for the shared realm.
- acceptance:
  - [ ] The prompts show once and can be turned off.
  - [ ] The guest path doesn't create server accounts.
  - [ ] Standard DoD.
  - [ ] (user) a first-time-player playtest.
- notes:

### G-6 Telemetry for balance
- status: todo
- size: S–M
- depends: —
- start: `server/ops.js`, `/metrics`
- scope: Prometheus counters for deaths per region level, time to kill by tier, event win, loss and abandon rates, raid wipes per boss and phase, and chest claims. Keep cardinality low.
- acceptance:
  - [ ] The counters appear in `/metrics` and are documented in DEPLOY.md.
  - [ ] Tick-time cost measured with `tools/loadsim.mjs` and recorded.
  - [ ] Standard DoD.
- notes:

### G-7 Small-realm friendliness
- status: todo
- size: S–M
- depends: —
- needs: DEC-7
- scope: lockout periods as settings with reduced repeat rewards; ambient life (Warden patrols and caravans that react to events), so a lone visitor sees a living world.
- acceptance:
  - [ ] Lockout settings documented in DEPLOY.md's table.
  - [ ] Ambient actors cost within the sim budget (`loadsim` recorded).
  - [ ] Standard DoD.
- notes:

### G-8 Parked ideas
- status: parked
- items:
  - Level sync in parties, since enemies five or more levels below give a tenth of the XP.
  - Event variety (a convoy and an alpha hunt on the P-1 tech).
  - A photo mode (the dev panel's noclip and render toggles are most of it).
  - Server-judged raid damage: enemy hits on a player are judged on that player's screen today. Matters once the population is real. An interim plausibility check on hits landed against health lost is cheap.
- notes:

---

## 9. Deferred operations work

Don't start these unless a trigger fires. Trigger: a layer's p95 tick time creeping toward 35 ms, or sustained player counts near the soft cap of 110 (watch `/metrics`).

- Binary snapshots (about half the wire size).
- PgBouncer (matters past about 30 layers).
- Regions within a layer on worker threads.
- External crash reporting.

---

## 10. Next up

**Next up:** S-1

(Claude: update this line after each task, and note any task that was skipped or reordered.)

---

## 11. Progress log

Append-only. Newest last. Format: `YYYY-MM-DD — ID — what changed — checks run — what the user needs to do`.

- 2026-10-14 — (plan) — created from ROADMAP.md; no work started — none — decide DEC-1 to DEC-11 as tasks reach them.

---

## 12. Backlog and open questions

Add ideas and blockers here. Don't act on them without the user's say-so.

-
