import { expect, test } from '@playwright/test';
import { navigateTo, openRoute, seedStableDevice, useTasteMap } from './helpers';

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
test.beforeEach(async ({ page }) => { await seedStableDevice(page); });

test('typing exposes full results immediately; mapped coverage and the recipe reader share selection', async ({ page }) => {
  await openRoute(page, '/#/menu');
  await useTasteMap(page);
  await page.getByRole('textbox', { name: /^Search menu/ }).fill('sour');
  await expect(page.getByRole('button', { name: 'Search drinks', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.drink-search-summary')).toContainText('55 recipe matches · 1 on the Taste Map');
  await expect(page.locator('#menu-list .fc')).toHaveCount(12);
  await page.getByRole('button', { name: /See mapped matches/ }).click();
  await expect(page.locator('.taste-context')).toContainText('1 mapped classic · 54 more recipe matches');
  await expect(page.locator('.taste-node')).toHaveCount(1);
  await expect(page.locator('.drink-results .fc').first()).toBeVisible();
  await page.getByRole('group', { name: 'Choose from mapped drinks' }).getByRole('button', { name: /^Daiquiri/ }).click();
  const preview = page.locator('.taste-preview[data-recipe-id="11006"]');
  await expect(preview.locator('h2')).toBeFocused();
  await preview.getByRole('button', { name: 'Save to Your Tab', exact: true }).click();
  await preview.getByRole('button', { name: 'View recipe', exact: true }).click();
  const reader = page.getByRole('dialog', { name: 'Daiquiri', exact: true });
  await expect(reader).toHaveAttribute('data-phase', 'open');
  await page.goBack();
  await expect(reader).toHaveCount(0);
  await expect(preview.getByRole('button', { name: 'View recipe', exact: true })).toBeFocused();
  await navigateTo(page, 'Tab');
  await expect(page.locator('#tab-page .fc[data-recipe-id="11006"]')).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('textbox', { name: /^Search menu/ })).toHaveValue('sour');
  await expect(preview.getByRole('button', { name: 'Saved to Your Tab' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.taste-context')).toContainText('54 more recipe matches');
  // Every match remains browsable without leaving the map presentation.
  while (await page.locator('.drink-results').getByRole('button', { name: 'Show more', exact: true }).count()) {
    const count = await page.locator('.drink-results .fc').count();
    await page.locator('.drink-results').getByRole('button', { name: 'Show more', exact: true }).click();
    await expect(page.locator('.drink-results .fc')).not.toHaveCount(count);
  }
  await expect(page.locator('.drink-results .fc')).toHaveCount(55);
  const card = page.locator('.drink-results .fc[data-recipe-id="11006"]');
  await expect(card).toHaveClass(/taste-selected/);
  await card.getByRole('button', {name:'Preview Daiquiri on the Taste Map', exact:true}).click();
  await expect(preview.locator('h2')).toBeFocused();
  await expect(page.locator('.taste-context')).toHaveAttribute('data-context', 'matches');
});

test('unmapped search keeps its full results in the same view', async ({ page }) => {
  await openRoute(page, '/#/menu?q=Vesper');
  await expect(page.locator('.drink-search-summary')).toContainText('1 recipe match · 0 on the Taste Map');
  await page.getByRole('button', { name: /See mapped matches/ }).click();
  await expect(page.getByRole('heading', { name: 'These recipes aren’t on the Taste Map yet.' })).toBeVisible();
  await expect(page.locator('.drink-results .fc[data-recipe-id="17218"]')).toBeVisible();
  await expect(page.locator('.taste-node')).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: /^Search menu/ })).toHaveValue('Vesper');
  await page.getByRole('textbox', {name:/^Search menu/}).fill('not-a-drink');
  await expect(page.locator('.drink-search-summary')).toContainText('0 recipe matches');
  await page.getByRole('button', {name:/See mapped matches/}).click();
  await expect(page.getByRole('heading', {name:'No recipes match this search.',exact:true})).toBeVisible();
  await expect(page.locator('.drink-results .fc')).toHaveCount(0);
});

test('sour flavour is a deliberate choice and does not replace keyword results', async ({ page }) => {
  await openRoute(page, '/#/menu?q=sour');
  await page.getByRole('button', { name: 'Explore tart & citrusy drinks', exact: true }).click();
  await expect(page.locator('.taste-context')).toHaveAttribute('data-context', 'flavour');
  await expect(page.locator('.taste-context')).toContainText('separate from recipes matching “sour”');
  await expect(page.locator('.taste-pagination')).toContainText('6 classics');
  await expect(page.locator('.drink-results .fc').first()).toBeVisible();
  await expect(page.getByRole('textbox', { name: /^Search menu/ })).toHaveValue('sour');
  await page.getByRole('textbox', { name: /^Search menu/ }).fill('Negroni');
  await expect(page.getByRole('button', { name: 'Search drinks', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.drink-results .fc[data-recipe-id="11003"]')).toBeVisible();
});

test('a related collection keeps its starting drink while neighbours and comparison change', async ({ page }) => {
  await openRoute(page, '/#/menu?q=Negroni');
  await page.locator('.drink-results .fc[data-recipe-id="11003"]').getByRole('button', { name: 'More like Negroni', exact: true }).click();
  await expect(page.locator('.taste-anchor strong')).toHaveText('Negroni');
  await expect(page.locator('.taste-neighbours')).toContainText('swap gin for whiskey');
  await page.locator('.taste-collection').getByRole('button', { name: /^Boulevardier/ }).click();
  await expect(page.locator('.taste-preview h2')).toHaveText('Boulevardier');
  await expect(page.locator('.taste-comparison-note')).toContainText('Compared with Negroni');
  await expect(page.locator('.taste-anchor strong')).toHaveText('Negroni');
  await expect(page.getByRole('heading', { name: 'If you like Negroni…' })).toBeVisible();
  await page.locator('.taste-preview').getByRole('button', { name: 'Compare with another drink' }).click();
  await expect(page.locator('.taste-comparison')).toBeVisible();
  await navigateTo(page, 'Shelf');
  await page.goBack();
  await expect(page.locator('.taste-anchor strong')).toHaveText('Negroni');
  // Restore preview selection on Back rather than resetting to the anchor.
  await expect(page.locator('.taste-preview h2')).toHaveText('Boulevardier');
  await page.goBack();
  await expect(page.getByRole('button', { name:'Search drinks', exact:true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.drink-results .fc[data-recipe-id="11003"]').getByRole('button', {name:'More like Negroni', exact:true})).toBeFocused();
});

test('Shelf enters the map with availability and the missing ingredient visible', async ({ page }) => {
  await openRoute(page, '/#/bar');
  for (const ingredient of ['Gin', 'Campari']) {
    await page.getByRole('textbox', { name: 'Search ingredients' }).fill(ingredient);
    await page.getByRole('option', { name: new RegExp(`^${ingredient}\\b`) }).first().click();
  }
  await page.getByRole('button', { name: 'Explore these drinks', exact: true }).click();
  await expect(page.locator('.taste-context')).toHaveAttribute('data-context', 'shelf');
  await expect(page.locator('.taste-matching-list')).toContainText('Need sweet vermouth');
  const node = page.locator('.taste-node').filter({ hasText:'Negroni' });
  const position = await node.getAttribute('style');
  await node.click();
  await expect(page.locator('.taste-shelf-note')).toHaveText('You need sweet vermouth.');
  await page.goBack();
  await expect(page.locator('#shelf')).toBeVisible();
  await page.getByRole('textbox', { name: 'Search ingredients' }).fill('Sweet Vermouth');
  await page.getByRole('option', { name: /^Sweet Vermouth\b/ }).first().click();
  await page.getByRole('button', { name: 'Explore these drinks', exact: true }).click();
  await expect(node).toContainText('Can make');
  await expect(node).toHaveAttribute('style', position!);
});

test('related entry from a later group locates its anchor, and keyboard rows restore focus', async ({page}) => {
  await page.emulateMedia({reducedMotion:'reduce'});
  await openRoute(page, '/#/menu?q=Espresso%20Martini');
  await page.locator('.drink-results .fc[data-recipe-id="17212"]').getByRole('button', {name:'More like Espresso Martini', exact:true}).click();
  await expect(page.locator('.taste-node.selected')).toContainText('Espresso Martini');
  const row = page.getByRole('group', {name:'Choose from mapped drinks'}).getByRole('button', {name:/^Espresso Martini/});
  await row.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.taste-preview h2')).toBeFocused();
  await page.locator('.taste-preview').getByRole('button', {name:'Close drink preview', exact:true}).click();
  await expect(row).toBeFocused();
  await expect(page.locator('.taste-anchor strong')).toHaveText('Espresso Martini');
});

test('query, related collection and preview fit every requested width in both themes', async ({page}, info) => {
  test.setTimeout(90_000);
  await page.emulateMedia({reducedMotion:'reduce'});
  await openRoute(page, '/#/menu?q=Cosmopolitan');
  await page.locator('.drink-results .fc[data-recipe-id="17196"]').getByRole('button', {name:'More like Cosmopolitan', exact:true}).click();
  for (const width of [320,390,430,768,1024,1440,926]) {
    await page.setViewportSize({width, height:width===926?428:900});
    for (const theme of ['light','dark']) {
      if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('.house-theme').click();
      await page.evaluate(()=>document.fonts.ready);
      const layout = await page.evaluate(()=>{
        const selectors = '.drink-search-summary h2, .drink-results-heading h2, .taste-context h2, .taste-anchor strong, .taste-matching-list button, .taste-collection button, .fc-face-controls, .fb-foot';
        const clipped = [...document.querySelectorAll(selectors)].filter(el=>!el.closest('[hidden], [aria-hidden="true"]') && el.clientWidth && el.scrollWidth > el.clientWidth+2).map(el=>({text:el.textContent,class:el.className}));
        const buttons = [...document.querySelectorAll('.taste-anchor button, .taste-quick-flavours button, .taste-matching-list button, .drink-search-summary button')].filter(el=>!el.closest('[hidden]')).map(el=>{const b=el.getBoundingClientRect();return {label:el.textContent,width:b.width,height:b.height};});
        return {overflow:document.documentElement.scrollWidth-innerWidth,clipped,buttons};
      });
      expect(layout.overflow, JSON.stringify({width,theme})).toBeLessThanOrEqual(1);
      expect(layout.clipped).toEqual([]);
      for(const button of layout.buttons) {
        expect(button.width,button.label || '').toBeGreaterThanOrEqual(44);
        expect(button.height,button.label || '').toBeGreaterThanOrEqual(44);
      }
      if([390,1440].includes(width)) await page.screenshot({path:info.outputPath(`taste-collection-${width}-${theme}.png`)});
    }
  }
});
