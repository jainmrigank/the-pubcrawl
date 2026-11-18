import { expect, test, type Page, type Locator } from '@playwright/test';
import { addFinderIngredients } from './fixtures/studyRecipes';
import { openRoute, seedStableDevice, navigateTo, swipePage } from './helpers';

test.use({ serviceWorkers: 'block' });
test.beforeEach(async ({ page }) => {
  await seedStableDevice(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

async function leaveFrom(page: Page, link: Locator) {
  // Keep the departure link clear of persistent phone navigation.
  // Record the actual tap position: WebKit may scroll a focused anchor before
  // dispatching click, even after scrollIntoView has placed it in the viewport.
  await link.evaluate(el => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
  const target = (await link.elementHandle())!;
  await target.evaluate(el => el.addEventListener('click', () => el.setAttribute('data-test-departure-y', String(scrollY)), { once: true, capture: true }));
  await link.click();
  const y = await target.evaluate(el => { const value = Number(el.getAttribute('data-test-departure-y')); el.removeAttribute('data-test-departure-y'); return value; });
  await target.dispose();
  return y;
}
async function returnTo(page: Page, name: string, link: Locator, y: number) {
  await page.locator('.page-return').getByRole('button', { name }).click();
  await expect(link).toBeFocused();
  await expect.poll(async () => Math.abs(await page.evaluate(() => scrollY) - y)).toBeLessThan(2);
}

test('Shelf visits return to the exact ingredient example and recipe choice, scroll position and link', async ({ page }) => {
  await openRoute(page, '/#/');
  const study = page.locator('#home-pantry');
  await study.locator('.home-study-toggle').click();
  await addFinderIngredients(study);
  await study.getByRole('button', { name: /^Need 1/ }).click();
  const selected = await study.locator('.pantry-shelf-item').allTextContents();
  const recipes = await study.locator('.study-recipe-list').textContent();
  const link = study.getByRole('link', { name: 'Add & open Shelf', exact: true });
  const y = await leaveFrom(page, link);
  await expect(page.locator('#shelf')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Back to What can I make?' })).toBeFocused();
  await returnTo(page, 'Back to What can I make?', link, y);
  expect(await study.locator('.pantry-shelf-item').allTextContents()).toEqual(selected);
  expect(await study.locator('.study-recipe-list').textContent()).toEqual(recipes);
  // A native forward/back round trip remains usable after the explicit action.
  await page.goForward();
  await expect(page.locator('#shelf')).toBeVisible();
  await page.goBack();
  await expect(study.locator('.home-study-toggle')).toHaveAttribute('aria-expanded', 'true');
  expect(await study.locator('.study-recipe-list').textContent()).toEqual(recipes);
});

test('Back skips destination filter entries after a fullscreen recipe, retaining the calorie comparison', async ({ page }) => {
  await openRoute(page, '/#/');
  const study = page.locator('#home-calories');
  await study.locator('.home-study-toggle').click();
  await study.getByLabel('Calorie sort', { exact: true }).selectOption('kcal');
  const row = study.locator('[data-calorie-drink="negroni"]:not(.swiper-slide[aria-hidden=true] *)');
  for (let i = 0; i < 5 && !(await row.count()); i++) {
    if (page.viewportSize()!.width <= 860) await swipePage(study.locator('.calorie-group:not(.swiper-slide[aria-hidden=true] *)'));
    else await study.getByRole('button', { name: 'Next calorie servings' }).click();
  }
  const position = await study.getByRole('navigation', { name: 'Calorie servings' }).textContent();
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
  await expect(study.getByLabel('Calorie sort', { exact: true })).toHaveValue('kcal');
  await expect(study.getByRole('navigation', { name: 'Calorie servings' })).toHaveText(position!);
  await expect(row.locator('.calorie-row')).toHaveAttribute('aria-expanded', 'true');
});

test('pairing recipe visits preserve selections and context', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openRoute(page, '/#/');
  const pair = page.locator('#home-pairings');
  await pair.locator('.home-study-toggle').click();
  await pair.getByLabel('First ingredient', { exact: true }).selectOption('gin');
  await pair.getByLabel('Second ingredient', { exact: true }).selectOption('lemon juice');
  await pair.getByRole('button', { name: 'View all 24 recipes', exact: true }).click();
  await pair.locator('.study-recipe-list button').first().click();
  const related = pair.getByRole('button', { name: /Open .* in full screen/ });
  await related.click();
  const reader = page.getByRole('dialog', { name: 'Aviation', exact: true });
  await expect(reader).toHaveAttribute('data-phase', 'open');
  await reader.getByRole('button', { name: 'Back to recipe', exact: true }).click();
  await expect(reader).toHaveCount(0);
  await expect(related).toBeFocused();
  await expect(pair.getByLabel('First ingredient', { exact: true })).toHaveValue('gin');
  await expect(pair.getByLabel('Second ingredient', { exact: true })).toHaveValue('lemon juice');
  await expect(pair.getByRole('button', { name: 'Hide recipes', exact: true })).toHaveAttribute('aria-expanded', 'true');
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
