import { invoke as tauriInvoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { fallbackReadableExtensions } from '../constants/readableFormats';

export async function call(command, args = {}) {
  if (!window.__TAURI_INTERNALS__) {
    return mockCall(command, args);
  }
  return tauriInvoke(command, args);
}

export async function pickReadableFile(formats) {
  if (!window.__TAURI_INTERNALS__) {
    return 'mock.txt';
  }
  const extensions = formats?.length ? formats.map((format) => format.extension) : fallbackReadableExtensions;
  return open({
    multiple: false,
    filters: [{ name: 'Readable files', extensions }],
  });
}

export async function pickReadableDirectory() {
  if (!window.__TAURI_INTERNALS__) {
    return 'mock-folder';
  }
  return open({
    directory: true,
    multiple: false,
  });
}

let mockLibrary = [];
let mockAccess = { granted_roots: [] };
let mockAnnotations = [];

function mockBook(overrides = {}) {
  return {
    id: overrides.id || `mock-${Date.now()}`,
    title: overrides.title || 'Mock Page View Book',
    author: overrides.author || 'Author',
    file_type: overrides.file_type || 'TXT',
    format_label: overrides.format_label || 'TXT',
    category: overrides.category || '전자책/문서',
    tags: overrides.tags || [],
    reader_kind: overrides.reader_kind || 'document',
    progress: overrides.progress || 0,
    spine_index: overrides.spine_index || 0,
    reading_anchor_block_index: overrides.reading_anchor_block_index ?? null,
    reading_anchor_page_index: overrides.reading_anchor_page_index ?? null,
    reading_anchor_page_count: overrides.reading_anchor_page_count ?? null,
    date_added: overrides.date_added || Date.now() / 1000,
    is_favorite: overrides.is_favorite || false,
    description: overrides.description || '',
    cover_base64: overrides.cover_base64 || null,
    path: overrides.path || '',
    source_path: overrides.source_path || null,
    cache_key: overrides.cache_key || 'mock',
  };
}

async function mockCall(command, args = {}) {
  const mockParagraphs = Array.from({ length: 90 }, (_, i) =>
    `<p>Page view test paragraph ${i + 1}. This mock text is intentionally long enough to verify pagination, wheel page turns, and two column layout without importing a local file.</p>`,
  ).join('');
  const mockBlocks = Array.from({ length: 90 }, (_, i) => {
    if (i % 20 === 0) {
      const section = Math.floor(i / 20) + 1;
      return {
        block_type: 'heading',
        text: `Mock Section ${section}`,
        html: `<h2>Mock Section ${section}</h2>`,
        src: null,
        chapter_index: 0,
      };
    }
    return {
      block_type: 'text',
      text: `Page view test paragraph ${i + 1}. This mock text is intentionally long enough to verify pagination, wheel page turns, and two column layout without importing a local file.`,
      html: `<p>Page view test paragraph ${i + 1}. This mock text is intentionally long enough to verify pagination, wheel page turns, and two column layout without importing a local file.</p>`,
      src: null,
      chapter_index: 0,
    };
  });
  const mocks = {
    get_library: mockLibrary,
    get_supported_formats: fallbackReadableExtensions.map((extension) => ({
      extension,
      label: extension.toUpperCase(),
      category: 'Local mock',
      reader_kind: 'document',
      can_render: true,
    })),
    get_library_access: mockAccess,
    grant_library_folder_access: mockAccess,
    get_settings: {
      font_family: 'serif',
      font_size: 20,
      line_height: 1.6,
      theme: 'light',
      brightness: 90,
      scroll_mode: false,
      page_animation: 'none',
      show_progress_bar: true,
      columns: 2,
      margin_width: 3,
      justify_text: true,
      hyphenation: true,
    },
    save_settings: null,
    import_book: null,
    import_folder: null,
    get_reading_content: {
      kind: 'document',
      title: 'Mock Page View Book',
      html: mockParagraphs,
      pages: [],
      index: 0,
      total: 1,
      can_render: true,
      message: '',
    },
    get_text_layout_blocks: {
      kind: 'document',
      title: 'Mock Page View Book',
      blocks: mockBlocks,
      total_chapters: 1,
      can_render: true,
      message: '',
    },
    get_text_layout_preview_blocks: {
      kind: 'document',
      title: 'Mock Page View Book',
      blocks: mockBlocks.slice(0, 18),
      total_chapters: 1,
      can_render: true,
      message: '',
    },
    get_epub_layout_blocks: {
      kind: 'epub',
      title: 'Mock Page View Book',
      blocks: mockBlocks,
      total_chapters: 1,
      can_render: true,
      message: '',
    },
    get_epub_layout_preview_blocks: {
      kind: 'epub',
      title: 'Mock Page View Book',
      blocks: mockBlocks.slice(0, 18),
      total_chapters: 1,
      can_render: true,
      message: '',
    },
    render_text_pages: {
      kind: 'document',
      title: 'Mock Book',
      pages: [
        { title: 'Mock Book', html: '<p>Run through Tauri to read local files.</p>', chapter_index: 0, local_index: 0, global_index: 0 },
      ],
      index: 0,
      total: 1,
      can_render: true,
      message: '',
    },
    render_epub_pages: {
      kind: 'epub',
      title: 'Mock Book',
      pages: [
        { title: 'Chapter 1', html: '<p>Run through Tauri to read local files.</p>', chapter_index: 0, local_index: 0, global_index: 0 },
      ],
      index: 0,
      total: 1,
      can_render: true,
      message: '',
    },
    read_file_base64: '',
    update_progress: null,
    get_annotations: [],
    add_annotation: null,
    remove_annotation: null,
    rename_annotation: null,
    toggle_favorite: null,
    update_book_metadata: null,
    remove_book: null,
  };
  if (command === 'import_book') {
    const book = mockBook({ id: 'mock', path: args.path || 'mock.txt', source_path: args.path || 'mock.txt', tags: ['sample'] });
    mockLibrary = [book, ...mockLibrary.filter((item) => item.id !== book.id)];
    return book;
  }
  if (command === 'import_folder') {
    const now = Date.now() / 1000;
    const additions = [
      mockBook({ id: 'mock-folder-1', title: 'Collected Notes', file_type: 'MD', category: 'Notes', tags: ['work', 'draft'], date_added: now }),
      mockBook({ id: 'mock-folder-2', title: 'Design Reference', file_type: 'PDF', category: 'Reference', tags: ['design'], date_added: now - 1 }),
    ];
    mockLibrary = [...additions, ...mockLibrary.filter((book) => !additions.some((item) => item.id === book.id))];
    return additions.length;
  }
  if (command === 'grant_library_folder_access') {
    const root = args.path || 'mock-folder';
    mockAccess = {
      granted_roots: Array.from(new Set([...(mockAccess.granted_roots || []), root])),
    };
    return mockAccess;
  }
  if (command === 'toggle_favorite') {
    mockLibrary = mockLibrary.map((book) => (
      book.id === args.bookId ? { ...book, is_favorite: !book.is_favorite } : book
    ));
    return mockLibrary.find((book) => book.id === args.bookId)?.is_favorite || false;
  }
  if (command === 'update_progress') {
    mockLibrary = mockLibrary.map((book) => (
      book.id === args.bookId ? {
        ...book,
        progress: args.progress || 0,
        spine_index: args.spineIndex || 0,
        reading_anchor_block_index: args.blockIndex ?? null,
        reading_anchor_page_index: args.pageIndex ?? null,
        reading_anchor_page_count: args.pageCount ?? null,
      } : book
    ));
    return null;
  }
  if (command === 'get_annotations') {
    return mockAnnotations.filter((annotation) => annotation.bookId === args.bookId);
  }
  if (command === 'add_annotation') {
    const input = args.input || {};
    const annotation = {
      id: `annotation-${Date.now()}-${mockAnnotations.length}`,
      createdAt: Math.floor(Date.now() / 1000),
      kind: input.kind,
      bookId: input.bookId,
      pageIndex: input.pageIndex || 0,
      pageCount: input.pageCount || 1,
      spineIndex: input.spineIndex || 0,
      progress: input.progress || 0,
      quote: input.quote || '',
      note: input.note || '',
      color: input.color || 'yellow',
    };
    mockAnnotations = [...mockAnnotations, annotation];
    return annotation;
  }
  if (command === 'remove_annotation') {
    mockAnnotations = mockAnnotations.filter((annotation) => annotation.id !== args.annotationId);
    return null;
  }
  if (command === 'rename_annotation') {
    let renamed = null;
    mockAnnotations = mockAnnotations.map((annotation) => {
      if (annotation.id !== args.annotationId) return annotation;
      renamed = { ...annotation, note: String(args.note || '').trim() };
      return renamed;
    });
    if (!renamed) throw new Error('Annotation not found.');
    return renamed;
  }
  if (command === 'update_book_metadata') {
    const nextTags = Array.isArray(args.tags) ? args.tags : [];
    mockLibrary = mockLibrary.map((book) => (
      book.id === args.bookId ? { ...book, category: args.category || '', tags: nextTags } : book
    ));
    return mockLibrary.find((book) => book.id === args.bookId);
  }
  if (command === 'remove_book') {
    mockLibrary = mockLibrary.filter((book) => book.id !== args.bookId);
    return null;
  }
  if (!(command in mocks)) throw new Error(`Unknown command: ${command}`);
  return mocks[command];
}
