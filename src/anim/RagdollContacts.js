import * as THREE from 'three';

const samplesByModel = new WeakMap();
const _local = new THREE.Vector3();
const _world = new THREE.Vector3();
const _target = new THREE.Vector3();
const _boneWorld = new THREE.Vector3();
const _beforeLocal = new THREE.Vector3();
const _afterLocal = new THREE.Vector3();

function samplesFor(rig) {
  let samples = samplesByModel.get(rig.model);
  if (samples) return samples;
  samples = [];
  rig.model.traverse((mesh) => {
    if (!mesh.isSkinnedMesh || mesh.material?.isShaderMaterial) return;
    const position = mesh.geometry?.getAttribute('position');
    const skinIndex = mesh.geometry?.getAttribute('skinIndex');
    const skinWeight = mesh.geometry?.getAttribute('skinWeight');
    if (!position || !skinIndex || !skinWeight) return;
    for (let i = 0; i < position.count; i++) {
      let bestWeight = 0;
      let bestBone = null;
      for (let j = 0; j < 4; j++) {
        const weight = skinWeight.getComponent(i, j);
        if (weight <= bestWeight) continue;
        const boneIndex = skinIndex.getComponent(i, j);
        const bone = mesh.skeleton.bones[boneIndex];
        if (bone) { bestWeight = weight; bestBone = bone; }
      }
      if (bestBone) samples.push({ mesh, index: i, bone: bestBone, weight: bestWeight });
    }
  });
  samplesByModel.set(rig.model, samples);
  return samples;
}

// Resolve the actual skinned surface against terrain and world props after the ragdoll joints
// settle. Each vertex pushes its dominant bone, so limbs rest on their own mesh instead of on a
// single hand/foot joint point.
export function resolveRagdollMeshContacts(rig, state) {
  if (!state.supportHeight && !state.resolve) return;
  const samples = samplesFor(rig);
  if (!samples.length) return;
  rig.model.updateWorldMatrix(true, true);
  const visibleMeshes = new Set();
  rig.model.traverseVisible((object) => { if (object.isSkinnedMesh) visibleMeshes.add(object); });
  const corrections = new Map();
  for (const sample of samples) {
    if (!visibleMeshes.has(sample.mesh)) continue;
    sample.mesh.getVertexPosition(sample.index, _local);
    _world.copy(_local).applyMatrix4(sample.mesh.matrixWorld);
    _target.copy(_world);
    if (state.supportHeight) {
      const floor = state.supportHeight(_target.x, _target.z, _target.y + 0.03);
      if (_target.y < floor + 0.015) _target.y = floor + 0.015;
    }
    if (state.resolve) state.resolve(_target, 0.008, 0, 0.016);
    if (_target.distanceToSquared(_world) < 1e-8) continue;
    const weight = Math.max(0.35, sample.weight);
    _target.sub(_world).multiplyScalar(1 / weight);
    const distanceSq = _target.lengthSq();
    const previous = corrections.get(sample.bone);
    if (!previous || distanceSq > previous.distanceSq) {
      corrections.set(sample.bone, { delta: _target.clone(), distanceSq });
    }
  }
  for (const [bone, correction] of corrections) {
    if (!bone.parent) continue;
    rig.model.updateWorldMatrix(true, true);
    bone.getWorldPosition(_boneWorld);
    bone.parent.worldToLocal(_beforeLocal.copy(_boneWorld));
    bone.parent.worldToLocal(_afterLocal.copy(_boneWorld).add(correction.delta));
    bone.position.add(_afterLocal.sub(_beforeLocal));
  }
  rig.model.updateWorldMatrix(true, true);
}
