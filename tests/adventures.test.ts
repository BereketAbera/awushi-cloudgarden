import test from 'node:test'
import assert from 'node:assert/strict'
import { ADVENTURES, validAdventureVariant } from '../src/adventures/catalog.ts'
import { createAdventure, parseAdventureCommand, reduceAdventure, tickAdventure } from '../src/adventures/engine.ts'
import { getAdventureView } from '../src/adventures/selectors.ts'
import type { AdventureId, AdventureSession, AdventureVariant } from '../src/adventures/domain.ts'
import { createSimulation, reduceSimulation } from '../src/simulation/engine.ts'
import { STATIONS } from '../src/worldConfig.ts'

const act=(state:AdventureSession,actionId:string,at=state.clock+1)=>reduceAdventure(state,{type:'action',actionId},at)
const run=(state:AdventureSession,actions:string[])=>actions.reduce((current,action)=>act(current,action),state)
const settle=(state:AdventureSession)=>tickAdventure(state,state.clock+60000)
function development(id:'ship-release'|'promote-production') {
 let state=act(createAdventure(id),'push')
 state=settle(state)
 if(id==='ship-release'){
  assert.equal(state.simulation.status,'failed')
  state=run(state,['inspect-ci','repair-tests']);state=settle(state)
 }
 assert.equal(state.simulation.status,'waiting-approval')
 state=run(state,['inspect-ci','inspect-image','approve-release']);state=settle(state)
 assert.equal(state.simulation.status,'succeeded')
 return state
}
function successful(id:AdventureId,variant?:AdventureVariant):AdventureSession {
 if(id==='ship-release')return run(development(id),['inspect-gitops','verify-health','verify-routing','inspect-telemetry'])
 if(id==='promote-production'){
  let state=run(development(id),['verify-development','propose-production']);state=settle(state)
  state=run(state,['review-production','approve-production']);state=settle(state)
  return act(state,'verify-production')
 }
 if(id==='recover-pod'){
  let state=act(createAdventure(id,0,variant),'inspect-pod')
  state=act(state,variant==='transient'?'wait-controller':variant==='image'?'repair-image':variant==='resources'?'repair-resources':'repair-readiness')
  if(variant==='transient')state=settle(state)
  return act(state,'verify-pod')
 }
 if(id==='fix-drift'){
  let state=run(createAdventure(id,0,variant),['inspect-git','inspect-live',variant==='self-heal'?'wait-self-heal':'sync-git']);state=settle(state)
  return act(state,'verify-drift')
 }
 if(id==='investigate-incident'){
  let state=run(createAdventure(id),['inspect-alert','inspect-metrics','inspect-logs','diagnose-pool','repair-pool']);state=settle(state)
  return act(state,'verify-incident')
 }
 return run(createAdventure(id),['inspect-damage','inspect-snapshots','snapshot-verified','restore-database','restore-objects','validate-restore'])
}

test('six definitions share real station bindings, complete metadata and four progressive hints per objective',()=>{
 assert.equal(ADVENTURES.length,6);assert.equal(new Set(ADVENTURES.map(x=>x.id)).size,6)
 for(const definition of ADVENTURES){
  assert.ok(definition.learningObjectives.length>=3&&definition.summary&&definition.technicalDetails)
  for(const station of definition.stationIds)assert.ok(STATIONS.some(item=>item.id===station))
  for(const objective of definition.objectives){assert.equal(objective.hints.length,4);assert.ok(STATIONS.some(station=>station.id===objective.stationId))}
 }
 assert.throws(()=>createAdventure('missing' as AdventureId));assert.throws(()=>createAdventure('recover-pod',0,'manual'))
 assert.equal(validAdventureVariant('recover-pod','image'),true);assert.equal(validAdventureVariant('restore-backup','image'),false)
})
for(const definition of ADVENTURES)test(`${definition.title}: explicit evidence and valid decisions complete its actual state objectives`,()=>{
 const state=successful(definition.id)
 assert.equal(state.status,'completed');assert.equal(state.completedObjectives.length,definition.objectives.length)
 assert.ok(state.completedAt!>=state.startedAt);assert.equal(getAdventureView(state).progress.completed,definition.objectives.length)
 assert.ok(getAdventureView(state).summary.technologies.length>0)
 assert.equal(reduceAdventure(state,{type:'action',actionId:'push'},state.clock+10),state)
})

