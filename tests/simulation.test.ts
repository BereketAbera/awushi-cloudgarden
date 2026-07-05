import test from 'node:test'
import assert from 'node:assert/strict'
import { createSimulation, parseSimulationCommand, reduceSimulation, stationSnapshot, tickSimulation } from '../src/simulation/engine.ts'
import { DEPLOYMENT_STAGES } from '../src/simulation/scenario.ts'
import { GRAPH_EDGES, TECHNOLOGIES, FACILITIES, technologiesForStation } from '../src/simulation/registry.ts'
import { STATIONS } from '../src/worldConfig.ts'
import type { EnvironmentId, ScenarioId, SimulationState } from '../src/simulation/domain.ts'

function start(scenario: ScenarioId = 'healthy', environment: EnvironmentId = 'development', state = createSimulation()) {
  return reduceSimulation(state, { type: 'start', scenario, environment }, state.clock + 10)
}
function reachApproval(state: SimulationState) { return tickSimulation(state, state.clock + 100_000) }
function finish(state: SimulationState) {
  if (state.status === 'waiting-approval') state = reduceSimulation(state, { type: 'approve' }, state.clock + 1)
  return tickSimulation(state, state.clock + 100_000)
}
function healthy(environment: EnvironmentId = 'development', initial = createSimulation()) { return finish(reachApproval(start('healthy', environment, initial))) }

test('the shared registry covers every requested technology and all 17 facilities', () => {
  const required = ['github','github-actions','automated-tests','docker-build','ci-security','ghcr','local-registry','image-digests','image-promotion','pull-through-cache','terraform','helm','kustomize','kubernetes','kind','namespaces','deployments','pods','services','argocd','gitops-repository','local-git-mirror','traefik','infisical','secret-operator','kubernetes-secrets','rbac','network-policies','resource-budget','trivy','gitleaks','prometheus','grafana','alloy','loki','alertmanager','postgresql','valkey','rabbitmq','object-storage','backups','restore']
  for (const id of required) assert.ok(TECHNOLOGIES.some(technology => technology.id === id), `Missing ${id}`)
  assert.equal(new Set(TECHNOLOGIES.map(t => t.id)).size, TECHNOLOGIES.length)
  assert.equal(FACILITIES.length, 17)
  for (const station of STATIONS) assert.ok(technologiesForStation(station.id).length > 0)
  for (const technology of TECHNOLOGIES) {
    assert.ok(STATIONS.some(station => station.id === technology.stationId))
    assert.ok(technology.inputs.length && technology.outputs.length && technology.details.length && technology.sources.length)
    for (const id of technology.relatedIds) assert.ok(TECHNOLOGIES.some(other => other.id === id))
  }
  for (const edge of GRAPH_EDGES) assert.ok(TECHNOLOGIES.some(t => t.id === edge.from) && TECHNOLOGIES.some(t => t.id === edge.to))
  assert.equal(new Set(GRAPH_EDGES.map(edge => edge.id)).size, GRAPH_EDGES.length)
  assert.ok(!GRAPH_EDGES.some(edge => edge.from === 'github-actions' && edge.to === 'kubernetes'))
  assert.ok(GRAPH_EDGES.some(edge => edge.from === 'local-git-mirror' && edge.to === 'argocd'))
  assert.ok(GRAPH_EDGES.some(edge => edge.from === 'prometheus' && edge.to === 'alertmanager'))
  assert.ok(!GRAPH_EDGES.some(edge => edge.from === 'grafana' && edge.to === 'alertmanager'))
})

test('runtime commands and monotonic injected clocks reject malformed input without mutation', () => {
  const initial = createSimulation(100)
  for (const command of [null, [], {}, {type:'deploy-cluster'}, {type:'start',environment:'unknown'}, {type:'start',environment:'development',scenario:'unknown'}, {type:'restore',environment:'unknown'}]) {
    assert.equal(parseSimulationCommand(command), null)
    assert.equal(reduceSimulation(initial, command, 101), initial)
  }
  assert.equal(reduceSimulation(initial, {type:'start',environment:'development'}, NaN), initial)
  assert.equal(reduceSimulation(initial, {type:'start',environment:'development'}, 99), initial)
  const running = start()
  assert.equal(tickSimulation(running, -1), running)
  assert.equal(tickSimulation(running, Infinity), running)
  assert.equal(reduceSimulation(running, {type:'start',environment:'production'}, 100), running)
})

