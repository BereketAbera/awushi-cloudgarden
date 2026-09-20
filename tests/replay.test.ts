import test from 'node:test'
import assert from 'node:assert/strict'
import { reduceAdventure, tickAdventure } from '../src/adventures/engine.ts'
import { advanceReplay, createAdventureRecord, isBetterResult, recordSession, replayAdventure, type AdventureRecord, type ReplayView } from '../src/adventures/replay.ts'
import { emptyAdventureSave, parseAdventureSave, serializeAdventureSave, validateAdventureRecord } from '../src/adventures/persistence.ts'
import type { AdventureCommand } from '../src/adventures/domain.ts'

function completedPod(mistake = false, hint = false) {
  let { session, record } = createAdventureRecord('adventure-1', 'recover-pod', 'readiness')
  const apply = (command: AdventureCommand, at: number) => {
    session = tickAdventure(session, at)
    session = reduceAdventure(session, command, at)
    record = recordSession({ ...record, commands: [...record.commands, { at, command }] }, session)
  }
  if (hint) apply({type:'hint'}, 100)
  if (mistake) apply({type:'action',actionId:'verify-pod'}, 200)
  apply({type:'action',actionId:'inspect-pod'}, 1000)
  apply({type:'action',actionId:'repair-readiness'}, 2000)
  apply({type:'action',actionId:'verify-pod'}, 3000)
  assert.equal(session.status, 'completed')
  return { session, record }
}

test('completed replay reconstructs actual infrastructure, decisions, objectives and event history', () => {
  const { session, record } = completedPod(true, true)
  assert.deepEqual(replayAdventure(record), session)
  assert.deepEqual(record.result, { mistakes:1, hintsUsed:1 })
  assert.deepEqual(validateAdventureRecord(record), record)
  const save = { ...emptyAdventureSave(), sequence: 1, selectedId: record.adventureId, active: record, completed: [record] }
  assert.deepEqual(parseAdventureSave(serializeAdventureSave(save)).save, save)
})

test('replay seeking does not mutate the completed recording or share live infrastructure references', () => {
  const { session, record } = completedPod()
  const original = JSON.stringify(record)
  const paused = replayAdventure(record, 1500)
  assert.equal(paused.status, 'active'); assert.equal(paused.decisions.length, 1)
  assert.equal(paused.simulation.infra.environments.development.health, 'Degraded')
  const final = replayAdventure(record)
  final.simulation.infra.environments.development.pods[0].ready = false
  assert.equal(JSON.stringify(record), original)
  assert.equal(session.simulation.infra.environments.development.pods[0].ready, true)
  assert.deepEqual(replayAdventure(record), session)
})

test('replay pause, restart and speed reach the same deterministic result at 15, 60 and 144 FPS', () => {
  const { record, session } = completedPod(true)
  for (const fps of [15, 60, 144]) for (const speed of [.5, 1, 2, 4] as const) {
    let view: ReplayView = { recordId: record.id, positionMs: 0, durationMs: record.elapsedMs, playing: true, speed }
    for (let frame = 0; frame < fps * 10 && view.playing; frame++) view = advanceReplay(view, 1000 / fps)
    assert.equal(view.positionMs, record.elapsedMs); assert.equal(view.playing, false)
    assert.deepEqual(replayAdventure(record, view.positionMs), session)
    const paused = { ...view, positionMs: 1200, playing: false }
    assert.deepEqual(advanceReplay(paused, 1000), paused)
    const restarted = { ...paused, positionMs: 0, playing: true }
    assert.equal(replayAdventure(record, restarted.positionMs).decisions.length, 0)
    assert.deepEqual(advanceReplay(restarted, NaN), restarted)
    assert.deepEqual(advanceReplay(restarted, -1), restarted)
  }
})

test('a reload halfway through a deployment stage preserves elapsed progress without advancing offline time', () => {
  let { session, record } = createAdventureRecord('adventure-1', 'ship-release')
  const command = {type:'action',actionId:'push'} as const
  session = reduceAdventure(session, command, 0)
  session = tickAdventure(session, 1234)
  record = recordSession({ ...record, commands: [{at:0,command}] }, session)
  const save = { ...emptyAdventureSave(), sequence:1, selectedId:record.adventureId, active:record }
  const loaded = parseAdventureSave(serializeAdventureSave(save))
  assert.equal(loaded.writesBlocked, false)
  const restored = replayAdventure(loaded.save.active!)
  assert.deepEqual(restored, session)
  assert.equal(restored.clock, 1234)
  assert.deepEqual(tickAdventure(restored, 1734), tickAdventure(session, 1734))
})

test('automatic reconciliation replays identically after many live ticks or one catch-up tick', () => {
  let { session, record } = createAdventureRecord('adventure-1', 'fix-drift', 'manual')
  for (const [index, actionId] of ['inspect-git', 'inspect-live', 'sync-git'].entries()) {
    const at = index + 1, command: AdventureCommand = {type:'action',actionId}
    session = reduceAdventure(session, command, at)
    record = recordSession({...record,commands:[...record.commands,{at,command}]}, session)
  }
  for (let at = 50; at <= 3000; at += 50) session = tickAdventure(session, at)
  const command = {type:'action',actionId:'verify-drift'} as const
  session = reduceAdventure(session, command, 3001)
  record = recordSession({...record,commands:[...record.commands,{at:3001,command}]}, session)
  assert.equal(session.status, 'completed')
  assert.deepEqual(replayAdventure(record), session)
})

test('best results reward fewer rejected decisions without penalizing hints or elapsed time', () => {
  const perfect = completedPod().record, hinted = completedPod(false, true).record, mistaken = completedPod(true).record
  assert.equal(isBetterResult(perfect, hinted), false)
  assert.equal(isBetterResult(hinted, perfect), false)
  assert.equal(isBetterResult(hinted, mistaken), true)
  assert.equal(isBetterResult(mistaken, hinted), false)
  assert.equal(isBetterResult({...perfect,elapsedMs:1} as AdventureRecord, perfect), false)
  assert.equal(isBetterResult(perfect, perfect), false)
})
