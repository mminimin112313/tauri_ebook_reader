import { useCallback, useEffect, useMemo, useState } from 'react';
import { call, pickReadableFile, pickReadableDirectory } from '../api/tauri';
import { filterBooks, libraryFacets, normalizeTags } from '../features/library/libraryMetadata.mjs';

export function useLibrary() {
  const [books, setBooks] = useState([]);
  const [formats, setFormats] = useState([]);
  const [access, setAccess] = useState({ granted_roots: [] });
  const [activeBook, setActiveBook] = useState(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('date');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setBooks(await call('get_library'));
  }, []);

  useEffect(() => {
    Promise.all([call('get_supported_formats'), call('get_library'), call('get_library_access')])
      .then(([loadedFormats, loadedBooks, loadedAccess]) => {
        setFormats(loadedFormats);
        setBooks(loadedBooks);
        setAccess(loadedAccess || { granted_roots: [] });
      })
      .catch((err) => setError(String(err)));
  }, []);

  const importFile = useCallback(async () => {
    setError('');
    const path = await pickReadableFile(formats);
    if (!path) return;
    setBusy(true);
    try {
      const book = await call('import_book', { path: Array.isArray(path) ? path[0] : path });
      await refresh();
      setActiveBook(book);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }, [formats, refresh]);

  const importFolder = useCallback(async () => {
    setError('');
    const path = await pickReadableDirectory();
    if (!path) return;
    setBusy(true);
    try {
      const added = await call('import_folder', { path: Array.isArray(path) ? path[0] : path });
      if (added > 0) {
        await refresh();
      } else {
        setError('No supported readable files found in the selected folder.');
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const grantFolderAccess = useCallback(async () => {
    setError('');
    const path = await pickReadableDirectory();
    if (!path) return null;
    setBusy(true);
    try {
      const selectedPath = Array.isArray(path) ? path[0] : path;
      const updatedAccess = await call('grant_library_folder_access', { path: selectedPath });
      setAccess(updatedAccess || { granted_roots: [] });
      return updatedAccess;
    } catch (err) {
      setError(String(err));
      throw err;
    } finally {
      setBusy(false);
    }
  }, []);

  const removeBook = useCallback(async (book) => {
    await call('remove_book', { bookId: book.id });
    if (activeBook?.id === book.id) setActiveBook(null);
    await refresh();
  }, [activeBook, refresh]);

  const toggleFavorite = useCallback(async (book) => {
    await call('toggle_favorite', { bookId: book.id });
    await refresh();
  }, [refresh]);

  const updateBookMetadata = useCallback(async (book, metadata) => {
    await call('update_book_metadata', {
      bookId: book.id,
      category: metadata.category || '',
      tags: normalizeTags(metadata.tags),
    });
    await refresh();
  }, [refresh]);

  const facets = useMemo(() => libraryFacets(books), [books]);

  const visibleBooks = useMemo(() => {
    const result = filterBooks(books, filter, query);

    if (sort === 'title') result.sort((a, b) => a.title.localeCompare(b.title));
    else if (sort === 'progress') result.sort((a, b) => b.progress - a.progress);
    else result.sort((a, b) => b.date_added - a.date_added);
    return result;
  }, [books, filter, query, sort]);

  return {
    books,
    visibleBooks,
    formats,
    access,
    facets,
    activeBook,
    setActiveBook,
    query,
    setQuery,
    filter,
    setFilter,
    sort,
    setSort,
    busy,
    error,
    importFile,
    importFolder,
    grantFolderAccess,
    removeBook,
    toggleFavorite,
    updateBookMetadata,
    refresh,
  };
}