test('CI gates publication, then delivery waits indefinitely for explicit human approval', () => {
  const initial = createSimulation(), waiting = reachApproval(start())
  assert.equal(waiting.status, 'waiting-approval'); assert.equal(waiting.stageId, 'approval')
  assert.equal(waiting.completedStages.length, 7)
  assert.equal(waiting.infra.ci.canAccessCluster, false)
  assert.equal(waiting.infra.ci.tests, 'passed'); assert.equal(waiting.infra.ci.security, 'passed'); assert.equal(waiting.infra.ci.imageScan, 'passed')
  assert.equal(waiting.infra.registry.ghcrAvailable, true); assert.equal(waiting.infra.registry.localAvailable, false)
  assert.equal(waiting.infra.github.pullRequest, 'open')
  assert.deepEqual(waiting.infra.environments, initial.infra.environments)
  assert.equal(tickSimulation(waiting, 10_000_000), waiting)
  assert.equal(reduceSimulation(initial, {type:'approve'}, 1), initial)
  const approved = reduceSimulation(waiting, {type:'approve'}, waiting.clock + 10)
  assert.equal(approved.status, 'running'); assert.equal(approved.stageId, 'promote'); assert.equal(approved.infra.github.pullRequest, 'merged')
  assert.equal(approved.infra.registry.localAvailable, false, 'Approval itself cannot magically copy an image')
})

test('a complete release follows all 22 dependencies through registry, GitOps, rollout and telemetry', () => {
  const final = healthy(), env = final.infra.environments.development
  assert.equal(final.status, 'succeeded')
  assert.deepEqual(final.completedStages, DEPLOYMENT_STAGES.map(stage => stage.id))
  assert.equal(final.infra.registry.localDigest, final.infra.registry.imageDigest)
  assert.match(env.activeImageDigest, /^sha256:[a-f0-9]{64}$/)
  assert.equal(env.activeImageDigest, final.infra.registry.localDigest)
  assert.equal(env.desiredRevision, env.gitMirrorRevision); assert.equal(env.desiredRevision, env.appliedRevision)
  assert.equal(env.deploymentRevision, 1); assert.equal(env.syncStatus, 'Synced'); assert.equal(env.health, 'Healthy')
  assert.equal(env.availableReplicas, env.desiredReplicas); assert.equal(env.updatedReplicas, env.desiredReplicas)
  assert.ok(env.pods.every(pod => pod.ready && pod.digest === env.activeImageDigest))
  assert.ok(env.serviceReady && env.ingressReady && env.metrics.collected && env.dashboardReady)
  assert.equal(env.logs.length, 1); assert.equal(env.metrics.availableReplicas, env.desiredReplicas)
  assert.equal(env.alert, 'inactive', 'Healthy delivery must not invent a failure alert')
  const events = final.history.filter(event => event.type === 'stage-completed')
  assert.deepEqual(events.map(event => event.stageId), DEPLOYMENT_STAGES.map(stage => stage.id))
  assert.ok(events.findIndex(e => e.stageId === 'promote') < events.findIndex(e => e.stageId === 'gitops-commit'))
  assert.ok(final.history.every((event, index) => index === 0 || event.timestamp >= final.history[index - 1].timestamp))
})

test('tick cadence does not change results or event timestamps', () => {
  let slow = start(), fast = start()
  const end = 20_000
  slow = tickSimulation(slow, end)
  for (let now = 20; now < end; now += 37) fast = tickSimulation(fast, now)
  fast = tickSimulation(fast, end)
  assert.deepEqual(fast, slow)
  slow = reduceSimulation(slow, {type:'approve'}, end + 1); fast = reduceSimulation(fast, {type:'approve'}, end + 1)
  slow = tickSimulation(slow, 60_000)
  for (let now = end + 2; now < 60_000; now += 83) fast = tickSimulation(fast, now)
  fast = tickSimulation(fast, 60_000)
  assert.deepEqual(fast, slow)
})

