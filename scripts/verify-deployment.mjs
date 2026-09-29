import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { chromium, expect } from '@playwright/test'

// Run after publishing the local dist/ build. No hosting credentials are sent.
const origin = new URL(process.argv[2] ?? 'https://awushi-devops-world.vercel.app').origin
assert.equal(new URL(origin).protocol, 'https:', 'Verify the public HTTPS deployment')
const paths = ['/index.html', ...readdirSync('dist/assets').filter(name => /\.(js|css|glb)$/.test(name)).sort().map(name => `/assets/${name}`)]
const files = []
for (const path of paths) {
  const response = await fetch(`${origin}${path}`, { signal: AbortSignal.timeout(30_000) })
  assert.equal(response.status, 200, path)
  const bytes = Buffer.from(await response.arrayBuffer())
  const hash = value => createHash('sha256').update(value).digest('hex')
  assert.equal(hash(bytes), hash(readFileSync(`dist${path}`)), `Published bytes differ: ${path}`)
  if (path.endsWith('.glb')) assert.match(response.headers.get('content-type') ?? '', /model\/gltf-binary/)
  files.push({ path, status: response.status, bytes: bytes.length, sha256: hash(bytes), contentType: response.headers.get('content-type'), cacheControl: response.headers.get('cache-control') })
}
const missing = await fetch(`${origin}/assets/awushi-missing-verification.glb`, { signal: AbortSignal.timeout(30_000) })
assert.equal(missing.status, 404, 'Missing models must not return an HTML success fallback')

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist'] })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  await page.goto(origin)
  await expect(page.locator('canvas')).toHaveAttribute('data-camera-mode', 'overview', { timeout: 30_000 })
  await expect(page.getByTestId('onboarding')).toBeVisible()
  await page.getByTestId('play-adventure').click()
  await page.getByTestId('adventure-variant-recover-pod').selectOption('readiness')
  await page.getByTestId('adventure-start-recover-pod').click()
  await page.getByTestId('mission-watch-flow').click()
  await expect(page.locator('canvas')).toHaveAttribute('data-camera-station', 'kubernetes')
  await expect(page.locator('canvas')).toHaveAttribute('data-camera-settled', 'true')
  await expect(page.getByTestId('watch-flow')).toContainText('Needs attention')
  await page.screenshot({ path: 'assets/previews/vercel-phase4-watch-flow.png' })
  await page.getByTestId('flow-exit').click()
  await page.getByTestId('guide-me-world').click()
  await expect(page.getByTestId('guide-focus')).toBeVisible()
  await page.getByTestId('guide-inspect').click()
  await page.getByTestId('adventure-action-inspect-pod').click()
  await page.getByTestId('adventure-action-restart-pod').click()
  await expect(page.getByTestId('mission-feedback')).toContainText('configuration unchanged')
  await page.getByTestId('adventure-action-repair-readiness').click()
  await page.getByTestId('adventure-action-verify-pod').click()
  await expect(page.getByTestId('mission-status')).toHaveText('Adventure complete')
  await expect(page.getByTestId('navigation-target')).toHaveCount(0)
  await expect(page.locator('.toast')).toHaveCount(0)
  await expect(page.locator('canvas')).toHaveAttribute('data-camera-owner', 'player')
  await page.screenshot({ path: 'assets/previews/vercel-phase4-complete.png' })
  await page.reload()
  await page.getByTestId('play-adventure').click()
  await expect(page.getByTestId('adventure-replay-recover-pod')).toBeVisible()
  assert.deepEqual(errors, [])
  const report = {
    url: origin, date: new Date().toISOString(), phase: 4, target: 'production',
    publicUnauthenticatedAccess: true, missingAssetStatus: missing.status, files,
    browserSmoke: {
      browser: browser.version(), viewport: page.viewportSize(), renderer: 'Real WebGL canvas loaded',
      adventure: 'Recover a Failed Pod / readiness: onboarding, Watch Flow, Guide Me, inspection, ineffective restart, repair, verified completion',
      persistence: 'Completed adventure retained after reload', pageAndConsoleErrors: errors,
      screenshots: ['assets/previews/vercel-phase4-watch-flow.png', 'assets/previews/vercel-phase4-complete.png'],
    },
  }
  writeFileSync('assets/vercel-deployment.json', `${JSON.stringify(report, null, 2)}\n`)
  console.log(`Verified ${files.length} public file hashes, missing-model 404, Watch Flow, Guide Me, recovery and saved completion at ${origin}.`)
} finally {
  await browser.close()
}
