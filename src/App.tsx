import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Activity, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, BookOpen, Box, Check, ChevronDown, ChevronRight, CircleHelp, Compass, Crosshair, Droplets, Expand, Footprints, Home, Layers3, Map, Moon, Pause, Play, RotateCcw, Settings2, Smile, Sparkles, Sun, X, Zap } from 'lucide-react'
import { Dialog } from './components/Dialog'
import { MiniMap } from './components/MiniMap'
import { SimulationDock, SimulationPanel } from './components/SimulationPanels'
import { ArchitectureExplorer, StationTechnologyPanel } from './components/TechnologyPanels'
import { useSimulation } from './components/useSimulation'
import { AdventureSelection, MissionHUD, MissionPanel, ReplayControls, SaveNoticeBanner } from './components/AdventurePanels'
import { PortfolioHighlights, EngineeringShowcase } from './components/Portfolio'
import { useAdventures } from './adventures/useAdventures'
import { useGuidance } from './adventures/useGuidance'
import { getMissionGuidance } from './adventures/guidance'
import { GuidedWelcome } from './components/Onboarding'
import { WatchFlow } from './components/WatchFlow'
import { useWatchFlow } from './cinematic/useWatchFlow'
import { statusForSimulation } from './game/cinematic'
import { DEFAULT_PLAYBACK, type PlaybackPolicy } from './cinematic/playback'
import './cinematic/cinematic.css'
import { getAdventureView } from './adventures/selectors'
import type { AdventureCommand, AdventureId, AdventureVariant } from './adventures/domain'
import { useSound } from './audio/useSound'
import { normalizeSound, type SoundPreferences } from './audio/sound'
import type { EnvironmentId, ScenarioId, SimulationCommand } from './simulation/domain'
import { DISTRICTS, HUB, STATIONS, WORLD_LAYOUT, getDistrict, getStation } from './worldConfig'
import { STORAGE_KEY, createProgress, discoverStation, enterDistrict, introductoryProgress, parseProgress, resetProgress, type Progress } from './game/progress'
import type { AssetInfo, CameraMode, Clip, ExpressionName, Lighting, Quality, Reaction, Telemetry, View } from './game/types'

const Scene = lazy(() => import('./Scene'))
type Screen = 'welcome' | 'adventure' | 'explore' | 'studio'
type Modal = 'settings' | 'help' | 'architecture' | 'journal' | 'station' | 'simulation' | 'adventures' | 'showcase' | null
type Preferences = { quality: Quality; reducedMotion: boolean; lighting: Lighting; cameraMode: CameraMode; sound: SoundPreferences }
const PREFS_KEY = 'awushi-preferences-v2'
const expressions: ExpressionName[] = ['Neutral', 'Happy', 'Curious', 'Thinking', 'Excited', 'Worried', 'Surprised', 'Determined', 'Celebrating', 'Sleepy']
const animations: { clip: Clip; icon: typeof Activity; name: string }[] = [
  { clip: 'Idle', icon: Droplets, name: 'Just being' }, { clip: 'Walk', icon: Footprints, name: 'Little steps' },
  { clip: 'Run', icon: Zap, name: 'On a mission' }, { clip: 'Interact', icon: Smile, name: 'Oh, hello!' }, { clip: 'Celebrate', icon: Sparkles, name: 'We did it!' },
]
const views: { id: View; label: string }[] = [{ id: 'three-quarter', label: '¾' }, { id: 'front', label: 'Front' }, { id: 'side', label: 'Side' }, { id: 'back', label: 'Back' }]
const cameraModes: { id: CameraMode; name: string; icon: typeof Compass }[] = [{ id: 'third-person', name: 'Follow', icon: Footprints }, { id: 'first-person', name: 'First person', icon: Crosshair }, { id: 'overview', name: 'Overview', icon: Map }, { id: 'isometric', name: 'Isometric', icon: Layers3 }]
const cameraHints: Record<CameraMode, string> = { 'third-person': 'W/S move · A/D turn · Drag to look', 'first-person': 'W/S move · A/D turn · Drag to look', overview: 'Every district, one connected world.', isometric: 'A steady miniature view · C changes view' }
const movementKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight', 'ShiftLeft', 'ShiftRight'])
const initialTelemetry: Telemetry = { position: WORLD_LAYOUT.spawn, districtId: 'hub', nearbyId: null, expression: 'Neutral', fps: 0, drawCalls: 0, triangles: 0, geometries: 0, textures: 0 }

