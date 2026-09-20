import { statusForSimulation } from '../game/cinematic'
import type { AdventureRecord } from '../adventures/replay'
import { createAdventureRecord } from '../adventures/replay'
import { reduceAdventure, tickAdventure } from '../adventures/engine'
import type { SimulationEvent, SimulationState } from '../simulation/domain'
import { DEPLOYMENT_STAGES, stageById } from '../simulation/scenario'
import { technologiesForStation } from '../simulation/registry'
import { getStation } from '../worldConfig'

export type PlaybackPolicy = { enabled: boolean; mode: 'automatic' | 'step'; speed: .5 | 1 | 2 }
export const DEFAULT_PLAYBACK: PlaybackPolicy = { enabled: false, mode: 'automatic', speed: 1 }
/** Slow the presentation clock, not stage semantics. Clamp at one real boundary. */
export function playbackDelta(state: SimulationState, wallMs: number, policy: PlaybackPolicy) {
  if (!Number.isFinite(wallMs) || wallMs <= 0) return 0
  if (!policy.enabled) return Math.min(1000, wallMs)
  const stage = stageById(state.stageId)
  const rate = stage && stage.durationMs > 0 ? Math.min(1, stage.durationMs / 3500) : 1
  const elapsed = Math.min(1000, wallMs) * policy.speed * rate
  if (!stage || !['running', 'retrying'].includes(state.status)) return elapsed
  return Math.max(0, Math.min(elapsed, state.stageStartedAt + stage.durationMs - state.clock))
}
export function crossedStage(before: SimulationState, after: SimulationState) {
  return before.stageId !== after.stageId || before.status !== after.status || before.eventSequence !== after.eventSequence
}
export type StageFrame = { key: string; eventId: number; runId: number; signature: string; at: number; end: number; stageId: string | null; stationId: string; title: string; commandCount?: number }
const frameTypes = new Set<SimulationEvent['type']>(['stage-started', 'approval-required', 'failed', 'succeeded', 'operation'])
const eventSignature = (event: SimulationEvent) => JSON.stringify([event.runId, event.id, event.timestamp, event.type, event.stageId, event.environment, event.message])
/** Derive only existing stages. The approval announcement replaces its identical establishing event. */
export function framesForSimulation(state: SimulationState): StageFrame[] {
  const events: SimulationEvent[] = []
  for (const event of state.history) {
    if (!frameTypes.has(event.type)) continue
    const previous = events.at(-1)
    if (event.type === 'approval-required' && previous?.type === 'stage-started' && event.runId === previous.runId && event.stageId === previous.stageId && event.timestamp === previous.timestamp) events.pop()
    events.push(event)
  }
  return events.map((event, index) => ({
    key: `${event.runId}:${event.id}`, at: event.timestamp,
    eventId: event.id, runId: event.runId, signature: eventSignature(event),
    end: Math.max(event.timestamp, events[index + 1] ? events[index + 1].timestamp - .001 : state.clock),
    stageId: event.stageId, stationId: stageById(event.stageId)?.stationId ?? event.visual?.toStationId ?? event.toStationId ?? 'github',
    title: event.type === 'failed' ? 'A check needs attention' : event.type === 'succeeded' ? 'Automation complete' : event.type === 'approval-required' ? 'Waiting for your approval' : stageById(event.stageId)?.title ?? event.message,
  }))
}
/**
 * A timestamp alone is ambiguous when several commands share one clock tick.
 * Find the earliest command prefix that actually produced each event. All earlier
 * timestamps remain included; review never borrows a later same-tick approval.
 * Event sequence is monotonic, so binary search avoids replaying every prefix.
 */
export function withFrameCommandCounts(frames: StageFrame[], commands: readonly { at: number }[], snapshotAt: (time: number, commandCount: number) => SimulationState): StageFrame[] {
  const cache = new Map<string, SimulationState>()
  const snapshot = (time: number, count: number) => {
    const key = `${time}:${count}`
    let result = cache.get(key)
    if (!result) { result = snapshotAt(time, count); cache.set(key, result) }
    return result
  }
  const result: StageFrame[] = []
  for (const frame of frames) {
    let low = commands.findIndex(command => command.at >= frame.at)
    if (low < 0) low = commands.length
    let high = commands.findIndex(command => command.at > frame.at)
    if (high < 0) high = commands.length
    while (low < high) {
      const middle = Math.floor((low + high) / 2)
      if (snapshot(frame.at, middle).eventSequence >= frame.eventId) high = middle
      else low = middle + 1
    }
    // A stale record/frame pair must not silently reconstruct a different event.
    if (snapshot(frame.at, low).history.some(event => eventSignature(event) === frame.signature)) result.push({ ...frame, commandCount: low })
  }
  return result
}
/** Only recorded events are seekable. There are no synthetic future stages. */
export function recordedFrames(record: AdventureRecord): StageFrame[] {
  let session = createAdventureRecord(record.id, record.adventureId, record.variant, record.initialHintsEnabled).session
  const prefixes = new Map<string, number>()
  let seen = 0
  const remember = (count: number) => {
    for (const event of session.simulation.history) {
      if (event.id <= seen) continue
      if (frameTypes.has(event.type)) prefixes.set(eventSignature(event), count)
    }
    seen = session.simulation.eventSequence
  }
  remember(0)
  // Reconstruct once and retain event provenance rather than replaying every prefix.
  // Automatic events precede the command at their boundary; commanded events follow it.
  record.commands.forEach((item, index) => {
    session = tickAdventure(session, item.at); remember(index)
    session = reduceAdventure(session, item.command, item.at); remember(index + 1)
  })
  session = tickAdventure(session, record.elapsedMs); remember(record.commands.length)
  return framesForSimulation(session.simulation).flatMap(frame => {
    const commandCount = prefixes.get(frame.signature)
    return commandCount === undefined ? [] : [{ ...frame, commandCount }]
  })
}
export function stageNarrative(state: SimulationState, fallback?: { title: string; description: string; stationId: string }) {
  const stage = stageById(state.stageId)
  const active = stage && state.status !== 'idle'
  const stationId = active ? stage.stationId : fallback?.stationId ?? 'github'
  const technologies = technologiesForStation(stationId)
  const names = technologies.map(item => item.name).join(' · ')
  const status = statusForSimulation(state)
  const next = active ? DEPLOYMENT_STAGES[state.stageIndex + 1] : undefined
  return {
    stationId, technology: names || getStation(stationId)?.name || stationId,
    title: state.status === 'failed' ? 'A check needs attention' : active ? stage.title : fallback?.title ?? 'A small change starts here',
    explanation: state.error ?? (active ? stage.description : fallback?.description ?? 'Push a change to see the technologies work together.'),
    next: state.status === 'failed' ? 'Inspect the evidence before choosing a repair.' : state.status === 'waiting-approval' ? 'Review the evidence and approve explicitly in your field notes.' : next ? `Next: ${next.title.toLowerCase()}.` : 'Verify the result in your field notes.',
    number: active ? state.stageIndex + 1 : 0, total: DEPLOYMENT_STAGES.length, status: status as 'failed' | 'waiting' | 'healthy' | 'neutral' | 'active',
    from: stage?.fromStationId, to: stage?.toStationId,
  }
}
