# Act Lands and Procedural Camps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gate factions by act across concentric, warped act lands with a soft wall at their borders. Replace the hand-built camps with procedural camps in three tiers that are held by reinforcement waves.

**Architecture:**
- `Gen` gives every region an `act` from a pure `actOf(rx, rz)` and filters its faction by act.
- A new pure `campLayout(def)` is the single source of a camp's pieces, posts and spawners:
  - the client builds the pieces through a per-faction kit;
  - `WorldSim`'s `Encounters` places garrisons on the posts and runs the reinforcement waves from the spawners.
- Frontier posts are POIs found where roads cross into a later act. The HUD banner and the map read `region.act`.

**Tech Stack:** plain ES modules, three.js, Node checks under `tools/*.mjs` run by `npm test` (no test framework; `check(ok, what)` plus exit code).

**Spec:** [docs/superpowers/specs/2026-10-15-act-lands-and-camps-design.md](../specs/2026-10-15-act-lands-and-camps-design.md)

## Global Constraints

- The world stays a pure function of `(seed, position)`. Never use `Math.random` in `Gen`, `campLayout` or the kit.
- Act borders: warped distance below 1000 m is Act I, below 2000 m Act II, below 3000 m Act III, otherwise Act IV. The warp is ±150 m. The hub ring is Act I. Each story city's region has its city's `act`.
- `RACE_BY_ACT`:
  - Act 1: `{ scav: 1, fauna: 1 }`
  - Act 2: `{ hive: 2.5, scav: 1, fauna: 1 }`
  - Act 3: `{ synth: 3, hive: 1, scav: 0.6, fauna: 0.8 }`
  - Act 4: `{ synth: 1, hive: 1, scav: 1, fauna: 1 }`
- Tiers, as `{ R, garrison: [min, max], spawners: [min, max], squad: [min, max], every, cap }`:
  - outpost `{ 10, [6,10], [1,1], [2,3], 30, 24 }`
  - camp `{ 18, [12,20], [1,2], [3,4], 25, 40 }`
  - base `{ 28, [25,40], [2,3], [4,6], 20, 60 }`
- Waves:
  - crowd = `min(2.5, 1 + 0.5 × (alive players within reach − 1))`;
  - the cleared lull is 30 s;
  - a camp nobody is near refills after 60 s;
  - `MAX_CAMP_ENEMIES = 600`.
- **Stability:** waystones, villages, towns, cities, landmarks, story places, mesas, towers, ruins, chests and hamlets keep their exact positions for a given seed. Camps use the stream `hash2(rx, rz, seed ^ 0xca39)`.
- **Spec corrections** (decided while planning, from the code):
  - Sim events use `k`, not `t`, so the event is `{ k: 'reinforce', at, p, race, kind, n }`.
  - `Encounters.saved` lives in memory only, so no migration of saved data is needed.
  - Spawn and despawn reach scale with the camp: `reach(def) = def.radius + 45`, despawn at `def.radius + 70`. The fixed 55 m and 80 m would leave a base half-awake.
- Match the house style: comments in plain British prose, two-space indent, single quotes, no new dependencies.
- `npm test` must be green at every commit. Add `node tools/campcheck.mjs` to the `test` script, before `smoke.mjs`.

## Review Focus

