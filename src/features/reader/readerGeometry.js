const READER_SIDE_GUTTER = 80;
const READER_BOTTOM_SAFE = 220;
const READER_MIN_PAGE_HEIGHT = 260;
const MAX_TWO_COLUMN_WIDTH = 1200;
const COLUMN_GAP = 64;
const MARGIN_WIDTHS = [800, 720, 640, 560, 480];

export function readerLayoutGeometry(settings = {}, viewport = defaultViewport()) {
  const columns = Math.max(1, Math.min(2, settings.columns || 1));
  const fontSize = settings.font_size || 20;
  const lineHeightPx = fontSize * (settings.line_height || 1.6);
  const availableWidth = Math.max(320, viewport.width - READER_SIDE_GUTTER);
  const targetWidth = columns > 1 ? MAX_TWO_COLUMN_WIDTH : readingMeasureWidth(settings);
  const pageWidth = Math.min(targetWidth, availableWidth);
  const columnGap = columns > 1 ? COLUMN_GAP : 0;
  const columnWidth = columns > 1 ? (pageWidth - columnGap) / 2 : pageWidth;

  return {
    columns,
    fontSize,
    fontFamily: readerFontFamily(settings),
    font: readerFont(settings, fontSize),
    lineHeightPx,
    pageWidth,
    pageHeight: Math.max(READER_MIN_PAGE_HEIGHT, viewport.height - READER_BOTTOM_SAFE),
    columnGap,
    columnWidth: Math.max(180, columnWidth),
    paragraphGap: Math.max(8, lineHeightPx * 0.45),
    cssPageWidth: hybridPageCssWidth(settings),
    cssPageHeight: `calc(100vh - ${READER_BOTTOM_SAFE}px)`,
  };
}

export function readingMeasureWidth(settings = {}) {
  return MARGIN_WIDTHS[Math.min(4, Math.max(0, (settings.margin_width || 3) - 1))];
}

export function hybridPageCssWidth(settings = {}) {
  const available = `calc(100vw - ${READER_SIDE_GUTTER}px)`;
  if ((settings.columns || 1) > 1) return `min(${MAX_TWO_COLUMN_WIDTH}px, ${available})`;
  return `min(${readingMeasureWidth(settings)}px, ${available})`;
}

export function readerFontFamily(settings = {}) {
  return settings.font_family === 'sans'
    ? 'Inter, system-ui, sans-serif'
    : 'Newsreader, Georgia, serif';
}

export function quotedReaderFontFamily(settings = {}) {
  return settings.font_family === 'sans'
    ? "'Inter', system-ui, sans-serif"
    : "'Newsreader', Georgia, serif";
}

export function readerFont(settings = {}, fontSize = settings.font_size || 20, weight = null) {
  const family = readerFontFamily(settings);
  return weight ? `${weight} ${fontSize}px ${family}` : `${fontSize}px ${family}`;
}

export function readerCssVars(settings = {}) {
  return {
    '--reading-font': quotedReaderFontFamily(settings),
    '--reading-size': `${settings.font_size || 20}px`,
    '--reading-lh': settings.line_height || 1.6,
    '--reading-max-w': `${readingMeasureWidth(settings)}px`,
    '--reading-align': settings.justify_text ? 'justify' : 'left',
    '--reading-cols': (settings.columns || 1) > 1 ? 2 : 1,
  };
}

function defaultViewport() {
  return {
    width: Math.max(320, globalThis.window?.innerWidth || 1024),
    height: Math.max(420, globalThis.window?.innerHeight || 768),
  };
}
