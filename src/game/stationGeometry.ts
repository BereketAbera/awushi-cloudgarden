import { BufferGeometry, Float32BufferAttribute, Matrix4, Mesh, Object3D, Vector3 } from 'three'
import type { District, Station, Point3 } from '../worldConfig'
import type { SubjectBounds } from './cinematic'
export type StationShape = { bounds: SubjectBounds; geometry: BufferGeometry }
/** District GLBs merge by material. Recover station triangles once using authored footprints. */
export function measureStationGeometry(root: Object3D, district: District, stations: readonly Station[]): Map<string, StationShape> {
  root.updateMatrixWorld(true)
  const inverse = new Matrix4().copy(root.matrixWorld).invert()
  const coordinates = new Map(stations.map(station => [station.id, [] as number[]]))
  const a = new Vector3(), b = new Vector3(), c = new Vector3(), transform = new Matrix4()
  root.traverse(node => {
    if (!(node instanceof Mesh)) return
    const positions = node.geometry.getAttribute('position'), index = node.geometry.index
    if (!positions) return
    transform.multiplyMatrices(inverse, node.matrixWorld)
    const count = index?.count ?? positions.count
    for (let i = 0; i < count; i += 3) {
      a.fromBufferAttribute(positions, index ? index.getX(i) : i).applyMatrix4(transform)
      b.fromBufferAttribute(positions, index ? index.getX(i + 1) : i + 1).applyMatrix4(transform)
      c.fromBufferAttribute(positions, index ? index.getX(i + 2) : i + 2).applyMatrix4(transform)
      const x = (a.x + b.x + c.x) / 3 + district.center[0], y = (a.y + b.y + c.y) / 3 + district.center[1], z = (a.z + b.z + c.z) / 3 + district.center[2]
      for (const station of stations) {
        if (y <= station.position[1] + .07 || Math.hypot(x - station.position[0], z - station.position[2]) > station.radius + .12) continue
        const target = coordinates.get(station.id)!
        for (const point of [a, b, c]) target.push(point.x + district.center[0], point.y + district.center[1], point.z + district.center[2])
      }
    }
  })
  const result = new Map<string, StationShape>()
  for (const [id, points] of coordinates) {
    if (!points.length) continue
    const geometry = new BufferGeometry().setAttribute('position', new Float32BufferAttribute(points, 3))
    geometry.computeBoundingBox()
    const center = geometry.boundingBox!.getCenter(new Vector3()), size = geometry.boundingBox!.getSize(new Vector3())
    geometry.translate(-center.x, -center.y, -center.z)
    geometry.computeBoundingSphere()
    result.set(id, { bounds: { center: center.toArray() as Point3, size: size.toArray() as Point3 }, geometry })
  }
  return result
}
