export function clampProgress(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.min(1, Math.max(0, numeric));
}

export function currentAnnotationTarget({ book, pageDisplay, curChapter, progress }) {
  const pageIndex = Math.max(0, Number(pageDisplay?.index) || 0);
  const pageCount = Math.max(1, Number(pageDisplay?.count) || 1);
  return {
    bookId: book?.id || '',
    pageIndex,
    pageCount,
    spineIndex: Math.max(0, Number(curChapter) || 0),
    progress: clampProgress(progress),
  };
}

export function buildAnnotationInput({
  kind,
  book,
  pageDisplay,
  curChapter,
  progress,
  quote = '',
  note = '',
  color = 'yellow',
}) {
  return {
    ...currentAnnotationTarget({ book, pageDisplay, curChapter, progress }),
    kind,
    quote: quote.trim(),
    note: note.trim(),
    color,
  };
}

export function splitAnnotations(items) {
  const annotations = Array.isArray(items) ? items : [];
  return {
    bookmarks: annotations.filter((item) => item.kind === 'bookmark'),
    highlights: annotations.filter((item) => item.kind === 'highlight'),
  };
}

export function annotationPageLabel(annotation) {
  const page = Math.max(1, (Number(annotation?.pageIndex) || 0) + 1);
  const total = Number(annotation?.pageCount);
  return Number.isFinite(total) && total > 0 ? `Page ${page} / ${total}` : `Page ${page}`;
}
