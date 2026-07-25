/**
 * Folds the genuinely interesting quiz answers into the Bar Talk deck.
 *
 * Only questions flagged `fun` qualify, and only their explanation is used —
 * a fact should read as a story, not as a leftover answer key. Anything merely
 * definitional ("what does ABV mean") stays out.
 *
 * Idempotent: re-running won't duplicate facts.
 * Run: node scripts/merge_quiz_facts.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const factsPath = join(ROOT, 'data', 'facts.json');

const facts = JSON.parse(readFileSync(factsPath, 'utf8'));
const quiz = JSON.parse(readFileSync(join(ROOT, 'data', 'quiz.json'), 'utf8'));

const key = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 60);
const have = new Set(facts.map(key));

/**
 * A fact has to stand on its own. Explanations that answer the question rather
 * than tell the story are rejected: bare answers ("Goa. Only feni…"), pointers
 * to the other options, and anything opening mid-thought.
 */
function standsAlone(fact) {
  if (fact.length < 60 || fact.length > 260) return false;
  // starts by naming the answer, then explaining: "Goa." / "Wine." / "1954."
  if (/^[A-Z][\w'’-]*( [\w'’-]+)?[.,]/.test(fact) && fact.split(/[.,]/)[0].split(' ').length <= 2) return false;
  // leans on the options or the question
  if (/^(the (first|second|third|other|rest)|all (three|four)|these|both|option|that's|it's|from the|just |only |roughly |equal parts)/i.test(fact))
    return false;
  // opens with a pronoun or bare reference whose subject lived in the question
  if (/^(it|he|she|they|its|his|her|their|this|that|there|no |both|such)\b/i.test(fact)) return false;
  if (/\b(the other(s| three| two)|the second list|option [A-D]|the rest are)\b/i.test(fact)) return false;
  // needs a subject doing something, i.e. a real sentence with a verb early on
  if (!/^[A-Z][^.!?]{20,}\b(is|are|was|were|has|have|had|comes|came|means|meant|takes|took|began|begins|makes|made|built|holds|sits|runs|won|gets|brews|drinks|appears|exists|survived|remains|dates|honours|carries|shares|requires|uses|walks|raids)\b/.test(fact))
    return false;
  return true;
}

let added = 0;
for (const q of quiz) {
  if (!q.fun) continue;
  const fact = q.r.trim();
  if (!standsAlone(fact)) continue;
  if (have.has(key(fact))) continue;
  facts.push(fact);
  have.add(key(fact));
  added++;
}

writeFileSync(factsPath, JSON.stringify(facts, null, 1));
console.log(`Bar Talk deck: ${facts.length} facts (${added} added from the quiz bank).`);
