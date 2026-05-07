use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BookEntry {
    pub id: String,
    pub path: String,
    #[serde(default)]
    pub source_path: Option<String>,
    pub title: String,
    pub author: String,
    pub cover_base64: Option<String>,
    pub file_type: String,
    pub progress: f32,
    pub spine_index: usize,
    pub date_added: u64,
    pub last_read: Option<u64>,
    pub is_favorite: bool,
    pub description: String,
    #[serde(default)]
    pub format_label: String,
    #[serde(default)]
    pub category: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub reader_kind: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Library {
    pub books: Vec<BookEntry>,
}

impl Library {
    pub fn load() -> Self {
        let path = library_path();
        if let Ok(content) = std::fs::read_to_string(&path) {
            serde_json::from_str(&content).unwrap_or_else(|_| Library { books: Vec::new() })
        } else {
            Library { books: Vec::new() }
        }
    }

    fn save(&self) {
        let path = library_path();
        if let Some(parent) = Path::new(&path).parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if let Ok(json) = serde_json::to_string_pretty(self) {
            let _ = std::fs::write(path, json);
        }
    }

    pub fn add_book(&mut self, mut entry: BookEntry) -> BookEntry {
        if let Some(existing) = self.books.iter_mut().find(|b| b.path == entry.path) {
            existing.title = entry.title.clone();
            existing.author = entry.author.clone();
            existing.source_path = entry.source_path.clone();
            if entry.cover_base64.is_some() {
                existing.cover_base64 = entry.cover_base64.clone();
            }
            let result = existing.clone();
            self.save();
            return result;
        }
        if entry.id.is_empty() {
            entry.id = uuid::Uuid::new_v4().to_string();
        }
        entry.date_added = current_timestamp();
        self.books.push(entry.clone());
        self.save();
        entry
    }

    pub fn update_progress(&mut self, book_id: &str, progress: f32, spine_index: usize) {
        if let Some(book) = self.books.iter_mut().find(|b| b.id == book_id) {
            book.progress = progress;
            book.spine_index = spine_index;
            book.last_read = Some(current_timestamp());
            self.save();
        }
    }

    pub fn toggle_favorite(&mut self, book_id: &str) -> bool {
        let new_state = {
            if let Some(book) = self.books.iter_mut().find(|b| b.id == book_id) {
                book.is_favorite = !book.is_favorite;
                book.is_favorite
            } else {
                return false;
            }
        };
        self.save();
        new_state
    }

    pub fn update_metadata(
        &mut self,
        book_id: &str,
        category: String,
        tags: Vec<String>,
    ) -> Option<BookEntry> {
        let updated = {
            if let Some(book) = self.books.iter_mut().find(|b| b.id == book_id) {
                book.category = category.trim().to_string();
                book.tags = tags
                    .into_iter()
                    .map(|tag| tag.trim().to_string())
                    .filter(|tag| !tag.is_empty())
                    .fold(Vec::new(), |mut acc, tag| {
                        if !acc.contains(&tag) {
                            acc.push(tag);
                        }
                        acc
                    });
                Some(book.clone())
            } else {
                None
            }
        };
        if updated.is_some() {
            self.save();
        }
        updated
    }

    pub fn remove_book(&mut self, book_id: &str) {
        self.books.retain(|b| b.id != book_id);
        self.save();
    }
}

fn library_path() -> String {
    dirs::data_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("libris-reader")
        .join("library.json")
        .to_string_lossy()
        .to_string()
}

pub fn current_timestamp() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}
