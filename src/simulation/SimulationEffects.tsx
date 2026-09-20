import { useEffect, useMemo, useRef, type MutableRefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html, useGLTF } from '@react-three/drei'
import { Color, Group, InstancedMesh, Mesh, Object3D, QuadraticBezierCurve3, Vector3, type Material } from 'three'
import { getStation } from '../worldConfig'
import type { EnvironmentId, SimulationState } from './domain'
import { FLOW_STYLE, effectPosition, recentEventEffects, type EventEffect } from './effects'

const ASSET = '/assets/deployment-effects.glb'
type VisualClock = MutableRefObject<number>
type Props = { simulation: SimulationState; environment: EnvironmentId; reducedMotion: boolean; paused?: boolean; labelsVisible?: boolean }

function Prototype({ name }: { name: string }) {
  const { scene } = useGLTF(ASSET)
  const object = useMemo(() => {
    const prototype = scene.getObjectByName(name)
    if (!prototype) throw new Error(`Deployment effect prototype is missing: ${name}`)
    return prototype.clone(true)
  }, [scene, name])
  // The useGLTF cache owns shared geometry and materials; each clone owns only its hierarchy.
  return <primitive object={object} dispose={null} />
}

function FlowSymbol({ effect }: { effect: EventEffect }) {
  const style = FLOW_STYLE[effect.kind]
  if (effect.kind === 'metrics') return <group>{[.2, .4, .7].map((height, index) => <mesh key={index} position={[(index - 1) * .23, height / 2, 0]}><boxGeometry args={[.15, height, .16]} /><meshBasicMaterial color={style.color} toneMapped={false} /></mesh>)}</group>
  if (effect.kind === 'logs') return <group>{[0, 1, 2].map(index => <mesh key={index} position={[0, index * .18, 0]}><boxGeometry args={[.68 - index * .1, .09, .12]} /><meshBasicMaterial color={style.color} toneMapped={false} /></mesh>)}</group>
  if (effect.kind === 'traffic') return <group>{[-.17, .17].map(offset => <mesh key={offset} position={[0, 0, offset]} rotation={[Math.PI / 2, 0, 0]}><coneGeometry args={[.22, .28, 3]} /><meshBasicMaterial color={style.color} toneMapped={false} /></mesh>)}</group>
  if (effect.kind === 'alert') return <mesh><octahedronGeometry args={[.4, 0]} /><meshBasicMaterial color={style.color} toneMapped={false} /></mesh>
  if (effect.kind === 'secret') return <group><mesh><boxGeometry args={[.5, .4, .25]} /><meshBasicMaterial color={style.color} /></mesh><mesh position={[0, .3, 0]}><torusGeometry args={[.17, .045, 6, 12, Math.PI]} /><meshBasicMaterial color={style.color} /></mesh></group>
  return <Prototype name={effect.prototype} />
}
function EventPacket({ effect, clock, reducedMotion, prominent, labelsVisible, acknowledge }: { effect: EventEffect; clock: VisualClock; reducedMotion: boolean; prominent: boolean; labelsVisible: boolean; acknowledge: boolean }) {
  const group = useRef<Group>(null!), route = useRef<Group>(null!), arrival = useRef<Group>(null!)
  const packetLabel = useRef<HTMLSpanElement>(null), arrivalLabel = useRef<HTMLSpanElement>(null)
  const style = FLOW_STYLE[effect.kind]
  const sameStation = effect.fromStationId === effect.toStationId
  const compact = useThree(state => state.size.width < 600)
  const { from, to } = effect
  const curve = useMemo(() => {
    const route = { from, to }
    const start = effectPosition(route, 0, false), end = effectPosition(route, 1, false), midpoint = effectPosition(route, .5, false)
    return new QuadraticBezierCurve3(new Vector3(...start), new Vector3(midpoint[0], midpoint[1] * 2 - (start[1] + end[1]) / 2, midpoint[2]), new Vector3(...end))
  }, [from, to])
  const points = useMemo(() => [.2, .5, .8].map(progress => ({ point: curve.getPoint(progress), direction: curve.getTangent(progress) })), [curve])
  useFrame(() => {
    const age = clock.current - effect.timestamp
    const traveling = age >= 0 && age < effect.durationMs
    group.current.visible = traveling
    route.current.visible = (prominent || effect.kind === 'secret') && !sameStation && age >= 0 && age < effect.durationMs + 900
    arrival.current.visible = acknowledge && effect.acknowledged && age >= effect.durationMs && age < effect.durationMs + 1100
    if (packetLabel.current) packetLabel.current.style.display = traveling ? 'inline-block' : 'none'
    if (arrivalLabel.current) arrivalLabel.current.style.display = arrival.current.visible ? 'inline-block' : 'none'
    if (arrival.current.visible) arrival.current.scale.setScalar(reducedMotion ? 1 : 1 + Math.min(1, (age - effect.durationMs) / 1100) * .35)
    if (!traveling) return
    const progress = age / effect.durationMs
    group.current.position.fromArray(effectPosition(effect, progress, reducedMotion))
    group.current.rotation.y = reducedMotion ? 0 : Math.atan2(effect.to[0] - effect.from[0], effect.to[2] - effect.from[2])
    group.current.scale.setScalar(prominent ? 1.45 : .95)
  })
  return <group name={`Flow-${effect.kind}`}>
    <group ref={route} visible={false}>
      <mesh><tubeGeometry args={[curve, 32, .045, 6, false]} /><meshBasicMaterial color={style.color} transparent opacity={prominent ? .8 : .35} toneMapped={false} depthWrite={false} /></mesh>
      {points.map(({ point, direction }, index) => <mesh key={index} position={point} rotation={[Math.PI / 2, 0, -Math.atan2(direction.x, direction.z)]}><coneGeometry args={[.2, .48, 3]} /><meshBasicMaterial color={style.color} toneMapped={false} /></mesh>)}
    </group>
    <group ref={group} visible={false}><FlowSymbol effect={effect} />{(prominent || effect.kind === 'secret') && labelsVisible && !compact && <Html center position={[0, .8, 0]} zIndexRange={[7, 0]} style={{ pointerEvents: 'none' }}><span ref={packetLabel} data-testid="flow-packet-label" data-flow-kind={effect.kind} style={{ display: 'none', whiteSpace: 'nowrap', background: '#071923ef', color: style.color, border: `1px solid ${style.color}`, borderRadius: 7, padding: '4px 8px', fontSize: 11, fontWeight: 700 }}>{style.glyph} {style.label}</span></Html>}</group>
    <group ref={arrival} visible={false} position={[effect.to[0], effect.to[1] + 3.2, effect.to[2]]}>
      <mesh rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[.6, .075, 6, 24]} /><meshBasicMaterial color={effect.outcome === 'failed' ? '#ffb093' : '#98f5c7'} toneMapped={false} /></mesh>
      {labelsVisible && !sameStation && !compact && <Html center position={[0, .8, 0]} zIndexRange={[7, 0]} style={{ pointerEvents: 'none' }}><span ref={arrivalLabel} data-testid="flow-arrival" style={{ display: 'none', whiteSpace: 'nowrap', background: '#071923ef', color: effect.outcome === 'failed' ? '#ffb093' : '#98f5c7', padding: '4px 8px', borderRadius: 7, fontSize: 11 }}>{effect.outcome === 'failed' ? '! Failure reported' : '✓ Destination updated'}</span></Html>}
    </group>
  </group>
}