for (const [scenario, gate] of [['tests-fail','quality'],['security-fail','security']] as const) test(`${scenario} blocks the image and can be repaired without skipping checks`, () => {
  const failed = reachApproval(start(scenario))
  assert.equal(failed.status, 'failed'); assert.equal(failed.stageId, gate)
  assert.equal(failed.infra.registry.imageDigest, null); assert.equal(failed.infra.registry.ghcrAvailable, false)
  assert.equal(failed.infra.ci.build, 'pending'); assert.equal(failed.infra.environments.development.deploymentRevision, 0)
  const retrying = reduceSimulation(failed, {type:'retry'}, failed.clock + 1)
  assert.equal(retrying.status, 'retrying'); assert.equal(retrying.infra.ci.status, 'running')
  assert.equal(retrying.error, null); assert.equal(retrying.stageId, gate)
  const waiting = tickSimulation(retrying, retrying.clock + 100_000)
  assert.equal(waiting.status, 'waiting-approval')
  assert.equal(finish(waiting).status, 'succeeded')
})

test('readiness failure preserves old ready Pods and resolves its alert after repair', () => {
  const approved = reduceSimulation(reachApproval(start('rollout-fail')), {type:'approve'}, 100_020)
  const failed = tickSimulation(approved, 200_000), env = failed.infra.environments.development
  assert.equal(failed.status, 'failed'); assert.equal(failed.stageId, 'rollout')
  assert.equal(env.syncStatus, 'Synced'); assert.equal(env.health, 'Degraded')
  assert.equal(env.deploymentRevision, 0); assert.equal(env.version, 'v0')
  assert.equal(env.availableReplicas, env.desiredReplicas); assert.ok(env.pods.some(pod => pod.status === 'old' && pod.ready))
  assert.ok(env.serviceReady && env.ingressReady); assert.equal(env.alert, 'firing')
  const succeeded = finish(reduceSimulation(failed, {type:'retry'}, 200_001))
  assert.equal(succeeded.status, 'succeeded'); assert.equal(succeeded.infra.environments.development.alert, 'resolved')
  assert.equal(succeeded.infra.environments.development.deploymentRevision, 1)
})

test('rolling updates are gradual and never drop below the required ready replica count', () => {
  let state = reduceSimulation(reachApproval(start()), {type:'approve'}, 100_020)
  const rolloutIndex = DEPLOYMENT_STAGES.findIndex(s => s.id === 'rollout')
  const untilRollout = DEPLOYMENT_STAGES.slice(8, rolloutIndex).reduce((sum, stage) => sum + stage.durationMs, 0)
  state = tickSimulation(state, 100_020 + untilRollout)
  assert.equal(state.stageId, 'rollout')
  const startTime = state.stageStartedAt
  for (const progress of [.1, .55, .9]) {
    state = tickSimulation(state, startTime + 3600 * progress)
    const env = state.infra.environments.development
    assert.ok(env.availableReplicas >= env.desiredReplicas)
    assert.ok(env.pods.length <= env.desiredReplicas + 1)
    assert.ok(env.updatedReplicas < env.desiredReplicas)
  }
  assert.equal(state.infra.environments.development.updatedReplicas, 1)
})

test('development and production have distinct state while sharing the declared cluster boundary', () => {
  const initial = createSimulation(), afterDev = healthy()
  assert.deepEqual(afterDev.infra.environments.production, initial.infra.environments.production)
  const devBefore = structuredClone(afterDev.infra.environments.development)
  const afterProd = healthy('production', afterDev)
  assert.deepEqual(afterProd.infra.environments.development, devBefore)
  assert.equal(afterProd.infra.environments.production.deploymentRevision, 1)
  assert.notEqual(afterProd.infra.environments.production.activeImageDigest, devBefore.activeImageDigest)
  assert.notEqual(afterProd.infra.environments.production.namespace, devBefore.namespace)
  assert.notEqual(afterProd.infra.environments.production.secretRef, devBefore.secretRef)
  assert.notEqual(afterProd.infra.environments.production.config.host, devBefore.config.host)
  assert.equal(afterProd.infra.environments.production.cluster, devBefore.cluster)
})

