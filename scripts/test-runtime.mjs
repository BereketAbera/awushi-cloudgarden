/** Real Three.js loader/mixer/skin tests. No GPU, DOM, browser, or network needed.
 * Only image decoding is replaced by a 1px local texture; render fidelity is
 * separately reviewed in Blender and the browser, never asserted by this test.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AnimationMixer, Box3, DataTexture, LoopOnce, RGBAFormat, Vector3 } from 'three';
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

const worldFiles = ['island', 'github-workshop', 'ci-factory', 'kubernetes-cluster', 'props'];
for (const name of worldFiles) test(`${name}: actual static world GLB loads with finite transforms and correct world bounds`, async () => {
  const bytes = readFileSync(new URL(`../public/assets/${name}.glb`, import.meta.url));
  const model = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  assert.equal(model.animations.length, 0, 'World props must be static');
  model.scene.updateMatrixWorld(true);
  let meshes = 0, maxRadius = 0, bedrockOrientation = 0, bedrockTriangles = 0;
  model.scene.traverse(node => {
    assert.ok(node.matrixWorld.elements.every(Number.isFinite), `Non-finite matrix on ${node.name}`);
    if (!node.isMesh) return;
    meshes++;
    assert.ok(!node.isSkinnedMesh, 'Static environment unexpectedly contains a skin');
    const positions = node.geometry.attributes.position;
    assert.ok(positions?.count > 0, 'Empty environment mesh');
    for (let i = 0; i < positions.count; i++) {
      const vertex = new Vector3().fromBufferAttribute(positions, i).applyMatrix4(node.matrixWorld);
      assert.ok(vertex.toArray().every(Number.isFinite), 'Non-finite transformed environment vertex');
      maxRadius = Math.max(maxRadius, Math.hypot(vertex.x, vertex.z));
    }
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) {
      assert.ok(material.color.toArray().every(Number.isFinite), 'Invalid material color');
      assert.ok(Number.isFinite(material.roughness) && Number.isFinite(material.metalness), 'Invalid PBR material');
    }
    if (name === 'island' && materials.some(material => /deep bedrock|blue facets|shadow facets/.test(material.name))) {
      const indices = node.geometry.index;
      const count = indices ? indices.count : positions.count;
      for (let i = 0; i < count; i += 3) {
        const vertex = offset => new Vector3().fromBufferAttribute(positions, indices ? indices.getX(i + offset) : i + offset).applyMatrix4(node.matrixWorld);
        const a = vertex(0), b = vertex(1), c = vertex(2);
        const normal = new Vector3().subVectors(b, a).cross(new Vector3().subVectors(c, a));
        const center = a.clone().add(b).add(c).multiplyScalar(1 / 3);
        // Area-weighted radial orientation is insensitive to vertex normals.
        // Inward triangle winding makes the island disappear under backface culling.
        bedrockOrientation += normal.x * center.x + normal.z * center.z;
        bedrockTriangles++;
      }
    }
  });
  assert.ok(meshes > 0);
  const bounds = new Box3().setFromObject(model.scene, true);
  const size = bounds.getSize(new Vector3());
  assert.ok(!bounds.isEmpty() && size.toArray().every(v => Number.isFinite(v) && v > 0), 'Invalid world-space bounds');
  if (name === 'island') {
    assert.ok(size.x > 16 && size.x < 19 && size.z > 16 && size.z < 19, 'Island diameter does not contain the playable radius');
    assert.ok(bounds.min.y < -3.5 && bounds.min.y > -5 && bounds.max.y >= 0 && bounds.max.y < 0.2, 'Island floor or floating depth is misaligned');
    assert.ok(bedrockTriangles > 0 && bedrockOrientation > 0, `Island bedrock winding points inward; backface culling would hide it (orientation ${bedrockOrientation})`);
  } else if (name === 'props') {
    assert.ok(maxRadius < 8.2 && bounds.max.y < 2 && bounds.min.y > -0.5, 'Scattered props escape their island coordinates');
  } else {
    assert.ok(Math.abs(bounds.min.y) < 0.001 && size.y > 1 && size.y < 3, 'Station is not grounded at y=0 with game-scale height');
    assert.ok(maxRadius <= 1.7501, `Station exceeds the 1.75m collision footprint: ${maxRadius}`);
  }
});

// Phase 1 composites: inspect real exported triangles, not only Blender reports.
import { createHash } from 'node:crypto';
const layoutBytes = readFileSync(new URL('../src/data/world-layout.json', import.meta.url));
const phaseLayout = JSON.parse(layoutBytes);
const phaseFiles = ['world-hub', ...phaseLayout.districts.map(d => `district-${d.id}`)];

for (const name of phaseFiles) test(`${name}: actual Phase 1 GLB has finite local geometry, outward bedrock, and matching bridge surfaces`, async () => {
  const data = readFileSync(new URL(`../public/assets/${name}.glb`, import.meta.url));
  assert.ok(data.length < 8 * 1024 * 1024, 'Composite exceeds the per-asset file budget');
  const model = await loader.parseAsync(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), '');
  assert.equal(model.animations.length, 0, 'Composite must remain static');
  model.scene.updateMatrixWorld(true);
  let meshes = 0, triangles = 0, rockTriangles = 0, flatSurfaceVertices = 0;
  const woodVertices = [];
  model.scene.traverse(node => {
    assert.ok(node.matrixWorld.elements.every(Number.isFinite), `Non-finite matrix on ${node.name}`);
    if (!node.isMesh) return;
    meshes++;
    assert.ok(!node.isSkinnedMesh, 'World composite contains a character skin');
    const positions = node.geometry.attributes.position;
    assert.ok(positions?.count > 0, 'Empty composite primitive');
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    const rock = materials.some(m => /Miniature.*rock/.test(m.name));
    const wood = materials.some(m => /Miniature.*wood/.test(m.name));
    const meadow = materials.some(m => /Miniature.*moss/.test(m.name));
    for (const material of materials) {
      assert.ok(material.color.toArray().every(Number.isFinite), 'Invalid composite color');
      assert.ok(Number.isFinite(material.roughness) && Number.isFinite(material.metalness), 'Invalid composite PBR material');
    }
    for (let i = 0; i < positions.count; i++) {
      const point = new Vector3().fromBufferAttribute(positions, i).applyMatrix4(node.matrixWorld);
      assert.ok(point.toArray().every(Number.isFinite), 'Non-finite transformed composite vertex');
      if (wood && name === 'world-hub') woodVertices.push(point);
      if (meadow && Math.abs(point.y) < 1e-5) flatSurfaceVertices++;
    }
    const indices = node.geometry.index;
    const count = indices ? indices.count : positions.count;
    triangles += count / 3;
    if (!rock) return;
    for (let i = 0; i < count; i += 3) {
      const point = offset => new Vector3().fromBufferAttribute(positions, indices ? indices.getX(i + offset) : i + offset).applyMatrix4(node.matrixWorld);
      const a = point(0), b = point(1), c = point(2);
      const normal = b.clone().sub(a).cross(c.clone().sub(a));
      const center = a.clone().add(b).add(c).multiplyScalar(1 / 3);
      // Every bedrock face must point outward. A positive average can hide
      // individual inverted strips, which disappear under WebGL backface culling.
      assert.ok(normal.x * center.x + normal.z * center.z > 1e-6, `Inward bedrock triangle in ${name}`);
      rockTriangles++;
    }
  });
  assert.ok(meshes > 0 && triangles > 0 && triangles < 150000, 'Composite geometry budget exceeded');
  assert.ok(rockTriangles >= 500, 'Floating bedrock was omitted or not checked');
  assert.ok(flatSurfaceVertices >= 50, 'Flat island walking surface missing at local y=0');
  const bounds = new Box3().setFromObject(model.scene, true);
  assert.ok(!bounds.isEmpty() && [...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite));
  assert.ok(Math.abs(bounds.min.y + 6.6) < .001, 'Floating depth is wrong or a district elevation was baked twice');
  assert.ok(bounds.max.y > 1 && bounds.max.y < 3.5, 'Landmarks are not at the intended miniature scale');
  const limit = name === 'world-hub' ? 20 : 7;
  assert.ok(Math.abs(bounds.min.x) < limit && Math.abs(bounds.max.x) < limit && Math.abs(bounds.min.z) < limit && Math.abs(bounds.max.z) < limit,
    'Composite is not centered in its declared local coordinate system');
  if (name === 'world-hub') {
    for (const bridge of phaseLayout.bridges) for (let i = 0; i < bridge.points.length; i++) {
      const point = new Vector3(...bridge.points[i]);
      const previous = new Vector3(...bridge.points[Math.max(0, i - 1)]);
      const next = new Vector3(...bridge.points[Math.min(bridge.points.length - 1, i + 1)]);
      const tangent = next.sub(previous); tangent.y = 0; tangent.normalize();
      const normal = new Vector3(tangent.z, 0, -tangent.x).multiplyScalar(bridge.width / 2);
      for (const sign of [-1, 1]) {
        const corner = point.clone().addScaledVector(normal, sign);
        assert.ok(woodVertices.some(vertex => vertex.distanceToSquared(corner) < 1e-8),
          `${bridge.id}: missing deck corner or wrong elevation at sample ${i}`);
      }
    }
  }
});

test('Phase 1 manifests match the authoritative layout and all seventeen measured collision footprints', () => {
  const manifest = JSON.parse(readFileSync(new URL('../assets/source/world-manifest.json', import.meta.url)));
  const navigation = JSON.parse(readFileSync(new URL('../assets/source/world-navigation.json', import.meta.url)));
  const fingerprint = createHash('sha256').update(layoutBytes).digest('hex');
  assert.equal(manifest.layout_sha256, fingerprint, 'World assets were not rebuilt after a layout change');
  assert.equal(navigation.layout_sha256, fingerprint);
  assert.deepEqual(Object.keys(manifest.assets).sort(), [...phaseFiles].sort());
  assert.equal(Object.keys(manifest.station_bounds).length, 17);
  assert.equal(phaseLayout.stations.length, 17);
  for (const station of phaseLayout.stations) {
    const measured = manifest.station_bounds[station.id];
    assert.ok(measured, `No measured footprint for ${station.id}`);
    assert.equal(measured.model, station.model);
    assert.deepEqual(measured.position, station.position);
    assert.equal(measured.rotation_y, station.rotation);
    assert.equal(measured.collision_radius, station.radius);
    assert.ok(Number.isFinite(measured.radius) && measured.radius > .1 && measured.radius <= station.radius + 1e-4,
      `${station.id} geometry exceeds the navigation collider`);
    assert.ok(measured.scale > 0 && measured.scale <= 1, 'Unexpected landmark scale');
  }
  assert.deepEqual(navigation.bridges, phaseLayout.bridges);
  assert.deepEqual(navigation.islands, [phaseLayout.hub, ...phaseLayout.districts].map(({id, center, radius}) => ({id, center, radius})));
  assert.deepEqual(navigation.station_colliders, phaseLayout.stations.map(({id, position, radius}) => ({id, center: position, radius})));
  const total = Object.values(manifest.assets).reduce((sum, item) => sum + item.triangles, 0);
  assert.equal(total, manifest.total_world_triangles);
  assert.ok(total < 300000, 'Total world exceeds 300k triangles');
  for (const [name, info] of Object.entries(manifest.assets)) {
    assert.equal(info.bytes, readFileSync(new URL(`../public/assets/${name}.glb`, import.meta.url)).length, `${name}: stale size report`);
    assert.ok(info.triangles < 150000 && info.bytes < 8 * 1024 * 1024);
  }
});
