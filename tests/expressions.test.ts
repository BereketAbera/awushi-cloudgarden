import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { AnimationMixer, Mesh, Texture, type Object3D } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { EXPRESSIONS, applyExpression, getExpressionTargets, resetExpression } from '../src/character/expressions.ts'

// Load the actual exported geometry, skins, morphs and actions. Texture decoding
// is irrelevant to these CPU tests; this hook avoids browser image APIs entirely.
const loader = new GLTFLoader()
loader.register(() => ({ name: 'LOCAL_TEST_TEXTURE', loadTexture: async () => new Texture() }))
const bytes = readFileSync(new URL('../public/assets/awushi.glb', import.meta.url))
const loaded = loader.parseAsync(Uint8Array.from(bytes).buffer, '')

function facialMeshes(scene: Object3D): Mesh[] {
  const result: Mesh[] = []
  scene.traverse(object => {
    if (object instanceof Mesh && object.morphTargetDictionary && object.morphTargetInfluences) result.push(object)
  })
  return result
}

test('real GLB exposes all nine morphs on compact skinned face primitives', async () => {
  const { scene, animations } = await loaded
  assert.equal(EXPRESSIONS.length, 10)
  assert.deepEqual(getExpressionTargets(scene), EXPRESSIONS.slice(1))
  const faces = facialMeshes(scene)
  assert.equal(faces.length, 4)
  for (const mesh of faces) {
    assert.equal(mesh.type, 'SkinnedMesh')
    assert.equal(mesh.geometry.morphAttributes.position.length, 9)
    assert.equal(mesh.geometry.morphAttributes.normal.length, 9)
    assert.equal(mesh.morphTargetInfluences!.every(value => value === 0), true)
  }
  assert.deepEqual(animations.map(clip => clip.name).sort(), ['Celebrate', 'Idle', 'Interact', 'Run', 'Walk'])
  assert.equal(animations.some(clip => clip.tracks.some(track => track.name.includes('morphTargetInfluences'))), false)
})

test('expression blending preserves active locomotion and skeletal pose', async () => {
  const gltf = await loaded
  const scene = clone(gltf.scene)
  const mixer = new AnimationMixer(scene)
  const action = mixer.clipAction(gltf.animations.find(clip => clip.name === 'Walk')!).play()
  mixer.update(.28)
  const before = new Map<string, number[]>()
  scene.traverse(object => { before.set(object.uuid, [...object.position, ...object.quaternion, ...object.scale]) })
  for (let frame = 0; frame < 60; frame++) applyExpression(scene, 'Happy', .8, 1 / 60)
  assert.equal(action.isRunning(), true)
  assert.equal(mixer.time, .28)
  scene.traverse(object => assert.deepEqual([...object.position, ...object.quaternion, ...object.scale], before.get(object.uuid)))
  for (const mesh of facialMeshes(scene)) {
    assert.ok(Math.abs(mesh.morphTargetInfluences![mesh.morphTargetDictionary!.Happy] - .8) < .0001)
  }
  mixer.stopAllAction()
  mixer.uncacheRoot(scene)
})

test('crossfades remain bounded, return to Neutral and stay independent on clones', async () => {
  const { scene: original } = await loaded
  const scene = clone(original), other = clone(original)
  for (let frame = 0; frame < 60; frame++) applyExpression(scene, 'Happy', 1, 1 / 60)
  for (let frame = 0; frame < 20; frame++) {
    applyExpression(scene, 'Surprised', 2, 1 / 60)
    for (const mesh of facialMeshes(scene)) {
      const values = mesh.morphTargetInfluences!
      assert.ok(values.every(value => value >= 0 && value <= 1))
      assert.ok(values.reduce((sum, value) => sum + value, 0) <= 1.00001)
    }
  }
  const first = facialMeshes(scene)[0], second = facialMeshes(other)[0]
  assert.notEqual(first.morphTargetInfluences, second.morphTargetInfluences)
  assert.ok(second.morphTargetInfluences!.every(value => value === 0))
  assert.ok(first.morphTargetInfluences![first.morphTargetDictionary!.Surprised] > .95)
  for (let frame = 0; frame < 90; frame++) applyExpression(scene, 'Neutral', 1, 1 / 60)
  assert.ok(facialMeshes(scene).every(mesh => mesh.morphTargetInfluences!.every(value => value === 0)))
  applyExpression(scene, 'Sleepy', 1, .1, true)
  resetExpression(scene)
  assert.ok(facialMeshes(scene).every(mesh => mesh.morphTargetInfluences!.every(value => value === 0)))
})

test('blink still closes the morphed eyes and invalid frame deltas cannot poison weights', async () => {
  const gltf = await loaded
  const scene = clone(gltf.scene), mixer = new AnimationMixer(scene)
  mixer.clipAction(gltf.animations.find(clip => clip.name === 'Idle')!).play()
  mixer.setTime(2.72)
  const eye = scene.getObjectByName('eye_L')!
  assert.ok(eye.scale.y < .25)
  const blink = eye.scale.y
  for (let frame = 0; frame < 45; frame++) applyExpression(scene, 'Sleepy', .65, 1 / 60)
  assert.equal(eye.scale.y, blink)
  const mesh = facialMeshes(scene)[0], before = [...mesh.morphTargetInfluences!]
  applyExpression(scene, 'Happy', 1, NaN)
  applyExpression(scene, 'Happy', 1, -1)
  assert.deepEqual(mesh.morphTargetInfluences, before)
  for (let frame = 0; frame < 90; frame++) applyExpression(scene, 'Happy', NaN, 1 / 60)
  assert.ok(mesh.morphTargetInfluences!.every(value => value === 0))
  mixer.stopAllAction()
  mixer.uncacheRoot(scene)
})
