import { useCallback, useEffect, useRef, useState } from 'react'
import type { AdventureCommand, AdventureId, AdventureSession, AdventureVariant } from './domain'
import { reduceAdventure, tickAdventure } from './engine'
import { MAX_ADVENTURE_DURATION_MS, MAX_RECORDED_COMMANDS, emptyAdventureSave, loadAdventureSave, resetAdventureStorage, writeAdventureSave, type AdventureSave, type SaveLoad, type SaveNotice, type StorageLike } from './persistence'
import { advanceReplay, createAdventureRecord, isBetterResult, recordSession, replayAdventure, type AdventureRecord, type ReplaySpeed, type ReplayView } from './replay'

type Controller = SaveLoad & {
  liveSession: AdventureSession | null; running: boolean; revision: number
  replayRecord: AdventureRecord | null; replay: ReplayView | null; replaySession: AdventureSession | null
}
function availableStorage(): StorageLike | null { try { return window.localStorage } catch { return null } }
function controllerFrom(load: SaveLoad): Controller {
  return { ...load, liveSession: load.save.active ? replayAdventure(load.save.active) : null, running: false, revision: 0, replayRecord: null, replay: null, replaySession: null }
}

/** Selecting another lesson keeps the current unfinished attempt in the bounded notebook. */
export function selectAdventure(save: AdventureSave, id: AdventureId, variant?: AdventureVariant, restart = false) {
  const activeSession = save.active ? replayAdventure(save.active) : null
  const existing = !restart && (save.active?.adventureId === id && activeSession?.status === 'active' ? save.active : save.suspended.find(record => record.adventureId === id))
  const suspended = save.suspended.filter(record => record.adventureId !== id)
  if (save.active && activeSession?.status === 'active' && save.active.adventureId !== id) suspended.push(save.active)
  const created = existing ? { record: existing, session: replayAdventure(existing) } : createAdventureRecord(`adventure-${save.sequence + 1}`, id, variant, save.preferences.hintsEnabled)
  return { save: { ...save, selectedId: id, active: created.record, suspended, sequence: existing ? save.sequence : save.sequence + 1 }, session: created.session }
}

/** Resume never creates an attempt, including after viewing a completed replay. */
export function resumableAdventureId(save: AdventureSave, requested?: AdventureId): AdventureId | null {
  const activeId = save.active && replayAdventure(save.active).status === 'active' ? save.active.adventureId : null
  if (requested) return requested === activeId || save.suspended.some(record => record.adventureId === requested) ? requested : null
  return activeId ?? save.suspended.at(-1)?.adventureId ?? null
}

function updateLive(current: Controller, session: AdventureSession, record: AdventureRecord, boundary = false): Controller {
  const nextRecord = recordSession(record, session)
  let completed = current.save.completed
  if (session.status === 'completed') {
    const previous = completed.find(item => item.adventureId === session.id)
    if (!previous || isBetterResult(nextRecord, previous)) completed = [...completed.filter(item => item.adventureId !== session.id), nextRecord]
  }
  return { ...current, liveSession: session, running: current.running && session.status === 'active', save: { ...current.save, active: nextRecord, completed }, revision: current.revision + (boundary || session.eventSequence !== current.liveSession?.eventSequence ? 1 : 0) }
}

