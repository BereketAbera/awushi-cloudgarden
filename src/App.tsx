import { lazy, Suspense, useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { Activity, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, BookOpen, Box, Check, ChevronDown, ChevronRight, CircleHelp, Compass, Database, Droplets, Expand, Footprints, GitBranch, Home, Layers3, Map, Moon, Pause, Play, RotateCcw, Settings2, Shield, Ship, Smile, Sparkles, Sun, Telescope, Zap } from 'lucide-react'
import { Dialog } from './components/Dialog'
import { MiniMap } from './components/MiniMap'
import { DISTRICTS, HUB, STATIONS, WORLD_LAYOUT, getDistrict, getStation } from './worldConfig'
import { STORAGE_KEY, createProgress, discoverStation, enterDistrict, introductoryProgress, parseProgress, resetProgress, type Progress } from './game/progress'
import type { AssetInfo, CameraMode, Clip, ExpressionName, Lighting, Quality, Reaction, Telemetry, View } from './game/types'

const Scene = lazy(() => import('./Scene'))
type Screen = 'welcome' | 'adventure' | 'explore' | 'studio'
type Modal = 'settings' | 'help' | 'architecture' | 'journal' | 'station' | null
type Preferences = { quality: Quality; reducedMotion: boolean; lighting: Lighting }
const PREFS_KEY = 'awushi-preferences-v2'
const expressions: ExpressionName[] = ['Neutral', 'Happy', 'Curious', 'Thinking', 'Excited', 'Worried', 'Surprised', 'Determined', 'Celebrating', 'Sleepy']
const animations: { clip: Clip; icon: typeof Activity; name: string }[] = [
  { clip: 'Idle', icon: Droplets, name: 'Just being' }, { clip: 'Walk', icon: Footprints, name: 'Little steps' },
  { clip: 'Run', icon: Zap, name: 'On a mission' }, { clip: 'Interact', icon: Smile, name: 'Oh, hello!' }, { clip: 'Celebrate', icon: Sparkles, name: 'We did it!' },
]
const views: { id: View; label: string }[] = [{ id: 'three-quarter', label: '¾' }, { id: 'front', label: 'Front' }, { id: 'side', label: 'Side' }, { id: 'back', label: 'Back' }]
const cameraModes: { id: CameraMode; name: string; icon: typeof Compass }[] = [{ id: 'follow', name: 'Follow', icon: Footprints }, { id: 'explore', name: 'Explore', icon: Compass }, { id: 'overview', name: 'Overview', icon: Map }]
const districtIcons: Record<string, typeof Compass> = { development: GitBranch, infrastructure: Ship, orchestration: Layers3, security: Shield, observability: Telescope, data: Database }
const movementKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight', 'ShiftLeft', 'ShiftRight'])
const initialTelemetry: Telemetry = { position: WORLD_LAYOUT.spawn, districtId: 'hub', nearbyId: null, expression: 'Neutral', fps: 0, drawCalls: 0, triangles: 0 }

function readProgress(): Progress { try { return parseProgress(localStorage.getItem(STORAGE_KEY)) } catch { return createProgress() } }
function readPreferences(): Preferences {
  const initial: Preferences = { quality: 'balanced', reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches, lighting: 'daylight' }
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<Preferences>
    return { quality: ['low', 'balanced', 'high'].includes(saved.quality ?? '') ? saved.quality! : initial.quality, reducedMotion: typeof saved.reducedMotion === 'boolean' ? saved.reducedMotion : initial.reducedMotion, lighting: ['daylight', 'moonlight', 'studio'].includes(saved.lighting ?? '') ? saved.lighting! : initial.lighting }
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
  const [cameraMode, setCameraMode] = useState<CameraMode>('follow')
  const [expression, setExpression] = useState<ExpressionName | 'Auto'>('Neutral')
  const [expressionIntensity, setExpressionIntensity] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [preferences, setPreferences] = useState<Preferences>(readPreferences)
  const [progress, setProgress] = useState<Progress>(readProgress)
  const [telemetry, setTelemetry] = useState<Telemetry>(initialTelemetry)
  const [info, setInfo] = useState<AssetInfo | null>(null)
  const [selectedStation, setSelectedStation] = useState<string | null>(null)
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
  const station = selectedStation ? getStation(selectedStation) : undefined
  const nearbyStation = telemetry.nearbyId ? getStation(telemetry.nearbyId) : undefined
  const currentDistrict = getDistrict(telemetry.districtId)
  const currentDistrictName = currentDistrict?.label ?? (telemetry.districtId === 'skyway' ? 'The Skyways' : HUB.name)
  const introCount = introductoryProgress(progress)
  const objective = DISTRICTS.find(district => !progress.stations.includes(district.introStation))

  const notify = useCallback((text: string, type: 'discovery' | 'info' = 'info') => setNotice({ id: ++noticeNumber.current, text, type }), [])
  const react = useCallback((value: ExpressionName) => setReaction({ id: ++reactionNumber.current, expression: value }), [])
  const onReady = useCallback((value: AssetInfo) => setInfo(value), [])
  const onClip = useCallback((value: Clip) => setClip(value), [])
  const onTelemetry = useCallback((value: Telemetry) => setTelemetry(value), [])

  useEffect(() => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(progress)) } catch { /* Exploring still works with browser storage disabled. */ } }, [progress])
  useEffect(() => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(preferences)) } catch { /* Preferences remain effective for this visit. */ } }, [preferences])
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
  useEffect(() => { if (modal || screen === 'welcome') input.current.clear() }, [modal, screen])

  const recover = useCallback(() => {
    input.current.clear(); setReset(value => value + 1); setClip('Idle'); setPlaying(true)
    setTelemetry(initialTelemetry); previousDistrict.current = 'hub'; setSelectedStation(null)
    react('Determined')
  }, [react])
  const start = useCallback((next: Screen) => {
    setScreen(next); setModal(null); setCameraMode('follow'); setSelectedStation(null); recover()
    if (next === 'studio') { setView('three-quarter'); setExpression('Neutral'); setExpressionIntensity(1); setRotation(0) }
    if (next === 'adventure') notify('Follow the bridges. Every district has a story.')
    if (next === 'explore') notify('No itinerary. Follow whatever catches your eye.')
  }, [notify, recover])
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
    input.current.clear(); setPlaying(true); setClip('Interact'); setSelectedStation(target.id)
    const next = discoverStation(progress, target.id)
    pendingCelebration.current = introductoryProgress(progress) < 6 && introductoryProgress(next) === 6
    setProgress(next); setModal('station')
    if (!progress.stations.includes(target.id)) notify(`${target.name} added to your field notes.`, 'discovery')
  }, [inGame, modal, telemetry.nearbyId, progress, notify])

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (modal || screen === 'welcome') return
      if (event.target instanceof HTMLElement && (['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName) || event.target.isContentEditable)) return
      if (movementKeys.has(event.code)) { event.preventDefault(); input.current.add(event.code); if (inGame) setPlaying(true) }
      if (event.repeat) return
      if (event.code === 'KeyE') { event.preventDefault(); if (inGame) interact(); else { setClip('Interact'); setPlaying(true) } }
      if (event.code === 'Space' && !(event.target instanceof HTMLButtonElement)) { event.preventDefault(); setPlaying(true); setClip('Celebrate'); react('Celebrating') }
      if (event.code === 'KeyR') { event.preventDefault(); recover(); if (inGame) notify('Back at the Common. Your discoveries are safe.') }
      if (event.code === 'KeyM' && inGame) { event.preventDefault(); setModal('journal') }
      if (event.code === 'Escape') setModal('settings')
    }
    const up = (event: KeyboardEvent) => input.current.delete(event.code)
    const clear = () => input.current.clear()
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', clear)
    document.addEventListener('visibilitychange', clear)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', clear); document.removeEventListener('visibilitychange', clear) }
  }, [modal, screen, inGame, interact, react, recover, notify])

  const chooseClip = (value: Clip) => { setClip(value); setPlaying(true) }
  const setPreference = <K extends keyof Preferences>(key: K, value: Preferences[K]) => setPreferences(previous => ({ ...previous, [key]: value }))
  const fullscreen = () => { if (document.fullscreenElement) void document.exitFullscreen().catch(() => {}); else void container.current?.requestFullscreen().catch(() => {}) }
  const resetStudio = () => { recover(); setExpression('Neutral'); setExpressionIntensity(1); setSpeed(1); setRotation(0); setView('three-quarter') }
  const style = { '--district-color': currentDistrict?.color ?? HUB.color } as CSSProperties
  const openNotes = (id: string) => { setSelectedStation(id); setModal('station') }

  return <div className={`app phase-one screen-${screen} ${preferences.reducedMotion ? 'reduce-motion' : ''}`} ref={container} style={style}>
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" aria-label="Awushi home" onClick={() => { setScreen('welcome'); setModal(null); input.current.clear() }}><BrandMark /><span><strong>awushi<span>.</span></strong><small>DEVOPS WORLD</small></span></button>
        <nav className="top-navigation" aria-label="World navigation">
          {screen !== 'welcome' && <button className={inGame ? 'active' : ''} onClick={() => start('adventure')} aria-label="Play Adventure"><Compass size={16} /><span>Adventure</span></button>}
          <button className={screen === 'studio' ? 'active' : ''} onClick={() => start('studio')} data-testid="enter-studio"><Box size={16} /><span>Character studio</span></button>
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
              activeStation={modal === 'station' ? selectedStation : null} reaction={reaction} inputEnabled={screen !== 'welcome' && modal === null} onTelemetry={onTelemetry} />
          </Suspense>
        </div>
        <div className="scene-vignette" aria-hidden="true" />

        {screen === 'welcome' && <section className="welcome" data-testid="screen-welcome">
          <div className="welcome-story"><div className="eyebrow"><span className="tiny-spark">✦</span> AN ADVENTURE IN THE MAKING</div><h1>A little world.<br /><em>A big adventure.</em></h1><p>Meet Awushi. Follow a curious little splash across six floating districts, and discover how good software finds its way into the world.</p>
            <div className="welcome-actions"><button className="primary-button" onClick={() => start('adventure')} data-testid="play-adventure"><Play size={16} fill="currentColor" />Play Adventure<ArrowRight size={17} /></button><button className="secondary-button" onClick={() => start('explore')} data-testid="free-explore"><Compass size={17} />Free Explore</button></div>
            <button className="text-button architecture-link" onClick={() => setModal('architecture')} data-testid="view-architecture">View Architecture<ArrowRight size={14} /></button>
            <div className="welcome-facts"><span><b>06</b> connected districts</span><span><b>{STATIONS.length}</b> places to discover</span><span><b>01</b> very curious companion</span></div>
          </div>
          <div className="welcome-map-caption"><span className="caption-line" /><span>A WORLD BUILT WITH CARE<small>Every bridge leads to a new perspective.</small></span></div>
          <div className="welcome-footer"><span><Footprints size={14} />Explore at your own pace. No precise gaming skills needed.</span><span>PHASE 01 / DISCOVERY</span></div>
        </section>}

        {inGame && <div className="game-hud">
          <section className="district-heading" aria-label="Current district"><div className="eyebrow"><span className="district-dot" />{currentDistrict ? `DISTRICT 0${currentDistrict.order}` : telemetry.districtId === 'skyway' ? 'BETWEEN WORLDS' : 'YOUR ADVENTURE STARTS HERE'}</div><h1 data-testid="district-name">{currentDistrictName}</h1><p>{currentDistrict?.name ?? (telemetry.districtId === 'skyway' ? 'A small bridge. A new perspective.' : 'Six directions. Follow your curiosity.')}</p></section>
          <button className="progress-pill" onClick={() => setModal('journal')} aria-label="Open exploration journal" data-testid="exploration-progress"><BookOpen size={15} /><span><b>{progress.stations.length}</b> / {STATIONS.length} discoveries</span><span className="progress-mini"><i style={{ width: `${progress.stations.length / STATIONS.length * 100}%` }} /></span></button>
          {screen === 'adventure' && <div className="objective-pill"><Sparkles size={14} /><span>{objective ? <>NEXT LITTLE STEP<small>Discover {objective.label}</small></> : <>FIRST JOURNEY COMPLETE<small>Keep exploring the stories you missed.</small></>}</span><b>{introCount}/6</b></div>}
          <button className="minimap" onClick={() => setModal('journal')} aria-label="Open world map and journal" data-testid="world-minimap"><div className="map-label"><Map size={12} /><span>THE LITTLE WORLD</span><kbd>M</kbd></div><MiniMap position={telemetry.position} districtId={telemetry.districtId} progress={progress} targetId={screen === 'adventure' ? objective?.id : undefined} /><span className="map-footer">{progress.districts.length} of 6 districts visited<ChevronRight size={12} /></span></button>
          <div className="game-bottom-center"><button className={`interaction-prompt ${nearbyStation ? 'available' : ''}`} onClick={interact} disabled={!nearbyStation} data-testid="nearby-interaction"><kbd>E</kbd><span>{nearbyStation ? <><small>TAKE A CLOSER LOOK</small>{nearbyStation.name}</> : 'Follow a path to discover something new'}</span>{nearbyStation && <ArrowRight size={16} />}</button><div className="keyboard-hint"><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>Move</span><span><kbd>Shift</kbd>Run</span><span><kbd>Space</kbd>Celebrate</span></div></div>
          <div className="camera-hud"><span className="eyebrow">YOUR VIEW OF THE WORLD</span><div className="camera-modes" aria-label="Camera mode">{cameraModes.map(item => <button key={item.id} onClick={() => setCameraMode(item.id)} className={cameraMode === item.id ? 'active' : ''} aria-pressed={cameraMode === item.id} data-testid={`camera-${item.id}`}><item.icon size={15} /><span>{item.name}</span></button>)}</div><div className="camera-help">{cameraMode === 'follow' ? 'Awushi leads. The camera follows.' : cameraMode === 'explore' ? 'Drag to orbit · Scroll or pinch to zoom' : 'Every district, one connected world.'}<button className="icon-button" onClick={() => { recover(); notify('Back at the Common. Your discoveries are safe.') }} aria-label="Return to central hub" data-testid="return-to-hub"><Home size={14} /></button></div></div>
          <div className="character-mood"><span className="status-dot" />Awushi is feeling <b>{telemetry.expression.toLowerCase()}</b></div>
          <div className="touch-controls" aria-label="Movement controls">{[{ key: 'KeyW', label: 'Move forward', Icon: ArrowUp }, { key: 'KeyA', label: 'Move left', Icon: ArrowLeft }, { key: 'KeyS', label: 'Move backward', Icon: ArrowDown }, { key: 'KeyD', label: 'Move right', Icon: ArrowRight }].map(({ key, label, Icon }) => <button key={key} aria-label={label} onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); input.current.add(key); setPlaying(true) }} onPointerUp={() => input.current.delete(key)} onPointerCancel={() => input.current.delete(key)} onLostPointerCapture={() => input.current.delete(key)}><Icon size={20} /></button>)}<button className="touch-run" aria-label="Run while moving" onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); input.current.add('ShiftLeft') }} onPointerUp={() => input.current.delete('ShiftLeft')} onPointerCancel={() => input.current.delete('ShiftLeft')} onLostPointerCapture={() => input.current.delete('ShiftLeft')}><Zap size={18} /></button></div>
          <button className="touch-celebrate" onClick={() => { chooseClip('Celebrate'); react('Celebrating') }} aria-label="Celebrate"><Sparkles size={20} /></button>
          <output className="sr-only" data-testid="world-position" data-position={telemetry.position.join(',')} data-expression={telemetry.expression}>{telemetry.position.map(value => value.toFixed(2)).join(', ')}</output>
        </div>}

        {screen === 'studio' && <>
          <section className="studio-heading"><div className="eyebrow"><Smile size={13} /> MEET EVERY SIDE OF AWUSHI</div><h1>Small splash.<br /><em>Big personality.</em></h1><p>A little space to breathe, blink, and be yourself.</p></section>
          <aside className={`studio-panel ${studioOpen ? 'open' : ''}`}><button className="studio-panel-toggle" onClick={() => setStudioOpen(!studioOpen)} aria-expanded={studioOpen}><span>CHARACTER CONTROLS</span><ChevronDown size={16} /></button><div className="studio-panel-content"><div className="studio-tabs"><button className={studioTab === 'expressions' ? 'active' : ''} onClick={() => setStudioTab('expressions')} aria-pressed={studioTab === 'expressions'}>Expressions</button><button className={studioTab === 'setup' ? 'active' : ''} onClick={() => setStudioTab('setup')} aria-pressed={studioTab === 'setup'}>Scene & playback</button></div>
            {studioTab === 'expressions' ? <><p className="control-description">Expressions blend independently of the selected animation.</p><div className="expression-grid" aria-label="Facial expression">{expressions.map((name, index) => <button key={name} onClick={() => setExpression(name)} aria-pressed={expression === name} className={expression === name ? 'active' : ''} data-testid={`expression-${name.toLowerCase()}`}><span>{String(index + 1).padStart(2, '0')}</span>{name}</button>)}</div><label className="range-label" htmlFor="expression-intensity">Expression intensity<span>{Math.round(expressionIntensity * 100)}%</span></label><input id="expression-intensity" data-testid="expression-intensity" aria-label="Expression intensity" type="range" min="0" max="1" step=".05" value={expressionIntensity} onChange={event => setExpressionIntensity(Number(event.target.value))} /></> : <div className="scene-controls"><label>Playback speed<select aria-label="Animation playback speed" data-testid="studio-speed" value={speed} onChange={event => setSpeed(Number(event.target.value))}><option value="0.5">0.5× · Unhurried</option><option value="1">1× · Just right</option><option value="1.5">1.5× · A little energy</option></select></label><fieldset><legend>Lighting</legend><div className="lighting-options">{[{ id: 'daylight' as const, name: 'Daylight', Icon: Sun }, { id: 'moonlight' as const, name: 'Moonlight', Icon: Moon }, { id: 'studio' as const, name: 'Studio', Icon: Smile }].map(item => <button key={item.id} className={preferences.lighting === item.id ? 'active' : ''} aria-pressed={preferences.lighting === item.id} onClick={() => setPreference('lighting', item.id)}><item.Icon size={15} />{item.name}</button>)}</div></fieldset><label className="range-label" htmlFor="character-rotation">Character rotation<span>{rotation}°</span></label><input id="character-rotation" aria-label="Character rotation" type="range" min="0" max="360" step="5" value={rotation} onChange={event => setRotation(Number(event.target.value))} /><button className="text-button" onClick={resetStudio}><RotateCcw size={14} />Reset studio controls</button></div>}
            <div className="studio-meta"><span>{info?.expressions?.length ?? 10} expressions</span><i /><span>{info?.clips.length ?? 5} animations</span></div></div></aside>
          <div className="studio-view"><div className="eyebrow">TAKE A LOOK AROUND</div><div className="view-picker" aria-label="Character camera angle">{views.map(item => <button key={item.id} className={view === item.id ? 'active' : ''} aria-pressed={view === item.id} onClick={() => setView(item.id)} title={`${item.label} view`}>{item.label}</button>)}</div><div className="utility-tools"><button className="icon-button" onClick={resetStudio} aria-label="Reset character and camera"><RotateCcw size={16} /></button><button className="icon-button" onClick={fullscreen} aria-label="Toggle fullscreen"><Expand size={16} /></button></div></div>
          <div className="studio-mood"><span className="status-dot" /><span>{expression === 'Auto' ? telemetry.expression : expression} · {clip}</span></div>
          <section className="animation-dock" aria-label="Character animations"><div className="dock-heading"><span>BRING AWUSHI TO LIFE</span><button className="playback-toggle" onClick={() => setPlaying(!playing)} aria-label={playing ? 'Pause animation' : 'Play animation'}>{playing ? <Pause size={13} /> : <Play size={13} />}{playing ? 'Pause' : 'Play'}</button></div><div className="animation-options">{animations.map((item, index) => <button key={item.clip} className={`animation-option ${clip === item.clip ? 'selected' : ''}`} aria-pressed={clip === item.clip} onClick={() => chooseClip(item.clip)} data-testid={`animation-${item.clip.toLowerCase()}`}><span className="animation-number">0{index + 1}</span><item.icon size={22} strokeWidth={1.5} /><span>{item.name}<small>{item.clip === 'Interact' ? 'Interaction' : item.clip === 'Celebrate' ? 'Celebration' : item.clip}</small></span><i /></button>)}</div></section>
        </>}
        {notice && screen !== 'welcome' && <div className={`toast ${notice.type}`} role="status" aria-live="polite" key={notice.id}><span>{notice.type === 'discovery' ? <Sparkles size={16} /> : <Compass size={16} />}</span>{notice.text}</div>}
      </main>
      <footer className="footer"><span>A tiny universe, made from scratch.</span><span>{screen === 'studio' ? 'A LITTLE DIGITAL LIFE' : 'PHASE 01 / DISCOVERY'}<i />LOCAL & YOURS</span></footer>
    </div>

    {modal === 'station' && station && <Dialog title={station.name} eyebrow={`${getDistrict(station.districtId)?.label ?? 'The world'} / FIELD NOTES`} onClose={closeModal} className="discovery-dialog" testId="discovery-panel"><div className="discovery-badge"><Check size={13} />{progress.stations.includes(station.id) ? 'Discovered with Awushi' : 'Discovery notes'}</div><p className="dialog-intro">{station.description}</p><ol className="discovery-steps">{station.steps.map((step, index) => <li key={step.label}><span>{String(index + 1).padStart(2, '0')}</span><div><h3>{step.label}</h3><p>{step.detail}</p></div></li>)}</ol><div className="future-note"><Layers3 size={15} /><span><strong>Discovery today. Hands-on later.</strong>{station.future}</span></div><button className="primary-button" onClick={closeModal}>Keep exploring<ArrowRight size={16} /></button></Dialog>}

    {modal === 'settings' && <Dialog title="Make yourself at home." eyebrow="A FEW LITTLE PREFERENCES" onClose={closeModal} className="settings-dialog"><p className="dialog-intro">Find the view and pace that feel right for you.</p><label className="settings-row"><span><strong>Visual quality</strong><small>Choose Low for smaller devices or a lighter view.</small></span><select value={preferences.quality} onChange={event => setPreference('quality', event.target.value as Quality)} aria-label="Visual quality" data-testid="quality-select"><option value="low">Low</option><option value="balanced">Balanced</option><option value="high">High</option></select></label><label className="settings-row"><span><strong>Reduced motion</strong><small>Quieter camera transitions and decorative movement.</small></span><input type="checkbox" checked={preferences.reducedMotion} onChange={event => setPreference('reducedMotion', event.target.checked)} data-testid="reduced-motion" /></label><label className="settings-row"><span><strong>World lighting</strong><small>A different atmosphere, the same little world.</small></span><select value={preferences.lighting} onChange={event => setPreference('lighting', event.target.value as Lighting)} aria-label="World lighting"><option value="daylight">Daylight</option><option value="moonlight">Moonlight</option><option value="studio">Studio</option></select></label><div className="performance-card" data-testid="performance-stats"><Activity size={16} /><div><strong>{telemetry.fps > 0 ? `${Math.round(telemetry.fps)} FPS` : 'Measuring…'}</strong><span>Live frame rate · {telemetry.drawCalls} draw calls · {Math.round(telemetry.triangles / 1000)}k triangles</span></div></div><div className="settings-actions"><button className="secondary-button" onClick={() => { setModal(null); if (!inGame) start('adventure'); else recover(); notify('Back at the Common. Your discoveries are safe.') }}><Home size={15} />Return to central hub</button><button className="text-button" data-testid="reset-progress" onClick={() => { setProgress(resetProgress()); pendingCelebration.current = false; start('adventure'); notify('A fresh notebook. Your new journey starts here.') }}><RotateCcw size={14} />Reset exploration progress</button><small>Discoveries and preferences are saved in this browser when local storage is available.</small></div></Dialog>}

    {modal === 'help' && <Dialog title="Curiosity is all you need." eyebrow="YOUR LITTLE ADVENTURE GUIDE" onClose={closeModal}><p className="dialog-intro">Follow the bridges between districts. Walk near a landmark, then take a closer look. Every place has a story.</p><div className="help-controls"><div><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><small>or arrow keys</small></span><strong>Move around</strong></div><div><kbd>Shift</kbd><strong>Run while moving</strong></div><div><kbd>E</kbd><strong>Discover a nearby landmark</strong></div><div><kbd>Space</kbd><strong>Make a happy splash</strong></div><div><kbd>M</kbd><strong>Open your map & journal</strong></div><div><kbd>R</kbd><strong>{mode === 'studio' ? 'Reset animation' : 'Return to the central hub'}</strong></div><div><kbd>Esc</kbd><strong>Close a panel / open settings</strong></div></div><p className="help-touch">On a touch screen, hold the arrow pad to move and tap the nearby landmark prompt to interact. Explore mode supports drag and pinch. Follow mode keeps Awushi in view.</p><button className="primary-button" onClick={closeModal}>Let’s make a splash<ArrowRight size={16} /></button></Dialog>}

    {modal === 'journal' && <Dialog title="A notebook full of little discoveries." eyebrow="YOUR WORLD MAP & FIELD NOTES" onClose={closeModal} wide className="journal-dialog"><div className="journal-layout"><div className="journal-map"><MiniMap position={telemetry.position} districtId={telemetry.districtId} progress={progress} expanded /><div className="journal-totals"><span><b>{progress.districts.length}/6</b> districts visited</span><span><b>{progress.stations.length}/{STATIONS.length}</b> stories discovered</span></div><p>The bright dot is Awushi. Bridges connect the Common to every district, and each district to its neighbors.</p><button className="secondary-button" onClick={() => { setCameraMode('overview'); closeModal() }}><Map size={16} />See the whole world</button></div><div className="journal-districts">{DISTRICTS.map(district => <section key={district.id} style={{ '--place-color': district.color } as CSSProperties}><div className="journal-district-heading"><span>{district.order}</span><div><h3>{district.label}</h3><p>{district.name}</p></div>{progress.districts.includes(district.id) && <Check size={15} />}</div><div className="journal-stations">{STATIONS.filter(item => item.districtId === district.id).map(item => <button key={item.id} onClick={() => openNotes(item.id)} disabled={!progress.stations.includes(item.id)}><span>{item.name}</span>{progress.stations.includes(item.id) ? <ChevronRight size={14} /> : <small>Undiscovered</small>}</button>)}</div></section>)}</div></div></Dialog>}

    {modal === 'architecture' && <Dialog title="One lifecycle. Six connected perspectives." eyebrow="THE DEVOPS WORLD / ARCHITECTURE" onClose={closeModal} wide className="architecture-dialog"><p className="dialog-intro">A map of the journey from a small code change to a dependable running system. Security, observability, and recovery matter throughout that journey.</p><div className="architecture-summary"><span><Check size={14} /><strong>Available now</strong>{STATIONS.length} educational discovery stops</span><span><Layers3 size={14} /><strong>Future phases</strong>Hands-on scenarios & simulation</span></div><div className="architecture-grid">{DISTRICTS.map(district => { const Icon = districtIcons[district.id] ?? Compass; return <article key={district.id} style={{ '--place-color': district.color } as CSSProperties}><div className="architecture-card-top"><Icon size={22} /><span>0{district.order}</span></div><h3>{district.name}</h3><p>{STATIONS.filter(item => item.districtId === district.id).map(item => item.name).join(' · ')}</p><div className="architecture-status"><span>Discovery ready</span><small>Simulation planned</small></div></article> })}</div><div className="architecture-bottom"><p>These introductions explain the concepts. They do not provision infrastructure or connect to GitHub, Kubernetes, or cloud accounts.</p><button className="primary-button" onClick={() => start('adventure')}>Explore the connections<ArrowRight size={16} /></button></div></Dialog>}
  </div>
}
