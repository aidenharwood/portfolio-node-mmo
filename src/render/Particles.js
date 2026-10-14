// GPU particles (docs/GRAPHICS_PLAN.md G3): two pooled systems, each one instanced draw however
// many particles are alive, moved entirely in the vertex shader from where and how fast each was
// launched (gravity and drag in closed form), so the CPU only writes a particle once, when it's born.
//   glow:  additive light — soft glows, star flares, rings, sparks stretched along their screen
//          motion, flickering embers, motes.
//   solid: cel-shaded impostors that write depth and take the ink — smoke puffs (round, banded,
//          an ink rim), stone chips, splinters, goo drops, crystal shards, leaves, snowflakes — that
//          dissolve away in a dither rather than going see-through, so they need no sorting.
// Shapes are drawn in the shader (no textures), crisp like the rest of the comic look.
import * as THREE from 'three';
import { GLOW, INK } from './Toon.js';

export const GLOW_KIND = { soft: 0, star: 1, ring: 2, spark: 3, ember: 4, mote: 5 };
export const SOLID_KIND = { puff: 0, chip: 1, drop: 2, leaf: 3, flake: 4, shard: 5, splinter: 6 };

const QUAD = new THREE.PlaneGeometry(1, 1);
const _c = new THREE.Color();
const _s = new THREE.Vector3();

// Where each particle is at `age`: launched from aPos at aVel, slowed by drag (aTime.w) and pulled
// down by gravity (aTime.z) — the closed form for linear drag.
const MOTION = /* glsl */ `
  attribute vec3 aPos;
  attribute vec3 aVel;
  attribute vec4 aTime;   // born, life, gravity, drag
  attribute vec4 aSize;   // size at birth, size at death, turn, spin
  attribute vec4 aCol0;   // colour at birth (+ alpha / glow)
  attribute vec4 aCol1;   // colour at death
  attribute vec4 aExtra;  // kind, length (sparks), dissolve from (0..1), seed
  uniform float uTime;
  varying vec2 vUv;
  varying vec4 vCol;
  varying float vKind;
  varying float vK;
  varying float vSeed;
  varying float vFade;
  float age() { return uTime - aTime.x; }
  vec3 travel(float t, out vec3 vel) {
    float d = aTime.w;
    float g = aTime.z;
    float e = exp(-d * t);
    float f = d > 1e-3 ? (1.0 - e) / d : t;
    vec3 p = aPos + aVel * f;
    // Gravity under drag: falls toward its terminal speed.
    float fall = d > 1e-3 ? g * (t - f) / d : 0.5 * g * t * t;
    p.y -= fall;
    vel = aVel * e;
    vel.y -= d > 1e-3 ? g * (1.0 - e) / d : g * t;
    return p;
  }
`;

const GLOW_VERT = /* glsl */ `
  ${MOTION}
  #include <fog_pars_vertex>
  void main() {
    float t = age();
    float life = aTime.y;
    if (t < 0.0 || t > life) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
    float k = t / life;
    vec3 vel;
    vec3 p = travel(t, vel);
    float size = mix(aSize.x, aSize.y, k);
    vec4 mv = viewMatrix * vec4(p, 1.0);
    vec2 corner = position.xy;
    if (aExtra.x > 2.5 && aExtra.x < 3.5) {
      // A spark: stretched along where it's going on screen, longer the faster it flies.
      vec4 ahead = viewMatrix * vec4(p + vel * 0.03, 1.0);
      vec2 dir = ahead.xy / max(-ahead.z, 0.01) - mv.xy / max(-mv.z, 0.01);
      float l = length(dir);
      dir = l > 1e-5 ? dir / l : vec2(1.0, 0.0);
      float len = aExtra.y * (0.4 + min(1.5, length(vel) * 0.08)) * (1.0 - k * 0.5);
      mv.xy += dir * corner.x * len + vec2(-dir.y, dir.x) * corner.y * size;
    } else {
      float a = aSize.z + aSize.w * t;
      mv.xy += mat2(cos(a), sin(a), -sin(a), cos(a)) * corner * size;
    }
    gl_Position = projectionMatrix * mv;
    vUv = uv;
    vCol = mix(aCol0, aCol1, k);
    vKind = aExtra.x;
    vK = k;
    vSeed = aExtra.w;
    vec4 mvPosition = mv;
    #include <fog_vertex>
  }
`;

