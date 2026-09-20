import { mkdirSync } from 'node:fs'
import { test, expect, type Page } from './fixtures'
const canvas = (page: Page) => page.locator('canvas')
async function enterLab(page: Page) {
  await page.goto('/')
  if (await page.getByTestId('onboarding-skip').isVisible()) await page.getByTestId('onboarding-skip').click()
  await page.getByTestId('free-explore').click()
  await page.getByTestId('camera-isometric').click()
  await page.getByTestId('open-simulation').click()
  await page.getByTestId('simulation-start').click()
  await page.getByTestId('close-dialog').click()
  await page.getByTestId('watch-flow-start').click()
  await expect(page.getByTestId('watch-flow')).toBeVisible()
}
async function options(page: Page) { const el = page.locator('.flow-options'); if (!(await el.getAttribute('open'))) await el.locator('summary').click() }

test('Watch Flow frames a station, pauses, allows takeover, and returns to the previous camera', async ({page}, info) => {
  await enterLab(page)
  await page.getByTestId('flow-pause').click()
  const station = await page.getByTestId('watch-flow').getAttribute('data-station')
  await expect(canvas(page)).toHaveAttribute('data-camera-station', station!)
  await options(page); await page.getByTestId('flow-skip').click()
  await expect(canvas(page)).toHaveAttribute('data-camera-owner', 'cinematic')
  await expect(page.locator('[data-testid="station-attention"]').first()).toBeVisible()
  const paused = await page.getByTestId('watch-flow').getAttribute('data-stage')
  await page.waitForTimeout(600)
  await expect(page.getByTestId('watch-flow')).toHaveAttribute('data-stage',paused!)
  await page.getByTestId('flow-override').click()
  await expect(canvas(page)).toHaveAttribute('data-camera-owner','overridden')
  const before = await canvas(page).getAttribute('data-camera-position')
  if (info.project.name === 'desktop') {
    const b = (await canvas(page).boundingBox())!
    await page.mouse.move(b.x+b.width*.5,b.y+b.height*.5); await page.mouse.down();await page.mouse.move(b.x+b.width*.65,b.y+b.height*.5,{steps:8});await page.mouse.up()
    await expect.poll(()=>canvas(page).getAttribute('data-camera-position')).not.toBe(before)
  }
  await page.getByTestId('flow-follow').click();await expect(canvas(page)).toHaveAttribute('data-camera-owner','cinematic')
  await page.locator('.flow-options summary').click()
  await expect(canvas(page)).toHaveAttribute('data-camera-settled','true')
  mkdirSync('assets/previews',{recursive:true});await page.screenshot({path:`assets/previews/phase4-cinematic-${info.project.name}.png`})
  await page.getByTestId('flow-exit').click();await expect(canvas(page)).toHaveAttribute('data-camera-mode','isometric')
  await expect(page.getByTestId('camera-isometric')).toHaveAttribute('aria-pressed','true')
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)).toBe(false)
})

test('step playback holds each stage and historical review cannot authorize a release', async ({page}, info) => {
  test.setTimeout(120000)
  await enterLab(page);await options(page);await page.getByTestId('flow-mode').selectOption('step');await page.getByTestId('flow-speed').selectOption('2');await page.locator('.flow-options summary').click()
  let stage = await page.getByTestId('watch-flow').getAttribute('data-stage')
  while (stage !== 'approval') {
    await expect(page.getByTestId('flow-next')).toBeEnabled();await page.getByTestId('flow-next').click()
    await expect.poll(()=>page.getByTestId('watch-flow').getAttribute('data-stage')).not.toBe(stage)
    stage = await page.getByTestId('watch-flow').getAttribute('data-stage')
  }
  await expect(page.getByTestId('flow-next')).toBeDisabled()
  await expect(page.getByTestId('watch-flow')).toContainText('Review needed')
  await page.getByTestId('flow-replay').click()
  await expect(page.getByTestId('watch-flow')).toContainText('RECORDED STAGE')
  await page.getByTestId('flow-previous').click()
  await expect(page.getByTestId('flow-explanation')).toContainText('promotion')
  await page.getByTestId('flow-live').click()
  await expect(page.getByTestId('watch-flow')).toHaveAttribute('data-stage','approval')
  await expect(page.getByTestId('flow-next')).toBeDisabled()
  await page.getByTestId('flow-open-notes').click()
  await expect(page.getByTestId('deployment-revision')).toHaveText('0')
  await expect(page.getByTestId('pipeline-status')).toHaveText('Your approval is needed')
  await page.getByTestId('simulation-approve').click()
  await page.getByTestId('close-dialog').click()
  await expect(page.getByTestId('watch-flow')).toHaveAttribute('data-stage','promote')
  await expect(canvas(page)).toHaveAttribute('data-camera-station','registry');await expect(canvas(page)).toHaveAttribute('data-camera-settled','true')
  await page.screenshot({path:`assets/previews/phase4-approved-${info.project.name}.png`})
})

test('automatic camera opt-out leaves playback usable and Guide Me remains an explicit choice', async ({page}) => {
  await page.goto('/'); if(await page.getByTestId('onboarding-skip').isVisible())await page.getByTestId('onboarding-skip').click()
  await page.getByRole('button',{name:'Open settings'}).click();await page.getByTestId('automatic-camera').uncheck();await page.getByTestId('close-dialog').click()
  await page.getByTestId('play-adventure').click();await page.getByTestId('adventure-start-investigate-incident').click();await page.getByTestId('mission-watch-flow').click()
  await expect(canvas(page)).toHaveAttribute('data-camera-owner','player')
  await options(page);await expect(page.getByTestId('flow-follow')).toBeDisabled()
  await page.getByTestId('flow-exit').click();await page.getByTestId('guide-me-world').click();await expect(canvas(page)).toHaveAttribute('data-camera-station','alerts');await expect(canvas(page)).toHaveAttribute('data-camera-owner','cinematic')
})

test('held movement keys finish the paused camera return without restarting its tween', async ({page}) => {
  await enterLab(page)
  await page.getByTestId('flow-pause').click()
  await options(page); await page.getByTestId('flow-skip').click()
  await expect(canvas(page)).toHaveAttribute('data-camera-owner', 'cinematic')
  await expect(canvas(page)).toHaveAttribute('data-camera-settled', 'true')
  // Leave the keyboard-isolated playback controls and take the world camera.
  await canvas(page).click({ position: { x: 50, y: 50 } })
  await expect(canvas(page)).toBeFocused()
  await expect(canvas(page)).toHaveAttribute('data-camera-owner', 'overridden')
  const revision = Number(await canvas(page).getAttribute('data-camera-revision'))
  await page.keyboard.down('w')
  try {
    await expect(canvas(page)).toHaveAttribute('data-camera-revision', String(revision + 1))
    for (let repeat = 0; repeat < 16; repeat++) {
      await page.waitForTimeout(100)
      await page.keyboard.down('w')
    }
    await expect(canvas(page)).toHaveAttribute('data-camera-revision', String(revision + 1))
    await expect(canvas(page)).toHaveAttribute('data-camera-owner', 'player')
    await expect(canvas(page)).toHaveAttribute('data-camera-mode', 'isometric')
    await expect(page.getByTestId('flow-pause')).toHaveText('Resume')
  } finally {
    await page.keyboard.up('w')
  }
})
