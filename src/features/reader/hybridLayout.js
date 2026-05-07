import { readerFont, readerLayoutGeometry, readingMeasureWidth } from './readerGeometry.js';

const MAX_TEXT_LAYOUT_CACHE = 750;
const MAX_WIDE_OVERLAY_WIDTH = 860;
const MAX_TABLE_WIDTH = 860;
const MAX_MERMAID_WIDTH = 860;

export function composeHybridPages({ blocks, settings, title = '', ink = null, maxPages = Infinity }) {
  const metrics = pageMetrics(settings);
  const pages = [];
  let page = newPage(title, 0);
  let column = 0;
  let y = 0;
  let blockIndex = 0;
  let reachedLimit = false;

  const commit = () => {
    if (page.textRuns.length === 0 && page.overlays.length === 0) return;
    pages.push(page);
    if (pages.length >= maxPages) {
      reachedLimit = true;
      return;
    }
    page = newPage(title, pages.length);
    column = 0;
    y = 0;
  };

  const nextColumn = () => {
    if (column + 1 < metrics.columns) {
      column += 1;
      y = 0;
      return;
    }
    commit();
  };

  const ensureSpace = (height) => {
    if (y > 0 && y + Math.min(height, metrics.pageHeight) > metrics.pageHeight) {
      nextColumn();
    }
  };

  const markBlock = (index) => {
    if (!Number.isFinite(page.start_block_index)) page.start_block_index = index;
    page.end_block_index = index;
  };

  for (const block of blocks || []) {
    if (reachedLimit) break;
    const type = block.block_type || block.type || 'text';
    const currentBlockIndex = blockIndex;
    blockIndex += 1;
    if (type === 'heading') {
      const headingMetrics = headingTextMetrics(block, metrics);
      const lines = layoutTextLines(block.text || stripHtml(block.html), headingMetrics);
      if (y > 0) y += headingMetrics.beforeGap;
      for (const line of lines) {
        if (reachedLimit) break;
        ensureSpace(headingMetrics.lineHeightPx);
        if (reachedLimit) break;
        markBlock(currentBlockIndex);
        page.textRuns.push({
          text: line.text,
          x: columnX(column, metrics),
          y: y + headingMetrics.fontSize,
          font: headingMetrics.font,
          color: ink,
        });
        page.chapter_index = block.chapter_index || 0;
        y += headingMetrics.lineHeightPx;
      }
      y += headingMetrics.afterGap;
      continue;
    }

    if (type === 'text') {
      const lines = layoutTextLines(block.text || stripHtml(block.html), metrics);
      for (const line of lines) {
        if (reachedLimit) break;
        ensureSpace(metrics.lineHeightPx);
        if (reachedLimit) break;
        markBlock(currentBlockIndex);
        page.textRuns.push({
          text: line.text,
          x: columnX(column, metrics),
          y: y + metrics.fontSize,
          font: metrics.font,
          color: ink,
        });
        page.chapter_index = block.chapter_index || 0;
        y += metrics.lineHeightPx;
      }
      y += metrics.paragraphGap;
      continue;
    }

    const wideOverlay = isWideOverlay(type) && metrics.columns === 1;

    const overlayHeight = Math.min(overlayBlockHeight(type, metrics, wideOverlay, block.html || ''), metrics.pageHeight);
    const overlayWidth = wideOverlayWidth(type, metrics);
    ensureSpace(overlayHeight);
    if (reachedLimit) break;
    markBlock(currentBlockIndex);
    page.overlays.push({
      type,
      html: block.html || '',
      src: block.src || null,
      x: wideOverlay ? Math.max(0, (metrics.pageWidth - overlayWidth) / 2) : columnX(column, metrics),
      y,
      width: wideOverlay ? overlayWidth : metrics.columnWidth,
      height: overlayHeight,
    });
    page.chapter_index = block.chapter_index || 0;
    y += overlayHeight + metrics.paragraphGap;
  }

  if (!reachedLimit) commit();
  if (pages.length === 0) pages.push(newPage(title, 0));
  return pages.map((item, index) => ({ ...item, global_index: index }));
}

function newPage(title, index) {
  return {
    title: title || `Page ${index + 1}`,
    textRuns: [],
    overlays: [],
    chapter_index: 0,
    global_index: index,
    start_block_index: null,
    end_block_index: null,
  };
}

export function pageMetrics(settings) {
  return readerLayoutGeometry(settings);
}

