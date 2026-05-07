import { Icon } from '../../components/Icon';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { call } from '../../api/tauri';
import { useSettings } from '../../state/useSettings';
import { EpubReader } from './EpubReader';
import { ComicReader } from './ComicReader';
import { TextReader } from './TextReader';
import { TocPanel } from './TocPanel';
import { SettingsPanel } from './SettingsPanel';
import { shouldPersistProgress } from './readerProgress.mjs';
import { formatPageDisplay, pageIndexFromSliderValue } from './readerPaging.mjs';
import { activeTocIndexForPage } from './readerToc';

const PdfReader = lazy(() => import('./pdf/PdfReader'));

const THEMES = [
  { key: 'light',    bg: '#F9F9F4' },
  { key: 'sepia',    bg: '#f4ecd8' },
  { key: 'charcoal', bg: '#263143' },
  { key: 'oled',     bg: '#000000' },
];

const EPUB_LIKE = new Set(['EPUB']);
const PDF_LIKE  = new Set(['PDF']);
const COMIC_LIKE = new Set(['CBZ', 'CBR', 'ZIP']);

function isEpub(ft)  { return EPUB_LIKE.has(ft); }
function isPdf(ft)   { return PDF_LIKE.has(ft); }
function isComic(ft) { return COMIC_LIKE.has(ft); }

