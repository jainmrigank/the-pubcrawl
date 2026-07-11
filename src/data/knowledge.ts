/** Bar Basics content. The working vocabulary of mixing drinks. */

export interface KTerm {
  id: string;
  term: string;
  def: string;
  icon: string; // ToolIcon / GlassIcon id
}

export interface KGroup {
  id: string;
  index: string;
  title: string;
  note: string;
  terms: KTerm[];
}

export const KNOWLEDGE: KGroup[] = [
  {
    id: 'technique',
    index: 'A',
    title: 'Technique',
    note: 'How a drink is put together',
    terms: [
      { id: 'shake', term: 'Shake', icon: 'shaker', def: 'Combine ingredients with ice in a shaker and shake hard for 10–15 seconds. Shaking chills, dilutes and aerates at once. Rule of thumb: shake anything with citrus, dairy or egg.' },
      { id: 'stir', term: 'Stir', icon: 'barspoon', def: 'Spin a barspoon around the inside wall of a mixing glass for about 30 seconds. Stirring chills and dilutes without clouding, keeping spirit-only drinks (Martini, Negroni, Old Fashioned) silky and clear.' },
      { id: 'muddle', term: 'Muddle', icon: 'muddler', def: 'Press herbs, fruit or sugar in the bottom of the glass to release oils and juice. Press mint gently, since bruised leaves turn bitter. Crush fruit and sugar firmly.' },
      { id: 'build', term: 'Build', icon: 'highball', def: 'Make the drink directly in its serving glass: ice first, then each ingredient in order, then a brief stir. The method behind every highball, from Gin & Tonic to Cuba Libre.' },
      { id: 'dryshake', term: 'Dry Shake', icon: 'shaker', def: 'Shake once without ice to whip egg white or aquafaba into foam, then shake again with ice to chill. The double pass gives sours their dense white crown.' },
      { id: 'strain', term: 'Strain & Double Strain', icon: 'strainer', def: 'Hold back ice and solids as you pour, using the shaker\'s Hawthorne strainer. Add a fine mesh strainer over the glass (a double strain) when pulp, herb flecks or ice shards would spoil a stemmed drink.' },
      { id: 'float', term: 'Float & Layer', icon: 'jigger', def: 'Pour slowly over the back of a barspoon so a lighter liquid rests on a heavier one. Density does the work: sugar-rich liqueurs sink, high-proof spirits float.' },
      { id: 'express', term: 'Express a Twist', icon: 'twist', def: 'Snap a coin of citrus peel skin-side down over the surface, misting the drink with aromatic oils, then wipe the rim and drop it in or discard. It is aroma seasoning, not decoration.' },
      { id: 'rinse', term: 'Rinse', icon: 'coupe', def: 'Coat the inside of a chilled glass with a few millilitres of a strong ingredient like absinthe or smoky whisky, then pour off the excess. The drink picks up the scent without the weight.' },
      { id: 'blend', term: 'Blend', icon: 'hurricane', def: 'Machine-blend with crushed ice for frozen drinks: Piña Colada, Frozen Daiquiri. Use less ice than you think, because over-blending waters the drink down fast.' },
    ],
  },
  {
    id: 'tools',
    index: 'B',
    title: 'Tools',
    note: 'The kit behind the bar',
    terms: [
      { id: 'shaker-tool', term: 'Shaker', icon: 'shaker', def: 'Two-part Boston (tin plus glass) or three-part cobbler with a built-in strainer. Either works. A Boston tin is faster to open and easier to clean at home.' },
      { id: 'jigger-tool', term: 'Jigger', icon: 'jigger', def: 'The double-cone measure that keeps drinks honest. Standard cups are 30/60 ml (1/2 oz). Free-pouring looks confident. Jiggering tastes better.' },
      { id: 'barspoon-tool', term: 'Barspoon', icon: 'barspoon', def: 'A long twisted-stem spoon for stirring, layering and reaching the bottom of a mixing glass. One barspoon also doubles as a measure: about 5 ml.' },
      { id: 'strainer-tool', term: 'Hawthorne & Julep Strainers', icon: 'strainer', def: 'The Hawthorne\'s spring grips the shaker tin and holds ice back. The perforated julep spoon does the same job for a mixing glass. A conical fine strainer catches everything else.' },
      { id: 'muddler-tool', term: 'Muddler', icon: 'muddler', def: 'A blunt pestle for pressing fruit, sugar and herbs. Flat-headed wood or steel. In a pinch, the handle end of a rolling pin does the job.' },
      { id: 'mixing-glass', term: 'Mixing Glass', icon: 'mixingglass', def: 'A heavy, wide glass for stirred drinks. The mass holds the cold, and the width lets the spoon travel. A pint glass works until you want the ritual.' },
      { id: 'press', term: 'Citrus Press', icon: 'citrus', def: 'Fresh juice is the single biggest upgrade in home mixing. Bottled juice oxidises within hours of pressing, so squeeze to order, always.' },
    ],
  },
  {
    id: 'glassware',
    index: 'C',
    title: 'Glassware',
    note: 'The right vessel changes the drink',
    terms: [
      { id: 'g-coupe', term: 'Coupe', icon: 'coupe', def: 'The shallow, stemmed saucer for anything served "up": shaken or stirred, no ice. It replaced the V-shaped martini glass behind most serious bars because it spills less and drinks better.' },
      { id: 'g-martini', term: 'Martini', icon: 'martini', def: 'The iconic V on a stem. The wide mouth throws aroma at you, and the stem keeps warm hands off a drink served with no ice to protect it.' },
      { id: 'g-highball', term: 'Highball / Collins', icon: 'highball', def: 'Tall and narrow to preserve carbonation, since bubbles have less surface to escape from. Home of the G&T, Mojito and every spirit-plus-soda serve.' },
      { id: 'g-rocks', term: 'Rocks / Old Fashioned', icon: 'rocks', def: 'Short, heavy-bottomed, built for drinks over a large cube: the Old Fashioned, Negroni, Sazerac. The weight is the point. It feels deliberate.' },
      { id: 'g-flute', term: 'Flute', icon: 'flute', def: 'Tall and slim to keep sparkling wine sparkling. Used for the French 75, Bellini and anything champagne-topped.' },
      { id: 'g-wine', term: 'Wine & Balloon', icon: 'wine', def: 'The large bowl suits spritzes and G&Ts served the Spanish way: lots of ice, lots of aroma, room for garnish.' },
      { id: 'g-shot', term: 'Shot', icon: 'shot', def: '30–60 ml, drunk in one. Also the vessel for layered pousse-café shooters, where liqueurs stack by density.' },
      { id: 'g-mug', term: 'Mug', icon: 'mug', def: 'Handled ceramic or glass for hot serves like Irish Coffee and the Hot Toddy, and hammered copper for the Moscow Mule, where the metal makes it colder faster.' },
      { id: 'g-hurricane', term: 'Hurricane', icon: 'hurricane', def: 'The curvy tall glass of tiki: Hurricanes, Piña Coladas, anything blended, crushed-ice heavy and unapologetic.' },
      { id: 'g-snifter', term: 'Snifter', icon: 'snifter', def: 'A short-stemmed balloon that funnels aroma to the nose. For brandy and barrel-aged spirits taken neat, cupped in the palm to warm.' },
    ],
  },
  {
    id: 'language',
    index: 'D',
    title: 'The Lingo',
    note: 'Terms worth knowing cold',
    terms: [
      {
        id: 'oz',
        term: 'What’s an Oz?',
        icon: 'jigger',
        def: `One ounce (oz) is 30 ml, the basic brick every recipe is built from. The pours you'll actually meet:
1 oz = 30 ml
¾ oz = 22.5 ml
½ oz = 15 ml
¼ oz = 7.5 ml
1 barspoon = 5 ml
1 dash ≈ 1 ml
1 "shot" = 45–60 ml, depending where you drink
A "splash" is a short, casual pour (5–10 ml). "Top up" means fill the rest of the glass with your mixer. "A part" is one unit of the ratio: any size you like, as long as every part matches.`,
      },
      { id: 'abv', term: 'ABV & Proof', icon: 'percent', def: 'Alcohol by volume: spirits sit around 40%, liqueurs 15–30%, vermouth 15–18%. "Proof" is simply double the ABV in the US system: 80 proof = 40%.' },
      { id: 'dash', term: 'Dash', icon: 'drop', def: 'The smallest working measure, roughly 0.8–1 ml: a firm flick from a bitters bottle. Two or three dashes season a drink the way salt seasons food.' },
      { id: 'measures', term: 'Ratios, Not Recipes', icon: 'ratio', def: 'Good recipes speak in ratios: 60 ml (2 oz) of base spirit, 30 ml (1 oz) of modifier, 15–25 ml of citrus or syrup. Learn a drink as a ratio and you can scale it to any glass, jug or party.' },
      { id: 'syrup', term: 'Simple Syrup', icon: 'drop', def: 'Equal parts sugar and hot water, stirred until clear. Keeps two weeks refrigerated. "Rich" syrup is 2:1 sugar to water: sweeter per millilitre, so use less.' },
      { id: 'bitters', term: 'Bitters', icon: 'drop', def: 'Intense botanical tinctures (Angostura, Peychaud\'s, orange) dosed by the dash. They bind sweet and strong flavours together. A Manhattan without bitters is just cold whiskey and vermouth.' },
      { id: 'vermouth', term: 'Vermouth', icon: 'wine', def: 'Wine fortified with spirit and infused with botanicals: dry (French, pale) or sweet (Italian, red). It is wine. Refrigerate after opening and use within a month.' },
      { id: 'dilution', term: 'Dilution', icon: 'cube', def: 'Melted ice is an ingredient: a properly shaken or stirred drink is 20–25% water. That water softens the alcohol and knits the flavours. A warm undiluted cocktail tastes harsh.' },
      { id: 'ice', term: 'Ice', icon: 'cube', def: 'Big cubes melt slowly for stirred drinks. Crushed ice melts fast for juleps and tiki. Cloudiness is trapped air and impurities, and directional freezing gives clear, slow ice.' },
      { id: 'garnish', term: 'Garnish', icon: 'leaf', def: 'Aroma first, looks second. A mint sprig or citrus twist sits at the nose and changes every sip. An olive or cherry adds a salt or sweet ending. If it does neither, leave it off.' },
      { id: 'neat', term: 'Neat / Up / On the Rocks', icon: 'rocks', def: 'Neat: straight from the bottle, room temperature, no ice. Up: chilled by shaking or stirring, served without ice in a stemmed glass. On the rocks: poured over ice.' },
      { id: 'drywet', term: 'Dry / Wet / Dirty / Perfect', icon: 'martini', def: 'Martini dialect. Dry means less vermouth, wet means more. Dirty adds olive brine. Perfect splits the vermouth half dry, half sweet.' },
      { id: 'sour', term: 'The Sour Template', icon: 'ratio', def: '2 parts spirit, 1 part citrus, 1 part sweet: the skeleton of the Daiquiri, Whiskey Sour, Margarita and Gimlet. Master one and you have learned fifty drinks.' },
      { id: 'highball-ratio', term: 'The Highball Ratio', icon: 'highball', def: '1 part spirit to 2–3 parts cold carbonated mixer, built over plenty of ice, stirred once. Precision matters more than it looks: flat, warm or over-poured highballs fail.' },
      { id: 'zeroproof', term: 'Zero-Proof', icon: 'leaf', def: 'Cocktails without alcohol, built on tea, verjus, bitters-and-soda or distilled non-alcoholic spirits. Balance still rules: acid, sweetness and dilution all behave the same.' },
    ],
  },
  {
    id: 'starter',
    index: 'E',
    title: 'The Starter Shelf',
    note: 'Stock this and most of the menu opens up',
    terms: [
      { id: 's-vodka', term: 'Vodka', icon: 'bottle', def: 'A clean, neutral base that lets everything else speak. Unlocks the Moscow Mule, Cosmopolitan, Espresso Martini and Bloody Mary.' },
      { id: 's-gin', term: 'Gin (London Dry)', icon: 'bottle', def: 'The workhorse of the shelf: juniper, citrus, spine. Unlocks the Gin & Tonic, Martini, Negroni, Tom Collins and Gimlet.' },
      { id: 's-rum', term: 'White & Dark Rum', icon: 'bottle', def: 'White rum for bright, citrusy drinks and dark for depth and warmth. Together they unlock the Daiquiri, Mojito, Cuba Libre, Mai Tai and Dark \'n\' Stormy.' },
      { id: 's-tequila', term: 'Tequila (Blanco)', icon: 'bottle', def: 'The unaged mixing grade: agave, pepper, bite. Unlocks the Margarita, Paloma and Tequila Sunrise.' },
      { id: 's-whiskey', term: 'Bourbon or Rye', icon: 'bottle', def: 'One good mid-shelf bottle covers the brown-spirit classics. Unlocks the Old Fashioned, Whiskey Sour, Manhattan and the Highball.' },
      { id: 's-orange', term: 'Orange Liqueur', icon: 'bottle', def: 'Triple sec or Cointreau, the great connector between spirit and citrus. Unlocks the Margarita, Cosmopolitan, Sidecar and Long Island Iced Tea.' },
      { id: 's-vermouth', term: 'Vermouth, Dry & Sweet', icon: 'wine', def: 'Buy small bottles and keep them in the fridge. Dry makes the Martini. Sweet makes the Manhattan and one third of a Negroni.' },
      { id: 's-aperitivo', term: 'Campari or Aperol', icon: 'bottle', def: 'The bittersweet red backbone of aperitivo hour. Unlocks the Negroni, the Spritz and the Americano.' },
      { id: 's-bitters', term: 'Angostura Bitters', icon: 'drop', def: 'One little bottle lasts a year and seasons half the classics: Old Fashioned, Manhattan, Champagne Cocktail and any drink that tastes almost right.' },
      { id: 's-citrus', term: 'Fresh Lemons & Limes', icon: 'citrus', def: 'The most-used ingredient in cocktails after ice. Grab a few of each with every shop. Bottled juice is always a downgrade.' },
      { id: 's-syrup', term: 'Sugar & Simple Syrup', icon: 'drop', def: 'Balance in a bottle: stir equal parts sugar and hot water, keep it chilled. Every sour on the menu needs it.' },
      { id: 's-mixers', term: 'Cold Mixers', icon: 'highball', def: 'Club soda, tonic, ginger beer and cola, always refrigerated. A flat or warm mixer sinks a highball before it starts.' },
      { id: 's-mint', term: 'Fresh Mint', icon: 'leaf', def: 'One supermarket pot covers the Mojito and the Julep, and turns a garnish from decoration into aroma.' },
      { id: 's-egg', term: 'Egg White (Optional)', icon: 'egg', def: 'One white gives sours their silky foam crown. Aquafaba from a chickpea tin does the same job for a vegan shelf.' },
    ],
  },
];
