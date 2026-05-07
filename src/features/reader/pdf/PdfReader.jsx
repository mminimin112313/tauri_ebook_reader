import { Icon } from '../../../components/Icon';
import { useCallback, useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { call } from '../../../api/tauri';
import { base64ToBytes, pdfjs } from './pdfJs';
import { pdfPageToc } from '../readerToc';

function LazyPdfPage({ document, pageNumber, scale, pageRef }) {
  const wrapRef      = useRef(null);
  const canvasRef    = useRef(null);
  const textLayerRef = useRef(null);
  const renderRef    = useRef(null);
  const [rendered, setRendered] = useState(false);
  const [dims, setDims] = useState({ w: 612, h: 792 }); // A4 fallback px

  // Intersection observer: render when near viewport
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setRendered(true); },
      { rootMargin: '400px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Forward ref to parent for scroll tracking
  useEffect(() => {
    if (pageRef) pageRef.current = wrapRef.current;
  });

  useEffect(() => {
    if (!rendered || !document || !canvasRef.current) return;
    let cancelled = false;

    async function render() {
      renderRef.current?.cancel();
      const page = await document.getPage(pageNumber);
      if (cancelled) return;

      const vp = page.getViewport({ scale });
      const dpr = pdfRenderPixelRatio(scale);
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');

      canvas.width  = Math.floor(vp.width  * dpr);
      canvas.height = Math.floor(vp.height * dpr);
      canvas.style.width  = `${vp.width}px`;
      canvas.style.height = `${vp.height}px`;
      setDims({ w: vp.width, h: vp.height });

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, vp.width, vp.height);

      const task = page.render({ canvasContext: ctx, viewport: vp });
      renderRef.current = task;
      await task.promise;

      // Render Text Layer for selection
      if (!cancelled && textLayerRef.current) {
        const textContent = await page.getTextContent();
        const textLayer = textLayerRef.current;
        textLayer.innerHTML = '';
        textLayer.style.left = '0px';
        textLayer.style.top = '0px';
        textLayer.style.width = `${vp.width}px`;
        textLayer.style.height = `${vp.height}px`;
        textLayer.style.setProperty('--scale-factor', vp.scale);

        try {
          const textLayerTask = new pdfjs.TextLayer({
            textContentSource: textContent,
            container: textLayer,
            viewport: vp,
          });
          await textLayerTask.render();
        } catch (err) {
          console.warn('TextLayer render failed', err);
        }
      }
    }

    render().catch((err) => {
      if (err?.name !== 'RenderingCancelledException' && !cancelled) console.warn(err);
    });

    return () => {
      cancelled = true;
      renderRef.current?.cancel();
    };
  }, [rendered, document, pageNumber, scale]);

  const placeholder = !rendered
    ? { width: dims.w * scale / 1, height: dims.h * scale / 1 }
    : null;

  return (
    <div
      ref={wrapRef}
      className="pdf-page-wrap"
      data-page={pageNumber}
      style={placeholder ? { width: `${612 * scale}px`, height: `${792 * scale}px` } : undefined}
    >
      {rendered
        ? (
          <>
            <canvas ref={canvasRef} aria-label={`Page ${pageNumber}`} />
            <div ref={textLayerRef} className="pdf-text-layer textLayer" />
          </>
        )
        : <div className="pdf-page-placeholder" style={{ width: `${612 * scale}px`, height: `${792 * scale}px` }}>
            Loading…
          </div>
      }
    </div>
  );
}

