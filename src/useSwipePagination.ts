import { useEffect, useLayoutEffect, useRef, type DragEvent, type MouseEvent, type PointerEvent as ReactPointerEvent } from 'react';

type Swipe = {
  id: number; x: number; y: number; startedAt: number;
  axis: 'x' | 'y' | null; element: HTMLElement; content: HTMLElement | null; origin?: number;
};
type PageMotion = { element: HTMLElement; dragging: boolean; frame?: number; timer?: number; end?: (event: TransitionEvent) => void };

const MOBILE_PAGING = '(max-width: 860px), (pointer: coarse)';
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const offsetOf = (element: HTMLElement) => {
  const matrix = getComputedStyle(element).transform.match(/^matrix(3d)?\((.+)\)$/);
  return matrix ? Number(matrix[2].split(',')[matrix[1] ? 12 : 4]) || 0 : 0;
};

/** A stationary gesture surface owns paging; only its data layer moves. */
export function useSwipePagination({ pageKey, onNext, onPrevious, canNext = true, canPrevious = true, enabled = true }: {
  pageKey: string | number;
  onNext: () => void;
  onPrevious: () => void;
  canNext?: boolean;
  canPrevious?: boolean;
  enabled?: boolean;
}) {
  const gesture = useRef<Swipe | null>(null);
  const detach = useRef<(() => void) | null>(null);
  const motion = useRef<PageMotion | null>(null);
  const pending = useRef<{ element: HTMLElement; direction: number } | null>(null);
  const pendingFrame = useRef<number | null>(null);
  const previousPage = useRef(pageKey);
  const suppressClickUntil = useRef(0);

  const resetMotion = () => {
    const current = motion.current;
    if (!current) return;
    if (current.frame !== undefined) cancelAnimationFrame(current.frame);
    if (current.timer !== undefined) clearTimeout(current.timer);
    if (current.end) current.element.removeEventListener('transitionend', current.end);
    current.element.style.removeProperty('transition');
    current.element.style.removeProperty('transform');
    current.element.style.removeProperty('opacity');
    motion.current = null;
  };
  const slideHome = (element: HTMLElement, x: number, opacity: number, duration: number) => {
    resetMotion();
    if (reducedMotion() || !element.isConnected) return;
    const current: PageMotion = { element, dragging: false };
    motion.current = current;
    element.style.transition = 'none';
    element.style.transform = `translate3d(${x}px, 0, 0)`;
    element.style.opacity = String(opacity);
    // Commit the starting position before enabling an interruptible transition.
    element.getBoundingClientRect();
    const finish = () => { if (motion.current === current) resetMotion(); };
    current.end = event => { if (event.target === element && event.propertyName === 'transform') finish(); };
    element.addEventListener('transitionend', current.end);
    current.frame = requestAnimationFrame(() => {
      if (motion.current !== current) return;
      element.style.transition = `transform ${duration}ms cubic-bezier(.22, 1, .36, 1), opacity ${duration}ms ease-out`;
      element.style.transform = 'translate3d(0, 0, 0)';
      element.style.opacity = '1';
    });
    // A lost transition event or interrupted frame must never leave an offset.
    current.timer = window.setTimeout(finish, duration + 100);
  };
  const settle = () => {
    const current = motion.current;
    if (!current?.dragging) return;
    slideHome(current.element, offsetOf(current.element), Number(getComputedStyle(current.element).opacity), 160);
  };
  const clearGesture = () => {
    const current = gesture.current;
    gesture.current = null;
    detach.current?.();
    detach.current = null;
    current?.element.removeAttribute('data-swiping');
    if (current?.element.hasPointerCapture(current.id)) current.element.releasePointerCapture(current.id);
  };
  const cancel = () => { clearGesture(); settle(); };

  useLayoutEffect(() => {
    if (previousPage.current === pageKey) return;
    previousPage.current = pageKey;
    const change = pending.current;
    pending.current = null;
    if (pendingFrame.current !== null) cancelAnimationFrame(pendingFrame.current);
    resetMotion();
    if (!change) return;
    const content = change.element.querySelector<HTMLElement>('[data-swipe-content]');
    if (content) slideHome(content, change.direction * Math.min(80, change.element.clientWidth * .2), .82, 220);
  }, [pageKey]);

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => { if (preference.matches) resetMotion(); };
    const hidden = () => { if (document.hidden) { cancel(); resetMotion(); } };
    preference.addEventListener('change', change);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      preference.removeEventListener('change', change);
      document.removeEventListener('visibilitychange', hidden);
      clearGesture();
      resetMotion();
      if (pendingFrame.current !== null) cancelAnimationFrame(pendingFrame.current);
    };
  }, []);

  const move = (event: PointerEvent) => {
    const start = gesture.current;
    if (!start || start.id !== event.pointerId) return;
    const dx = Math.abs(event.clientX - start.x), dy = Math.abs(event.clientY - start.y);
    if (!start.axis && Math.max(dx, dy) >= 10) {
      if (dx > dy * 1.25) start.axis = 'x';
      else if (dy > dx) start.axis = 'y';
    }
    if (start.axis !== 'x') return;
    suppressClickUntil.current = performance.now() + 600;
    start.element.setAttribute('data-swiping', 'true');
    // Transfer implicit child capture to the stationary surface. Its children
    // can move or be replaced without interrupting the pointer's lifetime.
    if (event.isTrusted && !start.element.hasPointerCapture(start.id)) start.element.setPointerCapture(start.id);
    if (event.cancelable) event.preventDefault();
    if (start.content && !reducedMotion()) {
      if (start.origin === undefined) { start.origin = offsetOf(start.content); resetMotion(); }
      const distance = event.clientX - start.x;
      const limit = Math.min(84, start.element.clientWidth * .24);
      const boundary = distance < 0 ? !canNext : !canPrevious;
      const offset = Math.sign(distance) * limit * (1 - Math.exp(-Math.abs(distance) / limit)) * (boundary ? .22 : 1);
      start.content.style.transition = 'none';
      start.content.style.transform = `translate3d(${start.origin + offset}px, 0, 0)`;
      start.content.style.opacity = String(1 - Math.abs(offset) / limit * .12);
      motion.current = { element: start.content, dragging: true };
    }
  };
  const release = (event: PointerEvent) => {
    const start = gesture.current;
    if (!start || start.id !== event.pointerId) return;
    clearGesture();
    const dx = event.clientX - start.x, dy = Math.abs(event.clientY - start.y);
    const duration = Math.max(1, event.timeStamp - start.startedAt);
    const threshold = Math.max(28, Math.min(36, start.element.clientWidth * .09));
    const flick = Math.abs(dx) >= 28 && Math.abs(dx) / duration >= .25;
    if (start.axis === 'y' || (!flick && Math.abs(dx) < threshold) || Math.abs(dx) <= dy * 1.25 || (dx < 0 ? !canNext : !canPrevious)) { settle(); return; }
    suppressClickUntil.current = performance.now() + 600;
    const change = { element: start.element, direction: dx < 0 ? 1 : -1 };
    pending.current = change;
    if (dx < 0) onNext();
    else onPrevious();
    // Even if a consumer cannot advance, release must still restore the layer.
    pendingFrame.current = requestAnimationFrame(() => {
      if (pending.current === change) { pending.current = null; settle(); }
    });
  };

  return {
    'data-swipe-pagination': true,
    onPointerDown(event: ReactPointerEvent<HTMLElement>) {
      if (!event.isPrimary) { cancel(); return; }
      settle();
      clearGesture();
      pending.current = null;
      suppressClickUntil.current = 0;
      if (!enabled) return;
      const mousePreview = event.pointerType === 'mouse' && event.button === 0 && window.matchMedia(MOBILE_PAGING).matches;
      if (!mousePreview && !['touch', 'pen'].includes(event.pointerType)) return;
      const target = event.target instanceof Element ? event.target : null;
      if (!target || target.closest('[data-swipe-pagination]') !== event.currentTarget) return;
      if (target.closest('input, select, textarea, [contenteditable="true"], [data-no-page-swipe]')) return;
      for (let node: Element | null = target; node && node !== event.currentTarget; node = node.parentElement) {
        if (node.scrollWidth > node.clientWidth + 1 && /auto|scroll/.test(getComputedStyle(node).overflowX)) return;
      }
      gesture.current = {
        id: event.pointerId, x: event.clientX, y: event.clientY, startedAt: event.timeStamp,
        axis: null, element: event.currentTarget, content: event.currentTarget.querySelector<HTMLElement>('[data-swipe-content]'),
      };
      // Release is observed outside the moving rows and outside the chart too.
      const cancelled = (end: PointerEvent) => { if (gesture.current?.id === end.pointerId) cancel(); };
      window.addEventListener('pointermove', move, { capture: true, passive: false });
      window.addEventListener('pointerup', release, true);
      window.addEventListener('pointercancel', cancelled, true);
      window.addEventListener('blur', cancel);
      detach.current = () => {
        window.removeEventListener('pointermove', move, true);
        window.removeEventListener('pointerup', release, true);
        window.removeEventListener('pointercancel', cancelled, true);
        window.removeEventListener('blur', cancel);
      };
    },
    onDragStart(event: DragEvent<HTMLElement>) { if (gesture.current) event.preventDefault(); },
    onClickCapture(event: MouseEvent<HTMLElement>) {
      if (event.detail && performance.now() < suppressClickUntil.current) {
        event.preventDefault();
        event.stopPropagation();
        suppressClickUntil.current = 0;
      }
    },
  };
}
