import { test, expect, type Page } from './fixtures'
import { mkdirSync } from 'node:fs'
import { WORLD_LAYOUT, DISTRICTS, type Point3 } from '../../src/worldConfig'

async function position(page: Page): Promise<Point3> { return (await page.getByTestId('world-position').getAttribute('data-position'))!.split(',').map(Number) as Point3 }
async function heading(page: Page) { return Number(await page.locator('canvas').getAttribute('data-view-yaw')) }
const angle = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from))
async function walkTo(page: Page, target: Point3) {
  for (let i = 0; i < 90; i++) {
    const p = await position(page), dx = target[0] - p[0], dz = target[2] - p[2], distance = Math.hypot(dx, dz)
    if (distance < .38) return
    const desired = Math.atan2(dx, dz), difference = angle(await heading(page), desired)
    if (Math.abs(difference) > .065) {
      const key = difference > 0 ? 'a' : 'd'
      await page.keyboard.down(key); await page.waitForTimeout(Math.max(25, Math.min(600, Math.abs(difference) / 1.8 * 1000)))
      await page.keyboard.up(key); await page.waitForTimeout(250)
      continue
    }
    await page.keyboard.down('Shift'); await page.keyboard.down('w')
    await page.waitForTimeout(Math.min(300, distance / 4.8 * 850))
    await page.keyboard.up('w'); await page.keyboard.up('Shift'); await page.waitForTimeout(220)
  }
  throw new Error(`Immersive movement did not reach ${target}; at ${await position(page)}`)
}

test('third-person framing, turning, first-person look, projection switching and persistence', async ({ page }, info) => {
  await page.goto('/'); await page.getByTestId('free-explore').click()
  const canvas = page.locator('canvas')
  await expect(canvas).toHaveAttribute('data-camera-mode', 'third-person')
  await expect(canvas).toHaveAttribute('data-camera-projection', 'perspective')
  await page.waitForTimeout(1000)
  const initial = await position(page), yaw = await heading(page)
  const camera = (await canvas.getAttribute('data-camera-position'))!.split(',').map(Number)
  const behind = (camera[0] - initial[0]) * Math.sin(yaw) + (camera[2] - initial[2]) * Math.cos(yaw)
  expect(behind).toBeLessThan(-4)
  expect(camera[1] - initial[1]).toBeGreaterThan(2)
  expect(camera[1] - initial[1]).toBeLessThan(4)
  await page.keyboard.down('w'); await page.waitForTimeout(600); await page.keyboard.up('w')
  await page.waitForTimeout(350)
  expect(Math.hypot((await position(page))[0] - initial[0], (await position(page))[2] - initial[2])).toBeGreaterThan(1)
  await page.keyboard.down('d'); await page.waitForTimeout(500); await page.keyboard.up('d'); await page.waitForTimeout(300)
  expect(angle(yaw, await heading(page))).toBeLessThan(-.5)
  mkdirSync('assets/previews', { recursive: true })
  await page.screenshot({ path: `assets/previews/phase3-third-person-${info.project.name}.png` })
  await page.getByTestId('camera-first-person').click(); await page.waitForTimeout(1000)
  await expect(canvas).toHaveAttribute('data-character-visible', 'false')
  const p = await position(page), eye = (await canvas.getAttribute('data-camera-position'))!.split(',').map(Number)
  expect(eye[0]).toBeCloseTo(p[0], 2); expect(eye[2]).toBeCloseTo(p[2], 2); expect(eye[1] - p[1]).toBeCloseTo(1.218, 2)
  const box = (await canvas.boundingBox())!, beforeLook = await heading(page)
  // Canvas drag is shared by desktop pointer and touch PointerEvents.
  const x = box.x + box.width * .5, y = box.y + box.height * .45
  if (info.project.name === 'mobile') {
    const touch = await page.context().newCDPSession(page)
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
    for (let step = 1; step <= 8; step++) await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + step * 10, y: y + step * 3 }] })
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await touch.detach()
  } else {
    await page.mouse.move(x, y); await page.mouse.down()
    await page.mouse.move(x + 80, y + 25, { steps: 8 }); await page.mouse.up()
  }
  await page.waitForTimeout(350)
  expect(Math.abs(angle(beforeLook, await heading(page)))).toBeGreaterThan(.25)
  await page.screenshot({ path: `assets/previews/phase3-first-person-${info.project.name}.png` })
  await page.keyboard.press('c'); await expect(canvas).toHaveAttribute('data-camera-mode', 'overview')
  await expect(canvas).toHaveAttribute('data-camera-projection', 'orthographic')
  await page.getByTestId('camera-isometric').click(); await expect(canvas).toHaveAttribute('data-camera-mode', 'isometric')
  await page.reload(); await page.getByTestId('free-explore').click()
  await expect(page.getByTestId('camera-isometric')).toHaveAttribute('aria-pressed', 'true')
  await page.getByTestId('camera-third-person').click(); await page.waitForTimeout(1000)
  await expect(canvas).toHaveAttribute('data-character-visible', 'true')
})

test('immersive camera and steering cross a real bridge and interact at the workshop', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'Keyboard route is shared; mobile framing/look is covered above.')
  test.setTimeout(150_000)
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
  await page.goto('/'); await page.getByTestId('free-explore').click()
  await expect(page.locator('canvas')).toHaveAttribute('data-camera-mode', 'third-person')
  await page.waitForTimeout(1000)
  await walkTo(page, [0, 0, 0])
  const bridge = WORLD_LAYOUT.bridges.find(item => item.fromId === 'hub' && item.toId === 'development')!
  for (const point of bridge.points.filter((_, index) => index % 4 === 0)) await walkTo(page, point)
  await walkTo(page, DISTRICTS[0].center)
  await expect(page.getByTestId('district-name')).toHaveText('Maker Village')
  await page.screenshot({ path: 'assets/previews/phase3-bridge-arrival.png' })
  // First-person can use the same proximity system without a visible hero mesh.
  await page.getByTestId('camera-first-person').click()
  const station = WORLD_LAYOUT.stations.find(item => item.id === 'github')!
  const center = DISTRICTS[0].center, dx = center[0] - station.position[0], dz = center[2] - station.position[2], n = Math.hypot(dx, dz)
  await walkTo(page, [station.position[0] + dx / n * (station.radius + .8), station.position[1], station.position[2] + dz / n * (station.radius + .8)])
  await expect(page.getByTestId('nearby-interaction')).toContainText(station.name)
  await page.keyboard.press('e'); await expect(page.getByTestId('discovery-panel')).toBeVisible()
  await expect(page.getByTestId('discovery-panel')).toContainText('GitHub')
  expect(errors).toEqual([])
})
