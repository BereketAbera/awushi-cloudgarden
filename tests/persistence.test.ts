import test from 'node:test'
import assert from 'node:assert/strict'
import { ADVENTURE_STORAGE_KEY, LEGACY_ADVENTURE_STORAGE_KEY, MAX_RECORDED_COMMANDS, MAX_SAVE_CHARACTERS, emptyAdventureSave, loadAdventureSave, parseAdventureSave, resetAdventureStorage, serializeAdventureSave, validateAdventureRecord, writeAdventureSave, type StorageLike } from '../src/adventures/persistence.ts'
import { createAdventureRecord, recordSession, replayAdventure } from '../src/adventures/replay.ts'
import { reduceAdventure } from '../src/adventures/engine.ts'
import { resumableAdventureId, selectAdventure } from '../src/adventures/useAdventures.ts'

class MemoryStorage implements StorageLike {
  values = new Map<string, string>()
  writes: string[] = []
  fail = false
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { if (this.fail) throw new Error('Quota exceeded'); this.values.set(key, value); this.writes.push(key) }
}
function savedHint() {
  const initial = createAdventureRecord('adventure-1', 'ship-release')
  const command = { type: 'hint' } as const
  const session = reduceAdventure(initial.session, command, 100)
  const record = recordSession({ ...initial.record, commands: [{ at: 100, command }] }, session)
  return { ...emptyAdventureSave(), sequence: 1, selectedId: record.adventureId, active: record }
}

test('a verified journal round-trips the exact scenario, infrastructure, history and hints', () => {
  const save = savedHint(), loaded = parseAdventureSave(serializeAdventureSave(save))
  assert.equal(loaded.notice, null); assert.equal(loaded.writesBlocked, false)
  assert.deepEqual(loaded.save, save)
  assert.deepEqual(replayAdventure(loaded.save.active!), replayAdventure(save.active!))
  assert.ok(!serializeAdventureSave(save).includes('secretRef'), 'The stored journal does not persist secret-shaped infrastructure objects')
})

test('the version 1 notebook migration preserves decisions and the original stored copy', () => {
  const save = savedHint(), storage = new MemoryStorage()
  const old = JSON.stringify({ version: 1, sequence: save.sequence, selectedId: save.selectedId, current: save.active, completed: save.completed, hintsEnabled: false })
  storage.values.set(LEGACY_ADVENTURE_STORAGE_KEY, old)
  const loaded = loadAdventureSave(storage)
  assert.equal(loaded.notice?.kind, 'migrated'); assert.equal(loaded.save.version, 2)
  assert.equal(loaded.save.preferences.hintsEnabled, false)
  assert.deepEqual(loaded.save.active, save.active)
  assert.equal(writeAdventureSave(storage, loaded.save), null)
  assert.equal(storage.getItem(LEGACY_ADVENTURE_STORAGE_KEY), old)
  assert.equal(parseAdventureSave(storage.getItem(ADVENTURE_STORAGE_KEY)).writesBlocked, false)
})

test('malformed and incompatible notebooks remain untouched and expose a recovery notice', () => {
  for (const [raw, kind] of [['{broken', 'corrupt'], [JSON.stringify({version: 99}), 'incompatible'], ['null', 'corrupt'], ['x'.repeat(MAX_SAVE_CHARACTERS + 1), 'corrupt']]) {
    const storage = new MemoryStorage(); storage.values.set(ADVENTURE_STORAGE_KEY, raw)
    const loaded = loadAdventureSave(storage)
    assert.equal(loaded.notice?.kind, kind); assert.equal(loaded.writesBlocked, true)
    assert.equal(loaded.sourceRaw, raw); assert.equal(storage.getItem(ADVENTURE_STORAGE_KEY), raw)
    assert.deepEqual(storage.writes, [])
  }
})

test('record validation rejects malformed, forged, unordered and unbounded actions before restore', () => {
  const original = savedHint().active!
  const variants = [
    {...original, adventureId: 'unknown'}, {...original, variant: 'self-heal'}, {...original, elapsedMs: Infinity},
    {...original, elapsedMs: -1}, {...original, completedAt: 10}, {...original, commands: Array(MAX_RECORDED_COMMANDS + 1).fill(original.commands[0])},
    {...original, commands: [{at:100,command:{type:'action',actionId:'<script>'}}]},
    {...original, commands: [{at:101,command:{type:'hint'}}]},
    {...original, commands: [{at:100,command:{type:'hint'}},{at:90,command:{type:'hint'}}]},
    {...original, commands: [{at:100,command:{type:'set-hints',enabled:'yes'}}]},
  ]
  for (const record of variants) assert.throws(() => validateAdventureRecord(record))
})

