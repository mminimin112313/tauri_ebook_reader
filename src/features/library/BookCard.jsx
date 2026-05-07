import { Icon } from '../../components/Icon';
import { useCallback, useState } from 'react';
import { normalizeTags } from './libraryMetadata.mjs';

export function BookCard({ book, openBook, removeBook, toggleFavorite, updateBookMetadata }) {
  const [ctx, setCtx] = useState(null);
  const [editing, setEditing] = useState(false);
  const [category, setCategory] = useState(book.category || '');
  const [tags, setTags] = useState(normalizeTags(book.tags).join(', '));

  const handleContextMenu = useCallback((e) => {
    e.preventDefault();
    setCtx({ x: e.clientX, y: e.clientY });
  }, []);

  const closeCtx = useCallback(() => setCtx(null), []);

  const handleClick = useCallback(() => {
    if (!ctx) openBook(book);
  }, [book, ctx, openBook]);

  const handleFav = useCallback((e) => {
    e.stopPropagation();
    toggleFavorite(book);
  }, [book, toggleFavorite]);

  const openMetadata = useCallback((e) => {
    e.stopPropagation();
    setCategory(book.category || '');
    setTags(normalizeTags(book.tags).join(', '));
    setEditing(true);
  }, [book]);

  const closeMetadata = useCallback((e) => {
    e?.stopPropagation?.();
    setEditing(false);
  }, []);

  const saveMetadata = useCallback(async (e) => {
    e.stopPropagation();
    await updateBookMetadata(book, { category, tags });
    setEditing(false);
  }, [book, category, tags, updateBookMetadata]);

  const pct = Math.round((book.progress || 0) * 100);
  const bookTags = normalizeTags(book.tags);

  return (
    <>
      <div
        className="book-card"
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        title={book.title}
      >
        <div className="book-card-cover">
          {book.cover_base64 ? (
            <img src={book.cover_base64} alt={book.title} draggable={false} />
          ) : (
            <div className="book-card-cover-placeholder">
              <Icon name="menu_book" className="ms" />
              <span className="fmt-badge">{book.file_type}</span>
            </div>
          )}
          {pct > 0 && (
            <div className="book-card-progress-bar">
              <div className="book-card-progress-fill" style={{ width: `${pct}%` }} />
            </div>
          )}
          <button
            className={`book-card-fav-btn ${book.is_favorite ? 'on' : ''}`}
            onClick={handleFav}
            title={book.is_favorite ? 'Remove favorite' : 'Add favorite'}
          >
            <Icon name="star" className="ms" />
          </button>
        </div>
        <div className="book-card-info">
          <p className="book-card-title">{book.title}</p>
          {book.author && <p className="book-card-author">{book.author}</p>}
          <div className="book-card-meta-row">
            <span className="book-card-format">{book.file_type}</span>
            {book.category && <span className="book-card-category">{book.category}</span>}
          </div>
          {bookTags.length > 0 && (
            <div className="book-card-tags">
              {bookTags.slice(0, 3).map((tag) => <span key={tag}>{tag}</span>)}
            </div>
          )}
          <button className="book-card-manage" onClick={openMetadata}>
            <Icon name="label" className="ms" />
            Organize
          </button>
        </div>
      </div>

      {editing && (
        <div className="metadata-popover" onClick={(e) => e.stopPropagation()}>
          <div className="metadata-popover-header">
            <strong>Organize book</strong>
            <button onClick={closeMetadata} aria-label="Close organize panel">
              <Icon name="close" className="ms" />
            </button>
          </div>
          <label className="metadata-field">
            <span>Category</span>
            <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Reference, Fiction, Work…" />
          </label>
          <label className="metadata-field">
            <span>Tags</span>
            <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="comma, separated, tags" />
          </label>
          <div className="metadata-actions">
            <button className="btn-ghost compact" onClick={closeMetadata}>Cancel</button>
            <button className="btn-primary compact" onClick={saveMetadata}>Save</button>
          </div>
        </div>
      )}

      {ctx && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 199 }} onClick={closeCtx} />
          <div className="ctx-menu" style={{ left: ctx.x, top: ctx.y }}>
            <button className="ctx-item" onClick={() => { closeCtx(); openBook(book); }}>
              <Icon name="play_arrow" className="ms" /> Read Now
            </button>
            <button className="ctx-item" onClick={() => { closeCtx(); toggleFavorite(book); }}>
              <Icon name="star" className="ms" />
              {book.is_favorite ? 'Remove Favorite' : 'Add Favorite'}
            </button>
            <button className="ctx-item" onClick={(e) => { closeCtx(); openMetadata(e); }}>
              <Icon name="label" className="ms" /> Organize
            </button>
            <div className="ctx-sep" />
            <button className="ctx-item danger" onClick={() => { closeCtx(); removeBook(book); }}>
              <Icon name="delete" className="ms" /> Remove
            </button>
          </div>
        </>
      )}
    </>
  );
}
