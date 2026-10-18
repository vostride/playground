import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './test-results/browser',
  timeout: 45000,
  expect: { timeout: 8000 },
  fullyParallel: true,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.PLAYGROUND_URL || 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...devices['Desktop Chrome'],
    launchOptions: process.env.PLAYWRIGHT_CHROME_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROME_PATH }
      : {},
  },
  webServer: process.env.PLAYGROUND_URL
    ? undefined
    : {
        command: 'node scripts/serve.mjs',
        url: 'http://127.0.0.1:4173',
        reuseExistingServer: !process.env.CI,
      },
});
