import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { ArrowRight, BookOpen, Check, CheckCircle2, ChevronRight, Clock3, Compass, Database, Flag, GitPullRequest, Lightbulb, MapPin, Pause, Play, RotateCcw, Search, ShieldCheck, Sparkles, TriangleAlert, Workflow, X } from 'lucide-react'
import { ADVENTURES, adventureDefinition } from '../adventures/catalog'
import { getAdventureView } from '../adventures/selectors'
import { evidenceExplanation, formatEvidenceTime, getMissionGuidance, GUIDANCE_MODES, type GuidanceMode } from '../adventures/guidance'
import type { AdventureAction, AdventureCommand, AdventureId, AdventureSession, AdventureVariant, CompletionSummary, Evidence } from '../adventures/domain'
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

type GuidanceProps = { guidanceMode?: GuidanceMode; onGuidanceMode?: (mode: GuidanceMode) => void; onGuide?: (stationId: string) => void }
type HUDProps = GuidanceProps & { session: AdventureSession; onOpen: () => void; onLocate: (stationId: string) => void; onSelect: () => void; paused?: boolean; replaying?: boolean }
export function MissionHUD({ session, onOpen, onLocate, onSelect, onGuide, guidanceMode = 'guided', paused = false, replaying = false }: HUDProps) {
  const view = getAdventureView(session), definition = adventureDefinition(session.id)!, guidance = getMissionGuidance(session, guidanceMode)
  return <section className="mission-hud" aria-label="Current adventure" data-testid="mission-hud">
    <button className="mission-hud-heading" onClick={onOpen} data-testid="open-mission"><span className="mission-hud-icon">{session.status === 'completed' ? <CheckCircle2 size={18} /> : <Flag size={18} />}</span><span><small>{replaying ? 'RECORDED JOURNEY' : 'CURRENT OBJECTIVE'}</small><strong>{definition.title}</strong></span><ChevronRight size={16} /></button>
    <div className="mission-hud-body"><span className="mission-hud-status">{replaying ? 'Watching a recorded journey' : labelStatus(session, paused)}</span><button className="mission-hud-objective" onClick={onOpen} data-testid="current-objective">{view.objective?.title ?? (session.status === 'completed' ? 'A little wiser. A world still to explore.' : 'This journey is safely stopped.')}</button><div className="mission-progress-row"><progress value={view.progress.completed} max={view.progress.total} aria-label="Adventure objectives completed" /><span>{view.progress.completed}/{view.progress.total}</span></div><div className="mission-hud-actions">{guidance.target && <button className="hud-guide-action" data-testid="hud-guide-me" onClick={() => (onGuide ?? onLocate)(guidance.target!.stationId)}><Compass size={14} />Guide Me</button>}<button onClick={onOpen}><Search size={13} />Open tools</button><button onClick={onSelect} aria-label="Choose another adventure"><BookOpen size={13} /></button></div></div>
  </section>
}

function LearningSummary({ summary, hintsUsed }: { summary: CompletionSummary; hintsUsed: number }) {
  return <section className="learning-summary" data-testid="learning-summary"><div className="completion-mark"><Sparkles size={25} /></div><div className="eyebrow">A LITTLE WISER THAN BEFORE</div><h3>{summary.title}</h3><p>{summary.whatHappened}</p><p className="learning-assistance">{hintsUsed} {hintsUsed === 1 ? 'hint' : 'hints'} requested. Learning with assistance counts just as much.</p>{summary.rootCause && <div className="summary-root-cause"><strong>What was really happening</strong><p>{summary.rootCause}</p></div>}<div className="summary-solution"><strong>Why it worked</strong><p>{summary.whyItWorked}</p></div><div className="summary-technologies">{summary.technologies.map(technology => <span key={technology}>{technology}</span>)}</div><details className="mission-details"><summary>The engineering lesson</summary><p>{summary.technicalDetails}</p><h4>Common misconceptions</h4><ul>{summary.misconceptions.map(item => <li key={item}>{item}</li>)}</ul></details></section>
}

