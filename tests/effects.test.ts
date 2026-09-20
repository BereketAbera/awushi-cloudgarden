import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { Box3, Mesh, Vector3 } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { recentEventEffects, effectPosition, FLOW_STYLE, flowKindForEvent } from '../src/simulation/effects.ts'
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

// Operational recovery follows the same event projection as delivery.
test('shared operational events produce bounded visual routes without changing infrastructure', () => {
  const input: SimulationEvent = { ...event(7), type: 'operation', visual: { kind: 'recovery', fromStationId: 'database', toStationId: 'observability' } }
  const snapshot = JSON.stringify(input)
  const projected = recentEventEffects([input], 'development')
  assert.equal(projected.length, 1)
  assert.equal(projected[0].prototype, 'SignalOrb')
  assert.equal(projected[0].timestamp, input.timestamp)
  assert.deepEqual(recentEventEffects([input], 'production'), [])
  assert.equal(JSON.stringify(input), snapshot)
})

test('flows distinguish actual code, artifact, telemetry and log events', () => {
  const image = event(1)
  assert.equal(flowKindForEvent(image), 'image')
  assert.equal(flowKindForEvent({ ...image, stageId: 'logs', visual: { kind: 'telemetry', fromStationId: 'kubernetes', toStationId: 'observability' } }), 'logs')
  assert.equal(flowKindForEvent({ ...image, stageId: 'metrics', visual: { kind: 'telemetry', fromStationId: 'network', toStationId: 'observability' } }), 'metrics')
  assert.equal(flowKindForEvent({ ...image, stageId: 'service' }), 'traffic')
  assert.equal(Object.keys(FLOW_STYLE).length, 8)
  assert.ok(Object.values(FLOW_STYLE).every(style => style.label && style.glyph))
})
test('arrival acknowledgment requires a matching completed stage in the same run and environment', () => {
  const start = event(1)
  const complete: SimulationEvent = { ...start, id: 2, timestamp: start.timestamp + 1200, type: 'stage-completed' }
  assert.equal(recentEventEffects([start], 'development')[0].acknowledged, false)
  assert.equal(recentEventEffects([start, { ...complete, environment: 'production' }], 'development')[0].acknowledged, false)
  assert.equal(recentEventEffects([start, { ...complete, runId: 2 }], 'development')[0].acknowledged, false)
  assert.equal(recentEventEffects([start, complete], 'development')[0].acknowledged, true)
  const failure = recentEventEffects([{ ...start, type: 'failed', visual: { kind: 'failure', fromStationId: 'ci', toStationId: 'alerts' } }], 'development')[0]
  assert.equal(failure.outcome, 'failed')
  assert.equal(failure.kind, 'alert')
})

test('secret reference route is a secondary projection of the real sync event', () => {
  const sync: SimulationEvent = { ...event(3), stageId: 'sync', visual: { kind: 'sync', fromStationId: 'gitops', toStationId: 'kubernetes' } }
  const snapshot = JSON.stringify(sync), routes = recentEventEffects([sync], 'development')
  assert.equal(routes.length, 2)
  assert.deepEqual(routes.map(route => route.id), [sync.id, sync.id])
  assert.equal(new Set(routes.map(route => route.routeId)).size, 2)
  assert.equal(routes[0].kind, 'secret'); assert.equal(routes[0].fromStationId, 'secrets')
  assert.equal(routes.at(-1)?.fromStationId, 'gitops', 'Primary route remains the actual manifest flow')
  assert.equal(routes[0].acknowledged, false)
  assert.equal(FLOW_STYLE.secret.label, 'Secret reference')
  assert.equal(JSON.stringify(sync), snapshot)
})
