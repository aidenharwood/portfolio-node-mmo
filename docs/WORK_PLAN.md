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
2. **Pick the task.** Find your lane in section 5 and take its next task. A new session takes a task from the "Free to claim" row, or asks the user to start a new lane. A task is eligible only if every ID in `depends` is `done`, every `DEC-` in `needs` is `decided` (or its gate is met), and no other lane lists it under "Doing" or "Then".
3. **Claim it** before starting: set the task's `- status:` line to `doing`, add an `- owner:` line under it naming your session (its id from the session list), and put the task in your lane's row in section 5. Work on one task at a time.
4. As acceptance items become true, change `- [ ]` to `- [x]`. Items tagged `(user)` can only be ticked by the user.
5. When the work is finished:
   - set `done` if everything is ticked and no `(user)` item remains;
   - set `review` if any `(user)` item remains (a server restart, a playtest, a CI run to confirm);
   - set `blocked` with a one-line reason if you cannot continue.
6. **Append** to the task's `- notes:` (dated, never rewrite history) and add a line to the progress log (section 11).
7. Update your lane's row in section 5.
8. If this file disagrees with the code, trust the code. Fix the file and log the correction.
9. New ideas go in the backlog (section 12). Don't do them unasked.

Grep-friendly conventions: tasks are `### ID Title` headings, and status is the line `- status: <value>`. `grep -n "^- status:" docs/WORK_PLAN.md` lists them all.

### Status values

| Status | Meaning |
| --- | --- |
| `todo` | Not started. |
| `doing` | In progress, with an `- owner:` line naming the session (at most one per lane). |
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

### Several sessions at once

More than one Claude session can work through this plan at the same time, one lane each (section 5).

