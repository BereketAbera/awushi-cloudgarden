import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { Activity, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Box, Check, ChevronRight, CircleHelp, Code2, Compass, Droplets, Expand, Eye, Footprints, Hand, Layers3, MoveUpRight, Pause, Play, RotateCcw, Sparkles, X, Zap } from 'lucide-react'
import type { AssetInfo, Clip, Mode, View } from './Scene'
import { WORLD_ASSETS_READY, WORLD_ZONES, type ZoneId } from './worldConfig'

const Scene = lazy(() => import('./Scene'))

const animations: { clip: Clip; name: string; icon: typeof Activity; hint: string }[] = [
  { clip: 'Idle', name: 'Just being', icon: Droplets, hint: 'Breathe, blink & wobble' },
  { clip: 'Walk', name: 'Little steps', icon: Footprints, hint: 'A gentle, bouncy walk' },
  { clip: 'Run', name: 'On a mission', icon: Zap, hint: 'A playful little sprint' },
  { clip: 'Interact', name: 'Oh, hello!', icon: Hand, hint: 'Curiosity in motion' },
  { clip: 'Celebrate', name: 'We did it!', icon: Sparkles, hint: 'A happy splash of joy' },
]
const views: { id: View; label: string }[] = [{ id: 'three-quarter', label: '¾' }, { id: 'front', label: 'Front' }, { id: 'side', label: 'Side' }, { id: 'back', label: 'Back' }]
const movementKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight', 'ShiftLeft', 'ShiftRight'])

function BrandMark() {
  return <svg className="brand-mark" viewBox="0 0 44 48" fill="none" aria-hidden="true"><path d="M7 23C8 12 15 5 24 4C31 3 30 10 27 12C23 16 30 17 32 13C35 8 43 13 38 22C45 31 37 43 22 43C7 43 1 32 7 23Z" fill="currentColor" /><ellipse cx="16" cy="28" rx="3.3" ry="4.5" fill="#0a1720" /><ellipse cx="29" cy="28" rx="3.3" ry="4.5" fill="#0a1720" /><path d="M21 35Q23 37 25 35" stroke="#0a1720" strokeWidth="1.8" strokeLinecap="round" /></svg>
}

