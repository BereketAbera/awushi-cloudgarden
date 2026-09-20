import { Component, Suspense, memo, useCallback, useEffect, useMemo, useRef, useState, type ErrorInfo, type MutableRefObject, type ReactNode } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ContactShadows, Environment, Html, Lightformer, OrbitControls, PerspectiveCamera as PerspectiveLens, OrthographicCamera as OrthographicLens, useAnimations, useGLTF } from '@react-three/drei'
import { BackSide, BufferGeometry, Float32BufferAttribute, NeutralToneMapping, Group, LoopOnce, LoopRepeat, Mesh, SkinnedMesh, Vector3, PerspectiveCamera, OrthographicCamera, DirectionalLight, InstancedMesh, Object3D, Color, type AnimationAction } from 'three'
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js'
import type { OrbitControls as OrbitControlsType } from 'three-stdlib'
import { DISTRICTS, HUB, STATIONS, WORLD_LAYOUT, type Point3 } from './worldConfig'
import type { Clip, ExpressionName, SceneProps } from './game/types'
import { eligibleStation, moveCharacter, movementDirection, immersiveDirection, steeringInput, surfaceAt } from './game/navigation'
import { advanceCamera, advanceSteering, damp, desiredCamera, cameraObstruction, FOLLOW_ANCHOR_HEIGHT, WORLD_CHARACTER_SCALE, INITIAL_HEADING, isImmersive, FOLLOW_AZIMUTH, studioCamera, type CameraPose } from './game/camera'
import { createBehavior, stepBehavior } from './game/behavior'
import { SimulationEffects } from './simulation/SimulationEffects'
import { ATTENTION, cinematicOwnsCamera, cinematicPose, interpolateShot, advanceShotTime, orbitFromPose, manualOrbitPose, fallbackBounds, shotDuration, simulationShot, type SubjectBounds, type CameraOwnership, type ShotRequest } from './game/cinematic'
import { measureStationGeometry, type StationShape } from './game/stationGeometry'
import { applyExpression, getExpressionTargets, resetExpression } from './character/expressions'

type LiveWorld = { position: Vector3; azimuth: number; viewYaw: number; movementYaw: number; heading: number; bodyVisible: boolean; nearby: string | null }
type LiveRef = MutableRefObject<LiveWorld>
const emptyKeys = new Set<string>()

class SceneBoundary extends Component<{ children: ReactNode; onStatus?: (message: string | null) => void }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('Awushi scene failed to load', error, info.componentStack); this.props.onStatus?.('A local model could not load. Your adventure is paused; its saved progress is safe.') }
  retry = () => {
    for (const path of ['/assets/awushi.glb', '/assets/world-hub.glb', '/assets/deployment-effects.glb', ...DISTRICTS.map(district => district.asset)]) useGLTF.clear(path)
    this.props.onStatus?.(null); this.setState({ failed: false })
  }
  render() {
    return this.state.failed ? <div className="scene-error" role="alert" data-testid="scene-error"><span>Something interrupted the little splash.</span><p>A local model could not load. Restore the generated assets and retry. Your adventure progress stays saved.</p><button onClick={this.retry} data-testid="retry-scene">Retry local assets</button></div> : this.props.children
  }
}

function RendererRecovery({ onStatus }: { onStatus?: (message: string | null) => void }) {
  const { gl } = useThree()
  useEffect(() => {
    const canvas = gl.domElement
    const lost = (event: Event) => { event.preventDefault(); onStatus?.('The 3D renderer was interrupted. Your adventure is paused. Wait for recovery or reload the saved adventure.') }
    const restored = () => onStatus?.(null)
    canvas.addEventListener('webglcontextlost', lost); canvas.addEventListener('webglcontextrestored', restored)
    return () => { canvas.removeEventListener('webglcontextlost', lost); canvas.removeEventListener('webglcontextrestored', restored) }
  }, [gl, onStatus])
  return null
}

