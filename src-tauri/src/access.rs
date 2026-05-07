use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct LibraryAccess {
    #[serde(default)]
    pub granted_roots: Vec<String>,
}

impl LibraryAccess {
    pub fn load() -> Self {
        let path = access_path();
        if let Ok(content) = std::fs::read_to_string(&path) {
            serde_json::from_str(&content).unwrap_or_default()
        } else {
            LibraryAccess::default()
        }
    }

    pub fn grant_root(&mut self, root: &Path) -> Result<LibraryAccess, String> {
        if !root.is_dir() {
            return Err("Selected path is not a readable folder.".to_string());
        }
        let root = normalize_path(root);
        let root_string = root.to_string_lossy().to_string();
        if !self
            .granted_roots
            .iter()
            .any(|existing| existing == &root_string)
        {
            self.granted_roots.push(root_string);
            self.granted_roots.sort();
        }
        self.save();
        Ok(self.clone())
    }

    pub fn path_is_granted(&self, path: &Path) -> bool {
        let path = normalize_path(path);
        self.granted_roots
            .iter()
            .map(PathBuf::from)
            .any(|root| path.starts_with(root))
    }

    fn save(&self) {
        let path = access_path();
        if let Some(parent) = Path::new(&path).parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if let Ok(json) = serde_json::to_string_pretty(self) {
            let _ = std::fs::write(path, json);
        }
    }
}

fn normalize_path(path: &Path) -> PathBuf {
    path.canonicalize().unwrap_or_else(|_| path.to_path_buf())
}

fn access_path() -> String {
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("libris-reader")
        .join("access.json")
        .to_string_lossy()
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::LibraryAccess;
    use std::path::Path;

    #[test]
    fn granted_root_covers_nested_book_path() {
        let access = LibraryAccess {
            granted_roots: vec!["/Users/me/Books".to_string()],
        };

        assert!(access.path_is_granted(Path::new("/Users/me/Books/Novel/book.epub")));
        assert!(!access.path_is_granted(Path::new("/Users/me/Downloads/book.epub")));
    }
}
