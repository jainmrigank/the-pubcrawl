import type { Recipe } from './types';
import { formatMeasure } from './measure';

const SITE = 'https://the-pubcrawl.vercel.app';

/** Plain-text card for one drink, ready for a chat message. */
export function recipeShareText(r: Recipe, vibeLabel: string): string {
  const lines = [
    `${r.name.toUpperCase()} · The PubCrawl`,
    `${vibeLabel} · ${r.glass || 'Any glass'}`,
    '',
    'WHAT YOU NEED',
    ...r.ingredients.map((i) => `- ${i.measure && i.measure !== '—' ? `${formatMeasure(i.measure)} ` : ''}${i.name}`),
    '',
    'HOW TO MAKE IT',
    r.instructions,
  ];
  if (r.video) lines.push('', `WATCH: ${r.video}`);
  lines.push('', `What's your poison? Find it at ${SITE}`);
  return lines.join('\n');
}

/** Plain-text menu of the whole tab. */
export function tabShareText(list: Recipe[]): string {
  const lines = [`TONIGHT'S TAB · The PubCrawl`, `${list.length} drink${list.length > 1 ? 's' : ''} on the list`];
  list.forEach((r, i) => {
    // keep multi-step instructions aligned under their label
    const make = r.instructions.trim().replace(/\s*\n+\s*/g, '\n        ');
    lines.push('');
    lines.push(`${i + 1}. ${r.name.toUpperCase()} (${r.glass || 'any glass'})`);
    lines.push(`   Need: ${r.ingredients.map((x) => x.name).join(', ')}`);
    lines.push(`   Make: ${make}`);
    if (r.video) lines.push(`   Watch: ${r.video}`);
  });
  lines.push('', `Build your own menu for the night at ${SITE}`);
  return lines.join('\n');
}

export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed';

/**
 * Standard share behaviour: the native share sheet where the browser has one
 * (navigator.share), otherwise copy to the clipboard.
 */
export async function shareContent(title: string, text: string): Promise<ShareOutcome> {
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, text });
      return 'shared';
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
      // fall through to clipboard on any other failure
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'failed';
  }
}
