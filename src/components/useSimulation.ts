import { useCallback, useEffect, useRef, useState } from 'react'
import { createSimulation, reduceSimulation, tickSimulation } from '../simulation/engine'
import type { SimulationCommand } from '../simulation/domain'
import { DEFAULT_PLAYBACK, crossedStage, playbackDelta, type PlaybackPolicy } from '../cinematic/playback'

export type LabRecord = { elapsedMs: number; commands: { at: number; command: SimulationCommand }[] }
export function replayLab(record: LabRecord, at = record.elapsedMs, options: { commandCount?: number } = {}) {
  const end = Math.max(0, Math.min(record.elapsedMs, at))
  let state = createSimulation()
  for (const item of record.commands.slice(0, options.commandCount ?? record.commands.length)) {
    if (item.at > end) break
    state = tickSimulation(state, item.at)
    state = reduceSimulation(state, item.command, item.at)
  }
  return tickSimulation(state, end)
}
/** An injected logical clock keeps pause, speed and stage review independent of wall time. */
export function useSimulation(playback: PlaybackPolicy = DEFAULT_PLAYBACK) {
  const policy = useRef(playback); policy.current = playback
  const [controller, setController] = useState(() => ({ state: createSimulation(), paused: false, stepHeld: false, record: { elapsedMs: 0, commands: [] } as LabRecord }))
  const active = ['running', 'retrying'].includes(controller.state.status) && !controller.paused
  useEffect(() => {
    if (!active) return
    let wall = performance.now()
    const timer = window.setInterval(() => {
      const now = performance.now(), elapsed = now - wall; wall = now
      if (document.hidden) return
      setController(previous => {
        if (previous.paused || (policy.current.enabled && policy.current.mode === 'step' && previous.stepHeld)) return previous
        const state = tickSimulation(previous.state, previous.state.clock + playbackDelta(previous.state, elapsed, policy.current))
        return { ...previous, state, record: { ...previous.record, elapsedMs: state.clock }, stepHeld: policy.current.enabled && policy.current.mode === 'step' && crossedStage(previous.state, state) }
      })
    }, 100)
    return () => window.clearInterval(timer)
  }, [active])
  const dispatch = useCallback((command: SimulationCommand) => {
    setController(previous => {
      const state = reduceSimulation(previous.state, command, previous.state.clock)
      const record = command.type === 'reset' ? { elapsedMs: 0, commands: [] } : { elapsedMs: state.clock, commands: [...previous.record.commands, { at: previous.state.clock, command }] }
      return { state: command.type === 'reset' ? createSimulation() : state, record, paused: false, stepHeld: policy.current.enabled && policy.current.mode === 'step' }
    })
  }, [])
  const pause = useCallback(() => setController(previous => ({ ...previous, paused: true })), [])
  const resume = useCallback(() => setController(previous => ({ ...previous, paused: false })), [])
  const advanceStage = useCallback(() => setController(previous => ({ ...previous, stepHeld: false })), [])
  const holdStage = useCallback(() => setController(previous => ({ ...previous, stepHeld: true })), [])
  return { ...controller, dispatch, pause, resume, advanceStage, holdStage }
}
