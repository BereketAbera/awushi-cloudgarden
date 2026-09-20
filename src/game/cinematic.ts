import { STATIONS, WORLD_LAYOUT, getStation, type Point3 } from '../worldConfig'
import type { CameraPose } from './camera'
import type { SimulationState } from '../simulation/domain'
import { stageById } from '../simulation/scenario'

export type CameraOwnership = 'player' | 'cinematic' | 'overridden' | 'returning-cinematic' | 'returning-character'
export type ShotKind = 'establishing' | 'close-up' | 'medium' | 'transition' | 'relationship' | 'incident' | 'completion'
export type AttentionStatus = 'active' | 'healthy' | 'waiting' | 'failed' | 'neutral'
export type ShotRequest = {
  id: string; stationId: string; kind?: ShotKind; relatedStationIds?: string[]; status?: AttentionStatus; label?: string
  offset?: Point3; alternateOffset?: Point3; mobileOffset?: Point3; distance?: number
  duration?: number; minimumVisibleFraction?: number
}
export type CinematicView = { ownership: CameraOwnership; shot: ShotRequest | null; revision: number; skipTransition?: boolean; autoMove?: boolean; paused?: boolean }
export type SubjectBounds = { center: Point3; size: Point3 }
export type BoundsLookup = ReadonlyMap<string, SubjectBounds>
export const ATTENTION = {
  active: { color: '#72c9ff', icon: '▶', label: 'Processing' },
  healthy: { color: '#8cf0bc', icon: '✓', label: 'Healthy' },
  waiting: { color: '#ffce72', icon: 'Ⅱ', label: 'Needs your decision' },
  failed: { color: '#ff817c', icon: '!', label: 'Needs investigation' },
  neutral: { color: '#d3e0e5', icon: '◇', label: 'Explore' },
} as const
export const cinematicOwnsCamera = (view?: CinematicView) => Boolean(view && view.autoMove !== false && view.shot && ['cinematic', 'returning-cinematic', 'overridden'].includes(view.ownership))
export function fallbackBounds(stationId: string): SubjectBounds {
  const station = getStation(stationId)
  return station ? { center: [station.position[0], station.position[1] + 1.4, station.position[2]], size: [station.radius * 2, 2.8, station.radius * 2] } : { center: [0, 1, 0], size: [5, 3, 5] }
}
export function combinedBounds(stationIds: readonly string[], measured: BoundsLookup = new Map()): SubjectBounds {
  const bounds = stationIds.map(id => measured.get(id) ?? fallbackBounds(id))
  const min: Point3 = [Infinity, Infinity, Infinity], max: Point3 = [-Infinity, -Infinity, -Infinity]
  for (const bound of bounds) for (let axis = 0; axis < 3; axis++) {
    min[axis] = Math.min(min[axis], bound.center[axis] - bound.size[axis] / 2)
    max[axis] = Math.max(max[axis], bound.center[axis] + bound.size[axis] / 2)
  }
  if (!bounds.length) return fallbackBounds('')
  return { center: min.map((value, axis) => (value + max[axis]) / 2) as Point3, size: min.map((value, axis) => Math.max(.3, max[axis] - value)) as Point3 }
}
/** Whether a sightline crosses another authored building. The subjects cannot occlude themselves. */
export function shotOccluded(position: Point3, target: Point3, excluded: readonly string[]) {
  const dx = position[0] - target[0], dy = position[1] - target[1], dz = position[2] - target[2]
  const length = dx * dx + dz * dz
  return STATIONS.some(station => {
    if (excluded.includes(station.id) || length < .001) return false
    const t = Math.max(0, Math.min(1, ((station.position[0] - target[0]) * dx + (station.position[2] - target[2]) * dz) / length))
    const y = target[1] + dy * t
    return t > .02 && t < .98 && y > station.position[1] - .1 && y < station.position[1] + 3.8 && Math.hypot(target[0] + dx * t - station.position[0], target[2] + dz * t - station.position[2]) < station.radius + .25
  })
}
const SHOTS: Record<ShotKind, { offset: Point3; fill: number; duration: number }> = {
  establishing: { offset: [1, 1.2, 1.4], fill: .62, duration: 1.15 },
  'close-up': { offset: [.8, .65, 1.3], fill: .65, duration: .9 },
  medium: { offset: [1, .85, 1.3], fill: .57, duration: 1 },
  transition: { offset: [1, 1.1, 1.3], fill: .58, duration: 1.1 },
  relationship: { offset: [.65, 1.3, 1.1], fill: .62, duration: 1.1 },
  incident: { offset: [.7, .75, 1.4], fill: .68, duration: .85 },
  completion: { offset: [1, 1.15, 1.5], fill: .56, duration: 1.2 },
}
// The elevated district banner crosses the generic inward-facing Kubernetes shot.
// An authored oblique angle looks over it while retaining the cluster and replica display.
const STATION_FRAMING: Readonly<Record<string, { offset: Point3; mobileOffset?: Point3 }>> = {
  kubernetes: { offset: [1.15, 1.85, 1.2], mobileOffset: [1, 2, 1.2] },
}
export function shotDuration(shot: ShotRequest) { return Math.max(.2, Math.min(3, shot.duration ?? SHOTS[shot.kind ?? 'medium'].duration)) }
/** Framing uses a bounding sphere to fit every corner, including portrait viewports. */
export function cinematicPose(shot: ShotRequest, aspect: number, measured: BoundsLookup = new Map()): CameraPose {
  const definition = SHOTS[shot.kind ?? 'medium'], mobile = aspect < .8
  const relationship = shot.kind === 'relationship' || shot.kind === 'transition' || shot.kind === 'establishing'
  const ids = [shot.stationId, ...(relationship ? shot.relatedStationIds ?? [] : [])].filter(id => Boolean(getStation(id)))
  const bounds = combinedBounds(ids, measured)
  const station = getStation(shot.stationId)
  const fov = mobile ? 52 : 44
  const halfAngle = Math.atan(Math.tan(fov * Math.PI / 360) * Math.min(1, Math.max(.25, aspect)))
  const radius = Math.hypot(...bounds.size) / 2
  const fill = Math.max(.35, Math.min(.8, shot.minimumVisibleFraction ?? definition.fill))
  const distance = Math.max(shot.distance ?? 0, radius / Math.sin(halfAngle) / fill, 4.5)
  const authored = STATION_FRAMING[shot.stationId]
  const raw = mobile
    ? shot.mobileOffset ?? shot.offset ?? authored?.mobileOffset ?? authored?.offset ?? definition.offset
    : shot.offset ?? authored?.offset ?? definition.offset
  // Face the inward-facing building facade from the common, using its authored orientation.
  const angle = station?.rotation ?? 0
  const rotated: Point3 = [raw[0] * Math.cos(angle) + raw[2] * Math.sin(angle), raw[1], raw[2] * Math.cos(angle) - raw[0] * Math.sin(angle)]
  const target: Point3 = [...bounds.center]
  const positionAt = (offset: Point3): Point3 => {
    const length = Math.hypot(...offset)
    return target.map((value, axis) => value + offset[axis] / length * distance) as Point3
  }
  const alternates: Point3[] = [rotated, shot.alternateOffset ?? [-rotated[2], Math.max(1.2, rotated[1]), rotated[0]], [rotated[2], 2.2, -rotated[0]], [0, 3.8, .6]]
  const position = alternates.map(positionAt).find(candidate => !shotOccluded(candidate, target, ids)) ?? positionAt(alternates.at(-1)!)
  position[1] = Math.max(position[1], (station?.position[1] ?? 0) + 1)
  return { position, target, span: 2 * distance * Math.tan(fov * Math.PI / 360), fov }
}
export function statusForSimulation(simulation: SimulationState): AttentionStatus {
  if (simulation.status === 'idle') {
    const env = simulation.infra.environments[simulation.environment]
    if (env.operations?.incident?.corrected && !env.operations.incident.recovered) return 'active'
    if (env.alert === 'firing' || env.health === 'Degraded' || env.metrics.errorRate > 0) return 'failed'
    if (env.syncStatus === 'Syncing') return 'active'
    if (env.syncStatus === 'OutOfSync') return 'waiting'
    if (Object.keys(env.operations ?? {}).length && env.health === 'Healthy') return 'healthy'
  }
  return simulation.status === 'failed' ? 'failed' : simulation.status === 'waiting-approval' ? 'waiting' : simulation.status === 'succeeded' ? 'healthy' : ['running', 'retrying'].includes(simulation.status) ? 'active' : 'neutral'
}
export function simulationShot(simulation: SimulationState): ShotRequest | null {
  const stage = stageById(simulation.stageId)
  if (!stage) return null
  const latest = simulation.history.filter(event => event.stageId === stage.id && event.environment === simulation.environment).at(-1)
  const status = statusForSimulation(simulation)
  const from = stage.fromStationId ? getStation(stage.fromStationId) : undefined
  const to = stage.toStationId ? getStation(stage.toStationId) : undefined
  const nearby = from && to && Math.hypot(...from.position.map((value, axis) => value - to.position[axis])) < 12
  return { id: `${simulation.runId}:${stage.id}:${latest?.id ?? 0}`, stationId: stage.stationId, kind: status === 'failed' ? 'incident' : status === 'healthy' ? 'completion' : nearby ? 'relationship' : 'close-up', relatedStationIds: [stage.fromStationId, stage.toStationId].filter((id): id is string => Boolean(id && id !== stage.stationId)), status, label: stage.title }
}
export const worldEstablishingShot: ShotRequest = { id: 'world-establishing', stationId: WORLD_LAYOUT.stations[0].id, kind: 'establishing', relatedStationIds: WORLD_LAYOUT.stations.map(station => station.id) }
/** Bounded smooth transition; distant cuts lift over the small buildings instead of crossing them. */
export function interpolateShot(from: CameraPose, to: CameraPose, progress: number): CameraPose {
  const t = Math.max(0, Math.min(1, progress)), ease = t * t * (3 - 2 * t)
  const distance = Math.hypot(...to.position.map((value, axis) => value - from.position[axis]))
  const position = from.position.map((value, axis) => value + (to.position[axis] - value) * ease) as Point3
  position[1] += Math.sin(Math.PI * t) * Math.min(6, Math.max(0, distance - 10) * .15)
  return { position, target: from.target.map((value, axis) => value + (to.target[axis] - value) * ease) as Point3, span: from.span + (to.span - from.span) * ease, fov: (from.fov ?? 58) + ((to.fov ?? 58) - (from.fov ?? 58)) * ease }
}
export type ManualOrbit = { yaw: number; pitch: number; distance: number; target: Point3 }
export function orbitFromPose(pose: CameraPose): ManualOrbit {
  const delta = pose.position.map((value, axis) => value - pose.target[axis]), distance = Math.max(.1, Math.hypot(...delta))
  return { target: [...pose.target], yaw: Math.atan2(delta[0], delta[2]), pitch: Math.asin(Math.max(-1, Math.min(1, delta[1] / distance))), distance }
}
export function manualOrbitPose(orbit: ManualOrbit, pose: CameraPose): CameraPose {
  const reach = orbit.distance * Math.cos(orbit.pitch)
  return { ...pose, target: [...orbit.target], position: [orbit.target[0] + Math.sin(orbit.yaw) * reach, orbit.target[1] + Math.sin(orbit.pitch) * orbit.distance, orbit.target[2] + Math.cos(orbit.yaw) * reach] }
}
/** Pausing freezes an automatic move, while an explicit return/focus command keeps working. */
export function advanceShotTime(elapsed: number, dt: number, view: Pick<CinematicView, 'ownership' | 'paused' | 'skipTransition'>): number {
  const explicit = view.ownership === 'returning-character' || view.ownership === 'returning-cinematic'
  return view.paused && !view.skipTransition && !explicit ? elapsed : elapsed + Math.max(0, Math.min(.1, dt))
}
/** Repeated movement keys must not restart a return already in progress. */
export function requestCharacterReturn(view: CinematicView): CinematicView {
  if (view.ownership === 'player' || view.ownership === 'returning-character') return view
  return { ...view, ownership: 'returning-character', revision: view.revision + 1, skipTransition: false }
}
