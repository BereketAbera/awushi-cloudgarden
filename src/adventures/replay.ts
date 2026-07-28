import type { AdventureCommand, AdventureId, AdventureSession, AdventureVariant } from './domain'
import { createAdventure, reduceAdventure, tickAdventure } from './engine'

export type RecordedCommand = { at: number; command: AdventureCommand }
export type AdventureResult = { mistakes: number; hintsUsed: number }
/** Persist inputs, not trusted copies of infrastructure objects. The same reducer restores them. */
export type AdventureRecord = {
  id: string; adventureId: AdventureId; variant: AdventureVariant | null; initialHintsEnabled: boolean
  elapsedMs: number; commands: RecordedCommand[]; completedAt: number | null; result: AdventureResult | null
}
export type ReplaySpeed = .5 | 1 | 2 | 4
export type ReplayView = { recordId: string; positionMs: number; durationMs: number; speed: ReplaySpeed; playing: boolean }

export function adventureResult(session: AdventureSession): AdventureResult {
  return { mistakes: session.rejectedDecisions, hintsUsed: session.hintsUsed }
}

export function createAdventureRecord(id: string, adventureId: AdventureId, variant?: AdventureVariant | null, hintsEnabled = true) {
  let session = createAdventure(adventureId, 0, variant ?? undefined)
  if (!hintsEnabled) session = reduceAdventure(session, { type: 'set-hints', enabled: false }, 0)
  const record: AdventureRecord = { id, adventureId, variant: session.variant, initialHintsEnabled: hintsEnabled, elapsedMs: 0, commands: [], completedAt: null, result: null }
  return { session, record }
}

/** Seeking is pure: never mutate the supplied recording, save store or a live session. */
export function replayAdventure(record: AdventureRecord, positionMs = record.elapsedMs): AdventureSession {
  const end = Math.max(0, Math.min(record.elapsedMs, Number.isFinite(positionMs) ? positionMs : 0))
  let session = createAdventureRecord(record.id, record.adventureId, record.variant, record.initialHintsEnabled).session
  for (const item of record.commands) {
    if (item.at > end) break
    session = tickAdventure(session, item.at)
    session = reduceAdventure(session, item.command, item.at)
  }
  return tickAdventure(session, end)
}

export function recordSession(record: AdventureRecord, session: AdventureSession): AdventureRecord {
  return { ...record, elapsedMs: session.clock, completedAt: session.status === 'completed' ? session.completedAt : null, result: session.status === 'completed' ? adventureResult(session) : null }
}

export function isBetterResult(candidate: AdventureRecord, previous: AdventureRecord): boolean {
  if (!candidate.result) return false
  if (!previous.result) return true
  return candidate.result.mistakes < previous.result.mistakes || (candidate.result.mistakes === previous.result.mistakes && candidate.result.hintsUsed < previous.result.hintsUsed)
}

export function advanceReplay(view: ReplayView, elapsedMs: number): ReplayView {
  if (!view.playing || !Number.isFinite(elapsedMs) || elapsedMs <= 0) return view
  const positionMs = Math.min(view.durationMs, view.positionMs + elapsedMs * view.speed)
  return { ...view, positionMs, playing: positionMs < view.durationMs }
}
