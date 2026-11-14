import { expect, test } from '@playwright/test';
import { openRoute, seedStableDevice } from './helpers';

test.use({ serviceWorkers: 'block' });

const ids = ['NSu-QVtpvIc', 'b0IuTL3Z-kk', 'GE8vyfKyZfQ', 'X3n5Pk8fkLg'];
const svg = (width: number, height: number) => `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#76917d"/><rect width="30" height="100%" fill="#db7143"/><rect x="${width - 30}" width="30" height="100%" fill="#f0dc87"/></svg>`;

test.beforeEach(async ({ page }) => {
  await seedStableDevice(page);
  await page.route('**/api/videos', (route) => route.fulfill({ json: {
    lanes: [{ id: 'education', label: 'Learn It', color: '#5c7a3b' }],
    videos: ids.map((id, rank) => ({ id, rank, title: `Thumbnail test ${rank + 1}`, channel: 'PubCrawl test', lane: 'education', views: 400 - rank, likes: null, movement: 0, addedAt: '2026-11-14' })),
    hasNumbers: true, updatedAt: null,
  } }));
  await page.route('https://www.youtube-nocookie.com/embed/**', (route) => route.fulfill({ contentType: 'text/html', body: '<title>Test player</title>' }));
});

test('Watch thumbnails keep the complete frame at every width and Play works by keyboard', async ({ page }) => {
  await page.route('https://i.ytimg.com/**', (route) => route.fulfill({ contentType: 'image/svg+xml', body: svg(1280, 720) }));
  await openRoute(page, '/#/watch');
  const card = page.locator(`[data-video-id="${ids[0]}"]`);
  const button = card.getByRole('button', { name: 'Play Thumbnail test 1', exact: true });
  const image = card.locator('.wv-thumb img');
  await expect(button).toBeVisible();
  await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBe(1280);
  await expect(image).toHaveAttribute('src', /maxresdefault\.jpg$/);
  await expect(page.locator('.wv-player')).toHaveCount(0);

  for (const width of [320, 390, 430, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ['light', 'dark']) {
      if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('.house-theme').click();
      const geometry = await image.evaluate((element) => {
        const frame = element.closest('.wv-frame')!.getBoundingClientRect();
        const bounds = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return { fit: style.objectFit, transform: style.transform, left: bounds.left - frame.left, right: frame.right - bounds.right, top: bounds.top - frame.top, bottom: frame.bottom - bounds.bottom, overflow: document.documentElement.scrollWidth - innerWidth };
      });
      expect(geometry.fit).toBe('contain');
      expect(geometry.transform).toBe('none');
      for (const edge of [geometry.left, geometry.right, geometry.top, geometry.bottom]) expect(Math.abs(edge)).toBeLessThanOrEqual(2);
      expect(geometry.overflow).toBeLessThanOrEqual(1);
    }
  }
  await button.hover();
  await expect(image).toHaveCSS('transform', 'none');
  await page.keyboard.press('Tab');
  await button.focus();
  await expect(button).toBeFocused();
  await expect(card.locator('.wv-play')).toHaveCSS('outline-style', 'solid');
  const playSize = await card.locator('.wv-play').boundingBox();
  expect(playSize!.width).toBeGreaterThanOrEqual(44);
  expect(playSize!.height).toBeGreaterThanOrEqual(44);
  await button.press('Enter');
  await expect(card.locator('.wv-player')).toHaveAttribute('src', new RegExp(`/embed/${ids[0]}\\?`));
  await expect(page.locator('.wv-player')).toHaveCount(1);
  await expect(card.locator('.wv-play')).toHaveCount(0);
});

test('Watch falls back from missing or placeholder images and stays playable when every image fails', async ({ page }) => {
  const requests: Record<string, string[]> = {};
  await page.route('https://i.ytimg.com/**', (route) => {
    const [, id, size] = new URL(route.request().url()).pathname.match(/\/vi\/([^/]+)\/([^/.]+)/) || [];
    (requests[id] ||= []).push(size);
    if (id === ids[0]) return route.fulfill({ contentType: 'image/svg+xml', body: svg(1280, 720) });
    if (id === ids[1] && size === 'sddefault') return route.fulfill({ contentType: 'image/svg+xml', body: svg(640, 480) });
    if (id === ids[2] && size === 'maxresdefault') return route.fulfill({ contentType: 'image/svg+xml', body: svg(120, 90) });
    if (id === ids[2] && size === 'hqdefault') return route.fulfill({ contentType: 'image/svg+xml', body: svg(480, 360) });
    return route.fulfill({ status: 404, body: '' });
  });
  await openRoute(page, '/#/watch');
  for (const [index, id] of ids.entries()) {
    const card = page.locator(`[data-video-id="${id}"]`);
    await card.scrollIntoViewIfNeeded();
    if (index === 3) {
      await expect.poll(() => requests[id]).toEqual(['maxresdefault', 'sddefault', 'hqdefault']);
      await expect(card.locator('.wv-thumb img')).toHaveCount(0);
      await card.getByRole('button', { name: 'Play Thumbnail test 4', exact: true }).click();
      await expect(card.locator('.wv-player')).toBeVisible();
    } else {
      const size = ['maxresdefault', 'sddefault', 'hqdefault'][index];
      await expect(card.locator('.wv-thumb img')).toHaveAttribute('src', new RegExp(`/${size}\\.jpg$`));
      await expect.poll(() => card.locator('.wv-thumb img').evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe([1280, 640, 480][index]);
      await expect(card.locator('.wv-thumb img')).toHaveCSS('object-fit', 'contain');
    }
  }
  expect(requests[ids[0]]).toEqual(['maxresdefault']);
  expect(requests[ids[1]]).toEqual(['maxresdefault', 'sddefault']);
  expect(requests[ids[2]]).toEqual(['maxresdefault', 'sddefault', 'hqdefault']);
});
