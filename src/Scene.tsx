import { Component, Suspense, useEffect, useMemo, useRef, type ErrorInfo, type MutableRefObject, type ReactNode } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ContactShadows, Environment, Lightformer, OrbitControls, useAnimations, useGLTF } from '@react-three/drei'
import { NeutralToneMapping, Group, LoopOnce, LoopRepeat, Mesh, Vector3, type AnimationAction } from 'three'
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js'
import type { OrbitControls as OrbitControlsType } from 'three-stdlib'
import { WORLD_ASSETS, WORLD_ASSETS_READY, WORLD_ZONES, type ZoneId } from './worldConfig'

export type Clip = 'Idle' | 'Walk' | 'Run' | 'Interact' | 'Celebrate'
export type View = 'three-quarter' | 'front' | 'side' | 'back'
export type Mode = 'studio' | 'world'
export type AssetInfo = { clips: string[]; triangles: number; meshes: number }
type SceneProps = {
  clip: Clip; playing: boolean; speed: number; mode: Mode; view: View; reset: number
  input: MutableRefObject<Set<string>>
  onClip: (clip: Clip) => void
  onReady: (info: AssetInfo) => void
  onNearby: (zone: ZoneId | null) => void
}

class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('Awushi scene failed to load', error, info.componentStack) }
  render() {
    return this.state.failed ? <div className="scene-error"><span>Something interrupted the little splash.</span><p>Check that the local assets have been generated, then reload the page.</p><button onClick={() => window.location.reload()}>Try again</button></div> : this.props.children
  }
}

