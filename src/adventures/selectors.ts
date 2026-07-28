import type { AdventureAction, AdventureSession, AdventureView, CompletionSummary } from './domain'
import { adventureDefinition } from './catalog'
import type { OperationAction } from '../simulation/operations'
const action=(id:string,label:string,description:string,stationId:string,kind:AdventureAction['kind']='decision'):AdventureAction=>({id,label,description,stationId,kind,enabled:true})
const operationalActions: Record<string,AdventureAction> = {
 'inspect-pod':action('inspect-pod','Inspect Pod report','Read status, events, resource requests and metrics.','kubernetes','inspect'),
 'restart-pod':action('restart-pod','Restart the Pod','Consider whether the same configuration would fail again.','kubernetes'),
 'wait-controller':action('wait-controller','Observe controller recovery','Use the kubelet restart policy for a one-time crash.','kubernetes'),
 'repair-image':action('repair-image','Fix the image reference','Apply the approved, available image digest.','registry','repair'),
 'repair-readiness':action('repair-readiness','Fix the readiness path','Align the probe with the endpoint the application exposes.','kubernetes','repair'),
 'repair-resources':action('repair-resources','Fix the resource request','Use the measured 512Mi request within available capacity.','infrastructure','repair'),
 'verify-pod':action('verify-pod','Verify Pod recovery','Check readiness and the Service endpoints.','network','verify'),
 'inspect-git':action('inspect-git','Inspect desired Git state','Read the reviewed configuration and reachable mirror.','gitops','inspect'),
 'inspect-live':action('inspect-live','Inspect live cluster diff','Compare replicas and inspect the sync policy.','kubernetes','inspect'),
 'sync-git':action('sync-git','Sync reviewed Git state','Request a manual reconciliation of the reviewed configuration.','gitops','repair'),
 'enable-self-heal':action('enable-self-heal','Enable automatic self-heal','Explicitly enable automated synchronization and live drift correction.','gitops','repair'),
 'wait-self-heal':action('wait-self-heal','Observe self-healing','Wait for the policy already configured on this application.','gitops'),
 'patch-live':action('patch-live','Patch live replicas to 3','Try a live-only patch and inspect whether Git now agrees.','kubernetes'),
 'accept-live':action('accept-live','Accept one replica in Git','Consider this change against the two-replica availability requirement.','gitops'),
 'verify-drift':action('verify-drift','Verify convergence','Check Git, live replicas, sync and health together.','kubernetes','verify'),
 'inspect-alert':action('inspect-alert','Inspect incident alert','Read the rule, start time and current condition.','alerts','inspect'),
 'inspect-metrics':action('inspect-metrics','Inspect metrics and Grafana','Correlate request rate, errors, latency and pool saturation.','observability','inspect'),
 'inspect-logs':action('inspect-logs','Inspect Loki logs','Read timestamped configuration and request events.','observability','inspect'),
 'diagnose-pool':action('diagnose-pool','Diagnose database pool exhaustion','Match connection timeouts to the pool configuration change.','database'),
 'diagnose-ingress':action('diagnose-ingress','Diagnose an ingress fault','Test whether routing failed before the application received requests.','network'),
 'diagnose-image':action('diagnose-image','Diagnose a bad image release','Test whether a newly deployed binary caused the errors.','registry'),
 'repair-pool':action('repair-pool','Restore the reviewed pool limit','Correct the independent configuration from 1 to 8.','infrastructure','repair'),
 'rollback-image':action('rollback-image','Roll back the image','Consider whether an image rollback also reverses configuration.','registry'),
 'silence-alert':action('silence-alert','Silence the alert','Consider whether notification state fixes failing requests.','alerts'),
 'verify-incident':action('verify-incident','Verify incident recovery','Read fresh request metrics, logs and alert resolution.','observability','verify'),
 'inspect-damage':action('inspect-damage','Inspect affected data','Identify the missing records and object dependencies.','database','inspect'),
 'inspect-snapshots':action('inspect-snapshots','Compare backup snapshots','Read age, consistency, inventory and storage location.','recovery','inspect'),
 'snapshot-recent':action('snapshot-recent','Choose newest snapshot','One minute old, but the integrity check failed.','recovery'),
 'snapshot-verified':action('snapshot-verified','Choose verified snapshot','Two minutes old with matching records and object inventory.','recovery'),
 'snapshot-old':action('snapshot-old','Choose older snapshot','Consistent but twenty minutes old.','recovery'),
 'restore-database':action('restore-database','Restore isolated database','Recover PostgreSQL into an isolated target.','recovery','repair'),
 'restore-objects':action('restore-objects','Restore matching objects','Recover the object versions referenced by the database snapshot.','messaging','repair'),
 'validate-restore':action('validate-restore','Validate and restore service','Verify counts, checksums and references before simulated cutover.','network','verify'),
}
export const OPERATION_ACTION_IDS = new Set<OperationAction>(['restart-pod','wait-controller','repair-image','repair-readiness','repair-resources','sync-git','enable-self-heal','wait-self-heal','patch-live','accept-live','diagnose-pool','diagnose-ingress','diagnose-image','repair-pool','rollback-image','silence-alert','snapshot-recent','snapshot-verified','snapshot-old','restore-database','restore-objects','validate-restore'])
export function adventureActions(session:AdventureSession):AdventureAction[] {
 if(session.status!=='active')return []
 const simulation=session.simulation
 if(session.id==='ship-release'||session.id==='promote-production'){
  const actions:AdventureAction[]=[]
  if(simulation.status==='idle')actions.push(action('push','Push a code change','Begin the development pipeline.','github'))
  else {
   actions.push(action('inspect-ci','Inspect CI results','Read the current quality, security and build gates.','ci','inspect'))
   if(simulation.status==='failed')actions.push(action('retry-ci','Retry unchanged CI','Observe why repeating a regression is not a repair.','ci'),action('repair-tests','Repair regression and retry','Fix the demonstrated behavior, then rerun its gate.','ci','repair'))
   actions.push(action('inspect-image','Inspect published image','Verify GHCR publication and record the immutable digest.','registry','inspect'))
   if(simulation.environment==='development'&&simulation.status!=='succeeded')actions.push(action('approve-release','Approve reviewed release','Authorize the candidate only after inspecting its successful checks and digest.','delivery'),action('reject-release','Reject this proposal','Hold the candidate for further review; it can still be repaired or approved.','delivery'))
   if(session.id==='ship-release')actions.push(action('inspect-gitops','Inspect GitOps reconciliation','Check the mirror, desired revision and applied state.','gitops','inspect'),action('verify-health','Verify rollout health','Check all replicas against the candidate digest.','kubernetes','verify'),action('verify-routing','Verify application routing','Trace Service endpoints and Traefik.','network','verify'),action('inspect-telemetry','Inspect release telemetry','Confirm request metrics and matching logs.','observability','inspect'))
   else if(simulation.environment==='development')actions.push(action('verify-development','Verify development health','Check the tested digest, healthy Pods and request path.','kubernetes','verify'),action('propose-production','Create production proposal','Promote the verified artifact without rebuilding it.','delivery'))
   else actions.push(action('review-production','Review production diff','Compare the production proposal with the verified development digest.','delivery','inspect'),action('approve-production','Approve production','Explicitly authorize this environment’s promotion.','delivery'),action('verify-production','Verify both environments','Confirm production rollout and unchanged development digest.','kubernetes','verify'))
  }
  return actions
 }
 const ids:Record<string,string[]>={
  'recover-pod':['inspect-pod','wait-controller','restart-pod','repair-image','repair-readiness','repair-resources','verify-pod'],
  'fix-drift':['inspect-git','inspect-live','sync-git','enable-self-heal','wait-self-heal','patch-live','accept-live','verify-drift'],
  'investigate-incident':['inspect-alert','inspect-metrics','inspect-logs','diagnose-pool','diagnose-ingress','diagnose-image','repair-pool','restart-pod','rollback-image','silence-alert','verify-incident'],
  'restore-backup':['inspect-damage','inspect-snapshots','snapshot-recent','snapshot-verified','snapshot-old','restore-database','restore-objects','validate-restore'],
 }
 return ids[session.id].map(id=>operationalActions[id])
}
function summary(session:AdventureSession):CompletionSummary {
 const definition=adventureDefinition(session.id)!,ops=session.simulation.infra.environments.development.operations
 let whyItWorked={
  'ship-release':'Repairing the regression made the quality gate pass, allowing a checked image to be published. Human approval authorized its digest, and GitOps reconciliation made that reviewed configuration live; readiness, routing and request observations confirmed it could serve traffic.',
  'recover-pod':'The chosen recovery addressed the cause recorded in the Pod report. Passing readiness then restored the workload’s eligibility for Service traffic.',
  'fix-drift':'The reviewed Git configuration remained the source of truth. Reconciliation restored its replica count, and checking both synchronization and readiness confirmed agreement with a healthy workload.',
  'promote-production':'The production proposal pinned the exact immutable image digest already verified in development, so no rebuild introduced an untested artifact. A separate approval applied production’s configuration; verification confirmed the same digest was healthy there while development’s digest and revision stayed unchanged.',
  'investigate-incident':'Restoring the pool limit from 1 to 8 removed the connection bottleneck identified by the shared log and metric timeline. Fresh successful requests, zero errors and lower latency then confirmed recovery and resolved the alert; the image and ingress had not caused the failure.',
  'restore-backup':'The consistent two-minute recovery point met the five-minute RPO. Restoring both PostgreSQL rows and their matching object versions satisfied the application’s dependencies; modeled checksum, count and reference checks passed before traffic switched to the recovered data.',
 }[session.id]
 if(ops?.pod)whyItWorked={
  transient:'The failure happened once and the container configuration was valid. The kubelet’s restartPolicy=Always restarted the exited process; passing readiness then made it eligible for Service traffic again.',
  image:'The approved digest identified an image already available in the registry. Correcting the missing image reference allowed the container to start and pass readiness; retrying the unavailable reference could not do that.',
  readiness:'The application was running, but its probe requested /ready instead of /health/ready. Correcting that path made readiness pass and restored the Service endpoint without restarting the container.',
  resources:'The 4096Mi request exceeded the available 1024Mi, so the scheduler could not place the Pod. The reviewed 512Mi request fit that capacity with headroom above the measured 256Mi working set, allowing scheduling and readiness to succeed.',
 }[ops.pod.cause]
 if(ops?.drift){
  const manual=[...session.decisions].reverse().find(decision=>decision.outcome==='accepted'&&['sync-git','enable-self-heal','wait-self-heal'].includes(decision.actionId))?.actionId==='sync-git'
  whyItWorked=manual?`The explicit manual sync applied Git’s reviewed two-replica configuration to the live cluster. Automatic self-heal was ${ops.drift.selfHeal?'enabled':'disabled'}; checking the live count, Synced status and ready Pods confirmed the requested reconciliation succeeded.`:ops.drift.selfHeal?'Automated sync with selfHeal was enabled, allowing Argo to correct the live-only replica change back to Git’s reviewed count of two. Matching live configuration, Synced status and ready Pods confirmed that the controller actually reconciled the drift.':'With self-heal disabled, live-only drift required an explicit sync of Git’s reviewed two-replica configuration. Comparing live state, Synced status and ready Pods established that the desired configuration had been restored.'
 }
 let rootCause:string|null=null
 if(session.id==='ship-release')rootCause='An automated regression test failed before any artifact was published.'
 if(ops?.pod)rootCause=ops.pod.event
 if(ops?.drift)rootCause='A manual replica edit changed live state without updating reviewed Git configuration.'
 if(ops?.incident)rootCause='DB_POOL_MAX was reduced from 8 to 1; connection acquisition timed out and requests returned HTTP 503.'
 if(ops?.recovery)rootCause='Database records and dependent object versions were corrupted or lost together.'
 const technologies:Record<AdventureSession['id'],string[]>={
 'ship-release':['GitHub Actions','GHCR','Argo CD','Kubernetes','Traefik','Prometheus','Loki'],
 'recover-pod':['Kubernetes Pods','Readiness probes','Image digests','Resource requests','Services'],
 'fix-drift':['GitOps repository','Local Git mirror','Argo CD','Deployments'],
 'promote-production':['Image digests','GitOps','Namespaces','Kubernetes','Human review'],
 'investigate-incident':['Prometheus','Grafana','Alloy','Loki','Alertmanager','PostgreSQL'],
 'restore-backup':['PostgreSQL','S3-compatible objects','Backup consistency','RPO','RTO'],
 }
 let details=definition.technicalDetails
 if(ops?.recovery?.recoveredAt!==null&&ops?.recovery?.recoveredAt!==undefined){const r=ops.recovery;details+=` Actual simulated recovery time from detected loss: ${Math.round((r.recoveredAt!-r.lossAt)/1000)} seconds; target ${r.targetRtoMs/1000} seconds. Selected recovery point: ${r.snapshots.find(x=>x.id===r.selectedId)?.ageMinutes} minutes before loss.`}
 return {title:definition.title,whatHappened:definition.summary,rootCause,decisions:session.decisions,technologies:technologies[session.id],whyItWorked,misconceptions:definition.misconceptions,technicalDetails:details}
}
export function getAdventureView(session:AdventureSession):AdventureView {
 const definition=adventureDefinition(session.id)!
 const objectives=definition.objectives.map(objective=>({id:objective.id,title:objective.title,description:objective.description,stationId:objective.stationId,completed:session.completedObjectives.includes(objective.id)}))
 const objective=objectives.find(item=>!item.completed)??null
 const current=definition.objectives.find(item=>item.id===objective?.id)
 const waiting=['running','retrying'].includes(session.simulation.status)||Boolean(Object.values(session.simulation.infra.environments).some(env=>{const ops=env.operations;return(ops?.pod?.recoverAt!==null&&ops?.pod?.recoverAt!==undefined&&!ops.pod.corrected)||(ops?.drift?.reconcileAt!==null&&ops?.drift?.reconcileAt!==undefined&&!ops.drift.corrected)||(ops?.incident?.verifyAt!==null&&ops?.incident?.verifyAt!==undefined&&!ops.incident.recovered)}))
 const lastDecision=session.decisions.at(-1),lastEvent=session.simulation.history.at(-1)
 const recentDecision=lastDecision&&lastDecision.timestamp>=(lastEvent?.timestamp??-Infinity)
 const inspecting=recentDecision&&(lastDecision.actionId.startsWith('inspect-')||lastDecision.actionId==='review-production')
 const reaction=session.status==='completed'?'Celebrating':recentDecision&&lastDecision.outcome==='rejected'?'Thinking':inspecting?'Curious':session.feedback.tone==='bad'||session.simulation.status==='failed'?'Worried':session.simulation.status==='waiting-approval'?'Thinking':waiting?'Determined':lastEvent?.visual?.kind==='failure'&&!lastDecision?(session.id==='investigate-incident'?'Surprised':'Worried'):session.feedback.tone==='good'?'Happy':'Curious'
 return {objective,objectives,actions:adventureActions(session),evidence:session.evidence,hints:session.hintsEnabled?Array.from(current?.hints??[]).slice(0,session.hintLevel):[],summary:summary(session),stationId:objective?.stationId??null,progress:{completed:objectives.filter(item=>item.completed).length,total:objectives.length},waiting,reaction}
}
