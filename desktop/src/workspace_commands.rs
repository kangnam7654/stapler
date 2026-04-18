use std::path::PathBuf;
use std::process::Command;
use tauri::command;

fn expand_tilde(p: &str) -> PathBuf {
    if let Some(stripped) = p.strip_prefix("~/") {
        if let Some(home) = dirs::home_dir() {
            return home.join(stripped);
        }
    }
    if p == "~" {
        if let Some(home) = dirs::home_dir() {
            return home;
        }
    }
    PathBuf::from(p)
}

fn ensure_dir(p: &PathBuf) -> Result<(), String> {
    std::fs::create_dir_all(p).map_err(|e| format!("mkdir failed: {e}"))
}

#[command]
pub fn workspace_open_finder(abs_path: String) -> Result<(), String> {
    let path = expand_tilde(&abs_path);
    ensure_dir(&path)?;
    let cmd = if cfg!(target_os = "macos") {
        "open"
    } else if cfg!(target_os = "windows") {
        "explorer"
    } else {
        "xdg-open"
    };
    Command::new(cmd)
        .arg(&path)
        .spawn()
        .map_err(|e| format!("open failed: {e}"))?;
    Ok(())
}

#[command]
pub fn workspace_open_ide(abs_path: String) -> Result<(), String> {
    let path = expand_tilde(&abs_path);
    ensure_dir(&path)?;
    Command::new("code")
        .arg(&path)
        .spawn()
        .map_err(|e| format!("code launcher failed: {e}"))?;
    Ok(())
}