function Awushi({ clip, playing, speed, input, reset, mode, onClip, onReady, onNearby }: SceneProps) {
  const source = useGLTF('/assets/awushi.glb')
  const scene = useMemo(() => clone(source.scene), [source.scene])
  const mover = useRef<Group>(null!)
  const { actions, mixer } = useAnimations(source.animations, scene)
  const moving = useRef(false)
  const previousMotion = useRef<Clip>('Idle')
  const targetRotation = useRef(0)
  const currentZone = useRef<ZoneId | null>(null)

  useEffect(() => {
    let triangles = 0, meshes = 0
    scene.traverse((object) => {
      if (object instanceof Mesh) {
        object.castShadow = true
        object.receiveShadow = true
        meshes += 1
        triangles += object.geometry.index ? object.geometry.index.count / 3 : object.geometry.attributes.position.count / 3
      }
    })
    onReady({ clips: source.animations.map((animation) => animation.name), triangles: Math.round(triangles), meshes })
  }, [scene, source.animations, onReady])

  useEffect(() => {
    const action = actions[clip]
    if (!action) return
    action.reset().setEffectiveWeight(1).setEffectiveTimeScale(1)
    action.setLoop(clip === 'Celebrate' || clip === 'Interact' ? LoopOnce : LoopRepeat, Infinity)
    action.clampWhenFinished = clip === 'Celebrate' || clip === 'Interact'
    action.fadeIn(0.22).play()
    return () => { action.fadeOut(0.22) }
  }, [actions, clip])

  useEffect(() => {
    mixer.timeScale = playing ? speed : 0
  }, [mixer, speed, playing])

  useEffect(() => {
    const finish = (event: { action: AnimationAction }) => {
      if (event.action !== actions[clip]) return
      const keys = input.current
      const x = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'))
      const z = Number(keys.has('KeyS') || keys.has('ArrowDown')) - Number(keys.has('KeyW') || keys.has('ArrowUp'))
      onClip(x || z ? (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 'Run' : 'Walk') : 'Idle')
    }
    mixer.addEventListener('finished', finish)
    return () => mixer.removeEventListener('finished', finish)
  }, [mixer, onClip, actions, clip, input])

  useEffect(() => {
    mover.current.position.set(0, 0, 0)
    mover.current.rotation.set(0, 0, 0)
    targetRotation.current = 0
    currentZone.current = null
    onNearby(null)
  }, [reset, mode, onNearby])

  useFrame((_, dt) => {
    const keys = input.current
    const x = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'))
    const z = Number(keys.has('KeyS') || keys.has('ArrowDown')) - Number(keys.has('KeyW') || keys.has('ArrowUp'))
    const oneShot = clip === 'Interact' || clip === 'Celebrate'
    const hasMovement = (x !== 0 || z !== 0) && playing && !oneShot
    if (hasMovement) {
      const running = keys.has('ShiftLeft') || keys.has('ShiftRight')
      const next: Clip = running ? 'Run' : 'Walk'
      if (!moving.current || next !== previousMotion.current) onClip(next)
      previousMotion.current = next
      const length = Math.hypot(x, z)
      const distance = Math.min(dt, 0.05) * (running ? 3.1 : 1.6)
      const nextPosition = mover.current.position.clone()
      nextPosition.x += x / length * distance
      nextPosition.z += z / length * distance
      const inWorld = mode === 'world' && WORLD_ASSETS_READY
      if (inWorld) {
        for (const zone of WORLD_ZONES) {
          const dx = nextPosition.x - zone.position[0], dz = nextPosition.z - zone.position[2]
          const spacing = Math.hypot(dx, dz)
          const safeRadius = zone.radius + 0.6
          if (spacing < safeRadius) {
            const angle = spacing > 0.0001 ? Math.atan2(dz, dx) : Math.atan2(z, x)
            nextPosition.x = zone.position[0] + Math.cos(angle) * safeRadius
            nextPosition.z = zone.position[2] + Math.sin(angle) * safeRadius
          }
        }
      }
      const radius = inWorld ? 7 : 2.7
      const lengthFromCenter = Math.hypot(nextPosition.x, nextPosition.z)
      if (lengthFromCenter > radius) { nextPosition.x *= radius / lengthFromCenter; nextPosition.z *= radius / lengthFromCenter }
      // An edge clamp can re-enter a building near the rim. Keep the previous
      // valid position if the two constraints cannot both be satisfied.
      if (inWorld && WORLD_ZONES.some((zone) => Math.hypot(nextPosition.x - zone.position[0], nextPosition.z - zone.position[2]) < zone.radius + 0.6 - 0.0001)) {
        nextPosition.copy(mover.current.position)
      }
      mover.current.position.copy(nextPosition)
      targetRotation.current = Math.atan2(x, z)
    } else if (moving.current && !oneShot && playing) onClip('Idle')
    moving.current = hasMovement
    let near: ZoneId | null = null
    let nearest = 3.15
    if (mode === 'world' && WORLD_ASSETS_READY) {
      for (const zone of WORLD_ZONES) {
        const distance = Math.hypot(mover.current.position.x - zone.position[0], mover.current.position.z - zone.position[2])
        if (distance < nearest) { nearest = distance; near = zone.id }
      }
    }
    if (near !== currentZone.current) { currentZone.current = near; onNearby(near) }
    const difference = Math.atan2(Math.sin(targetRotation.current - mover.current.rotation.y), Math.cos(targetRotation.current - mover.current.rotation.y))
    mover.current.rotation.y += difference * (1 - Math.exp(-dt * 12))
  })

  return <group ref={mover} scale={mode === 'world' && WORLD_ASSETS_READY ? 0.5 : 1}><primitive object={scene} /></group>
}

function GeneratedWorld() {
  const island = useGLTF(WORLD_ASSETS.island)
  const github = useGLTF(WORLD_ASSETS.github)
  const ci = useGLTF(WORLD_ASSETS.ci)
  const cluster = useGLTF(WORLD_ASSETS.kubernetes)
  const props = useGLTF(WORLD_ASSETS.props)
  useEffect(() => {
    for (const asset of [island, github, ci, cluster, props]) {
      asset.scene.traverse((object) => { if (object instanceof Mesh) { object.castShadow = true; object.receiveShadow = true } })
    }
  }, [island, github, ci, cluster, props])
  const buildings = { github, ci, kubernetes: cluster }
  return <group>
    <primitive object={island.scene} />
    {WORLD_ZONES.map((zone) => <primitive key={zone.id} object={buildings[zone.id].scene} position={zone.position} />)}
    <primitive object={props.scene} />
  </group>
}

