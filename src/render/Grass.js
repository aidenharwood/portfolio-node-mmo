// Grass: a field of blades round the player, drawn in one instanced call.
//   - Each blade's spot is fixed in the world: the field tiles the ground and the copy nearest the
//     player is drawn, so walking doesn't make the grass swim. Blades fade out towards the edge.
//   - Height and colour come from two small textures of the ground round the player, rebuilt in
//     slices (a few milliseconds a frame) as the player moves. The colour is the terrain's own
//     biome colour; the density thins on roads, rock, sand, snow, dirt yards and water.
//   - Blades lean a little at random, bend with the wind (render/Wind.js) and away from the
//     player's feet. Lit like the terrain (toon bands, shadows, fog, hatching).
// Its blade count and radius come from the quality setting (render/Quality.js): none on Low.
import * as THREE from 'three';
import { toonMaterial, chainCompile, noInk } from './Toon.js';
import { WIND, WIND_DIR } from './Wind.js';
import { BIOME_COLOR } from '../world/Chunks.js';
import { WATER_LEVEL } from '../world/Gen.js';

const HN = 128;            // height texels per side
const CN = 64;             // colour/density texels per side
const BUDGET_MS = 2.5;     // per frame, for rebuilding the textures
const DENSITY = { meadow: 0.85, forest: 0.6, highland: 0.45, marsh: 0.5, mountain: 0.25, snow: 0, ash: 0.04 };
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// One blade: two tapering segments and a tip, darker at the root (vertex colour × ground colour).
function bladeGeometry() {
  const g = new THREE.InstancedBufferGeometry();
  const rows = [[0, 1, 0.78], [0.4, 0.8, 0.9], [0.75, 0.45, 0.98]];
  const pos = [];
  const col = [];
  for (const [y, w, c] of rows) {
    pos.push(-0.5 * w, y, 0, 0.5 * w, y, 0);
    col.push(c, c, c, c, c, c);
  }
  pos.push(0, 1, 0);
  col.push(1.04, 1.04, 1.04);
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  // Both windings rather than a double-sided material (which would light the back faces as if
  // they faced the ground).
  const front = [0, 1, 2, 1, 3, 2, 2, 3, 4, 3, 5, 4, 4, 5, 6];
  const back = [];
  for (let i = 0; i < front.length; i += 3) back.push(front[i], front[i + 2], front[i + 1]);
  g.setIndex([...front, ...back]);
  return g;
}

const PARS = /* glsl */ `
uniform sampler2D uGrassHeight;
uniform sampler2D uGrassColor;
uniform vec3 uGrassTex;      // origin x, z and size of the textures' square, in metres
uniform vec2 uGrassCenter;
uniform float uGrassTile;
uniform float uGrassRadius;
uniform vec3 uGrassPush;
uniform float uWindTime;
uniform float uWindStrength;
float gHash(float n) { return fract(sin(n) * 43758.5453123); }
float grassGround(vec2 uv) {
  vec2 p = uv * ${HN}.0 - 0.5;
  ivec2 i = clamp(ivec2(floor(p)), ivec2(0), ivec2(${HN - 2}));
  vec2 f = clamp(p - vec2(i), 0.0, 1.0);
  float a = texelFetch(uGrassHeight, i, 0).r;
  float b = texelFetch(uGrassHeight, i + ivec2(1, 0), 0).r;
  float c = texelFetch(uGrassHeight, i + ivec2(0, 1), 0).r;
  float d = texelFetch(uGrassHeight, i + ivec2(1, 1), 0).r;
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
`;

