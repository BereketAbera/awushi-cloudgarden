import type { CameraMode, View } from './types'
import type { Point3 } from '../worldConfig'
export const FOLLOW_AZIMUTH = Math.atan2(14, 18)
export type CameraPose = { position: Point3; target: Point3; span: number }
export const damp = (from: number, to: number, rate: number, dt: number) => from + (to - from) * (1 - Math.exp(-rate * Math.max(0, dt)))
export function desiredCamera(mode: CameraMode, player: Point3, aspect: number): CameraPose {
  if (mode === 'overview') return { position: [34, 52, 44], target: [0, 0, 0], span: 64 / Math.min(1, Math.max(0.3, aspect)) }
  const target: Point3 = [player[0], player[1] + 1.05, player[2]]
  return { target, position: [target[0] + 14, target[1] + 13, target[2] + 18], span: mode === 'explore' ? 26 / Math.min(1, aspect) : aspect < 0.8 ? 18 : 13.5 }
}
export function studioCamera(view: View, aspect: number): CameraPose {
  const target: Point3 = [0, 1.9, 0]
  const positions: Record<View, Point3> = { 'three-quarter': [6, 3.6, 10], front: [0, 2.4, 12], side: [12, 2.4, 0], back: [0, 2.4, -12] }
  return { target, position: positions[view], span: aspect < 0.8 ? 6.3 : 5.2 }
}
export function advanceCamera(current: CameraPose, target: CameraPose, dt: number, rate = 10): CameraPose {
  return { position: current.position.map((x, i) => damp(x, target.position[i], rate, dt)) as Point3, target: current.target.map((x, i) => damp(x, target.target[i], rate, dt)) as Point3, span: damp(current.span, target.span, rate, dt) }
}
