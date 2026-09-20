import test from 'node:test'
import assert from 'node:assert/strict'
import { createSimulation, reduceSimulation, tickSimulation } from '../src/simulation/engine.ts'
import { DEPLOYMENT_STAGES, stageById } from '../src/simulation/scenario.ts'
import { createAdventureRecord, recordSession, replayAdventure, type AdventureRecord } from '../src/adventures/replay.ts'
import { reduceAdventure, tickAdventure } from '../src/adventures/engine.ts'
import type { AdventureCommand, AdventureSession } from '../src/adventures/domain.ts'
import { crossedStage, DEFAULT_PLAYBACK, framesForSimulation, playbackDelta, recordedFrames, stageNarrative, withFrameCommandCounts } from '../src/cinematic/playback.ts'

const policy = { enabled: true, mode: 'automatic' as const, speed: 1 as const }

test('operational captions reflect application failure even when Kubernetes itself is healthy', () => {
  let session = createAdventureRecord('incident-caption', 'investigate-incident').session
  assert.equal(session.simulation.infra.environments[session.simulation.environment].health, 'Healthy')
  assert.equal(stageNarrative(session.simulation).status, 'failed')
  session = reduceAdventure(session, { type: 'action', actionId: 'silence-alert' }, session.clock)
  assert.equal(stageNarrative(session.simulation).status, 'failed', 'silencing a notification does not fix requests')
  for (const actionId of ['inspect-alert', 'inspect-metrics', 'inspect-logs', 'diagnose-pool', 'repair-pool']) {
    session = reduceAdventure(session, { type: 'action', actionId }, session.clock)
  }
  assert.equal(stageNarrative(session.simulation).status, 'active', 'recovery needs a fresh observation window')
  session = tickAdventure(session, session.clock + 10000)
  assert.equal(stageNarrative(session.simulation).status, 'healthy')
})
test('drift captions show processing until the real reconciliation completes, then still require verification', () => {
  for (const actionId of ['sync-git', 'enable-self-heal']) {
    let session = createAdventureRecord(`drift-caption-${actionId}`, 'fix-drift').session
    assert.equal(stageNarrative(session.simulation).status, 'waiting')
    for (const id of ['inspect-git', 'inspect-live', actionId]) {
      session = reduceAdventure(session, { type: 'action', actionId: id }, session.clock)
    }
    const env = session.simulation.infra.environments.development
    assert.equal(env.health, 'Healthy', 'ready Pods alone do not prove Git convergence')
    assert.equal(env.syncStatus, 'Syncing')
    assert.equal(stageNarrative(session.simulation).status, 'active')
    const due = env.operations!.drift!.reconcileAt!
    session = tickAdventure(session, due - 1)
    assert.equal(stageNarrative(session.simulation).status, 'active')
    session = tickAdventure(session, due)
    assert.equal(stageNarrative(session.simulation).status, 'healthy')
    assert.equal(session.status, 'active', 'healthy attention does not complete the adventure')
    session = reduceAdventure(session, { type: 'action', actionId: 'verify-drift' }, session.clock)
    assert.equal(session.status, 'completed')
  }
})
function recordAction(record: AdventureRecord, session: AdventureSession, actionId: string, at: number) {
  const command: AdventureCommand = { type: 'action', actionId }
  const next = reduceAdventure(session, command, at)
  return { session: next, record: recordSession({ ...record, commands: [...record.commands, { at, command }] }, next) }
}
function approvedAtOneTimestamp() {
  let current = createAdventureRecord('adventure-1', 'promote-production')
  current = recordAction(current.record, current.session, 'push', 0)
  const waiting = tickAdventure(current.session, 20000)
  current = { session: waiting, record: recordSession(current.record, waiting) }
  const at = waiting.simulation.history.find(event => event.type === 'approval-required')!.timestamp
  // Reconstruct at the real gate, then issue all three actions within one 100ms UI tick.
  current = { session: replayAdventure(current.record, at), record: { ...current.record, elapsedMs: at } }
  for (const id of ['inspect-ci', 'inspect-image', 'approve-release']) current = recordAction(current.record, current.session, id, at)
  return { ...current, at }
}

