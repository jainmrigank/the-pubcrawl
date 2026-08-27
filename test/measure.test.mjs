import test from 'node:test';
import assert from 'node:assert/strict';
import { formatMeasure } from '../src/measure.ts';

test('adds exact millilitre equivalents for ounce and centilitre measures', () => {
  assert.equal(formatMeasure('1 oz'), '1 oz (30 ml)');
  assert.equal(formatMeasure('1 1/2 oz cream'), '1 1/2 oz cream (45 ml)');
  assert.equal(formatMeasure('2-3 cl'), '2-3 cl (20-30 ml)');
  assert.equal(formatMeasure('2cl'), '2cl (20 ml)');
});

test('adds a scalable metric reference for parts and variable bar measures', () => {
  assert.equal(formatMeasure('1 part'), '1 part (~30 ml)');
  assert.equal(formatMeasure('2 parts'), '2 parts (~60 ml)');
  assert.equal(formatMeasure('1/3 part'), '1/3 part (~10 ml)');
  assert.equal(formatMeasure('1 shot'), '1 shot (~30 ml)');
  assert.equal(formatMeasure('1 dash'), '1 dash (~1 ml)');
  assert.equal(formatMeasure('2 dashes'), '2 dashes (~2 ml)');
});

test('covers common household and metric volume spellings', () => {
  assert.equal(formatMeasure('1 1/2 cup mild'), '1 1/2 cup mild (~360 ml)');
  assert.equal(formatMeasure('1 tblsp'), '1 tblsp (15 ml)');
  assert.equal(formatMeasure('2 tablespoons'), '2 tablespoons (30 ml)');
  assert.equal(formatMeasure('1 tsp ground'), '1 tsp ground (5 ml)');
  assert.equal(formatMeasure('1 jigger'), '1 jigger (~45 ml)');
  assert.equal(formatMeasure('1 fifth'), '1 fifth (~750 ml)');
  assert.equal(formatMeasure('1 L'), '1 L (1000 ml)');
  assert.equal(formatMeasure('1 dl Schweppes'), '1 dl Schweppes (100 ml)');
});

test('keeps existing metric values and non-volume measures unchanged', () => {
  assert.equal(formatMeasure('70ml/2fl oz'), '70ml/2fl oz');
  assert.equal(formatMeasure('1 oz (30 ml)'), '1 oz (30 ml)');
  assert.equal(formatMeasure('1 slice'), '1 slice');
  assert.equal(formatMeasure('1 bottle'), '1 bottle');
  assert.equal(formatMeasure('to taste'), 'to taste');
  assert.equal(formatMeasure(''), '');
});

test('understands unicode fractions without changing the source wording', () => {
  assert.equal(formatMeasure('½ oz'), '½ oz (15 ml)');
  assert.equal(formatMeasure('¾ cl'), '¾ cl (7.5 ml)');
});
