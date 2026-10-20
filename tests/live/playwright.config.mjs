import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.mjs',
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 25_000 },
  reporter: [['list']],
  use: {
    browserName: 'chromium',
    viewport: { width: 1280, height: 900 },
    acceptDownloads: true,
    screenshot: 'off',
    video: 'off',
    trace: 'off',
    serviceWorkers: 'block',
    actionTimeout: 25_000,
    navigationTimeout: 45_000
  }
});
