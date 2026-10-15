#!/usr/bin/env node
/** Export PNGs with compression disabled from the original lossless renders. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { ROOT } from './generate.mjs';

const hash = data => createHash('sha256').update(data).digest('hex');
const ffmpeg = process.env.FFMPEG_BIN || 'ffmpeg';
function run(args) {
  const result = spawnSync(ffmpeg, args, { encoding: 'utf8' });
  if (result.error) throw new Error(`Cannot run local FFmpeg: ${result.error.message}`);
  if (result.status !== 0 || result.signal) throw new Error(result.stderr || `FFmpeg failed: ${result.signal || result.status}`);
  return result.stdout.trim();
}

function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log('Usage: npm run assets:uncompressed\nExport original PNGs with compression level 0 into assets/branding.\nRequires local ffmpeg; FFMPEG_BIN can override its executable path.');
    return;
  }
  if (process.argv.length > 2) throw new Error('Unknown option. Use --help.');
  const encoder = run(['-version']).split('\n')[0];
  const manifest = JSON.parse(readFileSync(join(ROOT, 'assets/branding/manifest.json'), 'utf8'));
  for (const input of manifest.outputs) {
    if (hash(readFileSync(join(ROOT, input.path))) !== input.sha256) throw new Error(`Source differs from its render manifest: ${input.path}`);
  }
  const destination = join(ROOT, 'assets/branding');
  mkdirSync(destination, { recursive: true });
  const outputs = [];
  for (const source of manifest.outputs) {
    const name = source.transparent ? 'transparent' : 'profile';
    const input = join(ROOT, source.path);
    const output = join(destination, `awushi-${name}-${source.size[0]}-uncompressed.png`);
    run(['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-i', input,
      '-frames:v', '1', '-c:v', 'png', '-compression_level', '0', '-pred', 'none',
      '-pix_fmt', source.transparent ? 'rgba' : 'rgb24', '-update', '1', output]);
    const bytes = readFileSync(output);
    if (hash(readFileSync(input)) !== source.sha256) throw new Error(`Source changed: ${source.path}`);
    outputs.push({ path: relative(ROOT, output), size: source.size, transparent: source.transparent,
      source: source.path, source_sha256: source.sha256, bytes: bytes.length, sha256: hash(bytes) });
    console.log(`${relative(ROOT, output)}: ${(bytes.length / 1024 / 1024).toFixed(2)} MiB`);
  }
  writeFileSync(join(destination, 'uncompressed-report.json'), JSON.stringify({
    generator: 'scripts/uncompressed-branding.mjs', encoder,
    settings: { format: 'PNG', compression_level: 0, prediction: 'none', resize: false,
      notes: 'Original lossless PNG inputs; identical pixels and alpha. Disabling PNG compression increases file size, not image quality.' },
    outputs,
  }, null, 2) + '\n');
}

try { main(); } catch (error) { console.error(`[uncompressed branding] ${error.message}`); process.exitCode = 1; }
