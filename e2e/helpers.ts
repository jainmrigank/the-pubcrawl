import type { Page } from '@playwright/test';

export async function seedStableDevice(page: Page, options: { daily?: boolean; tours?: boolean } = {}) {
  await page.addInitScript(({ suppressDaily, suppressTours }) => {
    localStorage.setItem('pubcrawl.theme', 'dark');
    if (suppressTours) {
      for (const id of ['landing', 'menu', 'bar', 'basics', 'tab', 'quiz', 'watch', 'shorts']) {
        localStorage.setItem(`pubcrawl.tour.${id}.v1`, 'skipped');
      }
    }
    localStorage.setItem('pubcrawl.installDismissed', '1');
    if (suppressDaily) {
      const now = new Date();
      const day = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 86400000);
      localStorage.setItem('pubcrawl.dailySeen', String(day));
    }
  }, { suppressDaily: options.daily !== false, suppressTours: options.tours !== false });
}

export async function openRoute(page: Page, route: string) {
  await page.goto(route, { waitUntil: 'domcontentloaded' });
  await page.locator('.site').waitFor();
}
