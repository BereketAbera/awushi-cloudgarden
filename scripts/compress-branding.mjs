#!/usr/bin/env node
/** Smaller files at the same pixel dimensions. All encoding runs locally. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { ROOT } from './generate.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');

function run(binary, args) {
  const result = spawnSync(binary, args, { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  if (result.error) throw new Error(`Cannot run ${binary}: ${result.error.message}. Install the local encoder or set its executable-path override.`);
  if (result.signal || result.status !== 0) throw new Error(`${binary} failed: ${result.stderr || result.signal || result.status}`);
  return result.stdout.trim();
}

function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(`Usage: npm run assets:compress
Create WebP images and profile JPEGs at the PNG inputs' original dimensions.
Requires local cwebp and ffmpeg executables (CWEBP_BIN / FFMPEG_BIN overrides).
PNG originals are retained. Regenerate PNGs with assets:branding first when needed.`);
    return;
  }
  if (process.argv.length > 2) throw new Error('Unknown option. Use --help.');
  const cwebp = process.env.CWEBP_BIN || 'cwebp';
  const ffmpeg = process.env.FFMPEG_BIN || 'ffmpeg';
  const encoders = {
    cwebp: run(cwebp, ['-version']),
    ffmpeg: run(ffmpeg, ['-version']).split('\n')[0],
  };
  const manifest = JSON.parse(readFileSync(join(ROOT, 'assets/branding/manifest.json'), 'utf8'));
  // Verify every input before encoding any output.
  const inputs = manifest.outputs.map(entry => {
    const path = join(ROOT, entry.path);
    const data = readFileSync(path);
    if (hash(data) !== entry.sha256) throw new Error(`PNG changed since its manifest was written: ${entry.path}`);
    if (data.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error(`Not a PNG: ${entry.path}`);
    const size = [data.readUInt32BE(16), data.readUInt32BE(20)];
    if (size.some((n, i) => n !== entry.size[i])) throw new Error(`Wrong PNG dimensions: ${entry.path}`);
    return { ...entry, absolutePath: path, bytes: data.length };
  });
  const destination = join(ROOT, 'public/assets/branding');
  mkdirSync(destination, { recursive: true });
  const outputs = [];
  for (const source of inputs) {
    const name = source.transparent ? 'transparent' : 'profile';
    for (const format of source.transparent ? ['webp'] : ['webp', 'jpg']) {
      const output = join(destination, `awushi-${name}-${source.size[0]}.${format}`);
      if (format === 'webp') {
        run(cwebp, ['-quiet', '-q', '85', '-m', '6', '-sharp_yuv', '-alpha_q', '100',
          '-metadata', 'none', source.absolutePath, '-o', output]);
      } else {
        run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y',
          '-i', source.absolutePath, '-map_metadata', '-1', '-frames:v', '1',
          '-q:v', '3', '-update', '1', output]);
      }
      const bytes = readFileSync(output);
      const saving = Math.round((1 - bytes.length / source.bytes) * 1000) / 10;
      outputs.push({ path: relative(ROOT, output), format, size: source.size,
        transparent: source.transparent, source: source.path, source_sha256: source.sha256,
        source_bytes: source.bytes, bytes: bytes.length, reduction_percent: saving, sha256: hash(bytes) });
      console.log(`${relative(ROOT, output)}: ${(bytes.length / 1024).toFixed(1)} KiB (${saving}% smaller)`);
    }
    if (hash(readFileSync(source.absolutePath)) !== source.sha256) throw new Error(`Source PNG changed: ${source.path}`);
  }
  writeFileSync(join(ROOT, 'assets/branding/compression-report.json'), JSON.stringify({
    generator: 'scripts/compress-branding.mjs', encoders,
    settings: { webp_quality: 85, webp_method: 6, webp_alpha_quality: 100, jpeg_qscale: 3,
      resize: false, notes: 'Lossy color compression; WebP preserves alpha. PNG masters and originals unchanged.' },
    outputs,
  }, null, 2) + '\n');
}

try { main(); } catch (error) { console.error(`[branding compression] ${error.message}`); process.exitCode = 1; }
