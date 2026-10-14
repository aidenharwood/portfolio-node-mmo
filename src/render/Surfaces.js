// Procedural surfaces (docs/GRAPHICS_PLAN.md G1.1): planks, stone blocks, brick, metal panels,
// corrugated sheet, roof tiles, shingles, thatch, plaster, fabric, rust, concrete, cobbles, rock,
// resin, adobe and carved stone, drawn in the shader with no image textures, in the comic style:
// crisp darker seams, a little tint per board, brick or block, a little grain.
// Every piece a world builder bakes (render/ModelKit.js bake) carries surface coordinates in metres
// along its own faces (`puv`) and its kind (`pat`), so a pattern follows each wall, plank and tile
// whichever way it's turned, at true scale, even once a whole town is merged into one mesh. Lines
// and tints fade to their average as they shrink toward a pixel, so far walls don't shimmer.
// SURFACES (the uniform) turns them off at Low quality; SURFACE_BAKE skips the work where nothing
// is drawn (the server's world).
import * as THREE from 'three';
import { C } from '../world/palette.js';

export const SURFACE_KINDS = [
  null, 'planks', 'blocks', 'brick', 'panels', 'corrugated', 'tiles', 'thatch', 'plaster', 'fabric',
  'rust', 'concrete', 'cobbles', 'rock', 'resin', 'adobe', 'carved', 'shingles',
];
export const SURFACE_ID = Object.fromEntries(SURFACE_KINDS.map((k, i) => [k, i]).filter(([k]) => k));
export const SURFACES = { value: 1 };
export const SURFACE_BAKE = { on: typeof document !== 'undefined' };

// What a piece is made of when its builder doesn't say, by the palette's colours (used where a
// bake asks for it: the world's builders, not characters or weapons).
const BY_COLOR = new Map([
  [C.wood, 'planks'], [C.woodDark, 'planks'], [C.stone, 'blocks'], [C.stoneDark, 'blocks'],
  [C.metal, 'panels'], [C.metalDark, 'panels'], [C.steel, 'panels'], [C.rust, 'rust'], [C.hab, 'panels'],
  [C.hull, 'panels'], [C.hullDark, 'panels'], [C.canvas, 'fabric'], [C.hide, 'fabric'], [C.thatch, 'thatch'],
  [C.sandstone, 'adobe'], [C.redrock, 'rock'], [C.redrockDark, 'rock'], [C.obsidian, 'rock'],
  [C.resin, 'resin'], [C.resinDark, 'resin'], [C.chitin, 'resin'],
]);
export const surfaceOf = (color) => BY_COLOR.get(color) ?? null;
export const surfaceId = (kind) => (kind ? SURFACE_ID[kind] ?? 0 : 0);
// Kinds with a grain that runs along a piece's length (a post's boards run up it, a beam's along it).
const GRAINED = new Set(['planks', 'corrugated', 'panels']);

// ---------------------------------------------------------------- coordinates
const _q = new THREE.Quaternion();
const _o = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _e = new THREE.Vector3();
const _n = new THREE.Vector3();