test('cancel stops future work without pretending to roll back applied changes; reset restores the model', () => {
  const waiting = reachApproval(start()), cancelled = reduceSimulation(waiting, {type:'cancel'}, waiting.clock + 1)
  assert.equal(cancelled.status, 'cancelled'); assert.equal(cancelled.infra.github.pullRequest, 'cancelled')
  assert.equal(cancelled.infra.registry.ghcrAvailable, true)
  assert.equal(tickSimulation(cancelled, 999_999), cancelled)
  assert.equal(reduceSimulation(cancelled, {type:'approve'}, cancelled.clock + 2), cancelled)
  const reset = reduceSimulation(cancelled, {type:'reset'}, cancelled.clock + 3)
  assert.equal(reset.status, 'idle'); assert.equal(reset.stageId, null); assert.equal(reset.history.length, 0)
  assert.equal(reset.infra.registry.ghcrAvailable, false)
  assert.deepEqual(reset.infra.environments, createSimulation().infra.environments)
  const again = start('healthy', 'development', reset)
  assert.ok(again.history[0].id > cancelled.history.at(-1)!.id)
})

test('dependency guards prevent a corrupted local promotion from reaching GitOps', () => {
  const waiting = reachApproval(start())
  const corrupted = structuredClone(waiting); corrupted.infra.registry.ghcrAvailable = false
  const stopped = reduceSimulation(corrupted, {type:'approve'}, waiting.clock + 1)
  assert.equal(stopped.status, 'failed'); assert.match(stopped.error!, /published artifact/)
  assert.equal(stopped.infra.environments.development.desiredRevision, 'baseline')
})

test('backup and restore are isolated to the selected environment and do not overwrite live records', () => {
  const initial = createSimulation()
  assert.equal(reduceSimulation(initial, {type:'restore',environment:'development'}, 1), initial)
  const snapshot = reduceSimulation(initial, {type:'backup',environment:'development'}, 2)
  assert.ok(snapshot.infra.environments.development.data.backup)
  const changed = structuredClone(snapshot); changed.infra.environments.development.data.records = 123
  const restored = reduceSimulation(changed, {type:'restore',environment:'development'}, 3)
  assert.equal(restored.infra.environments.development.data.records, 123)
  assert.equal(restored.infra.environments.development.data.recoveredRecords, 100)
  assert.equal(restored.infra.environments.production.data.backup, null)
  assert.equal(restored.history.at(-1)!.type, 'restore-completed')
  const running = start(); assert.equal(reduceSimulation(running, {type:'backup',environment:'development'}, 100), running)
})

test('every station produces honest simulated state fields and history visuals use real stations', () => {
  const final = healthy()
  for (const station of STATIONS) {
    const fields = stationSnapshot(final, station.id)
    assert.ok(fields.length > 0)
    assert.ok(fields.every(field => field.label && typeof field.value === 'string'))
  }
  for (const event of final.history) if (event.visual) {
    assert.ok(STATIONS.some(station => station.id === event.visual!.fromStationId))
    assert.ok(STATIONS.some(station => station.id === event.visual!.toStationId))
  }
})


test('cancelling active CI marks running checks cancelled and does not mutate prior snapshots', () => {
  const initial = start(), preserved = structuredClone(initial)
  const running = tickSimulation(initial, 2000)
  assert.equal(running.stageId, 'quality')
  const cancelled = reduceSimulation(running, {type:'cancel'}, 2100)
  assert.equal(cancelled.infra.ci.status, 'cancelled')
  assert.equal(cancelled.infra.ci.tests, 'cancelled')
  assert.equal(cancelled.infra.ci.lint, 'cancelled')
  assert.equal(running.infra.ci.status, 'running')
  assert.deepEqual(initial, preserved)
})

