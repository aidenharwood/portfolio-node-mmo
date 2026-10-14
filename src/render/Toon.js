// Cel-shading building blocks: banded toon materials + inverted-hull outlines.
// (At medium and high quality the world's ink is drawn in screen space instead — render/PostFX.js
// — and these hulls stay on the first-person weapon only.)
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { WIND, WIND_PARS, windGLSL } from './Wind.js';

export const INK = 0x14101c;

let gradient = null;
const outlineMaterials = new Map();
const smoothCache = new WeakMap();

// Four light bands (docs/GRAPHICS_PLAN.md G1.2): shadow / turned away / turned toward / lit. The
// toon materials draw them in the shader (BANDS_GLSL, with anti-aliased edges); this texture is
// the same ramp, for anything that samples it. NearestFilter keeps the steps crisp.
export function toonGradient() {
  if (!gradient) {
    const data = new Uint8Array([64, 128, 194, 255]);
    gradient = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
    gradient.minFilter = THREE.NearestFilter;
    gradient.magFilter = THREE.NearestFilter;
    gradient.needsUpdate = true;
  }
  return gradient;
}

// Comic shading: screen-space ink hatching laid over the shadow band, cross-hatched in deep
// shadow (cast shadows, undersides). Shared uniform so spacing tracks the device pixel ratio.
const HATCH = { value: 6 };
export function setHatchScale(pixelRatio) {
  HATCH.value = 5.5 * pixelRatio;
}

// The bands themselves: where a face turns from the sun (N·L) past -0.4, 0.05 and 0.4 its light
// steps down, each edge softened over about a pixel on curved surfaces (flat faces stay crisp).
// toonAA is set at the top of main, outside the light loops (cascaded shadows call this inside
// branches, where derivatives aren't to be had).
const BANDS_GLSL = /* glsl */ `
  #ifdef USE_GRADIENTMAP
    uniform sampler2D gradientMap;
  #endif
  float toonAA = 0.0;
  vec3 getGradientIrradiance(vec3 normal, vec3 lightDirection) {
    float x = dot(normal, lightDirection);
    float w = max(toonAA, 1e-4);
    float l = 0.25;
    l = mix(l, 0.5, smoothstep(-0.4 - w, -0.4 + w, x));
    l = mix(l, 0.76, smoothstep(0.05 - w, 0.05 + w, x));
    l = mix(l, 1.0, smoothstep(0.4 - w, 0.4 + w, x));
    return vec3(l);
  }`;

// Comic shading over the bands: shadows lean cool and violet, as in painted cel art, and the
// shadow band is hatched in screen-space ink, cross-hatched in deep shadow (cast shadows,
// undersides). Glowing surfaces are left alone.
const COMIC_FRAGMENT = /* glsl */ `
  {
    float baseLum = max(dot(diffuseColor.rgb, vec3(0.3333)), 0.02);
    float lit = dot(reflectedLight.directDiffuse, vec3(0.3333)) / baseLum;
    float glowing = clamp(dot(totalEmissiveRadiance, vec3(0.3333)) * 3.0, 0.0, 1.0);
    float cool = (1.0 - smoothstep(0.12, 0.5, lit)) * (1.0 - glowing);
    outgoingLight *= mix(vec3(1.0), vec3(0.86, 0.9, 1.12), cool);
    float shadow = 1.0 - smoothstep(0.24, 0.32, lit);
    float deep = 1.0 - smoothstep(0.04, 0.14, lit);
    vec2 hp = gl_FragCoord.xy / uHatchSpacing;
    float l1 = smoothstep(0.78, 0.9, fract(hp.x + hp.y));
    float l2 = smoothstep(0.78, 0.9, fract(hp.x - hp.y));
    float ink = max(l1 * shadow, l2 * deep * 0.8);
    ink *= 1.0 - glowing;
    outgoingLight = mix(outgoingLight, outgoingLight * 0.3, ink * 0.6);
  }
  #include <opaque_fragment>`;

