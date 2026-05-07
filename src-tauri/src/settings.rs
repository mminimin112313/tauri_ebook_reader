use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReadingSettings {
    pub font_family: String,    // "serif" | "sans"
    pub font_size: u32,         // 12-32
    pub line_height: f32,       // 1.2-2.5
    pub theme: String,          // "light" | "sepia" | "charcoal" | "oled"
    pub brightness: u32,        // 0-100
    pub scroll_mode: bool,      // true = scroll, false = paginated
    pub page_animation: String, // "slide" | "curl" | "none"
    pub show_progress_bar: bool,
    pub columns: u32,      // 1 or 2
    pub margin_width: u32, // 1-5 (multiplier)
    pub justify_text: bool,
    pub hyphenation: bool,
}

impl Default for ReadingSettings {
    fn default() -> Self {
        ReadingSettings {
            font_family: "serif".to_string(),
            font_size: 20,
            line_height: 1.6,
            theme: "light".to_string(),
            brightness: 80,
            scroll_mode: true,
            page_animation: "slide".to_string(),
            show_progress_bar: true,
            columns: 1,
            margin_width: 3,
            justify_text: true,
            hyphenation: true,
        }
    }
}

impl ReadingSettings {
    pub fn load() -> Self {
        let path = settings_path();
        if let Ok(content) = std::fs::read_to_string(&path) {
            serde_json::from_str(&content).unwrap_or_default()
        } else {
            ReadingSettings::default()
        }
    }

    pub fn save(&self) {
        let path = settings_path();
        if let Some(parent) = Path::new(&path).parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if let Ok(json) = serde_json::to_string_pretty(self) {
            let _ = std::fs::write(path, json);
        }
    }
}

fn settings_path() -> String {
    dirs::data_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("libris-reader")
        .join("settings.json")
        .to_string_lossy()
        .to_string()
}
