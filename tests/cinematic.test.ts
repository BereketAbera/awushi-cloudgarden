import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PerspectiveCamera, Vector3 } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { ATTENTION, advanceShotTime, cinematicOwnsCamera, cinematicPose, combinedBounds, fallbackBounds, interpolateShot, manualOrbitPose, orbitFromPose, requestCharacterReturn, shotOccluded, simulationShot, type CameraOwnership, type CinematicView, type ShotKind, type SubjectBounds } from '../src/game/cinematic.ts'
import { measureStationGeometry } from '../src/game/stationGeometry.ts'
import { DISTRICTS, STATIONS } from '../src/worldConfig.ts'
import { createSimulation, reduceSimulation, tickSimulation } from '../src/simulation/engine.ts'
import { DEPLOYMENT_STAGES } from '../src/simulation/scenario.ts'

const measured = new Map<string, SubjectBounds>()
for (const district of DISTRICTS) {
  const bytes = readFileSync(new URL(`../public${district.asset}`, import.meta.url))
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')
  const shapes = measureStationGeometry(gltf.scene, district, STATIONS.filter(station => station.districtId === district.id))
  for (const [id, shape] of shapes) { measured.set(id, shape.bounds); shape.geometry.dispose() }
}
function projectedCorners(stationId: string, aspect: number, kind: ShotKind = 'close-up') {
  const pose = cinematicPose({ id: stationId, stationId, kind }, aspect, measured), bounds = measured.get(stationId)!
  const camera = new PerspectiveCamera(pose.fov, aspect, .08, 220)
  camera.position.fromArray(pose.position); camera.lookAt(new Vector3(...pose.target)); camera.updateMatrixWorld(true)
  const corners: Vector3[] = []
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) corners.push(new Vector3(bounds.center[0] + x * bounds.size[0] / 2, bounds.center[1] + y * bounds.size[1] / 2, bounds.center[2] + z * bounds.size[2] / 2).project(camera))
  return { pose, corners }
}
test('real composite GLBs yield bounded station subjects rather than whole islands', () => {
  assert.equal(measured.size, STATIONS.length)
  for (const station of STATIONS) {
    const bounds = measured.get(station.id)!
    assert.ok(bounds.size.every(value => Number.isFinite(value) && value > .1))
    assert.ok(bounds.size[0] < station.radius * 2 + 1.2, `${station.id} horizontal bounds`)
    assert.ok(bounds.size[1] < 5 && bounds.size[1] > .3, `${station.id} building height`)
    assert.ok(Math.hypot(bounds.center[0] - station.position[0], bounds.center[2] - station.position[2]) < .8)
  }
})
test('every station fits in desktop and portrait frusta without clipping subject corners', () => {
  for (const station of STATIONS) for (const aspect of [16 / 9, .55, 1]) {
    const { pose, corners } = projectedCorners(station.id, aspect)
    assert.ok(corners.every(point => Math.abs(point.x) < .88 && Math.abs(point.y) < .88 && point.z > -1 && point.z < 1), `${station.id}/${aspect}`)
    assert.ok(pose.position[1] > station.position[1] + 1)
    assert.ok(Math.hypot(...pose.position.map((value, axis) => value - pose.target[axis])) > station.radius * 2)
  }
})
test('station-centered sightline ignores its own collider and chooses clear alternate angles', () => {
  for (const station of STATIONS) {
    const { pose } = projectedCorners(station.id, 16 / 9)
    assert.equal(shotOccluded(pose.position, pose.target, [station.id]), false, station.id)
  }
})
test('relationship shots frame both endpoints and fallback framing handles missing explicit bounds', () => {
  const ids = ['github', 'ci'], bounds = combinedBounds(ids, measured)
  const shot = cinematicPose({ id: 'handoff', stationId: ids[0], relatedStationIds: [ids[1]], kind: 'relationship' }, .6, measured)
  assert.deepEqual(shot.target, bounds.center)
  assert.ok(Number.isFinite(cinematicPose({ id: 'fallback', stationId: 'kubernetes' }, 1).position[0]))
  assert.ok(fallbackBounds('kubernetes').size.every(value => value > 0))
})
test('all shot families return finite poses and bounded transitions preserve endpoints', () => {
  const kinds: ShotKind[] = ['establishing', 'close-up', 'medium', 'transition', 'relationship', 'incident', 'completion']
  const start = cinematicPose({ id: 'a', stationId: 'github' }, 1.6, measured)
  for (const kind of kinds) {
    const end = cinematicPose({ id: kind, stationId: 'kubernetes', kind, relatedStationIds: ['gitops'] }, 1.6, measured)
    assert.deepEqual(interpolateShot(start, end, 0), start)
    const finish = interpolateShot(start, end, 1)
    assert.ok(finish.position.every((value, axis) => Math.abs(value - end.position[axis]) < 1e-9))
    for (const progress of [.1, .5, .9]) assert.ok(interpolateShot(start, end, progress).position.every(Number.isFinite))
  }
})
test('manual takeover preserves exact framing and orbit changes do not mutate saved preference', () => {
  const original = cinematicPose({ id: 'a', stationId: 'ci' }, 1.6, measured), snapshot = JSON.stringify(original)
  const manual = orbitFromPose(original), same = manualOrbitPose(manual, original)
  assert.ok(same.position.every((value, axis) => Math.abs(value - original.position[axis]) < 1e-9))
  const rotated = manualOrbitPose({ ...manual, yaw: manual.yaw + .5 }, original)
  assert.deepEqual(rotated.target, original.target)
  assert.notDeepEqual(rotated.position, original.position)
  assert.equal(JSON.stringify(original), snapshot)
})
test('camera ownership and disabled automatic motion are explicit', () => {
  const active: CameraOwnership[] = ['cinematic', 'overridden', 'returning-cinematic']
  for (const ownership of ['player', 'cinematic', 'overridden', 'returning-cinematic', 'returning-character'] as CameraOwnership[]) {
    const view = { ownership, shot: { id: 'a', stationId: 'ci' }, revision: 1 }
    assert.equal(cinematicOwnsCamera(view), active.includes(ownership))
    assert.equal(cinematicOwnsCamera({ ...view, autoMove: false }), false)
  }
  assert.equal(cinematicOwnsCamera(undefined), false)
})
test('shot projection follows actual stages, represents gates, and never advances simulation', () => {
  let state = reduceSimulation(createSimulation(0), { type: 'start', environment: 'development' }, 0)
  for (const stage of DEPLOYMENT_STAGES) {
    const snapshot = JSON.stringify(state), shot = simulationShot(state)
    assert.equal(shot?.stationId, stage.stationId)
    assert.equal(JSON.stringify(state), snapshot)
    if (state.status === 'waiting-approval') {
      assert.equal(shot?.status, 'waiting')
      assert.equal(tickSimulation(state, state.clock + 99999).status, 'waiting-approval')
      state = reduceSimulation(state, { type: 'approve' }, state.clock)
    } else state = tickSimulation(state, state.clock + stage.durationMs)
  }
  assert.equal(state.status, 'succeeded')
  assert.equal(simulationShot(state)?.status, 'healthy')
})
test('attention semantics carry distinct text and symbols without needing bloom or color', () => {
  assert.equal(new Set(Object.values(ATTENTION).map(item => item.icon)).size, 5)
  assert.ok(Object.values(ATTENTION).every(item => item.label.length > 3))
  const noState = createSimulation(0)
  assert.equal(simulationShot(noState), null)
})

