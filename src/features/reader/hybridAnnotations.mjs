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

export function selectionFromCanvasDrag({ page, start, end, measureText }) {
  if (!page || !start || !end) return emptySelection();
  const orderedRuns = (page.textRuns || [])
    .map((run, index) => ({ ...run, runIndex: index, fontSize: fontSizeFromRun(run) }))
    .filter((run) => run.text)
    .sort((a, b) => a.y - b.y || a.x - b.x);
  if (orderedRuns.length === 0) return emptySelection();

  const startHit = closestRunHit(orderedRuns, start, measureText);
  const endHit = closestRunHit(orderedRuns, end, measureText);
  if (!startHit || !endHit) return emptySelection();

  const first = compareHits(startHit, endHit) <= 0 ? startHit : endHit;
  const last = first === startHit ? endHit : startHit;
  const selectedRuns = orderedRuns.filter((run) => run.runIndex >= first.runIndex && run.runIndex <= last.runIndex);
  const parts = [];
  const rects = [];

  for (const run of selectedRuns) {
    const startIndex = run.runIndex === first.runIndex ? charIndexForX(run, first.x, measureText, 'start') : 0;
    const endIndex = run.runIndex === last.runIndex ? charIndexForX(run, last.x, measureText, 'end') : run.text.length;
    if (endIndex <= startIndex) continue;
    const text = run.text.slice(startIndex, endIndex).trim();
    if (!text) continue;
    parts.push(text);
    rects.push(rectFromRun({
      run,
      start: startIndex,
      length: endIndex - startIndex,
      color: 'green',
      measureText,
    }));
  }

  return {
    quote: parts.join(' ').replace(/\s+/g, ' ').trim(),
    rects,
  };
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

function closestRunHit(runs, point, measureText) {
  const candidates = runs
    .map((run) => {
      const top = run.y - run.fontSize * 0.9;
      const bottom = run.y + run.fontSize * 0.3;
      const verticalDistance = point.y < top ? top - point.y : point.y > bottom ? point.y - bottom : 0;
      return { run, verticalDistance };
    })
    .sort((a, b) => a.verticalDistance - b.verticalDistance);
  const run = candidates[0]?.run;
  if (!run || candidates[0].verticalDistance > run.fontSize * 1.4) return null;
  return {
    runIndex: run.runIndex,
    charIndex: charIndexForX(run, point.x, measureText, 'start'),
    x: point.x,
  };
}

function charIndexForX(run, x, measureText, mode = 'start') {
  if (x <= run.x) return 0;
  if (mode === 'end') {
    for (let index = 1; index <= run.text.length; index += 1) {
      const edge = run.x + measureText(run.text.slice(0, index), run.font);
      if (x <= edge) return index;
    }
    return run.text.length;
  }
  for (let index = 1; index <= run.text.length; index += 1) {
    const midpoint = run.x + measureText(run.text.slice(0, index), run.font) - measureText(run.text[index - 1] || '', run.font) / 2;
    if (x < midpoint) return index - 1;
  }
  return run.text.length;
}

function compareHits(a, b) {
  if (a.runIndex !== b.runIndex) return a.runIndex - b.runIndex;
  return a.charIndex - b.charIndex;
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

function emptySelection() {
  return { quote: '', rects: [] };
}
