/** Real Three.js loader/mixer/skin tests. No GPU, DOM, browser, or network needed.
 * Only image decoding is replaced by a 1px local texture; render fidelity is
 * separately reviewed in Blender and the browser, never asserted by this test.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AnimationMixer, DataTexture, LoopOnce, RGBAFormat, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { REQUIRED_CLIPS } from './validate-assets.mjs';

const loader = new GLTFLoader();
loader.register(() => ({ name: 'LOCAL_TEST_IMAGE_DECODE', loadTexture: () => {
  const texture = new DataTexture(new Uint8Array([255,255,255,255]), 1, 1, RGBAFormat);
  texture.needsUpdate = true;
  return Promise.resolve(texture);
} }));
const bytes = readFileSync(new URL('../public/assets/awushi.glb', import.meta.url));
const asset = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');

function snapshot(scene) {
  const result = [];
  scene.traverse(node => result.push(...node.position.toArray(), ...node.quaternion.toArray(), ...node.scale.toArray()));
  return result;
}

function updateAndCheckSkin(scene) {
  scene.updateMatrixWorld(true);
  const samples = [];
  let skinnedMeshes = 0;
  scene.traverse(node => {
    assert.ok(node.matrixWorld.elements.every(Number.isFinite), `Non-finite matrix on ${node.name}`);
    if (!node.isSkinnedMesh) return;
    skinnedMeshes++;
    node.skeleton.update();
    assert.ok(Array.from(node.skeleton.boneMatrices).every(Number.isFinite), `Non-finite skin matrix on ${node.name}`);
    const positions = node.geometry.attributes.position;
    for (const fraction of [0, 0.23, 0.51, 0.79, 0.99]) {
      const index = Math.min(positions.count - 1, Math.floor(positions.count * fraction));
      const point = new Vector3().fromBufferAttribute(positions, index);
      node.applyBoneTransform(index, point).applyMatrix4(node.matrixWorld);
      assert.ok(point.toArray().every(Number.isFinite), `Non-finite skinned vertex on ${node.name}`);
      samples.push(...point.toArray());
    }
  });
  assert.ok(skinnedMeshes > 0, 'GLB has no usable Three.js SkinnedMesh');
  return samples;
}

test('actual GLB loads all named clips and portable jelly material extensions in Three.js', () => {
  assert.deepEqual(asset.animations.map(a => a.name).sort(), [...REQUIRED_CLIPS].sort());
  const jellyMaterials = [];
  asset.scene.traverse(node => {
    if (!node.isMesh) return;
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      if (/cyan jelly/i.test(material.name)) jellyMaterials.push(material);
    }
  });
  assert.ok(jellyMaterials.length > 0);
  assert.ok(jellyMaterials.every(m => m.isMeshPhysicalMaterial && m.transmission > 0 && m.thickness > 0 && Number.isFinite(m.attenuationDistance)));
});

for (const name of REQUIRED_CLIPS) test(`${name}: AnimationMixer changes real skin poses, keeps matrices finite, and restores the rest pose`, () => {
  const scene = clone(asset.scene);
  const before = snapshot(scene);
  const baselineVertices = updateAndCheckSkin(scene);
  const mixer = new AnimationMixer(scene);
  const clip = asset.animations.find(a => a.name === name);
  assert.ok(clip && clip.duration > 0);
  const action = mixer.clipAction(clip).setLoop(LoopOnce, 1);
  action.clampWhenFinished = true;
  action.play();
  let changedPose = false, changedSkin = false;
  for (const fraction of [0, 0.25, 0.55, 0.8, 1]) {
    mixer.setTime(clip.duration * fraction);
    const after = snapshot(scene);
    const vertices = updateAndCheckSkin(scene);
    changedPose ||= after.some((v, i) => Math.abs(v - before[i]) > 1e-4);
    changedSkin ||= vertices.some((v, i) => Math.abs(v - baselineVertices[i]) > 1e-4);
  }
  assert.ok(changedPose, `${name} did not change object/bone transforms`);
  assert.ok(changedSkin, `${name} did not deform or move sampled skin vertices`);
  mixer.stopAllAction();
  updateAndCheckSkin(scene);
  const restored = snapshot(scene);
  assert.ok(restored.every((v, i) => Math.abs(v - before[i]) < 1e-5), `${name} did not restore the initial pose after stopping`);
  mixer.uncacheRoot(scene);
});
