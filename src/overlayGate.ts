/**
 * A tiny process-local arbiter for surfaces that dim or modalise the app.
 *
 * The gate deliberately does not own React state. Consumers acquire before
 * opening, release when they close, and subscribe to the release event when
 * they need to retry. Keeping this state outside a component prevents two
 * independently mounted overlays from both believing they are the only modal.
 */
export interface OverlayGate {
  active: string | null;
  acquire(id: string, priority: number): boolean;
  release(id: string): void;
  priority(id: string): number | null;
  subscribe(listener: () => void): () => void;
}

/**
 * One shared ordering for every surface that can modalise the application.
 * Higher values may pre-empt lower values; consumers must subscribe when they
 * need to close themselves after being pre-empted.
 */
export const OVERLAY_PRIORITY = {
  tour: 10,
  prompt: 20,
  daily: 30,
  shortsRecipe: 40,
  recipeVideo: 50,
} as const;

interface Holder {
  id: string;
  priority: number;
}

let holder: Holder | null = null;
const listeners = new Set<() => void>();

export const overlayGate: OverlayGate = {
  get active() {
    return holder?.id ?? null;
  },
  acquire(id, priority) {
    if (!id) return false;
    const previous = holder;
    if (!previous || previous.id === id || priority > previous.priority) {
      holder = { id, priority };
      // Notify both first acquisition and replacement. A Shorts host may be
      // the only subscriber when a tutorial opens from an empty gate; without
      // this notification it could keep playing underneath the scrim.
      if (!previous || previous.id !== id) for (const listener of listeners) listener();
      return true;
    }
    return false;
  },
  release(id) {
    if (!holder || holder.id !== id) return;
    holder = null;
    for (const listener of listeners) listener();
  },
  priority(id) {
    return holder?.id === id ? holder.priority : null;
  },
  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

/**
 * Make the application behind a portal unavailable to keyboard and assistive
 * technology while a modal/tutorial is open. The portal itself is appended to
 * body, so it is intentionally not included in the inert set.
 */
export function setBackgroundInert(inert: boolean, portalSelector: string): () => void {
  if (typeof document === 'undefined') return () => {};
  const changed: Array<{ element: HTMLElement; previous: boolean }> = [];
  const portal = document.querySelector<HTMLElement>(portalSelector);
  const visit = (parent: Element) => {
    for (const child of Array.from(parent.children)) {
      if (!(child instanceof HTMLElement)) continue;
      if (portal && child === portal) continue;
      if (portal && child.contains(portal)) {
        visit(child);
        continue;
      }
      const element = child as HTMLElement & { inert?: boolean };
      const previous = Boolean(element.inert);
      if (inert) {
        element.inert = true;
        changed.push({ element, previous });
      } else if (previous) {
        element.inert = false;
      }
    }
  };
  // The daily and Shorts dialogs live inside #root, while the tour and mobile
  // navigation are portalled directly under body. Walking down the one kept
  // ancestor means the app behind an in-tree dialog is inert without making
  // the dialog itself inert.
  if (portal) visit(document.body);
  else if (inert) visit(document.body);
  return () => {
    for (const { element, previous } of changed) {
      (element as HTMLElement & { inert?: boolean }).inert = previous;
    }
  };
}
