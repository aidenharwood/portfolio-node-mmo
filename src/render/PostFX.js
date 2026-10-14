// Post-processing: what the picture goes through after the scene is drawn, by quality
// (render/Quality.js). Everything here works from the one drawing of the scene — its colour and
// its depth — so none of it draws the scene again.
//   ink    screen-space outlines where depth jumps (silhouettes), thin and fading with distance.
//          They replace the world's inverted-hull outlines (render/Toon.js); the first-person
//          weapon keeps its own hull ink.
//   AO     a light ambient occlusion from the depth, at half resolution: creases, contact under
//          feet, rocks set into the ground.
//   bloom  a soft halo round glowing things. Toon.js GLOW lifts unlit materials a little past
//          white, so only they reach the threshold; they're brought back into range keeping their
//          hue (KeepHue), so they don't bleach.
//   speed  the zoom blur and comic speed lines, scaled by how fast you're moving.
// Surfaces that write alpha 0 (render/Toon.js noInk: grass blades, the held weapon) get no ink or
// AO and don't make ink round them (they only write it while the ink pass runs: Toon.js
// INK_MARK). At low quality the scene goes straight to the screen (with
// the hull ink), through the chain only while the speed effect shows.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { GLOW, INK, INK_MARK } from './Toon.js';
import { SURFACES } from './Surfaces.js';

const BLOOM = { strength: 0.22, radius: 0.15, threshold: 1.0 };
const GLOW_LIFT = 1.5;      // how far past white glowing things go (when bloom is on)
const INK_OPACITY = 0.8;
const AO_STRENGTH = 0.3;

