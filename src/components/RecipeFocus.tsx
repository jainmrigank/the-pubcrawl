import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { acquirePageScrollLock } from '../pageScrollLock';
import { formatMeasure } from '../measure';
import { EASE } from '../motion';
import { setBackgroundInert } from '../overlayGate';
import type { RecipeFocusPhase, RecipeFocusSession } from '../recipeFocusTypes';
import { ArrowLeft, GlassIcon, Lock, Unlock } from '../icons';

interface Props {
  session: RecipeFocusSession;
  phase: RecipeFocusPhase;
  onRequestClose: () => void;
  onEntered: () => void;
  onExited: () => void;
}

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

function viewportBox(): Box {
  return { top: 0, left: 0, width: window.innerWidth, height: window.innerHeight };
}

function clippedBox(rect?: DOMRect): Box | null {
  if (!rect) return null;
  const left = Math.max(0, rect.left);
  const top = Math.max(0, rect.top);
  const right = Math.min(window.innerWidth, rect.right);
  const bottom = Math.min(window.innerHeight, rect.bottom);
  if (right - left < 32 || bottom - top < 32) return null;
  return { top, left, width: right - left, height: bottom - top };
}

function visibleBox(element: HTMLElement, fallback?: DOMRect): Box | null {
  return clippedBox(element.isConnected ? element.getBoundingClientRect() : fallback);
}

function returnBox(session: RecipeFocusSession): Box | null {
  if (!session.element.isConnected) return null;
  const current = session.element.getBoundingClientRect();
  const layoutChanged = Math.abs(current.width - session.sourceBounds.width) > 8;
  // Some mobile browsers shift the document when body overflow is locked.
  // The captured viewport-relative box remains the truthful return target in
  // that case. If orientation also changed the card, fading is safer than
  // flying toward geometry from a different layout.
  if (Math.abs(window.scrollY - session.pageScrollY) > 2) {
    return layoutChanged ? null : clippedBox(session.sourceBounds);
  }
  return clippedBox(current);
}

function recipeSourceLabel(session: RecipeFocusSession) {
  if (session.recipe.houseOriginal) return 'House special';
  if (session.recipe.source === 'ai') return 'House special · drafted';
  if (session.recipe.source === 'fallback') return 'Off-menu special · drafted';
  if (session.recipe.iba) return 'Classic';
  return session.vibe.label;
}

