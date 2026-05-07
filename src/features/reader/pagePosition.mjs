export function pageAnchorFromPage(page, fallbackIndex = 0, fallbackCount = 1) {
  if (!page) {
    return {
      blockIndex: null,
      pageIndex: fallbackIndex,
      pageCount: Math.max(1, fallbackCount),
    };
  }

  return {
    blockIndex: Number.isFinite(page.start_block_index) ? page.start_block_index : null,
    pageIndex: Number.isFinite(page.global_index) ? page.global_index : fallbackIndex,
    pageCount: Math.max(1, fallbackCount),
  };
}

export function selectPageForAnchor(pages, anchor) {
  const pageCount = Math.max(1, pages?.length || 0);
  if (!pages?.length) return 0;

  if (Number.isFinite(anchor?.blockIndex)) {
    const blockMatch = pages.findIndex((page) => (
      Number.isFinite(page.start_block_index)
      && Number.isFinite(page.end_block_index)
      && page.start_block_index <= anchor.blockIndex
      && page.end_block_index >= anchor.blockIndex
    ));
    if (blockMatch >= 0) return blockMatch;

    const nextBlock = pages.findIndex((page) => (
      Number.isFinite(page.start_block_index)
      && page.start_block_index > anchor.blockIndex
    ));
    if (nextBlock >= 0) return nextBlock;

    let lastRangedPage = -1;
    for (let index = pages.length - 1; index >= 0; index -= 1) {
      const page = pages[index];
      if (Number.isFinite(page.start_block_index) && Number.isFinite(page.end_block_index)) {
        lastRangedPage = index;
        break;
      }
    }
    if (lastRangedPage >= 0) return lastRangedPage;
  }

  const previousCount = Math.max(1, anchor?.pageCount || pageCount);
  const previousIndex = Math.max(0, Math.min(previousCount - 1, anchor?.pageIndex || 0));
  const ratio = previousCount > 1 ? previousIndex / (previousCount - 1) : 0;
  return Math.max(0, Math.min(pageCount - 1, Math.round(ratio * (pageCount - 1))));
}
