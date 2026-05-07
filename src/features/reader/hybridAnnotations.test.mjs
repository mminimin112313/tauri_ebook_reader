import assert from 'node:assert/strict';
import { annotationMarksForPage, selectionFromCanvasDrag } from './hybridAnnotations.mjs';

const page = {
  global_index: 2,
  textRuns: [
    { text: 'The quick brown fox', x: 40, y: 80, font: '400 20px serif' },
    { text: 'jumps over the lazy dog', x: 40, y: 112, font: '400 20px serif' },
  ],
};

const measureText = (text) => text.length * 10;

const marks = annotationMarksForPage({
  page,
  annotations: [
    { kind: 'highlight', pageIndex: 2, quote: 'quick brown', color: 'yellow' },
    { kind: 'bookmark', pageIndex: 2, quote: '', color: 'blue' },
    { kind: 'highlight', pageIndex: 3, quote: 'lazy dog', color: 'green' },
  ],
  measureText,
});

assert.deepEqual(marks.rects, [
  {
    x: 80,
    y: 62.4,
    width: 110,
    height: 22.799999999999997,
    color: 'yellow',
  },
]);
assert.deepEqual(marks.badges, [{ kind: 'bookmark', color: 'blue' }]);

const pageOnly = annotationMarksForPage({
  page,
  annotations: [{ kind: 'highlight', pageIndex: 2, quote: '', note: 'Page note', color: 'pink' }],
  measureText,
});
assert.deepEqual(pageOnly.rects, []);
assert.deepEqual(pageOnly.badges, [{ kind: 'highlight', color: 'pink' }]);

const splitQuote = annotationMarksForPage({
  page,
  annotations: [{ kind: 'highlight', pageIndex: 2, quote: 'The quick brown fox jumps over', color: 'green' }],
  measureText,
});
assert.equal(splitQuote.rects.length, 2);
assert.equal(splitQuote.rects[0].width, 190);
assert.equal(splitQuote.rects[1].width, 100);

const selection = selectionFromCanvasDrag({
  page,
  start: { x: 82, y: 72 },
  end: { x: 122, y: 72 },
  measureText,
});
assert.equal(selection.quote, 'quick');
assert.deepEqual(selection.rects, [
  {
    x: 80,
    y: 62.4,
    width: 50,
    height: 22.799999999999997,
    color: 'green',
  },
]);

const multiLineSelection = selectionFromCanvasDrag({
  page,
  start: { x: 40, y: 72 },
  end: { x: 140, y: 104 },
  measureText,
});
assert.equal(multiLineSelection.quote, 'The quick brown fox jumps over');
assert.equal(multiLineSelection.rects.length, 2);

console.log('hybridAnnotations tests passed');
