import { Component, Suspense, useEffect, useMemo, useRef, type ErrorInfo, type MutableRefObject, type ReactNode } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ContactShadows, Environment, Lightformer, OrbitControls, useAnimations, useGLTF } from '@react-three/drei'
import { NeutralToneMapping, Group, LoopOnce, LoopRepeat, Mesh, Vector3, OrthographicCamera, DirectionalLight, InstancedMesh, Object3D, Color, type AnimationAction } from 'three'
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js'
import type { OrbitControls as OrbitControlsType } from 'three-stdlib'
import { DISTRICTS, HUB, STATIONS, WORLD_LAYOUT, type Point3 } from './worldConfig'
import type { Clip, ExpressionName, SceneProps } from './game/types'
import { eligibleStation, moveCharacter, movementDirection, surfaceAt } from './game/navigation'
import { advanceCamera, damp, desiredCamera, FOLLOW_AZIMUTH, studioCamera, type CameraPose } from './game/camera'
import { createBehavior, stepBehavior } from './game/behavior'
import { applyExpression, getExpressionTargets, resetExpression } from './character/expressions'

type LiveWorld = { position: Vector3; azimuth: number; nearby: string | null }
type LiveRef = MutableRefObject<LiveWorld>
const emptyKeys = new Set<string>()

class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('Awushi scene failed to load', error, info.componentStack) }
  render() {
    return this.state.failed ? <div className="scene-error"><span>Something interrupted the little splash.</span><p>Check that the local assets have been generated, then reload the page.</p><button onClick={() => window.location.reload()}>Try again</button></div> : this.props.children
  }
}

