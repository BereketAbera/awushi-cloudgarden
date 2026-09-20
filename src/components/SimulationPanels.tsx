import { ArrowRight, Check, ChevronRight, GitBranch, Play, RotateCcw, ShieldCheck, Square, X } from 'lucide-react'
import { DEPLOYMENT_STAGES } from '../simulation/scenario'
import type { EnvironmentId, SimulationCommand, SimulationState, ScenarioId } from '../simulation/domain'

type Props = { state: SimulationState; environment: EnvironmentId; onEnvironment: (value: EnvironmentId) => void; onCommand: (command: SimulationCommand) => void; onOpen: () => void; onLocate: (stationId: string) => void }
const statusLabels = { idle: 'Ready when you are', running: 'In progress', 'waiting-approval': 'Your approval is needed', succeeded: 'Deployment healthy', failed: 'A check needs attention', retrying: 'Applying the fix', cancelled: 'Run cancelled' }

export function SimulationDock({ state, environment, onEnvironment, onCommand, onOpen, onLocate }: Props) {
  const stage = DEPLOYMENT_STAGES[state.stageIndex]
  const busy = ['running', 'waiting-approval', 'retrying'].includes(state.status)
  return <section className={`simulation-dock status-${state.status}`} aria-label="Simulated deployment" data-testid="simulation-dock">
    <button className="simulation-dock-heading" onClick={onOpen} data-testid="open-simulation"><GitBranch size={15} /><span>DEPLOYMENT LAB<small>Simulated infrastructure</small></span><ChevronRight size={15} /></button>
    <div className="simulation-dock-content"><div className="simulation-context"><span className="simulation-status" data-testid="simulation-status">{statusLabels[state.status]}</span><select aria-label="Environment" data-testid="environment-select" value={environment} onChange={event => onEnvironment(event.target.value as EnvironmentId)}><option value="development">Development</option><option value="production">Production</option></select></div>
      {busy && environment !== state.environment && <small className="run-environment">Active run: {state.environment}</small>}
      <button className="current-stage" onClick={() => stage && onLocate(stage.stationId)} disabled={!stage || state.status === 'idle'} data-testid="simulation-stage">{state.status === 'idle' ? 'One change. Follow its whole journey.' : stage?.title ?? statusLabels[state.status]}{state.status !== 'idle' && <ArrowRight size={13} />}</button>
      <div className="simulation-meter" aria-label={`${state.completedStages.length} of ${DEPLOYMENT_STAGES.length} stages complete`}><i style={{ width: `${state.completedStages.length / DEPLOYMENT_STAGES.length * 100}%` }} /></div>
      {state.status === 'waiting-approval' ? <button className="approval-callout" onClick={onOpen}><ShieldCheck size={15} />Review the digest-bump pull request</button> : state.status === 'failed' ? <button className="approval-callout" onClick={onOpen}><X size={15} />Inspect the failure and apply a fix</button> : !busy ? <button className="simulation-push" data-testid="simulation-quick-start" onClick={() => onCommand({ type: 'start', environment, scenario: 'healthy' })}><Play size={12} fill="currentColor" />{state.status === 'idle' ? 'Push a code change' : 'Push another change'}<ArrowRight size={13} /></button> : <button className="simulation-details-link" onClick={onOpen}>Follow the pipeline<ChevronRight size={12} /></button>}
    </div>
  </section>
}

