import { adventureDefinition } from './catalog'
import type { AdventureAction, AdventureId, AdventureSession } from './domain'
import { getAdventureView } from './selectors'
import { getStation } from '../worldConfig'
import { technologiesForStation } from '../simulation/registry'

export type GuidanceMode = 'guided' | 'engineer' | 'commander'
export const GUIDANCE_MODES: readonly { id: GuidanceMode; label: string; description: string }[] = [
  { id: 'guided', label: 'Guided Explorer', description: 'Objectives, checklists and optional navigation. Hints are always your choice.' },
  { id: 'engineer', label: 'Engineer', description: 'Objectives and diagnostic tools, with guidance when you ask.' },
  { id: 'commander', label: 'Incident Commander', description: 'A briefing and raw evidence. Investigate freely; request help at any time.' },
]
export const GUIDANCE_STORAGE_KEY = 'awushi-guidance-v1'
export type GuidancePreferences = { version: 1; mode: GuidanceMode; automaticCamera: boolean; onboardingComplete: boolean }
const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
export function normalizeGuidancePreferences(value: unknown): GuidancePreferences {
  const input = object(value) && value.version === 1 ? value : {}
  return { version: 1, mode: GUIDANCE_MODES.some(mode => mode.id === input.mode) ? input.mode as GuidanceMode : 'guided', automaticCamera: typeof input.automaticCamera === 'boolean' ? input.automaticCamera : true, onboardingComplete: input.onboardingComplete === true }
}
export function parseGuidancePreferences(raw: string | null): GuidancePreferences {
  if (raw !== null && raw.length > 4096) return normalizeGuidancePreferences(null)
  try { return normalizeGuidancePreferences(JSON.parse(raw ?? 'null')) } catch { return normalizeGuidancePreferences(null) }
}

type BriefingCopy = { happened: string; objective: string; firstStationId: string; toolStationIds: string[] }
const BRIEFINGS: Record<AdventureId, BriefingCopy> = {
  'ship-release': { happened: 'A small application change is ready for delivery. It must pass checks and human review before reaching users.', objective: 'Deliver a reviewed image and verify that it serves healthy requests.', firstStationId: 'github', toolStationIds: ['ci', 'registry', 'gitops', 'observability'] },
  'recover-pod': { happened: 'One workload is not contributing a ready Service endpoint. Determine what is keeping it out of service.', objective: 'Use the Pod evidence to recover the workload, then verify readiness and endpoints.', firstStationId: 'kubernetes', toolStationIds: ['kubernetes', 'registry', 'infrastructure'] },
  'fix-drift': { happened: 'The live cluster and reviewed Git configuration disagree. Establish which configuration should be running.', objective: 'Compare both sides, choose a reconciliation policy and verify convergence.', firstStationId: 'gitops', toolStationIds: ['gitops', 'kubernetes'] },
  'promote-production': { happened: 'A candidate must prove itself in development before a separate production approval.', objective: 'Promote the exact verified artifact and confirm both environments independently.', firstStationId: 'github', toolStationIds: ['ci', 'registry', 'delivery', 'kubernetes'] },
  'investigate-incident': { happened: 'An HTTP 5xx alert reports failed application requests. The cause has not yet been established.', objective: 'Correlate observations, test a diagnosis, restore service and verify fresh healthy requests.', firstStationId: 'alerts', toolStationIds: ['alerts', 'observability', 'database', 'infrastructure'] },
  'restore-backup': { happened: 'Application data and dependent objects are damaged or missing. Traffic is paused to protect consistency.', objective: 'Choose a suitable recovery point, restore its dependencies and validate before cutover.', firstStationId: 'database', toolStationIds: ['database', 'recovery', 'messaging', 'network'] },
}

/** Describe observed state without reading a hidden cause or introducing new telemetry. */
function symptoms(session: AdventureSession): string[] {
  const sim = session.simulation, env = sim.infra.environments[sim.environment]
  if (session.id === 'recover-pod') return [`Ready endpoints: ${env.availableReplicas}/${env.desiredReplicas}.`, `Workload health: ${env.health}.`]
  if (session.id === 'fix-drift') return [`Application synchronization: ${env.syncStatus}.`, 'Compare the source of truth with the live cluster before changing either.']
  if (session.id === 'investigate-incident') return [`HTTP 5xx: ${env.metrics.errorRate}% of requests.`, `Observed latency: ${env.metrics.latencyMs} ms. Alert: ${env.alert}.`]
  if (session.id === 'restore-backup') return [`Database: ${env.data.postgres}. Object versions: ${env.data.objectStorage}.`, `Traffic: ${env.serviceReady ? 'serving' : 'paused'}.`]
  if (sim.status === 'idle') return ['No candidate has been submitted yet.', 'Running environments retain their current release.']
  if (sim.status === 'failed') return ['A required delivery gate failed.', 'Inspect the gate before deciding how to recover.']
  if (sim.status === 'waiting-approval') return ['A published candidate is awaiting review.', 'The simulation will wait for your explicit approval.']
  return [`Delivery: ${sim.status}.`, `${env.namespace}: ${env.health}.`]
}

