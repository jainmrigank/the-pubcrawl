import { useCallback, useEffect, useRef, useState } from 'react';
import { OVERLAY_PRIORITY, overlayGate } from './overlayGate';
import {
  clearRecipeFocusMarker,
  pushRecipeFocusMarker,
  readRecipeFocusMarker,
} from './recipeFocusHistory';
import type { RecipeFocusOrigin, RecipeFocusPhase, RecipeFocusSession } from './recipeFocusTypes';

const RECIPE_FOCUS_GATE_ID = 'recipe-focus';
const token = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;

export function useRecipeFocus() {
  const [session, setSession] = useState<RecipeFocusSession | null>(null);
  const [phase, setPhase] = useState<RecipeFocusPhase>('opening');
  const sessionRef = useRef<RecipeFocusSession | null>(null);
  const phaseRef = useRef<RecipeFocusPhase>('opening');
  const registry = useRef(new Map<string, RecipeFocusSession>());
  const closeFallback = useRef(0);

  const updatePhase = useCallback((next: RecipeFocusPhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const completeClose = useCallback(() => {
    const closing = sessionRef.current;
    if (!closing) return;
    window.clearTimeout(closeFallback.current);
    if (readRecipeFocusMarker()?.token === closing.token) clearRecipeFocusMarker();
    sessionRef.current = null;
    setSession(null);
    const sameRoute = window.location.hash === closing.sourceHash;
    window.requestAnimationFrame(() => {
      overlayGate.release(RECIPE_FOCUS_GATE_ID);
      if (!sameRoute) return;
      window.scrollTo({ top: closing.pageScrollY, behavior: 'instant' as ScrollBehavior });
      if (closing.element.isConnected) {
        const scroller = closing.element.querySelector<HTMLElement>('.fb-scroll');
        if (scroller) scroller.scrollTop = closing.cardScrollTop;
        closing.trigger.focus({ preventScroll: true });
      } else {
        const heading = Array.from(document.querySelectorAll<HTMLElement>('main h1, main h2'))
          .find((element) => element.getClientRects().length > 0);
        if (heading) {
          heading.tabIndex = -1;
          heading.focus({ preventScroll: true });
        }
      }
    });
  }, []);

  const beginClosing = useCallback(() => {
    if (!sessionRef.current || phaseRef.current === 'closing') return;
    updatePhase('closing');
    window.clearTimeout(closeFallback.current);
    closeFallback.current = window.setTimeout(completeClose, 760);
  }, [completeClose, updatePhase]);

  const requestClose = useCallback(() => {
    const current = sessionRef.current;
    if (!current || phaseRef.current === 'closing') return;
    beginClosing();
    const marker = readRecipeFocusMarker();
    if (marker?.token === current.token && marker.sourceHash === current.sourceHash) {
      window.history.back();
    }
  }, [beginClosing]);

  const openRecipe = useCallback((origin: RecipeFocusOrigin) => {
    if (sessionRef.current || overlayGate.active) return;
    if (!overlayGate.acquire(RECIPE_FOCUS_GATE_ID, OVERLAY_PRIORITY.recipeFocus)) return;
    const next: RecipeFocusSession = {
      ...origin,
      token: token(),
      sourceHash: window.location.hash,
      pageScrollY: window.scrollY,
      sourceBounds: origin.element.getBoundingClientRect(),
    };
    registry.current.set(next.token, next);
    while (registry.current.size > 8) registry.current.delete(registry.current.keys().next().value as string);
    pushRecipeFocusMarker({ token: next.token, recipeId: next.recipe.id, sourceHash: next.sourceHash });
    sessionRef.current = next;
    updatePhase('opening');
    setSession(next);
  }, [updatePhase]);

  const markOpen = useCallback(() => {
    if (sessionRef.current && phaseRef.current === 'opening') updatePhase('open');
  }, [updatePhase]);

  useEffect(() => {
    // A reload cannot recover a DOM origin or an ephemeral generated recipe.
    // Keep all unrelated history state and remove only our stale marker.
    if (!sessionRef.current && readRecipeFocusMarker()) clearRecipeFocusMarker();

    const onPopState = () => {
      const marker = readRecipeFocusMarker();
      const current = sessionRef.current;
      if (current) {
        if (!marker || marker.token !== current.token) beginClosing();
        return;
      }
      if (!marker) return;
      const remembered = registry.current.get(marker.token);
      if (!remembered || remembered.sourceHash !== window.location.hash || overlayGate.active) {
        clearRecipeFocusMarker();
        return;
      }
      overlayGate.acquire(RECIPE_FOCUS_GATE_ID, OVERLAY_PRIORITY.recipeFocus);
      sessionRef.current = remembered;
      updatePhase('opening');
      setSession(remembered);
    };
    const onHashChange = () => {
      const current = sessionRef.current;
      if (current && window.location.hash !== current.sourceHash) beginClosing();
    };
    window.addEventListener('popstate', onPopState);
    window.addEventListener('hashchange', onHashChange);
    return () => {
      window.removeEventListener('popstate', onPopState);
      window.removeEventListener('hashchange', onHashChange);
      window.clearTimeout(closeFallback.current);
      if (sessionRef.current) overlayGate.release(RECIPE_FOCUS_GATE_ID);
    };
  }, [beginClosing, updatePhase]);

  return { session, phase, openRecipe, requestClose, markOpen, completeClose };
}