/** Snapshot the previous completed frame, including shadow/transmission/offscreen passes. */
function useRendererCounters() {
  const { gl } = useThree()
  const frame = useRef({ drawCalls: 0, triangles: 0, geometries: 0, textures: 0 })
  const ready = useRef(false)
  useEffect(() => {
    const previous = gl.info.autoReset
    gl.info.autoReset = false; gl.info.reset(); ready.current = false
    return () => { gl.info.autoReset = previous; gl.info.reset() }
  }, [gl])
  useFrame(() => {
    if (ready.current) frame.current = { drawCalls: gl.info.render.calls, triangles: gl.info.render.triangles, geometries: gl.info.memory.geometries, textures: gl.info.memory.textures }
    ready.current = true; gl.info.reset()
  }, -1000)
  return frame
}

function Awushi(props: SceneProps & { live: LiveRef }) {
  const { clip, playing, speed, input, reset, mode, onClip, onReady, live, quality, inputEnabled, reducedMotion } = props
  const source = useGLTF('/assets/awushi.glb')
  const scene = useMemo(() => clone(source.scene), [source.scene])
  useEffect(() => () => {
    const skeletons = new Set<SkinnedMesh['skeleton']>()
    scene.traverse(node => { if (node instanceof SkinnedMesh) skeletons.add(node.skeleton) })
    skeletons.forEach(skeleton => skeleton.dispose())
  }, [scene])
  const mover = useRef<Group>(null!)
  const { actions, mixer } = useAnimations(source.animations, scene)
  const moving = useRef(false)
  const previousMotion = useRef<Clip>('Idle')
  const targetRotation = useRef(0)
  const behavior = useRef(createBehavior())
  const reaction = useRef<{ expression: ExpressionName; remaining: number } | null>(null)
  const rendererCounters = useRendererCounters()
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
      const keys = inputEnabled ? input.current : emptyKeys
      const direction = mode === 'world' && isImmersive(props.cameraMode) ? immersiveDirection(keys, live.current.movementYaw) : movementDirection(keys, live.current.azimuth)
      const running = input.current.has('ShiftLeft') || input.current.has('ShiftRight')
      onClip(direction.moving ? running ? 'Run' : 'Walk' : 'Idle')
    }
    mixer.addEventListener('finished', finish)
    return () => mixer.removeEventListener('finished', finish)
  }, [mixer, onClip, actions, clip, input, inputEnabled, live, mode, props.cameraMode])
  useEffect(() => {
    const position = mode === 'world' ? WORLD_LAYOUT.spawn : [0, 0, 0]
    mover.current.position.set(...position as Point3)
    mover.current.rotation.set(0, mode === 'world' ? INITIAL_HEADING : 0, 0)
    live.current.position.copy(mover.current.position); live.current.nearby = null
    moving.current = false; targetRotation.current = mode === 'world' ? INITIAL_HEADING : 0; live.current.heading = targetRotation.current; behavior.current = createBehavior()
    resetExpression(scene)
  }, [reset, mode, live, scene])
  useEffect(() => { reaction.current = props.reaction ? { expression: props.reaction.expression, remaining: 2.2 } : null }, [props.reaction])

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1)
    const keys = inputEnabled && playing ? input.current : emptyKeys
    const immersive = mode === 'world' && isImmersive(props.cameraMode)
    const direction = immersive ? immersiveDirection(keys, live.current.movementYaw) : movementDirection(keys, live.current.azimuth)
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
    if (immersive && !direction.moving) targetRotation.current = live.current.viewYaw + (props.activeStation || clip === 'Celebrate' || reaction.current?.expression === 'Happy' ? Math.PI : 0)
    if (mode === 'world' && !direction.moving && !oneShot && props.targetStation) {
      const destination = STATIONS.find(station => station.id === props.targetStation)
      if (destination) targetRotation.current = Math.atan2(destination.position[0] - mover.current.position.x, destination.position[2] - mover.current.position.z)
    }
    mover.current.visible = mode === 'studio' || live.current.bodyVisible
    const rotation = targetRotation.current + (mode === 'studio' ? props.rotation * Math.PI / 180 : 0)
    const difference = Math.atan2(Math.sin(rotation - mover.current.rotation.y), Math.cos(rotation - mover.current.rotation.y))
    mover.current.rotation.y += difference * (1 - Math.exp(-dt * 12))
    live.current.position.copy(mover.current.position)
    live.current.heading = mover.current.rotation.y
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
      props.onTelemetry({ position, districtId: surfaceAt(position[0], position[2])?.districtId ?? 'hub', nearbyId: live.current.nearby, expression: face, fps: sample.fps, ...rendererCounters.current })
    }
  })
  return <group ref={mover} scale={mode === 'world' ? WORLD_CHARACTER_SCALE : 1}><primitive object={scene} /></group>
}

