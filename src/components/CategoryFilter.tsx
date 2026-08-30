import type { BrowseFilter, Vibe } from '../types';
import { parseBrowseFilter, serializeBrowseFilter, VIBE_ORDER } from '../filter';

const FALLBACK_VIBES: Vibe[] = [
  { id: 'tropical', label: 'Tropical', color: '#31695A' },
  { id: 'refreshing', label: 'Fresh & Citrus', color: '#5C7A3B' },
  { id: 'boozy', label: 'Spirit-Forward', color: '#8A5A24' },
  { id: 'sweet', label: 'Dessert', color: '#8E4A5B' },
  { id: 'cozy', label: 'Warm', color: '#A3492B' },
  { id: 'party', label: 'Party & Shots', color: '#4A4E7A' },
  { id: 'zeroproof', label: 'Zero Proof', color: '#6B7A6E' },
];

export interface CategoryFilterProps {
  value: BrowseFilter;
  vibes: Vibe[];
  includeIndia: boolean;
  includeHouse: boolean;
  onChange: (value: BrowseFilter) => void;
  label: string;
}

function labelFor(value: BrowseFilter, vibes: Vibe[]): string {
  if (value.kind === 'all') return 'All';
  if (value.kind === 'collection') return value.id === 'india' ? 'India' : 'House Specials';
  return vibes.find((v) => v.id === value.id)?.label || value.id;
}

export function CategoryFilter({ value, vibes, includeIndia, includeHouse, onChange, label }: CategoryFilterProps) {
  const sourceVibes = vibes.length ? vibes : FALLBACK_VIBES;
  const orderedVibes = VIBE_ORDER.map((id) => sourceVibes.find((v) => v.id === id)).filter(Boolean) as Vibe[];
  return (
    <div className="category-filter" role="group" aria-label={label}>
      <span className="k-label dim category-filter-label">CATEGORY</span>
      <select
        className="category-filter-select"
        aria-label={label}
        value={serializeBrowseFilter(value)}
        onChange={(event) => onChange(parseBrowseFilter(event.target.value))}
      >
        <option value="all">All</option>
        <optgroup label="Moods">
          {orderedVibes.map((vibe) => (
            <option key={vibe.id} value={`category:${vibe.id}`}>
              {vibe.label}
            </option>
          ))}
        </optgroup>
        {(includeIndia || includeHouse) && (
          <optgroup label="Collections">
            {includeIndia && <option value="collection:india">India</option>}
            {includeHouse && <option value="collection:house">House Specials</option>}
          </optgroup>
        )}
      </select>
      <div className="vibe-pills" aria-label={label}>
        <button
          type="button"
          className={`vibe-chip ${value.kind === 'all' ? 'on' : ''}`}
          onClick={() => onChange({ kind: 'all' })}
          aria-pressed={value.kind === 'all'}
        >
          ALL
        </button>
        {orderedVibes.map((vibe) => {
          const selected = value.kind === 'category' && value.id === vibe.id;
          return (
            <button
              type="button"
              key={vibe.id}
              className={`vibe-chip ${selected ? 'on' : ''}`}
              style={{ ['--vc' as string]: vibe.color }}
              onClick={() => onChange(selected ? { kind: 'all' } : { kind: 'category', id: vibe.id })}
              aria-pressed={selected}
            >
              <i className="swatch" />
              {vibe.label.toUpperCase()}
            </button>
          );
        })}
        {includeIndia && (
          <button
            type="button"
            className={`vibe-chip ${value.kind === 'collection' && value.id === 'india' ? 'on' : ''}`}
            style={{ ['--vc' as string]: '#B0722E' }}
            onClick={() => onChange(value.kind === 'collection' && value.id === 'india' ? { kind: 'all' } : { kind: 'collection', id: 'india' })}
            aria-pressed={value.kind === 'collection' && value.id === 'india'}
          >
            <i className="swatch" /> INDIA
          </button>
        )}
        {includeHouse && (
          <button
            type="button"
            className={`vibe-chip ${value.kind === 'collection' && value.id === 'house' ? 'on' : ''}`}
            style={{ ['--vc' as string]: '#9B4E32' }}
            onClick={() => onChange(value.kind === 'collection' && value.id === 'house' ? { kind: 'all' } : { kind: 'collection', id: 'house' })}
            aria-pressed={value.kind === 'collection' && value.id === 'house'}
          >
            <i className="swatch" /> HOUSE SPECIALS
          </button>
        )}
      </div>
      <span className="sr-only">Selected: {labelFor(value, vibes)}</span>
    </div>
  );
}