/** Some actions are impossible until their target exists. Plausible wrong decisions remain available. */
function presentAction(session: AdventureSession, action: AdventureAction): AdventureAction {
  const has = (id: string) => session.completedObjectives.includes(id)
  const inspected = (id: string) => session.evidence.some(item => item.id === id)
  let reason: string | undefined
  let enabled = action.enabled
  if (action.id === 'repair-tests' && !inspected('ci')) { enabled = false; reason = 'Inspect the failed CI results to establish which check needs a correction.' }
  if (action.id === 'restore-database' && !has('select')) { enabled = false; reason = 'Select a recovery point before creating an isolated restore target.' }
  if (action.id === 'restore-objects' && !session.simulation.infra.environments.development.operations?.recovery?.databaseRestored) { enabled = false; reason = 'Restore the database target first; its inventory identifies the matching objects.' }
  if (action.id === 'approve-release' && (!has('ci') || !has('image'))) reason = 'Approval requires inspected passing checks and the current published digest.'
  if (action.id === 'approve-production' && !inspected('production-review')) reason = 'Review the production diff before authorizing this environment.'
  // A visible consequence is educational for premature verification and unsupported diagnoses.
  if (action.kind === 'verify' && !reason) reason = 'Verification checks actual infrastructure and will explain any remaining condition.'
  let description = action.description
  if (session.id === 'investigate-incident' && !['alert', 'metrics', 'logs'].every(has)) {
    if (action.id === 'repair-pool') description = 'Review a configuration correction after correlating the diagnostic evidence.'
    if (action.id === 'diagnose-pool') description = 'Test whether database connection capacity explains the observations.'
  }
  return { ...action, enabled, reason, description }
}

// A location hint may recommend an inspection, but never chooses a diagnosis or repair.
const INVESTIGATIONS: Partial<Record<AdventureId, Record<string, string>>> = {
  'ship-release': { push: 'push', ci: 'inspect-ci', image: 'inspect-image', gitops: 'inspect-gitops', health: 'verify-health', routing: 'verify-routing', telemetry: 'inspect-telemetry' },
  'promote-production': { push: 'push', ci: 'inspect-ci', image: 'inspect-image', development: 'verify-development', 'production-approval': 'review-production', production: 'verify-production' },
  'recover-pod': { diagnose: 'inspect-pod', verify: 'verify-pod' },
  'fix-drift': { git: 'inspect-git', live: 'inspect-live', verify: 'verify-drift' },
  'investigate-incident': { alert: 'inspect-alert', metrics: 'inspect-metrics', logs: 'inspect-logs', verify: 'verify-incident' },
  'restore-backup': { damage: 'inspect-damage', snapshots: 'inspect-snapshots', validate: 'validate-restore' },
}
export function getMissionGuidance(session: AdventureSession, mode: GuidanceMode = 'guided') {
  const definition = adventureDefinition(session.id)!, view = getAdventureView(session), copy = BRIEFINGS[session.id]
  const actions = view.actions.map(action => presentAction(session, action))
  const objective = view.objective
  const actionId = objective ? INVESTIGATIONS[session.id]?.[objective.id] ?? null : null
  const investigation = actions.find(action => action.id === actionId)
  const target = objective && session.status === 'active' ? {
    stationId: objective.stationId,
    actionId: investigation?.enabled ? investigation.id : null,
    reason: investigation ? investigation.description : `Review the evidence at ${getStation(objective.stationId)?.name ?? 'this station'}, then choose an action justified by what you observed.`,
  } : null
  return {
    mode, briefing: { title: definition.title, happened: copy.happened, symptoms: symptoms(session), objective: copy.objective, firstStationId: copy.firstStationId, tools: copy.toolStationIds.map(id => `${getStation(id)?.name ?? id}: ${technologiesForStation(id).slice(0, 3).map(technology => technology.name).join(', ')}`) },
    checklist: view.objectives.map(item => ({ id: item.id, title: item.title, stationId: item.stationId, completed: item.completed, current: item.id === objective?.id })),
    target, actions,
    actionGroups: { inspect: actions.filter(action => action.kind === 'inspect'), decide: actions.filter(action => action.kind === 'decision' || action.kind === 'repair'), verify: actions.filter(action => action.kind === 'verify') },
    showChecklist: mode === 'guided', showNavigation: mode === 'guided', showPrompts: mode === 'guided',
  }
}

