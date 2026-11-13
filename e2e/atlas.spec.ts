import { test, expect } from '@playwright/test';
import { seedStableDevice } from './helpers';
const ids = [
  'beer',
  'scotch',
  'wine',
  'drinkers',
  'rankings',
  'dna',
  'constellation',
  'pairings',
  'pantry',
  'flows',
  'dilution',
  'units',
  'sugar',
  'ages',
  'blend',
  'history',
  'screen',
  'agave',
  'chemistry',
  'bottles',
];
test.beforeEach(async ({ page }) => {
  await seedStableDevice(page);
});
test('all twenty stories render, expose a readable data view and explain their sources', async ({
  page,
}) => {
  // Twenty separate chart/data/source interactions are slower in emulated WebKit.
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/#/atlas');
  const atlas = page.locator('.bar-atlas');
  await expect(atlas.getByRole('heading', { level: 1 })).toHaveText(
    'Small talk.Big picture.'
  );
  for (const id of ids) {
    await atlas.getByLabel('Choose a visual story').selectOption(id);
    const stage = atlas.locator(`[data-story="${id}"]`);
    await expect(stage).toBeVisible();
    await stage.locator('.atlas-data > summary').click();
    await expect(stage.locator('tbody tr').first()).toBeVisible();
    await atlas.locator('.atlas-sources > summary').click();
    await expect(atlas.locator('.atlas-sources > p').first()).not.toBeEmpty();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 1
      )
    ).toBe(false);
  }
  expect(errors).toEqual([]);
  await expect(atlas.locator('.atlas-index-grid a')).toHaveCount(20);
});
test('recipe analyses, dilution and blend controls change real results and survive a Menu round trip', async ({
  page,
}) => {
  await page.goto('/#/atlas?story=dilution');
  const atlas = page.locator('.bar-atlas');
  await expect(atlas.locator('.atlas-insight-number')).toContainText('20.3');
  await atlas.getByRole('slider', { name: 'Meltwater added' }).press('Home');
  await expect(atlas.locator('.atlas-insight-number')).toContainText('27');
  await atlas.getByRole('slider', { name: 'Meltwater added' }).press('End');
  await expect(atlas.locator('.atlas-insight-number')).toContainText('13.5');
  await page.getByRole('link', { name: 'Just here for a drink? ↗' }).click();
  await expect(page).toHaveURL(/#\/menu/);
  await page.goBack();
  await expect(
    atlas.getByRole('slider', { name: 'Meltwater added' })
  ).toHaveValue('90');
  await atlas.getByLabel('Choose a visual story').selectOption('blend');
  await atlas
    .getByRole('slider', { name: '8-year cask · relative parts' })
    .press('Home');
  await expect(atlas.locator('.atlas-blend-label > strong')).toContainText(
    '12'
  );
  await atlas
    .getByRole('slider', { name: '12-year cask · relative parts' })
    .press('Home');
  await expect(atlas.locator('.atlas-blend-label > strong')).toContainText(
    '20'
  );
  await atlas
    .getByRole('slider', { name: '20-year cask · relative parts' })
    .press('Home');
  await expect(atlas.locator('.atlas-blend-label > strong')).toContainText(
    'Empty blend'
  );
  await atlas.getByLabel('Choose a visual story').selectOption('pantry');
  await atlas.getByRole('button', { name: 'Clear shelf', exact: true }).click();
  await expect(
    atlas.locator('.atlas-universe-group.group-0 > strong')
  ).toContainText('0');
  await expect(
    atlas.locator('.atlas-pantry-shelf [aria-pressed="true"]')
  ).toHaveCount(0);
  await atlas.getByLabel('Choose a visual story').selectOption('pairings');
  await atlas
    .getByLabel('First ingredient', { exact: true })
    .selectOption('gin');
  await atlas
    .getByLabel('Second ingredient', { exact: true })
    .selectOption('gin');
  const n = await atlas.locator('.atlas-pair-number').innerText();
  expect(n).toMatch(/^\d+/);
  await atlas
    .getByRole('button', { name: 'Shared / union · %', exact: true })
    .click();
  await expect(atlas.locator('.atlas-pair-number')).toContainText('100');
});
test('notes are searchable and chart links keep the selected drink context', async ({
  page,
}) => {
  await page.goto('/#/atlas?story=rankings');
  const atlas = page.locator('.bar-atlas');
  await atlas.getByRole('button', { name: 'Margarita', exact: true }).click();
  await expect(
    atlas.getByRole('link', { name: 'Meet the drink ↗' })
  ).toHaveAttribute('href', '#/menu?q=Margarita');
  await atlas.getByLabel('Choose a visual story').selectOption('dna');
  await atlas.getByRole('button', { name: /Naked and Famous/ }).click();
  await expect(
    atlas.getByRole('link', { name: 'Read the IBA method ↗' })
  ).toHaveAttribute(
    'href',
    'https://iba-world.com/iba-cocktail/naked-and-famous/'
  );
  await atlas.getByLabel('Choose a visual story').selectOption('screen');
  await atlas.getByLabel('Look closer at a work').selectOption('5');
  await expect(
    atlas.getByRole('link', { name: 'Read the drink’s story ↗' })
  ).toHaveAttribute('href', /^https:/);
  await atlas.getByLabel('Look closer at a work').selectOption('6');
  await expect(
    atlas.getByRole('link', { name: 'Follow the drink ↗' })
  ).toHaveAttribute('href', '#/menu?q=Pi%C3%B1a%20Colada');
  await atlas.locator('.atlas-library > summary').click();
  await atlas.getByRole('searchbox').fill('F170');
  await expect(atlas.locator('.atlas-note-list article')).toHaveCount(1);
  await expect(atlas.locator('.atlas-note-list')).toContainText('sulfite');
  await atlas.getByRole('searchbox').fill('an-unfindable-fact-xyz');
  await expect(atlas.locator('.atlas-note-list')).toContainText(
    'No matching notes'
  );
});
for (const width of [320, 390, 430, 768, 1024, 1440]) {
  test(`Atlas fits ${width}px in both themes with reduced motion`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width < 500 ? 844 : 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/#/atlas?story=flows');
    const atlas = page.locator('.bar-atlas');
    await expect(atlas.getByLabel('Follow a mood')).toBeVisible();
    for (const theme of ['dark', 'light']) {
      if (theme === 'light')
        await page
          .getByRole('button', { name: 'Switch to light theme', exact: true })
          .click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      for (const id of [
        'flows',
        'pairings',
        'dna',
        'units',
        'history',
        'bottles',
      ]) {
        await atlas.getByLabel('Choose a visual story').selectOption(id);
        await expect(atlas.locator(`[data-story="${id}"]`)).toBeVisible();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth + 1
          ),
          `${width}px ${theme} ${id} overflows`
        ).toBe(true);
      }
    }
  });
}
test('Atlas remains shelved and directly readable while landing media stays paused', async ({
  page,
}) => {
  await page.goto('/#/');
  await expect(page.locator('[data-home-story]')).toHaveCount(4);
  await expect(page.locator('.landing-atlas-entry')).toHaveCount(0);
  await expect(page.locator('.landing-watch-rail')).toHaveCount(0);
  await expect(page.locator('.landing-shorts-preview')).toHaveCount(0);
  await page.goto('/#/atlas');
  await expect(page.locator('.bar-atlas:not(.home-highlights)')).toBeVisible();
});