function WorldAsset({ path, position = [0, 0, 0], quality, shapes, onMeasured }: { path: string; position?: Point3; quality: SceneProps['quality']; shapes?: Map<string, StationShape>; onMeasured?: () => void }) {
  const { scene } = useGLTF(path)
  useEffect(() => {
    scene.traverse(object => {
      if (object instanceof Mesh) { object.castShadow = quality !== 'low'; object.receiveShadow = quality !== 'low'; object.frustumCulled = true }
    })
  }, [scene, quality])
  useEffect(() => {
    const district = DISTRICTS.find(item => item.asset === path)
    if (!district || !shapes) return
    const measured = measureStationGeometry(scene, district, STATIONS.filter(station => station.districtId === district.id))
    for (const [id, shape] of measured) shapes.set(id, shape)
    onMeasured?.()
    return () => { for (const [id, shape] of measured) { if (shapes.get(id) === shape) shapes.delete(id); shape.geometry.dispose() } }
  }, [scene, path, shapes, onMeasured])
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
function WorldMarker({ live, reducedMotion, targetStation }: { live: LiveRef; reducedMotion: boolean; targetStation?: string | null }) {
  const marker = useRef<Group>(null!)
  useFrame(({ clock }) => {
    const station = STATIONS.find(value => value.id === (live.current.nearby ?? targetStation))
    marker.current.visible = Boolean(station)
    if (station) {
      marker.current.position.set(station.position[0], station.position[1] + 0.035, station.position[2])
      const pulse = reducedMotion ? 1 : 1 + Math.sin(clock.elapsedTime * 2.8) * 0.025
      marker.current.scale.setScalar((station.radius + 0.28) * pulse)
    }
  })
  return <group ref={marker} visible={false}><mesh rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[1, 1.045, 64]} /><meshBasicMaterial color="#ffe4a3" toneMapped={false} transparent opacity={0.85} depthWrite={false} /></mesh></group>
}
function Stage({ mode, quality, live, reducedMotion, targetStation, shapes, onMeasured }: Pick<SceneProps, 'mode' | 'quality' | 'reducedMotion' | 'targetStation'> & { live: LiveRef; shapes: Map<string, StationShape>; onMeasured: () => void }) {
  if (mode === 'world') return <group>
    <WorldAsset path="/assets/world-hub.glb" quality={quality} />
    {DISTRICTS.map(district => <WorldAsset key={district.id} path={district.asset} position={district.center} quality={quality} shapes={shapes} onMeasured={onMeasured} />)}
    <WorldMarker live={live} reducedMotion={reducedMotion} targetStation={targetStation} /><DistrictBeacons reducedMotion={reducedMotion} />
    <mesh position={[0, -0.07, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[1.05, 1.09, 64]} /><meshBasicMaterial color={HUB.color} /></mesh>
  </group>
  return <group>
    <mesh receiveShadow position={[0, -0.18, 0]}><cylinderGeometry args={[3.4, 3.55, 0.32, 96]} /><meshStandardMaterial color="#152d3c" roughness={0.3} metalness={0.45} /></mesh>
    <mesh position={[0, -0.006, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[3.32, 3.34, 128]} /><meshBasicMaterial color="#43d7e7" transparent opacity={0.55} /></mesh>

  </group>
}

function AttentionOutline({ shot, shape, secondary = false, reducedMotion, labelsVisible }: { shot: ShotRequest; shape?: StationShape; secondary?: boolean; reducedMotion: boolean; labelsVisible: boolean }) {
  const root = useRef<Group>(null!)
  const station = STATIONS.find(item => item.id === shot.stationId)
  const bounds = useMemo(() => shape?.bounds ?? fallbackBounds(shot.stationId), [shape, shot.stationId])
  const status = ATTENTION[shot.status ?? 'neutral']
  const compact = useThree(state => state.size.width < 600)
  const bracketGeometry = useMemo(() => {
    const size = bounds.size.map(value => value / 2 + .16), points: number[] = []
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
      const corner = [x * size[0], y * size[1], z * size[2]]
      for (let axis = 0; axis < 3; axis++) { const end = [...corner]; end[axis] *= .65; points.push(...corner, ...end) }
    }
    return new BufferGeometry().setAttribute('position', new Float32BufferAttribute(points, 3))
  }, [bounds.size])
  useEffect(() => () => bracketGeometry.dispose(), [bracketGeometry])
  useFrame(({ clock }) => {
    if (root.current) root.current.scale.setScalar(reducedMotion || secondary ? 1 : 1 + Math.sin(clock.elapsedTime * 2.5) * .008)
  })
  if (!station) return null
  return <group name={secondary ? 'RelatedStationAttention' : 'PrimaryStationAttention'} position={bounds.center}>
    <group ref={root}>
      {shape && !secondary && <>
        <mesh geometry={shape.geometry} scale={1.075} renderOrder={3}><meshBasicMaterial color="#06151f" side={BackSide} depthWrite={false} /></mesh>
        <mesh geometry={shape.geometry} scale={1.038} renderOrder={4}><meshBasicMaterial color={status.color} side={BackSide} depthWrite={false} toneMapped={false} /></mesh>
      </>}
      <lineSegments geometry={bracketGeometry} renderOrder={8}><lineBasicMaterial color={status.color} depthTest={false} transparent opacity={secondary ? .5 : 1} toneMapped={false} /></lineSegments>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[station.position[0] - bounds.center[0], station.position[1] - bounds.center[1] + .06, station.position[2] - bounds.center[2]]}>
        <ringGeometry args={[station.radius + .15, station.radius + (secondary ? .23 : .34), 48]} /><meshBasicMaterial color={status.color} toneMapped={false} transparent opacity={secondary ? .35 : .95} depthWrite={false} />
      </mesh>
    </group>
    {!secondary && labelsVisible && <Html center position={[0, bounds.size[1] / 2 + .55, 0]} zIndexRange={[9, 0]} style={{ pointerEvents: 'none' }}>
      <div data-testid="station-attention" data-station={station.id} data-status={shot.status ?? 'neutral'} style={{ color: '#f4fbff', background: '#071923ed', border: `2px solid ${status.color}`, borderRadius: 12, padding: compact ? '5px 9px' : '8px 13px', minWidth: compact ? 125 : 155, maxWidth: compact ? 185 : 240, transform: 'translateY(-50%)', textAlign: 'center', boxShadow: '0 4px 20px #0008', fontFamily: 'inherit', fontSize: compact ? 11 : 12, lineHeight: 1.4 }}>
        <strong style={{ display: 'block', fontSize: compact ? 12 : 13 }}>{station.name}</strong><span style={{ color: status.color }}>{status.icon} {status.label}</span>
      </div>
    </Html>}
  </group>
}
function StationAttention({ shot, shapes, reducedMotion, labelsVisible }: { shot: ShotRequest | null; shapes: Map<string, StationShape>; reducedMotion: boolean; labelsVisible: boolean }) {
  if (!shot) return null
  return <group name="StationAttention"><AttentionOutline shot={shot} shape={shapes.get(shot.stationId)} reducedMotion={reducedMotion} labelsVisible={labelsVisible} />{[...new Set(shot.relatedStationIds)].filter(id => id !== shot.stationId).slice(0, 2).map(id => <AttentionOutline key={id} shot={{ ...shot, stationId: id, status: 'neutral' }} shape={shapes.get(id)} reducedMotion={reducedMotion} labelsVisible={labelsVisible} secondary />)}</group>
}

