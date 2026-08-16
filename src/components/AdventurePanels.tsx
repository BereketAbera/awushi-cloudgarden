import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { ArrowRight, BookOpen, Check, CheckCircle2, ChevronRight, Clock3, Compass, Database, Flag, GitPullRequest, Lightbulb, MapPin, Pause, Play, RotateCcw, Search, ShieldCheck, Sparkles, TriangleAlert, Workflow, X } from 'lucide-react'
import { ADVENTURES, adventureDefinition } from '../adventures/catalog'
import { getAdventureView } from '../adventures/selectors'
import type { AdventureCommand, AdventureId, AdventureSession, AdventureVariant, CompletionSummary, Evidence } from '../adventures/domain'
import type { AdventureRecord, SaveNotice } from '../adventures/persistence'
import type { ReplayView } from '../adventures/replay'
import { getStation } from '../worldConfig'
import '../adventures/adventures.css'

const appearance = {
  'ship-release': { Icon: GitPullRequest, color: '#a8dfc8', word: 'DELIVERY' },
  'recover-pod': { Icon: ShieldCheck, color: '#b5d4f2', word: 'RECOVERY' },
  'fix-drift': { Icon: Workflow, color: '#d5bee9', word: 'RECONCILIATION' },
  'promote-production': { Icon: Flag, color: '#f0cc91', word: 'PROMOTION' },
  'investigate-incident': { Icon: Search, color: '#efa9aa', word: 'INVESTIGATION' },
  'restore-backup': { Icon: Database, color: '#add7d0', word: 'RESILIENCE' },
} satisfies Record<AdventureId, { Icon: typeof Compass; color: string; word: string }>
const elapsed = (ms: number) => { const seconds = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` }
const labelStatus = (session: AdventureSession, paused = false) => session.status === 'completed' ? 'Adventure complete' : session.status === 'cancelled' ? 'Adventure cancelled' : paused ? 'Paused · progress saved locally' : 'Adventure in progress'

type SelectionProps = {
  session: AdventureSession | null; completed: readonly AdventureRecord[]; resumable?: readonly AdventureRecord[]
  onStart: (id: AdventureId, variant?: AdventureVariant) => void; onResume: (id?: AdventureId) => void; onRestart: (id?: AdventureId, variant?: AdventureVariant) => void
  onReplay: (recordId: string) => void; onFreeExplore: () => void
}
export function AdventureSelection({ session, completed, resumable = [], onStart, onResume, onRestart, onReplay, onFreeExplore }: SelectionProps) {
  const [variants, setVariants] = useState<Partial<Record<AdventureId, AdventureVariant>>>({})
  const active = session?.status === 'active'
  return <div className="adventure-selection" data-testid="adventure-select">
    <div className="adventure-selection-intro"><p>Six little adventures. Real engineering decisions. Investigate the evidence, try an idea, and help Awushi find a way forward.</p><button className="text-button" onClick={onFreeExplore} data-testid="adventure-free-explore"><Compass size={15} />Just explore the world<ArrowRight size={13} /></button></div>
    <div className="adventure-order"><span><Sparkles size={14} />A suggested route, never a locked path.</span><small>Start anywhere. Every service and value is simulated locally.</small></div>
    {active && <div className="adventure-resume-banner"><span><span className="status-dot" /><strong>{adventureDefinition(session.id)!.title}</strong> is waiting for you.</span><button className="secondary-button" onClick={() => onResume()} data-testid="adventure-resume">Resume<Play size={13} /></button><small>Each adventure keeps its own checkpoint. Choose another path whenever curiosity calls.</small></div>}
    <div className="adventure-card-grid">{ADVENTURES.map((adventure, index) => {
      const { Icon, color, word } = appearance[adventure.id]
      const record = completed.find(item => item.adventureId === adventure.id)
      const saved = resumable.find(item => item.adventureId === adventure.id)
      const isCurrent = Boolean(saved) || (session?.id === adventure.id && session.status === 'active')
      const variant = variants[adventure.id] ?? saved?.variant ?? adventure.variants[0]?.id
      return <article className={`adventure-card ${record ? 'complete' : ''}`} key={adventure.id} style={{ '--adventure-color': color } as CSSProperties}>
        <div className="adventure-card-top"><span className="adventure-symbol"><Icon size={23} /></span><span className="adventure-card-number">0{index + 1}</span>{record && <span className="adventure-complete-badge"><Check size={12} />Completed</span>}</div>
        <div className="adventure-card-category">{word}</div><h3>{adventure.title}</h3><p>{adventure.description}</p>
        <div className="adventure-card-meta"><span>{adventure.difficulty}</span><span><Clock3 size={12} />About {adventure.estimatedMinutes} min</span></div>
        <details className="adventure-learn"><summary>What you’ll practice</summary><ul>{adventure.learningObjectives.map(objective => <li key={objective}>{objective}</li>)}</ul></details>
        {adventure.variants.length > 0 && <label className="adventure-variant">Learning variation<select value={variant} aria-label={`${adventure.title} variation`} data-testid={`adventure-variant-${adventure.id}`} onChange={event => setVariants(previous => ({ ...previous, [adventure.id]: event.target.value as AdventureVariant }))}>{adventure.variants.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select><small>{adventure.variants.find(item => item.id === variant)?.description}</small></label>}
        {saved?.variant && <small className="adventure-saved-checkpoint">Saved variation: {adventure.variants.find(item => item.id === saved.variant)?.label}. Restart to choose a different cause.</small>}
        <div className="adventure-card-actions">{isCurrent ? <><button className="primary-button" onClick={() => onResume(adventure.id)} data-testid={`adventure-resume-${adventure.id}`}>Resume<ArrowRight size={14} /></button><button className="text-button" onClick={() => onRestart(adventure.id, variant)} data-testid={`adventure-restart-${adventure.id}`}><RotateCcw size={13} />Restart</button></> : <button className="primary-button" onClick={() => onStart(adventure.id, variant)} data-testid={`adventure-start-${adventure.id}`}>{record ? 'Play again' : 'Start adventure'}<ArrowRight size={14} /></button>}
          {record && <button className="text-button" onClick={() => onReplay(record.id)} data-testid={`adventure-replay-${adventure.id}`}><Play size={13} />Replay</button>}</div>
        {record && <small className="adventure-last-result">Best completed journey · {record.result?.mistakes ?? 0} decisions reconsidered · {record.result?.hintsUsed ?? 0} hints</small>}
      </article>
    })}</div>
  </div>
}

type HUDProps = { session: AdventureSession; onOpen: () => void; onLocate: (stationId: string) => void; onSelect: () => void; paused?: boolean; replaying?: boolean }
export function MissionHUD({ session, onOpen, onLocate, onSelect, paused = false, replaying = false }: HUDProps) {
  const view = getAdventureView(session), definition = adventureDefinition(session.id)!
  return <section className="mission-hud" aria-label="Current adventure" data-testid="mission-hud">
    <button className="mission-hud-heading" onClick={onOpen} data-testid="open-mission"><span className="mission-hud-icon">{session.status === 'completed' ? <CheckCircle2 size={18} /> : <Flag size={18} />}</span><span><small>{replaying ? 'REPLAY / YOUR JOURNEY' : 'YOUR CURRENT ADVENTURE'}</small><strong>{definition.title}</strong></span><ChevronRight size={16} /></button>
    <div className="mission-hud-body"><span className="mission-hud-status">{replaying ? 'Watching a recorded journey' : labelStatus(session, paused)}</span><button className="mission-hud-objective" onClick={onOpen} data-testid="current-objective">{view.objective?.title ?? (session.status === 'completed' ? 'A little wiser. A world still to explore.' : 'This journey is safely stopped.')}</button><div className="mission-progress-row"><progress value={view.progress.completed} max={view.progress.total} aria-label="Adventure objectives completed" /><span>{view.progress.completed}/{view.progress.total}</span></div><div className="mission-hud-actions">{view.stationId && <button onClick={() => onLocate(view.stationId!)}><MapPin size={12} />{getStation(view.stationId)?.name ?? 'Find the next station'}</button>}<button onClick={onSelect} aria-label="Choose another adventure"><BookOpen size={13} /><span>Adventures</span></button></div></div>
  </section>
}

function LearningSummary({ summary }: { summary: CompletionSummary }) {
  return <section className="learning-summary" data-testid="learning-summary"><div className="completion-mark"><Sparkles size={25} /></div><div className="eyebrow">A LITTLE WISER THAN BEFORE</div><h3>{summary.title}</h3><p>{summary.whatHappened}</p>{summary.rootCause && <div className="summary-root-cause"><strong>What was really happening</strong><p>{summary.rootCause}</p></div>}<div className="summary-solution"><strong>Why it worked</strong><p>{summary.whyItWorked}</p></div><div className="summary-technologies">{summary.technologies.map(technology => <span key={technology}>{technology}</span>)}</div><details className="mission-details"><summary>The engineering lesson</summary><p>{summary.technicalDetails}</p><h4>Common misconceptions</h4><ul>{summary.misconceptions.map(item => <li key={item}>{item}</li>)}</ul></details></section>
}

function EvidenceCard({ evidence, session, expanded = false }: { evidence: Evidence; session: AdventureSession; expanded?: boolean }) {
  return <details className="evidence-card" open={expanded || undefined}><summary><span>{evidence.title}<small>{getStation(evidence.stationId)?.name} · T+{elapsed(evidence.timestamp - session.startedAt)}</small></span><Check size={13} /></summary><dl>{evidence.fields.map((field, index) => <div className={`tone-${field.tone ?? 'neutral'}`} key={`${field.label}-${index}`}><dt>{field.label}</dt><dd>{field.value}</dd></div>)}</dl></details>
}

type MissionProps = {
  session: AdventureSession; onCommand: (command: AdventureCommand) => void; onLocate: (stationId: string) => void
  onClose: () => void; onSelect: () => void; onRestart: () => void; onReplay?: () => void
  paused?: boolean; onPause?: () => void; onResume?: () => void; readOnly?: boolean; replayControls?: ReactNode
}
export function MissionPanel({ session, onCommand, onLocate, onClose, onSelect, onRestart, onReplay, paused = false, onPause, onResume, readOnly = false, replayControls }: MissionProps) {
  const panel = useRef<HTMLElement>(null)
  const notebook = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  const view = getAdventureView(session), definition = adventureDefinition(session.id)!
  const runAction = (actionId: string) => {
    onCommand({ type: 'action', actionId })
    // Keep the consequence and fresh evidence visible after a decision made below the fold.
    notebook.current?.scrollTo({ top: 0, behavior: 'instant' })
  }
  useEffect(() => { closeRef.current = onClose }, [onClose])
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    panel.current?.focus()
    return () => { if (previous?.isConnected) previous.focus() }
  }, [])
  useEffect(() => {
    if (session.status !== 'active') panel.current?.focus({ preventScroll: true })
  }, [session.status])
  return <aside ref={panel} className={`mission-workspace ${readOnly ? 'replay-workspace' : ''}`} aria-labelledby="mission-title" tabIndex={-1} data-testid="mission-panel" onKeyDown={event => { event.stopPropagation(); if (event.key === 'Escape') { event.preventDefault(); closeRef.current() } }}>
    <header className="mission-panel-header"><div><span className="eyebrow">{readOnly ? 'YOUR RECORDED JOURNEY' : 'FIELD NOTES / SIMULATED'}</span><h2 id="mission-title">{definition.title}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close mission workspace" data-testid="close-mission"><X size={19} /></button></header>
    {replayControls}
    <div ref={notebook} className="mission-panel-scroll">
      <div className="mission-state-line" role="status" aria-live="polite" aria-atomic="true"><span data-testid="mission-status">{labelStatus(session, paused)}</span><span>{view.progress.completed} of {view.progress.total} objectives</span></div>
      <progress className="mission-panel-progress" value={view.progress.completed} max={view.progress.total} aria-label="Completed mission objectives" />
      {session.status === 'completed' ? <LearningSummary summary={view.summary} /> : <>
        <section className="mission-current"><div className="eyebrow">NEXT LITTLE STEP</div><h3 data-testid="mission-objective">{view.objective?.title ?? 'This journey has stopped.'}</h3><p>{view.objective?.description ?? 'Restart when you are ready. Your completed adventures remain in your notebook.'}</p>{view.stationId && <button className="text-button" onClick={() => onLocate(view.stationId!)} data-testid="mission-locate"><MapPin size={13} />Find {getStation(view.stationId)?.name ?? 'this station'}<ArrowRight size={13} /></button>}</section>
        <div className={`mission-feedback tone-${session.feedback.tone}`} role="status" aria-live="polite" aria-atomic="true" data-testid="mission-feedback">{session.feedback.tone === 'bad' || session.feedback.tone === 'warning' ? <TriangleAlert size={17} /> : <Compass size={17} />}<p>{session.feedback.message}</p></div>
        {view.evidence.length > 0 && <section className="mission-latest-evidence" aria-label="Latest inspected evidence" data-testid="latest-evidence"><div className="mission-section-heading"><h3>Latest observation</h3><small>Recorded from the simulated infrastructure</small></div><EvidenceCard evidence={view.evidence[view.evidence.length - 1]} session={session} expanded /></section>}
        {view.waiting && session.status === 'active' && <p className="mission-automation"><span className="status-dot" />{paused ? 'Automation is paused with the adventure.' : 'Automation is working. You can keep exploring while it runs.'}</p>}
        {session.status === 'active' && <section className="mission-actions" aria-label="Available adventure actions"><div className="mission-section-heading"><h3>Investigate. Then decide.</h3><small>Read-only inspection and simulated actions</small></div>{view.actions.map(action => <div key={action.id} className={`mission-action-row action-${action.kind}`}><button className="mission-action" data-testid={`adventure-action-${action.id}`} disabled={readOnly || !action.enabled || paused} onClick={() => runAction(action.id)}><span>{action.kind === 'inspect' ? <Search size={16} /> : action.kind === 'verify' ? <CheckCircle2 size={16} /> : action.kind === 'repair' ? <Workflow size={16} /> : <GitPullRequest size={16} />}</span><span><strong>{action.label}</strong><small>{action.description}</small></span><ArrowRight size={14} /></button>{!action.enabled && action.reason && <p className="mission-action-reason">{action.reason}</p>}</div>)}<p className="mission-console-note">This field console can inspect remote stations. Opening it does not complete an objective; actions check the actual model.</p></section>}
        {session.status === 'active' && <section className="mission-hints"><div><label><input type="checkbox" checked={session.hintsEnabled} disabled={readOnly} onChange={event => onCommand({ type: 'set-hints', enabled: event.target.checked })} data-testid="hints-enabled" /><Lightbulb size={16} /><strong>Hints, at your pace</strong></label><span>{session.hintLevel}/4</span></div>{session.hintsEnabled ? <><ol>{view.hints.map((hint, index) => <li key={`${view.objective?.id}-${index}`}>{hint}</li>)}</ol><button className="text-button" data-testid="adventure-hint" onClick={() => onCommand({ type: 'hint' })} disabled={readOnly || session.hintLevel >= 4 || paused}><Lightbulb size={13} />{session.hintLevel === 0 ? 'A gentle nudge' : session.hintLevel >= 4 ? 'All hints revealed for this step' : 'Show the next hint'}</button></> : <p>Hints are off. Turn them back on whenever you want a nudge.</p>}</section>}
      </>}
      <section className="mission-evidence"><div className="mission-section-heading"><h3>Your evidence notebook</h3><small>{view.evidence.length} recorded observations</small></div>{view.evidence.length === 0 ? <p className="mission-empty">Your notebook is ready. Inspect a system to record what it is actually doing.</p> : <details className="mission-details" open={session.status === 'completed' || undefined}><summary>Review recorded evidence</summary><div className="evidence-history">{view.evidence.map(evidence => <EvidenceCard key={`${evidence.id}-${evidence.timestamp}`} evidence={evidence} session={session} />)}</div></details>}</section>
      <details className="mission-details"><summary>Every step in this adventure</summary><ol className="mission-objectives">{view.objectives.map(objective => <li key={objective.id} className={objective.completed ? 'done' : view.objective?.id === objective.id ? 'current' : ''}><span>{objective.completed ? <Check size={12} /> : <i />}</span><div><strong>{objective.title}</strong><small>{getStation(objective.stationId)?.name}</small></div></li>)}</ol></details>
      {session.decisions.length > 0 && <details className="mission-details" open={session.status === 'completed' || undefined}><summary>Your decisions · {session.decisions.length}</summary><ol className="mission-decisions">{session.decisions.map((decision, index) => <li key={`${decision.timestamp}-${index}`} className={decision.outcome}><span>{decision.outcome === 'accepted' ? <CheckCircle2 size={14} /> : <TriangleAlert size={14} />}</span><div><strong>{decision.label}</strong><small>T+{elapsed(decision.timestamp - session.startedAt)}</small><p>{decision.message}</p></div></li>)}</ol></details>}
    </div>
    <footer className="mission-panel-footer">{readOnly ? <span>Replay is read-only. Your completed record is unchanged.</span> : session.status === 'active' ? <><button className="secondary-button" onClick={paused ? onResume : onPause} data-testid="adventure-pause">{paused ? <Play size={13} /> : <Pause size={13} />}{paused ? 'Resume' : 'Pause'}</button><button className="text-button" onClick={() => onCommand({ type: 'cancel' })} data-testid="adventure-cancel">End this attempt</button></> : <><button className="primary-button" onClick={onSelect} data-testid="choose-next-adventure">Choose a new adventure<ArrowRight size={14} /></button>{session.status === 'completed' && onReplay && <button className="text-button" onClick={onReplay} data-testid="replay-start"><Play size={13} />Replay journey</button>}<button className="text-button" onClick={onRestart} data-testid="adventure-restart"><RotateCcw size={13} />Try again</button></>}</footer>
  </aside>
}

type ReplayProps = { replay: ReplayView; onPause: () => void; onResume: () => void; onRestart: () => void; onStop: () => void; onSpeed: (speed: .5 | 1 | 2 | 4) => void }
export function ReplayControls({ replay, onPause, onResume, onRestart, onStop, onSpeed }: ReplayProps) {
  return <section className="replay-controls" aria-label="Journey replay" data-testid="replay-controls"><div><strong><Play size={13} />Recorded decisions, same consequences.</strong><span data-testid="replay-position">{elapsed(replay.positionMs)} / {elapsed(replay.durationMs)}</span></div><progress value={replay.positionMs} max={Math.max(1, replay.durationMs)} aria-label="Replay progress" /><div className="replay-buttons"><button className="secondary-button" onClick={replay.playing ? onPause : onResume} data-testid="replay-toggle">{replay.playing ? <Pause size={13} /> : <Play size={13} />}{replay.playing ? 'Pause' : 'Play'}</button><button className="icon-button" aria-label="Restart replay" onClick={onRestart} data-testid="replay-restart"><RotateCcw size={15} /></button><label>Speed<select value={replay.speed} onChange={event => onSpeed(Number(event.target.value) as .5 | 1 | 2 | 4)} data-testid="replay-speed" aria-label="Replay speed"><option value="0.5">0.5×</option><option value="1">1×</option><option value="2">2×</option><option value="4">4×</option></select></label><button className="text-button" onClick={onStop} data-testid="replay-stop">Leave replay</button></div></section>
}

export function SaveNoticeBanner({ notice, onExport, onReset, onRetry, onDismiss }: { notice: SaveNotice; onExport: () => void; onReset: () => void; onRetry?: () => void; onDismiss?: () => void }) {
  return <aside className={`save-notice notice-${notice.kind}`} role="status" aria-live="polite" data-testid="save-notice"><TriangleAlert size={18} /><div><strong>{notice.kind === 'migrated' ? 'Your notebook has been updated.' : 'Your local notebook needs attention.'}</strong><p>{notice.message}</p>{notice.recoverable && <div className="save-notice-actions"><button className="text-button" onClick={onExport} data-testid="save-export">Download recovery copy</button><button className="text-button" onClick={onReset} data-testid="save-reset">Start a fresh notebook</button>{onRetry && (notice.kind === 'quota' || notice.kind === 'unavailable') && <button className="text-button" onClick={onRetry} data-testid="save-retry">Try saving again</button>}</div>}</div>{!notice.recoverable && onDismiss && <button className="icon-button" onClick={onDismiss} aria-label="Dismiss save notice"><X size={15} /></button>}</aside>
}
