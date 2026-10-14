// Sun shadows, by quality: off; one shadow map that follows the player (90 m across — the world's
// own sun, world/World.js); or cascades (three's CSM): a sharp map close in and a coarser one out
// to 130 m, so distant trees and buildings throw shadows too.
// Cascades light the scene with their own suns, so every lit material they reach must know about
// them. Materials are set up the first time they're seen in the scene (models built for other
// renderers, like inventory thumbnails, never are), their own shader hooks are kept, and switching
// cascades off puts every one back as it was.
import * as THREE from 'three';
import { CSM } from 'three/addons/csm/CSM.js';

const isLit = (m) => !!m && (m.isMeshToonMaterial || m.isMeshStandardMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial);
const SUN_DIR = new THREE.Vector3(-18, -34, -12).normalize(); // as World.update places its sun
// Two cascades: a sharp map close in and a coarse one out to 130 m. (Each one draws every shadow
// caster again, so a third cost more than it showed.)
const CASCADES = 2;
const SHADOW_MAP_SIZE = { low: 1024, medium: 1536, high: 2048 };

export class Shadows {
  constructor(game) {
    this.game = game;
    this.csm = null;
    this.quality = 'high';
    this.saved = new Map(); // material → its own hook and program key, to put back
    this.forget = (e) => this.release(e.target, false);
  }

  // 'off' | 'single' | 'cascaded'
  setMode(mode) {
    if (mode === 'cascaded' && !this.csm) this.start();
    else if (mode !== 'cascaded' && this.csm) this.stop();
  }

  start() {
    const g = this.game;
    const sun = g.world.sun;
    this.csm = new CSM({
      camera: g.camera, parent: g.scene, cascades: CASCADES, maxFar: 130, mode: 'practical', shadowMapSize: SHADOW_MAP_SIZE[this.quality],
      lightDirection: SUN_DIR.clone(), lightIntensity: sun.intensity, lightMargin: 80, shadowBias: -0.0004,
    });
    this.csm.fade = true;
    for (const l of this.csm.lights) {
      l.color.copy(sun.color);
      l.shadow.normalBias = 0.04;
    }
    sun.visible = false;
    this.fov = null;
  }

  setQuality(name) {
    const quality = SHADOW_MAP_SIZE[name] ? name : 'high';
    if (quality === this.quality) return;
    this.quality = quality;
    const size = SHADOW_MAP_SIZE[quality];
    const update = (light) => {
      const shadow = light?.shadow;
      if (!shadow || shadow.mapSize.x === size && shadow.mapSize.y === size) return;
      shadow.map?.dispose();
      shadow.map = null;
      shadow.mapSize.set(size, size);
    };
    update(this.game.world.sun);
    for (const light of this.csm?.lights ?? []) update(light);
  }

  stop() {
    const csm = this.csm;
    this.csm = null;
    csm.remove();
    for (const l of csm.lights) l.shadow.map?.dispose();
    for (const m of [...this.saved.keys()]) this.release(m, true);
    this.game.world.sun.visible = true;
  }

  setup(m) {
    const own = {
      hook: Object.hasOwn(m, 'onBeforeCompile') ? m.onBeforeCompile : undefined,
      key: Object.hasOwn(m, 'customProgramCacheKey') ? m.customProgramCacheKey : undefined,
    };
    const prevHook = m.onBeforeCompile;
    const prevKey = m.customProgramCacheKey;
    this.csm.setupMaterial(m);
    const csmHook = m.onBeforeCompile;
    m.onBeforeCompile = function (shader, renderer) {
      prevHook.call(this, shader, renderer);
      csmHook.call(this, shader, renderer);
    };
    m.customProgramCacheKey = () => `${prevKey.call(m)}|csm`;
    m.addEventListener('dispose', this.forget);
    this.saved.set(m, own);
    m.needsUpdate = true;
  }

  // Back as it was (`restore`), or just forgotten (a material being thrown away).
  release(m, restore) {
    const own = this.saved.get(m);
    if (!own) return;
    this.saved.delete(m);
    this.csm?.shaders.delete(m);
    m.removeEventListener('dispose', this.forget);
    if (!restore) return;
    delete m.defines.USE_CSM;
    delete m.defines.CSM_CASCADES;
    delete m.defines.CSM_FADE;
    if (own.hook) m.onBeforeCompile = own.hook;
    else delete m.onBeforeCompile;
    if (own.key) m.customProgramCacheKey = own.key;
    else delete m.customProgramCacheKey;
    m.needsUpdate = true;
  }

  // Each frame, before drawing: the cascades follow the camera, and anything newly in the scene is
  // set up for them.
  update() {
    const csm = this.csm;
    if (!csm) return;
    const cam = this.game.camera;
    if (cam.fov !== this.fov || cam.aspect !== this.aspect) {
      this.fov = cam.fov;
      this.aspect = cam.aspect;
      csm.updateFrustums();
    }
    this.game.scene.traverseVisible((o) => {
      const m = o.material;
      if (isLit(m) && !this.saved.has(m)) this.setup(m);
    });
    csm.update();
  }
}