function Stage({ mode }: { mode: Mode }) {
  const ring = useRef<Mesh>(null!)
  useFrame(({ clock }) => { if (ring.current) ring.current.rotation.z = clock.elapsedTime * 0.04 })
  if (mode === 'world' && WORLD_ASSETS_READY) return <GeneratedWorld />
  return <group>
    <mesh receiveShadow position={[0, -0.18, 0]}>
      <cylinderGeometry args={[3.4, 3.55, 0.32, 96]} />
      <meshStandardMaterial color="#152d3c" roughness={0.3} metalness={0.45} />
    </mesh>
    <mesh position={[0, -0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[3.32, 3.34, 128]} /><meshBasicMaterial color="#43d7e7" transparent opacity={0.55} />
    </mesh>
    <mesh ref={ring} position={[0, -0.008, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[2.96, 2.97, 128, 1, 0, Math.PI * 1.8]} /><meshBasicMaterial color="#397284" transparent opacity={0.25} />
    </mesh>
    <ContactShadows position={[0, 0.005, 0]} opacity={0.65} scale={16} blur={2.2} far={7} resolution={512} color="#02080e" />
  </group>
}

function Camera({ view, reset, mode }: Pick<SceneProps, 'view' | 'reset' | 'mode'>) {
  const controls = useRef<OrbitControlsType>(null!)
  const camera = useThree((state) => state.camera)
  useEffect(() => {
    const world = mode === 'world' && WORLD_ASSETS_READY
    const positions: Record<View, [number, number, number]> = {
      'three-quarter': [4.7, 3.4, 7.7], front: [0, 2.4, 9.2], side: [9.2, 2.4, 0], back: [0, 2.4, -9.2],
    }
    const worldPositions: Record<View, [number, number, number]> = { 'three-quarter': [16, 10, 23], front: [0, 11, 28], side: [28, 11, 0], back: [0, 11, -28] }
    camera.position.copy(new Vector3(...(world ? worldPositions[view] : positions[view])))
    controls.current.target.set(0, world ? -0.7 : 1.65, 0)
    controls.current.update()
  }, [camera, view, reset, mode])
  return <OrbitControls ref={controls} makeDefault enablePan={false} minDistance={5} maxDistance={mode === 'world' ? 42 : 16} minPolarAngle={0.2} maxPolarAngle={Math.PI / 2 + 0.05} enableDamping dampingFactor={0.07} />
}

export default function Scene(props: SceneProps) {
  return <SceneBoundary><Canvas fallback={<div className="scene-error">Interactive 3D Awushi. Use the animation controls below to explore.</div>} data-testid="awushi-canvas" shadows camera={{ fov: 33, position: [4.7, 3.4, 7.7], near: 0.1, far: 150 }} dpr={[1, 1.75]} gl={{ antialias: true, alpha: true, toneMapping: NeutralToneMapping, toneMappingExposure: 1.0 }}>
    <ambientLight intensity={1.6} />
    <directionalLight position={[3, 7, 5]} intensity={3.8} color="#bafff2" castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-11} shadow-camera-right={11} shadow-camera-top={11} shadow-camera-bottom={-11} shadow-camera-far={45} shadow-bias={-0.0005} />
    <directionalLight position={[-5, 3, -3]} intensity={3} color="#2ce3ff" />
    <pointLight position={[-3, 2, 3]} intensity={8} color="#ffb95b" distance={10} />
    <Environment resolution={256} environmentIntensity={1.5}>
      <Lightformer form="rect" intensity={4} color="#e8feff" scale={[4, 7, 1]} position={[-4, 4, 4]} rotation={[0, Math.PI / 4, 0]} />
      <Lightformer form="rect" intensity={3} color="#75eaff" scale={[3, 8, 1]} position={[4, 4, -4]} rotation={[0, -Math.PI / 2, 0]} />
      <Lightformer form="circle" intensity={4} color="#ffffff" scale={[4, 4, 1]} position={[0, 7, 1]} rotation={[Math.PI / 2, 0, 0]} />
      <Lightformer form="rect" intensity={0.5} color="#9dc9da" scale={[20, 20, 1]} position={[0, 0, -12]} />
    </Environment>
    <Suspense fallback={null}><Awushi {...props} /><Stage mode={props.mode} /></Suspense>
    <Camera view={props.view} reset={props.reset} mode={props.mode} />
  </Canvas></SceneBoundary>
}