// Fills `puv` and `pat` on a piece's own (unindexed) geometry, before it's moved into place: each
// triangle is projected onto the plane its face looks along, in metres (the piece's scale applied),
// offset by where the piece stands in its own turned frame, so pieces turned alike (a wall and
// its gable, a whole building after flatten) run on into each other.
export function surfaceCoords(geo, kind, mesh) {
  const pos = geo.attributes.position;
  const n = pos.count;
  const s = mesh.scale;
  _q.copy(mesh.quaternion).invert();
  _o.copy(mesh.position).applyQuaternion(_q);
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const ex = (bb.max.x - bb.min.x) * Math.abs(s.x);
  const ey = (bb.max.y - bb.min.y) * Math.abs(s.y);
  const ez = (bb.max.z - bb.min.z) * Math.abs(s.z);
  const grain = GRAINED.has(kind);
  const uv = new Float32Array(n * 2);
  const pat = new Float32Array(n).fill(surfaceId(kind));
  const P = [_a, _b, _c];
  for (let t = 0; t + 2 < n; t += 3) {
    for (let k = 0; k < 3; k++) P[k].set(pos.getX(t + k) * s.x, pos.getY(t + k) * s.y, pos.getZ(t + k) * s.z);
    _n.subVectors(_b, _a).cross(_e.subVectors(_c, _a));
    const ax = Math.abs(_n.x);
    const ay = Math.abs(_n.y);
    const az = Math.abs(_n.z);
    // Which plane, and whether to run the pattern the other way (along a long piece's length).
    let plane;
    let swap = false;
    // (Faces looking mostly up run their rows along the eave they slope down to: a hip roof's
    // sides as well as its front. Grain follows a flat piece's length.)
    const tilt = ax > az && ax > ay * 0.15;
    if (ay >= ax && ay >= az) { plane = 1; swap = tilt || (grain && ax < ay * 0.15 && az < ay * 0.15 && ez > ex * 1.4); } else if (ax >= az) { plane = 0; swap = grain && ey > ez * 1.4; } else { plane = 2; swap = grain && ey > ex * 1.4; }
    for (let k = 0; k < 3; k++) {
      const x = P[k].x + _o.x;
      const y = P[k].y + _o.y;
      const z = P[k].z + _o.z;
      let u;
      let v;
      if (plane === 1) { u = x; v = z; } else if (plane === 0) { u = z; v = y; } else { u = x; v = y; }
      uv[(t + k) * 2] = swap ? v : u;
      uv[(t + k) * 2 + 1] = swap ? u : v;
    }
  }
  geo.setAttribute('puv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('pat', new THREE.BufferAttribute(pat, 1));
  return geo;
}

// Blank coordinates for a plain piece merged with patterned ones (every geometry merged together
// must carry the same attributes).
export function noSurface(geo) {
  const n = geo.attributes.position.count;
  geo.setAttribute('puv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  geo.setAttribute('pat', new THREE.BufferAttribute(new Float32Array(n), 1));
  return geo;
}

// ---------------------------------------------------------------- the shaders
// Shared by the pieces' surfaces and the ground's.
const HELPERS = /* glsl */ `
  uniform float uSurfaces;
  // (Dave Hoskins' hash without sine: cheap, and steady however far out the coordinates run.)
  float sHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  float sNoise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(sHash(i), sHash(i + vec2(1.0, 0.0)), f.x), mix(sHash(i + vec2(0.0, 1.0)), sHash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  // Distance (metres) to the nearest seam of a running bond: rows h high, units l long, every other
  // row shifted by \`shift\` of a unit; \`id\` gets the unit's cell.
  float sBond(vec2 uv, float l, float h, float shift, out vec2 id) {
    float row = floor(uv.y / h);
    float x = uv.x / l + shift * mod(row, 2.0) + sHash(vec2(row, 7.0)) * 0.37;
    id = vec2(floor(x), row);
    vec2 f = vec2(fract(x) * l, fract(uv.y / h) * h);
    return min(min(f.x, l - f.x), min(f.y, h - f.y));
  }
  // A seam w metres either side of its line, at distance d, anti-aliased over aa; it fades as the
  // cell it bounds (cell metres) shrinks toward a pixel (px metres).
  float sLine(float d, float w, float aa, float cell, float px) {
    return (1.0 - smoothstep(w - aa, w + aa, d)) * (1.0 - smoothstep(cell * 0.1, cell * 0.35, px));
  }
  vec2 sVoronoi(vec2 p, out vec2 cellId) {
    vec2 i = floor(p); vec2 f = fract(p);
    float d1 = 8.0; float d2 = 8.0;
    cellId = i;
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 o = vec2(sHash(i + g), sHash(i + g + 17.3)) * 0.8 + 0.1;
      float d = length(g + o - f);
      if (d < d1) { d2 = d1; d1 = d; cellId = i + g; } else if (d < d2) d2 = d;
    }
    return vec2(d1, d2);
  }
`;

const GLSL = /* glsl */ `
  varying vec2 vSurfUv;
  varying float vSurfKind;
  // Each kind's cell (its boards', blocks', rows' size, metres): it fades out as that nears a pixel.
  const float S_CELL[18] = float[18](1.0, 0.24, 0.45, 0.12, 1.2, 0.12, 0.28, 0.5, 1.0, 1.1, 0.6, 1.6, 0.35, 1.3, 0.6, 0.42, 0.8, 0.22);
  // How much a surface darkens (a little, lifts) its colour here, about 1 on average. px: metres
  // per pixel here (taken outside any branch, where its derivatives are sound).
  float surfaceShade(vec2 uv, float kind, float px) {
    float aa = px * 0.75;
    int k = int(kind + 0.5);
    float cell = S_CELL[k];
    // Too far to show anything but its average: nothing to draw.
    if (px > cell * 0.7) return 1.0;
    float m = 1.0;
    float mean = 1.0;
    vec2 id;
    if (k == 1) { // planks: boards, their ends staggered, a little grain
      mean = 0.93;
      float d = sBond(uv, 2.4, 0.24, 0.5, id);
      m = 0.9 + 0.14 * sHash(id) + 0.04 * (sNoise(vec2(uv.x * 6.0, uv.y * 55.0)) - 0.5);
      m *= 1.0 - 0.42 * sLine(d, 0.012, aa, cell, px);
    } else if (k == 2) { // stone blocks
      mean = 0.93;
      float d = sBond(uv, 0.9, 0.45, 0.5, id);
      m = 0.88 + 0.16 * sHash(id) + 0.06 * (sNoise(uv * 4.0) - 0.5);
      m *= 1.0 - 0.45 * sLine(d, 0.022, aa, cell, px);
    } else if (k == 3) { // brick
      mean = 0.9;
      float d = sBond(uv, 0.3, 0.12, 0.5, id);
      m = 0.86 + 0.18 * sHash(id);
      m *= 1.0 - 0.4 * sLine(d, 0.011, aa, cell, px);
    } else if (k == 4) { // metal panels with rivets at their corners
      mean = 0.95;
      vec2 f = fract(uv / 1.2) * 1.2;
      id = floor(uv / 1.2);
      float d = min(min(f.x, 1.2 - f.x), min(f.y, 1.2 - f.y));
      m = 0.94 + 0.08 * sHash(id) + 0.04 * (sNoise(vec2(uv.x * 0.8, uv.y * 6.0)) - 0.5);
      m *= 1.0 - 0.4 * sLine(d, 0.012, aa, cell, px);
      vec2 r = abs(f - 0.6) - 0.52;
      m *= 1.0 - 0.35 * sLine(length(r), 0.022, aa, 0.3, px);
    } else if (k == 5) { // corrugated sheet, its ribs catching the light, rust in patches
      mean = 0.92;
      m = 0.92 + 0.08 * sin(uv.x * 52.36);
      m *= 1.0 - 0.18 * smoothstep(0.62, 0.78, sNoise(uv * 1.3));
    } else if (k == 6 || k == 17) { // roof tiles / shingles: rows that overlap, shadowed under each
      float h = k == 6 ? 0.28 : 0.22;
      mean = 0.88;
      float d = sBond(uv, k == 6 ? 0.32 : 0.5, h, 0.5, id);
      m = (0.9 + 0.14 * sHash(id)) * mix(0.8, 1.04, smoothstep(0.0, 0.85, fract(uv.y / h)));
      m *= 1.0 - 0.35 * sLine(d, 0.012, aa, cell, px);
    } else if (k == 7) { // thatch: straw in bundles, in courses
      mean = 0.92;
      m = 0.84 + 0.24 * sNoise(vec2(uv.x * 16.0, uv.y * 1.6));
      m *= 1.0 - 0.28 * sLine(fract(uv.y / 0.5) * 0.5, 0.02, aa, cell, px);
    } else if (k == 8) { // plaster
      mean = 0.97;
      m = 0.97 + 0.08 * (sNoise(uv * 1.1) - 0.5) + 0.04 * (sNoise(uv * 5.0) - 0.5);
    } else if (k == 9) { // fabric: seams
      mean = 0.97;
      m = 0.97 + 0.04 * (sNoise(uv * vec2(3.0, 12.0)) - 0.5);
      m *= 1.0 - 0.25 * sLine(fract(uv.x / 1.1) * 1.1, 0.01, aa, cell, px);
    } else if (k == 10) { // rust: blotches on metal
      mean = 0.9;
      float n = sNoise(uv * 1.7) * 0.6 + sNoise(uv * 6.0) * 0.4;
      m = mix(1.0, 0.72, smoothstep(0.5, 0.7, n)) * (0.95 + 0.08 * sNoise(uv * 14.0));
    } else if (k == 11) { // concrete: slabs, and speckle
      mean = 0.96;
      vec2 f = fract(uv / vec2(2.4, 1.6)) * vec2(2.4, 1.6);
      float d = min(min(f.x, 2.4 - f.x), min(f.y, 1.6 - f.y));
      m = 0.96 + 0.08 * (sNoise(uv * 3.0) - 0.5) + 0.05 * (sNoise(uv * 23.0) - 0.5);
      m *= 1.0 - 0.3 * sLine(d, 0.014, aa, cell, px);
    } else if (k == 12 || k == 13) { // cobbles / rock: cells with dark cracks between
      float sc = k == 12 ? 0.35 : 1.3;
      mean = 0.9;
      vec2 v = sVoronoi(uv / sc, id);
      m = 0.86 + 0.18 * sHash(id);
      m *= 1.0 - (k == 12 ? 0.5 : 0.42) * sLine((v.y - v.x) * sc, k == 12 ? 0.02 : 0.035, aa, cell, px);
    } else if (k == 14) { // resin and chitin: swollen veins
      mean = 0.92;
      float n = sNoise(uv * 1.4 + sNoise(uv * 0.5) * 2.0);
      m = 0.88 + 0.16 * n;
      m *= 1.0 - 0.35 * sLine(abs(n - 0.5) * 1.2, 0.03, aa, cell, px);
    } else if (k == 15) { // adobe: smoothed courses
      mean = 0.96;
      m = 0.96 + 0.07 * (sNoise(uv * 1.3) - 0.5);
      m *= 1.0 - 0.14 * sLine(fract(uv.y / 0.42) * 0.42, 0.015, aa, cell, px);
    } else if (k == 16) { // carved stone: big blocks with a groove cut along each
      mean = 0.9;
      float d = sBond(uv, 1.3, 0.8, 0.0, id);
      m = 0.9 + 0.12 * sHash(id);
      m *= 1.0 - 0.45 * sLine(d, 0.03, aa, cell, px);
      m *= 1.0 - 0.25 * sLine(abs(fract(uv.y / 0.8) * 0.8 - 0.4), 0.012, aa, cell, px);
    }
    // Far off (a cell a few pixels across) it settles to its average, so nothing shimmers.
    return mix(m, mean, smoothstep(0.2, 0.7, px / cell)) / mean;
  }
`;

// Draws a material's surfaces (its geometry carries puv and pat). `chain` is render/Toon.js
// chainCompile (passed in so this module and Toon.js don't import each other).
const shaded = new WeakSet();
export function withSurfaces(mat, chain) {
  if (shaded.has(mat)) return mat;
  shaded.add(mat);
  return chain(mat, 'surfaces', (shader) => {
    shader.uniforms.uSurfaces = SURFACES;
    shader.vertexShader = `attribute vec2 puv;\nattribute float pat;\nvarying vec2 vSurfUv;\nvarying float vSurfKind;\n${shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvSurfUv = puv;\n\tvSurfKind = pat;')}`;
    shader.fragmentShader = `${HELPERS}\n${GLSL}\n${shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n\tfloat surfPx = max(length(fwidth(vSurfUv)), 1e-4);\n\tif (uSurfaces > 0.5 && vSurfKind > 0.5) diffuseColor.rgb *= surfaceShade(vSurfUv, vSurfKind, surfPx);')}`;
  });
}

// ---------------------------------------------------------------- the ground
// The terrain's own detail (G1.1), by what its colour and slope say it is: broad two-tone patches
// everywhere (warmer, lighter ones on grass, as painted backgrounds do), pebbles on sand and
// dirt, and cracks on steep rock — all at true scale in world metres, fading with distance.
const TERRAIN_GLSL = /* glsl */ `
  varying vec3 vTerrPos;
  varying vec3 vTerrNormal;
  vec3 terrainShade(vec3 col, vec3 p, vec3 n, float px) {
    vec2 uv = p.xz;
    float hi = max(col.r, max(col.g, col.b));
    float sat = hi - min(col.r, min(col.g, col.b));
    float green = clamp((col.g - max(col.r, col.b)) * 8.0, 0.0, 1.0);
    // Patches some metres across, crisp-edged.
    float n1 = sNoise(uv * 0.07) * 0.62 + sNoise(uv * 0.29 + 9.0) * 0.38;
    float blot = smoothstep(0.47, 0.53, n1);
    vec3 warm = mix(vec3(1.035), vec3(1.07, 1.05, 0.9), green);
    vec3 cool = mix(vec3(0.965), vec3(0.93, 0.96, 0.99), green);
    vec3 m = mix(cool, warm, blot);
    float near = 1.0 - smoothstep(0.04, 0.16, px);
    if (near <= 0.0) return m;
    float steep = 1.0 - smoothstep(0.7, 0.82, n.y);
    if (steep > 0.0) {
      // Rock faces: cracked into slabs, each its own shade.
      vec2 ruv = abs(n.x) > abs(n.z) ? p.zy : p.xy;
      vec2 id;
      vec2 v = sVoronoi(ruv / 1.6, id);
      float crack = 1.0 - smoothstep(0.03 - px, 0.03 + px, (v.y - v.x) * 1.6);
      m *= 1.0 - steep * near * (0.32 * crack - 0.08 * (sHash(id) - 0.5));
    } else if (green < 0.3 && sat > 0.12 && hi > 0.25) {
      // Sand and dirt: pebbles, a few dark and a few light.
      vec2 c = uv / 0.45;
      vec2 i = floor(c);
      vec2 f = fract(c) - 0.5 - (vec2(sHash(i), sHash(i + 5.3)) - 0.5) * 0.6;
      float r = 0.06 + 0.08 * sHash(i + 11.0);
      float aa = px / 0.45;
      float peb = 1.0 - smoothstep(r - aa, r + aa, length(f));
      float tone = sHash(i + 2.7) > 0.5 ? 0.82 : 1.1;
      m *= mix(1.0, tone, peb * near * step(0.55, sHash(i + 7.1)));
    }
    return m;
  }
`;

// The ground's detail on the terrain's material (world/Chunks.js). `chain` as withSurfaces'.
export function withTerrain(mat, chain) {
  if (shaded.has(mat)) return mat;
  shaded.add(mat);
  return chain(mat, 'terrain', (shader) => {
    shader.uniforms.uSurfaces = SURFACES;
    shader.vertexShader = `varying vec3 vTerrPos;\nvarying vec3 vTerrNormal;\n${shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvTerrPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\n\tvTerrNormal = normalize(mat3(modelMatrix) * objectNormal);')}`;
    shader.fragmentShader = `${HELPERS}\n${TERRAIN_GLSL}\n${shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n\tfloat terrPx = max(length(fwidth(vTerrPos.xz)), 1e-4);\n\tif (uSurfaces > 0.5) diffuseColor.rgb *= terrainShade(diffuseColor.rgb, vTerrPos, normalize(vTerrNormal), terrPx);')}`;
  });
}
