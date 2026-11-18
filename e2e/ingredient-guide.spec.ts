import { test, expect } from '@playwright/test';
import { openRoute, seedStableDevice } from './helpers';

test.use({ serviceWorkers: 'block' });
test.beforeEach(async ({ page }) => {
  await seedStableDevice(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('explains unfamiliar ingredients without changing measures or flipping the card', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openRoute(page, '/#/menu?q=Mudslinger');
  const card = page.locator('.fc[data-recipe-id="16041"]');
  await card.getByRole('button', { name: 'View recipe', exact: true }).click();
  const help = card.locator('.back').getByRole('button', { name: 'Alternatives for Southern Comfort', exact: true });
  await expect(help).toContainText('Southern Comfort / sweet spiced whisky');
  await expect(help).toHaveAttribute('aria-expanded', 'false');
  await help.click();
  await expect(help).toHaveAttribute('aria-expanded', 'true');
  await expect(card).toHaveClass(/flipped/);
  const details = card.locator('.ingredient-guide-details:visible');
  await expect(details).toContainText('Whisky + honey + orange peel');
  await expect(details).toContainText('No tested replacement ratio');
  const prep = details.getByRole('button', { name: 'Before you mix', exact: true });
  await expect(prep).toHaveAttribute('aria-expanded', 'false');
  await expect(details.locator('.ingredient-preparation-content')).toBeHidden();
  await expect(card.locator('.ingredient-row-measure').first()).toHaveText('750 ml');
  const target = await help.boundingBox();
  expect(target!.height).toBeGreaterThanOrEqual(44);
  await card.locator('.back').getByRole('button', { name: /full screen/ }).click();
  const reader = page.getByRole('dialog', { name: 'Mudslinger', exact: true });
  await expect(reader).toHaveAttribute('data-phase', 'open');
  const readerHelp = reader.getByRole('button', { name: 'Alternatives for Southern Comfort' });
  await readerHelp.click();
  const readerPrep = reader.getByRole('button', { name: 'Before you mix', exact: true });
  await expect(readerPrep).toHaveAttribute('aria-expanded', 'false');
  await expect(reader.locator('.ingredient-preparation-content')).toBeHidden();
  await readerPrep.click();
  await expect(reader.locator('.ingredient-preparation-content')).toBeVisible();
  for (const width of [320, 390, 430, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    for (const theme of ['light', 'dark']) {
      await page.evaluate(theme => document.documentElement.setAttribute('data-theme', theme), theme);
      expect(await reader.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
      const row = reader.locator('.ingredient-row').first();
      expect(await row.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
      if ([390, 1440].includes(width)) await reader.screenshot({ path: info.outputPath(`ingredient-reader-${width}-${theme}.png`) });
    }
  }
  await reader.getByRole('button', { name: 'Lock recipe view at this position' }).click();
  await expect(readerHelp).toBeDisabled();
  await expect(readerPrep).toBeDisabled();
  await reader.getByRole('button', { name: 'Unlock recipe view to scroll' }).click();
  await expect(readerHelp).toBeEnabled();
  await reader.getByRole('button', { name: 'Back to card' }).click();
  await expect(reader).toHaveCount(0);
  await expect(page.locator('#root')).not.toHaveAttribute('inert', '');
  await expect(card).toHaveClass(/flipped/);
  await expect(card.locator('.back .fc-expand')).toBeFocused();
  await expect(help).toHaveAttribute('aria-expanded', 'true');
  await expect(prep).toHaveAttribute('aria-expanded', 'false');
  await card.getByRole('button', { name: 'Already made? Add to Shelf', exact: true }).click();
  await expect(card.getByRole('button', { name: 'On Shelf', exact: true })).toBeDisabled();
});

test('Shelf finds type aliases and clearly marks measured preparation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openRoute(page, '/#/bar');
  const input = page.getByRole('textbox', { name: 'Search ingredients', exact: true });
  for (const name of ['Vodka', 'Almond extract', 'Vanilla extract']) {
    await input.fill(name);
    await page.getByRole('option').filter({ has: page.locator('.ta-name', { hasText: new RegExp(`^${name}$`, 'i') }) }).first().click();
  }
  await page.getByRole('button', { name: 'Filter results', exact: true }).click();
  await page.getByRole('textbox', { name: /^Search matched drinks/ }).fill('Godmother');
  const card = page.locator('.shelf-results-grid .fc').filter({ has: page.getByRole('heading', { name: 'Godmother', exact: true }) });
  await expect(card).toHaveCount(1);
  await expect(card.locator('.front .recipe-availability')).toContainText('Prep first');
  await card.getByRole('button', { name: 'View recipe', exact: true }).click();
  await expect(card.locator('.back .ingredient-row-alternative')).toContainText('Homemade almond liqueur');
  await card.getByRole('button', { name: 'Alternatives for Amaretto' }).click();
  const prep = card.getByRole('button', { name: 'Before you mix', exact: true });
  await expect(prep).toHaveAttribute('aria-expanded', 'false');
  await expect(card.locator('.ingredient-preparation-content')).toBeHidden();
  await prep.click();
  await expect(prep).toHaveAttribute('aria-expanded', 'true');
  await expect(card.locator('.ingredient-guide-details:visible')).toContainText('75 minutes');
  await expect(card.locator('.ingredient-guide-details:visible')).toContainText('cool completely');
});

test('home ingredient picker understands plain names and keeps the selection on Shelf', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openRoute(page, '/#/');
  const finder = page.locator('#home-pantry');
  await finder.locator('.home-study-toggle').click();
  await finder.getByRole('textbox', { name: 'Add an ingredient', exact: true }).fill('almond liqueur');
  await expect(finder.getByRole('listbox')).toContainText('Amaretto');
  await expect(finder.getByRole('listbox')).toContainText('almond liqueur');
  await finder.getByRole('option', { name: /^Amaretto / }).first().click();
  await finder.getByRole('link', { name: 'Add & open Shelf', exact: true }).click();
  await expect(page.locator('.pantry')).toContainText('Amaretto');
});

test('Home and Shelf offer common ingredients on focus, then filter typed searches', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [route, selector, label] of [
    ['/#/', '#home-pantry', 'Add an ingredient'],
    ['/#/bar', '#shelf', 'Search ingredients'],
  ]) {
    await openRoute(page, route);
    const section = page.locator(selector);
    if (selector === '#home-pantry') await section.locator('.home-study-toggle').click();
    const input = section.getByRole('textbox', { name: label, exact: true });
    await input.click();
    const common = section.getByRole('listbox', { name: 'Common ingredients', exact: true });
    await expect(common.getByRole('option')).toHaveCount(12);
    await expect(common.getByRole('option', { name: /^Vodka/ })).toBeVisible();
    await expect.poll(() => common.evaluate(el => {
      const r = el.getBoundingClientRect();
      return r.top >= document.querySelector('.house-nav')!.getBoundingClientRect().bottom && r.bottom <= document.querySelector('.house-mobile-links')!.getBoundingClientRect().top;
    })).toBe(true);
    await input.press('ArrowDown');
    await input.press('Enter');
    await expect(input).toBeEmpty();
    await expect(section.getByRole('listbox')).toHaveCount(0);
    await expect(section.locator(selector === '#shelf' ? '.chip-row' : '.finder-selected')).toContainText('Gin');
    // Clicking an already-focused input must reopen the common choices too.
    await input.click();
    await expect(common).toBeVisible();
    await input.fill('peach');
    const matching = section.getByRole('listbox', { name: 'Matching ingredients', exact: true });
    await expect(matching.getByRole('option').filter({ has: page.locator('.ta-name', { hasText: /^Peach$/ }) })).toBeVisible();
    await expect(matching.getByRole('option', { name: /^Gin/ })).toHaveCount(0);
    await input.fill('');
    await expect(common.getByRole('option')).toHaveCount(12);
    await input.press('ArrowUp');
    const last = common.getByRole('option', { name: /^Ice/ });
    await expect(last).toHaveAttribute('aria-selected', 'true');
    await expect.poll(() => last.evaluate(el => { const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); })).toBe(true);
    await input.press('Escape');
    await expect(section.getByRole('listbox')).toHaveCount(0);
    await input.click();
    await expect(common).toBeVisible();
    await input.press('Tab');
    await expect(section.getByRole('listbox')).toHaveCount(0);
  }
});
