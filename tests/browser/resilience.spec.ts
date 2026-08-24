// These cases intentionally cause resource/context errors; normal journeys use the strict fixture.
import { test, expect } from '@playwright/test'

async function beginPod(page: import('@playwright/test').Page) {
  await page.getByTestId('play-adventure').click()
  await page.getByTestId('adventure-variant-recover-pod').selectOption('readiness')
  await page.getByTestId('adventure-start-recover-pod').click()
  await expect(page.getByTestId('mission-panel')).toBeVisible()
}

test('corrupt saves remain recoverable and are never silently overwritten', async ({ page }) => {
  const original = '{unfinished notebook'
  await page.addInitScript(value => localStorage.setItem('awushi-adventures-v2', value), original)
  await page.goto('/')
  await expect(page.getByTestId('save-notice')).toContainText('original data has been kept')
  expect(await page.evaluate(() => localStorage.getItem('awushi-adventures-v2'))).toBe(original)
  await beginPod(page)
  await page.getByTestId('adventure-action-inspect-pod').click()
  expect(await page.evaluate(() => localStorage.getItem('awushi-adventures-v2'))).toBe(original)
  await page.getByTestId('close-mission').click()
  const download = page.waitForEvent('download')
  await page.getByTestId('save-export').click()
  expect((await download).suggestedFilename()).toBe('awushi-adventures.json')
  await page.getByTestId('save-reset').click()
  await expect(page.getByTestId('save-notice')).toHaveCount(0)
  const copies = await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('awushi-adventures-v2-recovery-')).map(key => localStorage.getItem(key)))
  expect(copies).toContain(original)
})

test('a missing local model can be retried without losing adventure state', async ({ page }) => {
  await page.route('**/assets/awushi.glb', route => route.abort())
  await page.goto('/')
  await expect(page.getByTestId('scene-error')).toBeVisible()
  await page.getByTestId('dismiss-renderer-notice').click()
  await beginPod(page)
  await page.getByTestId('adventure-action-inspect-pod').click()
  await expect(page.getByTestId('latest-evidence')).toContainText('Readiness')
  await page.getByTestId('close-mission').click()
  await page.unroute('**/assets/awushi.glb')
  await page.getByTestId('retry-scene').click()
  await expect(page.getByTestId('scene-error')).toHaveCount(0)
  await expect(page.locator('canvas')).toHaveAttribute('data-camera-mode', 'third-person')
  await page.getByTestId('open-mission').click()
  await expect(page.getByTestId('latest-evidence')).toContainText('Readiness')
})

test('real WebGL context loss pauses the adventure and retains the notebook', async ({ page }) => {
  await page.goto('/'); await beginPod(page)
  await page.getByTestId('adventure-action-inspect-pod').click()
  await expect(page.locator('canvas')).toHaveAttribute('data-camera-mode', 'third-person')
  const supported = await page.evaluate(() => {
    const gl = document.querySelector('canvas')?.getContext('webgl2')
    const extension = gl?.getExtension('WEBGL_lose_context')
    if (!extension) return false
    extension.loseContext(); return true
  })
  test.skip(!supported, 'This browser does not expose the WebGL context-loss test extension.')
  await expect(page.getByTestId('renderer-notice')).toBeVisible()
  await expect(page.getByTestId('mission-status')).toContainText('Paused')
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('awushi-adventures-v2')!))
  expect(saved.active.commands.some((entry: { command: { actionId: string } }) => entry.command.actionId === 'inspect-pod')).toBeTruthy()
  await page.reload()
  await page.getByTestId('resume-adventure-welcome').click()
  await expect(page.getByTestId('latest-evidence')).toContainText('Readiness')
  await expect(page.locator('canvas')).toHaveAttribute('data-character-visible', 'true')
})
