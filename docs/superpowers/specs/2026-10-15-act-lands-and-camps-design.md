# Act lands and procedural camps: design

> **Date:** 2026-10-15
> **Scope:** the world generator's choice of faction per region (act-gated lands with a soft wall), and a rework of enemy camps: procedural layouts in three tiers, more enemies, and reinforcement waves instead of slow per-slot respawns.
> **Decided with the user (2026-10-15):** content gate plus a soft wall (not a hard gate); concentric act rings with warped borders; reinforcement waves; three camp tiers built from a kit per faction.

---

## 1. Goal and problems

- **Factions ignore the story.** `Gen.buildRegion` picks a region's race from `RACE_BY_BIOME`. Only the hub and its eight neighbours (`ring <= 1`) rule out Hive and Synths, so a Synth relay can stand about 480 m out at level 4, long before Act III (levels 16–24) introduces them.
- **Camps don't scale with players.** Each slot refills 75 s after its enemy dies (300 s at strongholds), and only when nobody is within 26 m (`RESPAWN_CLEARANCE`). A group, or a busy server, empties a camp and it stays empty.
- **Camps look the same.** Each faction has one hand-built layout in `World.buildCamp` (radius 10–13 m), and `campUnits` gives 4–16 enemies.

Success:

- No Hive camp, pack or event in Act I lands, and no Synths before Act III, on any seed.
- Walking into a later act's land early is allowed, but the border is visible and the game warns you.
- Camps vary in size and arrangement, hold more enemies, and keep a crowd of players fed without enemies popping in.
- The world stays seamless: no loading screens and no blocked borders.

---

## 2. Act lands

### 2.1 Which act a region belongs to

`Gen.actOf(rx, rz)` is a pure function of the seed and the region:

- Take the distance `d` of the region's site from the hub.
- Add a warp from a low-frequency noise field, of ±150 m.
- Read the act from the warped distance: Act I below 1000 m, Act II below 2000 m, Act III below 3000 m, Act IV beyond.
- Clamp the result so each story city's region has that city's act (cities sit at 560, 1450, 2500 and 3400 m), and so the hub ring is Act I.

The act is taken per region, so borders follow region edges and don't read as circles. With level ≈ 1 + d/130, the borders fall near levels 8, 16 and 24, which matches the story's act levels.

The region object gains `act` (1–4). `regionAt` and `poisNear` consumers see it with no other change.

### 2.2 Faction by act, then biome

A new `RACE_BY_ACT` table lists, for each act, the factions allowed and a multiplier for each. A region's weights are `RACE_BY_BIOME[biome]` multiplied by that act's multipliers, with disallowed factions removed. If nothing is left, the region falls back to the act's first faction.

| Act | Allowed (multiplier) | Feel |
|---|---|---|
| I | scav 1, fauna 1 | Scav raiders and wildlife |
| II | hive 2.5, scav 1, fauna 1 | Hive country |
| III | synth 3, hive 1, scav 0.6, fauna 0.8 | Synths wake across the highlands |
| IV | synth 1, hive 1, scav 1, fauna 1 | Everything; the Maker endgame |

- This replaces the `ring <= 1` reroll.
- The draw uses one value from the region's stream, as now, so nothing else in the region moves.
- Roaming packs, warbands and world events already read `region.race`, so they follow the new rule with no change.

### 2.3 The soft wall

- **Frontier posts.** Where a road crosses from one act into a later one, a Warden frontier post stands on the earlier side: a gate-post arch, the act's banner, and a signboard naming the land ahead and its levels.
  - The posts are POIs (`type: 'frontier'`). They are found by walking each region's roads and testing the act on both ends of each segment.
- **Dressing on the far side.** A strip about 30 m wide along the later side of a border gets faction dressing. It's scattered through the existing greeble and prop path, so it adds no colliders:
  - Hive land: creep patches and resin nubs.
  - Synth land: quarantine pylons with arcing caps.
  - Act IV: Maker shards.
- **Entering a later act's land.** The HUD shows a banner like "Entering Hive country — levels 8–16".
  - It's an amber warning when the player's level is below the band's minimum.
  - It shows once per crossing, debounced so walking along a border doesn't repeat it.
- **The map.** The world map draws act borders as a dashed line along the region edges where the act changes, and labels each band.
- **No hard gate.** Nothing blocks movement. The danger comes from the level curve and the factions.

### 2.4 Stability

- Waystones, villages, towns, cities, landmarks, story places, mesas, towers, ruins and chests keep their positions.
- Camps move to a stream of their own, `hash2(rx, rz, seed ^ 0xca39)`, so camp changes never shift anything else.
- Story camps (`world/story.js`, ids `sf:` and `sc:`) keep their ids, positions, races and levels. They get a tier (§3.1) and a layout like any other camp.

