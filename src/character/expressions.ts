import type { Mesh, Object3D } from 'three'
import type { ExpressionName } from '../game/types'

/** Neutral is the unmorphed authored face; the other names match GLB targets. */
export const EXPRESSIONS: readonly ExpressionName[] = [
  'Neutral', 'Happy', 'Curious', 'Thinking', 'Excited', 'Worried',
  'Surprised', 'Determined', 'Celebrating', 'Sleepy',
]

type FacialMesh = { mesh: Mesh; targets: { name: ExpressionName; index: number }[] }
const cache = new WeakMap<Object3D, FacialMesh[]>()
const morphNames = new Set<string>(EXPRESSIONS.slice(1))

function facialMeshes(scene: Object3D): FacialMesh[] {
  const cached = cache.get(scene)
  if (cached) return cached
  const result: FacialMesh[] = []
  scene.traverse((object) => {
    const mesh = object as Mesh
    if (!mesh.isMesh || !mesh.morphTargetDictionary || !mesh.morphTargetInfluences) return
    const targets = Object.entries(mesh.morphTargetDictionary)
      .filter(([name]) => morphNames.has(name))
      .map(([name, index]) => ({ name: name as ExpressionName, index }))
    if (targets.length) result.push({ mesh, targets })
  })
  cache.set(scene, result)
  return result
}

export function getExpressionTargets(scene: Object3D): string[] {
  return [...new Set(facialMeshes(scene).flatMap(({ targets }) => targets.map(({ name }) => name)))]
}

/**
 * Blend a portable facial morph layer after the skeletal mixer updates.
 * This does not seek, stop, or modify a locomotion action or any pose bone.
 * A convex crossfade keeps total expression influence <= 1 when used from reset.
 * The cache and in-place influence edits avoid per-frame scene traversal/allocation.
 */
export function applyExpression(
  scene: Object3D,
  name: ExpressionName,
  intensity: number,
  dt: number,
  reducedMotion = false,
): void {
  const weight = Number.isFinite(intensity) ? Math.min(1, Math.max(0, intensity)) : 0
  const delta = Number.isFinite(dt) ? Math.min(0.1, Math.max(0, dt)) : 0
  const alpha = 1 - Math.exp(-(reducedMotion ? 18 : 12) * delta)
  for (const { mesh, targets } of facialMeshes(scene)) {
    const influences = mesh.morphTargetInfluences!
    for (const { name: targetName, index } of targets) {
      const target = targetName === name ? weight : 0
      const current = Number.isFinite(influences[index]) ? influences[index] : 0
      const next = current + (target - current) * alpha
      influences[index] = Math.abs(next - target) < 0.00001 ? target : next
    }
  }
}

/** Restore the authored face on a studio/world reset without touching animation. */
export function resetExpression(scene: Object3D): void {
  for (const { mesh, targets } of facialMeshes(scene)) {
    for (const { index } of targets) mesh.morphTargetInfluences![index] = 0
  }
}
