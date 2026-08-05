import { useEffect, useMemo, useRef, type MutableRefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { Color, Group, InstancedMesh, Mesh, MeshStandardMaterial, Object3D, QuadraticBezierCurve3, Vector3, type Material } from 'three'
import { getStation } from '../worldConfig'
import type { EnvironmentId, SimulationState } from './domain'
import { stageById } from './scenario'
import { effectPosition, recentEventEffects, type EventEffect } from './effects'

const ASSET = '/assets/deployment-effects.glb'
type VisualClock = MutableRefObject<number>
type Props = { simulation: SimulationState; environment: EnvironmentId; reducedMotion: boolean; paused?: boolean }

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

function EventPacket({ effect, clock, reducedMotion }: { effect: EventEffect; clock: VisualClock; reducedMotion: boolean }) {
  const group = useRef<Group>(null!)
  useFrame(() => {
    const age = clock.current - effect.timestamp
    group.current.visible = age >= 0 && age < effect.durationMs
    if (!group.current.visible) return
    const progress = age / effect.durationMs
    group.current.position.fromArray(effectPosition(effect, progress, reducedMotion))
    group.current.rotation.y = reducedMotion ? 0 : Math.atan2(effect.to[0] - effect.from[0], effect.to[2] - effect.from[2])
    const size = reducedMotion ? .8 : Math.min(1, progress * 7, (1 - progress) * 7) * 1.05
    group.current.scale.setScalar(size)
  })
  return <group ref={group} visible={false}><Prototype name={effect.prototype} /></group>
}

function FacilityIndicator({ stationId, color, active, reducedMotion, clock, until }: { stationId: string | null; color: string; active: boolean; reducedMotion: boolean; clock?: VisualClock; until?: number }) {
  const root = useRef<Group>(null!)
  const { scene } = useGLTF(ASSET)
  const { object, materials } = useMemo(() => {
    const object = scene.getObjectByName('SyncRing')!.clone(true)
    const materials: MeshStandardMaterial[] = []
    object.traverse(node => {
      if (!(node instanceof Mesh)) return
      node.material = (Array.isArray(node.material) ? node.material : [node.material]).map(source => {
        const material = source.clone() as MeshStandardMaterial
        materials.push(material); return material
      })
      if (node.material.length === 1) node.material = node.material[0]
    })
    return { object, materials }
  }, [scene])
  useEffect(() => () => materials.forEach(material => material.dispose()), [materials])
  useEffect(() => { materials.forEach(material => { material.color.set(color); material.emissive.set(color); material.emissiveIntensity = .35 }) }, [color, materials])
  const station = stationId ? getStation(stationId) : undefined
  useFrame(({ clock: rendererClock }) => {
    root.current.visible = active && Boolean(station) && (until === undefined || !clock || clock.current < until)
    if (!station) return
    root.current.position.set(station.position[0], station.position[1] + .025, station.position[2])
    const pulse = reducedMotion ? 1 : 1 + Math.sin(rendererClock.elapsedTime * 2) * .025
    root.current.scale.set((station.radius + .22) / .36 * pulse, .4, (station.radius + .22) / .36 * pulse)
    root.current.rotation.y = reducedMotion ? 0 : rendererClock.elapsedTime * .22
  })
  return <group ref={root} visible={false}><primitive object={object} dispose={null} /></group>
}

function ActivityIndicator({ simulation, reducedMotion }: Pick<Props, 'simulation' | 'reducedMotion'>) {
  const color = simulation.status === 'failed' ? '#ff756d' : simulation.status === 'waiting-approval' ? '#ffd585' : '#74ede1'
  return <FacilityIndicator stationId={stageById(simulation.stageId)?.stationId ?? null} color={color} active={['running', 'retrying', 'waiting-approval', 'failed'].includes(simulation.status)} reducedMotion={reducedMotion} />
}
function OperationalIndicators({ simulation, environment, reducedMotion, clock }: Pick<Props, 'simulation' | 'environment' | 'reducedMotion'> & { clock: VisualClock }) {
  const env = simulation.infra.environments[environment], ops = env.operations
  const recent = simulation.history.filter(event => event.environment === environment && event.visual && ['stage-completed', 'operation'].includes(event.type)).at(-1)
  return <group name="OperationalFacilityFeedback">
    {ops?.pod && !ops.pod.corrected && <FacilityIndicator stationId="kubernetes" color="#ff8b7e" active reducedMotion={reducedMotion} />}
    {ops?.drift && !ops.drift.corrected && <FacilityIndicator stationId="gitops" color="#ffd585" active reducedMotion={reducedMotion} />}
    {env.alert === 'firing' && <FacilityIndicator stationId="alerts" color="#ff8b7e" active reducedMotion={reducedMotion} />}
    {ops?.recovery && !ops.recovery.validated && <FacilityIndicator stationId={ops.recovery.databaseRestored ? 'recovery' : 'database'} color={ops.recovery.databaseRestored ? '#a8e2cf' : '#ffd585'} active reducedMotion={reducedMotion} />}
    {recent?.visual && <FacilityIndicator key={recent.id} stationId={recent.visual.toStationId} color={recent.visual.kind === 'failure' ? '#ff8b7e' : '#b7f4df'} active reducedMotion={reducedMotion} clock={clock} until={recent.timestamp + 1400} />}
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
export function SimulationEffects({ simulation, environment, reducedMotion, paused = false }: Props) {
  const visualClock = useRef(simulation.clock)
  const last = useRef({ engine: simulation.clock, renderedAt: 0 })
  const effects = useMemo(() => recentEventEffects(simulation.history, environment), [simulation.history, environment])
  useFrame(({ clock }) => {
    if (paused) { visualClock.current = simulation.clock; last.current = { engine: simulation.clock, renderedAt: clock.elapsedTime }; return }
    if (last.current.engine !== simulation.clock || last.current.renderedAt === 0) last.current = { engine: simulation.clock, renderedAt: clock.elapsedTime }
    visualClock.current = simulation.clock + Math.max(0, clock.elapsedTime - last.current.renderedAt) * 1000
  })
  const env = simulation.infra.environments[environment]
  return <group name="SimulationEventEffects">
    {effects.map(effect => <EventPacket key={`${simulation.runId}-${effect.id}`} effect={effect} clock={visualClock} reducedMotion={reducedMotion} />)}
    {simulation.environment === environment && <ActivityIndicator simulation={simulation} reducedMotion={reducedMotion || paused} />}
    <OperationalIndicators simulation={simulation} environment={environment} reducedMotion={reducedMotion || paused} clock={visualClock} />
    <PodDisplay simulation={simulation} environment={environment} />
    <ReadyLink from="kubernetes" to="network" visible={env.serviceReady} color="#8ce6bd" />
    <ReadyLink from="network" to="observability" visible={env.metrics.collected && env.ingressReady} color="#9bcaef" />
  </group>
}
