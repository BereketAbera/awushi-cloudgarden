import { test, expect, type Page } from './fixtures'
import { mkdirSync, writeFileSync } from 'node:fs'
import { DISTRICTS, STATIONS, WORLD_LAYOUT, type Point3 } from '../../src/worldConfig'
import { FOLLOW_AZIMUTH } from '../../src/game/camera'

const previews = 'assets/previews'
async function position(page: Page): Promise<Point3> {
  return (await page.getByTestId('world-position').getAttribute('data-position'))!.split(',').map(Number) as Point3
}
async function walkTo(page: Page, target: Point3) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const p = await position(page), dx = target[0] - p[0], dz = target[2] - p[2]
    const distance = Math.hypot(dx, dz)
    if (distance < .4) return
    const sx = dx * Math.cos(FOLLOW_AZIMUTH) - dz * Math.sin(FOLLOW_AZIMUTH)
    const sz = dx * Math.sin(FOLLOW_AZIMUTH) + dz * Math.cos(FOLLOW_AZIMUTH)
    const keys: string[] = ['Shift']
    if (Math.abs(sx) > distance * .32) keys.push(sx > 0 ? 'd' : 'a')
    if (Math.abs(sz) > distance * .32) keys.push(sz > 0 ? 's' : 'w')
    for (const key of keys) await page.keyboard.down(key)
    await page.waitForTimeout(Math.min(180, Math.max(65, distance / 4.8 * 650)))
    for (const key of keys) await page.keyboard.up(key)
    await page.waitForTimeout(210)
  }
  throw new Error(`Could not reach ${target}; position ${await position(page)}`)
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('play-adventure')).toBeVisible()
  await expect(page.locator('canvas')).toBeVisible()
})

test('welcome, architecture map, camera modes, settings, focus and recovery', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.getByTestId('view-architecture').click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByRole('dialog')).toContainText(/simulated/i)
  await page.keyboard.press('Tab')
  expect(await page.getByRole('dialog').evaluate(node => node.contains(document.activeElement))).toBeTruthy()
  await page.getByTestId('close-dialog').click()
  await expect(page.getByTestId('view-architecture')).toBeFocused()
  await page.getByTestId('play-adventure').click()
  await expect(page.getByTestId('district-name')).toHaveText('The Common')
  await expect(page.getByTestId('camera-third-person')).toHaveAttribute('aria-pressed', 'true')
  for (const mode of ['first-person', 'overview', 'isometric', 'third-person']) {
    await page.getByTestId(`camera-${mode}`).click()
    await expect(page.getByTestId(`camera-${mode}`)).toHaveAttribute('aria-pressed', 'true')
  }
  await page.getByRole('button', { name: 'Open settings', exact: true }).click()
  await page.getByTestId('quality-select').selectOption('low')
  await page.getByTestId('reduced-motion').check()
  await expect(page.getByTestId('performance-stats')).toContainText('FPS')
  await page.getByTestId('close-dialog').click()
  await expect(page.getByRole('button', { name: 'Open settings', exact: true })).toBeFocused()
  await page.getByTestId('return-to-hub').click()
  await expect(page.getByTestId('world-position')).toHaveAttribute('data-position', '0,0,1.5')
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
  expect(overflow).toBeFalsy()
  mkdirSync(previews, { recursive: true })
  await page.screenshot({ path: `${previews}/phase2-world-${info.project.name}.png` })
  expect(errors).toEqual([])
})

test('studio blends every expression while locomotion remains selected', async ({ page }, info) => {
  await page.getByTestId('enter-studio').click()
  const openControls = page.getByRole('button', { name: /CHARACTER CONTROLS/i })
  if (await openControls.isVisible() && await openControls.getAttribute('aria-expanded') === 'false') await openControls.click()
  await page.getByTestId('animation-walk').click()
  for (const name of ['neutral', 'happy', 'curious', 'thinking', 'excited', 'worried', 'surprised', 'determined', 'celebrating', 'sleepy']) {
    await page.getByTestId(`expression-${name}`).click()
    await expect(page.getByTestId(`expression-${name}`)).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('animation-walk')).toHaveAttribute('aria-pressed', 'true')
  }
  await page.getByTestId('expression-happy').click()
  await page.getByTestId('expression-intensity').fill('0.5')
  await expect(page.getByTestId('expression-intensity')).toHaveValue('0.5')
  await page.getByRole('button', { name: 'Front', exact: true }).click()
  await page.getByRole('button', { name: 'Pause animation', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Play animation', exact: true })).toBeVisible()
  await page.screenshot({ path: `${previews}/phase2-studio-${info.project.name}.png` })
})

test('optional isometric camera tracks actual keyboard movement with stable orientation', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'Camera movement is shared across input types.')
  await page.getByTestId('play-adventure').click()
  await page.getByTestId('camera-isometric').click()
  const canvas = page.locator('canvas')
  await expect(canvas).toHaveAttribute('data-camera-mode', 'isometric')
  await page.waitForTimeout(900)
  const before = (await canvas.getAttribute('data-camera-position'))!.split(',').map(Number)
  await page.keyboard.down('d'); await page.waitForTimeout(750); await page.keyboard.up('d')
  await page.waitForTimeout(600)
  const current = await position(page)
  const target = (await canvas.getAttribute('data-camera-target'))!.split(',').map(Number)
  const after = (await canvas.getAttribute('data-camera-position'))!.split(',').map(Number)
  expect(Math.hypot(after[0] - before[0], after[2] - before[2])).toBeGreaterThan(.7)
  expect(Math.hypot(target[0] - current[0], target[2] - current[2])).toBeLessThan(.08)
  expect(after[0] - target[0]).toBeCloseTo(14, 2)
  expect(after[1] - target[1]).toBeCloseTo(13, 2)
  expect(after[2] - target[2]).toBeCloseTo(18, 2)
  await page.getByTestId('camera-third-person').click()
  await expect(canvas).toHaveAttribute('data-camera-mode', 'third-person')
  await page.getByTestId('camera-overview').click()
  await expect(canvas).toHaveAttribute('data-camera-mode', 'overview')
  await page.getByTestId('camera-isometric').click()
  await page.waitForTimeout(1000)
  const restored = (await canvas.getAttribute('data-camera-target'))!.split(',').map(Number)
  expect(Math.hypot(restored[0] - current[0], restored[2] - current[2])).toBeLessThan(.08)
})

