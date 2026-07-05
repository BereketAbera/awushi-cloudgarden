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
type Props = { simulation: SimulationState; environment: EnvironmentId; reducedMotion: boolean }

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

function ActivityIndicator({ simulation, reducedMotion }: Pick<Props, 'simulation' | 'reducedMotion'>) {
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
  const color = simulation.status === 'failed' ? '#ff756d' : simulation.status === 'waiting-approval' ? '#ffd585' : simulation.status === 'retrying' ? '#b5efa4' : '#74ede1'
  useEffect(() => { materials.forEach(material => { material.color.set(color); material.emissive.set(color); material.emissiveIntensity = .35 }) }, [color, materials])
  const stage = stageById(simulation.stageId)
  const station = stage ? getStation(stage.stationId) : undefined
  const active = ['running', 'retrying', 'waiting-approval', 'failed'].includes(simulation.status)
  useFrame(({ clock }) => {
    root.current.visible = active && Boolean(station)
    if (!station) return
    root.current.position.set(station.position[0], station.position[1] + .025, station.position[2])
    const pulse = reducedMotion ? 1 : 1 + Math.sin(clock.elapsedTime * 2) * .025
    root.current.scale.set((station.radius + .22) / .36 * pulse, .4, (station.radius + .22) / .36 * pulse)
    root.current.rotation.y = reducedMotion ? 0 : clock.elapsedTime * .22
  })
  return <group ref={root} visible={false}><primitive object={object} dispose={null} /></group>
}

function PodPart({ source, simulation, environment }: { source: Mesh; simulation: SimulationState; environment: EnvironmentId }) {
  const instances = useRef<InstancedMesh>(null!)
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
      instances.current.setColorAt(index, new Color(pod.status === 'old' ? '#8e9ca1' : pod.ready ? '#dcfff4' : '#ffcb72'))
    })
    instances.current.instanceMatrix.needsUpdate = true
    if (instances.current.instanceColor) instances.current.instanceColor.needsUpdate = true
    instances.current.computeBoundingSphere()
  }, [env.pods, count, dummy, station])
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
export function SimulationEffects({ simulation, environment, reducedMotion }: Props) {
  const visualClock = useRef(simulation.clock)
  const last = useRef({ engine: simulation.clock, renderedAt: 0 })
  const effects = useMemo(() => recentEventEffects(simulation.history, environment), [simulation.history, environment])
  useFrame(({ clock }) => {
    if (last.current.engine !== simulation.clock || last.current.renderedAt === 0) last.current = { engine: simulation.clock, renderedAt: clock.elapsedTime }
    visualClock.current = simulation.clock + Math.max(0, clock.elapsedTime - last.current.renderedAt) * 1000
  })
  const env = simulation.infra.environments[environment]
  return <group name="SimulationEventEffects">
    {effects.map(effect => <EventPacket key={`${simulation.runId}-${effect.id}`} effect={effect} clock={visualClock} reducedMotion={reducedMotion} />)}
    {simulation.environment === environment && <ActivityIndicator simulation={simulation} reducedMotion={reducedMotion} />}
    <PodDisplay simulation={simulation} environment={environment} />
    <ReadyLink from="kubernetes" to="network" visible={env.serviceReady} color="#8ce6bd" />
    <ReadyLink from="network" to="observability" visible={env.metrics.collected && env.ingressReady} color="#9bcaef" />
  </group>
}