test('history stays bounded across releases while event identities remain unique', () => {
  let state = createSimulation()
  for (let release = 0; release < 8; release++) state = healthy(release % 2 === 0 ? 'development' : 'production', state)
  assert.equal(state.history.length, 240)
  assert.equal(new Set(state.history.map(event => event.id)).size, 240)
  assert.ok(state.history[0].id > 1)
  assert.ok(state.history.every((event, index) => index === 0 || event.id > state.history[index - 1].id))
  assert.equal(state.infra.environments.development.deploymentRevision, 4)
  assert.equal(state.infra.environments.production.deploymentRevision, 4)
})


for (const fraction of [.55, 1]) test(`a new release retains ready Pods after cancellation at ${fraction * 100}% of rollout`, () => {
  const toRollout = (waiting: SimulationState) => {
    const approved = reduceSimulation(waiting, {type:'approve'}, waiting.clock + 1)
    const index = DEPLOYMENT_STAGES.findIndex(stage => stage.id === 'rollout')
    const duration = DEPLOYMENT_STAGES.slice(approved.stageIndex, index).reduce((total, stage) => total + stage.durationMs, 0)
    return tickSimulation(approved, approved.clock + duration)
  }
  let first = toRollout(reachApproval(start()))
  first = tickSimulation(first, first.stageStartedAt + DEPLOYMENT_STAGES.find(stage => stage.id === 'rollout')!.durationMs * fraction)
  const firstDigest = first.infra.registry.localDigest
  const beforeCancel = first.infra.environments.development
  assert.ok(beforeCancel.pods.some(pod => pod.ready && pod.digest === firstDigest))
  const serving = (state: SimulationState) => state.infra.environments.development.pods.filter(pod => pod.ready).map(({id, digest, revision}) => ({id, digest, revision}))
  const appliedPods = serving(first)
  const cancelled = reduceSimulation(first, {type:'cancel'}, first.clock + 1)
  const secondWaiting = reachApproval(start('healthy', 'development', cancelled))
  assert.deepEqual(serving(secondWaiting), appliedPods, 'CI and approval must not revert applied Pods')
  const secondRollout = toRollout(secondWaiting)
  assert.deepEqual(serving(secondRollout), appliedPods, 'Starting rollout must retain the actual serving digests and Pod identities')
  const env = secondRollout.infra.environments.development
  assert.equal(env.rollout.targetRevision, 2)
  assert.equal(env.deploymentRevision, 0, 'Neither previous candidate finished health confirmation')
  assert.equal(env.availableReplicas, env.desiredReplicas)
  assert.equal(env.pods.length, env.desiredReplicas + 1)
  assert.notEqual(secondRollout.infra.registry.localDigest, firstDigest)
  const succeeded = finish(secondRollout), finalEnv = succeeded.infra.environments.development
  assert.equal(succeeded.status, 'succeeded')
  assert.equal(finalEnv.deploymentRevision, 2)
  assert.ok(finalEnv.pods.every(pod => pod.ready && pod.digest === succeeded.infra.registry.localDigest))
  assert.deepEqual(succeeded.infra.environments.production, createSimulation().infra.environments.production)
})

test('shared candidate inspectors identify the real target even when another environment is selected', () => {
  const released = healthy('development')
  for (const station of ['github', 'ci', 'registry', 'containers', 'supply-chain', 'delivery']) {
    const fields = stationSnapshot(released, station, 'production')
    assert.equal(fields.find(field => field.label === 'Candidate target')?.value, 'development')
    assert.equal(fields.find(field => field.label === 'Scope')?.value, 'Shared latest-run candidate')
  }
  const registry = stationSnapshot(released, 'registry', 'production')
  assert.equal(registry.find(field => field.label === 'Candidate digest')?.value, released.infra.registry.imageDigest)
  assert.equal(registry.find(field => field.label === 'Local candidate')?.value, 'Available')
  const delivery = stationSnapshot(released, 'delivery', 'production')
  assert.equal(delivery.find(field => field.label === 'Inspected environment')?.value, 'production')
  assert.equal(delivery.find(field => field.label === 'Inspected desired revision')?.value, 'baseline')
  const reset = reduceSimulation(released, {type:'reset'}, released.clock + 1)
  assert.equal(stationSnapshot(reset, 'registry').find(field => field.label === 'Candidate target')?.value, 'No run yet')
})
