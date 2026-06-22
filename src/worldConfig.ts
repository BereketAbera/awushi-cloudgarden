import layout from './data/world-layout.json' with { type: 'json' }
export type Point3 = [number, number, number]
export type District = { id: string; name: string; label: string; center: Point3; radius: number; color: string; theme: string; order: number; asset: string; introStation: string }
export type Station = { id: string; districtId: string; name: string; model: string; position: Point3; radius: number; rotation: number; status: 'discovery'; description: string; steps: { label: string; detail: string }[]; future: string }
export type Bridge = { id: string; fromId: string; toId: string; width: number; points: Point3[] }
export type Hub = { id: string; name: string; label: string; center: Point3; radius: number; color: string }
export type WorldLayout = { version: number; seed: number; hub: Hub; districts: District[]; stations: Station[]; bridges: Bridge[]; spawn: Point3; worldRadius: number }
export const WORLD_LAYOUT = layout as WorldLayout
export const DISTRICTS = WORLD_LAYOUT.districts
export const STATIONS = WORLD_LAYOUT.stations
export const BRIDGES = WORLD_LAYOUT.bridges
export const HUB = WORLD_LAYOUT.hub
export const getDistrict = (id: string) => DISTRICTS.find(d => d.id === id)
export const getStation = (id: string) => STATIONS.find(s => s.id === id)
