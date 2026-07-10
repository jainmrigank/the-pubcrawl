import { CategoryGlyph } from '../icons';

/** Small hand-drawn glyph for an ingredient, keyed off its category. */
export function IngredientIcon({ category, size = 20 }: { name?: string; image?: string; category?: string; size?: number }) {
  return (
    <span className="ing-glyph" style={{ width: size, height: size }}>
      <CategoryGlyph category={category} size={size - 2} />
    </span>
  );
}
