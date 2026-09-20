import { test, expect, type Page } from './fixtures'
import { getStation } from '../../src/worldConfig'

async function beginPod(page: Page) {
  await page.goto('/')
  if (await page.getByTestId('onboarding-skip').isVisible()) await page.getByTestId('onboarding-skip').click()
  await page.getByTestId('play-adventure').click()
  await page.getByTestId('adventure-variant-recover-pod').selectOption('readiness')
  await page.getByTestId('adventure-start-recover-pod').click()
}
async function finishPod(page: Page) {
  for (const id of ['inspect-pod', 'repair-readiness', 'verify-pod']) await page.getByTestId(`adventure-action-${id}`).click()
  await expect(page.getByTestId('mission-status')).toHaveText('Adventure complete')
}

test('graph focus keeps its own station context during and after a mission', async ({ page }) => {
  await beginPod(page)
  await page.getByTestId('close-mission').click()
  await page.getByRole('button', { name: 'View Architecture', exact: true }).click()
  await page.getByTestId('architecture-technology-postgresql').click()
  await page.getByTestId('focus-technology').click()
  await expect(page.getByTestId('guide-focus')).toContainText(getStation('database')!.description)
  await expect(page.getByTestId('guide-inspect')).toHaveText('Inspect this station')
  await page.getByTestId('guide-inspect').click()
  await expect(page.getByTestId('discovery-panel')).toContainText(getStation('database')!.name)
  await expect(page.getByTestId('mission-panel')).toHaveCount(0)
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('awushi-adventures-v2')!).active.commands.length)).toBe(0)
  await page.getByTestId('close-dialog').click()
  await page.getByTestId('return-mission').click()
  await finishPod(page)
  await page.getByTestId('close-mission').click()
  await expect(page.getByTestId('guide-me-world')).toHaveCount(0)
  await expect(page.getByTestId('guide-focus')).toContainText(getStation('database')!.description)
  await expect(page.getByTestId('return-architecture')).toBeVisible()
})

for (const ending of ['completed', 'cancelled'] as const) {
  test(`${ending} missions remove inactive guidance instead of offering a no-op`, async ({ page }) => {
    await beginPod(page)
    await page.getByTestId('guide-me').click()
    await expect(page.getByTestId('guide-focus')).toBeVisible()
    await page.getByTestId('guide-inspect').click()
    if (ending === 'completed') await finishPod(page)
    else {
      await page.locator('.attempt-options > summary').click()
      await page.getByTestId('adventure-cancel').click()
      await expect(page.getByTestId('mission-status')).toHaveText('Adventure cancelled')
    }
    await page.getByTestId('close-mission').click()
    await expect(page.getByTestId('guide-me-world')).toHaveCount(0)
    await expect(page.getByTestId('hud-guide-me')).toHaveCount(0)
    await expect(page.getByTestId('guide-focus')).toHaveCount(0)
    await expect(page.getByTestId('navigation-target')).toHaveCount(0)
    await expect(page.locator('.toast')).toHaveCount(0)
    await expect(page.locator('canvas')).toHaveAttribute('data-camera-owner', 'player')
  })
}

test('a guidance storage failure can be dismissed and clears after saving succeeds', async ({ page }) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key === 'awushi-guidance-v1') throw new DOMException('Testing unavailable guidance storage', 'QuotaExceededError')
      return original.call(this, key, value)
    }
    Object.defineProperty(window, 'allowGuidancePersistence', { value: () => { Storage.prototype.setItem = original } })
  })
  await page.goto('/')
  if (await page.getByTestId('onboarding-skip').isVisible()) await page.getByTestId('onboarding-skip').click()
  const notice = page.locator('.preference-save-notice')
  await expect(notice).toContainText('Guidance preferences apply for this visit only')
  await page.getByRole('button', { name: 'Dismiss storage notice', exact: true }).click()
  await expect(notice).toHaveCount(0)
  await page.getByRole('button', { name: 'Open settings', exact: true }).click()
  await page.getByLabel('Guidance preference', { exact: true }).selectOption('commander')
  await expect(notice).toBeVisible()
  await page.evaluate(() => (window as unknown as { allowGuidancePersistence: () => void }).allowGuidancePersistence())
  await page.getByLabel('Guidance preference', { exact: true }).selectOption('engineer')
  await expect(notice).toHaveCount(0)
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('awushi-guidance-v1')!).mode)).toBe('engineer')
})