test('failing release cannot be approved or repaired by retrying unchanged CI',()=>{
 let state=settle(act(createAdventure('ship-release'),'push'))
 const baseline=structuredClone(state.simulation.infra.environments)
 state=run(state,['approve-release','retry-ci','inspect-image'])
 assert.equal(state.simulation.status,'failed');assert.equal(state.simulation.infra.registry.imageDigest,null)
 assert.deepEqual(state.simulation.infra.environments,baseline)
 assert.equal(state.rejectedDecisions,3)
 state=act(state,'repair-tests');assert.equal(state.decisions.at(-1)?.outcome,'rejected','repair needs observed CI evidence')
 state=run(state,['inspect-ci','repair-tests']);state=settle(state)
 state=act(state,'approve-release');assert.equal(state.simulation.status,'waiting-approval','stale failed CI evidence cannot approve')
 state=run(state,['inspect-ci','inspect-image','approve-release']);state=settle(state)
 state=run(state,['inspect-gitops','verify-health','verify-routing','inspect-telemetry']);assert.equal(state.status,'completed')
})

test('approval gate waits indefinitely and opening selectors never advances a mission',()=>{
 let state=settle(act(createAdventure('promote-production'),'push'))
 const frozen=structuredClone(state)
 for(let i=0;i<20;i++)getAdventureView(state)
 assert.deepEqual(state,frozen)
 state=tickAdventure(state,999999)
 assert.equal(state.simulation.status,'waiting-approval');assert.deepEqual(state.completedObjectives,['push'])
 state=act(state,'approve-release');assert.equal(state.simulation.status,'waiting-approval')
})
for(const variant of ['transient','image','readiness','resources'] as const)test(`Pod ${variant}: diagnosis separates automatic recovery from a persistent configuration cause`,()=>{
 let state=act(createAdventure('recover-pod',0,variant),'inspect-pod')
 state=act(state,'restart-pod');assert.equal(state.decisions.at(-1)?.outcome,'rejected')
 if(variant!=='transient'){
  state=settle(state);assert.equal(state.simulation.infra.environments.development.operations?.pod?.corrected,false)
  state=act(state,'wait-controller');assert.equal(state.decisions.at(-1)?.outcome,'rejected')
 }
 const correct=successful('recover-pod',variant)
 assert.equal(correct.status,'completed');assert.equal(correct.simulation.infra.environments.development.availableReplicas,2)
 assert.equal(correct.simulation.infra.environments.development.operations?.pod?.restartCount,variant==='transient'?1:0)
 assert.equal(correct.simulation.infra.environments.development.operations?.pod?.imageReference,correct.simulation.infra.environments.development.activeImageDigest)
 assert.equal(correct.simulation.infra.environments.development.operations?.pod?.readinessPath,'/health/ready')
})

test('wrong Pod configuration fix preserves unhealthy state and remains recoverable',()=>{
 let state=run(createAdventure('recover-pod',0,'image'),['inspect-pod','repair-readiness','verify-pod'])
 assert.equal(state.status,'active');assert.equal(state.simulation.infra.environments.development.health,'Degraded')
 state=run(state,['repair-image','verify-pod']);assert.equal(state.status,'completed')
})

test('drift waits under manual policy, demonstrates failed live patch and explicit self-heal',()=>{
 let state=run(createAdventure('fix-drift'),['inspect-git','inspect-live','wait-self-heal']);state=settle(state)
 assert.equal(state.simulation.infra.environments.development.syncStatus,'OutOfSync')
 state=act(state,'patch-live');assert.equal(state.simulation.infra.environments.development.operations?.drift?.liveReplicas,3)
 assert.equal(state.simulation.infra.environments.development.config.replicas,2)
 state=act(state,'enable-self-heal');state=settle(state);state=act(state,'verify-drift')
 assert.equal(state.status,'completed');assert.equal(state.simulation.infra.environments.development.operations?.drift?.liveReplicas,2)
 assert.equal(successful('fix-drift','self-heal').status,'completed')
})

