import assert from 'node:assert/strict';
import {
  annotationPageLabel,
  buildAnnotationInput,
  currentAnnotationTarget,
  splitAnnotations,
} from './readerAnnotations.mjs';

const book = { id: 'book-1' };
const pageDisplay = { index: 16, count: 320 };

assert.deepEqual(
  currentAnnotationTarget({
    book,
    pageDisplay,
    curChapter: 2,
    progress: 1.4,
  }),
  {
    bookId: 'book-1',
    pageIndex: 16,
    pageCount: 320,
    spineIndex: 2,
    progress: 1,
  },
);

assert.deepEqual(
  buildAnnotationInput({
    kind: 'highlight',
    book,
    pageDisplay,
    curChapter: 2,
    progress: 0.25,
    quote: '  selected text  ',
    note: '  memo  ',
    color: 'green',
  }),
  {
    bookId: 'book-1',
    kind: 'highlight',
    pageIndex: 16,
    pageCount: 320,
    spineIndex: 2,
    progress: 0.25,
    quote: 'selected text',
    note: 'memo',
    color: 'green',
  },
);

assert.deepEqual(
  splitAnnotations([
    { id: 'a', kind: 'bookmark' },
    { id: 'b', kind: 'highlight' },
    { id: 'c', kind: 'other' },
  ]),
  {
    bookmarks: [{ id: 'a', kind: 'bookmark' }],
    highlights: [{ id: 'b', kind: 'highlight' }],
  },
);

assert.equal(annotationPageLabel({ pageIndex: 16, pageCount: 320 }), 'Page 17 / 320');
assert.equal(annotationPageLabel({ pageIndex: 0 }), 'Page 1');

console.log('readerAnnotations tests passed');
