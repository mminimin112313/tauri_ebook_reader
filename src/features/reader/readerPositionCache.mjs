const CACHE_KEY = 'libris-reader-position-cache';

export function mergeBookPosition(book, cached) {
  if (!book || !cached) return book;
  if (cached.bookId !== book.id) return book;
  return {
    ...book,
    progress: Number.isFinite(cached.progress) ? cached.progress : book.progress,
    spine_index: Number.isFinite(cached.spineIndex) ? cached.spineIndex : book.spine_index,
    reading_anchor_block_index: cached.blockIndex ?? book.reading_anchor_block_index ?? null,
    reading_anchor_page_index: cached.pageIndex ?? book.reading_anchor_page_index ?? null,
    reading_anchor_page_count: cached.pageCount ?? book.reading_anchor_page_count ?? null,
  };
}

export function readCachedBookPosition(bookId, storage = globalThis.localStorage) {
  if (!bookId || !storage) return null;
  try {
    const parsed = JSON.parse(storage.getItem(CACHE_KEY) || '{}');
    return parsed[bookId] || null;
  } catch {
    return null;
  }
}

export function writeCachedBookPosition(bookId, payload, storage = globalThis.localStorage) {
  if (!bookId || !storage) return;
  try {
    const parsed = JSON.parse(storage.getItem(CACHE_KEY) || '{}');
    parsed[bookId] = {
      bookId,
      progress: payload.progress,
      spineIndex: payload.spineIndex,
      blockIndex: payload.blockIndex ?? null,
      pageIndex: payload.pageIndex ?? null,
      pageCount: payload.pageCount ?? null,
      updatedAt: Date.now(),
    };
    storage.setItem(CACHE_KEY, JSON.stringify(parsed));
  } catch {
    // Local cache is a fast re-entry fallback; backend progress remains canonical.
  }
}