function EvidenceCard({ evidence, session, expanded = false, explain = true }: { evidence: Evidence; session: AdventureSession; expanded?: boolean; explain?: boolean }) {
  const [termsOpen, setTermsOpen] = useState(false)
  const [allFields, setAllFields] = useState(false)
  const focusedFields = new Set([0, 1, 2, evidence.fields.findIndex(field => field.tone === 'bad' || field.tone === 'warning')])
  const compact = expanded && explain && evidence.fields.length > 4
  const terms = evidence.fields.flatMap(field => { const explanation = evidenceExplanation(field.label); return explanation ? [{ label: field.label, explanation }] : [] })
  return <details className="evidence-card" open={expanded || undefined}><summary><span>{evidence.title}<small>{getStation(evidence.stationId)?.name} · {formatEvidenceTime(evidence.timestamp, session.startedAt)}</small></span><Check size={13} /></summary><dl>{evidence.fields.map((field, index) => <div className={`tone-${field.tone ?? 'neutral'}`} hidden={compact && !allFields && !focusedFields.has(index)} key={`${field.label}-${index}`}><dt>{field.label}</dt><dd>{field.value}</dd></div>)}</dl>{compact && <button className="text-button evidence-expand" aria-expanded={allFields} onClick={() => setAllFields(value => !value)}>{allFields ? 'Show key observations' : `Show all ${evidence.fields.length} observed fields`}</button>}{explain && terms.length > 0 && <div className="evidence-concepts"><button className="text-button" aria-expanded={termsOpen} onClick={() => setTermsOpen(value => !value)}><BookOpen size={12} />{termsOpen ? 'Hide term explanations' : 'Explain these terms'}</button>{termsOpen && terms.map(term => <p key={term.label}><strong>{term.label}</strong> {term.explanation}</p>)}</div>}</details>
}

function MissionActionButton({ action, onAction, paused, readOnly, suggested = false }: { action: AdventureAction; onAction: (id: string) => void; paused: boolean; readOnly: boolean; suggested?: boolean }) {
  const reason = readOnly ? 'Recorded journeys are read-only.' : paused ? 'Resume the adventure to use this tool.' : !action.enabled ? action.reason : null
  return <div className={`mission-action-row action-${action.kind} ${suggested ? 'suggested-tool' : ''}`}><button className="mission-action" data-testid={`adventure-action-${action.id}`} aria-describedby={reason ? `action-reason-${action.id}` : undefined} disabled={readOnly || paused || !action.enabled} onClick={() => onAction(action.id)}><span>{action.kind === 'inspect' ? <Search size={16} /> : action.kind === 'verify' ? <CheckCircle2 size={16} /> : action.kind === 'repair' ? <Workflow size={16} /> : <GitPullRequest size={16} />}</span><span><strong>{action.label}</strong><small>{action.description}</small></span><ArrowRight size={14} /></button>{reason && <p className="mission-action-reason" id={`action-reason-${action.id}`}>{reason}</p>}</div>
}

