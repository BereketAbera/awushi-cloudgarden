import test from 'node:test';
import assert from 'node:assert/strict';
import { parseOptions, blenderArguments, findBlender } from './generate.mjs';
import { parseGLB, accessorValues, validateModel, REQUIRED_CLIPS } from './validate-assets.mjs';
import { compareExports } from './compare-glb.mjs';

function fixture() {
  const bin = Buffer.alloc(84);
  [0,0,0, 1,0,0, 0,1,0, 0,0,1, 0,0,1, 0,0,1].forEach((v, i) => bin.writeFloatLE(v, i * 4));
  [0,1,2].forEach((v, i) => bin.writeUInt16LE(v, 72 + i * 2));
  const json = {
    asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    buffers: [{ byteLength: bin.length }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }, { buffer: 0, byteOffset: 36, byteLength: 36 }, { buffer: 0, byteOffset: 72, byteLength: 6 }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' }, { bufferView: 1, componentType: 5126, count: 3, type: 'VEC3' }, { bufferView: 2, componentType: 5123, count: 3, type: 'SCALAR' }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 }] }], materials: [{ name: 'Cyan jelly' }],
  };
  return { json, bin };
}

function encodeGLB({ json, bin }) {
  const text = Buffer.from(JSON.stringify(json).padEnd(Math.ceil(JSON.stringify(json).length / 4) * 4, ' '));
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4);
  header.writeUInt32LE(28 + text.length + bin.length, 8);
  header.writeUInt32LE(text.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(bin.length, 0); binHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, text, binHeader, bin]);
}

function animatedCharacter({ forwardJump = false, rootDrift = false, blink = true } = {}) {
  const model = fixture();
  model.bin.writeFloatLE(3, 28); // Character's highest vertex, already Y-up.
  model.json.nodes.push({ name: 'root', children: [2] }, { name: 'eye_L' });
  model.json.scenes[0].nodes.push(1);
  model.json.extensionsUsed = ['KHR_materials_transmission'];
  model.json.materials[0].extensions = { KHR_materials_transmission: { transmissionFactor: 0.4 } };
  const addAccessor = (values, type) => {
    const flat = values.flat();
    const bytes = Buffer.alloc(flat.length * 4);
    flat.forEach((v, i) => bytes.writeFloatLE(v, i * 4));
    const bufferView = model.json.bufferViews.push({ buffer: 0, byteOffset: model.bin.length, byteLength: bytes.length }) - 1;
    model.bin = Buffer.concat([model.bin, bytes]);
    model.json.buffers[0].byteLength = model.bin.length;
    return model.json.accessors.push({ bufferView, componentType: 5126, count: values.length, type }) - 1;
  };
  const times = addAccessor([0, 1, 2], 'SCALAR');
  model.json.animations = REQUIRED_CLIPS.map(name => {
    const jump = name === 'Celebrate';
    const translate = addAccessor([[0,0,0], [rootDrift && name === 'Walk' ? 0.2 : 0, jump ? (forwardJump ? 0 : 0.6) : 0.02, jump && forwardJump ? 0.6 : 0], [0,0,0]], 'VEC3');
    const scale = addAccessor([[1,1,1], [1,blink ? 0.1 : 1,1], [1,1,1]], 'VEC3');
    return { name, channels: [{ target: { node: 1, path: 'translation' }, sampler: 0 }, { target: { node: 2, path: 'scale' }, sampler: 1 }],
      samplers: [{ input: times, output: translate }, { input: times, output: scale }] };
  });
  return model;
}

test('default targets first milestone; explicit environment and all work independently', () => {
  assert.deepEqual(parseOptions([]), { character: true, environment: false, previews: true, help: false });
  assert.deepEqual(parseOptions(['--environment']), { character: false, environment: true, previews: false, help: false });
  assert.deepEqual(parseOptions(['--all']), { character: true, environment: true, previews: true, help: false });
  assert.equal(parseOptions(['--previews']).character, true);
  assert.throws(() => parseOptions(['--publish']), /Unknown option/);
});

test('Blender invocation propagates Python failures and uses explicit isolated startup', () => {
  const args = blenderArguments('generate_awushi.py', { previews: true });
  assert.ok(args.includes('--factory-startup'));
  assert.ok(args.includes('--disable-autoexec'));
  assert.equal(args[args.indexOf('--python-exit-code') + 1], '1');
  assert.ok(args.indexOf('--root') > args.indexOf('--'));
  assert.ok(args.includes('--previews'));
  assert.throws(() => findBlender({ BLENDER_BIN: '/does/not/exist' }), /not an executable/);
});

