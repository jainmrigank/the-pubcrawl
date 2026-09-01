import { test, expect } from '@playwright/test';
import { openRoute, seedStableDevice } from './helpers';

test.describe('Bar shelf flow', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test.beforeEach(async ({ page }) => {
    await seedStableDevice(page);
  });

  test('shows one shelf-to-cards flow and keeps filters secondary', async ({ page }) => {
    await openRoute(page, '/#/bar');
    const shelf = page.locator('#shelf');
    await expect(shelf).toContainText('YOUR SHELF');
    await expect(page.getByRole('button', { name: /INVENT A DRINK/ })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'FILTER RESULTS' })).toHaveCount(0);
    await expect(page.getByText('ADD SOMETHING TO YOUR SHELF')).toBeVisible();

    const ingredient = page.getByRole('textbox', { name: 'Search ingredients' });
    await ingredient.fill('gin');
    await expect(page.locator('.ta-drop [role="option"]').first()).toBeVisible();
    await page.locator('.ta-drop [role="option"]').first().click();

    await expect(page.locator('.pantry')).toContainText(/ON THE SHELF/);
    await expect(page.locator('.shelf-results-grid')).toBeVisible();
    await expect(page.getByRole('button', { name: /INVENT A DRINK/ })).toBeEnabled();
    await expect(page.getByText(/SO CLOSE|READY|ONE BOTTLE SHORT/)).toHaveCount(0);

    const order = await page.evaluate(() => {
      const grid = document.querySelector('.shelf-results-grid');
      const filters = document.querySelector('.shelf-filter-toggle');
      return Boolean(grid && filters && (filters.compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_FOLLOWING));
    });
    expect(order).toBe(true);
  });

  test('keeps the focused generated card accessible after invention', async ({ page }) => {
    await page.route('**/api/generate', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'ai-test-generated',
          name: 'Gin Test Pour',
          tagline: 'A quick house invention',
          vibe: 'boozy',
          ingredients: [{ name: 'Gin', measure: '45 ml' }],
          instructions: 'Stir with ice and strain.',
          glass: 'Coupe',
          garnish: 'Lemon twist',
          alcoholic: 'Alcoholic',
          thumb: '',
          video: '',
          source: 'ai',
        }),
      });
    });
    await openRoute(page, '/#/bar');
    const ingredient = page.getByRole('textbox', { name: 'Search ingredients' });
    await ingredient.fill('gin');
    await page.locator('.ta-drop [role="option"]').first().click();
    const invent = page.getByRole('button', { name: /INVENT A DRINK/ });
    await invent.click();
    await expect(invent).toBeEnabled({ timeout: 20_000 });
    const focusedHeading = page.locator('[data-recipe-heading]:focus');
    await expect(focusedHeading).toHaveCount(1);
  });
});
