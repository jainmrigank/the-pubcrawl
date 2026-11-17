import { expect, test } from '@playwright/test';
import { openRoute, seedStableDevice, navigateTo } from './helpers';
import { addFinderIngredients } from './fixtures/studyRecipes';

test.use({ serviceWorkers: 'block' });
test.beforeEach(async ({ page }) => {
  await seedStableDevice(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

for (const width of [320, 390, 430, 768, 1024, 1440]) {
  test(`Focus & Return fits ${width}px in both themes`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await openRoute(page, '/#/');
    const pair = page.locator('#home-pairings');
    await pair.locator('.home-study-toggle').click();
    await expect(pair.locator('.pairing-matrix-cell')).toHaveCount(144);
    await expect(pair.locator('.pairing-selected-pair p')).toHaveText('11 matching recipes');
    await pair.getByRole('button', { name: 'View all 11 recipes', exact: true }).click();
    await expect(pair.locator('.study-recipe-list button')).toHaveCount(11);
    // Every result is available, including the last; no three-recipe hard cap.
    await pair.locator('.study-recipe-list button').last().click();
    await expect(pair.locator('.study-recipe-preview > h4')).toHaveText('Vodka Nimbu Soda');
    for (const theme of ['light', 'dark']) {
      if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('.house-theme').click();
      await pair.locator('.study-recipe-preview').screenshot({ path: info.outputPath(`pairing-recipe-${width}-${theme}.png`) });
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    }
    await pair.getByRole('button', { name: 'Back to 11 drinks', exact: true }).click();
    await pair.getByRole('button', { name: 'Hide recipes', exact: true }).click();
    const finder = page.locator('#home-pantry');
    await finder.locator('.home-study-toggle').click();
    await addFinderIngredients(finder);
    await expect(finder.locator('.finder-result-tabs button')).toHaveText(['Can make2', 'Need 129', 'Need 2202']);
    await finder.locator('.study-recipe-list button').filter({ hasText: 'Negroni' }).click();
    await expect(finder.locator('.study-recipe-preview > h4')).toHaveText('Negroni');
    const list = finder.locator('.study-recipe-results');
    if (width <= 900) await expect(list).toBeHidden();
    else {
      await expect(list).toBeVisible();
      const boxes = await finder.evaluate(el => ({ list: el.querySelector('.study-recipe-choices')!.getBoundingClientRect().right, recipe: el.querySelector('.study-recipe-focus')!.getBoundingClientRect().left }));
      expect(boxes.list).toBeLessThan(boxes.recipe);
    }
    for (const theme of ['light', 'dark']) {
      if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('.house-theme').click();
      const preview = finder.locator('.study-recipe-preview');
      await preview.screenshot({ path: info.outputPath(`finder-${width}-${theme}.png`) });
      const framing = await preview.locator('img').evaluate(el => ({ fit: getComputedStyle(el).objectFit, height: el.getBoundingClientRect().height, frame: el.parentElement!.getBoundingClientRect().height, transform: getComputedStyle(el).transform }));
      expect(framing.fit).toBe('contain'); expect(framing.height).toBeCloseTo(framing.frame, 0); expect(framing.transform).toBe('none');
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    }
  });
}

test('beer and wine are separate, browse every style with a stable scale and only two sorts', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openRoute(page, '/#/');
  const study = page.locator('#home-calories');
  await study.locator('.home-study-toggle').click();
  await expect(study.getByLabel('Calorie sort').locator('option')).toHaveText(['Lowest first', 'Highest first']);
  await expect(study.locator('.calorie-reference-key, .calorie-reference-line')).toHaveCount(0);
  await expect(study.getByLabel('Reference serving')).toHaveCount(0);
  for (const [label, count, volume] of [['Beer', 14, '568 ml'], ['Wine', 29, '150 ml']] as const) {
    await study.getByRole('button', { name: label, exact: true }).click();
    await expect(study.locator('.calorie-serving')).toContainText(volume);
    const scale = await study.locator('.calorie-axis').textContent();
    const seen: string[] = [];
    while (true) {
      seen.push(...await study.locator('[data-calorie-drink]').evaluateAll(els => els.map(el => el.getAttribute('data-calorie-drink')!)));
      await expect(study.locator('.calorie-axis')).toHaveText(scale!);
      const next = study.getByRole('button', { name: 'Next calorie servings' });
      if (await next.isDisabled()) break;
      await next.click();
    }
    expect(new Set(seen).size).toBe(count);
    await study.getByLabel('Calorie sort').selectOption('high');
    await expect(study.getByRole('navigation', { name: 'Calorie servings' })).toContainText(`1–4 of ${count}`);
    await study.locator('.calorie-row').first().click();
    await expect(study.locator('.calorie-profile a')).toHaveAttribute('href', /^https:\/\//);
    await study.getByLabel('Calorie sort').selectOption('kcal');
  }
});

test('full matrix supports precision expansion, keyboard selection and rotation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openRoute(page, '/#/');
  const study = page.locator('#home-pairings');
  await study.locator('.home-study-toggle').click();
  await study.getByRole('button', { name: /^Gin and Lemon Juice:/ }).click();
  await expect(study.locator('.pairing-selected-pair p')).toHaveText('24 matching recipes');
  await study.locator('.pairing-matrix-cell[aria-pressed="true"]').focus();
  await page.keyboard.press('ArrowRight');
  await expect(study.getByLabel('Second ingredient', { exact: true })).toHaveValue('lime juice');
  await expect(study.locator('.pairing-matrix-cell[aria-pressed="true"]')).toBeFocused();
  await study.getByRole('button', { name: 'Expand grid', exact: true }).click();
  await expect(study.locator('.pairing-matrix-cell')).toHaveCount(144);
  const cell = await study.locator('.pairing-matrix-cell').first().boundingBox();
  expect(cell!.width).toBeGreaterThanOrEqual(44); expect(cell!.height).toBeGreaterThanOrEqual(44);
  await study.getByRole('button', { name: 'Fit grid', exact: true }).click();
  await study.getByRole('button', { name: 'Overlap · %', exact: true }).click();
  await study.getByLabel('Second ingredient', { exact: true }).selectOption('lemon juice');
  await expect(study.locator('.pairing-selected-pair p')).toContainText('14.8%');
  for (const size of [{width:1024,height:430}, {width:390,height:844}]) {
    await page.setViewportSize(size);
    await expect(study.locator('.pairing-matrix-cell')).toHaveCount(144);
    await expect(study.getByLabel('First ingredient', { exact: true })).toHaveValue('gin');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  }
});

test('mobile study controls stay reachable during scrolling and stop pinning in short landscape', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openRoute(page, '/#/');
  const study = page.locator('#home-calories');
  await study.locator('.home-study-toggle').click();
  await study.locator('.calorie-controls').evaluate(el => scrollTo(0, el.getBoundingClientRect().top + scrollY + 70));
  const pinned = await study.locator('.calorie-controls').evaluate(el => ({ top: el.getBoundingClientRect().top, nav: document.querySelector('.house-nav')!.getBoundingClientRect().bottom, position: getComputedStyle(el).position }));
  expect(pinned.position).toBe('sticky');
  expect(Math.abs(pinned.top - pinned.nav)).toBeLessThan(2);
  await study.getByRole('button', { name: 'Beer', exact: true }).click();
  await expect(study.locator('.calorie-serving')).toContainText('568 ml');
  await page.setViewportSize({ width: 844, height: 390 });
  expect(await study.locator('.calorie-controls').evaluate(el => getComputedStyle(el).position)).toBe('static');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
});