// ---------------------------------------------------------------- speed lines
const SpeedShader = {
  uniforms: {
    tDiffuse: { value: null },
    uStrength: { value: 0 },
    uTime: { value: 0 },
    uCenter: { value: new THREE.Vector2(0.5, 0.5) },
    uAspect: { value: 1 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uStrength;
    uniform float uTime;
    uniform vec2 uCenter;
    uniform float uAspect;
    varying vec2 vUv;
    float hash(float n) { return fract(sin(n) * 43758.5453123); }
    void main() {
      vec2 d = vUv - uCenter;
      float r = length(d * vec2(uAspect, 1.0));
      // Zoom blur: samples pulled toward the vanishing point, none at the focus, most at the edges.
      float blur = uStrength * 0.09 * smoothstep(0.06, 0.8, r);
      vec4 col = vec4(0.0);
      for (int i = 0; i < 12; i++) {
        float k = float(i) / 11.0;
        col += texture2D(tDiffuse, vUv - d * blur * k);
      }
      col /= 12.0;
      // Comic speed lines radiating from the vanishing point, re-rolled ~16 times a second.
      float ang = atan(d.y, d.x * uAspect);
      float a = (ang / 6.2831853 + 0.5) * 120.0;
      float id = floor(a);
      float tick = floor(uTime * 16.0);
      float on = step(1.0 - 0.32 * uStrength, hash(id * 13.7 + tick * 3.1));
      float w = 0.06 + 0.16 * hash(id * 7.3 + tick);
      float line = on * smoothstep(w, 0.0, abs(fract(a) - 0.5));
      float reach = mix(0.95, 0.45, uStrength) + 0.18 * hash(id * 3.9 + tick * 1.7);
      line *= smoothstep(reach, reach + 0.3, r);
      col.rgb = mix(col.rgb, vec3(1.0), line * 0.55 * min(1.0, uStrength * 1.5));
      col.rgb *= 1.0 - 0.2 * uStrength * smoothstep(0.55, 1.25, r);
      gl_FragColor = col;
    }`,
};

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// ---------------------------------------------------------------- ink and ambient occlusion
const QUAD_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

const AO_SAMPLES = 8;
function aoKernel() {
  const out = [];
  for (let i = 0; i < AO_SAMPLES; i++) {
    const a = (i / AO_SAMPLES) * Math.PI * 2 * 2.618;
    const z = 0.3 + 0.7 * ((i * 5) % AO_SAMPLES) / AO_SAMPLES;
    const r = Math.sqrt(1 - z * z);
    const s = 0.3 + 0.7 * ((i + 1) / AO_SAMPLES) ** 2;
    out.push(new THREE.Vector3(Math.cos(a) * r * s, Math.sin(a) * r * s, z * s));
  }
  return out;
}

const AOShader = {
  uniforms: {
    tColor: { value: null },
    tDepth: { value: null },
    uProj: { value: new THREE.Matrix4() },
    uProjInv: { value: new THREE.Matrix4() },
    uRadius: { value: 0.8 },
    uKernel: { value: aoKernel() },
  },
  vertexShader: QUAD_VERTEX,
  fragmentShader: /* glsl */ `
    uniform sampler2D tColor;
    uniform sampler2D tDepth;
    uniform mat4 uProj;
    uniform mat4 uProjInv;
    uniform float uRadius;
    uniform vec3 uKernel[${AO_SAMPLES}];
    varying vec2 vUv;
    vec3 viewPos(vec2 uv, float depth) {
      vec4 v = uProjInv * vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
      return v.xyz / v.w;
    }
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      float d = texture2D(tDepth, vUv).x;
      if (d >= 1.0 || texture2D(tColor, vUv).a < 0.5) { gl_FragColor = vec4(1.0); return; }
      vec3 P = viewPos(vUv, d);
      // The surface's facing, from how its position changes across the screen.
      vec3 N = normalize(cross(dFdx(P), dFdy(P)));
      float a = hash(gl_FragCoord.xy) * 6.2831853;
      vec3 rnd = vec3(cos(a), sin(a), 0.0);
      vec3 T = normalize(rnd - N * dot(rnd, N));
      vec3 B = cross(N, T);
      float radius = uRadius * clamp(-P.z / 12.0, 0.6, 2.0);
      float occ = 0.0;
      for (int i = 0; i < ${AO_SAMPLES}; i++) {
        vec3 k = uKernel[i];
        vec3 S = P + (T * k.x + B * k.y + N * k.z) * radius;
        vec4 c = uProj * vec4(S, 1.0);
        vec2 suv = c.xy / c.w * 0.5 + 0.5;
        float sz = viewPos(suv, texture2D(tDepth, suv).x).z;
        float near = smoothstep(0.0, 1.0, radius / max(abs(P.z - sz), 1e-3));
        occ += (sz >= S.z + 0.05 ? 1.0 : 0.0) * near;
      }
      gl_FragColor = vec4(vec3(1.0 - occ / float(${AO_SAMPLES})), 1.0);
    }`,
};

const CompositeShader = {
  uniforms: {
    tDiffuse: { value: null },
    tDepth: { value: null },
    tAO: { value: null },
    uTexel: { value: new THREE.Vector2() },
    uAOTexel: { value: new THREE.Vector2() },
    uThick: { value: 1 },
    cameraNear: { value: 0.1 },
    cameraFar: { value: 400 },
    uInk: { value: new THREE.Color(INK) },
    uInkOn: { value: 1 },
    uInkOpacity: { value: INK_OPACITY },
    uAOOn: { value: 0 },
    uAOStrength: { value: AO_STRENGTH },
    uFadeNear: { value: 80 },
    uFadeFar: { value: 240 },
  },
  vertexShader: QUAD_VERTEX,
  fragmentShader: /* glsl */ `
    #include <packing>
    uniform sampler2D tDiffuse;
    uniform sampler2D tDepth;
    uniform sampler2D tAO;
    uniform vec2 uTexel;
    uniform vec2 uAOTexel;
    uniform float uThick;
    uniform float cameraNear;
    uniform float cameraFar;
    uniform vec3 uInk;
    uniform float uInkOn;
    uniform float uInkOpacity;
    uniform float uAOOn;
    uniform float uAOStrength;
    uniform float uFadeNear;
    uniform float uFadeFar;
    varying vec2 vUv;
    float dist(vec2 uv) { return -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, cameraNear, cameraFar); }
    void main() {
      vec4 col = texture2D(tDiffuse, vUv);
      if (col.a < 0.5) { gl_FragColor = vec4(col.rgb, 1.0); return; } // grass, the held weapon
      float z = dist(vUv);
      vec2 o = uTexel * uThick;
      vec2 offs[4] = vec2[4](vec2(o.x, 0.0), vec2(-o.x, 0.0), vec2(0.0, o.y), vec2(0.0, -o.y));
      // Silhouettes: the second difference of distance (flat ground, however steeply seen, has
      // none), positive only on the near side, so the line sits on the thing in front — which
      // also means grass behind someone outlines them, while grass itself never gets a line.
      float lap = -4.0 * z;
      for (int i = 0; i < 4; i++) lap += dist(vUv + offs[i]);
      float fade = 1.0 - smoothstep(uFadeNear * 0.5, uFadeFar * 0.85, z);
      float ink = smoothstep(0.06, 0.14, lap / z) * fade * uInkOn * uInkOpacity;
      if (uAOOn > 0.5) {
        float ao = 0.25 * (texture2D(tAO, vUv + uAOTexel * vec2(0.5, 0.5)).r + texture2D(tAO, vUv + uAOTexel * vec2(-0.5, 0.5)).r
          + texture2D(tAO, vUv + uAOTexel * vec2(0.5, -0.5)).r + texture2D(tAO, vUv + uAOTexel * vec2(-0.5, -0.5)).r);
        col.rgb *= mix(1.0, ao, uAOStrength * fade);
      }
      col.rgb = mix(col.rgb, uInk, ink);
      gl_FragColor = vec4(col.rgb, 1.0);
    }`,
};

// Glows are past white (so bloom finds them); brought back in range as a whole — keeping their
// hue — rather than channel by channel, which would bleach them towards white.
const KeepHueShader = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: QUAD_VERTEX,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      c.rgb /= max(1.0, max(c.r, max(c.g, c.b)));
      gl_FragColor = c;
    }`,
};

