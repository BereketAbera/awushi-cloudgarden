import { WORLD_LAYOUT, type Point3, type WorldLayout } from '../worldConfig'
export const PLAYER_RADIUS = 0.34
export type WalkSurface = { height: number; districtId: string; bridgeId?: string }
export function segmentProjection(x: number, z: number, a: Point3, b: Point3) {
  const dx = b[0] - a[0], dz = b[2] - a[2]
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[2]) * dz) / (dx * dx + dz * dz || 1)))
  const px = a[0] + dx * t, pz = a[2] + dz * t
  return { distance: Math.hypot(x - px, z - pz), height: a[1] + (b[1] - a[1]) * t, t }
}
/** Collision uses authored discs/capsules, never a triangulated render mesh. */
export function surfaceAt(x: number, z: number, layout: WorldLayout = WORLD_LAYOUT, margin = PLAYER_RADIUS): WalkSurface | null {
  for (const area of [layout.hub, ...layout.districts]) {
    if (Math.hypot(x - area.center[0], z - area.center[2]) <= area.radius - margin) return { height: area.center[1], districtId: area.id }
  }
  let closest = Infinity, hit: WalkSurface | null = null
  for (const bridge of layout.bridges) for (let i = 1; i < bridge.points.length; i++) {
    const sample = segmentProjection(x, z, bridge.points[i - 1], bridge.points[i])
    if (sample.distance <= bridge.width / 2 - margin && sample.distance < closest) {
      closest = sample.distance; hit = { height: sample.height, districtId: 'skyway', bridgeId: bridge.id }
    }
  }
  return hit
}
export function isPositionSafe(x: number, z: number, layout: WorldLayout = WORLD_LAYOUT) {
  return Boolean(surfaceAt(x, z, layout)) && !layout.stations.some(station => Math.hypot(x - station.position[0], z - station.position[2]) < station.radius + PLAYER_RADIUS)
}
export function moveCharacter(from: Point3, dx: number, dz: number, layout: WorldLayout = WORLD_LAYOUT) {
  let x = from[0], z = from[2], blocked = false
  const count = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.1))
  for (let step = 0; step < count; step++) {
    const nx = x + dx / count, nz = z + dz / count
    if (isPositionSafe(nx, nz, layout)) { x = nx; z = nz }
    else if (isPositionSafe(nx, z, layout)) { x = nx; blocked = true }
    else if (isPositionSafe(x, nz, layout)) { z = nz; blocked = true }
    else blocked = true
  }
  const surface = surfaceAt(x, z, layout)
  return { position: [x, surface?.height ?? from[1], z] as Point3, blocked, districtId: surface?.districtId ?? 'hub' }
}
export function movementDirection(keys: Set<string>, azimuth: number) {
  const x = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'))
  const z = Number(keys.has('KeyS') || keys.has('ArrowDown')) - Number(keys.has('KeyW') || keys.has('ArrowUp'))
  const n = Math.hypot(x, z) || 1
  return { x: (x * Math.cos(azimuth) + z * Math.sin(azimuth)) / n, z: (-x * Math.sin(azimuth) + z * Math.cos(azimuth)) / n, moving: Boolean(x || z) }
}
export function eligibleStation(position: Point3, current: string | null = null, layout: WorldLayout = WORLD_LAYOUT) {
  const candidates = layout.stations.map(station => ({ station, distance: Math.hypot(position[0] - station.position[0], position[2] - station.position[2]) }))
    .filter(({ station, distance }) => distance <= station.radius + 1.4 && Math.abs(position[1] - station.position[1]) < 0.55)
    .sort((a, b) => a.distance - b.distance)
  const previous = candidates.find(({ station }) => station.id === current)
  if (previous && candidates[0] && previous.distance <= candidates[0].distance + 0.25) return previous.station.id
  return candidates[0]?.station.id ?? null
}

/** Immersive modes steer with A/D; W/S follow the view heading without yaw feedback. */
export function immersiveDirection(keys: Set<string>, heading: number) {
  const forward = Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown'))
  return { x: Math.sin(heading) * forward, z: Math.cos(heading) * forward, moving: forward !== 0 }
}
export function steeringInput(keys: Set<string>) {
  return Number(keys.has('KeyA') || keys.has('ArrowLeft')) - Number(keys.has('KeyD') || keys.has('ArrowRight'))
}
