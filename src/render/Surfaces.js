// Procedural surfaces (docs/GRAPHICS_PLAN.md G1.1): planks, brick, stone blocks, roof tiles,
// thatch, metal panels, corrugated sheet, rust, concrete, plaster, adobe, cobbles, rock, fabric,
// resin and carved stone, drawn in the shader with no image textures, in the comic style: crisp darker
// seams, a little tint per board, brick or block, a little grain.
// Every baked piece (render/ModelKit.js bake) carries surface coordinates in metres, aligned to its
// own faces (`puv`), and its kind (`pat`), so a pattern follows each wall, plank and tile whichever
// way it's turned, at true scale, even once a whole town is merged into one mesh. Lines fade to their
// average as they shrink below a pixel, so far walls don't shimmer. SURFACES turns them off (Low).
import * as THREE from 'three';
import { C } from '../world/palette.js';

export const SURFACE_KINDS = [
  null, 'planks', 'blocks', 'brick', 'panels', 'corrugated', 'tiles', 'thatch', 'plaster', 'fabric',
  'rust', 'concrete', 'cobbles', 'rock', 'resin', 'adobe', 'carved', 'shingles',
];
export const SURFACE_ID = Object.fromEntries(SURFACE_KINDS.map((k, i) => [k, i]).filter(([k]) => k));
export const SURFACES = { value: 1 };

// What a piece is made of when its builder doesn't say: by the palette's colours.
const BY_COLOR = new Map([
  [C.wood, 'planks'], [C.woodDark, 'planks'], [C.stone, 'blocks'], [C.stoneDark, 'blocks'],
  [C.metal, 'panels'], [C.metalDark, 'panels'], [C.steel, 'panels'], [C.rust, 'rust'], [C.hab, 'panels'],
  [C.hull, 'panels'], [C.hullDark, 'panels'], [C.canvas, 'fabric'], [C.hide, 'fabric'], [C.thatch, 'thatch'],
  [C.sandstone, 'adobe'], [C.redrock, 'rock'], [C.redrockDark, 'rock'], [C.obsidian, 'rock'],
  [C.resin, 'resin'], [C.resinDark, 'resin'], [C.chitin, 'resin'],
]);
export const surfaceOf = (color) => BY_COLOR.get(color) ?? null;
export const surfaceId = (kind) => (kind ? SURFACE_ID[kind] ?? 0 : 0);

// ---------------------------------------------------------------- coordinates
// Fills `puv` (metres along the piece's faces, offset by where the piece stands so walls built of
// several pieces run on) and `pat` for a piece's geometry, from its local positions and normals.
export function surfaceCoords(geo, kind, scale, offset) {
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const n = pos.count;
  const uv = new Float32Array(n * 2);
  const pat = new Float32Array(n).fill(surfaceId(kind));
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i) * scale.x;
    const y = pos.getY(i) * scale.y;
    const z = pos.getZ(i) * scale.z;
    const ax = Math.abs(nor.getX(i));
    const ay = Math.abs(nor.getY(i));
    const az = Math.abs(nor.getZ(i));
    let u;
    let v;
    if (ay >= ax && ay >= az) { u = x + offset.x; v = z + offset.z; } else if (ax >= az) { u = z + offset.z; v = y + offset.y; } else { u = x + offset.x; v = y + offset.y; }
    uv[i * 2] = u;
    uv[i * 2 + 1] = v;
  }
  geo.setAttribute('puv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('pat', new THREE.BufferAttribute(pat, 1));
  return geo;
}