export function ReaderView({ book, backToLibrary, refresh }) {
  const { settings, ready: settingsReady, update: updateSettings, save: saveSettings } = useSettings();

  const [tocOpen,      setTocOpen]      = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hudVisible,   setHudVisible]   = useState(false);
  const [toc,          setToc]          = useState([]);
  const [jumpTo,       setJumpTo]       = useState(null);
  const [progress,     setProgress]     = useState(book?.progress || 0);
  const [curChapter,   setCurChapter]   = useState(book?.spine_index || 0);
  const [totalChaps,   setTotalChaps]   = useState(1);
  const [pageDisplay,  setPageDisplay]  = useState(null);
  const readerRef = useRef(null);
  const progressPersistRef = useRef({
    lastProgress: book?.progress || 0,
    lastSpineIndex: book?.spine_index || 0,
    timer: null,
    queued: null,
  });
  const fileType = book?.file_type;

  useEffect(() => {
    setPageDisplay(null);
    setProgress(book?.progress || 0);
    setCurChapter(book?.spine_index || 0);
    progressPersistRef.current.lastProgress = book?.progress || 0;
    progressPersistRef.current.lastSpineIndex = book?.spine_index || 0;
    progressPersistRef.current.queued = null;
    if (progressPersistRef.current.timer) {
      window.clearTimeout(progressPersistRef.current.timer);
      progressPersistRef.current.timer = null;
    }
  }, [book?.id, book?.path, book?.spine_index, settings.scroll_mode]);

  // Load EPUB TOC
  useEffect(() => {
    if (isEpub(fileType)) {
      call('get_epub_meta', { path: book.path })
        .then((meta) => setToc(meta.toc || []))
        .catch(() => {});
    }
  }, [book, fileType]);

  const persistProgress = useCallback((payload, refreshLibrary = false) => {
    const state = progressPersistRef.current;
    state.lastProgress = payload.progress;
    state.lastSpineIndex = payload.spineIndex;
    state.queued = null;
    call('update_progress', {
      bookId: book.id,
      progress: payload.progress,
      spineIndex: payload.spineIndex,
    })
      .then(() => { if (refreshLibrary) refresh(); })
      .catch(() => {});
  }, [book.id, refresh]);

  const scheduleProgressPersist = useCallback((payload) => {
    const state = progressPersistRef.current;
    if (!shouldPersistProgress({
      nextProgress: payload.progress,
      nextSpineIndex: payload.spineIndex,
      lastProgress: state.lastProgress,
      lastSpineIndex: state.lastSpineIndex,
    })) return;

    state.queued = payload;
    if (state.timer) window.clearTimeout(state.timer);
    state.timer = window.setTimeout(() => {
      state.timer = null;
      if (state.queued) persistProgress(state.queued);
    }, 700);
  }, [persistProgress]);

  const flushProgress = useCallback((refreshLibrary = false) => {
    const state = progressPersistRef.current;
    if (state.timer) {
      window.clearTimeout(state.timer);
      state.timer = null;
    }
    if (state.queued) persistProgress(state.queued, refreshLibrary);
    else if (refreshLibrary) refresh();
  }, [persistProgress, refresh]);

  const handleProgress = useCallback((chapterIdx, total, scrollPct) => {
    setTotalChaps(total);
    setCurChapter(chapterIdx);
    const localPct = scrollPct ?? 1;
    const prog = total > 1
      ? (chapterIdx + Math.min(localPct, 0.99)) / total
      : Math.min(localPct, 1);
    const boundedProgress = Math.min(1, Math.max(0, prog));
    setProgress(boundedProgress);
    scheduleProgressPersist({ progress: boundedProgress, spineIndex: chapterIdx });
  }, [scheduleProgressPersist]);

  useEffect(() => () => {
    flushProgress(false);
  }, [flushProgress]);

  const handleBackToLibrary = useCallback(() => {
    flushProgress(true);
    backToLibrary();
  }, [backToLibrary, flushProgress]);

  const handlePageInfo = useCallback(({ index, count, pending }) => {
    setPageDisplay({
      index: Math.max(0, index || 0),
      count: Math.max(1, count || 1),
      pending: Boolean(pending),
    });
  }, []);

  const handleJump = useCallback((entry, fallbackIndex = 0) => {
    const target = typeof entry === 'object' && entry
      ? entry
      : { index: entry ?? fallbackIndex, pageIndex: null };
    if (!Number.isFinite(target.blockIndex) && Number.isFinite(target.pageIndex)) {
      readerRef.current?.goToPage?.(target.pageIndex);
    }
    setJumpTo({ ...target, nonce: Date.now() });
    setTocOpen(false);
  }, []);

  const handleReaderToc = useCallback((entries) => {
    setToc(Array.isArray(entries) ? entries : []);
  }, []);

  const handleSettingsSave = useCallback(() => {
    saveSettings();
    setSettingsOpen(false);
  }, [saveSettings]);

  const handleTurnPage = useCallback((delta) => {
    readerRef.current?.turnPage?.(delta);
  }, []);

  const handleGoToPage = useCallback((pageIndex) => {
    readerRef.current?.goToPage?.(pageIndex);
  }, []);

  const handlePageSlider = useCallback((event) => {
    if (!pageDisplay || pageDisplay.pending) return;
    handleGoToPage(pageIndexFromSliderValue(event.target.value, pageDisplay.count));
  }, [handleGoToPage, pageDisplay]);

  const handlePageNumberChange = useCallback((event) => {
    if (!pageDisplay || pageDisplay.pending) return;
    const next = Number(event.target.value);
    if (!Number.isFinite(next)) return;
    handleGoToPage(pageIndexFromSliderValue(next - 1, pageDisplay.count));
  }, [handleGoToPage, pageDisplay]);

  const handleCanvasClick = useCallback((e) => {
    // Ignore clicks on buttons, links, or if text is selected
    if (e.target.closest('button, a, input, select')) return;
    if (window.getSelection()?.toString().length > 0) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const w = rect.width;

    if (x < w * 0.3) {
      handleTurnPage(-1); // Left 30%: Previous
    } else if (x > w * 0.7) {
      handleTurnPage(1);  // Right 30%: Next
    } else {
      setHudVisible((v) => !v); // Center 40%: Toggle HUD
    }
  }, [handleTurnPage]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.defaultPrevented) return;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target?.tagName)) return;

      if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === ' ') {
        event.preventDefault();
        handleTurnPage(1);
      } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
        event.preventDefault();
        handleTurnPage(-1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleTurnPage]);

  const theme = settings.theme || 'light';
  const themeColor = THEMES.find((t) => t.key === theme)?.bg || '#F9F9F4';
  const readerSettings = useMemo(() => settings, [settings]);
  const pageUi = useMemo(() => formatPageDisplay(pageDisplay), [pageDisplay]);
  const activeTocEntryIndex = useMemo(
    () => activeTocIndexForPage(toc, pageDisplay, curChapter),
    [toc, pageDisplay, curChapter],
  );

  // Chapter label for HUD
  const chapterLabel = isEpub(fileType) && toc.length > 0
    ? (toc.find((t) => t.index === curChapter)?.title || `Chapter ${curChapter + 1}`)
    : book?.title;

  // Chapter markers for progress bar
  const chapterMarkers = isEpub(fileType) && totalChaps > 1
    ? Array.from({ length: totalChaps - 1 }, (_, i) => (i + 1) / totalChaps)
    : [];

  const modeClass = isPdf(fileType)
    ? 'is-pdf'
    : isComic(fileType)
      ? 'is-comic'
      : isEpub(fileType)
        ? 'is-epub'
        : 'is-text';

  if (!settingsReady) {
    return (
      <div className={`reader-view rv-${theme} ${modeClass}`} style={{ '--r-bg': themeColor }}>
        <div className="reader-chrome-top pinned">
          <button className="reader-back-btn" onClick={backToLibrary}>
            <Icon name="arrow_back" className="ms" />
            Library
          </button>
        </div>
        <div className="reader-loading">
          <div className="loading-spinner" />
          <p>Loading settings…</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`reader-view rv-${theme} ${modeClass} ${hudVisible ? 'hud-visible' : ''} ${tocOpen ? 'toc-open' : ''}`} style={{ '--r-bg': themeColor }}>

      {/* ── Top Chrome (appears on hover) ── */}
      <div className="reader-chrome-top">
        <button className="reader-back-btn" onClick={handleBackToLibrary}>
          <Icon name="arrow_back" className="ms" />
          Library
        </button>

        <div className="reader-chrome-actions">
          <button className="r-icon-btn" title="Contents" onClick={() => setTocOpen(true)}>
            <Icon name="format_list_bulleted" className="ms" />
          </button>
          <button className="r-icon-btn" title="Settings" onClick={() => setSettingsOpen(true)}>
            <Icon name="text_fields" className="ms" />
          </button>
        </div>
      </div>

      {/* ── Reading canvas ── */}
      <div className="reader-canvas" onClick={handleCanvasClick}>
        {isEpub(fileType) && (
          <EpubReader
            ref={readerRef}
            book={book}
            settings={readerSettings}
            jumpTo={jumpTo}
            onProgress={handleProgress}
            onPageInfo={handlePageInfo}
            onToc={handleReaderToc}
          />
        )}
        {isPdf(fileType) && (
          <Suspense fallback={
            <div className="reader-loading">
              <div className="loading-spinner" />
              <p>Loading PDF engine…</p>
            </div>
          }>
            <PdfReader
              ref={readerRef}
              book={book}
              settings={readerSettings}
              onProgress={handleProgress}
              onPageInfo={handlePageInfo}
              onToc={handleReaderToc}
            />
          </Suspense>
        )}
        {isComic(fileType) && (
          <ComicReader ref={readerRef} book={book} settings={readerSettings} onProgress={handleProgress} onPageInfo={handlePageInfo} />
        )}
        {!isEpub(fileType) && !isPdf(fileType) && !isComic(fileType) && (
          <TextReader ref={readerRef} book={book} settings={readerSettings} jumpTo={jumpTo} onProgress={handleProgress} onPageInfo={handlePageInfo} onToc={handleReaderToc} />
        )}
      </div>

      {pageDisplay && (
        <div className={`reader-page-status ${pageUi.canScrub ? 'can-scrub' : ''}`} aria-label={pageUi.label} onClick={(event) => event.stopPropagation()}>
          <button
            className="reader-page-status-btn"
            disabled={pageDisplay.index <= 0}
            onClick={() => handleTurnPage(-1)}
            aria-label="Previous page"
          >
            <Icon name="chevron_left" className="ms sm" />
          </button>
          <input
            className="reader-page-number"
            type="number"
            min="1"
            max={pageDisplay.pending ? undefined : pageDisplay.count}
            value={pageUi.current}
            disabled={!pageUi.canScrub}
            onChange={handlePageNumberChange}
            aria-label="Current page"
          />
          <span className="reader-page-status-sep">/</span>
          <span>{pageUi.total}</span>
          <button
            className="reader-page-status-btn"
            disabled={!pageUi.canScrub || pageDisplay.index >= pageDisplay.count - 1}
            onClick={() => handleTurnPage(1)}
            aria-label="Next page"
          >
            <Icon name="chevron_right" className="ms sm" />
          </button>
        </div>
      )}

      {/* ── Bottom HUD (appears on hover) ── */}
      <div className="reader-hud">
        {/* Top row: chapter info + theme toggles */}
        <div className="hud-top-row">
          <div className="hud-chapter-label">
            <Icon name="menu_book" className="ms" />
            <span style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {chapterLabel}
            </span>
          </div>
          <div className="hud-controls">
            {THEMES.map(({ key, bg }) => (
              <button
                key={key}
                className={`hud-theme-btn ${theme === key ? 'active' : ''}`}
                style={{ background: bg }}
                title={key.charAt(0).toUpperCase() + key.slice(1)}
                onClick={() => updateSettings({ theme: key })}
              />
            ))}
            <div className="hud-sep" />
            <button className="hud-ctrl-btn" title="Contents" onClick={() => setTocOpen(true)}>
              <Icon name="format_list_bulleted" className="ms" />
            </button>
            <button className="hud-ctrl-btn" title="Settings" onClick={() => setSettingsOpen(true)}>
              <Icon name="text_fields" className="ms" />
            </button>
          </div>
        </div>

        {/* Progress row */}
        <div className="hud-progress-row">
          <span className="hud-progress-label">
            {pageDisplay ? `Page ${pageUi.current}` : (isEpub(fileType) && totalChaps > 1 ? `Ch ${curChapter + 1}` : `${Math.round(progress * 100)}%`)}
          </span>
          <div className={`hud-progress-track ${pageDisplay ? 'page-scrubber' : ''}`} style={{ '--hud-progress': `${(pageDisplay ? pageUi.ratio : progress) * 100}%` }}>
            <div className="hud-progress-fill" style={{ width: `${(pageDisplay ? pageUi.ratio : progress) * 100}%` }} />
            {pageDisplay && (
              <input
                className="hud-page-slider"
                type="range"
                min="0"
                max={Math.max(0, pageDisplay.count - 1)}
                step="1"
                value={pageDisplay.index}
                disabled={!pageUi.canScrub}
                onChange={handlePageSlider}
                aria-label="Go to page"
              />
            )}
            {chapterMarkers.map((pos, i) => (
              <div key={i} className="hud-chapter-marker" style={{ left: `${pos * 100}%` }} />
            ))}
            {pageDisplay && (
              <div className="hud-page-indicator">
                {pageUi.current} / {pageUi.total}
              </div>
            )}
          </div>
          <span className="hud-progress-label right">
            {pageDisplay ? `of ${pageUi.total}` : `${Math.round(progress * 100)}%`}
          </span>
        </div>
      </div>

      {/* TOC Panel */}
      {tocOpen && (
        <TocPanel
          toc={toc}
          currentIndex={curChapter}
          activeEntryIndex={activeTocEntryIndex}
          onJump={handleJump}
          onClose={() => setTocOpen(false)}
          docked
        />
      )}

      {/* Settings Panel */}
      {settingsOpen && (
        <SettingsPanel
          settings={settings}
          onChange={updateSettings}
          onSave={handleSettingsSave}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}
