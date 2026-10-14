import * as THREE from 'three';
import { componentBoneRoot } from '../combat/HitComponents.js';

const _v = new THREE.Vector3();

// Split the already-skinned model by its bone weights. The surviving mesh loses only triangles
// belonging to the broken bone chain; those triangles are baked at their animated pose into a
// free mesh and kicked into the world as short-lived debris.
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
  const debrisParts = [];
  const detachedProps = [];
  const meshes = [];
  enemy.model.traverse((o) => { if (o.isSkinnedMesh && o.geometry?.attributes?.skinIndex) meshes.push(o); });
  for (const source of meshes) {
    if (!boneIds.size) continue;
    const g = source.geometry;
    const pos = g.attributes.position;
    const si = g.attributes.skinIndex;
    const sw = g.attributes.skinWeight;
    const indices = g.index?.array ?? Uint32Array.from({ length: pos.count }, (_, i) => i);
    const keep = [];
    const take = [];
    for (let i = 0; i + 2 < indices.length; i += 3) {
      const tri = [indices[i], indices[i + 1], indices[i + 2]];
      let influence = 0;
      for (const vi of tri) for (let k = 0; k < 4; k++) if (boneIds.has(si.getComponent(vi, k))) influence += sw.getComponent(vi, k);
      (influence >= 1.35 ? take : keep).push(...tri);
    }
    if (!take.length) continue;
    if (!source.material.isShaderMaterial) {
      const positions = [];
      const colors = [];
      const color = g.attributes.color;
      for (const vi of take) {
        _v.fromBufferAttribute(pos, vi);
        source.applyBoneTransform(vi, _v);
        source.localToWorld(_v);
        positions.push(_v.x, _v.y, _v.z);
        if (color) colors.push(color.getX(vi), color.getY(vi), color.getZ(vi));
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      if (colors.length) geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      geometry.computeVertexNormals();
      debrisParts.push({ geometry, material: source.material.clone() });
    }
    // Geometry is shared by cloned enemy templates; assign a per-instance filtered copy.
    const remaining = g.clone();
    remaining.setIndex(keep);
    source.geometry = remaining;
    enemy.severedGeometry ??= new Set();
    enemy.severedGeometry.add(remaining);
  }
  // Creature limbs and hand-held gear are often ordinary meshes parented to a bone rather than
  // weighted into the body skin. Bake those objects' world transforms into the detached debris too.
  const rootBone = enemy.model.getObjectByName(names[0]);
  rootBone?.traverse((source) => {
    if (!source.isMesh || source.isSkinnedMesh || !source.geometry) return;
    const detached = source.clone();
    detached.geometry = source.geometry.clone();
    detached.material = Array.isArray(source.material)
      ? source.material.map((m) => m.clone()) : source.material.clone();
    source.updateWorldMatrix(true, false);
    source.matrixWorld.decompose(detached.position, detached.quaternion, detached.scale);
    detachedProps.push(detached);
    source.visible = false;
  });
  enemy.severed.add(id);
  if (!debrisParts.length && !detachedProps.length) return true;
  const center = new THREE.Vector3();
  let n = 0;
  for (const part of debrisParts) {
    const a = part.geometry.attributes.position;
    for (let i = 0; i < a.count; i++) { center.x += a.getX(i); center.y += a.getY(i); center.z += a.getZ(i); n++; }
  }
  for (const prop of detachedProps) { center.add(prop.position); n++; }
  center.multiplyScalar(1 / Math.max(1, n));
  const group = new THREE.Group();
  group.position.copy(center);
  for (const part of debrisParts) {
    part.geometry.translate(-center.x, -center.y, -center.z);
    const mesh = new THREE.Mesh(part.geometry, part.material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    group.add(mesh);
  }
  for (const prop of detachedProps) {
    prop.position.sub(center);
    prop.castShadow = true;
    prop.receiveShadow = true;
    prop.frustumCulled = false;
    group.add(prop);
  }
  enemy.game.scene.add(group);
  const forward = enemy.forward(new THREE.Vector3());
  enemy.detachedParts ??= [];
  enemy.detachedParts.push({
    group, age: 0, life: 5.5,
    velocity: enemy.velocity.clone().addScaledVector(forward, 2.2).add(new THREE.Vector3(0, 2.5, 0)),
    angular: new THREE.Vector3((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9),
  });
  return true;
}

export function updateDetachedParts(enemy, dt) {
  if (!enemy.detachedParts?.length) return;
  for (let i = enemy.detachedParts.length - 1; i >= 0; i--) {
    const p = enemy.detachedParts[i];
    p.age += dt;
    p.velocity.y -= 9.8 * dt;
    p.group.position.addScaledVector(p.velocity, dt);
    p.group.rotation.x += p.angular.x * dt;
    p.group.rotation.y += p.angular.y * dt;
    p.group.rotation.z += p.angular.z * dt;
    const ground = enemy.game.world.groundHeight(p.group.position.x, p.group.position.z) + 0.08;
    if (p.group.position.y < ground) {
      p.group.position.y = ground;
      p.velocity.y = Math.max(0, -p.velocity.y * 0.18);
      p.velocity.x *= 0.72;
      p.velocity.z *= 0.72;
      p.angular.multiplyScalar(0.72);
    }
    if (p.age < p.life) continue;
    enemy.game.scene.remove(p.group);
    p.group.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); });
    enemy.detachedParts.splice(i, 1);
  }
}