// ---------------------------------------------------------------- the shader
const GLSL = /* glsl */ `
  uniform float uSurfaces;
  varying vec2 vSurfUv;
  varying float vSurfKind;
  float sHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float sNoise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(sHash(i), sHash(i + vec2(1.0, 0.0)), f.x), mix(sHash(i + vec2(0.0, 1.0)), sHash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  // Distance (in metres) to the nearest seam of a running bond: rows of height h, units of length l,
  // every other row shifted by half (\`shift\`); \`id\` gets the unit's cell.
  float sBond(vec2 uv, float l, float h, float shift, out vec2 id) {
    float row = floor(uv.y / h);
    float x = uv.x / l + shift * mod(row, 2.0) + sHash(vec2(row, 7.0)) * 0.37;
    id = vec2(floor(x), row);
    vec2 f = vec2(fract(x) * l, fract(uv.y / h) * h);
    return min(min(f.x, l - f.x), min(f.y, h - f.y));
  }
  // A seam of half-width w (metres) at distance d, anti-aliased over aa, with its contrast fading as
  // the cell it bounds shrinks toward a pixel (\`cell\` metres across, \`px\` metres per pixel).
  float sLine(float d, float w, float aa, float cell, float px) {
    return (1.0 - smoothstep(w - aa, w + aa, d)) * (1.0 - smoothstep(cell * 0.12, cell * 0.4, px));
  }
  vec2 sVoronoi(vec2 p, out vec2 cellId) {
    vec2 i = floor(p); vec2 f = fract(p);
    float d1 = 8.0; float d2 = 8.0;
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 o = vec2(sHash(i + g), sHash(i + g + 17.3)) * 0.8 + 0.1;
      float d = length(g + o - f);
      if (d < d1) { d2 = d1; d1 = d; cellId = i + g; } else if (d < d2) d2 = d;
    }
    return vec2(d1, d2);
  }
  // How much a surface darkens (or, a little, lifts) its colour at a point.
  float surfaceShade(vec2 uv, float kind) {
    float px = max(length(fwidth(uv)), 1e-4);
    float aa = px * 0.75;
    float m = 1.0;
    vec2 id;
    int k = int(kind + 0.5);
    if (k == 1) { // planks: boards running across, their ends staggered, a little grain
      float d = sBond(uv, 2.4, 0.24, 0.5, id);
      m = 0.9 + 0.14 * sHash(id) + 0.035 * (sNoise(vec2(uv.x * 7.0, uv.y * 60.0)) - 0.5);
      m *= 1.0 - 0.42 * sLine(d, 0.012, aa, 0.24, px);
    } else if (k == 2) { // stone blocks
      float d = sBond(uv, 0.9, 0.45, 0.5, id);
      m = 0.88 + 0.16 * sHash(id) + 0.06 * (sNoise(uv * 4.0) - 0.5);
      m *= 1.0 - 0.45 * sLine(d, 0.022, aa, 0.45, px);
    } else if (k == 3) { // brick
      float d = sBond(uv, 0.3, 0.12, 0.5, id);
      m = 0.86 + 0.18 * sHash(id);
      m *= 1.0 - 0.4 * sLine(d, 0.011, aa, 0.12, px);
    } else if (k == 4) { // metal panels with rivets
      vec2 cell = vec2(1.2, 1.2);
      vec2 f = fract(uv / cell) * cell;
      id = floor(uv / cell);
      float d = min(min(f.x, cell.x - f.x), min(f.y, cell.y - f.y));
      m = 0.94 + 0.08 * sHash(id) + 0.05 * (sNoise(vec2(uv.x * 0.8, uv.y * 6.0)) - 0.5);
      m *= 1.0 - 0.4 * sLine(d, 0.012, aa, 1.2, px);
      vec2 r = abs(f - cell * 0.5) - (cell * 0.5 - 0.08);
      float rivet = length(max(r, 0.0));
      m *= 1.0 - 0.3 * sLine(rivet, 0.025, aa, 0.25, px) * step(0.0, min(r.x, r.y));
    } else if (k == 5) { // corrugated sheet
      m = 0.9 + 0.1 * sin(uv.x * 52.36) * (1.0 - smoothstep(0.02, 0.06, px));
      m *= 1.0 - 0.18 * smoothstep(0.62, 0.78, sNoise(uv * 1.3));
    } else if (k == 6 || k == 17) { // roof tiles / shingles: rows that overlap, shadowed under each
      float h = k == 6 ? 0.28 : 0.22;
      float d = sBond(uv, k == 6 ? 0.32 : 0.5, h, 0.5, id);
      m = (0.9 + 0.14 * sHash(id)) * mix(0.82, 1.04, smoothstep(0.0, 0.85, fract(uv.y / h)));
      m *= 1.0 - 0.35 * sLine(d, 0.012, aa, h, px);
    } else if (k == 7) { // thatch
      m = 0.84 + 0.24 * sNoise(vec2(uv.x * 16.0, uv.y * 1.6));
      m *= 1.0 - 0.25 * sLine(fract(uv.y / 0.5) * 0.5, 0.02, aa, 0.5, px);
    } else if (k == 8) { // plaster
      m = 0.96 + 0.08 * (sNoise(uv * 1.1) - 0.5) + 0.04 * (sNoise(uv * 5.0) - 0.5);
    } else if (k == 9) { // fabric: a fine weave and seams
      m = 0.96 + 0.05 * sin(uv.x * 140.0) * sin(uv.y * 140.0) * (1.0 - smoothstep(0.005, 0.02, px));
      m *= 1.0 - 0.25 * sLine(fract(uv.x / 1.1) * 1.1, 0.01, aa, 1.1, px);
    } else if (k == 10) { // rust: blotches on metal
      float n = sNoise(uv * 1.7) * 0.6 + sNoise(uv * 6.0) * 0.4;
      m = mix(1.0, 0.72, smoothstep(0.5, 0.7, n)) * (0.95 + 0.08 * sNoise(uv * 14.0));
    } else if (k == 11) { // concrete: slabs and speckle
      vec2 cell = vec2(2.4, 1.6);
      vec2 f = fract(uv / cell) * cell;
      float d = min(min(f.x, cell.x - f.x), min(f.y, cell.y - f.y));
      m = 0.95 + 0.08 * (sNoise(uv * 3.0) - 0.5) + 0.05 * (sHash(floor(uv * 40.0)) - 0.5) * (1.0 - smoothstep(0.005, 0.03, px));
      m *= 1.0 - 0.3 * sLine(d, 0.014, aa, 1.6, px);
    } else if (k == 12 || k == 13) { // cobbles / rock: cells with dark cracks
      float s = k == 12 ? 0.35 : 1.3;
      vec2 v = sVoronoi(uv / s, id);
      float edge = (v.y - v.x) * s;
      m = 0.86 + 0.18 * sHash(id);
      m *= 1.0 - (k == 12 ? 0.5 : 0.45) * sLine(edge, k == 12 ? 0.02 : 0.035, aa, s, px);
    } else if (k == 14) { // resin and chitin: swollen veins
      float n = sNoise(uv * 1.4 + sNoise(uv * 0.5) * 2.0);
      m = 0.88 + 0.16 * n;
      m *= 1.0 - 0.35 * sLine(abs(n - 0.5) * 1.2, 0.03, aa, 0.6, px);
    } else if (k == 15) { // adobe: smoothed courses
      m = 0.95 + 0.07 * (sNoise(uv * 1.3) - 0.5);
      m *= 1.0 - 0.12 * sLine(fract(uv.y / 0.42) * 0.42, 0.015, aa, 0.42, px);
    } else if (k == 16) { // carved stone: big blocks with grooves cut in
      float d = sBond(uv, 1.3, 0.8, 0.0, id);
      m = 0.9 + 0.12 * sHash(id);
      m *= 1.0 - 0.45 * sLine(d, 0.03, aa, 0.8, px);
      m *= 1.0 - 0.25 * sLine(abs(fract(uv.y / 0.8) * 0.8 - 0.4), 0.012, aa, 0.8, px);
    }
    return mix(1.0, m, uSurfaces);
  }
`;

const shaded = new WeakSet();
// Draws a material's surfaces (its geometry carries puv and pat). `chain` is render/Toon.js
// chainCompile (passed in so this module doesn't import Toon.js back).
export function withSurfaces(mat, chain) {
  if (shaded.has(mat)) return mat;
  shaded.add(mat);
  return chain(mat, 'surfaces', (shader) => {
    shader.uniforms.uSurfaces = SURFACES;
    shader.vertexShader = `attribute vec2 puv;\nattribute float pat;\nvarying vec2 vSurfUv;\nvarying float vSurfKind;\n${shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvSurfUv = puv;\n\tvSurfKind = pat;')}`;
    shader.fragmentShader = `${GLSL}\n${shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n\tif (vSurfKind > 0.5) diffuseColor.rgb *= surfaceShade(vSurfUv, vSurfKind);')}`;
  });
}
