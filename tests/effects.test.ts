import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { Box3, Mesh, Vector3 } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { recentEventEffects, effectPosition } from '../src/simulation/effects.ts'
import type { SimulationEvent } from '../src/simulation/domain.ts'

const bytes = readFileSync(new URL('../public/assets/deployment-effects.glb', import.meta.url))
const asset = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')
const names = ['CodePacket', 'ImagePackage', 'ConfigPacket', 'PodShell', 'SignalOrb', 'SyncRing']
test('local deployment GLB exposes six small reusable prototypes with finite Y-up geometry', () => {
  assert.ok(bytes.length < 400 * 1024)
  assert.equal(asset.animations.length, 0, 'State-machine events, not autonomous animation, control these props')
  let triangles = 0
  for (const name of names) {
    const prototype = asset.scene.getObjectByName(name)
    assert.ok(prototype, `Missing reusable prototype ${name}`)
    assert.deepEqual(prototype.position.toArray(), [0, 0, 0])
    prototype.updateMatrixWorld(true)
    const bounds = new Box3().setFromObject(prototype)
    const size = bounds.getSize(new Vector3())
    assert.ok(size.x > 0 && size.x < 1 && size.y > 0 && size.y < 1 && size.z > 0 && size.z < 1)
    assert.ok(bounds.min.y >= -.02)
    prototype.traverse(node => {
      if (!(node instanceof Mesh)) return
      assert.ok(Array.from(node.geometry.attributes.position.array).every(Number.isFinite))
      triangles += (node.geometry.index?.count ?? node.geometry.attributes.position.count) / 3
    })
  }
  assert.ok(triangles > 0 && triangles < 8000)
})

function event(id: number, environment: SimulationEvent['environment'] = 'development'): SimulationEvent {
  return { id, runId: 1, environment, timestamp: id * 1000, type: 'stage-started', stageId: 'publish', message: 'Simulated image publication', visual: { kind: 'image', fromStationId: 'ci', toStationId: 'registry' } }
}
test('visual packets are bounded projections of real events and selected environment', () => {
  const history = Array.from({ length: 20 }, (_, index) => event(index))
  const effects = recentEventEffects(history, 'development')
  assert.equal(effects.length, 8)
  assert.equal(effects[0].id, 12)
  assert.equal(effects[0].prototype, 'ImagePackage')
  assert.deepEqual(recentEventEffects(history, 'production'), [])
  assert.deepEqual(recentEventEffects([{ ...event(1), type: 'stage-completed' }], 'development'), [])
  assert.deepEqual(recentEventEffects([{ ...event(1), visual: { kind: 'image', fromStationId: 'unknown', toStationId: 'registry' } }], 'development'), [])
})
test('event interpolation respects endpoints, has a bounded arc, and reduces motion without engine mutation', () => {
  const input = event(1), snapshot = JSON.stringify(input)
  const effect = recentEventEffects([input], 'development')[0]
  const start = effectPosition(effect, 0, false), end = effectPosition(effect, 1, false), middle = effectPosition(effect, .5, false)
  assert.equal(start[0], effect.from[0]); assert.equal(end[2], effect.to[2])
  assert.ok(middle[1] > Math.max(start[1], end[1]))
  assert.ok(effectPosition(effect, .3, true).every((value, index) => Math.abs(value - end[index]) < 1e-9))
  assert.deepEqual(effectPosition(effect, 2, false), end)
  assert.equal(JSON.stringify(input), snapshot)
})
