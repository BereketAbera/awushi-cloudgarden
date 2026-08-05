import { getStation, type Point3 } from '../worldConfig'
import type { EnvironmentId, SimulationEvent } from './domain'
import { stageById } from './scenario'

export type EffectPrototype = 'CodePacket' | 'ImagePackage' | 'ConfigPacket' | 'SignalOrb'
export type EventEffect = { id: number; timestamp: number; durationMs: number; prototype: EffectPrototype; from: Point3; to: Point3 }
const prototypes = { code: 'CodePacket', image: 'ImagePackage', config: 'ConfigPacket', sync: 'ConfigPacket', telemetry: 'SignalOrb', approval: 'ConfigPacket', failure: 'SignalOrb', recovery: 'SignalOrb' } as const

/** Only real state-machine events create packets; history is capped by the engine. */
export function recentEventEffects(history: readonly SimulationEvent[], environment: EnvironmentId): EventEffect[] {
  return history.filter(event => event.environment === environment && event.visual && ['stage-started', 'approved', 'failed', 'retrying', 'backup-created', 'restore-completed', 'operation'].includes(event.type))
    .flatMap(event => {
      const visual = event.visual!
      const from = getStation(visual.fromStationId), to = getStation(visual.toStationId)
      if (!from || !to) return []
      return [{ id: event.id, timestamp: event.timestamp, durationMs: Math.max(700, Math.min(2200, stageById(event.stageId)?.durationMs ?? 1200)), prototype: prototypes[visual.kind], from: from.position, to: to.position }]
    }).slice(-8)
}

/** Render interpolation has no authority to advance or complete a simulation stage. */
export function effectPosition(effect: EventEffect, progress: number, reducedMotion: boolean): Point3 {
  const t = reducedMotion ? 1 : Math.max(0, Math.min(1, progress))
  const distance = Math.hypot(effect.to[0] - effect.from[0], effect.to[2] - effect.from[2])
  return [effect.from[0] + (effect.to[0] - effect.from[0]) * t,
    effect.from[1] + (effect.to[1] - effect.from[1]) * t + 2.75 + (reducedMotion ? 0 : Math.sin(Math.PI * t) * Math.min(3.5, distance * .12)),
    effect.from[2] + (effect.to[2] - effect.from[2]) * t]
}