// Adds `fn` to a material's shader hook (after any already there), and `key` to what tells its
// program apart, so several features (hatching, wind, cascaded shadows…) can each change it.
// (Kept per material object: a clone copies neither the hooks nor this.)
const compileKeys = new WeakMap();
export function chainCompile(mat, key, fn) {
  const prev = mat.onBeforeCompile === THREE.Material.prototype.onBeforeCompile ? null : mat.onBeforeCompile;
  const prevKey = compileKeys.get(mat)
    ?? (mat.customProgramCacheKey === THREE.Material.prototype.customProgramCacheKey ? '' : mat.customProgramCacheKey());
  const fullKey = `${prevKey}|${key}`;
  compileKeys.set(mat, fullKey);
  mat.onBeforeCompile = function (shader, renderer) {
    prev?.call(this, shader, renderer);
    fn.call(this, shader, renderer);
  };
  mat.customProgramCacheKey = () => fullKey;
  return mat;
}
export const hasCompile = (mat, key) => (compileKeys.get(mat) ?? '').includes(`|${key}`);

export function applyComic(mat) {
  if (hasCompile(mat, 'comic')) return mat; // already
  return chainCompile(mat, 'comic', (shader) => {
    shader.uniforms.uHatchSpacing = HATCH;
    shader.fragmentShader = 'uniform float uHatchSpacing;\n' + shader.fragmentShader
      .replace('#include <gradientmap_pars_fragment>', BANDS_GLSL)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n\ttoonAA = length(fwidth(normal)) * 0.6;')
      .replace('#include <opaque_fragment>', COMIC_FRAGMENT);
  });
}

// A thin, bright rim on a model's silhouette where it faces the sun, so characters and enemies
// read against busy ground (docs/GRAPHICS_PLAN.md G1.2). For smooth, rounded models only: on a
// big flat face seen edge-on the whole face would light up.
export function applyRim(mat) {
  if (hasCompile(mat, 'rim')) return mat;
  return chainCompile(mat, 'rim', (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', /* glsl */ `
  #if NUM_DIR_LIGHTS > 0
  {
    float fres = 1.0 - saturate(dot(normal, geometryViewDir));
    float toSun = dot(normal, directionalLights[0].direction);
    float rim = smoothstep(0.6, 0.66, fres) * smoothstep(-0.1, 0.3, toSun);
    outgoingLight += diffuseColor.rgb * directionalLights[0].color * rim * 0.2;
  }
  #endif
  #include <opaque_fragment>`);
  });
}

export function toonMaterial(color, extra = {}) {
  return applyComic(new THREE.MeshToonMaterial({ color, gradientMap: toonGradient(), ...extra }));
}

