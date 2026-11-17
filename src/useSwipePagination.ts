import { useEffect, useLayoutEffect, useRef, type MouseEvent, type PointerEvent } from 'react';

type Swipe = { id: number; x: number; y: number; axis: 'x' | 'y' | null; element: HTMLElement; content: HTMLElement | null; origin?: number };
type PageMotion = { element: HTMLElement; animation?: Animation };

const MOBILE_PAGING = '(max-width: 860px), (pointer: coarse)';
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Touch paging keeps native vertical scrolling, form controls and nested charts. */
export function useSwipePagination({ pageKey, onNext, onPrevious, canNext = true, canPrevious = true, enabled = true }: {
  pageKey: string | number;
  onNext: () => void;
  onPrevious: () => void;
  canNext?: boolean;
  canPrevious?: boolean;
  enabled?: boolean;
}) {
  const gesture = useRef<Swipe | null>(null);
  const motion = useRef<PageMotion | null>(null);
  const pending = useRef<{ element: HTMLElement; direction: number } | null>(null);
  const previousPage = useRef(pageKey);
  const suppressClickUntil = useRef(0);
  const resetMotion = () => {
    const current = motion.current;
    if (!current) return;
    current.animation?.cancel();
    current.element.style.removeProperty('transform');
    current.element.style.removeProperty('opacity');
    motion.current = null;
  };
  const slideHome = (element: HTMLElement, x: number, opacity: number, duration: number) => {
    resetMotion();
    if (reducedMotion()) return;
    const animation = element.animate([
      { transform: `translate3d(${x}px, 0, 0)`, opacity },
      { transform: 'translate3d(0, 0, 0)', opacity: 1 },
    ], { duration, easing: 'cubic-bezier(.22, 1, .36, 1)' });
    motion.current = { element, animation };
    animation.onfinish = () => { if (motion.current?.animation === animation) resetMotion(); };
  };
  const settle = () => {
    const current = motion.current;
    if (!current || current.animation) return;
    const style = getComputedStyle(current.element);
    slideHome(current.element, new DOMMatrixReadOnly(style.transform).m41, Number(style.opacity), 160);
  };
  const clearGesture = () => {
    gesture.current?.element.removeAttribute('data-swiping');
    gesture.current = null;
  };

  useLayoutEffect(() => {
    if (previousPage.current === pageKey) return;
    previousPage.current = pageKey;
    const change = pending.current;
    pending.current = null;
    resetMotion();
    if (!change) return;
    // Only the data moves; the controls, frame and page indicator stay anchored.
    const content = change.element.querySelector<HTMLElement>('[data-swipe-content]');
    if (content) slideHome(content, change.direction * Math.min(80, change.element.clientWidth * .2), .82, 220);
  }, [pageKey]);

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => { if (preference.matches) resetMotion(); };
    preference.addEventListener('change', change);
    return () => { preference.removeEventListener('change', change); resetMotion(); };
  }, []);

  return {
    'data-swipe-pagination': true,
    onPointerDown(event: PointerEvent<HTMLElement>) {
      settle();
      clearGesture();
      pending.current = null;
      suppressClickUntil.current = 0;
      if (!enabled || !event.isPrimary) return;
      // Narrow desktop previews send mouse events even in their phone layout.
      const mousePreview = event.pointerType === 'mouse' && event.button === 0 && window.matchMedia(MOBILE_PAGING).matches;
      if (!mousePreview && !['touch', 'pen'].includes(event.pointerType)) return;
      const target = event.target instanceof Element ? event.target : null;
      if (!target || target.closest('[data-swipe-pagination]') !== event.currentTarget) return;
      if (target.closest('input, select, textarea, [contenteditable="true"], [data-no-page-swipe]')) return;
      // A horizontally scrollable chart/table owns its own gesture.
      for (let node: Element | null = target; node && node !== event.currentTarget; node = node.parentElement) {
        if (node.scrollWidth > node.clientWidth + 1 && /auto|scroll/.test(getComputedStyle(node).overflowX)) return;
      }
      gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, axis: null, element: event.currentTarget, content: event.currentTarget.querySelector<HTMLElement>('[data-swipe-content]') };
    },
    onPointerMove(event: PointerEvent<HTMLElement>) {
      const start = gesture.current;
      if (!start || start.id !== event.pointerId) return;
      const dx = Math.abs(event.clientX - start.x), dy = Math.abs(event.clientY - start.y);
      if (!start.axis && Math.max(dx, dy) >= 12) {
        if (dx > dy * 1.25) start.axis = 'x';
        else if (dy > dx) start.axis = 'y';
      }
      if (start.axis === 'x') {
        suppressClickUntil.current = performance.now() + 600;
        start.element.setAttribute('data-swiping', 'true');
        if (start.content && !reducedMotion()) {
          if (start.origin === undefined) {
            start.origin = new DOMMatrixReadOnly(getComputedStyle(start.content).transform).m41;
            resetMotion();
          }
          const distance = event.clientX - start.x;
          const limit = Math.min(84, start.element.clientWidth * .24);
          const boundary = distance < 0 ? !canNext : !canPrevious;
          const offset = Math.sign(distance) * limit * (1 - Math.exp(-Math.abs(distance) / limit)) * (boundary ? .22 : 1);
          start.content.style.transform = `translate3d(${start.origin + offset}px, 0, 0)`;
          start.content.style.opacity = String(1 - Math.abs(offset) / limit * .12);
          motion.current = { element: start.content };
        }
        if (event.pointerType === 'mouse') {
          // Continue a preview drag across rows or beyond the surface's edge.
          event.currentTarget.setPointerCapture(event.pointerId);
          event.preventDefault();
        }
      }
    },
    onPointerUp(event: PointerEvent<HTMLElement>) {
      const start = gesture.current;
      if (!start || start.id !== event.pointerId) return;
      clearGesture();
      const dx = event.clientX - start.x, dy = Math.abs(event.clientY - start.y);
      const threshold = Math.max(42, Math.min(68, event.currentTarget.clientWidth * .16));
      if (start.axis === 'y' || Math.abs(dx) < threshold || Math.abs(dx) <= dy * 1.25 || (dx < 0 ? !canNext : !canPrevious)) { settle(); return; }
      suppressClickUntil.current = performance.now() + 600;
      pending.current = { element: start.element, direction: dx < 0 ? 1 : -1 };
      if (dx < 0) onNext();
      else onPrevious();
    },
    onPointerCancel() { clearGesture(); settle(); },
    onLostPointerCapture(event: PointerEvent<HTMLElement>) {
      if (gesture.current?.id === event.pointerId) { clearGesture(); settle(); }
    },
    onClickCapture(event: MouseEvent<HTMLElement>) {
      // A drag ending on a drink must not also open its recipe. Keyboard clicks pass through.
      if (event.detail && performance.now() < suppressClickUntil.current) {
        event.preventDefault();
        event.stopPropagation();
        suppressClickUntil.current = 0;
      }
    },
  };
}
