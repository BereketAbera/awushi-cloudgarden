import { useState } from 'react'
import { ArrowDown, ArrowRight, Box, Braces, Compass, Cpu, Layers, Play, ShieldCheck, Sparkles, Workflow } from 'lucide-react'
import { TECHNOLOGIES, GRAPH_EDGES } from '../simulation/registry'
import '../adventures/adventures.css'

/** A small invitation on the landing page; the world remains the main illustration. */
export function PortfolioHighlights({ onShowcase }: { onShowcase: () => void }) {
  return <section className="portfolio-highlights" aria-label="Project engineering highlights">
    <p><span>Built from first principles.</span> A procedural character, a navigable world, and infrastructure you can reason about.</p>
    <div className="portfolio-tags"><span><Box size={12} />Local Blender assets</span><span><Workflow size={12} />Deterministic adventures</span><span><Braces size={12} />React Three Fiber</span></div>
    <button className="text-button" onClick={onShowcase} data-testid="open-showcase">See how this little world works<ArrowRight size={14} /></button>
  </section>
}

const layers = [
  { id: 'authoring', number: '01', title: 'Author the world', subtitle: 'Python → Blender → GLB', icon: Box, description: 'Procedural Python builds the character, terrain, facilities and reusable effects. Editable Blender scenes and multi-angle previews travel with the exported models.', detail: 'Awushi uses a skeletal rig for five reusable clips and an independent facial morph layer for ten expressions. Local materials and a packed procedural eye texture keep generation reproducible.', files: ['scripts/blender/generate_awushi.py', 'scripts/blender/generate_world.py', 'scripts/blender/generate_effects.py'] },
  { id: 'model', number: '02', title: 'Model the consequences', subtitle: 'Commands → state → events', icon: Workflow, description: 'A typed infrastructure reducer owns delivery and recovery. Adventure orchestration adds evidence, decisions and learning objectives while reusing that same model.', detail: 'An injected logical clock makes transitions deterministic. Animation never decides whether a deployment succeeded. Development and production retain independent state inside an explicitly shared cluster boundary.', files: ['src/simulation/engine.ts', 'src/adventures/engine.ts', 'src/simulation/registry.ts'] },
  { id: 'present', number: '03', title: 'Bring it to life', subtitle: 'Events → world + interface', icon: Compass, description: 'React presents the mission and evidence. React Three Fiber and Three.js render Awushi, the islands and event effects as a view of the current infrastructure.', detail: 'Perspective follow and eye-level cameras share authored collision geometry with player movement. Cached geometry, bounded effects and instanced displays keep the miniature world responsive.', files: ['src/Scene.tsx', 'src/game/camera.ts', 'src/simulation/SimulationEffects.tsx'] },
  { id: 'verify', number: '04', title: 'Keep the story trustworthy', subtitle: 'Save → replay → verify', icon: ShieldCheck, description: 'Versioned local saves preserve the journey. Replay reuses the same commands and logical timing without changing the completed record.', detail: 'Unit tests exercise invariants and wrong decisions; browser tests operate the real interface. GLB checks inspect actual exported buffers. Performance is measured locally, with browser emulation kept distinct from physical-device testing.', files: ['src/adventures/persistence.ts', 'src/adventures/replay.ts', 'tests/browser/', 'scripts/validate-assets.mjs'] },
] as const

export function EngineeringShowcase({ onPlay, onArchitecture }: { onPlay: () => void; onArchitecture: () => void }) {
  const [selected, setSelected] = useState<(typeof layers)[number]['id']>('model')
  const layer = layers.find(item => item.id === selected)!
  return <div className="engineering-showcase" data-testid="engineering-showcase">
    <p className="showcase-intro">A small adventure with a serious foundation. Every asset, interaction and infrastructure consequence is inspectable in the local project.</p>
    <div className="showcase-facts"><span><b>6</b> hands-on adventures</span><span><b>{TECHNOLOGIES.length}</b> connected technologies</span><span><b>{GRAPH_EDGES.length}</b> modeled relationships</span><span><b>100%</b> local gameplay</span></div>
    <div className="showcase-diagram" role="group" aria-label="Engineering architecture: choose a layer to inspect">
      {layers.map((item, index) => { const Icon = item.icon; return <div className="showcase-layer-wrap" key={item.id}>
        <button className={`showcase-layer ${selected === item.id ? 'selected' : ''}`} onClick={() => setSelected(item.id)} aria-pressed={selected === item.id} data-testid={`showcase-layer-${item.id}`}><span className="showcase-layer-number">{item.number}</span><Icon size={23} /><strong>{item.title}</strong><small>{item.subtitle}</small></button>
        {index < layers.length - 1 && <ArrowDown className="showcase-connector" size={17} aria-hidden="true" />}
      </div> })}
    </div>
    <section className="showcase-detail" aria-live="polite" aria-atomic="true"><div className="eyebrow">INSIDE THE SYSTEM / {layer.number}</div><h3>{layer.title}</h3><p>{layer.description}</p><p className="showcase-technical">{layer.detail}</p><div className="showcase-code"><span>Repository reference</span>{layer.files.map(path => <code key={path}>{path}</code>)}</div></section>
    <div className="showcase-principles"><article><Cpu size={19} /><h4>One source of truth</h4><p>The graph, stations and adventures share technology bindings and infrastructure state.</p></article><article><Layers size={19} /><h4>Honest boundaries</h4><p>Metrics, releases and recovery are simulated. No credentials or cloud connection are required.</p></article><article><Sparkles size={19} /><h4>A companion, not a narrator</h4><p>Awushi reacts to investigation, uncertainty and recovery while leaving the decisions to you.</p></article></div>
    <div className="showcase-actions"><button className="primary-button" onClick={onPlay}><Play size={15} />Choose an adventure</button><button className="secondary-button" onClick={onArchitecture}><Workflow size={15} />Inspect the architecture</button></div>
  </div>
}
