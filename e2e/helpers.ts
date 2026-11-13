import type { Page } from '@playwright/test';

export async function seedStableDevice(page: Page, options: { daily?: boolean; tours?: boolean } = {}) {
  await page.addInitScript(({ suppressDaily, suppressTours }) => {
    localStorage.setItem('pubcrawl.theme', 'dark');
    if (suppressTours) {
      for (const id of ['landing', 'menu', 'taste-map', 'bar', 'basics', 'tab', 'quiz', 'watch', 'shorts']) {
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

/** Keep route tests independent of the desktop/phone navigation layout. */
export async function navigateTo(page: Page, name: string) {
  name = name === 'My Shelf' ? 'Shelf' : name === 'Your Tab' ? 'Tab' : name;
  const expression = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
  const primary = page.locator('.house-desktop-links:visible, .house-mobile-links:visible').getByRole('link', { name: expression });
  if (await primary.count() === 1 && await primary.getAttribute('href')) {
    await primary.click();
    return;
  }
  await page.getByRole('button', { name: /^(Explore|More)\s*\+?$/ }).click();
  await page.getByRole('dialog', { name: 'Explore PubCrawl' }).getByRole('link', { name: expression }).click();
}

export async function useDrinksList(page: Page) {
  if (new URL(page.url()).hash.split('?')[0] !== '#/menu') await navigateTo(page, 'Drinks');
  await page.locator('#menu-list').waitFor({ state: 'visible' });
}

export async function useTasteMap(page: Page) {
  if (new URL(page.url()).hash.split('?')[0] !== '#/taste-map') await navigateTo(page, 'Taste Map');
  await page.locator('.taste-plot').waitFor({ state: 'visible' });
}
