import { Icon } from '../../components/Icon';
import { useState } from 'react';
import { BookCard } from './BookCard';
import { formatGrantedAccess } from '../../state/libraryAccess.mjs';

const NAV = [
  { key: 'all',       icon: 'library_books',  label: 'All books' },
  { key: 'recent',    icon: 'history',         label: 'Recent' },
  { key: 'unread',    icon: 'auto_stories',    label: 'Unread' },
  { key: 'favorites', icon: 'star',            label: 'Favorites' },
];

export function LibraryView({
  books, formats, access, facets, query, setQuery,
  filter, setFilter, sort, setSort,
  importFile, importFolder, grantFolderAccess, openBook, removeBook, toggleFavorite, updateBookMetadata,
  busy, error,
}) {
  const categoryFilters = facets?.categories || [];
  const tagFilters = facets?.tags || [];
  const bookCountLabel = `${books.length} ${books.length === 1 ? 'book' : 'books'}`;
  const accessLabel = formatGrantedAccess(access);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* Top App Bar */}
      <header className="topbar">
        <div className="topbar-brand">Libris Reader</div>
        <div className="topbar-meta">{bookCountLabel}</div>
      </header>

      {/* Body */}
      <div className="body-content">
        {/* Sidebar */}
        <aside className="sidebar">
          <nav className="sidebar-nav">
            {NAV.map(({ key, icon, label }) => (
              <button
                key={key}
                className={`side-link ${filter === key ? 'active' : ''}`}
                onClick={() => setFilter(key)}
              >
                <Icon name={icon} className="ms" />
                <span>{label}</span>
              </button>
            ))}
          </nav>
          {(categoryFilters.length > 0 || tagFilters.length > 0) && (
            <div className="sidebar-facets">
              {categoryFilters.length > 0 && (
                <FacetGroup
                  title="Categories"
                  items={categoryFilters}
                  activeKey={filter}
                  makeKey={(name) => `category:${name}`}
                  icon="label"
                  setFilter={setFilter}
                />
              )}
              {tagFilters.length > 0 && (
                <FacetGroup
                  title="Tags"
                  items={tagFilters}
                  activeKey={filter}
                  makeKey={(name) => `tag:${name}`}
                  icon="sell"
                  setFilter={setFilter}
                />
              )}
            </div>
          )}
          <div className="sidebar-footer">
            <p>Use categories for shelves and tags for flexible reading lists.</p>
          </div>
        </aside>

        {/* Main area */}
        <div className="library-main">
          <div className="library-header">
            <div>
              <p className="library-eyebrow">{bookCountLabel} · {formats.length} formats</p>
              <h1 className="library-title">Library</h1>
            </div>
            <div className="library-actions">
              <button className="btn-secondary" onClick={grantFolderAccess} disabled={busy} title={accessLabel}>
                <Icon name="vpn_key" className="ms sm" />
                Grant access
              </button>
              <button className="btn-primary" onClick={importFile} disabled={busy}>
                <Icon name="upload_file" className="ms sm" />
                Import file
              </button>
              <button className="btn-secondary" onClick={importFolder} disabled={busy}>
                <Icon name="folder_zip" className="ms sm" />
                Import folder
              </button>
            </div>
          </div>

          <div className="toolbar">
            <div className="search-bar">
              <Icon name="search" className="ms" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search title, author, format…"
              />
            </div>
            <div className="seg-group">
              {[['date','Added'],['title','A–Z'],['progress','Progress']].map(([k, l]) => (
                <button
                  key={k}
                  className={`seg-btn ${sort === k ? 'active' : ''}`}
                  onClick={() => setSort(k)}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          <div className="library-access-row">
            <Icon name="vpn_key" className="ms sm" />
            <span>{accessLabel}</span>
          </div>

          {error && <div className="notice" style={{ margin: '0 32px 12px' }}>{error}</div>}

          <div className="book-grid-wrap">
            {books.length === 0 ? (
              <div className="empty-state">
                <Icon name="menu_book" className="ms" style={{ fontSize: 56 }} />
                <h2>Your library is empty</h2>
                <p>Import EPUB, PDF, Markdown, CBZ, TXT, HTML and more</p>
                <div className="empty-state-actions">
                  <button className="btn-primary" onClick={importFile}>
                    <Icon name="upload_file" className="ms sm" />
                    Import readable file
                  </button>
                  <button className="btn-secondary" onClick={importFolder}>
                    <Icon name="folder_zip" className="ms sm" />
                    Import folder
                  </button>
                  <button className="btn-secondary" onClick={grantFolderAccess}>
                    <Icon name="vpn_key" className="ms sm" />
                    Grant folder access
                  </button>
                </div>
              </div>
            ) : (
              <div className="book-grid">
                {books.map((book) => (
                  <BookCard
                    key={book.id}
                    book={book}
                    openBook={openBook}
                    removeBook={removeBook}
                    toggleFavorite={toggleFavorite}
                    updateBookMetadata={updateBookMetadata}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function FacetGroup({ title, items, activeKey, makeKey, icon, setFilter }) {
  return (
    <div className="facet-group">
      <div className="facet-title">{title}</div>
      {items.map(({ name, count }) => {
        const key = makeKey(name);
        return (
          <button
            key={key}
            className={`facet-link ${activeKey === key ? 'active' : ''}`}
            onClick={() => setFilter(key)}
          >
            <Icon name={icon} className="ms" />
            <span>{name}</span>
            <span className="facet-count">{count}</span>
          </button>
        );
      })}
    </div>
  );
}