/** Glossary only: the evidence value remains the exact engine snapshot. */
export function evidenceExplanation(label: string): string | null {
  if (/digest/i.test(label)) return 'A digest identifies the exact image bytes. Compare digests to establish whether two environments run the same artifact.'
  if (/replica|ready pod|readiness/i.test(label)) return 'A ready replica can receive Service traffic. A running process or a synchronized manifest alone does not establish readiness.'
  if (/selfheal|self.heal|automated sync/i.test(label)) return 'Automated sync applies new Git revisions. Self-healing separately controls reconciliation of live-only drift.'
  if (/revision|git|argo/i.test(label)) return 'Compare the reviewed desired revision with the mirrored and applied revisions. Agreement establishes synchronization, not necessarily application health.'
  if (/latency/i.test(label)) return 'Latency measures how long a request takes. Correlate it with errors, traffic and logs before choosing a cause.'
  if (/5xx|error rate|request errors/i.test(label)) return 'HTTP 5xx indicates failed server-side requests. The rate describes a symptom; correlated evidence is needed to identify its cause.'
  if (/pool active/i.test(label)) return 'Active connections consume the available pool capacity. Compare utilization with timestamps and application logs.'
  if (/memory|capacity/i.test(label)) return 'The scheduler compares declared requests with allocatable resources. A resource request differs from measured usage.'
  if (/rpo/i.test(label) && /rto/i.test(label)) return 'RPO is the acceptable amount of lost history; RTO is the time target for restoring service. Backup age and recovery duration answer different questions.'
  if (/rpo|recovery point/i.test(label)) return 'RPO is the acceptable amount of lost history. Check the age and consistency of the candidate backup.'
  if (/rto|recovery time/i.test(label)) return 'RTO is the target time to restore service after loss. It is separate from the age of the recovered data.'
  if (/object|dependenc/i.test(label)) return 'Database records can reference separate object versions. Both must be restored consistently before traffic returns.'
  if (/timestamp|began at|ms ·/i.test(label)) return 'Times use the same simulated mission clock. Negative times describe events before the mission began.'
  if (/threshold|rule/i.test(label)) return 'An alert rule compares observations with a threshold. Clearing its notification does not repair the underlying condition.'
  return null
}
export function formatEvidenceTime(timestamp: number, startedAt = 0): string {
  const delta = Number.isFinite(timestamp - startedAt) ? timestamp - startedAt : 0
  const absolute = Math.abs(delta)
  const minutes = Math.floor(absolute / 60000), seconds = Math.floor(absolute / 1000) % 60, milliseconds = Math.floor(absolute % 1000)
  return `T${delta < 0 ? '−' : '+'}${minutes}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`
}

export type StuckObservation = { objectiveKey: string; progressKey: string; nowMs: number; invalidCount: number; interaction?: { id: number; related: boolean } }
export type StuckContext = { running: boolean; replaying: boolean; cinematic: boolean; waiting: boolean; mode: GuidanceMode; visible?: boolean }
export type StuckState = { objectiveKey: string; progressKey: string; lastProgressAt: number; invalidBaseline: number; invalidCount: number; unrelatedVisits: number; lastInteractionId: number | null; dismissedKeys: string[] }
const safeTime = (value: number) => Number.isFinite(value) ? Math.max(0, value) : 0
const helpEligible = (context: StuckContext) => context.running && !context.replaying && !context.cinematic && !context.waiting && context.visible !== false && context.mode === 'guided'
export function createStuckState(observation: StuckObservation): StuckState {
  return { objectiveKey: observation.objectiveKey, progressKey: observation.progressKey, lastProgressAt: safeTime(observation.nowMs), invalidBaseline: observation.invalidCount, invalidCount: observation.invalidCount, unrelatedVisits: 0, lastInteractionId: observation.interaction?.id ?? null, dismissedKeys: [] }
}
/** Caller supplies a monotonic UI clock; this tracker never writes an adventure command. */
export function updateStuckState(previous: StuckState, observation: StuckObservation, context: StuckContext): StuckState {
  const changed = previous.objectiveKey !== observation.objectiveKey || previous.progressKey !== observation.progressKey
  if (changed) return { ...createStuckState(observation), dismissedKeys: previous.dismissedKeys }
  const time = Math.max(previous.lastProgressAt, safeTime(observation.nowMs))
  const newInteraction = observation.interaction && observation.interaction.id !== previous.lastInteractionId
  return { ...previous, invalidCount: observation.invalidCount,
    lastProgressAt: helpEligible(context) ? previous.lastProgressAt : time,
    invalidBaseline: helpEligible(context) ? previous.invalidBaseline : observation.invalidCount,
    unrelatedVisits: !helpEligible(context) ? 0 : previous.unrelatedVisits + (newInteraction && !observation.interaction!.related ? 1 : 0),
    lastInteractionId: observation.interaction?.id ?? previous.lastInteractionId,
  }
}
export function shouldOfferHelp(state: StuckState, context: StuckContext, nowMs: number): boolean {
  return helpEligible(context) && !state.dismissedKeys.includes(state.objectiveKey) && (
    state.invalidCount - state.invalidBaseline >= 3 || state.unrelatedVisits >= 4 || safeTime(nowMs) - state.lastProgressAt >= 90_000
  )
}
export function dismissStuckHelp(state: StuckState): StuckState {
  return state.dismissedKeys.includes(state.objectiveKey) ? state : { ...state, dismissedKeys: [...state.dismissedKeys, state.objectiveKey].slice(-64) }
}