function CameraRig({ view, reset, mode, cameraMode, reducedMotion, inputEnabled, input, live, cinematic, onCameraOverride, onCameraSettled, bounds }: Pick<SceneProps, 'view' | 'reset' | 'mode' | 'cameraMode' | 'reducedMotion' | 'inputEnabled' | 'input' | 'cinematic' | 'onCameraOverride' | 'onCameraSettled'> & { live: LiveRef; bounds: ReadonlyMap<string, SubjectBounds> }) {
  const controls = useRef<OrbitControlsType>(null!)
  const camera = useThree(state => state.camera) as PerspectiveCamera | OrthographicCamera
  const gl = useThree(state => state.gl), size = useThree(state => state.size)
  const pose = useRef<CameraPose>({ position: [14, 14, 18], target: [0, 1, 0], span: 18, fov: 58 })
  const transition = useRef(.85), initialized = useRef(false), publish = useRef(0)
  const look = useRef({ yaw: INITIAL_HEADING, pitch: .2, distance: 5.8, dragging: false })
  const manual = useRef({ yaw: 0, pitch: .6, distance: 8, target: [0, 1, 0] as Point3 })
  const owner = useRef<CameraOwnership>(cinematic?.ownership ?? 'player')
  const latest = useRef({ cinematic, onCameraOverride, onCameraSettled })
  latest.current = { cinematic, onCameraOverride, onCameraSettled }
  const shotTransition = useRef({ key: '', from: pose.current, elapsed: 0, settled: false, instant: false })
  const skippedRevision = useRef<number | null>(null)
  const lastProjection = useRef<boolean | null>(null)
  const aspect = size.width / size.height
  const cinematicControlled = mode === 'world' && (cinematicOwnsCamera(cinematic) || cinematic?.ownership === 'returning-character')
  const immersive = mode === 'world' && isImmersive(cameraMode) && !cinematicControlled
  useEffect(() => {
    if (cinematic?.ownership === 'overridden' && owner.current !== 'overridden') manual.current = orbitFromPose(pose.current)
    owner.current = cinematic?.ownership ?? 'player'
  }, [cinematic?.ownership, cinematic?.revision])
  useEffect(() => { transition.current = .85 }, [view, reset, mode, cameraMode, aspect])
  useEffect(() => { look.current = { yaw: INITIAL_HEADING, pitch: .2, distance: 5.8, dragging: false }; live.current.viewYaw = INITIAL_HEADING; live.current.movementYaw = INITIAL_HEADING }, [reset, live])
  useEffect(() => {
    const canvas = gl.domElement
    if (mode !== 'world' || !inputEnabled) return
    let pointer: number | null = null, x = 0, y = 0
    const original = canvas.style.touchAction
    const originalTabIndex = canvas.getAttribute('tabindex')
    canvas.style.touchAction = 'none'
    canvas.tabIndex = 0
    const override = () => {
      if (!cinematicOwnsCamera(latest.current.cinematic) || owner.current === 'overridden') return
      owner.current = 'overridden'
      manual.current = orbitFromPose(pose.current)
      latest.current.onCameraOverride?.()
    }
    const down = (event: PointerEvent) => {
      if (pointer !== null || event.button !== 0 && event.button !== 2) return
      // Cancelling the pointer default prevents the browser's focus handoff. Move focus
      // explicitly so movement keys leave the playback controls with this click.
      canvas.focus({ preventScroll: true })
      if (!immersive && !cinematicOwnsCamera(latest.current.cinematic)) return
      override(); pointer = event.pointerId; x = event.clientX; y = event.clientY; look.current.dragging = true
      canvas.setPointerCapture(pointer); event.preventDefault()
    }
    const move = (event: PointerEvent) => {
      if (event.pointerId !== pointer) return
      if (owner.current === 'overridden' && cinematicOwnsCamera(latest.current.cinematic)) {
        manual.current.yaw -= (event.clientX - x) * .005
        manual.current.pitch = Math.max(.12, Math.min(1.45, manual.current.pitch + (event.clientY - y) * .004))
      } else {
        look.current.yaw -= (event.clientX - x) * .005
        look.current.pitch = Math.max(cameraMode === 'first-person' ? -.9 : -.02, Math.min(cameraMode === 'first-person' ? 1.3 : .72, look.current.pitch + (event.clientY - y) * .004))
      }
      x = event.clientX; y = event.clientY
    }
    const up = () => { pointer = null; look.current.dragging = false }
    const wheel = (event: WheelEvent) => {
      if (cinematicOwnsCamera(latest.current.cinematic)) { override(); manual.current.distance = Math.max(3.5, Math.min(95, manual.current.distance + event.deltaY * .012)); event.preventDefault() }
      else if (immersive && cameraMode === 'third-person') { look.current.distance = Math.max(3.8, Math.min(8, look.current.distance + event.deltaY * .006)); event.preventDefault() }
    }
    const context = (event: MouseEvent) => event.preventDefault()
    canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up); canvas.addEventListener('lostpointercapture', up)
    canvas.addEventListener('wheel', wheel, { passive: false }); canvas.addEventListener('contextmenu', context)
    return () => {
      canvas.style.touchAction = original; up()
      if (originalTabIndex === null) canvas.removeAttribute('tabindex')
      else canvas.setAttribute('tabindex', originalTabIndex)
      canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', up); canvas.removeEventListener('lostpointercapture', up)
      canvas.removeEventListener('wheel', wheel); canvas.removeEventListener('contextmenu', context)
    }
  }, [gl, camera, mode, immersive, inputEnabled, cameraMode])
  useFrame((_, delta) => {
    if (!immersive) return
    const result = advanceSteering(live.current.viewYaw, look.current.yaw, inputEnabled ? steeringInput(input.current) : 0, Math.min(delta, .1))
    look.current.yaw = result.targetYaw; live.current.viewYaw = result.viewYaw; live.current.movementYaw = result.movementYaw
  }, -2)
  useFrame((_, delta) => {
    const dt = Math.min(delta, .1), perspective = camera instanceof PerspectiveCamera
    const player = live.current.position.toArray() as Point3
    const current = latest.current.cinematic
    const active = mode === 'world' && cinematicOwnsCamera(current)
    const returning = mode === 'world' && current?.ownership === 'returning-character'
    if (active && owner.current !== 'overridden' && inputEnabled && ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].some(key => input.current.has(key))) {
      manual.current = orbitFromPose(pose.current); owner.current = 'overridden'; latest.current.onCameraOverride?.()
    }
    let desired = mode === 'studio' ? studioCamera(view, aspect) : desiredCamera(cameraMode, player, aspect, live.current.viewYaw, look.current.pitch, look.current.distance)
    if (active && current?.shot) desired = cinematicPose(current.shot, aspect, bounds)
    if (!initialized.current) { pose.current = desired; initialized.current = true }
    if (lastProjection.current !== null && perspective !== lastProjection.current) {
      const length = Math.hypot(...pose.current.position.map((value, axis) => value - pose.current.target[axis]))
      if (perspective) pose.current.fov = 2 * Math.atan(pose.current.span / (2 * Math.max(1, length))) * 180 / Math.PI
      else pose.current.span = 2 * length * Math.tan((pose.current.fov ?? 58) * Math.PI / 360)
    }
    lastProjection.current = perspective
    const orbit = controls.current
    if (active && owner.current === 'overridden') {
      pose.current = manualOrbitPose(manual.current, pose.current)
    } else if ((active || returning) && current) {
      const key = `${current.revision}:${returning ? 'character' : 'station'}:${current.shot?.id}:${aspect.toFixed(3)}`
      const tween = shotTransition.current
      if (tween.key !== key) {
        tween.key = key; tween.from = { ...pose.current, position: [...pose.current.position], target: [...pose.current.target] }; tween.elapsed = 0; tween.settled = false
        tween.instant = Boolean(current.skipTransition && skippedRevision.current !== current.revision)
        if (tween.instant) skippedRevision.current = current.revision
      }
      const duration = returning ? .9 : shotDuration(current.shot!)
      tween.elapsed = advanceShotTime(tween.elapsed, dt, { ...current, skipTransition: tween.instant })
      const progress = reducedMotion || tween.instant ? 1 : Math.min(1, tween.elapsed / duration)
      pose.current = interpolateShot(tween.from, desired, progress)
      if (progress >= 1 && !tween.settled) {
        tween.settled = true
        if (current.ownership === 'returning-cinematic') latest.current.onCameraSettled?.('cinematic')
        if (returning) latest.current.onCameraSettled?.('player')
      }
    } else if (mode === 'studio' && transition.current <= 0) {
      pose.current = { position: camera.position.toArray() as Point3, target: orbit.target.toArray() as Point3, span: 18 / camera.zoom, fov: 18 }
    } else {
      pose.current = reducedMotion ? desired : advanceCamera(pose.current, desired, dt, transition.current > 0 ? 7 : 14)
      if (immersive) {
        if (cameraMode === 'first-person' && transition.current <= 0) pose.current.position = desired.position
        else if (cameraMode === 'third-person') pose.current.position = cameraObstruction([player[0], player[1] + FOLLOW_ANCHOR_HEIGHT, player[2]], pose.current.position).position
      }
    }
    if (!(mode === 'studio' && transition.current <= 0)) {
      camera.position.fromArray(pose.current.position); orbit.target.fromArray(pose.current.target); camera.lookAt(orbit.target)
      transition.current = Math.max(0, transition.current - dt)
    }
    if (perspective) { camera.aspect = aspect; camera.fov = Math.max(5, Math.min(90, pose.current.fov ?? 58)); camera.zoom = 1 }
    else { camera.left = -9 * aspect; camera.right = 9 * aspect; camera.top = 9; camera.bottom = -9; camera.zoom = 18 / pose.current.span }
    camera.updateProjectionMatrix()
    orbit.enabled = mode === 'studio' && transition.current === 0 && inputEnabled
    if (mode === 'studio') orbit.update()
    live.current.azimuth = immersive ? live.current.viewYaw + Math.PI : FOLLOW_AZIMUTH
    live.current.bodyVisible = cinematicControlled || cameraMode !== 'first-person' || mode === 'studio'
    if (returning && cameraMode === 'first-person' && camera.position.distanceTo(live.current.position.clone().add(new Vector3(0, FOLLOW_ANCHOR_HEIGHT, 0))) < 1.2) live.current.bodyVisible = false
    if (immersive && cameraMode === 'third-person') live.current.bodyVisible = camera.position.distanceTo(live.current.position.clone().add(new Vector3(0, FOLLOW_ANCHOR_HEIGHT, 0))) > 1.1
    const settled = active ? owner.current === 'overridden' || shotTransition.current.settled : returning ? shotTransition.current.settled : transition.current <= 0
    gl.domElement.dataset.cameraSettled = String(settled)
    publish.current += delta
    if (publish.current >= .2) {
      publish.current = 0
      gl.domElement.dataset.cameraPosition = camera.position.toArray().join(',')
      gl.domElement.dataset.cameraTarget = orbit.target.toArray().join(',')
      gl.domElement.dataset.cameraMode = active || returning ? 'cinematic' : mode === 'studio' ? view : cameraMode
      gl.domElement.dataset.cameraOwner = active ? owner.current : returning ? 'returning-character' : 'player'
      gl.domElement.dataset.cameraStation = current?.shot?.stationId ?? ''
      gl.domElement.dataset.cameraRevision = String(current?.revision ?? 0)
      gl.domElement.dataset.cameraShot = current?.shot?.id ?? ''
      gl.domElement.dataset.cameraProjection = perspective ? 'perspective' : 'orthographic'
      gl.domElement.dataset.viewYaw = String(live.current.viewYaw)
      gl.domElement.dataset.characterVisible = String(live.current.bodyVisible)
      gl.domElement.dataset.characterHeading = String(live.current.heading)
    }
  })
  return <><PerspectiveLens makeDefault={immersive || cinematicControlled} position={[5, 3, 5]} near={.08} far={220} fov={58} /><OrthographicLens makeDefault={!immersive && !cinematicControlled} position={[14, 14, 18]} near={.08} far={220} /><OrbitControls ref={controls} enablePan={false} minZoom={.18} maxZoom={6} minPolarAngle={.3} maxPolarAngle={Math.PI / 2 + .05} enableDamping={!reducedMotion} dampingFactor={.12} enabled={false} /></>
}

