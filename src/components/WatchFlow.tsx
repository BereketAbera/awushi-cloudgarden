import { ChevronLeft, ChevronRight, Eye, Hand, Pause, Play, RotateCcw, SkipForward, X } from 'lucide-react'
import type { CameraOwnership } from '../game/cinematic'
import type { PlaybackPolicy } from '../cinematic/playback'
import { stageNarrative } from '../cinematic/playback'
import type { SimulationState } from '../simulation/domain'
import { getStation } from '../worldConfig'

type Props = {
  state: SimulationState; completed?: boolean; title: string; fallback?: { title: string; description: string; stationId: string }
  policy: PlaybackPolicy; paused: boolean; waiting?: boolean; stepHeld: boolean; ownership: CameraOwnership
  reviewing: boolean; recordedJourney: boolean; reviewIndex: number; frameCount: number; automaticCamera: boolean
  onPause: () => void; onResume: () => void; onMode: (value: PlaybackPolicy['mode']) => void; onSpeed: (value: PlaybackPolicy['speed']) => void
  onPrevious: () => void; onNext: () => void; onReplay: () => void; onLive: () => void; onExit: () => void
  onOverride: () => void; onFollow: () => void; onReturn: () => void; onSkip: () => void; onNotes: () => void
}
export function WatchFlow(p: Props) {
  const n = stageNarrative(p.state, p.fallback)
  const gate = p.state.status === 'waiting-approval' || p.state.status === 'failed'
  const status = { active: '● Processing', waiting: 'Ⅱ Review needed', failed: '! Needs attention', healthy: '✓ Healthy', neutral: '○ Ready to investigate' }[n.status]
  return <section className={`watch-flow status-${n.status}`} onKeyDown={event => event.stopPropagation()} onKeyUp={event => event.stopPropagation()} aria-label="Watch Flow playback" data-testid="watch-flow" data-stage={p.state.stageId ?? ''} data-station={n.stationId} data-owner={p.ownership}>
    <header><div><span className="eyebrow">{p.reviewing ? 'RECORDED STAGE / READ ONLY' : p.recordedJourney ? 'RECORDED JOURNEY / READ ONLY' : 'WATCH FLOW'} · {p.title}</span><h2 data-testid="flow-title">{n.title}</h2></div><button className="icon-button" onClick={p.onExit} aria-label="Exit Watch Flow" data-testid="flow-exit"><X size={19} /></button></header>
    <div className="flow-caption" role="status" aria-live="polite" aria-atomic="true"><span className="flow-status">{status}</span><strong>{getStation(n.stationId)?.name}</strong><span>{n.number ? `Stage ${n.number} of ${n.total}` : p.reviewing || p.recordedJourney ? 'Recorded observation' : p.completed ? 'Verified outcome' : 'Your next objective'}</span></div>
    <div className="flow-content"><p className="flow-explanation" data-testid="flow-explanation">{n.explanation}</p>
    {n.from && n.to && <div className="flow-route" data-testid="flow-route"><span>{getStation(n.from)?.name}</span><span aria-hidden="true">→</span><span>{getStation(n.to)?.name}</span><small>Arrival updates the destination when the simulation event completes.</small></div>}
    <div className="flow-next"><span>{p.reviewing ? 'Reviewing recorded evidence. Live progress is paused and unchanged.' : p.recordedJourney ? 'Replaying recorded decisions. Your saved progress is unchanged.' : p.completed ? 'Your result is verified. Review the learning summary or replay a recorded stage.' : n.next}</span>{(gate || !n.number) && <button className="primary-button" onClick={p.onNotes} data-testid="flow-open-notes">{p.completed ? 'Review summary' : gate ? 'Inspect & decide' : 'Open investigation'}<ChevronRight size={14} /></button>}</div>
    <details className="flow-options"><summary>Playback & camera options</summary><div className="flow-option-grid">
      <label>Playback<select disabled={p.recordedJourney} value={p.recordedJourney ? 'automatic' : p.policy.mode} onChange={e => p.onMode(e.target.value as PlaybackPolicy['mode'])} data-testid="flow-mode"><option value="automatic">Automatic</option><option value="step">Step by step</option></select></label>
      <label>Speed<select value={p.policy.speed} onChange={e => p.onSpeed(Number(e.target.value) as PlaybackPolicy['speed'])} data-testid="flow-speed"><option value="0.5">0.5×</option><option value="1">1×</option><option value="2">2×</option></select></label>
      <button className="text-button" onClick={p.onSkip} data-testid="flow-skip"><SkipForward size={14} />Skip transition</button>
      <button className="text-button" onClick={p.onOverride} data-testid="flow-override"><Hand size={14} />Control camera</button>
      <button className="text-button" onClick={p.onFollow} data-testid="flow-follow" disabled={!p.automaticCamera}><Eye size={14} />Follow stations</button>
      <button className="text-button" onClick={p.onReturn} data-testid="flow-return">Return to Awushi</button>
    </div><p>{p.automaticCamera ? 'Drag the world or scroll to take control. Following resumes only when you choose it.' : 'Automatic camera movement is off. Guide Me remains available when you choose a focus.'}</p><p><strong>Responsible technologies:</strong> {n.technology}</p></details>
    </div>
    <div className="flow-primary-controls">
      <button className="secondary-button" onClick={p.paused ? p.onResume : p.onPause} data-testid="flow-pause">{p.paused ? <Play size={14} /> : <Pause size={14} />}{p.paused ? 'Resume' : 'Pause'}</button>
      <button className="secondary-button" onClick={p.onReplay} disabled={!p.frameCount} data-testid="flow-replay"><RotateCcw size={14} />Replay stage</button>
      <button className="icon-button" onClick={p.onPrevious} disabled={p.reviewing ? p.reviewIndex <= 0 : p.frameCount < 2} aria-label="Previous recorded stage" data-testid="flow-previous"><ChevronLeft size={17} /></button>
      <button className="secondary-button" onClick={p.onNext} disabled={p.reviewing ? p.reviewIndex >= p.frameCount - 1 : p.recordedJourney || gate || (p.state.status === 'idle' && !p.waiting) || (p.state.status === 'succeeded' && !p.waiting) || p.policy.mode !== 'step' || !p.stepHeld} data-testid="flow-next">{p.reviewing ? 'Next recorded' : 'Advance stage'}<ChevronRight size={14} /></button>
      {p.reviewing && <button className="primary-button" onClick={p.onLive} data-testid="flow-live">{p.recordedJourney ? 'Return to journey' : 'Return to live'}</button>}
    </div>
  </section>
}
