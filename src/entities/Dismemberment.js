import * as THREE from 'three';
import { componentBoneRoot } from '../combat/HitComponents.js';
import { partRagdoll, inheritOutline } from '../anim/Ragdoll.js';

const _v = new THREE.Vector3();

// Split the already-skinned model by its bone weights. The surviving mesh loses only triangles
// belonging to the broken bone chain; those triangles go to a skinned mesh of their own, bound to
// a copy of the chain's bones, with whatever hangs on those bones (claws, armour, a weapon) — and
// fly off as a ragdoll of their own (anim/Ragdoll.js partRagdoll): an arm folds at the elbow and
// the wrist as it tumbles, lands on the ground and on props, and lies still.
export function detachComponent(enemy, id) {
  enemy.severed ??= new Set();
  if (enemy.severed.has(id)) return false;
  const names = componentBoneRoot(enemy, id);
  if (!names.length) return false;
  const skeleton = enemy.rig.skeleton;
  // Bipeds have skinned meshes; creature rigs are often ordinary meshes parented directly to
  // bones and therefore have no THREE.Skeleton at all. Both paths still share the bone subtree.
  const boneIds = new Set((skeleton?.bones ?? []).map((b, i) => names.includes(b.name) ? i : -1).filter((i) => i >= 0));
  enemy.model.updateWorldMatrix(true, true);
  const rootBone = enemy.model.getObjectByName(names[0]);
  // The chain's bones copied where they stand, and what hangs on them with them.
  const group = new THREE.Group();
  group.name = `severed:${id}`;
  const copy = rootBone?.clone(true) ?? null;
  if (copy) {
    rootBone.matrixWorld.decompose(copy.position, copy.quaternion, copy.scale);
    group.add(copy);
    copy.traverse((o) => {
      if (!o.isMesh) return;
      // (Ink shells share their geometry and material with every copy of the model.)
      if (o.material?.isShaderMaterial) { o.userData.shared = true; return; }
      o.geometry = o.geometry.clone();
      o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone();
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false;
    });
    group.updateWorldMatrix(true, true);
  }
  const copies = new Map();
  copy?.traverse((o) => { if (o.isBone) copies.set(o.name, o); });
  const meshes = [];
  enemy.model.traverse((o) => { if (o.isSkinnedMesh && o.geometry?.attributes?.skinIndex) meshes.push(o); });
  let skinned = 0;
  for (const source of meshes) {
    if (!boneIds.size) continue;
    const g = source.geometry;
    const si = g.attributes.skinIndex;
    const sw = g.attributes.skinWeight;
    const indices = g.index?.array ?? Uint32Array.from({ length: g.attributes.position.count }, (_, i) => i);
    // Each vertex's weight on the severed bones, then each triangle's: taken when it mostly is.
    const count = g.attributes.position.count;
    const on = new Float32Array(count);
    const plain = !si.isInterleavedBufferAttribute && !sw.isInterleavedBufferAttribute && !sw.normalized;
    for (let v = 0; v < count; v++) {
      for (let k = 0; k < 4; k++) {
        if (plain ? boneIds.has(si.array[v * 4 + k]) : boneIds.has(si.getComponent(v, k))) on[v] += plain ? sw.array[v * 4 + k] : sw.getComponent(v, k);
      }
    }
    const keep = [];
    const take = [];
    for (let i = 0; i + 2 < indices.length; i += 3) {
      const a = indices[i];
      const b = indices[i + 1];
      const c = indices[i + 2];
      const list = on[a] + on[b] + on[c] >= 1.35 ? take : keep;
      list.push(a, b, c);
    }
    if (!take.length) continue;
    if (!source.material.isShaderMaterial && copy) {
      const mesh = severedSkin(source, take, boneIds, copies);
      if (mesh) { group.add(mesh); skinned++; }
    }
    // Geometry is shared by cloned enemy templates; assign a per-instance filtered copy (with
    // the outline its ragdoll will want, as it was).
    const remaining = g.clone();
    remaining.setIndex(keep);
    const trimmed = { geometry: remaining };
    if (!source.material.isShaderMaterial) inheritOutline(trimmed, source);
    source.geometry = remaining;
    enemy.severedGeometry ??= new Set();
    enemy.severedGeometry.add(remaining);
  }
  // What hung on the chain on the body goes with it.
  let props = 0;
  rootBone?.traverse((source) => {
    if (!source.isMesh || source.isSkinnedMesh || !source.geometry || !source.visible) return;
    source.visible = false;
    props++;
  });
  enemy.severed.add(id);
  if (!copy || (!skinned && !props)) return true;
  enemy.game.scene.add(group);
  const forward = enemy.forward(new THREE.Vector3());
  const velocity = enemy.velocity.clone().addScaledVector(forward, 2.2).add(_v.set(0, 2.5, 0));
  // Spun: the far end flung across the way it flies.
  const spin = new THREE.Vector3(Math.random() - 0.5, 0.6, Math.random() - 0.5).normalize().multiplyScalar(2 + Math.random() * 2);
  const ragdoll = partRagdoll(group, copy, Math.max(0.5, (enemy.height ?? 2) / 2), velocity, spin);
  enemy.detachedParts ??= [];
  enemy.detachedParts.push({ group, root: copy, scale: copy.scale.clone(), ragdoll, age: 0, life: 5.5 });
  return true;
}

