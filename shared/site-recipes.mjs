export const featuredRecipeSlug = 'whiskey-sour';

// Pubcrawl house measures and method copy. Photo credits are rendered from the
// source ledger. The catalogue IDs connect these pages to the Drinks app.
export const siteRecipes = [
  {
    slug: 'whiskey-sour', id: '11004', name: 'Whiskey Sour', type: 'Classic cocktail', time: 5,
    description: 'Bourbon, fresh lemon and a little syrup. Shake it cold, then serve it on fresh ice.',
    ingredients: [['Bourbon', 60, 'ml'], ['Lemon juice', 30, 'ml'], ['Sugar syrup (1:1)', 20, 'ml']],
    steps: ['Add the bourbon, lemon juice and syrup to a shaker. Fill with ice.', 'Shake until the tin feels cold, then strain over fresh ice in a rocks glass.'],
    note: 'This version has no egg. Start with slightly less syrup if you like a drier sour.',
  },
  {
    slug: 'daiquiri', id: '11006', name: 'Daiquiri', type: 'Classic cocktail', time: 5,
    description: 'A shaken white-rum sour with fresh lime, served straight up.',
    ingredients: [['White rum', 60, 'ml'], ['Lime juice', 25, 'ml'], ['Sugar syrup (1:1)', 15, 'ml']],
    steps: ['Chill a coupe. Add the rum, lime and syrup to a shaker packed with ice.', 'Shake briskly and fine-strain into the cold glass.'],
    note: 'Use fresh lime and measure the syrup before adding ice.',
  },
  {
    slug: 'margarita', id: '11007', name: 'Margarita', type: 'Classic cocktail', time: 5,
    description: 'Blanco tequila, orange liqueur and lime, with a half rim of salt.',
    ingredients: [['Blanco tequila', 50, 'ml'], ['Orange liqueur', 25, 'ml'], ['Lime juice', 25, 'ml'], ['Fine salt', 1, 'pinch']],
    steps: ['Moisten half the rim with lime and dip it in fine salt.', 'Shake the tequila, liqueur and juice with ice. Strain into the prepared glass.'],
    note: 'A half rim lets each guest choose how much salt they want.',
  },
  {
    slug: 'mojito', id: '11000', name: 'Mojito', type: 'Classic cocktail', time: 5,
    description: 'A tall white-rum drink with lime, mint and soda.',
    ingredients: [['White rum', 50, 'ml'], ['Lime juice', 25, 'ml'], ['Sugar syrup (1:1)', 15, 'ml'], ['Mint', 8, 'leaves'], ['Soda water', 60, 'ml']],
    steps: ['Gently press the mint once or twice in a tall glass with the syrup.', 'Add rum, lime and ice. Top with cold soda and lift the mix once from the bottom with a spoon.'],
    note: 'Press the mint lightly to release its aroma without tearing it up.',
  },
  {
    slug: 'negroni', id: '11003', name: 'Negroni', type: 'Classic cocktail', time: 4,
    description: 'Equal measures of gin, red bitter aperitif and sweet vermouth.',
    ingredients: [['London dry gin', 30, 'ml'], ['Red bitter aperitif', 30, 'ml'], ['Sweet vermouth', 30, 'ml'], ['Orange peel', 1, 'strip']],
    steps: ['Add the three liquids to a mixing glass half filled with ice.', 'Stir until cold, strain over a large cube and express the orange peel over the drink.'],
    note: 'Keep opened sweet vermouth refrigerated.',
  },
  {
    slug: 'old-fashioned', id: '11001', name: 'Old Fashioned', type: 'Classic cocktail', time: 4,
    description: 'Whiskey stirred with sugar and aromatic bitters, finished with orange peel.',
    ingredients: [['Bourbon or rye', 60, 'ml'], ['Sugar syrup (1:1)', 5, 'ml'], ['Aromatic bitters', 2, 'dashes'], ['Orange peel', 1, 'strip']],
    steps: ['Stir whiskey, syrup and bitters over ice until well chilled.', 'Strain over a large cube. Squeeze the peel over the glass and slip it in.'],
    note: 'Start at the listed syrup measure and adjust for the whiskey you use.',
  },
  {
    slug: 'espresso-martini', id: '17212', name: 'Espresso Martini', type: 'Classic cocktail', time: 7,
    description: 'Vodka and coffee liqueur shaken hard with espresso for a fine layer of foam.',
    ingredients: [['Vodka', 45, 'ml'], ['Coffee liqueur', 25, 'ml'], ['Espresso', 30, 'ml'], ['Sugar syrup (1:1)', 5, 'ml']],
    steps: ['Brew the espresso and let it cool briefly while you chill the glass.', 'Shake all four ingredients firmly with plenty of ice and fine-strain into the glass.'],
    note: 'Some coffee liqueurs are quite sweet. Taste the mix with and without the syrup.',
  },
  {
    slug: 'irish-coffee', id: '13971', name: 'Irish Coffee', type: 'Classic cocktail', time: 7,
    description: 'Hot coffee and Irish whiskey with a cold layer of lightly whipped cream.',
    ingredients: [['Irish whiskey', 45, 'ml'], ['Hot filter coffee', 100, 'ml'], ['Demerara sugar', 10, 'g'], ['Cream', 30, 'ml']],
    steps: ['Warm a heatproof glass. Stir the sugar into hot coffee, then add the whiskey.', 'Whip the cream just until pourable. Pour slowly over the back of a spoon and serve.'],
    note: 'The cream should still move when you tilt the jug.',
  },
  {
    slug: 'shikanji', id: 'x-shikanji', name: 'Nimbu Shikanji', type: 'Zero-proof', time: 5,
    description: 'A Delhi summer staple with fresh lime, black salt and roasted cumin.',
    ingredients: [['Lime juice', 25, 'ml'], ['Sugar syrup (1:1)', 20, 'ml'], ['Chilled water', 130, 'ml'], ['Black salt', 1, 'pinch'], ['Roasted cumin powder', 1, 'pinch']],
    steps: ['Stir the lime, syrup, black salt and cumin together until the salt dissolves.', 'Add cold water and ice. Taste and adjust the salt one pinch at a time.'],
    note: 'For a party, mix the base first and add water and ice at service.',
  },
  {
    slug: 'masala-chaas', id: 'x-chaas', name: 'Masala Chaas', type: 'Zero-proof', time: 5,
    description: 'A cold curd cooler with roasted cumin, mint and a little black salt.',
    ingredients: [['Plain curd', 75, 'g'], ['Chilled water', 100, 'ml'], ['Roasted cumin powder', 1, 'pinch'], ['Black salt', 1, 'pinch'], ['Mint', 2, 'leaves']],
    steps: ['Whisk the curd until smooth. Pour in chilled water as you whisk.', 'Stir in the cumin, black salt and torn mint. Serve cold.'],
    note: 'Contains dairy. Keep it refrigerated and stir again before service.',
  },
];

export const siteRecipePath = (id) => {
  const match = siteRecipes.find(recipe => recipe.id === id);
  return match ? '/recipes/' + match.slug + '/' : null;
};

export const exactRecipePath = (id) => siteRecipePath(id) || '/#/menu?recipe=' + encodeURIComponent(id);