/** Saves event boundaries; WebGL frames never drive this clock or persistence. */
export function useAdventures() {
  const [storage] = useState(availableStorage)
  const [controller, setController] = useState(() => controllerFrom(loadAdventureSave(storage)))
  const latest = useRef(controller)
  latest.current = controller
  const lastWallTime = useRef(0)
  const { revision } = controller

  const persist = useCallback(() => {
    const current = latest.current
    if (current.writesBlocked) return
    const notice = writeAdventureSave(storage, current.save)
    setController(previous => {
      const nextNotice = notice ?? (previous.notice?.kind === 'migrated' ? previous.notice : null)
      return JSON.stringify(nextNotice) === JSON.stringify(previous.notice) ? previous : { ...previous, notice: nextNotice }
    })
  }, [storage])

  useEffect(() => { persist() }, [revision, persist])
  useEffect(() => {
    const saveBeforeLeaving = () => persist()
    const visibility = () => { if (document.hidden) { persist(); setController(previous => ({ ...previous, running: false, replay: previous.replay ? { ...previous.replay, playing: false } : null })) } }
    window.addEventListener('pagehide', saveBeforeLeaving)
    document.addEventListener('visibilitychange', visibility)
    return () => { window.removeEventListener('pagehide', saveBeforeLeaving); document.removeEventListener('visibilitychange', visibility) }
  }, [persist])

  const advancing = controller.replay ? controller.replay.playing : controller.running
  useEffect(() => {
    if (!advancing) return
    lastWallTime.current = performance.now()
    const timer = window.setInterval(() => {
      const wall = performance.now(), elapsed = Math.min(1000, Math.max(0, wall - lastWallTime.current))
      lastWallTime.current = wall
      if (document.hidden) return
      setController(previous => {
        if (previous.replay && previous.replayRecord) {
          const replay = advanceReplay(previous.replay, elapsed)
          return { ...previous, replay, replaySession: replayAdventure(previous.replayRecord, replay.positionMs) }
        }
        if (!previous.running || !previous.liveSession || !previous.save.active) return previous
        if (previous.liveSession.clock + elapsed > MAX_ADVENTURE_DURATION_MS) return { ...previous, running: false, notice: { kind: 'limit', message: 'This attempt reached the supported clock limit. Export the notebook and restart this lesson; other adventures remain saved.', recoverable: true } }
        const session = tickAdventure(previous.liveSession, previous.liveSession.clock + elapsed)
        return updateLive(previous, session, previous.save.active)
      })
    }, 100)
    return () => window.clearInterval(timer)
  }, [advancing])

  const launch = useCallback((id: AdventureId, variant?: AdventureVariant) => {
    setController(previous => {
      const next = selectAdventure(previous.save, id, variant)
      return { ...previous, save: next.save, liveSession: next.session, running: next.session.status === 'active', replay: null, replayRecord: null, replaySession: null, revision: previous.revision + 1 }
    })
  }, [])
  const resume = useCallback((id?: AdventureId) => {
    const current = latest.current
    const target = resumableAdventureId(current.save, id)
    if (target) launch(target)
  }, [launch])
  const pause = useCallback(() => { setController(previous => ({ ...previous, running: false, replay: previous.replay ? { ...previous.replay, playing: false } : null, revision: previous.revision + 1 })) }, [])
  const restart = useCallback((id?: AdventureId, variant?: AdventureVariant) => {
    setController(previous => {
      const target = id ?? previous.save.selectedId
      if (!target) return previous
      const previousVariant = previous.save.active?.adventureId === target ? previous.save.active.variant : undefined
      const next = selectAdventure(previous.save, target, variant ?? previousVariant ?? undefined, true)
      return { ...previous, save: next.save, liveSession: next.session, running: true, replay: null, replayRecord: null, replaySession: null, revision: previous.revision + 1 }
    })
  }, [])
  const dispatch = useCallback((command: AdventureCommand) => {
    setController(previous => {
      if (!previous.liveSession || !previous.save.active || previous.replay || previous.liveSession.status !== 'active') return previous
      if (!previous.running && (command.type === 'action' || command.type === 'hint')) return previous
      if (previous.save.active.commands.length >= MAX_RECORDED_COMMANDS) return { ...previous, running: false, notice: { kind: 'limit', message: 'This attempt reached its 512-action recording limit. Export it or restart the lesson; your saved evidence has been kept.', recoverable: true } }
      const session = reduceAdventure(previous.liveSession, command, previous.liveSession.clock)
      if (session === previous.liveSession) return previous
      const record = { ...previous.save.active, commands: [...previous.save.active.commands, { at: previous.liveSession.clock, command }] }
      return updateLive(previous, session, record, true)
    })
  }, [])
  const cancel = useCallback(() => dispatch({ type: 'cancel' }), [dispatch])
  const leave = useCallback(() => { setController(previous => ({ ...previous, running: false, replay: null, replayRecord: null, replaySession: null, revision: previous.revision + 1 })) }, [])
  const setHintsEnabled = useCallback((enabled: boolean) => {
    setController(previous => {
      let next = { ...previous, save: { ...previous.save, preferences: { ...previous.save.preferences, hintsEnabled: enabled } }, revision: previous.revision + 1 }
      if (!next.replay && next.liveSession?.status === 'active' && next.save.active) {
        if (next.save.active.commands.length >= MAX_RECORDED_COMMANDS) return { ...previous, notice: { kind: 'limit', message: 'Export or restart this attempt before changing more recorded preferences. The 512-action limit keeps saves safely bounded.', recoverable: true } }
        const command: AdventureCommand = { type: 'set-hints', enabled }
        const session = reduceAdventure(next.liveSession, command, next.liveSession.clock)
        const record = { ...next.save.active, commands: [...next.save.active.commands, { at: next.liveSession.clock, command }] }
        next = updateLive(next, session, record, true)
      }
      return next
    })
  }, [])
  const startReplay = useCallback((recordId: string) => {
    setController(previous => {
      const record = previous.save.active?.id === recordId && previous.save.active.completedAt !== null ? previous.save.active : previous.save.completed.find(item => item.id === recordId)
      if (!record) return previous
      return { ...previous, running: false, replayRecord: structuredClone(record), replay: { recordId, positionMs: 0, durationMs: record.elapsedMs, speed: 1, playing: record.elapsedMs > 0 }, replaySession: replayAdventure(record, 0), revision: previous.revision + 1 }
    })
  }, [])
  const pauseReplay = useCallback(() => setController(previous => previous.replay ? { ...previous, replay: { ...previous.replay, playing: false } } : previous), [])
  const resumeReplay = useCallback(() => setController(previous => previous.replay ? { ...previous, replay: { ...previous.replay, playing: previous.replay.positionMs < previous.replay.durationMs } } : previous), [])
  const restartReplay = useCallback(() => setController(previous => previous.replay && previous.replayRecord ? { ...previous, replay: { ...previous.replay, positionMs: 0, playing: true }, replaySession: replayAdventure(previous.replayRecord, 0) } : previous), [])
  const stopReplay = useCallback(() => setController(previous => ({ ...previous, replay: null, replayRecord: null, replaySession: null, running: false })), [])
  const setReplaySpeed = useCallback((speed: ReplaySpeed) => {
    if (![.5, 1, 2, 4].includes(speed)) return
    setController(previous => previous.replay ? { ...previous, replay: { ...previous.replay, speed } } : previous)
  }, [])
  const exportSave = useCallback(() => latest.current.writesBlocked && latest.current.sourceRaw !== null ? latest.current.sourceRaw : JSON.stringify(latest.current.save, null, 2), [])
  const resetSave = useCallback(() => {
    const current = latest.current
    const original = current.writesBlocked ? current.sourceRaw : JSON.stringify(current.save)
    const notice = resetAdventureStorage(storage, original, current.sourceKey)
    if (notice) { setController(previous => ({ ...previous, notice })); return }
    const load = loadAdventureSave(storage)
    setController(controllerFrom({ ...load, save: emptyAdventureSave() }))
  }, [storage])
  const dismissNotice = useCallback(() => setController(previous => previous.notice?.recoverable ? previous : { ...previous, notice: null }), [])
  const retrySave = useCallback(() => persist(), [persist])

  const resumable = [...controller.save.suspended, ...(controller.save.active && controller.liveSession?.status === 'active' ? [controller.save.active] : [])]
  return {
    session: controller.replaySession ?? controller.liveSession, liveSession: controller.liveSession,
    activeRecord: controller.save.active, completed: controller.save.completed, resumable,
    selectedId: controller.save.selectedId, running: controller.running, paused: controller.liveSession?.status === 'active' && !controller.running,
    replay: controller.replay, notice: controller.notice, hintsEnabled: controller.save.preferences.hintsEnabled,
    launch, resume, pause, restart, cancel, leave, dispatch, setHintsEnabled,
    startReplay, pauseReplay, resumeReplay, restartReplay, stopReplay, setReplaySpeed,
    resetSave, exportSave, dismissNotice, retrySave,
  }
}

export type AdventuresController = ReturnType<typeof useAdventures>
export type { SaveNotice }
