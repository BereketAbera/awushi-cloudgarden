import test from 'node:test'
import assert from 'node:assert/strict'
import { ADVENTURES } from '../src/adventures/catalog.ts'
import { createAdventure, reduceAdventure, tickAdventure } from '../src/adventures/engine.ts'
import type { AdventureSession } from '../src/adventures/domain.ts'
import { getAdventureView } from '../src/adventures/selectors.ts'
import { createStuckState, dismissStuckHelp, evidenceExplanation, formatEvidenceTime, getMissionGuidance, GUIDANCE_MODES, normalizeGuidancePreferences, parseGuidancePreferences, shouldOfferHelp, updateStuckState, type StuckContext, type StuckObservation } from '../src/adventures/guidance.ts'
import { getStation } from '../src/worldConfig.ts'

const act = (state: AdventureSession, actionId: string) => reduceAdventure(state, { type: 'action', actionId }, state.clock + 1)
const run = (state: AdventureSession, actions: string[]) => actions.reduce(act, state)
const context: StuckContext = { running: true, replaying: false, cinematic: false, waiting: false, mode: 'guided' }
const observation: StuckObservation = { objectiveKey: 'attempt-1:incident:alert', progressKey: 'none', nowMs: 0, invalidCount: 0 }

test('every existing scenario has a nonempty briefing, real tool locations and an actionable first investigation', () => {
  for (const definition of ADVENTURES) {
    const session = createAdventure(definition.id), frozen = structuredClone(session)
    const guide = getMissionGuidance(session)
    assert.equal(guide.briefing.title, definition.title)
    assert.ok(guide.briefing.happened && guide.briefing.objective && guide.briefing.symptoms.length && guide.briefing.tools.length)
    assert.ok(getStation(guide.briefing.firstStationId))
    assert.ok(guide.target && getStation(guide.target.stationId))
    assert.ok(guide.actions.some(action => action.id === guide.target!.actionId))
    assert.equal(guide.checklist.length, definition.objectives.length)
    assert.equal(guide.checklist.filter(item => item.completed).length, 0)
    assert.deepEqual(session, frozen, 'asking for guidance cannot inspect or modify the scenario')
  }
})

test('incident briefing uses current observed symptoms without revealing its root cause', () => {
  const state = createAdventure('investigate-incident'), guide = getMissionGuidance(state)
  assert.match(guide.briefing.symptoms.join(' '), /24%.*900 ms/)
  assert.doesNotMatch(`${guide.briefing.happened} ${guide.briefing.objective} ${guide.briefing.symptoms.join(' ')} ${guide.target!.reason}`, /pool|DB_POOL|8.*1/i)
  assert.doesNotMatch(guide.actions.find(action => action.id === 'repair-pool')!.description, /1.*8/)
  const recovered = tickAdventure(run(state, ['inspect-alert', 'inspect-metrics', 'inspect-logs', 'diagnose-pool', 'repair-pool']), 10000)
  assert.match(getMissionGuidance(recovered).briefing.symptoms.join(' '), /0%.*42 ms.*resolved/)
})

test('checklist follows real evidence and permits metrics or logs before the alert', () => {
  let state = createAdventure('investigate-incident')
  getMissionGuidance(state)
  assert.equal(state.evidence.length, 0)
  state = act(state, 'inspect-logs')
  let guide = getMissionGuidance(state)
  assert.equal(guide.checklist.find(item => item.id === 'logs')!.completed, true)
  assert.equal(guide.checklist.find(item => item.id === 'alert')!.completed, false)
  assert.equal(guide.target!.actionId, 'inspect-alert')
  state = run(state, ['inspect-metrics', 'inspect-alert'])
  guide = getMissionGuidance(state)
  assert.equal(guide.checklist.filter(item => item.completed).length, 3)
  assert.equal(guide.target!.actionId, null, 'Guide Me must not select the correct diagnosis')
  state = act(state, 'diagnose-ingress')
  assert.equal(getMissionGuidance(state).checklist.find(item => item.id === 'diagnosis')!.completed, false)
})

