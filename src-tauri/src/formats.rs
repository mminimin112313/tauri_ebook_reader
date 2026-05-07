use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FormatInfo {
    pub extension: String,
    pub label: String,
    pub category: String,
    pub reader_kind: String,
    pub can_render: bool,
}

const FORMATS: &[(&str, &str, &str, &str, bool)] = &[
    ("epub", "EPUB", "전자책/문서", "epub", true),
    ("pdf", "PDF", "전자책/문서", "document", false),
    ("djvu", "DJVU", "전자책/문서", "document", false),
    ("azw", "AZW", "전자책/문서", "document", false),
    ("azw3", "AZW3", "전자책/문서", "document", false),
    ("mobi", "MOBI", "전자책/문서", "document", false),
    ("fb2", "FB2", "전자책/문서", "document", true),
    ("prc", "PRC", "전자책/문서", "document", false),
    ("chm", "CHM", "전자책/문서", "document", false),
    ("umd", "UMD", "전자책/문서", "document", false),
    ("docx", "DOCX", "전자책/문서", "document", true),
    ("odt", "ODT", "전자책/문서", "document", true),
    ("rtf", "RTF", "전자책/문서", "document", true),
    ("txt", "TXT", "전자책/문서", "document", true),
    ("html", "HTML", "전자책/문서", "html", true),
    ("htm", "HTML", "전자책/문서", "html", true),
    ("mht", "MHT", "전자책/문서", "html", true),
    ("mhtml", "MHTML", "전자책/문서", "html", true),
    ("md", "Markdown", "전자책/문서", "markdown", true),
    ("markdown", "Markdown", "전자책/문서", "markdown", true),
    ("cbz", "CBZ", "만화/이미지", "comic", true),
    ("cbr", "CBR", "만화/이미지", "comic", true),
    ("webp", "WEBP", "만화/이미지", "image", true),
    ("zip", "ZIP", "압축 파일", "archive", true),
    ("rar", "RAR", "압축 파일", "archive", true),
];

pub fn supported_formats() -> Vec<FormatInfo> {
    FORMATS
        .iter()
        .map(
            |(extension, label, category, reader_kind, can_render)| FormatInfo {
                extension: (*extension).to_string(),
                label: (*label).to_string(),
                category: (*category).to_string(),
                reader_kind: (*reader_kind).to_string(),
                can_render: *can_render,
            },
        )
        .collect()
}

pub fn classify_path(path: &str) -> FormatInfo {
    let ext = Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or_default()
        .to_lowercase();

    supported_formats()
        .into_iter()
        .find(|format| format.extension == ext)
        .unwrap_or(FormatInfo {
            extension: ext.clone(),
            label: ext.to_uppercase(),
            category: "Unknown".to_string(),
            reader_kind: "unknown".to_string(),
            can_render: false,
        })
}

pub fn is_image_file(path: &str) -> bool {
    matches!(
        extension(path).as_str(),
        "jpg" | "jpeg" | "png" | "gif" | "webp" | "bmp" | "avif" | "svg"
    )
}

pub fn extension(path: &str) -> String {
    Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or_default()
        .to_lowercase()
}
