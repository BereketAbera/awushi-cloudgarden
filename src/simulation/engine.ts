import { ENVIRONMENTS, SCENARIOS, type EnvironmentId, type EnvironmentState, type ScenarioId, type SimulationCommand, type SimulationEvent, type SimulationState, type StageDefinition, type StateField } from './domain'
import { DEPLOYMENT_STAGES, stageById } from './scenario'

const BASELINE_DIGEST = `sha256:${'a7'.repeat(32)}`
const terminal = new Set(['idle', 'succeeded', 'failed', 'cancelled'])
const validTime = (state: SimulationState, now: number) => Number.isFinite(now) && now >= state.clock
const cloneState = (state: SimulationState): SimulationState => structuredClone(state)
function initialEnvironment(id: EnvironmentId): EnvironmentState {
  const replicas = id === 'development' ? 2 : 3
  return {
    id, namespace: `awushi-${id === 'development' ? 'dev' : 'prod'}`, cluster: 'kind-awushi',
    config: { replicas, mode: id, host: `app.${id === 'development' ? 'dev' : 'prod'}.localhost` },
    secretRef: `application-${id === 'development' ? 'dev' : 'prod'}-secrets`, secretVersion: 1, secretsSynced: true, policiesApplied: true,
    desiredImageDigest: BASELINE_DIGEST, activeImageDigest: BASELINE_DIGEST, version: 'v0', deploymentRevision: 0,
    desiredRevision: 'baseline', appliedRevision: 'baseline', gitMirrorRevision: 'baseline', syncStatus: 'Synced', health: 'Healthy',
    desiredReplicas: replicas, availableReplicas: replicas, updatedReplicas: replicas,
    pods: Array.from({ length: replicas }, (_, i) => ({ id: `${id}-baseline-${i}`, revision: 0, digest: BASELINE_DIGEST, ready: true, status: 'ready' })),
    rollout: { targetRevision: 0, sourcePods: [] },
    manifestsRendered: true, serviceReady: true, ingressReady: true,
    metrics: { collected: false, requestsPerSecond: 0, errorRate: 0, latencyMs: 0, availableReplicas: replicas },
    logs: [], dashboardReady: false, alert: 'inactive',
    data: { postgres: 'ready', valkey: 'ready', rabbitmq: 'ready', objectStorage: 'ready', backup: null, restoredBackupId: null, recoveredRecords: null, records: 100 },
  }
}
export function createSimulation(now = 0): SimulationState {
  return {
    version: 1, status: 'idle', environment: 'development', scenario: 'healthy', runId: 0, stageId: null, stageIndex: -1,
    stageStartedAt: Number.isFinite(now) ? now : 0, completedStages: [], history: [], eventSequence: 0, activeImageDigest: null,
    error: null, clock: Number.isFinite(now) ? now : 0, repaired: false,
    infra: {
      github: { commit: null, pullRequest: 'none', approvedBy: null },
      ci: { status: 'pending', lint: 'pending', tests: 'pending', security: 'pending', build: 'pending', imageScan: 'pending', canAccessCluster: false },
      registry: { imageDigest: null, version: null, ghcrAvailable: false, localAvailable: false, localDigest: null, promotion: 'pending', cache: 'cold' },
      environments: { development: initialEnvironment('development'), production: initialEnvironment('production') },
    },
  }
}

/** Runtime validation is deliberately separate from TypeScript's compile-time union. */
export function parseSimulationCommand(value: unknown): SimulationCommand | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const command = value as Record<string, unknown>
  if (command.type === 'start') {
    if (!ENVIRONMENTS.includes(command.environment as EnvironmentId) || (command.scenario !== undefined && !SCENARIOS.some(s => s.id === command.scenario))) return null
    return { type: 'start', environment: command.environment as EnvironmentId, scenario: command.scenario as ScenarioId | undefined }
  }
  if (command.type === 'promote-existing') return command.environment === 'production' && command.source === 'development' && typeof command.digest === 'string' && /^sha256:[a-f0-9]{64}$/.test(command.digest) ? { type: command.type, environment: 'production', source: 'development', digest: command.digest } : null
  if (command.type === 'backup' || command.type === 'restore') return ENVIRONMENTS.includes(command.environment as EnvironmentId) ? { type: command.type, environment: command.environment as EnvironmentId } : null
  if (command.type === 'approve' || command.type === 'retry' || command.type === 'cancel' || command.type === 'reset') return { type: command.type }
  return null
}