class InkPass extends Pass {
  constructor(camera, scene) {
    super();
    this.camera = camera;
    this.scene = scene;
    this.ink = true;
    this.ao = false;
    this.aoRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.UnsignedByteType });
    this.aoQuad = new FullScreenQuad(new THREE.ShaderMaterial(AOShader));
    this.quad = new FullScreenQuad(new THREE.ShaderMaterial(CompositeShader));
  }

  setSize(w, h) {
    this.aoRT.setSize(Math.max(1, w >> 1), Math.max(1, h >> 1));
    const u = this.quad.material.uniforms;
    u.uTexel.value.set(1 / w, 1 / h);
    u.uAOTexel.value.set(2 / w, 2 / h);
  }

  render(renderer, writeBuffer, readBuffer) {
    const cam = this.camera;
    const depth = readBuffer.depthTexture;
    if (this.ao) {
      const a = this.aoQuad.material.uniforms;
      a.tColor.value = readBuffer.texture;
      a.tDepth.value = depth;
      a.uProj.value.copy(cam.projectionMatrix);
      a.uProjInv.value.copy(cam.projectionMatrixInverse);
      renderer.setRenderTarget(this.aoRT);
      this.aoQuad.render(renderer);
    }
    const u = this.quad.material.uniforms;
    u.tDiffuse.value = readBuffer.texture;
    u.tDepth.value = depth;
    u.tAO.value = this.aoRT.texture;
    u.cameraNear.value = cam.near;
    u.cameraFar.value = cam.far;
    u.uInkOn.value = this.ink ? 1 : 0;
    u.uAOOn.value = this.ao ? 1 : 0;
    u.uThick.value = Math.max(1, renderer.getPixelRatio());
    if (this.scene.fog) {
      u.uFadeNear.value = this.scene.fog.near;
      u.uFadeFar.value = this.scene.fog.far;
    }
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }

  dispose() {
    this.aoRT.dispose();
    this.aoQuad.dispose();
    this.quad.dispose();
  }
}

// ---------------------------------------------------------------- the chain
const _v = new THREE.Vector3();
const _p = new THREE.Vector3();

