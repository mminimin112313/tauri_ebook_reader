import { Icon } from '../../components/Icon';
import { useCallback, useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { call } from '../../api/tauri';
import { composeHybridPages } from './hybridLayout';
import { HybridCanvasPage } from './HybridCanvasPage';
import { useNativePageControls } from './useNativePageControls';
import { pageAnchorFromBook, pageAnchorFromPage, selectPageForAnchor } from './pagePosition.mjs';
import { attachPageTargetsToToc, tocFromLayoutBlocks } from './readerToc';
import { readerCssVars } from './readerGeometry.js';

export const EpubReader = forwardRef(function EpubReader({ book, settings, jumpTo, annotations = [], selection = null, onTextSelectionChange, onProgress, onPageInfo, onToc }, ref) {
  const [chapters, setChapters] = useState([]);
  const [total, setTotal]       = useState(0);
  const [loading, setLoading]   = useState(true);
  const [loadPct, setLoadPct]   = useState(0);
  const [pageInfo, setPageInfo] = useState({ index: 0, count: 1 });
  const [nativePages, setNativePages] = useState(null);
  const [nativePageIndex, setNativePageIndex] = useState(0);
  const [layoutDoc, setLayoutDoc] = useState(null);
  const scrollRef   = useRef(null);
  const chapRefs    = useRef([]);
  const observerRef = useRef(null);
  const progressRef = useRef({ index: 0, total: 0 });
  const wheelLockRef = useRef(false);
  const nativePagesRef = useRef(null);
  const nativePageIndexRef = useRef(0);
  const previousBookPathRef = useRef(book.path);
  const pendingAnchorRef = useRef(null);
  const pageMode = settings.scroll_mode === false;

  useEffect(() => { nativePagesRef.current = nativePages; }, [nativePages]);
  useEffect(() => { nativePageIndexRef.current = nativePageIndex; }, [nativePageIndex]);

  // Load chapters sequentially, but prioritize the current one
  useEffect(() => {
    if (pageMode) return;
    let cancelled = false;
    let loaded = [];

    async function loadAll() {
      setLoading(true);
      setChapters([]);
      try {
        // Fetch chapter 0 just to get total count (it's fast)
        const first = await call('get_epub_content', { path: book.path, spineIndex: 0 });
        if (cancelled) return;

        const totalChapters = first.total;
        setTotal(totalChapters);
        progressRef.current.total = totalChapters;

        const fetchChapter = async (i) => {
          if (cancelled) return;
          // Don't re-fetch 0 if we already have it
          let ch;
          if (i === 0) ch = first;
          else ch = await call('get_epub_content', { path: book.path, spineIndex: i });

          if (cancelled) return;
          loaded.push({ html: ch.html, index: i });
          loaded.sort((a, b) => a.index - b.index);
          setChapters([...loaded]);
          setLoadPct(loaded.length / totalChapters);
        };

        const startIdx = book.spine_index || 0;

        // 1. Fetch current chapter to unlock UI instantly
        if (startIdx !== 0) {
          await fetchChapter(startIdx);
        } else {
          await fetchChapter(0);
        }

        if (cancelled) return;
        setLoading(false); // UI unlocks!

        // 2. Fetch subsequent chapters (prevents scroll jumping)
        for (let i = startIdx + 1; i < totalChapters; i++) {
          await fetchChapter(i);
        }

        // 3. Fetch previous chapters
        for (let i = startIdx - 1; i >= 0; i--) {
          if (i !== 0 || startIdx !== 0) {
            await fetchChapter(i);
          }
        }
      } catch (err) {
        console.error('EPUB load error:', err);
        if (!cancelled) setLoading(false);
      }
    }

    loadAll();
    return () => { cancelled = true; };
  }, [book.path, pageMode]);

  useEffect(() => {
    if (!pageMode) {
      setNativePages(null);
      setNativePageIndex(0);
      setLayoutDoc(null);
      return;
    }

    let cancelled = false;
    const previousPages = nativePagesRef.current?.pages || [];
    const sameBook = previousBookPathRef.current === book.path && previousPages.length > 0;
    const previousIndex = sameBook ? nativePageIndexRef.current : 0;
    pendingAnchorRef.current = sameBook
      ? pageAnchorFromPage(previousPages[previousIndex], previousIndex, previousPages.length)
      : pageAnchorFromBook(book);
    previousBookPathRef.current = book.path;
    async function loadPages() {
      setLoading(true);
      setNativePages(null);
      setLayoutDoc(null);
      let cancelFullLoad = null;
      try {
        const result = await call('get_epub_layout_preview_blocks', { path: book.path, spineIndex: book.spine_index || 0 });
        if (cancelled) return;
        setLayoutDoc({ ...result, preview: true });
        cancelFullLoad = scheduleDelayedReaderWork(() => {
          call('get_epub_layout_blocks', { path: book.path })
            .then((full) => {
              if (!cancelled && full.can_render) setLayoutDoc({ ...full, preview: false });
            })
            .catch((err) => {
              if (!cancelled) console.error('EPUB full pagination error:', err);
            });
        });
      } catch (err) {
        console.error('EPUB pagination error:', err);
        if (!cancelled) setLoading(false);
      }
      return () => cancelFullLoad?.();
    }

    let cleanupFullLoad = null;
    loadPages().then((cleanup) => { cleanupFullLoad = cleanup; });
    return () => {
      cancelled = true;
      cleanupFullLoad?.();
    };
  }, [
    book.path,
    pageMode,
    book.title,
  ]);

  useEffect(() => {
    if (!pageMode || !layoutDoc) return;
    const title = layoutDoc.title || book.title;
    const anchorFromCurrent = pageAnchorFromPage(
      nativePagesRef.current?.pages?.[nativePageIndexRef.current],
      nativePageIndexRef.current,
      nativePagesRef.current?.pages?.length || 1,
    );
    const anchor = nativePagesRef.current?.pending && pendingAnchorRef.current?.blockIndex != null
      ? pendingAnchorRef.current
      : (anchorFromCurrent?.blockIndex != null ? anchorFromCurrent : pendingAnchorRef.current);
    const tocEntries = tocFromLayoutBlocks(layoutDoc.blocks, { title });
    const isPreview = layoutDoc.preview === true;
    let cancelled = false;

    const applyPages = (pages, pending) => {
      if (cancelled) return;
      const chapterCount = layoutDoc.total_chapters || pages.reduce((max, page) => Math.max(max, (page.chapter_index || 0) + 1), 1);
      const selectedIndex = anchor
        ? selectPageForAnchor(pages, anchor)
        : Math.max(0, Math.min(pages.length - 1, Math.round((book.progress || 0) * Math.max(0, pages.length - 1))));
      onToc?.(pending ? tocEntries : attachPageTargetsToToc(tocEntries, pages));
      setNativePages({ ...layoutDoc, pages, chapterCount, pending });
      setNativePageIndex(selectedIndex);
      setTotal(chapterCount);
      setPageInfo({ index: selectedIndex, count: Math.max(1, pages.length), pending });
      if (!pending) {
        pendingAnchorRef.current = pageAnchorFromPage(pages[selectedIndex], selectedIndex, pages.length);
      }
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

  // Scroll to chapter when jumpTo changes
  useEffect(() => {
    if (pageMode || jumpTo == null) return;
    const index = typeof jumpTo === 'object' ? jumpTo.index : jumpTo;
    if (chapRefs.current[index]) {
      chapRefs.current[index].scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [jumpTo, chapters.length, pageMode]);

  // Restore scroll position on initial load
  useEffect(() => {
    if (!loading && chapters.length > 0 && book.spine_index > 0) {
      const idx = book.spine_index;
      if (chapRefs.current[idx]) {
        chapRefs.current[idx].scrollIntoView({ behavior: 'instant', block: 'start' });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  // Track progress via IntersectionObserver on chapter markers
  const setupObserver = useCallback(() => {
    observerRef.current?.disconnect();
    if (!scrollRef.current || total === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Find topmost intersecting chapter
        let topEntry = null;
        entries.forEach((e) => {
          if (e.isIntersecting) {
            if (!topEntry || e.boundingClientRect.top < topEntry.boundingClientRect.top) {
              topEntry = e;
            }
          }
        });
        if (topEntry) {
          const idx = parseInt(topEntry.target.dataset.chapterIndex, 10);
          if (!isNaN(idx) && idx !== progressRef.current.index) {
            progressRef.current.index = idx;
            const scrollEl = scrollRef.current;
            const scrollPct = scrollEl
              ? (pageMode ? scrollEl.scrollLeft / Math.max(1, scrollEl.scrollWidth - scrollEl.clientWidth) : scrollEl.scrollTop / Math.max(1, scrollEl.scrollHeight - scrollEl.clientHeight))
              : 0;
            onProgress(idx, total, scrollPct);
          }
        }
      },
      { root: scrollRef.current, threshold: 0.1 },
    );

    chapRefs.current.forEach((el) => { if (el) observer.observe(el); });
    observerRef.current = observer;
  }, [total, onProgress]);

  useEffect(() => {
    setupObserver();
    return () => observerRef.current?.disconnect();
  }, [setupObserver, chapters.length]);

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
    onProgress(progressRef.current.index, total || 1, metrics.pct);
  }, [getPageMetrics, onProgress, total]);

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
    if (!pageMode || !nativePages?.pages?.length || !jumpTo) return;
    if (Number.isFinite(jumpTo.blockIndex)) {
      const pageIndex = selectPageForAnchor(nativePages.pages, { blockIndex: jumpTo.blockIndex, pageIndex: 0, pageCount: nativePages.pages.length });
      goToPage(pageIndex);
      return;
    }
    if (Number.isFinite(jumpTo.pageIndex)) {
      goToPage(jumpTo.pageIndex);
      return;
    }
    if (Number.isFinite(jumpTo.index)) {
      const pageIndex = nativePages.pages.findIndex((page) => (page.chapter_index || 0) === jumpTo.index);
      if (pageIndex >= 0) goToPage(pageIndex);
    }
  }, [goToPage, jumpTo, nativePages, pageMode]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!pageMode || nativePages?.pages?.length) return;
    if (!el) return;

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
  }, [pageMode, syncPagedProgress, turnPage, chapters.length, nativePages]);

  useEffect(() => {
    const el = scrollRef.current;
    if (pageMode || !el || loading || chapters.length === 0) return;

    const syncScrollPages = () => {
      const metrics = getPageMetrics();
      setPageInfo((prev) => (
        prev.index === metrics.index && prev.count === metrics.count
          ? prev
          : { index: metrics.index, count: metrics.count }
      ));
      onPageInfo?.({ index: metrics.index, count: metrics.count });
      onProgress(progressRef.current.index, total || 1, metrics.pct);
    };

    const frame = window.requestAnimationFrame(syncScrollPages);
    el.addEventListener('scroll', syncScrollPages, { passive: true });
    return () => {
      window.cancelAnimationFrame(frame);
      el.removeEventListener('scroll', syncScrollPages);
    };
  }, [pageMode, loading, chapters.length, total, getPageMetrics, onProgress, onPageInfo]);

  useEffect(() => {
    if (!pageMode || !nativePages?.pages?.length) return;
    const page = nativePages.pages[nativePageIndex];
    if (!page) return;
    progressRef.current.index = page.chapter_index || 0;
    const count = nativePages.pages.length;
    const anchor = pageAnchorFromPage(page, nativePageIndex, count);
    onPageInfo?.({ index: nativePageIndex, count, pending: Boolean(nativePages.pending) });
    onProgress(page.chapter_index || 0, nativePages.chapterCount || 1, nativePageIndex / Math.max(1, count - 1), anchor);
  }, [pageMode, nativePages, nativePageIndex, onProgress, onPageInfo]);

  const cssVars = {
    ...readerCssVars(settings),
    filter: `brightness(${settings.brightness / 100})`,
  };

  if (pageMode) {
    const page = nativePages?.pages?.[nativePageIndex];
    return (
      <div className="native-page-reader" style={cssVars}>
        {loading && (
          <div className="reader-loading">
            <div className="loading-spinner" />
            <p>Composing pages…</p>
          </div>
        )}
        {!loading && page && (
          <HybridCanvasPage
            page={page}
            settings={settings}
            annotations={annotations}
            selection={selection}
            onTextSelectionChange={onTextSelectionChange}
          />
        )}
        {!loading && !page && (
          <div className="unsupported-view">
            <Icon name="description" className="ms" />
            <h2>{book.file_type}</h2>
            <p>Unable to compose pages for this book.</p>
          </div>
        )}
        {!loading && nativePages?.pages?.length > 0 && (
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
    <div className={`epub-scroll ${pageMode ? 'paged-mode' : ''}`} ref={scrollRef} style={cssVars}>
      {loading && chapters.length === 0 && (
        <div className="reader-loading">
          <div className="loading-spinner" />
          <p>Loading book…</p>
        </div>
      )}

      <div className={`epub-content ${settings.columns > 1 ? 'two-col' : ''} ${pageMode ? 'page-content' : ''}`}>
        {chapters.map(({ html, index }) => (
          <div
            key={index}
            ref={(el) => { chapRefs.current[index] = el; }}
            data-chapter-index={index}
            className="epub-chapter"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ))}

        {loading ? null : loadPct < 1 && (
          <div className="epub-loading-more">
            <div className="loading-spinner sm" />
            <span>Loading chapters… {Math.round(loadPct * 100)}%</span>
          </div>
        )}
      </div>

      {pageMode && !loading && (
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