function emit(state: SimulationState, type: SimulationEvent['type'], message: string, timestamp: number, stage?: StageDefinition, environment = state.environment) {
  const visual = stage?.kind && stage.fromStationId && stage.toStationId ? { kind: stage.kind, fromStationId: stage.fromStationId, toStationId: stage.toStationId } : undefined
  state.history.push({ id: ++state.eventSequence, runId: state.runId, timestamp, environment, type, stageId: stage?.id ?? state.stageId, message, ...(visual ? { visual, ...visual } : {}) })
  if (state.history.length > 240) state.history.splice(0, state.history.length - 240)
}
function envOf(state: SimulationState) { return state.infra.environments[state.environment] }
function stageRequirement(state: SimulationState, stage: StageDefinition): string | null {
  const { ci, registry, github } = state.infra, env = envOf(state)
  switch (stage.id) {
    case 'build': return ci.tests === 'passed' && ci.lint === 'passed' && ci.security === 'passed' ? null : 'Build requires successful quality and security gates.'
    case 'publish': return ci.build === 'passed' && ci.imageScan === 'passed' && registry.imageDigest ? null : 'Publication requires a built, inspected image.'
    case 'pull-request': return registry.ghcrAvailable ? null : 'A digest proposal requires a published image.'
    case 'promote': return github.pullRequest === 'merged' && registry.ghcrAvailable ? null : 'Local promotion requires human approval and a published artifact.'
    case 'configuration': return registry.localAvailable && registry.localDigest === registry.imageDigest ? null : 'Configuration cannot reference an unavailable local image.'
    case 'render-manifests': return env.desiredImageDigest === registry.localDigest ? null : 'Manifest rendering requires the approved local digest.'
    case 'gitops-commit': return env.manifestsRendered && registry.localAvailable ? null : 'Publish desired state only after manifests render and the image is available.'
    case 'detect': return env.gitMirrorRevision === env.desiredRevision && env.gitMirrorRevision !== 'baseline' ? null : 'Argo CD must be able to read the desired revision from the local Git mirror.'
    case 'sync': return env.syncStatus === 'OutOfSync' ? null : 'No desired-state drift is ready to synchronize.'
    case 'rollout': return env.appliedRevision === env.desiredRevision && env.secretsSynced && env.policiesApplied ? null : 'Rollout requires applied manifests, environment secrets and policies.'
    case 'ready': return env.updatedReplicas === env.desiredReplicas ? null : 'The new revision does not have all desired replicas.'
    case 'service': return env.health === 'Healthy' && env.availableReplicas === env.desiredReplicas ? null : 'The new Service endpoints must be ready.'
    case 'ingress': return env.serviceReady ? null : 'Ingress cannot forward to an unavailable Service.'
    case 'metrics': return env.ingressReady ? null : 'Generate request metrics only after a request path is available.'
    case 'logs': return env.metrics.collected ? null : 'This guided journey collects request metrics before forwarding its corresponding logs.'
    case 'dashboard': return env.metrics.collected && env.logs.length > 0 ? null : 'The dashboard requires simulated metric and log sources.'
    // Guided inspection order only: Prometheus rules feed Alertmanager independently of Grafana.
    case 'alerts': return env.dashboardReady ? null : 'Complete telemetry inspection before the final alert review.'
    default: return null
  }
}
function enterStage(state: SimulationState, index: number, timestamp: number) {
  const stage = DEPLOYMENT_STAGES[index]
  state.stageIndex = index; state.stageId = stage.id; state.stageStartedAt = timestamp
  const requirement = stageRequirement(state, stage)
  if (requirement) { failStage(state, requirement, timestamp); return }
  const ci = state.infra.ci, env = envOf(state)
  if (['ci-start', 'quality', 'security', 'build'].includes(stage.id)) ci.status = 'running'
  if (stage.id === 'quality') { ci.lint = 'running'; ci.tests = 'running' }
  if (stage.id === 'security') ci.security = 'running'
  if (stage.id === 'build') { ci.build = 'running'; ci.imageScan = 'running' }
  if (stage.id === 'sync') { env.syncStatus = 'Syncing'; env.health = 'Progressing' }
  if (stage.id === 'rollout') {
    // A cancelled rollout can leave several healthy image versions serving. Preserve those
    // actual Pods; the next candidate replaces them rather than recreating the old digest.
    env.rollout.sourcePods = env.pods.filter(pod => pod.ready)
    env.updatedReplicas = 0; env.health = 'Progressing'; updateRollout(state, 0)
  }
  emit(state, 'stage-started', stage.title, timestamp, stage)
  if (stage.actor === 'human') { state.status = 'waiting-approval'; emit(state, 'approval-required', 'Review the proposed digest, then approve and merge. No timer can approve this change.', timestamp, stage) }
}
function failStage(state: SimulationState, message: string, timestamp: number) {
  state.status = 'failed'; state.error = message
  const ci = state.infra.ci, env = envOf(state)
  if (state.stageId === 'quality') { ci.tests = 'failed'; ci.lint = 'passed'; ci.status = 'failed' }
  if (state.stageId === 'security') { ci.security = 'failed'; ci.status = 'failed' }
  if (state.stageId === 'rollout') {
    env.health = 'Degraded'; env.alert = 'firing'
    env.logs.push({ timestamp, level: 'error', message: 'New Pod readiness failed; old healthy Pods remain Service endpoints.' })
    // Existing monitoring evaluates the rollout failure; a fresh healthy flow raises no alert.
  }
  emit(state, 'failed', message, timestamp, stageById(state.stageId))
}
function shouldFail(state: SimulationState) {
  if (state.repaired) return null
  if (state.scenario === 'tests-fail' && state.stageId === 'quality') return 'A regression test failed. Fix the behavior before building or publishing an image.'
  if (state.scenario === 'security-fail' && state.stageId === 'security') return 'gitleaks detected a simulated test credential. Remove it and rotate the affected credential before retrying.'
  if (state.scenario === 'rollout-fail' && state.stageId === 'rollout') return 'The new Pod failed its readiness check. The old healthy version is still serving; repair the probe configuration and retry.'
  return null
}
function updateRollout(state: SimulationState, fraction: number) {
  const env = envOf(state), digest = state.infra.registry.localDigest!
  const failing = state.scenario === 'rollout-fail' && !state.repaired
  const count = failing ? 0 : Math.min(env.desiredReplicas, Math.floor(fraction * env.desiredReplicas))
  const newRevision = env.rollout.targetRevision
  env.pods = [
    ...env.rollout.sourcePods.slice(count).map(pod => ({ ...pod, status: 'old' as const })),
    ...Array.from({ length: count }, (_, i) => ({ id: `${state.environment}-r${newRevision}-${i}`, revision: newRevision, digest, ready: true, status: 'ready' as const })),
    ...(count < env.desiredReplicas ? [{ id: `${state.environment}-r${newRevision}-${count}`, revision: newRevision, digest, ready: false, status: 'starting' as const }] : []),
  ]
  env.updatedReplicas = count; env.availableReplicas = env.pods.filter(pod => pod.ready).length
}
function completeStage(state: SimulationState, timestamp: number) {
  const stage = DEPLOYMENT_STAGES[state.stageIndex], env = envOf(state), { ci, registry, github } = state.infra
  switch (stage.id) {
    case 'push': github.commit = `change-${state.runId.toString().padStart(4, '0')}`; break
    case 'quality': ci.lint = 'passed'; ci.tests = 'passed'; break
    case 'security': ci.security = 'passed'; break
    case 'build': {
      ci.build = 'passed'; ci.imageScan = 'passed'; registry.cache = 'warm'
      // A reproducible teaching identifier with digest syntax, never a hash of a real image.
      const hex = state.runId.toString(16).padStart(8, '0')
      registry.imageDigest = `sha256:${hex.repeat(8)}`; registry.version = `v${state.runId}`; state.activeImageDigest = registry.imageDigest
      break
    }
    case 'publish': registry.ghcrAvailable = true; ci.status = 'passed'; break
    case 'pull-request': github.pullRequest = 'open'; break
    case 'approval': github.pullRequest = 'merged'; github.approvedBy = 'Visitor (simulated review)'; break
    case 'promote': registry.localAvailable = true; registry.localDigest = registry.imageDigest; registry.promotion = 'copied'; break
    case 'configuration': env.desiredImageDigest = registry.localDigest; env.manifestsRendered = false; break
    case 'render-manifests': env.manifestsRendered = true; break
    case 'gitops-commit': env.desiredRevision = `gitops-${state.environment}-${state.runId}`; env.gitMirrorRevision = env.desiredRevision; break
    case 'detect': env.syncStatus = 'OutOfSync'; break
    case 'sync': {
      if (env.appliedRevision !== env.desiredRevision) {
        env.rollout.targetRevision = Math.max(env.rollout.targetRevision, ...env.pods.map(pod => pod.revision)) + 1
      }
      env.appliedRevision = env.desiredRevision; env.syncStatus = 'Synced'; env.secretsSynced = true; env.policiesApplied = true
      break
    }
    case 'rollout': updateRollout(state, 1); break
    case 'ready': env.activeImageDigest = registry.localDigest!; env.version = registry.version!; env.deploymentRevision = env.rollout.targetRevision; env.health = 'Healthy'; env.availableReplicas = env.desiredReplicas; break
    case 'service': env.serviceReady = true; break
    case 'ingress': env.ingressReady = true; break
    case 'metrics': env.metrics = { collected: true, requestsPerSecond: state.environment === 'development' ? 12 : 36, errorRate: 0, latencyMs: state.environment === 'development' ? 42 : 35, availableReplicas: env.availableReplicas }; break
    case 'logs': env.logs.push({ timestamp, level: 'info', message: `${env.namespace}: a simulated request reached healthy ${env.version} Pods through Traefik and the Service.` }); break
    case 'dashboard': env.dashboardReady = true; break
    case 'alerts': env.alert = env.alert === 'firing' || env.alert === 'pending' ? 'resolved' : 'inactive'; break
  }
  state.completedStages.push(stage.id); emit(state, 'stage-completed', stage.title, timestamp, stage)
  if (state.stageIndex === DEPLOYMENT_STAGES.length - 1) {
    state.status = 'succeeded'; emit(state, 'succeeded', `The ${state.environment} release is healthy, reachable and observable.`, timestamp, stage)
  } else enterStage(state, state.stageIndex + 1, timestamp)
}