// Stable children prevent rebuilding the static environment map on every telemetry update.
const ReflectionLighting = memo(function ReflectionLighting({ lighting, quality }: Pick<SceneProps, 'lighting' | 'quality'>) {
  const night = lighting === 'moonlight'
  return (
    <Environment resolution={quality === 'low' ? 128 : 256} environmentIntensity={lighting === 'studio' ? 1.8 : night ? 1 : 1.4}>
      <Lightformer form="rect" intensity={4} color="#e8feff" scale={[4, 7, 1]} position={[-4, 4, 4]} rotation={[0, Math.PI / 4, 0]} />
      <Lightformer form="rect" intensity={3} color="#75eaff" scale={[3, 8, 1]} position={[4, 4, -4]} rotation={[0, -Math.PI / 2, 0]} />
      <Lightformer form="circle" intensity={4} color="#ffffff" scale={[4, 4, 1]} position={[0, 7, 1]} rotation={[Math.PI / 2, 0, 0]} />
      <Lightformer form="rect" intensity={0.5} color="#9dc9da" scale={[20, 20, 1]} position={[0, 0, -12]} />
    </Environment>
  )
})

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
    <ReflectionLighting lighting={lighting} quality={quality} />
  </>
}
function SceneContents(props: SceneProps) {
  const shapes = useRef(new Map<string, StationShape>()).current
  const [bounds, setBounds] = useState(new Map<string, SubjectBounds>())
  const onMeasured = useCallback(() => setBounds(new Map([...shapes].map(([id, shape]) => [id, shape.bounds]))), [shapes])
  const attention = props.cinematic?.shot ?? (props.simulation ? simulationShot(props.simulation) : null)
  const live = useRef<LiveWorld>({ position: new Vector3(...WORLD_LAYOUT.spawn), azimuth: FOLLOW_AZIMUTH, viewYaw: INITIAL_HEADING, movementYaw: INITIAL_HEADING, heading: INITIAL_HEADING, bodyVisible: true, nearby: null })
  return <>
    <RendererRecovery onStatus={props.onRendererStatus} />
    {/* Keep one shadow resource set per Canvas; switching modes never allocates another. */}
    <group visible={props.mode === 'studio' && props.quality !== 'low'}><ContactShadows frames={props.mode === 'studio' && props.quality !== 'low' ? Infinity : 0} position={[0, 0.005, 0]} opacity={0.65} scale={16} blur={2.2} far={7} resolution={512} color="#02080e" /></group>
    <Lighting {...props} live={live} />
    <Suspense fallback={null}><Awushi {...props} live={live} /><Stage {...props} live={live} shapes={shapes} onMeasured={onMeasured} />{props.mode === 'world' && <StationAttention shot={attention} shapes={shapes} reducedMotion={props.reducedMotion || Boolean(props.effectsPaused)} labelsVisible={props.inputEnabled} />}{props.mode === 'world' && props.simulation && <SimulationEffects simulation={props.simulation} environment={props.simulationEnvironment ?? props.simulation.environment} reducedMotion={props.reducedMotion} paused={props.effectsPaused} labelsVisible={props.inputEnabled} />}</Suspense>
    <CameraRig {...props} live={live} bounds={bounds} />
  </>
}
export default function Scene(props: SceneProps) {
  return <SceneBoundary onStatus={props.onRendererStatus}><Canvas fallback={<div className="scene-error">Interactive 3D needs WebGL. Try a browser with hardware acceleration enabled. Adventure consoles and saved progress remain available.</div>} data-testid="awushi-canvas" shadows={props.quality !== 'low'} camera={{ position: [14, 14, 18], near: 0.1, far: 180, zoom: 1 }} dpr={[1, props.quality === 'low' ? 1 : props.quality === 'high' ? 1.75 : 1.5]} gl={{ antialias: true, alpha: true, toneMapping: NeutralToneMapping, toneMappingExposure: 1 }}><SceneContents {...props} /></Canvas></SceneBoundary>
}
