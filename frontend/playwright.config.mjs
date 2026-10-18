import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.BARBEROS_E2E_BASE_URL || 'http://127.0.0.1:4173';
const runLocalServer = !process.env.BARBEROS_E2E_BASE_URL;
const previewCommand = process.env.CI
  ? 'yarn preview --host 127.0.0.1 --port 4173 --strictPort'
  : 'yarn build && yarn preview --host 127.0.0.1 --port 4173 --strictPort';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  outputDir: 'test-results',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    locale: 'pt-PT',
    timezoneId: 'Africa/Maputo',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'] } },
  ],
  ...(runLocalServer ? { webServer: {
    command: previewCommand,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  } } : {}),
});
