export function annotationMarksForPage({ page, annotations, measureText }) {
  const pageIndex = Number(page?.global_index);
  if (!Number.isFinite(pageIndex)) return { rects: [], badges: [] };

  const pageAnnotations = (Array.isArray(annotations) ? annotations : [])
    .filter((annotation) => Number(annotation.pageIndex) === pageIndex);
  const rects = [];
  const badges = [];

  for (const annotation of pageAnnotations) {
    if (annotation.kind === 'bookmark') {
      badges.push({ kind: 'bookmark', color: annotation.color || 'blue' });
      continue;
    }
    if (annotation.kind !== 'highlight') continue;

    const quote = normalizeText(annotation.quote);
    if (!quote) {
      badges.push({ kind: 'highlight', color: annotation.color || 'yellow' });
      continue;
    }

    const matches = matchingTextRunRects({
      quote,
      color: annotation.color || 'yellow',
      textRuns: page.textRuns || [],
      measureText,
    });
    if (matches.length > 0) rects.push(...matches);
    else badges.push({ kind: 'highlight', color: annotation.color || 'yellow' });
  }

  return { rects, badges: compactBadges(badges) };
}

function matchingTextRunRects({ quote, color, textRuns, measureText }) {
  const exact = [];
  for (const run of textRuns) {
    const source = normalizeText(run.text);
    if (!source) continue;
    const match = source.indexOf(quote);
    if (match >= 0) {
      exact.push(rectFromRun({ run, start: match, length: quote.length, color, measureText }));
    }
  }
  if (exact.length > 0) return exact;

  const split = [];
  let remaining = quote;
  for (const run of textRuns) {
    if (!remaining) break;
    const source = normalizeText(run.text);
    if (!source) continue;
    if (remaining.startsWith(source)) {
      split.push(rectFromRun({ run, start: 0, length: source.length, color, measureText }));
      remaining = normalizeText(remaining.slice(source.length));
      continue;
    }
    if (source.startsWith(remaining) && remaining.length > 0) {
      split.push(rectFromRun({ run, start: 0, length: remaining.length, color, measureText }));
      remaining = '';
    }
  }
  return remaining ? [] : split;
}

function rectFromRun({ run, start, length, color, measureText }) {
  const fontSize = fontSizeFromRun(run);
  const prefix = run.text.slice(0, start);
  const text = run.text.slice(start, start + length);
  return {
    x: run.x + measureText(prefix, run.font),
    y: run.y - fontSize * 0.88,
    width: Math.max(fontSize * 0.55, measureText(text, run.font)),
    height: fontSize * 1.14,
    color,
  };
}

function compactBadges(badges) {
  const seen = new Set();
  return badges.filter((badge) => {
    const key = `${badge.kind}:${badge.color}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function fontSizeFromRun(run) {
  const match = String(run?.font || '').match(/(\d+(?:\.\d+)?)px/);
  return match ? Number(match[1]) : 18;
}
