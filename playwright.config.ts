import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4175',
    colorScheme: 'dark',
    serviceWorkers: 'allow',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    // E2E must never hydrate the real Upstash store. Preview and development
    // both use the same in-process store; production deployment is exercised
    // separately against the Worker after the physical-device gate.
    command: process.env.PUBCRAWL_E2E_MODE === 'preview'
      ? 'VITE_API_BASE= PUBCRAWL_STORE_MODE=memory npm run preview -- --host 127.0.0.1 --port 4175'
      : 'VITE_API_BASE= PUBCRAWL_STORE_MODE=memory npm run dev -- --host 127.0.0.1 --port 4175',
    url: 'http://127.0.0.1:4175',
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