function PodPart({ source, simulation, environment }: { source: Mesh; simulation: SimulationState; environment: EnvironmentId }) {
  const instances = useRef<InstancedMesh>(null!)
  useEffect(() => { const mesh = instances.current; return () => { mesh.dispose() } }, [])
  const dummy = useMemo(() => new Object3D(), [])
  const env = simulation.infra.environments[environment]
  const station = getStation('kubernetes')!
  const count = Math.min(8, env.pods.length)
  useEffect(() => {
    instances.current.count = count
    env.pods.slice(0, 8).forEach((pod, index) => {
      const angle = index / Math.max(count, 3) * Math.PI * 2
      dummy.position.set(station.position[0] + Math.cos(angle) * .72, station.position[1] + 3.05, station.position[2] + Math.sin(angle) * .72)
      dummy.rotation.y = -angle; dummy.scale.setScalar(.7); dummy.updateMatrix()
      instances.current.setMatrixAt(index, dummy.matrix)
      instances.current.setColorAt(index, new Color(pod.status === 'old' ? '#8e9ca1' : pod.ready ? '#dcfff4' : env.operations?.pod && !env.operations.pod.corrected ? '#ff8b7e' : '#ffcb72'))
    })
    instances.current.instanceMatrix.needsUpdate = true
    if (instances.current.instanceColor) instances.current.instanceColor.needsUpdate = true
    instances.current.computeBoundingSphere()
  }, [env.pods, env.operations?.pod, count, dummy, station])
  return <instancedMesh ref={instances} args={[source.geometry, source.material as Material, 8]} dispose={null} />
}
function PodDisplay({ simulation, environment }: Pick<Props, 'simulation' | 'environment'>) {
  const { scene } = useGLTF(ASSET)
  const parts = useMemo(() => {
    const meshes: Mesh[] = []
    scene.getObjectByName('PodShell')!.traverse(node => { if (node instanceof Mesh) meshes.push(node) })
    return meshes
  }, [scene])
  return <group name="SimulatedReplicaDisplay">{parts.map((part, index) => <PodPart key={index} source={part} simulation={simulation} environment={environment} />)}</group>
}
function ReadyLink({ from, to, color, visible }: { from: string; to: string; color: string; visible: boolean }) {
  const curve = useMemo(() => {
    const start = getStation(from)!.position, end = getStation(to)!.position
    return new QuadraticBezierCurve3(new Vector3(start[0], start[1] + 1.2, start[2]), new Vector3((start[0] + end[0]) / 2, Math.max(start[1], end[1]) + 2.2, (start[2] + end[2]) / 2), new Vector3(end[0], end[1] + 1.2, end[2]))
  }, [from, to])
  return <mesh visible={visible}><tubeGeometry args={[curve, 32, .018, 6, false]} /><meshBasicMaterial color={color} transparent opacity={.5} depthWrite={false} /></mesh>
}

