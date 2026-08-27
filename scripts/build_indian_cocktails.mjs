/**
 * Build the evidence-led India cocktail collection.
 *
 * This is deliberately not a flavour x template generator. Each recipe is a
 * selected drink with a usable spec, a pantry-access tier, and named evidence.
 * Existing CocktailDB/house drinks are indexed into the India collection by id
 * so the catalogue does not acquire duplicate Mojitos, Negronis, and so on.
 *
 * Run: node scripts/build_indian_cocktails.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RESEARCH_DATE = '2026-08-27';

const SOURCES = {
  BT2025: {
    title: 'Business Today: Bacardi Cocktail Trends Report 2025, India findings',
    publisher: 'Business Today',
    kind: 'reported consumer survey',
    url: 'https://www.businesstoday.in/lifestyle/report/story/cocktail-culture-booms-in-india-bacardi-report-predicts-bold-flavours-premium-choices-ai-personalisation-in-2025-456720-2024-12-09',
    use: 'India preference data and the five reported go-to serves.',
  },
  WII2024: {
    title: 'What India Is Drinking 2024',
    publisher: '30BestBarsIndia',
    kind: 'bar-industry survey',
    url: 'https://30bestbarsindia.in/wp-content/uploads/2024/09/What-India-is-Drinking-2024.pdf',
    use: 'Classic-cocktail rankings from 116 leading Indian bars.',
  },
  WII2025: {
    title: 'What India Is Drinking 2025 findings',
    publisher: 'The Spirits Business',
    kind: 'bar-industry survey reporting',
    url: 'https://www.thespiritsbusiness.com/2025/12/which-whisky-is-the-most-popular-in-indias-bars/?edition=asia',
    use: 'Current category leaders including Picante, Negroni, Espresso Martini, Daiquiri and Old Fashioned.',
  },
  IPSOS2025: {
    title: 'Spirited Revelations: The Buzz in India Beverage Scene',
    publisher: 'Ipsos India',
    kind: 'market research',
    url: 'https://www.ipsos.com/sites/default/files/ct/publication/documents/2025-05/Spirited%20Revelations%20-%20The%20Buzz%20in%20India%26%23039%3Bs%20Beverage%20Scene_0.pdf',
    use: 'On-premise mix, youth behaviour, local craft spirits, RTDs and low/no alcohol.',
  },
  MC2026: {
    title: 'How the craft cocktails story is maturing in India',
    publisher: 'Moneycontrol',
    kind: 'reported industry feature',
    url: 'https://www.moneycontrol.com/lifestyle/food/mixing-business-and-pleasure-how-the-craft-cocktails-story-is-maturing-in-india-article-13949690.html',
    use: 'Simple highballs, Gen Z moderation, Picante ubiquity and zero-proof context.',
  },
  PICANTE: {
    title: 'Why India cannot get enough of the Picante',
    publisher: 'Mint Lounge',
    kind: 'reported trend feature',
    url: 'https://www.livemint.com/mint-lounge/food/picante-cocktail-trend-india-2024-111713979631757.html',
    use: 'Nationwide Picante demand, bar sales and common recipe structure.',
  },
  MINT_HOME: {
    title: 'How to make pro-level cocktails at home',
    publisher: 'Mint Lounge',
    kind: 'bartender recipes',
    url: 'https://www.livemint.com/mint-lounge/ideas/how-to-make-pro-level-cocktails-to-raise-the-bar-at-home-111624034449219.html',
    use: 'Published Balle Balle Bloody Mary, curry-leaf G and T and Espresso Martini specs.',
  },
  MADIRA: {
    title: 'Summer recipes from Madira',
    publisher: 'Mint Lounge',
    kind: 'book excerpt and recipes',
    url: 'https://www.livemint.com/mint-lounge/food/bars-cocktails-diy-madira-book-summer-recipes-11777612021719.html',
    use: 'Published Gondhoraj Gimlet, Toddy Cooler, Mango Daiquiri and Feni Coconut Cooler specs.',
  },
  HOMEGROWN: {
    title: 'How to make a cocktail with home-grown ingredients',
    publisher: 'Mint Lounge',
    kind: 'reported recipe feature',
    url: 'https://www.livemint.com/mint-lounge/food/how-to-make-a-cocktail-with-home-grown-ingredients-111638971514244.html',
    use: 'Kokum, amla, curry leaf, feni and Tambde Roza evidence.',
  },
  MAHUA_FENI: {
    title: 'Cocktails with mahua and feni',
    publisher: 'Mint Lounge',
    kind: 'reported recipe feature',
    url: 'https://www.livemint.com/mint-lounge/ideas/on-diwali-try-cocktails-with-mahua-and-feni-111605014757041.html',
    use: 'Mahua lemonade and feni with guava, tomato, spice and aerated mixers.',
  },
  HIGHBALL: {
    title: 'Where to find the best whisky highball in India',
    publisher: 'Mint Lounge',
    kind: 'reported bar feature',
    url: 'https://www.livemint.com/mint-lounge/food/where-to-find-the-best-whisky-highball-in-india-111683257046985.html',
    use: 'Whisky-soda as a durable Indian order and modern highball context.',
  },
  LOCAL2026: {
    title: 'The globalisation of cocktail culture and local innovation',
    publisher: 'Mint Lounge',
    kind: 'reported trend feature',
    url: 'https://www.livemint.com/mint-lounge/food/globalisation-of-cocktail-culture-local-innovation-bar-takeovers-11769255386243.html',
    use: 'Social video discovery, Picante and Old Fashioned momentum, and a move toward restraint.',
  },
  NDTV_GARDEN: {
    title: 'From garden to glass: local flavours are shaking up cocktails',
    publisher: 'NDTV Food',
    kind: 'bartender recipes and trend reporting',
    url: 'https://food.ndtv.com/food-drinks/from-garden-to-glass-how-local-flavours-are-shaking-up-cocktails-11600401',
    use: 'Published Southern Twist recipe and evidence for curry leaf, tamarind and regional ingredients.',
  },
  NDTV_VOGUE: {
    title: 'Indian cocktails in vogue',
    publisher: 'NDTV Food',
    kind: 'reported bar feature',
    url: 'https://food.ndtv.com/food-drinks/indian-cocktails-in-vogue-right-now-1774178',
    use: 'Aam panna, tamarind, kokum, chai, shikanji, jal-jeera, jamun, paan and spice trends.',
  },
  NDTV_SOUTH: {
    title: 'South Indian inspired cocktail recipes',
    publisher: 'NDTV Food',
    kind: 'bartender recipes',
    url: 'https://food.ndtv.com/food-drinks/4-south-indian-inspired-cocktail-recipes-to-beat-the-summer-heat-11281179',
    use: 'Published filter-kaapi Martini and regional menu direction.',
  },
  NDTV_CURRY_MARG: {
    title: 'DIY cocktail recipes with a South Indian twist',
    publisher: 'NDTV Food',
    kind: 'bartender recipes',
    url: 'https://food.ndtv.com/food-drinks/5-diy-cocktail-recipes-with-a-south-indian-twist-2723260',
    use: 'Published curry-leaf Margarita structure.',
  },
  NDTV_GUAVA: {
    title: 'Desi Masala Cocktail',
    publisher: 'NDTV Food',
    kind: 'recipe',
    url: 'https://food.ndtv.com/recipe-desi-masala-cocktail-135',
    use: 'Guava, spirit, chilli, salt and lemon combination.',
  },
  NDTV_ZERO: {
    title: 'Zero-proof cocktails that do not need alcohol',
    publisher: 'NDTV Food',
    kind: 'bartender recipes',
    url: 'https://food.ndtv.com/food-drinks/10-zero-proof-cocktails-that-prove-you-dont-need-alcohol-to-have-a-good-time-9523448',
    use: 'Indian zero-proof structures using kokum, saffron, coffee, turmeric, shrub and spice.',
  },
  CNT_ZERO: {
    title: 'Zero-proof summer drinks picked by mixologists',
    publisher: 'Condé Nast Traveller India',
    kind: 'bartender roundup',
    url: 'https://www.cntraveller.in/story/14-zero-proof-drinks-for-summer-as-picked-by-mixologists-and-experts/',
    use: 'India bar examples using Darjeeling tea, jamun, guava, lychee, rose, kombucha, kokum and coconut.',
  },
  SOMMELIER: {
    title: 'Cocktail classics get a local twist',
    publisher: 'Sommelier India',
    kind: 'reported bar feature',
    url: 'https://www.sommelierindia.com/cocktail-classics-get-a-local-twist/',
    use: 'Regional pantry and menu evidence for jamun, solkadhi, rasam, tea, feni and arrack.',
  },
  THEBAR: {
    title: 'Indian drinks and cocktail trends reshaping nightlife',
    publisher: 'The Bar India',
    kind: 'industry trend feature',
    url: 'https://www.thebar.com/en-in/articles/indian-drinks-and-the-cocktail-trends-that-reshaped-indian-nightlife',
    use: 'Kokum, gondhoraj, curry leaf, jaggery, tamarind, cold brew, cacao and clarified/fermented directions.',
  },
  FERMENT: {
    title: 'How fermentation is moving from the kitchen to the bar',
    publisher: 'Restaurant India',
    kind: 'industry feature',
    url: 'https://www.restaurantindia.in/article/how-fermentation-is-moving-from-the-kitchen-to-the-bar.16998',
    use: 'Kombucha, kanji, handia and toddy plus food-safety constraints.',
  },
  GUARDIAN: {
    title: 'Jeejeebhoy arrack cocktail recipe',
    publisher: 'The Guardian',
    kind: 'published bar recipe',
    url: 'https://www.theguardian.com/lifeandstyle/2014/nov/21/cocktail-arrack-jeejeebhoy-dishoom-recipe',
    use: 'Published arrack, coconut water, syrup and orange bitters spec.',
  },
  SIX_BROTHERS: {
    title: 'Mahua cocktail recipes',
    publisher: 'Six Brothers Mahura',
    kind: 'producer recipe',
    url: 'https://sixbrothers.com/blog/six-brothers-recipes-indian-cocktails-mahua',
    use: 'First-party Mahua Sour structure; treated as a producer source.',
  },
  YT_CURRY: {
    title: 'Curry Leaf Gin and Tonic',
    publisher: 'Times Food on YouTube',
    kind: 'recipe video',
    url: 'https://www.youtube.com/watch?v=l-cldHZbdwg',
    use: 'Direct video evidence for the curry-leaf G and T family.',
  },
  REDDIT_FAV: {
    title: 'Favourite cocktail discussion in r/ThirtiesIndia',
    publisher: 'Reddit',
    kind: 'anecdotal community thread',
    url: 'https://www.reddit.com/r/ThirtiesIndia/comments/1vculj0/tell_me_your_favorite_cocktail/',
    use: 'Discovery signal for Old Monk and Coke, G and T, Espresso Martini, Whisky Sour, Jägerbomb, LIIT and shandy.',
  },
  REDDIT_HOME: {
    title: 'Home cocktail discussion in r/india',
    publisher: 'Reddit',
    kind: 'anecdotal community thread',
    url: 'https://www.reddit.com/r/india/comments/cis6bt/',
    use: 'Discovery signal for simple rum/vodka/whisky highballs, ginger, sugarcane, cumin and filter coffee.',
  },
  REDDIT_GOA: {
    title: 'Favourite drinks from Goa discussion',
    publisher: 'Reddit',
    kind: 'anecdotal community thread',
    url: 'https://www.reddit.com/r/Goa/comments/1orj1z2/drop_your_favourite_drink_from_goa/',
    use: 'Local discovery signal for urrak with Limca, lime and split chilli.',
  },
  IBA: {
    title: 'Official cocktail list and recipes',
    publisher: 'International Bartenders Association',
    kind: 'official recipe standard',
    url: 'https://iba-world.com/cocktails/',
    use: 'Canonical specs for global classics where CocktailDB recipes were incomplete.',
  },
  GEN_ALPHA: {
    title: 'Generation Alpha definition',
    publisher: 'Cambridge Dictionary',
    kind: 'reference',
    url: 'https://dictionary.cambridge.org/us/dictionary/english/generation-alpha',
    use: 'Age-boundary check: this cohort is under legal drinking age in 2026.',
  },
  FSSAI_AGE: {
    title: 'Legal drinking age varies across Indian states',
    publisher: 'Food Safety and Standards Authority of India',
    kind: 'government media compilation',
    url: 'https://fssai.gov.in/upload/media/FSSAI_News_Alcholic_FNB_25_11_2019.pdf',
    use: 'Responsible-service context; local law must be checked.',
  },
};

const LANE_LABELS = {
  everyday: 'Everyday India',
  'modern-bar': 'Modern Indian Bar',
  regional: 'Regional and Cultural',
  'zero-proof': 'Zero-Proof and Gen Alpha Safe',
};

const TIER_LABELS = {
  1: 'Common household or standard restaurant-bar ingredients',
  2: 'Easy specialty purchase in larger Indian cities or simple prep',
  3: 'Regional, seasonal, licensed-source or specialist ingredient',
};

const I = (name, measure, optional = false) =>
  optional ? { name, measure, optional: true } : { name, measure };

function D(id, name, lane, tier, glass, vibe, tagline, ingredients, instructions, sourceIds, category = 'Cocktail') {
  return {
    id: 'x-in-' + String(id).padStart(3, '0'),
    name,
    tagline,
    category,
    alcoholic: lane === 'zero-proof' ? 'Non alcoholic' : 'Alcoholic',
    glass,
    instructions,
    thumb: '/images/india/x-in-' + String(id).padStart(3, '0') + '.webp',
    video: '',
    tags: ['India', LANE_LABELS[lane], 'Pantry Tier ' + tier],
    iba: '',
    vibeHint: vibe,
    browseable: true,
    india: { lane, pantryTier: tier, researchDate: RESEARCH_DATE },
    evidence: sourceIds,
    ingredients: ingredients.map((x) => I(...x)),
  };
}

const DRINKS = [
  D(1, 'Vodka Soda', 'everyday', 1, 'Highball glass', 'refreshing',
    'One spirit, cold soda, lime: the no-friction Indian bar order.',
    [['Vodka', '45 ml'], ['Soda Water', '120 ml'], ['Lime Wedge', '1']],
    'Fill a tall glass with ice. Add vodka and cold soda, stir once, and squeeze in the lime.',
    ['BT2025', 'MC2026']),
  D(2, 'Whisky & Cola', 'everyday', 1, 'Highball glass', 'party',
    'The familiar two-part serve found at house parties and restaurant tables.',
    [['Whisky', '45 ml'], ['Cola', '120 ml'], ['Lime Wedge', '1', true]],
    'Pour whisky over ice, top with cola, and give it one gentle stir. Add lime if wanted.',
    ['BT2025', 'MC2026', 'REDDIT_FAV']),
  D(3, 'Vodka Nimbu Soda', 'everyday', 1, 'Highball glass', 'refreshing',
    'Vodka lengthened with the sweet-salt-sour logic of nimbu pani.',
    [['Vodka', '45 ml'], ['Lemon Juice', '25 ml'], ['Sugar Syrup', '10 ml'], ['Black Salt', '1 pinch'], ['Soda Water', '120 ml']],
    'Add vodka, lemon, syrup and black salt to an ice-filled glass. Top with soda and stir well.',
    ['BT2025', 'NDTV_VOGUE', 'REDDIT_HOME']),
  D(4, 'Whisky Soda Highball', 'everyday', 1, 'Highball glass', 'refreshing',
    'India’s long-running whisky-and-soda order, built extra cold.',
    [['Whisky', '45 ml'], ['Soda Water', '120 ml'], ['Lemon Peel', '1', true]],
    'Pack a chilled highball with hard ice, add whisky, then pour soda slowly down the side. Stir once.',
    ['HIGHBALL', 'MC2026']),
  D(5, 'Rum & Limca Highball', 'everyday', 1, 'Highball glass', 'party',
    'Dark rum with the lemon-lime mixer common to Indian home bars.',
    [['Dark Rum', '45 ml'], ['Lemon-Lime Soda', '120 ml'], ['Lime Wedge', '1']],
    'Build over ice, squeeze the lime over the drink, and stir once.',
    ['BT2025', 'REDDIT_HOME', 'REDDIT_GOA']),
  D(6, 'Vodka Guava Masala', 'everyday', 1, 'Highball glass', 'tropical',
    'The roadside guava-and-masala flavour pattern in an easy long drink.',
    [['Vodka', '45 ml'], ['Guava Juice', '100 ml'], ['Lime Juice', '15 ml'], ['Chaat Masala', '1 pinch'], ['Black Salt', '1 pinch'], ['Green Chilli', '1 slit', true]],
    'Shake vodka, guava and lime with ice. Pour into an ice-filled glass and finish with masala, salt and optional chilli.',
    ['NDTV_GUAVA', 'REDDIT_HOME']),
  D(7, 'Adrak Whisky Highball', 'everyday', 1, 'Highball glass', 'cozy',
    'Whisky, ginger, honey and lemon in a lighter highball frame.',
    [['Whisky', '45 ml'], ['Fresh Ginger', '3 thin slices'], ['Lemon Juice', '15 ml'], ['Honey Syrup', '10 ml'], ['Soda Water', '100 ml']],
    'Muddle ginger gently with honey and lemon. Add whisky and ice, top with soda, and stir.',
    ['REDDIT_HOME', 'THEBAR']),

  D(8, 'Picante', 'modern-bar', 2, 'Old-fashioned glass', 'party',
    'The spicy tequila serve that has become a contemporary Indian-menu default.',
    [['Tequila', '50 ml'], ['Lime Juice', '25 ml'], ['Agave Syrup', '15 ml'], ['Coriander Leaves', '6'], ['Green Chilli', '2 thin slices']],
    'Muddle coriander and chilli lightly. Add tequila, lime, agave and ice; shake hard and double strain over fresh ice.',
    ['PICANTE', 'WII2025', 'MC2026']),
  D(9, 'Guava Picante', 'modern-bar', 2, 'Old-fashioned glass', 'tropical',
    'A fruit-forward Picante using the guava, chilli and salt combination India already loves.',
    [['Tequila', '45 ml'], ['Guava Puree', '40 ml'], ['Lime Juice', '20 ml'], ['Agave Syrup', '10 ml'], ['Green Chilli', '2 thin slices'], ['Black Salt', '1 pinch']],
    'Shake everything with ice and double strain over fresh ice. Add a restrained black-salt rim.',
    ['PICANTE', 'NDTV_GUAVA']),
  D(10, 'Southern Curry Leaf Picante', 'modern-bar', 2, 'Old-fashioned glass', 'party',
    'A published reposado, chilli and curry-leaf variation.',
    [['Reposado Tequila', '60 ml'], ['Honey Syrup', '15 ml'], ['Lime Juice', '20 ml'], ['Red Chilli', '1 small'], ['Curry Leaves', '8']],
    'Muddle chilli and curry leaves gently. Add the remaining ingredients and ice, shake, and double strain over fresh ice.',
    ['NDTV_GARDEN']),
  D(11, 'Cucumber Curry Leaf G&T', 'modern-bar', 2, 'Copa glass', 'refreshing',
    'A cooling G and T with familiar South Indian aromatics.',
    [['Gin', '60 ml'], ['Cucumber Juice', '30 ml'], ['Curry Leaves', '3'], ['Lime Wedge', '1'], ['Tonic Water', '120 ml']],
    'Slap the curry leaves and add them to an ice-filled glass with gin and cucumber. Top with tonic and squeeze in lime.',
    ['MINT_HOME', 'YT_CURRY']),
  D(12, 'Balle Balle Bloody Mary', 'modern-bar', 2, 'Highball glass', 'party',
    'A chaat-masala, chilli and coriander Bloody Mary published for Indian home bars.',
    [['Vodka', '60 ml'], ['Tomato Juice', '100 ml'], ['Lime Juice', '15 ml'], ['Tabasco', '3 dashes'], ['Worcestershire Sauce', '3 dashes'], ['Green Chilli', '1/2'], ['Coriander Leaves', '6'], ['Black Salt', '1 pinch'], ['Chaat Masala', '1 pinch'], ['Maggi Masala', '1 pinch', true]],
    'Muddle chilli and coriander lightly. Add everything with ice and roll between two glasses several times; strain over fresh ice.',
    ['MINT_HOME']),
  D(13, 'Filter Kaapi Martini', 'modern-bar', 2, 'Coupe', 'sweet',
    'A South Indian filter-coffee nightcap in the Espresso Martini family.',
    [['Irish Whisky', '60 ml'], ['Coffee Liqueur', '30 ml'], ['Filter Coffee', '30 ml']],
    'Use freshly brewed, cooled filter coffee. Shake all ingredients very hard with ice and double strain into a chilled coupe.',
    ['NDTV_SOUTH', 'REDDIT_HOME']),
  D(14, 'Imli Whisky Sour', 'modern-bar', 2, 'Coupe', 'boozy',
    'Whisky Sour structure sharpened with the sweet-sour pull of tamarind.',
    [['Whisky', '50 ml'], ['Tamarind Syrup', '20 ml'], ['Lime Juice', '20 ml'], ['Aquafaba', '20 ml', true]],
    'Dry shake first if using aquafaba. Add ice, shake hard, and double strain into a chilled coupe.',
    ['NDTV_VOGUE', 'NDTV_GARDEN', 'THEBAR']),
  D(15, 'Aam Panna Vodka Cooler', 'modern-bar', 1, 'Highball glass', 'refreshing',
    'The raw-mango summer cooler made bar-ready with vodka.',
    [['Vodka', '45 ml'], ['Prepared Aam Panna', '90 ml'], ['Soda Water', '60 ml'], ['Mint Leaves', '6'], ['Black Salt', '1 pinch']],
    'Add vodka and chilled aam panna to an ice-filled glass. Top with soda, stir, and garnish with slapped mint.',
    ['NDTV_VOGUE']),
  D(16, 'Kala Khatta Vodka Soda', 'modern-bar', 2, 'Highball glass', 'party',
    'Mumbai gola nostalgia, black salt and fizz.',
    [['Vodka', '45 ml'], ['Kala Khatta Syrup', '30 ml'], ['Lime Juice', '15 ml'], ['Soda Water', '90 ml'], ['Black Salt', '1 pinch']],
    'Build vodka, syrup and lime over ice. Add soda, stir, and finish with black salt.',
    ['NDTV_VOGUE']),
  D(17, 'Jal-Jeera G&T', 'modern-bar', 1, 'Copa glass', 'refreshing',
    'A savoury, cumin-led G and T that stays light and familiar.',
    [['Gin', '45 ml'], ['Prepared Jal-Jeera', '45 ml'], ['Tonic Water', '90 ml'], ['Mint Leaves', '4']],
    'Fill the glass with ice. Add gin and chilled jal-jeera, top with tonic, and stir once.',
    ['NDTV_VOGUE']),
  D(18, 'Mango Saffron Daiquiri', 'modern-bar', 2, 'Coupe', 'tropical',
    'Mango, aged rum and saffron in a compact daiquiri.',
    [['Aged Rum', '45 ml'], ['Mango Puree', '30 ml'], ['Lime Juice', '10 ml'], ['Saffron', '2 threads'], ['Jaggery Syrup', '5 ml', true]],
    'Shake hard with ice and double strain into a chilled coupe. Use the jaggery only if the mango needs sweetness.',
    ['MADIRA']),
  D(19, 'Curry Leaf Margarita', 'modern-bar', 2, 'Coupe', 'refreshing',
    'Pineapple and curry leaf brighten a Margarita base.',
    [['Tequila', '45 ml'], ['Lime Juice', '15 ml'], ['Pineapple Juice', '20 ml'], ['Curry Leaves', '8'], ['Agave Syrup', '10 ml'], ['Salt', '1 pinch']],
    'Muddle curry leaves gently, add the liquids and ice, shake, and double strain into a lightly salted chilled glass.',
    ['NDTV_CURRY_MARG']),
  D(20, 'Paan Martini', 'modern-bar', 2, 'Coupe', 'sweet',
    'Betel leaf and gulkand turn the after-dinner paan ritual into a short drink.',
    [['Vodka', '45 ml'], ['Gulkand Syrup', '15 ml'], ['Betel Leaves', '2'], ['Lime Juice', '10 ml'], ['Rose Water', '2 drops']],
    'Muddle the betel leaves gently with gulkand. Add vodka, lime, rose water and ice; shake and double strain.',
    ['NDTV_VOGUE']),
  D(21, 'Thandai Rum Flip', 'modern-bar', 2, 'Coupe', 'cozy',
    'A cannabis-free Holi thandai folded into a rich rum flip.',
    [['Dark Rum', '45 ml'], ['Prepared Bhang-Free Thandai', '90 ml'], ['Pasteurised Whole Egg', '1', true], ['Nutmeg', '1 pinch']],
    'Dry shake with the pasteurised egg if using, then shake with ice. Double strain and grate a little nutmeg over the top.',
    ['NDTV_VOGUE']),
  D(22, 'Kokum Gin Sour', 'modern-bar', 2, 'Coupe', 'refreshing',
    'Konkan kokum gives a gin sour colour, acid and a gentle tannic edge.',
    [['Gin', '50 ml'], ['Kokum Syrup', '25 ml'], ['Lime Juice', '15 ml'], ['Aquafaba', '20 ml', true]],
    'Dry shake if using aquafaba. Shake again with ice and double strain into a chilled coupe.',
    ['HOMEGROWN', 'THEBAR']),
  D(23, 'Jamun Gin Sour', 'modern-bar', 2, 'Coupe', 'refreshing',
    'Monsoon jamun, gin and black salt in a vivid sour.',
    [['Gin', '50 ml'], ['Jamun Puree', '30 ml'], ['Lime Juice', '20 ml'], ['Sugar Syrup', '10 ml'], ['Black Salt', '1 pinch'], ['Aquafaba', '20 ml', true]],
    'Dry shake if using aquafaba, then shake with ice and double strain. Taste the jamun before adding all the syrup.',
    ['NDTV_VOGUE', 'SOMMELIER', 'CNT_ZERO']),
  D(24, 'Khus Vodka Collins', 'modern-bar', 2, 'Collins glass', 'refreshing',
    'Cooling vetiver sharbat stretched into a crisp Collins.',
    [['Vodka', '45 ml'], ['Khus Syrup', '20 ml'], ['Lemon Juice', '20 ml'], ['Soda Water', '100 ml']],
    'Shake vodka, khus and lemon with ice. Strain into an ice-filled glass, top with soda, and stir.',
    ['NDTV_VOGUE']),
  D(25, 'Ganne Ka Ras Vodka Cooler', 'modern-bar', 2, 'Highball glass', 'refreshing',
    'Fresh sugarcane juice, cumin and lime with a clean vodka base.',
    [['Vodka', '45 ml'], ['Fresh Sugarcane Juice', '100 ml'], ['Lime Juice', '20 ml'], ['Roasted Cumin', '1 pinch'], ['Black Salt', '1 pinch']],
    'Shake briefly with ice and strain over fresh ice. Use only freshly pressed, hygienically handled juice and serve immediately.',
    ['NDTV_VOGUE', 'REDDIT_HOME']),
  D(26, 'Tulsi Gin Smash', 'modern-bar', 1, 'Old-fashioned glass', 'refreshing',
    'The garden-pot herb makes a natural Indian answer to a basil smash.',
    [['Gin', '50 ml'], ['Tulsi Leaves', '8'], ['Lemon Juice', '25 ml'], ['Sugar Syrup', '15 ml']],
    'Muddle tulsi very lightly, shake with the remaining ingredients and ice, and double strain over fresh ice.',
    ['NDTV_VOGUE']),
  D(27, 'Elaichi Jaggery Old Fashioned', 'modern-bar', 2, 'Old-fashioned glass', 'boozy',
    'Whisky, gur and smoky cardamom: Indian pantry, classic proportions.',
    [['Whisky', '60 ml'], ['Jaggery Syrup', '10 ml'], ['Black Cardamom', '1/2 pod'], ['Angostura Bitters', '2 dashes']],
    'Crack the cardamom without crushing it to powder. Stir everything over ice, strain onto a large cube, and remove the pod.',
    ['THEBAR']),
  D(28, 'Cold Brew Rum & Cacao', 'modern-bar', 2, 'Old-fashioned glass', 'boozy',
    'Dark rum, coffee and cacao for the less-sweet new-wave bar palate.',
    [['Dark Rum', '45 ml'], ['Cold Brew Coffee', '45 ml'], ['Jaggery Syrup', '10 ml'], ['Chocolate Bitters', '2 dashes']],
    'Shake briefly with ice and strain over one large cube. Reduce syrup if the cold brew is naturally sweet.',
    ['THEBAR', 'LOCAL2026']),
  D(29, 'Darjeeling Whisky Highball', 'modern-bar', 1, 'Highball glass', 'refreshing',
    'Whisky and tea lengthened into a fragrant, low-sugar highball.',
    [['Whisky', '45 ml'], ['Strong Darjeeling Tea', '90 ml'], ['Honey Syrup', '10 ml'], ['Lemon Juice', '15 ml'], ['Soda Water', '30 ml']],
    'Chill the brewed tea completely. Build everything over ice, top with soda, and stir once.',
    ['SOMMELIER', 'CNT_ZERO', 'LOCAL2026']),
  D(30, 'Rasam Mary', 'modern-bar', 2, 'Highball glass', 'party',
    'Tomato, pepper and prepared rasam make a savoury South Indian brunch drink.',
    [['Vodka', '45 ml'], ['Tomato Juice', '90 ml'], ['Prepared Rasam', '30 ml'], ['Lime Juice', '10 ml'], ['Worcestershire Sauce', '3 dashes'], ['Black Pepper', '1 pinch']],
    'Add all ingredients with ice and roll between two glasses until cold. Strain over fresh ice and adjust salt only after tasting the rasam.',
    ['SOMMELIER', 'NDTV_GARDEN']),
  D(31, 'Solkadhi Gin Cooler', 'modern-bar', 2, 'Highball glass', 'refreshing',
    'Kokum-coconut solkadhi becomes a creamy-tart coastal cooler.',
    [['Gin', '45 ml'], ['Prepared Solkadhi', '75 ml'], ['Coconut Water', '45 ml'], ['Lime Juice', '10 ml']],
    'Shake briefly with ice and strain over fresh ice. Use chilled, fresh solkadhi and serve immediately.',
    ['SOMMELIER']),
  D(32, 'Kanji Tequila Highball', 'modern-bar', 2, 'Highball glass', 'party',
    'Fermented carrot kanji brings savoury acidity to an agave highball.',
    [['Tequila', '45 ml'], ['Prepared Kanji', '75 ml'], ['Grapefruit Soda', '60 ml'], ['Black Salt', '1 pinch']],
    'Build over ice and stir gently. Use a refrigerated, cleanly fermented kanji batch; discard it if smell, mould or pressure seems abnormal.',
    ['FERMENT', 'THEBAR']),
  D(33, 'Kombucha Whisky Highball', 'modern-bar', 2, 'Highball glass', 'refreshing',
    'Bottled ginger kombucha supplies acid, fizz and fermentation complexity.',
    [['Whisky', '45 ml'], ['Ginger Kombucha', '120 ml'], ['Lemon Wedge', '1']],
    'Pour whisky over ice, top slowly with cold commercial kombucha, and squeeze in the lemon.',
    ['FERMENT', 'IPSOS2025', 'CNT_ZERO']),

  D(34, 'Urrak Lemonade & Chilli', 'regional', 3, 'Highball glass', 'refreshing',
    'Goa’s seasonal first-distil cashew spirit with Limca, lime and a split chilli.',
    [['Urrak', '60 ml'], ['Lemon-Lime Soda', '120 ml'], ['Lime Juice', '15 ml'], ['Green Chilli', '1 slit']],
    'Build over ice and stir once. Urrak strength varies: buy from a reliable licensed source and adjust the pour accordingly.',
    ['REDDIT_GOA']),
  D(35, 'Tambde Roza', 'regional', 3, 'Highball glass', 'refreshing',
    'Cashew feni and brindao-style kokum in a bright Goan long drink.',
    [['Feni', '45 ml'], ['Kokum Syrup', '25 ml'], ['Soda Water', '90 ml'], ['Lime Wedge', '1']],
    'Build over ice, top with soda and squeeze in lime. For a sweeter local-style version, replace half the soda with lemon-lime soda.',
    ['HOMEGROWN']),
  D(36, 'Feni Coconut Cooler', 'regional', 3, 'Highball glass', 'tropical',
    'A minimal no-shaker Goan serve that lets cashew feni stay visible.',
    [['Feni', '60 ml'], ['Coconut Water', '120 ml'], ['Lime Juice', '10 ml'], ['Salt', '1 pinch'], ['Mint Leaves', '4', true]],
    'Add everything to a chilled glass, stir, and serve without ice or over one large cube.',
    ['MADIRA']),
  D(37, 'Feni Guava Mary', 'regional', 3, 'Highball glass', 'party',
    'Goan feni meets guava, chilli sauce, citrus and black salt.',
    [['Feni', '45 ml'], ['Guava Juice', '100 ml'], ['Lime Juice', '15 ml'], ['Tabasco', '3 dashes'], ['Black Salt', '1 pinch']],
    'Roll all ingredients with ice between two glasses and strain over fresh ice.',
    ['MAHUA_FENI']),
  D(38, 'Mahua Lemonade Highball', 'regional', 3, 'Highball glass', 'refreshing',
    'Floral mahua spirit in the approachable lemonade-and-mint format.',
    [['Mahua Spirit', '45 ml'], ['Lemonade', '100 ml'], ['Tonic Water', '50 ml'], ['Mint Leaves', '6']],
    'Build over ice, top with tonic, and stir once. Use a licensed bottled mahua spirit, not unverified distillate.',
    ['MAHUA_FENI', 'IPSOS2025']),
  D(39, 'Mahua Sour', 'regional', 3, 'Coupe', 'boozy',
    'A producer-published sour that keeps mahua at the centre.',
    [['Mahua Spirit', '60 ml'], ['Lemon Juice', '30 ml'], ['Sugar Syrup', '15 ml'], ['Egg White', '20 ml', true]],
    'Dry shake if using egg white, then shake hard with ice and double strain into a chilled coupe.',
    ['SIX_BROTHERS']),
  D(40, 'Kerala Toddy Cooler', 'regional', 3, 'Highball glass', 'refreshing',
    'Fresh toddy, coconut, lime, pepper, cumin and curry leaf.',
    [['Fresh Toddy', '90 ml'], ['Coconut Water', '30 ml'], ['Sugar Syrup', '15 ml'], ['Lime Juice', '10 ml'], ['Black Pepper', '1 pinch'], ['Roasted Cumin', '1 pinch'], ['Curry Leaves', '4']],
    'Shake briefly with ice and strain over fresh ice. Toddy changes quickly: use only fresh product from a reliable licensed source and serve immediately.',
    ['MADIRA', 'FERMENT']),
  D(41, 'Arrack Coconut Old Fashioned', 'regional', 3, 'Old-fashioned glass', 'boozy',
    'Coconut water and bitters soften arrack without hiding it.',
    [['Arrack', '50 ml'], ['Coconut Water', '25 ml'], ['Sugar Syrup', '15 ml'], ['Orange Bitters', '3 dashes']],
    'Stir everything with ice until cold and strain over one large cube.',
    ['GUARDIAN']),

  D(42, 'Kokum Curry Leaf Spritzer', 'zero-proof', 2, 'Highball glass', 'refreshing',
    'Tart kokum, curry leaf and black salt in an adult zero-proof build.',
    [['Kokum Syrup', '30 ml'], ['Lime Juice', '15 ml'], ['Curry Leaves', '6'], ['Black Salt', '1 pinch'], ['Soda Water', '120 ml']],
    'Slap the curry leaves, add them with kokum and lime to an ice-filled glass, top with soda and stir.',
    ['NDTV_ZERO', 'CNT_ZERO']),
  D(43, 'Saffron Cardamom Fizz', 'zero-proof', 2, 'Highball glass', 'cozy',
    'Kesar and elaichi made bright rather than milky.',
    [['Saffron Water', '40 ml'], ['Cardamom Syrup', '15 ml'], ['Lemon Juice', '15 ml'], ['Soda Water', '120 ml']],
    'Make saffron water by steeping two threads in 40 ml hot water and chill it. Build everything over ice and stir.',
    ['NDTV_ZERO']),
  D(44, 'Fennel Cold Brew Tonic', 'zero-proof', 2, 'Highball glass', 'cozy',
    'Coffee bitterness, saunf and tonic give this alcohol-free drink real length.',
    [['Cold Brew Coffee', '75 ml'], ['Fennel Syrup', '15 ml'], ['Tonic Water', '90 ml'], ['Star Anise', '1', true]],
    'Build cold brew and fennel syrup over ice, top slowly with tonic, and garnish with star anise if wanted.',
    ['NDTV_ZERO']),
  D(45, 'Haldi Ginger Highball', 'zero-proof', 1, 'Highball glass', 'refreshing',
    'Turmeric, ginger, lime and soda with a dry pepper finish.',
    [['Turmeric Syrup', '15 ml'], ['Fresh Ginger Juice', '10 ml'], ['Lime Juice', '20 ml'], ['Soda Water', '120 ml'], ['Black Pepper', '1 pinch']],
    'Shake syrup, ginger and lime with ice, strain into an ice-filled glass, top with soda and add pepper.',
    ['NDTV_ZERO']),
  D(46, 'Anar Basil Shrub Soda', 'zero-proof', 2, 'Highball glass', 'refreshing',
    'A tart pomegranate shrub gives the complexity usually supplied by alcohol.',
    [['Pomegranate Shrub', '45 ml'], ['Basil Leaves', '6'], ['Soda Water', '120 ml']],
    'Slap the basil and add it with shrub to an ice-filled glass. Top with soda and stir.',
    ['NDTV_ZERO']),
  D(47, 'Kanji Spritz', 'zero-proof', 2, 'Wine glass', 'refreshing',
    'North Indian carrot kanji becomes a savoury fermented spritz.',
    [['Prepared Kanji', '90 ml'], ['Soda Water', '60 ml'], ['Orange Slice', '1']],
    'Build over ice and stir gently. Keep kanji refrigerated and discard any batch with mould, an off smell or abnormal pressure.',
    ['FERMENT', 'THEBAR']),
  D(48, 'Darjeeling Ginger Fizz', 'zero-proof', 1, 'Highball glass', 'refreshing',
    'Tea, honey, lime and ginger ale: familiar ingredients, grown-up balance.',
    [['Strong Darjeeling Tea', '90 ml'], ['Honey Syrup', '15 ml'], ['Lime Juice', '20 ml'], ['Ginger Ale', '60 ml']],
    'Chill the tea completely. Build tea, honey and lime over ice, top with ginger ale, and stir once.',
    ['CNT_ZERO', 'SOMMELIER']),
  D(49, 'Guava Chilli Fizz', 'zero-proof', 1, 'Highball glass', 'tropical',
    'Guava-cart flavour with chilli, salt, lime and a clean soda finish.',
    [['Guava Juice', '100 ml'], ['Lime Juice', '15 ml'], ['Soda Water', '60 ml'], ['Green Chilli', '1 thin slice'], ['Black Salt', '1 pinch']],
    'Shake guava, lime, chilli and salt with ice. Strain over fresh ice, top with soda, and stir.',
    ['NDTV_GUAVA', 'CNT_ZERO']),
  D(50, 'Jamun Apple Jalapeño Fizz', 'zero-proof', 2, 'Highball glass', 'party',
    'Jamun tartness, apple and a little green heat.',
    [['Jamun Puree', '30 ml'], ['Apple Juice', '60 ml'], ['Lime Juice', '15 ml'], ['Jalapeno', '1 thin slice'], ['Soda Water', '60 ml']],
    'Shake everything but soda with ice, double strain over fresh ice, top with soda, and stir.',
    ['CNT_ZERO']),
  D(51, 'Rose Lychee Tonic', 'zero-proof', 2, 'Copa glass', 'sweet',
    'Rose and lychee kept crisp with lime and tonic.',
    [['Lychee Juice', '75 ml'], ['Lime Juice', '15 ml'], ['Rose Water', '2 drops'], ['Tonic Water', '90 ml']],
    'Build over ice, top with tonic, and stir once. Rose water is potent; use drops, not a free pour.',
    ['CNT_ZERO']),
  D(52, 'Coconut Curry Leaf Fizz', 'zero-proof', 1, 'Highball glass', 'tropical',
    'Nariyal pani and curry leaf in a dry, coastal zero-proof cooler.',
    [['Coconut Water', '120 ml'], ['Lime Juice', '20 ml'], ['Sugar Syrup', '10 ml'], ['Curry Leaves', '6'], ['Soda Water', '30 ml']],
    'Slap the curry leaves, shake them with coconut water, lime, syrup and ice, strain over fresh ice, and top with soda.',
    ['CNT_ZERO', 'NDTV_GARDEN']),
];

const VIDEO_SEARCHES = {
  'x-in-001': 'vodka soda cocktail recipe',
  'x-in-002': 'whisky and coke cocktail recipe',
  'x-in-003': 'vodka lemon soda cocktail recipe',
  'x-in-004': 'whisky highball recipe',
  'x-in-005': 'rum lemon lime soda cocktail recipe',
  'x-in-006': 'guava vodka cocktail recipe',
  'x-in-007': 'ginger whisky highball recipe',
  'x-in-008': 'picante cocktail recipe',
  'x-in-009': 'guava picante cocktail recipe',
  'x-in-010': 'curry leaf picante cocktail recipe',
  'x-in-011': 'curry leaf gin tonic recipe',
  'x-in-012': 'spicy bloody mary Indian recipe',
  'x-in-013': 'filter coffee espresso martini recipe',
  'x-in-014': 'tamarind whisky sour recipe',
  'x-in-015': 'aam panna vodka cocktail recipe',
  'x-in-016': 'kala khatta vodka cocktail recipe',
  'x-in-017': 'jaljeera gin tonic cocktail recipe',
  'x-in-018': 'mango saffron daiquiri recipe',
  'x-in-019': 'curry leaf margarita recipe',
  'x-in-020': 'paan martini recipe',
  'x-in-021': 'thandai rum cocktail recipe',
  'x-in-022': 'kokum gin sour recipe',
  'x-in-023': 'jamun gin sour recipe',
  'x-in-024': 'khus vodka cocktail recipe',
  'x-in-025': 'sugarcane vodka cocktail recipe',
  'x-in-026': 'tulsi gin cocktail recipe',
  'x-in-027': 'jaggery old fashioned cocktail recipe',
  'x-in-028': 'rum cold brew coffee cocktail recipe',
  'x-in-029': 'Darjeeling tea whisky highball recipe',
  'x-in-030': 'rasam bloody mary cocktail recipe',
  'x-in-031': 'solkadhi gin cocktail recipe',
  'x-in-032': 'kanji tequila cocktail recipe',
  'x-in-033': 'kombucha whisky highball recipe',
  'x-in-034': 'urrak limca cocktail Goa',
  'x-in-035': 'feni kokum cocktail Goa',
  'x-in-036': 'feni coconut water cocktail recipe',
  'x-in-037': 'feni guava cocktail recipe',
  'x-in-038': 'mahua lemonade cocktail recipe',
  'x-in-039': 'mahua sour cocktail recipe',
  'x-in-040': 'toddy coconut cocktail Kerala recipe',
  'x-in-041': 'arrack coconut cocktail recipe',
  'x-in-042': 'kokum curry leaf mocktail recipe',
  'x-in-043': 'saffron cardamom mocktail recipe',
  'x-in-044': 'cold brew tonic mocktail recipe',
  'x-in-045': 'turmeric ginger mocktail highball recipe',
  'x-in-046': 'pomegranate basil shrub soda recipe',
  'x-in-047': 'kanji mocktail spritz recipe',
  'x-in-048': 'Darjeeling tea ginger mocktail recipe',
  'x-in-049': 'guava chilli mocktail recipe',
  'x-in-050': 'jamun apple mocktail recipe',
  'x-in-051': 'rose lychee mocktail recipe',
  'x-in-052': 'coconut curry leaf mocktail recipe',
};
for (const recipe of DRINKS) recipe.videoSearch = VIDEO_SEARCHES[recipe.id];

function E(id, lane, tier, tagline, sourceIds, overrides = {}) {
  return {
    id,
    tags: ['India', LANE_LABELS[lane], 'Pantry Tier ' + tier],
    tagline,
    browseable: true,
    india: { lane, pantryTier: tier, researchDate: RESEARCH_DATE },
    evidence: sourceIds,
    ...overrides,
  };
}

const EXISTING = [
  E('11000', 'modern-bar', 1, 'India’s enduring mint-and-rum crowd-pleaser.', ['BT2025', 'WII2024', 'IBA'], {
    ingredients: [I('White Rum', '45 ml'), I('Lime Juice', '20 ml'), I('Mint Leaves', '6'), I('Sugar', '2 tsp'), I('Soda Water', 'top up')],
    instructions: 'Stir lime and sugar in the glass, add mint and press very gently. Fill with crushed ice, add rum, top with soda, and lift once with a bar spoon.',
  }),
  E('17196', 'modern-bar', 2, 'The polished vodka classic that remains on leading Indian bar lists.', ['WII2024', 'IBA'], {
    ingredients: [I('Citron Vodka', '40 ml'), I('Cointreau', '15 ml'), I('Lime Juice', '15 ml'), I('Cranberry Juice', '30 ml')],
    instructions: 'Shake all ingredients hard with ice and double strain into a chilled coupe. Express orange peel over the surface if available.',
  }),
  E('11004', 'modern-bar', 1, 'A top whisky classic across Indian bars and drinker discussions.', ['WII2024', 'WII2025', 'REDDIT_FAV', 'IBA'], {
    ingredients: [I('Bourbon Whiskey', '45 ml'), I('Lemon Juice', '25 ml'), I('Sugar Syrup', '20 ml'), I('Pasteurised Egg White', '20 ml', true)],
    instructions: 'Dry shake first if using egg white, then shake hard with ice. Double strain into a chilled coupe or over fresh ice.',
  }),
  E('11003', 'modern-bar', 2, 'The bitter red gin classic now leading its category in Indian bars.', ['WII2024', 'WII2025', 'IBA'], {
    ingredients: [I('Gin', '30 ml'), I('Campari', '30 ml'), I('Sweet Vermouth', '30 ml')],
    instructions: 'Stir all ingredients with ice until chilled and diluted. Strain over one large cube and express an orange peel.',
  }),
  E('11007', 'modern-bar', 2, 'The evergreen agave classic beneath India’s Picante wave.', ['WII2024', 'WII2025', 'IBA'], {
    ingredients: [I('Tequila', '50 ml'), I('Triple Sec', '20 ml'), I('Lime Juice', '15 ml'), I('Salt', '1 pinch', true)],
    instructions: 'Shake the liquids with ice and double strain into a chilled coupe. If using salt, apply it only to half the outside rim.',
  }),
  E('17212', 'modern-bar', 2, 'The social-media-fuelled coffee cocktail that overtook the Cosmo in bar surveys.', ['WII2024', 'WII2025', 'MINT_HOME', 'REDDIT_FAV'], {
    ingredients: [
      I('Vodka', '45 ml'),
      I('Fresh Espresso', '30 ml'),
      I('Coffee Liqueur', '20 ml'),
      I('Sugar Syrup', '5 ml', true),
    ],
    instructions: 'Shake vodka, fresh espresso and coffee liqueur very hard with ice. Double strain into a chilled coupe; add syrup only if needed.',
  }),
  E('11001', 'modern-bar', 1, 'The whisky classic that returned to the front of India’s bar conversation.', ['WII2025', 'LOCAL2026', 'IBA'], {
    ingredients: [I('Bourbon or Rye Whiskey', '45 ml'), I('Sugar Cube', '1'), I('Angostura Bitters', '2 dashes'), I('Water', '2 dashes')],
    instructions: 'Dissolve sugar with bitters and water in the glass. Add whisky and a large cube, stir until silky, and express orange peel.',
  }),
  E('11006', 'modern-bar', 1, 'The rum sour now outranking the Mojito in recent Indian bar data.', ['WII2025', 'IBA'], {
    ingredients: [I('White Rum', '60 ml'), I('Lime Juice', '20 ml'), I('Sugar Syrup', '10 ml')],
    instructions: 'Shake hard with ice and double strain into a chilled coupe. Adjust syrup slightly for the acidity of the lime.',
  }),
  E('178365', 'modern-bar', 1, 'A default Indian white-spirit serve, from home bar to hotel bar.', ['WII2025', 'REDDIT_FAV', 'IBA'], {
    ingredients: [I('Gin', '50 ml'), I('Tonic Water', '100 ml'), I('Lime Wedge', '1')],
    instructions: 'Fill a chilled glass with hard ice, add gin, pour tonic slowly down the side, and squeeze in the lime. Stir once.',
  }),
  E('11113', 'modern-bar', 2, 'The savoury vodka classic behind many masala and rasam riffs.', ['WII2025', 'MINT_HOME', 'IBA'], {
    ingredients: [I('Vodka', '45 ml'), I('Tomato Juice', '90 ml'), I('Lemon Juice', '15 ml'), I('Worcestershire Sauce', '2 dashes'), I('Tabasco', '3 dashes'), I('Celery Salt', '1 pinch'), I('Black Pepper', '1 pinch')],
    instructions: 'Roll all ingredients with ice between two glasses until cold; do not shake. Strain over fresh ice and adjust seasoning after tasting.',
  }),
  E('17204', 'modern-bar', 2, 'The high-strength party classic still prominent in Indian drinker discussions.', ['REDDIT_FAV', 'IBA'], {
    ingredients: [
      I('Vodka', '15 ml'),
      I('Tequila', '15 ml'),
      I('White Rum', '15 ml'),
      I('Gin', '15 ml'),
      I('Cointreau', '15 ml'),
      I('Lemon Juice', '25 ml'),
      I('Sugar Syrup', '30 ml'),
      I('Cola', 'top up'),
    ],
    instructions: 'Add all ingredients except cola to an ice-filled highball and stir. Top with a short pour of cola. This is a high-strength serve: one is plenty.',
  }),
  E('11009', 'modern-bar', 1, 'The familiar vodka-and-ginger classic holding its place on Indian menus.', ['WII2025', 'IBA'], {
    ingredients: [I('Vodka', '45 ml'), I('Ginger Beer', '120 ml'), I('Lime Juice', '10 ml')],
    instructions: 'Build over ice in a highball or mug, top with cold ginger beer, add lime, and stir once.',
  }),
  E('17207', 'modern-bar', 2, 'A tropical rum staple with broad restaurant familiarity.', ['REDDIT_FAV', 'IBA'], {
    ingredients: [I('White Rum', '50 ml'), I('Coconut Cream', '30 ml'), I('Pineapple Juice', '50 ml')],
    instructions: 'Blend with crushed ice until smooth, or shake very hard and pour over crushed ice. Garnish with pineapple if available.',
  }),
  E('178314', 'modern-bar', 2, 'A modern gin staple recorded among India’s favourite gin classics.', ['WII2024'], {
    ingredients: [I('Gin', '60 ml'), I('Lemon Juice', '30 ml'), I('Sugar Syrup', '20 ml'), I('Basil Leaves', '10')],
    instructions: 'Muddle basil gently with syrup, add gin, lemon and ice, and shake hard. Double strain over fresh ice.',
  }),
  E('11288', 'everyday', 1, 'The named classic form of India’s ubiquitous rum-and-cola order.', ['BT2025', 'IBA'], {
    ingredients: [I('White Rum', '50 ml'), I('Cola', '120 ml'), I('Lime Juice', '10 ml')],
    instructions: 'Build rum and lime over ice, top with cola, and stir once. Garnish with a lime wedge.',
  }),
  E('11728', 'modern-bar', 2, 'The canonical spirit-forward gin order returning to Indian bar menus.', ['WII2025', 'IBA'], {
    ingredients: [I('Gin', '60 ml'), I('Dry Vermouth', '10 ml'), I('Olive or Lemon Peel', '1')],
    instructions: 'Stir gin and vermouth with ice until very cold. Strain into a chilled Martini glass and garnish with an olive or expressed lemon peel.',
  }),
  E('x-jagerbomb', 'everyday', 2, 'A high-energy party serve repeatedly named in Indian drinker discussion.', ['REDDIT_FAV'], {
    instructions: 'Pour Jägermeister into an ice-filled glass, add the energy drink, and sip. Never drop or drink around a shot glass; caffeine can also mask perceived impairment.',
  }),
  E('x-monkcola', 'everyday', 1, 'Old Monk and cola: the cult Indian home-party rum highball.', ['REDDIT_FAV', 'REDDIT_HOME']),
  E('x-shandy', 'everyday', 1, 'Beer and lemonade for a lighter, familiar long drink.', ['REDDIT_FAV', 'IPSOS2025']),
  E('x-fenifizz', 'regional', 3, 'Cashew feni, ginger and lime in an approachable Goan fizz.', ['HOMEGROWN', 'MAHUA_FENI']),
  E('x-chaitoddy', 'modern-bar', 1, 'Whisky lengthened with the masala-chai spice profile already known at home.', ['NDTV_VOGUE', 'THEBAR']),
  E('x-nariyal', 'modern-bar', 1, 'The Mojito recast with roadside-familiar coconut water.', ['CNT_ZERO', 'NDTV_VOGUE']),
  E('x-gondhoraj', 'regional', 3, 'A Bengali lime Gimlet with exceptionally aromatic citrus.', ['MADIRA', 'THEBAR']),
  E('x-shikanji', 'zero-proof', 1, 'The essential sweet-salt-sour North Indian summer cooler.', ['NDTV_VOGUE']),
  E('x-jaljeera', 'zero-proof', 1, 'Cumin, mint and black salt in a savoury Indian refresher.', ['NDTV_VOGUE']),
  E('x-aampanna', 'zero-proof', 1, 'Raw mango, cumin and mint: a cultural summer staple before it is a cocktail riff.', ['NDTV_VOGUE']),
  E('x-chaas', 'zero-proof', 1, 'Spiced buttermilk gives the collection a genuinely everyday savoury lane.', ['NDTV_VOGUE']),
  E('x-kokum', 'zero-proof', 2, 'The Konkan cooler that anchors many modern kokum bar riffs.', ['HOMEGROWN', 'CNT_ZERO']),
];

const LOCAL_IMAGE_IDS = new Set([
  'x-chaas',
  'x-kokum',
  'x-fenifizz',
  'x-monkcola',
  'x-chaitoddy',
  'x-nariyal',
  'x-gondhoraj',
]);
for (const entry of EXISTING) {
  if (LOCAL_IMAGE_IDS.has(entry.id)) entry.thumb = '/images/india/' + entry.id + '.webp';
}

const base = JSON.parse(readFileSync(join(ROOT, 'data', 'cocktails.json'), 'utf8'));
const extra = JSON.parse(readFileSync(join(ROOT, 'data', 'extra_cocktails.json'), 'utf8'));
const byId = new Map([...base, ...extra].map((x) => [x.id, x]));
const existingNames = new Set([...base, ...extra].map((x) => x.name.trim().toLowerCase()));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(new Set(DRINKS.map((x) => x.id)).size === DRINKS.length, 'Duplicate new India recipe id');
assert(new Set(DRINKS.map((x) => x.name.toLowerCase())).size === DRINKS.length, 'Duplicate new India recipe name');
assert(new Set(EXISTING.map((x) => x.id)).size === EXISTING.length, 'Duplicate existing India index id');
assert(DRINKS.every((x) => !existingNames.has(x.name.trim().toLowerCase())), 'New India recipe duplicates an existing catalogue name');

for (const recipe of DRINKS) {
  assert(recipe.browseable === true, recipe.name + ' must be browseable');
  assert(recipe.ingredients.length >= 2, recipe.name + ' has too few ingredients');
  assert(recipe.instructions.length >= 20, recipe.name + ' needs a usable method');
  assert(recipe.evidence.length > 0, recipe.name + ' needs evidence');
  for (const sourceId of recipe.evidence) assert(SOURCES[sourceId], recipe.name + ' has unknown source ' + sourceId);
}

for (const entry of EXISTING) {
  assert(byId.has(entry.id), 'India index points at missing recipe id ' + entry.id);
  assert(entry.evidence.length > 0, entry.id + ' needs evidence');
  for (const sourceId of entry.evidence) assert(SOURCES[sourceId], entry.id + ' has unknown source ' + sourceId);
}

function sourceLinks(ids) {
  return ids.map((id) => '[' + SOURCES[id].publisher + '](' + SOURCES[id].url + ')').join(', ');
}

function recipeMarkdown(recipe, number) {
  const tier = recipe.india.pantryTier;
  const ingredients = recipe.ingredients
    .map((x) => '- ' + x.measure + ' ' + x.name + (x.optional ? ' (optional)' : ''))
    .join('\n');
  return [
    '### ' + number + '. ' + recipe.name,
    '',
    recipe.tagline,
    '',
    '- **Lane:** ' + LANE_LABELS[recipe.india.lane],
    '- **Access:** Tier ' + tier + ' — ' + TIER_LABELS[tier],
    '- **Glass:** ' + recipe.glass,
    '',
    ingredients,
    '',
    '**Method:** ' + recipe.instructions,
    '',
    '**Why it is here:** ' + sourceLinks(recipe.evidence),
    '',
  ].join('\n');
}

const resolvedExisting = EXISTING.map((entry) => {
  const original = byId.get(entry.id);
  return {
    ...original,
    ...entry,
    name: original.name,
    glass: entry.glass || original.glass,
    ingredients: entry.ingredients || original.ingredients,
    instructions: entry.instructions || original.instructions,
  };
});

const collection = [...DRINKS, ...resolvedExisting];
const ordered = Object.keys(LANE_LABELS).flatMap((lane) =>
  collection
    .filter((x) => x.india.lane === lane)
    .sort((a, b) => a.name.localeCompare(b.name))
);

const fieldGuide = [
  '# The PubCrawl India Cocktail Field Guide',
  '',
  '_Research snapshot: ' + RESEARCH_DATE + '_',
  '',
  'This is an evidence-led working menu for India, not a claim that every drink originated in India. It combines what people commonly order, the classics leading Indian restaurant bars, culturally rooted regional ingredients and spirits, contemporary spicy/local riffs, and a serious zero-proof lane.',
  '',
  '## How to use the tiers',
  '',
  '- **Tier 1:** ' + TIER_LABELS[1] + '.',
  '- **Tier 2:** ' + TIER_LABELS[2] + '.',
  '- **Tier 3:** ' + TIER_LABELS[3] + '.',
  '',
  'Fresh toddy, urrak, feni, mahua and arrack vary by producer and can be unsafe when informally made. Buy only reliable licensed product, check local state law, and never infer alcohol strength from taste. Fermented kanji must be prepared hygienically, refrigerated, and discarded if mould, smell or pressure is abnormal.',
  '',
  'Generation Alpha is treated only in the zero-proof lane because the cohort is under legal drinking age in 2026. See [Cambridge Dictionary](' + SOURCES.GEN_ALPHA.url + ') and the [FSSAI drinking-age context](' + SOURCES.FSSAI_AGE.url + ').',
  '',
  '## What the evidence says',
  '',
  '- The mass-market backbone is simple: vodka soda, whisky and cola, vodka lemonade, rum and cola, Mojito, and the older whisky-soda habit.',
  '- The modern restaurant-bar canon adds Picante, Espresso Martini, Negroni, Daiquiri, Old Fashioned, Margarita, Whisky Sour, Martini and G and T.',
  '- India-specific momentum comes from local acid, aroma and memory: kokum, tamarind, gondhoraj, curry leaf, jamun, guava, raw mango, tea, filter coffee, jaggery and indigenous spirits.',
  '- The younger direction is less-sweet, visually legible, locally storied and increasingly low/no alcohol. Social posts were useful for discovery; sales and bar-survey evidence received more weight.',
  '',
  '## Complete collection',
  '',
  ...ordered.map((recipe, index) => recipeMarkdown(recipe, index + 1)),
].join('\n');

const sourceTable = Object.entries(SOURCES)
  .map(([id, source]) => '| ' + id + ' | [' + source.title + '](' + source.url + ') | ' + source.kind + ' | ' + source.use + ' |')
  .join('\n');

const laneCounts = Object.keys(LANE_LABELS)
  .map((lane) => '- ' + LANE_LABELS[lane] + ': ' + collection.filter((x) => x.india.lane === lane).length)
  .join('\n');

const reportSource = [
  '# India cocktail research source report',
  '',
  '_Canonical internal research record — ' + RESEARCH_DATE + '_',
  '',
  '## Scope and result',
  '',
  'The collection contains ' + collection.length + ' recipes: ' + DRINKS.length + ' new recipes and ' + EXISTING.length + ' existing catalogue recipes indexed without duplication.',
  '',
  laneCounts,
  '',
  '## Selection method',
  '',
  '1. Establish the volume backbone with India consumer and on-premise/bar surveys.',
  '2. Add specific restaurant-bar classics only when named in bar-industry data or multiple credible features.',
  '3. Add culturally rooted ingredients and regional spirits from reported bartender recipes, reputable food publications and producer-first recipes.',
  '4. Use Reddit, YouTube and other social/forum material as anecdotal discovery signals, never as population estimates.',
  '5. Give every drink a reproducible metric spec and a pantry tier. Keep high-risk ferments and regional alcohol in Tier 3 with handling notes.',
  '6. Keep Generation Alpha entirely zero-proof.',
  '',
  '## Platform and evidence limitations',
  '',
  '- Instagram, Facebook and X were searched, but durable, independently verifiable recipe evidence was sparse or blocked. Their strongest usable signal is reflected indirectly through reported features documenting Instagram and YouTube-driven spread.',
  '- Quora was inaccessible to automated retrieval. No claim depends on it.',
  '- Reddit threads are self-selected anecdotes and are labelled that way.',
  '- “Trending” is a dated snapshot, not a permanent ranking. The app stores the research date on every indexed recipe.',
  '- Several recipes are editorially standardised adaptations of a documented flavour/serve, not copied house recipes. The evidence link explains the inclusion; the method is The PubCrawl’s reproducible spec.',
  '',
  '## Claim ledger',
  '',
  '| Claim | Support | Confidence |',
  '|---|---|---|',
  '| Simple two-part highballs form India’s everyday cocktail backbone. | BT2025, MC2026, HIGHBALL, Reddit corroboration | High |',
  '| Picante, Espresso Martini, Negroni, Daiquiri and Old Fashioned are current restaurant-bar leaders. | WII2024, WII2025, PICANTE | High |',
  '| Local ingredients and indigenous spirits are a durable menu direction. | IPSOS2025, NDTV features, Mint features, Sommelier India | High |',
  '| Less-sweet, fermentation-led and zero-proof drinks are rising, especially among younger consumers. | IPSOS2025, MC2026, FERMENT, CNT_ZERO | Medium-high |',
  '| Particular Reddit favourites represent India as a whole. | They do not; used only for discovery. | Low and explicitly bounded |',
  '',
  '## Source ledger',
  '',
  '| ID | Source | Type | Used for |',
  '|---|---|---|---|',
  sourceTable,
  '',
  '## Generated artifacts',
  '',
  '- data/indian_cocktails.json — net-new recipes',
  '- data/indian_cocktail_index.json — merge instructions for existing recipes',
  '- data/indian_cocktail_sources.json — machine-readable source ledger',
  '- docs/india-cocktail-field-guide.md — complete human-readable collection and recipes',
  '',
].join('\n');

mkdirSync(join(ROOT, 'docs'), { recursive: true });
mkdirSync(join(ROOT, 'research'), { recursive: true });

writeFileSync(join(ROOT, 'data', 'indian_cocktails.json'), JSON.stringify(DRINKS, null, 2) + '\n');
writeFileSync(join(ROOT, 'data', 'indian_cocktail_index.json'), JSON.stringify(EXISTING, null, 2) + '\n');
writeFileSync(join(ROOT, 'data', 'indian_cocktail_sources.json'), JSON.stringify({
  researchDate: RESEARCH_DATE,
  methodology: 'Evidence hierarchy: consumer and bar surveys, reported features, published recipes, then social/forum discovery.',
  sources: SOURCES,
}, null, 2) + '\n');
writeFileSync(join(ROOT, 'docs', 'india-cocktail-field-guide.md'), fieldGuide.trimEnd() + '\n');
writeFileSync(join(ROOT, 'research', 'india-cocktail-report-source.md'), reportSource.trimEnd() + '\n');

console.log('Built ' + DRINKS.length + ' new India recipes.');
console.log('Indexed ' + EXISTING.length + ' existing recipes without duplication.');
console.log('Field guide contains ' + collection.length + ' complete recipes.');