test('completion removes guidance targets and keeps confirmed checklist results', () => {
  const state = run(createAdventure('recover-pod'), ['inspect-pod', 'repair-readiness', 'verify-pod'])
  const guide = getMissionGuidance(state)
  assert.equal(state.status, 'completed')
  assert.equal(guide.target, null)
  assert.equal(guide.actions.length, 0)
  assert.ok(guide.checklist.every(item => item.completed && !item.current))
})

test('guidance modes change presentation without changing evidence, hints, actions or infrastructure', () => {
  const state = run(createAdventure('recover-pod'), ['inspect-pod']), frozen = structuredClone(state)
  const guides = GUIDANCE_MODES.map(mode => getMissionGuidance(state, mode.id))
  assert.deepEqual(guides.map(guide => guide.showChecklist), [true, false, false])
  assert.deepEqual(guides.map(guide => guide.showNavigation), [true, false, false])
  for (const guide of guides) {
    assert.deepEqual(guide.actions, guides[0].actions)
    assert.deepEqual(guide.checklist, guides[0].checklist)
    assert.deepEqual(guide.target, guides[0].target)
  }
  assert.deepEqual(state, frozen)
})

test('mechanical prerequisites explain unavailable targets while plausible mistakes remain possible', () => {
  let release = tickAdventure(act(createAdventure('ship-release'), 'push'), 60000)
  let actions = getMissionGuidance(release).actions
  assert.equal(actions.find(action => action.id === 'repair-tests')!.enabled, false)
  assert.match(actions.find(action => action.id === 'repair-tests')!.reason!, /Inspect.*CI/)
  assert.equal(actions.find(action => action.id === 'approve-release')!.enabled, true)
  assert.equal(actions.find(action => action.id === 'verify-health')!.enabled, true)
  release = act(release, 'inspect-ci')
  assert.equal(getMissionGuidance(release).actions.find(action => action.id === 'repair-tests')!.enabled, true)
  let restore = run(createAdventure('restore-backup'), ['inspect-damage', 'inspect-snapshots'])
  actions = getMissionGuidance(restore).actions
  assert.equal(actions.find(action => action.id === 'restore-database')!.enabled, false)
  assert.ok(actions.filter(action => action.id.startsWith('snapshot-')).every(action => action.enabled))
  restore = act(restore, 'snapshot-verified')
  assert.equal(getMissionGuidance(restore).actions.find(action => action.id === 'restore-database')!.enabled, true)
  assert.equal(getMissionGuidance(restore).actions.find(action => action.id === 'restore-objects')!.enabled, false)
  restore = act(restore, 'restore-database')
  assert.equal(getMissionGuidance(restore).actions.find(action => action.id === 'restore-objects')!.enabled, true)
  assert.ok(getMissionGuidance(run(createAdventure('investigate-incident'), ['inspect-alert', 'inspect-metrics', 'inspect-logs'])).actions.filter(action => action.id.startsWith('diagnose-')).every(action => action.enabled))
})

test('progressive hints use registered place names, reveal one level at a time and do not auto-diagnose', () => {
  let state = createAdventure('investigate-incident')
  assert.equal(getAdventureView(state).hints.length, 0)
  state = reduceAdventure(state, { type: 'hint' }, 1)
  assert.equal(getAdventureView(state).hints.length, 1)
  assert.doesNotMatch(getAdventureView(state).hints[0], /pool|DB_POOL/)
  state = reduceAdventure(state, { type: 'hint' }, 2)
  assert.match(getAdventureView(state).hints[1], new RegExp(getStation('alerts')!.name))
  assert.equal(state.hintsUsed, 2)
  const guided = getMissionGuidance(state)
  assert.equal(guided.target!.actionId, 'inspect-alert')
  assert.equal(state.decisions.length, 0)
})

test('guidance preference parsing is bounded and unknown fields cannot enter the journal', () => {
  const defaults = { version: 1, mode: 'guided', automaticCamera: true, onboardingComplete: false }
  assert.deepEqual(parseGuidancePreferences(null), defaults)
  assert.deepEqual(parseGuidancePreferences('broken'), defaults)
  assert.deepEqual(parseGuidancePreferences(' '.repeat(4097)), defaults)
  assert.deepEqual(normalizeGuidancePreferences({ version: 99, mode: 'commander' }), defaults)
  assert.deepEqual(normalizeGuidancePreferences({ version: 1, mode: 'hacker', automaticCamera: 'yes', onboardingComplete: 1 }), defaults)
  assert.deepEqual(parseGuidancePreferences('{"version":1,"mode":"engineer","automaticCamera":false,"onboardingComplete":true,"simulation":{}}'), { version: 1, mode: 'engineer', automaticCamera: false, onboardingComplete: true })
})

