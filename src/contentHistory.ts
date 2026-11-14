export const CONTENT_RETURN_KEY = '__pubcrawlContentReturn';

export interface ContentReturnMarker { token: string; depth: number }

export function historyRecord(state: unknown): Record<string, unknown> {
  return state && typeof state === 'object' ? state as Record<string, unknown> : {};
}

export function readContentReturn(state: unknown): ContentReturnMarker | null {
  const value = historyRecord(state)[CONTENT_RETURN_KEY] as Partial<ContentReturnMarker> | undefined;
  return value && typeof value.token === 'string' && value.token.length > 0
    && Number.isSafeInteger(value.depth) && value.depth! >= 0
    ? value as ContentReturnMarker : null;
}

/** Keep a content Back action coupled to its origin across filter/reader entries. */
export function advanceContentReturn(state: unknown): Record<string, unknown> {
  const current = readContentReturn(state);
  return current ? { ...historyRecord(state), [CONTENT_RETURN_KEY]: { ...current, depth: current.depth + 1 } } : historyRecord(state);
}
