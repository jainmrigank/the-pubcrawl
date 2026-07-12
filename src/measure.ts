/**
 * Bar measures arrive as free text ("2 oz", "1 1/2 oz", "2-3 oz white").
 * Append the metric equivalent so nobody has to know that 1 oz is 30 ml.
 */
const partToNumber = (part: string): number =>
  part
    .trim()
    .split(/\s+/)
    .reduce((acc, token) => {
      if (token.includes('/')) {
        const [a, b] = token.split('/').map(Number);
        return acc + (b ? a / b : 0);
      }
      const n = Number(token);
      return acc + (Number.isFinite(n) ? n : 0);
    }, 0);

export function formatMeasure(measure: string): string {
  const m = measure.match(/^([\d\s./]+(?:-[\d\s./]+)?)\s*oz\b/i);
  if (!m) return measure;
  const values = m[1].split('-').map(partToNumber).filter((n) => n > 0);
  if (!values.length) return measure;
  const ml = values
    .map((n) => {
      const v = n * 30;
      return Number.isInteger(v) ? String(v) : v.toFixed(1);
    })
    .join('-');
  return `${measure.trim()} (${ml} ml)`;
}