test('stuck help waits for meaningful repeated failure or ninety seconds without progress', () => {
  const initial = createStuckState(observation)
  assert.equal(shouldOfferHelp(initial, context, 89999), false)
  assert.equal(shouldOfferHelp(initial, context, 90000), true)
  const failed = updateStuckState(initial, { ...observation, nowMs: 1000, invalidCount: 3 }, context)
  assert.equal(shouldOfferHelp(failed, context, 1000), true)
  const progress = updateStuckState(failed, { ...observation, nowMs: 1100, invalidCount: 3, progressKey: 'observed-alert' }, context)
  assert.equal(shouldOfferHelp(progress, context, 1100), false)
})

test('unrelated interactions count once and repeated related inspections do not trigger navigation help', () => {
  let state = createStuckState(observation)
  for (let id = 1; id <= 4; id++) {
    state = updateStuckState(state, { ...observation, nowMs: id * 100, interaction: { id, related: false } }, context)
    state = updateStuckState(state, { ...observation, nowMs: id * 100 + 1, interaction: { id, related: false } }, context)
  }
  assert.equal(state.unrelatedVisits, 4)
  assert.equal(shouldOfferHelp(state, context, 500), true)
  let related = createStuckState(observation)
  for (let id = 1; id <= 6; id++) related = updateStuckState(related, { ...observation, nowMs: id * 100, interaction: { id, related: true } }, context)
  assert.equal(related.unrelatedVisits, 0)
  assert.equal(shouldOfferHelp(related, context, 600), false)
})

test('stuck assistance is suppressed during playback, waiting, pause, hidden tabs and advanced guidance', () => {
  const initial = createStuckState(observation)
  for (const suppress of [{ cinematic: true }, { replaying: true }, { running: false }, { waiting: true }, { visible: false }, { mode: 'engineer' as const }, { mode: 'commander' as const }]) {
    const suppressed = { ...context, ...suppress }
    assert.equal(shouldOfferHelp(initial, suppressed, 100000), false)
    const state = updateStuckState(initial, { ...observation, nowMs: 100000, invalidCount: 4 }, suppressed)
    assert.equal(shouldOfferHelp(state, context, 100001), false, 'returning from an inactive view must not prompt for time spent away')
  }
})

test('dismissed stuck prompts stay dismissed for that objective and allow help on a new objective', () => {
  const dismissed = dismissStuckHelp(createStuckState(observation))
  assert.equal(shouldOfferHelp(dismissed, context, 100000), false)
  assert.equal(dismissStuckHelp(dismissed), dismissed)
  const next = updateStuckState(dismissed, { ...observation, objectiveKey: 'attempt-1:incident:metrics', nowMs: 100000 }, context)
  assert.equal(shouldOfferHelp(next, context, 190000), true)
  const returned = updateStuckState(next, { ...observation, nowMs: 200000 }, context)
  assert.equal(shouldOfferHelp(returned, context, 300000), false)
})

test('evidence explanations remain glossary text and mission timestamps retain before-start events', () => {
  assert.match(evidenceExplanation('Image digest')!, /exact image bytes/)
  assert.match(evidenceExplanation('HTTP 5xx')!, /symptom/)
  assert.match(evidenceExplanation('RPO / RTO target')!, /lost history.*time target/)
  assert.equal(evidenceExplanation('unknown label'), null)
  assert.equal(formatEvidenceTime(-200), 'T−0:00.200')
  assert.equal(formatEvidenceTime(60234), 'T+1:00.234')
  assert.equal(formatEvidenceTime(1200, 1000), 'T+0:00.200')
  assert.equal(formatEvidenceTime(NaN), 'T+0:00.000')
  const state = run(createAdventure('investigate-incident'), ['inspect-logs']), before = structuredClone(state.evidence)
  for (const evidence of state.evidence) for (const field of evidence.fields) evidenceExplanation(field.label)
  assert.deepEqual(state.evidence, before)
})
