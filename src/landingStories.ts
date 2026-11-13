export const menuLink = (name: string) => '#/menu?q=' + encodeURIComponent(name);
export const rankingYears = [2024, 2025, 2026] as const;
export const cocktailRankings = [
  { name: 'Negroni', ranks: [1, 1, 1] },
  { name: 'Margarita', ranks: [3, 3, 2] },
  { name: 'Old Fashioned', ranks: [2, 2, 3] },
  { name: 'Dry Martini', ranks: [7, 7, 4] },
  { name: 'Espresso Martini', ranks: [4, 4, 5] },
];
export const rankingSources = rankingYears.map((year) => ({
  label: String(year),
  url: 'https://drinksint.com/the-bestselling-classic-cocktails-at-the-worlds-best-bars-' + year + '/',
}));
export const recipeProportions = [
  { name: 'Negroni', glass: 'rocks', garnish: 'peel', ingredients: [['Gin', 30], ['Campari', 30], ['Sweet vermouth', 30]], finish: 'Ice · orange slice', source: 'negroni' },
  { name: 'Margarita', glass: 'coupe', garnish: 'salt', ingredients: [['Tequila', 50], ['Triple sec', 20], ['Lime juice', 15]], finish: 'Shaken with ice · optional salt rim', source: 'margarita' },
  { name: 'Cosmopolitan', glass: 'coupe', garnish: 'peel', ingredients: [['Citron vodka', 40], ['Cointreau', 15], ['Lime juice', 15], ['Cranberry juice', 30]], finish: 'Shaken with ice · lemon twist', source: 'cosmopolitan' },
] as const;
export const filmDrinks = [
  { film: 'Casablanca', year: 1942, drink: 'French 75', glass: 'flute', garnish: 'none', source: 'https://www.bfi.org.uk/lists/10-great-films-about-drinking', sourceLabel: 'BFI' },
  { film: 'Some Like It Hot', year: 1959, drink: 'Manhattan', glass: 'coupe', garnish: 'cherry', source: 'https://www.vogue.co.uk/arts-and-lifestyle/gallery/on-screen-cocktails', sourceLabel: 'Vogue' },
  { film: 'The Big Lebowski', year: 1998, drink: 'White Russian', glass: 'rocks', garnish: 'none', source: 'https://www.bfi.org.uk/lists/10-great-films-about-drinking', sourceLabel: 'BFI' },
  { film: 'Casino Royale', year: 2006, drink: 'Vesper', glass: 'coupe', garnish: 'peel', source: 'https://www.007.com/the-films/casino-royale/', sourceLabel: '007' },
] as const;
