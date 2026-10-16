# Graphics plan

A plan for raising the game's graphical fidelity without losing its look: a cel-shaded, inked,
slightly comic world built from simple shapes. Four areas, in the order they depend on each other:

1. **Surfaces**: procedural texturing and better cel shading. Everything else is drawn with them.
2. **A modular, procedural building kit** for settlements, enemy camps and bases, story sites,
   landmarks and dungeons, as fits each.
3. **Special effects**: hits, explosions, magic, weapons, ambience.
4. **Performance and polish**, throughout and at the end.

Each phase ends the way the gameplay phases do: Node checks, `npm test`, in-game captures (before and
after), README and plan updates, and a short report. Draw calls, triangles and frame time are
measured before and after each phase, at every quality setting.

---

## Where things stand

- **Materials:** `MeshToonMaterial` with a three-band ramp (`render/Toon.js`). Shadows are hatched
  in screen space. Glowing parts are unlit and lifted past white for bloom.
- **Ink:**
  - inverted-hull outlines at Low quality;
  - screen-space silhouettes from depth at Medium and High (`render/PostFX.js`), with a light AO
    pass at High.
- **Models:** built from primitive "pieces" (`render/ModelKit.js`) with one flat colour each, then
  baked by colour into a few meshes per place. There are no textures anywhere except the soft
  sprites in `fx/Effects.js`.
- **Buildings:** each builder makes its own. Towns use one `building()` box-with-roof in
  `world/Towns.js`; villages, hamlets, camps, forts, landmarks and story sites each have bespoke
  code (`world/Landmarks.js`, `world/World.js`, `world/StorySites.js`); dungeons have their own kit
  (`world/InteriorKit.js`).
- **Effects:** GPU particle pools now carry sword sweeps, flame tongues, explosion smoke, sparks,
  debris and biome ambience; additive glow accents, rings, telegraphs and damage numbers remain in
  `fx/Effects.js`. Surface impacts route through the hit material kind.

---

## G1: Surfaces (procedural texturing, cel shading v2)

### G1.1 Procedural texturing
- **Surface kinds** drawn in the shader, with no image textures:
  - plaster, adobe, brick, stone blocks, cobbles, rock;
  - planks, beams, thatch, roof tiles, shingles;
  - metal panels, corrugated sheet, rust, concrete;
  - fabric, resin and chitin, crystal.
- **Drawn in the comic style:** crisp darker seam lines, a slight tint per board, brick or block,
  and a little grain or mottling, rather than realistic textures.
- **Coordinates from the pieces:** when a model is baked, every vertex gets surface coordinates in
  metres, aligned to its own piece's faces (a box's walls get height and width, its top length and
  breadth). It also gets a surface kind. Patterns therefore follow each wall, plank and tile
  whichever way it's turned, at a true scale, even after a whole town is merged into one mesh.
- **Opt-in per piece** (`piece(..., { pattern: 'brick' })`), with defaults from the palette (wood
  is planks, stone is blocks, metal is panels…), so every existing builder gains detail at once.
- **Anti-aliased:** pattern lines fade to their average as they shrink below a pixel, so distant
  walls don't shimmer. Low quality draws flat colours as now.
- **Terrain:** grass, dirt, sand and rock detail drawn in the ground's own material by biome and
  slope, plus worn paths along roads.

### G1.2 Cel shading v2
- **A four-band ramp** with slightly softened, anti-aliased band edges (still clearly banded).
- **Coloured shadows:** the shadow bands lean cool and violet instead of only going darker, as in
  painted cel art. Lit sides keep the light's warmth.
- **A rim light** on silhouettes facing the light, thin and bright, so characters and enemies read
  against busy backgrounds.
- **Toon highlights** (one hard-edged spot) on metal and glass surfaces.
- **Ink:**
  - interior crease lines where surfaces meet, lighter than silhouettes;
  - line weight that varies a little with depth and how lit the surface is;
  - kept off terrain's own triangle creases.
- **Hatching** stays in shadow, made smoother at a distance.

---

## G2: The building kit

A modular, procedural generator in `src/world/build/` that every builder can use.

