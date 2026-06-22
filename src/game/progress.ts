import { DISTRICTS, STATIONS } from '../worldConfig'
export type Progress = { version: 2; districts: string[]; stations: string[] }
export const createProgress = (): Progress => ({ version: 2, districts: [], stations: [] })
export const resetProgress = createProgress
export function enterDistrict(progress: Progress, id: string): Progress {
  return DISTRICTS.some(d => d.id === id) && !progress.districts.includes(id) ? { ...progress, districts: [...progress.districts, id] } : progress
}
export function discoverStation(progress: Progress, id: string): Progress {
  const station = STATIONS.find(s => s.id === id)
  if (!station) return progress
  const next = enterDistrict(progress, station.districtId)
  return next.stations.includes(id) ? next : { ...next, stations: [...next.stations, id] }
}
export function parseProgress(raw: string | null): Progress {
  try {
    const value = JSON.parse(raw ?? '{}') as Partial<Progress>
    if (value.version !== 2 || !Array.isArray(value.stations) || !Array.isArray(value.districts)) return createProgress()
    let result = createProgress()
    for (const id of value.districts) if (typeof id === 'string') result = enterDistrict(result, id)
    for (const id of value.stations) if (typeof id === 'string') result = discoverStation(result, id)
    return result
  } catch { return createProgress() }
}
export const introductoryProgress = (progress: Progress) => DISTRICTS.filter(d => progress.stations.includes(d.introStation)).length
export const STORAGE_KEY = 'awushi-exploration-v2'
