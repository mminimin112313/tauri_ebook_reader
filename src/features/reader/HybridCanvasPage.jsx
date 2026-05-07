import { useEffect, useMemo, useRef, useState } from 'react';
import { hybridPageCssWidth } from './readerGeometry.js';
import { annotationMarksForPage, selectionFromCanvasDrag } from './hybridAnnotations.mjs';

export function HybridCanvasPage({ page, settings, annotations = [], selection = null, onTextSelectionChange }) {
  const canvasRef = useRef(null);
  const dragStartRef = useRef(null);
  const draggedRef = useRef(false);
  const lastSizeRef = useRef({ width: 0, height: 0, dpr: 0 });
  const [expandedOverlay, setExpandedOverlay] = useState(null);
  const pageWidth = useMemo(() => hybridPageCssWidth(settings), [settings.columns, settings.margin_width]);
  const measureSelectionText = useMemo(() => {
    const canvas = typeof document === 'undefined' ? null : document.createElement('canvas');
    const ctx = canvas?.getContext?.('2d');
    return (text, font) => {
      if (!ctx) return String(text || '').length * 8;
      if (font) ctx.font = font;
      return ctx.measureText(text).width;
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !page) return;

    const frame = window.requestAnimationFrame(() => {
      const bounds = canvas.parentElement?.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(320, Math.round(bounds?.width || window.innerWidth - 80));
      const height = Math.max(260, Math.round(bounds?.height || window.innerHeight - 96));

      if (
        lastSizeRef.current.width !== width
        || lastSizeRef.current.height !== height
        || lastSizeRef.current.dpr !== dpr
      ) {
        canvas.width = Math.floor(width * dpr);
        canvas.height = Math.floor(height * dpr);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        lastSizeRef.current = { width, height, dpr };
      }

      const ctx = canvas.getContext('2d', { alpha: true });
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.textBaseline = 'alphabetic';
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      const themeInk = getReaderThemeValue(canvas, '--r-ink', '#2A2A2A');
      const marks = annotationMarksForPage({
        page,
        annotations,
        measureText: (text, font) => {
          const previousFont = ctx.font;
          if (font) ctx.font = font;
          const width = ctx.measureText(text).width;
          ctx.font = previousFont;
          return width;
        },
      });
      drawAnnotationRects(ctx, marks.rects);
      drawAnnotationRects(ctx, selection?.rects || []);
      drawAnnotationBadges(ctx, marks.badges, width);
      let activeFont = '';
      let activeFill = '';

      for (const run of page.textRuns || []) {
        const fill = run.color || themeInk;
        if (activeFont !== run.font) {
          ctx.font = run.font;
          activeFont = run.font;
        }
        if (activeFill !== fill) {
          ctx.fillStyle = fill;
          activeFill = fill;
        }
        ctx.fillText(run.text, run.x, run.y);
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [annotations, page, selection, settings.theme, settings.font_family, settings.font_size, settings.line_height]);

  useEffect(() => {
    onTextSelectionChange?.(null);
  }, [onTextSelectionChange, page?.global_index]);

  const pointFromEvent = (event) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  };

  const updateSelection = (start, end) => {
    const nextSelection = selectionFromCanvasDrag({
      page,
      start,
      end,
      measureText: measureSelectionText,
    });
    onTextSelectionChange?.(nextSelection.quote ? nextSelection : null);
  };

  const handlePointerDown = (event) => {
    if (event.button !== 0) return;
    const point = pointFromEvent(event);
    if (!point) return;
    dragStartRef.current = point;
    draggedRef.current = false;
    canvasRef.current?.setPointerCapture?.(event.pointerId);
    onTextSelectionChange?.(null);
  };

  const handlePointerMove = (event) => {
    if (!dragStartRef.current) return;
    const point = pointFromEvent(event);
    if (!point) return;
    const dx = Math.abs(point.x - dragStartRef.current.x);
    const dy = Math.abs(point.y - dragStartRef.current.y);
    if (dx < 4 && dy < 4) return;
    draggedRef.current = true;
    event.preventDefault();
    updateSelection(dragStartRef.current, point);
  };

  const handlePointerUp = (event) => {
    if (!dragStartRef.current) return;
    const point = pointFromEvent(event);
    if (point && draggedRef.current) {
      event.preventDefault();
      event.stopPropagation();
      updateSelection(dragStartRef.current, point);
    }
    dragStartRef.current = null;
    canvasRef.current?.releasePointerCapture?.(event.pointerId);
  };

  const handleClick = (event) => {
    if (draggedRef.current) {
      event.preventDefault();
      event.stopPropagation();
      draggedRef.current = false;
    }
  };

  return (
    <div className="hybrid-page" style={{ '--hybrid-page-w': pageWidth }}>
      <canvas
        ref={canvasRef}
        className="hybrid-page-canvas"
        aria-label={page?.title || 'Reader page'}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => { dragStartRef.current = null; }}
        onClick={handleClick}
      />
      <div className="hybrid-overlay-layer">
        {(page?.overlays || []).map((overlay, index) => (
          <div
            key={index}
            className={`hybrid-overlay hybrid-overlay-${overlay.type}`}
            role={isExpandableOverlay(overlay.type) ? 'button' : undefined}
            tabIndex={isExpandableOverlay(overlay.type) ? 0 : undefined}
            aria-label={isExpandableOverlay(overlay.type) ? `Open ${overlay.type} in full screen` : undefined}
            onClick={(event) => {
              event.stopPropagation();
              if (isExpandableOverlay(overlay.type)) setExpandedOverlay(overlay);
            }}
            onKeyDown={(event) => {
              if (!isExpandableOverlay(overlay.type)) return;
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                event.stopPropagation();
                setExpandedOverlay(overlay);
              }
            }}
            style={{
              left: overlay.x,
              top: overlay.y,
              width: overlay.width,
              height: overlay.height,
              maxHeight: overlay.height,
            }}
          >
            <HybridOverlayContent overlay={overlay} settings={settings} />
          </div>
        ))}
      </div>
      {expandedOverlay && (
        <div className="reader-expanded-overlay" role="dialog" aria-modal="true" aria-label={`${expandedOverlay.type} preview`} onClick={() => setExpandedOverlay(null)}>
          <div className={`reader-expanded-content reader-expanded-${expandedOverlay.type}`} onClick={(event) => event.stopPropagation()}>
            <button className="reader-expanded-close" onClick={() => setExpandedOverlay(null)} aria-label="Close preview">
              Close
            </button>
            <HybridOverlayContent overlay={expandedOverlay} settings={settings} />
          </div>
        </div>
      )}
    </div>
  );
}

function drawAnnotationRects(ctx, rects) {
  for (const rect of rects || []) {
    const fill = annotationColor(rect.color, 0.28);
    const stroke = annotationColor(rect.color, 0.5);
    ctx.save();
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    roundedRect(ctx, rect.x - 3, rect.y - 1, rect.width + 6, rect.height + 2, 5);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

function drawAnnotationBadges(ctx, badges, pageWidth) {
  for (const [index, badge] of (badges || []).entries()) {
    const size = 20;
    const x = pageWidth - 30;
    const y = 18 + index * 26;
    ctx.save();
    ctx.fillStyle = annotationColor(badge.color, 0.88);
    roundedRect(ctx, x, y, size, size, 5);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.86)';
    if (badge.kind === 'bookmark') {
      ctx.beginPath();
      ctx.moveTo(x + 6, y + 4);
      ctx.lineTo(x + 14, y + 4);
      ctx.lineTo(x + 14, y + 16);
      ctx.lineTo(x + 10, y + 13);
      ctx.lineTo(x + 6, y + 16);
      ctx.closePath();
      ctx.fill();
    } else {
      roundedRect(ctx, x + 5, y + 8, 10, 4, 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function annotationColor(color, alpha) {
  const palette = {
    blue: `rgba(117, 159, 255, ${alpha})`,
    green: `rgba(103, 224, 143, ${alpha})`,
    pink: `rgba(255, 155, 207, ${alpha})`,
    yellow: `rgba(255, 209, 102, ${alpha})`,
  };
  return palette[color] || palette.yellow;
}

function HybridOverlayContent({ overlay, settings }) {
  if (overlay.type === 'image' && overlay.src) {
    return <img src={overlay.src} alt="" />;
  }
  if (overlay.type === 'mermaid') {
    return <MermaidDiagram html={overlay.html} theme={settings.theme} />;
  }
  return <div dangerouslySetInnerHTML={{ __html: overlay.html }} />;
}

function MermaidDiagram({ html, theme }) {
  const [svg, setSvg] = useState('');
  const [error, setError] = useState('');
  const idRef = useRef(`mermaid-${Math.random().toString(36).slice(2)}`);
  const source = useMemo(() => extractMermaidSource(html), [html]);

  useEffect(() => {
    let cancelled = false;
    if (!source) {
      setSvg('');
      setError('Empty Mermaid diagram.');
      return () => { cancelled = true; };
    }

    import('mermaid')
      .then((module) => {
        const mermaid = module.default;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'antiscript',
          theme: theme === 'oled' || theme === 'charcoal' ? 'dark' : 'default',
          flowchart: {
            htmlLabels: true,
            useMaxWidth: true,
          },
          sequence: {
            useMaxWidth: true,
          },
          gantt: {
            useMaxWidth: true,
          },
        });
        return mermaid.render(`${idRef.current}-${hashMermaidSource(source, theme)}`, source);
      })
      .then(({ svg: renderedSvg }) => {
        if (!cancelled) {
          setSvg(renderedSvg);
          setError('');
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setSvg('');
          setError(String(err?.message || err));
        }
      });

    return () => { cancelled = true; };
  }, [source, theme]);

  if (svg) {
    return <div className="mermaid-rendered" dangerouslySetInnerHTML={{ __html: svg }} />;
  }
  return (
    <pre className="mermaid-fallback">
      {error ? `${error}\n\n${source}` : source}
    </pre>
  );
}

function extractMermaidSource(html) {
  const parsed = new DOMParser().parseFromString(html || '', 'text/html');
  const node = parsed.querySelector('.language-mermaid, code[class*="mermaid"], pre.mermaid, .mermaid');
  return (node?.textContent || parsed.body.textContent || '').trim();
}

function hashMermaidSource(source, theme) {
  const value = `${theme}:${source}`;
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function isExpandableOverlay(type) {
  return type === 'table' || type === 'mermaid';
}

function getReaderThemeValue(node, name, fallback) {
  const themeNode = node?.closest?.('.reader-view') || document.documentElement;
  return getComputedStyle(themeNode).getPropertyValue(name).trim() || fallback;
}
