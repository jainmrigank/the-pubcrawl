import type { TourId } from '../types';
import { requestTourReplay } from '../tutorial';

const PAGE_NAMES: Record<TourId, string> = {
  landing: 'landing page',
  menu: 'Menu',
  bar: 'Shelf',
  basics: 'Bar Basics',
  tab: 'Tab',
  quiz: 'Quiz',
  watch: 'Watch',
  shorts: 'Shorts',
};

interface ContextualHelpProps {
  tour: TourId;
  className?: string;
}

/** One route-aware Help action in the shared header, including Shorts. */
export function ContextualHelp({ tour, className = '' }: ContextualHelpProps) {
  return (
    <button
      type="button"
      className={`contextual-help header-icon-action ${className}`.trim()}
      onClick={(event) => {
        // Safari does not focus a button on tap. Give the tour an explicit
        // opener so Skip/Escape restores Help rather than an unrelated field.
        event.currentTarget.focus({ preventScroll: true });
        requestTourReplay(tour);
      }}
      aria-label={`Show ${PAGE_NAMES[tour]} tutorial`}
      title="Help"
      data-tip="Help"
    >
      <span aria-hidden="true">?</span>
    </button>
  );
}
