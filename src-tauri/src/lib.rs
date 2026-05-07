mod access;
mod annotations;
mod epub;
mod formats;
mod library;
mod pagination;
mod settings;

use access::LibraryAccess;
use annotations::{AnnotationInput, AnnotationStore, ReaderAnnotation};
use base64::{engine::general_purpose, Engine as _};
use library::{BookEntry, Library};
use serde::{Deserialize, Serialize};
use settings::ReadingSettings;
use std::io::Read;
use std::path::{Path, PathBuf};

// ─────────────────────────────────────────────
// Tauri Commands
// ─────────────────────────────────────────────

#[tauri::command]
async fn get_library() -> Result<Vec<BookEntry>, String> {
    Ok(Library::load().books)
}

#[tauri::command]
async fn get_library_access() -> Result<LibraryAccess, String> {
    Ok(LibraryAccess::load())
}

#[tauri::command]
async fn grant_library_folder_access(path: String) -> Result<LibraryAccess, String> {
    let mut access = LibraryAccess::load();
    access.grant_root(Path::new(&path))
}

#[tauri::command]
async fn import_book(path: String) -> Result<BookEntry, String> {
    let source_path = path.clone();
    let cached_path = cache_import_file(&source_path)?;
    let entry = book_entry_from_paths(&source_path, cached_path);
    let mut lib = Library::load();
    Ok(lib.add_book(entry))
}

#[tauri::command]
async fn import_folder(path: String) -> Result<usize, String> {
    fn walk_dir(dir: &std::path::Path, lib: &mut Library) -> usize {
        let mut count = 0;
        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries.filter_map(Result::ok) {
                let path = entry.path();
                if path.is_dir() {
                    count += walk_dir(&path, lib);
                } else if let Some(ext) = path
                    .extension()
                    .and_then(|e| e.to_str())
                    .map(|e| e.to_lowercase())
                {
                    if matches!(
                        ext.as_str(),
                        "epub" | "pdf" | "cbz" | "zip" | "cbr" | "txt" | "md" | "html"
                    ) {
                        let path_str = path.to_string_lossy().to_string();
                        let cached_path = match cache_import_file(&path_str) {
                            Ok(path) => path,
                            Err(_) => continue,
                        };
                        if lib.books.iter().any(|b| b.path == cached_path) {
                            continue;
                        }

                        let mut entry = book_entry_from_paths(&path_str, cached_path);
                        entry.date_added = library::current_timestamp();
                        lib.add_book(entry);
                        count += 1;
                    }
                }
            }
        }
        count
    }
    let mut lib = Library::load();
    let added = walk_dir(std::path::Path::new(&path), &mut lib);
    Ok(added)
}

#[tauri::command]
async fn get_supported_formats() -> Result<Vec<formats::FormatInfo>, String> {
    Ok(formats::supported_formats())
}

#[tauri::command]
async fn read_file_base64(path: String) -> Result<String, String> {
    let path = resolve_read_path(&path)?;
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    Ok(general_purpose::STANDARD.encode(&bytes))
}

#[tauri::command]
async fn get_epub_content(path: String, spine_index: usize) -> Result<epub::SpineContent, String> {
    let path = resolve_read_path(&path)?;
    epub::get_spine_content(&path, spine_index)
}

#[tauri::command]
async fn get_epub_meta(path: String) -> Result<epub::EpubMeta, String> {
    let path = resolve_read_path(&path)?;
    epub::parse_epub_meta(&path)
}

#[tauri::command]
async fn render_epub_pages(
    path: String,
    options: pagination::PageRenderOptions,
) -> Result<pagination::PaginatedContent, String> {
    let path = resolve_read_path(&path)?;
    let meta = epub::parse_epub_meta(&path).ok();
    let title = meta
        .as_ref()
        .map(|m| m.title.clone())
        .unwrap_or_else(|| stem_name(&path));

    let first = epub::get_spine_content(&path, 0)?;
    let total = first.total;
    let mut chapters = Vec::with_capacity(total);

    for index in 0..total {
        let content = if index == 0 {
            first.clone()
        } else {
            epub::get_spine_content(&path, index)?
        };
        let chapter_title = meta
            .as_ref()
            .and_then(|m| {
                m.toc
                    .iter()
                    .find(|entry| entry.play_order as usize == index + 1)
            })
            .map(|entry| entry.title.clone())
            .unwrap_or_else(|| format!("Chapter {}", index + 1));
        chapters.push((index, chapter_title, content.html));
    }

    Ok(pagination::paginate_epub_chapters(
        &title, chapters, &options,
    ))
}