function Awushi(props: SceneProps & { live: LiveRef }) {
  const { clip, playing, speed, input, reset, mode, onClip, onReady, live, quality, inputEnabled, reducedMotion } = props
  const source = useGLTF('/assets/awushi.glb')
  const scene = useMemo(() => clone(source.scene), [source.scene])
  const mover = useRef<Group>(null!)
  const { actions, mixer } = useAnimations(source.animations, scene)
  const moving = useRef(false)
  const previousMotion = useRef<Clip>('Idle')
  const targetRotation = useRef(0)
  const behavior = useRef(createBehavior())
  const reaction = useRef<{ expression: ExpressionName; remaining: number } | null>(null)
  const stats = useRef({ elapsed: 0, frames: 0, fps: 0, publish: 0 })

  useEffect(() => {
    let triangles = 0, meshes = 0
    scene.traverse(object => {
      if (object instanceof Mesh) {
        object.castShadow = quality !== 'low'; object.receiveShadow = quality !== 'low'
        // A skinned crown/face moves beyond its rest bounds; keep this one hero visible.
        object.frustumCulled = false
        meshes++
        triangles += object.geometry.index ? object.geometry.index.count / 3 : object.geometry.attributes.position.count / 3
      }
    })
    onReady({ clips: source.animations.map(animation => animation.name), triangles: Math.round(triangles), meshes, expressions: ['Neutral', ...getExpressionTargets(scene)] })
  }, [scene, source.animations, onReady, quality])

  useEffect(() => {
    const action = actions[clip]
    if (!action) return
    action.reset().setEffectiveWeight(1).setEffectiveTimeScale(1)
    const oneShot = clip === 'Celebrate' || clip === 'Interact'
    action.setLoop(oneShot ? LoopOnce : LoopRepeat, oneShot ? 1 : Infinity)
    action.clampWhenFinished = oneShot
    action.fadeIn(reducedMotion ? 0.1 : 0.22).play()
    return () => { action.fadeOut(reducedMotion ? 0.1 : 0.22) }
  }, [actions, clip, reducedMotion])
  useEffect(() => { mixer.timeScale = playing ? mode === 'world' ? 1 : speed : 0 }, [mixer, speed, playing, mode])
  useEffect(() => {
    const finish = (event: { action: AnimationAction }) => {
      if (event.action !== actions[clip]) return
      const direction = movementDirection(inputEnabled ? input.current : emptyKeys, live.current.azimuth)
      const running = input.current.has('ShiftLeft') || input.current.has('ShiftRight')
      onClip(direction.moving ? running ? 'Run' : 'Walk' : 'Idle')
    }
    mixer.addEventListener('finished', finish)
    return () => mixer.removeEventListener('finished', finish)
  }, [mixer, onClip, actions, clip, input, inputEnabled, live])
  useEffect(() => {
    const position = mode === 'world' ? WORLD_LAYOUT.spawn : [0, 0, 0]
    mover.current.position.set(...position as Point3)
    mover.current.rotation.set(0, 0, 0)
    live.current.position.copy(mover.current.position); live.current.nearby = null
    moving.current = false; targetRotation.current = 0; behavior.current = createBehavior()
    resetExpression(scene)
  }, [reset, mode, live, scene])
  useEffect(() => { reaction.current = props.reaction ? { expression: props.reaction.expression, remaining: 2.2 } : null }, [props.reaction])

  useFrame(({ gl }, delta) => {
    const dt = Math.min(delta, 0.05)
    const keys = inputEnabled && playing ? input.current : emptyKeys
    const direction = movementDirection(keys, live.current.azimuth)
    const running = keys.has('ShiftLeft') || keys.has('ShiftRight')
    const oneShot = clip === 'Interact' || clip === 'Celebrate'
    let blocked = false
    if (direction.moving) {
      const next: Clip = running ? 'Run' : 'Walk'
      // Movement can interrupt a gesture; proximity never interrupts locomotion.
      if (!moving.current || next !== previousMotion.current || oneShot) onClip(next)
      previousMotion.current = next
      const distance = dt * (running ? 4.8 : 2.65)
      if (mode === 'world') {
        const result = moveCharacter(mover.current.position.toArray() as Point3, direction.x * distance, direction.z * distance)
        mover.current.position.x = result.position[0]; mover.current.position.z = result.position[2]
        mover.current.position.y = damp(mover.current.position.y, result.position[1], 20, dt)
        blocked = result.blocked
      } else {
        mover.current.position.x += direction.x * distance
        mover.current.position.z += direction.z * distance
        const radius = Math.hypot(mover.current.position.x, mover.current.position.z)
        if (radius > 2.3) { mover.current.position.x *= 2.3 / radius; mover.current.position.z *= 2.3 / radius; blocked = true }
      }
      targetRotation.current = Math.atan2(direction.x, direction.z)
    } else if (moving.current && !oneShot) onClip('Idle')
    moving.current = direction.moving
    const rotation = targetRotation.current + (mode === 'studio' ? props.rotation * Math.PI / 180 : 0)
    const difference = Math.atan2(Math.sin(rotation - mover.current.rotation.y), Math.cos(rotation - mover.current.rotation.y))
    mover.current.rotation.y += difference * (1 - Math.exp(-dt * 12))
    live.current.position.copy(mover.current.position)
    const position = mover.current.position.toArray() as Point3
    live.current.nearby = mode === 'world' ? eligibleStation(position, live.current.nearby) : null
    if (reaction.current) { reaction.current.remaining -= dt; if (reaction.current.remaining <= 0) reaction.current = null }
    const result = stepBehavior(behavior.current, { moving: direction.moving, running, blocked, nearby: Boolean(live.current.nearby), reading: Boolean(props.activeStation), clip, reaction: reaction.current?.expression }, dt)
    behavior.current = result.state
    const face = props.expression === 'Auto' ? result.expression : props.expression
    applyExpression(scene, face, props.expressionIntensity, dt, reducedMotion)
    const sample = stats.current
    sample.frames++; sample.elapsed += delta; sample.publish += delta
    if (sample.elapsed >= 1) { sample.fps = Math.round(sample.frames / sample.elapsed); sample.frames = 0; sample.elapsed = 0 }
    if (sample.publish >= 0.2) {
      sample.publish = 0
      props.onTelemetry({ position, districtId: surfaceAt(position[0], position[2])?.districtId ?? 'hub', nearbyId: live.current.nearby, expression: face, fps: sample.fps, drawCalls: gl.info.render.calls, triangles: gl.info.render.triangles })
    }
  })
  return <group ref={mover} scale={mode === 'world' ? 0.58 : 1}><primitive object={scene} /></group>
}

