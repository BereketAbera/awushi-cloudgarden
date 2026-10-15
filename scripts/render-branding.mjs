#!/usr/bin/env node
/** Render reusable portraits locally from the existing character source. */
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { findBlender, ROOT } from './generate.mjs';

try {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`Render Awushi profile and transparent images from assets/source/awushi.blend.
Usage: npm run assets:branding -- [--draft] [--resolution 2048] [--samples 128]
  --draft       Render 512px / 24-sample review images into .cache/branding only
  --resolution  Master size, 256–4096 (production minimum 1024)
  --samples     Cycles samples, 1–1024
Production writes assets/branding masters and public/assets/branding PNG sizes.
BLENDER_BIN overrides local Blender discovery. Source blend and GLB are unchanged.`);
  } else {
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--draft') continue;
      if (!['--resolution', '--samples'].includes(args[i]) || !/^\d+$/.test(args[++i] || '')) {
        throw new Error('Expected --draft, --resolution INTEGER, or --samples INTEGER. Use --help.');
      }
    }
    const result = spawnSync(findBlender(), [
      '--background', '--factory-startup', '--disable-autoexec', '--python-exit-code', '1',
      '--python', join(ROOT, 'scripts/blender/render_branding.py'), '--', '--root', ROOT, ...args,
    ], { cwd: ROOT, stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.signal || result.status !== 0) throw new Error(`Blender rendering failed (${result.signal || result.status}).`);
  }
} catch (error) {
  console.error(`[branding] ${error.message}`);
  process.exitCode = 1;
}
