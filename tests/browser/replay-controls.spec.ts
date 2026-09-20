import { test, expect, type Page } from './fixtures'
import { createAdventureRecord, recordSession, type AdventureRecord } from '../../src/adventures/replay'
import { reduceAdventure, tickAdventure } from '../../src/adventures/engine'
import { emptyAdventureSave, parseAdventureSave, serializeAdventureSave, type AdventureSave } from '../../src/adventures/persistence'
import type { AdventureSession } from '../../src/adventures/domain'

function appendAction(record: AdventureRecord, session: AdventureSession, actionId: string, at: number) {
  const command = { type: 'action' as const, actionId }
  const next = reduceAdventure(tickAdventure(session, at), command, at)
  return { session: next, record: recordSession({ ...record, commands: [...record.commands, { at, command }] }, next) }
}

/** Real engine-produced journals: a finished Pod lesson and a different, unfinished release. */
function replaySave(): AdventureSave {
  let pod = createAdventureRecord('adventure-2', 'recover-pod', 'readiness')
  pod = appendAction(pod.record, pod.session, 'inspect-pod', 1000)
  pod = appendAction(pod.record, pod.session, 'repair-readiness', 60000)
  pod = appendAction(pod.record, pod.session, 'verify-pod', 120000)
  let release = createAdventureRecord('adventure-1', 'ship-release')
  release = appendAction(release.record, release.session, 'push', 0)
  release.session = tickAdventure(release.session, 500)
  release.record = recordSession(release.record, release.session)
  const save: AdventureSave = { ...emptyAdventureSave(), sequence: 2, selectedId: 'ship-release', active: release.record, completed: [pod.record] }
  const loaded = parseAdventureSave(serializeAdventureSave(save))
  expect(loaded.notice).toBeNull()
  expect(loaded.writesBlocked).toBe(false)
  return loaded.save
}

async function notebook(page: Page): Promise<AdventureSave> {
  return page.evaluate(() => JSON.parse(localStorage.getItem('awushi-adventures-v2') ?? 'null'))
}
async function skipIntroduction(page: Page) {
  const skip = page.getByTestId('onboarding-skip')
  if (await skip.isVisible()) await skip.click()
}
async function openOptions(page: Page) {
  const options = page.locator('.flow-options')
  if (await options.getAttribute('open') === null) await options.locator('summary').click()
}
async function field(page: Page, label: string, value: string) {
  await expect(page.getByTestId('station-state').locator('div').filter({ has: page.locator('dt', { hasText: new RegExp(`^${label}$`) }) }).locator('dd')).toHaveText(value)
}

test('Watch Flow controls a recorded journey without resuming a different unfinished adventure', async ({ page }) => {
  const save = replaySave()
  await page.addInitScript(value => {
    localStorage.setItem('awushi-adventures-v2', value)
    localStorage.setItem('awushi-guidance-v1', JSON.stringify({ version: 1, mode: 'guided', automaticCamera: true, onboardingComplete: true }))
  }, serializeAdventureSave(save))
  await page.goto('/')
  await page.getByTestId('play-adventure').click()
  await page.getByTestId('adventure-replay-recover-pod').click()
  await expect(page.getByTestId('replay-controls')).toBeVisible()
  await page.getByTestId('replay-toggle').click()
  await expect(page.getByTestId('replay-toggle')).toHaveText('Play')
  const progress = page.getByRole('progressbar', { name: 'Replay progress', exact: true })
  const initial = Number(await progress.getAttribute('value'))
  await page.getByTestId('close-mission').click()
  await page.getByTestId('watch-flow-start').click()
  await expect(page.getByTestId('watch-flow')).toContainText('RECORDED JOURNEY')
  await expect(page.getByTestId('flow-pause')).toHaveText('Resume')
  await openOptions(page)
  await expect(page.getByTestId('flow-mode')).toBeDisabled()
  await expect(page.getByTestId('flow-next')).toBeDisabled()
  await page.getByTestId('flow-speed').selectOption('2')
  await page.locator('.flow-options summary').click()
  await page.getByTestId('flow-pause').click()
  await expect(page.getByTestId('flow-pause')).toHaveText('Pause')
  await page.waitForTimeout(450) // Measure the recorded clock; do not drive infrastructure with test time.
  await page.getByTestId('flow-pause').click()
  await expect(page.getByTestId('flow-pause')).toHaveText('Resume')
  await expect(page.getByTestId('watch-flow')).toContainText('RECORDED JOURNEY')
  await page.getByTestId('flow-exit').click()
  await page.getByTestId('open-mission').click()
  await expect(page.getByTestId('replay-controls')).toBeVisible()
  await expect(page.getByTestId('replay-speed')).toHaveValue('2')
  await expect(page.getByTestId('replay-toggle')).toHaveText('Play')
  const pausedAt = Number(await progress.getAttribute('value'))
  expect(pausedAt).toBeGreaterThan(initial)
  await page.waitForTimeout(350)
  expect(Number(await progress.getAttribute('value'))).toBe(pausedAt)
  expect((await notebook(page)).active).toEqual(save.active)
  expect((await notebook(page)).completed).toEqual(save.completed)

  // Historical review is nested inside the same recording, not a route into live execution.
  await page.getByTestId('close-mission').click()
  await page.getByTestId('watch-flow-start').click()
  await page.getByTestId('flow-replay').click()
  await expect(page.getByTestId('watch-flow')).toContainText('RECORDED STAGE')
  await expect(page.getByTestId('flow-live')).toHaveText('Return to journey')
  await page.getByTestId('flow-live').click()
  await expect(page.getByTestId('watch-flow')).toContainText('RECORDED JOURNEY')
  await expect(page.getByTestId('flow-pause')).toHaveText('Resume')
  expect((await notebook(page)).active).toEqual(save.active)
  expect((await notebook(page)).completed).toEqual(save.completed)
})

