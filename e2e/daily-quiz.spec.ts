import { test, expect } from '@playwright/test';
import { openRoute, seedStableDevice } from './helpers';
import { readFileSync } from 'node:fs';
import type { Question } from '../src/types';
const questionBank: Question[] = JSON.parse(readFileSync(new URL('../src/generated/client_quiz.json', import.meta.url), 'utf8'));

test.describe('Daily Question and Quiz', () => {
  // Route-level failure injection must reach the page rather than its PWA worker.
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });

  test('lays daily answers out as readable content-height rows', async ({ page }) => {
    await seedStableDevice(page, { daily: false });
    await openRoute(page, '/#/quiz?daily=1');
    const dialog = page.locator('.daily[role="dialog"]');
    await expect(dialog).toBeVisible();
    const options = dialog.locator('.quiz-opt');
    await expect(options).toHaveCount(4);
    const boxes = await options.evaluateAll((elements) => elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right };
    }));
    expect(boxes.every((box) => box.right - box.left > 300)).toBe(true);
    expect(boxes.every((box, index) => index === 0 || box.top >= boxes[index - 1].bottom - 1)).toBe(true);
    await expect(dialog.locator('button', { hasText: 'SKIP FOR TODAY' })).toBeVisible();
  });

  test('keeps unanswered quiz options neutral and exposes keyboard focus', async ({ page }) => {
    await seedStableDevice(page);
    await openRoute(page, '/#/quiz');
    await page.getByRole('button', { name: /Start the round/i }).click();
    const options = page.locator('.quiz-card .quiz-opt');
    await expect(options.first()).toBeVisible();
    const classes = await options.evaluateAll((elements) => elements.map((element) => element.className));
    expect(classes.every((className) => !/right|wrong|muted/.test(className))).toBe(true);
    for (let index = 0; index < 8; index += 1) {
      await page.keyboard.press('Tab');
      if (await options.first().evaluate((element) => document.activeElement === element)) break;
    }
    await expect(options.first()).toBeFocused();
    const outline = await options.first().evaluate((element) => getComputedStyle(element).outlineStyle);
    expect(outline).not.toBe('none');
  });

  test('shows an unverified House Record as an em dash, then shows the confirmed value', async ({ page }) => {
    await seedStableDevice(page);
    await page.route('**/api/quiz/high', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 350));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ score: 19, at: 1, hall: [], bank: 352 }),
      });
    });
    await openRoute(page, '/#/quiz');
    const record = page.locator('.quiz-high');
    await expect(record.locator('b')).toHaveText('—');
    await expect(record.locator('b')).toHaveText('19', { timeout: 2_000 });
  });

  test('distinguishes a legitimate zero record from a failed record request', async ({ page }) => {
    await seedStableDevice(page);
    await page.route('**/api/quiz/high', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ score: 0, at: 0, hall: [], bank: 352 }),
    }));
    await openRoute(page, '/#/quiz');
    await expect(page.locator('.quiz-high b')).toHaveText('0');

    await page.unroute('**/api/quiz/high');
    await page.route('**/api/quiz/high', (route) => route.abort('failed'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('.quiz-high b')).toHaveText('—');
  });

  test('a non-perfect run signs the shared record and another browser sees the holder', async ({ page, browser }) => {
    await seedStableDevice(page);
    await openRoute(page, '/#/quiz');
    const before = await (await page.request.get('/api/quiz/high')).json();
    await page.getByRole('button', { name: 'Start the round' }).click();
    // Win one point more than the current test board, then deliberately miss.
    for (let point = 0; point <= before.score; point++) {
      const heading = await page.locator('.quiz-card .quiz-q').textContent();
      const question = questionBank.find((q) => q.q === heading)!;
      await page.locator('.quiz-card .quiz-opt').nth(question.a).click();
      await page.getByRole('button', { name: 'Keep going' }).click();
    }
    const heading = await page.locator('.quiz-card .quiz-q').textContent();
    const question = questionBank.find((q) => q.q === heading)!;
    await page.locator('.quiz-card .quiz-opt').nth((question.a + 1) % 4).click();
    await page.getByRole('button', { name: 'And that is that' }).click();
    await expect(page.getByLabel('A name for the record')).toBeVisible();
    await page.getByLabel('A name for the record').fill('Citrus Club');
    await page.getByRole('button', { name: 'Sign the board' }).click();
    await expect(page.getByRole('status')).toContainText('Your name is on the board');
    await expect(page.locator('.quiz-high .quiz-record-holder')).toHaveText('Citrus Club');
    const other = await browser.newContext();
    try {
      const guest = await other.newPage();
      await seedStableDevice(guest);
      await openRoute(guest, '/#/quiz');
      await expect(guest.locator('.quiz-high .quiz-record-holder')).toHaveText('Citrus Club');
      await expect(guest.locator('.quiz-high b')).toHaveText(String(before.score + 1));
      await expect(guest.getByLabel('A name for the record')).toHaveCount(0);
    } finally { await other.close(); }
  });

  test('a dropped answer response can be retried without double scoring', async ({ page }) => {
    await seedStableDevice(page);
    await openRoute(page, '/#/quiz');
    await page.getByRole('button', { name: 'Start the round' }).click();
    const heading = await page.locator('.quiz-card .quiz-q').textContent();
    const question = questionBank.find((q) => q.q === heading)!;
    let acknowledge = false;
    await page.route('**/api/quiz/answer', async (route) => {
      if (!acknowledge) {
        await route.fetch(); // Commit on the server; lose the response.
        // A proxy can lose the acknowledgement after the server commits.
        // Returning 503 avoids WebKit's own transparent network-abort retry.
        await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Answer acknowledgement lost"}' });
      } else await route.continue();
    });
    await page.locator('.quiz-card .quiz-opt').nth(question.a).click();
    await expect(page.getByRole('button', { name: 'Retry this answer' })).toBeVisible({ timeout: 15000 });
    acknowledge = true;
    await page.getByRole('button', { name: 'Retry this answer' }).click();
    await expect(page.locator('.quiz-score b')).toHaveText('1');
    await expect(page.getByRole('button', { name: 'Keep going' })).toBeVisible();
  });
});