/** A presentation-only projection of the engine. Never dispatches commands or completes stages. */
export function SimulationEffects({ simulation, environment, reducedMotion, paused = false, labelsVisible = true }: Props) {
  const visualClock = useRef(simulation.clock)
  const last = useRef({ engine: simulation.clock, renderedAt: 0, rate: 1 })
  const effects = useMemo(() => recentEventEffects(simulation.history, environment), [simulation.history, environment])
  useFrame(({ clock }) => {
    if (paused) { visualClock.current = simulation.clock; last.current = { engine: simulation.clock, renderedAt: clock.elapsedTime, rate: 0 }; return }
    if (last.current.engine !== simulation.clock || last.current.renderedAt === 0) {
      const wall = Math.max(.001, clock.elapsedTime - last.current.renderedAt) * 1000
      last.current = { engine: simulation.clock, renderedAt: clock.elapsedTime, rate: Math.max(0, Math.min(4, (simulation.clock - last.current.engine) / wall)) }
    }
    const elapsed = Math.max(0, clock.elapsedTime - last.current.renderedAt) * 1000
    const progressing = simulation.status === 'running' || simulation.status === 'retrying'
    visualClock.current = simulation.clock + (progressing ? Math.min(100, elapsed) * last.current.rate : elapsed)
  })
  const env = simulation.infra.environments[environment]
  const lastAcknowledged = effects.filter(effect => effect.acknowledged).at(-1)?.routeId
  return <group name="SimulationEventEffects">
    {effects.map((effect, index) => <EventPacket key={`${simulation.runId}-${effect.routeId}`} effect={effect} clock={visualClock} reducedMotion={reducedMotion} prominent={index === effects.length - 1} labelsVisible={labelsVisible} acknowledge={effect.routeId === lastAcknowledged} />)}
    <PodDisplay simulation={simulation} environment={environment} />
    <ReadyLink from="kubernetes" to="network" visible={env.serviceReady} color="#8ce6bd" />
    <ReadyLink from="network" to="observability" visible={env.metrics.collected && env.ingressReady} color="#9bcaef" />
  </group>
}
