import assert from 'node:assert/strict';
import {
  mergeBookPosition,
  readCachedBookPosition,
  writeCachedBookPosition,
} from './readerPositionCache.mjs';

const store = new Map();
const storage = {
  getItem: (key) => store.get(key) || null,
  setItem: (key, value) => store.set(key, value),
};

writeCachedBookPosition('book-a', {
  progress: 0.42,
  spineIndex: 1,
  blockIndex: 24,
  pageIndex: 4,
  pageCount: 12,
}, storage);

const cached = readCachedBookPosition('book-a', storage);
assert.equal(cached.blockIndex, 24);

assert.deepEqual(
  mergeBookPosition({
    id: 'book-a',
    progress: 0,
    spine_index: 0,
    reading_anchor_block_index: null,
    reading_anchor_page_index: null,
    reading_anchor_page_count: null,
  }, cached),
  {
    id: 'book-a',
    progress: 0.42,
    spine_index: 1,
    reading_anchor_block_index: 24,
    reading_anchor_page_index: 4,
    reading_anchor_page_count: 12,
  },
);

assert.equal(mergeBookPosition({ id: 'book-b', progress: 0 }, cached).progress, 0);

console.log('readerPositionCache tests passed');
