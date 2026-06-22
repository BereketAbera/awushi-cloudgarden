import { defineConfig, devices } from '@playwright/test'
export default defineConfig({
  testDir: './tests/browser', fullyParallel: false, workers: 1, timeout: 60_000,
  expect: { timeout: 15_000 }, retries: 0, reporter: [['list'], ['json', { outputFile: 'test-results/browser-results.json' }]],
  use: { baseURL: 'http://127.0.0.1:5176', channel: 'chrome', trace: 'retain-on-failure', screenshot: 'only-on-failure', launchOptions: { args: ['--enable-webgl', '--ignore-gpu-blocklist'] } },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } }, { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium', browserName: 'chromium', channel: 'chrome' } }],
  webServer: { command: 'npm run preview -- --port 5176', url: 'http://127.0.0.1:5176', reuseExistingServer: false, timeout: 30_000 },
})