test('cinematic playback gives a short stage time to read and clamps catch-up at one real boundary', () => {
  const initial = reduceSimulation(createSimulation(), { type: 'start', environment: 'development' }, 0)
  const duration = stageById(initial.stageId)!.durationMs
  assert.equal(duration, 900)
  assert.ok(playbackDelta(initial, 100, policy) < 100)
  let state = initial
  for (let i = 0; i < 34; i++) state = tickSimulation(state, state.clock + playbackDelta(state, 100, policy))
  assert.equal(state.stageId, 'push', '900ms stage remains inspectable for approximately 3.5 wall seconds')
  const nearBoundary = tickSimulation(initial, duration - 1)
  assert.equal(playbackDelta(nearBoundary, 10000, policy), 1)
  const next = tickSimulation(nearBoundary, nearBoundary.clock + playbackDelta(nearBoundary, 10000, policy))
  assert.equal(next.stageId, 'ci-start')
  assert.equal(next.stageStartedAt, duration)
  assert.equal(crossedStage(nearBoundary, next), true)
  assert.equal(playbackDelta(initial, NaN, policy), 0)
  assert.equal(playbackDelta(initial, -20, policy), 0)
  assert.equal(playbackDelta(initial, 10000, DEFAULT_PLAYBACK), 1000)
})

test('time and playback speed cannot cross the human approval gate or repair a failed check', () => {
  const started = reduceSimulation(createSimulation(), { type: 'start', environment: 'development' }, 0)
  const waiting = tickSimulation(started, 20000)
  assert.equal(waiting.status, 'waiting-approval')
  const held = tickSimulation(waiting, waiting.clock + playbackDelta(waiting, 100000, { ...policy, speed: 2 }))
  assert.equal(held, waiting)
  assert.equal(held.infra.github.pullRequest, 'open')
  const failure = tickSimulation(reduceSimulation(createSimulation(), { type: 'start', environment: 'development', scenario: 'tests-fail' }, 0), 20000)
  assert.equal(failure.status, 'failed')
  assert.equal(tickSimulation(failure, failure.clock + playbackDelta(failure, 100000, policy)), failure)
})

test('historical frames collapse duplicate approval announcements and never invent future stages', () => {
  const waiting = tickSimulation(reduceSimulation(createSimulation(), { type: 'start', environment: 'development' }, 0), 20000)
  const frames = framesForSimulation(waiting)
  assert.equal(frames.filter(frame => frame.stageId === 'approval').length, 1)
  assert.equal(frames.at(-1)!.title, 'Waiting for your approval')
  assert.ok(frames.every(frame => frame.at <= waiting.clock && frame.end >= frame.at))
  assert.equal(frames.some(frame => frame.stageId === 'promote'), false)
  assert.equal(frames.length, DEPLOYMENT_STAGES.findIndex(stage => stage.id === 'approval') + 1)
})

test('same-tick stage review excludes a later approval while retaining the reviewed live recording', () => {
  const { record, session, at } = approvedAtOneTimestamp(), saved = structuredClone(record), live = structuredClone(session)
  assert.equal(replayAdventure(record, at).simulation.stageId, 'promote', 'timestamp-only seeking would already include approval')
  const frames = recordedFrames(record)
  const approval = frames.find(frame => frame.stageId === 'approval')!, promotion = frames.find(frame => frame.stageId === 'promote')!
  assert.equal(approval.at, promotion.at)
  assert.ok(approval.commandCount! < promotion.commandCount!)
  const before = replayAdventure(record, approval.at, { commandCount: approval.commandCount })
  assert.equal(before.simulation.status, 'waiting-approval')
  assert.equal(before.simulation.infra.github.pullRequest, 'open')
  assert.equal(before.completedObjectives.includes('approval'), false)
  assert.equal(replayAdventure(record, promotion.at, { commandCount: promotion.commandCount }).simulation.stageId, 'promote')
  assert.deepEqual(record, saved)
  assert.deepEqual(session, live)
})

