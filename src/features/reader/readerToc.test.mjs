import assert from 'node:assert/strict';

const {
  activeTocIndexForPage,
  attachPageTargetsToToc,
  tocFromLayoutBlocks,
  pdfPageToc,
} = await import('./readerToc.js');

const headingToc = tocFromLayoutBlocks([
  { block_type: 'text', text: 'Preface copy', chapter_index: 0 },
  { block_type: 'heading', text: 'Chapter One', html: '<h1>Chapter One</h1>', chapter_index: 0 },
  { block_type: 'heading', text: 'Details', html: '<h3>Details</h3>', chapter_index: 0 },
  { block_type: 'table', html: '<table><tr><td>Ignored</td></tr></table>', chapter_index: 0 },
]);

assert.deepEqual(headingToc.map((entry) => ({
  title: entry.title,
  level: entry.level,
  index: entry.index,
  blockIndex: entry.blockIndex,
})), [
  { title: 'Chapter One', level: 1, index: 0, blockIndex: 1 },
  { title: 'Details', level: 3, index: 0, blockIndex: 2 },
]);

const fallbackToc = tocFromLayoutBlocks([
  { block_type: 'text', text: 'No heading copy', chapter_index: 2 },
], { title: 'Fallback title' });

assert.deepEqual(fallbackToc, [{
  title: 'Fallback title',
  level: 1,
  index: 2,
  blockIndex: 0,
  pageIndex: 0,
  kind: 'section',
}]);

assert.deepEqual(pdfPageToc(3), [
  { title: 'Page 1', level: 1, index: 0, pageIndex: 0, play_order: 1, kind: 'page' },
  { title: 'Page 2', level: 1, index: 1, pageIndex: 1, play_order: 2, kind: 'page' },
  { title: 'Page 3', level: 1, index: 2, pageIndex: 2, play_order: 3, kind: 'page' },
]);

assert.equal(activeTocIndexForPage([
  { title: 'Intro', index: 0, pageIndex: 0 },
  { title: 'Middle', index: 0, pageIndex: 4 },
  { title: 'Late', index: 0, pageIndex: 9 },
], { index: 6, count: 12 }, 0), 1, 'active TOC follows the nearest previous page target');

assert.equal(activeTocIndexForPage([
  { title: 'Chapter 1', index: 0, pageIndex: null },
  { title: 'Chapter 2', index: 1, pageIndex: null },
], null, 1), 1, 'active TOC falls back to chapter index without page targets');

assert.deepEqual(attachPageTargetsToToc([
  { title: 'Stale section', kind: 'section', blockIndex: 8, pageIndex: 0 },
  { title: 'PDF page', kind: 'page', pageIndex: 4 },
], [
  { start_block_index: 0, end_block_index: 2 },
  { start_block_index: 3, end_block_index: 5 },
  { start_block_index: 6, end_block_index: 9 },
]), [
  { title: 'Stale section', kind: 'section', blockIndex: 8, pageIndex: 2 },
  { title: 'PDF page', kind: 'page', pageIndex: 4 },
], 'section TOC targets are recalculated from block ranges instead of trusting stale predicted pages');
