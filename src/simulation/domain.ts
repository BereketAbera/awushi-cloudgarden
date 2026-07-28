/** Pure, serializable infrastructure state. Every value is simulated locally. */
export type EnvironmentId = 'development' | 'production'
export type SimulationStatus = 'idle' | 'running' | 'waiting-approval' | 'succeeded' | 'failed' | 'retrying' | 'cancelled'
export type ScenarioId = 'healthy' | 'tests-fail' | 'security-fail' | 'rollout-fail'
export type CheckStatus = 'pending' | 'running' | 'passed' | 'failed' | 'cancelled'
export type VisualKind = 'code' | 'image' | 'config' | 'sync' | 'telemetry' | 'approval' | 'failure' | 'recovery'
export type StageId = 'push' | 'ci-start' | 'quality' | 'security' | 'build' | 'publish' | 'pull-request' | 'approval' | 'promote' | 'configuration' | 'render-manifests' | 'gitops-commit' | 'detect' | 'sync' | 'rollout' | 'ready' | 'service' | 'ingress' | 'metrics' | 'logs' | 'dashboard' | 'alerts'
export type StageDefinition = {
  id: StageId; title: string; stationId: string; actor: 'human' | 'automation'; durationMs: number; description: string
  fromStationId?: string; toStationId?: string; kind?: VisualKind
}
export type SimulationEvent = {
  id: number; runId: number; timestamp: number; environment: EnvironmentId
  type: 'started' | 'stage-started' | 'stage-completed' | 'approval-required' | 'approved' | 'failed' | 'retrying' | 'cancelled' | 'succeeded' | 'backup-created' | 'restore-completed' | 'operation' | 'observation'
  stageId: StageId | null; message: string; fromStationId?: string; toStationId?: string; kind?: VisualKind
  visual?: { kind: VisualKind; fromStationId: string; toStationId: string }
}
export type PodState = { id: string; revision: number; digest: string; ready: boolean; status: 'old' | 'starting' | 'ready' }
export type EnvironmentState = {
  id: EnvironmentId; namespace: string; cluster: 'kind-awushi'; config: { replicas: number; mode: string; host: string }
  secretRef: string; secretVersion: number; secretsSynced: boolean; policiesApplied: boolean
  desiredImageDigest: string | null; activeImageDigest: string; version: string; deploymentRevision: number
  desiredRevision: string | null; appliedRevision: string | null; gitMirrorRevision: string | null
  syncStatus: 'Synced' | 'OutOfSync' | 'Syncing'; health: 'Healthy' | 'Progressing' | 'Degraded'
  desiredReplicas: number; availableReplicas: number; updatedReplicas: number; pods: PodState[]
  /** Ready Pods carried into a rollout can include several previously applied digests. */
  rollout: { targetRevision: number; sourcePods: PodState[] }
  manifestsRendered: boolean; serviceReady: boolean; ingressReady: boolean
  metrics: { collected: boolean; requestsPerSecond: number; errorRate: number; latencyMs: number; availableReplicas: number }
  logs: { timestamp: number; level: 'info' | 'warning' | 'error'; message: string }[]
  dashboardReady: boolean; alert: 'inactive' | 'pending' | 'firing' | 'resolved'
  operations?: OperationalState
  data: { postgres: 'ready' | 'corrupt' | 'restoring'; valkey: 'ready'; rabbitmq: 'ready'; objectStorage: 'ready' | 'missing' | 'restoring'; backup: { id: string; timestamp: number; deploymentRevision: number; records: number } | null; restoredBackupId: string | null; recoveredRecords: number | null; records: number }
}
export type InfrastructureState = {
  github: { commit: string | null; pullRequest: 'none' | 'open' | 'merged' | 'cancelled'; approvedBy: string | null }
  ci: { status: CheckStatus; lint: CheckStatus; tests: CheckStatus; security: CheckStatus; build: CheckStatus; imageScan: CheckStatus; canAccessCluster: false }
  registry: { imageDigest: string | null; version: string | null; ghcrAvailable: boolean; localAvailable: boolean; localDigest: string | null; promotion: 'pending' | 'copied'; cache: 'cold' | 'warm' }
  environments: Record<EnvironmentId, EnvironmentState>
}
export type SimulationState = {
  version: 1; status: SimulationStatus; environment: EnvironmentId; scenario: ScenarioId; runId: number
  stageId: StageId | null; stageIndex: number; stageStartedAt: number; completedStages: StageId[]
  /** activeImageDigest is the current run candidate; each environment owns its serving digest. */
  history: SimulationEvent[]; eventSequence: number; activeImageDigest: string | null; infra: InfrastructureState
  error: string | null; clock: number; repaired: boolean
}
export type SimulationCommand =
  | { type: 'start'; environment: EnvironmentId; scenario?: ScenarioId }
  | { type: 'promote-existing'; environment: 'production'; source: 'development'; digest: string }
  | { type: 'approve' } | { type: 'retry' } | { type: 'cancel' } | { type: 'reset' }
  | { type: 'backup'; environment: EnvironmentId } | { type: 'restore'; environment: EnvironmentId }
export type StateField = { label: string; value: string; tone?: 'neutral' | 'good' | 'warning' | 'bad' }
export const ENVIRONMENTS: readonly EnvironmentId[] = ['development', 'production']
export const SCENARIOS: readonly { id: ScenarioId; name: string; description: string }[] = [
  { id: 'healthy', name: 'A healthy delivery', description: 'Build, approve, promote and reconcile a new release.' },
  { id: 'tests-fail', name: 'A failing test', description: 'A regression stops CI before an image can be published.' },
  { id: 'security-fail', name: 'A security finding', description: 'A detected test credential blocks delivery until repaired.' },
  { id: 'rollout-fail', name: 'A readiness failure', description: 'A new Pod fails its readiness check; the old healthy version keeps serving.' },
]

export type PodIssueCause = 'transient' | 'image' | 'readiness' | 'resources'
export type BackupPoint = { id: string; label: string; ageMinutes: number; consistent: boolean; records: number; objects: number; checksum: string; location: 'same-host'; timestamp: number }
export type OperationalState = {
  pod?: { cause: PodIssueCause; beganAt: number; recoverAt: number | null; corrected: boolean; restartCount: number; imageReference: string; readinessPath: string; reason: string; event: string; requestMi: number; allocatableMi: number }
  drift?: { desiredReplicas: number; liveReplicas: number; selfHeal: boolean; detectedAt: number; reconcileAt: number | null; corrected: boolean }
  incident?: { beganAt: number; poolLimit: number; reviewedPoolLimit: number; diagnosis: string | null; corrected: boolean; verifyAt: number | null; recovered: boolean }
  recovery?: { lossAt: number; startedAt: number | null; recoveredAt: number | null; rpoMinutes: number; targetRtoMs: number; snapshots: BackupPoint[]; selectedId: string | null; databaseRestored: boolean; objectsRestored: boolean; validated: boolean; recoveredObjects: number }
}
