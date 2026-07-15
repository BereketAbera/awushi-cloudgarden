import { test as base, expect } from '@playwright/test'
/** Fail the real browser journey if the app or WebGL scene logs an error. */
export const test = base.extend<{ runtimeErrors: void }>({
  runtimeErrors: [async ({ page }, use) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
    await use()
    expect(errors, 'Uncaught browser or renderer errors').toEqual([])
  }, { auto: true }],
})
export { expect }
export type { Page } from '@playwright/test'