---

## 3. Procedural camps

### 3.1 Tiers

| Tier | Radius | Garrison (base) | Perimeter | Spawners | Respawn squad |
|---|---|---|---|---|---|
| outpost | 10 m | 6–10 | partial (boulders, stakes, mounds) | 1 | 2–3 every 30 s |
| camp | 18 m | 12–20 | ring with 1–2 gaps | 1–2 | 3–4 every 25 s |
| base | 28 m | 25–40 | full walls with 2 gates | 2–3 | 4–6 every 20 s |

- A **stronghold** is a base with the race boss on a throne or dais at its back, plus the existing alarm waves (`strongholdWave`).
- Story camps without a tier take one from their radius: `fort` becomes base, and anything else becomes outpost.
- Garrisons rise with level within each range, following `HORDE` in `combat/races.js`. Elites and champions still come from `bandOf(level)`.

**Per region** (not hub or city regions), drawn from the camp stream:

| Region | Outposts | Camps | Base |
|---|---|---|---|
| Act I, level < 5 | 2 | 0–1 | none |
| Act I, level ≥ 5 | 1–2 | 1 | 25% chance |
| Act II–IV | 1–2 | 1–2 | 40% chance (a stronghold instead, 28%, from level 10) |

- The hub region keeps its single tutorial outpost.
- Gaps between camps grow with their radius, so `spot(gap)` uses `R + 30`.

### 3.2 Layout: `world/campLayout.js`

`campLayout(def)` returns a layout as a pure, deterministic function of the definition (seeded by `def.seed`):

```
{ tier, R, pieces: [{ kind, x, z, rot, r, h, ... }], posts: [{ x, z }], spawners: [{ id, x, z, kind }], gates: [{ a }] }
```

- It's built in layers:
  1. **Core:** the faction's centrepiece (fire, node, pylon or overhang).
  2. **Perimeter:** an arc or ring of wall pieces at `R`, broken at gates for camps and bases.
  3. **Buildings:** 1, 3 or 6 of the faction's structures by tier, placed by rejection sampling on rings so they don't overlap.
  4. **Defences:** turrets, spires or watch posts at gates and corners (camp and base).
  5. **Spawners:** drop-pod pads, hive mounds or burrows, inside a gate or at the back.
  6. **Cover and clutter:** crates, barrels, eggs, bones.
  7. **Posts:** standing spots for the garrison, spread over open ground and kept off pieces.
- Coordinates are local to the camp's centre. Every piece stays within `R + 2`.
- Each layer draws from the layout's own seeded stream in a fixed order, so adding a layer later can't move earlier ones.
- Pieces carry a collider radius and height, so the sim and the client agree on what blocks movement.
- The kits (which pieces each faction has):

| Faction | Core | Perimeter | Buildings | Defences | Spawner |
|---|---|---|---|---|---|
| scav | campfire | corrugated stakes, scrap walls | shacks, tents, a radio mast, a scrap heap | gun nest | drop pad (a truck arrives) |
| salvage (scav) | slag furnace | boulders | scrap heaps, suit racks | gun nest | drop pad |
| hive | glowing node | resin mounds | egg clutches, chitin spires | spitter spire | hive mound (bursts) |
| synth | pylon | conduit fences | cargo pods, relay masts | sentry turret (a prop) | drop pod (lands from the sky) |
| fauna | rock overhang | boulder ring | branch nests, bone piles | none | burrow |

### 3.3 Building them: `world/build/campKit.js`

- `World.buildCamp` calls `campLayout(def)`, then hands each piece to the faction kit's builder for its `kind`.
- The builders reuse the existing helpers (`tent`, `crate`, `stake`, `campfire`, `piece`, `addCollider`), moved out of `World.js`'s `buildCamp` body.
- `buildFort` is replaced by the base-tier layout with `def.stronghold`. The fort's look table (wall colours and surfaces per race) moves into the kit.
- The existing hand-built looks become each faction's default pieces, so the camps keep their art style.

### 3.4 In the sim

- `WorldSim.makeSlots(def)` takes slot positions from `campLayout(def).posts` instead of the ring formula. The boss slot goes to the layout's throne.
- `campKeep` for bases keeps placements inside the walls.
- Dungeon rooms (`def.units`) are unchanged.

---

## 4. Reinforcement waves

These replace per-slot refills for world camps. Dungeon rooms keep `def.respawn`.

