export function tocFromLayoutBlocks(blocks, options = {}) {
  const entries = [];

  for (const [blockIndex, block] of (blocks || []).entries()) {
    if ((block.block_type || block.type) !== 'heading') continue;
    const title = cleanText(block.text || stripHtml(block.html));
    if (!title) continue;
    entries.push({
      title,
      level: headingLevel(block.html),
      index: Number.isFinite(block.chapter_index) ? block.chapter_index : 0,
      blockIndex,
      pageIndex: null,
      kind: 'section',
    });
  }

  if (entries.length > 0) return entries;

  const title = cleanText(options.title) || 'Document start';
  const first = (blocks || [])[0] || {};
  return [{
    title,
    level: 1,
    index: Number.isFinite(first.chapter_index) ? first.chapter_index : 0,
    blockIndex: 0,
    pageIndex: 0,
    kind: 'section',
  }];
}

export function attachPageTargetsToToc(entries, pages) {
  return (entries || []).map((entry) => {
    if (entry.kind === 'page' && Number.isFinite(entry.pageIndex)) return entry;
    if (!Number.isFinite(entry.blockIndex)) return entry;
    const pageIndex = (pages || []).findIndex((page) => (
      Number.isFinite(page.start_block_index)
      && Number.isFinite(page.end_block_index)
      && page.start_block_index <= entry.blockIndex
      && page.end_block_index >= entry.blockIndex
    ));
    return {
      ...entry,
      pageIndex: pageIndex >= 0 ? pageIndex : null,
    };
  });
}

export function activeTocIndexForPage(entries, pageDisplay, currentChapter = 0) {
  const toc = Array.isArray(entries) ? entries : [];
  if (toc.length === 0) return -1;

  if (pageDisplay && Number.isFinite(pageDisplay.index)) {
    let active = -1;
    for (let i = 0; i < toc.length; i += 1) {
      const pageIndex = toc[i]?.pageIndex;
      if (!Number.isFinite(pageIndex)) continue;
      if (pageIndex <= pageDisplay.index) active = i;
      else break;
    }
    if (active >= 0) return active;

    const firstPageTarget = toc.findIndex((entry) => Number.isFinite(entry.pageIndex));
    if (firstPageTarget >= 0) return firstPageTarget;
  }

  const chapter = Number.isFinite(currentChapter) ? currentChapter : 0;
  const exactChapter = toc.findIndex((entry) => entry.index === chapter);
  return exactChapter >= 0 ? exactChapter : 0;
}

export function tocFromHtml(html, options = {}) {
  if (typeof DOMParser === 'undefined') {
    return tocFromLayoutBlocks([], options);
  }
  const doc = new DOMParser().parseFromString(html || '', 'text/html');
  const headings = Array.from(doc.querySelectorAll('h1,h2,h3,h4,h5,h6'));
  if (headings.length === 0) return tocFromLayoutBlocks([], options);
  return headings.map((node, index) => ({
    title: cleanText(node.textContent) || `Section ${index + 1}`,
    level: Number(node.tagName.slice(1)) || 2,
    index,
    blockIndex: index,
    pageIndex: null,
    kind: 'section',
  }));
}

export function pdfPageToc(pageCount) {
  const count = Math.max(0, Number(pageCount) || 0);
  return Array.from({ length: count }, (_, index) => ({
    title: `Page ${index + 1}`,
    level: 1,
    index,
    pageIndex: index,
    play_order: index + 1,
    kind: 'page',
  }));
}

function headingLevel(html) {
  const match = String(html || '').trim().match(/^<h([1-6])\b/i);
  return match ? Number(match[1]) : 2;
}

function stripHtml(html) {
  if (typeof DOMParser !== 'undefined') {
    return new DOMParser().parseFromString(html || '', 'text/html').body.textContent || '';
  }
  return String(html || '').replace(/<[^>]*>/g, ' ');
}

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}
