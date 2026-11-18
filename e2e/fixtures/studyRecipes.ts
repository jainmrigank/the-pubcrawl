import type { Locator } from '@playwright/test';

export const finderIngredients = ['Gin', 'Campari', 'Sweet Vermouth', 'Ice', 'Orange', 'Lemon Juice'];
export async function addFinderIngredients(study: Locator, names = finderIngredients) {
  for (const name of names) {
    await study.getByRole('textbox', { name: 'Add an ingredient', exact: true }).fill(name);
    await study.getByRole('option', { name: new RegExp('^' + name + '(?:\\s|$)', 'i') }).first().click();
  }
}
