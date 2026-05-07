import { Icon } from '../../components/Icon';
import { useCallback, useEffect, useState, forwardRef, useImperativeHandle } from 'react';
import { call } from '../../api/tauri';

export const ComicReader = forwardRef(function ComicReader({ book, settings, onProgress, onPageInfo }, ref) {
  const [pages,   setPages]   = useState([]);
  const [index,   setIndex]   = useState(book.spine_index || 0);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    call('get_reading_content', { path: book.path, spineIndex: book.spine_index || 0 })
      .then((r) => {
        if (cancelled) return;
        if (r.can_render && r.pages?.length) {
          setPages(r.pages);
          const idx = r.index || 0;
          setIndex(idx);
          onPageInfo?.({ index: idx, count: r.total || r.pages.length });
          onProgress(idx, r.total, 0);
        } else {
          setError(r.message || 'Cannot render comics');
        }
        setLoading(false);
      })
      .catch((err) => {
        if (!cancelled) { setError(String(err)); setLoading(false); }
      });
    return () => { cancelled = true; };
  }, [book.path, book.spine_index]);

  const goTo = (nextIdx) => {
    const bounded = Math.max(0, Math.min(nextIdx, pages.length - 1));
    setIndex(bounded);
    onPageInfo?.({ index: bounded, count: pages.length });
    onProgress(bounded, pages.length, 0);
  };

  const turnPage = useCallback((delta) => {
    const next = index + delta;
    if (next >= 0 && next < pages.length) {
      goTo(next);
    }
  }, [index, pages.length]);

  useImperativeHandle(ref, () => ({ turnPage }), [turnPage]);

  if (loading) return (
    <div className="reader-loading">
      <div className="loading-spinner" />
      <p>Loading comic…</p>
    </div>
  );

  if (error || pages.length === 0) return (
    <div className="unsupported-view">
      <Icon name="image" className="ms" />
      <h2>{book.file_type}</h2>
      <p>{error || 'No pages found'}</p>
    </div>
  );

  const page = pages[index];

  return (
    <div className="comic-view">
      <div className="comic-page-area">
        {page && <img src={page.src} alt={page.title || `Page ${index + 1}`} />}
      </div>
      <div className="comic-nav-bar">
        <button className="comic-nav-btn" disabled={index === 0} onClick={() => goTo(index - 1)}>
          <Icon name="chevron_left" className="ms sm" /> Prev
        </button>
        <span className="comic-page-label">{index + 1} / {pages.length}</span>
        <button className="comic-nav-btn" disabled={index >= pages.length - 1} onClick={() => goTo(index + 1)}>
          Next <Icon name="chevron_right" className="ms sm" />
        </button>
      </div>
    </div>
  );
});
