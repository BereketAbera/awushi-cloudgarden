import { useMemo, useState, type CSSProperties } from 'react'
import { ArrowRight, Database, ExternalLink, MapPin } from 'lucide-react'
import { DISTRICTS, STATIONS, getDistrict, getStation } from '../worldConfig'
import { GRAPH_EDGES, TECHNOLOGIES, technologiesForStation, technologyById, type Technology } from '../simulation/registry'
import { stationSnapshot } from '../simulation/engine'
import { DEPLOYMENT_STAGES } from '../simulation/scenario'
import type { EnvironmentId, SimulationCommand, SimulationState } from '../simulation/domain'

export function InfrastructureSnapshot({ state, stationId, environment }: { state: SimulationState; stationId: string; environment: EnvironmentId }) {
  const fields = stationSnapshot(state, stationId, environment)
  const shared = ['github', 'ci', 'registry', 'containers', 'supply-chain'].includes(stationId)
  const scope = shared ? state.status !== 'idle' ? `Shared · latest ${state.environment} run` : 'Shared infrastructure' : stationId === 'delivery' ? `Shared proposal · inspecting ${environment}` : environment
  return <section className="infrastructure-snapshot" aria-label="Current simulated state"><div className="snapshot-heading"><span className="status-dot" /><strong>SIMULATED STATE</strong><small>{scope}</small></div><dl data-testid="station-state">{fields.map(field => <div key={field.label} className={`tone-${field.tone ?? 'neutral'}`}><dt>{field.label}</dt><dd>{field.value}</dd></div>)}</dl></section>
}

function TechnologyDetails({ technology, onSelect, onLocate }: { technology: Technology; onSelect: (id: string) => void; onLocate: (stationId: string) => void }) {
  return <div className="technology-details" data-testid="technology-detail">
    <div className="technology-title"><h3>{technology.name}</h3><button className="text-button" data-testid="locate-technology" onClick={() => onLocate(technology.stationId)}><MapPin size={14} />Find in world</button></div>
    <p className="technology-summary">{technology.summary}</p><p className="technology-role"><strong>Its role</strong>{technology.role}</p>
    <div className="technology-io"><div><h4>Receives</h4><ul>{technology.inputs.map(input => <li key={input}>{input}</li>)}</ul></div><div><h4>Produces</h4><ul>{technology.outputs.map(output => <li key={output}>{output}</li>)}</ul></div></div>
    <div className="related-technologies"><span>CONNECTED TO</span>{technology.relatedIds.map(id => { const related = technologyById(id); return related ? <button key={id} onClick={() => onSelect(id)}>{related.name}<ArrowRight size={11} /></button> : null })}</div>
    <details className="technology-advanced"><summary>Technical details & source documentation</summary><ul>{technology.details.map(detail => <li key={detail}>{detail}</li>)}</ul><div className="technology-sources">{technology.sources.map(source => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.title}<ExternalLink size={11} /></a>)}</div></details>
  </div>
}

type StationProps = { stationId: string; state: SimulationState; environment: EnvironmentId; onEnvironment: (value: EnvironmentId) => void; onCommand: (command: SimulationCommand) => void; onLocate: (stationId: string) => void; onOpenSimulation: () => void; readOnly?: boolean }
export function StationTechnologyPanel({ stationId, state, environment, onEnvironment, onCommand, onLocate, onOpenSimulation, readOnly = false }: StationProps) {
  const technologies = technologiesForStation(stationId)
  const [selectedId, setSelectedId] = useState(technologies[0]?.id)
  const selected = technologyById(selectedId ?? '') ?? technologies[0]
  const busy = readOnly || ['running', 'waiting-approval', 'retrying'].includes(state.status)
  const selectRelated = (id: string) => setSelectedId(id)
  return <div className="station-technologies">
    <div className="station-panel-tools"><span>{technologies.length} connected {technologies.length === 1 ? 'technology' : 'technologies'}</span><label>Environment<select value={environment} onChange={event => onEnvironment(event.target.value as EnvironmentId)} aria-label="Station environment"><option value="development">Development</option><option value="production">Production</option></select></label></div>
    <div className="technology-tabs" aria-label="Technologies at this station">{technologies.map(technology => <button key={technology.id} data-testid={`technology-${technology.id}`} onClick={() => setSelectedId(technology.id)} aria-pressed={selected?.id === technology.id}>{technology.name}</button>)}</div>
    {selected && selected.stationId !== stationId && <p className="related-facility">Related facility: {getStation(selected.stationId)?.name}</p>}
    {selected && <TechnologyDetails technology={selected} onSelect={selectRelated} onLocate={onLocate} />}
    <InfrastructureSnapshot state={state} stationId={selected?.stationId ?? stationId} environment={environment} />
    {['database', 'recovery', 'messaging'].includes(stationId) && <div className="data-actions"><button className="secondary-button" data-testid="create-backup" disabled={busy} onClick={() => onCommand({ type: 'backup', environment })}><Database size={14} />Create simulated backup</button><button className="secondary-button" data-testid="restore-backup" disabled={busy || !state.infra.environments[environment].data.backup} onClick={() => onCommand({ type: 'restore', environment })}>Restore saved snapshot</button><small>These operations change only this environment’s in-memory learning state.</small></div>}
    <button className="primary-button" onClick={onOpenSimulation}><ArrowRight size={15} />{readOnly ? 'Open the adventure console' : 'Open the deployment lab'}</button>
  </div>
}