test('storage failure keeps the previous save and in-memory progress exportable', () => {
  const storage = new MemoryStorage(), initial = serializeAdventureSave(emptyAdventureSave())
  storage.values.set(ADVENTURE_STORAGE_KEY, initial); storage.fail = true
  const save = savedHint(), notice = writeAdventureSave(storage, save)
  assert.equal(notice?.kind, 'quota'); assert.equal(storage.getItem(ADVENTURE_STORAGE_KEY), initial)
  assert.equal(parseAdventureSave(serializeAdventureSave(save)).save.active?.commands.length, 1)
  assert.equal(loadAdventureSave(null).notice?.kind, 'unavailable')
})

test('explicit recovery copies the original before replacing it and refuses reset on quota failure', () => {
  const storage = new MemoryStorage(), original = '{broken notebook'
  storage.values.set(ADVENTURE_STORAGE_KEY, original)
  storage.fail = true
  assert.equal(resetAdventureStorage(storage, original, ADVENTURE_STORAGE_KEY, 42)?.kind, 'quota')
  assert.equal(storage.getItem(ADVENTURE_STORAGE_KEY), original)
  storage.fail = false
  assert.equal(resetAdventureStorage(storage, original, ADVENTURE_STORAGE_KEY, 42), null)
  assert.equal(storage.getItem(`${ADVENTURE_STORAGE_KEY}-recovery-42`), original)
  assert.deepEqual(parseAdventureSave(storage.getItem(ADVENTURE_STORAGE_KEY)).save, emptyAdventureSave())
})

test('switching lessons suspends progress; only an explicit restart replaces that attempt', () => {
  const first = savedHint()
  const other = selectAdventure(first, 'recover-pod', 'image')
  assert.equal(other.save.active?.adventureId, 'recover-pod'); assert.deepEqual(other.save.suspended, [first.active])
  const resumed = selectAdventure(other.save, 'ship-release')
  assert.deepEqual(resumed.save.active, first.active)
  assert.equal(resumed.save.suspended[0].variant, 'image')
  assert.equal(resumed.save.sequence, 2)
  const validated = parseAdventureSave(serializeAdventureSave(resumed.save))
  assert.equal(validated.writesBlocked, false); assert.deepEqual(validated.save, resumed.save)
  const fresh = selectAdventure(resumed.save, 'ship-release', undefined, true)
  assert.equal(fresh.save.sequence, 3); assert.notEqual(fresh.save.active?.id, first.active.id)
  assert.equal(fresh.save.active?.commands.length, 0)
  assert.equal(fresh.save.suspended[0].variant, 'image')
})

test('recording identities cannot collide across suspended and selected adventures', () => {
  const first = savedHint()
  const duplicate = createAdventureRecord(first.active.id, 'recover-pod', 'image').record
  const loaded = parseAdventureSave(JSON.stringify({...first,suspended:[duplicate]}))
  assert.equal(loaded.writesBlocked, true)
  assert.equal(loaded.notice?.kind, 'corrupt')
})

test('resume selects unfinished work and never turns a completed or cancelled lesson into a new attempt', () => {
  const first = savedHint()
  assert.equal(resumableAdventureId(first), 'ship-release')
  assert.equal(resumableAdventureId(first, 'restore-backup'), null)
  const other = selectAdventure(first, 'recover-pod', 'readiness')
  let session = other.session
  const commands = ['inspect-pod', 'repair-readiness', 'verify-pod'].map((actionId, index) => ({ at: index + 1, command: { type: 'action', actionId } as const }))
  for (const entry of commands) session = reduceAdventure(session, entry.command, entry.at)
  assert.equal(session.status, 'completed')
  const active = recordSession({ ...other.save.active, commands }, session)
  const completed = { ...other.save, active, completed: [active] }
  assert.equal(resumableAdventureId(completed), 'ship-release')
  assert.equal(resumableAdventureId(completed, 'recover-pod'), null)
  assert.equal(resumableAdventureId({ ...completed, suspended: [] }), null)
  const cancelled = reduceAdventure(replayAdventure(first.active), { type: 'cancel' }, 101)
  const cancelledRecord = recordSession({ ...first.active, commands: [...first.active.commands, { at: 101, command: { type: 'cancel' } }] }, cancelled)
  assert.equal(resumableAdventureId({ ...first, active: cancelledRecord }), null)
})