/** Progress uses an injected monotonic clock; catch-up is independent of frame rate. */
export function tickSimulation(state: SimulationState, now: number): SimulationState {
  if (!validTime(state, now) || !['running', 'retrying'].includes(state.status)) return state
  if (now === state.clock && state.status !== 'retrying') return state
  const next = cloneState(state); next.clock = now
  if (next.status === 'retrying') next.status = 'running'
  while (next.status === 'running') {
    const stage = DEPLOYMENT_STAGES[next.stageIndex], due = next.stageStartedAt + stage.durationMs
    if (now < due) { if (stage.id === 'rollout') updateRollout(next, (now - next.stageStartedAt) / stage.durationMs); break }
    const failure = shouldFail(next)
    if (failure) { failStage(next, failure, due); next.clock = due; break }
    completeStage(next, due)
    // At a pause or terminal transition freeze logical time at the event, not a caller's overshoot.
    if (next.status !== 'running') next.clock = due
  }
  return next
}

export function reduceSimulation(state: SimulationState, input: SimulationCommand | unknown, now: number): SimulationState {
  const command = parseSimulationCommand(input)
  if (!command || !validTime(state, now)) return state
  if (command.type === 'reset') {
    const fresh = createSimulation(now)
    // Monotonic identities prevent an old visual event from being replayed after reset.
    fresh.runId = state.runId; fresh.eventSequence = state.eventSequence
    return fresh
  }
  if (command.type === 'start') {
    if (!terminal.has(state.status)) return state
    const next = cloneState(state), fresh = createSimulation(now)
    next.status = 'running'; next.environment = command.environment; next.scenario = command.scenario ?? 'healthy'; next.runId++
    next.clock = now; next.completedStages = []; next.error = null; next.repaired = false; next.activeImageDigest = null
    next.stageId = null; next.stageIndex = -1
    next.infra.github = fresh.infra.github; next.infra.ci = fresh.infra.ci; next.infra.registry = fresh.infra.registry
    emit(next, 'started', `A simulated code change starts a ${next.environment} delivery.`, now)
    enterStage(next, 0, now)
    return next
  }
  if (command.type === 'promote-existing') {
    const source = state.infra.environments.development
    if (state.status !== 'succeeded' || state.environment !== 'development' || source.health !== 'Healthy' || source.activeImageDigest !== command.digest || state.infra.registry.imageDigest !== command.digest || !state.infra.registry.ghcrAvailable || state.infra.ci.status !== 'passed') return state
    const next = cloneState(state)
    next.environment = 'production'; next.runId++; next.status = 'running'; next.scenario = 'healthy'; next.clock = now
    next.completedStages = []; next.error = null; next.repaired = false; next.infra.github.pullRequest = 'none'; next.infra.github.approvedBy = null
    emit(next, 'started', 'Propose the verified development artifact for production without rebuilding its immutable digest.', now)
    enterStage(next, DEPLOYMENT_STAGES.findIndex(stage => stage.id === 'pull-request'), now)
    return next
  }
  if (command.type === 'approve') {
    if (state.status !== 'waiting-approval' || state.stageId !== 'approval' || state.infra.github.pullRequest !== 'open') return state
    const next = cloneState(state); next.clock = now; next.status = 'running'
    emit(next, 'approved', 'The visitor approved and merged the digest promotion proposal.', now, stageById('approval'))
    completeStage(next, now)
    return next
  }
  if (command.type === 'retry') {
    if (state.status !== 'failed') return state
    const next = cloneState(state); next.clock = now; next.repaired = true; next.error = null; next.status = 'retrying'
    emit(next, 'retrying', 'Applied the demonstrated fix; retrying the failed stage without skipping its gates.', now, stageById(next.stageId))
    enterStage(next, next.stageIndex, now)
    return next
  }
  if (command.type === 'cancel') {
    if (!['running', 'retrying', 'waiting-approval'].includes(state.status)) return state
    const next = cloneState(state); next.clock = now; next.status = 'cancelled'
    if (next.infra.github.pullRequest === 'open') next.infra.github.pullRequest = 'cancelled'
    for (const key of ['status', 'lint', 'tests', 'security', 'build', 'imageScan'] as const) {
      if (next.infra.ci[key] === 'running') next.infra.ci[key] = 'cancelled'
    }
    emit(next, 'cancelled', 'The guided run stopped. Already applied infrastructure changes are preserved; cancellation is not rollback.', now)
    return next
  }
  if (!terminal.has(state.status)) return state
  const env = state.infra.environments[command.environment]
  if (command.type === 'restore' && !env.data.backup) return state
  const next = cloneState(state); next.clock = now
  const target = next.infra.environments[command.environment]
  if (command.type === 'backup') {
    target.data.backup = { id: `backup-${command.environment}-${next.eventSequence + 1}`, timestamp: now, deploymentRevision: target.deploymentRevision, records: target.data.records }
    emit(next, 'backup-created', `Created and checksum-verified a simulated PostgreSQL snapshot plus object-store inventory for ${target.namespace}.`, now, undefined, command.environment)
  } else {
    target.data.recoveredRecords = target.data.backup!.records; target.data.restoredBackupId = target.data.backup!.id
    emit(next, 'restore-completed', `Validated ${target.data.recoveredRecords} simulated records after restoring ${target.data.backup!.id} into an isolated recovery target. Live traffic remains unchanged.`, now, undefined, command.environment)
  }
  return next
}