type ArchitectureProps = { state: SimulationState; environment: EnvironmentId; onEnvironment: (value: EnvironmentId) => void; onLocate: (stationId: string) => void }
export function ArchitectureExplorer({ state, environment, onEnvironment, onLocate }: ArchitectureProps) {
  const [selectedId, setSelectedId] = useState('github')
  const [filter, setFilter] = useState('')
  const [flow, setFlow] = useState('selected')
  const selected = technologyById(selectedId) ?? TECHNOLOGIES[0]
  const selectedStation = getStation(selected.stationId)
  const facilities = useMemo(() => STATIONS.filter(station => technologiesForStation(station.id).length).map(station => {
    const district = getDistrict(station.districtId)!
    const siblings = STATIONS.filter(item => item.districtId === station.districtId)
    return { ...station, x: (district.order - 1) * 174 + 12, y: siblings.findIndex(item => item.id === station.id) * 100 + 54, color: district.color }
  }), [])
  const visibleEdges = useMemo(() => {
    const seen = new Set<string>()
    return GRAPH_EDGES.flatMap(edge => {
      const from = technologyById(edge.from), to = technologyById(edge.to)
      if (!from || !to || from.stationId === to.stationId) return []
      const fromDistrict = getStation(from.stationId)?.districtId, toDistrict = getStation(to.stationId)?.districtId
      if (flow === 'selected' && from.stationId !== selected.stationId && to.stationId !== selected.stationId) return []
      if (['security', 'observability', 'data'].includes(flow) && fromDistrict !== flow && toDistrict !== flow) return []
      if (flow === 'delivery' && !DEPLOYMENT_STAGES.some(stage => stage.fromStationId === from.stationId && stage.toStationId === to.stationId)) return []
      const key = `${from.stationId}:${to.stationId}`
      if (seen.has(key)) return []
      seen.add(key)
      return [{ ...edge, from: facilities.find(item => item.id === from.stationId)!, to: facilities.find(item => item.id === to.stationId)! }]
    })
  }, [facilities, selected.stationId, flow])
  const matching = TECHNOLOGIES.filter(technology => `${technology.name} ${technology.summary}`.toLowerCase().includes(filter.toLowerCase()))
  return <div className="architecture-explorer" data-testid="architecture-explorer">
    <div className="architecture-toolbar"><label className="technology-search">Find a technology<input value={filter} onChange={event => setFilter(event.target.value)} placeholder="Try Argo CD, secrets, PostgreSQL…" type="search" data-testid="technology-search" /></label><label>Inspect environment<select aria-label="Architecture environment" value={environment} onChange={event => onEnvironment(event.target.value as EnvironmentId)}><option value="development">Development</option><option value="production">Production</option></select></label></div>
    <p className="architecture-explanation">Select a facility to see its connections, then choose a technology. All infrastructure states are simulated; the graph and world share the same station registry.</p>
    <div className="architecture-flow-tabs" aria-label="Architecture relationship lens">{[{ id: 'selected', label: 'Selected component' }, { id: 'delivery', label: 'Delivery lifecycle' }, { id: 'security', label: 'Security boundaries' }, { id: 'observability', label: 'Observability flows' }, { id: 'data', label: 'Data dependencies' }].map(item => <button key={item.id} aria-pressed={flow === item.id} data-testid={`architecture-flow-${item.id}`} onClick={() => setFlow(item.id)}>{item.label}</button>)}</div>
    <div className="architecture-boundary" data-testid="architecture-boundary"><strong>One modeled kind cluster · two environments</strong><span>{state.infra.environments[environment].namespace} · {state.infra.environments[environment].secretRef} · {state.infra.environments[environment].config.host}</span><small>Namespaces separate configuration and scoped access. They share cluster, host and kernel; NetworkPolicy enforcement requires a supporting CNI.</small></div>
    <div className="architecture-graph-scroll" tabIndex={0} aria-label="Infrastructure relationships, scroll horizontally on smaller screens"><div className="architecture-graph" style={{ width: 1050, height: 358 }}>
      {DISTRICTS.map(district => <span key={district.id} className="architecture-column-label" style={{ left: (district.order - 1) * 174 + 12, color: district.color }}>{district.name}</span>)}
      <svg viewBox="0 0 1050 358" aria-hidden="true"><defs><marker id="architecture-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7" fill="#b6ded8" /></marker></defs>{visibleEdges.map(edge => <path key={edge.id} d={`M ${edge.from.x + 75} ${edge.from.y + 34} C ${edge.from.x + 75} ${edge.from.y - 16}, ${edge.to.x + 75} ${edge.to.y - 16}, ${edge.to.x + 75} ${edge.to.y + 34}`} fill="none" stroke="#b6ded8" strokeWidth="1.6" strokeOpacity=".65" markerEnd="url(#architecture-arrow)" />)}</svg>
      {facilities.map(facility => { const count = technologiesForStation(facility.id).length; return <button key={facility.id} style={{ left: facility.x, top: facility.y, '--place-color': facility.color } as CSSProperties} className={`architecture-node ${selected.stationId === facility.id ? 'selected' : ''}`} data-testid={`architecture-station-${facility.id}`} aria-pressed={selected.stationId === facility.id} onClick={() => setSelectedId(technologiesForStation(facility.id)[0].id)}><span>{facility.name}</span><small>{count} {count === 1 ? 'technology' : 'technologies'}</small></button> })}
    </div></div>
    <details className="architecture-flow-details"><summary>{visibleEdges.length} facility connections · inspect the selected flow</summary><ul>{visibleEdges.map(edge => <li key={edge.id}><strong>{edge.from.name} → {edge.to.name}</strong><span>{edge.label}</span></li>)}</ul></details>
    <details className="architecture-flow-details" data-testid="architecture-lifecycle"><summary>Trace the deployment lifecycle · 22 stages</summary><ol>{DEPLOYMENT_STAGES.map(stage => <li key={stage.id} aria-current={state.stageId === stage.id ? 'step' : undefined}><strong>{stage.title}</strong><span>{stage.actor === 'human' ? 'Human approval' : 'Automated'} · {stage.description}</span></li>)}</ol></details>
    <div className="architecture-inspector"><nav className="technology-directory" aria-label="Technology registry">{matching.map(technology => <button key={technology.id} onClick={() => setSelectedId(technology.id)} data-testid={`architecture-technology-${technology.id}`} aria-pressed={selected.id === technology.id} className={selected.id === technology.id ? 'selected' : ''}>{technology.name}<small>{getDistrict(getStation(technology.stationId)?.districtId ?? '')?.label}</small></button>)}{matching.length === 0 && <p>No technology matches that search.</p>}</nav><section className="architecture-selected"><div className="eyebrow">{selectedStation?.name}</div><TechnologyDetails technology={selected} onSelect={setSelectedId} onLocate={onLocate} /><InfrastructureSnapshot state={state} stationId={selected.stationId} environment={environment} /></section></div>
    <div className="architecture-legend"><span><i />Available: simulated delivery, state inspection, backup & restore.</span><span>Six adventures connect these responsibilities. No live accounts are connected.</span></div>
  </div>
}
