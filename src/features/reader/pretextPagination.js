import { layout, prepare } from '@chenglou/pretext';
import { readerLayoutGeometry } from './readerGeometry.js';

const BLOCK_SELECTOR = 'h1,h2,h3,h4,h5,h6,p,li,blockquote,pre,table,figure,img,div';

export function composePretextPages({ chapters, settings, title = '' }) {
  const metrics = pageMetrics(settings);
  const pages = [];

  for (const chapter of chapters) {
    const blocks = htmlToBlocks(chapter.html);
    const chapterStart = pages.length;
    let currentBlocks = [];
    let usedHeight = 0;

    const commitPage = () => {
      if (currentBlocks.length === 0) return;
      const localIndex = pages.length - chapterStart;
      pages.push({
        title: chapter.title || title || `Page ${pages.length + 1}`,
        html: currentBlocks.join(''),
        chapter_index: chapter.index || 0,
        local_index: localIndex,
        global_index: pages.length,
      });
      currentBlocks = [];
      usedHeight = 0;
    };

    for (const block of blocks) {
      const measured = measureBlock(block, metrics);
      if (currentBlocks.length > 0 && usedHeight + measured.height > metrics.pageHeight) {
        commitPage();
      }

      if (measured.height > metrics.pageHeight) {
        for (const chunk of splitOversizedBlock(block, metrics)) {
          const chunkMeasured = measureBlock(chunk, metrics);
          if (currentBlocks.length > 0 && usedHeight + chunkMeasured.height > metrics.pageHeight) {
            commitPage();
          }
          currentBlocks.push(chunk.html);
          usedHeight += chunkMeasured.height;
        }
      } else {
        currentBlocks.push(block.html);
        usedHeight += measured.height;
      }
    }

    commitPage();
  }

  if (pages.length === 0) {
    pages.push({
      title: title || 'Page 1',
      html: '',
      chapter_index: 0,
      local_index: 0,
      global_index: 0,
    });
  }

  return {
    kind: 'pretext',
    title,
    pages,
    index: 0,
    total: pages.length,
    can_render: true,
    message: '',
  };
}

function pageMetrics(settings) {
  const geometry = readerLayoutGeometry(settings);
  return {
    columns: geometry.columns,
    font: geometry.font,
    lineHeightPx: geometry.lineHeightPx,
    pageHeight: geometry.pageHeight,
    columnWidth: geometry.columnWidth,
  };
}

function htmlToBlocks(html) {
  const doc = new DOMParser().parseFromString(`<main>${html || ''}</main>`, 'text/html');
  const root = doc.querySelector('main');
  if (!root) return [];

  const topLevel = Array.from(root.children);
  const candidates = topLevel.length > 0 ? topLevel : Array.from(root.querySelectorAll(BLOCK_SELECTOR));
  const blocks = [];

  for (const node of candidates) {
    if (node.matches?.(BLOCK_SELECTOR)) {
      blocks.push(nodeToBlock(node));
    } else {
      const nested = Array.from(node.querySelectorAll(BLOCK_SELECTOR));
      if (nested.length > 0) blocks.push(...nested.map(nodeToBlock));
    }
  }

  if (blocks.length === 0) {
    const text = root.textContent?.trim();
    if (text) blocks.push({ html: `<p>${escapeHtml(text)}</p>`, text, tag: 'p' });
  }
  return blocks;
}

function nodeToBlock(node) {
  return {
    html: node.outerHTML,
    text: node.textContent?.replace(/\s+/g, ' ').trim() || '',
    tag: node.tagName.toLowerCase(),
  };
}

function measureBlock(block, metrics) {
  if (block.tag === 'img') {
    return { height: metrics.pageHeight * 0.65 };
  }

  const text = block.text || stripHtml(block.html);
  if (!text) return { height: metrics.lineHeightPx };

  const headingMultiplier = block.tag === 'h1' ? 1.8 : block.tag === 'h2' || block.tag === 'h3' ? 1.35 : 1;
  const blockMargin = block.tag.startsWith('h') ? metrics.lineHeightPx * 0.8 : metrics.lineHeightPx * 0.45;
  const prepared = prepare(text, metrics.font, { wordBreak: 'keep-all' });
  const result = layout(prepared, metrics.columnWidth, metrics.lineHeightPx * headingMultiplier);
  return {
    height: Math.ceil(result.height / metrics.columns) + blockMargin,
  };
}

function splitOversizedBlock(block, metrics) {
  const text = block.text || stripHtml(block.html);
  if (!text) return [block];

  const chunks = [];
  const parts = text.split(/(?<=[.!?。！？])\s+|\n+/u).flatMap((part) => {
    const trimmed = part.trim();
    if (!trimmed) return [];
    const measured = measureBlock({ ...block, text: trimmed, html: wrapText(block.tag, trimmed) }, metrics);
    if (measured.height <= metrics.pageHeight) return [trimmed];
    return splitByWords(trimmed, block, metrics);
  });

  let current = '';
  for (const part of parts) {
    const next = current ? `${current} ${part}` : part;
    if (current && measureBlock({ ...block, text: next, html: wrapText(block.tag, next) }, metrics).height > metrics.pageHeight) {
      chunks.push({ ...block, text: current, html: wrapText(block.tag, current) });
      current = part;
      continue;
    }
    current = next;
  }
  if (current) chunks.push({ ...block, text: current, html: wrapText(block.tag, current) });
  return chunks.length > 0 ? chunks : [block];
}

function splitByWords(text, block, metrics) {
  const chunks = [];
  let current = '';
  for (const word of text.split(/\s+/u)) {
    const next = current ? `${current} ${word}` : word;
    const measured = measureBlock({ ...block, text: next, html: wrapText(block.tag, next) }, metrics);
    if (current && measured.height > metrics.pageHeight) {
      chunks.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function wrapText(tag, text) {
  const safeTag = tag && !['img', 'table', 'figure'].includes(tag) ? tag : 'p';
  return `<${safeTag}>${escapeHtml(text)}</${safeTag}>`;
}

function stripHtml(html) {
  return new DOMParser().parseFromString(html || '', 'text/html').body.textContent || '';
}

function escapeHtml(text) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