// Where this blade is, how tall, which way it faces and how it bends (at the start of main(),
// in place of the vertex colour chunk, the first one that runs).
const PLACE = /* glsl */ `
  float gid = float(gl_InstanceID);
  vec2 gp = vec2(gHash(gid * 0.7131 + 0.13), gHash(gid * 1.3171 + 7.31)) * uGrassTile;
  gp += uGrassTile * floor((uGrassCenter - gp) / uGrassTile + 0.5);
  vec2 tuv = (gp - uGrassTex.xy) / uGrassTex.z;
  vec4 gc = texture(uGrassColor, tuv);
  float inside = step(0.0, tuv.x) * step(tuv.x, 1.0) * step(0.0, tuv.y) * step(tuv.y, 1.0);
  float gfade = 1.0 - smoothstep(uGrassRadius * 0.65, uGrassRadius, length(gp - uGrassCenter));
  float gd = gc.a * inside;
  float gkeep = step(gHash(gid * 2.173 + 3.3), gd) * gfade;
  float gh = mix(0.22, 0.48, gHash(gid * 3.71 + 1.9)) * (0.6 + 0.4 * gd) * gkeep;
  float gy = grassGround(tuv);
  float ga = gHash(gid * 5.13 + 2.7) * 6.2831853;
  vec2 gside = vec2(cos(ga), sin(ga));
  vec2 gdir = vec2(${WIND_DIR[0]}, ${WIND_DIR[1]});
  float gPhase = uWindTime * 2.1 + dot(gp, vec2(0.31, 0.27));
  float gGust = 0.55 + 0.45 * sin(uWindTime * 0.4 - dot(gp, gdir) * 0.02);
  vec2 gwind = gdir * (0.2 + 0.2 * sin(gPhase) + 0.07 * sin(gPhase * 2.7)) * gGust * uWindStrength;
  vec2 gaway = gp - uGrassPush.xz;
  float gpd = length(gaway);
  vec2 gpush = (gpd < 1.4 && abs(uGrassPush.y - gy) < 1.6) ? gaway / max(gpd, 0.01) * (1.4 - gpd) * 0.9 : vec2(0.0);
  vec2 glean = (vec2(gHash(gid * 7.7), gHash(gid * 9.1)) - 0.5) * 0.4;
  vec2 gbend = glean + gwind + gpush;
`;

export class Grass {
  constructor(game) {
    this.game = game;
    this.mesh = null;
    this.count = 0;
    this.radius = 0;
    this.heights = new THREE.DataTexture(new Float32Array(HN * HN), HN, HN, THREE.RedFormat, THREE.FloatType);
    this.colors = new THREE.DataTexture(new Uint8Array(CN * CN * 4), CN, CN, THREE.RGBAFormat);
    this.colors.colorSpace = THREE.SRGBColorSpace;
    this.colors.magFilter = this.colors.minFilter = THREE.LinearFilter;
    this.uniforms = {
      uGrassHeight: { value: this.heights },
      uGrassColor: { value: this.colors },
      uGrassTex: { value: new THREE.Vector3(0, 0, 1) },
      uGrassCenter: { value: new THREE.Vector2() },
      uGrassTile: { value: 1 },
      uGrassRadius: { value: 1 },
      uGrassPush: { value: new THREE.Vector3() },
    };
    this.job = null;      // the textures being rebuilt: a generator, worked a slice each frame
    this.builtAt = null;  // where the current textures are centred
    this.pending = null;
  }

  // Blade count and field radius (0: no grass).
  configure(count, radius) {
    if (count === this.count && radius === this.radius) return;
    this.count = count;
    this.radius = radius;
    if (this.mesh) {
      this.game.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh = null;
    }
    if (!count) return;
    const geo = bladeGeometry();
    geo.instanceCount = count;
    const mat = toonMaterial(0xffffff, { vertexColors: true });
    chainCompile(mat, 'grass', (shader) => {
      Object.assign(shader.uniforms, this.uniforms, { uWindTime: WIND.time, uWindStrength: WIND.strength });
      shader.vertexShader = PARS + shader.vertexShader
        .replace('#include <color_vertex>', `${PLACE}\n#include <color_vertex>\nvColor.rgb *= gc.rgb;`)
        .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = normalize(vec3(gside.x * 0.25, 1.0, gside.y * 0.25));')
        .replace('#include <begin_vertex>', /* glsl */ `
          vec3 transformed = vec3(gp.x + gside.x * position.x * 0.12, gy + position.y * gh, gp.y + gside.y * position.x * 0.12);
          vec2 gb = gbend * position.y * position.y * gh;
          transformed.xz += gb;
          transformed.y -= dot(gb, gb) * 0.5;`);
    });
    noInk(mat); // screen-space ink would outline every blade
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    this.mesh = mesh;
    this.size = radius * 2.8;
    this.uniforms.uGrassTile.value = radius * 2.2;
    this.uniforms.uGrassRadius.value = radius;
    this.builtAt = null;
    this.job = null;
    this.pending = null;
  }