test('production reuses the proved development digest and retains independent namespace state',()=>{
 let state=development('promote-production')
 const developmentState=structuredClone(state.simulation.infra.environments.development)
 state=act(state,'propose-production');assert.equal(state.decisions.at(-1)?.outcome,'rejected')
 state=run(state,['verify-development','propose-production']);state=settle(state)
 assert.equal(state.simulation.environment,'production')
 assert.equal(state.simulation.activeImageDigest,developmentState.activeImageDigest)
 assert.equal(state.simulation.completedStages.includes('build'),false,'promotion does not rebuild')
 state=act(state,'approve-production');assert.equal(state.simulation.status,'waiting-approval','production has its own reviewed gate')
 state=run(state,['review-production','approve-production']);state=settle(state);state=act(state,'verify-production')
 assert.equal(state.status,'completed');assert.deepEqual(state.simulation.infra.environments.development,developmentState)
 assert.equal(state.simulation.infra.environments.production.activeImageDigest,developmentState.activeImageDigest)
 assert.notEqual(state.simulation.infra.environments.production.namespace,developmentState.namespace)
 assert.equal(state.simulation.infra.environments.production.cluster,developmentState.cluster)
 const unproved=createSimulation();assert.equal(reduceSimulation(unproved,{type:'promote-existing',environment:'production',source:'development',digest:developmentState.activeImageDigest},1),unproved)
})

test('incident telemetry shares timestamps and only supported diagnosis plus correction resolves it',()=>{
 let state=run(createAdventure('investigate-incident'),['inspect-alert','inspect-metrics','inspect-logs'])
 const env=state.simulation.infra.environments.development
 assert.equal(env.metrics.errorRate,24);assert.equal(env.metrics.latencyMs,900)
 assert.equal(env.health,'Healthy','Healthy Kubernetes replicas alone do not prove successful application requests')
 assert.ok(env.logs[0].message.includes('8 → 1'));assert.ok(env.logs[1].message.includes('status=503'))
 assert.ok(env.logs.every(entry=>entry.timestamp<=state.clock))
 state=run(state,['diagnose-ingress','repair-pool','rollback-image','restart-pod','silence-alert']);state=settle(state)
 assert.equal(state.simulation.infra.environments.development.alert,'firing');assert.equal(state.simulation.infra.environments.development.metrics.errorRate,24)
 state=run(state,['diagnose-pool','repair-pool','verify-incident']);assert.equal(state.status,'active','fresh window is required')
 state=settle(state);state=act(state,'verify-incident');assert.equal(state.status,'completed')
 assert.equal(state.simulation.infra.environments.development.metrics.errorRate,0)
 assert.equal(state.simulation.infra.environments.development.alert,'resolved')
})

test('backup selection protects consistency/RPO; database-only restore cannot restore service',()=>{
 let state=run(createAdventure('restore-backup'),['inspect-damage','inspect-snapshots','snapshot-recent','snapshot-old'])
 assert.equal(state.simulation.infra.environments.development.operations?.recovery?.selectedId,null)
 state=run(state,['snapshot-verified','restore-database','validate-restore'])
 let env=state.simulation.infra.environments.development
 assert.equal(state.status,'active');assert.equal(env.data.records,40);assert.equal(env.serviceReady,false)
 assert.equal(env.data.recoveredRecords,98);assert.equal(env.operations?.recovery?.objectsRestored,false)
 state=run(state,['restore-objects','validate-restore']);env=state.simulation.infra.environments.development
 assert.equal(state.status,'completed');assert.equal(env.data.records,98);assert.equal(env.operations?.recovery?.recoveredObjects,98)
 assert.equal(env.data.postgres,'ready');assert.equal(env.data.objectStorage,'ready')
 assert.ok(getAdventureView(state).summary.technicalDetails.includes('recovery time'))
})