test('all six introductions are reachable through real keyboard movement and persist', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'Long route traversal runs on desktop; mobile controls and layout have separate coverage.')
  test.setTimeout(300_000)
  await page.getByTestId('play-adventure').click()
  await page.getByTestId('camera-isometric').click()
  await page.getByRole('button', { name: 'Open settings', exact: true }).click()
  await page.getByTestId('quality-select').selectOption('low')
  await page.getByTestId('close-dialog').click()
  for (const district of DISTRICTS) {
    await page.getByTestId('return-to-hub').click()
    await expect(page.getByTestId('world-position')).toHaveAttribute('data-position', '0,0,1.5')
    await walkTo(page, [0, 0, 0])
    const bridge = WORLD_LAYOUT.bridges.find(item => item.fromId === 'hub' && item.toId === district.id)!
    for (const point of bridge.points.filter((_, index) => index % 3 === 0)) await walkTo(page, point)
    await walkTo(page, district.center)
    const station = STATIONS.find(item => item.id === district.introStation)!
    const dx = district.center[0] - station.position[0], dz = district.center[2] - station.position[2], n = Math.hypot(dx, dz)
    await walkTo(page, [station.position[0] + dx / n * (station.radius + .85), station.position[1], station.position[2] + dz / n * (station.radius + .85)])
    await expect(page.getByTestId('nearby-interaction')).toContainText(station.name)
    await page.keyboard.press('e')
    await expect(page.getByTestId('discovery-panel')).toBeVisible()
    await expect(page.getByTestId('discovery-panel')).toContainText(station.name)
    await page.keyboard.press('e') // Held/repeated interaction cannot create another panel.
    await expect(page.getByRole('dialog')).toHaveCount(1)
    if (district.id === 'development') await page.screenshot({ path: `${previews}/phase2-discovery-desktop.png` })
    await page.getByTestId('close-dialog').click()
  }
  await expect(page.getByTestId('exploration-progress')).toContainText('6 / 17')
  await page.reload()
  await page.getByTestId('free-explore').click()
  await expect(page.getByTestId('exploration-progress')).toContainText('6 / 17')
  await page.getByRole('button', { name: 'Open settings', exact: true }).click()
  await page.getByTestId('reset-progress').click()
  await expect(page.getByTestId('exploration-progress')).toContainText('0 / 17')
})

test('measures rendered frame rate and captures the full overview', async ({ page }, info) => {
  test.setTimeout(75_000)
  await page.getByTestId('free-explore').click()
  await page.getByTestId('camera-overview').click()
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${previews}/phase2-overview-${info.project.name}.png` })
  await page.getByRole('button', { name: 'Open settings', exact: true }).click()
  const samples: number[] = []
  for (let i = 0; i < 15; i++) {
    await page.waitForTimeout(1000)
    const text = await page.getByTestId('performance-stats').innerText()
    const fps = Number(text.match(/(\d+) FPS/)?.[1])
    if (fps > 0) samples.push(fps)
  }
  expect(samples.length).toBeGreaterThan(10)
  const report = { browser: 'installed Chrome, headless WebGL', project: info.project.name, viewport: page.viewportSize(), quality: 'balanced', view: 'overview', samples, mean: samples.reduce((a, b) => a + b, 0) / samples.length, minimum: Math.min(...samples), maximum: Math.max(...samples), note: 'Observed local test environment; not a universal frame-rate guarantee.' }
  writeFileSync(`assets/phase2-idle-performance-${info.project.name}.json`, `${JSON.stringify(report, null, 2)}\n`)
  await info.attach('performance', { body: JSON.stringify(report), contentType: 'application/json' })
})