- **Plans:**
  - a building is a seeded plan: a footprint (rectangle, L, T or U, or a court), storeys, a roof
    form, which side the door is on, a window rhythm, and extras;
  - **modules** turn the plan into pieces: plinth or foundation, wall bays (plain, window, door,
    arch, shutters), corner posts, floor bands, eaves;
  - **roofs:** gable, hip, shed, flat with a parapet, dome, cone, sawtooth;
  - **extras:** dormers, chimneys, balconies, outside stairs, awnings, signs, crenellations,
    antennas, pipes.
- **Styles** decide materials, proportions and details:
  - settler timber, plaster and tile, desert adobe, cold steel prefab;
  - Warden military, city stone;
  - Scav junk (welded scrap, corrugated sheet, tarps);
  - Hive organic (resin swells and ribs), Synth tech (white panels, light strips);
  - Maker ancient (carved stone, runes).
- **Colliders** are rotated boxes from the plan, so the server's world, which builds the same plans,
  collides with exactly what's drawn. Doors, steps and porches keep a way in clear.
- **Deterministic** from each place's seed; the same on every screen and the server.
- **Cheap:** baked by colour like today; modules repeated many times can be instanced; a check keeps
  each place inside a triangle and draw-call budget.

### Where it goes
- **Settlements:** town and city houses, shops and service buildings (inn, workshop, Warden post,
  citadel), Brightwater, villages and hamlets, city walls and gates. This replaces `building()`.
- **Enemy camps and bases:** Scav shacks, watchtowers and forts; Hive mounds and spires; Synth
  relays and pylons; strongholds.
- **Story sites and landmarks** where they're buildings: Warden posts and outposts, ruins, the
  arcology, the array. Natural or one-off landmarks (the titan, the elder tree, the wreck) stay
  bespoke but get the new surfaces.
- **Dungeons:** interior walls and rooms use the kit's modules and the theme styles above.

---

## G3: Special effects

- **A GPU particle system:** instanced quads moved in the shader, one draw per effect type,
  thousands of particles at little cost, sorted soft additive or opaque toon.
- **Hits by what's hit:**
  - sparks on metal, chips and dust on stone, splinters on wood, goo on the Hive, shards on
    crystal (the surface kinds from G1 tell what was hit);
  - impact frames (a one-frame flash) on heavy hits and crits;
  - directional spark sprays.
- **Explosions:** a flash, a shockwave ring with a slight screen distortion, flying debris, a rising
  toon smoke column, and a scorch decal that fades.
- **Magic and elements:**
  - ribbon trails on spells; slashes use short GPU particle streak sweeps;
  - fire embers and heat shimmer, frost shards and mist;
  - shock arcs that branch, corrosive drips and bubbling pools.
- **Weapons:** tracers, layered muzzle flashes per maker, shell casings that bounce, charge-up glows.
- **Ambience:**
  - dust motes in light, fireflies at night, embers over fires;
  - falling leaves in forests, snow and rain by biome;
  - waterfall and fountain spray, chimney smoke, hive spores.
- **Telegraphs:** clearer ground warnings for enemy and boss attacks, readable at a glance.

---

## G4: Performance and polish

- **Budgets per quality** (draw calls, triangles, particles), measured by a dev-panel readout and a
  Node check.
- **Level of detail for buildings:** a far-off simple version and a near version with details.
  Instancing for repeated modules and props.
- **A capture tour** (`tools/worldshots.js`) over a fixed route for before-and-after comparisons.

---

## Order and checks

| Phase | Builds on | Checks |
|---|---|---|
| G1 Surfaces | — | Patterns follow each piece's faces at true scale whatever its turn; Low quality unchanged; no measurable frame-time cost at Medium; captures of a town, a camp, a dungeon and a character, before and after |
| G2 Building kit | G1 | Plans deterministic (server and client agree); colliders match the drawn walls; nobody stands inside a wall (`poicheck`); doors reachable; budgets per place; captures of every style |
| G3 Effects | G1 surface kinds | Particle budget held under a 30-enemy fight; effects cleaned up; captures of every element and surface |
| G4 Polish | all | Frame time and draw calls at each quality before and after the whole plan |

## Status