const hintLabels = ['Direction', 'Technology', 'Evidence', 'Suggested action']
type MissionProps = GuidanceProps & {
  session: AdventureSession; onCommand: (command: AdventureCommand) => void; onLocate: (stationId: string) => void
  onClose: () => void; onSelect: () => void; onRestart: () => void; onReplay?: () => void
  paused?: boolean; onPause?: () => void; onResume?: () => void; readOnly?: boolean; replayControls?: ReactNode
  onWatchFlow?: () => void; onExplore?: () => void
}
export function MissionPanel({ session, onCommand, onLocate, onClose, onSelect, onRestart, onReplay, paused = false, onPause, onResume, readOnly = false, replayControls, guidanceMode = 'guided', onGuidanceMode, onGuide, onWatchFlow, onExplore }: MissionProps) {
  const panel = useRef<HTMLElement>(null)
  const [checklistExpanded, setChecklistExpanded] = useState(false)
  const notebook = useRef<HTMLDivElement>(null)
  const actionsPanel = useRef<HTMLElement>(null)
  const closeRef = useRef(onClose)
  const view = getAdventureView(session), definition = adventureDefinition(session.id)!, guidance = getMissionGuidance(session, guidanceMode)
  const atBeginning = session.evidence.length === 0 && session.decisions.length === 0 && session.completedObjectives.length === 0
  const primaryAction = guidance.showPrompts && session.status === 'active' ? guidance.actions.find(action => action.id === guidance.target?.actionId) : undefined
  const remainingActions = guidance.actions.filter(action => action.id !== primaryAction?.id)
  const currentCheck = guidance.checklist.findIndex(item => item.current)
  const visibleChecklist = checklistExpanded ? guidance.checklist : guidance.checklist.slice(Math.max(0, currentCheck - 1), Math.max(2, currentCheck + 2))
  const actionGroups = [
    { key: 'inspect', title: 'Investigate', description: 'Read evidence before making a change.', actions: remainingActions.filter(action => action.kind === 'inspect') },
    { key: 'decide', title: 'Decide & act', description: 'Choose the action supported by your observations.', actions: remainingActions.filter(action => action.kind === 'repair' || action.kind === 'decision') },
    { key: 'verify', title: 'Verify the result', description: 'Check the system after your decision.', actions: remainingActions.filter(action => action.kind === 'verify') },
  ]
  const runAction = (actionId: string) => {
    onCommand({ type: 'action', actionId })
    notebook.current?.scrollTo({ top: 0, behavior: 'instant' })
  }
  useEffect(() => { closeRef.current = onClose }, [onClose])
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    panel.current?.focus()
    return () => { if (previous?.isConnected) previous.focus() }
  }, [])
  useEffect(() => { if (session.status !== 'active') panel.current?.focus({ preventScroll: true }) }, [session.status])
  return <aside ref={panel} className={`mission-workspace guidance-${guidanceMode} ${readOnly ? 'replay-workspace' : ''}`} aria-labelledby="mission-title" tabIndex={-1} data-testid="mission-panel" onKeyDown={event => { event.stopPropagation(); if (event.key === 'Escape') { event.preventDefault(); closeRef.current() } }}>
    <header className="mission-panel-header"><div><span className="eyebrow">{readOnly ? 'YOUR RECORDED JOURNEY' : 'MISSION / SIMULATED'}</span><h2 id="mission-title">{definition.title}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close mission workspace" data-testid="close-mission"><X size={19} /></button></header>
    {replayControls}
    <div ref={notebook} className="mission-panel-scroll">
      <div className="mission-state-line" role="status" aria-live="polite" aria-atomic="true"><span data-testid="mission-status">{labelStatus(session, paused)}</span><span>{view.progress.completed} of {view.progress.total} objectives</span></div>
      <progress className="mission-panel-progress" value={view.progress.completed} max={view.progress.total} aria-label="Completed mission objectives" />
      {session.status === 'completed' ? <LearningSummary summary={view.summary} hintsUsed={session.hintsUsed} /> : <>
        <section className="mission-current">{atBeginning && <p className="mission-opening-summary">{guidance.briefing.happened}</p>}<div className="eyebrow">YOUR NEXT STEP</div><h3 data-testid="mission-objective">{view.objective?.title ?? 'This journey has stopped.'}</h3><p>{view.objective?.description ?? 'Restart when you are ready. Your completed adventures remain in your notebook.'}</p>{primaryAction && <MissionActionButton action={primaryAction} onAction={runAction} paused={paused} readOnly={readOnly} suggested />}{!primaryAction && session.status === 'active' && <button className="secondary-button actions-jump" data-testid="review-actions" onClick={() => { actionsPanel.current?.scrollIntoView({ block: 'start', behavior: 'instant' }); actionsPanel.current?.focus({ preventScroll: true }) }}><Search size={14} />Review available actions<ArrowRight size={14} /></button>}{guidance.target && <div className="mission-guide-row"><button className="secondary-button" onClick={() => (onGuide ?? onLocate)(guidance.target!.stationId)} data-testid="guide-me"><Compass size={15} />Guide Me</button><button className="text-button" onClick={() => onLocate(guidance.target!.stationId)} data-testid="mission-locate"><MapPin size={13} />Find {getStation(guidance.target.stationId)?.name ?? 'this station'}</button></div>}{guidance.target && guidance.showPrompts && <p className="mission-guide-reason">{guidance.target.reason}</p>}</section>
        <div className={`mission-feedback tone-${session.feedback.tone}`} role="status" aria-live="polite" aria-atomic="true" data-testid="mission-feedback">{session.feedback.tone === 'bad' || session.feedback.tone === 'warning' ? <TriangleAlert size={17} /> : session.feedback.tone === 'good' ? <CheckCircle2 size={17} /> : <Compass size={17} />}<div><strong>{session.feedback.tone === 'good' ? 'What changed' : session.feedback.tone === 'bad' || session.feedback.tone === 'warning' ? 'What this tells us' : 'Situation update'}</strong><p>{session.feedback.message}</p></div></div>
        <details className="mission-briefing" data-testid="mission-briefing"><summary>Mission briefing</summary><p>{guidance.briefing.happened}</p><ul>{guidance.briefing.symptoms.map(symptom => <li key={symptom}>{symptom}</li>)}</ul><p><strong>Your goal</strong> {guidance.briefing.objective}</p><p><strong>Start here</strong> {getStation(guidance.briefing.firstStationId)?.name}</p><div className="briefing-tools"><span>Diagnostic tools</span>{guidance.briefing.tools.map(tool => <span key={tool}>{tool}</span>)}</div></details>
        {session.status === 'active' && !readOnly && (onWatchFlow || onExplore) && <div className="mission-view-choice" aria-label="How to experience this mission">{onWatchFlow && <button className="primary-button" onClick={onWatchFlow} data-testid="mission-watch-flow"><Play size={14} />Watch Flow{['ship-release', 'promote-production'].includes(session.id) && <small>Recommended</small>}</button>}{onExplore && <button className="text-button" onClick={onExplore} data-testid="mission-explore-manually"><Compass size={14} />Explore Manually</button>}</div>}
        {onGuidanceMode && <label className="guidance-select"><span>Guidance</span><select aria-label="Mission guidance" data-testid="mission-guidance-mode" value={guidanceMode} onChange={event => onGuidanceMode(event.target.value as GuidanceMode)}>{GUIDANCE_MODES.map(mode => <option value={mode.id} key={mode.id}>{mode.label}</option>)}</select></label>}
        {guidance.showChecklist && <section className="investigation-checklist" aria-label="Investigation checklist" data-testid="investigation-checklist"><div className="mission-section-heading"><h3>Your investigation</h3><small>{view.progress.completed}/{view.progress.total} verified · evidence, not visits.</small></div><ol>{visibleChecklist.map(item => <li key={item.id} data-testid={`checklist-${item.id}`} data-completed={item.completed} aria-current={item.current ? 'step' : undefined} className={`${item.completed ? 'done' : ''} ${item.current ? 'current' : ''}`}><span aria-hidden="true">{item.completed ? <Check size={12} /> : item.current ? <ArrowRight size={12} /> : <i />}</span><span>{item.title}</span><span className="sr-only">{item.completed ? 'Completed' : item.current ? 'Current step' : 'Not yet completed'}</span></li>)}</ol>{guidance.checklist.length > visibleChecklist.length || checklistExpanded ? <button className="text-button checklist-toggle" onClick={() => setChecklistExpanded(value => !value)} aria-expanded={checklistExpanded}>{checklistExpanded ? 'Show current steps' : `See all ${guidance.checklist.length} steps`}</button> : null}</section>}
        {view.waiting && session.status === 'active' && <p className="mission-automation"><span className="status-dot" />{paused ? 'Automation is paused with the adventure.' : 'Automation is working. Watch Flow follows the active stage; decisions still need you.'}</p>}
        {view.evidence.length > 0 && <section className="mission-latest-evidence" aria-label="Latest inspected evidence" data-testid="latest-evidence"><div className="mission-section-heading"><h3>What you know</h3><small>Latest observation · {formatEvidenceTime(view.evidence[view.evidence.length - 1].timestamp, session.startedAt)}</small></div><EvidenceCard evidence={view.evidence[view.evidence.length - 1]} session={session} expanded explain={guidanceMode !== 'commander'} /></section>}
        {session.status === 'active' && <section ref={actionsPanel} tabIndex={-1} className="mission-actions" aria-label="Available adventure actions">{actionGroups.filter(group => group.actions.length).map(group => <div className="mission-action-group" key={group.key}><div className="mission-section-heading"><h3>{group.title}</h3>{guidanceMode !== 'commander' && <small>{group.description}</small>}</div>{group.actions.map(action => <MissionActionButton key={action.id} action={action} onAction={runAction} paused={paused} readOnly={readOnly} />)}</div>)}<p className="mission-console-note">Use these tools from anywhere. Guide Me shows the responsible station without inspecting or changing it for you.</p></section>}
        {session.status === 'active' && <section className="mission-hints"><div><label><input type="checkbox" checked={session.hintsEnabled} disabled={readOnly} onChange={event => onCommand({ type: 'set-hints', enabled: event.target.checked })} data-testid="hints-enabled" /><Lightbulb size={16} /><strong>Hints, at your pace</strong></label><span>{session.hintLevel}/4</span></div>{session.hintsEnabled ? <><ol>{view.hints.map((hint, index) => <li key={`${view.objective?.id}-${index}`}><strong>{hintLabels[index]}</strong><span>{hint}</span></li>)}</ol><button className="text-button" data-testid="adventure-hint" onClick={() => onCommand({ type: 'hint' })} disabled={readOnly || session.hintLevel >= 4 || paused}><Lightbulb size={13} />{session.hintLevel >= 4 ? 'All hints revealed for this step' : `Show ${hintLabels[session.hintLevel].toLowerCase()} hint`}</button><small className="hint-reassurance">Assistance is part of learning. Your summary records hints without a penalty.</small></> : <p>Hints are off. Turn them back on whenever you want a nudge.</p>}</section>}
      </>}
      <section className="mission-evidence"><div className="mission-section-heading"><h3>Your evidence notebook</h3><small>{view.evidence.length} recorded observations</small></div>{view.evidence.length === 0 ? <p className="mission-empty">Inspect a system to record what it is doing. Opening a station alone does not complete an objective.</p> : <details className="mission-details" open={session.status === 'completed' || undefined}><summary>Review recorded evidence</summary><div className="evidence-history">{view.evidence.map(evidence => <EvidenceCard key={`${evidence.id}-${evidence.timestamp}`} evidence={evidence} session={session} explain={guidanceMode !== 'commander'} />)}</div></details>}</section>
      {!guidance.showChecklist && <details className="mission-details"><summary>Every step in this adventure</summary><ol className="mission-objectives">{view.objectives.map(objective => <li key={objective.id} className={objective.completed ? 'done' : view.objective?.id === objective.id ? 'current' : ''}><span>{objective.completed ? <Check size={12} /> : <i />}</span><div><strong>{objective.title}</strong><small>{getStation(objective.stationId)?.name}</small></div></li>)}</ol></details>}
      {session.decisions.length > 0 && <details className="mission-details" open={session.status === 'completed' || undefined}><summary>Your decisions · {session.decisions.length}</summary><ol className="mission-decisions">{session.decisions.map((decision, index) => <li key={`${decision.timestamp}-${index}`} className={decision.outcome}><span>{decision.outcome === 'accepted' ? <CheckCircle2 size={14} /> : <TriangleAlert size={14} />}</span><div><strong>{decision.label}</strong><small>{formatEvidenceTime(decision.timestamp, session.startedAt)}</small><p>{decision.message}</p></div></li>)}</ol></details>}
    </div>
    <footer className="mission-panel-footer">{readOnly ? <span>Replay is read-only. Your completed record is unchanged.</span> : session.status === 'active' ? <><button className="secondary-button" onClick={paused ? onResume : onPause} data-testid="adventure-pause">{paused ? <Play size={13} /> : <Pause size={13} />}{paused ? 'Resume' : 'Pause'}</button>{onWatchFlow && <button className="text-button" onClick={onWatchFlow}><Play size={13} />Watch Flow</button>}<details className="attempt-options"><summary>Attempt options</summary><button className="text-button" onClick={() => onCommand({ type: 'cancel' })} data-testid="adventure-cancel">End this attempt</button></details></> : <><button className="primary-button" onClick={onSelect} data-testid="choose-next-adventure">Choose a new adventure<ArrowRight size={14} /></button>{session.status === 'completed' && onReplay && <button className="text-button" onClick={onReplay} data-testid="replay-start"><Play size={13} />Replay journey</button>}<button className="text-button" onClick={onRestart} data-testid="adventure-restart"><RotateCcw size={13} />Try again</button></>}</footer>
  </aside>
}

