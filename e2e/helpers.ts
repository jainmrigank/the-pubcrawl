import type { Page } from '@playwright/test';

export async function seedStableDevice(page: Page, options: { daily?: boolean } = {}) {
  await page.addInitScript(({ suppressDaily }) => {
    localStorage.setItem('pubcrawl.theme', 'dark');
    localStorage.setItem('pubcrawl.tour.bar.v1', 'skipped');
    localStorage.setItem('pubcrawl.tour.shorts.v1', 'skipped');
    localStorage.setItem('pubcrawl.installDismissed', '1');
    if (suppressDaily) {
      const now = new Date();
      const day = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 86400000);
      localStorage.setItem('pubcrawl.dailySeen', String(day));
    }
  }, { suppressDaily: options.daily !== false });
}

export async function openRoute(page: Page, route: string) {
  await page.goto(route, { waitUntil: 'domcontentloaded' });
  await page.locator('.site').waitFor();
}
