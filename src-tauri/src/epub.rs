use base64::{engine::general_purpose, Engine as _};
use serde::{Deserialize, Serialize};
use std::io::Read;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TocEntry {
    pub title: String,
    pub id: String,
    pub play_order: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EpubMeta {
    pub title: String,
    pub author: String,
    pub description: String,
    pub cover_base64: Option<String>,
    pub toc: Vec<TocEntry>,
    pub spine: Vec<String>, // ordered list of content item IDs
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpineContent {
    pub html: String,
    pub index: usize,
    pub total: usize,
}

pub fn parse_epub_meta(path: &str) -> Result<EpubMeta, String> {
    let file = std::fs::File::open(path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;

    // Find container.xml to locate the OPF file
    let opf_path = {
        let mut container = archive
            .by_name("META-INF/container.xml")
            .map_err(|_| "No META-INF/container.xml found".to_string())?;
        let mut content = String::new();
        container
            .read_to_string(&mut content)
            .map_err(|e| e.to_string())?;
        extract_opf_path(&content)?
    };

    let opf_dir = Path::new(&opf_path)
        .parent()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();

    // Parse OPF
    let opf_content = {
        let mut opf_file = archive.by_name(&opf_path).map_err(|e| e.to_string())?;
        let mut content = String::new();
        opf_file
            .read_to_string(&mut content)
            .map_err(|e| e.to_string())?;
        content
    };

    let meta = parse_opf(&opf_content, &opf_dir, &mut archive)?;
    Ok(meta)
}

fn extract_opf_path(container_xml: &str) -> Result<String, String> {
    // Find rootfile full-path attribute
    for line in container_xml.lines() {
        let line = line.trim();
        if line.contains("rootfile") && line.contains("full-path") {
            if let Some(start) = line.find("full-path=\"") {
                let after = &line[start + 11..];
                if let Some(end) = after.find('"') {
                    return Ok(after[..end].to_string());
                }
            }
        }
    }
    Err("Could not find OPF path in container.xml".to_string())
}

fn parse_opf(
    opf: &str,
    opf_dir: &str,
    archive: &mut zip::ZipArchive<std::fs::File>,
) -> Result<EpubMeta, String> {
    let mut title = String::from("Unknown Title");
    let mut author = String::from("Unknown Author");
    let mut description = String::new();
    let mut cover_id = String::new();
    let mut items: std::collections::HashMap<String, (String, String)> =
        std::collections::HashMap::new(); // id -> (href, media-type)
    let mut spine: Vec<String> = Vec::new();
    let mut ncx_id = String::new();

    // Parse line by line for title/author (simple approach)
    let mut in_metadata = false;
    for line in opf.lines() {
        let line = line.trim();
        if line.contains("<metadata") {
            in_metadata = true;
        }
        if line.contains("</metadata>") {
            in_metadata = false;
        }

        if in_metadata {
            if line.contains("dc:title") {
                if let Some(t) = extract_inner_text(line, "dc:title") {
                    title = t;
                }
            }
            if line.contains("dc:creator") {
                if let Some(a) = extract_inner_text(line, "dc:creator") {
                    author = a;
                }
            }
            if line.contains("dc:description") {
                if let Some(d) = extract_inner_text(line, "dc:description") {
                    description = d;
                }
            }
            // Cover meta
            if line.contains("name=\"cover\"") || line.contains("name='cover'") {
                cover_id = extract_attr(line, "content").unwrap_or_default();
            }
        }

        // Parse manifest items
        if line.contains("<item ") && line.contains("id=") && line.contains("href=") {
            let id = extract_attr(line, "id").unwrap_or_default();
            let href = extract_attr(line, "href").unwrap_or_default();
            let media_type = extract_attr(line, "media-type").unwrap_or_default();

            if media_type.contains("dtbncx") || href.ends_with(".ncx") {
                ncx_id = id.clone();
            }
            if line.contains("properties=\"cover-image\"")
                || line.contains("properties='cover-image'")
            {
                cover_id = id.clone();
            }
            items.insert(id, (href, media_type));
        }

        // Parse spine
        if line.contains("<itemref ") {
            if let Some(idref) = extract_attr(line, "idref") {
                spine.push(idref);
            }
        }

        // NCX via spine toc attribute
        if line.contains("<spine") {
            if let Some(toc_attr) = extract_attr(line, "toc") {
                if ncx_id.is_empty() {
                    ncx_id = toc_attr;
                }
            }
        }
    }

    // Load cover image
    let cover_base64 = if !cover_id.is_empty() {
        if let Some((href, media_type)) = items.get(&cover_id) {
            let full_path = if opf_dir.is_empty() {
                href.clone()
            } else {
                format!("{}/{}", opf_dir, href)
            };
            // URL decode the path
            let full_path = full_path.replace("%20", " ");
            if let Ok(mut img_file) = archive.by_name(&full_path) {
                let mut bytes = Vec::new();
                if img_file.read_to_end(&mut bytes).is_ok() {
                    let encoded = general_purpose::STANDARD.encode(&bytes);
                    Some(format!("data:{};base64,{}", media_type, encoded))
                } else {
                    None
                }
            } else {
                None
            }
        } else {
            None
        }
    } else {
        None
    };

    // Parse TOC from NCX
    let toc = if !ncx_id.is_empty() {
        if let Some((ncx_href, _)) = items.get(&ncx_id) {
            let full_ncx = if opf_dir.is_empty() {
                ncx_href.clone()
            } else {
                format!("{}/{}", opf_dir, ncx_href)
            };
            if let Ok(mut ncx_file) = archive.by_name(&full_ncx) {
                let mut ncx_content = String::new();
                let _ = ncx_file.read_to_string(&mut ncx_content);
                parse_ncx(&ncx_content)
            } else {
                Vec::new()
            }
        } else {
            Vec::new()
        }
    } else {
        // Build TOC from spine
        spine
            .iter()
            .enumerate()
            .map(|(i, idref)| TocEntry {
                title: format!("Chapter {}", i + 1),
                id: idref.clone(),
                play_order: i as u32 + 1,
            })
            .collect()
    };

    Ok(EpubMeta {
        title,
        author,
        description,
        cover_base64,
        toc,
        spine,
    })
}

fn parse_ncx(ncx: &str) -> Vec<TocEntry> {
    let mut entries = Vec::new();
    let mut in_nav_point = false;
    let mut current_title = String::new();
    let mut current_id = String::new();
    let mut current_order: u32 = 0;

    for line in ncx.lines() {
        let line = line.trim();
        if line.contains("<navPoint") {
            in_nav_point = true;
            current_id = extract_attr(line, "id").unwrap_or_default();
            current_order = extract_attr(line, "playOrder")
                .and_then(|s| s.parse().ok())
                .unwrap_or(0);
        }
        if in_nav_point {
            if line.contains("<text>") && line.contains("</text>") {
                if let Some(t) = extract_inner_text(line, "text") {
                    current_title = t;
                }
            }
            if line.contains("</navPoint>") && !current_title.is_empty() {
                entries.push(TocEntry {
                    title: current_title.clone(),
                    id: current_id.clone(),
                    play_order: current_order,
                });
                in_nav_point = false;
                current_title.clear();
                current_id.clear();
                current_order = 0;
            }
        }
    }

    entries.sort_by_key(|e| e.play_order);
    entries
}

pub fn get_spine_content(path: &str, spine_index: usize) -> Result<SpineContent, String> {
    let file = std::fs::File::open(path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;

    let opf_path = {
        let mut container = archive
            .by_name("META-INF/container.xml")
            .map_err(|_| "No container.xml".to_string())?;
        let mut content = String::new();
        container
            .read_to_string(&mut content)
            .map_err(|e| e.to_string())?;
        extract_opf_path(&content)?
    };

    let opf_dir = Path::new(&opf_path)
        .parent()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();

    let opf_content = {
        let mut opf_file = archive.by_name(&opf_path).map_err(|e| e.to_string())?;
        let mut content = String::new();
        opf_file
            .read_to_string(&mut content)
            .map_err(|e| e.to_string())?;
        content
    };

    // Build item map and spine list
    let mut items: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    let mut spine: Vec<String> = Vec::new();

    for line in opf_content.lines() {
        let line = line.trim();
        if line.contains("<item ") && line.contains("id=") && line.contains("href=") {
            let id = extract_attr(line, "id").unwrap_or_default();
            let href = extract_attr(line, "href").unwrap_or_default();
            items.insert(id, href);
        }
        if line.contains("<itemref ") {
            if let Some(idref) = extract_attr(line, "idref") {
                spine.push(idref);
            }
        }
    }

    let total = spine.len();
    let idx = spine_index.min(total.saturating_sub(1));

    let item_id = spine
        .get(idx)
        .ok_or("Spine index out of range".to_string())?;
    let href = items
        .get(item_id)
        .ok_or("Item not found in manifest".to_string())?;

    let full_path = if opf_dir.is_empty() {
        href.clone()
    } else {
        format!("{}/{}", opf_dir, href)
    };
    let full_path = full_path.replace("%20", " ");

    let html_content = {
        let mut html_file = archive.by_name(&full_path).map_err(|e| e.to_string())?;
        let mut content = String::new();
        html_file
            .read_to_string(&mut content)
            .map_err(|e| e.to_string())?;
        content
    };

    // Extract just the body content, rewriting img src to base64
    let body_content = extract_body(&html_content);
    let body_with_images = rewrite_images(body_content, &opf_dir, &full_path, &mut archive);

    Ok(SpineContent {
        html: body_with_images,
        index: idx,
        total,
    })
}

fn extract_body(html: &str) -> String {
    // Try to extract <body> content
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

fn rewrite_images(
    html: String,
    _opf_dir: &str,
    content_path: &str,
    archive: &mut zip::ZipArchive<std::fs::File>,
) -> String {
    // Simple image rewriting - replace src attributes with base64
    let content_dir = Path::new(content_path)
        .parent()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();

    let mut result = html;
    let mut search_start = 0;

    loop {
        let lower = result.to_lowercase();
        // Find img src or image xlink:href
        let img_pos = lower[search_start..]
            .find(" src=\"")
            .or_else(|| lower[search_start..].find(" src='"));

        if let Some(pos) = img_pos {
            let abs_pos = search_start + pos + 6; // skip " src=\""
            let quote_char = if result.chars().nth(search_start + pos + 5) == Some('\'') {
                '\''
            } else {
                '"'
            };
            if let Some(end_pos) = result[abs_pos..].find(quote_char) {
                let src = result[abs_pos..abs_pos + end_pos].to_string();
                if !src.starts_with("data:") && !src.starts_with("http") {
                    // Resolve relative path
                    let img_path = if src.starts_with('/') {
                        src.trim_start_matches('/').to_string()
                    } else {
                        format!("{}/{}", content_dir, src)
                    };

                    // Normalize path (remove ../)
                    let normalized = normalize_path(&img_path);

                    if let Ok(mut img_file) = archive.by_name(&normalized) {
                        let mut bytes = Vec::new();
                        if img_file.read_to_end(&mut bytes).is_ok() {
                            let mime = if normalized.ends_with(".png") {
                                "image/png"
                            } else if normalized.ends_with(".jpg") || normalized.ends_with(".jpeg")
                            {
                                "image/jpeg"
                            } else if normalized.ends_with(".gif") {
                                "image/gif"
                            } else if normalized.ends_with(".svg") {
                                "image/svg+xml"
                            } else if normalized.ends_with(".webp") {
                                "image/webp"
                            } else {
                                "image/png"
                            };
                            let b64 = general_purpose::STANDARD.encode(&bytes);
                            let data_url = format!("data:{};base64,{}", mime, b64);
                            result = format!(
                                "{}{}{}{}",
                                &result[..abs_pos],
                                data_url,
                                quote_char,
                                &result[abs_pos + end_pos + 1..]
                            );
                            search_start = abs_pos + data_url.len() + 1;
                            continue;
                        }
                    }
                }
                search_start = abs_pos + end_pos + 1;
            } else {
                break;
            }
        } else {
            break;
        }
    }

    result
}

fn normalize_path(path: &str) -> String {
    let mut parts: Vec<&str> = Vec::new();
    for part in path.split('/') {
        match part {
            ".." => {
                parts.pop();
            }
            "." | "" => {}
            other => parts.push(other),
        }
    }
    parts.join("/")
}

fn extract_attr(line: &str, attr: &str) -> Option<String> {
    let search_dq = format!("{}=\"", attr);
    let search_sq = format!("{}='", attr);

    if let Some(pos) = line.find(&search_dq) {
        let start = pos + search_dq.len();
        if let Some(end) = line[start..].find('"') {
            return Some(line[start..start + end].to_string());
        }
    }
    if let Some(pos) = line.find(&search_sq) {
        let start = pos + search_sq.len();
        if let Some(end) = line[start..].find('\'') {
            return Some(line[start..start + end].to_string());
        }
    }
    None
}

fn extract_inner_text(line: &str, tag: &str) -> Option<String> {
    let open = format!("<{}", tag);
    let close = format!("</{}>", tag);

    if let Some(open_pos) = line.find(&open) {
        // Find end of opening tag
        if let Some(gt_pos) = line[open_pos..].find('>') {
            let content_start = open_pos + gt_pos + 1;
            if let Some(close_pos) = line.find(&close) {
                if close_pos >= content_start {
                    let text = &line[content_start..close_pos];
                    // Remove any CDATA wrappers
                    let text = text.trim();
                    let text = if text.starts_with("<![CDATA[") {
                        &text[9..text.len() - 3]
                    } else {
                        text
                    };
                    return Some(text.trim().to_string());
                }
            }
        }
    }
    None
}
