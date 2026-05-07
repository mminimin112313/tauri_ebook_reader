export function normalizeTags(value) {
  if (Array.isArray(value)) {
    return dedupe(value.map((item) => String(item).trim()).filter(Boolean));
  }

  return dedupe(
    String(value || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

export function libraryFacets(books) {
  const categories = new Map();
  const tags = new Map();

  for (const book of books || []) {
    const category = normalizeCategory(book.category);
    if (category) categories.set(category, (categories.get(category) || 0) + 1);
    for (const tag of normalizeTags(book.tags)) {
      tags.set(tag, (tags.get(tag) || 0) + 1);
    }
  }

  return {
    categories: sortedFacetEntries(categories),
    tags: sortedFacetEntries(tags),
  };
}

export function filterBooks(books, filter, query = '') {
  const needle = query.trim().toLowerCase();

  return (books || []).filter((book) => {
    if (filter === 'recent' && !book.last_read) return false;
    if (filter === 'unread' && book.last_read && (book.progress || 0) >= 0.01) return false;
    if (filter === 'favorites' && !book.is_favorite) return false;
    if (filter?.startsWith('category:') && normalizeCategory(book.category) !== filter.slice(9)) return false;
    if (filter?.startsWith('tag:') && !normalizeTags(book.tags).includes(filter.slice(4))) return false;

    if (!needle) return true;
    return [
      book.title,
      book.author,
      book.file_type,
      normalizeCategory(book.category),
      ...normalizeTags(book.tags),
    ].join(' ').toLowerCase().includes(needle);
  });
}

function normalizeCategory(value) {
  return String(value || '').trim();
}

function sortedFacetEntries(map) {
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, count]) => ({ name, count }));
}

function dedupe(items) {
  return [...new Set(items)];
}
