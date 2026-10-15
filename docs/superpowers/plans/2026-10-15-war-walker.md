# Path-following and the Synth War-walker (P-1, P-2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A thing the world sim walks along the roads between waystones (P-1), and the first event built on it: a Synth war-walker crossing toward a settlement, whose weak points must be broken before it can be brought down, and which overruns the settlement if it arrives (P-2).

**Architecture:** A new `src/sim/Routes.js` builds a route from the road network (waystone to waystone, then the last leg to a site) and provides a `RouteFollower` that walks a body along it and copes with ground it can't stand on. `sim/WorldEvents.js` gains a *lead*: a body (a structure or an enemy) that an event moves each tick, with the event's centre (`ev.x`, `ev.z`) moving with it. Interest management (`near`, `wev`, stragglers, abandonment) is distance from `ev.x`/`ev.z`, so it follows the walker without changes. The `walker` event type uses this, with the walker as a rooted enemy that the event carries. Its couplings are weak-point enemies carried round it, and the walker is immune while any coupling lives. This is BossScript's immunity *pattern* (a wrapped `applyHit` and the same `rimm` / `shield` sim events the client already draws), not the BossScript class, which needs a raid encounter and arena.

**Tech Stack:** Plain ES modules, three.js `Vector3`, Node checks in `tools/*.mjs`. No new dependencies.

**Spec:** `docs/WORK_PLAN.md` tasks P-1 and P-2, which are the requirements. Context is in `docs/superpowers/specs/2026-10-15-act-iii-story-design.md`: Act III quest 3, "The Walker", calls this event through A-2's hook, and the Synths hunt the player.

## Global Constraints

