use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PageRenderOptions {
    pub viewport_width: u32,
    pub viewport_height: u32,
    pub font_size: u32,
    pub line_height: f32,
    pub columns: u32,
    pub margin_width: u32,
}

#[derive(Debug, Clone, Serialize)]
pub struct TextPage {
    pub title: String,
    pub html: String,
    pub chapter_index: usize,
    pub local_index: usize,
    pub global_index: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct PaginatedContent {
    pub kind: String,
    pub title: String,
    pub pages: Vec<TextPage>,
    pub index: usize,
    pub total: usize,
    pub can_render: bool,
    pub message: String,
}

pub fn paginate_html(
    kind: &str,
    title: &str,
    html: &str,
    options: &PageRenderOptions,
) -> PaginatedContent {
    let pages = paginate_chapter_html(title, html, 0, 0, options);
    paginated_content(kind, title, pages, String::new())
}

pub fn paginate_epub_chapters(
    title: &str,
    chapters: Vec<(usize, String, String)>,
    options: &PageRenderOptions,
) -> PaginatedContent {
    let mut pages = Vec::new();
    for (chapter_index, chapter_title, html) in chapters {
        let page_start = pages.len();
        pages.extend(paginate_chapter_html(
            &chapter_title,
            &html,
            chapter_index,
            page_start,
            options,
        ));
    }
    paginated_content("epub", title, pages, String::new())
}

fn paginated_content(
    kind: &str,
    title: &str,
    pages: Vec<TextPage>,
    message: String,
) -> PaginatedContent {
    let total = pages.len().max(1);
    PaginatedContent {
        kind: kind.to_string(),
        title: title.to_string(),
        pages,
        index: 0,
        total,
        can_render: total > 0,
        message,
    }
}

fn paginate_chapter_html(
    title: &str,
    html: &str,
    chapter_index: usize,
    global_start: usize,
    options: &PageRenderOptions,
) -> Vec<TextPage> {
    let capacity = estimate_page_capacity(options);
    let blocks = html_blocks(html);
    let mut pages = Vec::new();
    let mut current = String::new();
    let mut used = 0usize;

    for block in blocks {
        let weight = estimate_block_weight(&block);
        if !current.is_empty() && used + weight > capacity {
            push_page(&mut pages, title, chapter_index, global_start, &mut current);
            used = 0;
        }

        if weight > capacity {
            for chunk in split_large_block(&block, capacity) {
                if !current.is_empty() {
                    push_page(&mut pages, title, chapter_index, global_start, &mut current);
                    used = 0;
                }
                current.push_str(&chunk);
                push_page(&mut pages, title, chapter_index, global_start, &mut current);
            }
        } else {
            current.push_str(&block);
            used += weight;
        }
    }

    if !current.trim().is_empty() || pages.is_empty() {
        push_page(&mut pages, title, chapter_index, global_start, &mut current);
    }

    pages
}

fn push_page(
    pages: &mut Vec<TextPage>,
    title: &str,
    chapter_index: usize,
    global_start: usize,
    current: &mut String,
) {
    let local_index = pages.len();
    pages.push(TextPage {
        title: if title.is_empty() {
            format!("Page {}", global_start + local_index + 1)
        } else {
            title.to_string()
        },
        html: current.trim().to_string(),
        chapter_index,
        local_index,
        global_index: global_start + local_index,
    });
    current.clear();
}

fn estimate_page_capacity(options: &PageRenderOptions) -> usize {
    let max_width = match options.margin_width.clamp(1, 5) {
        1 => 800.0,
        2 => 720.0,
        3 => 640.0,
        4 => 560.0,
        _ => 480.0,
    };
    let horizontal_padding = 80.0;
    let vertical_padding = 172.0;
    let width = ((options.viewport_width as f32 - horizontal_padding).max(240.0)).min(max_width);
    let height = (options.viewport_height as f32 - vertical_padding).max(260.0);
    let font_size = options.font_size.clamp(12, 36) as f32;
    let line_height = options.line_height.clamp(1.2, 2.6);
    let columns = options.columns.clamp(1, 2) as f32;

    let chars_per_line = (width / (font_size * 0.54)).floor().max(18.0);
    let lines_per_page = (height / (font_size * line_height)).floor().max(8.0);
    (chars_per_line * lines_per_page * columns * 0.92)
        .floor()
        .max(160.0) as usize
}

fn html_blocks(html: &str) -> Vec<String> {
    let mut blocks = Vec::new();
    let mut start = 0usize;
    let lower = html.to_lowercase();
    let closers = [
        "</p>",
        "</h1>",
        "</h2>",
        "</h3>",
        "</h4>",
        "</h5>",
        "</h6>",
        "</li>",
        "</blockquote>",
        "</pre>",
        "</table>",
        "</div>",
    ];

    let mut cursor = 0usize;
    while cursor < html.len() {
        let next = closers
            .iter()
            .filter_map(|closer| {
                lower[cursor..]
                    .find(closer)
                    .map(|pos| (cursor + pos + closer.len(), *closer))
            })
            .min_by_key(|(pos, _)| *pos);

        if let Some((end, _)) = next {
            if end > start {
                let block = html[start..end].trim();
                if !block.is_empty() {
                    blocks.push(block.to_string());
                }
            }
            start = end;
            cursor = end;
        } else {
            break;
        }
    }

    let rest = html[start..].trim();
    if !rest.is_empty() {
        if blocks.is_empty() {
            blocks.extend(
                rest.lines()
                    .map(str::trim)
                    .filter(|line| !line.is_empty())
                    .map(|line| {
                        if line.starts_with('<') {
                            line.to_string()
                        } else {
                            format!("<p>{}</p>", escape_html(line))
                        }
                    }),
            );
        } else {
            blocks.push(rest.to_string());
        }
    }

    if blocks.is_empty() {
        blocks.push(String::new());
    }
    blocks
}

fn split_large_block(block: &str, capacity: usize) -> Vec<String> {
    let text = decode_entities(&strip_tags(block));
    if text.trim().is_empty() {
        return vec![block.to_string()];
    }

    let chunk_size = capacity.saturating_sub(40).max(120);
    let mut chunks = Vec::new();
    let mut current = String::new();
    for word in text.split_whitespace() {
        if !current.is_empty() && current.chars().count() + word.chars().count() + 1 > chunk_size {
            chunks.push(format!("<p>{}</p>", escape_html(current.trim())));
            current.clear();
        }
        if !current.is_empty() {
            current.push(' ');
        }
        current.push_str(word);
    }
    if !current.trim().is_empty() {
        chunks.push(format!("<p>{}</p>", escape_html(current.trim())));
    }
    chunks
}

fn estimate_block_weight(block: &str) -> usize {
    let text = decode_entities(&strip_tags(block));
    let mut weight = text.chars().map(char_weight).sum::<usize>();
    let lower = block.to_lowercase();
    if lower.contains("<h1") {
        weight += 90;
    } else if lower.contains("<h2") || lower.contains("<h3") {
        weight += 60;
    } else if lower.contains("<blockquote") || lower.contains("<pre") || lower.contains("<table") {
        weight = ((weight as f32) * 1.25) as usize + 60;
    } else {
        weight += 22;
    }
    weight.max(24)
}

fn char_weight(ch: char) -> usize {
    if ch.is_ascii() {
        1
    } else if ('\u{ac00}'..='\u{d7af}').contains(&ch)
        || ('\u{3040}'..='\u{30ff}').contains(&ch)
        || ('\u{4e00}'..='\u{9fff}').contains(&ch)
    {
        2
    } else {
        1
    }
}

fn strip_tags(html: &str) -> String {
    let mut out = String::new();
    let mut in_tag = false;
    for ch in html.chars() {
        match ch {
            '<' => {
                in_tag = true;
                out.push(' ');
            }
            '>' => in_tag = false,
            _ if !in_tag => out.push(ch),
            _ => {}
        }
    }
    out
}

fn decode_entities(text: &str) -> String {
    text.replace("&nbsp;", " ")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
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

    fn options() -> PageRenderOptions {
        PageRenderOptions {
            viewport_width: 900,
            viewport_height: 700,
            font_size: 20,
            line_height: 1.6,
            columns: 1,
            margin_width: 3,
        }
    }

    #[test]
    fn paginates_long_html_into_ordered_pages() {
        let html = (0..120)
            .map(|i| {
                format!(
                    "<p>Paragraph {i} has enough words to take up measurable reading space.</p>"
                )
            })
            .collect::<Vec<_>>()
            .join("");

        let rendered = paginate_html("document", "Long", &html, &options());

        assert!(rendered.pages.len() > 1);
        assert_eq!(rendered.pages[0].global_index, 0);
        assert_eq!(rendered.pages[1].global_index, 1);
        assert!(rendered
            .pages
            .iter()
            .all(|page| !page.html.trim().is_empty()));
    }

    #[test]
    fn preserves_epub_chapter_ownership_across_pages() {
        let chapters = vec![
            (
                0,
                "One".to_string(),
                "<p>short first chapter</p>".to_string(),
            ),
            (
                1,
                "Two".to_string(),
                "<p>short second chapter</p>".to_string(),
            ),
        ];

        let rendered = paginate_epub_chapters("Book", chapters, &options());

        assert_eq!(rendered.pages[0].chapter_index, 0);
        assert!(rendered.pages.iter().any(|page| page.chapter_index == 1));
    }
}
