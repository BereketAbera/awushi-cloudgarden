/** Operational transitions shared by lessons. These mutate the same infrastructure model as delivery. */
import type { EnvironmentId, EnvironmentState, PodIssueCause, SimulationState, StateField } from './domain'
import { emitOperation } from './engine'
export type OperationSeed = { type: 'pod'; cause: PodIssueCause } | { type: 'drift'; selfHeal: boolean } | { type: 'incident' } | { type: 'data-loss' }
export type OperationAction = 'restart-pod' | 'wait-controller' | 'repair-image' | 'repair-readiness' | 'repair-resources' | 'sync-git' | 'enable-self-heal' | 'wait-self-heal' | 'patch-live' | 'accept-live' | 'diagnose-pool' | 'diagnose-ingress' | 'diagnose-image' | 'repair-pool' | 'rollback-image' | 'silence-alert' | 'snapshot-recent' | 'snapshot-verified' | 'snapshot-old' | 'restore-database' | 'restore-objects' | 'validate-restore'
const copy = (state: SimulationState) => structuredClone(state)
const field = (label: string, value: string | number): StateField => ({ label, value: String(value) })
function healthyPods(env: EnvironmentState) {
  env.pods = Array.from({ length: env.desiredReplicas }, (_, i) => ({ id: `${env.id}-recovered-${env.deploymentRevision}-${i}`, revision: env.deploymentRevision, digest: env.activeImageDigest, ready: true, status: 'ready' }))
  env.availableReplicas = env.desiredReplicas; env.updatedReplicas = env.desiredReplicas; env.health = 'Healthy'; env.serviceReady = true; env.ingressReady = true
  env.metrics.availableReplicas = env.availableReplicas
}
const podReport: Record<PodIssueCause, {reason:string;event:string}> = {
  transient: { reason:'Terminated / waiting for restart', event:'Process exited once (exit 1). restartPolicy=Always; kubelet retry is scheduled. No persistent config error.' },
  image: { reason:'ImagePullBackOff', event:'Failed to pull application:missing: manifest unknown. The approved digest is present in the local registry.' },
  readiness: { reason:'Running / Ready=False', event:'Readiness GET /ready returned 404; application exposes /health/ready. Liveness succeeds; process is not restarting.' },
  resources: { reason:'Pending / Unschedulable', event:'FailedScheduling: 4096Mi request exceeds 1024Mi available capacity. Measured working set is 256Mi; reviewed request is 512Mi.' },
}
export function seedOperation(state: SimulationState, seed: OperationSeed, now: number, environment: EnvironmentId = 'development'): SimulationState {
  const next = copy(state), env = next.infra.environments[environment]
  next.clock = now; next.environment = environment; env.operations = {}
  if (seed.type === 'pod') {
    env.operations.pod = { cause:seed.cause,beganAt:now,recoverAt:seed.cause === 'transient' ? now + 8000 : null,corrected:false,restartCount:0,imageReference:seed.cause==='image'?'application:missing':env.activeImageDigest,readinessPath:seed.cause==='readiness'?'/ready':'/health/ready',...podReport[seed.cause],requestMi:seed.cause === 'resources' ? 4096 : 512,allocatableMi:1024 }
    env.pods[0].ready=false;env.pods[0].status='starting';env.availableReplicas--;env.health='Degraded';env.metrics={collected:true,requestsPerSecond:12,errorRate:0,latencyMs:55,availableReplicas:env.availableReplicas};env.alert='firing'
    env.logs.push({timestamp:now,level:'warning',message:podReport[seed.cause].event})
    emitOperation(next, podReport[seed.cause].event, now, environment, 'kubernetes','failure')
  } else if (seed.type === 'drift') {
    env.operations.drift={desiredReplicas:env.config.replicas,liveReplicas:1,selfHeal:seed.selfHeal,detectedAt:now,reconcileAt:seed.selfHeal ? now + 8000 : null,corrected:false}
    env.desiredReplicas=1;healthyPods(env);env.syncStatus='OutOfSync'
    emitOperation(next,`Manual replica override: Git ${env.config.replicas}, live 1. Automated self-heal ${seed.selfHeal ? 'enabled' : 'disabled'}.`,now,environment,'gitops','config')
  } else if (seed.type === 'incident') {
    env.operations.incident={beganAt:now-200,poolLimit:1,reviewedPoolLimit:8,diagnosis:null,corrected:false,verifyAt:null,recovered:false}
    env.metrics={collected:true,requestsPerSecond:36,errorRate:24,latencyMs:900,availableReplicas:env.availableReplicas};env.alert='firing';env.dashboardReady=true
    env.logs=[{timestamp:now-200,level:'warning',message:'config revision pool-2 applied: DB_POOL_MAX 8 → 1. Application image digest unchanged.'},{timestamp:now-100,level:'error',message:'request_id=aw-42 status=503 database pool acquisition timeout; active_connections=1 limit=1; Traefik forwarded request.'},{timestamp:now,level:'warning',message:'HTTP5xxHigh: errors=24%, latency=900ms, rate=36 req/s. Correlation: pool-2 configuration.'}]
    // Seed evidence uses a known initial timeline; no wall-clock or random samples.
    emitOperation(next,'HTTP5xxHigh: database connection acquisition timeouts after pool-2 configuration.',now,environment,'alerts','failure')
  } else {
    env.operations.recovery={lossAt:now,startedAt:null,recoveredAt:null,rpoMinutes:5,targetRtoMs:300000,selectedId:null,databaseRestored:false,objectsRestored:false,validated:false,recoveredObjects:0,snapshots:[
      {id:'recent',label:'Newest · 1 minute ago',ageMinutes:1,consistent:false,records:40,objects:30,checksum:'FAILED / captured corruption',location:'same-host',timestamp:now-60000},
      {id:'verified',label:'Verified · 2 minutes ago',ageMinutes:2,consistent:true,records:98,objects:98,checksum:'Verified DB + object inventory',location:'same-host',timestamp:now-120000},
      {id:'old',label:'Older · 20 minutes ago',ageMinutes:20,consistent:true,records:80,objects:80,checksum:'Verified DB + object inventory',location:'same-host',timestamp:now-1200000},
    ]}
    env.data.postgres='corrupt';env.data.objectStorage='missing';env.data.records=40;env.health='Degraded';env.serviceReady=false;env.ingressReady=false;env.alert='firing'
    emitOperation(next,'Data integrity failure: 40 records remain; matching object versions are missing. Traffic is paused.',now,environment,'database','failure')
  }
  return next
}
export function tickOperations(state: SimulationState, now: number): SimulationState {
  if (!Number.isFinite(now) || now < state.clock) return state
  let next = state
  for (const environment of ['development','production'] as const) {
    const ops = next.infra.environments[environment].operations
    const podDue=ops?.pod && !ops.pod.corrected && ops.pod.recoverAt !== null && now >= ops.pod.recoverAt
    const driftDue=ops?.drift && !ops.drift.corrected && ops.drift.reconcileAt !== null && now >= ops.drift.reconcileAt
    const incidentDue=ops?.incident && ops.incident.corrected && !ops.incident.recovered && ops.incident.verifyAt !== null && now >= ops.incident.verifyAt
    if (!podDue && !driftDue && !incidentDue) continue
    if (next===state) next=copy(state)
    const env=next.infra.environments[environment], operational=env.operations!
    if (podDue) {
      const pod=operational.pod!,at=pod.recoverAt!;pod.corrected=true;pod.restartCount++;healthyPods(env);env.alert='resolved'
      env.logs.push({timestamp:at,level:'info',message:'Kubelet restarted the one-time crashed container; readiness now passes.'})
      emitOperation(next,'Automatic kubelet recovery succeeded; the transient cause did not recur.',at,environment,'kubernetes','recovery')
    }
    if (driftDue) {
      const drift=operational.drift!,at=drift.reconcileAt!;drift.corrected=true;drift.liveReplicas=drift.desiredReplicas;env.desiredReplicas=drift.desiredReplicas;healthyPods(env);env.syncStatus='Synced'
      emitOperation(next,'Argo reconciled the reviewed Git replica count; live state now agrees.',at,environment,'gitops','sync')
    }
    if (incidentDue) {
      const incident=operational.incident!,at=incident.verifyAt!;incident.recovered=true;env.metrics={...env.metrics,errorRate:0,latencyMs:42};env.alert='resolved';env.health='Healthy'
      env.logs.push({timestamp:at,level:'info',message:'request_id=aw-43 status=200 pool_limit=8; recovery window errors=0%, latency=42ms, rate=36 req/s.'})
      emitOperation(next,'Fresh request observations confirm recovery; the HTTP5xxHigh alert resolved.',at,environment,'observability','recovery')
    }
  }
  if (next!==state) next.clock=next.history.at(-1)!.timestamp
  return next
}
export function applyOperation(state: SimulationState, action: OperationAction, now: number, environment: EnvironmentId = 'development'): {state:SimulationState;accepted:boolean;message:string} {
  if (!Number.isFinite(now) || now<state.clock) return {state,accepted:false,message:'The action clock must be finite and monotonic.'}
  const next=copy(state),env=next.infra.environments[environment],ops=env.operations
  let accepted=false,message='This operation has no applicable infrastructure target.',station='kubernetes',kind:'failure'|'recovery'|'sync'|'telemetry'|'config'='config'
  if (ops?.pod && ['restart-pod','wait-controller','repair-image','repair-readiness','repair-resources'].includes(action)) {
    const pod=ops.pod
    if (pod.corrected && action!=='wait-controller') {message='The observed fault is already corrected. Verify readiness and endpoints before making another change.'}
    else if (action==='wait-controller') {accepted=pod.cause==='transient';message=accepted?'The one-time crash has a valid restart policy. Observe the kubelet retry and then verify readiness.':'This is a persistent configuration problem. Waiting cannot invent a correct image, probe or schedulable request.'}
    else if (action==='restart-pod') {accepted=false;message=pod.cause==='transient'?'The kubelet already schedules a restart. Inspect and observe that controller recovery instead of adding a redundant intervention.':'Restarting leaves the incorrect desired configuration unchanged. The same failure remains.'}
    else if ((action==='repair-image'&&pod.cause==='image')||(action==='repair-readiness'&&pod.cause==='readiness')||(action==='repair-resources'&&pod.cause==='resources')) {
      accepted=true;pod.corrected=true;pod.recoverAt=null;if(pod.cause==='image')pod.imageReference=env.activeImageDigest;if(pod.cause==='readiness')pod.readinessPath='/health/ready';if(pod.cause==='resources')pod.requestMi=512;healthyPods(env);env.alert='resolved';kind='recovery'
      message=pod.cause==='image'?'Applied the approved available digest to desired configuration; image pull and readiness succeed.':pod.cause==='readiness'?'Corrected the readiness path to /health/ready; the running container is now a ready endpoint.':'Applied the measured 512Mi request within 1024Mi capacity; scheduling and readiness succeed.'
    } else message='That correction does not match the observed Pod cause. Read the event and resource evidence before changing configuration.'
  } else if (ops?.drift && ['sync-git','enable-self-heal','wait-self-heal','patch-live','accept-live'].includes(action)) {
    const drift=ops.drift;station='gitops'
    if(action==='patch-live'){drift.liveReplicas=3;drift.corrected=false;env.desiredReplicas=3;healthyPods(env);env.syncStatus='OutOfSync';if(drift.selfHeal)drift.reconcileAt=now+4000;message='The live patch changed replicas to 3, but Git still requests 2. Drift persists; a reviewed Git change or reconciliation is needed.'}
    else if(action==='accept-live')message='The proposed one-replica Git change fails this lesson’s two-replica availability requirement. Review capacity before accepting live drift as desired state.'
    else if(action==='wait-self-heal'){accepted=drift.selfHeal;message=accepted?'Automated sync and selfHeal are enabled. The controller will reconcile this live-only drift.':'Self-heal is disabled. Time alone cannot repair this drift; choose manual sync or enable the policy explicitly.'}
    else {accepted=true;drift.selfHeal=action==='enable-self-heal'||drift.selfHeal;drift.reconcileAt=now+2400;drift.corrected=false;env.syncStatus='Syncing';kind='sync';message=action==='enable-self-heal'?'Enabled automated sync with selfHeal; reviewed Git configuration will be reconciled.':'Requested a manual sync of the reviewed Git configuration.'}
  } else if(ops?.incident && ['diagnose-pool','diagnose-ingress','diagnose-image','repair-pool','restart-pod','rollback-image','silence-alert'].includes(action)) {
    const incident=ops.incident;station='observability'
    if(incident.recovered){message='Fresh observations already show recovery. Verify and close the incident rather than applying another correction.'}
    else if(action.startsWith('diagnose-')){incident.diagnosis=action.slice(9);accepted=action==='diagnose-pool';message=accepted?'The evidence agrees: pool capacity changed from 8 to 1 immediately before acquisition timeouts and HTTP 503s.':'That diagnosis conflicts with the evidence: Traefik forwards requests and the image digest did not change. The pool configuration did.'}
    else if(action==='repair-pool'){accepted=incident.diagnosis==='pool';if(accepted){incident.poolLimit=8;incident.corrected=true;incident.verifyAt=now+4000;kind='recovery';env.logs.push({timestamp:now,level:'info',message:'Reviewed correction applied: DB_POOL_MAX 1 → 8. Starting fresh request observation window.'})}message=accepted?'Restored the reviewed pool limit. Wait for fresh metrics and requests before declaring recovery.':'First establish a diagnosis using the correlated alert, metrics and logs.'}
    else message=action==='rollback-image'?'The image did not change; its rollback leaves the independently managed pool limit at 1. Errors persist.':action==='silence-alert'?'Silencing a notification cannot repair failing requests. The incident remains active.':'Restarting recreates the same pool configuration. Connection timeouts continue.'
  } else if(ops?.recovery && ['snapshot-recent','snapshot-verified','snapshot-old','restore-database','restore-objects','validate-restore'].includes(action)) {
    const recovery=ops.recovery;station='recovery'
    if(action.startsWith('snapshot-')){
      const snapshot=recovery.snapshots.find(item=>item.id===action.slice(9))!
      accepted=snapshot.consistent&&snapshot.ageMinutes<=recovery.rpoMinutes
      if(accepted&&recovery.selectedId!==snapshot.id){recovery.selectedId=snapshot.id;recovery.databaseRestored=false;recovery.objectsRestored=false;recovery.validated=false;env.data.recoveredRecords=null;recovery.recoveredObjects=0}
      message=!snapshot.consistent?'The newest snapshot captured corruption and fails consistency checks. It is not a safe recovery point.':snapshot.ageMinutes>recovery.rpoMinutes?'This consistent snapshot loses 20 minutes, exceeding the stated five-minute RPO. A verified two-minute snapshot is available.':'Selected the consistent two-minute snapshot and matching object inventory; it meets the five-minute RPO.'
    } else {
      const snapshot=recovery.snapshots.find(item=>item.id===recovery.selectedId)
      if(!snapshot)message='Select a verified recovery point before restoring.'
      else if(action==='restore-database'){accepted=true;recovery.startedAt??=now;recovery.databaseRestored=true;env.data.recoveredRecords=snapshot.records;env.data.restoredBackupId=snapshot.id;kind='recovery';message='Restored PostgreSQL into an isolated target. The matching object versions still need separate recovery.'}
      else if(action==='restore-objects'){accepted=recovery.databaseRestored;if(accepted){recovery.objectsRestored=true;recovery.recoveredObjects=snapshot.objects;kind='recovery'}message=accepted?'Restored the matching object versions using the snapshot inventory. Validate both data sets before cutover.':'Restore the isolated database target first, then use its inventory to recover matching objects.'}
      else {accepted=recovery.databaseRestored&&recovery.objectsRestored&&env.data.recoveredRecords===snapshot.records&&recovery.recoveredObjects===snapshot.objects&&snapshot.consistent
        if(accepted){recovery.validated=true;recovery.recoveredAt=now;env.data.records=snapshot.records;env.data.postgres='ready';env.data.objectStorage='ready';env.health='Healthy';env.serviceReady=true;env.ingressReady=true;env.alert='resolved';kind='recovery'}
        message=accepted?'Checksums, row counts and object references passed. The validated recovery target now serves traffic.':'Validation failed: the recovered database and matching objects must both be present and consistent. Traffic stays paused.'
      }
    }
  }
  next.clock=now;emitOperation(next,message,now,environment,station,accepted?kind:'failure')
  return {state:next,accepted,message}
}
export function operationalEvidence(state: SimulationState, kind: string, environment: EnvironmentId = 'development'): StateField[] {
  const env=state.infra.environments[environment],ops=env.operations
  if(kind==='pod'&&ops?.pod){const pod=ops.pod;return [field('Current status',pod.corrected?'Ready':pod.reason),field('Initial event',pod.event),field('Container restarts',pod.restartCount),field('Configured image',pod.imageReference),field('Readiness path',pod.readinessPath),field('Ready replicas',`${env.availableReplicas}/${env.desiredReplicas}`),field('Memory request / capacity',`${pod.requestMi}Mi / ${pod.allocatableMi}Mi`),field('Request errors',`${env.metrics.errorRate}%`),field('Readiness',pod.corrected?'Passing':'Not passing')]}
  if(kind==='git'&&ops?.drift)return [field('Git revision',env.desiredRevision??'baseline'),field('Reviewed replicas',ops.drift.desiredReplicas),field('Image digest',env.activeImageDigest),field('Local mirror',env.gitMirrorRevision??'baseline')]
  if(kind==='live'&&ops?.drift)return [field('Live replicas',ops.drift.liveReplicas),field('Git replicas',ops.drift.desiredReplicas),field('Argo status',env.syncStatus),field('Automated sync + selfHeal',ops.drift.selfHeal?'Enabled':'Disabled'),field('Ready Pods',env.availableReplicas)]
  if(kind==='alert'&&ops?.incident)return [field('Rule','HTTP5xxHigh'),field('State',env.alert),field('Began at (simulation ms)',ops.incident.beganAt),field('Threshold','5xx > 5%'),field('Observed error rate',`${env.metrics.errorRate}%`)]
  if(kind==='metrics'&&ops?.incident)return [field('Prometheus / Grafana','Same environment and incident timeline'),field('Timestamp (simulation ms)',ops.incident.recovered?ops.incident.verifyAt!:ops.incident.beganAt+200),field('Request rate',`${env.metrics.requestsPerSecond}/s`),field('HTTP 5xx',`${env.metrics.errorRate}%`),field('Latency',`${env.metrics.latencyMs}ms`),field('Pool active / limit',ops.incident.recovered?`2 / ${ops.incident.poolLimit}`:`1 / ${ops.incident.poolLimit}`),field('Healthy Pod count',env.availableReplicas)]
  if(kind==='logs')return env.logs.map(entry=>field(`${entry.timestamp}ms · ${entry.level}`,entry.message))
  if(kind==='damage'&&ops?.recovery)return [field('PostgreSQL',env.data.postgres),field('Remaining records',env.data.records),field('Object versions',env.data.objectStorage),field('Traffic',env.serviceReady?'Serving':'Paused'),field('Recovery dependency','Database metadata references matching object versions')]
  if(kind==='snapshots'&&ops?.recovery)return [field('RPO / RTO target',`${ops.recovery.rpoMinutes} minutes / ${ops.recovery.targetRtoMs/60000} minutes`),...ops.recovery.snapshots.map(snapshot=>field(snapshot.label,`${snapshot.records} records / ${snapshot.objects} objects · ${snapshot.checksum} · ${snapshot.location}`)),field('Host-loss limitation','All illustrated backups share this host; they do not protect against losing the host. An independent tested off-host copy is required.')]
  return []
}