test('architecture focus leaves historical stage review and inspects current infrastructure', async ({ page }) => {
  await page.goto('/')
  await skipIntroduction(page)
  await page.getByTestId('play-adventure').click()
  await page.getByTestId('adventure-variant-recover-pod').selectOption('readiness')
  await page.getByTestId('adventure-start-recover-pod').click()
  for (const action of ['inspect-pod', 'repair-readiness', 'verify-pod']) await page.getByTestId(`adventure-action-${action}`).click()
  await expect(page.getByTestId('mission-status')).toHaveText('Adventure complete')
  const saved = await notebook(page)
  await page.getByTestId('close-mission').click()
  await page.getByTestId('watch-flow-start').click()
  await page.getByTestId('flow-replay').click()
  await page.getByTestId('flow-previous').click()
  await expect(page.getByTestId('watch-flow')).toContainText('RECORDED STAGE')
  await expect(page.getByTestId('flow-previous')).toBeDisabled()
  // The first recorded Pod event was unhealthy. Architecture must still inspect current state.
  await page.getByRole('button', { name: 'View Architecture', exact: true }).click()
  await page.getByTestId('architecture-technology-kubernetes').click()
  await field(page, 'Health', 'Healthy')
  await field(page, 'Available replicas', '2')
  await field(page, 'Fault corrected', 'true')
  await page.getByTestId('focus-technology').click()
  await expect(page.getByTestId('watch-flow')).toHaveCount(0)
  await expect(page.getByTestId('guide-focus')).toBeVisible()
  await expect(page.locator('canvas')).toHaveAttribute('data-camera-station', 'kubernetes')
  await page.getByTestId('guide-inspect').click()
  await field(page, 'Health', 'Healthy')
  await field(page, 'Fault corrected', 'true')
  await page.getByTestId('close-dialog').click()
  await page.getByTestId('guide-focus').getByRole('button', { name: 'Return to Awushi', exact: true }).click()
  await page.getByTestId('watch-flow-start').click()
  await expect(page.getByTestId('watch-flow')).not.toContainText('RECORDED STAGE')
  await expect(page.getByTestId('flow-live')).toHaveCount(0)
  expect((await notebook(page)).active).toEqual(saved.active)
  expect((await notebook(page)).completed).toEqual(saved.completed)
})

test('Space toggles playback details without being consumed by world keyboard shortcuts', async ({ page }) => {
  await page.goto('/')
  await skipIntroduction(page)
  await page.getByTestId('free-explore').click()
  await page.getByTestId('watch-flow-start').click()
  const details = page.locator('.flow-options'), summary = details.locator('summary')
  await summary.press('Space')
  await expect(details).toHaveAttribute('open', '')
  await expect(page.getByTestId('flow-speed')).toBeVisible()
  await summary.press('Space')
  await expect(details).not.toHaveAttribute('open', '')
  await expect(page.getByTestId('flow-speed')).toBeHidden()
})