- **G1 Surfaces:** done.
  - *Procedural texturing* (`render/Surfaces.js`): seventeen surface kinds drawn in the shader. A
    world bake (`ModelKit.bake(group, { surfaces })`, which `World.finish`, story sites and
    dungeons use) gives each piece coordinates in metres projected per triangle along its own faces,
    offset by where it stands in its own turned frame (so a wall, its gable and a whole flattened
    building run on), with grain along long pieces (posts, beams). Kinds come from the piece
    (`piece(..., { pattern })`), a bake's colour table (dungeon themes) or the palette (wood →
    planks, stone → blocks, metal → panels, thatch, canvas, sandstone, resin…). Town houses name
    their walls (plaster, adobe, planks, panels) and roofs (tiles, slate shingles, thatch,
    corrugated). Characters and weapons stay plain. Lines anti-alias with `fwidth` and everything
    settles to its average as a cell nears a pixel (with an early out past that, so far walls cost
    nothing).
  - *Terrain*: two-tone painted patches everywhere (warmer and yellower on grass), pebbles on sand
    and dirt, cracks across steep rock; world-space, fading with distance.
  - *Cel shading v2* (`render/Toon.js`): four bands (N·L edges at −0.4, 0.05, 0.4) drawn in the
    shader with edges softened on curved surfaces (flat faces stay crisp); cool, violet-leaning
    shadows; hatching kept to the shadow band; a sunward rim light on skinned models (characters
    and enemies) only — on flat faces seen edge-on it would flood them.
  - *Quality*: surfaces and ground detail are off at Low (`QUALITY.low.surfaces`); the bands, cool
    shadows and rim are at every quality.
  - *Checks*: `tools/surfacecheck.mjs` (in `npm test`): coordinates follow turned and scaled
    pieces at true scale, run on between pieces turned alike, grain along posts; mixed patterned
    and plain pieces of one colour merge; every place, camp, landmark, story site and dungeon bakes
    with surfaces on (40–90% of a settlement's triangles patterned). Build cost on a screen is
    within noise. Frame time over a building-heavy view at 2560×1440 (Medium): within noise of
    surfaces off (15.1 vs 15.5 ms, medians of six runs).
  - *Not yet*: toon highlights on metal and glass, crease ink, line weight by depth — moved to G4
    polish. Brick, cobbles and corrugated are ready for the building kit (G2) to use.
- **G2 Building kit:** implemented for the main town, city, hamlet, Scav hut, and landmark house
  builders. `src/world/build/kit.js` makes seeded plans with rectangular, L, T, U and court
  footprints; seven roof forms; wall modules and style details; and rotated footprint colliders.
  Styles cover settler, city, desert, cold, Warden, Scav, Hive, Synth and Maker construction.
  Far POIs use the same footprint and roof form with simplified walls and no small modules; they
  rebuild with full details as the player approaches, with hysteresis to avoid threshold churn.
  `tools/buildcheck.mjs` now runs as part of `npm test` and checks deterministic plans, roof and
  footprint combinations, nonempty geometry, reachable doors and collider placement. Existing
  bespoke camp/fort, story-site and dungeon builders have not all been migrated to the kit; they
  retain their bespoke geometry and use G1 surface baking where applicable. Style captures and
  before/after performance measurements remain outstanding.
  - *The wilds* (`src/world/scenery/`): scattered scenery follows the same pattern. `kit.js`
    assembles a seeded `Model` from components (tapered limbs with root flare, roughened lumps,
    jagged needle tiers, leaf and frond blades, lathes) into one geometry with its colours in its
    vertices (gradients, colour on up-facing faces, hollow shading, strata) and `bark`/`rock`
    surfaces, plus the pieces it collides with. `models.js` holds the base models (conifer,
    broadleaf, snag, palm, mushroom, saguaro, rock, hoodoo, crystal, bush, fern, reeds, grass,
    flowers), their biome styles (snow and moss on rocks and firs, willows, blossom, charred and
    bleached snags, crystal-grown rocks) and two to four variants each, picked by position so the
    scatter's own random numbers are untouched. Trees and similar kinds have a far model (the same
    plan, small pieces dropped, coarser shapes) drawn past the ground-detail ring. Instanced sets
    are made on first use and grow as needed; each instance gets a slight tint. Trees collide with
    their trunks only, rocks whole, and the server builds the same collision triangles
    (`physicscheck` scenery parity). Measured over six biomes at rest, frame time is within noise
    of the old primitives at a similar triangle count; draw calls rise by up to ~180 where many
    biomes' sets are in view. `tools/worldshots.js` `scenery()` and `measure()` capture and time it.
  - *Props* follow it too, as bakeable pieces made of the scenery kit's components:
    `src/world/scenery/props.js` builds every camp and stronghold piece kind
    (`prop(kind, rng, { kit })`, styled per faction, inside the footprints in `PROP_SIZES`; wired
    in by the camp kit), and `src/world/scenery/placeProps.js` builds the settlements', landmarks',
    story sites' and world events' props — lamp posts, market stalls with their goods, the notice
    board, the war table, town trees, planters, crops, broken rock for heaps and rubble, and the
    event pylon, flare, Maker beacon and rift. `props()` and `placeProps()` in
    `tools/worldshots.js` shoot a tile of each.
  - *Plots* (`src/world/plots.js`): places no longer all stand on circles. A plot is a polygon
    worked out from a place's seed and bounding radius alone (no draws from the generator's
    streams, so nothing already placed moves, and the server agrees): a rectangle, a strip, an L,
    a T, a cross, a wedge or an irregular blob, turned any way, inside the place's old radius (a
    town's reaches 10 m past its old wall, inside the ground kept clear for it), its deepest point
    at the place's own spot, and leaving any room asked for round it. Terrain pads take a plot
    (`padEdge`), so levelled and trodden ground, grass and scenery clearing follow its outline.
    Camps lay out on theirs (world/campLayout.js: perimeter, gates and stronghold towers along the
    outline, everything else sampled inside it, the keep and alarm waves by it); towns, Brightwater
    and the city walls are walled round theirs (straight runs, corner towers, gates where roads
    cross), with town houses filling its corners; hamlets', villages', campsites', landmarks',
    ruins' and story places' trodden ground is theirs. Places now run from a campsite (travellers
    round a fire: tents, bedrolls, two or three folk, now and then a trader) and a picket (a few
    lookouts, no road of their own) to sprawling bases. `plots()` in `tools/worldshots.js` shoots
    one of each kind from above.
