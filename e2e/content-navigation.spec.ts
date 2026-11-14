import { expect, test, type Page, type Locator } from '@playwright/test';
import { openRoute, seedStableDevice, navigateTo } from './helpers';

test.use({ serviceWorkers: 'block' });
test.beforeEach(async ({ page }) => {
  await seedStableDevice(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

async function leaveFrom(page: Page, link: Locator) {
  await link.scrollIntoViewIfNeeded();
  const y = await page.evaluate(() => scrollY);
  await link.click();
  return y;
}
async function returnTo(page: Page, name: string, link: Locator, y: number) {
  await page.locator('.page-return').getByRole('button', { name }).click();
  await expect(link).toBeFocused();
  await expect.poll(async () => Math.abs(await page.evaluate(() => scrollY) - y)).toBeLessThan(2);
}

test('Shelf visits return to the exact test shelf, recipe page, scroll position and link', async ({ page }) => {
  await openRoute(page, '/#/');
  const study = page.locator('#home-pantry');
  await study.getByRole('button', { name: 'Remove Ice', exact: true }).click();
  await study.getByRole('button', { name: 'Next shelf recipes' }).click();
  const selected = await study.locator('.pantry-shelf-item').allTextContents();
  const recipes = await study.locator('.pantry-recipe-list').textContent();
  const link = study.getByRole('link', { name: 'Open Shelf', exact: true });
  const y = await leaveFrom(page, link);
  await expect(page.locator('#shelf')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Back to Just one more bottle' })).toBeFocused();
  await returnTo(page, 'Back to Just one more bottle', link, y);
  expect(await study.locator('.pantry-shelf-item').allTextContents()).toEqual(selected);
  expect(await study.locator('.pantry-recipe-list').textContent()).toEqual(recipes);
  // A native forward/back round trip remains usable after the explicit action.
  await page.goForward();
  await expect(page.locator('#shelf')).toBeVisible();
  await page.goBack();
  await expect(study.locator('.home-study-toggle')).toHaveAttribute('aria-expanded', 'true');
  expect(await study.locator('.pantry-recipe-list').textContent()).toEqual(recipes);
});

test('Back skips destination filter entries after a fullscreen recipe, retaining the calorie comparison', async ({ page }) => {
  await openRoute(page, '/#/');
  const study = page.locator('#home-calories');
  await study.locator('.home-study-toggle').click();
  await study.getByLabel('Calorie order', { exact: true }).selectOption('kcal');
  await study.getByLabel('Reference serving', { exact: true }).selectOption('beer');
  await study.getByRole('button', { name: 'Next calorie servings' }).click();
  const row = study.locator('[data-calorie-drink="negroni"]');
  await row.locator('.calorie-row').click();
  const link = row.getByRole('link', { name: 'Find the drink', exact: true });
  const y = await leaveFrom(page, link);
  const menu = page.locator('#menu-list');
  await expect(menu.locator('.fc[data-recipe-id="11003"]')).toBeVisible();
  await menu.getByRole('button', { name: 'More filters', exact: true }).click();
  // Select native controls on phones and pills on desktop through the same UI.
  const filter = menu.locator('.category-filter-select:visible');
  if (await filter.count()) {
    await filter.selectOption('category:boozy');
    await filter.selectOption('all');
  } else {
    await menu.getByRole('button', { name: /^Spirit.forward$/i }).click();
    await menu.getByRole('button', { name: 'All', exact: true }).click();
  }
  const card = menu.locator('.fc[data-recipe-id="11003"]');
  await card.locator('.front').getByRole('button', { name: /full screen/ }).click();
  const reader = page.getByRole('dialog', { name: 'Negroni', exact: true });
  await expect(reader).toHaveAttribute('data-phase', 'open');
  await reader.getByRole('button', { name: 'Back to card', exact: true }).click();
  await expect(reader).toHaveCount(0);
  await returnTo(page, 'Back to Calories, by the glass', link, y);
  await expect(study.getByLabel('Reference serving', { exact: true })).toHaveValue('beer');
  await expect(study.getByLabel('Calorie order', { exact: true })).toHaveValue('kcal');
  await expect(study.getByRole('navigation', { name: 'Calorie servings' })).toContainText('9–16 of 20');
  await expect(row.locator('.calorie-row')).toHaveAttribute('aria-expanded', 'true');
});

test('recipe and pairing visits preserve selections, graph scroll and context', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openRoute(page, '/#/');
  const dna = page.locator('#home-dna');
  await dna.locator('.home-study-toggle').click();
  await dna.getByRole('button', { name: /^Margarita, 85 ml/ }).click();
  await dna.getByRole('button', { name: 'Proportions · %', exact: true }).click();
  const recipe = dna.getByRole('link', { name: 'Find the recipe ↗', exact: true });
  const firstY = await leaveFrom(page, recipe);
  await expect(page.locator('#menu-list')).toBeVisible();
  await returnTo(page, 'Back to Same shelf. Different intentions', recipe, firstY);
  await expect(dna.getByRole('button', { name: /^Margarita, 85 ml/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(dna.getByRole('button', { name: 'Proportions · %', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const pair = page.locator('#home-pairings');
  await pair.locator('.home-study-toggle').click();
  await pair.getByLabel('First ingredient', { exact: true }).selectOption('gin');
  await pair.getByLabel('Second ingredient', { exact: true }).selectOption('lemon juice');
  await pair.locator('.atlas-plot').evaluate(el => { el.scrollLeft = 120; });
  const graphX = await pair.locator('.atlas-plot').evaluate(el => el.scrollLeft);
  const related = pair.locator('.atlas-recipe-links a').first();
  const secondY = await leaveFrom(page, related);
  await expect(page.locator('#menu-list')).toBeVisible();
  await returnTo(page, 'Back to Who keeps whose company?', related, secondY);
  await expect(pair.getByLabel('First ingredient', { exact: true })).toHaveValue('gin');
  await expect(pair.getByLabel('Second ingredient', { exact: true })).toHaveValue('lemon juice');
  expect(await pair.locator('.atlas-plot').evaluate(el => el.scrollLeft)).toBe(graphX);
});

test('primary navigation and direct entries stay independent of contextual content Back', async ({ page }) => {
  await openRoute(page, '/#/menu?q=Negroni');
  await expect(page.locator('.page-return')).toHaveCount(0);
  await navigateTo(page, 'Taste Map');
  await expect(page.locator('.page-return')).toHaveCount(0);
  const browse = page.getByRole('button', { name: /^Browse all 691 recipes/ });
  const y = await leaveFrom(page, browse);
  await returnTo(page, 'Back to Taste Map', browse, y);
  await navigateTo(page, 'Shelf');
  await expect(page.locator('.page-return')).toHaveCount(0);
});
