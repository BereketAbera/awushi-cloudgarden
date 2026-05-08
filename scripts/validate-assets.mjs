#!/usr/bin/env node
/** Validates the real binary exports; no renderer or remote service is required. */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };
const SIZES = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const READERS = { 5120: 'readInt8', 5121: 'readUInt8', 5122: 'readInt16LE', 5123: 'readUInt16LE', 5125: 'readUInt32LE', 5126: 'readFloatLE' };
export const REQUIRED_CLIPS = ['Idle', 'Walk', 'Run', 'Interact', 'Celebrate'];

function assert(condition, message) { if (!condition) throw new Error(message); }

function multiply(a, b) {
  const out = Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) out[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return out;
}

function transform(node) {
  if (node.matrix) return node.matrix;
  const [x, y, z, w] = node.rotation || [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale || [1, 1, 1];
  const [tx, ty, tz] = node.translation || [0, 0, 0];
  return [(1 - 2 * (y*y + z*z))*sx, 2*(x*y + z*w)*sx, 2*(x*z - y*w)*sx, 0,
    2*(x*y - z*w)*sy, (1 - 2*(x*x + z*z))*sy, 2*(y*z + x*w)*sy, 0,
    2*(x*z + y*w)*sz, 2*(y*z - x*w)*sz, (1 - 2*(x*x + y*y))*sz, 0, tx, ty, tz, 1];
}

export function parseGLB(bytes) {
  assert(bytes.length >= 20, 'GLB is truncated');
  assert(bytes.readUInt32LE(0) === 0x46546c67, 'Invalid GLB magic');
  assert(bytes.readUInt32LE(4) === 2, 'Expected glTF 2.0');
  assert(bytes.readUInt32LE(8) === bytes.length, 'GLB declared length does not match file length');
  let offset = 12;
  const chunks = [];
  while (offset < bytes.length) {
    assert(offset + 8 <= bytes.length, 'Truncated GLB chunk header');
    const size = bytes.readUInt32LE(offset);
    const type = bytes.readUInt32LE(offset + 4);
    assert(size % 4 === 0, 'GLB chunk is not four-byte aligned');
    assert(offset + 8 + size <= bytes.length, 'GLB chunk exceeds file length');
    chunks.push({ type, bytes: bytes.subarray(offset + 8, offset + 8 + size) });
    offset += 8 + size;
  }
  assert(chunks[0]?.type === 0x4e4f534a, 'GLB must start with a JSON chunk');
  assert(chunks.filter(c => c.type === 0x4e4f534a).length === 1, 'Duplicate JSON chunks');
  assert(chunks.filter(c => c.type === 0x004e4942).length <= 1, 'Duplicate binary chunks');
  const json = JSON.parse(chunks[0].bytes.toString('utf8').trim());
  const bin = chunks.find(c => c.type === 0x004e4942)?.bytes || Buffer.alloc(0);
  assert(json.asset?.version === '2.0', 'Expected asset.version 2.0');
  assert(json.buffers?.length === 1 && !json.buffers[0].uri, 'Export must use one embedded buffer');
  assert(json.buffers[0].byteLength <= bin.length && bin.length - json.buffers[0].byteLength <= 3, 'Invalid embedded buffer length');
  for (const image of json.images || []) assert(image.uri === undefined || image.uri.startsWith('data:'), 'External image URI is not allowed');
  for (const view of json.bufferViews || []) {
    assert(view.buffer === 0, 'Buffer view references a missing buffer');
    assert((view.byteOffset || 0) >= 0 && view.byteLength >= 0 && (view.byteOffset || 0) + view.byteLength <= json.buffers[0].byteLength, 'Buffer view exceeds embedded buffer');
  }
  return { json, bin };
}

export function accessorValues(model, index) {
  const { json, bin } = model;
  const accessor = json.accessors?.[index];
  assert(accessor, `Missing accessor ${index}`);
  assert(!accessor.sparse, `Sparse accessor ${index} requires expansion before native budget checks`);
  const components = COMPONENTS[accessor.type];
  const size = SIZES[accessor.componentType];
  assert(components && size, `Unsupported accessor format ${index}`);
  assert(Number.isInteger(accessor.count) && accessor.count > 0, `Empty or invalid accessor ${index}`);
  const view = json.bufferViews?.[accessor.bufferView];
  assert(view, `Accessor ${index} has no buffer view`);
  const stride = view.byteStride || size * components;
  assert(stride >= size * components && stride % size === 0, `Invalid accessor stride ${index}`);
  const relative = accessor.byteOffset || 0;
  assert(relative >= 0 && relative + (accessor.count - 1) * stride + size * components <= view.byteLength, `Accessor ${index} exceeds its buffer view`);
  const start = (view.byteOffset || 0) + relative;
  const values = [];
  for (let i = 0; i < accessor.count; i++) {
    const tuple = [];
    for (let c = 0; c < components; c++) {
      let value = bin[READERS[accessor.componentType]](start + i * stride + c * size);
      assert(Number.isFinite(value), `Non-finite number in accessor ${index}`);
      if (accessor.normalized) {
        if (accessor.componentType === 5120) value = Math.max(value / 127, -1);
        if (accessor.componentType === 5121) value /= 255;
        if (accessor.componentType === 5122) value = Math.max(value / 32767, -1);
        if (accessor.componentType === 5123) value /= 65535;
      }
      tuple.push(value);
    }
    values.push(tuple);
  }
  return values;
}

export function validateModel(model, { character = false, byteLength = 0, triangleBudget = character ? 80000 : 150000 } = {}) {
  const { json } = model;
  assert(json.meshes?.length > 0, 'No meshes in exported asset');
  assert(json.scenes?.length > 0 && json.scenes[json.scene ?? 0]?.nodes?.length > 0, 'No default scene root nodes');
  assert(json.materials?.length > 0, 'No exported materials');
  assert(byteLength <= (character ? 5 : 8) * 1024 * 1024, 'Asset exceeds GLB file-size budget');
  const bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  let triangles = 0, vertices = 0, primitives = 0;
  const cache = new Map();
  const values = index => { if (!cache.has(index)) cache.set(index, accessorValues(model, index)); return cache.get(index); };
  for (const mesh of json.meshes) for (const primitive of mesh.primitives || []) {
    primitives++;
    assert((primitive.mode ?? 4) === 4, 'Only triangle primitives are supported');
    assert(json.materials[primitive.material], 'Primitive has no valid material');
    const positions = values(primitive.attributes.POSITION);
    assert(json.accessors[primitive.attributes.POSITION].type === 'VEC3', 'POSITION must be VEC3');
    vertices += positions.length;
    for (const tuple of positions) for (let axis = 0; axis < 3; axis++) {
      bounds.min[axis] = Math.min(bounds.min[axis], tuple[axis]);
      bounds.max[axis] = Math.max(bounds.max[axis], tuple[axis]);
    }
    const indices = primitive.indices === undefined ? positions.map((_, i) => [i]) : values(primitive.indices);
    assert(indices.length % 3 === 0, 'Triangle index count is not divisible by 3');
    for (const [i] of indices) assert(Number.isInteger(i) && i >= 0 && i < positions.length, 'Triangle index outside POSITION accessor');
    triangles += indices.length / 3;
    assert(primitive.attributes.NORMAL !== undefined, 'Smooth normals are missing');
    for (const [attribute, index] of Object.entries(primitive.attributes)) {
      assert(values(index).length === positions.length, `${attribute} count does not match POSITION`);
    }
    if (primitive.attributes.WEIGHTS_0 !== undefined) {
      assert(primitive.attributes.JOINTS_0 !== undefined, 'Weights have no joints');
      for (const weights of values(primitive.attributes.WEIGHTS_0)) {
        assert(weights.every(w => w >= 0 && w <= 1.0001), 'Invalid skin weight');
        assert(Math.abs(weights.reduce((a, b) => a + b, 0) - 1) < 0.002, 'Skin weights do not sum to 1');
      }
    }
  }
  assert(triangles > 0 && triangles <= triangleBudget, `Triangle budget exceeded: ${triangles} > ${triangleBudget}`);
  for (const node of json.nodes || []) {
    for (const prop of ['matrix', 'translation', 'rotation', 'scale']) if (node[prop]) assert(node[prop].every(Number.isFinite), `Non-finite node ${prop}`);
    if (node.mesh !== undefined) assert(json.meshes[node.mesh], 'Node references a missing mesh');
    if (node.skin !== undefined) assert(json.skins?.[node.skin], 'Node references a missing skin');
    for (const child of node.children || []) assert(json.nodes[child], 'Node references a missing child');
  }
  for (const skin of json.skins || []) {
    assert(skin.joints.length > 0 && skin.joints.every(j => json.nodes[j]), 'Skin has missing joints');
    if (skin.inverseBindMatrices !== undefined) assert(values(skin.inverseBindMatrices).length === skin.joints.length, 'Inverse bind count does not match joints');
  }
  const sceneBounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  const walk = (index, parent, ancestors = new Set()) => {
    assert(!ancestors.has(index), 'Cycle in scene node hierarchy');
    const node = json.nodes[index];
    const matrix = multiply(parent, transform(node));
    if (node.mesh !== undefined) for (const primitive of json.meshes[node.mesh].primitives) {
      for (const [x, y, z] of values(primitive.attributes.POSITION)) for (let a = 0; a < 3; a++) {
        const v = matrix[a]*x + matrix[4+a]*y + matrix[8+a]*z + matrix[12+a];
        sceneBounds.min[a] = Math.min(sceneBounds.min[a], v);
        sceneBounds.max[a] = Math.max(sceneBounds.max[a], v);
      }
    }
    for (const child of node.children || []) walk(child, matrix, new Set([...ancestors, index]));
  };
  for (const node of json.scenes[json.scene ?? 0].nodes) walk(node, transform({}));
  const animations = [];
  for (const animation of json.animations || []) {
    assert(animation.name && animation.channels?.length > 0, 'Empty or unnamed animation');
    let duration = 0, varyingChannels = 0;
    let rootTranslationBounds, blinkRange;
    for (const channel of animation.channels) {
      assert(json.nodes[channel.target.node], 'Animation targets a missing node');
      assert(['translation', 'rotation', 'scale', 'weights'].includes(channel.target.path), 'Unsupported animation path');
      const sampler = animation.samplers[channel.sampler];
      assert(sampler, 'Animation references a missing sampler');
      const times = values(sampler.input).flat();
      assert(times.length >= 2 && times[0] >= 0, 'Animation has too few keys or a negative start');
      assert(times.every((t, i) => i === 0 || t > times[i - 1]), 'Animation times must increase strictly');
      const output = values(sampler.output);
      const multiplier = sampler.interpolation === 'CUBICSPLINE' ? 3 : 1;
      if (channel.target.path !== 'weights') assert(output.length === times.length * multiplier, 'Animation output count does not match input');
      if (output.some(tuple => tuple.some((v, i) => Math.abs(v - output[0][i]) > 1e-5))) varyingChannels++;
      if (json.nodes[channel.target.node].name === 'root' && channel.target.path === 'translation') {
        rootTranslationBounds = { min: [0,1,2].map(i => Math.min(...output.map(v => v[i]))), max: [0,1,2].map(i => Math.max(...output.map(v => v[i]))) };
      }
      if (json.nodes[channel.target.node].name === 'eye_L' && channel.target.path === 'scale') {
        blinkRange = [Math.min(...output.map(v => v[1])), Math.max(...output.map(v => v[1]))];
      }
      duration = Math.max(duration, times.at(-1));
    }
    assert(varyingChannels > 0, `Animation ${animation.name} contains no changing channels`);
    animations.push({ name: animation.name, duration: Number(duration.toFixed(4)), channels: animation.channels.length, varyingChannels,
      ...(rootTranslationBounds ? { rootTranslationBounds } : {}), ...(blinkRange ? { blinkRange } : {}) });
  }
  if (character) {
    const names = animations.map(a => a.name);
    for (const required of REQUIRED_CLIPS) assert(names.includes(required), `Missing required animation: ${required}`);
    assert(new Set(names).size === names.length, 'Duplicate animation clip names');
    assert((json.extensionsUsed || []).includes('KHR_materials_transmission'), 'Character has no physical transmission material');
    assert(json.materials.some(m => (m.extensions?.KHR_materials_transmission?.transmissionFactor || 0) > 0), 'Character transmission extension has no active material');
    assert(json.materials.some(m => /jelly|cyan|awushi/i.test(m.name || '')), 'Character jelly material is missing');
    const height = sceneBounds.max[1] - sceneBounds.min[1];
    assert(height >= 2 && height <= 5, `Character Y-up height is outside the 2–5 meter integration range: ${height}`);
    assert(sceneBounds.min[1] >= -0.08 && sceneBounds.min[1] <= 0.15, `Character feet are not near y=0: ${sceneBounds.min[1]}`);
    const jump = animations.find(a => a.name === 'Celebrate').rootTranslationBounds;
    assert(jump && jump.max[1] - jump.min[1] >= 0.25, 'Celebration must jump vertically along glTF +Y');
    for (const clip of animations) if (clip.rootTranslationBounds) {
      for (const axis of [0, 2]) assert(clip.rootTranslationBounds.max[axis] - clip.rootTranslationBounds.min[axis] <= 0.01,
        `${clip.name} has horizontal root drift; gameplay clips must be in-place`);
    }
    const blink = animations.find(a => a.name === 'Idle').blinkRange;
    assert(blink && blink[0] < 0.25 && blink[1] > 0.9, 'Idle is missing a complete eye blink');
  }
  return { meshes: json.meshes.length, primitives, vertices, triangles, materials: json.materials.length,
    skins: json.skins?.length || 0, nodes: json.nodes?.length || 0, meshLocalBounds: bounds, sceneBounds, animations,
    extensions: json.extensionsUsed || [] };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) { console.log('Usage: node scripts/validate-assets.mjs [asset.glb ...]\nWithout arguments, validate every GLB in public/assets. Writes assets/validation-report.json.'); return; }
  const paths = args.length ? args.map(p => resolve(p)) : readdirSync(join(ROOT, 'public', 'assets')).filter(p => p.endsWith('.glb')).sort().map(p => join(ROOT, 'public', 'assets', p));
  assert(paths.length > 0, 'No exported GLBs found. Run npm run assets:generate first.');
  assert(paths.some(p => basename(p) === 'awushi.glb') || args.length > 0, 'Required character awushi.glb is missing');
  let validator;
  try { validator = await import('gltf-validator'); }
  catch { throw new Error('Khronos gltf-validator is not installed. Run npm install before validating.'); }
  const reports = [];
  for (const path of paths) {
    const bytes = readFileSync(path);
    const character = basename(path) === 'awushi.glb';
    const stats = validateModel(parseGLB(bytes), { character, byteLength: bytes.length });
    const official = await validator.validateBytes(new Uint8Array(bytes), { uri: basename(path), maxIssues: 1000,
      externalResourceFunction: async uri => { throw new Error(`External resource forbidden: ${uri}`); } });
    const report = { file: basename(path), bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), ...stats,
      khronos: { errors: official.issues.numErrors, warnings: official.issues.numWarnings, infos: official.issues.numInfos, truncated: official.issues.truncated, messages: official.issues.messages } };
    reports.push(report);
    console.log(`${basename(path)}: ${stats.triangles.toLocaleString()} triangles, ${(bytes.length / 1024).toFixed(0)} KiB, ${stats.animations.length} clips; Khronos ${report.khronos.errors} errors, ${report.khronos.warnings} warnings`);
    assert(!official.issues.truncated, `Khronos issue limit reached for ${basename(path)}; review the asset before claiming complete validation`);
    assert(official.issues.numErrors === 0, `Khronos validation failed for ${basename(path)}: ${JSON.stringify(official.issues.messages)}`);
  }
  mkdirSync(join(ROOT, 'assets'), { recursive: true });
  writeFileSync(join(ROOT, 'assets', 'validation-report.json'), JSON.stringify({ validator: 'native structural checks + Khronos glTF Validator', assets: reports }, null, 2) + '\n');
  console.log('All exports passed. Report: assets/validation-report.json');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(`[validate] ${error.message}`); process.exitCode = 1; });
}