- **G3 Special effects:** implemented for surface-aware impacts, particle-based flame tongues and
  weapon-attached melee sparks (emitted from transformed mesh geometry at the striking end),
  toggleable blood particles for organic enemy hits, nearby scenery flames with pooled flickering
  point lights as well as broad, layered flame tongues, drifting embers and rising smoke wisps that
  scale with their source, particle
  explosion smoke, GPU particle pools with quality budgets, hit flashes, screen-space explosion
  shockwaves, debris, fading scorch decals, elemental
  particles, branching shock arcs, corrosive pools, snow, leaves, drifting biome motes, fireflies
  in forests at night, wet-biome rain and embers near world fires. The F3 panel reports live and total particle budgets, and
  `tools/effectcheck.mjs` checks pool bounds, expiry and cleanup under `npm test`. Captures across
  every element and surface, and a crowded-fight budget capture, remain outstanding. Fountain/
  waterfall spray is not implemented.
- **G4 Performance and polish:** the F3 readout reports frame time, draw calls, triangles, geometry,
  textures, programs, entities, drops, shots and particle use; near/far building detail levels are
  implemented; and `tools/worldshots.js` provides repeatable generated-world contact sheets.
  Repeated terrain scenery is instanced and building meshes are baked by colour. Tour outputs and
  quality-by-quality before/after measurements remain outstanding. G1 metal/glass toon highlights,
  crease ink and depth-varying line weight remain open.
  - `render/Particles.js` provides fixed-capacity instanced GPU pools for additive streaks and
    cel-shaded debris. `fx/Effects.js` owns and updates both pools, routes projectile and melee
    sparks through them, emits debris for impacts, and uses GPU particles for explosion embers and
    debris. Fire, shock, frost and corrosive hits and blasts have distinct particle accents. Pools
    are cleared with the rest of the effects on map changes. Ambient effects now cover all twelve
    biomes: snowfall, falling leaves and fireflies; colored spores and pollen; drifting dust and
    cinders; highland seeds, mountain wind streaks and crystal glints.
    Explosions now trigger an expanding screen-space distortion ring in the existing post chain,
    including while the player is stationary and at Low quality.
  - Building walls, forest trunks, crystal formations, rocks, shrooms and cacti now carry surface
    kinds into projectile impacts. Rain is implemented for jungle and marsh biomes; snow, leaves,
    spores and dust motes cover additional biomes, and embers rise near world fires. Remaining:
    expand impact surface tags across settlement/camp/Hive props; add waterfall/fountain spray;
    capture all elements and surfaces and verify a crowded-fight budget in game. Explosion
    scorch decals already fade out over time.