export default function App() {
  const [clip, setClip] = useState<Clip>('Idle')
  const [playing, setPlaying] = useState(() => !window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [speed, setSpeed] = useState(1)
  const [mode, setMode] = useState<Mode>('studio')
  const [view, setView] = useState<View>('three-quarter')
  const [reset, setReset] = useState(0)
  const [info, setInfo] = useState<AssetInfo | null>(null)
  const [help, setHelp] = useState(false)
  const [details, setDetails] = useState(false)
  const [nearby, setNearby] = useState<ZoneId | null>(null)
  const [selectedZone, setSelectedZone] = useState<ZoneId | null>(null)
  const [visited, setVisited] = useState<Set<ZoneId>>(() => new Set())
  const input = useRef(new Set<string>())
  const container = useRef<HTMLDivElement>(null)
  const helpDialog = useRef<HTMLElement>(null)
  const onReady = useCallback((value: AssetInfo) => setInfo(value), [])
  const onClip = useCallback((value: Clip) => setClip(value), [])
  const onNearby = useCallback((value: ZoneId | null) => setNearby(value), [])
  const interact = useCallback(() => {
    setPlaying(true); setClip('Interact')
    if (mode === 'world' && nearby) {
      setSelectedZone(nearby)
      setVisited((previous) => new Set(previous).add(nearby))
      setDetails(false)
    }
  }, [mode, nearby])
  const chooseClip = (value: Clip) => { if (value === 'Interact') interact(); else { setClip(value); setPlaying(true) } }

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (help) {
        if (event.code === 'Escape') setHelp(false)
        if (event.code === 'Tab') {
          const buttons = helpDialog.current?.querySelectorAll<HTMLButtonElement>('button')
          const first = buttons?.[0], last = buttons?.[buttons.length - 1]
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
        }
        return
      }
      if (event.target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) return
      if (movementKeys.has(event.code)) { event.preventDefault(); input.current.add(event.code) }
      if (event.repeat) return
      if (event.code === 'Space' && !(event.target instanceof HTMLButtonElement)) { event.preventDefault(); setPlaying(true); setClip('Celebrate') }
      if (event.code === 'KeyE') interact()
      if (event.code === 'KeyR') { setReset((value) => value + 1); setClip('Idle') }
      if (event.code === 'Escape') { setHelp(false); setDetails(false); setSelectedZone(null) }
    }
    const up = (event: KeyboardEvent) => input.current.delete(event.code)
    const blur = () => input.current.clear()
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', blur)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur) }
  }, [help, interact])

  useEffect(() => { if (help) input.current.clear() }, [help])

  const resetCharacter = () => { input.current.clear(); setReset((value) => value + 1); setClip('Idle'); setPlaying(true) }
  const selectView = (value: View) => { setView(value); resetCharacter() }
  const selectMode = (value: Mode) => { setMode(value); setSelectedZone(null); resetCharacter() }
  const fullscreen = () => { if (document.fullscreenElement) void document.exitFullscreen().catch(() => {}); else void container.current?.requestFullscreen().catch(() => {}) }
  const current = animations.find((animation) => animation.clip === clip)!
  const station = WORLD_ZONES.find((zone) => zone.id === selectedZone)
  const nearStation = WORLD_ZONES.find((zone) => zone.id === nearby)

  return <div className="app" ref={container}>
    <header className="topbar">
      <a className="brand" href="#" aria-label="Awushi home" onClick={(event) => { event.preventDefault(); selectMode('studio') }}><BrandMark /><span><strong>awushi<span className="brand-dot">.</span></strong><small>DEVOPS WORLD</small></span></a>
      <nav className="main-nav" aria-label="Workspace">
        <button className={mode === 'world' ? 'active' : ''} onClick={() => selectMode('world')}><Compass size={15} />{WORLD_ASSETS_READY ? 'Explore the world' : 'Playground'}</button>
        <button className={mode === 'studio' ? 'active' : ''} onClick={() => selectMode('studio')}><Box size={15} />Character lab</button>
      </nav>
      <div className="topbar-end"><span className="local-badge"><i />Local world</span><button className="icon-button" aria-label="Open controls and help" onClick={() => setHelp(true)}><CircleHelp size={19} /></button></div>
    </header>

    <main className={`workspace ${mode === 'world' && WORLD_ASSETS_READY ? 'world-workspace' : ''}`}>
      <div className="viewport" aria-label="Interactive 3D Awushi character"><Suspense fallback={<div className="canvas-loading"><span className="loader-orbit" /><span>Opening your little world…</span></div>}><Scene clip={clip} playing={playing} speed={speed} mode={mode} view={view} reset={reset} input={input} onClip={onClip} onReady={onReady} onNearby={onNearby} /></Suspense></div>
      <div className="scene-grain" aria-hidden="true" />

      <section className="intro-panel">
        <div className="eyebrow"><span className="tiny-spark">✦</span>{mode === 'studio' ? 'MEET YOUR COMPANION' : 'A LITTLE CURIOSITY GOES A LONG WAY'}</div>
        <h1>{mode === 'studio' ? <>Small splash.<br /><em>Big personality.</em></> : <>Hello, world.<br /><em>Let’s explore.</em></>}</h1>
        <p>{mode === 'studio' ? 'A curious little drop of possibility. Made of jelly, a little sunshine, and a lot of wonder.' : (WORLD_ASSETS_READY ? 'Follow your curiosity. Walk up to a workshop and press E to discover how this little world works.' : 'Every great adventure starts with a small step. Take Awushi for a wander and make a little splash.')}</p>
        <div className="character-tag"><span className="status-dot" />AWUSHI<span className="tag-divider" />{info ? 'Ready to play' : 'Getting ready'}</div>
        {mode === 'world' && WORLD_ASSETS_READY ? <div className="world-guide"><div className="world-guide-heading"><span>PLACES TO DISCOVER</span><span>{visited.size} / 3</span></div>{WORLD_ZONES.map((zone, index) => <button key={zone.id} className={nearby === zone.id ? 'nearby' : ''} onClick={() => { setSelectedZone(zone.id); setDetails(false) }}><span className="zone-index">{visited.has(zone.id) ? <Check size={12} /> : `0${index + 1}`}</span><span>{zone.name}</span><ChevronRight size={12} /></button>)}</div> : <>
        <div className="personality-card"><div className="card-symbol"><Sparkles size={19} /></div><div><span>A small dose of happy</span><p>Try a celebration. You’ve earned it.</p></div><button onClick={() => chooseClip('Celebrate')} title="Celebrate" aria-label="Play celebration"><MoveUpRight size={17} /></button></div>        </>}

      </section>

      <div className="view-tools">
        <div className="view-caption"><Eye size={13} /><span>TAKE A LOOK AROUND</span></div>
        <div className="view-picker" aria-label="Camera angle">{views.map((item) => <button key={item.id} onClick={() => selectView(item.id)} className={view === item.id ? 'active' : ''} aria-pressed={view === item.id} title={`${item.label} view`}>{item.label}</button>)}</div>
        <div className="utility-tools"><button className="icon-button" onClick={resetCharacter} aria-label="Reset character and camera" title="Reset · R"><RotateCcw size={16} /></button><button className="icon-button" onClick={fullscreen} aria-label="Toggle fullscreen" title="Fullscreen"><Expand size={16} /></button></div>
      </div>

      <div className="orbit-hint"><span className="mouse-icon" /><span>Drag to orbit<span className="hint-dot">·</span>Scroll to get closer</span></div>
      <div className="scene-label"><span className="scene-label-index">01</span><span>AWUSHI<br /><small>{mode === 'studio' ? 'CHARACTER STUDIO' : 'EXPLORATION MODE'}</small></span></div>
      <div className="live-caption"><span className="status-dot" /><span>{playing ? current.hint : 'A moment of stillness'}</span></div>
      <button className={`asset-button ${details ? 'active' : ''}`} onClick={() => { setDetails(!details); setSelectedZone(null) }} aria-expanded={details}><Layers3 size={16} /><span>Under the surface</span><ChevronRight size={15} /></button>

      {mode === 'world' && WORLD_ASSETS_READY && <>
        <button className={`proximity-prompt ${nearStation ? 'available' : ''}`} onClick={interact}><kbd>E</kbd><span>{nearStation ? `Discover the ${nearStation.name}` : 'Walk up to a workshop to explore'}</span>{nearStation && <ArrowRight size={14} />}</button>
        <div className="touch-controls" aria-label="Movement controls">{[{ key: 'KeyW', label: 'Move forward', Icon: ArrowUp }, { key: 'KeyA', label: 'Move left', Icon: ArrowLeft }, { key: 'KeyS', label: 'Move backward', Icon: ArrowDown }, { key: 'KeyD', label: 'Move right', Icon: ArrowRight }].map(({ key, label, Icon }) => <button key={key} aria-label={label} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); input.current.add(key); setPlaying(true) }} onPointerUp={() => input.current.delete(key)} onPointerCancel={() => input.current.delete(key)} onLostPointerCapture={() => input.current.delete(key)}><Icon size={17} /></button>)}</div>
      </>}
      {station && mode === 'world' && <aside className="zone-panel"><div className="panel-heading"><span>FIELD NOTES / {station.id.toUpperCase()}</span><button className="icon-button" onClick={() => setSelectedZone(null)} aria-label="Close field notes"><X size={16} /></button></div><h2>{station.name}</h2><p className="zone-subtitle">{station.subtitle}</p><p>{station.description}</p><ol>{station.steps.map((step) => <li key={step.label}><strong>{step.label}</strong><span>{step.detail}</span></li>)}</ol><div className="local-note">{visited.has(station.id) ? <><Check size={14} />Discovered with Awushi</> : <><Footprints size={14} />Walk closer, then press E to discover.</>}</div></aside>}

      {details && <aside className="details-panel"><div className="panel-heading"><span>CRAFTED LOCALLY</span><button className="icon-button" onClick={() => setDetails(false)} aria-label="Close asset details"><X size={16} /></button></div><h2>A little digital life.</h2><p>Organic geometry, amber eyes, and a translucent cyan shell. Every shape begins with a reproducible Blender script.</p><dl><div><dt>Source</dt><dd>Procedural Blender</dd></div><div><dt>Format</dt><dd>Animated GLB</dd></div><div><dt>Animations</dt><dd>{info?.clips.length ?? '…'} reusable clips</dd></div><div><dt>Triangles</dt><dd>{info ? info.triangles.toLocaleString() : '…'}</dd></div><div><dt>Runtime</dt><dd>React Three Fiber</dd></div></dl><div className="local-note"><Check size={14} />No cloud services. All yours.</div></aside>}

      <section className="animation-dock" aria-label="Character animations">
        <div className="dock-heading"><span>BRING AWUSHI TO LIFE</span><div className="playback"><button className="playback-toggle" onClick={() => setPlaying(!playing)} aria-label={playing ? 'Pause animation' : 'Play animation'}>{playing ? <Pause size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}</button><select value={speed} onChange={(event) => setSpeed(Number(event.target.value))} aria-label="Animation speed"><option value={0.5}>0.5×</option><option value={1}>1× speed</option><option value={1.5}>1.5×</option></select></div></div>
        <div className="animation-options">{animations.map((animation, index) => <button key={animation.clip} data-testid={`animation-${animation.clip.toLowerCase()}`} className={`animation-option ${clip === animation.clip ? 'selected' : ''}`} aria-pressed={clip === animation.clip} onClick={() => chooseClip(animation.clip)} title={animation.hint}><span className="animation-number">0{index + 1}</span><animation.icon className="animation-icon" size={23} strokeWidth={1.5} /><span className="animation-name">{animation.name}<small>{animation.clip === 'Interact' ? 'Interaction' : animation.clip === 'Celebrate' ? 'Celebration' : animation.clip}</small></span><span className="animation-active-dot" /></button>)}</div>
      </section>
    </main>

    <footer className="footer"><span className="footer-note"><Code2 size={14} />A tiny world, made from scratch.</span><div className="keyboard-legend"><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> Move</span><span><kbd>shift</kbd> Run</span><span><kbd>E</kbd> Say hello</span><span><kbd>space</kbd> Celebrate</span></div><span className="version">LOCAL / 001</span></footer>

    {help && <div className="modal-backdrop" onClick={() => setHelp(false)}><section ref={helpDialog} className="help-dialog" role="dialog" aria-modal="true" aria-labelledby="help-title" onClick={(event) => event.stopPropagation()}><button className="icon-button modal-close" onClick={() => setHelp(false)} aria-label="Close help" autoFocus><X size={20} /></button><div className="help-symbol"><Compass size={28} /></div><div className="eyebrow">MAKE YOURSELF AT HOME</div><h2 id="help-title">A little guide to your guide.</h2><p>Awushi is happiest when you’re curious. Explore every angle, try a few moves, and celebrate the small wins.</p><div className="help-controls"><div><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><span className="or">or</span><ArrowUp size={14} /><ArrowLeft size={14} /><ArrowDown size={14} /><ArrowRight size={14} /></span><strong>Move around</strong></div><div><span><kbd>shift</kbd> + movement</span><strong>Run</strong></div><div><kbd>E</kbd><strong>Say hello</strong></div><div><kbd>space</kbd><strong>Celebrate</strong></div><div><kbd>R</kbd><strong>Back to the center</strong></div><div><span>Drag / scroll</span><strong>Orbit / zoom</strong></div></div><button className="primary-button" onClick={() => setHelp(false)}>Let’s make a splash<ArrowRight size={16} /></button></section></div>}
  </div>
}