- One simulation, two hosts: everything in `src/sim/`, `src/combat/` and `src/world/` runs on the server and offline alike. Never fork logic between them. These files change the server's build hash.
- Never restart the user's server on 8080. Say in the reply and the progress log that a restart is needed.
- Never run bot load tests against the user's server.
- New network fields are documented in `docs/MULTIPLAYER.md` (`wev`'s event view).
- Work in your own worktree and branch, `p-walker`, cut from `main`. The main checkout has the user's uncommitted edits in `src/anim/Animator.js`, `src/entities/Player.js`, `src/dev/DevTools.js`, `src/ui/GameMenu.js` and others. **Do not touch those files.**
- Write progress-log and task-status updates in the **main checkout's** `docs/WORK_PLAN.md` with small Edit replacements, never in the worktree's copy.
- Commit only your own files (`git commit -- <paths>`), never `git add -A`.
- Out of scope (P-4): the director choosing walkers by itself, `/admin event walker`, the dev-panel entry. Out of scope (P-6): achievements. The walker in this plan is started by `startStory` (quests) and by `startNear`, which `eventcheck` and later P-4 use.
- Match the surrounding code: comments in the files' own voice (short, plain, present tense), compact one-line object literals, `const` arrow helpers.

## Decisions taken in this plan (defaults; flag them in the review)

- **Abandoned walker** (nobody within 200 m for 45 s): the event ends `faded`, the walker turns back (dissolves), and **nothing is overrun**. A settlement event left alone is `lost` instead. The reasoning is that the walker comes from far off, and nobody should lose a town to an event they never saw.
- **Arrived walker**: `lost`. The settlement is overrun through the existing `fall()` and a Synth Retake follows.
- **Stuck walker**: `faded`, the same as abandoned.
- **Routes avoid cities and the hub.** No link may pass through a waystone inside a city or Brightwater, unless that city is the target.

## Review Focus

1. **A walker called at a settlement that's overrun, or already has an event.** `startStory` returns null for an overrun site, and the running event for a busy one. Pinned in Task 3.
2. **A route that would pass through New Meridian or the hub.** It must never do that. Pinned in Task 1: no route point lies within `CITY_WALL + 10` of a city or the hub that isn't the target.
3. **The walker killed on the same tick it arrives.** A dead walker wins: the death check runs before the arrival check. Pinned in Task 3.
4. **Everyone goes down or leaves while the walker is still immune.** The event is abandoned and ends `faded` with no overrun, rather than hanging. Pinned in Task 3.
5. **Players arriving mid-walk.** The hull and coupling count re-scale up as in other events, but never down. Pinned in Task 3: two players join after activation and the walker's max health rises by the same ratio as the pylons' rule.

---

### Task 1: Road routes (P-1)

**Files:**
- Create: `src/sim/Routes.js`
- Test: `tools/eventcheck.mjs` (a new section, `// ---- routes (P-1)`, placed before `// ---- the director`)

**Interfaces:**
- Produces:
  - `roadRoute(gen, site, { min = 300, max = 480, hops = 3 } = {}) → { points: [[x, z], ...], length, regions: number } | null`. `site` is a POI `{ x, z, r }`. `regions` is how many distinct regions the route crosses.
  - `class RouteFollower { constructor(points, { speed, canStand = () => true, skip = 30 }) ; step(dt) → 'moving' | 'arrived' | 'stuck' ; x ; z ; heading ; left ; skipped ; status }`
    - `heading` is in radians, `atan2(dx, dz)` as the rest of the sim uses.
    - `left` is the metres still to go.
    - `skipped` counts the times it jumped unstandable ground.

- [ ] **Step 1: Write the failing checks** in `tools/eventcheck.mjs`, using its `check()` helper:

```js
// ---------------------------------------------------------------- routes (P-1)
// A route from the roads between waystones, toward a settlement two or more regions off.
const routeSite = all.find(({ p, region }) => ['hamlet', 'settlement', 'town'].includes(p.type) && region.level >= 6 && roadRoute(world.gen, p));
const route = routeSite && roadRoute(world.gen, routeSite.p);
check(!!route, 'a road route to a settlement');
check(route.length >= 300 && route.length <= 480, `its length is in band (${Math.round(route.length)} m)`);
check(route.regions >= 2, `it crosses regions (${route.regions})`);
const [lx, lz] = route.points.at(-1);
check(Math.hypot(lx - routeSite.p.x, lz - routeSite.p.z) <= routeSite.p.r + 6, 'it ends at the settlement');
const towns = world.gen.cities();
check(route.points.every(([x, z]) => towns.every((c) => Math.hypot(c.x - routeSite.p.x, c.z - routeSite.p.z) < 1 || Math.hypot(c.x - x, c.z - z) > CITY_WALL + 10) && Math.hypot(x, z) > 60), 'it keeps out of the cities and the hub');
// Walked at 1.5 m/s it arrives in length / speed.
const walk = (pts, canStand) => { const f = new RouteFollower(pts, { speed: 1.5, canStand }); let t = 0; while (f.step(0.05) === 'moving' && t < 2000) t += 0.05; return { f, t }; };
const w1 = walk(route.points);
check(w1.f.status === 'arrived' && Math.abs(w1.t - route.length / 1.5) < 1, `a follower arrives on time (${mins(w1.t)})`);
// A 12 m stretch it can't stand on is jumped; a 40 m one leaves it stuck where it began.
const line = Array.from({ length: 81 }, (_, i) => [i * 2.5, 0]);
const gap = (a, b) => (x) => x < a || x > b;
const w2 = walk(line, (x) => gap(100, 112)(x));
check(w2.f.status === 'arrived' && w2.f.skipped === 1, 'a short gap is jumped');
const w3 = walk(line, (x) => gap(100, 140)(x));
check(w3.f.status === 'stuck' && w3.f.x < 100, 'a long gap leaves it stuck, before the gap');
```

Add the imports `import { roadRoute, RouteFollower } from '../src/sim/Routes.js';` and `import { CITY_WALL } from '../src/world/places.js';`. Check that `world.gen.cities()` returns `{ x, z, rx, rz }`, as `Gen.waystoneSpot` uses it.

- [ ] **Step 2: Run it and confirm it fails**

Run: `node tools/eventcheck.mjs`
Expected: it fails at import with `Cannot find module '../src/sim/Routes.js'`.

- [ ] **Step 3: Implement `src/sim/Routes.js`**

Start the file with a header comment in the style of `sim/WorldEvents.js`. Use these pieces:

- `link(gen, a, b)`: the road points from region `a`'s waystone to neighbouring region `b`'s (a and b are `[rx, rz]`), or `null`.
  - If b is east or north of a, take the road in `gen.region(...a).roads` whose last point is within 8 m of `gen.peekWaystone(...b)`.
  - If b is west or south, take that road from `gen.region(...b).roads` toward a, reversed.
  - A road that broke at water or mountain (`Gen.roadPath` stops early) doesn't reach, so it's `null`.
- `lastLeg(gen, region, site)`:
  - the road in `region.roads` whose last point is within `site.r + 12` of the site (a hamlet's spur);
  - else a straight line from the waystone, sampled every 2.5 m;
  - cut where it comes within `site.r * 0.5` of the site's centre.
- `roadRoute`:
  - Search outward from the site's region (`gen.cellOf(site.x, site.z)`) breadth-first over the four neighbours, in the fixed order E, N, W, S, so the route is deterministic per seed, up to `hops` links.
  - Skip any region whose waystone stands within `CITY_WALL + 10` of a city or within 60 m of the origin (the hub), unless it is the site's own region.
  - For each reached start region in BFS order, build `points` as the links from the start back to the site's region, then `lastLeg`. Return the first whose length is between `min` and `max`.
  - Return `null` when none fits.
  - `regions` is the count of distinct `gen.regionAt(x, z).key` along the points.
- `RouteFollower`:
  - It keeps the distance travelled `d` along the polyline, with cumulative segment lengths computed once.
  - `step(dt)`: advance `d += speed * dt`.
    - If `canStand` is false at the new spot, look ahead in 2.5 m steps up to `skip` metres for standable ground. If found, jump there and add one to `skipped`. If not, stay at the last standable spot and set `status = 'stuck'`.
    - At the end, `status = 'arrived'`.
    - Then update `x`, `z`, `heading` and `left`.
    - Once `status` isn't `'moving'`, `step` does nothing.

- [ ] **Step 4: Run it and confirm it passes**

Run: `node tools/eventcheck.mjs`
Expected: the six route lines are ✓ and the rest of eventcheck is unchanged and green. If no settlement on seed 12345 has a route in band, widen the search to rings 0–6, which is what `all` already covers. Don't loosen the 300–480 m band.

- [ ] **Step 5: Commit**

```bash
git add src/sim/Routes.js tools/eventcheck.mjs
git commit -m "P-1: road routes between waystones, and a follower that walks them" -- src/sim/Routes.js tools/eventcheck.mjs
```

---

### Task 2: An event's moving lead (P-1)

**Files:**
- Modify: `src/sim/WorldEvents.js`: the class gets `lead(ev, body, follower)` and `moveLead(ev, dt)`, and `updateEvent` calls `moveLead`.
- Test: `tools/eventcheck.mjs`, in the routes section.

**Interfaces:**
- Consumes: `RouteFollower` (Task 1).
- Produces:
  - `WorldEvents.lead(ev, body, follower)` sets `ev.lead = { body, follower }`. `body` is a structure (`{ x, z, position }`) or an `EnemySim`.
  - `WorldEvents.moveLead(ev, dt) → 'moving' | 'arrived' | 'stuck' | null`. It steps the follower and places the body there, on the ground, facing along the route.
    - For an enemy body it also sets `home` to the same point and zeroes `velocity`, so its own AI never walks it back.
    - It sets `ev.x` and `ev.z` to the body's spot.
    - It returns `null` when the event has no lead.

- [ ] **Step 1: Write the failing check.** A structure led along `route`, with a stand-in player kept 60 m behind it, is in `dir.near()` at every 10-second sample, and the region under `ev.x`/`ev.z` changes at least once:

```js
reset();
const convoy = dir.start({ poi: routeSite.p, type: 'retake', level: 6, race: 'synth' }); // any event will do as a carrier
const crate = dir.structure(convoy, `${convoy.id}:c`, 'pylon', { x: route.points[0][0], z: route.points[0][1] }, 50);
convoy.structures.push(crate);
dir.lead(convoy, crate, new RouteFollower(route.points, { speed: 6, canStand: (x, z) => world.standable(x, z) }));
const rider = player('rider');
sim.players = [rider];
let told = true;
const seenRegions = new Set();
for (let t = 0; t < route.length / 6; t += 10) {
  const back = Math.max(0, (t * 6) - 60);
  const f = new RouteFollower(route.points, { speed: 1 }); f.step(back); // where 60 m behind is
  put(rider, f.x, f.z);
  step(10);
  told &&= dir.near(rider.position.x, rider.position.z).includes(convoy);
  seenRegions.add(world.regionAt(convoy.x, convoy.z).key);
}
check(told, 'a led structure is reported to someone following it, all the way');
check(seenRegions.size >= 2, `it carries the event across regions (${seenRegions.size})`);
check(Math.hypot(crate.x - convoy.x, crate.z - convoy.z) < 0.01 && crate.position.y === world.groundHeight(crate.x, crate.z), 'the structure and the event move together, on the ground');
```

(The retake carrier is only a vehicle for the test: its garrison is removed with `reset()` afterwards. If a garrison kill would end it early, set `convoy.foes = []` first.)

- [ ] **Step 2: Run it and confirm it fails**

Run: `node tools/eventcheck.mjs`
Expected: `TypeError: dir.lead is not a function`.

- [ ] **Step 3: Implement `lead` and `moveLead`** in `WorldEvents`, and call `this.moveLead(ev, dt)` in `updateEvent` before `stragglers`, so participants and stragglers are judged at the new spot. Structures carry `x` and `z` as well as `position`, so update all three. The return value is used by Task 3; this task ignores it.

- [ ] **Step 4: Run it and confirm it passes**

Run: `node tools/eventcheck.mjs`
Expected: the three new lines are ✓ and everything else is green.

- [ ] **Step 5: Commit**

```bash
git commit -m "P-1: an event can lead a body along a route; its area moves with it" -- src/sim/WorldEvents.js tools/eventcheck.mjs
```

---

### Task 3: The war-walker event (P-2, sim)

**Files:**
- Modify: `src/combat/bestiary.js`: two entries after `siegeengine`.
- Modify: `src/sim/WorldEvents.js`: `EVENT_TYPES.walker`, its start and activation, `updateWalker`, immunity, view fields, and the abandonment rule.
- Test: `tools/eventcheck.mjs`: a new section, `// ---- the war-walker (P-2)`, after the existing "each kind, won" section.

**Interfaces:**
- Consumes: `roadRoute`, `RouteFollower` (Task 1); `lead`, `moveLead` (Task 2).
- Produces:
  - `EVENT_TYPES.walker`:
    ```js
    walker: {
      name: 'Synth War-walker', race: 'synth', settlement: true, walker: true, speed: 1.5, couplings: 3, wave: 4, gap: 24,
      gather: 'A Synth war-walker is marching on {place}. Gather at the beacon.', start: 'Break the war-walker\'s couplings, then bring it down before it reaches {place}',
      won: 'The war-walker falls', lost: '{place} is overrun', faded: 'The war-walker turns back',
    },
    ```
  - On the event: `ev.route` (from `roadRoute`, set in `start`), `ev.walker` (the `EnemySim`), `ev.couplings` (`EnemySim[]`, also in `ev.foes`).
  - `view(ev)` adds `wk: [x, z, hp, max, couplingsLeft, couplingsTotal, metresLeft]`, with x and z rounded to 0.1 and the rest as integers, and the existing `s` list empty.
  - Bestiary `warwalker` and `walkercoupling`. Both are synth, both are rooted (`speed: 0`, `mass: 60`, `poise: 99999`), and both use `rig: 'hover'`:
    - `warwalker`: model `synth:warwalker`, behavior `lobber`, `hover: 0`, `radius: 2.6`, `height: 9`, `hp: 2400`, `xp: 400`, `gold: [60, 100]`, `dropChance: 1`, `lure: 60`. Attacks: `stomp` (range 7, radius 7, damage 60, knockback 18, cooldown 5), `barrage` (lob, range 40, min 8, count 3, damage 44, radius 3.4, fuse 0.8, element shock, cooldown 6), `fan` (energy, range 26, count 7, fan 1.0, damage 20, cooldown 4).
    - `walkercoupling`: name "Power Coupling", model `synth:coupling`, behavior `support`, `hover: 4.5`, `radius: 0.7`, `height: 1.2`, `hp: 320`, `xp: 30`, `gold: [4, 8]`, `dropChance: 0.2`. One attack: `arc` (nova, range 5, radius 5, damage 24, knockback 8, element shock, cooldown 6).

- [ ] **Step 1: Write the failing checks.** Use the existing `put`, `step`, `hit`, `reset`, `player` and `character` helpers. Sites come from `routeSite` (Task 1).

```js
// ---------------------------------------------------------------- the war-walker (P-2)
reset();
const wsite = routeSite;
const walkerAt = () => dir.startStory(wsite.p.id, 'walker');
const one = player('w1');
sim.players = [one];
put(one, wsite.p.x, wsite.p.z);
let wev = walkerAt();
check(wev?.type === 'walker' && wev.route?.points.length > 10, 'a quest can call a war-walker at a settlement, with a road route');
check(walkerAt() === wev, 'calling it again finds the one already coming');
step(GATHER + 1);
const W = wev.walker;
check(W && Math.hypot(W.position.x - wev.route.points[0][0], W.position.z - wev.route.points[0][1]) < 3, 'it sets out from the route\'s start');
check(wev.couplings.length === 3 && wev.couplings.every((c) => c.alive), 'three couplings for one player');
const hp0 = W.hp;
hit(one, W, 500);
check(W.hp === hp0 && said.some((e) => e.k === 'rimm' && e.id === W.id), 'immune while a coupling lives');
```

Then these scenarios, each after `reset()` and a fresh `walkerAt()` plus `step(GATHER + 1)`:

- **Won:** a hunter rides along at the walker (`put(one, W.position.x + 4, W.position.z)` each second), breaks every coupling (`hit` for `maxHp`), then the walker. Expect `res === 'won'`, an `evstep` with text containing `shield is down` after the last coupling, no entry in `dir.overrun`, every one of `wev.enemies` dead or dissolved, and `wev.result.people` including `w1`. Log the time taken.
- **Lost:** the player follows 30 m behind and never attacks, stepping until the walker arrives (bounded by `route.length / 1.5 + 30` seconds). Expect `res === 'lost'`, `dir.overrun.has(wsite.p.id)`, and a running `retake` event at the site with race `synth`.
- **Abandoned:** the player moves 400 m away. Expect `res === 'faded'` within `45 + 5` seconds, no overrun, and the walker gone.
- **Stuck:** after 20 s, set `wev.lead.follower.canStand = () => false`. Expect `res === 'faded'` within 2 s, no overrun, and the walker gone.
- **Dies on arrival:** advance the follower to within one step of the end (`wev.lead.follower.step(...)`), break every coupling, then kill the walker in the same tick it would arrive. Expect `res === 'won'`.
- **Scaling:** four players at the beacon through gathering. Expect `wev.couplings.length === 4` and `W.maxHp` equal to the one-player hull × 1.9 (±1).
- **Joining:** start with one player, then add two more within 30 m after activation. Expect `W.maxHp` to grow by the ratio `(1 + 0.3·2) / 1` (±1).
- **Overrun:** `dir.fall(...)` the site (or `overrun.set` it), then expect `walkerAt()` to be `null`.
- **Server view:** in the existing `// ---- the server's side` section, start a walker near one of its stand-in sessions and step 2 s twice. Each `wev` the session gets has `wk`, and `wk[0]`/`wk[1]` change between the two.

- [ ] **Step 2: Run them and confirm they fail**

Run: `node tools/eventcheck.mjs`
Expected: `wev` is null (`startStory` refuses the unknown type), so the first walker line is ✗.

- [ ] **Step 3: Add the bestiary entries.** Use the values from Interfaces, in the style of the `siegeengine` entry. Give the section comment a line for each.

- [ ] **Step 4: Implement the walker in `WorldEvents`**
  - `start`: for `T.walker`, compute `ev.route = roadRoute(this.world.gen, poi)` first. If it's `null`, don't create the event; return `null`. Do this before `this.events.set`, so nothing leaks.
  - `activate`:
    - Spawn `ev.walker` at the route's first point with `spawn(ev, { type: 'warwalker', opts: { elite: true } }, x, z, { aggro: false, transient: false, objective: true, name: 'Synth War-walker' })`.
    - Scale its `maxHp`, `baseMaxHp` and `hp` by `1 + 0.3 * (ev.n - 1)`.
    - Call `this.lead(ev, ev.walker, new RouteFollower(ev.route.points, { speed: T.speed, canStand: (x, z) => this.world.standable(x, z) && !this.world.isWater(x, z) }))`.
    - Spawn `T.couplings + extra` `walkercoupling`s in a ring of radius 2.4 round it (`aggro: false, transient: false, objective: true`) into `ev.couplings`.
    - Wrap the walker's `applyHit`: while any coupling is alive, return `false`, add half the damage to threat, and emit `{ k: 'rimm', id, at }` at most every 0.6 s, as in `BossScript.wrap`.
  - `updateWalker(ev, time)`, added to the `switch` in `updateEvent`:
    1. If the walker isn't alive, `finish(ev, true)`.
    2. Move each live coupling to its ring spot round the walker, turned with the walker's facing.
    3. When the last coupling falls, emit once: `evstep` 'The war-walker\'s shield is down — bring it down!' and `{ k: 'shield', id: walker.id, at }`.
    4. Act on the result of `moveLead`:
       - `'arrived'`: dissolve the walker, its couplings and escorts, then `finish(ev, false, 'lost')`.
       - `'stuck'`: dissolve them, then `finish(ev, false, 'faded')`.
    5. Every `T.gap` s, if `aliveAll(ev) < MAX_FOES`, spawn an escort wave behind the walker using `wave(ev, false)`. Add a `T.walker` branch to `wave`'s origin choice: 8 m behind the walker along the route, spread 0.25. Mark them `e.wave = true`.
  - Since `moveLead` runs in `updateEvent` before the switch, read its return value there and pass it to `updateWalker(ev, time, moved)`. The walker's death is checked first (step 1), so a kill on the arrival tick wins.
  - **Joining:** in the existing `n > ev.n` branch, also scale `ev.walker`'s `maxHp` and `hp` by the same `k`.
  - **Abandonment:** in `updateEvent`'s abandon rule, use `'faded'` when `ev.T.walker`.
  - **`view`:** add `wk` as specified. Leave `f` and `w` unset for the walker.

- [ ] **Step 5: Run it and confirm it passes**

Run: `node tools/eventcheck.mjs`
Expected: every walker line is ✓ and all earlier sections stay green. Note the logged won-run time. The target is 3–5 minutes for one capable player. If it's outside that, tune `warwalker.hp` or `T.speed`, not the tests.

- [ ] **Step 6: Commit**

```bash
git commit -m "P-2: the Synth war-walker event — a walker on the roads, its couplings, the overrun if it arrives" -- src/combat/bestiary.js src/sim/WorldEvents.js tools/eventcheck.mjs
```

---

### Task 4: The walker on screen (P-2, client)

**Files:**
- Modify: `src/models/EventFoes.js`: `synth:warwalker` and `synth:coupling`.
- Modify: `src/rpg/codex.js`: entries `warwalker` and `walkercoupling` under `// ---- public events`.
- Modify: `src/ui/EventUI.js`: walker rows in `render()`, and its marker in `markers()`.
- Test: `tools/enemyshots.js` captures, and the codex check if `progresscheck` covers codex keys (run it).

**Interfaces:**
- Consumes: the `wk` view field (Task 3), and the bestiary `model` keys.

- [ ] **Step 1: Models.** Use the file's existing helpers (`piece`, `G`, `hoverSkeleton`, `finish`) and Synth colours (import them from `./Synths.js` as `SCAV` is imported from Scavs).
  - `synth:warwalker`: a hull about 9 m tall on four jointed legs, with a sensor head and a glow, and a muzzle at the front.
  - `synth:coupling`: a ringed node about 1.2 m across with a bright core, so a player spots it from 30 m.
  - Animate the walker's legs from the hover rig's own update if it offers one (check `anim/LegAnimator.js` `HoverAnimator`). **Don't edit `src/anim/Animator.js`**, which has the user's uncommitted work. If the legs can't move without that file, leave them static and add a backlog line to the main checkout's WORK_PLAN.
  - Update the header comment's list (`hive:sporepod · scav:siege · synth:warwalker · synth:coupling`).
- [ ] **Step 2: Codex.** Write two entries in the voice of the `sporepod` and `siegeengine` entries, with `lore`, `strengths` and `weaknesses`. Lore follows the Act III bible: the walker is an old guardian of the Maker network marching on the places whose waystones answer the player. The weakness says it can't be hurt until its couplings are broken.
- [ ] **Step 3: EventUI.** When `v.k === 'walker'` and it's active, show these rows:
  - `Couplings: a of b left` (class `done` at 0);
  - `Hull` as an `ev-hp` bar from `wk[2]/wk[3]`, with the class `shielded` while couplings remain;
  - `{wk[6]} m from {place}`.
  - The marker (`markers()`) sits at the walker (`wk[0]`, `wk[1]`), not at `v.x`/`v.z`, where the two differ. Reuse the existing marker kinds. No new CSS beyond `.ev-hp.shielded` (a dimmed bar) in `style.css`.
- [ ] **Step 4: Run the checks**

Run: `npm test`
Expected: all green. That includes `eventcheck` from Tasks 1–3 and `progresscheck`'s codex coverage, if it checks bestiary keys against codex entries.

- [ ] **Step 5: Captures and an F3 check.** Capture both models with `tools/enemyshots.js` (add the two types to its list if it keeps one). Then start a walker offline: there's no dev-panel entry until P-4, so use the browser console with `game.sim.director.startNear(x, z, 'walker')`, where `startNear` accepts the type through `EVENT_TYPES`. Check the HUD rows and the F3 frame time while it walks. Save the captures where the existing ones go.
- [ ] **Step 6: Commit**

```bash
git commit -m "P-2: the war-walker and its couplings on screen — models, codex, the event tracker" -- src/models/EventFoes.js src/rpg/codex.js src/ui/EventUI.js style.css tools/enemyshots.js
```

---

### Task 5: Docs and close-out (P-1, P-2)

**Files:**
- Modify: `docs/MULTIPLAYER.md` (`wev`'s view: `wk`), `README.md` (the events section: the war-walker), `docs/GAMEPLAY_PLAN.md` (§8 status: 6b's walker built, the stampede not yet), and, in the **main checkout**, `docs/WORK_PLAN.md`.

- [ ] **Step 1:** Document `wk: [x, z, hp, max, couplingsLeft, couplingsTotal, metresLeft]` in MULTIPLAYER.md next to the other view fields, and add a known-limits line: a walker, like other events, isn't saved.
- [ ] **Step 2:** In README and GAMEPLAY_PLAN §8, describe the walker in the style of the 6a table rows: where, objectives, when it's lost. List this plan's defaults (abandoned or stuck is `faded`, routes avoid the cities) as *(default)* items.
- [ ] **Step 3:** Run `npm test`. Expected: green.
- [ ] **Step 4:** In the main checkout's WORK_PLAN, set P-1 and P-2 to `review`, add notes with the commits, add a progress-log line ending "restart the server on 8080", and change the Engine/Story lane row only if you own it.
- [ ] **Step 5: Commit** the docs in the branch (not WORK_PLAN), then tell the user that the server needs a restart, and that the director doesn't start walkers by itself until P-4.

```bash
git commit -m "P-1, P-2: docs for the war-walker and the moving event" -- docs/MULTIPLAYER.md README.md docs/GAMEPLAY_PLAN.md
```
