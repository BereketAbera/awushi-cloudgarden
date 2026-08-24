import { test, expect } from './fixtures'
import { writeFileSync } from 'node:fs'

test('measures active third-person adventure delivery with the real renderer', async ({ page }, info) => {
  test.setTimeout(70_000)
  await page.goto('/'); await page.getByTestId('play-adventure').click()
  await page.getByTestId('adventure-start-promote-production').click()
  await page.getByTestId('adventure-action-push').click()
  await page.getByTestId('close-mission').click()
  await expect(page.locator('canvas')).toHaveAttribute('data-camera-mode', 'third-person')
  const samples: { fps: number; drawCalls: number; triangles: number; geometries: number; textures: number }[] = []
  const collect = async (count: number) => {
    for (let index = 0; index < count; index++) {
      await page.waitForTimeout(1000)
      const readout = page.getByTestId('world-position')
      samples.push({ fps: Number(await readout.getAttribute('data-fps')), drawCalls: Number(await readout.getAttribute('data-draw-calls')), triangles: Number(await readout.getAttribute('data-triangles')), geometries: Number(await readout.getAttribute('data-geometries')), textures: Number(await readout.getAttribute('data-textures')) })
    }
  }
  await collect(10)
  await page.getByTestId('open-mission').click()
  await page.getByTestId('adventure-action-inspect-ci').click()
  await page.getByTestId('adventure-action-inspect-image').click()
  await page.getByTestId('adventure-action-approve-release').click()
  await expect(page.getByTestId('mission-feedback')).toContainText('Approved the reviewed development digest')
  await page.getByTestId('close-mission').click()
  await collect(18)
  expect(samples.filter(sample => sample.fps > 0).length).toBeGreaterThan(25)
  expect(Math.min(...samples.map(sample => sample.drawCalls))).toBeGreaterThan(20)
  expect(Math.min(...samples.map(sample => sample.triangles))).toBeGreaterThan(100_000)
  const rates = samples.map(sample => sample.fps)
  const report = { date: '2026-11-06', project: info.project.name, browser: 'Installed Chrome, headless WebGL', mode: 'third-person', quality: 'balanced', scenario: 'Active promotion adventure, development delivery: 10 seconds before approval and 18 seconds after approval', viewport: page.viewportSize(), samples, meanFps: rates.reduce((a, b) => a + b, 0) / rates.length, minimumFps: Math.min(...rates), maximumFps: Math.max(...rates), note: 'Phone profile is desktop browser emulation; no physical-mobile or universal frame-rate claim.' }
  writeFileSync(`assets/phase3-performance-${info.project.name}.json`, `${JSON.stringify(report, null, 2)}\n`)
})

test('renderer resources remain bounded when switching repeatedly between studio and world', async ({ page }, info) => {
  await page.goto('/'); await page.getByTestId('free-explore').click()
  await page.getByTestId('camera-overview').click()
  await expect(page.locator('canvas')).toHaveAttribute('data-camera-mode', 'overview')
  // Warm all visible district geometry before comparing repeated mode transitions.
  await page.waitForTimeout(1500)
  const resources: { geometries: number; textures: number }[] = []
  for (let cycle = 0; cycle < 5; cycle++) {
    await page.getByTestId('enter-studio').click()
    await expect(page.locator('canvas')).toHaveAttribute('data-camera-mode', 'three-quarter')
    await page.getByRole('button', { name: 'Awushi home', exact: true }).click()
    await page.getByTestId('free-explore').click()
    const counters = page.getByTestId('world-position')
    await expect.poll(async () => Number(await counters.getAttribute('data-triangles'))).toBeGreaterThan(100_000)
    // Allow the completed frame and deferred GPU disposal to reach the 5 Hz readout.
    await page.waitForTimeout(500)
    resources.push({ geometries: Number(await counters.getAttribute('data-geometries')), textures: Number(await counters.getAttribute('data-textures')) })
  }
  expect(resources[0].geometries).toBeGreaterThan(0)
  expect(Math.max(...resources.map(item => item.geometries)) - Math.min(...resources.map(item => item.geometries))).toBeLessThanOrEqual(2)
  expect(Math.max(...resources.map(item => item.textures)) - Math.min(...resources.map(item => item.textures))).toBeLessThanOrEqual(2)
  writeFileSync(`assets/phase3-resources-${info.project.name}.json`, `${JSON.stringify({ resources, note: 'Renderer resource counts after five real studio/world transitions; not a byte-accurate GPU-memory or long-duration soak measurement.' }, null, 2)}\n`)
})
