import type { WatchVideo } from './types';

/** The twelve reviewed landing candidates: three from each Watch lane. */
export const LANDING_FEATURED_IDS = [
  'i1iqVGORUck', 'ml_KwtaTC-A', 'OIVGM79KvDQ',
  'b0IuTL3Z-kk', 'c6GV_vRlIIA', 'pdcrJ5V7YKM',
  'GE8vyfKyZfQ', 'X3n5Pk8fkLg', 'ZFvup0aXRsU',
  'UckkY0rrsAM', 'RGOWPswqRwc', 'gIg1gAy4lVg',
] as const;

/** Build-time metadata used by the landing facade; it never waits for the API. */
export const LANDING_WATCH_SEED: WatchVideo[] = [
  { id: 'i1iqVGORUck', title: 'Ice Diamonds and Classic Cocktails at Bar High Five', channel: 'Munchies', lane: 'craft', rank: 19, addedAt: '2026-08-04', views: null, likes: null, movement: 0, landingFeatured: true },
  { id: 'ml_KwtaTC-A', title: "A Day at Rockefeller Center's Legendary Cocktail Bar", channel: 'Bon Appétit', lane: 'craft', rank: 72, addedAt: '2026-07-27', views: null, likes: null, movement: 0, landingFeatured: true },
  { id: 'OIVGM79KvDQ', title: '11 Bartenders Make a Martini (Classic, Speed, Tiki & More) | Epicurious', channel: 'Epicurious', lane: 'craft', rank: 192, addedAt: '2026-08-04', views: null, likes: null, movement: 0, landingFeatured: true },
  { id: 'b0IuTL3Z-kk', title: 'How To Mix Every Cocktail | Method Mastery | Epicurious', channel: 'Epicurious', lane: 'education', rank: 8, addedAt: '2026-08-04', views: null, likes: null, movement: 0, landingFeatured: true },
  { id: 'c6GV_vRlIIA', title: '10 Easy Cocktails You Can Make At Home', channel: 'The Educated Barfly', lane: 'education', rank: 41, addedAt: '2026-08-04', views: null, likes: null, movement: 0, landingFeatured: true },
  { id: 'pdcrJ5V7YKM', title: 'How I Make an Old Fashioned | the ONE cocktail you must know', channel: 'Anders Erickson', lane: 'education', rank: 85, addedAt: '2026-08-04', views: null, likes: null, movement: 0, landingFeatured: true },
  { id: 'GE8vyfKyZfQ', title: 'Relationships, Clubbing & Cocktails | Stand-Up Comedy by Aakash Gupta', channel: 'Aakash Gupta', lane: 'comedy', rank: 2, addedAt: '2026-08-04', views: null, likes: null, movement: 0, landingFeatured: true },
  { id: 'X3n5Pk8fkLg', title: 'Seth and Rihanna Go Day Drinking', channel: 'Late Night with Seth Meyers', lane: 'comedy', rank: 4, addedAt: '2026-07-27', views: null, likes: null, movement: 0, landingFeatured: true },
  { id: 'ZFvup0aXRsU', title: 'Throwback Thursday: The Bartender Tried To Warn Me | Gabriel Iglesias', channel: 'Gabriel Iglesias', lane: 'comedy', rank: 12, addedAt: '2026-08-04', views: null, likes: null, movement: 0, landingFeatured: true },
  { id: 'UckkY0rrsAM', title: 'Bartenders Match the Drink to the Person', channel: 'Cut', lane: 'people', rank: 30, addedAt: '2026-07-27', views: null, likes: null, movement: 0, landingFeatured: true },
  { id: 'RGOWPswqRwc', title: 'Pro Chefs Make Their Favorite Cocktails (10 Recipes) | Test Kitchen Talks | Bon Appétit', channel: 'Bon Appétit', lane: 'people', rank: 80, addedAt: '2026-08-04', views: null, likes: null, movement: 0, landingFeatured: true },
  { id: 'gIg1gAy4lVg', title: 'Whiskey Expert Guesses Cheap vs Expensive Whiskey | Price Points | Epicurious', channel: 'Epicurious', lane: 'people', rank: 84, addedAt: '2026-08-04', views: null, likes: null, movement: 0, landingFeatured: true },
];

export const WATCH_CATALOGUE_COUNT = 694;
export const thumbnailForWatch = (video: Pick<WatchVideo, 'id'>) =>
  `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`;

export const watchLaneLabel: Record<string, string> = {
  craft: 'THE CRAFT',
  education: 'LEARN IT',
  comedy: 'FOR THE LAUGH',
  people: 'PEOPLE & DRINK',
};