test('command prefix review separates a seeded incident and its same-timestamp repair', () => {
  let current = createAdventureRecord('adventure-2', 'recover-pod', 'readiness')
  current = recordAction(current.record, current.session, 'inspect-pod', 0)
  current = recordAction(current.record, current.session, 'repair-readiness', 0)
  const frames = recordedFrames(current.record)
  assert.equal(frames.length, 2)
  assert.equal(frames[0].at, frames[1].at)
  assert.equal(frames[0].commandCount, 0)
  assert.equal(frames[1].commandCount, 2)
  const failed = replayAdventure(current.record, 0, { commandCount: frames[0].commandCount })
  const repaired = replayAdventure(current.record, 0, { commandCount: frames[1].commandCount })
  assert.equal(failed.simulation.infra.environments.development.operations!.pod!.corrected, false)
  assert.equal(repaired.simulation.infra.environments.development.operations!.pod!.corrected, true)
  assert.equal(failed.evidence.length, 0)
  assert.equal(repaired.evidence.length, 1)
})

test('automatic stage review retains all commands issued at earlier timestamps', () => {
  let current = createAdventureRecord('adventure-3', 'promote-production')
  current = recordAction(current.record, current.session, 'push', 0)
  current = recordAction(current.record, current.session, 'inspect-ci', 500)
  current.session = tickAdventure(current.session, 3000)
  current.record = recordSession(current.record, current.session)
  const quality = recordedFrames(current.record).find(frame => frame.stageId === 'quality')!
  assert.equal(quality.commandCount, 2)
  const snapshot = replayAdventure(current.record, quality.at, { commandCount: quality.commandCount })
  assert.ok(snapshot.evidence.some(evidence => evidence.id === 'ci'))
  assert.equal(snapshot.simulation.stageId, 'quality')
})

test('stale frame-record combinations are omitted instead of showing an unrelated snapshot', () => {
  const { record, session } = approvedAtOneTimestamp()
  const frames = framesForSimulation(session.simulation)
  const wrong = createAdventureRecord('adventure-4', 'recover-pod').record
  const result = withFrameCommandCounts(frames, wrong.commands, (at, commandCount) => replayAdventure(wrong, at, { commandCount }).simulation)
  assert.equal(result.length, 0)
  assert.ok(recordedFrames(record).length > 0)
  const podFrames = framesForSimulation(replayAdventure(wrong).simulation)
  const incident = createAdventureRecord('adventure-5', 'investigate-incident').record
  assert.equal(podFrames[0].eventId, replayAdventure(incident).simulation.history[0].id, 'different attempts may reuse numeric event IDs')
  assert.equal(withFrameCommandCounts(podFrames, incident.commands, (at, commandCount) => replayAdventure(incident, at, { commandCount }).simulation).length, 0)
})

test('prefix replay validates bounds and never modifies the command list', () => {
  const { record } = approvedAtOneTimestamp(), original = structuredClone(record)
  assert.equal(replayAdventure(record, record.elapsedMs, { commandCount: NaN }).simulation.status, 'idle')
  assert.equal(replayAdventure(record, record.elapsedMs, { commandCount: -1 }).simulation.status, 'idle')
  assert.deepEqual(replayAdventure(record, record.elapsedMs, { commandCount: 99999 }), replayAdventure(record))
  assert.deepEqual(record, original)
})

test('stage narrative reflects the current actual gate and keeps technical progress numbered', () => {
  const initial = createSimulation(), before = stageNarrative(initial)
  assert.equal(before.number, 0)
  assert.equal(before.total, 22)
  const waiting = tickSimulation(reduceSimulation(initial, { type: 'start', environment: 'development' }, 0), 20000)
  const gate = stageNarrative(waiting)
  assert.equal(gate.status, 'waiting')
  assert.equal(gate.stationId, 'delivery')
  assert.equal(gate.number, 8)
  assert.match(gate.next, /approve explicitly/)
  const incident = stageNarrative(initial, { title: 'Understand the alert', description: 'Inspect the firing alert.', stationId: 'alerts' })
  assert.equal(incident.stationId, 'alerts')
  assert.equal(incident.title, 'Understand the alert')
})
