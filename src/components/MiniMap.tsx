import { BRIDGES, DISTRICTS, HUB, STATIONS } from '../worldConfig'
import type { Progress } from '../game/progress'

type Props = { position: [number, number, number]; districtId: string; progress: Progress; expanded?: boolean; targetId?: string }
export function MiniMap({ position, districtId, progress, expanded = false, targetId }: Props) {
  const names = progress.districts.map(id => DISTRICTS.find(d => d.id === id)?.label).filter(Boolean).join(', ')
  return <svg viewBox="-31 -31 62 62" className={`mini-map-svg ${expanded ? 'expanded' : ''}`} role="img" aria-label={`World map. You are in ${DISTRICTS.find(d => d.id === districtId)?.label ?? (districtId === 'skyway' ? 'the skyways' : HUB.name)}. ${progress.districts.length} districts visited${names ? `: ${names}` : ''}.`}>
    <defs><radialGradient id={expanded ? 'map-glow-large' : 'map-glow-small'}><stop stopColor="#244851" /><stop offset="1" stopColor="#142b34" /></radialGradient></defs>
    <circle r="30.2" fill={`url(#${expanded ? 'map-glow-large' : 'map-glow-small'})`} stroke="#45616a" strokeWidth=".18" />
    <circle r="27.8" fill="none" stroke="#41616b" strokeWidth=".12" strokeDasharray=".6 1" />
    {BRIDGES.map(bridge => <polyline key={bridge.id} points={bridge.points.map(p => `${p[0]},${p[2]}`).join(' ')} fill="none" stroke={bridge.fromId === districtId || bridge.toId === districtId ? '#91b6bb' : '#49666d'} strokeWidth={expanded ? 1.1 : .8} strokeLinecap="round" />)}
    <circle cx="0" cy="0" r={HUB.radius - .5} fill="#64a9a7" fillOpacity=".35" stroke="#8ccfc5" strokeWidth=".35" />
    {DISTRICTS.map(district => {
      const visited = progress.districts.includes(district.id)
      return <g key={district.id}>
        <circle cx={district.center[0]} cy={district.center[2]} r={district.radius - .35} fill={district.color} fillOpacity={visited ? .64 : .25} stroke={district.color} strokeWidth={districtId === district.id ? .7 : .25} />
        {targetId === district.id && <circle className="map-target" cx={district.center[0]} cy={district.center[2]} r={district.radius + .45} stroke={district.color} strokeWidth=".35" strokeDasharray="1 1" fill="none" />}
        <text x={district.center[0]} y={district.center[2] + .8} textAnchor="middle" fill="#effbfa" fontSize={expanded ? 2.5 : 3.1} fontWeight="600">{district.order}</text>
      </g>
    })}
    {expanded && STATIONS.map(station => <circle key={station.id} cx={station.position[0]} cy={station.position[2]} r=".48" fill={progress.stations.includes(station.id) ? '#f8dca4' : '#203842'} stroke="#e7f6ed" strokeWidth=".14" />)}
    <circle cx={position[0]} cy={position[2]} r={expanded ? 1 : 1.35} fill="#dcfffb" stroke="#193c44" strokeWidth=".45" />
    <circle cx={position[0]} cy={position[2]} r=".35" fill="#3c9b9f" />
    <text x="27" y="-24.5" fill="#a3c6c8" fontSize="2.2" textAnchor="middle">N</text>
  </svg>
}