export class PostFX {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.quality = null;
    this.strength = 0;
    this.time = 0;
    this.speedEnabled = true;
    this.composer = null;
  }

  // (Re)builds the chain for a quality preset (render/Quality.js) and the player's settings.
  configure(q, { outlines = true } = {}) {
    const msaa = q.msaa ?? 0;
    if (!this.composer || this.msaa !== msaa) {
      this.composer?.dispose();
      this.ink?.dispose();
      this.bloom?.dispose();
      const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
      const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: msaa, depthTexture: new THREE.DepthTexture(size.x, size.y) });
      this.composer = new EffectComposer(this.renderer, rt);
      // The composer's second buffer is a clone, and a cloned depth texture shares its source,
      // which three makes one GPU texture for both. Multisampled, depth lands in a renderbuffer
      // first so that never matters; without (phones) the ink pass would read the very depth it
      // draws into, which WebGL refuses: a black screen. So each buffer gets its own.
      this.composer.renderTarget2.depthTexture = new THREE.DepthTexture(size.x, size.y);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.ink = new InkPass(this.camera, this.scene);
      this.composer.addPass(this.ink);
      this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), BLOOM.strength, BLOOM.radius, BLOOM.threshold);
      this.composer.addPass(this.bloom);
      this.keepHue = new ShaderPass(KeepHueShader);
      this.composer.addPass(this.keepHue);
      this.speed = new ShaderPass(SpeedShader);
      this.composer.addPass(this.speed);
      this.composer.addPass(new OutputPass());
      this.msaa = msaa;
      this.resize();
    }
    this.quality = q;
    this.ink.ink = q.ink && outlines;
    this.ink.ao = q.ao;
    GLOW.value = q.bloom ? GLOW_LIFT : 1;
    SURFACES.value = q.surfaces ? 1 : 0;
  }

  resize() {
    const el = document.documentElement;
    this.setSize(el.clientWidth || window.innerWidth, el.clientHeight || window.innerHeight);
  }

  setSize(w, h) {
    if (!this.composer) return;
    const r = this.renderer.getPixelRatio();
    this.composer.setPixelRatio(r);
    this.composer.setSize(w, h);
    this.ink.setSize(Math.round(w * r), Math.round(h * r));
    this.speed.uniforms.uAspect.value = w / h;
  }

  render(dt, game) {
    const p = game.player;
    _v.set(p.velocity.x, p.vy, p.velocity.z);
    const speed = _v.length();
    let target = smoothstep(12, 32, speed);
    if (p.bulletJumpT > 0) target = Math.max(target, 0.55);
    if (p.state === 'airdash') target = Math.max(target, 0.5);
    if (p.state === 'dodge') target = Math.max(target, 0.3); // the ground dash
    if (p.state === 'slam') target = Math.max(target, 0.7);
    if (game.state !== 'playing' || !this.speedEnabled || game.prefs?.motionFX === false) target = 0;
    this.strength += (target - this.strength) * (1 - Math.exp(-7 * dt));
    const moving = this.strength >= 0.01;
    const post = !!this.quality?.post;
    // Nothing to add: straight to the screen.
    if (!moving && !post) {
      INK_MARK.value = 0;
      this.renderer.render(this.scene, this.camera);
      return;
    }
    this.speed.enabled = moving;
    if (moving) {
      this.time += dt;
      const u = this.speed.uniforms;
      u.uStrength.value = this.strength;
      u.uTime.value = this.time;
      // Vanishing point: where the direction of travel lands on screen (centre if it's behind us).
      if (speed > 0.5) {
        _p.copy(this.camera.position).addScaledVector(_v.normalize(), 30).project(this.camera);
        const behind = _p.z > 1 || _p.z < -1;
        const cx = behind ? 0.5 : Math.min(0.85, Math.max(0.15, (_p.x + 1) / 2));
        const cy = behind ? 0.5 : Math.min(0.85, Math.max(0.15, (_p.y + 1) / 2));
        u.uCenter.value.x += (cx - u.uCenter.value.x) * Math.min(1, dt * 10);
        u.uCenter.value.y += (cy - u.uCenter.value.y) * Math.min(1, dt * 10);
      }
    }
    this.ink.enabled = post && (this.ink.ink || this.ink.ao);
    this.bloom.enabled = post && this.quality.bloom;
    this.keepHue.enabled = this.bloom.enabled;
    INK_MARK.value = this.ink.enabled ? 1 : 0;
    this.composer.render(dt);
  }
}
