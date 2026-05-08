#!/usr/bin/env node
/** Compare repeated exports without mistaking harmless triangle order for shape changes. */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseGLB, accessorValues } from './validate-assets.mjs';

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

export function compareExports(beforeBytes, afterBytes) {
  const before = parseGLB(beforeBytes), after = parseGLB(afterBytes);
  assert(JSON.stringify(before.json) === JSON.stringify(after.json), 'Export metadata, structure, accessor bounds, or material parameters changed');
  const indexAccessors = new Set(), normalAccessors = new Set(), positionAccessors = new Set();
  for (const mesh of before.json.meshes) for (const primitive of mesh.primitives) {
    indexAccessors.add(primitive.indices);
    normalAccessors.add(primitive.attributes.NORMAL);
    positionAccessors.add(primitive.attributes.POSITION);
  }
  const triangles = values => {
    const flat = values.flat(), result = [];
    for (let i = 0; i < flat.length; i += 3) {
      const tuple = flat.slice(i, i + 3), start = tuple.indexOf(Math.min(...tuple));
      result.push([...tuple.slice(start), ...tuple.slice(0, start)].join(','));
    }
    return result.sort();
  };
  let normalComponentsChanged = 0, maxNormalDelta = 0, reorderedIndexAccessors = 0;
  for (let i = 0; i < before.json.accessors.length; i++) {
    const a = accessorValues(before, i), b = accessorValues(after, i);
    assert(a.length === b.length, `Accessor ${i} length changed`);
    if (indexAccessors.has(i)) {
      const at = triangles(a), bt = triangles(b);
      assert(at.every((v, k) => v === bt[k]), `Oriented triangle topology changed in accessor ${i}`);
      if (a.some((v, k) => v[0] !== b[k][0])) reorderedIndexAccessors++;
    } else if (normalAccessors.has(i)) {
      for (let k = 0; k < a.length; k++) for (let c = 0; c < a[k].length; c++) {
        const delta = Math.abs(a[k][c] - b[k][c]);
        if (delta > 0) normalComponentsChanged++;
        maxNormalDelta = Math.max(maxNormalDelta, delta);
        assert(delta <= 0.0002, `Normal changed beyond floating-point tolerance in accessor ${i}`);
      }
    } else {
      assert(a.every((v, k) => v.every((x, c) => x === b[k][c])), `${positionAccessors.has(i) ? 'Vertex position' : 'UV, skin, or animation data'} changed in accessor ${i}`);
    }
  }
  for (const image of before.json.images || []) if (image.bufferView !== undefined) {
    const view = before.json.bufferViews[image.bufferView], start = view.byteOffset || 0;
    assert(before.bin.subarray(start, start + view.byteLength).equals(after.bin.subarray(start, start + view.byteLength)), 'Embedded image bytes changed');
  }
  return { beforeSha256: hash(beforeBytes), afterSha256: hash(afterBytes), bytes: afterBytes.length,
    byteIdentical: beforeBytes.equals(afterBytes), jsonIdentical: true, positionsExact: true,
    orientedTriangleSetsExact: true, skinAndAnimationAccessorsExact: true, embeddedImagesExact: true,
    reorderedIndexAccessors, normalComponentsChanged, maxNormalDelta, normalTolerance: 0.0002,
    result: 'Geometry, materials, textures, skinning, and animation reproduced; binary ordering and tiny normal differences are permitted.' };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [beforePath, afterPath, reportPath] = process.argv.slice(2);
    assert(beforePath && afterPath, 'Usage: node scripts/compare-glb.mjs before.glb after.glb [report.json]');
    const report = { asset: basename(afterPath), ...compareExports(readFileSync(beforePath), readFileSync(afterPath)) };
    if (reportPath) writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
  } catch (error) { console.error(`[reproducibility] ${error.message}`); process.exitCode = 1; }
}
