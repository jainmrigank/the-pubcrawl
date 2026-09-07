import { defineConfig } from '@playwright/test';

// Keep physical QA on 4175 while an independent memory-backed test server runs.
const testPort = Number(process.env.PUBCRAWL_E2E_PORT || 4175);
if (!Number.isInteger(testPort) || testPort < 1024 || testPort > 65535) throw new Error('Invalid E2E port');

export default defineConfig({
  testDir: './e2e',
  // The physical-phone scenarios require the dedicated WebKit device
  // profile (touch/coarse pointer and iPhone viewport). Running them in the
  // generic desktop Chromium project would intentionally select the desktop
  // shell at the landscape width and produce a false failure.
  testIgnore: ['**/physical-iphone.spec.ts'],
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL: `http://127.0.0.1:${testPort}`,
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
      ? `VITE_API_BASE= PUBCRAWL_STORE_MODE=memory npm run preview -- --host 127.0.0.1 --port ${testPort} --strictPort`
      : `VITE_API_BASE= PUBCRAWL_STORE_MODE=memory npm run dev -- --host 127.0.0.1 --port ${testPort} --strictPort`,
    url: `http://127.0.0.1:${testPort}`,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
