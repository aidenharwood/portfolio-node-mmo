// Renders weapon models to small images for inventory tiles and loot cards (cached per weapon).
import * as THREE from 'three';
import { buildItemModel, isArmor } from '../items/items.js';

const SIZE = 128;

export class Thumbnails {
  constructor() {
    this.cache = new Map();
    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      this.renderer.setSize(SIZE, SIZE);
      this.renderer.setPixelRatio(1);
    } catch {
      this.renderer = null;
    }
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.4));
    const sun = new THREE.DirectionalLight(0xffffff, 2.4);
    sun.position.set(2, 3, 4);
    this.scene.add(sun);
    this.camera = new THREE.PerspectiveCamera(28, 1, 0.01, 50);
  }

  get(weapon) {
    if (!this.renderer) return '';
    if (this.cache.has(weapon.uid)) return this.cache.get(weapon.uid);

    const model = buildItemModel(weapon);
    const holder = new THREE.Group();
    // Present each class side-on: blades/staves flat to camera, guns in profile, tomes face-up.
    if (isArmor(weapon)) model.rotation.set(0.25, -0.5, 0);
    else if (weapon.cls === 'ranged') model.rotation.y = Math.PI / 2;
    else if (weapon.type === 'tome') model.rotation.x = Math.PI / 2 - 0.4;
    else model.rotation.x = -Math.PI / 2;
    holder.add(model);
    holder.rotation.z = isArmor(weapon) ? 0 : weapon.cls === 'ranged' ? 0.12 : weapon.type === 'tome' || weapon.type === 'orb' ? 0 : -Math.PI / 4;
    this.scene.add(holder);

    const box = new THREE.Box3().setFromObject(holder);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const fit = Math.max(size.x, size.y) / (2 * Math.tan((this.camera.fov * Math.PI) / 360)) * 1.15;
    this.camera.position.set(center.x, center.y, center.z + fit + size.z);
    this.camera.lookAt(center);
    this.renderer.render(this.scene, this.camera);
    const url = this.renderer.domElement.toDataURL();
    this.scene.remove(holder);
    holder.traverse((o) => {
      if (o.isMesh) {
        o.geometry.dispose();
        if (!o.material.isShaderMaterial) o.material.dispose();
      }
    });
    this.cache.set(weapon.uid, url);
    return url;
  }
}
