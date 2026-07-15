import type { MutableRefObject } from 'react'
import type { EnvironmentId, SimulationState } from '../simulation/domain'
export type Clip = 'Idle' | 'Walk' | 'Run' | 'Interact' | 'Celebrate'
export type View = 'three-quarter' | 'front' | 'side' | 'back'
export type Mode = 'studio' | 'world'
export type CameraMode = 'third-person' | 'first-person' | 'overview' | 'isometric'
export type ExpressionName = 'Neutral' | 'Happy' | 'Curious' | 'Thinking' | 'Excited' | 'Worried' | 'Surprised' | 'Determined' | 'Celebrating' | 'Sleepy'
export type Quality = 'low' | 'balanced' | 'high'
export type Lighting = 'daylight' | 'moonlight' | 'studio'
export type AssetInfo = { clips: string[]; triangles: number; meshes: number; expressions?: string[] }
export type Telemetry = { position: [number, number, number]; districtId: string; nearbyId: string | null; expression: ExpressionName; fps: number; drawCalls: number; triangles: number }
export type Reaction = { id: number; expression: ExpressionName } | null
export type SceneProps = {
  clip: Clip; playing: boolean; speed: number; mode: Mode; view: View; reset: number
  input: MutableRefObject<Set<string>>; onClip: (clip: Clip) => void; onReady: (info: AssetInfo) => void
  cameraMode: CameraMode; expression: ExpressionName | 'Auto'; expressionIntensity: number
  lighting: Lighting; rotation: number; quality: Quality; reducedMotion: boolean
  activeStation: string | null; reaction: Reaction; inputEnabled: boolean
  onTelemetry: (value: Telemetry) => void
  targetStation?: string | null; simulation?: SimulationState; simulationEnvironment?: EnvironmentId
}
