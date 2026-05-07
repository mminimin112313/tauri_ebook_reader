import assert from 'node:assert/strict';

const { shouldPersistProgress } = await import('./readerProgress.mjs');

assert.equal(shouldPersistProgress({
  nextProgress: 0.1004,
  nextSpineIndex: 0,
  lastProgress: 0.1,
  lastSpineIndex: 0,
}), false, 'tiny progress changes are kept local');

assert.equal(shouldPersistProgress({
  nextProgress: 0.108,
  nextSpineIndex: 0,
  lastProgress: 0.1,
  lastSpineIndex: 0,
}), true, 'meaningful progress changes are persisted');

assert.equal(shouldPersistProgress({
  nextProgress: 0.1001,
  nextSpineIndex: 3,
  lastProgress: 0.1,
  lastSpineIndex: 2,
}), true, 'chapter changes are persisted even when percent barely changes');
