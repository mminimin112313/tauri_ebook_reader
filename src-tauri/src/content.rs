use crate::formats;
use base64::{engine::general_purpose, Engine as _};
use pulldown_cmark::{html, Options, Parser};
use serde::{Deserialize, Serialize};
use std::io::Read;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReadingContent {
    pub kind: String,
    pub title: String,
    pub html: String,
    pub pages: Vec<ContentPage>,
    pub index: usize,
    pub total: usize,
    pub can_render: bool,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContentPage {
    pub title: String,
    pub src: String,
}

pub fn load_reading_content(path: &str, index: usize) -> Result<ReadingContent, String> {
    let info = formats::classify_path(path);
    let title = Path::new(path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Untitled")
        .to_string();

    match info.reader_kind.as_str() {
        "markdown" => markdown_content(path, title),
        "html" => html_content(path, title),
        "image" => single_image_content(path, title),
        "comic" => comic_content(path, title, &info.extension, index),
        "archive" => archive_content(path, title, &info.extension, index),
        "document" => document_content(path, title, &info.extension),
        _ => Ok(unsupported_content(title, &info.label)),
    }
}

fn markdown_content(path: &str, title: String) -> Result<ReadingContent, String> {
    let markdown = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    let parser = Parser::new_ext(&markdown, Options::all());
    let mut rendered = String::new();
    html::push_html(&mut rendered, parser);
    Ok(textual_content("markdown", title, rendered))
}

fn html_content(path: &str, title: String) -> Result<ReadingContent, String> {
    let raw = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    let body = extract_body(&raw);
    Ok(textual_content("html", title, body))
}

fn document_content(path: &str, title: String, extension: &str) -> Result<ReadingContent, String> {
    let html = match extension {
        "txt" => paragraphs(&std::fs::read_to_string(path).map_err(|e| e.to_string())?),
        "rtf" => paragraphs(&strip_rtf(&std::fs::read_to_string(path).map_err(|e| e.to_string())?)),
        "docx" => paragraphs(&read_zip_text_member(path, "word/document.xml")?),
        "odt" => paragraphs(&read_zip_text_member(path, "content.xml")?),
        "fb2" => paragraphs(&strip_xml(&std::fs::read_to_string(path).map_err(|e| e.to_string())?)),
        "mht" | "mhtml" => paragraphs(&std::fs::read_to_string(path).map_err(|e| e.to_string())?),
        _ => return Ok(unsupported_content(title, &extension.to_uppercase())),
    };
    Ok(textual_content("document", title, html))
}

fn single_image_content(path: &str, title: String) -> Result<ReadingContent, String> {
    let src = file_data_url(path)?;
    Ok(ReadingContent {
        kind: "image".to_string(),
        title: title.clone(),
        html: String::new(),
        pages: vec![ContentPage { title, src }],
        index: 0,
        total: 1,
        can_render: true,
        message: String::new(),
    })
}

fn comic_content(path: &str, title: String, extension: &str, index: usize) -> Result<ReadingContent, String> {
    let pages = if extension == "cbz" {
        image_pages_from_zip(path)?
    } else {
        image_pages_from_rar(path)?
    };
    let total = pages.len().max(1);
    Ok(ReadingContent {
        kind: "comic".to_string(),
        title,
        html: String::new(),
        pages,
        index: index.min(total.saturating_sub(1)),
        total,
        can_render: total > 0,
        message: String::new(),
    })
}

fn archive_content(path: &str, title: String, extension: &str, index: usize) -> Result<ReadingContent, String> {
    let pages = if extension == "zip" {
        image_pages_from_zip(path)?
    } else {
        image_pages_from_rar(path)?
    };
    if pages.is_empty() {
        let names = if extension == "zip" {
            archive_names_from_zip(path)?
        } else {
            archive_names_from_rar(path)?
        };
        let html = format!(
            "<h1>{}</h1><p>This archive was added to the library. Image entries will open as pages; current entries:</p><ul>{}</ul>",
            escape_html(&title),
            names.into_iter().map(|name| format!("<li>{}</li>", escape_html(&name))).collect::<Vec<_>>().join("")
        );
        return Ok(textual_content("archive", title, html));
    }
    let total = pages.len();
    Ok(ReadingContent {
        kind: "archive".to_string(),
        title,
        html: String::new(),
        pages,
        index: index.min(total.saturating_sub(1)),
        total,
        can_render: true,
        message: String::new(),
    })
}

fn textual_content(kind: &str, title: String, html: String) -> ReadingContent {
    ReadingContent {
        kind: kind.to_string(),
        title,
        html,
        pages: Vec::new(),
        index: 0,
        total: 1,
        can_render: true,
        message: String::new(),
    }
}

fn unsupported_content(title: String, label: &str) -> ReadingContent {
    ReadingContent {
        kind: "unsupported".to_string(),
        title,
        html: String::new(),
        pages: Vec::new(),
        index: 0,
        total: 1,
        can_render: false,
        message: format!("{label} import is supported, but a rendering engine is not connected yet."),
    }
}

fn image_pages_from_zip(path: &str) -> Result<Vec<ContentPage>, String> {
    let file = std::fs::File::open(path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
    let mut names = Vec::new();
    for i in 0..archive.len() {
        let file = archive.by_index(i).map_err(|e| e.to_string())?;
        let name = file.name().to_string();
        if formats::is_image_file(&name) {
            names.push(name);
        }
    }
    names.sort_by_key(|name| natural_key(name));
    let mut pages = Vec::new();
    for name in names {
        let mut file = archive.by_name(&name).map_err(|e| e.to_string())?;
        let mut bytes = Vec::new();
        file.read_to_end(&mut bytes).map_err(|e| e.to_string())?;
        pages.push(ContentPage {
            title: name.clone(),
            src: data_url(&name, &bytes),
        });
    }
    Ok(pages)
}

fn image_pages_from_rar(path: &str) -> Result<Vec<ContentPage>, String> {
    let names = archive_names_from_rar(path)?
        .into_iter()
        .filter(|name| formats::is_image_file(name))
        .collect::<Vec<_>>();
    let mut pages = Vec::new();
    for name in names {
        if let Some(bytes) = read_rar_member(path, &name)? {
            pages.push(ContentPage {
                title: name.clone(),
                src: data_url(&name, &bytes),
            });
        }
    }
    pages.sort_by_key(|page| natural_key(&page.title));
    Ok(pages)
}

fn archive_names_from_zip(path: &str) -> Result<Vec<String>, String> {
    let file = std::fs::File::open(path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
    let mut names = Vec::new();
    for i in 0..archive.len() {
        let file = archive.by_index(i).map_err(|e| e.to_string())?;
        if !file.is_dir() {
            names.push(file.name().to_string());
        }
    }
    names.sort_by_key(|name| natural_key(name));
    Ok(names)
}

fn archive_names_from_rar(path: &str) -> Result<Vec<String>, String> {
    let mut names = Vec::new();
    let archive = unrar::Archive::new(path).open_for_listing().map_err(|e| e.to_string())?;
    for entry in archive {
        let entry = entry.map_err(|e| e.to_string())?;
        names.push(entry.filename.to_string_lossy().to_string());
    }
    names.sort_by_key(|name| natural_key(name));
    Ok(names)
}

fn read_rar_member(path: &str, target: &str) -> Result<Option<Vec<u8>>, String> {
    let mut archive = unrar::Archive::new(path).open_for_processing().map_err(|e| e.to_string())?;
    while let Some(header) = archive.read_header().map_err(|e| e.to_string())? {
        let name = header.entry().filename.to_string_lossy().to_string();
        archive = if name == target {
            let (data, rest) = header.read().map_err(|e| e.to_string())?;
            drop(rest);
            return Ok(Some(data));
        } else {
            header.skip().map_err(|e| e.to_string())?
        };
    }
    Ok(None)
}

fn read_zip_text_member(path: &str, member: &str) -> Result<String, String> {
    let file = std::fs::File::open(path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
    let mut file = archive.by_name(member).map_err(|e| e.to_string())?;
    let mut xml = String::new();
    file.read_to_string(&mut xml).map_err(|e| e.to_string())?;
    Ok(strip_xml(&xml))
}

fn file_data_url(path: &str) -> Result<String, String> {
    let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
    Ok(data_url(path, &bytes))
}

fn data_url(path: &str, bytes: &[u8]) -> String {
    let mime = mime_guess::from_path(path).first_or_octet_stream();
    format!("data:{};base64,{}", mime, general_purpose::STANDARD.encode(bytes))
}

fn paragraphs(text: &str) -> String {
    text.split('\n')
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(|line| format!("<p>{}</p>", escape_html(line)))
        .collect::<Vec<_>>()
        .join("")
}

fn extract_body(html: &str) -> String {
    let lower = html.to_lowercase();
    if let Some(body_start) = lower.find("<body") {
        if let Some(content_start) = html[body_start..].find('>') {
            let content_start = body_start + content_start + 1;
            if let Some(body_end) = lower.rfind("</body>") {
                return html[content_start..body_end].to_string();
            }
        }
    }
    html.to_string()
}

fn strip_xml(xml: &str) -> String {
    let mut text = String::new();
    let mut in_tag = false;
    for ch in xml.chars() {
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
    decode_entities(&text)
}

fn strip_rtf(rtf: &str) -> String {
    let mut out = String::new();
    let mut skip_control = false;
    for ch in rtf.chars() {
        match ch {
            '\\' => skip_control = true,
            '{' | '}' => skip_control = false,
            ' ' | '\n' | '\r' if skip_control => skip_control = false,
            _ if !skip_control => out.push(ch),
            _ => {}
        }
    }
    out
}

fn decode_entities(text: &str) -> String {
    text.replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
        .replace('\u{a0}', " ")
}

fn escape_html(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

fn natural_key(input: &str) -> String {
    let mut key = String::new();
    let mut digits = String::new();
    for ch in input.chars() {
        if ch.is_ascii_digit() {
            digits.push(ch);
        } else {
            if !digits.is_empty() {
                key.push_str(&format!("{:0>12}", digits));
                digits.clear();
            }
            key.push(ch.to_ascii_lowercase());
        }
    }
    if !digits.is_empty() {
        key.push_str(&format!("{:0>12}", digits));
    }
    key
}
