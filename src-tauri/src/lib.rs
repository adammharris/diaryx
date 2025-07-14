use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct JournalEntry {
    pub id: String,
    pub title: String,
    pub content: String,
    pub created_at: DateTime<Utc>,
    pub modified_at: DateTime<Utc>,
    pub file_path: String,
}

#[derive(Serialize, Deserialize)]
pub struct JournalEntryMetadata {
    pub id: String,
    pub title: String,
    pub created_at: DateTime<Utc>,
    pub modified_at: DateTime<Utc>,
    pub file_path: String,
    pub preview: String,
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
async fn get_journal_entries() -> Result<Vec<JournalEntryMetadata>, String> {
    let home_dir = dirs::home_dir().ok_or("Failed to get home directory")?;
    let entries_dir = home_dir.join("Documents").join("Diaryx").join("entries");

    // Create the directory if it doesn't exist
    if !entries_dir.exists() {
        fs::create_dir_all(&entries_dir)
            .map_err(|e| format!("Failed to create directory: {}", e))?;
    }

    let mut entries = Vec::new();

    if let Ok(dir_entries) = fs::read_dir(&entries_dir) {
        for entry in dir_entries {
            if let Ok(entry) = entry {
                let path = entry.path();
                if path.extension().and_then(|s| s.to_str()) == Some("md") {
                    if let Ok(content) = fs::read_to_string(&path) {
                        let metadata = fs::metadata(&path)
                            .map_err(|e| format!("Failed to read metadata: {}", e))?;
                        let modified_at = metadata
                            .modified()
                            .map_err(|e| format!("Failed to get modified time: {}", e))?
                            .into();

                        let file_name = path
                            .file_stem()
                            .and_then(|s| s.to_str())
                            .unwrap_or("Untitled");

                        // Extract title from content (first line) or use filename
                        let title = content
                            .lines()
                            .next()
                            .map(|line| line.trim_start_matches('#').trim())
                            .filter(|s| !s.is_empty())
                            .unwrap_or(file_name)
                            .to_string();

                        // Create preview (first 150 characters of content, excluding title)
                        let content_without_title =
                            content.lines().skip(1).collect::<Vec<_>>().join("\n");
                        let preview = content_without_title.chars().take(150).collect::<String>()
                            + if content_without_title.len() > 150 {
                                "..."
                            } else {
                                ""
                            };

                        entries.push(JournalEntryMetadata {
                            id: path.file_stem().unwrap().to_string_lossy().to_string(),
                            title,
                            created_at: modified_at, // Using modified as created for simplicity
                            modified_at,
                            file_path: path.to_string_lossy().to_string(),
                            preview,
                        });
                    }
                }
            }
        }
    }

    // Sort by modified date (newest first)
    entries.sort_by(|a, b| b.modified_at.cmp(&a.modified_at));

    Ok(entries)
}

#[tauri::command]
async fn get_journal_entry(id: String) -> Result<JournalEntry, String> {
    let home_dir = dirs::home_dir().ok_or("Failed to get home directory")?;
    let entry_path = home_dir
        .join("Documents")
        .join("Diaryx")
        .join("entries")
        .join(format!("{}.md", id));

    if !entry_path.exists() {
        return Err("Entry not found".to_string());
    }

    let content =
        fs::read_to_string(&entry_path).map_err(|e| format!("Failed to read file: {}", e))?;
    let metadata =
        fs::metadata(&entry_path).map_err(|e| format!("Failed to read metadata: {}", e))?;
    let modified_at = metadata
        .modified()
        .map_err(|e| format!("Failed to get modified time: {}", e))?
        .into();

    let title = content
        .lines()
        .next()
        .map(|line| line.trim_start_matches('#').trim())
        .filter(|s| !s.is_empty())
        .unwrap_or(&id)
        .to_string();

    Ok(JournalEntry {
        id: id.clone(),
        title,
        content,
        created_at: modified_at,
        modified_at,
        file_path: entry_path.to_string_lossy().to_string(),
    })
}

#[tauri::command]
async fn save_journal_entry(id: String, content: String) -> Result<(), String> {
    let home_dir = dirs::home_dir().ok_or("Failed to get home directory")?;
    let entries_dir = home_dir.join("Documents").join("Diaryx").join("entries");

    // Create the directory if it doesn't exist
    if !entries_dir.exists() {
        fs::create_dir_all(&entries_dir)
            .map_err(|e| format!("Failed to create directory: {}", e))?;
    }

    let entry_path = entries_dir.join(format!("{}.md", id));
    fs::write(&entry_path, content).map_err(|e| format!("Failed to write file: {}", e))?;

    Ok(())
}

#[tauri::command]
async fn create_journal_entry(title: String) -> Result<String, String> {
    let home_dir = dirs::home_dir().ok_or("Failed to get home directory")?;
    let entries_dir = home_dir.join("Documents").join("Diaryx").join("entries");

    // Create the directory if it doesn't exist
    if !entries_dir.exists() {
        fs::create_dir_all(&entries_dir)
            .map_err(|e| format!("Failed to create directory: {}", e))?;
    }

    let now = Utc::now();
    let id = now.format("%Y-%m-%d_%H-%M-%S").to_string();
    let entry_path = entries_dir.join(format!("{}.md", id));

    let content = format!("# {}\n\n", title);
    fs::write(&entry_path, content).map_err(|e| format!("Failed to write file: {}", e))?;

    Ok(id)
}

#[tauri::command]
async fn delete_journal_entry(id: String) -> Result<(), String> {
    let home_dir = dirs::home_dir().ok_or("Failed to get home directory")?;
    let entry_path = home_dir
        .join("Documents")
        .join("Diaryx")
        .join("entries")
        .join(format!("{}.md", id));

    if entry_path.exists() {
        fs::remove_file(&entry_path).map_err(|e| format!("Failed to delete file: {}", e))?;
    }

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            get_journal_entries,
            get_journal_entry,
            save_journal_entry,
            create_journal_entry,
            delete_journal_entry
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