test('pause freezes automatic interpolation but explicit return, focus and skip remain available', () => {
  assert.equal(advanceShotTime(.4, .1, { ownership: 'cinematic', paused: true }), .4)
  assert.equal(advanceShotTime(.4, .1, { ownership: 'cinematic', paused: false }), .5)
  assert.equal(advanceShotTime(.4, .1, { ownership: 'returning-character', paused: true }), .5)
  assert.equal(advanceShotTime(.4, .1, { ownership: 'returning-cinematic', paused: true }), .5)
  assert.equal(advanceShotTime(.4, .1, { ownership: 'cinematic', paused: true, skipTransition: true }), .5)
})

test('repeated character return requests preserve the active tween and settle while paused', () => {
  for (const ownership of ['cinematic', 'overridden', 'returning-cinematic'] as const) {
    const original: CinematicView = { ownership, shot: { id: 'ci', stationId: 'ci' }, revision: 4, skipTransition: true, paused: true }
    let returning = requestCharacterReturn(original), elapsed = 0
    assert.equal(returning.ownership, 'returning-character')
    assert.equal(returning.revision, 5)
    assert.equal(returning.skipTransition, false)
    assert.equal(original.ownership, ownership)
    for (let repeat = 0; repeat < 12; repeat++) {
      const next = requestCharacterReturn(returning)
      assert.equal(next, returning, 'a held key must not reset the transition revision')
      returning = next
      elapsed = advanceShotTime(elapsed, .1, returning)
    }
    assert.ok(elapsed >= .9, 'the explicit return can finish despite paused playback')
    const settled: CinematicView = { ...returning, ownership: 'player', shot: null }
    assert.equal(requestCharacterReturn(settled), settled)
  }
})

test('Kubernetes default shots look above the authored district banner without overriding explicit offsets', () => {
  const district = DISTRICTS.find(item => item.id === 'orchestration')!
  const length = Math.hypot(district.center[0], district.center[2])
  const inward = [-district.center[0] / length, -district.center[2] / length]
  const banner = [district.center[0] + inward[0] * 3.5, district.center[1] + 3.05, district.center[2] + inward[1] * 3.5]
  const bounds = measured.get('kubernetes')!
  for (const aspect of [16 / 9, .55]) for (const kind of ['close-up', 'medium', 'incident'] as ShotKind[]) {
    const pose = cinematicPose({ id: 'k8s-focus', stationId: 'kubernetes', kind }, aspect, measured)
    // Check sightlines to all four bottom corners, not just the visual center.
    for (const x of [-1, 1]) for (const z of [-1, 1]) {
      const corner = [bounds.center[0] + x * bounds.size[0] / 2, bounds.center[1] - bounds.size[1] / 2, bounds.center[2] + z * bounds.size[2] / 2]
      const distanceToPlane = (banner[0] - corner[0]) * inward[0] + (banner[2] - corner[2]) * inward[1]
      const viewDepth = (pose.position[0] - corner[0]) * inward[0] + (pose.position[2] - corner[2]) * inward[1]
      const t = distanceToPlane / viewDepth
      if (t > 0 && t < 1) assert.ok(corner[1] + (pose.position[1] - corner[1]) * t > banner[1] + .3, `${kind}/${aspect} clears banner`)
    }
    const explicit = cinematicPose({ id: 'explicit', stationId: 'kubernetes', offset: [0, 4, .2] }, aspect, measured)
    assert.ok(Math.abs((explicit.position[1] - explicit.target[1]) / Math.hypot(explicit.position[0] - explicit.target[0], explicit.position[2] - explicit.target[2]) - 20) < 1e-6)
  }
  const mobile = cinematicPose({ id: 'explicit-mobile', stationId: 'kubernetes', offset: [0, 4, .2], mobileOffset: [0, 2, .4] }, .55, measured)
  assert.ok(Math.abs((mobile.position[1] - mobile.target[1]) / Math.hypot(mobile.position[0] - mobile.target[0], mobile.position[2] - mobile.target[2]) - 5) < 1e-6)
})