// Wind sway on a material's vertices (render/Wind.js): `amp` how far, scaled by the square of the
// height above `base` (in the model's own units), so trunks and roots stay put.
export function addWind(mat, { amp, base = 0 }) {
  return chainCompile(mat, `wind:${amp}:${base}`, (shader) => {
    shader.uniforms.uWindTime = WIND.time;
    shader.uniforms.uWindStrength = WIND.strength;
    shader.uniforms.uWindAmp = { value: amp };
    shader.uniforms.uWindBase = { value: base };
    shader.vertexShader = WIND_PARS + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n${windGLSL('transformed')}`);
  });
}

// No screen-space ink or AO on or round this (render/PostFX.js): grass, tiny scenery, the held
// weapon. Marked by writing alpha 0, which the ink pass reads (and replaces with 1). Opaque
// materials only — on a see-through one it would make it invisible. The mark is only written while
// the ink pass is there to take it (INK_MARK, set by PostFX): the canvas has an alpha channel, and
// a mark reaching it lets the page show through, washed out to white.
export const INK_MARK = { value: 0 };
export function noInk(mat) {
  if (mat.transparent || hasCompile(mat, 'noink')) return mat;
  return chainCompile(mat, 'noink', (shader) => {
    shader.uniforms.uInkMark = INK_MARK;
    shader.fragmentShader = `uniform float uInkMark;\n${shader.fragmentShader.replace('#include <dithering_fragment>', '#include <dithering_fragment>\n\tgl_FragColor.a *= 1.0 - uInkMark;')}`;
  });
}

// Glowing things (energy, crystals, runes, shots: every unlit MeshBasicMaterial) shine brighter
// than white when GLOW is above 1, so bloom (render/PostFX.js) picks them out and nothing lit by
// the sun does. At 1 (no bloom) they look exactly as they always have.
export const GLOW = { value: 1 };
THREE.MeshBasicMaterial.prototype.onBeforeCompile = function (shader) {
  shader.uniforms.uGlow = GLOW;
  // See-through effects add up where they overlap, so they're lifted less.
  const k = this.transparent ? '(1.0 + (uGlow - 1.0) * 0.4)' : 'uGlow';
  shader.fragmentShader = 'uniform float uGlow;\n' + shader.fragmentShader.replace('#include <opaque_fragment>', `outgoingLight *= ${k};\n#include <opaque_fragment>`);
};
THREE.MeshBasicMaterial.prototype.customProgramCacheKey = function () { return this.transparent ? 'glow-t' : 'glow'; };

// Ink weight, shared by every outline: `world` for everything in the scene, `view` for the
// first-person weapon and hands. main.js sets them each frame — lighter than the old comic
// weight overall, kept constant on screen when aiming zooms the view, and thinner still on the
// held weapon (most of all down the sights).
export const INK_SCALE = { world: { value: 0.7 }, view: { value: 0.3 } };

// Pushes vertices out along view-space normals so line weight is independent of object scale.
// Works for plain, instanced and (rigid-)skinned meshes. `layer` picks the INK_SCALE it follows;
// `wind` ({ amp, base }) sways the hull with the swaying mesh it outlines; `perVertex` multiplies
// the thickness by each vertex's `inkWidth` (one shell round pieces of different weights).
export function outlineMaterial(thickness, color = INK, layer = 'world', wind = null, perVertex = false) {
  const key = `${thickness}:${color}:${layer}:${wind ? `${wind.amp}:${wind.base ?? 0}` : ''}:${perVertex ? 'v' : ''}`;
  let mat = outlineMaterials.get(key);
  if (!mat) {
    mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        { uThickness: { value: thickness }, uColor: { value: new THREE.Color(color) } },
      ]),
      fog: true,
      defines: { ...(wind ? { USE_WIND: '' } : {}), ...(perVertex ? { USE_INK_WIDTH: '' } : {}) },
      vertexShader: /* glsl */ `
        uniform float uThickness;
        uniform float uInkScale;
        #ifdef USE_INK_WIDTH
        attribute float inkWidth;
        #endif
        #include <fog_pars_vertex>
        #include <skinning_pars_vertex>
        #ifdef USE_WIND
        ${WIND_PARS}
        #endif
        void main() {
          vec3 objectNormal = vec3(normal);
          vec3 transformed = vec3(position);
          #ifdef USE_WIND
          ${windGLSL('transformed')}
          #endif
          #include <skinbase_vertex>
          #include <skinnormal_vertex>
          #include <skinning_vertex>
          vec4 local = vec4(transformed, 1.0);
          vec3 objNormal = objectNormal;
          #ifdef USE_INSTANCING
            local = instanceMatrix * local;
            objNormal = mat3(instanceMatrix) * objNormal;
          #endif
          vec4 mvPos = modelViewMatrix * local;
          vec3 n = normalize(normalMatrix * objNormal);
          #ifdef USE_INK_WIDTH
          mvPos.xyz += n * uThickness * inkWidth * uInkScale;
          #else
          mvPos.xyz += n * uThickness * uInkScale;
          #endif
          gl_Position = projectionMatrix * mvPos;
          vec4 mvPosition = mvPos;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        #include <fog_pars_fragment>
        void main() {
          gl_FragColor = vec4(uColor, 1.0);
          #include <fog_fragment>
        }`,
      side: THREE.BackSide,
    });
    mat.uniforms.uInkScale = INK_SCALE[layer];
    if (wind) {
      mat.uniforms.uWindTime = WIND.time;
      mat.uniforms.uWindStrength = WIND.strength;
      mat.uniforms.uWindAmp = { value: wind.amp };
      mat.uniforms.uWindBase = { value: wind.base ?? 0 };
    }
    mat.userData.layer = layer;
    mat.visible = outlinesVisible[layer];
    outlineMaterials.set(key, mat);
  }
  return mat;
}

// Which ink hulls are drawn (they all share the cached materials): the setting turns them all
// off; screen-space ink (render/PostFX.js) takes over the world's but not the held weapon's.
const outlinesVisible = { world: true, view: true };
export function setOutlinesVisible(v, layers = { world: v, view: v }) {
  outlinesVisible.world = !!layers.world;
  outlinesVisible.view = !!layers.view;
  for (const m of outlineMaterials.values()) m.visible = outlinesVisible[m.userData.layer];
  if (outlinesVisible.world) {
    for (const o of pendingHulls) o.geometry = smoothGeometry(o.userData.hullOf);
    pendingHulls.clear();
  }
}
// World hulls made while they aren't drawn (screen-space ink is on: Medium and High) wait for
// their welded shell until they are: welding a merged town is most of what baking it costs.
const pendingHulls = new Set();
const NO_HULL = new THREE.BufferGeometry();

