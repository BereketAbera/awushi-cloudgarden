import type { AdventureCommand, AdventureId, AdventureSession, AdventureVariant, Evidence } from './domain'
import { adventureDefinition, defaultAdventureVariant, validAdventureVariant } from './catalog'
import { adventureActions, OPERATION_ACTION_IDS } from './selectors'
import { createSimulation, reduceSimulation, stationSnapshot, tickSimulation } from '../simulation/engine'
import { applyOperation, operationalEvidence, seedOperation, tickOperations, type OperationAction } from '../simulation/operations'
import type { StateField } from '../simulation/domain'

export function parseAdventureCommand(value:unknown):AdventureCommand|null {
 if(!value||typeof value!=='object'||Array.isArray(value))return null
 const input=value as Record<string,unknown>
 if(input.type==='action'&&typeof input.actionId==='string'&&/^[a-z][a-z0-9-]{0,63}$/.test(input.actionId))return {type:'action',actionId:input.actionId}
 if(input.type==='hint'||input.type==='cancel')return {type:input.type}
 if(input.type==='set-hints'&&typeof input.enabled==='boolean')return {type:input.type,enabled:input.enabled}
 return null
}
export function createAdventure(id:AdventureId,now=0,variant?:AdventureVariant|null):AdventureSession {
 if(!adventureDefinition(id)||!validAdventureVariant(id,variant)||!Number.isFinite(now)||now<0)throw new RangeError('Unknown adventure, invalid variant or invalid initial clock.')
 const selected=variant??defaultAdventureVariant(id)
 let simulation=createSimulation(now)
 if(id==='recover-pod')simulation=seedOperation(simulation,{type:'pod',cause:selected as 'transient'|'image'|'readiness'|'resources'},now)
 if(id==='fix-drift')simulation=seedOperation(simulation,{type:'drift',selfHeal:selected==='self-heal'},now)
 if(id==='investigate-incident')simulation=seedOperation(simulation,{type:'incident'},now)
 if(id==='restore-backup')simulation=seedOperation(simulation,{type:'data-loss'},now)
 return {version:1,id,variant:selected,status:'active',clock:now,startedAt:now,completedAt:null,simulation,rejectedDecisions:0,completedObjectives:[],evidence:[],decisions:[],feedback:{tone:'neutral',message:adventureDefinition(id)!.description},hintLevel:0,hintsUsed:0,hintsEnabled:true,eventSequence:0}
}
const has=(session:AdventureSession,id:string)=>session.completedObjectives.includes(id)
function mark(session:AdventureSession,id:string){if(!has(session,id))session.completedObjectives.push(id)}
function recordEvidence(session:AdventureSession,id:string,title:string,stationId:string,fields:StateField[]) {
 const evidence:Evidence={id,title,stationId,timestamp:session.clock,fields}
 session.evidence=[...session.evidence.filter(item=>item.id!==id),evidence]
}
const field=(label:string,value:string|number):StateField=>({label,value:String(value)})
const evidenceValue=(session:AdventureSession,id:string,label:string)=>session.evidence.find(item=>item.id===id)?.fields.find(item=>item.label===label)?.value
const all=(session:AdventureSession,ids:string[])=>ids.every(id=>has(session,id))
export function tickAdventure(session:AdventureSession,now:number):AdventureSession {
 if(session.status!=='active'||!Number.isFinite(now)||now<session.clock||now===session.clock)return session
 const simulation=tickOperations(tickSimulation(session.simulation,now),now)
 const eventDelta=simulation.eventSequence-session.simulation.eventSequence
 let feedback=session.feedback
 if(simulation.status!==session.simulation.status){
  if(simulation.status==='failed')feedback={tone:'bad',message:simulation.error??'An infrastructure check failed. Inspect its evidence before choosing a repair.'}
  if(simulation.status==='waiting-approval')feedback={tone:'neutral',message:'The published candidate is waiting for human review. Inspect passing CI and its digest before approving.'}
  if(simulation.status==='succeeded')feedback={tone:'good',message:'Automation finished. Verify the actual environment, request path and observations to complete the lesson.'}
 }
 const event=simulation.history.at(-1)
 if(eventDelta>0&&event?.type==='operation'&&event.visual?.kind==='recovery')feedback={tone:'good',message:event.message}
 return {...session,clock:now,simulation,feedback,eventSequence:session.eventSequence+eventDelta}
}
function finish(session:AdventureSession,previousObjective:string|undefined){
 const definition=adventureDefinition(session.id)!,current=definition.objectives.find(item=>!has(session,item.id))?.id
 if(current!==previousObjective)session.hintLevel=0
 if(!current){session.status='completed';session.completedAt=session.clock;session.feedback={tone:'good',message:definition.summary}}
 return session
}
export function reduceAdventure(session:AdventureSession,input:AdventureCommand|unknown,now:number):AdventureSession {
 const command=parseAdventureCommand(input)
 if(!command||session.status!=='active'||!Number.isFinite(now)||now<session.clock)return session
 const next=structuredClone(tickAdventure(session,now));next.clock=now
 const prior=adventureDefinition(next.id)!.objectives.find(item=>!has(next,item.id))?.id
 if(command.type==='set-hints'){next.hintsEnabled=command.enabled;next.eventSequence++;return next}
 if(command.type==='hint'){
  if(!next.hintsEnabled||next.hintLevel>=4)return session
  next.hintLevel++;next.hintsUsed++;next.eventSequence++;return next
 }
 if(command.type==='cancel'){
  next.simulation=reduceSimulation(next.simulation,{type:'cancel'},now);next.status='cancelled';next.feedback={tone:'neutral',message:'Adventure paused at its cancelled snapshot. Restart creates a fresh lesson; completed records remain available.'};next.eventSequence++;return next
 }
 const action=adventureActions(next).find(item=>item.id===command.actionId)
 let accepted=false,message='That action is not available in this adventure.'
 const reject=(explanation:string)=>{message=explanation}
 const accept=(explanation:string)=>{accepted=true;message=explanation}
 const inspect=(id:string,title:string,stationId:string,fields:StateField[],objective?:string)=>{recordEvidence(next,id,title,stationId,fields);if(objective)mark(next,objective);accept(`Recorded ${title.toLowerCase()} from the current simulated state.`)}
 const sim=next.simulation,dev=sim.infra.environments.development,prod=sim.infra.environments.production
 if(action&&(next.id==='ship-release'||next.id==='promote-production')){
  switch(action.id){
   case 'push': next.simulation=reduceSimulation(sim,{type:'start',environment:'development',scenario:next.id==='ship-release'?'tests-fail':'healthy'},now);mark(next,'push');accept('Code pushed. CI runs independently of world animation; inspect its actual results.');break
   case 'inspect-ci':{
    const fields=stationSnapshot(sim,'ci');inspect('ci','CI results','ci',fields)
    if(sim.infra.ci.status==='passed'&&sim.infra.ci.tests==='passed'&&sim.infra.ci.security==='passed')mark(next,'ci')
    else message=sim.status==='failed'?'The regression failed before image publication. Repair its cause; retrying unchanged code cannot make it pass.':'CI is still in progress. Reinspect its final results before approval.'
    break
   }
   case 'retry-ci':reject('The source regression is unchanged. Repeating the same check keeps the release blocked; inspect it and apply the corrective fix.');break
   case 'repair-tests':
    if(!next.evidence.some(item=>item.id==='ci'))reject('Inspect the failed CI evidence before choosing a repair.')
    else {next.simulation=reduceSimulation(sim,{type:'retry'},now);accept('Corrected the demonstrated regression and reran the failed gate. Inspect the resulting checks before approval.')}
    break
   case 'inspect-image':
    if(!sim.infra.registry.ghcrAvailable||!sim.infra.registry.imageDigest)reject('The image has not been published to GHCR. Inspect and repair the CI gate first.')
    else inspect('image','Published immutable image','registry',[...stationSnapshot(sim,'registry'),field('Reviewed digest',sim.infra.registry.imageDigest)],'image')
    break
   case 'reject-release':accept('The candidate remains blocked from promotion. Review or repair it; rejecting this proposal does not change running workloads.');break
   case 'approve-release':
    if(sim.status!=='waiting-approval')reject('Approval is blocked: a published proposal with successful quality and security gates is required. A failed release cannot be approved healthy.')
    else if(!all(next,['ci','image'])||evidenceValue(next,'ci','Pipeline')!=='passed'||evidenceValue(next,'image','Reviewed digest')!==sim.infra.registry.imageDigest)reject('Inspect passing CI results and the current published digest before approving this candidate.')
    else {next.simulation=reduceSimulation(sim,{type:'approve'},now);mark(next,'approval');accept('Approved the reviewed development digest. Local promotion now precedes GitOps publication and reconciliation.')}
    break
   case 'inspect-gitops':
    if(!has(next,'approval')||dev.appliedRevision==='baseline'||dev.appliedRevision!==dev.desiredRevision||dev.gitMirrorRevision!==dev.desiredRevision)reject('The approved desired revision has not yet reached the local mirror and been applied by Argo CD.')
    else inspect('gitops','GitOps reconciliation','gitops',stationSnapshot(sim,'gitops','development'),'gitops')
    break
   case 'verify-health':
    if(!has(next,'approval')||dev.health!=='Healthy'||dev.activeImageDigest!==sim.activeImageDigest||dev.pods.some(pod=>!pod.ready||pod.digest!==sim.activeImageDigest))reject('The candidate is not fully healthy yet. Inspect desired, updated and available replicas; old healthy Pods are not proof of the new release.')
    else inspect('health','New revision health','kubernetes',stationSnapshot(sim,'kubernetes','development'),'health')
    break
   case 'verify-routing':
    if(!has(next,'health')||!sim.completedStages.includes('ingress'))reject('Verify the new rollout first, then wait for the Service and ingress checks for this release.')
    else inspect('routing','Application routing','network',stationSnapshot(sim,'network','development'),'routing')
    break
   case 'inspect-telemetry':
    if(!has(next,'routing')||sim.status!=='succeeded'||!dev.metrics.collected||!dev.logs.length)reject('Wait for the complete request/telemetry path and verify routing before inspecting the final observations.')
    else inspect('telemetry','Release telemetry','observability',[...stationSnapshot(sim,'observability','development'),...operationalEvidence(sim,'logs')],'telemetry')
    break
   case 'verify-development':
    if(sim.status!=='succeeded'||dev.health!=='Healthy'||!dev.ingressReady||dev.activeImageDigest!==sim.activeImageDigest)reject('Development must finish its rollout, routing and telemetry before production promotion.')
    else inspect('development','Verified development release','kubernetes',[...stationSnapshot(sim,'kubernetes','development'),field('Verified digest',dev.activeImageDigest),field('Verified revision',dev.deploymentRevision)],'development')
    break
   case 'propose-production':
    if(!has(next,'development')||evidenceValue(next,'development','Verified digest')!==dev.activeImageDigest)reject('Verify the deployed development digest and health before creating a production promotion change.')
    else {const promoted=reduceSimulation(sim,{type:'promote-existing',source:'development',environment:'production',digest:dev.activeImageDigest},now);if(promoted===sim)reject('The shared delivery guards rejected production promotion; a successful verified development candidate is required.');else{next.simulation=promoted;mark(next,'proposal');accept('Created a production proposal for the exact verified development digest. No image rebuild occurred.')}}
    break
   case 'review-production':
    if(sim.status!=='waiting-approval')reject('Wait for the production promotion proposal to open.')
    else inspect('production-review','Production promotion diff','delivery',[field('Development verified digest',evidenceValue(next,'development','Verified digest')??'Missing'),field('Production proposed digest',sim.activeImageDigest??'Missing'),field('Target namespace',prod.namespace),field('Target replicas',prod.desiredReplicas),field('Separate secret reference',prod.secretRef),field('Cluster boundary','Same kind cluster; namespaces are not physical isolation')])
    break
   case 'approve-production':
    if(sim.status!=='waiting-approval'||evidenceValue(next,'production-review','Production proposed digest')!==dev.activeImageDigest||sim.activeImageDigest!==dev.activeImageDigest)reject('Review the production diff and verify it pins the exact development digest before approving this environment.')
    else{next.simulation=reduceSimulation(sim,{type:'approve'},now);mark(next,'production-approval');accept('Approved production separately. The shared promotion and GitOps lifecycle now deploys the already verified artifact.')}
    break
   case 'verify-production':
    if(!has(next,'production-approval')||sim.status!=='succeeded'||prod.health!=='Healthy'||prod.activeImageDigest!==dev.activeImageDigest||dev.activeImageDigest!==evidenceValue(next,'development','Verified digest')||String(dev.deploymentRevision)!==evidenceValue(next,'development','Verified revision'))reject('Wait for healthy production on the verified digest and confirm development retained its original revision.')
    else inspect('production','Independent production release','kubernetes',[...stationSnapshot(sim,'kubernetes','production'),field('Development unchanged','Digest and revision retained'),field('Shared physical boundary','Namespaces share the kind cluster')],'production')
    break
  }
 } else if(action){
  const inspections:Record<string,[string,string,string,string]>={
   'inspect-pod':['pod','Pod status, events and metrics','kubernetes','diagnose'],
   'inspect-git':['git','Desired Git configuration','gitops','git'],
   'inspect-live':['live','Live configuration and sync policy','kubernetes','live'],
   'inspect-alert':['alert','Incident alert','alerts','alert'],
   'inspect-metrics':['metrics','Prometheus and Grafana evidence','observability','metrics'],
   'inspect-logs':['logs','Correlated Loki logs','observability','logs'],
   'inspect-damage':['damage','Data loss and dependencies','database','damage'],
   'inspect-snapshots':['snapshots','Backup recovery points','recovery','snapshots'],
  }
  if(inspections[action.id]){const [kind,title,station,objective]=inspections[action.id];inspect(kind,title,station,operationalEvidence(sim,kind),objective)}
  else if(action.id==='verify-pod'){
   if(!all(next,['diagnose','repair'])||!dev.operations?.pod?.corrected||dev.availableReplicas!==dev.desiredReplicas)reject('Choose a recovery justified by the Pod evidence, then verify that every desired endpoint is ready.')
   else inspect('pod-verification','Recovered endpoints','network',[...operationalEvidence(sim,'pod'),...stationSnapshot(sim,'network')],'verify')
  } else if(action.id==='verify-drift'){
   if(!all(next,['git','live','reconcile'])||!dev.operations?.drift?.corrected||dev.syncStatus!=='Synced')reject('Inspect both sides, choose a reconciliation policy and wait until live state actually converges.')
   else inspect('drift-verification','Converged configuration','kubernetes',operationalEvidence(sim,'live'),'verify')
  } else if(action.id==='verify-incident'){
   if(!all(next,['alert','metrics','logs','diagnosis','repair'])||!dev.operations?.incident?.recovered||dev.metrics.errorRate!==0||dev.alert!=='resolved')reject('The evidence, correct diagnosis, repair and a fresh healthy observation window are all required before declaring recovery.')
   else inspect('incident-verification','Fresh recovery observations','observability',[...operationalEvidence(sim,'metrics'),...operationalEvidence(sim,'logs')],'verify')
  } else if(OPERATION_ACTION_IDS.has(action.id as OperationAction)){
   let prerequisite:string|null=null
   if(next.id==='recover-pod'&&!has(next,'diagnose'))prerequisite='Inspect the Pod report first; the repair must be justified by its actual status and events.'
   if(next.id==='fix-drift'&&!all(next,['git','live']))prerequisite='Inspect both reviewed Git configuration and the live diff before deciding how to reconcile.'
   if(next.id==='investigate-incident'&&!all(next,['alert','metrics','logs']))prerequisite='Correlate the alert, metrics/dashboard and Loki log evidence before choosing a diagnosis or correction.'
   if(next.id==='restore-backup'&&!all(next,['damage','snapshots']))prerequisite='Inspect affected services and compare the recovery points before selecting or restoring a backup.'
   if(prerequisite)reject(prerequisite)
   else {
    const result=applyOperation(sim,action.id as OperationAction,now);next.simulation=result.state;accepted=result.accepted;message=result.message
    if(accepted){
     if(next.id==='recover-pod')mark(next,'repair')
     if(next.id==='fix-drift')mark(next,'reconcile')
     if(next.id==='investigate-incident'){if(action.id==='diagnose-pool')mark(next,'diagnosis');if(action.id==='repair-pool')mark(next,'repair')}
     if(next.id==='restore-backup'){
      const recovery=result.state.infra.environments.development.operations!.recovery!
      if(action.id==='snapshot-verified')mark(next,'select')
      if(recovery.databaseRestored&&recovery.objectsRestored)mark(next,'restore')
      if(recovery.validated){mark(next,'validate');recordEvidence(next,'recovery-verification','Validated recovery','recovery',[field('Recovered records',result.state.infra.environments.development.data.records),field('Recovered objects',recovery.recoveredObjects),field('Recovery point loss','2 minutes'),field('Elapsed recovery time',`${Math.round((now-recovery.lossAt)/1000)} seconds`),field('RTO target',`${recovery.targetRtoMs/1000} seconds`),field('RTO met',now-recovery.lossAt<=recovery.targetRtoMs?'Yes':'No; integrity recovered, but improve the recovery procedure'),field('Host-loss protection','Not provided by these same-host snapshots')])}
     }
    }
   }
  }
 }
 if(!accepted)next.rejectedDecisions++
 next.decisions.push({actionId:command.actionId,label:action?.label??command.actionId,timestamp:now,outcome:accepted?'accepted':'rejected',message})
 if(next.decisions.length>240)next.decisions.splice(0,next.decisions.length-240)
 next.feedback={tone:accepted?'good':'warning',message};next.eventSequence++
 return finish(next,prior)
}