test('progressive hints reveal one level, reset with objective changes, and can be disabled',()=>{
 let state=createAdventure('recover-pod')
 state=reduceAdventure(state,{type:'hint'},1);assert.equal(getAdventureView(state).hints.length,1)
 state=reduceAdventure(state,{type:'hint'},2);assert.equal(getAdventureView(state).hints.length,2)
 state=reduceAdventure(state,{type:'set-hints',enabled:false},3)
 assert.equal(getAdventureView(state).hints.length,0);assert.equal(reduceAdventure(state,{type:'hint'},4),state)
 state=reduceAdventure(state,{type:'set-hints',enabled:true},4);state=act(state,'inspect-pod')
 assert.equal(state.hintLevel,0);assert.equal(state.hintsUsed,2)
})

test('cadence-independent ticks preserve state and event semantics for delivery and operational recovery',()=>{
 for(const [id,variant] of [['ship-release',undefined],['recover-pod','transient'],['fix-drift','self-heal']] as const){
  let initial=createAdventure(id,0,variant);if(id==='ship-release')initial=act(initial,'push',1)
  let fine=initial;for(let now=100;now<=10000;now+=100)fine=tickAdventure(fine,now)
  const coarse=tickAdventure(initial,10000)
  assert.deepEqual(fine,coarse,`${id} must not depend on tick granularity`)
 }
})

test('invalid commands, cancellation and replay start cannot corrupt an existing completed snapshot',()=>{
 const original=createAdventure('recover-pod'),saved=structuredClone(original)
 for(const value of [null,[],{type:'action',actionId:'<script>'},{type:'set-hints',enabled:'yes'}]){assert.equal(parseAdventureCommand(value),null);assert.equal(reduceAdventure(original,value,1),original)}
 assert.equal(tickAdventure(original,NaN),original);assert.equal(reduceAdventure(original,{type:'hint'},-1),original)
 const wrong=act(original,'unknown-action');assert.equal(wrong.status,'active');assert.equal(wrong.feedback.tone,'warning')
 assert.deepEqual(original,saved)
 const cancelled=reduceAdventure(original,{type:'cancel'},1);assert.equal(cancelled.status,'cancelled');assert.equal(tickAdventure(cancelled,10000),cancelled)
 const complete=successful('recover-pod'),frozen=structuredClone(complete)
 const fresh=createAdventure(complete.id,0,complete.variant);assert.equal(fresh.status,'active');assert.deepEqual(complete,frozen)
})

test('bounded decision history never erases the lifetime mistake count',()=>{
 let state=createAdventure('recover-pod')
 for(let i=0;i<260;i++)state=act(state,'restart-pod')
 assert.equal(state.decisions.length,240);assert.equal(state.rejectedDecisions,260)
})

test('a correction already observed as healthy is not described as still failing',()=>{
 let state=run(createAdventure('recover-pod'),['inspect-pod','repair-readiness'])
 state=act(state,'restart-pod')
 assert.match(state.feedback.message,/already corrected/)
 assert.equal(state.simulation.infra.environments.development.health,'Healthy')
 state=act(state,'verify-pod');assert.equal(state.status,'completed')
})

test('automatic failures and approval announce current state and companion reactions reflect investigation',()=>{
 let state=settle(act(createAdventure('ship-release'),'push'))
 assert.equal(state.feedback.tone,'bad');assert.equal(getAdventureView(state).reaction,'Worried')
 state=act(state,'inspect-ci');assert.equal(getAdventureView(state).reaction,'Curious')
 state=act(state,'repair-tests');assert.equal(getAdventureView(state).reaction,'Determined')
 state=settle(state);assert.match(state.feedback.message,/human review/);assert.equal(getAdventureView(state).reaction,'Thinking')
 assert.equal(getAdventureView(createAdventure('investigate-incident')).reaction,'Surprised')
})
