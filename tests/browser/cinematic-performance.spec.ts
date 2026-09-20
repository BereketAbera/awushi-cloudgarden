import { writeFileSync } from 'node:fs'
import { test, expect } from './fixtures'

test('measures the actual renderer through a cinematic release and explicit approval', async ({page}, info) => {
  test.setTimeout(110000)
  await page.goto('/'); if (await page.getByTestId('onboarding-skip').isVisible()) await page.getByTestId('onboarding-skip').click()
  await page.getByTestId('free-explore').click();await page.getByTestId('open-simulation').click();await page.getByTestId('simulation-start').click();await page.getByTestId('lab-watch-flow').click()
  await page.locator('.flow-options summary').click();await page.getByTestId('flow-speed').selectOption('2');await page.locator('.flow-options summary').click()
  const samples: {stage:string;fps:number;drawCalls:number;triangles:number;geometries:number;textures:number}[]=[]
  const captured = new Set<string>()
  for(let i=0;i<100;i++) {
    await page.waitForTimeout(500)
    const stage = await page.getByTestId('watch-flow').getAttribute('data-stage') ?? ''
    const readout=page.getByTestId('world-position')
    samples.push({stage,fps:Number(await readout.getAttribute('data-fps')),drawCalls:Number(await readout.getAttribute('data-draw-calls')),triangles:Number(await readout.getAttribute('data-triangles')),geometries:Number(await readout.getAttribute('data-geometries')),textures:Number(await readout.getAttribute('data-textures'))})
    if (['build','sync','rollout','logs'].includes(stage) && !captured.has(stage) && await page.locator('canvas').getAttribute('data-camera-station') === await page.getByTestId('watch-flow').getAttribute('data-station') && await page.locator('canvas').getAttribute('data-camera-settled') === 'true') {
      await page.screenshot({path:`assets/previews/phase4-flow-${stage}-${info.project.name}.png`});captured.add(stage)
    }
    if(stage==='approval') {
      await expect(page.getByTestId('flow-next')).toBeDisabled()
      await page.getByTestId('flow-open-notes').click();await expect(page.getByTestId('deployment-revision')).toHaveText('0');await page.getByTestId('simulation-approve').click();await page.getByTestId('close-dialog').click()
    }
    if(await page.locator('.watch-flow').getAttribute('class').then(v=>v?.includes('status-healthy'))) break
  }
  await expect(page.locator('.watch-flow')).toHaveClass(/status-healthy/)
  expect(new Set(samples.map(s=>s.stage)).size).toBeGreaterThanOrEqual(15)
  expect(samples.length).toBeGreaterThan(25)
  expect(samples.filter(s=>s.fps>0).length).toBeGreaterThan(25)
  const rates=samples.filter(s=>s.fps>0).map(s=>s.fps)
  writeFileSync(`assets/phase4-performance-${info.project.name}.json`,JSON.stringify({date:'2026-11-06',profile:info.project.name,viewport:page.viewportSize(),quality:'balanced',playback:'Watch Flow automatic,2×,explicit human approval',samples,meanFps:rates.reduce((a,b)=>a+b,0)/rates.length,minimumFps:Math.min(...rates),maximumFps:Math.max(...rates),observedStages:[...new Set(samples.map(s=>s.stage))],note:'Local headless desktop Chrome with real WebGL. Phone profile is viewport/touch emulation, not a physical device. Counters include shadow/transmission passes.'},null,2)+'\n')
})