export default forwardRef(function PdfReader({ book, settings, onProgress, onPageInfo, onToc }, ref) {
  const [doc,        setDoc]      = useState(null);
  const [status,     setStatus]   = useState('loading');
  const [error,      setError]    = useState('');
  const [scale,      setScale]    = useState(1.1);
  const [curPage,    setCurPage]  = useState((book?.spine_index || 0) + 1);
  const scrollRef  = useRef(null);
  const pageRefs   = useRef([]); // array of refs, indexed by page-1

  // Load PDF
  useEffect(() => {
    let cancelled = false;
    let task = null;
    let loaded = null;

    async function load() {
      setStatus('loading');
      setDoc(null);
      setError('');
      try {
        const b64   = await call('read_file_base64', { path: book.path });
        const bytes = base64ToBytes(b64);
        task        = pdfjs.getDocument({ data: bytes });
        loaded      = await task.promise;
        if (cancelled) { loaded.destroy(); return; }
        setDoc(loaded);
        setStatus('ready');
        const startPage = Math.min((book?.spine_index || 0) + 1, loaded.numPages);
        setCurPage(startPage);
        onToc?.(pdfPageToc(loaded.numPages));
        onPageInfo?.({ index: startPage - 1, count: loaded.numPages });
        onProgress(startPage - 1, loaded.numPages, 0);
      } catch (err) {
        if (!cancelled) { setStatus('error'); setError(String(err?.message || err)); }
      }
    }

    load();
    return () => {
      cancelled = true;
      task?.destroy?.();
      loaded?.destroy?.();
    };
  }, [book.path, book.spine_index, onToc, onPageInfo, onProgress]);

  // Scroll to initial page after doc loads
  useEffect(() => {
    if (doc && scrollRef.current) {
      const startIdx = (book?.spine_index || 0);
      setTimeout(() => {
        pageRefs.current[startIdx]?.scrollIntoView({ behavior: 'instant', block: 'start' });
      }, 120);
    }
  }, [doc, book?.spine_index]);

  // Track current page via IntersectionObserver
  useEffect(() => {
    if (!doc || !scrollRef.current) return;
    const items = pageRefs.current.filter(Boolean);

    const obs = new IntersectionObserver(
      (entries) => {
        let best = null, bestRatio = 0;
        entries.forEach((e) => {
          if (e.intersectionRatio > bestRatio) {
            bestRatio = e.intersectionRatio;
            best = e;
          }
        });
        if (best) {
          const pn = parseInt(best.target.dataset.page, 10);
          if (!isNaN(pn)) {
            setCurPage(pn);
            onPageInfo?.({ index: pn - 1, count: doc.numPages });
            onProgress(pn - 1, doc.numPages, pageLocalProgress(best.target, scrollRef.current));
          }
        }
      },
      { root: scrollRef.current, threshold: Array.from({ length: 11 }, (_, i) => i * 0.1) },
    );

    items.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [doc, onProgress, onPageInfo]);

  const goTo = useCallback((pn) => {
    if (!doc) return;
    const bounded = Math.max(1, Math.min(pn, doc.numPages));
    pageRefs.current[bounded - 1]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [doc]);

  const goToPage = useCallback((pageIndex) => {
    goTo((pageIndex || 0) + 1);
  }, [goTo]);

  const turnPage = useCallback((delta) => {
    if (!doc) return;
    goTo(curPage + delta);
  }, [doc, curPage, goTo]);

  useImperativeHandle(ref, () => ({ turnPage, goToPage }), [turnPage, goToPage]);

  const brightness = `brightness(${(settings?.brightness || 90) / 100})`;

  if (status === 'loading') return (
    <div className="reader-loading">
      <div className="loading-spinner" />
      <p>Loading PDF…</p>
    </div>
  );
  if (status === 'error') return (
    <div className="reader-loading">
      <Icon name="error" className="ms xl" style={{ color: 'var(--error)' }} />
      <p style={{ color: 'var(--error)' }}>Failed to load PDF: {error}</p>
    </div>
  );

  const total = doc.numPages;
  const isDark = settings?.theme === 'oled' || settings?.theme === 'charcoal';
  const filterStyle = isDark
    ? `invert(1) hue-rotate(180deg) brightness(${(settings?.brightness || 90) / 100})`
    : brightness;

  return (
    <div className={`pdf-view ${isDark ? 'pdf-dark' : ''}`} style={{ filter: filterStyle, background: isDark ? '#1a1a1a' : '#d8dee8' }}>
      {/* Toolbar */}
      <div className="pdf-toolbar-sticky">
        <div className="pdf-page-ctrl">
          <button className="pdf-ctrl-btn" disabled={curPage <= 1} onClick={() => goTo(curPage - 1)}>‹</button>
          <span>Page {curPage} / {total}</span>
          <button className="pdf-ctrl-btn" disabled={curPage >= total} onClick={() => goTo(curPage + 1)}>›</button>
        </div>
        <div className="pdf-zoom-ctrl">
          <button className="pdf-ctrl-btn" onClick={() => setScale((s) => Math.max(0.5, +(s - 0.15).toFixed(2)))}>−</button>
          <span>{Math.round(scale * 100)}%</span>
          <button className="pdf-ctrl-btn" onClick={() => setScale((s) => Math.min(3.0, +(s + 0.15).toFixed(2)))}>+</button>
        </div>
      </div>

      {/* Continuous pages */}
      <div className="pdf-scroll" ref={scrollRef}>
        {Array.from({ length: total }, (_, i) => i).map((i) => {
          const ref = { current: null };
          pageRefs.current[i] = ref.current;
          return (
            <LazyPdfPage
              key={i + 1}
              document={doc}
              pageNumber={i + 1}
              scale={scale}
              pageRef={{
                get current() { return pageRefs.current[i]; },
                set current(el) { pageRefs.current[i] = el; },
              }}
            />
          );
        })}
      </div>
    </div>
  );
});

function pdfRenderPixelRatio(scale) {
  const dpr = window.devicePixelRatio || 1;
  const cap = scale >= 2 ? 2.25 : 2;
  return Math.min(dpr, cap);
}

function pageLocalProgress(pageEl, rootEl) {
  if (!pageEl || !rootEl) return 0;
  const pageTop = pageEl.offsetTop;
  const visibleTop = Math.max(0, rootEl.scrollTop - pageTop);
  const range = Math.max(1, pageEl.offsetHeight - rootEl.clientHeight);
  return Math.max(0, Math.min(0.99, visibleTop / range));
}
