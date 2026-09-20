import { useCallback, useEffect, useMemo, useState } from 'react'
import type { SimulationState } from '../simulation/domain'
import type { AdventureRecord } from '../adventures/replay'
import { replayAdventure } from '../adventures/replay'
import type { LabRecord } from '../components/useSimulation'
import { replayLab } from '../components/useSimulation'
import { requestCharacterReturn, simulationShot, statusForSimulation, type CinematicView, type ShotRequest } from '../game/cinematic'
import { playbackDelta, framesForSimulation, recordedFrames, withFrameCommandCounts, type PlaybackPolicy, type StageFrame } from './playback'

type Review = { frames: StageFrame[]; index: number; time: number; playing: boolean; adventure?: AdventureRecord; lab?: LabRecord }
type Options = { enabled: boolean; state: SimulationState; adventureRecord?: AdventureRecord | null; labRecord: LabRecord; automaticCamera: boolean; paused: boolean; policy: PlaybackPolicy; fallback?: ShotRequest; onPause: () => void }
/** Presentation state owns camera intent and read-only historical playback, never decisions. */
export function useWatchFlow(o: Options) {
  const [cinematic, setCinematic] = useState<CinematicView>({ ownership: 'player', shot: null, revision: 0, autoMove: true })
  const [review, setReview] = useState<Review | null>(null)
  const frames = useMemo(() => framesForSimulation(o.state), [o.state])
  const reviewSimulation = useMemo(() => review ? review.adventure ? replayAdventure(review.adventure, review.time, { commandCount: review.frames[review.index].commandCount }).simulation : replayLab(review.lab!, review.time, { commandCount: review.frames[review.index].commandCount }) : null, [review])
  const state = reviewSimulation ?? o.state
  const reviewFrame = review?.frames[review.index]
  const reviewFallback = reviewFrame && !state.stageId ? { title: 'Recorded infrastructure state', description: 'This is the station state at the selected recorded event. Live decisions and progress remain unchanged.', stationId: reviewFrame.stationId } : undefined
  const shot = useMemo(() => {
    if (reviewFrame && !state.stageId) return { id: reviewFrame.key, stationId: reviewFrame.stationId, kind: 'incident' as const, status: statusForSimulation(state) }
    const fromStage = simulationShot(state)
    return state.stageId ? fromStage : o.fallback ?? fromStage
  }, [state, o.fallback, reviewFrame])
  const begin = useCallback(() => {
    setReview(null)
    setCinematic(previous => ({ ...previous, ownership: o.automaticCamera ? 'returning-cinematic' : 'player', shot, revision: previous.revision + 1, skipTransition: false, autoMove: o.automaticCamera }))
  }, [o.automaticCamera, shot])
  const focus = useCallback((request: ShotRequest) => {
    setCinematic(previous => ({ ...previous, ownership: 'returning-cinematic', shot: request, revision: previous.revision + 1, skipTransition: false, autoMove: true }))
  }, [])
  const override = useCallback(() => setCinematic(previous => ({ ...previous, ownership: 'overridden', skipTransition: false })), [])
  const follow = useCallback(() => setCinematic(previous => ({ ...previous, ownership: 'returning-cinematic', shot, revision: previous.revision + 1, skipTransition: false, autoMove: true })), [shot])
  const returnToCharacter = useCallback(() => setCinematic(requestCharacterReturn), [])
  const settled = useCallback((ownership: 'cinematic' | 'player') => setCinematic(previous => previous.ownership === 'returning-cinematic' || previous.ownership === 'returning-character' ? { ...previous, ownership, shot: ownership === 'player' ? null : previous.shot } : previous), [])
  const skip = useCallback(() => setCinematic(previous => ({ ...previous, skipTransition: true, revision: previous.revision + 1 })), [])
  const exit = useCallback(() => { setReview(null); returnToCharacter() }, [returnToCharacter])
  const startReview = (index: number) => {
    const adventure = review?.adventure ?? (o.adventureRecord ? structuredClone(o.adventureRecord) : undefined)
    const lab = review?.lab ?? (!adventure ? structuredClone(o.labRecord) : undefined)
    const available = review?.frames ?? (adventure ? recordedFrames(adventure) : withFrameCommandCounts(frames, lab!.commands, (at, commandCount) => replayLab(lab!, at, { commandCount })))
    const selected = available[Math.max(0, Math.min(available.length - 1, index))]
    if (!selected) return
    o.onPause()
    setReview({ frames: available, index: available.indexOf(selected), time: selected.at, playing: true, adventure, lab })
    setCinematic(previous => ({ ...previous, ownership: o.automaticCamera ? 'returning-cinematic' : previous.ownership, revision: previous.revision + 1, skipTransition: false }))
  }
  useEffect(() => {
    if (!review?.playing) return
    let wall = performance.now()
    const timer = window.setInterval(() => {
      const now = performance.now(), elapsed = Math.min(500, now - wall); wall = now
      if (document.hidden) return
      setReview(previous => {
        if (!previous?.playing) return previous
        const end = previous.frames[previous.index].end
        const snapshot = previous.adventure ? replayAdventure(previous.adventure, previous.time, { commandCount: previous.frames[previous.index].commandCount }).simulation : replayLab(previous.lab!, previous.time, { commandCount: previous.frames[previous.index].commandCount })
        const time = Math.min(end, previous.time + playbackDelta(snapshot, elapsed, { enabled: true, mode: 'automatic', speed: o.policy.speed }))
        return { ...previous, time, playing: time < end }
      })
    }, 100)
    return () => window.clearInterval(timer)
  }, [review?.playing, o.policy.speed])
  // The derived shot follows events only while cinematic owns the camera. Manual focus is stable otherwise.
  const view: CinematicView = { ...cinematic, shot: o.enabled && o.automaticCamera && cinematic.ownership !== 'player' && cinematic.ownership !== 'returning-character' ? shot : cinematic.shot, autoMove: o.enabled ? o.automaticCamera : cinematic.autoMove, paused: review ? !review.playing : o.enabled && o.paused }
  const pauseReview = useCallback(() => setReview(previous => previous ? { ...previous, playing: false } : null), [])
  return { view, state, review, reviewFallback, frames: review?.frames ?? frames, begin, focus, override, follow, returnToCharacter, settled, skip, exit, startReview, clearReview: () => setReview(null), pauseReview, resumeReview: () => setReview(previous => previous ? { ...previous, playing: previous.time < previous.frames[previous.index].end } : null) }
}