- **This file is shared.** Change it with small exact replacements (the Edit tool), never by rewriting the whole file. Re-read a block just before changing it, because another session may have changed it since.
- **Touch only what's yours:** the task blocks you claimed, your lane's row in section 5, the decisions your lane is settling, and new lines at the end of the progress log. If something else needs changing, tell the user or the session that owns it.
- **Code lanes don't share a checkout.** If another lane is already changing code in this checkout, work in your own git worktree and branch. Even then, keep your updates to this plan in the main checkout's copy (`docs/WORK_PLAN.md` at the repo's main folder), where the other lanes read it, and leave your worktree's copy alone so your branch merges without conflicts here. A lane that only edits docs or settles design can share the checkout.
- **Commit only your own files** in a shared checkout (`git commit -- <paths>`), never `git add -A`.

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

DEC-1 (the story bible) is split by act, so each act's part can be settled when that act is designed.

### DEC-1a Story bible: Act II
- status: decided
- owner: `local_6ee40182` (Story lane)
- needs from user: the facts Act II rests on: what opening the Sunken Vault did, why the Array calls the Hive, and what Ysolde knew and why she kept quiet.
- blocks: DEC-9
- answer (2026-10-14, user): full text in [the Act II story spec](superpowers/specs/2026-10-14-act-ii-story-design.md) §2.
  - The first Wardens re-tuned a Maker station at Farcall, the Array, to broadcast a lullaby that keeps the Hive (Pilgrim cargo) dormant. They sealed its controls in the Sunken Vault.
  - The seal was a dead-man's switch. Opening it in Act I flipped the Array from hush to call, so the player caused Act II.
  - The Wardens were founded to guard the seals, but that purpose has been forgotten. Maren and Ashe don't know it. Ysolde is the last keeper of the history, and she let the player go anyway.
  - The Pilgrim's voice knew about the seals and held back. Act II seeds doubt about it, not villainy.
  - Destroying the Array sends a death-pulse up the network, and the Synths wake (the Act III seed).

### DEC-1b Story bible: Act III
- status: decided
- needs from user: what the Synths' "true orders" are.
- suggested: one page, written before Act III's tasks begin.
- blocks: DEC-10, B-2, B-3, B-4
- answer (2026-10-15, user): full text in [the Act III story spec](superpowers/specs/2026-10-15-act-iii-story-design.md) §2.
  - The Synths are the Maker network's immune system. Their order is to keep the network sealed against any mind that isn't a Maker. They are the Makers' guardians, not the colony's machines.
  - The death-pulse woke them and showed them the intrusion: the Pilgrim's mind, waking through the player. They hunt the player as its *carrier*, and war-walkers march on settlements whose waystones the player has woken.
  - The Pilgrim pleads its case. That adds doubt without settling it.
  - The Fallen Titan's core shows an earlier intrusion, so the Pilgrim isn't the first. Who it was is left for DEC-1c.
  - The Colossus foundry forges a cage for the carrier's voice. The act's choice is to let it finish (`pilgrim_caged`) or destroy it (`pilgrim_shielded`).

### DEC-1c Story bible: Act IV
- status: open
- needs from user: what the Makers are, and what each of the three endings means (shut it down, take it, wake the Makers).
- suggested: one page, written before Act IV's tasks begin.
- blocks: DEC-11, C-1, C-2, C-6
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
- status: decided
- suggested: a story flag on any raid member opens the gate for the group (so someone further behind isn't locked out), and the level-14 floor is dropped.
- blocks: A-3
- answer (2026-10-15, user): yes, as suggested. A story flag on any raid member opens the gate for the whole group, and the level-14 floor is dropped.

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
- status: decided
- owner: `local_6ee40182` (Story lane)
- blocks: A-5, A-6, A-7
- answer (2026-10-14, user): the beat sheet under "Act II — The Brood" in section 7, from [the Act II story spec](superpowers/specs/2026-10-14-act-ii-story-design.md) §3–4. It has one choice, at quest 5: `told_ashe` or `kept_wardens_secret`. The Array's fate at quest 9 is fixed.

### DEC-10 Act III beat sheet approved
- status: decided
- blocks: B-1, B-2, B-3, B-4, B-5
- answer (2026-10-15, user): the beat sheet under "Act III — Iron Heart" in section 7, from [the Act III story spec](superpowers/specs/2026-10-15-act-iii-story-design.md) §3–5. There are 12 quests (c1–c12). The one choice is at quest 12: cage or shield the Pilgrim. The new giver is Foundrywright Isa Brannock (`city3:engineer`). Build order is tech first: P-1 and P-2 come before any Act III quest code.

### DEC-11 Act IV beat sheet approved
- status: open
- blocks: C-1 to C-7
- answer:

---

## 5. Lanes and sequence

### Lanes

Several sessions can work at once, one lane each. Each lane's owner updates only its own row. A new session takes a task from "Free to claim", or asks the user to start a new lane.

| Lane | Owner | Doing | Then |
| --- | --- | --- | --- |
| Engine | `local_3d40571d` (stabilise session) | — (S-1 to S-4 in `review`, on branches `s-1-collider-parity`, `s-2-deploy-verification`, `s-3-persistence`, `s-4-doc-fixes`) | G-6 |
| Story | `local_6ee40182` (Act II story session) | A-5, A-6, A-7 in `review` (Act II merged to local `main` as 9e151bc, not pushed; waiting on restart, playtest and the user's read of the lines) | A-8, A-9; DEC-1b and DEC-10 (Act III) when the user wants |
| Act II tech | `local_65f79a66` (A-1 session, own worktree) | — (A-1 `done`) | — |
| World | act lands and camps session | W-2 (waypoints, map, the 2026-10-16 bug batch) on branch `fixes-and-waypoints`; W-1 merged, in `review` | G-2 (dungeon variety), as part of W-2 |
| Free to claim | — | — | A-2; A-4 once S-1 is `done` |

Story design runs ahead of the code that needs it. It isn't blocked by the Engine lane, and an act's bible and beat sheet should be settled before that act's quest tasks (A-5, B-1, C-1) come up below. None of the free tasks touch the files S-1 is changing (`world/World.js`, `server/world.js`, `tools/physicscheck.mjs`).

### Overall order

Follow this order within and across lanes. `depends` is the safety net if the order is changed.

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
- status: review
- owner: `local_3d40571d` (Engine lane)
- size: S–M
- depends: —
- why: the server uses wider circle colliders for trees, rocks and cacti than the client's mesh hulls, so enemies get pushed off scenery further than players see. The test suite went red once because the headless world has no meshes.
- start: `server/world.js` (headless world), `world/MeshCollision.js`, `world/World.js`, `tools/physicscheck.mjs`
- scope:
  - Build the same hulls on the server from the scenery's geometry, without drawing anything (GAMEPLAY_PLAN §11 suggests this).
  - Add a client-versus-server parity assertion so this class of break fails in `npm test`.
- acceptance:
  - [x] For a fixed seed, server and client collider footprints for trees, rocks and cacti match within a stated tolerance.
  - [x] `tools/physicscheck.mjs` asserts parity and fails if the headless world drifts.
  - [x] `tools/hordecheck.mjs` and `tools/loadsim.mjs` still pass; the new ms per tick at 150 stand-in players is recorded in notes (the baseline was 8.6 ms).
  - [x] Standard DoD.
  - [ ] (user) server restarted and a few minutes spent fighting a camp in a forest.
- notes:
  - 2026-10-14: cause was `HeadlessWorld.buildScenerySets()` setting `this.sets = {}`, so `scatterChunk`'s `push()` returned no mesh data and the server fell back to the wide circles. Now `World.js` exports `sceneryGeometries()` (the geometry from `sceneryTypes()`, nothing drawn), the server builds its sets from it once per process (shared by every headless world), and both hosts add chunk colliders through one method, `World.addSceneryColliders(ch)`, so the server also gets the client's `surface` per collider (it was defaulting to `stone`).
  - 2026-10-14: parity check (last section of `physicscheck.mjs`): seed 7, one chunk each of forest, snow, marsh, ash, mountain, desert, badlands, jungle, crystal and fungal; 205 colliders, all with triangles, compared to a world built with the client's own scenery sets, same count, surface and vertices within 1 cm (measured 0.0000 m). A body walked into a cactus from 8 directions stops 0.79 m from its middle; the old circle held it 2.11 m off.
  - 2026-10-14: the section runs last because building the client's sets creates the toon gradient texture early, and three.js draws `Math.random` for every UUID. The ragdoll section seeds `Math.random`, so one fewer draw shifted every kick and a juggernaut/queen ended 0.11–0.12 off against the 0.10 limit. See backlog.
  - 2026-10-14: loadsim 150 (this machine, two runs each): before 10.83 / 11.51 ms a tick (sim 8.32 / 8.92), after 11.60 / 11.39 ms (sim 9.05 / 8.89). Within run-to-run noise; under the 12.5 ms budget. `npm test` green.
  - 2026-10-14: changes the sim's build hash (`src/world/World.js`): the server on 8080 needs a restart (not done by Claude).

### S-2 CI trigger and deploy verification
- status: review
- owner: `local_3d40571d` (Engine lane)
- size: S
- depends: —
- why: DEPLOY.md says the first build comes from pushing to `master`, but the repo's branch is `main`. MULTIPLAYER.md also says the Docker image wasn't built in the dev environment.
- start: `.github/workflows/deploy.yaml`, `deploy/k8s/templates/cel-blade/`, `Dockerfile`, `docker-compose.yml`
- acceptance:
  - [x] The workflow's trigger matches the real default branch, or DEPLOY.md is corrected. **(check)** the actual trigger first.
  - [x] The test job runs `npm test` and the cluster smoke test.
  - [ ] (user) a CI run has built and pushed the image and the realm runs from it.
- notes:
  - 2026-10-14: checked, the premise was stale: `deploy.yaml` already triggers on `main` (push), pull requests (tests only) and by hand, and its test job runs the syntax check, `npm test` and `npm run test:cluster` against Postgres. No workflow change.
  - 2026-10-14: evidence for the (user) item: run 38616473602 (push to `main`, 2026-10-14 18:35 UTC) passed all three jobs (tests, build and push to GHCR, Helm chart update), and `https://celblade.aidenharwood.uk/` answers 200. Not checked: which image tag the pods are running (needs cluster access).
  - 2026-10-14: real break found: `docker-compose.yml` mounts `./deploy/Caddyfile`, deleted with the rest of `deploy/` in 54d35a9. Restored. `deploy/k8s/` is gone for good: the manifests now live only in `portfolio-helm-website/templates/cel-blade/` (with a new `secret.portfolio-cel-blade.yaml` that generates the secret). DEPLOY.md and MULTIPLAYER.md:127 corrected, including `master` → `main` (S-4's `master` item is covered).
  - 2026-10-14: commit 5919f71 on branch `s-2-deploy-verification` (worktree `../portfolio-node-mmo-s2`), not pushed or merged.
  - 2026-10-14: risk outside this repo, not changed: the chart's secret uses Helm `lookup`, which returns nothing when rendered without cluster access (as Argo CD renders). If so, each sync generates a new Postgres password and internal key. Worth checking in `portfolio-helm-website`.

### S-3 Persistence audit
- status: review
- owner: `local_3d40571d` (Engine lane)
- size: S
- depends: —
- why: characters save every 30 s and a crashed layer loses up to that much. A crash inside that window must not duplicate an item or refresh a lockout.
- start: `server/characters.js`, `server/store.js`, `server/trade.js`, `server/social.js` (mail), `settings.lockouts`
- scope: **(check)** whether these are written through immediately: trade completion, mail attachment claims, chest claims (dungeon, raid, event), the weekly and daily lockouts, and legendary drops.
- acceptance:
  - [x] A check (extend the smoke test, or add `tools/persistcheck.mjs`) kills a layer between an op and the next save and asserts there is no duplication and no lockout reset.
  - [x] Anything not written through is fixed, or the gap is documented in MULTIPLAYER.md's known limits.
  - [x] Standard DoD.
- notes:
  - 2026-10-14: audit. Trade saved its two sides separately (one landing alone duplicated items); mail send inserted the letter before saving the sender (duplicated); mail claim marked the letter before saving the claimer (lost the item). Chests (dungeon, raid, event), lockouts and legendary drops are only saved on the 30 s timer but sit in the one character row with their loot, so they're lost or kept together (documented in MULTIPLAYER.md's known limits). Also found, not on the list: saves weren't checked against presence, so a layer that stalled past 45 s and lost a character could later write its old copy over the new layer's.
  - 2026-10-14: fix (user approved the design): `Store.saveCharacters` / `postMail` / `claimMailInto`, each one transaction; `Realm.saveTogether` queues them behind the characters' earlier saves and, if one fails, lets the players go unsaved (`dropUnsaved`) so they reload as stored. `Store.saveCharacter` now takes the layer and writes only while that layer holds the character's presence (true in standalone too: presence is claimed there as well).
  - 2026-10-14: the check is cut-point injection rather than killing a process (user approved): `tools/persistcheck.mjs`, in `npm test`, crashes the store at each write of a trade, a letter sent and a letter claimed and reads back with a fresh store; plus a chest with its lockout, and a stale layer's save refused. It fails on the old code (trade, send, claim and stale layer) and passes now. `npm test` green; a smoke run with the server's log dumped showed no player let go unsaved.
  - 2026-10-14: not run here: `npm run test:cluster` (needs Postgres; CI runs it). Commit 2454e9b on branch `s-3-persistence` (worktree `../portfolio-node-mmo-s3`), not pushed. Server code only (no build-hash change), but the server on 8080 needs a restart to pick it up.

### S-4 Doc fixes
- status: review
- owner: `local_3d40571d` (Engine lane)
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
  - [x] Each item above is done or logged as intentionally skipped.
- notes:
  - 2026-10-14: done: MULTIPLAYER.md:114 says talents; DEPLOY.md's `npm test` comment lists every check then the smoke test; GAMEPLAY_PLAN §1's status refreshed (the old red-suite note gone, Act II and the stabilise pass under way, "Next" points at the lanes table) and the original power-curve table and "Other gaps" moved unchanged to Appendix A; README's dev tools link ROADMAP.md and WORK_PLAN.md.
  - 2026-10-14: covered elsewhere: DEPLOY.md's `master` was fixed in S-2.
  - 2026-10-14: skipped: DEC-8 is still `open` (the user hasn't answered), so §12 is unchanged. When it's answered, note that the five `(default)` tags in GAMEPLAY_PLAN are on other choices (event votes, overrun not saved, raid scaling, weekly lockouts), not DEC-8's four items, which sit in §12 marked `[yes]`.
  - 2026-10-14: started while S-2 (its `depends`) is in `review`, not `done`: docs only, and S-2's doc edits are on their own branch. Commit 4f8e298 on `s-4-doc-fixes` (worktree `../portfolio-node-mmo-s4`, cut from `main` at 68a666c), not pushed. Merges cleanly with each of S-1, S-2 and S-3; S-1 and S-3 conflict with each other on README's dev-tools line (both add to it), so the second of those to merge needs that line combined.

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

**Beat sheet (approved — DEC-9, 2026-10-14).** The detail (givers, levels, moments, flags, Act I payoffs) is in [the Act II story spec](superpowers/specs/2026-10-14-act-ii-story-design.md). Objective types are ones the quest system already has, plus A-2's event hook and A-6's dungeon clear.

1. **The Road to Farcall** (talk, goto): Ashe sends the player to Farcall, which has gone silent. Farcall's hub opens, and its Warden captain (name open) becomes the local giver.
2. **Gone Quiet** (goto, use, kill): three hamlets stopped answering, with spore pods rooted outside. The masts "started singing wrong".
3. **Hold the Line** (event hook): a quest-started Hive Surge on a named settlement. Taking part counts.
4. **The Farcall Array** (goto, use, defend): follow the swarms and power down the first console while holding. Warden sigils sit on Maker machinery (moment `array`).
5. **Ysolde's Confession** (talk, choose): the Wardens' forgotten founding. The choice is `told_ashe` or `kept_wardens_secret`, which Acts III and IV read.
6. **Voice in the Chitin** (kill a named foe, collect): a Hive Psion directing the swarms. Its chitin gives the Pits' coordinates.
7. **Into the Brood Pits** (dungeon): the existing dungeon, to the Brood Matron.
8. **What the Matron Knew** (talk, use): the Array's call feeds the Brood Mother's nest.
9. **Silence the Array** (defend, use): destroy the transmitter under waves. Moment `deathpulse`: the Synths stir. Its fate is fixed; there is no choice.
10. **Marshal the Wardens** (talk): the war table, which introduces raid groups. It varies with the quest-5 choice.
11. **The Gate Opens** (goto): a flag opens the Brood Mother raid gate.
12. **Report to Ashe** (talk, moment): the act closes (`act2end`) and plants Act III.

The story must be completable without the raid: it ends at the gate opening, and Act III must not require a raid clear.

### A-1 Story flag registry and check
- status: done
- owner: `local_65f79a66` (Act II tech lane)
- size: S–M
- depends: —
- why: Prologue and Act I flags drive dialogue today, and Acts II–IV add many more.
- start: `rpg/storyline.js`, `rpg/Quests.js`, `world/story.js` (`storyRef`), `tools/questcheck.mjs`
- scope: one registry (a data file or a doc section) listing each flag with who sets it and who reads it, and a `questcheck` step that fails on a flag read but never set, and warns on one set but never read.
- acceptance:
  - [x] Every existing flag is registered.
  - [x] `questcheck` fails on an unset-but-read flag (prove it with a deliberate break, then revert).
  - [x] Standard DoD.
  - [x] (user) merge branch `claude/hopeful-lumiere-c6c3dc` (commit 05070dd), then set `done`.
- notes:
  - 2026-10-14: the registry is `tools/storyflags.mjs` (`STORY_FLAGS`), in `tools/` so it doesn't change the build hash: no restart needed. It has 14 flags (2 Prologue, 12 Act I), each with `means`, `setBy` and `readBy`, plus the `used:<object id>` family, which is documented but not checked.
  - 2026-10-14: questcheck's new "Story flags" section finds setters and readers the way the game uses them: `setFlags`, `needFlags`, flag-keyed lines (`offer`, `turnIn`, `progress`, a stage's `text`/`say`, objective `text`), a stage's `done.flags` and `choices`, side chains (as `makeSide` copies them), `when.flag` on barks and story folk, `needs.flag` on dungeons and raids, and achievements' `flag(c, '…')`. It fails on a flag read but never set, an unregistered flag, or an entry whose `setBy`/`readBy` differs (the message prints the array to paste). It warns on a flag set but never read: 8 today (`heard_pilgrim`, `pilgrim_awake`, `ironjaw_named`, `met_ashe`, `key_half`, `has_pass`, `trusted_ysolde`, `kept_secret`). Stand-ins prove each kind of reader is found.
  - 2026-10-14: deliberate break: a7's offer key `krell_captured` → `krell_capture` failed 3 checks (exit 1), while the rest of questcheck passed because the line silently fell back to its default. Reverted; `npm test` green.
  - 2026-10-14: for A-3, A-5 onward: register each new flag in the same commit as the quest, gate or achievement that sets or reads it. Labels are listed in the file's header (a raid gate is `raid <id>`, Krell's planned condition `folk <place>:krell`). A new kind of reader (say flag-keyed choice replies, or `when.notFlag`) needs `flagUses` extended too.
  - 2026-10-14: README's dev-tools line was edited (questcheck). S-1 and S-3 also edit that line, so expect a small merge conflict there.

### A-2 Quest-to-event hook
- status: review
- owner: A-2 session (started by `local_6ee40182`; worktree `pensive-greider-708eeb`, branch `a2-quest-event-hook`)
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
  - [x] `tools/eventcheck.mjs` covers a quest-started surge: started, joined by two stand-in players, won, step advanced for both.
  - [x] A lost or abandoned story event leaves the step re-attemptable.
  - [x] The protocol is documented if `wev` changes.
  - [x] Standard DoD.
  - [ ] (user) server restarted.
- notes:
  - 2026-10-15: on branch `a2-quest-event-hook` (commit 057b474). **Objective shape (the Story lane uses this for b3):** `{ type: 'event', event: 'surge', at: 'quiet1', count: 1, text: 'Hold {quiet1}' }`. `event` is an `EVENT_TYPES` key other than `retake` (surge and siege need a hamlet, settlement or town; anomaly needs a landmark or ruin) and defaults to `surge`. `at` is any `storyRef` that resolves to a place with a `poi` id, so `quiet1` works.
  - How it runs: every second the quest watch (`rpg/questWatch.js eventCalled`; server/simhost.js tick, and main.js offline) checks whether someone on such a step is within the place's radius + `EVENT_CALL` (80 m). If so, it calls `WorldEvents.startStory(site, type)`. The event is a normal public event with `story` and `locked` set: its tier is Normal, votes are refused, `wev` carries `lk: 1` and no `v`, and EventUI shows no vote. When it's won, `eventObjectives(quests, ev)` sends the server op `evwon { id, i }` to each participant who reached the 60-point chest threshold (`ev.result.people`), so the step moves on separately for each player. Any won event of the same kind at the same place counts, including a random one.
  - **Spacing (the check):** a story start ignores the director's quiet time, its 600 m gap, the cap on running events and the site's rest. It never runs two events at one site: if one is already running there, that one is the event, whoever started it. An overrun place refuses until it's free. A story event does count as a running event for the random director, and it sets the site's rest and players' quiet time like any other, so random events don't pile on right after it.
  - **Lost or abandoned:** a lost event (pylons down, or nobody within 200 m for 45 s) pays nothing and moves no step on. The place is overrun and a Retake starts as usual. Once it's retaken, or the garrison moves on after 15 min, the step calls its surge again. A participant who won with under 60 points still has the step, and gets a new surge once the finished one is cleared away (15 s).
  - Headless: questcheck's `playStage` handles `event` steps. It goes to the place, calls `eventCalled` and gives `evwon` for each `[id, i]` from `eventObjectives(quests, { type, site: { id } })`. With this branch merged, b3 needs nothing more there.
  - Restart: the sim, rpg and server code changed (build hash), so the server on 8080 needs a restart once this is merged.
  - 2026-10-15: merged to main as PR #8, after merging the latest main into the branch (`npm test` green there). It stays in `review` until the user ticks "server restarted".

### A-3 Story-flag raid gate
- status: done
- owner: A-2 session (started by `local_6ee40182`; worktree `pensive-greider-708eeb`, branch `a-3-raid-gate`)
- size: S–M
- depends: A-1
- needs: DEC-4
- start: `world/raids.js`, `server/raidgroups.js`, the city gate yard
- scope: replace the level-14 gate with the rule from DEC-4; when refused, say why.
- acceptance:
  - [x] `tools/raidcheck.mjs` covers: flag set opens, flag unset refuses with a reason, and the group rule from DEC-4.
  - [x] Existing characters past the old gate level aren't locked out of a raid they could enter before. **(check)** and decide a migration rule with the user if they are. Checked: they are locked out. The user decided (2026-10-15) that the gate "should remain closed until players can actually progress to the raid via story", so there's no migration and no stand-in.
  - [x] Standard DoD.
- notes:
  - 2026-10-15: on branch `a-3-raid-gate` (commit c2edfc8), cut from A-1's branch `claude/hopeful-lumiere-c6c3dc`, so merge A-1 first. The Brood Mother has `needs: { flag: 'broodgate_open' }` (the flag name is from the Act II spec §6) and no `minLevel`. `Dungeons.enter` opens a raid when the character or any of `who.mates` has the flag. `who.mates` is the story flags of the rest of their raid group, else their party, among those online (server/simhost.js `matesFlags`). Offline it's just the player's own flag.
  - A refusal says the gate is sealed and that the story opens it, or someone in your raid group or party who has it (`sealedText`). The gate's list shows "· sealed". From inside a group it still lets you try, because the server decides.
  - **For A-7:** nothing sets `broodgate_open` yet. It's in A-1's registry as `pending`, so questcheck warns instead of failing. When quest 11 "The Gate Opens" sets it (`setFlags: ['broodgate_open']`), questcheck fails until `pending` is removed and `setBy` filled in (`tools/storyflags.mjs`). Until then the raid is closed to everyone except dev mode.
  - Restart: the sim, world and server code changed, so the server on 8080 needs a restart once this is merged. After that restart, characters who were in the raid before can't get back in until A-7 ships (the user's call, above).
  - 2026-10-15: merged to main as PR #7, after merging the latest main into the branch (`npm test` green there).

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
- status: review
- owner: `local_6ee40182` (Story lane), branch `act-ii-story` in worktree `../portfolio-node-mmo-act2`
- size: M
- depends: A-1
- needs: DEC-9
- scope: quests 1–4 of the beat sheet with their stages, lines, barks, moments, flags (registered in A-1) and map markers. Quest 3 uses A-2.
- acceptance:
  - [x] `tools/questcheck.mjs` plays quests 1–4 through the character's rules as the server runs them, including the choice and its flags, and nothing is taken or handed in out of order.
  - [ ] Moments are skippable and don't block server ops.
  - [ ] Journal, tracker, compass, minimap and map show the new steps.
  - [ ] Standard DoD.
- notes:
  - 2026-10-14: plan `docs/superpowers/plans/2026-10-14-act-ii-story.md` (Tasks 1–9). Done on `act-ii-story`, all `npm test` green: Act II in ACTS; Captain Vey Okonta (`city2:captain`, user's choice, a new story folk in Farcall's heart — no rng draw, so the districts don't move); story places `sporefield` (3 pods, Krell if `krell_freed`) and `psionnest` (a hive camp led by a named Psion, tag `psion`; `campUnits` gives a non-stronghold camp with `boss.type` that boss); `broodpits:node`; refs `quiet1`–`quiet3`; a `dungeon` objective (`{ type: 'dungeon', d }`, moved on by `dclear`); `giverName` names story folk; quests b1–b2.
  - 2026-10-14: quest 3 (b3) waits on A-2, quest 4 (b4) on A-4. Flags aren't registered yet: A-1 isn't done (the plan lists them). The new lines are proposals for the user to read.
  - 2026-10-15: merged `origin/main` (A-1, A-2, A-3) and A-4's branch `claude/inspiring-swartz-350358` (fe7ef51) into `act-ii-story`; ORDER is `…broodpits, array, sporefield, psionnest`, so A-4's Array keeps its tested spot. All Act II quests b1–b12 built (see A-6, A-7); every flag registered in `tools/storyflags.mjs`.
  - 2026-10-15: whole-branch review (fresh reviewer): fixed b2 being unfinishable on most seeds (the Spore Field is now a Hive nest camp, with a real `sporepod` model and prompt), the dungeon step's waypoint, and the journal's "Act II comes later" line. Each fix has a check that failed first. Unchecked here: moments and the compass/map in a real client (not played in a browser).

### A-6 Quests II-5 to II-9
- status: review
- owner: `local_6ee40182` (Story lane), branch `act-ii-story`
- size: M
- depends: A-2, A-4, A-5
- needs: DEC-9
- scope: quests 5–9, using the Array, the Brood Pits and named foes.
  - **(check)** whether the `clear` objective supports dungeons. If not, add a dungeon-clear objective driven by the server's `dclear` message.
  - Quest drops are rolled into the kill's reward.
- acceptance:
  - [x] `questcheck` plays quests 5–9, including a dungeon clear.
  - [x] `questWatch` handles the Array's `reach` and `defended` states on the server.
  - [ ] Standard DoD.
- notes:
  - 2026-10-15: b5–b9 on `act-ii-story`. `clear` doesn't cover dungeons, so there's a new `dungeon` objective (`{ type: 'dungeon', d, at }`, moved on by `dclear`; `at` is its way in for the waypoint). b6's Psion is the boss of the `psionnest` camp (tag `psion`); b8 reads `broodpits:node`. b4 uses `array:console` (A-4's `array:console2` is unused). DoD gaps: no captures or F3 check, not played in a client.

### A-7 Quests II-10 to II-12 and the act close
- status: review
- owner: `local_6ee40182` (Story lane), branch `act-ii-story`
- size: S–M
- depends: A-3, A-6
- needs: DEC-9
- scope: the war-table raid-group introduction, the gate opening, Ashe's report, the Act III seed moment, and titles.
- acceptance:
  - [x] `questcheck` plays Act II start to finish, including the gate flag and the Act II choice (one choice since DEC-9). It plays all 8 combinations of the a6, a8 and b5 choices.
  - [x] Act II doesn't require a raid clear.
  - [ ] Standard DoD.
- notes:
  - 2026-10-15: b10–b12 on `act-ii-story`. b11 sets `broodgate_open` (its `pending` mark removed) at the new ref `city1:raidgate`. b12 plays `act2end`. Not done: titles, which are left to A-8 with the achievements. The journal now says "Act III comes in a later update" once Act II is done.

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
- status: review
- size: M
- depends: S-1
- why: the war-walker, the stampede's caravans and escort quests all need a moving, damageable thing the sim walks along a route.
- start: `sim/WorldEvents.js`, `sim/WorldSim.js`, the roads that link waystones (as routes)
- scope: a moving defendable with health, a route, stuck-recovery, scaling with participants, and interest management for something that crosses regions (`wev` currently covers events within about 700 m).
- acceptance:
  - [x] Headless test: a defendable follows a road across several regions and is reported to nearby players throughout.
  - [x] A stuck one recovers or fails cleanly.
  - [x] Standard DoD (`npm test` green; no visuals of its own).
- notes:
  - 2026-10-15: on branch `p-walker` (worktree `../portfolio-node-mmo-walker`), commits 478fb94 and 088e9f8. The plan is [2026-10-15-war-walker.md](superpowers/plans/2026-10-15-war-walker.md).
  - `sim/Routes.js` builds a route of 300–480 m along the roads between waystones and keeps out of the cities and the hub. Its follower jumps gaps up to 30 m and is otherwise `stuck`.
  - `WorldEvents.lead()` carries a structure or an enemy along a route, and the event's centre moves with it. Interest management needed no change, because `near()` and `wev` already go by the event's centre.

### P-2 Synth War-walker event
- status: review
- size: M
- depends: P-1
- scope: a Colossus-class walker with escorts crosses a region toward a town. Weak points must be broken before it arrives. Reuse the raid framework's immunity-while-weak-point-adds-live and shield mechanics **(check)**. If it arrives, use the existing overrun and Retake flow.
- acceptance:
  - [x] `tools/eventcheck.mjs` covers won, lost and abandoned, scaling with participants, and a stuck walker.
  - [x] A new enemy model and a codex entry (the walker and its power couplings).
  - [x] Standard DoD, except the F3 frame check: the browser pane was hidden, so no frames ran. Captures were rendered by hand.
  - [ ] (user) server restarted.
- notes:
  - 2026-10-15: on branch `p-walker`, commits a115eaa to 2c9be6a.
  - **(check) answered:** this reuses BossScript's immunity *pattern* (a wrapped `applyHit`, and the `rimm` and `shield` sim events the client already draws), not the class, which needs a raid encounter.
  - **Defaults to confirm:** an abandoned or stuck walker turns back and nothing is overrun. Only one that arrives overruns the settlement.
  - **Differences from the plan:**
    - The walker isn't elite, because the gold tint and random affixes didn't suit it. Its base hp is 4500, about 2.5 Colossus fights, or roughly 3¾ min solo against a ~4 min walk.
    - Its hull scales by EnemySim's crowd rule only. The plan's extra event scaling stacked on top of it, ×3.5 for three players.
    - Its velocity is its walking pace, so the leg animator strides.
  - The director doesn't start walkers yet, and there's no admin or dev-panel entry: that's P-4. A quest's `{ type: 'event', event: 'walker' }` step works now.
  - **Final review fixes** (e6fcce4):
    - `roadRoute` threw where a settlement's region had no waystone, which would have broken the shared sim tick.
    - The hull healed to full whenever the walker leashed. It now never leashes.
    - Players waiting at the beacon made it turn back. Now someone within 200 m of the settlement counts as being there.
    - Screens weren't told it was immune. Now `w.immune` is set while the couplings hold.
    - The hull is 2880 (1.6 Colossus fights) and routes are at least 360 m. That fits a solo budget: meeting it, the couplings, the hull and the escort come to about 3:50 against a walk of at least 4:00.
    - The couplings now hover at 3.2 m, so melee can reach them.
  - **Deferred minors from the review:**
    - Dead players still count as "near".
    - `lure` and `muzzle` on the warwalker entry do nothing.
    - `canStand` checks water twice.
    - F3 frame cost isn't measured: the browser pane was hidden.
  - **Your WIP on `p-walker`** (uncommitted `typeFor` and `startNear` edits) is untouched. Note that `typeFor` sends a walker to landmarks. Walkers are settlement events: on a loss, `fall()` would overrun the landmark. That's P-4's director rule to settle.

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

**Beat sheet (approved — DEC-10, 2026-10-15).** The detail (givers, objectives, flags, Act II payoffs, people) is in [the Act III story spec](superpowers/specs/2026-10-15-act-iii-story-design.md). The user chose tech first: P-1 and P-2 are built before B-1.

1. **The Highland Road** (talk, goto): Ashe sends you to Ironreach (`act3`), where you meet Foundrywright Isa Brannock.
2. **Iron Footsteps** (goto, kill): Synth scouts scan the waystones you've woken.
3. **The Walker** (event hook): a quest-called war-walker (P-2).
4. **Words from the Stone** (goto, use, talk): the emissary's order is to surrender the carrier (`emissary`, `synth_orders_known`).
5. **What the Voice Wants** (talk): Ysolde and the Pilgrim's plea. Reads `told_ashe` / `kept_wardens_secret`.
6. **The Fallen Titan** (goto, kill, use): pull the control core (`titan_core_taken`).
7. **Reading the Core** (use, defend): the core shows an earlier intrusion.
8. **The Foundry Below** (dungeon clear): B-3 (`foundry_below_cleared`).
9. **Plans for a Cage** (collect, talk): the cage (`cage_found`).
10. **Iron Muster** (talk, `city3:warden`): Tal. Reads `told_ashe` / `kept_wardens_secret`.
11. **The Colossus Foundry** (kill named foe): B-4 (`colossus_fallen`).
12. **Iron Heart** (choose, moment): cage (`pilgrim_caged`) or shield (`pilgrim_shielded`) the Pilgrim. `act3end`, then `act3_done`.

Task split: B-1 is beats 1–5, B-2 beats 6–7, B-3 beat 8, B-4 beat 11, and B-5 beats 9, 10 and 12 plus the act's close.

### B-1 Ironreach hub and opening quests
- status: review
- size: M
- depends: A-10, P-2
- needs: DEC-10
- scope: Ironreach's story dressing, beats 1–2, war-walker hooks into the story (quest-started via A-2), flags registered.
- acceptance:
  - [x] `questcheck` plays the new quests, including the choice and Act II flags read back.
  - [x] Standard DoD (`npm test` green on a clean checkout; captures of Isa and Ironreach's wall; buildcheck measures the wall).
- notes:
  - 2026-10-15: on branch `act-iii` (worktree `../portfolio-node-mmo-act3`, cut from `p-walker` e6fcce4), commits 1e518df..872bd86. The plan is [2026-10-15-act-iii-b1.md](superpowers/plans/2026-10-15-act-iii-b1.md). Started before A-10 at the user's word ("continue with act 3").
  - **Scope:** beats 1–5 per the spec (c1–c5), wider than "beats 1–2" above.
  - **Built:**
    - Foundrywright Isa Brannock (`city3:engineer`) stands by Ironreach's citadel door, and its wall towers carry smokestacks.
    - `ironstone` is the nearest waystone outside the walls that isn't in a village square. `ironhamlet` is the nearest settlement with a walker road.
    - Moments: `act3`, `emissary`, `plea`.
    - Flags: `act3_started`, `synth_orders_known`. Act II's `told_ashe` / `kept_wardens_secret` are read back in c1 and c5.
    - The journal's ACTS has Act III marked `partial`, and says Act III continues.
  - **Review fixes:**
    - The plea no longer says the Pilgrim lost its sleepers.
    - The emissary names the termination pulse.
    - The stone is never a village square (it was on seeds 777 and 95028).
    - c2 and c4 no longer assume the stone was woken.
  - **For the user:**
    - Read the c1–c5 lines.
    - `GameMenu.js` shows a partial act as done (5 / 5, green) once c5 is finished. It needs a "more to come" row when `A.partial` is set. The file is the user's, so this was left alone.
    - c3 counts only a won walker (A-2's rule), and a lost one overruns the settlement until it's retaken.

### B-2 The Fallen Titan story place and quests
- status: review
- size: M
- depends: B-1
- needs: DEC-1b, DEC-10
- scope: beat 3 and the place.
- acceptance:
  - [x] Placement, `poicheck` and `buildcheck` as in A-4.
  - [x] `questcheck` plays the quests.
  - [x] Standard DoD (`npm test` green on a clean checkout; captures of the Titan, its core and the yard).
- notes:
  - 2026-10-16: on branch `act-iii`, commits e02e275..68c16c2. The plan is [2026-10-15-act-iii-b2.md](superpowers/plans/2026-10-15-act-iii-b2.md). Scope is beats 6–7 of the approved beat sheet (c6, c7).
  - **Places:**
    - *The Fallen Titan* is the existing kneeling-titan landmark, set out from Ironreach, with its core housing torn out at its knees (`titan:core`). The generator's titans can no longer be called "Fallen" ("Shattered" instead).
    - The *Salvage Rig* is a Synth relay camp just beyond the Titan from the city (new `away` / `keep` / `around` placement options, used only by it). It sits 70–80 m out on ten seeds.
    - *Brannock's Yard* is a fenced yard just outside the walls, with its gate toward the city and the cradle under a gantry.
  - **Quests:**
    - c6 *The Fallen Titan*: reach it, clear the rig, pull the core. Moment `titan`; sets `titan_core_taken`.
    - c7 *Reading the Core*: wake the core in the cradle, then hold the yard against 3 Synth waves. Moment `coreread`: "INTRUSION IN THE NETWORK. CONTAINMENT HELD. ORIGIN: UNKNOWN." Who it was stays open (DEC-1c).
  - **Final review fixes:**
    - A defence can carry a `gate` bearing. The yard's waves come down its gate's line, so they get in, which eventcheck now checks with the world's own pathing. Before, most waves pressed against the back fence.
    - The rig was on the way to the Titan, so it got cleared before its step began.
    - The cradle now starts empty.
    - One c7 line contradicted "the old war".
  - **Deferred:**
    - `main.js` OBJECTS entries for `titancore` and `cradle`. Their prompts fall back to "Use", like Act II's array objects. `main.js` holds the user's uncommitted edits.
    - Generator POIs in about 3 regions per seed reshuffle round the new places. Chest ids there may now name different chests; that's harmless if nobody has explored Act III's lands.
    - The Titan has no chest, like the Pilgrim.
    - The rig is level 21 for a level-19 quest, within the precedent of Act II's Psion nest.
    - `eventcheck` crashes on seed 777 in an Act II overrun section. This predates this work: it crashes the same way on 208456b.

### B-3 The Foundry Below dungeon
- status: review
- size: L
- depends: B-1, G-2
- needs: DEC-1b, DEC-10
- start: `world/dungeons.js`, `world/DungeonGen.js`, `sim/Dungeons.js`, `tools/dungeoncheck.mjs`
- scope: a Synth-theme dungeon with a structural twist from G-2 (not the standard route), open-world copy and private runs at all tiers, a reward chest, achievements.
- acceptance:
  - [x] `dungeoncheck` covers the layout across many private runs (25), and runs through the instance manager. The Foundry Below is entered at its hatch and through a waygate, and its open-world copy takes shared slot 3. The full boss-and-chest run is still played only on the Vault, by the same generic code.
  - [x] Waygate and gate-yard entry work, with the story flag it needs (`titan_core_taken`; listed sealed until then).
  - [x] Standard DoD (`npm test` green on a clean checkout; a capture of the hatch).
- notes:
  - 2026-10-16: on branch `act-iii`, commits 66ffc11..89529fe. The plan is [2026-10-16-act-iii-b3.md](superpowers/plans/2026-10-16-act-iii-b3.md).
  - **Built:**
    - *The Foundry Below*: Synth theme, level 21, an open-world copy and private runs at every tier with the reward chest. It's sealed until `titan_core_taken`.
    - Boss: the Colossus, as *The Forge-Overseer*. Mini-boss: a Bulwark, *The Line Foreman*.
    - Its way in is a blast hatch in a rock cut out past Ironreach, story place `foundrybelow`.
    - Quest c8 (a `dungeon` step), the flag `foundry_below_cleared`, and the achievement *Down the Line* (74 achievements now).
  - **No G-2 twist (decision):** G-2 isn't built, so the dungeon uses the standard route for now. G-2 can add the twist later without moving its id or its way in.
  - **Final review fixes:**
    - The hatch, the Titan's core and the cradle now have names and prompts; the hatch was labelled "Object".
    - dungeoncheck covers the waygate and the open-world copy.
    - The hatch now stands in the cut, and buildcheck builds the site.
  - **To know:**
    - On seed 12345 the new place lands on region (-8,9), and that region's generator layout reshuffles. A Scav fort and a camp there are gone, so Ironreach's war table now marks 2 forts, not 3. This is inherent to adding a story place.
    - The ground round the hatch is level 23, and the blurb says "highlands" where the biome is forest and marsh. Both are flavour.
    - The boss pair repeats the Vault's (Colossus + Bulwark). B-4's named mechanics are meant to set the open-world Colossus apart.

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
- needs: DEC-1c, DEC-11
- scope: Anchorage's story dressing, the Ring story place and its quests.
- acceptance:
  - [ ] Placement, `poicheck` and `buildcheck` as in A-4; `questcheck` plays them.
  - [ ] Standard DoD.
- notes:

### C-2 Maker-vault dungeon
- status: todo
- size: L
- depends: C-1, G-2
- needs: DEC-1c, DEC-11
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

### W-1 Act lands and procedural camps
- status: review (merged to `main` as 9116173 on 2026-10-16; waiting on the user's playtest and a server restart)
- size: L
- why: Synths turned up at level 4; camps emptied under a crowd and all looked alike.
- spec: [2026-10-15-act-lands-and-camps-design.md](superpowers/specs/2026-10-15-act-lands-and-camps-design.md) · plan: [2026-10-15-act-lands-and-camps.md](superpowers/plans/2026-10-15-act-lands-and-camps.md)
- acceptance:
  - [x] No Hive before Act II and no Synths before Act III, on 5 seeds (`tools/campcheck.mjs`).
  - [x] Every settled place keeps its position for a seed (campcheck fingerprints).
  - [x] Tiered camps placed apart from each other and the roads, with room for their garrisons.
  - [x] Layouts are deterministic and identical on the server and the screen; every piece kind has a builder.
  - [x] Reinforcement waves: refill, crowd target, dead players, clearing with a crowd, quiet refill, story bosses, budget (campcheck).
  - [x] Frontier posts at every road into a later act; act banner; map borders.
  - [ ] (user) Playtest the Rustjaw Foundry: its garrison is base-tier now (25–40, was 10–14 guards).
  - [ ] (user) F3 frame cost at a base: not measured (the browser pane was hidden).
  - [ ] (user) Restart the server after merging.
- notes:
  - 2026-10-16: on branch `act-lands-camps` (worktree `../portfolio-node-mmo-camps`), with main merged in at bb3acd0 (the scenery props).
  - **Load** (`tools/loadsim.mjs`, seed 12345, 60 s):
    - 40 players: 2.80 → 3.49 ms a tick (peak 8.9 → 8.0).
    - 100 players: 9.85 → 13.2 ms a tick (peak 22.6 → 27.6), over the 12.5 ms budget. The cost is the bigger garrisons; lowering the waves' cap didn't change it.
  - **Client build of a base:** 50–70 ms. Baking about 1,550 prop meshes accounts for 46 ms of it. Caching baked prop variants was suggested to the scenery session.
  - **Also fixed:** siege engines behind a wall never fired, because rooted enemies took a path (`EnemySim.wayTo`).
  - **Known flake:** hordecheck's "Splitting" check fails about 1 run in 12, on main too.
  - 2026-10-16: a fresh reviewer (final whole-branch review) found four bugs, fixed with tests in campcheck:
    - A stronghold could be re-cleared for its full bonus every 30 s lull. Cleared now stays cleared until the garrison returns.
    - Squads vanished when nobody was within 30 m of their spawner. They now walk to their posts and stay.
    - Saved generated quests at camps that no longer exist locked their giver. They're now dropped on load.
    - A boss camp with no dry posts could throw.
  - 2026-10-16: merged to `main` (fast-forward to 9116173); branch and worktree removed.
  - **Deferred minors** (from the review):
    - The offline save writes Infinity camp timers as null, so a camp's dead refill at once after a reload.
    - A quiet refill can pop in view of someone 73–98 m off.
    - Story-camp posts can sit on quest folk, and the boss shares `posts[0]` with a guard.
    - `FORT_INNER` (12.5 m) still assumes the old fort.
    - Region generation is about 6× slower (up to 13 ms).
    - The map's act sampling costs about 13 ms a repaint, and a label can land on the wrong land.
    - The act banner can be missed after a quick teleport.
    - Stale contract distances for camps that moved.

### W-2 Waypoints, map and the 2026-10-16 bug batch
- status: doing
- size: L
- why: the user's list of 2026-10-16: waypoints in every settlement (and what that does to the map), plus six bugs and issues.
- where: branch `fixes-and-waypoints` (worktree `../portfolio-node-mmo-fixes`, cut from `main` at 09c4ab1, with its own `node_modules`). A temporary `game-fixes` entry (port 5178) is in `.claude/launch.json`; remove it when the worktree goes.
- shared files: the scenery session (plots) owns `src/world/campLayout.js`, `Gen.js`, `places.js`, `Towns.js` and `World.js`'s camp and scatter clearing until it says it has landed. 09c4ab1 ("Plots") is on `main`; confirm with it before the waypoint work touches those files.
- items:
  - [x] **Melee enemies dealt no damage to the player.** Fixed as c6c85fa on the branch (not merged).
    - Cause: `componentAtPoint` looked the hit point up in `hitRegions`, which knows only enemy anatomy. A player has no enemy type, so every sweep that reached a player found no body part, and `performSweep` dropped it. It now uses `bodyRegions`.
    - Checks: `tools/aicheck.mjs` covers a cutter's swing at a player (it fails with the old line). In the game, a cutter's swing landed for 11 damage. `npm test` green.
  - [ ] **First-person ink lines are blown up on lower-detail settings.**
    - Investigating; no cause found yet.
    - Leads: Low quality (`render/Quality.js`) turns post-process ink off, so the inverted-hull outlines are what draw. Hull ink is a fixed width in world units, and `render/ViewModel.js` puts the viewmodel on the 'view' `INK_SCALE` (`render/Toon.js`, 0.3) and scales it with `VM_INK` 0.42 / `VM_INK_ADS` 0.15 each frame. Check whether low detail draws the world hulls (or the body's hulls) over the view, or leaves the view scale unapplied.
  - [ ] **Area names on the map:** one line, translucent, e.g. "BRAMBLE WILDS (Lv. 12)", and no longer linked to waystones.
    - The code is in `ui/MapUI.js`: `queueLabel` (around line 522) and the region `location` entries that carry a waystone id (around line 229).
  - [ ] **Waypoints in every settlement**, and the map changes that follow.
    - Today waystones are one per region (`Gen.js` `waystoneSpot`), with villages, towns and cities built round them. Hamlets and the others have none.
    - Needs: a waystone in every settlement; the map showing settlements as travel points; deciding what the region-level waystone becomes.
    - Touches the scenery session's files (see above).
  - [ ] **Zoomed out, quest markers branch off the waystone of the settlement they're in** (in `ui/MapUI.js`).
  - [ ] **Players can still go into the next act's lands early.**
    - W-1 built a soft wall (banner, posts, map borders, no barrier), by the user's choice on 2026-10-15. This report reads as wanting a hard gate.
    - Open: how hard (a barrier until the act's story is reached, or an act level?), and online or offline only?
  - [ ] **Dungeons are reskins of each other:** they need variation and randomness.
    - This is G-2 (dungeon variety: route archetypes on top of today's fixed main route), raised by the user's report. Do it as G-2, and widen its scope if the user wants more randomness than archetypes give.
- open questions for the user:
  - The act gate's rule.
  - What the region waystone becomes once every settlement has one.
  - Whether dungeon variety means new room shapes and layouts, or random encounters and loot within today's shapes.

---

## 10. Next up

Moved to the lanes table in section 5: each lane's "Doing" and "Then" columns say what's next. Note any task that was skipped or reordered in the progress log.

---

## 11. Progress log

Append-only. Newest last. Format: `YYYY-MM-DD — ID — what changed — checks run — what the user needs to do`.

- 2026-10-14 — (plan) — created from ROADMAP.md; no work started — none — decide DEC-1 to DEC-11 as tasks reach them.
- 2026-10-14 — (plan) — set up for several sessions at once: lanes table in §5 (replaces §10's single "Next up"), `- owner:` lines, shared-file rules in §2, DEC-1 split into DEC-1a–1c. S-1 (Engine lane) and Act II's story (Story lane) were already under way in their own sessions — none (docs only) — nothing.
- 2026-10-14 — S-1 — server's headless world builds the scenery geometry and gives trees, rocks and cacti the client's mesh triangles (and surfaces); parity section added to `physicscheck.mjs`; GAMEPLAY_PLAN's known issue and README updated — `npm test` green, loadsim 150 within noise (11.4–11.6 ms vs 10.8–11.5 ms) — restart the server on 8080 and fight a camp in a forest, then set S-1 `done`.
- 2026-10-14 — S-1 — committed as 290c9f8 on branch `s-1-collider-parity` (worktree `../portfolio-node-mmo-s1`, cut from `main` at e4aa665), moved out of the shared checkout — `physicscheck` re-run in the worktree — merge or PR the branch.
- 2026-10-14 — S-2 — CI already right (trigger `main`, `npm test` and cluster test); restored `deploy/Caddyfile` for Compose; DEPLOY.md and MULTIPLAYER.md now point at `portfolio-helm-website` for the manifests and secret, `master` → `main`; commit 5919f71 on `s-2-deploy-verification` — stale-reference grep and Compose mount check; CI run 38616473602 green — confirm the pods run the latest image, check the chart's `lookup` secret under Argo CD, merge or PR the branch.
- 2026-10-14 — DEC-1a, DEC-9 — Act II's story bible and beat sheet decided with the user and written up in `docs/superpowers/specs/2026-10-14-act-ii-story-design.md`; the §7 beat sheet replaced. A-7's "both Act II choices" should read "the Act II choice" (one choice), left for whoever claims A-7. The spec also asks A-4 to drop "Farcall" from `world/Gen.js:118`'s random array names — none (docs only) — nothing.
- 2026-10-14 — A-5 (partial) — Captain Vey Okonta, the Spore Field, the Psion's nest, the `dungeon` objective and quests b1–b2, on branch `act-ii-story` (worktree `../portfolio-node-mmo-act2`, commits 89b1d82..906916e) — `npm test` green — read the new Act II lines in `src/rpg/storyline.js`; a server restart is needed once this is merged (sim/world code changed); A-2 and A-4 unblock the rest.
- 2026-10-14 — S-3 — trade, mail send and mail claim each written in one transaction (they could duplicate or lose items if a layer died between writes); saves refused once another layer holds the character; chests, lockouts and legendaries confirmed safe and documented; new `tools/persistcheck.mjs` in `npm test`; commit 2454e9b on `s-3-persistence` — `npm test` green; cluster test not run here (no Postgres) — let CI's cluster test pass on the branch, restart the server on 8080 once merged.
- 2026-10-14 — S-4 — MULTIPLAYER.md talents, DEPLOY.md test line, GAMEPLAY_PLAN §1 status refreshed and its original power-curve table moved to Appendix A, README links ROADMAP and WORK_PLAN; DEC-8 skipped (still open); commit 4f8e298 on `s-4-doc-fixes` — stale-wording grep, link and moved-text checks, merge-tree against S-1 to S-3 — answer DEC-8; merge the four S branches (S-1 and S-3 need README's dev-tools line combined).
- 2026-10-14 — A-1 — story flag registry `tools/storyflags.mjs` (14 Prologue and Act I flags, plus the `used:` family) and a "Story flags" section in questcheck: read but never set fails, set but never read warns (8 today), unregistered or out-of-date entries fail; README updated; commit 05070dd on `claude/hopeful-lumiere-c6c3dc` — `npm test` green; a deliberate typo in a7's offer key failed questcheck, then reverted — merge the branch (README's dev-tools line will need combining with S-1/S-3); no restart needed.
- 2026-10-15 — S-1 to S-4 — merged by the user (PRs #2–#5; local `main` pushed first so each PR held only its own commit); CI passed on the S-1, S-3 (cluster test included) and S-4 PRs, but every run on `main` after the merges was cancelled, so no image has been built from it yet. Merging S-3 after S-1 dropped README's `persistcheck.mjs` description; restored as 43df6f0 on branch `s-3-readme-line` — README only — open and merge that PR (it also triggers a fresh `main` build), restart the server, and do S-1's forest playtest. (2026-10-15: pushed straight to `main` at the user's word instead, a fast-forward; `main` CI run 38707412524 started on it.)
- 2026-10-15 — A-2 — quest-to-event hook: an `event` objective calls a public event at a place (`WorldEvents.startStory`, tier locked at Normal, `wev lk`), and winning it moves the step on per participant (server op `evwon`); spacing rules and the objective shape for b3 are in A-2's notes; commit 057b474 on `a2-quest-event-hook` — `npm test` green (eventcheck plays a quest surge with two stand-ins in the sim and on the server, plus the lost/retake path) — restart the server on 8080 once merged.
- 2026-10-15 — A-3 — the story opens the Brood Mother's raid gate (`broodgate_open`; one in the raid group or party with it takes the rest in; no level floor; a refusal says why); no migration, by the user's call; the flag is registered `pending` for A-7's quest 11; commit c2edfc8 on `a-3-raid-gate` (cut from A-1's branch) — `npm test` green — merge A-1 then A-3, and restart the server on 8080; the raid is closed to all until A-7 lands.
- 2026-10-15 — A-1 — merged by the user (PR #6, 02a8f61 on main); set `done` — questcheck green on merged main — nothing.
- 2026-10-15 — A-2, A-3 — merged to main (PR #8, PR #7); A-3 `done`, A-2 stays `review` until the server is restarted — `npm test` green on each branch after merging the latest main — restart the server on 8080; the Brood Mother raid is now sealed to everyone until A-7's quest 11 sets `broodgate_open`.

- 2026-10-15 — A-5, A-6, A-7 — all of Act II (b1–b12, moments, barks, flags) on branch `act-ii-story` (worktree `../portfolio-node-mmo-act2`, head 476fa0a), merged with A-1–A-3 and A-4's branch. The fresh-reviewer pass fixed b2's Spore Field, the dungeon waypoint and the journal line — `npm test` green; questcheck plays all 8 choice combinations — read the Act II lines, decide how to merge (one PR, or A-4's own PR first), restart the server after merging, and play from b1.
- 2026-10-15 — A-5, A-6, A-7 (and A-4) — `act-ii-story` merged into local `main` as 9e151bc, which also brings A-4's Farcall Array (fe7ef51); branch and worktree removed — `npm test` green on the merged commit, run in a clean checkout — push `main`, restart the server, read the Act II lines, play from b1. A-4's own task block still shows `todo`, because its session couldn't write here.
- 2026-10-15 — DEC-1b, DEC-10 — the Act III story bible and beat sheet decided with the user (the Synths' quarantine, quests c1–c12, the cage-or-shield choice, Foundrywright Isa Brannock). Spec committed as 82373cc. The user chose tech first, so P-1 and P-2 are planned next — no code changed — none.
- 2026-10-15 — P-1, P-2 — routes along the roads, events that lead something along them, and the Synth war-walker (couplings, escort, overrun on arrival, turns back if abandoned or stuck), with models, codex entries, the tracker and docs, on branch `p-walker` (478fb94..e6fcce4, with the final review's fixes). `npm test` green on a clean checkout — restart the server on 8080 after merging. Walkers come only from quests or the console until P-4.
- 2026-10-15 — B-1 — Act III's opening: Ironreach (Isa Brannock, smokestacks) and quests c1–c5 (The Highland Road, Iron Footsteps, The Walker, Words from the Stone, What the Voice Wants), with moments, flags and the journal. On branch `act-iii` (on `p-walker`), 1e518df..872bd86, with a fresh review's fixes. `npm test` green on a clean checkout — read the lines; merge `p-walker` first, then `act-iii`; restart the server on 8080.
- 2026-10-16 — B-2 — the Fallen Titan, the Salvage Rig and Brannock's Yard, and quests c6–c7 (The Fallen Titan, Reading the Core), with moments and `titan_core_taken`; a fresh review's fixes (gated defences, the rig beyond the Titan). On branch `act-iii`, e02e275..68c16c2. `npm test` green on a clean checkout — read the c6–c7 lines; merge `p-walker`, then `act-iii`; restart the server on 8080.
- 2026-10-16 — B-3 — the Foundry Below (a Synth dungeon past Ironreach, sealed until the Titan's core is taken; Forge-Overseer boss), its hatch, quest c8, `foundry_below_cleared` and Down the Line; a fresh review's fixes. On branch `act-iii`, 66ffc11..89529fe. `npm test` green on a clean checkout — read the c8 lines; G-2's twist is still to come.
- 2026-10-16 — P-1, P-2, B-1, B-2, B-3 — merged into local `main` as aeb5bb3 (`act-iii`, which carries `p-walker`'s commits), at the user's word. Merged in a separate worktree on top of main's scenery-kit commits (87a24ee) with no conflicts; `npm test` green on the merged tree. `main` was fast-forwarded with the main checkout's uncommitted work left in place (the user's WorldEvents.js hunk set aside and restored). Not pushed — restart the server on 8080; read the c1–c8 lines; playtest Act III so far. The tasks stay in `review` until then.
- 2026-10-16 — W-1 — act lands and procedural camps (with the scenery props and the final review's four fixes) merged into local `main` as 9116173, a fast-forward with the user's uncommitted WORK_PLAN edits set aside and restored; branch and worktree removed — `npm test` green on `main` — not pushed; restart the server on 8080; playtest the Rustjaw Foundry and a base (F3 frame cost).
- 2026-10-16 — W-2 — started the user's batch on branch `fixes-and-waypoints` (worktree `../portfolio-node-mmo-fixes`). Melee damage to the player fixed (c6c85fa). Ink lines under investigation; the rest are todo, with open questions in W-2 — `npm test` green; the melee fix was checked in the game — answer W-2's open questions; nothing to merge yet.
---

## 12. Backlog and open questions

Add ideas and blockers here. Don't act on them without the user's say-so.

- (S-1, 2026-10-14) The ragdoll section of `physicscheck.mjs` seeds `Math.random` globally, and three.js draws from it for every new UUID, so its kicks depend on how many geometries, materials and textures were made before (the toon gradient is lazily created). With other kicks, `scav:juggernaut` and `hive:queen` end 0.11–0.12 of their size off a joint against the 0.10 limit. Worth a dedicated PRNG for the kicks (Ragdoll.js uses `Math.random` at ~line 844) and a look at whether those two rigs are genuinely marginal.
