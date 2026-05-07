import { Icon } from '../../components/Icon';
import { useCallback, useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { call } from '../../api/tauri';
import { composeHybridPages } from './hybridLayout';
import { HybridCanvasPage } from './HybridCanvasPage';
import { useNativePageControls } from './useNativePageControls';
import { pageAnchorFromPage, selectPageForAnchor } from './pagePosition.mjs';
import { attachPageTargetsToToc, tocFromHtml, tocFromLayoutBlocks } from './readerToc';
import { quotedReaderFontFamily, readingMeasureWidth } from './readerGeometry.js';

export const TextReader = forwardRef(function TextReader({ book, settings, jumpTo, onProgress, onPageInfo, onToc }, ref) {
  const [html,    setHtml]    = useState('');
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [pageInfo, setPageInfo] = useState({ index: 0, count: 1 });
  const [nativePages, setNativePages] = useState(null);
  const [nativePageIndex, setNativePageIndex] = useState(0);
  const [layoutDoc, setLayoutDoc] = useState(null);
  const scrollRef = useRef(null);
  const wheelLockRef = useRef(false);
  const nativePagesRef = useRef(null);
  const nativePageIndexRef = useRef(0);
  const previousBookPathRef = useRef(book.path);
  const pendingAnchorRef = useRef(null);
  const pageMode = settings.scroll_mode === false;

  useEffect(() => { nativePagesRef.current = nativePages; }, [nativePages]);
  useEffect(() => { nativePageIndexRef.current = nativePageIndex; }, [nativePageIndex]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setNativePages(null);
    setLayoutDoc(null);
    const sameBook = previousBookPathRef.current === book.path;
    const previousPages = nativePagesRef.current?.pages || [];
    const previousIndex = sameBook ? nativePageIndexRef.current : 0;
    pendingAnchorRef.current = sameBook
      ? pageAnchorFromPage(previousPages[previousIndex], previousIndex, previousPages.length)
      : null;
    previousBookPathRef.current = book.path;
    if (pageMode) {
      let cancelFullLoad = null;
      call('get_text_layout_preview_blocks', { path: book.path })
        .then((r) => {
          if (cancelled) return;
          if (r.can_render) {
            setLayoutDoc({ ...r, preview: true });
            cancelFullLoad = scheduleDelayedReaderWork(() => {
              call('get_text_layout_blocks', { path: book.path })
                .then((full) => {
                  if (!cancelled && full.can_render) setLayoutDoc({ ...full, preview: false });
                })
                .catch((err) => {
                  if (!cancelled) { setError(String(err)); }
                });
            });
          }
          else {
            setError(r.message || 'Cannot render this format');
            setLoading(false);
          }
        })
        .catch((err) => {
          if (!cancelled) { setError(String(err)); setLoading(false); }
        });
      return () => {
        cancelled = true;
        cancelFullLoad?.();
      };
    }

    call('get_reading_content', { path: book.path, spineIndex: 0 })
      .then((r) => {
        if (cancelled) return;
        if (r.can_render) {
          setHtml(r.html);
          onToc?.(tocFromHtml(r.html, { title: book.title }));
        }
        else setError(r.message || 'Cannot render this format');
        setLoading(false);
        onProgress(0, 1, 0);
      })
      .catch((err) => {
        if (!cancelled) { setError(String(err)); setLoading(false); }
      });
    return () => { cancelled = true; };
  }, [
    book.path,
    pageMode,
    book.title,
    onToc,
  ]);

  useEffect(() => {
    if (!pageMode || !layoutDoc) return;
    const title = layoutDoc.title || book.title;
    const anchorFromCurrent = pageAnchorFromPage(
      nativePagesRef.current?.pages?.[nativePageIndexRef.current],
      nativePageIndexRef.current,
      nativePagesRef.current?.pages?.length || 1,
    );
    const anchor = anchorFromCurrent?.blockIndex != null ? anchorFromCurrent : pendingAnchorRef.current;
    const tocEntries = tocFromLayoutBlocks(layoutDoc.blocks, { title });
    const isPreview = layoutDoc.preview === true;
    let cancelled = false;

    const applyPages = (pages, pending) => {
      if (cancelled) return;
      const selectedIndex = anchor
        ? selectPageForAnchor(pages, anchor)
        : Math.max(0, Math.min(pages.length - 1, Math.round((book.progress || 0) * Math.max(0, pages.length - 1))));
      onToc?.(pending ? tocEntries : attachPageTargetsToToc(tocEntries, pages));
      setNativePages({ ...layoutDoc, pages, pending });
      setNativePageIndex(selectedIndex);
      setPageInfo({ index: selectedIndex, count: Math.max(1, pages.length), pending });
      setLoading(false);
    };

    if (isPreview) {
      applyPages(composeHybridPages({
        blocks: layoutDoc.blocks,
        settings,
        title,
        maxPages: 3,
      }), true);
      return () => { cancelled = true; };
    }

    const cancelIdle = scheduleReaderWork(() => {
      applyPages(composeHybridPages({ blocks: layoutDoc.blocks, settings, title }), false);
    });

    return () => {
      cancelled = true;
      cancelIdle();
    };
  }, [
    book.progress,
    book.title,
    layoutDoc,
    onToc,
    pageMode,
    settings.columns,
    settings.font_family,
    settings.font_size,
    settings.line_height,
    settings.margin_width,
  ]);

  // Track progress via scroll
  useEffect(() => {
    if (pageMode) return;
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const scrollPos = el.scrollTop;
      const maxScroll = Math.max(1, el.scrollHeight - el.clientHeight);
      const pageSize = Math.max(1, el.clientHeight);
      const pageCount = Math.max(1, Math.ceil(maxScroll / pageSize) + 1);
      const pageIndex = Math.max(0, Math.min(pageCount - 1, Math.round(scrollPos / pageSize)));
      const pct = scrollPos / maxScroll;
      onPageInfo?.({ index: pageIndex, count: pageCount });
      onProgress(0, 1, pct);
    };
    const frame = window.requestAnimationFrame(onScroll);
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.cancelAnimationFrame(frame);
      el.removeEventListener('scroll', onScroll);
    };
  }, [onProgress, onPageInfo, pageMode, html, settings.font_size, settings.line_height, settings.columns]);

  const getPageMetrics = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return { index: 0, count: 1, pct: 0 };

    const pageSize = Math.max(1, pageMode ? el.clientWidth : el.clientHeight);
    const maxScroll = Math.max(0, pageMode ? el.scrollWidth - el.clientWidth : el.scrollHeight - el.clientHeight);
    const count = Math.max(1, Math.ceil(maxScroll / pageSize) + 1);
    const scrollPos = pageMode ? el.scrollLeft : el.scrollTop;
    const index = Math.max(0, Math.min(count - 1, Math.round(scrollPos / pageSize)));
    const pct = maxScroll > 0 ? scrollPos / maxScroll : 0;
    return { index, count, pct };
  }, [pageMode]);

  const syncPagedProgress = useCallback(() => {
    const metrics = getPageMetrics();
    setPageInfo((prev) => (
      prev.index === metrics.index && prev.count === metrics.count
        ? prev
        : { index: metrics.index, count: metrics.count }
    ));
    onProgress(0, 1, metrics.pct);
  }, [getPageMetrics, onProgress]);

  const turnPage = useCallback((delta) => {
    if (pageMode && nativePages?.pages?.length) {
      const next = Math.max(0, Math.min(nativePages.pages.length - 1, nativePageIndexRef.current + delta));
      nativePageIndexRef.current = next;
      setNativePageIndex(next);
      setPageInfo({ index: next, count: nativePages.pages.length, pending: Boolean(nativePages.pending) });
      onPageInfo?.({ index: next, count: nativePages.pages.length, pending: Boolean(nativePages.pending) });
      return;
    }

    const el = scrollRef.current;
    if (!el) return;

    const metrics = getPageMetrics();
    const nextIndex = Math.max(0, Math.min(metrics.count - 1, metrics.index + delta));
    const behavior = settings.page_animation === 'none' ? 'auto' : 'smooth';

    if (pageMode) {
      el.scrollTo({ left: nextIndex * el.clientWidth, behavior });
    } else {
      el.scrollTo({ top: nextIndex * el.clientHeight, behavior });
    }
  }, [getPageMetrics, settings.page_animation, pageMode, nativePages, onPageInfo]);

  const goToPage = useCallback((pageIndex) => {
    if (pageMode && nativePages?.pages?.length) {
      const next = Math.max(0, Math.min(nativePages.pages.length - 1, pageIndex || 0));
      setNativePageIndex(next);
      setPageInfo({ index: next, count: nativePages.pages.length, pending: Boolean(nativePages.pending) });
      onPageInfo?.({ index: next, count: nativePages.pages.length, pending: Boolean(nativePages.pending) });
      return;
    }
    const el = scrollRef.current;
    if (!el) return;
    const metrics = getPageMetrics();
    const next = Math.max(0, Math.min(metrics.count - 1, pageIndex || 0));
    el.scrollTo({ top: next * el.clientHeight, behavior: settings.page_animation === 'none' ? 'auto' : 'smooth' });
  }, [getPageMetrics, nativePages, onPageInfo, pageMode, settings.page_animation]);

  useImperativeHandle(ref, () => ({ turnPage, goToPage }), [turnPage, goToPage]);
  useNativePageControls({ enabled: pageMode && !!nativePages?.pages?.length, turnPage });

  useEffect(() => {
    if (!jumpTo) return;
    if (pageMode && nativePages?.pages?.length && Number.isFinite(jumpTo.blockIndex)) {
      const pageIndex = selectPageForAnchor(nativePages.pages, { blockIndex: jumpTo.blockIndex, pageIndex: 0, pageCount: nativePages.pages.length });
      goToPage(pageIndex);
      return;
    }
    if (Number.isFinite(jumpTo.pageIndex)) {
      goToPage(jumpTo.pageIndex);
    }
  }, [goToPage, jumpTo, nativePages, pageMode]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!pageMode || nativePages?.pages?.length) return;
    if (!el || loading || error) return;

    const onScroll = () => syncPagedProgress();
    const onWheel = (event) => {
      if (Math.abs(event.deltaY) < 18 || wheelLockRef.current) return;
      event.preventDefault();
      wheelLockRef.current = true;
      turnPage(event.deltaY > 0 ? 1 : -1);
      window.setTimeout(() => { wheelLockRef.current = false; }, 360);
    };

    syncPagedProgress();
    el.addEventListener('scroll', onScroll, { passive: true });
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('scroll', onScroll);
      el.removeEventListener('wheel', onWheel);
    };
  }, [pageMode, loading, error, syncPagedProgress, turnPage, html, nativePages]);

  useEffect(() => {
    if (!pageMode || !nativePages?.pages?.length) return;
    const count = nativePages.pages.length;
    onPageInfo?.({ index: nativePageIndex, count, pending: Boolean(nativePages.pending) });
    onProgress(0, 1, nativePageIndex / Math.max(1, count - 1));
  }, [pageMode, nativePages, nativePageIndex, onProgress, onPageInfo]);

  const maxW = readingMeasureWidth(settings);
  const fontFamily = quotedReaderFontFamily(settings);

  if (loading) return (
    <div className="reader-loading">
      <div className="loading-spinner" />
      <p>Loading…</p>
    </div>
  );

  if (error) return (
    <div className="unsupported-view">
      <Icon name="description" className="ms" />
      <h2>{book.file_type}</h2>
      <p>{error}</p>
    </div>
  );

  if (pageMode) {
    const page = nativePages?.pages?.[nativePageIndex];
    return (
      <div
        className="native-page-reader"
        style={{ filter: `brightness(${(settings.brightness || 90) / 100})` }}
      >
        {page && (
          <HybridCanvasPage page={page} settings={settings} />
        )}
        {!page && (
          <div className="unsupported-view">
            <Icon name="description" className="ms" />
            <h2>{book.file_type}</h2>
            <p>Unable to compose pages for this document.</p>
          </div>
        )}
        {nativePages?.pages?.length > 0 && (
          <>
            <button
              className="reader-page-turn prev"
              disabled={nativePageIndex <= 0}
              onClick={() => turnPage(-1)}
              aria-label="Previous page"
            >
              <Icon name="chevron_left" className="ms" />
            </button>
            <button
              className="reader-page-turn next"
              disabled={nativePageIndex >= nativePages.pages.length - 1}
              onClick={() => turnPage(1)}
              aria-label="Next page"
            >
              <Icon name="chevron_right" className="ms" />
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <div
      className={`text-scroll ${pageMode ? 'paged-mode' : ''}`}
      ref={scrollRef}
      style={{ filter: `brightness(${(settings.brightness || 90) / 100})` }}
    >
      <div
        className={`text-content ${settings.columns > 1 ? 'two-col' : ''}`}
        style={{
          maxWidth: maxW,
          fontFamily,
          fontSize: settings.font_size,
          lineHeight: settings.line_height,
          textAlign: settings.justify_text ? 'justify' : 'left',
        }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {pageMode && (
        <>
          <button
            className="reader-page-turn prev"
            disabled={pageInfo.index <= 0}
            onClick={() => turnPage(-1)}
            aria-label="Previous page"
          >
            <Icon name="chevron_left" className="ms" />
          </button>
          <button
            className="reader-page-turn next"
            disabled={pageInfo.index >= pageInfo.count - 1}
            onClick={() => turnPage(1)}
            aria-label="Next page"
          >
            <Icon name="chevron_right" className="ms" />
          </button>
        </>
      )}
    </div>
  );
});

function scheduleReaderWork(callback) {
  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(callback, { timeout: 350 });
    return () => window.cancelIdleCallback?.(id);
  }
  const id = window.setTimeout(callback, 16);
  return () => window.clearTimeout(id);
}

function scheduleDelayedReaderWork(callback, delay = 1200) {
  const id = window.setTimeout(callback, delay);
  return () => window.clearTimeout(id);
}
