import { LibraryView } from './features/library/LibraryView';
import { ReaderView } from './features/reader/ReaderView';
import { useLibrary } from './state/useLibrary';

export default function App() {
  const library = useLibrary();

  if (library.activeBook) {
    return (
      <ReaderView
        book={library.activeBook}
        backToLibrary={() => library.setActiveBook(null)}
        refresh={library.refresh}
      />
    );
  }

  return (
    <LibraryView
      books={library.visibleBooks}
      formats={library.formats}
      access={library.access}
      facets={library.facets}
      query={library.query}
      setQuery={library.setQuery}
      filter={library.filter}
      setFilter={library.setFilter}
      sort={library.sort}
      setSort={library.setSort}
      importFile={library.importFile}
      importFolder={library.importFolder}
      grantFolderAccess={library.grantFolderAccess}
      openBook={library.setActiveBook}
      removeBook={library.removeBook}
      toggleFavorite={library.toggleFavorite}
      updateBookMetadata={library.updateBookMetadata}
      busy={library.busy}
      error={library.error}
    />
  );
}
