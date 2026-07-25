/**
 * Merges data/quiz_part*.json into data/quiz.json, validating as it goes, and
 * reports the India/world split and difficulty spread.
 *
 * Question shape (kept terse so the bundle stays small):
 *   q  question text
 *   o  four options; index 0 is the correct one in the source files
 *   a  index of the correct option
 *   d  difficulty 3–10
 *   r  the "why" shown after answering
 *   in true when India-related
 *   fun true when it also works as a Bar Talk fact
 *
 * Options are shuffled here (deterministically per question) so the answer
 * isn't always first in the shipped file.
 *
 * Run: node scripts/build_quiz.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'data');

const files = readdirSync(DATA).filter((f) => /^quiz_part\d+\.json$/.test(f)).sort();
const all = [];
const problems = [];
const seen = new Set();

for (const f of files) {
  const list = JSON.parse(readFileSync(join(DATA, f), 'utf8'));
  list.forEach((item, i) => {
    const where = `${f}[${i}]`;
    if (!item.q || typeof item.q !== 'string') return problems.push(`${where}: missing question`);
    if (!Array.isArray(item.o) || item.o.length !== 4) return problems.push(`${where}: needs exactly 4 options`);
    if (new Set(item.o.map((o) => String(o).toLowerCase())).size !== 4)
      return problems.push(`${where}: duplicate options`);
    if (typeof item.a !== 'number' || item.a < 0 || item.a > 3) return problems.push(`${where}: bad answer index`);
    if (typeof item.d !== 'number' || item.d < 3 || item.d > 10) return problems.push(`${where}: difficulty must be 3-10`);
    if (!item.r) return problems.push(`${where}: missing explanation`);
    const key = item.q.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (seen.has(key)) return problems.push(`${where}: duplicate question "${item.q.slice(0, 40)}"`);
    seen.add(key);
    all.push(item);
  });
}

/* deterministic shuffle so the correct answer isn't always in slot A */
function seededShuffle(arr, seedStr) {
  let h = 2166136261;
  for (const ch of seedStr) h = ((h ^ ch.charCodeAt(0)) * 16777619) >>> 0;
  const rnd = () => ((h = (h * 1103515245 + 12345) >>> 0) / 4294967296);
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const bank = all.map((item, idx) => {
  const correct = item.o[item.a];
  const options = seededShuffle(item.o, item.q);
  return {
    id: `q${String(idx + 1).padStart(3, '0')}`,
    q: item.q,
    o: options,
    a: options.indexOf(correct),
    d: item.d,
    r: item.r,
    ...(item.in ? { in: true } : {}),
    ...(item.fun ? { fun: true } : {}),
  };
});

if (problems.length) {
  console.error('Validation problems:\n' + problems.map((p) => '  - ' + p).join('\n'));
  process.exit(1);
}

writeFileSync(join(DATA, 'quiz.json'), JSON.stringify(bank, null, 1));

const indian = bank.filter((q) => q.in).length;
const tier = (d) => (d <= 5 ? 'easy (3-5)' : d <= 8 ? 'intermediate (6-8)' : 'expert (9-10)');
const tiers = {};
for (const q of bank) tiers[tier(q.d)] = (tiers[tier(q.d)] || 0) + 1;

console.log(`Wrote data/quiz.json with ${bank.length} questions.`);
console.log(`India-related: ${indian} (${Math.round((indian / bank.length) * 100)}%), world: ${bank.length - indian}`);
console.log('Difficulty:', tiers);
console.log(`Fun enough for Bar Talk: ${bank.filter((q) => q.fun).length}`);