type ReplayProps = { replay: ReplayView; onPause: () => void; onResume: () => void; onRestart: () => void; onStop: () => void; onSpeed: (speed: .5 | 1 | 2 | 4) => void }
export function ReplayControls({ replay, onPause, onResume, onRestart, onStop, onSpeed }: ReplayProps) {
  return <section className="replay-controls" aria-label="Journey replay" data-testid="replay-controls"><div><strong><Play size={13} />Recorded decisions, same consequences.</strong><span data-testid="replay-position">{elapsed(replay.positionMs)} / {elapsed(replay.durationMs)}</span></div><progress value={replay.positionMs} max={Math.max(1, replay.durationMs)} aria-label="Replay progress" /><div className="replay-buttons"><button className="secondary-button" onClick={replay.playing ? onPause : onResume} data-testid="replay-toggle">{replay.playing ? <Pause size={13} /> : <Play size={13} />}{replay.playing ? 'Pause' : 'Play'}</button><button className="icon-button" aria-label="Restart replay" onClick={onRestart} data-testid="replay-restart"><RotateCcw size={15} /></button><label>Speed<select value={replay.speed} onChange={event => onSpeed(Number(event.target.value) as .5 | 1 | 2 | 4)} data-testid="replay-speed" aria-label="Replay speed"><option value="0.5">0.5×</option><option value="1">1×</option><option value="2">2×</option><option value="4">4×</option></select></label><button className="text-button" onClick={onStop} data-testid="replay-stop">Leave replay</button></div></section>
}

export function SaveNoticeBanner({ notice, onExport, onReset, onRetry, onDismiss }: { notice: SaveNotice; onExport: () => void; onReset: () => void; onRetry?: () => void; onDismiss?: () => void }) {
  return <aside className={`save-notice notice-${notice.kind}`} role="status" aria-live="polite" data-testid="save-notice"><TriangleAlert size={18} /><div><strong>{notice.kind === 'migrated' ? 'Your notebook has been updated.' : 'Your local notebook needs attention.'}</strong><p>{notice.message}</p>{notice.recoverable && <div className="save-notice-actions"><button className="text-button" onClick={onExport} data-testid="save-export">Download recovery copy</button><button className="text-button" onClick={onReset} data-testid="save-reset">Start a fresh notebook</button>{onRetry && (notice.kind === 'quota' || notice.kind === 'unavailable') && <button className="text-button" onClick={onRetry} data-testid="save-retry">Try saving again</button>}</div>}</div>{!notice.recoverable && onDismiss && <button className="icon-button" onClick={onDismiss} aria-label="Dismiss save notice"><X size={15} /></button>}</aside>
}
