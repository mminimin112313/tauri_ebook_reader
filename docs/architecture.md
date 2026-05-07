# Libris Reader Architecture

## Frontend

The frontend is a Vite + React app. Keep feature code under `src/features/*`, shared UI under `src/components`, Tauri calls under `src/api`, app state hooks under `src/state`, and cross-feature constants under `src/constants`.

Styles are intentionally split by responsibility:

- `src/styles/tokens.css`: design tokens only
- `src/styles/base.css`: reset, shared buttons, notices
- `src/styles/layout.css`: app shell and sidebar
- `src/styles/library.css`: library screen
- `src/styles/reader.css`: reader screen

Do not add new screen-specific CSS to `base.css`. Add a new feature stylesheet when a feature becomes large enough to own its own layout.

## Backend

The Tauri backend owns local file access, metadata parsing, persistence, and content extraction.

- `formats.rs`: supported extension registry and reader classification
- `library.rs`: SQLite library database and reading cache
- `content.rs`: non-EPUB content extraction for text, image, comic, and archive formats
- `epub.rs`: EPUB metadata and spine extraction

The frontend should not infer whether a format can render. It should use backend fields such as `reader_kind`, `category`, and `can_render`.

## Persistence

Library data is stored in `library.sqlite3` under the platform data directory. Legacy `library.json` is migrated automatically on first database load. Rendered reading payloads are cached by `book_id` and `cache_key`, where `cache_key` is derived from path, size, and modified time.

## Format Roadmap

Import support and render support are separate. All requested formats can be imported. Formats with no native renderer should remain visible in the library with a clear blocked state until a renderer or converter is connected.

Next renderer seams:

- PDF/DJVU: page rasterization or embedded viewer
- MOBI/AZW/AZW3/PRC: dedicated Kindle-format parser or conversion pipeline
- CHM/UMD: archive/index extraction layer
