import { ADVENTURES, validAdventureVariant } from './catalog'
import type { AdventureId, AdventureVariant } from './domain'
import { parseAdventureCommand } from './engine'
import { adventureResult, replayAdventure, type AdventureRecord, type RecordedCommand } from './replay'

export type { AdventureRecord, AdventureResult } from './replay'
export const ADVENTURE_STORAGE_KEY = 'awushi-adventures-v2'
export const LEGACY_ADVENTURE_STORAGE_KEY = 'awushi-adventures-v1'
export const MAX_SAVE_CHARACTERS = 512 * 1024
export const MAX_RECORDED_COMMANDS = 512
export const MAX_ADVENTURE_DURATION_MS = 14 * 24 * 60 * 60 * 1000
export type AdventureSave = {
  version: 2; sequence: number; selectedId: AdventureId | null; active: AdventureRecord | null
  /** One best result per adventure; the active record still retains the latest attempt. */
  completed: AdventureRecord[]; suspended: AdventureRecord[]; preferences: { hintsEnabled: boolean }
}
export type SaveNotice = { kind: 'corrupt' | 'incompatible' | 'unavailable' | 'quota' | 'migrated' | 'limit'; message: string; recoverable: boolean }
export type SaveLoad = { save: AdventureSave; notice: SaveNotice | null; writesBlocked: boolean; sourceRaw: string | null; sourceKey: string }
export type StorageLike = Pick<Storage, 'getItem' | 'setItem'>
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const finiteTime = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= MAX_ADVENTURE_DURATION_MS
const adventureId = (value: unknown): value is AdventureId => ADVENTURES.some(adventure => adventure.id === value)
const fail = (message: string): never => { throw new Error(message) }
export const emptyAdventureSave = (): AdventureSave => ({ version: 2, sequence: 0, selectedId: null, active: null, completed: [], suspended: [], preferences: { hintsEnabled: true } })

/** Canonicalize only recognized inputs, then reconstruct the infrastructure using its engine. */
export function validateAdventureRecord(value: unknown): AdventureRecord {
  if (!object(value)) return fail('An adventure recording must be an object.')
  if (typeof value.id !== 'string' || !/^adventure-[1-9]\d{0,10}$/.test(value.id) || !adventureId(value.adventureId)) return fail('The adventure recording has an unknown identity.')
  if (!validAdventureVariant(value.adventureId, value.variant) || (value.variant !== null && typeof value.variant !== 'string')) return fail('The adventure variant is invalid.')
  if (typeof value.initialHintsEnabled !== 'boolean' || !finiteTime(value.elapsedMs)) return fail('The recording clock or preferences are invalid.')
  if (!Array.isArray(value.commands) || value.commands.length > MAX_RECORDED_COMMANDS) return fail('The recording contains too many actions.')
  let previous = 0
  const commands: RecordedCommand[] = value.commands.map(item => {
    if (!object(item) || !finiteTime(item.at) || item.at < previous || item.at > (value.elapsedMs as number)) return fail('Recorded actions must have ordered, bounded timestamps.')
    const command = parseAdventureCommand(item.command)
    if (!command || (command.type === 'action' && (!/^[a-z0-9][a-z0-9-]{0,95}$/.test(command.actionId)))) return fail('A recorded action is malformed.')
    previous = item.at
    return { at: item.at, command }
  })
  if (value.completedAt !== null && (!finiteTime(value.completedAt) || value.completedAt > value.elapsedMs)) return fail('The completion timestamp is invalid.')
  const record: AdventureRecord = { id: value.id, adventureId: value.adventureId, variant: value.variant as AdventureVariant | null, initialHintsEnabled: value.initialHintsEnabled, elapsedMs: value.elapsedMs, commands, completedAt: value.completedAt as number | null, result: null }
  const session = replayAdventure(record)
  if (record.completedAt !== (session.status === 'completed' ? session.completedAt : null)) return fail('The claimed completion does not match the recorded decisions.')
  record.result = session.status === 'completed' ? adventureResult(session) : null
  return record
}

function validateSave(value: Record<string, unknown>): AdventureSave {
  if (value.selectedId !== null && !adventureId(value.selectedId)) return fail('The selected adventure is unknown.')
  if (typeof value.sequence !== 'number' || !Number.isSafeInteger(value.sequence) || value.sequence < 0 || value.sequence > 99_999_999_999) return fail('The recording sequence is invalid.')
  if (!Array.isArray(value.completed) || value.completed.length > ADVENTURES.length) return fail('The saved completion list is invalid.')
  if (!Array.isArray(value.suspended) || value.suspended.length > ADVENTURES.length) return fail('The suspended adventure list is invalid.')
  if (!object(value.preferences) || typeof value.preferences.hintsEnabled !== 'boolean') return fail('The saved preferences are invalid.')
  const active = value.active === null ? null : validateAdventureRecord(value.active)
  if (active && value.selectedId !== active.adventureId) return fail('The selected adventure does not match the active recording.')
  const completed = value.completed.map(validateAdventureRecord)
  const suspended = value.suspended.map(validateAdventureRecord)
  if (new Set(suspended.map(record => record.adventureId)).size !== suspended.length || suspended.some(record => replayAdventure(record).status !== 'active' || record.adventureId === active?.adventureId)) return fail('Suspended attempts must be unique and resumable.')
  if (completed.some(record => record.completedAt === null) || new Set(completed.map(record => record.adventureId)).size !== completed.length || new Set(completed.map(record => record.id)).size !== completed.length) return fail('Completed recordings must be unique, verified outcomes.')
  const all = [...completed, ...suspended, ...(active ? [active] : [])]
  const archived = [...completed, ...suspended]
  if (new Set(archived.map(record => record.id)).size !== archived.length || suspended.some(record => record.id === active?.id)) return fail('Recording identities cannot be reused by different attempts.')
  if (all.some(record => Number(record.id.slice('adventure-'.length)) > (value.sequence as number))) return fail('The recording sequence precedes an existing recording.')
  const matching = active && completed.find(record => record.id === active.id)
  if (matching && JSON.stringify(matching) !== JSON.stringify(active)) return fail('An active and completed recording reuse the same identity with different contents.')
  return { version: 2, sequence: value.sequence, selectedId: value.selectedId as AdventureId | null, active, completed, suspended, preferences: { hintsEnabled: value.preferences.hintsEnabled } }
}

