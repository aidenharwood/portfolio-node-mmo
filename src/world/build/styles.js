// The building kit's styles (docs/GRAPHICS_PLAN.md G2): for each, the roof forms it builds, how
// steep, and which details it reaches for — half-timbering and shutters, protruding beam ends,
// pipes, light strips, quoins, crenellations — with the chance of each. The colours of walls and
// roofs come from the builder (world/Towns.js picks them by climate); a style's own colours are its
// plinth, beams and glass. What a wall or roof colour is drawn as (render/Surfaces.js) is here too.
import { C, HEARTH, FORGE } from '../palette.js';
import { shade } from '../../render/ModelKit.js';

export const KIT_STYLES = {
  // Green country: plaster and timber, red tile and slate, gables to the street or eaves.
  temperate: {
    roofs: ['gable', 'gable', 'hip'], flatRoofs: ['parapet'], pitch: 0.42, frontGable: 0.4,
    timber: 0.45, shutters: 0.5, boxes: 0.45, dormers: 0.45, balcony: 0.25, porch: 0.25,
    plinth: C.stoneDark, beam: C.woodDark, glass: 0x17232d,
  },
  // The dry lands: adobe under flat roofs with parapets (a dome now and then), beam ends through
  // the walls, arched doors, the odd low hip roof.
  dry: {
    roofs: ['hip', 'gable'], flatRoofs: ['parapet', 'parapet', 'dome'], pitch: 0.24, frontGable: 0,
    vigas: 0.7, arch: true, shutters: 0.25, balcony: 0.15,
    plinth: shade(C.sandstone, 0.82), beam: C.woodDark, glass: 0x1d1a16,
  },
  // The wet lands: boards under steep thatch, deep eaves, porches on posts, shutters.
  wet: {
    roofs: ['hip', 'gable', 'gable'], flatRoofs: ['shed'], pitch: 0.62, frontGable: 0.3, overhang: 0.55,
    shutters: 0.65, porch: 0.5, timber: 0.2,
    plinth: C.woodDark, beam: C.woodDark, glass: 0x172a29,
  },
  // Against the cold: steel prefab under steep sheet-metal roofs, pipes down the walls.
  cold: {
    roofs: ['gable', 'shed'], flatRoofs: ['shed', 'parapet'], pitch: 0.55, frontGable: 0.5,
    pipes: 0.6, porch: 0.2,
    plinth: C.stoneDark, beam: C.metalDark, glass: 0x15202a,
  },
  // The strange lands: white panels, flat and sawtooth roofs, domes, light strips.
  tech: {
    roofs: ['shed', 'gable'], flatRoofs: ['parapet', 'sawtooth', 'dome'], pitch: 0.3, frontGable: 0,
    strip: HEARTH, pipes: 0.3,
    plinth: C.metalDark, beam: C.metalDark, glass: 0x10202c,
  },
  // The story cities: stone with quoins and a cornice under hipped tile.
  city: {
    roofs: ['hip', 'hip', 'gable'], flatRoofs: ['parapet'], pitch: 0.34, frontGable: 0.2,
    quoins: true, shutters: 0.35, boxes: 0.3, balcony: 0.35, dormers: 0.3,
    plinth: C.stoneDark, beam: C.woodDark, glass: 0x17232d,
  },
  // The Wardens: steel and stone blockhouses with crenellated parapets.
  warden: {
    roofs: ['parapet'], flatRoofs: ['crenel'], pitch: 0.3, frontGable: 0,
    pipes: 0.2, strip: HEARTH,
    plinth: C.stoneDark, beam: C.metalDark, glass: 0x10202c,
  },
  // The Scav clans: welded scrap — mismatched plates over a frame, a sheet roof sloped one way with
  // spikes along it, forge-lit slits for windows, a tarp for a door, a pipe for a chimney.
  scav: {
    roofs: ['shed'], flatRoofs: ['shed'], pitch: 0.55, frontGable: 0, overhang: 0.22,
    plates: true, spikes: 0.75, junk: true, pipes: 0.4,
    plinth: C.metalDark, beam: C.rust, glass: 0x1a1a1e, light: FORGE,
  },
};

// The kit's style for a place by its biome (as world/Towns.js chooses its colours).
const BY_BIOME = {
  meadow: 'temperate', forest: 'temperate', highland: 'temperate', jungle: 'wet', fungal: 'wet', marsh: 'wet',
  snow: 'cold', mountain: 'cold', desert: 'dry', badlands: 'dry', ash: 'tech', crystal: 'tech',
};
export const kitStyleOf = (biome) => BY_BIOME[biome] ?? 'temperate';

// What each wall and roof colour is drawn as.
const WALL_SURF = new Map([
  [C.hab, 'panels'], [0xe8dcc0, 'plaster'], [0xd8c8a8, 'plaster'], [C.sandstone, 'adobe'], [0xe0cfa8, 'adobe'],
  [0xd8b890, 'adobe'], [C.wood, 'planks'], [0x8a6a48, 'planks'], [0xa08a68, 'planks'], [C.steel, 'panels'],
  [0x8a7a68, 'planks'], [0x9aa4b4, 'panels'], [C.stone, 'blocks'], [C.stoneDark, 'blocks'], [0xc8d0da, 'panels'],
  [0x9a3a2a, 'planks'],
]);
const ROOF_SURF = new Map([
  [0x9a3a2a, 'tiles'], [0x4a5560, 'shingles'], [0xb08a5a, 'tiles'], [0xb0583a, 'tiles'], [C.thatch, 'thatch'],
  [0x7a6a40, 'thatch'], [C.metalDark, 'corrugated'], [0x3a4450, 'corrugated'], [0x3a3f4a, 'corrugated'], [C.rust, 'corrugated'],
]);
export const wallSurface = (color) => WALL_SURF.get(color);
export const roofSurface = (color) => ROOF_SURF.get(color);

// Shutters, flowers and doors, picked per building.
export const SHUTTERS = [0x3a6a4a, 0x8a3a2a, 0x3a5a8a, C.woodDark, 0x6a5a3a, 0x2f4a5a];
export const FLOWERS = [0xd94a5a, 0xe8c040, 0xb06ad8, 0xf08a3a];
export const DOORS = [0x3a2a20, 0x5a2a22, 0x2a3a4a, 0x2f3a2a];
// Scrap plates welded over a Scav wall.
export const PLATES = [C.rust, C.metalDark, 0xb08a3e, C.rust, C.steel, 0x6a4a32];
export const TARPS = [0x8a6a3a, 0x6a7a4a, 0x7a3a2a];