const GLOW_FRAG = /* glsl */ `
  uniform float uGlow;
  varying vec2 vUv;
  varying vec4 vCol;
  varying float vKind;
  varying float vK;
  varying float vSeed;
  #include <fog_pars_fragment>
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    int kind = int(vKind + 0.5);
    float a;
    if (kind == 1) {        // star flare: a hot core and four arms
      float arms = max(exp(-abs(p.x) * 14.0) * (1.0 - abs(p.y)), exp(-abs(p.y) * 14.0) * (1.0 - abs(p.x)));
      a = max(pow(max(0.0, 1.0 - r), 2.0), arms);
    } else if (kind == 2) { // ring
      a = 1.0 - smoothstep(0.0, 0.14, abs(r - 0.78));
    } else if (kind == 3) { // spark: bright head, tapering tail
      float across = 1.0 - smoothstep(0.35, 1.0, abs(p.y));
      a = across * smoothstep(-1.0, 0.7, p.x) * (1.0 - smoothstep(0.85, 1.0, p.x));
    } else if (kind == 4) { // ember: a hard hot dot that flickers
      a = (1.0 - smoothstep(0.25, 0.55, r)) * (0.65 + 0.35 * sin(vK * 40.0 + vSeed * 30.0));
    } else {                // soft glow, mote
      a = pow(max(0.0, 1.0 - r), kind == 5 ? 2.5 : 1.6);
    }
    a *= vCol.a;
    if (a < 0.004) discard;
    gl_FragColor = vec4(vCol.rgb * (1.0 + (uGlow - 1.0) * 0.4), a);
    #include <fog_fragment>
  }
`;

const SOLID_VERT = /* glsl */ `
  ${MOTION}
  #include <fog_pars_vertex>
  varying float vTurn;
  void main() {
    float t = age();
    float life = aTime.y;
    if (t < 0.0 || t > life) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
    float k = t / life;
    vec3 vel;
    vec3 p = travel(t, vel);
    float size = mix(aSize.x, aSize.y, k);
    vec4 mv = viewMatrix * vec4(p, 1.0);
    vTurn = aSize.z + aSize.w * t;
    mv.xy += position.xy * size;
    gl_Position = projectionMatrix * mv;
    vUv = uv;
    vCol = mix(aCol0, aCol1, k);
    vKind = aExtra.x;
    vK = k;
    vSeed = aExtra.w;
    vFade = aExtra.z;
    vec4 mvPosition = mv;
    #include <fog_vertex>
  }
`;

const SOLID_FRAG = /* glsl */ `
  uniform vec3 uSun;     // toward the sun, in view space
  uniform vec3 uInk;
  varying vec2 vUv;
  varying vec4 vCol;
  varying float vKind;
  varying float vK;
  varying float vSeed;
  varying float vFade;
  varying float vTurn;
  #include <fog_pars_fragment>
  float dHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  void main() {
    vec2 q = vUv * 2.0 - 1.0;
    vec2 p = mat2(cos(vTurn), sin(vTurn), -sin(vTurn), cos(vTurn)) * q;
    int kind = int(vKind + 0.5);
    float edge;          // 0 at the middle, 1 at the outline
    vec3 n;
    if (kind == 1 || kind == 5) {  // a stone chip or a crystal shard: faceted
      vec2 s = kind == 5 ? vec2(0.55, 1.0) : vec2(0.9, 0.75);
      edge = abs(p.x) / s.x + abs(p.y) / s.y;
      n = normalize(vec3(sign(p.x) * 0.6, sign(p.y) * 0.5, 1.0));
    } else if (kind == 2) {        // a drop, pointed upward
      vec2 d = vec2(p.x, p.y + 0.25);
      edge = length(d * vec2(1.0, 0.8)) + max(0.0, p.y) * 0.45;
      n = normalize(vec3(d * 1.2, 1.0));
    } else if (kind == 3) {        // a leaf
      edge = length(p * vec2(1.0, 2.1));
      n = vec3(0.0, 0.0, 1.0);
    } else if (kind == 6) {        // a splinter
      edge = max(abs(p.x) / 0.22, abs(p.y));
      n = normalize(vec3(sign(p.x) * 0.5, 0.0, 1.0));
    } else {                        // a puff or a flake: round
      edge = length(p);
      n = vec3(q, sqrt(max(0.0, 1.0 - dot(q, q))));
    }
    if (edge > 1.0) discard;
    // Dissolve: a dither eats it away from where it starts to fade.
    float fade = clamp((vK - vFade) / max(1e-3, 1.0 - vFade), 0.0, 1.0);
    if (dHash(floor(gl_FragCoord.xy * 0.5) + vSeed * 97.0) < fade) discard;
    vec3 col = vCol.rgb;
    // Banded light from the sun, shadows leaning cool.
    float l = dot(n, uSun);
    float band = l > 0.35 ? 1.0 : l > -0.15 ? 0.74 : 0.52;
    vec3 lit = col * band * mix(vec3(0.86, 0.9, 1.1), vec3(1.0), step(0.5, band));
    // Glowing (fresh fire, hot slag): unlit, by vCol.a.
    col = mix(lit, col * 1.15, clamp(vCol.a, 0.0, 1.0));
    if (kind == 3) col *= 1.0 - 0.3 * (1.0 - smoothstep(0.0, 0.06, abs(p.x)));
    // Ink round the edge.
    float rim = kind == 4 ? 2.0 : 0.82;
    col = mix(col, uInk, step(rim, edge));
    gl_FragColor = vec4(col, 1.0);
    #include <fog_fragment>
  }
`;