type DetailProps = Omit<Props, 'onOpen'> & { scenario: ScenarioId; onScenario: (value: ScenarioId) => void; onWatchFlow?: () => void; onExplore?: () => void }
export function SimulationPanel({ state, environment, onEnvironment, onCommand, onLocate, scenario, onScenario, onWatchFlow, onExplore }: DetailProps) {
  const stage = DEPLOYMENT_STAGES[state.stageIndex]
  const busy = ['running', 'waiting-approval', 'retrying'].includes(state.status)
  const inspected = state.infra.environments[environment]
  return <div className="simulation-detail" data-testid="simulation-panel">
    <p className="dialog-intro">Push a change, follow its image by digest, and approve the handoff to GitOps. Every state and value here is simulated locally.</p>
    {onWatchFlow && <div className="mission-view-choice"><button className="primary-button" data-testid="lab-watch-flow" onClick={onWatchFlow}><Play size={14} />Watch Flow<small>Recommended</small></button><button className="text-button" onClick={onExplore}>Explore Manually</button></div>}
    <div className="simulation-settings"><label>Inspect environment<select aria-label="Pipeline environment" value={environment} onChange={event => onEnvironment(event.target.value as EnvironmentId)}><option value="development">Development</option><option value="production">Production</option></select></label><label>Learning run<select aria-label="Learning scenario" data-testid="scenario-select" value={scenario} onChange={event => onScenario(event.target.value as ScenarioId)} disabled={busy}><option value="healthy">Healthy deployment</option><option value="tests-fail">Fail an automated test</option><option value="security-fail">Catch a security finding</option><option value="rollout-fail">Recover an unhealthy rollout</option></select></label></div>
    <div className="environment-boundary"><span>SHARED CLUSTER · SEPARATE NAMESPACES</span><p>Development and production keep independent configurations, secret references and deployment state. Namespaces organize and constrain access; they are not the same isolation boundary as separate clusters.</p></div>
    <div className={`pipeline-status status-${state.status}`} role="status" aria-live="polite" aria-atomic="true"><span className="status-dot" /><strong data-testid="pipeline-status">{statusLabels[state.status]}</strong><small>{state.environment} environment</small></div>
    {state.error && <p className="simulation-error" role="status">{state.error}</p>}
    {state.status === 'waiting-approval' && <div className="approval-gate"><ShieldCheck size={23} /><div><h3>A person owns this decision.</h3><p>The built image is published. Review the proposed digest before approving and merging the pull request. CI has no direct access to the cluster.</p><code data-testid="approval-digest">{state.activeImageDigest}</code></div></div>}
    <div className="simulation-actions">
      {!busy && <button className="primary-button" data-testid="simulation-start" onClick={() => onCommand({ type: 'start', environment, scenario })}><Play size={14} />Push a code change</button>}
      {state.status === 'waiting-approval' && <button className="primary-button" data-testid="simulation-approve" onClick={() => onCommand({ type: 'approve' })}><Check size={16} />Approve & merge to {state.environment}</button>}
      {state.status === 'failed' && <button className="primary-button" data-testid="simulation-retry" onClick={() => onCommand({ type: 'retry' })}><RotateCcw size={15} />Apply fix & retry</button>}
      {busy && <button className="secondary-button" data-testid="simulation-cancel" onClick={() => onCommand({ type: 'cancel' })}><Square size={13} />Cancel run</button>}
      <button className="text-button" data-testid="simulation-reset" title="Clear simulated runs and infrastructure in both environments; discovery progress stays saved." onClick={() => onCommand({ type: 'reset' })}><RotateCcw size={14} />Reset simulation</button>
    </div>
    <div className="pipeline-environment-state" data-testid="environment-state"><div><span>Namespace</span><strong>{inspected.namespace}</strong></div><div><span>Deployment revision</span><strong data-testid="deployment-revision">{inspected.deploymentRevision}</strong></div><div><span>Available replicas</span><strong data-testid="available-replicas">{inspected.availableReplicas} / {inspected.desiredReplicas}</strong></div><div><span>GitOps sync / health</span><strong data-testid="gitops-health">{inspected.syncStatus} / {inspected.health}</strong></div><div><span>Service / ingress</span><strong data-testid="traffic-status">{inspected.serviceReady ? 'Ready' : 'Waiting'} / {inspected.ingressReady ? 'Ready' : 'Waiting'}</strong></div><div><span>Telemetry / alerts</span><strong data-testid="telemetry-status">{inspected.dashboardReady ? 'Visible' : 'Waiting'} / {inspected.alert}</strong></div></div>
    <ol className="pipeline-stages" aria-label="Deployment stages">{DEPLOYMENT_STAGES.map((item, index) => {
      const completed = state.completedStages.includes(item.id), active = state.status !== 'idle' && index === state.stageIndex
      return <li key={item.id} className={`${completed ? 'complete' : ''} ${active ? 'current' : ''}`} aria-current={active ? 'step' : undefined}><span>{completed ? <Check size={13} /> : String(index + 1).padStart(2, '0')}</span><button onClick={() => onLocate(item.stationId)}><strong>{item.title}</strong><small>{item.actor === 'human' ? 'Human approval' : 'Automated'}{active ? ` · ${item.description}` : ''}</small></button></li>
    })}</ol>
    {stage && state.status !== 'idle' && <button className="text-button" onClick={() => onLocate(stage.stationId)}>Find the current stage in the world<ArrowRight size={14} /></button>}
    <details className="event-history"><summary>Event history · {state.history.length} recorded events</summary><ol data-testid="simulation-history">{state.history.slice(-80).map(event => <li key={event.id}><code>{event.type}</code><span>{event.message}</span></li>)}</ol></details>
  </div>
}
