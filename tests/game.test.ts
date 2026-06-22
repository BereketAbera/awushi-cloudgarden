import test from 'node:test'
import assert from 'node:assert/strict'
import { WORLD_LAYOUT, STATIONS, DISTRICTS, type Point3 } from '../src/worldConfig.ts'
import { eligibleStation, isPositionSafe, moveCharacter, movementDirection, surfaceAt } from '../src/game/navigation.ts'
import { advanceCamera, desiredCamera, studioCamera, FOLLOW_AZIMUTH } from '../src/game/camera.ts'
import { createBehavior, stepBehavior } from '../src/game/behavior.ts'
import { createProgress, discoverStation, enterDistrict, introductoryProgress, parseProgress, resetProgress } from '../src/game/progress.ts'

test('all six districts and 17 stations are connected by collision-safe routes', () => {
  assert.equal(DISTRICTS.length, 6); assert.equal(STATIONS.length, 17)
  const step = .4, queue: [number, number][] = [[0, 0]], seen = new Set(['0,0'])
  for (let head = 0; head < queue.length; head++) {
    const [ix, iz] = queue[head]
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = ix + dx, nz = iz + dz, key = `${nx},${nz}`
      if (seen.has(key) || Math.abs(nx * step) > 29 || Math.abs(nz * step) > 29) continue
      if (!isPositionSafe(nx * step, nz * step) || !isPositionSafe((ix + dx / 2) * step, (iz + dz / 2) * step)) continue
      seen.add(key); queue.push([nx, nz])
    }
  }
  for (const district of DISTRICTS) assert.ok(queue.some(([x, z]) => Math.hypot(x * step - district.center[0], z * step - district.center[2]) < .7), `${district.id} has no walkable route from hub`)
  for (const station of STATIONS) assert.ok(queue.some(([x, z]) => eligibleStation([x * step, station.position[1], z * step]) === station.id), `${station.id} cannot be approached`)
})

test('movement remains on surfaces and cannot tunnel through station colliders', () => {
  const station = STATIONS[0]
  const from: Point3 = [station.position[0] - station.radius - .5, station.position[1], station.position[2]]
  const result = moveCharacter(from, station.radius * 2 + 1, 0)
  assert.equal(result.blocked, true)
  assert.ok(isPositionSafe(result.position[0], result.position[2]))
  assert.ok(result.position[0] < station.position[0])
  const edge = moveCharacter([0, 0, 0], 80, 80)
  assert.equal(edge.blocked, true); assert.ok(isPositionSafe(edge.position[0], edge.position[2]))
})

test('every bridge center is walkable and follows the authored elevation', () => {
  for (const bridge of WORLD_LAYOUT.bridges) {
    for (const point of bridge.points.slice(2, -2)) {
      const hit = surfaceAt(point[0], point[2])
      assert.ok(hit, `${bridge.id} has a gap`)
      if (hit.bridgeId) assert.ok(Math.abs(hit.height - point[1]) < .001)
    }
  }
  assert.equal(surfaceAt(50, 50), null)
})

test('camera-relative movement is normalized with stable diagonal speed', () => {
  for (const azimuth of [0, Math.PI / 2, FOLLOW_AZIMUTH]) {
    const forward = movementDirection(new Set(['KeyW']), azimuth)
    assert.ok(Math.abs(Math.hypot(forward.x, forward.z) - 1) < 1e-9)
    assert.ok(Math.abs(forward.x + Math.sin(azimuth)) < 1e-9)
    const diagonal = movementDirection(new Set(['KeyW', 'KeyD']), azimuth)
    assert.ok(Math.abs(Math.hypot(diagonal.x, diagonal.z) - 1) < 1e-9)
  }
  assert.equal(movementDirection(new Set(), 0).moving, false)
})

test('interaction proximity accounts for elevation and does not reach remote stations', () => {
  const station = STATIONS[0]
  assert.equal(eligibleStation([station.position[0], station.position[1], station.position[2]]), station.id)
  assert.equal(eligibleStation([station.position[0], station.position[1] + 2, station.position[2]]), null)
  assert.equal(eligibleStation(WORLD_LAYOUT.spawn), null)
})

test('orthographic follow preserves framing while translation tracks the character', () => {
  const first = desiredCamera('follow', [0, 0, 0], 1.5), second = desiredCamera('follow', [12, .6, -7], 1.5)
  assert.equal(first.span, second.span)
  for (let axis = 0; axis < 3; axis++) assert.ok(Math.abs((first.position[axis] - first.target[axis]) - (second.position[axis] - second.target[axis])) < 1e-9)
  assert.ok(desiredCamera('overview', [20, 1, 10], .5).span >= 100)
  assert.ok(studioCamera('front', 1.5).position[2] > 0)
  assert.ok(studioCamera('back', 1.5).position[2] < 0)
})

test('camera smoothing is time-step independent and converges without overshoot', () => {
  const from = desiredCamera('follow', [0, 0, 0], 1.5), to = desiredCamera('follow', [10, 0, -10], 1.5)
  let at30 = from, at60 = from
  for (let i = 0; i < 30; i++) at30 = advanceCamera(at30, to, 1 / 30)
  for (let i = 0; i < 60; i++) at60 = advanceCamera(at60, to, 1 / 60)
  for (let axis = 0; axis < 3; axis++) {
    assert.ok(Math.abs(at30.position[axis] - at60.position[axis]) < 1e-8)
    assert.ok(Math.abs(at60.position[axis] - to.position[axis]) < .001)
  }
})

test('contextual expressions respond without changing the requested locomotion clip', () => {
  const base = { moving: false, blocked: false, running: false, nearby: false, reading: false, clip: 'Idle' as const }
  let state = createBehavior()
  assert.equal(stepBehavior(state, { ...base, nearby: true }, .1).expression, 'Curious')
  assert.equal(stepBehavior(state, { ...base, reading: true }, .1).expression, 'Thinking')
  assert.equal(stepBehavior(state, { ...base, moving: true, running: true }, .1).expression, 'Excited')
  const blocked = stepBehavior(state, { ...base, moving: true, blocked: true }, .6)
  assert.equal(blocked.expression, 'Worried'); state = blocked.state
  const recovering = stepBehavior(state, { ...base, moving: true }, .1)
  assert.equal(recovering.expression, 'Determined')
  assert.equal(stepBehavior(createBehavior(), base, 23).expression, 'Sleepy')
  assert.equal(stepBehavior(state, { ...base, reaction: 'Happy' }, .1).expression, 'Happy')
  assert.equal(stepBehavior(state, { ...base, clip: 'Celebrate' }, .1).expression, 'Celebrating')
})

test('progress is local, idempotent, validated on load, and resets cleanly', () => {
  let progress = createProgress()
  progress = enterDistrict(progress, 'development')
  progress = enterDistrict(progress, 'development')
  assert.equal(progress.districts.length, 1)
  progress = discoverStation(progress, 'github'); progress = discoverStation(progress, 'github')
  assert.deepEqual(progress.stations, ['github'])
  assert.equal(introductoryProgress(progress), 1)
  assert.deepEqual(parseProgress(JSON.stringify(progress)), progress)
  assert.deepEqual(parseProgress('bad json'), createProgress())
  assert.deepEqual(parseProgress(JSON.stringify({version: 2, districts: ['fake'], stations: ['fake']})), createProgress())
  for (const district of DISTRICTS) progress = discoverStation(progress, district.introStation)
  assert.equal(introductoryProgress(progress), 6)
  assert.deepEqual(resetProgress(), createProgress())
})
