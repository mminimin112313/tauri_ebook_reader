use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReaderAnnotation {
    pub id: String,
    pub book_id: String,
    pub kind: String,
    pub page_index: usize,
    pub page_count: usize,
    pub spine_index: usize,
    pub progress: f32,
    pub quote: String,
    pub note: String,
    pub color: String,
    pub created_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnnotationInput {
    pub book_id: String,
    pub kind: String,
    pub page_index: usize,
    pub page_count: usize,
    pub spine_index: usize,
    pub progress: f32,
    pub quote: String,
    pub note: String,
    pub color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AnnotationStore {
    pub items: Vec<ReaderAnnotation>,
}

impl AnnotationStore {
    pub fn load() -> Self {
        Self::load_from_path(Path::new(&annotations_path()))
    }

    fn load_from_path(path: &Path) -> Self {
        if let Ok(content) = std::fs::read_to_string(path) {
            serde_json::from_str(&content).unwrap_or_default()
        } else {
            AnnotationStore::default()
        }
    }

    fn save(&self) {
        let path = annotations_path();
        if let Some(parent) = Path::new(&path).parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if let Ok(json) = serde_json::to_string_pretty(self) {
            let _ = std::fs::write(path, json);
        }
    }

    pub fn by_book(&self, book_id: &str) -> Vec<ReaderAnnotation> {
        let mut items: Vec<_> = self
            .items
            .iter()
            .filter(|item| item.book_id == book_id)
            .cloned()
            .collect();
        items.sort_by(|a, b| {
            a.page_index
                .cmp(&b.page_index)
                .then(a.created_at.cmp(&b.created_at))
        });
        items
    }

    pub fn add(&mut self, input: AnnotationInput) -> Result<ReaderAnnotation, String> {
        let annotation = self.add_without_saving(input)?;
        self.save();
        Ok(annotation)
    }

    fn add_without_saving(&mut self, input: AnnotationInput) -> Result<ReaderAnnotation, String> {
        validate_annotation_input(&input)?;
        let annotation = ReaderAnnotation {
            id: uuid::Uuid::new_v4().to_string(),
            book_id: input.book_id,
            kind: input.kind,
            page_index: input.page_index,
            page_count: input.page_count.max(1),
            spine_index: input.spine_index,
            progress: input.progress.clamp(0.0, 1.0),
            quote: input.quote.trim().to_string(),
            note: input.note.trim().to_string(),
            color: normalize_color(&input.color),
            created_at: crate::library::current_timestamp(),
        };
        self.items.push(annotation.clone());
        Ok(annotation)
    }

    pub fn remove(&mut self, annotation_id: &str) -> bool {
        let before = self.items.len();
        self.items.retain(|item| item.id != annotation_id);
        let removed = self.items.len() != before;
        if removed {
            self.save();
        }
        removed
    }

    pub fn rename(
        &mut self,
        annotation_id: &str,
        note: String,
    ) -> Result<ReaderAnnotation, String> {
        let annotation = self.rename_without_saving(annotation_id, &note)?;
        self.save();
        Ok(annotation)
    }

    fn rename_without_saving(
        &mut self,
        annotation_id: &str,
        note: &str,
    ) -> Result<ReaderAnnotation, String> {
        let clean_note = note.trim();
        if clean_note.len() > 160 {
            return Err("Bookmark name is too long.".to_string());
        }
        let annotation = self
            .items
            .iter_mut()
            .find(|item| item.id == annotation_id)
            .ok_or_else(|| "Annotation not found.".to_string())?;
        if annotation.kind != "bookmark" {
            return Err("Only bookmarks can be renamed.".to_string());
        }
        annotation.note = clean_note.to_string();
        Ok(annotation.clone())
    }
}

fn validate_annotation_input(input: &AnnotationInput) -> Result<(), String> {
    if input.book_id.trim().is_empty() {
        return Err("Book id is required.".to_string());
    }
    if !matches!(input.kind.as_str(), "bookmark" | "highlight") {
        return Err("Annotation kind must be bookmark or highlight.".to_string());
    }
    if input.kind == "highlight" && input.quote.trim().is_empty() && input.note.trim().is_empty() {
        return Err("Highlight requires selected text or a note.".to_string());
    }
    Ok(())
}

fn normalize_color(color: &str) -> String {
    match color {
        "green" | "blue" | "pink" => color.to_string(),
        _ => "yellow".to_string(),
    }
}

fn annotations_path() -> String {
    dirs::data_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("libris-reader")
        .join("annotations.json")
        .to_string_lossy()
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::{AnnotationInput, AnnotationStore};

    fn input(kind: &str, book_id: &str, page_index: usize) -> AnnotationInput {
        AnnotationInput {
            book_id: book_id.to_string(),
            kind: kind.to_string(),
            page_index,
            page_count: 10,
            spine_index: 0,
            progress: 0.5,
            quote: if kind == "highlight" {
                "selected text".to_string()
            } else {
                String::new()
            },
            note: String::new(),
            color: "pink".to_string(),
        }
    }

    #[test]
    fn annotations_are_filtered_and_sorted_by_book() {
        let mut store = AnnotationStore::default();
        let later = store
            .add_without_saving(input("bookmark", "book-a", 4))
            .unwrap();
        let earlier = store
            .add_without_saving(input("highlight", "book-a", 1))
            .unwrap();
        store
            .add_without_saving(input("bookmark", "book-b", 0))
            .unwrap();

        let items = store.by_book("book-a");

        assert_eq!(items.len(), 2);
        assert_eq!(items[0].id, earlier.id);
        assert_eq!(items[1].id, later.id);
    }

    #[test]
    fn highlight_requires_text_or_note() {
        let mut store = AnnotationStore::default();
        let mut item = input("highlight", "book-a", 0);
        item.quote = String::new();

        let err = store.add_without_saving(item).unwrap_err();

        assert!(err.contains("Highlight requires"));
    }

    #[test]
    fn bookmark_note_can_be_renamed_without_touching_quote() {
        let mut store = AnnotationStore::default();
        let bookmark = store
            .add_without_saving(input("bookmark", "book-a", 2))
            .unwrap();

        let renamed = store
            .rename_without_saving(&bookmark.id, "Important page")
            .unwrap();

        assert_eq!(renamed.note, "Important page");
        assert_eq!(renamed.quote, "");
        assert_eq!(store.by_book("book-a")[0].note, "Important page");
    }
}
