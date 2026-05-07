import assert from 'node:assert/strict';
import { filterBooks, libraryFacets, normalizeTags } from './libraryMetadata.mjs';

const books = [
  { title: 'One', file_type: 'EPUB', category: 'Fiction', tags: ['novel', 'night'], is_favorite: true },
  { title: 'Two', file_type: 'PDF', category: 'Research', tags: ['paper'], last_read: 10, progress: 0.5 },
  { title: 'Three', file_type: 'TXT', category: 'Fiction', tags: 'novel, draft, novel', progress: 0 },
];

assert.deepEqual(normalizeTags('novel, draft, novel'), ['novel', 'draft']);
assert.deepEqual(libraryFacets(books).categories, [
  { name: 'Fiction', count: 2 },
  { name: 'Research', count: 1 },
]);
assert.deepEqual(filterBooks(books, 'category:Fiction').map((book) => book.title), ['One', 'Three']);
assert.deepEqual(filterBooks(books, 'tag:paper').map((book) => book.title), ['Two']);
assert.deepEqual(filterBooks(books, 'all', 'draft').map((book) => book.title), ['Three']);
