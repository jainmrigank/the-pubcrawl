import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight } from '../icons';
import type { TourId, TourStep } from '../types';
import { readTourOutcome, requestTourReplay, saveTourOutcome, TOURS } from '../tutorial';
import { OVERLAY_PRIORITY, overlayGate, setBackgroundInert } from '../overlayGate';

interface GuidedTourProps {
  id: TourId;
  active: boolean;
}

interface Rect {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

type Side = TourStep['preferredSide'];

interface Geometry {
  target: Rect;
  popover: { top: number; left: number; width: number };
  side: Side;
}

function visibleViewport() {
  const viewport = window.visualViewport;
  return {
    top: viewport?.offsetTop ?? 0,
    left: viewport?.offsetLeft ?? 0,
    width: viewport?.width ?? window.innerWidth,
    height: viewport?.height ?? window.innerHeight,
  };
}

function opposite(side: Side): Side {
  if (side === 'top') return 'bottom';
  if (side === 'bottom') return 'top';
  if (side === 'left') return 'right';
  return 'left';
}

function nearlyEqual(a: number, b: number) {
  return Math.abs(a - b) < 0.5;
}

export function GuidedTour({ id, active }: GuidedTourProps) {
  const definition = TOURS[id];
  const gateId = `guided-tour:${id}`;
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [geometry, setGeometry] = useState<Geometry | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const firstButtonRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const autoReadyRef = useRef(false);
  const reducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const finish = useCallback((outcome: 'completed' | 'skipped') => {
    saveTourOutcome(id, outcome);
    autoReadyRef.current = false;
    setOpen(false);
    setGeometry(null);
    overlayGate.release(gateId);
    openerRef.current?.focus();
  }, [gateId, id]);

  const calculate = useCallback(() => {
    const step = definition.steps[stepIndex];
    const element = step && document.querySelector<HTMLElement>(step.target);
    if (!element) {
      setGeometry(null);
      return;
    }

    const raw = element.getBoundingClientRect();
    const viewport = visibleViewport();
    const viewportRight = viewport.left + viewport.width;
    const viewportBottom = viewport.top + viewport.height;
    const target: Rect = {
      top: Math.max(viewport.top, raw.top),
      left: Math.max(viewport.left, raw.left),
      right: Math.min(viewportRight, raw.right),
      bottom: Math.min(viewportBottom, raw.bottom),
      width: 0,
      height: 0,
    };
    target.width = Math.max(0, target.right - target.left);
    target.height = Math.max(0, target.bottom - target.top);

    const margin = 12;
    const gap = 18;
    const width = Math.min(286, Math.max(220, viewport.width - margin * 2));
    const height = popoverRef.current?.offsetHeight || 190;
    const available: Record<Side, number> = {
      top: target.top - viewport.top,
      right: viewportRight - target.right,
      bottom: viewportBottom - target.bottom,
      left: target.left - viewport.left,
    };
    const candidates = Array.from(new Set<Side>([
      step.preferredSide,
      opposite(step.preferredSide),
      'bottom',
      'top',
      'right',
      'left',
    ]));
    const fits = (candidate: Side) => available[candidate] >= (candidate === 'top' || candidate === 'bottom' ? height : width) + gap;
    const side = candidates.find(fits) || candidates.reduce((best, candidate) => available[candidate] > available[best] ? candidate : best);

    let top = target.top + target.height / 2 - height / 2;
    let left = target.left + target.width / 2 - width / 2;
    if (side === 'top') top = target.top - height - gap;
    if (side === 'bottom') top = target.bottom + gap;
    if (side === 'left') left = target.left - width - gap;
    if (side === 'right') left = target.right + gap;
    top = Math.max(viewport.top + margin, Math.min(viewportBottom - height - margin, top));
    left = Math.max(viewport.left + margin, Math.min(viewportRight - width - margin, left));

    const next: Geometry = { target, popover: { top, left, width }, side };
    setGeometry((current) => current
      && current.side === next.side
      && nearlyEqual(current.target.top, next.target.top)
      && nearlyEqual(current.target.left, next.target.left)
      && nearlyEqual(current.target.width, next.target.width)
      && nearlyEqual(current.target.height, next.target.height)
      && nearlyEqual(current.popover.top, next.popover.top)
      && nearlyEqual(current.popover.left, next.popover.left)
      ? current
      : next);
  }, [definition.steps, stepIndex]);

  const begin = useCallback((force = false) => {
    if (!active || (!force && readTourOutcome(id))) return;
    if (!overlayGate.acquire(gateId, OVERLAY_PRIORITY.tour)) return;
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setStepIndex(0);
    setGeometry(null);
    setOpen(true);
  }, [active, gateId, id]);

  useEffect(() => {
    if (!active) {
      autoReadyRef.current = false;
      setOpen(false);
      setGeometry(null);
      overlayGate.release(gateId);
      return;
    }
    const timer = window.setTimeout(() => {
      autoReadyRef.current = true;
      begin(false);
    }, 700);
    const retryWaitingTour = () => {
      if (autoReadyRef.current && overlayGate.active !== gateId) begin(false);
    };
    const replay = (event: Event) => {
      if ((event as CustomEvent).detail === id) begin(true);
    };
    const unsubscribe = overlayGate.subscribe(retryWaitingTour);
    window.addEventListener('pubcrawl:replay-tour', replay);
    return () => {
      window.clearTimeout(timer);
      unsubscribe();
      window.removeEventListener('pubcrawl:replay-tour', replay);
    };
  }, [active, begin, gateId, id]);

  useEffect(() => overlayGate.subscribe(() => {
    if (open && overlayGate.active !== gateId) {
      setOpen(false);
      setGeometry(null);
    }
  }), [gateId, open]);

  useEffect(() => {
    if (!open) return;
    const restore = setBackgroundInert(true, '.guided-tour');
    return () => restore();
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const step = definition.steps[stepIndex];
    let cancelled = false;
    let quietTimer = 0;
    let missingTimer = 0;
    let observer: MutationObserver | null = null;

    const advanceMissing = () => {
      if (cancelled) return;
      if (stepIndex + 1 >= definition.steps.length) finish('completed');
      else setStepIndex((index) => index + 1);
    };
    const settle = () => {
      window.clearTimeout(quietTimer);
      quietTimer = window.setTimeout(() => {
        if (!cancelled) window.requestAnimationFrame(calculate);
      }, reducedMotion ? 0 : 120);
    };
    const align = (element: HTMLElement) => {
      observer?.disconnect();
      window.clearTimeout(missingTimer);
      element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: reducedMotion ? 'auto' : 'smooth' });
      document.addEventListener('scroll', settle, true);
      settle();
    };
    const element = document.querySelector<HTMLElement>(step.target);
    if (element) align(element);
    else {
      observer = new MutationObserver(() => {
        const appeared = document.querySelector<HTMLElement>(step.target);
        if (appeared) align(appeared);
      });
      observer.observe(document.body, { childList: true, subtree: true });
      missingTimer = window.setTimeout(() => {
        observer?.disconnect();
        advanceMissing();
      }, 500);
    }
    return () => {
      cancelled = true;
      observer?.disconnect();
      window.clearTimeout(quietTimer);
      window.clearTimeout(missingTimer);
      document.removeEventListener('scroll', settle, true);
    };
  }, [calculate, definition.steps, finish, open, reducedMotion, stepIndex]);

  useEffect(() => {
    if (!open) return;
    let frame = 0;
    const schedule = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(calculate);
    };
    const target = document.querySelector<HTMLElement>(definition.steps[stepIndex]?.target || '');
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    if (target) resizeObserver?.observe(target);
    if (popoverRef.current) resizeObserver?.observe(popoverRef.current);
    window.addEventListener('resize', schedule);
    window.addEventListener('orientationchange', schedule);
    document.addEventListener('scroll', schedule, true);
    window.visualViewport?.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('scroll', schedule);
    schedule();
    return () => {
      resizeObserver?.disconnect();
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('orientationchange', schedule);
      document.removeEventListener('scroll', schedule, true);
      window.visualViewport?.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('scroll', schedule);
    };
  }, [calculate, definition.steps, open, stepIndex]);

  const geometryReady = Boolean(geometry);

  useEffect(() => {
    if (!open || !geometryReady) return;
    firstButtonRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); finish('skipped'); return; }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(popoverRef.current?.querySelectorAll<HTMLElement>('button, a, [tabindex]:not([tabindex="-1"])') || []);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [finish, geometryReady, open, stepIndex]);

  if (!open || !geometry || typeof document === 'undefined') return null;
  const step = definition.steps[stepIndex];
  if (!step) return null;
  const { target, popover, side } = geometry;
  const scrim = { position: 'fixed' as const, background: 'rgb(0 0 0 / 0.72)', zIndex: 140 };

  return createPortal(
    <div className="guided-tour" role="dialog" aria-modal="true" aria-labelledby={`guided-tour-${id}-title`}>
      <div style={{ ...scrim, left: 0, right: 0, top: 0, height: Math.max(0, target.top - 8) }} />
      <div style={{ ...scrim, left: 0, width: Math.max(0, target.left - 8), top: target.top - 8, height: target.height + 16 }} />
      <div style={{ ...scrim, left: target.right + 8, right: 0, top: target.top - 8, height: target.height + 16 }} />
      <div style={{ ...scrim, left: 0, right: 0, top: target.bottom + 8, bottom: 0 }} />
      <div className="guided-tour-focus" style={{ top: target.top - 8, left: target.left - 8, width: target.width + 16, height: target.height + 16 }} aria-hidden="true" />
      <div ref={popoverRef} className="guided-tour-popover" data-side={side} style={{ top: popover.top, left: popover.left, width: popover.width }}>
        <span className="guided-tour-arrow" aria-hidden="true"><ArrowRight size={20} /></span>
        <span className="k-label dim">{stepIndex + 1} / {definition.steps.length}</span>
        <h2 id={`guided-tour-${id}-title`}>{step.label}</h2>
        <p>{step.body}</p>
        <div className="guided-tour-actions">
          <button ref={firstButtonRef} type="button" className="text-btn" onClick={() => finish('skipped')}>SKIP</button>
          {stepIndex > 0 && <button type="button" className="text-btn" onClick={() => setStepIndex((index) => Math.max(0, index - 1))}>BACK</button>}
          <button type="button" className="btn btn-solid" onClick={() => stepIndex + 1 >= definition.steps.length ? finish('completed') : setStepIndex((index) => index + 1)}>
            {stepIndex + 1 >= definition.steps.length ? 'DONE' : 'NEXT'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export { requestTourReplay };