export function stationSnapshot(state: SimulationState, stationId: string, environment: EnvironmentId = state.environment): StateField[] {
  const env = state.infra.environments[environment], { ci, registry, github } = state.infra
  const text = (label: string, value: string | number | boolean | null, tone: StateField['tone'] = 'neutral'): StateField => ({ label, value: value === null ? 'Not created' : String(value), tone })
  const gate = (label: string, value: string): StateField => text(label, value, value === 'passed' || value === 'Healthy' || value === 'Synced' ? 'good' : value === 'failed' || value === 'Degraded' ? 'bad' : 'neutral')
  const common = [text('Environment', environment), text('Namespace', env.namespace)]
  const candidate = [text('Candidate target', state.status !== 'idle' ? state.environment : 'No run yet'), text('Scope', 'Shared latest-run candidate')]
  switch (stationId) {
    case 'github': return [...candidate, text('Source commit', github.commit), text('Promotion proposal', github.pullRequest), text('Human reviewer', github.approvedBy)]
    case 'ci': return [...candidate, gate('Pipeline', ci.status), gate('Lint', ci.lint), gate('Tests', ci.tests), gate('Source security', ci.security), gate('Image build', ci.build), gate('Image inspection', ci.imageScan), text('Direct cluster access', 'None')]
    case 'delivery': return [...candidate, text('Pull request', github.pullRequest), text('Proposed digest', registry.imageDigest), text('Approval', github.approvedBy ?? 'Human review required'), text('Inspected environment', environment), text('Inspected desired revision', env.desiredRevision)]
    case 'registry': return [...candidate, text('Candidate digest', registry.imageDigest), text('Candidate version', registry.version), text('GHCR candidate', registry.ghcrAvailable ? 'Available' : 'Not published'), text('Local candidate', registry.localAvailable ? 'Available' : 'Not promoted'), text('Verified candidate digest', registry.localDigest)]
    case 'containers': return [...candidate, text('Candidate promotion', registry.promotion), text('Build cache use', registry.cache === 'warm' ? 'Warmed during this run' : 'Not used in this run'), text('Pinned local candidate', registry.localDigest), text('Image builds', 'Docker → OCI artifact')]
    case 'infrastructure': return [...common, text('Platform', 'Shared kind cluster; Terraform bootstrapped'), text('Manifest rendering', env.manifestsRendered ? 'Helm + Kustomize ready' : 'Pending'), text('Replicas', env.config.replicas), text('Host', env.config.host)]
    case 'kubernetes': return [...common, gate('Health', env.health), text('Stable deployment revision', env.deploymentRevision), text('Applied template revision', env.rollout.targetRevision), text('Desired replicas', env.desiredReplicas), text('Available replicas', env.availableReplicas), text('Updated replicas', env.updatedReplicas), text('Active version', env.version), text('Active digest', env.activeImageDigest), ...(env.operations?.pod ? [text('Pod event',env.operations.pod.event),text('Fault corrected',env.operations.pod.corrected)] : [])]
    case 'gitops': return [...common, text('Desired revision', env.desiredRevision), text('Local Git mirror', env.gitMirrorRevision), text('Applied revision', env.appliedRevision), gate('Sync status', env.syncStatus), gate('Health', env.health), ...(env.operations?.drift ? [text('Self-heal',env.operations.drift.selfHeal?'Enabled':'Disabled'),text('Git / live replicas',`${env.operations.drift.desiredReplicas} / ${env.operations.drift.liveReplicas}`)] : [])]
    case 'network': return [...common, text('Service endpoints', env.availableReplicas), text('Service', env.serviceReady ? 'Ready' : 'Waiting'), text('Traefik', env.ingressReady ? 'Routing' : 'Waiting'), text('Host rule', env.config.host)]
    case 'security': return [...common, text('RBAC', 'Namespace-scoped service account'), text('NetworkPolicies', env.policiesApplied ? 'Applied by supported CNI' : 'Pending'), text('Resources', 'Requests 100m / 128Mi; limits 500m / 256Mi'), text('Isolation boundary', 'Shared cluster, kernel and host')]
    case 'secrets': return [...common, text('Infisical reference', env.secretRef), text('Operator synchronization', env.secretsSynced ? 'Ready' : 'Pending'), text('Secret version', env.secretVersion), text('Secret values', 'Never stored or displayed in this simulation')]
    case 'supply-chain': return [...candidate, gate('gitleaks / source scans', ci.security), gate('Trivy image inspection', ci.imageScan), text('Gate policy', 'Block the demonstrated finding before publishing')]
    case 'observability': return [...common, text('Prometheus', env.metrics.collected ? 'Scraped' : 'Awaiting journey sample'), text('Requests / second', env.metrics.collected ? env.metrics.requestsPerSecond : 'Not sampled'), text('Latency (ms)', env.metrics.collected ? env.metrics.latencyMs : 'Not sampled'), text('Error rate', env.metrics.collected ? `${env.metrics.errorRate}%` : 'Not sampled'), text('Loki log events', env.logs.length), text('Grafana', env.dashboardReady ? 'Sources ready' : 'Awaiting samples')]
    case 'alerts': return [...common, text('Alertmanager', env.alert, env.alert === 'firing' ? 'bad' : env.alert === 'resolved' ? 'good' : 'neutral'), text('Rule', env.operations?.incident ? 'HTTP5xxHigh: request errors > 5%' : env.operations?.recovery ? 'Data integrity failure' : env.operations?.pod ? 'Pod readiness unavailable' : 'New revision readiness failure'), text('Notification destination', 'Local teaching event history only')]
    case 'database': return [...common, text('PostgreSQL', env.data.postgres), text('Valkey', env.data.valkey), text('Simulated records', env.data.records), text('Persistence', 'Model state only; no real database')]
    case 'messaging': return [...common, text('RabbitMQ', env.data.rabbitmq), text('Delivery contract', 'Acknowledge after processing; consumers tolerate redelivery'), text('S3-compatible objects', env.data.objectStorage)]
    case 'recovery': return [...common, text('Latest backup', env.data.backup?.id ?? null), text('Verified snapshot records', env.data.backup?.records ?? 'No snapshot'), text('Restore validation', env.data.restoredBackupId ?? 'Not run'), text('Recovered records', env.data.recoveredRecords ?? 'Not restored'), text('Recovery target', 'Isolated simulated restore; no live traffic changes')]
    default: return common
  }
}

/** Shared event path for operational scenarios; it uses the same infrastructure event log. */
export function emitOperation(state: SimulationState, message: string, timestamp: number, environment: EnvironmentId, stationId: string, kind: 'failure' | 'recovery' | 'sync' | 'telemetry' | 'config' = 'config') {
  emit(state, 'operation', message, timestamp, undefined, environment)
  const event = state.history.at(-1)!
  event.visual = { kind, fromStationId: stationId, toStationId: stationId }
  event.kind = kind; event.fromStationId = stationId; event.toStationId = stationId
}
