import { expect, type Locator, type Page } from '@playwright/test';

/** Exercise Swiper through actual browser input; native touch has separate CDP coverage. */
export async function swipePage(surface: Locator, direction: 'next' | 'previous' = 'next') {
  const page = surface.page();
  const target = await surface.count() > 1 ? surface.and(page.locator('.swiper-slide-active *')) : surface;
  await target.hover();
  const state = await target.evaluate(el => {
    const root = el.closest('.paged-carousel') || el.querySelector('.paged-carousel');
    const swiper = (root as HTMLElement & { swiper: { activeIndex: number; slides: unknown[]; params: { rewind: boolean } } }).swiper;
    const bounds = root!.getBoundingClientRect();
    return { page: swiper.activeIndex, count: swiper.slides.length, rewind: swiper.params.rewind, left: bounds.left, width: bounds.width };
  });
  const next = state.page + (direction === 'next' ? 1 : -1);
  const expected = state.rewind ? (next + state.count) % state.count : Math.max(0, Math.min(state.count - 1, next));
  const box = (await target.boundingBox())!;
  const y = Math.min(box.y + box.height / 2, page.viewportSize()!.height - 140);
  if (page.viewportSize()!.width > 860) {
    // Swiper groups wheel input within 150ms into a single trackpad gesture.
    await page.waitForTimeout(160);
    await page.mouse.move(box.x + box.width / 2, y);
    await page.mouse.wheel(direction === 'next' ? 450 : -450, 0);
  } else {
    const left = direction === 'next';
    await page.mouse.move(state.left + state.width * (left ? .85 : .15), y);
    await page.mouse.down();
    await page.mouse.move(state.left + state.width * (left ? .15 : .85), y, { steps: 8 });
    await page.mouse.up();
  }
  await expect.poll(() => target.evaluate(el => {
    const root = el.closest('.paged-carousel') || el.querySelector('.paged-carousel');
    return (root as HTMLElement & { swiper: { activeIndex: number } }).swiper.activeIndex;
  })).toBe(expected);
  await expect.poll(() => target.evaluate(el => {
    const carousel = el.closest('.paged-carousel') || el.querySelector('.paged-carousel');
    return !(carousel as HTMLElement & { swiper?: { animating: boolean } })?.swiper?.animating;
  })).toBe(true);
}

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
