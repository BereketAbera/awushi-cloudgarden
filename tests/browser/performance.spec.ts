import { test, expect } from './fixtures'
import { writeFileSync } from 'node:fs'

test('measures active third-person delivery with the real renderer', async ({ page }, info) => {
  test.setTimeout(70_000)
  await page.goto('/'); await page.getByTestId('play-adventure').click()
  await expect(page.locator('canvas')).toHaveAttribute('data-camera-mode', 'third-person')
  // The phone HUD deliberately keeps only the lab opener visible.
  if (info.project.name === 'mobile') {
    await page.getByTestId('open-simulation').click()
    await page.getByTestId('simulation-start').click()
    await page.getByTestId('close-dialog').click()
  } else await page.getByTestId('simulation-quick-start').click()
  const samples: { fps: number; drawCalls: number; triangles: number }[] = []
  const collect = async (count: number) => {
    for (let index = 0; index < count; index++) {
      await page.waitForTimeout(1000)
      const readout = page.getByTestId('world-position')
      samples.push({ fps: Number(await readout.getAttribute('data-fps')), drawCalls: Number(await readout.getAttribute('data-draw-calls')), triangles: Number(await readout.getAttribute('data-triangles')) })
    }
  }
  await collect(10)
  await page.getByTestId('open-simulation').click()
  await expect(page.getByTestId('simulation-approve')).toBeVisible()
  await page.getByTestId('simulation-approve').click(); await page.getByTestId('close-dialog').click()
  await collect(18)
  expect(samples.filter(sample => sample.fps > 0).length).toBeGreaterThan(25)
  const rates = samples.map(sample => sample.fps)
  const report = { date: '2026-11-06', project: info.project.name, browser: 'Installed Chrome, headless WebGL', mode: 'third-person', quality: 'balanced', scenario: 'Active healthy deployment, 10 seconds before approval and 18 seconds after approval', viewport: page.viewportSize(), samples, meanFps: rates.reduce((a, b) => a + b, 0) / rates.length, minimumFps: Math.min(...rates), maximumFps: Math.max(...rates), note: 'Phone profile is desktop browser emulation; no physical-mobile or universal frame-rate claim.' }
  writeFileSync(`assets/phase2-performance-${info.project.name}.json`, `${JSON.stringify(report, null, 2)}\n`)
})