// The taken triangles of skinned mesh `source` as a skinned mesh of their own, on the copied
// bones (`copies`, by name): weights kept to the severed bones only, so nothing of it stays
// behind with the body.
function severedSkin(source, take, boneIds, copies) {
  const g = source.geometry;
  const remap = new Map();
  const order = [];
  for (const vi of take) if (!remap.has(vi)) { remap.set(vi, order.length); order.push(vi); }
  const geometry = new THREE.BufferGeometry();
  for (const [name, attr] of Object.entries(g.attributes)) {
    const n = attr.itemSize;
    const out = new attr.array.constructor(order.length * n);
    if (attr.isInterleavedBufferAttribute) {
      for (let k = 0; k < order.length; k++) for (let c = 0; c < n; c++) out[k * n + c] = attr.getComponent(order[k], c);
    } else {
      const src = attr.array;
      for (let k = 0; k < order.length; k++) for (let c = 0; c < n; c++) out[k * n + c] = src[order[k] * n + c];
    }
    geometry.setAttribute(name, new THREE.BufferAttribute(out, n, attr.normalized));
  }
  geometry.setIndex(take.map((vi) => remap.get(vi)));
  // The new skeleton: the severed bones' copies, bound as the originals were.
  const ids = [...boneIds].filter((i) => copies.has(source.skeleton.bones[i]?.name));
  if (!ids.length) return null;
  const index = new Map(ids.map((i, k) => [i, k]));
  const bones = ids.map((i) => copies.get(source.skeleton.bones[i].name));
  const inverses = ids.map((i) => source.skeleton.boneInverses[i].clone());
  const si = geometry.attributes.skinIndex;
  const sw = geometry.attributes.skinWeight;
  for (let v = 0; v < order.length; v++) {
    let sum = 0;
    for (let k = 0; k < 4; k++) if (index.has(si.getComponent(v, k))) sum += sw.getComponent(v, k);
    for (let k = 0; k < 4; k++) {
      const b = si.getComponent(v, k);
      const w = index.has(b) && sum > 1e-6 ? sw.getComponent(v, k) / sum : 0;
      si.setComponent(v, k, index.has(b) ? index.get(b) : 0);
      sw.setComponent(v, k, w);
    }
    if (sum <= 1e-6) sw.setComponent(v, 0, 1);
  }
  geometry.computeBoundingSphere();
  const mesh = new THREE.SkinnedMesh(geometry, source.material.clone());
  mesh.bind(new THREE.Skeleton(bones, inverses), source.bindMatrix);
  inheritOutline(mesh, source, index);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  return mesh;
}

// The parts flying and lying: each its own ragdoll, against the world as bodies are; shrinking
// away at the end of its time.
export function updateDetachedParts(enemy, dt) {
  if (!enemy.detachedParts?.length) return;
  const world = enemy.game.world;
  for (let i = enemy.detachedParts.length - 1; i >= 0; i--) {
    const p = enemy.detachedParts[i];
    p.age += dt;
    p.ragdoll.update(dt, world, (x, z) => world.groundHeight(x, z));
    const fade = Math.min(1, Math.max(0, (p.life - p.age) / 0.5));
    p.root.scale.copy(p.scale).multiplyScalar(Math.max(0.001, fade));
    if (p.age < p.life) continue;
    removeDetachedPart(enemy, p);
    enemy.detachedParts.splice(i, 1);
  }
}

// Takes a part out of the world and lets go of what it alone holds (geometry, materials and the
// skeleton's bone texture).
export function removeDetachedPart(enemy, p) {
  enemy.game.scene.remove(p.group);
  p.group.traverse((o) => {
    if (o.isSkinnedMesh) o.skeleton?.dispose();
    if (o.userData.shared) return;
    o.geometry?.dispose();
    o.material?.dispose?.();
  });
}
