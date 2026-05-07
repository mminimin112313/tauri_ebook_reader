import assert from 'node:assert/strict';
import { formatPageDisplay, pageIndexFromSliderValue } from './readerPaging.mjs';

assert.deepEqual(formatPageDisplay({ index: 0, count: 3, pending: true }), {
  current: 1,
  total: '...',
  label: 'Page 1 of calculating',
  ratio: 0,
  canScrub: false,
});

assert.deepEqual(formatPageDisplay({ index: 4, count: 20, pending: false }), {
  current: 5,
  total: 20,
  label: 'Page 5 of 20',
  ratio: 4 / 19,
  canScrub: true,
});

assert.equal(pageIndexFromSliderValue('5', 11), 5);
assert.equal(pageIndexFromSliderValue('999', 11), 10);
assert.equal(pageIndexFromSliderValue('-10', 11), 0);
