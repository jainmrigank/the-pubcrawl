import type { BrowseFilter, CollectionId, VibeId } from './types';

export const VIBE_ORDER: VibeId[] = ['tropical', 'refreshing', 'boozy', 'sweet', 'cozy', 'party', 'zeroproof'];

export function serializeBrowseFilter(value: BrowseFilter): string {
  if (value.kind === 'all') return 'all';
  return `${value.kind}:${value.id}`;
}

export function parseBrowseFilter(value: string): BrowseFilter {
  if (value === 'all' || !value) return { kind: 'all' };
  const [kind, id] = value.split(':');
  if (kind === 'category' && VIBE_ORDER.includes(id as VibeId)) return { kind, id: id as VibeId };
  if (kind === 'collection' && (id === 'india' || id === 'house')) return { kind, id: id as CollectionId };
  return { kind: 'all' };
}
