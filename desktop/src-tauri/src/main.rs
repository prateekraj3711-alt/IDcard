// Prevents an extra console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use serde::Serialize;
use std::fs;
use std::path::PathBuf;
use walkdir::WalkDir;

#[derive(Serialize)]
struct FileEntry {
    name: String,
    path: String,
    size: u64,
    modified_ms: u128,
    stem: String,
    extension: String,
}

/// Enumerate files in a folder (non-recursive by default). Optionally filter
/// by extension list, e.g. `["jpg", "jpeg", "png"]`.
#[tauri::command]
fn list_folder(path: String, extensions: Option<Vec<String>>) -> Result<Vec<FileEntry>, String> {
    let root = PathBuf::from(&path);
    if !root.is_dir() {
        return Err(format!("not a directory: {}", path));
    }
    let allow: Option<Vec<String>> = extensions
        .map(|xs| xs.into_iter().map(|s| s.to_ascii_lowercase()).collect());

    let mut out = Vec::new();
    for entry in WalkDir::new(&root).max_depth(1).into_iter().filter_map(|e| e.ok()) {
        let p = entry.path();
        if !p.is_file() {
            continue;
        }
        let ext = p.extension()
            .and_then(|s| s.to_str())
            .map(|s| s.to_ascii_lowercase())
            .unwrap_or_default();
        if let Some(list) = &allow {
            if !list.iter().any(|a| a == &ext) {
                continue;
            }
        }
        let meta = entry.metadata().map_err(|e| e.to_string())?;
        let modified_ms = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis())
            .unwrap_or(0);
        out.push(FileEntry {
            name: p.file_name().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default(),
            path: p.to_string_lossy().into_owned(),
            size: meta.len(),
            modified_ms,
            stem: p.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default(),
            extension: ext,
        });
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(out)
}

/// Read a file as base64. Used when the frontend needs the raw bytes
/// (e.g. to feed a photo into an <img> tag or a canvas).
#[tauri::command]
fn read_bytes_base64(path: String) -> Result<String, String> {
    let bytes = fs::read(&path).map_err(|e| format!("read {}: {}", path, e))?;
    Ok(B64.encode(bytes))
}

/// Write base64-encoded bytes to disk. Used to save generated PDFs / PNGs.
#[tauri::command]
fn write_bytes_base64(path: String, b64: String) -> Result<(), String> {
    let bytes = B64.decode(b64.as_bytes()).map_err(|e| format!("base64 decode: {}", e))?;
    if let Some(parent) = PathBuf::from(&path).parent() {
        fs::create_dir_all(parent).map_err(|e| format!("mkdir {}: {}", parent.display(), e))?;
    }
    fs::write(&path, &bytes).map_err(|e| format!("write {}: {}", path, e))?;
    Ok(())
}

/// Simple health check the frontend can use to confirm it's running inside Tauri.
#[tauri::command]
fn desktop_ping() -> &'static str {
    "stark-id-desktop"
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            list_folder,
            read_bytes_base64,
            write_bytes_base64,
            desktop_ping,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