test.describe('Atlas in a short landscape phone', () => {
  test.use({
    viewport: { width: 926, height: 428 },
    isMobile: true,
    hasTouch: true,
  });
  test('keeps controls reachable above the fixed phone navigation', async ({
    page,
  }) => {
    await page.goto('/#/atlas?story=pantry');
    const atlas = page.locator('.bar-atlas');
    await atlas.getByLabel('Choose a visual story').selectOption('sugar');
    await atlas.getByRole('slider', { name: 'Sugar in the wine' }).press('End');
    await expect(atlas.locator('.atlas-inline-insight')).toContainText(
      '60 g/L'
    );
    await expect(page.locator('.house-mobile-links')).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1
      )
    ).toBe(true);
  });
});

test('ingredient connection controls narrow recipe links to the selected pair', async ({
  page,
}) => {
  await page.goto('/#/atlas?story=constellation');
  const atlas = page.locator('.bar-atlas');
  const notes = atlas.locator('.atlas-network-notes');
  await expect(
    notes.getByRole('link', { name: 'Alexander ↗', exact: true })
  ).toBeVisible();
  await atlas
    .getByRole('group', { name: 'Inspect an ingredient connection' })
    .getByRole('button', { name: /^Lemon Juice\s*24$/ })
    .click();
  await expect(notes.locator('.atlas-overline')).toHaveText(
    'Gin + Lemon Juice'
  );
  await expect(
    notes.getByRole('link', { name: 'Alexander ↗', exact: true })
  ).toHaveCount(0);
  await expect(
    notes.getByRole('link', { name: 'Aviation ↗', exact: true })
  ).toBeVisible();
  await notes
    .getByRole('button', { name: 'All Gin connections ↗', exact: true })
    .click();
  await expect(
    notes.getByRole('link', { name: 'Alexander ↗', exact: true })
  ).toBeVisible();
});
