import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DataTexture, PerspectiveCamera, RGBAFormat, Vector3 } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { WORLD_LAYOUT, STATIONS, type Point3 } from '../src/worldConfig.ts'
import { advanceCamera, advanceSteering, angleDelta, cameraObstruction, CAMERA_MODES, dampAngle, desiredCamera, EYE_HEIGHT, FOLLOW_ANCHOR_HEIGHT, INITIAL_HEADING, isImmersive, nextCameraMode, WORLD_CHARACTER_SCALE } from '../src/game/camera.ts'
import { immersiveDirection, isPositionSafe, moveCharacter, steeringInput, surfaceAt } from '../src/game/navigation.ts'

const close = (actual: number, expected: number, epsilon = 1e-8) => assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} differs from ${expected}`)
const finite = (point: Point3) => point.every(Number.isFinite)

test('third-person framing stays behind and slightly above Awushi while looking ahead', () => {
  for (const aspect of [.45, .75, 1, 1.6, 2.2]) for (const heading of [0, .7, Math.PI, -2.4, INITIAL_HEADING]) {
    const player: Point3 = [0, 0, 0]
    const pose = desiredCamera('third-person', player, aspect, heading)
    const facing = new Vector3(Math.sin(heading), 0, Math.cos(heading))
    const offset = new Vector3(...pose.position).sub(new Vector3(...player))
    assert.ok(offset.dot(facing) < -3.5, 'Camera must be behind the facing direction')
    assert.ok(pose.position[1] > FOLLOW_ANCHOR_HEIGHT && pose.position[1] < 4)
    assert.ok(new Vector3(...pose.target).dot(facing) > 2, 'Look-ahead must show the route in front')
    const horizon = Math.hypot(pose.position[0] - pose.target[0], pose.position[2] - pose.target[2])
    const downAngle = Math.atan2(pose.position[1] - pose.target[1], horizon)
    assert.ok(downAngle > 0 && downAngle < Math.PI / 6, 'Default view should not look steeply down')
    const camera = new PerspectiveCamera(pose.fov, aspect, .08, 180)
    camera.position.fromArray(pose.position); camera.lookAt(new Vector3(...pose.target)); camera.updateMatrixWorld()
    const body = new Vector3(0, 1, 0).project(camera), feet = new Vector3(0, 0, 0).project(camera), crown = new Vector3(0, 3.9 * WORLD_CHARACTER_SCALE, 0).project(camera)
    assert.ok(Math.abs(body.x) < .001 && body.y < 0 && body.y > -.6, 'Awushi belongs in the lower-middle of the frame')
    assert.ok(feet.y > -.9 && crown.y < .8, 'Feet and crown should remain comfortably framed')
  }
})

test('first-person height matches the exported eye bones at the runtime character scale', async () => {
  const loader = new GLTFLoader()
  loader.register(() => ({ name: 'LOCAL_CAMERA_TEST_TEXTURE', loadTexture: () => Promise.resolve(new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, RGBAFormat)) }))
  const bytes = readFileSync(new URL('../public/assets/awushi.glb', import.meta.url))
  const model = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')
  model.scene.updateMatrixWorld(true)
  const eye = model.scene.getObjectByName('eye_L')!
  assert.ok(eye)
  const eyeHeight = eye.getWorldPosition(new Vector3()).y * WORLD_CHARACTER_SCALE
  close(EYE_HEIGHT, eyeHeight, .0001)
  for (const district of [WORLD_LAYOUT.hub, ...WORLD_LAYOUT.districts]) {
    const pose = desiredCamera('first-person', district.center, .6, .75, .2)
    close(pose.position[1], district.center[1] + eyeHeight, .0001)
    close(pose.target[1], pose.position[1])
    assert.ok(pose.target[0] > pose.position[0] && pose.target[2] > pose.position[2])
  }
})

test('first-person pitch and third-person distance stay bounded without turning over', () => {
  for (const pitch of [-10, -.9, .2, 1.3, 10]) {
    const pose = desiredCamera('first-person', [0, 0, 0], 1.6, 0, pitch)
    assert.ok(pose.target[2] > pose.position[2], 'Pitch must not flip the view backwards')
    close(Math.hypot(...pose.target.map((value, axis) => value - pose.position[axis])), 6)
    assert.ok(finite(pose.position) && finite(pose.target))
  }
  for (const distance of [-100, 0, 3.8, 8, 100]) {
    const pose = desiredCamera('third-person', [0, 0, 0], 1.6, 0, .2, distance)
    const reach = Math.hypot(pose.position[0], pose.position[2])
    assert.ok(reach >= 3.8 && reach <= 8)
  }
})

test('four mode cycle has two perspective modes and stable tactical framing', () => {
  let current = CAMERA_MODES[0]
  assert.equal(current, 'third-person')
  for (const expected of ['first-person', 'overview', 'isometric', 'third-person']) { current = nextCameraMode(current); assert.equal(current, expected) }
  assert.ok(isImmersive('third-person') && isImmersive('first-person'))
  assert.ok(!isImmersive('overview') && !isImmersive('isometric'))
  for (const mode of CAMERA_MODES) {
    const pose = desiredCamera(mode, [0, 0, 1.5], .5)
    assert.ok(finite(pose.position) && finite(pose.target) && Number.isFinite(pose.fov))
    if (isImmersive(mode)) assert.ok(pose.fov! >= 58 && pose.fov! <= 75)
    else assert.ok(pose.span >= 18)
  }
})

test('angle interpolation crosses the wrap boundary by the short path without a full flip', () => {
  const from = Math.PI - .04, target = -Math.PI + .04
  close(angleDelta(from, target), .08)
  let angle = from
  for (let frame = 0; frame < 60; frame++) {
    const next = dampAngle(angle, target, 12, 1 / 60)
    assert.ok(Math.abs(next - angle) < .08)
    angle = next
  }
  assert.ok(Math.abs(angle - from) < .081)
  assert.ok(Math.abs(angleDelta(angle, target)) < .00001)
  close(dampAngle(from, target, 12, -1), from)
})

test('camera pose and yaw damping agree at 15, 60 and 144 FPS', () => {
  const from = desiredCamera('isometric', [0, 0, 0], 1.6), target = desiredCamera('third-person', [0, 0, 0], 1.6, .4)
  const samples = [15, 60, 144].map(fps => {
    let pose = from, yaw = Math.PI - .2
    for (let frame = 0; frame < fps; frame++) { pose = advanceCamera(pose, target, 1 / fps, 10); yaw = dampAngle(yaw, -Math.PI + .2, 16, 1 / fps) }
    return { pose, yaw }
  })
  for (const sample of samples) {
    for (let axis = 0; axis < 3; axis++) { close(sample.pose.position[axis], samples[0].pose.position[axis]); close(sample.pose.target[axis], samples[0].pose.target[axis]) }
    close(sample.pose.fov!, samples[0].pose.fov!); close(sample.yaw, samples[0].yaw)
  }
})

test('camera obstruction is safe from many playable approach angles around all seventeen facilities', () => {
  for (const station of STATIONS) {
    let approaches = 0
    for (let index = 0; index < 48; index++) {
      const angle = index / 48 * Math.PI * 2
      const x = Math.sin(angle), z = Math.cos(angle), radius = station.radius + .36
      const anchor: Point3 = [station.position[0] + x * radius, station.position[1] + FOLLOW_ANCHOR_HEIGHT, station.position[2] + z * radius]
      if (!isPositionSafe(anchor[0], anchor[2])) continue
      const ideal: Point3 = [station.position[0] - x * (station.radius + 4), anchor[1], station.position[2] - z * (station.radius + 4)]
      const result = cameraObstruction(anchor, ideal)
      assert.ok(result.obstructed && result.fraction >= 0 && result.fraction < 1, station.id)
      assert.ok(Math.hypot(result.position[0] - station.position[0], result.position[2] - station.position[2]) >= station.radius + .28 - 1e-8, station.id)
      assert.ok(finite(result.position))
      approaches++
    }
    assert.ok(approaches >= 8, `${station.id} has insufficient tested approach angles: ${approaches}`)
  }
})

test('a very short wall clearance cannot force a long camera boom through the collider', () => {
  const station = STATIONS[0]
  const isolated = { ...WORLD_LAYOUT, stations: [station] }
  const anchor: Point3 = [station.position[0] + station.radius + .34, station.position[1] + 1.55, station.position[2]]
  const desired: Point3 = [anchor[0] - 30, anchor[1], anchor[2]]
  const result = cameraObstruction(anchor, desired, isolated)
  assert.ok(result.obstructed)
  assert.equal(result.fraction, 0, 'There is less than the required .12m clearance; collapse safely to the anchor')
  assert.deepEqual(result.position, anchor)
})

test('player collision excludes invalid camera anchors and an inside anchor never creates a boom jump', () => {
  for (const station of STATIONS) {
    const isolated = { ...WORLD_LAYOUT, stations: [station] }
    const anchor: Point3 = [station.position[0], station.position[1] + FOLLOW_ANCHOR_HEIGHT, station.position[2]]
    assert.equal(isPositionSafe(anchor[0], anchor[2], isolated), false)
    assert.equal(isPositionSafe(anchor[0] + station.radius + .28, anchor[2], isolated), false, 'Player radius must keep the eye outside the camera cylinder')
    const result = cameraObstruction(anchor, [anchor[0] + 8, anchor[1], anchor[2]], isolated)
    assert.equal(result.fraction, 0)
    assert.deepEqual(result.position, anchor)
    assert.ok(finite(result.position))
  }
})

test('roof clearance and rays pointing away from a building do not create false obstructions', () => {
  const station = STATIONS[0], isolated = { ...WORLD_LAYOUT, stations: [station] }
  const above: Point3 = [station.position[0] - 4, station.position[1] + 5, station.position[2]]
  assert.equal(cameraObstruction(above, [station.position[0] + 4, above[1], above[2]], isolated).obstructed, false)
  const beside: Point3 = [station.position[0] + station.radius + 1, station.position[1] + 1.5, station.position[2]]
  assert.equal(cameraObstruction(beside, [beside[0] + 5, beside[1], beside[2]], isolated).obstructed, false)
})

test('camera floor clearance and first-person eye height remain valid at every bridge sample', () => {
  for (const bridge of WORLD_LAYOUT.bridges) for (const point of bridge.points) {
    const floor = surfaceAt(point[0], point[2], WORLD_LAYOUT, 0)
    assert.ok(floor, `${bridge.id}: missing surface`)
    const anchor: Point3 = [point[0], floor.height + 2, point[2]]
    const clamped = cameraObstruction(anchor, [point[0], floor.height - 1, point[2]])
    assert.ok(clamped.position[1] >= floor.height + .38 - 1e-8)
    const first = desiredCamera('first-person', [point[0], floor.height, point[2]], .6)
    close(first.position[1], floor.height + EYE_HEIGHT)
    assert.ok(first.position[1] > point[1] + 1, 'The eye level clears the actual bridge deck and rails')
  }
})

test('first-person and third-person share consistent forward/back and keyboard/arrow steering', () => {
  for (const heading of [-4, -Math.PI, 0, .7, Math.PI, 7]) {
    const forward = immersiveDirection(new Set(['KeyW']), heading), arrow = immersiveDirection(new Set(['ArrowUp']), heading)
    const backward = immersiveDirection(new Set(['KeyS']), heading)
    assert.deepEqual(forward, arrow)
    assert.deepEqual(backward, immersiveDirection(new Set(['ArrowDown']), heading))
    close(forward.x, Math.sin(heading)); close(forward.z, Math.cos(heading))
    close(backward.x, -forward.x); close(backward.z, -forward.z)
    assert.equal(immersiveDirection(new Set(['KeyA']), heading).moving, false, 'A/D steer instead of introducing a second movement basis')
    assert.equal(immersiveDirection(new Set(['KeyW', 'KeyS']), heading).moving, false)
  }
  assert.equal(steeringInput(new Set(['KeyA'])), steeringInput(new Set(['ArrowLeft'])))
  assert.equal(steeringInput(new Set(['KeyD'])), steeringInput(new Set(['ArrowRight'])))
  assert.equal(steeringInput(new Set(['KeyA', 'KeyD'])), 0)
  assert.equal(steeringInput(new Set(['KeyA'])), 1)
  assert.equal(steeringInput(new Set(['KeyD'])), -1)
})

test('steering and forward travel remain stable across low and high frame rates', () => {
  for (const key of ['ArrowLeft', 'KeyA', 'ArrowRight', 'KeyD']) {
    const results = [15, 60, 144].map(fps => {
      let targetYaw = 0, viewYaw = 0, position: Point3 = [0, 0, 0]
      const keys = new Set(['KeyW', key])
      for (let frame = 0; frame < fps; frame++) {
        const next = advanceSteering(viewYaw, targetYaw, steeringInput(keys), 1 / fps)
        targetYaw = next.targetYaw; viewYaw = next.viewYaw
        const direction = immersiveDirection(keys, next.movementYaw)
        position = moveCharacter(position, direction.x * 2.65 / fps, direction.z * 2.65 / fps).position
      }
      return { position, viewYaw }
    })
    for (const result of results) {
      assert.ok(Math.hypot(result.position[0] - results[2].position[0], result.position[2] - results[2].position[2]) < .02, 'Midpoint movement should agree within 2cm after one second')
      close(result.viewYaw, results[2].viewYaw)
      assert.ok(isPositionSafe(result.position[0], result.position[2]))
    }
  }
})

test('steering preserves mouse look smoothing, takes the short wrap path and ignores negative time', () => {
  const from = Math.PI - .04, target = -Math.PI + .04
  const still = advanceSteering(from, target, 0, 1 / 60)
  close(still.viewYaw, dampAngle(from, target, 16, 1 / 60))
  close(still.targetYaw, target)
  const turning = advanceSteering(from, target, 1, 1 / 60)
  assert.ok(turning.viewYaw > from && turning.viewYaw - from < .08)
  close(turning.movementYaw, from + angleDelta(from, turning.viewYaw) / 2)
  assert.deepEqual(advanceSteering(from, target, 1, -1), { targetYaw: target, viewYaw: from, movementYaw: from })
})
