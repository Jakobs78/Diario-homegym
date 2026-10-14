import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.mjs',
  timeout: 45000,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    viewport: { width: 1280, height: 900 },
    acceptDownloads: true,
    serviceWorkers: 'block'
  },
  webServer: {
    command: 'python3 -m http.server 4173 --bind 127.0.0.1',
    cwd: fileURLToPath(new URL('../../', import.meta.url)),
    url: 'http://127.0.0.1:4173/index.html',
    timeout: 20000,
    reuseExistingServer: false
  }
});
