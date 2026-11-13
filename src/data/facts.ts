/**
 * Bar Talk: short true stories from the drinking world.
 * The list lives in data/facts.json so the notification sender can serve the
 * same stories the app shows — one source of truth.
 */
import facts from '../../data/facts.json';
import sourceNotes from '../../data/facts.sources.json';

export const FACTS: string[] = facts;
export const FACT_SOURCES: Record<string, { researchId: string; sources: { title: string; publisher: string; url: string }[] }> = sourceNotes;