// Hard-edged geometry (boxes, low-poly) has split normals that tear the hull apart;
// welding vertices and recomputing normals gives a continuous shell.
// (A shell round pieces of different weights keeps each vertex's inkWidth.)
function smoothGeometry(geo) {
  let smooth = smoothCache.get(geo);
  if (!smooth) {
    const g = geo.clone();
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'inkWidth') g.deleteAttribute(name);
    smooth = mergeVertices(g, 1e-3);
    smooth.computeVertexNormals();
    smoothCache.set(geo, smooth);
  }
  return smooth;
}

// Outline shell for skinned geometry: same welding, but keeps the bone bindings.
const hullCache = new WeakMap();
export function hullGeometry(geo) {
  let hull = hullCache.get(geo);
  if (!hull) {
    const g = geo.clone();
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'skinIndex' && name !== 'skinWeight' && name !== 'inkWidth') g.deleteAttribute(name);
    hull = mergeVertices(g, 1e-3);
    hull.computeVertexNormals();
    hullCache.set(geo, hull);
  }
  return hull;
}

// A geometry carrying `inkWidth` (render/ModelKit.js bake, pieces of one colour and several line
// weights) gets a shell whose thickness is that times `thickness`.
export function addOutline(mesh, thickness = 0.03, color = INK) {
  const lazy = !outlinesVisible.world;
  const perVertex = !!mesh.geometry.attributes.inkWidth;
  const outline = new THREE.Mesh(lazy ? NO_HULL : smoothGeometry(mesh.geometry), outlineMaterial(thickness, color, 'world', null, perVertex));
  if (lazy) {
    outline.userData.hullOf = mesh.geometry;
    pendingHulls.add(outline);
  }
  outline.castShadow = false;
  outline.receiveShadow = false;
  outline.raycast = () => {};
  mesh.add(outline);
  return outline;
}

export function toonMesh(geometry, color, { outline = 0.03, castShadow = true, receiveShadow = true } = {}) {
  const mesh = new THREE.Mesh(geometry, toonMaterial(color));
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
  if (outline > 0) addOutline(mesh, outline);
  return mesh;
}

// Instanced toon mesh + matching instanced outline, for scattering scenery cheaply. `wind`
// ({ amp, base }) sways it — and its outline and its shadow.
export function instancedToon(geometry, color, count, { outline = 0.04, castShadow = true, receiveShadow = true, wind = null } = {}) {
  const group = new THREE.Group();
  const mat = toonMaterial(color);
  const body = new THREE.InstancedMesh(geometry, wind ? addWind(mat, wind) : mat, count);
  body.castShadow = castShadow;
  body.receiveShadow = receiveShadow;
  if (wind) body.customDepthMaterial = addWind(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), wind);
  group.add(body);
  let hull = null;
  if (outline > 0) {
    hull = new THREE.InstancedMesh(smoothGeometry(geometry), outlineMaterial(outline, INK, 'world', wind), count);
    group.add(hull);
  }
  return {
    group,
    setMatrixAt(i, m) {
      body.setMatrixAt(i, m);
      hull?.setMatrixAt(i, m);
    },
    finish(used = count) {
      body.count = used;
      body.instanceMatrix.needsUpdate = true;
      body.computeBoundingSphere();
      if (hull) {
        hull.count = used;
        hull.instanceMatrix.needsUpdate = true;
        hull.computeBoundingSphere();
      }
    },
  };
}

// Unlit mesh for things that should glow / never shade (eyes, VFX).
export function flatMesh(geometry, color) {
  return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color }));
}

// Frees GPU resources of a model built with toonMesh/bake (keeps the shared outline materials).
export function disposeObject(root, { geometry = true } = {}) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    pendingHulls.delete(o);
    if (geometry && o.geometry !== NO_HULL) o.geometry.dispose();
    if (!o.material.isShaderMaterial) o.material.dispose();
    if (o.isSkinnedMesh) o.skeleton?.dispose();
  });
}