test('inline recipe actions, full-screen reader and Back preserve the result list', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openRoute(page, '/#/');
  const study = page.locator('#home-pantry');
  await study.locator('.home-study-toggle').click();
  await addFinderIngredients(study);
  await study.getByRole('button', { name: /^Need 1/ }).click();
  await expect(study.locator('.study-recipe-list button')).toHaveCount(29);
  const last = study.locator('.study-recipe-list button').last();
  const chosen = await last.locator('strong').textContent();
  await last.evaluate(el => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
  const before = await study.locator('.study-recipe-list').evaluate(el => ({ top: el.scrollTop, y: scrollY }));
  await last.click();
  const preview = study.locator('.study-recipe-preview');
  await expect(preview.locator('h4')).toHaveText(chosen!);
  await preview.getByRole('button', { name: 'Save to Tab', exact: true }).click();
  await expect(preview.getByRole('button', { name: 'Saved to Tab', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await preview.getByRole('button', { name: /^Like$/ }).click();
  await expect(preview.getByRole('button', { name: /^Liked/ })).toHaveAttribute('aria-pressed', 'true');
  const expand = preview.getByRole('button', { name: /in full screen/ });
  await expand.click();
  const reader = page.getByRole('dialog', { name: chosen!, exact: true });
  await expect(reader).toHaveAttribute('data-phase', 'open');
  await reader.getByRole('button', { name: /Lock recipe view/ }).click();
  await expect(reader.locator('.recipe-focus-scroller')).toHaveClass(/is-locked/);
  await page.keyboard.press('Escape');
  await expect(reader).toHaveCount(0);
  await expect(expand).toBeFocused();
  await study.getByRole('button', { name: 'Back to 29 drinks', exact: true }).click();
  await expect(last).toBeFocused();
  await expect.poll(() => study.locator('.study-recipe-list').evaluate(el => el.scrollTop)).toBe(before.top);
  await expect.poll(async () => Math.abs(await page.evaluate(() => scrollY) - before.y)).toBeLessThan(2);
  await expect(study.getByRole('button', { name: /^Need 1/ })).toHaveAttribute('aria-pressed', 'true');
});

test('Add & open Shelf merges ingredients, keeps existing bottles and does not duplicate them', async ({ page }) => {
  await openRoute(page, '/#/');
  const study = page.locator('#home-pantry');
  await study.locator('.home-study-toggle').click();
  await addFinderIngredients(study, ['Gin']);
  // Editing the study does not write to Shelf.
  await navigateTo(page, 'Shelf');
  await expect(page.locator('#shelf .chip-row .chip')).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Search ingredients', exact: true }).fill('Bourbon');
  await page.getByRole('option', { name: /Bourbon/ }).first().click();
  await page.getByRole('link', { name: 'PubCrawl home', exact: true }).click();
  await study.getByRole('link', { name: 'Add & open Shelf', exact: true }).click();
  await expect(page.locator('#shelf .chip-row')).toContainText('Bourbon');
  await expect(page.locator('#shelf .chip-row')).toContainText('Gin');
  const count = await page.locator('#shelf .chip-row .chip').count();
  await page.getByRole('button', { name: 'Back to What can I make?', exact: true }).click();
  await study.getByRole('link', { name: 'Add & open Shelf', exact: true }).click();
  await expect(page.locator('#shelf .chip-row .chip')).toHaveCount(count);
});

test('failed recipe images use the existing glass fallback', async ({ page }) => {
  await page.route('**/*', route => route.request().resourceType() === 'image' ? route.abort() : route.continue());
  await openRoute(page, '/#/');
  const study = page.locator('#home-pairings');
  await study.locator('.home-study-toggle').click();
  await study.getByRole('button', { name: 'View all 11 recipes', exact: true }).click();
  await study.locator('.study-recipe-list button').first().click();
  await expect(study.getByRole('img', { name: 'No recipe photo available', exact: true })).toBeVisible();
  await expect(study.locator('.study-recipe-photo')).toHaveCSS('overflow', 'clip');
});
