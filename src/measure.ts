/**
 * Recipe data comes from several sources, so measures are intentionally kept
 * as free text. Flashcards use this formatter to retain the source measure
 * while adding a practical metric equivalent wherever the source gives us a
 * volume or a scalable ratio.
 *
 * The house conversions are deliberately small and predictable:
 * - 1 oz = 30 ml (the convention already used by the app)
 * - 1 part = 30 ml, so ratios remain easy to scale up or down
 * - variable household/bar measures (cups, shots, pints, dashes, etc.) are
 *   marked with `~` instead of pretending that every source uses one size
 */

type MeasureDefinition = {
  /** Regex fragment, ordered from the most specific spelling to the shortest. */
  pattern: string;
  millilitres: number;
  approximate?: boolean;
};

const UNICODE_FRACTIONS: Record<string, string> = {
  '¼': '1/4',
  '½': '1/2',
  '¾': '3/4',
  '⅓': '1/3',
  '⅔': '2/3',
  '⅛': '1/8',
  '⅜': '3/8',
  '⅝': '5/8',
  '⅞': '7/8',
};

const MEASURE_DEFINITIONS: MeasureDefinition[] = [
  { pattern: 'fl\\s*oz', millilitres: 30 },
  { pattern: 'tablespoons?', millilitres: 15 },
  { pattern: 'tblsp', millilitres: 15 },
  { pattern: 'tbsp', millilitres: 15 },
  { pattern: 'teaspoons?', millilitres: 5 },
  { pattern: 'tsp', millilitres: 5 },
  { pattern: 'bar\\s*spoons?', millilitres: 5, approximate: true },
  { pattern: 'barspoons?', millilitres: 5, approximate: true },
  { pattern: 'jiggers?', millilitres: 45, approximate: true },
  { pattern: 'measures?', millilitres: 30, approximate: true },
  { pattern: 'shots?', millilitres: 30, approximate: true },
  { pattern: 'parts?', millilitres: 30, approximate: true },
  { pattern: 'dash(?:es)?', millilitres: 1, approximate: true },
  { pattern: 'cups?', millilitres: 240, approximate: true },
  { pattern: 'pints?', millilitres: 473, approximate: true },
  { pattern: 'fifths?', millilitres: 750, approximate: true },
  { pattern: 'quarts?', millilitres: 946, approximate: true },
  { pattern: 'qt', millilitres: 946, approximate: true },
  { pattern: 'gallons?', millilitres: 3785, approximate: true },
  { pattern: 'gal', millilitres: 3785, approximate: true },
  { pattern: 'dl', millilitres: 100 },
  { pattern: 'cl', millilitres: 10 },
  { pattern: 'oz', millilitres: 30 },
  { pattern: 'lit(?:re|er)s?', millilitres: 1000 },
  { pattern: 'l', millilitres: 1000 },
];

const MEASURE_UNIT_PATTERN = MEASURE_DEFINITIONS.map((definition) => definition.pattern).join('|');
const MEASURE_RE = new RegExp(
  `^([\\d\\s./¼½¾⅓⅔⅛⅜⅝⅞]+(?:\\s*-\\s*[\\d\\s./¼½¾⅓⅔⅛⅜⅝⅞]+)?)\\s*(${MEASURE_UNIT_PATTERN})(?=\\b|\\s|$)`,
  'i'
);

const replaceUnicodeFractions = (value: string): string =>
  value.replace(/[¼½¾⅓⅔⅛⅜⅝⅞]/g, (fraction) => UNICODE_FRACTIONS[fraction] || fraction);

/** Convert a mixed number such as `1 1/2` or `½` to a numeric value. */
const numericExpressionToNumber = (value: string): number => {
  const normalized = replaceUnicodeFractions(value).replace(/−/g, '-').trim();
  if (!normalized || normalized.includes('-')) return Number.NaN;
  return normalized.split(/\s+/).reduce((total, token) => {
    if (token.includes('/')) {
      const [numerator, denominator] = token.split('/').map(Number);
      if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return Number.NaN;
      return total + numerator / denominator;
    }
    const number = Number(token);
    return Number.isFinite(number) ? total + number : Number.NaN;
  }, 0);
};

const formatMillilitres = (value: number): string => {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace(/\.0$/, '');
};

/**
 * Append a metric equivalent to a source recipe measure.
 *
 * Unknown or non-volume measures ("1 slice", "to taste", "1 bottle", etc.)
 * are returned unchanged: inventing a millilitre value for those would be
 * less useful than showing the source wording honestly.
 */
export function formatMeasure(measure: string): string {
  const trimmed = String(measure ?? '').trim();
  if (!trimmed) return '';

  // Do not append a second conversion when a source already supplies ml, or
  // when this formatter has already been applied to a value.
  if (/\d\s*ml\b/i.test(trimmed)) return trimmed;

  const match = trimmed.match(MEASURE_RE);
  if (!match) return trimmed;

  const expression = match[1];
  const capturedUnit = match[2];
  const resolved = MEASURE_DEFINITIONS.find((candidate) =>
    new RegExp(`^${candidate.pattern}$`, 'i').test(capturedUnit)
  );
  if (!resolved) return trimmed;

  const values = expression.split(/\s*-\s*/).map(numericExpressionToNumber);
  if (!values.length || values.some((value) => !Number.isFinite(value) || value <= 0)) return trimmed;

  const millilitres = values.map((value) => formatMillilitres(value * resolved.millilitres)).join('-');
  const qualifier = resolved.approximate ? '~' : '';
  return `${trimmed} (${qualifier}${millilitres} ml)`;
}