function readProgress(): Progress { try { return parseProgress(localStorage.getItem(STORAGE_KEY)) } catch { return createProgress() } }
function readPreferences(): Preferences {
  const initial: Preferences = { quality: 'balanced', reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches, lighting: 'daylight', cameraMode: 'third-person', sound: { muted: true, volume: .35 } }
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<Preferences>
    return { quality: ['low', 'balanced', 'high'].includes(saved.quality ?? '') ? saved.quality! : initial.quality, reducedMotion: typeof saved.reducedMotion === 'boolean' ? saved.reducedMotion : initial.reducedMotion, lighting: ['daylight', 'moonlight', 'studio'].includes(saved.lighting ?? '') ? saved.lighting! : initial.lighting, cameraMode: cameraModes.some(item => item.id === saved.cameraMode) ? saved.cameraMode! : initial.cameraMode, sound: normalizeSound(saved.sound ?? {}) }
  } catch { return initial }
}
function BrandMark() {
  return <svg className="brand-mark" viewBox="0 0 44 48" fill="none" aria-hidden="true"><path d="M7 23C8 12 15 5 24 4C31 3 30 10 27 12C23 16 30 17 32 13C35 8 43 13 38 22C45 31 37 43 22 43C7 43 1 32 7 23Z" fill="currentColor" /><ellipse cx="16" cy="28" rx="3.3" ry="4.5" fill="#10252e" /><ellipse cx="29" cy="28" rx="3.3" ry="4.5" fill="#10252e" /><path d="M21 35Q23 37 25 35" stroke="#10252e" strokeWidth="1.8" strokeLinecap="round" /></svg>
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('welcome')
  const [modal, setModal] = useState<Modal>(null)
  const [clip, setClip] = useState<Clip>('Idle')
  const [playing, setPlaying] = useState(true)
  const [speed, setSpeed] = useState(1)
  const [view, setView] = useState<View>('three-quarter')
  const [expression, setExpression] = useState<ExpressionName | 'Auto'>('Neutral')
  const [expressionIntensity, setExpressionIntensity] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [preferences, setPreferences] = useState<Preferences>(readPreferences)
  const cameraMode = preferences.cameraMode
  const setCameraMode = useCallback((value: CameraMode) => setPreferences(previous => ({ ...previous, cameraMode: value })), [])
  const [progress, setProgress] = useState<Progress>(readProgress)
  const [telemetry, setTelemetry] = useState<Telemetry>(initialTelemetry)
  const [info, setInfo] = useState<AssetInfo | null>(null)
  const [selectedStation, setSelectedStation] = useState<string | null>(null)
  const [navigationTarget, setNavigationTarget] = useState<string | null>(null)
  const [environment, setEnvironment] = useState<EnvironmentId>('development')
  const [scenario, setScenario] = useState<ScenarioId>('healthy')
  const [watchEnabled, setWatchEnabled] = useState(false)
  const [playback, setPlayback] = useState<PlaybackPolicy>(DEFAULT_PLAYBACK)
  const playbackPolicy = { ...playback, enabled: watchEnabled }
  const lab = useSimulation(playbackPolicy)
  const { state: labSimulation, dispatch: dispatchSimulation, pause: pauseLab } = lab
  const adventures = useAdventures(playbackPolicy)
  const { pause: pauseAdventure, leave: leaveAdventure, pauseReplay } = adventures
  const missionSession = screen === 'adventure' ? adventures.session : null
  const missionView = useMemo(() => missionSession ? getAdventureView(missionSession) : null, [missionSession])
  const missionFocus = missionView ? missionSession?.status === 'completed' ? { title: 'Adventure complete', description: missionView.summary.whatHappened, stationId: missionView.objectives.at(-1)!.stationId } : missionView.objective ?? undefined : undefined
  const missionId = missionSession?.id
  const missionStatus = missionSession?.status
  const missionEnvironment = missionSession?.simulation.environment
  const liveSimulation = missionSession?.simulation ?? labSimulation
  const guidance = useGuidance(missionSession, adventures.activeRecord?.id ?? '', { running: adventures.running, replaying: Boolean(adventures.replay), cinematic: watchEnabled, waiting: missionView?.waiting ?? false })
  const [onboardingOpen, setOnboardingOpen] = useState(!guidance.preferences.onboardingComplete)
  const [graphSelection, setGraphSelection] = useState('github')
  const [graphReturn, setGraphReturn] = useState(false)
  const [guideStation, setGuideStation] = useState<string | null>(null)
  const flow = useWatchFlow({ enabled: watchEnabled, state: liveSimulation, adventureRecord: missionSession ? adventures.replayRecord ?? adventures.activeRecord : null, labRecord: lab.record, automaticCamera: guidance.preferences.automaticCamera && !preferences.reducedMotion, paused: missionSession ? adventures.replay ? !adventures.replay.playing : adventures.paused : lab.paused, policy: playbackPolicy, fallback: missionFocus ? { id: `objective:${missionFocus.title}`, stationId: missionFocus.stationId, kind: missionSession?.status === 'completed' ? 'completion' : missionSession?.id === 'investigate-incident' ? 'incident' : 'medium', status: statusForSimulation(liveSimulation) } : undefined, onPause: missionSession ? adventures.replay ? adventures.pauseReplay : pauseAdventure : lab.pause })
  const { exit: leaveFlow, returnToCharacter, view: cinemaView, pauseReview } = flow
  const simulation = watchEnabled && modal !== 'architecture' && modal !== 'station' && modal !== 'simulation' ? flow.state : liveSimulation
  const sound = useSound(preferences.sound)
  const [missionOpen, setMissionOpen] = useState(false)
  const wasAutomating = useRef(false)
  useEffect(() => {
    if (watchEnabled && missionView?.waiting && !wasAutomating.current) setMissionOpen(false)
    wasAutomating.current = missionView?.waiting ?? false
  }, [watchEnabled, missionView?.waiting])
  const [rendererNoticeDismissed, setRendererNoticeDismissed] = useState(false)
  const [rendererIssue, setRendererIssue] = useState<string | null>(null)
  const [preferenceIssue, setPreferenceIssue] = useState<string | null>(null)
  const previousAdventureEvent = useRef('')
  const previousSoundEvent = useRef({ run: '', sequence: 0 })
  const previousStep = useRef(initialTelemetry.position)
  const onRendererStatus = useCallback((message: string | null) => { setRendererIssue(message); setRendererNoticeDismissed(false); if (message) { pauseAdventure(); pauseLab(); pauseReview(); pauseReplay() } }, [pauseAdventure, pauseLab, pauseReview, pauseReplay])
  const previousSimulationStatus = useRef(simulation.status)
  const [reset, setReset] = useState(0)
  const [reaction, setReaction] = useState<Reaction>(null)
  const [notice, setNotice] = useState<{ id: number; text: string; type: 'discovery' | 'info' } | null>(null)
  const [studioOpen, setStudioOpen] = useState(() => window.innerWidth > 700)
  const [studioTab, setStudioTab] = useState<'expressions' | 'setup'>('expressions')
  const input = useRef(new Set<string>())
  const container = useRef<HTMLDivElement>(null)
  const lastInteraction = useRef(-1000)
  const noticeNumber = useRef(0)
  const reactionNumber = useRef(0)
  const previousDistrict = useRef('hub')
  const pendingCelebration = useRef(false)
  const mode = screen === 'studio' ? 'studio' : 'world'
  const inGame = screen === 'adventure' || screen === 'explore'
  const immersive = cameraMode === 'third-person' || cameraMode === 'first-person'
  const station = selectedStation ? getStation(selectedStation) : undefined
  const nearbyStation = telemetry.nearbyId ? getStation(telemetry.nearbyId) : undefined
  const currentDistrict = getDistrict(telemetry.districtId)
  const currentDistrictName = currentDistrict?.label ?? (telemetry.districtId === 'skyway' ? 'The Skyways' : HUB.name)
  const introCount = introductoryProgress(progress)
  const targetStation = navigationTarget ? getStation(navigationTarget) : undefined
  const targetDistance = targetStation ? Math.round(Math.hypot(targetStation.position[0] - telemetry.position[0], targetStation.position[2] - telemetry.position[2])) : 0
  const objective = DISTRICTS.find(district => !progress.stations.includes(district.introStation))

  const notify = useCallback((text: string, type: 'discovery' | 'info' = 'info') => setNotice({ id: ++noticeNumber.current, text, type }), [])
  const react = useCallback((value: ExpressionName) => setReaction({ id: ++reactionNumber.current, expression: value }), [])
  const onReady = useCallback((value: AssetInfo) => setInfo(value), [])
  const onClip = useCallback((value: Clip) => setClip(value), [])
  const onTelemetry = useCallback((value: Telemetry) => setTelemetry(value), [])

  useEffect(() => {
    if (missionSession || previousSimulationStatus.current === simulation.status) return
    previousSimulationStatus.current = simulation.status
    if (simulation.status === 'failed') { react('Worried'); if (!watchEnabled) notify('A check caught a problem. Open the lab to inspect it.') }
    if (simulation.status === 'retrying') react('Determined')
    if (simulation.status === 'waiting-approval') { react('Thinking'); if (!watchEnabled) notify('The image is ready. Your approval is the next step.') }
    if (simulation.status === 'succeeded') {
      react('Celebrating')
      if (inGame) { setClip('Celebrate'); setPlaying(true) }
      if (!watchEnabled) notify('A healthy release, from code to telemetry.', 'discovery')
    }
  }, [simulation.status, inGame, react, notify, missionSession, watchEnabled])

  useEffect(() => {
    if (!missionSession || !missionView) return
    const key = `${adventures.activeRecord?.id}:${adventures.replay?.recordId ?? 'live'}:${missionSession.eventSequence}`
    if (key === previousAdventureEvent.current) return
    previousAdventureEvent.current = key
    react(missionView.reaction)
    if (missionSession.status === 'completed' && !adventures.replay) { setClip('Celebrate'); setPlaying(true); setMissionOpen(true) }
    if (!adventures.replay && missionSession.feedback.tone === 'bad') sound.play('error')
    else if (!adventures.replay && missionSession.feedback.tone === 'warning') sound.play('warning')
  }, [missionSession, missionView, adventures.activeRecord?.id, adventures.replay, react, sound])
  useEffect(() => {
    const previous = previousSoundEvent.current
    const identity = `${missionSession ? adventures.activeRecord?.id : 'lab'}:${simulation.runId}`
    if (previous.run !== identity) previous.sequence = 0
    if (!adventures.replay) for (const event of simulation.history.filter(item => item.id > previous.sequence)) {
      if (event.type === 'stage-completed' && event.stageId === 'build') sound.play('build')
      if (event.type === 'succeeded') sound.play('success')
      if (event.type === 'failed') sound.play('error')
      if (event.type === 'approval-required') sound.play('warning')
    }
    previousSoundEvent.current = { run: identity, sequence: simulation.eventSequence }
  }, [simulation.history, simulation.eventSequence, simulation.runId, adventures.replay, adventures.activeRecord?.id, missionSession, sound])
  useEffect(() => {
    const distance = Math.hypot(telemetry.position[0] - previousStep.current[0], telemetry.position[2] - previousStep.current[2])
    previousStep.current = telemetry.position
    if (inGame && !modal && !missionOpen && distance > .06 && distance < 2) sound.play('step')
  }, [telemetry.position, inGame, modal, missionOpen, sound])
  useEffect(() => {
    if (missionId) setNavigationTarget(missionStatus === 'active' && guidance.preferences.mode === 'guided' ? missionView?.stationId ?? null : null)
  }, [missionId, missionStatus, missionView?.objective?.id, missionView?.stationId, guidance.preferences.mode])
  useEffect(() => {
    if (missionEnvironment) setEnvironment(missionEnvironment)
  }, [missionEnvironment])
  useEffect(() => {
    if (missionStatus && missionStatus !== 'active') {
      setNotice(null)
      if (guideStation && !graphReturn) {
        setGuideStation(null)
        returnToCharacter()
      }
    }
  }, [missionStatus, guideStation, graphReturn, returnToCharacter])
  useEffect(() => { if (clip === 'Celebrate' && !adventures.replay) sound.play('celebration') }, [clip, adventures.replay, sound])
  useEffect(() => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(progress)) } catch { setPreferenceIssue('Browser storage is unavailable. Your discoveries work for this visit but cannot be saved.') } }, [progress])
  useEffect(() => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(preferences)) } catch { setPreferenceIssue('Browser storage is unavailable. Preferences apply for this visit only.') } }, [preferences])
  useEffect(() => {
    if (!notice) return
    const timeout = window.setTimeout(() => setNotice(null), 4300)
    return () => window.clearTimeout(timeout)
  }, [notice])
  useEffect(() => {
    if (!inGame || previousDistrict.current === telemetry.districtId) return
    previousDistrict.current = telemetry.districtId
    const district = getDistrict(telemetry.districtId)
    if (!district) return
    setProgress(previous => enterDistrict(previous, district.id))
    notify(`Welcome to ${district.label}`, 'discovery')
  }, [telemetry.districtId, inGame, notify])
  useEffect(() => { if (modal || missionOpen || screen === 'welcome') input.current.clear() }, [modal, missionOpen, screen])

  const recover = useCallback(() => {
    input.current.clear(); setReset(value => value + 1); setClip('Idle'); setPlaying(true)
    setTelemetry(initialTelemetry); previousDistrict.current = 'hub'; setSelectedStation(null)
    react('Determined')
  }, [react])
  const start = useCallback((next: Screen) => {
    setOnboardingOpen(false); setWatchEnabled(false); setGuideStation(null); setGraphReturn(false); leaveFlow()
    if (next !== 'adventure') leaveAdventure()
    setMissionOpen(false); setScreen(next); setModal(null); setSelectedStation(null); recover()
    if (next === 'studio') { setView('three-quarter'); setExpression('Neutral'); setExpressionIntensity(1); setRotation(0) }
    if (next === 'adventure') setNotice(null)
    if (next === 'explore') notify('No itinerary. Follow whatever catches your eye.')
  }, [notify, recover, leaveAdventure, leaveFlow])
  const closeModal = useCallback(() => {
    const wasStation = modal === 'station'
    setModal(null); setSelectedStation(null); input.current.clear()
    if (wasStation) {
      if (pendingCelebration.current) {
        pendingCelebration.current = false; setClip('Celebrate'); setPlaying(true); react('Celebrating')
        notify('Six perspectives, one connected world. Your first journey is complete!', 'discovery')
      } else { setClip('Idle'); react('Happy') }
    }
  }, [modal, notify, react])
  const interact = useCallback(() => {
    if (!inGame || modal || !telemetry.nearbyId || performance.now() - lastInteraction.current < 650) return
    const target = getStation(telemetry.nearbyId)
    if (!target) return
    lastInteraction.current = performance.now()
    sound.play('interaction'); input.current.clear(); setPlaying(true); setClip('Interact'); setSelectedStation(target.id)
    const next = discoverStation(progress, target.id)
    pendingCelebration.current = introductoryProgress(progress) < 6 && introductoryProgress(next) === 6
    setProgress(next); setModal('station')
    if (!progress.stations.includes(target.id)) notify(`${target.name} added to your field notes.`, 'discovery')
  }, [inGame, modal, telemetry.nearbyId, progress, notify, sound])

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (modal || missionOpen || screen === 'welcome' || rendererIssue) return
      if (event.target instanceof HTMLElement && (['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName) || event.target.isContentEditable)) return
      if (movementKeys.has(event.code)) { if (cinemaView.ownership !== 'player') returnToCharacter(); event.preventDefault(); input.current.add(event.code); if (inGame) setPlaying(true) }
      if (event.repeat) return
      if (event.code === 'KeyE') { event.preventDefault(); if (inGame) interact(); else { setClip('Interact'); setPlaying(true) } }
      if (event.code === 'Space' && !(event.target instanceof HTMLButtonElement)) { event.preventDefault(); setPlaying(true); setClip('Celebrate'); react('Celebrating') }
      if (event.code === 'KeyR') { event.preventDefault(); recover(); if (inGame) notify('Back at the Common. Your discoveries are safe.') }
      if (event.code === 'KeyC' && inGame) { returnToCharacter(); event.preventDefault(); setCameraMode(cameraModes[(cameraModes.findIndex(item => item.id === cameraMode) + 1) % cameraModes.length].id) }
      if (event.code === 'KeyM' && inGame) { event.preventDefault(); setModal('journal') }
      if (event.code === 'Escape') setModal('settings')
    }
    const up = (event: KeyboardEvent) => input.current.delete(event.code)
    const clear = () => input.current.clear()
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', clear)
    document.addEventListener('visibilitychange', clear)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', clear); document.removeEventListener('visibilitychange', clear) }
  }, [modal, missionOpen, rendererIssue, screen, inGame, interact, react, recover, notify, cameraMode, setCameraMode, returnToCharacter, cinemaView.ownership])

  const chooseClip = (value: Clip) => { setClip(value); setPlaying(true) }
  const setPreference = <K extends keyof Preferences>(key: K, value: Preferences[K]) => setPreferences(previous => ({ ...previous, [key]: value }))
  const fullscreen = () => { if (document.fullscreenElement) void document.exitFullscreen().catch(() => {}); else void container.current?.requestFullscreen().catch(() => {}) }
  const resetStudio = () => { recover(); setExpression('Neutral'); setExpressionIntensity(1); setSpeed(1); setRotation(0); setView('three-quarter') }
  const style = { '--district-color': currentDistrict?.color ?? HUB.color } as CSSProperties
  const openNotes = (id: string) => { flow.clearReview(); guidance.registerVisit(id === missionView?.stationId); setSelectedStation(id); setModal('station') }
  const locateStation = (id: string) => {
    const destination = getStation(id)
    if (!destination) return
    if (!inGame) start('explore')
    setModal(null); setSelectedStation(null); setNavigationTarget(id); input.current.clear()
    notify(`Follow the gold marker to ${destination.name}.`)
  }
  const watchFlow = () => { if (adventures.replay) adventures.setReplaySpeed(playback.speed); setNotice(null); setWatchEnabled(true); setMissionOpen(false); setModal(null); setGuideStation(null); input.current.clear(); flow.begin() }
  const exitWatchFlow = () => { setWatchEnabled(false); flow.exit() }
  const guideMe = (id?: string) => {
    const target = id ?? (missionSession ? getMissionGuidance(missionSession, guidance.preferences.mode).target?.stationId : navigationTarget)
    if (!target) return
    flow.clearReview(); setGraphReturn(false); locateStation(target); setMissionOpen(false); setWatchEnabled(false); setGuideStation(target); guidance.dismiss()
    flow.focus({ id: `guide:${target}`, stationId: target, kind: missionSession?.id === 'investigate-incident' ? 'incident' : 'close-up', status: missionSession ? statusForSimulation(missionSession.simulation) : 'neutral' })
    react('Curious')
  }
  const focusGraph = (id: string, related: string[] = []) => { guideMe(id); setGraphReturn(true); flow.focus({ id: `graph:${id}`, stationId: id, relatedStationIds: related.slice(0, 2), kind: 'close-up', status: 'neutral' }) }
  const closeOnboarding = () => { setOnboardingOpen(false); guidance.setPreferences(previous => ({ ...previous, onboardingComplete: true })) }
  const flowPaused = flow.review ? !flow.review.playing : missionSession ? adventures.replay ? !adventures.replay.playing : adventures.paused : lab.paused
  const pauseFlow = () => flow.review ? flow.pauseReview() : missionSession ? adventures.replay ? adventures.pauseReplay() : pauseAdventure() : lab.pause()
  const resumeFlow = () => flow.review ? flow.resumeReview() : missionSession ? adventures.replay ? adventures.resumeReplay() : adventures.resume() : lab.resume()
  const changePlaybackMode = (value: PlaybackPolicy['mode']) => { setPlayback(previous => ({ ...previous, mode: value })); if (value === 'step') { if (missionSession) adventures.holdStage(); else lab.holdStage() } }
  const commandSimulation = (command: SimulationCommand) => {
    flow.clearReview(); setNotice(null)
    if (missionSession) { setModal(null); setMissionOpen(true); return }
    dispatchSimulation(command)
    if (command.type === 'backup') { react('Happy'); notify('A simulated backup was saved for this environment.') }
    if (command.type === 'restore') { react('Determined'); notify('The snapshot was restored into a simulated recovery target.') }
  }

  const openAdventures = () => { pauseAdventure(); adventures.pauseReplay(); setMissionOpen(false); setModal('adventures'); input.current.clear() }
  const launchAdventure = (id: AdventureId, variant?: AdventureVariant) => { adventures.launch(id, variant); start('adventure'); setMissionOpen(true); setEnvironment('development'); sound.play('interaction') }
  const resumeAdventure = (id?: AdventureId) => { adventures.resume(id); start('adventure'); setMissionOpen(true) }
  const restartAdventure = (id?: AdventureId, variant?: AdventureVariant) => { adventures.restart(id, variant); start('adventure'); setMissionOpen(true) }
  const replayAdventure = (recordId: string) => { adventures.startReplay(recordId); start('adventure'); setMissionOpen(true) }
  const commandAdventure = (command: AdventureCommand) => {
    flow.clearReview()
    if (command.type === 'set-hints') adventures.setHintsEnabled(command.enabled)
    else adventures.dispatch(command)
    if (command.type === 'action') sound.play('interaction')
  }
  const exportSave = () => {
    const url = URL.createObjectURL(new Blob([adventures.exportSave()], { type: 'application/json' }))
    const link = document.createElement('a'); link.href = url; link.download = 'awushi-adventures.json'; link.click(); URL.revokeObjectURL(url)
  }
  const replayControls = adventures.replay ? <ReplayControls replay={adventures.replay} onPause={adventures.pauseReplay} onResume={adventures.resumeReplay} onRestart={adventures.restartReplay} onStop={adventures.stopReplay} onSpeed={adventures.setReplaySpeed} /> : undefined

  return <div className={`app phase-three phase-four ${watchEnabled ? 'watching-flow' : ''} ${guideStation && !modal && !missionOpen ? 'guiding-station' : ''} ${missionSession ? 'has-mission' : ''} ${missionOpen ? 'mission-is-open' : ''} screen-${screen} ${preferences.reducedMotion ? 'reduce-motion' : ''}`} ref={container} style={style}>
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" aria-label="Awushi home" onClick={() => { exitWatchFlow(); setGuideStation(null); leaveAdventure(); setMissionOpen(false); setScreen('welcome'); setModal(null); input.current.clear() }}><BrandMark /><span><strong>awushi<span>.</span></strong><small>DEVOPS WORLD</small></span></button>
        <nav className="top-navigation" aria-label="World navigation">
          {screen !== 'welcome' && <button className={inGame ? 'active' : ''} onClick={openAdventures} aria-label="Start Adventure"><Compass size={16} /><span>Start Adventure</span></button>}
          <button className={screen === 'studio' ? 'active' : ''} onClick={() => start('studio')} aria-label="Character studio" data-testid="enter-studio"><Box size={16} /><span>Character studio</span></button>
          <button onClick={() => setModal('architecture')} aria-label="View Architecture"><Layers3 size={16} /><span>Architecture</span></button>
        </nav>
        <div className="header-tools"><span className="local-label"><i />A local little universe</span><button className="icon-button" onClick={() => setModal('help')} aria-label="Open controls and help"><CircleHelp size={18} /></button><button className="icon-button" onClick={() => setModal('settings')} aria-label="Open settings"><Settings2 size={18} /></button></div>
      </header>

      <main className={`workspace ${mode === 'world' ? 'world-workspace' : 'studio-workspace'}`}>
        <div className="viewport" aria-label={mode === 'world' ? 'Awushi’s six-district adventure world' : 'Interactive Awushi character studio'}>
          <Suspense fallback={<div className="canvas-loading"><span className="loader-orbit" /><span>Growing a little world…</span></div>}>
            <Scene clip={clip} playing={playing} speed={mode === 'studio' ? speed : 1} mode={mode} view={view} reset={reset} input={input} onClip={onClip} onReady={onReady}
              cameraMode={screen === 'welcome' ? 'overview' : cameraMode} expression={mode === 'world' ? 'Auto' : expression} expressionIntensity={mode === 'world' ? 1 : expressionIntensity}
              lighting={preferences.lighting} rotation={mode === 'studio' ? rotation : 0} quality={preferences.quality} reducedMotion={preferences.reducedMotion}
              activeStation={modal === 'station' ? selectedStation : missionOpen ? missionView?.stationId ?? null : null} reaction={reaction} inputEnabled={screen !== 'welcome' && modal === null && !missionOpen && !rendererIssue} onTelemetry={onTelemetry} targetStation={navigationTarget} simulation={simulation} simulationEnvironment={missionSession?.simulation.environment ?? environment} cinematic={inGame ? flow.view : undefined} onCameraOverride={flow.override} onCameraSettled={flow.settled} effectsPaused={flow.review ? !flow.review.playing : missionSession ? Boolean(adventures.replay ? !adventures.replay.playing : !adventures.running || (watchEnabled && playback.mode === 'step' && adventures.stepHeld)) : lab.paused || (watchEnabled && playback.mode === 'step' && lab.stepHeld)} onRendererStatus={onRendererStatus} />
          </Suspense>
        </div>
        {rendererIssue && !rendererNoticeDismissed && <div className="renderer-notice" role="alert" data-testid="renderer-notice">{rendererIssue}<button onClick={() => window.location.reload()}>Reload saved adventure</button><button data-testid="dismiss-renderer-notice" onClick={() => setRendererNoticeDismissed(true)}>Continue with field notes</button></div>}
        <div className="scene-vignette" aria-hidden="true" />{inGame && cameraMode === 'first-person' && <span className="first-person-reticle" aria-hidden="true" />}

        {screen === 'welcome' && <section className="welcome" data-testid="screen-welcome">
          <div className="welcome-story"><div className="eyebrow"><span className="tiny-spark">✦</span> SIX ADVENTURES. ONE CURIOUS COMPANION.</div><h1>A little world.<br /><em>A big adventure.</em></h1><p>Ship a release. Solve an incident. Bring a little cloud back to life. Explore with Awushi and learn the engineering behind every decision.</p>
            <div className="welcome-actions"><button className="primary-button" onClick={openAdventures} data-testid="play-adventure"><Play size={16} fill="currentColor" />Start Adventure<ArrowRight size={17} /></button><button className="secondary-button" onClick={() => start('explore')} data-testid="free-explore"><Compass size={17} />Free Explore</button></div>
            <button className="text-button architecture-link" onClick={() => setModal('architecture')} data-testid="view-architecture">View Architecture<ArrowRight size={14} /></button>
            {adventures.resumable.length > 0 && <button className="secondary-button continue-adventure" data-testid="resume-adventure-welcome" onClick={() => resumeAdventure(adventures.resumable.find(record => record.adventureId === adventures.selectedId)?.adventureId ?? adventures.resumable.at(-1)?.adventureId)}>Continue Adventure<ArrowRight size={14} /></button>}
            <PortfolioHighlights onShowcase={() => setModal('showcase')} />
            <div className="welcome-facts"><span><b>06</b> connected districts</span><span><b>{STATIONS.length}</b> places to discover</span><span><b>01</b> very curious companion</span></div>
          </div>
          <div className="welcome-map-caption"><span className="caption-line" /><span>A WORLD BUILT WITH CARE<small>Every bridge leads to a new perspective.</small></span></div>
          <div className="welcome-footer"><span><Footprints size={14} />Explore at your own pace. No precise gaming skills needed.</span><span>EXPLORE / INVESTIGATE / UNDERSTAND</span></div>
        </section>}

        {inGame && <div className="game-hud">
          <section className="district-heading" aria-label="Current district"><div className="eyebrow"><span className="district-dot" />{currentDistrict ? `DISTRICT 0${currentDistrict.order}` : telemetry.districtId === 'skyway' ? 'BETWEEN WORLDS' : 'YOUR ADVENTURE STARTS HERE'}</div><h1 data-testid="district-name">{currentDistrictName}</h1><p>{currentDistrict?.name ?? (telemetry.districtId === 'skyway' ? 'A small bridge. A new perspective.' : 'Six directions. Follow your curiosity.')}</p></section>
          <button className="progress-pill" onClick={() => setModal('journal')} aria-label="Open exploration journal" data-testid="exploration-progress"><BookOpen size={15} /><span><b>{progress.stations.length}</b> / {STATIONS.length} discoveries</span><span className="progress-mini"><i style={{ width: `${progress.stations.length / STATIONS.length * 100}%` }} /></span></button>
          {targetStation ? <div className="objective-pill navigation-target" data-testid="navigation-target"><Compass size={15} /><span>FOLLOW THE GOLD MARKER<small>{targetStation.name}<span>{targetDistance} m away · {getDistrict(targetStation.districtId)?.label}</span></small></span><button className="icon-button" aria-label="Clear navigation target" onClick={() => setNavigationTarget(null)}><X size={13} /></button></div> : screen === 'adventure' && !missionSession && <div className="objective-pill"><Sparkles size={14} /><span>{objective ? <>NEXT LITTLE STEP<small>Discover {objective.label}</small></> : <>FIRST JOURNEY COMPLETE<small>Keep exploring the stories you missed.</small></>}</span><b>{introCount}/6</b></div>}
          <button className="minimap" onClick={() => setModal('journal')} aria-label="Open world map and journal" data-testid="world-minimap"><div className="map-label"><Map size={12} /><span>THE LITTLE WORLD</span><kbd>M</kbd></div><MiniMap position={telemetry.position} districtId={telemetry.districtId} progress={progress} targetId={targetStation?.districtId ?? (screen === 'adventure' ? objective?.id : undefined)} targetStationId={navigationTarget} /><span className="map-footer">{progress.districts.length} of 6 districts visited<ChevronRight size={12} /></span></button>
          <div className="game-bottom-center"><button className={`interaction-prompt ${nearbyStation ? 'available' : ''}`} onClick={interact} disabled={!nearbyStation} data-testid="nearby-interaction"><kbd>E</kbd><span>{nearbyStation ? <><small>TAKE A CLOSER LOOK</small>{nearbyStation.name}</> : 'Follow a path to discover something new'}</span>{nearbyStation && <ArrowRight size={16} />}</button><div className="keyboard-hint"><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>{immersive ? 'Move / turn' : 'Move'}</span><span><kbd>Shift</kbd>Run</span><span><kbd>Space</kbd>Celebrate</span></div></div>
          <div className="camera-hud"><span className="eyebrow">YOUR VIEW OF THE WORLD</span><div className="camera-modes" aria-label="Camera mode">{cameraModes.map(item => <button key={item.id} onClick={() => { flow.returnToCharacter(); setCameraMode(item.id) }} className={cameraMode === item.id ? 'active' : ''} aria-pressed={cameraMode === item.id} data-testid={`camera-${item.id}`}><item.icon size={15} /><span>{item.name}</span></button>)}</div><div className="camera-help">{cameraHints[cameraMode]}<button className="icon-button" onClick={() => { recover(); notify('Back at the Common. Your discoveries are safe.') }} aria-label="Return to central hub" data-testid="return-to-hub"><Home size={14} /></button></div></div>
          {!missionSession && !watchEnabled && <SimulationDock state={simulation} environment={environment} onEnvironment={setEnvironment} onCommand={commandSimulation} onOpen={() => setModal('simulation')} onLocate={locateStation} />}
          {missionSession && !missionOpen && !watchEnabled && <MissionHUD guidanceMode={guidance.preferences.mode} onGuide={guideMe} session={missionSession} onOpen={() => setMissionOpen(true)} onLocate={locateStation} onSelect={openAdventures} paused={adventures.paused} replaying={Boolean(adventures.replay)} />}
          <div className="character-mood"><span className="status-dot" />Awushi is feeling <b>{telemetry.expression.toLowerCase()}</b></div>
          <div className="touch-controls" aria-label="Movement controls">{[{ key: 'KeyW', label: 'Move forward', Icon: ArrowUp }, { key: 'KeyA', label: immersive ? 'Turn left' : 'Move left', Icon: ArrowLeft }, { key: 'KeyS', label: 'Move backward', Icon: ArrowDown }, { key: 'KeyD', label: immersive ? 'Turn right' : 'Move right', Icon: ArrowRight }].map(({ key, label, Icon }) => <button key={key} aria-label={label} onPointerDown={event => { flow.returnToCharacter(); event.currentTarget.setPointerCapture(event.pointerId); input.current.add(key); setPlaying(true) }} onPointerUp={() => input.current.delete(key)} onPointerCancel={() => input.current.delete(key)} onLostPointerCapture={() => input.current.delete(key)}><Icon size={20} /></button>)}<button className="touch-run" aria-label="Run while moving" onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); input.current.add('ShiftLeft') }} onPointerUp={() => input.current.delete('ShiftLeft')} onPointerCancel={() => input.current.delete('ShiftLeft')} onLostPointerCapture={() => input.current.delete('ShiftLeft')}><Zap size={18} /></button></div>
          <button className="touch-celebrate" onClick={() => { chooseClip('Celebrate'); react('Celebrating') }} aria-label="Celebrate"><Sparkles size={20} /></button>
          <output className="sr-only" data-testid="world-position" data-position={telemetry.position.join(',')} data-expression={telemetry.expression} data-fps={telemetry.fps} data-draw-calls={telemetry.drawCalls} data-triangles={telemetry.triangles} data-geometries={telemetry.geometries} data-textures={telemetry.textures}>{telemetry.position.map(value => value.toFixed(2)).join(', ')}</output>
        </div>}

        {inGame && watchEnabled && !missionOpen && <WatchFlow state={simulation} title={missionSession ? missionSession.id.replaceAll('-', ' ') : 'Deployment lab'} fallback={flow.reviewFallback ?? missionFocus} completed={missionSession?.status === 'completed' && !flow.review} policy={playbackPolicy} paused={flowPaused} waiting={missionView?.waiting} stepHeld={missionSession ? adventures.stepHeld : lab.stepHeld} ownership={flow.view.ownership} reviewing={Boolean(flow.review)} recordedJourney={Boolean(adventures.replay)} reviewIndex={flow.review?.index ?? -1} frameCount={flow.frames.length} automaticCamera={guidance.preferences.automaticCamera && !preferences.reducedMotion} onPause={pauseFlow} onResume={resumeFlow} onMode={changePlaybackMode} onSpeed={speed => { setPlayback(previous => ({ ...previous, speed })); if (adventures.replay) adventures.setReplaySpeed(speed) }} onPrevious={() => flow.startReview(flow.review ? flow.review.index - 1 : flow.frames.length - 2)} onNext={() => { if (flow.review) flow.startReview(flow.review.index + 1); else if (!adventures.replay) { if (missionSession) adventures.advanceStage(); else lab.advanceStage() } }} onReplay={() => flow.startReview(flow.review?.index ?? flow.frames.length - 1)} onLive={flow.clearReview} onExit={exitWatchFlow} onOverride={flow.override} onFollow={flow.follow} onReturn={flow.returnToCharacter} onSkip={flow.skip} onNotes={() => { flow.clearReview(); if (missionSession) setMissionOpen(true); else setModal('simulation') }} />}
        {inGame && !watchEnabled && !missionOpen && <div className="world-assistance">
          <button className="secondary-button" onClick={watchFlow} data-testid="watch-flow-start"><Play size={15} />Watch Flow</button>
          {missionStatus === 'active' && missionView?.stationId && <button className="primary-button" onClick={() => guideMe()} data-testid="guide-me-world"><Compass size={15} />Guide Me</button>}
        </div>}
        {inGame && guideStation && !modal && !missionOpen && <aside className="guide-focus-card" data-testid="guide-focus"><span className="eyebrow">A PLACE TO INVESTIGATE</span><strong>{getStation(guideStation)?.name}</strong><p>{missionSession?.status === 'active' && missionView?.stationId === guideStation && !graphReturn ? getMissionGuidance(missionSession, guidance.preferences.mode).target?.reason : getStation(guideStation)?.description}</p><div><button className="primary-button" onClick={() => { if (missionStatus === 'active' && missionView?.stationId === guideStation && !graphReturn) setMissionOpen(true); else openNotes(guideStation) }} data-testid="guide-inspect">{missionStatus === 'active' && missionView?.stationId === guideStation && !graphReturn ? 'Open investigation' : 'Inspect this station'}<ArrowRight size={14} /></button><button className="text-button" onClick={() => { setGuideStation(null); flow.returnToCharacter() }}>Return to Awushi</button>{graphReturn && <button className="text-button" onClick={() => { setModal('architecture'); setGuideStation(null) }} data-testid="return-architecture">Return to architecture</button>}{graphReturn && missionStatus === 'active' && <button className="text-button" onClick={() => setMissionOpen(true)} data-testid="return-mission">Return to mission</button>}</div></aside>}
        {inGame && guidance.offer && !modal && !missionOpen && <aside className="stuck-offer" role="status" data-testid="stuck-help"><p>Need a hint? I can point you toward a useful place to investigate.</p><button onClick={() => guideMe()} className="text-button">Guide Me</button><button onClick={guidance.dismiss} className="text-button">No thanks</button></aside>}
        <GuidedWelcome open={onboardingOpen && !modal && !missionOpen && !watchEnabled && screen !== 'studio'} onClose={closeOnboarding} onStartAdventure={() => { closeOnboarding(); openAdventures() }} onExplore={() => { closeOnboarding(); start('explore') }} onWatchFlow={inGame ? () => { closeOnboarding(); watchFlow() } : undefined} onHelp={() => { closeOnboarding(); setModal('help') }} />
        {screen === 'studio' && <>
          <section className="studio-heading"><div className="eyebrow"><Smile size={13} /> MEET EVERY SIDE OF AWUSHI</div><h1>Small splash.<br /><em>Big personality.</em></h1><p>A little space to breathe, blink, and be yourself.</p></section>
          <aside className={`studio-panel ${studioOpen ? 'open' : ''}`}><button className="studio-panel-toggle" onClick={() => setStudioOpen(!studioOpen)} aria-expanded={studioOpen}><span>CHARACTER CONTROLS</span><ChevronDown size={16} /></button><div className="studio-panel-content"><div className="studio-tabs"><button className={studioTab === 'expressions' ? 'active' : ''} onClick={() => setStudioTab('expressions')} aria-pressed={studioTab === 'expressions'}>Expressions</button><button className={studioTab === 'setup' ? 'active' : ''} onClick={() => setStudioTab('setup')} aria-pressed={studioTab === 'setup'}>Scene & playback</button></div>
            {studioTab === 'expressions' ? <><p className="control-description">Expressions blend independently of the selected animation.</p><div className="expression-grid" aria-label="Facial expression">{expressions.map((name, index) => <button key={name} onClick={() => setExpression(name)} aria-pressed={expression === name} className={expression === name ? 'active' : ''} data-testid={`expression-${name.toLowerCase()}`}><span>{String(index + 1).padStart(2, '0')}</span>{name}</button>)}</div><label className="range-label" htmlFor="expression-intensity">Expression intensity<span>{Math.round(expressionIntensity * 100)}%</span></label><input id="expression-intensity" data-testid="expression-intensity" aria-label="Expression intensity" type="range" min="0" max="1" step=".05" value={expressionIntensity} onChange={event => setExpressionIntensity(Number(event.target.value))} /></> : <div className="scene-controls"><label>Playback speed<select aria-label="Animation playback speed" data-testid="studio-speed" value={speed} onChange={event => setSpeed(Number(event.target.value))}><option value="0.5">0.5× · Unhurried</option><option value="1">1× · Just right</option><option value="1.5">1.5× · A little energy</option></select></label><fieldset><legend>Lighting</legend><div className="lighting-options">{[{ id: 'daylight' as const, name: 'Daylight', Icon: Sun }, { id: 'moonlight' as const, name: 'Moonlight', Icon: Moon }, { id: 'studio' as const, name: 'Studio', Icon: Smile }].map(item => <button key={item.id} className={preferences.lighting === item.id ? 'active' : ''} aria-pressed={preferences.lighting === item.id} onClick={() => setPreference('lighting', item.id)}><item.Icon size={15} />{item.name}</button>)}</div></fieldset><label className="range-label" htmlFor="character-rotation">Character rotation<span>{rotation}°</span></label><input id="character-rotation" aria-label="Character rotation" type="range" min="0" max="360" step="5" value={rotation} onChange={event => setRotation(Number(event.target.value))} /><button className="text-button" onClick={resetStudio}><RotateCcw size={14} />Reset studio controls</button></div>}
            <div className="studio-meta"><span>{info?.expressions?.length ?? 10} expressions</span><i /><span>{info?.clips.length ?? 5} animations</span></div></div></aside>
          <div className="studio-view"><div className="eyebrow">TAKE A LOOK AROUND</div><div className="view-picker" aria-label="Character camera angle">{views.map(item => <button key={item.id} className={view === item.id ? 'active' : ''} aria-pressed={view === item.id} onClick={() => setView(item.id)} title={`${item.label} view`}>{item.label}</button>)}</div><div className="utility-tools"><button className="icon-button" onClick={resetStudio} aria-label="Reset character and camera"><RotateCcw size={16} /></button><button className="icon-button" onClick={fullscreen} aria-label="Toggle fullscreen"><Expand size={16} /></button></div></div>
          <div className="studio-mood"><span className="status-dot" /><span>{expression === 'Auto' ? telemetry.expression : expression} · {clip}</span></div>
          <section className="animation-dock" aria-label="Character animations"><div className="dock-heading"><span>BRING AWUSHI TO LIFE</span><button className="playback-toggle" onClick={() => setPlaying(!playing)} aria-label={playing ? 'Pause animation' : 'Play animation'}>{playing ? <Pause size={13} /> : <Play size={13} />}{playing ? 'Pause' : 'Play'}</button></div><div className="animation-options">{animations.map((item, index) => <button key={item.clip} className={`animation-option ${clip === item.clip ? 'selected' : ''}`} aria-pressed={clip === item.clip} onClick={() => chooseClip(item.clip)} data-testid={`animation-${item.clip.toLowerCase()}`}><span className="animation-number">0{index + 1}</span><item.icon size={22} strokeWidth={1.5} /><span>{item.name}<small>{item.clip === 'Interact' ? 'Interaction' : item.clip === 'Celebrate' ? 'Celebration' : item.clip}</small></span><i /></button>)}</div></section>
        </>}
        {missionSession && missionOpen && <MissionPanel guidanceMode={guidance.preferences.mode} onGuidanceMode={mode => guidance.setPreferences(previous => ({ ...previous, mode }))} onGuide={guideMe} onWatchFlow={watchFlow} onExplore={() => { exitWatchFlow(); setMissionOpen(false) }} session={missionSession} onCommand={commandAdventure} onLocate={id => { locateStation(id); setMissionOpen(false) }} onClose={() => setMissionOpen(false)} onSelect={openAdventures} onRestart={() => restartAdventure()} onReplay={adventures.activeRecord?.completedAt !== null && adventures.activeRecord ? () => replayAdventure(adventures.activeRecord!.id) : undefined} paused={adventures.paused} onPause={pauseAdventure} onResume={() => adventures.resume()} readOnly={Boolean(adventures.replay)} replayControls={replayControls} />}
        {notice && screen !== 'welcome' && <div className={`toast ${notice.type}`} role="status" aria-live="polite" key={notice.id}><span>{notice.type === 'discovery' ? <Sparkles size={16} /> : <Compass size={16} />}</span>{notice.text}</div>}
      </main>
      <footer className="footer"><span>A tiny universe, made from scratch.</span><span>{screen === 'studio' ? 'A LITTLE DIGITAL LIFE' : 'EXPLORE / INVESTIGATE / UNDERSTAND'}<i />LOCAL & YOURS</span></footer>
    </div>

    {adventures.notice && <SaveNoticeBanner notice={adventures.notice} onExport={exportSave} onReset={adventures.resetSave} onDismiss={adventures.dismissNotice} onRetry={adventures.retrySave} />}
    {(preferenceIssue || guidance.storageIssue) && <div className="preference-save-notice" role="status">{preferenceIssue ?? 'Guidance preferences apply for this visit only; browser storage is unavailable.'}<button onClick={() => { setPreferenceIssue(null); guidance.dismissStorageIssue() }} aria-label="Dismiss storage notice"><X size={14} /></button></div>}
    {modal === 'adventures' && <Dialog title="Where will curiosity take you?" eyebrow="CHOOSE YOUR NEXT ADVENTURE" onClose={closeModal} wide className="adventure-dialog adventure-selection-dialog"><AdventureSelection session={adventures.liveSession} completed={adventures.completed} resumable={adventures.resumable} onStart={launchAdventure} onResume={resumeAdventure} onRestart={restartAdventure} onReplay={replayAdventure} onFreeExplore={() => start('explore')} /></Dialog>}
    {modal === 'showcase' && <Dialog title="A little world, engineered with care." eyebrow="BEHIND THE ADVENTURE" onClose={closeModal} wide className="showcase-dialog"><EngineeringShowcase onPlay={openAdventures} onArchitecture={() => setModal('architecture')} /></Dialog>}
    {modal === 'station'  && station && <Dialog title={station.name} eyebrow={`${getDistrict(station.districtId)?.label ?? 'The world'} / TECHNOLOGY STATION`} onClose={closeModal} className="discovery-dialog" testId="discovery-panel"><div className="discovery-badge"><Check size={13} />{progress.stations.includes(station.id) ? 'Discovered with Awushi' : 'Explore the architecture'}</div><StationTechnologyPanel key={station.id} stationId={station.id} state={simulation} environment={environment} onEnvironment={setEnvironment} onCommand={commandSimulation} onLocate={locateStation} onOpenSimulation={() => { if (missionSession) { setModal(null); setMissionOpen(true) } else setModal('simulation') }} readOnly={Boolean(missionSession)} /></Dialog>}

    {modal === 'simulation' && <Dialog title="From a small change to a healthy release." eyebrow="THE DEPLOYMENT LAB / SIMULATED" onClose={closeModal} wide className="simulation-dialog"><SimulationPanel onWatchFlow={watchFlow} onExplore={() => { exitWatchFlow(); closeModal() }} state={simulation} environment={environment} onEnvironment={setEnvironment} onCommand={commandSimulation} onLocate={locateStation} scenario={scenario} onScenario={setScenario} /></Dialog>}

    {modal === 'settings' && <Dialog title="Make yourself at home." eyebrow="A FEW LITTLE PREFERENCES" onClose={closeModal} className="settings-dialog"><p className="dialog-intro">Find the view and pace that feel right for you.</p><label className="settings-row"><span><strong>Guidance</strong><small>Change help without resetting progress.</small></span><select aria-label="Guidance preference" value={guidance.preferences.mode} onChange={event => guidance.setPreferences(previous => ({ ...previous, mode: event.target.value as typeof previous.mode }))}><option value="guided">Guided Explorer</option><option value="engineer">Engineer</option><option value="commander">Incident Commander</option></select></label><label className="settings-row"><span><strong>Automatic camera movement</strong><small>Watch Flow follows stations. Reduced motion also disables automatic following.</small></span><input type="checkbox" data-testid="automatic-camera" checked={guidance.preferences.automaticCamera} onChange={event => { const automaticCamera = event.target.checked; guidance.setPreferences(previous => ({ ...previous, automaticCamera })); if (!automaticCamera) flow.returnToCharacter() }} /></label><label className="settings-row"><span><strong>Visual quality</strong><small>Choose Low for smaller devices or a lighter view.</small></span><select value={preferences.quality} onChange={event => setPreference('quality', event.target.value as Quality)} aria-label="Visual quality" data-testid="quality-select"><option value="low">Low</option><option value="balanced">Balanced</option><option value="high">High</option></select></label><label className="settings-row"><span><strong>Reduced motion</strong><small>Quieter camera transitions and decorative movement.</small></span><input type="checkbox" checked={preferences.reducedMotion} onChange={event => { setPreference('reducedMotion', event.target.checked); if (event.target.checked) flow.returnToCharacter() }} data-testid="reduced-motion" /></label><label className="settings-row"><span><strong>World lighting</strong><small>A different atmosphere, the same little world.</small></span><select value={preferences.lighting} onChange={event => setPreference('lighting', event.target.value as Lighting)} aria-label="World lighting"><option value="daylight">Daylight</option><option value="moonlight">Moonlight</option><option value="studio">Studio</option></select></label><label className="settings-row"><span><strong>Sound effects</strong><small>Original, locally synthesized sounds. Starts only after your interaction.</small></span><input type="checkbox" checked={!preferences.sound.muted} data-testid="sound-enabled" onChange={event => { const value = { ...preferences.sound, muted: !event.target.checked }; setPreference('sound', value); sound.configure(value); void sound.unlock().then(() => sound.play('interaction')) }} /></label><label className="settings-row"><span><strong>Volume</strong><small data-testid="audio-status" data-cues-played={sound.played} data-active-voices={sound.voiceCount}>{sound.status}</small></span><input type="range" aria-label="Sound volume" min="0" max="1" step=".05" value={preferences.sound.volume} onChange={event => setPreference('sound', { ...preferences.sound, volume: Number(event.target.value) })} /></label><label className="settings-row"><span><strong>Adventure hints</strong><small>Four levels, from a nudge to a suggested fix.</small></span><input type="checkbox" aria-label="Enable adventure hints" checked={adventures.hintsEnabled} onChange={event => adventures.setHintsEnabled(event.target.checked)} /></label><div className="performance-card" data-testid="performance-stats"><Activity size={16} /><div><strong>{telemetry.fps > 0 ? `${Math.round(telemetry.fps)} FPS` : 'Measuring…'}</strong><span>Live frame rate · {telemetry.drawCalls} draw calls · {Math.round(telemetry.triangles / 1000)}k triangles</span></div></div><div className="settings-actions"><button className="secondary-button" onClick={() => { setModal(null); if (!inGame) start('adventure'); else recover(); notify('Back at the Common. Your discoveries are safe.') }}><Home size={15} />Return to central hub</button><button className="text-button" data-testid="reset-progress" onClick={() => { setProgress(resetProgress()); pendingCelebration.current = false; start('adventure'); notify('A fresh notebook. Your new journey starts here.') }}><RotateCcw size={14} />Reset exploration progress</button><small>Discoveries and preferences are saved in this browser when local storage is available.</small></div></Dialog>}

    {modal === 'help' && <Dialog title="Curiosity is all you need." eyebrow="YOUR LITTLE ADVENTURE GUIDE" onClose={closeModal}><p className="dialog-intro">Follow the bridges between districts. Walk near a landmark, then take a closer look. Every place has a story.</p><button className="secondary-button" data-testid="replay-onboarding" onClick={() => { closeModal(); setOnboardingOpen(true) }}>Replay the quick introduction</button><div className="help-controls"><div><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><small>or arrow keys</small></span><strong>W/S move · A/D turn in Follow and First person</strong></div><div><kbd>Shift</kbd><strong>Run while moving</strong></div><div><kbd>C</kbd><strong>Switch camera perspective</strong></div><div><kbd>E</kbd><strong>Discover a nearby landmark</strong></div><div><kbd>Space</kbd><strong>Make a happy splash</strong></div><div><kbd>M</kbd><strong>Open your map & journal</strong></div><div><kbd>R</kbd><strong>{mode === 'studio' ? 'Reset animation' : 'Return to the central hub'}</strong></div><div><kbd>Esc</kbd><strong>Close a panel / open settings</strong></div></div><p className="help-touch">On a touch screen, hold up/down to move and left/right to turn in Follow or First person; hold the lightning control with another finger to run and tap the nearby landmark prompt to interact. Drag the world to look around in Follow or First person. Use C or the camera buttons to change perspective.</p><button className="primary-button" onClick={closeModal}>Let’s make a splash<ArrowRight size={16} /></button></Dialog>}

    {modal === 'journal' && <Dialog title="A notebook full of little discoveries." eyebrow="YOUR WORLD MAP & FIELD NOTES" onClose={closeModal} wide className="journal-dialog"><div className="journal-layout"><div className="journal-map"><MiniMap position={telemetry.position} districtId={telemetry.districtId} progress={progress} expanded targetStationId={navigationTarget} /><div className="journal-totals"><span><b>{progress.districts.length}/6</b> districts visited</span><span><b>{progress.stations.length}/{STATIONS.length}</b> stories discovered</span></div><p>The bright dot is Awushi. Bridges connect the Common to every district, and each district to its neighbors.</p><button className="secondary-button" onClick={() => { setCameraMode('overview'); closeModal() }}><Map size={16} />See the whole world</button></div><div className="journal-districts">{DISTRICTS.map(district => <section key={district.id} style={{ '--place-color': district.color } as CSSProperties}><div className="journal-district-heading"><span>{district.order}</span><div><h3>{district.label}</h3><p>{district.name}</p></div>{progress.districts.includes(district.id) && <Check size={15} />}</div><div className="journal-stations">{STATIONS.filter(item => item.districtId === district.id).map(item => <div key={item.id} className="journal-station-row"><button onClick={() => openNotes(item.id)} disabled={!progress.stations.includes(item.id)}><span>{item.name}</span>{progress.stations.includes(item.id) ? <ChevronRight size={14} /> : <small>Undiscovered</small>}</button><button className="journal-locate" aria-label={`Find ${item.name} in the world`} data-testid={`locate-station-${item.id}`} onClick={() => locateStation(item.id)}><Compass size={14} /></button></div>)}</div></section>)}</div></div></Dialog>}

    {modal === 'architecture' && <Dialog title="One lifecycle. Every connection matters." eyebrow="THE DEVOPS WORLD / INTERACTIVE ARCHITECTURE" onClose={closeModal} wide className="architecture-dialog"><ArchitectureExplorer selectedId={graphSelection} onSelectTechnology={setGraphSelection} onFocusStation={focusGraph} onFollowFlow={(from, to) => { focusGraph(to, [from]); flow.focus({ id: `relationship:${from}:${to}`, stationId: to, relatedStationIds: [from], kind: 'relationship', status: 'neutral' }) }} state={simulation} environment={environment} onEnvironment={setEnvironment} onLocate={locateStation} /></Dialog>}
  </div>
}