/** The supported v1 preview stored current/hintsEnabled at the top level. */
export function migrateAdventureSaveV1(value: Record<string, unknown>): Record<string, unknown> {
  if (value.version !== 1) return fail('Only version 1 can use this migration.')
  return { version: 2, sequence: value.sequence, selectedId: value.selectedId, active: value.current, completed: value.completed, suspended: [], preferences: { hintsEnabled: value.hintsEnabled } }
}

export function parseAdventureSave(raw: string | null, sourceKey = ADVENTURE_STORAGE_KEY): SaveLoad {
  const base = { save: emptyAdventureSave(), notice: null, writesBlocked: false, sourceRaw: raw, sourceKey }
  if (raw === null) return base
  try {
    if (raw.length > MAX_SAVE_CHARACTERS) throw new Error('The save exceeds the supported size limit.')
    const value: unknown = JSON.parse(raw)
    if (!object(value)) throw new Error('The save is not an object.')
    if (value.version !== 1 && value.version !== 2) return { ...base, writesBlocked: true, notice: { kind: 'incompatible', message: 'This adventure save comes from an unsupported version. Your original data is untouched. Export it before choosing a fresh notebook.', recoverable: true } }
    const migrated = value.version === 1
    const save = validateSave(migrated ? migrateAdventureSaveV1(value) : value)
    return { ...base, save, notice: migrated ? { kind: 'migrated', message: 'Your version 1 adventure notebook was upgraded. Its original copy remains available.', recoverable: false } : null }
  } catch {
    return { ...base, writesBlocked: true, notice: { kind: 'corrupt', message: 'The adventure notebook could not be verified. Your original data has been kept. Export it, or start fresh while retaining a recovery copy.', recoverable: true } }
  }
}

export function loadAdventureSave(storage: StorageLike | null): SaveLoad {
  if (!storage) return { ...parseAdventureSave(null), notice: { kind: 'unavailable', message: 'Local storage is unavailable. You can keep playing, but export your notebook before leaving this page.', recoverable: true } }
  try {
    const current = storage.getItem(ADVENTURE_STORAGE_KEY)
    if (current !== null) return parseAdventureSave(current)
    const legacy = storage.getItem(LEGACY_ADVENTURE_STORAGE_KEY)
    return legacy !== null ? parseAdventureSave(legacy, LEGACY_ADVENTURE_STORAGE_KEY) : parseAdventureSave(null)
  } catch {
    return { ...parseAdventureSave(null), notice: { kind: 'unavailable', message: 'The browser blocked access to local saves. Progress remains in this page; export it before leaving.', recoverable: true } }
  }
}

export function serializeAdventureSave(save: AdventureSave): string {
  if ([save.active, ...save.completed, ...save.suspended].some(record => record && record.commands.length > MAX_RECORDED_COMMANDS)) throw new RangeError('This recording exceeds the supported action limit. Export it before restarting.')
  const raw = JSON.stringify(save)
  if (raw.length > MAX_SAVE_CHARACTERS) throw new RangeError('This notebook exceeds the local save size limit. Export it before restarting.')
  return raw
}

export function writeAdventureSave(storage: StorageLike | null, save: AdventureSave): SaveNotice | null {
  if (!storage) return { kind: 'unavailable', message: 'Progress is held in memory. Export your notebook before closing the page because local storage is unavailable.', recoverable: true }
  try { storage.setItem(ADVENTURE_STORAGE_KEY, serializeAdventureSave(save)); return null }
  catch (error) {
    const limit = error instanceof RangeError
    return { kind: limit ? 'limit' : 'quota', message: limit ? error.message : 'Your latest progress could not be saved. The previous save is untouched. Export your current notebook or free browser storage, then retry.', recoverable: true }
  }
}

/** Copy the original first. A quota error leaves it in place and refuses the destructive reset. */
export function resetAdventureStorage(storage: StorageLike | null, original: string | null, sourceKey = ADVENTURE_STORAGE_KEY, now = Date.now()): SaveNotice | null {
  if (!storage) return { kind: 'unavailable', message: 'Local storage is unavailable; export the original notebook before resetting this session.', recoverable: true }
  try {
    if (original !== null) storage.setItem(`${sourceKey}-recovery-${now}`, original)
    storage.setItem(ADVENTURE_STORAGE_KEY, serializeAdventureSave(emptyAdventureSave()))
    return null
  } catch {
    return { kind: 'quota', message: 'A recovery copy could not be saved, so the original notebook was not replaced. Export it and free browser storage before trying again.', recoverable: true }
  }
}