- **Garrison target:** the layout's base garrison × crowd, where crowd = `min(2.5, 1 + 0.5 × (players within 70 m − 1))`. The target is capped at `CAMP_CAP` alive: 24 for an outpost, 40 for a camp, 60 for a base.
- **Waves while engaged:**
  - While any player is within 70 m and the camp's living count is under its target, a squad arrives every `tier.every` seconds (30, 25 or 20).
  - The squad comes from the spawner nearest the camp's centre that is farthest from the players.
  - The squad is `tier.squad` units off the camp's roster, rolled with `campUnits`' rules. They spawn on the spawner, aggro on the nearest player if one is within 30 m, and otherwise walk to empty posts.
  - The sim emits `{ t: 'reinforce', camp, spawner, n }`, and the client plays the spawner's arrival (a pod landing, a mound bursting, a truck pulling up, a burrow erupting).
- **Cleared:**
  - When the living count hits zero, the camp is `cleared`: `onCampCleared` fires as now, so quest `clear` objectives and the cleared moment still work.
  - Waves pause for a 30 s lull, then resume while players are near.
  - The first new arrival fires `onCampRestored`, as now.
- **Nobody near:** a camp with no player within 70 m refills to its base garrison 60 s after the last player left, all at once. Nobody sees it happen. `saved` timers persist as now (a single "refill at" time per camp).
- **Strongholds:** keep their alarm waves (`WAVES`) as well. Those are added to the same target and cap.
- **Credit and XP:** unchanged per kill. `strongholdXp` sums the base garrison only, so waves don't inflate the clear reward.
- **Server load:**
  - Idle members of a camp keep the existing `LOD_RANGE` and `LOD_STEP` thinking.
  - A global soft cap (`MAX_CAMP_ENEMIES`, default 600 alive across all camps) delays waves when it's reached. Waves at camps with fewer players wait first.

---

## 5. Files

| File | Change |
|---|---|
| `src/world/Gen.js` | `actOf`, `RACE_BY_ACT`, region `act`, the camp stream, tiers and counts per region, frontier POIs |
| `src/world/campLayout.js` | new: the pure layout function, and the tier and kit tables the sim needs |
| `src/world/build/campKit.js` | new: the piece builders per faction, moved out of `World.js` |
| `src/world/World.js` | `buildCamp` and `buildFort` delegate to the kit; frontier posts; border dressing |
| `src/world/story.js` | a tier on story camps |
| `src/combat/races.js` | `campUnits` sizes by tier; `campSquad(def, n, rng)` |
| `src/sim/WorldSim.js` | posts from the layout, the reinforcement model, caps and the `reinforce` event |
| `src/main.js` (or the client's sim-event handler) | play `reinforce`; the act-border banner |
| `src/ui/MapUI.js` | act borders and labels |
| `tools/campcheck.mjs` | new; added to `npm test` |
| `tools/poicheck.mjs`, `tools/hordecheck.mjs` | updated for the new counts and tiers |
| `docs/WORK_PLAN.md`, `docs/GAMEPLAY_PLAN.md` | the task, and the world section |

---

## 6. Testing

`tools/campcheck.mjs` runs on at least 5 seeds:

- **Act lands:**
  - Sample regions out to 4000 m.
  - Every story city's region has its own act.
  - No Hive or Synth region has `act` 1, and no Synth region has `act` below 3. This includes camps from `world/story.js`, except for story camps placed on purpose.
  - Act borders move by no more than 200 m from their nominal radius.
- **Layouts:**
  - Deterministic: two calls give deep-equal results.
  - Every piece stays within `R + 2`.
  - Posts don't overlap piece colliders.
  - Every post and spawner can reach the camp's centre on `OpenNav`.
  - Garrison counts fall within the tier's range.
- **Waves (headless `WorldSim`):**
  - With 1 player at a base, the camp refills at about the tier's rate and stops at its target.
  - With 4 players, the target rises by ×2.5 and is capped.
  - A camp cleared to zero fires `onCampCleared` once, pauses for 30 s, then restores.
  - A camp nobody is near refills 60 s after they leave.
- **Budget:** 8 players at a base for 120 s of sim time, with a mean tick under the existing `hordecheck` budget, and alive enemies never over the cap.

Also:

- `poicheck` and `placecheck` stay green: camps stay off roads, towns and story places.
- `worldshots` captures each faction at each tier, plus a frontier post, for review.
- The F3 frame check in the browser at a base with 40 enemies.

---

## 7. Out of scope

- A hard story gate or barriers at borders.
- Destroyable spawners (decided against: waves only).
- New enemy types or rosters, and new art beyond the kit pieces listed in §3.2.
- Changes to dungeon rooms, raids, or the event director's choice of event (which follows `region.race` already).