  // A new world (another seed): the old ground is no use.
  reset() {
    this.builtAt = null;
    this.job = null;
    if (this.mesh?.parent) this.mesh.parent.remove(this.mesh);
  }

  update(focus) {
    if (!this.mesh) return;
    const u = this.uniforms;
    u.uGrassCenter.value.set(focus.x, focus.z);
    u.uGrassPush.value.copy(focus);
    // The textures follow the player: rebuilt (a slice a frame) once they've moved far enough.
    const far = !this.builtAt || Math.hypot(focus.x - this.builtAt.x, focus.z - this.builtAt.z) > this.radius * 0.35;
    if (far && !this.job) this.job = this.build(focus.x, focus.z);
    if (this.job) {
      const until = performance.now() + (this.builtAt ? BUDGET_MS : 30);
      while (performance.now() < until) if (this.job.next().done) { this.job = null; break; }
    }
    if (this.mesh.parent !== this.game.scene && this.builtAt) this.game.scene.add(this.mesh);
  }

  *build(cx, cz) {
    const world = this.game.world;
    const gen = world.gen;
    const size = this.size;
    // Snapped, so the same ground lands on the same texels as the player moves.
    const step = size / HN;
    const ox = Math.floor((cx - size / 2) / step) * step;
    const oz = Math.floor((cz - size / 2) / step) * step;
    const h = new Float32Array(HN * HN);
    for (let j = 0; j < HN; j++) {
      for (let i = 0; i < HN; i++) h[j * HN + i] = world.groundHeight(ox + (i + 0.5) * step, oz + (j + 0.5) * step);
      if (j % 8 === 7) yield;
    }
    const c = new Uint8Array(CN * CN * 4);
    const cs = size / CN;
    const col = new THREE.Color();
    for (let j = 0; j < CN; j++) {
      for (let i = 0; i < CN; i++) {
        const x = ox + (i + 0.5) * cs;
        const z = oz + (j + 0.5) * cs;
        const y = world.groundHeight(x, z);
        let d = 0;
        if (y > WATER_LEVEL + 0.35) {
          const biome = gen.biomeAt(x, z);
          d = DENSITY[biome] ?? 0;
          col.copy(BIOME_COLOR[biome] ?? BIOME_COLOR.meadow);
          if (d > 0 && y > 26) d *= 1 - smooth(26, 34, y);
          if (d > 0) {
            const slope = Math.hypot(world.groundHeight(x + 1, z) - world.groundHeight(x - 1, z), world.groundHeight(x, z + 1) - world.groundHeight(x, z - 1)) / 2;
            d *= 1 - smooth(0.5, 0.85, slope);
          }
          if (d > 0 && y < WATER_LEVEL + 1) d *= smooth(WATER_LEVEL + 0.35, WATER_LEVEL + 1, y);
          if (d > 0 && gen.nearRoad(x, z)) d = 0;
          if (d > 0) {
            // Yards and flattened ground round buildings: none on dirt, a little elsewhere.
            for (const p of gen.featuresNear(x, z).pads) {
              const dist = Math.hypot(x - p.x, z - p.z);
              if (dist < p.r + 3) d *= p.dirt ? smooth(p.r - 1, p.r + 3, dist) : 0.35 + 0.65 * smooth(p.r * 0.5, p.r + 3, dist);
            }
          }
        }
        const o = (j * CN + i) * 4;
        col.convertLinearToSRGB();
        c[o] = Math.min(255, col.r * 255);
        c[o + 1] = Math.min(255, col.g * 255);
        c[o + 2] = Math.min(255, col.b * 255);
        c[o + 3] = Math.round(Math.min(1, d) * 255);
      }
      if (j % 4 === 3) yield;
    }
    // Swap the new ground in all at once.
    this.heights.image.data.set(h);
    this.heights.needsUpdate = true;
    this.colors.image.data.set(c);
    this.colors.needsUpdate = true;
    this.uniforms.uGrassTex.value.set(ox, oz, size);
    this.builtAt = { x: cx, z: cz };
  }
}