function headingTextMetrics(block, metrics) {
  const level = headingLevel(block.html);
  const scale = level === 1 ? 1.4 : level === 2 ? 1.24 : level === 3 ? 1.12 : 1.02;
  const fontSize = Math.max(metrics.fontSize + 2, Math.round(metrics.fontSize * scale));
  const lineHeightPx = fontSize * 1.22;
  return {
    ...metrics,
    fontSize,
    font: readerFont({ font_family: metrics.fontFamily?.startsWith('Inter') ? 'sans' : 'serif' }, fontSize, 700),
    lineHeightPx,
    beforeGap: level <= 2 ? metrics.lineHeightPx * 0.65 : metrics.lineHeightPx * 0.35,
    afterGap: metrics.lineHeightPx * 0.35,
  };
}

function headingLevel(html) {
  const match = String(html || '').trim().match(/^<h([1-6])\b/i);
  return match ? Number(match[1]) : 2;
}

function columnX(column, metrics) {
  return column * (metrics.columnWidth + metrics.columnGap);
}

function layoutTextLines(text, metrics) {
  const clean = (text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const cacheKey = `${metrics.font}|${Math.round(metrics.columnWidth)}|${clean}`;
  const cached = textLayoutCache.get(cacheKey);
  if (cached) return cached;

  const lines = wrapTextForCanvas(clean, metrics);
  setTextLayoutCache(cacheKey, lines);
  return lines;
}

function wrapTextForCanvas(text, metrics) {
  const ctx = getMeasureContext(metrics.font);
  const words = text.split(/\s+/u);
  const lines = [];
  let current = '';
  let currentWidth = 0;
  const spaceWidth = measureCached(ctx, metrics.font, ' ');

  for (const word of words) {
    const wordWidth = measureCached(ctx, metrics.font, word);
    const next = current ? `${current} ${word}` : word;
    const nextWidth = current ? currentWidth + spaceWidth + wordWidth : wordWidth;

    if (current && nextWidth > metrics.columnWidth) {
      lines.push({ text: current });
      current = word;
      currentWidth = wordWidth;
    } else {
      current = next;
      currentWidth = nextWidth;
    }
  }
  if (current) lines.push({ text: current });
  return lines;
}

let measureCanvas = null;
const wordWidthCache = new Map();
const textLayoutCache = new Map();

function getMeasureContext(font) {
  if (!measureCanvas) {
    measureCanvas = document.createElement('canvas');
  }
  const ctx = measureCanvas.getContext('2d');
  ctx.font = font;
  return ctx;
}

function measureCached(ctx, font, text) {
  const key = `${font}|${text}`;
  const cached = wordWidthCache.get(key);
  if (cached != null) return cached;
  const width = ctx.measureText(text).width;
  wordWidthCache.set(key, width);
  return width;
}

function setTextLayoutCache(key, lines) {
  if (textLayoutCache.size >= MAX_TEXT_LAYOUT_CACHE) {
    textLayoutCache.delete(textLayoutCache.keys().next().value);
  }
  textLayoutCache.set(key, lines);
}

function isWideOverlay(type) {
  return type === 'table' || type === 'image' || type === 'code' || type === 'math' || type === 'mermaid' || type === 'footnote';
}

function overlayBlockHeight(type, metrics, wide = false, html = '') {
  if (type === 'table') {
    const rows = Math.max(2, (String(html).match(/<tr\b/gi) || []).length || 2);
    const estimated = 36 + rows * Math.max(28, metrics.fontSize * 1.55);
    return Math.min(metrics.pageHeight * (wide ? 0.52 : 0.46), Math.max(150, estimated));
  }
  if (type === 'mermaid') return Math.min(metrics.pageHeight * (wide ? 0.54 : 0.46), wide ? 360 : 300);
  if (wide && type === 'footnote') return Math.min(metrics.pageHeight * 0.45, 240);
  if (wide && type === 'image') return Math.min(metrics.pageHeight * 0.86, metrics.pageWidth * 0.62);
  if (wide && type === 'code') return Math.min(metrics.pageHeight * 0.72, 420);
  if (wide && type === 'math') return Math.min(metrics.pageHeight * 0.34, 180);
  if (type === 'image') return Math.min(metrics.pageHeight * 0.72, metrics.columnWidth * 0.75);
  if (type === 'code') return Math.min(metrics.pageHeight * 0.5, 260);
  if (type === 'math') return Math.min(metrics.pageHeight * 0.28, 140);
  return metrics.lineHeightPx * 2;
}

function wideOverlayWidth(type, metrics) {
  if (type === 'mermaid') return Math.min(metrics.pageWidth, MAX_MERMAID_WIDTH);
  if (type === 'table') return Math.min(metrics.pageWidth, MAX_TABLE_WIDTH);
  if (type === 'footnote') return Math.min(metrics.pageWidth, readingMeasureWidth({ margin_width: 2 }));
  return Math.min(metrics.pageWidth, MAX_WIDE_OVERLAY_WIDTH);
}

function stripHtml(html) {
  return new DOMParser().parseFromString(html || '', 'text/html').body.textContent || '';
}
