import { WORLD_LAYOUT, type Point3, type WorldLayout } from '../worldConfig'
import type { CameraMode, View } from './types'
import { surfaceAt } from './navigation'
export const FOLLOW_AZIMUTH = Math.atan2(14, 18)
export const INITIAL_HEADING = Math.atan2(-18, -10.5)
export const WORLD_CHARACTER_SCALE = .58
export const EYE_HEIGHT = 2.1 * WORLD_CHARACTER_SCALE
export const FOLLOW_ANCHOR_HEIGHT = 1.55
export const CAMERA_MODES: readonly CameraMode[] = ['third-person', 'first-person', 'overview', 'isometric']
export type CameraPose = { position: Point3; target: Point3; span: number; fov?: number }
export const damp = (from: number, to: number, rate: number, dt: number) => from + (to - from) * (1 - Math.exp(-rate * Math.max(0, dt)))
export const angleDelta = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from))
export const dampAngle = (from: number, to: number, rate: number, dt: number) => from + angleDelta(from, to) * (1 - Math.exp(-rate * Math.max(0, dt)))
/** Integrate the turning target over the frame, so held steering has the same lag at every frame rate. */
export function advanceSteering(viewYaw: number, targetYaw: number, input: number, dt: number) {
  const elapsed = Math.max(0, dt), velocity = input * 1.8
  const alpha = -Math.expm1(-16 * elapsed)
  const nextView = viewYaw + angleDelta(viewYaw, targetYaw) * alpha + velocity * (elapsed - alpha / 16)
  return {
    targetYaw: targetYaw + velocity * elapsed,
    viewYaw: nextView,
    movementYaw: viewYaw + angleDelta(viewYaw, nextView) / 2,
  }
}
export const isImmersive = (mode: CameraMode) => mode === 'third-person' || mode === 'first-person'
export function nextCameraMode(mode: CameraMode) { return CAMERA_MODES[(CAMERA_MODES.indexOf(mode) + 1) % CAMERA_MODES.length] }

/** Camera boom versus simple authored building cylinders; independent of render triangles. */
export function cameraObstruction(anchor: Point3, desired: Point3, layout: WorldLayout = WORLD_LAYOUT) {
  let fraction = 1
  const dx = desired[0] - anchor[0], dy = desired[1] - anchor[1], dz = desired[2] - anchor[2]
  const length = Math.hypot(dx, dy, dz)
  for (const station of layout.stations) {
    const x = anchor[0] - station.position[0], z = anchor[2] - station.position[2]
    const radius = station.radius + .28
    const a = dx * dx + dz * dz, b = 2 * (x * dx + z * dz), c = x * x + z * z - radius * radius
    const discriminant = b * b - 4 * a * c
    if (a < 1e-10 || discriminant < 0) continue
    const root = Math.sqrt(discriminant)
    const enter = Math.max(0, (-b - root) / (2 * a)), leave = Math.min(1, (-b + root) / (2 * a))
    let low = 0, high = 1
    const floor = station.position[1] - .15, ceiling = station.position[1] + 3.5
    if (Math.abs(dy) < 1e-9) { if (anchor[1] < floor || anchor[1] > ceiling) continue }
    else { const t0 = (floor - anchor[1]) / dy, t1 = (ceiling - anchor[1]) / dy; low = Math.min(t0, t1); high = Math.max(t0, t1) }
    const entry = Math.max(enter, low), exit = Math.min(leave, high)
    if (entry <= exit && entry <= 1 && exit >= 0) fraction = Math.min(fraction, Math.max(0, entry - .12 / Math.max(length, .01)))
  }
  const position = anchor.map((value, axis) => value + (desired[axis] - value) * fraction) as Point3
  const floor = surfaceAt(position[0], position[2], layout, 0)?.height
  if (floor !== undefined) position[1] = Math.max(position[1], floor + .38)
  return { position, fraction, obstructed: fraction < .999 }
}
export function desiredCamera(mode: CameraMode, player: Point3, aspect: number, heading = INITIAL_HEADING, pitch = .2, distance = 5.8): CameraPose {
  if (mode === 'overview') return { position: [34, 52, 44], target: [0, 0, 0], span: 64 / Math.min(1, Math.max(.3, aspect)), fov: 18 }
  if (mode === 'isometric') {
    const target: Point3 = [player[0], player[1] + 1.05, player[2]]
    return { target, position: [target[0] + 14, target[1] + 13, target[2] + 18], span: aspect < .8 ? 18 : 13.5, fov: 18 }
  }
  const x = Math.sin(heading), z = Math.cos(heading)
  const eye: Point3 = [player[0], player[1] + EYE_HEIGHT, player[2]]
  if (mode === 'first-person') {
    const lookPitch = Math.max(-1.1, Math.min(1.1, pitch - .2))
    return { position: eye, target: [eye[0] + x * Math.cos(lookPitch) * 6, eye[1] - Math.sin(lookPitch) * 6, eye[2] + z * Math.cos(lookPitch) * 6], span: 5, fov: aspect < .8 ? 72 : 68 }
  }
  const reach = Math.max(3.8, Math.min(8, distance)) * (aspect < .8 ? 1.12 : 1)
  const elevation = Math.max(.6, reach * Math.sin(Math.max(-.02, Math.min(.72, pitch))) + .45)
  const target: Point3 = [eye[0] + x * 2.2, player[1] + 1.5, eye[2] + z * 2.2]
  const anchor: Point3 = [player[0], player[1] + FOLLOW_ANCHOR_HEIGHT, player[2]]
  const ideal: Point3 = [player[0] - x * reach, anchor[1] + elevation, player[2] - z * reach]
  return { position: cameraObstruction(anchor, ideal).position, target, span: 6, fov: aspect < .8 ? 64 : 58 }
}
export function studioCamera(view: View, aspect: number): CameraPose {
  const target: Point3 = [0, 1.9, 0]
  const positions: Record<View, Point3> = { 'three-quarter': [6, 3.6, 10], front: [0, 2.4, 12], side: [12, 2.4, 0], back: [0, 2.4, -12] }
  return { target, position: positions[view], span: aspect < .8 ? 6.3 : 5.2, fov: 18 }
}
export function advanceCamera(current: CameraPose, target: CameraPose, dt: number, rate = 10): CameraPose {
  return { position: current.position.map((x, i) => damp(x, target.position[i], rate, dt)) as Point3, target: current.target.map((x, i) => damp(x, target.target[i], rate, dt)) as Point3, span: damp(current.span, target.span, rate, dt), fov: damp(current.fov ?? 58, target.fov ?? 58, rate, dt) }
}
