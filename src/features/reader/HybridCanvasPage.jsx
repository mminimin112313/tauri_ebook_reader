import { useEffect, useMemo, useRef, useState } from 'react';
import { hybridPageCssWidth } from './readerGeometry.js';

export function HybridCanvasPage({ page, settings }) {
  const canvasRef = useRef(null);
  const lastSizeRef = useRef({ width: 0, height: 0, dpr: 0 });
  const [expandedOverlay, setExpandedOverlay] = useState(null);
  const pageWidth = useMemo(() => hybridPageCssWidth(settings), [settings.columns, settings.margin_width]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !page) return;

    const frame = window.requestAnimationFrame(() => {
      const bounds = canvas.parentElement?.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(320, Math.round(bounds?.width || window.innerWidth - 80));
      const height = Math.max(260, Math.round(bounds?.height || window.innerHeight - 220));

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
  }, [page, settings.theme, settings.font_family, settings.font_size, settings.line_height]);

  return (
    <div className="hybrid-page" style={{ '--hybrid-page-w': pageWidth }}>
      <canvas ref={canvasRef} className="hybrid-page-canvas" aria-label={page?.title || 'Reader page'} />
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
