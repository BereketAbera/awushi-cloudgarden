#!/usr/bin/env node
/** Local headless Blender entry point. No network calls, credentials, or AI services. */
import { accessSync, constants, existsSync } from 'node:fs';
import { dirname, delimiter, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function parseOptions(args) {
  const known = new Set(['--character', '--environment', '--previews', '--all', '--help', '-h']);
  for (const arg of args) if (!known.has(arg)) throw new Error(`Unknown option: ${arg}. Use --help.`);
  const all = args.includes('--all');
  const implicitCharacter = !args.includes('--character') && !args.includes('--environment') && !all;
  return {
    character: all || args.includes('--character') || implicitCharacter,
    environment: all || args.includes('--environment'),
    previews: all || args.includes('--previews') || args.length === 0,
    help: args.includes('--help') || args.includes('-h'),
  };
}

export function findBlender(env = process.env, platform = process.platform) {
  const candidates = env.BLENDER_BIN ? [env.BLENDER_BIN] : [
    ...(platform === 'darwin' ? ['/Applications/Blender.app/Contents/MacOS/Blender'] : []),
    ...(env.PATH || '').split(delimiter).filter(Boolean).map(dir => join(dir, platform === 'win32' ? 'blender.exe' : 'blender')),
    ...(platform === 'win32' ? ['C:\\Program Files\\Blender Foundation\\Blender 5.1\\blender.exe'] : []),
  ];
  for (const candidate of candidates) {
    try { accessSync(candidate, constants.X_OK); return resolve(candidate); } catch { /* next installation */ }
  }
  throw new Error(env.BLENDER_BIN
    ? `BLENDER_BIN is not an executable file: ${env.BLENDER_BIN}`
    : 'Blender was not found. Install Blender locally, then set BLENDER_BIN to its executable path.');
}

export function blenderArguments(script, { previews }) {
  return ['--background', '--factory-startup', '--disable-autoexec', '--python-exit-code', '1',
    '--python', join(ROOT, 'scripts', 'blender', script), '--', '--root', ROOT,
    ...(previews ? ['--previews'] : [])];
}

function main() {
  const options = parseOptions(process.argv.slice(2));
  if (options.help) {
    console.log(`Awushi local asset generator

Usage: node scripts/generate.mjs [options]
  (no options)   Character GLB + Blender source + character/expression previews
  --character    Generate Awushi
  --environment  Generate the world, supporting props, and deployment effects
  --previews     Render previews for the selected generator(s)
  --all          Generate character, environment, and previews
  --help         Show this help

Set BLENDER_BIN to override automatic Blender discovery.
The default only generates the first milestone. Environment work follows character review.
Each generator runs in a fresh factory-startup Blender process.`);
    return;
  }
  const blender = findBlender();
  const scripts = [options.character && 'generate_awushi.py', options.environment && 'generate_world.py', options.environment && 'generate_effects.py'].filter(Boolean);
  for (const script of scripts) {
    if (!existsSync(join(ROOT, 'scripts', 'blender', script))) throw new Error(`Generator does not exist: ${script}`);
    console.log(`\n[assets] ${script} via ${blender}`);
    const result = spawnSync(blender, blenderArguments(script, options), { cwd: ROOT, stdio: 'inherit', env: process.env });
    if (result.error) throw new Error(`Could not start Blender: ${result.error.message}`);
    if (result.signal || result.status !== 0) {
      throw new Error(`Blender failed (${result.signal || `exit ${result.status}`}) while running ${script}.\n`
        + 'Generated files may be incomplete; do not treat this as a successful build.\n'
        + (result.signal === 'SIGSEGV' && process.platform === 'darwin'
          ? 'On macOS, sandbox-restricted Metal discovery can crash before Python starts. Run from a regular local terminal or an authorized host execution context.\n'
          : '')
        + 'Inspect the Blender output above, then rerun generation and npm run assets:validate.');
    }
  }
  console.log('\n[assets] Generation completed. Run npm run assets:validate to verify the exports.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(`[assets] ${error.message}`); process.exitCode = 1; }
}
