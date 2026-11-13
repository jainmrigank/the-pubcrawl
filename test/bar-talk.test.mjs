import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const facts = JSON.parse(readFileSync(new URL('../data/facts.json', import.meta.url)));
const notes = JSON.parse(readFileSync(new URL('../data/facts.sources.json', import.meta.url)));

test('researched Bar Talk stories are in the shared app and notification deck with usable attribution', () => {
  assert.ok(Object.keys(notes).length >= 50);
  assert.equal(new Set(facts).size, facts.length);
  const researchIds = new Set();
  for (const [text, note] of Object.entries(notes)) {
    assert.ok(facts.includes(text), `Source note has no shared story: ${note.researchId}`);
    assert.ok(text.length >= 60 && text.length <= 300, `Story needs editing: ${note.researchId}`);
    assert.ok(!researchIds.has(note.researchId));
    researchIds.add(note.researchId);
    assert.ok(note.sources.length > 0);
    for (const source of note.sources) {
      assert.equal(new URL(source.url).protocol, 'https:');
      assert.ok(source.title.trim() && source.publisher.trim());
    }
  }
});
