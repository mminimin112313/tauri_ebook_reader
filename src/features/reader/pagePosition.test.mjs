import assert from 'node:assert/strict';
import { pageAnchorFromPage, selectPageForAnchor } from './pagePosition.mjs';

const oldPages = [
  { global_index: 0, start_block_index: 0, end_block_index: 4 },
  { global_index: 1, start_block_index: 5, end_block_index: 9 },
  { global_index: 2, start_block_index: 10, end_block_index: 14 },
];

const anchor = pageAnchorFromPage(oldPages[1], 1, oldPages.length);

assert.equal(
  selectPageForAnchor([
    { start_block_index: 0, end_block_index: 2 },
    { start_block_index: 3, end_block_index: 5 },
    { start_block_index: 6, end_block_index: 8 },
  ], anchor),
  1,
);

assert.equal(
  selectPageForAnchor([{ start_block_index: 0, end_block_index: 1 }], { pageIndex: 2, pageCount: 5 }),
  0,
);

assert.equal(
  selectPageForAnchor(new Array(9).fill(null).map((_, index) => ({ global_index: index })), { pageIndex: 2, pageCount: 5 }),
  4,
);

assert.equal(
  selectPageForAnchor([
    { start_block_index: 0, end_block_index: 4 },
    { start_block_index: 5, end_block_index: 8 },
  ], { blockIndex: 99, pageIndex: 0, pageCount: 1 }),
  1,
  'block jumps beyond the current preview range land on the closest available later page, not the stale first-page fallback',
);