export function RecipeFocus({ session, phase, onRequestClose, onEntered, onExited }: Props) {
  const reducedMotion = useReducedMotion();
  const dialogRef = useRef<HTMLElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const startingWidth = useRef(window.innerWidth);
  const [viewport, setViewport] = useState(viewportBox);
  const [locked, setLocked] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const initialBox = useMemo(() => visibleBox(session.element, session.sourceBounds), [session]);
  const exitBox = phase === 'closing' ? returnBox(session) : null;
  const useSpatialEntrance = Boolean(initialBox && !reducedMotion);
  const useSpatialExit = Boolean(exitBox && !reducedMotion);
  const methodParagraphs = session.recipe.instructions
    ? session.recipe.instructions.split(/\n+/).map((part) => part.trim()).filter(Boolean)
    : [];

  useLayoutEffect(() => {
    const owner = `recipe-focus:${session.token}`;
    const releaseScroll = acquirePageScrollLock(owner);
    const restoreInert = setBackgroundInert(true, '.recipe-focus-portal');
    const previousOrigin = session.element.dataset.recipeFocusOrigin;
    session.element.dataset.recipeFocusOrigin = 'true';
    document.documentElement.dataset.recipeFocus = 'true';
    const frame = window.requestAnimationFrame(() => backRef.current?.focus({ preventScroll: true }));
    return () => {
      window.cancelAnimationFrame(frame);
      if (previousOrigin == null) delete session.element.dataset.recipeFocusOrigin;
      else session.element.dataset.recipeFocusOrigin = previousOrigin;
      delete document.documentElement.dataset.recipeFocus;
      restoreInert();
      releaseScroll();
    };
  }, [session]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onRequestClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      ) ?? []);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onRequestClose]);

  useEffect(() => {
    const onResize = () => {
      const nextWidth = window.innerWidth;
      setViewport(viewportBox());
      if (locked && Math.abs(nextWidth - startingWidth.current) > 32) {
        setLocked(false);
        setAnnouncement('View unlocked after the layout changed.');
      }
      startingWidth.current = nextWidth;
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, [locked]);

  const toggleLock = () => {
    setLocked((current) => {
      const next = !current;
      setAnnouncement(next ? 'View locked. Unlock to scroll.' : 'View unlocked.');
      return next;
    });
  };

  const start = initialBox ?? viewport;
  const target = phase === 'closing' && useSpatialExit ? exitBox as Box : viewport;
  const duration = reducedMotion ? 0.12 : phase === 'closing' ? 0.38 : 0.48;

  const surface = (
    <div className="recipe-focus-portal">
      <motion.section
        ref={dialogRef}
        className="recipe-focus"
        role="dialog"
        aria-modal="true"
        aria-labelledby="recipe-focus-title"
        aria-describedby="recipe-focus-description"
        data-phase={phase}
        data-locked={locked ? 'true' : 'false'}
        initial={useSpatialEntrance
          ? { ...start, borderRadius: 16, opacity: 1 }
          : { ...viewport, borderRadius: 0, opacity: 0 }}
        animate={{
          ...target,
          borderRadius: phase === 'closing' && useSpatialExit ? 16 : 0,
          opacity: phase === 'closing' && !useSpatialExit ? 0 : 1,
        }}
        transition={{ duration, ease: EASE }}
        onAnimationComplete={() => {
          if (phase === 'opening') onEntered();
          if (phase === 'closing') onExited();
        }}
      >
        <motion.div
          className="recipe-focus-content"
          initial={{ opacity: reducedMotion ? 1 : 0 }}
          animate={{ opacity: phase === 'closing' ? 0 : 1 }}
          transition={{ duration: reducedMotion ? 0.01 : 0.13, delay: phase === 'opening' ? 0.11 : 0 }}
        >
          <div className="recipe-focus-toolbar">
            <button ref={backRef} type="button" className="recipe-focus-back" onClick={onRequestClose}>
              <ArrowLeft size={18} />
              <span>{session.returnLabel || 'Back to card'}</span>
            </button>
            <span className="recipe-focus-toolbar-name" aria-hidden="true">{session.recipe.name}</span>
            <button
              type="button"
              className="recipe-focus-lock"
              onClick={toggleLock}
              aria-pressed={locked}
              aria-label={locked ? 'Unlock recipe view to scroll' : 'Lock recipe view at this position'}
            >
              {locked ? <Unlock size={17} /> : <Lock size={17} />}
              <span>{locked ? 'Unlock view' : 'Lock view'}</span>
            </button>
          </div>

          <div
            ref={scrollerRef}
            className={`recipe-focus-scroller ${locked ? 'is-locked' : ''}`}
            onWheel={locked ? (event) => event.preventDefault() : undefined}
            onTouchMove={locked ? (event) => event.preventDefault() : undefined}
          >
            <article className="recipe-focus-sheet">
              <div className="recipe-focus-intro">
                <figure className="recipe-focus-photo">
                  {session.recipe.thumb && !imageFailed ? (
                    <img src={session.recipe.thumb} alt={session.recipe.name} decoding="async" onError={() => setImageFailed(true)} />
                  ) : (
                    <div role="img" aria-label="No verified photo available">
                      <GlassIcon glass={session.recipe.glass} size={80} />
                      <span className="k-label">No photo</span>
                    </div>
                  )}
                </figure>
              <header className="recipe-focus-heading">
                <p className="recipe-focus-eyebrow k-label">{recipeSourceLabel(session)}</p>
                <h1 id="recipe-focus-title">{session.recipe.name}</h1>
                {session.recipe.tagline && <p id="recipe-focus-description" className="recipe-focus-tagline">{session.recipe.tagline}</p>}
                {!session.recipe.tagline && <p id="recipe-focus-description" className="sr-only">Full recipe for {session.recipe.name}</p>}
                <div className="recipe-focus-facts" aria-label="Recipe details">
                  <span><GlassIcon glass={session.recipe.glass} size={18} />{session.recipe.glass || 'Any glass'}</span>
                  {session.recipe.alcoholic && <span>{session.recipe.alcoholic}</span>}
                  {session.recipe.category && <span>{session.recipe.category}</span>}
                </div>
              </header>
              </div>

              <div className="recipe-focus-recipe">
                <section className="recipe-focus-ingredients" aria-labelledby="recipe-focus-ingredients-title">
                  <p className="recipe-focus-section-index k-label">01</p>
                  <h2 id="recipe-focus-ingredients-title">Ingredients</h2>
                  <ul>
                    {session.recipe.ingredients.map((ingredient, index) => (
                      <li key={`${ingredient.name}-${index}`} className={ingredient.have === false ? 'is-missing' : ''}>
                        <span className="recipe-focus-ingredient-name">
                          {ingredient.have === false && <span className="recipe-focus-state">Out</span>}
                          <span>{ingredient.name}</span>
                          {ingredient.optional && <span className="recipe-focus-state is-optional">Optional</span>}
                        </span>
                        <span className="recipe-focus-measure">{formatMeasure(ingredient.measure) || '—'}</span>
                      </li>
                    ))}
                  </ul>
                </section>

                <section className="recipe-focus-method" aria-labelledby="recipe-focus-method-title">
                  <p className="recipe-focus-section-index k-label">02</p>
                  <h2 id="recipe-focus-method-title">Method</h2>
                  {methodParagraphs.length ? <ol className="recipe-focus-steps">{methodParagraphs.map((paragraph, index) => (
                    <li key={index}>{paragraph}</li>
                  ))}</ol> : <p>No method available.</p>}
                  <div className="recipe-focus-serving-note">
                    <GlassIcon glass={session.recipe.glass} size={28} />
                    <span className="k-label">Serve in {session.recipe.glass || 'your preferred glass'}</span>
                  </div>
                </section>
              </div>
            </article>
          </div>
          <p className="sr-only" aria-live="polite">{announcement}</p>
        </motion.div>
      </motion.section>
    </div>
  );

  return createPortal(surface, document.body);
}