1. **Camps from neighbouring regions overlap.** `spot()` only sees its own region's `taken` and `bigNear`, and a base of radius 28 near a region edge can run into the next region's camp. Expect no two camps' footprints within 20 m of each other. Task 3 adds the test.
2. **Layout pieces on water or cliffs.** A base of radius 28 is wider than its old pad tests covered. Expect no post or spawner over water, and pieces over water dropped. Task 2 adds the test with a world probe, and Task 3 runs it on generated camps.
3. **Dead players.** A dead player standing in a camp shouldn't call waves or raise the crowd. Expect the crowd and engagement to count only `alive` players. Task 6 adds the test.
4. **Clearing a camp with a crowd present.** Four players at a base must still be able to clear it. With waves of at most 6 every 20 s, it's reachable, and `onCampCleared` fires. Task 6 adds the test.
5. **Story camps with a named boss** (`def.boss`, Act II's Psion; story forts with Ironjaw). Waves must never spawn a second boss, and the boss must keep its tagged identity. Expect waves to refill only non-boss posts. Task 6 adds the test.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/world/Gen.js` (modify) | `actOf`, `actAt`, `RACE_BY_ACT`, `region.act`, the faction by act, camp tiers and placement on the camp stream, frontier POIs |
| `src/world/campLayout.js` (create) | `TIERS`, `tierOf(def)`, `campLayout(def, probe?)`, which is pure and memoised by `def.id` |
| `src/world/build/campKit.js` (create) | `KITS` per faction: `buildPiece(world, g, camp, piece)` builders and the fort look table |
| `src/world/World.js` (modify) | `buildCamp` delegates to the kit; `buildFort` is removed; `buildFrontier`; border dressing in `scatterChunk` |
| `src/world/story.js` (modify) | `tier` on story camps |
| `src/combat/races.js` (modify) | `campUnits` sized by tier; `campSquad(def, n, rng)` |
| `src/sim/WorldSim.js` (modify) | `Encounters`: posts from the layout, reach, waves, caps, lull, quiet refill, the `reinforce` event |
| `src/entities/EnemyLayer.js` (modify) | plays `reinforce` |
| `src/main.js` (modify) | the act-border banner in `updateZone` |
| `src/ui/MapUI.js` (modify) | act borders in the cached picture |
| `tools/campcheck.mjs` (create) | act lands, layouts, placement, waves, budget |
| `tools/hordecheck.mjs`, `tools/poicheck.mjs` (modify) | new tiers and kits |
| `docs/WORK_PLAN.md`, `docs/GAMEPLAY_PLAN.md` (modify) | the task block and the world section |

---

### Task 1: Act lands and faction by act

**Files:**
- Modify: `src/world/Gen.js` (constants near `RACE_BY_BIOME`, line 37; `buildRegion`, lines 643–660)
- Create: `tools/campcheck.mjs`
- Modify: `package.json` (the `test` script)

**Interfaces:**
- Produces:
  - `export const ACTS = [{ act: 1, to: 1000, levels: [1, 8], name: 'Scav country' }, { act: 2, to: 2000, levels: [8, 16], name: 'Hive country' }, { act: 3, to: 3000, levels: [16, 24], name: 'Synth country' }, { act: 4, to: Infinity, levels: [24, 30], name: 'The Maker lands' }]` from `Gen.js`.
  - `export const RACE_BY_ACT`, with the values in Global Constraints.
  - `Gen#actOf(rx, rz) → 1|2|3|4`: pure and memoised. It doesn't build the region.
  - `Gen#actAt(x, z) → 1|2|3|4`: the act of the nearest site, found the way `regionAt` finds it but without building the region.
  - `region.act`.
- Consumes: `this.site`, `this.cities()`, `makeNoise2D`, `hash2`, `weighted`.

- [ ] **Step 1: Record the stability fingerprint before touching Gen.**
  - Create `tools/campcheck.mjs` with the `check` and exit pattern from `tools/hordecheck.mjs`, `HeadlessWorld(seed)`, and seeds `[12345, 1, 777, 4242, 90210]`, with a `--seed N` override.
  - Add `fingerprint(gen)`: for rings 0–6, a stable string hash (FNV-1a) of every POI whose `type` isn't `camp` or `frontier`, as `${p.id}@${p.x.toFixed(2)},${p.z.toFixed(2)}`, joined in region order.
  - Run it once on the unchanged code and paste the five hashes in as `const FINGERPRINTS = { 12345: '…', … }`.
  - Add the check `fingerprint unchanged for seed N`.
- [ ] **Step 2: Write the failing act checks in `campcheck.mjs`.**
  - For each seed, sample every region with `max(|rx|, |rz|) ≤ 18`.
  - `check(gen.region(0,0).act === 1)`.
  - For every city `c` in `gen.cities()`: `gen.region(c.rx, c.rz).act === c.act`.
  - For every region: `act >= 1 && act <= 4`. `|hypot(site) − nominal border| ≤ 200` wherever a region's act differs from a neighbour's, where the nominal border is the `ACTS[min(a,b)−1].to` between them.
  - No region has `race === 'hive' && act < 2`, and none has `race === 'synth' && act < 3`.
- [ ] **Step 3: Run it and see it fail.** Run `node tools/campcheck.mjs`. Expected: the act checks fail (`region.act` undefined) and the fingerprint passes.
- [ ] **Step 4: Implement it.**
  - `actOf(rx, rz)`:
    - warped distance = `hypot(site) + 150 × noise(sx / 1600, sz / 1600)`, using a noise field seeded from `this.seed ^ 0xac75`;
    - read the act off `ACTS`;
    - the hub ring (`max(|rx|, |rz|) ≤ 1`) is 1;
    - a city's region is its `act`.
  - In `buildRegion`, keep the main stream's draws exactly as they are today: the `weighted(rng, RACE_BY_BIOME[biome])` call and the `ring <= 1` reroll's `rng()`, kept as a burn. Then pick the real race from the camp stream, `campRng = mulberry32(hash2(rx, rz, this.seed ^ 0xca39))`, with weights `RACE_BY_BIOME[biome][r] × RACE_BY_ACT[act][r]` over the act's factions. If none is left, use the act's first key.
  - Put `act` on the region.
- [ ] **Step 5: Run it and see it pass.** Run `node tools/campcheck.mjs`. Expected: `campcheck: all good`, with all five fingerprints unchanged.
- [ ] **Step 6: Add the check to `npm test`, then run `npm test`.** Expected: everything green. If `questcheck` or `eventcheck` depended on a region's race near a story site, fix the test's assumption only when the story site sets its own race. Otherwise report it.
- [ ] **Step 7: Commit:** "Act lands: regions take an act, and factions by act".

### Task 2: Camp layouts (pure)

**Files:**
- Create: `src/world/campLayout.js`
- Modify: `tools/campcheck.mjs`

**Interfaces:**
- Produces:
  - `export const TIERS`, with the values in Global Constraints, keyed by `'outpost' | 'camp' | 'base'`.
  - `export function tierOf(def) → tier key`, which returns `def.tier`, otherwise `'base'` for `style === 'fort'`, otherwise `'outpost'`.
  - `export function campLayout(def, probe = null) → { tier, R, pieces, posts, spawners, gates, throne }`, where:
    - `pieces`: `[{ kind, x, z, rot, r, h, s? }]`, local metres;
    - `posts`: `[{ x, z }]`, at least `TIERS[tier].garrison[1]` of them;
    - `spawners`: `[{ id: `${def.id}:sp${i}`, x, z, kind }]`;
    - `gates`: `[{ a }]`, radians;
    - `throne`: `{ x, z }` or `null`, for strongholds.
  - `probe` is an optional `(wx, wz) → boolean` for world positions that can't be built on (water, or slope over 0.6). The client and the sim pass `world.isWater` combined with slope. With no probe, everything is allowed.
  - The result is memoised in a module `Map` keyed by `def.id`, and only when a probe is given or the id is stable. Dungeon rooms never call it.
- Kits list their piece kinds per layer. Use these exact strings:
  - scav: core `fire`, wall `stakes`/`scrapwall`, building `shack`/`tent`/`mast`/`heap`, defence `gunnest`, spawner `droppad`, clutter `crate`/`barrel`
  - salvage: core `furnace`, wall `boulder`, building `heap`/`suitrack`, defence `gunnest`, spawner `droppad`, clutter `crate`
  - nest: core `node`, wall `mound`, building `eggs`/`spire`, defence `spitspire`, spawner `hivemound`, clutter `eggs`
  - relay: core `pylon`, wall `fence`, building `pod`/`mast`, defence `turret`, spawner `droppod`, clutter `crate`
  - den: core `overhang`, wall `boulder`, building `nest`/`bones`, defence none, spawner `burrow`, clutter `bones`
  - fort (any race): a `scav`/`nest`/`relay`/`den` kit by race, with a full `wallseg` ring, `tower` at the corners and gates, and a `throne`.

- [ ] **Step 1: Write the failing layout checks in `campcheck.mjs`.** For each style in `['scav','salvage','nest','relay','den']`, each tier, and a fort per race, with 20 seeds `s` and `def = { id: `t:${style}:${tier}:${s}`, x: 0, z: 0, radius: TIERS[tier].R, race, style, tier, level: 10, seed: s }`, check that:
  - `JSON.stringify(campLayout(def)) === JSON.stringify(campLayout({ ...def, id: def.id + 'b' }))` (determinism, bypassing the memo);
  - every piece has `hypot(x, z) + (r ?? 0) <= R + 2`;
  - `posts.length >= TIERS[tier].garrison[1]`;
  - `spawners.length` is within `TIERS[tier].spawners`;
  - no post is within `piece.r + 0.6` of any piece with `r > 0`;
  - the posts are at least 1.2 m apart;
  - camps and bases have at least one gate and outposts have none;
  - `throne` is set only when `def.stronghold`;
  - with `probe = (wx) => wx > 5` ("water east of x = 5"), no post or spawner has `x > 5`, and pieces with `x > 5` are dropped.
- [ ] **Step 2: Run it and see it fail:** module not found.
- [ ] **Step 3: Implement `campLayout`.**
  - Seeded with `mulberry32(def.seed ^ 0x1a40)`. Each layer takes its own sub-stream, `mulberry32(def.seed ^ (0x1a41 + layer))`, so the layers are independent.
  - Layers in order: core, perimeter, buildings (1/3/6 by tier), defences (0 / 1 per gate / 1 per gate plus 4 corners), spawners, clutter (3/6/10), posts.
  - Perimeter:
    - outpost: 50–70% of the ring;
    - camp: the full ring less 1–2 gaps of 0.5 rad;
    - base and fort: the full ring less 2 gates of 0.45 rad, opposite each other ± 0.6.
  - Buildings: rejection sampling on radii `[0.35R, 0.8R]`, at least `r1 + r2 + 1.5` apart, with up to 40 tries each.
  - Spawners: just inside a gate for camps and bases; at the back (the opposite side to `rot = 0`) for outposts.
  - Posts: Poisson-style sampling over `r ≤ 0.85R`, kept clear of pieces. For strongholds, `throne` is at `(0, −0.6R)`, which matches today's boss slot.
- [ ] **Step 4: Run it and see it pass.** Run `node tools/campcheck.mjs`. Expected: all good.
- [ ] **Step 5: Commit:** "Camp layouts: a pure, tiered layout per faction".

### Task 3: Tiered camp placement in Gen

**Files:**
- Modify: `src/world/Gen.js` (the camp and stronghold blocks, lines 770–793; `pad`; the end of `buildRegion`)
- Modify: `src/world/story.js:134-170`
- Modify: `tools/campcheck.mjs`

**Interfaces:**
- Consumes: `TIERS`, `campLayout` (Task 2), `region.act` (Task 1).
- Produces: camp POIs `{ type: 'camp', id, x, z, radius: TIERS[tier].R, tier, race, style, level, name, seed, stronghold? }`. Ids:
  - `c:${key}:${i}` for outposts and camps, in placement order;
  - `b:${key}` for a base;
  - `s:${key}` for a stronghold, unchanged.

- [ ] **Step 1: Write the failing placement checks.** For each seed, over regions at ring ≤ 12 (not hub or city regions), check:
  - the counts match the spec's §3.1 table:
    - Act I below level 5: 2 outposts, at most 1 camp, no base;
    - Act I from level 5: 1–2 outposts, 1 camp, and a base in no more than 35% of those regions;
    - Acts II–IV: 1–2 outposts, 1–2 camps, and at most one base or stronghold. Over the sample, bases and strongholds together appear in 30–50% of these regions, and strongholds only at level 10 and up;
  - the hub region has exactly one outpost;
  - no two camps anywhere in the sample are closer than `R1 + R2 + 20` (Review Focus 1);
  - no camp is within `R + 10` of a road point (`gen.nearRoad`) or a town, city or story place (`bigNear` radii);
  - `campLayout(camp, probe)` with `probe = (x, z) => world.isWater(x, z)` leaves at least `garrison[0]` posts (Review Focus 2);
  - the fingerprint check from Task 1 still passes.
- [ ] **Step 2: Run it and see it fail** (the counts, and `tier` undefined).
- [ ] **Step 3: Implement it.**
  - **Replay the main stream.** Replace the old camp and stronghold blocks with a `legacyReserve()` that makes exactly the same `rng()` and `spot()` calls as today's code. Its `taken` entries get `legacy: true`, and `free()` ignores legacy entries when called with `{ campSpot: true }`. It doesn't push POIs or pads.
  - **Place the new camps** after the hamlet (the last main-stream feature), with `spot(R + 30, { r: R + 6, maxSlope: R > 20 ? 0.28 : 0.35, rand: campRng, campSpot: true })`.
  - **Avoid neighbours' camps** by keeping every camp well inside its own cell. Reject a spot unless all 8 points on a circle of radius `R + 24` round it pass `this.owns(rx, rz, …)`. Two camps in different cells then keep more than 20 m apart, with no need to read the neighbour's camps (reading them would mean building that region, which would recurse).
  - **Pads:** `pad(x, z, R + 2, h, R > 20 ? 16 : 11, true)`.
  - **Story camps:** forts get `tier: 'base'`, the others `tier: 'outpost'`. Ids and levels stay unchanged.
- [ ] **Step 4: Run `node tools/campcheck.mjs && node tools/placecheck.mjs`.** Expected: all good on both.
- [ ] **Step 5: Run `npm test`.** `hordecheck` and `poicheck` may now fail on the new ids and sizes; Tasks 4 and 5 fix them. The rest must be green. If only those two fail, commit with them marked in the commit message.
- [ ] **Step 6: Commit:** "Camps: tiered placement on their own stream; old draws replayed for stability".

### Task 4: Rosters by tier

**Files:**
- Modify: `src/combat/races.js:9-88`
- Modify: `tools/hordecheck.mjs` (the roster table)

**Interfaces:**
- Consumes: `TIERS`, `tierOf`.
- Produces:
  - `campUnits(def, rng)` returns `between(rng, TIERS[tierOf(def)].garrison)` units for world camps. The old `HORDE` size column becomes a bump within the range: +0 below level 5, then +10%, +20% and +30% of the range's span at levels 5, 10 and 18. Elites, champions and the strongholds' boss and honour guard are unchanged.
  - `export function campSquad(def, n, rng) → [{ type, opts }]`: `n` units off the same roster as `campUnits`, with no boss, and an elite only when `def.level >= 10 && rng() < 0.2`.

- [ ] **Step 1: Write the failing checks.** In `hordecheck`, change the roster table to report by tier, and check that every generated camp's `campUnits` length falls within its tier's `garrison` range (strongholds: range plus the boss). In `campcheck`, add the check that `campSquad(def, 5, rng)` has length 5 and contains no `opts.boss`.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement it.**
- [ ] **Step 4: Run `node tools/hordecheck.mjs && node tools/campcheck.mjs`.** Expected: green. `hordecheck`'s stronghold section may still use the old fort radius, so update its `fort.radius - 2` approach position to use `TIERS.base.R`.
- [ ] **Step 5: Commit:** "Rosters sized by camp tier; squads for reinforcement waves".

### Task 5: The camp kit (client and headless build)

**Files:**
- Create: `src/world/build/campKit.js`
- Modify: `src/world/World.js:1595-1800` (`buildCamp`, `buildFort`)
- Modify: `tools/poicheck.mjs` (the `CAMPS` list)

**Interfaces:**
- Consumes: `campLayout`, and the existing World helpers (`anchor`, `piece`, `tent`, `crate`, `stake`, `campfire`, `addCollider`, `finish`, `groundHeight`) and the `G`, `C`, `FORGE`, `HIVE`, `ARC` constants. Export the constants `campKit.js` needs from `World.js`, or move them into `world/palette.js` if they're already there.
- Produces:
  - `export const KITS = { scav, salvage, nest, relay, den }`, each `{ [kind]: (world, g, camp, piece) => void }`;
  - `export const FORT_LOOK`, the table moved from `buildFort`;
  - `export function buildCampPieces(world, camp, layout)`.
  - `World#buildCamp(camp)` builds `campLayout(camp, probe)` through the kit. Strongholds use the race's kit, with `wallseg`, `tower` and `throne` from a shared fort kit coloured by `FORT_LOOK[race]`.

- [ ] **Step 1: Write the failing build checks.**
  - In `poicheck`, set `CAMPS` to every style × tier plus `fort:<race>` for every race, and match on the key `camp:${p.stronghold ? 'fort:' + p.race : p.style + ':' + p.tier}`.
  - Every kit piece kind from Task 2's list must have a builder: in `campcheck`, check `Object.keys(KITS[style])` covers every kind `campLayout` emits for that style across 20 seeds.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement it.**
  - Move today's look of each style into its pieces: the scav mast becomes `mast`, the nest's eggs become `eggs`, and so on. The art stays the same.
  - New pieces (`scrapwall`, `gunnest`, `droppad`, `fence`, `turret`, `droppod`, `hivemound`, `burrow`, `wallseg`, `tower`, `throne`) are low-poly compositions in the same palette.
  - Every solid piece adds a collider of the layout's `r` and `h`.
  - Delete `buildFort`.
- [ ] **Step 4: Run `node tools/poicheck.mjs && node tools/buildcheck.mjs && node tools/campcheck.mjs`.** Expected: green. Check `poicheck`'s draw-call report: a base should stay under about 3× a stronghold's old draw calls. Note the numbers in the commit message.
- [ ] **Step 5: Capture the camps.** Run `tools/worldshots.js` (see its header for usage) at one camp of each style and tier and at a fort for each race. Save to the scratchpad and look at every image. Fix anything floating, clipping or unreadable.
- [ ] **Step 6: Commit:** "Camp kit: camps built from their layouts, in tiers".

### Task 6: Reinforcement waves in the sim

**Files:**
- Modify: `src/sim/WorldSim.js` (constants at lines 29–45; `Encounters.makeSlots`, `update`, `activate`, `forget`, `respawnAll`; a new `updateWaves`)
- Modify: `tools/campcheck.mjs`, `tools/hordecheck.mjs`

**Interfaces:**
- Consumes: `campLayout`, `TIERS`, `tierOf`, `campSquad`.
- Produces:
  - `Encounters#reach(def) → def.radius + 45`.
  - Camp state gains `{ target, nextWave, lullUntil, refillAt, extra: [] }`. `extra` holds wave-spawned enemies, which have no slot.
  - Sim event `{ k: 'reinforce', at: Vector3, p: [x, z], race, kind: spawner.kind, n, name }`.
  - `export const MAX_CAMP_ENEMIES = 600`.

- [ ] **Step 1: Write the failing wave checks in `campcheck.mjs`.** Use a headless `WorldSim` with stand-in players, as `hordecheck` does, on the first generated base. Use `run(seconds)` with `sim.update(dt = 0.1)`.
  1. One player at the gate: after activation, `alive === garrison`. Kill 10 and run for 25 s: at least one `reinforce` event, and alive grows back toward the garrison, never above it.
  2. Four players inside `reach`: the target is `min(round(garrison × 2.5), 60)`. Run 120 s while killing nothing: alive never exceeds the target.
  3. **Dead players** (Review Focus 3): three of the four players have `alive = false`, so the target equals 1 × garrison. With the only live player out of reach and the dead three inside it, no `reinforce` event fires over 60 s.
  4. **Clearing with a crowd** (Review Focus 4): with four live players, kill everything alive every 0.5 s for 90 s. `onCampCleared` fires at least once, and no `reinforce` event arrives within 30 s after the clear.
  5. **Quiet refill:** kill half, move every player out past `radius + 70`, run 59 s: still short. Run 2 s more, then move a player back in: on activation, alive equals the garrison.
  6. **Story boss** (Review Focus 5): on a `world/story.js` camp with `def.boss`, kill every non-boss and run 60 s. Exactly one enemy has `opts.boss` or `tag === def.boss.tag`, and squads hold no boss.
  7. **Budget:** 8 players at a base for 120 s, killing a random enemy every 0.5 s. The mean `sim.update` time is under the `hordecheck` stronghold run's mean × 2.5 (measure both in the same process), and the total alive never exceeds `MAX_CAMP_ENEMIES`.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement it.**
  - `makeSlots` takes its positions from `campLayout(def, probe).posts`; the boss goes to `throne`, or else the first post. Dungeon rooms (`def.units`) are unchanged.
  - The `scanTimer` scan uses a radius of `Math.max(...TIERS R) + 45 + 20`. `activate` and `despawn` use `reach(def)` and `def.radius + 70`.
  - For world camps (not `def.room`), drop the per-slot refill and add `updateWaves(camp, time)`:
    - The crowd counts alive players within `reach`.
    - When there is any, `alive < target`, `time >= nextWave` and `time >= lullUntil`:
      - spawn `min(squad, target − alive)` from `campSquad` at the spawner nearest the centre that is farthest from the nearest live player, scattered within 2 m;
      - each enemy aggroes the nearest live player within 30 m, or otherwise gets `e.home.set(post.x, y, post.z)` for an empty post (`EnemySim.home` is the point it wanders round and leashes back to, with a leash of 34 m);
      - set `nextWave = time + every × (0.85 + Math.random() × 0.3)`.
    - Waves fill empty slots first, so slots keep their identity; then they go into `extra`.
    - The global cap: if the sim's live enemies across camps reach `MAX_CAMP_ENEMIES`, skip this wave and set `nextWave = time + 5`.
  - **Cleared:** keep the existing `cleared` and restored callbacks, set `lullUntil = time + 30` on the clear, and don't count wave enemies in the restored callback until the lull has ended.
  - **Quiet refill:** when no player is within `reach`, set `refillAt = time + 60` once. At `refillAt`, mark every empty slot `respawnAt = 0`; the next `activate` spawns them.
  - `forget` saves `[refillAt − time]` as a one-element array, and `campFor` reads it as before. `respawnAll` still zeroes it.
  - Stronghold `WAVES` stay, and their spawns count toward the target and the cap.
- [ ] **Step 4: Run `node tools/campcheck.mjs && node tools/hordecheck.mjs`.** Expected: green. Update `hordecheck`'s "reinforcements come" check to accept `reinforce` events as well as `wave` ones.
- [ ] **Step 5: Run `npm test`.** Expected: green. `aicheck` and `eventcheck` share `Encounters`, so read any failure there before changing a test.
- [ ] **Step 6: Commit:** "Camps are held by reinforcement waves that scale with the crowd".

### Task 7: The client: reinforcement arrivals and the act banner

**Files:**
- Modify: `src/entities/EnemyLayer.js` (around line 311, beside `case 'wave'`)
- Modify: `src/main.js:997-1012` (`updateZone`)

**Interfaces:**
- Consumes: the `reinforce` event (Task 6), and `region.act` and `ACTS` (Task 1).
- Produces: no new exports.

- [ ] **Step 1: Implement `case 'reinforce'`.** Set `_p` from `ev.p`, then by `ev.kind`:
  - `droppod`: `spawnSparks` at +6 m, then `spawnRing` (3, `ARC`);
  - `hivemound`: `spawnPuff` (2.2, 0x6a3a7a) and `spawnRing` (3, `RACE_GLOW.hive`);
  - `droppad`: `spawnPuff` (dust);
  - `burrow`: `spawnPuff` (earth), plus `audio.howl` for fauna.
  - No toast: these happen every 20–30 s and a toast would spam.
- [ ] **Step 2: Implement the act banner.**
  - In `updateZone`, keep `this.act`.
  - When a region's `act > this.act` and it isn't the first update, show `hud.banner(ACTS[act−1].name, \`Levels ${lo}–${hi}\` + (stats.level < lo ? ' · You are under-levelled — turn back' : ''))`. Show it instead of the region banner for that crossing.
  - Use the warning style if `hud.banner` takes one (check `src/ui/HUD.js`). Otherwise add an optional third argument `{ warn: true }` that adds a CSS class `banner-warn` in amber to `style.css`.
  - Debounce: `this.act` only drops once the player has been in a lower act's region for 20 s, so walking along a border shows the banner once.
- [ ] **Step 3: Verify in the browser.**
  - Start `preview_start` (from `.claude/launch.json`). Use the dev panel or console to teleport to just inside Act II from Act I, at a level-3 character. Check that the amber banner shows once, and doesn't repeat after stepping back and forth across the border within 20 s.
  - Teleport to a base and kill several enemies. Check the arrival effects play and that `read_console_messages` shows no errors.
  - Take a screenshot of each.
- [ ] **Step 4: Commit:** "Client: reinforcement arrivals and the act-border banner".

### Task 8: Frontier posts and border dressing

**Files:**
- Modify: `src/world/Gen.js` (after `this.buildRoads(region)`, line 864)
- Modify: `src/world/World.js` (the POI switch at line 1269; `scatterChunk` at line 1067)
- Modify: `tools/campcheck.mjs`, `tools/poicheck.mjs`

**Interfaces:**
- Consumes: `actAt`, `region.roads`.
- Produces:
  - POI `{ type: 'frontier', id: `f:${key}:${i}`, x, z, rot, act }`, where `act` is the act ahead.
  - `World#buildFrontier(p)`.

- [ ] **Step 1: Write the failing checks.**
  - In `campcheck`: over rings ≤ 18, every road segment `[a, b]` with `actAt(b) > actAt(a)` (in either direction along the path) has a frontier POI within 25 m of the crossing, on the lower-act side (`actAt(p) < p.act`).
  - The fingerprint stays unchanged, because frontiers are excluded from it.
  - In `poicheck`, add `frontier:` to `want`.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement it.**
  - In `buildRegion`, after the roads: for each path in `region.roads`, walk its points. At the first index where `actAt` changes, place a post 10 m back along the path on the lower side, with `rot` along the road.
  - Build no pad, and draw nothing from any random stream.
  - `buildFrontier`: two posts 3.5 m either side of the road, with an arch beam, an act banner (colour by act: 1 rust, 2 `HIVE`, 3 `ARC`, 4 white-gold) and a signboard. Colliders on the posts only.
  - Border dressing: in `scatterChunk`, for scatter points with `actAt(x, z) > actAt(x − 30·dx, z − 30·dz)` for any of the 4 axis directions:
    - act 2: creep decals and resin nubs;
    - act 3: quarantine pylons, 1 per about 40 m;
    - act 4: Maker shards.
  - Use instanced or merged meshes like the existing scatter, with no colliders.
- [ ] **Step 4: Run `node tools/campcheck.mjs && node tools/poicheck.mjs`, then take browser screenshots of a frontier post and of the dressing at an Act II and an Act III border.**
- [ ] **Step 5: Commit:** "Frontier posts where roads cross into a later act, and border dressing".

### Task 9: Act borders on the map

**Files:**
- Modify: `src/ui/MapUI.js` (the cached-picture pass, beside the roads at around line 376)

**Interfaces:**
- Consumes: `gen.actAt` (reach it through whatever `MapUI` already holds for regions, e.g. `this.regionsIn` → `world.gen`).
- Produces: nothing exported.

- [ ] **Step 1: Implement it.**
  - In the cached pass, when the zoom is ≤ 1 (zoomed out), sample `actAt` on a grid of `max(12, 6 / z)` m over the known cells only (`d.isKnown`).
  - Where a sample's act differs from its east or north neighbour, stroke the shared cell edge in a dashed `rgba(255,190,90,0.85)`.
  - Label each act once, at the centroid of its known samples in view, as `ACTS[n].name`.
  - Keep it inside the cached picture so panning doesn't repaint it.
- [ ] **Step 2: Run `node --test tests/`.** Expected: `map-regression` and `map-persistence-online` stay green, since the picture is still reused while panning.
- [ ] **Step 3: Verify in the browser:** open the map near the Act I/II border, zoomed out, and take a screenshot.
- [ ] **Step 4: Commit:** "Map: act borders and labels".

### Task 10: Load check, docs and the work plan

**Files:**
- Modify: `docs/GAMEPLAY_PLAN.md` (the world and regions section, and camps)
- Modify: `docs/WORK_PLAN.md` (a new task block and a log line; leave the user's uncommitted edits in place)

- [ ] **Step 1: Run the load check.** Run `node tools/loadsim.mjs` (see its header for arguments) before this branch (`git stash` isn't needed: use `git worktree add ../pnm-base main~N`) and after it, with the same arguments. Record the mean and p95 tick of both in the WORK_PLAN notes. A p95 more than 1.5× the old one blocks the merge: lower `MAX_CAMP_ENEMIES` or the base caps, and say so.
- [ ] **Step 2: Check the frame cost in the browser.** At a base with 40 enemies, read the F3 overlay's frame time. Record it.
- [ ] **Step 3: Update the docs.**
  - `GAMEPLAY_PLAN.md`: the act lands table, the factions by act, and the camp tiers.
  - `WORK_PLAN.md`: a task block "W-1 Act lands and procedural camps" with status `review`, the acceptance list from the spec's §6, and the commits. Add a log line in the existing format.
- [ ] **Step 4: Run `npm test` on a clean checkout of the branch.** Expected: green.
- [ ] **Step 5: Commit:** "Docs: act lands and camps; load and frame numbers".