test('reads an embedded GLB and verifies indexed geometry and transformed scene bounds', () => {
  const model = fixture();
  model.json.nodes[0].translation = [2,3,4];
  const report = validateModel(parseGLB(encodeGLB(model)));
  assert.equal(report.triangles, 1);
  assert.deepEqual(report.sceneBounds, { min: [2,3,4], max: [3,4,4] });
});

test('rejects truncated files, mismatched lengths, and remote dependencies', () => {
  const bytes = encodeGLB(fixture());
  assert.throws(() => parseGLB(bytes.subarray(0, 18)), /truncated/);
  assert.throws(() => parseGLB(bytes.subarray(0, bytes.length - 4)), /length/);
  const model = fixture(); model.json.images = [{ uri: 'https://example.com/asset.png' }];
  assert.throws(() => parseGLB(encodeGLB(model)), /External image/);
});

test('rejects non-finite vertices and indices outside vertex count', () => {
  const model = fixture(); model.bin.writeFloatLE(NaN, 0);
  assert.throws(() => validateModel(model), /Non-finite/);
  model.bin.writeFloatLE(0, 0); model.bin.writeUInt16LE(9, 72);
  assert.throws(() => validateModel(model), /index outside/);
});

test('respects interleaved accessor stride and rejects out-of-bounds reads', () => {
  const model = fixture();
  model.json.accessors[0].count = 2; model.json.bufferViews[0].byteStride = 24;
  assert.deepEqual(accessorValues(model, 0), [[0,0,0], [0,1,0]]);
  model.json.accessors[0].count = 3;
  assert.throws(() => accessorValues(model, 0), /exceeds its buffer/);
});

test('rejects over-budget exports and missing character animations', () => {
  assert.throws(() => validateModel(fixture(), { byteLength: 9 * 1024 * 1024 }), /file-size budget/);
  assert.throws(() => validateModel(fixture(), { triangleBudget: 0 }), /Triangle budget/);
  assert.throws(() => validateModel(fixture(), { character: true }), /Missing required animation: Idle/);
});

test('rejects node hierarchy cycles rather than recursing indefinitely', () => {
  const model = fixture(); model.json.nodes[0].children = [0];
  assert.throws(() => validateModel(model), /Cycle/);
});

test('verifies exported vertical jump, in-place motion, and full idle blink', () => {
  const result = validateModel(animatedCharacter(), { character: true });
  assert.equal(result.animations.length, 5);
  assert.ok(result.animations.find(a => a.name === 'Celebrate').rootTranslationBounds.max[1] > 0.5);
  assert.ok(result.animations.find(a => a.name === 'Idle').blinkRange[0] < 0.2);
});

test('catches bone-local-axis jump regression and unintended horizontal root motion', () => {
  assert.throws(() => validateModel(animatedCharacter({ forwardJump: true }), { character: true }), /jump vertically/);
  assert.throws(() => validateModel(animatedCharacter({ rootDrift: true }), { character: true }), /horizontal root drift/);
});

test('rejects an idle clip with no blink even when other animation channels change', () => {
  assert.throws(() => validateModel(animatedCharacter({ blink: false }), { character: true }), /eye blink/);
});

test('reproducibility accepts rotated triangle indices while preserving oriented topology', () => {
  const before = fixture(), after = fixture();
  [1,2,0].forEach((v, i) => after.bin.writeUInt16LE(v, 72 + i * 2));
  const result = compareExports(encodeGLB(before), encodeGLB(after));
  assert.equal(result.byteIdentical, false);
  assert.equal(result.orientedTriangleSetsExact, true);
});

test('reproducibility rejects a shape change or flipped triangle winding', () => {
  const before = fixture(), shape = fixture(), winding = fixture();
  shape.bin.writeFloatLE(0.001, 0);
  [0,2,1].forEach((v, i) => winding.bin.writeUInt16LE(v, 72 + i * 2));
  assert.throws(() => compareExports(encodeGLB(before), encodeGLB(shape)), /Vertex position changed/);
  assert.throws(() => compareExports(encodeGLB(before), encodeGLB(winding)), /triangle topology changed/);
});
