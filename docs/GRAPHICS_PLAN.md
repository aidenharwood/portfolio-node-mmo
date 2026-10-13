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
- **Effects:** additive glow sprites, streaks, toon smoke puffs, rings, telegraphs and damage numbers
  (`fx/Effects.js`). They're generic, not tied to what was hit.

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
  - ribbon trails on spells and slashes;
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

- **G1:** in progress. See below.
