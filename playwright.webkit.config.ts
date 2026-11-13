import { defineConfig, devices } from '@playwright/test';

const testPort = Number(process.env.PUBCRAWL_E2E_PORT || 4175);
if (!Number.isInteger(testPort) || testPort < 1024 || testPort > 65535) throw new Error('Invalid E2E port');

/** Focused Safari/WebKit coverage for the physical-phone shell. */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 8_000 },
  workers: 1,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    ...devices['iPhone 13 Pro Max'],
    baseURL: `http://127.0.0.1:${testPort}`,
    colorScheme: 'dark',
    serviceWorkers: 'allow',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'webkit-visual-audit', testMatch: '**/visual-audit.spec.ts' },
    { name: 'webkit-house-standard', testMatch: '**/house-standard.spec.ts' },
    { name: 'webkit-taste-discovery', testMatch: '**/taste-discovery.spec.ts' },
    { name: 'webkit-quiz-record', testMatch: '**/daily-quiz.spec.ts', grep: /non-perfect run|dropped answer/ },
    { name: 'webkit-atlas', testMatch: '**/atlas.spec.ts' },
    { name: 'webkit-scroll-bar', testMatch: ['**/landing-data.spec.ts', '**/recipe-focus.spec.ts'] },
    {
      name: 'physical-iphone-shell',
      testMatch: '**/physical-iphone.spec.ts',
    },
    {
      name: 'webkit-shorts-sound',
      testMatch: [
        '**/shorts-sound.spec.ts',
        '**/shorts.spec.ts',
        '**/shorts-webkit-lifecycle.spec.ts',
        '**/shorts-desktop.spec.ts',
        '**/bar.spec.ts',
        '**/tutorial.spec.ts',
        '**/interface.spec.ts',
        '**/landing.spec.ts',
      ],
    },
  ],
  webServer: {
    command: `VITE_API_BASE= PUBCRAWL_STORE_MODE=memory npm run preview -- --host 127.0.0.1 --port ${testPort} --strictPort`,
    url: `http://127.0.0.1:${testPort}`,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