function WorldAsset({ path, position = [0, 0, 0], quality }: { path: string; position?: Point3; quality: SceneProps['quality'] }) {
  const { scene } = useGLTF(path)
  useEffect(() => {
    scene.traverse(object => {
      if (object instanceof Mesh) { object.castShadow = quality !== 'low'; object.receiveShadow = quality !== 'low'; object.frustumCulled = true }
    })
  }, [scene, quality])
  return <primitive object={scene} position={position} />
}
/** Six shared beacon instances: a quiet arrival/status cue with one draw call. */
function DistrictBeacons({ reducedMotion }: { reducedMotion: boolean }) {
  const instances = useRef<InstancedMesh>(null!)
  const dummy = useMemo(() => new Object3D(), [])
  const positions = useMemo(() => DISTRICTS.map(district => {
    const length = Math.hypot(district.center[0], district.center[2])
    return [district.center[0] * (1 - 3.5 / length), district.center[1] + 3.75, district.center[2] * (1 - 3.5 / length)] as Point3
  }), [])
  useEffect(() => {
    DISTRICTS.forEach((district, index) => instances.current.setColorAt(index, new Color(district.color)))
    if (instances.current.instanceColor) instances.current.instanceColor.needsUpdate = true
  }, [])
  useFrame(({ clock }) => {
    positions.forEach((position, index) => {
      dummy.position.fromArray(position)
      const wave = reducedMotion ? 0 : Math.sin(clock.elapsedTime * 1.8 + index * .8)
      dummy.position.y += wave * .06; dummy.scale.setScalar(1 + wave * .12); dummy.updateMatrix()
      instances.current.setMatrixAt(index, dummy.matrix)
    })
    instances.current.instanceMatrix.needsUpdate = true
    instances.current.computeBoundingSphere()
  })
  return <instancedMesh ref={instances} args={[undefined, undefined, DISTRICTS.length]}><icosahedronGeometry args={[.14, 1]} /><meshBasicMaterial toneMapped={false} /></instancedMesh>
}
function WorldMarker({ live, reducedMotion }: { live: LiveRef; reducedMotion: boolean }) {
  const marker = useRef<Group>(null!)
  useFrame(({ clock }) => {
    const station = STATIONS.find(value => value.id === live.current.nearby)
    marker.current.visible = Boolean(station)
    if (station) {
      marker.current.position.set(station.position[0], station.position[1] + 0.035, station.position[2])
      const pulse = reducedMotion ? 1 : 1 + Math.sin(clock.elapsedTime * 2.8) * 0.025
      marker.current.scale.setScalar((station.radius + 0.28) * pulse)
    }
  })
  return <group ref={marker} visible={false}><mesh rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[1, 1.045, 64]} /><meshBasicMaterial color="#ffe4a3" toneMapped={false} transparent opacity={0.85} depthWrite={false} /></mesh></group>
}
function Stage({ mode, quality, live, reducedMotion }: Pick<SceneProps, 'mode' | 'quality' | 'reducedMotion'> & { live: LiveRef }) {
  if (mode === 'world') return <group>
    <WorldAsset path="/assets/world-hub.glb" quality={quality} />
    {DISTRICTS.map(district => <WorldAsset key={district.id} path={district.asset} position={district.center} quality={quality} />)}
    <WorldMarker live={live} reducedMotion={reducedMotion} /><DistrictBeacons reducedMotion={reducedMotion} />
    <mesh position={[0, -0.07, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[1.05, 1.09, 64]} /><meshBasicMaterial color={HUB.color} /></mesh>
  </group>
  return <group>
    <mesh receiveShadow position={[0, -0.18, 0]}><cylinderGeometry args={[3.4, 3.55, 0.32, 96]} /><meshStandardMaterial color="#152d3c" roughness={0.3} metalness={0.45} /></mesh>
    <mesh position={[0, -0.006, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[3.32, 3.34, 128]} /><meshBasicMaterial color="#43d7e7" transparent opacity={0.55} /></mesh>
    {quality !== 'low' && <ContactShadows position={[0, 0.005, 0]} opacity={0.65} scale={16} blur={2.2} far={7} resolution={512} color="#02080e" />}
  </group>
}

function CameraRig({ view, reset, mode, cameraMode, reducedMotion, inputEnabled, live }: Pick<SceneProps, 'view' | 'reset' | 'mode' | 'cameraMode' | 'reducedMotion' | 'inputEnabled'> & { live: LiveRef }) {
  const controls = useRef<OrbitControlsType>(null!)
  const camera = useThree(state => state.camera) as OrthographicCamera
  const size = useThree(state => state.size)
  const pose = useRef<CameraPose>({ position: [14, 14, 18], target: [0, 1, 0], span: 18 })
  const transition = useRef(1)
  const initialized = useRef(false)
  const publish = useRef(0)
  const aspect = size.width / size.height
  useEffect(() => { transition.current = 0.7 }, [view, reset, mode, cameraMode, aspect])
  useFrame(({ gl }, delta) => {
    const dt = Math.min(delta, 0.05)
    const player = live.current.position.toArray() as Point3
    const desired = mode === 'studio' ? studioCamera(view, aspect) : desiredCamera(cameraMode, player, aspect)
    const manual = mode === 'studio' || cameraMode === 'explore'
    const orbit = controls.current
    if (!initialized.current) { pose.current = desired; initialized.current = true }
    if (transition.current > 0 || !manual) {
      pose.current = reducedMotion ? desired : advanceCamera(pose.current, desired, dt, transition.current > 0 ? 8 : 12)
      camera.position.fromArray(pose.current.position)
      orbit.target.fromArray(pose.current.target)
      camera.zoom = 18 / pose.current.span
      camera.lookAt(orbit.target)
      transition.current = Math.max(0, transition.current - dt)
    } else {
      if (mode === 'world') {
        const dx = damp(orbit.target.x, desired.target[0], 10, dt) - orbit.target.x
        const dy = damp(orbit.target.y, desired.target[1], 10, dt) - orbit.target.y
        const dz = damp(orbit.target.z, desired.target[2], 10, dt) - orbit.target.z
        orbit.target.add(new Vector3(dx, dy, dz)); camera.position.add(new Vector3(dx, dy, dz))
      }
      pose.current = { position: camera.position.toArray() as Point3, target: orbit.target.toArray() as Point3, span: 18 / camera.zoom }
    }
    camera.left = -9 * aspect; camera.right = 9 * aspect; camera.top = 9; camera.bottom = -9
    camera.updateProjectionMatrix()
    orbit.enabled = manual && transition.current === 0 && inputEnabled
    orbit.update()
    live.current.azimuth = mode === 'world' && cameraMode === 'follow' ? FOLLOW_AZIMUTH : orbit.getAzimuthalAngle()
    publish.current += delta
    if (publish.current >= .2) {
      publish.current = 0
      gl.domElement.dataset.cameraPosition = camera.position.toArray().join(',')
      gl.domElement.dataset.cameraTarget = orbit.target.toArray().join(',')
      gl.domElement.dataset.cameraMode = mode === 'studio' ? view : cameraMode
    }
  })
  return <OrbitControls ref={controls} makeDefault enablePan={false} minZoom={0.18} maxZoom={mode === 'world' ? 2 : 6} minPolarAngle={0.3} maxPolarAngle={mode === 'world' ? 1.12 : Math.PI / 2 + 0.05} enableDamping={!reducedMotion} dampingFactor={0.12} />
}
function Lighting({ lighting, quality, live, mode }: Pick<SceneProps, 'lighting' | 'quality' | 'mode'> & { live: LiveRef }) {
  const light = useRef<DirectionalLight>(null!)
  const night = lighting === 'moonlight'
  useFrame(() => {
    const center = mode === 'world' ? live.current.position : new Vector3()
    light.current.position.set(center.x + 5, center.y + 12, center.z + 8)
    light.current.target.position.copy(center); light.current.target.updateMatrixWorld()
  })
  return <>
    <ambientLight intensity={night ? 0.8 : 1.5} />
    <directionalLight ref={light} intensity={night ? 2 : 3.6} color={night ? '#84c3ff' : '#e4fff7'} castShadow={quality !== 'low'} shadow-mapSize={quality === 'high' ? [2048, 2048] : [1024, 1024]} shadow-camera-left={-12} shadow-camera-right={12} shadow-camera-top={12} shadow-camera-bottom={-12} shadow-camera-far={40} shadow-bias={-0.0005} shadow-normalBias={0.03} />
    <directionalLight position={[-5, 3, -3]} intensity={night ? 2 : 2.6} color="#2ce3ff" />
    <Environment resolution={quality === 'low' ? 128 : 256} environmentIntensity={lighting === 'studio' ? 1.8 : night ? 1 : 1.4}>
      <Lightformer form="rect" intensity={4} color="#e8feff" scale={[4, 7, 1]} position={[-4, 4, 4]} rotation={[0, Math.PI / 4, 0]} />
      <Lightformer form="rect" intensity={3} color="#75eaff" scale={[3, 8, 1]} position={[4, 4, -4]} rotation={[0, -Math.PI / 2, 0]} />
      <Lightformer form="circle" intensity={4} color="#ffffff" scale={[4, 4, 1]} position={[0, 7, 1]} rotation={[Math.PI / 2, 0, 0]} />
      <Lightformer form="rect" intensity={0.5} color="#9dc9da" scale={[20, 20, 1]} position={[0, 0, -12]} />
    </Environment>
  </>
}
function SceneContents(props: SceneProps) {
  const live = useRef<LiveWorld>({ position: new Vector3(...WORLD_LAYOUT.spawn), azimuth: FOLLOW_AZIMUTH, nearby: null })
  return <>
    <Lighting {...props} live={live} />
    <Suspense fallback={null}><Awushi {...props} live={live} /><Stage {...props} live={live} /></Suspense>
    <CameraRig {...props} live={live} />
  </>
}
export default function Scene(props: SceneProps) {
  return <SceneBoundary><Canvas fallback={<div className="scene-error">Interactive 3D needs WebGL. Try a browser with hardware acceleration enabled.</div>} data-testid="awushi-canvas" orthographic shadows={props.quality !== 'low'} camera={{ position: [14, 14, 18], near: 0.1, far: 180, zoom: 1 }} dpr={[1, props.quality === 'low' ? 1 : props.quality === 'high' ? 1.75 : 1.5]} gl={{ antialias: true, alpha: true, toneMapping: NeutralToneMapping, toneMappingExposure: 1 }}><SceneContents {...props} /></Canvas></SceneBoundary>
}