export class ParticleSystem {
  constructor(scene, { capacity = 4096, solid = false } = {}) {
    this.capacity = capacity;
    this.next = 0;
    this.time = 0;
    this.lo = Infinity;
    this.hi = -1;
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = QUAD.index;
    geo.setAttribute('position', QUAD.attributes.position);
    geo.setAttribute('uv', QUAD.attributes.uv);
    const attr = (name, size) => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(capacity * size), size);
      a.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute(name, a);
      return a;
    };
    this.a = { pos: attr('aPos', 3), vel: attr('aVel', 3), time: attr('aTime', 4), size: attr('aSize', 4), c0: attr('aCol0', 4), c1: attr('aCol1', 4), extra: attr('aExtra', 4) };
    for (let i = 0; i < capacity; i++) { this.a.time.array[i * 4] = -1e9; this.a.time.array[i * 4 + 1] = 1; }
    geo.instanceCount = capacity;
    this.uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uSun: { value: new THREE.Vector3(0, 1, 0) }, uInk: { value: new THREE.Color(INK) } }]);
    this.uniforms.uGlow = GLOW;
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: solid ? SOLID_VERT : GLOW_VERT,
      fragmentShader: solid ? SOLID_FRAG : GLOW_FRAG,
      fog: true,
      transparent: !solid,
      depthWrite: solid,
      blending: solid ? THREE.NormalBlending : THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = solid ? 0 : 5;
    scene.add(this.mesh);
    this.live = 0;
  }

  /**
   * One particle. pos, vel: Vector3-likes. color / to: hex or Color (to defaults to color).
   * alpha (glow: opacity; solid: how much it glows unlit) at birth and death (alphaTo).
   */
  emit(pos, vel, { life = 0.5, gravity = 0, drag = 0, size = 0.3, sizeTo = size, turn = Math.random() * 6.283, spin = 0, color = 0xffffff, to = color, alpha = 1, alphaTo = 0, kind = 0, length = 0.5, fade = 0.6 } = {}) {
    const i = this.next;
    this.next = (i + 1) % this.capacity;
    const A = this.a;
    A.pos.array.set([pos.x, pos.y, pos.z], i * 3);
    A.vel.array.set([vel.x, vel.y, vel.z], i * 3);
    A.time.array.set([this.time, life, gravity, drag], i * 4);
    A.size.array.set([size, sizeTo, turn, spin], i * 4);
    _c.set(color);
    A.c0.array.set([_c.r, _c.g, _c.b, alpha], i * 4);
    _c.set(to);
    A.c1.array.set([_c.r, _c.g, _c.b, alphaTo], i * 4);
    A.extra.array.set([kind, length, fade, Math.random()], i * 4);
    if (i < this.lo) this.lo = i;
    if (i > this.hi) this.hi = i;
  }

  update(dt, camera = null, sunDir = null) {
    this.time += dt;
    this.uniforms.uTime.value = this.time;
    if (camera && sunDir) this.uniforms.uSun.value.copy(sunDir).transformDirection(camera.matrixWorldInverse);
    if (this.hi >= 0) {
      for (const a of Object.values(this.a)) {
        a.addUpdateRange(this.lo * a.itemSize, (this.hi - this.lo + 1) * a.itemSize);
        a.needsUpdate = true;
      }
      this.lo = Infinity;
      this.hi = -1;
    }
  }

  // Everything gone at once (a new map, a dungeon).
  clear() {
    const t = this.a.time.array;
    for (let i = 0; i < this.capacity; i++) t[i * 4] = -1e9;
    this.a.time.addUpdateRange(0, t.length);
    this.a.time.needsUpdate = true;
  }
}

// A random direction, mostly upward by `up` (0 level … 1 straight up), as a Vector3 into `out`.
export function spray(out, up = 0.4, speed = 1) {
  _s.set(Math.random() - 0.5, Math.random() * up + (1 - up) * (Math.random() - 0.3), Math.random() - 0.5).normalize();
  return out.copy(_s).multiplyScalar(speed);
}