// ─── Generic text / html / comic content ────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct TextContent {
    pub html: String,
    pub kind: String,
}

#[tauri::command]
async fn get_text_content(path: String) -> Result<TextContent, String> {
    let path = resolve_read_path(&path)?;
    let ext = Path::new(&path)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_default();

    let raw = std::fs::read(&path).map_err(|e| e.to_string())?;

    let html = match ext.as_str() {
        "md" | "markdown" => {
            let text = String::from_utf8_lossy(&raw);
            markdown_to_html(&text)
        }
        "html" | "htm" => String::from_utf8_lossy(&raw).to_string(),
        _ => {
            let text = String::from_utf8_lossy(&raw);
            plain_to_html(&text)
        }
    };

    Ok(TextContent { html, kind: ext })
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ComicContent {
    pub images: Vec<String>, // base64 data URLs
    pub total: usize,
}

#[tauri::command]
async fn get_cbz_content(
    path: String,
    page_start: usize,
    page_count: usize,
) -> Result<ComicContent, String> {
    use std::io::Read;

    let path = resolve_read_path(&path)?;
    let file = std::fs::File::open(&path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;

    let mut image_names: Vec<String> = (0..archive.len())
        .filter_map(|i| {
            let f = archive.by_index(i).ok()?;
            let name = f.name().to_string();
            if formats::is_image_file(&name) {
                Some(name)
            } else {
                None
            }
        })
        .collect();

    image_names.sort();
    let total = image_names.len();
    let end = (page_start + page_count).min(total);

    let mut images = Vec::new();
    for name in &image_names[page_start..end] {
        if let Ok(mut f) = archive.by_name(name) {
            let mut bytes = Vec::new();
            if f.read_to_end(&mut bytes).is_ok() {
                let low = name.to_lowercase();
                let mime = if low.ends_with(".png") {
                    "image/png"
                } else if low.ends_with(".webp") {
                    "image/webp"
                } else if low.ends_with(".gif") {
                    "image/gif"
                } else {
                    "image/jpeg"
                };
                let b64 = general_purpose::STANDARD.encode(&bytes);
                images.push(format!("data:{};base64,{}", mime, b64));
            }
        }
    }

    Ok(ComicContent { images, total })
}

// ─── get_reading_content: unified entry for all non-epub/pdf formats ─────────

#[derive(Debug, Serialize, Deserialize)]
pub struct PageInfo {
    pub src: String,
    pub title: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ReadingContent {
    pub kind: String,
    pub title: String,
    pub html: String,
    pub pages: Vec<PageInfo>,
    pub index: usize,
    pub total: usize,
    pub can_render: bool,
    pub message: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LayoutBlock {
    pub block_type: String,
    pub text: String,
    pub html: String,
    pub src: Option<String>,
    pub chapter_index: usize,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LayoutDocument {
    pub kind: String,
    pub title: String,
    pub blocks: Vec<LayoutBlock>,
    pub total_chapters: usize,
    pub can_render: bool,
    pub message: String,
}

#[tauri::command]
async fn get_reading_content(path: String, spine_index: usize) -> Result<ReadingContent, String> {
    let path = resolve_read_path(&path)?;
    let ext = formats::extension(&path);
    match ext.as_str() {
        "txt" | "rtf" | "md" | "markdown" | "html" | "htm" | "mht" | "mhtml" => {
            let tc = get_text_content(path).await?;
            Ok(ReadingContent {
                kind: tc.kind.clone(),
                title: String::new(),
                html: tc.html,
                pages: vec![],
                index: 0,
                total: 1,
                can_render: true,
                message: String::new(),
            })
        }
        "cbz" | "zip" | "cbr" => match get_cbz_content(path, 0, 600).await {
            Ok(comic) => {
                let total = comic.total;
                let idx = if total > 0 {
                    spine_index.min(total - 1)
                } else {
                    0
                };
                let pages: Vec<PageInfo> = comic
                    .images
                    .into_iter()
                    .enumerate()
                    .map(|(i, src)| PageInfo {
                        src,
                        title: format!("Page {}", i + 1),
                    })
                    .collect();
                Ok(ReadingContent {
                    kind: "comic".into(),
                    title: String::new(),
                    html: String::new(),
                    pages,
                    index: idx,
                    total,
                    can_render: true,
                    message: String::new(),
                })
            }
            Err(e) => Ok(ReadingContent {
                kind: "comic".into(),
                title: String::new(),
                html: String::new(),
                pages: vec![],
                index: 0,
                total: 0,
                can_render: false,
                message: format!("Failed to open archive: {}", e),
            }),
        },
        _ => {
            let fmt = formats::classify_path(&path);
            Ok(ReadingContent {
                kind: fmt.reader_kind.clone(),
                title: String::new(),
                html: String::new(),
                pages: vec![],
                index: 0,
                total: 1,
                can_render: false,
                message: format!(
                    "{} format is not yet supported for inline reading.",
                    fmt.label
                ),
            })
        }
    }
}

#[tauri::command]
async fn get_text_layout_blocks(path: String) -> Result<LayoutDocument, String> {
    let content = get_reading_content(path.clone(), 0).await?;
    if !content.can_render || content.html.is_empty() {
        return Ok(LayoutDocument {
            kind: content.kind,
            title: stem_name(&path),
            blocks: Vec::new(),
            total_chapters: 1,
            can_render: false,
            message: content.message,
        });
    }

    Ok(LayoutDocument {
        kind: content.kind,
        title: stem_name(&path),
        blocks: html_to_layout_blocks(&content.html, 0),
        total_chapters: 1,
        can_render: true,
        message: String::new(),
    })
}

#[tauri::command]
async fn get_text_layout_preview_blocks(path: String) -> Result<LayoutDocument, String> {
    let path = resolve_read_path(&path)?;
    let ext = Path::new(&path)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_default();
    if !matches!(
        ext.as_str(),
        "txt" | "rtf" | "md" | "markdown" | "html" | "htm" | "mht" | "mhtml"
    ) {
        return Ok(LayoutDocument {
            kind: ext,
            title: stem_name(&path),
            blocks: Vec::new(),
            total_chapters: 1,
            can_render: false,
            message: "This format cannot be previewed as text.".to_string(),
        });
    }

    let html = read_text_preview_html(&path, &ext, 16 * 1024)?;
    Ok(LayoutDocument {
        kind: ext,
        title: stem_name(&path),
        blocks: html_to_layout_blocks(&html, 0),
        total_chapters: 1,
        can_render: true,
        message: String::new(),
    })
}

#[tauri::command]
async fn get_epub_layout_blocks(path: String) -> Result<LayoutDocument, String> {
    let path = resolve_read_path(&path)?;
    let meta = epub::parse_epub_meta(&path).ok();
    let title = meta
        .as_ref()
        .map(|m| m.title.clone())
        .unwrap_or_else(|| stem_name(&path));
    let first = epub::get_spine_content(&path, 0)?;
    let mut blocks = Vec::new();

    for index in 0..first.total {
        let chapter = if index == 0 {
            first.clone()
        } else {
            epub::get_spine_content(&path, index)?
        };
        blocks.extend(html_to_layout_blocks(&chapter.html, index));
    }

    Ok(LayoutDocument {
        kind: "epub".to_string(),
        title,
        blocks,
        total_chapters: first.total,
        can_render: true,
        message: String::new(),
    })
}

#[tauri::command]
async fn get_epub_layout_preview_blocks(
    path: String,
    spine_index: usize,
) -> Result<LayoutDocument, String> {
    let path = resolve_read_path(&path)?;
    let meta = epub::parse_epub_meta(&path).ok();
    let title = meta
        .as_ref()
        .map(|m| m.title.clone())
        .unwrap_or_else(|| stem_name(&path));
    let chapter = epub::get_spine_content(&path, spine_index)?;

    Ok(LayoutDocument {
        kind: "epub".to_string(),
        title,
        blocks: html_to_layout_blocks(&chapter.html, spine_index),
        total_chapters: chapter.total,
        can_render: true,
        message: String::new(),
    })
}

#[tauri::command]
async fn render_text_pages(
    path: String,
    options: pagination::PageRenderOptions,
) -> Result<pagination::PaginatedContent, String> {
    let path = resolve_read_path(&path)?;
    let content = get_reading_content(path.clone(), 0).await?;
    if !content.can_render || content.html.is_empty() {
        return Ok(pagination::PaginatedContent {
            kind: content.kind,
            title: content.title,
            pages: Vec::new(),
            index: 0,
            total: 0,
            can_render: false,
            message: if content.message.is_empty() {
                "This format cannot be paginated as text.".to_string()
            } else {
                content.message
            },
        });
    }

    let title = if content.title.is_empty() {
        stem_name(&path)
    } else {
        content.title
    };
    Ok(pagination::paginate_html(
        &content.kind,
        &title,
        &content.html,
        &options,
    ))
}

// ─── PDF (raw base64) ─────────────────────────────────────────────────────────

#[tauri::command]
async fn get_pdf_base64(path: String) -> Result<String, String> {
    let path = resolve_read_path(&path)?;
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    let b64 = general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:application/pdf;base64,{}", b64))
}

// ─── Progress / Library management ──────────────────────────────────────────

#[tauri::command]
async fn update_progress(
    book_id: String,
    progress: f32,
    spine_index: usize,
    block_index: Option<usize>,
    page_index: Option<usize>,
    page_count: Option<usize>,
) -> Result<(), String> {
    let mut lib = Library::load();
    lib.update_progress_with_anchor(
        &book_id,
        progress,
        spine_index,
        block_index,
        page_index,
        page_count,
    );
    Ok(())
}

#[tauri::command]
async fn get_annotations(book_id: String) -> Result<Vec<ReaderAnnotation>, String> {
    Ok(AnnotationStore::load().by_book(&book_id))
}

#[tauri::command]
async fn add_annotation(input: AnnotationInput) -> Result<ReaderAnnotation, String> {
    let mut store = AnnotationStore::load();
    store.add(input)
}

#[tauri::command]
async fn remove_annotation(annotation_id: String) -> Result<(), String> {
    let mut store = AnnotationStore::load();
    if store.remove(&annotation_id) {
        Ok(())
    } else {
        Err("Annotation not found.".to_string())
    }
}

#[tauri::command]
async fn rename_annotation(
    annotation_id: String,
    note: String,
) -> Result<ReaderAnnotation, String> {
    let mut store = AnnotationStore::load();
    store.rename(&annotation_id, note)
}

#[tauri::command]
async fn toggle_favorite(book_id: String) -> Result<bool, String> {
    let mut lib = Library::load();
    Ok(lib.toggle_favorite(&book_id))
}

#[tauri::command]
async fn update_book_metadata(
    book_id: String,
    category: String,
    tags: Vec<String>,
) -> Result<BookEntry, String> {
    let mut lib = Library::load();
    lib.update_metadata(&book_id, category, tags)
        .ok_or_else(|| "Book not found".to_string())
}

#[tauri::command]
async fn remove_book(book_id: String) -> Result<(), String> {
    let mut lib = Library::load();
    lib.remove_book(&book_id);
    Ok(())
}

// ─── Settings ────────────────────────────────────────────────────────────────

#[tauri::command]
async fn get_settings() -> Result<ReadingSettings, String> {
    Ok(ReadingSettings::load())
}

#[tauri::command]
async fn save_settings(settings: ReadingSettings) -> Result<(), String> {
    settings.save();
    Ok(())
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

fn stem_name(path: &str) -> String {
    Path::new(path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Unknown")
        .to_string()
}

fn book_entry_from_paths(source_path: &str, cached_path: String) -> BookEntry {
    let ext = Path::new(&cached_path)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_default();

    let (title, author, cover_base64, description) = match ext.as_str() {
        "epub" => match epub::parse_epub_meta(&cached_path) {
            Ok(meta) => (meta.title, meta.author, meta.cover_base64, meta.description),
            Err(_) => (
                stem_name(source_path),
                "Unknown Author".into(),
                None,
                String::new(),
            ),
        },
        _ => (stem_name(source_path), String::new(), None, String::new()),
    };

    let fmt = formats::classify_path(&cached_path);
    BookEntry {
        id: String::new(),
        path: cached_path,
        source_path: Some(source_path.to_string()),
        title,
        author,
        cover_base64,
        file_type: ext.to_uppercase(),
        format_label: fmt.label,
        category: fmt.category,
        tags: Vec::new(),
        reader_kind: fmt.reader_kind,
        progress: 0.0,
        spine_index: 0,
        reading_anchor_block_index: None,
        reading_anchor_page_index: None,
        reading_anchor_page_count: None,
        date_added: 0,
        last_read: None,
        is_favorite: false,
        description,
    }
}

fn cache_import_file(path: &str) -> Result<String, String> {
    let source = Path::new(path);
    if !source.is_file() {
        return Err("Selected path is not a readable file.".to_string());
    }
    let destination = cached_import_path_for_source(source, &library_data_dir())?;
    if let Some(parent) = destination.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    if source != destination {
        std::fs::copy(source, &destination).map_err(|e| e.to_string())?;
    }
    Ok(destination.to_string_lossy().to_string())
}

fn resolve_read_path(path: &str) -> Result<String, String> {
    resolve_read_path_with_base(path, &library_data_dir())
}

fn resolve_read_path_with_base(path: &str, data_dir: &Path) -> Result<String, String> {
    let source = Path::new(path);
    if source.starts_with(data_dir.join("imports")) {
        return Ok(path.to_string());
    }
    if LibraryAccess::load().path_is_granted(source) && source.exists() {
        return Ok(path.to_string());
    }
    let cached = cached_import_path_for_source(source, data_dir)?;
    if cached.exists() {
        return Ok(cached.to_string_lossy().to_string());
    }
    cache_import_file(path)
}

fn cached_import_path_for_source(source: &Path, base_dir: &Path) -> Result<PathBuf, String> {
    let file_name = source
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "Selected file has no usable filename.".to_string())?;
    let hash = stable_path_hash(&source.to_string_lossy());
    Ok(base_dir
        .join("imports")
        .join(format!("{hash:016x}"))
        .join(sanitize_file_name(file_name)))
}

fn library_data_dir() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("libris-reader")
}

fn stable_path_hash(value: &str) -> u64 {
    let mut hash = 0xcbf29ce484222325u64;
    for byte in value.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    hash
}

fn sanitize_file_name(file_name: &str) -> String {
    file_name
        .chars()
        .map(|ch| match ch {
            '/' | '\\' | ':' | '\0' => '_',
            _ => ch,
        })
        .collect()
}

fn markdown_to_html(text: &str) -> String {
    use pulldown_cmark::{html, Options, Parser};
    let opts = Options::ENABLE_STRIKETHROUGH | Options::ENABLE_TABLES | Options::ENABLE_FOOTNOTES;
    let parser = Parser::new_ext(text, opts);
    let mut html_output = String::new();
    html::push_html(&mut html_output, parser);
    html_output
}

fn plain_to_html(text: &str) -> String {
    let escaped = text
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;");
    let with_breaks = escaped.replace('\n', "<br>");
    format!("<div class=\"plain-text\">{}</div>", with_breaks)
}

fn read_text_preview_html(path: &str, ext: &str, max_bytes: usize) -> Result<String, String> {
    let mut file = std::fs::File::open(path).map_err(|e| e.to_string())?;
    let mut buf = Vec::with_capacity(max_bytes.min(128 * 1024));
    file.by_ref()
        .take(max_bytes as u64)
        .read_to_end(&mut buf)
        .map_err(|e| e.to_string())?;
    let text = String::from_utf8_lossy(&buf);
    let safe_preview = trim_to_line_boundary(&text);
    Ok(match ext {
        "md" | "markdown" => markdown_to_html(&safe_preview),
        "html" | "htm" | "mht" | "mhtml" => safe_preview,
        _ => plain_to_html(&safe_preview),
    })
}

fn trim_to_line_boundary(text: &str) -> String {
    if let Some(index) = text.rfind('\n') {
        text[..index].to_string()
    } else {
        text.to_string()
    }
}

fn html_to_layout_blocks(html: &str, chapter_index: usize) -> Vec<LayoutBlock> {
    let mut blocks = Vec::new();
    let mut cursor = 0usize;
    let lower = html.to_lowercase();
    let closers = [
        "</h1>",
        "</h2>",
        "</h3>",
        "</h4>",
        "</h5>",
        "</h6>",
        "</p>",
        "</li>",
        "</blockquote>",
        "</pre>",
        "</code>",
        "</table>",
        "</math>",
        "</figure>",
        "</div>",
    ];

    while cursor < html.len() {
        if let Some((start, end)) = find_next_img(html, &lower, cursor) {
            push_text_fragment(&mut blocks, &html[cursor..start], chapter_index);
            let fragment = &html[start..end];
            blocks.push(layout_block("image", fragment, chapter_index));
            cursor = end;
            continue;
        }

        let next = closers
            .iter()
            .filter_map(|closer| {
                lower[cursor..]
                    .find(closer)
                    .map(|pos| cursor + pos + closer.len())
            })
            .min();

        if let Some(end) = next {
            let fragment = html[cursor..end].trim();
            if !fragment.is_empty() {
                blocks.push(layout_block(
                    classify_html_block(fragment),
                    fragment,
                    chapter_index,
                ));
            }
            cursor = end;
        } else {
            break;
        }
    }

    push_text_fragment(&mut blocks, &html[cursor..], chapter_index);
    if blocks.is_empty() {
        push_text_fragment(&mut blocks, html, chapter_index);
    }
    blocks
}

fn push_text_fragment(blocks: &mut Vec<LayoutBlock>, html: &str, chapter_index: usize) {
    let trimmed = html.trim();
    if trimmed.is_empty() {
        return;
    }
    for line in trimmed
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
    {
        let fragment = if line.starts_with('<') {
            line.to_string()
        } else {
            format!("<p>{}</p>", escape_html(line))
        };
        blocks.push(layout_block(
            classify_html_block(&fragment),
            &fragment,
            chapter_index,
        ));
    }
}

fn layout_block(block_type: &str, html: &str, chapter_index: usize) -> LayoutBlock {
    LayoutBlock {
        block_type: block_type.to_string(),
        text: strip_html(html),
        html: html.to_string(),
        src: extract_src(html),
        chapter_index,
    }
}

fn classify_html_block(html: &str) -> &str {
    let lower = html.trim_start().to_lowercase();
    if lower.starts_with("<img") || lower.starts_with("<image") || lower.starts_with("<figure") {
        "image"
    } else if starts_with_heading(&lower) {
        "heading"
    } else if lower.starts_with("<table") {
        "table"
    } else if lower.contains("language-mermaid")
        || lower.contains("class=\"mermaid\"")
        || lower.contains("class='mermaid'")
    {
        "mermaid"
    } else if lower.contains("footnote-definition")
        || lower.starts_with("<section class=\"footnotes\"")
    {
        "footnote"
    } else if lower.starts_with("<pre") || lower.starts_with("<code") {
        "code"
    } else if lower.starts_with("<math") || lower.contains("katex") {
        "math"
    } else {
        "text"
    }
}

fn starts_with_heading(lower_html: &str) -> bool {
    ["<h1", "<h2", "<h3", "<h4", "<h5", "<h6"]
        .iter()
        .any(|prefix| lower_html.starts_with(prefix))
}

fn find_next_img(html: &str, lower: &str, cursor: usize) -> Option<(usize, usize)> {
    let pos = lower[cursor..].find("<img")? + cursor;
    let end = html[pos..].find('>').map(|idx| pos + idx + 1)?;
    Some((pos, end))
}

fn extract_src(html: &str) -> Option<String> {
    extract_attr_from_html(html, "src").or_else(|| extract_attr_from_html(html, "xlink:href"))
}

fn extract_attr_from_html(html: &str, attr: &str) -> Option<String> {
    let dq = format!("{}=\"", attr);
    let sq = format!("{}='", attr);
    if let Some(start) = html.find(&dq) {
        let value_start = start + dq.len();
        return html[value_start..]
            .find('"')
            .map(|end| html[value_start..value_start + end].to_string());
    }
    if let Some(start) = html.find(&sq) {
        let value_start = start + sq.len();
        return html[value_start..]
            .find('\'')
            .map(|end| html[value_start..value_start + end].to_string());
    }
    None
}

fn strip_html(html: &str) -> String {
    let mut text = String::new();
    let mut in_tag = false;
    for ch in html.chars() {
        match ch {
            '<' => {
                in_tag = true;
                text.push(' ');
            }
            '>' => in_tag = false,
            _ if !in_tag => text.push(ch),
            _ => {}
        }
    }
    text.replace("&nbsp;", " ")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn escape_html(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn markdown_enables_footnotes() {
        let html = markdown_to_html("Copy with a note.[^a]\n\n[^a]: Footnote copy");
        assert!(html.contains("footnote-definition"));
        assert!(html.contains("Footnote copy"));
    }

    #[test]
    fn layout_classifies_rich_markdown_blocks() {
        assert_eq!(classify_html_block("<h2>Chapter</h2>"), "heading");
        assert_eq!(
            classify_html_block(
                "<pre><code class=\"language-mermaid\">graph TD; A-->B;</code></pre>"
            ),
            "mermaid"
        );
        assert_eq!(
            classify_html_block("<div class=\"footnote-definition\"><sup>1</sup> Note</div>"),
            "footnote"
        );
    }

    #[test]
    fn trims_preview_to_line_boundary() {
        assert_eq!(trim_to_line_boundary("one\ntwo\npartial"), "one\ntwo");
        assert_eq!(trim_to_line_boundary("single line"), "single line");
    }

    #[test]
    fn cached_import_path_moves_source_under_app_data() {
        let source = std::path::Path::new("/Users/example/Downloads/My Book.epub");
        let base = std::path::Path::new("/tmp/libris-data");
        let cached = cached_import_path_for_source(source, base).expect("cache path");

        assert!(cached.starts_with(base.join("imports")));
        assert!(cached.ends_with("My Book.epub"));
        assert_ne!(cached, source);
    }

    #[test]
    fn resolve_read_path_reuses_existing_cache_without_source_access() {
        let base =
            std::env::temp_dir().join(format!("libris-reader-test-{}", uuid::Uuid::new_v4()));
        let source = Path::new("/Users/example/Downloads/Missing Book.md");
        let cached = cached_import_path_for_source(source, &base).expect("cache path");
        std::fs::create_dir_all(cached.parent().expect("cache parent"))
            .expect("create cache parent");
        std::fs::write(&cached, "# Cached").expect("write cached copy");

        let resolved =
            resolve_read_path_with_base(&source.to_string_lossy(), &base).expect("resolve cached");
        assert_eq!(resolved, cached.to_string_lossy());

        let _ = std::fs::remove_dir_all(base);
    }
}

// ─────────────────────────────────────────────
// App Entry
// ─────────────────────────────────────────────

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            get_library,
            get_library_access,
            grant_library_folder_access,
            import_book,
            import_folder,
            get_supported_formats,
            read_file_base64,
            get_epub_content,
            get_epub_meta,
            render_epub_pages,
            get_text_content,
            get_cbz_content,
            get_reading_content,
            get_text_layout_preview_blocks,
            get_text_layout_blocks,
            get_epub_layout_preview_blocks,
            get_epub_layout_blocks,
            render_text_pages,
            get_pdf_base64,
            update_progress,
            get_annotations,
            add_annotation,
            remove_annotation,
            rename_annotation,
            toggle_favorite,
            update_book_metadata,
            remove_book,
            get_settings,
            save_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
