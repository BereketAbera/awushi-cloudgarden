import { getStation, type Point3 } from '../worldConfig'
import type { EnvironmentId, SimulationEvent } from './domain'
import { stageById } from './scenario'

export type EffectPrototype = 'CodePacket' | 'ImagePackage' | 'ConfigPacket' | 'SignalOrb'
export type FlowKind = 'code' | 'image' | 'configuration' | 'secret' | 'traffic' | 'metrics' | 'logs' | 'alert'
export const FLOW_STYLE: Record<FlowKind, { label: string; glyph: string; color: string }> = {
  code: { label: 'Code change', glyph: '</>', color: '#91dcff' },
  image: { label: 'Container image', glyph: '▣', color: '#ffcc8b' },
  configuration: { label: 'Configuration', glyph: '≡', color: '#c7b5ff' },
  secret: { label: 'Secret reference', glyph: '◆', color: '#f0c77c' },
  traffic: { label: 'Ready endpoint signal', glyph: '››', color: '#8cf0bc' },
  metrics: { label: 'Metrics', glyph: '▁▃▆', color: '#86d8fa' },
  logs: { label: 'Log events', glyph: '≡', color: '#d0e8f6' },
  alert: { label: 'Alert status', glyph: '!', color: '#ffb093' },
}
export type EventEffect = { id: number; routeId: string; timestamp: number; durationMs: number; prototype: EffectPrototype; from: Point3; to: Point3; fromStationId: string; toStationId: string; kind: FlowKind; acknowledged: boolean; outcome: 'failed' | 'updated'; message: string }
export function flowKindForEvent(event: SimulationEvent): FlowKind {
  if (event.stageId === 'logs') return 'logs'
  if (event.stageId === 'alerts' || event.visual?.kind === 'failure') return 'alert'
  if (event.visual?.fromStationId === 'secrets') return 'secret'
  if (event.stageId === 'service' || event.stageId === 'ingress') return 'traffic'
  if (event.visual?.kind === 'telemetry' || event.visual?.kind === 'recovery') return 'metrics'
  if (event.visual?.kind === 'image') return 'image'
  if (event.visual?.kind === 'code') return 'code'
  return 'configuration'
}
const prototypes = { code: 'CodePacket', image: 'ImagePackage', config: 'ConfigPacket', sync: 'ConfigPacket', telemetry: 'SignalOrb', approval: 'ConfigPacket', failure: 'SignalOrb', recovery: 'SignalOrb' } as const

/** Only real state-machine events create packets; history is capped by the engine. */
export function recentEventEffects(history: readonly SimulationEvent[], environment: EnvironmentId): EventEffect[] {
  return history.filter(event => event.environment === environment && event.visual && ['stage-started', 'approved', 'failed', 'retrying', 'backup-created', 'restore-completed', 'operation'].includes(event.type))
    .flatMap(event => {
      const visual = event.visual!
      const from = getStation(visual.fromStationId), to = getStation(visual.toStationId)
      if (!from || !to) return []
      const primary: EventEffect = { id: event.id, routeId: `${event.id}:${from.id}:${to.id}`, timestamp: event.timestamp, durationMs: Math.max(700, Math.min(6000, stageById(event.stageId)?.durationMs || 1200)), prototype: prototypes[visual.kind], from: from.position, to: to.position, fromStationId: from.id, toStationId: to.id, kind: flowKindForEvent(event), acknowledged: event.type !== 'stage-started' || history.some(next => next.runId === event.runId && next.environment === event.environment && next.stageId === event.stageId && next.type === 'stage-completed' && next.timestamp >= event.timestamp), outcome: visual.kind === 'failure' ? 'failed' : 'updated', message: event.message }
      // The sync stage explicitly reconciles manifests and secret references. Both routes
      // project that one recorded event; no secret values or invented engine events exist.
      const secrets = event.stageId === 'sync' && event.type === 'stage-started' ? getStation('secrets') : undefined
      return secrets ? [{ ...primary, routeId: `${event.id}:secrets:${to.id}`, from: secrets.position, fromStationId: secrets.id, kind: 'secret' as const, message: 'Synchronize the environment secret reference with Kubernetes.' }, primary] : [primary]
    }).slice(-8)
}

/** Render interpolation has no authority to advance or complete a simulation stage. */
export function effectPosition(effect: Pick<EventEffect, 'from' | 'to'>, progress: number, reducedMotion: boolean): Point3 {
  const t = reducedMotion ? 1 : Math.max(0, Math.min(1, progress))
  const distance = Math.hypot(effect.to[0] - effect.from[0], effect.to[2] - effect.from[2])
  return [effect.from[0] + (effect.to[0] - effect.from[0]) * t,
    effect.from[1] + (effect.to[1] - effect.from[1]) * t + 2.75 + (reducedMotion ? 0 : Math.sin(Math.PI * t) * Math.min(3.5, distance * .12)),
    effect.from[2] + (effect.to[2] - effect.from[2]) * t]
}
